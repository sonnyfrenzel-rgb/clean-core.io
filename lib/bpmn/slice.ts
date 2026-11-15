import type { ExportContainer, ExportModel } from './model';

/**
 * The first elements of a map's top level, and nothing else — the home page's
 * live slice of the demo map (AB-14a, owner decision H-O1: "drawn live from the
 * demo map with the same renderer as Analyze, cut after the first elements").
 *
 * A **view, never a file**, like the phone's view of the reading map:
 * the elements keep their ids, names, anchors and traces; only what lies after
 * the cut is left out — later elements, the flows to them, what a collapsed
 * phase holds, lanes, pools, tables and notes. Nothing is added and nothing is
 * renamed. Nothing exported, stored, signed or compared is built with it.
 *
 * Pure: model in, model out; the input is not changed.
 */
export function sliceModel(model: ExportModel, keep: readonly string[]): ExportModel {
  const kept = new Set(keep);
  const root = model.root;
  const nodes = root.nodes
    .filter((n) => kept.has(n.id) && (!n.attachedTo || kept.has(n.attachedTo)))
    .map((n) => ({ ...n, inner: undefined, reads: [], writes: [] }));
  const ids = new Set(nodes.map((n) => n.id));
  const flows = root.flows.filter((f) => ids.has(f.sourceId) && ids.has(f.targetId));
  const flowIds = new Set(flows.map((f) => f.id));
  for (const node of nodes) {
    node.incoming = node.incoming.filter((id) => flowIds.has(id));
    node.outgoing = node.outgoing.filter((id) => flowIds.has(id));
    if (node.defaultFlow && !flowIds.has(node.defaultFlow)) node.defaultFlow = undefined;
  }
  const bands = root.bands.map((band) => ({
    ...band,
    nodeIds: band.nodeIds.filter((id) => ids.has(id)),
    entryId: band.entryId && ids.has(band.entryId) ? band.entryId : null,
    endId: band.endId && ids.has(band.endId) ? band.endId : null,
  }));
  const sliced: ExportContainer = {
    ...root,
    bands,
    nodes,
    flows,
    storeRefs: [],
    dataAssociations: [],
    annotations: [],
  };
  return {
    root: sliced,
    lanes: [],
    containers: [sliced],
    stores: [],
    pools: [],
    messages: [],
    droppedEdges: 0,
  };
}
