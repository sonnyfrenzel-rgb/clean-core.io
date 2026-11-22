import { maskLiterals, type AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import { readReferenceTypes, resolveMethodTarget } from '../method-resolution';
import { candidatesForCall, readClassHierarchy, type ClassHierarchy } from '../class-hierarchy';
import type { MethodImpl } from './declarations';
import type { SkeletonReadings } from './graph';
import { DECLARES } from './keywords';
import { isRaiseEvent } from './recognisers';
import { classOf } from './statement-readers';

/**
 * Method dispatch of the skeleton — engine 4 phase 3 (`docs/design/engine4.md`, "Phase 3"): which implementation a
 * method call reaches (D2, AB-15b), every method call one statement writes, the method call sites over the whole
 * source, and the event handlers a `RAISE EVENT` runs. Moved out of `SkeletonBuilder` unchanged.
 *
 * Not a graph pass: it draws nothing and is asked by the passes (effects, entries, the walk). It keeps the
 * builder's caches — one reading of each statement's calls, the class hierarchy read on first need — so it is a
 * small class. What the walk alone knows (the handlers registered so far) stays in the walk, which filters
 * `handlersRaisedBy` itself. Readings: `reads310` (`SET HANDLER NEW cls( )->m`), `reads320` (run-time dispatch,
 * candidates, AB-15b).
 */
export interface DispatchInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  methodImpls: MethodImpl[];
  superOf: ReadonlyMap<string, string>;
  routineBlocks: ReadonlyMap<string, Block>;
}

/** An ambiguous call an implementation is a candidate of — the statement, the call, its line, how many it can reach. */
export interface CandidateSite {
  index: number;
  label: string;
  line: number;
  of: number;
}

/**
 * One method call the source writes (D2) — `CALL METHOD x->m`, `x->m( … )`,
 * `cls=>m( … )`, `me->m( … )`, `m( … )`, and a constructor behind `NEW` or
 * `CREATE OBJECT`.
 */
export interface MethodCall {
  /** Upper-cased method name as the call writes it (`ZIF_X~M` stays whole). */
  name: string;
  /** The routine key this call resolves to, or `null` when it does not. */
  key: string | null;
  /** More than one implementation fits and the call does not say which. */
  ambiguous: boolean;
  /** The implementations an ambiguous call can reach, `CLASS=>METHOD` — empty otherwise (`method-resolution.ts`). */
  candidates: string[];
  /**
   * The class came from the call or from the static type the source writes — not from the method name alone. Only a
   * typed call draws its candidates as alternatives (`drawsAlternatives`): an untyped `lo->run( )` may reach a class
   * outside this source, and the method that runs is then none of the ones that share its name here.
   */
  typed: boolean;
  /** The method name is computed at run time: `CALL METHOD (lv_name)`. */
  dynamic: boolean;
  /** The call is the whole statement, not an operand inside one. */
  standalone: boolean;
  constructor: boolean;
  /** A token out of the source: `LO_ALV->DISPLAY`, `LCL_APP=>RUN`, `RUN`. */
  label: string;
  /** Position in the masked statement text — the order calls are evaluated in. */
  at: number;
}

export class MethodDispatch {
  /** `lo_x TYPE REF TO lcl_y` and its relatives: the class a reference variable holds (`readCallSites`). */
  refTypes = new Map<string, Set<string>>();
  /** Engine 3.2.0 (AB-15b): the program's own classes, interfaces and their relations (`class-hierarchy.ts`), read once. */
  private hierarchy: ClassHierarchy | null = null;
  private cache = new Map<number, MethodCall[]>();
  /** The statements, over the whole source, whose calls resolve to each method — for entries and helpers. */
  readonly methodCallSites = new Map<string, number[]>();
  /**
   * Engine 3.2.0: the ambiguous calls each implementation is a candidate of. Empty for an older engine
   * (`readCallSites`), so nothing below changes its map.
   */
  readonly candidateSites = new Map<string, CandidateSite[]>();
  /** `METHODS m FOR EVENT ev OF cls` — the event each implemented handler method declares, upper-cased. */
  readonly handlerEvent = new Map<string, { event: string; of: string }>();
  /** Handler methods a `SET HANDLER` of this source registers, in the order it first names them. */
  boundHandlers: string[] = [];
  /** Handlers some `SET HANDLER … ACTIVATION` of this source may switch off — never a binding. */
  readonly deregisteredHandlers = new Set<string>();

  constructor(private input: DispatchInput, private readings: SkeletonReadings) {}

  /**
   * Which class a reference variable holds, as far as the source says it in so
   * many words: `TYPE REF TO`, `DATA(x) = NEW cls( )`, `x = NEW cls( )`,
   * `CREATE OBJECT x TYPE cls`, `CAST cls( … )`. A name declared with two
   * different types (two scopes) is not resolved — see `resolveMethod`.
   * And then counts, over the whole source, how often each method is called.
   */
  readCallSites(): void {
    this.refTypes = readReferenceTypes(this.input.statements);
    for (const statement of this.input.statements) {
      for (const call of this.methodCallsIn(statement)) {
        if (call.key) this.methodCallSites.set(call.key, [...(this.methodCallSites.get(call.key) ?? []), statement.index]);
        // Only a call whose class the source names (`typed`): one matched by the method name alone may reach a class
        // outside this source, so the implementations here that share the name are no candidates of it.
        if (!this.readings.reads320 || !call.ambiguous || !call.typed) continue;
        for (const candidate of call.candidates) {
          this.candidateSites.set(candidate, [
            ...(this.candidateSites.get(candidate) ?? []),
            { index: statement.index, label: call.label, line: statement.lineStart, of: call.candidates.length },
          ]);
        }
      }
    }
  }

  /**
   * The implementation a call reaches, or why there is none.
   *
   * **The class comes from the call, never from a guess.** `cls=>m` names it;
   * `me->m` and a bare `m` mean the class the call is written in; `lo->m` means
   * the class `lo` is declared with, when the source declares it with exactly
   * one. Where the call says no class, the name decides only when exactly one
   * implementation in this source carries it — two local classes that both
   * implement `run` and a call `lo->run( )` on a reference this source does not
   * type is `ambiguous`, and an ambiguous call is drawn opaque rather than
   * pointed at one of the two (brief of 27.09.2026, D2).
   *
   * The rule itself lives in `method-resolution.ts`, shared with the business
   * statements; the skeleton lets the name decide alone.
   */
  resolveMethod(
    qualifier: string | null,
    op: '->' | '=>' | null,
    name: string,
    index: number,
  ): { key: string | null; ambiguous: boolean; candidates: string[]; typed: boolean } {
    const model = { impls: this.input.methodImpls, superOf: this.input.superOf, refTypes: this.refTypes };
    const ownClass = classOf(this.input.statements, this.input.structure, index);
    const { key, ambiguous, candidates, byClass } = resolveMethodTarget(
      model,
      qualifier,
      op,
      name,
      ownClass,
      // Engine 3.2.0: `me->m( )` dispatches at run time when a subclass redefines `m`.
      { byNameAlone: true, dynamicDispatch: this.readings.reads320 },
    );
    if (key || !this.readings.reads320) return { key, ambiguous, candidates, typed: byClass };
    // Engine 3.2.0 (AB-15b): a call the declarations at hand leave open is resolved to the implementations the
    // program itself defines behind the reference's static type (`class-hierarchy.ts`) — one is the target, several
    // stay candidates. Where the source does not write the type, the answer above stands.
    this.hierarchy ??= readClassHierarchy(this.input.statements);
    const typed = candidatesForCall(this.hierarchy, model,
      { statementIndex: index, qualifier, op, name: name.toUpperCase(), ownClass }, this.input.statements, this.input.structure);
    if (typed.candidates.length === 1) return { key: typed.candidates[0], ambiguous: false, candidates: [], typed: true };
    if (typed.candidates.length > 1) {
      // In source order, as `method-resolution.ts` lists them — the order the beginnings are drawn in.
      const order = (k: string) => this.input.methodImpls.findIndex((impl) => impl.key === k);
      return { key: null, ambiguous: true, candidates: [...typed.candidates].sort((a, b) => order(a) - order(b)), typed: true };
    }
    return { key, ambiguous, candidates, typed: byClass };
  }

  /**
   * Event handlers — which implemented method a `RAISE EVENT` of this source
   * runs, as far as the source writes it down.
   *
   * ABAP binds a handler to an event in two places, and both must stand here:
   * the definition declares it (`METHODS on_done FOR EVENT done OF lcl_run`),
   * and a `SET HANDLER lo->on_done FOR …` registers it. The declaration alone
   * is not a binding — a handler nobody registers never runs — and the
   * registration alone does not say which event it answers. With both, the
   * `RAISE EVENT done` calls that method, synchronously, and the statement after
   * it runs next: a method call in all but spelling, and §5.8 draws "a
   * `FORM`/method with an effect of its own" as a sub-process.
   *
   * The handler named in `SET HANDLER` is resolved by the one rule every
   * method call uses (`method-resolution.ts`, via `resolveMethod`) — no second
   * resolution. A name that does not resolve, or resolves to two classes, binds
   * nothing, and the `RAISE EVENT` stays what it was: an opaque call (rule 3).
   * `ACTIVATION ' '` / `abap_false` deregisters and is not read as a binding.
   */
  readEventHandlers(): void {
    for (const block of this.input.structure.blocks) {
      if (block.kind !== 'class') continue;
      const cls = /^CLASS\s+([\w/]+)\s+DEFINITION\b/i.exec(this.input.statements[block.openIndex].text)?.[1]?.toUpperCase();
      if (!cls) continue;
      for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
        const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)\s+FOR\s+EVENT\s+([\w/~]+)\s+OF\s+([\w/]+)/i
          .exec(this.input.statements[i].text);
        if (!m) continue;
        const key = `${cls}=>${m[1].toUpperCase()}`;
        if (this.input.routineBlocks.has(key)) this.handlerEvent.set(key, { event: m[2].toUpperCase(), of: m[3].toUpperCase() });
      }
    }
    if (!this.handlerEvent.size) return;
    // A handler the source may deregister anywhere is not a binding at all —
    // which of the two is in force at a given `RAISE` is a question of run
    // time, and the conservative answer is the opaque call. The order of
    // registration and `RAISE` is the walk's to decide (`registeredInWalk`).
    const registered: string[] = [];
    for (const statement of this.input.statements) {
      const handlers = this.handlersSetBy(statement);
      if (!handlers) continue;
      for (const { key } of handlers) {
        if (handlers.deregisters) this.deregisteredHandlers.add(key);
        else if (!registered.includes(key)) registered.push(key);
      }
    }
    this.boundHandlers = registered.filter((key) => !this.deregisteredHandlers.has(key));
    for (const statement of this.input.statements) {
      if (!isRaiseEvent(statement.text)) continue;
      for (const key of this.handlersRaisedBy(statement)) {
        this.methodCallSites.set(key, [...(this.methodCallSites.get(key) ?? []), statement.index]);
      }
    }
  }

  /**
   * The implemented handlers one `SET HANDLER` names, resolved through
   * `resolveMethod`, and whether the statement (possibly) deregisters them —
   * `null` for any other statement. `ACTIVATION` with anything but `'X'` or
   * `abap_true` (`' '`, `space`, `abap_false`, a variable) is read as a
   * possible deregistration: a value the reader cannot pin to "on" is not "on".
   */
  handlersSetBy(statement: AbapStatement): (Array<{ key: string; name: string }> & { deregisters: boolean }) | null {
    if (statement.keyword !== 'SET' || statement.nativeSql) return null;
    const set = /^SET\s+HANDLER\s+([\s\S]+?)\s+FOR\s+/i.exec(maskLiterals(statement.text));
    if (!set) return null;
    const activation = /\bACTIVATION\s+(\S+)/i.exec(statement.text)?.[1];
    const out = Object.assign([] as Array<{ key: string; name: string }>, {
      deregisters: activation !== undefined && !/^(?:'X'|abap_true)$/i.test(activation),
    });
    // Engine 3.1.0 (AB-15a): a handler of an object created right there — `SET HANDLER NEW lcl_mailer( )->on_x` —
    // is that class's method, as if it were written `lcl_mailer=>on_x`; before, the split words matched nothing.
    const list = this.readings.reads310 ? set[1].replace(/\bNEW\s+([\w/]+)\(\s*[^()]*\)\s*->\s*([\w/~]+)/gi, '$1=>$2') : set[1];
    for (const handler of list.split(/\s+/)) {
      const parts = /^(?:([\w/]+|<[\w/]+>)(->|=>))?([\w/~]+)$/.exec(handler);
      if (!parts) continue;
      const { key, ambiguous } = this.resolveMethod(parts[1] ?? null,
        (parts[2] as '->' | '=>' | undefined) ?? null, parts[3].toUpperCase(), statement.index);
      if (key && !ambiguous && this.handlerEvent.has(key)) out.push({ key, name: parts[3] });
    }
    return out;
  }

  /**
   * The registered handlers a `RAISE EVENT` runs: those declared for this event
   * of the raising class, of a class it inherits from, or of the interface the
   * statement names (`RAISE EVENT lif_x~ev`). In the order `SET HANDLER`
   * registered them — the order the runtime calls them in.
   */
  handlersRaisedBy(statement: AbapStatement): string[] {
    if (!this.boundHandlers.length) return [];
    const written = /^RAISE\s+EVENT\s+([\w/~]+)/i.exec(statement.text)?.[1]?.toUpperCase();
    const raiser = classOf(this.input.statements, this.input.structure, statement.index);
    if (!written || !raiser) return [];
    const tilde = written.lastIndexOf('~');
    const event = tilde < 0 ? written : written.slice(tilde + 1);
    const owners = new Set<string>();
    if (tilde >= 0) owners.add(written.slice(0, tilde));
    for (let at: string | undefined = raiser; at && !owners.has(at); at = this.input.superOf.get(at)) owners.add(at);
    return this.boundHandlers.filter((key) => {
      const declared = this.handlerEvent.get(key);
      return declared !== undefined && declared.event === event && owners.has(declared.of);
    });
  }

  /**
   * Every method call in one statement, in the order they are written (D2).
   *
   * Read off the code with its literals masked, and only in the shapes ABAP
   * gives a method call: a name directly followed by `(` — ABAP allows no blank
   * there — after `->` or `=>`, or a bare name inside a class implementation
   * (outside one, `name(` is an offset or a built-in function, never a
   * method). A name behind a constructor operator (`NEW`, `CAST`, `VALUE`, …)
   * is a type, not a call; `NEW cls( )` and `CREATE OBJECT` are read as the
   * constructor they run.
   */
  methodCallsIn(statement: AbapStatement): MethodCall[] {
    const cached = this.cache.get(statement.index);
    if (cached) return cached;
    const out: MethodCall[] = [];
    this.cache.set(statement.index, out);
    if (statement.nativeSql || !this.worthReadingForCalls(statement)) return out;

    const code = maskLiterals(statement.text).replace(/\.\s*$/, '');
    const index = statement.index;
    const standaloneAt = this.standaloneCallAt(statement, code);

    // `CALL METHOD target …` and its short form `CALL METHOD target( … )`.
    const explicit = /^CALL\s+METHOD\s+/i.exec(code);
    let explicitEnd = -1;
    if (explicit) {
      const rest = code.slice(explicit[0].length);
      const target = /^[^\s(]*/.exec(rest)?.[0] ?? '';
      explicitEnd = explicit[0].length + target.length;
      // `CALL METHOD (lv_name)` and `CALL METHOD lo->(lv_name)`.
      const dynamic = /^(?:\S*?(?:->|=>))?\(/.test(rest);
      const segments = target.split(/(->|=>)/);
      const name = (segments[segments.length - 1] ?? '').toUpperCase();
      const op = segments.length >= 3 ? segments[segments.length - 2] as '->' | '=>' : null;
      const qualifier = segments.length >= 3 ? segments[segments.length - 3] || ')' : null;
      const resolved = dynamic || !/^[\w/~]+$/.test(name)
        ? { key: null, ambiguous: false, candidates: [], typed: false }
        : this.resolveMethod(qualifier, op, name, index);
      out.push({
        name, ...resolved, dynamic, standalone: true, constructor: false,
        label: (target || 'CALL METHOD').toUpperCase(), at: 0,
      });
    }

    const call = /(?:([\w/]+|<[\w/]+>|\))(->|=>))?([\w/~]+)\(/g;
    let m: RegExpExecArray | null;
    while ((m = call.exec(code))) {
      const at = m.index;
      if (at < explicitEnd) continue;
      const before = code.slice(0, at);
      // A type behind a constructor operator, and a name glued to what stands
      // before it (`ls_x-f(`, `lv+0(`) — neither is a call.
      if (/\b(?:NEW|CAST|CONV|VALUE|REF|EXACT|CORRESPONDING|COND|SWITCH|REDUCE|FILTER)\s+$/i.test(before)) continue;
      let op = (m[2] as '->' | '=>' | undefined) ?? null;
      let qualifier = m[1] ?? null;
      const trailing = /(->|=>)$/.exec(before);
      if (!op && trailing) {
        // `lt_x[ 1 ]->run(`: an object the reader cannot name — still a call on one.
        op = trailing[1] as '->' | '=>';
        qualifier = ')';
      } else if (!trailing && /[\w/\-+~<>@]$/.test(before)) continue;
      if (op === null && !classOf(this.input.statements, this.input.structure, index)) continue;
      const name = m[3].toUpperCase();
      const resolved = this.resolveMethod(qualifier, op, name, index);
      out.push({
        name, ...resolved, dynamic: false, standalone: at === standaloneAt, constructor: false,
        label: qualifier && qualifier !== ')' ? `${qualifier}${op}${m[3]}`.toUpperCase() : name,
        at,
      });
    }

    // A constructor runs where the object is created. It is a call only when
    // this source implements it — otherwise there is nothing to open.
    const created = /\bNEW\s+([\w/#]+)\(/gi;
    while ((m = created.exec(code))) {
      let cls = m[1].toUpperCase();
      if (cls === '#') {
        const target = /^(?:ME->)?([\w/]+)\s*=/i.exec(code)?.[1]?.toUpperCase();
        const types = target ? this.refTypes.get(target) : undefined;
        if (types?.size !== 1) continue;
        cls = [...types][0];
      }
      this.pushConstructor(out, cls, m.index);
    }
    const createObject = /^CREATE\s+OBJECT\s+((?:ME->)?[\w/]+)(?:\s+TYPE\s+([\w/]+))?/i.exec(code);
    if (createObject) {
      const variable = createObject[1].toUpperCase().replace(/^ME->/, '');
      const types = this.refTypes.get(variable);
      const cls = createObject[2]?.toUpperCase() ?? (types?.size === 1 ? [...types][0] : null);
      if (cls) this.pushConstructor(out, cls, 0);
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  private pushConstructor(out: MethodCall[], cls: string, at: number): void {
    const key = `${cls}=>CONSTRUCTOR`;
    if (!this.input.routineBlocks.has(key)) return;
    out.push({
      name: 'CONSTRUCTOR', key, ambiguous: false, candidates: [], typed: true, dynamic: false, standalone: false,
      constructor: true, label: `${cls}=>CONSTRUCTOR`, at,
    });
  }

  /** Statements whose keyword already decides what they are never hold a call worth drawing. */
  private worthReadingForCalls(statement: AbapStatement): boolean {
    // `check( ).`, `set( … ).`: a name glued to its bracket is a call, not the
    // keyword it happens to spell — ABAP writes no keyword that way.
    if (/^[\w/~]+\(/.test(statement.text)) return true;
    if (/^(?:DATA|FINAL)\(/i.test(statement.text)) return true;
    if (DECLARES.has(statement.keyword)) return false;
    return !['PERFORM', 'MESSAGE', 'RAISE', 'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE',
      'WRITE', 'SUBMIT', 'SET', 'ENDIF', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDCASE', 'ENDTRY',
      'ELSE', 'CATCH', 'CLEANUP', 'ENDSELECT', 'ENDAT'].includes(statement.keyword)
      && !/^CALL\s+(?:FUNCTION|TRANSACTION|SCREEN|SELECTION-SCREEN|BADI|DIALOG)\b/i.test(statement.text);
  }

  /**
   * Where the statement **is** a call — `x->m( … ).`, `cls=>m( … ).`,
   * `m( … ).`, or a chain of them — the position of the call whose result the
   * statement discards: the last one of the chain. `-1` for any other statement.
   * An assignment is not one: with the brackets taken out, a top-level `=`
   * remains (`lv(10) = x.`, `ls-f = lo->m( ).`).
   */
  private standaloneCallAt(statement: AbapStatement, code: string): number {
    if (/^CALL\s+METHOD\b/i.test(code)) return -1;
    if (!/^(?:(?:[\w/]+|<[\w/]+>|\))(?:->|=>))*[\w/~]+\(/.test(code)) return -1;
    let depth = 0;
    let last = -1;
    let flat = '';
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '(') {
        if (depth === 0) {
          const head = /(?:([\w/]+|<[\w/]+>|\))(->|=>))?([\w/~]+)$/.exec(code.slice(0, i));
          if (head) last = i - head[0].length;
        }
        depth += 1;
        continue;
      }
      if (ch === ')') { depth = Math.max(0, depth - 1); if (depth === 0) flat += '()'; continue; }
      if (depth === 0) flat += ch;
    }
    if (/=/.test(flat.replace(/->|=>/g, ''))) return -1;
    if (!classOf(this.input.statements, this.input.structure, statement.index) && !/->|=>/.test(flat)) return -1;
    return last;
  }

}
