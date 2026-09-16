import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { readBlocks, containerAt, type BlockStructure, type Container } from './block-structure';
import { databaseWriteIn } from './open-sql-discrimination';

/**
 * What the program calls, and what it writes — roadmap 2.2.
 *
 * Seven facts, each a different kind of statement and each with a line range:
 * the FORM/PERFORM graph, function-module names with BAPIs marked as such,
 * `CALL TRANSACTION`, `SUBMIT`, `AUTHORITY-CHECK` with its object and its fields,
 * and database writes. Before this the engine followed no PERFORM at all and
 * recorded `AUTHORITY-CHECK` without object or fields (`docs/ROADMAP.md` §3).
 *
 * **Database writes are not detected a second time.** `open-sql-discrimination.ts`
 * already knows that `INSERT ls_item INTO TABLE lt_items` is an internal table
 * and that `MODIFY dbtab FROM TABLE itab` is a real write despite the words
 * (QA review of 33471220d6e9, eac6118f1eac). Two copies of that rule is how the
 * first one went wrong; this file calls it.
 *
 * **A name that is not a literal is not resolved by guessing.** `CALL TRANSACTION
 * c_tcode_va02` names a constant. Where the constant is declared in this source
 * its value is filled in and `resolvedFrom` says `constant`; where the name comes
 * from a variable the call is `dynamic` and the target stays unknown, because a
 * process element that claims to know it would be inventing evidence.
 *
 * What is deliberately not read: `CALL METHOD` and `obj->m( )`, class-based calls
 * generally — they are neither in the 2.2 row nor drawable without the class
 * resolution `class-model-resolver.ts` does; `INCLUDE`, whose text this engine
 * never sees; and macro bodies.
 */

export interface FormParameter {
  name: string;
  direction: 'using' | 'changing' | 'tables';
}

export interface FormDefinition extends SourceRange {
  /** Upper-cased subroutine name. */
  name: string;
  parameters: FormParameter[];
  /** False when no `ENDFORM` closed it — the range then runs to the end. */
  terminated: boolean;
}

/** Where a call was written: which routine, or which event block. */
export interface CallSite extends SourceRange {
  /** Upper-cased name of the enclosing routine or event block; null at program level. */
  caller: string | null;
  callerKind: Container['kind'] | 'program';
  /** The statement, whitespace collapsed. */
  text: string;
}

export interface PerformCall extends CallSite {
  /** Upper-cased subroutine name, or undefined when the name is computed. */
  target?: string;
  /** True for `PERFORM (lv_name) …` — the target is not known before it runs. */
  dynamic: boolean;
  /** Program named by `form(prog)` or `IN PROGRAM prog`, when there is one. */
  program?: string;
  /** True when `target` names no FORM in this source and no external program. */
  unresolved: boolean;
}

export interface FunctionModuleCall extends CallSite {
  /** Upper-cased module name, or undefined when the name is computed. */
  name?: string;
  dynamic: boolean;
  /** The name begins with `BAPI_`, optionally after a `/namespace/` prefix. */
  bapi: boolean;
  /** The `DESTINATION` argument as written, when there is one. */
  destination?: string;
  inUpdateTask: boolean;
  inBackgroundTask: boolean;
  startingNewTask: boolean;
}

export interface TransactionCall extends CallSite {
  /** The transaction code, when it is a literal or a constant declared here. */
  code?: string;
  /** The token as written: `'ME21N'`, `c_tcode_va02`, `lv_tcode`. */
  codeExpression: string;
  resolvedFrom?: 'literal' | 'constant';
  dynamic: boolean;
  /** True for the batch-input form, `CALL TRANSACTION … USING <bdcdata>`. */
  batchInput: boolean;
}

export interface SubmitCall extends CallSite {
  /** The report name, when it is a literal, a bare name, or a constant declared here. */
  program?: string;
  programExpression: string;
  /** `name` is the bare report name ABAP takes literally after `SUBMIT`. */
  resolvedFrom?: 'literal' | 'constant' | 'name';
  dynamic: boolean;
  andReturn: boolean;
  viaJob: boolean;
}

export interface AuthorityField {
  /** The `ID` as written, without its quotes when it was a literal. */
  id: string;
  /** The `FIELD` argument as written, or undefined for `DUMMY`. */
  value?: string;
  /** True for `ID '…' DUMMY` — declared, deliberately unchecked. */
  dummy: boolean;
}

export interface AuthorityCheck extends CallSite {
  /** The authorization object, when it is a literal or a constant declared here. */
  object?: string;
  objectExpression: string;
  resolvedFrom?: 'literal' | 'constant';
  fields: AuthorityField[];
}

export interface DatabaseWrite extends CallSite {
  /** The table as `open-sql-discrimination.ts` read it, upper-cased. */
  table: string;
  keyword: 'INSERT' | 'UPDATE' | 'MODIFY' | 'DELETE';
}

export interface CallEdge extends SourceRange {
  /** Upper-cased caller name, or null at program level. */
  from: string | null;
  fromKind: Container['kind'] | 'program';
  /** Upper-cased subroutine called. */
  to: string;
}

export interface CallGraphReport {
  forms: FormDefinition[];
  performs: PerformCall[];
  functionModules: FunctionModuleCall[];
  transactions: TransactionCall[];
  submits: SubmitCall[];
  authorityChecks: AuthorityCheck[];
  databaseWrites: DatabaseWrite[];
  /** Resolved caller → callee edges, within this source. */
  edges: CallEdge[];
  /** Subroutine names performed here that this source does not define. */
  unresolvedTargets: string[];
  /** Subroutines defined here that no `PERFORM` in this source names. */
  neverPerformed: string[];
  /**
   * Subroutines no path from an event block or program level reaches. A superset
   * of `neverPerformed`: a routine performed only by an unreachable routine is
   * itself unreachable.
   */
  unreachable: string[];
  /** Lines held by the unreachable subroutines — the size of the dead region. */
  unreachableLines: number;
  /**
   * False when the source contains a `PERFORM (name)`. One computed target and
   * reachability is an opinion, so the list above is reported as unproven.
   */
  reachabilityCertain: boolean;
  /** Cycles in the subroutine graph, each in call order. A self-call is one entry. */
  recursion: string[][];
}

const LITERAL = /^'(.*)'$|^`(.*)`$/;

function unquote(token: string): { value: string; literal: boolean } {
  const m = LITERAL.exec(token);
  if (!m) return { value: token, literal: false };
  return { value: (m[1] ?? m[2] ?? '').replace(/''/g, "'"), literal: true };
}

/**
 * `CONSTANTS c_tcode_va02 TYPE tcode VALUE 'VA02'` — read off the statements,
 * which are already comment-free and chain-expanded, so a constant declared in a
 * `CONSTANTS: a …, b …` block is found as readily as a standalone one.
 */
function collectConstants(statements: AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const statement of statements) {
    if (statement.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(statement.text);
    if (m) out.set(m[1].toUpperCase(), m[2].replace(/''/g, "'"));
  }
  return out;
}

/** A literal stays a literal; a name is looked up; anything else stays unknown. */
function resolve(
  token: string,
  constants: Map<string, string>,
): { value?: string; from?: 'literal' | 'constant' } {
  const { value, literal } = unquote(token);
  if (literal) return { value, from: 'literal' };
  const known = constants.get(value.toUpperCase());
  if (known !== undefined) return { value: known, from: 'constant' };
  return {};
}

const PARAM_SECTION = /\b(USING|CHANGING|TABLES)\b/gi;

/**
 * Names in a `FORM … USING a TYPE t CHANGING c TABLES it STRUCTURE s` tail.
 *
 * A small state machine rather than a regex: `TYPE`, `LIKE`, `STRUCTURE` and
 * `TYPE REF TO` each swallow what follows them, and a type name read as a
 * parameter name is a parameter the routine does not have.
 */
function readFormParameters(tail: string): FormParameter[] {
  const marks: Array<{ direction: FormParameter['direction']; from: number; keywordAt: number }> = [];
  let m: RegExpExecArray | null;
  PARAM_SECTION.lastIndex = 0;
  while ((m = PARAM_SECTION.exec(tail))) {
    marks.push({
      direction: m[1].toLowerCase() as FormParameter['direction'],
      from: m.index + m[1].length,
      keywordAt: m.index,
    });
  }

  const out: FormParameter[] = [];
  for (let i = 0; i < marks.length; i++) {
    const body = tail.slice(marks[i].from, i + 1 < marks.length ? marks[i + 1].keywordAt : tail.length);
    let mode: 'name' | 'type' | 'ref' = 'name';
    for (const token of body.split(/[\s,]+/).filter(Boolean)) {
      const upper = token.toUpperCase();
      if (upper === 'TYPE' || upper === 'LIKE' || upper === 'STRUCTURE') { mode = 'type'; continue; }
      if (mode === 'type') {
        mode = upper === 'REF' ? 'ref' : 'name';
        continue;
      }
      if (mode === 'ref') { mode = upper === 'TO' ? 'ref' : 'name'; continue; }
      if (upper === 'DEFAULT' || upper === 'OPTIONAL') { mode = 'type'; continue; }
      const wrapped = /^(?:VALUE|REFERENCE)\(\s*([\w/]+)\s*\)$/i.exec(token);
      const name = wrapped ? wrapped[1] : token.replace(/[()]/g, '');
      if (/^[\w/]+$/.test(name)) out.push({ name: name.toUpperCase(), direction: marks[i].direction });
    }
  }
  return out;
}

function siteOf(statement: AbapStatement, containers: Container[]): CallSite {
  const container = containerAt(containers, statement.lineStart);
  return {
    caller: container ? container.name : null,
    callerKind: container ? container.kind : 'program',
    text: statement.text,
    lineStart: statement.lineStart,
    lineEnd: statement.lineEnd,
  };
}

function isBapi(name: string): boolean {
  return /^(?:\/[^/]+\/)?BAPI_/i.test(name);
}

function readPerform(statement: AbapStatement, site: CallSite): PerformCall | null {
  const m = /^PERFORM\s+(?:\(\s*([\w/]+)\s*\)|([\w/]+))(?:\(\s*([\w/]+)\s*\))?/i.exec(statement.text);
  if (!m) return null;
  const inProgram = /\b(?:IN|OF)\s+PROGRAM\s+(?:\(\s*([\w/]+)\s*\)|([\w/]+))/i.exec(statement.text);
  const dynamicName = Boolean(m[1]);
  const dynamicProgram = Boolean(inProgram?.[1]);
  const program = m[3]?.toUpperCase() ?? inProgram?.[2]?.toUpperCase();
  return {
    ...site,
    target: dynamicName ? undefined : m[2].toUpperCase(),
    dynamic: dynamicName || dynamicProgram,
    program,
    unresolved: false,
  };
}

function readFunctionModule(statement: AbapStatement, site: CallSite): FunctionModuleCall | null {
  const m = /^CALL\s+FUNCTION\s+('(?:[^']|'')*'|`(?:[^`]|``)*`|[\w/-]+)/i.exec(statement.text);
  if (!m) return null;
  const { value, literal } = unquote(m[1]);
  const destination = /\bDESTINATION\s+('(?:[^']|'')*'|[\w/-]+)/i.exec(statement.text);
  return {
    ...site,
    name: literal ? value.toUpperCase() : undefined,
    dynamic: !literal,
    bapi: literal && isBapi(value),
    destination: destination ? unquote(destination[1]).value : undefined,
    inUpdateTask: /\bIN\s+UPDATE\s+TASK\b/i.test(statement.text),
    inBackgroundTask: /\bIN\s+BACKGROUND\s+(?:TASK|UNIT)\b/i.test(statement.text),
    startingNewTask: /\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text),
  };
}

function readTransaction(
  statement: AbapStatement,
  site: CallSite,
  constants: Map<string, string>,
): TransactionCall | null {
  const m = /^CALL\s+TRANSACTION\s+('(?:[^']|'')*'|[\w/]+)/i.exec(statement.text);
  if (!m) return null;
  const resolved = resolve(m[1], constants);
  return {
    ...site,
    code: resolved.value?.toUpperCase(),
    codeExpression: m[1],
    resolvedFrom: resolved.from,
    dynamic: resolved.from === undefined,
    batchInput: /\bUSING\b/i.test(statement.text),
  };
}

function readSubmit(
  statement: AbapStatement,
  site: CallSite,
  constants: Map<string, string>,
): SubmitCall | null {
  const m = /^SUBMIT\s+(?:\(\s*([\w/]+)\s*\)|('(?:[^']|'')*'|[\w/]+))/i.exec(statement.text);
  if (!m) return null;
  if (m[1]) {
    return {
      ...site,
      programExpression: `(${m[1]})`,
      dynamic: true,
      andReturn: /\bAND\s+RETURN\b/i.test(statement.text),
      viaJob: /\bVIA\s+JOB\b/i.test(statement.text),
    };
  }
  const token = m[2];
  const { value, literal } = unquote(token);
  // A bare token after SUBMIT is the report name itself — ABAP takes it
  // literally. Unlike CALL TRANSACTION, where the bare form names a constant far
  // more often than a transaction.
  const constant = constants.get(value.toUpperCase());
  const program = literal ? value : constant ?? value;
  const from: SubmitCall['resolvedFrom'] = literal ? 'literal' : constant !== undefined ? 'constant' : 'name';
  return {
    ...site,
    program: program.toUpperCase(),
    programExpression: token,
    resolvedFrom: from,
    dynamic: false,
    andReturn: /\bAND\s+RETURN\b/i.test(statement.text),
    viaJob: /\bVIA\s+JOB\b/i.test(statement.text),
  };
}

function readAuthorityCheck(
  statement: AbapStatement,
  site: CallSite,
  constants: Map<string, string>,
): AuthorityCheck | null {
  const m = /^AUTHORITY-CHECK\s+OBJECT\s+('(?:[^']|'')*'|[\w/]+)/i.exec(statement.text);
  if (!m) {
    // `AUTHORITY-CHECK` without a readable OBJECT is still a check, and saying so
    // is better than dropping it: an element that cannot be anchored says so.
    return /^AUTHORITY-CHECK\b/i.test(statement.text)
      ? { ...site, objectExpression: '', fields: [] }
      : null;
  }
  const resolved = resolve(m[1], constants);
  const fields: AuthorityField[] = [];
  const idRe = /\bID\s+('(?:[^']|'')*'|[\w/-]+)\s+(?:FIELD\s+('(?:[^']|'')*'|[\w/<>-]+)|(DUMMY)\b)/gi;
  let f: RegExpExecArray | null;
  while ((f = idRe.exec(statement.text))) {
    fields.push({
      id: unquote(f[1]).value.toUpperCase(),
      value: f[2] !== undefined ? unquote(f[2]).value : undefined,
      dummy: f[3] !== undefined,
    });
  }
  return {
    ...site,
    object: resolved.value?.toUpperCase(),
    objectExpression: m[1],
    resolvedFrom: resolved.from,
    fields,
  };
}

function findCycles(edges: Array<{ from: string; to: string }>): string[][] {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const onPath: string[] = [];
  const inPath = new Set<string>();
  const done = new Set<string>();

  const walk = (node: string) => {
    onPath.push(node);
    inPath.add(node);
    for (const target of new Set(next.get(node) ?? [])) {
      if (inPath.has(target)) {
        const cycle = onPath.slice(onPath.indexOf(target));
        const key = [...cycle].sort().join('>');
        if (!seen.has(key)) { seen.add(key); cycles.push(cycle); }
        continue;
      }
      if (!done.has(target)) walk(target);
    }
    onPath.pop();
    inPath.delete(node);
    done.add(node);
  };

  for (const node of next.keys()) if (!done.has(node)) walk(node);
  return cycles;
}

export function readCallGraph(source: string): CallGraphReport {
  const statements = readStatements(source);
  return readCallGraphFrom(statements, readBlocks(statements));
}

/** The same reading, for a caller that already holds the statements. */
export function readCallGraphFrom(
  statements: AbapStatement[],
  structure: BlockStructure,
): CallGraphReport {
  const constants = collectConstants(statements);
  const containers = structure.containers;

  const forms: FormDefinition[] = structure.blocks
    .filter((b) => b.kind === 'form')
    .map((b) => {
      const opener = statements[b.openIndex];
      const m = /^FORM\s+([\w/]+)/i.exec(opener.text);
      return {
        name: (m ? m[1] : '').toUpperCase(),
        parameters: readFormParameters(opener.text.slice(m ? m[0].length : 5)),
        terminated: b.terminated,
        lineStart: b.lineStart,
        lineEnd: b.lineEnd,
      };
    })
    .filter((f) => f.name !== '');

  const defined = new Set(forms.map((f) => f.name));

  const performs: PerformCall[] = [];
  const functionModules: FunctionModuleCall[] = [];
  const transactions: TransactionCall[] = [];
  const submits: SubmitCall[] = [];
  const authorityChecks: AuthorityCheck[] = [];
  const databaseWrites: DatabaseWrite[] = [];

  for (const statement of statements) {
    // Macro bodies are expanded by the compiler, not here; a call written inside
    // one does not happen at this place.
    const enclosing = structure.enclosing[statement.index];
    if (enclosing.some((b) => b.kind === 'define')) continue;

    const site = siteOf(statement, containers);

    switch (statement.keyword) {
      case 'PERFORM': {
        const call = readPerform(statement, site);
        if (call) {
          call.unresolved = !call.dynamic && !call.program && !defined.has(call.target ?? '');
          performs.push(call);
        }
        continue;
      }
      case 'CALL': {
        const fm = readFunctionModule(statement, site);
        if (fm) { functionModules.push(fm); continue; }
        const tx = readTransaction(statement, site, constants);
        if (tx) { transactions.push(tx); continue; }
        continue;
      }
      case 'SUBMIT': {
        const submit = readSubmit(statement, site, constants);
        if (submit) submits.push(submit);
        continue;
      }
      case 'AUTHORITY-CHECK': {
        const check = readAuthorityCheck(statement, site, constants);
        if (check) authorityChecks.push(check);
        continue;
      }
      case 'INSERT':
      case 'UPDATE':
      case 'MODIFY':
      case 'DELETE': {
        const write = databaseWriteIn(statement.text);
        if (write) {
          databaseWrites.push({ ...site, table: write.table.toUpperCase(), keyword: write.keyword });
        }
        continue;
      }
      default:
        continue;
    }
  }

  const edges: CallEdge[] = performs
    .filter((p) => p.target && !p.program && defined.has(p.target))
    .map((p) => ({
      from: p.caller,
      fromKind: p.callerKind,
      to: p.target as string,
      lineStart: p.lineStart,
      lineEnd: p.lineEnd,
    }));

  const performedNames = new Set(performs.map((p) => p.target).filter((t): t is string => Boolean(t)));
  const neverPerformed = forms.map((f) => f.name).filter((name) => !performedNames.has(name));

  // Reachability starts wherever a call is written outside a subroutine: an
  // event block, a dialog module, a method, the program level.
  const reachable = new Set<string>();
  const queue = edges.filter((e) => e.fromKind !== 'form').map((e) => e.to);
  const formEdges = edges.filter((e) => e.fromKind === 'form' && e.from);
  while (queue.length) {
    const name = queue.shift() as string;
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const edge of formEdges) if (edge.from === name) queue.push(edge.to);
  }
  const unreachable = forms.filter((f) => !reachable.has(f.name));

  return {
    forms,
    performs,
    functionModules,
    transactions,
    submits,
    authorityChecks,
    databaseWrites,
    edges,
    unresolvedTargets: [...new Set(performs.filter((p) => p.unresolved).map((p) => p.target as string))],
    neverPerformed,
    unreachable: unreachable.map((f) => f.name),
    unreachableLines: unreachable.reduce((sum, f) => sum + (f.lineEnd - f.lineStart + 1), 0),
    reachabilityCertain: performs.every((p) => !p.dynamic),
    recursion: findCycles(
      formEdges.map((e) => ({ from: e.from as string, to: e.to })),
    ),
  };
}
