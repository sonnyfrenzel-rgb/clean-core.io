import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { deleteGeminiApiKey, getAdminDb } from '../lib/firebase-admin';
import { deleteS4Credentials } from '../lib/s4-credentials';

/**
 * Deleting a stored secret reports what happened (QA review of 8c7c26a637d1
 * and e538b51c10f5).
 *
 * Both helpers ended every write in `.catch(() => {})`, so a delete the
 * database refused resolved like a delete that worked and the route answered
 * `ok` with the secret still stored. Run against the Firestore emulator, which
 * refuses a document id of the form `__x__` as reserved — the client library
 * does not check for it, so the refusal comes back from the server as a
 * rejected write, which is exactly the failure that used to be swallowed.
 *
 * Both functions are Firestore-only, which is why they can be called from here
 * at all: the Admin Auth module reaches ESM-only `jose` and cannot be required
 * under Playwright's CommonJS transform, so `lib/firebase-admin.ts` loads it
 * only where authentication is actually used.
 */
const RESERVED_UID = '__secret-erasure-spec__';

test.beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'cleancore-491216' });
});

test('a refused BYOK key delete is an error, not a silent ok', async () => {
  await expect(deleteGeminiApiKey(RESERVED_UID)).rejects.toThrow(/reserved/i);
});

test('a refused S/4 credential delete is an error, not a silent ok', async () => {
  await expect(deleteS4Credentials(RESERVED_UID)).rejects.toThrow(/reserved/i);
});

test('a delete that worked leaves neither the key nor the claim that one is configured', async () => {
  const { db } = await getAdminDb();
  const uid = `secret-erasure-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  try {
    await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').set({ encryptedApiKey: 'ciphertext', last4: 'AbCd' });
    await db.collection('users').doc(uid).set({ byokConfigured: true, byokLast4: 'AbCd' });
    await db.collection('s4_credentials').doc(uid).set({ url: 'https://s4.example.com', secretEnc: 'ciphertext' });
    await db.collection('users').doc(uid).set({ s4Meta: { configured: true, url: 'https://s4.example.com' } }, { merge: true });

    await expect(deleteGeminiApiKey(uid)).resolves.toBeUndefined();
    await expect(deleteS4Credentials(uid)).resolves.toBeUndefined();

    expect((await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').get()).exists).toBe(false);
    expect((await db.collection('s4_credentials').doc(uid).get()).exists).toBe(false);
    const profile = (await db.collection('users').doc(uid).get()).data() || {};
    expect(profile.byokConfigured).toBeUndefined();
    expect(profile.byokLast4).toBeUndefined();
    expect(profile.s4Meta).toBeUndefined();
  } finally {
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('s4_credentials').doc(uid).delete().catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
  }
});

test('a key delete after an erasure does not bring the profile back (0ce264ac607d)', async () => {
  // The delete was two writes, the second a merge-set onto `users/{uid}`. A
  // merge-set creates the document it merges into, so a delete arriving after
  // the account's erasure recreated the profile with nothing on it but the BYOK
  // fields. Now one transaction reads the profile: the secret goes either way,
  // the profile is updated only while it exists.
  const { db } = await getAdminDb();
  const uid = `secret-erasure-gone-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  try {
    await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').set({ encryptedApiKey: 'ciphertext', last4: 'AbCd' });

    await expect(deleteGeminiApiKey(uid)).resolves.toBeUndefined();

    expect((await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').get()).exists).toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists, 'the erased profile was recreated').toBe(false);
  } finally {
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
  }
});

test('the key delete is one transaction with the profile read, never a merge-set (0ce264ac607d)', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'lib', 'firebase-admin.ts'), 'utf8');
  const start = admin.indexOf('export async function deleteGeminiApiKey');
  const fn = admin.slice(start, admin.indexOf('\n}\n', start));
  expect(fn).toContain('db.runTransaction(');
  expect(fn).toContain('await tx.get(profileRef)');
  expect(fn).toContain('tx.delete(secretRef)');
  expect(fn).toMatch(/if \(!profile\.exists\) return;\s*tx\.update\(profileRef,/);
  expect(fn, 'the profile is merge-set again').not.toMatch(/\{\s*merge:\s*true\s*\}/);
});
