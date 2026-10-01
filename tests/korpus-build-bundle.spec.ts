import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

/**
 * The corpus builder writes each source block of the book to
 * `tests/korpus/cases/CC-nnn/<name>`, with the name taken from the heading.
 * A heading such as Quelltext `../../package.json` wrote outside the output
 * folder (carried QA finding 537a326d624e).
 */

const SCRIPT = join(process.cwd(), 'scripts', 'korpus', 'build-bundle.mjs');

/** The script is a native ES module (it reads `import.meta`), so it is loaded as one. */
async function check(): Promise<(name: string) => string> {
  const mod = (await import(pathToFileURL(SCRIPT).href)) as { assertPlainSourceName: (name: string) => string };
  return mod.assertPlainSourceName;
}

test('a source name with path parts is refused before anything is written', async () => {
  const assertPlainSourceName = await check();
  for (const bad of ['../../package.json', '..', 'a/b.abap', 'a\\b.abap', '/etc/passwd', '.hidden']) {
    expect(() => assertPlainSourceName(bad), bad).toThrow(/schlichter Dateiname/);
  }
});

test('every name the book uses today is a plain file name', async () => {
  const assertPlainSourceName = await check();
  const book = readFileSync(join(process.cwd(), 'docs', 'korpus', 'referenzkorpus-v2.1.md'), 'utf8');
  const names = [...book.matchAll(/^#+\s*Quelltext\s+`([^`]+)`/gm)].map((m) => m[1]);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(assertPlainSourceName(name)).toBe(name);
});

test('the parser applies the check to the heading it reads', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  expect(script).toContain('return { name: assertPlainSourceName(m[1]), lines: blocks[0] };');
});
