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
import { buildTermsAnnouncementMail, clauseLabel, versionPath } from '../lib/terms-announcement/mail';
import {
  MAX_PER_RUN,
  NOTICE_FIELD,
  deadlineRefusal,
  lastNoticeDay,
  logRef,
  noticeIdempotencyKey,
  parseAnnouncementArgs,
  planRecipients,
  sendRefusal,
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
const PREVIEW_DAY = TERMS_EFFECTIVE_DATE_ISO ?? '2026-12-21';

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

test.describe('the mail: German first, the changed text in full, the choice under 10.2 and 10.3', () => {
  const mail = buildTermsAnnouncementMail({ changes, effectiveDateIso: PREVIEW_DAY, baseUrl: 'https://clean-core.io' });

  test('the effective day, in both languages, in the subject and the text', () => {
    const [y, m, d] = PREVIEW_DAY.split('-');
    void y;
    const de = `${Number(d)}. `;
    expect(mail.subject).toContain(de);
    if (PREVIEW_DAY === '2026-12-21') {
      expect(mail.subject).toBe('Änderung der Nutzungsbedingungen zum 21. Dezember 2026 / Changes to the Terms of Service on 21 December 2026');
      expect(mail.text).toContain('21. Dezember 2026');
      expect(mail.text).toContain('21 December 2026');
    }
    expect(Number(m)).toBeGreaterThan(0);
    expect(mail.subject).not.toMatch(/!/);
  });

  test('German comes first, then English; both name 10.2 (accept, effective on the day) and 10.3 (keep the old version)', () => {
    const en = mail.text.indexOf('ENGLISH VERSION');
    expect(en).toBeGreaterThan(mail.text.indexOf('DIE GEÄNDERTEN BESTIMMUNGEN'));
    const de = mail.text.slice(0, en);
    const enPart = mail.text.slice(en);
    expect(de).toContain('Schweigen und Weiternutzung gelten nicht als Annahme (Ziffer 10.2)');
    expect(de).toContain('Ziffer 10.3');
    expect(enPart).toContain('Silence and continued use are not acceptance (section 10.2)');
    expect(enPart).toContain('section 10.3');
    expect(mail.paths).toEqual({ de: versionPath(TERMS_LABEL, 'de'), en: versionPath(TERMS_LABEL, 'en') });
    expect(mail.text).toContain(`clean-core.io/terms/${TERMS_LABEL}/de`);
    expect(mail.text).toContain(`clean-core.io/terms/${TERMS_LABEL} (`);
  });

  test('every changed clause is in both parts with its full new wording and its reason; the English part marks the changes', () => {
    const en = mail.text.indexOf('ENGLISH VERSION');
    const de = mail.text.slice(0, en);
    const enPart = mail.text.slice(en);
    for (const c of changes.changes) {
      expect(de, c.id).toContain(clauseLabel(c, 'de'));
      expect(enPart, c.id).toContain(clauseLabel(c, 'en'));
      expect(de).toContain(c.reason!.de);
      expect(enPart).toContain(c.reason!.en);
      for (const p of c.newParas.de) expect(de, `${c.id} German wording`).toContain(p);
    }
    expect(enPart).toMatch(/\{\+[^+]+\+\}/);
    expect(enPart).toMatch(/\[-[^\]]+-\]/);
    expect(mail.html).toContain('<ins>');
    expect(mail.html).toContain('<del>');
  });

  test('the product block is apart from the notice and says "planned"', () => {
    expect(mail.text).toContain('Zur Information, nicht Teil der Mitteilung');
    expect(mail.text).toContain('For information, not part of the notice');
    expect(mail.text).toMatch(/Geplant ab dem [^:]+: ein eigener Claude-Schlüssel/);
    expect(mail.text).toMatch(/Planned for the coming weeks: a new, simpler Analyze/);
  });

  test('one mail for everybody: no address, no name, one link, the mail policy of every user mail', () => {
    expect(mail.html).not.toMatch(/@(?!clean-core\.io)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(htmlLinkCount(mail.html)).toBe(1);
    const warnings = mailPolicyWarnings(
      { type: 'terms-announcement', audience: 'nutzer' },
      { from: USER_MAIL_FROM, replyTo: USER_MAIL_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text },
    );
    expect(warnings).toEqual([]);
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

  test('six weeks: the last day to send for 21 December 2026 is 9 November 2026 (Berlin)', () => {
    expect(lastNoticeDay('2026-12-21')).toBe('2026-11-09');
    expect(deadlineRefusal('2026-12-21', new Date('2026-11-09T22:30:00Z'))).toBeNull(); // 23:30 in Berlin
    expect(deadlineRefusal('2026-12-21', new Date('2026-11-09T23:30:00Z'))).toMatch(/too late/); // 00:30 on the 10th
    expect(deadlineRefusal(null, new Date())).toMatch(/not set/);
  });

  test('recipients: every account with a contract, whatever its mail setting; never CI, deleted, suspended, pending, or twice', () => {
    const v = TERMS_VERSION;
    const rows = [
      { uid: 'a', data: { email: 'Ada@Example.com', status: 'approved', termsVersionAccepted: '2026-10-03' } },
      { uid: 'b', data: { email: 'bob@example.com', status: 'approved', communityMail: { optIn: false } } },
      { uid: 'c', data: { email: 'ci@cleancore-test.io', status: 'approved' } },
      { uid: 'd', data: { email: 'd@example.com', status: 'deleted' } },
      { uid: 'e', data: { email: 'e@example.com', status: 'approved', disabled: true } },
      { uid: 'f', data: { email: 'f@example.com', status: 'suspended' } },
      { uid: 'g', data: { email: 'g@example.com', status: 'pending' } },
      { uid: 'h', data: { email: 'h@example.com', status: 'approved', termsVersionAccepted: v } },
      { uid: 'i', data: { email: 'i@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'sent' } } } },
      { uid: 'j', data: { email: 'j@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'sending' } } } },
      { uid: 'k', data: { email: 'k@example.com', status: 'approved', [NOTICE_FIELD]: { [v]: { state: 'failed' } } } },
      { uid: 'l', data: { email: 'ada@example.com', status: 'approved' } },
      { uid: 'm', data: { status: 'approved' } },
    ];
    const plan = planRecipients(rows, v);
    expect(plan.recipients.map((r) => r.uid).sort()).toEqual(['a', 'b', 'k']);
    expect(plan.skipped).toEqual({
      noEmail: 1,
      testAccount: 1,
      deleted: 2,
      suspended: 1,
      notActive: 1,
      alreadyAccepted: 1,
      alreadyNotified: 2,
      unresolved: 1,
    });
    expect(plan.byAcceptedVersion).toEqual({ '2026-10-03': 1, none: 2 });
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

  test('a send over the cap or with an unknown flag is refused before anything is read', () => {
    const over = run(['--send', `--limit=${MAX_PER_RUN + 1}`, '--confirm=1']);
    expect(over.status).toBe(2);
    expect(over.stderr).toContain('may not exceed');
    const unknown = run(['--send', '--force']);
    expect(unknown.status).toBe(2);
    expect(unknown.stdout).not.toContain('database  :');
  });
});
