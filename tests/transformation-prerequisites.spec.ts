import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminSetDoc } from './helpers/admin-seed';
import { generationPrerequisites } from '../lib/workflow-steps';

/**
 * The Transformation stage's run button never does nothing (owner report
 * 03.10.2026, v3.0.1).
 *
 * The owner opened Transformation on a project whose signed run was the
 * engine's alone — no model narrative — and which had no solution design. The
 * button ("Re-Run Engine") was enabled, its click handler checked
 * `project.solutionDesign && project.analysis` and returned without a word,
 * and the only explanation was a hover `title` that was not even set, because
 * `generationBlockers` covered staleness and nothing else.
 *
 * Every missing prerequisite is now a sentence on the page with one action
 * that resolves it, the button is disabled while one is missing, and a click
 * on an enabled button either starts the generation or says why it did not.
 * Checked at desktop width and at 390 px, because a reason that only fits a
 * desktop is a hover by another name.
 *
 * No model is called: the key is either absent (the model-off case) or the
 * generation is stopped by the contract or the proxy before any model runs.
 */

test.use({ baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const SHOT_DIR = process.env.SHOT_DIR || '';
const shot = async (page: Page, name: string) => {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
};

const SOURCE = `REPORT z_sales_order_creator.
DATA ls_vbak TYPE vbak.
SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = '0000000001'.
CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'.
COMMIT WORK.
`;
const NARRATIVE = JSON.stringify({ cleanCoreScore: 40, standardFit: { potential: 'Medium' } });
const DESIGN = '# Target architecture\n\nSide-by-side on SAP BTP.\n';

/** The project as the owner had it, varied by what is on record. */
async function seed(prefix: string, opts: { design: boolean; narrative: boolean }): Promise<SeededProject> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  await adminSetDoc('projects', account.projectId, {
    name: 'Z_SALES_ORDER_CREATOR',
    userId: account.uid,
    createdAt: new Date(),
    status: 'analyzed',
    legacyCode: SOURCE,
    cleanCoreScore: 40,
    activeRunId: account.runId,
    ...(opts.design ? { solutionDesign: DESIGN } : {}),
  });
  // An engine-only run stores the narrative key with an empty string
  // (`/api/runs/create`, `finalAnalysisText = analysis || ''`), and the run
  // wins over the project on hydration — so the empty string is the state.
  await adminSetDoc(`projects/${account.projectId}/runs`, account.runId, {
    runId: account.runId,
    projectId: account.projectId,
    userId: account.uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 40,
    analysis: opts.narrative ? NARRATIVE : '',
  });
  return account;
}

/** The stage as if a key were configured — the owner's situation; no model is reached. */
async function keyAvailable(page: Page) {
  await page.route('**/api/model-stages', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keyAvailable: true, keySource: 'community' }) }),
  );
}

async function openStage(page: Page, account: SeededProject) {
  await page.goto(`/project/${account.projectId}/transformation`);
  await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 60_000 });
}

/** The reason is on the page as text — not a title attribute — and its one action is there. */
async function expectReason(page: Page, id: string, words: RegExp, action: RegExp, href: RegExp) {
  const reason = page.locator(`[data-generation-prerequisite="${id}"]`);
  await expect(reason).toBeVisible();
  await expect(reason).toContainText(words);
  const link = reason.getByRole('link', { name: action });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', href);
  await expect(page.locator('[data-generate-code]')).toBeDisabled();
}

for (const width of [1280, 390] as const) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    // v3.0.1 (coordinator decision 03.10.2026): Design writes from the engine
    // evidence, so an engine-only run is led to Design like any other.
    test('no design and no narrative (the owner state): the reason and "Open Design"', async ({ page }) => {
      const account = await seed('tf-prereq-owner', { design: false, narrative: false });
      await keyAvailable(page);
      await signInThroughForm(page, account);
      await openStage(page, account);
      await shot(page, `owner-state-${width}`);
      await expectReason(page, 'design', /No solution design yet/, /Open Design/, new RegExp(`/project/${account.projectId}/design$`));
      await expect(page.locator('[data-generate-code]')).toHaveText(/Generate code/);
    });

    test('no design, narrative present: the reason and "Open Design"', async ({ page }) => {
      const account = await seed('tf-prereq-design', { design: false, narrative: true });
      await keyAvailable(page);
      await signInThroughForm(page, account);
      await openStage(page, account);
      await expectReason(page, 'design', /No solution design yet/, /Open Design/, new RegExp(`/project/${account.projectId}/design$`));
    });

    test('model off (no key on this server): said on the page, with a link to Settings', async ({ page }) => {
      const account = await seed('tf-prereq-model', { design: true, narrative: true });
      await page.route('**/api/model-stages', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keyAvailable: false, keySource: null }) }),
      );
      await signInThroughForm(page, account);
      await openStage(page, account);
      await shot(page, `model-off-${width}`);
      await expectReason(page, 'model', /Gemini API key/, /Open Settings/, /\/settings$/);
    });
  });
}

test('a design without a narrative is enough: the click starts or says why — never nothing', async ({ page }) => {
  const account = await seed('tf-prereq-click', { design: true, narrative: false });
  await keyAvailable(page);
  // Whatever the contract says, the model is never reached in this spec.
  await page.route('**/api/gemini**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The model is not available in this test.' }) }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 90_000 });
  // A design is on record, so nothing is missing: the first generation starts
  // on its own and ends in a visible answer — a contract refusal or the error.
  const answer = page.locator('[data-contract-refusal], [data-transformation-error]');
  await expect(answer.first()).toBeVisible({ timeout: 90_000 });
  await expect(answer.first()).not.toHaveText(/^\s*$/);
  await expect(page.locator('[data-generation-prerequisite]')).toHaveCount(0);
  await shot(page, 'click-answer-1280');

  // The enabled button, clicked: it asks the server again (the generation
  // started) and the stage answers again — nothing silent.
  const button = page.locator('[data-generate-code]');
  await expect(button).toBeEnabled();
  const asked = page.waitForRequest((r) => /\/api\/projects\/[^/]+\/contract$/.test(new URL(r.url()).pathname), { timeout: 30_000 });
  await button.click();
  await asked;
  await expect(answer.first()).toBeVisible({ timeout: 60_000 });
});

test('a generation that fails says so in the error strip, with Try again', async ({ page }) => {
  const account = await seed('tf-prereq-error', { design: true, narrative: false });
  await keyAvailable(page);
  // The contract allows the generation (stubbed: the fixture's run has no
  // input manifest), and the model proxy refuses — the thrown error has to
  // reach the screen.
  await page.route(/\/api\/projects\/[^/]+\/contract$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            contract: { fingerprint: 'f'.repeat(64) },
            decision: { ok: true, track: 'side-by-side-btp', isAbapCloud: false, sentence: 'Side-by-side, as the contract says.' },
            generation: { token: 't', inputs: { legacyCode: SOURCE, solutionDesign: DESIGN, analysis: '' } },
          }),
        })
      : route.continue(),
  );
  await page.route('**/api/gemini**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The model is not available in this test.' }) }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  const strip = page.locator('[data-transformation-error]');
  await expect(strip).toBeVisible({ timeout: 90_000 });
  await expect(strip).not.toHaveText(/^\s*$/);
  await expect(strip.getByRole('button', { name: /Try again/ })).toBeVisible();
  await shot(page, 'error-strip-390');
});

/**
 * The model's answer, read (owner report 03.10.2026): a complete answer that
 * was not readable JSON failed the generation on the first try and passed on
 * the second. The answers below are fixtures served in place of `/api/gemini`;
 * no model is called. The contract read and the store are stubbed too, so the
 * spec sees exactly what the page asks the server to store.
 */
test.describe('the model answer, read', () => {
  // The ABAP escape `\{` is in the content, as the model writes it.
  const CAP_PACKAGE = (filler = '') => ({
    files: [
      { path: 'srv/service.ts', content: `export const approve = () => true;\n${filler}` },
      { path: 'db/schema.cds', content: 'entity PurchaseOrder { key id : String; }' },
      { path: 'package.json', content: '{"name":"po-approval"}' },
      { path: 'Dockerfile', content: 'FROM node:22' },
      { path: 'erp-triggers/zcl_core_event_publisher.clas.abap', content: 'lv_payload = |\\{ "banfn": "{ iv_banfn }" \\}|.' },
    ],
    tests: { config: 'export default {};', spec: 'test("a", () => {});' },
  });

  /** The contract allows the generation; the store is captured and answered as the server would. */
  async function stubContract(page: Page): Promise<{ stores: string[] }> {
    const stores: string[] = [];
    await page.route(/\/api\/projects\/[^/]+\/contract$/, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            contract: { fingerprint: 'f'.repeat(64) },
            decision: { ok: true, track: 'side-by-side-btp', isAbapCloud: false, sentence: 'Side-by-side, as the contract says.' },
            generation: { token: 't', inputs: { legacyCode: SOURCE, solutionDesign: DESIGN, analysis: '' } },
          }),
        });
      }
      const body = route.request().postDataJSON() as { generatedCode: string; testSuite: unknown };
      stores.push(body.generatedCode);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fields: {
            generatedCode: body.generatedCode,
            testSuite: body.testSuite,
            status: 'transformed',
            generationBinding: { route: { chosen: 'side-by-side-btp' }, contractId: 'AC-1', contractFingerprint: 'f'.repeat(64) },
          },
        }),
      });
    });
    return { stores };
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

  async function open(page: Page, prefix: string) {
    const account = await seed(prefix, { design: true, narrative: false });
    await keyAvailable(page);
    return account;
  }

  test('an unreadable first answer is retried once, said in the log, and the second answer is stored', async ({ page }) => {
    const account = await open(page, 'tf-json-retry');
    const { stores } = await stubContract(page);
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    // Prose, then a fenced object that is broken inside (a missing value).
    const broken = 'Here is the package:\n```json\n{"files": [ {"path": "srv/service.ts", "content": } ], "tests": {}}\n```\nHope this helps.';
    const calls = await stubModel(page, [
      { status: 200, body: { text: broken } },
      { status: 200, body: { text: JSON.stringify(CAP_PACKAGE()) } },
    ], hold);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/transformation`);
    // The second call is held until the log has said it is being made.
    await expect(page.getByLabel('Generation log')).toContainText(/Retrying once — a second model call/, { timeout: 90_000 });
    await expect.poll(() => calls.n, { timeout: 10_000 }).toBe(2);
    release();
    await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 60_000 });
    await expect(page.locator('[data-transformation-error]')).toHaveCount(0);
    expect(calls.n).toBe(2);
    expect(stores).toHaveLength(1);
    expect(JSON.parse(stores[0])).toEqual(CAP_PACKAGE().files);
  });

  test('a fenced, large answer is stored on the first call, its ABAP escapes intact', async ({ page }) => {
    const account = await open(page, 'tf-json-fenced');
    const { stores } = await stubContract(page);
    // About 60 kB of code. The package the 668-line Z_MM_PO_APPROVAL produced
    // on 03.10.2026 measured 21,894 characters (7,370 output tokens).
    const big = CAP_PACKAGE('// filler line for size\n'.repeat(2500));
    // JSON.stringify writes the ABAP `\{` as `\\{`; the model wrote `\{` raw.
    const raw = JSON.stringify(big).split('\\\\{').join('\\{').split('\\\\}').join('\\}');
    expect(() => JSON.parse(raw)).toThrow();
    const fenced = '```json\n' + raw + '\n```';
    const calls = await stubModel(page, [{ status: 200, body: { text: fenced } }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/transformation`);
    await expect(page.locator('[data-transformation-answer="generated"]')).toBeAttached({ timeout: 90_000 });
    await expect(page.locator('[data-transformation-error]')).toHaveCount(0);
    expect(calls.n).toBe(1);
    expect(stores).toHaveLength(1);
    expect(JSON.parse(stores[0])).toEqual(big.files);
  });

  test('an answer cut off at the length limit, twice, says so and stores nothing', async ({ page }) => {
    const account = await open(page, 'tf-json-truncated');
    const { stores } = await stubContract(page);
    // What `/api/gemini` answers when the provider reports MAX_TOKENS.
    const calls = await stubModel(page, [{
      status: 502,
      body: { error: 'The model stopped before finishing its answer because it reached its output limit (model-incomplete).', code: 'model-incomplete', reason: 'truncated' },
    }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/transformation`);
    const strip = page.locator('[data-transformation-error]');
    await expect(strip).toBeVisible({ timeout: 90_000 });
    await expect(strip).toContainText("The answer was cut off at the model's length limit");
    await expect(strip).toContainText('Nothing was saved — the previous version is untouched.');
    await expect(strip).not.toContainText(/text instead of/i);
    expect(calls.n).toBe(2);
    expect(stores).toHaveLength(0);
  });

  test('invalid JSON, twice, is reported as prose and stores nothing', async ({ page }) => {
    const account = await open(page, 'tf-json-prose');
    const { stores } = await stubContract(page);
    const calls = await stubModel(page, [{ status: 200, body: { text: '{"files": [ this is not json ], "tests": }' } }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/transformation`);
    const strip = page.locator('[data-transformation-error]');
    await expect(strip).toBeVisible({ timeout: 90_000 });
    await expect(strip).toContainText('The model returned prose instead of the JSON package');
    await expect(strip).toContainText('Nothing was saved');
    await expect(strip.getByRole('button', { name: /Try again/ })).toBeVisible();
    expect(calls.n).toBe(2);
    expect(stores).toHaveLength(0);
  });
});

test.describe('generationPrerequisites', () => {
  const base = { legacyCode: 'REPORT z.', activeRunId: 'r' } as Record<string, unknown>;

  test('a missing design names Design, with a narrative or without one (v3.0.1: Design writes from the engine evidence)', () => {
    const noNarrative = generationPrerequisites({ ...base, analysis: '' } as never, 'transformation');
    expect(noNarrative.map((p) => [p.id, p.action.stage, p.action.label])).toEqual([['design', 'design', 'Open Design']]);
    const withNarrative = generationPrerequisites({ ...base, analysis: '{"a":1}' } as never, 'transformation');
    expect(withNarrative.map((p) => [p.id, p.action.stage, p.action.label])).toEqual([['design', 'design', 'Open Design']]);
  });

  test('the narrative is not required once a design is on record', () => {
    expect(generationPrerequisites({ ...base, analysis: '', solutionDesign: 'D' } as never, 'transformation')).toEqual([]);
  });

  test('no source is the one reason; testing also needs code; documentation needs neither design nor code', () => {
    expect(generationPrerequisites({} as never, 'transformation').map((p) => p.id)).toEqual(['source']);
    expect(generationPrerequisites({ ...base, solutionDesign: 'D' } as never, 'testing').map((p) => p.id)).toEqual(['code']);
    expect(generationPrerequisites({ ...base } as never, 'documentation')).toEqual([]);
    expect(generationPrerequisites(null, 'transformation')).toEqual([]);
  });

  test('the page has no silent guard left and no hover-only reason', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('Re-Run Engine');
    expect(code).not.toMatch(/project\?\.solutionDesign && project\?\.analysis/);
    // The generate button carries no title: its reason is on the page.
    const at = code.indexOf('data-generate-code');
    expect(at).toBeGreaterThan(-1);
    const button = code.slice(code.lastIndexOf('<CcButton', at), code.indexOf('{generateLabel}', at));
    expect(button).not.toMatch(/\btitle=/);
  });
});
