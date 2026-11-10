import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * C14 on the page (3.0.21, A10): the one-time notice before the first
 * automatic model call, on the own-code upload. What only a browser shows:
 * it stands above the source without covering it, on a desktop and a phone;
 * the switch posts the per-account stages and the "seen" mark at once; "Got
 * it" posts the mark and closes it; and it is absent when nothing would run
 * by itself or the account answered it before. `/api/model-stages` is
 * answered here, so each state is set exactly; the route itself is held by
 * `tests/legal-a9-a10-3021.spec.ts`.
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'AutoSteps123!';
const ACCOUNT = `auto-steps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

const STAGES = { analyze: true, naming: true, statements: true, design: true, transformation: true, documentation: true, testing: true };

function answer(over: Record<string, unknown> = {}) {
  return {
    stages: STAGES,
    keyAvailable: true,
    keySource: 'community',
    provider: 'gemini',
    answers: {},
    autoSteps: true,
    suspendedProvider: null,
    suspendedNotice: null,
    autoStepsNoticeSeen: false,
    autoModelSteps: true,
    ...over,
  };
}

/** Answers `/api/model-stages` from `state`, records every POST body, and applies it as the route would. */
async function modelStages(page: Page, initial: Record<string, unknown>) {
  const posts: Array<Record<string, unknown>> = [];
  let state: Record<string, unknown> = answer(initial);
  await page.route('**/api/model-stages', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = (req.postDataJSON() ?? {}) as { stages?: Record<string, boolean>; autoStepsNotice?: string; autoModelSteps?: boolean };
      posts.push(body);
      // The main switch (legal review 06.11.2026, item 2): off makes `autoSteps` false on every key, as the route answers.
      const main = typeof body.autoModelSteps === 'boolean' ? body.autoModelSteps : (state.autoModelSteps as boolean);
      state = {
        ...state,
        stages: { ...(state.stages as Record<string, boolean>), ...(body.stages ?? {}) },
        autoStepsNoticeSeen: state.autoStepsNoticeSeen || body.autoStepsNotice === 'seen',
        autoModelSteps: main,
        autoSteps: main && state.keySource === 'community',
      };
      await route.fulfill({ json: { ok: true, ...state } });
      return;
    }
    await route.fulfill({ json: state });
  });
  return posts;
}

async function openUpload(page: Page) {
  await signInViaLanding(page, ACCOUNT, PASSWORD);
  await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
}

test.describe('C14 — the notice before the first automatic model call', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ACCOUNT, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Auto', lastName: 'Steps', email: ACCOUNT,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    });
  });

  test('shown above the source; the switch turns the automatic steps off and records it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const posts = await modelStages(page, {});
    await openUpload(page);

    const notice = page.locator('[data-auto-steps-notice]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toHaveAttribute('data-auto-steps-notice', 'on');
    await expect(notice.locator('[data-auto-steps-notice-lead]')).toHaveText(
      'When you open a project, one step — plain business sentences — is written automatically by an AI model (Google Gemini). The code it needs goes to Google for that. If your code must not leave the platform, switch this off now:',
    );
    // Since the legal review of 06.11.2026 (N1/B2) Transformation and Documentation start on a click
    // only, the sentence on them is gone, and the one switch covers every automatic call.
    await expect(notice.locator('[data-auto-steps-notice-tools]')).toHaveCount(0);
    await expect(notice.locator('[data-auto-steps-notice-after]')).toHaveText(
      'This one switch covers every model call the platform starts without your click. You can change it any time in Settings under “Where the AI model is used”.',
    );
    // Above the source, and it covers nothing: the drop zone stays clickable.
    const n = (await notice.boundingBox())!;
    const drop = (await page.locator('[data-own-code-drop]').boundingBox())!;
    expect(n.y + n.height).toBeLessThanOrEqual(drop.y);
    await expect(page.locator('[data-own-code-choose]')).toBeEnabled();

    const sw = notice.locator('[data-auto-steps-notice-switch]');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(notice.locator('[data-auto-steps-notice-off]')).toBeVisible();
    // One stored main switch since 06.11.2026 (item 2), not the per-stage switches.
    expect(posts).toEqual([{ autoModelSteps: false, autoStepsNotice: 'seen' }]);

    // Stays until "Got it", then goes.
    await notice.locator('[data-auto-steps-notice-dismiss]').click();
    await expect(page.locator('[data-auto-steps-notice]')).toHaveCount(0);
    expect(posts[1]).toEqual({ autoStepsNotice: 'seen' });
  });

  test('"Got it" keeps the default and records the notice as answered', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const posts = await modelStages(page, {});
    await openUpload(page);
    const notice = page.locator('[data-auto-steps-notice]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await notice.locator('[data-auto-steps-notice-dismiss]').click();
    await expect(page.locator('[data-auto-steps-notice]')).toHaveCount(0);
    expect(posts).toEqual([{ autoStepsNotice: 'seen' }]);
  });

  test('on a phone it fits the width and covers nothing', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await modelStages(page, {});
    await openUpload(page);
    const notice = page.locator('[data-auto-steps-notice]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    const box = (await notice.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(notice.locator('[data-auto-steps-notice-switch]')).toBeVisible();
  });

  for (const [why, over] of [
    ['answered before', { autoStepsNoticeSeen: true }],
    ['own key with "Automatic steps" off', { keySource: 'byok', autoSteps: false }],
    ['the step already off', { stages: { ...STAGES, statements: false } }],
    ['no key', { keyAvailable: false, keySource: null, provider: null }],
  ] as const) {
    test(`not shown: ${why}`, async ({ page }) => {
      test.setTimeout(240 * 1000);
      await page.setViewportSize({ width: 1440, height: 1200 });
      await modelStages(page, over as Record<string, unknown>);
      const answered = page.waitForResponse((r) => r.url().includes('/api/model-stages') && r.request().method() === 'GET', { timeout: 90000 });
      await openUpload(page);
      await expect(page.locator('[data-own-code-drop]')).toBeVisible();
      // The model answer is in; give React one render to put the notice up if it were wanted.
      await answered;
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-auto-steps-notice]')).toHaveCount(0);
    });
  }
});
