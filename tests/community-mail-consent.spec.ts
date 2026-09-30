import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { adminSetDoc } from './helpers/admin-seed';
import { createUnsubscribeToken, suppressionId } from '../lib/unsubscribe-token';
import {
  COMMUNITY_MAIL_FIELD,
  communityMailBlock,
  hasCommunityMailOptIn,
  unsubscribeUrls,
} from '../lib/community-mail';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-1234567890';

/**
 * Community mail only with consent — owner decision of 30.09.2026, QA finding
 * bef96e7f054f.
 *
 * The privacy policy said there was no newsletter and no marketing mail while
 * survey invitations went to every account. The decision was an opt-in switch
 * in the settings, off by default, and a gate every sender has to pass. Four
 * halves, because none alone proves it:
 *
 *  - the gate itself, as a pure function: only a literal `true` opts in;
 *  - every sender in the repository calls it — found by what makes a file a
 *    bulk sender (the RFC 8058 header or an unsubscribe token), not by a list
 *    somebody has to remember to extend;
 *  - the switch route writes the consent with its timestamps, server-side;
 *  - an unsubscribe withdraws the consent as well as suppressing the address.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the consent gate', () => {
  test('only a literal true opts in; absent, truthy or malformed is no', () => {
    expect(hasCommunityMailOptIn({ [COMMUNITY_MAIL_FIELD]: { optIn: true } })).toBe(true);
    for (const profile of [
      {},
      null,
      undefined,
      'yes',
      { [COMMUNITY_MAIL_FIELD]: null },
      { [COMMUNITY_MAIL_FIELD]: true },
      { [COMMUNITY_MAIL_FIELD]: { optIn: 'true' } },
      { [COMMUNITY_MAIL_FIELD]: { optIn: 1 } },
      { [COMMUNITY_MAIL_FIELD]: { optIn: false, consentedAt: new Date() } },
      // A profile from before the switch, as every account had on 30.09.2026.
      { email: 'person@example.com', status: 'approved', tier: 'pilot' },
    ]) {
      expect(hasCommunityMailOptIn(profile), JSON.stringify(profile)).toBe(false);
    }
  });

  test('an account without the flag is not a recipient, whatever else is true of it', () => {
    const none = new Set<string>();
    const base = { email: 'person@example.com', status: 'approved' };
    expect(communityMailBlock(base, none)).toBe('noOptIn');
    expect(communityMailBlock({ ...base, [COMMUNITY_MAIL_FIELD]: { optIn: true } }, none)).toBeNull();
  });

  test('the suppression list still wins over a flag that says yes', () => {
    // A withdrawal whose profile update was lost must not be undone by the flag.
    const profile = { email: ' Person@Example.com ', status: 'approved', [COMMUNITY_MAIL_FIELD]: { optIn: true } };
    expect(communityMailBlock(profile, new Set(['person@example.com']))).toBe('suppressed');
  });

  test('test accounts, erased accounts and missing addresses stay out', () => {
    const on = { [COMMUNITY_MAIL_FIELD]: { optIn: true } };
    const none = new Set<string>();
    expect(communityMailBlock({ ...on, email: '' }, none)).toBe('noEmail');
    expect(communityMailBlock({ ...on, email: 'ci@cleancore-test.io' }, none)).toBe('testAccount');
    expect(communityMailBlock({ ...on, email: 'a@example.com', status: 'deleted' }, none)).toBe('deleted');
    expect(communityMailBlock({ ...on, email: 'a@example.com', disabled: true }, none)).toBe('deleted');
  });
});

/**
 * A bulk sender is a file that builds an unsubscribe token or sets the RFC 8058
 * header — nothing else in this repository has a reason to. Each one must call
 * the gate. The one exemption sends synthetic mails to the operator's own seed
 * mailboxes and never reads an account (`tests/mail-seed-test.spec.ts` bans
 * Firestore from it), so there is no consent to ask for.
 */
const EXEMPT: Record<string, string> = {
  'lib/unsubscribe-token.ts': 'defines the token, sends nothing',
  'lib/community-mail.ts': 'defines the gate',
  'app/api/unsubscribe/route.ts': 'receives the opt-out, sends nothing',
  'scripts/lib/mail-seed.ts': 'synthetic mails to the operator seed mailboxes; reads no account',
};

const SENDER_MARK = /createUnsubscribeToken\s*\(|['"]List-Unsubscribe['"]/;
const GATE_CALL = /\bcommunityMailBlock\s*\(|\bhasCommunityMailOptIn\s*\(/;

/** The files that look like a community sender and do not call the gate. */
function sendersIgnoringTheGate(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([rel, src]) => !(rel in EXEMPT) && SENDER_MARK.test(src) && !GATE_CALL.test(src))
    .map(([rel]) => rel);
}

function sourceFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(rel);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        out[rel] = read(rel);
      }
    }
  };
  for (const dir of ['app', 'lib', 'scripts', 'components']) walk(dir);
  return out;
}

test.describe('every community sender asks the gate', () => {
  test('no file that sends community mail skips the consent check', () => {
    const files = sourceFiles();
    // The detector finds the one sender there is today, or it is detecting nothing.
    expect(SENDER_MARK.test(files['scripts/send-survey.ts'] ?? ''), 'send-survey.ts is no longer recognised as a sender').toBe(true);
    expect(sendersIgnoringTheGate(files)).toEqual([]);
  });

  test('the guard sees a sender that ignores the flag', () => {
    // Its own sensitivity, asserted rather than claimed: the survey sender with
    // the gate taken out is reported, and so is a new sender that never had it.
    const survey = read('scripts/send-survey.ts');
    const withoutGate = survey.replace(/communityMailBlock\s*\(/g, 'someOtherFilter(');
    expect(sendersIgnoringTheGate({ 'scripts/send-survey.ts': withoutGate })).toEqual(['scripts/send-survey.ts']);
    const newSender = "headers: { 'List-Unsubscribe': `<${url}>` }";
    expect(sendersIgnoringTheGate({ 'scripts/send-community-update.ts': newSender })).toEqual([
      'scripts/send-community-update.ts',
    ]);
  });

  test('the survey sender applies the gate to every account before anyone is added', () => {
    const src = read('scripts/send-survey.ts');
    const load = src.slice(src.indexOf('async function loadRecipients'), src.indexOf('async function main'));
    const gate = load.indexOf('const block = communityMailBlock(u, suppressed);');
    const skip = load.indexOf('if (block) { skipped[block]++; continue; }');
    const push = load.indexOf('recipients.push(');
    expect(gate, 'the gate is not called per account').toBeGreaterThan(-1);
    expect(skip, 'a blocked account is not skipped').toBeGreaterThan(gate);
    expect(push, 'a recipient is added before the gate ran').toBeGreaterThan(skip);
    // `--only` is filtered after the gate, so a test send cannot bypass consent.
    expect(load.indexOf('if (ONLY &&')).toBeGreaterThan(skip);
  });
});

test.describe('the unsubscribe links', () => {
  test('the visible link carries the token in the fragment; the one-click URL in the query', () => {
    const urls = unsubscribeUrls('https://clean-core.io/', 'abc.def');
    expect(urls.page).toBe('https://clean-core.io/unsubscribe#t=abc.def');
    expect(urls.oneClick).toBe('https://clean-core.io/api/unsubscribe?t=abc.def');
    expect(new URL(urls.page).search, 'the page link sends the token to the server').toBe('');
  });

  test('the survey mail shows the fragment link and puts the query URL only in the header', () => {
    const src = read('scripts/send-survey.ts');
    expect(src).toContain('unsubscribeUrl: unsubscribe.page');
    expect(src).toContain('`<${unsubscribe.oneClick}>, <mailto:');
    expect(src, 'a hand-built unsubscribe URL is back').not.toMatch(/\/api\/unsubscribe\?t=/);
  });
});

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

const toMillis = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : NaN;
};

test.describe('the switch and the withdrawal, against the emulator', () => {
  // One account, one consent record: each step builds on the one before.
  test.describe.configure({ mode: 'serial' });
  const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const EMAIL = `community-mail-${STAMP}@cleancore-test.io`;
  const PASSWORD = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
  let uid = '';
  let idToken = '';

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    connectAuthToEmulator(auth);
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    uid = cred.user.uid;
    idToken = await cred.user.getIdToken();
    await adminSetDoc('users', uid, {
      firstName: 'Community', lastName: 'Mail', email: EMAIL, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  });

  test.afterAll(async () => {
    const db = adminDb();
    await db.collection('users').doc(uid).delete().catch(() => {});
    await db.collection('email_suppressions').doc(suppressionId(EMAIL)).delete().catch(() => {});
  });

  const post = (request: APIRequestContext, data: unknown, token = idToken) =>
    request.post('/api/community-mail', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      data: data as Record<string, unknown>,
    });

  test('a new account has no consent, and signing up does not give one', async () => {
    const profile = (await adminDb().collection('users').doc(uid).get()).data();
    expect(hasCommunityMailOptIn(profile)).toBe(false);
    // The client may not write the field: it is not in userClientUpdateKeys().
    expect(read('firestore.rules')).not.toContain(COMMUNITY_MAIL_FIELD);
  });

  test('without a session, or with a body that is not a boolean, nothing is stored', async ({ request }) => {
    expect((await post(request, { optIn: true }, '')).status()).toBe(401);
    for (const body of [{}, { optIn: 'true' }, { optIn: 1 }]) {
      expect((await post(request, body)).status(), JSON.stringify(body)).toBe(400);
    }
    const profile = (await adminDb().collection('users').doc(uid).get()).data();
    expect(profile?.[COMMUNITY_MAIL_FIELD]).toBeUndefined();
  });

  test('switching on records the consent with its time and lifts an earlier unsubscribe', async ({ request }) => {
    const db = adminDb();
    await db.collection('email_suppressions').doc(suppressionId(EMAIL)).set({
      email: EMAIL, list: 'community-updates', source: 'one-click',
    });
    const before = Date.now();
    const res = await post(request, { optIn: true });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, optIn: true });

    const consent = (await db.collection('users').doc(uid).get()).get(COMMUNITY_MAIL_FIELD);
    expect(consent.optIn).toBe(true);
    expect(consent.source).toBe('settings');
    expect(toMillis(consent.consentedAt)).toBeGreaterThanOrEqual(before - 5_000);
    expect(
      (await db.collection('email_suppressions').doc(suppressionId(EMAIL)).get()).exists,
      'the account asked for the mail again and is still suppressed',
    ).toBe(false);
  });

  test('switching off records the withdrawal and keeps the consent time', async ({ request }) => {
    const res = await post(request, { optIn: false });
    expect(res.status(), await res.text()).toBe(200);
    const consent = (await adminDb().collection('users').doc(uid).get()).get(COMMUNITY_MAIL_FIELD);
    expect(consent.optIn).toBe(false);
    expect(Number.isFinite(toMillis(consent.withdrawnAt))).toBe(true);
    expect(Number.isFinite(toMillis(consent.consentedAt)), 'the record of the consent was lost').toBe(true);
  });

  test('an unsubscribe from a mail withdraws the consent and suppresses the address', async ({ request }) => {
    const db = adminDb();
    expect((await post(request, { optIn: true })).status()).toBe(200);
    expect(hasCommunityMailOptIn((await db.collection('users').doc(uid).get()).data())).toBe(true);

    // Exactly what a mail provider sends: POST, token in the query, no body.
    const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(EMAIL))}`);
    expect(await res.json()).toEqual({ success: true });

    const profile = (await db.collection('users').doc(uid).get()).data();
    expect(hasCommunityMailOptIn(profile), 'the unsubscribe left the consent switched on').toBe(false);
    expect(profile?.[COMMUNITY_MAIL_FIELD]?.source).toBe('unsubscribe');
    expect(Number.isFinite(toMillis(profile?.[COMMUNITY_MAIL_FIELD]?.withdrawnAt))).toBe(true);
    expect((await db.collection('email_suppressions').doc(suppressionId(EMAIL)).get()).exists).toBe(true);
    // And the gate says no on the consent alone. The spec's address is a CI
    // test domain the gate refuses first, so the same profile is asked with a
    // real-looking address and an empty suppression list.
    expect(communityMailBlock({ ...(profile ?? {}), email: 'person@example.com' }, new Set())).toBe('noOptIn');
  });
});
