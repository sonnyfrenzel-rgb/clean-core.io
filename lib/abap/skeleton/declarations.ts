import type { AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { Branch, ControlFlowReport } from '../control-flow';
import { localDataObjectsOf } from '../table-dependencies';
import { readBatchInputFrom, type BatchInputCall } from '../batch-input';
import { classOf } from './statement-readers';

/**
 * Pass "declarations" — engine 4 phase 3, the first pass (`docs/design/engine4.md`, "Phase 3").
 *
 * What the source declares, read once before anything is drawn: blocks and branches by their opening statement,
 * macros, forms, the methods this source implements and the classes it names, function modules and program-level
 * enhancements, the methods a class declares callable from outside, redefinitions of an outside superclass, the
 * selection-screen names, the program's own data objects and the batch-input calls. Reads the statements, blocks and
 * branches; draws nothing. No reading gate.
 *
 * The method calls (`readMethodCallSites`) and the event handlers (`readEventHandlers`) are declarations too, but
 * they resolve calls through the builder's dispatch (`resolveMethod`) and stay with it until that moves.
 */
export interface DeclarationsInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  control: ControlFlowReport;
}

/** One `METHOD name.` inside a `CLASS x IMPLEMENTATION` of this source (D2). */
export interface MethodImpl {
  /** `CLASS=>METHOD`, upper-cased — the routine key. */
  key: string;
  cls: string;
  /** As the implementation writes it, upper-cased: `RUN`, `ZIF_X~RUN`. */
  name: string;
  /** The part after `~`, or the name itself. */
  short: string;
  block: Block;
}

/** `FUNCTION name.` … `ENDFUNCTION.`, or `ENHANCEMENT n name.` … `ENDENHANCEMENT.` at program level. */
export interface NamedRange {
  name: string;
  openIndex: number;
  closeIndex: number;
}

export interface SourceDeclarations {
  /** Roadmap 3.0.7 — the data objects this source declares (`localDataObjectsOf`). */
  localData: Set<string>;
  /** Roadmap 3.0.7 — the batch-input calls, read field by field, by statement index. */
  batchInput: Map<number, BatchInputCall>;
  blockAt: Map<number, Block>;
  branchAt: Map<number, Branch>;
  macros: Map<string, { block: Block }>;
  formBlocks: Map<string, Block>;
  /** Forms under their name, methods under `CLASS=>METHOD` (D2). */
  routineBlocks: Map<string, Block>;
  methodImpls: MethodImpl[];
  /** Classes and interfaces this source defines or implements, upper-cased. */
  classNames: Set<string>;
  /** Classes whose `CLASS x DEFINITION` (not `DEFERRED`, not `LOAD`) stands in this source, upper-cased. */
  definedClasses: Set<string>;
  /** `CLASS x DEFINITION INHERITING FROM y`: the superclass each local class names. */
  superOf: Map<string, string>;
  functionBlocks: NamedRange[];
  enhancementBlocks: NamedRange[];
  /** Methods a class definition in this source declares callable from outside, with why. */
  externallyCallableMethods: Map<string, string>;
  /** `METHODS m REDEFINITION` in a class whose superclass is not in this source. */
  redefinedFromOutside: Map<string, { superclass: string; global: boolean }>;
  selectionNames: Set<string>;
}

/**
 * A RAP behaviour handler method — roadmap 2.14. The `FOR …` clause is the
 * source saying, in words that stand in it, that the runtime calls this method;
 * corpus case CC-059 declares `set_status FOR DETERMINE ON MODIFY` in a
 * `PRIVATE SECTION` and its expected process begins there all the same.
 */
const RAP_HANDLER =
  /\bFOR\s+(DETERMINE|VALIDATE|MODIFY|READ|LOCK|ACTION|FEATURES|BEHAVIOR|PRECHECK|NUMBERING|GLOBAL\s+AUTHORIZATION|INSTANCE\s+AUTHORIZATION|GLOBAL\s+FEATURES|INSTANCE\s+FEATURES)\b/i;

/** Every declaration, in the order the builder always read them (the order its maps are filled in). */
export function readDeclarations(input: DeclarationsInput): SourceDeclarations {
  const d: SourceDeclarations = {
    localData: localDataObjectsOf(input.statements),
    batchInput: new Map(),
    blockAt: new Map(),
    branchAt: new Map(),
    macros: new Map(),
    formBlocks: new Map(),
    routineBlocks: new Map(),
    methodImpls: [],
    classNames: new Set(),
    definedClasses: new Set(),
    superOf: new Map(),
    functionBlocks: [],
    enhancementBlocks: [],
    externallyCallableMethods: new Map(),
    redefinedFromOutside: new Map(),
    selectionNames: new Set(),
  };
  for (const call of readBatchInputFrom(input.statements)) d.batchInput.set(call.statementIndex, call);
  for (const block of input.structure.blocks) d.blockAt.set(block.openIndex, block);
  for (const branch of input.control.branches) d.branchAt.set(branch.openIndex, branch);
  for (const block of input.structure.blocks) {
    if (block.kind === 'define') {
      const name = /^DEFINE\s+([\w/]+)/i.exec(input.statements[block.openIndex].text);
      if (name) d.macros.set(name[1].toUpperCase(), { block });
    }
    if (block.kind !== 'form') continue;
    const m = /^FORM\s+([\w/]+)/i.exec(input.statements[block.openIndex].text);
    if (m) d.formBlocks.set(m[1].toUpperCase(), block);
  }
  for (const [name, block] of d.formBlocks) d.routineBlocks.set(name, block);
  readMethodImplementations(input, d);
  readFunctionBlocks(input, d);
  readEnhancementBlocks(input, d);
  readMethodVisibility(input, d);
  readSelectionScreen(input, d);
  return d;
}

/**
 * The methods this source implements, and the classes it names — read once,
 * before the effects, because a method is a routine there (D2).
 */
function readMethodImplementations(input: DeclarationsInput, d: SourceDeclarations): void {
  for (const block of input.structure.blocks) {
    const opener = input.statements[block.openIndex];
    if (block.kind === 'class' || block.kind === 'interface') {
      const name = /^(?:CLASS|INTERFACE)\s+([\w/]+)/i.exec(opener.text);
      if (name) d.classNames.add(name[1].toUpperCase());
      if (name && /^CLASS\s+[\w/]+\s+DEFINITION\b/i.test(opener.text)
        && !/\bDEFINITION\s+(?:DEFERRED|LOAD)\b/i.test(opener.text)) {
        d.definedClasses.add(name[1].toUpperCase());
      }
      const parent = /\bINHERITING\s+FROM\s+([\w/]+)/i.exec(opener.text);
      if (name && parent) d.superOf.set(name[1].toUpperCase(), parent[1].toUpperCase());
      continue;
    }
    if (block.kind !== 'method') continue;
    // A `METHOD` with no class around it at all is an excerpt — one method of
    // a class the upload does not hold (a Web Dynpro controller, a gateway
    // method pasted on its own). It is still a routine: a call on its name
    // reaches it, and the class it belongs to is simply not written, so its
    // key carries an empty class.
    const bare = !(input.structure.enclosing[block.openIndex] ?? []).some((b) => b.kind === 'class');
    const cls = bare ? '' : classOf(input.statements, input.structure, block.openIndex);
    const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text)?.[1]?.toUpperCase();
    if (cls === null || !name) continue;
    const key = `${cls}=>${name}`;
    if (d.routineBlocks.has(key)) continue;
    const tilde = name.lastIndexOf('~');
    d.methodImpls.push({ key, cls, name, short: tilde < 0 ? name : name.slice(tilde + 1), block });
    d.routineBlocks.set(key, block);
  }
}

/**
 * `FUNCTION name.` … `ENDFUNCTION.` — read here rather than in
 * `block-structure.ts` because ABAP's own block table is shared with the
 * branch reader, the call graph and the comparability rules, and a new kind
 * in it changes what every one of them sees. What this needs is the range.
 */
function readFunctionBlocks(input: DeclarationsInput, d: SourceDeclarations): void {
  const open: number[] = [];
  for (let i = 0; i < input.statements.length; i++) {
    const statement = input.statements[i];
    if (statement.nativeSql) continue;
    if (statement.keyword === 'FUNCTION') { open.push(i); continue; }
    if (statement.keyword !== 'ENDFUNCTION') continue;
    const openIndex = open.pop();
    if (openIndex === undefined) continue;
    const name = /^FUNCTION\s+([\w/]+)/i.exec(input.statements[openIndex].text);
    if (name) d.functionBlocks.push({ name: name[1], openIndex, closeIndex: i });
  }
  // An opener nothing closed: the range runs to the end of the file, the same
  // floor `block-structure.ts` uses, and `noteWhatIsNotRead` has already said
  // that an unterminated container is a guess rather than an anchor.
  for (const openIndex of open) {
    const name = /^FUNCTION\s+([\w/]+)/i.exec(input.statements[openIndex].text);
    if (name) d.functionBlocks.push({ name: name[1], openIndex, closeIndex: input.statements.length });
  }
  d.functionBlocks.sort((a, b) => a.openIndex - b.openIndex);
}

/**
 * ADR-066 — a `FORM` that SAP calls by a documented convention, which no
 * `PERFORM` of this source names. It is called from outside exactly as a
 * `MODULE … INPUT` is, so it is an entry **beside** the event blocks and the
 * other outside entries, not a last resort. The convention is the trigger;
 * which output type or which standard transaction runs it is configuration
 * outside the source, and `noteTriggers` says so.
 */
/**
 * ADR-066 — `ENHANCEMENT n name.` … `ENDENHANCEMENT.` standing at program
 * level. The ABAP keyword documentation: the block is the source code plug-in
 * of an enhancement implementation, and the program it enhances runs it at
 * its enhancement option (an implicit one at the start or end of a routine,
 * or an `ENHANCEMENT-POINT`/`-SECTION`). That program is not this source, so
 * it is an entry of its own; which enhancement option is noted, not guessed.
 * One inside a FORM or method is part of that routine's flow and is not here.
 */
function readEnhancementBlocks(input: DeclarationsInput, d: SourceDeclarations): void {
  const open: number[] = [];
  for (let i = 0; i < input.statements.length; i++) {
    const statement = input.statements[i];
    if (statement.nativeSql) continue;
    if (statement.keyword === 'ENHANCEMENT') {
      if (!(input.structure.enclosing[i] ?? []).length) open.push(i);
      continue;
    }
    if (statement.keyword !== 'ENDENHANCEMENT' || !open.length) continue;
    const openIndex = open.pop() as number;
    const name = /^ENHANCEMENT\s+\d+\s+([\w/]+)/i.exec(input.statements[openIndex].text)?.[1];
    d.enhancementBlocks.push({ name: name ?? 'ENHANCEMENT', openIndex, closeIndex: i });
  }
  d.enhancementBlocks.sort((a, b) => a.openIndex - b.openIndex);
}

/**
 * What a class **definition** in this source declares callable from outside
 * it: the `PUBLIC SECTION`, the interfaces it implements, and the RAP handler
 * methods the framework calls whatever section they stand in.
 *
 * A private method is not here, and a class implementation whose definition
 * is in another file declares nothing here — both stay silent rather than
 * being assumed public.
 */
function readMethodVisibility(input: DeclarationsInput, d: SourceDeclarations): void {
  for (const block of input.structure.blocks) {
    if (block.kind !== 'class' && block.kind !== 'interface') continue;
    const opener = input.statements[block.openIndex];
    const owner = /^(?:CLASS|INTERFACE)\s+([\w/]+)/i.exec(opener.text)?.[1]?.toUpperCase() ?? '';
    // A class's methods are its own; an interface's are reached as `zif~name`.
    const keyOf = (method: string) => (block.kind === 'interface' ? `${owner}~${method}` : `${owner}=>${method}`);
    readRedefinitions(input, d, block);
    // **Local is not public.** `PUBLIC SECTION` in a `CLASS lcl_x DEFINITION`
    // means public *within this program*; only `DEFINITION PUBLIC` — a global
    // class — is callable from outside the source. Without that distinction
    // the six local helper classes of `Z_ORDER_INTEGRITY_CHECK` each became a
    // beginning of the process, which is six sentences the source does not
    // write. A RAP handler is read below whatever its class is, because there
    // the `FOR …` clause is the evidence rather than the visibility.
    if (block.kind === 'class'
      && !/^CLASS\s+[\w/]+\s+DEFINITION\b[^.]*\bPUBLIC\b/i.test(opener.text)) {
      readRapHandlers(input, d, block);
      continue;
    }
    // An interface declares nothing but public methods; a class starts private.
    let visible = block.kind === 'interface';
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const statement = input.statements[i];
      if (statement.keyword === 'PUBLIC') {
        visible = /^PUBLIC\s+SECTION\b/i.test(statement.text);
        continue;
      }
      if (statement.keyword === 'PROTECTED' || statement.keyword === 'PRIVATE') {
        visible = false;
        continue;
      }
      if (statement.keyword === 'INTERFACES') {
        // Every method of the interface is reachable as `zif~name`, and the
        // prefix is what the implementation writes, so the prefix is recorded.
        const name = /^INTERFACES\s+([\w/]+)/i.exec(statement.text);
        if (visible && name) d.externallyCallableMethods.set(`${owner}=>${name[1].toUpperCase()}~`, 'interface');
        continue;
      }
      if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') continue;
      const name = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(statement.text);
      if (!name) continue;
      const handler = RAP_HANDLER.exec(statement.text);
      if (handler) {
        d.externallyCallableMethods.set(keyOf(name[1].toUpperCase()), `RAP ${handler[1].toUpperCase()}`);
        continue;
      }
      if (visible) d.externallyCallableMethods.set(keyOf(name[1].toUpperCase()), 'public');
    }
  }
}

/**
 * The one thing a **local** class can still say: that its method is a RAP
 * handler. `lhc_order` of corpus case CC-059 declares `set_status FOR
 * DETERMINE ON MODIFY` in its `PRIVATE SECTION`, and the runtime calls it
 * regardless — the `FOR` clause stands in the source and the section does
 * not contradict it.
 */
function readRapHandlers(input: DeclarationsInput, d: SourceDeclarations, block: Block): void {
  if (!/\bDEFINITION\b/i.test(input.statements[block.openIndex].text)) return;
  const owner = /^CLASS\s+([\w/]+)/i.exec(input.statements[block.openIndex].text)?.[1]?.toUpperCase() ?? '';
  for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
    const statement = input.statements[i];
    if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') continue;
    const name = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(statement.text);
    const handler = RAP_HANDLER.exec(statement.text);
    if (name && handler) {
      d.externallyCallableMethods.set(`${owner}=>${name[1].toUpperCase()}`, `RAP ${handler[1].toUpperCase()}`);
    }
  }
}

/**
 * `METHODS name REDEFINITION` in a class that inherits from a class this
 * source does not hold — a gateway `*_DPC_EXT` redefining `…_GET_ENTITYSET`,
 * a RAP saver redefining `save_modified`, a subclass of a framework class.
 *
 * A redefinition replaces a method the **superclass** declares, and the one
 * that calls it is the superclass's code — the dispatcher, the framework —
 * which is not in this source. That is written down twice here: the word
 * `REDEFINITION` and the `INHERITING FROM` a class the source does not
 * define. Its section is the superclass's decision (a protected redefinition
 * is the usual shape), so the visibility rule of 2.14 does not reach it —
 * the same reason a RAP handler is read whatever its section.
 *
 * A superclass this source **does** hold is not outside: there the call is
 * in the source, or it is polymorphism the reader does not resolve.
 */
function readRedefinitions(input: DeclarationsInput, d: SourceDeclarations, block: Block): void {
  const opener = input.statements[block.openIndex].text;
  const cls = /^CLASS\s+([\w/]+)\s+DEFINITION\b/i.exec(opener)?.[1]?.toUpperCase();
  const superclass = cls ? d.superOf.get(cls) : undefined;
  if (!cls || !superclass || d.classNames.has(superclass)) return;
  const global = /^CLASS\s+[\w/]+\s+DEFINITION\b[^.]*\bPUBLIC\b/i.test(opener);
  for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
    const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)\s+(?:FINAL\s+)?REDEFINITION\b/i.exec(input.statements[i].text);
    if (m) d.redefinedFromOutside.set(`${cls}=>${m[1].toUpperCase()}`, { superclass, global });
  }
}

function readSelectionScreen(input: DeclarationsInput, d: SourceDeclarations): void {
  for (const statement of input.statements) {
    if (statement.keyword !== 'PARAMETERS' && statement.keyword !== 'SELECT-OPTIONS') continue;
    const m = /^(?:PARAMETERS|SELECT-OPTIONS)\s+([\w/]+)/i.exec(statement.text);
    if (m) d.selectionNames.add(m[1].toUpperCase());
  }
}

