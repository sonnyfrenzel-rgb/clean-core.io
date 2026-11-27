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
import { POST as selectionInvitationsPOST } from '../app/api/portfolio/selections/[selectionId]/invitations/route';
import { SELECTION_COLLECTION } from '../lib/portfolio/selection-store';
import { SELECTION_INVITATIONS } from '../lib/portfolio/selection-invitations';

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

/** Runs `fn` with an environment variable set to `value` (removed for `undefined`), and puts it back as it was. */
async function withEnv<T>(name: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[name] = before;
    else delete process.env[name];
  }
}
const without = <T,>(name: string, fn: () => Promise<T>) => withEnv(name, undefined, fn);
/** A signing secret of this spec's own, so the cases with a secret do not depend on the environment. */
const SPEC_SECRET = 'invitation-mail-spec-secret-0123456789';

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

// Both routes themselves, in this process against the emulators (no app server).
test.describe('the invitation routes without the signing secret', () => {
  test.describe.configure({ mode: 'serial' });

  const STAMP = Date.now();
  const EMAIL = `invite-unprepared-${STAMP}@cleancore-test.io`;
  const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
  const PROJECT_ID = `invite-unprepared-${STAMP}`;
  const SELECTION_ID = `invite-unprepared-sel-${STAMP}`;
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
    // The portfolio is open only to an account with an own key stored and tested: the profile names it and a
    // record exists. The record is never opened on this path, so a placeholder stands in for the sealed key.
    await db.collection('users').doc(uid).set({
      firstName: 'Invite', lastName: 'Unprepared', email: EMAIL, emailVerified: true, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
      byokConfigured: true, byokProvider: 'gemini', byokTestedAt: new Date(),
    });
    await db.collection('user_secrets').doc(uid).collection('providers').doc('gemini').set({ encryptedApiKey: 'spec-placeholder', provider: 'gemini' });
    await db.collection('projects').doc(PROJECT_ID).set({ userId: uid, name: 'Invite unprepared', createdAt: new Date() });
    await db.collection(SELECTION_COLLECTION).doc(SELECTION_ID).set({ ownerId: uid, name: 'Invite unprepared', projectIds: [PROJECT_ID], createdAt: Date.now() });
  });

  test.afterAll(async () => {
    const { db } = await getAdminDb();
    await db.recursiveDelete(db.collection(SELECTION_COLLECTION).doc(SELECTION_ID)).catch(() => {});
    await db.recursiveDelete(db.collection('projects').doc(PROJECT_ID)).catch(() => {});
    await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});
    if (uid) await (await getAdminAuth()).deleteUser(uid).catch(() => {});
  });

  const post = (url: string, to: string) =>
    new NextRequest(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: to }),
    });
  const inviteToProject = (to: string) =>
    invitationsPOST(post(`http://localhost/api/projects/${PROJECT_ID}/invitations`, to), { params: Promise.resolve({ projectId: PROJECT_ID }) });
  const inviteToSelection = (to: string) =>
    selectionInvitationsPOST(post(`http://localhost/api/portfolio/selections/${SELECTION_ID}/invitations`, to), {
      params: Promise.resolve({ selectionId: SELECTION_ID }),
    });

  /** No mail provider in this process (the console stands in for it), and nothing may reach the real one. */
  async function offline<T>(fn: () => Promise<T>): Promise<T> {
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('api.resend.com')) throw new Error('no mail provider in this spec');
      return fetchBefore(input, init);
    }) as typeof fetch;
    try {
      return await without('RESEND_API_KEY', fn);
    } finally {
      globalThis.fetch = fetchBefore;
    }
  }

  const cases = [
    {
      name: 'POST /api/projects/[id]/invitations',
      invite: inviteToProject,
      stored: async () => (await (await getAdminDb()).db.collection('projects').doc(PROJECT_ID).collection(INVITATION_COLLECTION).get()).docs,
    },
    {
      name: 'POST /api/portfolio/selections/[id]/invitations',
      invite: inviteToSelection,
      stored: async () =>
        (await (await getAdminDb()).db.collection(SELECTION_COLLECTION).doc(SELECTION_ID).collection(SELECTION_INVITATIONS).get()).docs,
    },
  ];

  for (const c of cases) {
    test(`${c.name}: the invitation is withdrawn and the owner is told nothing went out`, async () => {
      await offline(async () => {
        const res = await without('PILOT_APPROVAL_SECRET', () => c.invite(`unprepared-${STAMP}@cleancore-test.io`));
        expect(res.status, await res.clone().text()).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('not-configured');
        expect(body.error).toContain('the invitation was withdrawn');
        const docs = await c.stored();
        expect(docs).toHaveLength(1);
        expect(docs[0].data().status, 'an invitation nobody was told about is still waiting').toBe('revoked');

        // With a secret (this spec's own) the same request goes out, to the console, and the invitation waits.
        const ok = await withEnv('PILOT_APPROVAL_SECRET', SPEC_SECRET, () => c.invite(`prepared-${STAMP}@cleancore-test.io`));
        expect(ok.status, await ok.clone().text()).toBe(201);
        const after = (await c.stored()).map((d: { data: () => Record<string, unknown> }) => String(d.data().status)).sort();
        expect(after).toEqual(['pending', 'revoked']);
      });
    });
  }
});
