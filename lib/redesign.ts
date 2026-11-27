/**
 * The way on from Analyze (owner request 23.11.2026, ADR-143): "the onward path no longer jumps into the tools but into
 * Re-design and then into the further tools". Since 3.5.4 the page is *Decide* (owner decision 25.11.2026, ADR-145):
 * the decision in one go, on one page, `/project/[id]/redesign` (`components/redesign/RedesignPage.tsx`).
 *
 * This model is the walk the page and every "next step" read: the six tools after Analyze in the one tool order
 * (`PHASES`, ADR-128 (5)) with the program decision as a step of its own between Economics and Design, every state
 * read from what is on record (`workflowSteps()` and the decision record of ADR-092), and the one next step. Economics
 * is a step, never the next one (ADR-145 (5)). Nothing here is stored — no "mode", no visit, no view (CLAUDE.md: views
 * are never stored). Pure: no React, no Firestore.
 *
 * Every "go on" link of Analyze leads here (`redesignHref`), and the tool bar of Analyze groups the six tools under
 * "Re-design ›" (`components/workspace/ToolBar.tsx`). The business-question link of Analyze stays a direct link into
 * Design: it is a list of questions, not a step.
 */

import { DECISION_OPTION_LABELS, type DecisionOption } from './decision-options';
import { ECONOMICS_NOTHING_STORED, inToolOrder, type PhaseKey, type PhaseState, type RailStep } from './workflow-steps';
import { modelAbsenceReason, modelStageEnabled, type ModelStage, type ModelStageSubject } from './model-stages';

/** The route segment under `/project/{id}/`. */
export const REDESIGN_SEGMENT = 'redesign';

/** The demo's Re-design page (`app/(app)/demo/redesign/page.tsx`), or `…#decide`. The demo has no project id. */
export function demoRedesignHref(hash?: 'decide'): string {
  return hash ? `/demo/${REDESIGN_SEGMENT}#decide` : `/demo/${REDESIGN_SEGMENT}`;
}

/** The decision step's element id on the Re-design page — `…/redesign#decide`. */
export const REDESIGN_DECIDE_ID = 'decide';

/** The steps section's id on the Re-design page. */
export const REDESIGN_STEPS_ID = 'redesign-steps';

/**
 * The name the reader sees in the tool bar, the eyebrow and the links: *Decide* since 3.5.4 (owner decision 25.11.2026,
 * ADR-145), *Re-design* before. The route keeps its segment, `/project/[id]/redesign`, so every link and bookmark holds.
 */
export const REDESIGN_LABEL = 'Decide';

/** `/project/{id}/redesign`, or `…#decide` for the decision step. */
export function redesignHref(projectId: string, hash?: 'decide'): string {
  const base = `/project/${encodeURIComponent(projectId)}/${REDESIGN_SEGMENT}`;
  return hash ? `${base}#${hash === 'decide' ? REDESIGN_DECIDE_ID : hash}` : base;
}

/** Where the program decision stands, as the decision record says it. `option` is the chosen one, if any. */
export interface RedesignDecision {
  stage: 'not-decided' | 'chosen' | 'confirmed' | 'outdated' | 'unknown';
  option: DecisionOption | null;
  /** The option the evidence points to (`decisionOptionsView().proposed`) — an indication, not a decision. */
  indicated: DecisionOption | null;
}

export type RedesignStepKey = Exclude<PhaseKey, 'analyze'> | 'decide';

export type RedesignStepState = 'done' | 'started' | 'stale' | 'open' | 'not-needed';

export interface RedesignStep {
  key: RedesignStepKey;
  /** 1–7 within Re-design: Economics 1, the decision 2, Design 3 … Delivery 7. */
  n: number;
  /** The tool's name, or "Decide". */
  label: string;
  /** What the step does for this program, one sentence. */
  purpose: string;
  state: RedesignStepState;
  /** The state in words, for the right-hand column. */
  stateWords: string;
  /** The tool's route segment; `null` for the decision, which stands on this page. */
  path: string | null;
  /**
   * Set when the step has nothing on record and the model that writes it is switched off for this account
   * (`lib/model-stages.ts`): the sentence that says so. Opening the tool still works; generating there cannot.
   */
  blocked?: string;
}

export interface RedesignNext {
  key: RedesignStepKey | 'analyze';
  /** The primary action's words: "Decide: keep, rebuild, move or retire". */
  label: string;
  /** Route segment under the project, or `#decide` on this page. */
  path: string;
  /** One line under the action. */
  note: string;
  /**
   * Set when nothing is waiting any more: a confirmed decision that builds nothing (Keep, Move to SAP standard,
   * Retire) ends the walk. The action then opens the decision record on this page, never a tool.
   */
  done?: true;
}

export interface RedesignModel {
  steps: RedesignStep[];
  /** The one primary action, or `null` when nothing is open. */
  next: RedesignNext | null;
  /** The answer to "Where is the re-design of this program?", one or two sentences. */
  answer: string;
  /** Whether the analysis is signed — every step stands on it. */
  analysed: boolean;
}

/** What each step does — one line each, in the mock-up's words (`mgmt-view.html`, screen 2). */
export const REDESIGN_PURPOSE: Readonly<Record<RedesignStepKey, string>> = Object.freeze({
  tco: 'The cost of keeping it, the cheapest change that keeps the function, the lowest overall; with your figures or AI proposals.',
  decide: 'Keep, rebuild, move to SAP standard or retire. Recorded by your signed-in account: a self-declaration, not a mandate.',
  design: 'What the decided option means for this program: the target and the business questions, written into a design.',
  transformation: 'The new code for the target, every line marked.',
  documentation: 'One document for the program, with the map as its first figure.',
  testing: 'Whether the program is tested, and where it ran.',
  delivery: 'The package and the signed audit pack: can it be handed over?',
});

/**
 * The steps after the decision that a decision building nothing makes unnecessary: Design (there is no target to design
 * or sign off) and the four that build. With nothing on record they read "Not needed"; a step that already holds
 * something keeps its own state, because that is what is on record (`workflowSteps()`).
 */
const NOT_NEEDED_STEPS: readonly PhaseKey[] = ['design', 'transformation', 'documentation', 'testing', 'delivery'];

/** "Not needed: Retire builds nothing", or, while the option is only chosen, "Not needed once Retire is confirmed". */
function notNeededWords(option: DecisionOption, confirmed: boolean): string {
  const named = DECISION_OPTION_LABELS[option];
  return confirmed ? `Not needed: ${named} builds nothing` : `Not needed once ${named} is confirmed`;
}

const DECIDE_LABEL = 'Decide';

/** The tools whose own artefact only a model writes today (the same four as the "Next step" rule, `lib/next-step.ts`). */
const MODEL_STAGE_OF: Partial<Record<PhaseKey, ModelStage>> = {
  design: 'design',
  transformation: 'transformation',
  documentation: 'documentation',
  testing: 'testing',
};

function phaseStateWords(state: PhaseState, key: PhaseKey, badge?: string): { state: RedesignStepState; words: string } {
  if (state === 'done') return { state: 'done', words: 'Done' };
  // A signed run and no figures stored: nothing in Economics was started, whatever the rail calls it.
  if (key === 'tco' && state === 'partial' && badge === ECONOMICS_NOTHING_STORED) return { state: 'open', words: 'Not started' };
  if (state === 'stale') return { state: 'stale', words: 'Out of date' };
  // Economics' `partial` is figures stored with a step still open (`toolOnRecord`): started, not priced.
  if (state === 'partial') return { state: 'started', words: key === 'tco' ? 'Started, not priced yet' : 'Started' };
  return { state: 'open', words: 'Not started' };
}

function decisionWords(d: RedesignDecision): { state: RedesignStepState; words: string } {
  const named = d.option ? DECISION_OPTION_LABELS[d.option] : '';
  switch (d.stage) {
    case 'confirmed':
      return { state: 'done', words: `Decided: ${named}` };
    case 'outdated':
      return { state: 'stale', words: `Decided: ${named}, out of date` };
    case 'chosen':
      return { state: 'started', words: `${named} chosen, not confirmed` };
    case 'unknown':
      return { state: 'open', words: 'Not read yet' };
    default:
      return { state: 'open', words: 'Not taken yet' };
  }
}

/** The action words for a step, as the primary button says them. */
function actionOf(step: RedesignStep, first: boolean): string {
  switch (step.key) {
    case 'tco':
      // Never the next step (ADR-145 (5)); kept for a caller that names the step itself.
      return step.state === 'open' ? 'Open Economics: your own figures' : 'Continue in Economics';
    case 'decide':
      return 'Decide: keep, rebuild, move or retire';
    case 'design':
      return first ? 'Open Design' : 'Continue in Design';
    default:
      return `Continue in ${step.label}`;
  }
}

/**
 * The Re-design page's model: the six tools in `PHASES` order with the decision after Economics, each state from the
 * record, and the next step. `steps` is `workflowSteps(project)`; `decision` comes from the decision record.
 */
export function redesignModel(
  steps: readonly RailStep[],
  decision: RedesignDecision,
  /** The signed-in account's own switches (`modelStages`); absent reads every stage as on, never an invented block. */
  account?: ModelStageSubject | null,
): RedesignModel {
  const analyze = steps.find((s) => s.key === 'analyze');
  const analysed = analyze?.state === 'done';
  const ordered = inToolOrder(steps.filter((s) => s.key !== 'analyze'));
  const decided = (decision.stage === 'confirmed' || decision.stage === 'outdated' || decision.stage === 'chosen') && decision.option;
  const buildsNothing = Boolean(decided && decision.option !== 'rebuild');
  // Confirmed on record (also when the run has moved since: the record still stands until it is decided again).
  const recorded = decision.stage === 'confirmed' || decision.stage === 'outdated';
  // The walk ends at a confirmed decision that builds nothing: no step after it is waiting.
  const walkEnds = buildsNothing && decision.stage === 'confirmed';

  const out: RedesignStep[] = [];
  let n = 0;
  for (const phase of ordered) {
    const notNeeded = buildsNothing && NOT_NEEDED_STEPS.includes(phase.key) && phase.state === 'empty';
    const read = notNeeded
      ? { state: 'not-needed' as const, words: notNeededWords(decision.option as DecisionOption, recorded) }
      : phaseStateWords(phase.state, phase.key, phase.badge);
    const stage = MODEL_STAGE_OF[phase.key];
    const blocked =
      stage !== undefined && !notNeeded && phase.state === 'empty' && !modelStageEnabled(account ?? null, stage)
        ? modelAbsenceReason('stage-off', stage)
        : undefined;
    out.push({
      key: phase.key as Exclude<PhaseKey, 'analyze'>,
      n: (n += 1),
      label: phase.label,
      purpose: REDESIGN_PURPOSE[phase.key as Exclude<PhaseKey, 'analyze'>],
      state: read.state,
      stateWords: read.words,
      path: phase.path,
      ...(blocked ? { blocked } : {}),
    });
    if (phase.key === 'tco') {
      const d = decisionWords(decision);
      out.push({ key: 'decide', n: (n += 1), label: DECIDE_LABEL, purpose: REDESIGN_PURPOSE.decide, state: d.state, stateWords: d.words, path: null });
    }
  }

  let next: RedesignNext | null = null;
  if (!analysed) {
    next = {
      key: 'analyze',
      label: analyze?.state === 'stale' ? 'Run the analysis again' : 'Run the analysis first',
      path: 'analyze',
      note: 'The decision and every tool after it stand on a signed analysis run.',
    };
  } else if (walkEnds) {
    // Nothing is waiting: the decision is the result. The action opens it, as the program's tile does ("Open the
    // decision", `programNextLink`); Economics or Design stay reachable as steps, never as the next one.
    const named = DECISION_OPTION_LABELS[decision.option as DecisionOption];
    next = {
      key: 'decide',
      label: 'Open the decision',
      path: `#${REDESIGN_DECIDE_ID}`,
      note: `Done. ${named} builds nothing, so no step is waiting.`,
      done: true,
    };
  } else {
    // Economics is no station the walk waits at (owner decision 25.11.2026, ADR-145 (5)): the Decide page prices the
    // four options on typical assumptions itself, as a simulation, and own figures stay in Economics. So the next
    // step is the decision, then the tools after it; Economics stays a step anyone can open.
    const open = out.find((s) => s.key !== 'tco' && s.state !== 'done' && s.state !== 'not-needed');
    if (open) {
      next = {
        key: open.key,
        label: actionOf(open, open.key === 'design' && out.every((s) => s.key !== 'design' || s.state === 'open')),
        path: open.path ?? `#${REDESIGN_DECIDE_ID}`,
        note:
          open.key === 'decide'
            ? 'One page: cost, the four options, your answers, one confirmation. Not counted against your runs.'
            : `Step ${open.n} of 7.${open.blocked ? ` ${open.blocked}` : ''}`,
      };
    }
  }

  // Tools after the decision already hold work (built ahead of it): the answer names them instead of "Not started"
  // above a list that says Done (journey review 26.11.2026).
  const ahead = out.filter((s) => s.key !== 'tco' && s.key !== 'decide' && (s.state === 'done' || s.state === 'started'));
  const aheadLine = ahead.length ? `Built ahead of the decision: ${ahead.map((s) => s.label).join(', ')}. ` : '';
  const answer = !analysed
    ? 'Not started. The decision builds on a signed analysis run, and there is none yet.'
    : decided
      ? buildsNothing
        ? walkEnds
          ? `Decided: ${DECISION_OPTION_LABELS[decision.option as DecisionOption]}. Nothing is built, so nothing is waiting. Design still shows what the decision means for this program, if you want to read it.`
          : recorded
            ? `Decided: ${DECISION_OPTION_LABELS[decision.option as DecisionOption]}, out of date: the evidence or the costs changed since it was confirmed. Decide again.`
            : `${DECISION_OPTION_LABELS[decision.option as DecisionOption]} chosen earlier, not recorded yet. Record the decision to end it here.`
        : next
          ? `Decided: Rebuild. Next: ${next.key === 'decide' ? DECIDE_LABEL : out.find((s) => s.key === next?.key)?.label ?? ''}.`
          : 'Decided: Rebuild. Every step is on record.'
      : `${aheadLine}Not decided yet: keep, rebuild, move to SAP standard or retire. The decided option is built in the tools after it.`;

  return { steps: out, next, answer, analysed };
}
