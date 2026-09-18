import type { Project } from './types';
import { workflowSteps, workflowSummary, type PhaseKey } from './workflow-steps';
import { modelAbsenceReason, modelStageEnabled, type ModelStage, type ModelStageSubject } from './model-stages';

/**
 * "Next step" — `DESIGN.md` §2.3 item 5, §5.5, roadmap step 6.5.
 *
 * *"Nächster Schritt: regelbasiert der nächste offene Punkt mit Grund, ohne
 * Modellaufruf."* That last clause is the whole character of this module: it
 * is a deterministic function of what is already on record for a project, not
 * a generated suggestion, and it must be checkable as one rather than trusted
 * as a sentence somebody wrote once and never re-derives.
 *
 * **There is no second idea of "open" here.** `lib/workflow-steps.ts` is
 * already the one phase contract every other view reads — the stepper, the
 * rail, the dashboard row and delivery all take "done" from it and none of
 * them keeps a second ladder. Inventing a fresh definition of "open" for this
 * card would be exactly the defect that contract exists to remove (roadmap
 * 1.7). So this module does one thing: it asks `workflowSummary()` which phase
 * is next, in the one order and with the one meaning of "done" the rest of the
 * product already uses, and turns that into a sentence.
 *
 * **Nothing is open only when nothing is left to finish.** `workflowSummary()`
 * always names *some* phase — even a fully finished project resolves to
 * Delivery, because the cursor has to land somewhere. What tells the two
 * apart is whether that phase is itself `done`: if it is, every phase the
 * contract can ever finish already has been (Economics is permanently excused
 * — nothing in this release can complete it, CR-23 / E12-F02 — and
 * `workflowSummary` already skips it for exactly this reason), and this module
 * says so rather than manufacturing a step nobody asked for.
 *
 * **A switched-off model is not something to send a reader at.** Four of the
 * seven phases — Design, Transformation, Documentation, Testing — have no
 * other way today to produce their own artefact than a model call; the stage
 * pages already know this and show `NotGenerated` instead of a button that can
 * only fail whenever the account's switch for that stage is off (roadmap 1.2 /
 * V25-A12, see the comment beside `NotGenerated` in `design/page.tsx`). This
 * module applies the same rule to the sentence rather than only to the button:
 * when the next open phase has *nothing of its own on record yet* and the
 * model that would produce it is off for this account, the reason names that
 * — instead of reading like an instruction the reader cannot follow.
 *
 * Deliberately narrow: the check only fires on an *empty* phase. A phase that
 * already has something on record (a generated design still waiting for
 * sign-off, a draft test suite nobody ran) is not blocked by the switch — the
 * remaining step is one the reader can take without a model call, and the
 * phase's own reason already says what it is. `Analyze` is deliberately never
 * checked against a switch at all: roadmap 1.2's zero-LLM lock path signs a
 * run without any model call, so an empty Analyze is blocked by "no source
 * staged" or "no run yet", never by a switch.
 *
 * **What this module cannot see, and does not pretend to.** Whether a Gemini
 * key exists at all — the community key lives in the server environment, a
 * BYOK secret in a collection `firestore.rules` closes to every client — is a
 * server-side fact `GET /api/model-stages` answers, and asking it is a network
 * call this module refuses to make (see the guard below). So it reads only the
 * account's own per-stage switch, which travels with the profile already
 * loaded for the page; the rarer "no key at all" case is left to the stage
 * page itself, exactly as it is today.
 *
 * **No model call, ever.** This file imports nothing that reaches the Gemini
 * proxy — not `lib/gemini*`, not `fetch`, not an API route. `tests/next-step.spec.ts`
 * proves it from the source rather than trusting this sentence.
 */

/**
 * The phases whose own artefact this release can only produce with a model
 * call. `analyze` is not in this map on purpose (see the module doc above);
 * `tco` and `delivery` are absent because neither is ever the phase this
 * module points at — `workflowSummary` excuses Economics, and Delivery's own
 * reason is never "nothing generated", it is "material or a run is missing".
 */
const PHASE_MODEL_STAGE: Partial<Record<PhaseKey, ModelStage>> = {
  design: 'design',
  transformation: 'transformation',
  documentation: 'documentation',
  testing: 'testing',
};

export interface NextOpenPoint {
  key: PhaseKey;
  /** The phase's own label — "Design", "Testing" — from the one phase list. */
  label: string;
  /** The route segment under `/project/{id}/`, straight from the phase contract. */
  path: string;
  /**
   * Why this point is open, in the product's own words. Always the phase
   * contract's own `detail` — never a pleasantry — with one addition: when
   * generating it needs a model the account has switched off, the sentence
   * says that too, instead of reading like an instruction to press a button
   * that can only fail.
   */
  reason: string;
  /**
   * True when `reason` names an account-level model switch rather than only
   * the phase's own state. A card may still offer to *open* the phase either
   * way — opening a page never fails — but it must not phrase the reason as
   * "generate this now" when the account cannot.
   */
  blockedByModelSwitch: boolean;
}

/**
 * The next open point for this project, or `null` when there is none.
 *
 * `account` is the signed-in account's own profile, or whatever slice of it
 * carries `modelStages` — the same shape `hooks/useModelAvailability.ts` and
 * the stage pages already read. Omitting it (or passing `null`) reads every
 * stage as switched on, which is the documented default of `modelStagesOf()`
 * ("absent means every stage is on") and therefore never invents a block this
 * module cannot actually confirm.
 */
export function nextOpenPoint(
  project: Project | null,
  account?: ModelStageSubject | null,
): NextOpenPoint | null {
  const { next } = workflowSummary(workflowSteps(project));

  // `next` never returns `undefined` — see the module doc. `done` is the one
  // question that tells "everything finished" apart from "the cursor landed
  // somewhere", so it is the one this function asks.
  if (next.done) return null;

  const stage = PHASE_MODEL_STAGE[next.key];
  const blockedByModelSwitch =
    stage !== undefined && next.state === 'empty' && !modelStageEnabled(account ?? null, stage);

  const reason = blockedByModelSwitch
    ? `${next.detail} ${modelAbsenceReason('stage-off', stage)}`
    : next.detail;

  return { key: next.key, label: next.label, path: next.path, reason, blockedByModelSwitch };
}
