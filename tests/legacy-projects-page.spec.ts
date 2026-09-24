import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { verifyRunIntegrity } from '../lib/run-signature';
import { legacyForms, seedLegacyForms, storedFingerprint } from './helpers/legacy-forms';

/**
 * Roadmap 3.0.2, the rendered half — every historical form opens in the
 * workspace, in all three views, and the record is the same afterwards.
 *
 * `tests/legacy-projects.spec.ts` proves the derivations on the stored shapes
 * without a page. This one proves what only the running app can: that the
 * page and every route it calls on open (`/findings` in IT, `/decision` and the
 * run history in Management, the revision probe, the readers list) neither
 * crash on an old form nor write to it. The fingerprint compares the update
 * time of the project and of every document under it, so a process revision
 * minted on read, a repaired run or a re-signed one all show up as a
 * difference.
 *
 * Needs the app server and the emulators (`playwright.config.ts` starts the
 * server). The runs are signed with the server's `AUDIT_SIGNING_KEY`, which the
 * config sets for both.
 */

const PASSWORD = 'LegacyProjects123!';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const pid = (form: string) => `legacy-page-${form}-${stamp}`;
const ADMIN = `legacy-page-admin-${stamp}@cleancore-test.io`;

const signingKey = () => {
  const key = process.env.AUDIT_SIGNING_KEY;
  if (!key) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return key;
};

let db: Firestore;
let owner = '';
let forms: ReturnType<typeof legacyForms> = {};

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('historical project forms, opened in the workspace', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
    db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const cred = await createUserWithEmailAndPassword(auth, ADMIN, PASSWORD);
    owner = cred.user.uid;
    // The claim first, so the token minted at sign-in already carries it.
    // Through the seed route: firebase-admin/auth cannot be required by a spec on this Node (jose is ESM-only).
    await adminSetCustomClaim(owner, { admin: true });
    await db.doc(`users/${owner}`).set({
      firstName: 'Legacy', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    forms = legacyForms({ owner, key: signingKey(), pid });
    await seedLegacyForms(db, forms, pid);
  });

  test('every form opens in all three views, names its gaps, and is not written', async ({ page }) => {
    test.setTimeout(Object.keys(forms).length * 150 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);

    for (const [key, form] of Object.entries(forms)) {
      const id = pid(key);
      const before = await storedFingerprint(db, id);

      for (const view of ['business', 'it', 'management']) {
        await page.goto(`/project/${id}?view=${view}`, { waitUntil: 'domcontentloaded' });
        const shell = page.locator('[data-workspace-shell]');
        await expect(shell, `${key} did not open in ${view}`).toBeVisible({ timeout: 60000 });
        await expect(shell).toHaveAttribute('data-workspace-shell', view);
        // The document id is the one in the path, whatever the document carries.
        await expect(page.locator('[data-workspace-title]')).toContainText(String(form.project.name));
        // Wait for what is compared, not for the network to go quiet: the
        // workspace keeps Firestore listeners open, so 'networkidle' never
        // arrived and every view waited out its full minute (24 views, one
        // test timeout). The gaps are derived once the reads are in; poll them.
        await expect
          .poll(
            async () =>
              (
                await page.locator('[data-not-determined-record]').evaluateAll((els) =>
                  els.map((el) => el.getAttribute('data-not-determined-record') || ''),
                )
              ).sort(),
            { message: `${key} in ${view}`, timeout: 30000 },
          )
          .toEqual([...form.gaps].sort());

        const text = await page.locator('[data-workspace-shell]').innerText();
        expect(text, `${key} in ${view}`).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
      }

      // Nothing about the project or anything under it changed by being opened.
      expect(await storedFingerprint(db, id), `${key} was written on open`).toEqual(before);
      const runs = await db.collection(`projects/${id}/runs`).get();
      for (const d of runs.docs) {
        expect(verifyRunIntegrity(d.data(), signingKey()), `run ${d.id} of ${key}`).toEqual({ valid: true });
      }
    }
  });
});
