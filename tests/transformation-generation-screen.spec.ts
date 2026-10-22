import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { sha256Hex } from '../lib/artefact-digest';
import { APP_VERSION } from '../lib/version';

/**
 * Roadmap 3.0.12 (owner 12.10.2026; design §14–§15, mockup
 * `docs/roadmap/transformation-generation-mockup.html`) — rendered:
 *
 *   - before the run, the tips stand with real counts and the chain of what
 *     the generation will use; a tip leads to its place, that place offers
 *     "Back to Transformation, Before the run", and back here the counts are
 *     read again;
 *   - while a generation runs, the screen is the chain lit from the PLATFORM
 *     KNOWLEDGE block the contract answered with, then the stages that run —
 *     no progress bar, no log;
 *   - at 390 px nothing scrolls sideways; under reduced motion nothing moves.
 *
 * No model is called: the contract read, the model proxy and the store are
 * stubbed, as `tests/transformation-prerequisites.spec.ts` stubs them.
 */

test.use({ baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const SHOT_DIR = process.env.SHOT_DIR || '';
const shot = async (page: Page, name: string, fullPage = false) => {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage });
};

const SOURCE = `REPORT z_po_limit.
PARAMETERS p_ebeln TYPE ebeln OBLIGATORY.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
SELECT SINGLE netwr FROM ekko INTO lv_amount WHERE ebeln = p_ebeln.
IF sy-subrc <> 0.
  MESSAGE 'Purchase order not found' TYPE 'E'.
ENDIF.
IF lv_amount > 10000.
  MESSAGE 'Approval required above 10,000' TYPE 'W'.
ENDIF.
WRITE: / 'Checked', p_ebeln, lv_amount.
`;
const DESIGN = '# Target architecture\n\nSide-by-side on SAP BTP.\n';
const CONTEXT = `
        PLATFORM KNOWLEDGE (Clean-Core.io's records and engine readings, no model):
        A. BUSINESS RULE DECISIONS (no rule has been answered yet — the process has no stored revision, so every rule is OPEN):
        B. DECISION AND ROUTE:
           Route: side-by-side on SAP BTP (Node.js / CAP) — the engine's recommendation.
        C. WHAT THE PROGRAM DOES (the engine's reading of the source):
           Purpose: Checks a purchase order's value against the approval limit.
`;

async function seed(prefix: string): Promise<SeededProject> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  await adminSetDoc('projects', account.projectId, {
    name: 'Z_PO_LIMIT',
    userId: account.uid,
    createdAt: new Date(),
    status: 'designed',
    legacyCode: SOURCE,
    // The deployment target the run's manifest records: without it on the project the browser cannot show the
    // input still matches, the stage says "The signed run's inputs cannot all be shown to still match" as a
    // blocker and the tips never appear (CI run 39203588718).
    s4Deployment: 'private',
    cleanCoreScore: 58,
    activeRunId: account.runId,
    solutionDesign: DESIGN,
    originalRecommendation: 'cap',
    recommendationJustification: 'It reads purchase orders and writes nothing; it can run beside the core.',
  });
  await adminSetDoc(`projects/${account.projectId}/runs`, account.runId, {
    runId: account.runId,
    projectId: account.projectId,
    userId: account.uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 58,
    analysis: '',
    // A run as the product signs it: with its input manifest. Without one the
    // contract read refuses ("The run recorded no input manifest …"), and since
    // 5487c408 that refusal is said before the click and keeps Generate off —
    // the cause of the disabled button in the CI of d9a07f20.
    inputManifest: buildInputManifest(
      analysisRunInputs({
        sourceSha256: sha256Hex(SOURCE),
        deploymentTarget: 'private',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: APP_VERSION,
        model: null,
      }),
      null,
    ),
  });
  return account;
}

async function keyAvailable(page: Page) {
  await page.route('**/api/model-stages', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keyAvailable: true, keySource: 'community' }) }),
  );
}

const PACKAGE = {
  files: [
    { path: 'srv/service.ts', content: 'export const check = (amount: string) => amount;\n' },
    { path: 'db/schema.cds', content: 'entity PurchaseOrder { key id : String; }' },
    { path: 'package.json', content: '{"name":"po-limit"}' },
    { path: 'Dockerfile', content: 'FROM node:22' },
    { path: 'erp-triggers/zcl_core_event_publisher.clas.abap', content: 'CLASS zcl_core_event_publisher DEFINITION. ENDCLASS.' },
  ],
  tests: { config: 'export default {};', spec: 'test("a", () => {});' },
};

/** The contract allows the generation and answers with the block; the model is held until released; the store answers as the server would. */
async function stubGeneration(page: Page): Promise<{ release: () => void; modelCalls: { n: number } }> {
  await page.route(/\/api\/projects\/[^/]+\/contract(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      // The server builds the block on a real read; the stub waits a moment so the "Loading…" state exists.
      await new Promise((r) => setTimeout(r, 1200));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contract: { fingerprint: 'f'.repeat(64), contractId: 'AC-1', summary: 'Build a CAP service.' },
          decision: { ok: true, track: 'side-by-side-btp', isAbapCloud: false, label: 'Side-by-side on SAP BTP', followsRecommendation: true, deviation: null, state: 'clear', sentence: 'Side-by-side, as the contract says.' },
          generation: {
            token: 't',
            inputs: { legacyCode: SOURCE, solutionDesign: DESIGN, analysis: '', context: { text: CONTEXT, rules: 'none', decision: 'none', requirements: 'none' } },
          },
        }),
      });
    }
    const body = route.request().postDataJSON() as { generatedCode: string; testSuite: unknown };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ fields: { generatedCode: body.generatedCode, testSuite: body.testSuite, status: 'transformed' } }),
    });
  });
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const modelCalls = { n: 0 };
  await page.route('**/api/gemini**', async (route) => {
    modelCalls.n += 1;
    await hold;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify(PACKAGE) }) });
  });
  return { release, modelCalls };
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

for (const width of [1280, 390] as const) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('before the run: the tips with real counts, and the chain of what the generation will use', async ({ page }) => {
      const account = await seed(`tf-tips-${width}`);
      await keyAvailable(page);
      await signInThroughForm(page, account);
      await page.goto(`/project/${account.projectId}/transformation`);
      const tips = page.locator('[data-quality-tips]');
      await expect(tips).toBeVisible({ timeout: 90_000 });
      // Every count read: the card says how many things are open.
      await expect(tips).not.toHaveAttribute('data-quality-tips', 'reading', { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Before the run: raise the quality' })).toBeVisible();
      // No requirements specification, no sign-off, no decision on record: each is a tip.
      await expect(page.locator('[data-quality-tip="requirements"]')).toContainText('Write the requirements specification');
      await expect(page.locator('[data-quality-tip="target"]')).toContainText('Confirm the target in Design');
      await expect(page.locator('[data-quality-tip="decision"]')).toContainText('Record the decision');
      // Enabled once the plan before the click is read (3.0.18 (2): Generate waits for it).
      await expect(page.locator('[data-generate-now]')).toBeEnabled({ timeout: 60_000 });
      // Nothing on record weighs SAP standard: a warning above the tips, never a gate (owner, 12.10.2026).
      const warning = page.locator('[data-decision-warning="standard-fit-open"]');
      // Since 22.10.2026 it leads to the decision in Management (owner decision).
      await expect(warning).toContainText('SAP standard has not been weighed against a rebuild yet');
      await expect(warning.locator('[data-cc-message-strip="warning"]')).toBeVisible();
      await expect(warning.locator('[data-decision-warning-link]')).toHaveAttribute(
        'href',
        new RegExp(`/project/${account.projectId}\\?view=management&origin=transformation\\.tips#decision-card$`),
      );
      await expect(page.locator('[data-generate-cost]')).toHaveText('No analysis run used · up to 48 model calls on the community key for this generation');
      // The chain: the phases before Transformation, never Economics.
      const chain = page.locator('[data-generation-chain="before"]');
      await expect(chain.locator('[data-chain-phase]')).toHaveText(['Analyze phase', 'Design phase']);
      await expect(chain.locator('[data-chain-slot]')).toHaveCount(6);
      await expect(chain).not.toContainText('Economics');
      await expect(chain.locator('[data-chain-slot="analyze"]')).toContainText('Clean Core Score 58');
      await expect(chain.locator('[data-chain-slot="first-insights"] [data-chain-fact="purpose"]')).toBeVisible({ timeout: 60_000 });
      // Nothing started on its own: tips are open.
      await expect(page.locator('[data-generation-screen]')).toHaveCount(0);
      await noSideScroll(page);
      await shot(page, `before-run-${width}`);
      await shot(page, `before-run-${width}-full`, true);
    });
  });
}

test('a decision on record against a rebuild is said above the tips; Generate now stays, nothing starts by itself', async ({ page }) => {
  const account = await seed('tf-against-decision');
  // A confirmed record whose option is retire, read as the PLATFORM KNOWLEDGE block reads it.
  // (That no warning ever auto-starts is held server-free in tests/transformation-chain.spec.ts.)
  await adminMergeDoc('projects', account.projectId, {
    decision: {
      decisionId: 'DEC-1',
      revision: 1,
      status: 'confirmed',
      summary: 'Retire the program.',
      bindings: [{ key: 'option', revision: 'retire · Retire' }],
      confirmation: { account: 'a', at: new Date().toISOString() },
    },
  });
  await keyAvailable(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  const tips = page.locator('[data-quality-tips]');
  await expect(tips).not.toHaveAttribute('data-quality-tips', 'reading', { timeout: 90_000 });
  const warning = page.locator('[data-decision-warning="against-decision"]');
  await expect(warning).toContainText('The decision on record is to retire this program — generating a rebuild goes against it.');
  await expect(warning.locator('[data-decision-warning-link]')).toHaveAttribute(
    'href',
    new RegExp(`/project/${account.projectId}\\?view=management&origin=transformation\\.tips#decision-card$`),
  );
  await expect(page.locator('[data-generate-now]')).toBeEnabled();
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-generation-screen]')).toHaveCount(0);
});

test('a tip leads to its place, the place leads back, and the counts are read again', async ({ page }) => {
  const account = await seed('tf-tips-roundtrip');
  await keyAvailable(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  const tips = page.locator('[data-quality-tips]');
  await expect(tips).not.toHaveAttribute('data-quality-tips', 'reading', { timeout: 90_000 });
  const before = Number(await tips.getAttribute('data-quality-tips'));
  expect(before).toBeGreaterThanOrEqual(3);

  // The target tip opens Design at the sign-off, with the way back.
  const link = page.locator('[data-quality-link="target"]');
  await expect(link).toHaveAttribute('href', new RegExp(`/project/${account.projectId}/design\\?.*origin=transformation\\.tips.*#architect-sign-off`));
  await link.click();
  await page.waitForURL(/\/design\?/, { timeout: 60_000 });
  const back = page.locator('[data-choice-back="header"]');
  await expect(back).toBeVisible({ timeout: 60_000 });
  await expect(back).toContainText('Back to');
  await expect(back).toContainText('Transformation, Before the run');
  await shot(page, 'roundtrip-design-back-1280');

  // The target is confirmed meanwhile (as the sign-off would write it), and the way back is taken.
  await adminMergeDoc('projects', account.projectId, { approvedByArchitect: true, targetArchitecture: 'cap', architectSignOffAt: new Date().toISOString() });
  await back.click();
  await page.waitForURL(/\/transformation/, { timeout: 60_000 });
  await expect(page).toHaveURL(/#transformation-tips$/);
  await expect(tips).not.toHaveAttribute('data-quality-tips', 'reading', { timeout: 60_000 });
  await expect(page.locator('[data-quality-tip="target"]')).toHaveCount(0, { timeout: 60_000 });
  expect(Number(await tips.getAttribute('data-quality-tips'))).toBe(before - 1);

  // The decision tip opens the Management view with the same way back.
  await page.locator('[data-quality-link="decision"]').click();
  await page.waitForURL(/view=management/, { timeout: 60_000 });
  await expect(page.locator('[data-choice-back="header"]')).toContainText('Transformation, Before the run', { timeout: 60_000 });
});

for (const width of [1280, 390] as const) {
  test(`while it runs, at ${width} px: the chain lit from the block, then the stages — no bar, no log`, async ({ page }) => {
    const account = await seed(`tf-screen-${width}`);
    await keyAvailable(page);
    const { release, modelCalls } = await stubGeneration(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/transformation`);
    await expect(page.locator('[data-generate-now]')).toBeEnabled({ timeout: 90_000 });
    await page.locator('[data-generate-now]').click();

    const screen = page.locator('[data-generation-screen]');
    await expect(screen).toBeVisible({ timeout: 30_000 });
    // Before the contract answers, the slots are "Loading…".
    await expect(screen.locator('[data-chain-slot="first-insights"]')).toHaveAttribute('data-chain-state', 'loading');
    await expect(screen.getByRole('heading', { name: 'Writing the code for Z_PO_LIMIT' })).toBeVisible();
    await expect(screen.locator('[data-generation-caption]')).toHaveText('Written from what the platform already knows about this program — not from the code alone.');
    // The contract answered with the block: the slots light, the purpose is the block's sentence.
    await expect(screen.locator('[data-chain-slot="first-insights"]')).not.toHaveAttribute('data-chain-state', 'loading', { timeout: 30_000 });
    await expect(screen.locator('[data-chain-slot="first-insights"]')).toContainText("Checks a purchase order's value against the approval limit.");
    // The facts of the original are read, the model stage runs with an honest clock.
    await expect(screen.locator('[data-generation-stage="facts"]')).toHaveAttribute('data-stage-state', 'done', { timeout: 30_000 });
    await expect(screen.locator('[data-generation-stage="facts"]')).toContainText('packed decimal field');
    await expect(screen.locator('[data-generation-stage="model"]')).toHaveAttribute('data-stage-state', 'active');
    await expect.poll(() => modelCalls.n, { timeout: 30_000 }).toBe(1);
    await expect(screen.locator('[data-generation-stage="model"] [data-generation-elapsed]')).toContainText('so far');
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(page.getByLabel('Generation log')).toHaveCount(0);
    await expect(screen).not.toContainText('Economics');
    await expect(screen).not.toContainText('%');
    // A program with no routine and no event block has nothing to anchor a
    // function to: the single call runs, and the screen says why (3.0.12, step E, §16.2).
    await expect(screen).toHaveAttribute('data-generation-path', 'single-call');
    await expect(screen.locator('[data-generation-stage="facts"] [data-generation-stage-detail]')).toContainText(
      'Generated in one model call — the engine could not build a scaffold for this program',
    );
    await expect(screen).not.toContainText(/Model fills|Repairs/);
    await noSideScroll(page);
    await page.waitForTimeout(600);
    await shot(page, `running-${width}`);
    await shot(page, `running-${width}-full`, true);

    release();
    await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 60_000 });
    await expect(page.locator('[data-generation-screen]')).toHaveCount(0);
  });
}

test('under reduced motion the slots do not move', async ({ page }) => {
  const account = await seed('tf-screen-reduced');
  await keyAvailable(page);
  const { release } = await stubGeneration(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  await expect(page.locator('[data-generate-now]')).toBeEnabled({ timeout: 90_000 });
  await page.locator('[data-generate-now]').click();
  const slot = page.locator('[data-generation-screen] [data-chain-slot="analyze"]');
  await expect(slot).toBeVisible({ timeout: 30_000 });
  const durations = await slot.evaluate((li) =>
    Array.from(li.querySelectorAll<HTMLElement>('span, div')).map((el) => getComputedStyle(el).transitionDuration),
  );
  expect(durations.every((d) => d.split(',').every((x) => parseFloat(x) < 0.001)), `transitions under reduced motion: ${durations.join(' | ')}`).toBe(true);
  release();
});
