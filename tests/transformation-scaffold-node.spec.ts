import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PACKAGE_NODE_MAJOR } from '../lib/delivery-package';
import { divRound, formatScaled, roundCommercial } from '../lib/testing-engine-cases';
import { SCAFFOLD_NODE_MAJOR, buildNodeScaffold, engineCaseScope, spliceBodies, withTrace } from '../lib/transformation';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import {
  fileUrl,
  fixture,
  nodePackage,
  planOf,
  poDemo,
  poDemoWithoutDefault,
  runEngineCases,
  runHarness,
  runInPackage,
  typecheck,
  writePackage,
} from './helpers/transformation-scaffold';

/**
 * The Node.js scaffold (docs/design/engine-led-transformation.md §6.2) — engine-written, with
 * stubs where the model writes. Server-free: the package is written to a temp directory and its
 * TypeScript is run by a child Node (type stripping) and checked by tsc with its own tsconfig.
 * The harness runs it with --trusted-fixture: the scaffold is our own code.
 */

test.describe.configure({ mode: 'serial' });

const ENGINE_FILES = [
  'package.json',
  'tsconfig.json',
  'srv/lib/errors.ts',
  'srv/lib/decimal.ts',
  'srv/lib/csv.ts',
  'srv/lib/run-store.ts',
  'srv/lib/types.ts',
  'srv/lib/input-contract.ts',
  'srv/lib/guards.ts',
  'srv/process.ts',
  'srv/simulate.ts',
  'srv/app.ts',
  'srv/server.ts',
  'srv/engine-contract.ts',
  'db/schema.cds',
  'test/engine-cases.json',
  'test/engine-runtime.mjs',
  'test/engine-cases.test.mjs',
  'test/acceptance-shims.ts',
  'acceptance-adapter.json',
  'Dockerfile',
  'traceability.json',
  'TRACE.md',
];

test('the files of §6.2, one step file per unit; package.json declares exactly what the code imports', () => {
  const { plan, files, dir } = nodePackage(poDemo());
  try {
    const paths = files.map((f) => f.path);
    for (const p of ENGINE_FILES) expect(paths, p).toContain(p);
    for (const u of plan.units) expect(paths).toContain(u.file);
    const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content);
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies).toEqual({});
    const bare = new Set<string>();
    for (const f of files.filter((x) => /\.(ts|mjs)$/.test(x.path))) {
      for (const m of f.content.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) if (!m[1].startsWith('.') && !m[1].startsWith('node:')) bare.add(m[1]);
    }
    expect([...bare]).toEqual([]);
    // No server on import: only srv/server.ts listens, and only when started directly.
    for (const f of files.filter((x) => x.path.endsWith('.ts'))) {
      if (f.path === 'srv/server.ts') expect(f.content).toMatch(/import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/);
      else expect(f.content, f.path).not.toMatch(/\.listen\s*\(/);
    }
    expect(files.find((f) => f.path === 'srv/app.ts')!.content).toContain('export function createApp(');
    expect(SCAFFOLD_NODE_MAJOR).toBe(PACKAGE_NODE_MAJOR);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the generated TypeScript compiles with its own tsconfig — PO demo and every fixture shape', () => {
  for (const source of [poDemo(), fixture('co-shape'), fixture('pp-shape'), fixture('sd-shape')]) {
    const { dir } = nodePackage(source);
    try {
      const r = typecheck(dir);
      expect(r.output).toBe('');
      expect(r.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('branded decimals carry the declared places and bounds; the input contract lists every field', () => {
  const { files, dir } = nodePackage(fixture('co-shape'));
  fs.rmSync(dir, { recursive: true, force: true });
  const types = files.find((f) => f.path === 'srv/lib/types.ts')!.content;
  expect(types).toContain('"QUOTA": { name: "QUOTA", digits: 7, places: 2, max: "99999.99", line: 14 }');
  expect(types).toContain('export type Quota = Dec<"QUOTA">;');
  expect(types).toMatch(/quota: Dec<"QUOTA">;/);
  expect(types).toMatch(/gjahr: string;/);
  expect(types).not.toMatch(/latest|lastResult/i);
  const contract = files.find((f) => f.path === 'srv/lib/input-contract.ts')!.content;
  expect(contract).toContain('export const CSV_DELIMITER = ";";');
  expect(contract).toContain('{ original: "P_GJAHR", key: "gjahr", where: "selection", kind: "digits", digits: 4');
  expect(contract).not.toMatch(/\bparse(Int|Float)\s*\(/);
  const guards = files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
  expect(guards).toContain('export function guard_BR_002_G0029(');
  expect(guards).toContain('rule: "BR-002"');
  expect(guards).toContain('export function skip_G0074(');
});

test('decimal.ts: exact arithmetic and commercial rounding, as the engine cases compute them', () => {
  const { dir } = nodePackage(fixture('co-shape'));
  try {
    const values = ['0.005', '-0.005', '0.004', '-0.004', '1.005', '-1.005', '2.675', '-2.675', '123456.7849', '-0.0049999', '0', '7'];
    const got = runInPackage<Record<string, unknown>>(
      dir,
      `const dec = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/decimal.ts'))});
       const values = ${JSON.stringify(values)};
       const out = {
         round: values.map((v) => [0, 2, 3].map((d) => dec.round(v, d))),
         sum: dec.add('0.1', '0.2', 2), tenth: Array.from({ length: 9 }).reduce((a) => dec.add(a, '0.1', 2), '0.1'),
         div: [dec.div('2', '3', 2), dec.div('-2', '3', 2), dec.div('1', '8', 2), dec.div('-1', '8', 2), dec.div('10', '4', 0)],
         mul: dec.mul('1.25', '1.25', 2), pct: dec.percentOf('0.30', '7.5', 2),
         fits: [dec.fits('99999.99', '99999.99'), dec.fits('100000.00', '99999.99'), dec.fits('-99999.99', '99999.99')],
         strict: ['2026x', '1e3', ' 12.5 ', '+1', '.5', '', '1.2.3'].map((v) => dec.parse(v) !== null),
         divZero: (() => { try { dec.div('1', '0', 2); return 'no'; } catch (e) { return e.name; } })(),
       };
       console.log(JSON.stringify(out));`,
    );
    expect(got.round).toEqual(values.map((v) => [0, 2, 3].map((d) => roundCommercial(v, d))));
    expect(got.sum).toBe('0.30');
    expect(got.tenth).toBe('1.00');
    const big = (n: number) => BigInt(n);
    expect(got.div).toEqual([
      formatScaled(divRound(big(200), big(3)), 2),
      formatScaled(divRound(big(-200), big(3)), 2),
      '0.13',
      '-0.13',
      '3',
    ]);
    expect(got.mul).toBe('1.56');
    expect(got.pct).toBe('0.02');
    expect(got.fits).toEqual([true, false, true]);
    expect(got.strict).toEqual([false, false, true, true, false, false, false]);
    expect(got.divZero).toBe('RangeError');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('csv.ts: RFC 4180 and the formula guard — leading spaces and tabs do not hide a formula (SEC-2026-803)', () => {
  const { dir } = nodePackage(fixture('co-shape'));
  try {
    const got = runInPackage<{ cells: string[]; table: string; parsed: string[][] }>(
      dir,
      `const csv = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/csv.ts'))});
       const inputs = ['=1+1', ' =1+1', '\\t=1+1', '  \\t @SUM(A1)', '+cmd', '-2+3', ' -1', '@x', '\\rX', '-12.50', '+7', '42', 'plain', 'a;b', 'say "hi"', 'two\\nlines'];
       const cells = inputs.map((v) => csv.cell(v, ';'));
       const table = csv.table(['a', 'b'], [{ a: 'x;y', b: '=HYPERLINK("http://x")' }, { a: -5, b: null }], ';');
       console.log(JSON.stringify({ cells, table, parsed: csv.parse(table, ';') }));`,
    );
    expect(got.cells).toEqual([
      "'=1+1",
      "' =1+1",
      "'\t=1+1",
      "'  \t @SUM(A1)",
      "'+cmd",
      "'-2+3",
      "' -1",
      "'@x",
      "\"'\rX\"",
      '-12.50',
      '+7',
      '42',
      'plain',
      '"a;b"',
      '"say ""hi"""',
      '"two\nlines"',
    ]);
    expect(got.parsed).toEqual([
      ['a', 'b'],
      ['x;y', '\'=HYPERLINK("http://x")'],
      ['-5', ''],
    ]);
    expect(got.table.endsWith('\r\n')).toBe(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run-store.ts: 10,000 runs, 10,000 ids, none overwritten, every run frozen', () => {
  const { dir } = nodePackage(fixture('co-shape'));
  try {
    const got = runInPackage<{ ids: number; size: number; frozen: boolean; first: boolean }>(
      dir,
      `const { createRunStore } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/run-store.ts'))});
       const store = createRunStore();
       const realNow = Date.now; Date.now = () => 1767225600000;
       const ids = new Set(); let first;
       for (let i = 0; i < 10000; i++) { const r = store.create({ selection: { i }, sourceRevision: 's', ruleRevision: 'r', contextDigest: null, complete: true, notFilled: [], records: 1, result: { i } }); if (i === 0) first = r.runId; ids.add(r.runId); }
       Date.now = realNow;
       const one = store.get(first);
       let frozen = false; try { one.result.i = 99; } catch { frozen = true; }
       console.log(JSON.stringify({ ids: ids.size, size: store.size(), frozen: frozen || one.result.i === 0, first: one.selection.i === 0 }));`,
    );
    expect(got).toEqual({ ids: 10000, size: 10000, frozen: true, first: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the call contract on the scaffold alone: one validator, refusals named, a stub never hidden', () => {
  const { dir } = nodePackage(fixture('co-shape'));
  try {
    const got = runInPackage<Record<string, unknown>>(
      dir,
      `const c = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});
       const { requestFromCsv, validateRequest } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/input-contract.ts'))});
       const base = structuredClone(c.CONTRACT.baseRequest);
       const v = c.validate(base);
       const s = c.simulate(base);
       const run = c.getRun(s.runId);
       const empty = c.simulate({});
       const unknown = c.validate({ ...base, extra: 1 });
       const year = c.validate({ ...base, gjahr: '2026x' });
       const quota = c.validate({ ...base, records: [{ ...base.records[0], quota: '100000.00' }] });
       const csvRaw = requestFromCsv('kostl;quota;amount\\r\\nC1;12.345;10\\r\\n', { kokrs: 'A100', gjahr: '2026', sender: 'C9' });
       const csv = validateRequest(csvRaw);
       const headerOnly = validateRequest(requestFromCsv('kostl;quota;amount\\r\\n', { kokrs: 'A100', gjahr: '2026', sender: 'C9' }));
       console.log(JSON.stringify({ base, v: v.ok, s, run: run && { runId: run.runId, complete: run.complete }, empty: empty.ok, emptyErrors: empty.errors.map((e) => e.rule),
         unknown: unknown.errors.map((e) => e.field), year: year.errors.map((e) => [e.field, e.rule]), quota: quota.errors.map((e) => e.field),
         csv: csv.ok && csv.normalized.records[0], headerOnly: headerOnly.ok, compute: c.compute('GV_TOTAL', '0.1', '+', '0.2'),
         overflow: (() => { try { c.compute('QUOTA', '99999.99', '+', '0.01'); return 'accepted'; } catch (e) { return 'refused'; } })() }));`,
    );
    expect(got.v).toBe(true);
    expect(got.s).toMatchObject({ ok: true, records: 1, complete: false, errors: [] });
    expect((got.s as { notFilled: string[] }).notFilled).toEqual(expect.arrayContaining(['U00', 'U00.G0029']));
    expect(got.run).toMatchObject({ complete: false });
    expect(got.empty).toBe(false);
    expect(got.emptyErrors).toContain('INPUT');
    expect(got.unknown).toEqual(['extra']);
    expect(got.year).toEqual([['gjahr', 'L24']]);
    expect(got.quota).toEqual(['records[0].quota']);
    expect(got.csv).toEqual({ quota: '12.35', amount: '10.00', kostl: 'C1' });
    expect(got.headerOnly).toBe(false);
    expect(got.compute).toBe('0.30');
    expect(got.overflow).toBe('refused');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the harness on the scaffold alone: every probe of engine-written code passes; the rest is not applicable', () => {
  for (const [name, source] of [['co-shape', fixture('co-shape')], ['PO demo', poDemo()]] as const) {
    const { dir } = nodePackage(source);
    try {
      const report = runHarness(dir);
      expect(report.sandbox.executed, name).toBe(true);
      expect(report.summary.fail, name).toBe(0);
      expect(report.summary['not-runnable'], name).toBe(0);
      for (const id of ['FP-TEST-03', 'FP-PREC-02', 'FP-PREC-01', 'FP-RUN-02', 'FP-RUN-01', 'FP-GUARD-04', 'FP-GUARD-07']) {
        expect(report.patterns[id].status, `${name} ${id}`).toBe('pass');
      }
      // CO shape: an obligatory year → the lenient-number probe runs; the PO demo has no such field.
      expect(report.patterns['FP-GUARD-03'].status).toBe(name === 'co-shape' ? 'pass' : 'not-applicable');
      for (const id of ['FP-SCOPE-01', 'FP-MEAN-05', 'FP-GUARD-05']) expect(report.patterns[id].status).toBe('not-applicable');
      expect(report.static.findings).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the probes are not vacuous: a scaffold with float rounding and no formula guard goes red', () => {
  const { files, dir: clean } = nodePackage(fixture('co-shape'));
  fs.rmSync(clean, { recursive: true, force: true });
  const broken = files.map((f) => {
    if (f.path === 'srv/lib/decimal.ts') return { ...f, content: f.content.replace('export function percentOf(amount: string, ratePercent: string, places: number): string {', 'export function percentOf(amount: string, ratePercent: string, places: number): string {\n  return (Math.round(+amount * +ratePercent) / 100).toFixed(places);') };
    if (f.path === 'srv/lib/csv.ts') return { ...f, content: f.content.replace('export function neutralise(text: string): string {', 'export function neutralise(text: string): string {\n  return text;') };
    return f;
  });
  const dir = writePackage(broken);
  try {
    const report = runHarness(dir);
    expect(report.patterns['FP-PREC-02'].status).toBe('fail');
    expect(report.patterns['FP-GUARD-07'].status).toBe('fail');
    expect(report.patterns['FP-RUN-02'].status).toBe('pass');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no valid base value known: every engine case reads Not run and names the field — nothing fails for a guessed value', () => {
  for (const [source, fields] of [[poDemoWithoutDefault(), 'P_BANFN'], [fixture('sd-shape'), 'NETWR, P_VKORG']] as const) {
    const { dir, plan } = nodePackage(source);
    try {
      expect(plan.missingBaseValues.join(', ')).toBe(fields);
      const report = runEngineCases(dir);
      expect(report.summary.passed + report.summary.failed).toBe(0);
      for (const c of report.cases) expect(c.reason, c.id).toContain(`no valid base value known for ${fields}`);
      // The run ids are still probed — on the run store itself.
      const harness = runHarness(dir);
      expect(harness.patterns['FP-RUN-02'].status).toBe('pass');
      expect(harness.patterns['FP-RUN-01'].status).toBe('pass');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the engine cases through the contract: every case the scaffold alone answers passes', () => {
  for (const source of [fixture('co-shape'), fixture('pp-shape').replace('PARAMETERS p_werks TYPE werks_d OBLIGATORY.', "PARAMETERS p_werks TYPE werks_d OBLIGATORY DEFAULT '1000'.")]) {
    const { facts } = planOf(source);
    const { dir } = nodePackage(source);
    try {
      const report = runEngineCases(dir);
      expect(report.contract.present).toBe(true);
      const scope = engineCaseScope(deriveEngineCases(facts.source, facts.ruleSet.rules).cases);
      const byId = new Map(report.cases.map((c) => [c.id, c]));
      const failedInScope = scope.scaffold.filter((id) => byId.get(id)?.status === 'Failed');
      expect(failedInScope, JSON.stringify(failedInScope.map((id) => byId.get(id)))).toEqual([]);
      const passed = scope.scaffold.filter((id) => byId.get(id)?.status === 'Passed');
      expect(passed.length).toBeGreaterThanOrEqual(3);
      // Run identity and the empty request are always the scaffold's.
      expect(report.cases.find((c) => c.status === 'Passed' && /^TC_ENG_/.test(c.id))).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('hand-filled bodies make a guard case pass; the spliced package still compiles and its trace says who wrote what', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const scaffold = buildNodeScaffold(plan, facts);
  const bodies = [
    { regionId: 'U00', body: 'const r = validatePolicy(sel, st);\nif (r) return r;' },
    { regionId: 'U02.G0061', body: "return st.records.some((r) => dec.compare(r.quota, '100') > 0);" },
  ];
  const spliced = spliceBodies(scaffold, bodies, (id) => ({ track: 'node', available: scaffold.available[id] ?? [], sliceChars: 400 }));
  expect(spliced.refused).toEqual([]);
  expect(spliced.ok).toBe(true);
  const { files, trace } = withTrace(plan, scaffold, spliced.files, bodies.map((b) => ({ regionId: b.regionId, state: 'model' as const })));
  expect(trace.units.find((u) => u.unitId === 'U00')!.filledBy).toBe('not-filled'); // its selection-screen predicate is still a stub
  expect(trace.units.find((u) => u.unitId === 'U01')!.filledBy).toBe('not-filled');
  const dir = writePackage(files);
  try {
    expect(typecheck(dir).ok).toBe(true);
    const report = runEngineCases(dir);
    const ids = deriveEngineCases(facts.source, facts.ruleSet.rules).cases.filter((c) => c.engineCase.trace.ruleId === 'BR-003').map((c) => c.id);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(report.cases.find((c) => c.id === id)!.status, id).toBe('Passed');
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'traceability.json'), 'utf8'));
    expect(json.scaffoldDigest).toBe(scaffold.digest);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
