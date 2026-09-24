import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The capability a live test run carries to the credential proxy (roadmap 8.9).
 *
 * A live run executes generated code in the isolated live runner. That code
 * must be able to call the tenant, and must never hold the tenant's
 * credentials. So the app mints, per run, a short-lived capability and hands it
 * to the runner; the runner's relay presents it to the app's proxy
 * (`/api/s4-proxy/{capability}/…`), and the proxy — not the runner — puts the
 * decrypted credentials on the request to the one tenant host the capability
 * names.
 *
 * What it binds, signed with HMAC-SHA256:
 *   - `pid` / `uid` — the project and the account the run was served for;
 *   - `host`        — the tenant host of that account's stored connection, at
 *                     mint time. The proxy refuses when the stored connection
 *                     no longer points there;
 *   - `run`         — the run it was minted for (a draft id or a fresh nonce);
 *   - `cid`         — a random id, the key of its server-side state;
 *   - `exp`         — ten minutes at most.
 *
 * The signature makes it unforgeable; the server-side state
 * (`lib/s4-proxy-capability-store.ts`) makes it single-run: the app deletes it
 * when the run ends, so a capability outlives its run by no more than the
 * run's own failure to finish.
 *
 * The key is derived (HKDF-SHA256, own label) from `S4_ENCRYPTION_KEY`, the key
 * the credentials themselves are encrypted with — no new secret to provision,
 * and a capability can only exist where the credentials can be read anyway.
 */

export const CAPABILITY_TTL_MS = 10 * 60 * 1000;
const PREFIX = 'v1';
const HKDF_INFO = 'clean-core.io/s4-proxy-capability/v1';

export interface CapabilityClaims {
  cid: string;
  pid: string;
  uid: string;
  host: string;
  run: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** The signing key, derived from the credential encryption key. Throws when that is not configured. */
export function capabilityKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer {
  const b64 = env.S4_ENCRYPTION_KEY;
  if (!b64) throw new Error('S4_ENCRYPTION_KEY is not configured.');
  const ikm = Buffer.from(b64, 'base64');
  if (ikm.length !== 32) throw new Error('S4_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), HKDF_INFO, 32));
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const HOST = /^[a-z0-9.-]{1,253}$/;

export function mintCapability(
  claims: Omit<CapabilityClaims, 'cid' | 'exp'> & { ttlMs?: number },
  key: Buffer,
  now: number = Date.now(),
): { token: string; claims: CapabilityClaims } {
  const host = claims.host.toLowerCase();
  if (!ID.test(claims.pid) || !ID.test(claims.uid) || !ID.test(claims.run) || !HOST.test(host)) {
    throw new Error('A capability binds a project, an account, a run and a host name.');
  }
  const ttl = Math.min(claims.ttlMs ?? CAPABILITY_TTL_MS, CAPABILITY_TTL_MS);
  const full: CapabilityClaims = { cid: b64url(randomBytes(18)), pid: claims.pid, uid: claims.uid, host, run: claims.run, exp: now + ttl };
  const body = b64url(Buffer.from(JSON.stringify(full), 'utf8'));
  const mac = b64url(createHmac('sha256', key).update(`${PREFIX}.${body}`).digest());
  return { token: `${PREFIX}.${body}.${mac}`, claims: full };
}

export type CapabilityVerdict = { ok: true; claims: CapabilityClaims } | { ok: false; reason: string };

/** Signature and expiry. Whether the run is still going is the store's question. */
export function verifyCapability(token: string, key: Buffer, now: number = Date.now()): CapabilityVerdict {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'Malformed capability.' };
  const expected = createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest();
  const given = fromB64url(parts[2]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'Bad capability signature.' };
  let claims: CapabilityClaims;
  try {
    claims = JSON.parse(fromB64url(parts[1]).toString('utf8')) as CapabilityClaims;
  } catch {
    return { ok: false, reason: 'Malformed capability.' };
  }
  if (
    !claims ||
    typeof claims.cid !== 'string' ||
    !ID.test(claims.pid) ||
    !ID.test(claims.uid) ||
    !ID.test(claims.run) ||
    !HOST.test(claims.host) ||
    typeof claims.exp !== 'number'
  ) {
    return { ok: false, reason: 'Malformed capability.' };
  }
  if (claims.exp <= now) return { ok: false, reason: 'Capability expired.' };
  if (claims.exp - now > CAPABILITY_TTL_MS) return { ok: false, reason: 'Capability lifetime too long.' };
  return { ok: true, claims };
}
