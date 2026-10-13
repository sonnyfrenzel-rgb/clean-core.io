/**
 * How long the fills of a generation are expected to take — an estimate, said
 * as a range, never a countdown (owner, 13.10.2026: "the user must be able to
 * plan").
 *
 * The fills run at most `LEASE_MAX_IN_FLIGHT` calls at a time, so a plan of n
 * fill calls takes ⌈n ÷ 4⌉ waves. With the provider's default thinking a fill
 * call took a median of about 165–190 s (production, 13.10.2026); with
 * thinking LOW (`lib/model-thinking.ts`) the A/B of the same day measured p50
 * 5.4 s / p90 9.7 s over 39 calls. The constants below are those LOW numbers
 * with a safety margin (8 s / 20 s — 30 calls at 4 at a time read "about 1–3
 * minutes"), because they come from one program and one day. Before the run
 * the range is waves × p50 … waves × p90. While it runs, the calls that
 * finished replace the assumption (blended with it while there are few), and
 * the calls still running and still to come are laid onto the four slots
 * again — so a slower day shows up in the estimate within the first calls.
 *
 * Only the fills: the checks and up to two repair rounds come after and are
 * said as such on the screen. Pure: no React, no clock of its own.
 */

import { MODEL_CALL_DEADLINE_MS } from '../model-deadline';
import { LEASE_MAX_IN_FLIGHT } from './lease';

/** One fill call, typical: measured p50 5.4 s with thinking LOW (13.10.2026), with a margin. */
export const FILL_CALL_P50_MS = 8_000;
/** One fill call, slow: measured p90 9.7 s with thinking LOW (13.10.2026), with a margin of two. */
export const FILL_CALL_P90_MS = 20_000;
/** How many assumed calls the measured ones are blended with until there are enough of them. */
const PRIOR_WEIGHT = 2;

export interface DurationRange {
  lowMs: number;
  highMs: number;
}

/** Waves of fill calls at `maxInFlight` at a time. */
export function fillWaves(fillCalls: number, maxInFlight: number = LEASE_MAX_IN_FLIGHT): number {
  const calls = Number.isFinite(fillCalls) && fillCalls > 0 ? Math.ceil(fillCalls) : 0;
  return calls === 0 ? 0 : Math.ceil(calls / Math.max(1, Math.floor(maxInFlight) || 1));
}

/** Before the run: waves × p50 … waves × p90. */
export function expectedFillDuration(fillCalls: number, maxInFlight: number = LEASE_MAX_IN_FLIGHT): DurationRange & { waves: number } {
  const waves = fillWaves(fillCalls, maxInFlight);
  return { waves, lowMs: waves * FILL_CALL_P50_MS, highMs: waves * FILL_CALL_P90_MS };
}

/** One model call as the screen saw it: when it began, when it ended, and whether the server counted it. */
export interface ObservedCall {
  start: number;
  end?: number;
  /** False for a refusal the server did not count (`lease-busy`): not a call that took time. */
  admitted?: boolean;
}

/** The time one call takes, low and high, from the finished calls blended with the assumption. */
export function perCallEstimate(durations: readonly number[]): DurationRange & { measured: number } {
  const d = durations.filter((x) => Number.isFinite(x) && x >= 0);
  const n = d.length;
  const low = (d.reduce((a, b) => a + b, 0) + PRIOR_WEIGHT * FILL_CALL_P50_MS) / (n + PRIOR_WEIGHT);
  const spread = FILL_CALL_P90_MS / FILL_CALL_P50_MS;
  const high = Math.min(Math.max(low * spread, n > 0 ? Math.max(...d) : 0), MODEL_CALL_DEADLINE_MS);
  return { lowMs: low, highMs: Math.max(low, high), measured: n };
}

/** The calls still to come and the remaining times of the running ones, laid onto the slots: when the last one ends. */
function finishAfter(perCall: number, running: readonly number[], pending: number, slots: number): number {
  const free = [...running.map((elapsed) => Math.max(0, perCall - elapsed))];
  while (free.length < slots) free.push(0);
  free.sort((a, b) => a - b);
  for (let i = 0; i < pending; i++) {
    free[0] += perCall;
    free.sort((a, b) => a - b);
  }
  return Math.max(0, ...free);
}

/**
 * While the fills run: the time left, from the calls that finished. `null`
 * before anything is known (no plan). Calls past the plan (retries, repairs)
 * only shorten nothing: once every planned call has started, only the running
 * ones are left.
 */
export function remainingFillEstimate(input: {
  plannedCalls: number;
  calls: readonly ObservedCall[];
  now: number;
  maxInFlight?: number;
}): (DurationRange & { measured: number }) | null {
  if (!(input.plannedCalls > 0)) return null;
  const slots = Math.max(1, Math.floor(input.maxInFlight ?? LEASE_MAX_IN_FLIGHT) || 1);
  const counted = input.calls.filter((c) => c.admitted !== false);
  const finished = counted.filter((c) => typeof c.end === 'number').map((c) => (c.end as number) - c.start);
  const running = counted.filter((c) => typeof c.end !== 'number').map((c) => Math.max(0, input.now - c.start));
  const pending = Math.max(0, Math.ceil(input.plannedCalls) - counted.length);
  const per = perCallEstimate(finished);
  return {
    lowMs: finishAfter(per.lowMs, running, pending, slots),
    highMs: finishAfter(per.highMs, running, pending, slots),
    measured: per.measured,
  };
}

/** "about 21–28 minutes", "about 3 minutes", "less than a minute" — whole minutes, never seconds. */
export function minutesWords(range: DurationRange): string {
  if (range.highMs < 60_000) return 'less than a minute';
  const lo = Math.max(1, Math.round(range.lowMs / 60_000));
  const hi = Math.max(lo, Math.ceil(range.highMs / 60_000));
  return lo === hi ? `about ${lo} minute${lo === 1 ? '' : 's'}` : `about ${lo}–${hi} minutes`;
}

/** "usually 8–20 seconds" — how long one call takes, said on a function that is being written. */
export function perCallWords(): string {
  if (FILL_CALL_P90_MS < 120_000) return `usually ${Math.round(FILL_CALL_P50_MS / 1000)}–${Math.round(FILL_CALL_P90_MS / 1000)} seconds`;
  return `usually ${Math.floor(FILL_CALL_P50_MS / 60_000)}–${Math.ceil(FILL_CALL_P90_MS / 60_000)} minutes`;
}

/** The header's line while the fills run: "estimate: about 12–16 minutes left". */
export function remainingWords(range: DurationRange): string {
  return range.highMs < 60_000 ? 'estimate: less than a minute left' : `estimate: ${minutesWords(range)} left`;
}

/** The start screen's line: "about 21–28 minutes to write 30 functions in 8 rounds of up to 4 calls (estimate)". */
export function expectedWords(fillCalls: number, functions: number, maxInFlight: number = LEASE_MAX_IN_FLIGHT): string {
  const e = expectedFillDuration(fillCalls, maxInFlight);
  const rounds = `${e.waves} round${e.waves === 1 ? '' : 's'} of up to ${maxInFlight} calls`;
  return `${minutesWords(e)} to write ${functions} function${functions === 1 ? '' : 's'} in ${rounds} (estimate; checks and repairs come after)`;
}
