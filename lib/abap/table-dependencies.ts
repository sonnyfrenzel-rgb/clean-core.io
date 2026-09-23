import { tokenize } from './declaration-parser';
import { createLiteralScanner, maskNonCode } from './statement-reader';
import { databaseWriteIn, isInternalTableOperation } from './open-sql-discrimination';
import { readConstantDeclarations } from './business-rules';

/**
 * Which tables a program depends on, and how — read once, for both engines.
 *
 * `evidence-model.ts` and `code-assessment.ts` each used to read the table out
 * of `SELECT … FROM` and the DML statements with their own copy of the same
 * pattern, and both took the first word after the keyword for a name. Roadmap
 * 2.11 measured what that misses against the reference corpus
 * (`docs/korpus/referenzkorpus-v2.1.md`), and it was never a matter of one more
 * keyword — it is dependencies the pattern cannot see or sees wrongly:
 *
 *   - **ADBC** (CC-034, R13b a). `lo_stmt->execute_update( lv_sql )` executes
 *     the template assigned to `lv_sql` as SQL. `UPDATE KNA1` sat in that
 *     template, and the word KNA1 did not appear anywhere in the output.
 *   - **Macros** (CC-042, R27). `SELECT COUNT(*) FROM &1` inside `DEFINE` was
 *     reported as a table called `&1`, and the two tables the macro is called
 *     with were not reported at all. A macro body does nothing until it is
 *     called; its effect belongs to the call site.
 *   - **Dynamic targets** (CC-020, CC-036, CC-037, CC-038, R07/R26). `FROM
 *     (lc_tab)` was reported as a table called `(LC_TAB)`, though `lc_tab` is a
 *     constant holding `'KNA1'`. `FROM (p_tab)` was reported as `(P_TAB)`,
 *     though nothing in the source closes what `p_tab` holds. `MODIFY (p_tab)`
 *     was not reported at all.
 *   - **Type references** (CC-045, R29). `TABLES: kna1`, `DATA ls TYPE kna1`,
 *     `INCLUDE STRUCTURE kna1` depend on KNA1's definition without reading a
 *     row — and were not reported.
 *   - **Logical databases** (CC-047, R33). `NODES: kna1` and `GET kna1` read
 *     KNA1 without a SELECT in the source.
 *   - **Program-global fields** (CC-040, R13b b). `ASSIGN
 *     ('(SAPMV45A)VBAK-VBELN') TO <fs>` reaches into another program's memory
 *     by a name written in a literal.
 *   - **Local names** (Fallbuch §8, metamorphic P1). `MODIFY gt_bp_data FROM
 *     gs_bp_data` in `Z_BUSINESS_PARTNER_SYNC` is internal-table work on a
 *     variable declared twelve lines above; the evidence engine knew and
 *     suppressed it, the data coupling reported a database write.
 *
 * **Two rules this reader keeps, because both are easier to break than to
 * state.**
 *
 * *An unresolved target is a statement, not an object.* A dynamic name whose
 * value the source does not close produces an `UnresolvedTarget` — where, how
 * it is accessed, where the value comes from — and never a table called
 * `(P_TAB)`. Where the source shows a value for it, a `DEFAULT` or a literal
 * assignment, that value is recorded as a *possible* target and marked as
 * such (`possibleTargetOf`): a default is what the selection screen offers, not
 * what the program is limited to (R07). Nothing is guessed beyond the text.
 *
 * *A literal is only read where a consumer reads it.* The SQL text of an ADBC
 * call is read, because the database executes it; the same words in a `WRITE`
 * are prose (R13a, CC-016). And inside a template, only the text segments are
 * SQL — an embedded `{ p_name }` is ABAP, so a table name written in one is
 * unresolved rather than read as its variable's name. The literal rule itself is
 * `createLiteralScanner()`'s, asked rather than restated.
 *
 * Anchors follow R27: the line the statement starts on — for a macro, the call
 * site. Every answer is read from `tokenize()`, the statement reader both
 * consumers already walk, so a dependency's `statement` index is the index of
 * the statement they are looking at.
 */

export type DependencyAccess = 'read' | 'write' | 'reference';

export type DependencyRoute =
  /** Named in an ABAP SQL statement. */
  | 'open-sql'
  /** Named in a dynamic token — `FROM (lc_tab)` — whose value the source closes (R07). */
  | 'dynamic-sql'
  /** Named in a macro body and effective at the call site (R27). */
  | 'macro'
  /** Named in SQL text executed through ADBC (`CL_SQL_STATEMENT`, R13b a). */
  | 'adbc'
  /** A logical database node — `NODES`, `GET` (R33). */
  | 'logical-database'
  /** A type dependency without a row access — `TABLES`, `TYPE`, `INCLUDE STRUCTURE` (R29). */
  | 'type-reference'
  /** A global data object of another program, named in a literal (R13b b). */
  | 'program-global';

export interface TableDependency {
  /** Upper-cased. Never a placeholder, never a parenthesised variable. */
  table: string;
  access: DependencyAccess;
  route: DependencyRoute;
  /** Index into `tokenize(code)`. */
  statement: number;
  /** The line the statement starts on — for a macro, the call site. */
  line: number;
  /** The statement's text. */
  snippet: string;
  /**
   * Set when this name is a value the source shows for a dynamic target it
   * does not close — `p_tab`'s `DEFAULT 'KNA1'`. A possible target, never the
   * target (R26).
   */
  possibleTargetOf?: string;
  /** For `program-global`: the program whose data object is read. */
  program?: string;
  /** For `macro`: the macro expanded at this call site. */
  macro?: string;
}

export interface UnresolvedTarget {
  statement: number;
  line: number;
  snippet: string;
  /** The dynamic expression as written, e.g. `p_tab`. */
  expression: string;
  access: DependencyAccess;
  /** Where the value comes from, as far as the source says. */
  origin: 'selection-screen' | 'variable' | 'expression';
  /** Table or type names the source shows for it — possible targets, not the target. */
  possible: string[];
}

export interface AdbcExecution {
  statement: number;
  line: number;
  snippet: string;
  /** `EXECUTE_UPDATE`, `EXECUTE_QUERY`, `EXECUTE_DDL`. */
  method: string;
}

export interface TableDependencyReport {
  /** In statement order. */
  dependencies: TableDependency[];
  /** In statement order. */
  unresolved: UnresolvedTarget[];
  /** Statements that hand SQL text to the database through ADBC. */
  adbc: AdbcExecution[];
}

/* ----------------------------------------------------------- names */

/** Words that are never a table name where the patterns below find one. */
const FAKE_TABLES = new Set([
  'MODE', 'TASK', 'RISK', 'SCREEN', 'LINE', 'TABLE', 'INTO', 'FROM',
  'CORRESPONDING', 'DATA', 'ADJACENT', 'RESULT', 'CONNECTION', 'TYPE',
  'INDEX', 'UP', 'TO', 'ROWS', 'WHERE', 'AND', 'OR', 'NOT', 'NULL',
  'IS', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'OUTER', 'INNER',
  'FULL', 'CROSS', 'USING', 'CLIENT', 'SPECIFIED', 'SYSTEM', 'VALUES',
  'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'FOR', 'ALL',
  'ENTRIES', 'BY', 'ORDER', 'GROUP', 'HAVING',
]);

/**
 * ABAP's own types, and the words that stand after `TYPE` without naming one.
 * A `TYPE` followed by any of these is no dependency on a repository object.
 */
const NOT_A_REPOSITORY_TYPE = new Set([
  'C', 'N', 'D', 'T', 'X', 'I', 'B', 'S', 'P', 'F', 'INT1', 'INT2', 'INT8',
  'DECFLOAT16', 'DECFLOAT34', 'STRING', 'XSTRING', 'UTCLONG', 'DATN', 'TIMN',
  'ANY', 'DATA', 'SIMPLE', 'NUMERIC', 'CLIKE', 'CSEQUENCE', 'XSEQUENCE',
  'DECFLOAT', 'OBJECT', 'REF', 'TABLE', 'STANDARD', 'SORTED', 'HASHED', 'LINE',
  'RANGE', 'ENUM', 'LENGTH', 'DECIMALS', 'VALUE', 'BOXED', 'OF',
]);

/** The system-field structure. `TYPE sy-datum` depends on nothing in the repository. */
const SYSTEM_STRUCTURES = new Set(['SY', 'SYST', 'SCREEN', 'TEXT']);

/**
 * Names declared as local data objects in the source.
 *
 * The write detectors match the first token after INSERT / MODIFY / DELETE, and
 * ABAP uses those same keywords for internal tables. Without this, every
 * `INSERT ls_wa INTO TABLE lt_items` became a Critical "direct write to SAP
 * standard table LS_WA" — fabricated findings on ordinary code, which inflate
 * the Critical count, depress the Clean Core Score and can flip the routing
 * decision to side-by-side. It lived in `evidence-model.ts` and the data
 * coupling did not ask it, which is how `MODIFY gt_bp_data FROM gs_bp_data`
 * stayed a database write there (Fallbuch §8).
 *
 * Approximate by design: an unknown name is still treated as a table, so a real
 * database write is never missed. What this removes is the noise.
 *
 * **It reads code, not text.** The patterns below used to run over the raw
 * source, and a suppression list built from raw source is the one place where a
 * comment can delete a finding rather than add one: a single line
 *
 *     * DATA vbak TYPE ztab.      "an old declaration, commented out
 *
 * registered VBAK as a local data object, and the real `UPDATE vbak` below it
 * left `Sink.table` without a word — no Critical finding, no data coupling, a
 * Clean Core score computed as if the statement were not there (full review of
 * a19945ef01dc, f4383c553eaa). A literal does the same: `WRITE 'DATA kna1'.`
 * would have suppressed KNA1. `maskNonCode` removes both before the first
 * pattern is asked.
 */
export function collectLocalDataObjects(source: string): Set<string> {
  const code = maskNonCode(source);
  const names = new Set<string>();
  const add = (n?: string) => {
    const v = (n || '').toUpperCase().replace(/[<>]/g, '').trim();
    if (v) names.add(v);
  };

  // DATA foo TYPE …, CLASS-DATA, STATICS, CONSTANTS, FIELD-SYMBOLS, TYPES,
  // PARAMETERS, SELECT-OPTIONS, RANGES — declaration keyword followed by a name.
  const decl = /\b(?:CLASS-DATA|DATA|STATICS|CONSTANTS|FIELD-SYMBOLS|TYPES|PARAMETERS|SELECT-OPTIONS|RANGES)\s*:?\s*([\w<>\/]+)/gi;
  for (const m of code.matchAll(decl)) add(m[1]);

  // Chained declarations: DATA: a TYPE i, b TYPE string.
  const chained = /\b(?:CLASS-DATA|DATA|STATICS|CONSTANTS|FIELD-SYMBOLS|TYPES)\s*:\s*([\s\S]*?)\./gi;
  for (const m of code.matchAll(chained)) {
    for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }

  // Inline declarations: DATA(lv_x), @DATA(lt_x), FINAL(lv_y), FIELD-SYMBOL(<fs>)
  const inline = /\b(?:@?DATA|FINAL|FIELD-SYMBOL)\(\s*([\w<>\/]+)\s*\)/gi;
  for (const m of code.matchAll(inline)) add(m[1]);

  // Signature parameters of methods and forms — in a declaration, and only
  // there. The same keywords name the *actual* parameters of a call, and the
  // scan used to read the whole source: `CALL FUNCTION 'Z_F' EXPORTING kna1 =
  // lv_x.` registered KNA1 as a local data object, and the real `UPDATE kna1`
  // below it then produced no finding at all — the suppression path that has
  // erased a Critical finding twice before (full review of b88c77b4b5d1,
  // 5547aaa0fdbc).
  const params = /\b(?:IMPORTING|EXPORTING|CHANGING|RETURNING|USING|VALUE\(|REFERENCE\()\s*([\w\/]+)/gi;
  const signature = /(?:^|\.)\s*(?:CLASS-)?(?:METHODS|FORM|FUNCTION|MODULE)\b([^.]*)/gi;
  for (const decl of code.matchAll(signature)) {
    for (const m of decl[1].matchAll(params)) add(m[1]);
  }

  // LOOP AT it INTO wa / ASSIGNING <fs> — the target is a data object.
  //
  // One form is not: `INSERT INTO <dbtab> VALUES …`, the standard Open SQL
  // insert. There the name after INTO is a database table, and registering it
  // here as a local data object made `processTableAccess` return before it ever
  // looked at it — so a direct write into an SAP standard table, in the most
  // common syntax there is, produced no finding at all. Neither review pass
  // found this; it surfaced while testing the neighbouring `INSERT <wa> INTO
  // <itab>` fix, because the two share the keyword and nothing else.
  const scanned = code.replace(/\bINSERT\s+INTO\b/gi, 'INSERT');
  const targets = /\b(?:INTO|ASSIGNING)\s+(?:TABLE\s+)?([\w<>\/]+)/gi;
  for (const m of scanned.matchAll(targets)) add(m[1]);

  return names;
}

/* ----------------------------------------------------------- literals */

/** The text with every character that is not code — literal content and delimiters — blanked, offsets kept. */
function codeOnly(text: string): string {
  const outside = createLiteralScanner();
  let out = '';
  for (const ch of text) out += outside(ch) ? ch : ' ';
  return out;
}

/** Stands for an embedded expression in a template's SQL text. */
const EMBEDDED = String.fromCharCode(1);

/**
 * The text of a single literal — `'…'`, `` `…` `` or `|…|` — or null when the
 * operand is anything else. In a template, each embedded `{ … }` becomes one
 * `EMBEDDED` mark: it is ABAP, evaluated before the text reaches anybody (R13a).
 */
function literalText(operand: string): string | null {
  const text = operand.trim();
  if (text.length < 2 || !/^['`|]/.test(text)) return null;
  const scan = createLiteralScanner();
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const wasEmbedded = scan.embedded();
    if (scan(ch)) return null;
    const isEmbedded = scan.embedded();
    const last = i === text.length - 1;
    // Asking about a blank reads the state without changing it: true means the
    // literal closed before the operand ended, so the operand is not one literal.
    if (!last && scan(' ')) return null;
    if (wasEmbedded || isEmbedded) {
      if (!wasEmbedded) out += EMBEDDED;
      continue;
    }
    if (i === 0 || last) continue;
    out += ch;
  }
  return scan(' ') ? out : null;
}

/** `a && b & c` split at the concatenation operators that are code. */
function concatenationOperands(expression: string): string[] {
  const outside = createLiteralScanner();
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    const code = outside(ch);
    if (code && ch === '&') {
      if (expression[i + 1] === '&') i += 1;
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim());
}

/** The text a chain of literals stands for, or null when any operand is not a literal. */
function literalChainText(expression: string): string | null {
  const operands = concatenationOperands(expression);
  let out = '';
  for (const operand of operands) {
    const text = literalText(operand);
    if (text === null) return null;
    out += text;
  }
  return out;
}

/**
 * The contents of the parenthesis that opens at `open`, or null. Parentheses
 * inside literals do not count — `'(SAPMV45A)VBAK-VBELN'` is one argument.
 */
function parenthesised(text: string, open: number): string | null {
  const outside = createLiteralScanner();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const code = outside(text[i]);
    if (i < open || !code) continue;
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/* ----------------------------------------------------------- context */

type Statement = ReturnType<typeof tokenize>[number];

interface Context {
  statements: Statement[];
  code: string[];
  local: Set<string>;
  localTypes: Set<string>;
  /** Type groups whose types are no dictionary objects — the known ones and the source's TYPE-POOLS. */
  typeGroups: string[];
  nodes: Set<string>;
  constants: ReturnType<typeof readConstantDeclarations>;
  parameters: Set<string>;
  /** Name → the literal values a `DEFAULT` gives it. */
  defaults: Map<string, string[]>;
  /** Upper-cased left-hand side → the right-hand sides assigned to it, as written. */
  assignments: Map<string, string[]>;
  macros: Map<string, string[]>;
  inMacroBody: boolean[];
  adbc: boolean;
  /** What is left of `MACRO_EXPANSION_BUDGET` for this source. */
  budget: { left: number };
}

/**
 * How many statements one analysis may read out of macro bodies, all call sites
 * together.
 *
 * `depth < 4` bounds how deep an expansion goes and says nothing about how wide
 * it gets. A body of thirty calls to a macro of thirty calls is four levels of
 * nothing suspicious and 810 000 statements to read, and the source that does
 * it fits on a screen — an upload that keeps a server busy on one analysis
 * (security audit of b88c77b4b5d1, SEC-2026-228). The budget is a ceiling on
 * the whole source rather than on one call, because a hundred small fans cost
 * what one large one does.
 *
 * A call the budget will not pay for is not expanded and not guessed at: it
 * becomes an unresolved target, so `coverage.ts` reports the statement as
 * unassessed instead of the engine reporting silence as a clean result.
 */
const MACRO_EXPANSION_BUDGET = 2000;

function buildContext(source: string): Context {
  const statements = tokenize(source);
  const code = statements.map((s) => codeOnly(s.text));

  const tablesNames = new Set<string>();
  const nodes = new Set<string>();
  const localTypes = new Set<string>();
  const typeGroups = new Set<string>(KNOWN_TYPE_GROUPS);
  const parameters = new Set<string>();
  const defaults = new Map<string, string[]>();
  const assignments = new Map<string, string[]>();
  const macros = new Map<string, string[]>();
  const inMacroBody = statements.map(() => false);

  let macro: string | null = null;
  statements.forEach((statement, i) => {
    const text = statement.text.trim();
    const bare = code[i].trim();
    if (macro !== null) {
      inMacroBody[i] = true;
      if (/^END-OF-DEFINITION$/i.test(bare)) macro = null;
      else macros.get(macro)!.push(text);
      return;
    }
    const define = /^DEFINE\s+([\w/-]+)\s*$/i.exec(bare);
    if (define) {
      macro = define[1].toUpperCase();
      macros.set(macro, []);
      inMacroBody[i] = true;
      return;
    }

    const declared = /^(TABLES|NODES)\b\s*:?\s*(.*)$/i.exec(bare);
    if (declared) {
      for (const part of declared[2].split(',')) {
        const name = /^\*?([\w/]+)/.exec(part.trim())?.[1]?.toUpperCase();
        if (!name) continue;
        tablesNames.add(name);
        if (declared[1].toUpperCase() === 'NODES') nodes.add(name);
      }
    }

    for (const m of bare.matchAll(/\bBEGIN\s+OF\s+([\w/]+)/gi)) localTypes.add(m[1].toUpperCase());
    const pools = /^TYPE-POOLS?\b\s*:?\s*(.*)$/i.exec(bare);
    if (pools) for (const pool of pools[1].split(/[\s,]+/).filter(Boolean)) typeGroups.add(pool.toUpperCase());
    const typesStatement = /^TYPES\b\s*:?\s*([\w/]+)\s+(?:TYPE|LIKE)\b/i.exec(bare);
    if (typesStatement) localTypes.add(typesStatement[1].toUpperCase());

    if (/^PARAMETERS\b/i.test(bare)) {
      const body = text.replace(/^PARAMETERS\s*:?\s*/i, '');
      for (const part of body.split(',')) {
        const name = /^([\w/]+)/.exec(part.trim())?.[1]?.toUpperCase();
        if (!name) continue;
        parameters.add(name);
        const value = /\bDEFAULT\s+('(?:[^']|'')*'|`[^`]*`)/i.exec(part)?.[1];
        const literal = value ? literalText(value) : null;
        if (literal !== null) defaults.set(name, [...(defaults.get(name) ?? []), literal]);
      }
    }

    // `lhs = rhs`, and the other statements that give a variable a value. A
    // CONCATENATE into it is recorded as a non-literal value, which is what it
    // is for the question asked here.
    const assignment = /^([\w/<>~-]+(?:->[\w/]+)*)\s*=\s*(.+)$/.exec(text);
    if (assignment && /^([\w/<>~-]+(?:->[\w/]+)*)\s*=/.test(bare)) {
      const lhs = assignment[1].toUpperCase();
      assignments.set(lhs, [...(assignments.get(lhs) ?? []), assignment[2]]);
    }
    const concatenate = /^CONCATENATE\b.*\bINTO\s+([\w/<>~-]+)/i.exec(bare);
    if (concatenate) {
      const lhs = concatenate[1].toUpperCase();
      assignments.set(lhs, [...(assignments.get(lhs) ?? []), statement.text]);
    }
  });

  const local = collectLocalDataObjects(source);
  // A TABLES or NODES name is a table with a work area of the same name, not a
  // variable — `SELECT * FROM kna1 INTO kna1` reads KNA1.
  for (const name of tablesNames) local.delete(name);

  return {
    statements,
    code,
    local,
    localTypes,
    typeGroups: [...typeGroups],
    nodes,
    constants: readConstantDeclarations(source),
    parameters,
    defaults,
    assignments,
    macros,
    inMacroBody,
    adbc: code.some((c) => /\bCL_SQL_(?:STATEMENT|CONNECTION)\b/i.test(c)),
    budget: { left: MACRO_EXPANSION_BUDGET },
  };
}

/* ----------------------------------------------------------- resolution */

interface Resolution {
  /** True when the value is one the source fixes: a literal or a constant (R07). */
  closed: boolean;
  values: string[];
  origin: UnresolvedTarget['origin'];
}

function resolveValue(expression: string, ctx: Context): Resolution {
  const text = expression.trim();
  const literal = literalText(text);
  if (literal !== null) return { closed: true, values: [literal], origin: 'expression' };

  const name = text.toUpperCase();
  if (/^[\w/]+$/.test(text)) {
    if (ctx.constants.byName.has(name)) {
      const constant = ctx.constants.byName.get(name);
      if (constant) return { closed: true, values: [constant.value], origin: 'variable' };
      return {
        closed: false,
        values: ctx.constants.declared.filter((c) => c.name === name).map((c) => c.value),
        origin: 'variable',
      };
    }
  }
  const assigned = (ctx.assignments.get(name) ?? [])
    .map((rhs) => literalText(rhs))
    .filter((v): v is string => v !== null);
  return {
    closed: false,
    values: [...(ctx.defaults.get(name) ?? []), ...assigned],
    origin: ctx.parameters.has(name) ? 'selection-screen' : /^[\w/]+$/.test(text) ? 'variable' : 'expression',
  };
}

/** A value as a table or type name — the part before a component selector — or null. */
function nameIn(value: string): string | null {
  const name = value.trim().toUpperCase().split('-')[0];
  return /^[A-Z_/][A-Z0-9_/]+$/.test(name) ? name : null;
}

/* ----------------------------------------------------------- reading */

interface Anchor {
  statement: number;
  line: number;
  snippet: string;
  macro?: string;
}

class Sink {
  readonly buckets: TableDependency[][];
  readonly unresolved: UnresolvedTarget[] = [];
  readonly adbc: AdbcExecution[] = [];

  constructor(private readonly ctx: Context) {
    this.buckets = ctx.statements.map(() => []);
  }

  table(
    at: Anchor,
    raw: string,
    access: DependencyAccess,
    route: DependencyRoute,
    extra: Partial<Pick<TableDependency, 'possibleTargetOf' | 'program'>> = {},
    /**
     * The name stands bare in an ABAP SQL source list. ABAP has no such form
     * for an internal table — that one is written `FROM @itab` — so the name is
     * a dictionary entity whatever else the source calls it, and the local-name
     * suppression below does not apply to it. It did: `DATA mara TYPE string.`
     * above a real `SELECT * FROM mara` deleted the MARA read from the signed
     * analysis, and so did a `CALL FUNCTION … EXPORTING mara = …` further up,
     * because `collectLocalDataObjects` reads actual parameters too (full review
     * of b88c77b4b5d1, 5f6655b0c2e0 / b885d8006422 / d0cd376a8141).
     */
    bareSqlSource = false,
  ): void {
    const table = raw.toUpperCase().trim();
    if (!table || table.length < 2 || FAKE_TABLES.has(table) || /^\d/.test(table)) return;
    // A name declared in this source is a variable, not a database table.
    if (!bareSqlSource && this.ctx.local.has(table)) return;
    this.buckets[at.statement].push({
      table,
      access,
      route: at.macro ? 'macro' : route,
      statement: at.statement,
      line: at.line,
      snippet: at.snippet,
      ...(at.macro ? { macro: at.macro } : {}),
      ...extra,
    });
  }

  /** A dynamic target: a table when the source closes it, a statement plus possible targets when it does not. */
  target(at: Anchor, expression: string, access: DependencyAccess, route: DependencyRoute): void {
    const resolution = resolveValue(expression, this.ctx);
    const names = [...new Set(resolution.values.map(nameIn).filter((n): n is string => n !== null))];
    if (resolution.closed && names.length > 0) {
      for (const name of names) this.table(at, name, access, route === 'open-sql' ? 'dynamic-sql' : route);
      return;
    }
    this.unresolved.push({
      statement: at.statement,
      line: at.line,
      snippet: at.snippet,
      expression: expression.trim(),
      access,
      origin: resolution.origin,
      possible: names,
    });
    for (const name of names) {
      this.table(at, name, access, route === 'open-sql' ? 'dynamic-sql' : route, {
        possibleTargetOf: expression.trim().toUpperCase(),
      });
    }
  }
}

/**
 * `FROM kna1`, `JOIN knb1`, `FROM (lc_tab)` — the parts of a SELECT's source list.
 *
 * *Where* the source list stands is decided on the code, not on the text. The
 * FROM matcher used to run over the statement as written, so `SELECT 'FROM
 * KNA1' AS note FROM vbak INTO TABLE @DATA(rows).` took its first match from
 * inside the literal: the signed analysis recorded a table called `KNA1'` and
 * never reached VBAK at all (full review of b88c77b4b5d1, ff270c376162). The
 * *contents* of the area are still read from the original text, because
 * `FROM ('KNA1')` names its table in a literal on purpose (R07).
 */
function readSelect(text: string, at: Anchor, sink: Sink): void {
  const code = codeOnly(text);
  const fromMatch = /\b(FROM\s+)([\s\S]+?)(?:\b(?:INTO|WHERE|ORDER|GROUP|UP|HAVING|UNION|FOR)\b|$)/i.exec(code);
  if (!fromMatch) return;
  const areaStart = fromMatch.index + fromMatch[1].length;
  const tableArea = text.slice(areaStart, areaStart + fromMatch[2].length).trim();
  const parts = tableArea.split(/\b(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\b/i);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith('(')) {
      const inner = parenthesised(trimmed, 0);
      if (inner !== null && inner.trim()) sink.target(at, inner, 'read', 'open-sql');
      continue;
    }
    const tableName = trimmed.split(/\s+/)[0]?.replace(/[~,]/g, '').trim();
    if (!tableName) continue;
    // `FROM @lt_items AS item` reads an internal table, and the `@` is how ABAP
    // says so. The prefix went through to the sink, which emitted a database
    // dependency on a table called `@LT_ITEMS` (aed161f810fc / 0129bc9ea03d).
    if (tableName.startsWith('@')) continue;
    // A common table expression names itself with a leading `+`; it is a query,
    // not a repository object.
    if (tableName.startsWith('+')) continue;
    sink.table(at, tableName, 'read', 'open-sql', {}, true);
  }
}

/** `MODIFY (p_tab) FROM …`, `DELETE FROM (lv_tab) WHERE …` — the DML forms with a dynamic target. */
function readDynamicWrite(text: string, code: string, at: Anchor, sink: Sink): void {
  const dml = /^(?:MODIFY|UPDATE|INSERT(?:\s+INTO)?|DELETE(?:\s+FROM)?)\s*\(/i.exec(code.trim());
  if (!dml || isInternalTableOperation(code)) return;
  const offset = text.length - text.trimStart().length;
  const inner = parenthesised(text, offset + dml[0].length - 1);
  if (inner !== null && inner.trim()) sink.target(at, inner, 'write', 'open-sql');
}

/**
 * A SQL string literal's content, blanked, offsets kept.
 *
 * The literal rule of the host language stops at the template's bars; inside
 * them the text is SQL, and SQL has literals of its own. Without this,
 * `SELECT 'FROM KNA1' AS note FROM VBAK` recorded KNA1 — a table the statement
 * does not touch — in the signed dependency list (full review of b88c77b4b5d1,
 * 85107975930e / 758eb4151eb0). Double-quoted identifiers stay, because a
 * quoted `"KNA1"` is the table.
 */
function maskSqlLiterals(sql: string): string {
  let out = '';
  let inLiteral = false;
  for (const ch of sql) {
    if (ch === "'") { inLiteral = !inLiteral; out += ch; continue; }
    out += inLiteral ? ' ' : ch;
  }
  return out;
}

/** The names a `WITH … AS ( … )` declares: queries of this statement, not repository objects. */
function sqlCteNames(bare: string): Set<string> {
  const names = new Set<string>();
  if (!/^WITH\b/i.test(bare)) return names;
  for (const m of bare.matchAll(/(?:^WITH|,)\s*"?([\w/+]+)"?\s+AS\s*\(/gi)) names.add(m[1].toUpperCase());
  return names;
}

/** The SQL text an ADBC call executes, read for the tables it names (R13b a). */
function readSqlText(sql: string, at: Anchor, sink: Sink, possibleTargetOf?: string): void {
  const s = sql.replace(/\s+/g, ' ').trim();
  const bare = maskSqlLiterals(s);
  const cte = sqlCteNames(bare);
  const found: Array<{ raw: string; access: DependencyAccess }> = [];
  const write = /^(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM|DELETE|UPSERT|REPLACE|MERGE\s+INTO)\s+([^\s(]+)/i.exec(bare);
  if (write) found.push({ raw: write[1], access: 'write' });
  // A data-modifying statement reads as well as writes: `INSERT INTO ZCACHE
  // SELECT * FROM KNA1` used to report the write and nothing else, so every
  // finding the standard-table read carries was missing (d51635e5771b /
  // 01c14cfb1ee0). The scan starts behind the write clause, or the `FROM` of a
  // `DELETE FROM` would be read a second time as a source.
  const sources = write
    ? bare.slice(write.index + write[0].length)
    : /^(?:SELECT|WITH)\b/i.test(bare) ? bare : '';
  for (const m of sources.matchAll(/\b(?:FROM|JOIN)\s+([^\s,()]+)/gi)) found.push({ raw: m[1], access: 'read' });
  for (const { raw, access } of found) {
    if (cte.has(raw.replace(/["';]/g, '').toUpperCase())) continue;
    const name = raw.replace(/["';]/g, '').split('.').pop() ?? '';
    if (name.includes(EMBEDDED) || !/^[A-Z_/][A-Z0-9_/]+$/i.test(name)) {
      sink.unresolved.push({
        statement: at.statement,
        line: at.line,
        snippet: at.snippet,
        expression: raw.split(EMBEDDED).join('{ … }'),
        access,
        origin: 'expression',
        possible: [],
      });
      continue;
    }
    sink.table(at, name, access, 'adbc', possibleTargetOf ? { possibleTargetOf } : {});
  }
}

function readAdbc(text: string, code: string, at: Anchor, sink: Sink, ctx: Context): void {
  if (!ctx.adbc) return;
  const call = /->\s*EXECUTE_(UPDATE|QUERY|DDL)\s*\(/i.exec(code);
  if (!call) return;
  const method = `EXECUTE_${call[1].toUpperCase()}`;
  sink.adbc.push({ statement: at.statement, line: at.line, snippet: at.snippet, method });
  if (method === 'EXECUTE_DDL') return;

  const argument = parenthesised(text, call.index + call[0].length - 1);
  if (argument === null) return;
  const expression = argument.trim().replace(/^EXPORTING\s+/i, '').replace(/^STATEMENT\s*=\s*/i, '').trim();
  const access: DependencyAccess = method === 'EXECUTE_QUERY' ? 'read' : 'write';

  const direct = literalChainText(expression);
  if (direct !== null) {
    readSqlText(direct, at, sink);
    return;
  }
  // The SQL text is in a variable: read what the source assigns to it. One
  // literal assignment is the statement; several are each a possible one; any
  // other assignment, or none, leaves it unread.
  const assigned = ctx.assignments.get(expression.toUpperCase()) ?? [];
  const texts = assigned.map(literalChainText);
  if (assigned.length === 0 || texts.some((t) => t === null)) {
    sink.unresolved.push({
      statement: at.statement,
      line: at.line,
      snippet: at.snippet,
      expression,
      access,
      origin: ctx.parameters.has(expression.toUpperCase()) ? 'selection-screen' : 'expression',
      possible: [],
    });
    return;
  }
  for (const sql of texts as string[]) {
    readSqlText(sql, at, sink, texts.length > 1 ? expression.toUpperCase() : undefined);
  }
}

/**
 * Every SELECT a statement contains, each as its own slice.
 *
 * `readSelect` reads one source list, so a statement holding more than one
 * query has to be cut into one slice per query — and a statement holds more
 * than one query far more often than "a `WITH` common table expression, the
 * query of an `OPEN CURSOR … FOR SELECT`", which is all this used to be asked
 * for. `readStatement` called `readSelect` exactly once for an ordinary SELECT,
 * and `readSelect` ends its FROM area at `WHERE` and at `UNION`. So
 *
 *     SELECT … FROM mara WHERE EXISTS ( SELECT … FROM kna1 … )
 *     SELECT … FROM vbak UNION SELECT … FROM vbrk
 *
 * reported MARA without KNA1 and VBAK without VBRK: tables the statement really
 * reads, absent from the signed dependency list and from every finding drawn on
 * it (QA full review, 67ac19222d96). Under-reporting is the one direction this
 * engine may not take — `open-sql-discrimination.ts` :15-17 errs towards
 * over-reporting on purpose — and a subquery is no exotic form.
 *
 * Cut on the code, so a SELECT written in a literal or a comment opens nothing.
 * `SELECT-OPTIONS` is excluded explicitly: `\bSELECT\b` matches inside it,
 * because a hyphen is a word boundary, and it declares a selection-screen field
 * rather than reading a table.
 */
function embeddedSelects(text: string, code: string): string[] {
  const starts = [...code.matchAll(/\bSELECT\b(?!-)/gi)].map((m) => m.index);
  return starts.map((from, i) => text.slice(from, starts[i + 1] ?? text.length));
}

/** One statement — or, for a macro call, the statements it expands to. */
function readStatement(text: string, at: Anchor, sink: Sink, ctx: Context, depth: number): void {
  const code = codeOnly(text);
  const bare = code.trim();

  // Not every ABAP SQL read is a statement that begins with SELECT. A common
  // table expression begins with WITH and a cursor with OPEN CURSOR, and both
  // were passed over in silence: the tables they read were absent from the
  // dependency list and from every finding drawn on it (full review of
  // b88c77b4b5d1, c220db0d6f55 / 684fc78b1f35 / 6eecc0b3ec97).
  //
  // And not every ABAP SQL read of a statement is its *first* SELECT: a
  // subquery in the WHERE clause (`EXISTS`, `IN`, a comparison) and the second
  // arm of a `UNION` are queries of their own inside a statement that does begin
  // with SELECT (67ac19222d96). Every SELECT is therefore read wherever it
  // stands — in a SELECT, in a `WITH`, in an `OPEN CURSOR`, and in the WHERE
  // clause of an UPDATE or a DELETE, which ABAP SQL allows a subquery in too.
  for (const part of embeddedSelects(text, code)) readSelect(part, at, sink);

  const write = databaseWriteIn(text.trim());
  if (write) sink.table(at, write.table, 'write', 'open-sql');
  readDynamicWrite(text, code, at, sink);

  readAdbc(text, code, at, sink, ctx);

  const declared = /^(TABLES|NODES)\b\s*:?\s*(.*)$/i.exec(bare);
  if (declared) {
    const route: DependencyRoute = declared[1].toUpperCase() === 'NODES' ? 'logical-database' : 'type-reference';
    for (const part of declared[2].split(',')) {
      const name = /^\*?([\w/]+)/.exec(part.trim())?.[1];
      if (name) sink.table(at, name, 'reference', route);
    }
  }

  const get = /^GET\s+([\w/]+)(?:\s+LATE)?(?:\s+FIELDS\b.*)?$/i.exec(bare);
  if (get && ctx.nodes.has(get[1].toUpperCase())) sink.table(at, get[1], 'read', 'logical-database');

  const include = /^INCLUDE\s+(STRUCTURE|TYPE)\s+([\w/]+)/i.exec(bare);
  if (include && !ctx.localTypes.has(include[2].toUpperCase())) {
    sink.table(at, include[2], 'reference', 'type-reference');
  }

  // `TYPE kna1-kunnr` and `FOR kna1-kunnr`: a component selector proves a structure.
  const componentTypes = [...bare.matchAll(/\bTYPE\s+([\w/]+)-[\w/]/gi)].map((m) => m[1]);
  if (/^(SELECT-OPTIONS|RANGES)\b/i.test(bare)) {
    componentTypes.push(...[...bare.matchAll(/\bFOR\s+([\w/]+)-[\w/]/gi)].map((m) => m[1]));
  }
  for (const name of componentTypes) {
    if (!isRepositoryStructureName(name.toUpperCase(), ctx)) continue;
    sink.table(at, name, 'reference', 'type-reference');
  }

  // `CREATE DATA lr TYPE (p_type)` and RTTI by name: a type named at runtime.
  const createData = /^CREATE\s+DATA\b.*?\bTYPE\s+(?:(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+|LINE\s+OF\s+)?\(/i.exec(bare);
  if (createData) {
    const inner = parenthesised(text, text.length - text.trimStart().length + createData[0].length - 1);
    if (inner !== null && inner.trim()) typeTarget(inner, at, sink, ctx);
  }
  const rtti = /=>\s*DESCRIBE_BY_NAME\s*\(/i.exec(code);
  if (rtti) {
    const inner = parenthesised(text, rtti.index + rtti[0].length - 1);
    const argument = inner?.trim().replace(/^EXPORTING\s+/i, '').replace(/^P_NAME\s*=\s*/i, '').trim();
    if (argument) typeTarget(argument, at, sink, ctx);
  }

  // `ASSIGN ('(SAPMV45A)VBAK-VBELN') TO <fs>` — another program's global data object.
  const assign = /^ASSIGN\s*\(/i.exec(bare);
  if (assign) {
    const inner = parenthesised(text, text.length - text.trimStart().length + assign[0].length - 1);
    const resolution = inner ? resolveValue(inner, ctx) : null;
    if (resolution?.closed) {
      for (const value of resolution.values) {
        const global = /^\(([\w/]+)\)([\w/]+)-[\w/]/.exec(value.trim().toUpperCase());
        if (global) sink.table(at, global[2], 'reference', 'program-global', { program: global[1] });
      }
    }
  }

  // A macro call: the body, with its placeholders filled, at this call site.
  if (depth < 4) {
    const call = /^([\w/-]+)\s*(:?)\s*(.*)$/.exec(text.trim());
    const body = call ? ctx.macros.get(call[1].toUpperCase()) : undefined;
    if (call && body) {
      const argumentLists = call[2] ? splitTopLevel(call[3], ',') : [call[3]];
      const cost = argumentLists.length * body.length;
      if (ctx.budget.left < cost) {
        sink.unresolved.push({
          statement: at.statement,
          line: at.line,
          snippet: at.snippet,
          expression: call[1].toUpperCase(),
          access: 'read',
          origin: 'expression',
          possible: [],
        });
        return;
      }
      ctx.budget.left -= cost;
      for (const list of argumentLists) {
        const args = splitTopLevel(list, ' ').filter(Boolean);
        for (const statement of body) {
          const expanded = statement.replace(/&([1-9])/g, (_x, n: string) => args[Number(n) - 1] ?? '');
          readStatement(expanded, { ...at, macro: at.macro ?? call[1].toUpperCase() }, sink, ctx, depth + 1);
        }
      }
    }
  }
}

function typeTarget(expression: string, at: Anchor, sink: Sink, ctx: Context): void {
  const resolution = resolveValue(expression, ctx);
  const names = resolution.values.map(nameIn).filter((n): n is string => n !== null);
  // A type the program declares itself is no repository dependency (CC-019).
  if (resolution.closed && names.every((n) => ctx.localTypes.has(n))) return;
  sink.target(at, expression, 'reference', 'type-reference');
}

/** Split at a separator that is code and not inside parentheses. */
function splitTopLevel(text: string, separator: ',' | ' '): string[] {
  const outside = createLiteralScanner();
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    const code = outside(ch);
    if (code && ch === '(') depth += 1;
    if (code && ch === ')') depth = Math.max(0, depth - 1);
    const splits = separator === ' ' ? /\s/.test(ch) : ch === ',';
    if (code && depth === 0 && splits) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * `DATA ls_row TYPE zcc_log_row` where `ls_row-mandt` is used: the component
 * selector is what shows the type is a structure. Without one, `TYPE kunnr` is
 * as likely a data element as a table, and a data element is not a table.
 */
function readTypedDataObjects(ctx: Context, sink: Sink): void {
  const used = ctx.code.filter((_c, i) => !ctx.inMacroBody[i]).join(' ');
  ctx.code.forEach((code, i) => {
    if (ctx.inMacroBody[i]) return;
    // The fields of a local structure are no data objects of their own — a
    // `message TYPE char255` inside `TYPES: BEGIN OF` is never written
    // `message-…`, and where a word like it is (`MESSAGE-ID`), it is a keyword.
    if (/^\s*TYPES\b/i.test(code) || /\bBEGIN\s+OF\b/i.test(code)) return;
    const statement = ctx.statements[i];
    const pattern = /(<[\w/]+>|VALUE\(\s*[\w/]+\s*\)|REFERENCE\(\s*[\w/]+\s*\)|[\w/]+)\s+TYPE\s+([\w/]+)(?![\w/(-]|\s*=>)/gi;
    for (const m of code.matchAll(pattern)) {
      const type = m[2].toUpperCase();
      if (!isRepositoryStructureName(type, ctx)) continue;
      const variable = m[1].replace(/^(?:VALUE|REFERENCE)\(\s*/i, '').replace(/\s*\)$/, '');
      if (/^(?:TYPES|TYPE|DATA|CLASS-DATA|STATICS|CONSTANTS|PARAMETERS)$/i.test(variable)) continue;
      const escaped = variable.replace(/[<>/]/g, (c) => `\\${c}`);
      const component = new RegExp(`(?<![\\w/<-])${escaped}(?:-[\\w/]+)+`, 'gi');
      const selected = [...used.matchAll(component)].some((hit) => !HYPHENATED_KEYWORDS.has(hit[0].toUpperCase()));
      if (!selected) continue;
      sink.table({ statement: i, line: statement.line, snippet: statement.text }, type, 'reference', 'type-reference');
    }
  });
}

/** Keywords written with a hyphen. `REPORT z MESSAGE-ID zz` selects no component of a data object called `message`. */
const HYPHENATED_KEYWORDS = new Set([
  'MESSAGE-ID', 'LINE-SIZE', 'LINE-COUNT', 'NO-GAP', 'NO-ZERO', 'NO-SIGN', 'NO-GROUPING',
  'NO-DISPLAY', 'NO-EXTENSION', 'USER-COMMAND', 'PF-STATUS', 'READ-ONLY', 'SELECTION-SCREEN',
  'START-OF-SELECTION', 'END-OF-SELECTION', 'TOP-OF-PAGE', 'END-OF-PAGE', 'LINE-SELECTION',
  'VALUE-REQUEST', 'HELP-REQUEST', 'OUTPUT-LENGTH', 'EXIT-COMMAND', 'CURSOR-SELECTION',
]);

/**
 * SAP type groups whose types are named `<group>_<name>` — `slis_fieldcat_alv`
 * is a type of the type group SLIS, not a dictionary structure, and a type
 * group is not a table. The source's own `TYPE-POOLS` statement adds to these.
 */
const KNOWN_TYPE_GROUPS = [
  'ABAP', 'CNTL', 'CXTAB', 'ICON', 'KKBLO', 'OLE2', 'RSDS', 'SDYDO', 'SLIS', 'SSCR',
  'STREE', 'SWFCO', 'SYDES', 'SZADR', 'TRWBO', 'VRM',
];

/** A name that can stand for a dictionary structure or table: not ABAP's own, not local, not a type group's. */
function isRepositoryStructureName(name: string, ctx: Context): boolean {
  if (NOT_A_REPOSITORY_TYPE.has(name) || SYSTEM_STRUCTURES.has(name)) return false;
  if (ctx.localTypes.has(name) || ctx.local.has(name)) return false;
  return !ctx.typeGroups.some((group) => name.startsWith(`${group}_`));
}

export function readTableDependencies(source: string): TableDependencyReport {
  const ctx = buildContext(source);
  const sink = new Sink(ctx);

  ctx.statements.forEach((statement, i) => {
    if (ctx.inMacroBody[i]) return;
    const text = statement.text;
    if (!text.trim()) return;
    readStatement(text, { statement: i, line: statement.line, snippet: text.trim() }, sink, ctx, 0);
  });
  readTypedDataObjects(ctx, sink);

  return {
    dependencies: sink.buckets.flat(),
    unresolved: [...sink.unresolved].sort((a, b) => a.statement - b.statement),
    adbc: sink.adbc,
  };
}
