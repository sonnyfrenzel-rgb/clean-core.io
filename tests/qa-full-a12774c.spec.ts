import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { deleteUserDataAndAccount, mergeWhileProfileExists, updateExistingProfile } from '../lib/firebase-admin';

/**
 * Confirmed findings of the QA full review of a12774cd2b7f.
 *
 * The erasure half runs against the Firestore emulator in this process, like
 * tests/account-erasure.spec.ts: the finding is about an interleaving — a
 * request that passed its checks before the erasure and writes after it — and
 * the interleaving is staged exactly, instead of hoped for through two HTTP
 * requests. The other halves read source and name the shape that was wrong.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

const noAuth = { deleteUser: async () => {} } as unknown as Auth;
const uidOf = (tag: string) => `qa-a12774c-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('a write in flight does not bring an erased account back (7bf0db901085, 1af2dd0044fc, c52677217365)', () => {
  test('a profile update after the erasure is refused and creates nothing', async () => {
    const db = adminDb();
    const uid = uidOf('profile');
    await db.collection('users').doc(uid).set({ email: `${uid}@cleancore-test.io`, status: 'approved' });
    await deleteUserDataAndAccount(uid, { db, auth: noAuth });

    await expect(updateExistingProfile(uid, { mfaEnabled: true }, { db })).rejects.toMatchObject({ status: 404 });
    await expect(updateExistingProfile(uid, { 'modelStages.analyze': false }, { db })).rejects.toMatchObject({ status: 404 });
    expect((await db.collection('users').doc(uid).get()).exists, 'the erased profile was recreated').toBe(false);
  });

  test('the model-stage update merges into the map as the merge-set did', async () => {
    const db = adminDb();
    const uid = uidOf('stages');
    try {
      await db.collection('users').doc(uid).set({ status: 'approved', modelStages: { analyze: true, design: true } });
      await updateExistingProfile(uid, { 'modelStages.design': false }, { db });
      expect((await db.collection('users').doc(uid).get()).data()?.modelStages).toEqual({ analyze: true, design: false });
    } finally {
      await db.collection('users').doc(uid).delete().catch(() => {});
    }
  });

  test('a registration record that commits during the erasure is erased with the profile', async () => {
    const db = adminDb();
    const uid = uidOf('register');
    const record = { email: `${uid}@cleancore-test.io`, name: 'Register Race', motivation: 'x', status: 'approved' };
    try {
      await db.collection('users').doc(uid).set({ email: record.email, status: 'approved' });
      // The register route's write lands after the erasure deleted
      // `registration_requests` (step 3) and before it deletes the profile.
      const racing = new Proxy(db, {
        get(target, prop) {
          if (prop === 'collection') {
            return (name: string) => {
              if (name !== 'mfa_pending') return target.collection(name);
              return {
                doc: (id: string) => ({
                  delete: async () => {
                    await mergeWhileProfileExists(uid, target.collection('registration_requests').doc(uid), record, { db: target });
                    return target.collection('mfa_pending').doc(id).delete();
                  },
                }),
              };
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as Firestore;
      await deleteUserDataAndAccount(uid, { db: racing, auth: noAuth });
      expect(
        (await db.collection('registration_requests').doc(uid).get()).exists,
        'the address and motivation outlived the erasure',
      ).toBe(false);

      // And one that comes after the erasure cannot commit at all.
      await expect(
        mergeWhileProfileExists(uid, db.collection('registration_requests').doc(uid), record, { db }),
      ).rejects.toMatchObject({ status: 404 });
      expect((await db.collection('registration_requests').doc(uid).get()).exists).toBe(false);
    } finally {
      await db.collection('registration_requests').doc(uid).delete().catch(() => {});
      await db.collection('users').doc(uid).delete().catch(() => {});
    }
  });

  test('the three routes write through the guards, never with a merge-set', () => {
    const sites: Array<[string, string]> = [
      ['app/api/account/register/route.ts', 'mergeWhileProfileExists('],
      ['app/api/mfa/enrolled/route.ts', 'updateExistingProfile('],
      ['app/api/model-stages/route.ts', 'updateExistingProfile('],
    ];
    for (const [file, guard] of sites) {
      const src = read(file);
      expect(src, `${file} no longer writes through ${guard}`).toContain(guard);
      expect(src, `${file} merge-sets a document again`).not.toMatch(/\.set\([^;]*\{\s*merge:\s*true\s*\}/);
    }
  });
});

test('an invitation is created only while the project is still the caller\'s (0d35230adaf5)', () => {
  const src = read('app/api/projects/[projectId]/invitations/route.ts');
  const tx = src.slice(src.indexOf('await db.runTransaction('), src.indexOf('tx.create(ref'));
  expect(tx.length, 'the creating transaction is gone').toBeGreaterThan(0);
  // The project is read inside the transaction, before the invitation is created.
  expect(tx).toMatch(/tx\.get\(db\.collection\('projects'\)\.doc\(gate\.projectId\)\)/);
  expect(tx).toMatch(/!current\.exists \|\| current\.data\(\)\?\.userId !== gate\.uid/);
});

test('no query parameter grants the example\'s consent exemptions (92c1ab7604e6)', () => {
  const src = read('app/(app)/project/[projectId]/analyze/page.tsx');
  expect(src).not.toMatch(/searchParams\.get\(['"]fromExample['"]\)/);
});
