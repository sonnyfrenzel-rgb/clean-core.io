import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { buildNodeScaffold, planUnits, readEngineFacts, withTrace, type PlanInput, type ScaffoldFile, type UnitPlan } from '../../lib/transformation';

/**
 * Shared by the tests/transformation-*.spec.ts specs: the hand-written fixtures
 * under tests/fixtures/transformation/ (modelled on the shapes of the CO, PP and
 * SD review programs — not the programs themselves) and the PO starter example,
 * and a way to write a scaffold to disk and run it. Server-free.
 */

export const ROOT = path.join(__dirname, '..', '..');
export const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'transformation');

export function fixture(name: 'co-shape' | 'pp-shape' | 'sd-shape'): string {
  return fs.readFileSync(path.join(FIXTURES, `${name}.abap`), 'utf8');
}

export function poDemo(): string {
  return fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');
}

/**
 * The PO demo as it was until 13.10.2026: P_BANFN obligatory with no DEFAULT,
 * so no valid base value is known and every engine case reads Not run. Kept
 * for the specs that hold that case; the file itself carries the DEFAULT now.
 */
export function poDemoWithoutDefault(): string {
  const src = poDemo();
  const next = src.replace("p_banfn TYPE eban-banfn OBLIGATORY DEFAULT '0010000001',", 'p_banfn TYPE eban-banfn OBLIGATORY,');
  if (next === src) throw new Error('the PO demo no longer gives P_BANFN its DEFAULT');
  return next;
}

export function planOf(source: string, input: PlanInput = {}) {
  const facts = readEngineFacts(source);
  return { facts, plan: planUnits(source, input, facts) };
}

/** Write files under a fresh temp directory; returns it. The caller removes it. */
export function writePackage(files: readonly ScaffoldFile[], prefix = 'cc-scaffold-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const f of files) {
    const target = path.join(dir, f.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.content);
  }
  return dir;
}

/** The Node scaffold of a source as a package on disk, with its trace files. */
export function nodePackage(source: string, input: PlanInput = {}): { dir: string; plan: UnitPlan; files: ScaffoldFile[] } {
  const { facts, plan } = planOf(source, input);
  const scaffold = buildNodeScaffold(plan, facts);
  const { files } = withTrace(plan, scaffold, scaffold.files, []);
  return { dir: writePackage(files), plan, files };
}

/** tsc on the emitted package with its own tsconfig; the repository's @types/node stands in for an install. */
export function typecheck(dir: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(dir, 'tsconfig.json'), '--typeRoots', path.join(ROOT, 'node_modules', '@types')],
      { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Node flags that let a child run the package's TypeScript as it is (type stripping). */
function stripFlags(): string[] {
  const flags: string[] = ['--no-warnings'];
  if (process.allowedNodeEnvironmentFlags.has('--experimental-strip-types')) flags.push('--experimental-strip-types');
  return flags;
}

/** Run an ES module snippet in a child Node with the package directory as cwd; returns its stdout parsed as JSON. */
export function runInPackage<T>(dir: string, code: string): T {
  const out = execFileSync(process.execPath, [...stripFlags(), '--input-type=module', '-e', code], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = out.trim().split('\n').pop() ?? 'null';
  return JSON.parse(line) as T;
}

/** A file URL of a package file, for `import()` inside `runInPackage`. */
export function fileUrl(dir: string, rel: string): string {
  return pathToFileURL(path.join(dir, rel)).href;
}

export interface HarnessReport {
  sandbox: { executed: boolean; mode: string };
  summary: Record<string, number>;
  patterns: Record<string, { status: string; evidence: string[] }>;
  static: { findings: Array<{ check: string; file: string }> };
}

export function runHarness(dir: string): HarnessReport {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-scaffold-acc-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'acceptance', 'run.mjs'), dir, '--out', out, '--timeout', '15000', '--trusted-fixture'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 240_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(fs.readFileSync(path.join(out, 'acceptance-report.json'), 'utf8')) as HarnessReport;
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

export interface EngineCaseReport {
  contract: { path: string | null; present: boolean };
  summary: { passed: number; failed: number; notRun: number };
  cases: Array<{ id: string; status: string; reason?: string; examples: Array<{ input: string; status: string; evidence: string }> }>;
}

export function runEngineCases(dir: string): EngineCaseReport {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-scaffold-cases-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'acceptance', 'engine-cases.mjs'), dir, '--out', out, '--trusted-fixture'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 240_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(fs.readFileSync(path.join(out, 'engine-cases-report.json'), 'utf8')) as EngineCaseReport;
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}
