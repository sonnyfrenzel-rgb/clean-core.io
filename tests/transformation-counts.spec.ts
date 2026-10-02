import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { findingRows } from '../lib/findings-view';
import { transformationFigures } from '../lib/transformation-view';
import { RICH_LEGACY, seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import DEMO_RELEASE from '../lib/demo-release.json';

/**
 * One count under one word on a real project's Transformation page — owner
 * decision 02.10.2026. The page counted the engine's occurrences (one per
 * source line) as "findings", while Analyze, the worklist and the workspace
 * row count one finding per pattern and object (`findingRows`). The demo spec
 * (`tests/transformation-object-page.spec.ts`) pins the demo's 25 and 31; this
 * one pins a seeded project whose source repeats a pattern, so the two units
 * differ and the page has to say which is which.
 */

// The rich fixture, with the order header read a second and a third time: one
// finding (a direct read of VBAK), three places in the code.
const SOURCE = `${RICH_LEGACY}
SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.
SELECT SINGLE * FROM vbak INTO ls_order WHERE kunnr = ls_order-kunnr.
`;

test('the seeded project counts findings as Analyze does and names the places in the code', async ({ page }) => {
  test.setTimeout(300_000);
  const evidence = buildAbapEvidence(SOURCE, 'main.abap', 'private');
  const findings = findingRows(evidence.findings).length;
  const places = evidence.findings.length;
  expect(places, 'the fixture repeats a pattern, so the units differ').toBeGreaterThan(findings);
  expect(transformationFigures(evidence.findings)).toMatchObject({ findings, places });

  const seeded = await seedStageProject({ prefix: 'tf-counts', acceptTerms: true, rich: true });
  // The page reads the hydrated project, which spreads the run over it: both hold the source.
  await adminMergeDoc('projects', seeded.projectId, { legacyCode: SOURCE });
  await adminMergeDoc(`projects/${seeded.projectId}/runs`, seeded.runId, { legacyCode: SOURCE });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
  const tool = page.locator('[data-transformation-object-page]');
  await expect(tool).toBeVisible({ timeout: 120_000 });

  const plan = tool.locator('[data-transformation-facet="Plan from the engine"]');
  await expect(plan).toContainText(`of ${findings} findings with a target option`);
  await expect(plan).toContainText(`${places} places in the code`);
  await expect(tool.locator('[data-transformation-facet="Released successors"]')).toContainText(`of ${findings} named`);
  await expect(tool.locator('[data-transformation-flow] svg')).toContainText(`YOUR CODE · ${findings} FINDINGS`);
  await expect(tool.locator('[data-code-status]')).toContainText(`${findings} findings at ${places} places in the code`);
  await expect(tool.locator('a[href="#tf-changes"]')).toContainText(`(${findings})`);
  await expect(tool).not.toContainText(`${places} findings`);
  // The repeated read is one change with its three places, not three changes.
  const showAll = tool.getByRole('button', { name: /Show all \d+ changes/ });
  if (await showAll.count()) {
    await expect(showAll).toHaveText(`Show all ${findings} changes`);
    await showAll.click();
  }
  await expect(tool.locator('[data-change-row]')).toHaveCount(findings);
  await expect(tool.locator('[data-change-places="3"]')).toHaveCount(1);
});

test('the demo says 25 findings wherever it counts findings, and never 31', async ({ page }) => {
  test.setTimeout(240_000);
  const { distinctFindings, findings: places } = DEMO_RELEASE.figures;
  await page.goto('/demo/transformation', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-transformation-object-page]')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(`${distinctFindings} findings with a target route`)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(`${places} findings`);

  await page.goto('/demo/delivery', { waitUntil: 'domcontentloaded' });
  const delivery = page.locator('[data-demo-delivery]');
  await expect(delivery).toBeVisible({ timeout: 120_000 });
  await expect(delivery).toContainText(`${distinctFindings} findings in the code`);
  await expect(page.locator('body')).not.toContainText(`${places} findings`);
});
