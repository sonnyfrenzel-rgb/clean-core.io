/**
 * Before the click (owner, 13.10.2026): the plan, the limits that apply to
 * it, and whether it can succeed at all. A run that cannot succeed does not
 * start — the button says why, with the code and what to do; a plan where only
 * some functions are affected starts, and says up front which ones will not be
 * written and why.
 *
 * Every number comes from the constants the server enforces (`lease.ts`,
 * `model-deadline.ts`, `fill-prompt.ts`), so the screen cannot promise a limit
 * the server does not keep. Pure.
 */

import { MODEL_CALL_DEADLINE_MS } from '../model-deadline';
import { explainCode, type CodeExplanation } from './error-codes';
import { LEASED_PROMPT_MAX_CHARS } from './fill-prompt';
import {
  LEASE_GATE_REPAIR_CALLS,
  LEASE_MAX_CALLS,
  LEASE_MAX_CALLS_PER_GENERATION,
  LEASE_MAX_IN_FLIGHT,
  LEASE_MAX_PLANNED_CALLS,
  LEASES_PER_WINDOW,
  leaseBudget,
  leaseTtlMs,
} from './lease';
import { expectedFillDuration, expectedWords, minutesWords } from './duration-estimate';

export interface PreflightInput {
  /** Functions with a fill region. */
  functions: number;
  /** The fill calls the first wave needs (bundles), uncapped. */
  fillCalls: number;
  /** The functions whose call would carry more than the leased prompt cap, with that call's size. */
  oversize: ReadonlyArray<{ unitIds: readonly string[]; chars: number; reason?: string }>;
  /** The account's generations this hour, or null when they could not be read. */
  window: { used: number; limit: number; nextFreeInSeconds: number | null } | null;
}

export interface PreflightLimit {
  key: 'functions' | 'budget' | 'parallel' | 'deadline' | 'time-limit' | 'prompt' | 'hourly' | 'duration';
  label: string;
  value: string;
  /** This limit is the reason the plan cannot start, or the reason some functions are not written. */
  attention?: boolean;
}

export interface PreflightIssue extends CodeExplanation {
  code: string;
  label: string;
  /** This plan's own numbers, in one sentence. */
  detail: string;
}

export interface Preflight {
  limits: PreflightLimit[];
  /** Why the plan cannot start; null when it can. */
  blocked: PreflightIssue | null;
  /** Functions the plan will leave as stubs, and why — the run starts anyway. */
  notWritten: Array<{ unitId: string; issue: PreflightIssue }>;
  /** The lease budget this plan buys. */
  budget: number;
}

const n = (x: number) => x.toLocaleString('en-US');
const issue = (code: string, detail: string, status?: number): PreflightIssue => ({ ...explainCode(code, status), code, detail });

export function preflight(input: PreflightInput): Preflight {
  const planned = Math.max(1, Math.ceil(input.fillCalls));
  const budget = leaseBudget(Math.min(planned, LEASE_MAX_PLANNED_CALLS));
  const ttl = leaseTtlMs(budget);
  const expected = expectedFillDuration(planned, LEASE_MAX_IN_FLIGHT);
  const oversizeIds = input.oversize.flatMap((o) => [...o.unitIds]);
  const retries = Math.max(0, budget - planned);

  let blocked: PreflightIssue | null = null;
  if (planned > LEASE_MAX_CALLS) {
    blocked = issue('plan-too-large', `This program needs ${n(planned)} fill calls; one generation may make ${n(LEASE_MAX_CALLS)}.`);
  } else if (expected.lowMs > ttl) {
    blocked = issue('plan-over-time-limit', `Writing it is expected to take ${minutesWords(expected)}; one generation may run ${Math.round(ttl / 60_000)} minutes.`);
  } else if (input.functions > 0 && oversizeIds.length >= input.functions) {
    blocked = issue('plan-unit-too-large', `Every function's prompt is longer than the ${n(LEASED_PROMPT_MAX_CHARS)} characters one fill call may carry.`);
  } else if (input.window && input.window.used >= input.window.limit) {
    const minutes = Math.max(1, Math.ceil((input.window.nextFreeInSeconds ?? 3600) / 60));
    blocked = issue('lease-hourly-limit', `${input.window.used} of ${input.window.limit} generations of this hour are used; the next is free in about ${minutes} minute${minutes === 1 ? '' : 's'}.`, 429);
  }

  const notWritten = blocked
    ? []
    : input.oversize.flatMap((o) =>
        o.unitIds.map((unitId) => ({
          unitId,
          // The plan's reason, where it could not split the function smaller (3.0.17), follows the numbers.
          issue: issue('lease-prompt-too-large', `Its call would carry ${n(o.chars)} characters, more than the ${n(LEASED_PROMPT_MAX_CHARS)} allowed.${o.reason ? ` ${o.reason}` : ''}`),
        })),
      );

  const limits: PreflightLimit[] = [
    { key: 'functions', label: 'Plan', value: `${n(input.functions)} function${input.functions === 1 ? '' : 's'} in ${n(planned)} fill call${planned === 1 ? '' : 's'}`, attention: blocked?.code === 'plan-too-large' },
    {
      key: 'budget',
      label: 'Call budget',
      // Owner decision 14.10.2026: the calls held for gate repairs are said apart — only repairs of activation or
      // type-check errors can spend them, so they are no general raise of the budget.
      value: `${n(budget)} model calls — ${n(Math.min(planned, budget))} for the plan, ${n(retries)} for retries and repairs (at most ${n(LEASE_MAX_CALLS)}); ${n(LEASE_GATE_REPAIR_CALLS)} more only to repair activation or type-check errors (at most ${n(LEASE_MAX_CALLS_PER_GENERATION)} per generation)`,
      attention: blocked?.code === 'plan-too-large',
    },
    { key: 'parallel', label: 'At once', value: `at most ${LEASE_MAX_IN_FLIGHT} calls` },
    { key: 'deadline', label: 'Per call', value: `at most ${Math.round(MODEL_CALL_DEADLINE_MS / 1000)} seconds` },
    { key: 'time-limit', label: 'Time limit', value: `${Math.round(ttl / 60_000)} minutes for the whole generation`, attention: blocked?.code === 'plan-over-time-limit' },
    {
      key: 'prompt',
      label: 'Prompt per call',
      value:
        oversizeIds.length === 0
          ? `at most ${n(LEASED_PROMPT_MAX_CHARS)} characters — every function fits`
          : `at most ${n(LEASED_PROMPT_MAX_CHARS)} characters — ${n(oversizeIds.length)} function${oversizeIds.length === 1 ? '' : 's'} above it`,
      attention: oversizeIds.length > 0,
    },
    {
      key: 'hourly',
      label: 'Generations this hour',
      value: input.window ? `${input.window.used} of ${input.window.limit} used` : `at most ${LEASES_PER_WINDOW}`,
      attention: blocked?.code === 'lease-hourly-limit',
    },
    { key: 'duration', label: 'Expected duration', value: expectedWords(planned, input.functions, LEASE_MAX_IN_FLIGHT) },
  ];

  return { limits, blocked, notWritten, budget };
}
