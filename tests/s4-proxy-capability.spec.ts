/**
 * Roadmap 8.9 — the capability of a live test run: what it binds, when it
 * expires, and that it is good for one run only. Pure, plus an in-memory
 * stand-in for the Admin Firestore handle.
 */
import { test, expect } from '@playwright/test';
import { mintCapability, verifyCapability, capabilityKeyFromEnv, CAPABILITY_TTL_MS } from '../lib/s4-proxy-capability';
import {
  registerCapability,
  revokeCapability,
  admitProxyRequest,
  MAX_PROXY_REQUESTS_PER_RUN,
  CAPABILITY_COLLECTION,
  type CapabilityDb,
} from '../lib/s4-proxy-capability-store';

const KEY = capabilityKeyFromEnv({ S4_ENCRYPTION_KEY: Buffer.alloc(32, 'capability-spec').toString('base64') });
const NOW = Date.parse('2026-09-24T10:00:00Z');
const CLAIMS = { pid: 'proj_1', uid: 'uidA1b2', host: 'my-tenant.s4hana.cloud.sap', run: 'run0001' };

/** Just enough of Firestore: documents in a map, transactions run directly. */
function memoryDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (col: string, id: string) => ({
    key: `${col}/${id}`,
    set: async (d: Record<string, unknown>) => void docs.set(`${col}/${id}`, { ...d }),
    delete: async () => void docs.delete(`${col}/${id}`),
  });
  const db: CapabilityDb = {
    collection: (col: string) => ({ doc: (id: string) => ref(col, id) }),
    runTransaction: async (fn) =>
      fn({
        get: async (r) => {
          const d = docs.get((r as { key: string }).key);
          return { exists: !!d, data: () => (d ? { ...d } : undefined) };
        },
        update: (r, data) => {
          const k = (r as { key: string }).key;
          docs.set(k, { ...(docs.get(k) || {}), ...data });
        },
      }),
  };
  return { db, docs };
}

test.describe('binding and signature', () => {
  test('a minted capability verifies and carries exactly what it was minted for', () => {
    const { token, claims } = mintCapability(CLAIMS, KEY, NOW);
    const v = verifyCapability(token, KEY, NOW + 1000);
    expect(v).toEqual({ ok: true, claims });
    expect(claims).toMatchObject({ ...CLAIMS, exp: NOW + CAPABILITY_TTL_MS });
    expect(claims.cid).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    // Two mints for the same run are two capabilities.
    expect(mintCapability(CLAIMS, KEY, NOW).claims.cid).not.toBe(claims.cid);
  });

  test('changing any claim, or signing with another key, breaks it', () => {
    const { token } = mintCapability(CLAIMS, KEY, NOW);
    const [prefix, body, mac] = token.split('.');
    const claims = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    for (const change of [{ host: 'attacker.example' }, { uid: 'someoneElse' }, { pid: 'proj_2' }, { run: 'run0002' }, { exp: claims.exp + 3600_000 }]) {
      const forged = Buffer.from(JSON.stringify({ ...claims, ...change })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(verifyCapability(`${prefix}.${forged}.${mac}`, KEY, NOW).ok, JSON.stringify(change)).toBe(false);
    }
    const otherKey = capabilityKeyFromEnv({ S4_ENCRYPTION_KEY: Buffer.alloc(32, 'another-key').toString('base64') });
    expect(verifyCapability(token, otherKey, NOW).ok).toBe(false);
    expect(verifyCapability('', KEY, NOW).ok).toBe(false);
    expect(verifyCapability('v2.x.y', KEY, NOW).ok).toBe(false);
  });

  test('it expires after ten minutes at most, and a longer lifetime cannot be minted', () => {
    const { token } = mintCapability(CLAIMS, KEY, NOW);
    expect(verifyCapability(token, KEY, NOW + CAPABILITY_TTL_MS - 1).ok).toBe(true);
    expect(verifyCapability(token, KEY, NOW + CAPABILITY_TTL_MS).ok).toBe(false);
    const long = mintCapability({ ...CLAIMS, ttlMs: 24 * 3600_000 }, KEY, NOW);
    expect(long.claims.exp - NOW).toBe(CAPABILITY_TTL_MS);
  });

  test('it binds a host name, never a URL or a path', () => {
    expect(() => mintCapability({ ...CLAIMS, host: 'https://x.example/path' }, KEY, NOW)).toThrow();
    expect(() => mintCapability({ ...CLAIMS, pid: '../other' }, KEY, NOW)).toThrow();
    expect(mintCapability({ ...CLAIMS, host: 'MY-Tenant.S4HANA.cloud.sap' }, KEY, NOW).claims.host).toBe('my-tenant.s4hana.cloud.sap');
  });

  test('the key comes from the credential key, through its own derivation', () => {
    expect(() => capabilityKeyFromEnv({})).toThrow(/S4_ENCRYPTION_KEY/);
    expect(() => capabilityKeyFromEnv({ S4_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow();
    const raw = Buffer.alloc(32, 'capability-spec');
    expect(KEY.equals(raw), 'the capability key is the encryption key itself').toBe(false);
    expect(KEY).toHaveLength(32);
  });
});

test.describe('one run, one capability', () => {
  test('admitted while the run runs, refused once it is revoked', async () => {
    const { db, docs } = memoryDb();
    const { claims } = mintCapability(CLAIMS, KEY, NOW);
    expect((await admitProxyRequest(db, claims, NOW)).ok, 'admitted before it was registered').toBe(false);
    await registerCapability(db, claims);
    expect(docs.get(`${CAPABILITY_COLLECTION}/${claims.cid}`)).toMatchObject({ pid: claims.pid, requests: 0 });
    expect(await admitProxyRequest(db, claims, NOW)).toEqual({ ok: true });
    expect(await admitProxyRequest(db, claims, NOW)).toEqual({ ok: true });
    expect(docs.get(`${CAPABILITY_COLLECTION}/${claims.cid}`)!.requests).toBe(2);
    await revokeCapability(db, claims.cid);
    const after = await admitProxyRequest(db, claims, NOW);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toMatch(/run has ended/);
  });

  test('refused past its expiry, past its budget, and when the stored state does not match', async () => {
    const { db, docs } = memoryDb();
    const { claims } = mintCapability(CLAIMS, KEY, NOW);
    await registerCapability(db, claims);
    expect((await admitProxyRequest(db, claims, claims.exp)).ok, 'past expiry').toBe(false);

    docs.set(`${CAPABILITY_COLLECTION}/${claims.cid}`, { ...docs.get(`${CAPABILITY_COLLECTION}/${claims.cid}`)!, requests: MAX_PROXY_REQUESTS_PER_RUN });
    expect((await admitProxyRequest(db, claims, NOW)).ok, 'past budget').toBe(false);

    docs.set(`${CAPABILITY_COLLECTION}/${claims.cid}`, { ...docs.get(`${CAPABILITY_COLLECTION}/${claims.cid}`)!, requests: 0, host: 'other.example' });
    expect((await admitProxyRequest(db, claims, NOW)).ok, 'stored host differs').toBe(false);
  });

  test('the stored state holds ids and counters, never a credential', async () => {
    const { db, docs } = memoryDb();
    const { claims } = mintCapability(CLAIMS, KEY, NOW);
    await registerCapability(db, claims);
    expect(Object.keys(docs.get(`${CAPABILITY_COLLECTION}/${claims.cid}`)!).sort()).toEqual(['exp', 'expiresAt', 'host', 'pid', 'requests', 'run', 'uid']);
  });
});
