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
import { scoreRuleFor, isOwnTableName } from '../lib/score-rule';
import { corpusFiles, readExample as readCorpusFile, pinnedExamplePath } from './helpers/starter-example-files';

/**
 * The Clean Core Score explained on Analyze (owner, 01.10.2026) — the screen's
 * breakdown is the router's own arithmetic, and every sentence a band carries
 * is something the deduction table guarantees. Pure, no server.
 */
const ROOT = path.resolve(__dirname, '..');

test.describe('one table for the score and its explanation', () => {
  test('the breakdown adds up to the signed score on every starter example, both editions, both score rules', () => {
    let compared = 0;
    for (const file of corpusFiles()) {
      const src = readCorpusFile(file);
      for (const edition of ['public', 'private'] as const) {
        const evidence = buildAbapEvidence(src, file, edition);
        const gaps = evidence.coverage && !evidence.coverage.complete ? evidence.coverage.gaps.length : 0;
        // A run before 3.0.9, one from 3.0.9, and one without an engine stamp.
        for (const engine of ['v3.0.8', 'v3.0.9', null]) {
          const routed = routeExtensibility(evidence, edition, engine);
          const b = scoreBreakdown(evidence.findings, gaps, scoreRuleFor(edition, engine));
          expect(b.score, `${file} ${edition} ${engine}`).toBe(routed.cleanCoreScore);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(30);
  });

  // The proposal drew 28, from 100 − 72. Since G4-F2 (02.10.2026) the two
  // includes the example names and does not hold (Z_MM_PO_NOTIFY, Z_MM_PO_LOG)
  // are one more kind the engine did not assess: five points more, 23 from
  // 100 − 77. The deductions for what was found are unchanged.
  test('the example the proposal drew: 23, from 100 − 77', () => {
    const src = fs.readFileSync(pinnedExamplePath('Z_MM_PO_APPROVAL.abap'), 'utf8');
    const evidence = buildAbapEvidence(src, 'Z_MM_PO_APPROVAL.abap', 'private');
    // The rule the proposal drew under: every custom-table write charged.
    const b = scoreBreakdown(evidence.findings, evidence.coverage?.gaps.length ?? 0, scoreRuleFor('private', 'v3.0.8'));
    // From 3.0.9 its two writes to its own Z tables cost nothing in Private
    // Edition: 14 points back, 37 from 100 − 63 — still far from clean core.
    const since309 = scoreBreakdown(evidence.findings, evidence.coverage?.gaps.length ?? 0, scoreRuleFor('private', 'v3.0.9'));
    expect(b.lines.find((l) => l.kind === 'custom-table-write')).toMatchObject({ count: 2, points: 14 });
    expect(since309.lines.find((l) => l.kind === 'custom-table-write')).toBeUndefined();
    expect(since309.freeOwnTableWrites).toBe(2);
    expect(since309.score).toBe(37);
    expect(scoreBand(since309.score).key).toBe('far');
    expect(evidence.coverage.gaps.map((g) => g.gap)).toContain('include-not-read');
    expect(b.score).toBe(23);
    expect(b.lines.reduce((n, l) => n + l.points, 0) + b.unassessedPoints).toBe(77);
    expect(b.lines[0]).toMatchObject({ kind: 'standard-table-write', count: 2, points: 23 });
  });

  test('the router no longer carries its own copy of the numbers', () => {
    const router = fs.readFileSync(path.join(ROOT, 'lib/abap/extensibility-router.ts'), 'utf8');
    expect(router).toContain('scoreFromFindings(findings, scoreRule)');
    expect(router).toContain('scoreRuleFor(deploymentModel, engineVersion)');
    expect(router).toContain('scoreWithUnassessed(score,');
    expect(router).not.toMatch(/deduct\(\w+\.length,\s*\d+/);
  });
});

test.describe('the bands say only what the table guarantees', () => {
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

    // Random combinations of up to three findings per kind, with and without
    // unassessed kinds, under both score rules. A custom-table write is to an
    // own Z/Y table or to a namespaced one, at random.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 4000; n++) {
      const scoreRule = n % 2 === 0 ? 'custom-writes-charged' : 'own-custom-writes-free';
      const findings: ScoredFinding[] = [];
      for (const rule of SCORE_DEDUCTIONS) {
        const k = rnd() < 0.7 ? 0 : 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < k; i++) {
          findings.push(rule.kind === 'custom-table-write' ? { kind: rule.kind, objectName: rnd() < 0.5 ? 'ZORDERS' : '/ACME/ORDERS' } : { kind: rule.kind });
        }
      }
      const gaps = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 7);
      const b = scoreBreakdown(findings, gaps, scoreRule);
      // What the band sentences speak of: under the Private Edition rule from
      // 3.0.9 a write to an own Z/Y table is not a heavy construct — it is free.
      const charged = findings.filter((f) => !(scoreRule === 'own-custom-writes-free' && f.kind === 'custom-table-write' && isOwnTableName(f.objectName)));
      const kinds = new Set(charged.map((f) => f.kind));
      expect(b.freeOwnTableWrites).toBe(findings.length - charged.length);
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
    const src = fs.readFileSync(pinnedExamplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
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
    const src = fs.readFileSync(pinnedExamplePath('Z_MM_PO_APPROVAL.abap'), 'utf8');
    const rows = findingRows(buildAbapEvidence(src, 'x.abap', 'private').findings);
    for (const by of ['kind', 'severity', 'line'] as const) {
      expect(groupRows(rows, by).reduce((n, g) => n + g.rows.length, 0), by).toBe(rows.length);
    }
    expect(groupRows(rows, 'severity')[0].label).toBe('Critical');
    expect(accessUseOfKind('standard-table-read')).toBe('read');
    expect(accessUseOfKind('custom-table-write')).toBe('write');
    expect(accessUseOfKind('bdc')).toBeNull();
    // A table changed through batch input is written (3.0.7) — the same in the IT view's route.
    expect(accessUseOfKind('batch-input')).toBe('write');
  });
});
