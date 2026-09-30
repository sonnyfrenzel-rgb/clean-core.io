import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import crLatest from '../lib/abap/generated/cloudification-repo.latest.json';
import crPce2023 from '../lib/abap/generated/cloudification-repo.pce-2023-3.json';
import { catalogSnapshotKeyFor } from '../lib/abap/catalog-snapshots';
import {
  PROFILE_INPUT_ID,
  profileManifestInput,
  profileRevision,
  type AssessmentProfile,
} from '../lib/assessment-profile';
import {
  buildAssessmentProfile,
  liveProfileDigest,
  normaliseAssessmentTarget,
  profileDrift,
  recordedProfileOf,
  repositoryObjectsOf,
  runProfileRecord,
  type AssessmentTarget,
} from '../lib/assessment-target';
import {
  CatalogSnapshotNotShipped,
  getCatalogSnapshotRef,
  getSapObjectStates,
  gradeSapObjectUse,
} from '../lib/abap/catalog-service';
import { analysisRunInputs, buildInputManifest, type InputManifest } from '../lib/input-manifest';
import { staleness, handoverBlockers, generationBlockers, previousBasis } from '../lib/workflow-steps';
import { validateProjectCommand } from '../lib/project-commands';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { recordGaps } from '../lib/legacy-project';
import { buildAuditPackContents } from '../lib/audit-pack-build';
import { INPUT_MANIFEST_FILE } from '../lib/audit-pack';
import { computeRunHash, signRunHash, verifyRunIntegrity } from '../lib/run-signature';
import { artefactDigest, sha256Hex, signOffKey } from '../lib/artefact-digest';
import { hydrateProject } from '../lib/project-loader';
import { TERMS_VERSION } from '../lib/constants';
import type { Project } from '../lib/types';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 7.10 — "Zielprofil als Eingabe" (CR-02), wired through the five
 * stations: analysis, catalog lookup, result, decision, receipt.
 *
 * `tests/assessment-profile.spec.ts` holds the model. This file holds the
 * wiring, one test per sentence of the roadmap line, each one red without the
 * change it names:
 *
 *   - *nicht abgedeckte Profile werden sichtbar abgelehnt oder als unbestätigt
 *     geführt* — an on-premise target is a 422 with a sentence, where the route
 *     used to coerce it to a signed Public-Cloud run; a Private-Edition run is
 *     signed as `unconfirmed` with the reason;
 *   - *ein Profilwechsel ändert den Subject-Hash und entwertet abhängige
 *     Freigaben* — the same source under a second profile writes the change
 *     record that makes the sign-off stale, and a sign-off on a run whose
 *     profile is no longer the project's is a 409;
 *   - *ein Latest-Eintrag ersetzt keinen älteren Release-Snapshot still* — a
 *     lookup that names `pce-2023-3` is refused, never answered from `latest`;
 *   - and the old runs: a run signed before 7.10 verifies as it was sealed and
 *     is labelled, not reinterpreted.
 */

const SOURCE = [
  'REPORT z_profile_wiring.',
  'CLASS lcl_helper DEFINITION.',
  'ENDCLASS.',
  'CLASS zcl_profile_wiring DEFINITION PUBLIC.',
  'ENDCLASS.',
  'SELECT SINGLE * FROM kna1 INTO @DATA(ls_kna1) WHERE kunnr = @p_kunnr.',
].join('\n');

const SNAPSHOT = { registryKey: 'latest', sourceSha256: 'b'.repeat(64) };
const EMPTY: AssessmentTarget = { release: '', components: [], languageVersions: [] };
const DECLARED: AssessmentTarget = {
  release: '2508',
  components: [],
  languageVersions: [
    { object: 'ZCL_PROFILE_WIRING', languageVersion: 'cloud' },
    { object: 'Z_PROFILE_WIRING', languageVersion: 'standard' },
  ],
};

/** A Private Edition 2023 FPS03 target, every object's language version stated. */
const PCE_2023: AssessmentTarget = { ...DECLARED, release: '2023 FPS03' };

const profileFor = (edition: string, target: AssessmentTarget = DECLARED): AssessmentProfile =>
  buildAssessmentProfile({
    edition,
    target,
    objects: ['Z_PROFILE_WIRING', 'ZCL_PROFILE_WIRING'],
    catalogSnapshot: SNAPSHOT,
    ruleVersion: 'rules-v1.0',
  });

/* ================================================= station 1: the input */

test.describe('7.10 station 1 — the declaration and the profile built from it', () => {
  test('a declaration is read with a closed vocabulary and no separators', () => {
    const ok = normaliseAssessmentTarget({ release: ' 2023  FPS02 ', languageVersions: [{ object: 'zcl_a', languageVersion: 'cloud' }] });
    expect(ok).toEqual({
      ok: true,
      target: { release: '2023 FPS02', components: [], languageVersions: [{ object: 'ZCL_A', languageVersion: 'cloud' }] },
    });
    // A separator of the canonical form would let one declaration forge another.
    expect(normaliseAssessmentTarget({ release: '2508|edition=public' }).ok).toBe(false);
    expect(normaliseAssessmentTarget({ languageVersions: [{ object: 'ZCL_A', languageVersion: 'modern' }] }).ok).toBe(false);
    expect(normaliseAssessmentTarget({ languageVersions: [{ object: 'ZCL_A', languageVersion: 'cloud' }, { object: 'zcl_a', languageVersion: 'standard' }] }).ok).toBe(false);
    expect(normaliseAssessmentTarget(undefined)).toEqual({ ok: true, target: EMPTY });
  });

  test('every object the source defines has a language version, and an undeclared one is unknown — never standard', () => {
    const objects = repositoryObjectsOf([
      { objectName: 'Z_PROFILE_WIRING', type: 'Report' },
      { objectName: 'LCL_HELPER', type: 'Class' },
      { objectName: 'ZCL_PROFILE_WIRING', type: 'Class' },
      { objectName: 'F_SUB', type: 'Form Routine' },
    ]);
    expect(objects).toEqual(['ZCL_PROFILE_WIRING', 'Z_PROFILE_WIRING']);
    const p = buildAssessmentProfile({
      edition: 'public',
      target: { ...EMPTY, languageVersions: [{ object: 'Z_ELSEWHERE', languageVersion: 'cloud' }] },
      objects,
      catalogSnapshot: SNAPSHOT,
      ruleVersion: 'rules-v1.0',
    });
    expect(p.languageVersions).toEqual([
      { object: 'ZCL_PROFILE_WIRING', languageVersion: 'unknown' },
      { object: 'Z_PROFILE_WIRING', languageVersion: 'unknown' },
    ]);
  });

  test('the same source under two profiles is two subjects, and each says what it may claim (G0)', () => {
    const src = sha256Hex(SOURCE);
    const pub = runProfileRecord(profileFor('public'), src);
    const priv = runProfileRecord(profileFor('private'), src);
    expect(pub.assessmentSubject).not.toBe(priv.assessmentSubject);
    expect(profileManifestInput(pub.assessmentProfile).sha256).not.toBe(profileManifestInput(priv.assessmentProfile).sha256);
    // Public, release named, every object declared, read from the Public list: covered.
    expect(pub.profileCoverage).toEqual({ state: 'covered', gaps: [] });
    // Private, read from the same Public list: unconfirmed, and it says why.
    expect(priv.profileCoverage.state).toBe('unconfirmed');
    expect(priv.profileCoverage.gaps.map((g) => g.code)).toEqual(['snapshot-substituted', 'snapshot-unpinned']);
    expect(profileRevision(priv.assessmentProfile).startsWith('unconfirmed:private@2508/latest#rules-v1.0+')).toBe(true);
    // Nothing declared: covered, with a note per open fact - never unconfirmed,
    // never assumed (decision Sonny, 30.09.2026).
    const open = runProfileRecord(profileFor('public', EMPTY), src).profileCoverage;
    expect(open.state).toBe('covered');
    expect(open.gaps.map((g) => `${g.code}:${g.severity}`)).toEqual([
      'language-version-unknown:notes',
      'language-version-unknown:notes',
      'release-not-named:notes',
    ]);
  });
});

/* ========================================== station 2: the catalog lookup */

test.describe('7.10 station 2 — the snapshot is an argument, and latest never answers for another', () => {
  test('the snapshot the engine reads is named by key and digest', () => {
    expect(getCatalogSnapshotRef()).toEqual({
      registryKey: (crLatest as { meta: { release: string } }).meta.release,
      sourceSha256: (crLatest as { meta: { sourceSha256: string } }).meta.sourceSha256,
    });
  });

  test('a lookup that names a snapshot this build does not ship is refused, not answered from latest', () => {
    expect(() => gradeSapObjectUse('KNA1', 'read', 'btp-latest')).toThrow(CatalogSnapshotNotShipped);
    expect(() => gradeSapObjectUse('KNA1', 'read', 'pce-2022-2')).toThrow(CatalogSnapshotNotShipped);
    // The shipped key answers exactly what the unnamed lookup answers.
    expect(gradeSapObjectUse('KNA1', 'read', 'latest')).toEqual(gradeSapObjectUse('KNA1', 'read'));
  });

  test('a pinned Private Edition snapshot answers from its own file, not from latest', () => {
    const pce = (crPce2023 as { meta: { release: string; sourceSha256: string }; entries: Record<string, { state: string }> });
    const pub = (crLatest as { entries: Record<string, { state: string }> }).entries;
    // An object whose state SAP publishes differently for 2023 FPS03 and for the Public list.
    const differing = Object.keys(pce.entries).find((k) => pub[k] && pub[k].state !== pce.entries[k].state);
    expect(differing, 'no object differs between the two files').toBeTruthy();
    expect(getSapObjectStates(differing!, 'pce-2023-3').releaseState).toBe(pce.entries[differing!].state);
    expect(getSapObjectStates(differing!).releaseState).toBe(pub[differing!].state);
    expect(getCatalogSnapshotRef('pce-2023-3')).toEqual({ registryKey: 'pce-2023-3', sourceSha256: pce.meta.sourceSha256 });
  });

  test('a target reads the pinned file for its release, the edition list otherwise', () => {
    expect(catalogSnapshotKeyFor('private', '2023 FPS03')).toBe('pce-2023-3');
    expect(catalogSnapshotKeyFor('private', 'PCE-2025-1')).toBe('pce-2025-1');
    expect(catalogSnapshotKeyFor('private', '')).toBe('pce-latest');
    // No pinned file for 2022: the moving list is read - and the profile says so.
    expect(catalogSnapshotKeyFor('private', '2022 FPS02')).toBe('pce-latest');
    expect(catalogSnapshotKeyFor('public', '2508')).toBe('latest');
    const p = buildAssessmentProfile({
      edition: 'private',
      target: { ...DECLARED, release: '2022 FPS02' },
      objects: ['Z_PROFILE_WIRING', 'ZCL_PROFILE_WIRING'],
      catalogSnapshot: getCatalogSnapshotRef('pce-latest'),
      ruleVersion: 'rules-v1.0',
    });
    expect(runProfileRecord(p, 'x').profileCoverage).toMatchObject({ state: 'unconfirmed' });
    expect(runProfileRecord(p, 'x').profileCoverage.gaps.map((g) => g.code)).toEqual(['snapshot-unpinned']);
  });

  test('a Private-Edition profile that names a release is not covered by the moving latest list', () => {
    const p = profileFor('private', { ...DECLARED, release: 'PCE-2023-3' });
    expect(runProfileRecord(p, 'x').profileCoverage.gaps.map((g) => g.code)).toContain('snapshot-unpinned');
  });
});

/* ======================================= station 4: decision and approval */

/** A hydrated project on a run that recorded `profile`. */
function projectOn(profile: AssessmentProfile | null, extra: Partial<Project> = {}): Project {
  const src = sha256Hex(SOURCE);
  const inputs = analysisRunInputs({
    sourceSha256: src,
    deploymentTarget: profile?.edition ?? 'private',
    catalogVersion: 'c',
    rulesetVersion: 'rules-v1.0',
    engineVersion: 'e',
    model: null,
  });
  const manifest: InputManifest = buildInputManifest(profile ? [...inputs, profileManifestInput(profile)] : inputs);
  return {
    id: 'p',
    name: 'p',
    userId: 'u',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    s4Deployment: (profile?.edition ?? 'private') as 'public' | 'private',
    assessmentTarget: DECLARED,
    inputManifest: manifest,
    auditMetadata: { inputFingerprint: { sha256: src } } as Project['auditMetadata'],
    ...(profile ? runProfileRecord(profile, src) : {}),
    ...extra,
  } as unknown as Project;
}

test.describe('7.10 station 4 — a profile change invalidates what depended on it', () => {
  test('the live profile equals the recorded one until the project moves', () => {
    const recorded = profileFor('private');
    const project = projectOn(recorded);
    expect(profileDrift({ project, recorded })).toBeNull();
    expect(liveProfileDigest({ project, recorded })).toBe(profileManifestInput(recorded).sha256);

    const moved = { ...project, assessmentTarget: { ...DECLARED, release: '2023 FPS02' } };
    expect(profileDrift({ project: moved, recorded })).toMatchObject({ recorded: profileRevision(recorded) });
    // A resync of the catalog is a different snapshot, and so a different profile.
    expect(profileDrift({ project, recorded, catalogSnapshot: { registryKey: 'latest', sourceSha256: 'c'.repeat(64) } })).not.toBeNull();
  });

  test('the sign-off reads stale and the handover waits when the profile moved', () => {
    const recorded = profileFor('private');
    const signed = projectOn(recorded, { approvedByArchitect: true, architectSignOffAt: '2026-09-30T10:00:00.000Z' });
    expect(staleness(signed).signOff).toBe(false);
    expect(staleness(signed).unverifiedInputs).toEqual([]);

    const moved = { ...signed, s4Deployment: 'public' as const };
    const s = staleness(moved);
    expect(s.unverifiedInputs.map((u) => u.id)).toContain(PROFILE_INPUT_ID);
    expect(s.signOff, 'a sign-off under one profile read as current under another').toBe(true);
    expect(handoverBlockers(moved).join(' ')).toContain('the target profile');
  });

  test('what went stale after a profile change says "target profile", not "source"', () => {
    const recorded = profileFor('private');
    const design = '# Target';
    const withRecord = (reason?: 'profile') =>
      projectOn(recorded, {
        solutionDesign: design,
        auditMetadata: {
          inputFingerprint: { sha256: sha256Hex(SOURCE) },
          sourceChange: {
            at: '2026-09-30T10:00:00.000Z', runId: 'run-1', previousSha256: sha256Hex(SOURCE),
            artefacts: { solutionDesign: artefactDigest('solutionDesign', design)! },
            ...(reason ? { reason } : {}),
          },
        } as Project['auditMetadata'],
      });
    const afterProfile = withRecord('profile');
    expect(staleness(afterProfile)).toMatchObject({ design: true, basis: 'profile' });
    expect(generationBlockers(afterProfile, 'transformation').join(' ')).toContain('generated for a previous target profile');
    expect(previousBasis(afterProfile)).toBe('a previous target profile');
    // A record without the reason is what a source change has always written.
    expect(generationBlockers(withRecord(), 'transformation').join(' ')).toContain('generated for a previous source');
  });

  test('the sign-off command refuses a run assessed under another profile — 409, nothing written', () => {
    const run = { runHash: 'a'.repeat(64), inputFingerprint: { sha256: sha256Hex(SOURCE), lineCount: 6 } };
    const digest = evidenceDigest(run);
    const body = { command: 'approve-architecture', targetArchitecture: 'rap', expectedRunId: 'run-1', expectedEvidenceDigest: digest };
    const actor = { email: 'o@example.com', now: '2026-09-30T10:00:00.000Z' };
    const base = { activeRunId: 'run-1', activeRunEvidence: digest, originalRecommendation: 'In-App (ABAP Cloud)' };
    expect(validateProjectCommand(body, { ...base, profileDrift: null }, actor).ok).toBe(true);
    const refused = validateProjectCommand(body, { ...base, profileDrift: { recorded: 'private@2508/x', now: 'public@2508/x' } }, actor);
    expect(refused).toMatchObject({ ok: false, status: 409, code: 'profile-changed' });
    // The decision takes the same binding.
    const confirm = validateProjectCommand(
      { command: 'confirm-decision', expectedDecisionFingerprint: 'f', expectedRunId: 'run-1', expectedEvidenceDigest: digest },
      { ...base, profileDrift: { recorded: 'a', now: 'b' } },
      actor,
    );
    expect(confirm).toMatchObject({ ok: false, status: 409, code: 'profile-changed' });
  });
});

/* ====================================== old runs: labelled, not reinterpreted */

test.describe('7.10 — runs signed before the profile existed', () => {
  test('are labelled, and their deployment is compared as it always was — no profile is invented for them', () => {
    const old = projectOn(null);
    expect(recordedProfileOf(old)).toBeNull();
    expect(recordGaps(old).map((g) => g.form)).toContain('run-before-profile');
    // Not "not recorded, therefore unverified": nothing about a profile is asked of it.
    expect(staleness(old).unverifiedInputs).toEqual([]);
    expect(recordGaps(projectOn(profileFor('public'))).map((g) => g.form)).not.toContain('run-before-profile');
  });

  test('a run document sealed before 7.10 still verifies; a run with a profile verifies and the profile is inside the signature', () => {
    const key = 'k'.repeat(64);
    const seal = (run: Record<string, unknown>) => {
      const runHash = computeRunHash(run);
      return { ...run, runHash, signature: signRunHash(runHash, key) };
    };
    const before710 = seal({ runId: 'r0', status: 'completed', inputFingerprint: { sha256: sha256Hex(SOURCE) }, rulesetVersion: 'rules-v1.0' });
    expect(verifyRunIntegrity(before710, key)).toEqual({ valid: true });

    const withProfile = seal({ runId: 'r1', status: 'completed', ...runProfileRecord(profileFor('private'), sha256Hex(SOURCE)) });
    expect(verifyRunIntegrity(withProfile, key)).toEqual({ valid: true });
    const tampered = JSON.parse(JSON.stringify(withProfile));
    tampered.assessmentProfile.edition = 'public';
    expect(verifyRunIntegrity(tampered, key).valid).toBe(false);
  });
});

/* ============================================== station 5: the receipt */

test.describe('7.10 station 5 — the signed pack carries the profile, and no grade', () => {
  const src = sha256Hex(SOURCE);
  test('a run with a profile: recorded, the claim, every reason as a sentence', () => {
    const record = runProfileRecord(profileFor('private'), src);
    const { signed } = buildAuditPackContents({ projectId: 'p', runId: 'r', run: { ...record }, attested: {} });
    const doc = JSON.parse(signed[INPUT_MANIFEST_FILE]);
    expect(doc.targetProfile.recorded).toBe(true);
    expect(doc.targetProfile.claim).toBe('unconfirmed');
    expect(doc.targetProfile.subject).toBe(record.assessmentSubject);
    expect(doc.targetProfile.reasons.map((r: { code: string }) => r.code)).toEqual(['snapshot-substituted', 'snapshot-unpinned']);
    // CLAUDE.md: the A–D level is never part of the signed audit pack.
    for (const text of Object.values(signed)) expect(text).not.toMatch(/"(grade|objectGrade|cloudView|classicView)"/);
  });

  test('a run without one says so rather than being given one', () => {
    const { signed } = buildAuditPackContents({ projectId: 'p', runId: 'r', run: {}, attested: {} });
    const doc = JSON.parse(signed[INPUT_MANIFEST_FILE]);
    expect(doc.targetProfile).toMatchObject({ recorded: false });
    expect(doc.targetProfile.profile).toBeUndefined();
  });
});

/* ======================================================= against the server */

test.describe('7.10 — the routes', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const EMAIL = `profile-wiring-${stamp}@cleancore-test.io`;
  const PASSWORD = 'ProfileWiring123!';
  const PROJECT_ID = `p-profile-wiring-${stamp}`;
  let token = '';
  let uid = '';
  let db: Firestore;
  const node256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const read = async (p: string) => (await db.doc(p).get()).data()!;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
    db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const clientAuth = getAuth(app);
    try {
      connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    uid = cred.user.uid;
    await db.doc(`users/${uid}`).set({
      firstName: 'Profile', lastName: 'Wiring', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await db.doc(`projects/${PROJECT_ID}`).set({
      name: 'Profile wiring', userId: uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE,
    });
  });

  test('an edition nothing can be assessed against is refused with the reason — never coerced to Public', async ({ request }) => {
    for (const edition of ['on-premise', 'btp', 'hybrid']) {
      const res = await request.post('/api/runs/create', {
        headers: auth(),
        data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: edition, analysis: '{}', uploadedFileName: 'z.abap' },
      });
      expect(res.status(), `${edition} was assessed`).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('profile-rejected');
      expect(body.error).toContain('No assessment is made');
    }
    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.activeRunId, 'a refused profile wrote a run').toBeUndefined();
  });

  let publicRunId = '';
  test('a covered profile is signed with the run, and the snapshot is the one the build reads', async ({ request }) => {
    const res = await request.post('/api/runs/create', {
      headers: auth(),
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'public', targetProfile: DECLARED, analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const out = await res.json();
    publicRunId = out.runId;
    expect(out.profileCoverage).toEqual({ state: 'covered', gaps: [] });

    const run = await read(`projects/${PROJECT_ID}/runs/${publicRunId}`);
    expect(run.assessmentProfile.catalogSnapshot).toEqual(getCatalogSnapshotRef());
    expect(run.assessmentProfile.languageVersions).toEqual([
      { object: 'ZCL_PROFILE_WIRING', languageVersion: 'cloud' },
      { object: 'Z_PROFILE_WIRING', languageVersion: 'standard' },
    ]);
    const entry = run.inputManifest.inputs.find((i: { id: string }) => i.id === PROFILE_INPUT_ID);
    expect(entry.revision.startsWith('public@2508/latest#rules-v1.0+')).toBe(true);
    expect(entry.dataClass).toBe('source-artefact');
    expect(verifyRunIntegrity(run, process.env.AUDIT_SIGNING_KEY!)).toEqual({ valid: true });
    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.assessmentTarget).toEqual(DECLARED);
    expect(project.auditMetadata.assessmentSubject).toBe(run.assessmentSubject);
  });

  test('the same source under another profile is a new subject, and the standing sign-off goes stale', async ({ request }) => {
    const signOffAt = '2026-09-30T09:00:00.000Z';
    await db.doc(`projects/${PROJECT_ID}`).update({ approvedByArchitect: true, architectSignOffAt: signOffAt, targetArchitecture: 'rap' });

    const res = await request.post('/api/runs/create', {
      headers: auth(),
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'private', targetProfile: PCE_2023, analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const { runId } = await res.json();
    const run = await read(`projects/${PROJECT_ID}/runs/${runId}`);
    const before = await read(`projects/${PROJECT_ID}/runs/${publicRunId}`);
    expect(run.assessmentSubject).not.toBe(before.assessmentSubject);
    expect(run.inputFingerprint.sha256).toBe(before.inputFingerprint.sha256);
    // A Private Edition 2023 FPS03 target is read against SAP's pinned file for it: covered.
    expect(run.assessmentProfile.catalogSnapshot).toEqual(getCatalogSnapshotRef('pce-2023-3'));
    expect(run.profileCoverage).toEqual({ state: 'covered', gaps: [] });

    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.auditMetadata.sourceChange, 'a profile change left the sign-off reading as current').toBeTruthy();
    expect(project.auditMetadata.sourceChange.reason).toBe('profile');
    expect(project.auditMetadata.sourceChange.previousSubject).toBe(before.assessmentSubject);
    expect(project.auditMetadata.sourceChange.signOff).toBe(signOffKey(signOffAt));
    const hydrated = hydrateProject(PROJECT_ID, project as Project, { kind: 'found', data: run });
    expect(staleness(hydrated).signOff).toBe(true);
  });

  test('a Private Edition release SAP publishes no pinned list for is signed as unconfirmed, and says why', async ({ request }) => {
    const other = `${PROJECT_ID}-2022`;
    await db.doc(`projects/${other}`).set({ name: 'Profile wiring 2022', userId: uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE });
    const res = await request.post('/api/runs/create', {
      headers: auth(),
      data: { projectId: other, legacyCode: SOURCE, s4Deployment: 'private', targetProfile: { ...PCE_2023, release: '2022 FPS02' }, analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const { runId } = await res.json();
    const run = await read(`projects/${other}/runs/${runId}`);
    expect(run.assessmentProfile.catalogSnapshot.registryKey).toBe('pce-latest');
    expect(run.profileCoverage.state).toBe('unconfirmed');
    expect(run.profileCoverage.gaps.map((g: { code: string }) => g.code)).toEqual(['snapshot-unpinned']);
    const entry = run.inputManifest.inputs.find((i: { id: string }) => i.id === PROFILE_INPUT_ID);
    expect(entry.revision.startsWith('unconfirmed:private@2022 FPS02/pce-latest#')).toBe(true);
  });

  test('a sign-off on a run whose profile the project no longer stands on is a 409, and nothing is written', async ({ request }) => {
    const project = await read(`projects/${PROJECT_ID}`);
    const run = await read(`projects/${PROJECT_ID}/runs/${project.activeRunId}`);
    // The owner's client may write `s4Deployment` (firestore.rules allowlist).
    await db.doc(`projects/${PROJECT_ID}`).update({ s4Deployment: 'public', approvedByArchitect: false });
    const approve = () =>
      request.post(`/api/projects/${PROJECT_ID}/commands`, {
        headers: { ...auth(), 'Content-Type': 'application/json' },
        data: {
          command: 'approve-architecture',
          targetArchitecture: 'rap',
          expectedRunId: project.activeRunId,
          expectedEvidenceDigest: evidenceDigest(run),
        },
      });
    const refused = await approve();
    expect(refused.status()).toBe(409);
    const body = await refused.json();
    expect(body.code).toBe('profile-changed');
    expect(body.error).toContain(profileRevision(run.assessmentProfile));
    expect((await read(`projects/${PROJECT_ID}`)).approvedByArchitect).toBe(false);

    // The pack waits for the same reason.
    const pack = await request.post('/api/audit-pack/create', { headers: auth(), data: { projectId: PROJECT_ID } });
    expect(pack.status()).toBe(409);
    expect(JSON.stringify(await pack.json())).toContain('the target profile');

    // Back on the run's profile, the same sign-off is recorded.
    await db.doc(`projects/${PROJECT_ID}`).update({ s4Deployment: 'private' });
    const accepted = await approve();
    expect(accepted.status()).toBe(200);
  });

  test('the signed pack of a profiled run carries it, and still verifies', async ({ request }) => {
    const res = await request.post('/api/audit-pack/create', { headers: auth(), data: { projectId: PROJECT_ID } });
    expect(res.status()).toBe(200);
    const zip = await JSZip.loadAsync(await res.body());
    const text = await zip.file(INPUT_MANIFEST_FILE)!.async('string');
    const doc = JSON.parse(text);
    expect(doc.targetProfile).toMatchObject({ recorded: true, claim: 'confirmed', coverage: 'covered', reasons: [], notes: [] });
    expect(doc.targetProfile.profile.catalogSnapshot.registryKey).toBe('pce-2023-3');
    expect(doc.inputs.map((i: { id: string }) => i.id)).toContain(PROFILE_INPUT_ID);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.files.find((f: { path: string }) => f.path === INPUT_MANIFEST_FILE).sha256).toBe(node256(text));
  });

  test('the analyze stage shows the profile the run signed and the snapshot that answered', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.waitForURL(/dashboard/, { timeout: 60_000 }).catch(() => {});
    await page.goto(`/project/${PROJECT_ID}/analyze`);
    const card = page.locator('[data-assessment-profile]').first();
    await expect(card).toHaveAttribute('data-assessment-profile', 'covered', { timeout: 60_000 });
    await expect(card.locator('[data-profile-line]')).toContainText('private @ 2023 FPS03 · catalog pce-2023-3@');
    // Everything was stated: no note, no unconfirmed reason.
    await expect(card.locator('[data-profile-note]')).toHaveCount(0);
    await expect(card.locator('[data-profile-gap]')).toHaveCount(0);
  });

  test('the lookup names its snapshot, refuses one it does not ship and a target it cannot answer for', async ({ request }) => {
    const post = (data: Record<string, unknown>) => request.post('/api/abcd-classify', { headers: auth(), data });
    const plain = await post({ objects: [{ name: 'KNA1', use: 'read' }] });
    expect(plain.status()).toBe(200);
    expect((await plain.json()).snapshot).toEqual(getCatalogSnapshotRef());

    const unshipped = await post({ objects: ['KNA1'], snapshot: 'btp-latest' });
    expect(unshipped.status()).toBe(422);
    const unshippedBody = await unshipped.json();
    expect(unshippedBody.code).toBe('snapshot-not-shipped');
    expect(unshippedBody.grades).toBeUndefined();

    const pinned = await post({ objects: ['KNA1'], snapshot: 'pce-2023-3' });
    expect(pinned.status()).toBe(200);
    expect((await pinned.json()).snapshot.registryKey).toBe('pce-2023-3');

    const priv = await post({ objects: ['KNA1'], profile: { edition: 'private', release: 'PCE-2023-3' } });
    expect(priv.status()).toBe(200);
    const privBody = await priv.json();
    expect(privBody.snapshot.registryKey).toBe('pce-2023-3');
    expect(privBody.coverage.state).toBe('covered');

    const unpublished = await post({ objects: ['KNA1'], profile: { edition: 'private', release: '2022 FPS02' } });
    const unpublishedBody = await unpublished.json();
    expect(unpublishedBody.snapshot.registryKey).toBe('pce-latest');
    expect(unpublishedBody.coverage.state).toBe('unconfirmed');
    expect(unpublishedBody.coverage.gaps.map((g: { code: string }) => g.code)).toEqual(['snapshot-unpinned']);

    const onPrem = await post({ objects: ['KNA1'], profile: { edition: 'on-premise' } });
    expect(onPrem.status()).toBe(422);
    const onPremBody = await onPrem.json();
    expect(onPremBody.code).toBe('profile-rejected');
    expect(onPremBody.grades).toBeUndefined();
  });
});
