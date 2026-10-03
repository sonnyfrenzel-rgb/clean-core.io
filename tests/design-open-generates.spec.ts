import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { TERMS_VERSION } from '../lib/constants';
import { DESIGN_ON_OPEN_COST } from '../lib/model-stages';
import { PHASE_PURPOSE } from '../lib/workflow-steps';
import { nextOpenPoint } from '../lib/next-step';
import type { Project } from '../lib/types';

/**
 * Design writes what is not on record when it is opened (owner 03.10.2026:
 * "When I click Design, everything should be generated directly as well,
 * except the functional requirements"; ADR-070 and ADR-074, amended):
 *
 *   - the non-functional requirements are read by the engine on opening;
 *   - the solution design is written by the model, once, with a visible wait,
 *     its cost said, a ceiling, and "Try again" on a failure;
 *   - a current design is never written again, the model switch and an
 *     invited reader start nothing, and two tabs opened together pay once.
 *
 * No model is called: `/api/gemini` is answered with recorded fixtures.
 */

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_SALES_ORDER_CREATOR.txt'), 'utf8').replace(/\r\n/g, '\n');
const PASSWORD = 'DesignOnOpen123!';

const DESIGN_FIXTURE = JSON.stringify({
  projectName: 'Sales order creation',
  architectureOverview: {
    approachDescription: 'Create sales orders through the released sales order API instead of the BAPI call at line 71.',
    nodeFramework: 'SAP RAP (RESTful Application Programming)',
    runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'zr_sales_order_req.bdef', purpose: 'Behavior definition' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Transactional DB Access', description: 'One LUW; commit only without errors (line 86).' },
  securityHardening: [],
  roadmap: [{ phase: 'Phase 0', title: 'Setup', deliverables: ['Package'] }],
});
const NFR_FIXTURE = JSON.stringify({ dataMigration: 'None: the program creates documents and keeps no data of its own.' });

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

async function newAccount(prefix: string) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${prefix}-${tag}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
  const uid = (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Design', lastName: 'Open', email, tier: 'pilot', status: 'approved',
    termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
  });
  return { email, uid, tag };
}

/** An engine-only signed run and no design on record. */
async function seedUndesigned(prefix: string, extra: Record<string, unknown> = {}) {
  const owner = await newAccount(prefix);
  const projectId = `${prefix}-${owner.tag}`;
  const runId = `${projectId}-run`;
  const fingerprint = { sha256: sha256Hex(SOURCE), fileName: 'Z_SALES_ORDER_CREATOR.txt', lineCount: SOURCE.split('\n').length, byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
  await adminSetDoc('projects', projectId, {
    name: 'Z_SALES_ORDER_CREATOR', userId: owner.uid, createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
    legacyCode: SOURCE, analysis: '', activeRunId: runId, inputFingerprint: fingerprint, ...extra,
  });
  const unsigned = { runId, projectId, userId: owner.uid, createdAt: new Date().toISOString(), status: 'completed', analysis: '', modelParticipation: 'none', inputFingerprint: fingerprint };
  const runHash = recomputeStoredRunHash(unsigned);
  await adminSetDoc(`projects/${projectId}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
  return { email: owner.email, uid: owner.uid, projectId };
}

interface ModelLog {
  design: number;
  proposals: number;
}

/** The account's model switch and recorded answers; `fail` answers every call with an error. */
async function answerModel(
  target: Page | BrowserContext,
  log: ModelLog,
  opts: { stages?: Record<string, boolean>; delayMs?: number; fail?: () => boolean } = {},
) {
  await target.route('**/api/model-stages', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stages: opts.stages ?? {}, keyAvailable: true, keySource: 'community' }) }),
  );
  await target.route('**/api/gemini', async (route: Route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { prompt?: string };
    const isDesign = (body.prompt ?? '').includes('interface DesignData');
    if (isDesign) log.design += 1;
    else log.proposals += 1;
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail?.()) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The model is busy. Nothing was generated — try again in a moment.' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: isDesign ? DESIGN_FIXTURE : NFR_FIXTURE, receipt: null }) });
  });
}

async function openDesign(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
}

test.describe('what opening Design costs, said before the click', () => {
  test('the toolbar purpose and the next step name the one model write and that it is not an analysis run', () => {
    expect(PHASE_PURPOSE.design).toMatch(/Opening it writes the solution design once with the model/);
    expect(PHASE_PURPOSE.design).toMatch(/not counted against your analysis runs/);
    expect(DESIGN_ON_OPEN_COST).toMatch(/not counted against your analysis runs/);
    const analysed = { name: 'p', legacyCode: 'REPORT z.', activeRunId: 'r', status: 'analyzed', analysis: '{}', cleanCoreScore: 50 } as unknown as Project;
    const point = nextOpenPoint(analysed);
    if (point?.key === 'design') expect(point.reason).toContain(DESIGN_ON_OPEN_COST);
    // With the stage off nothing is written on opening, and the step says so instead.
    const off = nextOpenPoint(analysed, { modelStages: { design: false } });
    if (off?.key === 'design') expect(off.reason).not.toContain(DESIGN_ON_OPEN_COST);
  });
});

test.describe('opening Design', () => {
  test('writes a missing design once, with a visible wait and its cost; opening it again calls nothing', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedUndesigned('design-open-once');
    const log: ModelLog = { design: 0, proposals: 0 };
    await answerModel(page, log, { delayMs: 2_500 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await openDesign(page, seeded.projectId);

    // The wait is on screen, in place of the document: what, how long, what it costs.
    const writing = page.locator('[data-design-writing="here"]');
    await expect(writing).toBeVisible({ timeout: 60_000 });
    await expect(writing).toContainText('Writing the solution design (model)…');
    await expect(writing.locator('[data-design-writing-seconds]')).toContainText('120 s at most');
    await expect(writing.locator('[data-design-writing-cost]')).toHaveText(DESIGN_ON_OPEN_COST);
    // No button had to be found.
    await expect(page.locator('[data-design-generate]')).toHaveCount(0);

    await expect(page.locator('[data-design-overview]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-design-overview]')).toContainText('Sales order creation');
    expect(log.design, 'one design call').toBe(1);
    expect(log.proposals, 'one call for the non-functional proposals').toBe(1);
    const stored = await adminGetDoc('projects', seeded.projectId);
    expect(String(stored?.solutionDesign)).toContain('Sales order creation');

    // Current and on record: opening it again writes nothing.
    await openDesign(page, seeded.projectId);
    await expect(page.locator('[data-design-overview]')).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(3_000);
    expect(log).toEqual({ design: 1, proposals: 1 });
    await expect(page.locator('[data-design-writing]')).toHaveCount(0);
  });

  test('reads the non-functional requirements without a click; the functional ones keep their button', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedUndesigned('design-open-nfr');
    const log: ModelLog = { design: 0, proposals: 0 };
    await answerModel(page, log);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await openDesign(page, seeded.projectId);
    const nfr = page.locator('[data-non-functional-requirements]');
    await expect(nfr).toHaveAttribute('data-nfr-state', 'ready', { timeout: 60_000 });
    expect(await nfr.locator('[data-nfr-row]').count()).toBeGreaterThan(0);
    await expect(nfr.locator('[data-nfr-derive]')).toHaveCount(0);
    // The owner's exception: the functional requirements stay on demand.
    const fr = page.locator('[data-functional-requirements]');
    await expect(fr.locator('[data-fr-derive]')).toBeVisible();
    await expect(fr.locator('[data-fr-row]')).toHaveCount(0);
  });

  test('with the model off: no call, the reason with a way to Settings, and the engine parts all there', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedUndesigned('design-open-off');
    const log: ModelLog = { design: 0, proposals: 0 };
    await answerModel(page, log, { stages: { design: false } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await openDesign(page, seeded.projectId);
    const off = page.locator('[data-design-model-off="stage-off"]');
    await expect(off).toBeVisible({ timeout: 120_000 });
    await expect(off).toContainText('Turn the design stage back on in Settings to generate it.');
    await expect(off.locator('a[data-design-settings-link]')).toHaveAttribute('href', '/settings');
    // The engine's parts stand without a model.
    await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-non-functional-requirements]')).toHaveAttribute('data-nfr-state', 'ready', { timeout: 60_000 });
    await page.waitForTimeout(2_000);
    expect(log).toEqual({ design: 0, proposals: 0 });
    await expect(page.locator('[data-design-writing]')).toHaveCount(0);
  });

  test('an invited reader starts nothing', async ({ page }) => {
    test.setTimeout(300_000);
    const reader = await newAccount('design-open-reader');
    const seeded = await seedUndesigned('design-open-owned', { readers: [reader.uid] });
    const log: ModelLog = { design: 0, proposals: 0 };
    await answerModel(page, log);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, reader.email, PASSWORD);
    await openDesign(page, seeded.projectId);
    await expect(page.locator('[data-design-reader-note]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-design-generate]')).toHaveCount(0);
    await page.waitForTimeout(3_000);
    expect(log).toEqual({ design: 0, proposals: 0 });
    const stored = await adminGetDoc('projects', seeded.projectId);
    expect(stored?.solutionDesign).toBeUndefined();
  });

  test('a failed generation says so and offers "Try again", which writes it', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedUndesigned('design-open-fail');
    const log: ModelLog = { design: 0, proposals: 0 };
    let failing = true;
    await answerModel(page, log, { fail: () => failing });
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, seeded.email, PASSWORD);
    await openDesign(page, seeded.projectId);
    await expect(page.getByText('Generation failed.')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('The model is busy. Nothing was generated — try again in a moment.')).toBeVisible();
    expect(log.design).toBe(1);
    const retry = page.locator('[data-design-generate]');
    await expect(retry).toHaveText(/Try again/);
    failing = false;
    await retry.click();
    await expect(page.locator('[data-design-overview]')).toBeVisible({ timeout: 120_000 });
    expect(log.design).toBe(2);
  });

  test('two tabs opened together write it once, and both show it', async ({ context }) => {
    test.setTimeout(300_000);
    const seeded = await seedUndesigned('design-open-twice');
    const log: ModelLog = { design: 0, proposals: 0 };
    await answerModel(context, log, { delayMs: 4_000 });
    const first = await context.newPage();
    await first.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(first, seeded.email, PASSWORD);
    const second = await context.newPage();
    await second.setViewportSize({ width: 1440, height: 900 });
    await Promise.all([
      first.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' }),
      second.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' }),
    ]);
    for (const p of [first, second]) await expect(p.locator('[data-design-overview]')).toBeVisible({ timeout: 180_000 });
    expect(log.design, 'one design call for two tabs').toBe(1);
  });
});
