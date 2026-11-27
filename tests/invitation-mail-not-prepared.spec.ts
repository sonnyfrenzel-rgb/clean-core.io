import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { MAIL_NOT_PREPARED, mailOrNotSent, type MailOutcome } from '../lib/transactional-mail';
import { invitationUnsubscribeUrl } from '../lib/invitation-suppression';
import { INVITATION_COLLECTION } from '../lib/invitations';
import { POST as invitationsPOST } from '../app/api/projects/[projectId]/invitations/route';

/**
 * An invitation whose mail cannot be built is withdrawn, like one whose mail was refused.
 *
 * Both invitation routes create the invitation first and then build and send its mail; when nothing went out they
 * withdraw it in the same request. Building the mail signs an unsubscribe link, which throws when the signing secret
 * is missing — and that throw went past the withdrawal to the route's 500, leaving an invitation nobody was told
 * about. The build now runs inside `mailOrNotSent`, which answers a throw as a mail that was not sent.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Runs `fn` with an environment variable removed, and puts it back. */
async function without<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env[name];
  delete process.env[name];
  try {
    return await fn();
  } finally {
    if (before !== undefined) process.env[name] = before;
  }
}

test.describe('mailOrNotSent', () => {
  test('a mail that throws while it is built is a mail that was not sent', async () => {
    let sent = 0;
    const outcome = await without('PILOT_APPROVAL_SECRET', () =>
      mailOrNotSent(async () => {
        const unsubscribeUrl = invitationUnsubscribeUrl('someone@example.com'); // throws without the secret
        sent++;
        return { delivered: true, mocked: true, messageId: unsubscribeUrl } as MailOutcome;
      }),
    );
    expect(outcome).toEqual(MAIL_NOT_PREPARED);
    expect(outcome.delivered).toBe(false);
    expect(sent).toBe(0);
  });

  test('what the sender answers is passed on unchanged', async () => {
    const delivered: MailOutcome = { delivered: true, mocked: false, messageId: 'm-1' };
    const refused: MailOutcome = { delivered: false, reason: 'rejected', detail: 'The mail provider rejected the message.' };
    await expect(mailOrNotSent(async () => delivered)).resolves.toBe(delivered);
    await expect(mailOrNotSent(async () => refused)).resolves.toBe(refused);
  });

  test('both invitation routes build their mail inside it, before the withdrawal', () => {
    for (const rel of ['app/api/projects/[projectId]/invitations/route.ts', 'app/api/portfolio/selections/[selectionId]/invitations/route.ts']) {
      const src = read(rel);
      const post = src.slice(src.indexOf('export async function POST('));
      const wrapped = post.indexOf('await mailOrNotSent(() => sendTransactionalMail({');
      expect(wrapped, `${rel} sends its invitation mail outside mailOrNotSent`).toBeGreaterThan(-1);
      // The unsubscribe link, the part that can throw, is built inside the wrapped call.
      const unsubscribe = post.indexOf('invitationUnsubscribeUrl(');
      const withdraw = post.indexOf('if (!outcome.delivered) {');
      expect(unsubscribe).toBeGreaterThan(wrapped);
      expect(withdraw).toBeGreaterThan(unsubscribe);
      expect(post.slice(withdraw, withdraw + 1500)).toContain("status: 'revoked'");
    }
  });
});

// The project route itself, in this process against the emulators (no app server).
test.describe('POST /api/projects/[id]/invitations without the signing secret', () => {
  test.describe.configure({ mode: 'serial' });

  const STAMP = Date.now();
  const EMAIL = `invite-unprepared-${STAMP}@cleancore-test.io`;
  const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
  const PROJECT_ID = `invite-unprepared-${STAMP}`;
  let uid = '';
  let idToken = '';
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this spec would reach a real database').toBeTruthy();
    const cred = await createUserWithEmailAndPassword(connectAuthToEmulator(getAuth(app)), EMAIL, SIGN_IN);
    uid = cred.user.uid;
    idToken = await cred.user.getIdToken();
    const { db } = await getAdminDb();
    await db.collection('users').doc(uid).set({
      firstName: 'Invite', lastName: 'Unprepared', email: EMAIL, emailVerified: true, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    await db.collection('projects').doc(PROJECT_ID).set({ userId: uid, name: 'Invite unprepared', createdAt: new Date() });
  });

  test.afterAll(async () => {
    const { db } = await getAdminDb();
    await db.recursiveDelete(db.collection('projects').doc(PROJECT_ID)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
    if (uid) await (await getAdminAuth()).deleteUser(uid).catch(() => {});
  });

  const invite = (to: string) =>
    invitationsPOST(
      new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: to }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

  test('the invitation is withdrawn and the owner is told nothing went out', async () => {
    // No mail provider in this process (the console stands in for it), and nothing may reach the real one.
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('api.resend.com')) throw new Error('no mail provider in this spec');
      return fetchBefore(input, init);
    }) as typeof fetch;
    try {
      await without('RESEND_API_KEY', async () => {
        const res = await without('PILOT_APPROVAL_SECRET', () => invite(`unprepared-${STAMP}@cleancore-test.io`));
        expect(res.status, await res.clone().text()).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('not-configured');
        expect(body.error).toContain('the invitation was withdrawn');
        const { db } = await getAdminDb();
        const docs = (await db.collection('projects').doc(PROJECT_ID).collection(INVITATION_COLLECTION).get()).docs;
        expect(docs).toHaveLength(1);
        expect(docs[0].data().status, 'an invitation nobody was told about is still waiting').toBe('revoked');

        // With the secret the same request goes out (to the console) and the invitation waits.
        const ok = await invite(`prepared-${STAMP}@cleancore-test.io`);
        expect(ok.status, await ok.clone().text()).toBe(201);
      });
    } finally {
      globalThis.fetch = fetchBefore;
    }
  });
});
