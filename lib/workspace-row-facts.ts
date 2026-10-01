import { levelDistribution, type ItFindingsSource } from '@/lib/it-findings';
import { readProcessStates, subjectIdsOf, type ProcessStateView } from '@/lib/process-states';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';

/**
 * Two figures per row of "My workspace" that the project document does not
 * carry — mockup s7's *Levels* and *Rules confirmed* columns.
 *
 * Neither is stored anywhere, on purpose: the clean core level is never part
 * of a run or the audit pack (`CLAUDE.md`), and the confirmed rules live in the
 * process-state register. So both are read from the same two routes the
 * workspace itself reads (`/findings` for IT, `/process-states` for the rules),
 * and this module only turns their answers into what a row prints. Pure, so a
 * spec can drive every state without a server.
 *
 * Every figure can also be absent, and says why in words — a row that has not
 * been analysed has no level distribution, which is not "no D findings".
 */

/** The four levels a row shows, in order. Unknown is counted but drawn only when it is there. */
export const ROW_LEVELS: readonly CloudReadinessGrade[] = ['A', 'B', 'C', 'D'];

export interface RowLevels {
  /** Findings per level, including Unknown. Zero levels are kept, so a filter can ask. */
  counts: Record<CloudReadinessGrade, number>;
  /** Findings that carry a level at all. */
  graded: number;
  /** All findings the engine read. */
  total: number;
}

export interface RowRules {
  /** Rules with a decision on record: keep, change or drop. "Clarify" is still open. */
  confirmed: number;
  /** Rules the engine derived from the source. */
  total: number;
}

export type RowFact<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  /** Read and answered with nothing to show — the reason, in words. */
  | { state: 'absent'; reason: string };

export interface RowFacts {
  levels: RowFact<RowLevels>;
  rules: RowFact<RowRules>;
}

export const LOADING_FACTS: RowFacts = { levels: { state: 'loading' }, rules: { state: 'loading' } };

/** What the findings route answered, as the Levels cell. */
export function levelsOf(source: ItFindingsSource | null): RowFact<RowLevels> {
  if (!source || !Array.isArray(source.rows)) return { state: 'absent', reason: 'not read' };
  const distribution = levelDistribution(source.rows);
  const counts = Object.fromEntries(distribution.slices.map((s) => [s.grade, s.count])) as Record<
    CloudReadinessGrade,
    number
  >;
  if (distribution.graded === 0) {
    return { state: 'absent', reason: source.rows.length === 0 ? 'no findings' : 'no object to grade' };
  }
  return { state: 'ready', value: { counts, graded: distribution.graded, total: source.rows.length } };
}

/**
 * What the process-state route answered, as the Rules confirmed cell.
 *
 * `noBaseline` is the route's own refusal for a process nobody has opened yet
 * (`code: 'no-baseline'`): nothing can have been confirmed without it, so the
 * honest count is 0 of the rules the engine derived. Every other refusal means
 * the confirmations could not be read, and the cell says so instead of a zero.
 */
export function rulesOf(
  view: ProcessStateView | null,
  derived: number | null,
  refusal: string | null,
): RowFact<RowRules> {
  if (view) {
    const { rules } = subjectIdsOf(view.subjects);
    if (rules.length === 0) return { state: 'absent', reason: 'no rules in the code' };
    const states = readProcessStates(view.entries, { elements: [], rules });
    const confirmed = states.counts.keep + states.counts.change + states.counts.drop;
    return { state: 'ready', value: { confirmed, total: rules.length } };
  }
  if (refusal === 'no-baseline' && typeof derived === 'number') {
    if (derived === 0) return { state: 'absent', reason: 'no rules in the code' };
    return { state: 'ready', value: { confirmed: 0, total: derived } };
  }
  return { state: 'absent', reason: 'not counted' };
}

/** Does this row have findings at the given level? `null` while that is not known. */
export function rowHasLevel(facts: RowFacts | undefined, level: CloudReadinessGrade): boolean | null {
  if (!facts || facts.levels.state === 'loading') return null;
  if (facts.levels.state === 'absent') return false;
  return (facts.levels.value.counts[level] ?? 0) > 0;
}
