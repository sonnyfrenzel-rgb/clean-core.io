import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { TERMS_VERSION } from '../lib/constants';
import { TERMS_LABEL } from '../lib/legal/documents';
import { TERMS_EFFECTIVE_DATE_ISO } from '../lib/legal/open-values';
import {
  buildTermsChanges,
  currentTermsChanges,
  liveTermsMarkdown,
  normaliseWording,
  parseTermsSections,
  readArchivedText,
  sectionClauses,
  versionInForce,
  wordDiff,
} from '../lib/terms-announcement/changes';
import { CHANGE_REASONS } from '../lib/terms-announcement/reasons';
import { buildTermsAnnouncementMail, changedClausesSentence, clauseLabel, clauseList } from '../lib/terms-announcement/mail';
import { buildCommunityUpdateMail, COMMUNITY_UPDATE_CAMPAIGN } from '../lib/terms-announcement/community-update';
import {
  MAX_PER_RUN,
  MAX_TEST_MAILS,
  NOTICE_FIELD,
  NOTICE_SEND_DAY,
  deadlineRefusal,
  lastNoticeDay,
  logRef,
  noticeIdempotencyKey,
  parseAnnouncementArgs,
  planRecipients,
  sendLogLine,
  sendRefusal,
  sendWindowRefusal,
  testSendPlan,
  testSubject,
} from '../lib/terms-announcement/send-plan';
import { htmlLinkCount, mailPolicyWarnings } from '../scripts/lib/mail-seed';
import { USER_MAIL_FROM, USER_MAIL_REPLY_TO } from '../lib/constants';

/**
 * The notice of an amendment of the Terms (Terms 10.1) — the generator, the
 * mail and the send script's guards. Server-free: the generator reads the
 * archived file and the live sources, the script is run only with
 * `--sample-only` and with arguments it refuses before it opens a database.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const changes = currentTermsChanges();
const PREVIEW_DAY = TERMS_EFFECTIVE_DATE_ISO ?? '2026-12-22';

test.describe('the generator: every changed clause, from the texts as they are', () => {
  test('it compares the version in force (archived, digest checked) with the live source of the announced one', () => {
    const inForce = versionInForce();
    expect(inForce.version).not.toBe(TERMS_VERSION);
    expect(changes.from.version).toBe(inForce.version);
    expect(changes.to).toEqual({ version: TERMS_VERSION, label: TERMS_LABEL });
    // Every new wording in the list is the wording the page renders today.
    for (const lang of ['en', 'de'] as const) {
      const live = normaliseWording(liveTermsMarkdown(lang));
      for (const c of changes.changes) for (const p of c.newParas[lang]) expect(live, `${c.id}/${lang}`).toContain(normaliseWording(p));
    }
  });

  test('an edited archived text stops the generator', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'terms-notice-'));
    const entry = versionInForce();
    fs.mkdirSync(path.join(tmp, path.dirname(entry.file)), { recursive: true });
    fs.writeFileSync(path.join(tmp, entry.file), read(entry.file).replace('Severability', 'Severability.'));
    expect(() => readArchivedText(entry, tmp)).toThrow(/does not match its archived digest/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('no changed wording is left out: what the list does not name is word for word in the old text', () => {
    const old = readArchivedText(versionInForce());
    const oldNorm = normaliseWording(old);
    const listed = new Set(changes.changes.map((c) => c.id));
    for (const s of parseTermsSections(liveTermsMarkdown('en'))) {
      for (const c of sectionClauses(s)) {
        if (listed.has(c.id) || listed.has(s.key)) continue;
        for (const p of c.paras) expect(oldNorm, `clause ${c.id} changed but is not in the list`).toContain(normaliseWording(p));
      }
      if (!listed.has(`${s.key}:heading`) && s.key !== 'preamble') expect(oldNorm).toContain(normaliseWording(s.title));
    }
    // And nothing of the old text disappears unlisted.
    const newNorm = normaliseWording(liveTermsMarkdown('en'));
    for (const s of parseTermsSections(old)) {
      for (const c of sectionClauses(s)) {
        if (listed.has(c.id) || listed.has(s.key)) continue;
        for (const p of c.paras) expect(newNorm, `old clause ${c.id} is gone but not listed`).toContain(normaliseWording(p));
      }
    }
  });

  test('German and English agree: the same clauses, and every change has its German wording', () => {
    expect(changes.clauseIds.de).toEqual(changes.clauseIds.en);
    expect(changes.clauseIds.en.length).toBeGreaterThan(20);
    for (const c of changes.changes) {
      if (c.kind === 'removed') continue;
      expect(c.newParas.de.length, `${c.id} has no German wording`).toBeGreaterThan(0);
      expect(c.newParas.en.length, `${c.id} has no English wording`).toBeGreaterThan(0);
      if (c.section !== 'preamble') expect(c.heading.de, c.id).not.toBe('');
    }
  });

  test('every changed clause has a reason from 10.4, and no reason is left for a clause that did not change', () => {
    expect(changes.missingReasons, 'write a reason in lib/terms-announcement/reasons.ts').toEqual([]);
    expect(changes.staleReasons, 'a reason for a clause that no longer changes').toEqual([]);
    for (const [id, r] of Object.entries(CHANGE_REASONS)) {
      expect(r.letters.length, id).toBeGreaterThan(0);
      for (const l of r.letters) expect(['a', 'b', 'c', 'd', 'e']).toContain(l);
      expect(r.de.length, id).toBeGreaterThan(20);
      expect(r.en.length, id).toBeGreaterThan(20);
    }
  });

  test('it follows an edit: a changed sentence is listed and marked, an unchanged clause is not', () => {
    const oldEn = readArchivedText(versionInForce());
    const newEn = liveTermsMarkdown('en');
    const newDe = liveTermsMarkdown('de');
    const sentence = 'An inserted sentence nobody has written yet.';
    const edited = newEn.replace('## 12. Severability\n\n', `## 12. Severability\n\n${sentence} `);
    expect(edited).not.toBe(newEn);
    const r = buildTermsChanges({ oldEn, newEn: edited, newDe, reasons: {} });
    const twelve = r.changes.find((c) => c.id === '12')!;
    expect(twelve.diff.new[0].filter((t) => t.mark).map((t) => t.text).join(' ')).toContain(sentence);
    expect(r.missingReasons).toContain('12');
    // The old text against itself: nothing changes.
    expect(buildTermsChanges({ oldEn, newEn: oldEn, newDe: oldEn, reasons: {} }).changes).toEqual([]);
  });

  test('the word diff marks exactly what was removed and what was added', () => {
    // Typographic quotes are not a change; added words are.
    const d = wordDiff(['The “operator” may terminate'], ['The "operator" may terminate the contract.']);
    expect(d.old[0].filter((t) => t.mark)).toEqual([]);
    expect(d.new[0].filter((t) => t.mark).map((t) => t.text)).toEqual(['the', 'contract.']);
    const e = wordDiff(['a b c'], ['a c']);
    expect(e.old[0].filter((t) => t.mark).map((t) => t.text)).toEqual(['b']);
  });
});

test.describe('the mail: a short body that is the notice, the full changed text as its attachment', () => {
  const mail = buildTermsAnnouncementMail({ changes, effectiveDateIso: PREVIEW_DAY, baseUrl: 'https://clean-core.io' });
  const en = mail.text.indexOf('ENGLISH VERSION');
  const dePart = mail.text.slice(0, en);
  const enPart = mail.text.slice(en);
  const [txt] = mail.attachments;

  test('the effective day, in both languages, in the subject and the body', () => {
    if (PREVIEW_DAY === '2026-12-22') {
      expect(mail.subject).toBe('Änderung der Nutzungsbedingungen zum 22. Dezember 2026 / Changes to the Terms of Service on 22 December 2026');
      expect(dePart).toContain('Wirksam ab: 22. Dezember 2026.');
      expect(enPart).toContain('Effective from: 22 December 2026.');
    }
    expect(mail.subject).not.toMatch(/!/);
  });

  test('German first, then English; each says it is the notice under 10.1 and gives the choice under 10.2 and 10.3', () => {
    expect(en).toBeGreaterThan(0);
    expect(mail.text.startsWith('Liebe Clean-Core.io Community,')).toBe(true);
    expect(enPart).toContain('Dear Clean-Core.io community,');
    expect(dePart).toContain('MITTEILUNG NACH ZIFFER 10.1');
    expect(enPart).toContain('NOTICE UNDER SECTION 10.1');
    expect(dePart).toContain('Schweigen und Weiternutzung gelten nicht als Annahme');
    expect(dePart).toContain('(Ziffer 10.2)');
    expect(dePart).toContain('(Ziffer 10.3)');
    expect(enPart).toContain('Silence and continued use are not acceptance');
    expect(enPart).toContain('(section 10.3)');
    expect(mail.paths).toEqual({ de: `/terms/versions/${TERMS_VERSION}/de`, en: `/terms/versions/${TERMS_VERSION}/en` });
    expect(mail.text).toContain(`clean-core.io/terms/versions/${TERMS_VERSION}/de`);
  });

  test('no "what you get" block: what is planned goes to a separate community mail (legal statement 17e, M1)', () => {
    expect(mail.text).not.toMatch(/Was Sie bekommen|What you get|Version 3\.5/);
    expect(mail.html).not.toMatch(/Was Sie bekommen|What you get|Version 3\.5/);
  });

  test('the body names every changed clause in one generated sentence (M3), the lawyer\'s version as the check', () => {
    expect(changedClausesSentence(changes.changes, 'de')).toBe(
      'Geändert sind: Einleitung, Impressum, Ziffer 1 (mit Überschrift), 2.1 bis 2.5, 3, Überschrift von 4, 4.1 bis 4.3, 5, 6, 7, 8, 9, 10.1 bis 10.5, 11, 12, 13 (mit Überschrift) und Kontakt.',
    );
    expect(changedClausesSentence(changes.changes, 'en')).toBe(
      'Changed are: the introduction, the imprint, section 1 (with heading), 2.1 to 2.5, 3, the heading of 4, 4.1 to 4.3, 5, 6, 7, 8, 9, 10.1 to 10.5, 11, 12, 13 (with heading) and Contact.',
    );
    // Before the sentence on the attachment, in both parts.
    expect(dePart.indexOf('Geändert sind:')).toBeLessThan(dePart.indexOf('finden Sie im Anhang'));
    expect(enPart.indexOf('Changed are:')).toBeLessThan(enPart.indexOf('in the attachment'));
    // A two-clause run is listed, not a range.
    const two = changes.changes.filter((c) => ['10.1', '10.2'].includes(c.id));
    expect(changedClausesSentence(two, 'de')).toBe('Geändert sind: Ziffer 10.1 und 10.2.');
  });

  test('the withdrawal point is the wording of the legal statement (M2)', () => {
    expect(dePart).toContain(
      'Kein gesetzliches Widerrufsrecht: Die Nutzung ist unentgeltlich, und wir verarbeiten Ihre Daten nur, um die Plattform bereitzustellen. Sie können den Vertrag weiterhin jederzeit ohne Frist beenden; dafür gibt es die Funktion „Vertrag widerrufen / beenden“ in den Einstellungen (13, 2.3).',
    );
    expect(enPart).toContain(
      'No statutory right of withdrawal: the use is free of charge, and we process your data only to provide the Platform. You can still end the contract at any time without notice; the function “Withdraw from / end the contract” in Settings does this (13, 2.3).',
    );
    // The English part names the English wording too.
    expect(enPart).toContain(`clean-core.io/terms/versions/${TERMS_VERSION}/en (English)`);
  });

  test('the attachment lists every changed clause with its reason letters, the editorial ones grouped; the body says it is part of the notice', () => {
    for (const lang of ['de', 'en'] as const) {
      const lines = clauseList(changes.changes, lang).join('\n');
      for (const line of clauseList(changes.changes, lang)) {
        expect(txt.content, `${lang}: ${line}`).toContain(line);
        expect(mail.text, 'the clause list moved to the attachment').not.toContain(line);
      }
      for (const c of changes.changes) {
        const name = c.id.endsWith(':heading') ? (lang === 'de' ? `Überschrift ${c.section}` : `heading ${c.section}`) : /^\d/.test(c.id) ? c.id : clauseLabel(c, lang);
        expect(lines, `${c.id}/${lang}`).toContain(name);
      }
    }
    expect(dePart).toContain('Alle geänderten Bestimmungen, ihre Gründe nach Ziffer 10.4 und den markierten Wortlaut finden Sie im Anhang; er ist Teil dieser Mitteilung.');
    expect(enPart).toContain('You find all changed provisions, their reasons under section 10.4 and the marked wording in the attachment; it is part of this notice.');
  });

  test('the attachment holds every changed clause in full, both languages, with the reasons and the marked changes', () => {
    // One attachment, the text file; the HTML twin added nothing and is gone (legal review 06.11.2026).
    expect(mail.attachments).toHaveLength(1);
    expect(txt.filename).toBe(`aenderungen-nutzungsbedingungen-${TERMS_LABEL}.txt`);
    expect(txt.contentType).toBe('text/plain; charset=utf-8');
    expect(mail.text).toContain(`als Textdatei ${txt.filename}`);
    const t = txt.content;
    const enAt = t.indexOf('ENGLISH VERSION: THE CHANGED PROVISIONS');
    expect(enAt).toBeGreaterThan(0);
    for (const c of changes.changes) {
      for (const p of c.newParas.de) expect(t.slice(0, enAt), `${c.id} German wording`).toContain(p);
      expect(t).toContain(c.reason!.de);
      expect(t).toContain(c.reason!.en);
    }
    expect(t.slice(enAt)).toMatch(/\{\+[^+]+\+\}/);
    expect(t.slice(enAt)).toMatch(/\[-[^\]]+-\]/);
    expect(txt.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('no dash in anything the mail says in its own words; only the quoted Terms keep theirs', () => {
    for (const [name, s] of [['subject', mail.subject], ['body html', mail.html], ['body text', mail.text], ['attachment', mail.attachmentOwnText]] as const) {
      expect(s.match(/[—–]/g), `${name} carries a dash`).toBeNull();
    }
  });

  test('short: the body is well under 30 kB, the same for everybody, one link, the mail policy of every user mail', () => {
    expect(Buffer.byteLength(mail.html)).toBeLessThan(30_000);
    expect(Buffer.byteLength(mail.text)).toBeLessThan(30_000);
    expect(mail.html).not.toMatch(/@(?!clean-core\.io)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(htmlLinkCount(mail.html)).toBe(1);
    const warnings = mailPolicyWarnings(
      { type: 'terms-announcement', audience: 'nutzer' },
      { from: USER_MAIL_FROM, replyTo: USER_MAIL_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text },
    );
    expect(warnings).toEqual([]);
  });
});

test.describe('the community mail on what is planned (M1): opt-in only, with a way out', () => {
  const m = buildCommunityUpdateMail({ plannedDayIso: PREVIEW_DAY, consentedOnIso: '2026-10-01', unsubscribeUrl: 'https://clean-core.io/unsubscribe#t=x', baseUrl: 'https://clean-core.io' });
  test('it says planned, names the four points, and carries the unsubscribe link', () => {
    for (const s of ['Version 3.5, geplant zum', 'Ihr eigener Claude-Schlüssel (Anthropic) neben Gemini, geplant', 'eine deutlich einfachere Oberfläche', 'klarere Startseite, geplant', 'Version 3.5, planned for', 'A tidier, clearer start page, planned']) {
      expect(m.text).toContain(s);
    }
    expect(m.text).toContain('Abmelden / Unsubscribe: https://clean-core.io/unsubscribe#t=x');
    expect(m.html).toContain('https://clean-core.io/unsubscribe#t=x');
    expect(m.text).toContain('am 1. Oktober 2026 in Ihren Kontoeinstellungen');
    expect(m.subject).not.toMatch(/[!—–]/);
    expect(COMMUNITY_UPDATE_CAMPAIGN).toMatch(/^community-update-/);
  });
  test('the sender asks the community-mail gate, the suppression list included, and never prints an address', () => {
    const src = read('scripts/send-community-update.ts');
    expect(src).toContain('communityMailBlock(u, suppressed)');
    expect(src).toContain("db.collection('email_suppressions')");
    expect(src).toContain('keyedIds.has(accountHashOf(email))');
    expect(src).toContain("if (refusal === 'dry run')");
    expect(src).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
    for (const l of src.split('\n').filter((x) => /console\.(log|error)\(/.test(x))) expect(l).not.toMatch(/\.email\b|\bto\b:/);
  });
});

test.describe('the send script: dry run by default, a send only with the confirmed count', () => {
  test('arguments: dry run unless --send; --dry-run wins; the per-run cap holds', () => {
    expect(parseAnnouncementArgs([])).toMatchObject({ dryRun: true, confirm: null, limit: MAX_PER_RUN });
    expect(parseAnnouncementArgs(['--send', '--confirm=12'])).toMatchObject({ dryRun: false, confirm: 12 });
    expect(parseAnnouncementArgs(['--send', '--dry-run']).dryRun).toBe(true);
    expect(parseAnnouncementArgs(['--send', '--sample-only']).dryRun).toBe(true);
    expect(parseAnnouncementArgs(['--limit=10']).limit).toBe(10);
    expect(MAX_PER_RUN).toBeLessThanOrEqual(40);
    expect(() => parseAnnouncementArgs([`--limit=${MAX_PER_RUN + 1}`])).toThrow(/may not exceed/);
    expect(() => parseAnnouncementArgs(['--confirm=all'])).toThrow(/whole number/);
    expect(() => parseAnnouncementArgs(['--yes'])).toThrow(/unknown argument/);
  });

  test('the confirm guard: no send without --confirm, and only with the count the dry run printed', () => {
    expect(sendRefusal(parseAnnouncementArgs([]), 30)).toBe('dry run');
    expect(sendRefusal(parseAnnouncementArgs(['--send']), 30)).toMatch(/needs --confirm/);
    expect(sendRefusal(parseAnnouncementArgs(['--send', '--confirm=29']), 30)).toMatch(/does not match the 30/);
    expect(sendRefusal(parseAnnouncementArgs(['--send', '--confirm=30']), 30)).toBeNull();
  });

  test('the send day: a real send does not start after 14:00 Berlin on 09.11 without --late-ok', () => {
    expect(NOTICE_SEND_DAY).toBe('2026-11-09');
    expect(sendWindowRefusal(new Date('2026-11-09T12:59:00Z'), false)).toBeNull(); // 13:59 in Berlin
    expect(sendWindowRefusal(new Date('2026-11-09T13:00:00Z'), false)).toMatch(/past 14:00 on 2026-11-09/); // 14:00
    expect(sendWindowRefusal(new Date('2026-11-10T08:00:00Z'), false)).toMatch(/--late-ok/);
    expect(sendWindowRefusal(new Date('2026-11-10T08:00:00Z'), true)).toBeNull();
    expect(parseAnnouncementArgs(['--late-ok']).lateOk).toBe(true);
    const src = read('scripts/send-terms-announcement.ts');
    expect(src).toContain('sendWindowRefusal(new Date(), args.lateOk)');
    expect(src).toContain('sendWindowReminder()');
  });

  test('the send log: per account the time sent and the message id, no address', () => {
    const line = JSON.parse(sendLogLine({ uid: 'uid-1', sentAt: new Date('2026-11-09T09:00:00Z'), messageId: 'msg-1', version: TERMS_VERSION, mailSha256: 'a'.repeat(64) }));
    expect(line).toEqual({ account: logRef('uid-1'), uid: 'uid-1', version: TERMS_VERSION, sentAt: '2026-11-09T09:00:00.000Z', messageId: 'msg-1', mailSha256: 'a'.repeat(64) });
    const src = read('scripts/send-terms-announcement.ts');
    expect(src).toContain("fs.appendFileSync(sendLog, sendLogLine(");
  });

  test('the test send: dry run by default, the confirm guard, the cap, [TEST], the attachment, and no proof', () => {
    const seeds = [{ label: 'gmail', address: 'a@example.com' }, { label: 'gmx', address: 'b@example.com' }];
    const dry = testSendPlan(seeds, parseAnnouncementArgs(['--test-to', 'x.txt']), []);
    expect(dry.refusal).toBe('dry run');
    expect(dry.mails.map((m) => `${m.recipient.label}/${m.kind}`)).toEqual(['gmail/notice', 'gmail/community-update', 'gmx/notice', 'gmx/community-update']);
    expect(testSendPlan(seeds, parseAnnouncementArgs(['--test-to=x.txt', '--send']), []).refusal).toMatch(/needs --confirm/);
    expect(testSendPlan(seeds, parseAnnouncementArgs(['--test-to=x.txt', '--send', '--confirm=3']), []).refusal).toMatch(/does not match the 4/);
    expect(testSendPlan(seeds, parseAnnouncementArgs(['--test-to=x.txt', '--send', '--confirm=4']), []).refusal).toBeNull();
    // Open values stop it unless --allow-placeholders.
    expect(testSendPlan(seeds, parseAnnouncementArgs(['--test-to=x.txt', '--send', '--confirm=4']), ['[offen: x]']).refusal).toMatch(/allow-placeholders/);
    expect(testSendPlan(seeds, parseAnnouncementArgs(['--test-to=x.txt', '--send', '--confirm=4', '--allow-placeholders']), ['[offen: x]']).refusal).toBeNull();
    // At most ten mails.
    const many = Array.from({ length: MAX_TEST_MAILS / 2 + 1 }, (_, i) => ({ label: `s${i}`, address: `s${i}@example.com` }));
    expect(MAX_TEST_MAILS).toBe(10);
    expect(testSendPlan(many, parseAnnouncementArgs(['--test-to=x.txt', '--send', '--confirm=12']), []).refusal).toMatch(/at most 10/);
    expect(testSubject('Änderung')).toBe('[TEST] Änderung');
    expect(() => parseAnnouncementArgs(['--test-to'])).toThrow(/recipient file/);
    // What the script sends in test mode: both subjects prefixed, the attachment on the notice, and no record.
    const src = read('scripts/send-terms-announcement.ts');
    const body = src.slice(src.indexOf('async function testSend('));
    expect(body).toContain('subject: testSubject(mail.subject)');
    expect(body).toContain('subject: testSubject(community.subject)');
    expect(body).toContain('attachments: mail.attachments.map(');
    expect(body).not.toMatch(/getAdminDb|runTransaction|sendTransactionalMail|\.update\(|appendFileSync|deadlineRefusal|sendWindowRefusal/);
    for (const l of body.split('\n').filter((x) => /console\.(log|error)\(/.test(x))) expect(l).not.toMatch(/\.address\b/);
  });

  test('six weeks: the last day to send for 22 December 2026 is 10 November 2026 (Berlin)', () => {
    expect(lastNoticeDay('2026-12-22')).toBe('2026-11-10');
    expect(deadlineRefusal('2026-12-22', new Date('2026-11-10T22:30:00Z'))).toBeNull(); // 23:30 in Berlin
    expect(deadlineRefusal('2026-12-22', new Date('2026-11-10T23:30:00Z'))).toMatch(/too late/); // 00:30 on the 11th
    expect(deadlineRefusal(null, new Date())).toMatch(/not set/);
  });

  test('recipients: every account with a contract, whatever its mail setting; suspended included; never CI, deleted, without a contract, or twice', () => {
    const v = TERMS_VERSION;
    const rows = [
      { uid: 'a', data: { email: 'Ada@Example.com', status: 'approved', termsVersionAccepted: '2026-10-03' } },
      { uid: 'b', data: { email: 'bob@example.com', status: 'approved', communityMail: { optIn: false } } },
      { uid: 'c', data: { email: 'ci@cleancore-test.io', status: 'approved' } },
      { uid: 'd', data: { email: 'd@example.com', status: 'deleted' } },
      { uid: 'e', data: { email: 'e@example.com', status: 'approved', disabled: true } },
      { uid: 'f', data: { email: 'f@example.com', status: 'suspended' } },
      { uid: 'g', data: { email: 'g@example.com', status: 'pending' } },
      { uid: 'n', data: { email: 'n@example.com', status: 'pending', transformationsLimit: 0 } },
      { uid: 'h', data: { email: 'h@example.com', status: 'approved', termsVersionAccepted: v } },
      { uid: 'i', data: { email: 'i@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'sent' } } } },
      { uid: 'j', data: { email: 'j@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'sending' } } } },
      { uid: 'k', data: { email: 'k@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'failed' } } } },
      { uid: 'l', data: { email: 'ada@example.com', status: 'approved' } },
      { uid: 'm', data: { status: 'approved' } },
    ];
    const plan = planRecipients(rows, v);
    expect(plan.recipients.map((r) => r.uid).sort()).toEqual(['a', 'b', 'e', 'f', 'k', 'n']);
    expect(plan.skipped).toEqual({
      noEmail: 1,
      testAccount: 1,
      deleted: 1,
      notActive: 1,
      alreadyAccepted: 1,
      alreadyNotified: 2,
      unresolved: 1,
    });
    expect(plan.suspendedIncluded).toBe(3);
    expect(plan.byAcceptedVersion).toEqual({ '2026-10-03': 1, none: 5 });
  });

  test('a log names an account by a hash, never by its address; the idempotency key holds no address', () => {
    expect(logRef('uid-1')).toMatch(/^acct_[0-9a-f]{10}$/);
    expect(noticeIdempotencyKey(TERMS_VERSION, 'uid-1')).toBe(`terms-notice/${TERMS_VERSION}/${logRef('uid-1')}`);
    const src = read('scripts/send-terms-announcement.ts');
    const printing = src.split('\n').filter((l) => /console\.(log|error)\(/.test(l));
    for (const l of printing) expect(l, 'a log line names an address').not.toMatch(/\.email\b|\bto\b:/);
    // The send happens only after the refusals: dry run returns first, a refusal exits.
    const send = src.indexOf('sendTransactionalMail({');
    expect(src.indexOf("if (refusal === 'dry run')")).toBeGreaterThan(-1);
    expect(src.indexOf("if (refusal === 'dry run')")).toBeLessThan(send);
    expect(src.indexOf('process.exit(1);')).toBeLessThan(send);
    // Claimed in a transaction before the provider is asked, recorded after.
    expect(src.indexOf('db.runTransaction(')).toBeLessThan(send);
    expect(src.slice(send)).toContain("field('state'), 'sent'");
  });

  const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const run = (args: string[]) =>
    spawnSync(process.execPath, [TSX, path.join(ROOT, 'scripts', 'send-terms-announcement.ts'), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      // No key and no database: a run that tried to read or send would fail loudly.
      env: { ...process.env, RESEND_API_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: path.join(os.tmpdir(), 'no-such-credentials.json'), FIRESTORE_EMULATOR_HOST: '' },
      timeout: 120_000,
    });

  test('--sample-only renders the notice from the texts and touches no database', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'terms-notice-out-'));
    const r = run(['--sample-only', `--out=${out}`]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`terms     : ${changes.from.label}`);
    expect(r.stdout).not.toContain('database  :');
    const summary = JSON.parse(fs.readFileSync(path.join(out, 'notice.json'), 'utf8'));
    expect(summary.changes.map((c: { id: string }) => c.id)).toEqual(changes.changes.map((c) => c.id));
    if (TERMS_EFFECTIVE_DATE_ISO) {
      expect(fs.readFileSync(path.join(out, 'notice.txt'), 'utf8')).toContain('ENGLISH VERSION');
      expect(summary.mail.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    fs.rmSync(out, { recursive: true, force: true });
  });

  test('--test-to: the dry run names labels and counts, never an address, and reads no database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terms-notice-test-'));
    const file = path.join(dir, 'seeds.txt');
    fs.writeFileSync(file, '# seeds\ngmail seed-one@example.com\nwebde seed-two@example.com\n');
    const r = run(['--test-to', file]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('TEST SEND : 2 recipient(s) (gmail, webde), 4 mail(s)');
    expect(r.stdout).toContain('DRY RUN');
    expect(r.stdout + r.stderr).not.toContain('@example.com');
    expect(r.stdout).not.toContain('database  :');
    const noConfirm = run(['--test-to', file, '--send', '--allow-placeholders']);
    expect(noConfirm.status).toBe(1);
    expect(noConfirm.stderr).toContain('needs --confirm');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a send over the cap or with an unknown flag is refused before anything is read', () => {
    const over = run(['--send', `--limit=${MAX_PER_RUN + 1}`, '--confirm=1']);
    expect(over.status).toBe(2);
    expect(over.stderr).toContain('may not exceed');
    const unknown = run(['--send', '--force']);
    expect(unknown.status).toBe(2);
    expect(unknown.stdout).not.toContain('database  :');
  });
});
