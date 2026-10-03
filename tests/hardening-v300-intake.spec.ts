import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

/**
 * Hardening from the intake of the 3.0.0 security audit.
 *
 * Where the behaviour can be driven without a server it is driven; the rate
 * limiter is skipped under the emulator flag, so for the routes the block
 * checks that the call is there and where it sits.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('structured data', () => {
  function pagesWithJsonLd(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pagesWithJsonLd(full, out);
      else if (/\.tsx$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('application/ld+json')) out.push(full);
    }
    return out;
  }

  test('every ld+json block is serialised through jsonLdHtml', () => {
    const files = [...pagesWithJsonLd(path.join(ROOT, 'app')), ...pagesWithJsonLd(path.join(ROOT, 'components'))];
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      expect(src, `${rel} writes JSON.stringify output into a script element`).not.toMatch(/__html:\s*JSON\.stringify/);
      expect(src, `${rel} has an ld+json block that does not use jsonLdHtml`).toContain('jsonLdHtml(');
    }
  });
});

/** The shipped sanitizer, compiled for a browser; jsdom is its server half and stays external. */
async function renderInPage(page: Page, inputs: string[]): Promise<string[]> {
  const result = await build({
    entryPoints: [path.resolve(ROOT, 'lib/sanitize-html.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'CleanCoreSanitize',
    platform: 'browser',
    external: ['jsdom'],
    logLevel: 'silent',
  });
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return page.evaluate(
    (mds) => mds.map((md) => (window as unknown as { CleanCoreSanitize: { renderMarkdownSafe: (m: string) => string } }).CleanCoreSanitize.renderMarkdownSafe(md)),
    inputs,
  );
}

test.describe('markdown links', () => {
  test('a link leading off the site through a path prefix keeps no href', async ({ page }) => {
    const inputs = ['[open](//example.invalid/x)', '<a href="/\\example.invalid/x">open</a>', '<a href="//example.invalid/x">open</a>'];
    const out = await renderInPage(page, inputs);
    out.forEach((html, i) => expect(html, inputs[i]).not.toContain('example.invalid'));
  });

  test('links on this site and plain web links still render', async ({ page }) => {
    const [own, web, anchor, script] = await renderInPage(page, [
      '[guide](/how-to)',
      '[sap](https://www.sap.com/)',
      '[top](#start)',
      '[x](javascript:alert(1))',
    ]);
    expect(own).toContain('href="/how-to"');
    expect(web).toContain('href="https://www.sap.com/"');
    expect(anchor).toContain('href="#start"');
    expect(script).not.toContain('javascript:');
  });
});

test.describe('the consent route', () => {
  test('the consent route meters the account before it appends a record', () => {
    const src = read('app/api/consent/route.ts');
    const limit = src.indexOf('await assertRateLimit(`consent:${decoded.uid}`');
    expect(limit, 'no account budget on the consent route').toBeGreaterThan(0);
    expect(limit).toBeLessThan(src.indexOf('await recordConsent('));
  });
});

test.describe('the model-stages route', () => {
  test('the model-stages write budget is keyed on the account alone', () => {
    const src = read('app/api/model-stages/route.ts');
    expect(src).toContain('await assertRateLimit(`model_stages:${uid}`, 60,');
    expect(src).not.toContain('getClientIp');
  });
});

test.describe('the administrator mail routes', () => {
  for (const route of ['send-approval-email', 'send-tenant-approval-email', 'send-tenant-revoke-email']) {
    test(`${route} has an administrator mail budget before it reads the request`, () => {
      const src = read(`app/api/${route}/route.ts`);
      const limit = src.indexOf('await assertRateLimit(`admin_mail:${adminToken.uid}`');
      expect(limit, 'no administrator mail budget').toBeGreaterThan(0);
      expect(limit).toBeGreaterThan(src.indexOf('await assertAdminStepUp('));
      expect(limit).toBeLessThan(src.indexOf('await request.json()'));
    });
  }
});
