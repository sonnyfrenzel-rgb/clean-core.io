/**
 * A link to a section of the landing lands on that section — codex review
 * code-public-04 (02.10.2026).
 *
 * The 3.0 landing renamed its sections, and the feature pages kept pointing at
 * the old ones: "Get free access" went to "/#access" and "Back to features" to
 * "/#features", neither of which exists any more, so both dropped the reader at
 * the top of the page. `tests/copy-ci-guard.spec.ts` checks that a route
 * resolves and throws the fragment away first, so it could not see this.
 *
 * Two halves. The source half reads every "/#…" literal in app/, components/
 * and lib/ and requires the id on the landing. The rendered half opens every
 * feature page, collects the landing fragments it actually links to, and finds
 * each of them in the rendered landing — a fragment built at runtime is not in
 * the source.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { FEATURE_SLUGS } from '../lib/features-content';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The ids the landing's source declares, literal `id="…"` attributes. */
function landingIds(): Set<string> {
  return new Set([...read('app/page.tsx').matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'generated') continue;
      sourceFiles(rel, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('every "/#…" link in the source names a section the landing has', () => {
  const ids = landingIds();
  expect(ids.has('start'), 'the landing lost its start section').toBe(true);
  const broken: string[] = [];
  let links = 0;
  for (const rel of ['app', 'components', 'lib'].flatMap((d) => sourceFiles(d))) {
    read(rel)
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const m of line.matchAll(/["'`]\/#([\w-]+)/g)) {
          links++;
          if (!ids.has(m[1])) broken.push(`${rel}:${i + 1} → /#${m[1]}`);
        }
      });
  }
  expect(links, 'the sweep found no landing fragment at all').toBeGreaterThan(0);
  expect(broken, `links to a landing section that does not exist:\n${broken.join('\n')}`).toEqual([]);
});

test('every feature page links only to landing sections that render', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const wanted = new Map<string, string[]>();
  for (const slug of FEATURE_SLUGS) {
    await page.goto(`/features/${slug}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    const hrefs = await page.locator('main a[href^="/#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(hrefs.length, `/features/${slug} has no way back to the landing`).toBeGreaterThan(0);
    for (const href of hrefs) wanted.set(href.slice(2), [...(wanted.get(href.slice(2)) ?? []), slug]);
  }
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  for (const [id, slugs] of wanted) {
    expect(await page.locator(`[id="${id}"]`).count(), `/#${id} (from ${slugs.join(', ')}) is not on the landing`).toBe(1);
  }
});
