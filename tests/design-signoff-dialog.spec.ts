import { test, expect } from '@playwright/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

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

  await page.locator('[data-design-confirm]').click();
  const dialog = page.locator('[data-design-signoff-dialog]');
  await expect(dialog.getByRole('dialog')).toBeVisible();
  await expect(dialog.locator('[data-architect-signoff="open"]')).toBeVisible();

  // Escape leaves without deciding.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-design-answer="recommended"]')).toBeVisible();

  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-design-signoff-dialog] button:has-text("Confirm & Lock Architecture")').click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-signoff-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-design-confirm]')).toHaveText(/Change target/);

  // The confirmed record is one click away, with its way back.
  await page.locator('[data-design-confirm]').click();
  await expect(page.locator('[data-design-signoff-dialog] [data-architect-signoff="locked"]')).toBeVisible();
  await expect(page.locator('[data-design-signoff-dialog]')).toContainText('Change Decision');
});
