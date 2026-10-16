/**
 * What the Testing tool is doing while it writes a suite — owner request
 * 16.10.2026 ("Testing braucht bei der Erstellung auch eine Zeitangabe").
 *
 * The counterpart of Transformation's generation screen and Documentation's
 * progress card (`components/documentation/DocumentationProgress.tsx`): from
 * the click the reader sees which stage runs, how long it has been running,
 * what to expect before the model call, and at the end one quiet line with the
 * total time.
 *
 * Four stages, in this order, each entered by the hook where its work begins
 * (`hooks/useTestGeneration.ts`) — never a timer:
 *
 *   source   the engine reads the signed source: business rules, engine
 *            cases, the origin check (no model)
 *   model    the testing model writes the scenarios and the suite — one call,
 *            a second one when the first answer was unusable or its ABAP Unit
 *            class did not fit the classes under test
 *   checking the answer is checked: its shape, the scenarios, the test class
 *   storing  the suite goes to the project (`/api/projects/{id}/artefacts`)
 *
 * The expected time is said as a range from measured calls, never as a
 * countdown. Pure: no React, no clock of its own.
 */

import { MODEL_CALL_DEADLINE_MS } from './model-deadline';
import { formatElapsed } from './generation-progress';
import { minutesWords, type DurationRange } from './transformation/duration-estimate';

export const TEST_GEN_STAGE_ORDER = ['source', 'model', 'checking', 'storing'] as const;
export type TestGenStageKey = (typeof TEST_GEN_STAGE_ORDER)[number];

export const TEST_GEN_STAGES: Record<TestGenStageKey, { label: string; note: string }> = {
  source: { label: 'Reading the signed source', note: 'rules and engine cases, no model' },
  model: { label: 'Writing the scenarios and the suite', note: 'testing model' },
  checking: { label: 'Checking the answer', note: 'shape, scenarios, test class' },
  storing: { label: 'Saving to the project', note: 'server' },
};

/**
 * One call of the testing model, measured on dev (Cloud Run logs, `gemini
 * usage`, stage `testing`, 14.–16.10.2026): seven calls of 65, 89, 92, 100,
 * 100, 117 and 259 seconds. The range is the fastest to the slowest of them,
 * rounded — from seven calls of a few programs, so an estimate, not a promise.
 */
export const TESTING_CALL_LOW_MS = 60_000;
export const TESTING_CALL_HIGH_MS = 260_000;

/** The expected time of one call. */
export function expectedTestingCall(): DurationRange {
  return { lowMs: TESTING_CALL_LOW_MS, highMs: Math.min(TESTING_CALL_HIGH_MS, MODEL_CALL_DEADLINE_MS) };
}

/** "Expected: about 1–5 minutes for one model call (estimate)." */
export function testingExpectedLine(): string {
  return `Expected: ${minutesWords(expectedTestingCall())} for one model call (estimate). A second call, when the first answer cannot be used, takes about as long again.`;
}

export type TestGenOutcome = 'running' | 'written' | 'failed';

export interface TestGenProgress {
  /** The click. The total counts from here. */
  startedAt: number;
  /** When the run ended; `null` while it runs. */
  endedAt: number | null;
  /** The stage running now, or the one it stopped in. */
  stage: TestGenStageKey;
  times: Partial<Record<TestGenStageKey, { startedAt: number; endedAt: number | null }>>;
  /** Model calls begun in this run. */
  modelCalls: number;
  outcome: TestGenOutcome;
  /** Scenarios written, once written. */
  scenarios: number | null;
}

/** A run begun at `at`, in its first stage. */
export function startTestGenProgress(at: number): TestGenProgress {
  return { startedAt: at, endedAt: null, stage: 'source', times: { source: { startedAt: at, endedAt: null } }, modelCalls: 0, outcome: 'running', scenarios: null };
}

/**
 * The run after it entered `key` at `at`. The running stage ends; entering the
 * model stage again (a second call) keeps its first start, so its time is the
 * whole time spent waiting for the model, and counts the call.
 */
export function enterTestGenStage(prev: TestGenProgress, key: TestGenStageKey, at: number): TestGenProgress {
  const times = { ...prev.times };
  const running = times[prev.stage];
  if (running && running.endedAt === null && prev.stage !== key) times[prev.stage] = { ...running, endedAt: at };
  const own = times[key];
  times[key] = own && key === 'model' ? { ...own, endedAt: null } : own && own.endedAt === null ? own : { startedAt: at, endedAt: null };
  return { ...prev, stage: key, times, modelCalls: prev.modelCalls + (key === 'model' ? 1 : 0) };
}

/** The run at its end: written (with the number of scenarios) or stopped in its current stage. */
export function endTestGenProgress(prev: TestGenProgress, outcome: 'written' | 'failed', at: number, scenarios: number | null = null): TestGenProgress {
  const times = { ...prev.times };
  const running = times[prev.stage];
  if (running && running.endedAt === null) times[prev.stage] = { ...running, endedAt: at };
  return { ...prev, times, endedAt: at, outcome, scenarios };
}

export type TestGenStageState = 'pending' | 'active' | 'done' | 'failed';

export interface TestGenStageView {
  key: TestGenStageKey;
  label: string;
  note: string;
  state: TestGenStageState;
  /** "1:12", "done · 0:03", "stopped", "waiting". */
  time: string;
}

/** The four stages as the card draws them at `now`. */
export function testGenStages(progress: TestGenProgress, now: number): TestGenStageView[] {
  const current = TEST_GEN_STAGE_ORDER.indexOf(progress.stage);
  return TEST_GEN_STAGE_ORDER.map((key, i) => {
    const t = progress.times[key];
    let state: TestGenStageState;
    if (progress.outcome === 'written') state = 'done';
    else if (i < current) state = 'done';
    else if (i > current) state = 'pending';
    else state = progress.outcome === 'failed' ? 'failed' : 'active';
    const span = t ? formatElapsed((t.endedAt ?? now) - t.startedAt) : null;
    const calls = key === 'model' && progress.modelCalls > 1 ? ` · ${progress.modelCalls} calls` : '';
    const time =
      state === 'active' ? `${span ?? '0:00'}${calls}`
        : state === 'done' ? (span ? `done · ${span}${calls}` : 'done')
          : state === 'failed' ? 'stopped'
            : 'waiting';
    return { key, ...TEST_GEN_STAGES[key], state, time };
  });
}

/** The total since the click: running on to `now`, or stopped at the end. */
export function testGenTotal(progress: TestGenProgress, now: number): string {
  return formatElapsed((progress.endedAt ?? now) - progress.startedAt);
}

/** The one line a finished or stopped run ends in. */
export function testGenEndText(progress: TestGenProgress): string | null {
  if (progress.outcome === 'running') return null;
  if (progress.outcome === 'written') {
    const n = progress.scenarios;
    return n === null ? 'Test suite written and saved.' : `Test suite written and saved: ${n} scenario${n === 1 ? '' : 's'}.`;
  }
  return `Stopped while ${TEST_GEN_STAGES[progress.stage].label.charAt(0).toLowerCase()}${TEST_GEN_STAGES[progress.stage].label.slice(1)} — nothing was saved; the reason is below.`;
}
