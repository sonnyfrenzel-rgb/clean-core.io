import { test, expect } from '@playwright/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * The Design stage shows the SAP standard, RAP and CAP compared, as a proposal,
 * and refuses a circular reason on screen (roadmap 3.0.12; CO review F14).
 * Rendered: needs the emulators and the app.
 */

const design = (comparison: Record<string, unknown> | null) =>
  JSON.stringify({
    projectName: 'ZCO_ALLOC target',
    architectureOverview: {
      approachDescription: 'An in-app RAP extension carries the custom allocation key; the standard cycle runs the rest.',
      nodeFramework: 'SAP RAP (RESTful Application Programming)',
      runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)',
    },
    nodeAppBlueprint: { projectStructure: [{ path: 'src/zr_alloc.bdef', purpose: 'Behaviour' }], apiEndpoints: [] },
    cloudServices: [],
    dataSync: { patternName: 'Transactional DB Access', description: 'SAP LUW.' },
    securityHardening: [],
    roadmap: [{ phase: 'Phase 1', title: 'RAP', deliverables: ['BO'] }],
    ...(comparison ? { optionComparison: comparison } : {}),
  });

const OPTIONS = [
  { option: 'standard', targetRelease: 'S/4HANA 2023', fitGap: 'The standard allocation cycle covers the distribution; the gap is the key per plant.', effort: 'Low', runningCost: 'None beyond the licence', dataContract: 'Actuals ACDOCA' },
  { option: 'rap', targetRelease: 'S/4HANA 2023', fitGap: 'Rebuilds the key on-stack.', effort: 'Medium', runningCost: 'Runs on the stack', dataContract: 'Actuals ACDOCA, plan ACDOCP as configured' },
  { option: 'cap', targetRelease: 'Not determined.', fitGap: 'Covers it, with a second runtime.', effort: 'High', runningCost: 'Own runtime and operations', dataContract: 'Actuals through a released API' },
];

test.describe('Design, rendered — standard, RAP and CAP compared', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the comparison stands under the overview, standard first, with the requirement the others miss', async ({ page }) => {
    const seeded = await seedStageProject({ prefix: 'design-options', acceptTerms: true });
    await adminMergeDoc('projects', seeded.projectId, {
      solutionDesign: design({
        options: OPTIONS,
        recommended: 'rap',
        decisionReason: 'The allocation key per plant cannot be configured in the standard cycle, and no external user needs the result.',
        requirementOthersMiss: 'An allocation key per plant that the standard cycle cannot express.',
      }),
    });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    const section = page.locator('[data-design-section="options"]');
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(section).toHaveAttribute('data-option-comparison', 'ready');
    await expect(section.locator('[data-option]')).toHaveCount(3);
    await expect(section.locator('[data-option]').first()).toHaveAttribute('data-option', 'standard');
    await expect(section.locator('[data-option="rap"] [data-option-aspect]')).toHaveCount(5);
    await expect(section.locator('[data-option-reason]')).toContainText('An allocation key per plant that the standard cycle cannot express.');
    await expect(section).toContainText(/proposal/i);
  });

  test('a circular reason is not shown as a reason', async ({ page }) => {
    const seeded = await seedStageProject({ prefix: 'design-options-circ', acceptTerms: true });
    await adminMergeDoc('projects', seeded.projectId, {
      solutionDesign: design({ options: OPTIONS, recommended: 'cap', decisionReason: 'CAP because the target architecture is CAP.', requirementOthersMiss: 'CAP.' }),
    });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    const section = page.locator('[data-design-section="options"]');
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(section.locator('[data-option-reason]')).toHaveCount(0);
    await expect(section.locator('[data-option-reason-refused]')).toContainText('restates the route or the target');
  });
});
