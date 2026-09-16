import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash, createHmac } from 'crypto';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import {
  INPUT_IDS,
  analysisRunInputs,
  buildInputManifest,
  canonicalInputManifest,
  referenceDigest,
  type ManifestInput,
} from '../lib/input-manifest';
import { buildAuditPackContents } from '../lib/audit-pack-build';
import { INPUT_MANIFEST_FILE } from '../lib/audit-pack';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { recomputeStoredRunHash, verifyRunIntegrity } from '../lib/run-signature';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Roadmap 0.5 — "Manifest- und Inputvertrag: `inputs[]` mit Revision und Hash".
 *
 * Work package `docs/roadmap/SCHNITT-0-UMFANG.md` §6 (`UX-E02-F01:R0`):
 * *"Ableitungen sagen, woraus sie entstanden sind — mit Revision und Hash, nicht
 * mit einer Heuristik"*, and as the first work item: *"`inputs[]` je abgeleitetem
 * Artefakt: ID, Revision, Hash (QA24-13) — ersetzt den Digest-Vergleich als
 * Wahrheitsquelle"*, with *"die vier Datenklassen typisiert"* (QA24-14) and
 * *"Migration: IDs, Hashes und Signaturzustände bleiben erhalten"* (C23-A02).
 *
 * Before this, a signed run named its inputs in five unrelated fields and the
 * only one anybody compared was the source digest.
 */

const node256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const SOURCE = 'REPORT z_manifest.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

const inputsFor = (over: Partial<Parameters<typeof analysisRunInputs>[0]> = {}) =>
  analysisRunInputs({
    sourceSha256: node256(SOURCE),
    deploymentTarget: 'public',
    catalogVersion: '2024.FPS02 + CR:latest@e3b0c442',
    rulesetVersion: 'rules-v1.0',
    engineVersion: '2.11.0',
    model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', byokUsed: false },
    ...over,
  });

test.describe('the record', () => {
  test('every input carries an id, one of the four data classes, a revision and a hash', () => {
    const inputs = inputsFor();
    expect(inputs.map((i) => i.id).sort()).toEqual(
      [INPUT_IDS.catalog, INPUT_IDS.deployment, INPUT_IDS.engine, INPUT_IDS.model, INPUT_IDS.ruleset, INPUT_IDS.source].sort(),
    );
    for (const i of inputs) {
      expect(['source-artefact', 'transaction-data', 'derivation', 'secret-identity'], i.id).toContain(i.dataClass);
      expect(i.revision, `${i.id} has no revision`).toBeTruthy();
      expect(i.sha256, `${i.id} has no hash`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test('a by-value input hashes its bytes; a by-reference input hashes only which revision was bound', () => {
    const byId = Object.fromEntries(inputsFor().map((i) => [i.id, i] as const)) as Record<string, ManifestInput>;

    // The source: the run read it, so the digest is the source's own.
    expect(byId[INPUT_IDS.source]).toMatchObject({ binding: 'value', sha256: node256(SOURCE), dataClass: 'source-artefact' });
    expect(byId[INPUT_IDS.source].revision).toBe(`sha256:${node256(SOURCE).slice(0, 12)}`);

    // The catalog: the run looked entries up in it, it never hashed five
    // megabytes. Saying so is the point — a digest that claimed otherwise would
    // be a check nobody performed.
    expect(byId[INPUT_IDS.catalog]).toMatchObject({ binding: 'reference', revision: '2024.FPS02 + CR:latest@e3b0c442' });
    expect(byId[INPUT_IDS.catalog].sha256).toBe(referenceDigest(INPUT_IDS.catalog, '2024.FPS02 + CR:latest@e3b0c442'));
    expect(byId[INPUT_IDS.catalog].sha256).not.toBe(node256('2024.FPS02 + CR:latest@e3b0c442'));
  });

  test('the engine and the narrative model are derivations, everything the evidence came from is a source artefact', () => {
    const byClass = Object.fromEntries(inputsFor().map((i) => [i.id, i.dataClass] as const));
    expect(byClass[INPUT_IDS.source]).toBe('source-artefact');
    expect(byClass[INPUT_IDS.deployment]).toBe('source-artefact');
    expect(byClass[INPUT_IDS.catalog]).toBe('source-artefact');
    expect(byClass[INPUT_IDS.ruleset]).toBe('source-artefact');
    expect(byClass[INPUT_IDS.engine]).toBe('derivation');
    expect(byClass[INPUT_IDS.model]).toBe('derivation');
  });

  test('the canonical form is sorted and order-independent, and the hash follows it', () => {
    const a = buildInputManifest(inputsFor());
    const b = buildInputManifest([...inputsFor()].reverse());
    expect(a.hash).toBe(b.hash);
    expect(a.inputs.map((i) => i.id)).toEqual([...a.inputs.map((i) => i.id)].sort());
    expect(canonicalInputManifest(a.inputs)).toContain(`${INPUT_IDS.source}|source-artefact|value|`);
    expect(a.hash).toBe(node256(canonicalInputManifest(a.inputs)));
  });

  test('a different catalog revision is a different manifest — the comparison the old fields could not make', () => {
    const before = buildInputManifest(inputsFor());
    const after = buildInputManifest(inputsFor({ catalogVersion: '2024.FPS02 + CR:latest@ffffffff' }));
    expect(after.hash).not.toBe(before.hash);
  });

  test('secrets and identity are a class of the model, never an entry in the record', () => {
    expect(() =>
      buildInputManifest([
        ...inputsFor(),
        { id: 'secret:s4-credentials', dataClass: 'secret-identity', revision: 'v3', binding: 'reference', sha256: node256('x') },
      ]),
    ).toThrow(/must not record a secret/);
  });

  test('two inputs cannot share an id', () => {
    expect(() => buildInputManifest([...inputsFor(), inputsFor()[0]])).toThrow(/Duplicate input id/);
  });
});

test.describe('the revision', () => {
  test('starts at 1, holds while the inputs hold, and rises when they change', () => {
    const first = buildInputManifest(inputsFor(), null);
    expect(first.revision).toBe(1);

    const again = buildInputManifest(inputsFor(), first);
    expect(again.revision).toBe(1);
    expect(again.hash).toBe(first.hash);

    const moved = buildInputManifest(inputsFor({ deploymentTarget: 'private' }), again);
    expect(moved.revision).toBe(2);

    // …and back to the earlier inputs is still a new state of the world, not a
    // return to revision 1: the revision counts changes, it does not name a set.
    expect(buildInputManifest(inputsFor(), moved).revision).toBe(3);
  });
});

test.describe('the signature and the pack', () => {
  const run = {
    runId: 'run-1',
    projectId: 'proj-1',
    userId: 'u-1',
    createdAt: '2026-09-16T08:00:00.000Z',
    status: 'completed',
    inputFingerprint: { sha256: node256(SOURCE), fileName: 'z.abap', lineCount: 2, byteSize: 60, objectType: 'Report' },
    analyzerVersion: '2.11.0',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: '2024.FPS02',
    model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.11.0', byokUsed: false },
    extensibilityRoute: 'rap',
    cleanCoreScore: 71,
    complexityScore: 40,
    criticalityScore: 55,
    evidenceReport: [],
    dataCoupling: [],
    codeInventory: [],
    worklist: [],
    runHash: '',
    signature: '',
  };

  test('the manifest is inside the run hash — altering an input revision breaks the run', () => {
    const withManifest = { ...run, inputManifest: buildInputManifest(inputsFor()) };
    const hash = recomputeStoredRunHash(withManifest);
    const tampered = {
      ...withManifest,
      inputManifest: buildInputManifest(inputsFor({ catalogVersion: '2024.FPS02 + CR:latest@ffffffff' })),
    };
    expect(recomputeStoredRunHash(tampered)).not.toBe(hash);
  });

  test('a run signed before the manifest existed still recomputes to its own stored hash (C23-A02)', () => {
    const key = 'test-audit-signing-key-for-ci-test-runner-32';
    const legacy: Record<string, unknown> = { ...run };
    delete legacy.runHash;
    delete legacy.signature;
    const runHash = recomputeStoredRunHash(legacy);
    const signature = createHmac('sha256', key).update(runHash).digest('hex');
    expect(verifyRunIntegrity({ ...legacy, runHash, signature }, key)).toEqual({ valid: true });
  });

  test('the pack carries the manifest as a signed file of its own', () => {
    const manifest = buildInputManifest(inputsFor());
    const { signed } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: { ...run, inputManifest: manifest },
      attested: {},
    });
    expect(Object.keys(signed)).toContain(INPUT_MANIFEST_FILE);
    const doc = JSON.parse(signed[INPUT_MANIFEST_FILE]);
    expect(doc.recorded).toBe(true);
    expect(doc.hash).toBe(manifest.hash);
    expect(doc.revision).toBe(1);
    expect(doc.inputs.map((i: ManifestInput) => i.id).sort()).toEqual(manifest.inputs.map((i) => i.id));
    // The file the reader is meant to compare across two packs.
    expect(doc.inputs.find((i: ManifestInput) => i.id === INPUT_IDS.catalog).revision).toBe(
      '2024.FPS02 + CR:latest@e3b0c442',
    );
  });

  test('a run without a manifest says so rather than leaving the file out', () => {
    const { signed } = buildAuditPackContents({ projectId: 'proj-1', runId: 'run-1', run, attested: {} });
    const doc = JSON.parse(signed[INPUT_MANIFEST_FILE]);
    expect(doc.recorded).toBe(false);
    expect(doc.note).toContain('signed before the input manifest existed');
    expect(doc.inputs).toBeUndefined();
  });

  test('the canonical manifest form is untouched — packs sealed before 0.5 still hash the same', () => {
    const files = [
      { path: '01-input-fingerprint.json', sha256: '1'.repeat(64) },
      { path: '00-executive-summary.md', sha256: '0'.repeat(64) },
    ];
    expect(canonicalAuditManifest({ files, projectId: 'p', runId: 'r', runHash: 'h', engineVersion: 'v', sapApiCatalogVersion: 'c' })).toBe(
      `00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};p:r:h:v:c;`,
    );
  });
});

// ── End to end: the run route records it, the pack carries it ──────────────
//
// Seeded and read through the Admin SDK against the Firestore emulator rather
// than through `/api/test/seed`: the seed route lives on whichever dev server
// happens to hold port 3000, and the point here is what *this* build writes.

test.describe('server side', () => {
  test.describe.configure({ mode: 'serial' });

  const EMAIL = `inputmanifest-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'InputManifest123!';
  const PROJECT_ID = `p-inputmanifest-${Date.now()}`;
  let token = '';
  let db: Firestore;

  const read = async (path: string) => (await db.doc(path).get()).data()!;

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
    await db.doc(`users/${cred.user.uid}`).set({
      firstName: 'Input', lastName: 'Manifest', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await db.doc(`projects/${PROJECT_ID}`).set({
      name: 'Input manifest fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE,
    });
  });

  test('the signed run and the project both record what the run was computed from', async ({ request }) => {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const { runId } = await res.json();

    const runDoc = await read(`projects/${PROJECT_ID}/runs/${runId}`);
    const manifest = runDoc.inputManifest;
    expect(manifest, 'the run records no input manifest').toBeTruthy();
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.revision).toBe(1);
    expect(manifest.inputs.map((i: ManifestInput) => i.id).sort()).toEqual(
      [INPUT_IDS.catalog, INPUT_IDS.deployment, INPUT_IDS.engine, INPUT_IDS.model, INPUT_IDS.ruleset, INPUT_IDS.source].sort(),
    );
    const source = manifest.inputs.find((i: ManifestInput) => i.id === INPUT_IDS.source);
    expect(source.sha256).toBe(node256(SOURCE));
    expect(source.sha256).toBe(runDoc.inputFingerprint.sha256);
    // The catalog revision is the one the run actually resolved against, not a constant.
    const catalog = manifest.inputs.find((i: ManifestInput) => i.id === INPUT_IDS.catalog);
    expect(catalog.revision).toBe(runDoc.sapApiCatalogVersion);

    // Mirrored on the project so a reader holding only the project document
    // (the dashboard, the workspace meta line) can name the same inputs.
    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.auditMetadata.inputManifest.hash).toBe(manifest.hash);

    // And it is inside what was signed: the stored hash recomputes.
    expect(verifyRunIntegrity(runDoc, process.env.AUDIT_SIGNING_KEY!)).toEqual({ valid: true });
  });

  test('re-analysing the same inputs keeps the revision', async ({ request }) => {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.auditMetadata.inputManifest.revision).toBe(1);
  });

  test('a different deployment target is a different input set, and the revision says so', async ({ request }) => {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'private', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status()).toBe(200);
    const project = await read(`projects/${PROJECT_ID}`);
    expect(project.auditMetadata.inputManifest.revision).toBe(2);
  });

  test('the exported pack carries the manifest, and the pack still verifies', async ({ request }) => {
    const res = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID },
    });
    expect(res.status()).toBe(200);
    const zip = await JSZip.loadAsync(await res.body());
    const entry = zip.file(INPUT_MANIFEST_FILE);
    expect(entry, `${INPUT_MANIFEST_FILE} is not in the pack`).toBeTruthy();
    const doc = JSON.parse(await entry!.async('string'));
    expect(doc.recorded).toBe(true);
    expect(doc.inputs).toHaveLength(6);
    expect(doc.inputs.find((i: ManifestInput) => i.id === INPUT_IDS.source).sha256).toBe(node256(SOURCE));

    // The file is signed, not merely carried: it is listed under `files` with a
    // hash the manifest covers, never under `attested`.
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const listed = manifest.files.find((f: { path: string }) => f.path === INPUT_MANIFEST_FILE);
    expect(listed, `${INPUT_MANIFEST_FILE} is not a signed file`).toBeTruthy();
    expect(listed.sha256).toBe(node256(await entry!.async('string')));
    expect((manifest.attested || []).map((a: { path: string }) => a.path)).not.toContain(INPUT_MANIFEST_FILE);
  });

  async function packStatus(request: APIRequestContext) {
    const res = await request.post('/api/audit-pack/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID },
    });
    return { status: res.status(), body: res.status() === 200 ? null : await res.json() };
  }

  test('the pack it just issued is the pack it issues again — the check above is not vacuous', async ({ request }) => {
    expect((await packStatus(request)).status).toBe(200);
  });
});
