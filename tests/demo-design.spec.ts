import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { buildDemoProject } from '../lib/demo-project';
import { buildDemoDesign } from '../lib/demo-design';
import { findTrustChainField, DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { contractOfProject } from '../lib/contract-build';
import { findingsOf } from '../lib/it-findings-build';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { targetRouteOf, type TargetRoute } from '../lib/architecture-contract';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { APP_VERSION } from '../lib/version';

/**
 * The demo's Design stage — the canvas-first tool of a real project, fed from
 * the server (`lib/demo-design.ts`) instead of the two project routes
 * (QA review of e58354167a2d: the rewrite had no coverage).
 *
 * What has to hold, and each check below fails when it stops holding:
 *
 *   1. the contract and the findings are the ones a real project's routes would
 *      answer for this source — the same engine, the same catalog — and carry
 *      no field of the trust chain;
 *   2. the screen tells one story (card = contract), shows no model-written
 *      document, offers no generation, and confirms no target (ADR-145: the
 *      decision, route included, is the Decide page's, which the demo never takes);
 *   3. the demo's wording stays in the demo: a real project's Design page keeps
 *      the self-declaration sentences of the signed-in account.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The card's labels, written out rather than imported from the component that renders them. */
const LABEL_OF_ROUTE: Record<TargetRoute, string> = {
  'in-app-rap': 'Developer Extensibility (RAP / ABAP Cloud)',
  'side-by-side-cap': 'Side-by-Side Extensibility (CAP / Node.js)',
};

const MODEL_SECTIONS = [
  'Architecture overview',
  'Project blueprint',
  'API endpoints',
  'SAP standard API mapping',
  'Cloud services',
  'Data sync pattern',
  'Security hardening',
  'Roadmap',
  'Non-functional requirements',
];

const REAL_DIALOG_LEAD = 'A self-declaration by the signed-in account, bound to the run this page shows';

async function openStage(page: Page, stage: string) {
  await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
}

test.describe('what the demo Design stage is drawn from', () => {
  test('the contract and findings a real project’s routes would answer, for the demo source', () => {
    const demo = buildDemoProject();
    const data = buildDemoDesign(demo);
    const source = read(path.posix.join('public', 'starter-examples', DEMO_SOURCE_FILE)).replace(/\r\n/g, '\n');
    expect(data.source).toBe(source);

    // The catalog the demo grades with is the one its project would be graded with.
    const catalog = catalogSnapshotKeyForProject({ s4Deployment: demo.deployment });
    expect(demo.catalogSnapshot).toBe(catalog);

    // The route: the engine's, recomputed here independently.
    const evidence = buildAbapEvidence(source, DEMO_SOURCE_FILE, demo.deployment, catalog);
    expect(evidence.findings.length, 'the engine found almost nothing — the comparisons below would be vacuous').toBeGreaterThan(10);
    const route = targetRouteOf(routeExtensibility(evidence, demo.deployment, APP_VERSION));
    expect(data.contract, 'the demo built no contract').not.toBeNull();
    expect(data.contract!.route.recommended).toBe(route);
    expect(data.contract!.route.chosen).toBe(route);
    // And it agrees with the route the rest of the demo states.
    expect(targetRouteOf({ recommendedRoute: demo.design.recommendedRoute })).toBe(route);

    // The whole contract is `GET /api/projects/{id}/contract`'s answer for a project with no run.
    const built = contractOfProject({ legacyCode: source, s4Deployment: demo.deployment, analyzerVersion: APP_VERSION }, null);
    expect(built.ok).toBe(true);
    if (built.ok) expect(data.contract).toEqual(built.contract);

    // The findings are `GET /api/projects/{id}/findings`'s answer, on the demo's catalog.
    expect(data.findings.length).toBeGreaterThan(10);
    expect(data.findings).toEqual(findingsOf(source, DEMO_SOURCE_FILE, demo.deployment, catalog).rows);
    // The catalog key is actually forwarded, not dropped: a snapshot that is not
    // shipped is refused rather than silently graded from the default file.
    expect(() => buildDemoDesign({ deployment: demo.deployment, catalogSnapshot: 'no-such-snapshot' })).toThrow(
      /no-such-snapshot/,
    );
  });

  test('it carries no trust-chain field', () => {
    const data = buildDemoDesign(buildDemoProject());
    expect(findTrustChainField(data)).toBeNull();
    expect(data.contract!.boundRunId).toBe('');
  });
});

test.describe('the demo Design stage on screen', () => {
  test('one story, no model document, no generation, and the demo’s own sign-off wording', async ({ page }) => {
    test.setTimeout(180_000);
    const data = buildDemoDesign(buildDemoProject());
    const label = LABEL_OF_ROUTE[data.contract!.route.chosen];

    // ADR-130: the canvas, the contract and the document are the IT view's.
    await openStage(page, 'design?view=it');
    const stage = page.getByTestId('demo-design');
    await expect(stage).toHaveAttribute('data-design-view', 'it');
    await expect(stage.locator('[data-design-canvas-stage]')).toBeVisible();

    // One story: the answer card names the contract's route, and the alternatives at a glance stand beside the canvas.
    await expect(page.locator('#design-answer [data-answer]')).toHaveText(`${label}.`);
    await expect(page.locator(`[data-design-alternative="${data.contract!.route.chosen}"]`)).toHaveAttribute(
      'data-verdict',
      'chosen',
    );

    // The drawer says where the demo stops, names what a model would write, and shows none of it.
    const drawer = page.locator('[data-design-drawer]');
    await drawer.getByRole('tab', { name: /Design document/ }).click();
    const doc = drawer.getByTestId('demo-design-document');
    await expect(doc).toBeVisible();
    await expect(doc).toContainText('The demo stops where the model begins.');
    for (const s of MODEL_SECTIONS) await expect(doc).toContainText(s);
    await expect(page.locator('[data-stage-output="solutionDesign"]')).toHaveCount(0);
    await expect(page.locator('[data-design-section]')).toHaveCount(0);
    await expect(page.locator('[data-design-section-body]')).toHaveCount(0);

    // No generation in the demo, and none offered beside the canvas.
    await expect(page.getByRole('button', { name: /^(Generate|Regenerate) design$/ })).toHaveCount(0);

    // ADR-145: Management shows the decision it works from, which the demo never takes, and leads to the demo's Decide
    // page; nothing in the demo's Design confirms a target.
    await openStage(page, 'design?view=management');
    await expect(page.locator('#design-answer [data-answer-next]')).toContainText('The demo records none.');
    await expect(page.locator('[data-design-decide]')).toHaveAttribute('href', '/demo/redesign');
    await expect(page.locator('[data-design-confirm]')).toHaveCount(0);
  });

  test('nothing in the demo confirms a target: Delivery keeps it pending', async ({ page }) => {
    test.setTimeout(240_000);
    await openStage(page, 'design?view=management');
    await page.getByTestId('demo-reset').click();
    await expect(page.locator('[data-design-confirm], [data-testid="demo-confirm-target"]')).toHaveCount(0);
    await openStage(page, 'delivery');
    await expect(page.locator('[data-demo-delivery]')).toContainText('Pending sign-off');
    await expect(page.locator('[data-demo-delivery]')).not.toContainText('Confirmed here');
  });
});

test.describe('the demo wording stays in the demo', () => {
  test('a real project’s Design page passes no sign-off wording of its own', () => {
    const page = read('app/(app)/project/[projectId]/design/page.tsx');
    // The whole element, nested props included: it ends at the first `/>` on a
    // line of its own at the element's own indentation.
    const start = page.indexOf('<DesignCanvasStage');
    expect(start, 'the real page no longer renders DesignCanvasStage').toBeGreaterThan(0);
    const indent = page.slice(page.lastIndexOf('\n', start) + 1, start);
    const end = page.indexOf(`\n${indent}/>`, start);
    expect(end, 'the end of the DesignCanvasStage element was not found').toBeGreaterThan(start);
    const call = page.slice(start, end);
    // ADR-130: the IT view's canvas; the Canvas | List switch is gone.
    expect(call).toMatch(/\blayout="it"/);
    expect(call).not.toMatch(/\bview=\{/);
    expect(call).not.toMatch(/signOffWording/);
  });

  test('without signOffWording the stage keeps the real self-declaration sentences', async ({ page }) => {
    test.setTimeout(300_000);
    // A structured design, so the sign-off can be opened (`designIsStructured`).
    const DESIGN_JSON = JSON.stringify({
      projectName: 'Demo wording fixture',
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
    const seeded = await seedStageProject({ prefix: 'ddwording', acceptTerms: true, rich: true });
    await adminMergeDoc('projects', seeded.projectId, {
      solutionDesign: DESIGN_JSON,
      targetArchitecture: 'rap',
      approvedByArchitect: true,
      architectJustifiedOverride: '',
      architectSignOffAt: new Date().toISOString(),
      approvedBy: seeded.email,
    });

    await signInThroughForm(page, seeded);
    // Since ADR-145 the route is recorded on the Decide page; "Change target" stays in Design for a route on record,
    // and its sign-off speaks in the real words.
    await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
    const change = page.locator('[data-design-confirm]');
    await expect(change).toHaveText(/Change target/, { timeout: 120_000 });
    await change.click();
    const dialog = page.locator('[data-design-signoff-dialog]');
    await expect(dialog).toContainText(REAL_DIALOG_LEAD);
    await expect(dialog).not.toContainText('In the demo');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-design-view]')).not.toContainText('In the demo');
  });
});
