import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import {
  SCORE_BANDS,
  SCORE_DEDUCTIONS,
  SCORE_FLOOR,
  deductionFor,
  scoreBand,
  scoreBreakdown,
  type ScoredFinding,
} from '../lib/clean-core-score';
import { groupRows, findingRows, processStepBands, accessUseOfKind } from '../lib/findings-view';
import { readProcess } from '../lib/first-look';

/**
 * The Clean Core Score explained on Analyze (owner, 01.10.2026) — the screen's
 * breakdown is the router's own arithmetic, and every sentence a band carries
 * is something the deduction table guarantees. Pure, no server.
 */
const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'public/starter-examples');

test.describe('one table for the score and its explanation', () => {
  test('the breakdown adds up to the signed score on every starter example, both editions', () => {
    let compared = 0;
    for (const file of fs.readdirSync(EXAMPLES)) {
      const src = fs.readFileSync(path.join(EXAMPLES, file), 'utf8');
      for (const edition of ['public', 'private'] as const) {
        const evidence = buildAbapEvidence(src, file, edition);
        const routed = routeExtensibility(evidence, edition);
        const gaps = evidence.coverage && !evidence.coverage.complete ? evidence.coverage.gaps.length : 0;
        const b = scoreBreakdown(evidence.findings, gaps);
        expect(b.score, `${file} ${edition}`).toBe(routed.cleanCoreScore);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  test('the example the proposal drew: 28, from 100 − 72', () => {
    const src = fs.readFileSync(path.join(EXAMPLES, 'Z_MM_PO_APPROVAL.abap'), 'utf8');
    const evidence = buildAbapEvidence(src, 'Z_MM_PO_APPROVAL.abap', 'private');
    const b = scoreBreakdown(evidence.findings, evidence.coverage?.gaps.length ?? 0);
    expect(b.score).toBe(28);
    expect(b.lines.reduce((n, l) => n + l.points, 0) + b.unassessedPoints).toBe(72);
    expect(b.lines[0]).toMatchObject({ kind: 'standard-table-write', count: 2, points: 23 });
  });

  test('the router no longer carries its own copy of the numbers', () => {
    const router = fs.readFileSync(path.join(ROOT, 'lib/abap/extensibility-router.ts'), 'utf8');
    expect(router).toContain('scoreFromFindings(findings)');
    expect(router).toContain('scoreWithUnassessed(score,');
    expect(router).not.toMatch(/deduct\(\w+\.length,\s*\d+/);
  });
});

test.describe('the bands are guidance the table guarantees', () => {
  test('they cover 5–100 without a gap or an overlap, lowest first', () => {
    expect(SCORE_BANDS[0].from).toBe(SCORE_FLOOR);
    expect(SCORE_BANDS[SCORE_BANDS.length - 1].to).toBe(100);
    for (let i = 1; i < SCORE_BANDS.length; i++) expect(SCORE_BANDS[i].from).toBe(SCORE_BANDS[i - 1].to + 1);
    for (let s = SCORE_FLOOR; s <= 100; s++) expect(SCORE_BANDS.filter((b) => s >= b.from && s <= b.to)).toHaveLength(1);
    expect(scoreBand(28).key).toBe('far');
  });

  test('every band sentence holds for every combination of findings (exhaustive over small counts)', () => {
    const heavy = new Set(SCORE_DEDUCTIONS.filter((r) => r.first >= 10).map((r) => r.kind));
    expect([...heavy].sort()).toEqual(['bdc', 'custom-table-write', 'enhancement', 'modification', 'native-sql', 'standard-table-write']);
    // The largest single kind costs no more than 40 — the 'far' band's reason.
    expect(Math.max(...SCORE_DEDUCTIONS.map((r) => r.cap))).toBe(40);

    // Random combinations of up to three findings per kind, with and without unassessed kinds.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 4000; n++) {
      const findings: ScoredFinding[] = [];
      for (const rule of SCORE_DEDUCTIONS) {
        const k = rnd() < 0.7 ? 0 : 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < k; i++) findings.push({ kind: rule.kind });
      }
      const gaps = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 7);
      const b = scoreBreakdown(findings, gaps);
      const kinds = new Set(findings.map((f) => f.kind));
      if (b.score >= 91) for (const h of heavy) expect(kinds.has(h), `${b.score} with ${h}`).toBe(false);
      if (b.score >= 81) {
        expect(kinds.has('modification')).toBe(false);
        expect(kinds.has('standard-table-write')).toBe(false);
      }
      if (b.score <= 59 && gaps === 0) {
        // More than 40 points from findings alone: more than one kind.
        expect(b.lines.length, `${b.score}`).toBeGreaterThan(1);
      }
    }
    expect(deductionFor(SCORE_DEDUCTIONS[0], 0)).toBe(0);
  });
});

test.describe('the object page helpers', () => {
  test('process steps are the routines the entry block calls, FORM to ENDFORM', () => {
    const src = fs.readFileSync(path.join(EXAMPLES, 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
    const steps = processStepBands(readProcess(src).skeleton, src);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps[0]).toMatchObject({ n: 1, label: 'CHECK_AUTHORITY', from: 95, to: 114 });
    const lines = src.split('\n');
    for (const s of steps) {
      expect(lines[s.from - 1]).toMatch(/^\s*FORM\s/i);
      expect(lines[s.to - 1]).toMatch(/^\s*ENDFORM\b/i);
    }
  });

  test('grouping by severity and by line keeps every row', () => {
    const src = fs.readFileSync(path.join(EXAMPLES, 'Z_MM_PO_APPROVAL.abap'), 'utf8');
    const rows = findingRows(buildAbapEvidence(src, 'x.abap', 'private').findings);
    for (const by of ['kind', 'severity', 'line'] as const) {
      expect(groupRows(rows, by).reduce((n, g) => n + g.rows.length, 0), by).toBe(rows.length);
    }
    expect(groupRows(rows, 'severity')[0].label).toBe('Critical');
    expect(accessUseOfKind('standard-table-read')).toBe('read');
    expect(accessUseOfKind('custom-table-write')).toBe('write');
    expect(accessUseOfKind('bdc')).toBeNull();
  });
});
