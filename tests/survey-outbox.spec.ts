import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { claimSend, completeSend, failSend, recordInvited, sendRef, classifySends } from '../lib/survey/outbox';

/**
 * The survey outbox against the Firestore emulator — the transactions, not a
 * reading of the script's source (QA review of efb7d2435d0b, e021722cc73a).
 *
 * `playwright.config.ts` points FIRESTORE_EMULATOR_HOST at the emulator the
 * suite already needs, so the Admin SDK here writes where the script would.
 */

let db: Firestore;
const campaign = `outbox-spec-${Date.now()}`;
const campaignRef = () => db.collection('survey_campaigns').doc(campaign);

test.beforeAll(() => {
  const app = getApps()[0] ?? initializeApp({ projectId: 'cleancore-491216' });
  db = getFirestore(app);
});

test.describe.configure({ mode: 'serial' });

test('a recipient is claimed once: ten runs at once, one provider call', async () => {
  const recipient = { uid: 'u-race', email: 'race@cleancore-test.io' };
  const claims = await Promise.all(Array.from({ length: 10 }, () => claimSend(db, campaign, recipient)));
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect((await sendRef(db, campaign, recipient.uid).get()).data()?.state).toBe('sending');
});

test('sent and sending are never claimed again; a refused send is', async () => {
  const r = { uid: 'u-states', email: 'states@cleancore-test.io' };
  expect(await claimSend(db, campaign, r)).toBe(true);
  // Still sending — another run finds the claim.
  expect(await claimSend(db, campaign, r)).toBe(false);
  await completeSend(db, campaign, r.uid, 'provider-1');
  expect(await claimSend(db, campaign, r)).toBe(false);
  expect((await sendRef(db, campaign, r.uid).get()).data()).toMatchObject({ state: 'sent', providerId: 'provider-1' });

  const f = { uid: 'u-failed', email: 'failed@cleancore-test.io' };
  expect(await claimSend(db, campaign, f)).toBe(true);
  await failSend(db, campaign, f.uid, '429 too many requests for [address]');
  expect((await sendRef(db, campaign, f.uid).get()).data()?.state).toBe('failed');
  // A refusal is what the next run retries.
  expect(await claimSend(db, campaign, f)).toBe(true);
  expect((await sendRef(db, campaign, f.uid).get()).data()?.state).toBe('sending');
});

test('a record from before the outbox counts as sent and is not claimed again', async () => {
  await db.collection('email_sends').doc(`${campaign}__u-legacy`).set({ campaign, email: 'legacy@cleancore-test.io', uid: 'u-legacy', providerId: 'old', sentAt: new Date() });
  expect(await claimSend(db, campaign, { uid: 'u-legacy', email: 'legacy@cleancore-test.io' })).toBe(false);
  const snap = await db.collection('email_sends').where('campaign', '==', campaign).get();
  const classes = classifySends(snap.docs.map((d) => d.data() as Parameters<typeof classifySends>[0][number]));
  expect(classes.sent.sort()).toEqual(['legacy@cleancore-test.io', 'states@cleancore-test.io']);
  expect(classes.sending.sort()).toEqual(['failed@cleancore-test.io', 'race@cleancore-test.io']);
  expect(classes.failed).toEqual([]);
});

test('invited is the number of records that say the mail went out, written with the count that produced it', async () => {
  // Two sent (one legacy, one settled), two still sending, none failed.
  expect(await recordInvited(db, campaign, campaignRef())).toBe(2);
  expect((await campaignRef().get()).data()?.invited).toBe(2);

  // Settling the two in flight moves the count to four; a refusal does not.
  await completeSend(db, campaign, 'u-race', 'provider-2');
  await failSend(db, campaign, 'u-failed', 'refused');
  expect(await recordInvited(db, campaign, campaignRef())).toBe(3);
  await completeSend(db, campaign, 'u-failed', 'provider-3');
  expect(await recordInvited(db, campaign, campaignRef())).toBe(4);
});

test('concurrent counts and sends end with the count of the records, never below it', async () => {
  // Five more recipients settle while five counts run; whatever the
  // interleaving, the transactions serialise and the last committed count is
  // the count of the records it read — and a count can never go down.
  const extra = Array.from({ length: 5 }, (_, i) => ({ uid: `u-conc-${i}`, email: `conc-${i}@cleancore-test.io` }));
  await Promise.all(extra.map((r) => claimSend(db, campaign, r)));
  const results = await Promise.all([
    ...extra.map((r) => completeSend(db, campaign, r.uid, `p-${r.uid}`).then(() => -1)),
    ...Array.from({ length: 5 }, () => recordInvited(db, campaign, campaignRef())),
  ]);
  const counts = results.filter((n) => n >= 0);
  for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(0);

  const final = await recordInvited(db, campaign, campaignRef());
  const sent = (await db.collection('email_sends').where('campaign', '==', campaign).get()).docs.filter((d) => {
    const state = d.data().state;
    return state === 'sent' || state === undefined;
  }).length;
  expect(final).toBe(sent);
  expect(final).toBe(9);
  expect((await campaignRef().get()).data()?.invited).toBe(9);
});

test('a stale run cannot lower the count', async () => {
  // A campaign document that already says more than the records do — a run
  // that counted with a wider view — is left alone by a narrower count.
  await campaignRef().set({ invited: 12 }, { merge: true });
  expect(await recordInvited(db, campaign, campaignRef())).toBe(12);
  expect((await campaignRef().get()).data()?.invited).toBe(12);
});

test.afterAll(async () => {
  const sends = await db.collection('email_sends').where('campaign', '==', campaign).get();
  await Promise.all([...sends.docs.map((d) => d.ref.delete()), campaignRef().delete()]);
});
