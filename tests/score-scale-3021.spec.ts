import { test, expect } from '@playwright/test';
import { formatTenPointScore, TEN_POINT_MAX } from '../lib/score-scale';
import { computeComplexityScore, computeCriticalityScore } from '../lib/abap/code-assessment';
import { generateExecutiveSummary, generateExecutiveSummaryDoc } from '../lib/audit-pack';
import { buildBoardDeck } from '../lib/board-deck';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.0.21 — one scale for the complexity and criticality scores (external code audit of 22.10.2026). Both
 * are computed 1–10 but were printed "/100" in the audit pack and the board deck, and the deck judged them against
 * 70, 40 and 60 — thresholds a 1–10 score never reaches. Server-free.
 */

const project = (complexity: number | undefined, criticality: number | undefined): Project =>
  ({ id: 'p1', name: 'Scale', cleanCoreScore: 72, complexityScore: complexity, criticalityScore: criticality, extensibilityRoute: 'On-Stack (RAP)', codeInventory: [], dataCoupling: [] }) as unknown as Project;

test('the scores are computed on 1–10, and the one formatter says so', () => {
  const big = Array.from({ length: 400 }, (_, i) => `IF a = ${i}. UPDATE ztab SET f = 1. CALL FUNCTION 'Z_${i}'. ENDIF.`).join('\n');
  for (const score of [computeComplexityScore(big), computeComplexityScore('WRITE 1.'), computeCriticalityScore(big)]) {
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(TEN_POINT_MAX);
  }
  expect(formatTenPointScore(7)).toBe('7/10');
  expect(formatTenPointScore(undefined)).toBe('—');
  expect(formatTenPointScore(null)).toBe('—');
});

test('audit pack: complexity and criticality print on /10, the clean core score stays /100', () => {
  const md = generateExecutiveSummary(project(7, 4));
  expect(md).toContain('| Complexity Score | 7/10 |');
  expect(md).toContain('| Criticality Score | 4/10 |');
  expect(md).toContain('| Clean Core Score | 72/100 |');
  expect(md).not.toMatch(/(?:Complexity|Criticality) Score \| [^|]*\/100/);
  const doc = generateExecutiveSummaryDoc(project(7, undefined));
  expect(doc).toContain('<tr><td>Complexity Score</td><td>7/10</td></tr>');
  expect(doc).toContain('<tr><td>Criticality Score</td><td>—</td></tr>');
});

test('board deck: /10 on the slide and the notes, and its bands are reachable on 1–10', () => {
  const high = buildBoardDeck({ project: project(8, 5), findings: [] });
  const text = JSON.stringify(high);
  expect(text).toContain('8/10');
  expect(text).toContain('Criticality: 5/10');
  expect(text).not.toMatch(/\d\/100(?!\d)[^"]*(?:omplexity|riticality)|(?:omplexity|riticality)[^"]*\b\d{1,2}\/100/);
  expect(text).toContain('High Impact');
  expect(high.slides.flatMap((s) => s.rows ?? []).some((r) => r.col1 === 'High legacy code complexity')).toBe(true);
  const moderate = JSON.stringify(buildBoardDeck({ project: project(5, 2), findings: [] }));
  expect(moderate).toContain('Moderate Impact');
  const low = buildBoardDeck({ project: project(2, 2), findings: [] });
  expect(JSON.stringify(low)).toContain('Localized Impact');
  expect(low.slides.flatMap((s) => s.rows ?? []).some((r) => r.col1 === 'High legacy code complexity')).toBe(false);
});
