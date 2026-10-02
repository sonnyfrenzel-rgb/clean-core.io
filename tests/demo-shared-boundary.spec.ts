import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { DEMO_ASSISTANT_NOTICE, isDemoPath } from '../lib/demo-marks';
import { TOUR_STORAGE_KEY, TOUR_STATIONS } from '../lib/demo-tour';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The demo's boundary, through the components it shares with the product —
 * Codex review code-demo-01, -02 and -04.
 *
 * `tests/demo-project.spec.ts` scans the demo's own files for a path to a run,
 * a pack, an export or a write. The demo also renders two things it does not
 * own: the shell assistant (mounted once in `app/(app)/layout.tsx`) and the
 * BPMN editor behind the workspace map's *Edit model*. Neither file is in that
 * scan, and both broke the promise on every demo screen — "a demo makes no model
 * call", "no export comes out of this screen". So these checks are behavioural:
 * they click what a reader clicks and watch the network and the downloads,
 * rather than reading source.
 *
 * Needs the dev server and the emulators, like every signed-in spec.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ADMIN = `demo-boundary-admin-${STAMP}@cleancore-test.io`;
const PASSWORD = `spec-${process.pid}-Aa1!`;

/** Not a glossary term, so outside the demo it is a model question. */
const MODEL_QUESTION = 'Which BAPI should replace a direct update of EKKO in an approval workflow?';

test.describe.configure({ mode: 'serial' });

test.describe('which paths are the demo', () => {
  test('every demo screen, and nothing that merely starts with the word', () => {
    for (const path of ['/demo', '/demo/', '/demo/analyze', '/demo/workspace', '/demo/design']) {
      expect(isDemoPath(path), path).toBe(true);
    }
    for (const path of ['/dashboard', '/project/demo/analyze', '/demos', '/demonstration', '', null, undefined]) {
      expect(isDemoPath(path), String(path)).toBe(false);
    }
  });
});

test.describe('the shared components keep the demo’s promise', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const admin = await createUserWithEmailAndPassword(auth, ADMIN, PASSWORD);
    await adminSetCustomClaim(admin.user.uid, { admin: true });
    await adminSetDoc('users', admin.user.uid, {
      tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
      firstName: 'Demo', lastName: 'Boundary', email: ADMIN, isAdmin: true, workspaceShell: true,
    });
  });

  async function openChat(page: Page): Promise<void> {
    const button = page.locator('[data-help-menu-trigger]');
    const toggle = page.locator('[data-assistant-trigger="header"]');
    await expect(button).toBeVisible({ timeout: 90000 });
    const panel = page.locator('[data-chatbot-scope]');
    await expect(async () => {
      const alreadyOpen = await panel.isVisible().catch(() => false);
      if (!alreadyOpen) {
        const menuShowing = await toggle.isVisible().catch(() => false);
        if (!menuShowing) await button.click({ timeout: 15000 });
        await toggle.click({ timeout: 5000 });
      }
      await expect(panel, 'the assistant panel never opened').toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60000 });
  }

  for (const route of ['/demo/analyze', '/demo/workspace?view=business']) {
    test(`the shell assistant on ${route} answers a non-glossary question without a model`, async ({ page }) => {
      test.setTimeout(240 * 1000);
      await page.setViewportSize({ width: 1440, height: 1000 });

      const forbidden: string[] = [];
      await page.route('**/api/gemini**', async (r) => {
        forbidden.push(r.request().url());
        await r.fulfill({ status: 500, body: 'the demo must never reach this route' });
      });

      await signInViaLanding(page, ADMIN, PASSWORD);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90000 });
      await openChat(page);
      await expect(page.locator('[data-chatbot-scope]')).toContainText('makes no model call');

      await page.fill('input[placeholder*="Ask"]', MODEL_QUESTION);
      await page.keyboard.press('Enter');

      const answer = page.locator('[data-chatbot-case-answer]').last();
      await expect(answer).toBeVisible({ timeout: 30000 });
      await expect(answer.locator('[data-chatbot-no-model-call]')).toBeVisible();
      await expect(page.locator('.chat-answer').last()).toContainText(DEMO_ASSISTANT_NOTICE);
      // Long enough for a request that was going to be sent to have been sent.
      await page.waitForTimeout(2000);
      expect(forbidden, 'the demo’s assistant called /api/gemini').toEqual([]);
    });
  }

  test('the editor behind the demo workspace map offers no download, and none happens', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1100 });

    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));

    await signInViaLanding(page, ADMIN, PASSWORD);
    // The tour stands beside the map; ended, it stays out of the way.
    await page.addInitScript(
      ([key, last]) => window.localStorage.setItem(key, JSON.stringify({ index: last, state: 'ended', inviting: false })),
      [TOUR_STORAGE_KEY, TOUR_STATIONS.length - 1] as const,
    );
    await page.goto('/demo/workspace?view=business', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90000 });

    await page.locator('[data-process-map-canvas]').first().waitFor({ timeout: 90000 });
    await page.locator('[data-process-edit-toggle]').first().click();
    await page.locator('[data-process-editor]').waitFor({ timeout: 60000 });
    await expect
      .poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 })
      .toBeGreaterThan(5);

    // Editing is kept; the three downloads are not there to press.
    await expect(page.locator('[data-editor-save], [data-editor-discard]').first()).toBeVisible();
    await expect(page.locator('[data-editor-export]')).toHaveCount(0);
    const editor = page.locator('[data-process-editor]');
    await expect(editor.locator('button, a').filter({ hasText: /^(BPMN|SVG|PNG)\b|export/i })).toHaveCount(0);
    await expect(editor.locator('a[download]')).toHaveCount(0);

    await page.waitForTimeout(1000);
    expect(downloads, 'the demo workspace downloaded a file').toEqual([]);
  });
});
