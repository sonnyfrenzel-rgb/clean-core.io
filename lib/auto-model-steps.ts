/**
 * The account's one main switch for every automatic model call — legal review
 * of 06.11.2026 for release 3.0.21 (item 2).
 *
 * "Automatische KI-Schritte / Automatic AI steps" — the switch of the
 * first-upload notice (C14, `components/AutoStepsNotice.tsx`) and of the card
 * "Where the AI model is used" in Settings — is one stored setting:
 * `users/{uid}.autoModelSteps`. Absent means on, the behaviour every account
 * had before the switch existed; `false` stops every call the product would
 * start by itself, on every key, the platform key included.
 *
 * It is written only by `POST /api/model-stages` through the Admin SDK. The
 * field is not in `userClientUpdateKeys()` of `firestore.rules`, so a browser
 * cannot write it and no rules change was needed.
 *
 * What it covers, and the server holds it (`app/api/gemini/route.ts`):
 *
 *   - every call sent as `trigger: 'automatic'` — a step the product starts by
 *     itself when the owner opens a project (the plain wording, the business
 *     names while they are asked for);
 *   - the narrative of the first run after "Create project", sent as
 *     `trigger: 'start'` (`hooks/useStartRun.ts`): with the switch off the
 *     first run is signed with the engine's reading alone, without any model
 *     call.
 *
 * It sits on top of the per-stage switches (`users/{uid}.modelStages`), which
 * stay as they are, and of the per-key "Automatic steps" of an own key
 * (`OwnModelKey.autoSteps`), which stays as well: a call marked automatic runs
 * only when all of them allow it.
 *
 * Pure and import-free: the route, the hook and the specs read the same lines.
 */

/** The profile field. Admin SDK only. */
export const AUTO_MODEL_STEPS_FIELD = 'autoModelSteps';

/** The refusal code of `/api/gemini` when the main switch is off. */
export const AUTO_MODEL_STEPS_OFF_CODE = 'auto-model-steps-off';

/** The two marks a call can carry that the main switch covers. */
export type CoveredTrigger = 'automatic' | 'start';

export function isCoveredTrigger(value: unknown): value is CoveredTrigger {
  return value === 'automatic' || value === 'start';
}

/** The main switch of a stored profile: on unless it says `false`. */
export function autoModelStepsOn(profile: { autoModelSteps?: unknown } | null | undefined): boolean {
  return profile?.autoModelSteps !== false;
}

/**
 * Whether the steps the product starts by itself may run for this account now:
 * the main switch on, and — on an own key — that key's "Automatic steps" on as
 * well. With no key nothing runs.
 */
export function automaticStepsAllowed(input: { mainSwitch: boolean; keySource: 'byok' | 'community' | null; ownKeyAutoSteps: boolean }): boolean {
  if (!input.mainSwitch) return false;
  if (input.keySource === 'community') return true;
  return input.keySource === 'byok' && input.ownKeyAutoSteps;
}

/** The sentence `/api/gemini` answers with: nothing was sent. */
export function autoModelStepsOffMessage(): string {
  return `Automatic AI steps are switched off for this account (${AUTO_MODEL_STEPS_OFF_CODE}). Nothing was sent. Start the step with a click, or switch automatic AI steps on in Settings.`;
}
