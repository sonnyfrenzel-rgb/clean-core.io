import { LEGAL_TEXTS_NAMES_AUTOMATIC } from './names-wording';
import type { LegalLang } from './open-values';

/**
 * The versions of the privacy policy — its own numbering and date, apart from the Terms of Service.
 *
 * The privacy policy is information, not part of the contract: it changes with the product, and a change must not
 * need a round of amendments under section 10 of the Terms. Until version 1.1 it carried the date of the legal texts
 * of Fassung 1.1 (9 November 2026, the Terms' version id), so a change to it was invisible. From version 1.2 it names
 * its own version and date, says what changed at the top, and every earlier version stays at a fixed address:
 * `/datenschutz/versions/<id>` (English) and `/datenschutz/versions/<id>/de` (German, which prevails). The sign-up
 * dialog names the version of the policy, and the consent record stores its id (`privacyVersion`).
 *
 * Which version is in force is the build's: version 1.2 from the release whose texts say business names start by
 * themselves again (`LEGAL_TEXTS_NAMES_AUTOMATIC`, `lib/legal/names-wording.ts`), version 1.1 before. Both texts come
 * from the one source (`privacyDeFor` / `privacyEnFor`), and `tests/legal-names-wording.spec.ts` holds each archived
 * file to the source as rendered for its version.
 *
 * A published version is immutable, as for the Terms (`lib/terms-versions.ts`): its file is never edited, the digest
 * below is the SHA-256 of the LF-normalised file, and a change is a new version. `scripts/legal/archive-privacy.ts`
 * writes the files and prints the digests, before publication only.
 *
 * Import-light (the names rule and a type), so the sign-up dialog and the consent record read it.
 */

export type PrivacyVersionId = '1.1' | '1.2';

export interface PrivacyPolicyVersion {
  id: PrivacyVersionId;
  /** The day the version took effect, ISO. */
  dateIso: string;
  /** The day in each language's own form: "9 November 2026" / "09.11.2026". */
  date: Record<LegalLang, string>;
  /**
   * What `consent_events.privacyVersion` stores for an acceptance under this version. Version 1.1 kept the value it
   * was recorded with, the Terms' version id of its day; from 1.2 the policy's own id.
   */
  recordId: string;
  /** The texts render this version when business names start by themselves (true) or are paused (false). */
  namesAutomatic: boolean;
  /** Repository-relative paths of the immutable archived texts. */
  files: Record<LegalLang, string>;
  /** SHA-256 of each LF-normalised file, lowercase hex. */
  sha256: Record<LegalLang, string>;
}

export const PRIVACY_ARCHIVE_DIR = 'docs/privacy';

/** Every version, oldest first. */
export const PRIVACY_POLICY_VERSIONS: readonly PrivacyPolicyVersion[] = [
  {
    id: '1.1',
    dateIso: '2026-11-09',
    date: { en: '9 November 2026', de: '09.11.2026' },
    recordId: '2026-11-09',
    namesAutomatic: false,
    files: { en: 'docs/privacy/1.1.md', de: 'docs/privacy/1.1.de.md' },
    // Rendered from the source with the names paused; byte for byte what main published from 9 November 2026
    // (compared against the rendering of the release of 13 November 2026 when this archive was made).
    sha256: {
      en: 'f34bb3323a517f142df1e2e96ebd0516f742ca8b2408e7cfa468f529003d1536',
      de: '0d2d7350d865d7a5394eda778497ee7c4b941ef603383bf61fff560631a0f8cf',
    },
  },
  {
    // The release day of 3.1.0 (owner decision 13.11.2026; brought forward from 20.11. after the lawyer's go, 14.11.2026).
    id: '1.2',
    dateIso: '2026-11-14',
    date: { en: '14 November 2026', de: '14.11.2026' },
    recordId: '1.2',
    namesAutomatic: true,
    files: { en: 'docs/privacy/1.2.md', de: 'docs/privacy/1.2.de.md' },
    sha256: {
      en: '41920f340c19ce11e7bd0d49adb49a57c77635c3430005cd3090e2326cc2a6b7',
      de: '05a15661635bed6426d1ccb747d2bbf20e6e8e97e61b3ef121d4c800b3fcd06d',
    },
  },
];

export function privacyVersion(id: PrivacyVersionId): PrivacyPolicyVersion {
  const v = PRIVACY_POLICY_VERSIONS.find((x) => x.id === id);
  if (!v) throw new Error(`no privacy policy version ${id}`);
  return v;
}

/** The version a build renders: 1.2 once business names start by themselves, 1.1 before. */
export function privacyVersionFor(namesAutomatic: boolean): PrivacyPolicyVersion {
  return privacyVersion(namesAutomatic ? '1.2' : '1.1');
}

/** The version in force in this build. */
export const PRIVACY_POLICY_CURRENT: PrivacyPolicyVersion = privacyVersionFor(LEGAL_TEXTS_NAMES_AUTOMATIC);

/** The versions published in this build: the one in force and every one before it. A later one is not yet public. */
export function publishedPrivacyVersions(current: PrivacyPolicyVersion = PRIVACY_POLICY_CURRENT): PrivacyPolicyVersion[] {
  return PRIVACY_POLICY_VERSIONS.filter((v) => v.dateIso <= current.dateIso);
}

/** The fixed address of a version: `/datenschutz/versions/1.1` (English) or `/datenschutz/versions/1.1/de`. */
export function privacyVersionPath(id: PrivacyVersionId, lang: LegalLang): string {
  return lang === 'de' ? `/datenschutz/versions/${id}/de` : `/datenschutz/versions/${id}`;
}

/** The same address as the texts write it: `clean-core.io/datenschutz/versions/1.1`. */
export function privacyVersionAddress(id: PrivacyVersionId, lang: LegalLang): string {
  return `clean-core.io${privacyVersionPath(id, lang)}`;
}

/** The version before `id`, or null for the first. */
export function previousPrivacyVersion(id: PrivacyVersionId): PrivacyPolicyVersion | null {
  const i = PRIVACY_POLICY_VERSIONS.findIndex((v) => v.id === id);
  return i > 0 ? PRIVACY_POLICY_VERSIONS[i - 1] : null;
}

/**
 * The head of the policy for a version: its version line and, from 1.2, the change note in the lawyer's wording
 * (legal review, document 19) with the real address of the previous version. Version 1.1 keeps the line it was
 * published with.
 */
export function privacyHeadFor(namesAutomatic: boolean, lang: LegalLang): string {
  if (!namesAutomatic) return lang === 'de' ? '**Stand:** {{releaseDate}}.' : 'Version of {{releaseDate}}.';
  const v = privacyVersion('1.2');
  const prev = privacyVersion('1.1');
  if (lang === 'de') {
    return [
      `**Fassung ${v.id}, Stand ${v.date.de}.**`,
      `Geändert am ${v.date.de}: Fachliche Namen der Prozessschritte schlägt wieder automatisch ein Modell vor (Abschnitt 3). Die vorige Fassung vom ${prev.date.de} finden Sie unter ${privacyVersionAddress(prev.id, 'de')}.`,
    ].join('\n\n');
  }
  return [
    `Version ${v.id}, as of ${v.date.en}.`,
    `Changed on ${v.date.en}: business names of the process steps are again proposed automatically by a model (section 3). The previous version of ${prev.date.en} is at ${privacyVersionAddress(prev.id, 'en')}.`,
  ].join('\n\n');
}
