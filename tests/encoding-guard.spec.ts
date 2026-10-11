import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * No source file is double-encoded.
 *
 * On 11.10.2026 one component reached the release branch with every "—", "€"
 * and "§" written as "â€”", "â‚¬" and "Â§": UTF-8 read as Windows-1252 and saved
 * again. TypeScript compiles it, every guard that reads words passes, and the
 * reader sees mangled text on the page. The marks of that round trip — "â€" and
 * "Ã" or "Â" followed by a Latin-1 symbol — never occur in English copy.
 */
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks', 'scripts', 'tests', 'docs'];
const DOUBLE_ENCODED = /â€|Ã[\u0080-¿]|Â[ -¿]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'archiv') continue;
      walk(full, out);
    } else if (/\.(tsx?|mjs|md|json|ya?ml)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('no source file carries UTF-8 that was read as Windows-1252 and saved again', () => {
  const hits: string[] = [];
  let files = 0;
  for (const dir of DIRS) {
    for (const full of walk(path.join(ROOT, dir))) {
      if (full === __filename) continue;
      files++;
      fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (DOUBLE_ENCODED.test(line)) hits.push(`${path.relative(ROOT, full)}:${i + 1}`);
      });
    }
  }
  expect(files, 'the guard read the source tree').toBeGreaterThan(1000);
  expect(hits).toEqual([]);
});
