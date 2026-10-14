import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  LEASE_COLLECTION,
  LEASE_WINDOW_COLLECTION,
  LEASE_WINDOW_MS,
  decideLeaseCall,
  decideLeaseClose,
  decideLeaseIssue,
  isLeaseRecord,
  leaseWindowStatus,
  liveSlots,
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
  args: {
    projectId: string;
    uid: string;
    generationToken: string;
    runId?: string | null;
    plannedCalls: number;
    now: number;
    /**
     * Whether the lease is paid for when it is written. The route issues it
     * `false` and calls `confirmLeaseCharge` once the hourly charge went
     * through; until then it is neither reused nor usable (roadmap 3.0.13).
     */
    charged: boolean;
  },
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
      runId: args.runId ?? null,
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
      runId: args.runId ?? null,
      plannedCalls: args.plannedCalls,
      budget: decision.budget,
      now: args.now,
      charged: args.charged,
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

/**
 * The hourly charge of the request that issued this lease went through: from
 * now on it is reused for a retry of its run and usable for calls. The record
 * as it stands after the write; `null` when there is no such lease.
 */
export async function confirmLeaseCharge(db: Firestore, ref: LeaseReference): Promise<LeaseRecord | null> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;
    if (!isLeaseRecord(data)) return null;
    if (data.charged === false) tx.update(docRef, { charged: true });
    return { ...data, charged: true };
  });
}

/** Read and judge a lease without counting — the route's early check. */
export async function peekLease(db: Firestore, ref: LeaseReference, ctx: { uid: string; now: number }): Promise<{ ok: true; lease: LeaseRecord } | LeaseRefusal> {
  const snap = await leasesOf(db, ref.projectId).doc(ref.leaseId).get();
  return decideLeaseCall(snap.exists ? snap.data() : null, { uid: ctx.uid, projectId: ref.projectId, now: ctx.now });
}

/** A lease reference with the time of the slot one call holds (`acquireLeaseCall`), so its release frees exactly that slot. */
export type HeldLeaseSlot = LeaseReference & { slotAt?: number };

/**
 * Count one call against the lease: `used` goes up by one and the call takes
 * a slot (its time joins `slots`; stale slots leave), in the transaction that
 * checks the budget and the in-flight cap — so two calls racing for the 48th
 * call or the 5th slot cannot both get it.
 */
export async function acquireLeaseCall(
  db: Firestore,
  ref: LeaseReference,
  ctx: { uid: string; now: number },
): Promise<{ ok: true; lease: LeaseRecord; slotAt: number } | LeaseRefusal> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    const decision = decideLeaseCall(snap.exists ? snap.data() : null, { uid: ctx.uid, projectId: ref.projectId, now: ctx.now });
    if (!decision.ok) return decision;
    const was = decision.lease;
    if (Array.isArray(was.slots)) {
      const slots = [...liveSlots(was.slots, ctx.now), ctx.now];
      const lease = { ...was, used: was.used + 1, inFlight: slots.length, slots };
      tx.update(docRef, { used: lease.used, inFlight: lease.inFlight, slots });
      return { ok: true as const, lease, slotAt: ctx.now };
    }
    // A lease from before the slot times: counted as it always was.
    const lease = { ...was, used: was.used + 1, inFlight: was.inFlight + 1 };
    tx.update(docRef, { used: lease.used, inFlight: lease.inFlight });
    return { ok: true as const, lease, slotAt: ctx.now };
  });
}

/**
 * The call is over (answered, refused by the provider, or aborted): its slot
 * is free again — the one it took, when it names it; stale slots leave too.
 * Never below zero, and only this lease's record is touched.
 */
export async function releaseLeaseCall(db: Firestore, ref: HeldLeaseSlot, now: number = Date.now()): Promise<void> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;
    if (!isLeaseRecord(data)) return;
    if (Array.isArray(data.slots)) {
      const slots = [...data.slots];
      const at = typeof ref.slotAt === 'number' ? slots.indexOf(ref.slotAt) : -1;
      if (at >= 0) slots.splice(at, 1);
      else if (typeof ref.slotAt !== 'number' && slots.length > 0) slots.splice(slots.indexOf(Math.min(...slots)), 1);
      const live = liveSlots(slots, now);
      tx.update(docRef, { slots: live, inFlight: live.length });
      return;
    }
    tx.update(docRef, { inFlight: Math.max(0, data.inFlight - 1) });
  });
}

/** The lease record as stored, for the specs and the route's answer. */
export async function readLease(db: Firestore, ref: LeaseReference): Promise<LeaseRecord | null> {
  const snap = await leasesOf(db, ref.projectId).doc(ref.leaseId).get();
  const data = snap.exists ? snap.data() : null;
  return isLeaseRecord(data) ? data : null;
}

/**
 * *Cancel*: the run's lease is closed, by its owner only — late calls of it
 * are refused from now on, and its releases go on touching only this record.
 * `false` when there was nothing of the caller's to close.
 */
export async function closeLease(db: Firestore, ref: LeaseReference, ctx: { uid: string }): Promise<boolean> {
  const docRef = leasesOf(db, ref.projectId).doc(ref.leaseId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(docRef);
    if (decideLeaseClose(snap.exists ? snap.data() : null, { uid: ctx.uid, projectId: ref.projectId }) !== 'close') return false;
    tx.update(docRef, { status: 'closed' });
    return true;
  });
}

/** The account's hourly window of leases, read without writing — the start screen's "generations left this hour". */
export async function readLeaseWindow(db: Firestore, uid: string, now: number): Promise<ReturnType<typeof leaseWindowStatus>> {
  const snap = await windowOf(db, uid).get();
  const issued = snap.exists && Array.isArray(snap.data()?.issued) ? (snap.data()!.issued as unknown[]) : [];
  return leaseWindowStatus(issued, now);
}
