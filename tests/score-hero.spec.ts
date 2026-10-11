import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { scoreBreakdown } from '../lib/clean-core-score';
import { scoreRuleFor } from '../lib/score-rule';
import { otherEditionFigure, scoreHeroModel } from '../lib/score-hero';
import { APP_VERSION } from '../lib/version';

/**
 * The Analyze score hero (ADR-093, owner approval 11.10.2026, mockup
 * `docs/roadmap/analyze-score-hero-mockup.html`): every figure it shows is read
 * off `scoreBreakdown()` under the signed run's rule, and the table sums
 * exactly to the score the router signs. `lib/score-hero.ts` only adds where —
 * the lines and objects each deduction counted — and the other edition's
 * figure, computed from the same findings and never signed.
 *
 * Server-free: the engine runs here over the starter example the mockup was
 * measured on (Z_MM_PO_APPROVAL, 668 lines).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EXAMPLE = read('public/starter-examples/Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');

function heroFor(edition: 'public' | 'private', engine: string) {
  const evidence = buildAbapEvidence(EXAMPLE, 'Z_MM_PO_APPROVAL.abap', edition);
  const signed = routeExtensibility(evidence, edition, engine).cleanCoreScore;
  const gaps = evidence.coverage && !evidence.coverage.complete
    ? evidence.coverage.gaps.map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine }))
    : [];
  const rule = scoreRuleFor(edition, engine);
  const breakdown = scoreBreakdown(evidence.findings, gaps.length, rule);
  return { evidence, signed, gaps, breakdown, model: scoreHeroModel(breakdown, evidence.findings, gaps, rule) };
}

test.describe('the hero adds up to the signed score', () => {
  for (const edition of ['private', 'public'] as const) {
    test(`${edition}: the deductions, the places not assessed and the floor give the router's score`, () => {
      const { signed, breakdown, model } = heroFor(edition, APP_VERSION);
      expect(breakdown.score).toBe(signed);
      expect(model.score).toBe(signed);
      const code = model.deductions.reduce((n, d) => n + d.points, 0);
      expect(model.deducted).toBe(code);
      expect(model.codeScore).toBe(Math.max(5, 100 - code));
      const nd = model.notAssessed?.points ?? 0;
      expect(Math.max(5, model.codeScore - nd)).toBe(signed);
      // Largest first, every row with the lines it was counted from.
      expect(model.deductions.map((d) => d.points)).toEqual([...model.deductions.map((d) => d.points)].sort((a, b) => b - a));
      for (const d of model.deductions) {
        expect(d.lines.length, d.kind).toBeGreaterThan(0);
        expect(d.points, d.kind).toBeLessThanOrEqual(d.cap);
      }
    });
  }

  test('the measured case of the mockup: Private Edition 37, Public Edition 23', () => {
    const priv = heroFor('private', APP_VERSION);
    const pub = heroFor('public', APP_VERSION);
    expect(priv.signed).toBe(37);
    expect(pub.signed).toBe(23);
    // The two direct writes to EBAN are the largest single deduction, 23 points, at L246 and L455.
    expect(priv.model.largest).toMatchObject({ what: 'kind', deduction: { kind: 'standard-table-write', points: 23 } });
    const eban = priv.model.deductions.find((d) => d.kind === 'standard-table-write')!;
    expect(eban.objects).toEqual(['EBAN']);
    expect(eban.lines).toEqual([246, 455]);
    // The own Z-table writes are free in Private Edition and named as such.
    expect(priv.model.free?.objects).toEqual(['ZMM_PO_APPR', 'ZMM_PO_ATTACH']);
    expect(priv.model.free?.pointsWhereCharged).toBe(14);
    expect(pub.model.free).toBeNull();
    // 4 kinds not assessed, 5 points each.
    expect(priv.model.notAssessed).toMatchObject({ kinds: 4, points: 20 });
  });
});

test.describe('the other edition\'s figure (owner decision Q1)', () => {
  test('computed from the same findings under the other rule — the figure the other edition signs', () => {
    const priv = heroFor('private', APP_VERSION);
    const other = otherEditionFigure(priv.evidence.findings, priv.gaps.length, 'private', APP_VERSION);
    expect(other).toEqual({ edition: 'public', score: 23, sameRule: false });
    const back = otherEditionFigure(priv.evidence.findings, priv.gaps.length, 'public', APP_VERSION);
    expect(back).toMatchObject({ edition: 'private', score: 37, sameRule: false });
  });

  test('a run signed before 3.0.9 was scored by one rule for both editions, and says so', () => {
    const old = heroFor('private', 'v3.0.8');
    const other = otherEditionFigure(old.evidence.findings, old.gaps.length, 'private', 'v3.0.8');
    expect(other.sameRule).toBe(true);
    expect(other.score).toBe(old.breakdown.score);
    expect(old.model.free).toBeNull();
  });
});

test.describe('the hero on the page', () => {
  test('the real page and the demo draw it from these modules, with the signed score by name', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    const demo = read('components/demo/DemoAnalyze.tsx');
    expect(page.match(/<AnalysisAnswer\s+score=\{signedCleanCoreScore\}/g)?.length).toBe(3);
    expect(demo).toMatch(/<AnalysisAnswer\s+score=\{a\.cleanCoreScore\}\s+breakdown=\{a\.scoreBreakdown\}/);
    const answer = read('components/analyze/AnalysisAnswer.tsx');
    expect(answer).toContain("from '@/lib/score-hero'");
    expect(answer).toMatch(/breakdown\.score === score/);
    const hero = read('components/analyze/CleanCoreScoreSection.tsx');
    // The mismatch notice replaces the table inside the hero, with the way to a new run.
    expect(hero).toMatch(/The run was made with a\s+different engine or source/);
    expect(hero).toContain('Run the analysis again');
    // Not determined is never folded away — not on a phone either.
    expect(hero).toMatch(/<li data-score-not-determined=\{model\.notAssessed\.kinds\} className=\{cn\(ROW, 'border-b border-cc-line py-2'\)\}>/);
    // No green on the score.
    expect(hero).not.toMatch(/cc-success|text-green|bg-green/);
  });

  test('the complexity and criticality meters, the inventory tables and the status line left Analyze (Q3, Q4)', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).not.toMatch(/ScoreMeter|renderMeters|title="Complexity and criticality"/);
    // Display only: the run still signs both figures.
    expect(page).toMatch(/complexityScore,\s*criticalityScore,\s*worklist: initialWorklist/);
    for (const gone of ['CodeInventoryTable', 'ModuleHeatmap', 'ModuleTreemap', 'DataCouplingTable', 'WhyScorePanel']) {
      expect(fs.existsSync(path.join(ROOT, `components/analyze/${gone}.tsx`)), gone).toBe(false);
    }
    expect(page).toContain('?view=it#it-objects');
    expect(read('components/demo/DemoAnalyze.tsx')).toContain('?view=it#it-objects');
  });

  test('one "Add evidence" menu; ?add=usage|atc still opens the dialog directly (Q5, ADR-081)', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).toContain('label="Add evidence"');
    expect(page).toContain("'data-analyze-add-usage': ''");
    expect(page).toContain("'data-analyze-add-atc': ''");
    expect(page).toMatch(/const asked = searchParams\.get\('add'\);\s*return asked === 'usage' \|\| asked === 'atc' \? asked : null;/);
    expect(page).not.toMatch(/>\s*Add usage data\s*<\/CcButton>|>\s*Export Confluence\s*<\/CcButton>/);
  });
});
