import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { SAP_REFERENCE_SOURCES } from '../scripts/sync-sap-references';

/**
 * SEC-2026-892: the push job of the weekly SAP reference sync checks the content of the data folders it is handed,
 * not only their paths, before anything reaches its commit (scripts/check-sap-reference-data.mjs). Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-sap-reference-data.mjs');
type Checker = { SOURCES: Record<string, { repo: string; branch: string; licenceUrl: string }>; dataProblems: (dir: string) => string[] };
const checker = () => import(pathToFileURL(SCRIPT).href) as Promise<Checker>;

/** A copy of the committed data folders under a fresh temp directory. */
function copyOfData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sap-ref-'));
  for (const sub of ['sap-references', 'aff-schemas']) fs.cpSync(path.join(ROOT, 'lib', 'generated', sub), path.join(dir, 'lib', 'generated', sub), { recursive: true });
  return dir;
}
const refFile = (dir: string, key: string) => path.join(dir, 'lib', 'generated', 'sap-references', `${key}.json`);
const editJson = (file: string, edit: (d: Record<string, unknown>) => void) => {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(d);
  fs.writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`);
};

test('the checker knows the four sources as the sync declares them', async () => {
  const { SOURCES } = await checker();
  expect(Object.fromEntries(SAP_REFERENCE_SOURCES.map((s) => [s.key, { repo: s.repo, branch: s.branch, licenceUrl: s.licenceUrl }]))).toEqual(SOURCES);
});

test('the committed data passes, from the command line too', async () => {
  const { dataProblems } = await checker();
  expect(dataProblems(ROOT)).toEqual([]);
  expect(execFileSync(process.execPath, [SCRIPT, ROOT], { encoding: 'utf8' })).toContain('holds what the sync writes');
});

test('content the sync does not write is refused, each with its reason', async () => {
  const { dataProblems } = await checker();
  const cases: Array<[string, (dir: string) => void, RegExp]> = [
    ['an extra field', (d) => editJson(refFile(d, 'styleguides'), (x) => { x.note = 'x'; }), /styleguides\.json: other fields than the sync writes/],
    ['another repository', (d) => editJson(refFile(d, 'styleguides'), (x) => { x.source = 'https://github.com/someone/else'; }), /styleguides\.json: source is not SAP\/styleguides/],
    ['a path out of its repository', (d) => editJson(refFile(d, 'abap-cheat-sheets'), (x) => { (x.files as Array<{ path: string }>)[0].path = '../../etc/passwd'; }), /abap-cheat-sheets\.json: a file entry is not path, sha256 and size/],
    ['a hash that is no hash', (d) => editJson(refFile(d, 'abap-cheat-sheets'), (x) => { (x.files as Array<{ sha256: string }>)[0].sha256 = 'abc'; }), /a file entry is not path, sha256 and size/],
    ['a source the sync does not have', (d) => fs.writeFileSync(refFile(d, 'other'), '{}\n'), /other\.json: not one of the synced sources/],
    ['not JSON', (d) => fs.writeFileSync(refFile(d, 'styleguides'), 'not json'), /styleguides\.json: not JSON/],
    ['a schema whose bytes changed', (d) => fs.appendFileSync(path.join(d, 'lib', 'generated', 'aff-schemas', 'clas-v1.json'), ' '), /aff-schemas\/clas-v1\.json: its bytes are not what abap-file-formats\.json records/],
    ['a schema nobody listed', (d) => fs.writeFileSync(path.join(d, 'lib', 'generated', 'aff-schemas', 'zzzz-v1.json'), '{}'), /aff-schemas\/zzzz-v1\.json: not listed as copied/],
    ['another licence text', (d) => fs.writeFileSync(path.join(d, 'lib', 'generated', 'aff-schemas', 'LICENSE'), 'All rights reserved.\n'), /aff-schemas\/LICENSE: not the MIT licence text/],
  ];
  for (const [what, tamper, reason] of cases) {
    const dir = copyOfData();
    try {
      tamper(dir);
      const problems = dataProblems(dir);
      expect(problems.some((p) => reason.test(p)), `${what}: ${JSON.stringify(problems)}`).toBe(true);
      let code = 0;
      try {
        execFileSync(process.execPath, [SCRIPT, dir], { stdio: 'pipe' });
      } catch (e) {
        code = (e as { status?: number }).status ?? -1;
      }
      expect(code, what).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the push job runs the check on the artifact before it copies anything into its checkout', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sync-sap-references.yml'), 'utf8').replace(/\r\n/g, '\n');
  const push = wf.slice(wf.indexOf('\n  push:'));
  const check = push.indexOf('node scripts/check-sap-reference-data.mjs "$src"');
  expect(check).toBeGreaterThan(-1);
  expect(check).toBeLessThan(push.indexOf('rm -rf lib/generated/sap-references lib/generated/aff-schemas'));
  expect(check).toBeLessThan(push.indexOf('cp -R "$src/lib/generated/sap-references"'));
  expect(check).toBeLessThan(push.indexOf('git add -A lib/generated/sap-references'));
  // The checker installs nothing: Node's own modules only.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  expect([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).every((m) => m.startsWith('node:'))).toBe(true);
});
