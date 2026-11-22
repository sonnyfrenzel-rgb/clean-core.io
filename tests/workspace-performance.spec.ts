import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { sha256Hex } from '../lib/artefact-digest';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * 3.3.0, step 4 (ADR-123 (5)): how fast My workspace stands — measured, not
 * asserted, so the same spec runs against the release before (copied into a
 * checkout of it) and this one, and the two can be compared.
 *
 * Per state (a new account; a returning account with five programs) and width
 * (1440, 390), three loads of `/dashboard` in one tab (the first cold):
 *   - `fcp`    — first contentful paint, ms from navigation start;
 *   - `tiles`  — when the first program tile, table row, phone card or start
 *                card is in the page;
 *   - `quiet`  — `tiles` or the end of the last long task, whichever is later:
 *                when the page answers a click without delay (interactive);
 *   - `tbt`    — total blocking time of the long tasks (> 50 ms);
 *   - `cls`    — cumulative layout shift as the web-vitals define it: shifts
 *                without recent input, grouped into session windows (a gap of
 *                at most 1 s, a window of at most 5 s), the largest window
 *                (QA review 03a0ca726c01);
 *   - `scriptKb` — JavaScript transferred over the network (`transferSize`; a
 *                script from the cache counts 0, and `scriptTransferUnknown`
 *                counts the scripts whose transfer size the browser withholds,
 *                QA review f9ba67e85085); `scriptKbEncoded` and
 *                `scriptKbDecoded` — their size compressed and unpacked, cached
 *                or not; `bpmnJs` — whether bpmn-js loaded.
 * Written to `test-results/workspace-performance-<PERF_LABEL>.json`.
 *
 * Meaningful only on a production build (`CI=1`, Playwright runs `npm start`).
 * Seeded programs carry no project summary, so both releases read the same
 * documents — the tiles then show "Map after the next run" in place of a map.
 */

const ROOT = path.resolve(__dirname, '..');
const LABEL = process.env.PERF_LABEL || 'run';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
const PASSWORD = 'Perf330!x';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function account(kind: string): Promise<{ email: string; uid: string }> {
  const email = `ws330-perf-${kind}-${stamp}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Mara', lastName: 'Perf', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 2, transformationsLimit: 5, createdAt: new Date(),
  });
  return { email, uid: cred.user.uid };
}

async function seed(uid: string) {
  const files = ['Z_MM_PO_APPROVAL.abap', 'Z_SD_FREIGHT_RATE_CHECK.abap', 'Z_SD_DELIVERY_PRIORITY.abap', 'Z_MATERIAL_STOCK_CALC.txt', 'Z_INVOICE_EXTRACTOR.txt'];
  for (const [i, file] of files.entries()) {
    const source = read(`public/starter-examples/${file}`);
    await adminSetDoc('projects', `perf-${i}-${stamp}`, {
      name: file.replace(/\.\w+$/, ''), status: 'analyzed', userId: uid, legacyCode: source,
      createdAt: new Date(Date.now() - (10 + i) * 86400_000), updatedAt: new Date(Date.now() - i * 86400_000),
      fromExample: true, activeRunId: `run-perf-${i}`, s4Deployment: 'private',
      auditMetadata: { inputFingerprint: { sha256: sha256Hex(source), fileName: file, lineCount: source.split('\n').length } },
    });
  }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __p: { cls: number; win: number; winStart: number; winLast: number; tiles: number | null; longEnd: number; tbt: number; bpmn: boolean } };
    w.__p = { cls: 0, win: 0, winStart: -Infinity, winLast: -Infinity, tiles: null, longEnd: 0, tbt: 0, bpmn: false };
    try {
      // Session windows as web-vitals computes CLS: a shift more than 1 s after the last one, or more than 5 s after
      // the window began, opens a new window; CLS is the largest window.
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number; startTime: number }>) {
          if (e.hadRecentInput) continue;
          const p = w.__p;
          if (e.startTime - p.winLast > 1000 || e.startTime - p.winStart > 5000) {
            p.win = 0;
            p.winStart = e.startTime;
          }
          p.win += e.value;
          p.winLast = e.startTime;
          p.cls = Math.max(p.cls, p.win);
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          w.__p.longEnd = Math.max(w.__p.longEnd, e.startTime + e.duration);
          w.__p.tbt += Math.max(0, e.duration - 50);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* not supported */
    }
    new MutationObserver(() => {
      if (w.__p.tiles === null && document.querySelector('[data-program-tile], [data-workspace-projects] tbody tr, [data-workspace-card], [data-home-start], [data-home-product]')) {
        w.__p.tiles = performance.now();
      }
      if (document.querySelector('.djs-container')) w.__p.bpmn = true;
    }).observe(document, { childList: true, subtree: true });
  });
}

async function loadOnce(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-program-tile], [data-workspace-projects] tbody tr, [data-workspace-card], [data-home-start], [data-home-product]').first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const w = window as unknown as { __p: { cls: number; tiles: number | null; longEnd: number; tbt: number; bpmn: boolean } };
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    const scripts = performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script') as PerformanceResourceTiming[];
    const tiles = w.__p.tiles === null ? null : Math.round(w.__p.tiles);
    return {
      fcp: paint ? Math.round(paint.startTime) : null,
      tiles,
      quiet: tiles === null ? null : Math.round(Math.max(tiles, w.__p.longEnd)),
      tbt: Math.round(w.__p.tbt),
      cls: Math.round(w.__p.cls * 10000) / 10000,
      scriptKb: Math.round(scripts.reduce((n, s) => n + (s.transferSize || 0), 0) / 1024),
      // A cross-origin script without Timing-Allow-Origin reports 0 for every size: neither cached nor transferred.
      scriptTransferUnknown: scripts.filter((s) => s.transferSize === 0 && s.encodedBodySize === 0 && s.decodedBodySize === 0).length,
      scriptKbEncoded: Math.round(scripts.reduce((n, s) => n + (s.encodedBodySize || 0), 0) / 1024),
      scriptKbDecoded: Math.round(scripts.reduce((n, s) => n + (s.decodedBodySize || 0), 0) / 1024),
      bpmnJs: w.__p.bpmn || scripts.some((s) => /bpmn/i.test(s.name)),
    };
  });
}

const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });

for (const state of ['new', 'returning'] as const) {
  test(`${state} account: three loads at 1440 and at 390`, async ({ browser }) => {
    test.setTimeout(600_000);
    const { email, uid } = await account(state);
    if (state === 'returning') await seed(uid);
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const context = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await context.newPage();
      await signInViaLanding(page, email, PASSWORD);
      await instrument(page);
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await loadOnce(page));
      results[`${state}-${w}`] = runs;
      await context.close();
    }
    const out = path.join(ROOT, 'test-results', `workspace-performance-${LABEL}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ label: LABEL, build: process.env.CI ? 'production' : 'dev', at: new Date().toISOString(), results }, null, 2));
  });
}
