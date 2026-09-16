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

test('five runs racing for one recipient make exactly one provider call', async () => {
  // The send loop, reduced to its guard: a run asks the provider only when its
  // claim succeeded. Five such runs at once, one recipient, one call.
  const recipient = { uid: 'u-loop-race', email: 'loop-race@cleancore-test.io' };
  let providerCalls = 0;
  const run = async () => {
    if (!(await claimSend(db, campaign, recipient))) return 'skipped';
    providerCalls++;
    await completeSend(db, campaign, recipient.uid, `p-${providerCalls}`);
    return 'sent';
  };
  const outcomes = await Promise.all(Array.from({ length: 5 }, run));
  expect(providerCalls).toBe(1);
  expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1);
  expect((await sendRef(db, campaign, recipient.uid).get()).data()).toMatchObject({ state: 'sent', providerId: 'p-1' });
});

test('every committed count is at least the one before it, and the last one is the count of the records', async () => {
  // Five more recipients settle while five counts run. Each count resolves
  // after its commit; whatever the interleaving, the sequence of committed
  // values never goes down, and the last commit counts every record it read.
  const extra = Array.from({ length: 5 }, (_, i) => ({ uid: `u-conc-${i}`, email: `conc-${i}@cleancore-test.io` }));
  await Promise.all(extra.map((r) => claimSend(db, campaign, r)));
  const committed: number[] = [];
  await Promise.all([
    ...extra.map((r) => completeSend(db, campaign, r.uid, `p-${r.uid}`)),
    ...Array.from({ length: 5 }, () => recordInvited(db, campaign, campaignRef()).then((n) => { committed.push(n); })),
  ]);
  expect(committed).toHaveLength(5);
  for (let i = 1; i < committed.length; i++) expect(committed[i], `count ${i} dropped: ${committed.join(' → ')}`).toBeGreaterThanOrEqual(committed[i - 1]);

  const sent = async () => (await db.collection('email_sends').where('campaign', '==', campaign).get()).docs.filter((d) => ['sent', undefined].includes(d.data().state)).length;
  const final = await recordInvited(db, campaign, campaignRef());
  expect(final).toBe(await sent());
  expect(final).toBe(10);
  expect((await campaignRef().get()).data()?.invited).toBe(10);
});

test('a stale run cannot lower the count', async () => {
  // A campaign document that already says more than the records do — a run
  // that counted with a wider view — is left alone by a narrower count.
  await campaignRef().set({ invited: 14 }, { merge: true });
  expect(await recordInvited(db, campaign, campaignRef())).toBe(14);
  expect((await campaignRef().get()).data()?.invited).toBe(14);
  // …and a narrower stored value is brought back up to the records.
  await campaignRef().set({ invited: 3 }, { merge: true });
  expect(await recordInvited(db, campaign, campaignRef())).toBe(10);
  // A run that settles one more send is counted by the run after it.
  const late = { uid: 'u-late', email: 'late@cleancore-test.io' };
  expect(await claimSend(db, campaign, late)).toBe(true);
  await completeSend(db, campaign, late.uid, 'p-late');
  expect(await recordInvited(db, campaign, campaignRef())).toBe(11);
});

test.afterAll(async () => {
  const sends = await db.collection('email_sends').where('campaign', '==', campaign).get();
  await Promise.all([...sends.docs.map((d) => d.ref.delete()), campaignRef().delete()]);
});
