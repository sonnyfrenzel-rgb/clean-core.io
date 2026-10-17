import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { containerAt, readBlocks } from './block-structure';
import { readControlFlowFrom, type Branch } from './control-flow';
import { readGoldenMaster } from '../transformation/golden-master';

/**
 * The demo switches of a program (roadmap 3.0.13, SD review of
 * ZSD_RETURN_CREDIT_RECON, 14.10.2026, CR-A3).
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

/** The demo switches of one source, or null when it declares no demo flag. */
export function readDemoSwitches(source: string): DemoSwitches | null {
  let statements: AbapStatement[];
  try {
    statements = readStatements(source);
  } catch {
    return null;
  }
  const parameters = new Map<string, number>();
  for (const s of statements) {
    const m = PARAMETER.exec(s.text);
    if (m) parameters.set(norm(m[1]), s.lineStart);
  }
  const flagName = [...parameters.keys()].find((name) => DEMO_NAME.test(name));
  if (!flagName) return null;
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
    }
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
  const demo = new Set<string>();
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

/** Is this field (as a condition writes it) the demo flag or a case selector? */
export function isDemoSubject(demo: DemoSwitches | null, subject: string | null | undefined): boolean {
  if (!demo || !subject) return false;
  const n = norm(subject);
  return n === demo.flag.name || demo.selectors.includes(n);
}
