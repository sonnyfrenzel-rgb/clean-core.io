import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

/**
 * Google-signed identity tokens, both directions (roadmap 8.9).
 *
 *   - **Minting**: a Cloud Run service asks its metadata server for an ID token
 *     of its own service account, for one audience. The app does this to call
 *     the isolated runner (audience = the runner's URL; Cloud Run's own front
 *     end checks it and the `run.invoker` binding). The live runner does this
 *     to call the app's credential proxy (audience = the app's URL).
 *   - **Verifying**: the credential proxy checks that a caller holds a token
 *     for the app's audience, issued to the runner's service account. Cloud
 *     Run checks nothing on the app's side — the app is public — so the check
 *     is done here, against Google's published signing certificates.
 *
 * No dependency beyond node:crypto, so the runner image can carry it.
 */

const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CLOCK_SKEW_S = 60;

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers: { get(name: string): string | null };
}>;

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(b64urlDecode(part).toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── Minting ────────────────────────────────────────────────────────────────

const minted = new Map<string, { token: string; exp: number }>();

/**
 * An ID token of this service's own service account, for `audience`, from the
 * metadata server. Cached until five minutes before it expires.
 */
export async function fetchMetadataIdToken(audience: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = minted.get(audience);
  if (cached && cached.exp - 300 > now) return cached.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetchImpl(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`The metadata server refused an identity token (HTTP ${res.status}).`);
    const token = (await res.text()).trim();
    const payload = decodeJson(token.split('.')[1] || '');
    const exp = typeof payload?.exp === 'number' ? payload.exp : now + 600;
    minted.set(audience, { token, exp });
    return token;
  } finally {
    clearTimeout(timer);
  }
}

// ── Verifying ──────────────────────────────────────────────────────────────

let certCache: { keys: Record<string, string>; until: number } | null = null;

async function googleCerts(fetchImpl: FetchLike): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.until > now) return certCache.keys;
  const res = await fetchImpl(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`Google signing certificates unavailable (HTTP ${res.status}).`);
  const keys = JSON.parse(await res.text()) as Record<string, string>;
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  certCache = { keys, until: now + Math.min(Number(maxAge?.[1] || 3600), 6 * 3600) * 1000 };
  return keys;
}

export interface ExpectedIdentity {
  /** The audience the token must carry — the URL of the receiving service. */
  audience: string;
  /** The service account the token must be issued to. */
  email: string;
}

export type IdTokenVerdict = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Verifies a Google-signed ID token: RS256 over a key Google publishes, a
 * Google issuer, the expected audience, the expected verified e-mail, and a
 * lifetime that holds now. Anything else is a refusal with a fixed reason.
 *
 * `deps.keys` lets a spec hand in its own key set (kid → PEM certificate or
 * public key) instead of Google's.
 */
export async function verifyGoogleIdToken(
  token: string,
  expected: ExpectedIdentity,
  deps: { keys?: () => Promise<Record<string, string>>; now?: () => number; fetchImpl?: FetchLike } = {},
): Promise<IdTokenVerdict> {
  if (!expected.audience || !expected.email) return { ok: false, reason: 'The expected identity is not configured.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed token.' };
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (!header || !payload) return { ok: false, reason: 'Malformed token.' };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'Unsupported token algorithm.' };

  let keys: Record<string, string>;
  try {
    keys = deps.keys ? await deps.keys() : await googleCerts(deps.fetchImpl || (fetch as unknown as FetchLike));
  } catch {
    return { ok: false, reason: 'Signing keys unavailable.' };
  }
  const pem = keys[header.kid];
  if (!pem) return { ok: false, reason: 'Unknown signing key.' };
  let valid = false;
  try {
    valid = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(pem), b64urlDecode(parts[2]));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'Bad signature.' };

  const now = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  if (!ISSUERS.has(String(payload.iss))) return { ok: false, reason: 'Wrong issuer.' };
  if (payload.aud !== expected.audience) return { ok: false, reason: 'Wrong audience.' };
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < now) return { ok: false, reason: 'Token expired.' };
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > now) return { ok: false, reason: 'Token issued in the future.' };
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (!email || email !== expected.email.toLowerCase() || payload.email_verified !== true) {
    return { ok: false, reason: 'Wrong caller.' };
  }
  return { ok: true, email };
}

/** The bearer token of a request, or `''`. */
export function bearerToken(authorization: string | null | undefined): string {
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(String(authorization || '').trim());
  return m ? m[1] : '';
}
