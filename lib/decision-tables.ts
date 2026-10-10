import type { BusinessRuleSet, DecisionTable } from '@/lib/abap/business-rule-set';

/**
 * Decision tables as a reader sees them — roadmap 3.0.7 (ZMM_BESTELLUEBERSICHT
 * review, recommendation 3): a classification the source writes as an
 * `IF`/`ELSEIF` chain or a `CASE` whose arms only set one field reads as **one
 * business rule task with its table**, one row per arm, condition → value.
 *
 * The engine records the table (`BusinessRuleSet.decisionTables`,
 * `lib/abap/decision-table.ts`) and keeps the gateway on the map — the process
 * benchmark's blind expected answers model these as gateways. This is the one
 * reading the Documentation (rules section, main path, every export) and the
 * Business view's rules share, so the two say the same thing.
 *
 * Verbatim: conditions and values are the source's text; nothing is named,
 * translated or grouped. Every row keeps its line, the table its range.
 *
 * Pure: no React, no DOM.
 */

export interface DecisionTableLine {
  lineStart: number;
  lineEnd: number;
}

export interface DecisionTableView {
  /** `DT-001`. */
  id: string;
  /** The field every row sets, as the source writes it. */
  field: string;
  /** The `CASE` selector; `null` for an `IF` chain. */
  selector: string | null;
  /** The FORM, method or event block the table stands in; `null` at program level. */
  where: string | null;
  /** The whole construct, `IF` to `ENDIF`. */
  anchor: DecisionTableLine;
  rows: Array<{
    /** The condition as written; `null` for `ELSE`/`WHEN OTHERS`. */
    condition: string | null;
    value: string;
    /** The constant the value names, when the source declares it. */
    constant: string | null;
    anchor: DecisionTableLine;
  }>;
  /** The gateway the map draws for it, when it draws one. */
  nodeId: string | null;
  /** The business rules standing in the table (their conditions or constants). */
  ruleIds: string[];
}

/** What a row without a condition (`ELSE`, `WHEN OTHERS`) reads as. */
export const DECISION_TABLE_OTHERWISE = 'Otherwise';

/** The head of a decision table: the condition column, the value column. */
export const DECISION_TABLE_HEAD = ['When', 'Value'] as const;

const line = (a: { lineStart: number; lineEnd: number }): DecisionTableLine => ({ lineStart: a.lineStart, lineEnd: a.lineEnd });

function viewOf(table: DecisionTable): DecisionTableView {
  return {
    id: table.id,
    field: table.field,
    selector: table.selector,
    where: table.source.routine,
    anchor: line(table.anchor),
    rows: table.rows.map((row) => ({
      condition: row.condition,
      value: row.value,
      constant: row.constant ?? null,
      anchor: line(row.anchor),
    })),
    nodeId: table.nodeId,
    ruleIds: [...table.ruleIds],
  };
}

/** Every decision table of a rule set, in its order (`DT-001` …). Empty when the source has none. */
export function decisionTableViews(set: BusinessRuleSet | null | undefined): DecisionTableView[] {
  return (set?.decisionTables ?? []).map(viewOf);
}

/** The condition cell of a row: verbatim, or "Otherwise"; a `CASE` row names its selector. */
export function decisionRowWhen(table: Pick<DecisionTableView, 'selector'>, condition: string | null): string {
  if (condition === null) return DECISION_TABLE_OTHERWISE;
  return table.selector ? `${table.selector} = ${condition}` : condition;
}

/** "Determines gs_row-ampel" — the business rule task's name, the field as the code writes it. */
export function decisionTableTaskName(table: Pick<DecisionTableView, 'field' | 'selector'>): string {
  return `Determines ${table.field}${table.selector ? ` by ${table.selector}` : ''}`;
}

/**
 * How a decision table is read, in one line (ADR-084, roadmap 3.0.7 A3) —
 * deterministic from the table: an `IF`/`ELSEIF` chain and a `CASE` both take
 * the first arm whose condition holds, so the first matching row wins; a row
 * without a condition is the `ELSE`/`WHEN OTHERS` arm (`condition === null`,
 * `lib/abap/decision-table.ts`). Without one, a case no row matches leaves the
 * field as this code found it — the table does not set it.
 */
export function decisionTableHitPolicy(table: Pick<DecisionTableView, 'field' | 'rows'>): string {
  const otherwise = table.rows.some((r) => r.condition === null);
  return otherwise
    ? `The first matching row wins; the rows below it are not checked. ${DECISION_TABLE_OTHERWISE} applies when no other row matches.`
    : `The first matching row wins; the rows below it are not checked. There is no ${DECISION_TABLE_OTHERWISE} row: when no row matches, the table does not set ${table.field}.`;
}

/** "c_rot / c_gelb / c_gruen" — the values a table can set, each once, in row order. */
export function decisionTableValues(table: Pick<DecisionTableView, 'rows'>): string {
  return [...new Set(table.rows.map((r) => r.value))].join(' / ');
}
