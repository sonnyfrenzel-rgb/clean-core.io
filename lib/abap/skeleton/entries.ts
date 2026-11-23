import type { AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { CallGraphReport } from '../call-graph';
import type { SourceDeclarations } from './declarations';
import type { CandidateSite } from './dispatch';
import { snippet } from './anchors';
import { classOf } from './statement-readers';
import type { SkeletonGraph } from './graph';
import { DECLARATIVE, DECLARES } from './keywords';
import { OUTPUT_CONTROL, USER_EXIT, formConvention } from './recognisers';

/**
 * Pass "entries" — engine 4 phase 3, after the effects (`docs/design/engine4.md`, "Phase 3"): where a process may
 * begin (roadmap 2.14, rule 4). Event blocks in runtime order, the implicit START-OF-SELECTION, function modules,
 * methods callable from outside (public, interface, RAP handler, redefinition of an outside superclass), screen
 * modules, program-level enhancements, FORMs a convention or nothing else calls, and — engine 3.2.0 — the candidate
 * implementations of the source's own ambiguous calls. Each with its trigger, or a note that the source does not say.
 *
 * Reads the statements, blocks, call graph, the declarations and the dispatch's call sites. Writes notes and marks
 * every routine it makes an entry in `entryOfBlock` (shared with the walk, which adds callbacks). Moved out of
 * `SkeletonBuilder` unchanged; the callbacks the walk discovers stay with the walk. No reading gate of its own
 * (the candidate sites are empty for an engine before 3.2.0).
 */
export interface EntriesInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  calls: CallGraphReport;
  declarations: SourceDeclarations;
  dispatch: { methodCallSites: ReadonlyMap<string, number[]>; candidateSites: ReadonlyMap<string, CandidateSite[]> };
  graph: SkeletonGraph;
  /** Opening statements of the routines built as entries — shared with the walk. */
  entryOfBlock: Set<number>;
}

/**
 * Engine 3.2.0: the trigger of an entry that one of the source's own calls can reach without saying so for certain
 * (`candidateTrigger`): `candidate of MO_STATE->HANDLE@104 (1 of 3)` — the call as the source writes it, its line,
 * and how many implementations it can reach.
 */
export const CANDIDATE_TRIGGER = 'candidate of ';

/** The classic event blocks, in the order ABAP runs them (rule 4). */
export const RUNTIME_ORDER: Array<{ test: RegExp; rank: number }> = [
  { test: /^LOAD-OF-PROGRAM$/i, rank: 0 },
  { test: /^INITIALIZATION$/i, rank: 1 },
  { test: /^AT\s+SELECTION-SCREEN\s+OUTPUT\b/i, rank: 2 },
  { test: /^AT\s+SELECTION-SCREEN\s+ON\b/i, rank: 3 },
  { test: /^AT\s+SELECTION-SCREEN\b/i, rank: 4 },
  { test: /^START-OF-SELECTION$/i, rank: 5 },
  { test: /^GET\b/i, rank: 6 },
  { test: /^END-OF-SELECTION$/i, rank: 7 },
  { test: /^TOP-OF-PAGE\b/i, rank: 8 },
  { test: /^END-OF-PAGE$/i, rank: 9 },
  { test: /^AT\s+LINE-SELECTION$/i, rank: 10 },
  { test: /^AT\s+USER-COMMAND$/i, rank: 11 },
  { test: /^AT\s+PF\d/i, rank: 12 },
];

/**
 * `GET` is the one event keyword that is also an ordinary statement.
 * `GET TIME.` reads exactly like `GET <node>.`, so the second word decides.
 */
const GET_NOT_AN_EVENT = new Set([
  'TIME', 'PARAMETER', 'BADI', 'REFERENCE', 'BIT', 'RUN', 'LOCALE',
  'PF-STATUS', 'PROPERTY', 'CURSOR', 'DATASET', 'PERMISSIONS',
]);

const EVENT_WORDS = new Set([
  'INITIALIZATION', 'START-OF-SELECTION', 'END-OF-SELECTION', 'LOAD-OF-PROGRAM',
  'TOP-OF-PAGE', 'END-OF-PAGE',
]);

const AT_EVENT = /^AT\s+(?:SELECTION-SCREEN\b|LINE-SELECTION\b|USER-COMMAND\b|PF\d)/i;

/**
 * Where a process may begin — roadmap 2.14. `event` and `implicit` are the two
 * a report writes; the other four are the ways a source that is not a report
 * says "this is callable from outside", and every one of them is a word that
 * stands in the source rather than a reading of what the program means.
 */
export type EntryOrigin = 'event' | 'implicit' | 'function' | 'method' | 'module' | 'form' | 'callback' | 'enhancement';

export interface EntryPoint {
  statement: AbapStatement;
  lastIndex: number;
  /** The statement the normal end is anchored at — the closer, where there is one. */
  endStatement: AbapStatement;
  label: string;
  rank: number;
  implicit: boolean;
  origin: EntryOrigin;
  /** What the source says calls this, when it says anything at all. */
  trigger: string | null;
  /** Engine 3.2.0: the statement that registered a callback — where its handlers were registered too (`registeredAtEntry`). */
  site?: number;
}

export class EntryReader {
  /** Does this source write an event block — is it a report? Set by `readEntryPoints`. */
  writesEventBlock = false;
  /** A report that writes `START-OF-SELECTION`: its screen modules wait for a `CALL SCREEN` (D1). */
  modulesWaitForScreen = false;

  constructor(private input: EntriesInput) {}

  private isEventStatement(statement: AbapStatement): boolean {
    if (EVENT_WORDS.has(statement.keyword)) return true;
    if (statement.keyword === 'AT') return AT_EVENT.test(statement.text);
    if (statement.keyword !== 'GET') return false;
    const second = /^GET\s+([\w/-]+)/i.exec(statement.text);
    return second !== null && !GET_NOT_AN_EVENT.has(second[1].toUpperCase());
  }

  private runtimeRank(text: string): number {
    for (const row of RUNTIME_ORDER) if (row.test.test(text)) return row.rank;
    return RUNTIME_ORDER.length;
  }

  /**
   * Rule 4, and roadmap 2.14: **where does this process begin?**
   *
   * A report answers it itself — an event block, or the statements it writes at
   * program level, which ABAP runs as the implicit `START-OF-SELECTION`. Most
   * custom ABAP is not a report, and until 2.14 those sources got nothing at
   * all: on 18.09.2026, 9 of the corpus sources ended with `no-entry-point` and
   * **zero** nodes — a class method, a module pool, a BAdI implementation and a
   * bare `FORM` among them. Zero nodes is not a careful answer, it is no
   * answer, and it reads to the user as "there is no process here".
   *
   * The four additions are all the same kind of evidence: a declaration in this
   * source that says the routine is callable from **outside** it.
   *
   * - `FUNCTION name.` — a function module. Its name is the name of the start
   *   event; it is emphatically **not** `START-OF-SELECTION`, which is what the
   *   implicit fallback used to make of it (§16 V5).
   * - `METHOD name.` whose class definition declares it in the `PUBLIC SECTION`,
   *   or through `INTERFACES`, or as a RAP handler (`FOR DETERMINE`, `FOR
   *   MODIFY`, …) — the framework calls those whatever section they sit in.
   * - `MODULE name INPUT.` / `OUTPUT.` — a dynpro event. Both, and in source
   *   order: the screen runtime calls PBO and PAI, and calling one of them the
   *   beginning and the other not would be a rank this source does not write.
   * - a `FORM` no `PERFORM` in this source reaches — the user exit case. Only
   *   when nothing above answered, because a form a report performs is a step
   *   of that report and not a second beginning.
   *
   * **What the source does not say is not filled in.** That a method is
   * callable is written down; *what* calls it — an RFC, an IDoc, a BAdI, a
   * person at a screen — is not, and is left as a note rather than guessed.
   * Across the reference holding, 14 % of processes start on a message, which
   * is a fact about the holding and no evidence at all about one source.
   *
   * **And no rank is invented.** Within a kind, every member is an entry: two
   * public methods are two beginnings, not one beginning and one orphan. Only
   * between kinds does one answer beat another, and only where the source
   * itself is unambiguous — a program that writes `START-OF-SELECTION` has said
   * where it begins.
   *
   * **But an event block answers only for what the report runtime calls.** A
   * `MODULE … INPUT/OUTPUT` is called by the screen runtime and by nothing
   * else, a `FUNCTION` by a caller outside the source, a public method of a
   * global class (or a RAP handler) likewise — whether or not the same source
   * also writes `LOAD-OF-PROGRAM`. Until 27.09.2026 the first event block ended
   * the search here, and a module pool with `LOAD-OF-PROGRAM` lost every one of
   * its modules to "not reached" (D1). So these three are entries **beside**
   * the event blocks. Only the bare `FORM` stays a last resort: a report that
   * performs it has said it is a step.
   *
   * One precedence is kept, the one §5.8's own note on 2.14 writes: *"a
   * program that writes `START-OF-SELECTION` has said where it begins"*.
   * An executable report shows its screens only through a `CALL SCREEN` of its
   * own, so there its modules run exactly when such a statement runs — and
   * which screen's flow logic calls which module is not in this source. The
   * modules of a report that writes `START-OF-SELECTION` are therefore entries
   * only once the walk has passed a `CALL SCREEN` (`deferredModuleEntries`);
   * a screen the report never calls leaves them where 2.14 put them, under
   * "not reached". A module pool or function group has no such statement to
   * wait for: a dialog transaction starts its screens from outside.
   */
  readEntryPoints(): EntryPoint[] {
    const primary = this.primaryEntryPoints();
    // Engine 3.2.0: the candidate implementations of the source's own ambiguous calls — beside whatever the
    // source names as its beginnings, never in their place. An ambiguous call reaches its candidates from inside
    // the source, so a candidate is no evidence of a caller outside it and pre-empts no last resort (a bare FORM).
    const candidates = this.noteTriggers(this.candidateEntries());
    if (!primary.length && !candidates.length) this.noteNoEntryPoint();
    return [...primary, ...candidates];
  }

  /** The beginnings the source names, by the precedence above — empty when it names none. */
  private primaryEntryPoints(): EntryPoint[] {
    const events = this.eventEntries();
    this.writesEventBlock = events.length > 0;
    if (events.length) {
      // Unchanged from rule 4, and deliberately: a program that writes an event
      // block but no `START-OF-SELECTION` still runs its program-level
      // statements as the implicit one. `GET TIME.` beside `GET vbak.` is the
      // case, and it is two entries, not one.
      if (!events.some((e) => /^START-OF-SELECTION$/i.test(e.label))) {
        const free = this.programLevelStatements();
        if (free.length) {
          events.push({
            statement: free[0],
            lastIndex: free[free.length - 1].index,
            endStatement: free[free.length - 1],
            label: 'START-OF-SELECTION',
            rank: 5,
            implicit: true,
            origin: 'implicit',
            trigger: null,
          });
        }
      }
      this.modulesWaitForScreen = events.some((e) => !e.implicit && /^START-OF-SELECTION$/i.test(e.label));
      const outside = [
        ...this.functionEntries(),
        ...this.methodEntries(),
        ...(this.modulesWaitForScreen ? [] : this.moduleEntries()),
        ...this.conventionFormEntries(),
        ...this.enhancementEntries(),
      ].sort((a, b) => a.statement.index - b.statement.index);
      return [...events, ...this.noteTriggers(outside)];
    }

    // One class, not three: a function module, a public method and a dialog
    // module are each "called from outside this source", and where a source
    // carries more than one of them they are equals.
    const calledFromOutside = [
      ...this.functionEntries(),
      ...this.methodEntries(),
      ...this.moduleEntries(),
      ...this.conventionFormEntries(),
      ...this.enhancementEntries(),
    ].sort((a, b) => a.statement.index - b.statement.index);
    if (calledFromOutside.length) return this.noteTriggers(calledFromOutside);

    const free = this.programLevelStatements();
    if (free.length) {
      return [{
        statement: free[0],
        lastIndex: free[free.length - 1].index,
        endStatement: free[free.length - 1],
        label: 'START-OF-SELECTION',
        rank: 5,
        implicit: true,
        origin: 'implicit',
        trigger: null,
      }];
    }

    // The last resort, and the method has the same one as the form: a method of
    // a class whose definition this source does not hold, which no call of the
    // source reaches. Its visibility is written only in the missing definition
    // — so it is not read as "public" — but whoever calls it is outside this
    // source either way, which is exactly the evidence "a `FORM` that no
    // `PERFORM` reaches" is (§5.8). Only here, where nothing above answered:
    // a report or a function group has said where it begins.
    const forms = [...this.formEntries(), ...this.methodEntries(true)]
      .sort((a, b) => a.statement.index - b.statement.index);
    if (forms.length) return this.noteTriggers(forms);
    return [];
  }

  /**
   * The screen modules of a report that writes `START-OF-SELECTION`, once the
   * walk has shown that the report calls a screen at all — see the precedence
   * in `readEntryPoints`. Empty otherwise.
   */
  deferredModuleEntries(screenCalled: boolean): EntryPoint[] {
    if (!this.modulesWaitForScreen || !screenCalled) return [];
    return this.noteTriggers(this.moduleEntries());
  }

  /** The classic event blocks, unchanged since rule 4 — a report says it itself. */
  private eventEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const isBoundary = (i: number) => {
      const block = this.input.declarations.blockAt.get(i);
      // `FUNCTION` is not in the block table (`readFunctionBlocks`), so it is
      // named here: an event block ends where a function module begins.
      return this.isEventStatement(this.input.statements[i])
        || this.input.statements[i].keyword === 'FUNCTION'
        || this.input.statements[i].keyword === 'ENHANCEMENT'
        || (block !== undefined
          && (block.kind === 'form' || block.kind === 'module' || block.kind === 'class'
            || block.kind === 'interface' || block.kind === 'define'));
    };

    for (let i = 0; i < this.input.statements.length; i++) {
      if (!this.isEventStatement(this.input.statements[i])) continue;
      let last = this.input.statements.length - 1;
      for (let j = i + 1; j < this.input.statements.length; j++) {
        if (isBoundary(j)) { last = j - 1; break; }
      }
      const lastIndex = Math.max(i, last);
      out.push({
        statement: this.input.statements[i],
        lastIndex,
        endStatement: this.input.statements[lastIndex],
        label: this.input.statements[i].text,
        rank: this.runtimeRank(this.input.statements[i].text),
        implicit: false,
        origin: 'event',
        trigger: null,
      });
    }
    return out;
  }

  private functionEntries(): EntryPoint[] {
    return this.input.declarations.functionBlocks.map((fn) => {
      const opener = this.input.statements[fn.openIndex];
      const closer = this.input.statements[Math.min(fn.closeIndex, this.input.statements.length - 1)];
      this.input.entryOfBlock.add(fn.openIndex);
      return {
        statement: opener,
        lastIndex: fn.closeIndex - 1,
        endStatement: closer,
        label: fn.name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'function' as const,
        trigger: null,
      };
    });
  }

  /**
   * The trigger of a redefinition `readRedefinitions` recorded — except for a
   * local class in a source that writes an event block. A report holds local
   * classes only, and a local subclass there runs when the report hands an
   * instance of it over; whether it does is not the redefinition's to say.
   */
  private redefinitionTrigger(key: string): string | null {
    const found = this.input.declarations.redefinedFromOutside.get(key);
    if (!found || (!found.global && this.writesEventBlock)) return null;
    return `REDEFINITION OF ${found.superclass}`;
  }

  /**
   * Engine 3.2.0 — a method that a call of this source can reach but cannot be shown to reach: one of the
   * implementations behind `lo_if->m( )` on an interface reference, behind `lo->m( )` on a superclass reference
   * whose subclasses redefine `m`, or behind `me->m( )` in a class whose subclasses redefine it. The call is drawn
   * opaque where it stands (D2 — the reader does not say which one runs); the implementation is drawn here, as a
   * beginning of its own, with the call as its trigger. Before 3.2.0 such an implementation was neither drawn nor
   * listed as not reached — a strategy, a state or a template-method pattern lost every one of its concrete steps.
   *
   * The trigger names the first call site outside the method's own body; a call from inside it (recursion) is
   * not what reaches it.
   */
  private candidateTrigger(key: string, block: Block): string | null {
    const site = (this.input.dispatch.candidateSites.get(key) ?? []).find((s) => s.index < block.openIndex || s.index > block.closeIndex);
    return site ? `${CANDIDATE_TRIGGER}${site.label}@${site.line} (1 of ${site.of})` : null;
  }

  /**
   * Engine 3.2.0 — the candidate implementations (`candidateTrigger`) that nothing else made a beginning or a
   * step: not an entry already, and not named by a call that reaches it for certain (D2 draws that call as the
   * sub-process, and a call from inside the method's own body is recursion, not a caller). In source order.
   */
  private candidateEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.input.structure.blocks) {
      if (block.kind !== 'method' || this.input.entryOfBlock.has(block.openIndex)) continue;
      const opener = this.input.statements[block.openIndex];
      const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text);
      if (!name) continue;
      const key = `${classOf(this.input.statements, this.input.structure, block.openIndex) ?? ''}=>${name[1].toUpperCase()}`;
      const trigger = this.candidateTrigger(key, block);
      if (!trigger) continue;
      const sites = this.input.dispatch.methodCallSites.get(key) ?? [];
      if (sites.some((site) => site < block.openIndex || site > block.closeIndex)) continue;
      this.input.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.input.statements[Math.min(block.closeIndex, this.input.statements.length - 1)],
        label: name[1],
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'method',
        trigger,
      });
    }
    return out;
  }

  /** Is this implemented method one the source declares callable from outside? */
  private methodTrigger(cls: string | null, name: string): string | null {
    const upper = name.toUpperCase();
    const direct = this.input.declarations.externallyCallableMethods.get(`${cls ?? ''}=>${upper}`);
    if (direct) return direct;
    const tilde = upper.indexOf('~');
    if (tilde < 0) return null;
    // `zif~name`: an interface this class declares in its public section.
    return this.input.declarations.externallyCallableMethods.get(`${cls ?? ''}=>${upper.slice(0, tilde + 1)}`) ?? null;
  }

  /**
   * §5.8's "BAdI-Methode": `METHOD zif_x~name.` in a source that does not hold
   * the definition of its class — the BAdI implementation, the method of a
   * global class pasted as an excerpt.
   *
   * `readMethodVisibility` reads visibility off the class **definition**, and a
   * class whose definition is in another file declares nothing here. That
   * silence stays for a plain method: whether `METHOD save.` is public or a
   * private helper is written only in the definition. The tilde is different.
   * It is written in the implementation itself, and it says the method is a
   * component of an interface — and an interface component is public wherever
   * it is implemented; it is called through the interface, from outside. The
   * 2.14 note on "declares nothing" is about a source that runs nothing (an
   * interface on its own, `entry-not-applicable`); a method with statements in
   * it runs code, and until 27.09.2026 such an upload ended with
   * `no-entry-point` and zero nodes.
   *
   * Two limits keep it to that evidence. Only where the definition is **not**
   * here — where it is, `readMethodVisibility` has already decided, and a local
   * class stays local (2.14: "public does not mean callable from outside"). And
   * never in a source that writes an event block: a report holds only local
   * classes, so an implementation without its definition there is a partial
   * upload of a local class, not a BAdI. What calls it stays not determined
   * (`noteTriggers`).
   */
  private implementedInterfaceMethod(name: string, openIndex: number): string | null {
    if (this.writesEventBlock || !name.includes('~')) return null;
    const cls = classOf(this.input.statements, this.input.structure, openIndex);
    if (cls && this.input.declarations.definedClasses.has(cls)) return null;
    return 'interface';
  }

  private methodEntries(orphans = false): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.input.structure.blocks) {
      if (block.kind !== 'method') continue;
      const opener = this.input.statements[block.openIndex];
      const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text);
      if (!name) continue;
      const cls = classOf(this.input.statements, this.input.structure, block.openIndex);
      const key = `${cls ?? ''}=>${name[1].toUpperCase()}`;
      const trigger = this.methodTrigger(cls, name[1]) ?? this.implementedInterfaceMethod(name[1], block.openIndex)
        ?? this.redefinitionTrigger(key);
      if (orphans) {
        // The last resort: no trigger, no definition, nothing else answered.
        if (trigger || this.input.entryOfBlock.has(block.openIndex) || (cls && this.input.declarations.definedClasses.has(cls))) continue;
      } else if (!trigger) continue;
      // D2, and D3's rule for forms: a method this source calls is drawn where
      // it is called, as a sub-process — not a second time as a beginning. A
      // call from inside its own body (recursion) does not count.
      const sites = this.input.dispatch.methodCallSites.get(key) ?? [];
      if (sites.some((site) => site < block.openIndex || site > block.closeIndex)) continue;
      this.input.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.input.statements[Math.min(block.closeIndex, this.input.statements.length - 1)],
        label: name[1],
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'method',
        trigger: orphans ? null : trigger,
      });
    }
    return out;
  }

  /**
   * A dialog module. Until 2.14 these were counted with the unreached code, on
   * the grounds that the dynpro is not in this source — which is true of the
   * screen and not of the module: `MODULE … INPUT` is written down, and it is
   * written down as an event the screen runtime raises. Corpus case CC-013 is
   * the measurement: its expected process begins at the PBO module and runs
   * into the PAI module, and the engine drew neither.
   */
  private moduleEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.input.structure.blocks) {
      if (block.kind !== 'module') continue;
      const opener = this.input.statements[block.openIndex];
      const m = /^MODULE\s+([\w/]+)\s+(INPUT|OUTPUT)\b/i.exec(opener.text);
      if (!m) continue;
      this.input.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.input.statements[Math.min(block.closeIndex, this.input.statements.length - 1)],
        label: `${m[1]} ${m[2].toUpperCase()}`,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'module',
        trigger: m[2].toUpperCase() === 'INPUT' ? 'dynpro PAI' : 'dynpro PBO',
      });
    }
    return out;
  }

  private enhancementEntries(): EntryPoint[] {
    return this.input.declarations.enhancementBlocks.map((enh) => {
      this.input.entryOfBlock.add(enh.openIndex);
      return {
        statement: this.input.statements[enh.openIndex],
        lastIndex: enh.closeIndex - 1,
        endStatement: this.input.statements[enh.closeIndex],
        label: enh.name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'enhancement' as const,
        trigger: 'enhancement',
      };
    });
  }

  private conventionFormEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const neverPerformed = new Set(this.input.calls.neverPerformed);
    for (const [name, block] of this.input.declarations.formBlocks) {
      if (!neverPerformed.has(name) || this.input.entryOfBlock.has(block.openIndex)) continue;
      const opener = this.input.statements[block.openIndex];
      const trigger = formConvention(opener.text);
      if (!trigger) continue;
      const written = /^FORM\s+([\w/]+)/i.exec(opener.text);
      this.input.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.input.statements[Math.min(block.closeIndex, this.input.statements.length - 1)],
        label: written ? written[1] : name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'form',
        trigger,
      });
    }
    return out;
  }

  /**
   * The bare `FORM` — a user exit, an enhancement include. Last, and only when
   * nothing else in this source answered: a form a report performs is a step of
   * that report, and drawing it as a second beginning would double it.
   *
   * **Only a form no `PERFORM` of this source names** (`neverPerformed`), which
   * is the sentence `DESIGN.md` §5.8 writes: *"a `FORM` that no `PERFORM`
   * reaches"*. This used to read `unreachable` — and when nothing else in the
   * source is an entry, reachability has no root, so *every* form is
   * unreachable, the performed ones included. `PERFORM b` inside the entry `a`
   * then drew `b` twice: once as the sub-process `a` opens and once as a second
   * beginning of the process. A form that is performed is a step of whoever
   * performs it. The one shape without such a root — routines that only perform
   * one another in a ring — falls back to the old reading, because otherwise
   * nothing of it would be drawn at all.
   */
  private formEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const roots = this.input.calls.neverPerformed.filter((name) => this.input.declarations.formBlocks.has(name));
    const beginnings = new Set(roots.length ? roots : this.input.calls.unreachable);
    for (const [name, block] of this.input.declarations.formBlocks) {
      if (!beginnings.has(name)) continue;
      const opener = this.input.statements[block.openIndex];
      const written = /^FORM\s+([\w/]+)/i.exec(opener.text);
      this.input.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.input.statements[Math.min(block.closeIndex, this.input.statements.length - 1)],
        label: written ? written[1] : name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'form',
        trigger: null,
      });
    }
    return out.sort((a, b) => a.statement.index - b.statement.index);
  }

  /**
   * *Not determined*, with the reason — §5.8's rule for what the code does not
   * say. The source proves the routine is callable; it does not say what calls
   * it, and a message start (RFC, IDoc, BAdI) is exactly the thing that is not
   * written down. This note is why the start event may be drawn at all.
   */
  private noteTriggers(entries: EntryPoint[]): EntryPoint[] {
    for (const entry of entries) {
      const what = entry.origin === 'function' ? 'function module'
        : entry.origin === 'method' ? 'method'
          : entry.origin === 'module' ? 'screen module'
            : entry.origin === 'enhancement' ? 'enhancement implementation' : 'subroutine';
      const proof = entry.origin === 'enhancement'
        ? 'it is an ENHANCEMENT … ENDENHANCEMENT block, which the enhanced program runs at its enhancement option'
        : entry.trigger === 'public' ? 'its class declares it in the PUBLIC SECTION'
        : entry.trigger === 'interface' ? 'its class implements the interface that declares it'
          : entry.trigger === 'dynpro PAI' ? 'the screen runtime raises PAI on it'
            : entry.trigger === 'dynpro PBO' ? 'the screen runtime raises PBO on it'
              : entry.trigger === USER_EXIT
                ? 'its name USEREXIT_… is the user-exit convention of the SAP standard program that performs it'
              : entry.trigger === OUTPUT_CONTROL
                ? 'its interface (return code, screen flag) is the one output control calls a processing routine '
                  + 'with (table TNAPR)'
              : entry.trigger?.startsWith('REDEFINITION OF ')
                ? `it redefines a method of ${entry.trigger.slice(16)}, which is not in this source and is what calls it`
              : entry.trigger?.startsWith(CANDIDATE_TRIGGER)
                ? `the call ${entry.trigger.slice(CANDIDATE_TRIGGER.length).replace(/ \(1 of (\d+)\)$/, ' can reach it as one of $1 implementations')}, `
                  + 'and which of them runs is decided at run time by the object the call is made on, which this reader does not guess'
              : entry.trigger ? `it is declared as a ${entry.trigger} handler`
                : entry.origin === 'function' ? 'it is a function module, callable by name'
                  : entry.origin === 'method'
                    ? 'no call in this source reaches it and the definition of its class is not in this source, '
                      + 'so its caller is outside this source'
                  : 'no PERFORM in this source reaches it, so its caller is outside this source';
      this.input.graph.note('entry-trigger-not-determined', entry.statement,
        `The process is drawn as beginning at the ${what} ${entry.label} because ${proof}. `
        + 'What triggers it — a remote call, an IDoc, a BAdI, a batch job or a person — is not in this '
        + 'source and is not determined.');
    }
    return entries;
  }

  /**
   * No entry, and why — roadmap 2.14. "Not applicable, with an explanation" is
   * a result the step names on purpose: an interface, a type pool or a bare
   * declaration has no process in it, and zero steps without a word is the one
   * answer that reads as a failure of the engine rather than a property of the
   * upload.
   */
  private noteNoEntryPoint(): void {
    const lineEnd = Math.max(1, this.input.statements[this.input.statements.length - 1]?.lineEnd ?? 1);
    const interfaces = this.input.structure.blocks.filter((b) => b.kind === 'interface');
    // An `INCLUDE` is not a declaration: the program runs, its text is in
    // another file. A main program that is nothing but include lines is the
    // multi-file case, not the "not applicable" one, and the answer is the
    // list of files to add — see the tail of this method.
    const includesText = this.input.statements.some((st) =>
      st.keyword === 'INCLUDE' && !/^INCLUDE\s+STRUCTURE\b/i.test(st.text));
    const executable = includesText
      || this.input.statements.some((st) => !DECLARES.has(st.keyword) && !st.nativeSql);
    if (interfaces.length && !executable) {
      const opener = this.input.statements[interfaces[0].openIndex];
      this.input.graph.notes.push({
        reason: 'entry-not-applicable',
        detail:
          'This source declares an interface and implements nothing: it names methods and their parameters, '
          + 'and not one statement that runs. A process view is not applicable here — that is a property of '
          + 'the upload, not an empty result. Upload the class that implements this interface, and its '
          + 'includes, to see the process.',
        snippet: snippet(opener.text),
        lineStart: interfaces[0].lineStart,
        lineEnd: interfaces[0].lineEnd,
      });
      return;
    }
    if (!executable) {
      this.input.graph.notes.push({
        reason: 'entry-not-applicable',
        detail:
          'This source declares and does not run: every statement in it is a declaration. A process view is '
          + 'not applicable here — that is a property of the upload, not an empty result.',
        snippet: '',
        lineStart: 1,
        lineEnd,
      });
      return;
    }
    // The multi-file case, named rather than implied: a main program that is
    // nothing but `INCLUDE` lines has its entry point in a file this upload
    // does not hold, and the useful answer is which files to add.
    const includes: string[] = [];
    for (const statement of this.input.statements) {
      if (statement.keyword !== 'INCLUDE' || /^INCLUDE\s+STRUCTURE\b/i.test(statement.text)) continue;
      const name = /^INCLUDE\s+([\w/]+)/i.exec(statement.text);
      if (name && !includes.includes(name[1])) includes.push(name[1]);
    }
    this.input.graph.notes.push({
      reason: 'no-entry-point',
      detail:
        'This source names no event block, no function module, no externally callable method, no screen '
        + 'module and no unperformed subroutine, and it writes no statement at program level — so nothing '
        + 'here says where the process begins. Every routine it defines is listed as not reached.'
        + (includes.length
          ? ` The beginning is in one of the ${includes.length} includes this source names and this upload `
            + `does not hold: ${includes.join(', ')}. Upload them and the process can be read.`
          : ' If this is one file of several, the entry point is in another one: upload the rest as well.'),
      snippet: '',
      lineStart: 1,
      lineEnd,
    });
  }

  /**
   * Executable statements outside every block, every event block and every
   * function module. The last of those is 2.14: the body of a `FUNCTION` stands
   * at program level as far as the block table is concerned, and reading it as
   * the implicit `START-OF-SELECTION` put a report's start event on a function
   * group (§16 V5).
   */
  programLevelStatements(): AbapStatement[] {
    const inEvent = new Set<number>();
    for (let i = 0; i < this.input.statements.length; i++) {
      if (!this.isEventStatement(this.input.statements[i])) continue;
      for (let j = i; j < this.input.statements.length; j++) {
        const block = this.input.declarations.blockAt.get(j);
        const boundary = j > i && (this.isEventStatement(this.input.statements[j])
          || this.input.statements[j].keyword === 'FUNCTION'
          || this.input.statements[j].keyword === 'ENHANCEMENT'
          || (block !== undefined && (block.kind === 'form' || block.kind === 'module'
            || block.kind === 'class' || block.kind === 'interface' || block.kind === 'define')));
        if (boundary) break;
        inEvent.add(j);
      }
    }
    for (const fn of [...this.input.declarations.functionBlocks, ...this.input.declarations.enhancementBlocks]) {
      for (let i = fn.openIndex; i <= Math.min(fn.closeIndex, this.input.statements.length - 1); i++) inEvent.add(i);
    }
    const out: AbapStatement[] = [];
    for (let i = 0; i < this.input.statements.length; i++) {
      const statement = this.input.statements[i];
      if (inEvent.has(i)) continue;
      if (this.input.structure.enclosing[i].length) continue;
      if (this.input.declarations.blockAt.has(i)) continue;
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (statement.nativeSql) continue;
      out.push(statement);
    }
    return out;
  }
}
