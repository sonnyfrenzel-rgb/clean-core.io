import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { accessSeamOf, accessSeamPromptRule, checkAbapTestClass, placeModelTestClasses, withAccessDouble } from '../lib/testing-abap-unit';
import { fixture, planOf, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.15 item (2), from the second SAP import (owner decision 16.10.2026): of 134 ABAP Unit methods one was
 * red — the testing model's class created the logic class with `NEW zcl_<x>_logic( )`, the default access, and so
 * tested the missing SAP connection, not the logic. The prompt now names the class under test and the double
 * (`NEW <logic>( io_access = NEW ltd_access( ) )`), and the suite is rewritten where that is unambiguous — or refused
 * with the line — before it is stored, and again when it is placed into the test include of a package.
 *
 * Fixtures only (the SD shape and the PO starter example), never the owner's programs. Server-free.
 */

function pkg(source: string) {
  const { facts, plan } = planOf(source);
  return buildRapScaffold(plan, facts, {}).files;
}
const logicOf = (files: ReadonlyArray<{ path: string }>) => /src\/(\w+_logic)\.clas\.abap$/.exec(files.find((f) => /_logic\.clas\.abap$/.test(f.path))!.path)![1];

const suite = (logic: string, create: string, decl = `    DATA mo_cut TYPE REF TO ${logic}.`) =>
  [
    'CLASS ltcl_test DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
    '  PRIVATE SECTION.',
    decl,
    '    METHODS tc_01_runs FOR TESTING.',
    'ENDCLASS.',
    'CLASS ltcl_test IMPLEMENTATION.',
    '  METHOD tc_01_runs.',
    `    " a comment that says NEW ${logic}( ) is not code`,
    create,
    "    cl_abap_unit_assert=>assert_bound( act = mo_cut msg = 'NEW zcl_x( ) in a literal' ).",
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');

for (const [name, source] of [['sd-shape', () => fixture('sd-shape')], ['PO demo', poDemo]] as const) {
  test.describe(name, () => {
    test('the package has an access seam: the logic class takes io_access, the include holds ltd_access', () => {
      const files = pkg(source());
      const seam = accessSeamOf(files);
      expect(seam).not.toBeNull();
      expect(seam!.logicClasses).toEqual([logicOf(files)]);
      expect(seam!.double).toBe('ltd_access');
      expect(seam!.defaultAccess).toEqual([logicOf(files).replace(/_logic$/, '_access')]);
      const rule = accessSeamPromptRule(seam!);
      expect(rule).toContain(`NEW ${logicOf(files)}( io_access = NEW ltd_access( ) )`);
      expect(rule).toContain(seam!.defaultAccess[0]);
    });

    test('NEW <logic>( ) is rewritten to pass the double, said at the top, and the result still fits the package', () => {
      const files = pkg(source());
      const logic = logicOf(files);
      const code = suite(logic, `    mo_cut = NEW ${logic}( ).`);
      const out = withAccessDouble(code, accessSeamOf(files));
      expect(out.problems).toEqual([]);
      expect(out.rewritten).toBe(1);
      expect(out.code).toContain(`    mo_cut = NEW ${logic}( io_access = NEW ltd_access( ) ).`);
      expect(out.code.split('\n')[0]).toMatch(/^" Clean-Core\.io: 1 place created .* rewritten to pass the test double: io_access = NEW ltd_access\( \)\.$/);
      // Comments and literals are left alone.
      expect(out.code).toContain(`" a comment that says NEW ${logic}( ) is not code`);
      expect(out.code).toContain("'NEW zcl_x( ) in a literal'");
      expect(checkAbapTestClass(out.code, files)).toEqual({ ok: true, problems: [] });
      // In the test include beside ltd_access, abaplint accepts it.
      const placed = placeModelTestClasses(files, out.code)!;
      const lint = abaplintPackageCheck(files.map((f) => (f.path === placed.path ? placed : f)));
      expect(lint.issues.filter((i) => i.path.endsWith('.testclasses.abap')), JSON.stringify(lint.issues.slice(0, 5))).toEqual([]);
    });

    test('NEW #( ) for a variable of the logic class, and CREATE OBJECT without EXPORTING, are rewritten too', () => {
      const files = pkg(source());
      const logic = logicOf(files);
      const seam = accessSeamOf(files);
      expect(withAccessDouble(suite(logic, '    mo_cut = NEW #( ).'), seam).code).toContain('mo_cut = NEW #( io_access = NEW ltd_access( ) ).');
      expect(withAccessDouble(suite(logic, '    CREATE OBJECT mo_cut.'), seam).code).toContain('CREATE OBJECT mo_cut EXPORTING io_access = NEW ltd_access( ).');
      expect(withAccessDouble(suite(logic, `    CREATE OBJECT mo_cut TYPE ${logic}.`), seam).code).toContain(`CREATE OBJECT mo_cut TYPE ${logic} EXPORTING io_access = NEW ltd_access( ).`);
    });

    test('a class created with the double, or with a double of its own, is left as written', () => {
      const files = pkg(source());
      const logic = logicOf(files);
      for (const create of [`    mo_cut = NEW ${logic}( io_access = NEW ltd_access( ) ).`, `    mo_cut = NEW ${logic}( io_access = lo_double ).`, `    mo_cut = NEW ${logic}( lo_double ).`]) {
        const out = withAccessDouble(suite(logic, create), accessSeamOf(files));
        expect(out, create).toEqual({ code: suite(logic, create), rewritten: 0, problems: [] });
      }
    });

    test('the default access class handed in is refused with its line — it calls SAP', () => {
      const files = pkg(source());
      const logic = logicOf(files);
      const access = logic.replace(/_logic$/, '_access');
      const out = withAccessDouble(suite(logic, `    mo_cut = NEW ${logic}( io_access = NEW ${access}( ) ).`), accessSeamOf(files));
      expect(out.rewritten).toBe(0);
      expect(out.problems).toHaveLength(1);
      expect(out.problems[0]).toMatchObject({ kind: 'default-access', line: 9, name: logic });
      expect(out.problems[0].message).toContain('default access class, which calls SAP');
      const created = withAccessDouble(suite(logic, `    CREATE OBJECT mo_cut EXPORTING io_access = NEW ${access}( ).`), accessSeamOf(files));
      expect(created.problems.map((p) => p.kind)).toEqual(['default-access']);
    });

    test('a suite stored before the check gets the double when it is placed into the package', () => {
      const files = pkg(source());
      const logic = logicOf(files);
      const placed = placeModelTestClasses(files, suite(logic, `    mo_cut = NEW ${logic}( ).`))!;
      expect(placed.content).toContain(`mo_cut = NEW ${logic}( io_access = NEW ltd_access( ) ).`);
      expect(placed.content).not.toMatch(new RegExp(`mo_cut = NEW ${logic}\\( \\)\\.`));
    });
  });
}

test('without an access seam (a package with no access layer, or the Node route) nothing changes', () => {
  const code = 'CLASS ltcl_test DEFINITION FOR TESTING.\nENDCLASS.\nCLASS ltcl_test IMPLEMENTATION.\n  METHOD x.\n    DATA(o) = NEW zcl_a( ).\n  ENDMETHOD.\nENDCLASS.\n';
  expect(withAccessDouble(code, null)).toEqual({ code, rewritten: 0, problems: [] });
  expect(accessSeamOf([{ path: 'src/zcl_a.clas.abap', content: 'CLASS zcl_a DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS constructor IMPORTING io_access TYPE REF TO zif_a OPTIONAL.\nENDCLASS.\n' }])).toBeNull();
});

test('the Testing prompt names the class under test and the double, and asks for cl_abap_unit_assert only', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'hooks', 'useTestGeneration.ts'), 'utf8');
  expect(hook).toContain('accessSeamPromptRule(accessSeam)');
  expect(hook).toContain('withAccessDouble(');
  // The guideline that still named the classes that do not activate (second SAP import) is gone.
  expect(hook).not.toMatch(/Use \\`cl_abap_unit_test=>fail/);
  expect(hook).not.toMatch(/or \\`cl_aunit_assert=>assert_equals/);
  // The rewrite runs before the declaration check, and what is stored is the rewritten code.
  expect(hook.indexOf('withAccessDouble(')).toBeLessThan(hook.indexOf('checkAbapTestClass(seamed.code'));
  expect(hook).toContain('.code = seamed.code');
});
