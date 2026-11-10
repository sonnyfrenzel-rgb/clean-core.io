import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * The Analyze stage answers four questions, each once (owner decision
 * 02.10.2026): how clean is the code (the score), what must change and where
 * (the findings at their lines), which way (the route), what is not known (not
 * determined). Since 3.0 the page had about twenty sections and said several
 * things two or three times — not determined three times, the route three
 * times, the findings twice, the second time as a model's "Gaps Prioritization
 * Matrix" with mostly empty quadrants.
 *
 * Now: the score as the hero on top (ADR-093, 11.10.2026), with its four
 * facets, then the findings; the route and what is not determined
 * in the side column, once each — two cards (10.10.2026: the severity donut
 * went, the route switch went, and the route card's one action is the
 * decision in Management); below, two folded sections — the model's
 * summary and the technical detail. The business value assessment and action
 * plan moved to Economics. The two optional imports are small actions that open
 * their upload in a dialog. The real page and the demo share the structure.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const PAGE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const DEMO = 'components/demo/DemoAnalyze.tsx';
const TCO = 'app/(app)/project/[projectId]/tco/page.tsx';

test.describe('the stage, read', () => {
  test('no worklist, no gaps matrix, no business value fold on Analyze — real page or demo', () => {
    for (const rel of [PAGE, DEMO]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/<GapsWorklist\b|import GapsWorklist/);
      expect(src, rel).not.toMatch(/<BusinessValueAudit\b|<PlainEnglishGuide\b/);
      expect(src, rel).not.toContain('data-stage-output="worklist"');
      expect(src, rel).not.toMatch(/title="Why this route — decision path/);
      // One side card for not determined, one fold each for the summary and the detail.
      expect(src, rel).toMatch(/<NotDeterminedSide\s+items=\{openItems\}(\s+questions=\{questionsLine\})?\s+summary=\{[\s\S]*?\}\s*\/>/);
      expect(src.match(/<NotDeterminedSide\b/g)?.length, rel).toBe(rel === PAGE ? 2 : 1);
      expect(src, rel).toMatch(/title="Technical detail"/);
      expect(src, rel).toMatch(/title="Model summary"/);
      // The big upload panels are gone.
      expect(src, rel).not.toMatch(/>Add Usage Data<|>Add ATC Results</);
    }
    // The business value and its action plan are read on Economics.
    expect(read(TCO)).toContain('<BusinessValuePlan analysis={project?.analysis}');
    expect(read('components/tco/BusinessValuePlan.tsx')).toMatch(/readStoredAnalysis<AnalysisData>\(analysis\)/);
  });

  test('the status line is folded into the score hero, in the real page and in the demo', () => {
    // ADR-093 (owner approval 11.10.2026): Evidence, Run and Target are the
    // score's provenance (H3, H4) — "no model involved", the signed run or
    // "Demo — never signed", engine, file, catalog, target — and "Successors
    // n of m" is a column of Findings by kind, per kind. Nothing of it is lost.
    for (const rel of [PAGE, DEMO]) {
      expect([...read(rel).matchAll(/\{ key: '(\w+)', label: '\w+', value:/g)], rel).toHaveLength(0);
      expect(read(rel), rel).toMatch(/provenance[=:]\s*\{/);
    }
    const hero = read('components/analyze/CleanCoreScoreSection.tsx');
    expect(hero).toContain('no model involved');
    expect(hero).toContain('Demo — never signed');
    expect(hero).toContain('provenance.target');
    expect(read(DEMO)).toMatch(/run: null,\s*demo: true,/);
    expect(read('components/analyze/EvidenceFindingsTable.tsx')).toContain('with successor');
  });

  test('one route card, shared; no route switch; the next action is the decision in Management', () => {
    for (const rel of [PAGE, DEMO]) {
      const src = read(rel);
      expect(src, rel).toMatch(/<RouteCard\b/);
      expect(src, rel).not.toMatch(/data-route-switch|Switch to ABAP Cloud|Not the route you want/);
      expect(src, rel).not.toMatch(/>\s*Open Design\s*</);
    }
    // The page writes `extensibilityRoute` only through the run, never from the browser.
    expect(read(PAGE)).not.toMatch(/updateDoc\([^)]*\{\s*extensibilityRoute/);
    const card = read('components/analyze/RouteCard.tsx');
    expect(card).toContain('Decide in Management');
    expect(card).not.toMatch(/updateDoc|setDoc|data-route-switch/);
    expect(read(PAGE)).toContain('?view=management#decision-card');
    expect(read(DEMO)).toContain('decideHref="/demo/workspace?view=management"');
  });

  test('the side column has two cards: the route and what is not determined — no severity donut', () => {
    const table = read('components/analyze/EvidenceFindingsTable.tsx');
    expect(table).not.toMatch(/SeverityDonut|title="Severity"/);
    expect(table).toContain('aria-label="Route and what is open"');
  });
});

/** The four answers, each once; the two folds closed. */
async function expectOnePlaceEach(page: Page) {
  await expect(page.locator('[data-analysis-answer]')).toHaveCount(1);
  await expect(page.locator('[data-analyze-score]').first()).toBeVisible();
  await expect(page.locator('[data-analysis-findings]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Extensibility route' })).toHaveCount(1);
  await expect(page.locator('[data-analysis-not-determined]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Not determined' })).toHaveCount(1);
  const body = page.locator('body');
  await expect(body).not.toContainText('Gaps Prioritization Matrix');
  // The old section at the end ("N things this analysis could not determine · Show") is gone.
  await expect(page.locator('[data-cc-disclosure-trigger]', { hasText: 'could not determine' })).toHaveCount(0);
  await expect(page.locator('[data-gaps-worklist], [data-stage-output="worklist"]')).toHaveCount(0);
  await expect(page.locator('[data-business-value-plan], [data-action-plan-origin]')).toHaveCount(0);

  for (const id of ['analyze-summary', 'analyze-technical-detail']) {
    const section = page.locator(`#${id}`);
    await expect(section, id).toHaveCount(1);
    const trigger = section.locator('[data-cc-disclosure-trigger]').first();
    await expect(trigger, `${id} is folded by default`).toHaveAttribute('aria-expanded', 'false');
    await expect(section.locator('[data-cc-disclosure-region]').first()).toBeHidden();
  }
  await expect(page.locator('#analyze-summary [data-cc-disclosure-trigger]').first()).toContainText('Model summary');
  await expect(page.locator('#analyze-technical-detail [data-cc-disclosure-trigger]').first()).toContainText('Technical detail');

  // Opened, the technical detail holds the parts it gathered.
  // Clicked until it says it is open: the demo renders before it hydrates.
  const detailTrigger = page.locator('#analyze-technical-detail [data-cc-disclosure-trigger]').first();
  await expect(async () => {
    await detailTrigger.click();
    await expect(detailTrigger).toHaveAttribute('aria-expanded', 'true', { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  const detail = page.locator('#analyze-technical-detail');
  await expect(detail.getByRole('heading', { level: 3, name: 'Language constructs the engine resolved' })).toBeVisible();
  // The meters left Analyze (ADR-093, owner decision Q3); the inventory and the
  // data coupling are the IT view's, linked from here (Q4).
  await expect(detail.getByRole('heading', { level: 3, name: 'Complexity and criticality' })).toHaveCount(0);
  await expect(detail.locator('[data-analyze-objects-link] a')).toHaveAttribute('href', /view=it#it-objects$/);
}

test.describe('the stage, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  test('a real project: each answer once, two folds, the imports in dialogs, business value on Economics', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const acct = await seedStageProject({ prefix: 'anlzone', admin: true, acceptTerms: true, rich: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze?view=it&from=workspace-tools`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analysis-answer]')).toBeVisible({ timeout: 90000 });

    await expectOnePlaceEach(page);
    // The model's summary says whose it is while it is closed.
    await expect(page.locator('#analyze-summary')).toContainText('AI-generated');

    // The route explains its decision path one action deeper; there is no
    // switch, and the one next action is the decision in Management.
    const why = page.locator('[data-route-why]');
    await expect(why).toHaveCount(1);
    await why.locator('[data-cc-disclosure-trigger]').first().click();
    await expect(page.locator('[data-route-switch], [data-route-override]')).toHaveCount(0);
    const next = page.locator('[data-route-next] a');
    await expect(next).toHaveText(/Decide in Management/);
    await expect(next).toHaveAttribute('href', new RegExp(`/project/${acct.projectId}\\?view=management#decision-card$`));
    // Two cards in the side column, not three.
    await expect(page.locator('aside[aria-label="Route and what is open"] > section')).toHaveCount(2);

    // The two optional imports: one "Add evidence" menu (ADR-093, owner decision
    // Q5), each item opening its upload in a dialog.
    await page.locator('[data-analyze-add-evidence]').click();
    await page.locator('[data-analyze-add-usage]').click();
    const usage = page.getByRole('dialog', { name: 'Add usage data' });
    await expect(usage).toBeVisible();
    await expect(usage.locator('[data-analyze-usage-dialog]')).toBeVisible();
    await usage.getByRole('button', { name: 'Close' }).last().click();
    await expect(usage).toBeHidden();
    await page.locator('[data-analyze-add-evidence]').click();
    await page.locator('[data-analyze-add-atc]').click();
    const atc = page.getByRole('dialog', { name: 'Add ATC results' });
    await expect(atc).toBeVisible();
    await expect(atc.locator('[data-analyze-atc-dialog]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(atc).toBeHidden();

    // Business value and the action plan: on Economics, folded, marked as the model's.
    await page.goto(`/project/${acct.projectId}/tco`, { waitUntil: 'domcontentloaded' });
    const plan = page.locator('[data-business-value-plan]');
    await expect(plan).toHaveCount(1, { timeout: 90000 });
    await expect(plan).toHaveAttribute('id', 'economics-business-value');
    const trigger = plan.locator('[data-cc-disclosure-trigger]').first();
    await expect(trigger).toContainText('Business value and action plan');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(plan).toContainText('AI-generated');
    await trigger.click();
    await expect(plan.locator('[data-action-plan-origin]')).toBeVisible();
    await expect(plan).toContainText('Legacy Asset Value');
    await expect(plan.locator('[data-money-not-determined]').first()).toBeVisible();
  });

  test('the demo: the same structure', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo/analyze', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-analyze]')).toBeVisible({ timeout: 120000 });
    await expectOnePlaceEach(page);
  });
});
