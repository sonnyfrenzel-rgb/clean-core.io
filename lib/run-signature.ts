import crypto from 'crypto';

/**
 * The one place that knows how a Run is hashed and signed.
 *
 * `runs/create` produced the signature and `audit-pack/create` consumed it, and
 * nothing in between ever checked it: the pack route confirmed that `runHash`
 * was present and then signed a manifest attesting to it. A run document altered
 * after the fact — through an Admin SDK script, an operational repair, a
 * compromised path — came back out as a validly signed audit pack over the
 * altered content, which is exactly the thing the signature exists to make
 * impossible.
 *
 * Verification has to reconstruct the payload the same way the producer built
 * it, so the canonicaliser lives here rather than being copied into the second
 * route. Two implementations of "canonical" drift, and a verification that
 * drifts is a verification that passes.
 */

/** Stable canonical JSON: keys sorted, no incidental whitespace. */
export function canonicalizeJson(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ':' + canonicalizeJson(obj[key]));
  return '{' + parts.join(',') + '}';
}

/**
 * Fields that are not part of what was signed.
 *
 * `analysis` is the model narrative and is deliberately outside the hash — it is
 * free text and cannot carry an evidence guarantee. `runHash` and `signature`
 * are the outputs themselves.
 */
const UNSIGNED_FIELDS = ['runHash', 'signature', 'analysis'] as const;

export function computeRunHash(unsignedRunPayload: unknown): string {
  return crypto.createHash('sha256').update(canonicalizeJson(unsignedRunPayload)).digest('hex');
}

/**
 * The legacy run signature: HMAC-SHA256 under `AUDIT_SIGNING_KEY` itself.
 *
 * Every run signed before roadmap 3.0.21 carries this form and keeps verifying
 * with it. No new run is signed with it: the same key and the same
 * construction were used for audit-pack manifests, so one signature could be
 * presented as the other. New runs carry `signatureScheme` (below) and are
 * signed under a key derived for runs alone.
 */
export function signRunHash(runHash: string, key: string): string {
  return crypto.createHmac('sha256', key).update(runHash).digest('hex');
}

/**
 * The signature scheme of runs signed from roadmap 3.0.21 on (CA-INT-03).
 *
 * It is a field of the signed payload, not beside it: removing it or changing
 * it changes the run hash, so a run cannot be moved back to the legacy form
 * without the key. A run without the field is a run signed before it existed
 * and verifies with the legacy form, byte for byte as it was sealed.
 */
export const RUN_SIGNATURE_SCHEME = 'hmac-sha256+hkdf/run/v2';

/**
 * A key derived from `AUDIT_SIGNING_KEY` for one purpose (HKDF-SHA256, as
 * `lib/s4-proxy-capability.ts` derives its capability key). Two purposes never
 * share a key, so a signature made for one cannot verify as the other.
 */
export function purposeKey(key: string, purpose: 'run-signature' | 'pack-manifest'): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(key, 'utf8'), Buffer.alloc(0), `clean-core.io/${purpose}/v2`, 32));
}

/** The signature of a run carrying `signatureScheme: RUN_SIGNATURE_SCHEME`. */
export function signRunHashV2(runHash: string, key: string): string {
  return crypto.createHmac('sha256', purposeKey(key, 'run-signature')).update(runHash).digest('hex');
}

/**
 * The signature a stored run should carry, by the scheme it was sealed with;
 * null for a scheme this code does not know (refused, never guessed).
 */
export function expectedRunSignature(runData: Record<string, unknown>, key: string): string | null {
  const scheme = runData.signatureScheme;
  if (typeof runData.runHash !== 'string') return null;
  if (scheme === undefined) return signRunHash(runData.runHash, key);
  if (scheme === RUN_SIGNATURE_SCHEME) return signRunHashV2(runData.runHash, key);
  return null;
}

/**
 * The hash a stored run document should carry, recomputed from its own content.
 *
 * Exported so a caller that has no signing key can still prove the document was
 * not altered — the migration verifier does exactly that, and comparing the
 * stored `runHash` of source and target only proves the field was copied, not
 * that the content behind it still matches. `verifyRunIntegrity` below uses this
 * and then checks the HMAC on top, so the two can never drift.
 */
export function recomputeStoredRunHash(runData: Record<string, unknown>): string {
  const unsigned: Record<string, unknown> = { ...runData };
  for (const f of UNSIGNED_FIELDS) delete unsigned[f];
  return computeRunHash(unsigned);
}

/**
 * Constant-time compare that does not leak length through an exception.
 *
 * Exported because `lib/model-receipt.ts` compares a MAC the same way, and a
 * second copy of "compare two hex digests" is a second chance to write `===`.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface RunIntegrityResult {
  valid: boolean;
  /** Which check failed, for the log — never for the caller's error message. */
  reason?: 'missing-fields' | 'hash-mismatch' | 'signature-mismatch' | 'unknown-scheme';
}

/**
 * Recomputes the hash over the stored run and verifies its HMAC.
 *
 * Returns rather than throws, so the caller decides what a failure means: for an
 * audit pack it must mean refusal, because signing a pack over an unverified run
 * launders the alteration into something that looks authentic.
 */
export function verifyRunIntegrity(runData: Record<string, any>, key: string): RunIntegrityResult {
  if (!runData || typeof runData.runHash !== 'string' || typeof runData.signature !== 'string') {
    return { valid: false, reason: 'missing-fields' };
  }

  const recomputed = recomputeStoredRunHash(runData);
  if (!timingSafeEqualHex(recomputed, runData.runHash)) {
    return { valid: false, reason: 'hash-mismatch' };
  }
  const expected = expectedRunSignature(runData, key);
  if (expected === null) return { valid: false, reason: 'unknown-scheme' };
  if (!timingSafeEqualHex(expected, runData.signature)) {
    return { valid: false, reason: 'signature-mismatch' };
  }
  return { valid: true };
}
