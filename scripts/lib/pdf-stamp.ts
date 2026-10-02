/**
 * The sidecar next to a committed PDF (`<file>.pdf.sha256`), shared by
 * `scripts/generate-guide-pdf.ts`, `scripts/generate-whitepaper-pdf.ts` and
 * `tests/whitepaper-guard.spec.ts`.
 *
 * Line 1 is the fingerprint of the sources the PDF is rendered from; that half
 * says "the PDF was built after the last content change". It said nothing about
 * the PDF itself, though: replacing the committed PDF with an older one left the
 * stamp, and every check, green (codex review code-public-05). Line 2 binds the
 * stamp to the artefact — `pdf <sha256 of the file>`, written by the generator
 * in the same step as the PDF — so a PDF that is not the one rendered fails.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** SHA-256 over the source files, LF whatever the checkout did, so a Windows working copy stamps what CI reads. */
export function sourceFingerprint(root: string, sources: readonly string[]): string {
  const h = createHash('sha256');
  for (const rel of sources) {
    h.update(rel);
    h.update(fs.readFileSync(path.resolve(root, rel), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}

export function fileDigest(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function stampText(sources: string, pdfDigest: string): string {
  return `${sources}\npdf ${pdfDigest}\n`;
}

/** Both halves of a stamp; `pdf` is null for a stamp written before the PDF was bound. */
export function readStamp(stampFile: string): { sources: string; pdf: string | null } {
  const lines = fs.readFileSync(stampFile, 'utf8').split(/\r?\n/).map((l) => l.trim());
  const pdf = lines.find((l) => l.startsWith('pdf '));
  return { sources: lines[0] ?? '', pdf: pdf ? pdf.slice(4) : null };
}
