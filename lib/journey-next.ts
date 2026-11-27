/**
 * The one next step of the journey (journey review 26.11.2026, M2): every tool shows the same next step, worked out
 * by the same rule as the Re-design page (`redesignModel`), decision included. Before, three sources said where to go
 * — the tool row's "Next" tag (`nextPhaseKey`, which does not know the decision), Re-design's primary action and the
 * workspace's "Next step" card — and on a page they could disagree ("Analyze · Next" beside "Start with Economics").
 *
 * Pure: no React, no Firestore. The decision comes from the decision route as `useProgramDecision` reads it.
 */

import { optionOfArchitecture } from './decision-options';
import { outdatedReasonsOfAnswer } from './decision-cost';
import type { DecisionRead } from './management-overview';
import type { ModelStageSubject } from './model-stages';
import { redesignModel, type RedesignDecision, type RedesignNext, type RedesignStep } from './redesign';
import { economicsPassedOver, type PhaseKey, type RailStep } from './workflow-steps';

/** The decision in Re-design's words, from the decision route's answer — the same reading `useProgramDecision` makes. */
export function decisionOfRead(read: DecisionRead | null, loading: boolean): RedesignDecision {
  if (loading) return { stage: 'unknown', option: null, indicated: null };
  if (!read) return { stage: 'not-decided', option: null, indicated: null };
  const confirmed = read.stored && read.stored.status === 'confirmed' ? read.stored : null;
  const record = confirmed ?? read.draft;
  const optionRev = record?.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const option = optionOfArchitecture(optionRev === null ? null : optionRev.split(' · ')[0]);
  if (!option) return { stage: 'not-decided', option: null, indicated: null };
  if (confirmed) return { stage: outdatedReasonsOfAnswer(read).length > 0 ? 'outdated' : 'confirmed', option, indicated: null };
  return { stage: 'chosen', option, indicated: null };
}

export interface JourneyNext {
  /** The next step, as Re-design names it, or `null` when nothing is open. */
  next: RedesignNext | null;
  /**
   * The reader already stands on that step: the step after it, so the bar never sends the reader to the page they
   * are on. `null` when there is none.
   */
  after: { key: RedesignStep['key']; label: string; path: string } | null;
}

/** Where a step leads: the tool's page, or the decision on the Re-design page. */
function pathOf(step: RedesignStep): string {
  return step.path ?? 'redesign#decide';
}

/**
 * The next step for a reader standing on `here` (a tool, or `redesign` for the Re-design page). The demo passes its
 * reading as signed, as its Re-design page does.
 */
export function journeyNext(
  steps: readonly RailStep[],
  decision: RedesignDecision,
  here: PhaseKey | 'redesign' | null,
  account?: ModelStageSubject | null,
): JourneyNext {
  const model = redesignModel(steps, decision, account);
  // Economics is never the next step (ADR-145 (5)), and once the reader has gone on past it (a later tool holds a
  // record, `economicsPassedOver`) the way on does not send them back to it. The decision is no longer skipped: since
  // 3.5.4 it is recorded in one go on the Decide page, route included, with no sign-off in Design before it.
  const passed = economicsPassedOver(steps);
  const skip = (k: RedesignStep['key'] | 'analyze') => passed && k === 'tco';
  let next: RedesignNext | null = model.next ? { ...model.next, path: model.next.path === '#decide' ? 'redesign#decide' : model.next.path } : null;
  if (next && !next.done && skip(next.key)) {
    const on = model.steps.find((s) => !skip(s.key) && s.state !== 'done' && s.state !== 'not-needed') ?? null;
    next = on ? { key: on.key, label: on.key === 'design' ? 'Continue in Design' : `Continue in ${on.label}`, path: pathOf(on), note: `Step ${on.n} of 7.` } : null;
  }
  if (!next || next.key !== here) return { next, after: null };
  const at = model.steps.findIndex((s) => s.key === here);
  const following = model.steps.slice(at + 1).find((s) => !skip(s.key) && s.state !== 'done' && s.state !== 'not-needed') ?? null;
  return {
    next,
    after: following ? { key: following.key, label: following.key === 'decide' ? 'Decide: keep, rebuild, move or retire' : `Then ${following.label}`, path: pathOf(following) } : null,
  };
}
