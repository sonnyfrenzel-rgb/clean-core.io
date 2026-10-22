/**
 * ABAP Unit test classes, read honestly (roadmap 3.0.13 item 6, owner
 * 14.10.2026).
 *
 * The SD review found a package whose test include held 45 engine test
 * methods: 40 called `cl_abap_unit_assert=>skip`, the other 5 computed packed
 * arithmetic locally and never called the code under test — and STATUS read
 * "45 derived, 12 written". The testing model's class called five methods the
 * class under test does not declare, eight of its method names were longer
 * than ABAP's 30 characters, and it was shipped under a class name its own
 * source does not define. Two things follow, both here, both pure:
 *
 *   1. **Counting.** A test method counts as a test only when it calls the
 *      code under test (a method or constructor of a class of the package,
 *      directly or through a helper method of its own test class) and does not
 *      skip. Methods that skip, and methods that never reach the code under
 *      test, are counted apart and named as not tests.
 *   2. **Checking the testing model's class against the declarations** of the
 *      classes and interfaces in the package: every method it calls on a
 *      package class must be declared there (or on an interface the class
 *      implements), every named parameter must be one of that method's, every
 *      class and method name it declares must fit in 30 characters, and it must
 *      be local test classes (`CLASS lt… DEFINITION FOR TESTING`) — they go into
 *      the test include of the class under test, not into a global class whose
 *      metadata names a class the source does not define.
 *
 * What is not checked: calls on SAP classes (`cl_abap_unit_assert=>…`), on a
 * variable whose type the reader cannot see, or on a class that inherits from
 * a class outside the package (its inherited methods are not visible here).
 */

import { readStatements, type AbapStatement } from './abap/statement-reader';
import { sandboxFilesFromStoredCode } from './test-sandbox/files';
import { outsideReading } from './sap-test-results';
import { goldenMasterComparedWords, goldenMasterStates, notCarriedWords, type GoldenMasterSapResult } from './transformation/golden-master';

export const ABAP_NAME_MAX = 30;

/* ------------------------------------------------------------ declarations */

export interface AbapMethodDecl {
  name: string;
  /** Parameter names, lower case. */
  params: Set<string>;
  /** `METHODS x FOR TESTING`. */
  forTesting: boolean;
}

export interface AbapTypeDecl {
  name: string;
  kind: 'class' | 'interface';
  methods: Map<string, AbapMethodDecl>;
  interfaces: string[];
  /** `ALIASES a FOR zif~b`: alias → `zif~b`. */
  aliases: Map<string, string>;
  superclass: string | null;
  forTesting: boolean;
  global: boolean;
  line: number;
}

/** Removes the contents of character literals and string templates' text so `->` inside text is not read as a call. */
function maskText(text: string): string {
  return text.replace(/'(?:[^']|'')*'/g, "''").replace(/`(?:[^`]|``)*`/g, '``');
}

function paramNames(text: string): Set<string> {
  const t = maskText(text).split(/\s+/);
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) {
    if (!/^(TYPE|LIKE)$/i.test(t[i + 1])) continue;
    const m = /^(?:VALUE|REFERENCE)\((\w+)\)$/i.exec(t[i]);
    const name = (m ? m[1] : t[i]).toLowerCase();
    if (/^[a-z_]\w*$/.test(name) && !/^(importing|exporting|changing|returning|raising|optional|default|type|like)$/.test(name)) out.add(name);
  }
  return out;
}

/** Every class and interface declared in the sources, by lower-case name. */
export function abapDeclarations(sources: ReadonlyArray<{ path?: string; content: string }>): Map<string, AbapTypeDecl> {
  const out = new Map<string, AbapTypeDecl>();
  for (const src of sources) {
    let open: AbapTypeDecl | null = null;
    for (const s of readStatements(src.content)) {
      const cls = /^CLASS\s+(\S+)\s+DEFINITION\b(.*)$/i.exec(s.text);
      const intf = /^INTERFACE\s+(\S+)(?:\s+PUBLIC)?$/i.exec(s.text);
      if (cls && !/\b(DEFERRED|LOAD)\b/i.test(cls[2])) {
        const sup = /INHERITING\s+FROM\s+(\S+)/i.exec(cls[2]);
        open = {
          name: cls[1].toLowerCase(),
          kind: 'class',
          methods: new Map(),
          interfaces: [],
          aliases: new Map(),
          superclass: sup ? sup[1].toLowerCase() : null,
          forTesting: /\bFOR\s+TESTING\b/i.test(cls[2]),
          global: /\bPUBLIC\b/i.test(cls[2]),
          line: s.lineStart,
        };
        out.set(open.name, open);
        continue;
      }
      if (intf && !/DEFERRED|LOAD/i.test(s.text)) {
        open = { name: intf[1].toLowerCase(), kind: 'interface', methods: new Map(), interfaces: [], aliases: new Map(), superclass: null, forTesting: false, global: /PUBLIC/i.test(s.text), line: s.lineStart };
        out.set(open.name, open);
        continue;
      }
      if (/^(ENDCLASS|ENDINTERFACE)$/i.test(s.keyword)) {
        open = null;
        continue;
      }
      if (!open) continue;
      const meth = /^(?:CLASS-)?METHODS:?\s+(\S+)(.*)$/i.exec(s.text);
      if (meth) {
        const name = meth[1].toLowerCase();
        open.methods.set(name, { name, params: paramNames(meth[2]), forTesting: /\bFOR\s+TESTING\b/i.test(meth[2]) });
        continue;
      }
      const ifs = /^INTERFACES:?\s+(\S+)/i.exec(s.text);
      if (ifs) {
        open.interfaces.push(ifs[1].toLowerCase());
        continue;
      }
      const al = /^ALIASES:?\s+(\S+)\s+FOR\s+(\S+)$/i.exec(s.text);
      if (al) open.aliases.set(al[1].toLowerCase(), al[2].toLowerCase());
    }
  }
  return out;
}

/** The method a call on `type` reaches, `null` when it is not declared, `undefined` when the reader cannot know. */
function resolveMethod(decls: Map<string, AbapTypeDecl>, type: string, method: string, seen = new Set<string>()): AbapMethodDecl | null | undefined {
  const d = decls.get(type);
  if (!d || seen.has(type)) return undefined;
  seen.add(type);
  const m = method.toLowerCase();
  if (m.includes('~')) {
    const [intf, meth] = m.split('~');
    if (d.kind === 'class' && !d.interfaces.includes(intf)) return null;
    return resolveMethod(decls, intf, meth, seen) ?? (decls.has(intf) ? null : undefined);
  }
  const own = d.methods.get(m);
  if (own) return own;
  const alias = d.aliases.get(m);
  if (alias) return resolveMethod(decls, type, alias, seen);
  if (m === 'constructor' && d.kind === 'class') return { name: 'constructor', params: new Set(), forTesting: false };
  for (const i of d.interfaces) {
    const via = decls.get(i)?.methods.get(m);
    if (via) return via;
  }
  if (d.superclass) {
    if (!decls.has(d.superclass)) return undefined;
    return resolveMethod(decls, d.superclass, m, seen);
  }
  return null;
}

/* ---------------------------------------------------------------- calls */

interface Call {
  target: string | null;
  method: string;
  args: string;
  line: number;
}

/** The text inside the parenthesis that opens at `open`. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

/** Named arguments at the top level of a call: `a = 1 b = VALUE #( c = 2 )` → a, b. */
function namedArgs(args: string): string[] {
  let flat = '';
  let depth = 0;
  for (const ch of args) {
    if (ch === '(') depth++;
    if (depth === 0) flat += ch;
    if (ch === ')') depth--;
  }
  const out: string[] = [];
  const re = /(?:^|\s)([a-z_][\w]*)\s*=(?!=)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const name = m[1].toLowerCase();
    if (!/^(exporting|importing|changing|receiving|exceptions)$/.test(name)) out.push(name);
  }
  return out;
}

function variableTypes(statements: AbapStatement[], decls: Map<string, AbapTypeDecl>): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of statements) {
    const t = maskText(s.text);
    let m = /^DATA:?\s*(?:\()?(\w+)\)?\s*=\s*NEW\s+([\w/]+)\s*\(/i.exec(t) ?? /^(\w+)\s*=\s*NEW\s+([\w/]+)\s*\(/i.exec(t);
    if (m && m[2] !== '#') {
      out.set(m[1].toLowerCase(), m[2].toLowerCase());
      continue;
    }
    m = /^(?:DATA|CLASS-DATA):?\s+(\w+)\s+TYPE\s+REF\s+TO\s+(\S+)/i.exec(t);
    if (m) {
      out.set(m[1].toLowerCase(), m[2].toLowerCase());
      continue;
    }
    m = /^CREATE\s+OBJECT\s+(\w+)\s+TYPE\s+(\S+)/i.exec(t);
    if (m) out.set(m[1].toLowerCase(), m[2].toLowerCase());
  }
  void decls;
  return out;
}

function callsOf(statements: AbapStatement[], types: Map<string, string>): Call[] {
  const out: Call[] = [];
  for (const s of statements) {
    const t = maskText(s.text);
    const inst = /\b([a-z_]\w*)->([\w~]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = inst.exec(t))) {
      const v = m[1].toLowerCase();
      if (v === 'me') continue;
      out.push({ target: types.get(v) ?? null, method: m[2].toLowerCase(), args: balanced(t, t.indexOf('(', m.index + m[0].length - 1)), line: s.lineStart });
    }
    const stat = /\b([a-z_/][\w/]*)=>([\w~]+)\s*\(/gi;
    while ((m = stat.exec(t))) out.push({ target: m[1].toLowerCase(), method: m[2].toLowerCase(), args: balanced(t, t.indexOf('(', m.index + m[0].length - 1)), line: s.lineStart });
    const ctor = /\bNEW\s+([a-z_/][\w/]*)\s*\(/gi;
    while ((m = ctor.exec(t))) out.push({ target: m[1].toLowerCase(), method: 'constructor', args: balanced(t, t.indexOf('(', m.index + m[0].length - 1)), line: s.lineStart });
  }
  return out;
}

/* ---------------------------------------------------------------- the check */

export type AbapTestProblemKind = 'undeclared-method' | 'undeclared-parameter' | 'name-too-long' | 'global-test-class' | 'reserved-name' | 'no-test-class' | 'default-access';

export interface AbapTestProblem {
  kind: AbapTestProblemKind;
  line: number;
  /** The method, parameter or class the problem is about. */
  name: string;
  /** The class or interface of the package it was looked up on. */
  on: string | null;
  message: string;
}

/**
 * What TRACE.md says of the ABAP Unit classes (owner decision 18.10.2026): which count, and that the testing model's
 * class is a proposal. The PM trial on SAP: 46 green, 4 red, 46 skipped — all 4 red were methods of the model's class
 * with wrong preconditions; the engine's case of the same check was green.
 */
export const ABAP_UNIT_EVIDENCE_LINE =
  "ABAP Unit evidence: the engine's classes ltc_engine_cases, ltc_golden_master and ltc_counterparts are what the acceptance counts. A test class the testing model writes (ltcl_…, added to the test include at delivery) is a proposal, not evidence: Clean-Core.io checks its calls against the declarations, not its preconditions or expected results.";

/** The engine's test classes as STATUS names them. */
export const ENGINE_CLASS_WORDS = 'ltc_engine_cases, ltc_golden_master, ltc_counterparts';

/** "ABAP Unit, the testing model's class ltcl_test — a proposal, not evidence" (owner decision 18.10.2026). */
export function modelClassWords(classes: readonly string[]): string {
  return `ABAP Unit, the testing model's ${classes.length === 1 ? 'class' : 'classes'} ${classes.join(', ') || 'ltcl_…'} — a proposal, not evidence`;
}

/** Local class names the engine writes into the test include itself. */
export const RESERVED_TEST_CLASSES = ['ltd_access', 'ltc_engine_cases', 'ltc_golden_master', 'ltc_counterparts'];

/**
 * The testing model's ABAP Unit code against the package it tests. `ok` only
 * when no problem is found; each problem names what is wrong and where.
 */
export function checkAbapTestClass(testCode: string, packageSources: ReadonlyArray<{ path?: string; content: string }>): { ok: boolean; problems: AbapTestProblem[] } {
  const problems: AbapTestProblem[] = [];
  const own = abapDeclarations([{ content: testCode }]);
  const pkg = abapDeclarations(packageSources.filter((f) => !f.path || !/\.testclasses\.abap$/i.test(f.path)));
  const statements = readStatements(testCode);
  const testClasses = [...own.values()].filter((d) => d.kind === 'class' && d.forTesting);
  if (testClasses.length === 0) problems.push({ kind: 'no-test-class', line: 1, name: '', on: null, message: 'The code declares no test class (CLASS … DEFINITION … FOR TESTING).' });
  for (const d of own.values()) {
    if (d.name.length > ABAP_NAME_MAX) problems.push({ kind: 'name-too-long', line: d.line, name: d.name, on: null, message: `Class ${d.name} has ${d.name.length} characters; ABAP allows ${ABAP_NAME_MAX}.` });
    if (d.global) problems.push({ kind: 'global-test-class', line: d.line, name: d.name, on: null, message: `Class ${d.name} is declared PUBLIC: the tests go into the local test include of the class under test as a local class (CLASS ltc_… DEFINITION FOR TESTING).` });
    if (RESERVED_TEST_CLASSES.includes(d.name)) problems.push({ kind: 'reserved-name', line: d.line, name: d.name, on: null, message: `Class ${d.name} is a name Clean-Core.io writes into the test include itself; choose another.` });
    for (const m of d.methods.values())
      if (m.name.length > ABAP_NAME_MAX) problems.push({ kind: 'name-too-long', line: d.line, name: m.name, on: d.name, message: `Method ${m.name} has ${m.name.length} characters; ABAP allows ${ABAP_NAME_MAX}.` });
  }
  const all = new Map([...pkg, ...own]);
  const types = variableTypes(statements, all);
  for (const c of callsOf(statements, types)) {
    if (!c.target || !pkg.has(c.target)) continue;
    const resolved = resolveMethod(all, c.target, c.method);
    if (resolved === undefined) continue;
    if (resolved === null) {
      problems.push({ kind: 'undeclared-method', line: c.line, name: c.method, on: c.target, message: `Line ${c.line}: ${c.target} declares no method ${c.method}.` });
      continue;
    }
    if (c.method === 'constructor' && !pkg.get(c.target)?.methods.has('constructor')) continue;
    for (const p of namedArgs(c.args))
      if (!resolved.params.has(p))
        problems.push({ kind: 'undeclared-parameter', line: c.line, name: p, on: `${c.target}->${c.method}`, message: `Line ${c.line}: ${c.target}->${c.method} has no parameter ${p}.` });
  }
  return { ok: problems.length === 0, problems };
}

/** One sentence for a refusal or a repair request: the first problems, named. */
export function abapTestProblemsSentence(problems: readonly AbapTestProblem[], max = 8): string {
  const shown = problems.slice(0, max).map((p) => p.message);
  const more = problems.length > max ? ` And ${problems.length - max} more.` : '';
  return `The ABAP Unit test class does not fit the class under test: ${shown.join(' ')}${more}`;
}

/* ------------------------------------------- the test double of the access layer */

/**
 * Roadmap 3.0.15 item (2), from the second SAP import (owner 16.10.2026): the one red ABAP Unit method created the
 * logic class with `NEW zcl_<x>_logic( )` — the default access, which calls SAP — and so tested the missing SAP
 * connection, not the logic. In an engine-led package the logic class takes the access layer in its constructor
 * (`io_access`) and the test include holds the double (`ltd_access`); the model's tests must pass it.
 */
export interface AccessSeam {
  /** The package classes whose constructor takes `io_access`, lower case. */
  logicClasses: string[];
  /** The test double the engine writes into the test include. */
  double: string;
  /** The default access classes of the package (`zcl_<x>_access`), lower case — never what a test passes. */
  defaultAccess: string[];
}

export const ACCESS_DOUBLE = 'ltd_access';
export const ACCESS_PARAM = 'io_access';

/** The access seam of a package, or null when it has none (no logic class taking `io_access`, or no double). */
export function accessSeamOf(packageSources: ReadonlyArray<{ path?: string; content: string }>): AccessSeam | null {
  const hasDouble = packageSources.some((f) => new RegExp(`^\\s*CLASS\\s+${ACCESS_DOUBLE}\\s+DEFINITION\\b`, 'im').test(f.content));
  if (!hasDouble) return null;
  const decls = abapDeclarations(packageSources.filter((f) => !f.path || !/\.testclasses\.abap$/i.test(f.path)));
  const logicClasses = [...decls.values()].filter((d) => d.kind === 'class' && d.methods.get('constructor')?.params.has(ACCESS_PARAM)).map((d) => d.name);
  if (logicClasses.length === 0) return null;
  const interfaces = new Set(
    packageSources.flatMap((f) => [...f.content.matchAll(new RegExp(`\\b${ACCESS_PARAM}\\s+TYPE\\s+REF\\s+TO\\s+([\\w/]+)`, 'gi'))].map((m) => m[1].toLowerCase())),
  );
  const defaultAccess = [...decls.values()].filter((d) => d.kind === 'class' && !d.forTesting && d.interfaces.some((i) => interfaces.has(i))).map((d) => d.name);
  return { logicClasses, double: ACCESS_DOUBLE, defaultAccess };
}

/** The prompt rule for the testing model, naming the classes of this package. */
export function accessSeamPromptRule(seam: AccessSeam): string {
  const cut = seam.logicClasses.join(' / ');
  return (
    `- THE ACCESS LAYER (CRITICAL): create the class under test ONLY with the test double the product writes into the test include: \`NEW ${seam.logicClasses[0]}( ${ACCESS_PARAM} = NEW ${seam.double}( ) )\`. ` +
    `Never \`NEW ${cut}( )\` without \`${ACCESS_PARAM}\`, never \`CREATE OBJECT\` without it, and never pass ${seam.defaultAccess.length ? seam.defaultAccess.join(' / ') : 'the default access class'}: without the double the class uses the default access, which calls SAP, and the test tests the missing SAP connection, not the logic. ` +
    `Do not declare ${seam.double} yourself — it is already in the test include.`
  );
}

/** The code with comments and the text of literals and templates blanked, every offset kept. */
function maskKeepingOffsets(code: string): string {
  let out = '';
  let i = 0;
  let lineStart = true;
  while (i < code.length) {
    const ch = code[i];
    if (lineStart && ch === '*') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    lineStart = ch === '\n';
    if (ch === '"') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '`' || ch === '|') {
      let j = i + 1;
      while (j < code.length && code[j] !== '\n') {
        if (ch === '|' && code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          if (ch !== '|' && code[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      const stop = Math.min(j + 1, code.length);
      out += ch + ' '.repeat(Math.max(0, stop - i - 2)) + (stop - i >= 2 ? code[stop - 1] : '');
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** The offset of the `)` that closes the parenthesis opening at `open`, or -1. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The scopes a variable at `at` is resolved in, innermost first: the method it sits in, then its test class
 * (definition and implementation — attributes set in `setup`). Offsets into the masked code.
 */
function scopesAt(masked: string, at: number): Array<[number, number]> {
  const scopes: Array<[number, number]> = [];
  const before = masked.slice(0, at);
  const lastOf = (re: RegExp) => {
    let last: RegExpExecArray | null = null;
    for (let m = re.exec(before); m !== null; m = re.exec(before)) last = m;
    return last;
  };
  const method = lastOf(/\bMETHOD\s+[\w~/]+[^.]*\./gi);
  const endBefore = lastOf(/\bENDMETHOD\b/gi);
  if (method && (!endBefore || endBefore.index < method.index)) {
    const end = masked.slice(at).search(/\bENDMETHOD\b/i);
    scopes.push([method.index, end === -1 ? masked.length : at + end]);
  }
  const impl = lastOf(/\bCLASS\s+([\w/]+)\s+IMPLEMENTATION\b/gi);
  if (impl) {
    const name = esc(impl[1]);
    for (const head of [new RegExp(`\\bCLASS\\s+${name}\\s+DEFINITION\\b`, 'gi'), new RegExp(`\\bCLASS\\s+${name}\\s+IMPLEMENTATION\\b`, 'gi')]) {
      const m = head.exec(masked);
      if (!m) continue;
      const end = masked.slice(m.index).search(/\bENDCLASS\b/i);
      scopes.push([m.index, end === -1 ? masked.length : m.index + end]);
    }
  }
  return scopes;
}

/** The expression that starts at the beginning of `text`: `NEW x( … )`, `CAST x( … )`, or a variable; or ''. */
function leadingExpression(text: string): string {
  const call = /^\s*(?:NEW|CAST)\s+[\w/#]+\s*\(/i.exec(text);
  if (call) {
    const close = closingParen(text, call[0].length - 1);
    return close === -1 ? '' : text.slice(0, close + 1).trim();
  }
  return /^\s*((?:me->)?[a-z_][\w]*)(?![\w(]|->|=>)/i.exec(text)?.[1] ?? '';
}

/**
 * Traces the value handed in as `io_access` (masked code, `at` = offset of the creation) to what it is: the test
 * double (`ltd_access` only — a class of the suite's own could delegate to SAP), the default access
 * class, or unclear.
 * A variable is resolved through its creations in the same method or test class — `DATA(v) = NEW c( )`,
 * `v = NEW c( )`, `v = NEW #( )` with `DATA v TYPE REF TO c`, `CREATE OBJECT v [TYPE c]` — and a `CAST t( … )`
 * through what it casts. What cannot be resolved is unclear, never the double.
 */
function traceAccess(masked: string, given: string, at: number, seam: AccessSeam): 'double' | 'default' | 'unclear' {
  const ofClass = (cls: string): 'double' | 'default' | 'unclear' =>
    cls === seam.double ? 'double' : seam.defaultAccess.includes(cls) ? 'default' : 'unclear';
  const scopes = scopesAt(masked, at);
  const declaredType = (v: string): string => {
    for (const [s, e] of scopes) {
      const m = new RegExp(`(?:^|[\\s,:])(?:me->)?${esc(v)}\\s+TYPE\\s+REF\\s+TO\\s+([\\w/]+)`, 'i').exec(masked.slice(s, e));
      if (m) return m[1].toLowerCase();
    }
    return '';
  };
  const visiting = new Set<string>();
  const ofExpression = (expr: string, target: string): 'double' | 'default' | 'unclear' => {
    const call = /^\s*(NEW|CAST)\s+([\w/#]+)\s*\(/i.exec(expr);
    if (call && call[1].toUpperCase() === 'CAST') return ofExpression(leadingExpression(expr.slice(call[0].length)), '');
    if (call) return ofClass(call[2] === '#' ? (target ? declaredType(target) : '') : call[2].toLowerCase());
    return expr ? ofVariable(expr) : 'unclear';
  };
  const ofVariable = (raw: string): 'double' | 'default' | 'unclear' => {
    const v = raw.replace(/^me->/i, '').toLowerCase();
    if (visiting.has(v)) return 'unclear';
    visiting.add(v);
    const n = esc(v);
    const assign = new RegExp(`(?:^|\\.)\\s*(?:DATA\\s*\\(\\s*${n}\\s*\\)|(?:me->)?${n})\\s*=(?!=)\\s*`, 'gim');
    const create = new RegExp(`\\bCREATE\\s+OBJECT\\s+(?:me->)?${n}\\b(?:\\s+TYPE\\s+([\\w/]+))?`, 'gi');
    for (const [s, e] of scopes) {
      const text = masked.slice(s, e);
      const found: Array<'double' | 'default' | 'unclear'> = [];
      for (let m = assign.exec(text); m !== null; m = assign.exec(text)) found.push(ofExpression(leadingExpression(text.slice(m.index + m[0].length)), v));
      for (let m = create.exec(text); m !== null; m = create.exec(text)) found.push(ofClass((m[1] ?? declaredType(v)).toLowerCase()));
      assign.lastIndex = 0;
      create.lastIndex = 0;
      // The innermost scope that creates the variable decides; every creation must be the double.
      if (found.length) return found.includes('default') ? 'default' : found.every((f) => f === 'double') ? 'double' : 'unclear';
    }
    return 'unclear';
  };
  return ofExpression(leadingExpression(given), '');
}

export interface AccessDoubleResult {
  /** The test code, rewritten where the rewrite is unambiguous. */
  code: string;
  /** How many places were rewritten to pass the double. */
  rewritten: number;
  /** The places that create the logic class without the double and could not be rewritten safely. */
  problems: AbapTestProblem[];
}

/**
 * Makes the model's ABAP Unit code create the logic class with the access double. Rewritten — deterministically, and
 * said in a comment at the top of the code — are the unambiguous forms: `NEW <logic>( )`, `<var> = NEW #( )` for a
 * variable typed as the logic class, and `CREATE OBJECT <var> [TYPE <logic>].` without EXPORTING. Refused, with the
 * line, is any other creation that passes no `io_access`, or that passes the default access class. Without an access
 * seam (`accessSeamOf`) the code is returned unchanged.
 */
export function withAccessDouble(testCode: string, seam: AccessSeam | null): AccessDoubleResult {
  if (!seam || !testCode) return { code: testCode, rewritten: 0, problems: [] };
  const logic = new Set(seam.logicClasses);
  const masked = maskKeepingOffsets(testCode);
  const lineOf = (offset: number) => testCode.slice(0, offset).split('\n').length;
  const types = variableTypes(readStatements(testCode), new Map());
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const problems: AbapTestProblem[] = [];
  const withDouble = `${ACCESS_PARAM} = NEW ${seam.double}( )`;
  const refuse = (offset: number, cls: string, why: string) =>
    problems.push({ kind: 'default-access', line: lineOf(offset), name: cls, on: cls, message: `Line ${lineOf(offset)}: ${why} Create it with NEW ${cls}( ${withDouble} ).` });
  const unclear = (cls: string) =>
    `creates ${cls} with an ${ACCESS_PARAM} the check cannot trace to the test double ${seam.double} (a variable it cannot resolve in this test class, or another class) — it may be the default access, which calls SAP.`;
  /**
   * The arguments of a creation: empty, with io_access traced to the double, to the default access, untraceable
   * (unclear), or without io_access (other). `at` is the offset of the creation in the masked code, for the scope.
   */
  const judge = (args: string, at: number): 'empty' | 'double' | 'default' | 'unclear' | 'other' => {
    if (args.trim() === '') return 'empty';
    const named = namedArgs(args);
    const given = named.includes(ACCESS_PARAM) ? (new RegExp(`\\b${ACCESS_PARAM}\\s*=\\s*([\\s\\S]*)$`, 'i').exec(args)?.[1] ?? '') : named.length === 0 ? args : null;
    if (given === null) return 'other';
    return traceAccess(masked, given, at, seam);
  };

  // NEW <logic>( … ) and <var> = NEW #( … )
  const news = /\bNEW\s+([\w/#]+)\s*\(/gi;
  for (let m = news.exec(masked); m !== null; m = news.exec(masked)) {
    let cls = m[1].toLowerCase();
    if (cls === '#') {
      const before = /(?:DATA\s*\(\s*)?([a-z_]\w*)\s*\)?\s*=\s*$/i.exec(masked.slice(Math.max(0, m.index - 80), m.index));
      cls = before ? (types.get(before[1].toLowerCase()) ?? '') : '';
    }
    if (!logic.has(cls)) continue;
    const open = m.index + m[0].length - 1;
    const close = closingParen(masked, open);
    if (close === -1) continue;
    const verdict = judge(masked.slice(open + 1, close), m.index);
    if (verdict === 'double') continue;
    if (verdict === 'empty') edits.push({ start: open, end: close + 1, text: `( ${withDouble} )` });
    else if (verdict === 'default') refuse(m.index, cls, `creates ${cls} with the default access class, which calls SAP — not the test double.`);
    else if (verdict === 'unclear') refuse(m.index, cls, unclear(cls));
    else refuse(m.index, cls, `creates ${cls} without ${ACCESS_PARAM}, so it uses the default access, which calls SAP.`);
  }

  // CREATE OBJECT <var> [TYPE <cls>] [EXPORTING …].
  const creates = /\bCREATE\s+OBJECT\s+([a-z_]\w*)((?:\s+TYPE\s+([\w/]+))?)([^.]*)\./gi;
  for (let m = creates.exec(masked); m !== null; m = creates.exec(masked)) {
    const cls = (m[3] ?? types.get(m[1].toLowerCase()) ?? '').toLowerCase();
    if (!logic.has(cls)) continue;
    const rest = m[4];
    if (rest.trim() === '') {
      const at = m.index + m[0].length - 1;
      edits.push({ start: at, end: at, text: ` EXPORTING ${withDouble}` });
      continue;
    }
    const exporting = /^\s*EXPORTING\s+([\s\S]*)$/i.exec(rest);
    const verdict = exporting ? judge(exporting[1], m.index) : 'other';
    if (verdict === 'double') continue;
    refuse(
      m.index,
      cls,
      verdict === 'default'
        ? `creates ${cls} with the default access class, which calls SAP — not the test double.`
        : verdict === 'unclear'
          ? unclear(cls)
          : `creates ${cls} without ${ACCESS_PARAM}, so it uses the default access, which calls SAP.`,
    );
  }

  if (edits.length === 0) return { code: testCode, rewritten: 0, problems };
  let code = testCode;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  const note = `" Clean-Core.io: ${edits.length} place${edits.length === 1 ? '' : 's'} created ${seam.logicClasses.join(' / ')} without the access layer (the default access, which calls SAP); rewritten to pass the test double: ${withDouble}.\n`;
  return { code: note + code, rewritten: edits.length, problems };
}

/* ---------------------------------------------------------------- counting */

export interface AbapUnitCounts {
  /** Test methods (`METHODS x FOR TESTING`) found. */
  methods: number;
  /** Methods that call the code under test and do not skip: the tests. */
  tests: number;
  /** Methods that skip. Not tests. */
  skipped: number;
  /** Methods that neither skip nor call the code under test. Not tests. */
  noCall: number;
  /** The names of the methods that are not tests, per reason. */
  skippedNames: string[];
  noCallNames: string[];
  /** Methods that call the code under test without the case data they stand for (demo cases whose rows the logic cannot take yet). Not tests. */
  withoutData?: number;
  /**
   * QM-02 (review of 18.10.2026): methods that call a run entry with an input contract (`run( is_selection … )`)
   * without handing in its input (`is_input`): the class loads no data by itself, so the run sees empty tables and
   * the expectation is no evidence of the logic. Not tests. A test of the empty run says so: `is_input = VALUE #( )`.
   */
  withoutInput?: number;
  withoutInputNames?: string[];
  /** Methods whose every assertion sits inside `IF sy-subrc = 0` (the row it reads found): a missing row passes. Not tests. */
  guardedOnly?: number;
  guardedOnlyNames?: string[];
  /**
   * Methods whose every call of the code under test hands in an empty input (`is_input = VALUE #( )`) and whose only
   * assertions are that the whole result is not initial or bound: they test that an empty run returns something, not
   * the rule their name stands for. Not tests.
   */
  emptyInputOnly?: number;
  emptyInputOnlyNames?: string[];
}

/** Method bodies of one source: lower-case `class.method` → statements. */
function methodBodies(statements: AbapStatement[]): Map<string, { cls: string; statements: AbapStatement[] }> {
  const out = new Map<string, { cls: string; statements: AbapStatement[] }>();
  let cls: string | null = null;
  let open: { cls: string; statements: AbapStatement[] } | null = null;
  for (const s of statements) {
    const impl = /^CLASS\s+(\S+)\s+IMPLEMENTATION$/i.exec(s.text);
    if (impl) cls = impl[1].toLowerCase();
    else if (s.keyword === 'METHOD' && cls) {
      const name = (s.text.split(/\s+/)[1] ?? '').toLowerCase();
      open = { cls, statements: [] };
      out.set(`${cls}.${name}`, open);
    } else if (s.keyword === 'ENDMETHOD') open = null;
    else if (s.keyword === 'ENDCLASS') cls = null;
    else if (open) open.statements.push(s);
  }
  return out;
}

/**
 * Counts the test methods of ABAP Unit sources honestly. `underTest`: the
 * classes and interfaces of the package (not the test classes) — a call on one
 * of them, a static call or `NEW` of one, or a call of a helper of the same
 * test class that does so, makes a method a test, unless it skips.
 */
/** The parameter a run entry takes its data through. */
export const INPUT_PARAM = 'is_input';

/**
 * The run entries of the package with an input contract (QM-02): class → the methods that declare an `is_input`
 * parameter. In an engine-led RAP package that is `run( is_selection, is_input )` of the logic class.
 */
export function abapInputContracts(packageSources: ReadonlyArray<{ path?: string; content: string }>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const d of abapDeclarations(packageSources).values()) {
    if (d.forTesting || d.kind !== 'class') continue;
    for (const m of d.methods.values()) {
      if (!m.params.has(INPUT_PARAM)) continue;
      if (!out.has(d.name)) out.set(d.name, new Set());
      out.get(d.name)!.add(m.name);
    }
  }
  return out;
}

/** The prompt rule of the input contract, or null when the package's run entries take no input (QM-02). */
export function inputContractPromptRule(packageSources: ReadonlyArray<{ path?: string; content: string }>): string | null {
  const contracts = abapInputContracts(packageSources.filter((f) => !/\.clas\.testclasses\.abap$/i.test(f.path ?? '')));
  if (contracts.size === 0) return null;
  const entries = [...contracts].flatMap(([cls, methods]) => [...methods].map((m) => `${cls}->${m}( )`));
  return (
    `- THE INPUT CONTRACT (CRITICAL): ${entries.join(', ')} take${entries.length === 1 ? 's' : ''} the data the run works on through \`${INPUT_PARAM}\`; the class loads no demo data and reads nothing by itself. ` +
    `Every test that calls it hands in \`${INPUT_PARAM}\` with the rows its case needs — or \`${INPUT_PARAM} = VALUE #( )\` where it tests the empty run on purpose. A test that calls it without \`${INPUT_PARAM}\` runs on empty tables and is not counted as a test. ` +
    "Give the selection what the run's own checks require before the step under test (a demo flag, a valid case number), or expect that refusal. " +
    'Before asserting on a row of a result table, assert that the row is there (`READ TABLE …` then `cl_abap_unit_assert=>assert_subrc( exp = 0 … )`) — never wrap the assertion in `IF sy-subrc = 0`: a missing row would pass. ' +
    'After a run, assert that `not_filled` of its result is initial where the result has one: a function still a stub ends the run early.'
  );
}

/** Whether every assertion of a method sits inside `IF sy-subrc = 0` / `IF … IS NOT INITIAL` / `IF line_exists( … )` without an ELSE. */
function guardedOnly(statements: AbapStatement[]): boolean {
  const ASSERT = /cl_abap_unit_assert=>(assert_\w+|fail)\s*\(/i;
  const GUARD = /^IF\s+(?:sy-subrc\s*(?:=|EQ)\s*0|\S+\s+IS\s+NOT\s+INITIAL|line_exists\s*\(.*\)|\S+\s+IS\s+ASSIGNED)$/i;
  const stack: boolean[] = [];
  let inside = 0;
  let outside = 0;
  for (const s of statements) {
    if (s.keyword === 'IF') stack.push(GUARD.test(s.text));
    else if (s.keyword === 'ELSE' || s.keyword === 'ELSEIF') {
      if (stack.length) stack[stack.length - 1] = false;
    } else if (s.keyword === 'ENDIF') stack.pop();
    else if (ASSERT.test(maskText(s.text))) {
      if (stack.includes(true)) inside++;
      else outside++;
    }
  }
  return inside > 0 && outside === 0;
}

/** `is_input = VALUE #( )` (or `VALUE some_type( )`) among the arguments of a call. */
const EMPTY_INPUT = new RegExp(String.raw`(?:^|\s)${INPUT_PARAM}\s*=\s*VALUE\s+(?:#|[\w/]+)\s*\(\s*\)`, 'i');

/**
 * Whether a method hands the code under test only an empty input and asserts no more than that the whole result is
 * there: every call of the code under test that passes `is_input` passes it empty, at least one does, and every
 * assertion is `assert_not_initial` or `assert_bound` on a plain variable (`act = ls_res`, not `act = ls_res-status`).
 */
function emptyInputOnly(statements: AbapStatement[], calls: readonly Call[], cut: ReadonlySet<string>): boolean {
  const withInput = calls.filter((c) => c.target !== null && cut.has(c.target) && namedArgs(c.args).includes(INPUT_PARAM));
  if (withInput.length === 0 || !withInput.every((c) => EMPTY_INPUT.test(c.args))) return false;
  const asserts = statements.map((s) => maskText(s.text)).filter((t) => /cl_abap_unit_assert=>(?:assert_\w+|fail)\s*\(/i.test(t));
  return (
    asserts.length > 0 &&
    asserts.every((t) => /cl_abap_unit_assert=>assert_(?:not_initial|bound)\s*\(/i.test(t) && /(?:^|[\s(])act\s*=\s*[a-z_]\w*(?=\s|\)|$)/i.test(t))
  );
}

export function countAbapUnitTests(
  testSources: ReadonlyArray<{ path?: string; content: string }>,
  underTest: Iterable<string>,
  inputContracts: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  /** Count only the test classes this accepts (by lower-case name): the engine's apart from the testing model's. */
  only: (testClass: string) => boolean = () => true,
): AbapUnitCounts {
  const cut = new Set([...underTest].map((x) => x.toLowerCase()));
  const counts: AbapUnitCounts = { methods: 0, tests: 0, skipped: 0, noCall: 0, skippedNames: [], noCallNames: [] };
  for (const src of testSources) {
    const statements = readStatements(src.content);
    const decls = abapDeclarations([src]);
    const bodies = methodBodies(statements);
    const types = variableTypes(statements, decls);
    const callsUnderTest = (key: string, seen: Set<string>): boolean => {
      if (seen.has(key)) return false;
      seen.add(key);
      const body = bodies.get(key);
      if (!body) return false;
      const local = new Map(types);
      for (const [k, v] of variableTypes(body.statements, decls)) local.set(k, v);
      if (callsOf(body.statements, local).some((c) => c.target !== null && cut.has(c.target))) return true;
      // A helper of the same class, called as `helper( … )` or `me->helper( … )`.
      for (const s of body.statements) {
        const t = maskText(s.text);
        for (const m of t.matchAll(/(?:^|[\s(=])(?:me->)?([a-z_]\w*)\(\s/gi)) {
          const helper = `${body.cls}.${m[1].toLowerCase()}`;
          if (bodies.has(helper) && callsUnderTest(helper, seen)) return true;
        }
      }
      return false;
    };
    for (const d of decls.values()) {
      if (!d.forTesting || d.kind !== 'class' || !only(d.name)) continue;
      for (const meth of d.methods.values()) {
        if (!meth.forTesting) continue;
        const key = `${d.name}.${meth.name}`;
        counts.methods++;
        const body = bodies.get(key);
        const skips = !!body && body.statements.some((x) => /=>\s*skip\s*\(/i.test(x.text));
        if (skips) {
          counts.skipped++;
          counts.skippedNames.push(key);
        } else if (callsUnderTest(key, new Set())) {
          // QM-02: a run entry with an input contract called without its input, or assertions a missing row skips.
          const local = new Map(types);
          for (const [k, v] of variableTypes(body?.statements ?? [], decls)) local.set(k, v);
          const calls = body ? callsOf(body.statements, local) : [];
          // A method that catches (a refusal it expects before any input is read) is not judged by its input.
          const expectsRefusal = !!body && body.statements.some((x) => x.keyword === 'CATCH');
          const noInput = !expectsRefusal && calls.some((c) => c.target !== null && !!inputContracts.get(c.target)?.has(c.method) && !namedArgs(c.args).includes(INPUT_PARAM));
          if (noInput) {
            counts.withoutInput = (counts.withoutInput ?? 0) + 1;
            (counts.withoutInputNames ??= []).push(key);
          } else if (body && guardedOnly(body.statements)) {
            counts.guardedOnly = (counts.guardedOnly ?? 0) + 1;
            (counts.guardedOnlyNames ??= []).push(key);
          } else if (body && !expectsRefusal && emptyInputOnly(body.statements, calls, cut)) {
            counts.emptyInputOnly = (counts.emptyInputOnly ?? 0) + 1;
            (counts.emptyInputOnlyNames ??= []).push(key);
          } else counts.tests++;
        } else {
          counts.noCall++;
          counts.noCallNames.push(key);
        }
      }
    }
  }
  return counts;
}

/** "3 of 45 test methods call the code under test; 40 only skip and 2 do not call it — not counted as tests." */
export function abapUnitCountsSentence(c: AbapUnitCounts): string {
  if (c.methods === 0) return 'No ABAP Unit test method.';
  const not: string[] = [];
  if (c.skipped) not.push(`${c.skipped} ${c.skipped === 1 ? 'skips' : 'skip'}`);
  if (c.noCall) not.push(`${c.noCall} ${c.noCall === 1 ? 'does' : 'do'} not call it`);
  if (c.withoutData) not.push(`${c.withoutData} ${c.withoutData === 1 ? 'calls' : 'call'} it without its case data`);
  if (c.withoutInput) not.push(`${c.withoutInput} ${c.withoutInput === 1 ? 'calls' : 'call'} the run without handing in its input (${INPUT_PARAM})`);
  if (c.guardedOnly) not.push(`${c.guardedOnly} ${c.guardedOnly === 1 ? 'asserts only when the row it reads is' : 'assert only when the row they read is'} found`);
  if (c.emptyInputOnly) not.push(`${c.emptyInputOnly} ${c.emptyInputOnly === 1 ? 'calls' : 'call'} it with an empty input only and ${c.emptyInputOnly === 1 ? 'checks' : 'check'} no more than that a result comes back`);
  return `${c.tests} of ${c.methods} ABAP Unit test ${c.methods === 1 ? 'method calls' : 'methods call'} the code under test${not.length ? `; ${not.join(' and ')} — not counted as tests` : ''}.`;
}

/**
 * The golden master class in a test include, as the engine wrote it: its case methods, whether their rows reach the
 * logic, and how many compare a result of the original (3.0.14 item 8: the others skip after running — not compared).
 */
export function goldenMasterInInclude(content: string): { cases: number; rowsPassed: boolean; compared: number; notCarried?: number } | null {
  const at = content.search(/CLASS\s+ltc_golden_master\s+DEFINITION/i);
  if (at < 0) return null;
  const rest = content.slice(at);
  const cases = (rest.match(/METHODS\s+case_\d+\s+FOR\s+TESTING/gi) ?? []).length;
  const runCase = /METHOD\s+run_case\.([\s\S]*?)ENDMETHOD\./i.exec(rest)?.[1] ?? '';
  // A package stored before 3.0.14 asserted nothing and did not skip: none of its cases compared a result either.
  const bodies = [...rest.matchAll(/METHOD\s+case_\d+\.([\s\S]*?)ENDMETHOD\./gi)].map((m) => m[1]);
  const compared = bodies.filter((b) => /cl_abap_unit_assert=>assert_/i.test(b) && !/=>\s*skip\s*\(/i.test(b)).length;
  // QM-01: a case whose data the engine could not carry exactly skips without running (golden-master.ts).
  const notCarried = bodies.filter((b) => /=>\s*skip\s*\(\s*msg\s*=\s*'Case \d+ not carried over:/i.test(b)).length;
  return { cases, rowsPassed: !/"\s*Not passed:/i.test(runCase), compared, ...(notCarried ? { notCarried } : {}) };
}

export interface AbapTestEvidence {
  /** Every test class together. */
  counts: AbapUnitCounts;
  /**
   * Owner decision 18.10.2026: the engine's classes (ltc_engine_cases, ltc_golden_master, ltc_counterparts) — what the
   * 3.0.17 acceptance C(7) counts — apart from the testing model's (ltcl_…), a proposal and not evidence.
   */
  engine?: AbapUnitCounts;
  model?: AbapUnitCounts & { classes: string[] };
  goldenMaster: { cases: number; rowsPassed: boolean; compared: number; notCarried?: number } | null;
}

/**
 * The ABAP Unit evidence of a stored package: the engine's test includes plus
 * the testing model's class, counted against the package's own classes.
 * Null when the stored code holds no ABAP class.
 */
export function abapTestEvidence(files: ReadonlyArray<{ path: string; content: string }>, modelSuiteCode: string | null | undefined): AbapTestEvidence | null {
  const classes = files.filter((f) => /\.(clas|intf)\.abap$/i.test(f.path));
  if (classes.length === 0) return null;
  const includes = files.filter((f) => /\.clas\.testclasses\.abap$/i.test(f.path));
  const tests = [...includes, ...(typeof modelSuiteCode === 'string' && modelSuiteCode.trim() ? [{ path: 'model-suite.abap', content: modelSuiteCode }] : [])];
  const underTest = abapDeclarations(classes).keys();
  const golden = includes.map((f) => goldenMasterInInclude(f.content)).find((g) => g !== null) ?? null;
  const contracts = abapInputContracts(classes.filter((f) => !/\.clas\.testclasses\.abap$/i.test(f.path)));
  const underTestNames = [...underTest];
  const counts = countAbapUnitTests(tests, underTestNames, contracts);
  const isEngine = (c: string) => RESERVED_TEST_CLASSES.includes(c);
  const engine = countAbapUnitTests(tests, underTestNames, contracts, isEngine);
  const modelCounts = countAbapUnitTests(tests, underTestNames, contracts, (c) => !isEngine(c));
  const modelClasses = [...new Set(tests.flatMap((t) => [...abapDeclarations([t]).values()].filter((d) => d.forTesting && d.kind === 'class' && !isEngine(d.name)).map((d) => d.name)))];
  // A demo case whose rows do not reach the logic runs the logic, but not the case: it is not counted as a test.
  // Only the cases that compare a result are counted as tests at all; the others skip (3.0.14 item 8).
  if (golden && !golden.rowsPassed && golden.compared > 0) {
    const moved = Math.min(golden.compared, counts.tests);
    counts.tests -= moved;
    counts.withoutData = moved;
    const movedEngine = Math.min(golden.compared, engine.tests);
    engine.tests -= movedEngine;
    engine.withoutData = movedEngine;
  }
  return { counts, engine, ...(modelCounts.methods > 0 ? { model: { ...modelCounts, classes: modelClasses } } : {}), goldenMaster: golden };
}

/** The evidence of a project on the ABAP route, from its stored package and test suite; null on another route or without ABAP classes. */
export function abapTestEvidenceOfProject(project: { extensibilityRoute?: unknown; generatedCode?: unknown; testSuite?: unknown } | null | undefined): AbapTestEvidence | null {
  if (!project || !String(project.extensibilityRoute ?? '').includes('ABAP Cloud') || typeof project.generatedCode !== 'string') return null;
  const suite = (project.testSuite as { code?: unknown } | undefined)?.code;
  return abapTestEvidence(sandboxFilesFromStoredCode(project.generatedCode), typeof suite === 'string' ? suite : null);
}

/**
 * The sentences of a project on the ABAP route — the Testing page and STATUS.md read the same ones: "passed in SAP"
 * is the SAP result on record for this package when there is a current one.
 */
export function abapTestSentencesOfProject(
  project: (Parameters<typeof outsideReading>[0] & { generatedCode?: unknown; testSuite?: unknown }) | null | undefined,
): string[] | null {
  const e = abapTestEvidenceOfProject(project);
  if (!e) return null;
  const outside = outsideReading(project);
  return abapTestEvidenceSentences(e, outside.state === 'current' ? outside.summary : null);
}

/** The evidence as the testing stage and STATUS.md say it. */
export function abapTestEvidenceSentences(e: AbapTestEvidence, sap: GoldenMasterSapResult | null = null): string[] {
  // Owner decision 18.10.2026: the engine's classes are what the acceptance counts; the testing model's class is a
  // proposal (its preconditions and expectations are the model's) and is counted apart, never as evidence.
  const out = [e.engine ? `ABAP Unit, the engine's classes (${ENGINE_CLASS_WORDS} — what the acceptance counts): ${abapUnitCountsSentence(e.engine)}` : `ABAP Unit: ${abapUnitCountsSentence(e.counts)}`];
  if (e.goldenMaster && e.goldenMaster.cases > 0) {
    const n = e.goldenMaster.cases;
    const notCarried = e.goldenMaster.notCarried ?? 0;
    out.push(
      // 3.0.18 item 13: the fourth state from the SAP result on record, when there is one for this package.
      `${goldenMasterStates(n, e.goldenMaster.rowsPassed ? n - notCarried : 0, e.goldenMaster.compared, sap)} — ${goldenMasterComparedWords(n, e.goldenMaster.compared, notCarried)}` +
        (notCarried ? `; ${notCarriedWords(notCarried)}` : '') +
        (e.goldenMaster.rowsPassed ? '.' : ' — their input rows are not yet passed to the logic (its state has no component for them), so they run the logic without the case data.'),
    );
  }
  const named = (names: readonly string[] | undefined) => `${(names ?? []).slice(0, 8).join(', ')}${(names?.length ?? 0) > 8 ? ` and ${(names?.length ?? 0) - 8} more` : ''}`;
  if (e.counts.withoutInput)
    out.push(`Test does not hand in input — its expectation is not evidence: ${named(e.counts.withoutInputNames)} call the run without ${INPUT_PARAM}, so it runs on empty tables.`);
  if (e.counts.guardedOnly) out.push(`Test asserts only when its row is found — a missing row passes, so it is not evidence: ${named(e.counts.guardedOnlyNames)}.`);
  if (e.counts.emptyInputOnly)
    out.push(`Test calls it with an empty input only — it checks that a result comes back, not the rule its name stands for: ${named(e.counts.emptyInputOnlyNames)} pass ${INPUT_PARAM} = VALUE #( ) and assert only that the whole result is not initial.`);
  if (e.model) out.push(`${modelClassWords(e.model.classes)}: ${abapUnitCountsSentence(e.model)} A green or red method there says nothing about the logic until a reviewer confirms its preconditions and expected result.`);
  return out;
}

/**
 * Where the testing model's local test classes go in an engine-led package:
 * appended to the test include of the class under test, so the metadata file
 * and the source name the same class. Null when the package has no test include.
 */
export function placeModelTestClasses(files: ReadonlyArray<{ path: string; content: string }>, testCode: string): { path: string; content: string } | null {
  const include = files.find((f) => /\.clas\.testclasses\.abap$/i.test(f.path));
  if (!include) return null;
  // 3.0.15 (2): a suite stored before the check gets the same rewrite here — the class under test with the access
  // double, never the default access that calls SAP. What cannot be rewritten safely stays as written.
  const placed = withAccessDouble(testCode, accessSeamOf(files)).code;
  return {
    path: include.path,
    content: `${include.content.replace(/\s*$/, '')}\n\n"! Written by the testing model - a proposal, not evidence: Clean-Core.io checked its calls against the declarations, not its preconditions or expected results. The acceptance counts ltc_engine_cases, ltc_golden_master and ltc_counterparts.\n${placed.replace(/\s*$/, '')}\n`,
  };
}


/* ------------------------------------------- a real ABAP Unit run of the testing model's class (3.0.18 item 13) */

/**
 * One method of an ABAP Unit run in SAP: the ADT runner's result on the trial (`scripts/acceptance/trial-rap.ts`), or
 * a result file from the reader's system (`lib/test-result-import.ts`: `classname`, `name`, the failure message).
 */
export interface SapUnitMethod {
  testClass: string;
  method: string;
  outcome: 'passed' | 'failed' | 'skipped';
  message: string | null;
}

/** How a red method of the testing model's class is named — never passed, never counted with the engine's. */
export const MODEL_RED_IN_SAP = 'AI-generated, red in SAP';

/** The engine's test classes (ltc_engine_cases, ltc_golden_master, ltc_counterparts): what C(7) counts. */
export const isEngineTestClass = (name: string) => RESERVED_TEST_CLASSES.includes(name.toLowerCase()) && name.toLowerCase() !== ACCESS_DOUBLE;

export interface SapUnitSplit {
  engine: { passed: number; failed: number; skipped: number };
  /** The testing model's classes: a proposal, not evidence (owner decision 18.10.2026, C(7)). */
  model: { passed: number; failed: number; skipped: number };
  /** Every red method in words: "ltc_engine_cases=>tc_eng_g12 — …", "AI-generated, red in SAP: ltcl_test=>tc_03 — …". */
  red: string[];
}

/** A run in SAP split as the acceptance counts it (owner decision 18.10.2026): the engine's classes apart from the model's. */
export function splitSapUnitRun(methods: readonly SapUnitMethod[]): SapUnitSplit {
  const count = (ms: readonly SapUnitMethod[]) => ({
    passed: ms.filter((m) => m.outcome === 'passed').length,
    failed: ms.filter((m) => m.outcome === 'failed').length,
    skipped: ms.filter((m) => m.outcome === 'skipped').length,
  });
  const engine = methods.filter((m) => isEngineTestClass(m.testClass));
  const model = methods.filter((m) => !isEngineTestClass(m.testClass));
  const red = methods
    .filter((m) => m.outcome === 'failed')
    .map((m) => `${isEngineTestClass(m.testClass) ? '' : `${MODEL_RED_IN_SAP}: `}${m.testClass.toLowerCase()}=>${m.method.toLowerCase()}${m.message ? ` — ${m.message}` : ''}`);
  return { engine: count(engine), model: count(model), red };
}

/** At most this many methods go into the one repair round: the round repairs what SAP named, not the class. */
export const MAX_MODEL_REPAIR_METHODS = 12;

export interface ModelTestRepairRequest {
  /** The red methods of the model's classes that the suite implements, with SAP's message. */
  methods: Array<{ testClass: string; method: string; message: string | null }>;
  /** The repair section for the testing prompt: exactly these methods, SAP's message each. */
  prompt: string;
}

/** The `METHOD name. … ENDMETHOD.` spans of a class's implementation in a source (lower-case names, character offsets). */
function methodSpans(code: string, testClass: string): Map<string, { start: number; end: number }> {
  const out = new Map<string, { start: number; end: number }>();
  const impl = new RegExp(`^[ \\t]*CLASS\\s+${testClass.replace(/[^\w/]/g, '')}\\s+IMPLEMENTATION\\s*\\.`, 'im').exec(code);
  if (!impl) return out;
  const from = impl.index + impl[0].length;
  const endClass = /^[ \t]*ENDCLASS\s*\./im.exec(code.slice(from));
  const body = code.slice(from, endClass ? from + endClass.index : code.length);
  for (const m of body.matchAll(/^[ \t]*METHOD\s+([\w/~]+)\s*\.[\s\S]*?^[ \t]*ENDMETHOD\s*\./gim)) {
    out.set(m[1].toLowerCase(), { start: from + (m.index ?? 0), end: from + (m.index ?? 0) + m[0].length });
  }
  return out;
}

/**
 * The bounded repair of the testing model's class against a real ABAP Unit run (roadmap 3.0.18 item 13; the PM trial
 * of 18.10.2026: 4 red methods, all of the model's class, all with wrong preconditions — the engine's case of the same
 * check was green). Only the red methods of the model's classes that the suite implements, at most
 * MAX_MODEL_REPAIR_METHODS, each with SAP's message; null when there is none. One round: what is still red after the
 * next run stays a proposal, red in SAP.
 */
export function modelTestRepairRequest(suiteCode: string, run: readonly SapUnitMethod[]): ModelTestRepairRequest | null {
  const methods = run
    .filter((m) => m.outcome === 'failed' && !isEngineTestClass(m.testClass))
    .filter((m) => methodSpans(suiteCode, m.testClass).has(m.method.toLowerCase()))
    .slice(0, MAX_MODEL_REPAIR_METHODS)
    .map((m) => ({ testClass: m.testClass.toLowerCase(), method: m.method.toLowerCase(), message: m.message }));
  if (methods.length === 0) return null;
  return {
    methods,
    prompt: [
      'ABAP UNIT RAN IN SAP. These methods of your test class failed there, with SAP\'s message:',
      ...methods.map((m) => `- ${m.testClass}=>${m.method}: ${m.message ?? 'no message'}`),
      'A failed method here is a test whose preconditions or expected result do not fit the class under test (the engine\'s own cases of the same checks are separate). '
        + 'Rewrite exactly these methods: set up the input the logic reads, and expect what the ORIGINAL ABAP gives for it. '
        + 'Answer with one METHOD … ENDMETHOD. block per method named above and nothing else; every other method stays as it is.',
    ].join('\n'),
  };
}

export interface ModelTestRepairMerge {
  code: string;
  /** `class=>method` replaced by the answer. */
  replaced: string[];
  /** What the answer was not allowed to change, or did not answer: kept as before. */
  refused: Array<{ method: string; reason: string }>;
}

/**
 * The answer of the one repair round merged into the suite: only the methods the request named, each inside its own
 * class's implementation; a method the request did not name is refused and the suite keeps its version, a requested
 * method the answer does not hold stays as it was. The merged class goes through `checkAbapTestClass` like any other.
 */
export function mergeRepairedModelMethods(suiteCode: string, answer: string, request: ModelTestRepairRequest): ModelTestRepairMerge {
  const asked = new Map(request.methods.map((m) => [m.method, m.testClass]));
  const given = new Map<string, string>();
  const refused: ModelTestRepairMerge['refused'] = [];
  for (const m of answer.matchAll(/^[ \t]*METHOD\s+([\w/~]+)\s*\.[\s\S]*?^[ \t]*ENDMETHOD\s*\./gim)) {
    const name = m[1].toLowerCase();
    if (!asked.has(name)) refused.push({ method: name, reason: 'not one of the methods SAP named red: the suite keeps its version' });
    else given.set(name, m[0].trim());
  }
  let code = suiteCode;
  const replaced: string[] = [];
  // From the end of the source backwards, so the offsets of the spans still to replace stay valid.
  const targets = request.methods
    .map((m) => ({ ...m, span: methodSpans(suiteCode, m.testClass).get(m.method) }))
    .filter((m): m is typeof m & { span: { start: number; end: number } } => !!m.span)
    .sort((a, b) => b.span.start - a.span.start);
  for (const t of targets) {
    const block = given.get(t.method);
    if (!block) {
      refused.push({ method: t.method, reason: 'not answered: the method stays as it was, red in SAP' });
      continue;
    }
    const indent = /^[ \t]*/.exec(code.slice(t.span.start))![0];
    code = `${code.slice(0, t.span.start)}${block.split('\n').map((l, i) => (i === 0 ? `${indent}${l.trimStart()}` : l)).join('\n')}${code.slice(t.span.end)}`;
    replaced.push(`${t.testClass}=>${t.method}`);
  }
  return { code, replaced: replaced.reverse(), refused };
}
