import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from './helpers/test';
import { landingProcess } from '../lib/landing-process';
import { DEMO_OBJECT_NAME, DEMO_SOURCE_FILE } from '../lib/demo-marks';

/**
 * The hero picture of the landing page 3.5 — owner decision O1 = B
 * (13.11.2026): the main flow of the demo builds up, then the business names
 * swap in. Three guard rails come with the decision, and this holds them:
 *
 *   1. every name on the map is the engine's — the starting label the name the
 *      code gives the element, the end label the business name the release's
 *      engine writes, read here again from `landingProcess` and compared;
 *   2. with `prefers-reduced-motion` the named map stands at once;
 *   3. nothing moves while it plays: no layout shift at all, measured.
 */

const elementNames = () => {
  const technical = landingProcess(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME, 'technical').planes[0].nodes;
  const plain = new Map(landingProcess(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME, 'plain').planes[0].nodes.map((n) => [n.id, n.name]));
  return technical.map((n) => ({ technical: n.name, plain: plain.get(n.id) ?? '' }));
};

async function heroNames(page: Page) {
  // An element a phone leaves out (`display: none`) runs no animation; only what is drawn counts.
  return page.locator('[data-hero-map] [data-hero-name]').evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => {
      const biz = el.querySelector('.biz') as HTMLElement;
      const eng = el.querySelector('.eng') as HTMLElement | null;
      return {
        plain: el.getAttribute('data-plain'),
        technical: el.getAttribute('data-technical'),
        shown: biz.textContent?.trim(),
        start: eng?.textContent?.trim() ?? null,
        bizOpacity: getComputedStyle(biz).opacity,
        engVisibility: eng ? getComputedStyle(eng).visibility : 'hidden',
      };
    }),
  );
}

test('every name the hero shows, before and after the swap, is the engine’s', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 150_000 });
  const names = await heroNames(page);
  expect(names.length, 'the hero map shows no element').toBeGreaterThan(5);
  const engine = elementNames();
  for (const n of names) {
    expect(n.shown, 'the visible end label is not the one the element carries').toBe(n.plain);
    if (n.technical === null) {
      // No swap: the engine's label already is the business name.
      expect(engine.some((e) => e.technical === n.plain && e.plain === n.plain), `${n.plain} is not an engine label`).toBe(true);
      continue;
    }
    expect(n.start).toBe(n.technical);
    expect(n.technical).not.toBe(n.plain);
    expect(
      engine.some((e) => e.technical === n.technical && e.plain === n.plain),
      `${n.technical} → ${n.plain} is not a pair the engine produces for ${DEMO_OBJECT_NAME}`,
    ).toBe(true);
  }
  // It plays once and ends named: after the swap only the business names show.
  await expect
    .poll(async () => (await heroNames(page)).every((n) => n.engVisibility === 'hidden' && n.bizOpacity === '1'), { timeout: 15_000 })
    .toBe(true);
});

test('with reduced motion the named map stands at once', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 150_000 });
  const names = await heroNames(page);
  expect(names.length).toBeGreaterThan(5);
  for (const n of names) {
    expect(n.bizOpacity, `${n.plain} is not shown at once`).toBe('1');
    expect(n.engVisibility, `${n.technical} still shows under reduced motion`).toBe('hidden');
  }
  const items = await page.locator('[data-hero-map] .flow > li').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
  expect(items.every((o) => o === '1'), 'an element of the map fades in under reduced motion').toBe(true);
  await expect(page.locator('[data-hero-status] button')).toBeHidden();
});

for (const width of [1440, 390]) {
  test(`no layout shift while the hero builds up, at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __shifts: string[] };
      w.__cls = 0;
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) {
          if (entry.hadRecentInput) continue;
          w.__cls += entry.value;
          for (const s of entry.sources ?? []) w.__shifts.push((s.node as Element | undefined)?.outerHTML?.slice(0, 120) ?? '?');
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    // A first visit fetches the page's font and swaps it in (`display: swap`,
    // app/layout.tsx) — a sub-pixel reflow of all text that belongs to the font,
    // not to the hero. Warm the cache once, then measure the visit.
    await page.goto('/', { waitUntil: 'load', timeout: 150_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.reload({ waitUntil: 'load', timeout: 150_000 });
    // The build-up and the swap end within a few seconds; then the header has settled too.
    await expect.poll(async () => (await heroNames(page)).every((n) => n.engVisibility === 'hidden'), { timeout: 15_000 }).toBe(true);
    await page.locator('header [data-header-sign-in]').waitFor({ state: 'visible', timeout: 30_000 });
    const { cls, shifts } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __shifts: string[] };
      return { cls: w.__cls, shifts: w.__shifts };
    });
    expect(cls, `layout shifted:\n${shifts.join('\n')}`).toBe(0);
  });
}

// Owner, 13.11.2026: the landing speaks to the reader about *their* code — "What
// happens to your code?", never "our code" — in the page, its FAQ (and with it the
// FAQPage JSON-LD and /llms-full.txt) and the hero's data module.
test('the landing says "your code", never "our code"', () => {
  for (const rel of ['app/page.tsx', 'lib/landing-faq.ts', 'lib/landing-35.ts', 'components/landing/HeroMapBuild.tsx']) {
    const text = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    expect(text.match(/\bour code\b/gi) ?? [], rel).toEqual([]);
  }
});
