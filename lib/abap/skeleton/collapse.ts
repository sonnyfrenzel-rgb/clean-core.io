import type { SkeletonNode, SkeletonNodeKind } from '../process-skeleton';
import type { SkeletonGraph, SkeletonReadings } from './graph';

/**
 * Pass "collapse" — engine 4 phase 3, a fold after the walk (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: the graph's nodes and regions. Writes: `kind`, `collapsed` and `detail.collapsedFrom` of call-site nodes,
 * nothing else — no node or edge is added or dropped. Readings: `reads310` (AB-15a, a phase inside keeps the routine
 * a phase), `reads352` (a call site whose `collapsed` state alone changed is a move, so the pass runs again).
 */

/**
 * When a routine collapses to one step, this is which of its steps it becomes.
 *
 * Only activities and data are in the list. A gateway, a loop, an end event and
 * a boundary event are not steps, so a routine whose whole content is a decision
 * stays a sub-process with that decision inside it rather than turning into a
 * diamond with a routine's name on it.
 */
export const DOMINANT_ORDER: SkeletonNodeKind[] = [
  'transaction', 'call-activity', 'call-opaque', 'send-task', 'user-task',
  'service-task', 'write', 'output', 'read', 'business-rule-task', 'task',
  'sub-process',
];

export function collapseSmallRegions(
  graph: SkeletonGraph,
  readings: Pick<SkeletonReadings, 'reads310'> & Partial<Pick<SkeletonReadings, 'reads352'>>,
): void {
  // A routine that collapses changes the kind of the call site inside the
  // routine above it, so one pass settles the innermost level only: `reject`
  // performs `log_approval`, and until `log_approval` is a write, `reject`
  // sees a sub-process and stays one. Repeat until nothing moves — bounded by
  // the number of regions, which is what a chain of them can be at most.
  // Both lists below used to be read with a `filter` over every node of the
  // source, once per region and once per pass — the work grew with the square
  // of the source, and on a 1.1 MB program it was the larger half of the time
  // `deriveBusinessRules` took. Neither `region`
  // nor `expandsTo` is written in this method; only `kind`, `collapsed` and
  // `detail` are. So the two groupings are read once, in node order, and a
  // pass then costs what its own nodes cost.
  const inRegion = new Map<string, SkeletonNode[]>();
  const callersOf = new Map<string, SkeletonNode[]>();
  for (const node of graph.nodes) {
    const own = inRegion.get(node.region);
    if (own) own.push(node);
    else inRegion.set(node.region, [node]);
    if (node.expandsTo === undefined) continue;
    const callers = callersOf.get(node.expandsTo);
    if (callers) callers.push(node);
    else callersOf.set(node.expandsTo, [node]);
  }

  for (let pass = 0; pass <= graph.regions.length; pass++) {
    let changed = false;
    // Engine 3.5.2: a call site that only turns collapsed (or back) is a move as well. A routine calling itself keeps
    // the kind `sub-process` when it folds, and the routine above it, visited first, still saw an open phase inside.
    const fold = (caller: SkeletonNode, collapsed: boolean) => {
      if (readings.reads352 && caller.collapsed !== collapsed) changed = true;
      caller.collapsed = collapsed;
    };
    for (const region of graph.regions) {
      if (region.kind !== 'sub-process') continue;
      // Roadmap 2.17 (b): the body of a `LOOP AT` is a region, but it is not a
      // routine small enough to be one step. Collapsing it would put the
      // dominant kind of the body on the loop element and take the
      // multi-instance marker off the only element that can carry it — the one
      // that contains the body. §5.8 collapses a `FORM`, never a loop.
      if (region.multiInstance) continue;
      // ADR-054: an early end is an end event, not an element of the routine —
      // it takes the place the flow to the normal end had, and counting it
      // would turn a small routine into a phase because it has two exits.
      const inner = (inRegion.get(region.key) ?? [])
        // Engine 3.1.0: a row put into the result (`collectStep`) is the yes of a decision, not an element that
        // makes a routine one step or a phase — the routine folds, or not, exactly as before it was drawn. The same
        // holds for the call of a technical helper drawn as an arm's outcome (`helperStep`): a log note is not an
        // element that turns a one-step routine into a level of its own.
        .filter((n) => n.id !== region.endNodeId && n.detail?.early !== true && n.detail?.collects !== true
          && n.detail?.helperCall !== true);
      const callers = callersOf.get(region.key) ?? [];
      if (!callers.length) continue;
      // Roadmap 2.17 (b): a routine that iterates a business table is a phase,
      // not a step — and that holds for a decision table too. Since the body
      // of that `LOOP AT` is a region of its own, the routine around it can
      // count two elements where it used to count ten
      // (`AUDIT_TRAVEL_EXPENSES` of `Z_EMPLOYEE_EXPENSE_VAL` went from seven
      // inner nodes to two, `CALCULATE_RISK_SCORES` of the 1.000-line example
      // from twelve to two), and §5.8's "more than three elements" would fold
      // a whole iteration into one box. The marker is what says there are
      // many: a region holding one is never one step.
      if (inner.some((n) => n.detail?.multiInstance === true)) {
        for (const caller of callers) fold(caller, false);
        continue;
      }
      if (callers[0].kind === 'business-rule-task') {
        for (const caller of callers) fold(caller, inner.length <= 3);
        continue;
      }
      // Engine 3.1.0 (AB-15a): a routine that calls a phase of its own is not one step. `main` creating the object
      // and calling `run` has two elements, and folding it onto the constructor's read hid the whole process
      // behind one box named after that read. A phase inside keeps the routine a phase. A routine's call of itself
      // (a retry by recursion) is not a phase of its own: it opens the very region being decided.
      if (readings.reads310 && inner.some((n) => n.kind === 'sub-process' && n.expandsTo && n.expandsTo !== region.key && !n.collapsed)) {
        for (const caller of callers) {
          if (caller.collapsed) {
            caller.collapsed = false;
            caller.kind = 'sub-process';
            if (caller.detail) delete caller.detail.collapsedFrom;
            changed = true;
          }
        }
        continue;
      }
      const steps = inner.filter((n) => DOMINANT_ORDER.includes(n.kind));
      if (!inner.length || inner.length > 3 || !steps.length) {
        for (const caller of callers) fold(caller, false);
        continue;
      }
      const dominant = [...steps].sort(
        (a, b) => DOMINANT_ORDER.indexOf(a.kind) - DOMINANT_ORDER.indexOf(b.kind),
      )[0];
      for (const caller of callers) {
        if (caller.kind !== dominant.kind) changed = true;
        caller.kind = dominant.kind;
        fold(caller, true);
        caller.detail = { ...(caller.detail ?? {}), collapsedFrom: dominant.label };
      }
    }
    if (!changed) break;
  }
}
