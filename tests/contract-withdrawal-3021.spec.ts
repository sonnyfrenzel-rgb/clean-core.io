import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildWithdrawalReceiptMail, withdrawalReceiptSubject } from '../lib/withdrawal-receipt-email';
import {
  END_CONTRACT_CONFIRM_LABEL,
  END_CONTRACT_FOOTER_CLASS,
  END_CONTRACT_HREF,
  END_CONTRACT_ID,
  END_CONTRACT_LABEL,
  END_CONTRACT_LABEL_DE,
} from '../lib/contract-withdrawal';
import {
  WITHDRAWAL_DECLARED_KIND,
  WITHDRAWAL_ENDING,
  WITHDRAWAL_RECEIPT_KIND,
  receiveWithdrawalDeclaration,
  type WithdrawalDeps,
} from '../lib/withdrawal-declaration';
import { pseudonymisedProofFields, PROOF_LOG_COLLECTIONS } from '../lib/proof-log';
import type { MailOutcome } from '../lib/transactional-mail';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { legalDocumentBlocks } from '../lib/legal/documents';
import { toArchiveMarkdown } from '../lib/legal/markup';

/**
 * The voluntary withdrawal / termination function — C13, owner decision
 * 23.10.2026 (§ 356a BGB as a safeguard), its own path since A6 of 3.0.21.
 *
 * "Withdraw from / end the contract" / "Vertrag widerrufen / beenden",
 * highlighted in Settings and the signed-in footer, opens a withdrawal form of
 * its own that shows the declaration, the name, the account address and the
 * contract; its button is "Confirm withdrawal · Widerruf bestätigen". The
 * route records the declaration in the proof log, sends the receipt at once,
 * records that it was sent and when, and only then deletes the account. Terms
 * section 13 says the operator offers it voluntarily without acknowledging a
 * statutory right of withdrawal. Server-free.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test.describe('the withdrawal function', () => {
  test('one label in both languages, one anchor in Settings', () => {
    expect(END_CONTRACT_LABEL).toBe('Withdraw from / end the contract');
    expect(END_CONTRACT_LABEL_DE).toBe('Vertrag widerrufen / beenden');
    expect(END_CONTRACT_HREF).toBe(`/settings#${END_CONTRACT_ID}`);
  });

  test('the binding button says withdrawal in both languages, never only "delete account"', () => {
    expect(CONSENT_TEXTS.withdrawal.confirm.en).toMatch(/^Confirm withdrawal( and delete account)?$/);
    expect(CONSENT_TEXTS.withdrawal.confirm.de).toMatch(/^Widerruf bestätigen( und Konto löschen)?$/);
    expect(END_CONTRACT_CONFIRM_LABEL).toBe(`${CONSENT_TEXTS.withdrawal.confirm.en} · ${CONSENT_TEXTS.withdrawal.confirm.de}`);
    expect(END_CONTRACT_CONFIRM_LABEL).not.toMatch(/^(Delete account|Konto löschen)/i);
    expect(CONSENT_TEXTS.withdrawal.contract).toEqual({
      de: 'Vertrag über die Nutzung von Clean-Core.io',
      en: 'Contract for the use of Clean-Core.io',
    });
  });

  test('Settings: a card of its own, highlighted, whose button opens the withdrawal form — not the deletion', () => {
    const src = read('app/(app)/settings/page.tsx');
    expect(src).toContain('id={END_CONTRACT_ID}');
    const entry = src.slice(src.indexOf('data-settings-end-contract=""'), src.indexOf('Danger Zone — the name'));
    expect(entry).toMatch(/<CcButton variant="secondary" onClick=\{openWithdrawal\}[^\n]{0,120}data-settings-end-contract-button=""/);
    expect(entry).not.toContain('openDeleteAccount');
    expect(entry).toContain('{END_CONTRACT_LABEL}');
    expect(entry).toContain('{END_CONTRACT_LABEL_DE}');
    // The footer link lands on the withdrawal form, not on the deletion confirmation.
    expect(src).toMatch(/window\.location\.hash\.slice\(1\) !== END_CONTRACT_ID\) return;[\s\S]{0,300}setShowWithdrawal\(true\)/);
  });

  test('the withdrawal form shows declaration, name, account e-mail and contract, and posts to its own route', () => {
    const src = read('app/(app)/settings/page.tsx');
    const form = src.slice(src.indexOf('open={showWithdrawal}'));
    expect(form).toMatch(/^open=\{showWithdrawal\}\s*title=\{[^}]*formTitle/);
    expect(form).toContain('confirmLabel={END_CONTRACT_CONFIRM_LABEL}');
    expect(form).toContain('onConfirm={handleWithdraw}');
    for (const marker of ['data-withdrawal-declaration', 'data-withdrawal-name', 'data-withdrawal-email', 'data-withdrawal-contract']) {
      expect(form, marker).toContain(`${marker}=""`);
    }
    expect(form).toContain('{profile?.email}');
    expect(form).toMatch(/profile\?\.firstName[\s\S]{0,40}profile\?\.lastName/);
    expect(form).toContain('{CONSENT_TEXTS.withdrawal.contract.en}');
    expect(form).toContain('{CONSENT_TEXTS.withdrawal.contract.de}');
    const handler = src.slice(src.indexOf('const handleWithdraw = async'), src.indexOf('const getTierInfo'));
    expect(handler).toContain("fetch('/api/account/withdraw'");
    expect(handler).not.toContain('/api/account/delete');
  });

  test('the app shell footer shows it only to a signed-in account, highlighted, in both footer shapes', () => {
    const src = read('app/(app)/layout.tsx');
    const links = [...src.matchAll(/\{profile \? \(\s*(?:<p[^>]*>\s*)?<Link href=\{END_CONTRACT_HREF\} className=\{END_CONTRACT_FOOTER_CLASS\}/g)];
    expect(links).toHaveLength(2);
    expect(END_CONTRACT_FOOTER_CLASS).toContain('font-bold');
    expect(END_CONTRACT_FOOTER_CLASS).toContain('text-cc-ink ');
    expect(END_CONTRACT_FOOTER_CLASS).not.toContain('text-cc-ink-muted');
    // Not in the shared SiteFooter: the public pages outside the shell would
    // have to initialise sign-in to know who is there.
    expect(read('components/SiteFooter.tsx')).not.toContain('END_CONTRACT');
  });

  test('the route checks the sign-in, then hands over to the declaration; the generic deletion sends no receipt', () => {
    const src = read('app/api/account/withdraw/route.ts');
    expect(src).toContain('isRecentLogin(decodedToken, 300)');
    const stepUp = src.indexOf('await assertMfaStepUp(req, decodedToken)');
    const declare = src.indexOf('await receiveWithdrawalDeclaration(');
    expect(stepUp).toBeGreaterThan(0);
    expect(declare).toBeGreaterThan(stepUp);
    expect(src).toContain('erase: (uid, ending) => deleteUserDataAndAccount(uid, { ending })');
    expect(src).toContain("db.collection('consent_events').doc().create(");
    // The address comes from the verified token; no body is read.
    expect(src).not.toMatch(/req\.json\(|request\.json\(/);
    expect(read('app/api/account/delete/route.ts')).not.toContain('sendWithdrawalReceiptMail');
    // The sender returns the outcome rather than swallowing it.
    const sender = read('lib/withdrawal-receipt-mail.ts');
    expect(sender).toContain('Promise<MailOutcome>');
    expect(sender).toContain('return await sendTransactionalMail(');
    expect(sender).not.toMatch(/retry|resend\(/i);
  });

  for (const language of ['en', 'de'] as const) {
    test(`the receipt (${language}) repeats the declaration, the name, the contract and the time of receipt, in the contract language`, () => {
      const html = buildWithdrawalReceiptMail({ language, recipient: 'a@example.com', name: 'Ann Example', receivedAt: '2026-10-23T10:00:00.000Z' });
      const t = CONSENT_TEXTS.withdrawal;
      expect(withdrawalReceiptSubject(language)).toBe(t.receiptSubject[language]);
      expect(html).toContain(t.receiptReceived[language]);
      expect(html).toContain(t.declaration[language]);
      expect(html).toContain(`${t.receiptName[language]}:</strong> Ann Example`);
      expect(html).toContain(`${t.receiptContract[language]}:</strong> ${t.contract[language]}`);
      expect(html).toContain(`${t.receiptAt[language]}:</strong> 2026-10-23T10:00:00.000Z (UTC)`);
      expect(html).toContain(t.receiptEffect[language]);
      expect(html).toContain(language === 'de' ? '/terms/de' : '/terms');
      expect(html).toContain('a@example.com');
    });
  }

  test('no text of the function promises only an effort', () => {
    const all = JSON.stringify(CONSENT_TEXTS.withdrawal);
    expect(all).not.toMatch(/best effort|bestem Bemühen|nach Möglichkeit|where possible/i);
    for (const language of ['en', 'de'] as const) {
      const html = buildWithdrawalReceiptMail({ language, recipient: 'a@example.com', name: 'Ann', receivedAt: '2026-10-23T10:00:00.000Z' });
      expect(html).not.toMatch(/best effort|bestem Bemühen/i);
    }
  });

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

  test('the privacy policy names both proof-log records of the function', () => {
    const en = toArchiveMarkdown(legalDocumentBlocks('privacy', 'en'));
    const de = toArchiveMarkdown(legalDocumentBlocks('privacy', 'de'));
    expect(en).toContain('for a declaration with that function also its wording, the contract, the time it was received and whether and when the receipt went out by e-mail');
    expect(de).toContain('bei einer Erklärung mit dieser Funktion auch ihr Wortlaut, der Vertrag, der Zeitpunkt ihres Eingangs und ob und wann die Eingangsbestätigung per E-Mail versandt wurde');
  });
});

test.describe('the withdrawal path, in order', () => {
  const UID = 'u-withdraw';
  const EMAIL = 'ann@example.org';
  const T0 = new Date('2026-11-06T09:00:00.000Z');
  const T1 = new Date('2026-11-06T09:00:01.000Z');

  function harness(outcome: MailOutcome, language: 'de' | 'en' = 'de') {
    const steps: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const sent: Parameters<WithdrawalDeps['send']>[0][] = [];
    let erased: { uid: string; ending: string } | null = null;
    const clock = [T0, T1];
    const deps: WithdrawalDeps = {
      now: () => clock.shift() ?? T1,
      readProfile: async () => ({ language, name: 'Ann Example' }),
      record: async (row) => {
        steps.push(`record:${row.kind}`);
        rows.push(row);
      },
      send: async (input) => {
        steps.push('send');
        sent.push(input);
        return outcome;
      },
      erase: async (uid, ending) => {
        steps.push('erase');
        erased = { uid, ending };
      },
    };
    return { deps, steps, rows, sent, erased: () => erased };
  }

  test('declaration recorded, receipt sent, its sending recorded with the time, then the deletion', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'msg-1' });
    const out = await receiveWithdrawalDeclaration({ uid: UID, email: EMAIL }, h.deps);
    expect(out).toEqual({ ok: true, receivedAt: T0.toISOString(), receiptSentAt: T1.toISOString() });
    expect(h.steps).toEqual([`record:${WITHDRAWAL_DECLARED_KIND}`, 'send', `record:${WITHDRAWAL_RECEIPT_KIND}`, 'erase']);

    const [declared, receipt] = h.rows;
    expect(declared).toMatchObject({
      userId: UID,
      email: EMAIL,
      kind: 'withdrawal-declared',
      declaration: CONSENT_TEXTS.withdrawal.declaration.de,
      contract: CONSENT_TEXTS.withdrawal.contract.de,
      termsLanguage: 'de',
      receivedAt: T0,
      expiresAt: null,
    });
    expect(receipt).toMatchObject({ userId: UID, kind: 'withdrawal-receipt', status: 'sent', receiptSentAt: T1, messageId: 'msg-1', declarationReceivedAt: T0 });
    // The proof log keeps no name (privacy section 5).
    for (const row of h.rows) expect(JSON.stringify(row)).not.toContain('Ann Example');

    expect(h.sent).toEqual([{ to: EMAIL, uid: UID, language: 'de', name: 'Ann Example', receivedAt: T0.toISOString() }]);
    expect(h.erased()).toEqual({ uid: UID, ending: WITHDRAWAL_ENDING });
    expect(WITHDRAWAL_ENDING).toBe('withdrawal-function');
  });

  test('a receipt that does not go out stops before the deletion, with the declaration and the failure on record', async () => {
    const h = harness({ delivered: false, reason: 'rejected', detail: 'x' }, 'en');
    const out = await receiveWithdrawalDeclaration({ uid: UID, email: EMAIL }, h.deps);
    expect(out).toEqual({ ok: false, code: 'receipt-not-sent', receivedAt: T0.toISOString() });
    expect(h.steps).toEqual([`record:${WITHDRAWAL_DECLARED_KIND}`, 'send', `record:${WITHDRAWAL_RECEIPT_KIND}`]);
    expect(h.rows[1]).toMatchObject({ status: 'not-sent', receiptSentAt: null, reason: 'rejected' });
    expect(h.erased()).toBeNull();
  });

  test('without an address nothing is recorded, sent or deleted', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'm' });
    expect(await receiveWithdrawalDeclaration({ uid: UID, email: '' }, h.deps)).toEqual({ ok: false, code: 'no-address' });
    expect(h.steps).toEqual([]);
  });

  test('both records are proof-log rows the erasure keeps pseudonymised', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'msg-1' });
    await receiveWithdrawalDeclaration({ uid: UID, email: EMAIL }, h.deps);
    // Keyed by `userId` in `consent_events`, as `retainProofsOfErasedAccount` selects them.
    expect(PROOF_LOG_COLLECTIONS).toContain('consent_events');
    expect(read('app/api/account/withdraw/route.ts')).toContain("collection('consent_events')");
    const DEL = Symbol('delete');
    const fields = pseudonymisedProofFields({ accountHash: 'h', endedAt: T1, ending: WITHDRAWAL_ENDING }, DEL);
    for (const row of h.rows) {
      expect(row.userId).toBe(UID);
      const after = { ...row, ...fields };
      expect(after.email).toBe(DEL);
      expect(after.uid).toBe(DEL);
      expect(after.contractEnding).toBe('withdrawal-function');
    }
  });
});
