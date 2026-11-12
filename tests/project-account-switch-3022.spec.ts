import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Hotfix 3.0.22 — QA full review of f59713161b25, high (fa3278f7dc9b, 39d71e5eec25).
 *
 * Firebase shares the session across the tabs of one browser. Account A has its
 * project open; in a second tab the same browser signs in as account B. Before
 * the fix the first tab switched to B and went on showing A's project and its
 * source code. Now the frame (`components/ProjectFrame.tsx`) remounts the page
 * as B, the server refuses B, and nothing of A's project stays on screen.
 */

const STAMP = Date.now();
const EMAIL_A = `switch-a-${STAMP}@cleancore-test.io`;
const EMAIL_B = `switch-b-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT = `switch-3022-${STAMP}`;
const PROJECT_NAME = `Account switch fixture ${STAMP}`;
const MARKER = `ZSWITCH_${STAMP}`;
const SOURCE = `REPORT ${MARKER.toLowerCase()}.\nWRITE: / 'only account A may read this'.`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const account = {
    firstName: 'Switch', lastName: 'Spec', tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  };
  const uidA = (await createUserWithEmailAndPassword(auth, EMAIL_A, SIGN_IN)).user.uid;
  await adminSetDoc('users', uidA, { ...account, email: EMAIL_A });
  const uidB = (await createUserWithEmailAndPassword(auth, EMAIL_B, SIGN_IN)).user.uid;
  await adminSetDoc('users', uidB, { ...account, email: EMAIL_B });
  await adminSetDoc('projects', PROJECT, {
    name: PROJECT_NAME, userId: uidA, createdAt: new Date(), status: 'new', legacyCode: SOURCE,
  });
});

test('a sign-in as another account in a second tab leaves nothing of the first account\'s project on screen', async ({ page, context }) => {
  test.setTimeout(240 * 1000);
  await signInViaLanding(page, EMAIL_A, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${PROJECT}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(PROJECT_NAME, { timeout: 60000 });

  // The second tab of the same browser: A signs out from the account menu
  // (a signed-in visitor is sent on from the landing page, so there is no
  // signing in over a session), then B signs in.
  const second = await context.newPage();
  await second.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await second.locator('[data-account-menu]').click({ timeout: 60000 });
  await second.getByRole('menuitem', { name: 'Sign Out' }).click();
  await second.getByRole('button', { name: 'Sign out now' }).click();
  await second.waitForURL((url) => url.pathname === '/', { timeout: 60000 });

  // Between the two accounts the first tab shows nothing of the project.
  await expect(page.locator('body')).not.toContainText(PROJECT_NAME, { timeout: 30000 });
  await expect(page.locator('body')).not.toContainText(MARKER);

  await signInViaLanding(second, EMAIL_B, SIGN_IN, { pauseMs: 3500 });

  // The first tab follows: A's project and source are gone, B is told it has no access.
  await expect(page.locator('[data-project-gate="no-access"], [data-project-gate="signed-out"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('body')).not.toContainText(PROJECT_NAME);
  await expect(page.locator('body')).not.toContainText(MARKER);
  await expect(page.locator('body')).not.toContainText('only account A may read this');
});
