import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import {
  analysisAnswer,
  countFindings,
  dataEffect,
  dataEffectParts,
  dataEffectSentence,
  findingTitle,
  groupEvidenceFindings,
  plainRoute,
} from '../components/analyze/analysis-answer';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * The Analyze stage as a tool page (mockup s8 frame, s4 findings; ADR-029,
 * ADR-050, DESIGN.md §2.11).
 *
 *   - the answer comes first: one sentence, one sentence on what the code
 *     writes, and three figures, before any table (owner 10.10.2026: the
 *     severity spread, the open count and the model pointer are not repeated
 *     in prose — the facet, the side card and the fold say them);
 *   - the Clean Core Score is "a grade, not a compliance percentage" — no
 *     "Compliance" label, no percentage, no ring;
 *   - everything this analysis could not determine is one list with a count —
 *     the side card "Not determined" — each entry with its reason, its detail
 *     one action deeper (owner decision 02.10.2026: one place, not three);
 *   - in the workspace there is no "Continue to Design" and no sticky bar.
 */
const ROOT = path.resolve(__dirname, '..');
const PAGE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const finding = (over: Partial<EvidenceFinding>): EvidenceFinding => ({
  id: 'f', kind: 'standard-table-write', title: 'Direct Write to SAP Standard Table EBAN', severity: 'Critical',
  confidence: 'High', source: 'static-parser', objectName: 'EBAN', lineStart: 1, snippet: 'UPDATE eban',
  technicalDetail: '', cleanCoreImpact: '', recommendation: '', targetOptions: [], ...over,
});

test.describe('the answer, in words', () => {
  test('counts one row per pattern and object, as the table lists them', () => {
    const groups = groupEvidenceFindings([
      finding({ lineStart: 246 }),
      finding({ lineStart: 455, snippet: 'UPDATE eban SET x' }),
      finding({ kind: 'bdc', title: 'BDC to ME21N', severity: 'High', objectName: 'ME21N', lineStart: 631 }),
      finding({ kind: 'standard-table-read', title: 'Read EBAN', severity: 'Medium', lineStart: 61 }),
    ]);
    expect(groups.map((g) => g.lines)).toEqual([[246, 455], [631], [61]]);
    expect(countFindings(groups)).toEqual({ total: 3, bySeverity: { Critical: 1, High: 1, Medium: 1, Low: 0 } });
  });

  test('says the findings and the route in one sentence — no spread, no open count, no percentage', () => {
    const counts = { total: 25, bySeverity: { Critical: 1, High: 3, Medium: 16, Low: 4 } };
    const a = analysisAnswer({ counts, lines: 669, route: 'Side-by-Side (SAP BTP)', routeChosenByReader: false });
    expect(a.headline).toBe('25 findings to review in this code — 1 critical and 3 high');
    expect(a.detail).toBe(
      'The engine read all 669 lines without a model; by fixed rules, the recommended target is a side-by-side extension on SAP BTP, part of the SAP Business AI Platform.',
    );
    // Said once each elsewhere (DESIGN.md §2.11): the Findings facet's bar, the
    // side card "Not determined", the folded Model summary.
    expect(a.detail).not.toMatch(/16 medium|informational|could not determine|Model summary/);
    expect(a.detail.match(/\. /g) ?? [], 'one sentence').toHaveLength(0);
    expect(`${a.headline} ${a.detail}`).not.toMatch(/%|compliance/i);
  });

  test("a route an earlier build's switch stored is said to be the reader's", () => {
    const counts = { total: 1, bySeverity: { Critical: 0, High: 0, Medium: 1, Low: 0 } };
    const a = analysisAnswer({ counts, lines: 10, route: 'In-App (ABAP Cloud)', routeChosenByReader: true });
    expect(a.detail).toContain('you chose on-stack ABAP Cloud inside S/4HANA as its target');
  });

  test('no finding is not a clean bill, and no route is said as missing', () => {
    const counts = { total: 0, bySeverity: { Critical: 0, High: 0, Medium: 0, Low: 0 } };
    const a = analysisAnswer({ counts, lines: 0, route: null, routeChosenByReader: false });
    expect(a.detail).toContain('not a clean bill');
    expect(a.detail).toContain('no extensibility route has been determined');
    expect(plainRoute('Something else')).toBeNull();
  });

  test('the data effect: the tables written, by kind, each a chip for its group — read off the findings only', () => {
    const effect = dataEffect([
      finding({ lineStart: 246 }),
      finding({ lineStart: 455 }),
      finding({ kind: 'custom-table-write', title: 'Write ZMM_PO_APPR', severity: 'High', objectName: 'zmm_po_appr', lineStart: 450 }),
      finding({ kind: 'custom-table-write', title: 'Write ZMM_PO_ATTACH', severity: 'High', objectName: 'ZMM_PO_ATTACH', lineStart: 647 }),
      finding({ kind: 'standard-table-read', title: 'Read LFA1', severity: 'Medium', objectName: 'LFA1', lineStart: 146 }),
    ]);
    expect(effect).toEqual({ standard: ['EBAN'], custom: ['ZMM_PO_APPR', 'ZMM_PO_ATTACH'] });
    expect(dataEffectSentence(effect)).toBe('It writes to 1 SAP standard table (EBAN) and 2 custom tables (ZMM_PO_APPR, ZMM_PO_ATTACH).');
    const chips = dataEffectParts(effect).filter((p): p is { table: string; kind: string } => 'table' in p);
    expect(chips).toEqual([
      { table: 'EBAN', kind: 'standard-table-write' },
      { table: 'ZMM_PO_APPR', kind: 'custom-table-write' },
      { table: 'ZMM_PO_ATTACH', kind: 'custom-table-write' },
    ]);
    // Five names, four shown, the rest counted — never dropped in silence.
    const many = dataEffect(['A', 'B', 'C', 'D', 'E'].map((n, i) => finding({ objectName: n, lineStart: i + 1 })));
    expect(dataEffectSentence(many)).toBe('It writes to 5 SAP standard tables (A, B, C, D and 1 more).');
    // No write found is said within what the engine checks, not as a property of the program.
    expect(dataEffectSentence(dataEffect([]))).toBe('In what it checks, the engine found no write to a database table.');
  });

  test('the severity is not said twice in a title', () => {
    expect(findingTitle('CRITICAL: Direct Write to SAP Standard Table EBAN')).toBe('Direct Write to SAP Standard Table EBAN');
    expect(findingTitle('Direct Read')).toBe('Direct Read');
  });
});

test.describe('the page, read', () => {
  test('no compliance percentage, no report-card leftovers, the shared footer', () => {
    const src = read(PAGE);
    expect(src).not.toMatch(/['">]\s*Compliance:?\s*['"<]/);
    expect(src).not.toContain('Explore all 4 report sections');
    expect(src).not.toContain('Business Analysis Report');
    expect(src).not.toContain('<CcTabs');
    expect(src).toContain('<StageFooter');
    // The sticky bar with "Continue to Design" was for accounts without the
    // workspace; since roadmap 3.0.1 (ADR-061) there are none, and it is gone.
    expect(src).not.toContain('Continue to Design');
    expect(src).not.toContain('isSticky');
    // One place for all that is not determined: the side card, drawn by one component.
    expect(src).not.toContain('id="analysis-not-determined"');
    expect(src).not.toContain('could not determine`}');
    expect(read('components/analyze/NotDeterminedSide.tsx').match(/id="analysis-not-determined"/g) ?? []).toHaveLength(1);
    expect(read('components/analyze/PlainEnglishGuide.tsx')).not.toMatch(/Executive Summary|Plain English Guide|Business Roadmap/);
  });
});

test.describe('the page, rendered in the workspace', () => {
  test.describe.configure({ mode: 'serial' });

  test('answer first, a grade not a percentage, the open items listed once with their reasons', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const acct = await seedStageProject({ prefix: 'anlzanswer', admin: true, acceptTerms: true, rich: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze?view=it&from=workspace-tools`, { waitUntil: 'domcontentloaded' });

    const answer = page.locator('[data-analysis-answer]');
    await expect(answer).toBeVisible({ timeout: 90000 });
    await expect(answer.locator('h2')).toContainText(/findings? to review in this code|found nothing/);
    await expect(answer).toContainText('A grade, not a compliance percentage');
    await expect(answer).toContainText(/Clean Core Score\s*\n?\s*62 of 100/i);

    // The answer stands above the findings; what is not determined stands
    // beside them, in the side column, and nowhere else.
    const order = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
      return {
        answer: top('[data-analysis-answer]'),
        findings: top('[data-analysis-findings]'),
        openInFindings: !!document.querySelector('[data-analysis-findings] [data-analysis-not-determined]'),
      };
    });
    expect(order.answer).toBeGreaterThan(0);
    expect(order.answer).toBeLessThan(order.findings);
    expect(order.openInFindings).toBe(true);

    const body = page.locator('body');
    await expect(body).not.toContainText(/\d+\s*%\s*Compliance|Compliance:/i);
    await expect(body).not.toContainText(/Proceed to |Continue to /);
    await expect(body).not.toContainText('Business Analysis Report');

    // One list, its count in the card's title row and on the figure.
    const open = page.locator('[data-analysis-not-determined]');
    await expect(open).toHaveCount(1);
    const n = Number(await open.getAttribute('data-analysis-not-determined'));
    expect(n).toBeGreaterThan(0);
    await expect(open.locator('h2')).toHaveText('Not determined');
    // The answer no longer repeats the count as a facet of its own (ADR-081:
    // the duplicate Analyze facet went) — the side card is the one place.
    await expect(answer).not.toContainText(/\d+ things? not determined/);
    const items = open.locator('[data-not-determined-item]');
    await expect(items).toHaveCount(n);

    // Every entry carries its reason in plain sight; the panel behind it is one action deeper.
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      await expect(item.locator(':scope > h3')).toBeVisible();
      await expect(item.locator(':scope > h3')).not.toBeEmpty();
      expect((await item.locator(':scope > p').innerText()).length).toBeGreaterThan(20);
    }
    const details = open.locator('[data-not-determined-detail]');
    if ((await details.count()) > 0) {
      const trigger = details.first().locator('[data-cc-disclosure-trigger]').first();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    }

    // No "Show the list" on the answer any more: the facet it belonged to is gone.
    await expect(answer.getByRole('button', { name: 'Show the list' })).toHaveCount(0);
  });

  test('a phone reads it without sideways scrolling', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const acct = await seedStageProject({ prefix: 'anlzphone', admin: true, acceptTerms: true, rich: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/project/${acct.projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analysis-answer]')).toBeVisible({ timeout: 90000 });
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(0);
  });
});
