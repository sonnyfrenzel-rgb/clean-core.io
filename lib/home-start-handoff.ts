/**
 * What the home page's own-code start hands to today's start
 * (`/admin/new-project/upload`, `components/workspace/OwnCodeImport.tsx`) —
 * AB-14a, owner decision H-O11: *"for a new account the start is built into the
 * page: dropping or choosing a file opens today's start with the file preset;
 * edition and cost are asked as today."*
 *
 * The home page reads nothing and writes nothing: the file goes on as the
 * reader chose it, and the start page reads, checks and counts it exactly as if
 * it had been dropped there. "Paste the code" opens the same page with its
 * paste field open.
 *
 * Module memory, like `lib/own-code-handoff.ts` and for the same reasons: a
 * file cannot travel in a URL, and browser storage is listed key by key in the
 * Privacy Policy. A client-side navigation keeps it; a reload of the start page
 * loses it, and the page then simply asks for the file. Taken once.
 */

export type HomeStartHandoff = { kind: 'files'; files: File[] } | { kind: 'paste' };

let pending: HomeStartHandoff | null = null;

export function leaveHomeStart(handoff: HomeStartHandoff): void {
  pending = handoff.kind === 'files' && handoff.files.length === 0 ? null : handoff;
}

/** The handoff, once; `null` when the home page left nothing or it was taken. */
export function takeHomeStart(): HomeStartHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

/**
 * The file name a pasted program travels under: its own name where the first
 * statement says it (`REPORT z_po_check.` → `Z_PO_CHECK.abap`), otherwise a
 * plain one. The object itself is read from the text, as for any file.
 */
export function pastedFileName(text: string): string {
  const m = /^\s*(?:REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL|CLASS|INTERFACE|FUNCTION)\s+([\w/]+)/im.exec(text);
  const name = m ? m[1].replace(/\//g, '_').toUpperCase() : 'PASTED_CODE';
  return `${name}.abap`;
}
