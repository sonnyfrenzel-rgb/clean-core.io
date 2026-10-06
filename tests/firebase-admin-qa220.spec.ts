import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  adminGrantS4,
  deleteUserDataAndAccount,
  getAdminDb,
  refundRunQuota,
  reinstatedEntitlements,
  saveGeminiApiKey,
} from '../lib/firebase-admin';

/**
 * QA full review of v2.20.0 — credential writes and the quota refund, run
 * against the Firestore emulator in this process (like
 * tests/qa-full-a12774c.spec.ts), so the interleavings are staged exactly.
 *
 * - dfa3295a22f8: the BYOK secret and the profile metadata were two writes; a
 *   failed second one left a key `loadGeminiApiKey` serves.
 * - 84faa2741a6a: a save in flight during an erasure wrote the secret after
 *   the secrets were purged and merge-set the erased profile back.
 * - 2cf173a1421d: the S/4 vault and the profile metadata, the same two writes.
 * - a4f246498f07: a failed quota refund was swallowed without a trace.
 */

const noAuth = { deleteUser: async () => {} } as unknown as Auth;
const uidOf = (tag: string) => `qa220-e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const geminiRef = (db: Firestore, uid: string) => db.collection('user_secrets').doc(uid).collection('providers').doc('gemini');

test.beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'cleancore-491216' });
  // `encrypt` reads the key at call time; any 32 bytes will do for these writes.
  if (!process.env.S4_ENCRYPTION_KEY) process.env.S4_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

test('a BYOK save for an account without a profile writes nothing and is a 404', async () => {
  const { db } = await getAdminDb();
  const uid = uidOf('noprofile');
  try {
    await expect(saveGeminiApiKey(uid, 'AIza-test-key-1234')).rejects.toMatchObject({ status: 404 });
    expect((await geminiRef(db, uid).get()).exists, 'a key was stored for an account with no profile').toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists, 'the save created a profile').toBe(false);
  } finally {
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
  }
});

test('a BYOK save for an existing profile stores the key and its metadata together', async () => {
  const { db } = await getAdminDb();
  const uid = uidOf('save');
  try {
    await db.collection('users').doc(uid).set({ status: 'approved', geminiApiKey: 'legacy-cleartext' });
    await expect(saveGeminiApiKey(uid, 'AIza-test-key-5678')).resolves.toEqual({ byokConfigured: true, byokLast4: '5678' });
    expect((await geminiRef(db, uid).get()).data()?.last4).toBe('5678');
    const profile = (await db.collection('users').doc(uid).get()).data() || {};
    expect(profile.byokConfigured).toBe(true);
    expect(profile.byokLast4).toBe('5678');
    expect(profile.geminiApiKey).toBeUndefined();
  } finally {
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
  }
});

test('a BYOK save that commits during the erasure is erased with the profile', async () => {
  const { db } = await getAdminDb();
  const uid = uidOf('race');
  try {
    await db.collection('users').doc(uid).set({ email: `${uid}@cleancore-test.io`, status: 'approved' });
    // The save lands after the erasure purged `user_secrets` and before it
    // deletes the profile — the window the finding describes.
    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop === 'collection') {
          return (name: string) => {
            if (name !== 'mfa_pending') return target.collection(name);
            return {
              doc: (id: string) => ({
                delete: async () => {
                  await saveGeminiApiKey(uid, 'AIza-in-flight-9999');
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

    expect((await geminiRef(db, uid).get()).exists, 'the key outlived the erasure').toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists, 'the erased profile came back').toBe(false);
    // And a save after the erasure cannot commit at all.
    await expect(saveGeminiApiKey(uid, 'AIza-after-0000')).rejects.toMatchObject({ status: 404 });
    expect((await geminiRef(db, uid).get()).exists).toBe(false);
    expect((await db.collection('users').doc(uid).get()).exists).toBe(false);
  } finally {
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
  }
});

test('the S/4 vault and the profile metadata are written in one batch', () => {
  // Source-level: `saveS4Credentials` has no injectable database, and the
  // failure is a second write refused after a first one committed, which the
  // emulator cannot be made to do for these two documents alone.
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/s4-credentials.ts'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('export async function saveS4Credentials');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  expect(body).toContain('db.batch()');
  expect(body).toMatch(/batch\.set\(db\.collection\('s4_credentials'\)\.doc\(uid\)/);
  expect(body).toMatch(/batch\.set\(\s*db\.collection\('users'\)\.doc\(uid\)/);
  expect(body.match(/await batch\.commit\(\)/g) ?? []).toHaveLength(1);
  expect(body).not.toMatch(/await db\.collection\(/);
});

test('the S/4 vault and the profile metadata are deleted in one batch', () => {
  // Same reason as above, for the erasure path: a profile write refused after
  // the vault delete committed left a profile claiming a connection that no
  // longer existed (SEC-2026-708).
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/s4-credentials.ts'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('export async function deleteS4Credentials');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  expect(body).toContain('db.batch()');
  expect(body).toMatch(/batch\.delete\(db\.collection\('s4_credentials'\)\.doc\(uid\)\)/);
  expect(body).toMatch(/batch\.set\(\s*db\.collection\('users'\)\.doc\(uid\)/);
  expect(body.match(/await batch\.commit\(\)/g) ?? []).toHaveLength(1);
  expect(body).not.toMatch(/await db\.collection\(/);
});

test('a refund that fails is reported, not swallowed', async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    // A uid with a slash names a collection, not a document: the refund throws
    // inside its own try, which is the failure a Firestore outage produces.
    await expect(refundRunQuota('qa220/not-a-document', 'hash')).resolves.toBeUndefined();
  } finally {
    console.error = original;
  }
  expect(logged.some((args) => String(args[0]).startsWith('refundRunQuota: refund failed')), 'the failed refund left no trace').toBe(true);
  expect(logged.some((args) => args.includes('qa220/not-a-document')), 'the log does not name the account to put right').toBe(true);
});

test.describe('governance actions (f02bdb200067, a4c7686b9c1f)', () => {
  const read = () => fs.readFileSync(path.join(process.cwd(), 'lib/firebase-admin.ts'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (name: string) => {
    const src = read();
    const start = src.indexOf(`export async function ${name}(`);
    expect(start, `${name} is still in lib/firebase-admin.ts`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf('\n}\n', start));
  };

  test('state and audit row commit in one batch for every governance action', () => {
    for (const [name, action] of [
      ['adminApproveUser', 'APPROVE_USER'],
      ['adminRevokeUser', 'REVOKE_USER'],
      ['adminGrantS4', 'GRANT_S4'],
      ['adminRevokeS4', 'REVOKE_S4'],
    ] as const) {
      const body = fn(name);
      expect(body, `${name} writes outside a batch`).not.toMatch(/await (db\.collection\([^)]*\)\.doc\([^)]*\)|regRef)\.set\(/);
      expect(body, `${name} logs its audit row after the fact`).not.toContain('logAuditEvent(');
      expect(body).toContain(`batch.set(db.collection('audit_events').doc(), await auditEventRecord(db, adminUid, '${action}', targetUid))`);
      expect(body.match(/await batch\.commit\(\)/g) ?? [], name).toHaveLength(1);
    }
  });

  test('an S/4 grant leaves the access and the record of who granted it', async () => {
    const { db } = await getAdminDb();
    const target = uidOf('s4-target');
    const admin = uidOf('s4-admin');
    try {
      await db.collection('users').doc(target).set({ status: 'approved' });
      await db.collection('tenant_access_requests').doc(target).set({ status: 'pending' });
      await adminGrantS4(admin, target);
      expect((await db.collection('users').doc(target).get()).data()?.s4TenantAccessAllowed).toBe(true);
      expect((await db.collection('tenant_access_requests').doc(target).get()).data()?.status).toBe('approved');
      const events = await db.collection('audit_events').where('targetUid', '==', target).get();
      expect(events.docs.map((d: QueryDocumentSnapshot) => d.data().action)).toEqual(['GRANT_S4']);
      expect(events.docs[0].data().actorUid).toBe(admin);
    } finally {
      const events = await db.collection('audit_events').where('targetUid', '==', target).get();
      await Promise.all(events.docs.map((d: QueryDocumentSnapshot) => d.ref.delete().catch(() => {})));
      await db.collection('tenant_access_requests').doc(target).delete().catch(() => {});
      await db.collection('users').doc(target).delete().catch(() => {});
    }
  });

  test('reinstating an enterprise account keeps its tier; any other account is reinstated as a pilot', () => {
    expect(reinstatedEntitlements({ tier: 'enterprise' })).not.toHaveProperty('tier');
    expect(reinstatedEntitlements({ tier: 'enterprise' }).status).toBe('approved');
    expect(reinstatedEntitlements({ tier: 'pilot' }).tier).toBe('pilot');
    expect(reinstatedEntitlements(undefined).tier).toBe('pilot');
    expect(fn('adminApproveUser')).toContain('...reinstatedEntitlements(');
    expect(fn('adminApproveUser')).not.toContain("tier: 'pilot'");
  });
});
