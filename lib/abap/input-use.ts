import { maskLiterals, readStatements, type AbapStatement } from './statement-reader';

/**
 * User input that is read and then ignored, and dialog parameters of the wrong
 * type — roadmap 3.0.7, from the ZMM_BESTELLUEBERSICHT review.
 *
 * The review program asks for a new delivery date in `POPUP_GET_VALUES`, hands
 * the popup its batch-input table as `FIELDS` (a table of `BDCDATA` where the
 * module expects `SVAL`), never looks at the return code, clears the table
 * before anything reads it, and posts `sy-datum + 14` instead. Each of those
 * is a statement; together they say the person's input is asked for and then
 * thrown away. This reader names the three shapes, each with its line:
 *
 *   1. **`selection-never-read`** — a `PARAMETERS` or `SELECT-OPTIONS` that no
 *      statement reads. Setting a default (`s_x-low = …`, `APPEND s_x`) is not
 *      a read.
 *   2. **`dialog-output-ignored`** — what a dialog function module hands back
 *      (`IMPORTING`, `TABLES`, `CHANGING`) is never read after the call, or is
 *      overwritten (`CLEAR`, `REFRESH`, an assignment) before the first read.
 *      Read in source order after the call: the order the source writes it,
 *      not a proof of the order it runs in, and the sentence says "in the
 *      source" for that reason.
 *   3. **`dialog-parameter-type`** — the data object passed to a dialog module
 *      is declared with another row type than the module's interface names.
 *      Only for the modules listed in `DIALOG_INTERFACES`, only where the
 *      declaration is in the source; anything else is not judged.
 *
 * A finding here is a question to the people who use the program — "is the
 * date you type used?" — anchored at its line, never a claim about what they
 * see. Pure: no catalogue, no model.
 */

export type InputIssueKind = 'selection-never-read' | 'dialog-output-ignored' | 'dialog-parameter-type';

export interface InputIssue {
  kind: InputIssueKind;
  line: number;
  /** The data object as the source writes it: `p_test`, `g_answer`, `it_bdc`. */
  name: string;
  /** The dialog module, for the two dialog kinds. */
  module?: string;
  /** The module's parameter, for the two dialog kinds: `RETURNCODE`, `FIELDS`. */
  parameter?: string;
  /** The line that overwrote the value before it was read, when one did. */
  overwrittenAt?: number;
  detail: string;
}

/**
 * The dialog modules whose interface this reader knows, and the row type each
 * table parameter takes. Dialog modules are the ones `process-skeleton.ts`
 * draws as user tasks; the types are SAP's interface, written down here
 * because the source does not hold it.
 */
export const DIALOG_INTERFACES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  POPUP_GET_VALUES: { FIELDS: 'SVAL' },
  POPUP_GET_VALUES_USER_HELP: { FIELDS: 'SVAL' },
  POPUP_GET_VALUES_DB_CHECKED: { FIELDS: 'SVAL' },
  F4IF_INT_TABLE_VALUE_REQUEST: { RETURN_TAB: 'DDSHRETVAL' },
  POPUP_TO_DECIDE_LIST: { T_SPOPLI: 'SPOPLI' },
});

/** A function module a person answers: popups, value helps. */
const DIALOG_MODULE = /^(?:POPUP_|F4IF_|F4_|HELP_VALUES_GET)/;

/** Statements that only fill or reset a data object — not a read of it. */
function writesOnly(statement: AbapStatement, name: string): 'reset' | 'fill' | null {
  const text = maskLiterals(statement.text);
  const n = escape(name);
  if (new RegExp(`^(?:CLEAR|REFRESH|FREE)\\b[^.]*\\b${n}(?:\\[\\])?\\b`, 'i').test(text)) return 'reset';
  if (new RegExp(`^${n}(?:\\[\\])?\\s*=(?!=)`, 'i').test(text)) return 'reset';
  if (new RegExp(`^MOVE\\b[\\s\\S]*\\bTO\\s+${n}\\s*\\.?$`, 'i').test(text)) return 'reset';
  if (new RegExp(`^${n}-[\\w-]+\\s*=(?!=)`, 'i').test(text)) return 'fill';
  if (new RegExp(`^APPEND\\s+${n}\\s*\\.?$`, 'i').test(text)) return 'fill';
  if (new RegExp(`^APPEND\\b[\\s\\S]*\\bTO\\s+${n}\\b`, 'i').test(text)) return 'fill';
  return null;
}

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function mentions(statement: AbapStatement, name: string): boolean {
  return new RegExp(`(?<![\\w/-])${escape(name)}(?![\\w/])`, 'i').test(maskLiterals(statement.text));
}

export function readInputUse(source: string): InputIssue[] {
  return readInputUseFrom(readStatements(source));
}

export function readInputUseFrom(statements: AbapStatement[]): InputIssue[] {
  const issues: InputIssue[] = [];

  // Declarations: the selection inputs, and the row type of every table.
  const rowType = new Map<string, string>();
  const inputs: Array<{ name: string; index: number; line: number; keyword: string }> = [];
  for (const statement of statements) {
    const text = statement.text;
    const input = /^(PARAMETERS|SELECT-OPTIONS)\s*:?\s*([\w/]+)/i.exec(text);
    if (input) inputs.push({ name: input[2], index: statement.index, line: statement.lineStart, keyword: input[1].toUpperCase() });
    const declared = /^(?:DATA|STATICS|CLASS-DATA)\s*:?\s*([\w/]+)\s+(?:TYPE|LIKE)\s+(?:(?:STANDARD|SORTED|HASHED|ANY)\s+)?(?:TABLE\s+OF\s+|RANGE\s+OF\s+)?([\w/]+)(\s+OCCURS\b)?/i.exec(text);
    if (declared && (/\bTABLE\s+OF\b|\bOCCURS\b/i.test(text))) rowType.set(declared[1].toUpperCase(), declared[2].toUpperCase());
  }

  // 1. Selection inputs nobody reads.
  for (const input of inputs) {
    const read = statements.some((statement) =>
      statement.index !== input.index
      && !/^(?:SELECTION-SCREEN|PARAMETERS|SELECT-OPTIONS)\b/i.test(statement.text)
      && mentions(statement, input.name)
      && !writesOnly(statement, input.name));
    if (read) continue;
    issues.push({
      kind: 'selection-never-read',
      line: input.line,
      name: input.name,
      detail: `${input.keyword === 'PARAMETERS' ? 'The parameter' : 'The selection'} ${input.name} is on the selection screen, and no statement reads it: what the user enters there changes nothing.`,
    });
  }

  // 2 and 3. What a dialog module hands back, and what it is handed.
  for (const statement of statements) {
    const call = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(statement.text);
    if (!call) continue;
    const dialog = call[1].toUpperCase();
    if (!DIALOG_MODULE.test(dialog)) continue;
    const text = statement.text;
    const section = (word: string) => {
      const m = new RegExp(`\\b${word}\\b([\\s\\S]*?)(?=\\b(?:EXPORTING|IMPORTING|CHANGING|TABLES|EXCEPTIONS)\\b|\\.?$)`, 'i').exec(text);
      return m ? [...m[1].matchAll(/([\w/]+)\s*=\s*([\w/<>-]+(?:\[\])?)/g)].map((p) => ({ parameter: p[1].toUpperCase(), actual: p[2] })) : [];
    };
    const outputs = [...section('IMPORTING'), ...section('TABLES'), ...section('CHANGING')];
    const interfaceTypes = DIALOG_INTERFACES[dialog] ?? {};

    for (const { parameter, actual } of outputs) {
      const name = actual.replace(/\[\]$/, '');
      if (/^sy-/i.test(name)) continue;

      const expected = interfaceTypes[parameter];
      const declaredRow = rowType.get(name.toUpperCase());
      if (expected && declaredRow && declaredRow !== expected) {
        issues.push({
          kind: 'dialog-parameter-type',
          line: statement.lineStart,
          name,
          module: dialog,
          parameter,
          detail: `${dialog} takes a table of ${expected} in ${parameter}; ${name} is declared as a table of ${declaredRow}. The fields the dialog shows and the values it returns are not the ones the program means.`,
        });
      }

      let outcome: { kind: 'read' } | { kind: 'reset'; line: number } | null = null;
      for (let i = statement.index + 1; i < statements.length && !outcome; i++) {
        const next = statements[i];
        if (!mentions(next, name)) continue;
        const write = writesOnly(next, name);
        if (write === 'reset') outcome = { kind: 'reset', line: next.lineStart };
        else if (write === null) outcome = { kind: 'read' };
      }
      if (outcome?.kind === 'read') continue;
      issues.push({
        kind: 'dialog-output-ignored',
        line: statement.lineStart,
        name,
        module: dialog,
        parameter,
        ...(outcome ? { overwrittenAt: outcome.line } : {}),
        detail: outcome
          ? `${dialog} returns ${parameter} into ${name}, and the source overwrites ${name} at line ${outcome.line} before any statement reads it: the user's answer is not used.`
          : `${dialog} returns ${parameter} into ${name}, and no statement after the call reads ${name}: the user's answer is not used.`,
      });
    }
  }
  return issues.sort((a, b) => a.line - b.line);
}
