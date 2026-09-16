import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { deleteUserDataAndAccount } from '../lib/firebase-admin';

/**
 * Account erasure is complete or it has not happened (QA review of
 * 1c5a5c920b77 and 19054f8f195f).
 *
 * Two halves, because neither alone proves it:
 *
 *  - The **partial** case runs the cascade in this process against a database
 *    whose `s4_credentials` deletes reject. Nothing can make the emulator
 *    refuse a delete on request, and the claim is precisely about what happens
 *    when one does. The Auth client is a stand-in that records its calls —
 *    which is the sharper assertion anyway: the finding is that the account was
 *    deleted *before* the data was gone, and "deleteUser was never called" says
 *    that directly. It also keeps the Admin Auth module out of the spec, which
 *    Playwright's CommonJS transform cannot load (ESM-only `jose` via
 *    `jwks-rsa`); the cascade only resolves that client at its last step, so
 *    an erasure that stops early never reaches it.
 *
 *  - The **whole** case goes through POST /api/account/delete against the real
 *    emulator: the real Auth account, the real cascade, nothing stood in for.
 *    That is where the survey answers and the sign-in are actually observed to
 *    be gone.
 */
const PASSWORD = 'Erasure-Spec-Pass-123!';
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const CAMPAIGN = 'erasure-spec';

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

/** The real database, except that deleting any document of `collectionName` is refused. */
function withRefusedDelete(db: Firestore, collectionName: string): Firestore {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'collection') {
        return (name: string) => {
          if (name !== collectionName) return target.collection(name);
          return {
            doc: () => ({
              delete: () => Promise.reject(new Error(`simulated outage while deleting ${collectionName}`)),
            }),
          };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Firestore;
}

/** An Auth client that deletes nothing and remembers whether it was asked to. */
function recordingAuth() {
  const deleted: string[] = [];
  return {
    deleted,
    client: { deleteUser: async (uid: string) => { deleted.push(uid); } } as unknown as Auth,
  };
}

async function seedOwnedData(uid: string, email: string) {
  const db = adminDb();
  await db.collection('users').doc(uid).set({ email, status: 'approved', tier: 'pilot' });
  await db.collection('s4_credentials').doc(uid).set({ url: 'https://s4.example.com', secretEnc: 'ciphertext' });
  await db.collection('mfa_secrets').doc(uid).set({ secret: 'ciphertext' });
  await db.collection('survey_responses').doc(`${CAMPAIGN}__${uid}`).set({
    campaign: CAMPAIGN,
    uid,
    email,
    answers: { q1: 'weekly' },
    comment: 'a comment that must not outlive the account',
  });
}

async function cleanUp(uid: string) {
  const db = adminDb();
  for (const col of ['users', 's4_credentials', 'mfa_secrets']) {
    await db.collection(col).doc(uid).delete().catch(() => {});
  }
  await db.collection('survey_responses').doc(`${CAMPAIGN}__${uid}`).delete().catch(() => {});
  await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${firebaseConfig.projectId}/accounts/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => {});
}

async function authAccountExists(uid: string): Promise<boolean> {
  const res = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  return ((await res.json()).users?.length ?? 0) > 0;
}

test('a refused step keeps the profile and the sign-in, and names what is still stored', async () => {
  const db = adminDb();
  const uid = `erasure-partial-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  try {
    await seedOwnedData(uid, `${uid}@cleancore-test.io`);
    const auth = recordingAuth();

    await expect(
      deleteUserDataAndAccount(uid, { db: withRefusedDelete(db, 's4_credentials'), auth: auth.client }),
    ).rejects.toThrow(/s4_credentials/);

    // What could be erased is erased ...
    expect((await db.collection('mfa_secrets').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('survey_responses').where('uid', '==', uid).get()).size).toBe(0);
    // ... what could not is still there, and so are the two things a retry
    // needs. Deleting those first left the credentials behind under a uid
    // nobody could sign in as: /api/account/delete wants a recent sign-in.
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(true);
    expect(
      (await db.collection('users').doc(uid).get()).exists,
      'the profile was deleted before the erasure was complete',
    ).toBe(true);
    expect(auth.deleted, 'the account was deleted before the erasure was complete').toEqual([]);

    // The retry, with the database back, finishes the job.
    const retry = recordingAuth();
    await expect(deleteUserDataAndAccount(uid, { db, auth: retry.client })).resolves.toBeUndefined();
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists).toBe(false);
    expect(retry.deleted, 'the account was not deleted once everything else was gone').toEqual([uid]);
  } finally {
    await cleanUp(uid);
  }
});

test('the whole erasure, through the route: the survey answers and the sign-in go too', async ({ request }: { request: APIRequestContext }) => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const clientAuth = getAuth(app);
  try {
    connectAuthEmulator(clientAuth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  } catch { /* already connected */ }

  const email = `erasure-whole-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(clientAuth, email, PASSWORD);
  const uid = cred.user.uid;
  const db = adminDb();
  try {
    await seedOwnedData(uid, email);
    // The profile the account gate and the step-up read; the seed above is the
    // erasure's target, this is what lets the request through the door.
    await adminSetDoc('users', uid, {
      firstName: 'Erasure', lastName: 'Whole', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });

    const res = await request.post('/api/account/delete', {
      headers: { Authorization: `Bearer ${await cred.user.getIdToken(true)}` },
    });
    expect(res.status(), await res.text()).toBe(200);

    expect(
      (await db.collection('survey_responses').where('uid', '==', uid).get()).size,
      'the erased account still has survey responses',
    ).toBe(0);
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('mfa_secrets').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists).toBe(false);
    expect(await authAccountExists(uid), 'the Firebase Auth account outlived the erasure').toBe(false);
  } finally {
    await cleanUp(uid);
  }
});
