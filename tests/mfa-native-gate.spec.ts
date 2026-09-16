import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { hasSecondFactor, mfaSatisfied, mfaSteppedUp, MFA_REQUIRED, MFA_STEP_UP_STALE } from '../lib/mfa-gate';

/**
 * The second factor is Firebase's own (roadmap 0.13, Sonny 16.09.2026), and
 * the proof is the ID token: Firebase issues none before the factor is
 * resolved, and the one it issues then names the factor in
 * `firebase.sign_in_second_factor`.
 *
 * The Auth emulator cannot enrol a TOTP factor (firebase-tools 15.30.1:
 * `mfaEnrollment:start` wants phone enrolment info), so the token that carries
 * the factor is built by hand here and handed to the decision in
 * lib/mfa-gate.ts — a pure function, which is why it lives outside
 * lib/firebase-admin.ts (whose auth module does not load under Playwright's
 * CommonJS transform). The routes are exercised with what the emulator can
 * mint: a first-factor token against a profile that requires the second.
 */

const now = () => Math.floor(Date.now() / 1000);
const token = (over: Record<string, unknown> = {}) => ({ auth_time: now(), firebase: { sign_in_provider: 'password' }, ...over });
const withFactor = (over: Record<string, unknown> = {}) => token({ firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' }, ...over });

test.describe('the decision reads the factor off the token', () => {
  test('hasSecondFactor is exactly the presence of a named factor', () => {
    expect(hasSecondFactor(withFactor())).toBe(true);
    expect(hasSecondFactor(token())).toBe(false);
    expect(hasSecondFactor(token({ firebase: { sign_in_second_factor: '' } }))).toBe(false);
    expect(hasSecondFactor(token({ firebase: { sign_in_second_factor: 'phone' } }))).toBe(true);
    expect(hasSecondFactor(null)).toBe(false);
    expect(hasSecondFactor({})).toBe(false);
  });

  test('an enrolled account passes only with the factor on the token', () => {
    expect(mfaSatisfied(true, withFactor())).toBeNull();
    expect(mfaSatisfied(true, token())).toEqual(MFA_REQUIRED);
    expect(MFA_REQUIRED.status).toBe(403);
    expect(MFA_REQUIRED.message).toContain('Multi-factor authentication required');
  });

  test('an account without the requirement passes with either token', () => {
    expect(mfaSatisfied(false, token())).toBeNull();
    expect(mfaSatisfied(false, withFactor())).toBeNull();
  });

  test('the step-up wants the factor and a sign-in from the last five minutes', () => {
    const t = now();
    expect(mfaSteppedUp(true, withFactor(), t)).toBeNull();
    expect(mfaSteppedUp(true, withFactor({ auth_time: t - 299 }), t)).toBeNull();
    expect(mfaSteppedUp(true, withFactor({ auth_time: t - 301 }), t)).toEqual(MFA_STEP_UP_STALE);
    expect(mfaSteppedUp(true, withFactor({ auth_time: 'yesterday' }), t)).toEqual(MFA_STEP_UP_STALE);
    expect(mfaSteppedUp(true, token(), t)).toEqual(MFA_REQUIRED);
    // A fresh first-factor sign-in is a step-up only for an account without the requirement.
    expect(mfaSteppedUp(false, token(), t)).toBeNull();
    // A cookie is not a token field: nothing but the token decides.
    expect(mfaSteppedUp(true, token({ mfa_session: 'anything' }), t)).toEqual(MFA_REQUIRED);
  });
});

test.describe('the routes, with what the emulator can mint', () => {
  test.describe.configure({ mode: 'serial' });
  const EMAIL = `mfa-routes-${Date.now()}@cleancore-test.io`;
  let uid = '';
  let idToken = '';
  const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });
  const profile = async () => {
    const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
    return (await adminFirestore(app, FIRESTORE_DB_ID).collection('users').doc(uid).get()).data();
  };

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, 'Routes123!');
    uid = cred.user.uid;
    idToken = await cred.user.getIdToken();
    await adminSetDoc('users', uid, {
      firstName: 'Mfa', lastName: 'Routes', email: EMAIL, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  });

  test('the server records an enrolment only when Firebase Auth has the factor', async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post('/api/mfa/enrolled', { headers: headers() });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('No authenticator is enrolled');
    expect((await profile())?.mfaEnabled).toBe(false);
  });

  test('the factor is removed only by a session that carries it', async ({ request }: { request: APIRequestContext }) => {
    await adminMergeDoc('users', uid, { mfaEnabled: true, mfaFactor: 'totp' });
    const res = await request.post('/api/mfa/disable', { headers: headers() });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain('Multi-factor authentication required');
    expect((await profile())?.mfaEnabled).toBe(true);
  });

  test('a gated route refuses the first-factor token of an enrolled account', async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post('/api/runs/create', { headers: headers(), data: { projectId: 'nowhere', legacyCode: 'REPORT z.', analysis: '{}' } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain('Multi-factor authentication required');
  });

  test('the retired application-level routes are gone', async ({ request }: { request: APIRequestContext }) => {
    for (const path of ['/api/mfa/verify', '/api/mfa/setup/start', '/api/mfa/setup/verify']) {
      const res = await request.post(path, { headers: headers(), data: {} });
      expect(res.status(), path).toBe(404);
    }
  });
});
