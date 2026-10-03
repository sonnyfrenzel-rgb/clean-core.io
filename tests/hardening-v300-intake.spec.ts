import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Hardening from the intake of the 3.0.0 security audit.
 *
 * Where the behaviour can be driven without a server it is driven; the rate
 * limiter is skipped under the emulator flag, so for the routes the block
 * checks that the call is there and where it sits.
 */

const ROOT = path.resolve(__dirname, '..');

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
