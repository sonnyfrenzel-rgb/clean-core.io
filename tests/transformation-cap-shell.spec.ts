import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate } from '../lib/test-sandbox/type-check';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { storedGenerationRecord } from '../lib/transformation/generation-record';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { readPackage, packageCapabilities } from '../lib/delivery-package';
import { cdsCompileRecordOf } from '../lib/transformation/check-words';
import { runEngineCase } from '../scripts/acceptance/child/engine-cases-core.mjs';
import { fixture, poDemo, ROOT, fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13 — "the side-by-side route becomes real CAP in two steps", step 2 (scaffold version 7): a CAP
 * shell around the Node core (`lib/transformation/cap-shell.ts`) and one input list per source structure
 * (`lib/transformation/input-lists.ts`).
 *
 *   - every scaffold compiles with SAP's CDS compiler (`cds-compile.ts`, a devDependency: here, never on the
 *     production server) and type-checks with the package's own tsconfig, the CAP handlers included;
 *   - the data model is one type and one entity per input structure, types as declared — never a field union;
 *   - the architecture is the RAP route's decision: a read-only program gets `simulate`, a writing one `run`;
 *   - the handlers only delegate to the core; reads go to remote services only on a released OData API;
 *   - the request carries named lists per structure, and an old single-list package still reads.
 *
 * Server-free. The real review programs (SD, PM holdout) live outside the repository and are checked where they are.
 */

test.describe.configure({ timeout: 180_000 });

const SD_DESKTOP = 'C:/Users/felix/OneDrive/Desktop/SD_LE_Legacy_ABAP.txt';
const PM_DESKTOP = 'C:/Users/felix/OneDrive/Desktop/PM_Legacy_ABAP.txt';
const GM_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'golden-master', 'three-cases.abap');

function prep(source: string, track: 'node' | 'rap' = 'node'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}
const file = (p: EngineLedPrepared, name: string) => p.scaffold.files.find((f) => f.path === name)?.content ?? '';

const SOURCES: Array<[string, () => string]> = [
  ['PO demo', poDemo],
  ['co-shape', () => fixture('co-shape')],
  ['pp-shape', () => fixture('pp-shape')],
  ['sd-shape', () => fixture('sd-shape')],
  ['contract-shape', () => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'transformation', 'contract-shape.abap'), 'utf8')],
  ['golden-master three-cases', () => fs.readFileSync(GM_FIXTURE, 'utf8')],
  ['SD (local file)', () => (fs.existsSync(SD_DESKTOP) ? fs.readFileSync(SD_DESKTOP, 'utf8') : '')],
  ['PM holdout (local file)', () => (fs.existsSync(PM_DESKTOP) ? fs.readFileSync(PM_DESKTOP, 'utf8') : '')],
];

test.describe('the CAP shell: cds compile and the type check, 0 errors', () => {
  for (const [name, source] of SOURCES) {
    test(`${name}: the shell is there, compiles and type-checks`, () => {
      const text = source();
      test.skip(text === '', `${name} is not on this machine — the repository's fixtures stand for it`);
      const p = prep(text);
      const paths = p.scaffold.files.map((f) => f.path);
      for (const must of ['package.json', 'db/schema.cds', 'srv/service.cds', 'srv/service.ts', 'srv/service.js', 'mta.yaml', 'xs-security.json']) expect(paths, must).toContain(must);
      expect(p.scaffold.version).toBe(SCAFFOLD_VERSION);
      expect(SCAFFOLD_VERSION).toBe(9);

      const cds = cdsCompileCandidate(p.scaffold.files);
      expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
      if (!cds.ran) return;
      expect(cds.findings.filter((f) => f.severity === 'Error'), JSON.stringify(cds.findings)).toEqual([]);
      expect(cds.errors).toBe(0);
      expect(cds.warnings, JSON.stringify(cds.findings)).toBe(0);
      expect(cds.services.some((s) => s.endsWith('Service'))).toBe(true);

      const types = typeCheckCandidate(p.scaffold.files);
      expect(types.ran, types.ran ? '' : types.reason).toBe(true);
      if (!types.ran) return;
      expect(types.findings, JSON.stringify(types.findings.slice(0, 5))).toEqual([]);
      expect(types.errors).toBe(0);

      const pkg = JSON.parse(file(p, 'package.json'));
      expect(pkg.dependencies['@sap/cds']).toBe('^10');
      expect(pkg.scripts).toMatchObject({ start: 'cds-serve', watch: 'cds watch', typecheck: 'tsc -p .' });
      expect(pkg.devDependencies['@cap-js/sqlite']).toBeTruthy();
      expect(pkg.engines.node).toBe('>=22.18');
      // mta.yaml: minimal, honest, no secrets.
      expect(file(p, 'mta.yaml')).toContain('Not built, deployed or run by Clean-Core.io');
      expect(file(p, 'mta.yaml')).not.toMatch(/password|clientsecret|client_secret|token\s*:/i);
    });
  }
});

test.describe('the data model: one entity per input structure, types as declared', () => {
  test('the contract shape: packed → Decimal(p,s), i → Integer, d → Date, n → String(len), c → String(len)', () => {
    const p = prep(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'transformation', 'contract-shape.abap'), 'utf8'));
    const schema = file(p, 'db/schema.cds');
    expect(schema).toMatch(/^type Claim \{/m);
    expect(schema).toMatch(/^entity Claims : Claim \{\n {2}key ID : UUID;\n\}/m);
    expect(schema).toMatch(/\bqty : Decimal\(\d+, \d+\);/);
    expect(schema).toMatch(/\bday : Date;/);
    expect(schema).toMatch(/\bpriority : Integer;/);
    expect(schema).toMatch(/\bitem : String\(\d+\);/);
    // Never the old field union.
    expect(schema).not.toContain('InputRecords');
  });

  test('SD (local file): three input structures stay three types — claims, policies, events — never one record', () => {
    test.skip(!fs.existsSync(SD_DESKTOP), `${SD_DESKTOP} is not on this machine`);
    const p = prep(fs.readFileSync(SD_DESKTOP, 'utf8'));
    const schema = file(p, 'db/schema.cds');
    for (const t of ['Claim', 'Policy', 'Event', 'Uom']) expect(schema).toMatch(new RegExp(`^type ${t} \\{`, 'm'));
    expect(schema).toMatch(/price : Decimal\(23, 6\);/);
    expect(schema).toMatch(/discrete : String\(1\) enum \{ X = 'X'; initial = ''; \};/);
    expect(schema).toMatch(/validFrom : Date;/);
    const service = file(p, 'srv/service.cds');
    expect(service).toMatch(/action simulate\(/);
    for (const l of ['claims : many db.Claim', 'policy : many db.Policy', 'raw : many db.Event']) expect(service).toContain(l);
    const types = file(p, 'srv/lib/types.ts');
    expect(types).toMatch(/export interface Rec \{\n\}/);
    expect(types).toMatch(/claims: TyClaim\[\];/);
  });
});

test.describe('the architecture is the RAP route\'s decision', () => {
  for (const [name, source] of SOURCES.slice(0, 5)) {
    test(`${name}: simulate for a read-only program, run for a writing one — as RAP's custom entity or business object`, () => {
      const node = prep(source());
      const rap = prep(source(), 'rap');
      const writing = rap.scaffold.rap?.architecture === 'managed-bo';
      expect(file(node, 'srv/service.cds')).toMatch(writing ? /action run\(/ : /action simulate\(/);
      expect(file(node, 'srv/service.ts')).toContain(writing ? "this.on('run'" : "this.on('simulate'");
    });
  }

  test('PO demo (writes): the customer tables it inserts are entities with exactly that operation; mta binds a database', () => {
    const p = prep(poDemo());
    const service = file(p, 'srv/service.cds');
    expect(service).toContain('@insertonly entity ZmmPoAppr as projection on db.ZmmPoAppr;');
    expect(service).toContain('@insertonly entity ZmmPoAttach as projection on db.ZmmPoAttach;');
    expect(file(p, 'mta.yaml')).toContain('service: hana');
    expect(JSON.parse(file(p, 'package.json')).cds.requires['[production]']).toMatchObject({ auth: 'xsuaa', db: 'hana' });
  });
});

test.describe('handlers delegate; the access layer reaches SAP only through released OData APIs', () => {
  test('srv/service.ts imports @sap/cds and the core, and holds no business logic', () => {
    const p = prep(poDemo());
    const handler = file(p, 'srv/service.ts');
    const imports = [...handler.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(imports).toEqual(['@sap/cds', './lib/run-store.ts', './lib/types.ts', './simulate.ts']);
    expect(handler).toContain('simulateRequest(requestOf(req.data), store)');
    expect(handler).not.toMatch(/\bdec\.|runSteps|guard_|when_G/);
    // Nothing of the core imports CAP: the sandbox runs the core without it.
    for (const f of p.scaffold.files.filter((x) => /^srv\/(?:lib|steps)\/|^srv\/(?:process|simulate|engine-contract|app)\.ts$/.test(x.path))) {
      expect(f.content, f.path).not.toContain('@sap/cds');
    }
  });

  test('PO demo: EBAN goes to its released OData API (placeholder, mocked); a CDS-view successor is not assumed remote (C2); the rest refuse', () => {
    const p = prep(poDemo());
    const access = file(p, 'srv/access.ts');
    expect(access).toContain("cds.connect.to('API_PURCHASEREQUISITION_SRV')");
    expect(access).toMatch(/export async function readMarc\(\): Promise<never> \{\n {2}throw new AccessRefused\("MARC", "MARC: this product's curated catalog names I_ProductPlant \(CDS View\) — a CDS View is not assumed to be released for remote use \(C2\); check/);
    expect(access).toContain('a read without a filter is refused');
    const external = file(p, 'srv/external/API_PURCHASEREQUISITION_SRV.cds');
    expect(external).toContain('@cc.placeholder');
    expect(external).toContain('PLACEHOLDER');
    expect(p.scaffold.files.some((f) => f.path === 'srv/external/data/API_PURCHASEREQUISITION_SRV-EBAN.csv')).toBe(true);
    const pkg = JSON.parse(file(p, 'package.json'));
    expect(pkg.cds.requires.API_PURCHASEREQUISITION_SRV).toMatchObject({ kind: 'odata-v2', model: 'srv/external/API_PURCHASEREQUISITION_SRV' });
    // The delivery readout: placeholders are not a verified connection.
    const reading = readPackage(p.scaffold.files, 'side-by-side');
    expect(reading.placeholderRemote).toContain('srv/external/API_PURCHASEREQUISITION_SRV.cds');
  });
});

test.describe('the gate reads the compile: implemented only when the shell compiles', () => {
  const facts = (cdsCompile: unknown) =>
    ({
      decision: { targetCode: 'cap', recommendation: null },
      cdsCompile,
    }) as unknown as Parameters<typeof packageCapabilities>[1];

  test('compiled (here, where the compiler is installed) → implemented; not run (the production server) → to be checked in your environment, never implemented', () => {
    const p = prep(poDemo());
    const reading = readPackage(p.scaffold.files, 'side-by-side');
    expect(reading.capRuntime && reading.capServed && reading.capShellFiles).toBe(true);
    const compiled = cdsCompileRecordOf(cdsCompileCandidate(p.scaffold.files));
    expect(compiled).toMatchObject({ ran: true, errors: 0, compiles: true });
    const cap = (c: unknown, k: string) => packageCapabilities(reading, facts(c)).find((x) => x.key === k)!;
    expect(cap(compiled, 'cap-runtime').status).toBe('implemented');
    expect(cap(compiled, 'service-model').status).toBe('implemented');
    const notRun = cdsCompileRecordOf({ ran: false, reason: 'cds compile not run: the compiler is not installed on this server.' });
    // Owner decision 14.10.2026: production names no compile check that did not run; it says CAP is the reader's
    // to install and how to check and start it — and the capability is not implemented, since nothing verified it.
    for (const record of [notRun, null]) {
      expect(cap(record, 'cap-runtime').status).toBe('to-check');
      expect(cap(record, 'service-model').status).toBe('to-check');
      const evidence = cap(record, 'cap-runtime').evidence;
      expect(evidence).toContain('SAP CAP (@sap/cds and its CDS compiler) is installed by you, not by Clean-Core.io');
      expect(evidence).toContain('`npm install`, then `npm run compile` to check the model and `cds watch` to start the service');
      expect(evidence).not.toMatch(/cds compile\b(?!r)|not run|not verified/i);
    }
    // A compile that ran with errors is reported as it ran, and is not implemented either.
    const failed = cdsCompileRecordOf({ ran: true, compiler: '9.0.0', files: 2, errors: 1, warnings: 0, services: [], findings: [{ path: 'srv/service.cds', line: 1, severity: 'Error', id: 'x', message: 'x' }] });
    expect(cap(failed, 'cap-runtime').status).toBe('proposed');
    expect(cap(failed, 'cap-runtime').evidence).toContain('cds compile: 1 error in 2 CDS files (@sap/cds-compiler 9.0.0)');
    // The remote definitions are placeholders: no SAP connection is claimed.
    expect(cap(compiled, 'sap-data').status).toBe('proposed');
  });

  test('a read-only simulation persists nothing: persistence is proposed, not implemented', () => {
    const p = prep(fixture('co-shape'));
    const reading = readPackage(p.scaffold.files, 'side-by-side');
    const compiled = cdsCompileRecordOf(cdsCompileCandidate(p.scaffold.files));
    const persistence = packageCapabilities(reading, facts(compiled)).find((x) => x.key === 'persistence')!;
    expect(persistence.status).toBe('proposed');
    expect(persistence.evidence).toContain('configures no database');
  });

  test('the CDS compiler stays out of the production build (SAP Developer License): a devDependency, never server-external', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.devDependencies['@sap/cds-compiler']).toBeTruthy();
    expect(pkg.dependencies['@sap/cds-compiler']).toBeUndefined();
    expect(pkg.dependencies['@sap/cds']).toBeUndefined();
    expect(fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8')).not.toContain('@sap/cds');
  });
});

test.describe('one named list per input structure; the old single-list package still reads', () => {
  test('co-shape: the request takes rcv[], refuses the old records list with the reason, and starts the run in GT_RCV', () => {
    const p = prep(fixture('co-shape'));
    const dir = writePackage(p.scaffold.files);
    try {
      const got = runInPackage<Record<string, unknown>>(
        dir,
        `const c = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});
         const base = structuredClone(c.CONTRACT.baseRequest);
         const old = c.validate({ ...Object.fromEntries(Object.entries(base).filter(([k]) => k !== 'rcv')), records: base.rcv });
         const none = c.validate({ ...base, rcv: [] });
         const two = c.simulate({ ...base, rcv: [base.rcv[0], { ...base.rcv[0], kostl: 'C2' }] });
         console.log(JSON.stringify({ keys: Object.keys(base), fields: c.CONTRACT.fields, old: old.errors.map((e) => e.message), none: none.errors.map((e) => e.message), two: two.records }));`,
      );
      expect(got.keys).toContain('rcv');
      expect(got.keys).not.toContain('records');
      expect((got.fields as Record<string, string>).QUOTA).toBe('rcv[].quota');
      expect((got.old as string[]).join(' ')).toContain('records: this package takes one list per input structure (rcv), not one record list');
      expect((got.none as string[]).join(' ')).toContain('empty selection: no rows in rcv');
      expect(got.two).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the engine runtime reads both shapes: records[] of a version-6 package, a named list of version 7', async () => {
    const skipCase = (field: string) => ({
      id: 'TC_ENG_01',
      examples: [{ input: 'a quota over 100 skips the record', call: { op: 'simulate', mode: 'append', set: [{ field, to: { value: '150.00' } }], expect: { kind: 'records-delta', delta: 0 } } }],
    });
    /** A contract whose simulate counts the rows it keeps: a quota over 100 is skipped, as the original does. */
    const contractOf = (list: string) => {
      const base = { gjahr: '2026', [list]: [{ quota: '10.00' }] };
      const count = (r: Record<string, unknown>) => ((r[list] as Array<{ quota: string }> | undefined) ?? []).filter((x) => Number(x.quota) <= 100).length;
      return {
        CONTRACT: { version: 1, baseRequest: base, fields: { QUOTA: `${list}[].quota`, P_GJAHR: 'gjahr' } },
        validate: (r: Record<string, unknown>) => ({ ok: true, errors: [], normalized: r }),
        simulate: (r: Record<string, unknown>) => ({ ok: true, runId: 'R1', records: count(r), errors: [] }),
        getRun: () => null,
        compute: () => '0',
      };
    };
    expect((await runEngineCase(contractOf('records'), skipCase('QUOTA'))).status).toBe('Passed');
    expect((await runEngineCase(contractOf('rcv'), skipCase('LS_RCV-QUOTA'))).status).toBe('Passed');
  });

  test('a stored version-6 package reads as before: no CAP claimed, its generation record intact', () => {
    // The shape scaffold version 6 shipped: no runtime dependency, one record list, an InputRecords entity.
    const v6 = [
      { path: 'package.json', content: JSON.stringify({ name: 'zfx-co-alloc-node', type: 'module', scripts: { start: 'node srv/server.ts', test: 'node --test test/' }, dependencies: {}, devDependencies: { typescript: '^5.9.3' } }) },
      { path: 'db/schema.cds', content: 'namespace cc.zfx_co_alloc;\n\nentity InputRecords {\n  key ID : UUID;\n  quota : Decimal(7, 2);\n}\n' },
      { path: 'srv/server.ts', content: "import { createApp } from './app.ts';\ncreateApp();\n" },
      { path: 'srv/engine-contract.ts', content: 'export const CONTRACT = { version: 1, baseRequest: { gjahr: "2026", records: [{ quota: "10.00" }] }, fields: { QUOTA: "records[].quota" } };\n' },
    ];
    const reading = readPackage(v6, 'side-by-side');
    expect(reading.capShellFiles).toBe(false);
    expect(reading.capRuntime).toBe(false);
    const caps = packageCapabilities(reading, { decision: { targetCode: 'cap', recommendation: null } } as unknown as Parameters<typeof packageCapabilities>[1]);
    expect(caps.find((c) => c.key === 'cap-runtime')).toMatchObject({ status: 'proposed', evidence: 'No @sap/cds dependency in package.json, so nothing starts a CAP runtime.' });
    expect(caps.find((c) => c.key === 'persistence')!.status).toBe('proposed');
    const engine = { status: 'partial', units: 3, written: 2, repaired: 0, failing: [], scaffoldFindings: [], callsUsed: 2, budget: 12, rounds: 0, stop: 'passed', scaffoldVersion: 6, scaffoldDigest: 'a'.repeat(64), planDigest: 'b'.repeat(64), checks: [], notRun: [] };
    const record = storedGenerationRecord({ path: 'engine-led', engine, basis: [], elapsedMs: 1000 });
    expect(record?.engine?.scaffoldVersion).toBe(6);
    expect(record && 'cdsCompile' in record).toBe(false);
  });
});
