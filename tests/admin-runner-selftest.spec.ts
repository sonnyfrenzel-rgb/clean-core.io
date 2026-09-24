import { test, expect, type Page } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';

/**
 * Roadmap 8.9 — the runner self-test, run from the admin console.
 *
 * The route's answer is intercepted: the emulator run has no runner, and what
 * this spec holds is the rendering, above all that `incomplete` never reads as
 * a pass. The route itself — its gate and its verdict — is covered where it is
 * computed (`lib/runner-selftest.ts`).
 */

const firebaseApp = initializeApp(firebaseConfig, 'admin-runner-selftest');
const firebaseAuth = getAuth(firebaseApp);
// Fail closed: throws unless the run targets the emulators.
connectAuthToEmulator(firebaseAuth);

const ADMIN_EMAIL = disposableEmail('admin-selftest');
const ADMIN_PASSWORD = EMULATOR_PASSWORD;

const SANDBOX_PROBES = [
  'no secret-named environment variables',
  'no file outside the sandbox directory is readable',
  'no connection to www.google.com:443 or 8.8.8.8:53',
  'no connection to 169.254.169.254:80 from the sandbox',
  'no connection to 10.10.0.1:443',
];
const NET_TARGETS = ['public host 8.8.8.8:53', 'public host www.google.com:443', 'private address 10.10.0.1:443'];

const network = (mode: string, reached: (t: string) => boolean) => {
  const probes = NET_TARGETS.map((target) => ({ target, reached: reached(target) }));
  const held = probes.every((p) => p.reached === false);
  return {
    ok: true,
    held,
    reason: held ? null : `Reached or not explicitly unreached: ${probes.filter((p) => p.reached).map((p) => p.target).join(', ')}.`,
    detail: { mode, revision: `test-runner-${mode}-00042-abc`, probes },
  };
};

const sandboxHeld = {
  held: true,
  probes: SANDBOX_PROBES.map((probe) => ({ probe, held: true })),
  reason: null,
  revision: 'test-runner-mock-00042-abc',
};

const BASE = {
  file: 'runner-selftest.test.mjs',
  notProbed: 'The metadata address: every Cloud Run container reaches its own metadata server.',
};

const HELD = {
  ...BASE,
  held: true,
  status: 'held',
  incomplete: null,
  sandbox: sandboxHeld,
  network: { mock: network('mock', () => false), live: network('live', () => false) },
};

const INCOMPLETE_REASON =
  'The live runner is not configured on this deployment (RUNNER_LIVE_URL), so its network probe was not run. Without it the test is not a pass.';
const INCOMPLETE = {
  ...BASE,
  held: false,
  status: 'incomplete',
  incomplete: INCOMPLETE_REASON,
  sandbox: sandboxHeld,
  network: { mock: network('mock', () => false), live: null },
};

const NOT_HELD = {
  ...BASE,
  held: false,
  status: 'not-held',
  incomplete: null,
  sandbox: {
    held: false,
    probes: SANDBOX_PROBES.map((probe, i) => ({ probe, held: i !== 3 })),
    reason: `Not held: ${SANDBOX_PROBES[3]}.`,
    revision: 'test-runner-mock-00042-abc',
  },
  network: {
    // The mock runner did not answer at all: unreachable is not held.
    mock: { ok: false, held: false, reason: 'fetch failed', detail: 'fetch failed' },
    live: network('live', (t) => t === 'public host www.google.com:443'),
  },
};

async function signInAsAdmin(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.stop()).catch(() => {});
  try {
    await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
  } catch {
    await page.evaluate(() => window.stop()).catch(() => {});
    await page.waitForTimeout(1000);
    await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
  }
  await expect(page.getByRole('heading', { name: /Admin Control Room/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Runner self-test' })).toBeVisible();
}

async function answerWith(page: Page, status: number, body: unknown) {
  await page.unroute('**/api/admin/runner-selftest');
  await page.route('**/api/admin/runner-selftest', async (route) => {
    // The panel sends the admin's ID token, like every other console action.
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['authorization'] || '').toMatch(/^Bearer .+/);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const runButton = (page: Page) => page.getByRole('button', { name: 'Run self-test' });
const output = (page: Page) => page.locator('[data-runner-selftest-output]');

test.describe('Admin Console — runner self-test (roadmap 8.9)', () => {
  test.beforeAll(async () => {
    const adminUid = (await createUserWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, ADMIN_PASSWORD)).user.uid;
    await adminSetDoc('users', adminUid, {
      firstName: 'Admin', lastName: 'Selftest', email: ADMIN_EMAIL,
      tier: 'enterprise', status: 'approved', isAdmin: true,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetCustomClaim(adminUid, { admin: true });
  });

  test('held, incomplete, not held and a refused step-up each render as what they are', async ({ page }) => {
    test.setTimeout(150 * 1000);
    page.on('pageerror', (err) => process.stdout.write(`[BROWSER ERROR] ${err.message}\n`));
    await signInAsAdmin(page);

    // The result region is announced.
    await expect(output(page)).toHaveAttribute('aria-live', 'polite');

    // --- held -------------------------------------------------------------
    // A slow answer, so the busy state is observable.
    await page.unroute('**/api/admin/runner-selftest');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route('**/api/admin/runner-selftest', async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HELD) });
    });
    await runButton(page).click();
    const busyButton = page.getByRole('button', { name: 'Running…' });
    await expect(busyButton).toBeDisabled();
    await expect(busyButton).toHaveAttribute('aria-busy', 'true');
    release();

    const held = output(page).locator('[data-selftest-status="held"]');
    await expect(held).toBeVisible();
    await expect(held.locator('[data-cc-message-strip]')).toHaveAttribute('data-cc-message-strip', 'success');
    await expect(held).toContainText('Held.');
    await expect(held.locator('[data-selftest-timestamp]')).toContainText('Result received');
    for (const probe of SANDBOX_PROBES) {
      await expect(held.locator(`[data-selftest-sandbox] [data-selftest-probe="${probe}"]`)).toContainText('reached: false');
    }
    for (const name of ['Mock', 'Live']) {
      const block = held.locator(`[data-selftest-network="${name}"]`);
      await expect(block).toHaveAttribute('data-selftest-part-held', 'held');
      for (const t of NET_TARGETS) {
        await expect(block.locator(`[data-selftest-probe="${t}"]`)).toContainText('reached: false');
      }
    }
    await expect(held.locator('[data-selftest-revision]').first()).toContainText('test-runner-mock-00042-abc');
    await expect(held.locator('[data-selftest-revision]').first()).toContainText('self-reported');

    // --- incomplete: never a pass ----------------------------------------
    await answerWith(page, 200, INCOMPLETE);
    await runButton(page).click();
    const incomplete = output(page).locator('[data-selftest-status="incomplete"]');
    await expect(incomplete).toBeVisible();
    await expect(output(page).locator('[data-selftest-status="held"]')).toHaveCount(0);
    const strip = incomplete.locator('[data-cc-message-strip]').first();
    await expect(strip).toHaveAttribute('data-cc-message-strip', 'warning');
    await expect(strip).toContainText('Incomplete — this is not a pass.');
    await expect(strip).not.toContainText('Held.');
    await expect(incomplete.locator('[data-selftest-incomplete-reason]')).toContainText('RUNNER_LIVE_URL');
    await expect(incomplete.locator('[data-selftest-network="Live"]')).toHaveAttribute('data-selftest-part-held', 'not-run');
    await expect(incomplete.locator('[data-selftest-network="Live"]')).toContainText('Not run');
    // Nothing in an incomplete result wears the success colour at the verdict level.
    await expect(incomplete.locator('[data-cc-message-strip="success"]')).toHaveCount(0);

    // --- not held ---------------------------------------------------------
    await answerWith(page, 200, NOT_HELD);
    await runButton(page).click();
    const notHeld = output(page).locator('[data-selftest-status="not-held"]');
    await expect(notHeld).toBeVisible();
    await expect(notHeld.locator('[data-cc-message-strip]').first()).toHaveAttribute('data-cc-message-strip', 'error');
    await expect(notHeld).toContainText('Not held.');
    await expect(notHeld.locator(`[data-selftest-probe="${SANDBOX_PROBES[3]}"]`)).toContainText('reached: true or not proven');
    await expect(notHeld.locator('[data-selftest-network="Mock"]')).toHaveAttribute('data-selftest-part-held', 'not-held');
    await expect(notHeld.locator('[data-selftest-network="Mock"]')).toContainText('The runner did not answer (fetch failed)');
    await expect(notHeld.locator('[data-selftest-network="Live"]')).toHaveAttribute('data-selftest-part-held', 'not-held');
    await expect(
      notHeld.locator('[data-selftest-network="Live"] [data-selftest-probe="public host www.google.com:443"]'),
    ).toContainText('reached: true');

    // --- 403: step-up missing -------------------------------------------
    await answerWith(page, 403, { error: 'MFA security timeout. Sign in again with your authenticator code and retry.' });
    await runButton(page).click();
    const refused = output(page).locator('[data-selftest-failure="sign-in-again"]');
    await expect(refused).toBeVisible();
    await expect(refused).toContainText('A fresh sign-in is needed.');
    await expect(refused).toContainText('authenticator code');
    await expect(refused.getByRole('button', { name: 'Sign out and sign in again' })).toBeVisible();
    await expect(output(page).locator('[data-selftest-status]')).toHaveCount(0);

    // --- 403: MFA never enrolled ------------------------------------------
    await answerWith(page, 403, { error: 'Admin actions require multi-factor authentication. Enable MFA in your settings first.' });
    await runButton(page).click();
    const noMfa = output(page).locator('[data-selftest-failure="enable-mfa"]');
    await expect(noMfa).toBeVisible();
    await expect(noMfa.getByRole('button', { name: 'Open settings' })).toBeVisible();

    // --- 5xx ----------------------------------------------------------------
    await answerWith(page, 500, { error: 'The runner selftest could not be completed.' });
    await runButton(page).click();
    const failed = output(page).locator('[data-selftest-failure="retry"]');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Nothing was proven');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

    // --- the app itself does not answer ------------------------------------
    await page.unroute('**/api/admin/runner-selftest');
    await page.route('**/api/admin/runner-selftest', (route) => route.abort('connectionrefused'));
    await runButton(page).click();
    await expect(output(page).locator('[data-selftest-failure="retry"]')).toContainText('The app did not answer.');
  });
});
