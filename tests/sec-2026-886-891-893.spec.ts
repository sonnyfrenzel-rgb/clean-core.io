/**
 * SEC-2026-886, SEC-2026-891, SEC-2026-893 — the confirmed findings of the
 * security audit of v3.0.18. Each block fails on the behaviour before the fix.
 *
 * Server-free: pure functions, and the offline verifier executed with
 * PowerShell where the machine has one.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { buildAbapEvidence, redactCredentials } from '../lib/abap/evidence-model';
import { ENGINE_READS_3019_FROM, engineReads3019Apply } from '../lib/abap/engine-reads-3019-gate';
import { compareScenario, type DemoCaseSummary } from '../scripts/acceptance/scenario-cases';

const ROOT = path.resolve(__dirname, '..');
const NEW = 'v3.0.19';
const OLD = 'v3.0.18';

test.describe('SEC-2026-886', () => {
  test('the gate opens at 3.0.19 and not before', () => {
    expect(ENGINE_READS_3019_FROM).toBe('3.0.19');
    expect(engineReads3019Apply(NEW)).toBe(true);
    expect(engineReads3019Apply(OLD)).toBe(false);
    expect(engineReads3019Apply(null)).toBe(false);
  });

  test('SEC-2026-886 (1)', () => {
    const cases: Array<[string, string]> = [
      ["pwd = 'synthval1'.", 'synthval1'],
      ["lv_pwd = 'synthval2'.", 'synthval2'],
      ["DATA lv_pwd TYPE string VALUE 'synthval3'.", 'synthval3'],
      ["ls_logon-pwd = 'synthval4'.", 'synthval4'],
      ["GV_PWD='synthval5'.", 'synthval5'],
    ];
    for (const [line, value] of cases) {
      expect(redactCredentials(line, NEW), line).not.toContain(value);
      expect(redactCredentials(line, NEW), line).toContain('…<redacted>');
      // A run of the engine before keeps what it signed.
      expect(redactCredentials(line, OLD), line).toBe(line);
    }
    // Not a blanket: other names and a word inside a literal stay readable.
    for (const line of ["lv_pwd_len = 5.", "lv_text = 'pwd'.", "lv_pwdx = 'readable'.", "lv_name = 'readable'."]) {
      expect(redactCredentials(line, NEW), line).toBe(line);
    }
  });

  test('SEC-2026-886 (2), and the 3.0.18 engine rebuilds unchanged', () => {
    const source = [
      'REPORT zsec.',
      "DATA lv_pwd TYPE string VALUE 'https://synthpw9'.",
      "lv_pwd = 'C:\\synthpw8'.",
      "CALL FUNCTION 'Z_REMOTE' DESTINATION 'PRD' EXPORTING pwd = 'synthpw7'.",
    ].join('\n');
    const values = ['synthpw9', 'synthpw8', 'synthpw7'];
    const now = buildAbapEvidence(source, 'zsec.abap', 'private', undefined, NEW);
    // Not vacuous: the statements produced findings that quote them.
    expect(now.findings.length).toBeGreaterThan(0);
    const said = JSON.stringify(now.findings);
    for (const v of values) expect(said, v).not.toContain(v);

    const before = JSON.stringify(buildAbapEvidence(source, 'zsec.abap', 'private', undefined, OLD).findings);
    expect(values.filter((v) => before.includes(v))).toEqual(values);
  });
});

type Ran = Extract<DemoCaseSummary, { state: 'ran' }>;
const ran = (over: Partial<Ran> = {}): Ran => ({ state: 'ran', complete: true, notFilled: [], refused: false, rows: [], result: {}, issues: [], local: {}, ...over });

test.describe('SEC-2026-893', () => {
  test('SEC-2026-893 (1)', () => {
    // Case 1.
    expect(compareScenario({ parent: { status: 'ok' } }, ran({ result: { status: 'ok' } }))).toEqual({ verdict: 'not-judged', located: 0, total: 1, differ: 0 });
    // Case 2.
    expect(compareScenario({ parent: { status: 'ok' } }, ran({ result: { parent: 'x', status: 'ok' } })).verdict).not.toBe('pass');
    // Case 3.
    expect(compareScenario({ parent: { a: 1, inner: { b: 2 }, list: [1, 2] } }, ran({ local: { a: 1, b: 2, list: [1, 2] } }))).toEqual({ verdict: 'not-judged', located: 0, total: 5, differ: 0 });
    // Unchanged: a match passes, a differing value fails.
    expect(compareScenario({ parent: { status: 'ok' } }, ran({ result: { parent: { status: 'ok' } } })).verdict).toBe('pass');
    expect(compareScenario({ parent: { status: 'ok' } }, ran({ result: { parent: { status: 'no' }, status: 'ok' } })).verdict).toBe('fail');
  });
});

/** `pwsh` on Linux and modern Windows, `powershell` on a Windows box without it (as in verify-export-runtime). */
function powershell(): string | null {
  for (const exe of ['pwsh', 'powershell']) {
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 7'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 7) return exe;
  }
  return null;
}

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const KEY = 'spec-fixture-signing-key-0123456789';

interface Manifest {
  [key: string]: unknown;
  files: Array<{ path: string; sha256: string }>;
}

/** Manifest format 2, as `scripts/export-source.ps1` writes it. */
function formatTwo(meta: Record<string, string>, files: Array<{ p: string; body: string }>): Manifest {
  const entries = files.map((f) => ({ path: f.p, sha256: sha256(Buffer.from(f.body, 'utf8')) })).sort((x, y) => (x.path < y.path ? -1 : 1));
  const bound: Record<string, string> = { ...meta, filesCount: String(entries.length) };
  const keys = ['exportTimestamp', 'platformVersion', 'gitCommit', 'gitBranch', 'filesCount'] as const;
  const boundMetadata = 'cc-export-manifest/2' + keys.map((k) => `;${k}=${bound[k].length}:${bound[k]}`).join('');
  const canonical = `${boundMetadata}|` + entries.map((e) => `${e.path}:${e.sha256};`).join('');
  const manifestHash = sha256(canonical);
  return {
    manifestFormat: 2,
    boundMetadata,
    exportTimestamp: meta.exportTimestamp,
    platformVersion: meta.platformVersion,
    gitCommit: meta.gitCommit,
    gitBranch: meta.gitBranch,
    filesCount: entries.length,
    manifestHash,
    signature: crypto.createHmac('sha256', KEY).update(manifestHash).digest('hex'),
    signed: true,
    files: entries,
  };
}

/** Manifest format 1. */
function formatOne(files: Array<{ p: string; body: string }>): Manifest {
  const entries = files.map((f) => ({ path: f.p, sha256: sha256(Buffer.from(f.body, 'utf8')) })).sort((x, y) => (x.path < y.path ? -1 : 1));
  const manifestHash = sha256(entries.map((e) => `${e.path}:${e.sha256};`).join(''));
  return {
    exportTimestamp: '2026-09-16T00:00:00Z',
    platformVersion: 'spec-fixture',
    filesCount: entries.length,
    manifestHash,
    signature: crypto.createHmac('sha256', KEY).update(manifestHash).digest('hex'),
    signed: true,
    files: entries,
  };
}

test.describe('SEC-2026-891', () => {
  const FILES = [{ p: 'a.txt', body: 'hello' }, { p: 'src/b.ts', body: 'export const b = 1;\n' }];
  const META = { exportTimestamp: '2026-10-21T09:15:00.1234567+02:00', platformVersion: 'v3.0.19', gitCommit: 'abc123', gitBranch: 'dev' };
  let shell: string | null = null;
  let dir = '';
  test.beforeAll(() => {
    shell = powershell();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-891-'));
  });
  test.afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const archive = async (name: string, manifest: Manifest): Promise<string> => {
    const zip = new JSZip();
    for (const f of FILES) zip.file(f.p, f.body);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const out = path.join(dir, `${name}.zip`);
    fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }));
    return out;
  };
  const run = (zip: string) => {
    const r = spawnSync(shell!, ['-NoProfile', '-File', path.join(ROOT, 'scripts', 'verify-export.ps1'), '-ZipPath', zip, '-SigningKey', KEY], {
      encoding: 'utf8',
      env: { ...process.env, AUDIT_SIGNING_KEY: '' },
    });
    return { code: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
  };

  test('SEC-2026-891 (1)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'export-source.ps1'), 'utf8');
    expect(src).toContain('$canonical = $boundMetadata + "|"');
    expect(src).toMatch(/manifestFormat\s*=\s*2/);
    expect(src).toMatch(/boundMetadata\s*=\s*\$boundMetadata/);
  });

  test('SEC-2026-891 (2)', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const intact = run(await archive('intact', formatTwo(META, FILES)));
    expect(intact.code, intact.out).toBe(0);
    expect(intact.out).toContain('SUCCESS');
    expect(intact.out).toContain('v3.0.19');

    const changes: Array<[string, (m: Manifest) => void]> = [
      ['timestamp', (m) => { m.exportTimestamp = '2020-01-01T00:00:00.0000000+00:00'; }],
      ['version', (m) => { m.platformVersion = 'v9.9.9'; }],
      ['commit', (m) => { m.gitCommit = 'fff999'; }],
      ['count', (m) => { m.filesCount = 7; }],
      ['bound text', (m) => { m.boundMetadata = String(m.boundMetadata).replace('7:v3.0.19', '6:v9.9.9'); }],
    ];
    for (const [name, change] of changes) {
      const m = formatTwo(META, FILES);
      change(m);
      const r = run(await archive(`changed-${name.replace(' ', '-')}`, m));
      expect(r.code, `${name}: ${r.out}`).toBe(1);
      expect(r.out, name).not.toContain('SUCCESS');
    }
  });

  test('SEC-2026-891 (3)', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const legacy = run(await archive('legacy', formatOne(FILES)));
    expect(legacy.code, legacy.out).toBe(0);
    const m = formatOne(FILES);
    m.filesCount = 9;
    const r = run(await archive('legacy-count', m));
    expect(r.code, r.out).toBe(1);
  });
});
