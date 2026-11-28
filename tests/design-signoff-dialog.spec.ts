import { test, expect } from './helpers/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';

/**
 * Design's Management view since ADR-145 (owner decisions 25.11.2026): the route is recorded with the decision on the
 * Decide page, so Design no longer asks for "Confirm target", shows no checklist "Before sign-off" and not the four
 * options again. It shows the decided option and what is still in the way; "Change target" stays for a route on record
 * and opens the same sign-off (`ArchitectSignOff`, same command, same run binding). And the stage draws one
 * architecture picture, the engine's.
 */

const DESIGN_JSON = JSON.stringify({
  projectName: 'Sign-off dialog fixture',
  architectureOverview: {
    approachDescription: 'Side-by-side CAP service that reads sales orders through released APIs.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model)',
    runtimePlatform: 'SAP BTP (Business Technology Platform)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'srv/service.cds', purpose: 'Service' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Released API calls', description: 'Synchronous calls through the destination service.' },
  securityHardening: [],
  roadmap: [],
});

test('undecided: Management leads to the decision, with no "Confirm target", no checklist and no second set of options', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await seedStageProject({ prefix: 'dsignoff', acceptTerms: true, rich: true });
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-view="management"] #design-answer')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#design-answer [data-answer]')).toHaveText('Not decided yet. The decision is taken on the Decide page.', { timeout: 60_000 });
  // Straight to the choice on the Decide page, not to its top.
  await expect(page.locator('[data-design-decide]')).toHaveAttribute('href', `/project/${seeded.projectId}/redesign#decide`);
  await expect(page.locator('[data-design-confirm]')).toHaveCount(0);
  await expect(page.locator('[data-design-checklist], #design-checklist')).toHaveCount(0);
  await expect(page.locator('#design-options')).toHaveCount(0);
  // One architecture picture — the engine's — and no model-drawn diagram.
  await expect(page.locator('text=Target Architecture Diagram')).toHaveCount(0);
});

test('a route on record: "Change target" opens the sign-off with its record and its way back', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await seedStageProject({ prefix: 'dsignoff-change', acceptTerms: true, rich: true });
  await adminMergeDoc('projects', seeded.projectId, {
    solutionDesign: DESIGN_JSON,
    targetArchitecture: 'rap',
    approvedByArchitect: true,
    architectJustifiedOverride: '',
    architectSignOffAt: new Date().toISOString(),
    approvedBy: seeded.email,
  });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  const change = page.locator('[data-design-confirm]');
  await expect(change).toHaveText(/Change target/, { timeout: 120_000 });
  // Compact: the sign-off form is not in the page until asked for.
  await expect(page.locator('[data-architect-signoff]')).toHaveCount(0);
  await change.click();
  const dialog = page.locator('[data-design-signoff-dialog]');
  await expect(dialog.locator('[data-architect-signoff="locked"]')).toBeVisible();
  await expect(dialog).toContainText('Change Decision');
  // Escape leaves without changing anything.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

/**
 * Owner decision 02.10.2026, carried to the Decide page: the route a Rebuild is recorded with is the contract's — the
 * one `decide` checks a departure against on the server — not a route switch the browser wrote.
 */
test('the Decide page names the contract’s route for a Rebuild, not a route switch the browser wrote', async ({ page }) => {
  test.setTimeout(300_000);
  // The plain fixture's code is in-app RAP by the engine; the switch says side-by-side.
  const seeded = await seedStageProject({ prefix: 'dsignoff-contract', acceptTerms: true });
  await adminMergeDoc('projects', seeded.projectId, { extensibilityRoute: SIDE_BY_SIDE_ROUTE });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/redesign`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-decide-option="rebuild"]').click();
  const route = page.locator('[data-decide-route]');
  await expect(route).toHaveAttribute('data-decide-route', 'rap', { timeout: 60_000 });
  await expect(route).toContainText('On-stack, RAP');
  // The chip says whose route it is; the quieter tool head hides engine chips inside blocks by CSS, so it is attached,
  // not drawn (feat/3.5.4-head).
  await expect(route.locator('[data-family-chip="engine"]')).toBeAttached();
  // Following the contract's route asks for no reason.
  await expect(page.locator('[data-decide-reason]')).toHaveCount(0);
});
