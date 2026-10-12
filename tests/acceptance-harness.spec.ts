import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * The acceptance harness and the failure-pattern catalogue it reads
 * (docs/failure-patterns/). Server-free: the harness is a Node script, and the
 * packages it probes are the hand-written fixtures under
 * tests/fixtures/acceptance/ — one that avoids every probed pattern, one that
 * exhibits every one of them, and one whose dependency is not installed.
 *
 * `--trusted-fixture` is what lets the harness execute them on a Node without a
 * network permission. The fixtures are ours; a generated package never gets that
 * flag, and the last test shows what happens without it.
 */

const ROOT = path.join(__dirname, '..');
const HARNESS = path.join(ROOT, 'scripts', 'acceptance', 'run.mjs');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'acceptance');
const CATALOGUE = path.join(ROOT, 'docs', 'failure-patterns', 'catalogue.json');
const README = path.join(ROOT, 'docs', 'failure-patterns', 'README.md');

type Status = 'pass' | 'fail' | 'not-applicable' | 'not-runnable';
interface PatternResult { title: string; class: string; status: Status; evidence: string[]; staticFindings: number }
interface Report {
  sandbox: { executed: boolean; mode: string; reason: string };
  summary: Record<Status, number>;
  patterns: Record<string, PatternResult>;
  probes: { probe: string; outcomes: { pattern: string; status: Status; evidence: string }[] }[];
  static: { files: number; findings: { pattern: string; check: string; file: string; excerpt: string }[] };
}
interface CatalogueEntry {
  id: string;
  class: string;
  title: string;
  description: string;
  origin: { case: string; ids: string[] }[];
  probe: { input: string; expected: string };
  layers: string[];
  harnessProbe: string | null;
}

function runHarness(fixture: string, extra: string[] = []): { report: Report; markdown: string } {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acc-spec-'));
  try {
    execFileSync(process.execPath, [HARNESS, path.join(FIXTURES, fixture), '--out', out, '--timeout', '15000', ...extra], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 240_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      report: JSON.parse(fs.readFileSync(path.join(out, 'acceptance-report.json'), 'utf8')),
      markdown: fs.readFileSync(path.join(out, 'acceptance-report.md'), 'utf8'),
    };
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

function evidence(report: Report, id: string): string {
  return report.patterns[id]?.evidence.join(' / ') ?? '';
}

const catalogue: { classes: Record<string, string>; layers: Record<string, string>; patterns: CatalogueEntry[] } =
  JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));

test.describe('failure-pattern catalogue', () => {
  test('every entry is complete, unique and uses the declared classes and layers', () => {
    const ids = catalogue.patterns.map((p) => p.id);
    expect(new Set(ids).size, 'duplicate pattern ids').toBe(ids.length);
    expect(Object.keys(catalogue.classes)).toHaveLength(10);
    for (const p of catalogue.patterns) {
      expect(p.id, p.id).toMatch(/^FP-[A-Z]+-\d{2}$/);
      expect(Object.keys(catalogue.classes), `${p.id} class`).toContain(p.class);
      expect(p.title.length, `${p.id} title`).toBeGreaterThan(10);
      expect(p.description.length, `${p.id} description`).toBeGreaterThan(40);
      expect(p.probe.input.length, `${p.id} probe input`).toBeGreaterThan(5);
      expect(p.probe.expected.length, `${p.id} probe expected`).toBeGreaterThan(5);
      expect(p.origin.length, `${p.id} origin`).toBeGreaterThan(0);
      for (const o of p.origin) {
        expect(['FI', 'CO', 'PP', 'SD'], `${p.id} origin case`).toContain(o.case);
        expect(o.ids.length, `${p.id} origin ids`).toBeGreaterThan(0);
      }
      expect(p.layers.length, `${p.id} layers`).toBeGreaterThan(0);
      for (const l of p.layers) expect(Object.keys(catalogue.layers), `${p.id} layer`).toContain(l);
      if (p.harnessProbe) expect(p.layers, `${p.id} has a harness probe but no harness layer`).toContain('harness');
    }
    // Every class carries at least one pattern.
    for (const cls of Object.keys(catalogue.classes)) {
      expect(catalogue.patterns.some((p) => p.class === cls), `class ${cls} is empty`).toBe(true);
    }
  });

  test('catalogue and README are English and the README indexes every pattern', () => {
    const readme = fs.readFileSync(README, 'utf8');
    const raw = fs.readFileSync(CATALOGUE, 'utf8');
    for (const [name, text] of [['catalogue.json', raw], ['README.md', readme]] as const) {
      expect(text, `${name} contains German umlauts`).not.toMatch(/[äöüÄÖÜß]/);
    }
    for (const p of catalogue.patterns) {
      expect(readme, `README index misses ${p.id}`).toContain(`| ${p.id} | ${p.class} |`);
    }
    const counted = readme.match(/catalogue v\d+, (\d+) patterns/);
    expect(Number(counted?.[1]), 'README pattern count').toBe(catalogue.patterns.length);
  });
});

test.describe('the static scan is bounded and says where it stopped (QA 8a482e2ae605)', () => {
  let dir = '';
  test.beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-scan-'));
    // 8 levels deep, a source file on every level; 12 files side by side at the top
    let deep = dir;
    for (let i = 0; i < 8; i++) {
      deep = path.join(deep, `d${i}`);
      fs.mkdirSync(deep);
      fs.writeFileSync(path.join(deep, `level${i}.mjs`), 'export const x = parseInt("1", 10);\n');
    }
    for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, `f${i}.mjs`), `export const v${i} = ${'1'.repeat(1000)};\n`);
  });
  test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('within the bounds it reads everything and reports no limit', async () => {
    const { staticScan } = await import('../scripts/acceptance/lib/static-scan.mjs');
    const r = staticScan(dir);
    expect(r.files).toBe(20);
    expect(r.limits).toEqual([]);
  });

  test('depth, file count, bytes and entries each stop the walk, and each is reported', async () => {
    const { staticScan, SCAN_LIMITS } = await import('../scripts/acceptance/lib/static-scan.mjs');
    expect(SCAN_LIMITS.maxDepth).toBeGreaterThan(0);
    const depth = staticScan(dir, { maxDepth: 3 });
    expect(depth.limits).toEqual(['directories deeper than 3 levels were not read']);
    expect(depth.files).toBe(12 + 3);
    const count = staticScan(dir, { maxFiles: 5 });
    expect(count.files).toBe(5);
    expect(count.limits).toContain('stopped at 5 source files');
    const bytes = staticScan(dir, { maxBytes: 3_000 });
    expect(bytes.limits.join(' ')).toMatch(/stopped after reading \d+ bytes \(limit 3000\)/);
    const entries = staticScan(dir, { maxEntries: 4 });
    expect(entries.limits).toEqual(['stopped after 4 directory entries']);
  });

  test('an oversized source file and an oversized package.json are not read, and each is named (QA 63cc65e43cba)', async () => {
    const { staticScan } = await import('../scripts/acceptance/lib/static-scan.mjs');
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-scan-big-'));
    try {
      fs.writeFileSync(path.join(pkg, 'small.mjs'), 'export const a = 1;\n');
      fs.writeFileSync(path.join(pkg, 'big.mjs'), `export const b = parseInt("${'9'.repeat(400)}", 10);\n`);
      // a package.json past the bound that would also be a finding if it were read
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ dependencies: { leftpad: '1' }, pad: 'x'.repeat(400) }));
      const r = staticScan(pkg, { maxFileBytes: 300 });
      expect(r.files).toBe(2);
      expect(r.limits).toEqual(['skipped 1 file(s) larger than 300 bytes: big.mjs', 'package.json is larger than 300 bytes and was not read']);
      expect(r.findings).toEqual([]);
      // within the bound both are read: the parseInt and the unused dependency are found
      const all = staticScan(pkg);
      expect(all.limits).toEqual([]);
      expect(all.findings.map((f: { check: string }) => f.check).sort()).toEqual(['lenient-number-parse', 'unused-dependency']);
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
    }
  });
});

test.describe('probe and load answers: only a structured answer counts', () => {
  /** A stand-in for the executor: answers each call of `parseYear(value)` from the table. */
  const executor = (answer: (value: unknown) => Record<string, unknown>) => ({
    request: async (op: string, payload: { args?: unknown[] }) => {
      expect(op).toBe('call');
      return answer(payload.args?.[0]);
    },
  });
  const cfg = { call: { module: 'engine', export: 'parseYear' }, args: ['$value'], valid: '2026', refused: { path: 'ok', equals: false } };

  test('lenient-numeric: a malformed value that throws is a failure, not a refusal (QA 612ac86f6c4c)', async () => {
    const { PROBES } = await import('../scripts/acceptance/lib/probes.mjs');
    const throwing = executor((v) => (v === '2026' ? { threw: false, value: { ok: true, year: 2026 } } : { threw: true, error: "Cannot read properties of null (reading 'trim')", crash: true }));
    const [o] = await PROBES['lenient-numeric'](cfg, throwing);
    expect(o.status).toBe('fail');
    expect(o.evidence).toContain('threw instead of refusing malformed input');
    // a deliberate Error is no structured refusal either
    const erroring = executor((v) => (v === '2026' ? { threw: false, value: { ok: true, year: 2026 } } : { threw: true, error: 'not a year', crash: false }));
    expect((await PROBES['lenient-numeric'](cfg, erroring))[0].status).toBe('fail');
    // the structured refusal passes
    const refusing = executor((v) => (v === '2026' ? { threw: false, value: { ok: true, year: 2026 } } : { threw: false, value: { ok: false } }));
    expect((await PROBES['lenient-numeric'](cfg, refusing))[0]).toMatchObject({ status: 'pass' });
    // a control that throws makes the probe not runnable, as a refused control does
    await expect(PROBES['lenient-numeric'](cfg, executor(() => ({ threw: true, error: 'x', crash: false })))).rejects.toMatchObject({ adapter: true });
  });

  test('a crash is never a refusal in the other probes either', async () => {
    const { PROBES } = await import('../scripts/acceptance/lib/probes.mjs');
    const crash = { request: async () => ({ threw: true, error: 'x is not a function', crash: true }) };
    const [o] = await PROBES['empty-selection']({ call: { module: 'engine', export: 'select' }, args: [{}], refused: { path: 'status', notIn: ['OK'] } }, crash);
    expect(o.status).toBe('fail');
    expect(o.evidence).toBe('an empty selection crashed instead of being refused: x is not a function');
  });

  test('an empty failure is still a failure, and a success must name every module (QA 7752de789154)', async () => {
    const { loadFailure } = await import('../scripts/acceptance/lib/load-answer.mjs');
    // run.mjs decides a probe's load by this function, and by nothing else
    const run = fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'run.mjs'), 'utf8');
    expect(run).toContain("import { loadFailure } from './lib/load-answer.mjs';");
    expect(run).toMatch(/const failed = loadFailure\(loaded, Object\.keys\(prepared\.names\)\);\s*if \(failed !== null\)/);
    expect(loadFailure({ imported: [], failure: '' }, ['engine'])).toBe('a module failed to load without saying why');
    expect(loadFailure({ failure: 'boom' }, ['engine'])).toBe('boom');
    expect(loadFailure({ transportError: '' }, ['engine'])).toBe('the executor could not answer the load request');
    expect(loadFailure({}, ['engine'])).toBe('the executor did not report which modules it imported');
    expect(loadFailure({ imported: ['app'] }, ['engine', 'app'])).toBe("the executor did not report importing 'engine'");
    expect(loadFailure({ imported: ['engine'] }, ['engine'])).toBeNull();
  });
});

test.describe('acceptance harness on fixtures', () => {
  test.describe.configure({ timeout: 300_000 });

  test('the sound fixture passes every probe and the probe registry matches the catalogue', () => {
    const { report, markdown } = runHarness('sound-package', ['--trusted-fixture']);
    expect(report.sandbox.executed, report.sandbox.reason).toBe(true);
    for (const [id, p] of Object.entries(report.patterns)) {
      expect(p.status, `${id}: ${p.evidence.join(' / ')}`).toBe('pass');
    }
    expect(report.summary.fail).toBe(0);
    expect(report.static.findings, 'the sound fixture raises no static signal').toEqual([]);

    // The registry (probe -> patterns) as the harness reports it, against the
    // catalogue's harnessProbe field: both directions.
    const probed = new Map<string, string>();
    for (const probe of report.probes) for (const o of probe.outcomes) probed.set(o.pattern, probe.probe);
    const withProbe = catalogue.patterns.filter((p) => p.harnessProbe);
    expect(new Set(probed.keys())).toEqual(new Set(withProbe.map((p) => p.id)));
    for (const p of withProbe) expect(probed.get(p.id), p.id).toBe(p.harnessProbe);

    expect(markdown).toContain('| Pattern | Class | Status | Evidence | Static hits |');
  });

  test('the flawed fixture fails every probe, each with the evidence of its pattern', () => {
    const { report } = runHarness('flawed-package', ['--trusted-fixture']);
    expect(report.sandbox.executed, report.sandbox.reason).toBe(true);
    for (const [id, p] of Object.entries(report.patterns)) {
      expect(p.status, `${id}: ${p.evidence.join(' / ')}`).toBe('fail');
    }
    // Started a server on import: detected, reported, and the harness did not hang.
    expect(evidence(report, 'FP-TEST-03')).toContain('listen(8080)');
    expect(evidence(report, 'FP-PREC-02')).toContain('[1.15,1.03,1.04]');
    expect(evidence(report, 'FP-PREC-01')).toContain('required 0.4 - withdrawn 0.1 against 0.3 is not covered');
    expect(evidence(report, 'FP-RUN-02')).toContain('(collision)');
    expect(evidence(report, 'FP-RUN-01')).toContain('no longer retrievable');
    expect(evidence(report, 'FP-GUARD-04')).toContain('answered as a success');
    expect(evidence(report, 'FP-GUARD-03')).toContain('"2026x"');
    expect(evidence(report, 'FP-GUARD-07')).toContain('5 fields instead of 4');
    expect(evidence(report, 'FP-GUARD-07')).toContain('un-neutralised');
    expect(evidence(report, 'FP-SCOPE-01')).toContain('totals for the selection are 390');
    expect(evidence(report, 'FP-MEAN-05')).toContain('gave 60');
    expect(evidence(report, 'FP-GUARD-05')).toContain('-99999 was accepted');

    const checks = new Set(report.static.findings.map((f) => `${f.pattern}:${f.check}`));
    for (const expected of [
      'FP-TEST-03:listen-without-entry-guard',
      'FP-RUN-02:clock-run-id',
      'FP-PREC-02:float-rounding',
      'FP-GUARD-03:lenient-number-parse',
      'FP-GUARD-07:naive-csv-quoting',
      'FP-CLAIM-01:claimed-api-call',
      'FP-META-04:unused-dependency',
    ]) {
      expect(checks, `static check ${expected}`).toContain(expected);
    }
  });

  test('a package whose dependency is missing is not runnable, and nothing is installed', () => {
    const { report } = runHarness('unresolved-package', ['--trusted-fixture']);
    expect(report.patterns['FP-TEST-03'].status).toBe('not-runnable');
    expect(evidence(report, 'FP-TEST-03')).toContain("not runnable without its dependencies: module 'service' imports 'express'");
    expect(report.patterns['FP-GUARD-04'].status).toBe('not-runnable');
    expect(report.patterns['FP-MEAN-05'].status).toBe('not-applicable');
    expect(evidence(report, 'FP-MEAN-05')).toContain('the package has no recalculation');
    expect(fs.existsSync(path.join(FIXTURES, 'unresolved-package', 'node_modules')), 'the harness installed something').toBe(false);
  });

  test('a package cannot forge its verdicts: it runs in a SES compartment, apart from the answer channel (QA e1478690996c, 1021a63b7b6c)', () => {
    // The hostile fixture rewrites stdout, every socket write, Object.keys, Object.prototype.toJSON and
    // JSON.stringify, and tries the Function constructors and the stack API to reach the real process —
    // each of which, where it lands, turns both of its failing probes into passes.
    const { report } = runHarness('hostile-package', ['--trusted-fixture']);
    expect(report.sandbox.executed, report.sandbox.reason).toBe(true);
    expect(report.patterns['FP-GUARD-04'].status).toBe('fail');
    expect(evidence(report, 'FP-GUARD-04')).toContain('an empty selection was answered as a success: {"status":"OK"');
    expect(report.patterns['FP-GUARD-03'].status).toBe('fail');
    expect(evidence(report, 'FP-GUARD-03')).toContain('accepted malformed input ["2026x","1.9"]');
    for (const [id, p] of Object.entries(report.patterns)) expect(p.evidence.join(' '), id).not.toContain('forged');
  });

  test('the hostile fixture\'s techniques work unconfined and fail, each of them, in the compartment', () => {
    const hostile = path.join(FIXTURES, 'hostile-package', 'srv', 'engine.mjs');
    const unconfined = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(hostile).href)}); process.stderr.write(JSON.stringify(m.ESCAPE_ATTEMPTS) + '\\n');`], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    const before = JSON.parse(unconfined.stderr.trim().split('\n').pop()!) as string[];
    for (const done of ['stdout: done', 'socket: done', 'Object.keys: done', 'Object.prototype: done', 'JSON.stringify: done', 'Function constructor: done']) expect(before).toContain(done);
    const confined = spawnSync(process.execPath, [path.join(FIXTURES, 'confined-attempts.mjs'), path.join(FIXTURES, 'hostile-package'), 'srv/engine.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(confined.status, confined.stderr).toBe(0);
    const { attempts, keysIntact } = JSON.parse(confined.stdout) as { attempts: string[]; keysIntact: string };
    expect(attempts).toHaveLength(before.length);
    for (const a of attempts) expect(a, a).not.toMatch(/: done$/);
    expect(attempts).toContain('stdout: process.stdout is not a stream of this process');
    expect(keysIntact).toBe('status');
  });

  test('a package importing a module the compartment does not provide is not runnable, never a pass', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acc-fs-'));
    try {
      fs.mkdirSync(path.join(pkg, 'srv'));
      fs.writeFileSync(path.join(pkg, 'srv', 'engine.mjs'), "import fs from 'node:fs';\nexport const select = () => ({ status: fs.existsSync('x') ? 'OK' : 'EMPTY' });\n");
      fs.writeFileSync(path.join(pkg, 'acceptance-adapter.json'), JSON.stringify({ modules: { engine: 'srv/engine.mjs' }, probes: { 'empty-selection': { call: { module: 'engine', export: 'select' }, args: [{}], refused: { path: 'status', notIn: ['OK'] } } } }));
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acc-fs-out-'));
      try {
        execFileSync(process.execPath, [HARNESS, pkg, '--out', out, '--timeout', '15000', '--trusted-fixture'], { cwd: ROOT, stdio: 'ignore', timeout: 120_000 });
        const report = JSON.parse(fs.readFileSync(path.join(out, 'acceptance-report.json'), 'utf8')) as Report;
        for (const id of ['FP-TEST-03', 'FP-GUARD-04']) {
          expect(report.patterns[id].status, id).toBe('not-runnable');
          expect(evidence(report, id)).toContain("module 'engine' imports 'node:fs', which the confined executor does not provide");
        }
      } finally {
        fs.rmSync(out, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
    }
  });

  test('fixture comments describe the fixture; they do not instruct a reviewer (QA 930684d8dd4d)', () => {
    const base = path.join(ROOT, 'tests', 'fixtures');
    const files = (fs.readdirSync(base, { recursive: true }) as string[]).filter((rel) => /\.(m?js|ts)$/.test(rel));
    expect(files.length).toBeGreaterThan(5);
    for (const rel of files) {
      expect(fs.readFileSync(path.join(base, rel), 'utf8'), rel).not.toMatch(/do not fix/i);
    }
  });

  test('without --trusted-fixture a package runs only where the platform denies network', () => {
    const { report } = runHarness('flawed-package');
    if (report.sandbox.mode === 'not-executed') {
      // Node < 25: no network permission, so third-party code is never executed.
      expect(report.sandbox.executed).toBe(false);
      expect(report.sandbox.reason).toContain('cannot deny network access');
      for (const [id, p] of Object.entries(report.patterns)) expect(p.status, id).toBe('not-runnable');
      // The read-only scan still runs.
      expect(report.static.findings.length).toBeGreaterThan(0);
    } else {
      expect(report.sandbox.mode).toBe('permission-model-with-network-denied');
      for (const [id, p] of Object.entries(report.patterns)) expect(p.status, id).toBe('fail');
    }
  });
});
