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
 * Which version is in force is the build's: the newest version whose texts say business names start by themselves
 * (`LEGAL_TEXTS_NAMES_AUTOMATIC`, `lib/legal/names-wording.ts`), version 1.1 before — 1.2 was that version from
 * 3.1.0, 1.3 (the usage figures of section 9, lawyer-approved document 21) from 3.2.0, 1.4 (My workspace, statement 20c)
 * from 3.3.0. Every version comes from
 * the one source (`privacyDeFor` / `privacyEnFor`, rendered by version id), and `tests/legal-names-wording.spec.ts`
 * holds each archived file to the source as rendered for its version.
 *
 * A published version is immutable, as for the Terms (`lib/terms-versions.ts`): its file is never edited, the digest
 * below is the SHA-256 of the LF-normalised file, and a change is a new version. `scripts/legal/archive-privacy.ts`
 * writes the files and prints the digests, before publication only.
 *
 * Import-light (the names rule and a type), so the sign-up dialog and the consent record read it.
 */

export type PrivacyVersionId = '1.1' | '1.2' | '1.3' | '1.4';

/**
 * The day version 1.4 takes effect — the release day of 3.3.0, which is not fixed yet. PROVISIONAL (22.11.2026, the
 * day the version was built): set it to the real release day before 3.3.0 goes to main, then delete
 * `docs/privacy/1.4.md` and `docs/privacy/1.4.de.md` (not yet published, but this build already counts 1.4 as in force,
 * so `--force` refuses them), run `npx tsx scripts/legal/archive-privacy.ts 1.4` and put the printed digests below.
 * Every date of 1.4 — the version record, the version line, the change note, the sign-up box — is derived from this
 * one constant.
 */
export const PRIVACY_14_DATE_ISO = '2026-11-22';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** An ISO day in each language's own form: "22 November 2026" / "22.11.2026". */
export function privacyDateOf(iso: string): Record<LegalLang, string> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO day: ${iso}`);
  const [, y, mo, d] = m;
  return { en: `${Number(d)} ${MONTHS_EN[Number(mo) - 1]} ${y}`, de: `${d}.${mo}.${y}` };
}

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
  /**
   * The texts name the weekly usage figures (section 9, with the references to it in sections 2, 5 and 6) and the
   * further browser storage entries in section 7 — from version 1.3 (legal review, document 21).
   */
  usageFigures: boolean;
  /**
   * The texts name My workspace — the two browser storage entries of its view and layout and the sentence on the view
   * in section 7, and the project summary in section 3 — from version 1.4 (legal review, document 20, statement 20c
   * E1–E4).
   */
  workspace: boolean;
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
    usageFigures: false,
    workspace: false,
    files: { en: 'docs/privacy/1.1.md', de: 'docs/privacy/1.1.de.md' },
    // Rendered from the source with the names paused; byte for byte what main published from 9 November 2026
    // (compared against the rendering of the release of 13 November 2026 when this archive was made).
    sha256: {
      en: 'f34bb3323a517f142df1e2e96ebd0516f742ca8b2408e7cfa468f529003d1536',
      de: '0d2d7350d865d7a5394eda778497ee7c4b941ef603383bf61fff560631a0f8cf',
    },
  },
  {
    // The release day of 3.1.0 (owner decision 13.11.2026; brought forward from 20.11. after the lawyer's go, 14.11.2026; released 15.11.2026).
    id: '1.2',
    dateIso: '2026-11-15',
    date: { en: '15 November 2026', de: '15.11.2026' },
    recordId: '1.2',
    namesAutomatic: true,
    usageFigures: false,
    workspace: false,
    files: { en: 'docs/privacy/1.2.md', de: 'docs/privacy/1.2.de.md' },
    sha256: {
      en: 'e77e23885f626b27cb3423577a2f51737429dfb5f27313bd831cc0394d2f98b7',
      de: '991fd8c62d2b7ff248d8a390617bd824faff71e310da9bbd1c6d572f6f8b80aa',
    },
  },
  {
    // The version that goes live with 3.2.0: the passages of document 21, approved unchanged by the lawyer (owner,
    // 15.11.2026) — the weekly usage figures (section 9) and further entries of local and session storage (section 7).
    id: '1.3',
    dateIso: '2026-11-16',
    date: { en: '16 November 2026', de: '16.11.2026' },
    recordId: '1.3',
    namesAutomatic: true,
    usageFigures: true,
    workspace: false,
    files: { en: 'docs/privacy/1.3.md', de: 'docs/privacy/1.3.de.md' },
    sha256: {
      en: '94540d9a86de24f2ad06345eb794afedee155ec7eaa215e46e7453cc4806775f',
      de: '79ec79b8c1e63bc0200200a12aae514532b6d7517039e6e4d04c272596e5a2c2',
    },
  },
  {
    // The version that goes live with 3.3.0 (lawyer, statement 20c E4 (a): "1.4 mit 3.3.0: Workspace-Schlüssel, E2,
    // E3"): the two storage entries of My workspace in the wording of document 20, 2.1/2.2 (approved, 20c E1), the
    // sentence on the view (20c E2) and the sentence on the project summary in section 3 (20c E3). No notice mail
    // (20c E5). The date is provisional until the release day is fixed (`PRIVACY_14_DATE_ISO`).
    id: '1.4',
    dateIso: PRIVACY_14_DATE_ISO,
    date: privacyDateOf(PRIVACY_14_DATE_ISO),
    recordId: '1.4',
    namesAutomatic: true,
    usageFigures: true,
    workspace: true,
    files: { en: 'docs/privacy/1.4.md', de: 'docs/privacy/1.4.de.md' },
    sha256: {
      en: 'ea90bc95a20b71adb09dbef6c8ec0e599daed98bc2859298b74318a4b835e004',
      de: '55e8c5be9dd3af604c45891732e25dfabe2b3780a06e990aa0610b33067813c4',
    },
  },
];

export function privacyVersion(id: PrivacyVersionId): PrivacyPolicyVersion {
  const v = PRIVACY_POLICY_VERSIONS.find((x) => x.id === id);
  if (!v) throw new Error(`no privacy policy version ${id}`);
  return v;
}

/** The version a build renders: 1.4 once business names start by themselves, 1.1 before (1.2 and 1.3 stay archived). */
export function privacyVersionFor(namesAutomatic: boolean): PrivacyPolicyVersion {
  return privacyVersion(namesAutomatic ? '1.4' : '1.1');
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

/** What a version changed, said at its top after the version line — from 1.2, in the lawyer's wording. */
const CHANGE_NOTES: Partial<Record<PrivacyVersionId, Record<LegalLang, string>>> = {
  // Legal review, document 19.
  '1.2': {
    de: 'Fachliche Namen der Prozessschritte schlägt wieder automatisch ein Modell vor (Abschnitt 3).',
    en: 'business names of the process steps are again proposed automatically by a model (section 3).',
  },
  // Legal review, document 21, passage 2.1 (approved unchanged).
  '1.3': {
    de: 'Abschnitt 9 beschreibt den wöchentlichen Bericht mit Zahlen zur Nutzung; die Abschnitte 2, 5, 6 und 7 verweisen darauf, und Abschnitt 7 nennt weitere Einträge der lokalen und der Sitzungsspeicherung.',
    en: 'section 9 describes the weekly report with usage figures; sections 2, 5, 6 and 7 refer to it, and section 7 names further entries in local and session storage.',
  },
  // Legal review, document 20, passage 2.4 (the head of the next version), word for word.
  '1.4': {
    de: 'Abschnitt 7 nennt weitere Einträge der lokalen und der Sitzungsspeicherung, darunter die Sicht und die Darstellung von „My workspace“.',
    en: 'section 7 names further entries in local and session storage, among them the view and the layout of My workspace.',
  },
};

/**
 * The head of the policy for a version: its version line and, from 1.2, the change note in the lawyer's wording
 * (legal review, documents 19 and 21) with the real address of the previous version. Version 1.1 keeps the line it
 * was published with.
 */
export function privacyHeadFor(id: PrivacyVersionId, lang: LegalLang): string {
  const note = CHANGE_NOTES[id];
  const prev = previousPrivacyVersion(id);
  if (!note || !prev) return lang === 'de' ? '**Stand:** {{releaseDate}}.' : 'Version of {{releaseDate}}.';
  const v = privacyVersion(id);
  if (lang === 'de') {
    return [
      `**Fassung ${v.id}, Stand ${v.date.de}.**`,
      `Geändert am ${v.date.de}: ${note.de} Die vorige Fassung vom ${prev.date.de} finden Sie unter ${privacyVersionAddress(prev.id, 'de')}.`,
    ].join('\n\n');
  }
  return [
    `Version ${v.id}, as of ${v.date.en}.`,
    `Changed on ${v.date.en}: ${note.en} The previous version of ${prev.date.en} is at ${privacyVersionAddress(prev.id, 'en')}.`,
  ].join('\n\n');
}
