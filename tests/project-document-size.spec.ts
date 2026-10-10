import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, deleteField, Timestamp as WebTimestamp } from 'firebase/firestore';
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import {
  checkProjectWrite,
  documentNameSize,
  estimateDocumentSize,
  mergedDocument,
  stringSize,
  valueSize,
  FIRESTORE_MAX_DOCUMENT_BYTES,
  PROJECT_DOCUMENT_BUDGET_BYTES,
  PROJECT_TOO_LARGE_CODE,
} from '../lib/firestore-doc-size';

/**
 * Codex architecture-02 — every artefact on a project has a bound of its own,
 * but they all share one document and Firestore refuses one over 1 MiB. The
 * generation store used to fail in its commit and answer a generic 500, and
 * the package the reader had just paid for was gone.
 *
 *   1. the estimator, against the worked example of Firestore's storage-size
 *      page (https://firebase.google.com/docs/firestore/storage-size);
 *   2. the merge it estimates: `set(…, { merge: true })` and `update()`;
 *   3. the route, against the emulators: a stand that would outgrow the
 *      document is refused with 413 `project-too-large` and nothing is
 *      written; one that fits is stored as before.
 */

test.describe('the estimator', () => {
  test('Firestore\'s worked example: a task document is 147 bytes', () => {
    // users/jeff/tasks/my_task_id → 6 + 5 + 6 + 11 + 16 = 44.
    expect(documentNameSize('users/jeff/tasks/my_task_id')).toBe(44);
    const task = { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' };
    // 14 + 6 + 17 + 34 fields, + 44 name, + 32.
    expect(estimateDocumentSize(task, 'users/jeff/tasks/my_task_id')).toBe(147);
  });

  test('strings count UTF-8 bytes plus one, not characters', () => {
    expect(stringSize('')).toBe(1);
    expect(stringSize('abc')).toBe(4);
    expect(stringSize('ä')).toBe(3);
    expect(stringSize('😀')).toBe(5);
  });

  test('each value type has its documented size', () => {
    expect(valueSize(null)).toBe(1);
    expect(valueSize(true)).toBe(1);
    expect(valueSize(42)).toBe(8);
    expect(valueSize(4.2)).toBe(8);
    expect(valueSize(new Date())).toBe(8);
    expect(valueSize(AdminTimestamp.now())).toBe(8);
    expect(valueSize(WebTimestamp.now())).toBe(8);
    expect(valueSize(new Uint8Array(10))).toBe(10);
    expect(valueSize(['a', 'bc'])).toBe(2 + 3);
    // A map is its keys and its values.
    expect(valueSize({ a: 'x', bb: { c: 1 } })).toBe(2 + 2 + 3 + (2 + 8));
    // A delete sentinel stores nothing, from either SDK.
    expect(valueSize({ gone: FieldValue.delete(), kept: 1 })).toBe(5 + 8);
    expect(valueSize({ gone: deleteField(), kept: 1 })).toBe(5 + 8);
  });

  test('the budget sits under the cap', () => {
    expect(FIRESTORE_MAX_DOCUMENT_BYTES).toBe(1_048_576);
    expect(PROJECT_DOCUMENT_BUDGET_BYTES).toBeLessThan(FIRESTORE_MAX_DOCUMENT_BYTES);
  });
});

test.describe('the merge it estimates', () => {
  test('merge: maps merge key by key, everything else replaces, deletes remove', () => {
    const after = mergedDocument(
      { a: 'old', meta: { x: 1, y: 2, gone: 3 }, list: [1, 2, 3] },
      { a: 'new', meta: { y: 9, gone: FieldValue.delete() }, list: [4] },
      'merge',
    );
    expect(after).toEqual({ a: 'new', meta: { x: 1, y: 9 }, list: [4] });
  });

  test('update: a dotted key is a path, and its value replaces the map there', () => {
    const after = mergedDocument(
      { auditMetadata: { inputFingerprint: { sha256: 'a' }, sourceChange: { old: true, extra: 1 } } },
      { 'auditMetadata.sourceChange': { fresh: true }, exports: deleteField() },
      'update',
    );
    expect(after).toEqual({ auditMetadata: { inputFingerprint: { sha256: 'a' }, sourceChange: { fresh: true } } });
  });

  test('a write that replaces a large field is measured by what stays, not by the sum', () => {
    const big = 'x'.repeat(600_000);
    const current = { generatedCode: big, legacyCode: 'y'.repeat(300_000) };
    const replace = checkProjectWrite(current, { generatedCode: 'z'.repeat(600_000) }, 'projects/p1', 'merge');
    expect(replace.ok).toBe(true);
    const add = checkProjectWrite(current, { testSuite: 'z'.repeat(200_000) }, 'projects/p1', 'merge');
    expect(add.ok).toBe(false);
    expect(add.largest[0].field).toBe('generatedCode');
    expect(add.bytes).toBeGreaterThan(PROJECT_DOCUMENT_BUDGET_BYTES);
  });
});

test.describe('the writers check before they write', () => {
  test('runs/create puts its project write through the budget, inside the transaction', () => {
    const route = readFileSync('app/api/runs/create/route.ts', 'utf8');
    const tx = route.indexOf('await db.runTransaction(');
    expect(tx).toBeGreaterThan(-1);
    const body = route.slice(tx);
    expect(body).toMatch(/tx\.set\(\s*projectRef,\s*withinProjectBudget\(\{/);
    expect(body).toContain('throw new ProjectTooLargeError(size)');
    expect(body).toContain('code: PROJECT_TOO_LARGE_CODE');
    // Refused means not charged.
    const refusal = body.slice(body.indexOf('if (tooLarge) {'));
    expect(refusal.indexOf('refundRunQuota(')).toBeGreaterThan(-1);
    expect(refusal.indexOf('refundRunQuota(')).toBeLessThan(refusal.indexOf('status: 413'));
  });

  test('runs/create measures the run document before the transaction, after signing', () => {
    // QA finding fe125dab988e: the run document has the same 1 MiB cap and was
    // written unmeasured, so an oversized run failed the commit with a 500.
    const route = readFileSync('app/api/runs/create/route.ts', 'utf8');
    const signed = route.indexOf('const analysisRun: AnalysisRun = {');
    const measured = route.indexOf('checkProjectWrite(null, analysisRun');
    const tx = route.indexOf('await db.runTransaction(');
    expect(signed).toBeGreaterThan(-1);
    expect(measured, 'the run document is no longer measured').toBeGreaterThan(signed);
    expect(measured, 'the run is measured only once the transaction has started').toBeLessThan(tx);
    const refusal = route.slice(measured, tx);
    expect(refusal.indexOf('refundRunQuota(')).toBeGreaterThan(-1);
    expect(refusal.indexOf('refundRunQuota(')).toBeLessThan(refusal.indexOf('status: 413'));
    expect(refusal).toContain('code: PROJECT_TOO_LARGE_CODE');
  });

  test('the Transformation stage keeps a refused package on screen as an unsaved draft', () => {
    const page = readFileSync('app/(app)/project/[projectId]/transformation/page.tsx', 'utf8');
    const branch = page.slice(page.indexOf('answer.code === PROJECT_TOO_LARGE_CODE'));
    expect(branch.indexOf('setFiles(filesArray)')).toBeGreaterThan(-1);
    expect(branch.indexOf('setUnsavedDraft(packaged)')).toBeGreaterThan(-1);
    expect(branch.indexOf('setUnsavedDraft(packaged)')).toBeLessThan(branch.indexOf('throw new Error(answer.error)'));
    expect(page).toContain('data-unsaved-draft');
  });
});

/* ------------------------------------------------- the route, on the emulators */

const STAMP = Date.now();
const PROJECT_ID = `doc-size-${STAMP}`;
const RUN_ID = `run-${STAMP}`;
const path = `/api/projects/${PROJECT_ID}/contract`;
const PROGRAM = [
  'REPORT z_doc_size.',
  'DATA lt_mara TYPE TABLE OF mara.',
  'SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.',
  "WRITE: / 'done'.",
].join('\n');
/** An analysis that leaves room for a normal package and none for a large one. */
const LARGE_ANALYSIS = 'Analysis. '.repeat(60_000);

let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
connectFirestoreToEmulator(clientDb);

function packageOf(filler: string): string {
  const paths = [
    'src/zcl_x.clas.abap', 'src/zcl_x.clas.xml', 'src/z_x.ddls.asddls', 'src/z_x.bdef.asbdef',
    'src/z_x.srvd.assrvd', 'src/z_x.srvb.assrvb', 'srv/service.ts', 'db/schema.cds', 'package.json', 'Dockerfile',
  ];
  return JSON.stringify(paths.map((p, i) => ({ path: p, content: `/* ${p} */ ${i === 0 ? filler : ''}` })));
}
const suite = { config: 'config', spec: 'spec' };

test.describe('the generation store', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const auth = getAuth(app);
    connectAuthToEmulator(auth);
    const email = disposableEmail('doc-size');
    const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
    const uid = cred.user.uid;
    idToken = await cred.user.getIdToken();
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Size', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Doc size', userId: uid, createdAt: new Date(), status: 'designed',
      legacyCode: PROGRAM, s4Deployment: 'public', activeRunId: RUN_ID,
      auditMetadata: { inputFingerprint: { fileName: 'z_doc_size.abap' } },
      analysis: LARGE_ANALYSIS, solutionDesign: 'Design v1',
    });
    const inputManifest = buildInputManifest(
      analysisRunInputs({
        sourceSha256: sha256Hex(PROGRAM),
        deploymentTarget: 'public',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.15.0',
        model: null,
      }),
      null,
    );
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, { runId: RUN_ID, projectId: PROJECT_ID, userId: uid, inputManifest });
  });

  async function readGeneration(request: import('@playwright/test').APIRequestContext) {
    const res = await request.get(path, { headers: headers() });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.decision?.ok, JSON.stringify(body.decision)).toBe(true);
    return { fingerprint: body.contract.fingerprint as string, token: body.generation.token as string };
  }

  test('a package that would outgrow the project is refused with 413, and nothing is written', async ({ request }) => {
    const read = await readGeneration(request);
    // Under the route's own package bound, over what the document has left.
    const generatedCode = packageOf('x'.repeat(500_000));
    expect(generatedCode.length).toBeLessThan(1_000_000);

    const res = await request.post(path, {
      headers: headers(),
      data: { generatedCode, testSuite: suite, expectedContractFingerprint: read.fingerprint, generationToken: read.token },
    });
    expect(res.status(), await res.text()).toBe(413);
    const body = await res.json();
    expect(body.code).toBe(PROJECT_TOO_LARGE_CODE);
    expect(body.bytes).toBeGreaterThan(body.budget);
    expect(body.error).toContain('Nothing was saved');
    expect(body.error).toContain('analysis');

    const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID));
    const stored = snap.data() as { generatedCode?: string; status?: string; generationBinding?: unknown };
    expect(stored.generatedCode).toBeUndefined();
    expect(stored.generationBinding).toBeUndefined();
    expect(stored.status).toBe('designed');
  });

  test('a package that fits is stored as before', async ({ request }) => {
    const read = await readGeneration(request);
    const generatedCode = packageOf('small');
    const res = await request.post(path, {
      headers: headers(),
      data: { generatedCode, testSuite: suite, expectedContractFingerprint: read.fingerprint, generationToken: read.token },
    });
    expect(res.status(), await res.text()).toBe(200);
    const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID));
    expect((snap.data() as { generatedCode?: string }).generatedCode).toBe(generatedCode);
  });
});
