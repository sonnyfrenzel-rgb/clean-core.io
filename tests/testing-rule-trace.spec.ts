import { test, expect } from '@playwright/test';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { buildOriginEngine } from '../lib/scenario-origin-engine';
import {
  assessCase,
  assessmentSummary,
  countAssessments,
  materialRules,
  materialTables,
  parseRuleTrace,
  ruleCoverage,
  ruleCoverageSentence,
  ruleTracePromptSection,
  ruleTraceOf,
  withRuleTrace,
  type RuleTrace,
} from '../lib/testing-rule-trace';
import { withOriginCheck } from '../lib/scenario-origin';
import { TESTING_RESPONSE_SCHEMA } from '../lib/model-response-schema';

/**
 * 3.0.10 (owner 11.10.2026, external review F-01/F-05): every material
 * business rule of the ORIGINAL gets a case whose expected result is stated
 * from the original, traced to the rule's id and lines; each case is then
 * assessed old against new — passed against a model-stated expectation /
 * deliberately changed / defect / not yet assessable — from the run's verdict
 * and the owner's decision on the rule. A traced pass is never "unchanged"
 * (QA review of 11e3bc7d90e8): nothing ties the test's assertion to the stated
 * result, and that result is the model's reading of the original.
 *
 * The source below is the credit-reference rule of ZFI_AR_COLLECTION_WORKLIST
 * (original lines 534–566) in small: a reference validates identity with the
 * full key and the customer; it never overrides the posted terms.
 */

const SOURCE = [
  'REPORT zfi_trace_demo.',
  'DATA gs_item TYPE zfi_s_item.',
  'START-OF-SELECTION.',
  '  PERFORM determine_item_due CHANGING gs_item.',
  '',
  'FORM determine_item_due CHANGING ps_item TYPE zfi_s_item.',
  '  DATA ls_ref TYPE bsid.',
  "  IF ps_item-shkzg = 'H' AND ps_item-rebzg IS NOT INITIAL AND ps_item-rebzg <> 'V'.",
  '    SELECT SINGLE * FROM bsid INTO ls_ref WHERE bukrs = ps_item-bukrs AND belnr = ps_item-rebzg AND gjahr = ps_item-rebzj.',
  "    IF sy-subrc <> 0 OR ls_ref-koart <> 'D' OR ls_ref-kunnr <> ps_item-kunnr.",
  "      ps_item-due_note = 'Reference not verified; posted terms are kept'.",
  '    ENDIF.',
  '  ENDIF.',
  '  IF ps_item-zfbdt IS INITIAL.',
  "    ps_item-bucket = 'UNKNOWN'.",
  "    ps_item-action = 'DUE_DATE_REVIEW'.",
  '    RETURN.',
  '  ENDIF.',
  '  ps_item-netdt = ps_item-zfbdt + ps_item-zbd3t.',
  'ENDFORM.',
].join('\n');

const set = deriveBusinessRules(SOURCE);
const rules = materialRules(set);
const engine = buildOriginEngine(SOURCE, null);

const credit18 = {
  ruleId: 'BR-002',
  kind: 'exception',
  lines: ['10-11'],
  quote: "IF sy-subrc <> 0 OR ls_ref-koart <> 'D' OR ls_ref-kunnr <> ps_item-kunnr.",
  originalBehaviour: 'The reference 1999999999 is not a customer item of 0000100003, so the credit keeps its own posted terms.',
  expectedFromOriginal: 'Credit 1900000018 (−25 EUR, no baseline date): due date unknown, bucket UNKNOWN, action DUE_DATE_REVIEW.',
};

test.describe('material rules and the prompt', () => {
  test('the engine reads the rules of the original, each with an id, lines and a quote', () => {
    expect(rules.map((r) => r.id)).toEqual(['BR-001', 'BR-002']);
    expect(rules[1].quote).toContain('ls_ref-kunnr <> ps_item-kunnr');
    expect(rules[1].ranges[0]).toEqual({ lineStart: 10, lineEnd: 10 });
    expect(rules.every((r) => r.routine === 'DETERMINE_ITEM_DUE')).toBe(true);
  });

  test('the prompt lists every rule with its lines and asks for an expected result from the ORIGINAL', () => {
    const prompt = ruleTracePromptSection(rules, materialTables(set));
    for (const r of rules) expect(prompt).toContain(`${r.id} (rule, in DETERMINE_ITEM_DUE) at L`);
    expect(prompt).toContain('AT LEAST ONE test case for EVERY business rule');
    expect(prompt).toContain('"expectedFromOriginal"');
    expect(prompt).toContain('Derive "expectedFromOriginal" ONLY from the legacy ABAP');
    expect(prompt).toContain('missing baseline date leaves the due date unknown');
    expect(prompt).toContain('Never read it off the generated code');
  });

  test('without rules the prompt asks for no trace', () => {
    expect(ruleTracePromptSection([])).toContain('Write no "ruleTrace"');
  });

  test('the response schema carries ruleTrace, optional, with the rule id, lines and expected result required inside it', () => {
    const item = TESTING_RESPONSE_SCHEMA.properties.testCases.items as unknown as {
      properties: Record<string, { required?: string[] }>;
      required: string[];
    };
    expect(item.properties.ruleTrace.required).toEqual(['ruleId', 'lines', 'expectedFromOriginal']);
    expect(item.required).not.toContain('ruleTrace');
  });
});

test.describe('the trace on a case', () => {
  test('a trace is read: the rule id normalised, lines parsed, the expected result kept', () => {
    const parsed = parseRuleTrace({ ...credit18, ruleId: 'br-2' });
    expect(parsed.state).toBe('stated');
    const trace = (parsed as { trace: RuleTrace }).trace;
    expect(trace.ruleId).toBe('BR-002');
    expect(trace.lines).toEqual([{ start: 10, end: 11 }]);
    expect(trace.kind).toBe('exception');
    expect(trace.expectedFromOriginal).toContain('bucket UNKNOWN');
  });

  test('a trace without an expected result from the original, or with no rule id, is dropped with the reason', () => {
    expect(parseRuleTrace({ ruleId: 'BR-002', lines: ['10'] })).toEqual({ state: 'malformed', reason: 'it states no expected result from the original' });
    expect(parseRuleTrace({ ruleId: 'CC-003', lines: ['10'], expectedFromOriginal: 'x' }).state).toBe('malformed');
    expect(parseRuleTrace({ lines: ['10'], expectedFromOriginal: 'x' })).toEqual({ state: 'malformed', reason: 'it names no rule id' });
    expect(parseRuleTrace(undefined)).toEqual({ state: 'not-stated' });
    const stored = withRuleTrace({ id: 'TC_09', ruleTrace: { ruleId: 'BR-002', lines: ['10'] } });
    expect(stored.ruleTrace).toBeUndefined();
    expect(stored.ruleTraceDropped).toBe("The model's rule trace was dropped: it states no expected result from the original.");
  });

  test('a traced case without derivedFrom gets one from the trace, and the origin check anchors it to the rule', () => {
    const stored = withOriginCheck(withRuleTrace({ id: 'TC_07', name: 'credit', ruleTrace: credit18 }), engine, 'n/a');
    expect(stored.derivedFrom).toEqual({ kind: 'rule', ref: 'BR-002', lines: [{ start: 10, end: 11 }], quote: credit18.quote });
    expect((stored.derivedFromCheck as { outcome: string }).outcome).toBe('anchored');
    expect(ruleTraceOf(stored)?.ruleId).toBe('BR-002');
  });
});

test.describe('rule coverage', () => {
  const traced = (id: string, ruleId: string, lines: string[]) => withRuleTrace({ id, ruleTrace: { ruleId, lines, expectedFromOriginal: 'x' } });

  test('a rule counts as covered by a case whose trace the source confirms; a missing rule is named', () => {
    const c = ruleCoverage(rules, [traced('TC_01', 'BR-002', ['10'])], engine);
    expect(c).toEqual({ covered: ['BR-002'], missing: ['BR-001'], mismatched: [], total: 2 });
    expect(ruleCoverageSentence(c)).toBe('1 of 2 business rules of the original have a case with an expected result from the original · not covered: BR-001');
  });

  test('a trace whose lines are not where the rule stands does not cover it and is reported', () => {
    const c = ruleCoverage(rules, [traced('TC_01', 'BR-002', ['3'])], engine);
    expect(c.covered).toEqual([]);
    expect(c.mismatched).toEqual([{ caseId: 'TC_01', ruleId: 'BR-002', problem: 'BR-002 stands at L10, L11, not at L3.' }]);
    expect(ruleCoverageSentence(c)).toContain('1 trace does not match the source');
  });
});

test.describe('old against new, per case', () => {
  const trace = parseRuleTrace(credit18);
  const t = trace.state === 'stated' ? trace.trace : null;

  test('default: not yet assessable until a run says something', () => {
    expect(assessCase({ trace: t, verdict: null }).value).toBe('not-assessable');
    expect(assessCase({ trace: t, verdict: 'Not run' }).value).toBe('not-assessable');
    expect(assessCase({ trace: t, verdict: 'Skipped' }).sentence).toContain('(Skipped)');
  });

  test('a traced case that passed reads "passed, expectation model-stated, not verified" — never unchanged; one that failed is a defect — or, on a rule the owner marked to change, not determined', () => {
    const passed = assessCase({ trace: t, verdict: 'Passed' });
    expect(passed.value).toBe('passed-model-stated');
    expect(passed.sentence).toContain('model-stated from the original');
    expect(passed.sentence).toContain('not verified');
    expect(passed.sentence).toContain('bucket UNKNOWN');
    expect(passed.sentence).not.toMatch(/unchanged|gives the result the original gives|proven/i);
    const defect = assessCase({ trace: t, verdict: 'Failed' });
    expect(defect.value).toBe('defect');
    expect(defect.sentence).toContain('BR-002');
    expect(defect.sentence).toContain('bucket UNKNOWN');
    expect(assessCase({ trace: t, verdict: 'Failed', ruleState: 'keep' }).value).toBe('defect');
    // QA 6e1e9a6a3c3b: a rule decision does not make a failure deliberate.
    const failedOnChange = assessCase({ trace: t, verdict: 'Failed', ruleState: 'change' });
    expect(failedOnChange.value).toBe('failed-rule-changing');
    expect(failedOnChange.sentence).toContain('not determined');
    expect(failedOnChange.sentence).not.toMatch(/\bdeliberate(?:ly)? change[sd]?\b|\bnot a defect\b/i);
    expect(assessCase({ trace: t, verdict: 'Failed', ruleState: 'drop' }).value).toBe('failed-rule-changing');
    const passedAgainstChange = assessCase({ trace: t, verdict: 'Passed', ruleState: 'change' });
    expect(passedAgainstChange.value).toBe('passed-model-stated');
    expect(passedAgainstChange.sentence).toContain('check whether the decided change is in the code yet');
    expect(passedAgainstChange.sentence).toContain('not verified');
  });

  test('a case without a trace says nothing about old against new; the invariant does', () => {
    expect(assessCase({ trace: null, verdict: 'Passed' }).value).toBe('not-assessable');
    expect(assessCase({ trace: null, verdict: 'Failed', invariant: true }).value).toBe('defect');
    expect(assessCase({ trace: null, verdict: 'Passed', invariant: true }).value).toBe('unchanged');
  });

  test('the counts read as one line', () => {
    const counts = countAssessments(['unchanged', 'defect', 'defect', 'not-assessable', 'failed-rule-changing']);
    expect(assessmentSummary(counts)).toBe('Old against new: 1 unchanged · 1 failed on a rule marked to change, not determined · 2 defects · 1 not yet assessable');
    const traced = countAssessments(['passed-model-stated', 'passed-model-stated', 'defect']);
    expect(assessmentSummary(traced)).toBe('Old against new: 0 unchanged · 2 passed, expectation model-stated, not verified · 1 defect · 0 not yet assessable');
  });
});
