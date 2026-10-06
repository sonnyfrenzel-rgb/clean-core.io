/**
 * Load timings of the signed-in product: the workspace and three stage tools of
 * one populated project (docs/perf/REPORT.md).
 *
 * Every visit is a fresh tab in the same signed-in context, with the HTTP cache
 * disabled through the DevTools protocol and the CPU throttled 4x, so each run
 * downloads and parses every chunk again — the first visit of a reader, not the
 * tenth. "Ready" is the moment the page's own content is in the DOM:
 * `[data-workspace-shell]` for the workspace, `[data-stage-title]` for a stage.
 * Each route is opened RUNS times; the medians go to PERF_OUT (JSON).
 */
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { seedStageProject, signInThroughForm } from '../../tests/helpers/seed-project';

const RUNS = Number(process.env.PERF_RUNS || 5);
const OUT = process.env.PERF_OUT || 'perf-app.json';

interface Sample {
  ttfb: number;
  fcp: number;
  lcp: number;
  ready: number;
  dcl: number;
  load: number;
  jsBytes: number;
  jsFiles: number;
  totalBytes: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

test('signed-in load timings', async ({ browser }) => {
  const account = await seedStageProject({ prefix: 'perf', acceptTerms: true, rich: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const first = await context.newPage();
  await signInThroughForm(first, account);
  await first.close();

  const routes: Array<{ name: string; path: string; ready: string }> = [
    { name: 'dashboard', path: '/dashboard', ready: '[data-cc-workspace]' },
    { name: 'workspace', path: `/project/${account.projectId}?view=business`, ready: '[data-workspace-shell]' },
    { name: 'analyze', path: `/project/${account.projectId}/analyze`, ready: '[data-stage-title]' },
    { name: 'design', path: `/project/${account.projectId}/design`, ready: '[data-stage-title]' },
    { name: 'testing', path: `/project/${account.projectId}/testing`, ready: '[data-stage-title]' },
  ];

  const result: Record<string, { median: Sample; runs: Sample[] }> = {};
  for (const route of routes) {
    const runs: Sample[] = [];
    // One warm-up visit per route so the server has rendered it once (route
    // compilation and data caches are the server's, not the reader's).
    for (let i = 0; i < RUNS + 1; i++) {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.addInitScript((selector: string) => {
        const w = window as unknown as { __perf: { lcp: number; fcp: number; ready: number } };
        w.__perf = { lcp: 0, fcp: 0, ready: 0 };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.__perf.lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') w.__perf.fcp = e.startTime;
        }).observe({ type: 'paint', buffered: true });
        const check = () => {
          if (!w.__perf.ready && document.querySelector(selector)) w.__perf.ready = performance.now();
        };
        new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
      }, route.ready);
      await page.goto(route.path, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForSelector(route.ready, { timeout: 120_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
      const sample = await page.evaluate(() => {
        const w = window as unknown as { __perf: { lcp: number; fcp: number; ready: number } };
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
        return {
          ttfb: nav.responseStart,
          fcp: w.__perf.fcp,
          lcp: w.__perf.lcp,
          ready: w.__perf.ready,
          dcl: nav.domContentLoadedEventEnd,
          load: nav.loadEventEnd,
          jsBytes: js.reduce((n, r) => n + r.transferSize, 0),
          jsFiles: js.length,
          totalBytes: nav.transferSize + res.reduce((n, r) => n + r.transferSize, 0),
        };
      });
      await page.close();
      if (i > 0) runs.push(sample);
    }
    const keys = Object.keys(runs[0]) as Array<keyof Sample>;
    const med = Object.fromEntries(keys.map((k) => [k, Math.round(median(runs.map((r) => r[k])))])) as unknown as Sample;
    result[route.name] = { median: med, runs };
    console.log(route.name, JSON.stringify(med));
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  await context.close();
});
