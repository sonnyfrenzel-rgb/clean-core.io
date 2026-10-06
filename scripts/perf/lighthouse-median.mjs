#!/usr/bin/env node
/**
 * Lighthouse, several runs per preset, median per metric (docs/perf/REPORT.md).
 *
 *   node scripts/perf/lighthouse-median.mjs <url> <outDir> [runs=3] [label]
 *
 * Runs `npx lighthouse@12` RUNS times with the mobile preset (Lighthouse's
 * default: Moto G Power, simulated slow 4G, 4x CPU) and RUNS times with
 * `--preset=desktop`, keeps every JSON and HTML report in <outDir>, and writes
 * `<outDir>/<label>-summary.json` with the per-run values and the medians.
 * Reports stay out of git; the summary is what the report quotes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [url, outDir, runsArg = '3', label = 'run'] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: lighthouse-median.mjs <url> <outDir> [runs] [label]');
  process.exit(2);
}
const runs = Number(runsArg);
mkdirSync(outDir, { recursive: true });

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function pick(lhr) {
  const a = lhr.audits;
  const items = a['network-requests']?.details?.items ?? [];
  const jsBytes = items.filter((i) => i.resourceType === 'Script').reduce((n, i) => n + (i.transferSize || 0), 0);
  return {
    performance: Math.round((lhr.categories.performance.score ?? 0) * 100),
    fcp: a['first-contentful-paint'].numericValue,
    lcp: a['largest-contentful-paint'].numericValue,
    tbt: a['total-blocking-time'].numericValue,
    cls: a['cumulative-layout-shift'].numericValue,
    si: a['speed-index'].numericValue,
    totalBytes: a['total-byte-weight'].numericValue,
    jsBytes,
    requests: items.length,
  };
}

const summary = {};
for (const preset of ['mobile', 'desktop']) {
  const samples = [];
  for (let i = 1; i <= runs; i++) {
    const base = join(outDir, `${label}-${preset}-${i}`);
    const args = [
      '--yes', 'lighthouse@12', url,
      '--only-categories=performance',
      '--output=json', '--output=html', `--output-path=${base}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ];
    if (preset === 'desktop') args.push('--preset=desktop');
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
    const lhr = JSON.parse(readFileSync(`${base}.report.json`, 'utf8'));
    const s = pick(lhr);
    samples.push(s);
    console.log(preset, i, JSON.stringify(s));
  }
  const keys = Object.keys(samples[0]);
  summary[preset] = {
    median: Object.fromEntries(keys.map((k) => [k, median(samples.map((s) => s[k]))])),
    runs: samples,
  };
}
writeFileSync(join(outDir, `${label}-summary.json`), JSON.stringify({ url, date: new Date().toISOString(), summary }, null, 2));
console.log(JSON.stringify({ mobile: summary.mobile.median, desktop: summary.desktop.median }, null, 2));
