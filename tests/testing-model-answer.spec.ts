import { test, expect, type Page } from '@playwright/test';
import { adminGetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';

/**
 * The Testing stage reads the model's answer to the Transformation stage's
 * standard (owner report 03.10.2026, `lib/model-json.ts`): one fence, prose
 * around the object and the ABAP escape `\{` inside a string are tolerated; an
 * answer that is still unusable gets one automatic second call; a refusal a
 * second call cannot fix (content filter) gets none; and nothing is stored from
 * a failed attempt — the suite that was there stays.
 *
 * The answers are fixtures served in place of `/api/gemini`; no model is
 * called. The seeded project carries one stored scenario (`t1`), which is the
 * "previous version" every failure has to leave untouched.
 */

test.describe.configure({ mode: 'serial' });

const SUITE = {
  testCases: [
    { id: 'TC_01', name: 'Accept a valid claim', category: 'Unit', description: 'A claim under the limit is accepted.', priority: 'High' },
    { id: 'TC_02', name: 'Reject a claim over the limit', category: 'Unit', description: 'A claim over the limit is rejected.', priority: 'Medium' },
  ],
  // The ABAP escape, as the source says it: a backslash before the brace.
  testSuite: { code: 'lv_json = |\\{ "claim": 1 \\}|.' },
  manualTestingRequirements: [{ area: 'Authority checks', reason: 'Not reachable here.', verificationSteps: ['Run in the tenant'] }],
  coverageEstimate: { percentage: 60, explanation: 'Core rule covered.', missingCoverage: 'Authority checks.' },
};

async function stageMayGenerate(page: Page) {
  await page.route('**/api/model-stages*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true },
        keyAvailable: true,
        keySource: 'community',
      }),
    }),
  );
}

/** Serves the answers in order, one per call (the last one repeats); counts the calls. */
async function stubModel(page: Page, answers: Array<{ status: number; body: unknown }>, hold?: Promise<void>) {
  const calls = { n: 0 };
  await page.route('**/api/gemini**', async (route) => {
    const i = calls.n++;
    if (i > 0 && hold) await hold;
    const a = answers[Math.min(i, answers.length - 1)];
    await route.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) });
  });
  return calls;
}

async function regenerate(page: Page, account: SeededProject) {
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/testing`, { waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: /^Regenerate Suite$/ });
  await expect(button).toBeEnabled({ timeout: 90_000 });
  await button.click();
}

async function storedIds(projectId: string): Promise<string[]> {
  const p = await adminGetDoc('projects', projectId);
  return ((p?.testCases ?? []) as Array<{ id: string }>).map((t) => t.id);
}

test('an unreadable first answer is retried once, said on the page, and the second answer is stored with its ABAP escapes', async ({ page }) => {
  test.setTimeout(240_000);
  const account = await seedStageProject({ prefix: 'tst-json-retry', acceptTerms: true });
  await stageMayGenerate(page);
  let release!: () => void;
  const hold = new Promise<void>((r) => { release = r; });
  // The JSON.stringify of SUITE writes `\\{`; the model writes `\{` raw.
  const raw = JSON.stringify(SUITE).split('\\\\{').join('\\{').split('\\\\}').join('\\}');
  expect(() => JSON.parse(raw)).toThrow();
  const calls = await stubModel(page, [
    { status: 200, body: { text: 'Here are the tests:\n```json\n{"testCases": [ {"id": } ]}\n```' } },
    { status: 200, body: { text: 'Here is the suite:\n```json\n' + raw + '\n```' } },
  ], hold);
  await page.setViewportSize({ width: 1280, height: 900 });
  await regenerate(page, account);
  // The second call is held until the page has said it is being made.
  await expect(page.locator('[data-test-generation-retry]')).toContainText(/Retrying once — a second model call/, { timeout: 60_000 });
  await expect(page.locator('[data-test-generation-retry]')).toContainText('JSON test suite');
  await expect.poll(() => calls.n, { timeout: 10_000 }).toBe(2);
  release();
  await expect(page.locator('[data-scenario-row][data-scenario-id="TC_02"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-test-generation-error]')).toHaveCount(0);
  await expect(page.locator('[data-test-generation-retry]')).toHaveCount(0);
  expect(calls.n).toBe(2);
  await expect.poll(() => storedIds(account.projectId), { timeout: 20_000 }).toEqual(['TC_01', 'TC_02']);
  const stored = await adminGetDoc('projects', account.projectId);
  expect((stored?.testSuite as { code: string }).code).toBe('lv_json = |\\{ "claim": 1 \\}|.');
});

test('an answer cut off at the length limit, twice, says so and stores nothing', async ({ page }) => {
  test.setTimeout(240_000);
  const account = await seedStageProject({ prefix: 'tst-json-trunc', acceptTerms: true });
  await stageMayGenerate(page);
  const calls = await stubModel(page, [{
    status: 502,
    body: { error: 'The model stopped before finishing its answer because it reached its output limit (model-incomplete).', code: 'model-incomplete', reason: 'truncated' },
  }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await regenerate(page, account);
  const strip = page.locator('[data-test-generation-error]');
  await expect(strip).toBeVisible({ timeout: 60_000 });
  await expect(strip).toContainText("The answer was cut off at the model's length limit");
  await expect(strip).toContainText('both attempts');
  await expect(strip).toContainText('Nothing was saved — the previous version is untouched.');
  expect(calls.n).toBe(2);
  expect(await storedIds(account.projectId)).toEqual(['t1']);
});

test('invalid JSON twice is reported as prose; a content-filter block is not retried', async ({ page }) => {
  test.setTimeout(240_000);
  const account = await seedStageProject({ prefix: 'tst-json-prose', acceptTerms: true });
  await stageMayGenerate(page);
  const calls = await stubModel(page, [{ status: 200, body: { text: '{"testCases": [ this is not json ], "testSuite": }' } }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await regenerate(page, account);
  const strip = page.locator('[data-test-generation-error]');
  await expect(strip).toBeVisible({ timeout: 60_000 });
  await expect(strip).toContainText('The model returned prose instead of the JSON test suite');
  await expect(strip).toContainText('Nothing was saved');
  expect(calls.n).toBe(2);
  expect(await storedIds(account.projectId)).toEqual(['t1']);

  // The same filter meets the same prompt: one call, its own message, nothing stored.
  await page.unroute('**/api/gemini**');
  const filtered = await stubModel(page, [{
    status: 502,
    body: { error: 'The model provider blocked this answer (model-incomplete).', code: 'model-incomplete', reason: 'filtered' },
  }]);
  await page.getByRole('button', { name: /^Regenerate Suite$/ }).click();
  await expect(strip).toContainText('blocked this answer', { timeout: 60_000 });
  expect(filtered.n).toBe(1);
  expect(await storedIds(account.projectId)).toEqual(['t1']);
});

test('an answer without a single scenario is refused before the write', async ({ page }) => {
  test.setTimeout(240_000);
  const account = await seedStageProject({ prefix: 'tst-json-empty', acceptTerms: true });
  await stageMayGenerate(page);
  const calls = await stubModel(page, [{ status: 200, body: { text: JSON.stringify({ ...SUITE, testCases: [] }) } }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await regenerate(page, account);
  const strip = page.locator('[data-test-generation-error]');
  await expect(strip).toBeVisible({ timeout: 60_000 });
  await expect(strip).toContainText('without a single test scenario');
  await expect(strip).toContainText('Nothing was saved — the previous version is untouched.');
  expect(calls.n).toBe(1);
  expect(await storedIds(account.projectId)).toEqual(['t1']);
  await expect(page.locator('[data-scenario-row][data-scenario-id="t1"]')).toBeVisible();
});
