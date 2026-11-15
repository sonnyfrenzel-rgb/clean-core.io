/**
 * Class hierarchy analysis over one source — which implementations a method call on a reference can reach, as far
 * as the source writes it (AB-15b, engine 3.2.0, `ENGINE_READS_320_FROM`).
 *
 * `method-resolution.ts` answers "which implementation" from the call and the declarations it can see at once:
 * `lo TYPE REF TO lif` with one implementing class, `lo TYPE REF TO lcl_base` with the subclasses that redefine the
 * method. It stops where the source says the type in a place it does not read — and there it either takes the name
 * alone (any class that implements a method of that name) or leaves the call open. This module answers the same
 * question from what the program itself defines:
 *
 * - **the static type of the reference**, read where the source writes it: the declaration inside the routine or
 *   event block the call sits in (a name declared with two types in two scopes is the reason a source-wide table cannot answer); the
 *   declared return type of a factory method (`DATA(lo) = lcl_factory=>create( … )`); the line type of a table of
 *   references the routine loops over (`LOOP AT mt_steps INTO DATA(lo_step)`); and, source-wide, the one declared
 *   type every other type named for that variable is a subtype of (`lo TYPE REF TO lcl_base` and `lo = NEW lcl_sub( )`);
 * - **the classes behind that type**: every class whose definition lists the interface — directly, through an
 *   interface that includes it, or through a superclass that lists it — or, for a class type, the class and every
 *   class below it. An `ABSTRACT` class is never the class of an object, so its own implementation is a candidate
 *   only where a concrete class below it inherits it;
 * - **the implementation each class runs**: its own, or the nearest one above it.
 *
 * **It does not guess.** A reference whose type the source does not write, or a type this source does not define,
 * has no candidates — the caller keeps the answer it had. Several candidates stay several: which one runs is decided
 * at run time by the object, and the source in hand does not say. The set is a statement about the source, not about
 * the system: another program can always add an implementation of a global interface. No narrowing by the classes
 * the source instantiates (rapid type analysis): a `NEW #( )`, a factory or a dynamic `CREATE OBJECT` can create an
 * object whose class the words do not name, and the experiment it was measured in (worktree
 * `agent-a72177d7ea222fe15`, 06.11.2026) never narrowed a call of the learning halves.
 *
 * Pure and deterministic: candidates are sorted by routine key. No imports beyond the statement reader, the block
 * structure's types and the resolver's types.
 */

import type { AbapStatement } from './statement-reader';
import { maskLiterals } from './statement-reader';
import type { BlockStructure } from './block-structure';
import type { ClassModel, MethodTarget } from './method-resolution';

export interface ClassHierarchy {
  /** `CLASS x DEFINITION INHERITING FROM y`, upper case. */
  superOf: ReadonlyMap<string, string>;
  /** Classes and interfaces this source defines, upper case. */
  classes: ReadonlySet<string>;
  interfaces: ReadonlySet<string>;
  /** Interfaces a class lists itself — not yet the ones its superclass brings. */
  interfacesOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** Interfaces an interface includes (`INTERFACES` inside `INTERFACE`). */
  includedBy: ReadonlyMap<string, ReadonlySet<string>>;
  /** `CLASS x DEFINITION ABSTRACT`: never the class of an object. */
  abstractClasses: ReadonlySet<string>;
  /** The type a method returns, by `CLS=>METHOD`, where it returns a reference. */
  returnsRef: ReadonlyMap<string, string>;
  /** `x TYPE … TABLE OF REF TO t`, upper case. */
  tableOfRef: ReadonlyMap<string, ReadonlySet<string>>;
}

export function readClassHierarchy(statements: readonly AbapStatement[]): ClassHierarchy {
  const superOf = new Map<string, string>();
  const classes = new Set<string>();
  const interfaces = new Set<string>();
  const interfacesOf = new Map<string, Set<string>>();
  const includedBy = new Map<string, Set<string>>();
  const abstractClasses = new Set<string>();
  const returnsRef = new Map<string, string>();
  const tableOfRef = new Map<string, Set<string>>();
  let openClass: string | null = null;
  let openInterface: string | null = null;

  const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };

  for (const statement of statements) {
    if (statement.nativeSql) continue;
    const code = maskLiterals(statement.text);
    const classOpen = /^CLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD|LOCAL\s+FRIENDS)\b)/i.exec(code);
    if (classOpen) {
      openClass = classOpen[1].toUpperCase();
      openInterface = null;
      classes.add(openClass);
      const parent = /\bINHERITING\s+FROM\s+([\w/]+)/i.exec(code);
      if (parent) superOf.set(openClass, parent[1].toUpperCase());
      if (/\bABSTRACT\b/i.test(code)) abstractClasses.add(openClass);
      continue;
    }
    const interfaceOpen = /^INTERFACE\s+([\w/]+)\s*(?:PUBLIC\s*)?\.?$/i.exec(code);
    if (interfaceOpen) {
      openInterface = interfaceOpen[1].toUpperCase();
      openClass = null;
      interfaces.add(openInterface);
      continue;
    }
    if (/^(?:ENDCLASS|ENDINTERFACE)\b/i.test(code)) {
      openClass = null;
      openInterface = null;
      continue;
    }
    if (openClass || openInterface) {
      const lists = /^INTERFACES\s+([\w/]+)/i.exec(code);
      if (lists) {
        if (openClass) addTo(interfacesOf, openClass, lists[1].toUpperCase());
        if (openInterface) addTo(includedBy, openInterface, lists[1].toUpperCase());
      }
      if (openClass) {
        const returning = /^(?:CLASS-)?METHODS\s+([\w/~]+)\b[\s\S]*?\bRETURNING\s+VALUE\(\s*[\w/]+\s*\)\s+TYPE\s+REF\s+TO\s+([\w/]+)/i.exec(code);
        if (returning) returnsRef.set(`${openClass}=>${returning[1].toUpperCase()}`, returning[2].toUpperCase());
      }
    }
    for (const m of code.matchAll(/([\w/]+)\s+TYPE\s+(?:(?:STANDARD|SORTED|HASHED)\s+)?TABLE\s+OF\s+REF\s+TO\s+([\w/]+)/gi)) {
      addTo(tableOfRef, m[1].toUpperCase(), m[2].toUpperCase());
    }
  }
  return { superOf, classes, interfaces, interfacesOf, includedBy, abstractClasses, returnsRef, tableOfRef };
}

/** One method call, as far as the words go. */
export interface CallSite {
  statementIndex: number;
  /** What stands before the last arrow, as written; `)` for an object the reader cannot name. */
  qualifier: string | null;
  op: '->' | '=>' | null;
  /** Upper case, `LIF~RUN` stays whole. */
  name: string;
  /** The class in whose `IMPLEMENTATION` the call sits. */
  ownClass: string | null;
}

export interface CandidateSet {
  /** Routine keys, sorted. Empty: the source names no candidate — the caller keeps its own answer. */
  candidates: string[];
  /** The static type the set was computed from. */
  type: string | null;
  /** The call is on the object itself (`m( )`, `me->m( )`): a redefinition below the own class can answer. */
  selfDispatch: boolean;
}

/** The blocks whose own declarations type a reference used inside them. */
const ROUTINE_KINDS: ReadonlySet<string> = new Set(['method', 'form', 'function', 'module', 'event']);

/** Every class an object `TYPE REF TO type` can be an instance of, by what this source defines. Sorted. */
function subtypes(hierarchy: ClassHierarchy, type: string): string[] {
  const out = new Set<string>();
  const isInterface = hierarchy.interfaces.has(type);
  // The type itself and every interface that includes it.
  const reachingInterfaces = new Set<string>([type]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [outer, inner] of hierarchy.includedBy) {
      if (reachingInterfaces.has(outer)) continue;
      if ([...inner].some((i) => reachingInterfaces.has(i))) {
        reachingInterfaces.add(outer);
        grew = true;
      }
    }
  }
  for (const cls of hierarchy.classes) {
    const seen = new Set<string>();
    for (let at: string | undefined = cls; at && !seen.has(at); at = hierarchy.superOf.get(at)) {
      seen.add(at);
      if (isInterface) {
        if ([...(hierarchy.interfacesOf.get(at) ?? [])].some((i) => reachingInterfaces.has(i))) out.add(cls);
      } else if (at === type) out.add(cls);
    }
  }
  return [...out].sort();
}

/** The implementation a concrete class runs for a method: its own, or the nearest one above it. */
function implementationFor(
  hierarchy: ClassHierarchy,
  impls: readonly MethodTarget[],
  cls: string,
  wanted: string,
  type: string,
): MethodTarget | null {
  const short = wanted.includes('~') ? wanted.slice(wanted.lastIndexOf('~') + 1) : wanted;
  const through = wanted.includes('~') ? wanted : `${type}~${short}`;
  const seen = new Set<string>();
  for (let at: string | undefined = cls; at && !seen.has(at); at = hierarchy.superOf.get(at)) {
    seen.add(at);
    const own = impls.filter((impl) => impl.cls === at && (impl.name === through || impl.name === short));
    if (own.length === 1) return own[0];
    if (own.length > 1) return own.find((impl) => impl.name === through) ?? null;
    // Reached through another interface that includes this one.
    const viaAlias = impls.filter((impl) => impl.cls === at && impl.short === short && impl.name.includes('~'));
    if (viaAlias.length === 1) return viaAlias[0];
  }
  return null;
}

/**
 * The static type behind a qualifier, read from the source around the call — the enclosing routine's own words
 * first, then the source. Only a type this source defines answers.
 */
function staticTypeOf(
  hierarchy: ClassHierarchy,
  model: ClassModel,
  site: CallSite,
  statements: readonly AbapStatement[],
  structure: BlockStructure,
): string | null {
  const q = site.qualifier?.toUpperCase() ?? null;
  if (!q || q === 'ME' || q === 'SUPER' || q === ')' || site.op !== '->') return null;
  const defined = (t: string) => hierarchy.classes.has(t) || hierarchy.interfaces.has(t);
  const routine = [...(structure.enclosing[site.statementIndex] ?? [])].reverse().find((b) => ROUTINE_KINDS.has(b.kind));
  const escaped = q.replace(/[/<>]/g, '\\$&');
  // The routine or event block the call sits in — or, for a call in a report's code outside every block, that code.
  const scope: number[] = [];
  for (let i = routine ? routine.openIndex : 0; i <= site.statementIndex && i < statements.length; i++) {
    if (routine || !(structure.enclosing[i] ?? []).some((b) => ROUTINE_KINDS.has(b.kind) || b.kind === 'class')) scope.push(i);
  }
  {
    const declared = new RegExp(`(?:^|[\\s,(])${escaped}\\s+TYPE\\s+REF\\s+TO\\s+([\\w/]+)`, 'i');
    const factory = new RegExp(`^(?:(?:DATA|FINAL)\\(${escaped}\\)|${escaped})\\s*=\\s*([\\w/]+)=>([\\w/~]+)\\(`, 'i');
    const loop = new RegExp(
      `^LOOP\\s+AT\\s+(?:ME->)?([\\w/]+)\\b[\\s\\S]*?\\b(?:INTO\\s+(?:DATA\\(${escaped}\\)|${escaped})|ASSIGNING\\s+(?:FIELD-SYMBOL\\(${escaped}\\)|${escaped}))(?:\\s|\\.|$)`,
      'i',
    );
    for (const i of scope) {
      const code = maskLiterals(statements[i].text);
      const local = declared.exec(code);
      if (local) {
        const t = local[1].toUpperCase();
        return defined(t) ? t : null;
      }
      // `DATA(lo) = lcl_factory=>create( … ).`: the factory's declared return type.
      const made = factory.exec(code);
      if (made) {
        const t = hierarchy.returnsRef.get(`${made[1].toUpperCase()}=>${made[2].toUpperCase()}`);
        if (t && defined(t)) return t;
      }
      // `LOOP AT lt INTO lo` / `ASSIGNING <lo>` over a table of references.
      const looped = loop.exec(code);
      if (looped) {
        const of = hierarchy.tableOfRef.get(looped[1].toUpperCase());
        if (of?.size === 1) {
          const t = [...of][0];
          if (defined(t)) return t;
        }
      }
    }
  }
  const types = [...(model.refTypes.get(q.replace(/^ME->/, '')) ?? [])].filter(defined);
  if (types.length === 0) return null;
  // Everything named must be a subtype of one of them, or the name means two things.
  const top = types.find((t) => types.every((other) => other === t || subtypes(hierarchy, t).includes(other)));
  return top ?? null;
}

/** The implementations the call can reach, by what this source defines — empty where the source does not say. */
export function candidatesForCall(
  hierarchy: ClassHierarchy,
  model: ClassModel,
  site: CallSite,
  statements: readonly AbapStatement[],
  structure: BlockStructure,
): CandidateSet {
  const q = site.qualifier?.toUpperCase() ?? null;
  // `m( )` and `me->m( )` run on an object of the own class or of one below it.
  const selfDispatch = site.op !== '=>' && (q === null || q === 'ME') && site.ownClass !== null && hierarchy.classes.has(site.ownClass);
  const type = selfDispatch ? site.ownClass : staticTypeOf(hierarchy, model, site, statements, structure);
  if (!type) return { candidates: [], type: null, selfDispatch: false };
  const wanted = site.name.toUpperCase();
  const found = new Set<string>();
  for (const cls of subtypes(hierarchy, type)) {
    if (hierarchy.abstractClasses.has(cls)) continue;
    const impl = implementationFor(hierarchy, model.impls, cls, wanted, type);
    if (impl) found.add(impl.key);
  }
  return { candidates: [...found].sort(), type, selfDispatch };
}
