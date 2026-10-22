/**
 * Has anyone weighed the SAP standard, and is a decision on record? — the two
 * facts behind the rebuild warning (roadmap 3.0.12; SD review, rebuild gate
 * decided by the owner 12.10.2026, carried as a warning, not a gate).
 *
 * The owner's rule: no rebuild code should be generated while standard fit is
 * unassessed and the core rules are undecided — unless the owner goes ahead
 * with a reason. The Transformation does not stop on it; it warns, in the
 * quality tips before the run, and the PLATFORM KNOWLEDGE block of the prompt
 * says the same, so the draft cannot read as if the standard had been ruled
 * out. Both read these two functions, so the tip and the prompt cannot
 * disagree about whether the standard was weighed.
 *
 *   - `standardFitAssessed(project)` — the standard counts as weighed when the
 *     confirmed decision moves the program to SAP standard, or when the stored
 *     solution design compared the standard with RAP and CAP on facts (a
 *     fit-gap for the standard, and a reason that is not circular —
 *     `lib/design-option-comparison.ts`). The second is a model proposal and
 *     is said to be one. Nothing else counts: the Standard fit table's rows
 *     carried catalog pointers at E0/E1 and no fit (the table was removed by owner decision 22.10.2026).
 *   - `decisionOnRecord(project)` — the stored decision record (roadmap 8.4),
 *     its status, whether it is confirmed on the run the project analyses now,
 *     and the option it names.
 *   - `rebuildWarning(project, openRules)` — the two together with the open
 *     rule count, for the one place that has it.
 *
 * Pure and client-safe: no React, no Firestore, no `node:crypto`.
 */

import { cleanAndParseJSON } from './design-response';
import { comparisonWeighsStandard, readOptionComparison } from './design-option-comparison';
import { readStoredDecision } from './decision-draft';
import { DECISION_OPTION_LABELS, optionOfArchitecture, type DecisionOption } from './decision-options';

/** What the functions read of a project — a `Project`, or the raw document a server route holds. */
export type GateProject = {
  decision?: unknown;
  solutionDesign?: unknown;
  activeRunId?: unknown;
} | null | undefined;

export type StandardFitBasis = 'decision-standard' | 'design-comparison';

export interface StandardFitAssessment {
  assessed: boolean;
  /** What counts as the assessment, or null when there is none. */
  basis: StandardFitBasis | null;
  /** One sentence for a tip or the prompt. */
  sentence: string;
}

export interface DecisionOnRecord {
  /** A decision record is stored (any status). */
  onRecord: boolean;
  /** Confirmed, on the run the project analyses now. */
  confirmed: boolean;
  /** Confirmed, but on an earlier run — history, not the current decision. */
  confirmedEarlierRun: boolean;
  id: string | null;
  revision: number | null;
  status: string | null;
  /** The program option the record names (Keep · Rebuild · Move to SAP standard · Retire), or null. */
  option: DecisionOption | null;
  /** One sentence for a tip or the prompt. */
  sentence: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The option id of an option binding's revision — "cap · Side-by-Side …" → `cap`. */
const optionIdOf = (revision: string | null | undefined): string | null => {
  if (!revision) return null;
  const at = revision.indexOf(' · ');
  return at > 0 ? revision.slice(0, at) : revision;
};

/** The stored decision record, read for the gate. */
export function decisionOnRecord(project: GateProject): DecisionOnRecord {
  const stored = project ? readStoredDecision(project.decision) : null;
  if (!stored) {
    return {
      onRecord: false, confirmed: false, confirmedEarlierRun: false, id: null, revision: null, status: null, option: null,
      sentence: 'No decision is on record — keep, rebuild, move to SAP standard or retire has not been decided.',
    };
  }
  const option = optionOfArchitecture(optionIdOf(stored.bindings.find((b) => b.key === 'option')?.revision ?? null));
  const isConfirmed = stored.status === 'confirmed';
  const current = stored.boundRunId === (str(project?.activeRunId) ?? '');
  const confirmed = isConfirmed && current;
  const named = option ? ` (${DECISION_OPTION_LABELS[option]})` : '';
  const id = `${stored.decisionId} revision ${stored.revision}`;
  const sentence = confirmed
    ? `Decision ${id}${named} is confirmed on the current run.`
    : isConfirmed
      ? `Decision ${id}${named} was confirmed on an earlier run — not the current decision.`
      : `Decision ${id}${named} is ${stored.status}, not confirmed.`;
  return {
    onRecord: true,
    confirmed,
    confirmedEarlierRun: isConfirmed && !current,
    id: stored.decisionId,
    revision: stored.revision,
    status: stored.status,
    option,
    sentence,
  };
}

/** Whether the SAP standard was weighed for this program — see the module comment for what counts. */
export function standardFitAssessed(project: GateProject): StandardFitAssessment {
  const decision = decisionOnRecord(project);
  if (decision.confirmed && decision.option === 'standard') {
    return { assessed: true, basis: 'decision-standard', sentence: 'The confirmed decision moves the program to SAP standard.' };
  }
  const design = str(project?.solutionDesign);
  if (design) {
    let parsed: unknown = null;
    try {
      parsed = cleanAndParseJSON(design);
    } catch {
      parsed = null;
    }
    const view = readOptionComparison(parsed);
    if (comparisonWeighsStandard(view)) {
      return {
        assessed: true,
        basis: 'design-comparison',
        sentence: 'The solution design compared the SAP standard with RAP and CAP on the engine\'s facts (a model proposal, not a decision).',
      };
    }
    if (view.state === 'ready' && view.refused) {
      return { assessed: false, basis: null, sentence: `Standard fit is not assessed: the design's comparison gives no usable reason — ${view.refused}` };
    }
  }
  return {
    assessed: false,
    basis: null,
    sentence: 'Standard fit is not assessed: no decision moves the program to SAP standard, and no solution design compared the standard with RAP and CAP.',
  };
}

export interface RebuildWarning {
  /** The owner's rule applies: standard unweighed, no confirmed decision, and core rules undecided. */
  warn: boolean;
  standardFit: StandardFitAssessment;
  decision: DecisionOnRecord;
  /** Open rules as counted by the caller, or null when not read. */
  openRules: number | null;
}

/**
 * The warning before a rebuild is generated (owner, 12.10.2026: a warning,
 * not a gate). It applies when the standard is not weighed, no decision is
 * confirmed on the current run — a confirmed decision is the owner going
 * ahead, with the reason it records — and at least one rule is undecided.
 * With `openRules` null (not read yet) it does not warn: an unread count is
 * not an open rule.
 */
export function rebuildWarning(project: GateProject, openRules: number | null): RebuildWarning {
  const standardFit = standardFitAssessed(project);
  const decision = decisionOnRecord(project);
  const warn = !standardFit.assessed && !decision.confirmed && openRules !== null && openRules > 0;
  return { warn, standardFit, decision, openRules };
}
