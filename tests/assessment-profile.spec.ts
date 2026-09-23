import { test, expect } from '@playwright/test';
import { readdirSync } from 'fs';
import path from 'path';
import {
  EDITIONS,
  EDITION_CATALOG_KEY,
  PROFILE_INPUT_ID,
  PROFILE_VERSION,
  SHIPPED_CATALOG_SNAPSHOTS,
  assessmentAllowed,
  assessmentSubjectHash,
  canonicalAssessmentProfile,
  profileCoverage,
  profileFingerprint,
  profileManifestInput,
  profileRevision,
  resultConfidence,
  type AssessmentProfile,
} from '../lib/assessment-profile';
import {
  analysisRunInputs,
  buildInputManifest,
  invalidatingInputs,
  unverifiedInputs,
} from '../lib/input-manifest';

/**
 * Roadmap 7.10 — "Zielprofil als Eingabe" (CR-02).
 *
 * *"Edition, Sprachversion je Objekt, Release-/Komponentenstand,
 * Katalogsnapshot und Regelversion als versioniertes `AssessmentProfile` …
 * nicht abgedeckte Profile werden sichtbar abgelehnt oder als unbestätigt
 * geführt; ein Profilwechsel ändert den Subject-Hash und entwertet abhängige
 * Freigaben; ein Latest-Eintrag ersetzt keinen älteren Release-Snapshot still."*
 *
 * Pure: no browser, no emulator, no server. The module is a plain function set
 * so that exactly this suite can drive every branch of it.
 */

/**
 * The public-cloud profile the platform can actually answer for today: SAP
 * publishes one moving release list for it and no pinned ones, so `latest` is
 * not a substitute here — the digest is what identifies it.
 */
const COVERED: AssessmentProfile = {
  profileVersion: PROFILE_VERSION,
  edition: 'public',
  release: 'SAP-Cloud-ERP-2508',
  components: [],
  catalogSnapshot: { registryKey: 'latest', sourceSha256: 'a'.repeat(64) },
  ruleVersion: 'rules-v1.0',
  languageVersions: [],
};

const clone = (p: AssessmentProfile): AssessmentProfile => JSON.parse(JSON.stringify(p));

test.describe('7.10 — the fingerprint is stable', () => {
  test('the same facts in a different order are the same profile', () => {
    const a: AssessmentProfile = {
      ...clone(COVERED),
      components: [
        { component: 'SAP_APPL', level: '618 SP 12' },
        { component: 'SAP_BASIS', level: '758 SP 03' },
      ],
      languageVersions: [
        { object: 'ZCL_ORDER', languageVersion: 'cloud' },
        { object: 'ZCL_APPROVAL', languageVersion: 'standard' },
      ],
    };

    // Same values, reversed lists, and the object keys written in another order.
    const b: AssessmentProfile = {
      languageVersions: [
        { object: 'ZCL_APPROVAL', languageVersion: 'standard' },
        { object: 'ZCL_ORDER', languageVersion: 'cloud' },
      ],
      ruleVersion: a.ruleVersion,
      catalogSnapshot: a.catalogSnapshot,
      components: [
        { component: 'SAP_BASIS', level: '758 SP 03' },
        { component: 'SAP_APPL', level: '618 SP 12' },
      ],
      release: a.release,
      edition: a.edition,
      profileVersion: a.profileVersion,
    };

    expect(canonicalAssessmentProfile(b)).toBe(canonicalAssessmentProfile(a));
    expect(profileFingerprint(b)).toBe(profileFingerprint(a));
  });

  test('object name case is not a second profile', () => {
    const upper = { ...clone(COVERED), languageVersions: [{ object: 'ZCL_X', languageVersion: 'cloud' as const }] };
    const lower = { ...clone(COVERED), languageVersions: [{ object: 'zcl_x', languageVersion: 'cloud' as const }] };
    expect(profileFingerprint(lower)).toBe(profileFingerprint(upper));
  });

  test('every field that enters the verdict changes the fingerprint', () => {
    const base = profileFingerprint(COVERED);
    const variants: Array<[string, AssessmentProfile]> = [
      ['edition', { ...clone(COVERED), edition: 'private' }],
      ['release', { ...clone(COVERED), release: 'SAP-Cloud-ERP-2502' }],
      ['ruleVersion', { ...clone(COVERED), ruleVersion: 'rules-v1.1' }],
      [
        'catalog snapshot digest',
        { ...clone(COVERED), catalogSnapshot: { registryKey: 'latest', sourceSha256: 'b'.repeat(64) } },
      ],
      [
        'catalog registry key',
        { ...clone(COVERED), catalogSnapshot: { registryKey: 'classifications-sap', sourceSha256: 'a'.repeat(64) } },
      ],
      ['components', { ...clone(COVERED), components: [{ component: 'SAP_APPL', level: '618 SP 12' }] }],
      [
        'language version of one object',
        { ...clone(COVERED), languageVersions: [{ object: 'ZCL_X', languageVersion: 'cloud' }] },
      ],
    ];
    for (const [what, variant] of variants) {
      expect(profileFingerprint(variant), `${what} must change the fingerprint`).not.toBe(base);
    }

    // And one object's language version differing is a different profile from
    // another object's — the list is not collapsed to a set of values.
    const one = { ...clone(COVERED), languageVersions: [{ object: 'ZCL_A', languageVersion: 'cloud' as const }] };
    const other = { ...clone(COVERED), languageVersions: [{ object: 'ZCL_B', languageVersion: 'cloud' as const }] };
    expect(profileFingerprint(other)).not.toBe(profileFingerprint(one));
  });
});

test.describe('7.10 — a profile we do not cover is not treated like one we do', () => {
  test('the covered profile is covered and says nothing further', () => {
    const coverage = profileCoverage(COVERED);
    expect(coverage.state).toBe('covered');
    expect(coverage.gaps).toEqual([]);
    expect(coverage.sentence).toBe('');
    expect(resultConfidence(COVERED)).toBe('confirmed');
    expect(assessmentAllowed(COVERED)).toBe(true);
  });

  test('an edition with no SAP catalog file is refused, not graded', () => {
    const onPrem: AssessmentProfile = { ...clone(COVERED), edition: 'on-premise' };
    const coverage = profileCoverage(onPrem);
    expect(coverage.state).toBe('rejected');
    expect(coverage.gaps.map((g) => g.code)).toContain('edition-not-covered');
    expect(assessmentAllowed(onPrem)).toBe(false);
    // Structural, not tonal: it cannot become a signed input at all.
    expect(() => profileManifestInput(onPrem)).toThrow(/must not become a signed input/);
  });

  test('an unknown edition, an unshipped snapshot, a missing digest and a missing rule version all refuse', () => {
    const cases: Array<[string, AssessmentProfile]> = [
      ['unknown edition', { ...clone(COVERED), edition: 'hana-cloud' as unknown as AssessmentProfile['edition'] }],
      [
        'unshipped snapshot',
        { ...clone(COVERED), catalogSnapshot: { registryKey: 'pce-2023-3', sourceSha256: 'a'.repeat(64) } },
      ],
      ['no snapshot digest', { ...clone(COVERED), catalogSnapshot: { registryKey: 'latest', sourceSha256: '' } }],
      ['no rule version', { ...clone(COVERED), ruleVersion: '' }],
    ];
    for (const [what, profile] of cases) {
      expect(profileCoverage(profile).state, what).toBe('rejected');
      expect(() => profileManifestInput(profile), what).toThrow();
    }
  });

  test('a missing release is unconfirmed, not refused', () => {
    const noRelease: AssessmentProfile = { ...clone(COVERED), release: '' };
    const coverage = profileCoverage(noRelease);
    expect(coverage.state).toBe('unconfirmed');
    expect(coverage.gaps.map((g) => g.code)).toEqual(['release-not-named']);
    expect(resultConfidence(noRelease)).toBe('unconfirmed');
    expect(assessmentAllowed(noRelease)).toBe(true);
    expect(coverage.sentence).not.toBe('');
  });

  test('an unknown ABAP language version is carried, never defaulted to Standard ABAP', () => {
    const unknown: AssessmentProfile = {
      ...clone(COVERED),
      languageVersions: [
        { object: 'ZCL_KNOWN', languageVersion: 'cloud' },
        { object: 'ZCL_MYSTERY', languageVersion: 'unknown' },
      ],
    };
    const coverage = profileCoverage(unknown);
    expect(coverage.state).toBe('unconfirmed');
    const gap = coverage.gaps.find((g) => g.code === 'language-version-unknown');
    expect(gap?.subject).toBe('ZCL_MYSTERY');
    expect(gap?.sentence).toContain('not assumed to be Standard ABAP');

    // And it is a different profile from the one that claims to know.
    const guessed: AssessmentProfile = {
      ...clone(unknown),
      languageVersions: [
        { object: 'ZCL_KNOWN', languageVersion: 'cloud' },
        { object: 'ZCL_MYSTERY', languageVersion: 'standard' },
      ],
    };
    expect(profileFingerprint(guessed)).not.toBe(profileFingerprint(unknown));
    expect(profileCoverage(guessed).state).toBe('covered');
  });

  test('unconfirmed reaches the signed manifest as unconfirmed', () => {
    const substituted: AssessmentProfile = { ...clone(COVERED), edition: 'private' };
    expect(profileCoverage(substituted).state).toBe('unconfirmed');

    const entry = profileManifestInput(substituted);
    expect(entry.id).toBe(PROFILE_INPUT_ID);
    expect(entry.revision.startsWith('unconfirmed:')).toBe(true);
    // The signed entry is a different one from the confirmed profile's, so a
    // reader comparing revisions sees the difference without reading this module.
    expect(entry.sha256).not.toBe(profileManifestInput(COVERED).sha256);
    expect(profileRevision(COVERED).startsWith('unconfirmed:')).toBe(false);
  });

  test('the same profile always reports its gaps in the same order', () => {
    // A reader compares two coverage reports; a list that reorders itself makes
    // an unchanged profile look changed.
    const many: AssessmentProfile = {
      ...clone(COVERED),
      edition: 'private',
      release: 'PCE-2023-3',
      languageVersions: [
        { object: 'ZCL_B', languageVersion: 'unknown' },
        { object: 'ZCL_A', languageVersion: 'unknown' },
      ],
    };
    const reordered: AssessmentProfile = {
      ...clone(many),
      languageVersions: [
        { object: 'ZCL_A', languageVersion: 'unknown' },
        { object: 'ZCL_B', languageVersion: 'unknown' },
      ],
    };
    const codes = profileCoverage(many).gaps.map((g) => `${g.code}/${g.subject ?? ''}`);
    expect(codes).toEqual([
      'language-version-unknown/ZCL_A',
      'language-version-unknown/ZCL_B',
      'snapshot-substituted/The private edition\'s verdicts come from the "pce-latest" catalog; this profile was assessed against "latest".',
      'snapshot-unpinned/latest',
    ]);
    expect(profileCoverage(reordered).gaps.map((g) => `${g.code}/${g.subject ?? ''}`)).toEqual(codes);
    expect(profileCoverage(many).sentence).toBe(profileCoverage(reordered).sentence);
  });

  test('refused and unconfirmed are two states, not two wordings of one', () => {
    const refused = profileCoverage({ ...clone(COVERED), edition: 'on-premise' });
    const unconfirmed = profileCoverage({ ...clone(COVERED), edition: 'private' });
    expect(refused.state).not.toBe(unconfirmed.state);
    expect(refused.gaps.every((g) => g.severity === 'rejects' || g.severity === 'unconfirms')).toBe(true);
    expect(refused.gaps.some((g) => g.severity === 'rejects')).toBe(true);
    expect(unconfirmed.gaps.some((g) => g.severity === 'rejects')).toBe(false);
    // One may be signed, the other may not. That is the difference that matters.
    expect(() => profileManifestInput({ ...clone(COVERED), edition: 'on-premise' })).toThrow();
    expect(() => profileManifestInput({ ...clone(COVERED), edition: 'private' })).not.toThrow();
  });
});

test.describe('7.10 — a latest entry does not stand in for a release snapshot', () => {
  test('a named Private-Edition release read from a moving entry is unconfirmed', () => {
    // `pce-2023-3` exists in the registry, so `pce-latest` is a substitute for
    // it — and, today, even that is not what was read.
    const pinned: AssessmentProfile = {
      ...clone(COVERED),
      edition: 'private',
      release: 'PCE-2023-3',
      catalogSnapshot: { registryKey: 'latest', sourceSha256: 'a'.repeat(64) },
    };
    const coverage = profileCoverage(pinned);
    expect(coverage.state).toBe('unconfirmed');
    const gap = coverage.gaps.find((g) => g.code === 'snapshot-unpinned');
    expect(gap?.subject).toBe('latest');
    expect(gap?.sentence).toContain('does not stand in for one');
  });

  test('the Public Edition has no pinned snapshot to be substituted for', () => {
    // SAP publishes one moving list for SAP Cloud ERP. Calling it unpinned
    // would be a complaint about SAP's publication, not about this profile.
    expect(profileCoverage(COVERED).gaps.map((g) => g.code)).not.toContain('snapshot-unpinned');
  });

  test('a private-edition profile assessed against the public catalog says so', () => {
    const priv: AssessmentProfile = { ...clone(COVERED), edition: 'private' };
    const gap = profileCoverage(priv).gaps.find((g) => g.code === 'snapshot-substituted');
    expect(gap).toBeTruthy();
    expect(gap?.sentence).toContain('"pce-latest"');
    expect(gap?.sentence).toContain('"latest"');
  });

  test('the shipped snapshot list is the one on disk', () => {
    const dir = path.resolve(__dirname, '../lib/abap/generated');
    const onDisk = readdirSync(dir)
      .filter((f) => f.startsWith('cloudification-repo.') && f.endsWith('.json'))
      .map((f) => f.slice('cloudification-repo.'.length, -'.json'.length))
      .sort();
    expect(onDisk).toEqual([...SHIPPED_CATALOG_SNAPSHOTS].sort());
  });

  test('every edition names the catalog its verdicts would come from', () => {
    for (const edition of EDITIONS) {
      expect(Object.prototype.hasOwnProperty.call(EDITION_CATALOG_KEY, edition), edition).toBe(true);
    }
  });
});

test.describe('7.10 — a profile change invalidates what depended on it', () => {
  const SOURCE_SHA = 'c'.repeat(64);

  const manifestFor = (profile: AssessmentProfile) =>
    buildInputManifest([
      ...analysisRunInputs({
        sourceSha256: SOURCE_SHA,
        deploymentTarget: 'public',
        catalogVersion: '2024.FPS02 + CR:latest@aaaaaaaa',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.16.0',
        model: null,
      }),
      profileManifestInput(profile),
    ]);

  test('the subject hash is the source under a profile, not the source', () => {
    const other: AssessmentProfile = { ...clone(COVERED), edition: 'private' };
    const a = assessmentSubjectHash({ sourceSha256: SOURCE_SHA, profile: COVERED });
    const b = assessmentSubjectHash({ sourceSha256: SOURCE_SHA, profile: other });
    expect(b).not.toBe(a);
    // Same code, same profile, same subject — a re-analysis is not a new subject.
    expect(assessmentSubjectHash({ sourceSha256: SOURCE_SHA, profile: clone(COVERED) })).toBe(a);
    // And the source still matters.
    expect(assessmentSubjectHash({ sourceSha256: 'd'.repeat(64), profile: COVERED })).not.toBe(a);
  });

  test('the profile is a recorded input, and changing it moves the manifest hash', () => {
    const before = manifestFor(COVERED);
    expect(before.inputs.map((i) => i.id)).toContain(PROFILE_INPUT_ID);

    const after = manifestFor({ ...clone(COVERED), edition: 'private' });
    expect(after.hash).not.toBe(before.hash);
    // Same rule as every other input: a changed input set is a new revision.
    expect(buildInputManifest(after.inputs, before).revision).toBe(before.revision + 1);
    expect(buildInputManifest(before.inputs, before).revision).toBe(before.revision);
  });

  test('a profile change comes back as an invalidating divergence, not a note', () => {
    const signed = manifestFor(COVERED);
    const now = profileManifestInput({ ...clone(COVERED), edition: 'private' });

    const unverified = unverifiedInputs(signed, { [PROFILE_INPUT_ID]: now.sha256 });
    expect(unverified).toEqual([
      { id: PROFILE_INPUT_ID, dataClass: 'source-artefact', reason: 'differs' },
    ]);
    // `source-artefact`, so it survives the filter that drops engine and model
    // version drift — which is what makes the dependent approvals stale.
    expect(invalidatingInputs(unverified)).toEqual(unverified);
  });

  test('a run that recorded no profile cannot be shown to have used this one', () => {
    const withoutProfile = buildInputManifest(
      analysisRunInputs({
        sourceSha256: SOURCE_SHA,
        deploymentTarget: 'public',
        catalogVersion: '2024.FPS02 + CR:latest@aaaaaaaa',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.16.0',
        model: null,
      }),
    );
    const unverified = unverifiedInputs(withoutProfile, {
      [PROFILE_INPUT_ID]: profileManifestInput(COVERED).sha256,
    });
    expect(unverified).toEqual([{ id: PROFILE_INPUT_ID, dataClass: 'unknown', reason: 'not-recorded' }]);
    expect(invalidatingInputs(unverified)).toEqual(unverified);
  });
});
