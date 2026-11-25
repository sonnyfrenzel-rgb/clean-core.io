import type { AbapStatement } from '../statement-reader';
import type { BlockStructure } from '../block-structure';
import type { ControlFlowReport } from '../control-flow';
import type { CallGraphReport } from '../call-graph';
import { readLuwStates } from '../luw-states';
import type { SkeletonLuw } from '../process-skeleton';
import type { SkeletonGraph } from './graph';

/**
 * Pass "LUW" — engine 4 phase 3, the last pass (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: the facts of 2.1/2.2 (`luw-states.ts` reads them itself) and the nodes. Writes: `detail.effectState`,
 * `effectOutcomes`, `effectEnd` and `updateMode` on the node each registration was drawn as. Returns
 * `ProcessSkeleton.luw`. Reading: `reads352Fixes` (`IN PROGRAM` read outside literals, `luw-states.ts`).
 */
export interface LuwInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  control: ControlFlowReport;
  calls: CallGraphReport;
  /** Engine 3.5.2 (`engine-reads-352-fixes-gate.ts`). */
  reads352Fixes?: boolean;
}

/**
 * Roadmap 2.12. The states come from `luw-states.ts`, read off the same
 * statements; here they are tied to the node a registration was drawn as, and
 * the node says its state itself (`detail.effectState`), so a view that shows
 * only the node still cannot show a registration as a finished step.
 */
export function attachLuwStates(graph: SkeletonGraph, input: LuwInput): SkeletonLuw {
  const model = readLuwStates({
    statements: input.statements,
    structure: input.structure,
    control: input.control,
    calls: input.calls,
  }, { reads352Fixes: input.reads352Fixes === true });
  const registrations = model.registrations.map((registration) => {
    const node = graph.nodes.find((n) => n.anchor?.statementIndex === registration.statementIndex
      && n.kind !== 'error-boundary');
    if (node) {
      node.detail = {
        ...(node.detail ?? {}),
        effectState: registration.state,
        effectOutcomes: [...new Set(registration.outcomes.map((o) => o.state))],
        ...(registration.unresolved ? { effectEnd: registration.unresolved.state } : {}),
        updateMode: registration.updateMode.value,
      };
    }
    return { ...registration, nodeId: node?.id ?? null };
  });
  return { registrations, events: model.events };
}
