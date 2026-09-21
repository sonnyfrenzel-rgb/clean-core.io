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

export interface PublishedKey {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: string;
  publicKeyPem: string;
  /** `active` signs new packs; `retired` only verifies packs it signed before. */
  status: 'active' | 'retired';
}

function describe(publicKey: KeyObject, status: 'active' | 'retired'): PublishedKey {
  return {
    keyId: deriveKeyId(publicKey),
    algorithm: 'Ed25519',
    publicKey: rawPublicKey(publicKey).toString('base64'),
    publicKeyPem: (publicKey.export({ format: 'pem', type: 'spki' }) as string).trim(),
    status,
  };
}

/** The key that signs new packs. Null without one. */
export function getPublishedPublicKey(): Omit<PublishedKey, 'status'> | null {
  const pair = load();
  if (!pair) return null;
  const entry = describe(pair.publicKey, 'active');
  return { keyId: entry.keyId, algorithm: entry.algorithm, publicKey: entry.publicKey, publicKeyPem: entry.publicKeyPem };
}

/**
 * Every key a verifier may need: the active one, and the public halves of the
 * keys that signed packs before it.
 *
 * **Why retired keys have to stay published.** A signature is only as good as
 * the ability to find the key that made it. `/.well-known/…` published exactly
 * one key — the current one — so the first rotation would have turned every pack
 * ever issued into an archive nobody could check: the signature is still valid,
 * and there is no key to check it against. Silently, too. The verifier would not
 * report a forgery, it would report "does not verify", which reads to an auditor
 * like the worst possible answer for a document that is in fact genuine.
 *
 * **What publishing an old public key gives an attacker.** By itself: nothing it
 * did not already have. An Ed25519 *public* key is public — it was served from
 * this endpoint every day it was active, and anyone who cared kept a copy. It
 * does not help forge a signature, and it does not reveal anything about the
 * private half.
 *
 * What it does change is the meaning of rotation. Rotating away from a
 * **compromised** key no longer ends that key's power, because a verifier still
 * accepts packs naming it. So revocation is not rotation: a compromised key is
 * **removed from `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`**, at which point every pack
 * it signed stops verifying — which is the honest outcome, since nobody can tell
 * that key's genuine packs from the forged ones any more. The list is therefore
 * "keys we still vouch for", not "keys we once used", and it is an operator's
 * decision either way. Set from the environment rather than derived, for the same
 * reason: the runtime cannot know whether a key it no longer holds was retired
 * or stolen.
 *
 * Format: `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED` holds one or more **public** keys,
 * separated by commas or newlines, each either raw base64 (32 bytes) or a PEM
 * (with real newlines or the two characters \ and n). A private key here would
 * be a mistake; only the public half is read, and anything unparseable is
 * dropped with a line in the log rather than taking the endpoint down.
 */
export function getPublishedKeyring(): PublishedKey[] {
  const out: PublishedKey[] = [];
  const seen = new Set<string>();

  const pair = load();
  if (pair) {
    const active = describe(pair.publicKey, 'active');
    out.push(active);
    seen.add(active.keyId);
  }

  const raw = process.env.AUDIT_SIGNING_PUBLIC_KEYS_RETIRED;
  if (raw && raw.trim()) {
    for (const piece of retiredKeyEntries(raw)) {
      const key = parsePublicKey(piece);
      if (!key) {
        console.error('AUDIT_SIGNING_PUBLIC_KEYS_RETIRED contains an entry that is not an Ed25519 public key — skipped.');
        continue;
      }
      const entry = describe(key, 'retired');
      // The active key cannot also be retired, and a duplicate would publish the
      // same key twice with two statuses — a verifier would then have to guess.
      if (seen.has(entry.keyId)) continue;
      seen.add(entry.keyId);
      out.push(entry);
    }
  }

  return out;
}

/**
 * The entries of `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`, with PEM blocks kept whole.
 *
 * The separators are commas and newlines, and a PEM is several lines — so a
 * plain split hands the parser `-----BEGIN PUBLIC KEY-----` on its own, then the
 * base64 line, then the end line, rejects all three, and publishes no retired
 * key at all. The documented format (see the comment on `getPublishedKeyring`)
 * then silently loses every pack signed before the rotation, which is exactly
 * what retiring a key is supposed to prevent. Blocks are lifted out first and
 * only what is left of the value is split, so the order the operator wrote is
 * the order the keyring carries.
 */
function retiredKeyEntries(raw: string): string[] {
  // The escaped form a secret store usually hands back, first, so one block
  // pattern covers both shapes.
  const text = raw.replace(/\\n/g, '\n');
  const block = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
  const pieces: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = block.exec(text)) !== null) {
    pieces.push(...text.slice(cursor, match.index).split(/[,\n]+/));
    pieces.push(match[0]);
    cursor = match.index + match[0].length;
  }
  pieces.push(...text.slice(cursor).split(/[,\n]+/));
  return pieces.map((s) => s.trim()).filter(Boolean);
}

/** A published key in any of the shapes an operator is likely to paste. */
function parsePublicKey(text: string): KeyObject | null {
  try {
    if (text.includes('BEGIN')) {
      const key = crypto.createPublicKey(text.replace(/\\n/g, '\n'));
      return key.asymmetricKeyType === 'ed25519' ? key : null;
    }
    return publicKeyFromBase64(text);
  } catch {
    return null;
  }
}

/** Test seam: forget the cached key so a changed environment is picked up. */
export function resetSigningKeypairCache(): void {
  cached = undefined;
}
