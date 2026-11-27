import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { ANALYZE_IT_IDS, analyzeItAnchors, changeRisks, itAnswer, lineAnchorText, mainSequence } from '../lib/analyze-it';
import { PAGE_ANCHOR_MAX } from '../lib/page-anchors';
import { scoreBand } from '../lib/clean-core-score';
import type { ScoreHeroModel } from '../lib/score-hero';

/**
 * Analyze, IT — one page, code first (3.5.0, AB-9; ADR-140; the IT page of `docs/roadmap/analyze-family-mockup.html`).
 * The first half is server-free (the rules and the source); the second opens the page and needs the server and the
 * emulators (`npx playwright test tests/analyze-it-one-page.spec.ts`).
 */

const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const model = (over: Partial<ScoreHeroModel> = {}): ScoreHeroModel => ({
  deductions: [
    { kind: 'standard-table-write', label: 'Writes straight into an SAP standard table', count: 1, points: 20, objects: ['EBAN'], lines: [240, 241, 243], first: 20, additional: 5, cap: 40, capped: false, unreachable: null },
    { kind: 'batch-input', label: 'Runs a transaction by batch input', count: 1, points: 10, objects: ['ME21N'], lines: [515], first: 10, additional: 5, cap: 20, capped: false, unreachable: null },
    { kind: 'unreleased-call', label: 'Calls an SAP class that is not released', count: 1, points: 5, objects: ['CL_MM_INTERNAL'], lines: [292], first: 5, additional: 2, cap: 15, capped: false, unreachable: null },
  ],
  free: null,
  notAssessed: { kinds: 2, places: 3, points: 20, gaps: [] } as unknown as ScoreHeroModel['notAssessed'],
  deducted: 35,
  codeScore: 65,
  score: 45,
  floored: false,
  largest: null,
  ...over,
});

test.describe('the rules of the page (server-free)', () => {
  test('the answer: the band and the score in one sentence, the two largest deductions as its why, with their lines', () => {
    const a = itAnswer({ score: 45, model: model(), findings: 26 });
    expect(a.answer).toBe(
      'Far from clean core: 45 of 100. Writes straight into an SAP standard table and runs a transaction by batch input carry most of the distance.',
    );
    expect(a.why.map((w) => [w.text, w.points, w.line, w.lineEnd])).toEqual([
      ['writes straight into an SAP standard table', 20, 240, 243],
      ['runs a transaction by batch input', 10, 515, null],
    ]);
    expect(a.notAssessedPoints).toBe(20);
    // Where the deductions do not add up to the signed score, the answer says only what is known.
    expect(itAnswer({ score: 62, model: model(), findings: 26 })).toEqual({ answer: `${scoreBand(62).label}: 62 of 100.`, why: [], notAssessedPoints: 0 });
    expect(itAnswer({ score: null, model: null, findings: 0 }).answer).toMatch(/^No score yet/);
  });

  test('one line-anchor notation (Q11): "line 42", "line 240–243"', () => {
    expect(lineAnchorText(42)).toBe('line 42');
    expect(lineAnchorText(240, 243)).toBe('line 240–243');
    expect(lineAnchorText(42, 42)).toBe('line 42');
    // The IT components write no `L42` any more.
    for (const rel of ['components/analyze/AnalyzeIt.tsx', 'components/analyze/ItTouches.tsx', 'components/analyze/EvidenceFindingsTable.tsx', 'components/analyze/FindingsFocus.tsx', 'components/analyze/CleanCoreScoreSection.tsx', 'components/analyze/RouteCard.tsx']) {
      expect(code(rel), rel).not.toMatch(/`L\$\{/);
    }
  });

  test('no internal id on the page (Q2): no finding id, no node id', () => {
    for (const rel of ['components/analyze/AnalyzeIt.tsx', 'components/analyze/ItTouches.tsx', 'components/analyze/EvidenceFindingsTable.tsx', 'components/analyze/FindingsFocus.tsx', 'components/analyze/SourcePanel.tsx']) {
      expect(code(rel), rel).not.toMatch(/\{ef\.id\}|\{node\.id\}|\{f\.id\}/);
    }
  });

  test('the bar names at most six sections, the mock-up\'s, in page order', () => {
    const anchors = analyzeItAnchors({ picks: 3, findings: 26, touches: 8, summary: true, score: true });
    expect(anchors.length).toBeLessThanOrEqual(PAGE_ANCHOR_MAX);
    expect(anchors.map((a) => a.label)).toEqual(['Score', 'First look', 'Findings', 'SAP objects', 'Summary', 'Detail']);
  });

  test('risks for a change come from the engine: deductions of ten points or more, and what was not read', () => {
    const risks = changeRisks({ model: model(), missingObjects: 2, notAssessedPlaces: 3 });
    expect(risks.map((r) => r.key)).toEqual(['standard-table-write', 'batch-input', 'missing-objects']);
    expect(risks[0]).toMatchObject({ line: 240, lineEnd: 243 });
    expect(changeRisks({ model: null, missingObjects: 0, notAssessedPlaces: 0 })).toEqual([]);
  });

  test('the main sequence: what the entry calls, in line order, anchored calls only', () => {
    const seq = mainSequence({
      entries: ['START-OF-SELECTION'],
      nodes: [
        { kind: 'sub-process', label: 'READ_REQUISITION', region: 'START-OF-SELECTION', expandsTo: 'FORM:READ_REQUISITION', anchor: { lineStart: 43 } },
        { kind: 'call-activity', label: 'CHECK_AUTHORITY', region: 'START-OF-SELECTION', anchor: { lineStart: 42 } },
        { kind: 'task', label: 'gv_x = 1', region: 'START-OF-SELECTION', anchor: { lineStart: 44 } },
        { kind: 'call-opaque', label: 'lv_fm', region: 'START-OF-SELECTION', anchor: null },
        { kind: 'call-activity', label: 'INSIDE', region: 'FORM:READ_REQUISITION', anchor: { lineStart: 90 } },
      ],
    });
    expect(seq.rows).toEqual([{ line: 42, name: 'CHECK_AUTHORITY' }, { line: 43, name: 'READ_REQUISITION' }]);
  });

  test('the page: answer card, the bar, two columns, the folds; the IT branch only; no header actions, no old chips', () => {
    const it = code('components/analyze/AnalyzeIt.tsx');
    for (const part of ['<AnswerCard', '<PageAnchorBar', 'id="analyze-moves"', '<EvidenceFindingsTable', 'layout="main"', '<ItTouches', 'id="analyze-summary"', 'id="analyze-technical-detail"', '<OpenQuestions', '<ItRail', '<StandardTouchCard', '<ItRuleRegister']) {
      expect(it, part).toContain(part);
    }
    // Every place an old workspace address sends to IT stands here, or opens Technical detail.
    expect(it).toContain('revealOn={ANALYZE_IT_DETAIL_PLACES}');
    expect(it).toContain(`id={ANALYZE_IT_IDS.notDetermined}`);
    expect(ANALYZE_IT_IDS.notDetermined).toBe('not-determined');
    // The family's chips, not the old ones (L2).
    for (const rel of ['components/analyze/AnalyzeIt.tsx', 'components/analyze/ItTouches.tsx', 'components/analyze/EvidenceFindingsTable.tsx', 'components/analyze/FindingsFocus.tsx', 'components/analyze/RouteCard.tsx', 'components/analyze/NotDeterminedSide.tsx', 'components/analyze/CleanCoreScoreSection.tsx']) {
      expect(code(rel), rel).not.toContain('CcProvenanceChip');
    }
    const page = code('app/(app)/project/[projectId]/analyze/page.tsx');
    // The header carries no actions where the answer card does (ADR-140 A11); "Process (BPMN)" retired.
    expect(page).not.toContain('data-analyze-open-process');
    expect(page).not.toContain('workspaceProcessHref');
    // Every way out of the page stays in Analyze: no link to the dissolved workspace page.
    expect(page).not.toMatch(/`\/project\/\$\{[^}]+\}\?view=/);
    expect(page).toContain('backToMyWorkspace');
  });
});

/* ---------------------------------------------------------------- rendered */

test.describe('the page, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  test('answer first, then the bar, the sections and the side column; every finding reachable; nothing sideways on a phone', async ({ page }) => {
    test.setTimeout(240_000);
    const acct = await seedStageProject({ prefix: 'anlzit', admin: true, acceptTerms: true, rich: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });

    const answer = page.locator('[data-analysis-answer] [data-answer-card]');
    await expect(answer).toBeVisible({ timeout: 90_000 });
    await expect(answer.locator('[data-answer-question]')).toContainText('How far is this code from clean core?');
    // "From the engine" once per page, in the head (3.5.4, Q5): the answer card's own engine chip is not drawn.
    await expect(page.locator('[data-stage-header] [data-stage-page-provenance] [data-family-chip="engine"]')).toBeVisible();
    await expect(answer.locator('[data-family-chip="engine"]').first()).toBeHidden();
    await expect(answer.locator('[data-analyze-score-value]')).toHaveText(/\d+/);
    await expect(answer.locator('[data-facet]')).toHaveCount(4);
    // The header carries no actions; Add evidence stands in the answer card.
    await expect(page.locator('[data-analyze-header-actions]')).toHaveCount(0);
    await expect(answer.locator('[data-analyze-add-evidence]')).toBeVisible();

    // The bar: at most six, between the answer and the first section.
    const bar = page.locator('[data-analyze-anchors]');
    await expect(bar).toBeVisible();
    expect(await bar.locator('[data-analyze-anchor]').count()).toBeLessThanOrEqual(6);
    const tops = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
      return { answer: top('[data-answer-card]'), bar: top('[data-analyze-anchors]'), moves: top('#analyze-moves'), side: top('#analyze-route') };
    });
    expect(tops.answer).toBeLessThan(tops.bar);
    expect(tops.bar).toBeLessThan(tops.moves);
    // At 1440 the side column stands beside the first section.
    expect(Math.abs(tops.side - tops.moves)).toBeLessThan(40);

    // Every finding is reachable: the list holds them all, the open questions stand at their address.
    await expect(page.locator('#analyze-kinds [data-findings-groups]')).toBeVisible();
    await expect(page.locator('#not-determined [data-open-questions]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#analyze-touch')).toBeVisible();
    // No internal id and one line-anchor notation.
    await expect(page.locator('body')).not.toContainText(/\bCC-\d{3}\b|\bnd-\d+-\d+\b/);
    const anchors = await page
      .locator('main [data-cc-anchor]')
      .evaluateAll((els) => els.map((el) => `${(el as HTMLElement).innerText.trim()} in #${el.closest('[id]')?.id ?? '?'}`));
    expect(anchors.filter((t) => /^L\d/.test(t))).toEqual([]);

    // L3: the page, folds closed, stays within about three screens at 1440.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `the IT page is ${height} px at 1440`).toBeLessThan(900 * 3.6);

    // A workspace address of IT lands here, at its place, in the open fold.
    await page.goto(`/project/${acct.projectId}?view=it#it-trust`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/project/${acct.projectId}/analyze\\?view=it#it-trust$`), { timeout: 30_000 });
    await expect(page.locator('#it-trust')).toBeVisible({ timeout: 60_000 });

    // A phone: nothing scrolls sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/project/${acct.projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-answer-card]')).toBeVisible({ timeout: 90_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
