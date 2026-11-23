import { test, expect } from './helpers/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { catalogSnapshotRefFor } from '../lib/abap/catalog-snapshots';
import { gradeSapObjectUse } from '../lib/abap/catalog-service';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { accessUseOfKind, findingRows } from '../lib/findings-view';
import { transformationFigures } from '../lib/transformation-view';
import type { CloudReadinessGrade } from '../lib/abap/abcd-classification';

/**
 * Owner decision 30.09.2026, on screen: **Analyze, Transformation and the
 * workspace's Public-Cloud-Fit card (since 3.5.0: Analyze's Management level mix) show the findings and levels of the core
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

/**
 * The note of the IT answer's "Clean core levels" facet (`components/analyze/AnalyzeIt.tsx`): the levels other than
 * the worst with their counts, the unknown ones, then the catalog.
 */
function levelFacetNote(findings: typeof core.findings): string {
  const dist = new Map<CloudReadinessGrade, number>();
  for (const row of findingRows(findings)) {
    if (!row.finding.objectName) continue;
    const g = gradeSapObjectUse(row.finding.objectName.trim().toUpperCase(), accessUseOfKind(row.finding.kind), coreKey).grade;
    dist.set(g, (dist.get(g) ?? 0) + 1);
  }
  const n = (g: CloudReadinessGrade) => dist.get(g) ?? 0;
  const worst = (['D', 'C', 'B', 'A'] as const).find((g) => n(g) > 0) ?? null;
  const graded = n('A') + n('B') + n('C') + n('D');
  const others = (['C', 'B', 'A'] as const).filter((g) => g !== worst && n(g) > 0).map((g) => `${n(g)} ${g}`).join(' · ');
  return `${others || `${graded} graded`}${n('Unknown') ? ` · ${n('Unknown')} unknown` : ''} · from SAP's catalog`;
}

/** Findings per clean core level, as the Analyze level bar draws them: `C 1`. */
function levelBlocks(findings: typeof core.findings): string[] {
  const dist = new Map<CloudReadinessGrade, number>();
  for (const row of findingRows(findings)) {
    if (!row.finding.objectName) continue;
    const g = gradeSapObjectUse(row.finding.objectName.trim().toUpperCase(), accessUseOfKind(row.finding.kind), coreKey).grade;
    dist.set(g, (dist.get(g) ?? 0) + 1);
  }
  // The hero's level facet names every letter, a zero included (ADR-093, F2): the chip, then its count.
  return (['A', 'B', 'C', 'D'] as const).map((g) => `${g}${dist.get(g) ?? 0}`);
}

/**
 * The Level A–D mix of Analyze's Management view (`managementLevelMix`, lib/analyze-management.ts): each SAP object
 * once per level, as the four marks read ("A 0", "B 0", ...). Since 3.5.0 the workspace's Public-Cloud-Fit card is
 * gone from real projects (the workspace page is); this mix is the Management reader's reading of the levels.
 */
function managementMix(findings: typeof core.findings): string[] {
  const mix = { A: 0, B: 0, C: 0, D: 0 };
  const seen = new Set<string>();
  for (const row of findingRows(findings)) {
    if (!row.finding.objectName) continue;
    const name = row.finding.objectName.trim().toUpperCase();
    const g = gradeSapObjectUse(name, accessUseOfKind(row.finding.kind), coreKey).grade;
    if (g !== 'A' && g !== 'B' && g !== 'C' && g !== 'D') continue;
    if (seen.has(`${name}|${g}`)) continue;
    seen.add(`${name}|${g}`);
    mix[g] += 1;
  }
  return (['A', 'B', 'C', 'D'] as const).map((g) => `${g} ${mix[g]}`);
}

test.describe('a PCE project shows the core result on Analyze, Transformation and the fit card', () => {
  test.describe.configure({ mode: 'serial' });

  test('the premise: the default list reads this source otherwise, on every display', () => {
    expect(coreKey).toBe('pce-latest');
    expect(core.findings.some((f) => f.objectName === PCE_ONLY), 'released under PCE: no finding').toBe(false);
    expect(browserBuilt.findings.some((f) => f.objectName === PCE_ONLY), 'not listed in Public: a finding').toBe(true);
    expect(levelBlocks(browserBuilt.findings)).not.toEqual(levelBlocks(core.findings));
    expect(transformationFigures(browserBuilt.findings).findings).not.toBe(transformationFigures(core.findings).findings);
    expect(managementMix(browserBuilt.findings)).not.toEqual(managementMix(core.findings));
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
    await page.goto(`/project/${acct.projectId}/analyze?view=it`);

    const findings = page.locator('[data-analysis-findings]');
    await expect(findings).toBeVisible({ timeout: 60000 });
    // One group per kind of finding the core result has, and no other.
    const kinds = [...new Set(core.findings.map((f) => f.kind))].sort();
    await expect
      .poll(async () => (await findings.locator('[data-findings-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-findings-group')))).sort())
      .toEqual(kinds);
    // The object the PCE list releases is no finding here.
    await expect(findings).not.toContainText(PCE_ONLY);
    // The IT answer's level facet (ADR-140; the level bar of the old hero is gone) counts the core findings at
    // the core levels: the worst level's count, then the others and the unknown ones.
    const facet = page.locator('[data-facet="levels"]');
    await expect(facet).toContainText(levelFacetNote(core.findings), { timeout: 60000 });
    await expect(facet).not.toContainText(levelFacetNote(browserBuilt.findings));
  });

  test('Transformation: the facets count the core findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/transformation`);

    const figures = transformationFigures(core.findings);
    const places = page.locator('[data-transformation-places]');
    await expect(places).toHaveAttribute('data-transformation-places', String(figures.places), { timeout: 60000 });
    // The answer card's "Released target" facet counts the same findings (3.5.0, ADR-129 (2)).
    await expect(page.locator('[data-facet="released"]')).toContainText(
      `of ${figures.findings} ${figures.findings === 1 ? 'finding' : 'findings'}`,
    );
    await expect(page.locator('[data-transformation-object-page]')).not.toContainText(PCE_ONLY);
  });

  test('Management: the Level A–D mix counts the objects of the core findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze?view=management`);

    const mix = page.locator('[data-management-levels]');
    await expect(mix).toBeVisible({ timeout: 60000 });
    const shown = await mix.locator('[data-cc-level-trigger]').evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    // The mark reads "C 1"; its accessible text adds what the level means.
    const marks = shown.map((t) => /^[A-D] \d+/.exec(t)?.[0] ?? t);
    expect(marks).toEqual(managementMix(core.findings));
  });
});
