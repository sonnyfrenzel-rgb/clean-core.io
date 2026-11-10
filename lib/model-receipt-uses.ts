import type { ModelReceipt } from './model-receipt';

/**
 * One receipt, one artefact (roadmap 3.0.21, CA-INT-02).
 *
 * The stores that check a model receipt without its text
 * (`verifyModelReceiptIssuer`: the engine-led transformation, the
 * documentation, business layer and test suite) accept a receipt for a day,
 * because the artefact they store is assembled from many answers. Without more,
 * one cheap receipt could mark every artefact its account stored that day as
 * written by that model. So the first store to accept a receipt records its id
 * here, bound to the project and the artefact it marked; the same receipt is
 * accepted again only for that same project and artefact (a retried store),
 * never for another.
 *
 * A receipt without an id (issued before 3.0.21) is not accepted by these
 * stores: the artefact is then stored as "provider and model not recorded",
 * which is what those stores already do with any receipt they cannot verify.
 *
 * `model_receipt_uses/{jti}` holds the project id, the artefact name and two
 * times — no account and no content — and carries `expiresAt` (a day after the
 * receipt's own validity ends) for a Firestore TTL policy.
 */

export const MODEL_RECEIPT_USES_COLLECTION = 'model_receipt_uses';

export interface ReceiptUseBinding {
  projectId: string;
  /** The artefact the receipt marks, e.g. `test-suite` or `transformation`. */
  artefact: string;
}

/** The minimal Firestore surface this needs, so a test can hand in a stand-in. */
export interface ReceiptUseStore {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    create(ref: unknown, data: Record<string, unknown>): unknown;
  }) => Promise<T>): Promise<T>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Record the receipt's first use for `binding`, or confirm a repeat of it.
 * False — the receipt marks nothing here — when it has no id or was used for
 * another project or artefact.
 */
export async function claimReceiptUse(
  db: ReceiptUseStore,
  receipt: Pick<ModelReceipt, 'jti' | 'iat'>,
  binding: ReceiptUseBinding,
  now: Date = new Date(),
): Promise<boolean> {
  const jti = receipt.jti;
  if (typeof jti !== 'string' || !/^[0-9a-f]{32}$/.test(jti)) return false;
  const ref = db.collection(MODEL_RECEIPT_USES_COLLECTION).doc(jti);
  return db.runTransaction(async (tx) => {
    const seen = await tx.get(ref);
    if (seen.exists) {
      const d = seen.data() || {};
      return d.projectId === binding.projectId && d.artefact === binding.artefact;
    }
    tx.create(ref, {
      projectId: binding.projectId,
      artefact: binding.artefact,
      usedAt: now.toISOString(),
      expiresAt: new Date(receipt.iat + 2 * DAY_MS),
    });
    return true;
  });
}
