import type { Project } from './types';
import { workflowSteps, workflowSummary, type PhaseKey, type RailStep } from './workflow-steps';
import { modelAbsenceReason, modelStageEnabled, type ModelStage, type ModelStageSubject } from './model-stages';
import type { ProvenanceValue } from './provenance';

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
 *
 * **Two sentences, not one, because the reader asks two questions.** *What is
 * open* is the phase contract's own `detail`, and it has been here from the
 * start. *Why this one and not another* was missing, and its absence is what
 * makes a "next step" card read like an opinion: a card that names Design
 * without saying that Analyze is on record and Design is the first thing after
 * it is a suggestion, and the reader has no way to check it. `selection` is
 * that second sentence, and it is derived from the same `RailStep[]` — the
 * phases before the open one, and how many of them are on record — so it can
 * be wrong only if the contract is.
 *
 * It counts, and it never prints a percentage or a zero standing in for a
 * word: the first phase has *nothing* before it, which is a different
 * statement from "0 of 0 before it are on record" (`lib/workspace-rows.ts`:
 * *null is not zero*).
 *
 * **Provenance is `reconstructed`, and that is a decision, not a default.**
 * `DESIGN.md` §4 gives nine values and this statement is one of them: derived
 * from what is on record, confirmed by nobody. It is emphatically not *Model
 * proposal* — nothing here proposes anything, and borrowing that word would
 * make the one badge that means "a model said this" mean "a rule said this"
 * as well. Nor *Proven*: the underlying records may each be signed, but the
 * sentence built out of them is this module's reading of them.
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

/**
 * What every statement this module makes is worth — one of the nine values of
 * `DESIGN.md` §4, read from `lib/provenance.ts` rather than spelled out at the
 * chip. Exported so the card cannot pick a different one for the same sentence.
 */
export const NEXT_STEP_PROVENANCE: ProvenanceValue = 'reconstructed';

/**
 * What the card says when `nextOpenPoint` returns `null`.
 *
 * A fact, not a congratulation, and it lives here rather than in the component
 * for the same reason the open sentences do: a claim that nothing is open is
 * checkable — `tests/next-step-provenance.spec.ts` asserts it against the phase
 * contract whenever it is shown — and a claim written into JSX is not.
 *
 * The second clause is true of every project this can be shown for: Economics
 * never reaches `done` in this release (CR-23 / E12-F02), so "everything is
 * finished" would be the one thing here that is not on record.
 */
export const NOTHING_OPEN =
  'Nothing is open. Every phase this product can finish has its own evidence on record; ' +
  'Economics stays a model estimate, which nothing in this release can complete.';

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
   * Why *this* point and not another — the selection rule, spelled out from
   * the phases that stand before it in the one workflow order. Never a
   * percentage, never a share, never a cause this module cannot see.
   */
  selection: string;
  /**
   * Always `reconstructed`. Carried on the point rather than only exported as
   * a constant so that a caller rendering a chip has it in hand and cannot
   * reach for a different word.
   */
  provenance: ProvenanceValue;
  /**
   * True when `reason` names an account-level model switch rather than only
   * the phase's own state. A card may still offer to *open* the phase either
   * way — opening a page never fails — but it must not phrase the reason as
   * "generate this now" when the account cannot.
   */
  blockedByModelSwitch: boolean;
}

/**
 * "Why this one" — the phases that stand before the open point, read out.
 *
 * Exported because it is the rule, and a rule that can only be reached through
 * a Firestore-shaped `Project` can only be checked on the projects somebody
 * thought to build (`lib/single-flight.ts`, and the reason it exists). Given
 * the steps and the phase the summary picked, this is a total function of the
 * two.
 *
 * Three cases:
 *
 *   - the open point is the **first** phase. Nothing precedes it, and that is
 *     what is said. `0 of 0` would be an empty set dressed up as a
 *     measurement.
 *   - every phase before it **is** on record — the usual case, because
 *     `workflowSummary().next` is by construction the first phase that is
 *     neither done nor Economics.
 *   - one of them is not. Today only Economics can be in that position, and
 *     only if Delivery is ever the open point while Economics stands unfinished
 *     behind it. The branch is defensive rather than observed, and it exists
 *     because the alternative is a sentence that quietly reports "5 of 6" and
 *     leaves the reader to work out which one slipped. What it must never do is
 *     invent a cause: it names the phase and states the one thing that is on
 *     record about it, that nothing in this release completes it.
 */
export function selectionSentence(steps: readonly RailStep[], next: RailStep): string {
  const at = steps.findIndex((s) => s.key === next.key);
  const before = at > 0 ? steps.slice(0, at) : [];
  const first = `${next.label} is the first in the workflow order that is not.`;

  if (before.length === 0) {
    return `${next.label} is the first of the ${steps.length} phases — nothing comes before it, so nothing else can be the next open point.`;
  }

  const open = before.filter((s) => !s.done);
  if (open.length === 0) {
    return before.length === 1
      ? `The one phase before it, ${before[0].label}, is on record; ${first}`
      : `All ${before.length} phases before it are on record; ${first}`;
  }

  const names = open.map((s) => s.label);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    `${before.length - open.length} of the ${before.length} phases before it are on record; ` +
    `${list} ${names.length === 1 ? 'is' : 'are'} passed over, because nothing in this release can complete ` +
    `${names.length === 1 ? 'it' : 'them'}; ${first}`
  );
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
  const steps = workflowSteps(project);
  const { next } = workflowSummary(steps);

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

  return {
    key: next.key,
    label: next.label,
    path: next.path,
    reason,
    selection: selectionSentence(steps, next),
    provenance: NEXT_STEP_PROVENANCE,
    blockedByModelSwitch,
  };
}
