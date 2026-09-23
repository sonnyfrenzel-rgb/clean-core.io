/**
 * The target profile an assessment is made *against* — edition, release and
 * component level, the ABAP language version each object is written in, the
 * catalog snapshot that was looked up and the rule version that graded it.
 *
 * Roadmap 7.10 (`docs/ROADMAP.md` §Phase 7, CR-02): *"Edition, Sprachversion je
 * Objekt, Release-/Komponentenstand, Katalogsnapshot und Regelversion als
 * versioniertes `AssessmentProfile` … nicht abgedeckte Profile werden sichtbar
 * abgelehnt oder als unbestätigt geführt; ein Profilwechsel ändert den
 * Subject-Hash und entwertet abhängige Freigaben; ein Latest-Eintrag ersetzt
 * keinen älteren Release-Snapshot still."*
 *
 * Why this is a module and not a field: today the target is a single string,
 * `project.s4Deployment` (`lib/types.ts:90`, `'public' | 'private'`), and the
 * only release artifact the engine ships is the **public** `latest` file
 * (`lib/abap/catalog-service.ts:37`). A private-edition project is therefore
 * graded against a public-cloud release list, and nothing anywhere says so. The
 * same B object is *Keep* in the Private Edition and *Rebuild* in the Public
 * Edition — so the target is an input to the verdict, not a preference, and an
 * input that is not recorded is an input nobody can check.
 *
 * Three things this file is responsible for and nothing else:
 *
 *   1. the shape and its version (`PROFILE_VERSION`),
 *   2. a stable fingerprint over the fields, and
 *   3. the rule that decides whether a profile is covered, carried as
 *      unconfirmed, or refused outright.
 *
 * It does not wire the profile through analysis, lookup, result, decision and
 * receipt — that is the follow-up step. What it does provide is the one seam
 * for it: `profileManifestInput()` turns a profile into an entry of the signed
 * input manifest, so the invalidation that `lib/input-manifest.ts` and
 * `staleness()` (`lib/workflow-steps.ts:219`) already perform applies to a
 * profile change without a second mechanism being invented.
 *
 * No React, no Firestore, no `crypto` — `lib/run-signature.ts` solved canonical
 * JSON already, but it sits behind `node:crypto` and so cannot be read in the
 * browser. This file follows `canonicalInputManifest` instead, for the reason
 * stated there: a line format has to agree about a separator, a JSON
 * canonicaliser has to agree about key order, numbers and absent values across
 * two runtimes.
 */

import { sha256Hex } from './artefact-digest';
import { referenceDigest, type ManifestInput } from './input-manifest';

/**
 * Format of the profile record. Bumped only when the canonical form changes —
 * a new optional field that does not enter `canonicalAssessmentProfile` does
 * not get a new version, and a field that does, does.
 */
export const PROFILE_VERSION = 1;

/** The stack an assessment is made against. Not a preference — it moves verdicts. */
export const EDITIONS = ['public', 'private', 'btp', 'on-premise'] as const;
export type Edition = (typeof EDITIONS)[number];

/**
 * The ABAP language version an object is written in — per object, because one
 * custom package regularly mixes them: a report in Standard ABAP calling a
 * class restricted to ABAP for Cloud Development is exactly the case the
 * verdict turns on.
 *
 * `unknown` is a value, not an absence. A profile that does not know an
 * object's language version says so and is carried as unconfirmed; it is never
 * silently defaulted to `standard`, which would be the most permissive answer
 * and therefore the wrong one to guess.
 */
export const LANGUAGE_VERSIONS = ['standard', 'cloud', 'key-user', 'unknown'] as const;
export type AbapLanguageVersion = (typeof LANGUAGE_VERSIONS)[number];

export interface ObjectLanguageVersion {
  /** Object name, upper case — the key the catalog is looked up by. */
  object: string;
  languageVersion: AbapLanguageVersion;
}

/** A software component and the level it is on, e.g. `SAP_APPL` at `618 SP 12`. */
export interface ComponentLevel {
  component: string;
  level: string;
}

/**
 * Which generated catalog artifact the lookup read.
 *
 * `registryKey` is a key of `RELEASE_FILES` (`lib/abap/cloudification-repo.ts:83`);
 * `sourceSha256` is the digest of the raw SAP file the artifact was normalized
 * from (`meta.sourceSha256` of the generated JSON). The key alone is not an
 * identity: `latest` is a moving target, and two syncs of `latest` a month
 * apart are two different catalogs under one name. The digest is what makes it
 * a snapshot.
 */
export interface CatalogSnapshotRef {
  registryKey: string;
  sourceSha256: string;
}

export interface AssessmentProfile {
  profileVersion: typeof PROFILE_VERSION;
  edition: Edition;
  /** The release the target is on, e.g. `S4HANA-2023-FPS02` or `PCE-2025-1`. Never a date. */
  release: string;
  /** Component levels, sorted by component in the canonical form. May be empty. */
  components: ComponentLevel[];
  catalogSnapshot: CatalogSnapshotRef;
  /** The rule version the grades were derived under, e.g. `rules-v1.0`. */
  ruleVersion: string;
  /** Per-object language versions, sorted by object in the canonical form. May be empty. */
  languageVersions: ObjectLanguageVersion[];
}

/* ---------- what this platform can actually answer for ---------- */

/**
 * The generated catalog artifacts this build ships, by registry key.
 *
 * Deliberately a literal rather than a directory read: this module has to load
 * in the browser, and `lib/abap/generated/*.json` is ~4 MB. A spec compares the
 * literal against the files on disk, so it cannot drift silently — which is the
 * failure mode a `latest`-only build already has, one layer down.
 */
export const SHIPPED_CATALOG_SNAPSHOTS: ReadonlySet<string> = new Set([
  'latest',
  'classifications-sap',
]);

/** The registry key each edition's verdicts would have to come from. */
export const EDITION_CATALOG_KEY: Readonly<Record<Edition, string | null>> = {
  public: 'latest',
  private: 'pce-latest',
  btp: 'btp-latest',
  // SAP publishes no cloudification repository file for classic on-premise.
  'on-premise': null,
};

/**
 * Editions for which SAP publishes release-pinned files, so that a moving entry
 * is a substitute for one rather than the only thing there is.
 *
 * `RELEASE_FILES` (`lib/abap/cloudification-repo.ts:83`) lists
 * `pce-2025-1`, `pce-2025-0` and `pce-2023-3` beside `pce-latest`, and nothing
 * of the kind beside `latest` or `btp-latest`. So for the Private Edition a
 * named release has a snapshot of its own and `pce-latest` does not stand in
 * for it; for the Public Edition and BTP the moving list is the list, and
 * calling it unpinned would be a complaint about SAP's publication, not about
 * this profile. The digest in `CatalogSnapshotRef` is what identifies it.
 */
export const RELEASE_PINNED_EDITIONS: ReadonlySet<Edition> = new Set<Edition>(['private']);

/* ---------- canonical form and fingerprint ---------- */

/**
 * Canonical form: one segment per fact, fixed order, sorted lists, no
 * whitespace. Field order in the object is irrelevant; the order of
 * `components` and `languageVersions` is irrelevant; every value is not.
 *
 *   v<n>|edition=<e>|release=<r>|catalog=<key>@<sha>|rule=<v>
 *   |components=<c>:<l>,…|languages=<obj>:<lv>,…
 */
export function canonicalAssessmentProfile(profile: AssessmentProfile): string {
  const components = [...(profile.components || [])]
    .map((c) => `${c.component}:${c.level}`)
    .sort()
    .join(',');
  const languages = [...(profile.languageVersions || [])]
    .map((l) => `${(l.object || '').toUpperCase()}:${l.languageVersion}`)
    .sort()
    .join(',');
  return [
    `v${profile.profileVersion}`,
    `edition=${profile.edition}`,
    `release=${profile.release}`,
    `catalog=${profile.catalogSnapshot.registryKey}@${profile.catalogSnapshot.sourceSha256}`,
    `rule=${profile.ruleVersion}`,
    `components=${components}`,
    `languages=${languages}`,
  ].join('|');
}

/** SHA-256 over the canonical form, lowercase hex. Same fields, same value, any order. */
export function profileFingerprint(profile: AssessmentProfile): string {
  return sha256Hex(canonicalAssessmentProfile(profile));
}

/**
 * The hash of what was assessed: the source **under a profile**.
 *
 * The subject of an assessment has never been the code alone. The same ABAP
 * against the Public Edition and against the Private Edition is two different
 * questions with two different answers, so it has to be two different subjects
 * — otherwise a profile change looks like the same assessment and every
 * approval given under the old profile keeps reading as current.
 *
 * A one-way function of both, so a changed profile cannot produce the previous
 * subject hash. See `profileManifestInput` for how the change reaches the
 * existing invalidation path.
 */
export function assessmentSubjectHash(args: {
  sourceSha256: string;
  profile: AssessmentProfile;
}): string {
  return sha256Hex(
    `subject:v1|source=${args.sourceSha256}|profile=${profileFingerprint(args.profile)}`,
  );
}

/* ---------- covered, unconfirmed, refused ---------- */

export const PROFILE_GAP_CODES = [
  /** The edition is not one of `EDITIONS`. */
  'unknown-edition',
  /** No catalog artifact exists for this edition at all — nothing can be looked up. */
  'edition-not-covered',
  /** The named snapshot is not one this build ships. */
  'snapshot-not-shipped',
  /** No catalog snapshot digest — the lookup cannot be pinned to anything. */
  'snapshot-unidentified',
  /** No rule version — the grade cannot say what produced it. */
  'rule-version-missing',
  /** No release named — a release-dependent verdict has no release. */
  'release-not-named',
  /** The snapshot read is not the one this edition's verdicts come from. */
  'snapshot-substituted',
  /** A moving `latest` entry stands where a release-pinned snapshot belongs. */
  'snapshot-unpinned',
  /** An object's ABAP language version is not established. */
  'language-version-unknown',
] as const;
export type ProfileGapCode = (typeof PROFILE_GAP_CODES)[number];

/**
 * What a gap does. Two severities, and they are not two shades of the same
 * thing:
 *
 *   - `rejects` — no assessment may be produced under this profile. The profile
 *     cannot become a signed input at all (`profileManifestInput` throws).
 *   - `unconfirms` — an assessment may be produced, but it is carried as
 *     unconfirmed everywhere, including inside the signed manifest, whose
 *     revision string then begins with `unconfirmed:`.
 */
export type ProfileGapSeverity = 'rejects' | 'unconfirms';

export interface ProfileGap {
  code: ProfileGapCode;
  severity: ProfileGapSeverity;
  /** The object or value the gap is about, where it is about one. */
  subject: string | null;
  /** Plain sentence, no hedging — what is not covered and what follows from it. */
  sentence: string;
}

export type ProfileCoverageState = 'covered' | 'unconfirmed' | 'rejected';

export interface ProfileCoverage {
  state: ProfileCoverageState;
  /** Sorted by code, then subject — same profile, same list, same order. */
  gaps: ProfileGap[];
  /** One sentence for the reader. Empty string when the profile is covered. */
  sentence: string;
}

const SENTENCES: Record<ProfileGapCode, (subject: string | null) => string> = {
  'unknown-edition': (s) =>
    `"${s}" is not an edition this platform knows. No assessment is made under it.`,
  'edition-not-covered': (s) =>
    `SAP publishes no cloudification repository file for the ${s} edition, so there is nothing to look an object up in. No assessment is made under it.`,
  'snapshot-not-shipped': (s) =>
    `This build does not ship the catalog snapshot "${s}". No assessment is made against it.`,
  'snapshot-unidentified': () =>
    'The catalog snapshot carries no source digest, so the lookup cannot be tied to a specific catalog. No assessment is made against it.',
  'rule-version-missing': () =>
    'No rule version is named, so a grade could not say what produced it. No assessment is made.',
  'release-not-named': () =>
    'No release is named. Whether an object is released is release-dependent, so the result is carried as unconfirmed.',
  'snapshot-substituted': (s) => `${s} The result is carried as unconfirmed.`,
  'snapshot-unpinned': (s) =>
    `The catalog snapshot "${s}" is a moving entry and not the release-pinned snapshot this profile names. It does not stand in for one; the result is carried as unconfirmed.`,
  'language-version-unknown': (s) =>
    `The ABAP language version of ${s} is not established. It is not assumed to be Standard ABAP; the result is carried as unconfirmed.`,
};

function gap(code: ProfileGapCode, severity: ProfileGapSeverity, subject: string | null): ProfileGap {
  return { code, severity, subject, sentence: SENTENCES[code](subject) };
}

/** A registry key that names no release of its own — `latest`, `pce-latest`, `btp-latest`. */
function isMovingKey(key: string): boolean {
  return key === 'latest' || key.endsWith('-latest');
}

/**
 * Roadmap 7.10, in one function: **a profile we do not cover is never treated
 * like one we do.**
 *
 * The arrangement matters. It does not ask whether anything positively proves
 * the profile unsupported and, finding nothing, call it covered — that is the
 * heuristic `lib/input-manifest.ts` replaced one layer up. It names every fact
 * the verdict depends on and requires each one to be present and to be the one
 * we actually read.
 */
export function profileCoverage(profile: AssessmentProfile | null | undefined): ProfileCoverage {
  if (!profile) {
    const only = gap('unknown-edition', 'rejects', String(profile));
    return { state: 'rejected', gaps: [only], sentence: only.sentence };
  }

  const gaps: ProfileGap[] = [];
  const edition = profile.edition;
  const known = (EDITIONS as readonly string[]).includes(edition);

  if (!known) {
    gaps.push(gap('unknown-edition', 'rejects', String(edition)));
  } else if (EDITION_CATALOG_KEY[edition] === null) {
    gaps.push(gap('edition-not-covered', 'rejects', edition));
  }

  const snapshot = profile.catalogSnapshot;
  const key = snapshot?.registryKey || '';
  const sha = snapshot?.sourceSha256 || '';

  if (!key || !SHIPPED_CATALOG_SNAPSHOTS.has(key)) {
    gaps.push(gap('snapshot-not-shipped', 'rejects', key || '(none)'));
  }
  if (!sha) {
    gaps.push(gap('snapshot-unidentified', 'rejects', null));
  }
  if (!profile.ruleVersion) {
    gaps.push(gap('rule-version-missing', 'rejects', null));
  }

  if (!profile.release) {
    gaps.push(gap('release-not-named', 'unconfirms', null));
  }

  // The substitution that is happening today and says nothing: a private-edition
  // project graded against the public `latest` file. Named, not tolerated.
  const expected = known ? EDITION_CATALOG_KEY[edition] : null;
  if (expected && key && SHIPPED_CATALOG_SNAPSHOTS.has(key) && key !== expected) {
    gaps.push(
      gap(
        'snapshot-substituted',
        'unconfirms',
        `The ${edition} edition's verdicts come from the "${expected}" catalog; this profile was assessed against "${key}".`,
      ),
    );
  }

  // "Ein Latest-Eintrag ersetzt keinen älteren Release-Snapshot still": the
  // profile names a release, a snapshot for that release exists, and the one
  // that was read is the moving entry instead.
  if (key && isMovingKey(key) && profile.release && known && RELEASE_PINNED_EDITIONS.has(edition)) {
    gaps.push(gap('snapshot-unpinned', 'unconfirms', key));
  }

  for (const entry of profile.languageVersions || []) {
    if (entry.languageVersion === 'unknown') {
      gaps.push(gap('language-version-unknown', 'unconfirms', (entry.object || '').toUpperCase()));
    }
  }

  gaps.sort(
    (a, b) => a.code.localeCompare(b.code) || (a.subject || '').localeCompare(b.subject || ''),
  );

  const state: ProfileCoverageState = gaps.some((g) => g.severity === 'rejects')
    ? 'rejected'
    : gaps.length > 0
      ? 'unconfirmed'
      : 'covered';

  const relevant = state === 'rejected' ? gaps.filter((g) => g.severity === 'rejects') : gaps;
  return { state, gaps, sentence: relevant.map((g) => g.sentence).join(' ') };
}

/**
 * Whether an assessment may be produced under this profile at all.
 *
 * A separate function rather than a string comparison at each call site, so
 * that "rejected" cannot be softened into a badge by whoever renders it.
 */
export function assessmentAllowed(profile: AssessmentProfile | null | undefined): boolean {
  return profileCoverage(profile).state !== 'rejected';
}

/**
 * What a result produced under this profile may claim about itself. Never
 * `confirmed` unless every fact the verdict depends on is present and is the
 * one that was read.
 */
export function resultConfidence(
  profile: AssessmentProfile | null | undefined,
): 'confirmed' | 'unconfirmed' {
  return profileCoverage(profile).state === 'covered' ? 'confirmed' : 'unconfirmed';
}

/* ---------- the seam into the signed input manifest ---------- */

/** The input id the profile occupies in `lib/input-manifest.ts`'s manifest. */
export const PROFILE_INPUT_ID = 'profile:assessment';

/**
 * The revision string a manifest records for this profile.
 *
 * Unconfirmed coverage is part of the revision, exactly as `lib/input-manifest.ts`
 * records `unattested` for a narrative whose model was not established: the
 * manifest sits inside the run signature, so a profile we could not fully
 * confirm must not be signed as though we had. A reader comparing revisions
 * sees the difference without having to know this module.
 */
export function profileRevision(profile: AssessmentProfile): string {
  const fp = profileFingerprint(profile).slice(0, 12);
  const core = `${profile.edition}@${profile.release || 'no-release'}/${profile.catalogSnapshot?.registryKey || 'no-catalog'}#${profile.ruleVersion || 'no-rule'}+${fp}`;
  return resultConfidence(profile) === 'confirmed' ? core : `unconfirmed:${core}`;
}

/**
 * The profile as an entry of the signed input manifest — the whole invalidation
 * path, and it is the path that already exists.
 *
 * `dataClass: 'source-artefact'`, because the profile is what the evidence was
 * computed *against*, not something derived alongside it. That single word is
 * what makes a profile change invalidating: `invalidatingInputs()` keeps
 * source-artefact divergences and drops derivations, `staleness()` feeds the
 * result into `unverifiedInputs`, and `handoverBlockers()` and
 * `generationBlockers()` then refuse the architecture sign-off, the generated
 * code and the audit pack. Nothing new had to be built for that; what was
 * missing was the entry.
 *
 * `binding: 'reference'` for the same reason the catalog is a reference: the
 * run holds the profile by name and revision. Its hash says which profile was
 * bound, never that a 4 MB catalog was read byte for byte.
 *
 * Throws on a rejected profile. A refusal that can still be signed is not a
 * refusal — it is a note in a record that attests to the opposite.
 */
export function profileManifestInput(profile: AssessmentProfile): ManifestInput {
  const coverage = profileCoverage(profile);
  if (coverage.state === 'rejected') {
    throw new Error(
      `An assessment profile that is not covered must not become a signed input: ${coverage.sentence}`,
    );
  }
  const revision = profileRevision(profile);
  return {
    id: PROFILE_INPUT_ID,
    dataClass: 'source-artefact',
    revision,
    binding: 'reference',
    sha256: referenceDigest(PROFILE_INPUT_ID, revision),
  };
}
