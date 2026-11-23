import type { SkeletonEdge, SkeletonRegion } from '../process-skeleton';
import { RANK_END_OF_SELECTION, RANK_GET, RANK_LOAD_OF_PROGRAM, RANK_START_OF_SELECTION } from './keywords';
import type { SkeletonGraph } from './graph';

/**
 * Pass "report chain" — engine 4 phase 3, after the starts (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: nodes (start nodes and their `detail.origin`, early ends and their `detail.exit`), edges, entry regions
 * and their runtime ranks. Writes: one `runtime-order` or `stop` edge per hand-over. Drops nothing. No reading gate.
 */

/**
 * The reporting event blocks of one program run, in the order ABAP raises
 * them: `LOAD-OF-PROGRAM` up to `END-OF-SELECTION` (rule 4), each with its
 * start node. The list events (`TOP-OF-PAGE`, `AT LINE-SELECTION`, `AT
 * USER-COMMAND`, …) are not in it: list output and the user raise them, not
 * the end of the block before.
 */
function reportEventChain(graph: SkeletonGraph): Array<{ region: SkeletonRegion; rank: number; startId: string }> {
  const starts = new Map(graph.nodes.filter((n) => n.kind === 'start').map((n) => [n.id, n]));
  return graph.regions
    .filter((r) => r.kind === 'entry' && typeof r.runtimeRank === 'number' && r.runtimeRank <= RANK_END_OF_SELECTION)
    .flatMap((region) => {
      const start = region.entryNodeId ? starts.get(region.entryNodeId) : undefined;
      const origin = start?.detail?.origin;
      return start && (origin === 'event' || origin === 'implicit')
        ? [{ region, rank: region.runtimeRank as number, startId: start.id }]
        : [];
    })
    .sort((a, b) => a.rank - b.rank || (a.region.anchor?.lineStart ?? 0) - (b.region.anchor?.lineStart ?? 0));
}

/**
 * Roadmap 3.0.7 (MM case review) — **only an early end ends
 * the run.** The event blocks of a report used to stand side by side, each
 * with its own start and end, and a view that wanted one flow had to guess
 * whether the end of `START-OF-SELECTION` was the end of the run. ABAP
 * answers it: a block that ends normally hands over to the next reporting
 * event, so its end gets one flow into the next block's start
 * (`reason: 'runtime-order'`). An early end decides by its keyword:
 *
 * - in `INITIALIZATION`, `AT SELECTION-SCREEN …` (`EXIT`/`RETURN`): the block
 *   is left and the run goes on — the same flow as the normal end;
 * - in `START-OF-SELECTION`/`GET`: `STOP` goes on with `END-OF-SELECTION`
 *   (`reason: 'stop'`), `EXIT`/`RETURN` end the run — no flow;
 * - an error message, `LEAVE PROGRAM`, a `SUBMIT` that does not return:
 *   `end-error` or a `no-return` flow — the run ends there, no flow, and a
 *   normal end reached from a `no-return` flow hands over nothing.
 *
 * `LOAD-OF-PROGRAM`'s early ends are left alone: the documentation treats
 * that block apart, and this reader does not guess.
 */
export function chainReportEvents(graph: SkeletonGraph): void {
  const chain = reportEventChain(graph);
  if (chain.length < 2) return;
  const present = new Set(graph.nodes.map((n) => n.id));
  const into = new Map<string, SkeletonEdge[]>();
  for (const edge of graph.edges) into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
  const endOfSelection = chain.find((c) => c.rank === RANK_END_OF_SELECTION);
  for (let i = 0; i < chain.length - 1; i++) {
    const { region, rank } = chain[i];
    const next = chain[i + 1];
    const end = region.endNodeId;
    const arriving = into.get(end) ?? [];
    if (present.has(end) && arriving.length > 0 && !arriving.some((e) => e.reason === 'no-return')) {
      graph.edges.push({ from: end, to: next.startId, kind: 'sequence', condition: '', reason: 'runtime-order' });
    }
    for (const node of graph.nodes) {
      if (node.region !== region.key || node.detail?.early !== true) continue;
      const exit = String(node.detail.exit ?? '').toUpperCase();
      if (rank > RANK_LOAD_OF_PROGRAM && rank < RANK_START_OF_SELECTION && (exit === 'EXIT' || exit === 'RETURN')) {
        graph.edges.push({ from: node.id, to: next.startId, kind: 'sequence', condition: '', reason: 'runtime-order' });
      } else if (exit === 'STOP' && endOfSelection && endOfSelection.rank > rank
        && (rank === RANK_START_OF_SELECTION || rank === RANK_GET)) {
        graph.edges.push({ from: node.id, to: endOfSelection.startId, kind: 'sequence', condition: '', reason: 'stop' });
      }
    }
  }
}
