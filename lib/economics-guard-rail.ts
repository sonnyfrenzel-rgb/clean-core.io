/**
 * Economics' range as Design's guard rail (ADR-128 (6), ECO-N5): Design works from the program decision taken in
 * Management — Keep, Rebuild, Move to SAP standard or Retire — and checks its plan against the range Economics priced
 * for that option. Design computes no amounts; this module reads what is already there and says it in words.
 *
 * What it reads, and nothing else:
 *   - the program decision: the target architecture a sign-off stored (`targetArchitecture`, `approvedByArchitect`),
 *     mapped to its option by `optionOfArchitecture` — the same reading as My workspace (`decisionOf`), without the
 *     run's proposal: a guard rail stands on a decision, not on a recommendation;
 *   - the stored Economics record (`_economics`, ADR-092), priced through the one money model
 *     (`lib/cost-assumptions.ts`) — no second arithmetic.
 *
 * No stored field, no rules change: both are read as the loader already hands them over.
 *
 * "Outside the priced range" compares days, not money: a plan's one-off effort in days against the days the decided
 * option was priced on. Design states days of its own plan where it has any; it never turns them into an amount.
 *
 * Pure: no React, no Firestore.
 */
import { costComparison, type AmountRange, type CostOption, type EffortDays } from './cost-assumptions';
import { restoreAssumptions, type EconomicsRecord } from './economics-record';
import { DECISION_OPTION_LABELS, optionOfArchitecture, optionOfCostKind, type DecisionOption } from './decision-options';
import { formatDays, formatMoneyRangeOutward } from './format';
import { yearsWords } from './economics-answer';

export interface ProgramDecisionRead {
  option: DecisionOption;
  label: string;
  /** Signed off (`approvedByArchitect`), or chosen and not yet signed off. */
  confirmed: boolean;
}

/** What the guard rail reads of a project — the loader's own fields. */
export interface GuardRailProject {
  targetArchitecture?: string | null;
  approvedByArchitect?: boolean | null;
  _economics?: EconomicsRecord | null;
}

/** The program decision on record, or `null` while none is taken. */
export function programDecisionOf(project: GuardRailProject | null | undefined): ProgramDecisionRead | null {
  const option = optionOfArchitecture(project?.targetArchitecture ?? null);
  if (!option) return null;
  return { option, label: DECISION_OPTION_LABELS[option], confirmed: project?.approvedByArchitect === true };
}

export type GuardRailState =
  /** No decision is on record: Design works as before, and says the decision comes first. */
  | 'no-decision'
  /** A decision, but Economics holds no figures. */
  | 'no-figures'
  /** A decision and figures, but the decided option is not priced (an option or a shared figure is missing). */
  | 'not-priced'
  /** The decided option is priced: its range is the guard rail. */
  | 'priced';

export interface EconomicsGuardRail {
  state: GuardRailState;
  decision: ProgramDecisionRead | null;
  /** The decided option's total over the period, in the reader's currency. */
  range: AmountRange | null;
  /** The one-off days the decided option was priced on — what a plan's days are checked against. */
  days: { low: number; high: number } | null;
  currency: string;
  years: number | null;
  /** One sentence for the slot. */
  sentence: string;
}

const dayTotal = (d: EffortDays | null | undefined): number | null =>
  d && Number.isFinite(d.devDays) && Number.isFinite(d.testDays) ? d.devDays + d.testDays : null;

/** The cost option a decision stands for: Keep is the stored `do-nothing`; Rebuild prefers the code rebuild. */
function optionFor(options: readonly CostOption[], decision: DecisionOption): CostOption | null {
  const matching = options.filter((o) => optionOfCostKind(o.kind) === decision);
  return matching.find((o) => o.kind !== 'keyuser') ?? matching[0] ?? null;
}

/** The guard rail Design shows beside its plan. */
export function economicsGuardRail(project: GuardRailProject | null | undefined): EconomicsGuardRail {
  const decision = programDecisionOf(project);
  const record = project?._economics ?? null;
  const base = { decision, range: null, days: null, currency: '', years: null } as const;
  if (!decision) {
    return { ...base, state: 'no-decision', sentence: 'No program decision yet. It is taken in Management, on the costs Economics prices.' };
  }
  if (!record) {
    return { ...base, state: 'no-figures', sentence: `${decision.label} is not priced yet: Economics holds no figures for this program.` };
  }
  const a = restoreAssumptions(record.assumptions);
  const option = optionFor(a.options, decision.option);
  const cost = option ? costComparison(a).costs.find((c) => c.optionId === option.id) ?? null : null;
  const low = dayTotal(option?.oneOff?.low);
  const high = dayTotal(option?.oneOff?.high);
  const days = low !== null && high !== null ? { low, high } : null;
  if (!cost || !cost.total) {
    return {
      ...base,
      years: a.horizonYears,
      currency: a.currency,
      days,
      state: 'not-priced',
      sentence: `${decision.label} is not priced yet: Economics still needs figures for it.`,
    };
  }
  return {
    decision,
    range: cost.total,
    days,
    currency: a.currency,
    years: a.horizonYears,
    state: 'priced',
    sentence: `Economics priced ${decision.label} at ${formatMoneyRangeOutward(cost.total, a.currency)} over ${yearsWords(a.horizonYears)}${
      days ? `, on ${formatDays(days.low)}–${formatDays(days.high)} days once` : ''
    }.`,
  };
}

/**
 * Whether a plan's one-off days leave the range the decided option was priced on — "outside the priced range,
 * re-price". `null` when there is nothing to compare (no priced range, no days of the plan).
 */
export function outsidePricedRange(rail: EconomicsGuardRail, plannedOneOffDays: number | null | undefined): boolean | null {
  if (rail.state !== 'priced' || !rail.days) return null;
  if (typeof plannedOneOffDays !== 'number' || !Number.isFinite(plannedOneOffDays)) return null;
  return plannedOneOffDays < rail.days.low || plannedOneOffDays > rail.days.high;
}

/** The words a plan outside the range carries, and where they lead. */
export const OUTSIDE_PRICED_RANGE = 'Outside the priced range: re-price it in Economics.';
