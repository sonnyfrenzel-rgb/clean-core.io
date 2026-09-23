/**
 * A write that commits onto something that is no longer there.
 *
 * Two findings of the QA full review, one cause. Deletion is real in this
 * product — `deleteUserData` drops every project with `recursiveDelete`, then
 * `users/{uid}`, and only then the Auth account — and `verifyIdToken` asks
 * Firebase whether a token was revoked *only* for tokens carrying
 * `admin: true`. An ordinary ID token therefore stays valid for up to an hour
 * after the account behind it is gone. Anything that writes with
 * `{ merge: true }` in that hour does not update a document, it creates one.
 *
 *   - `66f75a3d4632` — POST /api/runs/create re-created a deleted project,
 *     ABAP source and all, together with a freshly signed run underneath it.
 *     Its commit-time guard compared the stored source against the one it had
 *     read; with the source coming from the request body and the stored one
 *     empty — the analyze stage's normal shape — both sides were `''` and the
 *     guard was silent. The window is the evidence build plus the model call.
 *   - `6db23bf69b81` / `6b0c0ae8ac9c` — POST /api/request-tenant-access called
 *     `verifyRequestAuth` and nothing else, and re-created the whole user
 *     profile. No race at all: one old token, one request.
 *
 * Both are checked here against real deletions performed with the Admin SDK,
 * not against an argument that they would happen. Each case is preceded by the
 * same call succeeding, so a refusal that came from somewhere else would show
 * up as a failure of the control rather than as a pass.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash } from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { observedWhile } from './helpers/observed-while';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const SMALL_SOURCE = 'REPORT z_vanished_control.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

test.describe('a write onto a target that was deleted under it', () => {
  test.describe.configure({ mode: 'serial' });

  const STAMP = Date.now();
  const EMAIL = `vanished-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'Vanished123!';
  const CONTROL_PROJECT = `p-vanished-control-${STAMP}`;
  const RACE_PROJECT = `p-vanished-race-${STAMP}`;

  let db: Firestore;
  let token = '';
  let uid = '';

  const profile = () => ({
    firstName: 'Vanished',
    lastName: 'Target',
    email: EMAIL,
    tier: 'pilot',
    status: 'approved',
    transformationsUsed: 0,
    transformationsLimit: 10,
    termsVersionAccepted: TERMS_VERSION,
    s4TenantAccessRequested: false,
    mfaEnabled: false,
    createdAt: new Date(),
  });

  const startRun = (request: APIRequestContext, projectId: string, legacyCode: string) =>
    request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId, legacyCode, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });

  const requestTenant = (request: APIRequestContext) =>
    request.post('/api/request-tenant-access', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Vanished Target', motivation: 'Checking the account gate on this route.' },
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
    uid = cred.user.uid;
    token = await cred.user.getIdToken();

    await db.doc(`users/${uid}`).set(profile());
    // No `legacyCode` on either project: the source travels in the request
    // body, which is what the analyze stage does and what made the commit-time
    // comparison compare `''` with `''`.
    for (const id of [CONTROL_PROJECT, RACE_PROJECT]) {
      await db.doc(`projects/${id}`).set({
        name: 'Vanished target fixture',
        userId: uid,
        createdAt: new Date(),
        status: 'uploaded',
      });
    }
  });

  test('the control: a run on a project that is still there is signed and stored', async ({ request }) => {
    const res = await startRun(request, CONTROL_PROJECT, SMALL_SOURCE);
    expect(res.status(), await res.text()).toBe(200);
    const stored = (await db.doc(`projects/${CONTROL_PROJECT}`).get()).data()!;
    expect(stored.activeRunId, 'the control run did not become the current state').toBeTruthy();
    expect(stored.legacyCode).toBe(SMALL_SOURCE);
  });

  test('a project deleted while its analysis runs is not written back into existence (66f75a3d4632)', async ({ request }) => {
    // The window has to be real, so the source has to be big enough to hold it
    // open: the 37 kB shipped example, plus a line that moves its fingerprint
    // off the shipped one so the run is charged like any other and the charge
    // can be sampled. A two-line report reaches the transaction before the
    // deletion lands and the test would report a defect that is not there.
    const LONG_EXAMPLE = STARTER_EXAMPLES.find((e) => e.name === 'ZLEGACY_ORDER_FULFILLMENT_AUDIT')!;
    const served = await request.get(`/starter-examples/${LONG_EXAMPLE.file}`);
    expect(served.status(), LONG_EXAMPLE.file).toBe(200);
    const SOURCE = `${new TextDecoder().decode(await served.body())}\n* vanished fixture ${STAMP}\n`;
    const fingerprint = sha256(SOURCE);

    const inFlight = startRun(request, RACE_PROJECT, SOURCE);

    // Not a sleep: the quota unit is reserved strictly after the route has read
    // the project and long before it commits, so seeing the reservation proves
    // the read has happened. The sampler stops when the request settles, so a
    // miss ends in the assertion below instead of a timeout.
    const reserved = await observedWhile(inFlight, async () => {
      const u = (await db.doc(`users/${uid}`).get()).data() || {};
      return u.chargedInputs?.[fingerprint] === true;
    });
    expect(reserved, 'the run never reserved its unit, so the deletion below races nothing').toBe(true);

    // What `deleteUserData` does to every project of an account, one project at
    // a time.
    await db.doc(`projects/${RACE_PROJECT}`).delete();

    const res = await inFlight;
    expect(res.status(), 'the deleted project was written back into existence').toBe(404);
    expect((await res.json()).code).toBe('project-gone');

    const after = await db.doc(`projects/${RACE_PROJECT}`).get();
    expect(after.exists, 'the project document was re-created by the run').toBe(false);
    const runs = await db.collection(`projects/${RACE_PROJECT}/runs`).get();
    expect(runs.size, 'a signed run was stored under a project that no longer exists').toBe(0);

    // Nothing was written, so nothing is charged — the same rule the
    // source-moved refusal already follows.
    const user = (await db.doc(`users/${uid}`).get()).data() || {};
    expect(user.chargedInputs?.[fingerprint]).toBeFalsy();
  });

  test('the control: tenant access can be requested while the account exists', async ({ request }) => {
    const res = await requestTenant(request);
    expect(res.status(), await res.text()).toBe(200);
    const stored = (await db.doc(`users/${uid}`).get()).data()!;
    expect(stored.s4TenantAccessRequested).toBe(true);
  });

  test('a token that outlived its account does not re-create the profile (6db23bf69b81)', async ({ request }) => {
    // No race and no second request needed: `verifyIdToken` asks for revocation
    // only on admin tokens, so the token minted in `beforeAll` is still good
    // for the rest of its hour.
    await db.doc(`users/${uid}`).delete();
    expect((await db.doc(`users/${uid}`).get()).exists, 'the fixture did not delete the profile').toBe(false);

    const res = await requestTenant(request);
    expect(res.status(), 'a deleted account still reached the tenant request route').toBe(403);

    const after = await db.doc(`users/${uid}`).get();
    expect(after.exists, 'the deleted profile was re-created by the route').toBe(false);
  });

  test('the same token no longer mints a run either, for the same reason', async ({ request }) => {
    // `runs/create` already called `assertAccountActive`; recorded here because
    // the two routes now answer the deleted account the same way, and a later
    // change that dropped the gate from one of them should show up as a pair.
    const res = await startRun(request, CONTROL_PROJECT, SMALL_SOURCE);
    expect(res.status(), await res.text()).toBe(403);
  });

  test.afterAll(async () => {
    await db.doc(`projects/${CONTROL_PROJECT}`).delete().catch(() => {});
    await db.doc(`projects/${RACE_PROJECT}`).delete().catch(() => {});
    await db.doc(`users/${uid}`).delete().catch(() => {});
  });
});
