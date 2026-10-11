import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { suiteRepairImportHint } from '../lib/generated-package';
import { sandboxFilesFromStoredCode } from '../lib/test-sandbox/files';

/**
 * Owner report of 11.10.2026 (FI_Collection_Worklist): the test runner failed
 * three times. The generated suite held one syntax error; the auto-heal asked
 * the model to repair it and told it, for every route, that the code under test
 * was `./app`. The package's code lives at `./srv/service`, so the model moved
 * the import to `./app` as told, and both repairs failed with
 * `Could not resolve "./app"` — reproduced locally: the stored suite with the
 * quote fixed runs 10 of 10; the same suite with the import changed to `./app`
 * is 5,443 bytes, the length of the first repair draft, and does not build.
 *
 * The prompt now names the package's own paths (`suiteRepairImportHint`).
 */

const ROOT = path.resolve(__dirname, '..');
const PACKAGE = JSON.stringify([
  { path: 'srv/service.ts', content: 'export class AgingEngine { static ok() { return 1; } }' },
  { path: 'package.json', content: '{}' },
  { path: 'db/schema.cds', content: 'entity X {}' },
]);

test('a suite repair of a package is told its own import paths, never "./app"', () => {
  const hint = suiteRepairImportHint(PACKAGE);
  expect(hint).toContain("'./srv/service'");
  expect(hint).toContain('srv/service.ts');
  expect(hint).not.toMatch(/import from '\.\/app'/);
  expect(hint).toContain("There is no './app'");
  // A flat legacy module is materialised as app.ts, so './app' stays right there.
  expect(suiteRepairImportHint('export function f() {}')).toContain("import from './app'");
  expect(sandboxFilesFromStoredCode('export function f() {}').map((f) => f.path)).toEqual(['app.ts']);
});

test('the hook gives the suite repair the code under test, and no longer hard-codes "./app"', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'hooks', 'useTestExecution.ts'), 'utf8');
  expect(hook).toContain('suiteRepairImportHint(codeUnderTest)');
  expect(hook).toMatch(/autoHealCode\(errText, currentPayload\.tests\?\.code \|\| '', 'test', undefined, currentPayload\.code\)/);
  expect(hook).not.toContain(`? "IMPORTANT: the application under test is in './app'`);
});

test('why it matters: in a package, "./app" does not resolve and the package path does', async () => {
  const dir = path.join(ROOT, 'tmp', 'suite-repair-import-hint', String(process.pid));
  fs.mkdirSync(path.join(dir, 'srv'), { recursive: true });
  for (const f of sandboxFilesFromStoredCode(PACKAGE)) {
    fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
    fs.writeFileSync(path.join(dir, f.path), f.content);
  }
  const suite = (from: string) => `import { AgingEngine } from '${from}';\nexport const v = AgingEngine.ok();\n`;
  fs.writeFileSync(path.join(dir, 'ok.ts'), suite('./srv/service'));
  fs.writeFileSync(path.join(dir, 'app-import.ts'), suite('./app'));
  const bundle = (entry: string) =>
    build({ entryPoints: [path.join(dir, entry)], bundle: true, write: false, platform: 'node', logLevel: 'silent' });
  await expect(bundle('ok.ts')).resolves.toBeTruthy();
  await expect(bundle('app-import.ts')).rejects.toThrow(/Could not resolve "\.\/app"/);
});
