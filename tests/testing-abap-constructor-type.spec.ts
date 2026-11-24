import { test, expect } from '@playwright/test';
import { accessSeamOf, checkAbapTestClass, withAccessDouble } from '../lib/testing-abap-unit';
import { buildRapScaffold } from '../lib/transformation';
import { planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * Owner report 24.11.2026: writing the scenarios for the starter example Z_MM_PO_APPROVAL ended in an error message
 * in Testing, with every server call answered 200. Reproduced with the real model: of six answers to the same testing
 * prompt, three were refused in the browser with "The ABAP Unit test class does not fit the class under test: Line 53:
 * zcl_mm_po_approv_logic declares no method ty_run_selection. …". The model had filled the input of `run( )` the way
 * ABAP Cloud writes it — `VALUE zcl_mm_po_approv_logic=>ty_run_selection( p_banfn = … )` — and the declaration check
 * read the constructor expression's type as a call of a static method. The repair round was asked to remove a call
 * that was not there, and the generation failed whole. A constructor operator before `class=>name(` makes the name a
 * type; a real call of an undeclared static method is still refused. Server-free.
 */

function poPackage() {
  const { facts, plan } = planOf(poDemo());
  return buildRapScaffold(plan, facts, {}).files;
}

const LOGIC = 'zcl_mm_po_approv_logic';

function testClass(body: string[]): string {
  return [
    'CLASS ltcl_po DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
    '  PRIVATE SECTION.',
    '    METHODS tc_01_emergency FOR TESTING.',
    'ENDCLASS.',
    'CLASS ltcl_po IMPLEMENTATION.',
    '  METHOD tc_01_emergency.',
    `    DATA(lo_cut) = NEW ${LOGIC}( io_access = NEW ltd_access( ) ).`,
    ...body.map((l) => `    ${l}`),
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
}

test('the PO package declares the selection type the model fills (the precondition of this spec)', () => {
  const logic = poPackage().find((f) => f.path.toLowerCase().includes(`${LOGIC}.clas.abap`));
  expect(logic, 'the PO scaffold has no logic class').toBeTruthy();
  expect(logic!.content).toMatch(/TYPES\s+ty_run_selection\b/i);
  expect(logic!.content).toMatch(/METHODS\s+run\b/i);
});

test('VALUE <class>=>ty_run_selection( … ) as the input of run( ) is a type, not an undeclared method', () => {
  const files = poPackage();
  const code = testClass([
    `DATA(ls_sel) = VALUE ${LOGIC}=>ty_run_selection( p_banfn = '0010000001' p_bnfpo = '00010' p_test = abap_true ).`,
    'DATA(ls_result) = lo_cut->run( is_selection = ls_sel ).',
    "cl_abap_unit_assert=>assert_equals( act = ls_result-gv_rejected exp = abap_false msg = 'not rejected' ).",
  ]);
  const seamed = withAccessDouble(code, accessSeamOf(files));
  const check = checkAbapTestClass(seamed.code, files);
  expect(check.problems.map((p) => p.message)).toEqual([]);
  expect(seamed.problems).toEqual([]);
});

test('the same holds across lines and for the other constructor operators', () => {
  const files = poPackage();
  const code = testClass([
    `DATA(ls_sel) = VALUE ${LOGIC}=>ty_run_selection(`,
    "  p_banfn = '0010000001'",
    "  p_bnfpo = '00010' ).",
    `DATA(ls_copy) = CORRESPONDING ${LOGIC}=>ty_run_selection( ls_sel ).`,
    `DATA(ls_conv) = CONV ${LOGIC}=>ty_run_selection( ls_copy ).`,
    'lo_cut->run( is_selection = ls_conv ).',
  ]);
  const check = checkAbapTestClass(code, files);
  expect(check.problems.map((p) => p.message)).toEqual([]);
});

test('a real call of a method the class does not declare is still refused, inside a VALUE too', () => {
  const files = poPackage();
  const direct = checkAbapTestClass(testClass([`${LOGIC}=>no_such_method( ).`]), files);
  expect(direct.problems.map((p) => p.kind)).toContain('undeclared-method');
  expect(direct.problems.map((p) => p.name)).toContain('no_such_method');

  const nested = checkAbapTestClass(
    testClass([`DATA(ls_sel) = VALUE ${LOGIC}=>ty_run_selection( p_banfn = ${LOGIC}=>no_such_method( ) ).`]),
    files,
  );
  expect(nested.problems.map((p) => p.name)).toEqual(['no_such_method']);

  const instance = checkAbapTestClass(testClass(['lo_cut->no_such_method( ).']), files);
  expect(instance.problems.map((p) => p.name)).toContain('no_such_method');
});
