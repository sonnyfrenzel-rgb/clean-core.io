import { readFileSync } from 'fs';
import { join } from 'path';
import * as abaplint from '@abaplint/core';
import { readStatements } from '../../lib/abap/statement-reader';
import { readControlFlow } from '../../lib/abap/control-flow';
import { readCallGraph } from '../../lib/abap/call-graph';

/**
 * A second, independent reading of the same ABAP — and where it disagrees with ours.
 *
 * Everything this engine claims about ABAP is checked against our own reading of
 * ABAP. More cases written by the same hand raise coverage, not independence:
 * the author of the cases and the author of the parser agree by construction,
 * and a shared misreading survives every one of them. Today's two defects found
 * that out the hard way — an indented `*` swallowed the price-tolerance `IF` of
 * `Z_MM_PO_APPROVAL.abap`, and a period inside a decimal truncated a condition —
 * and both had passed every test we had written.
 *
 * `@abaplint/core` is an ABAP parser written in TypeScript by people who are not
 * us, open source, and it needs no SAP system. Where it and `lib/abap/` disagree
 * about a piece of ABAP, one of them is wrong, and that is evidence no further
 * test of ours can produce.
 *
 * **abaplint is a second opinion, not the truth.** A disagreement recorded here
 * is a finding for review, never an instruction to move our engine to theirs.
 * Some are our bug, some are theirs, and some are two defensible readings of the
 * same source — the baseline says which, with a reason, per entry.
 *
 * Four areas are compared, chosen because both engines model them the same way:
 *
 *   - `parse`      — a line abaplint cannot parse at all (its `Unknown`).
 *   - `statement`  — statement boundaries: how many, and where each begins and ends.
 *   - `branch`     — `IF`/`ELSEIF`/`ELSE` and `CASE`/`WHEN` with their line ranges.
 *   - `subroutine` — `FORM` definitions and `PERFORM` calls with their targets.
 *
 * Two places where the models genuinely differ in shape are **not** forced into a
 * comparison, because the difference is a convention rather than a disagreement:
 *
 *   - **Chain anchoring.** `DATA: a TYPE i,` on line 21 `b TYPE c.` on line 22 is
 *     two statements to both engines. abaplint anchors each part from the chain
 *     head (21-21, 21-22); we anchor each part on its own line (21-21, 22-22).
 *     Neither is wrong — abaplint keeps the borrowed keyword's position, we keep
 *     the position a reader should be sent to. Comparing them raw produced 76
 *     "disagreements" in `Z_MM_PO_APPROVAL.abap` alone, every one of them noise.
 *     Chain parts are therefore compared on the line they end on, which is the
 *     one thing both engines are actually asserting.
 *   - **Comments.** abaplint emits a statement node per comment line; we drop
 *     comments before a statement list exists. Comment nodes are excluded here
 *     rather than counted as 55 missing statements.
 */

/** Statement node type, which abaplint declares but does not export by name. */
type LintStatement = ReturnType<abaplint.ABAPFile['getStatements']>[number];
/** Structure node type, likewise. */
type LintStructure = NonNullable<ReturnType<abaplint.ABAPFile['getStructure']>>;

export type DisagreementArea = 'parse' | 'statement' | 'branch' | 'subroutine';

export interface Disagreement {
  /** The shipped example this was found in. */
  file: string;
  area: DisagreementArea;
  /** Identity of the thing disagreed about — stable across runs of one source. */
  key: string;
  /** 1-based source line the disagreement starts on, for the reviewer. */
  line: number;
  /** The source line itself, trimmed. Evidence beats a line number alone. */
  source: string;
  /** What `lib/abap/` says. */
  ours: string;
  /** What `@abaplint/core` says. */
  abaplint: string;
}

/** The eight ABAP sources this product ships in `public/starter-examples/`. */
export const SHIPPED_EXAMPLES = [
  'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
  'Z_BUSINESS_PARTNER_SYNC.txt',
  'Z_EMPLOYEE_EXPENSE_VAL.txt',
  'Z_INVOICE_EXTRACTOR.txt',
  'Z_MATERIAL_STOCK_CALC.txt',
  'Z_MM_PO_APPROVAL.abap',
  'Z_ORDER_INTEGRITY_CHECK.txt',
  'Z_SALES_ORDER_CREATOR.txt',
] as const;

const EXAMPLES_DIR = join(process.cwd(), 'public/starter-examples');

export function readExample(name: string): string {
  return readFileSync(join(EXAMPLES_DIR, name), 'utf8');
}

/**
 * Nodes abaplint emits that are not statements in our model.
 *
 * Only the two that our reader removes before a statement list exists. The body
 * of a `DEFINE` is deliberately **not** excluded: abaplint calls those lines
 * `MacroContent` and our reader emits them as ordinary statements marked by
 * their enclosing `define` block, and on the lines themselves the two agree.
 * Where they part company is the macro's *call site*, which abaplint expands
 * into the body's statements and our reader leaves as one — and that belongs in
 * the record, not behind a filter.
 */
const NOT_A_STATEMENT = new Set(['Comment', 'Empty']);

function nodeType(node: LintStatement): string {
  return (node.get().constructor as { name: string }).name;
}

/**
 * Parse one source the way abaplint would parse a report.
 *
 * The filename carries the object type in abaplint, so the extension of the
 * shipped example (`.abap` for two of them, `.txt` for six) must not decide how
 * it is read: all eight are reports, and all eight are handed over as one.
 */
function parseWithAbaplint(source: string): abaplint.ABAPFile | null {
  const registry = new abaplint.Registry();
  registry.addFile(new abaplint.MemoryFile('zsecond_opinion.prog.abap', source));
  registry.parse();
  const object = registry.getFirstObject();
  if (!object || !abaplint.ABAPObject.is(object)) return null;
  return object.getABAPFiles()[0] ?? null;
}

/** abaplint's own version, so a finding can be attributed to a reading of it. */
export function abaplintVersion(): string {
  return abaplint.Registry.abaplintVersion();
}

function trimmedLine(lines: string[], line: number): string {
  return (lines[line - 1] ?? '').trim().slice(0, 120);
}

/** Statement identity: a chain part is only ever compared on the line it ends on. */
function statementKeys(
  lintStatements: readonly LintStatement[],
  source: string,
): { lint: Map<string, number>; ours: Map<string, number>; lineOf: Map<string, number> } {
  const lint = new Map<string, number>();
  const ours = new Map<string, number>();
  const lineOf = new Map<string, number>();

  const bump = (into: Map<string, number>, key: string, line: number) => {
    into.set(key, (into.get(key) ?? 0) + 1);
    if (!lineOf.has(key)) lineOf.set(key, line);
  };

  for (const node of lintStatements) {
    const end = node.getEnd().getRow();
    // `getColon()` is abaplint's `fromChain`: the colon the part borrowed its
    // head from. Present exactly when the statement came out of a `KEYWORD: a, b.`
    const key = node.getColon() !== undefined ? `chain-part@L${end}` : `L${node.getStart().getRow()}-${end}`;
    bump(lint, key, node.getStart().getRow());
  }
  for (const statement of readStatements(source)) {
    const key = statement.fromChain
      ? `chain-part@L${statement.lineEnd}`
      : `L${statement.lineStart}-${statement.lineEnd}`;
    bump(ours, key, statement.lineStart);
  }
  return { lint, ours, lineOf };
}

/** `if 204-211 arms:204,208` — the shape both engines can state. */
function lintBranches(structure: LintStructure): Map<string, string> {
  const out = new Map<string, string>();

  const armRows = (node: LintStructure): number[] => {
    const rows: number[] = [];
    // Direct statements and direct arm sub-structures only: an ELSE one level
    // down belongs to the IF one level down, not to this one.
    for (const statement of node.findDirectStatements(abaplint.Statements.If)) rows.push(statement.getStart().getRow());
    for (const arm of node.findDirectStructures(abaplint.Structures.ElseIf)) {
      for (const statement of arm.findDirectStatements(abaplint.Statements.ElseIf)) rows.push(statement.getStart().getRow());
    }
    for (const arm of node.findDirectStructures(abaplint.Structures.Else)) {
      for (const statement of arm.findDirectStatements(abaplint.Statements.Else)) rows.push(statement.getStart().getRow());
    }
    for (const arm of node.findDirectStructures(abaplint.Structures.When)) {
      for (const statement of arm.findDirectStatements(abaplint.Statements.When)) rows.push(statement.getStart().getRow());
      for (const statement of arm.findDirectStatements(abaplint.Statements.WhenOthers)) rows.push(statement.getStart().getRow());
    }
    // `CASE TYPE OF lo.` is a second structure in abaplint with its own arms.
    // Our reader models it as one `case` whose selector keeps the `TYPE OF`,
    // and leaving it out here read as a disagreement that was the harness's.
    for (const arm of node.findDirectStructures(abaplint.Structures.WhenType)) {
      for (const statement of arm.findDirectStatements(abaplint.Statements.WhenType)) rows.push(statement.getStart().getRow());
      for (const statement of arm.findDirectStatements(abaplint.Statements.WhenOthers)) rows.push(statement.getStart().getRow());
    }
    return rows.sort((a, b) => a - b);
  };

  const collect = (kind: 'if' | 'case', nodes: LintStructure[]) => {
    for (const node of nodes) {
      const start = node.getFirstToken().getStart().getRow();
      const end = node.getLastToken().getStart().getRow();
      out.set(`${kind}@L${start}`, `${kind} L${start}-${end} arms:${armRows(node).join(',')}`);
    }
  };

  collect('if', structure.findAllStructuresRecursive(abaplint.Structures.If));
  collect('case', structure.findAllStructuresRecursive(abaplint.Structures.Case));
  collect('case', structure.findAllStructuresRecursive(abaplint.Structures.CaseType));
  return out;
}

function ourBranches(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const report = readControlFlow(source);
  for (const branch of report.branches) {
    const arms = branch.arms.map((arm) => arm.header.lineStart).sort((a, b) => a - b);
    out.set(
      `${branch.kind}@L${branch.lineStart}`,
      `${branch.kind} L${branch.lineStart}-${branch.lineEnd} arms:${arms.join(',')}`,
    );
  }
  // A construct our reader saw and refused to draw is a statement about the
  // source too, and abaplint will have an opinion on the same lines.
  for (const skipped of report.notHandled) {
    const kind = /^CASE\b/i.test(skipped.snippet) ? 'case' : 'if';
    const key = `${kind}@L${skipped.lineStart}`;
    if (!out.has(key)) out.set(key, `not handled (${skipped.reason})`);
  }
  return out;
}

function lintSubroutines(file: abaplint.ABAPFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const form of file.getInfo().listFormDefinitions()) {
    out.set(`FORM@L${form.identifier.getStart().getRow()}`, `FORM ${form.name.toUpperCase()}`);
  }
  for (const node of file.getStatements()) {
    if (nodeType(node) !== 'Perform') continue;
    const name = node.findFirstExpression(abaplint.Expressions.FormName);
    const dynamic = node.findFirstExpression(abaplint.Expressions.Dynamic);
    const target = name ? name.concatTokens().toUpperCase() : dynamic ? '(dynamic)' : '(unreadable)';
    out.set(`PERFORM@L${node.getStart().getRow()}`, `PERFORM ${target}`);
  }
  return out;
}

function ourSubroutines(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const graph = readCallGraph(source);
  for (const form of graph.forms) out.set(`FORM@L${form.lineStart}`, `FORM ${form.name}`);
  for (const call of graph.performs) {
    out.set(`PERFORM@L${call.lineStart}`, `PERFORM ${call.dynamic && !call.target ? '(dynamic)' : call.target ?? '(unreadable)'}`);
  }
  return out;
}

function diffMaps(
  area: DisagreementArea,
  file: string,
  lines: string[],
  ours: Map<string, string>,
  lint: Map<string, string>,
): Disagreement[] {
  const out: Disagreement[] = [];
  for (const key of new Set([...ours.keys(), ...lint.keys()])) {
    const a = ours.get(key);
    const b = lint.get(key);
    if (a === b) continue;
    const line = Number(/L(\d+)/.exec(key)?.[1] ?? 0);
    out.push({
      file,
      area,
      key,
      line,
      source: trimmedLine(lines, line),
      ours: a ?? 'nothing here',
      abaplint: b ?? 'nothing here',
    });
  }
  return out;
}

/**
 * Every disagreement between the two readings of one source.
 *
 * A source abaplint cannot turn into a program at all yields one record rather
 * than a cascade: comparing against nothing is not a second opinion.
 */
export function secondOpinion(file: string, source: string): Disagreement[] {
  const lines = source.split(/\r?\n/);
  const parsed = parseWithAbaplint(source);
  if (!parsed) {
    return [{
      file,
      area: 'parse',
      key: 'file',
      line: 1,
      source: trimmedLine(lines, 1),
      ours: `${readStatements(source).length} statements`,
      abaplint: 'no ABAP object — abaplint could not read this file as a program',
    }];
  }

  const found: Disagreement[] = [];
  const all = parsed.getStatements();
  const statements = all.filter((node) => !NOT_A_STATEMENT.has(nodeType(node)));

  // --- parse: lines abaplint refuses. Our reader never refuses, so what it made
  // of the same line is the other half of the record.
  const ourStatements = readStatements(source);
  for (const node of statements) {
    if (nodeType(node) !== 'Unknown') continue;
    const row = node.getStart().getRow();
    const covering = ourStatements.find((s) => s.lineStart <= row && row <= s.lineEnd);
    found.push({
      file,
      area: 'parse',
      key: `unknown@L${row}`,
      line: row,
      source: trimmedLine(lines, row),
      ours: covering ? `${covering.keyword || '(no keyword)'} — ${covering.text.slice(0, 80)}` : 'not a statement (comment)',
      abaplint: 'cannot parse this line',
    });
  }

  // --- statement boundaries
  const keys = statementKeys(statements, source);
  for (const key of new Set([...keys.lint.keys(), ...keys.ours.keys()])) {
    const mine = keys.ours.get(key) ?? 0;
    const theirs = keys.lint.get(key) ?? 0;
    if (mine === theirs) continue;
    const line = keys.lineOf.get(key) ?? 0;
    found.push({
      file,
      area: 'statement',
      key,
      line,
      source: trimmedLine(lines, line),
      ours: `${mine} statement(s)`,
      abaplint: `${theirs} statement(s)`,
    });
  }

  // --- branches
  const structure = parsed.getStructure();
  if (structure) {
    found.push(...diffMaps('branch', file, lines, ourBranches(source), lintBranches(structure)));
  } else {
    found.push({
      file,
      area: 'branch',
      key: 'structure',
      line: 1,
      source: trimmedLine(lines, 1),
      ours: `${readControlFlow(source).branches.length} branches`,
      abaplint: 'no structure — abaplint could not nest this program',
    });
  }

  // --- subroutines and calls
  found.push(...diffMaps('subroutine', file, lines, ourSubroutines(source), lintSubroutines(parsed)));

  return found.sort(
    (a, b) => a.area.localeCompare(b.area) || a.line - b.line || a.key.localeCompare(b.key),
  );
}

/** The same, over every shipped example, in a stable order. */
export function secondOpinionOnShippedExamples(): Disagreement[] {
  const out: Disagreement[] = [];
  for (const name of SHIPPED_EXAMPLES) out.push(...secondOpinion(name, readExample(name)));
  return out;
}

/** The identity a baseline entry is matched on. */
export function disagreementId(d: Pick<Disagreement, 'file' | 'area' | 'key'>): string {
  return `${d.file}|${d.area}|${d.key}`;
}

/**
 * What both engines agree on, per file — the other half of the picture.
 *
 * A harness that compares nothing reports no disagreements, and so does a
 * harness that works. These counts are what makes the difference visible.
 */
export interface AgreementCounts {
  file: string;
  statementsOurs: number;
  statementsAbaplint: number;
  branchesOurs: number;
  branchesAbaplint: number;
  formsOurs: number;
  formsAbaplint: number;
  performsOurs: number;
  performsAbaplint: number;
}

export function agreementCounts(file: string, source: string): AgreementCounts {
  const parsed = parseWithAbaplint(source);
  const structure = parsed?.getStructure();
  const graph = readCallGraph(source);
  const lintSubs = parsed ? lintSubroutines(parsed) : new Map<string, string>();
  const countOf = (map: Map<string, string>, prefix: string) =>
    [...map.keys()].filter((k) => k.startsWith(prefix)).length;

  return {
    file,
    statementsOurs: readStatements(source).length,
    statementsAbaplint: parsed
      ? parsed.getStatements().filter((n) => !NOT_A_STATEMENT.has(nodeType(n))).length
      : 0,
    branchesOurs: readControlFlow(source).branches.length,
    branchesAbaplint: structure ? lintBranches(structure).size : 0,
    formsOurs: graph.forms.length,
    formsAbaplint: countOf(lintSubs, 'FORM@'),
    performsOurs: graph.performs.length,
    performsAbaplint: countOf(lintSubs, 'PERFORM@'),
  };
}
