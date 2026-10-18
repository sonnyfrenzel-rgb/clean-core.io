import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { goldenMasterForScaffold } from '../lib/transformation/golden-master';
import { SCAFFOLD_VERSION, type Scaffold } from '../lib/transformation/types';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { abapEngineCaseMethods } from '../lib/transformation/abap-engine-cases';
import { abapTestEvidence, countAbapUnitTests } from '../lib/testing-abap-unit';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * Scaffold version 12 — roadmap 3.0.14 items (7) and (8), from the first SAP activation of the SD package (BTP ABAP
 * trial, 15.10.2026): ABAP Unit ran 77 methods, 37 green, 0 red, 40 skipped.
 *
 *   (7) every TC_ENG_* case was written as its specification and then skipped itself. Now a case runs against the
 *       logic class and the access double: a guard case asks the check's predicate on the case's input, a precision
 *       case asserts what the declared type holds. A case that cannot run says exactly why in its skip.
 *   (8) every golden-master case ran the original's demo data and asserted nothing — reported green. Now a case with
 *       no expected result of the original on record reports itself as skipped after running: never passed.
 *
 * Fixtures only (the CO, PP and SD shapes and the PO starter example), never the owner's programs. Server-free:
 * abaplint runs in-process.
 */

const GM_FIXTURE = path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap');

function rap(source: string, options: Parameters<typeof buildRapScaffold>[2] = {}) {
  const { facts, plan } = planOf(source);
  return { scaffold: buildRapScaffold(plan, facts, options), cases: deriveEngineCases(facts.source, facts.ruleSet.rules).cases };
}
const include = (s: Scaffold) => s.files.find((f) => f.path.endsWith('.clas.testclasses.abap'))!.content;
/** The body of one test method of the include. */
const body = (text: string, method: string) => new RegExp(`\\n  METHOD ${method}\\.\\n([\\s\\S]*?)\\n  ENDMETHOD\\.`).exec(text)?.[1] ?? '';

const SOURCES: Array<[string, () => string]> = [
  ['co-shape', () => fixture('co-shape')],
  ['pp-shape', () => fixture('pp-shape')],
  ['sd-shape', () => fixture('sd-shape')],
  ['PO demo', poDemo],
];

/** Input-channel and run-identity cases: no counterpart in the logic class, skipped with the reason. */
const CHANNEL = new Set(['contract-empty-request', 'contract-integer', 'contract-non-finite', 'contract-date', 'contract-null-not-zero', 'run-identity']);

test('the scaffold version is 12 or later', () => {
  expect(SCAFFOLD_VERSION).toBeGreaterThanOrEqual(12);
  expect(rap(fixture('sd-shape')).scaffold.version).toBe(SCAFFOLD_VERSION);
});

test.describe('(7) the engine cases run in ABAP', () => {
  for (const [name, source] of SOURCES) {
    test(`${name}: the test include passes abaplint, and no case skips with the old "runs through the call contract"`, () => {
      const { scaffold } = rap(source());
      const text = include(scaffold);
      expect(text).not.toContain('the ABAP when-line follows the logic class');
      const lint = abaplintPackageCheck(scaffold.files);
      expect(lint.issues.filter((i) => i.path.endsWith('.testclasses.abap')), JSON.stringify(lint.issues.slice(0, 5))).toEqual([]);
      // The predicates are private: the include makes the engine-case class a local friend, and abaplint holds that.
      expect(text).toContain('CLASS ltc_engine_cases DEFINITION DEFERRED.');
      const unfriended = scaffold.files.map((f) => (f.path.endsWith('.testclasses.abap') ? { ...f, content: f.content.replace(/CLASS \w+ DEFINITION LOCAL FRIENDS ltc_engine_cases\.\n/, '') } : f));
      expect(abaplintPackageCheck(unfriended).issues.some((i) => /is private/.test(i.message))).toBe(true);
    });

    test(`${name}: a case whose inputs are known runs; only a case without an ABAP counterpart or a known value skips, saying why`, () => {
      const { scaffold, cases } = rap(source());
      const text = include(scaffold);
      for (const c of cases) {
        const b = body(text, c.id.toLowerCase());
        expect(b, c.id).not.toBe('');
        const skips = /=>skip\(/.test(b);
        if (CHANNEL.has(c.engineCase.kind)) {
          expect(skips, `${c.id} (${c.engineCase.kind}) is an input-channel case`).toBe(true);
          continue;
        }
        // Every precision example of a declared packed field has a machine form: it runs, never skips.
        if (c.engineCase.family === 'precision') expect(skips, `${c.id} ${c.name}\n${b}`).toBe(false);
        if (skips) {
          // An honest skip: the case id, "not run in ABAP", and a reason.
          expect(b).toMatch(new RegExp(`msg = '${c.id}: not run in ABAP - .{12,}' \\)\\.`));
          expect(b).not.toMatch(/assert_equals|assert_true/);
        } else expect(b).toMatch(/cl_abap_unit_assert=>assert_(?:equals|true)\(/);
      }
    });
  }

  test('SD shape: every guard case asks the predicate with the input the case describes, and asserts the original answer', () => {
    const { scaffold, cases } = rap(fixture('sd-shape'));
    const text = include(scaffold);
    const guards = cases.filter((c) => c.engineCase.family === 'guard');
    expect(guards.length).toBeGreaterThanOrEqual(8);
    for (const c of guards) expect(body(text, c.id.toLowerCase()), c.id).not.toMatch(/=>skip\(/);
    // BR-001 p_discnt > 30: 30.01 breaks it, 30.00 passes it.
    const b2 = body(text, cases.find((c) => c.engineCase.kind === 'guard-exclusion-necessary' && c.engineCase.trace.ruleId === 'BR-001')!.id.toLowerCase());
    expect(b2).toContain("lo_cut->p_discnt = '30.01'.\n    lv_holds = lo_cut->when_g0024( ).\n    cl_abap_unit_assert=>assert_equals( act = lv_holds exp = abap_true");
    expect(b2).toContain("lo_cut->p_discnt = '30.00'.\n    lv_holds = lo_cut->when_g0024( ).\n    cl_abap_unit_assert=>assert_equals( act = lv_holds exp = abap_false");
    // sy-subrc is a parameter of the predicate; an empty table is cleared, a filled one gets a row.
    expect(text).toContain("lv_holds = lo_cut->when_g0065(\n      iv_sy_subrc = CONV #( '1' ) ).");
    expect(text).toContain('CLEAR lo_cut->gt_orders.');
    expect(text).toContain('APPEND INITIAL LINE TO lo_cut->gt_orders.');
    // The logic class is created with the access double.
    expect(text).toContain('lo_cut = NEW #( io_access = NEW ltd_access( ) ).');
  });

  test('SD shape: precision cases assert the declared type — a selection input by the class’s own selection type', () => {
    const { scaffold } = rap(fixture('sd-shape'));
    const text = include(scaffold);
    expect(text).toContain('DATA lv_value_1 TYPE zcl_fx_sd_orders_logic=>ty_run_selection-p_discnt.');
    // Rounding: 1.005 at two places is 1.01; the overflow is refused, not wrapped.
    expect(text).toMatch(/lv_value_\d+ = '1\.005'\.\n {4}DATA lv_value_\d+_exp TYPE [^\n]+\n {4}lv_value_\d+_exp = '1\.01'\./);
    expect(text).toMatch(/TRY\.\n {8}lv_value_\d+ = '1000\.00'\.\n {6}CATCH cx_sy_conversion_overflow\.\n {8}lv_value_\d+_refused = abap_true\.\n {4}ENDTRY\./);
    // 999.99 fits P(5,2) and is then refused by BR-001: the predicate is asked.
    expect(text).toContain("lo_cut->p_discnt = '999.99'.");
  });

  test('PO demo: a CHECK on a flag the engine wrote no value for is read from its condition', () => {
    const { scaffold, cases } = rap(poDemo());
    const text = include(scaffold);
    const first = cases.find((c) => c.engineCase.trace.quote?.startsWith('CHECK gv_rejected = abap_false'))!;
    expect(first.engineCase.examples[0].call).toBeUndefined();
    const b = body(text, first.id.toLowerCase());
    expect(b).not.toMatch(/=>skip\(/);
    // CHECK refuses when its condition fails: a filled flag breaks it.
    expect(b).toContain("lo_cut->gv_rejected = 'X'.");
    expect(b).toContain('exp = abap_false');
  });

  test('a check against a quoted zero is broken by a filled value, never by a cleared one (QA 7b6b773c5216)', () => {
    // The PO demo's flag case, which the engine wrote no value for, read against `gv_count = '0'` on an integer:
    // a cleared integer is 0, which the condition holds for, so "cleared" is not a value that breaks it.
    const { cases } = rap(poDemo());
    const flag = cases.find((c) => c.engineCase.trace.quote?.startsWith('CHECK gv_rejected = abap_false'))!;
    expect(flag.engineCase.examples[0].call).toBeUndefined();
    const line = flag.engineCase.trace.lines[0].start;
    const out = abapEngineCaseMethods([flag], {
      logicClass: 'zcl_t_logic',
      accessDouble: null,
      nofill: 'zcx_t_nofill',
      predicates: new Map([['G-0001', { name: 'when_g0001', params: [], engineWritten: true }]]),
      guards: [{ id: 'G-0001', line, rule: null, carried: true, effect: 'check', outcome: 'refuses', subject: 'GV_COUNT', condition: "gv_count = '0'" }],
      attributes: new Map([['gv_count', 'TYPE i']]),
      constants: new Set(),
      elementary: new Set(['gv_count']),
      packedType: () => null,
      shapeOf: () => 'elementary',
      componentPhrase: () => null,
    });
    const text = out.impls.join('\n');
    expect(text).not.toMatch(/=>skip\(/);
    expect(text).not.toContain('CLEAR lo_cut->gv_count.');
    expect(text).toContain("lo_cut->gv_count = '1'.");
  });

  test('counts per fixture: executable cases far outnumber the honest skips (version 11: every guard and contract case skipped)', () => {
    const counts = Object.fromEntries(
      SOURCES.map(([name, source]) => {
        const { scaffold, cases } = rap(source());
        const text = include(scaffold);
        const skipped = cases.filter((c) => /=>skip\(/.test(body(text, c.id.toLowerCase()))).length;
        return [name, `${cases.length - skipped}/${cases.length}`];
      }),
    );
    expect(counts).toEqual({ 'co-shape': '32/41', 'pp-shape': '26/30', 'sd-shape': '20/25', 'PO demo': '24/27' });
  });

  test('deterministic: the same source gives the same include', () => {
    expect(include(rap(fixture('co-shape')).scaffold)).toBe(include(rap(fixture('co-shape')).scaffold));
  });

  test('a predicate the model fills is caught as a stub: the case fails red, it does not skip', () => {
    const { cases } = rap(fixture('sd-shape'));
    const guardCase = cases.find((c) => c.engineCase.trace.ruleId === 'BR-001' && c.engineCase.kind === 'guard-breaks-one')!;
    const out = abapEngineCaseMethods([guardCase], {
      logicClass: 'zcl_t_logic',
      accessDouble: null,
      nofill: 'zcx_t_nofill',
      predicates: new Map([['G-0024', { name: 'when_g0024', params: [], engineWritten: false }]]),
      guards: [{ id: 'G-0024', line: 24, rule: 'BR-001', carried: true, effect: 'message', outcome: 'refuses', subject: 'p_discnt', condition: 'p_discnt > 30' }],
      attributes: new Map([['p_discnt', 'TYPE p LENGTH 3 DECIMALS 2']]),
      constants: new Set(),
      elementary: new Set(['p_discnt']),
      packedType: () => null,
      shapeOf: () => null,
      componentPhrase: () => null,
    });
    const text = out.impls.join('\n');
    expect(text).toMatch(/TRY\.\n\s+lv_holds = lo_cut->when_g0024\( \)\.\n\s+CATCH zcx_t_nofill\.\n\s+cl_abap_unit_assert=>fail\(/);
    expect(text).not.toMatch(/=>skip\(/);
    expect(text).toContain('lo_cut = NEW #( ).');
    expect(out.tally.executable).toEqual([guardCase.id]);
    expect(out.friends).toBe(true);
  });
});

test.describe('(8) the golden master never reports a case it did not compare as passed', () => {
  const three = () => fs.readFileSync(GM_FIXTURE, 'utf8');
  // QM-01 (18.10.2026): case 2 of the fixture also sets GV_SEALED, which the run does not take as input, so the case is
  // not carried over and does not run (tests/golden-master-mutations.spec.ts). These cases are about running and
  // comparing, so they use the fixture without that one statement: every case carried exactly.
  const carried = () => three().replace(/ {6}gv_sealed = space\.\r?\n/, '');

  test('without an expected result, a case runs the logic and then skips — "not compared"; counted as skipped, not as a test', () => {
    expect(carried()).not.toBe(three());
    const { scaffold } = rap(carried());
    const text = include(scaffold);
    for (const m of ['case_00', 'case_01', 'case_02']) {
      const b = body(text, m);
      expect(b.indexOf('DATA(ls_out) = run_case(')).toBeGreaterThan(-1);
      expect(b.indexOf(`cl_abap_unit_assert=>skip( msg = not_compared(`)).toBeGreaterThan(b.indexOf('run_case('));
    }
    expect(text).toContain('no expected result of the original is on record');
    // A refusal of a case is its outcome, caught and reported — not a failure of the run, and not a pass.
    expect(text).toMatch(/CATCH zcx_fx_gm_credit_refusal INTO DATA\(lx_refusal\)\.\n\s+" A refusal/);
    const counts = countAbapUnitTests([{ content: text }], ['zcl_fx_gm_credit_logic']);
    for (const m of ['case_00', 'case_01', 'case_02']) expect(counts.skippedNames).toContain(`ltc_golden_master.${m}`);
    expect(abapTestEvidence(scaffold.files, null)!.goldenMaster).toEqual({ cases: 3, rowsPassed: true, compared: 0 });
    expect(abaplintPackageCheck(scaffold.files).issues.filter((i) => i.path.endsWith('.testclasses.abap'))).toEqual([]);
  });

  test('the seam for the characterization samples (3.0.19): an expected result on record is asserted, and the case counts as a test', () => {
    const { scaffold } = rap(carried(), {
      goldenMasterExpected: {
        1: { source: 'a characterization sample (test data)', refused: false, values: [{ component: 'gv_sealed', value: 'X' }], rows: [{ component: 'gt_claims', count: 3 }] },
        2: { source: 'a characterization sample (test data)', refused: { guard: 'G-0042', text: 'Held' } },
        0: { source: 'a characterization sample (test data)', values: [{ component: 'no_such_component', value: '1' }] },
      },
    });
    const text = include(scaffold);
    const b1 = body(text, 'case_01');
    expect(b1).not.toMatch(/=>skip\(/);
    expect(b1).toContain('cl_abap_unit_assert=>assert_equals( act = ls_out-refused exp = abap_false');
    expect(b1).toContain("DATA(lv_exp_1) = ls_out-state-gv_sealed.\n    lv_exp_1 = 'X'.");
    expect(b1).toContain('cl_abap_unit_assert=>assert_equals( act = lines( ls_out-state-gt_claims ) exp = 3');
    expect(body(text, 'case_02')).toContain("act = ls_out-guard exp = 'G-0042'");
    // An expected value naming no component of the state is said, not compared — and the case still does not pass.
    const b0 = body(text, 'case_00');
    expect(b0).toContain('Not compared: no_such_component');
    expect(b0).toMatch(/=>skip\( msg = not_compared\(/);
    expect(abapTestEvidence(scaffold.files, null)!.goldenMaster).toEqual({ cases: 3, rowsPassed: true, compared: 2 });
    expect(abaplintPackageCheck(scaffold.files).issues.filter((i) => i.path.endsWith('.testclasses.abap'))).toEqual([]);
  });

  test('the interface: goldenMasterForScaffold takes the expected results by case number; none is invented', () => {
    const out = goldenMasterForScaffold(three(), { logicClass: 'zcl_x_logic', accessDouble: null, selection: [], stateComponents: ['gv_sealed'] })!;
    expect(out.testClass.methods.every((m) => m.compared === false)).toBe(true);
    expect(out.testClass.lines.join('\n')).not.toMatch(/assert_equals/);
  });
});

