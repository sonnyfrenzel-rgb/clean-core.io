import crypto from 'crypto';

/**
 * The key a customer's own model key is sealed with — its own, and versioned.
 *
 * Roadmap 3.0.13 (g). A stored BYOK key used to be encrypted with
 * `S4_ENCRYPTION_KEY`, the key every stored S/4 credential is encrypted with,
 * and the record did not say which key sealed it. Two consequences: one secret
 * guarded two unrelated kinds of customer secret, so a leak of either use
 * exposed both; and the key could not be rotated at all — rotating it would
 * have made every stored credential and every stored model key unreadable at
 * once, with nothing in the records to tell old from new.
 *
 * Now:
 *
 *   - **Own secret.** `BYOK_ENCRYPTION_KEY`, 32 bytes, base64 — the same shape
 *     as `S4_ENCRYPTION_KEY`, and generated the same way
 *     (`openssl rand -base64 32`).
 *   - **Version in the record.** Every record carries `keyVersion`, and only a
 *     version in `KEY_RING` is ever opened.
 *   - **No legacy path.** Records sealed with the S/4 key before 3.0.13 had no
 *     version, and there was a read path for them plus a re-key script. A dry
 *     run against both databases on 30.09.2026 found no stored model key at all,
 *     so both went (owner decision): a record without a version, or with one
 *     outside the key ring, is unreadable (`ByokKeyUnreadableError`, logged with
 *     its reason) and is never handed to the S/4 key. This module does not
 *     import `lib/s4-credentials.ts`, and `tests/byok-hardening.spec.ts` holds
 *     that.
 *   - **No fallback.** Without a usable `BYOK_ENCRYPTION_KEY` a save is refused
 *     with a reason (`ByokKeyUnavailableError`), not quietly sealed with the S/4
 *     key again — that would be the very mixing this module ends, done silently
 *     by a missing environment variable. `/api/health` reports the deployment
 *     degraded, the way it does for a missing signing key
 *     (`lib/audit-signing-key.ts`).
 *   - **Bound to its place.** The version, the account and the provider are the
 *     GCM additional data, so a sealed key copied onto another account's
 *     record, or a record whose version field was edited, does not decrypt.
 *
 * Rotating later means: add the next version to `KEY_RING` with its own
 * variable, raise `BYOK_KEY_VERSION`, deploy, run the re-key script, and only
 * then retire the old variable.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** What every new record is sealed with. */
export const BYOK_KEY_VERSION = 1;

/** Where each readable version's key lives. Nothing outside this ring is opened. */
const KEY_RING: Readonly<Record<number, string>> = {
  1: 'BYOK_ENCRYPTION_KEY',
};

export const BYOK_KEY_UNAVAILABLE_CODE = 'byok-key-unavailable';
export const BYOK_KEY_UNREADABLE_CODE = 'byok-key-unreadable';

/** A save refused because this deployment has no usable key to seal with. */
export class ByokKeyUnavailableError extends Error {
  readonly code = BYOK_KEY_UNAVAILABLE_CODE;
  constructor() {
    super(
      `Your key was not stored: this server is not set up to store keys right now (${BYOK_KEY_UNAVAILABLE_CODE}). ` +
        'Nothing was saved. Please try again later or contact support.',
    );
    this.name = 'ByokKeyUnavailableError';
  }
}

/**
 * Why a stored record could not be opened — for the log, never for the caller:
 *
 *   - `unversioned`: the record has no `keyVersion` (the pre-3.0.13 shape,
 *     sealed with the S/4 key; no longer read).
 *   - `unknown-version`: a version outside `KEY_RING`.
 *   - `key-missing`: the version's key is not set, or not 32 bytes, here.
 *   - `decrypt-failed`: the record does not open under the version's key.
 */
export type ByokUnreadableReason = 'unversioned' | 'unknown-version' | 'key-missing' | 'decrypt-failed';

/**
 * A stored key that cannot be opened. Thrown, not answered with `null`: `null`
 * means "no key stored", and a caller that read it that way would quietly
 * spend the community key on an account that brought its own.
 */
export class ByokKeyUnreadableError extends Error {
  readonly code = BYOK_KEY_UNREADABLE_CODE;
  constructor(
    readonly keyVersion: number | null,
    readonly reason: ByokUnreadableReason,
  ) {
    super(
      `Your saved key could not be read on this server (${BYOK_KEY_UNREADABLE_CODE}). Nothing was sent to a model. ` +
        'Save your key again in Settings, or contact support if this persists.',
    );
    this.name = 'ByokKeyUnreadableError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** The key for one version, or `null` when it is not set or not 32 bytes. */
export function byokKeyFor(version: number, env: Env = process.env): Buffer | null {
  const name = KEY_RING[version];
  if (!name) return null;
  const b64 = env[name]?.trim();
  if (!b64) return null;
  const key = Buffer.from(b64, 'base64');
  return key.length === 32 ? key : null;
}

/** Whether this deployment can seal new keys. Read by `/api/health`. */
export function byokEncryptionConfigured(env: Env = process.env): boolean {
  return byokKeyFor(BYOK_KEY_VERSION, env) !== null;
}

function aad(version: number, where: { uid: string; provider: string }): Buffer {
  return Buffer.from(`clean-core.io/byok/v${version}\n${where.uid}\n${where.provider}`, 'utf8');
}

export interface SealedByokSecret {
  encryptedApiKey: string;
  keyVersion: number;
}

/** Seal a key for storage — with the current version's key, and only with it. */
export function sealByokSecret(
  plaintext: string,
  where: { uid: string; provider: string },
  env: Env = process.env,
): SealedByokSecret {
  const key = byokKeyFor(BYOK_KEY_VERSION, env);
  if (!key) throw new ByokKeyUnavailableError();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad(BYOK_KEY_VERSION, where));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // Layout as in lib/s4-credentials.ts: iv(12) | tag(16) | ciphertext.
  return {
    encryptedApiKey: Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64'),
    keyVersion: BYOK_KEY_VERSION,
  };
}

/**
 * Open a stored record sealed with a version in the key ring. Throws
 * `ByokKeyUnreadableError` with the reason, never returns a guess — and never
 * tries any other key, the S/4 key least of all.
 */
export function openByokSecret(
  record: { encryptedApiKey: string; keyVersion?: unknown },
  where: { uid: string; provider: string },
  env: Env = process.env,
): string {
  if (record.keyVersion === undefined || record.keyVersion === null) {
    throw new ByokKeyUnreadableError(null, 'unversioned');
  }
  const version = record.keyVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || !Object.hasOwn(KEY_RING, version)) {
    throw new ByokKeyUnreadableError(typeof version === 'number' && Number.isInteger(version) ? version : null, 'unknown-version');
  }
  const key = byokKeyFor(version, env);
  if (!key) throw new ByokKeyUnreadableError(version, 'key-missing');
  try {
    const raw = Buffer.from(record.encryptedApiKey, 'base64');
    if (raw.length < IV_LENGTH + TAG_LENGTH + 1) throw new Error('short');
    const decipher = crypto.createDecipheriv(ALGO, key, raw.subarray(0, IV_LENGTH), { authTagLength: TAG_LENGTH });
    decipher.setAAD(aad(version, where));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
  } catch {
    throw new ByokKeyUnreadableError(version, 'decrypt-failed');
  }
}
