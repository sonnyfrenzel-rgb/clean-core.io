import { expect, test, type Page, type Route } from './helpers/test';
import fs from 'fs';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { examplePath } from './helpers/starter-example-files';
import {
  NAMING_FORMAT_VERSION,
  NAMING_MADE_FROM_FACTS,
  namingContextOf,
  namingFactsApply,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { NAMING_CEILING_MS } from '../lib/naming-arrival';

/**
 * Roadmap 3.1.0 item 4 (plan AB-3, mockup states 1, 2, 3), rendered against the seeded PO example: the map stands
 * with the engine's names, the AI names swap in with their pen mark, one status line counts them, a slow model ends
 * at the 45 s ceiling and a failed one in one sentence — every engine name in place, the page usable throughout.
 *
 * The model and the naming store are stubbed in the browser (`page.route`), so no key is spent and the answer is the
 * test's: a naming made from the facts, as the route would store it. Every assertion reads an end state — the ready
 * line, the ceiling's line, the failed line — never a moment inside the swap (CLAUDE.md: a window that exists only
 * during a request is missed by the production build).
 *
 * Names are asked only from engine 3.1.0 (`namingFactsApply`, roadmap 3.1.0 item 1); on a 3.0.x build nothing is
 * asked and this spec has nothing to observe.
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const PO = fs.readFileSync(examplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');

test.describe('the AI names swap in on the map', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!namingFactsApply(null), 'business names are asked from engine 3.1.0 on (roadmap 3.1.0 item 1)');

  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let projectId = '';

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'nameswap', acceptTerms: true });
    const signIn = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) },
    );
    const token = ((await signIn.json()) as { idToken: string }).idToken;
    projectId = `${account.projectId}-po`;
    await adminSetDoc('projects', projectId, { name: 'Z_MM_PO_APPROVAL', userId: account.uid, createdAt: new Date(), status: 'created', legacyCode: PO });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, s4Deployment: 'private', analysis: '', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' }),
    });
    expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
  });

  /** A naming as the route stores it from a facts context: a name of its own for every task and decision point. */
  function naming(): ProcessNamingRecord {
    const context = namingContextOf(PO);
    const nodes = context.skeleton.nodes.filter((n) => n.kind === 'task' || n.kind === 'gateway');
    return {
      formatVersion: NAMING_FORMAT_VERSION,
      digest: context.digest,
      names: nodes.map((n, i) => ({ id: n.id, technicalName: n.label, name: n.kind === 'gateway' ? `Probe question ${i + 1}?` : `Probe step ${i + 1}` })),
      lanes: [],
      discarded: { total: 0, byRule: {} },
      origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-receipt-model', byok: false, issuedAt: Date.now(), textSha256: 'a'.repeat(64) },
      namedAt: new Date().toISOString(),
      madeFrom: NAMING_MADE_FROM_FACTS,
    };
  }

  /**
   * The model and the store, in the browser. `model` decides how the naming call ends; the store keeps what was
   * posted and hands it back, so the map reads the naming the way it reads a stored one.
   */
  async function stub(page: Page, model: 'answer' | 'fail' | 'hang', notice: { wording: 'C14-1' | 'C14-2' } = { wording: 'C14-2' }) {
    let stored: ProcessNamingRecord | null = null;
    const asks: string[] = [];
    // The notice before the first automatic call: confirmed in the wording that names business names, unless the test
    // says otherwise; "Got it" posts the wording the page showed, and the answer then carries it.
    let confirmed: string = notice.wording;
    const posts: unknown[] = [];
    await page.route('**/api/model-stages', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}') as { autoStepsNoticeWording?: string };
        posts.push(body);
        if (body.autoStepsNoticeWording) confirmed = body.autoStepsNoticeWording;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          stages: { naming: true, statements: false },
          keyAvailable: true,
          keySource: 'community',
          autoSteps: true,
          autoModelSteps: true,
          autoStepsNoticeSeen: true,
          autoStepsNoticeWording: confirmed,
        }),
      });
    });
    await page.route('**/api/gemini', async (route: Route) => {
      const body = route.request().postData() || '';
      if (!body.includes('"stage":"naming"')) return route.continue();
      asks.push(body);
      if (model === 'hang') return; // never answered: the ceiling ends the wait
      if (model === 'fail') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Refused for the test.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '{"names":[],"lanes":[]}', receipt: { stub: true } }) });
    });
    await page.route(`**/api/projects/${projectId}/process-naming`, async (route: Route) => {
      if (route.request().method() === 'POST') {
        stored = naming();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record: stored }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record: stored }) });
    });
    return { asks, posts };
  }

  async function open(page: Page) {
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-process="ready"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-map-node]').first()).toBeAttached({ timeout: 60_000 });
  }

  test('states 1–3: engine names at once, then the AI names with a pen mark exactly where a model wrote one', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    const { asks } = await stub(page, 'answer');
    await open(page);

    const status = page.locator('[data-naming-status]');
    await expect(status).toHaveAttribute('data-naming-status', 'ready', { timeout: 60_000 });
    expect(asks.length, 'the owner\'s page asked once').toBe(1);
    const named = Number(await status.getAttribute('data-naming-named'));
    const total = Number(await status.getAttribute('data-naming-total'));
    expect(named).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(named);
    const kept = total - named;
    await expect(page.locator('[data-naming-status-text]')).toHaveText(
      kept === 0 ? 'Names are ready.' : `Names are ready. ${kept} ${kept === 1 ? 'step kept its technical name' : 'steps kept their technical name'} (no pen mark).`,
    );

    // The pen mark, the laid-over name and the spoken name agree, element by element.
    const marked = page.locator('[data-map-node][data-map-named="ai"]');
    const onTop = await marked.count();
    expect(onTop).toBeGreaterThan(0);
    await expect(page.locator('.cc-map-name-pen')).toHaveCount(await page.locator('[data-map-name]').count());
    for (let i = 0; i < Math.min(onTop, 5); i += 1) {
      await expect(marked.nth(i)).toHaveAttribute('aria-label', /Probe (step|question) \d+.*AI-generated name/);
    }
    // No waiting mark is left, and the pen's legend stands under the map.
    await expect(page.locator('.cc-map-name-wait')).toHaveCount(0);
    await expect(page.locator('[data-naming-legend]')).toHaveText("Names: AI-generated from the code's facts; terms matched against those facts, not reviewed.");
    // The pen's tooltip names provider and model from the naming's receipt, not a model the code names.
    await expect(page.locator('.cc-map-name-pen').first()).toHaveAttribute('title', 'AI-generated name · Google Gemini gemini-receipt-model');

    // The map stayed usable: a step opens its code beside the map (Analyze, Business — mockup state 7) with the name it
    // now has. A plain click, as a reader's: the name laid over the step must not take it (3.1.0 acceptance run).
    await marked.first().click();
    await expect(page.locator('[data-analyze-code-panel] #analyze-code-panel-title')).toHaveText(/Probe (step|question) \d+/);
  });

  test('an account that confirmed the notice in its old wording sees it once more, and the names wait for it', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    const { asks, posts } = await stub(page, 'answer', { wording: 'C14-1' });
    await open(page);
    const notice = page.locator('[data-names-wait-notice]');
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice.locator('[data-auto-steps-notice-lead]')).toContainText('two steps — plain business sentences and business names —');
    await expect(notice).toContainText('The steps keep the names the engine read from the code.');
    // Nothing asked by itself, nothing offered on a click, no AI mark while the notice stands.
    await expect(page.locator('[data-ask-on-click]')).toHaveCount(0);
    await expect(page.locator('[data-map-named="ai"]')).toHaveCount(0);
    expect(asks.length, 'no naming call before the notice is confirmed').toBe(0);
    await notice.locator('[data-auto-steps-notice-dismiss]').click();
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect(posts[0]).toEqual({ autoStepsNotice: 'seen', autoStepsNoticeWording: 'C14-2' });
    await expect(notice).toHaveCount(0);
    await expect(page.locator('[data-naming-status]')).toHaveAttribute('data-naming-status', 'ready', { timeout: 60_000 });
    expect(asks.length, 'the names start once the notice is confirmed').toBe(1);
  });

  test('a failed model leaves every engine name, and the status line says so in one sentence', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    await stub(page, 'fail');
    await open(page);
    await expect(page.locator('[data-naming-status]')).toHaveAttribute('data-naming-status', 'failed', { timeout: 60_000 });
    await expect(page.locator('[data-naming-status-text]')).toHaveText('The AI names could not be written this time. The steps keep their technical name.');
    await expect(page.locator('[data-map-named="ai"]')).toHaveCount(0);
    await expect(page.locator('.cc-map-name-pen')).toHaveCount(0);
    await expect(page.locator('.cc-map-name-wait')).toHaveCount(0);
  });

  test('a model that does not answer ends at the 45 s ceiling; the map works all the while', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    await stub(page, 'hang');
    await open(page);
    const status = page.locator('[data-naming-status]');
    await expect(status).toHaveAttribute('data-naming-status', 'waiting', { timeout: 30_000 });
    // Waiting does not block: a step opens its code beside the map while the names are on their way.
    await page.locator('[data-map-node]').nth(1).click();
    await expect(page.locator('[data-analyze-code-panel]')).toBeVisible();
    await expect(status).toHaveAttribute('data-naming-status', 'timeout', { timeout: NAMING_CEILING_MS + 30_000 });
    await expect(page.locator('[data-naming-status-text]')).toHaveText('The AI names took longer than 45 s. The steps keep their technical name for now.');
    await expect(page.locator('[data-map-named="ai"]')).toHaveCount(0);
    await expect(page.locator('.cc-map-name-wait')).toHaveCount(0);
  });

  test('reduced motion: the names are simply there, without a swap', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    await stub(page, 'answer');
    await open(page);
    await expect(page.locator('[data-naming-status]')).toHaveAttribute('data-naming-status', 'ready', { timeout: 60_000 });
    await expect(page.locator('[data-process-map-canvas].cc-map-motion')).toHaveCount(0);
    await expect(page.locator('.cc-map-name-in')).toHaveCount(0);
    expect(await page.locator('[data-map-named="ai"]').count()).toBeGreaterThan(0);
  });
});
