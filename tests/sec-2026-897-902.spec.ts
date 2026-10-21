/**
 * SEC-2026-897 to SEC-2026-901 — the confirmed findings of the security audit
 * of v3.0.19 (SEC-2026-902 is in `tests/acceptance-suite.spec.ts`). Each block
 * fails on the behaviour before the fix.
 *
 * Server-free: pure functions, and the two PowerShell scripts executed where
 * the machine has PowerShell.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';
import { buildAbapEvidence, redactCredentials } from '../lib/abap/evidence-model';
import { ENGINE_READS_3020_FROM, engineReads3020Apply } from '../lib/abap/engine-reads-3020-gate';
import { buildKeyUserSteps, type KeyUserStepList } from '../lib/key-user-steps';
import {
  KEY_USER_ACCEPTANCE_VERSION,
  keyUserAcceptanceReading,
  keyUserCheckIds,
  keyUserListDigest,
  type KeyUserAcceptanceSummary,
} from '../lib/key-user-acceptance';
import { workflowSteps } from '../lib/workflow-steps';
import { readExample } from './helpers/starter-example-files';

const ROOT = path.resolve(__dirname, '..');

function powershell(): string | null {
  for (const exe of ['pwsh', 'powershell']) {
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 7'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 7) return exe;
  }
  return null;
}

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

test.describe('SEC-2026-897', () => {
  const SECRET = 'Geheim4711x';
  const source = [
    'REPORT z_sec_897.',
    'DATA lv_kennwort TYPE string.',
    'DATA lv_url TYPE string.',
    'START-OF-SELECTION.',
    `  zcl_sec_897=>connect( iv_url = 'HTTPS://host.example/api' iv_kennwort = '${SECRET}' ).`,
    `  CONSTANTS gc_access_key TYPE c LENGTH 20 VALUE '${SECRET}'.`,
    `  DATA(lv_passwort) = '${SECRET}'.`,
    '  WRITE / lv_url.',
  ].join('\n');
  const quoted = (engine: string) =>
    buildAbapEvidence(source, 'z_sec_897.abap', 'private', undefined, engine).findings.flatMap((f) => [f.snippet, f.title, f.technicalDetail, f.objectName ?? '']);

  test('the gate opens at 3.0.20 and not before', () => {
    expect(ENGINE_READS_3020_FROM).toBe('3.0.20');
    expect(engineReads3020Apply('v3.0.20')).toBe(true);
    expect(engineReads3020Apply('v3.0.19')).toBe(false);
    expect(engineReads3020Apply(null)).toBe(false);
  });

  test('SEC-2026-897', () => {
    const now = quoted('v3.0.20');
    expect(now.some((t) => t.includes('iv_kennwort')), 'the finding is there').toBe(true);
    expect(now.filter((t) => t.includes(SECRET))).toEqual([]);
    for (const line of ["gv_access_key = 'x1'", "gc_passwort TYPE string VALUE 'x1'", "DATA(lv_password) = 'x1'", "lv_auth_key = 'x1'"]) {
      expect(redactCredentials(line, 'v3.0.20'), line).not.toContain("'x1'");
    }
    // A run signed by 3.0.19 rebuilds unchanged.
    expect(quoted('v3.0.19').some((t) => t.includes(SECRET))).toBe(true);
    expect(redactCredentials("lv_matnr = 'MAT-001'", 'v3.0.20')).toBe("lv_matnr = 'MAT-001'");
  });
});

test.describe('SEC-2026-899', () => {
  const EXAMPLE = 'Z_SD_DELIVERY_PRIORITY.abap';
  const SOURCE = readExample(EXAMPLE).replace(/\r\n/g, '\n');
  const list = buildKeyUserSteps(buildAbapEvidence(SOURCE, EXAMPLE, 'private', undefined, 'v3.0.19').keyUser)!;
  const ids = keyUserCheckIds(list);
  const summary: KeyUserAcceptanceSummary = {
    v: KEY_USER_ACCEPTANCE_VERSION,
    kind: 'confirmed',
    subject: { runId: 'run-899', sourceSha256: sha256Hex(SOURCE) },
    listDigest: keyUserListDigest(list),
    total: ids.length,
    checkIds: ids,
    recordedAt: '2026-10-21T08:00:00.000Z',
    recordedBy: 'owner@example.com',
    system: 'S4D / 100',
    ranOn: '2026-10-21',
    note: null,
  };
  const project = {
    id: 'p-899',
    userId: 'owner-uid',
    legacyCode: SOURCE,
    activeRunId: 'run-899',
    extensibilityRoute: 'In-App (ABAP Cloud)',
    originalRecommendation: 'keyuser',
    cleanCoreScore: 93,
    s4Deployment: 'private',
    analyzerVersion: 'v3.0.19',
    solutionDesign: '# Design',
    documentation: '# Process',
    targetArchitecture: 'keyuser',
    approvedByArchitect: true,
    architectJustifiedOverride: '',
    keyUserAcceptance: summary,
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(SOURCE), fileName: EXAMPLE, lineCount: SOURCE.split('\n').length, uploadedAt: '2026-10-21T07:00:00.000Z', objectType: 'Report' },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: 'v3.0.19', byokUsed: false },
    },
  } as unknown as Project;
  /** The same run and source, one check reading differently. */
  const moved: KeyUserStepList = {
    ...list,
    steps: list.steps.map((s, i) => (i === 0 ? { ...s, checks: s.checks.map((c, j) => (j === 0 ? { ...c, then: `${c.then} (changed)` } : c)) } : s)),
  };
  const testing = (keyUserList?: KeyUserStepList) => workflowSteps(project, { keyUserList }).find((s) => s.key === 'testing')!;

  test('SEC-2026-899', () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(keyUserAcceptanceReading(project, list)).toMatchObject({ state: 'current', complete: true });
    expect(testing(list)).toMatchObject({ state: 'done', badge: 'Key-user checks confirmed' });
    // Records written before keep their reading where no list is at hand.
    expect(keyUserAcceptanceReading(project)).toMatchObject({ state: 'current', complete: true });

    expect(keyUserAcceptanceReading(project, moved)).toMatchObject({ state: 'earlier', because: 'list' });
    expect(testing(moved).state).toBe('partial');

    const more: KeyUserStepList = {
      ...list,
      steps: [...list.steps, { ...list.steps[0], checks: list.steps[0].checks.map((c) => ({ ...c, id: `${c.id}x` })) }],
    };
    expect(keyUserAcceptanceReading(project, more).state).toBe('earlier');
  });
});

test.describe('SEC-2026-898', () => {
  let shell: string | null = null;
  let dir = '';
  test.beforeAll(() => {
    shell = powershell();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-898-'));
  });
  test.afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A one-commit repository holding `files`, exported by the real script. */
  const exportOf = (name: string, files: Record<string, string>) => {
    const repo = path.join(dir, name);
    fs.mkdirSync(repo, { recursive: true });
    for (const [p, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
      fs.writeFileSync(path.join(repo, p), body);
    }
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', repo, '-c', 'user.name=spec', '-c', 'user.email=spec@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    };
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
    const zip = path.join(dir, `${name}.zip`);
    const r = spawnSync(shell!, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'export-source.ps1'), '-SourceDir', repo, '-OutputZip', zip], {
      encoding: 'utf8',
      env: { ...process.env, AUDIT_SIGNING_KEY: '' },
    });
    return { code: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}`, zip: fs.existsSync(zip) };
  };

  const header = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');
  const firebaseConfig = fs.readFileSync(path.join(ROOT, 'firebase-config.json'), 'utf8');

  test('SEC-2026-898 (1)', () => {
    test.skip(!shell, 'No PowerShell on this machine — the export cannot run here.');
    test.skip(process.platform !== 'win32', 'scripts/export-source.ps1 is run on Windows; (2) holds on every platform.');
    const control = exportOf('control', { 'firebase-config.json': firebaseConfig, 'a.txt': 'hello\n' });
    expect(control.code, control.out).toBe(0);
    expect(control.zip).toBe(true);

    const spec = exportOf('spec', { 'tests/unearned-verdicts-guard.spec.ts': `const x = '${header}';\n` });
    expect(spec.code, spec.out).toBe(2);
    expect(spec.zip).toBe(false);

    const other = exportOf('other', { 'firebase-config.json': firebaseConfig.replace(/AIza[0-9A-Za-z_-]{30,}/, `AIza${'B'.repeat(35)}`) });
    expect(other.code, other.out).toBe(2);
    expect(other.zip).toBe(false);
  });

  test('SEC-2026-898 (2)', () => {
    const tracked = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
    const rule = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    const hits = tracked.filter((p) => {
      if (/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz|mp4|webm)$/i.test(p)) return false;
      const file = path.join(ROOT, p);
      return fs.existsSync(file) && rule.test(fs.readFileSync(file, 'utf8'));
    });
    expect(hits).toEqual([]);
  });
});

test.describe('SEC-2026-901', () => {
  const KEY = 'spec-fixture-signing-key-0123456789';
  let shell: string | null = null;
  let dir = '';
  test.beforeAll(() => {
    shell = powershell();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-901-'));
  });
  test.afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const archive = async (name: string, files: Array<{ p: string; body: string }>) => {
    const entries = files.map((f) => ({ path: f.p, sha256: sha256(Buffer.from(f.body, 'utf8')) })).sort((x, y) => (x.path < y.path ? -1 : 1));
    const manifestHash = sha256(entries.map((e) => `${e.path}:${e.sha256};`).join(''));
    const manifest = {
      exportTimestamp: '2026-10-21T00:00:00Z',
      platformVersion: 'spec-fixture',
      filesCount: entries.length,
      manifestHash,
      signature: crypto.createHmac('sha256', KEY).update(manifestHash).digest('hex'),
      signed: true,
      files: entries,
    };
    const zip = new JSZip();
    for (const f of files) zip.file(f.p, f.body);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const out = path.join(dir, `${name}.zip`);
    fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    return out;
  };
  const run = (zip: string, extra: string[] = []) => {
    const r = spawnSync(shell!, ['-NoProfile', '-File', path.join(ROOT, 'scripts', 'verify-export.ps1'), '-ZipPath', zip, '-SigningKey', KEY, ...extra], {
      encoding: 'utf8',
      env: { ...process.env, AUDIT_SIGNING_KEY: '' },
    });
    return { code: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
  };
  test('SEC-2026-901', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const files = [
      { p: 'a.txt', body: 'hello' },
      { p: 'src/big.txt', body: '0'.repeat(200_000) },
      { p: 'src/c.ts', body: 'export const c = 1;\n' },
    ];
    const zip = await archive('limits', files);

    const ok = run(zip);
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain('SUCCESS');

    const bytes = run(zip, ['-MaxExtractBytes', '100000']);
    expect(bytes.code, bytes.out).toBe(2);
    expect(bytes.out).toContain('-MaxExtractBytes');
    expect(bytes.out).not.toContain('SUCCESS');

    const entries = run(zip, ['-MaxEntries', '3']);
    expect(entries.code, entries.out).toBe(2);
    expect(entries.out).toContain('-MaxEntries');
    expect(entries.out).not.toContain('SUCCESS');
  });
});
