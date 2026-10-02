/**
 * Documentation's long lists — owner feedback 02.10.2026: "die langen Listen
 * standardmäßig eingeklappt lassen, das sind Details die die meisten User nicht
 * benötigen aber da sein sollten".
 *
 * One rule for the whole stage, real project and demo alike: a list of more
 * than {@link LONG_LIST_ROWS} rows starts folded behind its heading, its count
 * and one line that still answers the main question. A list of five rows or
 * fewer stays open. The five is `DESIGN.md` §2.11's ("Tables show the first
 * five rows").
 *
 * Every summary here is a count over the rows the list itself shows — the same
 * fields, the same words the rows use. It adds no claim the list does not make.
 * Pure: the demo renders it on the server, the stage in the browser, and the
 * specs read it directly.
 */

import type { CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import type { HandbookObject } from '@/lib/process-handbook';
import type { ProcessDocumentation } from '@/lib/process-documentation';

/** More rows than this and the list starts folded. */
export const LONG_LIST_ROWS = 5;

export function isLongList(rows: number): boolean {
  return rows > LONG_LIST_ROWS;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Form Routine 6, Include 2" — in order of size, ties in order of first appearance. */
function byCount(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, n]) => `${value} ${n}`)
    .join(', ');
}

/**
 * "3 written (2 custom, 1 SAP standard), 23 read · 3 high risk" — the coupling
 * cards' own words: `Write` and `Read/Write` write, `Read` reads, `Reference`
 * is neither; "custom" / "SAP standard" as the card prints it from `isCustom`.
 */
export function couplingSummary(
  entries: readonly Pick<DataCouplingEntry, 'accessType' | 'isCustom' | 'riskLevel'>[],
): string {
  const written = entries.filter((e) => e.accessType === 'Write' || e.accessType === 'Read/Write');
  const read = entries.filter((e) => e.accessType === 'Read').length;
  const referenced = entries.filter((e) => e.accessType === 'Reference').length;
  const custom = written.filter((e) => e.isCustom).length;
  const parts: string[] = [];
  parts.push(
    written.length > 0
      ? `${written.length} written (${[
          custom ? `${custom} custom` : '',
          written.length - custom ? `${written.length - custom} SAP standard` : '',
        ].filter(Boolean).join(', ')})`
      : 'none written',
  );
  if (read) parts.push(`${read} read`);
  if (referenced) parts.push(`${referenced} referenced`);
  const high = entries.filter((e) => e.riskLevel === 'High').length;
  return `${parts.join(', ')} · ${high} high risk`;
}

/** "by type: Form Routine 6, Include 2 · 1 high criticality" — the inventory table's columns. */
export function inventorySummary(items: readonly Pick<CodeInventoryItem, 'type' | 'criticality'>[]): string {
  const high = items.filter((o) => o.criticality === 'High').length;
  return `by type: ${byCount(items.map((o) => o.type))} · ${high} high criticality`;
}

/** "by kind: Task 12, Exclusive gateway 4 · 2 without lines" — the element table's columns. */
export function stepsSummary(steps: ProcessDocumentation['steps']): string {
  const without = steps.filter((s) => !s.anchor).length;
  return `by kind: ${byCount(steps.map((s) => s.kind))} · ${without === 0 ? 'every one with its lines' : `${without} without lines`}`;
}

/** "in program order · every one with its lines" / "… · 3 of 40 with lines". */
export function statementsSummary(statements: ProcessDocumentation['statements']): string {
  const anchored = statements.filter((s) => s.anchors.length > 0).length;
  return `in program order · ${anchored === statements.length ? 'every one with its lines' : `${anchored} of ${statements.length} with lines`}`;
}

/** "2 update registrations · COMMIT WORK 3, ROLLBACK WORK 1". */
export function effectsSummary(effects: ProcessDocumentation['effects']): string {
  const parts = [plural(effects.registrations.length, 'update registration', 'update registrations')];
  if (effects.events.length > 0) parts.push(byCount(effects.events.map((e) => e.token)));
  return parts.join(' · ');
}

/** "4 from the code, 3 proposed". */
export function lanesSummary(doc: Pick<ProcessDocumentation, 'lanes' | 'proposedLanes'>): string {
  const parts = [`${doc.lanes.length} from the code`];
  if (doc.proposedLanes.length > 0) parts.push(`${doc.proposedLanes.length} proposed`);
  return parts.join(', ');
}

/** "Process owner, Roles, Systems and 4 more". */
export function gapsSummary(gaps: ProcessDocumentation['notDetermined']): string {
  const first = gaps.slice(0, 3).map((g) => g.subject);
  const rest = gaps.length - first.length;
  return rest > 0 ? `${first.join(', ')} and ${rest} more` : first.join(', ');
}

/** "7 parameters on the selection screen". */
export function inputsSummary(inputs: readonly unknown[]): string {
  return `${plural(inputs.length, 'parameter', 'parameters')} on the selection screen`;
}

/** "3 tables changed, 9 called by name". */
export function outputsSummary(writes: readonly HandbookObject[], calls: readonly HandbookObject[]): string {
  return `${plural(writes.length, 'table', 'tables')} changed, ${calls.length} called by name`;
}
