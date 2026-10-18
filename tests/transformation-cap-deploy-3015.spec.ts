import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import type { HandoverProject } from '../lib/handover';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { capActionOf } from '../lib/transformation/cap-shell';
import { contractModel } from '../lib/transformation/call-contract';
import { CANDIDATE_TS_OPTIONS, typeCheckCandidate } from '../lib/test-sandbox/type-check';
import { markerSpans, mapTypeFindings } from '../lib/transformation/verify';
import { generatedCodeLints } from '../lib/generated-code-lints';
import { applyNodeTemplates, createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import { fileUrl, fixture, poDemo, ROOT, runEngineCases, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.15 items (3) and (5) — the CAP route from its first deploy to SAP BTP (owner, 16.10.2026: the
 * 1,000-line starter example, side-by-side by the engine's own recommendation, generated on v3.0.14, delivered and
 * pushed to the Cloud Foundry trial). Each test fails without its fix. Server-free.
 *
 *   (3)  the action is not called `run`: CAP warned "custom action 'run()' conflicts with method in base class";
 *   (5a) the server's type check runs in the production build: webpack compiled `createRequire(<expression>)` to
 *        `undefined`, every load threw "a is not a function", and the generation stored "tsc not run" — while
 *        `tsc` reports TS2554 for the body that crashed the run;
 *   (5b) an error inside a step answers 500 for that request; CAP shut the server down on the uncaught TypeError;
 *   (5c/d) the delivery package keeps the engine's package.json and tsconfig.json;
 *   (5e) the code checks know the dependencies a CAP package uses through its configuration;
 *   (5f) the base request carries the sales organisation the original refuses empty (L182), so the cases run.
 */

test.describe.configure({ timeout: 240_000 });

const LEGACY_1000 = path.join(ROOT, 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const legacy = () => fs.readFileSync(LEGACY_1000, 'utf8');

function prep(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}
const file = (p: EngineLedPrepared, name: string) => p.scaffold.files.find((f) => f.path === name)?.content ?? '';

/** Methods of `cds.Service` (and its base classes) an action of the same name would shadow — CAP's documented API. */
const CDS_SERVICE_METHODS = ['run', 'emit', 'send', 'read', 'create', 'insert', 'upsert', 'update', 'delete', 'tx', 'dispatch', 'handle', 'on', 'once', 'before', 'after', 'reject', 'prepend', 'init', 'schedule', 'foreach', 'stream', 'exists', 'disconnect'];

test.describe('(3) the CAP action cannot shadow a method of cds.Service', () => {
  test('the 1,000-line example (it writes ZSD_ORD_RISK): action runProcess, handled under that name; never run', () => {
    const p = prep(legacy());
    const cds = file(p, 'srv/service.cds');
    expect(cds).toMatch(/^ {2}action runProcess\(/m);
    expect(cds).not.toMatch(/\baction run\(/);
    expect(cds).toContain('an action `runProcess` runs the process');
    expect(file(p, 'srv/service.ts')).toContain("this.on('runProcess', (req) => {");
    expect(file(p, 'srv/service.ts')).not.toContain("this.on('run'");
  });

  test('no architecture names its action after a method of cds.Service', () => {
    for (const a of ['writing', 'read-only'] as const) expect(CDS_SERVICE_METHODS).not.toContain(capActionOf(a));
    // A read-only program keeps `simulate`.
    expect(file(prep(fixture('co-shape')), 'srv/service.cds')).toMatch(/^ {2}action simulate\(/m);
    expect(file(prep(poDemo()), 'srv/service.cds')).toMatch(/^ {2}action runProcess\(/m);
  });
});

/** The body U02 the model wrote on 16.10.2026: the engine's `checked(st, fn)` called with four arguments. */
const U02_AS_DELIVERED = `  let sySubrc = checked(sel, st, 'V_VBAK_VKO', { VKORG: '1000', ACTVT: '03' });
  const r1 = guard_G0200(sel, st, null, { sySubrc });
  if (r1) return r1;
  return undefined;`;

function withBody(files: EngineLedPrepared['scaffold']['files'], unit: string, body: string) {
  return files.map((f) => {
    const re = new RegExp(`(// @cc-fill BEGIN ${unit} [0-9a-f]+\\n)[\\s\\S]*?(\\n\\s*// @cc-fill END ${unit}\\b)`);
    return re.test(f.content) ? { ...f, content: f.content.replace(re, `$1${body}$2`) } : f;
  });
}

test.describe('(5a) the server type check runs in the production build and catches the body that crashed the run', () => {
  /** Next's own webpack, as the production server build uses it (`javascript/auto`, `createRequire` parsed). */
  function bundle(dir: string, entry: string): Promise<void> {
    const req = createRequire(path.join(ROOT, 'package.json'));
    const webpack = (req('next/dist/compiled/webpack/bundle5.js') as () => { webpack: (o: unknown) => { run: (cb: (e: Error | null, s: { hasErrors(): boolean; toString(): string }) => void) => void } })().webpack;
    const out = path.join(dir, 'out');
    return new Promise<void>((resolve, reject) => {
      webpack({
        mode: 'production',
        optimization: { minimize: false },
        target: 'node',
        context: dir,
        entry,
        module: { parser: { javascript: { createRequire: true } } },
        resolve: { extensions: ['.js'] },
        output: { path: out, filename: 'bundle.js', library: { type: 'commonjs2' } },
      }).run((err, stats) => (err ? reject(err) : stats.hasErrors() ? reject(new Error(stats.toString())) : resolve()));
    });
  }

  test("webpack turns an imported createRequire(<expression>) into undefined — serverRequire survives the build, and the type check runs", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-webpack-'));
    try {
      for (const rel of ['lib/server-require.ts', 'lib/test-sandbox/type-check.ts', 'lib/transformation/cap-api-declaration.ts', 'lib/transformation/cds-compile.ts']) {
        const js = transformSync(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' }).code;
        const target = path.join(dir, rel.replace(/\.ts$/, '.js'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, js);
      }
      // The control: the v3.0.14 form, compiled by the same build.
      fs.writeFileSync(
        path.join(dir, 'control.js'),
        "import { createRequire } from 'node:module';\nimport path from 'node:path';\nexport const loader = () => typeof createRequire(path.join(process.cwd(), 'package.json'));\n",
      );
      fs.writeFileSync(
        path.join(dir, 'entry.js'),
        "export { typeCheckCandidate } from './lib/test-sandbox/type-check';\nexport { cdsCompileCandidate } from './lib/transformation/cds-compile';\nexport { loader } from './control';\n",
      );
      await bundle(dir, './entry.js');
      const built = createRequire(__filename)(path.join(dir, 'out', 'bundle.js')) as {
        typeCheckCandidate: typeof typeCheckCandidate;
        cdsCompileCandidate: (files: Array<{ path: string; content: string }>) => { ran: boolean; reason?: string };
        loader: () => string;
      };
      expect(built.loader(), 'the build still rewrites an imported createRequire — the cause of 5a').toBe('undefined');
      const checked = built.typeCheckCandidate([{ path: 'srv/a.ts', content: 'export function checked<T>(st: number, fn: () => T): T { return fn(); }\nchecked(1, () => 2, 3, 4);\n' }]);
      expect(checked.ran, checked.ran ? '' : checked.reason).toBe(true);
      if (checked.ran) expect(checked.findings.map((f) => f.code)).toContain('TS2554');
      // The CDS compiler loads the same way: here it is installed (devDependency), so the compile runs.
      const compiled = built.cdsCompileCandidate([{ path: 'srv/s.cds', content: 'service S { entity E { key ID : Integer; } }\n' }]);
      expect(compiled.reason ?? '').not.toContain('is not a function');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('U02 as the model wrote it (checked with four arguments) is TS2554 and goes to repair as U02', () => {
    const p = prep(legacy());
    const files = withBody(p.scaffold.files, 'U02', U02_AS_DELIVERED);
    expect(files.find((f) => f.path === 'srv/steps/02-authority-check.ts')!.content).toContain("checked(sel, st, 'V_VBAK_VKO'");
    const r = typeCheckCandidate(files);
    expect(r.ran, r.ran ? '' : r.reason).toBe(true);
    if (!r.ran) return;
    const onU02 = r.findings.filter((f) => f.path === 'srv/steps/02-authority-check.ts');
    expect(onU02.map((f) => f.code)).toContain('TS2554');
    const failures = mapTypeFindings(r.findings, markerSpans(files));
    expect(failures.some((f) => f.unitId === 'U02' && f.check === 'types' && /TS2554/.test(f.failure))).toBe(true);
  });
});

test.describe('(5b) an error inside a step answers 500 for that request and never takes the service down', () => {
  test('the handler catches a TypeError of the run and rejects with 500 and a message without internals; a second request is answered', () => {
    const p = prep(legacy());
    const dir = writePackage(p.scaffold.files, 'cc-cap-5b-');
    try {
      // A stand-in for @sap/cds that records the handlers, as CAP registers them.
      const cdsDir = path.join(dir, 'node_modules', '@sap', 'cds');
      fs.mkdirSync(cdsDir, { recursive: true });
      fs.writeFileSync(path.join(cdsDir, 'package.json'), JSON.stringify({ name: '@sap/cds', type: 'module', main: 'index.js' }));
      fs.writeFileSync(
        path.join(cdsDir, 'index.js'),
        'class Service { constructor() { this.handlers = new Map(); } on(e, f) { this.handlers.set(e, f); return this; } init() { return Promise.resolve(); } }\nclass ApplicationService extends Service {}\nexport default { Service, ApplicationService, connect: { to: async () => new Service() } };\n',
      );
      // The error of 16.10.2026, thrown inside the run.
      const simulate = path.join(dir, 'srv', 'simulate.ts');
      const text = fs.readFileSync(simulate, 'utf8');
      const head = 'export function simulateRequest(raw: unknown, store: RunStore<Selection, RunResult>): SimulateAnswer {\n';
      expect(text).toContain(head);
      fs.writeFileSync(simulate, text.replace(head, `${head}  if ((raw as { vkorg?: unknown[] }).vkorg?.length) throw new TypeError('fn is not a function');\n`));
      const got = runInPackage<Array<Record<string, unknown>>>(
        dir,
        `const S = (await import(${JSON.stringify(fileUrl(dir, 'srv/service.ts'))})).default;
         const s = new S(); await s.init();
         const h = s.handlers.get('runProcess');
         const call = (data) => {
           const errors = [];
           const req = { data, error: (status, message) => { errors.push({ status, message }); }, reject: (status, message) => { const e = new Error(message); e.status = status; throw e; } };
           try { const r = h(req); return { threw: false, answered: r !== undefined, errors }; }
           catch (e) { return { threw: true, name: e.constructor.name, status: e.status ?? null, message: e.message }; }
         };
         console.log(JSON.stringify([call({ vkorg: [{ sign: 'I', option: 'EQ', low: '1000', high: '' }] }), call({ days: 90 })]));`,
      );
      expect(got[0]).toMatchObject({ threw: true, name: 'Error', status: 500 });
      expect(String(got[0].message)).not.toContain('fn is not a function');
      expect(String(got[0].message)).toContain('the service keeps running');
      // The same service answers the next request (here with the run's answer: the check of L182 is still a fill).
      expect(got[1]).toMatchObject({ threw: false, answered: true, errors: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function engineLedProject(files: ReadonlyArray<{ path: string; content: string }>): HandoverProject {
  return {
    id: 'p-legacy',
    name: 'Legacy audit',
    userId: 'owner-uid',
    legacyCode: legacy(),
    extensibilityRoute: 'Side-by-Side SAP BTP (CAP)',
    generatedCode: JSON.stringify(files.map((f) => ({ path: f.path, content: f.content }))),
    generationBinding: {
      path: 'engine-led',
      engine: { status: 'partial', units: 20, written: 20, repaired: 0, failing: [], scaffoldFindings: [], callsUsed: 20, budget: 40, rounds: 0, stop: 'passed', scaffoldVersion: 14, scaffoldDigest: 'a'.repeat(64), planDigest: 'b'.repeat(64), checks: [], notRun: [] },
      basis: [],
      elapsedMs: 1000,
    },
  } as unknown as HandoverProject;
}

function delivered(p: EngineLedPrepared) {
  const project = engineLedProject(p.scaffold.files);
  const facts = deliveryFactsOf(project, {
    phases: workflowSteps(project),
    rules: ruleFactsOf(null as never),
    score: scoreFactsOf(project, null),
    generatedAt: '2026-10-16T12:00:00.000Z',
    appVersion: 'v3.0.15',
    referenceSection: '',
    documentationFromEngine: true,
  });
  expect(facts.generation?.path).toBe('engine-led');
  const bundle = createDeliveryBundle();
  for (const f of p.scaffold.files) bundle.file(f.path, f.content, 'generated');
  return finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' });
}

test.describe('(5c, 5d) the delivery package keeps the engine scaffold\'s package.json and tsconfig.json', () => {
  test('the 1,000-line example: start is cds-serve, test/compile/typecheck stay, engines >=22.18; the tsconfig allows .ts imports', () => {
    const p = prep(legacy());
    const out = delivered(p);
    const shipped = (name: string) => out.files.find((f) => f.path === name)?.content ?? '';
    expect(shipped('package.json')).toBe(file(p, 'package.json'));
    const pkg = JSON.parse(shipped('package.json'));
    expect(pkg.scripts).toMatchObject({ start: 'cds-serve', watch: 'cds watch', compile: 'cds compile srv --to csn', test: 'node --test test/*.test.mjs', typecheck: 'tsc -p .' });
    expect(pkg.engines.node).toBe('>=22.18');
    expect(shipped('tsconfig.json')).toBe(file(p, 'tsconfig.json'));
    expect(JSON.parse(shipped('tsconfig.json')).compilerOptions.allowImportingTsExtensions).toBe(true);
    expect(shipped('Dockerfile')).toBe(file(p, 'Dockerfile'));
    // The readout follows: CAP is started by the package, the scripts are described as they are.
    const readme = shipped('README.md');
    expect(readme).toContain('`npm start` — starts the service (`cds-serve`)');
    expect(readme).toContain('`npm run typecheck` — type-checks the sources');
    expect(readme).not.toContain('tsx watch');
    const status = shipped('STATUS.md');
    expect(status).not.toContain('neither the start script nor the entry starts CAP');
    // The server's type check reads exactly the tsconfig that ships (the scaffold's `TSCONFIG`).
    const shippedOptions = JSON.parse(shipped('tsconfig.json')).compilerOptions;
    expect(shippedOptions).toEqual({ ...CANDIDATE_TS_OPTIONS });
  });

  test('a model-written package (not engine-led) is still normalised by the templates', () => {
    const p = prep(legacy());
    const entries = p.scaffold.files.map((f) => ({ path: f.path, content: f.content, origin: 'generated' as const }));
    const applied = applyNodeTemplates(entries, { name: 'x', layout: 'package' });
    const pkg = JSON.parse(applied.entries.find((e) => e.path === 'package.json')!.content);
    expect(pkg.scripts.start).toBe('node --import tsx srv/service.ts');
  });
});

test.describe('(5e) the code checks know what a CAP package uses through its configuration', () => {
  test('the 1,000-line example: no unused-dependency finding for @sap/xssec, @cap-js/hana, @cap-js/cds-types, @cap-js/sqlite', () => {
    const p = prep(legacy());
    const lints = generatedCodeLints(p.scaffold.files.map((f) => ({ path: f.path, content: f.content })));
    const unused = lints.filter((l) => l.id === 'unused-dependency').map((l) => l.message);
    expect(unused).toEqual([]);
  });

  test('outside a configured CAP package the check still reports a dependency nothing uses', () => {
    const pkg = { name: 'x', dependencies: { '@sap/xssec': '^4', '@cap-js/hana': '^2', express: '^4' } };
    const lints = generatedCodeLints([
      { path: 'package.json', content: JSON.stringify(pkg, null, 2) },
      { path: 'srv/a.ts', content: "import express from 'express';\nexport const app = express();\n" },
    ]);
    const unused = lints.filter((l) => l.id === 'unused-dependency').map((l) => l.message.split('"')[1]).sort();
    expect(unused).toEqual(['@cap-js/hana', '@sap/xssec']);
  });

  // QA 3adfcf87ca21: any CAP configuration used to excuse every one of these packages.
  test('a configured CAP package that names no HANA database and no XSUAA still gets @cap-js/hana and @sap/xssec reported', () => {
    const unusedOf = (cds: unknown) => {
      const pkg = { name: 'x', dependencies: { '@sap/cds': '^9', '@sap/xssec': '^4', '@cap-js/hana': '^2' }, devDependencies: { '@cap-js/sqlite': '^2' }, cds };
      return generatedCodeLints([
        { path: 'package.json', content: JSON.stringify(pkg, null, 2) },
        { path: 'srv/a.ts', content: "import cds from '@sap/cds';\nexport default cds.service.impl(() => {});\n" },
      ]).filter((l) => l.id === 'unused-dependency').map((l) => l.message.split('"')[1]).sort();
    };
    expect(unusedOf({ requires: { db: { kind: 'sqlite' } } })).toEqual(['@cap-js/hana', '@sap/xssec']);
    expect(unusedOf({ requires: { '[production]': { auth: 'xsuaa' } } })).toEqual(['@cap-js/hana']);
    expect(unusedOf({ requires: { '[production]': { auth: { kind: 'xsuaa' }, db: 'hana' } } })).toEqual([]);
    // A value of the same spelling under another key excuses nothing (QA 51233ed8f1e9).
    expect(unusedOf({ requires: { db: { kind: 'sqlite' }, reporting: { target: 'hana', mode: 'xsuaa' } } })).toEqual(['@cap-js/hana', '@sap/xssec']);
    expect(unusedOf({ requires: { db: { '[production]': { kind: 'hana' } } }, '[hybrid]': { requires: { auth: 'ias' } } })).toEqual([]);
  });
});

test.describe('(5f) the base request satisfies the selection the original refuses empty', () => {
  test('the 1,000-line example: S_VKORG (L182 refuses it empty) carries its DEFAULT c_default_vkorg = 1000; the engine cases run', () => {
    const p = prep(legacy());
    const contract = contractModel(p.plan);
    expect(contract.baseRequest.vkorg).toEqual(['1000']);
    expect(contract.missingBaseValues).not.toContain('S_VKORG');
    // A range no check requires stays empty, its natural state.
    expect(contract.baseRequest.vbeln).toEqual([]);
    const dir = writePackage(p.scaffold.files, 'cc-cap-5f-');
    try {
      const report = runEngineCases(dir);
      const reasons = report.cases.map((c) => c.reason ?? '').join('\n');
      expect(reasons).not.toContain('baseRequest is refused');
      expect(report.summary.passed).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
