import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  LEASE_COLLECTION,
  LEASE_WINDOW_COLLECTION,
  LEASE_WINDOW_MS,
  decideLeaseCall,
  decideLeaseIssue,
  isLeaseRecord,
  newLeaseRecord,
  type LeaseRecord,
  type LeaseReference,
  type LeaseRefusal,
} from './lease';

/**
 * The Firestore half of the generation lease (`lib/transformation/lease.ts`):
 * every read that a decision needs and every write it returns, inside one
 * transaction, always with the Admin SDK.
 *
 * `db` is a parameter, as in `lib/repair-draft-store.ts`, so the specs can run
 * each path against the emulator without a server. Server-only: the browser
 * never imports it (it holds no secret, but it writes records the rules keep
 * closed to every browser).
 */

const leasesOf = (db: Firestore, projectId: string) => db.collection('projects').doc(projectId).collection(LEASE_COLLECTION);
const windowOf = (db: Firestore, uid: string) => db.collection(LEASE_WINDOW_COLLECTION).doc(uid);

export type IssueOutcome =
  | { kind: 'reused'; lease: LeaseRecord }
  | { kind: 'issued'; lease: LeaseRecord; superseded: string[] }
  | { kind: 'refused'; status: number; code: string; error: string; retryAfterSeconds?: number };

/**
 * Issue a lease for one generation, or return the open one of the same
 * generation. The caller has checked the project, its owner and the
 * generation token; this checks the hourly window and the one-open-lease rule
 * in the same transaction that writes.
 */
export async function issueLease(
  db: Firestore,
  args: { projectId: string; uid: string; generationToken: string; plannedCalls: number; now: number },
): Promise<IssueOutcome> {
  const col = leasesOf(db, args.projectId);
  const winRef = windowOf(db, args.uid);
  const newRef = col.doc();
  return db.runTransaction(async (tx: Transaction): Promise<IssueOutcome> => {
    const [openSnap, winSnap] = await Promise.all([tx.get(col.where('status', '==', 'open')), tx.get(winRef)]);
    const open = openSnap.docs.map((d) => d.data());
    const windowIssued = winSnap.exists && Array.isArray(winSnap.data()?.issued) ? (winSnap.data()!.issued as unknown[]) : [];
    const decision = decideLeaseIssue({
      uid: args.uid,
      generationToken: args.generationToken,
      plannedCalls: args.plannedCalls,
      now: args.now,
      open,
      windowIssued,
    });
    if (decision.kind === 'reuse') return { kind: 'reused', lease: decision.lease };
    if (decision.kind === 'refuse') {
      return { kind: 'refused', status: decision.status, code: decision.code, error: decision.error, retryAfterSeconds: decision.retryAfterSeconds };
    }
    const lease = newLeaseRecord({
      leaseId: newRef.id,
      projectId: args.projectId,
      uid: args.uid,
      generationToken: args.generationToken,
      plannedCalls: args.plannedCalls,
      budget: decision.budget,
      now: args.now,
    });
    for (const id of decision.supersede) tx.update(col.doc(id), { status: 'superseded' });
    tx.create(newRef, lease as unknown as Record<string, unknown>);
    tx.set(winRef, { issued: decision.window, expiresAt: new Date(args.now + LEASE_WINDOW_MS) });
    return { kind: 'issued', lease, superseded: decision.supersede };
  });
}

/**
 * Undo an issue whose charge was refused: the lease is closed and its time
 * leaves the window, so a refused charge costs the account no lease.
 */
export async function voidLease(db: Firestore, args: { projectId: string; uid: string; leaseId: string; issuedAt: number }): Promise<void> {
  const ref = leasesOf(db, args.projectId).doc(args.leaseId);
  const winRef = windowOf(db, args.uid);
  await db.runTransaction(async (tx: Transaction) => {
    const [snap, winSnap] = await Promise.all([tx.get(ref), tx.get(winRef)]);
    if (snap.exists) tx.update(ref, { status: 'closed' });
    if (winSnap.exists) {
      const issued = Array.isArray(winSnap.data()?.issued) ? (winSnap.data()!.issued as unknown[]) : [];
      const at = issued.indexOf(args.issuedAt);
      if (at >= 0) {
        issued.splice(at, 1);
        tx.update(winRef, { issued });
      }
    }
  });
}

/** Read and judge a lease without counting — the route's early check. */
export async function peekLease(db: Firestore, ref: LeaseReference, ctx: { uid: string; now: number }): Promise<{ ok: true; lease: LeaseRecord } | LeaseRefusal> {
  const snap = await leasesOf(db, ref.projectId).doc(ref.leaseId).get();
  return decideLeaseCall(snap.exists ? snap.data() : null, { uid: ctx.uid, projectId: ref.projectId, now: ctx.now });
}

/**
 * Count one call against the lease: `used` and `inFlight` go up by one, in
 * the transaction that checks the budget and the in-flight cap — so two calls
 * racing for the 48th call or the 5th slot cannot both get it.
 */
export async function acquireLeaseCall(db: Firestore, ref: LeaseReference, ctx: { uid: string; now: number }): Promise<{ ok: true; lease: LeaseRecord } | LeaseRefusal> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    const decision = decideLeaseCall(snap.exists ? snap.data() : null, { uid: ctx.uid, projectId: ref.projectId, now: ctx.now });
    if (!decision.ok) return decision;
    const lease = { ...decision.lease, used: decision.lease.used + 1, inFlight: decision.lease.inFlight + 1 };
    tx.update(docRef, { used: lease.used, inFlight: lease.inFlight });
    return { ok: true as const, lease };
  });
}

/** The call is over (answered, refused by the provider, or aborted): one slot is free again. Never below zero. */
export async function releaseLeaseCall(db: Firestore, ref: LeaseReference): Promise<void> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;
    if (!isLeaseRecord(data)) return;
    tx.update(docRef, { inFlight: Math.max(0, data.inFlight - 1) });
  });
}

/** The lease record as stored, for the specs and the route's answer. */
export async function readLease(db: Firestore, ref: LeaseReference): Promise<LeaseRecord | null> {
  const snap = await leasesOf(db, ref.projectId).doc(ref.leaseId).get();
  const data = snap.exists ? snap.data() : null;
  return isLeaseRecord(data) ? data : null;
}
