import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getApps as adminApps, initializeApp as initAdmin } from 'firebase-admin/app';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import {
  approveTenantWithToken,
  getAdminDb,
  issueTenantApprovalNonce,
  recordRunnerSelftest,
} from '../lib/firebase-admin';
import { createApprovalToken } from '../lib/approval-token';

/**
 * Three administrator acts that left no `audit_events` row (owner decision
 * 02.10.2026, SECURITY.md §3.6): granting or withdrawing the admin claim,
 * deciding a tenant access request through the mailed link, and running the
 * runner self-test. Each now writes one row in the shape the console actions
 * write (`auditEventRecord`: actorUid, actorEmail, action, targetUid,
 * timestamp) and nothing more.
 *
 * The tenant link and the self-test record are called in this process against
 * the Firestore emulator (like tests/firebase-admin-qa220.spec.ts). The claim
 * goes through its route: `setAdminClaim` reaches the Auth module, which this
 * process cannot load (see tests/admin-revocation.spec.ts).
 */

const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const ROW_KEYS = ['action', 'actorEmail', 'actorUid', 'targetUid', 'timestamp'];
const uidOf = (tag: string) => `audit-rows-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.beforeAll(() => {
  if (adminApps().length === 0) initAdmin({ projectId: firebaseConfig.projectId });
});

async function rowsFor(targetUid: string): Promise<Array<Record<string, unknown>>> {
  const { db } = await getAdminDb();
  const snap = await db.collection('audit_events').where('targetUid', '==', targetUid).get();
  return snap.docs.map((d: QueryDocumentSnapshot) => d.data() as Record<string, unknown>);
}

async function dropRows(targetUid: string) {
  const { db } = await getAdminDb();
  const snap = await db.collection('audit_events').where('targetUid', '==', targetUid).get();
  await Promise.all(snap.docs.map((d: QueryDocumentSnapshot) => d.ref.delete().catch(() => {})));
}

test.describe('the tenant decision through the mailed link', () => {
  for (const action of ['approve', 'reject'] as const) {
    test(`a ${action} link writes the decision and its row together`, async () => {
      const { db } = await getAdminDb();
      const target = uidOf(`tenant-${action}`);
      const admin = uidOf('tenant-admin');
      try {
        await db.collection('users').doc(admin).set({ email: 'admin@cleancore-test.io' });
        await db.collection('users').doc(target).set({ status: 'approved', s4TenantAccessRequested: true });
        await db.collection('tenant_access_requests').doc(target).set({ status: 'pending' });
        const nonce = await issueTenantApprovalNonce(target);
        const token = createApprovalToken(target, 'tenant', action, undefined, nonce);

        await approveTenantWithToken(admin, target, token, action);

        const rows = await rowsFor(target);
        expect(rows.map((r) => r.action), `the ${action} link left no record`).toEqual([
          action === 'approve' ? 'GRANT_S4_LINK' : 'REJECT_S4_LINK',
        ]);
        expect(Object.keys(rows[0]).sort()).toEqual(ROW_KEYS);
        expect(rows[0].actorUid).toBe(admin);
        expect(rows[0].actorEmail).toBe('admin@cleancore-test.io');
        // The token is a credential; it never reaches the journal.
        expect(JSON.stringify(rows[0])).not.toContain(nonce);

        // A refused second use writes no second row: the row is part of the
        // decision, not of the attempt.
        await expect(approveTenantWithToken(admin, target, token, action)).rejects.toThrow();
        expect(await rowsFor(target)).toHaveLength(1);
      } finally {
        await dropRows(target);
        await db.collection('tenant_access_requests').doc(target).delete().catch(() => {});
        await db.collection('users').doc(target).delete().catch(() => {});
        await db.collection('users').doc(admin).delete().catch(() => {});
      }
    });
  }
});

test.describe('the runner self-test', () => {
  test('records who ran it and the verdict, and nothing else', async () => {
    const admin = uidOf('selftest-admin');
    try {
      await recordRunnerSelftest(admin, 'incomplete');
      const rows = await rowsFor(admin);
      expect(rows.map((r) => r.action)).toEqual(['RUNNER_SELFTEST:incomplete']);
      expect(Object.keys(rows[0]).sort()).toEqual(ROW_KEYS);
      expect(rows[0].actorUid).toBe(admin);

      // The verdict is the only caller-shaped part of the action; anything that
      // is not one is recorded as unknown rather than written through.
      await recordRunnerSelftest(admin, 'held: <script>');
      expect((await rowsFor(admin)).map((r) => r.action).sort()).toEqual([
        'RUNNER_SELFTEST:incomplete',
        'RUNNER_SELFTEST:unknown',
      ]);
    } finally {
      await dropRows(admin);
    }
  });

  test('the route records the verdict before it answers', () => {
    // The route needs a runner to reach this line, and the emulator run has
    // none (RUNNER_URL unset answers 409 first), so the call site is held here
    // and the record itself above.
    const src = fs
      .readFileSync(path.resolve(__dirname, '../app/api/admin/runner-selftest/route.ts'), 'utf8')
      .replace(/\r\n/g, '\n');
    const at = src.indexOf('await recordRunnerSelftest(decodedAdmin.uid, status)');
    expect(at, 'the self-test route writes no audit row').toBeGreaterThan(-1);
    expect(at, 'the row is written before the verdict exists').toBeGreaterThan(src.indexOf('combineSelftest({'));
    expect(at, 'the verdict is answered before its row is written').toBeLessThan(src.indexOf('return NextResponse.json({\n      held,'));
  });
});

test.describe('granting and withdrawing the admin claim', () => {
  function clientAuth() {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    } catch { /* already connected */ }
    return auth;
  }

  async function seedAccount(tag: string) {
    const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(clientAuth(), email, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Audit', lastName: 'Rows', email,
      tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    return { uid: cred.user.uid, email, user: cred.user };
  }

  async function removeAccount(uid: string) {
    const { db } = await getAdminDb();
    await db.collection('users').doc(uid).delete().catch(() => {});
    await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${firebaseConfig.projectId}/accounts/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    }).catch(() => {});
  }

  test('each direction leaves one row naming the administrator and the account', async ({ request }: { request: APIRequestContext }) => {
    test.setTimeout(90 * 1000);
    const admin = await seedAccount('audit-rows-admin');
    const target = await seedAccount('audit-rows-target');
    try {
      await adminSetCustomClaim(admin.uid, { admin: true });
      const token = await admin.user.getIdToken(true);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const grant = await request.post('/api/admin/set-admin-claim', { headers, data: { uid: target.uid, isAdmin: true } });
      expect(grant.status()).toBe(200);
      const withdraw = await request.post('/api/admin/set-admin-claim', { headers, data: { uid: target.uid, isAdmin: false } });
      expect(withdraw.status()).toBe(200);

      const rows = await rowsFor(target.uid);
      expect(rows.map((r) => r.action).sort(), 'a claim change left no record').toEqual(['GRANT_ADMIN', 'REVOKE_ADMIN']);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
        expect(row.actorUid).toBe(admin.uid);
        expect(row.actorEmail).toBe(admin.email);
      }
    } finally {
      await dropRows(target.uid);
      await removeAccount(target.uid);
      await removeAccount(admin.uid);
    }
  });
});
