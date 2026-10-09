import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, type User } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc, adminSetEmailVerified } from './helpers/admin-seed';
import { invitationCollectionPath, PROJECT_READERS_FIELD } from '../lib/invitations';
import { openInvitationsOf } from '../lib/open-invitations';
import { openInvitationsAsOwner, readOpenInvitations, INVITATION_RATE_LIMITS, INVITATION_SEND_RATE_LIMIT } from '../lib/invitation-owner-gate';
import fs from 'fs';
import path_ from 'path';
import { getAdminDb } from '../lib/firebase-admin';

/**
 * Owner decision 01.10.2026 — while an invitation is unanswered, the person who
 * sent it sees the address, the date it expires, and a way to withdraw it.
 *
 *   GET    /api/projects/{id}/invitations          — one project's open ones
 *   GET    /api/invitations                         — every project this account owns
 *   DELETE /api/projects/{id}/invitations/{inv}     — withdraw one
 *
 * Claims, each checked against the server rather than a rendering:
 *
 *   1. the owner sees exactly the open invitations — not the accepted, the
 *      withdrawn or the expired ones;
 *   2. the invited reader and a stranger see nothing — the same 404 a missing
 *      project gives — on every one of the three;
 *   3. a withdrawal kills the link: the accept route refuses it afterwards and
 *      nobody lands on the readers list;
 *   4. an accepted invitation cannot be "withdrawn" here — that is the readers
 *      route's revocation, which also takes the uid off the project.
 */

const STAMP = Date.now();
const OWNER = `open-inv-owner-${STAMP}@cleancore-test.io`;
const READER = `open-inv-reader-${STAMP}@cleancore-test.io`;
const STRANGER = `open-inv-stranger-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT = `open-inv-project-${STAMP}`;

const PENDING = `pending${STAMP}`;
const PENDING_READER = `pendingreader${STAMP}`;
const ACCEPTED = `accepted${STAMP}`;
const REVOKED = `revoked${STAMP}`;
const EXPIRED = `expired${STAMP}`;

const accounts: Record<string, { uid: string; token: string; user: User }> = {};
const auth = (email: string) => ({ Authorization: `Bearer ${accounts[email].token}` });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

async function makeAccount(email: string) {
  const a = getAuth(app);
  try {
    connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  const cred = await createUserWithEmailAndPassword(a, email, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Open', lastName: 'Invitations', email, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  await adminSetEmailVerified(cred.user.uid, true);
  accounts[email] = { uid: cred.user.uid, token: await cred.user.getIdToken(true), user: cred.user };
}

function invitation(id: string, email: string, status: string, expiresInDays: number) {
  const now = Date.now();
  return {
    id, projectId: PROJECT, email,
    invitedBy: { uid: accounts[OWNER].uid, name: 'Owner' },
    invitedAt: new Date(now - 864e5).toISOString(),
    expiresAt: new Date(now + expiresInDays * 864e5).toISOString(),
    status, acceptedBy: status === 'accepted' ? { uid: accounts[READER].uid, email: READER } : null,
    acceptedAt: status === 'accepted' ? new Date().toISOString() : null,
    revokedAt: status === 'revoked' ? new Date().toISOString() : null,
  };
}

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  await makeAccount(OWNER);
  await makeAccount(READER);
  await makeAccount(STRANGER);
  await adminSetDoc('projects', PROJECT, {
    name: 'Open invitations', userId: accounts[OWNER].uid, createdAt: new Date(),
    legacyCode: 'REPORT z_open_inv.', [PROJECT_READERS_FIELD]: [accounts[READER].uid],
  });
  const path = invitationCollectionPath(PROJECT);
  await adminSetDoc(path, PENDING, invitation(PENDING, 'someone@example.com', 'pending', 10));
  await adminSetDoc(path, PENDING_READER, invitation(PENDING_READER, READER, 'pending', 3));
  await adminSetDoc(path, ACCEPTED, invitation(ACCEPTED, READER, 'accepted', 10));
  await adminSetDoc(path, REVOKED, invitation(REVOKED, 'gone@example.com', 'revoked', 10));
  await adminSetDoc(path, EXPIRED, invitation(EXPIRED, 'late@example.com', 'pending', -1));
});

test('the pure filter keeps only what may still be accepted, soonest expiry first', () => {
  const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
  const now = new Date('2026-10-01T12:00:00Z');
  const list = openInvitationsOf(
    [
      doc('a', { projectId: 'p', email: 'a@x.io', status: 'pending', expiresAt: '2026-10-09T00:00:00Z', invitedAt: '' }),
      doc('b', { projectId: 'p', email: 'b@x.io', status: 'pending', expiresAt: '2026-10-03T00:00:00Z', invitedAt: '' }),
      doc('c', { projectId: 'p', email: 'c@x.io', status: 'accepted', expiresAt: '2026-10-09T00:00:00Z' }),
      doc('d', { projectId: 'p', email: 'd@x.io', status: 'revoked', expiresAt: '2026-10-09T00:00:00Z' }),
      doc('e', { projectId: 'p', email: 'e@x.io', status: 'pending', expiresAt: '2026-09-30T00:00:00Z' }),
      // A record copied in from another project verifies against nothing.
      doc('f', { projectId: 'other', email: 'f@x.io', status: 'pending', expiresAt: '2026-10-09T00:00:00Z' }),
    ],
    'p',
    now,
  );
  expect(list.map((e) => e.id)).toEqual(['b', 'a']);
});

test('the owner sees exactly the open invitations of the project, with address and expiry', async ({ request }) => {
  const res = await request.get(`/api/projects/${PROJECT}/invitations`, { headers: auth(OWNER) });
  expect(res.status()).toBe(200);
  const { open } = (await res.json()) as { open: Array<{ id: string; email: string; expiresAt: string }> };
  expect(open.map((e) => e.id).sort()).toEqual([PENDING, PENDING_READER].sort());
  const pending = open.find((e) => e.id === PENDING)!;
  expect(pending.email).toBe('someone@example.com');
  expect(Date.parse(pending.expiresAt)).toBeGreaterThan(Date.now());
});

test('the account-wide list carries the same invitations, each naming its project', async ({ request }) => {
  const res = await request.get('/api/invitations', { headers: auth(OWNER) });
  expect(res.status()).toBe(200);
  const { open } = (await res.json()) as { open: Array<{ id: string; projectId: string; projectName: string }> };
  const mine = open.filter((e) => e.projectId === PROJECT);
  expect(mine.map((e) => e.id).sort()).toEqual([PENDING, PENDING_READER].sort());
  expect(mine.every((e) => e.projectName === 'Open invitations')).toBe(true);
});

test('the invited reader and a stranger get 404 from the project list and nothing from the account list', async ({ request }) => {
  for (const who of [READER, STRANGER]) {
    const res = await request.get(`/api/projects/${PROJECT}/invitations`, { headers: auth(who) });
    expect(res.status(), `${who} must not read the owner's invitations`).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('someone@example.com');

    const all = await request.get('/api/invitations', { headers: auth(who) });
    expect(all.status()).toBe(200);
    const { open } = (await all.json()) as { open: Array<{ projectId: string }> };
    expect(open.some((e) => e.projectId === PROJECT), `${who} sees another owner's invitations`).toBe(false);
  }
});

test('without a token, every one of the three answers 401', async ({ request }) => {
  expect((await request.get(`/api/projects/${PROJECT}/invitations`)).status()).toBe(401);
  expect((await request.get('/api/invitations')).status()).toBe(401);
  expect((await request.delete(`/api/projects/${PROJECT}/invitations/${PENDING}`)).status()).toBe(401);
});

test('the reader and a stranger cannot withdraw — 404, and the invitation stays open', async ({ request }) => {
  for (const who of [READER, STRANGER]) {
    const res = await request.delete(`/api/projects/${PROJECT}/invitations/${PENDING}`, { headers: auth(who) });
    expect(res.status()).toBe(404);
  }
  const doc = await adminGetDoc(invitationCollectionPath(PROJECT), PENDING);
  expect(doc?.status).toBe('pending');
});

test('an accepted invitation is not withdrawn here — the readers route ends access', async ({ request }) => {
  const res = await request.delete(`/api/projects/${PROJECT}/invitations/${ACCEPTED}`, { headers: auth(OWNER) });
  expect(res.status()).toBe(409);
  expect(((await res.json()) as { code?: string }).code).toBe('accepted');
  const doc = await adminGetDoc(invitationCollectionPath(PROJECT), ACCEPTED);
  expect(doc?.status).toBe('accepted');
});

test('withdrawing kills the link: the owner withdraws, the list drops it, and the accept route refuses it', async ({ request }) => {
  const res = await request.delete(`/api/projects/${PROJECT}/invitations/${PENDING_READER}`, { headers: auth(OWNER) });
  expect(res.status()).toBe(200);

  const doc = await adminGetDoc(invitationCollectionPath(PROJECT), PENDING_READER);
  expect(doc?.status).toBe('revoked');
  expect(typeof doc?.revokedAt).toBe('string');

  const list = await request.get(`/api/projects/${PROJECT}/invitations`, { headers: auth(OWNER) });
  const { open } = (await list.json()) as { open: Array<{ id: string }> };
  expect(open.map((e) => e.id)).toEqual([PENDING]);

  // The invited account opens the dead link: refused, and nothing is granted.
  const before = ((await adminGetDoc('projects', PROJECT))?.[PROJECT_READERS_FIELD] ?? []) as string[];
  const accept = await request.post(`/api/projects/${PROJECT}/invitations/${PENDING_READER}/accept`, {
    headers: { ...auth(READER), 'Content-Type': 'application/json' },
  });
  expect(accept.status()).toBeGreaterThanOrEqual(400);
  const after = ((await adminGetDoc('projects', PROJECT))?.[PROJECT_READERS_FIELD] ?? []) as string[];
  expect(after).toEqual(before);

  // A second withdrawal has nothing left to do.
  const again = await request.delete(`/api/projects/${PROJECT}/invitations/${PENDING_READER}`, { headers: auth(OWNER) });
  expect(again.status()).toBe(409);
});

test('a malformed invitation id is refused before it forms a path', async ({ request }) => {
  const res = await request.delete(`/api/projects/${PROJECT}/invitations/${encodeURIComponent('a/b')}`, {
    headers: auth(OWNER),
  });
  expect([400, 404]).toContain(res.status());
});

test('"Shared with me" names the project to its reader only — ids, through the server', async ({ request }) => {
  const read = async (who: string) => {
    const res = await request.get('/api/shared-projects', { headers: auth(who) });
    expect(res.status()).toBe(200);
    return ((await res.json()) as { ids: string[] }).ids;
  };
  expect(await read(READER)).toContain(PROJECT);
  expect(await read(STRANGER)).not.toContain(PROJECT);
  // The owner's own project is never "shared with" the owner.
  expect(await read(OWNER)).not.toContain(PROJECT);
  expect((await request.get('/api/shared-projects')).status()).toBe(401);
});

/**
 * Withdrawing is limited like inviting (owner decision 02.10.2026): 20 an hour
 * per account. It used to share the reading budget of 60, so the 21st
 * withdrawal in an hour still went through.
 *
 * The limiter is off while `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is `true`, so no
 * route call can observe it. The gate both routes share is called here directly
 * with the flag lifted for this test process only — `FIRESTORE_EMULATOR_HOST`
 * stays set, so every read and write goes to the emulator (the pattern of
 * `tests/byok-hardening.spec.ts`). A uid with no profile: every call inside the
 * budget is refused by the account check behind the limiter, which is fine —
 * what is counted is whether the limiter let it through to that check.
 */
test('withdrawing is rate-limited like inviting: the 21st call in an hour is refused', async () => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this test would reach a real database').toBeTruthy();
  await getAdminDb(); // initialised in emulator mode, before the flag is lifted
  const uid = `withdraw-limit-${STAMP}-${Math.floor(Math.random() * 1e6)}`;
  const saved = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'false';
  try {
    for (let i = 0; i < 20; i += 1) {
      const gate = await openInvitationsAsOwner(uid, PROJECT, 'invitations-withdraw');
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.response.status, `withdrawal ${i + 1} of 20 is within the budget`).not.toBe(429);
    }
    const over = await openInvitationsAsOwner(uid, PROJECT, 'invitations-withdraw');
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.response.status, 'the 21st withdrawal in an hour went through').toBe(429);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
    else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = saved;
  }
  // And the budget is the inviting one by name, not a copy of its number.
  expect(INVITATION_RATE_LIMITS['invitations-withdraw']).toBe(INVITATION_SEND_RATE_LIMIT);
});

/**
 * QA review of dd8e996 (9703f5e20b75): the list read one page of 500 unexpired
 * invitations and filtered afterwards, so accepted and withdrawn ones expiring
 * sooner could fill the page and cut a pending one off. The helper the route
 * calls walks the pages in expiry order; a page size of 2 makes five
 * non-open invitations three pages deep without seeding five hundred.
 * Needs the Firestore emulator (Admin SDK).
 */
test('a pending invitation behind a full page of accepted and withdrawn ones is still listed', async () => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this test would reach a real database').toBeTruthy();
  const project = `open-inv-paged-${STAMP}`;
  await adminSetDoc('projects', project, {
    name: 'Paged invitations', userId: accounts[OWNER].uid, createdAt: new Date(), legacyCode: 'REPORT z_paged.',
  });
  const path = invitationCollectionPath(project);
  const seed = async (id: string, status: string, expiresInDays: number) =>
    adminSetDoc(path, id, { ...invitation(id, `${id}@example.com`, status, expiresInDays), projectId: project });
  // Five that hold no slot, all expiring before the pending one.
  for (let i = 0; i < 5; i += 1) await seed(`closed${i}${STAMP}`, i % 2 ? 'revoked' : 'accepted', 1 + i * 0.1);
  await seed(`late${STAMP}`, 'pending', 9);

  const { db } = await getAdminDb();
  const list = await readOpenInvitations(db, project, new Date(), 2);
  expect(list.map((e) => e.id)).toEqual([`late${STAMP}`]);
  // The ceiling still holds: one page of two reads nothing past the first page.
  expect(await readOpenInvitations(db, project, new Date(), 2, 1)).toEqual([]);

  // And the route reads through the helper, not a single bounded query.
  const route = fs.readFileSync(path_.join(process.cwd(), 'app/api/projects/[projectId]/invitations/route.ts'), 'utf8');
  expect(route).toContain('readOpenInvitations(gate.db, gate.projectId)');
});
