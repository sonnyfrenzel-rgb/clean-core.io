/**
 * The generation lease — the decisions (`docs/design/engine-led-transformation.md`
 * §11, Track C; owner decision 12.10.2026, open question 1).
 *
 * One engine-led generation makes many small model calls: 3–9 fills on the
 * four reference programs, plus retries and up to two repair rounds. Under
 * the per-account limit of `/api/gemini` (20 calls per hour) two generations
 * would use up the hour. So a generation buys a **lease**:
 *
 *   - one lease costs **one unit** of the account's hourly model limit
 *     (`gemini:<uid>`), charged by `/api/transformation/lease`;
 *   - a lease is good for at most **48 calls** (`min(48, plannedCalls × 2 + 8)`),
 *     at most **4 in flight**, for one project and one generation token;
 *   - a lease lasts long enough for its budget (`leaseTtlMs`): 15 minutes at
 *     least, more for a large plan, never more than 60;
 *   - an account gets at most **3 leases per hour**;
 *   - a project has at most one open lease: a new one supersedes the old,
 *     whose calls are refused from then on;
 *   - asking again for the same project and generation token while its lease
 *     is open returns that lease and charges nothing (idempotent).
 *
 * A call to `/api/gemini` that names a valid lease does not touch the hourly
 * counter; it is counted against the lease instead. A lease that is not the
 * caller's, closed, expired, used up or at its in-flight cap is refused with a
 * code, before any provider call. Nothing else about the route changes: auth,
 * the second factor, the account gate, the stage switch, the model register
 * and the prompt limit apply to a leased call exactly as to any other.
 *
 * Server-authoritative: the records are written only by the Admin SDK
 * (`lib/transformation/lease-store.ts`) under
 * `projects/{id}/transformation_leases/{leaseId}` and
 * `transformation_lease_windows/{uid}` — neither has a `match` block in
 * `firestore.rules`, so the default deny closes both to every browser. No
 * rules change.
 *
 * Pure: no Firestore, no Next. The store and the specs call these functions.
 */

import { MODEL_CALL_DEADLINE_MS } from '../model-deadline';

export const LEASE_RECORD_VERSION = 1;
export const LEASE_COLLECTION = 'transformation_leases';
export const LEASE_WINDOW_COLLECTION = 'transformation_lease_windows';

/** The most model calls one lease buys (fills, retries and repairs together). */
export const LEASE_MAX_CALLS = 48;
/** The most calls of one lease in flight at once (§8.3). */
export const LEASE_MAX_IN_FLIGHT = 4;
/** The shortest a lease is valid. */
export const LEASE_TTL_MS = 15 * 60 * 1000;
/** The longest a lease is valid. */
export const LEASE_MAX_TTL_MS = 60 * 60 * 1000;
/** Leases per account and window. */
export const LEASES_PER_WINDOW = 3;
export const LEASE_WINDOW_MS = 60 * 60 * 1000;
/** The most fill calls a plan may say it needs (120 units ÷ ≤ 4 per call, rounded up generously). */
export const LEASE_MAX_PLANNED_CALLS = 40;

/** The refusal codes, one per reason a reader or a client branches on. */
export const LEASE_CODES = {
  invalid: 'lease-invalid',
  closed: 'lease-closed',
  expired: 'lease-expired',
  exhausted: 'lease-exhausted',
  busy: 'lease-busy',
  stage: 'lease-stage',
  hourly: 'lease-hourly-limit',
} as const;

export type LeaseStatus = 'open' | 'superseded' | 'closed';

export interface LeaseRecord {
  v: number;
  leaseId: string;
  projectId: string;
  uid: string;
  generationToken: string;
  plannedCalls: number;
  budget: number;
  used: number;
  inFlight: number;
  status: LeaseStatus;
  /** Epoch milliseconds. */
  createdAt: number;
  expiresAt: number;
}

/** What a client holds and sends: never more than the ids. */
export interface LeaseReference {
  projectId: string;
  leaseId: string;
}

export interface LeaseRefusal {
  ok: false;
  status: number;
  code: string;
  error: string;
}

const refuse = (status: number, code: string, error: string): LeaseRefusal => ({ ok: false, status, code, error });

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** The calls a lease buys for a plan of `plannedCalls` fill calls: room for retries and two repair rounds, never more than 48. */
export function leaseBudget(plannedCalls: number): number {
  const planned = Number.isInteger(plannedCalls) && plannedCalls > 0 ? Math.min(plannedCalls, LEASE_MAX_PLANNED_CALLS) : 1;
  return Math.min(LEASE_MAX_CALLS, planned * 2 + 8);
}

/**
 * How long a lease of `budget` calls is valid: long enough for every call it
 * buys, at most `LEASE_MAX_IN_FLIGHT` at a time, each allowed the route's full
 * deadline (`MODEL_CALL_DEADLINE_MS`) — 15 minutes at least, 60 at most.
 *
 * A flat 15 minutes was shorter than a generation of a large program takes: on
 * 13.10.2026 a 1,848-line program planned 29 fill calls; its calls took 9–292 s
 * (median 165 s), the lease expired after 25 of them, the next call was refused
 * (403, `lease-expired`) and the functions not yet asked stayed stubs. The time
 * a lease lasts adds no call: the budget bounds the calls, the hourly limit
 * bounds the leases.
 */
export function leaseTtlMs(budget: number): number {
  const calls = Number.isInteger(budget) && budget > 0 ? Math.min(budget, LEASE_MAX_CALLS) : 1;
  const waves = Math.ceil(calls / LEASE_MAX_IN_FLIGHT);
  return Math.min(LEASE_MAX_TTL_MS, Math.max(LEASE_TTL_MS, waves * MODEL_CALL_DEADLINE_MS));
}

/** Shape check of a stored lease. Anything else is treated as no lease at all. */
export function isLeaseRecord(value: unknown): value is LeaseRecord {
  if (!isPlainObject(value)) return false;
  const v = value;
  return (
    v.v === LEASE_RECORD_VERSION &&
    typeof v.leaseId === 'string' &&
    typeof v.projectId === 'string' &&
    typeof v.uid === 'string' &&
    typeof v.generationToken === 'string' &&
    isCount(v.plannedCalls) &&
    isCount(v.budget) &&
    v.budget <= LEASE_MAX_CALLS &&
    isCount(v.used) &&
    isCount(v.inFlight) &&
    (v.status === 'open' || v.status === 'superseded' || v.status === 'closed') &&
    isCount(v.createdAt) &&
    isCount(v.expiresAt)
  );
}

/**
 * The lease a request names, read from the body of `/api/gemini`:
 * `{ lease: { projectId, leaseId } }`. `null` when none is named; a refusal
 * when one is named in a shape that is not a lease reference.
 */
export function leaseReferenceOf(body: unknown, isId: (s: unknown) => s is string): LeaseReference | null | LeaseRefusal {
  if (!isPlainObject(body) || body.lease === undefined || body.lease === null) return null;
  const l = body.lease;
  if (!isPlainObject(l) || !isId(l.projectId) || !isId(l.leaseId)) {
    return refuse(400, LEASE_CODES.invalid, 'The generation lease is named in a shape this route does not accept: { projectId, leaseId }.');
  }
  return { projectId: l.projectId, leaseId: l.leaseId };
}

/**
 * May this call run under this lease? Checked before the provider call (and
 * again inside the transaction that counts it). The same answer for "no such
 * lease" and "another account's lease", so a lease id cannot be probed.
 */
export function decideLeaseCall(lease: unknown, ctx: { uid: string; projectId: string; now: number }): { ok: true; lease: LeaseRecord } | LeaseRefusal {
  if (!isLeaseRecord(lease) || lease.uid !== ctx.uid || lease.projectId !== ctx.projectId) {
    return refuse(403, LEASE_CODES.invalid, 'This generation lease does not exist for this account. Start the generation again.');
  }
  if (lease.status !== 'open') {
    return refuse(
      403,
      LEASE_CODES.closed,
      lease.status === 'superseded'
        ? 'A newer generation of this project replaced this lease. Only the newest generation may call the model.'
        : 'This generation lease is closed.',
    );
  }
  if (ctx.now >= lease.expiresAt) {
    return refuse(403, LEASE_CODES.expired, 'This generation lease has expired. Start the generation again.');
  }
  if (lease.used >= lease.budget) {
    return refuse(429, LEASE_CODES.exhausted, `This generation has used all ${lease.budget} model calls of its lease.`);
  }
  if (lease.inFlight >= LEASE_MAX_IN_FLIGHT) {
    return refuse(429, LEASE_CODES.busy, `At most ${LEASE_MAX_IN_FLIGHT} model calls of one generation run at once. Retry when one has finished.`);
  }
  return { ok: true, lease };
}

export type LeaseIssueDecision =
  /** The open lease of this project and generation: returned as it is, nothing charged. */
  | { kind: 'reuse'; lease: LeaseRecord }
  /** A new lease: charge one unit, write it, close the ones it supersedes, record it in the window. */
  | { kind: 'issue'; budget: number; supersede: string[]; window: number[] }
  | LeaseRefusalDecision;

export interface LeaseRefusalDecision {
  kind: 'refuse';
  status: number;
  code: string;
  error: string;
  retryAfterSeconds?: number;
}

/**
 * Issue, reuse or refuse. `open` are the project's leases with status open (any
 * age); `windowIssued` the account's issue times in the window.
 */
export function decideLeaseIssue(input: {
  uid: string;
  generationToken: string;
  plannedCalls: number;
  now: number;
  open: readonly unknown[];
  windowIssued: readonly unknown[];
}): LeaseIssueDecision {
  const usable = input.open.filter(isLeaseRecord).filter((l) => l.status === 'open');
  const same = usable.find(
    (l) => l.uid === input.uid && l.generationToken === input.generationToken && input.now < l.expiresAt && l.used < l.budget,
  );
  if (same) return { kind: 'reuse', lease: same };

  const recent = input.windowIssued
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    .filter((t) => t > input.now - LEASE_WINDOW_MS)
    .sort((a, b) => a - b);
  if (recent.length >= LEASES_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + LEASE_WINDOW_MS - input.now) / 1000));
    return {
      kind: 'refuse',
      status: 429,
      code: LEASE_CODES.hourly,
      error: `At most ${LEASES_PER_WINDOW} code generations per hour. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      retryAfterSeconds,
    };
  }
  return {
    kind: 'issue',
    budget: leaseBudget(input.plannedCalls),
    supersede: usable.map((l) => l.leaseId),
    window: [...recent, input.now],
  };
}

/** The record of a new lease. */
export function newLeaseRecord(input: {
  leaseId: string;
  projectId: string;
  uid: string;
  generationToken: string;
  plannedCalls: number;
  budget: number;
  now: number;
}): LeaseRecord {
  return {
    v: LEASE_RECORD_VERSION,
    leaseId: input.leaseId,
    projectId: input.projectId,
    uid: input.uid,
    generationToken: input.generationToken,
    plannedCalls: Math.min(Math.max(1, Math.floor(input.plannedCalls) || 1), LEASE_MAX_PLANNED_CALLS),
    budget: input.budget,
    used: 0,
    inFlight: 0,
    status: 'open',
    createdAt: input.now,
    expiresAt: input.now + leaseTtlMs(input.budget),
  };
}

/** What a client is told about its lease — never the token or the account. */
export function leaseView(lease: LeaseRecord): { projectId: string; leaseId: string; budget: number; used: number; expiresAt: number; maxInFlight: number } {
  return {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    budget: lease.budget,
    used: lease.used,
    expiresAt: lease.expiresAt,
    maxInFlight: LEASE_MAX_IN_FLIGHT,
  };
}
