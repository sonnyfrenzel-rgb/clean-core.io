import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assessCoverage, coverageCaveat } from '../lib/abap/coverage';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { scoreBand, scoreWithUnassessed, scoreFromFindings } from '../lib/clean-core-score';

/**
 * G4-F2 — an include that was not uploaded is named, not read as clean.
 *
 * Corpus case CC-021 keeps its deciding rule in `INCLUDE zcc_ref_021_rules.`,
 * whose source is not part of the case. The engine reported no finding, a
 * Clean Core Score of 95 ("close to clean core"), the In-App route at
 * confidence 55, and the Design stage read "No legacy pattern was detected".
 * The include appeared nowhere among the constructs the engine did not assess
 * (only `WRITE` was listed), so nothing on Analyze or Design said that the part
 * of the program that decides was never read.
 *
 * The fix follows the existing not-determined convention (`coverage.ts`): the
 * include is an unassessed construct with its name, and the score and the route
 * confidence read it exactly as they read every other gap. Every assertion
 * below fails on the engine before the fix.
 */

const CC_021 = readFileSync(join(process.cwd(), 'tests', 'korpus', 'cases', 'CC-021', 'source.abap'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

function read(code: string, deployment: 'public' | 'private' = 'private') {
  const evidence = buildAbapEvidence(code, 'source.abap', deployment);
  return { evidence, route: routeExtensibility(evidence, deployment) };
}

test.describe('G4-F2 — an include whose source was not uploaded', () => {
  test('is named as not determined, at its line, by name', () => {
    const coverage = assessCoverage(CC_021);
    const include = coverage.unassessed.filter((u) => u.gap === 'include-not-read');
    expect(include).toHaveLength(1);
    expect(include[0].line).toBe(4);
    expect(include[0].why).toContain('Include ZCC_REF_021_RULES was not uploaded — what it does is not determined.');
    expect(coverage.complete).toBe(false);
    expect(coverageCaveat(coverage)).toContain('include whose source was not uploaded');
  });

  test('costs the score what every unassessed kind costs, and the score no longer reads as close to clean core', () => {
    const { evidence, route } = read(CC_021);
    expect(evidence.findings).toHaveLength(0);
    // The convention, not a new rule: five points per kind not assessed.
    expect(route.cleanCoreScore).toBe(scoreWithUnassessed(scoreFromFindings(evidence.findings), evidence.coverage.gaps.length));
    expect(route.cleanCoreScore).toBeLessThan(95);
    expect(scoreBand(route.cleanCoreScore).key).not.toBe('light');
  });

  test('lowers the route confidence below the reading without it', () => {
    const { route } = read(CC_021);
    const withoutInclude = read(CC_021.replace(/^INCLUDE zcc_ref_021_rules\.$/m, '')).route;
    expect(route.recommendedRoute).toBe(withoutInclude.recommendedRoute);
    expect(route.confidenceScore).toBeLessThan(withoutInclude.confidenceScore);
    expect(route.confidenceScore).toBeLessThan(55);
  });

  test('the recommendation says what was not read instead of "no legacy pattern was detected"', () => {
    const { route } = read(CC_021);
    expect(route.rationale).not.toMatch(/no legacy pattern was detected/i);
    expect(route.rationale).toContain('Part of the program was not read.');
    expect(route.rationale).toContain('Include ZCC_REF_021_RULES was not uploaded — what it does is not determined.');
    expect(route.assumptions.join(' ')).not.toMatch(/no legacy pattern/i);
  });

  test('beside findings, the recommendation still names the include it did not read', () => {
    const code = [
      'REPORT zg4_with_finding.',
      'INCLUDE zg4_rules.',
      'START-OF-SELECTION.',
      "  CALL FUNCTION 'Z_REMOTE' DESTINATION 'RFC_DEST'.",
    ].join('\n');
    const { evidence, route } = read(code);
    expect(evidence.findings.some((f) => f.kind === 'rfc-call')).toBe(true);
    expect(route.rationale).toContain('Include ZG4_RULES was not uploaded — what it does is not determined.');
  });

  test('a chained INCLUDE names every include in it', () => {
    const coverage = assessCoverage(['REPORT zg4_chain.', 'INCLUDE: zg4_top, zg4_f01.'].join('\n'));
    const include = coverage.unassessed.filter((u) => u.gap === 'include-not-read');
    expect(include).toHaveLength(1);
    expect(include[0].why).toContain('Include ZG4_TOP, Include ZG4_F01 were not uploaded — what they do is not determined.');
  });
});

test.describe('G4-F2 — what is not an include that was not read', () => {
  test('INCLUDE STRUCTURE and INCLUDE TYPE are type components (R29, CC-045), not a missing source', () => {
    const cc045 = readFileSync(join(process.cwd(), 'tests', 'korpus', 'cases', 'CC-045', 'source.abap'), 'utf8');
    expect(assessCoverage(cc045).unassessed.filter((u) => u.gap === 'include-not-read')).toEqual([]);
    const typed = ['TYPES: BEGIN OF ty_row.', '  INCLUDE TYPE ty_base.', 'TYPES: END OF ty_row.'].join('\n');
    expect(assessCoverage(typed).unassessed.filter((u) => u.gap === 'include-not-read')).toEqual([]);
  });

  test('an include uploaded with the program — pasted in with its editor header — is read, not named', () => {
    const code = [
      'REPORT zg4_main.',
      'INCLUDE zg4_top.',
      'INCLUDE zg4_f01.',
      'START-OF-SELECTION.',
      '  PERFORM run.',
      '*&---------------------------------------------------------------------*',
      '*& Include ZG4_TOP - global data',
      '*&---------------------------------------------------------------------*',
      'DATA gv_total TYPE i.',
      '***INCLUDE ZG4_F01.',
      'FORM run.',
      '  gv_total = 1.',
      'ENDFORM.',
    ].join('\n');
    expect(assessCoverage(code).unassessed.filter((u) => u.gap === 'include-not-read')).toEqual([]);
  });

  test('a commented-out INCLUDE statement or a remark naming an include does not count as its text', () => {
    const code = [
      'REPORT zg4_remark.',
      '*INCLUDE zg4_old.',
      '* the rule is maintained there (Include ZG4_RULES)',
      'INCLUDE zg4_old.',
      'INCLUDE zg4_rules.',
    ].join('\n');
    const include = assessCoverage(code).unassessed.filter((u) => u.gap === 'include-not-read');
    expect(include.map((u) => u.line)).toEqual([4, 5]);
  });

  test('a variable whose name begins with INCLUDE is not an include', () => {
    const code = ['REPORT zg4_vars.', 'DATA included_flag TYPE c LENGTH 1.', "included_flag = 'X'.", "include = 'X'."].join('\n');
    expect(assessCoverage(code).unassessed.filter((u) => u.gap === 'include-not-read')).toEqual([]);
  });

  test('the symbol includes in angle brackets declare constants, not logic', () => {
    expect(assessCoverage(['REPORT zg4_icons.', 'INCLUDE <icon>.'].join('\n')).unassessed).toEqual([]);
  });
});
