import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  WITHDRAWAL_RECEIPT_DEADLINE_DAYS,
  WITHDRAWAL_RECEIPT_EXPIRED_KIND,
  processQueuedReceipt,
  processWithdrawalQueue,
  queuedReceipt,
  queuedReceiptOf,
  retryDelayMs,
  type QueueDeps,
  type QueuedReceipt,
} from '../lib/withdrawal-queue';
import { WITHDRAWAL_ENDING, WITHDRAWAL_RECEIPT_KIND } from '../lib/withdrawal-declaration';
import { receiptDateTime, withdrawalReceiptPendingMessage } from '../lib/messages/model-consent';
import type { MailOutcome } from '../lib/transactional-mail';

/**
 * B8 of the legal review of 06.11.2026 (release 3.0.21): a withdrawal whose
 * receipt cannot be sent is effective on submission, the account is blocked at
 * once, the receipt waits in a queue with retries, and the account is deleted
 * after a sent receipt — at the latest seven days after the declaration, with
 * a note in the proof log. The person never reads "try again".
 *
 * Server-free: the queue against stand-in deps, the message, and source guards
 * on the route, the runners and the block.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const UID = 'u-queued';
const EMAIL = 'ann@example.org';
const T0 = new Date('2026-11-06T13:05:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function harness(outcome: MailOutcome, now: Date) {
  const steps: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const saved: QueuedReceipt[] = [];
  const deps: QueueDeps = {
    now: () => now,
    readProfile: async () => ({ language: 'de', name: 'Ann Example' }),
    record: async (row) => {
      steps.push(`record:${row.kind}`);
      rows.push(row);
    },
    send: async () => {
      steps.push('send');
      return outcome;
    },
    erase: async (_uid, ending) => {
      steps.push(`erase:${ending}`);
    },
    save: async (entry) => {
      steps.push('save');
      saved.push(entry);
    },
    remove: async () => {
      steps.push('remove');
    },
  };
  return { deps, steps, rows, saved };
}

const entry = (): QueuedReceipt => queuedReceipt({ uid: UID, email: EMAIL, language: 'de', receivedAt: T0, at: T0, reason: 'rejected' });

test.describe('the queue', () => {
  test('an entry: seven days to the deadline, retried with growing pauses', () => {
    const e = entry();
    expect(WITHDRAWAL_RECEIPT_DEADLINE_DAYS).toBe(7);
    expect(e.deadlineAt).toBe(new Date(T0.getTime() + 7 * DAY).toISOString());
    expect(e.nextAttemptAt).toBe(new Date(T0.getTime() + retryDelayMs(1)).toISOString());
    expect(retryDelayMs(1)).toBeLessThan(retryDelayMs(2));
    expect(retryDelayMs(10)).toBe(6 * 60 * 60 * 1000);
    expect(queuedReceiptOf(UID, { ...e })).toEqual(e);
    expect(queuedReceiptOf(UID, { email: EMAIL })).toBeNull();
  });

  test('a receipt that now goes out is recorded, then the account is deleted and the entry removed', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'm-2' }, new Date(T0.getTime() + DAY));
    expect(await processQueuedReceipt(entry(), h.deps, { force: true })).toBe('sent-and-erased');
    expect(h.steps).toEqual(['send', `record:${WITHDRAWAL_RECEIPT_KIND}`, `erase:${WITHDRAWAL_ENDING}`, 'remove']);
    expect(h.rows[0]).toMatchObject({ status: 'sent', declarationReceivedAt: T0 });
  });

  test('one that still does not go out is recorded and tried again later; nothing is deleted', async () => {
    const now = new Date(T0.getTime() + DAY);
    const h = harness({ delivered: false, reason: 'not-configured', detail: '' }, now);
    expect(await processQueuedReceipt(entry(), h.deps, { force: true })).toBe('retry-later');
    expect(h.steps).toEqual(['send', `record:${WITHDRAWAL_RECEIPT_KIND}`, 'save']);
    expect(h.saved[0]).toMatchObject({ attempts: 2, lastReason: 'not-configured', lastAttemptAt: now.toISOString() });
    expect(Date.parse(h.saved[0].nextAttemptAt)).toBe(now.getTime() + retryDelayMs(2));
  });

  test('without force an entry not yet due is left alone', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'm' }, new Date(T0.getTime() + 1000));
    expect(await processQueuedReceipt(entry(), h.deps)).toBe('not-due');
    expect(h.steps).toEqual([]);
  });

  test('at the deadline the account is deleted without the receipt, with a note in the proof log first — and nothing is sent', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'm' }, new Date(T0.getTime() + 7 * DAY));
    expect(await processQueuedReceipt(entry(), h.deps, { force: true })).toBe('expired-and-erased');
    expect(h.steps).toEqual([`record:${WITHDRAWAL_RECEIPT_EXPIRED_KIND}`, `erase:${WITHDRAWAL_ENDING}`, 'remove']);
    expect(h.rows[0]).toMatchObject({ userId: UID, kind: 'withdrawal-receipt-expired', status: 'deleted-without-receipt', expiresAt: null });
    // The proof log keeps no name.
    expect(JSON.stringify(h.rows[0])).not.toContain('Ann Example');
  });

  test('a failure of one entry does not stop the others', async () => {
    const h = harness({ delivered: true, mocked: false, messageId: 'm' }, new Date(T0.getTime() + DAY));
    let first = true;
    const deps: QueueDeps = {
      ...h.deps,
      send: async (input) => {
        if (first) {
          first = false;
          throw new Error('boom');
        }
        return h.deps.send(input);
      },
    };
    const counts = await processWithdrawalQueue([entry(), { ...entry(), uid: 'u-2' }], deps, { force: true });
    expect(counts.failed).toBe(1);
    expect(counts['sent-and-erased']).toBe(1);
  });
});

test.describe('what the person reads', () => {
  test('the exact sentence, in both languages, with date and time — never "try again"', () => {
    const at = '2026-11-06T13:05:00.000Z';
    const de = receiptDateTime(at, 'de');
    expect(de).toEqual({ date: '06.11.2026', time: '14:05 Uhr' });
    expect(withdrawalReceiptPendingMessage(at, 'de')).toBe(
      'Ihr Widerruf ist eingegangen und wirksam (06.11.2026, 14:05 Uhr). Die Eingangsbestätigung können wir gerade nicht per E-Mail senden; wir holen das automatisch nach und löschen Ihr Konto danach. Sie müssen nichts weiter tun.',
    );
    const en = withdrawalReceiptPendingMessage(at, 'en');
    expect(en).toMatch(
      /^Your withdrawal has been received and is effective \(6 November 2026, 14:05 [^)]+\)\. We cannot send the confirmation of receipt by e-mail right now; we will send it automatically as soon as possible and then delete your account\. You do not need to do anything else\.$/,
    );
    for (const text of [withdrawalReceiptPendingMessage(at, 'de'), en]) expect(text).not.toMatch(/try again|erneut/i);
  });

  test('the route answers 202 with the sentence, not an error; the settings and the dashboard show it', () => {
    const route = read('app/api/account/withdraw/route.ts');
    expect(route).toContain("code: 'receipt-queued'");
    expect(route).toContain('{ status: 202 }');
    expect(route).toContain("withdrawalReceiptPendingMessage(result.receivedAt, 'en')");
    expect(route).not.toContain('receiptNotSent');
    expect(route).not.toContain('status: 503');
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain('if (answer.receiptPending === true) {');
    expect(settings).toContain('data-settings-withdrawal-pending=""');
    expect(read('app/(app)/dashboard/page.tsx')).toContain("withdrawal?.state === 'receipt-pending'");
  });
});

test.describe('blocked at once, and who works the queue', () => {
  test('the block reuses the signal every route and rule honours, and ends the sessions; the sign-in stays possible', () => {
    const store = read('lib/withdrawal-queue-store.ts');
    const block = store.slice(store.indexOf('async function block('), store.indexOf('async function enqueue('));
    expect(block).toContain('disabled: true,');
    expect(block).toContain('revokeRefreshTokens(uid)');
    expect(block).not.toContain('updateUser(');
    // `disabled` is what assertAccountActive, the rules and the community mail refuse on.
    expect(read('lib/firebase-admin.ts')).toContain("if (status === 'suspended' || status === 'deleted' || data.disabled === true) {");
    expect(read('firestore.rules')).toContain("get(callerProfilePath()).data.get('disabled', false) != true;");
    expect(read('lib/community-mail.ts')).toContain("profile.disabled === true) return 'deleted';");
  });

  test('no rules change: the queue and the profile fields are the Admin SDK\'s', () => {
    const rules = read('firestore.rules');
    expect(rules).not.toContain('withdrawal_receipt_queue');
    const keys = rules.slice(rules.indexOf('function userClientUpdateKeys()'), rules.indexOf('function isCreationTime('));
    expect(keys).not.toMatch(/'withdrawal'|'disabled'/);
  });

  test('worked at the next sign-in and by the operator in the admin console', () => {
    expect(read('app/api/account/signed-in/route.ts')).toContain('await processOwnPendingWithdrawal(decoded.uid);');
    const hook = read('hooks/useUserProfile.ts');
    expect(hook).toContain('if (withdrawalReceiptPending(docSnap.data())) reportGoogleSignIn(user, true);');
    const action = read('app/api/admin/console-action/route.ts');
    expect(action).toContain("if (action === 'withdrawal-receipts') {");
    expect(action.indexOf("if (action === 'withdrawal-receipts') {")).toBeGreaterThan(action.indexOf('await assertAdminStepUp(req, decodedAdmin);'));
    expect(read('app/(app)/admin/page.tsx')).toContain('<WithdrawalReceiptsPanel />');
  });
});
