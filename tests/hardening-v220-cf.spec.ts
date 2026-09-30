import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { withPreviewPolicy } from '../lib/export-preview';
import { getPublishedKeyring, resetSigningKeypairCache } from '../lib/audit-signing-keypair';

/**
 * Hardening that shipped with the v2.20 security steps C and F.
 *
 * Each block holds one fix to its behaviour. Where the fix is a call in a page
 * or a route that only runs signed in, the block also checks the call is there.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('an exported document previewed in the browser', () => {
  test('runs nothing and fetches nothing, whatever it contains', async ({ page }) => {
    // Whatever reaches the network is answered here, so a request that got past
    // the policy is counted rather than lost to a failed lookup.
    const requested: string[] = [];
    await page.route('**/*example.invalid*/**', (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'image/png', body: '' });
    });
    const doc = withPreviewPolicy(
      '<!DOCTYPE html><html><head><title>Design</title><style>h1{color:#123}</style></head><body>' +
        '<h1>Design</h1><script>window.__ran = 1</script>' +
        '<img src="https://example.invalid/pixel.png" onerror="window.__ran = 2">' +
        '<form action="https://example.invalid/post"><input name="q"></form>' +
        '</body></html>',
    );
    await page.setContent(doc);
    expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined();
    expect(requested).toEqual([]);
    // Styling is what an exported page is; it still applies.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).color)).toBe('rgb(17, 34, 51)');
  });

  test('the design stage opens its preview under that policy', () => {
    const s = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(s).toContain('new Blob([withPreviewPolicy(htmlContent)]');
  });
});

test.describe('the read paths of the process routes and the model settings', () => {
  // Limiting is switched off under the emulator, so what can be checked here is
  // that the call is on the path a GET takes — the shape of the existing guard
  // for `process-states` in tests/route-hardening-b88c77b.spec.ts.
  for (const name of ['process-revisions', 'process-naming', 'process-map']) {
    test(`${name} meters its read with a budget of its own`, () => {
      const src = read(`app/api/projects/[projectId]/${name}/route.ts`);
      const gate = src.slice(src.indexOf('async function openProject'), src.indexOf('const { projectId } = await params;'));
      const keys = [...gate.matchAll(/assertRateLimit\(\s*`([^`]+)`/g)].map((m) => m[1]);
      expect(keys.length, `${name}: the read path is unmetered`).toBe(2);
      expect(keys.some((k) => k.startsWith(`${name}-read:`)), `${name}: the read has no budget of its own`).toBe(true);
      const readBranch = gate.slice(gate.indexOf('} else {'));
      expect(readBranch, `${name}: the read budget is not on the read branch`).toContain(`assertRateLimit(\`${name}-read:`);
    });
  }

  test('model-stages meters its read before it decrypts a key', () => {
    const src = read('app/api/model-stages/route.ts');
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'));
    expect(get, 'the read is unmetered').toContain('assertRateLimit(`model_stages_read:');
    expect(get.indexOf('assertRateLimit('), 'the limit comes after the work').toBeLessThan(get.indexOf('answerFor('));
  });
});

test.describe('the list of retired signing keys', () => {
  test('takes public keys only — a private key there is refused, not converted', () => {
    const vars = ['AUDIT_SIGNING_PRIVATE_KEY', 'AUDIT_SIGNING_PUBLIC_KEYS_RETIRED'] as const;
    const previous = vars.map((v) => process.env[v]);
    const pem = () => crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    const retiredPrivate = pem();
    try {
      process.env.AUDIT_SIGNING_PRIVATE_KEY = Buffer.from(pem()).toString('base64');
      for (const shape of [retiredPrivate, retiredPrivate.replace(/\n/g, '\n')]) {
        process.env.AUDIT_SIGNING_PUBLIC_KEYS_RETIRED = shape;
        resetSigningKeypairCache();
        const ring = getPublishedKeyring();
        expect(ring.map((k) => k.status), 'a private key was published as a retired one').toEqual(['active']);
      }
    } finally {
      vars.forEach((v, i) => {
        if (previous[i] === undefined) delete process.env[v];
        else process.env[v] = previous[i];
      });
      resetSigningKeypairCache();
    }
  });
});
