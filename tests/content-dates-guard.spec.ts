import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A route's `lastmod` is only as honest as the list of files it is read from.
 *
 * `scripts/sync-content-dates.mjs` dates every indexable route from the git
 * history of the files that render it. Its failure mode is silent and it has
 * already happened: on 17.09.2026 `/how-to` was rebuilt from six phases to seven
 * and every sentence on it replaced, while the route kept reporting the date of
 * its last `page.tsx` edit — because the words now live in
 * `components/HowToClient.tsx` and `lib/how-to-content.ts`, and only `page.tsx`
 * was listed. Eleven more routes had the same shape.
 *
 * Correcting the twelve entries leaves the mechanism that produced them, so this
 * guards the mechanism. The rule needs no opinion about what "content" is, which
 * is what made the omissions survive review:
 *
 *   a module that ROUTE_SOURCES already calls content for one route is content on
 *   every route whose page file imports it.
 *
 * The set of content modules is the table's own, so it grows as the table does. A
 * page that starts rendering the catalog census, the reference run or the how-to
 * text fails here until its route says so. What it deliberately does not do is
 * follow the import closure — see the note on that in the second test.
 *
 * The one honest exception is a page file itself: `app/whitepaper/page.tsx` links
 * to `/reference-analysis`, it does not render it. Only non-page modules are
 * compared.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** ROUTE_SOURCES, parsed out of the script rather than duplicated here. */
function routeSources(): Record<string, string[]> {
  const src = read('scripts/sync-content-dates.mjs');
  const start = src.indexOf('const ROUTE_SOURCES = {');
  expect(start, 'ROUTE_SOURCES not found in scripts/sync-content-dates.mjs').toBeGreaterThan(0);
  const block = src.slice(start, src.indexOf('\n};', start));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/'(\/[^']*)':\s*\[([\s\S]*?)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return out;
}

const isFile = (rel: string) => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();

/** `@/x` and `./x` as the bundler resolves them, or null for a package. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, '/')), spec));
  else return null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    if (isFile(base + ext)) return base + ext;
  }
  return null;
}

/** What a file imports, resolved to repo-relative paths. */
function importsOf(file: string): string[] {
  const text = read(file);
  return [...text.matchAll(/from\s+'([^']+)'/g)]
    .map((m) => resolveSpec(m[1], file))
    .filter((r): r is string => r !== null);
}

test.describe('the sitemap dates a route from everything that renders it', () => {
  const SOURCES = routeSources();

  test('every file the table names exists', () => {
    const missing = Object.entries(SOURCES).flatMap(([route, files]) =>
      files.filter((f) => !isFile(f)).map((f) => `${route} → ${f}`),
    );
    expect(missing, `ROUTE_SOURCES names files that are not there:\n${missing.join('\n')}`).toEqual([]);
    expect(Object.keys(SOURCES).length, 'no routes parsed out of the script').toBeGreaterThan(20);
  });

  test('a module that is content for one route is content for every page that renders it', () => {
    // Every non-page module the table declares. A `page.tsx` is excluded: one
    // page linking to another is not one page rendering the other.
    const contentModules = new Set(
      Object.values(SOURCES)
        .flat()
        .filter((f) => !/(^|\/)page\.tsx$/.test(f)),
    );
    // A parse check, deliberately far below the real count: this line is not
    // supposed to be the one that fails when the table is wrong.
    expect(contentModules.size, 'the table declares no content modules at all').toBeGreaterThan(5);

    // Only what a route's own page file imports, one level deep — not the import
    // closure. The closure would drag the whole ABAP engine behind
    // `lib/abap/catalog-service.ts` into a dozen routes and date them by every
    // engine commit, which is the flat sitemap this table exists to prevent,
    // arriving from the other side. What a page prints is a curated claim; this
    // only holds the table to claims it has already made elsewhere.
    const undeclared: string[] = [];
    for (const [route, files] of Object.entries(SOURCES)) {
      const listed = new Set(files);
      for (const file of files.filter((f) => isFile(f) && /(^|\/)page\.tsx$/.test(f))) {
        for (const imported of importsOf(file)) {
          if (contentModules.has(imported) && !listed.has(imported)) {
            undeclared.push(`${route}: ${file} renders ${imported}, which the table does not list for this route`);
          }
        }
      }
    }

    expect(
      [...new Set(undeclared)].sort(),
      'these routes report a `lastmod` that a content change cannot move — add the module to ' +
        `ROUTE_SOURCES in scripts/sync-content-dates.mjs and run \`npm run sync:content-dates\`:\n${undeclared.join('\n')}`,
    ).toEqual([]);
  });
});
