import { test, expect, type Page, type Route } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';

/**
 * The evidence engine arrives late, or not at all — and the screens say so
 * (QA review of c220adbf7f8a, findings b5815a7ad3e6 and af734c6e6735).
 *
 * Since the external audit PERF-01 (6a45b3b8) the engine and the SAP catalog it
 * reads travel in a chunk of their own, fetched by `hooks/useEvidenceEngine.ts`
 * the first time a screen with a source asks for it. Two screens draw from it:
 *
 *   - Analyze keeps its loading state while the chunk is on its way, because a
 *     report drawn before the engine is here is a report with no findings for a
 *     program that has them; and when the chunk cannot be loaded it says so
 *     (`[data-analyze-engine-failed]`) instead of drawing that empty report.
 *   - The Public-Cloud-Fit card in the workspace shows `loading` while the
 *     chunk is on its way and `error` when it failed — never `empty`, the card
 *     for a project with no source, because this project has one.
 *
 * The source-level guards cannot see any of that: the states exist only while
 * a network request is pending or after it failed. So these specs hold that
 * request, or abort it, in a real browser against a signed-in, seeded project
 * with a source and a signed run.
 *
 * **Which request.** The engine chunk is found by what it carries, not by its
 * hashed file name: a script under `/_next/static/chunks/` whose body holds the
 * engine's own finding text. The marker below is a string literal of
 * `lib/abap/evidence-model.ts` that no page code repeats, so the page's own
 * chunks pass untouched and only the on-demand engine is held or aborted. Each
 * spec also asserts that the marker was seen — a build that renamed the text
 * fails here rather than passing a hold that never held anything.
 */

/** A finding title only `lib/abap/evidence-model.ts` writes. */
const ENGINE_MARKER = 'Direct Write to SAP Standard Table';
const CHUNKS = '**/_next/static/chunks/**/*.js';

interface EngineGate {
  /** Resolves when the browser asked for the engine chunk. */
  requested: Promise<void>;
  /** Lets a held chunk through. */
  release: () => void;
}

/**
 * Routes every script chunk; the engine's is held until `release()` (`hold`)
 * or aborted (`abort`). Installed after sign-in, so only the page under test
 * goes through it.
 */
async function gateEngineChunk(page: Page, mode: 'hold' | 'abort'): Promise<EngineGate> {
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => (markRequested = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));

  await page.route(CHUNKS, async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(ENGINE_MARKER)) {
      await route.fulfill({ response, body });
      return;
    }
    markRequested();
    if (mode === 'abort') {
      await route.abort('failed');
      return;
    }
    await released;
    await route.fulfill({ response, body });
  });
  return { requested, release };
}

/** Fails if `selector` shows up at any point over `ms` — a state that must hold, not merely start. */
async function staysAbsent(page: Page, selector: string, ms: number, why: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    expect(await page.locator(selector).count(), why).toBe(0);
    await page.waitForTimeout(200);
  }
}

test.describe('the evidence engine, loaded on demand', () => {
  test.describe.configure({ mode: 'serial' });

  let acct: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    acct = await seedStageProject({ prefix: 'engload', admin: true, acceptTerms: true, rich: true });
  });

  test('Analyze holds its loading state while the engine is on its way, then draws the findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const gate = await gateEngineChunk(page, 'hold');
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    // The project has loaded (the engine is only asked for once its source is
    // known), and the report still waits for the engine.
    await expect(page.getByText('Loading project data...')).toBeVisible();
    await staysAbsent(
      page,
      '[data-analysis-answer], [data-analysis-findings]',
      3000,
      'Analyze drew its report before the engine had arrived',
    );
    await expect(page.locator('[data-analyze-engine-failed]')).toHaveCount(0);

    gate.release();
    const answer = page.locator('[data-analysis-answer]');
    await expect(answer).toBeVisible({ timeout: 60000 });
    await expect(answer.locator('h2')).toContainText(/findings? to review in this code/);
    await expect(page.locator('[data-analysis-findings] [data-findings-group]').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('The evidence engine found nothing');
    await expect(page.getByText('Loading project data...')).toHaveCount(0);
  });

  test('Analyze says the engine failed, and claims no findings it never computed', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const gate = await gateEngineChunk(page, 'abort');
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    const failed = page.locator('[data-analyze-engine-failed]');
    await expect(failed).toBeVisible({ timeout: 60000 });
    await expect(failed).toContainText('The evidence engine could not be loaded');

    // No report drawn from an engine that is not there: no findings table, no
    // answer counting its findings, no "found nothing".
    await expect(page.locator('[data-analysis-findings]')).toHaveCount(0);
    await expect(page.locator('[data-analysis-answer]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('The evidence engine found nothing');
    await expect(page.locator('body')).not.toContainText(/\b0 findings\b|found nothing/);
    await expect(page.getByText('Loading project data...')).toHaveCount(0);
  });

  test('the workspace Public-Cloud-Fit card reports the failed engine as an error, not as no source', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signInThroughForm(page, acct);

    const gate = await gateEngineChunk(page, 'abort');
    await page.goto(`/project/${acct.projectId}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'management', {
      timeout: 60000,
    });
    await gate.requested;

    const card = page.locator('[data-public-cloud-fit-panel]');
    await expect(card).toHaveAttribute('data-public-cloud-fit-panel', 'error', { timeout: 60000 });
    await expect(page.locator('[data-public-cloud-fit-panel="empty"]')).toHaveCount(0);
    await expect(page.locator('[data-public-cloud-fit-panel="ready"]')).toHaveCount(0);
  });
});
