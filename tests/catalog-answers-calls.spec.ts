/**
 * Roadmap 3.0.6 — the engine answers what its catalog already knows.
 *
 * A local `CALL FUNCTION 'X'` was "not assessed" even where SAP's own files
 * list X as a function module with a state the level rule maps. The engine now
 * takes that answer: the call leaves the coverage gaps, the answer says what
 * SAP's file states (a classification, not a runtime check), and a module SAP
 * says is no API for customer code becomes a finding. The A–D letter appears in
 * none of it — findings go into the signed run, and the level stays out.
 *
 * What stays not determined: customer function modules, and SAP-looking names
 * listed nowhere (the residual C is a reading of a missing entry, not an
 * answer). `assessCoverage` without a catalog behaves as before, because it is
 * called in the browser and carries no catalog.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { assessCoverage } from '../lib/abap/coverage';
import { functionModuleCatalogAnswer } from '../lib/abap/catalog-service';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { deriveReviewTasks } from '../lib/abap/review-tasks';

const program = (call: string) => `REPORT zcc_cat.\nCALL FUNCTION '${call}'.`;
const gapsOf = (code: string) => buildAbapEvidence(code, 'zcc_cat.abap').coverage.unassessed.map((u) => u.gap);
const LETTER = /\b(?:level|grade)\s*[A-D]\b|\b[A-D]\s*\(level\)/i;

test('a classicAPI function module is answered by the catalog, not left not determined', () => {
  const evidence = buildAbapEvidence(program('BAPI_SALESORDER_CREATEFROMDAT2'), 'zcc_cat.abap');
  expect(evidence.coverage.unassessed.map((u) => u.gap)).not.toContain('local-function-call');
  expect(evidence.coverage.complete).toBe(true);
  const [answered] = evidence.coverage.answered ?? [];
  expect(answered).toMatchObject({ name: 'BAPI_SALESORDER_CREATEFROMDAT2', state: 'classicAPI', file: 'classification', line: 2 });
  expect(answered.answer, 'the provenance is said').toMatch(/not a check of what this call does at runtime/);
  expect(answered.answer).not.toMatch(LETTER);
  expect(Object.keys(answered)).not.toContain('grade');
  // classic ABAP may call it: no finding
  expect(evidence.findings).toEqual([]);
  // and no "not assessed" deduction for it
  expect(routeExtensibility(evidence, 'private').cleanCoreScore).toBe(100);
});

test('a function module SAP lists as noAPI becomes a finding that cites the state, not a letter', () => {
  const evidence = buildAbapEvidence(program('BAPI_KANBAN_CHANGESTATUS'), 'zcc_cat.abap');
  const finding = evidence.findings.find((f) => f.kind === 'unreleased-api');
  expect(finding, 'the catalog said what the module is').toBeTruthy();
  expect(finding).toMatchObject({ objectName: 'BAPI_KANBAN_CHANGESTATUS', objectType: 'Function Module', source: 'catalog-match' });
  expect(finding!.title).toContain('noAPI');
  for (const text of [finding!.title, finding!.technicalDetail, finding!.cleanCoreImpact, finding!.recommendation]) {
    expect(text, 'the level stays out of the signed findings').not.toMatch(LETTER);
  }
  expect(evidence.coverage.unassessed.map((u) => u.gap)).not.toContain('local-function-call');
});

test('what the catalog does not know stays not determined', () => {
  expect(gapsOf(program('Z_LOCAL_FM')), 'a customer function module').toContain('local-function-call');
  expect(gapsOf(program('BAPI_TRANSACTION_COMMIT')), 'an SAP name listed nowhere').toContain('local-function-call');
  expect(functionModuleCatalogAnswer('BAPI_TRANSACTION_COMMIT')).toBeNull();
  expect(functionModuleCatalogAnswer('VBAK'), 'a table is no answer about a call').toBeNull();
});

test('without a catalog, coverage is what it was — the browser callers carry none', () => {
  const report = assessCoverage(program('BAPI_SALESORDER_CREATEFROMDAT2'));
  expect(report.unassessed.map((u) => u.gap)).toContain('local-function-call');
  expect(report.answered).toBeUndefined();
});

test('an unread include is not answered with an upload this project does not offer', () => {
  const code = 'REPORT zcc_inc.\nINCLUDE zcc_inc_rules.';
  const why = assessCoverage(code).unassessed.find((u) => u.gap === 'include-not-read')!.why;
  expect(why).not.toMatch(/upload the include/i);
  expect(why).toMatch(/cannot take further includes/);
  const task = deriveReviewTasks(code).tasks.find((t) => t.kind === 'include-not-read')!;
  expect(task.task).not.toMatch(/Add the source of/);
  expect(task.task).toContain('ZCC_INC_RULES');
  expect(task.task).toContain('Add the includes');
  const route = routeExtensibility(buildAbapEvidence(code, 'zcc_inc.abap'), 'private');
  expect(route.rationale).not.toMatch(/Upload the include/);
});
