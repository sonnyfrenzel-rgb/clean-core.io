import crypto from 'crypto';
import type { ModelReceipt } from './model-receipt';
import { canonicalizeJson } from './run-signature';

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
 * `model_receipt_uses/{jti}` holds the project id, the artefact name, the digest
 * of what was stored and two times — no account and no content — and carries `expiresAt` (a day after the
 * receipt's own validity ends) for a Firestore TTL policy.
 */

export const MODEL_RECEIPT_USES_COLLECTION = 'model_receipt_uses';

export interface ReceiptUseBinding {
  projectId: string;
  /** The artefact the receipt marks, e.g. `test-suite` or `transformation`. */
  artefact: string;
  /**
   * SHA-256 of what is stored under the receipt, lowercase hex. A repeat is a retry only when it stores the same
   * bytes: changed content under an earlier receipt is no longer that model's answer, and is stored as "provider
   * and model not recorded". A use recorded before this field existed is compared by project and artefact alone.
   */
  contentSha256?: string;
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

/** The digest of a store request's content: every field but the receipt itself, in canonical key order. */
export function artefactContentDigest(fields: Record<string, unknown>): string {
  const rest: Record<string, unknown> = { ...fields };
  delete rest.modelReceipt;
  return crypto.createHash('sha256').update(canonicalizeJson(rest), 'utf8').digest('hex');
}

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
      if (d.projectId !== binding.projectId || d.artefact !== binding.artefact) return false;
      return typeof d.contentSha256 !== 'string' || d.contentSha256 === binding.contentSha256;
    }
    tx.create(ref, {
      projectId: binding.projectId,
      artefact: binding.artefact,
      ...(typeof binding.contentSha256 === 'string' ? { contentSha256: binding.contentSha256 } : {}),
      usedAt: now.toISOString(),
      expiresAt: new Date(receipt.iat + 2 * DAY_MS),
    });
    return true;
  });
}
