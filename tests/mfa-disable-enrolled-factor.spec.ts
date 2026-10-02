import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';

/**
 * Removing a factor that Firebase Auth holds needs the factor on the token,
 * whatever the profile says.
 *
 * The profile flag is a mirror written after enrolment; it can lag behind
 * Firebase Auth or be missing. The Auth emulator cannot enrol TOTP, but it
 * stores a phone factor written through its REST API, which is enough for the
 * route to see an enrolled factor — and the token minted before that write is
 * a first-factor token with a fresh sign-in.
 */
const EMULATOR = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const PROJECT = firebaseConfig.projectId;

async function emulator(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${EMULATOR}/projects/${PROJECT}/${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const enrolledFactors = async (uid: string): Promise<unknown[]> =>
  (await emulator('accounts:lookup', { localId: [uid] })).users?.[0]?.mfaInfo ?? [];

for (const [label, mfaEnabled] of [['false', false], ['missing', undefined]] as const) {
  test(`with a factor in Firebase Auth and the profile flag ${label}, a first-factor token cannot remove it`, async ({ request }: { request: APIRequestContext }) => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, `mfa-mirror-${label}-${Date.now()}@cleancore-test.io`, 'Mirror123!');
    const uid = cred.user.uid;
    const idToken = await cred.user.getIdToken();

    const profile: Record<string, unknown> = {
      firstName: 'Mfa', lastName: 'Mirror', email: cred.user.email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, createdAt: new Date(),
    };
    if (mfaEnabled !== undefined) profile.mfaEnabled = mfaEnabled;
    await adminSetDoc('users', uid, profile);

    await emulator('accounts:update', {
      localId: uid,
      mfa: { enrollments: [{ mfaEnrollmentId: 'mirror-factor', phoneInfo: '+15555550123', displayName: 'phone' }] },
    });
    expect(await enrolledFactors(uid)).toHaveLength(1);

    const res = await request.post('/api/mfa/disable', { headers: { Authorization: `Bearer ${idToken}` } });
    expect(res.status()).toBe(403);
    expect(await enrolledFactors(uid), 'the factor was removed by a first-factor token').toHaveLength(1);
  });
}
