import { test, expect, type Page, type Route } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { GEMINI_TEST_STUB_HEADER } from '../lib/gemini-test-stub';
import { BUILD_UP_BUDGET } from '../lib/first-look-buildup';
import { START_NARRATIVE_CEILING_MS } from '../lib/model-stages';
import { missingFrom, startNarrativeMissingReason } from '../lib/start-narrative-basics';
import { describeRunCost, startModelLine } from '../lib/run-cost';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The start with the model on — owner decision 03.10.2026, amending ADR-072.
 * Translated: "Start with the model: at the start, with the model straight
 * away when it is switched on … the map waits for the model." And: "Use the
 * time during the first steps of building the process from the code, and run
 * the model during that."
 *
 * Held here, each for a shipped example started from My workspace by an
 * account whose analysis stage is on:
 *
 *   1. the model is asked while the build-up is still in its first moments —
 *      before the second one ends — and the one signed run carries the
 *      narrative with a receipt; exactly one `/api/runs/create`; the example's
 *      free first run is still free;
 *   2. a model that fails: the run is signed without the narrative, the map
 *      stands, the page says so with one action and what it costs;
 *   3. a model that does not answer: the last moment waits with the seconds
 *      waited, and "Go on without the narrative" signs the engine's reading —
 *      one run, never a second;
 *   4. reduced motion: the end state at once, and the map once the run is signed.
 *
 * No real model is called. `/api/gemini` is either answered here, or handed to
 * the server's test stub (`lib/gemini-test-stub.ts`, every gate of the route
 * and a real receipt, only the provider replaced), after an artificial delay.
 * The model-off start stays in `tests/workspace-start.spec.ts`.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceModel123!';
const EXAMPLE = 'Z_SALES_ORDER_CREATOR';
const STUB_SECRET = process.env.PILOT_APPROVAL_SECRET ?? '';

async function modelAccount(prefix: string): Promise<{ email: string; uid: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Model', lastName: 'Start', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    // The narrative on; the names and the sentences off, so the only model
    // call of the start is the narrative.
    modelStages: { analyze: true, naming: false, statements: false },
  });
  return { email, uid: cred.user.uid };
}

/** The account's model answer as the test server cannot give it: a key is available. */
async function keyAvailable(page: Page) {
  await page.route('**/api/model-stages', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: { analyze: true, naming: false, statements: false }, keyAvailable: true, keySource: 'community' }),
    }),
  );
}

/** Every request to the run route and to the model, with when it left. */
function watch(page: Page) {
  const runs: number[] = [];
  const model: { at: number; stage: unknown }[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (req.url().includes('/api/runs/create')) runs.push(Date.now());
    if (req.url().includes('/api/gemini')) {
      const body = JSON.parse(req.postData() || '{}') as { stage?: unknown };
      model.push({ at: Date.now(), stage: body.stage });
    }
  });
  return { runs, model };
}

/** When each moment of the build-up first stood on the page, by the browser's clock. */
async function recordMoments(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __moments: Record<string, number>; __sawBuilding: boolean };
    w.__moments = {};
    w.__sawBuilding = false;
    new MutationObserver(() => {
      const el = document.querySelector('[data-first-look-buildup]');
      if (document.querySelector('[data-first-look="building"]')) w.__sawBuilding = true;
      const stage = el?.getAttribute('data-first-look-buildup');
      if (stage && !(stage in w.__moments)) w.__moments[stage] = Date.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

async function startExample(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const list = page.locator('[data-cc-workspace]');
  await expect(list).toBeVisible({ timeout: 90000 });
  const start = list.locator(`[data-example-start="${EXAMPLE}"]`).first();
  if (!(await start.isVisible().catch(() => false))) {
    await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
  }
  // Said before the click: the start calls the model.
  await expect(page.locator('[data-examples-model="calls"]').first()).toContainText('Calls the model');
  await start.click({ timeout: 60000 });
  await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
  return new URL(page.url()).pathname.split('/')[2];
}

async function signedRun(projectId: string) {
  const project = await adminGetDoc('projects', projectId);
  expect(typeof project?.activeRunId, 'no signed run on the project').toBe('string');
  const run = await adminGetDoc(`projects/${projectId}/runs`, project!.activeRunId);
  return { project: project!, run: run! };
}

test.describe('the start, model on (owner decision 03.10.2026)', () => {
  test('the rules: the cost lines, the ceiling and the reasons', () => {
    expect(START_NARRATIVE_CEILING_MS, 'the ceiling must end before the 120 s request timeout').toBeLessThan(120_000);
    expect(START_NARRATIVE_CEILING_MS).toBeGreaterThanOrEqual(60_000);
    expect(startModelLine(true)).toContain('Calls the model');
    expect(startModelLine(true)).toContain('not counted against your analysis runs');
    expect(startModelLine(true)).toContain('90 s');
    expect(startModelLine(false)).toContain('No model call');
    // Same model sentence the workspace list's Run says.
    expect(describeRunCost({ profile: null, metered: true, callsModel: true }).modelCall).toBe('Calls the model');
    // An ended wait says why it ended; a refused call says the proxy's reason.
    expect(missingFrom(new Error('x'), 'timeout')).toBe('timeout');
    expect(missingFrom(new Error('x'), 'continued')).toBe('continued');
    expect(missingFrom(new Error('… (model-stage-disabled)'), null)).toBe('stage-off');
    expect(missingFrom(new Error('… (model-key-missing)'), null)).toBe('no-key');
    expect(missingFrom(new Error('boom'), null)).toBe('failed');
    expect(startNarrativeMissingReason('timeout', START_NARRATIVE_CEILING_MS)).toContain('90 seconds');
    expect(startNarrativeMissingReason('failed', START_NARRATIVE_CEILING_MS)).toContain('signed without the narrative');
  });

  test('the model runs during the build-up, and the one signed run carries its narrative', async ({ page }) => {
    test.setTimeout(360 * 1000);
    expect(STUB_SECRET, 'the stub needs PILOT_APPROVAL_SECRET').not.toBe('');
    const { email, uid } = await modelAccount('ws-model-on');
    await keyAvailable(page);
    // A recorded answer, about three seconds late: the server's test stub
    // answers after the route has run every gate and issues a real receipt.
    await page.route('**/api/gemini', async (route: Route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue({ headers: { ...route.request().headers(), [GEMINI_TEST_STUB_HEADER]: STUB_SECRET } });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordMoments(page);
    const seen = watch(page);
    const projectId = await startExample(page);

    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });

    // The model was asked before the build-up's second moment ended.
    const moments = await page.evaluate(() => (window as unknown as { __moments: Record<string, number> }).__moments);
    expect(moments['code-read'], 'the build-up never played').toBeDefined();
    const secondEnded = moments['business-language'] ?? moments['code-read'] + BUILD_UP_BUDGET.namesFrom;
    expect(seen.model, 'the start asked the model more or less than once').toHaveLength(1);
    expect(seen.model[0].stage).toBe('analyze');
    expect(seen.model[0].at, 'the model was asked only after the second moment ended').toBeLessThan(secondEnded);

    // One run, signed once, with the narrative and its receipt.
    expect(seen.runs, 'the start sent more or less than one run').toHaveLength(1);
    const { run } = await signedRun(projectId);
    expect(run.modelParticipation).toBe('narrative-attested');
    // The narrative is kept on the run, beside the signature and outside it.
    expect(String(run.analysis)).toContain('gemini-test-stub');
    await expect(page.locator('[data-start-narrative="missing"]')).toHaveCount(0);

    // The example's free first run, as the card said.
    const account = await adminGetDoc('users', uid);
    expect(account?.transformationsUsed ?? 0).toBe(0);
    expect(account?.starterExamplesUsed?.[EXAMPLE]).toBe(true);
  });

  test('a model that fails: signed without the narrative, the map stands, one action with its cost', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email, uid } = await modelAccount('ws-model-fail');
    await keyAvailable(page);
    await page.route('**/api/gemini', (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The AI request could not be completed. Please try again.' }) }),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    const seen = watch(page);
    const projectId = await startExample(page);

    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });
    const note = page.locator('[data-start-narrative="missing"]');
    await expect(note).toBeVisible({ timeout: 30000 });
    await expect(note).toHaveAttribute('data-missing', 'failed');
    await expect(note).toContainText('The narrative was not written');
    await expect(note).toContainText('signed without the narrative');
    const later = note.locator('[data-start-narrative-later]');
    await expect(later).toHaveCount(1);
    await expect(later).toHaveAttribute('href', new RegExp(`/project/${projectId}/analyze`));
    // Writing it later is a second run of the example: its free first run is spent.
    await expect(note.locator('[data-start-narrative-later-cost]')).toContainText('Uses 1 of your 5 free analysis runs');
    await expect(note.locator('[data-start-narrative-later-cost]')).toContainText('Calls the model');

    expect(seen.runs).toHaveLength(1);
    const { run } = await signedRun(projectId);
    expect(run.modelParticipation).toBe('none');
    const account = await adminGetDoc('users', uid);
    expect(account?.transformationsUsed ?? 0).toBe(0);
  });

  test('a model that does not answer: the last moment waits, and going on signs one run without it', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email } = await modelAccount('ws-model-wait');
    await keyAvailable(page);
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api/gemini', async (route: Route) => {
      await held;
      await route.abort().catch(() => {});
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    const seen = watch(page);
    const projectId = await startExample(page);

    // The build-up reaches its last moment and waits there, saying for how long.
    const waiting = page.locator('[data-first-look-moment="map"] [data-start-narrative="writing"]');
    await expect(waiting).toBeVisible({ timeout: 60000 });
    await expect(waiting).toContainText('Writing the narrative (model)');
    await expect(page.locator('[data-first-look-rail-step="map"]')).toContainText('writing the narrative (model)');
    await expect.poll(async () => Number(await waiting.locator('[data-start-narrative-waited]').getAttribute('data-start-narrative-waited')), { timeout: 10000 }).toBeGreaterThan(0);
    expect(seen.runs, 'a run was signed while the model was still being waited for').toHaveLength(0);

    await waiting.locator('[data-start-narrative-continue]').click();
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    const note = page.locator('[data-start-narrative="missing"]');
    await expect(note).toHaveAttribute('data-missing', 'continued');
    await expect(note.locator('[data-start-narrative-later]')).toHaveCount(1);
    release();
    // Never a second run: not when the held call ends, not afterwards.
    await page.waitForTimeout(1500);
    expect(seen.runs).toHaveLength(1);
    const { run } = await signedRun(projectId);
    expect(run.modelParticipation).toBe('none');
  });

  test('under reduced motion: the end state at once, the map once the run is signed', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email } = await modelAccount('ws-model-reduced');
    await keyAvailable(page);
    await page.route('**/api/gemini', async (route: Route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue({ headers: { ...route.request().headers(), [GEMINI_TEST_STUB_HEADER]: STUB_SECRET } });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordMoments(page);
    const seen = watch(page);
    const projectId = await startExample(page);

    await expect(page.locator('[data-first-look="end-state"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-first-look="end-state"]')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    const sawBuilding = await page.evaluate(() => (window as unknown as { __sawBuilding: boolean }).__sawBuilding);
    expect(sawBuilding, 'a build-up played under reduced motion').toBe(false);
    expect(seen.runs).toHaveLength(1);
    const { run } = await signedRun(projectId);
    expect(run.modelParticipation).toBe('narrative-attested');
  });
});
