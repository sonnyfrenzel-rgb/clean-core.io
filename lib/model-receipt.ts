import crypto from 'crypto';
import { canonicalizeJson, timingSafeEqualHex } from './run-signature';

/**
 * The server's own record that it called a model — and what it got back.
 *
 * `/api/runs/create` used to decide the question like this:
 *
 *     const modelParticipation = finalAnalysisText.trim().length > 0 ? 'narrative' : 'none';
 *
 * The narrative arrives in the request body. So a caller who posted any text at
 * all got a **signed** run recording `model: { provider: 'google-gemini',
 * modelId: … }` and an `aiNarrativeMeta` naming the same pair — a provider and a
 * model the server never saw being used. The `none` direction was sound (no
 * text, certainly no model narrative); only the positive direction overstated,
 * and it overstated inside a signature, which is the worst place for a claim
 * nobody checked. The audit pack's model card said so in a "Narrative origin"
 * row, and documenting a claim is not the same as making it true.
 *
 * A receipt turns it into an observation. `/api/gemini` is the only path from
 * this product to a model; it is the only place that knows a call happened, who
 * it was made for, which model served it and what came back. It mints a receipt
 * over exactly those facts and hands it to the caller with the text.
 * `/api/runs/create` verifies the receipt against the narrative it was given and
 * records a provider and a model id **only** when it does.
 *
 * What each claim is here for — none of them is decoration:
 *
 *   - `uid` — binds the receipt to one account. Without it a receipt is
 *     bearer paper: anyone who obtained one could attach it to their own run
 *     and have the chain name a model that ran on someone else's key.
 *   - `textSha256` — binds the receipt to *this* text. Without it the receipt
 *     degenerates into "I once called a model", attachable to any narrative,
 *     which is a rubber stamp rather than a signature.
 *   - `modelId` and `provider` — what the run is allowed to record. Taken from
 *     the call the server actually made, never from what the client says it
 *     asked for.
 *   - `byok` — whose key served the call. The run used to read this from the
 *     account profile at run time, which answers a different question ("is BYOK
 *     configured *now*") from the one the model card prints ("whose key paid for
 *     this").
 *   - `iat` — when it was issued, so a receipt cannot be produced once and
 *     reused indefinitely. See `MODEL_RECEIPT_MAX_AGE_MS`.
 *   - `v` — the format. Inside the MAC, so a future version cannot be
 *     downgraded into this one by editing a field.
 *
 * **One key, not a second secret.** The MAC is keyed with `AUDIT_SIGNING_KEY`,
 * read through `lib/audit-signing-key.ts` exactly as the run signature reads it —
 * a second secret would be a second thing to rotate, a second thing to forget in
 * an environment, and a second way to sign. It is domain-separated
 * (`RECEIPT_DOMAIN`) so a receipt MAC and a run signature can never be mistaken
 * for one another: a run signature is an HMAC over 64 hex characters, this one
 * is an HMAC over a string that begins with a label and can never be that.
 *
 * **What a verified receipt does and does not prove.** It proves that this
 * server called this model for this account and returned this exact text within
 * the window. It does not prove the account then *used* that text, and it is
 * not stored on the run: what the run carries is the server's attestation,
 * inside the run signature, that it checked one. A reader who trusts the
 * signing key trusts that; a reader who does not trusts nothing on the run
 * anyway. The claim that changed is "the client said a model wrote this" →
 * "the server saw a model write this".
 */

/** The only provider this product calls. Named once so the two routes cannot drift. */
export const MODEL_PROVIDER_ID = 'google-gemini';

/** Bumped only when the claim set or the canonical form changes. */
export const MODEL_RECEIPT_VERSION = 1;

/**
 * How long a receipt stays good for: **ten minutes**.
 *
 * The real gap between the two requests is seconds — the browser receives the
 * text, hashes the source, parses the narrative and posts the run. Ten minutes
 * is not that number; it is the number that survives the ways the second
 * request legitimately comes late: a quota or `source-moved` refusal the reader
 * has to read before retrying, a flaky network, a laptop that slept for a
 * moment between the two calls. Below about a minute those retries would start
 * producing runs whose origin says "not established" for no reason a reader
 * could understand, and a run must never be *worse* off for having retried.
 *
 * It is not longer because "the server observed this generation" is a statement
 * about a moment. A tab left open for an hour and then submitted is a different
 * claim, and the honest thing for it to say is that the origin was not
 * established. The window also bounds what a leaked receipt is worth — though
 * that is nearly nothing already, since a receipt is usable only by the account
 * it was issued to and only for the exact text it was issued over.
 */
export const MODEL_RECEIPT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * How far in the future an `iat` may sit before it is refused.
 *
 * Both requests are served by the same deployment, but not necessarily by the
 * same instance, and two Cloud Run instances do not share a clock to the
 * millisecond. A minute absorbs that without giving anyone room to mint a
 * receipt that outlives the window.
 */
export const MODEL_RECEIPT_MAX_SKEW_MS = 60 * 1000;

/** Domain separation — see the module header. */
const RECEIPT_DOMAIN = 'clean-core.io/model-receipt/v1';

export interface ModelReceiptClaims {
  v: number;
  /** The account `/api/gemini` served. */
  uid: string;
  /** SHA-256 of the exact text the route returned, lowercase hex. */
  textSha256: string;
  provider: string;
  /** The model id actually passed to the provider, not the one that was asked for. */
  modelId: string;
  /** True when the account's own key served the call. */
  byok: boolean;
  /** Issued at, milliseconds since the epoch. */
  iat: number;
}

export interface ModelReceipt extends ModelReceiptClaims {
  /** HMAC-SHA256 over the domain label and the canonical claims, keyed with `AUDIT_SIGNING_KEY`. */
  mac: string;
}

/** SHA-256 of a narrative's UTF-8 bytes, lowercase hex. */
export function narrativeDigest(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function macOf(claims: ModelReceiptClaims, key: string): string {
  return crypto
    .createHmac('sha256', key)
    .update(`${RECEIPT_DOMAIN}\n${canonicalizeJson(claims)}`)
    .digest('hex');
}

export function issueModelReceipt(
  args: {
    uid: string;
    /** The text as returned to the caller, byte for byte. */
    text: string;
    provider?: string;
    modelId: string;
    byok: boolean;
    /** Only for tests that need a fixed clock. */
    issuedAt?: number;
  },
  key: string,
): ModelReceipt {
  const claims: ModelReceiptClaims = {
    v: MODEL_RECEIPT_VERSION,
    uid: args.uid,
    textSha256: narrativeDigest(args.text),
    provider: args.provider ?? MODEL_PROVIDER_ID,
    modelId: args.modelId,
    byok: args.byok,
    iat: args.issuedAt ?? Date.now(),
  };
  return { ...claims, mac: macOf(claims, key) };
}

/** Why a receipt did not establish the narrative's origin. For the log, and for a test to name. */
export type ModelReceiptRefusal =
  /** None was sent — an older client, a retry that lost it, or the zero-model path. */
  | 'absent'
  | 'malformed'
  | 'unsupported-version'
  /** The MAC does not verify under this deployment's signing key. */
  | 'forged'
  /** Issued for a different account. */
  | 'wrong-account'
  /** Issued over different text than the narrative in this request. */
  | 'text-mismatch'
  | 'expired'
  | 'issued-in-the-future';

export type ModelReceiptVerdict =
  | { ok: true; receipt: ModelReceipt }
  | { ok: false; refusal: ModelReceiptRefusal };

/**
 * Verify a receipt against the narrative it is supposed to belong to.
 *
 * Returns rather than throws, and never throws on input: a missing or malformed
 * receipt is an ordinary outcome, not an error. A run is never refused for one —
 * the run is created either way and the model fields say which it was.
 *
 * The MAC is checked before any claim is compared, so nothing an attacker wrote
 * is acted upon — not even to choose an error message — until the deployment's
 * own key has vouched for it.
 */
export function verifyModelReceipt(
  candidate: unknown,
  opts: { uid: string; text: string; key: string; now?: number },
): ModelReceiptVerdict {
  if (candidate === null || candidate === undefined) return { ok: false, refusal: 'absent' };
  if (typeof candidate !== 'object' || Array.isArray(candidate)) return { ok: false, refusal: 'malformed' };

  const r = candidate as Record<string, unknown>;
  if (
    typeof r.uid !== 'string' ||
    typeof r.textSha256 !== 'string' ||
    typeof r.provider !== 'string' ||
    typeof r.modelId !== 'string' ||
    typeof r.byok !== 'boolean' ||
    typeof r.iat !== 'number' ||
    !Number.isFinite(r.iat) ||
    typeof r.mac !== 'string'
  ) {
    return { ok: false, refusal: 'malformed' };
  }
  if (r.v !== MODEL_RECEIPT_VERSION) return { ok: false, refusal: 'unsupported-version' };

  // Rebuilt rather than spread: a receipt carrying extra keys cannot smuggle
  // them past the MAC, because the MAC is taken over exactly these seven.
  const claims: ModelReceiptClaims = {
    v: MODEL_RECEIPT_VERSION,
    uid: r.uid,
    textSha256: r.textSha256,
    provider: r.provider,
    modelId: r.modelId,
    byok: r.byok,
    iat: r.iat,
  };

  if (!timingSafeEqualHex(macOf(claims, opts.key), r.mac)) return { ok: false, refusal: 'forged' };
  if (claims.uid !== opts.uid) return { ok: false, refusal: 'wrong-account' };
  if (!timingSafeEqualHex(claims.textSha256, narrativeDigest(opts.text))) {
    return { ok: false, refusal: 'text-mismatch' };
  }

  const now = opts.now ?? Date.now();
  if (claims.iat - now > MODEL_RECEIPT_MAX_SKEW_MS) return { ok: false, refusal: 'issued-in-the-future' };
  if (now - claims.iat > MODEL_RECEIPT_MAX_AGE_MS) return { ok: false, refusal: 'expired' };

  return { ok: true, receipt: { ...claims, mac: r.mac } };
}
