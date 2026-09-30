import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CHECK_IDS,
  CHECK_LABEL,
  ROUTES,
  focusStart,
  freezeEndlessAnimations,
  focusedRing,
  measurePage,
  pageSettled,
  roseFrom,
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
 * It demands zero, on every route, for every check (D.30). From D.2 to D.30 it
 * demanded *no worse, and progress written down*: a ceiling per route and check
 * in `tests/design-rendered-baseline/`, lowered step by step. The last ceiling
 * went with D.30 and so did the folder and its writing mode; a route that
 * counts anything is red, and the fix is in the page, never in a list.
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

/** Tab stops per route. The first sixty are the shell and the top of the page — where a keyboard user starts. */
const FOCUS_STOPS = 60;
/** The route whose loaded page takes the negative probe. */
const PROBE_ROUTE = 'trust';

test.use({ viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: 'reduce' } });

interface Measured {
  def: RouteDef;
  counts: Partial<Record<CheckId, number>>;
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
 * each of the six must now count more than it did a moment ago. Proves the
 * measurement on a real page — a check that stopped seeing would pass as clean.
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
  // Against the page as it measured a moment ago, not against zero: the probe
  // must prove each check sees its own element, whatever else the page holds.
  const over = [...roseFrom(measured.counts, again.counts)].sort();
  expect(over, `the probe on ${measured.def.route} did not turn every check red:\n${table([measured, again])}`).toEqual(
    [...CHECK_IDS].sort(),
  );
  // And the 10-px line alone, as the plan asks: exactly one more "small".
  expect((again.counts.small ?? 0) - (measured.counts.small ?? 0)).toBe(1);
}

/** Checks one session's routes: every count is zero. */
function judge(session: Session, results: Measured[]): void {
  console.log(`\ndesign-rendered-guard · ${session}\n${table(results)}\n`);
  for (const r of results) {
    expect(r.texts, `${r.def.route}: nothing measured — the page did not render`).toBeGreaterThan(10);
    expect(r.stops, `${r.def.route}: the Tab walk reached nothing`).toBeGreaterThan(2);
  }
  const found: string[] = [];
  for (const r of results) {
    for (const c of CHECK_IDS) {
      const n = r.counts[c] ?? 0;
      if (n > 0) found.push(`${r.def.route}: ${CHECK_LABEL[c]} ${n}\n    ${(r.samples[c] ?? []).join('\n    ')}`);
    }
  }
  expect(
    found,
    'A route breaks DESIGN.md. Replace the element with the design-system equivalent (block-d-plan.md §4); there is no exception list.',
  ).toEqual([]);
}

test.describe('design rendered guard (DESIGN.md on every route, zero)', () => {
  test('the walk covers both sessions, and no ceiling list has come back', () => {
    expect(new Set(ROUTES.map((r) => r.key)).size, 'two routes share a key').toBe(ROUTES.length);
    expect(ROUTES.some((r) => r.session === 'public')).toBe(true);
    expect(ROUTES.some((r) => r.session === 'signed-in')).toBe(true);
    expect(ROUTES.some((r) => r.key === PROBE_ROUTE && r.session === 'public'), 'the probe route is not walked').toBe(true);
    // D.30 deleted the per-route ceilings. A folder of them coming back would
    // be an exception list the spec no longer reads — green for the wrong reason.
    const folder = path.resolve(__dirname, 'design-rendered-baseline');
    expect(fs.existsSync(folder), `${folder} exists — there are no ceilings since D.30; fix the page instead`).toBe(false);
  });

  // QA f8887638a04b, 0564882579db: the two checks on fixtures whose answer is
  // known, so a measurement that goes blind again is red here and not quietly
  // green on every route.
  test('contrast applies opacity above 0.5 to the text, and a shadow the element always wears is no focus ring', async ({ page }) => {
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; background: #ffffff; font: 16px/1.5 sans-serif; }
      button { font: inherit; margin: 8px; padding: 8px; border: 1px solid #555; background: #fff; color: #111; outline: none; }
      .decor { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
      .ring:focus-visible { box-shadow: 0 0 0 3px #2563eb; }
      .decor-ring { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
      .decor-ring:focus-visible { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 3px #2563eb; }
      .outlined { outline: 2px solid #2563eb; }
      .outline-on-focus:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
      .tw-none { box-shadow: 0 0 #0000, 0 0 #0000; }
    </style></head><body>
      <p data-case="control" style="color:#595959">Grey text at full strength</p>
      <p data-case="faded-self" style="color:#595959;opacity:0.6">Grey text faded on itself</p>
      <div style="opacity:0.6"><p data-case="faded-parent" style="color:#595959">Grey text faded by its card</p></div>
      <div style="opacity:0.6"><button disabled style="color:#595959">Disabled action, exempt</button></div>
      <button class="decor">Decoration only</button>
      <button class="ring">Ring on focus</button>
      <button class="decor-ring">Decoration plus ring</button>
      <button class="outlined">Outline always</button>
      <button class="outline-on-focus">Outline on focus</button>
      <button class="tw-none">Transparent ring</button>
    </body></html>`);

    const m = await page.evaluate(measurePage, 12);
    expect(m.counts.contrast, m.samples.contrast.join('\n')).toBe(2);
    expect(m.samples.contrast.join('\n')).toContain('faded on itself');
    expect(m.samples.contrast.join('\n')).toContain('faded by its card');

    await page.evaluate(focusStart);
    const ringless: Record<string, boolean> = {};
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(focusedRing);
      expect(ring, `Tab ${i + 1} reached nothing`).not.toBeNull();
      ringless[ring!.what.match(/> "([^"]+)"/)![1]] = ring!.ringless;
    }
    expect(ringless).toEqual({
      'Decoration only': true,
      'Ring on focus': false,
      'Decoration plus ring': false,
      'Outline always': true,
      'Outline on focus': false,
      'Transparent ring': true,
    });
  });

  test('public routes, signed out', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    const results: Measured[] = [];
    for (const def of ROUTES.filter((r) => r.session === 'public')) {
      await openRoute(page, def, '');
      const measured = await measureRoute(page, def);
      results.push(measured);
      if (def.key === PROBE_ROUTE) await probe(page, measured);
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
