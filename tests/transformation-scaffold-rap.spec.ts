import { test, expect } from '@playwright/test';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { buildRapScaffold } from '../lib/transformation';
import { rapShortName } from '../lib/transformation/scaffold-rap';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * The RAP / ABAP Cloud scaffold (docs/design/engine-led-transformation.md §6.3): packed fields
 * as abap.dec(2L−1, d), one validation per carried guard and none for a dropped rule, the
 * behavior pool's frames engine-written, the logic class's bodies between fill markers, one
 * ABAP Unit method per engine case. Server-free; no ABAP system checks the syntax here.
 */

function rap(source: string, decisions: Parameters<typeof planOf>[1] = {}) {
  const { facts, plan } = planOf(source, decisions);
  return { plan, facts, scaffold: buildRapScaffold(plan, facts) };
}

const file = (s: ReturnType<typeof rap>['scaffold'], suffix: string) => s.files.find((f) => f.path.endsWith(suffix))!.content;

test('the abapGit layout of one business object; every name within 30 characters', () => {
  const { scaffold } = rap(fixture('co-shape'));
  const paths = scaffold.files.map((f) => f.path).sort();
  expect(paths).toEqual(
    [
      '.abapgit.xml',
      'src/zbp_fx_co_alloc_r.clas.abap',
      'src/zbp_fx_co_alloc_r.clas.locals_imp.abap',
      'src/zcl_fx_co_alloc_logic.clas.abap',
      'src/zcl_fx_co_alloc_logic.clas.testclasses.abap',
      'src/zcx_fx_co_alloc_nofill.clas.abap',
      'src/zfx_co_alloc_c.ddls.asddls',
      'src/zfx_co_alloc_r.bdef.asbdef',
      'src/zfx_co_alloc_r.ddls.asddls',
      'src/zfx_co_alloc_rec.tabl.astabl',
      'src/zfx_co_alloc_srvb.srvb.xml',
      'src/zfx_co_alloc_srvd.srvd.srvdsrv',
    ].sort(),
  );
  for (const p of paths) {
    const name = p.replace(/^src\//, '').split('.')[0];
    expect(name.length, p).toBeLessThanOrEqual(30);
  }
  expect(rapShortName('/ABC/ZVERY_LONG_PROGRAM_NAME_FOR_TESTS').length).toBeLessThanOrEqual(12);
  expect(scaffold.adapter).toBeNull();
});

test('packed record fields are abap.dec(2L−1, d) from their declaration', () => {
  const { scaffold, plan } = rap(fixture('co-shape'));
  const table = file(scaffold, '.tabl.astabl');
  // quota TYPE p LENGTH 4 DECIMALS 2 → 7 digits; amount LENGTH 8 DECIMALS 2 → 15.
  expect(table).toContain('quota : abap.dec(7,2);');
  expect(table).toContain('amount : abap.dec(15,2);');
  for (const f of plan.fields.filter((x) => x.where === 'record' && x.kind === 'packed')) {
    const length = plan.decimals.find((d) => d.name.toLowerCase() === f.original.toLowerCase())!.length;
    expect(table).toContain(`: abap.dec(${2 * length - 1},${f.places});`);
  }
  const logic = file(scaffold, '_logic.clas.abap');
  expect(logic).toContain('quota TYPE p LENGTH 4 DECIMALS 2,');
  expect(file(scaffold, 'r.ddls.asddls')).toContain('define root view entity ZFX_CO_ALLOC_R');
});

test('one validation per carried raw check that refuses — none for a dropped rule, none for a check on a computed value', () => {
  const open = rap(fixture('co-shape'));
  // Derived and skipping checks are no validation: the logic method calls their predicate where the original checks.
  const carried = open.plan.guards.filter((g) => g.carried && g.placement !== 'body' && g.outcome === 'refuses');
  expect(carried.map((g) => g.id)).toEqual(['G-0029', 'G-0054', 'G-0058', 'G-0061']);
  const logic = file(open.scaffold, '_logic.clas.abap');
  expect(logic).toContain('METHODS when_g0066 IMPORTING is_sel TYPE ty_selection is_rec TYPE ty_rec OPTIONAL iv_lv_sum TYPE string OPTIONAL RETURNING VALUE(rv_holds) TYPE abap_bool.');
  expect(logic).toContain('"! The body calls, where the original checks: when_g0066( ) (L66).');
  expect(open.scaffold.required.U02).toEqual([{ id: 'G-0066', helper: 'when_g0066', line: 66, op: '>', literals: ['100'] }]);
  const bdef = file(open.scaffold, '.bdef.asbdef');
  const validations = bdef.match(/^\s+validation \w+ on save/gm) ?? [];
  expect(validations).toHaveLength(carried.length);
  expect(bdef).toContain('validation val_br_003_g0061 on save');
  expect(bdef).toContain('strict ( 2 );');
  expect(bdef).toContain('determination run_process on save');
  const pool = file(open.scaffold, 'locals_imp.abap');
  expect(pool.match(/FOR VALIDATE ON SAVE/g) ?? []).toHaveLength(carried.length);
  expect(pool).toContain('lo_logic->when_g0061(');

  const dropped = rap(fixture('co-shape'), { decisions: [{ id: 'BR-003', answer: 'drop', note: null }] });
  const bdef2 = file(dropped.scaffold, '.bdef.asbdef');
  expect(bdef2).not.toContain('val_br_003_');
  expect((bdef2.match(/^\s+validation \w+ on save/gm) ?? []).length).toBe(carried.length - 1);
  expect(dropped.scaffold.regions.map((r) => r.regionId)).not.toContain('U02.G0061');
});

test('the logic class: one method per unit and one predicate per carried guard, bodies between markers', () => {
  const { scaffold, plan } = rap(poDemo());
  const logic = file(scaffold, '_logic.clas.abap');
  for (const u of plan.units) expect(logic).toContain(`METHODS ${u.rapName} IMPORTING is_sel TYPE ty_selection CHANGING cs_st TYPE ty_state.`);
  const carried = plan.guards.filter((g) => g.carried);
  expect(scaffold.regions).toHaveLength(plan.units.length + carried.length);
  for (const r of scaffold.regions) expect(r.file).toBe('src/zcl_mm_po_approv_logic.clas.abap');
  expect(logic).toMatch(/"! @cc-fill BEGIN U01 [0-9a-f]{8}\n\s+RAISE EXCEPTION NEW zcx_mm_po_approv_nofill\( unit = 'U01' \)\.\n\s+"! @cc-fill END U01/);
});

test('ABAP Unit: one test method per engine case; exact arithmetic written by the engine', () => {
  const { scaffold, facts } = rap(fixture('sd-shape'));
  const cases = deriveEngineCases(facts.source, facts.ruleSet.rules).cases;
  const tests = file(scaffold, '.testclasses.abap');
  expect(tests.match(/ FOR TESTING\./g) ?? []).toHaveLength(cases.length);
  for (const c of cases) expect(tests).toContain(`METHODS ${c.id.toLowerCase()} FOR TESTING.`);
  // P_DISCNT P(5,2): 2 / 3 at 2 places is 0.67, written and asserted by the engine.
  expect(tests).toMatch(/lv_value_\d+ = lv_value_\d+ \/ '3'\./);
  expect(tests).toContain("_exp = '0.67'.");
  expect(tests).toContain('cl_abap_unit_assert=>assert_equals(');
  expect(tests).toContain('cl_abap_unit_assert=>skip(');
});
