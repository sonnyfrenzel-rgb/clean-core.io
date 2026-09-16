import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash, createHmac } from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { staleness, handoverBlockers, generationBlockers, workflowSteps } from '../lib/workflow-steps';
import {
  INPUT_IDS,
  analysisRunInputs,
  buildInputManifest,
  invalidatingInputs,
  unverifiedInputs,
} from '../lib/input-manifest';
import { recomputeStoredRunHash } from '../lib/run-signature';
import type { Project, TestCase } from '../lib/types';

/**
 * Roadmap 0.6 — "Konservative Ungültigkeit statt Frischeheuristik".
 *
 * Work package `docs/roadmap/SCHNITT-0-UMFANG.md` §7 (`UX-E07-F03:R0`):
 * *"Ein altes Ergebnis bleibt an seine Eingaben gebunden — blockieren oder
 * quarantänisieren statt still aktualisieren"*, delivered as *"Manifestvergleich
 * statt Frischeheuristik"*. Acceptance: W22-A06 (*"Neue Analyse trifft nach
 * Quellenänderung ein — Ergebnis bleibt an alte Eingabe gebunden; kein stilles
 * Überschreiben des aktuellen Stands"*) and QA24-A13 (*"Berechtigung oder Quelle
 * während Job ändern — kein still aktuelles Ergebnis aus altem Auftrag"*).
 *
 * The heuristic being replaced asked whether anything positively proved a result
 * old, and called it current when nothing did: a recorded digest that still
 * matched meant stale, and every other case — no record, an unreadable
 * fingerprint, an input nobody ever compared — meant fresh. The rule here asks
 * the other question. Of the inputs the signed run recorded, which can still be
 * shown to be the inputs that are there? Anything else is invalid.
 */

const node256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const SOURCE_A = 'REPORT z_a.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
const CASES: TestCase[] = [{ id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' }];

const MANIFEST = buildInputManifest(
  analysisRunInputs({
    sourceSha256: node256(SOURCE_A),
    deploymentTarget: 'public',
    catalogVersion: '2024.FPS02 + CR:latest@e3b0c442',
    rulesetVersion: 'rules-v1.0',
    engineVersion: '2.11.0',
    model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', byokUsed: false },
  }),
);

/** A project with a signed run, everything built, and the run's inputs recorded. */
function analysed(over: Partial<Project> = {}): Project {
  return {
    name: 'p',
    legacyCode: SOURCE_A,
    s4Deployment: 'public',
    activeRunId: 'run-a',
    solutionDesign: 'design for A',
    generatedCode: 'code for A',
    documentation: 'docs for A',
    testCases: CASES,
    inputManifest: MANIFEST,
    auditMetadata: {
      inputFingerprint: { sha256: node256(SOURCE_A), fileName: 'z', lineCount: 2, byteSize: 1, uploadedAt: '', objectType: 'Report' },
      inputManifest: MANIFEST,
    },
    ...over,
  } as Project;
}

test.describe('the contract', () => {
  test('inputs that still match block nothing — the checks below are not vacuous', () => {
    const p = analysed();
    expect(staleness(p).unverifiedInputs).toEqual([]);
    expect(handoverBlockers(p)).toEqual([]);
    expect(generationBlockers(p, 'transformation')).toEqual([]);
    expect(workflowSteps(p)[0]).toMatchObject({ key: 'analyze', state: 'done' });
  });

  test('an input that changed without a new run invalidates the result', () => {
    // `s4Deployment` is in the client update allowlist of `firestore.rules`, and
    // it decides the routing — so flipping it makes every finding a statement
    // about a different target. The source digest is untouched, which is exactly
    // why the old comparison saw nothing at all here.
    const p = analysed({ s4Deployment: 'private' });
    expect(staleness(p).sourceChanged, 'the source is unchanged — the old check is silent').toBe(false);
    expect(staleness(p).unverifiedInputs).toEqual([
      { id: INPUT_IDS.deployment, dataClass: 'source-artefact', reason: 'differs' },
    ]);
    expect(handoverBlockers(p)).toEqual([
      'the analysis (the target deployment cannot be shown to be what the signed run used)',
    ]);
    expect(generationBlockers(p, 'transformation')).toEqual([
      "The signed run's inputs cannot all be shown to still match — the target deployment. Re-run the analysis in stage 1 first.",
    ]);
    expect(workflowSteps(p)[0]).toMatchObject({ key: 'analyze', state: 'stale', badge: 'Inputs changed' });
    expect(workflowSteps(p)[5]).toMatchObject({ key: 'tco', state: 'stale' });
  });

  test('an input the reader cannot read is invalid, not current', () => {
    // A source that is gone, or blank, used to leave every check inert: the
    // source comparison needs both ends readable and fell through to "fresh".
    const p = analysed({ legacyCode: '   ' });
    expect(staleness(p).sourceChanged, 'nothing to compare, so the old check says fine').toBe(false);
    expect(staleness(p).unverifiedInputs).toEqual([
      { id: INPUT_IDS.source, dataClass: 'source-artefact', reason: 'not-readable' },
    ]);
    expect(handoverBlockers(p)).toEqual([
      'the analysis (the analysed source cannot be shown to be what the signed run used)',
    ]);
  });

  test('an input the run never recorded is invalid too', () => {
    // A manifest that lists five of the six. Nothing says the sixth still
    // matches, so nothing may claim it does.
    const partial = buildInputManifest(MANIFEST.inputs.filter((i) => i.id !== INPUT_IDS.deployment));
    const p = analysed({ inputManifest: partial, auditMetadata: { ...analysed().auditMetadata, inputManifest: partial } });
    expect(staleness(p).unverifiedInputs).toEqual([
      { id: INPUT_IDS.deployment, dataClass: 'unknown', reason: 'not-recorded' },
    ]);
    expect(handoverBlockers(p).length).toBe(1);
  });

  test('both at once are named, both at once', () => {
    const p = analysed({ legacyCode: 'REPORT z_other.\n', s4Deployment: 'private' });
    expect(staleness(p).unverifiedInputs.map((u) => u.id)).toEqual([INPUT_IDS.source, INPUT_IDS.deployment]);
    // The source moved as well, so the older, narrower message leads — it says
    // the more specific thing and the same button is disabled either way.
    expect(handoverBlockers(p)[0]).toBe('the analysis (the source changed after the signed run)');
  });

  test('a newer engine is reported, not treated as invalidation', () => {
    // The evidence was not computed from the engine's version string. If a
    // release invalidated every project on the platform, the rule would be
    // noise rather than a signal — so the class decides, and `derivation` does
    // not block. It is still reported: the divergence is a fact.
    const reported = unverifiedInputs(MANIFEST, { [INPUT_IDS.engine]: node256('a different build') });
    expect(reported).toEqual([{ id: INPUT_IDS.engine, dataClass: 'derivation', reason: 'differs' }]);
    expect(invalidatingInputs(reported)).toEqual([]);

    const bothKinds = unverifiedInputs(MANIFEST, {
      [INPUT_IDS.engine]: node256('a different build'),
      [INPUT_IDS.catalog]: node256('a different catalog'),
    });
    expect(invalidatingInputs(bothKinds).map((u) => u.id)).toEqual([INPUT_IDS.catalog]);
  });

  test('a run signed before the manifest existed is left exactly as it was (C23-A02)', () => {
    // Nothing was recorded, so nothing can be compared, and this step does not
    // retroactively invalidate what predates it. The migration clause of the
    // work package — IDs, hashes and signature states are preserved — outranks
    // the temptation to declare every old project unverified on sight.
    const p = analysed();
    delete p.inputManifest;
    delete p.auditMetadata!.inputManifest;
    expect(staleness(p).unverifiedInputs).toEqual([]);
    expect(handoverBlockers(p)).toEqual([]);
  });

  test('the project mirror is used when the run was not hydrated onto the project', () => {
    // The dashboard reads bare project documents; `loadProjectAndHydrate` spreads
    // the run. Both paths have to reach the same verdict.
    const p = analysed({ s4Deployment: 'private' });
    delete p.inputManifest;
    expect(staleness(p).unverifiedInputs.map((u) => u.id)).toEqual([INPUT_IDS.deployment]);
  });
});

// ── Server side: the pack is refused, and the run route does not overwrite ──

test.describe('server side', () => {
  test.describe.configure({ mode: 'serial' });

  const EMAIL = `conservative-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'Conservative123!';
  const PROJECT_ID = `p-conservative-${Date.now()}`;
  const LEGACY_PROJECT_ID = `p-conservative-legacy-${Date.now()}`;
  let token = '';
  let uid = '';
  let db: Firestore;

  const pack = (request: APIRequestContext, projectId = PROJECT_ID) =>
    request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId },
    });

  test.beforeAll(async () => {
    const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
    db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    uid = cred.user.uid;
    await db.doc(`users/${uid}`).set({
      firstName: 'Conservative', lastName: 'Invalidity', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await db.doc(`projects/${PROJECT_ID}`).set({
      name: 'Conservative invalidity fixture', userId: uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE_A,
    });
  });

  test('a fresh run exports — the refusals below are not the default answer', async ({ request }) => {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: SOURCE_A, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    expect((await pack(request)).status()).toBe(200);
  });

  test('an input changed after the run: the signed pack is refused', async ({ request }) => {
    // Written straight to the document, which is what `firestore.rules` lets the
    // owner do from the browser. The route compares against the run's manifest,
    // so it does not matter who wrote it.
    await db.doc(`projects/${PROJECT_ID}`).update({ s4Deployment: 'private' });
    const res = await pack(request);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.blockers).toEqual(['inputs-unverified']);
    expect(body.error).toContain('the target deployment (differs)');
  });

  test('putting the input back lifts it', async ({ request }) => {
    await db.doc(`projects/${PROJECT_ID}`).update({ s4Deployment: 'public' });
    expect((await pack(request)).status()).toBe(200);
  });

  test('a run signed before 0.5 still exports (C23-A02)', async ({ request }) => {
    // The whole migration promise in one case: a run document with no input
    // manifest, its own hash and HMAC intact, exports exactly as it did.
    const runId = 'run-legacy-1';
    await db.doc(`projects/${LEGACY_PROJECT_ID}`).set({
      name: 'Pre-0.5 project', userId: uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: SOURCE_A, s4Deployment: 'public', activeRunId: runId,
      auditMetadata: {
        inputFingerprint: {
          sha256: node256(SOURCE_A), fileName: 'z.abap', lineCount: 2, byteSize: 60,
          uploadedAt: new Date().toISOString(), objectType: 'Report',
        },
      },
    });
    const unsigned = {
      runId, projectId: LEGACY_PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed',
      inputFingerprint: { sha256: node256(SOURCE_A), fileName: 'z.abap', lineCount: 2, byteSize: 60, objectType: 'Report' },
      analyzerVersion: '2.9.0', rulesetVersion: 'rules-v1.0', sapApiCatalogVersion: '2024.FPS02',
      model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.9.0', byokUsed: false },
      extensibilityRoute: 'rap', cleanCoreScore: 71, complexityScore: 40, criticalityScore: 55,
      evidenceReport: [], dataCoupling: [], codeInventory: [], worklist: [],
    };
    const runHash = recomputeStoredRunHash(unsigned);
    const signature = createHmac('sha256', process.env.AUDIT_SIGNING_KEY!).update(runHash).digest('hex');
    await db.doc(`projects/${LEGACY_PROJECT_ID}/runs/${runId}`).set({ ...unsigned, analysis: '{}', runHash, signature });

    const res = await pack(request, LEGACY_PROJECT_ID);
    expect(res.status(), await res.text()).toBe(200);
  });

  test('a late result does not overwrite the source that moved under it (W22-A06)', async ({ request }) => {
    // The acceptance case, as it happens: an analysis starts on one source and
    // commits after the project has moved to another. The route used to write
    // the source it had read at the start, together with `activeRunId`, so the
    // newer source and the reader's edit were replaced by the older result and
    // nothing said so. The commit is now bound to the source the route read: if
    // it moved, nothing is written.
    const RACE_ID = `p-conservative-race-${Date.now()}`;
    const EARLIER = `REPORT z_race_${Date.now()}.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n`;
    const LATER = 'REPORT z_later.\nSELECT * FROM vbap INTO TABLE @DATA(lt).\n';
    const fingerprint = node256(EARLIER);
    await db.doc(`projects/${RACE_ID}`).set({
      name: 'Late result fixture', userId: uid, createdAt: new Date(), status: 'uploaded', legacyCode: EARLIER,
    });

    const inFlight = request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: RACE_ID, legacyCode: EARLIER, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });

    // Not a sleep: the route reserves the quota unit for this fingerprint
    // strictly after it has read the project, and long before it commits. Its
    // appearance is therefore proof that the read has happened — a wall-clock
    // delay would be a guess, and on a cold route a wrong one.
    const deadline = Date.now() + 20_000;
    for (;;) {
      const u = (await db.doc(`users/${uid}`).get()).data() || {};
      if (u.chargedInputs?.[fingerprint] === true) break;
      expect(Date.now(), 'the run never reserved its unit').toBeLessThan(deadline);
      await new Promise((r) => setTimeout(r, 10));
    }
    await db.doc(`projects/${RACE_ID}`).update({ legacyCode: LATER });

    const res = await inFlight;
    expect(res.status(), 'the late run was applied over the newer source').toBe(409);
    expect((await res.json()).code).toBe('source-moved');

    const after = (await db.doc(`projects/${RACE_ID}`).get()).data()!;
    expect(after.legacyCode, 'the newer source was overwritten').toBe(LATER);
    expect(after.activeRunId, 'the late run became the current state').toBeUndefined();
    // Nothing was recorded, so nothing was charged.
    const user = (await db.doc(`users/${uid}`).get()).data() || {};
    expect(user.chargedInputs?.[fingerprint]).toBeFalsy();
  });
});
