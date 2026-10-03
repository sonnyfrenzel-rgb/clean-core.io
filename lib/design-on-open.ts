/**
 * Whether opening the Design stage writes the solution design (ADR-070,
 * amended 03.10.2026). Pure, so the rule is held by a test rather than only by
 * the page that applies it (QA f63973a2cf05).
 *
 * Wanted when there is none on record, or the one on record was written for a
 * previous basis — never again when a current one is there, which would cost a
 * model call for nothing. A changed source wants a new analysis first, not a
 * design for code nobody analysed. Started only by the owner: an invited
 * reader reads.
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
