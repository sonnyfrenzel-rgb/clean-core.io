/**
 * Automatic or on a click — how a step the product would start by itself is
 * started (roadmap 3.0.21, owner decision 22.10.2026 on question B6 of the
 * legal review).
 *
 * Two steps run by themselves when the owner opens a project (3.0.20): the
 * plain wording of the engine's sentences and the business names of the
 * process. With the platform key that stays as it is. With the account's own
 * Gemini or Claude key they run by themselves only after the account switched
 * "Automatic steps" on for that key in Settings — until then the step is
 * offered on a click, and nothing is spent on the key before the click.
 *
 * The server holds the same rule (`/api/gemini` refuses `trigger: 'automatic'`
 * on an own key with the switch off), so a stale page cannot spend either.
 *
 * Pure: no imports.
 */

export type AskMode = 'auto' | 'click' | null;

/**
 * `wanted` is the step's own rule (`shouldAskPlainWording`, `shouldAskNaming`):
 * an owner, a model the account can call, something to do. `autoAllowed` is
 * `useModelAvailability().autoSteps`. Not wanted: nothing. Wanted and allowed:
 * by itself. Wanted and not allowed: on a click.
 */
export function askModeOf(input: { wanted: boolean; autoAllowed: boolean }): AskMode {
  if (!input.wanted) return null;
  return input.autoAllowed ? 'auto' : 'click';
}

/** The two steps that can wait for a click; their words are in the catalogue (`autoSteps.*`). */
export type ClickStep = 'plain' | 'names';
