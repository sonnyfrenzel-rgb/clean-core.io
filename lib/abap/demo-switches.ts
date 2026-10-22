import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { containerAt, readBlocks } from './block-structure';
import { readControlFlowFrom, type Branch } from './control-flow';
import { readGoldenMaster } from '../transformation/golden-master';
import { APP_VERSION } from '../version';
import { engineReads3020Apply } from './engine-reads-3020-gate';

/**
 * The demo switches of a program (roadmap 3.0.13, SD review, 14.10.2026,
 * CR-A3).
 *
 * A program written to be tried out carries its own test data and a selection
 * parameter that picks a variation of it: `P_DEMO` on, `P_CASE` 0..31, and an
 * `APPLY_DEMO_CASE` routine with `CASE p_case. WHEN 1. … WHEN 31. … ENDCASE`.
 * Thirty-one of the reviewed program's 73 register entries were those arms —
 * test data, not decisions a business could keep, change or drop.
 *
 * What counts, read off the structure, never off a routine name alone:
 *
 *   1. the **demo flag**: a selection-screen parameter whose name says demo
 *      (`P_DEMO`, `PA_DEMO_MODE`) — the only place a name is read, because a
 *      program says it runs on demo data nowhere else;
 *   2. the **demo routines**: FORMs performed only where that flag is on — the
 *      `IF p_demo = 'X'` arm, or the `ELSE` of `IF p_demo <> 'X'` (a constant
 *      holding `'X'` counts as `'X'`), and FORMs performed only from those;
 *   3. the **case selectors**: a selection parameter (or a field the source
 *      assigns from one, `gs_sel-case_no = p_case`) that a `CASE` in a demo
 *      routine branches on, every `WHEN` an integer literal, three arms at least.
 *
 * Without a demo flag nothing here is read: a `CASE` on a number is a business
 * rule in any program that does not say it runs on demo data.
 *
 * Roadmap 3.0.17 item 8 (owner 17.10.2026, from the QM acceptance program: 31
 * rules of the form "CASE p_case has 32 branches; this one is for 1"). Step 2
 * reads the call structure, and a program can perform its case routine where
 * the flag is not tested — after the `IF`, or with the flag checked only as
 * `IF p_demo <> 'X'. MESSAGE … ENDIF.` and no `ELSE`. So where a demo flag is
 * declared, the golden master's case switch counts as well
 * (`readGoldenMaster`, the recognition the transformation carries the demo
 * cases with, by shape: a `CASE` on a selection parameter whose integer arms
 * change the tables a baseline routine builds from literals). Its selector is
 * a case selector, its case routine and baseline are demo routines, wherever
 * they are performed. The demo flag stays required.
 *
 * Pure: the statement reader and the block structure, no I/O.
 */

export interface DemoSwitches {
  /** The demo flag parameter, upper-cased, with its line. */
  flag: { name: string; line: number };
  /** FORMs performed only where the demo flag is on, upper-cased. */
  routines: string[];

  /** Fields that pick a demo case: the parameter and what is assigned from it, upper-cased. */
  selectors: string[];
  /** The demo-case `CASE` constructs, with their number of `WHEN` arms. */
  cases: Array<SourceRange & { selector: string; arms: number; routine: string }>;
}

const PARAMETER = /^(?:PARAMETERS|PARAMETER)\s+([\w/]+)/i;
const DEMO_NAME = /DEMO/i;
const INTEGER_ARM = /^WHEN\s+-?\d+(?:\s+OR\s+-?\d+)*\s*$/i;

const norm = (name: string) => name.trim().toUpperCase();

/**
 * The demo switches of one source, or null when it declares no demo flag.
 *
 * From engine 3.0.20 (`ENGINE_READS_3020_FROM`; owner report 21.10.2026, a
 * goods-receipt / invoice check whose "Case negative or above 31" stood first
 * in its rules card and whose first process step was its own demo cases) two
 * more shapes count:
 *
 *   4. a FORM that **opens with a guard on the demo flag** — `IF p_demo =
 *      abap_false. RETURN. ENDIF.` or `CHECK p_demo = abap_true.` before any
 *      other statement — is a demo routine wherever it is performed: its whole
 *      body runs only with the flag on;
 *   5. without a demo flag, a **test data switch by shape**: a `CASE` on a
 *      selection parameter with at least five integer `WHEN` arms, each of
 *      which only fills data from literals (an assignment of a literal, a
 *      `VALUE` of literals, `APPEND` of such a row into an internal table,
 *      `CLEAR`) and at least half of which fill a table. A routine call never
 *      counts (owner decision 22.10.2026). The parameter then stands as the switch.
 *
 * `engineVersion` is the engine the reading is made for; an older one reads as before.
 */
export function readDemoSwitches(source: string, engineVersion: string | null = APP_VERSION): DemoSwitches | null {
  let statements: AbapStatement[];
  try {
    statements = readStatements(source);
  } catch {
    return null;
  }
  const reads3020 = engineReads3020Apply(engineVersion);
  const parameters = new Map<string, number>();
  for (const s of statements) {
    const m = PARAMETER.exec(s.text);
    if (m) parameters.set(norm(m[1]), s.lineStart);
  }
  const flagName = [...parameters.keys()].find((name) => DEMO_NAME.test(name));
  if (!flagName) return reads3020 ? testDataSwitchByShape(statements, parameters) : null;
  const flag = { name: flagName, line: parameters.get(flagName)! };

  // Constants holding 'X' (or abap_true) stand for 'X' in a flag test.
  const truthy = new Set(['ABAP_TRUE']);
  const falsy = new Set(['ABAP_FALSE', 'SPACE']);
  for (const s of statements) {
    const c = /^CONSTANTS\s+([\w/]+)\s+(?:TYPE|LIKE)\s+[\s\S]*?\bVALUE\s+('X'|abap_true|space|abap_false|' ')\s*$/i.exec(s.text);
    if (!c) continue;
    (/^(?:'X'|abap_true)$/i.test(c[2]) ? truthy : falsy).add(norm(c[1]));
  }
  const isTrue = (v: string) => truthy.has(norm(v)) || /^'X'$/i.test(v.trim());
  const isFalse = (v: string) => falsy.has(norm(v)) || /^'\s*'$/.test(v.trim()) || /^``$/.test(v.trim());

  const structure = readBlocks(statements);
  const { branches } = readControlFlowFrom(statements, structure);
  const flagRe = new RegExp(`^(NOT\\s+)?${flagName.replace(/[/]/g, '\\/')}\\s*(=|<>|EQ|NE)\\s*(\\S+)$`, 'i');
  const flagInitial = new RegExp(`^${flagName.replace(/[/]/g, '\\/')}\\s+IS\\s+(NOT\\s+)?INITIAL$`, 'i');
  /** Statement index ranges (exclusive end) where the flag is on. */
  const onRanges: Array<[number, number]> = [];
  /** 3.0.20, shape 4: FORMs whose body runs only with the flag on, and the statement range after their guard. */
  const guardedForms = new Map<string, [number, number]>();
  for (const branch of branches) {
    if (branch.kind !== 'if' || !branch.terminated) continue;
    const head = branch.arms[0];
    const cond = head.condition.trim().replace(/\s+/g, ' ');
    let onWhenTrue: boolean | null = null;
    const m = flagRe.exec(cond);
    if (m) {
      const equal = /^(?:=|EQ)$/i.test(m[2]);
      const value = isTrue(m[3]) ? true : isFalse(m[3]) ? false : null;
      if (value !== null) onWhenTrue = (equal === value) !== !!m[1];
    } else {
      const i = flagInitial.exec(cond);
      if (i) onWhenTrue = !!i[1];
    }
    if (onWhenTrue === null) continue;
    const ifEnd = branch.arms[1]?.headerIndex ?? branch.closeIndex;
    if (onWhenTrue) onRanges.push([head.headerIndex + 1, ifEnd]);
    else {
      const otherwise = branch.arms.find((a) => a.kind === 'else');
      if (otherwise && branch.arms.length === 2) onRanges.push([otherwise.headerIndex + 1, branch.closeIndex]);
      else if (reads3020 && branch.arms.length === 1) {
        // 3.0.20, shape 4: `IF <flag off>. RETURN. ENDIF.` opening a FORM.
        const body = statements.slice(head.headerIndex + 1, branch.closeIndex);
        const leaves = body.length > 0 && body.every((s) => LEAVE_OR_SAY.test(s.keyword)) && body.some((s) => LEAVE.test(s.keyword));
        const form = leaves ? openingGuardOf(statements, structure, branch.openIndex) : null;
        if (form) guardedForms.set(form.name, [branch.closeIndex + 1, form.endIndex]);
      }
    }
  }
  if (reads3020) {
    // 3.0.20, shape 4: `CHECK <flag on>.` opening a FORM.
    statements.forEach((s, i) => {
      if (s.keyword.toUpperCase() !== 'CHECK') return;
      const m = flagRe.exec(s.text.replace(/^CHECK\s+/i, '').replace(/\.\s*$/, '').trim().replace(/\s+/g, ' '));
      if (!m) return;
      const equal = /^(?:=|EQ)$/i.test(m[2]);
      const value = isTrue(m[3]) ? true : isFalse(m[3]) ? false : null;
      if (value === null || (equal === value) === !!m[1]) return;
      const form = openingGuardOf(statements, structure, i);
      if (form) guardedForms.set(form.name, [i + 1, form.endIndex]);
    });
    for (const range of guardedForms.values()) onRanges.push(range);
  }
  if (onRanges.length === 0) return withCaseRoutine({ flag, routines: [], selectors: [], cases: [] }, source, branches, parameters);

  // Where each FORM is performed.
  const performedAt = new Map<string, number[]>();
  for (const s of statements) {
    if (s.keyword !== 'PERFORM') continue;
    const m = /^PERFORM\s+([\w/]+)/i.exec(s.text);
    if (!m || /\bIN\s+PROGRAM\b/i.test(s.text)) continue;
    const name = norm(m[1]);
    performedAt.set(name, [...(performedAt.get(name) ?? []), s.index]);
  }
  const forms = new Map(structure.containers.filter((c) => c.kind === 'form').map((c) => [c.name, c]));
  const routineOf = (index: number) => containerAt(structure.containers, statements[index].lineStart);
  const demo = new Set<string>(guardedForms.keys());
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, sites] of performedAt) {
      if (demo.has(name) || !forms.has(name) || sites.length === 0) continue;
      const allDemo = sites.every((i) => {
        if (onRanges.some(([from, to]) => i >= from && i < to)) return true;
        const at = routineOf(i);
        return !!at && at.kind === 'form' && demo.has(at.name);
      });
      if (allDemo) {
        demo.add(name);
        changed = true;
      }
    }
  }
  if (demo.size === 0) return withCaseRoutine({ flag, routines: [], selectors: [], cases: [] }, source, branches, parameters);

  // Selection parameters other than the flag, and the fields assigned from them.
  const fromParameter = new Map<string, string>();
  for (const s of statements) {
    const a = /^([\w/]+(?:-[\w/]+)*)\s*=\s*([\w/]+)\s*$/.exec(s.text);
    if (a && parameters.has(norm(a[2])) && norm(a[2]) !== flagName) fromParameter.set(norm(a[1]), norm(a[2]));
  }
  const selectorParameter = (name: string): string | null => {
    const n = norm(name);
    if (parameters.has(n) && n !== flagName) return n;
    return fromParameter.get(n) ?? null;
  };
  const cases: DemoSwitches['cases'] = [];
  const selectors = new Set<string>();
  for (const branch of branches) {
    if (branch.kind !== 'case' || !branch.selector) continue;
    const routine = routineOf(branch.openIndex);
    if (!routine || routine.kind !== 'form' || !demo.has(routine.name)) continue;
    const parameter = selectorParameter(branch.selector);
    if (!parameter) continue;
    const whens = branch.arms.filter((a) => a.kind === 'when');
    if (whens.length < 3) continue;
    if (!whens.every((a) => INTEGER_ARM.test(statements[a.headerIndex].text.replace(/\s+/g, ' ').trim()))) continue;
    selectors.add(parameter);
    selectors.add(norm(branch.selector));
    cases.push({ selector: norm(branch.selector), arms: whens.length, routine: routine.name, lineStart: branch.lineStart, lineEnd: branch.lineEnd });
  }
  // Every field assigned from a selector parameter selects a case too.
  for (const [field, parameter] of fromParameter) if (selectors.has(parameter)) selectors.add(field);
  return withCaseRoutine({ flag, routines: [...demo].sort(), selectors: [...selectors].sort(), cases }, source, branches, parameters);
}

/**
 * Roadmap 3.0.17 item 8: add the golden master's case switch to what the call
 * structure found (see the file comment). Null when neither found anything —
 * the answer `readDemoSwitches` gave such a source before.
 */
function withCaseRoutine(
  found: DemoSwitches,
  source: string,
  branches: Branch[],
  parameters: Map<string, number>,
): DemoSwitches | null {
  const none = found.routines.length === 0 ? null : found;
  const gm = readGoldenMaster(source);
  const parameter = gm?.switchParameter ?? null;
  if (!gm || !parameter || parameter === found.flag.name || !parameters.has(parameter) || gm.cases.length < 3) return none;
  const firstArm = gm.cases[0].lineStart;
  const branch = branches.find(
    (b) => b.kind === 'case' && !!b.selector && norm(b.selector) === gm.switchOperand && b.lineStart <= firstArm && b.lineEnd >= firstArm,
  );
  // Found by the call structure already: nothing to add.
  if (!branch || found.cases.some((c) => c.lineStart === branch.lineStart)) return none;
  const selectors = new Set([...found.selectors, parameter, gm.switchOperand]);
  for (const [field, from] of Object.entries(gm.aliases)) if (from === parameter) selectors.add(field);
  const routines = new Set([...found.routines, gm.caseRoutine.name, gm.baseRoutine.name].filter(Boolean).map(norm));
  const arms = branch.arms.filter((a) => a.kind === 'when').length;
  return {
    flag: found.flag,
    routines: [...routines].sort(),
    selectors: [...selectors].sort(),
    cases: [
      ...found.cases,
      { selector: gm.switchOperand, arms, routine: norm(gm.caseRoutine.name || branch.container || ''), lineStart: branch.lineStart, lineEnd: branch.lineEnd },
    ],
  };
}

/* ---------------------------------------------------- 3.0.20, shapes 4 and 5 */

const LEAVE = /^(?:RETURN|EXIT|LEAVE)$/i;
const LEAVE_OR_SAY = /^(?:RETURN|EXIT|LEAVE|MESSAGE)$/i;
const DECLARATION = /^(?:DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|STATICS|TABLES|RANGES)$/i;

/**
 * The FORM a guard at `index` opens: the guard stands in the FORM's own body
 * (no block around it) and only declarations come before it. Null otherwise.
 */
function openingGuardOf(
  statements: readonly AbapStatement[],
  structure: ReturnType<typeof readBlocks>,
  index: number,
): { name: string; endIndex: number } | null {
  if ((structure.enclosing[index] ?? []).some((b) => b.kind !== 'form')) return null;
  const form = containerAt(structure.containers, statements[index].lineStart);
  if (!form || form.kind !== 'form') return null;
  const open = statements.findIndex((s) => s.lineStart >= form.lineStart && /^FORM$/i.test(s.keyword));
  if (open < 0 || open >= index) return null;
  for (let i = open + 1; i < index; i += 1) if (!DECLARATION.test(statements[i].keyword)) return null;
  let end = index;
  while (end + 1 < statements.length && statements[end + 1].lineStart <= form.lineEnd) end += 1;
  return { name: form.name, endIndex: end };
}

/** A value test data is written with: a literal, a number, a truth value, today's date. */
const LITERAL = /^(?:'(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|abap_true|abap_false|space|sy-datum|sy-uzeit)$/i;

/**
 * The row an `APPEND` or `INSERT` puts into an internal table, or null when it
 * writes anything else — a database table (`INSERT ztab FROM ls`, `INSERT INTO
 * ztab VALUES ls`) or the lines of another table.
 */
function internalRowOf(text: string, keyword: string): string | null {
  if (keyword === 'APPEND') {
    const m = /^APPEND\s+([\s\S]+?)\s+TO\s+[\w/<>-]+/i.exec(text);
    return m && !/^LINES\s+OF\b/i.test(m[1]) ? m[1].trim() : null;
  }
  if (/^INSERT\s+INTO\b/i.test(text)) return null;
  const m = /^INSERT\s+([\s\S]+?)\s+INTO\s+(?:TABLE\s+[\w/<>-]+|[\w/<>-]+\s+INDEX\b)/i.exec(text);
  return m && !/^LINES\s+OF\b/i.test(m[1]) ? m[1].trim() : null;
}

/** The variable an assignment or a `CLEAR` sets, without its component (`ls_row-matnr` → `LS_ROW`). */
function rootOf(name: string): string {
  return norm(name.split('-')[0]);
}

/** A row of literals: `VALUE #( a = 'x' b = 1 )` whose every value is a literal, or an empty line. */
function literalRow(row: string): boolean {
  if (/^INITIAL\s+LINE$/i.test(row)) return true;
  const value = /^VALUE\s+[\w#/]*\s*\(([\s\S]*)\)$/i.exec(row);
  if (!value) return false;
  // `BASE lt_rows ( … )` carries the rows of another table along: not a row of fixed values.
  if (/\bBASE\b/i.test(value[1])) return false;
  // Nothing but `field = literal` pairs in brackets: a row named without a field (`( gs_order )`) carries live data.
  let pairs = 0;
  const rest = value[1].replace(/[\w/-]+\s*=\s*('(?:[^']|'')*'|`[^`]*`|[^\s()]+)/g, (_m, v: string) => {
    pairs += 1;
    return LITERAL.test(v) ? ' ' : ' x ';
  });
  return pairs > 0 && /^[\s()]*$/.test(rest);
}

/**
 * A statement that only fills test data; `fills` when it puts a row of fixed values into a table.
 *
 * `filled` is what the same `WHEN` arm has set from literals so far: a row is
 * test data only when it is literal or one of those. Without it (the set-up
 * around the switch) any row into an internal table passes; a database write never does.
 *
 * A routine call is never test data here, whatever it is handed (owner decision
 * 22.10.2026): what a routine does with literals is not read off the call, and
 * every rule built to read it found another way for a business routine through.
 * A program whose demo cases are filled by a routine is read by its demo flag
 * (shapes 1 to 4), or not set apart.
 */
function testDataStatement(s: AbapStatement, filled: Set<string> | null = null): { ok: boolean; fills: boolean } {
  const text = s.text.replace(/\.\s*$/, '').trim();
  const keyword = s.keyword.toUpperCase();
  if (keyword === 'PERFORM') return { ok: false, fills: false };
  if (keyword === 'APPEND' || keyword === 'INSERT') {
    const row = internalRowOf(text, keyword);
    if (row === null) return { ok: false, fills: false };
    const ok = filled === null || literalRow(row) || filled.has(rootOf(row));
    return { ok, fills: ok };
  }
  if (keyword === 'CLEAR' || keyword === 'REFRESH' || keyword === 'FREE') {
    for (const name of text.replace(/^\S+\s*/, '').split(/[\s,:]+/)) if (name) filled?.add(rootOf(name));
    return { ok: true, fills: false };
  }
  const assign = /^([\w/<>-]+)\s*=\s*([\s\S]+)$/.exec(text);
  if (assign) {
    const value = assign[2].trim();
    const ok = LITERAL.test(value) || (/^VALUE\s+#\(/i.test(value) && (filled === null || literalRow(value)));
    // Only a whole row set from literals is filled: `ls_row-status = 'X'` fixes one field, the rest may come from a read.
    if (ok && !assign[1].includes('-')) filled?.add(rootOf(assign[1]));
    return { ok, fills: false };
  }
  return { ok: false, fills: false };
}

/** Shape 5: a test data switch without a demo flag (see `readDemoSwitches`). */
function testDataSwitchByShape(statements: AbapStatement[], parameters: Map<string, number>): DemoSwitches | null {
  if (parameters.size === 0) return null;
  const structure = readBlocks(statements);
  const { branches } = readControlFlowFrom(statements, structure);
  const fromParameter = new Map<string, string>();
  for (const s of statements) {
    const a = /^([\w/]+(?:-[\w/]+)*)\s*=\s*([\w/]+)\s*$/.exec(s.text);
    if (a && parameters.has(norm(a[2]))) fromParameter.set(norm(a[1]), norm(a[2]));
  }
  for (const branch of branches) {
    if (branch.kind !== 'case' || !branch.selector) continue;
    const selector = norm(branch.selector);
    const parameter = parameters.has(selector) ? selector : fromParameter.get(selector) ?? null;
    if (!parameter) continue;
    const whens = branch.arms.filter((a) => a.kind === 'when');
    if (whens.length < 5) continue;
    if (!whens.every((a) => INTEGER_ARM.test(statements[a.headerIndex].text.replace(/\s+/g, ' ').trim()))) continue;
    let filling = 0;
    const allTestData = branch.arms.every((arm, k) => {
      const to = branch.arms[k + 1]?.headerIndex ?? branch.closeIndex;
      const body = statements.slice(arm.headerIndex + 1, to);
      const filled = new Set<string>();
      const read = body.map((s) => testDataStatement(s, filled));
      if (read.some((r) => r.fills)) filling += arm.kind === 'when' ? 1 : 0;
      return read.every((r) => r.ok);
    });
    if (!allTestData || filling * 2 < whens.length) continue;
    const routine = containerAt(structure.containers, branch.lineStart);
    const selectors = new Set([parameter, selector]);
    for (const [field, from] of fromParameter) if (from === parameter) selectors.add(field);
    const names = [...selectors].map((n) => n.replace(/[/]/g, '\\/'));
    const onSelector = new RegExp(`(?<![\\w/-])(?:${names.join('|')})(?![\\w/])`, 'i');
    // The FORM is the switch's own only when everything else in it is set-up or a check of the switch.
    const ownFilled = new Set<string>();
    const own = !!routine && routine.kind === 'form' && statements.every((s, i) => {
      if (s.lineStart < routine.lineStart || s.lineStart > routine.lineEnd) return true;
      if (i >= branch.openIndex && i <= branch.closeIndex) return true;
      const keyword = s.keyword.toUpperCase();
      if (/^(?:FORM|ENDFORM|ENDIF|ELSE|MESSAGE|RETURN|EXIT)$/.test(keyword) || DECLARATION.test(keyword)) return true;
      if (keyword === 'IF' || keyword === 'ELSEIF' || keyword === 'CHECK') return onSelector.test(s.text);
      return testDataStatement(s, ownFilled).ok;
    });
    return {
      flag: { name: parameter, line: parameters.get(parameter)! },
      routines: own && routine ? [routine.name] : [],
      selectors: [...selectors].sort(),
      cases: [{ selector, arms: whens.length, routine: routine?.name ?? '', lineStart: branch.lineStart, lineEnd: branch.lineEnd }],
    };
  }
  return null;
}

/** Is this field (as a condition writes it) the demo flag or a case selector? */
export function isDemoSubject(demo: DemoSwitches | null, subject: string | null | undefined): boolean {
  if (!demo || !subject) return false;
  const n = norm(subject);
  return n === demo.flag.name || demo.selectors.includes(n);
}
