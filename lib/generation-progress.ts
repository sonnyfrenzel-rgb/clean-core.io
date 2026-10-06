/**
 * The progress bar of a generation, from what the page actually knows.
 *
 * Owner report 06.10.2026: the Transformation bar reached 95 % within about
 * fourteen seconds — a timer added 2 % every 200 ms up to 80 and 0.5 % up to 95,
 * then stopped — and stood there for the whole model call, a minute or more,
 * before it jumped to done. The bar measured the timer, not the work.
 *
 * What the page can know is which step it is in: reading the contract, waiting
 * for the model, checking the answer, storing it. The model call is one opaque
 * request (`/api/gemini` answers in one piece, nothing is streamed), so inside
 * it the bar can only estimate. It does so with a curve that keeps moving for
 * as long as the wait lasts and never reaches the end of its band — slower and
 * slower, never frozen — and the page shows the step and the elapsed time next
 * to it, so the reader can see that the wait is alive and how long it has been.
 *
 * Pure and without imports, so a spec can run the real curve.
 */

export type GenerationPhaseKey = 'contract' | 'model' | 'checking' | 'storing' | 'done';

/** Where each step lives on the bar, in percent, and what it is called. */
export const GENERATION_PHASES: Record<GenerationPhaseKey, { from: number; to: number; label: string; halfAfterMs: number }> = {
  contract: { from: 0, to: 8, label: 'Reading the contract', halfAfterMs: 800 },
  model: { from: 8, to: 90, label: 'Waiting for the model', halfAfterMs: 45_000 },
  checking: { from: 90, to: 93, label: 'Checking the package', halfAfterMs: 300 },
  storing: { from: 93, to: 99, label: 'Saving to the project', halfAfterMs: 1_500 },
  done: { from: 100, to: 100, label: 'Done', halfAfterMs: 1 },
};

/** A step as the page holds it: which one, since when, and where the bar stood when it began. */
export interface GenerationPhase {
  key: GenerationPhaseKey;
  startedAt: number;
  /** The bar at the moment this step began — never lower than the step's own start. */
  startedFrom: number;
}

/**
 * The bar at `now`. Inside a step it climbs from where it stood towards the end
 * of the step's band along `t / (t + half)`: half the remaining way after
 * `halfAfterMs`, and still moving after any wait — at three minutes of model
 * time it climbs about four points a minute, not zero.
 */
export function generationProgressAt(phase: GenerationPhase | null, now: number): number {
  if (!phase) return 0;
  const band = GENERATION_PHASES[phase.key];
  if (phase.key === 'done') return 100;
  const from = Math.max(band.from, phase.startedFrom);
  // A step begun beyond its own band — the second model call after checking,
  // with the bar already past 90 — climbs on towards 99 instead of standing at
  // the band's end (QA review of 1c402c400e05).
  const to = from >= band.to ? Math.max(from, 99) : band.to;
  const t = Math.max(0, now - phase.startedAt);
  return from + (to - from) * (t / (t + band.halfAfterMs));
}

/**
 * The next step, begun at `now` from wherever the bar stands — so the bar never
 * moves backwards, also when the same step begins again (a second model call).
 */
export function enterGenerationPhase(previous: GenerationPhase | null, key: GenerationPhaseKey, now: number): GenerationPhase {
  return { key, startedAt: now, startedFrom: generationProgressAt(previous, now) };
}

/** `m:ss` for an elapsed time in milliseconds. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
