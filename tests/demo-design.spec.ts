import { test, expect, type Page } from '@playwright/test';
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
 *      document, offers no generation, and words the sign-off as what it is in
 *      a demo: a switch in this browser, which the demo's Delivery stage reads;
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

const REAL_OPEN = 'a self-declaration of your account, not an organisational mandate';
const REAL_DIALOG_LEAD = 'A self-declaration by the signed-in account, bound to the run this page shows';
const REAL_CONFIRMED = 'A self-declaration by the signed-in account, not an organisational mandate.';

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
    const route = targetRouteOf(routeExtensibility(evidence, demo.deployment));
    expect(data.contract, 'the demo built no contract').not.toBeNull();
    expect(data.contract!.route.recommended).toBe(route);
    expect(data.contract!.route.chosen).toBe(route);
    // And it agrees with the route the rest of the demo states.
    expect(targetRouteOf({ recommendedRoute: demo.design.recommendedRoute })).toBe(route);

    // The whole contract is `GET /api/projects/{id}/contract`'s answer for a project with no run.
    const built = contractOfProject({ legacyCode: source, s4Deployment: demo.deployment }, null);
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

    await openStage(page, 'design');
    const stage = page.getByTestId('demo-design');
    await expect(stage.locator('[data-design-canvas-stage]')).toBeVisible();

    // One story: the card names the contract's route.
    await expect(page.locator('[data-design-answer]')).toHaveAttribute('data-design-answer', 'recommended');
    await expect(page.locator('#design-answer')).toHaveText(label);
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

    // No generation: the button is there and disabled.
    const generate = page.getByRole('button', { name: /^(Generate|Regenerate) design$/ });
    await expect(generate).toHaveCount(1);
    await expect(generate).toBeDisabled();

    // The sign-off says what it is in the demo, not what it is on a real project.
    const signOff = page.locator('#architect-sign-off');
    await expect(signOff).toContainText('In the demo, confirming is a switch in this browser');
    await expect(signOff).not.toContainText('self-declaration');
  });

  test('confirming is a switch in this browser that the Delivery stage reads, and withdrawing resets it', async ({ page }) => {
    test.setTimeout(240_000);
    const data = buildDemoDesign(buildDemoProject());
    const label = LABEL_OF_ROUTE[data.contract!.route.chosen];

    await openStage(page, 'design');
    await page.getByTestId('demo-reset').click();
    await expect(page.locator('[data-design-confirm]')).toHaveText(/Confirm target/);

    await page.locator('[data-design-confirm]').click();
    const dialog = page.locator('[data-design-signoff-dialog]');
    await expect(dialog).toContainText('bound to the signed run. In the demo it is a switch in this browser.');
    await expect(dialog).not.toContainText('bound to the run this page shows');
    const confirm = dialog.getByTestId('demo-confirm-target');
    await expect(confirm).toHaveAttribute('aria-pressed', 'false');
    await expect(confirm).toHaveText(`Confirm ${label}`);
    await confirm.click();

    // Confirmed: the dialog closes on the lock, the card names the target, attributed to nobody.
    await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible();
    await expect(page.locator('#design-answer')).toHaveText(label);
    await expect(page.locator('[data-design-answer]')).toContainText('In this browser only: attributed to nobody');
    await expect(page.locator('[data-design-answer]')).not.toContainText('self-declaration');
    await page.locator('[data-design-confirm]').click();
    await expect(dialog.getByTestId('demo-confirm-target')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    // The shared state: the demo's Delivery stage reads the target as confirmed.
    await openStage(page, 'delivery');
    const delivery = page.locator('[data-demo-delivery]');
    await expect(delivery).toContainText('Confirmed here');
    await expect(delivery).not.toContainText('Pending sign-off');

    // Withdrawing resets it, there too.
    await openStage(page, 'design');
    await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible();
    await page.locator('[data-design-confirm]').click();
    const withdraw = page.locator('[data-design-signoff-dialog]').getByTestId('demo-confirm-target');
    await expect(withdraw).toHaveText('Withdraw the confirmation');
    await withdraw.click();
    await expect(withdraw).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-design-answer="recommended"]')).toBeVisible();

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
    expect(call).toMatch(/\bview=\{view\}/);
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
    await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });

    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });

    const signOff = page.locator('#architect-sign-off');
    await expect(signOff).toContainText(REAL_OPEN);
    await expect(signOff).not.toContainText('In the demo');

    await page.locator('[data-design-confirm]').click();
    const dialog = page.locator('[data-design-signoff-dialog]');
    await expect(dialog).toContainText(REAL_DIALOG_LEAD);
    await expect(dialog).not.toContainText('In the demo');
    await dialog.locator('button:has-text("Confirm & Lock Architecture")').click();

    await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-design-answer]')).toContainText(REAL_CONFIRMED);
    await expect(signOff).toContainText('Confirmed — a self-declaration of your account, not an organisational mandate.');
  });
});
