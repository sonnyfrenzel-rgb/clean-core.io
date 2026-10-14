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
 *   - and for **16 calls more that only repairs of gate errors may spend**,
 *     once the 48 are used (`LEASE_GATE_REPAIR_CALLS`, owner decision
 *     14.10.2026): at most 64 calls per generation;
 *   - a lease lasts long enough for its budget (`leaseTtlMs`): 15 minutes at
 *     least, more for a large plan, never more than 180 (since the 900 s
 *     request limit of 13.10.2026: 12 waves × the 870 s deadline = 174 min);
 *   - every in-flight slot carries the time it was taken (`slots`), and a
 *     slot older than the route's deadline + 30 s is free again — a slot held
 *     by an instance that died never blocks a run;
 *   - an account gets at most **3 leases per hour**;
 *   - a project has at most one open lease: a new one supersedes the old,
 *     whose calls are refused from then on;
 *   - every click of *Generate* is its own run with its own random `runId`;
 *     asking again for the same project, generation token **and run** while
 *     its lease is open returns that lease and charges nothing (an idempotent
 *     retry of the lease request itself). A new run at the same token gets a
 *     new lease (in flight 0) and supersedes the old one — it never inherits
 *     the in-flight slots of a run that was cancelled (13.10.2026: a restart
 *     reused the cancelled run's lease, whose four slots were still held by
 *     its server-side calls, and every call of the new run was refused
 *     `lease-busy`);
 *   - *Cancel* closes the run's lease (`decideLeaseClose`), owner only.
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
/**
 * Calls a lease holds apart for repairs of gate errors only — the activation check's parser and syntax errors on
 * the RAP route, the type check's errors on the Node route (`GATE_CHECKS`, `fill-prompt.ts`).
 *
 * Owner decision 14.10.2026 — quality over cost: in the third real acceptance run two Node generations (SD, CO)
 * used all 48 calls, and a single syntax slip stayed because no call was left to repair it. So a lease carries
 * 16 calls more (≈ $0.005 a call, ≈ $0.08 a generation at most), granted with the lease and spent only by a call
 * marked `gateRepair` whose prompt is a repair of gate errors (`isGateRepairPrompt`, checked by `/api/gemini`),
 * and only once the 48 are used. Never a general raise: a fill, a retry or any other repair cannot reach them,
 * and the hourly limits stay — one lease per unit of the hourly model limit, `LEASES_PER_WINDOW` an hour.
 */
export const LEASE_GATE_REPAIR_CALLS = 16;
/** The hard maximum of model calls of one generation: its budget and its gate-repair calls together. */
export const LEASE_MAX_CALLS_PER_GENERATION = LEASE_MAX_CALLS + LEASE_GATE_REPAIR_CALLS;
/** The most calls of one lease in flight at once (§8.3). */
export const LEASE_MAX_IN_FLIGHT = 4;
/** The shortest a lease is valid. */
export const LEASE_TTL_MS = 15 * 60 * 1000;
/** The longest a lease is valid: room for 12 waves of calls, each allowed the route's whole deadline. */
export const LEASE_MAX_TTL_MS = 180 * 60 * 1000;
/** A slot older than this is free again: its call has ended, whatever became of the release (the route's deadline + 30 s). */
export const LEASE_SLOT_STALE_MS = MODEL_CALL_DEADLINE_MS + 30_000;
/** Leases per account and window. */
export const LEASES_PER_WINDOW = 3;
export const LEASE_WINDOW_MS = 60 * 60 * 1000;
/**
 * How long a lease may wait for the hourly charge of the request that issued
 * it (`charged: false`). Past this the request is taken to have died between
 * the issue and the charge: the lease is not reused, and a new run supersedes it.
 */
export const LEASE_CHARGE_PENDING_MS = 60_000;
/** The most fill calls a plan may say it needs (120 units ÷ ≤ 4 per call, rounded up generously). */
export const LEASE_MAX_PLANNED_CALLS = 40;

/** A run id: what the browser draws for one click of *Generate* (`crypto.randomUUID()` or the like). */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const isRunId = (v: unknown): v is string => typeof v === 'string' && RUN_ID_PATTERN.test(v);

/** The refusal codes, one per reason a reader or a client branches on. */
export const LEASE_CODES = {
  invalid: 'lease-invalid',
  closed: 'lease-closed',
  expired: 'lease-expired',
  exhausted: 'lease-exhausted',
  busy: 'lease-busy',
  stage: 'lease-stage',
  /** A leased prompt above `LEASED_PROMPT_MAX_CHARS` (`fill-prompt.ts`): this call is refused, the lease is not touched. */
  promptTooLarge: 'lease-prompt-too-large',
  /** A call marked `gateRepair` whose prompt is not a repair of gate errors (`isGateRepairPrompt`): refused, the lease is not touched. */
  gateRepair: 'lease-gate-repair-invalid',
  hourly: 'lease-hourly-limit',
} as const;

export type LeaseStatus = 'open' | 'superseded' | 'closed';

export interface LeaseRecord {
  v: number;
  leaseId: string;
  projectId: string;
  uid: string;
  generationToken: string;
  /** The run (one click of *Generate*) the lease was issued to; null on a lease from before 13.10.2026 or a request that named none. */
  runId?: string | null;
  plannedCalls: number;
  budget: number;
  used: number;
  /**
   * Calls held apart for gate repairs (`LEASE_GATE_REPAIR_CALLS`, owner decision 14.10.2026), spent only by a
   * marked gate-repair call once `used` has reached `budget`. Absent on a lease from before: none.
   */
  gateRepairBudget?: number;
  /** Gate-repair calls spent beyond `budget`. Absent on a lease from before: none. */
  gateRepairUsed?: number;
  /** The in-flight count as last written; `slots` decides when present. */
  inFlight: number;
  /** When each in-flight call took its slot (epoch ms). Absent on a lease from before 13.10.2026. */
  slots?: number[];
  status: LeaseStatus;
  /**
   * `false` from the issue until the hourly charge of the issuing request
   * succeeded (QA leftovers of hotfix 2, roadmap 3.0.13): a pending lease is
   * neither reused nor usable for a call, so a concurrent retry of the same run
   * cannot get it before it is paid for. Absent on a lease from before — those
   * were charged before they were returned.
   */
  charged?: boolean;
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
    (v.runId === undefined || v.runId === null || typeof v.runId === 'string') &&
    isCount(v.plannedCalls) &&
    isCount(v.budget) &&
    v.budget <= LEASE_MAX_CALLS &&
    isCount(v.used) &&
    (v.gateRepairBudget === undefined || (isCount(v.gateRepairBudget) && v.gateRepairBudget <= LEASE_GATE_REPAIR_CALLS)) &&
    (v.gateRepairUsed === undefined || (isCount(v.gateRepairUsed) && v.gateRepairUsed <= (isCount(v.gateRepairBudget) ? v.gateRepairBudget : 0))) &&
    isCount(v.inFlight) &&
    (v.slots === undefined || (Array.isArray(v.slots) && v.slots.every(isCount))) &&
    (v.status === 'open' || v.status === 'superseded' || v.status === 'closed') &&
    (v.charged === undefined || typeof v.charged === 'boolean') &&
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

/** The slots still held at `now`: taken less than `LEASE_SLOT_STALE_MS` ago. */
export function liveSlots(slots: readonly number[], now: number): number[] {
  return slots.filter((t) => now - t < LEASE_SLOT_STALE_MS);
}

/** Calls of this lease in flight at `now` — from the slots' times, or the stored count on a lease without them. */
export function inFlightAt(lease: LeaseRecord, now: number): number {
  return Array.isArray(lease.slots) ? liveSlots(lease.slots, now).length : lease.inFlight;
}

/** Gate-repair calls of this lease still left (none on a lease from before 14.10.2026). */
export function gateRepairLeft(lease: Pick<LeaseRecord, 'gateRepairBudget' | 'gateRepairUsed'>): number {
  return Math.max(0, (lease.gateRepairBudget ?? 0) - (lease.gateRepairUsed ?? 0));
}

/**
 * Which of the lease's calls a call that may run spends: `budget` while any of the lease's budget is left — a
 * gate repair too — and `gate-repair` (the calls held apart, owner decision 14.10.2026) only for a call marked
 * `gateRepair` once the budget is used.
 */
export type LeasePool = 'budget' | 'gate-repair';

/**
 * May this call run under this lease? Checked before the provider call (and
 * again inside the transaction that counts it). The same answer for "no such
 * lease" and "another account's lease", so a lease id cannot be probed.
 *
 * `gateRepair`: the call is a repair of gate errors (the route has checked its prompt with `isGateRepairPrompt`);
 * only such a call may spend the gate-repair calls, and only after the budget — never more than
 * `LEASE_MAX_CALLS_PER_GENERATION` in all.
 */
export function decideLeaseCall(
  lease: unknown,
  ctx: { uid: string; projectId: string; now: number; gateRepair?: boolean },
): { ok: true; lease: LeaseRecord; pool: LeasePool } | LeaseRefusal {
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
  if (lease.charged === false) {
    return refuse(429, LEASE_CODES.busy, 'This generation lease is still being prepared. Retry in a moment.');
  }
  if (ctx.now >= lease.expiresAt) {
    return refuse(403, LEASE_CODES.expired, 'This generation lease has expired. Start the generation again.');
  }
  const pool: LeasePool | null =
    lease.used < lease.budget
      ? 'budget'
      : ctx.gateRepair === true && gateRepairLeft(lease) > 0 && lease.used + (lease.gateRepairUsed ?? 0) < LEASE_MAX_CALLS_PER_GENERATION
        ? 'gate-repair'
        : null;
  if (pool === null) {
    const extra = lease.gateRepairBudget ?? 0;
    return refuse(
      429,
      LEASE_CODES.exhausted,
      ctx.gateRepair === true && extra > 0
        ? `This generation has used all ${lease.budget} model calls of its lease and its ${extra} calls for gate repairs.`
        : `This generation has used all ${lease.budget} model calls of its lease.`,
    );
  }
  if (inFlightAt(lease, ctx.now) >= LEASE_MAX_IN_FLIGHT) {
    return refuse(429, LEASE_CODES.busy, `At most ${LEASE_MAX_IN_FLIGHT} model calls of one generation run at once. Retry when one has finished.`);
  }
  return { ok: true, lease, pool };
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
 *
 * Reused only for the same account, generation token **and run**: a request
 * that names no run matches only a lease that names none (a client from before
 * the run id), so a run never takes over the lease — and the in-flight slots —
 * of another run.
 */
export function decideLeaseIssue(input: {
  uid: string;
  generationToken: string;
  runId?: string | null;
  plannedCalls: number;
  now: number;
  open: readonly unknown[];
  windowIssued: readonly unknown[];
}): LeaseIssueDecision {
  const usable = input.open.filter(isLeaseRecord).filter((l) => l.status === 'open');
  const same = usable.find(
    (l) =>
      l.uid === input.uid &&
      l.generationToken === input.generationToken &&
      (l.runId ?? null) === (input.runId ?? null) &&
      input.now < l.expiresAt &&
      l.used < l.budget,
  );
  if (same && same.charged === false) {
    // Issued to this run, its charge not yet through: a concurrent retry waits
    // rather than takes a lease nobody has paid for. A pending lease whose
    // request died long ago is neither reused nor waited for — the new lease
    // below supersedes it.
    if (input.now - same.createdAt < LEASE_CHARGE_PENDING_MS) {
      return {
        kind: 'refuse',
        status: 429,
        code: LEASE_CODES.busy,
        error: 'This generation is still being prepared. Retry in a moment.',
        retryAfterSeconds: Math.max(1, Math.ceil((same.createdAt + LEASE_CHARGE_PENDING_MS - input.now) / 1000)),
      };
    }
  } else if (same) return { kind: 'reuse', lease: same };

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
  runId?: string | null;
  plannedCalls: number;
  budget: number;
  now: number;
  /** `false` while the issuing request's hourly charge is pending (`charged` on the record). */
  charged: boolean;
}): LeaseRecord {
  return {
    v: LEASE_RECORD_VERSION,
    leaseId: input.leaseId,
    projectId: input.projectId,
    uid: input.uid,
    generationToken: input.generationToken,
    runId: input.runId ?? null,
    plannedCalls: Math.min(Math.max(1, Math.floor(input.plannedCalls) || 1), LEASE_MAX_PLANNED_CALLS),
    budget: input.budget,
    used: 0,
    gateRepairBudget: LEASE_GATE_REPAIR_CALLS,
    gateRepairUsed: 0,
    inFlight: 0,
    slots: [],
    status: 'open',
    charged: input.charged,
    createdAt: input.now,
    expiresAt: input.now + leaseTtlMs(input.budget),
  };
}

/**
 * May this account close this lease? Only its own, and only while it is open;
 * the same "nothing to close" for a lease that is not there and one that is
 * not the caller's, so a lease id cannot be probed. Closing is what *Cancel*
 * does: from then on the lease's late calls are refused (`lease-closed`) and
 * their releases touch only this record.
 */
export function decideLeaseClose(lease: unknown, ctx: { uid: string; projectId: string }): 'close' | 'nothing' {
  if (!isLeaseRecord(lease) || lease.uid !== ctx.uid || lease.projectId !== ctx.projectId) return 'nothing';
  return lease.status === 'open' ? 'close' : 'nothing';
}

/** What a client is told about its lease — never the token or the account. */
export function leaseView(lease: LeaseRecord): {
  projectId: string;
  leaseId: string;
  budget: number;
  used: number;
  gateRepairBudget: number;
  gateRepairUsed: number;
  expiresAt: number;
  maxInFlight: number;
} {
  return {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    budget: lease.budget,
    used: lease.used,
    gateRepairBudget: lease.gateRepairBudget ?? 0,
    gateRepairUsed: lease.gateRepairUsed ?? 0,
    expiresAt: lease.expiresAt,
    maxInFlight: LEASE_MAX_IN_FLIGHT,
  };
}

/**
 * Where the account stands in its hourly window of leases — what the start
 * screen says before the click (owner, 13.10.2026): how many generations of
 * the hour are used and, when none is left, when the next one is.
 */
export function leaseWindowStatus(windowIssued: readonly unknown[], now: number): { used: number; limit: number; nextFreeInSeconds: number | null } {
  const recent = windowIssued
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    .filter((t) => t > now - LEASE_WINDOW_MS)
    .sort((a, b) => a - b);
  return {
    used: Math.min(recent.length, LEASES_PER_WINDOW),
    limit: LEASES_PER_WINDOW,
    nextFreeInSeconds: recent.length >= LEASES_PER_WINDOW ? Math.max(1, Math.ceil((recent[0] + LEASE_WINDOW_MS - now) / 1000)) : null,
  };
}
