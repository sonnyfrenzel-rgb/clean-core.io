/**
 * The orchestrator of the step-wise fills, the checks and the targeted repair
 * (`docs/design/engine-led-transformation.md` §8.3, §13, §16.1; Track C).
 *
 * In: the fill units (already sliced, in `FillRequestUnit` form), the model
 * call (under a lease), the body guards (Track B's `bodyGuards`), the checks
 * (lints in the browser, engine cases and probes on the runner), the call
 * budget of the lease. Out: per unit a body or the reason there is none, who
 * wrote it (model, model after repair round n, nobody), what still fails, and
 * the events the generation screen renders (§15.5).
 *
 * The rules it keeps:
 *
 *   - **Order**: leaves first (callees before callers), the orchestrator unit
 *     last (`fillOrder`).
 *   - **≤ 4 calls in flight** per generation (the server enforces the same cap
 *     on the lease); **≤ 4 units and ≤ 14,000 characters** per call
 *     (`bundleFills`).
 *   - **Retry per call**: a 429 or a transient provider error waits (2 s, then
 *     4 s for a 429) and asks the same call once more. A refusal of the lease
 *     itself (used up, expired, closed, not this account's) stops the
 *     generation: no further call could succeed.
 *   - **Retry per unit**: a unit whose answer was unusable (no JSON, not
 *     answered, the call failed) is asked once more, alone. Unusable twice →
 *     the stub stays and the unit is *not written* with that reason.
 *   - **A declined unit** (`refused` by the model) stays a stub with the
 *     model's reason — never guessed (owner decision 12.10.2026, Q4: the
 *     package is stored with the stub and the phase reads partial).
 *   - **Partial results**: whatever was written stays written; the result
 *     says which units are not, and why.
 *   - **Cancellation** really aborts: one AbortController is linked to the
 *     caller's signal and handed to every model call (the proxy aborts the
 *     provider call of a leased request when its request goes); no new call
 *     starts after the abort.
 *   - **Repair (§13.2)**: only failing units go back, with their failure
 *     (≤ 2,000 characters) and their previous body; at most two rounds; stop
 *     when everything passes, after round 2, when the budget is used, or when
 *     a round fixes nothing (the same failures twice). A failure no unit owns
 *     is a scaffold finding, never sent to the model. A failing body is kept
 *     (a reviewable draft) unless the body guards refused it (then the stub
 *     stays).
 *
 * Pure: no network, no Firestore, no React. Every effect is injected, so the
 * specs drive it with a fake model and a fake clock.
 */

import { decideGenerationRepair, GENERATION_REPAIR_MAX_ROUNDS } from '../repair-draft';
import { bundleFills, parseFillAnswer, type BundleOptions, type FillBundle } from './fill-prompt';

import type { FillRepair, FillRequestUnit, GenerationEvent, Unit } from './types';

/** One model call: the prompt in, the answer text out; must honour the signal. */
export type FillModel = (prompt: string, signal: AbortSignal) => Promise<string>;

export type CheckKind = 'lint' | 'cases' | 'probes';

export interface CheckFailure {
  /** The unit the failure belongs to, or null when it is in engine-written code. */
  unitId: string | null;
  check: CheckKind;
  failure: string;
}

/**
 * Who decides a check's outcome (roadmap 3.0.12, step E): `engine-code` — the
 * check runs only code Clean-Core.io wrote (input contract, decimals, CSV, run
 * store), so it says nothing about the model-written functions; `fills` — the
 * check can reach the written functions.
 */
export type CheckScope = 'engine-code' | 'fills';

/**
 * One check's count. `total` is every result; `passed`, `failed` and `notRun`
 * split it — a skipped or not-run result is never a run that passed. The
 * runner checks (cases, probes) carry a `scope` each.
 */
export interface CheckCount {
  kind: CheckKind;
  total: number;
  failed: number;
  passed?: number;
  notRun?: number;
  scope?: CheckScope;
  /** The reason every not-run result shares, when they all share one. */
  notRunReason?: string | null;
  /** The base request threw inside the written functions (the message), so no case could pass. */
  baseThrew?: string | null;
  ms: number;
}

export interface VerifyOutcome {
  checks: CheckCount[];
  failures: CheckFailure[];
  /** Checks that could not run, with the reason (runner unreachable, no call contract …). */
  notRun: Array<{ kind: CheckKind; reason: string }>;
}

export type Verify = (bodies: ReadonlyMap<string, string>, ctx: { round: number; signal: AbortSignal }) => Promise<VerifyOutcome>;

export interface OrchestratorInput {
  units: readonly FillRequestUnit[];
  /** Call-tree facts for the order; without it the given order stands. */
  plan?: ReadonlyArray<Pick<Unit, 'id' | 'kind' | 'callees'>>;
  bundleOptions: Omit<BundleOptions, 'repair' | 'unitsPerCall'>;
  model: FillModel;
  /** Track B's body guards: the reason a body is refused, or null when it may be spliced. */
  guardBody: (unitId: string, body: string, needs: readonly string[]) => string | null;
  verify: Verify;
  /** Model calls this generation may make (the lease's budget). */
  budget: number;
  maxInFlight?: number;
  signal?: AbortSignal;
  onEvent?: (event: GenerationEvent) => void;
  /** Injected for the specs; resolves early when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export type FilledBy = 'model' | 'model-repair-1' | 'model-repair-2' | 'not-filled';

export interface UnitOutcome {
  unitId: string;
  state: 'written' | 'not-written';
  body: string | null;
  filledBy: FilledBy;
  /** Why there is no body (declined, unusable twice, refused by the guards, budget, cancelled). */
  reason: string | null;
  /** Check failures that remain on a kept body. */
  failures: string[];
  /** The accepted predicate bodies of the unit's guards, by fill region (`U02.G0506`, design §9.1). */
  predicates: Record<string, string>;
}

export type StopReason = 'passed' | 'round-limit' | 'budget' | 'no-progress' | 'lease' | 'cancelled';

export interface GenerationRunResult {
  /** complete: every unit written and every check that ran passed; partial: anything less; cancelled: stopped by the caller. */
  status: 'complete' | 'partial' | 'cancelled';
  units: UnitOutcome[];
  callsUsed: number;
  rounds: number;
  stop: StopReason;
  /** Failures in engine-written code: our bug, never sent to the model (§13.2 step 2). */
  scaffoldFindings: string[];
  checksNotRun: VerifyOutcome['notRun'];
  /** The largest number of model calls that were in flight at once. */
  maxInFlightSeen: number;
}

export const ORCHESTRATOR_MAX_IN_FLIGHT = 4;
export const REPAIR_MAX_ROUNDS = GENERATION_REPAIR_MAX_ROUNDS;
export const RETRY_WAIT_MS = { transient: 2_000, rateLimited: 4_000 } as const;

/** Codes of `/api/gemini` that refuse the lease itself: no later call can succeed. */
const LEASE_STOP_CODES = new Set(['lease-invalid', 'lease-closed', 'lease-expired', 'lease-exhausted', 'lease-stage']);

export type ModelErrorKind = 'aborted' | 'lease' | 'retry-transient' | 'retry-rate' | 'fatal';

/** How a failed model call is handled, read from the error `callGemini` throws (`status`, `code`). */
export function modelErrorKind(err: unknown, signal?: AbortSignal): ModelErrorKind {
  const e = (err ?? {}) as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  if (signal?.aborted || e.name === 'AbortError') return 'aborted';
  const code = typeof e.code === 'string' ? e.code : '';
  if (LEASE_STOP_CODES.has(code)) return 'lease';
  const status = typeof e.status === 'number' ? e.status : 0;
  if (code === 'lease-busy' || status === 429) return 'retry-rate';
  const message = typeof e.message === 'string' ? e.message : '';
  if (status === 503 || status === 500 || /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|network/i.test(message)) return 'retry-transient';
  return 'fatal';
}

/**
 * Leaves first: a unit after every unit it calls, the orchestrator units last;
 * among equals the given order. Cycles (mutual recursion) keep the given order.
 */
export function fillOrder(plan: ReadonlyArray<Pick<Unit, 'id' | 'kind' | 'callees'>>): string[] {
  const ids = plan.map((u) => u.id);
  const known = new Set(ids);
  const byId = new Map(plan.map((u) => [u.id, u]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: string[] = [];
  const visit = (id: string) => {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const c of byId.get(id)?.callees ?? []) if (known.has(c) && byId.get(c)?.kind !== 'orchestrator') visit(c);
    visiting.delete(id);
    done.add(id);
    out.push(id);
  };
  for (const u of plan) if (u.kind !== 'orchestrator') visit(u.id);
  for (const u of plan) if (u.kind === 'orchestrator') visit(u.id);
  return out;
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface UnitState {
  unitId: string;
  /** A body the guards accepted and that is spliced. */
  body: string | null;
  /** A body the guards refused (for the repair's "previous body"); never spliced. */
  refusedBody: string | null;
  filledBy: FilledBy;
  /** Why there is no body, when there is none. */
  reason: string | null;
  /** The unit is out of the loop: declined by the model or unusable twice. */
  final: boolean;
  failures: string[];
  /** Accepted predicate bodies by region, and why a predicate of the unit is still a stub (a repair reason). */
  predicates: Map<string, string>;
  predicateGaps: string[];
}

export async function runGeneration(input: OrchestratorInput): Promise<GenerationRunResult> {
  const now = input.now ?? (() => Date.now());
  const sleep = input.sleep ?? defaultSleep;
  const emit = (e: GenerationEvent) => {
    try {
      input.onEvent?.(e);
    } catch {
      // A renderer that throws must not stop the generation.
    }
  };
  const maxInFlight = Math.max(1, Math.min(input.maxInFlight ?? ORCHESTRATOR_MAX_IN_FLIGHT, ORCHESTRATOR_MAX_IN_FLIGHT));

  // Two controllers. `calls` is handed to every model call and aborts them
  // all — on the caller's cancel, and when the lease itself is refused (no
  // further call could succeed). `checks` follows the caller's cancel only:
  // a generation the lease stopped still checks what it has.
  const calls = new AbortController();
  const checks = new AbortController();
  const onCancel = () => {
    calls.abort();
    checks.abort();
  };
  if (input.signal?.aborted) onCancel();
  else input.signal?.addEventListener('abort', onCancel, { once: true });
  const cancelled = () => checks.signal.aborted;

  const order = input.plan ? fillOrder(input.plan) : input.units.map((u) => u.unitId);
  const unitById = new Map(input.units.map((u) => [u.unitId, u]));
  const ordered = [
    ...order.map((id) => unitById.get(id)).filter((u): u is FillRequestUnit => !!u),
    ...input.units.filter((u) => !order.includes(u.unitId)),
  ];
  const states = new Map<string, UnitState>(
    ordered.map((u) => [u.unitId, { unitId: u.unitId, body: null, refusedBody: null, filledBy: 'not-filled', reason: null, final: false, failures: [], predicates: new Map(), predicateGaps: [] } as UnitState]),
  );

  let callsUsed = 0;
  let inFlight = 0;
  let maxInFlightSeen = 0;
  let stoppedBy: 'lease' | 'budget' | null = null;
  const halted = () => calls.signal.aborted || stoppedBy !== null;

  type CallOutcome = { text: string } | { error: string };

  /** One model call, asked once more after a 429 or a transient error. */
  async function call(prompt: string): Promise<CallOutcome> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (calls.signal.aborted) return { error: cancelled() ? 'cancelled' : 'the lease ended' };
      if (callsUsed >= input.budget) {
        stoppedBy = stoppedBy ?? 'budget';
        return { error: `the generation's ${input.budget} model calls are used up` };
      }
      callsUsed++;
      inFlight++;
      maxInFlightSeen = Math.max(maxInFlightSeen, inFlight);
      let failure: unknown;
      try {
        return { text: await input.model(prompt, calls.signal) };
      } catch (err) {
        failure = err;
      } finally {
        inFlight--;
      }
      const kind = modelErrorKind(failure, calls.signal);
      const message = failure instanceof Error ? failure.message : String(failure);
      if (kind === 'aborted') return { error: cancelled() ? 'cancelled' : 'the lease ended' };
      if (kind === 'lease') {
        stoppedBy = 'lease';
        calls.abort();
        return { error: cut(message || 'the lease ended', 300) };
      }
      if (kind === 'fatal' || attempt === 1) return { error: cut(message || 'the model call failed', 300) };
      await sleep(kind === 'retry-rate' ? RETRY_WAIT_MS.rateLimited : RETRY_WAIT_MS.transient, calls.signal);
    }
    return { error: 'the model call failed' };
  }

  /** The bundles, at most `maxInFlight` at a time; nothing new starts once the generation is halted. */
  async function runBundles(bundles: FillBundle[], onAnswer: (bundle: FillBundle, outcome: CallOutcome) => void) {
    let next = 0;
    const worker = async () => {
      while (next < bundles.length && !halted()) {
        const b = bundles[next++];
        for (const id of b.unitIds) emit({ t: 'fill', unitId: id, state: 'writing', at: now() });
        onAnswer(b, await call(b.prompt));
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxInFlight, bundles.length) }, worker));
  }

  const filledByRound = (round: 0 | 1 | 2): FilledBy => (round === 0 ? 'model' : round === 1 ? 'model-repair-1' : 'model-repair-2');

  /**
   * Read one answer into the unit states. Returns the units whose answer was
   * unusable. In a repair round an unusable or declined answer leaves the
   * unit as it was.
   */
  function take(b: FillBundle, outcome: CallOutcome, round: 0 | 1 | 2): string[] {
    const unusable = (ids: readonly string[], reason: string) => {
      for (const id of ids) {
        if (round === 0) states.get(id)!.reason = reason;
        emit({ t: 'fill', unitId: id, state: 'unusable', at: now() });
      }
      return [...ids];
    };
    if ('error' in outcome) return unusable(b.unitIds, `the model call failed: ${outcome.error}`);
    const parsed = parseFillAnswer(outcome.text, b.unitIds);
    if (!parsed.ok) return unusable(b.unitIds, parsed.reason);
    for (const answer of parsed.units) {
      const st = states.get(answer.unitId)!;
      if (answer.refused) {
        if (round === 0) {
          st.final = true;
          st.reason = `the model declined: ${answer.refused.reason}`;
        }
        emit({ t: 'fill', unitId: answer.unitId, state: 'refused', at: now() });
        continue;
      }
      const refusal = input.guardBody(answer.unitId, answer.body, answer.needs);
      if (refusal) {
        // A refused body is never spliced, and never replaces a body that was accepted before.
        if (st.body === null) {
          st.refusedBody = answer.body;
          st.reason = `the body was refused by the checks on fills: ${refusal}`;
          st.failures = [`body guards: ${refusal}`];
        }
        emit({ t: 'fill', unitId: answer.unitId, state: 'refused', at: now() });
        continue;
      }
      st.body = answer.body;
      st.refusedBody = null;
      st.reason = null;
      st.filledBy = filledByRound(round);
      // The guards' predicates (design §9.1): each a region of its own, checked like a body.
      st.predicateGaps = [];
      for (const g of unitById.get(answer.unitId)?.guards ?? []) {
        if (!g.regionId) continue;
        const given = answer.guards?.[g.id];
        if (given === undefined) {
          if (!st.predicates.has(g.regionId)) st.predicateGaps.push(`the predicate of ${g.id} (${g.helper}) was not written`);
          continue;
        }
        const why = input.guardBody(g.regionId, given, answer.needs);
        if (why) {
          if (!st.predicates.has(g.regionId)) st.predicateGaps.push(`the predicate of ${g.id} was refused by the checks on fills: ${why}`);
        } else st.predicates.set(g.regionId, given);
      }
      st.failures = st.predicateGaps.map((p) => `body guards: ${p}`);
      emit({ t: 'fill', unitId: answer.unitId, state: 'written', at: now() });
    }
    return unusable(parsed.missing, 'the answer did not include this function');
  }

  const bundle = (units: FillRequestUnit[], repair: Map<string, FillRepair> | null, unitsPerCall?: number) =>
    bundleFills(units, { ...input.bundleOptions, repair, ...(unitsPerCall ? { unitsPerCall } : {}) });

  const scaffoldFindings: string[] = [];
  let checksNotRun: VerifyOutcome['notRun'] = [];
  let rounds = 0;
  let stop: StopReason = 'passed';

  try {
    // ── Fills: one wave, then each unusable unit once more, alone ─────────
    const unusable: string[] = [];
    await runBundles(bundle(ordered, null), (b, o) => unusable.push(...take(b, o, 0)));
    if (unusable.length > 0 && !halted()) {
      const again = ordered.filter((u) => unusable.includes(u.unitId));
      const stillUnusable: string[] = [];
      await runBundles(bundle(again, null, 1), (b, o) => stillUnusable.push(...take(b, o, 0)));
      for (const id of stillUnusable) {
        const st = states.get(id)!;
        if (st.body !== null || st.final) continue;
        st.final = true;
        st.reason = `not written — the answer was unusable twice (${st.reason ?? 'no answer'})`;
      }
    }
    // Units the halt left unasked keep their stub; their reason is set at the end.

    emit({
      t: 'check',
      kind: 'guards',
      total: [...states.values()].filter((s) => s.body !== null || s.refusedBody !== null).length,
      failed: [...states.values()].filter((s) => s.body === null && s.refusedBody !== null).length,
      ms: 0,
    });

    // ── Checks and repair rounds (§13.2) ─────────────────────────────────
    let previousSignature: string | null = null;
    while (!cancelled()) {
      // Bodies by fill region: the unit's body under its id, its predicates under theirs.
      const bodies = new Map<string, string>();
      for (const s of states.values()) {
        if (s.body === null) continue;
        bodies.set(s.unitId, s.body);
        for (const [region, p] of s.predicates) bodies.set(region, p);
      }
      let outcome: VerifyOutcome;
      try {
        outcome = await input.verify(bodies, { round: rounds, signal: checks.signal });
      } catch (err) {
        const reason = `the checks could not run: ${err instanceof Error ? err.message : String(err)}`;
        outcome = { checks: [], failures: [], notRun: (['lint', 'cases', 'probes'] as const).map((kind) => ({ kind, reason })) };
      }
      if (cancelled()) break;
      for (const c of outcome.checks) emit({ t: 'check', ...c });
      checksNotRun = outcome.notRun;

      // Failures back onto their units; a failure no written unit owns is ours.
      for (const s of states.values()) if (s.body !== null) s.failures = s.predicateGaps.map((p) => `body guards: ${p}`);
      scaffoldFindings.length = 0;
      for (const f of outcome.failures) {
        const st = f.unitId ? states.get(f.unitId) : undefined;
        if (!st || st.body === null) scaffoldFindings.push(`${f.check}: ${f.failure}`);
        else st.failures.push(`${f.check}: ${f.failure}`);
      }
      const failing = [...states.values()].filter((s) => !s.final && s.failures.length > 0);

      const decision = decideGenerationRepair({
        roundsDone: rounds,
        failing,
        previousSignature,
        callsLeft: stoppedBy === 'budget' ? 0 : input.budget - callsUsed,
        leaseEnded: stoppedBy === 'lease',
      });
      if (decision.kind === 'stop') {
        stop = decision.reason;
        break;
      }
      previousSignature = decision.signature;
      rounds = decision.round;
      const round = decision.round;
      const ids = decision.units.map((u) => u.unitId);
      emit({ t: 'repair', round, unitIds: ids, state: 'start' });
      const repair = new Map<string, FillRepair>(
        decision.units.map((u) => {
          const s = states.get(u.unitId)!;
          return [u.unitId, { unitId: u.unitId, round, failure: u.failure, previousBody: s.body ?? s.refusedBody }];
        }),
      );
      await runBundles(
        bundle(ordered.filter((u) => repair.has(u.unitId)), repair),
        (b, o) => void take(b, o, round),
      );
      const rewritten = ids.filter((id) => states.get(id)!.filledBy === filledByRound(round)).length;
      emit({ t: 'repair', round, unitIds: ids, state: 'done', fixed: rewritten });
    }
    if (cancelled()) stop = 'cancelled';
    // Checks that pass on a generation the lease or the budget cut short do
    // not make it a clean stop: the stop names why units are missing.
    else if (stop === 'passed' && stoppedBy) stop = stoppedBy;
  } finally {
    input.signal?.removeEventListener('abort', onCancel);
  }

  for (const st of states.values()) {
    if (st.body === null && st.reason === null) {
      st.reason =
        stop === 'cancelled'
          ? 'not written — the generation was cancelled'
          : stoppedBy === 'lease'
            ? 'not written — the lease ended'
            : `not written — the generation's ${input.budget} model calls are used up`;
    }
  }
  const units: UnitOutcome[] = ordered.map((u) => {
    const st = states.get(u.unitId)!;
    const written = st.body !== null;
    return {
      unitId: st.unitId,
      state: written ? 'written' : 'not-written',
      body: st.body,
      filledBy: written ? st.filledBy : 'not-filled',
      reason: written ? null : st.reason,
      failures: written ? st.failures : [],
      predicates: written ? Object.fromEntries(st.predicates) : {},
    };
  });
  if (stop === 'cancelled') emit({ t: 'failed', message: 'Cancelled — nothing was stored. Calls already sent were counted against this generation.' });
  const complete = stop !== 'cancelled' && units.every((u) => u.state === 'written' && u.failures.length === 0) && scaffoldFindings.length === 0;
  return {
    status: stop === 'cancelled' ? 'cancelled' : complete ? 'complete' : 'partial',
    units,
    callsUsed,
    rounds,
    stop,
    scaffoldFindings: [...scaffoldFindings],
    checksNotRun,
    maxInFlightSeen,
  };
}
