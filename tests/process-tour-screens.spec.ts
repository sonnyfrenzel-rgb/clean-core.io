import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour, tourReadingOf } from '../lib/process-tour';
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
  return { model, tour: buildProcessTour(guide, model, tourReadingOf(source)) };
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
  if (at >= 0 && at < which.tour.stations.length) await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(1, { timeout: 30_000 });
}

/** Where the highlighted element, the map, the card and its buttons stand, and whether anything scrolls. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const shape = document.querySelector('[data-process-tour-map] .cc-tour-here .djs-visual');
    const card = document.querySelector('[data-tour-card]') as HTMLElement | null;
    return {
      element: rect(shape),
      card: rect(card),
      cardScroll: card ? { scrollHeight: card.scrollHeight, clientHeight: card.clientHeight } : null,
      next: rect(document.querySelector('[data-tour-next]')),
      back: rect(document.querySelector('[data-tour-back]')),
      head: rect(document.querySelector('.cc-tour-head')),
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
      mode: document.querySelector('[data-process-tour]')?.getAttribute('data-tour-mode'),
    };
  });
}

const inside = (r: { left: number; top: number; right: number; bottom: number }, w: number, h: number) =>
  r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1;

/**
 * Owner decisions 22.10.2026 (option A): a phone upright stacks map, card and a
 * pinned button bar; a phone on its side puts the card in a column beside the
 * map; 390 × 664 is what Safari leaves of a 390 × 844 phone. On every one, at
 * every station, Next is on the screen without scrolling anything.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mode: 'wide' },
  { name: 'phone', width: 390, height: 844, mode: 'stacked' },
  { name: 'phone-browser-bars', width: 390, height: 664, mode: 'stacked' },
  { name: 'phone-landscape', width: 844, height: 390, mode: 'landscape' },
  { name: 'small-phone-landscape', width: 667, height: 375, mode: 'landscape' },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`the tour of the 1,000-line example at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, contextOptions: { reducedMotion: 'reduce' } });

    test('the overview first, then at every station the element, its card and Next on one screen, with no scrolling', async ({ page }, info) => {
      test.setTimeout(240_000);
      await open(page, -1);
      // The overview: the whole map, "What this process is about", not counted as a step.
      await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'overview');
      await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-mode', viewport.mode);
      await expect(page.locator('[data-tour-overview]')).toBeVisible();
      await expect(page.locator('[data-tour-count]')).toBeVisible();
      await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(0);
      // Said once: by the counter on a wide screen, by the part select on a phone.
      if (viewport.mode === 'wide') await expect(page.locator('[data-tour-position]')).toHaveText('Overview');
      else {
        await expect(page.locator('[data-tour-position]')).toBeHidden();
        await expect(page.locator('[data-tour-chapter-select]')).toHaveValue('overview');
      }
      const o = await measure(page);
      expect(inside(o.next!, o.width, o.height), `overview: Next ${JSON.stringify(o.next)}`).toBe(true);
      await page.screenshot({ path: info.outputPath(`tour-${viewport.name}-overview.png`) });

      const shots = new Set([0, Math.floor(tour.stations.length / 2), tour.stations.length - 1]);
      for (let at = 0; at < tour.stations.length; at += 1) {
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(at + 1));
        await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(1);
        // The map highlights the element the card narrates, not the one before it (QA review of ee72ca2218e1,
        // db6418710512): bpmn-js marks the element's own group, which carries its id.
        await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveAttribute('data-element-id', tour.stations[at].id);
        await expect(page.locator('[data-tour-position]')).toHaveText(`Step ${at + 1} of ${tour.stations.length}`);
        // The card's placement follows the camera in the next frame.
        await page.waitForTimeout(120);
        const m = await measure(page);
        const title = tour.stations[at].title;
        expect(m.element, title).not.toBeNull();
        expect(inside(m.element!, m.width, m.height), `${title}: element ${JSON.stringify(m.element)}`).toBe(true);
        expect(inside(m.card!, m.width, m.height), `${title}: card ${JSON.stringify(m.card)}`).toBe(true);
        expect(inside(m.element!, m.map!.right, m.map!.bottom), `${title}: element inside the map`).toBe(true);
        // Next and Back are on the screen, and the card says its station without scrolling (More closed).
        expect(inside(m.next!, m.width, m.height), `${title}: Next ${JSON.stringify(m.next)}`).toBe(true);
        expect(inside(m.back!, m.width, m.height), `${title}: Back ${JSON.stringify(m.back)}`).toBe(true);
        expect(m.cardScroll!.scrollHeight, `${title}: the card scrolls ${JSON.stringify(m.cardScroll)}`).toBeLessThanOrEqual(m.cardScroll!.clientHeight + 1);
        if (viewport.mode === 'wide') {
          // Beside it, not over it.
          const apart = m.card!.left >= m.element!.right || m.card!.right <= m.element!.left;
          expect(apart, `${title}: card ${JSON.stringify(m.card)} over element ${JSON.stringify(m.element)}`).toBe(true);
        } else if (viewport.mode === 'stacked') {
          // Under the map, stacked, and the buttons under the card.
          expect(m.card!.top).toBeGreaterThanOrEqual(m.map!.bottom - 1);
          expect(m.next!.top).toBeGreaterThanOrEqual(m.card!.bottom - 1);
          // One row of header.
          expect(m.head!.height, `${title}: header ${JSON.stringify(m.head)}`).toBeLessThanOrEqual(56);
        } else {
          // Beside the map, the buttons under the card.
          expect(m.card!.left).toBeGreaterThanOrEqual(m.map!.right - 1);
          expect(m.card!.width).toBeLessThanOrEqual(361);
          expect(m.next!.top).toBeGreaterThanOrEqual(m.card!.bottom - 1);
          expect(m.next!.left).toBeGreaterThanOrEqual(m.map!.right - 1);
          expect(m.head!.height, `${title}: header ${JSON.stringify(m.head)}`).toBeLessThanOrEqual(56);
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
      await expect(page.locator('[data-tour-end]')).toBeVisible();
      await expect(page.locator('[data-tour-to-design]')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`tour-${viewport.name}-end.png`) });
    });
  });
}

/* The PO example has the longest case list (351 characters): on the card it is said short, the list is one level down. */
for (const viewport of VIEWPORTS.filter((v) => v.mode !== 'wide')) {
  test.describe(`the tour of the PO example at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, contextOptions: { reducedMotion: 'reduce' } });

    test('at every station Next is on the screen and the card does not scroll', async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, 0, PO);
      for (let at = 0; at < PO.tour.stations.length; at += 1) {
        if (at > 0) await page.keyboard.press('ArrowRight');
        await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(at + 1));
        await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveCount(1);
        const m = await measure(page);
        const title = PO.tour.stations[at].title;
        expect(inside(m.next!, m.width, m.height), `${title}: Next ${JSON.stringify(m.next)}`).toBe(true);
        expect(m.cardScroll!.scrollHeight, `${title}: the card scrolls ${JSON.stringify(m.cardScroll)}`).toBeLessThanOrEqual(m.cardScroll!.clientHeight + 1);
      }
    });
  });
}

test.describe('moving through the tour', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Back and Next from the overview, a chapter jump, More in the card, Escape closes and the focus goes back', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, -1);
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'overview');
    await expect(page.locator('[data-tour-back]')).toBeDisabled();
    await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', '1');
    await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', '2');
    await page.locator('[data-tour-back]').click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'overview');
    const last = tour.chapters[tour.chapters.length - 1];
    await page.locator(`[data-tour-chapter="${tour.chapters.length}"]`).click();
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(last.first + 1));
    await expect(page.locator(`[data-tour-chapter="${tour.chapters.length}"]`)).toHaveAttribute('aria-current', 'step');
    // Nothing moves by itself.
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(last.first + 1));
    // On a wide screen "More about it" opens in the card.
    await expect(page.locator('[data-tour-card] [data-cc-anchor]').first()).toBeHidden();
    await page.locator('[data-tour-more-open]').click();
    await expect(page.locator('[data-tour-card] [data-cc-anchor]').first()).toBeVisible();
    await expect(page.locator('[data-tour-more-panel]')).toHaveCount(0);
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, contextOptions: { reducedMotion: 'reduce' } });

  test('"More about it" is a panel over the tour with "Back to the map"; Escape closes the panel first', async ({ page }, info) => {
    test.setTimeout(120_000);
    const at = PO.tour.stations.findIndex((s) => s.cases !== null);
    expect(at).toBeGreaterThan(-1);
    await open(page, at, PO);
    const panel = page.locator('[data-tour-more-panel]');
    await expect(panel).toBeHidden();
    await page.locator('[data-tour-more-open]').click();
    await expect(panel).toBeVisible();
    // Over the whole tour below the bar: the map and the card are covered, the full list of cases is in it.
    const box = (await panel.boundingBox())!;
    const map = (await page.locator('[data-process-tour-map]').boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(map.y + 1);
    expect(box.y + box.height).toBeGreaterThanOrEqual(663);
    await expect(panel.locator('[data-tour-cases]')).toContainText(PO.tour.stations[at].cases!.text.slice(0, 40));
    await expect(page.locator('[data-tour-back-to-map]')).toBeFocused();
    await page.screenshot({ path: info.outputPath('tour-phone-more-panel.png') });
    await page.locator('[data-tour-back-to-map]').click();
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-tour-more-open]')).toBeFocused();
    await page.locator('[data-tour-more-open]').click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-process-tour]')).toBeVisible();
    // Moving on closes it: a panel belongs to one station.
    await page.locator('[data-tour-more-open]').click();
    await page.locator('[data-tour-back-to-map]').click();
    await page.keyboard.press('ArrowLeft');
    await expect(panel).toBeHidden();
  });

  test('a swipe across the card moves a step; the same swipe on the map does not', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 1, PO);
    const swipe = (selector: string, dx: number) =>
      page.evaluate(
        ({ selector, dx }) => {
          const el = document.querySelector(selector) as HTMLElement;
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + Math.min(40, r.height / 2);
          const init = { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true };
          el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x, clientY: y }));
          el.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: x + dx, clientY: y + 4 }));
        },
        { selector, dx },
      );
    const tourAt = page.locator('[data-process-tour]');
    await expect(tourAt).toHaveAttribute('data-tour-at', '2');
    await swipe('[data-tour-card]', -120);
    await expect(tourAt).toHaveAttribute('data-tour-at', '3');
    await swipe('[data-tour-card]', 120);
    await expect(tourAt).toHaveAttribute('data-tour-at', '2');
    await swipe('[data-process-tour-map]', -120);
    await page.waitForTimeout(200);
    await expect(tourAt).toHaveAttribute('data-tour-at', '2');
  });
});
