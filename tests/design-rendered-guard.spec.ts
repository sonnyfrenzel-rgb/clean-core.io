import { test, expect, type Page } from '@playwright/test';
import {
  CHECK_IDS,
  CHECK_LABEL,
  ROUTES,
  STEP_PATTERN,
  focusStart,
  freezeEndlessAnimations,
  focusedRing,
  listBaselineFiles,
  measurePage,
  pageSettled,
  ratchetRoute,
  readRouteBaseline,
  validateRouteBaseline,
  writeRouteBaseline,
  type CheckCounts,
  type CheckId,
  type RouteDef,
  type Session,
} from './helpers/design-rendered';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * DESIGN.md as the reader meets it, route by route — Block D, step D.2.
 *
 * The gallery (`/admin/design-system`) has been measured rendered since 1.5:
 * nothing below 11 px, every text above its contrast floor, a ring on every Tab
 * stop, no skipped heading level. That proved the *library*. The product around
 * it — the seven stages, settings, the dashboard, the public pages — was only
 * ever read as source (`design-source-guard`, D.1), and source cannot say what
 * renders: an inherited colour, a class Tailwind never emitted, the branch that
 * decided which heading came first.
 *
 * This spec opens every route of the plan once, waits until it has settled, and
 * counts six things on it (definitions in `tests/helpers/design-rendered.ts`):
 * type < 11 px, text contrast against the colour actually behind it, Tab stops
 * without a visible ring, skipped heading levels, weight > 800, and a state
 * colour with no word beside it. One load per route, every check on that load.
 *
 * It cannot demand zero today, so — like D.1 — it demands *no worse, and
 * progress written down*:
 *
 *   - `tests/design-rendered-baseline/<route>.json` holds today's count per
 *     check as a ceiling, and the step D.x that removes it. A route without a
 *     file has ceiling 0.
 *   - More than the ceiling is red. **Fewer is also red** until the ceiling is
 *     lowered in the same commit — `npm run design:rendered-baseline` (it runs
 *     this spec in writing mode: lowers only, refuses and writes nothing if any
 *     count rose; `-- -c <config>` for another port). D.30 deletes the folder.
 *
 * Waiting: a production build (CI, `npm start`, one worker) is several times
 * faster than `next dev`, and a check that samples during a load passes locally
 * and misses in CI (CLAUDE.md, gotchas). So every route waits for a condition —
 * its content selector, then no skeleton, nothing `aria-busy`, no finite
 * animation running and the DOM unchanged for 750 ms — never for a fixed time.
 * Motion is emulated as reduced, so what is measured is the resting state a
 * reader sees, not a frame of a fade.
 *
 * Needs the emulators (auth, firestore) and a server — dev or production.
 */

const WRITE = process.env.DESIGN_RENDERED_WRITE as 'lower' | 'init' | undefined;
/** Tab stops per route. The first sixty are the shell and the top of the page — where a keyboard user starts. */
const FOCUS_STOPS = 60;
/** The route whose loaded page takes the negative probe. */
const PROBE_ROUTE = 'trust';

test.use({ viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: 'reduce' } });

interface Measured {
  def: RouteDef;
  counts: CheckCounts;
  samples: Partial<Record<CheckId, string[]>>;
  texts: number;
  /** Tab stops the walk reached — none means the walk measured nothing. */
  stops: number;
}

function urlOf(def: RouteDef, projectId: string): string {
  return def.url.replace('{project}', encodeURIComponent(projectId));
}

async function openRoute(page: Page, def: RouteDef, projectId: string): Promise<void> {
  const url = urlOf(def, projectId);
  // A navigation the previous page still had in flight (a router.replace after
  // a profile read, a dev-server reload) can abort this one; that is not the
  // route's doing, so it gets one more go. Any other failure stands.
  const response = await page
    .goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    .catch(async (err: Error) => {
      if (!/ERR_ABORTED|interrupted by another navigation/.test(err.message)) throw err;
      return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    });
  expect(response?.status() ?? 0, `${def.route}: HTTP ${response?.status()}`).toBeLessThan(400);
  for (const selector of def.ready) {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: 90_000 });
  }
  await page.waitForFunction(pageSettled, 750, { polling: 150, timeout: 60_000 });
  await page.evaluate(freezeEndlessAnimations);
  // A client-side `notFound()` answers 200 and renders an h1 of its own; its
  // numbers would stand in for the route's.
  expect(
    await page.locator('h1', { hasText: /^\s*404\s*$/ }).count(),
    `${def.route}: the page rendered "404" — the session cannot see it`,
  ).toBe(0);
}

async function walkFocus(page: Page): Promise<{ count: number; samples: string[]; stops: number }> {
  await page.evaluate(focusStart);
  const samples: string[] = [];
  let count = 0;
  let stops = 0;
  for (let i = 0; i < FOCUS_STOPS; i++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(focusedRing);
    if (!ring) continue;
    if (ring.again) break; // round the page once
    stops += 1;
    if (ring.ringless) {
      count += 1;
      if (samples.length < 12) samples.push(ring.what);
    }
  }
  return { count, samples, stops };
}

async function measureRoute(page: Page, def: RouteDef): Promise<Measured> {
  // The one-pass measurement first, on the page as loaded and scrolled to the
  // top: the Tab walk scrolls, and a scroll can show or hide an element (a
  // sticky bar, an in-view reveal), which would make the counts depend on
  // where the walk happened to stop.
  const m = await page.evaluate(measurePage, 12);
  const focus = await walkFocus(page);
  return {
    def,
    counts: { ...m.counts, focus: focus.count },
    samples: { ...m.samples, focus: focus.samples },
    texts: m.texts,
    stops: focus.stops,
  };
}

function ceilingsOf(def: RouteDef): CheckCounts {
  return readRouteBaseline(def.key)?.ceilings ?? {};
}

function table(results: Measured[]): string {
  const head = ['route'.padEnd(34), ...CHECK_IDS.map((c) => c.padStart(11)), 'texts'.padStart(8), 'stops'.padStart(7)].join('');
  const rows = results.map((r) =>
    [
      r.def.route.padEnd(34),
      ...CHECK_IDS.map((c) => String(r.counts[c] ?? 0).padStart(11)),
      String(r.texts).padStart(8),
      String(r.stops).padStart(7),
    ].join(''),
  );
  return [head, ...rows].join('\n');
}

/**
 * The negative probe: one element per check, built into the loaded page, and
 * each of the six must now stand above its ceiling. Proves the measurement and
 * the ratchet on a real page — a check that stopped seeing would pass as clean.
 */
async function probe(page: Page, measured: Measured): Promise<void> {
  await page.evaluate(() => {
    const host = document.createElement('section');
    host.setAttribute('data-d2-probe', '');
    host.innerHTML = [
      '<h2>Probe outline</h2><h4>A level skipped</h4>',
      '<p style="font-size:10px">A line at ten pixels</p>',
      '<p style="color:#c8c8c8;background:#ffffff">Pale grey on white</p>',
      '<p style="font-weight:900">Black weight</p>',
      '<div><div><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:#16a34a"></span></div></div>',
    ].join('');
    document.body.appendChild(host);
    const bare = document.createElement('button');
    bare.textContent = 'Probe without a ring';
    bare.style.cssText = 'outline: none !important; box-shadow: none !important;';
    document.body.prepend(bare);
  });
  const again = await measureRoute(page, measured.def);
  // Against the page as it measured a moment ago — a route that stands at its
  // ceiling, which is what every green route does. (Against the file, a ceiling
  // left too high would swallow the probe and blame it for the wrong thing.)
  const findings = ratchetRoute(measured.def, again.counts, measured.counts);
  const over = findings.filter((f) => f.kind === 'over').map((f) => f.check).sort();
  expect(over, `the probe on ${measured.def.route} did not turn every check red:\n${table([measured, again])}`).toEqual(
    [...CHECK_IDS].sort(),
  );
  // And the 10-px line alone, as the plan asks: exactly one more "small".
  expect((again.counts.small ?? 0) - (measured.counts.small ?? 0)).toBe(1);
}

/** Checks, writes or reports one session's routes. */
function judge(session: Session, results: Measured[]): void {
  console.log(`\ndesign-rendered-guard · ${session}\n${table(results)}\n`);
  for (const r of results) {
    expect(r.texts, `${r.def.route}: nothing measured — the page did not render`).toBeGreaterThan(10);
    expect(r.stops, `${r.def.route}: the Tab walk reached nothing`).toBeGreaterThan(2);
  }

  if (WRITE) {
    const rises: string[] = [];
    const writes: { def: RouteDef; step: string; counts: CheckCounts }[] = [];
    for (const r of results) {
      const current = readRouteBaseline(r.def.key);
      if (!current) {
        if (WRITE !== 'init') {
          const any = CHECK_IDS.some((c) => (r.counts[c] ?? 0) > 0);
          if (any) rises.push(`${r.def.route}: no ceilings on file and counts above 0 — a route has no exception unless the coordinator admits it (init)`);
          continue;
        }
        writes.push({ def: r.def, step: r.def.step, counts: r.counts });
        continue;
      }
      const lowered: CheckCounts = {};
      for (const c of CHECK_IDS) {
        const n = r.counts[c] ?? 0;
        const ceiling = current.ceilings[c] ?? 0;
        if (n > ceiling) rises.push(`${r.def.route}: ${CHECK_LABEL[c]} rose ${ceiling} -> ${n}\n    ${(r.samples[c] ?? []).slice(0, 5).join('\n    ')}`);
        lowered[c] = Math.min(n, ceiling);
      }
      writes.push({ def: r.def, step: current.step, counts: lowered });
    }
    // All or nothing, like `design:baseline`: a rise writes no file at all.
    expect(rises, 'A count rose above its ceiling. Fix the page; ceilings are never raised. Nothing was written.').toEqual([]);
    for (const w of writes) writeRouteBaseline(w.def, w.step, w.counts);
    return;
  }

  const over: string[] = [];
  const under: string[] = [];
  for (const r of results) {
    for (const f of ratchetRoute(r.def, r.counts, ceilingsOf(r.def))) {
      if (f.kind === 'over') over.push(`${f.message}\n    ${(r.samples[f.check] ?? []).join('\n    ')}`);
      else under.push(f.message);
    }
  }
  expect.soft(
    over,
    'A route got worse. Replace the element with the design-system equivalent (block-d-plan.md §4); ceilings are never raised.',
  ).toEqual([]);
  expect.soft(under, 'Fewer than the ceiling — good. Lower it in the same commit: npm run design:rendered-baseline.').toEqual([]);
}

test.describe('design rendered guard (DESIGN.md on every route, ratchet)', () => {
  test('every ceiling file names a route of the walk, a step, and known checks', () => {
    const problems: string[] = [];
    for (const fileName of listBaselineFiles()) {
      const def = ROUTES.find((r) => `${r.key}.json` === fileName);
      const data = readRouteBaseline(fileName.replace(/\.json$/, ''));
      if (!def || !data) {
        problems.push(`${fileName}: no route in ROUTES has this key`);
        continue;
      }
      problems.push(...validateRouteBaseline(fileName, data));
    }
    expect(problems).toEqual([]);
    for (const r of ROUTES) expect(STEP_PATTERN.test(r.step), `${r.key}: step ${r.step}`).toBe(true);
    expect(new Set(ROUTES.map((r) => r.key)).size, 'two routes share a key').toBe(ROUTES.length);
  });

  test('public routes, signed out', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    const results: Measured[] = [];
    for (const def of ROUTES.filter((r) => r.session === 'public')) {
      await openRoute(page, def, '');
      const measured = await measureRoute(page, def);
      results.push(measured);
      if (def.key === PROBE_ROUTE && !WRITE) await probe(page, measured);
    }
    judge('public', results);
  });

  test.describe('signed in', () => {
    let account = { email: '', password: '' };
    let projectId = '';

    test.beforeAll(async () => {
      test.setTimeout(120 * 1000);
      const seeded = await seedStageProject({ prefix: 'rendered-guard', admin: true, acceptTerms: true, rich: true });
      account = { email: seeded.email, password: seeded.password };
      projectId = seeded.projectId;
    });

    test('signed-in routes: settings, admin, dashboard, the workspace in three views, the seven stages', async ({ page }) => {
      test.setTimeout(15 * 60 * 1000);
      await signInThroughForm(page, account);
      const results: Measured[] = [];
      for (const def of ROUTES.filter((r) => r.session === 'signed-in')) {
        await openRoute(page, def, projectId);
        // A card over the page would be measured instead of the page.
        expect(await page.locator('[data-terms-gate]').count(), `${def.route}: the Terms card is on screen`).toBe(0);
        results.push(await measureRoute(page, def));
      }
      judge('signed-in', results);
    });
  });
});
