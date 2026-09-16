import { test, expect } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { deleteUserDataAndAccount, getAdminDb } from '../lib/firebase-admin';

/**
 * Account erasure is complete or it has not happened (QA review of
 * 1c5a5c920b77 and 19054f8f195f).
 *
 * Against the Auth and Firestore emulators through the cascade itself. The
 * emulator will not refuse a delete on request, so the partial case is built
 * by handing the cascade a database whose `s4_credentials` deletes reject —
 * every other call goes to the real emulator untouched.
 */
test.beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'cleancore-491216' });
});

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
  });
}

async function seedAccount(tag: string): Promise<{ uid: string; email: string }> {
  const { db } = await getAdminDb();
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
  const user = await getAuth().createUser({ email });
  const uid = user.uid;
  await db.collection('users').doc(uid).set({ email, status: 'approved', tier: 'pilot' });
  await db.collection('s4_credentials').doc(uid).set({ url: 'https://s4.example.com', secretEnc: 'ciphertext' });
  await db.collection('mfa_secrets').doc(uid).set({ secret: 'ciphertext' });
  await db.collection('survey_responses').doc(`erasure-spec__${uid}`).set({
    campaign: 'erasure-spec',
    uid,
    email,
    answers: { q1: 'weekly' },
    comment: 'a comment that must not outlive the account',
  });
  return { uid, email };
}

async function removeAccount(uid: string): Promise<void> {
  const { db } = await getAdminDb();
  for (const col of ['users', 's4_credentials', 'mfa_secrets']) {
    await db.collection(col).doc(uid).delete().catch(() => {});
  }
  await db.collection('survey_responses').doc(`erasure-spec__${uid}`).delete().catch(() => {});
  await getAuth().deleteUser(uid).catch(() => {});
}

const authUserExists = (uid: string) =>
  getAuth().getUser(uid).then(() => true, (e) => (e?.code === 'auth/user-not-found' ? false : Promise.reject(e)));

test('a refused step keeps the profile and the sign-in, and names what is still stored', async () => {
  const { uid } = await seedAccount('partial-erasure');
  try {
    const { db } = await getAdminDb();
    await expect(deleteUserDataAndAccount(uid, { db: withRefusedDelete(db, 's4_credentials') }))
      .rejects.toThrow(/s4_credentials/);

    // What could be erased is erased ...
    expect((await db.collection('mfa_secrets').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('survey_responses').where('uid', '==', uid).get()).size).toBe(0);
    // ... what could not is still there, and so are the profile and the
    // account it can be retried from. Deleting those two first left the
    // credentials behind under a uid nobody could sign in as.
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(true);
    expect((await db.collection('users').doc(uid).get()).exists, 'the profile was deleted before the erasure was complete').toBe(true);
    expect(await authUserExists(uid), 'the sign-in was deleted before the erasure was complete').toBe(true);

    // The retry, with the database back, finishes the job.
    await expect(deleteUserDataAndAccount(uid)).resolves.toBeUndefined();
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists).toBe(false);
    expect(await authUserExists(uid)).toBe(false);
  } finally {
    await removeAccount(uid);
  }
});

test('survey answers and the comment beside them go with the account', async () => {
  const { uid } = await seedAccount('survey-erasure');
  try {
    const { db } = await getAdminDb();
    await deleteUserDataAndAccount(uid);
    expect(
      (await db.collection('survey_responses').where('uid', '==', uid).get()).size,
      'the erased account still has survey responses',
    ).toBe(0);
    expect((await db.collection('users').doc(uid).get()).exists).toBe(false);
    expect(await authUserExists(uid)).toBe(false);
  } finally {
    await removeAccount(uid);
  }
});
