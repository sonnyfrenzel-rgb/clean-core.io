import type { SkeletonGraph, SkeletonReadings } from './graph';

/**
 * Pass "starts" — engine 4 phase 3, after the folds (`docs/design/engine4.md`, "Phase 3"): a start event inside
 * every plane a reader can open (`addSubProcessStarts`), and the entries that draw nothing (`markEmptyEntries`).
 *
 * Reads: nodes, regions. Writes: one start node and one edge per plane, `region.entryNodeId`;
 * `region.drawsNothing`. Readings: `reads310` (loop levels get a start; empty entries are marked).
 */

/**
 * Engine 3.1.0 — an entry process that draws nothing between its start and its end says nothing to a business
 * reader: eight empty methods of a BAdI interface were eight maps "Start → Done". Marked here
 * (`SkeletonRegion.drawsNothing`), left out by the business reading only. A reporting event block is never
 * marked: it hands the run over to the next one (`chainReportEvents`), and leaving it out would cut that chain.
 */
export function markEmptyEntries(graph: SkeletonGraph): void {
  const kinds = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const own = kinds.get(node.region);
    if (own) own.add(node.kind);
    else kinds.set(node.region, new Set([node.kind]));
  }
  for (const region of graph.regions) {
    if (region.kind !== 'entry') continue;
    const start = graph.nodes.find((n) => n.id === region.entryNodeId);
    const origin = start?.detail?.origin;
    if (origin === 'event' || origin === 'implicit') continue;
    const own = kinds.get(region.key) ?? new Set<string>();
    if ([...own].every((kind) => kind === 'start' || kind === 'end')) region.drawsNothing = true;
  }
}

/**
 * ADR-054 — a start event inside every plane a reader can open.
 *
 * A routine the map draws as a sub-process with a plane of its own gets a
 * start event there, anchored at its `FORM`/`METHOD` line, so every level
 * that opens has a visible beginning and a visible end, as Signavio draws
 * one. It lives **only** in the routine's region: the caller still sees one
 * box, which is what the call site is.
 *
 * "A plane of its own" is exactly what `lib/bpmn/model.ts` expands: a call
 * site of kind `sub-process` with `expandsTo`. A routine `collapseSmallRegions`
 * turned into the one step it does, a business-rule task, a technical helper
 * (no region at all) and the body of a multi-instance `LOOP AT` get none.
 */
export function addSubProcessStarts(graph: SkeletonGraph, readings: Pick<SkeletonReadings, 'reads310'>): void {
  const planes = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === 'sub-process' && node.expandsTo) planes.add(node.expandsTo);
  }
  // Engine 3.1.0 — the loop levels too (decided 27.09.2026, the follow-up ADR-054 named): the body of a
  // multi-instance `LOOP AT` is a plane of its own exactly as a routine is, and it begins where the iteration
  // begins, at a start event on the `LOOP` line. A body that draws nothing has no plane and gets none.
  if (readings.reads310) {
    for (const node of graph.nodes) {
      if (node.kind === 'loop' && node.detail?.multiInstance === true && node.expandsTo) planes.add(node.expandsTo);
    }
  }
  for (const region of graph.regions) {
    if (region.kind !== 'sub-process' || !planes.has(region.key)) continue;
    if (region.multiInstance && !readings.reads310) continue;
    if (!region.anchor || !/^(?:form|method|loop):/.test(region.key)) continue;
    const end = graph.nodes.find((n) => n.id === region.endNodeId);
    const first = graph.nodes.findIndex((n) => n.region === region.key);
    const start = graph.addNode('start', region.label, region.anchor, region, end?.container ?? region.label, {
      detail: { subProcess: true, ...(region.multiInstance ? { loopLevel: true } : {}) },
    });
    // `addNode` appends; the start goes before the first node of its region,
    // so the file lists a plane in the order it is read.
    if (first >= 0) {
      graph.nodes.pop();
      graph.nodes.splice(first, 0, start);
    }
    const to = region.entryNodeId ?? region.endNodeId;
    if (to) graph.edges.push({ from: start.id, to, kind: 'sequence', condition: '' });
    region.entryNodeId = start.id;
  }
}
