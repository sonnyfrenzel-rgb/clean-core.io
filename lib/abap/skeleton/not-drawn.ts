import type { AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { CallGraphReport } from '../call-graph';
import type { CloneGroup, FoldedForm, ProcessSkeleton, UnreachedRegion } from '../process-skeleton';
import { bodyRange, snippet } from './anchors';

/**
 * Pass "not drawn" — engine 4 phase 3, the report of what §5.8 says instead of drawing it
 * (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: the statements and blocks, 2.2's call graph, the routines the walk reached and the helpers the effects
 * pass folded. Returns `ProcessSkeleton.notDrawn`; reads and writes no graph. No reading gate.
 */
export interface NotDrawnInput {
  statements: readonly AbapStatement[];
  structure: BlockStructure;
  calls: CallGraphReport;
  /** `FORM name` blocks by upper-cased name. */
  formBlocks: ReadonlyMap<string, Block>;
  /** Opening statements of the routines built as entries. */
  entryOfBlock: ReadonlySet<number>;
  /** Routines a walked call names, and everything they perform in turn (`markReached`). */
  reachedRoutines: ReadonlySet<string>;
  /** Routines without an effect of their own, folded into their callers (`readEffects`). */
  helpers: ReadonlySet<string>;
  /** The methods this source implements (`readMethodImplementations`). */
  methodImpls: ReadonlyArray<{ key: string; block: Block }>;
  /** The statements whose calls resolve to each method. */
  methodCallSites: ReadonlyMap<string, readonly number[]>;
}

/** `ProcessSkeleton.notDrawn`, in the order the builder always wrote it. */
export function notDrawn(input: NotDrawnInput): ProcessSkeleton['notDrawn'] {
  return {
    unreached: unreached(input),
    unreachedLines: unreachedLines(input),
    technicalHelpers: technicalHelpers(input),
    clones: clones(input),
  };
}

/** Not reached by 2.2's call graph **and** not drawn by this walk. */
function isUnreachedForm(input: NotDrawnInput, name: string): boolean {
  return input.calls.unreachable.includes(name) && !input.reachedRoutines.has(name);
}

function unreached(input: NotDrawnInput): UnreachedRegion[] {
  const out: UnreachedRegion[] = [];
  for (const name of input.calls.unreachable) {
    const block = input.formBlocks.get(name);
    if (!block || input.entryOfBlock.has(block.openIndex) || !isUnreachedForm(input, name)) continue;
    out.push({ name, kind: 'form', lineStart: block.lineStart, lineEnd: block.lineEnd });
  }
  // A screen module runs from a dynpro, and the dynpro is not in this source.
  // Until 2.14 that made it unreached code; it no longer does, because the
  // `MODULE … INPUT` line is itself the source saying the screen runtime
  // calls it. A module that is **not** an entry — one this source never
  // reaches and never declares as a screen event — is still counted here.
  for (const block of input.structure.blocks) {
    if (block.kind !== 'module' || input.entryOfBlock.has(block.openIndex)) continue;
    const name = /^MODULE\s+([\w/]+)/i.exec(input.statements[block.openIndex].text)?.[1];
    if (name) {
      out.push({ name: name.toUpperCase(), kind: 'module', lineStart: block.lineStart, lineEnd: block.lineEnd });
    }
  }
  return out.sort((a, b) => a.lineStart - b.lineStart);
}

function unreachedLines(input: NotDrawnInput): number {
  return unreached(input).reduce((sum, r) => sum + (r.lineEnd - r.lineStart + 1), 0);
}

function technicalHelpers(input: NotDrawnInput): FoldedForm[] {
  const out: FoldedForm[] = [];
  for (const name of input.helpers) {
    // D2: a method without an effect of its own is folded into its caller
    // like a form, and said here like one — but only where a walked call
    // actually folded it, since no call graph of methods says more.
    const method = input.methodImpls.find((impl) => impl.key === name);
    if (method) {
      if (!input.reachedRoutines.has(name)) continue;
      out.push({
        name,
        lineStart: method.block.lineStart,
        lineEnd: method.block.lineEnd,
        callSites: (input.methodCallSites.get(name) ?? []).length,
      });
      continue;
    }
    if (isUnreachedForm(input, name)) continue;
    const block = input.formBlocks.get(name);
    if (!block) continue;
    out.push({
      name,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      // Counted off 2.2's call graph, not off the walk: a helper performed
      // only by another helper is never walked and would otherwise read as
      // called from nowhere.
      callSites: input.calls.performs.filter((p) => p.target === name).length,
    });
  }
  return out.sort((a, b) => a.lineStart - b.lineStart);
}

/**
 * §5.8: *"14 forms identical except the rule number"*.
 *
 * Two routines are the same shape when their bodies match once every number is
 * replaced by `#` and every occurrence of their own name is removed — which is
 * exactly what the fourteen rule routines of the reference case differ by.
 */
function clones(input: NotDrawnInput): CloneGroup[] {
  const groups = new Map<string, string[]>();
  for (const [name, block] of input.formBlocks) {
    const body: string[] = [];
    // The `FORM` header is part of the shape: two routines with the same body
    // and different parameters are not the same routine.
    for (let i = block.openIndex; i <= bodyRange(block)[1]; i++) {
      body.push(input.statements[i].text.toUpperCase().replace(/\d+/g, '#'));
    }
    const shape = body.join(' | ').split(name.toUpperCase()).join('<SELF>');
    groups.set(shape, [...(groups.get(shape) ?? []), name]);
  }
  const out: CloneGroup[] = [];
  for (const [shape, names] of groups) {
    if (names.length < 2) continue;
    const blocks = names
      .map((n) => input.formBlocks.get(n))
      .filter((b): b is Block => b !== undefined);
    if (!blocks.length) continue;
    out.push({
      names: names.sort(),
      lineStart: Math.min(...blocks.map((b) => b.lineStart)),
      lineEnd: Math.max(...blocks.map((b) => b.lineEnd)),
      shape: snippet(shape),
    });
  }
  return out.sort((a, b) => a.lineStart - b.lineStart);
}
