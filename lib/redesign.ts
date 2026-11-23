/**
 * Re-design — the way on from Analyze (owner request 23.11.2026, ADR-143): "the onward path no longer jumps into the
 * tools but into Re-design and then into the further tools".
 *
 * Re-design is one read-only page per project, `/project/[id]/redesign`. It lists the six tools after Analyze in the
 * one tool order (`PHASES`, ADR-128 (5)) with the program decision as a step of its own between Economics and Design,
 * reads every state from what is on record (`workflowSteps()` and the decision record of ADR-092), and offers one
 * primary action: the next step. Nothing here is stored — no "mode", no visit, no view (CLAUDE.md: views are never
 * stored). Pure: no React, no Firestore.
 *
 * Every "go on" link of Analyze leads here (`redesignHref`), and the tool bar of Analyze groups the six tools under
 * "Re-design ›" (`components/workspace/ToolBar.tsx`). The business-question link of Analyze stays a direct link into
 * Design: it is a list of questions, not a step.
 */

import { DECISION_OPTION_LABELS, type DecisionOption } from './decision-options';
import { inToolOrder, type PhaseKey, type PhaseState, type RailStep } from './workflow-steps';

/** The route segment under `/project/{id}/`. */
export const REDESIGN_SEGMENT = 'redesign';

/** The decision step's element id on the Re-design page — `…/redesign#decide`. */
export const REDESIGN_DECIDE_ID = 'decide';

/** The steps section's id on the Re-design page. */
export const REDESIGN_STEPS_ID = 'redesign-steps';

/** The name the reader sees in the tool bar, the eyebrow and the links. */
export const REDESIGN_LABEL = 'Re-design';

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
}

export interface RedesignNext {
  key: RedesignStepKey | 'analyze';
  /** The primary action's words: "Start with Economics: price the options". */
  label: string;
  /** Route segment under the project, or `#decide` on this page. */
  path: string;
  /** One line under the action. */
  note: string;
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
  design: 'What the decided option means for this program: the target, the business questions, sign-off.',
  transformation: 'The new code for the target, every line marked.',
  documentation: 'One document for the program, with the map as its first figure.',
  testing: 'Whether the program is tested, and where it ran.',
  delivery: 'The package and the signed audit pack: can it be handed over?',
});

/** The steps that only a Rebuild builds — the others read "Not needed" after a decision that builds nothing. */
const BUILD_STEPS: readonly PhaseKey[] = ['transformation', 'documentation', 'testing', 'delivery'];

const DECIDE_LABEL = 'Decide';

function phaseStateWords(state: PhaseState, key: PhaseKey): { state: RedesignStepState; words: string } {
  if (state === 'done') return { state: 'done', words: 'Done' };
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
      return step.state === 'open' ? 'Start with Economics: price the options' : 'Continue in Economics: price the options';
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
export function redesignModel(steps: readonly RailStep[], decision: RedesignDecision): RedesignModel {
  const analyze = steps.find((s) => s.key === 'analyze');
  const analysed = analyze?.state === 'done';
  const ordered = inToolOrder(steps.filter((s) => s.key !== 'analyze'));
  const decided = (decision.stage === 'confirmed' || decision.stage === 'outdated' || decision.stage === 'chosen') && decision.option;
  const buildsNothing = Boolean(decided && decision.option !== 'rebuild');

  const out: RedesignStep[] = [];
  let n = 0;
  for (const phase of ordered) {
    const notNeeded = buildsNothing && BUILD_STEPS.includes(phase.key) && phase.state === 'empty';
    const read = notNeeded
      ? { state: 'not-needed' as const, words: `Not needed, decided: ${DECISION_OPTION_LABELS[decision.option as DecisionOption]}` }
      : phaseStateWords(phase.state, phase.key);
    out.push({
      key: phase.key as Exclude<PhaseKey, 'analyze'>,
      n: (n += 1),
      label: phase.label,
      purpose: REDESIGN_PURPOSE[phase.key as Exclude<PhaseKey, 'analyze'>],
      state: read.state,
      stateWords: read.words,
      path: phase.path,
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
      note: 'Every step of Re-design stands on a signed analysis run.',
    };
  } else {
    const open = out.find((s) => s.state !== 'done' && s.state !== 'not-needed');
    if (open) {
      next = {
        key: open.key,
        label: actionOf(open, open.key === 'design' && out.every((s) => s.key !== 'design' || s.state === 'open')),
        path: open.path ?? `#${REDESIGN_DECIDE_ID}`,
        note:
          open.key === 'tco'
            ? 'Step 1 of 7. Not counted against your runs.'
            : open.key === 'decide'
              ? 'Step 2 of 7. Recorded by your signed-in account.'
              : `Step ${open.n} of 7.`,
      };
    }
  }

  const priced = out.find((s) => s.key === 'tco');
  const answer = !analysed
    ? 'Not started. Re-design builds on a signed analysis run, and there is none yet.'
    : decided
      ? buildsNothing
        ? `Decided: ${DECISION_OPTION_LABELS[decision.option as DecisionOption]}. Nothing is built; Design shows what the decision means for this program.`
        : next
          ? `Decided: Rebuild. Next: ${next.key === 'decide' ? DECIDE_LABEL : out.find((s) => s.key === next?.key)?.label ?? ''}.`
          : 'Decided: Rebuild. Every step is on record.'
      : priced && priced.state === 'done'
        ? 'The options are priced. The decision is next: keep, rebuild, move to SAP standard or retire.'
        : 'Not started. First the four options are priced with your figures; then you decide; the decided option is built in the tools after it.';

  return { steps: out, next, answer, analysed };
}
