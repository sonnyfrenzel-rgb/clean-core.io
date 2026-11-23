/**
 * Engine 4.0, L4 first step: the reference table (docs/design/engine4.md,
 * "L4: references"). Every name in the source that points at an object outside
 * the statement — a class, an interface, a type, an exception class, a message
 * class, an authorisation object, a transaction, a function module, a program,
 * a database table or view, a transformation, a type pool — with its line,
 * column, statement, how it is used, and whether the source defines it itself.
 *
 * Dynamic names are resolved where the source sets the value: a `CONSTANTS …
 * VALUE 'X'`, a `DATA … VALUE 'X'`, or a literal assignment (`v = 'X'`,
 * `MOVE 'X' TO v`) that stands on the straight path before the use, in the same
 * branch of every block around it. Where that fails, the reference stays
 * `dynamic` and lists every literal the source ever writes into the variable,
 * so a reader still sees the candidates.
 *
 * Pure (ADR-125): imports only within `lib/engine4/`. It knows no catalog:
 * whether a name is SAP's, released or level A–D is the consumer's question
 * (`lib/abap/catalog-service.ts`; later `lib/knowledge/`, ADR-133 (2)).
 * Product path: from engine 3.4.0 `lib/abap/sap-class-references.ts` reads it
 * for the class gap (ADR-141), its static references only, so a change here
 * can change a signed finding and is reviewed like any engine change.
 */
import type { BlockTree } from './blocks';
import type { Statement } from './statements';
import type { Token } from './tokens';
import { valueAt, valueContext, type Provenance } from './values';

export type ReferenceKind =
  | 'class'
  | 'interface'
  /** A class or an interface; the syntax does not say which (`TYPE REF TO x`, `x=>c`). */
  | 'classOrInterface'
  | 'exception'
  | 'type'
  | 'table'
  | 'functionModule'
  | 'messageClass'
  | 'authorizationObject'
  | 'transaction'
  | 'program'
  | 'transformation'
  | 'typePool';

export type ReferenceUse =
  | 'typeRef'
  | 'type'
  | 'staticAccess'
  | 'interfaceAccess'
  | 'instantiation'
  | 'cast'
  | 'catch'
  | 'raise'
  | 'raising'
  | 'inherit'
  | 'implement'
  | 'friend'
  | 'declare'
  | 'read'
  | 'write'
  | 'call'
  | 'callUpdateTask'
  | 'callRemote'
  | 'callNewTask'
  | 'callBackgroundTask'
  | 'message'
  | 'authorityCheck'
  | 'callTransaction'
  | 'leaveToTransaction'
  | 'submit'
  | 'performInProgram'
  | 'transform'
  | 'typePool';

/** How the name was found. */
export type Resolution =
  /** Written in the statement as a name. */
  | 'static'
  /** Written in the statement as a literal (`CALL FUNCTION 'X'`). */
  | 'literal'
  /** A constant of the source (`CONSTANTS c … VALUE 'X'`). */
  | 'constant'
  /** The variable's start value (`DATA v … VALUE 'X'`), never written again. */
  | 'value'
  /** A literal assigned on the straight path before the use. */
  | 'assigned'
  /** Every write in the variable's scope puts the same literal in. */
  | 'onlyValue'
  /** A FORM parameter every call site of the source passes the same value. */
  | 'parameter'
  /** From the declared type of the object (`CREATE OBJECT o` with `o TYPE REF TO x`). */
  | 'declaredType'
  /** Not resolved: `name` is null, `candidates` lists what the source ever writes. */
  | 'dynamic';

export interface Reference {
  kind: ReferenceKind;
  /** Upper-cased; null for an unresolved dynamic name. */
  name: string | null;
  /** The component after `-` (`TYPE vbak-vbeln`), upper-cased. */
  component?: string;
  use: ReferenceUse;
  /** Statement index (L1) and position of the name (or the variable) in the source. */
  statement: number;
  row: number;
  col: number;
  resolution: Resolution;
  /** For a resolved or unresolved dynamic name: the variable and where its value was set. */
  via?: { variable: string; row: number | null };
  /** For `dynamic`: every literal the source writes into the variable, upper-cased, in order. */
  candidates?: string[];
  /** The source defines this name itself (a local class, interface or type, the uploaded class). */
  defined: boolean;
  /** A message number (`MESSAGE e001(zmsg)`). */
  number?: string;
  /** For a name read out of a variable: the writes and call sites the answer rests on, and the variable's scope (`values.ts`). */
  provenance?: Provenance[];
  scope?: string;
}

export interface ReferenceTable {
  references: Reference[];
  /** Classes, interfaces and types the source defines itself, upper-cased. */
  definitions: { classes: string[]; interfaces: string[]; types: string[] };
  /** Count per kind of the references that are not defined in the source (unresolved ones under their kind). */
  counts: Record<ReferenceKind, number>;
}

/** A name unit: a word, with `-` joined (`vbak-vbeln`, `AUTHORITY-CHECK`); or a literal; or a punctuation token. */
interface Unit {
  up: string;
  text: string;
  kind: 'name' | 'literal' | 'other';
  token: Token;
  /** Literal content, quotes removed. */
  value?: string;
}

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
      out.push({ up: text.toUpperCase(), text, kind: 'name', token: t });
      continue;
    }
    if (LITERAL_KINDS.has(t.kind)) out.push({ up: t.text.toUpperCase(), text: t.text, kind: 'literal', token: t, value: literalValue(t) });
    else out.push({ up: t.text.toUpperCase(), text: t.text, kind: 'other', token: t });
    i += 1;
  }
  return out;
}

/** Built-in and generic ABAP types: never a reference. */
const BUILTIN_TYPES = new Set([
  'C', 'N', 'D', 'T', 'X', 'I', 'B', 'S', 'F', 'P', 'INT1', 'INT2', 'INT4', 'INT8', 'STRING', 'XSTRING', 'DECFLOAT16', 'DECFLOAT34',
  'UTCLONG', 'ANY', 'DATA', 'OBJECT', 'SIMPLE', 'CSEQUENCE', 'XSEQUENCE', 'NUMERIC', 'CLIKE', 'TABLE', 'INDEX', 'STANDARD',
  'SORTED', 'HASHED', 'DECFLOAT', 'ABAP_BOOL', 'SY', 'SYST',
]);
/** Words that may follow `TYPE` and are no type name. */
const TYPE_FILLERS = new Set(['REF', 'TO', 'TABLE', 'OF', 'STANDARD', 'SORTED', 'HASHED', 'ANY', 'INDEX', 'LINE', 'RANGE', 'UNIQUE', 'NON-UNIQUE', 'KEY']);
const SQL_KINDS = new Set(['Select', 'SelectLoop', 'OpenCursor', 'With', 'WithLoop', 'Update', 'Insert', 'Modify', 'Delete']);
const DECLARING_KINDS = new Set(['Data', 'ClassData', 'Statics', 'Constants', 'Parameters', 'SelectOptions', 'FieldSymbols', 'Ranges', 'Tables', 'Nodes']);
const SIGNATURE_KINDS = new Set(['Methods', 'ClassMethods', 'Form', 'Events', 'ClassEvents']);
/** Words that end a `RAISING` list. */
const RAISING_STOP = new Set(['EXCEPTIONS', 'ABSTRACT', 'FINAL', 'REDEFINITION', 'DEFAULT', 'FOR', 'IMPORTING', 'EXPORTING', 'CHANGING', 'RETURNING', 'TABLES', 'USING']);
const EXPRESSION_TYPED = new Map<string, { kind: ReferenceKind; use: ReferenceUse }>([
  ['NEW', { kind: 'class', use: 'instantiation' }],
  ['CAST', { kind: 'classOrInterface', use: 'cast' }],
  ['CONV', { kind: 'type', use: 'type' }],
  ['VALUE', { kind: 'type', use: 'type' }],
  ['CORRESPONDING', { kind: 'type', use: 'type' }],
  ['EXACT', { kind: 'type', use: 'type' }],
  ['REF', { kind: 'type', use: 'type' }],
]);

/** The units of a statement behind its keyword: a chain part's own, or a declaration's after `DATA`, `TYPES`, … */
function ownUnits(s: Statement): Unit[] {
  const own = unitsOf(s.tokens.slice(s.headCount));
  return s.headCount === 0 && (DECLARING_KINDS.has(s.kind) || s.kind === 'Types') ? own.slice(1) : own;
}

interface Definitions {
  classes: Set<string>;
  interfaces: Set<string>;
  types: Set<string>;
  /** Data objects the source declares (to tell an internal table from a database table). */
  data: Set<string>;
  /** `o TYPE REF TO x`: the declared class of an object reference. */
  refType: Map<string, string>;
}

function collectDefinitions(list: readonly Statement[]): Definitions {
  const d: Definitions = { classes: new Set(), interfaces: new Set(), types: new Set(), data: new Set(), refType: new Map() };
  for (const s of list) {
    const u = unitsOf(s.tokens);
    const own = ownUnits(s);
    const first = own[0]?.kind === 'name' ? own[0].up : null;
    const declared = first === 'BEGIN' || first === 'END' ? own[2]?.up : first;
    // Only a real definition defines a name. `CLASS x DEFINITION DEFERRED|LOAD` and `INTERFACE x DEFERRED|LOAD` announce
    // a class or interface defined elsewhere — usually SAP's own — and must not hide its references; a local class
    // that is announced first is still defined by its own `CLASS x DEFINITION` further down.
    if (s.kind === 'ClassDefinition') { if (u[1]) d.classes.add(u[1].up); }
    else if (s.kind === 'Interface') { if (u[1]) d.interfaces.add(u[1].up); }
    else if (s.kind === 'Types' && declared) d.types.add(declared);
    else if (DECLARING_KINDS.has(s.kind) && declared) {
      // `TABLES vbak` declares a work area named like the table: still the table.
      if (s.kind !== 'Tables' && s.kind !== 'Nodes') d.data.add(declared);
      const at = own.findIndex((x) => x.up === 'REF');
      if (at > 0 && own[at - 1]?.up === 'TYPE' && own[at + 1]?.up === 'TO' && own[at + 2]?.kind === 'name') d.refType.set(declared, own[at + 2].up);
    }
    // Inline declarations: DATA(x), FINAL(x), FIELD-SYMBOL(<x>).
    for (let i = 0; i + 2 < u.length; i++) {
      if ((u[i].up === 'DATA' || u[i].up === 'FINAL' || u[i].up === 'FIELD-SYMBOL') && u[i + 1].up === '(' && !u[i + 1].token.spaceBefore) d.data.add(u[i + 2].up);
    }
    // Parameters of a FORM, METHODS or EVENTS signature: `p TYPE …`, `p LIKE …`, `VALUE(p)`, `REFERENCE(p)`.
    if (SIGNATURE_KINDS.has(s.kind)) {
      for (let i = 1; i < u.length; i++) {
        if (u[i].kind === 'name' && (u[i + 1]?.up === 'TYPE' || u[i + 1]?.up === 'LIKE')) d.data.add(u[i].up);
        if ((u[i].up === 'VALUE' || u[i].up === 'REFERENCE') && u[i + 1]?.up === '(' && u[i + 2]?.kind === 'name') d.data.add(u[i + 2].up);
      }
    }
  }
  d.types.delete('');
  return d;
}

interface Emit {
  (kind: ReferenceKind, unit: Unit, use: ReferenceUse, extra?: Partial<Reference>): void;
}

type NameAt = NonNullable<ReturnType<typeof nameAt>>;

/** A name that may be a literal, a written name or a variable to resolve. */
type Dyn = (kind: ReferenceKind, n: NameAt, use: ReferenceUse, extra?: Partial<Reference>) => void;

/** `(name)` or a literal or a variable at `u[i]`: the dynamic-name forms of a call. */
function nameAt(u: readonly Unit[], i: number): { unit: Unit; variable: string | null; literal: boolean } | null {
  const x = u[i];
  if (!x) return null;
  if (x.kind === 'literal') return { unit: x, variable: null, literal: true };
  // `(name)` written without blanks is a dynamic name; `( name` with a blank opens a bracket.
  if (x.up === '(' && u[i + 1]?.kind === 'name' && !u[i + 1].token.spaceBefore && u[i + 2]?.up === ')') return { unit: u[i + 1], variable: u[i + 1].up, literal: false };
  if (x.kind === 'name') return { unit: x, variable: null, literal: false };
  return null;
}

/** EML statements: every `x~y` in them names a RAP entity. */
const EML_KINDS = new Set(['ModifyEntities', 'ReadEntities', 'CommitEntities', 'RollbackEntities']);
/** Declarations in which a `FOR` opens a RAP derived type or handler signature. */
const RAP_DECLARATION_KINDS = new Set(['Methods', 'ClassMethods', 'Data', 'ClassData', 'Types', 'Statics', 'FieldSymbols']);

/** References every statement can carry: TYPE …, `=>`, `~`, NEW/CAST/CONV x( ). */
function generalReferences(s: Statement, u: readonly Unit[], emit: Emit): void {
  const sql = SQL_KINDS.has(s.kind);
  // RAP (3.4.0): in EML and in a declaration after `FOR` (`METHODS m FOR DETERMINE … IMPORTING keys FOR order~m`,
  // `TYPES t TYPE TABLE FOR ACTION IMPORT zi_order~approve`), `x~y` is an entity and its action, not an interface.
  const entity = EML_KINDS.has(s.kind);
  let forSeen = false;
  for (let i = 0; i < u.length; i++) {
    if (u[i].up === 'FOR' && u[i].kind === 'name' && RAP_DECLARATION_KINDS.has(s.kind)) forSeen = true;
    const x = u[i];
    if (x.up === 'TYPE' && x.kind === 'name' && s.kind !== 'Describe' && s.kind !== 'Message' && s.kind !== 'CreateObject' && s.kind !== 'RaiseException') {
      let k = i + 1;
      let ref = false;
      while (u[k] && u[k].kind === 'name' && TYPE_FILLERS.has(u[k].up)) {
        if (u[k].up === 'REF') ref = true;
        k += 1;
      }
      const target = u[k];
      if (target?.kind === 'name' && !BUILTIN_TYPES.has(target.up)) {
        const [name, ...rest] = target.up.split('-');
        if (!BUILTIN_TYPES.has(name)) emit(ref ? 'classOrInterface' : 'type', target, ref ? 'typeRef' : 'type', { name, component: rest.length ? rest.join('-') : undefined });
      }
    }
    if (x.up === '=>' && i > 0 && u[i - 1].kind === 'name' && !x.token.spaceBefore) emit('classOrInterface', u[i - 1], 'staticAccess');
    if (x.up === '~' && !sql && !entity && !forSeen && i > 0 && u[i - 1].kind === 'name' && !x.token.spaceBefore && u[i - 2]?.up !== '~') {
      emit('interface', u[i - 1], 'interfaceAccess');
    }
    const typed = EXPRESSION_TYPED.get(x.up);
    if (typed && x.kind === 'name' && u[i + 1]?.kind === 'name' && u[i + 2]?.up === '(' && !u[i + 2].token.spaceBefore) {
      if (!BUILTIN_TYPES.has(u[i + 1].up)) emit(typed.kind, u[i + 1], typed.use);
    }
  }
}

/** The kind-specific references of one statement. */
function statementReferences(s: Statement, u: readonly Unit[], emit: Emit, dyn: Dyn, defs: Definitions): void {
  const word = (k: number) => (u[k]?.kind === 'name' ? u[k].up : '');
  switch (s.kind) {
    case 'ClassDefinition': {
      for (let i = 0; i < u.length; i++) {
        if (u[i].up === 'INHERITING' && word(i + 1) === 'FROM' && u[i + 2]) emit('class', u[i + 2], 'inherit');
        if (u[i].up === 'FRIENDS') for (let k = i + 1; u[k]?.kind === 'name' && !['GLOBAL', 'FOR', 'CREATE'].includes(u[k].up); k++) emit('classOrInterface', u[k], 'friend');
      }
      return;
    }
    case 'Interfaces':
      if (u[1]?.kind === 'name') emit('interface', u[1], 'implement');
      return;
    case 'Aliases': {
      const f = u.findIndex((x) => x.up === 'FOR');
      if (f > 0 && u[f + 1]?.kind === 'name' && u[f + 2]?.up === '~') emit('interface', u[f + 1], 'implement');
      return;
    }
    case 'CreateObject': {
      const t = u.findIndex((x) => x.up === 'TYPE');
      const n = t > 0 ? nameAt(u, t + 1) : null;
      if (n) { dyn('class', n, 'instantiation'); return; }
      const obj = u[2];
      if (obj?.kind === 'name') {
        const declared = defs.refType.get(obj.up);
        if (declared) emit('class', obj, 'instantiation', { name: declared, resolution: 'declaredType', via: { variable: obj.up, row: null } });
      }
      return;
    }
    case 'CreateData': {
      const t = u.findIndex((x) => x.up === 'TYPE');
      if (t > 0 && u[t + 1]?.up === '(') { const n = nameAt(u, t + 1); if (n) dyn('type', n, 'type'); }
      return;
    }
    case 'Catch':
      for (let k = 1; u[k] && u[k].up !== 'INTO'; k++) if (u[k].kind === 'name' && !['BEFORE', 'UNWIND'].includes(u[k].up)) emit('exception', u[k], 'catch');
      return;
    case 'RaiseException': {
      const t = u.findIndex((x) => x.up === 'TYPE');
      if (t > 0 && u[t + 1]?.kind === 'name') emit('exception', u[t + 1], 'raise');
      return;
    }
    case 'Message':
      messageReferences(u, emit, dyn);
      return;
    case 'Report':
    case 'Program':
    case 'FunctionPool': {
      const m = u.findIndex((x) => x.up === 'MESSAGE-ID');
      if (m > 0 && u[m + 1]?.kind === 'name') emit('messageClass', u[m + 1], 'message');
      return;
    }
    case 'AuthorityCheck': {
      const o = u.findIndex((x) => x.up === 'OBJECT');
      const n = o > 0 ? nameAt(u, o + 1) : null;
      if (n) dyn('authorizationObject', { ...n, variable: n.literal ? null : n.unit.up }, 'authorityCheck');
      return;
    }
    case 'CallTransaction': {
      const n = nameAt(u, 2);
      if (n) dyn('transaction', { ...n, variable: n.literal ? null : n.unit.up }, 'callTransaction');
      return;
    }
    case 'LeaveToTransaction': {
      const t = u.findIndex((x) => x.up === 'TRANSACTION');
      const n = t > 0 ? nameAt(u, t + 1) : null;
      if (n) dyn('transaction', { ...n, variable: n.literal ? null : n.unit.up }, 'leaveToTransaction');
      return;
    }
    case 'CallFunction': {
      const n = nameAt(u, 2);
      if (!n) return;
      const has = (w: string) => u.some((x) => x.up === w);
      const use: ReferenceUse = has('DESTINATION') ? 'callRemote' : has('UPDATE') && has('TASK') ? 'callUpdateTask' : has('STARTING') && has('NEW') ? 'callNewTask' : has('BACKGROUND') ? 'callBackgroundTask' : 'call';
      dyn('functionModule', { ...n, variable: n.literal ? null : n.unit.up }, use);
      return;
    }
    case 'Submit': {
      const n = nameAt(u, 1);
      if (n) dyn('program', n, 'submit');
      return;
    }
    case 'CallTransformation': {
      const n = nameAt(u, 2);
      if (n) dyn('transformation', n, 'transform');
      return;
    }
    case 'Perform': {
      const p = u.findIndex((x) => x.up === 'PROGRAM');
      if (p > 0 && u[p - 1]?.up === 'IN') { const n = nameAt(u, p + 1); if (n) dyn('program', n, 'performInProgram'); }
      if (u[2]?.up === '(' && !u[2].token.spaceBefore && u[3]?.kind === 'name' && u[4]?.up === ')') emit('program', u[3], 'performInProgram');
      return;
    }
    case 'TypePools':
      for (let k = 1; k < u.length; k++) if (u[k].kind === 'name') emit('typePool', u[k], 'typePool');
      return;
    case 'IncludeType':
      if (u[2]?.kind === 'name') emit('type', u[2], 'type');
      return;
    case 'Tables':
      if (u[1]?.kind === 'name') emit('table', u[1], 'declare', { name: u[1].up.replace(/^\*/, '') });
      return;
    case 'SelectOptions': {
      const f = u.findIndex((x) => x.up === 'FOR');
      if (f > 0 && u[f + 1]?.kind === 'name' && u[f + 1].up.includes('-')) {
        const [name, ...rest] = u[f + 1].up.split('-');
        if (!defs.data.has(name)) emit('type', u[f + 1], 'type', { name, component: rest.join('-') });
      }
      return;
    }
    default:
      if (SIGNATURE_KINDS.has(s.kind)) {
        const r = u.findIndex((x) => x.up === 'RAISING');
        if (r > 0) for (let k = r + 1; u[k] && !RAISING_STOP.has(u[k].up); k++) {
          if (u[k].kind === 'name' && u[k].up !== 'RESUMABLE') emit('exception', u[k], 'raising');
        }
      }
      if (SQL_KINDS.has(s.kind)) sqlReferences(s, u, emit, dyn, defs);
  }
}

function messageReferences(u: readonly Unit[], emit: Emit, dyn: Dyn): void {
  // MESSAGE e001(zmsg) …
  const short = u[1];
  if (short?.kind === 'name' && /^[AEISWX]\d{3}$/.test(short.up) && u[2]?.up === '(' && !u[2].token.spaceBefore && u[3]?.kind === 'name' && u[4]?.up === ')') {
    emit('messageClass', u[3], 'message', { number: short.up.slice(1) });
    return;
  }
  // MESSAGE ID 'ZMSG' | lv TYPE … NUMBER …
  const id = u.findIndex((x) => x.up === 'ID');
  if (id > 0 && u[id - 1]?.up === 'MESSAGE') {
    const n = nameAt(u, id + 1);
    if (!n) return;
    const num = u.findIndex((x) => x.up === 'NUMBER');
    const number = num > 0 && u[num + 1]?.kind === 'literal' ? u[num + 1].value : undefined;
    dyn('messageClass', { ...n, variable: n.literal ? null : n.unit.up }, 'message', number ? { number } : {});
  }
}

function sqlReferences(s: Statement, u: readonly Unit[], emit: Emit, dyn: Dyn, defs: Definitions): void {
  const write = s.kind === 'Update' || s.kind === 'Insert' || s.kind === 'Modify' || s.kind === 'Delete';
  const table = (k: number, use: ReferenceUse) => {
    const n = nameAt(u, k);
    // `FROM ( a INNER JOIN b … )`: the first table stands behind the bracket.
    if (!n && u[k]?.up === '(') { table(k + 1, use); return; }
    if (!n || u[k]?.up === '@') return;
    if (!n.literal && n.variable === null && (defs.data.has(n.unit.up) || n.unit.up.includes('-'))) return;
    dyn('table', n, use);
  };
  if (!write) {
    for (let k = 0; k < u.length; k++) if ((u[k].up === 'FROM' || u[k].up === 'JOIN') && u[k].kind === 'name') table(k + 1, 'read');
    return;
  }
  // UPDATE x SET …, INSERT INTO x / INSERT x FROM, MODIFY x FROM, DELETE FROM x / DELETE x FROM.
  const second = u[1]?.up;
  if (s.kind === 'Update') { table(1, 'write'); return; }
  if (s.kind === 'Insert') {
    if (second === 'INTO' && u[2]?.up !== 'TABLE') { table(2, 'write'); return; }
    // `INSERT dbtab FROM [TABLE] itab`: the database, whatever follows FROM.
    if (u[2]?.up === 'FROM') { table(1, 'write'); return; }
    if (u.some((x) => ['TABLE', 'LINES', 'INITIAL', 'INTO', 'INDEX', 'ASSIGNING', 'REFERENCE'].includes(x.up))) return;
    table(1, 'write');
    return;
  }
  if (s.kind === 'Modify') {
    if (second === 'TABLE' || second === 'SCREEN' || second === 'LINE' || second === 'CURRENT') return;
    if (u.some((x) => x.up === 'INDEX' || x.up === 'TRANSPORTING')) return;
    table(1, 'write');
    return;
  }
  if (s.kind === 'Delete') {
    if (second === 'FROM') { table(2, 'write'); return; }
    if (['TABLE', 'ADJACENT', 'DATASET', 'REPORT', 'TEXTPOOL'].includes(second ?? '')) return;
    if (u.some((x) => x.up === 'INDEX' || x.up === 'WHERE')) return;
    table(1, 'write');
  }
}

const KINDS: ReferenceKind[] = ['class', 'interface', 'classOrInterface', 'exception', 'type', 'table', 'functionModule', 'messageClass', 'authorizationObject', 'transaction', 'program', 'transformation', 'typePool'];

/** Every reference of a read source (L1 statements, L2 tree), in source order. */
export function references(list: readonly Statement[], tree: BlockTree): ReferenceTable {
  const defs = collectDefinitions(list);
  const out: Reference[] = [];
  const pending: Array<{ s: Statement; kind: ReferenceKind; n: NameAt; use: ReferenceUse; extra: Partial<Reference> }> = [];
  const isDefined = (kind: ReferenceKind, name: string | null) =>
    !!name && (defs.classes.has(name) || defs.interfaces.has(name) || ((kind === 'type' || kind === 'table') && defs.types.has(name)));
  for (const s of list) {
    // A macro body is code with placeholders; its names are references too. Native SQL is not ABAP.
    if (s.context === 'native') continue;
    const u = unitsOf(s.tokens);
    const emit: Emit = (kind, unit, use, extra = {}) => {
      const name = extra.name !== undefined ? extra.name : unit.up;
      out.push({ kind, name, use, statement: s.index, row: unit.token.row, col: unit.token.col, resolution: 'static', defined: isDefined(kind, name), ...extra });
    };
    const dyn: Dyn = (kind, n, use, extra = {}) => {
      if (n.literal) emit(kind, n.unit, use, { ...extra, name: (n.unit.value ?? '').toUpperCase(), resolution: 'literal' });
      else if (n.variable) pending.push({ s, kind, n, use, extra });
      else emit(kind, n.unit, use, extra);
    };
    generalReferences(s, u, emit);
    statementReferences(s, u, emit, dyn, defs);
  }
  // Dynamic names: the scoped, sound value reading (values.ts). The use statements only read their variable.
  const context = valueContext(list, tree, new Set(pending.map((p) => p.s.index)));
  for (const p of pending) {
    const variable = p.n.variable!;
    const a = valueAt(context, variable, p.s.index);
    const r: Pick<Reference, 'name' | 'resolution' | 'via' | 'candidates' | 'provenance' | 'scope'> = {
      name: a.name,
      resolution: a.resolution,
      via: { variable, row: a.row },
      provenance: a.provenance,
      scope: a.scope,
      ...(a.resolution === 'dynamic' ? { candidates: a.candidates ?? [] } : {}),
    };
    out.push({ kind: p.kind, use: p.use, statement: p.s.index, row: p.n.unit.token.row, col: p.n.unit.token.col, defined: isDefined(p.kind, r.name), ...p.extra, ...r });
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<ReferenceKind, number>;
  for (const r of out) if (!r.defined) counts[r.kind] += 1;
  return {
    references: out,
    definitions: { classes: [...defs.classes].sort(), interfaces: [...defs.interfaces].sort(), types: [...defs.types].sort() },
    counts,
  };
}
