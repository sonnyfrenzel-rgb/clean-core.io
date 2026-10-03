import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * No screen that loads code on demand throws (owner, 02.10.2026: starting an
 * example from "My workspace" ended in "Something went wrong!" with
 * `(0 , j.getAuth) is not a function`).
 *
 * Since the external audit PERF-01 the evidence engine and `runAnalysis` travel
 * in chunks the browser fetches when a screen asks for them. Whether such a
 * chunk links correctly against the modules the page already holds is a
 * property of the production build: the dev server bundles differently and
 * cannot show it. Each test below records every uncaught page error
 * (`pageerror`) while it walks a path that fetches one of those chunks, and the
 * list must stay empty — an error boundary is the visible half of the same
 * failure, so it is asserted absent too.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'NoPageError123!';

async function communityAccount(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Page', lastName: 'Error', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  return email;
}

/** Every uncaught error the page throws from now on. */
function recordPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`${err.name}: ${err.message}\n${err.stack ?? ''}`));
  return errors;
}

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong!')).toHaveCount(0);
}

test.describe('screens that load code on demand throw nothing (owner 02.10.2026)', () => {
  test('starting an example from "My workspace" opens its workspace without a page error', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('noerr-example');
    await signInViaLanding(page, email, PASSWORD);
    const errors = recordPageErrors(page);

    await page.evaluate(() => window.stop()).catch(() => {});
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const list = page.locator('[data-cc-workspace]');
    await expect(list).toBeVisible({ timeout: 90000 });
    const start = list.locator('[data-example-start="Z_MATERIAL_STOCK_CALC"]').first();
    if (!(await start.isVisible().catch(() => false))) {
      await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
    }
    await start.click({ timeout: 60000 });

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-first-look]')).toHaveAttribute('data-first-look', /^(complete|end-state)$/, {
      timeout: 90000,
    });
    // The start signs the engine's reading and the map loads its chunks — the
    // BPMN reader and the summary of Need & process (ADR-066).
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-workspace-layer-process]')).toBeVisible({ timeout: 60000 });
    // The Public-Cloud-Fit card asks for the engine; let it arrive and settle.
    await page.waitForTimeout(3000);
    await expectNoErrorBoundary(page);
    expect(errors, 'the example start threw').toEqual([]);
  });

  test.describe('a project with source', () => {
    test.describe.configure({ mode: 'serial' });

    let acct: SeededProject;
    /** A second project of the same account, staged and never analysed: its row offers Run. */
    let stagedId: string;
    test.beforeAll(async () => {
      test.setTimeout(120 * 1000);
      acct = await seedStageProject({ prefix: 'noerr', acceptTerms: true, rich: true });
      stagedId = `${acct.projectId}-staged`;
      await adminSetDoc('projects', stagedId, {
        name: 'Staged, never analysed',
        userId: acct.uid,
        createdAt: new Date(),
        status: 'uploaded',
        legacyCode: 'REPORT z_staged.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
        s4Deployment: 'private',
      });
    });

    test('Run in "My workspace" loads the run without a page error', async ({ page }) => {
      test.setTimeout(240 * 1000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await signInThroughForm(page, acct);
      const errors = recordPageErrors(page);
      // No model call and no signed run: the spec is about loading the code that
      // runs, not about what the run computes.
      await page.route('**/api/gemini', (route) => route.fulfill({ status: 503, body: '{}' }));
      let reachedServer!: () => void;
      const reached = new Promise<void>((resolve) => (reachedServer = resolve));
      await page.route('**/api/runs/create', (route) => {
        reachedServer();
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'held by the spec' }),
        });
      });

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
      const run = page.locator(`[data-workspace-run="${stagedId}"]`);
      await expect(run).toBeVisible({ timeout: 90000 });
      await run.click();

      // The run got as far as the server: the loaded module signed the request
      // with the account's token, which is the call that threw.
      await reached;
      const strip = page.locator('[data-cc-message-strip="error"]');
      await expect(strip).toBeVisible({ timeout: 60000 });
      await expect(strip).not.toContainText('is not a function');
      await expectNoErrorBoundary(page);
      expect(errors, 'Run in My workspace threw').toEqual([]);
    });

    for (const [name, path, ready] of [
      ['the workspace', '', '[data-workspace-shell]'],
      ['the workspace, management view', '?view=management', '[data-public-cloud-fit-panel="ready"]'],
      ['Analyze', '/analyze', '[data-analysis-answer]'],
      ['Transformation', '/transformation', '[data-stage-title]'],
    ] as const) {
      test(`opening ${name} draws without a page error`, async ({ page }) => {
        test.setTimeout(240 * 1000);
        await page.setViewportSize({ width: 1440, height: 1600 });
        await signInThroughForm(page, acct);
        const errors = recordPageErrors(page);
        await page.goto(`/project/${acct.projectId}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await expect(page.locator(ready).first()).toBeVisible({ timeout: 90000 });
        await page.waitForTimeout(3000);
        await expectNoErrorBoundary(page);
        expect(errors, `${name} threw`).toEqual([]);
      });
    }
  });
});
