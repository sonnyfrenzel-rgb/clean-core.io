import { test, expect, type Page, type Route } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { GEMINI_TEST_STUB_HEADER } from '../lib/gemini-test-stub';
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
 * account whose analysis stage is on. The example opens Analyze, Business
 * (plan AB-2), where the start run is signed; the paced build-up the model
 * once ran behind retired with v3.1.0 (AB-3), so the wait is said where the
 * map goes and the first insights stand in their end state from the start:
 *
 *   1. the model is asked at the start, before the run is sent, and the one
 *      signed run carries the narrative with a receipt; exactly one
 *      `/api/runs/create`; the example's free first run is still free; no
 *      build-up plays;
 *   2. a model that fails: the run is signed without the narrative, the map
 *      stands, the page says so with one action and what it costs;
 *   3. a model that does not answer: the map's place waits with the seconds
 *      waited, and "Go on without the narrative" signs the engine's reading —
 *      one run, never a second.
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

/** Whether anything of the retired build-up ever stood on the page. */
async function recordBuildUp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sawBuilding: boolean };
    w.__sawBuilding = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-first-look="building"], [data-first-look-buildup]')) w.__sawBuilding = true;
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
  await page.waitForURL(/\/project\/[^/?]+\/analyze\?first=1/, { timeout: 120000 });
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

  test('the model is asked at the start, and the one signed run carries its narrative', async ({ page }) => {
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
    await recordBuildUp(page);
    const seen = watch(page);
    const projectId = await startExample(page);

    await expect(page.locator('[data-analyze-map] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-analyze-interim] [data-first-look="end-state"]')).toBeVisible({ timeout: 90000 });
    const sawBuilding = await page.evaluate(() => (window as unknown as { __sawBuilding: boolean }).__sawBuilding);
    expect(sawBuilding, 'a build-up played: it retired with v3.1.0').toBe(false);

    // The model was asked once, at the start, before the one run was sent.
    expect(seen.model, 'the start asked the model more or less than once').toHaveLength(1);
    expect(seen.model[0].stage).toBe('analyze');

    // One run, signed once, with the narrative and its receipt.
    expect(seen.runs, 'the start sent more or less than one run').toHaveLength(1);
    expect(seen.model[0].at, 'the run was sent before the model was asked').toBeLessThan(seen.runs[0]);
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
    // In the consent text `startRun.freePlatformKey`, never a word about costs (legal review 06.11.2026).
    await expect(note.locator('[data-start-narrative-later-cost]')).toHaveText(
      'Analyze runs the analysis again with the model and signs a new run: Free. This run uses one of your 5 analyses; 4 left after it. · Calls the model.',
    );

    expect(seen.runs).toHaveLength(1);
    const { run } = await signedRun(projectId);
    expect(run.modelParticipation).toBe('none');
    const account = await adminGetDoc('users', uid);
    expect(account?.transformationsUsed ?? 0).toBe(0);
  });

  test('a model that does not answer: the place of the map waits, and going on signs one run without it', async ({ page }) => {
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

    // The map's place waits, saying for how long (there is no build-up to wait in since v3.1.0).
    const waiting = page.locator('[data-analyze-map] [data-workspace-process="signing"] [data-start-narrative="writing"]');
    await expect(waiting).toBeVisible({ timeout: 60000 });
    await expect(waiting).toContainText('Writing the narrative (model)');
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
});
