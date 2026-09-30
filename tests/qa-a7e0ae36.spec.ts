import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { createApprovalToken } from '../lib/approval-token';
import {
  TENANT_APPROVAL_NONCES,
  adminGrantS4,
  adminRevokeS4,
  approveTenantWithToken,
} from '../lib/firebase-admin';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-1234567890';

/**
 * Confirmed findings of the QA review of a7e0ae36c896 that are held here
 * rather than in the spec of the route they touch.
 *
 * The tenant half runs the lib functions in this process against the Firestore
 * emulator, like tests/qa-full-a12774c.spec.ts: the finding is about the order
 * of two administrator decisions, and it is staged exactly.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

const uidOf = (tag: string) => `qa-a7e0ae36-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const nonceOf = (n: number) => String(n).padStart(2, '0').repeat(16);

/** An open request with its mailed links, the way `/api/request-tenant-access` leaves one. */
async function openRequest(db: Firestore, uid: string, nonce: string) {
  await db.collection('users').doc(uid).set({
    email: `${uid}@cleancore-test.io`, status: 'approved', s4TenantAccessAllowed: false, s4TenantAccessRequested: true,
  });
  await db.collection('tenant_access_requests').doc(uid).set({ userId: uid, status: 'pending' });
  await db.collection(TENANT_APPROVAL_NONCES).doc(uid).set({ nonce, issuedAt: new Date().toISOString() });
}

async function cleanUp(db: Firestore, uid: string) {
  for (const col of ['users', 'tenant_access_requests', TENANT_APPROVAL_NONCES]) {
    await db.collection(col).doc(uid).delete().catch(() => {});
  }
}

const allowed = async (db: Firestore, uid: string) =>
  (await db.collection('users').doc(uid).get()).data()?.s4TenantAccessAllowed;

test.describe('a mailed tenant link does not reverse a decision made in the console (8e830deba3dc)', () => {
  test('the reject link, used after a manual grant, takes nothing away', async () => {
    const db = adminDb();
    const uid = uidOf('grant');
    const nonce = nonceOf(1);
    try {
      await openRequest(db, uid, nonce);
      const rejectLink = createApprovalToken(uid, 'tenant', 'reject', undefined, nonce);

      await adminGrantS4('qa-admin', uid);
      expect(await allowed(db, uid)).toBe(true);

      await expect(approveTenantWithToken('qa-admin', uid, rejectLink, 'reject')).rejects.toThrow();
      expect(await allowed(db, uid), 'a stale reject link revoked a manual grant').toBe(true);
    } finally {
      await cleanUp(db, uid);
    }
  });

  test('the approve link, used after a manual revocation, grants nothing', async () => {
    const db = adminDb();
    const uid = uidOf('revoke');
    const nonce = nonceOf(2);
    try {
      await openRequest(db, uid, nonce);
      const approveLink = createApprovalToken(uid, 'tenant', 'approve', undefined, nonce);

      // The revocation puts the request back to `pending`, which is the state
      // the approve link asks for — only the retired nonce stops it.
      await adminRevokeS4('qa-admin', uid);
      await expect(approveTenantWithToken('qa-admin', uid, approveLink, 'approve')).rejects.toThrow();
      expect(await allowed(db, uid), 'a stale approve link re-granted a manual revocation').toBe(false);
    } finally {
      await cleanUp(db, uid);
    }
  });

  test('a reject link needs the request to be open, as the approve link does', async () => {
    const db = adminDb();
    const uid = uidOf('decided');
    const nonce = nonceOf(3);
    try {
      await openRequest(db, uid, nonce);
      await db.collection('users').doc(uid).set({ s4TenantAccessAllowed: true }, { merge: true });
      await db.collection('tenant_access_requests').doc(uid).set({ status: 'approved' }, { merge: true });
      const rejectLink = createApprovalToken(uid, 'tenant', 'reject', undefined, nonce);

      await expect(approveTenantWithToken('qa-admin', uid, rejectLink, 'reject')).rejects.toThrow(/already approved/);
      expect(await allowed(db, uid)).toBe(true);

      // The control: the same link on an open request still rejects.
      await db.collection('tenant_access_requests').doc(uid).set({ status: 'pending' }, { merge: true });
      await approveTenantWithToken('qa-admin', uid, rejectLink, 'reject');
      expect(await allowed(db, uid)).toBe(false);
      expect((await db.collection('tenant_access_requests').doc(uid).get()).exists).toBe(false);
    } finally {
      await cleanUp(db, uid);
    }
  });
});

test('a tenant request is recorded on the profile before its nonce and its mail (e4e99ed6e2e4)', () => {
  // The account gate is a read. An erasure completing after it was noticed only
  // by the profile update at the end — after the nonce had been written for a
  // uid that no longer exists and the administrator had been mailed the
  // applicant's details. The update that fails on a missing profile now comes
  // first, so an erased account stops before anything is written or sent.
  const src = read('app/api/request-tenant-access/route.ts');
  const post = src.slice(src.indexOf('export async function POST'));
  const gate = post.indexOf('await assertAccountActive(decodedToken.uid)');
  const record = post.indexOf('await updateExistingProfile(uid');
  const nonce = post.indexOf('await issueTenantApprovalNonce(uid)');
  const mail = post.indexOf("fetch('https://api.resend.com/emails'");
  for (const [name, at] of Object.entries({ gate, record, nonce, mail })) {
    expect(at, `${name} is missing from the route`).toBeGreaterThan(-1);
  }
  expect(gate).toBeLessThan(record);
  expect(record, 'the nonce is written before the request is recorded').toBeLessThan(nonce);
  expect(record, 'the mail goes out before the request is recorded').toBeLessThan(mail);
  expect(post.slice(record, nonce)).toContain('s4TenantAccessRequested: true');
});
