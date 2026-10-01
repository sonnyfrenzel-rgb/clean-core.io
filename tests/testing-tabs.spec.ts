import { test, expect } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { countVerdicts, countsLine, lastRun, scenarios } from '../components/testing/testing-summary';

/**
 * The Testing stage as two tabs (mockup s8): "Run tests against mocks" and
 * "Check tenant connection", the answer in one sentence above them, a right
 * rail in each, and the tenant lock said exactly once.
 *
 * The tabs replace the "Validation Environment" segmented control; the state
 * underneath is the same `s4Environment`. What is held here is that they are
 * real tabs (role, keyboard, one panel shown at a time), that both panels carry
 * what s8 puts in them, and that the stage says where testing stands without
 * inventing a run.
 */

test.describe('where testing stands, from what is on record', () => {
  test('a verdict other than passed or failed is counted as without a result', () => {
    const c = countVerdicts(['Passed', 'Failed', 'Skipped', 'Not run', 'Passed', undefined]);
    expect(c).toEqual({ passed: 2, failed: 1, noResult: 3, total: 6 });
    expect(countsLine(c)).toBe('2 passed · 1 failed · 3 without a result');
    expect(countsLine(countVerdicts(['Passed']))).toBe('1 passed · 0 failed');
    expect(scenarios(1)).toBe('1 scenario');
    expect(scenarios(14)).toBe('14 scenarios');
  });

  test('no receipt and no session run is no run — a stored "Passed" is not one', () => {
    const project = { testCases: [{ id: 't1', status: 'Passed' }] };
    expect(lastRun(project, null)).toEqual({ kind: 'none' });
    expect(lastRun(project, [])).toEqual({ kind: 'none' });
  });

  test('a run of this session without a receipt is reported as not recorded', () => {
    const run = lastRun({}, [{ status: 'Passed' }, { status: 'Failed' }]);
    expect(run.kind).toBe('session');
    if (run.kind === 'session') expect(run.counts).toEqual({ passed: 1, failed: 1, noResult: 0, total: 2 });
  });
});

test.describe('the Testing stage in two tabs', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;

  test.beforeAll(async () => {
    // Seeding goes through the shared emulators; the default 30 s is not always enough.
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'ttabs', acceptTerms: true });
  });

  test('two real tabs, the answer above them, and the keyboard moves between them', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/testing`, { waitUntil: 'domcontentloaded' });

    const list = page.getByRole('tablist', { name: 'Testing' });
    await expect(list).toBeVisible({ timeout: 90000 });
    const mock = list.getByRole('tab', { name: /^Run tests against mocks \(1 scenario\)$/ });
    const tenant = list.getByRole('tab', { name: /^Check tenant connection$/ });
    await expect(mock).toHaveAttribute('aria-selected', 'true');
    await expect(tenant).toHaveAttribute('aria-selected', 'false');

    // The answer first: one sentence, before the tabs, from the case list and
    // the record. The seed has a case marked Passed and no receipt — so it has
    // not run, whatever the stored string says.
    const status = page.locator('[data-testing-status]');
    await expect(status).toHaveAttribute('data-testing-status', 'none');
    await expect(status).toContainText('1 scenario written, not run yet.');
    const statusBox = (await status.boundingBox())!;
    const listBox = (await list.boundingBox())!;
    expect(statusBox.y, 'the status line stands above the tabs').toBeLessThan(listBox.y);

    // The mock panel: scenarios, results, coverage, and what the tab does.
    const mockPanel = page.locator('[data-testing-panel="mock"]');
    await expect(mockPanel).toBeVisible();
    await expect(mockPanel.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
    await expect(mockPanel.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(mockPanel.getByRole('heading', { name: 'Coverage estimate' })).toBeVisible();
    await expect(mockPanel.locator('[data-last-run="none"]')).toContainText('No run on record yet.');
    await expect(mockPanel.locator('[data-tab-explainer]')).toContainText('restricted child process');
    await expect(page.getByRole('button', { name: /Run Selected/ })).toBeVisible();
    // The three tiles are gone; their content is in the rail.
    for (const tile of ['Real Execution, Against Mocks', 'SAP Mock Library', 'Validation Environment']) {
      await expect(page.getByText(tile, { exact: true })).toHaveCount(0);
    }

    if (process.env.TTABS_SHOT) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${process.env.TTABS_SHOT}/mock-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // Keyboard: Tab reaches the chosen tab, ArrowRight selects the next one.
    await mock.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tenant).toBeFocused();
    await expect(tenant).toHaveAttribute('aria-selected', 'true');
    await expect(mockPanel).toBeHidden();

    // The tenant panel: the lock once, with the BYOT way and its steps.
    const tenantPanel = page.locator('[data-testing-panel="live"]');
    await expect(tenantPanel).toBeVisible();
    await expect(page.locator('[data-live-test-lock]')).toHaveCount(1);
    await expect(page.getByText('Tests against a tenant are locked')).toHaveCount(1);
    await expect(page.locator('[data-live-test-lock]')).toContainText('Bring your own tenant (BYOT)');
    await expect(page.locator('[data-byot-step="open"]').first()).toContainText('Access requested');
    await expect(tenantPanel.locator('[data-tab-explainer]')).toContainText('Does not run generated tests on the tenant');
    await expect(page.locator('[data-live-test-hint]')).toContainText('1 scenario');

    // Home goes back, and the choice was the project's environment all along.
    await page.keyboard.press('Home');
    await expect(mock).toHaveAttribute('aria-selected', 'true');
    await expect(mockPanel).toBeVisible();

    // The rail's button on the tenant tab leads to the mock tab as well.
    await tenant.click();
    await tenantPanel.getByRole('button', { name: 'Run tests against mocks' }).click();
    await expect(mock).toHaveAttribute('aria-selected', 'true');
  });

  test('on a phone the stage is one column with no sideways scroll', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/testing`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tablist', { name: 'Testing' })).toBeVisible({ timeout: 90000 });
    for (const name of [/^Run tests against mocks/, /^Check tenant connection$/]) {
      await page.getByRole('tab', { name }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name}: sideways scroll`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('a saved connection is a summary, not a form', () => {
  let account: SeededProject;

  test.beforeAll(async () => {
    // Seeding goes through the shared emulators; the default 30 s is not always enough.
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'ttabs-conn', acceptTerms: true });
    // An account with BYOT granted and a connection in the vault — only the
    // non-secret metadata the profile carries; nothing here reaches a tenant.
    await adminMergeDoc('users', account.uid, {
      s4TenantAccessRequested: true,
      s4TenantAccessAllowed: true,
      s4Meta: { configured: true, url: 'https://my000000-api.s4hana.cloud.sap', username: 'CC_TEST', authType: 'basic', tokenUrl: '' },
    });
    await adminMergeDoc('projects', account.projectId, { s4Environment: 'live' });
  });

  test('saved connection, the guide folded, one main action, and Edit opens the form', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/testing`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('tab', { name: /^Check tenant connection$/ })).toHaveAttribute('aria-selected', 'true', { timeout: 90000 });
    const panel = page.locator('[data-testing-panel="live"]');
    await expect(panel.getByRole('heading', { name: 'Saved connection' })).toBeVisible({ timeout: 30000 });
    // Optional evidence pictures for a compare sheet (`TTABS_SHOT=<dir>`); off in CI.
    if (process.env.TTABS_SHOT) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${process.env.TTABS_SHOT}/saved-tenant-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await expect(panel.locator('[data-saved-connection]')).toContainText('https://my000000-api.s4hana.cloud.sap');
    await expect(panel.locator('[data-saved-connection]')).toContainText('never shown again');
    // Every step of the BYOT way is on record for this account.
    await expect(page.locator('[data-byot-step="done"]')).toHaveCount(3);
    await expect(page.locator('[data-byot-step="open"]')).toHaveCount(0);
    // Not checked in this session — and no date or result is made up for it.
    await expect(panel).toContainText('Not checked in this session');
    await expect(panel.locator('[data-last-check]')).toContainText('No check in this session yet');
    // One primary action on the card.
    await expect(panel.locator('[data-cc-button="primary"]')).toHaveCount(1);
    await expect(panel.getByRole('button', { name: 'Check connection' })).toBeVisible();
    // The guide is folded because a connection is saved, and still in the page.
    await expect(panel.locator('[data-setup-guide]')).toContainText('Collapsed because a connection is saved.');

    await panel.getByRole('button', { name: 'Edit' }).click();
    await expect(panel.getByRole('heading', { name: 'Change the saved connection' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Save connection' })).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.getByRole('heading', { name: 'Saved connection' })).toBeVisible();

    // Delete asks first; cancelling leaves the connection where it was.
    await panel.getByRole('button', { name: 'Delete connection' }).click();
    const box = page.getByRole('dialog', { name: 'Delete the saved connection?' });
    await expect(box).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    await expect(panel.getByRole('heading', { name: 'Saved connection' })).toBeVisible();
  });
});
