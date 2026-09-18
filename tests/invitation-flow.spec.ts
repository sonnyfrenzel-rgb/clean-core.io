import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, type User } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminGetDoc, adminMergeDoc, adminSetEmailVerified } from './helpers/admin-seed';
import {
  INVITATION_CLOSED_CODE,
  INVITATION_COLLECTION,
  INVITATION_DEFAULT_DAYS,
  INVITATION_MAX_OPEN,
  INVITATION_TOO_MANY_CODE,
  PROJECT_READERS_FIELD,
  effectiveStatus,
  invitationCollectionPath,
  invitationExpiry,
  normaliseInvitedEmail,
  type Invitation,
} from '../lib/invitations';
import { parseClientWritableProjectFields } from '../lib/firestore-rules-contract';

/**
 * Roadmap 5.2 and 5.3, against the emulators and the real routes.
 *
 * The three the phase is accepted on:
 *
 *   1. **a forwarded link opens nothing for another account** (C23-A14) — and
 *      it fails with the *same* answer as an invitation that never existed, so
 *      the route cannot be used to find out whether one does;
 *   2. **an unconfirmed password account gets no insight** — it is told to
 *      confirm its address, which is the same answer it gets for an address
 *      nobody invited, and its uid does not reach `readers`;
 *   3. **nothing on the record comes out of the body** — the times are the
 *      server's clock, `invitedBy` is the verified token, and an expiry longer
 *      than the policy is replaced rather than honoured.
 *
 * Plus the two that make the first three mean something: an expired invitation
 * does not open, and the one that does open writes the reader onto the project
 * document where `firestore.rules` can see them (5.4, not built here).
 *
 * `email_verified` travels inside the ID token, so every account here re-mints
 * its token after the Admin SDK has set it. That is not ceremony: a spec that
 * set the flag and kept the old token would be testing the old token.
 */

const STAMP = Date.now();
const OWNER_EMAIL = `invitation-owner-${STAMP}@cleancore-test.io`;
/** Invited, confirmed — the one account the link is for. */
const READER_EMAIL = `invitation-reader-${STAMP}@cleancore-test.io`;
/** Invited, never confirmed its address. */
const UNCONFIRMED_EMAIL = `invitation-unconfirmed-${STAMP}@cleancore-test.io`;
/** Confirmed, never invited — the person the link was forwarded to. */
const STRANGER_EMAIL = `invitation-stranger-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;

const PROJECT_ID = `invitation-project-${STAMP}`;
const EXPIRED_ID = `expired-${STAMP}`;
const NO_SUCH_ID = `never-existed-${STAMP}`;

const accounts: Record<string, { uid: string; token: string; user: User }> = {};
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

async function makeAccount(email: string, confirmed: boolean, terms: boolean): Promise<User> {
  const auth = getAuth(app);
  const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Invitation',
    lastName: email.split('@')[0],
    email,
    tier: 'pilot',
    status: 'approved',
    activatedAt: new Date(),
    transformationsUsed: 0,
    transformationsLimit: 50,
    ...(terms ? { termsVersionAccepted: TERMS_VERSION } : {}),
    mfaEnabled: false,
    createdAt: new Date(),
  });
  if (confirmed) await adminSetEmailVerified(cred.user.uid, true);
  // The flag lives in the token, so the token has to be re-minted after it moves.
  accounts[email] = { uid: cred.user.uid, token: await cred.user.getIdToken(true), user: cred.user };
  return cred.user;
}

/** A fresh ID token for one account — the `User` object keeps its own refresh token. */
async function remint(email: string): Promise<void> {
  accounts[email].token = await accounts[email].user.getIdToken(true);
}

async function readersOf(): Promise<string[]> {
  const project = await adminGetDoc('projects', PROJECT_ID);
  const readers = project?.[PROJECT_READERS_FIELD];
  return Array.isArray(readers) ? readers : [];
}

/**
 * Every invitation these tests created, so that one test's leftovers are not
 * the next test's ceiling. See `test.afterEach` below.
 */
const createdHere: string[] = [];

async function invite(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ status: number; invitation?: Invitation; error?: string; code?: string }> {
  const res = await request.post(`/api/projects/${PROJECT_ID}/invitations`, {
    headers: headers(accounts[OWNER_EMAIL].token),
    data: body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    invitation?: Invitation;
    error?: string;
    code?: string;
  };
  if (json.invitation?.id) createdHere.push(json.invitation.id);
  return { status: res.status(), ...json };
}

/** Withdraw an invitation the way 5.5 does, without going through the route. */
async function withdraw(id: string) {
  await adminMergeDoc(invitationCollectionPath(PROJECT_ID), id, {
    status: 'revoked',
    revokedAt: new Date().toISOString(),
  });
}

async function accept(request: APIRequestContext, email: string, invitationId: string) {
  const res = await request.post(
    `/api/projects/${PROJECT_ID}/invitations/${invitationId}/accept`,
    { headers: headers(accounts[email].token) },
  );
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  await makeAccount(OWNER_EMAIL, true, true);
  await makeAccount(READER_EMAIL, true, true);
  await makeAccount(UNCONFIRMED_EMAIL, false, true);
  await makeAccount(STRANGER_EMAIL, true, true);

  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release',
    userId: accounts[OWNER_EMAIL].uid,
    createdAt: new Date(),
    status: 'analyzed',
    legacyCode: 'REPORT z_invitation_spec.',
  });

  // An invitation that was open and is not any more. Seeded rather than aged,
  // because the alternative is a spec that waits fourteen days.
  await adminSetDoc(invitationCollectionPath(PROJECT_ID), EXPIRED_ID, {
    id: EXPIRED_ID,
    projectId: PROJECT_ID,
    email: READER_EMAIL.toLowerCase(),
    invitedBy: { uid: accounts[OWNER_EMAIL].uid, name: 'Invitation Owner' },
    invitedAt: new Date(STAMP - 40 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(STAMP - 26 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  });
});

/**
 * A project holds three open invitations at once since 18.09.2026
 * (`INVITATION_MAX_OPEN`), and most tests in this file create one. Left where
 * they fall, the fourth test would be refused by the ceiling and would report
 * that as a failure of whatever it was actually checking — a spec failing for a
 * reason that is not in the change under test.
 *
 * Only *open* invitations are withdrawn. The expired fixture from `beforeAll`
 * and the accepted one that put a reader on the project are read by later
 * tests, and neither holds a slot anyway.
 */
test.afterEach(async () => {
  while (createdHere.length) {
    const id = createdHere.pop()!;
    const stored = (await adminGetDoc(invitationCollectionPath(PROJECT_ID), id)) as Invitation | null;
    if (!stored || effectiveStatus(stored) !== 'pending') continue;
    await withdraw(id);
  }
});

test('the server under test has both routes', async ({ request }) => {
  // Several dev servers run on this machine; one without phase 5 answers 404
  // here and every refusal below would pass for the wrong reason.
  const created = await invite(request, { email: READER_EMAIL });
  expect(created.status, JSON.stringify(created)).toBe(201);
  expect(created.invitation?.projectId).toBe(PROJECT_ID);
});

test('nothing on the invitation comes out of the body', async ({ request }) => {
  const before = Date.now();
  const created = await invite(request, {
    email: `  ${READER_EMAIL.toUpperCase()}  `,
    // Every field the caller would like to choose. None of them may land.
    invitedAt: '1999-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    expiresInDays: 9999,
    invitedBy: { uid: accounts[STRANGER_EMAIL].uid, name: 'Somebody Else' },
    status: 'accepted',
    acceptedBy: { uid: accounts[STRANGER_EMAIL].uid, email: STRANGER_EMAIL },
    acceptedAt: '1999-01-01T00:00:00.000Z',
    revokedAt: null,
    projectId: 'some-other-project',
  });
  expect(created.status, JSON.stringify(created)).toBe(201);

  // What was *stored*, not what the route answered: the subcollection has no
  // match in firestore.rules, so this is the only way to look at it.
  const stored = (await adminGetDoc(
    invitationCollectionPath(PROJECT_ID),
    created.invitation!.id,
  )) as Invitation;

  expect(stored.email, 'the address was not normalised').toBe(READER_EMAIL.toLowerCase());
  expect(stored.projectId).toBe(PROJECT_ID);
  expect(stored.invitedBy.uid).toBe(accounts[OWNER_EMAIL].uid);
  expect(stored.status).toBe('pending');
  expect(stored.acceptedBy).toBeNull();
  expect(stored.acceptedAt).toBeNull();
  expect(stored.revokedAt).toBeNull();

  expect(stored.invitedAt).not.toBe('1999-01-01T00:00:00.000Z');
  const invitedAt = Date.parse(stored.invitedAt);
  expect(Number.isNaN(invitedAt), `invitedAt is not a time: ${stored.invitedAt}`).toBe(false);
  expect(invitedAt).toBeGreaterThanOrEqual(before - 60_000);
  expect(invitedAt).toBeLessThanOrEqual(Date.now() + 60_000);

  // 9999 days is not honoured and not rejected either — it collapses to the
  // policy's default, so a caller cannot mint a grant that outlives it.
  expect(stored.expiresAt).not.toBe('2099-01-01T00:00:00.000Z');
  const expected = invitationExpiry(new Date(stored.invitedAt)).getTime();
  expect(Math.abs(Date.parse(stored.expiresAt) - expected)).toBeLessThan(2000);
  const days = (Date.parse(stored.expiresAt) - invitedAt) / (24 * 60 * 60 * 1000);
  expect(Math.round(days)).toBe(INVITATION_DEFAULT_DAYS);
});

test('only the owner may invite anybody to this project', async ({ request }) => {
  const res = await request.post(`/api/projects/${PROJECT_ID}/invitations`, {
    headers: headers(accounts[STRANGER_EMAIL].token),
    data: { email: STRANGER_EMAIL },
  });
  expect(res.status()).toBe(403);
  const unauthenticated = await request.post(`/api/projects/${PROJECT_ID}/invitations`, {
    data: { email: STRANGER_EMAIL },
  });
  expect(unauthenticated.status()).toBe(401);
});

test('a forwarded link opens nothing for another account — and says nothing either', async ({ request }) => {
  const created = await invite(request, { email: READER_EMAIL });
  expect(created.status).toBe(201);
  const id = created.invitation!.id;

  const forwarded = await accept(request, STRANGER_EMAIL, id);
  expect(forwarded.status).toBe(403);
  expect(forwarded.body.code).toBe(INVITATION_CLOSED_CODE);

  // The probe test: an invitation that exists but is not theirs and one that
  // never existed have to be indistinguishable, or the route tells an attacker
  // which addresses have been invited.
  const imagined = await accept(request, STRANGER_EMAIL, NO_SUCH_ID);
  expect(imagined.status).toBe(forwarded.status);
  expect(imagined.body).toEqual(forwarded.body);

  // …and so does an expired one, which is a third thing the answer must not name.
  const expired = await accept(request, STRANGER_EMAIL, EXPIRED_ID);
  expect(expired.body).toEqual(forwarded.body);

  expect(await readersOf(), 'a stranger reached the readers of the project').not.toContain(
    accounts[STRANGER_EMAIL].uid,
  );
  // The invitation itself was not touched by the attempt.
  const stored = (await adminGetDoc(invitationCollectionPath(PROJECT_ID), id)) as Invitation;
  expect(stored.status).toBe('pending');
  expect(stored.acceptedBy).toBeNull();
});

test('an unconfirmed password account does not get insight', async ({ request }) => {
  const created = await invite(request, { email: UNCONFIRMED_EMAIL });
  expect(created.status).toBe(201);

  const tried = await accept(request, UNCONFIRMED_EMAIL, created.invitation!.id);
  expect(tried.status).toBe(403);
  expect(tried.body.code).toBe('email-unconfirmed');
  // The confirmation mail is sent at this moment — roadmap 5.3 — and the answer
  // reports whether it went out rather than claiming it did. Against the
  // emulators with no provider key the console is the delivery channel, which
  // is a delivery (`lib/mail-delivery-mode.ts`), so it is `true` here and in CI.
  expect(tried.body.confirmationSent, 'no confirmation mail was sent').toBe(true);

  expect(await readersOf()).not.toContain(accounts[UNCONFIRMED_EMAIL].uid);
  const stored = (await adminGetDoc(
    invitationCollectionPath(PROJECT_ID),
    created.invitation!.id,
  )) as Invitation;
  expect(stored.status).toBe('pending');

  // And the moment the address is confirmed, the same link opens. Nothing about
  // registration changed — only what an unconfirmed address is worth. This is
  // the half that makes the refusal above a gate rather than a wall: without
  // it, "no insight" would also pass for a route that never opens at all.
  await adminSetEmailVerified(accounts[UNCONFIRMED_EMAIL].uid, true);
  await remint(UNCONFIRMED_EMAIL);
  const opened = await accept(request, UNCONFIRMED_EMAIL, created.invitation!.id);
  expect(opened.status, JSON.stringify(opened.body)).toBe(200);
  expect(await readersOf()).toContain(accounts[UNCONFIRMED_EMAIL].uid);
});

test('an expired invitation does not open, not even for the right account', async ({ request }) => {
  const seeded = (await adminGetDoc(invitationCollectionPath(PROJECT_ID), EXPIRED_ID)) as Invitation;
  expect(effectiveStatus(seeded), 'the fixture is not expired').toBe('expired');

  const tried = await accept(request, READER_EMAIL, EXPIRED_ID);
  expect(tried.status).toBe(403);
  expect(tried.body.code).toBe(INVITATION_CLOSED_CODE);
  expect(await readersOf()).not.toContain(accounts[READER_EMAIL].uid);
});

test('the invited, confirmed account opens it — once, and it lands on the project', async ({ request }) => {
  const created = await invite(request, { email: READER_EMAIL });
  expect(created.status).toBe(201);
  const id = created.invitation!.id;

  const before = Date.now();
  const opened = await accept(request, READER_EMAIL, id);
  expect(opened.status, JSON.stringify(opened.body)).toBe(200);
  expect(opened.body.accepted).toBe(true);
  expect(opened.body.already).toBe(false);
  // The project's name is the first thing about it the reader learns, and only
  // after the identity check.
  expect(opened.body.projectName).toBe('Requisition release');

  const stored = (await adminGetDoc(invitationCollectionPath(PROJECT_ID), id)) as Invitation;
  expect(stored.status).toBe('accepted');
  expect(stored.acceptedBy).toEqual({
    uid: accounts[READER_EMAIL].uid,
    email: normaliseInvitedEmail(READER_EMAIL),
  });
  const acceptedAt = Date.parse(String(stored.acceptedAt));
  expect(Number.isNaN(acceptedAt)).toBe(false);
  expect(acceptedAt).toBeGreaterThanOrEqual(before - 60_000);
  expect(stored.revokedAt).toBeNull();

  // What roadmap 5.4 will read: the uid on the project document itself, so a
  // rule can compare it without a second document read.
  expect(await readersOf()).toContain(accounts[READER_EMAIL].uid);

  // Opening the same link again is not a second grant and not a refusal.
  const again = await accept(request, READER_EMAIL, id);
  expect(again.status).toBe(200);
  expect(again.body.already).toBe(true);
  const readers = await readersOf();
  expect(readers.filter((uid) => uid === accounts[READER_EMAIL].uid)).toHaveLength(1);

  // …and it still opens nothing for anybody else.
  const stranger = await accept(request, STRANGER_EMAIL, id);
  expect(stranger.status).toBe(403);
  expect(stranger.body.code).toBe(INVITATION_CLOSED_CODE);
});

test('an account that never accepted the Terms is turned away before the invitation is read', async ({ request }) => {
  const noTerms = `invitation-noterms-${STAMP}@cleancore-test.io`;
  await makeAccount(noTerms, true, false);
  const created = await invite(request, { email: noTerms });
  expect(created.status).toBe(201);

  const tried = await accept(request, noTerms, created.invitation!.id);
  expect(tried.status).toBe(403);
  expect(tried.body.code).toBe('terms-required');
  expect(await readersOf()).not.toContain(accounts[noTerms].uid);
});

test('the invitation subcollection is not client-readable and `readers` is not client-writable', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');

  // `readers` is the field 5.4's read rule will hang on. A browser that could
  // write it could invite itself, which is the whole grant.
  expect(parseClientWritableProjectFields(rules)).not.toContain(PROJECT_READERS_FIELD);
  // The subcollection is denied, and it is denied *out loud*.
  //
  // 5.1–5.3 left it to the default: no match block, therefore no access, and
  // therefore no rules deploy for this step. That is sound, and it was the right
  // call while nothing else in the rules moved. 5.4 changed the surrounding
  // picture — it adds a read path to the project document — and a denial that
  // exists only as an absence is invisible to whoever reads the rules next. A
  // single `match /projects/{p}/{document=**}` added later in good faith would
  // open it, and nothing in the file would have said not to.
  //
  // So the assertion moved from "there is no rule" to "there is a rule, and it
  // refuses" — strictly the stronger of the two, because absence cannot be
  // asserted against a future edit and a written `if false` can. The addresses of
  // other invited people are the thing being protected.
  const block = new RegExp(
    `match\\s+/projects/\\{[^}]+\\}/${INVITATION_COLLECTION}/\\{[^}]+\\}\\s*\\{\\s*allow\\s+read\\s*,\\s*write\\s*:\\s*if\\s+false\\s*;`,
  );
  expect(
    rules,
    'the invitation subcollection has no rule that refuses it out loud — it carries the e-mail ' +
      'addresses of other invited people, and a later catch-all match would open it silently',
  ).toMatch(block);
});

/**
 * The ceiling (Sonny, 18.09.2026). Three invitations may wait at once; the
 * fourth is refused, and a withdrawal frees exactly one slot.
 *
 * The rate limit already in the route caps how *fast* invitations go out and
 * says nothing about how many stand open. Twenty an hour, hour after hour, is
 * inside the rate — and a route that mails an address its caller typed needs
 * the second half too, or it is a mailer with our return address on it.
 *
 * The refusal is asserted before the mail, not after: a fourth invitation that
 * were created and then withdrawn because the ceiling noticed afterwards would
 * still have sent a mail to somebody.
 */
test('three invitations wait at once, and the fourth waits for a withdrawal', async ({ request }) => {
  const address = (n: number) => `ceiling-${n}-${STAMP}@cleancore-test.io`;

  const open: string[] = [];
  for (let n = 1; n <= INVITATION_MAX_OPEN; n++) {
    const created = await invite(request, { email: address(n) });
    expect(created.status, `invitation ${n} of ${INVITATION_MAX_OPEN}: ${JSON.stringify(created)}`).toBe(201);
    open.push(created.invitation!.id);
  }

  const refused = await invite(request, { email: address(INVITATION_MAX_OPEN + 1) });
  expect(refused.status, JSON.stringify(refused)).toBe(409);
  expect(refused.code).toBe(INVITATION_TOO_MANY_CODE);
  // The sentence has to say the way out. "Too many requests" would be a lie:
  // nothing here is about speed, and waiting does not help.
  expect(refused.error).toContain('Withdraw one');
  expect(refused.invitation, 'a refused invitation was created anyway').toBeUndefined();

  // Not a one-off: the ceiling holds on the next attempt too.
  expect((await invite(request, { email: address(INVITATION_MAX_OPEN + 2) })).status).toBe(409);

  // Withdrawing frees exactly one slot — one more goes through, the one after
  // it does not. An owner who mistyped an address corrects it at once instead
  // of waiting out a fortnight's expiry.
  await withdraw(open[0]);
  const afterWithdrawal = await invite(request, { email: address(INVITATION_MAX_OPEN + 3) });
  expect(afterWithdrawal.status, JSON.stringify(afterWithdrawal)).toBe(201);
  expect((await invite(request, { email: address(INVITATION_MAX_OPEN + 4) })).status).toBe(409);
});
