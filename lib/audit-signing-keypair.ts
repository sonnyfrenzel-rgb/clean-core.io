import crypto, { type KeyObject } from 'crypto';

/**
 * The asymmetric half of the trust chain.
 *
 * Everything signed here was signed with HMAC-SHA256 against `AUDIT_SIGNING_KEY`,
 * and the site said "anyone can verify". HMAC is symmetric: whoever can check a
 * signature can also forge one, so the only party able to verify an audit pack
 * was the server that issued it. An auditor, a customer's security team, a
 * sceptical buyer — none of them could check anything without being handed the
 * key that would let them fake it. The claim was not true of anyone.
 *
 * Ed25519 runs **alongside** the HMAC, never instead of it. Packs already issued
 * keep verifying against the same key they were signed with; new packs carry both
 * signatures, and the public key is published at
 * `/.well-known/clean-core-io-signing.json` so the asymmetric one can be checked
 * offline, by anybody, with no secret at all.
 *
 * The private key is optional on purpose. Without `AUDIT_SIGNING_PRIVATE_KEY` the
 * routes behave exactly as they did — HMAC only, `signedEd25519: false` on the
 * manifest — so this can ship before a key exists anywhere, and the day the
 * secret is set the packs start carrying a second signature with no code change.
 *
 * Generating one:
 *
 *   node -e "const c=require('crypto');const{privateKey}=c.generateKeyPairSync('ed25519');\
 *   console.log(Buffer.from(privateKey.export({format:'pem',type:'pkcs8'})).toString('base64'))"
 *
 * Store the base64 string as `AUDIT_SIGNING_PRIVATE_KEY`. It is a signing key:
 * losing it means new packs cannot be signed asymmetrically, and leaking it means
 * anyone can issue packs that verify as genuine.
 */

export interface SigningKeypair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** Stable short id derived from the public key, so a pack names what signed it. */
  keyId: string;
}

let cached: SigningKeypair | null | undefined;

/** The raw 32 bytes of an Ed25519 public key, out of its DER SPKI wrapper. */
function rawPublicKey(publicKey: KeyObject): Buffer {
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return der.subarray(der.length - 32);
}

/**
 * Key id = the first 16 hex characters of SHA-256 over the raw public key.
 *
 * Derived rather than configured: a configured id can be wrong about which key it
 * names, and an id that is wrong about its key is worse than none. It also makes
 * rotation observable — a new key produces a new id in every pack it signs.
 */
function deriveKeyId(publicKey: KeyObject): string {
  return crypto.createHash('sha256').update(rawPublicKey(publicKey)).digest('hex').slice(0, 16);
}

function load(): SigningKeypair | null {
  if (cached !== undefined) return cached;

  const raw = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  if (!raw || raw.trim().length === 0) {
    cached = null;
    return cached;
  }

  try {
    // Accept a PEM directly, a PEM whose newlines survived as the two characters
    // \ and n (what a secret store usually hands back), or base64 of the PEM.
    const text = raw.includes('BEGIN')
      ? raw.replace(/\\n/g, '\n')
      : Buffer.from(raw, 'base64').toString('utf8');

    const privateKey = crypto.createPrivateKey(text);
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      // A working RSA key here would sign packs that the published verifier
      // cannot check, which is a worse failure than not signing at all.
      throw new Error(`expected an ed25519 key, got ${privateKey.asymmetricKeyType}`);
    }
    const publicKey = crypto.createPublicKey(privateKey);
    cached = { privateKey, publicKey, keyId: deriveKeyId(publicKey) };
  } catch (error) {
    // Never throw on import. A malformed key must degrade to HMAC-only signing,
    // not take down the routes that issue packs.
    console.error(
      'AUDIT_SIGNING_PRIVATE_KEY is set but unusable — packs will carry the HMAC signature only.',
      error instanceof Error ? error.message : String(error),
    );
    cached = null;
  }
  return cached;
}

/** The keypair, or null when none is configured. Callers must handle null. */
export function getSigningKeypair(): SigningKeypair | null {
  return load();
}

/** Base64 Ed25519 signature over `message`, or null when no key is configured. */
export function signEd25519(message: string): { signature: string; keyId: string } | null {
  const pair = load();
  if (!pair) return null;
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), pair.privateKey);
  return { signature: signature.toString('base64'), keyId: pair.keyId };
}

/**
 * Verify a base64 Ed25519 signature against a public key.
 *
 * Takes the public key as an argument rather than reading the environment: this
 * is the function an offline verifier runs with the *published* key, and it must
 * not silently succeed by falling back to a key the caller does not have.
 */
export function verifyEd25519(message: string, signatureB64: string, publicKey: KeyObject): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(message, 'utf8'),
      publicKey,
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}

/** Parse a published raw base64 public key back into a usable key object. */
export function publicKeyFromBase64(rawB64: string): KeyObject | null {
  try {
    const raw = Buffer.from(rawB64, 'base64');
    if (raw.length !== 32) return null;
    // Rebuild the DER SPKI wrapper Ed25519 keys use: the prefix is fixed.
    const der = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      raw,
    ]);
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/** What `/.well-known/clean-core-io-signing.json` publishes. Null without a key. */
export function getPublishedPublicKey(): {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: string;
  publicKeyPem: string;
} | null {
  const pair = load();
  if (!pair) return null;
  return {
    keyId: pair.keyId,
    algorithm: 'Ed25519',
    publicKey: rawPublicKey(pair.publicKey).toString('base64'),
    publicKeyPem: (pair.publicKey.export({ format: 'pem', type: 'spki' }) as string).trim(),
  };
}

/** Test seam: forget the cached key so a changed environment is picked up. */
export function resetSigningKeypairCache(): void {
  cached = undefined;
}
