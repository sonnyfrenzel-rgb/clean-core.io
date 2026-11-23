/**
 * Engine 4.0, L3 second half: class and interface declarations (engine review §8.1; docs/design/engine4.md,
 * "L3: declarations").
 *
 * `declarations(statements, tree)` reads every `CLASS … DEFINITION` and `INTERFACE … ENDINTERFACE` block of L2
 * and every `CLASS … IMPLEMENTATION`: per type its options (global, ABSTRACT, FINAL, CREATE, FOR TESTING,
 * INHERITING FROM, FRIENDS), and per member its section and flags — methods (static, abstract, final,
 * redefinition, constructor, class constructor, event handler `FOR EVENT e OF t`, parameters with direction,
 * type, OPTIONAL and DEFAULT, RAISING, classic EXCEPTIONS), attributes (static, READ-ONLY, constant, type),
 * events, aliases, implemented interfaces (with ABSTRACT/FINAL METHODS, ALL METHODS ABSTRACT), types. An
 * implementation maps each method it implements (`m`, `intf~m`) to its L2 block.
 *
 * The statement layer has already read chains, comments, literals and `LOCAL FRIENDS`/`DEFERRED`/`LOAD` (none
 * opens a block), so this layer only reads units. Pure and inert: imports only `./`.
 */
import type { Block, BlockTree } from './blocks';
import { unitsOf } from './statement-kinds';
import type { Statement } from './statements';

export type Visibility = 'public' | 'protected' | 'private';

export interface TypeUse {
  /** `ref` for `TYPE REF TO x`, `value` for `TYPE x`/`LIKE x`, `generic` without a type. */
  kind: 'ref' | 'value' | 'like' | 'generic';
  /** The type name, upper-cased (`ZCL_X`, `STRING`, `VBAK-VBELN`), or null. */
  name: string | null;
  /** `TYPE [STANDARD|SORTED|HASHED] TABLE OF` / `TYPE RANGE OF`. */
  table?: boolean;
}

export interface Parameter {
  name: string;
  direction: 'importing' | 'exporting' | 'changing' | 'returning';
  passing: 'reference' | 'value';
  type: TypeUse;
  optional: boolean;
  default?: string;
  preferred?: boolean;
}

export interface MethodDeclaration {
  name: string;
  visibility: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
  isFinal: boolean;
  isRedefinition: boolean;
  isConstructor: boolean;
  isClassConstructor: boolean;
  isForTesting: boolean;
  /** `FOR EVENT e OF t`: the event this method handles. */
  handles?: { event: string; of: string };
  parameters: Parameter[];
  raising: string[];
  /** Classic `EXCEPTIONS e1 e2`. */
  exceptions: string[];
  statement: number;
  row: number;
}

export interface AttributeDeclaration {
  name: string;
  visibility: Visibility;
  isStatic: boolean;
  isReadOnly: boolean;
  isConstant: boolean;
  type: TypeUse;
  /** `VALUE` literal or name as written, for a constant or a start value. */
  value?: string;
  statement: number;
  row: number;
}

export interface EventDeclaration { name: string; visibility: Visibility; isStatic: boolean; parameters: Parameter[]; statement: number; row: number }
export interface AliasDeclaration { alias: string; target: string; visibility: Visibility; statement: number; row: number }
export interface InterfaceUse { name: string; visibility: Visibility; abstractMethods: string[]; finalMethods: string[]; allAbstract: boolean; statement: number; row: number }

export interface TypeDeclaration {
  kind: 'class' | 'interface';
  name: string;
  /** `PUBLIC`: a global class or interface (the class pool's own). */
  isGlobal: boolean;
  isAbstract: boolean;
  isFinal: boolean;
  isForTesting: boolean;
  create?: Visibility;
  superclass?: string;
  friends: string[];
  globalFriends: boolean;
  interfaces: InterfaceUse[];
  methods: MethodDeclaration[];
  attributes: AttributeDeclaration[];
  events: EventDeclaration[];
  aliases: AliasDeclaration[];
  types: string[];
  /** The L2 block of the definition. */
  block: number;
  row: number;
}

export interface Implementation {
  name: string;
  /** Method name as written in `METHOD x.` (upper-cased; `INTF~M` for an interface method) → its L2 block. */
  methods: Map<string, number>;
  block: number;
  row: number;
}

export interface Declarations {
  types: TypeDeclaration[];
  implementations: Implementation[];
  /** `CLASS x DEFINITION DEFERRED|LOAD`, `INTERFACE x DEFERRED|LOAD`: names announced, defined elsewhere. */
  announced: string[];
  /** Local friendship: `CLASS x DEFINITION LOCAL FRIENDS a b` (x grants a and b access). */
  localFriends: Array<{ name: string; friends: string[] }>;
}

const PARAM_SECTIONS: Record<string, Parameter['direction'] | 'raising' | 'exceptions' | null> = {
  IMPORTING: 'importing', EXPORTING: 'exporting', CHANGING: 'changing', RETURNING: 'returning', RAISING: 'raising', EXCEPTIONS: 'exceptions',
};
/** Words that end the parameter list of a METHODS statement or start a method option. */
const METHOD_OPTIONS = new Set(['ABSTRACT', 'FINAL', 'REDEFINITION', 'FOR', 'DEFAULT', 'AMDP', 'OPTIONS']);

/** The type after `TYPE`/`LIKE` at `u[i]` (i points at TYPE or LIKE). */
function typeAt(u: readonly string[], i: number): { type: TypeUse; next: number } {
  if (u[i] === 'LIKE') {
    let k = i + 1;
    if (u[k] === 'LINE' && u[k + 1] === 'OF') k += 2;
    if (u[k] === 'REF' && u[k + 1] === 'TO') k += 2;
    return { type: { kind: 'like', name: u[k] ?? null }, next: k + 1 };
  }
  let k = i + 1;
  let table = false;
  let ref = false;
  while (['STANDARD', 'SORTED', 'HASHED', 'ANY', 'INDEX', 'TABLE', 'OF', 'RANGE', 'LINE', 'REF', 'TO'].includes(u[k] ?? '')) {
    if (u[k] === 'TABLE' || u[k] === 'RANGE') table = true;
    if (u[k] === 'REF') ref = true;
    if (u[k] === 'TABLE' && u[k + 1] !== 'OF') { k += 1; break; }
    k += 1;
  }
  const name = u[k] && /^[A-Z_\/%][A-Z0-9_\/%~-]*$/.test(u[k]) && !PARAM_SECTIONS[u[k]] && u[k] !== 'OPTIONAL' && u[k] !== 'DEFAULT' ? u[k] : null;
  return { type: { kind: ref ? 'ref' : 'value', name, ...(table ? { table } : {}) }, next: name ? k + 1 : k };
}

/** Parameters, RAISING and EXCEPTIONS of a METHODS/EVENTS statement, read from `u[from]`. */
function signatureOf(u: readonly string[], from: number): { parameters: Parameter[]; raising: string[]; exceptions: string[]; options: Set<string>; handles?: { event: string; of: string } } {
  const parameters: Parameter[] = [];
  const raising: string[] = [];
  const exceptions: string[] = [];
  const options = new Set<string>();
  let handles: { event: string; of: string } | undefined;
  let section: string | null = null;
  let i = from;
  while (i < u.length) {
    const w = u[i];
    if (w in PARAM_SECTIONS) { section = w; i += 1; continue; }
    if (w === 'FOR' && u[i + 1] === 'EVENT') {
      handles = { event: u[i + 2] ?? '', of: u[i + 4] ?? '' };
      section = null;
      i += 5;
      continue;
    }
    if (w === 'FOR' && u[i + 1] === 'TESTING') { options.add('FOR TESTING'); i += 2; continue; }
    // At the start of a parameter, an option word is the method's: ABSTRACT, FINAL, REDEFINITION, DEFAULT IGNORE|FAIL.
    if (section === null || METHOD_OPTIONS.has(w)) {
      options.add(w);
      i += w === 'DEFAULT' ? 2 : 1;
      continue;
    }
    if (section === 'RAISING') {
      if (w !== 'RESUMABLE' && w !== '(' && w !== ')') raising.push(w);
      i += 1;
      continue;
    }
    if (section === 'EXCEPTIONS') { exceptions.push(w); i += 1; continue; }
    // A parameter: [VALUE(|REFERENCE(]name[)] TYPE|LIKE … [OPTIONAL|DEFAULT x] [PREFERRED PARAMETER p].
    if (w === 'PREFERRED' && u[i + 1] === 'PARAMETER') {
      const p = parameters.find((x) => x.name === u[i + 2]);
      if (p) p.preferred = true;
      i += 3;
      continue;
    }
    let passing: Parameter['passing'] = 'reference';
    let name = w;
    if ((w === 'VALUE' || w === 'REFERENCE') && u[i + 1] === '(') {
      passing = w === 'VALUE' ? 'value' : 'reference';
      name = u[i + 2] ?? '';
      i += 4;
    } else i += 1;
    let type: TypeUse = { kind: 'generic', name: null };
    if (u[i] === 'TYPE' || u[i] === 'LIKE') ({ type, next: i } = typeAt(u, i));
    let optional = false;
    let def: string | undefined;
    for (;;) {
      if (u[i] === 'OPTIONAL') { optional = true; i += 1; continue; }
      if (u[i] === 'DEFAULT') { optional = true; def = u[i + 1]; i += 2; continue; }
      break;
    }
    const direction = PARAM_SECTIONS[section] as Parameter['direction'];
    parameters.push({ name, direction, passing: direction === 'returning' ? 'value' : passing, type, optional, ...(def !== undefined ? { default: def } : {}) });
  }
  return { parameters, raising, exceptions, options, handles };
}

const declaredName = (u: readonly string[]) => (u[1] === 'BEGIN' || u[1] === 'END' ? (u[2] === 'OF' ? u[3] : u[2]) : u[1]);

function classOptions(t: TypeDeclaration, u: readonly string[]): void {
  for (let i = 3; i < u.length; i++) {
    const w = u[i];
    if (w === 'PUBLIC') t.isGlobal = true;
    else if (w === 'ABSTRACT') t.isAbstract = true;
    else if (w === 'FINAL') t.isFinal = true;
    else if (w === 'INHERITING' && u[i + 1] === 'FROM') { t.superclass = u[i + 2]; i += 2; }
    else if (w === 'CREATE') { t.create = (u[i + 1] ?? '').toLowerCase() as Visibility; i += 1; }
    else if (w === 'FOR' && u[i + 1] === 'TESTING') { t.isForTesting = true; i += 1; }
    else if (w === 'GLOBAL' && u[i + 1] === 'FRIENDS') t.globalFriends = true;
    else if (w === 'FRIENDS') {
      for (let k = i + 1; k < u.length && !['CREATE', 'ABSTRACT', 'FINAL', 'FOR', 'INHERITING', 'PUBLIC', 'SHARED'].includes(u[k]); k++) t.friends.push(u[k]);
      break;
    }
  }
}

/** One member statement of a definition. */
function member(t: TypeDeclaration, s: Statement, u: readonly string[], section: Visibility): void {
  const at = { statement: s.index, row: s.start.row };
  switch (s.kind) {
    case 'Methods':
    case 'ClassMethods': {
      const name = u[1] ?? '';
      const sig = signatureOf(u, 2);
      t.methods.push({
        name, visibility: section, isStatic: s.kind === 'ClassMethods',
        isAbstract: sig.options.has('ABSTRACT'), isFinal: sig.options.has('FINAL'), isRedefinition: sig.options.has('REDEFINITION'),
        isConstructor: name === 'CONSTRUCTOR' && s.kind === 'Methods', isClassConstructor: name === 'CLASS_CONSTRUCTOR' || (name === 'CONSTRUCTOR' && s.kind === 'ClassMethods'),
        isForTesting: sig.options.has('FOR TESTING'), ...(sig.handles ? { handles: sig.handles } : {}),
        parameters: sig.parameters, raising: sig.raising, exceptions: sig.exceptions, ...at,
      });
      return;
    }
    case 'Data':
    case 'ClassData':
    case 'Constants': {
      if (u[1] === 'END') return;
      const name = declaredName(u);
      if (!name) return;
      const ti = u.findIndex((x, k) => k > 1 && (x === 'TYPE' || x === 'LIKE'));
      const type = ti > 0 ? typeAt(u, ti).type : { kind: 'generic' as const, name: null };
      const vi = u.indexOf('VALUE');
      t.attributes.push({
        name, visibility: section, isStatic: s.kind !== 'Data', isReadOnly: u.includes('READ-ONLY'), isConstant: s.kind === 'Constants',
        type, ...(vi > 0 && u[vi + 1] ? { value: u[vi + 1] } : {}), ...at,
      });
      return;
    }
    case 'Events':
    case 'ClassEvents':
      t.events.push({ name: u[1] ?? '', visibility: section, isStatic: s.kind === 'ClassEvents', parameters: signatureOf(u, 2).parameters, ...at });
      return;
    case 'Aliases':
      if (u[2] === 'FOR' && u[3]) t.aliases.push({ alias: u[1], target: u[3], visibility: section, ...at });
      return;
    case 'Interfaces': {
      const use: InterfaceUse = { name: u[1] ?? '', visibility: section, abstractMethods: [], finalMethods: [], allAbstract: false, ...at };
      for (let i = 2; i < u.length; i++) {
        if (u[i] === 'ALL' && u[i + 1] === 'METHODS' && u[i + 2] === 'ABSTRACT') { use.allAbstract = true; i += 2; continue; }
        if ((u[i] === 'ABSTRACT' || u[i] === 'FINAL') && u[i + 1] === 'METHODS') {
          const list = u[i] === 'ABSTRACT' ? use.abstractMethods : use.finalMethods;
          let k = i + 2;
          for (; k < u.length && !['ABSTRACT', 'FINAL', 'ALL', 'DATA'].includes(u[k]); k++) list.push(u[k]);
          i = k - 1;
        }
      }
      t.interfaces.push(use);
      return;
    }
    case 'Types':
      if (u[1] !== 'END') { const n = declaredName(u); if (n && !t.types.includes(n)) t.types.push(n); }
      return;
    default:
  }
}

/** Statements directly in a block (not in a block nested in it), in order. */
function ownStatements(tree: BlockTree, b: Block): number[] {
  const out: number[] = [];
  for (const br of b.branches) for (const c of br.children) if (c.type === 'statement') out.push(c.index);
  return out;
}

/** Every class and interface declaration and every class implementation of a read source. */
export function declarations(list: readonly Statement[], tree: BlockTree): Declarations {
  const out: Declarations = { types: [], implementations: [], announced: [], localFriends: [] };
  for (const s of list) {
    if (s.context !== 'abap') continue;
    const u = unitsOf(s.tokens);
    if (s.kind === 'ClassDeferred' || s.kind === 'ClassLoad' || s.kind === 'InterfaceDeferred' || s.kind === 'InterfaceLoad') out.announced.push(u[1] ?? '');
    if (s.kind === 'ClassLocalFriends') out.localFriends.push({ name: u[1] ?? '', friends: u.slice(5) });
  }
  for (const b of tree.blocks) {
    if (b.opener === null || (b.kind !== 'class' && b.kind !== 'interface')) continue;
    const opener = list[b.opener];
    const u = unitsOf(opener.tokens);
    if (opener.kind === 'ClassImplementation') {
      const methods = new Map<string, number>();
      for (const br of b.branches) for (const c of br.children) if (c.type === 'block' && c.block.kind === 'method' && c.block.name) methods.set(c.block.name, c.block.id);
      out.implementations.push({ name: u[1] ?? '', methods, block: b.id, row: opener.start.row });
      continue;
    }
    const t: TypeDeclaration = {
      kind: b.kind === 'class' ? 'class' : 'interface', name: u[1] ?? '', isGlobal: b.kind === 'interface' && u.includes('PUBLIC'),
      isAbstract: false, isFinal: false, isForTesting: false, friends: [], globalFriends: false,
      interfaces: [], methods: [], attributes: [], events: [], aliases: [], types: [], block: b.id, row: opener.start.row,
    };
    if (b.kind === 'class') classOptions(t, u);
    let section: Visibility = 'public';
    /** Inside `BEGIN OF … END OF`: the components are no members of their own. */
    let depth = 0;
    for (const i of ownStatements(tree, b)) {
      const s = list[i];
      if (s.context !== 'abap') continue;
      if (s.kind === 'PublicSection') { section = 'public'; continue; }
      if (s.kind === 'ProtectedSection') { section = 'protected'; continue; }
      if (s.kind === 'PrivateSection') { section = 'private'; continue; }
      const u = unitsOf(s.tokens);
      if (['Data', 'ClassData', 'Constants', 'Types', 'Statics'].includes(s.kind)) {
        if (u[1] === 'BEGIN' && u[2] === 'OF') { if (depth++ > 0) continue; }
        else if (u[1] === 'END' && u[2] === 'OF') { depth = Math.max(0, depth - 1); continue; }
        else if (depth > 0) continue;
      }
      member(t, s, u, section);
    }
    out.types.push(t);
  }
  return out;
}
