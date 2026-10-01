import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { generationRevision, generationStateOf } from '../lib/generation-revision';

/**
 * The Transformation stage answered a finished Analyze and Design with "The
 * source, the analysis or the solution design is no longer on this project, so
 * there is nothing to generate from" (found 01.10.2026 on Z_MM_PO_APPROVAL).
 *
 * The analysis was there — in the run. `/api/runs/create` stores the narrative
 * on the run and deletes `analysis` from the project document; the stages read
 * it through `loadProjectAndHydrate`, which spreads the run over the project.
 * `GET /api/projects/{id}/contract` (roadmap 3.0.11) built the generation's
 * inputs from the project document alone, so `analysis` was always empty for a
 * project analysed with a signed run, and the page refused. The CAS specs did
 * not see it because they seed `analysis` on the project document, where no
 * run since signed runs exist puts it.
 *
 * This spec takes the real path: the six fields the example gallery writes, a
 * run signed by the real `/api/runs/create` with a narrative (no model call —
 * the route stores a narrative without a receipt, it only may not name a
 * model), the design where the Design stage writes it, and then the contract
 * route and the stage itself.
 */
const STAMP = Date.now();
const EMAIL = `gen-run-analysis-${STAMP}@cleancore-test.io`;
const PROJECT_ID = `gen-run-analysis-${STAMP}`;
const SOURCE = fs
  .readFileSync(path.resolve(__dirname, '..', 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/^﻿/, '');
const NARRATIVE = JSON.stringify({ summary: 'The program approves emergency purchase requisitions and writes their status back to EBAN.' });
const DESIGN = JSON.stringify({ summary: 'A side-by-side approval service.' });
const STRIP = 'is no longer on this project, so there is nothing to generate from';
const SHOTS = process.env.GEN_RUN_SHOTS || '';
const TAG = process.env.GEN_RUN_TAG || 'after';

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
connectFirestoreToEmulator(clientDb);

let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

test.describe.configure({ mode: 'serial' });

test('the generation state takes the narrative from the run, the rest from the project', () => {
  const project = { legacyCode: 'REPORT z.', solutionDesign: 'D', generatedCode: 'C', generationBinding: { codeSha256: 'x' } };
  // What runs/create leaves behind: no `analysis` on the project, the narrative on the run.
  expect(generationStateOf(project, { analysis: 'from the run' })).toEqual({ ...project, analysis: 'from the run' });
  // The run wins on the key, as `loadProjectAndHydrate` does — an empty narrative is the run's answer.
  expect(generationStateOf({ ...project, analysis: 'stale' }, { analysis: '' }).analysis).toBe('');
  // A project from before signed runs keeps its own.
  expect(generationStateOf({ ...project, analysis: 'legacy' }, null).analysis).toBe('legacy');
  expect(generationStateOf({ ...project, analysis: 'legacy' }, { runId: 'r' }).analysis).toBe('legacy');
});

test.beforeAll(async ({ request }) => {
  test.setTimeout(180 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, EMULATOR_PASSWORD);
  idToken = await cred.user.getIdToken();
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Gen', lastName: 'Run', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  // components/StarterExamples.tsx writes these six fields and no others.
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Z_MM_PO_APPROVAL', status: 'uploaded', legacyCode: SOURCE,
    userId: cred.user.uid, createdAt: new Date(), fromExample: true,
  });
  // The run, signed by the real route, with what lib/analysis-run.ts sends.
  const run = await request.post('/api/runs/create', {
    headers: headers(),
    data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'private', analysis: NARRATIVE, uploadedFileName: 'Z_MM_PO_APPROVAL.abap' },
  });
  expect(run.status(), await run.text()).toBe(200);
  // The design, where and as the Design stage writes it.
  await adminMergeDoc('projects', PROJECT_ID, { solutionDesign: DESIGN, status: 'designed' });
});

async function stored() {
  const project = (await getDoc(doc(clientDb, 'projects', PROJECT_ID))).data() as Record<string, unknown>;
  const run = (await getDoc(doc(clientDb, 'projects', PROJECT_ID, 'runs', String(project.activeRunId)))).data() as Record<string, unknown>;
  return { project, run };
}

test('the contract route hands the generation the analysis of the signed run', async ({ request }) => {
  const { project, run } = await stored();
  // The precondition of the finding, measured rather than assumed.
  expect(project.analysis, 'runs/create no longer moves the narrative off the project — revisit this spec').toBeUndefined();
  expect(typeof run.analysis === 'string' && run.analysis.length > 0, 'the run carries no narrative').toBe(true);

  const res = await request.get(`/api/projects/${PROJECT_ID}/contract`, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.decision?.ok, JSON.stringify(body.decision)).toBe(true);
  expect(body.generation.inputs.legacyCode).toBe(SOURCE);
  expect(body.generation.inputs.solutionDesign).toBe(DESIGN);
  expect(body.generation.inputs.analysis, 'the generation was handed an empty analysis').toBe(run.analysis);
  expect(body.generation.token).toBe(generationRevision(generationStateOf(project, run), body.contract.fingerprint));
});

test('a stand generated from those inputs is stored against the same token', async ({ request }) => {
  const read = await (await request.get(`/api/projects/${PROJECT_ID}/contract`, { headers: headers() })).json();
  const paths = ['srv/service.ts', 'db/schema.cds', 'package.json', 'Dockerfile', 'src/zcl_x.clas.abap', 'src/zcl_x.clas.xml', 'src/z_x.ddls.asddls', 'src/z_x.bdef.asbdef', 'src/z_x.srvd.assrvd', 'src/z_x.srvb.assrvb'];
  const res = await request.post(`/api/projects/${PROJECT_ID}/contract`, {
    headers: headers(),
    data: {
      generatedCode: JSON.stringify(paths.map((p) => ({ path: p, content: `/* ${p} */` }))),
      testSuite: { config: 'config', spec: 'spec' },
      expectedContractFingerprint: read.contract.fingerprint,
      generationToken: read.generation.token,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  // Back to the state the stage opens on: designed, nothing generated.
  await adminMergeDoc('projects', PROJECT_ID, { generatedCode: '', status: 'designed' });
});

async function holdModel(page: Page) {
  // The stage may call a model here; the answer is pinned so the page does not
  // depend on a key, and the call itself is held — reaching it is the proof.
  await page.route('**/api/model-stages', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true },
        keyAvailable: true,
        keySource: 'community',
      }),
    }),
  );
  await page.route('**/api/gemini**', () => {
    /* held: no model call leaves the browser */
  });
}

test('the Transformation stage generates from it instead of saying the inputs are gone', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInViaLanding(page, EMAIL, EMULATOR_PASSWORD, { pauseMs: 3500 });
  await holdModel(page);
  const modelAsked = page.waitForRequest((r) => r.url().includes('/api/gemini'), { timeout: 120000 }).then(() => true, () => false);
  await page.goto(`/project/${PROJECT_ID}/transformation`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 90000 });

  expect(await modelAsked, 'the stage never reached the model call — it stopped before generating').toBe(true);
  await expect(page.getByText(STRIP)).toHaveCount(0);
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `transformation-strip-${TAG}.png`) });
  }
});
