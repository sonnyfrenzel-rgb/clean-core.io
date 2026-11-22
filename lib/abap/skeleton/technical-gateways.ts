import type { SkeletonEdge, SkeletonNode } from '../process-skeleton';
import {
  hasOnlyTechnicalConditions,
  isTechnicalGateway,
  type ComparableElementKind,
} from '../element-comparability';
import type { SkeletonGraph } from './graph';

/**
 * Pass "technical gateways" — engine 4 phase 3, a fold after the walk and the guards
 * (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: nodes, edges, `region.entryNodeId`. Writes: a gateway turned boundary in place (`kind`, `label`,
 * `detail`), the `from`/`kind`/`condition` of the arms it moves; drops the gateway and its incoming edges where a
 * boundary already stood (the double drawing). No reading gate.
 */

/**
 * Does this condition say the step before it **failed**, or that it worked?
 * Roadmap 2.15 — `foldTechnicalGateways` needs to know which of the two arms is
 * the error arm before it can hang one on a boundary event, and the source is
 * the only place that says so.
 *
 * Anchored on purpose, and conservative on purpose. `sy-subrc <> 0` is an error
 * arm; `sy-subrc = 0 AND ls_eine-peinh > 0` is not read at all, although the
 * marker rule of `element-comparability.ts` calls it technical — it carries a
 * business comparison beside the return code, and negating that onto a boundary
 * event would be this engine saying something the source does not. A condition
 * this function cannot read returns `null`, and `null` keeps the gateway.
 *
 * ES2017 target: no lookbehind, no named groups, no `s` flag.
 */
const FAILURE_CONDITIONS: RegExp[] = [
  /^SY-(?:SUBRC|TABIX)\s*(?:<>|NE|>|GT)\s*0$/i,
  /^SY-(?:SUBRC|TABIX)\s+IS\s+NOT\s+INITIAL$/i,
  /^[\w/]*(?:<[\w/]+>|[\w/]+)(?:->[\w/]+)?\s+IS\s+NOT\s+(?:ASSIGNED|BOUND)$/i,
  /^LINES\s*\([^()]*\)\s*(?:=|EQ)\s*0$/i,
  /^LINES\s*\([^()]*\)\s+IS\s+INITIAL$/i,
];

const SUCCESS_CONDITIONS: RegExp[] = [
  /^SY-(?:SUBRC|TABIX)\s*(?:=|EQ)\s*0$/i,
  /^SY-(?:SUBRC|TABIX)\s+IS\s+INITIAL$/i,
  /^[\w/]*(?:<[\w/]+>|[\w/]+)(?:->[\w/]+)?\s+IS\s+(?:ASSIGNED|BOUND)$/i,
  /^LINES\s*\([^()]*\)\s*(?:>|GT)\s*0$/i,
];

export function conditionAsserts(condition: string): 'failure' | 'success' | null {
  let text = condition.trim();
  let negated = false;
  // `CHECK sy-subrc = 0.` leaves `NOT ( sy-subrc = 0 )` on the other arm
  // (`walkCheck`), and that arm is the error arm.
  const not = /^NOT\s*\(([\s\S]*)\)$/i.exec(text);
  if (not) {
    negated = true;
    text = not[1].trim();
  }
  for (const pattern of FAILURE_CONDITIONS) {
    if (pattern.test(text)) return negated ? 'success' : 'failure';
  }
  for (const pattern of SUCCESS_CONDITIONS) {
    if (pattern.test(text)) return negated ? 'failure' : 'success';
  }
  return null;
}

/**
 * Which of the two arms is the error arm — roadmap 2.15.
 *
 * Either one of them says so itself (`sy-subrc <> 0`), or one says the step
 * worked and the other is the `ELSE` with no words of its own, which is then the
 * error arm by elimination. Anything else is `null`: two arms that both read as
 * failure, or neither, are not the shape this rule is about.
 */
export function failureArm(arms: SkeletonEdge[]): SkeletonEdge | null {
  const failing = arms.filter((e) => conditionAsserts(e.condition) === 'failure');
  if (failing.length === 1) return failing[0];
  if (failing.length > 1) return null;
  const working = arms.filter((e) => conditionAsserts(e.condition) === 'success');
  const bare = arms.filter((e) => !e.condition.trim());
  if (working.length === 1 && bare.length === 1) return bare[0];
  return null;
}

/**
 * A return code is the **effect of a step**, not a decision of the process —
 * roadmap 2.15 (§16 V2), after 1.9.
 *
 * `IF sy-subrc <> 0.` right behind a call, a read or a write is not something
 * the process decides. It is the one step reporting whether it worked, and the
 * target format has a shape for exactly that: a boundary event on the step,
 * with the error path leaving it. Drawing it as an `exclusiveGateway` is what
 * made this engine's maps read like a control-flow graph with BPMN names —
 * measured over the eight shipped examples, **27 of 68 gateways (39,7 %)** are
 * of this kind by their conditions, and decisions per activity stood at 0,82
 * against 0,10 in the median of the reference holding.
 *
 * Worse, for a `CALL FUNCTION … EXCEPTIONS` the same error path was drawn
 * **twice**: `walkFunction` hangs a boundary event on the call when the next
 * statements read `sy-subrc`, and then the `IF` that reads it walked through
 * here as a gateway of its own. In 5 of 5 such places both were drawn, and
 * `tests/abap-process-skeleton.spec.ts` pinned only the pair, never the
 * gateway behind it. 2.15 says which of the two survives: "the boundary event
 * `walkFunction` creates today **in addition** becomes the only one".
 *
 * The rule is not written here. Both halves of it live in
 * `element-comparability.ts` — `hasOnlyTechnicalConditions` for the conditions,
 * `isTechnicalGateway` for conditions **and** the single call/read/write
 * predecessor — so that the Business view and the export cannot drift apart
 * about what a decision is. Two copies of one rule are two rules.
 *
 * What this pass does **not** do, each for a reason that cost a measurement:
 *
 * - **No cascade.** The pass decides on the graph as the walk left it and
 *   never on its own result. In `Z_MM_PO_APPROVAL` `check_authority` the
 *   second `IF sy-subrc <> 0.` belongs to an `AUTHORITY-CHECK`, which draws no
 *   node (it is lane evidence, 2.16); its only predecessor in the graph is the
 *   `SELECT … FROM eban` of the *first* check. Folding the first one and then
 *   reading the graph again would hang the authority error on that read — a
 *   sentence the source does not contain.
 * - **No fold without a named error arm.** `sy-subrc = 0 AND ls_eine-peinh > 0`
 *   is technical by the marker rule and still half a business condition; it
 *   stays a gateway. Only the shapes `conditionAsserts` can read end up as a
 *   boundary.
 * - **No fold of a gateway with more than two arms**, and none whose step
 *   already leads somewhere else: both would leave an activity with two
 *   unconditional ways out, which is not a shape BPMN gives a meaning to.
 *
 * Rule 6 is untouched throughout: the condition text travels **verbatim** onto
 * the flow that leaves the boundary event, and the other arm keeps its own
 * words too. Nothing becomes unreachable — every arm of the gateway is still a
 * flow, only from one node further up.
 */
export function foldTechnicalGateways(graph: SkeletonGraph): void {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, SkeletonEdge[]>();
  const incoming = new Map<string, SkeletonEdge[]>();
  for (const edge of graph.edges) {
    const from = outgoing.get(edge.from);
    if (from) from.push(edge); else outgoing.set(edge.from, [edge]);
    const to = incoming.get(edge.to);
    if (to) to.push(edge); else incoming.set(edge.to, [edge]);
  }
  const entryNodes = new Set(graph.regions.map((r) => r.entryNodeId));
  const droppedNodes = new Set<string>();
  const droppedEdges = new Set<SkeletonEdge>();
  /**
   * Decided first, applied afterwards — this is the "no cascade" above, and it
   * has to be two loops to be true. The maps hold the **same** edge objects the
   * apply step writes `from` on, so a single loop would read its own result
   * one gateway later and fold the `AUTHORITY-CHECK` of `check_authority` onto
   * the `SELECT … FROM eban` two statements above it.
   */
  const plans: Array<{
    gateway: SkeletonNode;
    step: SkeletonNode;
    boundary?: SkeletonNode;
    failure: SkeletonEdge;
    survivor: SkeletonEdge;
    into: SkeletonEdge[];
  }> = [];

  for (const gateway of graph.nodes) {
    if (gateway.kind !== 'gateway' || entryNodes.has(gateway.id)) continue;
    const arms = outgoing.get(gateway.id) ?? [];
    const into = incoming.get(gateway.id) ?? [];
    // Two arms: the step failed, or it did not. A `CASE` with three ways out
    // is not this shape whatever its conditions say.
    if (arms.length !== 2) continue;
    if (!hasOnlyTechnicalConditions(arms.map((e) => e.condition))) continue;

    // The predecessor half. Two shapes are accepted and nothing else: one
    // call/read/write step, or that step **together with the boundary event
    // `walkFunction` already hung on it** — which is the double drawing, and
    // the boundary is itself the proof that this step's `sy-subrc` is what the
    // branch reads (`walkFunction` hangs one only on a `CALL FUNCTION …
    // EXCEPTIONS` whose next statements read it).
    const predecessors = into.map((e) => byId.get(e.from)).filter((n): n is SkeletonNode => !!n);
    let step: SkeletonNode | undefined;
    let boundary: SkeletonNode | undefined;
    if (predecessors.length === 1) {
      const only = predecessors[0];
      if (isTechnicalGateway({
        conditions: arms.map((e) => e.condition),
        predecessorKinds: [only.kind as ComparableElementKind],
      })) step = only;
    } else if (predecessors.length === 2) {
      const hung = predecessors.find((n) => n.kind === 'error-boundary');
      const other = predecessors.find((n) => n !== hung);
      if (hung && other && hung.detail?.attachedTo === other.id) {
        step = other;
        boundary = hung;
      }
    }
    if (!step) continue;

    // The step may not already lead somewhere else, and a boundary that is
    // reused may not either: both would end up with two ways out.
    const stepOut = (outgoing.get(step.id) ?? []).filter((e) => e.kind !== 'boundary');
    if (stepOut.length !== 1 || stepOut[0].to !== gateway.id) continue;
    if (boundary) {
      const hungOut = outgoing.get(boundary.id) ?? [];
      if (hungOut.length !== 1 || hungOut[0].to !== gateway.id) continue;
    }

    // **The branch has to read *this* step's return code, and adjacency is
    // the only proof of that this reader has.** `sy-subrc` is one global
    // field: every statement that sets it overwrites the one before. Corpus
    // case CC-055 is the whole argument — `CALL TRANSACTION 'XD01' … / READ
    // TABLE gt_msg … / IF sy-subrc = 0.` The `READ TABLE` draws no node, so
    // the graph shows the gateway hanging off the call, and folding it would
    // hang "did the message table contain an error?" on the transaction as
    // its failure. The corpus caught exactly that (`skelett`, CC-055), which
    // is what 1.9 was built before this step for.
    //
    // So: the `IF` must be the statement right after the step. The one
    // exception is a step that already carries a boundary event, because
    // `handlesSubrcAfter` drew it with a window of two statements — and the
    // two have to agree, or the double drawing this step removes comes back.
    const stepStatement = step.anchor?.statementIndex;
    const branchStatement = gateway.anchor?.statementIndex;
    if (stepStatement === undefined || branchStatement === undefined) continue;
    const distance = branchStatement - stepStatement;
    if (distance < 1 || distance > (boundary ? 2 : 1)) continue;

    const failure = failureArm(arms);
    if (!failure) continue;
    const survivor = arms.find((e) => e !== failure);
    if (!survivor) continue;

    plans.push({ gateway, step, boundary, failure, survivor, into });
  }

  for (const { gateway, step, boundary, failure, survivor, into } of plans) {
    if (boundary) {
      // The double drawing. The boundary event that was already there takes
      // the error arm and becomes the only one; the gateway goes.
      failure.from = boundary.id;
      droppedNodes.add(gateway.id);
      for (const edge of into) droppedEdges.add(edge);
    } else {
      // No boundary yet: the gateway **becomes** one, in place. Keeping the
      // node rather than dropping it and adding another keeps the id, and with
      // it the anchor of the `IF` — which is the line a reader of the map
      // wants to see when they follow the error path (2.5).
      gateway.kind = 'error-boundary';
      gateway.label = step.label;
      gateway.detail = {
        ...(gateway.detail ?? {}),
        attachedTo: step.id,
        foldedGateway: true,
        // Only when the source wrote words on this arm. `IF sy-subrc = 0. …
        // ELSE. …` puts them on the *other* one, and the error arm is the
        // `ELSE`, which has none — inventing one here would be rule 6 broken
        // in the one place the step touches.
        ...(failure.condition ? { condition: failure.condition } : {}),
      };
      const attach = into[0];
      attach.kind = 'boundary';
      attach.condition = '';
    }
    // The other arm carries on from the step itself, with its own words on it
    // (rule 6). `default` is a gateway's word for "the way past it", and this
    // is no longer a gateway.
    survivor.from = step.id;
    if (survivor.kind === 'default' || survivor.kind === 'conditional') survivor.kind = 'sequence';
  }

  if (droppedNodes.size) graph.nodes = graph.nodes.filter((n) => !droppedNodes.has(n.id));
  if (droppedEdges.size) graph.edges = graph.edges.filter((e) => !droppedEdges.has(e));
}
