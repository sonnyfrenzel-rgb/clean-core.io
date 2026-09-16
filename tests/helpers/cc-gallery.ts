/**
 * Getting an admin onto the design-system gallery.
 *
 * Three guards measure that page and all three need the same five steps, so
 * they live here once: make an account in the auth emulator, mark it admin in
 * Firestore through the server-side seed route, sign in through the real form,
 * open the page, wait for it to be there.
 *
 * The account is admin because the page is: roadmap 1.5 builds the language of
 * the 3.0 interface and none of it is live product, so it sits behind the gate
 * the admin console already has (`profile.isAdmin`). A test that could see this
 * page without that flag would be testing a leak.
 */

import type { Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './admin-seed';
import firebaseConfig from '../../firebase-config.json';

export const GALLERY_PATH = '/admin/design-system';

export interface GalleryAdmin {
  email: string;
  password: string;
  uid: string;
}

/**
 * Creates the admin account. Called from `beforeAll`.
 *
 * `getApps().find(a => a.name === '[DEFAULT]')` rather than `if
 * (!getApps().length)`: a named app left behind by an earlier spec in the same
 * worker makes the list non-empty, initialisation is skipped, and the
 * argument-less `getAuth()` then fails with "No Firebase App '[DEFAULT]' has
 * been created" — only when this file runs late in a full suite, which is the
 * worst way to find out (the same note stands in `workflow-style-guard.spec.ts`).
 */
export async function createGalleryAdmin(prefix: string): Promise<GalleryAdmin> {
  // `fullyParallel` sends the tests of one file to several workers, so this hook
  // runs once per worker — at the same millisecond, with the same prefix. A
  // timestamp alone collides with `auth/email-already-in-use`.
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const password = 'DesignSystem123!';

  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  await adminSetDoc('users', uid, {
    firstName: 'Design',
    lastName: 'System',
    email,
    tier: 'pilot',
    status: 'approved',
    isAdmin: true,
    transformationsUsed: 1,
    transformationsLimit: 5,
    createdAt: new Date(),
  });

  return { email, password, uid };
}

/** Signs in through the real form and opens the gallery. */
export async function openGallery(page: Page, admin: GalleryAdmin, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 1200 });

  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', admin.email);
  await page.fill('input[type="password"]', admin.password);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);

  await page.goto(GALLERY_PATH, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-cc-gallery]', { timeout: 60000 });
}
