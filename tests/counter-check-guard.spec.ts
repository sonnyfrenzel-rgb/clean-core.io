import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveCounterCheckScenarios,
  scenarioDemonstrations,
  TEST_DATA_NOTE,
  type CounterCheckScenario,
  type CounterCheckScenarios,
  type ScenarioCaseLink,
} from '../lib/abap/counter-check';
import { deriveStandardCoverage, type CatalogLookup } from '../lib/abap/standard-coverage';
import { coveringTestRunReceipt, isTestRunReceipt, TEST_RUN_RECEIPT_VERSION } from '../lib/test-receipt';
import { EVIDENCE_CEILING, fitOfLevel } from '../lib/evidence-level';
import { objectStatus } from '../lib/object-status';
import { receiptFor } from './helpers/test-receipt';

/**
 * Counter-check scenarios and the receipt that earns them — roadmap 7.3.
 *
 * The phase's acceptance line names W22-A15 and W22-A16, and the 2.7 catalogue
 * spells them out: *Test simuliert, übersprungen oder nur Connectivity → kein
 * View stellt dies als erfolgreiche fachliche Ausführung dar*, and *tatsächlicher
 * Test auf anderem Codehash → Nachweis gilt nicht stillschweigend für die
 * aktuelle Ausgabe*. Two more come with them from UX-E08-F01/F02: *ein
 * bestätigter Szenarioentwurf wird nicht als tatsächlich durchgeführter Test
 * angezeigt*, and *Umgebung und ersetzte Abhängigkeiten sind am Ergebnis
 * sichtbar*.
 *
 * Every assertion below runs the real derivation on real ABAP — the eight
 * programs this product ships, plus three snippets for the cases none of them
 * contains — and the real receipt reader on real receipts. Nothing is asserted
 * against a hand-written copy of the arithmetic.
 *
 * **Not vacuous.** On 2026-09-18 each of the seventeen assurances below was
 * broken on its own in the module it belongs to, this spec was run, the failure
 * observed, and the change taken back. The number is how many of its 27 tests
 * went red:
 *
 *   - `scenarioDemonstrations` accepting any verdict, not only `Passed` — 1;
 *   - it inventing a link when none was declared (falling back to the first
 *     case the receipt reports) — 1;
 *   - it ignoring `scope.selected` — 1;
 *   - the `demonstration` ceiling raised from E3 to E4 — 1;
 *   - `fitOfLevel('E3')` returning `done` — 1;
 *   - the evidence sentence dropping the stub list — 1;
 *   - the counter arm reusing the positive wording (`>` → *greater than* on
 *     both arms) — 1;
 *   - `TEST_DATA_NOTE` dropped from the Given — 1;
 *   - a declaration-only rule silently dropped instead of listed — 3;
 *   - the caveat dropped from the data need — 1;
 *   - the "condition only partly read" note dropped — 1;
 *   - a field symbol's angle brackets counted as two comparisons — 1;
 *   - `isTestRunReceipt` accepting a receipt with no `stubs` — 1;
 *   - the same with no `scope` — 1;
 *   - `isTestRunReceipt` accepting the previous version number — 1;
 *   - a scenario carrying a verdict field of its own — 1;
 *   - the runner writing a scope it did not narrow to the cases the project
 *     holds — 1.
 *
 * The first attempt at the version assurance was one of those that did **not**
 * go red: it deleted `scope` and `stubs` along with lowering `v`, so the shape
 * check refused the receipt for the wrong reason and the version check was never
 * exercised. It asserts on the version alone now.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const example = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const PO = 'Z_MM_PO_APPROVAL.abap';
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const ALL_EXAMPLES = [
  PO,
  LEGACY,
  'Z_BUSINESS_PARTNER_SYNC.txt',
  'Z_EMPLOYEE_EXPENSE_VAL.txt',
  'Z_INVOICE_EXTRACTOR.txt',
  'Z_MATERIAL_STOCK_CALC.txt',
  'Z_ORDER_INTEGRITY_CHECK.txt',
  'Z_SALES_ORDER_CREATOR.txt',
];

/** One rule on one field of a table SAP's catalogue knows — the E1 case of 7.2. */
const HIT = `REPORT ztest.

DATA: gs_eban TYPE eban.

START-OF-SELECTION.
  PERFORM check_currency.

FORM check_currency.
  SELECT SINGLE * FROM eban INTO gs_eban WHERE banfn = '0010000001'.
  IF gs_eban-waers <> 'EUR'.
    WRITE / 'foreign currency'.
  ENDIF.
ENDFORM.
`;

/** A decision whose subject the engine cannot read out of the code. */
const NO_SUBJECT = `REPORT ztest.
START-OF-SELECTION.
  PERFORM check_it.

FORM check_it.
  IF lo_ref->get_value( ) > 42.
    WRITE / 'over'.
  ENDIF.
ENDFORM.
`;

/** A condition that mixes AND with OR: no combination rule may be stated for it. */
const MIXED = `REPORT ztest.
START-OF-SELECTION.
  PERFORM check_it.

FORM check_it.
  IF gs_x-a = 'A' AND gs_x-b = 'B' OR gs_x-c = 'C'.
    WRITE / 'hit'.
  ENDIF.
ENDFORM.
`;

const ONE_ENTRY: CatalogLookup = {
  successorFor: (o) => (o === 'EBAN' ? 'API_PURCHASEREQUISITION_SRV' : null),
};

const forRule = (out: CounterCheckScenarios, ruleId: string): CounterCheckScenario[] =>
  out.scenarios.filter((s) => s.ruleId === ruleId);

/** Every sentence a scenario puts in front of a reader. */
function sentencesOf(out: CounterCheckScenarios): string[] {
  const sentences: string[] = [];
  for (const s of out.scenarios) {
    sentences.push(s.title, s.given.text, s.when.text, s.then.text, ...s.notes);
    if (s.blocked) sentences.push(s.blocked.detail);
    for (const need of s.data) sentences.push(need.requirement, need.caveat ?? '');
  }
  for (const w of out.withoutScenario) sentences.push(w.detail);
  return sentences;
}

/* ---------------------------------------------- the project a receipt is about */

const PROJECT = {
  activeRunId: 'run-1',
  generatedCode: 'export const approve = (x: number) => x > 5;\n',
  testSuite: { code: "import test from 'node:test';\n" },
  testCases: [
    { id: 't1', name: 'currency is not EUR' },
    { id: 't2', name: 'currency is EUR' },
  ],
};

/** The scenarios of the one-rule example, and the two cases that would execute them. */
const hitScenarios = () => deriveCounterCheckScenarios(HIT);
const LINKS: ScenarioCaseLink[] = [
  { scenarioId: 'CCS-001', caseId: 't1', source: 'the guard' },
  { scenarioId: 'CCS-002', caseId: 't2', source: 'the guard' },
];

/** The receipt `/api/run-tests` would have written, as it covers this project. */
function covering(
  verdicts: Array<{ id: string; status: 'Passed' | 'Failed' | 'Skipped' | 'Todo' | 'Error' | 'Not run' }>,
  over?: Parameters<typeof receiptFor>[2],
) {
  const receipt = receiptFor(PROJECT, verdicts, over);
  return coveringTestRunReceipt({ ...PROJECT, testRunReceipt: receipt });
}

/* ================================================================== *
 * 1 — a scenario is a question, not an answer
 * ================================================================== */

test.describe('a scenario is a question, not an answer', () => {
  test('no scenario carries an outcome, and no sentence claims one', () => {
    const tables = [
      hitScenarios(),
      deriveCounterCheckScenarios(NO_SUBJECT),
      deriveCounterCheckScenarios(MIXED),
      ...ALL_EXAMPLES.map((n) => deriveCounterCheckScenarios(example(n))),
    ];
    // The shape first: a field called `status`, `verdict`, `result` or `passed`
    // on a scenario would be a place for a browser to write a green one.
    for (const table of tables) {
      for (const scenario of table.scenarios) {
        const keys = Object.keys(scenario);
        for (const forbidden of ['status', 'verdict', 'result', 'passed', 'outcome', 'level']) {
          expect(keys, `${scenario.id} carries "${forbidden}"`).not.toContain(forbidden);
        }
      }
    }
    // And the words: a scenario that has not run may not read as one that has.
    const forbidden = [
      /\bpassed\b/i,
      /\bproven\b/i,
      /\bverified\b/i,
      /\bconfirmed\b/i,
      /\bsuccessful\b/i,
      /\bcovered by the standard\b/i,
      /\bno standard\b/i,
    ];
    const offenders: string[] = [];
    for (const table of tables) {
      for (const sentence of sentencesOf(table)) {
        for (const pattern of forbidden) if (pattern.test(sentence)) offenders.push(`${pattern} ← ${sentence}`);
      }
    }
    expect(offenders, `a scenario read as a result:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('with no execution on record, nothing is evidence and every scenario says why', () => {
    const out = hitScenarios();
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, LINKS, null);
    expect(evidence).toEqual({});
    expect(refused.map((r) => r.reason)).toEqual(out.scenarios.map(() => 'no-receipt'));
    for (const entry of refused) expect(entry.detail.length).toBeGreaterThan(0);
  });

  test('and the capability it belongs to stays Not determined', () => {
    // The whole point of 7.2's E0/E1: a drafted scenario changes nothing about
    // what is established.
    const coverage = deriveStandardCoverage(HIT, { catalog: ONE_ENTRY });
    const capability = coverage.capabilities.find((c) => c.key === 'GS_EBAN-WAERS');
    expect(capability?.level).toBe('E1');
    expect(capability?.fit).toBeNull();
    expect(capability?.fitProvenance).toBe('not-determined');
  });
});

/* ================================================================== *
 * 2 — the counter-check is the second scenario
 * ================================================================== */

test.describe('every decision gets both arms', () => {
  test('two scenarios per rule, one per arm, on every shipped program', () => {
    for (const name of ALL_EXAMPLES) {
      const out = deriveCounterCheckScenarios(example(name));
      const ruleIds = [...new Set(out.scenarios.map((s) => s.ruleId))];
      for (const ruleId of ruleIds) {
        expect(
          forRule(out, ruleId).map((s) => s.arm),
          `${name} ${ruleId} does not have both arms`,
        ).toEqual(['applies', 'does-not-apply']);
      }
      // Two arms each, plus the rules that yield none — and together they are
      // every rule, so nothing was dropped on the way.
      expect(out.counts.scenarios, name).toBe(ruleIds.length * 2);
      expect(ruleIds.length + out.counts.withoutScenario, name).toBe(out.counts.rules);
    }
  });

  test('the counter arm inverts the requirement rather than negating the sentence', () => {
    const po = deriveCounterCheckScenarios(example(PO));
    // `<>` on one arm is `=` on the other.
    expect(forRule(po, 'BR-004').map((s) => s.data[0].requirement)).toEqual([
      "different from 'EUR'",
      "equal to 'EUR'",
    ]);
    // `>` inverts to "at most", which names the boundary the counter-check needs
    // — "not greater than 5" is one reading away from "less than 5".
    expect(forRule(po, 'BR-009').map((s) => s.data[0].requirement)).toEqual([
      'greater than 5',
      'at most 5',
    ]);
    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    expect(forRule(legacy, 'BR-004').map((s) => s.data[0].requirement)).toEqual([
      'at least 80',
      'less than 80',
    ]);
    // And a pattern is a pattern on both arms.
    expect(forRule(po, 'BR-005').map((s) => s.data[1].requirement)).toEqual([
      "matching the pattern 'EMERG*'",
      "not matching the pattern 'EMERG*'",
    ]);
  });

  test('the combination inverts with it, because one broken AND is enough', () => {
    const po = deriveCounterCheckScenarios(example(PO));
    // `A OR B` holds on either, and fails only when both fail.
    expect(forRule(po, 'BR-005').map((s) => s.combination)).toEqual(['any', 'all']);
    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    // `A AND B` needs both, and fails on either.
    expect(forRule(legacy, 'BR-001').map((s) => s.combination)).toEqual(['all', 'any']);
    // A `CASE` lists alternatives; so does an IF/ELSEIF chain grading one field.
    expect(forRule(po, 'BR-007').map((s) => s.combination)).toEqual(['any', 'all']);
    expect(forRule(legacy, 'BR-008').map((s) => s.combination)).toEqual(['any', 'all']);
    // And where AND meets OR, no combination is stated at all: the precedence is
    // the code's, and a guess would hand somebody a record that produces the
    // other case.
    const mixed = deriveCounterCheckScenarios(MIXED);
    expect(mixed.scenarios.map((s) => s.combination)).toEqual(['as-written', 'as-written']);
    expect(mixed.scenarios[0].given.text).toContain("gs_x-a = 'A' AND gs_x-b = 'B' OR gs_x-c = 'C'");
  });

  test('the measured reading of the two programs that have rules', () => {
    // Measured, not chosen. Eleven decisions in the purchase-requisition
    // example, three of them constants nothing reads — those yield no scenario
    // and are listed instead.
    const po = deriveCounterCheckScenarios(example(PO));
    expect(po.program).toBe('Z_MM_PO_APPROVAL');
    expect(po.counts).toEqual({
      rules: 11,
      scenarios: 16,
      runnable: 16,
      blocked: { 'subject-not-named': 0 },
      withoutScenario: 3,
      dataNeeds: 22,
      withCapability: 16,
    });
    expect(po.withoutScenario.map((w) => w.ruleId)).toEqual(['BR-001', 'BR-002', 'BR-003']);

    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    expect(legacy.counts.rules).toBe(16);
    expect(legacy.counts.scenarios).toBe(30);
    expect(legacy.counts.withoutScenario).toBe(1);
  });

  test('the same source gives the same scenarios with the same numbers', () => {
    expect(JSON.stringify(deriveCounterCheckScenarios(example(PO)))).toBe(
      JSON.stringify(deriveCounterCheckScenarios(example(PO))),
    );
  });

  test('no source is not zero scenarios', () => {
    for (const nothing of ['', '  \n\t ']) {
      const out = deriveCounterCheckScenarios(nothing);
      expect(out.noSource, JSON.stringify(nothing)).toBe(true);
      expect(out.scenarios).toEqual([]);
    }
    const noRules = deriveCounterCheckScenarios(example('Z_INVOICE_EXTRACTOR.txt'));
    expect(noRules.noSource).toBe(false);
    expect(noRules.scenarios).toEqual([]);
  });
});

/* ================================================================== *
 * 3 — the test data need is what makes it a task
 * ================================================================== */

test.describe('the test data need', () => {
  test('every runnable scenario names a field, a value and the line it stands on', () => {
    for (const name of ALL_EXAMPLES) {
      const out = deriveCounterCheckScenarios(example(name));
      for (const scenario of out.scenarios) {
        if (scenario.blocked) continue;
        expect(scenario.data.length, `${name} ${scenario.id} has no data need`).toBeGreaterThan(0);
        for (const need of scenario.data) {
          expect(need.field, `${name} ${scenario.id}`).not.toBeNull();
          expect(need.literal.length, `${name} ${scenario.id}`).toBeGreaterThan(0);
          expect(need.requirement, `${name} ${scenario.id}`).toContain(need.literal);
          expect(need.anchors.length, `${name} ${scenario.id}`).toBeGreaterThan(0);
          for (const anchor of need.anchors) expect(anchor).toMatch(/^L\d+$/);
        }
      }
    }
  });

  test('and says, every time, that somebody has to provide it', () => {
    expect(TEST_DATA_NOTE).toContain('provide');
    for (const name of ALL_EXAMPLES) {
      const out = deriveCounterCheckScenarios(example(name));
      for (const scenario of out.scenarios) {
        expect(scenario.given.text, `${name} ${scenario.id}`).toContain(TEST_DATA_NOTE);
        expect(scenario.given.text.startsWith('Given '), `${name} ${scenario.id}`).toBe(true);
        expect(scenario.when.text.startsWith('When '), `${name} ${scenario.id}`).toBe(true);
        expect(scenario.then.text.startsWith('Then '), `${name} ${scenario.id}`).toBe(true);
        // Every clause stands on a line somebody can read back.
        for (const clause of [scenario.given, scenario.when, scenario.then]) {
          expect(clause.anchors.length, `${name} ${scenario.id} ${clause.kind}`).toBeGreaterThan(0);
        }
      }
    }
  });

  test('a rule copied into fourteen routines is still one record to prepare', () => {
    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    const [applies] = forRule(legacy, 'BR-001');
    expect(applies.data.map((d) => d.field)).toEqual(['is_order-auart', 'is_order-vkorg']);
    // Nothing is lost by folding them: all fourteen places travel with the need.
    expect(applies.data[0].anchors.length).toBe(14);
    expect(applies.data[0].anchors[0]).toBe('L691');
  });

  test('what the code does not say is said', () => {
    const po = deriveCounterCheckScenarios(example(PO));
    // An amount whose currency the code never states. Somebody preparing the
    // record would otherwise have to guess, and a guess here is a wrong test.
    for (const scenario of forRule(po, 'BR-010')) {
      expect(scenario.data[0].caveat).toBe('Betrag, Währung nicht aus dem Code ableitbar');
      expect(scenario.notes.join(' ')).toContain('Not stated in the code');
      // The same condition also tests something the engine could not read.
      expect(scenario.notes.join(' ')).toContain('compares more than the engine could read');
    }
    // `p_lim IS INITIAL OR p_lim GT c_max_items` — one of the two tests has no
    // literal to read, so the value list below is not the whole condition.
    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    for (const scenario of forRule(legacy, 'BR-003')) {
      expect(scenario.notes.join(' ')).toContain('compares more than the engine could read');
    }
  });

  test('and a field symbol is not mistaken for two comparisons', () => {
    // `<fs_order>-risk_score GE c_critical_score` is one comparison. Reading the
    // angle brackets as operators reported every field-symbol condition as only
    // partly read, on a source where it had been read completely.
    const legacy = deriveCounterCheckScenarios(example(LEGACY));
    for (const scenario of forRule(legacy, 'BR-004')) {
      expect(scenario.data.map((d) => d.field)).toEqual(['<fs_order>-risk_score']);
      expect(scenario.notes.join(' ')).not.toContain('compares more than the engine could read');
    }
  });

  test('a decision nobody can prepare a record for says so instead of inventing one', () => {
    const out = deriveCounterCheckScenarios(NO_SUBJECT);
    expect(out.scenarios.length).toBe(2);
    for (const scenario of out.scenarios) {
      expect(scenario.blocked?.reason).toBe('subject-not-named');
      expect(scenario.blocked?.detail).toContain('which record to prepare');
      // It also reaches no capability, which is where 7.2 files the same rule.
      expect(scenario.capabilityKey).toBeNull();
    }
    expect(out.counts.runnable).toBe(0);
    expect(deriveStandardCoverage(NO_SUBJECT).unassigned.map((u) => u.ruleId)).toEqual(['BR-001']);
  });

  test('a constant nothing reads yields no scenario and is not dropped either', () => {
    const po = deriveCounterCheckScenarios(example(PO));
    expect(po.withoutScenario).toEqual([
      { ruleId: 'BR-001', reason: 'declaration-only', detail: expect.stringContaining('no IF, CASE, CHECK or WHILE') },
      { ruleId: 'BR-002', reason: 'declaration-only', detail: expect.stringContaining('no IF, CASE, CHECK or WHILE') },
      { ruleId: 'BR-003', reason: 'declaration-only', detail: expect.stringContaining('no IF, CASE, CHECK or WHILE') },
    ]);
    expect(po.scenarios.some((s) => s.ruleId === 'BR-001')).toBe(false);
  });

  test('a scenario in a routine nothing reaches says that, and is still written', () => {
    const po = deriveCounterCheckScenarios(example(PO));
    for (const scenario of forRule(po, 'BR-007')) {
      expect(scenario.notes.join(' ')).toContain('not reached from any event block');
      expect(scenario.blocked).toBeNull();
    }
  });
});

/* ================================================================== *
 * 4 — W22-A15 / W22-A16: nothing unearned becomes evidence
 * ================================================================== */

test.describe('an execution earns evidence, and only an execution', () => {
  test('a pass on the code under review reaches E3 — and E3 is not green', () => {
    const out = hitScenarios();
    const receipt = covering([
      { id: 't1', status: 'Passed' },
      { id: 't2', status: 'Passed' },
    ]);
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, LINKS, receipt);
    expect(refused).toEqual([]);
    expect(Object.keys(evidence)).toEqual(['GS_EBAN-WAERS']);
    expect(evidence['GS_EBAN-WAERS'].map((e) => e.kind)).toEqual(['demonstration', 'demonstration']);

    // Fed into 7.2's table it lifts exactly one rung, to E3, and stops there.
    const coverage = deriveStandardCoverage(HIT, {
      catalog: ONE_ENTRY,
      supplied: { 'GS_EBAN-WAERS': { evidence: evidence['GS_EBAN-WAERS'] } },
    });
    const capability = coverage.capabilities.find((c) => c.key === 'GS_EBAN-WAERS');
    expect(EVIDENCE_CEILING.demonstration).toBe('E3');
    expect(capability?.level).toBe('E3');
    expect(capability?.fit).toBe('mock-only');
    expect(capability?.fitProvenance).toBe('demonstrated-mock');
    expect(capability?.fit && objectStatus(capability.fit).state, 'a sandbox run reached a success state').not.toBe(
      'success',
    );
    expect(fitOfLevel('E3').status).not.toBe('done');
    // And the next step is still the one that would settle it.
    expect(capability?.next).toContain('target system');
  });

  test('the evidence says which environment it came from and what was stubbed', () => {
    const out = hitScenarios();
    const receipt = covering([{ id: 't1', status: 'Passed' }], { stubs: ['@sap/xssec', 'express'] });
    const { evidence } = scenarioDemonstrations(out.scenarios, LINKS, receipt);
    const [first] = evidence['GS_EBAN-WAERS'];
    expect(first.source).toContain('mock');
    expect(first.source, 'the replaced dependencies are not on the result').toContain('@sap/xssec, express');

    // And with nothing stubbed it says that too — a missing sentence and "no
    // package stubbed" look the same on screen, and only one is a statement.
    const clean = scenarioDemonstrations(out.scenarios, LINKS, covering([{ id: 't1', status: 'Passed' }]));
    expect(clean.evidence['GS_EBAN-WAERS'][0].source).toContain('no package stubbed');
  });

  test('skipped, todo, failed, errored and unmentioned are each refused, by name', () => {
    const out = hitScenarios();
    const cases: Array<[('Skipped' | 'Todo' | 'Failed' | 'Error' | 'Not run'), string]> = [
      ['Skipped', 'not-passed'],
      ['Todo', 'not-passed'],
      ['Failed', 'not-passed'],
      ['Error', 'not-passed'],
      ['Not run', 'not-passed'],
    ];
    for (const [status, reason] of cases) {
      const receipt = covering([{ id: 't1', status }]);
      const { evidence, refused } = scenarioDemonstrations(out.scenarios, LINKS, receipt);
      expect(evidence, `${status} produced evidence`).toEqual({});
      const first = refused.find((r) => r.scenarioId === 'CCS-001');
      expect(first?.reason, status).toBe(reason);
      expect(first?.verdict, status).toBe(status);
    }
    // A case the runner never mentioned is its own absence, not a verdict.
    const silent = covering([{ id: 't2', status: 'Passed' }]);
    const { refused } = scenarioDemonstrations(out.scenarios, LINKS, silent);
    expect(refused.find((r) => r.scenarioId === 'CCS-001')?.reason).toBe('not-reported');
    expect(refused.find((r) => r.scenarioId === 'CCS-001')?.verdict).toBeNull();
  });

  test('a run of other cases does not reach the ones it was not asked for', () => {
    const out = hitScenarios();
    // The runner was asked for t2 alone. Even a receipt that somehow carried a
    // verdict for t1 does not make t1 part of this run.
    const receipt = covering(
      [
        { id: 't1', status: 'Passed' },
        { id: 't2', status: 'Passed' },
      ],
      { scope: { selected: ['t2'], cases: 2 } },
    );
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, LINKS, receipt);
    expect(Object.keys(evidence)).toEqual(['GS_EBAN-WAERS']);
    expect(evidence['GS_EBAN-WAERS'].length, 'the out-of-scope case became evidence').toBe(1);
    expect(refused.find((r) => r.scenarioId === 'CCS-001')?.reason).toBe('out-of-scope');
  });

  test('W22-A16: an execution of other code is not an execution of this code', () => {
    const receipt = receiptFor(PROJECT, [
      { id: 't1', status: 'Passed' },
      { id: 't2', status: 'Passed' },
    ]);
    const rewritten = { ...PROJECT, generatedCode: 'export const approve = () => true;\n', testRunReceipt: receipt };
    expect(coveringTestRunReceipt(rewritten), 'a rewritten codebase kept its receipt').toBeNull();

    const out = hitScenarios();
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, LINKS, coveringTestRunReceipt(rewritten));
    expect(evidence).toEqual({});
    expect(refused.every((r) => r.reason === 'no-receipt')).toBe(true);

    // The same for a regenerated suite, another run, and a changed case list.
    for (const changed of [
      { testSuite: { code: 'other suite' } },
      { activeRunId: 'run-2' },
      { testCases: [...PROJECT.testCases, { id: 't3', name: 'new' }] },
    ]) {
      expect(
        coveringTestRunReceipt({ ...PROJECT, ...changed, testRunReceipt: receipt }),
        JSON.stringify(changed),
      ).toBeNull();
    }
  });

  test('nobody has said which case executes it, so nothing is attributed to it', () => {
    const out = hitScenarios();
    const receipt = covering([
      { id: 't1', status: 'Passed' },
      { id: 't2', status: 'Passed' },
    ]);
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, [], receipt);
    expect(evidence, 'a link was guessed').toEqual({});
    expect(refused.every((r) => r.reason === 'not-linked')).toBe(true);
    // Half a link is half an attribution, not a whole one.
    const partial = scenarioDemonstrations(out.scenarios, [LINKS[0]], receipt);
    expect(partial.evidence['GS_EBAN-WAERS'].length).toBe(1);
    expect(partial.refused.map((r) => r.reason)).toEqual(['not-linked']);
  });

  test('a scenario nobody can run produces nothing, whatever the receipt says', () => {
    const out = deriveCounterCheckScenarios(NO_SUBJECT);
    const receipt = covering([
      { id: 't1', status: 'Passed' },
      { id: 't2', status: 'Passed' },
    ]);
    const links: ScenarioCaseLink[] = out.scenarios.map((s, i) => ({
      scenarioId: s.id,
      caseId: i === 0 ? 't1' : 't2',
      source: 'the guard',
    }));
    const { evidence, refused } = scenarioDemonstrations(out.scenarios, links, receipt);
    expect(evidence).toEqual({});
    expect(refused.every((r) => r.reason === 'blocked')).toBe(true);
  });
});

/* ================================================================== *
 * 5 — the receipt records the scope, the environment and the stubs
 * ================================================================== */

test.describe('the receipt says what the run covered and against what', () => {
  test('a receipt without them is not a receipt', () => {
    const complete = receiptFor(PROJECT, [{ id: 't1', status: 'Passed' }]);
    expect(isTestRunReceipt(complete)).toBe(true);
    expect(complete.environment).toBe('mock');
    expect(complete.scope).toEqual({ selected: null, cases: 2 });
    expect(complete.stubs).toEqual([]);

    for (const missing of ['scope', 'stubs'] as const) {
      const without = { ...complete };
      delete (without as Record<string, unknown>)[missing];
      expect(isTestRunReceipt(without), `a receipt with no ${missing} was accepted`).toBe(false);
    }
    // `selected: []` is "the caller asked for nothing", and a number of cases is
    // required: a scope that cannot say how much it left out is not a scope.
    expect(isTestRunReceipt({ ...complete, scope: { selected: null } })).toBe(false);
    expect(isTestRunReceipt({ ...complete, stubs: [{}] })).toBe(false);
  });

  test('and a receipt of the previous version is refused rather than defaulted', () => {
    // Defaulting `stubs` to `[]` would be the claim itself: no version-1 receipt
    // ever established that nothing was replaced.
    expect(TEST_RUN_RECEIPT_VERSION).toBe(2);
    const complete = receiptFor(PROJECT, [{ id: 't1', status: 'Passed' }]);
    // The version alone decides, with everything else in place: a receipt that
    // announces an older claim set is refused even when it happens to carry the
    // newer fields.
    expect(isTestRunReceipt({ ...complete, v: TEST_RUN_RECEIPT_VERSION - 1 })).toBe(false);
    expect(isTestRunReceipt({ ...complete, v: TEST_RUN_RECEIPT_VERSION + 1 })).toBe(false);

    const old = { ...complete, v: 1 };
    delete (old as Record<string, unknown>).scope;
    delete (old as Record<string, unknown>).stubs;
    expect(isTestRunReceipt(old)).toBe(false);
    expect(coveringTestRunReceipt({ ...PROJECT, testRunReceipt: old })).toBeNull();
  });

  test('the runner writes both, from what it observed rather than from the request', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/run-tests/route.ts'), 'utf8');
    // The stub list is the set the resolver filled while bundling — the one the
    // banner used to show and nothing kept.
    expect(route).toContain('stubs: [...stubbedPackages].sort()');
    expect(route).toContain('scope: { selected: selectedScope, cases: storedCases.length }');
    // And the selection is narrowed to cases the project holds, so a scope
    // cannot name cases no reader can see.
    expect(route).toMatch(/selectedScope[\s\S]{0,400}?known\.has\(id\)/);
    expect(route).toMatch(/Array\.isArray\(selectedTestIds\)[\s\S]{0,200}?:\s*null/);
  });
});
