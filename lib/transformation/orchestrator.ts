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
 *   - **`lease-busy` is not a failure** (13.10.2026): the server's four slots
 *     are taken, so the call waits (`BUSY_WAIT_MS`, abortable, at most
 *     `BUSY_MAX_WAIT_MS` in all) and asks again — without using the call's
 *     one retry, and without counting against the budget.
 *   - **Only calls the server counted count**: a refusal before the lease
 *     counted the call (`serverCountedCall`, `error-codes.ts`) gives its call
 *     back to the budget. Counting every `lease-busy` in the browser used up
 *     a 48-call budget in seconds (13.10.2026).
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
 *   - **Gate repairs** (owner decision 14.10.2026, quality over cost — a call
 *     costs ≈ $0.005): a unit that fails the gate (the activation check's
 *     parser/syntax errors on RAP, the type check on Node; `GATE_CHECKS`) goes
 *     back in calls marked `gateRepair`. Those may go on past the budget on the
 *     lease's gate-repair calls (`gateRepairBudget`, at most 16 — the server
 *     counts them apart and honours the mark only on such a repair), and after
 *     round 2 the units failing the gate alone get a third round with the
 *     gate's mapped reasons. Every other call ends at the budget, as before.
 *
 * Pure: no network, no Firestore, no React. Every effect is injected, so the
 * specs drive it with a fake model and a fake clock.
 */

import { decideGenerationRepair, GENERATION_REPAIR_MAX_ROUNDS } from '../repair-draft';
import { LEASED_PROMPT_MAX_CHARS, bundleFills, isGateFailureLine, parseFillAnswer, type BundleOptions, type FillBundle } from './fill-prompt';
import { MODEL_CALL_DEADLINE_MS } from '../model-deadline';
import { serverCountedCall } from './error-codes';

import type { FillRepair, FillRequestUnit, GenerationEvent, Unit } from './types';

/**
 * One model call: the prompt in, the answer text out; must honour the signal. `meta.gateRepair`: the call repairs
 * gate errors only, and the lease may count it against its gate-repair calls (owner decision 14.10.2026).
 */
export type FillModel = (prompt: string, signal: AbortSignal, meta?: { gateRepair?: boolean }) => Promise<string>;

/** `abap` (3.0.13): abaplint's parser and syntax check of an ABAP candidate with the shipped configuration (`abap-check.ts`). */
export type CheckKind = 'lint' | 'cases' | 'probes' | 'formats' | 'abap' | 'types';

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
  /**
   * A deterministic touch on every answered body before the guards read it (3.0.13, B5: a line reference in a
   * comment that is not among the function's ABAP lines is marked as such). Identity when absent.
   */
  normalizeBody?: (regionId: string, body: string) => string;
  /**
   * A deterministic repair of a body the guards would refuse for a mechanical defect only (3.0.17 criterion 3: an ABAP
   * body without its final period, `repairFinalPeriod`): the repaired body and what TRACE.md says of it, or null. The
   * guards then run on the repaired body as on any other. Identity when absent.
   */
  repairBody?: (regionId: string, body: string, needs: readonly string[]) => { body: string; note: string } | null;
  verify: Verify;
  /**
   * The checks of the scaffold before any fill (3.0.13, ABAP route: the activation check). Reported, never
   * blocking: a failure here is in engine-written code — Clean-Core.io's, never sent to the model.
   */
  scaffoldCheck?: (signal: AbortSignal) => Promise<Pick<VerifyOutcome, 'failures'> | null>;
  /**
   * The checks that must have run, in full, for the generation to be complete (3.0.13, A2/A5) — on the Node
   * route the type check, the engine cases and the probes. A check in this list that did not run, or ran with
   * a result not run (a skipped case), leaves the generation `partial` and is named in `unverified`.
   */
  mustRun?: readonly CheckKind[];
  /** Model calls this generation may make (the lease's budget). */
  budget: number;
  /**
   * Calls beyond `budget` that only repairs of gate errors may make (the lease's `gateRepairBudget` less what is
   * used; owner decision 14.10.2026). 0 or absent: none, and no third round.
   */
  gateRepairBudget?: number;
  maxInFlight?: number;
  /** The largest prompt a call may carry; the route refuses a leased one above it (default `LEASED_PROMPT_MAX_CHARS`). */
  maxPromptChars?: number;
  signal?: AbortSignal;
  onEvent?: (event: GenerationEvent) => void;
  /** Injected for the specs; resolves early when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export type FilledBy = 'model' | 'model-repair-1' | 'model-repair-2' | 'model-repair-3' | 'not-filled';

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
  /** What the engine repaired in the accepted body (`repairBody`), said in TRACE.md; absent when nothing. */
  repairs?: string[];
  /** The code of why there is no body (`error-codes.ts`), and the HTTP status when a server said it. */
  code?: string | null;
  status?: number | null;
}

/**
 * Why the repair loop ended. `engine-code` (acceptance run 4, 14.10.2026): every written function passes, but a
 * check still fails in engine-written code — no repair round can reach it, so the loop does not call it passed.
 */
export type StopReason = 'passed' | 'engine-code' | 'round-limit' | 'budget' | 'no-progress' | 'lease' | 'cancelled';

export interface GenerationRunResult {
  /** complete: every unit written and every check that ran passed; partial: anything less; cancelled: stopped by the caller. */
  status: 'complete' | 'partial' | 'cancelled';
  units: UnitOutcome[];
  /** Every model call this generation made: of the budget and of the gate-repair calls together. */
  callsUsed: number;
  /** Of `callsUsed`, the calls spent beyond the budget on gate repairs (owner decision 14.10.2026). */
  gateRepairCallsUsed?: number;
  rounds: number;
  stop: StopReason;
  /** Failures in engine-written code: our bug, never sent to the model (§13.2 step 2). */
  scaffoldFindings: string[];
  /** What the scaffold check found before the fills (3.0.13) — engine-written code only; empty when it found nothing or did not run. */
  scaffoldBaseline?: string[];
  checksNotRun: VerifyOutcome['notRun'];
  /**
   * What of `mustRun` did not run in the last round, one phrase each ("engine cases: 26 of 26 not run — …").
   * Not empty: the generation is not verified — never complete, whatever passed (3.0.13, A2/A5).
   */
  unverified?: string[];
  /** The largest number of model calls that were in flight at once. */
  maxInFlightSeen: number;
}

export const ORCHESTRATOR_MAX_IN_FLIGHT = 4;
export const REPAIR_MAX_ROUNDS = GENERATION_REPAIR_MAX_ROUNDS;
export const RETRY_WAIT_MS = { transient: 2_000, rateLimited: 4_000 } as const;
/** How long a call the server answered `lease-busy` waits before it asks again. */
export const BUSY_WAIT_MS = 5_000;
/** The most one call waits for a free slot in all: a slot is freed at the latest when a running call reaches the route's deadline. */
export const BUSY_MAX_WAIT_MS = MODEL_CALL_DEADLINE_MS + 30_000;

/** Codes of `/api/gemini` that refuse the lease itself: no later call can succeed. */
const LEASE_STOP_CODES = new Set(['lease-invalid', 'lease-closed', 'lease-expired', 'lease-exhausted', 'lease-stage']);

export type ModelErrorKind = 'aborted' | 'lease' | 'busy' | 'retry-transient' | 'retry-rate' | 'fatal';

/** How a failed model call is handled, read from the error `callGemini` throws (`status`, `code`). */
export function modelErrorKind(err: unknown, signal?: AbortSignal): ModelErrorKind {
  const e = (err ?? {}) as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  if (signal?.aborted || e.name === 'AbortError') return 'aborted';
  const code = typeof e.code === 'string' ? e.code : '';
  if (LEASE_STOP_CODES.has(code)) return 'lease';
  const status = typeof e.status === 'number' ? e.status : 0;
  if (code === 'lease-busy') return 'busy';
  if (status === 429) return 'retry-rate';
  const message = typeof e.message === 'string' ? e.message : '';
  if (status === 503 || status === 500 || /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|network/i.test(message)) return 'retry-transient';
  return 'fatal';
}

/** The code and status of a failed model call, as the orchestrator reports them. */
export function modelErrorFacts(err: unknown): { code: string | null; status: number | null } {
  const e = (err ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  const status = typeof e.status === 'number' && e.status > 0 ? e.status : null;
  if (typeof e.code === 'string' && e.code) return { code: e.code, status };
  const message = typeof e.message === 'string' ? e.message : '';
  if (status === null && /fetch failed|network|Failed to fetch/i.test(message)) return { code: 'network-error', status };
  return { code: null, status };
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
  /** What the engine repaired in the accepted body and its predicates (`repairBody`). */
  repairs: string[];
  filledBy: FilledBy;
  /** Why there is no body, when there is none. */
  reason: string | null;
  code: string | null;
  status: number | null;
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
    ordered.map((u) => [u.unitId, { unitId: u.unitId, body: null, refusedBody: null, filledBy: 'not-filled', reason: null, code: null, status: null, final: false, failures: [], predicates: new Map(), predicateGaps: [], repairs: [] } as UnitState]),
  );

  // The budget's calls and, apart, the gate-repair calls beyond it (owner decision 14.10.2026): a call marked
  // gate repair spends the budget while any is left, then the gate-repair calls — as the server counts them.
  let callsUsed = 0;
  let gateCallsUsed = 0;
  const gateBudget = Math.max(0, Math.floor(input.gateRepairBudget ?? 0));
  const gateCallsLeft = () => gateBudget - gateCallsUsed;
  let inFlight = 0;
  let maxInFlightSeen = 0;
  let stoppedBy: 'lease' | 'budget' | null = null;
  /** The code that ended the lease, when a lease refusal stopped the generation. */
  let leaseStop: { code: string | null; status: number | null } | null = null;
  let callSeq = 0;
  /** No new call starts: cancelled, the lease ended, or the budget is used — for a gate repair, the gate-repair calls too. */
  const halted = (gate = false) => calls.signal.aborted || stoppedBy === 'lease' || (stoppedBy === 'budget' && !(gate && gateCallsLeft() > 0));

  type CallOutcome = { text: string } | { error: string; code?: string | null; status?: number | null; final?: boolean };
  const maxPromptChars = input.maxPromptChars ?? LEASED_PROMPT_MAX_CHARS;
  const ended = (): CallOutcome => (cancelled() ? { error: 'cancelled', code: 'cancelled' } : { error: 'the lease ended', ...(leaseStop ?? {}) });

  /**
   * One model call, asked once more after a 429 or a transient error. A
   * `lease-busy` refusal waits for a free slot and asks again without using
   * that retry; a refusal the server did not count gives its call back.
   */
  async function call(prompt: string, unitIds: readonly string[], gate = false): Promise<CallOutcome> {
    let busyWaited = 0;
    for (let attempt = 0; attempt < 2; ) {
      if (calls.signal.aborted) return ended();
      const pool: 'budget' | 'gate' | null = callsUsed < input.budget ? 'budget' : gate && gateCallsLeft() > 0 ? 'gate' : null;
      if (pool === null) {
        stoppedBy = stoppedBy ?? 'budget';
        return {
          error: gate && gateBudget > 0 ? `the generation's ${input.budget} model calls and its ${gateBudget} calls for gate repairs are used up` : `the generation's ${input.budget} model calls are used up`,
          code: 'call-budget-used',
        };
      }
      if (pool === 'budget') callsUsed++;
      else gateCallsUsed++;
      inFlight++;
      maxInFlightSeen = Math.max(maxInFlightSeen, inFlight);
      const callId = ++callSeq;
      emit({ t: 'call', callId, state: 'start', at: now() });
      let failure: unknown;
      try {
        const text = gate ? await input.model(prompt, calls.signal, { gateRepair: true }) : await input.model(prompt, calls.signal);
        emit({ t: 'call', callId, state: 'end', at: now(), admitted: true });
        return { text };
      } catch (err) {
        failure = err;
      } finally {
        inFlight--;
      }
      const kind = modelErrorKind(failure, calls.signal);
      const facts = modelErrorFacts(failure);
      // Refused before the lease counted it: the call is given back.
      const admitted = kind === 'aborted' || serverCountedCall(facts.code, facts.status);
      if (!admitted) {
        if (pool === 'budget') callsUsed--;
        else gateCallsUsed--;
      }
      emit({ t: 'call', callId, state: 'end', at: now(), admitted });
      const message = failure instanceof Error ? failure.message : String(failure);
      if (kind === 'aborted') return ended();
      if (kind === 'lease') {
        stoppedBy = 'lease';
        leaseStop = facts;
        calls.abort();
        return { error: cut(message || 'the lease ended', 300), ...facts };
      }
      if (kind === 'busy' && busyWaited < BUSY_MAX_WAIT_MS) {
        // Not a failed attempt: this generation's own calls hold the slots, and one frees soon.
        for (const id of unitIds) {
          emit({ t: 'fill', unitId: id, state: 'waiting-slot', at: now(), ...(facts.code ? { code: facts.code } : {}), ...(facts.status ? { status: facts.status } : {}) });
        }
        await sleep(BUSY_WAIT_MS, calls.signal);
        busyWaited += BUSY_WAIT_MS;
        if (!calls.signal.aborted) for (const id of unitIds) emit({ t: 'fill', unitId: id, state: 'writing', at: now() });
        continue;
      }
      if (kind === 'fatal' || attempt === 1) return { error: cut(message || 'the model call failed', 300), ...facts };
      await sleep(kind === 'retry-transient' ? RETRY_WAIT_MS.transient : RETRY_WAIT_MS.rateLimited, calls.signal);
      attempt++;
    }
    return { error: 'the model call failed' };
  }

  /**
   * The bundles, at most `maxInFlight` at a time; nothing new starts once the generation is halted. `gate`: the
   * bundles that repair gate errors only (marked so on their call).
   */
  async function runBundles(bundles: FillBundle[], onAnswer: (bundle: FillBundle, outcome: CallOutcome) => void, gate: ReadonlySet<FillBundle> = new Set()) {
    let next = 0;
    const worker = async () => {
      while (next < bundles.length && !halted(gate.has(bundles[next]))) {
        const b = bundles[next++];
        // A prompt the route would refuse is never sent: no call is spent on it,
        // and asking again would build the same prompt (QA finding 804d0920fff4).
        if (b.prompt.length > maxPromptChars) {
          onAnswer(b, {
            // 3.0.13 (B7): its ABAP is never sent cut, so a function too large for one call is not written, and says so.
            error: `its prompt has ${b.prompt.length.toLocaleString('en-US')} characters with its whole ABAP slice, more than the ${maxPromptChars.toLocaleString('en-US')} a fill call may carry — the slice is not sent cut`,
            code: 'lease-prompt-too-large',
            final: true,
          });
          continue;
        }
        for (const id of b.unitIds) emit({ t: 'fill', unitId: id, state: 'writing', at: now() });
        onAnswer(b, await call(b.prompt, b.unitIds, gate.has(b)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxInFlight, bundles.length) }, worker));
  }

  const filledByRound = (round: 0 | 1 | 2 | 3): FilledBy => (round === 0 ? 'model' : round === 1 ? 'model-repair-1' : round === 2 ? 'model-repair-2' : 'model-repair-3');

  /**
   * Read one answer into the unit states. Returns the units whose answer was
   * unusable. In a repair round an unusable or declined answer leaves the
   * unit as it was.
   */
  function take(b: FillBundle, outcome: CallOutcome, round: 0 | 1 | 2 | 3): string[] {
    const unusable = (ids: readonly string[], reason: string, code: string | null, status: number | null = null) => {
      for (const id of ids) {
        if (round === 0) {
          const st = states.get(id)!;
          st.reason = reason;
          st.code = code;
          st.status = status;
        }
        emit({ t: 'fill', unitId: id, state: 'unusable', at: now(), reason, ...(code ? { code } : {}), ...(status ? { status } : {}) });
      }
      return [...ids];
    };
    if ('error' in outcome && outcome.final) {
      // Not sent at all: the unit is out of the loop with the reason, in a fill
      // round; a repair round leaves it as it was.
      for (const id of b.unitIds) {
        const st = states.get(id)!;
        if (round === 0) {
          st.final = true;
          st.reason = `not written — ${outcome.error}`;
          st.code = outcome.code ?? null;
          st.status = outcome.status ?? null;
        }
        emit({ t: 'fill', unitId: id, state: 'unusable', at: now(), reason: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });
      }
      return [];
    }
    if ('error' in outcome) return unusable(b.unitIds, `the model call failed: ${outcome.error}`, outcome.code ?? null, outcome.status ?? null);
    const parsed = parseFillAnswer(outcome.text, b.unitIds);
    if (!parsed.ok) return unusable(b.unitIds, parsed.reason, 'answer-unusable');
    const normalize = input.normalizeBody ?? ((_: string, body: string) => body);
    for (const raw of parsed.units) {
      const answer = {
        ...raw,
        body: raw.refused ? raw.body : normalize(raw.unitId, raw.body),
        ...(raw.guards ? { guards: Object.fromEntries(Object.entries(raw.guards).map(([id, b]) => [id, normalize(`${raw.unitId}.${id.replace('-', '')}`, b)])) } : {}),
      };
      const st = states.get(answer.unitId)!;
      if (answer.refused) {
        if (round === 0) {
          st.final = true;
          st.reason = `the model declined: ${answer.refused.reason}`;
          st.code = 'model-declined';
          st.status = null;
        }
        emit({ t: 'fill', unitId: answer.unitId, state: 'refused', at: now(), reason: `the model declined: ${answer.refused.reason}`, code: 'model-declined' });
        continue;
      }
      // A mechanical defect only (a missing final period): the engine repairs it, and the same checks read the result.
      const repaired = input.repairBody?.(answer.unitId, answer.body, answer.needs) ?? null;
      if (repaired) answer.body = repaired.body;
      const refusal = input.guardBody(answer.unitId, answer.body, answer.needs);
      if (refusal) {
        // A refused body is never spliced, and never replaces a body that was accepted before.
        if (st.body === null) {
          st.refusedBody = answer.body;
          st.reason = `the body was refused by the checks on fills: ${refusal}`;
          st.code = 'body-refused';
          st.status = null;
          st.failures = [`body guards: ${refusal}`];
        }
        emit({ t: 'fill', unitId: answer.unitId, state: 'refused', at: now(), reason: `the body was refused by the checks on fills: ${refusal}`, code: 'body-refused' });
        continue;
      }
      st.body = answer.body;
      st.repairs = repaired ? [repaired.note] : [];
      st.refusedBody = null;
      st.reason = null;
      st.code = null;
      st.status = null;
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
        const fixed = input.repairBody?.(g.regionId, given, answer.needs) ?? null;
        const predicate = fixed ? fixed.body : given;
        const why = input.guardBody(g.regionId, predicate, answer.needs);
        if (why) {
          if (!st.predicates.has(g.regionId)) st.predicateGaps.push(`the predicate of ${g.id} was refused by the checks on fills: ${why}`);
        } else {
          st.predicates.set(g.regionId, predicate);
          if (fixed) st.repairs.push(`${g.id}: ${fixed.note}`);
        }
      }
      st.failures = st.predicateGaps.map((p) => `body guards: ${p}`);
      emit({ t: 'fill', unitId: answer.unitId, state: 'written', at: now() });
    }
    return unusable(parsed.missing, 'the answer did not include this function', 'answer-unusable');
  }

  const bundle = (units: FillRequestUnit[], repair: Map<string, FillRepair> | null, unitsPerCall?: number, gateRepair = false) =>
    bundleFills(units, { ...input.bundleOptions, repair, ...(unitsPerCall ? { unitsPerCall } : {}), ...(gateRepair ? { gateRepair } : {}) });

  const scaffoldFindings: string[] = [];
  let checksNotRun: VerifyOutcome['notRun'] = [];
  let lastChecks: CheckCount[] = [];
  let checksRan = false;
  let rounds = 0;
  let stop: StopReason = 'passed';

  const scaffoldBaseline: string[] = [];
  try {
    // ── The scaffold as the engine wrote it, before any fill (3.0.13) ─────
    if (input.scaffoldCheck && !cancelled()) {
      try {
        const base = await input.scaffoldCheck(checks.signal);
        for (const f of base?.failures ?? []) scaffoldBaseline.push(`before the fills, ${f.check}: ${f.failure}`);
      } catch {
        // Reported, never blocking: a scaffold check that cannot run leaves the generation as it was.
      }
    }

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
        const kinds = new Set<CheckKind>(['lint', 'cases', 'probes', ...(input.mustRun ?? [])]);
        outcome = { checks: [], failures: [], notRun: [...kinds].map((kind) => ({ kind, reason })) };
      }
      if (cancelled()) break;
      for (const c of outcome.checks) emit({ t: 'check', ...c });
      checksNotRun = outcome.notRun;
      lastChecks = outcome.checks;
      checksRan = true;

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
        // Gate repairs (owner decision 14.10.2026): only with calls held for them on the lease.
        ...(gateBudget > 0 ? { gate: { isGate: isGateFailureLine, callsLeft: gateCallsLeft() } } : {}),
      });
      if (decision.kind === 'stop') {
        stop = decision.reason === 'passed' && scaffoldFindings.length > 0 ? 'engine-code' : decision.reason;
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
          // The predicates the failure names travel with it (3.0.14 item 1: `predicate G-0685 line 1 — TS2367 …`).
          const named = [...s.predicates].map(([region, body]) => [`G-${region.slice(region.indexOf('.') + 2)}`, body] as const).filter(([id]) => u.failure.includes(`predicate ${id}`));
          return [u.unitId, { unitId: u.unitId, round, failure: u.failure, previousBody: s.body ?? s.refusedBody, ...(named.length > 0 ? { previousGuards: Object.fromEntries(named) } : {}) }];
        }),
      );
      // Units failing the gate travel in calls of their own, marked as gate repairs; the others as before. A gate
      // repair carries the failing body whole with its errors and declarations, not the ABAP slice again (3.0.14
      // item 2: the largest units' repairs went over the leased cap and were never sent).
      const gateIds = new Set(decision.units.filter((u) => u.gate && gateBudget > 0).map((u) => u.unitId));
      const gateBundles = bundle(ordered.filter((u) => gateIds.has(u.unitId)), repair, undefined, true);
      const otherBundles = bundle(ordered.filter((u) => repair.has(u.unitId) && !gateIds.has(u.unitId)), repair);
      await runBundles([...otherBundles, ...gateBundles], (b, o) => void take(b, o, round), new Set(gateBundles));
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
      const end = stop === 'cancelled' ? { code: 'cancelled', status: null } : stoppedBy === 'lease' ? (leaseStop ?? { code: null, status: null }) : { code: 'call-budget-used', status: null };
      st.code = end.code;
      st.status = end.status;
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
      ...(written && st.repairs.length > 0 ? { repairs: [...st.repairs] } : {}),
      code: written ? null : st.code,
      status: written ? null : st.status,
    };
  });
  if (stop === 'cancelled') emit({ t: 'failed', message: 'Cancelled — nothing was stored. Calls already sent were counted against this generation.' });
  const unverified = unverifiedOf(input.mustRun ?? [], checksRan ? lastChecks : [], checksRan ? checksNotRun : null);
  const complete =
    stop !== 'cancelled' && units.every((u) => u.state === 'written' && u.failures.length === 0) && scaffoldFindings.length === 0 && unverified.length === 0;
  return {
    status: stop === 'cancelled' ? 'cancelled' : complete ? 'complete' : 'partial',
    units,
    callsUsed: callsUsed + gateCallsUsed,
    ...(gateBudget > 0 ? { gateRepairCallsUsed: gateCallsUsed } : {}),
    rounds,
    stop,
    scaffoldFindings: [...scaffoldFindings],
    scaffoldBaseline,
    checksNotRun,
    unverified,
    maxInFlightSeen,
  };
}

const KIND_WORDS: Record<CheckKind, string> = {
  lint: 'lint checks',
  cases: 'engine cases',
  probes: 'failure-pattern probes',
  formats: 'file-format checks',
  abap: 'activation check',
  types: 'type check',
};

/**
 * What of the checks that must run did not, in the last round's outcome (`notRun: null` — no round of checks
 * ran at all). A check absent from the outcome did not run; one whose results were skipped or not run ran
 * only in part: a skipped case is never evidence (3.0.13, A5).
 */
export function unverifiedOf(mustRun: readonly CheckKind[], checks: readonly CheckCount[], notRun: VerifyOutcome['notRun'] | null): string[] {
  const out: string[] = [];
  for (const kind of mustRun) {
    const words = KIND_WORDS[kind] ?? kind;
    if (notRun === null) {
      out.push(`${words} not run: no round of checks ran`);
      continue;
    }
    const why = notRun.find((n) => n.kind === kind);
    if (why) {
      out.push(`${words} not run — ${why.reason.replace(/\.$/, '')}`);
      continue;
    }
    const ofKind = checks.filter((c) => c.kind === kind);
    if (ofKind.length === 0) {
      out.push(`${words} not run: no result`);
      continue;
    }
    const total = ofKind.reduce((n, c) => n + c.total, 0);
    const open = ofKind.reduce((n, c) => n + (c.notRun ?? 0), 0);
    if (total === 0) out.push(`${words}: none ran`);
    else if (open > 0) {
      const reason = ofKind.map((c) => c.notRunReason).find((r) => !!r);
      out.push(`${words}: ${open} of ${total} not run${reason ? ` — ${reason.replace(/\.$/, '')}` : ''}`);
    }
  }
  return out;
}
