import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildRapScaffold } from '../lib/transformation';
import { affCheck, affCount, affFileNameOf, AFF_NOT_RUN, type AffSchemaSource } from '../lib/transformation/aff-check';
import { createRunnerVerifier, packageFormatsHook } from '../lib/transformation/verify';
import { checkPhrase } from '../lib/transformation/check-words';
import { AFF_SCHEMAS, affSchemaSource } from '../lib/transformation/aff-schemas';
import { fixture, planOf, ROOT } from './helpers/transformation-scaffold';

/**
 * The file-format check of the RAP track (roadmap 3.0.12, owner 13.10.2026):
 * generated ABAP object files against SAP's ABAP file formats
 * (github.com/SAP/abap-file-formats). Server-free.
 *
 * The schemas come from the weekly sync (`lib/generated/aff-schemas/<type>.json`)
 * when it is in the tree, else from SAP's own files copied into
 * `tests/fixtures/aff/` at a recorded commit (see its README). No schema
 * content is written here.
 */

const SYNCED = path.join(ROOT, 'lib', 'generated', 'aff-schemas');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'aff');

const schemas: AffSchemaSource = (type, version) => {
  for (const p of [path.join(SYNCED, `${type}.json`), path.join(FIXTURES, `${type}-v${version}.json`)]) {
    if (!fs.existsSync(p)) continue;
    const schema = JSON.parse(fs.readFileSync(p, 'utf8')) as { $id?: string };
    // A synced file of another format version is not this file's schema.
    if (typeof schema.$id === 'string' && !schema.$id.endsWith(`/${type}-v${version}.json`)) continue;
    return schema;
  }
  return null;
};

const example = (name: string) => fs.readFileSync(path.join(FIXTURES, 'examples', name), 'utf8');

test("SAP's own example metadata files pass against their schemas", () => {
  const results = affCheck(
    [
      { path: 'src/z_aff_example_ddls.ddls.json', content: example('z_aff_example_ddls.ddls.json') },
      { path: 'src/z_aff_example_srvb.srvb.json', content: example('z_aff_example_srvb.srvb.json') },
      { path: 'src/z_aff_example_clas.clas.json', content: example('z_aff_example_clas.clas.json') },
    ],
    schemas,
  );
  expect(results.map((r) => [r.type, r.status])).toEqual([
    ['ddls', 'passed'],
    ['srvb', 'passed'],
    ['clas', 'passed'],
  ]);
});

test('a broken metadata file fails with the schema path of its first error and the place in the file', () => {
  const good = JSON.parse(example('z_aff_example_ddls.ddls.json')) as { header: { description: string } };
  const tooLong = { ...good, header: { ...good.header, description: 'x'.repeat(61) } };
  const unknownProperty = { ...good, sourceKind: 'invented' };
  const wrongEnum = { ...good, sourceType: 'tableFunctionOfMyOwn' };
  const results = affCheck(
    [
      { path: 'src/zv_a.ddls.json', content: JSON.stringify(tooLong) },
      { path: 'src/zv_b.ddls.json', content: JSON.stringify(unknownProperty) },
      { path: 'src/zv_c.ddls.json', content: JSON.stringify(wrongEnum) },
      { path: 'src/zv_d.ddls.json', content: '{ "formatVersion": "1", ' },
    ],
    schemas,
  );
  expect(results[0]).toMatchObject({ status: 'failed', path: 'src/zv_a.ddls.json', schemaPath: '#/properties/header/properties/description/maxLength', instancePath: '/header/description' });
  expect(results[1]).toMatchObject({ status: 'failed', schemaPath: '#/additionalProperties', instancePath: '/sourceKind' });
  expect(results[2]).toMatchObject({ status: 'failed', schemaPath: '#/properties/sourceType/enum', instancePath: '/sourceType' });
  expect(results[3]).toMatchObject({ status: 'failed', schemaPath: '' });
  expect(results[3].status === 'failed' && results[3].message).toMatch(/^not valid JSON/);
  const count = affCount(results, 0);
  expect(count).toMatchObject({ kind: 'formats', total: 4, passed: 0, failed: 4, notRun: 0 });
});

test('a type without a schema, a source file and an abapGit XML file are not run — never passed', () => {
  const results = affCheck(
    [
      { path: 'src/zfoo.zzzz.json', content: '{"formatVersion":"1"}' },
      { path: 'src/zfoo.ddls.json', content: '{"formatVersion":"9"}' },
      { path: 'src/zcl_a.clas.abap', content: 'CLASS zcl_a DEFINITION. ENDCLASS.' },
      { path: 'src/zsrvb.srvb.xml', content: '<abapGit/>' },
      { path: '.abapgit.xml', content: '<asx:abap/>' },
    ],
    schemas,
  );
  // `.abapgit.xml` is no object file and is left out.
  expect(results.map((r) => [r.path, r.status])).toEqual([
    ['src/zfoo.zzzz.json', 'not-run'],
    ['src/zfoo.ddls.json', 'not-run'],
    ['src/zcl_a.clas.abap', 'not-run'],
    ['src/zsrvb.srvb.xml', 'not-run'],
  ]);
  expect(results.map((r) => (r.status === 'not-run' ? r.reason : ''))).toEqual([AFF_NOT_RUN.noSchema, AFF_NOT_RUN.noSchema, AFF_NOT_RUN.source, AFF_NOT_RUN.abapGitXml]);
  // Without any schema in the build, a metadata file is not run either.
  expect(affCheck([{ path: 'src/z.ddls.json', content: example('z_aff_example_ddls.ddls.json') }], () => null)[0].status).toBe('not-run');
});

test('a schema with a keyword the check does not evaluate is not run, not passed', () => {
  const schema = { type: 'object', oneOf: [{ required: ['a'] }, { required: ['b'] }] };
  const [r] = affCheck([{ path: 'src/z.ddls.json', content: '{}' }], () => schema);
  expect(r.status).toBe('not-run');
  expect(r.status === 'not-run' && r.reason).toContain('#/oneOf');
});

test('file names: name, type and the rest of the extension', () => {
  expect(affFileNameOf('src/zcl_x_logic.clas.locals_imp.abap')).toEqual({ name: 'zcl_x_logic', type: 'clas', rest: 'locals_imp.abap' });
  expect(affFileNameOf('src/zv.ddls.json')).toEqual({ name: 'zv', type: 'ddls', rest: 'json' });
  expect(affFileNameOf('.abapgit.xml')).toBeNull();
  expect(affFileNameOf('acceptance-adapter.json')).toBeNull();
});

test('the RAP verifier counts the formats check three ways and reports a broken file as a finding in engine code', async () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const scaffold = buildRapScaffold(plan, facts);
  const tooLong = { ...JSON.parse(example('z_aff_example_ddls.ddls.json')), header: { description: 'y'.repeat(70), originalLanguage: 'en' } };
  const files = [...scaffold.files, { path: 'src/zfx_co_alloc_r.ddls.json', content: JSON.stringify(tooLong) }];
  // The RAP verifier's hook checks both formats (abapgit-check.ts): AFF JSON here, abapGit XML and `.abapgit.xml` beside it.
  const verify = createRunnerVerifier({ candidate: () => files, units: [], formats: packageFormatsHook(schemas) });
  const outcome = await verify(new Map(), { round: 0, signal: new AbortController().signal });

  const formats = outcome.checks.find((c) => c.kind === 'formats')!;
  const objectFiles = files.filter((f) => affFileNameOf(f.path)).length + 1; // + .abapgit.xml
  expect(formats).toMatchObject({ total: objectFiles, failed: 1 });
  expect((formats.passed ?? 0) + formats.failed + (formats.notRun ?? 0)).toBe(formats.total);
  // Every file of today's scaffold is source or abapGit XML: none of them can pass.
  const scaffoldResults = affCheck(scaffold.files, schemas);
  expect(scaffoldResults.filter((r) => r.status === 'failed')).toEqual([]);
  expect(scaffoldResults.filter((r) => r.status === 'passed').every((r) => r.path.endsWith('.json'))).toBe(true);

  const finding = outcome.failures.find((f) => f.check === 'formats')!;
  expect(finding.unitId).toBeNull();
  expect(finding.failure).toContain('src/zfx_co_alloc_r.ddls.json');
  expect(finding.failure).toContain('#/properties/header/properties/description/maxLength');

  const phrase = checkPhrase(formats);
  expect(phrase).toMatch(/^object files against SAP's ABAP file formats \(AFF schemas\) and abapGit's serializer format: \d+ passed, 1 failed, \d+ not run/);
  expect(phrase).not.toMatch(/\b\d+ object files? .*passed$/);
});

test('without the hook (Node track) the verifier says nothing about file formats', async () => {
  const verify = createRunnerVerifier({ candidate: () => [{ path: 'src/a.ts', content: '' }], units: [] });
  const outcome = await verify(new Map(), { round: 0, signal: new AbortController().signal });
  expect(outcome.checks.some((c) => c.kind === 'formats')).toBe(false);
  expect(outcome.notRun.some((n) => n.kind === 'formats')).toBe(false);
});

test('the browser\'s schema table holds every schema the sync copied, and answers by type and version', () => {
  const dir = path.resolve(__dirname, '..', 'lib/generated/aff-schemas');
  const copied = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  expect(Object.keys(AFF_SCHEMAS).sort()).toEqual(copied);
  expect(affSchemaSource('DDLS', '1')).toBe(AFF_SCHEMAS['ddls-v1']);
  expect(affSchemaSource('ddls', '9')).toBeNull();
});
