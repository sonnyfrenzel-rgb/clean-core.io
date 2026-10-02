import { test, expect } from '@playwright/test';
import { buildDemoProject } from '../lib/demo-project';
import type { EvidenceFinding } from '../lib/abap/evidence-model';
import { findingRows } from '../lib/findings-view';
import DEMO_RELEASE from '../lib/demo-release.json';
import {
  changeExcerpt,
  changeOrder,
  fileCard,
  findingTarget,
  planByKind,
  trackOfRoute,
  transformationFigures,
  transformationFlow,
} from '../lib/transformation-view';

/**
 * The Transformation tool as an Object Page (proposal A + B's flow, owner
 * decision 01.10.2026) and the route confusion the proposal agent found:
 * every row of the demo's plan said "Developer Extensibility / RAP" — the first
 * of each finding's target options — while the demo's route is side-by-side.
 */

const finding = (over: Partial<EvidenceFinding>): EvidenceFinding => ({
  id: 'CC-T',
  kind: 'commit-work',
  title: 'Explicit COMMIT WORK',
  severity: 'Medium',
  confidence: 'High',
  source: 'static-parser',
  lineStart: 10,
  snippet: 'COMMIT WORK.',
  technicalDetail: '',
  cleanCoreImpact: '',
  recommendation: '',
  targetOptions: ['Developer Extensibility / RAP'],
  ...over,
});

test.describe('the per-finding target is honest about the project route', () => {
  test('the demo plan no longer prints the first option as the route of every row', () => {
    const demo = buildDemoProject();
    const track = trackOfRoute(demo.design.recommendedRoute);
    expect(track).toBe('side-by-side');
    const plan = demo.transformation.plan;
    expect(plan.length).toBeGreaterThan(0);
    // The bug: one value on every row, the in-app option, under a side-by-side route.
    expect(new Set(plan.map((p) => p.target)).size).toBeGreaterThan(1);
    for (const row of plan) {
      const f = demo.analyze.findings.find((x) => x.id === row.findingId)!;
      if (f.sapReplacement?.objectName) {
        expect(row.targetKind).toBe('successor');
        expect(row.target).toBe(f.sapReplacement.objectName);
      }
      // An in-app option may only stand as the target when it is said to be off the route.
      if (row.target === 'Developer Extensibility / RAP' || row.target === 'Key User Extensibility') {
        expect(row.routeFit, `${row.findingId} shows an in-app target as if it were the route`).toBe('differs');
      }
      if (row.targetKind === 'route') expect(['Side-by-Side CAP', 'Integration Suite', 'Event Mesh']).toContain(row.target);
      // All of the engine's options stay available, in its order.
      expect(row.targetOptions).toEqual(f.targetOptions);
    }
  });

  test('findingTarget answers per kind of finding', () => {
    const successor = findingTarget(
      finding({ objectName: 'EBAN', sapReplacement: { objectName: 'API_PURCHASEREQUISITION_SRV', objectType: 'OData API', confidence: 'Verified' } }),
      'side-by-side',
    );
    expect(successor).toMatchObject({ kind: 'successor', label: 'API_PURCHASEREQUISITION_SRV', routeFit: null });
    expect(findingTarget(finding({ objectName: 'ZMM_PO_APPR' }), 'side-by-side').kind).toBe('custom');
    expect(findingTarget(finding({ objectName: 'ME21N', targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP'] }), 'side-by-side').kind).toBe('no-successor');
    const onRoute = findingTarget(finding({ targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP'] }), 'side-by-side');
    expect(onRoute).toMatchObject({ kind: 'route', label: 'Side-by-Side CAP', routeFit: 'matches' });
    const offRoute = findingTarget(finding({ targetOptions: ['Developer Extensibility / RAP'] }), 'side-by-side');
    expect(offRoute).toMatchObject({ kind: 'route-other', routeFit: 'differs' });
    expect(offRoute.sub).toContain('not among');
    expect(findingTarget(finding({ targetOptions: ['Developer Extensibility / RAP'] }), 'in-app')).toMatchObject({
      kind: 'route',
      label: 'Developer Extensibility / RAP',
    });
  });
});

test.describe('the figures are counts of what the engine and the package hold', () => {
  test('the flow, the plan and the facets add up to the findings — one per pattern and object', () => {
    const demo = buildDemoProject();
    const f = demo.analyze.findings;
    // Owner decision 02.10.2026: "findings" is the unit Analyze counts; the
    // engine's list is one entry per place in the code.
    const units = findingRows(f).map((r) => r.finding);
    expect(units.length).toBe(demo.analyze.distinctFindings);
    expect(units.length).toBeLessThan(f.length);
    const track = trackOfRoute(demo.design.recommendedRoute);
    const fig = transformationFigures(f);
    expect(fig.findings).toBe(units.length);
    expect(fig.places).toBe(f.length);
    expect(fig.planned + fig.unplanned).toBe(units.length);
    expect(fig.successorNamed).toBe(units.filter((x) => x.sapReplacement?.objectName).length);
    const flow = transformationFlow(f, track);
    expect(flow.links.reduce((n, l) => n + l.count, 0)).toBe(units.length);
    expect(flow.targets.reduce((n, t) => n + t.count, 0)).toBe(units.length);
    expect(planByKind(f).reduce((n, k) => n + k.total, 0)).toBe(units.length);
    expect(changeOrder(f, track)).toHaveLength(units.length);
  });

  test('the demo figures are the release file’s: 25 findings at 31 places in the code', () => {
    const fig = transformationFigures(buildDemoProject().analyze.findings);
    expect(fig.findings).toBe(DEMO_RELEASE.figures.distinctFindings);
    expect(fig.places).toBe(DEMO_RELEASE.figures.findings);
  });

  test('a change excerpt is a real line of a stored file, or nothing', () => {
    const files = [
      { path: 'package.json', content: '{\n  "name": "x"\n}' },
      { path: 'srv/service.ts', content: 'import x from "y";\n\nconst api = "API_PURCHASEREQUISITION_SRV";\nexport default api;' },
    ];
    const f = finding({ objectName: 'EBAN', sapReplacement: { objectName: 'API_PURCHASEREQUISITION_SRV', objectType: 'OData API', confidence: 'Verified' } });
    const hit = changeExcerpt(f, files)!;
    expect(hit).toMatchObject({ path: 'srv/service.ts', line: 3, term: 'API_PURCHASEREQUISITION_SRV' });
    expect(hit.lines.find((l) => l.highlighted)!.text).toContain('API_PURCHASEREQUISITION_SRV');
    // A substring of a longer name is not a mention.
    expect(changeExcerpt(finding({ objectName: 'EBA' }), files)).toBeNull();
    expect(changeExcerpt(finding({ objectName: 'LFA1' }), files)).toBeNull();
  });

  test('a file card reads its role off the path and its size off the content', () => {
    expect(fileCard({ path: 'srv/service.ts', content: 'a\nb\nc' })).toMatchObject({ role: 'Service handlers', type: 'code', lines: 3, bytes: 5 });
    expect(fileCard({ path: 'Dockerfile', content: 'FROM x' }).role).toBe('Container build');
    expect(fileCard({ path: 'src/z_a.bdef.asbdef', content: 'x' }).role).toBe('Behavior definition');
  });
});

test.describe('the demo Transformation renders the Object Page', () => {
  test('route per finding, the flow, and where the demo stops', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.goto('/demo/transformation', { waitUntil: 'domcontentloaded' });
    const tool = page.getByTestId('demo-stage-transformation');
    await expect(tool.locator('[data-transformation-object-page]')).toBeVisible({ timeout: 90000 });
    await expect(tool.locator('[data-transformation-flow]')).toBeVisible();
    // One count under one word: findings are the 25 Analyze lists; the 31 are places in the code.
    const { distinctFindings, findings: places } = DEMO_RELEASE.figures;
    const plan = tool.locator('[data-transformation-facet="Plan from the engine"]');
    await expect(plan).toContainText(`of ${distinctFindings} findings with a target option`);
    await expect(plan).toContainText(`${places} places in the code`);
    await expect(tool.locator('[data-transformation-facet="Released successors"]')).toContainText(`of ${distinctFindings} named`);
    await expect(tool.locator('[data-transformation-flow] svg')).toContainText(`YOUR CODE · ${distinctFindings} FINDINGS`);
    await expect(tool.locator('[data-code-status]')).toContainText(`${distinctFindings} findings at ${places} places in the code`);
    await expect(tool.locator('a[href="#tf-changes"]')).toContainText(`(${distinctFindings})`);
    await expect(tool).not.toContainText(`${places} findings`);
    await expect(tool.locator('[data-demo-package]')).toContainText('The demo stops where the model begins');
    // No generated file is shown in a demo.
    await expect(tool.locator('[data-package-file]')).toHaveCount(0);
    // The first changes show different targets, among them a released successor.
    await expect(tool.locator('[data-finding-target="successor"]').first()).toBeVisible();
    await tool.getByRole('button', { name: /Show all \d+ changes/ }).click();
    const kinds = await tool.locator('[data-finding-target]').evaluateAll((els) => els.map((e) => e.getAttribute('data-finding-target')));
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });
});
