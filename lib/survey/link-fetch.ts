/**
 * "The link was fetched" — recorded once, by whoever got there first.
 *
 * A mail gateway opens the URL before any human sees the message, so two
 * requests for the same link at the same moment are the normal case rather
 * than the edge one. Both used to read no `linkFetchedAt`, both merge-writes
 * went through, and the stored value was the later arrival — while the field's
 * whole meaning is that it is the first (QA review of 33471220d6e9,
 * 8ccb1b1b765b).
 *
 * A separate module so the claim can be run twice at once against the emulator
 * and the winner counted, which a page component cannot be (roadmap 0.17,
 * QA finding cca300dfb572).
 */

/** The bits of the Admin SDK this needs — untyped, because `getAdminDb` hands back an untyped handle. */
export interface FirestoreLike {
  runTransaction: <T>(fn: (tx: TransactionLike) => Promise<T>) => Promise<T>;
}
export interface TransactionLike {
  get: (ref: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => unknown;
}

export interface ClaimResult {
  /** True for the caller that actually wrote the stamp. */
  claimed: boolean;
  /** The document as it was before this call, or undefined if there was none. */
  previous: Record<string, unknown> | undefined;
}

/**
 * Stamp the first fetch, in one transaction, and say whether this caller was
 * the one who did it. The transaction re-runs on a conflict, and the second
 * attempt reads the field the first one wrote — so exactly one caller claims.
 */
export async function claimLinkFetch(
  db: FirestoreLike,
  ref: unknown,
  fields: { campaign: string; uid: string; stamp: unknown },
): Promise<ClaimResult> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : undefined;
    if (previous?.linkFetchedAt) return { claimed: false, previous };
    tx.set(
      ref,
      { campaign: fields.campaign, uid: fields.uid, linkFetchedAt: fields.stamp },
      { merge: true },
    );
    return { claimed: true, previous };
  });
}
