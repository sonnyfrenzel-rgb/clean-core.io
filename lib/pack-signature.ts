import crypto from 'crypto';
import { purposeKey, timingSafeEqualHex } from './run-signature';

/**
 * The HMAC of an audit-pack manifest (CA-INT-03).
 *
 * Packs issued from roadmap 3.0.21 on are signed under a key derived from
 * `AUDIT_SIGNING_KEY` for manifests alone (`purposeKey`, HKDF-SHA256); runs
 * have a derived key of their own (`lib/run-signature.ts`). Before, both were
 * HMAC-SHA256 under the same key over a SHA-256 hex string, so one could be
 * presented as the other.
 *
 * Packs issued before keep verifying: `manifestHmacValid` also accepts the
 * legacy form. That is safe only together with the other half of the fix —
 * `/api/export/verify` checks a signature only over a string that parses as a
 * canonical manifest (`parseCanonicalManifest`), and no legacy signature over
 * anything else (a run hash) can be presented over such a string.
 *
 * The Ed25519 signature is unaffected: its key signs manifests and nothing else.
 */
export function signManifestHash(manifestHash: string, key: string): string {
  return crypto.createHmac('sha256', purposeKey(key, 'pack-manifest')).update(manifestHash).digest('hex');
}

/** The legacy pack form — HMAC under the signing key itself. Read, never written. */
function legacyManifestSignature(manifestHash: string, key: string): string {
  return crypto.createHmac('sha256', key).update(manifestHash).digest('hex');
}

/**
 * Does `signature` sign `manifestHash` as a pack manifest? Both forms are
 * computed and compared in constant time, so the answer does not reveal which
 * form a pack carries.
 */
export function manifestHmacValid(manifestHash: string, signature: string, key: string): boolean {
  const v2 = timingSafeEqualHex(signManifestHash(manifestHash, key), signature);
  const legacy = timingSafeEqualHex(legacyManifestSignature(manifestHash, key), signature);
  return v2 || legacy;
}
