import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildWithdrawalReceiptMail, withdrawalReceiptSubject } from '../lib/withdrawal-receipt-email';
import { END_CONTRACT_HREF, END_CONTRACT_ID, END_CONTRACT_LABEL, END_CONTRACT_LABEL_DE } from '../lib/contract-withdrawal';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { legalDocumentBlocks } from '../lib/legal/documents';
import { toArchiveMarkdown } from '../lib/legal/markup';

/**
 * The voluntary withdrawal / termination function — C13, owner decision
 * 23.10.2026 after the lawyer's feedback (§ 356a BGB as a safeguard).
 *
 * The account deletion is labelled additionally as "Withdraw from / end the
 * contract" / "Vertrag widerrufen / beenden", reachable from Settings and the
 * signed-in footer, leads to the existing deletion confirmation, and the
 * route confirms receipt of the declaration by e-mail — best effort, no
 * resend. Terms section 13 says the operator offers it voluntarily without
 * acknowledging a statutory right of withdrawal. Server-free.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test.describe('the withdrawal function', () => {
  test('one label in both languages, one anchor in Settings', () => {
    expect(END_CONTRACT_LABEL).toBe('Withdraw from / end the contract');
    expect(END_CONTRACT_LABEL_DE).toBe('Vertrag widerrufen / beenden');
    expect(END_CONTRACT_HREF).toBe(`/settings#${END_CONTRACT_ID}`);
  });

  test('Settings carries the entry at the Danger Zone and opens the deletion confirmation from the link', () => {
    const src = read('app/(app)/settings/page.tsx');
    expect(src).toContain('id={END_CONTRACT_ID}');
    const entry = src.slice(src.indexOf('data-settings-end-contract=""'));
    expect(entry).toMatch(/onClick=\{openDeleteAccount\}[^>]*data-settings-end-contract-button=""/);
    expect(entry).toContain('{END_CONTRACT_LABEL}');
    expect(entry).toContain('{END_CONTRACT_LABEL_DE}');
    expect(src).toMatch(/window\.location\.hash\.slice\(1\) !== END_CONTRACT_ID\) return;[\s\S]{0,300}setShowDeleteAccount\(true\)/);
  });

  test('the app shell footer shows it only to a signed-in account, in both footer shapes', () => {
    const src = read('app/(app)/layout.tsx');
    const links = [...src.matchAll(/\{profile \? \(\s*(?:<p[^>]*>\s*)?<Link href=\{END_CONTRACT_HREF\}/g)];
    expect(links).toHaveLength(2);
    // Not in the shared SiteFooter: the public pages outside the shell would
    // have to initialise sign-in to know who is there.
    expect(read('components/SiteFooter.tsx')).not.toContain('END_CONTRACT');
  });

  test('the route confirms receipt before the erasure, best effort', () => {
    const src = read('app/api/account/delete/route.ts');
    const receipt = src.indexOf('await sendReceipt(decodedToken.uid');
    const erase = src.indexOf('await deleteUserDataAndAccount(decodedToken.uid)');
    const stepUp = src.indexOf('await assertMfaStepUp(req, decodedToken)');
    expect(receipt).toBeGreaterThan(stepUp);
    expect(erase).toBeGreaterThan(receipt);
    const sender = read('lib/withdrawal-receipt-mail.ts');
    expect(sender).toMatch(/catch \(err\) \{\s*logger\.warn\('withdrawal receipt not sent'/);
    expect(sender).not.toMatch(/retry|resend\(/i);
  });

  for (const language of ['en', 'de'] as const) {
    test(`the receipt (${language}) says what was received and when, in the contract language`, () => {
      const html = buildWithdrawalReceiptMail({ language, recipient: 'a@example.com', firstName: 'Ann', receivedAt: '2026-10-23T10:00:00.000Z' });
      expect(withdrawalReceiptSubject(language)).toBe(CONSENT_TEXTS.withdrawal.receiptSubject[language]);
      expect(html).toContain(CONSENT_TEXTS.withdrawal.receiptReceived[language]);
      expect(html).toContain(`${CONSENT_TEXTS.withdrawal.receiptAt[language]}:</strong> 2026-10-23T10:00:00.000Z (UTC)`);
      expect(html).toContain(CONSENT_TEXTS.withdrawal.receiptEffect[language]);
      expect(html).toContain(language === 'de' ? '/terms/de' : '/terms');
      expect(html).toContain('a@example.com');
    });
  }

  test('Terms section 13 offers it voluntarily, without acknowledging a statutory right of withdrawal', () => {
    const en = toArchiveMarkdown(legalDocumentBlocks('terms', 'en'));
    const de = toArchiveMarkdown(legalDocumentBlocks('terms', 'de'));
    expect(en).toContain('The operator voluntarily offers this termination as the function "Withdraw from / end the contract"');
    expect(en).toContain('without thereby acknowledging a statutory right of withdrawal.');
    expect(de).toContain('Der Betreiber bietet diese Kündigung freiwillig als Funktion „Vertrag widerrufen / beenden“');
    expect(de).toContain('ohne damit ein gesetzliches Widerrufsrecht anzuerkennen.');
    // The G07 wording stays: no statutory right of withdrawal.
    expect(en).toContain('There is no statutory right of withdrawal for consumers under this contract');
  });
});
