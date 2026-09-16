import { test, expect } from '@playwright/test';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { claimLinkFetch } from '../lib/survey/link-fetch';

/**
 * Two requests for the same survey link at the same moment — the normal case,
 * because a mail gateway opens the URL before the recipient does.
 *
 * `tests/survey-guard.spec.ts` reads the page source and checks that the words
 * `db.runTransaction`, `tx.get(docRef)` and `tx.set(` occur in it. A refactor
 * that keeps those strings and loses the atomicity passes that check
 * (QA review of 90be9aba984e, cca300dfb572). This runs two claims against the
 * Firestore emulator and counts the winners.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

const CAMPAIGN = 'link-fetch-spec';
const docFor = (uid: string) => db().collection('survey_responses').doc(`${CAMPAIGN}__${uid}`);

test.describe.configure({ mode: 'serial' });

test('exactly one of two simultaneous fetches claims the stamp', async () => {
  const uid = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ref = docFor(uid);
  const claim = () => claimLinkFetch(db() as never, ref, { campaign: CAMPAIGN, uid, stamp: FieldValue.serverTimestamp() });

  const [a, b] = await Promise.all([claim(), claim()]);
  expect([a.claimed, b.claimed].filter(Boolean), 'one winner, not two and not none').toHaveLength(1);

  const stored = (await ref.get()).data();
  expect(stored?.linkFetchedAt, 'the stamp is there').toBeTruthy();
  expect(stored?.campaign).toBe(CAMPAIGN);
  expect(stored?.uid).toBe(uid);
  await ref.delete();
});

test('a later fetch does not move the stamp', async () => {
  const uid = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ref = docFor(uid);
  const claim = () => claimLinkFetch(db() as never, ref, { campaign: CAMPAIGN, uid, stamp: FieldValue.serverTimestamp() });

  const first = await claim();
  expect(first.claimed).toBe(true);
  const stampedAt = (await ref.get()).data()?.linkFetchedAt;

  const second = await claim();
  expect(second.claimed, 'the second arrival is not the first fetch').toBe(false);
  const after = (await ref.get()).data()?.linkFetchedAt;
  expect(String(after), 'and the recorded moment is still the first one').toBe(String(stampedAt));
  await ref.delete();
});

test('a claim never overwrites an answer that is already there', async () => {
  // The document is shared with the answers themselves; a stamp must not be a
  // write that loses them.
  const uid = `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ref = docFor(uid);
  await ref.set({ campaign: CAMPAIGN, uid, answers: { q1: { value: 'yes' } }, comment: 'already answered' });

  const result = await claimLinkFetch(db() as never, ref, { campaign: CAMPAIGN, uid, stamp: FieldValue.serverTimestamp() });
  expect(result.claimed, 'no stamp yet, so this one claims it').toBe(true);
  const stored = (await ref.get()).data();
  expect(stored?.answers, 'the answer survived the stamp').toEqual({ q1: { value: 'yes' } });
  expect(stored?.comment).toBe('already answered');
  await ref.delete();
});

test('the page uses this claim rather than its own transaction', () => {
  const src = require('fs').readFileSync(require('path').join(process.cwd(), 'app/survey/[token]/page.tsx'), 'utf8') as string;
  expect(src).toContain("from '@/lib/survey/link-fetch'");
  expect(src).toContain('claimLinkFetch(db, docRef');
});
