import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildRapScaffold } from '../lib/transformation';
import { rapTableName } from '../lib/transformation/scaffold-rap';
import { affFileNameOf, type AffSchemaSource } from '../lib/transformation/aff-check';
import { ABAPGIT_SOURCE_OF, packageFormatsCheck, packageFormatsHook, parseXml } from '../lib/transformation/abapgit-check';
import { abapGitRepoSettingsXml, clasXml, srvdXml, tablXml } from '../lib/transformation/abapgit-files';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { createRunnerVerifier } from '../lib/transformation/verify';
import { checkPhrase } from '../lib/transformation/check-words';
import { fixture, planOf, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * The RAP package a customer imports with abapGit (roadmap 3.0.12, importable
 * package, 13.10.2026): every object carries the metadata file abapGit's
 * serializer writes (`<name>.<type>.xml`), the repository settings are there,
 * the table is abapGit's XML, and the formats check and abaplint read them.
 * The XML structure is held against abapGit's serializer output as SAP's own
 * samples carry it (sources in `lib/transformation/abapgit-files.ts`).
 * Server-free; no SAP system imports anything here.
 */

const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'aff');
const SYNCED = path.join(ROOT, 'lib', 'generated', 'aff-schemas');
const schemas: AffSchemaSource = (type, version) => {
  for (const p of [path.join(SYNCED, `${type}.json`), path.join(FIXTURES, `${type}-v${version}.json`)]) {
    if (!fs.existsSync(p)) continue;
    const schema = JSON.parse(fs.readFileSync(p, 'utf8')) as { $id?: string };
    if (typeof schema.$id === 'string' && !schema.$id.endsWith(`/${type}-v${version}.json`)) continue;
    return schema;
  }
  return null;
};

/** A report that runs in the background only (an Application Job, no UI service), as in transformation-scaffold-rap-dsag.spec.ts. */
const NIGHTLY = `REPORT zfx_nightly_close.
PARAMETERS p_bukrs TYPE bukrs OBLIGATORY.
SELECT-OPTIONS s_date FOR sy-datum.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
START-OF-SELECTION.
  IF sy-batch = abap_false.
    MESSAGE 'Run this in the background' TYPE 'E'.
  ENDIF.
  PERFORM close_items.
FORM close_items.
  DATA lt_bsid TYPE STANDARD TABLE OF bsid.
  SELECT * FROM bsid INTO TABLE lt_bsid WHERE bukrs = p_bukrs.
  LOOP AT lt_bsid INTO DATA(ls).
    lv_amount = lv_amount + ls-dmbtr.
  ENDLOOP.
  UPDATE zfx_close SET amount = lv_amount WHERE bukrs = p_bukrs.
ENDFORM.
`;

/** The four demo packages, and a job-only one so the job classes' metadata is covered too. */
const DEMOS = {
  CO: () => fixture('co-shape'),
  PP: () => fixture('pp-shape'),
  SD: () => fixture('sd-shape'),
  PO: () => poDemo(),
  'background job': () => NIGHTLY,
};

function scaffoldOf(source: string) {
  const { facts, plan } = planOf(source);
  return buildRapScaffold(plan, facts);
}

for (const [demo, source] of Object.entries(DEMOS)) {
  test(`${demo}: every object has its abapGit metadata file, and the package passes the formats check`, () => {
    const scaffold = scaffoldOf(source());
    const paths = scaffold.files.map((f) => f.path);
    expect(paths).toContain('.abapgit.xml');
    expect(paths).toContain('src/package.devc.xml');
    expect(paths.some((p) => p.endsWith('.tabl.astabl')), 'a table source abapGit does not read').toBe(false);

    // One metadata file per object; every source file belongs to an object that has one.
    const objects = new Set(paths.map((p) => affFileNameOf(p)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => `${n.name}.${n.type}`));
    for (const o of objects) expect(paths, `${o} has no metadata file`).toContain(`src/${o}.xml`);
    // Every metadata file of a source-based type has its source.
    for (const p of paths.filter((x) => x.startsWith('src/') && x.endsWith('.xml'))) {
      const n = affFileNameOf(p)!;
      const ext = ABAPGIT_SOURCE_OF[n.type];
      if (ext) expect(paths, `${p} has no source`).toContain(`src/${n.name}.${ext}`);
    }
    // Object names: the table within 16 characters, everything else within 30.
    const table = paths.find((p) => p.endsWith('.tabl.xml'))!;
    expect(affFileNameOf(table)!.name.length).toBeLessThanOrEqual(16);

    const results = packageFormatsCheck(scaffold.files, schemas);
    expect(results.filter((r) => r.status === 'failed')).toEqual([]);
    const xml = results.filter((r) => r.path.endsWith('.xml'));
    expect(xml.length).toBe(paths.filter((p) => p.endsWith('.xml')).length);
    expect(xml.every((r) => r.status === 'passed')).toBe(true);
  });
}

test('abaplint reads the table and the metadata, and the package passes it', () => {
  for (const source of Object.values(DEMOS)) {
    const scaffold = scaffoldOf(source());
    const r = abaplintPackageCheck(scaffold.files);
    expect(r.issues).toEqual([]);
    expect(r.state).toBe('passed');
    expect(r.notRun.some((n) => n.path.endsWith('.tabl.xml'))).toBe(false);
    expect(r.checked).toBe(scaffold.files.filter((f) => /\.(?:clas|intf)(?:\.\w+)?\.abap$|\.ddls\.asddls$|\.tabl\.xml$/.test(f.path)).length);
  }
  // A table that breaks what abaplint checks on its XML is a finding: a name longer than 16 characters.
  const scaffold = scaffoldOf(fixture('co-shape'));
  const longName = 'zfx_co_alloc_recx';
  const broken = scaffold.files.map((f) =>
    f.path.endsWith('.tabl.xml') ? { path: `src/${longName}.tabl.xml`, content: f.content.replace(/ZFX_CO_ALLOC_REC/g, longName.toUpperCase()) } : f,
  );
  const r = abaplintPackageCheck(broken);
  expect(r.state).toBe('failed');
  expect(r.issues.map((i) => [i.path, i.rule])).toContainEqual([`src/${longName}.tabl.xml`, 'allowed_object_naming']);
});

test('the table XML carries every record field with its type, as abapGit serializes it', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const scaffold = buildRapScaffold(plan, facts);
  const xml = scaffold.files.find((f) => f.path.endsWith('.tabl.xml'))!.content;
  const doc = parseXml(xml);
  if ('error' in doc) throw new Error(doc.error);
  const fields = doc.root.children[0].children[0].children.find((c) => c.name === 'DD03P_TABLE')!.children;
  const byName = new Map(fields.map((f) => [f.children.find((c) => c.name === 'FIELDNAME')!.text, Object.fromEntries(f.children.map((c) => [c.name, c.text]))]));
  expect(byName.get('CLIENT')).toMatchObject({ KEYFLAG: 'X', DATATYPE: 'CLNT', LENG: '000003', NOTNULL: 'X' });
  expect(byName.get('REC_UUID')).toMatchObject({ KEYFLAG: 'X', ROLLNAME: 'SYSUUID_X16', COMPTYPE: 'E' });
  // quota TYPE p LENGTH 4 DECIMALS 2 → DEC 7,2 in 4 bytes; amount LENGTH 8 DECIMALS 2 → DEC 15,2 in 8 bytes.
  expect(byName.get('QUOTA')).toMatchObject({ INTTYPE: 'P', INTLEN: '000004', DATATYPE: 'DEC', LENG: '000007', DECIMALS: '000002' });
  expect(byName.get('AMOUNT')).toMatchObject({ INTTYPE: 'P', INTLEN: '000008', DATATYPE: 'DEC', LENG: '000015', DECIMALS: '000002' });
  for (const f of plan.fields.filter((x) => x.where === 'record' && x.kind === 'packed')) {
    const length = plan.decimals.find((d) => d.name.toLowerCase() === f.original.toLowerCase())!.length;
    const field = [...byName.values()].find((v) => v.FIELDNAME === f.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).slice(0, 30).toUpperCase())!;
    expect(field).toMatchObject({ DATATYPE: 'DEC', LENG: String(2 * length - 1).padStart(6, '0'), INTLEN: String(length).padStart(6, '0') });
  }
  expect(byName.get('LOCAL_LAST_CHANGED')).toMatchObject({ ROLLNAME: 'ABP_LOCINST_LASTCHANGE_TSTMPL', COMPTYPE: 'E' });
  expect(xml.startsWith('﻿<?xml version="1.0" encoding="utf-8"?>\n<abapGit version="v1.0.0" serializer="LCL_OBJECT_TABL" serializer_version="v1.0.0">')).toBe(true);
});

test("the metadata files have the elements of abapGit's serializer output", () => {
  const scaffold = scaffoldOf(poDemo());
  const of = (suffix: string) => scaffold.files.find((f) => f.path.endsWith(suffix))!.content;
  expect(of('_r.ddls.xml')).toContain('<SOURCE_TYPE>W</SOURCE_TYPE>');
  expect(of('_c.ddls.xml')).toContain('<SOURCE_TYPE>P</SOURCE_TYPE>');
  const pool = of('zbp_mm_po_approv_r.clas.xml');
  expect(pool).toContain('<CATEGORY>06</CATEGORY>');
  expect(pool).toContain('<CLSDEFINT>ZMM_PO_APPROV_R</CLSDEFINT>');
  expect(of('_logic.clas.xml')).toContain('<WITH_UNIT_TESTS>X</WITH_UNIT_TESTS>');
  expect(of('_nofill.clas.xml')).toContain('<CATEGORY>40</CATEGORY>');
  expect(of('.srvd.xml')).toMatch(/<LANGUAGE>EN<\/LANGUAGE>[\s\S]*<MASTER_LANGUAGE>EN<\/MASTER_LANGUAGE>/);
  const srvb = of('.srvb.xml');
  expect(srvb).toContain('<NAME>ZMM_PO_APPROV_SRVD</NAME>');
  expect(srvb).not.toContain('<PUBLISHED>');
  expect(of('.bdef.xml')).toContain('<TYPE>BDEF/BDO</TYPE>');
  for (const f of scaffold.files.filter((x) => x.path.endsWith('.xml'))) {
    expect(f.content.startsWith('﻿<?xml version="1.0" encoding="utf-8"?>'), f.path).toBe(true);
    for (const d of f.content.matchAll(/<(?:DESCRIPT|DDTEXT|DESCRIPTION|CTEXT)>([^<]*)</g)) expect(d[1].length, f.path).toBeLessThanOrEqual(60);
  }
});

test('the formats check fails what abapGit would refuse or not import', () => {
  const scaffold = scaffoldOf(fixture('co-shape'));
  const replace = (suffix: string, edit: (s: string) => string) => scaffold.files.map((f) => (f.path.endsWith(suffix) ? { ...f, content: edit(f.content) } : f));
  const failed = (files: ReadonlyArray<{ path: string; content: string }>) => packageFormatsCheck(files, schemas).filter((r) => r.status === 'failed');

  // An object source without its metadata file: abapGit does not create the object.
  const noMeta = failed(scaffold.files.filter((f) => !f.path.endsWith('_logic.clas.xml')));
  expect(noMeta.map((r) => r.path)).toEqual(['src/zcl_fx_co_alloc_logic.clas.abap', 'src/zcl_fx_co_alloc_logic.clas.testclasses.abap']);
  expect(noMeta[0].status === 'failed' && noMeta[0].message).toContain('abapGit does not import the object');

  // Without the <abapGit> wrapper abapGit's reader stops ("abapGit element not found").
  const unwrapped = failed(replace('_logic.clas.xml', (s) => s.replace(/<abapGit[^>]*>\n/, '').replace('</abapGit>\n', '')));
  expect(unwrapped).toHaveLength(1);
  expect(unwrapped[0].status === 'failed' && unwrapped[0].message).toContain('abapGit reads <abapGit> only');

  // A service definition without MASTER_LANGUAGE is refused by abapGit's SRVD deserializer.
  expect(failed(replace('.srvd.xml', (s) => s.replace(/ *<MASTER_LANGUAGE>EN<\/MASTER_LANGUAGE>\n/, '')))[0]).toMatchObject({ path: 'src/zfx_co_alloc_srvd.srvd.xml' });
  // The name inside must be the file's object.
  expect(failed(replace('_r.ddls.xml', (s) => s.replace('<DDLNAME>ZFX_CO_ALLOC_R</DDLNAME>', '<DDLNAME>ZOTHER</DDLNAME>')))).toHaveLength(1);
  // A binding of a service definition that is not in the package.
  expect(failed(replace('.srvb.xml', (s) => s.replace('<NAME>ZFX_CO_ALLOC_SRVD</NAME>', '<NAME>ZNOWHERE_SRVD</NAME>')))).toHaveLength(1);
  // A metadata file without its source.
  expect(failed(scaffold.files.filter((f) => !f.path.endsWith('.bdef.asbdef'))).map((r) => r.path)).toEqual(['src/zfx_co_alloc_r.bdef.xml']);
  // A description longer than 60 characters.
  expect(failed(replace('_nofill.clas.xml', (s) => s.replace(/<DESCRIPT>[^<]*</, `<DESCRIPT>${'d'.repeat(61)}<`)))).toHaveLength(1);
  // A table field with neither a data element nor a built-in type; a table name over 16 characters.
  expect(failed([{ path: 'src/zt.tabl.xml', content: tablXml('zt', 'T', [{ name: 'k', key: true, dataElement: 'X' }]).replace(/<ROLLNAME>X<\/ROLLNAME>/, '') }])).toHaveLength(1);
  expect(failed([{ path: 'src/zabcdefghijklmnop.tabl.xml', content: tablXml('zabcdefghijklmnop', 'T', [{ name: 'k', key: true, builtin: 'CLNT' }]) }])).toHaveLength(1);
  // Repository settings: an invented field, and a starting folder with nothing in it.
  expect(failed(replace('.abapgit.xml', (s) => s.replace('<FOLDER_LOGIC>', '<START_CLASS>ZCL_DEMO_RAP_TEST</START_CLASS>\n   <FOLDER_LOGIC>')))).toHaveLength(1);
  expect(failed([{ path: '.abapgit.xml', content: abapGitRepoSettingsXml() }])).toHaveLength(1);
  // Not well-formed.
  expect(failed([{ path: 'src/zx.clas.xml', content: clasXml({ name: 'zx', description: 'x' }).replace('</VSEOCLASS>', '') }, { path: 'src/zx.clas.abap', content: '' }])).toHaveLength(1);
  expect(failed([{ path: 'src/zs.srvd.xml', content: srvdXml('zs', 'S') }, { path: 'src/zs.srvd.srvdsrv', content: '' }])).toEqual([]);
});

test("an AFF JSON metadata file is held against SAP's schema; an object with both formats is refused", () => {
  const example = fs.readFileSync(path.join(FIXTURES, 'examples', 'z_aff_example_ddls.ddls.json'), 'utf8');
  const files = [
    { path: 'src/z_aff_example_ddls.ddls.json', content: example },
    { path: 'src/z_aff_example_ddls.ddls.asddls', content: 'define view entity Z_AFF_EXAMPLE_DDLS as select from t000 { key mandt }' },
  ];
  const results = packageFormatsCheck(files, schemas);
  expect(results.map((r) => [r.path, r.status])).toEqual([
    ['src/z_aff_example_ddls.ddls.json', 'passed'],
    ['src/z_aff_example_ddls.ddls.asddls', 'not-run'],
  ]);
  const tooLong = JSON.stringify({ ...JSON.parse(example), header: { description: 'y'.repeat(70), originalLanguage: 'en' } });
  expect(packageFormatsCheck([{ ...files[0], content: tooLong }, files[1]], schemas)[0]).toMatchObject({ status: 'failed', schemaPath: '#/properties/header/properties/description/maxLength' });
  // abaplint refuses an object with both an AFF JSON and an abapGit XML file.
  const scaffold = scaffoldOf(fixture('co-shape'));
  const both = [...scaffold.files, { path: 'src/zfx_co_alloc_r.ddls.json', content: example }];
  expect(abaplintPackageCheck(both).issues.map((i) => i.rule)).toContain('aff_and_xml');
});

test('the RAP verifier counts both formats in one check, three ways', async () => {
  const scaffold = scaffoldOf(fixture('sd-shape'));
  const verify = createRunnerVerifier({ candidate: () => scaffold.files, units: [], formats: packageFormatsHook(schemas) });
  const outcome = await verify(new Map(), { round: 0, signal: new AbortController().signal });
  const formats = outcome.checks.find((c) => c.kind === 'formats')!;
  const xml = scaffold.files.filter((f) => f.path.endsWith('.xml')).length;
  expect(formats).toMatchObject({ failed: 0, passed: xml });
  expect((formats.passed ?? 0) + formats.failed + (formats.notRun ?? 0)).toBe(formats.total);
  expect(checkPhrase(formats)).toMatch(/^object files against SAP's ABAP file formats \(AFF schemas\) and abapGit's serializer format: \d+ passed, 0 failed, \d+ not run — source files have no file format to check here/);
});

test('a transparent table name stays within 16 characters', () => {
  expect(rapTableName('fx_co_alloc')).toBe('zfx_co_alloc_rec');
  expect(rapTableName('mm_po_approv')).toBe('zmm_po_appro_rec');
  expect(rapTableName('mm_po_appro_')).toBe('zmm_po_appro_rec');
  for (const s of ['a', 'abcdefghijkl', 'ab_cd_ef_gh_']) expect(rapTableName(s).length).toBeLessThanOrEqual(16);
});
