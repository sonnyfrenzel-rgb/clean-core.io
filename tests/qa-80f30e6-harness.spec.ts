import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { deriveEngineCasesOf, engineCaseProvenance } from '../lib/engine-case-provenance';
import { engineRunInputs } from '../lib/test-sandbox/engine-suite';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { engineVerdicts, planEngineRun } from '../lib/engine-case-run';
import { CONFINED_MODULES as CORE_CONFINED_MODULES } from '../scripts/acceptance/child/engine-cases-core.mjs';

/**
 * QA review of 80f30e672501 (server-free).
 *   592fd4f81e78  the contract cannot import the cases it is judged against — runner core and harness;
 *   7011113eda41  a symlink or junction in a package cannot lead the bundler out of it;
 *   9eac38e0e0b6  a host-only global used inside the compartment reads Not run, not Failed.
 * (796fe8bcbadd and d9df190f3850 are in qa-56bd195-harness.spec.ts and acceptance-harness.spec.ts.)
 */

const ROOT = path.join(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'acceptance', 'engine-cases.mjs');
const SOUND = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'engine-cases', 'sound', 'srv', 'engine-contract.mjs'), 'utf8');

const CO = [
  'REPORT zq.',
  'DATA gv_total TYPE p LENGTH 8 DECIMALS 2.',
  'PARAMETERS p_amount TYPE p LENGTH 8 DECIMALS 2.',
  'START-OF-SELECTION.',
  '  IF p_amount > 100.',
  '    MESSAGE e001(zq).',
  '    RETURN.',
  '  ENDIF.',
  '  gv_total = p_amount.',
].join('\n');
const verified = engineCaseProvenance(deriveEngineCases(CO, deriveBusinessRules(CO).rules).cases as unknown as Array<Record<string, unknown>>, deriveEngineCasesOf(CO)).verified;

async function enginePass(contract: string) {
  const files = [{ path: 'srv/engine-contract.mjs', content: contract }];
  const plan = planEngineRun(verified, files, null);
  if (plan.kind !== 'planned') throw new Error('no plan');
  const inputs = engineRunInputs(files, plan.plan.cases, plan.plan.contractModule);
  const out = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true, engine: inputs.engine });
  return { out, cases: plan.plan.cases };
}

test.describe('592fd4f81e78 — the contract cannot import its expectations', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const spec of ['../__cc_engine/cases.json', '../__cc_engine/cases', '../__cc_engine/runtime.mjs', '../__engine.mjs']) {
    test(`runner core: importing ${spec} does not bundle`, async () => {
      const { out } = await enginePass(`import leaked from ${JSON.stringify(spec)};\nexport const LEAKED = leaked;\n${SOUND}`);
      expect(out.kind).toBe('build-error');
      if (out.kind === 'build-error') expect(out.message).toContain('reserved for Clean-Core.io');
    });
  }

  test('runner core: a package.json "main" pointing into __cc_engine is refused at load', async () => {
    const files = [
      { path: 'srv/engine-contract.mjs', content: `import leaked from './cases';\nexport const LEAKED = leaked;\n${SOUND}` },
      { path: 'srv/cases/package.json', content: JSON.stringify({ main: '../../__cc_engine/cases.json' }) },
    ];
    const plan = planEngineRun(verified, files, null);
    if (plan.kind !== 'planned') throw new Error('no plan');
    const inputs = engineRunInputs(files, plan.plan.cases, plan.plan.contractModule);
    const out = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true, engine: inputs.engine });
    expect(out.kind).toBe('build-error');
  });

  test('runner core: the same contract without the import runs (the refusal is the import, not the contract)', async () => {
    const { out, cases } = await enginePass(SOUND);
    expect(out.kind).toBe('ran');
    if (out.kind === 'ran') expect(engineVerdicts(out.stdout, cases, []).some((r) => r.status === 'Passed')).toBe(true);
  });

  test('harness: a package importing its own test/engine-cases.json is not run, and the copy holds no cases', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-eng-leak-'));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-eng-leak-out-'));
    try {
      fs.mkdirSync(path.join(pkg, 'srv'));
      fs.mkdirSync(path.join(pkg, 'test'));
      fs.writeFileSync(path.join(pkg, 'test', 'engine-cases.json'), JSON.stringify({ format: 'clean-core.engine-cases/1', cases: verified.map((c) => ({ id: c.id, name: c.name, examples: c.engineCase.examples })) }));
      fs.writeFileSync(path.join(pkg, 'srv', 'engine-contract.mjs'), `import leaked from '../test/engine-cases.json';\nexport const LEAKED = leaked;\n${SOUND}`);
      execFileSync(process.execPath, [RUNNER, pkg, '--out', out, '--timeout', '15000', '--trusted-fixture'], { cwd: ROOT, stdio: 'ignore', timeout: 120_000 });
      const r = JSON.parse(fs.readFileSync(path.join(out, 'engine-cases-report.json'), 'utf8')) as { summary: { passed: number; failed: number }; cases: Array<{ reason?: string }> };
      expect(r.summary.passed + r.summary.failed).toBe(0);
      for (const c of r.cases) expect(c.reason).toMatch(/^Not run — the package's modules cannot be bundled: (an import of a file the harness reserves|Could not resolve)/);
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

test.describe('7011113eda41 — a link cannot lead the bundler out of the package', () => {
  let outside = '';
  let pkg = '';
  test.beforeAll(() => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.mjs'), "export const secret = 'OUTSIDE-SECRET-42';\n");
    pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-linked-'));
    fs.mkdirSync(path.join(pkg, 'srv'));
    // A junction needs no privilege on Windows; elsewhere the type is ignored and a directory link is made.
    fs.symlinkSync(outside, path.join(pkg, 'srv', 'link'), 'junction');
    fs.writeFileSync(path.join(pkg, 'srv', 'engine.mjs'), "export { secret } from './link/secret.mjs';\nexport const select = () => ({ status: 'EMPTY' });\n");
    fs.writeFileSync(path.join(pkg, 'acceptance-adapter.json'), JSON.stringify({ modules: { engine: 'srv/engine.mjs' }, probes: { 'empty-selection': { call: { module: 'engine', export: 'select' }, args: [{}], refused: { path: 'status', notIn: ['OK'] } } } }));
  });
  test.afterAll(() => {
    fs.rmSync(pkg, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  test('bundling the package in place refuses the file behind the link', async () => {
    const { bundleModules } = await import('../scripts/acceptance/lib/sandbox.mjs');
    const r = await bundleModules(pkg, { engine: 'srv/engine.mjs' });
    expect(r.bundle ?? '').not.toContain('OUTSIDE-SECRET-42');
    expect(r.failure).toMatch(/an import leaves the package|a file outside the package/);
  });

  test('the run copy leaves the link out and says so; nothing from outside reaches the report', async () => {
    const { copyToTemp, removeTemp } = await import('../scripts/acceptance/lib/sandbox.mjs');
    const skipped: string[] = [];
    const copy = copyToTemp(pkg, skipped);
    try {
      expect(skipped).toEqual(['srv/link']);
      expect(fs.existsSync(path.join(copy, 'srv', 'link'))).toBe(false);
    } finally {
      removeTemp(copy);
    }
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-linked-out-'));
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'acceptance', 'run.mjs'), pkg, '--out', out, '--timeout', '15000', '--trusted-fixture'], { cwd: ROOT, stdio: 'ignore', timeout: 120_000 });
      const text = fs.readFileSync(path.join(out, 'acceptance-report.json'), 'utf8');
      expect(text).not.toContain('OUTSIDE-SECRET-42');
      const report = JSON.parse(text) as { sandbox: { skippedSymlinks?: string[] }; patterns: Record<string, { status: string }> };
      expect(report.sandbox.skippedSymlinks).toEqual(['srv/link']);
      expect(report.patterns['FP-GUARD-04'].status).toBe('not-runnable');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

test('the bundler\'s list of provided modules is the confinement\'s', async () => {
  const { CONFINED_MODULES } = await import('../scripts/acceptance/lib/confined-modules.mjs');
  expect(CONFINED_MODULES).toEqual([...CORE_CONFINED_MODULES]);
});

test.describe('9eac38e0e0b6 — a host-only global inside the compartment reads Not run', () => {
  test('a contract that uses Buffer in simulate is Not run with the reason, never Failed', async () => {
    test.setTimeout(120_000);
    const contract = SOUND.replace(/export function simulate\(([^)]*)\) \{/, 'export function simulate($1) {\n  Buffer.from("x");');
    expect(contract).not.toBe(SOUND);
    const { out, cases } = await enginePass(contract);
    if (out.kind !== 'ran') throw new Error(JSON.stringify(out).slice(0, 300));
    const results = engineVerdicts(out.stdout, cases, []);
    expect(results.filter((r) => r.status === 'Failed')).toEqual([]);
    for (const r of results) {
      expect(r.status).toBe('Skipped');
      expect(r.message).toContain("the code uses the global 'Buffer', which the confined sandbox does not provide");
    }
  });
});
