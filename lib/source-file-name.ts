import { STARTER_EXAMPLES } from './starter-examples';
import { EXAMPLE_SNIPPETS } from './example-snippets';

/**
 * The name of the file a project's source came from — what the Analyze page
 * shows above the source and sends with the run, where the run signs it into
 * `inputFingerprint.fileName`.
 *
 * A project started from an example used to be signed as `manual-input.abap`:
 * the example gallery creates the project with its source and nothing else
 * (`firestore.rules` keeps a new project to six fields), and the Analyze page
 * only ever learnt a name from a file the reader picked in its own upload box.
 * So a run of the shipped `Z_MM_PO_APPROVAL.abap` said, in its header and in
 * its signature, that somebody had pasted it.
 *
 * The example is recognised from what the project does carry: a snippet by its
 * exact source text, a shipped example by the object name the gallery gave the
 * project. A project that only claims `fromExample` gets nothing from this but a
 * label — the run's quota and exemptions are decided on the server from the
 * source's fingerprint (`lib/starter-example-fingerprints.ts`), never from here.
 */

/** The Analyze page's own placeholder: no file was picked. Never a real file name. */
export const PASTED_SOURCE_NAME = 'manual-input.abap';

export interface SourceNameSubject {
  name?: unknown;
  legacyCode?: unknown;
  fromExample?: unknown;
  isExample?: unknown;
  auditMetadata?: { inputFingerprint?: { fileName?: unknown } | null } | null;
}

const realName = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' && v !== PASTED_SOURCE_NAME ? v : null;

/** The example file this project was started from, or null. */
export function exampleFileName(project: SourceNameSubject | null | undefined): string | null {
  if (!project || !(project.fromExample === true || project.isExample === true)) return null;
  const code = typeof project.legacyCode === 'string' ? project.legacyCode.replace(/\r\n/g, '\n').trim() : '';
  if (code) {
    const snippet = EXAMPLE_SNIPPETS.find((s) => s.code.replace(/\r\n/g, '\n').trim() === code);
    if (snippet) return snippet.name;
  }
  const name = typeof project.name === 'string' ? project.name.trim() : '';
  const example = STARTER_EXAMPLES.find((e) => e.name === name);
  return example ? example.file : null;
}

/**
 * The file name to show and to sign: the one the last run signed, unless that
 * was the placeholder; else the example's file; else null (nothing is known).
 */
export function sourceFileName(project: SourceNameSubject | null | undefined): string | null {
  return realName(project?.auditMetadata?.inputFingerprint?.fileName) ?? exampleFileName(project);
}
