/**
 * What opening the Design stage does about the solution design. Pure, so the
 * rule is held by a test rather than only by the page that applies it.
 *
 * Since owner decision 22.10.2026 opening Design never writes the design: the
 * business questions come first, and the owner asks for it with "Generate the
 * design" (`lib/design-business-answers.ts` says when that is enabled). This
 * says whether a design is wanted and whether the owner could start one now —
 * the page then waits for a generation another tab of this browser holds.
 *
 * Wanted when there is none on record, or the one on record was written for a
 * previous basis — never again when a current one is there. A changed source
 * wants a new analysis first, not a design for code nobody analysed. Only the
 * owner starts one: an invited reader reads.
 */
export interface DesignOnOpenInput {
  hasDesign: boolean;
  stale: { design: boolean; sourceChanged: boolean };
  owner: boolean;
  runLoadFailed: boolean;
  /** How many prerequisites of the design generation are missing. */
  missingPrerequisites: number;
}

export function designOnOpen(i: DesignOnOpenInput): { wanted: boolean; canStart: boolean } {
  const wanted = !i.hasDesign || (i.stale.design && !i.stale.sourceChanged);
  const canStart = i.owner && !i.stale.sourceChanged && !i.runLoadFailed && i.missingPrerequisites === 0;
  return { wanted, canStart };
}
