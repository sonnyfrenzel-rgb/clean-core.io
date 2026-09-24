import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { generationRevision } from '../lib/generation-revision';

/**
 * Roadmap 3.0.11 — the generation is stored by the server, in one transaction,
 * against the token the page read before the model call (QA full review of
 * 81810c8026e0, `e649177b3894`, `c42de15e9c75`). Against the emulators and the
 * real route.
 *
 *   1. happy path: code, suite, status and binding land together;
 *   2. a token from before a change is refused with 409 and nothing is written;
 *   3. a solution design replaced since the token is refused — the contract
 *      fingerprint does not cover the design, the token does;
 *   4. two generations that read the same state and store at once: exactly one
 *      wins, the other gets 409, and the stored code is the winner's under the
 *      winner's binding.
 *
 * No window is sampled. (4) fires both stores together and asserts on the
 * outcome, which is the same in every interleaving: a store that loads after
 * the other committed fails the token check, and one that loaded before fails
 * the transaction's `updateTime` comparison. No ordering lets both through.
 */

const STAMP = Date.now();
const PROJECT_ID = `generation-cas-${STAMP}`;
const RUN_ID = `run-${STAMP}`;
const path = `/api/projects/${PROJECT_ID}/contract`;

const PROGRAM = [
  'REPORT z_generation_cas.',
  'DATA lt_mara TYPE TABLE OF mara.',
  'SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.',
  "WRITE: / 'done'.",
].join('\n');

let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
connectFirestoreToEmulator(clientDb);

test.describe.configure({ mode: 'serial' });

/** A package that satisfies either track: `missingArtefacts` checks presence, not absence. */
function packageNamed(tag: string): string {
  const paths = [
    'src/zcl_x.clas.abap', 'src/zcl_x.clas.xml', 'src/z_x.ddls.asddls', 'src/z_x.bdef.asbdef',
    'src/z_x.srvd.assrvd', 'src/z_x.srvb.assrvb', 'srv/service.ts', 'db/schema.cds', 'package.json', 'Dockerfile',
  ];
  return JSON.stringify(paths.map((p) => ({ path: p, content: `/* ${tag} */ ${p}` })));
}
const suite = (tag: string) => ({ config: `config ${tag}`, spec: `spec ${tag}` });

async function readGeneration(request: APIRequestContext) {
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.decision?.ok, JSON.stringify(body.decision)).toBe(true);
  expect(body.generation?.token, 'the GET names no pre-generation token').toMatch(/^[0-9a-f]{64}$/);
  return {
    fingerprint: body.contract.fingerprint as string,
    token: body.generation.token as string,
    inputs: body.generation.inputs as { legacyCode: string; solutionDesign: string; analysis: string },
  };
}

function store(request: APIRequestContext, read: { fingerprint: string; token: string }, tag: string) {
  return request.post(path, {
    headers: headers(),
    data: {
      generatedCode: packageNamed(tag),
      testSuite: suite(tag),
      expectedContractFingerprint: read.fingerprint,
      generationToken: read.token,
    },
  });
}

interface StoredProject {
  generatedCode?: string;
  testSuite?: unknown;
  status?: string;
  generationBinding?: { codeSha256?: string; contractFingerprint?: string };
}

async function project(): Promise<StoredProject> {
  const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID));
  expect(snap.exists()).toBe(true);
  return snap.data() as StoredProject;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const email = disposableEmail('generation-cas');
  const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  await adminSetDoc('users', uid, {
    firstName: 'Generation', lastName: 'Cas', email, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Generation CAS', userId: uid, createdAt: new Date(), status: 'designed',
    legacyCode: PROGRAM, s4Deployment: 'public', activeRunId: RUN_ID,
    auditMetadata: { inputFingerprint: { fileName: 'z_generation_cas.abap' } },
    analysis: 'Analysis v1', solutionDesign: 'Design v1',
  });
  // The contract reads the deployment target out of the run's manifest; without
  // it the contract is blocked and nothing may be generated at all.
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

test('the GET hands out the token together with the inputs it covers', async ({ request }) => {
  const read = await readGeneration(request);
  expect(read.inputs).toEqual({ legacyCode: PROGRAM, solutionDesign: 'Design v1', analysis: 'Analysis v1' });
  // The token is the pure function over those inputs — the browser cannot be
  // handed one for a state it was not shown.
  expect(read.token).toBe(
    generationRevision({ legacyCode: PROGRAM, solutionDesign: 'Design v1', analysis: 'Analysis v1' }, read.fingerprint),
  );
});

test('happy path: code, suite, status and binding are stored together', async ({ request }) => {
  const read = await readGeneration(request);
  const res = await store(request, read, 'first');
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.fields.status).toBe('transformed');

  const p = await project();
  expect(p.generatedCode).toBe(packageNamed('first'));
  expect(p.testSuite).toEqual(suite('first'));
  expect(p.status).toBe('transformed');
  expect(p.generationBinding?.codeSha256).toBe(sha256Hex(packageNamed('first')));
  expect(p.generationBinding?.contractFingerprint).toBe(read.fingerprint);
});

test('a token from before a change is refused, and nothing is written', async ({ request }) => {
  const read = await readGeneration(request);
  await adminMergeDoc('projects', PROJECT_ID, { analysis: 'Analysis v2' });
  const before = await project();

  const res = await store(request, read, 'stale');
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('generation-stale');

  const after = await project();
  expect(after.generatedCode).toBe(before.generatedCode);
  expect(after.testSuite).toEqual(before.testSuite);
  expect(after.generationBinding).toEqual(before.generationBinding);
  expect(after.generatedCode).toBe(packageNamed('first'));
});

test('a solution design replaced since the token is refused — the fingerprint alone would not see it', async ({ request }) => {
  const read = await readGeneration(request);
  await adminMergeDoc('projects', PROJECT_ID, { solutionDesign: 'Design v2' });
  const moved = await readGeneration(request);
  // The point of the finding: the contract did not move.
  expect(moved.fingerprint).toBe(read.fingerprint);
  expect(moved.token).not.toBe(read.token);

  const res = await store(request, read, 'old-design');
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('generation-stale');
  expect((await project()).generatedCode).toBe(packageNamed('first'));
});

test('a store without a token is refused rather than written unchecked', async ({ request }) => {
  const read = await readGeneration(request);
  const res = await store(request, { ...read, token: '' }, 'no-token');
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe('no-generation-token');
  expect((await project()).generatedCode).toBe(packageNamed('first'));
});

test('two tabs on the same state storing one after the other: the second is refused', async ({ request }) => {
  const tabA = await readGeneration(request);
  const tabB = await readGeneration(request);
  expect(tabB.token).toBe(tabA.token);

  const a = await store(request, tabA, 'tab-a');
  expect(a.status(), await a.text()).toBe(200);
  const b = await store(request, tabB, 'tab-b');
  expect(b.status(), await b.text()).toBe(409);

  const p = await project();
  expect(p.generatedCode).toBe(packageNamed('tab-a'));
  expect(p.generationBinding?.codeSha256).toBe(sha256Hex(packageNamed('tab-a')));
});

test('two tabs storing at once: exactly one wins, and its code is under its own binding', async ({ request }) => {
  const read = await readGeneration(request);
  const [x, y] = await Promise.all([store(request, read, 'race-x'), store(request, read, 'race-y')]);
  const statuses = [x.status(), y.status()].sort();
  expect(statuses, `${await x.text()} | ${await y.text()}`).toEqual([200, 409]);

  const winner = x.status() === 200 ? 'race-x' : 'race-y';
  const p = await project();
  expect(p.generatedCode).toBe(packageNamed(winner));
  expect(p.testSuite).toEqual(suite(winner));
  // e649177b3894 exactly: never one tab's code under the other tab's digest.
  expect(p.generationBinding?.codeSha256).toBe(sha256Hex(p.generatedCode ?? ''));
});
