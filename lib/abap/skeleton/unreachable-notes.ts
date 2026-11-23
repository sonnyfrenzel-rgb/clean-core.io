import type { AbapStatement } from '../statement-reader';
import { snippet } from './anchors';
import type { SkeletonGraph } from './graph';

/**
 * Pass "unreachable notes" — engine 4 phase 3, after the starts and the report chain
 * (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: nodes, edges, `region.entryNodeId`, the statements (for the snippet) and the boundary events whose TRY
 * nothing entered (`cutOffBoundaries`, collected by the walk). Writes: one `unreachable-after-abort` note per node
 * nothing leads to. Changes no node or edge. No reading gate.
 */
export interface UnreachableNotesInput {
  statements: readonly AbapStatement[];
  /** Boundary events of a TRY that nothing enters after an abort (`walkTry`). */
  cutOffBoundaries: ReadonlySet<string>;
}

/**
 * A step nothing can reach, because what stands before it never comes back.
 *
 * `SUBMIT` without `AND RETURN`, `LEAVE PROGRAM`, `MESSAGE … TYPE 'E'`: the
 * statements written after one of those are still read and still anchored —
 * dropping them would cost the reader the lines — but they hang off no flow,
 * and a node with no way in is said out loud rather than drawn as if
 * something led to it.
 *
 * A boundary event is not one of them. It is attached to an activity rather
 * than reached by a sequence flow, so "nothing leads to it" is a statement
 * about this reader's graph and not about the program — and it was made about
 * a `CATCH` whose protected part simply drew no node (CR-07). Unreachable is
 * claimed where the source shows it.
 */
export function noteUnreachableSteps(graph: SkeletonGraph, input: UnreachableNotesInput): void {
  const reached = new Set(graph.edges.map((e) => e.to));
  const entryNodes = new Set(graph.regions.map((r) => r.entryNodeId));
  for (const node of graph.nodes) {
    if (reached.has(node.id) || entryNodes.has(node.id) || node.kind === 'start') continue;
    // A boundary is skipped unless its TRY was entered by nothing after an
    // abort.
    if (node.kind === 'error-boundary' && !input.cutOffBoundaries.has(node.id)) continue;
    const statement = node.anchor ? input.statements[node.anchor.statementIndex] : undefined;
    graph.notes.push({
      reason: 'unreachable-after-abort',
      detail: `Nothing in this source leads to ${node.kind} "${node.label}": what stands before it in ${node.container ?? 'the program'} does not come back.`,
      snippet: statement ? snippet(statement.text) : node.label,
      lineStart: node.anchor?.lineStart ?? 0,
      lineEnd: node.anchor?.lineEnd ?? 0,
    });
  }
}
