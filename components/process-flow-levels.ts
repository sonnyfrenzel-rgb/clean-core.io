/**
 * The column of every node in `ProcessFlow`'s left-to-right layout: the length
 * of the longest path from the start to it, so a successor always stands to the
 * right of each of its predecessors.
 *
 * The first version set a node's level on its first visit and, on a later
 * visit by a longer path, raised that one node and returned — its successors
 * kept the old level. `A → B → D` plus `A → C → X → B` then drew `B → D`
 * backwards (QA full review of v2.20.0, be67ec5f9d29). A raised level is now
 * passed on. An edge back into the path that is being walked is a loop, not a
 * longer path, and is skipped; a loop used to push its target — the start node,
 * often — to the right of the node it came back from.
 *
 * `maxDepth` bounds the walk the way it always did.
 */
export function processFlowLevels(
  flow: readonly { id: string; next?: readonly string[] | null }[],
  startId: string,
  maxDepth = 50,
): Record<string, number> {
  const byId = new Map(flow.map((n) => [n.id, n]));
  const level: Record<string, number> = {};
  const onPath = new Set<string>();

  const walk = (nodeId: string, at: number, depth: number) => {
    if (depth > maxDepth) return;
    if (onPath.has(nodeId)) return;
    if (nodeId in level && level[nodeId] >= at) return;
    level[nodeId] = at;
    onPath.add(nodeId);
    const next = byId.get(nodeId)?.next;
    if (Array.isArray(next)) {
      for (const nextId of next) walk(nextId, at + 1, depth + 1);
    }
    onPath.delete(nodeId);
  };

  walk(startId, 0, 0);
  return level;
}
