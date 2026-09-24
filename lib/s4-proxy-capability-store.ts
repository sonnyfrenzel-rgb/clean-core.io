import type { CapabilityClaims } from './s4-proxy-capability';

/**
 * The server-side half of a proxy capability: it exists while its run runs.
 *
 * `/api/run-tests` registers the capability before it calls the live runner
 * and deletes it in `finally`, whatever the run did. The proxy admits a request
 * only while the document exists, matches the signed claims, has not expired
 * and has not used up its request budget. So a capability is good for one run:
 * a copy that leaks out of the runner is dead the moment the run returns.
 *
 * `s4_proxy_capabilities` has no rule in `firestore.rules`, so no client can
 * read or write it; the Admin SDK is the only way in. The documents hold ids,
 * a host name and counters — never a credential. `expiresAt` is there for a
 * Firestore TTL policy to sweep what a crashed run left behind.
 */

export const CAPABILITY_COLLECTION = 's4_proxy_capabilities';
/** Upper bound of tenant requests one test run may make through the proxy. */
export const MAX_PROXY_REQUESTS_PER_RUN = 200;

/** The slice of the Admin Firestore API this file uses. */
export interface CapabilityDb {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: CapabilityTx) => Promise<T>): Promise<T>;
}
export interface CapabilityTx {
  get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  update(ref: unknown, data: Record<string, unknown>): unknown;
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export async function registerCapability(db: CapabilityDb, claims: CapabilityClaims): Promise<void> {
  const ref = db.collection(CAPABILITY_COLLECTION).doc(claims.cid) as DocRef;
  await ref.set({
    pid: claims.pid,
    uid: claims.uid,
    host: claims.host,
    run: claims.run,
    exp: claims.exp,
    requests: 0,
    expiresAt: new Date(claims.exp),
  });
}

export async function revokeCapability(db: CapabilityDb, cid: string): Promise<void> {
  await (db.collection(CAPABILITY_COLLECTION).doc(cid) as DocRef).delete();
}

export type Admission = { ok: true } | { ok: false; reason: string };

/**
 * Admits one proxied request, or says why not. Transactional, so two proxy
 * instances cannot both spend the last request of a budget.
 */
export async function admitProxyRequest(db: CapabilityDb, claims: CapabilityClaims, now: number = Date.now()): Promise<Admission> {
  const ref = db.collection(CAPABILITY_COLLECTION).doc(claims.cid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'The capability is not active: its run has ended or never started.' };
    const d = snap.data() || {};
    if (d.pid !== claims.pid || d.uid !== claims.uid || d.host !== claims.host || d.run !== claims.run || d.exp !== claims.exp) {
      return { ok: false, reason: 'The capability does not match its run.' };
    }
    if (typeof d.exp !== 'number' || d.exp <= now) return { ok: false, reason: 'The capability has expired.' };
    const used = typeof d.requests === 'number' ? d.requests : MAX_PROXY_REQUESTS_PER_RUN;
    if (used >= MAX_PROXY_REQUESTS_PER_RUN) return { ok: false, reason: 'The run has used up its tenant requests.' };
    tx.update(ref, { requests: used + 1 });
    return { ok: true };
  });
}
