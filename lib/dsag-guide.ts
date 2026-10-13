/**
 * lib/dsag-guide.ts — lookup into the synced structure of the DSAG ABAP guide
 * ("DSAG ABAP-Leitfaden", DSAG e.V. and contributors, CC BY 4.0).
 *
 * The data file `lib/generated/dsag-abap-guide.json` is written weekly by
 * `scripts/sync-dsag-guide.ts`. It holds metadata and section hashes only, no
 * prose of the guide. What the product takes from the guide is the reviewed
 * registry in `lib/dsag-citations.ts`.
 */
import guide from './generated/dsag-abap-guide.json';

export interface DsagGuideSectionRef {
  /** Page title as the guide publishes it (German). */
  title: string;
  /** The heading as written in the guide. */
  heading: string;
  /** Published URL of the section, anchor included. */
  url: string;
  /** SHA-256 of the section's normalised text at the synced commit. */
  hash: string;
}

interface Data {
  source: string;
  site: string;
  commit: string;
  syncedAt: string;
  licence: { spdx: string; file: string; url: string; reuse: boolean };
  pages: { file: string; title: string; url: string }[];
  sections: { file: string; heading: string; level: number; anchor: string; hash: string }[];
}

const DATA = guide as Data;

export const DSAG_GUIDE_SOURCE = DATA.source;
export const DSAG_GUIDE_SITE = DATA.site;
export const DSAG_GUIDE_COMMIT = DATA.commit;
export const DSAG_GUIDE_LICENCE = DATA.licence;

/** Accepts `clean-core/solution-approach.md` as well as `docs/clean-core/solution-approach.md`. */
const repoPath = (file: string) => (file.startsWith('docs/') ? file : `docs/${file}`);

/** Compares headings the way a reader would: trimmed, NFC. */
const same = (a: string, b: string) => a.normalize('NFC').trim() === b.normalize('NFC').trim();

/**
 * The section of `file` whose heading is `heading`, or null when the synced
 * guide has no such section. When a page repeats a heading, the first wins.
 */
export function dsagSection(file: string, heading: string): DsagGuideSectionRef | null {
  const path = repoPath(file);
  const page = DATA.pages.find((p) => p.file === path);
  if (!page) return null;
  const section = DATA.sections.find((s) => s.file === path && same(s.heading, heading));
  if (!section) return null;
  return { title: page.title, heading: section.heading, url: `${page.url}#${section.anchor}`, hash: section.hash };
}

/** The repository at the synced commit — the attribution links here. */
export const dsagGuideCommitUrl = () => `${DATA.source}/tree/${DATA.commit}`;
