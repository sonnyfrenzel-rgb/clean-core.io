import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { isTargetChange } from '../lib/target-change';

/**
 * Owner decision 06.10.2026 — changing the target of a starter example is
 * free, also repeatedly; own code stays free on re-analysis as it always was.
 *
 * Through the route that meters, against the emulators: the interesting part
 * is that the exemption is *narrow* — only the same signed source, only when
 * edition or release actually moves, only for an example recognised by its
 * fingerprint — and a source grep cannot see any of that.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe.configure({ mode: 'serial' });

const EMAIL = `target-change-quota-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

const EXAMPLE = STARTER_EXAMPLES.find((e) => e.name === 'Z_MATERIAL_STOCK_CALC')!;

async function exampleSource(request: APIRequestContext): Promise<string> {
  const res = await request.get(`/starter-examples/${EXAMPLE.file}`);
  expect(res.status()).toBe(200);
  return new TextDecoder().decode(await res.body());
}

async function account(): Promise<{ transformationsUsed?: number; starterExamplesUsed?: Record<string, boolean> }> {
  return ((await db().collection('users').doc(uid).get()).data() ?? {}) as never;
}

async function resetAccount(over: Record<string, unknown> = {}) {
  await adminSetDoc('users', uid, {
    firstName: 'Target', lastName: 'Change', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(), ...over,
  });
}

let seq = 0;
async function newProject(legacyCode: string): Promise<string> {
  const projectId = `target-change-quota-${Date.now()}-${seq++}`;
  await adminSetDoc('projects', projectId, {
    userId: uid, name: EXAMPLE.name, fromExample: true, status: 'uploaded', createdAt: new Date(), legacyCode,
  });
  return projectId;
}

/** One run on the project, under the given target; returns the run's `metering`. */
async function run(
  request: APIRequestContext,
  projectId: string,
  s4Deployment: 'public' | 'private',
  release = '',
): Promise<string> {
  const res = await request.post('/api/runs/create', {
    headers: headers(),
    data: { projectId, s4Deployment, targetProfile: { release }, analysis: '', uploadedFileName: EXAMPLE.file },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { runId } = await res.json();
  const doc = (await db().collection('projects').doc(projectId).collection('runs').doc(runId).get()).data()!;
  return doc.metering as string;
}

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  await resetAccount();
});

test.describe('what counts as a target change', () => {
  const signed = { activeRunId: 'run-1', s4Deployment: 'private', assessmentTarget: { release: '2023 FPS03' }, auditMetadata: { inputFingerprint: { sha256: 'a'.repeat(64) } } };

  test('the same signed source under another edition or release, and nothing else', () => {
    const sha = 'a'.repeat(64);
    expect(isTargetChange({ project: signed, sourceSha256: sha, next: { edition: 'public', release: '' } })).toBe(true);
    expect(isTargetChange({ project: signed, sourceSha256: sha, next: { edition: 'private', release: '2023 FPS02' } })).toBe(true);
    // Whitespace is the route's normalisation, not a change.
    expect(isTargetChange({ project: signed, sourceSha256: sha, next: { edition: 'private', release: ' 2023  FPS03 ' } })).toBe(false);
    // The same target again is a re-run, not a change.
    expect(isTargetChange({ project: signed, sourceSha256: sha, next: { edition: 'private', release: '2023 FPS03' } })).toBe(false);
    // Another source is an analysis of new code.
    expect(isTargetChange({ project: signed, sourceSha256: 'b'.repeat(64), next: { edition: 'public', release: '' } })).toBe(false);
    // No signed run yet: the first run is not a change of anything.
    expect(isTargetChange({ project: { ...signed, activeRunId: '' }, sourceSha256: sha, next: { edition: 'public', release: '' } })).toBe(false);
    expect(isTargetChange({ project: null, sourceSha256: sha, next: { edition: 'public', release: '' } })).toBe(false);
  });
});

test.describe('changing the target of a starter example is free, also repeatedly', () => {
  test('first run free, every target change free, the same target again charged', async ({ request }) => {
    test.setTimeout(180 * 1000);
    await resetAccount();
    const source = await exampleSource(request);
    const projectId = await newProject(source);

    expect(await run(request, projectId, 'private', '2023 FPS03'), 'the first run of the example').toBe('starter-example');
    expect((await account()).transformationsUsed).toBe(0);

    expect(await run(request, projectId, 'public'), 'Private → Public').toBe('target-change');
    expect(await run(request, projectId, 'private', '2023 FPS03'), 'and back again').toBe('target-change');
    expect(await run(request, projectId, 'private', '2023 FPS02'), 'another release').toBe('target-change');
    expect((await account()).transformationsUsed, 'no target change spent a unit').toBe(0);

    const project = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(project.s4Deployment).toBe('private');
    expect(project.assessmentTarget?.release).toBe('2023 FPS02');
    // The change is recorded the way every profile change is, with what it was before.
    expect(project.auditMetadata?.sourceChange?.reason).toBe('profile');
    expect(project.auditMetadata?.sourceChange?.previousTarget).toEqual({ edition: 'private', release: '2023 FPS03' });

    // Nothing changed: an ordinary further run of the example, charged as before.
    expect(await run(request, projectId, 'private', '2023 FPS02'), 'the same target again').toBe('charged');
    expect((await account()).transformationsUsed).toBe(1);
  });

  test('a new project with the same example is a further start, not a target change', async ({ request }) => {
    await resetAccount({ starterExamplesUsed: { [EXAMPLE.name]: true } });
    const source = await exampleSource(request);
    const projectId = await newProject(source);
    expect(await run(request, projectId, 'public')).toBe('charged');
    expect((await account()).transformationsUsed).toBe(1);
  });

  test('own code: a target change is the re-analysis it always was', async ({ request }) => {
    await resetAccount();
    const own = `${await exampleSource(request)}\n* my own line ${Date.now()}\n`;
    const projectId = await newProject(own);
    expect(await run(request, projectId, 'private')).toBe('charged');
    expect(await run(request, projectId, 'public')).toBe('reanalysis');
    expect((await account()).transformationsUsed).toBe(1);
  });
});
