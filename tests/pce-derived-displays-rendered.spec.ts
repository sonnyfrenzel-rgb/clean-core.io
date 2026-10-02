import { test, expect } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { catalogSnapshotRefFor } from '../lib/abap/catalog-snapshots';
import { gradeSapObjectUse } from '../lib/abap/catalog-service';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { publicCloudFitLookupObjects } from '../lib/abap/public-cloud-fit-resolver';
import { accessUseOfKind, findingRows } from '../lib/findings-view';
import { transformationFigures } from '../lib/transformation-view';
import type { CloudReadinessGrade } from '../lib/abap/abcd-classification';

/**
 * Owner decision 30.09.2026, on screen: **Analyze, Transformation and the
 * workspace's Public-Cloud-Fit card show the findings and levels of the core
 * result** — the evidence the signed run computes with the catalog snapshot of
 * the project's target profile and the file name it signed.
 *
 * Until 02.10.2026 the three computed the evidence in the browser with
 * `buildAbapEvidence(code, 'main.abap', deployment)`: the default (Public)
 * list. `tests/pce-derived-displays.spec.ts` holds the builders; this spec
 * holds what a reader of a Private Edition project actually sees.
 *
 * The fixture is that spec's object, read only: `I_BILLINGDOCUMENTITEMDEX` is
 * released in the PCE list and not listed in the Public one, so a read of it
 * is no finding under the project's target and a standard table read under the
 * default list. Every display below therefore differs between the two — the
 * premise test says so first, so a catalog sync that changed it fails there
 * rather than turning the rest vacuous.
 */

const PCE_ONLY = 'I_BILLINGDOCUMENTITEMDEX';
const FILE = 'ZPCE_DERIVED.abap';
const SOURCE = [
  'REPORT zpce_derived.',
  `SELECT * FROM ${PCE_ONLY.toLowerCase()} INTO TABLE @DATA(lt_items).`,
  'SELECT * FROM vbak INTO TABLE @DATA(lt_orders).',
  '',
].join('\n');

/** The snapshot the signed run reads for a Private Edition project naming no release. */
const coreKey = catalogSnapshotRefFor('private', '').registryKey;
/** The core result — what `/api/runs/create` computes for this project. */
const core = buildAbapEvidence(SOURCE, FILE, 'private', coreKey);
/** What the three displays computed in the browser until 02.10.2026. */
const browserBuilt = buildAbapEvidence(SOURCE, 'main.abap', 'private');

/** Findings per clean core level, as the Analyze level bar draws them: `C 1`. */
function levelBlocks(findings: typeof core.findings): string[] {
  const dist = new Map<CloudReadinessGrade, number>();
  for (const row of findingRows(findings)) {
    if (!row.finding.objectName) continue;
    const g = gradeSapObjectUse(row.finding.objectName.trim().toUpperCase(), accessUseOfKind(row.finding.kind), coreKey).grade;
    dist.set(g, (dist.get(g) ?? 0) + 1);
  }
  return (['A', 'B', 'C', 'D'] as const).filter((g) => dist.get(g)).map((g) => `${g} ${dist.get(g)}`);
}

const fitObjects = (findings: typeof core.findings) => publicCloudFitLookupObjects(findings).map((o) => o.name).sort();

test.describe('a PCE project shows the core result on Analyze, Transformation and the fit card', () => {
  test.describe.configure({ mode: 'serial' });

  test('the premise: the default list reads this source otherwise, on every display', () => {
    expect(coreKey).toBe('pce-latest');
    expect(core.findings.some((f) => f.objectName === PCE_ONLY), 'released under PCE: no finding').toBe(false);
    expect(browserBuilt.findings.some((f) => f.objectName === PCE_ONLY), 'not listed in Public: a finding').toBe(true);
    expect(levelBlocks(browserBuilt.findings)).not.toEqual(levelBlocks(core.findings));
    expect(transformationFigures(browserBuilt.findings).findings).not.toBe(transformationFigures(core.findings).findings);
    expect(fitObjects(browserBuilt.findings)).not.toEqual(fitObjects(core.findings));
  });

  let acct: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    acct = await seedStageProject({ prefix: 'pcedisp', acceptTerms: true });
    // A Private Edition project naming no release, with the file name its run signed.
    await adminMergeDoc('projects', acct.projectId, {
      legacyCode: SOURCE,
      s4Deployment: 'private',
      auditMetadata: { inputFingerprint: { fileName: FILE } },
    });
  });

  test('Analyze: the findings and their levels are the core result', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze`);

    const findings = page.locator('[data-analysis-findings]');
    await expect(findings).toBeVisible({ timeout: 60000 });
    // One group per kind of finding the core result has, and no other.
    const kinds = [...new Set(core.findings.map((f) => f.kind))].sort();
    await expect
      .poll(async () => (await findings.locator('[data-findings-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-findings-group')))).sort())
      .toEqual(kinds);
    // The object the PCE list releases is no finding here.
    await expect(findings).not.toContainText(PCE_ONLY);
    // The level bar counts the core findings at the core levels.
    await expect(page.locator('[data-level-bar]')).toBeVisible({ timeout: 60000 });
    await expect
      .poll(async () => page.locator('[data-level-block]').allTextContents())
      .toEqual(levelBlocks(core.findings));
  });

  test('Transformation: the facets count the core findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/transformation`);

    const figures = transformationFigures(core.findings);
    const places = page.locator('[data-transformation-places]');
    await expect(places).toHaveAttribute('data-transformation-places', String(figures.places), { timeout: 60000 });
    await expect(page.locator('[data-transformation-facet="Plan from the engine"]')).toContainText(
      `of ${figures.findings} findings with a target option`,
    );
    await expect(page.locator('[data-transformation-object-page]')).not.toContainText(PCE_ONLY);
  });

  test('Public-Cloud-Fit card: it sorts the objects of the core findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}?view=management`);

    const card = page.locator('[data-public-cloud-fit-panel]');
    await expect(card).toHaveAttribute('data-public-cloud-fit-panel', 'ready', { timeout: 60000 });
    const shown = await card
      .locator('[data-public-cloud-fit-object]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-public-cloud-fit-object') ?? ''));
    expect(shown.sort()).toEqual(fitObjects(core.findings));
  });
});
