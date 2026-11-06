import type { ModelStage } from './model-stages';
import { PROVIDER_LABEL, type ModelKeyProvider } from './model-providers';
import { NAMING_ASKED_IN_THIS_BUILD } from './process-naming';

/**
 * The one-time notice before the first automatic model call (3.0.21, A10;
 * the words are C14 in `lib/legal/consent-texts.ts`).
 *
 * Shown once per account, at the first upload of own code and so before the
 * first own project is opened, with a switch inside it that turns the
 * automatic AI steps off. What it writes is what Settings writes — since the
 * legal review of 06.11.2026 (item 2) the account's one main switch
 * "Automatic AI steps" (`users/{uid}.autoModelSteps`, `lib/auto-model-steps.ts`,
 * through `POST /api/model-stages`), shown at the top of the card "Where the
 * AI model is used" — so the notice and Settings can never say two things.
 * It stops every automatic call on every key; the per-stage switches stay
 * beside it. That it was shown is one server-written timestamp,
 * `users/{uid}.autoStepsNoticeAt`, written by the same route: no field a
 * browser writes, so no `firestore.rules` change.
 *
 * Pure apart from the imports above, which are import-free or pure.
 */

/** The profile field that records the notice was answered or closed. Admin SDK only. */
export const AUTO_STEPS_NOTICE_FIELD = 'autoStepsNoticeAt';

/** The value `POST /api/model-stages` takes to record it: `{ autoStepsNotice: 'seen' }`. */
export const AUTO_STEPS_NOTICE_SEEN = 'seen';

/**
 * The stages the product starts by itself when the owner opens a project, in
 * this build: the plain wording of the business sentences (`statements`,
 * `hooks/usePlainWording.ts`); the business names (`naming`) only while they
 * are asked for at all — they are paused in 3.0.21
 * (`NAMING_WITHOUT_FACTS_PAUSED`).
 */
export function automaticStagesInThisBuild(): ModelStage[] {
  return NAMING_ASKED_IN_THIS_BUILD ? ['naming', 'statements'] : ['statements'];
}


export interface AutoStepsNoticeInput {
  /** `useModelAvailability().known` — nothing is shown on a guess. */
  known: boolean;
  /** A key the step could run on (platform or own, not suspended). */
  keyAvailable: boolean;
  /** `useModelAvailability().autoSteps`: false with the main switch off, or an own key whose "Automatic steps" are off. */
  autoSteps: boolean;
  stages: Record<ModelStage, boolean>;
  /** The account answered or closed the notice before (`autoStepsNoticeSeen`). */
  seen: boolean;
  /** An invited reader never sees it. */
  reader?: boolean;
}

/** Whether a step would start by itself on opening a project, for this account, now. */
export function automaticStepWouldRun(input: Pick<AutoStepsNoticeInput, 'keyAvailable' | 'autoSteps' | 'stages'>): boolean {
  if (!input.keyAvailable || !input.autoSteps) return false;
  return automaticStagesInThisBuild().some((stage) => input.stages[stage] === true);
}

/**
 * Whether to show the notice: the answer is in, the account has not answered
 * or closed it, it is not an invited reader, and something would actually run
 * by itself — never with an own key whose "Automatic steps" are off, and never
 * when the step is already off.
 */
export function autoStepsNoticeWanted(input: AutoStepsNoticeInput): boolean {
  if (!input.known || input.seen || input.reader) return false;
  return automaticStepWouldRun(input);
}

/** The switch's position: the main switch (`useModelAvailability().autoModelSteps`). */
export function autoStepsSwitchOn(model: { autoModelSteps: boolean }): boolean {
  return model.autoModelSteps;
}

/** The body the switch posts: the main switch to `on`, and the notice answered. */
export function autoStepsSwitchBody(on: boolean): { autoModelSteps: boolean; autoStepsNotice: typeof AUTO_STEPS_NOTICE_SEEN } {
  return { autoModelSteps: on, autoStepsNotice: AUTO_STEPS_NOTICE_SEEN };
}

const COMPANY: Readonly<Record<ModelKeyProvider, string>> = { gemini: 'Google', anthropic: 'Anthropic' };

/** `{Modell}` and `{Anbieter}` of C14 for the key the step would run on. */
export function autoStepsNoticeValues(provider: ModelKeyProvider | null): { model: string; company: string } {
  const p: ModelKeyProvider = provider ?? 'gemini';
  return { model: PROVIDER_LABEL[p], company: COMPANY[p] };
}
