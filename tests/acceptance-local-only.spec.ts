/**
 * SEC-653cff9-03 — the acceptance runner's rendered specs seed accounts and
 * projects, so `--base-url` accepts only a loopback host. The guard used to be a
 * denylist of two production patterns; any other remote host passed.
 *
 * Server-free: a child Node process imports the script's guard; nothing is started.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The script uses import.meta, which the spec loader's CommonJS transform cannot
// take; a child Node process imports it as the ES module it is.
const SCRIPT_URL = pathToFileURL(join(__dirname, '..', 'scripts', 'release', 'acceptance.mjs')).href;
function refuseProduction(url: string): void {
  const code = `import(${JSON.stringify(SCRIPT_URL)}).then((m) => m.refuseProduction(${JSON.stringify(url)})).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'refused');
}

test.describe('acceptance runner: rendered specs only against this machine', () => {
  for (const ok of ['http://localhost:3531', 'http://127.0.0.1:4400/', 'http://[::1]:3000', 'http://LOCALHOST:1']) {
    test(`accepts ${ok}`, () => {
      expect(() => refuseProduction(ok)).not.toThrow();
    });
  }

  for (const bad of [
    'https://clean-core.io',
    'https://dev.clean-core.io',
    'https://clean-core-dev-qcevuoi3uq-ew.a.run.app',
    'https://staging.example.com',
    'http://10.0.0.5:3000',
    'http://localhost.example.com',
    'http://127.0.0.1.nip.io',
    'not a url',
  ]) {
    test(`refuses ${bad}`, () => {
      expect(() => refuseProduction(bad)).toThrow(/refusing/);
    });
  }
});
