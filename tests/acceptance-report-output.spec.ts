import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Where the acceptance harness writes its report (SEC-2026-815). The default
 * directory of `engine-cases.mjs` lies inside the package under test; the
 * report is written into a real directory there, never through a link a
 * package carries — a directory link is refused, a linked report file is
 * replaced rather than written through.
 *
 * Server-free: the runner is a Node script, run with `--static-only` against a
 * package without a call contract (every case Not run, the report still written).
 */

const ROOT = path.join(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'acceptance', 'engine-cases.mjs');
const REPORT = 'engine-cases-report.json';

function packageDir(): { base: string; pkg: string; elsewhere: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-report-out-'));
  const pkg = path.join(base, 'pkg');
  const elsewhere = path.join(base, 'elsewhere');
  fs.mkdirSync(path.join(pkg, 'test'), { recursive: true });
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(pkg, 'test', 'engine-cases.json'), JSON.stringify({ cases: [{ id: 'EC-1', name: 'one case', examples: [] }] }));
  return { base, pkg, elsewhere };
}

const run = (pkg: string) => spawnSync(process.execPath, [RUNNER, pkg, '--static-only'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });

test('the report is written into a real directory inside the package', () => {
  const { base, pkg } = packageDir();
  try {
    const r = run(pkg);
    expect(r.status, r.stderr).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(pkg, 'engine-cases-report', REPORT), 'utf8'));
    expect(report.summary).toEqual({ passed: 0, failed: 0, notRun: 1 });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a report directory that is a link is refused, and nothing is written where it points', () => {
  const { base, pkg, elsewhere } = packageDir();
  try {
    // A junction on Windows (no privilege needed), a symbolic link elsewhere.
    fs.symlinkSync(elsewhere, path.join(pkg, 'engine-cases-report'), 'junction');
    const r = run(pkg);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('it is a link');
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a report file linked to a file elsewhere is replaced, not written through', () => {
  const { base, pkg, elsewhere } = packageDir();
  try {
    const outside = path.join(elsewhere, 'kept.txt');
    fs.writeFileSync(outside, 'unchanged');
    fs.mkdirSync(path.join(pkg, 'engine-cases-report'));
    fs.linkSync(outside, path.join(pkg, 'engine-cases-report', REPORT));
    const r = run(pkg);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(outside, 'utf8')).toBe('unchanged');
    expect(JSON.parse(fs.readFileSync(path.join(pkg, 'engine-cases-report', REPORT), 'utf8')).summary.notRun).toBe(1);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a report file that is a symbolic link is refused', async () => {
  const { writeReportFiles } = await import('../scripts/acceptance/lib/write-report.mjs');
  const { base, pkg, elsewhere } = packageDir();
  try {
    const outside = path.join(elsewhere, 'kept.txt');
    fs.writeFileSync(outside, 'unchanged');
    const dir = path.join(pkg, 'engine-cases-report');
    fs.mkdirSync(dir);
    let linked = true;
    try {
      fs.symlinkSync(outside, path.join(dir, REPORT), 'file');
    } catch {
      // A file symbolic link needs a privilege on Windows; a directory junction
      // in the file's place is a link all the same.
      linked = false;
      fs.symlinkSync(elsewhere, path.join(dir, REPORT), 'junction');
    }
    expect(() => writeReportFiles(dir, { [REPORT]: '{}' })).toThrow(/it is a link/);
    expect(fs.readFileSync(outside, 'utf8')).toBe('unchanged');
    if (!linked) expect(fs.readdirSync(elsewhere)).toEqual(['kept.txt']);
    // A name with a directory part is refused as well.
    expect(() => writeReportFiles(dir, { [`../${REPORT}`]: '{}' })).toThrow(/must not name a directory/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
