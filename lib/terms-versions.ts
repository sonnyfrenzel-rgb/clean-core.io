/**
 * The archive of Terms of Service texts — one entry per published version.
 *
 * **Why this exists.** § 10.5 of the Terms says the operator publishes "the
 * current version of these Terms, together with all previous versions and their
 * effective dates, at clean-core.io/terms". Until this file existed, `/terms`
 * rendered exactly one version and nothing kept the ones before it, so the
 * clause would have been false on the day it shipped.
 *
 * It settles a second thing the legal review asked for. `lib/consent.ts` wrote
 * `contentSha256: null` and said why: hashing a rendered React page produces a
 * value that moves with every build and proves nothing about the wording. A
 * consent record is supposed to carry version, timestamp, wording and account,
 * and the wording was the part nothing could show. With the text of a version
 * lying on disk as a file that never changes again, the hash of that file *is*
 * the wording, and the record can carry it.
 *
 * **The rule that makes it evidence: a published version is immutable.** Once a
 * version is in `docs/terms/`, its file is never edited — not for a typo, not
 * for a broken line. A changed text under an unchanged version number would
 * silently invalidate every consent record that names it. A correction is a new
 * version with a new effective date, announced under § 10.1.
 *
 * **The digest is a literal here, not something computed at request time.**
 * Two reasons. It keeps the value reachable from anywhere — a route handler, a
 * page, a test — without a file read, which matters because `lib/consent.ts`
 * runs inside a request on Cloud Run and must not depend on `docs/` being
 * shipped next to the build. And a hash written down beside the file it
 * describes is itself the immutability guard: if anybody ever edits an archived
 * text, `tests/terms-version-archive.spec.ts` recomputes the digest and fails.
 * `docs/registers/rules-deployment.json` records the hash of `firestore.rules`
 * the same way and for the same reason.
 *
 * **Line endings.** The digest is taken over the LF-normalised text, exactly as
 * `lib/firestore-rules-contract.ts` and `docs/registers/preservation-register.json`
 * take theirs, so a checkout on Windows and a checkout on CI agree. `.gitattributes`
 * additionally pins `docs/terms/**` to LF in the working tree, which is the same
 * answer this repository already gave for the workflow files, the Firestore rules
 * and the reference corpus. Belt and braces on purpose: the normalisation makes a
 * CRLF working copy hash correctly, and the attribute keeps one from appearing.
 *
 * **A version id is a date**, because `TERMS_VERSION` in `lib/constants.ts` is a
 * date — that string is what a consent record stores and what the re-consent
 * gate compares, so it is the only identity an archived text can usefully have.
 * `label` ("v2.0.0") is what the document calls itself in its own first
 * paragraph and is shown to readers; it is deliberately *not* the key, because
 * the label moved slower than the text did: the wording published as v2.0.0 was
 * edited on 19 August and again in September without the label changing. That
 * is why each entry also pins the git commit and blob it was taken from.
 *
 * This module has no imports, so a client component can render the list without
 * dragging `fs` into the browser bundle. Reading an archived *text* is a
 * separate act and happens only in `app/terms/versions/[version]/page.tsx`,
 * which is prerendered at build time.
 */

export interface ArchivedTermsVersion {
  /**
   * The identity recorded in `consent_events.termsVersion` — the same string
   * `TERMS_VERSION` holds while this version is current.
   */
  version: string;
  /** What the document calls itself, e.g. "v2.0.0". Shown, never matched on. */
  label: string;
  /** The effective date in words, as the document states it. */
  effectiveOn: string;
  /** Repository-relative path of the immutable text. */
  file: string;
  /** SHA-256 of the LF-normalised file content, lowercase hex. */
  sha256: string;
  /** Where the wording came from, so the archive can be checked against git. */
  source: {
    /** The file that rendered this version. */
    file: string;
    /** The commit whose version of that file was rendered and read out. */
    commit: string;
    /** `git rev-parse <commit>:<file>` — the blob, which pins the bytes. */
    blob: string;
    /** How the prose was taken out of the JSX. */
    method: string;
  };
}

/** Where archived texts live. Every file in it is listed below, and vice versa. */
export const TERMS_ARCHIVE_DIR = 'docs/terms';

/**
 * Every version of the Terms that has been published, newest first.
 *
 * Only v2.0.0 is here today, and that is the honest state: it is the one text
 * that has actually been in force. The version currently being prepared
 * (`TERMS_VERSION`) joins this list when it goes live on `main`, and until it
 * does, `archivedTermsSha256(TERMS_VERSION)` answers null rather than a guess.
 */
export const ARCHIVED_TERMS_VERSIONS: readonly ArchivedTermsVersion[] = [
  {
    version: '2026-07-07',
    label: 'v2.0.0',
    effectiveOn: '7 July 2026',
    file: 'docs/terms/2026-07-07.md',
    sha256: '56aa02d726fbdefdb0b41ef9548a449d97aa53625b15daae2aa4d51dbec26da2',
    source: {
      file: 'app/terms/page.tsx',
      commit: '09f8b83a41c94df73dfacff46684146d5e456301',
      blob: '10943c8e5b431bb90cf0a6508744e0dcc614bfee',
      method:
        'Rendered in a browser and read out of the DOM with the walk in scratch/extract-legal.js — the ' +
        'same extractor the legal pages were exported with, because reading JSX with a regular expression ' +
        'has already produced an export that misreported what a page says.',
    },
  },
];

/** CRLF to LF, so a checkout on Windows hashes to the same value as CI. */
export function normaliseTermsText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** The archived version with this id, or null when it was never published. */
export function archivedTerms(version: string | null | undefined): ArchivedTermsVersion | null {
  if (typeof version !== 'string') return null;
  return ARCHIVED_TERMS_VERSIONS.find((v) => v.version === version) ?? null;
}

/**
 * The digest of the wording of `version`, or null when no text is archived for
 * it.
 *
 * Null is the only honest answer for an unarchived version: a consent record
 * that carried some other version's hash would state, immutably, that the
 * account accepted words it was never shown.
 */
export function archivedTermsSha256(version: string | null | undefined): string | null {
  return archivedTerms(version)?.sha256 ?? null;
}

/* --------------------------------------------------------------------------
 * Rendering an archived text.
 *
 * The archive holds Markdown, and the subset is tiny because our own extractor
 * writes it: ATX headings, blank-line-separated paragraphs, and `- ` items. So
 * the reader below handles exactly that subset and nothing else, rather than
 * pulling a general Markdown pipeline (and its sanitiser question) into a page
 * whose whole point is that the bytes on disk are the bytes on screen. A
 * construct it does not know stays a paragraph — it is never dropped.
 * ------------------------------------------------------------------------ */

export type TermsBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  /** One paragraph; `lines` keeps the hard breaks an address block needs. */
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] };

export function parseArchivedTerms(text: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  for (const chunk of normaliseTermsText(text).split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      // The extractor writes one item per chunk, so consecutive items are
      // gathered back into a single list instead of a run of one-item lists.
      const items = trimmed.split('\n').map((line) => line.replace(/^-\s+/, '').trim());
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'list') last.items.push(...items);
      else blocks.push({ kind: 'list', items });
      continue;
    }

    blocks.push({ kind: 'paragraph', lines: trimmed.split('\n') });
  }
  return blocks;
}
