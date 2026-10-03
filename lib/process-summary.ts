import { buildReadingExports } from './bpmn/export';
import { buildProcessMapModel, processCounts } from './process-map';
import { applyNaming, namingContextOf } from './process-naming';

/**
 * What the process map of a source holds, in four numbers — for every place
 * that has to say "there is a process" without drawing it again: the *Need &
 * process* layer and its tab (owner, 03.10.2026: "the process was
 * reconstructed, but Need & process says something else — nobody understands
 * that").
 *
 * **The map's own count, not a second one.** The layer used to know only the
 * rules and the usage records, so a project whose signed run had drawn eight
 * shapes and a decision read "empty — nothing on record" one screen lower.
 * Counting the skeleton here instead would be a third number for the same
 * process (the map draws a small routine as one shape). So this builds the
 * model exactly as `hooks/useProcessMap.ts` does — the same reading exports,
 * the same mapper — and counts it with `processCounts`, the function the map's
 * overview line uses. Names do not change a count, so no naming is read.
 *
 * Deterministic and without a model call; pure, so a test can compare it with
 * the map it summarises.
 */
export interface ProcessSummary {
  /** Activities on the map. */
  steps: number;
  /** Exclusive and parallel gateways on the map. */
  decisions: number;
  /** Shapes the traceability line counts. */
  shapes: number;
  /** Of those, the ones with a line anchor. */
  anchored: number;
}

export function processSummaryOf(source: string, fileName = 'source.abap'): ProcessSummary | null {
  if (!source.trim()) return null;
  const { bpmn, technical } = buildReadingExports(source, { processName: fileName, sourceFileName: fileName });
  const named = applyNaming(namingContextOf(source), null);
  const model = buildProcessMapModel({ bpmn, technical, named, fileName });
  const { steps, decisions } = processCounts(model.elements);
  if (steps === 0 && decisions === 0) return null;
  return { steps, decisions, shapes: model.traceability.flowNodes, anchored: model.traceability.anchored };
}
