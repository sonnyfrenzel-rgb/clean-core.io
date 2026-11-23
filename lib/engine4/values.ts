/**
 * Engine 4.0, L4: which values can a name hold here — one scoped, sound reading
 * (docs/design/engine4.md, "L4: values"; the engine review of 22.11.2026, A1–A3).
 *
 * The question is asked of a variable at a statement ("which function module
 * does `CALL FUNCTION lv_fm` call?"). The answer is one value only when the
 * source proves it; otherwise it is open and lists every value the source can
 * put in. Soundness is the rule: a change to the source that adds a path — a
 * routine moved, a write wrapped in IF or DO, another call site — may make an
 * answer less certain, never a different single value
 * (`tests/engine4-values.spec.ts`, metamorphic specs).
 *
 *   - **Scope** (from L2): a name declared in a FORM, method, function module or
 *     module (DATA, STATICS, CONSTANTS, inline declarations, its parameters) is
 *     that routine's; an attribute of a class is the class's; everything else is
 *     global. Only writes in the same scope count.
 *   - **Straight path:** the last mention before the use is a literal write in
 *     the same processing unit (routine or event block), in the same branch of
 *     every block around both; no loop around the use but not the write mentions
 *     the name; and, for a name that is not routine-local, no call stands between
 *     them (a call may run a routine that writes it) and no call stands in such a
 *     loop.
 *   - **FORM parameters** are closed over every `PERFORM` call site of the
 *     source: each actual is resolved where the call stands (literal, constant,
 *     or recursively). One value at every site is `parameter`; values that
 *     differ, or a site that stays open, make the answer open.
 *   - **Every write in scope:** the same literal everywhere is `onlyValue`
 *     (`value` when it is only the declaration's `VALUE`).
 *   - Otherwise **open**: `candidates` lists every value the source can put in.
 *
 * Every answer carries its provenance: the writes (and call sites) it read.
 * Pure (ADR-125): imports only within `lib/engine4/`. On the product path from engine 3.4.0 through
 * `references.ts` (the class gap, ADR-141), which reads its static references only.
 */
import type { Block, BlockTree } from './blocks';
import type { Statement } from './statements';
import type { Token } from './tokens';

export type ValueResolution =
  /** A constant of the scope (`CONSTANTS c … VALUE 'X'`). */
  | 'constant'
  /** The variable's start value (`DATA v … VALUE 'X'`), never written again in its scope. */
  | 'value'
  /** A literal assigned on the straight path before the use. */
  | 'assigned'
  /** A FORM parameter that every call site passes the same value. */
  | 'parameter'
  /** Every write in the scope puts the same literal in. */
  | 'onlyValue'
  /** Not one value: `candidates` lists what the source can put in. */
  | 'dynamic';

export interface Provenance {
  row: number;
  /** The literal written, or null for a write the reading cannot see into (INTO, CHANGING, an expression). */
  value: string | null;
  how: 'declaration' | 'constant' | 'assignment' | 'move' | 'other' | 'callSite';
}

export interface ValueAnswer {
  /** Upper-cased; null when open. */
  name: string | null;
  resolution: ValueResolution;
  /** The row the answer rests on (the write, the constant), or null when open or when it rests on several. */
  row: number | null;
  /** Every value the source can put in, upper-cased, in source order (only for `dynamic`, may be empty). */
  candidates?: string[];
  /** The writes and call sites the answer read. */
  provenance: Provenance[];
  /** The scope the name was read in: `global`, `class:<name>` or `routine:<kind> <name>`. */
  scope: string;
}

/** A word unit with `-` joined, or a literal, or another token — as the reference table reads them. */
interface Unit { up: string; kind: 'name' | 'literal' | 'other'; token: Token; value?: string }

const LITERAL_KINDS = new Set(['textLiteral', 'stringLiteral', 'template']);

function literalValue(t: Token): string {
  const q = t.text[0];
  const body = t.text.slice(1, t.text.endsWith(q) && t.text.length > 1 ? -1 : undefined);
  return q === "'" ? body.replace(/''/g, "'") : q === '`' ? body.replace(/``/g, '`') : body;
}

function unitsOf(tokens: readonly Token[]): Unit[] {
  const out: Unit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'word') {
      let text = t.text;
      i += 1;
      while (i + 1 < tokens.length && tokens[i].kind === 'punct' && tokens[i].text === '-' && !tokens[i].spaceBefore && !tokens[i + 1].spaceBefore && tokens[i + 1].kind === 'word') {
        text += `-${tokens[i + 1].text}`;
        i += 2;
      }
      out.push({ up: text.toUpperCase(), kind: 'name', token: t });
      continue;
    }
    if (LITERAL_KINDS.has(t.kind)) out.push({ up: t.text.toUpperCase(), kind: 'literal', token: t, value: literalValue(t) });
    else out.push({ up: t.text.toUpperCase(), kind: 'other', token: t });
    i += 1;
  }
  return out;
}

const DECLARING = new Set(['Data', 'ClassData', 'Statics', 'Constants', 'Parameters', 'SelectOptions', 'FieldSymbols', 'Ranges', 'Tables', 'Nodes']);
const ROUTINES = new Set(['form', 'function', 'module', 'method']);
const LOOPS = new Set(['loop', 'do', 'while', 'select', 'provide']);
/** Statements that may run another routine, which may write a name that is not routine-local. */
const CALL_KINDS = new Set([
  'Perform', 'CallFunction', 'CallMethod', 'MethodCall', 'CallScreen', 'CallTransaction', 'CallSelectionScreen', 'CallBadi', 'CallDialog',
  'CallCustomerFunction', 'CallDatabaseProcedure', 'Call', 'Submit', 'CreateObject', 'RaiseEvent', 'RaiseException', 'MacroCall', 'Unknown',
]);
const RANK: Record<ValueResolution, number> = { constant: 5, value: 4, assigned: 4, parameter: 3, onlyValue: 2, dynamic: 0 };

/** How certain an answer is: a transformation of the source may only lower it. */
export function certainty(r: ValueResolution): number {
  return RANK[r];
}

/** The units of a statement behind its keyword (a declaration's after `DATA`, a chain part's own). */
function ownUnits(s: Statement): Unit[] {
  const own = unitsOf(s.tokens.slice(s.headCount));
  return s.headCount === 0 && (DECLARING.has(s.kind) || s.kind === 'Types') ? own.slice(1) : own;
}

/** Does the statement call something that may run other code (a call statement, a functional call)? */
function mayCall(s: Statement): boolean {
  if (CALL_KINDS.has(s.kind)) return true;
  if (DECLARING.has(s.kind) || s.kind === 'Types') return false;
  const t = s.tokens;
  for (let i = 1; i < t.length; i++) {
    if (t[i].text !== '(' || t[i].spaceBefore || t[i - 1].kind !== 'word') continue;
    const w = t[i - 1].text.toUpperCase();
    if (w === 'DATA' || w === 'FINAL' || w === 'FIELD-SYMBOL') continue;
    // `lv+6(2)` is an offset, `(name)` a dynamic name: the word before `(` is the callee only without `+`.
    if (i >= 2 && t[i - 2].text === '+' && !t[i - 1].spaceBefore) continue;
    return true;
  }
  return false;
}

interface Mention { statement: number; row: number; value: string | null; how: Provenance['how']; declared: boolean; constant: boolean }

/** What one statement does to `name`: a literal write, another mention, or nothing. */
function mentionIn(s: Statement, name: string): Mention | null {
  const u = ownUnits(s);
  const at = u.findIndex((x) => x.kind === 'name' && x.up === name);
  if (at < 0) {
    // Inline `DATA(name)` is a declaration with a write.
    const all = unitsOf(s.tokens);
    const k = all.findIndex((x, i) => (x.up === 'DATA' || x.up === 'FINAL') && all[i + 1]?.up === '(' && all[i + 2]?.up === name);
    if (k < 0) return null;
    const lit = s.kind === 'Assignment' && all.length === k + 6 && all[k + 4]?.up === '=' && all[k + 5]?.kind === 'literal' ? all[k + 5].value ?? null : null;
    return { statement: s.index, row: all[k + 2].token.row, value: lit, how: lit !== null ? 'assignment' : 'other', declared: true, constant: false };
  }
  const row = u[at].token.row;
  // A signature names its parameters: a declaration, not a write.
  if (s.kind === 'Form' || s.kind === 'Methods' || s.kind === 'ClassMethods') {
    return { statement: s.index, row, value: null, how: 'declaration', declared: true, constant: false };
  }
  if (DECLARING.has(s.kind) && at === 0) {
    const v = u.findIndex((x) => x.up === 'VALUE');
    const value = v > 0 && u[v + 1]?.kind === 'literal' ? (u[v + 1].value ?? null) : null;
    return { statement: s.index, row, value, how: s.kind === 'Constants' ? 'constant' : 'declaration', declared: true, constant: s.kind === 'Constants' };
  }
  if (s.kind === 'Assignment' && at === 0 && u[1]?.up === '=') {
    return { statement: s.index, row, value: u.length === 3 && u[2].kind === 'literal' ? (u[2].value ?? null) : null, how: 'assignment', declared: false, constant: false };
  }
  if (s.kind === 'Move' && u[at - 1]?.up === 'TO') {
    return { statement: s.index, row, value: u.length === 4 && u[1].kind === 'literal' ? (u[1].value ?? null) : null, how: 'move', declared: false, constant: false };
  }
  // Any other mention may write it (INTO, CHANGING, CLEAR, a parameter, …): no literal the reading can see.
  return { statement: s.index, row, value: null, how: 'other', declared: false, constant: false };
}

/** A routine and its parameters, by section (`TABLES`, `USING`, `CHANGING`) for a FORM. */
interface Routine { block: Block; kind: string; name: string; params: Set<string>; formSections?: Map<string, string[]> }

export interface ValueContext {
  list: readonly Statement[];
  tree: BlockTree;
  /** Statement index → the innermost routine block around it, or null. */
  routineOf: Array<Block | null>;
  /** Statement index → the innermost routine or event block (the unit code runs in), or the program. */
  unitOf: Block[];
  /** Statement index → the innermost CLASS block around it, or null. */
  classOf: Array<Block | null>;
  routines: Map<number, Routine>;
  /** Names declared inside each routine (block id). */
  locals: Map<number, Set<string>>;
  /** Attributes declared in each class definition (by class name). */
  attributes: Map<string, Set<string>>;
  /** `PERFORM` statements by the FORM they call. */
  performs: Map<string, Statement[]>;
  /** FORMs called where the reading cannot see the arguments (`IN PROGRAM`, `f(prog)`); `*` after a dynamic `PERFORM (lv)`. */
  openPerforms: Set<string>;
  /** Statement indices that may call other code. */
  calls: Uint8Array;
  /** Mentions per name, in source order (built on first use). */
  mentions: Map<string, Mention[]>;
  /** Statements that only read the names asked about (the uses themselves, e.g. `CALL FUNCTION lv_fm`): no mention. */
  reads: ReadonlySet<number>;
}

/** The parameter names of a signature (`FORM`, `METHODS`): by section, in order. */
function signature(u: readonly Unit[], from: number): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let section = 'USING';
  const STOP = new Set(['RAISING', 'EXCEPTIONS', 'ABSTRACT', 'FINAL', 'REDEFINITION', 'FOR', 'DEFAULT']);
  for (let i = from; i < u.length; i++) {
    const w = u[i].up;
    if (['TABLES', 'USING', 'CHANGING', 'IMPORTING', 'EXPORTING', 'RETURNING'].includes(w)) { section = w; continue; }
    if (STOP.has(w)) { section = ''; continue; }
    if (!section) continue;
    if (['TYPE', 'LIKE', 'STRUCTURE'].includes(w)) {
      i += 1;
      while (u[i + 1] && ['REF', 'TO', 'TABLE', 'OF', 'STANDARD', 'LINE', 'RANGE'].includes(u[i].up)) i += 1;
      continue;
    }
    if ((w === 'VALUE' || w === 'REFERENCE') && u[i + 1]?.up === '(' && u[i + 2]?.kind === 'name') {
      (sections.get(section) ?? sections.set(section, []).get(section)!).push(u[i + 2].up);
      i += 3;
      continue;
    }
    if (u[i].kind === 'name' && /^[A-Z_\/][A-Z0-9_\/]*$/.test(w) && w !== 'OPTIONAL') {
      (sections.get(section) ?? sections.set(section, []).get(section)!).push(w);
    }
  }
  return sections;
}

/** Build the scopes of a read source once; `valueAt` answers from it. */
export function valueContext(list: readonly Statement[], tree: BlockTree, reads: ReadonlySet<number> = new Set()): ValueContext {
  const routineOf: Array<Block | null> = new Array(list.length).fill(null);
  const unitOf: Block[] = new Array(list.length).fill(tree.root);
  const classOf: Array<Block | null> = new Array(list.length).fill(null);
  for (let i = 0; i < list.length; i++) {
    let unit: Block | null = null;
    for (let b: Block | null = tree.blocks[tree.owner[i]] ?? null; b; b = b.parent) {
      if (!routineOf[i] && ROUTINES.has(b.kind)) routineOf[i] = b;
      if (!unit && (ROUTINES.has(b.kind) || b.kind === 'event')) unit = b;
      if (!classOf[i] && b.kind === 'class') classOf[i] = b;
    }
    unitOf[i] = unit ?? tree.root;
  }
  // METHODS signatures by class and method, read from the class definitions.
  const methodParams = new Map<string, Set<string>>();
  const attributes = new Map<string, Set<string>>();
  for (const s of list) {
    const cls = classOf[s.index];
    if (!cls || !cls.name || routineOf[s.index]) continue;
    const u = unitsOf(s.tokens);
    if ((s.kind === 'Methods' || s.kind === 'ClassMethods') && u[1]) {
      const params = new Set([...signature(u, 2).values()].flat());
      methodParams.set(`${cls.name}|${u[1].up}`, params);
    }
    if (DECLARING.has(s.kind)) {
      const own = ownUnits(s);
      const first = own[0]?.up === 'BEGIN' || own[0]?.up === 'END' ? own[2]?.up : own[0]?.up;
      if (first) (attributes.get(cls.name) ?? attributes.set(cls.name, new Set()).get(cls.name)!).add(first);
    }
  }
  const routines = new Map<number, Routine>();
  const locals = new Map<number, Set<string>>();
  for (const b of tree.blocks) {
    if (!ROUTINES.has(b.kind) || b.opener === null) continue;
    const u = unitsOf(list[b.opener].tokens);
    const name = b.name ?? '';
    let params = new Set<string>();
    let formSections: Map<string, string[]> | undefined;
    if (b.kind === 'form') {
      formSections = signature(u, 2);
      params = new Set([...formSections.values()].flat());
    } else if (b.kind === 'method') {
      let cls: Block | null = b.parent;
      while (cls && cls.kind !== 'class') cls = cls.parent;
      params = methodParams.get(`${cls?.name ?? ''}|${name}`) ?? new Set();
    }
    routines.set(b.id, { block: b, kind: b.kind, name, params, formSections });
    locals.set(b.id, new Set(params));
  }
  for (const s of list) {
    const r = routineOf[s.index];
    if (!r) continue;
    const set = locals.get(r.id)!;
    if (DECLARING.has(s.kind) && s.kind !== 'Tables' && s.kind !== 'Nodes') {
      const own = ownUnits(s);
      const first = own[0]?.up === 'BEGIN' || own[0]?.up === 'END' ? own[2]?.up : own[0]?.up;
      if (first) set.add(first);
    }
    const all = unitsOf(s.tokens);
    for (let i = 0; i + 2 < all.length; i++) {
      if ((all[i].up === 'DATA' || all[i].up === 'FINAL' || all[i].up === 'FIELD-SYMBOL') && all[i + 1].up === '(' && !all[i + 1].token.spaceBefore) set.add(all[i + 2].up);
    }
  }
  const performs = new Map<string, Statement[]>();
  const openPerforms = new Set<string>();
  const calls = new Uint8Array(list.length);
  for (const s of list) {
    if (mayCall(s)) calls[s.index] = 1;
    if (s.kind !== 'Perform') continue;
    const u = unitsOf(s.tokens);
    // `PERFORM (lv) …`: any FORM may be called, with arguments the reading cannot see.
    if (u[1]?.up === '(') { openPerforms.add('*'); continue; }
    const name = u[1]?.up;
    if (!name) continue;
    // `PERFORM f IN PROGRAM x` and `PERFORM f(x)` may call a FORM of this source (x = sy-repid); its arguments
    // are read like any other call site's, but the site stays unresolved for a closed answer.
    if (u.some((x) => x.up === 'PROGRAM') || (u[2]?.up === '(' && !u[2].token.spaceBefore)) { openPerforms.add(name); continue; }
    (performs.get(name) ?? performs.set(name, []).get(name)!).push(s);
  }
  return { list, tree, routineOf, unitOf, classOf, routines, locals, attributes, performs, openPerforms, calls, mentions: new Map(), reads };
}

/** The scope `name` has at statement `i`. */
function scopeAt(c: ValueContext, name: string, i: number): string {
  const r = c.routineOf[i];
  if (r && c.locals.get(r.id)?.has(name)) return `routine:${r.kind} ${r.name ?? ''}#${r.id}`;
  const cls = c.classOf[i];
  if (cls?.name && c.attributes.get(cls.name)?.has(name)) return `class:${cls.name}`;
  return 'global';
}

function mentionsOf(c: ValueContext, name: string): Mention[] {
  let m = c.mentions.get(name);
  if (!m) {
    m = [];
    for (const s of c.list) {
      if (s.context === 'native' || c.reads.has(s.index)) continue;
      const x = mentionIn(s, name);
      if (x) m.push(x);
    }
    c.mentions.set(name, m);
  }
  return m;
}

/** For each block around statement `i`, the branch it stands in. */
function branchPath(tree: BlockTree, i: number): string[] {
  const out: string[] = [];
  for (let b: Block | null = tree.blocks[tree.owner[i]] ?? null; b; b = b.parent) {
    const k = b.branches.findIndex((br) => br.first <= i && i <= br.last);
    out.push(`${b.id}:${k}`);
  }
  return out.reverse();
}

/** Loop blocks around statement `i`, innermost first. */
function loopsAround(tree: BlockTree, i: number): Block[] {
  const out: Block[] = [];
  for (let b: Block | null = tree.blocks[tree.owner[i]] ?? null; b; b = b.parent) if (LOOPS.has(b.kind) && b.opener !== i) out.push(b);
  return out;
}

const prov = (m: Mention): Provenance => ({ row: m.row, value: m.value, how: m.how });
const uniq = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => x !== null).map((x) => x.toUpperCase()))];

/** The straight-path write of `name` before statement `at`, or null. */
function straight(c: ValueContext, inScope: Mention[], at: number, local: boolean): Mention | null {
  const before = inScope.filter((m) => m.statement < at && !(m.declared && m.value === null && !m.constant));
  const last = before[before.length - 1];
  if (!last || last.value === null) return null;
  if (c.unitOf[last.statement] !== c.unitOf[at]) return null;
  const pw = branchPath(c.tree, last.statement);
  const pu = branchPath(c.tree, at);
  if (!pw.every((p, k) => pu[k] === p)) return null;
  // A call between write and use may run a routine that writes a name that is not routine-local.
  if (!local) for (let k = last.statement + 1; k < at; k++) if (c.calls[k]) return null;
  // A loop around the use but not the write runs again: a later mention in it, or a call in it, reaches the use.
  for (const loop of loopsAround(c.tree, at)) {
    if (loop.first <= last.statement && last.statement <= loop.last) break;
    if (inScope.some((m) => m.statement !== at && m.statement >= loop.first && m.statement <= loop.last)) return null;
    if (!local) for (let k = loop.first; k <= loop.last; k++) if (k !== at && c.calls[k]) return null;
  }
  return last;
}

/**
 * Which values can `name` (upper-cased) hold at statement `at`? `depth` bounds
 * the recursion through FORM parameters (a parameter's actual is resolved at its
 * call site, whose actual may be a parameter again).
 */
export function valueAt(c: ValueContext, name: string, at: number, depth = 0): ValueAnswer {
  const scope = scopeAt(c, name, at);
  const local = scope.startsWith('routine:');
  const all = mentionsOf(c, name);
  const inScope = all.filter((m) => m.statement !== at && scopeAt(c, name, m.statement) === scope);
  const constant = inScope.find((m) => m.constant && m.value !== null);
  if (constant) return { name: constant.value!.toUpperCase(), resolution: 'constant', row: constant.row, provenance: [prov(constant)], scope };
  const writes = inScope.filter((m) => !(m.declared && m.value === null));
  const provenance = writes.map(prov);
  const s = straight(c, inScope, at, local);
  if (s) return { name: s.value!.toUpperCase(), resolution: s.declared ? 'value' : 'assigned', row: s.row, provenance: [prov(s)], scope };

  // A FORM parameter: closed over every call site.
  const routine = c.routineOf[at];
  const r = routine ? c.routines.get(routine.id) : undefined;
  let siteValues: Array<string | null> = [];
  let parameter = false;
  if (local && r?.kind === 'form' && r.params.has(name) && r.formSections) {
    parameter = true;
    let section = '';
    let pos = -1;
    for (const [sec, names] of r.formSections) if (names.includes(name)) { section = sec; pos = names.indexOf(name); }
    const sites = c.performs.get(r.name) ?? [];
    // Closed world of the upload: no call site, a site the reading cannot see into, or too deep a chain stays open.
    if (sites.length === 0 || depth >= 4 || c.openPerforms.has(r.name) || c.openPerforms.has('*')) siteValues = [null];
    for (const site of sites) {
      if (depth >= 4) break;
      const actual = actualAt(site, section, pos);
      let v: string | null = null;
      if (actual?.kind === 'literal') v = actual.value ?? null;
      else if (actual?.kind === 'name') v = valueAt(c, actual.up, site.index, depth + 1).name;
      siteValues.push(v);
      provenance.push({ row: site.start.row, value: v, how: 'callSite' });
    }
  }
  // Off the straight path, the start value can reach the use too: the declaration's `VALUE`, or the type's
  // initial value (blank, no object name) when it has none. A parameter starts with what its caller passed.
  const startValue = parameter || writes.some((w) => w.declared && w.value !== null);
  const values = [...writes.map((w) => w.value), ...siteValues, ...(startValue ? [] : [null])];
  const candidates = uniq(values);
  const closed = values.length > 0 && values.every((v) => v !== null) && candidates.length === 1;
  if (closed && parameter && writes.length === 0) return { name: candidates[0], resolution: 'parameter', row: null, provenance, scope };
  if (closed) {
    const resolution: ValueResolution = writes.length === 1 && writes[0].declared && !parameter ? 'value' : 'onlyValue';
    return { name: candidates[0], resolution, row: writes.length === 1 ? writes[0].row : null, provenance, scope };
  }
  return { name: null, resolution: 'dynamic', row: null, candidates, provenance, scope };
}

/** The actual parameter at `pos` of section `section` in a PERFORM statement. */
function actualAt(s: Statement, section: string, pos: number): Unit | null {
  const u = unitsOf(s.tokens);
  let sec = '';
  let k = -1;
  for (let i = 2; i < u.length; i++) {
    const w = u[i].up;
    if (['TABLES', 'USING', 'CHANGING'].includes(w) && u[i].kind === 'name') { sec = w; k = -1; continue; }
    if (w === 'IF' && u[i + 1]?.up === 'FOUND') break;
    if (!sec || (u[i].kind !== 'name' && u[i].kind !== 'literal')) continue;
    k += 1;
    if (sec === section && k === pos) return u[i];
  }
  return null;
}
