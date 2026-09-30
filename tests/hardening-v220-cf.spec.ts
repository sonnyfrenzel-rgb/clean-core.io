import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { withPreviewPolicy } from '../lib/export-preview';

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
