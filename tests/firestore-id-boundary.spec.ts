import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { adminSetDoc } from './helpers/admin-seed';
import { connectAuthToEmulator, disposableEmail, EMULATOR_PASSWORD, requireEmulator } from './helpers/emulator-guard';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { isFirestoreId } from '../lib/firestore-id';

/**
 * SEC-2026-514: a document id that arrives from the caller is checked before it
 * forms a document path. Against the emulators: the route answers 400 and the
 * database holds exactly what it held before.
 */

const SOURCE = 'REPORT z_id_boundary.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

test.describe('isFirestoreId', () => {
  test('accepts the ids this product mints and refuses everything else', () => {
    for (const ok of ['a', 'AbC123xyz0987654321q', 'apk-boundary-1727', 'u_conc-7', 'x'.repeat(128)]) {
      expect(isFirestoreId(ok), ok).toBe(true);
    }
    for (const bad of ['', 'a/b', 'a/runs/b', '..', '.', 'a.b', 'a b', 'a%2Fb', 'x'.repeat(129), '__proto__/x', 42, null, undefined, {}, ['a']]) {
      expect(isFirestoreId(bad), String(bad)).toBe(false);
    }
  });
});

test.describe('a caller-supplied id never forms a nested document path', () => {
  test.describe.configure({ mode: 'serial' });

  const PROJECT_ID = `id-boundary-${Date.now()}`;
  let token = '';
  let runId = '';
  const headers = () => ({ Authorization: `Bearer ${token}` });

  function db() {
    requireEmulator();
    const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
    return adminFirestore(app, FIRESTORE_DB_ID);
  }

  test.beforeAll(async ({ request }) => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = connectAuthToEmulator(getAuth(app));
    const email = disposableEmail('id-boundary');
    const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Id', lastName: 'Boundary', email, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Id boundary fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE,
    });
    const run = await request.post('/api/runs/create', {
      headers: headers(),
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, uploadedFileName: 'z_id_boundary.abap' },
    });
    expect(run.status(), await run.text()).toBe(200);
    runId = (await db().collection('projects').doc(PROJECT_ID).get()).data()!.activeRunId as string;
    expect(runId).toBeTruthy();
  });

  test('runs/create refuses a project id that names a document below the project', async ({ request }) => {
    const runRef = db().collection('projects').doc(PROJECT_ID).collection('runs').doc(runId);
    const before = (await runRef.get()).data();
    const runsBefore = (await db().collection('projects').doc(PROJECT_ID).collection('runs').get()).size;

    const res = await request.post('/api/runs/create', {
      headers: headers(),
      data: { projectId: `${PROJECT_ID}/runs/${runId}`, legacyCode: SOURCE, uploadedFileName: 'z_id_boundary.abap' },
    });
    expect(res.status(), await res.text()).toBe(400);
    expect((await res.json()).error).toBe('Invalid project id.');

    // Nothing was written: the run is byte-for-byte what it was, no run was
    // added, and nothing grew underneath the run.
    expect((await runRef.get()).data()).toEqual(before);
    expect((await db().collection('projects').doc(PROJECT_ID).collection('runs').get()).size).toBe(runsBefore);
    expect(await runRef.listCollections()).toHaveLength(0);
  });

  test('audit-pack/create refuses the same id', async ({ request }) => {
    const res = await request.post('/api/audit-pack/create', {
      headers: headers(),
      data: { projectId: `${PROJECT_ID}/runs/${runId}` },
    });
    expect(res.status(), await res.text()).toBe(400);
  });

  test('a path parameter carrying an encoded slash is refused before any read', async ({ request }) => {
    const encoded = encodeURIComponent(`${PROJECT_ID}/runs/${runId}`);
    for (const path of ['decision', 'findings', 'contract', 'process-naming', 'process-revisions', 'process-states', 'readers', 'invitations', 'process-map']) {
      const res = await request.get(`/api/projects/${encoded}/${path}`, { headers: headers() });
      // 400 from the id check; a route that does not answer GET says 405.
      expect([400, 405], `${path}: ${res.status()}`).toContain(res.status());
    }
  });
});
