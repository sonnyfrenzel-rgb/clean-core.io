import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TERMS_VERSION } from '../lib/constants';
import { TERMS_EFFECTIVE_DATE_ISO } from '../lib/legal/open-values';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { currentNotice, NOTICE_FILE_PATH, NOTICE_SUMMARY_PATH } from '../lib/terms-announcement/notice-file';
import { currentTermsChanges } from '../lib/terms-announcement/changes';
import { buildTermsAnnouncementMail, clauseList, NOTICE_BASE_URL } from '../lib/terms-announcement/mail';

/**
 * Dialog = notice (final review of the notice, 06.11.2026). The in-app dialog
 * of an amendment (`components/TermsReacceptGate.tsx`, C2) carries what the
 * notice under Terms 10.1 carries: the changed provisions with their reasons
 * under 10.4, the effective day, the attachment itself, and that nobody has to
 * accept. Server-free: the rendered half is in tests/terms-reaccept-gate.spec.ts.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the dialog\'s notice is the mail\'s attachment, from the same builder, byte for byte', () => {
  const notice = currentNotice(ROOT);
  expect(notice).not.toBeNull();
  const mail = buildTermsAnnouncementMail({ changes: currentTermsChanges(ROOT), effectiveDateIso: TERMS_EFFECTIVE_DATE_ISO!, baseUrl: NOTICE_BASE_URL });
  expect(notice!.attachment).toEqual(mail.attachments[0]);
  expect(notice!.attachment.filename).toBe('aenderungen-nutzungsbedingungen-v2.3.0.txt');
  expect(notice!.summary.version).toBe(TERMS_VERSION);
  expect(notice!.summary.effectiveDateIso).toBe(TERMS_EFFECTIVE_DATE_ISO);
  expect(notice!.summary.file).toEqual({ filename: mail.attachments[0].filename, sha256: mail.attachments[0].sha256, href: NOTICE_FILE_PATH });
  // The list the attachment opens with, in both languages.
  for (const lang of ['de', 'en'] as const) {
    expect(notice!.summary.clauses[lang]).toEqual(clauseList(notice!.changes.changes, lang));
    for (const line of notice!.summary.clauses[lang]) expect(notice!.attachment.content).toContain(line);
  }
});

test('the two addresses are prerendered routes that use the builder and write no text of their own', () => {
  expect(NOTICE_FILE_PATH).toBe('/terms/notice');
  expect(NOTICE_SUMMARY_PATH).toBe('/terms/notice/changes');
  for (const rel of ['app/terms/notice/route.ts', 'app/terms/notice/changes/route.ts']) {
    const src = read(rel);
    expect(src, rel).toContain("export const dynamic = 'force-static';");
    expect(src, rel).toContain('currentNotice()');
  }
  expect(read('app/terms/notice/route.ts')).toContain('Content-Disposition');
});

test('the dialog shows the list, the effective day, the file and the sentence "you do not have to accept"', () => {
  expect(CONSENT_TEXTS.amendment.notRequired).toEqual({
    de: 'Sie müssen nicht annehmen; ohne Annahme gilt die bisherige Fassung weiter.',
    en: 'You do not have to accept; without acceptance the previous version continues to apply.',
  });
  for (const lang of ['de', 'en'] as const) expect(CONSENT_TEXTS.amendment.noticeListLead[lang]).toContain('{{termsEffectiveDate}}');
  const gate = read('components/TermsReacceptGate.tsx');
  expect(gate).toContain('fetch(NOTICE_SUMMARY_PATH');
  expect(gate).toContain('summary.clauses[lang]');
  expect(gate).toContain('consentText(C2.notRequired, lang)');
  expect(gate).toContain('data-terms-gate-notice-file');
  // Every account that accepted an earlier version sees it; the sentence only where declining is real.
  expect(gate).toContain('{!noAcceptance && <NoticeInDialog lang={lang} mayDecline={mayDecline} />}');
  // The builder reads files, so the client names the addresses only.
  const valueImports = gate.split(/\r?\n/).filter((l) => /^import (?!type )/.test(l) && /terms-announcement\/(notice-file|changes|mail)'/.test(l));
  expect(valueImports).toEqual([]);
  expect(gate).toMatch(/import type \{ NoticeSummary \} from '@\/lib\/terms-announcement\/notice-file';/);
});
