/**
 * Which implementation a method call reaches — in one place, for the
 * skeleton and the business statement.
 *
 * `process-skeleton.ts` built this resolution first (D2, 27.09.2026);
 * `business-statement.ts` needed the same one when QA (b7e191a72212) showed
 * that a `lo_external->save( )` was credited with the effect of the local
 * method `save` that happened to share its name. Two resolutions would have
 * contradicted each other sooner or later; that is why the rule lives here,
 * and both call it.
 *
 * **The class comes from the call, never from a guess.** `cls=>m` names it;
 * `me->m` and a bare `m` mean the class the call sits in; `lo->m` means the
 * class `lo` is declared with, if the source names exactly one; `super->m`
 * the superclass of the own class. From there it goes up the inheritance
 * chain the source writes. If the call names no class, the name alone decides
 * only when the caller explicitly allows it (`byNameAlone`) — the skeleton
 * does and draws an ambiguous call as opaque; the business statement does
 * not, because it would otherwise credit a foreign method with a local effect.
 *
 * This module knows neither the skeleton nor the business statement.
 */

import { maskLiterals, type AbapStatement } from './statement-reader';

/** A method the source implements. */
export interface MethodTarget {
  /** `CLASS=>METHOD`, upper case — the routine's key. */
  key: string;
  cls: string;
  /** As the implementation writes it, upper case: `RUN`, `ZIF_X~RUN`. */
  name: string;
  /** The part after `~`, or the name itself. */
  short: string;
}

export interface ClassModel {
  impls: readonly MethodTarget[];
  /** `CLASS x DEFINITION INHERITING FROM y`, upper case. */
  superOf: ReadonlyMap<string, string>;
  /** The classes a reference variable is declared with, upper case. */
  refTypes: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface MethodResolution {
  key: string | null;
  ambiguous: boolean;
  /** Whether the class was fixed by the call — not merely guessed from the name. */
  byClass: boolean;
  /**
   * The implementations an `ambiguous` call can reach, `CLASS=>METHOD` in source order — the interface's
   * implementing classes, the declared class and the subclasses that redefine the method, or every class that
   * carries the name when the name alone decided. Empty for a resolved call and for a call that reaches nothing.
   * Engine 3.2.0 draws each of them (`process-skeleton.ts`, `methodEntries`); the reading before it ignores the list.
   */
  candidates: string[];
}

export interface ResolveOptions {
  /** May the name alone decide when the call names no class? The skeleton allows it, the business statement does not. */
  byNameAlone: boolean;
  /**
   * Engine 3.2.0: `me->m( )` and a bare `m( )` dispatch at run time like a call on a reference variable does — `me`
   * is an instance of the own class **or of a subclass**, and a subclass that redefines `m` runs its own `m`. With
   * this option such a call is ambiguous whenever a subclass the source writes redefines the method. Without it (the
   * reading before 3.2.0) the own class's implementation is taken.
   */
  dynamicDispatch?: boolean;
}

/**
 * Which class a reference variable holds, as far as the source says so
 * literally: `TYPE REF TO`, `DATA(x) = NEW cls( )`, `x = NEW cls( )`,
 * `CREATE OBJECT x TYPE cls`, `CAST cls( … )`. A name with two different
 * types (two scopes) stays unresolved.
 */
export function readReferenceTypes(statements: readonly AbapStatement[]): Map<string, Set<string>> {
  const refTypes = new Map<string, Set<string>>();
  const add = (variable: string, type: string) => {
    const name = variable.toUpperCase().replace(/^ME->/, '');
    const set = refTypes.get(name) ?? new Set<string>();
    set.add(type.toUpperCase());
    refTypes.set(name, set);
  };
  for (const statement of statements) {
    if (statement.nativeSql) continue;
    const code = maskLiterals(statement.text);
    for (const m of code.matchAll(/([\w/]+)\s+TYPE\s+REF\s+TO\s+([\w/]+)/gi)) add(m[1], m[2]);
    const inline = /^(?:DATA|FINAL)\(([\w/]+)\)\s*=\s*(?:NEW|CAST)\s+([\w/]+)\(/i.exec(code);
    if (inline) add(inline[1], inline[2]);
    const assigned = /^((?:ME->)?[\w/]+)\s*=\s*(?:NEW|CAST)\s+([\w/]+)\(/i.exec(code);
    if (assigned) add(assigned[1], assigned[2]);
    const created = /^CREATE\s+OBJECT\s+((?:ME->)?[\w/]+)\s+TYPE\s+([\w/]+)/i.exec(code);
    if (created) add(created[1], created[2]);
  }
  return refTypes;
}

/**
 * The implementation a call reaches, or why there is none.
 *
 * `qualifier` is what stands before the last arrow (`)` for an object that
 * cannot be named), `ownClass` the class in whose `IMPLEMENTATION` the call
 * sits.
 */
export function resolveMethodTarget(
  model: ClassModel,
  qualifier: string | null,
  op: '->' | '=>' | null,
  name: string,
  ownClass: string | null,
  options: ResolveOptions,
): MethodResolution {
  const wanted = name.toUpperCase();
  const byName = (impl: MethodTarget) => impl.name === wanted || impl.short === wanted;
  const unique = (found: MethodTarget[], byClass: boolean): MethodResolution =>
    found.length === 1
      ? { key: found[0].key, ambiguous: false, byClass, candidates: [] }
      : { key: null, ambiguous: found.length > 1, byClass, candidates: found.length > 1 ? found.map((impl) => impl.key) : [] };

  // Up the chain the source writes: an inherited method is still the class's
  // method. The qualifier is never dropped — a known class that implements
  // nothing under this name means "not here", not "the same-named method of
  // another class".
  const alongChain = (from: string): MethodResolution => {
    const seen = new Set<string>();
    for (let at: string | undefined = from; at && !seen.has(at); at = model.superOf.get(at)) {
      seen.add(at);
      const own = model.impls.filter((impl) => impl.cls === at && impl.name === wanted);
      if (own.length) return unique(own, true);
      const alias = model.impls.filter((impl) => impl.cls === at && byName(impl));
      if (alias.length) return unique(alias, true);
    }
    // An interface reference: the implementations write `lif_x~m`.
    const viaInterface = model.impls.filter((impl) => impl.name === `${from}~${wanted}`);
    if (viaInterface.length) return unique(viaInterface, true);
    return { key: null, ambiguous: false, byClass: true, candidates: [] };
  };

  let cls: string | null = null;
  // Whether the class is the declared type of a reference variable.
  let fromReference = false;
  const q = qualifier?.toUpperCase() ?? null;
  if (op === '=>' && q) cls = q;
  else if (op === null || q === 'ME') cls = ownClass;
  else if (q && q !== ')' && q !== 'SUPER') {
    const types = model.refTypes.get(q);
    if (types?.size === 1) {
      cls = [...types][0];
      fromReference = true;
    }
  }

  if (q === 'SUPER') cls = ownClass ? model.superOf.get(ownClass) ?? null : null;

  // The declared type is not the runtime type: `lo TYPE REF TO lcl_base`
  // can hold an instance of `lcl_sub`, and `lo->run( )` then reaches its
  // redefinition. If a subclass the source writes redefines the method, the
  // target is not unique. Engine 3.2.0 reads `me->m( )` and a bare `m( )` the
  // same way (`dynamicDispatch`): `me` is an instance of the own class or of a
  // subclass, so a redefinition below the own class is a candidate as well.
  // A static call (`=>`) and `super->` name their implementation and never
  // dispatch.
  const dispatches = fromReference || (options.dynamicDispatch === true && (op === null || q === 'ME'));
  if (cls && dispatches) {
    const base = cls;
    const below = (at: string): boolean => {
      const seen = new Set<string>([at]);
      for (let up = model.superOf.get(at); up && !seen.has(up); up = model.superOf.get(up)) {
        if (up === base) return true;
        seen.add(up);
      }
      return false;
    };
    const redefinitions = model.impls.filter((impl) => impl.cls !== base && byName(impl) && below(impl.cls));
    if (redefinitions.length) {
      // The implementation the declared class itself would run — inherited or
      // its own — is a candidate beside the redefinitions; an abstract method
      // without one contributes nothing.
      const declared = alongChain(base);
      const candidates = [...(declared.key ? [declared.key] : declared.candidates), ...redefinitions.map((impl) => impl.key)];
      return { key: null, ambiguous: true, byClass: true, candidates: [...new Set(candidates)] };
    }
  }

  if (cls) return alongChain(cls);
  if (!options.byNameAlone) return { key: null, ambiguous: false, byClass: false, candidates: [] };
  return unique(model.impls.filter(byName), false);
}
