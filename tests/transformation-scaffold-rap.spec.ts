import { test, expect } from '@playwright/test';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { buildRapScaffold } from '../lib/transformation';
import { rapShortName } from '../lib/transformation/scaffold-rap';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';
import { missingEngineLedArtefacts } from '../lib/transformation-artefacts';
import { isDdicReserved } from '../lib/transformation/ddic-reserved';

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

/** The CO shape writing its allocation back: a program that writes a table keeps the business object (scaffold version 6). */
const coWriting = () => fixture('co-shape').replace('gv_total = gv_total + lv_share.', 'gv_total = gv_total + lv_share.\n    MODIFY zco_receivers FROM <ls_rcv>.');

test('the abapGit layout of a read-only program: a custom entity and its query, no table; every name within 30 characters', () => {
  const { scaffold } = rap(fixture('co-shape'));
  const paths = scaffold.files.map((f) => f.path).sort();
  expect(paths).toEqual(
    [
      '.abapgit.xml',
      'src/package.devc.xml',
      // The customer table it reads (ZCO_RECEIVERS) is not in the package: read through the access layer (scaffold version 7).
      'src/zif_fx_co_alloc_access.intf.abap',
      'src/zif_fx_co_alloc_access.intf.xml',
      'src/zcl_fx_co_alloc_access.clas.abap',
      'src/zcl_fx_co_alloc_access.clas.xml',
      'src/zcx_fx_co_alloc_access.clas.abap',
      'src/zcx_fx_co_alloc_access.clas.xml',
      'src/zcl_fx_co_alloc_logic.clas.abap',
      'src/zcl_fx_co_alloc_logic.clas.testclasses.abap',
      'src/zcl_fx_co_alloc_logic.clas.xml',
      'src/zcl_fx_co_alloc_query.clas.abap',
      'src/zcl_fx_co_alloc_query.clas.xml',
      'src/zcx_fx_co_alloc_nofill.clas.abap',
      'src/zcx_fx_co_alloc_nofill.clas.xml',
      'src/zcx_fx_co_alloc_refusal.clas.abap',
      'src/zcx_fx_co_alloc_refusal.clas.xml',
      'src/zfx_co_alloc_ce.ddls.asddls',
      'src/zfx_co_alloc_ce.ddls.xml',
      'src/zfx_co_alloc_srvb.srvb.xml',
      'src/zfx_co_alloc_srvd.srvd.srvdsrv',
      'src/zfx_co_alloc_srvd.srvd.xml',
    ].sort(),
  );
  for (const p of paths) {
    const name = p.replace(/^src\//, '').split('.')[0];
    expect(name.length, p).toBeLessThanOrEqual(30);
  }
  expect(rapShortName('/ABC/ZVERY_LONG_PROGRAM_NAME_FOR_TESTS').length).toBeLessThanOrEqual(12);
  expect(scaffold.adapter).toBeNull();
  // The same program writing its table: the business object of scaffold version 2, with the action's parameter.
  const writing = rap(coWriting()).scaffold.files.map((f) => f.path);
  for (const suffix of ['zfx_co_alloc_rec.tabl.xml', 'zfx_co_alloc_r.bdef.asbdef', 'zfx_co_alloc_r.ddls.asddls', 'zfx_co_alloc_c.ddls.asddls', 'zfx_co_alloc_p.ddls.asddls', 'zbp_fx_co_alloc_r.clas.locals_imp.abap']) {
    expect(writing).toContain(`src/${suffix}`);
  }
});

test('packed record fields are abap.dec(2L−1, d) from their declaration', () => {
  const { scaffold, plan } = rap(coWriting());
  // abapGit's table XML (scaffold version 3): DEC with 2L−1 digits in L bytes — `abap.dec(2L−1, d)` in ADT's source.
  const table = file(scaffold, '.tabl.xml');
  const field = (name: string) => table.slice(table.indexOf(`<FIELDNAME>${name}</FIELDNAME>`), table.indexOf('</DD03P>', table.indexOf(`<FIELDNAME>${name}</FIELDNAME>`)));
  // quota TYPE p LENGTH 4 DECIMALS 2 → 7 digits; amount LENGTH 8 DECIMALS 2 → 15.
  expect(field('QUOTA')).toMatch(/<DATATYPE>DEC<\/DATATYPE>\s*<LENG>000007<\/LENG>\s*<DECIMALS>000002<\/DECIMALS>/);
  expect(field('AMOUNT')).toMatch(/<DATATYPE>DEC<\/DATATYPE>\s*<LENG>000015<\/LENG>\s*<DECIMALS>000002<\/DECIMALS>/);
  for (const f of plan.fields.filter((x) => x.where === 'record' && x.kind === 'packed')) {
    const length = plan.decimals.find((d) => d.name.toLowerCase() === f.original.toLowerCase())!.length;
    expect(table).toContain(`<LENG>${String(2 * length - 1).padStart(6, '0')}</LENG>`);
    expect(table).toContain(`<DECIMALS>${String(f.places).padStart(6, '0')}</DECIMALS>`);
  }
  const logic = file(scaffold, '_logic.clas.abap');
  expect(logic).toContain('    TYPES quota TYPE p LENGTH 4 DECIMALS 2.');
  expect(file(scaffold, 'r.ddls.asddls')).toContain('define root view entity ZFX_CO_ALLOC_R');
  // The read-only program's entity types its elements as declared too.
  expect(file(rap(fixture('co-shape')).scaffold, '_ce.ddls.asddls')).toContain('      quota : abap.dec( 7, 2 );');
});

test('every carried guard runs in the logic path — no save validation; none for a dropped rule', () => {
  const open = rap(fixture('co-shape'));
  const logic = file(open.scaffold, '_logic.clas.abap');
  // G-0029 (the selection screen) runs in check_selection, G-0054 at validate_policy's entry: both exact, both engine-written.
  expect(open.scaffold.rap!.guards['G-0029']).toMatchObject({ calledBy: 'engine', written: 'engine' });
  expect(open.scaffold.rap!.guards['G-0054']).toMatchObject({ calledBy: 'engine', written: 'engine' });
  // Inside the loop and on the computed sum: the body calls them where the original checks.
  expect(open.scaffold.required.U02.map((r) => r.id)).toEqual(['G-0058', 'G-0061', 'G-0066']);
  expect(open.scaffold.required.U02.find((r) => r.id === 'G-0066')).toEqual({ id: 'G-0066', helper: 'when_g0066', line: 66, op: '>', literals: ['100'] });
  expect(logic).toMatch(/METHODS when_g0066\n\s+IMPORTING\n\s+lv_sum TYPE ty_sum\n\s+RETURNING VALUE\(rv_holds\) TYPE abap_bool\./);
  expect(logic).toContain('rv_holds = xsdbool( lv_sum > 100 ).');
  expect(logic).toContain('"! The body calls, where the original checks: when_g0058 (L58), when_g0061 (L61), when_g0066 (L66).');
  expect(logic).not.toMatch(/FOR VALIDATE ON SAVE|validation /);

  const dropped = rap(fixture('co-shape'), { decisions: [{ id: 'BR-003', answer: 'drop', note: null }] });
  expect(dropped.scaffold.rap!.guards['G-0061']).toBeUndefined();
  expect(file(dropped.scaffold, '_logic.clas.abap')).not.toContain('when_g0061');
  expect(dropped.scaffold.required.U02.map((r) => r.id)).toEqual(['G-0058', 'G-0066']);
  expect(dropped.scaffold.regions.map((r) => r.regionId)).not.toContain('U02.G0061');
});

test('the logic class: one method per unit with its FORM signature, bodies between markers', () => {
  const { scaffold, plan } = rap(poDemo());
  const logic = file(scaffold, '_logic.clas.abap');
  for (const u of plan.units) expect(logic).toMatch(new RegExp(`\\n    METHODS ${u.rapName}(?:\\.|\\n)`));
  const modelPredicates = Object.values(scaffold.rap!.guards).filter((g) => g.written === 'model').length;
  expect(scaffold.regions).toHaveLength(plan.units.length + modelPredicates);
  for (const r of scaffold.regions) expect(r.file).toBe('src/zcl_mm_po_approv_logic.clas.abap');
  expect(logic).toMatch(/" @cc-fill BEGIN U01 [0-9a-f]{8}\n\s+RAISE EXCEPTION NEW zcx_mm_po_approv_nofill\( unit = 'U01' \)\.\n\s+" @cc-fill END U01/);
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

test('a read-only package is complete without a behavior definition; a writing one still needs it (SD example on dev, 15.10.2026)', () => {
  const trace = { path: 'traceability.json', content: '{}' };
  const readOnly = rap(fixture('co-shape')).scaffold.files;
  expect(readOnly.some((f) => f.path.endsWith('.bdef.asbdef'))).toBe(false);
  expect(missingEngineLedArtefacts([...readOnly, trace], true)).toEqual([]);
  const writing = rap(coWriting()).scaffold.files.filter((f) => !f.path.endsWith('.bdef.asbdef'));
  expect(missingEngineLedArtefacts([...writing, trace], true)).toEqual(['behavior definition (*.bdef.asbdef)']);
});

test('no generated field or element carries a name the Dictionary refuses (first activation, BTP trial, 15.10.2026: DEFERRED)', () => {
  /** The element names of every CDS entity and the field names of every table the scaffold writes. */
  const names = (files: Array<{ path: string; content: string }>) => [
    ...files.filter((f) => f.path.endsWith('.ddls.asddls')).flatMap((f) => [...f.content.matchAll(/^\s*(?:key\s+)?(\w+)\s*:/gm)].map((m) => m[1])),
    ...files.filter((f) => f.path.endsWith('.tabl.xml')).flatMap((f) => [...f.content.matchAll(/<FIELDNAME>([^<]+)<\/FIELDNAME>/g)].map((m) => m[1])),
  ];
  const deferred = (s: string) => s.replace(/\bamount\b/gi, 'deferred');
  const readOnly = rap(deferred(fixture('co-shape'))).scaffold.files;
  const writing = rap(deferred(coWriting())).scaffold.files;
  expect(names(readOnly)).toContain('deferred_value');
  for (const files of [readOnly, writing, rap(fixture('pp-shape')).scaffold.files, rap(fixture('sd-shape')).scaffold.files]) {
    expect(names(files).filter((n) => isDdicReserved(n))).toEqual([]);
  }
});
