/**
 * The first line of every main file of a package generated against the
 * decision on record (roadmap 3.0.13, B6): when the owner's live decision
 * record says retire, move to the SAP standard or keep the program as it is,
 * the code still generated says so in its first comment — on the engine-led
 * path the model writes only bodies, so the scaffold writes the line, the
 * same words the single call is asked for (`lib/transformation-context.ts`).
 *
 * Pure: files in, files out.
 */

export interface AgainstDecision {
  /** The decision record's id. */
  id: string;
  /** What the record decides instead of a rebuild: `retire`, `standard`, `keep`. */
  option: string;
}

/** `// DRAFT AGAINST THE DECISION ON RECORD (DR-7): retire` — `"` for ABAP. */
export function draftHeaderLine(a: AgainstDecision, comment: '//' | '"'): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /').slice(0, 80);
  return `${comment} DRAFT AGAINST THE DECISION ON RECORD (${clean(a.id)}): ${clean(a.option)}`;
}

/** The comment of a main file's first line, or null for a file that takes none (JSON, XML, data). */
function commentOf(path: string): '//' | '"' | null {
  if (/\.(?:ts|mjs|js|cds)$/i.test(path)) return '//';
  if (/\.abap$/i.test(path)) return '"';
  return null;
}

/** Every main file with the header as its first line; the files unchanged when there is no decision against. */
export function withDraftHeader<T extends { path: string; content: string }>(files: T[], against: AgainstDecision | null | undefined): T[] {
  if (!against) return files;
  return files.map((f) => {
    const c = commentOf(f.path);
    return c ? { ...f, content: `${draftHeaderLine(against, c)}\n${f.content}` } : f;
  });
}
