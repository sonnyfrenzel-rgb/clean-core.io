import { test, expect } from '@playwright/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminGetDoc, adminMergeDoc } from './helpers/admin-seed';
import { SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';

/**
 * The Design tool's sign-off opens as a dialog from "Confirm target" (owner
 * decision 01.10.2026) — same `ArchitectSignOff`, same command, same run
 * binding; the side panel stays compact. And the stage draws one architecture
 * picture, the engine's: the model-drawn diagrams are gone.
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

test('Confirm target opens the sign-off as a dialog, and a confirmation closes it', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await seedStageProject({ prefix: 'dsignoff', acceptTerms: true, rich: true });
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });

  // Compact panel: the sign-off form is not in the page until asked for.
  await expect(page.locator('#architect-sign-off')).toBeVisible();
  await expect(page.locator('[data-architect-signoff]')).toHaveCount(0);
  // One architecture picture — the engine's — and no model-drawn diagram.
  await expect(page.locator('text=Target Architecture Diagram')).toHaveCount(0);

  // "Confirm target" asks first (owner 02.10.2026); another target is one
  // step further, in the full sign-off.
  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-design-confirm-other]').click();
  const dialog = page.locator('[data-design-signoff-dialog]');
  await expect(dialog.getByRole('dialog')).toBeVisible();
  await expect(dialog.locator('[data-architect-signoff="open"]')).toBeVisible();

  // Escape leaves without deciding.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-design-answer="recommended"]')).toBeVisible();

  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-design-confirm-other]').click();
  await page.locator('[data-design-signoff-dialog] button:has-text("Confirm & Lock Architecture")').click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-signoff-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-design-confirm]')).toHaveText(/Change target/);

  // The confirmed record is one click away, with its way back.
  await page.locator('[data-design-confirm]').click();
  await expect(page.locator('[data-design-signoff-dialog] [data-architect-signoff="locked"]')).toBeVisible();
  await expect(page.locator('[data-design-signoff-dialog]')).toContainText('Change Decision');
});

/**
 * Owner decision 02.10.2026: the dialog names the contract's recommendation —
 * the route the card above it shows and the one `approve-architecture` checks
 * a departure against on the server. It used to be handed the stored value
 * (`extensibilityRoute`, which the browser writes) so the server would not
 * refuse the reader's confirmation; now the two agree and the dialog follows.
 */
test('the dialog recommends the contract’s route, not a route switch the browser wrote, and confirming it is accepted', async ({ page }) => {
  test.setTimeout(300_000);
  // The plain fixture's code is in-app RAP by the engine; the switch says side-by-side.
  const seeded = await seedStageProject({ prefix: 'dsignoff-contract', acceptTerms: true });
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON, extensibilityRoute: SIDE_BY_SIDE_ROUTE });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#design-answer')).toHaveText('Developer Extensibility (RAP / ABAP Cloud)');

  // The question names the same route the card and the panel name.
  await page.locator('[data-design-confirm]').click();
  await expect(page.locator('[data-design-confirm-ask]')).toContainText('Developer Extensibility (RAP / ABAP Cloud)');
  await page.locator('[data-design-confirm-other]').click();
  const panel = page.locator('[data-design-signoff-dialog] [data-architect-signoff="open"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('h3').first()).toHaveText('Developer Extensibility (RAP / ABAP Cloud)');
  await expect(panel).not.toContainText('Side-by-Side (CAP) extensibility path');

  await page.locator('[data-design-signoff-dialog] button:has-text("Confirm & Lock Architecture")').click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-signoff-refusal]')).toHaveCount(0);
  const stored = await adminGetDoc('projects', seeded.projectId);
  expect(stored?.targetArchitecture).toBe('rap');
  expect(stored?.architectJustifiedOverride).toBe('');
});
