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

/**
 * Where a screen keeps the draft when the map itself may be unmounted — the
 * workspace drops the map on a view switch and remounts it across the phone
 * breakpoint, and an unsaved drawing must outlive both (Codex code-ui-03).
 */
export interface DraftHolder {
  get(): HeldDraft | null;
  set(next: HeldDraft | null): void;
}

/** A holder of its own — what a map uses when its caller keeps none. */
export function createDraftHolder(): DraftHolder {
  let held: HeldDraft | null = null;
  return {
    get: () => held,
    set: (next) => {
      held = next;
    },
  };
}

/** The drawing to open for this project and source, or null when there is none. */
export function draftFor(held: HeldDraft | null, projectId: string | null, source: string): string | null {
  if (!held) return null;
  return held.projectId === projectId && held.source === source ? held.xml : null;
}
