import type { SkeletonGraph } from './graph';

/**
 * Pass "guards" — engine 4 phase 3, a fold after the walk (`docs/design/engine4.md`, "Phase 3").
 *
 * §5.8's conditional flow: the run switch sits on the edge, not on a gateway.
 *
 * Reads: `region.guard` (set by the walk's `readGuard`), the call sites (`expandsTo`) and the edges into them.
 * Writes: `detail.guard` on each call site; `kind` and `condition` of an unconditional edge into one. Adds and
 * drops nothing. No reading gate.
 *
 * An edge that already carries a condition keeps it — an `IF` around the call
 * said something the switch does not, and joining the two with an `AND` this
 * engine wrote would be a condition nobody put in the source (rule 6). The
 * switch is on the node either way.
 */
export function applyGuards(graph: SkeletonGraph): void {
  for (const region of graph.regions) {
    const guard = region.guard;
    if (!guard) continue;
    const callers = graph.nodes.filter((n) => n.expandsTo === region.key);
    const ids = new Set(callers.map((n) => n.id));
    for (const caller of callers) {
      caller.detail = { ...(caller.detail ?? {}), guard: guard.condition };
    }
    for (const edge of graph.edges) {
      if (!ids.has(edge.to) || edge.condition) continue;
      edge.kind = 'conditional';
      edge.condition = guard.condition;
    }
  }
}
