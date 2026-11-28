import { test, expect, type Page } from './helpers/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * Lawyer's statement 24c, rendered: the Decide page's two model-calling buttons hand their start on in memory only
 * (`lib/start-request.ts`). So a direct visit to Transformation or Design, and a reload of either, sends nothing to a
 * model and buys no generation lease, exactly as before 3.5.4 (legal review 06.11.2026, 3.0.21 item 1). The
 * server-free half is `decide-model-buttons.spec.ts`; `auto-steps-tools-on-open-3021.spec.ts` stays as it is.
 */

const DESIGN_JSON = JSON.stringify({
  projectName: 'No start on open',
  architectureOverview: { approachDescription: 'In-app RAP.', nodeFramework: 'SAP RAP (RESTful Application Programming)', runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)' },
  nodeAppBlueprint: { projectStructure: [{ path: 'zr_x.bdef', purpose: 'Behaviour' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Transactional DB Access', description: 'One LUW.' },
  securityHardening: [],
  roadmap: [{ phase: 'Phase 1', title: 'RAP', deliverables: ['BO'] }],
});

/** Every request that would start model work: the model proxy and the generation lease. */
function watchModelWork(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    // A GET of the lease route is the plan's read of this hour's generations, not a start.
    if (/\/api\/gemini\b|\/api\/transformation\/lease\b/.test(url) && r.method() !== 'GET') seen.push(`${r.method()} ${url}`);
  });
  return seen;
}

test('a direct visit to Transformation and a reload of it send nothing to a model', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await seedStageProject({ prefix: 'no-start-tf', acceptTerms: true, rich: true });
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });
  await signInThroughForm(page, seeded);
  const seen = watchModelWork(page);
  await page.goto(`/project/${seeded.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(6000);
  expect(seen).toEqual([]);
});

test('a direct visit to Design and a reload of it send nothing to a model', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await seedStageProject({ prefix: 'no-start-design', acceptTerms: true, rich: true });
  await signInThroughForm(page, seeded);
  const seen = watchModelWork(page);
  await page.goto(`/project/${seeded.projectId}/design?view=business`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(6000);
  expect(seen).toEqual([]);
});
