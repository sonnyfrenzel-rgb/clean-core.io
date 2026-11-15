import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour, tourReadingOf } from '../lib/process-tour';
import { readProcess, readRules } from '../lib/first-look';
import { aroundTheMap, runAt } from '../lib/around-the-map';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { readExample } from './helpers/starter-example-files';
import { seedLayoutProject } from './helpers/analyze-layout';
import { signInThroughForm } from './helpers/seed-project';

/**
 * The walk-through on the page — plan `docs/design/analyze-business-first-plan.md` §4.2, AB-4 (N3; mockup states 4, 5
 * and 6; ADR-118). "Walk me through it" runs the tour where the map stands: the card beside the map on a desktop and
 * above it up to 1100 px, the camera moving to each station, the summary stepping aside and "How it runs" saying
 * "you are here". The risk the plan names: the card beside the map narrows the map, and the mockup needed a
 * zoom-to-station fix at 1280 and 1024 px. ADR-025's floor: a station that does not fit at 83 % is scrolled to, never
 * shrunk further.
 *
 * Three halves:
 *
 *   - **pure** — the inline camera (`cameraFor(…, 'inline')`) and the source guards of the page's wiring;
 *   - **server-free render** — the inline tour mounted in a static page with the product's own Tailwind build (as
 *     `tests/process-tour-screens.spec.ts` does): at 1280 × 800 and 1024 × 768, at every station of the 1,000-line
 *     example, the highlighted element stands inside the map (focus-out 0) and the card beside or above it; Back,
 *     Pause, Next and Escape by keyboard;
 *   - **rendered** (`rendered:` in the title; needs the emulators and a server) — a seeded project in Analyze,
 *     Business: the summary steps aside, "you are here", focus back on "Walk me through it".
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OUT = path.join(ROOT, 'tmp', 'analyze-tour-inline', String(process.pid));

function tourOf(file: string) {
  const source = readExample(file).replace(/\r\n/g, '\n');
  const exports = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn: exports.bpmn, technical: exports.technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  return { model, tour: buildProcessTour(guide, model, tourReadingOf(source)) };
}
const BIG = tourOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const PO = tourOf('Z_MM_PO_APPROVAL.abap');

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(OUT, 'node', `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*', 'bpmn-js/lib/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

type Box = { x: number; y: number; width: number; height: number };

/* ------------------------------------------------------------------ pure */

test.describe('the inline camera (pure)', () => {
  test('a station that fits stands in the middle at the reading scale, wholly inside the map', async () => {
    const cameraFor = (await load('components/process-map/TourCanvas.tsx', 'cameraFor')) as unknown as (b: Box, o: object, a: string) => Box;
    const placedBox = (await load('components/process-map/TourCanvas.tsx', 'placedBox')) as unknown as (b: Box, v: Box, o: object) => Box;
    // The map beside a 320 px card at 1280 (about 860 × 512) and above the card at 1024 (about 976 × 491).
    for (const outer of [{ width: 860, height: 512 }, { width: 976, height: 491 }, { width: 342, height: 405 }]) {
      const station = { x: 2400, y: 900, width: 120, height: 80 };
      const view = cameraFor(station, outer, 'inline');
      const box = placedBox(station, view, outer);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(outer.width);
      expect(box.y + box.height).toBeLessThanOrEqual(outer.height);
      expect(box.x + box.width / 2).toBeCloseTo(outer.width / 2, 0);
    }
  });

  test('a large station is shrunk to fit, down to 83 % and never below (ADR-025); beyond that its start is shown', async () => {
    const cameraFor = (await load('components/process-map/TourCanvas.tsx', 'cameraFor')) as unknown as (b: Box, o: object, a: string) => Box;
    const floor = (await load('components/process-map/TourCanvas.tsx', 'STATION_FLOOR')) as unknown as number;
    expect(floor).toBe(0.83);
    const outer = { width: 860, height: 512 };
    // Fits at 90 %: shrunk to fit, inside.
    const medium = { x: 0, y: 0, width: 900, height: 300 };
    const m = cameraFor(medium, outer, 'inline');
    const mScale = outer.width / m.width;
    expect(mScale).toBeLessThan(1);
    expect(mScale).toBeGreaterThanOrEqual(floor);
    expect(medium.width * mScale).toBeLessThanOrEqual(outer.width);
    // Would need 50 %: held at the floor, the station's start (left, top) in view with the padding.
    const large = { x: 1000, y: 200, width: 1600, height: 900 };
    const l = cameraFor(large, outer, 'inline');
    expect(outer.width / l.width).toBeCloseTo(floor, 5);
    expect(l.x).toBeLessThan(large.x);
    expect(large.x - l.x).toBeLessThanOrEqual(30 / floor + 0.001);
    expect(l.y).toBeLessThan(large.y);
    // The overlay's camera is unchanged.
    const side = cameraFor({ x: 2400, y: 900, width: 120, height: 80 }, { width: 1440, height: 760 }, 'side');
    expect(1440 / side.width).toBe(1);
  });
});

test.describe('"you are here" from the tour\'s stations (pure)', () => {
  test('each station of the PO example names a paragraph of "How it runs" by its node or its first line', async () => {
    const source = readExample('Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');
    const proc = readProcess(source);
    const text = aroundTheMap({
      source,
      skeleton: proc.skeleton,
      ruleSet: readRules(source, proc, ENGINE_READS_310_FROM),
      processFacts: proc.facts,
      engineVersion: ENGINE_READS_310_FROM,
      narrative: null,
    });
    // What the page hands `AroundTheMap` (`AnalyzeBusiness`, `here`).
    const found = PO.tour.stations.map((s) => runAt(text.runs, { nodeId: s.id, line: s.anchor?.lineStart ?? null }));
    const named = found.filter((i) => i !== null).length;
    // Measured 13.11.2026; a station the paragraphs do not cover says nothing rather than the wrong place.
    expect(named, `${named} of ${found.length} stations found their paragraph`).toBeGreaterThanOrEqual(Math.ceil(found.length / 2));
    // The order holds: the tour never steps back a paragraph.
    const seen = found.filter((i): i is number => i !== null);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});

test.describe('the page wiring (source guards)', () => {
  const business = read('components/analyze/AnalyzeBusiness.tsx');
  const process = read('components/workspace/WorkspaceProcess.tsx');
  const tour = read('components/workspace/ProcessTour.tsx');
  const inline = tour.slice(tour.indexOf('export function ProcessTourInline'));

  test('in Analyze, Business the tour runs on the page where the map stands, not as a layer over it', () => {
    // Asked for in the map's full screen it runs in full screen's side column instead (ADR-119 (d), 3.2.0).
    expect(process).toMatch(/\{tourOpen && model && codeOnClick && !mapFull \? \(\s*<ProcessTour\s+inline/);
    expect(process).toMatch(/\{tourOpen && model && !codeOnClick \? \(/);
    // Not modal: the page stays readable around it; nothing is portalled or made inert.
    expect(inline).not.toMatch(/useCcModal|createPortal|aria-modal|overflow = 'hidden'/);
    // The card first in the DOM, beside the map from 1101 px, above it below that (N3).
    expect(inline).toContain('min-[1101px]:grid-cols-[minmax(0,1fr)_320px] min-[1281px]:grid-cols-[minmax(0,1fr)_360px]');
    expect(inline.indexOf('data-tour-sheet=""')).toBeLessThan(inline.indexOf('data-tour-inline-map=""'));
    expect(inline).toContain('align="inline"');
  });

  test('keyboard: Back, Pause and Next are buttons; the arrow keys move; Escape closes', () => {
    for (const hook of ['data-tour-back=""', 'data-tour-pause=""', 'data-tour-next=""', 'data-tour-close=""']) expect(inline).toContain(hook);
    expect(inline).toMatch(/event\.key === 'Escape'[\s\S]{0,80}onClose\(\)/);
    expect(inline).toMatch(/event\.key === 'ArrowRight'/);
    expect(inline).toMatch(/event\.key === 'ArrowLeft'/);
    // The title takes the focus at every station.
    expect(inline).toContain('headingRef.current?.focus({ preventScroll: true });');
  });

  test('the summary steps aside, "you are here" follows the station, and the focus returns to "Walk me through it"', () => {
    expect(business).toContain('hidden={touring}');
    expect(business).toMatch(/<AroundTheMap[\s\S]{0,260}here=\{here\}/);
    expect(business).toContain("return station ? { nodeId: station.id, line: station.anchor?.lineStart ?? null } : null;");
    // In the map's full screen to its own "Walk me through it", never to the page behind it (ADR-119 (d)).
    expect(business).toMatch(/if \(wasTouring\.current && !touring\)[\s\S]{0,700}querySelector<HTMLElement>\('\[data-analyze-walk\]'\);\s*target\?\.focus\(\)/);
    expect(business).toContain("full.querySelector<HTMLElement>('[data-map-fullscreen-walk]')");
    // Pause keeps the station; the next "Walk me through it" opens there and says it continues.
    // Moved between full screen and the page, it opens at the station it stood at (ADR-119 (d)).
    expect(process).toContain('const tourFrom = move ? move.at : (pausedAt ?? -1);');
    expect(process).toContain('initialStation={tourFrom}');
    expect(business).toContain("walkState.pausedAt !== null ? wt('abiz.walkContinue') : wt('abiz.walk')");
  });

  test('the demo walks the same way, on its page (O10)', () => {
    const demo = read('components/demo/DemoWalkThrough.tsx');
    expect(demo).toMatch(/<ProcessTour\s+inline/);
    const page = read('components/demo/DemoAnalyzeBusiness.tsx');
    expect(page).toContain('hidden={walkOpen}');
    expect(page).toMatch(/<AroundTheMap[^>]*here=\{here\}/);
  });
});

/* ------------------------------------------------------------ server-free render */

test.describe('the inline card (server-free render)', () => {
  test('the overview, a station and the end: Back, Pause, Next; at the end Back, Close and the endings', async () => {
    const Inline = await load('components/workspace/ProcessTour.tsx', 'ProcessTourInline');
    const endings = React.createElement('div', { 'data-x-endings': '' }, 'THE TWO ENDINGS');
    const over = renderToStaticMarkup(React.createElement(Inline, { tour: PO.tour, model: PO.model, onClose: () => {}, endings }));
    expect(over).toContain('data-tour-at="overview"');
    expect(over).toMatch(/<button[^>]*disabled=""[^>]*data-tour-back=""|<button[^>]*data-tour-back=""[^>]*disabled=""/);
    const at = renderToStaticMarkup(React.createElement(Inline, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: 2, endings }));
    expect(at).toContain('data-tour-at="3"');
    expect(textOf(at)).toContain(`Step 3 of ${PO.tour.stations.length}`);
    expect(textOf(at)).not.toContain('THE TWO ENDINGS');
    const end = renderToStaticMarkup(React.createElement(Inline, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: PO.tour.stations.length, endings }));
    expect(end).toContain('data-tour-at="end"');
    expect(textOf(end)).toContain('That was the process');
    expect(textOf(end)).toContain('You can stop here. Everything stays in your workspace.');
    expect(textOf(end)).toContain('THE TWO ENDINGS');
    expect(end).toContain('data-tour-finish=""');
    expect(end).not.toContain('data-tour-next=""');
    expect(end).not.toContain('data-tour-pause=""');
  });

  test('while the tour is read it says so, and can be closed', async () => {
    const Inline = await load('components/workspace/ProcessTour.tsx', 'ProcessTourInline');
    const html = renderToStaticMarkup(React.createElement(Inline, { tour: null, model: PO.model, onClose: () => {} }));
    expect(html).toContain('data-tour-at="reading"');
    expect(textOf(html)).toContain('Reading the steps out of the code');
    expect(html).toContain('data-tour-close=""');
  });
});

/* --------------------------------------------------- server-free, in a browser */

let pageHtml = '';

async function tailwind(): Promise<string> {
  const { compile } = require('@tailwindcss/node') as typeof import('@tailwindcss/node');
  const { Scanner } = require('@tailwindcss/oxide') as typeof import('@tailwindcss/oxide');
  const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  const compiler = await compile(css, { base: path.join(ROOT, 'app'), onDependency: () => {} });
  const scanner = new Scanner({ sources: [{ base: path.join(ROOT, 'components'), pattern: '**/*.tsx', negated: false }] });
  return compiler.build(scanner.scan());
}

async function harness(): Promise<string> {
  if (pageHtml) return pageHtml;
  fs.mkdirSync(OUT, { recursive: true });
  const link = path.join(OUT, 'next-link.tsx');
  fs.writeFileSync(
    link,
    "import React from 'react';\nexport default function Link({ href, children, ...rest }: { href: string; children?: React.ReactNode }) { return <a href={href} {...rest}>{children}</a>; }\n",
  );
  // The page's part of the contract, as `AnalyzeBusiness` does it: the invitation steps aside while the tour runs, and
  // the focus goes back to it when the tour closes or pauses.
  const entry = [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import ProcessTour from './components/workspace/ProcessTour';",
    'const data = (window as unknown as { __TOUR__: { tour: never; model: never; at: number } }).__TOUR__;',
    'function App() {',
    '  const [open, setOpen] = React.useState(true);',
    '  const [paused, setPaused] = React.useState<number | null>(data.at);',
    '  const was = React.useRef(true);',
    '  React.useEffect(() => { if (was.current && !open) requestAnimationFrame(() => (document.querySelector("[data-analyze-walk]") as HTMLElement | null)?.focus()); was.current = open; }, [open]);',
    '  return (<div>',
    '    {open ? null : <button data-analyze-walk="" onClick={() => setOpen(true)}>Walk me through it</button>}',
    '    {open ? <ProcessTour inline tour={data.tour} model={data.model} initialStation={paused ?? -1} onClose={() => { setPaused(null); setOpen(false); }} onPause={(at: number) => { setPaused(at); setOpen(false); }} endings={<p data-x-endings="">endings</p>} /> : null}',
    '    <div style={{ height: 1600 }} />',
    '  </div>);',
    '}',
    "createRoot(document.getElementById('page')!).render(<App />);",
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
  const inter = fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'inter-latin-variable.woff2')).toString('base64');
  const fontCss = `@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:300 900;font-style:normal;font-display:block}html{font-family:'Inter',sans-serif}`;
  // The page's frame: Analyze's content column has a 24 px gutter on a desktop and 16 px on a phone.
  pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${fontCss}</style><style>${bundleCss}</style><style>main{padding:24px}@media (max-width:600px){main{padding:16px}}</style></head><body style="margin:0;background:var(--cc-page)"><main><h1>Analyze</h1><div id="page"></div></main><script>window.__TOUR__=__DATA__;</script><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
  return pageHtml;
}

async function open(page: Page, which: typeof PO, at: number): Promise<void> {
  const data = JSON.stringify({ tour: which.tour, model: which.model, at }).replace(/</g, '\\u003c');
  await page.setContent((await harness()).replace('__DATA__', () => data), { waitUntil: 'load' });
  await expect(page.locator('[data-process-tour][data-tour-mode="inline"]')).toBeVisible();
  await expect(page.locator('[data-process-tour-map] .djs-container')).toBeVisible({ timeout: 30_000 });
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      element: rect(document.querySelector('[data-process-tour-map] .cc-tour-here .djs-visual')),
      map: rect(document.querySelector('[data-tour-inline-map]')),
      card: rect(document.querySelector('[data-tour-sheet]')),
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
      focused: document.activeElement?.tagName ?? '',
    };
  });
}

const within = (r: { left: number; top: number; right: number; bottom: number }, o: { left: number; top: number; right: number; bottom: number }) =>
  r.left >= o.left - 1 && r.top >= o.top - 1 && r.right <= o.right + 1 && r.bottom <= o.bottom + 1;

/** The two widths the mockup needed the zoom-to-station fix for, and a tablet and a phone with the card above. */
const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800, beside: true },
  { name: '1024', width: 1024, height: 768, beside: false },
  { name: '768', width: 768, height: 1024, beside: false },
  { name: '390', width: 390, height: 844, beside: false },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`the inline tour of the 1,000-line example at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, contextOptions: { reducedMotion: 'reduce' } });

    test('at every station the highlighted element stands inside the map (focus-out 0), the card beside or above it', async ({ page }, info) => {
      test.setTimeout(240_000);
      await open(page, BIG, -1);
      await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'overview');
      const out: string[] = [];
      for (let at = 0; at < BIG.tour.stations.length; at += 1) {
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', String(at + 1));
        await expect(page.locator('[data-process-tour-map] .cc-tour-here')).toHaveAttribute('data-element-id', BIG.tour.stations[at].id);
        await page.waitForTimeout(80);
        const m = await measure(page);
        const title = BIG.tour.stations[at].title;
        if (!m.element || !within(m.element, m.map!)) out.push(`${title}: ${JSON.stringify(m.element)} outside ${JSON.stringify(m.map)}`);
        if (viewport.beside) {
          expect(m.card!.left, `${title}: the card is not beside the map`).toBeGreaterThanOrEqual(m.map!.right - 1);
        } else {
          expect(m.card!.bottom, `${title}: the card is not above the map`).toBeLessThanOrEqual(m.map!.top + 1);
        }
        expect(m.scrollWidth, `${title}: the page scrolls sideways`).toBeLessThanOrEqual(m.width);
        expect(m.focused, `${title}: the focus is not on the card's title`).toBe('H2');
        if (at === Math.floor(BIG.tour.stations.length / 2)) await page.screenshot({ path: info.outputPath(`inline-${viewport.name}-station.png`) });
      }
      expect(out, 'stations whose element left the map').toEqual([]);
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-process-tour]')).toHaveAttribute('data-tour-at', 'end');
      await expect(page.locator('[data-x-endings]')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`inline-${viewport.name}-end.png`) });
    });
  });
}

test.describe('the inline tour by keyboard', () => {
  test.use({ viewport: { width: 1280, height: 800 }, contextOptions: { reducedMotion: 'reduce' } });

  test('Back, Pause and Next by keyboard; Pause and Escape hand the focus back to "Walk me through it"; Pause resumes there', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, PO, -1);
    const tourAt = page.locator('[data-process-tour]');
    await expect(page.locator('[data-tour-back]')).toBeDisabled();
    await page.locator('[data-tour-next]').focus();
    await page.keyboard.press('Enter');
    await expect(tourAt).toHaveAttribute('data-tour-at', '1');
    await page.locator('[data-tour-next]').focus();
    await page.keyboard.press('Enter');
    await expect(tourAt).toHaveAttribute('data-tour-at', '2');
    await page.locator('[data-tour-back]').focus();
    await page.keyboard.press('Enter');
    await expect(tourAt).toHaveAttribute('data-tour-at', '1');
    // Pause: the tour steps aside, the focus is on the invitation, and the tour opens at the same station again.
    await page.locator('[data-tour-pause]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-process-tour]')).toHaveCount(0);
    await expect(page.locator('[data-analyze-walk]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tourAt).toHaveAttribute('data-tour-at', '1');
    // Escape closes from anywhere in the tour; the focus returns to the invitation.
    await page.keyboard.press('ArrowRight');
    await expect(tourAt).toHaveAttribute('data-tour-at', '2');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-process-tour]')).toHaveCount(0);
    await expect(page.locator('[data-analyze-walk]')).toBeFocused();
    // After Escape the next walk starts at the overview.
    await page.keyboard.press('Enter');
    await expect(tourAt).toHaveAttribute('data-tour-at', 'overview');
  });
});

/* ------------------------------------------------------------------ rendered */

test.describe('rendered: the walk-through in Analyze, Business (needs the emulators and a server)', () => {
  test('the summary steps aside, "you are here" follows the station, the last card shows the endings; Escape returns the focus', async ({ page }) => {
    test.setTimeout(360_000);
    const seeded = await seedLayoutProject('ab4-tour');
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    const walk = page.locator('[data-analyze-walk=""]');
    await expect(walk).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-around-the-map="ready"]')).toBeVisible({ timeout: 120_000 });
    await walk.click();
    const tour = page.locator('[data-process-tour][data-tour-mode="inline"]');
    await expect(tour).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-analyze-summary]')).toHaveCount(0);
    await expect(page.locator('[role="dialog"][data-process-tour]')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(tour).toHaveAttribute('data-tour-at', '1');
    await expect(page.locator('[data-around-run-here]')).toHaveCount(1);
    // The station fits at 1280 (focus-out 0).
    const fits = await page.evaluate(() => {
      const el = document.querySelector('[data-process-tour-map] .cc-tour-here .djs-visual')?.getBoundingClientRect();
      const map = document.querySelector('[data-tour-inline-map]')?.getBoundingClientRect();
      return !!el && !!map && el.left >= map.left - 1 && el.right <= map.right + 1 && el.top >= map.top - 1 && el.bottom <= map.bottom + 1;
    });
    expect(fits).toBe(true);
    await page.keyboard.press('Escape');
    await expect(tour).toHaveCount(0);
    await expect(page.locator('[data-analyze-summary]')).toBeVisible();
    await expect(walk).toBeFocused();
    // To the end: the two endings on the last card, both secondary.
    await walk.click();
    const total = await page.locator('[data-tour-dots] i').count();
    for (let i = 0; i <= total; i += 1) await page.keyboard.press('ArrowRight');
    await expect(tour).toHaveAttribute('data-tour-at', 'end');
    await expect(tour.locator('[data-analyze-endings="compact"]')).toBeVisible();
    await expect(tour.locator('[data-analyze-ending-open]').first()).toHaveAttribute('data-cc-button', 'secondary');
  });
});
