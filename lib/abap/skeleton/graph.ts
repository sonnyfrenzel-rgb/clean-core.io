import type { AbapStatement } from '../statement-reader';
import type {
  NodeAnchor,
  SkeletonEdge,
  SkeletonEdgeKind,
  SkeletonEdgeReason,
  SkeletonNode,
  SkeletonNodeKind,
  SkeletonNote,
  SkeletonNoteReason,
  SkeletonRegion,
} from '../process-skeleton';
import { snippet } from './anchors';

/**
 * The working model of the skeleton passes — engine 4 phase 3 (`docs/design/engine4.md`, "Phase 3").
 *
 * `SkeletonBuilder` (`process-skeleton.ts`) used to hold the graph as four private arrays and an id counter; every
 * pass read and wrote them through `this`. The passes are being moved out of the class one at a time, each a typed
 * function `(graph, input) → void` over this one object, so a pass names in its signature what it reads besides
 * the graph. The graph keeps its arrays mutable and its identity allocator private: a pass may drop nodes
 * (`graph.nodes = graph.nodes.filter(…)`), but only `addNode` mints an id (rule 7).
 *
 * Type-only imports from `process-skeleton.ts`: the builder imports this module, never the other way round.
 */

/** The gated readings a build carries, one flag per gate (`readsOf` in `process-skeleton.ts`). */
export interface SkeletonReadings {
  /** Engine 3.1.0 (`ENGINE_READS_310_FROM`). */
  reads310: boolean;
  /** Engine 3.2.0 (`ENGINE_READS_320_FROM`). */
  reads320: boolean;
  /** Engine 3.5.0 (`ENGINE_READS_350_FROM`): the skeleton readings listed in `engine-reads-350-gate.ts`. */
  reads350: boolean;
  /** Engine 3.5.2 (`ENGINE_READS_352_FIXES_FROM`): the skeleton readings listed in `engine-reads-352-fixes-gate.ts`. */
  reads352Fixes: boolean;
}

/** A way out of what the walk drew last, not yet connected to what comes next. */
export interface Exit {
  from: string;
  condition: string;
  kind: SkeletonEdgeKind;
  reason?: SkeletonEdgeReason;
}

export class SkeletonGraph {
  nodes: SkeletonNode[] = [];
  edges: SkeletonEdge[] = [];
  regions: SkeletonRegion[] = [];
  notes: SkeletonNote[] = [];
  /** Next free slot per statement — the second half of a node's identity. */
  private slots = new Map<number, number>();
  private unanchored = 0;

  /** Nodes minted without an anchor — `ProcessSkeleton.unanchoredNodes`. */
  get unanchoredCount(): number {
    return this.unanchored;
  }

  /**
   * Rule 7. The slot counts up per statement, so a statement that yields two
   * nodes yields two identities. A node with no statement gets `nd-x-<n>`, which
   * cannot collide with an anchored one either.
   */
  addNode(
    kind: SkeletonNodeKind,
    label: string,
    anchor: NodeAnchor | null,
    region: SkeletonRegion,
    container: string | null,
    extra: Partial<SkeletonNode> = {},
  ): SkeletonNode {
    let id: string;
    if (anchor) {
      const slot = this.slots.get(anchor.statementIndex) ?? 0;
      this.slots.set(anchor.statementIndex, slot + 1);
      id = `nd-${anchor.statementIndex}-${slot}`;
    } else {
      this.unanchored += 1;
      id = `nd-x-${this.unanchored}`;
    }
    const node: SkeletonNode = {
      id,
      kind,
      label,
      anchor,
      region: region.key,
      container,
      ...extra,
    };
    this.nodes.push(node);
    return node;
  }

  connect(from: Exit[], to: string): void {
    for (const exit of from) {
      this.edges.push({
        from: exit.from,
        to,
        kind: exit.kind,
        condition: exit.condition,
        ...(exit.reason ? { reason: exit.reason } : {}),
      });
    }
  }

  note(reason: SkeletonNoteReason, statement: AbapStatement, detail: string): void {
    this.notes.push({
      reason,
      detail,
      snippet: snippet(statement.text),
      lineStart: statement.lineStart,
      lineEnd: statement.lineEnd,
    });
  }
}
