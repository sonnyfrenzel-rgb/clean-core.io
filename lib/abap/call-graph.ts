import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { readBlocks, containerAt, type BlockStructure, type Container } from './block-structure';
import { databaseWriteIn } from './open-sql-discrimination';
import { localDataObjectsOf } from './table-dependencies';
import { formCallbacksOf, programNameOf } from './callback-registrations';

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
  /** The report name, when it is a literal or a bare name — ABAP reads no constant after a bare `SUBMIT`. */
  program?: string;
  programExpression: string;
  /**
   * `name` is the bare report name ABAP takes literally after `SUBMIT`. Never
   * `constant`: a bare operand is not a data object here (QA finding 43a0a7a59521).
   */
  resolvedFrom?: 'literal' | 'name';
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

/**
 * A FORM another caller runs because a statement here registers it by name —
 * the ALV's `I_CALLBACK_USER_COMMAND = 'USER_COMMAND'`, `PERFORMING f ON END
 * OF TASK` (`callback-registrations.ts`). Not a `PERFORM`: it stays out of
 * `edges` and `neverPerformed`, and counts for reachability only.
 */
export interface CallbackEdge extends CallEdge {
  /** `ALV I_CALLBACK_USER_COMMAND`, `ALV IT_EVENTS`, `ON END OF TASK`. */
  trigger: string;
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
  /** FORMs registered as callbacks by a statement of this source. */
  callbacks: CallbackEdge[];
  /** Subroutines defined here that no `PERFORM` in this source names. */
  neverPerformed: string[];
  /**
   * Subroutines no path from an event block or program level reaches, over
   * `PERFORM` edges and callback registrations. A routine performed only by an
   * unreachable routine is itself unreachable; a callback FORM no `PERFORM`
   * names is reachable when the statement registering it is (so it can be in
   * `neverPerformed` and still not here).
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
  const value = m[1] !== undefined ? m[1].replace(/''/g, "'") : (m[2] ?? '').replace(/``/g, '`');
  return { value, literal: true };
}

/**
 * `CONSTANTS c_tcode_va02 TYPE tcode VALUE 'VA02'` — read off the statements,
 * which are already comment-free and chain-expanded, so a constant declared in a
 * `CONSTANTS: a …, b …` block is found as readily as a standalone one.
 */
function collectConstants(statements: AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  // The map is keyed by name alone, not by the method or routine that declares
  // it. Two declarations of one name with different values — a local constant
  // in each of two methods — cannot both be the value, and picking either would
  // resolve a call to a target it may not have. Such a name resolves to nothing.
  const ambiguous = new Set<string>();
  for (const statement of statements) {
    if (statement.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(statement.text);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const value = m[2].replace(/''/g, "'");
    const earlier = out.get(name);
    if (earlier !== undefined && earlier !== value) ambiguous.add(name);
    out.set(name, value);
  }
  for (const name of ambiguous) out.delete(name);
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
    // `kind`/`table`/`of`: the words of a table or line type — `LIKE LINE OF
    // itab`, `TYPE STANDARD TABLE OF t`, `TYPE RANGE OF f` — which are part of
    // the type, not parameters (carried QA finding 9dc8f13ac86b). A generic
    // `TYPE ANY TABLE` or `TYPE STANDARD TABLE` ends without `OF`, so the next
    // word there is a parameter again.
    let mode: 'name' | 'type' | 'ref' | 'kind' | 'table' | 'of' = 'name';
    for (const token of body.split(/[\s,]+/).filter(Boolean)) {
      const upper = token.toUpperCase();
      if (upper === 'TYPE' || upper === 'LIKE' || upper === 'STRUCTURE') { mode = 'type'; continue; }
      if (mode === 'type') {
        if (upper === 'REF') mode = 'ref';
        else if (upper === 'LINE' || upper === 'RANGE') mode = 'table';
        else if (upper === 'TABLE') mode = 'table';
        else if (['STANDARD', 'SORTED', 'HASHED', 'INDEX', 'ANY'].includes(upper)) mode = 'kind';
        else mode = 'name';
        continue;
      }
      if (mode === 'kind' && upper === 'TABLE') { mode = 'table'; continue; }
      if (mode === 'table' && upper === 'OF') { mode = 'of'; continue; }
      if (mode === 'of') { mode = 'name'; continue; }
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

function readFunctionModule(
  statement: AbapStatement,
  site: CallSite,
  constants: Map<string, string>,
): FunctionModuleCall | null {
  const m = /^CALL\s+FUNCTION\s+('(?:[^']|'')*'|`(?:[^`]|``)*`|[\w/-]+)/i.exec(statement.text);
  if (!m) return null;
  // A constant declared here closes the name as firmly as a literal does —
  // the same reading `readTransaction` gives `CALL TRANSACTION c_tcode`.
  const { value } = resolve(m[1], constants);
  const destination = /\bDESTINATION\s+('(?:[^']|'')*'|[\w/-]+)/i.exec(statement.text);
  return {
    ...site,
    name: value !== undefined ? value.toUpperCase() : undefined,
    dynamic: value === undefined,
    bapi: value !== undefined && isBapi(value),
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
  const m = /^CALL\s+TRANSACTION\s+('(?:[^']|'')*'|`(?:[^`]|``)*`|[\w/]+)/i.exec(statement.text);
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

function readSubmit(statement: AbapStatement, site: CallSite): SubmitCall | null {
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
  // literally, even where a constant of that name is declared: only `(name)`
  // reads a data object (carried QA finding a69811431418). Unlike CALL
  // TRANSACTION, where the bare form names a constant far more often than a
  // transaction.
  const from: SubmitCall['resolvedFrom'] = literal ? 'literal' : 'name';
  return {
    ...site,
    program: value.toUpperCase(),
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

  /**
   * Depth-first, with the path on a stack of its own rather than on the call
   * stack. Written as a recursion it recursed once per call in the deepest
   * PERFORM chain: a 410 kB source with a 6000-deep chain — well under the 1 MB
   * a `legacyCode` field may hold — ended in `RangeError: Maximum call stack
   * size exceeded`, and took `readCallGraph`, the process facts and everything
   * derived from them down with it, so the project could not be opened again.
   *
   * The walk is the same one: a frame holds the node, the targets it will visit
   * and how far it has come, and the three books (`onPath`, `inPath`, `done`)
   * are written at the same moments as before. Same order, same cycles.
   */
  const walk = (start: string) => {
    const stack: Array<{ node: string; targets: string[]; at: number }> = [
      { node: start, targets: [...new Set(next.get(start) ?? [])], at: 0 },
    ];
    onPath.push(start);
    inPath.add(start);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.at >= frame.targets.length) {
        onPath.pop();
        inPath.delete(frame.node);
        done.add(frame.node);
        stack.pop();
        continue;
      }
      const target = frame.targets[frame.at++];
      if (inPath.has(target)) {
        const cycle = onPath.slice(onPath.indexOf(target));
        const key = [...cycle].sort().join('>');
        if (!seen.has(key)) { seen.add(key); cycles.push(cycle); }
        continue;
      }
      if (done.has(target)) continue;
      onPath.push(target);
      inPath.add(target);
      stack.push({ node: target, targets: [...new Set(next.get(target) ?? [])], at: 0 });
    }
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
  // `MODIFY gt_fieldcat FROM gs_fieldcat` reads like a database write to
  // `databaseWriteIn`; a declared local data object is an internal table, never
  // one (ZMM_BESTELLUEBERSICHT review: an ALV field catalogue was the main effect).
  const localData = localDataObjectsOf(statements);

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
  const programName = programNameOf(statements);
  const callbacks: CallbackEdge[] = [];

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
    // Native SQL is the database's language, not ABAP: an `UPDATE` inside
    // `EXEC SQL … ENDEXEC` is not an Open SQL write, and its table is not read
    // the way `databaseWriteIn` reads one. The second-opinion baseline already
    // said no call or write is read out of it; now it is true (carried QA
    // finding 3b7cbdab1e93).
    if (statement.nativeSql) continue;

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
        for (const c of formCallbacksOf(statements, statement, programName, (form) => defined.has(form))) {
          // One edge per registering caller: the same FORM registered from an
          // unreached routine and from the program level must keep the second.
          if (callbacks.some((x) => x.to === c.form && x.from === site.caller)) continue;
          callbacks.push({
            from: site.caller,
            fromKind: site.callerKind,
            to: c.form,
            lineStart: site.lineStart,
            lineEnd: site.lineEnd,
            trigger: c.trigger,
          });
        }
        const fm = readFunctionModule(statement, site, constants);
        if (fm) { functionModules.push(fm); continue; }
        const tx = readTransaction(statement, site, constants);
        if (tx) { transactions.push(tx); continue; }
        continue;
      }
      case 'SUBMIT': {
        const submit = readSubmit(statement, site);
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
        if (write && !localData.has(write.table.toUpperCase())) {
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

  // Only a local call performs a local routine: `PERFORM foo IN PROGRAM z_other`
  // names another program's FOO, and is kept out of the edges for that reason.
  const performedNames = new Set(
    performs
      // `IN PROGRAM sy-repid` is this program by another name.
      .filter((p) => !p.program || /\bPROGRAM\s+SY-(?:REPID|CPROG)\b/i.test(p.text))
      .map((p) => p.target)
      .filter((t): t is string => Boolean(t)),
  );
  const neverPerformed = forms.map((f) => f.name).filter((name) => !performedNames.has(name));

  // Reachability starts wherever a call is written outside a subroutine: an
  // event block, a dialog module, a method, the program level. A callback
  // registration is followed like a call: the registered FORM runs once the
  // statement naming it has run (the process skeleton draws it as an entry of
  // its own from the same reading), and only then.
  const reachable = new Set<string>();
  const queue = [...edges, ...callbacks].filter((e) => e.fromKind !== 'form').map((e) => e.to);
  const formEdges = [...edges, ...callbacks].filter((e) => e.fromKind === 'form' && e.from);
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
    callbacks,
    neverPerformed,
    unreachable: unreachable.map((f) => f.name),
    unreachableLines: unreachable.reduce((sum, f) => sum + (f.lineEnd - f.lineStart + 1), 0),
    reachabilityCertain: performs.every((p) => !p.dynamic),
    recursion: findCycles(
      formEdges.map((e) => ({ from: e.from as string, to: e.to })),
    ),
  };
}
