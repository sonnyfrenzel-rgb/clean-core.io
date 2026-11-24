import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { initialCostAssumptions, takeOverPatch } from '../components/tco/OptionComparison';
import { proposeEffort, proposeMaintenanceBaseline, type CostAssumptions } from '../lib/cost-assumptions';

/**
 * The Economics object page (ADR-128), rendered in a browser without a server: the page the project's tool and the
 * demo share (`components/tco/EconomicsObjectPage.tsx`, through `DemoEconomics`), with the app's own Tailwind build.
 * What it holds: the answer card and its four facets above the fold at 1440 × 900 (the mock-up's measurement), the
 * "On this page" bar under it, no sideways scroll at 390 px, and the folds closed until asked for. Screenshots go to
 * `test-results/economics-page/` for a person to look at.
 */
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'economics-page', String(process.pid));
const SHOTS = path.resolve(ROOT, 'test-results', 'economics-page');
const LOC = 552;
const SCORE = 40;

let html = '';

async function tailwind(): Promise<string> {
  const { compile } = require('@tailwindcss/node') as typeof import('@tailwindcss/node');
  const { Scanner } = require('@tailwindcss/oxide') as typeof import('@tailwindcss/oxide');
  const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  const compiler = await compile(css, { base: path.join(ROOT, 'app'), onDependency: () => {} });
  const scanner = new Scanner({ sources: [{ base: path.join(ROOT, 'components'), pattern: '**/*.tsx', negated: false }] });
  return compiler.build(scanner.scan());
}

async function harness(): Promise<string> {
  if (html) return html;
  fs.mkdirSync(OUT, { recursive: true });
  const link = path.join(OUT, 'next-link.tsx');
  fs.writeFileSync(
    link,
    "import React from 'react';\nexport default function Link({ href, children, ...rest }: { href: string; children?: React.ReactNode }) { return <a href={href} {...rest}>{children}</a>; }\n",
  );
  const entry = [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import DemoEconomics from './components/tco/DemoEconomics';",
    'const data = (window as unknown as { __ECON__: { value: never; loc: number; score: number } }).__ECON__;',
    'function App() {',
    '  const [value, setValue] = React.useState(data.value);',
    "  return <div data-economics=''><DemoEconomics loc={data.loc} scoreBefore={data.score} route='In-App (ABAP Cloud)' value={value} onChange={setValue} /></div>;",
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
  const css = await tailwind();
  const inter = fs.readFileSync(path.join(ROOT, 'app', 'fonts', 'inter-latin-variable.woff2')).toString('base64');
  const fontCss = `@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:300 900;font-style:normal;font-display:block}html{font-family:'Inter',sans-serif}`;
  // The tool frame: 1536 px wide (ADR-140), a 32/24/16 px gutter, the header's space for the bar's sticky top.
  html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${fontCss}</style><style>main{max-width:1536px;margin:0 auto;padding:24px 32px}@media (max-width:1024px){main{padding:24px}}@media (max-width:640px){main{padding:16px}}</style></head><body class="cc" style="margin:0;background:var(--cc-page)"><main><div style="height:150px" data-header-space=""></div><div id="page"></div></main><script>window.__ECON__=__DATA__;</script><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
  return html;
}

/** The mock-up's "priced" state: EUR, 1,000 and 700 a day, 5 years, 2 releases a year, every proposal taken over. */
function priced(): CostAssumptions {
  const base: CostAssumptions = { ...initialCostAssumptions(), currency: 'EUR', devDayRate: 1000, testDayRate: 700, horizonYears: 5, releaseCadence: { perYear: 2, confirmed: true } };
  const proposals = { effort: proposeEffort(LOC), baseline: proposeMaintenanceBaseline(LOC, SCORE) };
  return {
    ...base,
    options: base.options.map((o) => {
      const p = { ...o, ...takeOverPatch(o, proposals) };
      return o.kind === 'do-nothing' ? { ...p, upgradeDelay: { state: 'stated' as const, value: { releasesDeferred: 0 } } } : p;
    }),
  };
}

async function open(page: Page, value: CostAssumptions | null, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const data = JSON.stringify({ value, loc: LOC, score: SCORE }).replace(/</g, '\\u003c');
  await page.setContent((await harness()).replace('__DATA__', () => data), { waitUntil: 'load' });
  await expect(page.locator('[data-economics-page]')).toBeVisible();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('the Economics object page, rendered', () => {
  test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

  test('first visit: the answer says what is missing, the chart shows days, no amount anywhere', async ({ page }) => {
    await open(page, null, 1440, 900);
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'first-visit');
    await expect(page.locator('[data-economics-answer]')).toContainText('Not determined yet');
    // 3.5.1 (ADR-144): one primary action fills what is missing with typical values; stating your own stays one click away.
    await expect(page.locator('[data-answer-next] [data-economics-use-typical]')).toBeInViewport();
    await expect(page.locator('[data-economics-own-figures]')).toBeVisible();
    await expect(page.locator('[data-economics-chart="not-priced"] [data-economics-chart-days]')).toHaveCount(4);
    await expect(page.locator('[data-cost-option-total]')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'first-1440.png'), fullPage: true });
  });

  test('priced at 1440: answer, four facets and the chart above the fold; the bar under the answer', async ({ page }) => {
    await open(page, priced(), 1440, 900);
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'priced');
    await expect(page.locator('[data-economics-answer]')).toContainText('Keeping it costs about EUR 30,000 over 5 years.');
    await expect(page.locator('[data-facet]')).toHaveCount(4);
    for (const id of ['keep', 'keeps', 'lowest', 'assumptions']) await expect(page.locator(`[data-facet="${id}"]`)).toBeInViewport();
    const card = await page.locator('[data-answer-card]').boundingBox();
    const bar = await page.locator('[data-economics-anchors]').boundingBox();
    expect(bar!.y).toBeGreaterThan(card!.y + card!.height - 1);
    await expect(page.locator('[data-economics-anchor]')).toHaveCount(5);
    await expect(page.locator('[data-economics-chart="priced"] [data-economics-chart-row]')).toHaveCount(4);
    // The folds are closed until asked for (3.5.1: How firm is one of them).
    for (const id of ['economics-firm', 'economics-effort', 'economics-how']) await expect(page.locator(`#${id}`)).toHaveAttribute('data-economics-fold', 'closed');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'priced-1440-fold.png') });
    await page.screenshot({ path: path.join(SHOTS, 'priced-1440.png'), fullPage: true });
  });

  test('the assumptions open in place, and every figure moves as you type', async ({ page }) => {
    await open(page, priced(), 1440, 900);
    await page.locator('[data-facet="assumptions"]').click();
    await expect(page.locator('[data-economics-assumptions="open"]')).toBeVisible();
    const before = await page.locator('[data-economics-answer]').innerText();
    await page.locator('[data-cost-field="dev-day-rate"]').fill('2000');
    await expect(page.locator('[data-economics-answer]')).not.toHaveText(before);
    await page.screenshot({ path: path.join(SHOTS, 'priced-1440-editing.png') });
  });

  test('one click: typical assumptions price all four options, each marked typical, then the way on', async ({ page }) => {
    await open(page, null, 1440, 900);
    await page.locator('[data-economics-use-typical]').click();
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'priced');
    await expect(page.locator('[data-economics-chart="priced"] [data-economics-chart-row]')).toHaveCount(4);
    await expect(page.locator('[data-economics-assumption-state="typical"]')).toHaveCount(5);
    await expect(page.locator('[data-facet="assumptions"]')).toContainText('typical assumption');
    await expect(page.locator('[data-answer-card]')).toContainText('not your own figures');
    await expect(page.locator('[data-economics-rest="typical"]')).toContainText('Currency EUR');
    await page.screenshot({ path: path.join(SHOTS, 'typical-1440.png'), fullPage: true });
    // Changing one in place makes it the reader's: its mark goes, the others stay.
    await page.locator('[data-facet="assumptions"]').click();
    await page.locator('[data-cost-field="dev-day-rate"]').fill('1200');
    await expect(page.locator('[data-economics-assumption="dev-day-rate"]')).toHaveAttribute('data-economics-assumption-state', 'stated');
    await expect(page.locator('[data-economics-assumption-state="typical"]')).toHaveCount(4);
    // The effort cards say typical, not "Yours".
    await page.locator('[data-economics-anchor="effort"]').click();
    for (const id of ['do-nothing', 'rebuild', 'standard', 'retire']) {
      await expect(page.locator(`[data-cost-option="${id}"]`)).toHaveAttribute('data-effort-provenance', 'typical');
    }
  });

  test('the anchor bar opens a fold it jumps to', async ({ page }) => {
    await open(page, priced(), 1440, 900);
    await page.locator('[data-economics-anchor="effort"]').click();
    await expect(page.locator('#economics-effort')).toHaveAttribute('data-economics-fold', 'open');
    await expect(page.locator('[data-cost-option]')).toHaveCount(4);
  });

  test('at 390 px: nothing scrolls sideways, open or closed', async ({ page }) => {
    await open(page, priced(), 390, 844);
    expect(await overflow(page), 'priced').toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'priced-390.png'), fullPage: true });
    await page.locator('[data-facet="assumptions"]').click();
    await page.locator('[data-economics-anchor="effort"]').click();
    expect(await overflow(page), 'with the editor and the effort open').toBeLessThanOrEqual(0);
    await open(page, null, 390, 844);
    expect(await overflow(page), 'first visit').toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'first-390.png'), fullPage: true });
  });
});
