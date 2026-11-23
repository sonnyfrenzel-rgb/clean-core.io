/**
 * Engine 4.0, L5 first step: the call graph (engine review §8.1; docs/design/engine4.md, "L5: calls").
 *
 * `callGraph(statements, tree)` lists every routine of a read source — FORMs, methods (`CLASS=>M`), function
 * modules, dialog modules, event blocks and the program level — and one edge per call:
 *
 *   - `PERFORM f` (static), `PERFORM (lv)` (dynamic: every FORM `values.ts` says `lv` can name, or open),
 *     `PERFORM f IN PROGRAM p` / `f(p)` (external);
 *   - `CALL FUNCTION`: to the function module of this source, else external, through the reference table, so a
 *     name in a variable is resolved by the value reading;
 *   - method calls (`lo->m( )`, `CALL METHOD`, `cls=>m( )`, `me->m( )`, a bare `m( )`, `super->m( )`): the class
 *     comes from the call (`cls=>`, `me`, the own class, the superclass) or from the declared type of the
 *     receiver (`DATA lo TYPE REF TO x`, an attribute, a parameter). Then **dispatch**: the implementation the
 *     class inherits, plus every subclass that redefines the method; for an interface type every class that
 *     implements it. **FINAL prunes**: a FINAL class has no subclasses to dispatch to, a FINAL method is never
 *     redefined. `super->m` never dispatches;
 *   - constructors (`CREATE OBJECT`, `NEW x( )`) and `RAISE EVENT e` (every handler `FOR EVENT e`, as registered
 *     handlers are not followed yet: an over-approximation, marked `dispatch`).
 *
 * Reachability runs from the entries (event blocks, the program level, dialog modules, function modules,
 * public methods of a global class, class constructors, event handlers). It is `certain` only when no edge is
 * dynamic or unresolved. Pure and inert: imports only `./`.
 */
import type { Block, BlockTree } from './blocks';
import { declarations, type Declarations, type TypeDeclaration } from './declarations';
import { references } from './references';
import { unitsOf } from './statement-kinds';
import type { Statement } from './statements';
import { valueAt, valueContext } from './values';

export type RoutineKind = 'form' | 'method' | 'function' | 'module' | 'event' | 'program';

export interface Routine {
  key: string;
  kind: RoutineKind;
  name: string;
  block: number;
  row: number;
}

export type CallKind = 'perform' | 'function' | 'method' | 'constructor' | 'event';
export type CallHow = 'static' | 'dispatch' | 'dynamic' | 'external' | 'unresolved';

export interface CallEdge {
  from: string;
  /** The routine of this source called, or null for an external or unresolved call. */
  to: string | null;
  /** For an external call: what is called (`FM Z_X`, `CLASS=>M`, `PROGRAM ZP FORM F`). */
  external?: string;
  kind: CallKind;
  how: CallHow;
  statement: number;
  row: number;
}

export interface CallGraph {
  routines: Routine[];
  edges: CallEdge[];
  entries: string[];
  unreachable: string[];
  /** False when an edge is dynamic or unresolved: reachability is then a lower bound. */
  certain: boolean;
  declarations: Declarations;
}

const ROUTINE_KINDS = new Set(['form', 'method', 'function', 'module', 'event']);

/** The class block around a method block. */
function classOf(b: Block | null): Block | null {
  for (let x = b; x; x = x.parent) if (x.kind === 'class') return x;
  return null;
}

interface Model {
  classes: Map<string, TypeDeclaration>;
  interfaces: Map<string, TypeDeclaration>;
  superOf: Map<string, string>;
  subclasses: Map<string, string[]>;
  /** CLASS → implemented method name (`M`, `INTF~M`) → routine key. */
  impls: Map<string, Map<string, string>>;
}

function model(d: Declarations): Model {
  const m: Model = { classes: new Map(), interfaces: new Map(), superOf: new Map(), subclasses: new Map(), impls: new Map() };
  for (const t of d.types) {
    if (t.kind === 'class') m.classes.set(t.name, t);
    else m.interfaces.set(t.name, t);
    if (t.superclass) {
      m.superOf.set(t.name, t.superclass);
      (m.subclasses.get(t.superclass) ?? m.subclasses.set(t.superclass, []).get(t.superclass)!).push(t.name);
    }
  }
  for (const i of d.implementations) {
    const map = m.impls.get(i.name) ?? new Map<string, string>();
    for (const name of i.methods.keys()) map.set(name, `METHOD ${i.name}=>${name}`);
    m.impls.set(i.name, map);
  }
  return m;
}

/** The implementation class `cls` runs for method `name`: its own or the nearest superclass's. */
function lookup(m: Model, cls: string, name: string): string | null {
  const seen = new Set<string>();
  for (let c: string | undefined = cls; c && !seen.has(c); c = m.superOf.get(c)) {
    seen.add(c);
    const hit = m.impls.get(c)?.get(name);
    if (hit) return hit;
  }
  return null;
}

/** Is method `name` declared FINAL in `cls` or a superclass? */
function isFinalMethod(m: Model, cls: string, name: string): boolean {
  for (let c: string | undefined = cls; c; c = m.superOf.get(c)) {
    const t = m.classes.get(c);
    const decl = t?.methods.find((x) => x.name === name);
    if (decl) return decl.isFinal;
    if (!t) return false;
  }
  return false;
}

/** Every implementation a call of `name` on an object declared as `cls` can run. */
function dispatch(m: Model, cls: string, name: string): string[] {
  const out = new Set<string>();
  const own = lookup(m, cls, name);
  if (own) out.add(own);
  if (m.classes.get(cls)?.isFinal || isFinalMethod(m, cls, name)) return [...out];
  const queue = [...(m.subclasses.get(cls) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const c = queue.shift()!;
    if (seen.has(c)) continue;
    seen.add(c);
    const hit = m.impls.get(c)?.get(name);
    if (hit) out.add(hit);
    if (!m.classes.get(c)?.isFinal) queue.push(...(m.subclasses.get(c) ?? []));
  }
  return [...out];
}

/** Every implementation of interface method `intf~name` among the classes of the source. */
function implementers(m: Model, intf: string, name: string): string[] {
  const out = new Set<string>();
  for (const [cls, t] of m.classes) {
    if (!t.interfaces.some((i) => i.name === intf)) continue;
    for (const k of dispatch(m, cls, `${intf}~${name}`)) out.add(k);
  }
  return [...out];
}

/** Declared reference types: `DATA lo TYPE REF TO x`, attributes, method parameters — by name, the first wins. */
function refTypes(list: readonly Statement[], d: Declarations): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of list) {
    if (!['Data', 'ClassData', 'Statics'].includes(s.kind)) continue;
    const u = unitsOf(s.tokens.slice(s.headCount));
    const own = s.headCount === 0 ? u.slice(1) : u;
    const r = own.indexOf('REF');
    if (r > 0 && own[r - 1] === 'TYPE' && own[r + 1] === 'TO' && own[0] && !out.has(own[0])) out.set(own[0], own[r + 2]);
  }
  for (const t of d.types) {
    for (const a of t.attributes) if (a.type.kind === 'ref' && a.type.name && !out.has(a.name)) out.set(a.name, a.type.name);
    for (const me of t.methods) for (const p of me.parameters) if (p.type.kind === 'ref' && p.type.name && !out.has(p.name)) out.set(p.name, p.type.name);
  }
  return out;
}

/** The method calls of one statement: `[receiver, method]` with receiver `ME`, `SUPER`, `=>CLS`, a variable, or '' for a bare call. */
function methodCalls(s: Statement): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const t = s.tokens;
  // `CALL METHOD lo->m EXPORTING …`: the method is the last word of the name chain after METHOD.
  let named = -1;
  if (s.kind === 'CallMethod') {
    for (let k = 2; k < t.length; k++) {
      const n = t[k + 1];
      if (t[k].kind === 'word' && !(n && !n.spaceBefore && (n.text === '->' || n.text === '=>'))) { named = k; break; }
    }
  }
  for (let i = 0; i < t.length; i++) {
    const open = t[i + 1];
    const isCall = (open && open.text === '(' && !open.spaceBefore) || i === named;
    if (t[i].kind !== 'word' || !isCall) continue;
    const prev = t[i - 1];
    const recv = t[i - 2];
    if (prev && !prev.spaceBefore && (prev.text === '->' || prev.text === '=>') && recv && (recv.kind === 'word') && !t[i].spaceBefore) {
      // Only the first link of a chain names its receiver: `a->b( )->c( )` resolves `b` only.
      const before = t[i - 3];
      if (before && !recv.spaceBefore && (before.text === ')' || before.text === '->' || before.text === '=>')) continue;
      out.push([prev.text === '=>' ? `=>${recv.text.toUpperCase()}` : recv.text.toUpperCase(), t[i].text.toUpperCase()]);
    } else if (!prev || !['->', '=>', '~', '-'].includes(prev.text) || prev.spaceBefore || t[i].spaceBefore) {
      // A bare `m( )`; the caller keeps it only where the own class has a method `m`.
      out.push(['', t[i].text.toUpperCase()]);
    }
  }
  return out;
}

/** The call graph of a read source. */
export function callGraph(list: readonly Statement[], tree: BlockTree): CallGraph {
  const d = declarations(list, tree);
  const m = model(d);
  const types = refTypes(list, d);
  const routines: Routine[] = [{ key: 'PROGRAM', kind: 'program', name: '', block: 0, row: 1 }];
  const keyOf = new Map<number, string>([[0, 'PROGRAM']]);
  for (const b of tree.blocks) {
    if (!ROUTINE_KINDS.has(b.kind) || b.opener === null) continue;
    const name = b.name ?? '';
    const cls = b.kind === 'method' ? classOf(b.parent)?.name ?? '' : '';
    const key = b.kind === 'method' ? `METHOD ${cls}=>${name}` : b.kind === 'event' ? `EVENT ${name}@${b.start.row}` : `${b.kind.toUpperCase()} ${name}`;
    keyOf.set(b.id, key);
    routines.push({ key, kind: b.kind as RoutineKind, name, block: b.id, row: b.start.row });
  }
  const has = new Set(routines.map((r) => r.key));
  const routineAt = (i: number): string => {
    for (let b: Block | null = tree.blocks[tree.owner[i]] ?? null; b; b = b.parent) {
      const k = keyOf.get(b.id);
      if (k && b.kind !== 'program') return k;
    }
    return 'PROGRAM';
  };
  const ownClass = (i: number): string => classOf(tree.blocks[tree.owner[i]] ?? null)?.name ?? '';
  const table = references(list, tree);
  const refsAt = new Map<number, typeof table.references>();
  for (const r of table.references) (refsAt.get(r.statement) ?? refsAt.set(r.statement, []).get(r.statement)!).push(r);
  const edges: CallEdge[] = [];
  const push = (s: Statement, kind: CallKind, how: CallHow, to: string | null, external?: string) =>
    edges.push({ from: routineAt(s.index), to, kind, how, statement: s.index, row: s.start.row, ...(external ? { external } : {}) });
  let context: ReturnType<typeof valueContext> | null = null;

  for (const s of list) {
    if (s.context !== 'abap') continue;
    const u = unitsOf(s.tokens);
    if (s.kind === 'Perform') {
      if (u[1] === '(') {
        context ??= valueContext(list, tree);
        const a = valueAt(context, u[2] ?? '', s.index);
        const names = a.name ? [a.name] : a.candidates ?? [];
        if (!a.name) push(s, 'perform', 'dynamic', null, `PERFORM (${u[2] ?? ''})`);
        for (const n of names) if (has.has(`FORM ${n}`)) push(s, 'perform', a.name ? 'static' : 'dynamic', `FORM ${n}`);
        // A name the value reading fixes but this source does not define is as open as `PERFORM f` without a FORM f.
        if (a.name && !has.has(`FORM ${a.name}`)) push(s, 'perform', 'unresolved', null, `FORM ${a.name}`);
      } else if (u.includes('PROGRAM') || (u[2] === '(' && !s.tokens[2]?.spaceBefore)) {
        push(s, 'perform', 'external', null, `PROGRAM ${u.includes('PROGRAM') ? u[u.indexOf('PROGRAM') + 1] : u[3]} FORM ${u[1]}`);
      } else if (has.has(`FORM ${u[1]}`)) push(s, 'perform', 'static', `FORM ${u[1]}`);
      else push(s, 'perform', 'unresolved', null, `FORM ${u[1]}`);
      continue;
    }
    for (const r of refsAt.get(s.index) ?? []) {
      if (r.kind === 'functionModule') {
        const names = r.name ? [r.name] : r.candidates ?? [];
        if (!r.name) push(s, 'function', names.length ? 'dynamic' : 'unresolved', null, 'FM ?');
        for (const n of names) push(s, 'function', r.name ? (has.has(`FUNCTION ${n}`) ? 'static' : 'external') : 'dynamic', has.has(`FUNCTION ${n}`) ? `FUNCTION ${n}` : null, has.has(`FUNCTION ${n}`) ? undefined : `FM ${n}`);
      }
      if (r.use === 'instantiation' && r.name) {
        const ctor = lookup(m, r.name, 'CONSTRUCTOR');
        if (ctor) push(s, 'constructor', 'static', ctor);
        else if (!m.classes.has(r.name)) push(s, 'constructor', 'external', null, `${r.name}=>CONSTRUCTOR`);
        const cctor = m.impls.get(r.name)?.get('CLASS_CONSTRUCTOR');
        if (cctor) push(s, 'constructor', 'static', cctor);
      }
    }
    if (s.kind === 'RaiseEvent') {
      const e = u[2] ?? '';
      for (const t of m.classes.values()) for (const me of t.methods) {
        if (me.handles?.event !== e) continue;
        const k = lookup(m, t.name, me.name);
        if (k) push(s, 'event', 'dispatch', k);
      }
      continue;
    }
    for (const [recv, name] of methodCalls(s)) {
      const own = ownClass(s.index);
      if (recv === '') {
        // A bare `m( )` is a method call only where the own class (or a superclass) has a method `m`.
        if (!own || !lookup(m, own, name)) continue;
        const targets = dispatch(m, own, name);
        for (const k of targets) push(s, 'method', targets.length > 1 ? 'dispatch' : 'static', k);
        continue;
      }
      let cls: string | undefined;
      let fixed = false;
      if (recv === 'ME') cls = own;
      else if (recv === 'SUPER') { cls = m.superOf.get(own); fixed = true; }
      else if (recv.startsWith('=>')) { cls = recv.slice(2); fixed = true; }
      else cls = types.get(recv);
      if (!cls) { push(s, 'method', 'unresolved', null, `${recv}->${name}`); continue; }
      if (m.interfaces.has(cls)) {
        const targets = implementers(m, cls, name);
        if (!targets.length) push(s, 'method', 'unresolved', null, `${cls}~${name}`);
        for (const k of targets) push(s, 'method', targets.length > 1 ? 'dispatch' : 'static', k);
        continue;
      }
      if (!m.classes.has(cls) && !m.impls.has(cls)) { push(s, 'method', 'external', null, `${cls}=>${name}`); continue; }
      const targets = fixed ? [lookup(m, cls, name)].filter((x): x is string => !!x) : dispatch(m, cls, name);
      if (!targets.length) push(s, 'method', 'unresolved', null, `${cls}=>${name}`);
      for (const k of targets) push(s, 'method', targets.length > 1 ? 'dispatch' : 'static', k);
    }
  }
  return { ...reach(routines, edges, d, m), routines, edges, declarations: d };
}

function reach(routines: Routine[], edges: CallEdge[], d: Declarations, m: Model): { entries: string[]; unreachable: string[]; certain: boolean } {
  const globals = new Set(d.types.filter((t) => t.isGlobal).map((t) => t.name));
  const handlers = new Set<string>();
  for (const t of m.classes.values()) for (const me of t.methods) {
    // The test runner calls FOR TESTING methods; an event handler and a class constructor run without a call here.
    if (me.handles || me.isClassConstructor || me.isForTesting || (globals.has(t.name) && me.visibility === 'public')) {
      const k = lookup(m, t.name, me.name);
      if (k) handlers.add(k);
    }
  }
  // Interface methods of a global class are callable from outside too.
  for (const c of globals) for (const k of m.impls.get(c)?.values() ?? []) if (k.includes('~')) handlers.add(k);
  const entries = routines.filter((r) => r.kind === 'program' || r.kind === 'event' || r.kind === 'module' || r.kind === 'function' || handlers.has(r.key)).map((r) => r.key);
  const out = new Map<string, string[]>();
  for (const e of edges) if (e.to) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
  const seen = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length) for (const n of out.get(queue.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  return {
    entries,
    unreachable: routines.filter((r) => !seen.has(r.key)).map((r) => r.key),
    certain: !edges.some((e) => e.how === 'dynamic' || e.how === 'unresolved'),
  };
}
