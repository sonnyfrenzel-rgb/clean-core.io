/**
 * The editor's unsaved drawing, and which process it belongs to.
 *
 * A drawing belongs to one project's process as reconstructed from one source.
 * The source alone is not enough: Duplicate (My workspace) makes a second
 * project with byte-identical source, and a map kept alive across the two
 * would otherwise open the first project's drawing in the second — and Save
 * would write it there (QA review of 072f79996d01, 2a9ed7cf905b).
 */
export interface HeldDraft {
  projectId: string | null;
  source: string;
  xml: string;
}

/** The drawing to open for this project and source, or null when there is none. */
export function draftFor(held: HeldDraft | null, projectId: string | null, source: string): string | null {
  if (!held) return null;
  return held.projectId === projectId && held.source === source ? held.xml : null;
}
