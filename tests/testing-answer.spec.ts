import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { notProvenItems, testingAnswer, TESTING_SECTION_IDS, type TestingAnswerInput } from '../lib/testing-answer';
import type { RuleCoverage } from '../lib/testing-rule-trace';
import type { OutsideTestSummary } from '../lib/sap-test-results';

/**
 * Testing, next (ADR-131, `docs/roadmap/testing-next-mockup.html`): the answer "Is <program> tested?", its four
 * facets and the *Not proven* list — read from what is on record, every result with the place it ran. Server-free.
 */

const coverage: RuleCoverage = { covered: ['BR-002', 'BR-003'], missing: ['BR-013'], notAsked: [], mismatched: [], total: 3 };
const base: TestingAnswerInput = {
  program: 'Z_MM_PO_APPROVAL',
  abap: false,
  cases: 5,
  engineCases: 3,
  coverage,
  run: { kind: 'none' },
  outside: { state: 'none' },
  closed: false,
  generating: false,
  notProven: 3,
};
const imported = (passed: number, failed: number): OutsideTestSummary => ({
  v: 1,
  kind: 'imported',
  subject: {} as OutsideTestSummary['subject'],
  recordedAt: '2026-11-14T16:20:00.000Z',
  recordedBy: 'uid',
  scenarioCount: passed + failed,
  passed,
  failed,
  skipped: 0,
  coverage: { passed, failed, skipped: 0, none: 0 } as OutsideTestSummary['coverage'],
  file: { name: 'r.xml', sha256: 'x'.repeat(64), format: 'junit' },
  system: null,
  ranOn: null,
});

test.describe('the answer', () => {
  test('nothing written: not tested, here or in your SAP system, and everything is open', () => {
    const a = testingAnswer({ ...base, cases: 0, engineCases: 0, notProven: 1 });
    expect(a.state).toBe('not-started');
    expect(a.question).toBe('Is Z_MM_PO_APPROVAL tested?');
    expect(a.answer).toContain('Not tested yet');
    expect(a.facets.map((f) => f.id)).toEqual(['scenarios', 'rules', 'result', 'open']);
    expect(a.facets.find((f) => f.id === 'open')!.value).toBe('Everything');
  });

  test('written, not run: says how many rules have a case, and which one has none', () => {
    const a = testingAnswer(base);
    expect(a.state).toBe('written');
    expect(a.answer).toContain('5 scenarios are written for 2 of 3 business rules, and none has run');
    expect(a.condition).toContain('BR-013');
    expect(a.facets.find((f) => f.id === 'rules')!.value).toBe('2 of 3');
    expect(a.facets.find((f) => f.id === 'result')!.value).toBe('Not run');
    expect(a.chips[0].kind).toBe('ai');
  });

  test('passed against mocks: the place is in the answer and the facet, never "passed" alone', () => {
    const a = testingAnswer({ ...base, run: { kind: 'recorded', at: '2026-11-15T10:02:00.000Z', counts: { passed: 5, failed: 0, noResult: 0, total: 5 }, suiteEditedByOwner: false } });
    expect(a.state).toBe('passed');
    expect(a.answer).toMatch(/^Passed against SAP mocks/);
    expect(a.answer).toContain('not in your SAP system');
    const result = a.facets.find((f) => f.id === 'result')!;
    expect(result.value).toBe('5 passed · 0 failed');
    expect(result.note).toContain('Not in your SAP system');
    expect(result.chip).toEqual({ kind: 'simulation', note: 'mocks' });
  });

  test('failures against mocks: counted, and the answer points at what a failure means', () => {
    const a = testingAnswer({ ...base, run: { kind: 'session', counts: { passed: 3, failed: 2, noResult: 0, total: 5 } } });
    expect(a.state).toBe('failed');
    expect(a.answer).toContain('2 of 5 scenarios failed against SAP mocks');
    expect(a.condition).toContain('not recorded by the server yet');
  });

  test('ABAP Cloud: a result from your SAP system is named as imported, never as signed', () => {
    const a = testingAnswer({ ...base, abap: true, outside: { state: 'current', summary: imported(5, 0), verifies: true } });
    expect(a.state).toBe('passed');
    expect(a.answer).toMatch(/^Passed in your SAP system/);
    expect(a.chips).toEqual([{ kind: 'engine', note: 'imported' }]);
    expect(a.chips.some((c) => c.kind === 'signed')).toBe(false);
    expect(a.facets.find((f) => f.id === 'result')!.note).toMatch(/^In your SAP system/);
  });

  test('ABAP Cloud without a result: nothing here runs ABAP Unit', () => {
    const a = testingAnswer({ ...base, abap: true });
    expect(a.state).toBe('written');
    expect(a.answer).toContain('They run in your SAP system');
    expect(a.facets.find((f) => f.id === 'result')!.note).toContain('Nothing here runs ABAP Unit');
  });

  test('closed without a passing run reads "Closed · not verified", never passed', () => {
    const a = testingAnswer({ ...base, closed: true });
    expect(a.state).toBe('closed');
    expect(a.facets.find((f) => f.id === 'result')!.value).toBe('Closed · not verified');
    expect(a.answer).not.toMatch(/^Passed/);
  });

  test('every facet jumps to a section of the page', () => {
    const ids = new Set<string>(Object.values(TESTING_SECTION_IDS));
    for (const f of testingAnswer(base).facets) expect(ids.has(f.target)).toBe(true);
  });
});

test.describe('not proven', () => {
  test('one list: rules without a case, places no test covers, model-stated expectations, nothing in your system', () => {
    const items = notProvenItems({
      abap: false,
      cases: 5,
      modelCases: 2,
      missingRules: ['BR-013'],
      places: [{ label: 'Dynamic calls', count: 2, firstLine: 386 }],
      onlyYourSystem: ['Authorizations'],
      ranHere: true,
    });
    expect(items.map((i) => i.key)).toEqual(['rules-without-case', 'places', 'model-stated', 'only-your-system', 'not-in-your-system']);
    expect(items[1].detail).toContain('first at L386');
    expect(items.find((i) => i.key === 'model-stated')!.chip).toBe('ai');
  });

  test('ABAP Cloud has no "nothing ran in your system" point, and nothing written is one point', () => {
    const items = notProvenItems({ abap: true, cases: 0, modelCases: 0, missingRules: [], places: [], onlyYourSystem: [], ranHere: false });
    expect(items.map((i) => i.key)).toEqual(['not-run']);
  });
});

test.describe('the page', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'testing', 'page.tsx'), 'utf8');

  test('one page for every reader, the answer card, the shared bar and the family chips', () => {
    expect(page).toContain('view="one-page"');
    expect(page).toContain('<AnswerCard');
    expect(page).toContain('<PageAnchorBar');
    expect(page).not.toContain('CcProvenanceChip');
    for (const id of Object.values(TESTING_SECTION_IDS)) expect(page, id).toContain(`id="${id}"`);
  });

  test('no charts, no coverage estimate, no tenant form', () => {
    expect(page).not.toMatch(/TestingPieChart|TestingBarChart|coverageEstimate|\/api\/s4-credentials/);
    expect(page).toContain('/settings#sap-test-system');
  });
});
