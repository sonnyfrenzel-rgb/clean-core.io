import type { ModelStage } from './model-stages';
import { PROVIDER_LABEL, type ModelKeyProvider } from './model-providers';
import { NAMING_ASKED_IN_THIS_BUILD } from './process-naming';
import { LEGAL_TEXTS_NAMES_AUTOMATIC } from './legal/names-wording';

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
 * Which wording was confirmed is stored beside it, as the consent record keeps
 * the version of the Terms an account accepted: `users/{uid}.autoStepsNoticeWording`,
 * one of `AUTO_STEPS_NOTICE_WORDINGS`, written by the same route through the
 * Admin SDK. A timestamp without it is a confirmation of the first wording
 * (one step, plain business sentences), the only one shown before the field
 * existed. Once the business names start by themselves the notice names a
 * second step with other content, and a confirmation of the first wording does
 * not cover it: the notice shows once more to an account that confirmed the
 * first wording and left the main switch on, and the server starts no
 * automatic naming call for an account until it has confirmed the wording of
 * this build (`automaticNamingAwaitsNotice`, `app/api/gemini/route.ts`).
 *
 * Pure apart from the imports above, which are import-free or pure.
 */

/** The profile field that records the notice was answered or closed. Admin SDK only. */
export const AUTO_STEPS_NOTICE_FIELD = 'autoStepsNoticeAt';

/** The value `POST /api/model-stages` takes to record it: `{ autoStepsNotice: 'seen' }`. */
export const AUTO_STEPS_NOTICE_SEEN = 'seen';

/** The profile field that records which wording of the notice was confirmed. Admin SDK only. */
export const AUTO_STEPS_NOTICE_WORDING_FIELD = 'autoStepsNoticeWording';

/**
 * The wordings of the notice, by id: `C14-1` names one automatic step (plain business sentences), `C14-2` two
 * (plain business sentences and business names). The lead of each is `CONSENT_TEXTS.autoStepsNotice.lead`.
 */
export const AUTO_STEPS_NOTICE_WORDINGS = ['C14-1', 'C14-2'] as const;
export type AutoStepsNoticeWording = (typeof AUTO_STEPS_NOTICE_WORDINGS)[number];

/** The wording of a build: with business names once they start by themselves (`lib/legal/names-wording.ts`). */
export function noticeWordingFor(namesAutomatic: boolean): AutoStepsNoticeWording {
  return namesAutomatic ? 'C14-2' : 'C14-1';
}

/** The wording this build shows. */
export const AUTO_STEPS_NOTICE_WORDING: AutoStepsNoticeWording = noticeWordingFor(LEGAL_TEXTS_NAMES_AUTOMATIC);

export function isAutoStepsNoticeWording(value: unknown): value is AutoStepsNoticeWording {
  return typeof value === 'string' && (AUTO_STEPS_NOTICE_WORDINGS as readonly string[]).includes(value);
}

/**
 * The wording a stored profile confirmed: the recorded id; the first wording for a confirmation recorded before the
 * id was (a timestamp alone); null when the account never answered the notice.
 */
export function confirmedNoticeWordingOf(
  profile: { autoStepsNoticeAt?: unknown; autoStepsNoticeWording?: unknown } | null | undefined,
): AutoStepsNoticeWording | null {
  if (profile?.autoStepsNoticeAt == null) return null;
  return isAutoStepsNoticeWording(profile.autoStepsNoticeWording) ? profile.autoStepsNoticeWording : 'C14-1';
}

/**
 * Whether an automatic naming call must wait for the notice: in a build whose texts say business names start by
 * themselves, until the account has confirmed the wording that says so. Before that build no naming starts by
 * itself and nothing waits. `/api/gemini` refuses a `trigger: 'automatic'` naming call while this is true, before
 * any key is loaded, and the page asks for none.
 */
export function automaticNamingAwaitsNotice(
  confirmed: AutoStepsNoticeWording | null,
  namesAutomatic: boolean = LEGAL_TEXTS_NAMES_AUTOMATIC,
): boolean {
  if (!namesAutomatic) return false;
  return confirmed !== noticeWordingFor(namesAutomatic);
}

/** The refusal code of `/api/gemini` for an automatic naming call before the notice of this build was confirmed. */
export const AUTO_STEPS_NOTICE_PENDING_CODE = 'auto-steps-notice-pending';

/** The sentence `/api/gemini` answers with then: nothing was sent. */
export function autoStepsNoticePendingMessage(): string {
  return `Business names do not start by themselves until the notice on automatic AI steps has been confirmed (${AUTO_STEPS_NOTICE_PENDING_CODE}). Nothing was sent; the map keeps the names the engine read.`;
}

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
  /**
   * The wording it confirmed then (`autoStepsNoticeWording`); absent or null beside `seen` reads as the first
   * wording, as a stored confirmation without an id does.
   */
  wording?: AutoStepsNoticeWording | null;
  /** The account's main switch "Automatic AI steps" (`autoModelSteps`); absent reads as on. */
  mainSwitch?: boolean;
  /** An invited reader never sees it. */
  reader?: boolean;
}

/** Whether a step would start by itself on opening a project, for this account, now. */
export function automaticStepWouldRun(input: Pick<AutoStepsNoticeInput, 'keyAvailable' | 'autoSteps' | 'stages'>): boolean {
  if (!input.keyAvailable || !input.autoSteps) return false;
  return automaticStagesInThisBuild().some((stage) => input.stages[stage] === true);
}

/** The wording an input says the account confirmed, or null when it never answered. */
export function confirmedWordingOfInput(input: Pick<AutoStepsNoticeInput, 'seen' | 'wording'>): AutoStepsNoticeWording | null {
  if (!input.seen) return null;
  return input.wording ?? 'C14-1';
}

/**
 * Whether the business names would start by themselves for this account now but wait for the notice of this
 * build: the main switch on, a key, automatic steps allowed on it, the naming stage on, and the wording of this
 * build not confirmed. With the main switch off nothing starts by itself, so nothing waits.
 */
export function namesWaitForNotice(
  input: Pick<AutoStepsNoticeInput, 'known' | 'keyAvailable' | 'autoSteps' | 'stages' | 'seen' | 'wording' | 'mainSwitch'>,
  namesAutomatic: boolean = LEGAL_TEXTS_NAMES_AUTOMATIC,
): boolean {
  if (!input.known || !namesAutomatic) return false;
  if (input.mainSwitch === false || !input.keyAvailable || !input.autoSteps || input.stages.naming !== true) return false;
  return automaticNamingAwaitsNotice(confirmedWordingOfInput(input), namesAutomatic);
}

/**
 * Whether to show the notice: the answer is in, it is not an invited reader, and either
 *   - the account never answered it and something would actually run by itself — never with an own key whose
 *     "Automatic steps" are off, and never when the step is already off; or
 *   - it answered an earlier wording, the main switch is on, and the business names would now start by themselves
 *     (`namesWaitForNotice`): shown once more, in the wording of this build. With the main switch off it does not
 *     come back.
 */
export function autoStepsNoticeWanted(input: AutoStepsNoticeInput, namesAutomatic: boolean = LEGAL_TEXTS_NAMES_AUTOMATIC): boolean {
  if (!input.known || input.reader) return false;
  if (!input.seen) return automaticStepWouldRun(input);
  return namesWaitForNotice(input, namesAutomatic);
}

/** The switch's position: the main switch (`useModelAvailability().autoModelSteps`). */
export function autoStepsSwitchOn(model: { autoModelSteps: boolean }): boolean {
  return model.autoModelSteps;
}

/** The body "Got it" posts: the notice answered, in the wording it showed. */
export function autoStepsNoticeSeenBody(): { autoStepsNotice: typeof AUTO_STEPS_NOTICE_SEEN; autoStepsNoticeWording: AutoStepsNoticeWording } {
  return { autoStepsNotice: AUTO_STEPS_NOTICE_SEEN, autoStepsNoticeWording: AUTO_STEPS_NOTICE_WORDING };
}

/** The body the switch posts: the main switch to `on`, and the notice answered in the wording it showed. */
export function autoStepsSwitchBody(on: boolean): {
  autoModelSteps: boolean;
  autoStepsNotice: typeof AUTO_STEPS_NOTICE_SEEN;
  autoStepsNoticeWording: AutoStepsNoticeWording;
} {
  return { autoModelSteps: on, ...autoStepsNoticeSeenBody() };
}

const COMPANY: Readonly<Record<ModelKeyProvider, string>> = { gemini: 'Google', anthropic: 'Anthropic' };

/** `{Modell}` and `{Anbieter}` of C14 for the key the step would run on. */
export function autoStepsNoticeValues(provider: ModelKeyProvider | null): { model: string; company: string } {
  const p: ModelKeyProvider = provider ?? 'gemini';
  return { model: PROVIDER_LABEL[p], company: COMPANY[p] };
}
