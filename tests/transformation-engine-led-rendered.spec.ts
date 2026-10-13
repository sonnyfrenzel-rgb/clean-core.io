import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { GEMINI_TEST_STUB_DECLINE } from '../lib/gemini-test-stub';

/**
 * Roadmap 3.0.12, step E — the engine-led generation, rendered, end to end on
 * the emulators and the production build: the real contract route, the real
 * lease, `/api/gemini` with the provider stub answering every fill prompt per
 * unit (`lib/gemini-test-stub.ts`), the checks on the local runner, the real
 * store. Nothing about the generation is stubbed in the page.
 *
 *   - a full generation of the PO demo ends with the package, traceability.json,
 *     TRACE.md and the binding's record — and the Built-on card above the result;
 *   - Cancel in the middle of the fills aborts, and nothing is stored;
 *   - a function the model declines stays a stub: the generation is partial,
 *     with the finding, on the screen and on record;
 *   - a program the engine cannot scaffold runs today's single call, with the note.
 *
 * Screenshots of the running screen (desktop and phone) go to SHOT_DIR when set.
 */

test.use({ baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

const SHOT_DIR = process.env.SHOT_DIR || '';
const shot = async (page: Page, name: string, fullPage = false) => {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage });
};

const PO_DEMO = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');
const DESIGN = '# Target architecture\n\nSide-by-side on SAP BTP (Node.js).\n';

async function seed(prefix: string, source: string, name: string): Promise<SeededProject> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  const sha = sha256Hex(source);
  await adminSetDoc('projects', account.projectId, {
    name,
    userId: account.uid,
    createdAt: new Date(),
    status: 'designed',
    legacyCode: source,
    s4Deployment: 'public',
    cleanCoreScore: 41,
    activeRunId: account.runId,
    solutionDesign: DESIGN,
    originalRecommendation: 'cap',
    recommendationJustification: 'It reads requisitions and posts through released APIs; it can run beside the core.',
    inputFingerprint: { sha256: sha, fileName: `${name}.abap`, lineCount: source.split('\n').length },
  });
  const inputManifest = buildInputManifest(
    analysisRunInputs({ sourceSha256: sha, deploymentTarget: 'public', catalogVersion: '2026.FPS01', rulesetVersion: 'rules-v1.0', engineVersion: '2.15.0', model: null }),
    null,
  );
  await adminSetDoc(`projects/${account.projectId}/runs`, account.runId, {
    runId: account.runId,
    projectId: account.projectId,
    userId: account.uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 41,
    analysis: '',
    inputManifest,
  });
  return account;
}

async function keyAvailable(page: Page) {
  await page.route('**/api/model-stages', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keyAvailable: true, keySource: 'community' }) }),
  );
}

async function openAndGenerate(page: Page, account: SeededProject) {
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  await expect(page.locator('[data-generate-now]')).toBeEnabled({ timeout: 120_000 });
  await page.locator('[data-generate-now]').click();
  const screen = page.locator('[data-generation-screen]');
  await expect(screen).toBeVisible({ timeout: 30_000 });
  return screen;
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

type Stored = {
  generatedCode?: string;
  status?: string;
  generationBinding?: { path?: string; contextDigest?: string; elapsedMs?: number; engine?: { status: string; units: number; written: number; notWritten: Array<{ unitId: string; reason: string }>; checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number; scope?: string; notRunReason?: string | null }>; notRun: unknown[]; callsUsed: number }; basis?: unknown[]; fallbackReason?: string | null };
};

for (const width of [1280, 390] as const) {
  test(`a full generation of the PO demo at ${width} px: scaffold, fills, checks, saved — with its trace and the Built-on card`, async ({ page }) => {
    const account = await seed(`tf-engine-${width}`, PO_DEMO, 'Z_MM_PO_APPROVAL');
    await keyAvailable(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    // Hold the first fills a moment, so the running screen can be looked at.
    let held = 0;
    await page.route('**/api/gemini', async (route) => {
      if (held++ < 4) await new Promise((r) => setTimeout(r, 2_500));
      await route.continue();
    });
    const t0 = Date.now();
    const screen = await openAndGenerate(page, account);
    await expect(screen).toHaveAttribute('data-generation-path', 'engine-led');
    await expect(screen.locator('[data-generation-stage="scaffold"]')).toHaveAttribute('data-stage-state', 'done', { timeout: 60_000 });
    await expect(screen.locator('[data-generation-stage="scaffold"]')).toContainText('functions, each anchored to its ABAP lines');
    await expect(screen.locator('[data-generation-stage="fills"]')).toHaveAttribute('data-stage-state', 'active');
    await expect(screen.locator('[data-generation-stage="fills"]')).toContainText('model calls under this generation’s lease');
    const units = screen.locator('[data-generation-units]');
    await expect(units.locator('[data-generation-units-counter]')).toContainText(/of \d+ functions written/);
    await expect(units.locator('[data-unit-state="writing"]').first()).toBeAttached({ timeout: 30_000 });
    await expect(screen.locator('[data-generation-cancel]')).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(screen).not.toContainText('%');
    await noSideScroll(page);
    await shot(page, `running-${width}`);
    await shot(page, `running-${width}-full`, true);

    await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 360_000 });
    const elapsed = Date.now() - t0;
    console.log(`[step E] PO demo engine-led generation at ${width}px with the stub: ${(elapsed / 1000).toFixed(1)} s (click to stored)`);

    const built = page.locator('[data-built-on="engine-led"]');
    await expect(built).toBeVisible({ timeout: 30_000 });
    await expect(built.locator('[data-engine-checks]')).toContainText('functions written');
    await expect(page.locator('[data-file-tree="trace"] [data-file-group="steps"]')).toBeVisible();
    await expect(page.locator('[data-unit-anchor]').first()).toContainText(/L\d+/);
    await noSideScroll(page);
    await shot(page, `done-${width}`);

    const stored = (await adminGetDoc('projects', account.projectId)) as Stored;
    expect(stored.status).toBe('transformed');
    const files = JSON.parse(stored.generatedCode ?? '[]') as Array<{ path: string; content: string }>;
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['traceability.json', 'TRACE.md', 'srv/engine-contract.ts', 'package.json', 'Dockerfile']));
    const trace = JSON.parse(files.find((f) => f.path === 'traceability.json')!.content);
    expect(trace.generation.units).toBeGreaterThan(5);
    const b = stored.generationBinding!;
    expect(b.path).toBe('engine-led');
    expect(b.contextDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(b.engine!.units).toBe(trace.generation.units);
    expect(b.engine!.checks.map((c) => c.kind)).toEqual(expect.arrayContaining(['guards', 'lint', 'cases', 'probes']));
    // Step E, the honest count: every runner check says passed, failed and not
    // run apart, and whose code decided it. On the PO demo no engine case can
    // run (the original gives no valid value for P_BANFN): never "run, 0 failed".
    const runnerChecks = b.engine!.checks.filter((c) => c.kind === 'cases' || c.kind === 'probes');
    for (const c of runnerChecks) {
      expect(['engine-code', 'fills']).toContain(c.scope);
      expect((c.passed ?? -1) + (c.failed ?? 0) + (c.notRun ?? -1)).toBe(c.total);
    }
    await expect(built.locator('[data-engine-checks]')).not.toContainText(/\d+ run, \d+ failed/);
    const cases = runnerChecks.filter((c) => c.kind === 'cases' && c.total > 0);
    if (cases.length > 0) {
      for (const c of cases) expect(c.passed).toBe(0);
      await expect(built.locator('[data-engine-checks]')).toContainText('not run — no valid base value known for P_BANFN');
    }
    if (runnerChecks.some((c) => c.kind === 'probes' && c.scope === 'engine-code' && c.total > 0)) {
      await expect(built.locator('[data-engine-checks]')).toContainText("of the engine's decimal, CSV and run-store code");
    }
    expect((b.basis ?? []).length).toBe(6);
    console.log(`[step E] stored: ${b.engine!.written}/${b.engine!.units} written, ${b.engine!.callsUsed} model calls, checks ${JSON.stringify(b.engine!.checks)}, not run ${JSON.stringify(b.engine!.notRun)}, elapsedMs ${b.elapsedMs}`);
  });
}

test('cancel in the middle of the fills aborts, and nothing is stored', async ({ page }) => {
  const account = await seed('tf-engine-cancel', PO_DEMO, 'Z_MM_PO_APPROVAL');
  await keyAvailable(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  let calls = 0;
  await page.route('**/api/gemini', async (route) => {
    calls++;
    await new Promise((r) => setTimeout(r, 8_000));
    await route.continue().catch(() => {});
  });
  const screen = await openAndGenerate(page, account);
  await expect(screen.locator('[data-generation-stage="fills"]')).toHaveAttribute('data-stage-state', 'active', { timeout: 60_000 });
  await expect.poll(() => calls, { timeout: 30_000 }).toBeGreaterThan(0);
  await screen.locator('[data-generation-cancel]').click();
  await expect(page.locator('[data-generation-cancelled]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-generation-screen]')).toHaveCount(0);
  // No new call after the cancel; the ones in flight were at most four.
  const after = calls;
  await page.waitForTimeout(3_000);
  expect(calls).toBe(after);
  expect(after).toBeLessThanOrEqual(4);
  const stored = (await adminGetDoc('projects', account.projectId)) as Stored;
  expect(stored.generatedCode ?? null).toBeNull();
  expect(stored.status).toBe('designed');
});

test('a function the model declines stays a stub: the generation is partial, with the finding', async ({ page }) => {
  // One routine of the demo carries the marker the test stub declines on.
  const lines = PO_DEMO.split('\n');
  const formAt = lines.findIndex((l) => /^\s*FORM\s+check_requisition\b/i.test(l));
  expect(formAt, 'the demo has FORM check_requisition').toBeGreaterThan(-1);
  lines.splice(formAt + 1, 0, `  " ${GEMINI_TEST_STUB_DECLINE}`);
  const account = await seed('tf-engine-partial', lines.join('\n'), 'Z_MM_PO_APPROVAL');
  await keyAvailable(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAndGenerate(page, account);
  await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 360_000 });
  const strip = page.locator('[data-built-on="engine-led"] [data-not-written]');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip).toContainText('the model declined');
  const stored = (await adminGetDoc('projects', account.projectId)) as Stored;
  expect(stored.generationBinding!.engine!.status).toBe('partial');
  expect(stored.generationBinding!.engine!.notWritten.length).toBe(1);
  const files = JSON.parse(stored.generatedCode ?? '[]') as Array<{ path: string; content: string }>;
  expect(files.find((f) => f.path === 'TRACE.md')!.content).toContain('Not written:');
  await shot(page, 'partial-1280');
});

test('a program the engine cannot scaffold runs the single call, with the note on the screen and on record', async ({ page }) => {
  // No routine and no event block: nothing to anchor a function to (the planner refuses).
  const SOURCE = `REPORT z_flat.
PARAMETERS p_ebeln TYPE ebeln OBLIGATORY.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
SELECT SINGLE netwr FROM ekko INTO lv_amount WHERE ebeln = p_ebeln.
IF sy-subrc <> 0.
  MESSAGE 'Purchase order not found' TYPE 'E'.
ENDIF.
WRITE: / 'Checked', p_ebeln, lv_amount.
`;
  const account = await seed('tf-engine-fallback', SOURCE, 'Z_FLAT');
  await keyAvailable(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const PACKAGE = {
    files: [
      { path: 'srv/service.ts', content: 'export const text = (m: string) => m;\n' },
      { path: 'db/schema.cds', content: 'entity Material { key id : String; }' },
      { path: 'package.json', content: '{"name":"flat"}' },
      { path: 'Dockerfile', content: 'FROM node:22' },
      { path: 'erp-triggers/zcl_core_event_publisher.clas.abap', content: 'CLASS zcl_core_event_publisher DEFINITION. ENDCLASS.' },
    ],
    tests: { config: 'export default {};', spec: 'test("a", () => {});' },
  };
  // The contract decides the track; the stub answers in the shape the prompt asked for.
  const RAP = {
    files: [
      { path: 'src/zcl_demo_rap_behavior.clas.abap', content: 'CLASS zcl_demo_rap_behavior DEFINITION. ENDCLASS.' },
      { path: 'src/zcl_demo_rap_behavior.clas.xml', content: '<xml/>' },
      { path: 'src/z_demo_rap_ddls.ddls.asddls', content: 'define view entity Z_DEMO as select from ekko { key ebeln }' },
      { path: 'src/z_demo_rap_bdef.bdef.asbdef', content: 'managed;' },
      { path: 'src/z_demo_rap_srvd.srvd.assrvd', content: 'define service Z_DEMO { }' },
      { path: 'src/z_demo_rap_srvb.srvb.assrvb', content: '<srvb/>' },
    ],
    tests: { config: '', spec: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.' },
  };
  await page.route('**/api/gemini', (route) => {
    const prompt = String((route.request().postDataJSON() as { prompt?: string }).prompt ?? '');
    const pkg = prompt.includes('SAP RAP') ? RAP : PACKAGE;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify(pkg) }) });
  });
  // The answer comes back at once, so the screen is short-lived: the note is read on the result and the record.
  await openAndGenerate(page, account);
  await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 120_000 });
  await expect(page.locator('[data-built-on="single-call"] [data-single-call-note]')).toContainText('the engine could not build a scaffold for this program');
  const stored = (await adminGetDoc('projects', account.projectId)) as Stored;
  expect(stored.generationBinding!.path).toBe('single-call');
  expect(stored.generationBinding!.fallbackReason).toMatch(/no routine and no event block/);
});
