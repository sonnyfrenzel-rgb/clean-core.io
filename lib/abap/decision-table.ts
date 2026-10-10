import type { AbapStatement } from './statement-reader';
import type { Branch } from './control-flow';

/**
 * A decision table read off an `IF`/`ELSEIF` chain or a `CASE` — roadmap 3.0.7
 * (ZMM_BESTELLUEBERSICHT review, recommendation 3).
 *
 * The review's most important business rule was a traffic light:
 *
 *     IF it_ausgabe-eindt < sy-datum AND it_ausgabe-offen > 0.
 *       it_ausgabe-ampel = c_rot.
 *     ELSEIF it_ausgabe-eindt < sy-datum + 7.
 *       it_ausgabe-ampel = c_gelb.
 *     ELSE.
 *       it_ausgabe-ampel = c_gruen.
 *     ENDIF.
 *
 * and the product showed it as a gateway whose three arms run back without a
 * step, while the rules table listed the three constants as "declared, read by
 * nothing". Read as what it is, it is one classification: one field, one row
 * per arm, the condition on the left and the value on the right.
 *
 * **Only where the source says nothing else.** Every arm assigns the same field
 * and does nothing but assign it — no call, no other field, no nested block. An
 * arm that also writes a table or performs a routine is a decision with steps,
 * and stays a gateway with arms. Conditions and values are the source's text,
 * verbatim (rule 6 of the skeleton): nothing is named, translated or grouped.
 *
 * A chain of two arms is a plain `IF … ELSE`; a table starts at three rows for
 * `IF`, two `WHEN`s for `CASE` (the selector is the one column the arms share).
 *
 * Pure: the statements and the branch of 2.1 in, a table or `null` out.
 */
export interface DecisionTableRow {
  /** `if`, `elseif`, `else`, `when`, `when-others` — the arm, as 2.1 reads it. */
  armKind: string;
  /** The condition as the source writes it; `null` for `ELSE`/`WHEN OTHERS`. */
  condition: string | null;
  /** The right-hand side as the source writes it: `c_rot`, `'X'`, `sy-datum + 14`. */
  value: string;
  /** The assignment's own statement. */
  statementIndex: number;
  lineStart: number;
  lineEnd: number;
}

export interface DecisionTableReading {
  /** The assigned field as the source writes it in the first arm: `it_ausgabe-ampel`. */
  field: string;
  /** For a `CASE`, its selector; `null` for an `IF` chain. */
  selector: string | null;
  rows: DecisionTableRow[];
}

/** `target = value.` — a plain assignment, with no call on either side. */
const ASSIGNMENT = /^((?:<[\w/]+>|[\w/]+)(?:-[\w/]+)*)\s*=(?!=)\s*([\s\S]+?)\s*\.?$/;
const CALL_IN_VALUE = /->|=>|\(|\bNEW\b|\bCONV\b|\bCOND\b|\bSWITCH\b|\bVALUE\b\s*#/i;

export function readDecisionTable(branch: Branch, statements: readonly AbapStatement[]): DecisionTableReading | null {
  const minArms = branch.kind === 'case' ? 2 : 3;
  if (branch.arms.length < minArms) return null;
  let field: string | null = null;
  const rows: DecisionTableRow[] = [];
  for (let a = 0; a < branch.arms.length; a++) {
    const arm = branch.arms[a];
    const from = arm.headerIndex + 1;
    const to = (a + 1 < branch.arms.length ? branch.arms[a + 1].headerIndex : branch.closeIndex) - 1;
    if (to < from) return null;
    let value: { text: string; statement: AbapStatement } | null = null;
    for (let i = from; i <= to; i++) {
      const statement = statements[i];
      if (!statement) return null;
      const m = ASSIGNMENT.exec(statement.text.trim());
      if (!m || CALL_IN_VALUE.test(m[2])) return null;
      if (field === null) field = m[1];
      if (m[1].toUpperCase() !== field.toUpperCase()) return null;
      value = { text: m[2], statement };
    }
    if (!value) return null;
    rows.push({
      armKind: arm.kind,
      condition: arm.condition.trim() ? arm.condition : null,
      value: value.text,
      statementIndex: value.statement.index,
      lineStart: value.statement.lineStart,
      lineEnd: value.statement.lineEnd,
    });
  }
  return field ? { field, selector: branch.kind === 'case' ? branch.selector ?? null : null, rows } : null;
}
