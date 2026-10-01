/**
 * What "Start analysis" on the own-code page hands to the Analyze stage.
 *
 * The own-code page (mockup 2.8 s11) creates the project and opens Analyze,
 * which holds the run: the evidence scan, the model narrative and the signed
 * run are built there and only there. Two things the reader has already done
 * on the own-code page would otherwise be asked again on arrival — reading the
 * pledge under the upload (the Terms line) and ticking the lines that look like
 * personal data — and the run needs one answer it has not given yet, the
 * target operating model, which Analyze asks in its own dialog.
 *
 * Kept in module memory and nowhere else, on purpose:
 *   - not in the URL, because a query parameter that grants something can be
 *     sent to anybody (QA full review of a12774cd2b7f, the example exemption);
 *   - not in browser storage, which the Privacy Policy lists key by key;
 *   - not on the project, which `firestore.rules` keeps to six fields at create.
 * A client-side navigation keeps the module alive; a reload or a new tab does
 * not, and Analyze then simply asks as it always has. Taken once.
 */

export interface OwnCodeHandoff {
  projectId: string;
  /**
   * `personalDataHintKey` of the hints the reader ticked for exactly this
   * source. Analyze compares it with the key of the text it loads, so a tick
   * can never cover a different text. `''` when there was nothing to tick.
   */
  personalDataKey: string;
}

let pending: OwnCodeHandoff | null = null;

export function leaveOwnCodeHandoff(handoff: OwnCodeHandoff): void {
  pending = handoff;
}

/** The handoff for this project, once; `null` for any other project or a second ask. */
export function takeOwnCodeHandoff(projectId: string): OwnCodeHandoff | null {
  if (!pending || pending.projectId !== projectId) return null;
  const handoff = pending;
  pending = null;
  return handoff;
}
