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

export function signRunHash(runHash: string, key: string): string {
  return crypto.createHmac('sha256', key).update(runHash).digest('hex');
}

/** Constant-time compare that does not leak length through an exception. */
function timingSafeEqualHex(a: string, b: string): boolean {
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
  reason?: 'missing-fields' | 'hash-mismatch' | 'signature-mismatch';
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

  const unsigned: Record<string, any> = { ...runData };
  for (const f of UNSIGNED_FIELDS) delete unsigned[f];

  const recomputed = computeRunHash(unsigned);
  if (!timingSafeEqualHex(recomputed, runData.runHash)) {
    return { valid: false, reason: 'hash-mismatch' };
  }
  if (!timingSafeEqualHex(signRunHash(runData.runHash, key), runData.signature)) {
    return { valid: false, reason: 'signature-mismatch' };
  }
  return { valid: true };
}
