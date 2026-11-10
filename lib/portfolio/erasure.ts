import type { FieldValue, Firestore } from 'firebase-admin/firestore';

/**
 * What the portfolio holds of an account, erased with it — roadmap 3.0.21 and
 * Art. 17 GDPR (`deleteUserDataAndAccount` in `lib/firebase-admin.ts`).
 *
 *   - the account's batches, with every queued source still in them;
 *   - the account's named selections, with their invitations;
 *   - the account's uid in `readers` of selections other owners shared with it,
 *     and its entry in their `readerScopes`.
 *
 * Invitations *addressed to* the account in other owners' selections are
 * already taken by the erasure's collection-group sweep of `invitations` by
 * address, which reads every subcollection of that name — the portfolio's
 * included (`lib/portfolio/selection-invitations.ts` stores the address the
 * same normalised way). The projects a batch made are projects and go with the
 * erasure's project sweep.
 *
 * No import of `lib/firebase-admin.ts`, which calls this: the handles are
 * passed in.
 */
export async function erasePortfolioOf(db: Firestore, fieldValue: typeof FieldValue, uid: string): Promise<void> {
  for (const [collection, owner] of [
    ['portfolio_batches', 'userId'],
    ['portfolio_selections', 'ownerId'],
  ] as const) {
    const q = db.collection(collection).where(owner, '==', uid).limit(200);
    let snapshot = await q.get();
    while (snapshot.size > 0) {
      for (const doc of snapshot.docs) await db.recursiveDelete(doc.ref);
      snapshot = await q.get();
    }
  }
  const shared = db.collection('portfolio_selections').where('readers', 'array-contains', uid).limit(400);
  let snapshot = await shared.get();
  while (snapshot.size > 0) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      // The account's scope goes with its uid (`readerScopes`, lib/portfolio/selection-store.ts).
      const stored = (doc.data() || {}).readerScopes;
      const readerScopes = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, unknown>) } : {};
      delete readerScopes[uid];
      batch.update(doc.ref, { readers: fieldValue.arrayRemove(uid), readerScopes });
    });
    await batch.commit();
    snapshot = await shared.get();
  }
}
