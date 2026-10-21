import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour, tourClosingOf } from '../lib/process-tour';
import { readExample } from './helpers/starter-example-files';

/**
 * The guided tour in a real browser — owner decision 21.10.2026: the walk-
 * through "shows something at the top and at the bottom of the process
 * without you getting it onto one screen". At every station of the tour of
 * the 1,000-line example, at 1440 × 900 and at 390 × 844, the highlighted
 * element **and** its narration card are both on the screen, without
 * scrolling the page and without a sideways scroll; on a wide screen the card
 * stands beside the element, on a phone under the map.
 *
 * Server-free: a static page mounts `ProcessTour` with the tour read here
 * (esbuild for the browser, the product's own Tailwind build of
 * `app/globals.css`), as other server-free render specs do. Screenshots go to
 * this test's output folder.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const OUT = path.join(ROOT, 'tmp', 'process-tour-screens', String(process.pid));

function tourOf(file: string) {
  const source = readExample(file).replace(/\r\n/g, '\n');
  const exports = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn: exports.bpmn, technical: exports.technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  return { model, tour: buildProcessTour(guide, model, tourClosingOf(source)) };
}
const BIG = tourOf(FILE);
const PO = tourOf('Z_MM_PO_APPROVAL.abap');
const tour = BIG.tour;

let page_html = '';

async function tailwind(): Promise<string> {
  // The product's own stylesheet, built for the classes the components use.
  const { compile } = require('@tailwindcss/node') as typeof import('@tailwindcss/node');
  const { Scanner } = require('@tailwindcss/oxide') as typeof import('@tailwindcss/oxide');
  const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  const compiler = await compile(css, { base: path.join(ROOT, 'app'), onDependency: () => {} });
  const scanner = new Scanner({ sources: [{ base: path.join(ROOT, 'components'), pattern: '**/*.tsx', negated: false }] });
  return compiler.build(scanner.scan());
}

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const link = path.join(OUT, 'next-link.tsx');
  fs.writeFileSync(
    link,
    "import React from 'react';\nexport default function Link({ href, children, ...rest }: { href: string; children?: React.ReactNode }) { return <a href={href} {...rest}>{children}</a>; }\n",
  );
  const entry = [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import ProcessTour from './components/workspace/ProcessTour';",
    'const data = (window as unknown as { __TOUR__: { tour: never; model: never; at: number } }).__TOUR__;',
    'function App() {',
    '  const [open, setOpen] = React.useState(true);',
    "  return open ? <ProcessTour tour={data.tour} model={data.model} onClose={() => setOpen(false)} designHref=\"/project/p1/design\" initialStation={data.at} /> : <p data-tour-closed=\"\">closed</p>;",
    '}',
    "(document.getElementById('opener') as HTMLButtonElement).focus();",
    "createRoot(document.getElementById('tour')!).render(<App />);",
  ].join('\n');
  await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx', sourcefile: 'harness.tsx' },
    outfile: path.join(OUT, 'harness.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': ROOT, 'next/link': link },
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'css', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl' },
    logLevel: 'silent',
  });
  const js = fs.readFileSync(path.join(OUT, 'harness.js'), 'utf8');
  const bundleCss = fs.existsSync(path.join(OUT, 'harness.css')) ? fs.readFileSync(path.join(OUT, 'harness.css'), 'utf8') : '';
  const css = await tailwind();
  page_html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${bundleCss}</style></head><body style="margin:0;background:var(--cc-page)"><main style="padding:24px"><h1>Business view</h1><button id="opener">Walk through the process</button><div style="height:2000px"></div></main><div id="tour"></div><script>window.__TOUR__=__DATA__;</script><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
});

async function open(page: Page, at: number, which = BIG): Promise<void> {
  const data = JSON.stringify({ tour: which.tour, model: which.model, at }).replace(/</g, '\\u003c');
  await page.setContent(page_html.replace('__DATA__', () => data), { waitUntil: 'load' });
  await expect(page.locator('[data-process-tour]')).toBeVisible();
  await expect(page.locator('[data-process-tour-map] .djs-container')).toBeVisible({ timeout: 30_000 });
  if (at < which.tour.stations.length) await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(1, { timeout: 30_000 });
}

/** Where the highlighted element and the card stand, and whether the page scrolls. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const shape = document.querySelector('[data-process-tour-map] .cc-tour-here .djs-visual');
    return {
      element: rect(shape),
      card: rect(document.querySelector('[data-tour-card]')),
      map: rect(document.querySelector('[data-process-tour-map]')),
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      dialogScroll: (() => {
        const d = document.querySelector('[data-process-tour]') as HTMLElement;
        return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight };
      })(),
      focused: document.activeElement?.tagName ?? '',
      at: document.querySelector('[data-process-tour]')?.getAttribute('data-tour-at'),
    };
  });
}

const inside = (r: { left: number; top: number; right: number; bottom: number }, w: number, h: number) =>
  r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1;

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test.describe(`the tour of the 1,000-line example at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, contextOptions: { reducedMotion: 'reduce' } });

    test('at every station the highlighted element and its card are both on one screen, with no scrolling', async ({ page }, info) => {
      test.setTimeout(240_000);
      await open(page, 0);
      const shots = new Set([0, Math.floor(tour.stations.length / 2), tour.stations.length - 1]);
      for (let at = 0; at < tour.stations.length; at += 1) {
        if (at > 0) {
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(at + 1));
          await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(1);
        }
        // The card's placement follows the camera in the next frame.
        await page.waitForTimeout(120);
        const m = await measure(page);
        const title = tour.stations[at].title;
        expect(m.element, title).not.toBeNull();
        expect(inside(m.element!, m.width, m.height), `${title}: element ${JSON.stringify(m.element)}`).toBe(true);
        expect(inside(m.card!, m.width, m.height), `${title}: card ${JSON.stringify(m.card)}`).toBe(true);
        expect(inside(m.element!, m.map!.right, m.map!.bottom), `${title}: element inside the map`).toBe(true);
        if (viewport.name === 'desktop') {
          // Beside it, not over it.
          const apart = m.card!.left >= m.element!.right || m.card!.right <= m.element!.left;
          expect(apart, `${title}: card ${JSON.stringify(m.card)} over element ${JSON.stringify(m.element)}`).toBe(true);
        } else {
          // Under the map, stacked.
          expect(m.card!.top).toBeGreaterThanOrEqual(m.map!.bottom - 1);
        }
        expect(m.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(m.width);
        expect(m.dialogScroll.scrollWidth).toBeLessThanOrEqual(m.dialogScroll.clientWidth);
        expect(m.dialogScroll.scrollHeight).toBeLessThanOrEqual(m.dialogScroll.clientHeight);
        // The focus is on the card's title, so a screen reader reads where the tour is.
        expect(m.focused).toBe('H2');
        if (shots.has(at)) await page.screenshot({ path: info.outputPath(`tour-${viewport.name}-station-${at + 1}.png`) });
      }
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'end');
      await expect(page.locator('[data-tour-closing]')).toBeVisible();
      await expect(page.locator('[data-tour-to-design]')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`tour-${viewport.name}-end.png`) });
    });
  });
}

test.describe('moving through the tour', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Back and Next, a chapter jump, Escape closes and the focus goes back to the button that opened it', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 0);
    await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', '2');
    await page.locator('[data-tour-back]').click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', '1');
    const last = tour.chapters[tour.chapters.length - 1];
    await page.locator(`[data-tour-chapter="${tour.chapters.length}"]`).click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(last.first + 1));
    await expect(page.locator(`[data-tour-chapter="${tour.chapters.length}"]`)).toHaveAttribute('aria-current', 'step');
    // Nothing moves by itself.
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(last.first + 1));
    // "More about it" folds the lines.
    await expect(page.locator('[data-tour-card] [data-cc-anchor]').first()).toBeHidden();
    await page.locator('[data-tour-more] button').first().click();
    await expect(page.locator('[data-tour-card] [data-cc-anchor]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tour-closed]')).toBeVisible();
    await expect(page.locator('#opener')).toBeFocused();
  });

  test('without reduced motion the map glides to the station; with it, it jumps', async ({ page }) => {
    test.setTimeout(120_000);
    const viewbox = () => page.evaluate(() => document.querySelector('[data-process-tour-map] svg g.viewport')?.getAttribute('transform') ?? '');
    // Two stations on one level, so the camera moves rather than changing level.
    const pair = PO.tour.stations.findIndex((s, i) => i + 1 < PO.tour.stations.length && PO.tour.stations[i + 1].plane === s.plane);
    expect(pair).toBeGreaterThan(-1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, pair, PO);
    await page.waitForTimeout(600);
    const before = await viewbox();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
    const during = await viewbox();
    await page.waitForTimeout(700);
    const after = await viewbox();
    expect(during).not.toBe(after);
    expect(after).not.toBe(before);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(30);
    const jumped = await viewbox();
    await page.waitForTimeout(600);
    expect(await viewbox()).toBe(jumped);
  });
});
