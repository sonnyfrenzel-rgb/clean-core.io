import { createLiteralScanner, maskLiterals, readStatements, type AbapStatement } from './statement-reader';
import { readCallGraphFrom } from './call-graph';
import { readBlocks } from './block-structure';

/**
 * Security review tasks — roadmap 3.0.12, from the review of the DSAG ABAP
 * guideline (owner decision 13.10.2026).
 *
 * `authority-assessment.ts` asks whether an authorization check that is there
 * holds what a reader assumes it holds. This module asks the neighbouring
 * questions a security review of classic ABAP starts from: statements that
 * switch a protection off, hand it to someone else, or build what the database
 * or the file system executes out of what a user typed.
 *
 * **A task, not a verdict.** Every entry names the statement, its line and the
 * one thing a person has to check there. None of them says the program is
 * insecure: a `DUMMY` field is a sound pre-check when a full check follows, a
 * dynamic `WHERE` built from a whitelist is safe, a cross-client read can be
 * the job of the program. The engine cannot decide that; it can say where to
 * look.
 *
 * **What is not read.** Comments and the contents of literals never produce a
 * task: each statement is read with its literal contents blanked
 * (`maskLiterals`), and comments are gone before a statement exists
 * (`readStatements`). Pseudo-comments (`"#EC …`) are comments. Where input
 * flows into a dynamic clause or a path, the flow is followed through plain
 * assignments, `CONCATENATE`, `APPEND`/`INSERT … INTO TABLE` and string
 * templates inside one source; a value that reaches the clause through a
 * routine call, a database read or a field symbol is not followed, so those
 * clauses stay without a task rather than with a guessed one.
 *
 * Pure: source in, tasks out; no catalogue, no model.
 */

export type SecurityReviewKind =
  | 'authority-result-not-evaluated'
  | 'authority-dummy-field'
  | 'authority-blank-value'
  | 'authority-full-value'
  | 'submit-as-other-user'
  | 'dynamic-sql-from-input'
  | 'cross-client-access'
  | 'native-sql-client-handling'
  | 'file-path-from-input'
  | 'generated-program'
  | 'editor-call-for-report'
  | 'communication-statement'
  | 'call-transaction-without-authority-addition';

export interface SecurityReviewTask {
  kind: SecurityReviewKind;
  lineStart: number;
  lineEnd: number;
  /** A short name for the task, never a verdict. */
  title: string;
  /** What the statement does, read off the source. */
  detail: string;
  /** What a person has to check at this line. */
  check: string;
  severity: 'High' | 'Medium' | 'Low';
  /** The authorization object, transaction or data object the task is about, where the source names one. */
  subject?: string;
  /** The statement, whitespace collapsed. */
  text: string;
}

export interface SecurityReviewOptions {
  /**
   * Lines of ADBC calls (`CL_SQL_STATEMENT`) the caller has already identified
   * (`table-dependencies.ts`): native SQL without the keyword, with the same
   * missing client handling as `EXEC SQL`.
   */
  adbcLines?: readonly number[];
  /**
   * From engine 3.0.13 (`PRECISION_FIXES_FROM`, set by `buildAbapEvidence`):
   *
   *   - a file-name validation covers a path only when its failure is
   *     decided on — no EXCEPTIONS (a failure ends the program), or a decision
   *     on sy-subrc in the next statement; see `validationDecided` below;
   *   - the result of an AUTHORITY-CHECK or of a file-name validation counts as
   *     evaluated only when the next statement decides on sy-subrc
   *     (`decidesOnSubrc`), not when it merely mentions it;
   *   - the flow from input is followed to a fixed point, however long the
   *     chain and in whatever order the source writes it (`taintedNames`).
   *
   * Off, the reading is the one runs of engine 3.0.12 signed: any earlier validation
   * counts, any mention of sy-subrc counts, and the flow is followed for eight
   * passes in source order.
   */
  precisionFixes?: boolean;
  /**
   * From engine 3.0.18 (`ENGINE_READS_FROM`, set by `buildAbapEvidence`;
   * only together with `precisionFixes`):
   *
   *   - a file-name validation with EXCEPTIONS covers a path only when its
   *     failure cannot reach the access — `CHECK sy-subrc = 0`, an `IF` on the
   *     failure that stops (`RETURN`, `EXIT`, `LEAVE`, `STOP`, `RAISE`, an error
   *     message), or the access inside the arm of success; a decision that only
   *     logs or warns covers nothing (`validationCovers`);
   *   - `INSERT REPORT` with a literal program name is a generated program;
   *   - a clean write to the very component a dynamic clause or a path reads
   *     (`ls_filter-where = 'X'.`) clears that component.
   */
  engineReads?: boolean;
}

/**
 * True when a statement decides on sy-subrc: a condition that branches on it
 * (`IF`, `ELSEIF`, `CHECK`, `CASE`, `ASSERT`), or a conditional expression that
 * reads it and raises (`COND`/`SWITCH … THROW`), or an assignment whose value
 * is decided on it: a `COND`/`SWITCH` or a boolean function (`xsdbool`,
 * `boolc`, `boolx`) that compares sy-subrc, assigned to a variable, a
 * parameter or a RAP result field — `rv_ok = xsdbool( sy-subrc = 0 ).`,
 * `lv_auth = COND #( WHEN sy-subrc = 0 THEN … ).`, the standard pattern of a
 * RAP authorization method. A statement that only mentions sy-subrc —
 * `WRITE sy-subrc.`, `lv_rc = sy-subrc.`, a `MESSAGE`, a string template —
 * decides nothing: a plain copy is a value kept for a later statement, and
 * anything in between can overwrite what is read there.
 */
export function decidesOnSubrc(statement: AbapStatement | undefined): boolean {
  if (statement === undefined) return false;
  const code = maskLiterals(statement.text).trim();
  if (!/\bSY-SUBRC\b/i.test(code)) return false;
  if (/^(?:IF|ELSEIF|CHECK|CASE|ASSERT)\b/i.test(code)) return true;
  if (/\b(?:COND|SWITCH)\b[\s\S]*\bTHROW\b/i.test(code)) return true;
  return assignsDecisionOnSubrc(code);
}

const COMPARISON = String.raw`(?:<>|<=|>=|=|<|>|\b(?:EQ|NE|LT|GT|LE|GE)\b)`;
/** sy-subrc as an operand of a comparison: `sy-subrc = 0`, `0 <> sy-subrc`, `sy-subrc IS INITIAL`. */
const SUBRC_COMPARED = new RegExp(
  String.raw`\bSY-SUBRC\s*(?:${COMPARISON}|\bIS\s+(?:NOT\s+)?INITIAL\b)|${COMPARISON}\s*SY-SUBRC\b`,
  'i',
);

/**
 * `target = <expression>` where the expression is a `COND`/`SWITCH` or a
 * boolean function deciding on sy-subrc. Only the part from the first such
 * expression on is searched for the comparison, so the assignment's own `=`
 * never counts: `lv_rc = sy-subrc.` is a copy, not a decision.
 */
function assignsDecisionOnSubrc(code: string): boolean {
  const assignment = /^(?:DATA\(\s*[\w/]+\s*\)|[\w/<>~%-]+(?:->[\w~%-]+)?)\s*=\s*([\s\S]+)$/i.exec(code);
  if (!assignment) return false;
  const value = assignment[1];
  const start = value.search(/\b(?:COND|SWITCH|XSDBOOL|BOOLC|BOOLX)\b/i);
  if (start < 0) return false;
  const decision = value.slice(start);
  // `SWITCH #( sy-subrc WHEN 0 THEN … )`: sy-subrc is the operand every WHEN compares.
  if (/^SWITCH\s+[\w#/~]*\s*\(\s*SY-SUBRC\b/i.test(decision)) return true;
  return SUBRC_COMPARED.test(decision);
}

/**
 * True when the statements from `index` on decide on sy-subrc: the statement
 * at `index` decides on it (`decidesOnSubrc`), or it only copies sy-subrc into
 * a variable (`lv_rc = sy-subrc.`, `DATA(lv_rc) = sy-subrc.`, `MOVE sy-subrc TO
 * lv_rc.`) and the very next statement decides on that copy (`IF lv_rc <> 0.`).
 * A copy is a decision only when it controls what follows; a copy nobody
 * decides on right away decides nothing (QA leftovers of hotfix 2, roadmap
 * 3.0.13).
 */
export function decidesOnSubrcAt(statements: readonly AbapStatement[], index: number): boolean {
  const first = statements[index];
  if (decidesOnSubrc(first)) return true;
  if (first === undefined) return false;
  const code = maskLiterals(first.text).trim().replace(/\.$/, '').trim();
  const copy = /^(?:DATA\(\s*([\w/]+)\s*\)|([\w/]+))\s*=\s*SY-SUBRC$/i.exec(code)
    ?? /^MOVE\s+SY-SUBRC\s+TO\s+()([\w/]+)$/i.exec(code);
  if (!copy) return false;
  const name = (copy[1] || copy[2]).toUpperCase();
  const then = statements[index + 1];
  if (then === undefined) return false;
  // The name as a whole operand: not `lv_rc2`, not a component `ls_x-lv_rc`.
  const named = (flags: string) => new RegExp(String.raw`(^|[^\w/-])${name}(?![\w/])`, flags);
  if (!named('i').test(maskLiterals(then.text))) return false;
  return decidesOnSubrc({ ...then, text: then.text.replace(named('gi'), '$1sy-subrc') });
}

/** What engine 3.0.12 counted as reading sy-subrc: any mention of it. */
function mentionsSubrc(statement: AbapStatement | undefined): boolean {
  return statement !== undefined && /\bSY-SUBRC\b/i.test(maskLiterals(statement.text));
}

const SUBRC_SUCCESS = /^(?:SY-SUBRC\s*(?:=|\bEQ\b)\s*0|0\s*(?:=|\bEQ\b)\s*SY-SUBRC|SY-SUBRC\s+IS\s+INITIAL)$/i;
const SUBRC_FAILURE = /^(?:SY-SUBRC\s*(?:<>|\bNE\b|>|\bGT\b)\s*0|0\s*(?:<>|\bNE\b|<|\bLT\b)\s*SY-SUBRC|SY-SUBRC\s+IS\s+NOT\s+INITIAL)$/i;

/** A statement that ends the routine or the program: no statement after it in its arm runs. */
function stopsFlow(statement: AbapStatement): boolean {
  const code = maskLiterals(statement.text).trim();
  if (/^(?:RETURN|STOP|LEAVE\s+(?:PROGRAM|TO\s+TRANSACTION|TO\s+LIST-PROCESSING))\b/i.test(code)) return true;
  if (/^RAISE\b/i.test(code) && !/^RAISE\s+EVENT\b/i.test(code)) return true;
  if (/^MESSAGE\b/i.test(code) && !/\bINTO\b/i.test(code)) return /\bTYPE\s+'[EAX]'/i.test(statement.text) || /^MESSAGE\s+[EAX]\d/i.test(code);
  return false;
}

/**
 * From 3.0.18: true when the failure of the call at `call` (a module called
 * with EXCEPTIONS, whose failure only sets sy-subrc) cannot reach the
 * statement at `access`. Read from the decision right after the call (or
 * right after a copy of sy-subrc): `CHECK`/`ASSERT` on success, a `COND`/
 * `SWITCH … THROW`, an `IF` on failure whose own arm stops with the access
 * after `ENDIF`, an `IF` on success whose `ELSE` stops, or the access inside the
 * arm (`IF` or `WHEN 0`) that only success enters. `EXIT` and `CONTINUE` are not
 * read as stops: what they leave depends on a loop around the check. Anything
 * else — a decision that logs, warns or sets a flag — does not cover it.
 */
function failureCannotReach(statements: readonly AbapStatement[], call: number, access: number): boolean {
  let at = call + 1;
  let first = statements[at];
  if (!first) return false;
  let rename: ((text: string) => string) = (t) => t;
  const copyCode = maskLiterals(first.text).trim().replace(/\.$/, '').trim();
  const copy = /^(?:DATA\(\s*([\w/]+)\s*\)|([\w/]+))\s*=\s*SY-SUBRC$/i.exec(copyCode) ?? /^MOVE\s+SY-SUBRC\s+TO\s+()([\w/]+)$/i.exec(copyCode);
  if (copy) {
    const name = (copy[1] || copy[2]).toUpperCase();
    const named = new RegExp(String.raw`(^|[^\w/-])${name}(?![\w/])`, 'gi');
    rename = (t) => t.replace(named, '$1sy-subrc');
    at += 1;
    first = statements[at];
    if (!first) return false;
  }
  const code = rename(maskLiterals(first.text)).trim().replace(/\.$/, '').trim().replace(/\s+/g, ' ');
  if (!decidesOnSubrc({ ...first, text: code })) return false;
  const condition = (keyword: string) => code.replace(new RegExp(String.raw`^${keyword}\s+`, 'i'), '').trim();
  if (/^(?:CHECK|ASSERT)\b/i.test(code)) return access > at && SUBRC_SUCCESS.test(condition(code.split(' ')[0]));
  if (/\b(?:COND|SWITCH)\b[\s\S]*\bTHROW\b/i.test(code)) return access > at;
  if (!/^(?:IF|CASE)\b/i.test(code)) return false;

  // The arms of the block opened at `at`, and its end, at its own depth.
  const arms: Array<{ header: number; condition: string | null }> = [{ header: at, condition: /^IF\b/i.test(code) ? condition('IF') : null }];
  let close = -1;
  let depth = 0;
  for (let i = at + 1; i < statements.length; i++) {
    const c = maskLiterals(statements[i].text).trim();
    if (CLOSES.test(c)) {
      if (depth === 0) { close = i; break; }
      depth -= 1;
      continue;
    }
    if (depth === 0 && BRANCHES.test(c)) {
      const text = rename(c).replace(/\.$/, '').trim().replace(/\s+/g, ' ');
      arms.push({ header: i, condition: /^ELSE\b/i.test(text) && !/^ELSEIF\b/i.test(text) ? null : text.replace(/^(?:ELSEIF|WHEN)\s+/i, '') });
      continue;
    }
    if (OPENS.test(c) && !/^AT\s+(?:SELECTION-SCREEN|LINE-SELECTION|USER-COMMAND|PF\d+)\b/i.test(c)) depth += 1;
  }
  if (close < 0) return false;
  const armOf = (index: number): number => {
    if (index <= at || index >= close) return -1;
    let arm = -1;
    for (let k = 0; k < arms.length; k++) if (arms[k].header < index) arm = k;
    return arm;
  };
  /** The arm's own statements (not nested ones) include a stop. */
  const armStops = (k: number): boolean => {
    const end = k + 1 < arms.length ? arms[k + 1].header : close;
    let d = 0;
    for (let i = arms[k].header + 1; i < end; i++) {
      const c = maskLiterals(statements[i].text).trim();
      if (CLOSES.test(c)) { d -= 1; continue; }
      if (OPENS.test(c)) { d += 1; continue; }
      if (d === 0 && stopsFlow(statements[i])) return true;
    }
    return false;
  };
  const accessArm = armOf(access);
  if (/^CASE\b/i.test(code)) {
    // `CASE sy-subrc. WHEN 0.` — only success enters that arm.
    return /^CASE\s+SY-SUBRC$/i.test(code) && accessArm >= 1 && arms[accessArm].condition === '0';
  }
  const head = arms[0].condition ?? '';
  if (SUBRC_SUCCESS.test(head)) {
    if (accessArm === 0) return true;
    // After ENDIF: every other arm has to stop, and an ELSE has to be there.
    return access > close && arms.length > 1 && arms[arms.length - 1].condition === null
      && arms.slice(1).every((_, k) => armStops(k + 1));
  }
  if (SUBRC_FAILURE.test(head)) {
    if (accessArm >= 1 && arms[accessArm].condition === null && arms.length === 2) return true;
    return access > close && armStops(0);
  }
  return false;
}

export function readSecurityReviewTasks(source: string, options: SecurityReviewOptions = {}): SecurityReviewTask[] {
  return readSecurityReviewTasksFrom(source, readStatements(source), options);
}

/** A name in code, as ABAP writes it: `lv_x`, `ls_x-field`, `/ns/x`, `<fs>`, `me->x`. */
const OPERAND = String.raw`[\w/<>~-]+(?:->[\w~-]+)?`;

const SQL_KEYWORDS = new Set(['SELECT', 'UPDATE', 'DELETE', 'MODIFY', 'INSERT', 'OPEN', 'WITH', 'FETCH']);

export function readSecurityReviewTasksFrom(
  source: string,
  statements: AbapStatement[],
  options: SecurityReviewOptions = {},
): SecurityReviewTask[] {
  const tasks: SecurityReviewTask[] = [];
  const at = (statement: AbapStatement) => ({ lineStart: statement.lineStart, lineEnd: statement.lineEnd, text: statement.text });

  /* ---------------------------------------------- authorization checks */
  // DSAG ABAP guideline: security/security-secure-development.md § Berechtigungsprüfungen richtig implementieren
  const graph = readCallGraphFrom(statements, readBlocks(statements));
  const subrcRead = (index: number) => (options.precisionFixes ? decidesOnSubrcAt(statements, index) : mentionsSubrc(statements[index]));
  const indexAt = new Map<number, number>();
  statements.forEach((s, i) => {
    if (s.keyword === 'AUTHORITY-CHECK' && !indexAt.has(s.lineStart)) indexAt.set(s.lineStart, i);
  });
  for (const check of graph.authorityChecks) {
    const index = indexAt.get(check.lineStart);
    if (index === undefined) continue;
    const statement = statements[index];
    const object = check.object ?? (check.objectExpression || undefined);
    const named = object ? `on ${object} ` : '';

    // The return code has to be read by the statement right after the check:
    // anything in between can overwrite sy-subrc, and a check nobody reads
    // decides nothing. From 3.0.13 that statement has to decide on it
    // (`decidesOnSubrc`); a mention alone is not a decision.
    const next = statements[index + 1];
    const evaluated = subrcRead(index + 1);
    if (!evaluated) {
      tasks.push({
        kind: 'authority-result-not-evaluated',
        ...at(statement),
        title: `Authorization check ${named}whose result is not read`,
        detail: next
          ? `The statement after the AUTHORITY-CHECK (line ${next.lineStart}) does not read sy-subrc, so the outcome of the check decides nothing at this point.`
          : 'The AUTHORITY-CHECK is the last statement of the source; nothing reads sy-subrc after it.',
        check: 'Check whether the result is evaluated at all. If it is meant to stop the program, read sy-subrc in the statement right after the check and stop or raise an exception when it is not 0.',
        severity: 'Medium',
        subject: object,
      });
    }

    for (const field of check.fields) {
      if (field.dummy) {
        tasks.push({
          kind: 'authority-dummy-field',
          ...at(statement),
          title: `Authorization check ${named}skips field ${field.id} (DUMMY)`,
          detail: `ID '${field.id}' DUMMY leaves the field ${field.id} unchecked: the check passes for any value of it.`,
          // The guideline names DUMMY fields as a problem and, two paragraphs
          // later, recommends a DUMMY pre-check at INITIALIZATION. Both are
          // true for different uses, so the task asks which use this is.
          check: `Check whether a full check with the actual value of ${field.id} follows before data is read or changed. A DUMMY check is a sound early pre-check; it is not a check of the value.`,
          severity: 'Low',
          subject: object,
        });
        continue;
      }
      const value = field.value;
      if (value === undefined) continue;
      if (value.trim() === '' || /^SPACE$/i.test(value.trim())) {
        tasks.push({
          kind: 'authority-blank-value',
          ...at(statement),
          title: `Authorization check ${named}tests field ${field.id} against a blank value`,
          detail: `FIELD ' ' asks whether the user is authorized for a blank ${field.id}, which only a blank or a full authorization ('*') satisfies — it is not the same as leaving the field out.`,
          check: `Check which value of ${field.id} was meant. If the field is not to be checked, write DUMMY; otherwise pass the value the program works with.`,
          severity: 'Medium',
          subject: object,
        });
      } else if (value.trim() === '*') {
        tasks.push({
          kind: 'authority-full-value',
          ...at(statement),
          title: `Authorization check ${named}tests field ${field.id} for full authorization ('*')`,
          detail: `FIELD '*' passes only for users who hold every value of ${field.id}; it tests for a superuser, not for the value the program works with.`,
          check: `Check whether a specific value of ${field.id} was meant. A test for full authorization locks out every user with a precise role and passes every user with a broad one.`,
          severity: 'Medium',
          subject: object,
        });
      }
    }
  }

  /* ------------------------------------------- input and what it reaches */
  const tainted = taintedNames(source, statements, graph.forms.flatMap((f) => f.parameters.map((p) => p.name)), options.precisionFixes === true);
  // From 3.0.13 a tainted name the source overwrites unconditionally with a
  // value from no input, before the clause, no longer reaches it
  // (`overwrittenCleanBefore`; QA leftovers of hotfix 2, roadmap 3.0.13).
  const paths = options.precisionFixes ? controlPaths(statements) : [];
  const fromInput = (operand: string, access: number): boolean => {
    const base = baseName(operand);
    if (base === '' || !tainted.has(base)) return false;
    return !(options.precisionFixes && overwrittenCleanBefore(statements, paths, base, access, tainted, options.engineReads ? operand : null));
  };

  // A path resolved or validated through the logical file name modules before
  // it is opened has had what the task would ask for. The call counts for the
  // names it passes as actual parameters and for the accesses after it — a
  // call that validates another path, or this one only after the file was
  // opened, does not (QA 03501b79). Nor does it when the source writes the
  // name again between the call and the access: what is opened then is not
  // what was validated (QA c38f8043). Order is the order of the source, not of
  // execution.
  //
  // From 3.0.13 the failure of the call has to be decided on (QA review of
  // 5a559787, 7e158fe18264). Without EXCEPTIONS a failing module raises an
  // exception nobody handles, and the program ends there. With EXCEPTIONS the
  // failure only sets sy-subrc, and the statement right after the call has to
  // decide on it — the rule of `authority-result-not-evaluated` above, through
  // the same `decidesOnSubrc`. What that decision does (stop, skip, warn) is
  // not checked, exactly as for AUTHORITY-CHECK (owner decision 15.10.2026,
  // QA review of 5665fc944c10). A call whose sy-subrc nobody decides on
  // validated nothing.
  const isFileNameCheck = (s: AbapStatement) => /^CALL\s+FUNCTION\s+'(?:FILE_VALIDATE_NAME|FILE_GET_NAME(?:_USING_PATH)?)'/i.test(s.text);
  const validationDecided = (index: number): boolean => {
    if (!options.precisionFixes) return true;
    if (!/\bEXCEPTIONS\b/i.test(maskLiterals(statements[index].text))) return true;
    return decidesOnSubrcAt(statements, index + 1);
  };
  //
  // From 3.0.18 (`engineReads`) a decision is not enough: with EXCEPTIONS the
  // call covers an access only when its failure cannot reach it
  // (`failureCannotReach`) — a decision that logs or warns and goes on leaves
  // the path as unvalidated as no call (QA delta of 73b8cad63d3e).
  const fileNameChecks = statements.flatMap((s, index) => isFileNameCheck(s) && validationDecided(index)
    ? [{ index, names: new Set([...maskLiterals(s.text).matchAll(new RegExp(String.raw`=\s*(${OPERAND})`, 'g'))].map((m) => baseName(m[1]))) }]
    : []);
  const handled = (index: number) => options.precisionFixes === true && options.engineReads === true
    && /\bEXCEPTIONS\b/i.test(maskLiterals(statements[index].text));
  const writtenAt = statements.map((s) => (isFileNameCheck(s) ? new Set<string>() : writtenNames(s.text)));
  const validatedBefore = (operand: string, access: number): boolean => {
    const name = baseName(operand);
    return fileNameChecks.some((c) => c.index < access && c.names.has(name)
      && !writtenAt.slice(c.index + 1, access).some((w) => w.has(name))
      && (!handled(c.index) || failureCannotReach(statements, c.index, access)));
  };

  const adbcLines = new Set(options.adbcLines ?? []);
  const adbcSeen = new Set<number>();

  for (const [position, statement] of statements.entries()) {
    if (statement.nativeSql && !/^EXEC\s+SQL\b/i.test(statement.text)) continue;
    const code = maskLiterals(statement.text);
    const keyword = statement.keyword;

    // SUBMIT … USER — DSAG ABAP guideline: security/security-secure-development.md § Berechtigungsprüfungen richtig implementieren
    if (keyword === 'SUBMIT' && /\bUSER\b/i.test(code)) {
      const user = new RegExp(String.raw`\bUSER\s+(${OPERAND}|'[^']*')`, 'i').exec(statement.text)?.[1];
      tasks.push({
        kind: 'submit-as-other-user',
        ...at(statement),
        title: 'Program scheduled under another user (SUBMIT … USER)',
        detail: `The USER addition runs the submitted program as a background job under ${user ? `the user ${user}` : 'another user'}, with that user's authorizations instead of the caller's.`,
        check: 'Check who can decide which user is named here and whether the caller is authorized to run the job under that user (authorization object S_BTCH_NAM). A user taken from input lets the caller borrow someone else\'s authorizations.',
        severity: 'Medium',
        subject: user,
      });
    }

    if (SQL_KEYWORDS.has(keyword)) {
      // Dynamic clauses — DSAG ABAP guideline: security/security-secure-development.md § Sichere Datenbankzugriffe: OpenSQL Best Practices
      const dynamic: string[] = [];
      const clause = new RegExp(String.raw`\b(WHERE|FROM|SET|FIELDS|BY|HAVING|UPDATE|MODIFY|DELETE|INSERT|JOIN|SINGLE|SELECT|DISTINCT)\s*\(\s*(${OPERAND})\s*\)`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = clause.exec(code))) {
        if (fromInput(m[2], position) && !dynamic.includes(m[2])) dynamic.push(m[2]);
      }
      if (dynamic.length) {
        tasks.push({
          kind: 'dynamic-sql-from-input',
          ...at(statement),
          title: `Dynamic SQL clause built from input (${dynamic.join(', ')})`,
          detail: `The statement takes part of its SQL from ${dynamic.join(', ')}, and the source fills ${dynamic.length > 1 ? 'them' : 'it'} from a selection parameter or a routine parameter.`,
          check: 'Check that only fixed table and field names reach the clause — a whitelist of allowed names, values passed as host variables (@value) rather than as text, and CL_ABAP_DYN_PRG where text is unavoidable. A clause typed by the user can read or change rows the program was never meant to touch.',
          severity: 'Medium',
          subject: dynamic.join(', '),
        });
      }

      // DSAG ABAP guideline: security/security-secure-development.md § Mandantensicherheit: Datentrennungen garantieren
      // The syntax permits another client; only USING ALL CLIENTS states one.
      // Which client a CLIENT SPECIFIED or USING CLIENT statement reaches is
      // the review question, not a reading (QA 03501b79: `USING CLIENT
      // @sy-mandt` is the logged-on client).
      if (/\bCLIENT\s+SPECIFIED\b|\bUSING\s+(?:ALL\s+CLIENTS\b|CLIENTS\s+IN\b|CLIENT\b)/i.test(code)) {
        const all = /\bUSING\s+ALL\s+CLIENTS\b/i.test(code);
        tasks.push({
          kind: 'cross-client-access',
          ...at(statement),
          title: all ? 'Database access to all clients (USING ALL CLIENTS)' : 'Database access with explicit client handling',
          detail: all
            ? 'USING ALL CLIENTS switches off the automatic client handling of ABAP SQL: the statement reads or changes the data of all clients.'
            : 'CLIENT SPECIFIED or USING CLIENT switches off the automatic client handling of ABAP SQL: the statement itself says which client it reads or changes, and that can be a client other than the logged-on one.',
          check: 'Check which client the statement reaches. If it can be another client than the logged-on one, check that this is a requirement of the program and that it is guarded: who may choose the client, and an authorization check for the cross-client access.',
          severity: 'Medium',
        });
      }
    }

    // Native SQL — DSAG ABAP guideline: security/security-secure-development.md § Sichere Datenbankzugriffe: OpenSQL Best Practices
    const adbc = adbcLines.has(statement.lineStart) && !adbcSeen.has(statement.lineStart);
    if (/^EXEC\s+SQL\b/i.test(code) || adbc) {
      if (adbc) adbcSeen.add(statement.lineStart);
      tasks.push({
        kind: 'native-sql-client-handling',
        ...at(statement),
        title: adbc ? 'Native SQL through ADBC: no automatic client handling' : 'Native SQL (EXEC SQL): no automatic client handling',
        detail: 'Native SQL goes to the database as written. ABAP SQL restricts every access to the logged-on client; native SQL does not, and the database tables carry the data of every client.',
        check: 'Check that every native statement restricts itself to the current client (the client column, usually MANDT, compared with sy-mandt) and that no part of it is built from input.',
        severity: 'Medium',
      });
    }

    // OPEN / DELETE DATASET — DSAG ABAP guideline: security/security-secure-development.md § Sichere Dateizugriffe und Pfadtraversal-Schutz
    const dataset = new RegExp(String.raw`^(OPEN|DELETE)\s+DATASET\s+(${OPERAND})`, 'i').exec(code);
    if (dataset && fromInput(dataset[2], position) && !validatedBefore(dataset[2], position)) {
      tasks.push({
        kind: 'file-path-from-input',
        ...at(statement),
        title: `Server file path built from input (${dataset[2]})`,
        detail: `${dataset[1].toUpperCase()} DATASET opens a file on the application server whose name the source fills from a selection parameter or a routine parameter. The kernel checks S_DATASET for the resulting path; it does not check that the path stays in the directory the program means.`,
        check: 'Check that the name is validated before the file is opened — a logical file name (transaction FILE) resolved and validated with FILE_GET_NAME and FILE_VALIDATE_NAME, or at least a fixed directory and no "..", "/" or "\\" taken from the input.',
        severity: 'Medium',
        subject: dataset[2],
      });
    }

    // DSAG ABAP guideline: security/security-examples.md § ABAP Command Injection (Report)
    // The guideline says GENERATE REPORT executes the program; it generates it
    // (compiles the load). SUBMIT or PERFORM runs it. The task says what the statement does.
    // The program name may be a literal (`INSERT REPORT 'ZGEN' FROM lt_src`):
    // masked, it is quotes around blanks, which `\S+` alone does not span
    // (from 3.0.18, `engineReads`).
    const insertReport = options.engineReads
      ? /^INSERT\s+REPORT\s+(?:'[^']*'|`[^`]*`|\S+)\s+FROM\b/i
      : /^INSERT\s+REPORT\s+\S+\s+FROM\b/i;
    const generated = insertReport.test(code)
      ? 'INSERT REPORT writes ABAP source into the repository'
      : /^GENERATE\s+SUBROUTINE\s+POOL\b/i.test(code)
        ? 'GENERATE SUBROUTINE POOL compiles ABAP source held in an internal table into a temporary program'
        : null;
    if (generated) {
      tasks.push({
        kind: 'generated-program',
        ...at(statement),
        title: 'ABAP code generated at run time',
        detail: `${generated}. Whatever reaches that source runs with the program's authorizations, and the generated code is not in any transport, review or code check.`,
        check: 'Check where every line of the generated source comes from. No part of it may come from input; prefer a fixed implementation or released dynamic features (RTTS, dynamic calls with a whitelist) over generated code.',
        severity: 'High',
      });
    }

    // DSAG ABAP guideline: security/security-examples.md § Dangerous ABAP Commands
    if (/^EDITOR-CALL\s+FOR\s+REPORT\b/i.test(code)) {
      tasks.push({
        kind: 'editor-call-for-report',
        ...at(statement),
        title: 'ABAP editor opened from the program (EDITOR-CALL FOR REPORT)',
        detail: 'EDITOR-CALL FOR REPORT opens the source of a program in an editor. The statement is obsolete in ABAP.',
        check: 'Check why custom code offers an ABAP editor. Changing source belongs to the development tools, where it is authorized and recorded; remove the call.',
        severity: 'Medium',
      });
    }
    if (/^COMMUNICATION\s+(?:INIT|ALLOCATE|ACCEPT|SEND|RECEIVE|DEALLOCATE)\b/i.test(code)) {
      tasks.push({
        kind: 'communication-statement',
        ...at(statement),
        title: 'Obsolete CPI-C communication (COMMUNICATION)',
        detail: 'COMMUNICATION exchanges data with another program over CPI-C. The statement is obsolete, and the connection cannot use the protections of RFC such as SNC encryption.',
        check: 'Check which partner the program talks to and replace the exchange with RFC or an HTTP-based interface that is authenticated and encrypted.',
        severity: 'Medium',
      });
    }

    // CALL TRANSACTION without WITH or WITHOUT AUTHORITY-CHECK
    if (/^CALL\s+TRANSACTION\b/i.test(code) && !/\bWITH(?:OUT)?\s+AUTHORITY-CHECK\b/i.test(code)) {
      const tcode = /^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(statement.text)?.[1]?.toUpperCase()
        ?? new RegExp(String.raw`^CALL\s+TRANSACTION\s+(${OPERAND})`, 'i').exec(code)?.[1];
      tasks.push({
        kind: 'call-transaction-without-authority-addition',
        ...at(statement),
        title: `CALL TRANSACTION${tcode ? ` ${tcode}` : ''} without WITH or WITHOUT AUTHORITY-CHECK`,
        detail: 'Without one of the two additions, whether the user\'s authorization for the called transaction (S_TCODE) is checked depends on the system\'s check-indicator table maintained in transaction SE97, not on the program.',
        check: 'Check which behaviour is intended and write it: WITH AUTHORITY-CHECK to check the user\'s authorization for the transaction, or WITHOUT AUTHORITY-CHECK together with a check of your own before the call.',
        severity: 'Low',
        subject: tcode,
      });
    }
  }

  return tasks.sort((a, b) => a.lineStart - b.lineStart);
}

/* ------------------------------------------------------------ input flow */

const OPENS = /^(?:IF|CASE|DO|WHILE|LOOP|TRY|FORM|METHOD|FUNCTION|MODULE|AT|PROVIDE|ON\s+CHANGE\s+OF|CATCH\s+SYSTEM-EXCEPTIONS)\b/i;
const CLOSES = /^(?:ENDIF|ENDCASE|ENDDO|ENDWHILE|ENDLOOP|ENDTRY|ENDFORM|ENDMETHOD|ENDFUNCTION|ENDMODULE|ENDAT|ENDPROVIDE|ENDON|ENDCATCH)\b/i;
const BRANCHES = /^(?:ELSE|ELSEIF|WHEN|CATCH(?!\s+SYSTEM-EXCEPTIONS\b)|CLEANUP)\b/i;

/**
 * For each statement, the control blocks it stands in, outermost first, each
 * with the branch of it (`IF` 0, the first `ELSEIF` 1, …): `["3.0", "7.1"]`.
 * Every block has its own number, so a statement whose path is a prefix of
 * another's runs on every way to it inside the same routine — an
 * unconditional statement before it. A `SELECT … ENDSELECT` loop is not
 * read as a block.
 */
function controlPaths(statements: readonly AbapStatement[]): string[][] {
  const stack: Array<{ id: number; branch: number }> = [];
  let next = 0;
  return statements.map((s) => {
    const code = maskLiterals(s.text).trim();
    if (CLOSES.test(code)) {
      stack.pop();
      return stack.map((f) => `${f.id}.${f.branch}`);
    }
    if (BRANCHES.test(code) && stack.length > 0) {
      stack[stack.length - 1].branch += 1;
      return stack.map((f) => `${f.id}.${f.branch}`);
    }
    // `AT SELECTION-SCREEN` and `AT LINE-SELECTION` are events, not blocks with ENDAT.
    if (OPENS.test(code) && !/^AT\s+(?:SELECTION-SCREEN|LINE-SELECTION|USER-COMMAND|PF\d+)\b/i.test(code)
      && !/^(?:METHOD|FORM|FUNCTION|MODULE)\b[\s\S]*\bDEFINITION\b/i.test(code)) {
      stack.push({ id: next++, branch: 0 });
    }
    return stack.map((f) => `${f.id}.${f.branch}`);
  });
}

/**
 * True when the last statement before `access` that writes `name` assigns it a
 * value that comes from no input (`lv_where = 'MANDT = 1'.`, `CLEAR lv_where.`)
 * and runs on every way to `access` — it stands in the same block and branch,
 * or in one that encloses it. What reaches the clause then is that value, not
 * the input.
 *
 * `operand` (from 3.0.18) is the operand as the clause reads it: when that is a
 * component (`ls_filter-where`), a clean write to that very component is an
 * overwrite of what reaches the clause; a write to another component still is
 * none.
 */
function overwrittenCleanBefore(
  statements: readonly AbapStatement[],
  paths: readonly string[][],
  name: string,
  access: number,
  tainted: Set<string>,
  operand: string | null = null,
): boolean {
  const read = operand?.trim().toUpperCase().replace(/^!/, '') ?? '';
  const readsComponent = /^(?!DATA\()[\w/<>]+(?:->[\w/]+)*-(?!>)/i.test(read);
  for (let i = access - 1; i >= 0; i--) {
    const s = statements[i];
    if (!writtenNames(s.text).has(name)) continue;
    const at = paths[i] ?? [];
    const target = paths[access] ?? [];
    if (at.length > target.length || at.some((p, k) => target[k] !== p)) return false;
    const code = codeWithEmbedded(s.text);
    // A write to one component (`ls_filter-description = 'x'`) clears no other
    // component: it is no overwrite of the whole, and a tainted one still taints
    // (QA review of 3fd753f5de41, b0133ee3eb34).
    const written = /^(?:CLEAR\s+)?([^\s=]+)/i.exec(code)?.[1] ?? '';
    const component = /^(?!DATA\()[\w/<>!]+(?:->[\w/]+)*-(?!>)/i.test(written);
    const assigned = new RegExp(String.raw`^(?:DATA\(\s*[\w/]+\s*\)|${OPERAND})\s*=\s*([\s\S]*)$`, 'i').exec(code);
    if (component) {
      // The component the clause reads, written clean or cleared: that is what reaches it.
      if (readsComponent && written.toUpperCase().replace(/^!/, '').replace(/\.$/, '') === read
        && ((assigned && !mentions(assigned[1], tainted)) || /^CLEAR\b/i.test(code))) return true;
      if (assigned && !mentions(assigned[1], tainted)) continue;
      if (/^CLEAR\b/i.test(code)) continue;
      return false;
    }
    if (/^CLEAR\b/i.test(code)) return true;
    if (!assigned) return false;
    return !mentions(assigned[1], tainted);
  }
  return false;
}

/** `ls_x-field` → `LS_X`; `me->mv_x` → `MV_X`; `<fs>` → `<FS>`; `p_x-low` → `P_X`. */
function baseName(operand: string): string {
  let name = operand.trim().toUpperCase();
  const arrow = name.lastIndexOf('->');
  if (arrow >= 0) name = name.slice(arrow + 2);
  name = name.replace(/^!/, '');
  const dash = name.indexOf('-');
  if (dash > 0) name = name.slice(0, dash);
  return name;
}

/**
 * The names a statement writes, by base name: the target of an assignment,
 * `CONCATENATE … INTO`, `MOVE … TO`, `SPLIT … INTO`, `CLEAR`, `REPLACE … IN`,
 * `TRANSLATE`, `CONDENSE`, `SHIFT` and `OVERLAY`, and every actual parameter
 * after `IMPORTING` or `CHANGING` of a call — a value the call may hand back.
 */
function writtenNames(text: string): Set<string> {
  const code = maskLiterals(text);
  const names = new Set<string>();
  const add = (operand: string) => names.add(baseName(operand.replace(/^DATA\(\s*([\w/]+)\s*\)$/i, '$1')));
  let m: RegExpExecArray | null;
  if ((m = new RegExp(String.raw`^(DATA\(\s*[\w/]+\s*\)|${OPERAND})\s*(?:=|&&=|\+=|-=)`, 'i').exec(code))) add(m[1]);
  if ((m = new RegExp(String.raw`^(?:CONCATENATE|SPLIT)\b[\s\S]*?\bINTO\s+((?:${OPERAND}\s*)+)`, 'i').exec(code))) {
    for (const o of m[1].split(/\s+/)) if (o && !/^(?:TABLE|SEPARATED|RESPECTING|IN|DATA)$/i.test(o)) add(o);
  }
  if ((m = new RegExp(String.raw`^MOVE\b[\s\S]*?\bTO\s+(${OPERAND})`, 'i').exec(code))) add(m[1]);
  if ((m = new RegExp(String.raw`^(?:CLEAR|TRANSLATE|CONDENSE|SHIFT|OVERLAY)\s+(${OPERAND})`, 'i').exec(code))) add(m[1]);
  if ((m = new RegExp(String.raw`^REPLACE\b[\s\S]*?\bIN\s+(?:SECTION\b[\s\S]*?\bOF\s+)?(${OPERAND})`, 'i').exec(code))) add(m[1]);
  for (const section of code.split(/\b(?=(?:EXPORTING|IMPORTING|CHANGING|TABLES|RECEIVING|EXCEPTIONS)\b)/i)) {
    if (!/^(?:IMPORTING|CHANGING|TABLES|RECEIVING)\b/i.test(section)) continue;
    for (const p of section.matchAll(new RegExp(String.raw`=\s*(${OPERAND})`, 'g'))) add(p[1]);
  }
  return names;
}

/**
 * The statement with every literal's text blanked but the expressions embedded
 * in string templates kept: `|{ p_field } = @p_value|` hands `p_field` on, the
 * text around it does not.
 */
function codeWithEmbedded(text: string): string {
  const scan = createLiteralScanner();
  let out = '';
  for (const ch of text) {
    const code = scan(ch);
    out += code || scan.embedded() ? ch : ' ';
  }
  return out;
}

function mentions(text: string, names: Set<string>): boolean {
  for (const m of text.matchAll(/(?:->)?(!?[\w/<>~]+)/g)) {
    const name = m[1].toUpperCase().replace(/^!/, '');
    if (names.has(name)) return true;
  }
  return false;
}

/**
 * The names whose value comes from input, and every name the source fills
 * from one of them.
 *
 * Input is what the person or the caller hands the code: `PARAMETERS` and
 * `SELECT-OPTIONS`, the parameters of a `FORM`, the `IMPORTING` and `CHANGING`
 * parameters of a method, and the `IMPORTING`, `CHANGING` and `TABLES`
 * parameters of a function module (its interface comment block). The flow is
 * followed through assignments, `CONCATENATE … INTO`, `APPEND … TO`,
 * `INSERT … INTO TABLE` and `MOVE … TO`, to a fixed point.
 *
 * Each pass walks the flows in source order, so a chain the source writes
 * backwards grows by one name per pass. From 3.0.13 (`toFixedPoint`) the passes
 * run until nothing grows — at most one per flow, plus the one that finds
 * nothing new. Before, they stopped after eight, as runs of engine 3.0.12 signed it.
 */
function taintedNames(source: string, statements: AbapStatement[], formParameters: string[], toFixedPoint: boolean): Set<string> {
  const names = new Set<string>(formParameters.map((n) => n.toUpperCase()));

  for (const statement of statements) {
    const selection = /^(?:PARAMETERS|PARAMETER|SELECT-OPTIONS)\s*:?\s*([\w/]+)/i.exec(statement.text);
    if (selection) names.add(selection[1].toUpperCase());
    if (/^(?:CLASS-)?METHODS\b/i.test(statement.text)) {
      const sections = statement.text.split(/\b(IMPORTING|EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS)\b/i);
      for (let i = 1; i < sections.length; i += 2) {
        if (!/^(?:IMPORTING|CHANGING)$/i.test(sections[i])) continue;
        for (const p of (sections[i + 1] ?? '').matchAll(/(?:VALUE\(\s*|REFERENCE\(\s*)?!?([\w/]+)\s*\)?\s+(?:TYPE|LIKE)\b/gi)) {
          names.add(p[1].toUpperCase());
        }
      }
    }
  }

  // Function module interface: the `*"` comment block the editor writes.
  let section = '';
  for (const raw of source.split(/\r?\n/)) {
    if (!/^\*"/.test(raw)) continue;
    const head = /^\*"\s*(IMPORTING|EXPORTING|CHANGING|TABLES|EXCEPTIONS|RAISING)\b/i.exec(raw);
    if (head) { section = head[1].toUpperCase(); continue; }
    if (!['IMPORTING', 'CHANGING', 'TABLES'].includes(section)) continue;
    const p = /^\*"\s*(?:VALUE\(|REFERENCE\()?([\w/]+)\)?\s+(?:TYPE|LIKE|STRUCTURE)\b/i.exec(raw);
    if (p) names.add(p[1].toUpperCase());
  }

  // What each statement fills, and from what.
  const flows: Array<{ target: string; from: string }> = [];
  for (const statement of statements) {
    const code = codeWithEmbedded(statement.text);
    const target = (name: string) => baseName(name.replace(/^DATA\(\s*([\w/]+)\s*\)$/i, '$1'));
    let m: RegExpExecArray | null;
    if ((m = new RegExp(String.raw`^(DATA\(\s*[\w/]+\s*\)|${OPERAND})\s*(?:=|&&=|\+=)\s*([\s\S]*)$`, 'i').exec(code))) {
      flows.push({ target: target(m[1]), from: m[2] });
    } else if ((m = new RegExp(String.raw`^CONCATENATE\b([\s\S]*?)\bINTO\s+(DATA\(\s*[\w/]+\s*\)|${OPERAND})`, 'i').exec(code))) {
      flows.push({ target: target(m[2]), from: m[1] });
    } else if ((m = new RegExp(String.raw`^APPEND\b([\s\S]*?)\bTO\s+(${OPERAND})`, 'i').exec(code))) {
      flows.push({ target: target(m[2]), from: m[1] });
    } else if ((m = new RegExp(String.raw`^INSERT\b([\s\S]*?)\bINTO\s+TABLE\s+(${OPERAND})`, 'i').exec(code))) {
      flows.push({ target: target(m[2]), from: m[1] });
    } else if ((m = new RegExp(String.raw`^MOVE\b([\s\S]*?)\bTO\s+(${OPERAND})`, 'i').exec(code))) {
      flows.push({ target: target(m[2]), from: m[1] });
    }
  }
  const passes = toFixedPoint ? flows.length + 1 : 8;
  for (let pass = 0; pass < passes; pass++) {
    let grew = false;
    for (const flow of flows) {
      if (!flow.target || names.has(flow.target)) continue;
      if (mentions(flow.from, names)) { names.add(flow.target); grew = true; }
    }
    if (!grew) break;
  }
  return names;
}
