import { test, expect } from '@playwright/test';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { recordEmailEvent, recordEmailSent } from '../lib/email-events';

/**
 * What a delivery verdict says, and what it says it because of — executed
 * against the Firestore emulator, not read out of the source.
 *
 * The guard that came with the fix checks the source text of
 * `recordEmailEvent`, which cannot tell whether the values that reach Firestore
 * are the winning event's or the last one's (QA review of 90be9aba984e,
 * cda2b1355f2d). This runs the function and reads the documents back.
 *
 * `lib/email-events.ts` reaches Firestore through `getAdminDb` and touches no
 * auth module, so it loads under Playwright's CommonJS transform.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

const summary = async (messageId: string) => (await db().collection('email_events').doc(messageId).get()).data();
const request = async (uid: string) => (await db().collection('registration_requests').doc(uid).get()).data();

test.describe.configure({ mode: 'serial' });

test('a bounce keeps its reason when a scanner opens the mail afterwards', async () => {
  const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const uid = `uid-${messageId}`;
  await recordEmailSent(messageId, 'someone@example.com', 'Welcome to Clean-Core.io', 'welcome', uid);

  await recordEmailEvent(
    { messageId, type: 'email.bounced', to: ['someone@example.com'], detail: 'mailbox does not exist', occurredAt: '2026-09-16T08:00:00.000Z' },
    'evt-bounce',
  );
  // A mail-security scanner follows the links in a mail nobody received.
  await recordEmailEvent(
    { messageId, type: 'email.opened', to: ['someone@example.com'], detail: null, occurredAt: '2026-09-16T08:05:00.000Z' },
    'evt-open',
  );

  const after = await summary(messageId);
  expect(after?.status, 'a bounce is not undone by a later open').toBe('email.bounced');
  expect(after?.lastDetail, 'the reason belongs to the status, not to the last event').toBe('mailbox does not exist');
  expect(after?.lastEventAt).toBe('2026-09-16T08:00:00.000Z');
  // The losing event is still in the record — it just does not relabel the verdict.
  expect((after?.timeline as Array<{ type: string }>).map((e) => e.type)).toContain('email.opened');

  const row = await request(uid);
  expect(row?.welcomeMailStatus, 'the admin console shows the same verdict').toBe('email.bounced');
  expect(row?.welcomeMailDetail, 'and the same reason').toBe('mailbox does not exist');
  expect(row?.welcomeMailAt).toBe('2026-09-16T08:00:00.000Z');
});

test('a better outcome does replace a neutral one, with its own detail', async () => {
  const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await recordEmailSent(messageId, 'someone@example.com', 'Welcome', 'welcome');
  await recordEmailEvent(
    { messageId, type: 'email.delivered', to: ['someone@example.com'], detail: 'accepted by mx1.example.com', occurredAt: '2026-09-16T09:00:00.000Z' },
    'evt-delivered',
  );
  const after = await summary(messageId);
  expect(after?.status).toBe('email.delivered');
  expect(after?.lastDetail).toBe('accepted by mx1.example.com');
});

test('the same webhook delivered twice is recorded once', async () => {
  const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await recordEmailSent(messageId, 'someone@example.com', 'Welcome', 'welcome');
  const event = { messageId, type: 'email.bounced', to: ['someone@example.com'], detail: 'hard bounce', occurredAt: '2026-09-16T10:00:00.000Z' };
  await recordEmailEvent(event, 'evt-same');
  await recordEmailEvent(event, 'evt-same');
  const after = await summary(messageId);
  const bounces = (after?.timeline as Array<{ type: string }>).filter((e) => e.type === 'email.bounced');
  expect(bounces, 'a retried webhook is not a second timeline entry').toHaveLength(1);
});
