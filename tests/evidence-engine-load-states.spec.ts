import { test, expect, type Page, type Route } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';

/**
 * The project's evidence arrives late, or not at all — and the screens say so
 * (QA review of c220adbf7f8a, findings b5815a7ad3e6 and af734c6e6735).
 *
 * Since 02.10.2026 Analyze, Transformation and the workspace's
 * Public-Cloud-Fit card no longer run the evidence engine in the browser. They
 * read the report from `GET /api/projects/{id}/evidence`, which computes it with
 * the catalog snapshot the signed run reads (owner decision 30.09.2026; until
 * then they loaded the engine as a chunk of its own, external audit PERF-01,
 * and read the default catalog with it). The states this spec holds are the
 * same ones, now around that request:
 *
 *   - Analyze keeps its loading state while the answer is on its way, because a
 *     report drawn before it is here is a report with no findings for a program
 *     that has them; and when it cannot be read it says so
 *     (`[data-analyze-evidence-failed]`) instead of drawing that empty report.
 *   - Transformation keeps its opening state the same way, and on a failed read
 *     says so (`[data-transformation-evidence-failed]`) and draws no facets
 *     counted from no findings — only the source and the package beside it.
 *   - The Public-Cloud-Fit card in the workspace shows `loading` while the
 *     answer is on its way and `error` when it failed — never `empty`, the card
 *     for a project with no source, because this project has one.
 *
 * The source-level guards cannot see any of that: the states exist only while
 * a request is pending or after it failed. So these specs hold that request, or
 * abort it, in a real browser against a signed-in, seeded project with a source
 * and a signed run. Each also asserts that the request was made at all — a
 * hold that never held anything would pass for the wrong reason.
 *
 * And the download the server route replaced stays gone: the engine chunk — a
 * script under `/_next/static/chunks/` carrying the engine's own finding text —
 * is never fetched by Analyze or Transformation.
 */

const EVIDENCE = '**/api/projects/*/evidence';
/** A finding title only `lib/abap/evidence-model.ts` writes. */
const ENGINE_MARKER = 'Direct Write to SAP Standard Table';
const CHUNKS = '**/_next/static/chunks/**/*.js';

interface EvidenceGate {
  /** Resolves when the browser asked for the project's evidence. */
  requested: Promise<void>;
  /** Lets a held request through. */
  release: () => void;
}

/**
 * Routes the project's evidence read; it is held until `release()` (`hold`) or
 * aborted (`abort`). Installed after sign-in, so only the page under test goes
 * through it.
 */
async function gateEvidence(page: Page, mode: 'hold' | 'abort'): Promise<EvidenceGate> {
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => (markRequested = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));

  await page.route(EVIDENCE, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    markRequested();
    if (mode === 'abort') {
      await route.abort('failed');
      return;
    }
    await released;
    await route.continue();
  });
  return { requested, release };
}

/** Counts the engine chunks the page fetches. */
async function countEngineChunks(page: Page): Promise<{ count: () => number }> {
  let seen = 0;
  await page.route(CHUNKS, async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(ENGINE_MARKER)) seen++;
    await route.fulfill({ response, body });
  });
  return { count: () => seen };
}

/** Fails if `selector` shows up at any point over `ms` — a state that must hold, not merely start. */
async function staysAbsent(page: Page, selector: string, ms: number, why: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    expect(await page.locator(selector).count(), why).toBe(0);
    await page.waitForTimeout(200);
  }
}

test.describe('the project evidence, read from the server', () => {
  test.describe.configure({ mode: 'serial' });

  let acct: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    acct = await seedStageProject({ prefix: 'engload', admin: true, acceptTerms: true, rich: true });
  });

  test('Analyze holds its loading state while the evidence is on its way, then draws the findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const chunks = await countEngineChunks(page);
    const gate = await gateEvidence(page, 'hold');
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    // The project has loaded (the evidence is only asked for once its source
    // is known), and the report still waits for it.
    await expect(page.getByText('Loading project data...')).toBeVisible();
    await staysAbsent(
      page,
      '[data-analysis-answer], [data-analysis-findings]',
      3000,
      'Analyze drew its report before the evidence had arrived',
    );
    await expect(page.locator('[data-analyze-evidence-failed]')).toHaveCount(0);

    gate.release();
    const answer = page.locator('[data-analysis-answer]');
    await expect(answer).toBeVisible({ timeout: 60000 });
    await expect(answer.locator('h2')).toContainText(/findings? to review in this code/);
    await expect(page.locator('[data-analysis-findings] [data-findings-group]').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('The evidence engine found nothing');
    await expect(page.getByText('Loading project data...')).toHaveCount(0);
    expect(chunks.count(), 'Analyze downloaded the evidence engine').toBe(0);
  });

  test('Analyze says the evidence could not be read, and claims no findings it never computed', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const gate = await gateEvidence(page, 'abort');
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    const failed = page.locator('[data-analyze-evidence-failed]');
    await expect(failed).toBeVisible({ timeout: 60000 });
    await expect(failed).toContainText('The evidence for this code could not be read');

    // No report drawn from evidence that is not there: no findings table, no
    // answer counting its findings, no "found nothing".
    await expect(page.locator('[data-analysis-findings]')).toHaveCount(0);
    await expect(page.locator('[data-analysis-answer]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('The evidence engine found nothing');
    await expect(page.locator('body')).not.toContainText(/\b0 findings\b|found nothing/);
    await expect(page.getByText('Loading project data...')).toHaveCount(0);
  });

  test('Transformation holds its opening state while the evidence is on its way, then counts the findings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const chunks = await countEngineChunks(page);
    const gate = await gateEvidence(page, 'hold');
    await page.goto(`/project/${acct.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    await expect(page.locator('[data-evidence-loading]')).toBeVisible({ timeout: 60000 });
    await staysAbsent(
      page,
      '[data-transformation-object-page], [data-transformation-evidence-failed]',
      3000,
      'Transformation drew its facets before the evidence had arrived',
    );

    gate.release();
    const objectPage = page.locator('[data-transformation-object-page]');
    await expect(objectPage).toBeVisible({ timeout: 60000 });
    // Counted from findings, not from none: the rich fixture has some.
    await expect(page.locator('[data-transformation-places]')).not.toHaveAttribute('data-transformation-places', '0');
    await expect(page.locator('[data-evidence-loading]')).toHaveCount(0);
    expect(chunks.count(), 'Transformation downloaded the evidence engine').toBe(0);
  });

  test('Transformation says the evidence could not be read, and draws no facets counted from none', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const gate = await gateEvidence(page, 'abort');
    await page.goto(`/project/${acct.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
    await gate.requested;

    const failed = page.locator('[data-transformation-evidence-failed]');
    await expect(failed).toBeVisible({ timeout: 60000 });
    await expect(failed).toContainText('The evidence for this code could not be read');
    await expect(page.locator('[data-transformation-object-page]')).toHaveCount(0);
    await expect(page.locator('[data-transformation-places]')).toHaveCount(0);
    // The source and the package beside it do not depend on the findings.
    await expect(failed.locator('#tf-side')).toBeVisible();
  });

  test('the workspace Public-Cloud-Fit card waits for the evidence, then sorts it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signInThroughForm(page, acct);

    const gate = await gateEvidence(page, 'hold');
    await page.goto(`/project/${acct.projectId}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toHaveAttribute('data-workspace-shell', 'management', {
      timeout: 60000,
    });
    await gate.requested;

    const card = page.locator('[data-public-cloud-fit-panel]');
    await expect(card).toHaveAttribute('data-public-cloud-fit-panel', 'loading', { timeout: 60000 });
    await staysAbsent(
      page,
      '[data-public-cloud-fit-panel="ready"], [data-public-cloud-fit-panel="empty"], [data-public-cloud-fit-panel="error"]',
      3000,
      'the card settled before the evidence had arrived',
    );

    gate.release();
    await expect(card).toHaveAttribute('data-public-cloud-fit-panel', 'ready', { timeout: 60000 });
  });

  test('the workspace Public-Cloud-Fit card reports a failed read as an error, not as no source', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signInThroughForm(page, acct);

    const gate = await gateEvidence(page, 'abort');
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
