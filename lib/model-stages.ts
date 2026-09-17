/**
 * Which stages may call a model — and what a section says when none did.
 *
 * Roadmap 1.2 (`docs/ROADMAP.md` §Phase 1): *"Zero-LLM-Sperrpfad: Run ohne
 * API-Key bis zum signierten Evidenzstand; Modellstufen einzeln zuschaltbar;
 * 'nicht erzeugt' statt leer (V25-A12)"*.
 *
 * Three facts live here, and nothing else does:
 *
 *   1. the stages that call a model, by name, so the server route, the
 *      settings screen and every stage read the same list;
 *   2. whether a given account has a stage switched on — the map is written
 *      only by the Admin SDK (`POST /api/model-stages`), never by the browser,
 *      because `firestore.rules` keeps the client out of every user field
 *      outside `userClientUpdateKeys()`;
 *   3. the one spelling of "not generated" and the reasons a section may give
 *      for it, so a reader never meets an empty box where an answer belongs.
 *
 * Deliberately pure and import-free: the browser reads it in a client
 * component, the Gemini proxy reads it on the server, and a second copy of
 * "which stages exist" would let the switch and the thing it switches drift.
 *
 * Not a security boundary. The switch is the account owner's own preference
 * about their own key and their own quota; the server enforces it so that a
 * stale browser tab cannot spend on a stage the owner turned off, not because
 * an attacker is kept out by it. What keeps a stranger out is authentication,
 * the account-state gate and the rate limit, all of which still run.
 */

/**
 * The stages that send a prompt. Order is the workflow's order.
 *
 * `naming` (roadmap 2.4) is a stage of its own rather than part of `analyze` or
 * `documentation`, for three reasons that each decide it alone:
 *
 *   - the mockup's "Where a model is called" lists *Business names* as its own
 *     call, with its own "without a model call" line and its own switch;
 *   - `analyze` feeds the signed run and `documentation` is prose on a stage
 *     page. Switching either off must not take the names off the process map,
 *     and switching the names off must not take the narrative away — one
 *     switch for two consents is the thing this list exists to prevent;
 *   - the names never reach a signature. A stage whose output does is a
 *     different kind of stage, and its receipt means something else.
 */
export const MODEL_STAGES = ['analyze', 'naming', 'design', 'transformation', 'documentation', 'testing'] as const;

export type ModelStage = (typeof MODEL_STAGES)[number];

/**
 * Stages that belong to the new workspace and are offered only where it is on.
 *
 * The switch is honoured by the server for every account — `/api/gemini` does
 * not know about previews and should not. What waits for 3.0 is the *offer*:
 * a settings row for a process map the account cannot open would be the half
 * of a rebuild `docs/ROADMAP.md` §4 promises nobody sees.
 */
export const PREVIEW_MODEL_STAGES: readonly ModelStage[] = Object.freeze(['naming'] as ModelStage[]);

/** The stages a settings screen offers, in order. */
export function offeredModelStages(showPreview: boolean): ModelStage[] {
  return MODEL_STAGES.filter((stage) => showPreview || !PREVIEW_MODEL_STAGES.includes(stage));
}

/** What each stage asks the model for — the sentence the settings screen shows. */
export const MODEL_STAGE_LABELS: Record<ModelStage, string> = {
  analyze: 'Analysis narrative',
  naming: 'Business names',
  design: 'Solution design blueprint',
  transformation: 'Transformed code',
  documentation: 'Documentation and business blueprint',
  testing: 'Test suite',
};

export const MODEL_STAGE_DESCRIPTIONS: Record<ModelStage, string> = {
  analyze:
    'The prose around the evidence: summary, gaps, standardisation fit. The findings, the route and the Clean Core Score are computed without a model and are unaffected.',
  naming:
    'Proposed business names for the steps and lanes of the process reconstructed from the code. The process, its technical names and every line anchor are computed without a model and stay as they are.',
  design: 'The target architecture blueprint and the non-functional requirements.',
  transformation: 'The ABAP Cloud or CAP code proposal.',
  documentation: 'The technical documentation and the business blueprint.',
  testing: 'The proposed test cases and the test suite skeleton.',
};

export interface ModelStageSubject {
  /**
   * Server-written map of stage → enabled. Absent means every stage is on,
   * which is what every account had before this setting existed.
   */
  modelStages?: Partial<Record<string, boolean>> | null;
}

export function isModelStage(value: unknown): value is ModelStage {
  return typeof value === 'string' && (MODEL_STAGES as readonly string[]).includes(value);
}

/**
 * The account's full map, with every stage present.
 *
 * Unknown keys are dropped and anything that is not a boolean is read as "on":
 * a half-written document must not switch a stage off by accident, because a
 * stage that is off produces nothing and the reader would have to work out why.
 */
export function modelStagesOf(subject: ModelStageSubject | null | undefined): Record<ModelStage, boolean> {
  const stored = subject?.modelStages;
  const out = {} as Record<ModelStage, boolean>;
  for (const stage of MODEL_STAGES) out[stage] = stored?.[stage] === false ? false : true;
  return out;
}

export function modelStageEnabled(subject: ModelStageSubject | null | undefined, stage: ModelStage): boolean {
  return modelStagesOf(subject)[stage];
}

/**
 * The words V25-A12 asks for, in one spelling.
 *
 * A section with no model output says this. It never shows an empty box, a
 * placeholder, a zero or a dash — those read as measurements, and the absence
 * of an answer is not one.
 */
export const NOT_GENERATED = 'Not generated';

/**
 * Why a section has no model output. `null` is the ordinary case: the account
 * can generate it and simply has not yet.
 *
 * `declined` is the reader's own choice rather than a limit of the account —
 * roadmap 1.8's "Run without model" in the workspace list report. It is in this
 * union, and not a sentence written at the button, for the reason the rest of
 * this file exists: there is one spelling of every absence, and a fourth reason
 * invented next to the three that were already here is how "not generated"
 * becomes four different claims.
 */
export type ModelAbsence = 'stage-off' | 'no-key' | 'failed' | 'declined' | null;

/** The error code `/api/gemini` returns when the caller's stage is switched off. */
export const STAGE_DISABLED_CODE = 'model-stage-disabled';

/** The error code `/api/gemini` returns when no key is available at all. */
export const NO_KEY_CODE = 'model-key-missing';

/** One sentence saying why nothing was generated. Never a guess dressed as a reason. */
export function modelAbsenceReason(absence: ModelAbsence, stage?: ModelStage): string {
  switch (absence) {
    case 'stage-off':
      return stage
        ? `The model is switched off for ${MODEL_STAGE_LABELS[stage].toLowerCase()} on this account.`
        : 'The model is switched off for this stage on this account.';
    case 'no-key':
      return 'No Gemini key is available for this account — neither the community key nor one of your own.';
    case 'failed':
      return 'The model call did not come back with anything usable.';
    case 'declined':
      return 'This run was started without the model, so no narrative was asked for.';
    default:
      return 'Nothing has been generated for this section yet.';
  }
}

/**
 * Which absence an error from `/api/gemini` describes.
 *
 * Read from the code the route sends rather than from its prose: a message is
 * for a person, and a branch that matches on one breaks the first time someone
 * rewrites the sentence.
 */
export function absenceFromError(err: unknown): Exclude<ModelAbsence, null> {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message.includes(STAGE_DISABLED_CODE)) return 'stage-off';
  if (message.includes(NO_KEY_CODE)) return 'no-key';
  return 'failed';
}

/**
 * What a run records about the model's part in it.
 *
 * Three values, because there are three states and the middle one used to be
 * folded into the optimistic end of the pair:
 *
 *   - `none` — no narrative at all. The run carries the deterministic evidence
 *     alone, which is still a complete, signed evidence state. Always sound:
 *     no text, certainly no model narrative.
 *   - `narrative` — a narrative is in the run and **where it came from was not
 *     established**. The text arrived in the request body; nothing tied it to a
 *     model call. `model.provider` and `model.modelId` are null, because naming
 *     a provider here is the claim nobody checked.
 *   - `narrative-attested` — a narrative is in the run and `/api/gemini` issued
 *     a receipt for exactly this text, to this account, inside the window
 *     (`lib/model-receipt.ts`), which `/api/runs/create` verified. Only then may
 *     the run name a provider and a model id, and only the ones the server
 *     actually called.
 *
 * A third value rather than a flag beside the pair: the distinction *is* what
 * this field records, and a second field would let the two disagree — a run
 * saying `narrative` with the flag set is a state nothing could mean. It also
 * costs the run document nothing, and every existing reader branches on
 * `=== 'none'`, so none of them starts lying when a third value appears.
 *
 * Runs written before the receipt existed carry `narrative`, which is exactly
 * true of them: a narrative was in the run and nobody had checked its origin.
 *
 * The value is inside the signed payload, so a reader of a run can tell the
 * three apart without trusting the screen that shows it to them.
 */
export type ModelParticipation = 'narrative' | 'narrative-attested' | 'none';

/** True for the two values that mean a narrative is present, whatever its origin. */
export function hasNarrative(participation: ModelParticipation | undefined | null): boolean {
  return participation === 'narrative' || participation === 'narrative-attested';
}
