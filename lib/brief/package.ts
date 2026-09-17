import { bpmnFileName } from '@/lib/bpmn/export';
import { briefPdf } from '@/lib/brief/pdf';
import type { ProcessBrief } from '@/lib/brief/model';

/**
 * What leaves the building when somebody asks for the brief — roadmap 4.4:
 * **the PDF and the `.bpmn`, in one download.**
 *
 * The shape follows `lib/audit-pack-build.ts`: a pure function returns the
 * contents by name, and the caller — a click handler here, a route there —
 * packs them. Nothing about zipping, saving or the browser is in this file, so
 * a test can assert on the two files without one.
 *
 * Two files and no third. The audit pack has a manifest because the audit pack
 * is signed and a reader has to be able to check it; this is a summary, and a
 * manifest beside it would be the beginning of a second pack format that nobody
 * asked for. What the brief is, and what it is not, is on its own first page.
 *
 * **The `.bpmn` is the export, byte for byte.** It is not re-serialised here and
 * not re-generated: whatever `buildBpmnExport` produced for the source the run
 * signed is what goes in, so the file in the download and the file behind the
 * "Export BPMN" button are one file. A second reading of the same source would
 * be a second chance to disagree with the picture the PDF describes.
 */

export interface BriefPackageFile {
  name: string;
  data: string | Uint8Array;
}

export interface BriefPackage {
  /** The name of the download itself. */
  name: string;
  /** The PDF first, then the BPMN — the order the reader meets them. */
  files: BriefPackageFile[];
}

export interface BriefPackageInput {
  brief: ProcessBrief;
  /** `buildBpmnExport(...).xml` of the source the brief was built from. Unchanged. */
  bpmnXml: string;
  /** The name the files are built from — a project name, typed by a person. */
  name: string;
  /** ISO 8601, passed through to the PDF. */
  generatedAt: string;
}

export function buildBriefPackage(input: BriefPackageInput): BriefPackage {
  // One slug for all three names: `bpmnFileName` already reduces a typed name to
  // characters every file system keeps, and a second implementation here would
  // be a second set of rules to keep in step with it.
  const bpmnName = bpmnFileName(input.name);
  const base = bpmnName.replace(/\.bpmn$/, '');

  return {
    name: `${base}-brief.zip`,
    files: [
      { name: `${base}-brief.pdf`, data: briefPdf(input.brief, { generatedAt: input.generatedAt }) },
      { name: bpmnName, data: input.bpmnXml },
    ],
  };
}
