import { maskLiterals, type AbapStatement } from './statement-reader';

/**
 * FORMs a statement registers as a **callback** — routines that run although no
 * `PERFORM` of the source names them, because the statement hands their name
 * to a caller outside the source's own flow.
 *
 * One reading for two readers. The process skeleton turned these into entries
 * of their own (ADR-066), while the call graph only followed `PERFORM` and
 * reported the same routines as "not reached by any entry point". A report
 * whose ALV calls back `USER_COMMAND` then said, in one document, that the
 * user's commands start a flow (the map) and that no entry point reaches them
 * (the description, its open question about unused routines, every write and
 * transaction inside them dropped as dead code). Both now ask this module.
 *
 * Two kinds, both written down in the source as a literal:
 *
 *   - **ALV (type pool SLIS).** The `REUSE_ALV_*` function modules call back
 *     FORMs of the program named in `I_CALLBACK_PROGRAM`, named in a parameter
 *     `I_CALLBACK_<event>` (`I_CALLBACK_USER_COMMAND`, `I_CALLBACK_PF_STATUS_SET`,
 *     `I_CALLBACK_TOP_OF_PAGE`, …) or in the `FORM` column of the event table
 *     passed as `IT_EVENTS`. Without `I_CALLBACK_PROGRAM` the ALV calls back
 *     nothing; a literal naming another program looks the FORMs up there.
 *   - **Asynchronous RFC.** `CALL FUNCTION … STARTING NEW TASK … PERFORMING
 *     form ON END OF TASK`.
 *
 * Methods (`CALLING meth ON END OF TASK`) need the skeleton's method
 * resolution and stay there.
 */
export interface FormCallback {
  /** The FORM, upper-cased. */
  form: string;
  /** The FORM as the source writes it. */
  label: string;
  /** What calls it: `ALV I_CALLBACK_USER_COMMAND`, `ALV IT_EVENTS`, `ON END OF TASK`. */
  trigger: string;
}

/** The name in the first `REPORT`/`PROGRAM` statement, upper-cased. */
export function programNameOf(statements: readonly AbapStatement[]): string | null {
  for (const statement of statements) {
    if (statement.keyword !== 'REPORT' && statement.keyword !== 'PROGRAM') continue;
    const name = /^(?:REPORT|PROGRAM)\s+([\w/]+)/i.exec(statement.text)?.[1];
    if (name) return name.toUpperCase();
  }
  return null;
}

/**
 * ADR-066 — the data object a statement assigns as a whole or in a component,
 * upper-cased, or `null`: `x = …`, `x-comp = …`, `APPEND … TO x`, `INSERT …
 * INTO [TABLE] x`, `COLLECT … INTO x`, `MOVE … TO x`, `CLEAR x`.
 */
export function assignmentTarget(text: string): string | null {
  const direct = /^([\w/]+)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(text);
  if (direct) return direct[1].toUpperCase();
  const into = /^(?:APPEND|INSERT|COLLECT)\b[\s\S]*?\b(?:TO|INTO(?:\s+TABLE)?)\s+([\w/]+)/i.exec(text);
  if (into) return into[1].toUpperCase();
  const move = /^MOVE(?:-CORRESPONDING)?\b[\s\S]*\bTO\s+([\w/]+)/i.exec(text);
  if (move) return move[1].toUpperCase();
  const clear = /^(?:CLEAR|FREE|REFRESH)\s+([\w/]+)/i.exec(text);
  return clear ? clear[1].toUpperCase() : null;
}

/**
 * ADR-066 — the event table an ALV call passes as `IT_EVENTS` and the data
 * objects that carry its rows, upper-cased: the table itself, every work area
 * or field symbol that is appended to it, inserted into it, modified into it,
 * or read from it (`APPEND`/`INSERT … INTO`/`MODIFY … FROM`/`READ TABLE …
 * INTO|ASSIGNING`/`LOOP AT … INTO|ASSIGNING`), and every data object typed as
 * a row of the type pool SLIS event table (`slis_alv_event`, `LINE OF
 * slis_t_event`) or `LIKE LINE OF` the table.
 */
export function alvEventRows(statements: readonly AbapStatement[], table: string): Set<string> {
  const rows = new Set<string>([table]);
  // A work area or field symbol, declared inline or not (`INTO DATA(ls_event)`).
  const name = String.raw`(?:(?:DATA|FIELD-SYMBOL)\(\s*)?(<?[\w/]+>?)`;
  // Table names are `[\w/]` with an optional `<…>`: nothing to escape.
  const tab = String.raw`${table}(?![\w/>])`;
  const patterns = [
    new RegExp(String.raw`^(?:APPEND|INSERT)\s+INITIAL\s+LINE\s+(?:TO|INTO(?:\s+TABLE)?)\s+${tab}[\s\S]*?\bASSIGNING\s+${name}`, 'i'),
    new RegExp(String.raw`^(?:APPEND|INSERT)\s+${name}\s+(?:TO|INTO(?:\s+TABLE)?)\s+${tab}`, 'i'),
    new RegExp(String.raw`^MODIFY\s+(?:TABLE\s+)?${tab}[\s\S]*?\bFROM\s+${name}`, 'i'),
    new RegExp(String.raw`^(?:READ\s+TABLE|LOOP\s+AT)\s+${tab}[\s\S]*?\b(?:INTO|ASSIGNING)\s+${name}`, 'i'),
  ];
  const typed = new RegExp(
    String.raw`(<?[\w/]+>?)\s+(?:TYPE|LIKE)\s+(?:SLIS_ALV_EVENT\b|LINE\s+OF\s+(?:SLIS_T_EVENT\b|${tab}))`, 'gi');
  for (const statement of statements) {
    for (const pattern of patterns) {
      const m = pattern.exec(statement.text);
      if (m) rows.add(m[1].toUpperCase());
    }
    if (/^(?:DATA|STATICS|CLASS-DATA|FIELD-SYMBOLS)\b/i.test(statement.text)) {
      for (const m of statement.text.matchAll(typed)) rows.add(m[1].toUpperCase());
    }
  }
  return rows;
}

/**
 * Whether the value passed as `I_CALLBACK_PROGRAM` names this program: a
 * literal equal to its own name, `sy-repid`/`sy-cprog`, or a variable this
 * source fills from one of them (`gv_repid = sy-repid`, `DATA gv_repid ...
 * VALUE sy-repid`). Any other variable could hold another program's name, so
 * it registers nothing this source can follow (QA review of 1c402c400e05).
 */
export function namesThisProgram(
  value: string,
  statements: readonly AbapStatement[],
  programName: string | null,
): boolean {
  if (value.startsWith("'")) return !!programName && value.slice(1, -1).toUpperCase() === programName;
  const v = value.toUpperCase();
  if (v === 'SY-REPID' || v === 'SY-CPROG') return true;
  const name = v.replace(/[^\w/]/g, '');
  if (!name || name !== v) return false;
  const self = String.raw`SY-(?:REPID|CPROG)\b`;
  const assigned = new RegExp(String.raw`^${name}\s*=\s*${self}`, 'i');
  const declared = new RegExp(String.raw`\b${name}\b[^,.]*\bVALUE\s+${self}`, 'i');
  return statements.some(
    (s) => assigned.test(s.text.trim()) || (/^(?:DATA|STATICS|CONSTANTS)\b/i.test(s.text.trim()) && declared.test(s.text)),
  );
}

/**
 * The FORMs an ALV call registers (see the module comment), in the order the
 * call names them. `programName` is the source's own `REPORT`/`PROGRAM`; a
 * literal `I_CALLBACK_PROGRAM` naming any other program registers nothing here.
 * `isForm` says whether a name is a FORM of this source — a name that is not
 * is no registration this source can follow.
 */
export function alvCallbackForms(
  statements: readonly AbapStatement[],
  statement: AbapStatement,
  programName: string | null,
  isForm: (form: string) => boolean,
): FormCallback[] {
  const text = statement.text;
  if (!/^CALL\s+FUNCTION\s+'REUSE_ALV_[\w]*'/i.test(text)) return [];
  const program = /\bI_CALLBACK_PROGRAM\s*=\s*('[^']*'|[\w/-]+)/i.exec(text);
  if (!program) return [];
  if (!namesThisProgram(program[1], statements, programName)) return [];
  const out: FormCallback[] = [];
  for (const m of text.matchAll(/\b(I_CALLBACK_(?!PROGRAM\b)[\w]+)\s*=\s*'([\w/]+)'/gi)) {
    const form = m[2].toUpperCase();
    if (isForm(form)) out.push({ form, label: m[2], trigger: `ALV ${m[1].toUpperCase()}` });
  }
  const events = /\bIT_EVENTS\s*=\s*(<?[\w/]+>?)/i.exec(text);
  if (!events) return out;
  // The event table is filled elsewhere in the source: `ls_event-form =
  // 'TOP_OF_PAGE'.` or `VALUE #( ( name = … form = 'TOP_OF_PAGE' ) )`. A
  // literal in a `FORM` component that names a FORM of this source is that
  // registration — but only in a statement that fills **this** table: one
  // that assigns the table itself, or a row of it (QA review of 23416af0,
  // bc85f1d42173: a `FORM = '…'` of any other structure registers nothing).
  const rows = alvEventRows(statements, events[1].toUpperCase());
  for (const other of statements) {
    const target = /^(<?[\w/]+>?)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(other.text)?.[1]?.toUpperCase()
      ?? assignmentTarget(other.text) ?? /^MODIFY\s+(?:TABLE\s+)?([\w/]+)/i.exec(other.text)?.[1]?.toUpperCase();
    if (!target || !rows.has(target)) continue;
    for (const m of other.text.matchAll(/(?:-|\s|\()FORM\s*=\s*'([\w/]+)'/gi)) {
      const form = m[1].toUpperCase();
      if (isForm(form)) out.push({ form, label: m[1], trigger: 'ALV IT_EVENTS' });
    }
  }
  return out;
}

/** `… STARTING NEW TASK … PERFORMING form ON END OF TASK` — the FORM, or `null`. */
export function taskCallbackForm(statement: AbapStatement, isForm: (form: string) => boolean): FormCallback | null {
  if (!/\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text)) return null;
  const form = /\bPERFORMING\s+([\w/]+)\s+ON\s+END\s+OF\s+TASK\b/i.exec(maskLiterals(statement.text));
  if (!form) return null;
  const key = form[1].toUpperCase();
  return isForm(key) ? { form: key, label: form[1], trigger: 'ON END OF TASK' } : null;
}

/** Every FORM the statement registers as a callback: ALV first, then the task. */
export function formCallbacksOf(
  statements: readonly AbapStatement[],
  statement: AbapStatement,
  programName: string | null,
  isForm: (form: string) => boolean,
): FormCallback[] {
  const out = alvCallbackForms(statements, statement, programName, isForm);
  const task = taskCallbackForm(statement, isForm);
  if (task) out.push(task);
  return out;
}
