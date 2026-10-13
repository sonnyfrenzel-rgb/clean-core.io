/**
 * lib/sap-references.ts — lookup into the synced structure of four SAP
 * repositories on GitHub (roadmap 3.0.12, owner decision 13.10.2026):
 *
 *   abap-cheat-sheets             SAP-samples/abap-cheat-sheets — Apache-2.0
 *   abap-platform-refscen-flight  SAP-samples/abap-platform-refscen-flight (ABAP-platform-cloud) — Apache-2.0
 *   styleguides                   SAP/styleguides (Clean ABAP) — CC BY 3.0
 *   abap-file-formats             SAP/abap-file-formats — MIT
 *
 * © SAP SE or an SAP affiliate company and contributors. The data files in
 * `lib/generated/sap-references/` are written weekly by
 * `scripts/sync-sap-references.ts` and hold metadata and hashes only — commit,
 * licence, a SHA-256 per file, and per Markdown section its heading, anchor and
 * hash. The only content copied is the ABAP file format JSON schemas (MIT) in
 * `lib/generated/aff-schemas/`, unchanged, next to the upstream LICENSE.
 * What the product takes from the sources is the reviewed registry in
 * `lib/sap-reference-citations.ts`.
 *
 * The data files are several hundred kB together: import this module on the
 * server, in scripts and in specs, not from a client component.
 */
import cheatSheets from './generated/sap-references/abap-cheat-sheets.json';
import flight from './generated/sap-references/abap-platform-refscen-flight.json';
import styleguides from './generated/sap-references/styleguides.json';
import fileFormats from './generated/sap-references/abap-file-formats.json';

export type SapReferenceKey = 'abap-cheat-sheets' | 'abap-platform-refscen-flight' | 'styleguides' | 'abap-file-formats';

export interface SapReferenceData {
  key: SapReferenceKey;
  source: string;
  branch: string;
  commit: string;
  syncedAt: string;
  licence: { spdx: string; github: string; reuse: string[]; file: string; url: string };
  files: { path: string; sha256: string; size: number }[];
  sections: { file: string; heading: string; level: number; anchor: string; hash: string }[];
  copied?: { path: string; to: string }[];
}

const DATA: Record<SapReferenceKey, SapReferenceData> = {
  'abap-cheat-sheets': cheatSheets as SapReferenceData,
  'abap-platform-refscen-flight': flight as SapReferenceData,
  styleguides: styleguides as SapReferenceData,
  'abap-file-formats': fileFormats as SapReferenceData,
};

export const SAP_REFERENCE_KEYS = Object.keys(DATA) as SapReferenceKey[];

export const sapReferenceData = (key: SapReferenceKey): SapReferenceData => DATA[key];

/** `owner/name` of the source, e.g. `SAP-samples/abap-cheat-sheets`. */
export const sapReferenceRepo = (key: SapReferenceKey) => DATA[key].source.replace(/^https:\/\/github\.com\//, '');

/** The repository at the synced commit — the attribution links here. */
export const sapReferenceCommitUrl = (key: SapReferenceKey) => `${DATA[key].source}/tree/${DATA[key].commit}`;

const blobUrl = (key: SapReferenceKey, file: string) => `${DATA[key].source}/blob/${DATA[key].commit}/${file.split('/').map(encodeURIComponent).join('/')}`;

export interface SapReferenceFileRef {
  path: string;
  /** SHA-256 of the file at the synced commit. */
  hash: string;
  /** The file on GitHub at the synced commit. */
  url: string;
}

/** A file of the source in the synced scope, or null. */
export function sapReferenceFile(key: SapReferenceKey, file: string): SapReferenceFileRef | null {
  const f = DATA[key].files.find((x) => x.path === file);
  return f ? { path: f.path, hash: f.sha256, url: blobUrl(key, f.path) } : null;
}

export interface SapReferenceSectionRef {
  file: string;
  heading: string;
  /** The section on GitHub at the synced commit, anchor included. */
  url: string;
  /** SHA-256 of the section's normalised text at the synced commit. */
  hash: string;
}

const same = (a: string, b: string) => a.normalize('NFC').trim() === b.normalize('NFC').trim();

/** The section of a Markdown file whose heading is `heading`, or null. When a file repeats a heading, the first wins. */
export function sapReferenceSection(key: SapReferenceKey, file: string, heading: string): SapReferenceSectionRef | null {
  const s = DATA[key].sections.find((x) => x.file === file && same(x.heading, heading));
  return s ? { file: s.file, heading: s.heading, url: `${blobUrl(key, s.file)}#${s.anchor}`, hash: s.hash } : null;
}

/** A Clean ABAP section by heading alone, searched in CleanABAP.md first, then the sub-sections. */
export function cleanAbapSection(heading: string): SapReferenceSectionRef | null {
  const main = sapReferenceSection('styleguides', 'clean-abap/CleanABAP.md', heading);
  if (main) return main;
  const s = DATA.styleguides.sections.find((x) => same(x.heading, heading));
  return s ? sapReferenceSection('styleguides', s.file, s.heading) : null;
}

/**
 * The ABAP file format JSON schemas copied from SAP/abap-file-formats (MIT,
 * unchanged), by object type: repository-relative path of each schema file.
 * TABL has two (`tabl-v1.json` for the table, `tabt-v1.json` for the table type).
 */
export function affSchemaFiles(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of DATA['abap-file-formats'].copied ?? []) {
    const type = c.path.split('/')[1];
    (out[type] ??= []).push(c.to);
  }
  return out;
}

/** Folder of the copied schemas and of the upstream LICENSE that comes with them. */
export const AFF_SCHEMAS_FOLDER = 'lib/generated/aff-schemas';
