import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';
import { readSource, readTableAccess } from '../lib/first-look';
import { firstLookExcerpt } from '../lib/first-look-excerpt';
import { START_NARRATIVE_CEILING_MS } from '../lib/model-stages';
import {
  BUILD_UP_BUDGET,
  BUILD_UP_MAP_WAIT,
  BUILD_UP_MAP_WAIT_WITH_MODEL,
  BUILD_UP_MIN_STEP,
  BUILD_UP_STAGES,
  BUILD_UP_WINDOW,
  buildUpEvents,
  buildUpStageSpan,
  excerptFrame,
  grownCount,
  revealedCount,
  settleProgress,
} from '../lib/first-look-buildup';

/**
 * The pace of the first look's build-up — owner, 03.10.2026 (translated): "The
 * first steps must take a bit longer and create more wow effect, so that a
 * user who uses Clean-Core for the first time sees everything that happens —
 * but not too long either. … today the user is somewhat overwhelmed." ADR-072,
 * amended the same day.
 *
 * Held here:
 *
 *   1. the budget: 15–25 s in all, no step under its minimum, the waits after
 *      it set from the same numbers;
 *   2. the frames: the reading line reaches the last line before the process
 *      step, every node has grown before the names change, every rule and open
 *      point is revealed before its step ends;
 *   3. the markup: one live region at every moment, the step strip's labels for
 *      a screen reader only, Pause beside Skip;
 *   4. in a browser, on a started example: each step stands at least its
 *      minimum, the whole within the window, Pause stops it and Continue runs
 *      it on, Skip ends it, a phone never scrolls sideways, and a revisit of
 *      the same address does not play it again.
 */

const ROOT = path.resolve(__dirname, '..');
const SRC = fs
  .readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');
const TOTAL = SRC.split('\n').length - (SRC.endsWith('\n') ? 1 : 0);

test.describe('the budget (pure)', () => {
  test('about 20 s, inside 15–25 s, every step at least its minimum', () => {
    const b = BUILD_UP_BUDGET;
    expect(b.endAt).toBeGreaterThanOrEqual(BUILD_UP_WINDOW.min);
    expect(b.endAt).toBeLessThanOrEqual(BUILD_UP_WINDOW.max);
    expect(BUILD_UP_MIN_STEP).toBeGreaterThanOrEqual(2000);
    for (const stage of BUILD_UP_STAGES) {
      const { from, to } = buildUpStageSpan(stage);
      expect(to - from, `${stage} is too short to be followed`).toBeGreaterThanOrEqual(BUILD_UP_MIN_STEP);
    }
    // The process step carries the engine's work and is the longest.
    const process = buildUpStageSpan('process-recognised');
    for (const stage of BUILD_UP_STAGES) {
      const { from, to } = buildUpStageSpan(stage);
      expect(process.to - process.from).toBeGreaterThanOrEqual(to - from);
    }
  });

  test('the waits are set with the pace: the signing, and the rest of the model ceiling', () => {
    expect(BUILD_UP_MAP_WAIT).toBeGreaterThan(0);
    expect(BUILD_UP_MAP_WAIT).toBeLessThanOrEqual(12_000);
    // The ceiling is counted from the build-up's start, so after its end only
    // the rest of it is held, then the signing — never the whole ceiling again.
    expect(BUILD_UP_MAP_WAIT_WITH_MODEL).toBe(START_NARRATIVE_CEILING_MS - BUILD_UP_BUDGET.endAt + BUILD_UP_MAP_WAIT);
    expect(BUILD_UP_BUDGET.endAt + BUILD_UP_MAP_WAIT_WITH_MODEL).toBeLessThan(120_000);
  });
});

test.describe('the frames (pure)', () => {
  const reading = readSource(SRC);
  const events = buildUpEvents(readTableAccess(SRC), reading.skeleton);
  const drawing = firstLookExcerpt(reading.skeleton, SRC);
  const nodeLines = drawing.nodes.map((n) => n.line);

  test('the reading line reaches the last line before the process grows, and the nodes grow in order', () => {
    expect(drawing.nodes.length).toBeGreaterThan(3);
    const b = BUILD_UP_BUDGET;
    expect(excerptFrame(events, nodeLines, 0, TOTAL).grown).toBe(0);
    expect(excerptFrame(events, nodeLines, b.processFrom - 1, TOTAL).counters.line).toBe(TOTAL);
    expect(excerptFrame(events, nodeLines, b.processFrom - 1, TOTAL).grown).toBe(0);
    expect(excerptFrame(events, nodeLines, b.processFrom, TOTAL).grown).toBe(1);
    let last = 0;
    for (let t = b.processFrom; t < b.namesFrom; t += 100) {
      const grown = excerptFrame(events, nodeLines, t, TOTAL).grown;
      expect(grown).toBeGreaterThanOrEqual(last);
      last = grown;
    }
    // The whole process stands before the names change, so the reader sees it whole.
    expect(grownCount(drawing.nodes.length, b.namesFrom - 500)).toBe(drawing.nodes.length);
  });

  test('every rule and open point is revealed within its step, one after another', () => {
    for (const stage of ['rules', 'not-determined'] as const) {
      const { from, to } = buildUpStageSpan(stage);
      expect(revealedCount(4, stage, from - 1)).toBe(0);
      expect(revealedCount(4, stage, from)).toBe(1);
      expect(revealedCount(4, stage, to - 800)).toBe(4);
      expect(revealedCount(0, stage, to)).toBe(0);
    }
    expect(settleProgress(BUILD_UP_BUDGET.mapFrom - 1)).toBe(0);
    expect(settleProgress(BUILD_UP_BUDGET.endAt)).toBe(1);
  });
});

test.describe('the markup', () => {
  type BuildUp = (props: Record<string, unknown>) => React.ReactElement;
  let FirstLookBuildUp: BuildUp;
  const OUT = path.resolve(ROOT, 'tmp', 'first-look-pacing');

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'workspace', 'FirstLookBuildUp.tsx')],
      outfile: path.join(OUT, 'FirstLookBuildUp.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    FirstLookBuildUp = require(path.join(OUT, 'FirstLookBuildUp.cjs')).default as BuildUp;
  });

  function render(elapsed: number, paused: boolean | null = false): string {
    const reading = readSource(SRC);
    return renderToStaticMarkup(
      React.createElement(FirstLookBuildUp, {
        source: SRC,
        sourceName: 'Z_MM_PO_APPROVAL.abap',
        access: readTableAccess(SRC),
        skeleton: reading.skeleton,
        named: null,
        elapsed,
        onSkip: () => {},
        pause: paused === null ? null : { paused, onToggle: () => {} },
      }),
    );
  }

  test('one live region, one headline per step, and the step strip says its labels only to a screen reader', () => {
    const headlines = new Set<string>();
    for (const stage of BUILD_UP_STAGES) {
      const { from, to } = buildUpStageSpan(stage);
      const html = render((from + to) / 2);
      const live = html.match(/aria-live="/g) ?? [];
      expect(live, `${stage}: more than one live region`).toHaveLength(1);
      const headline = /<h2[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? '';
      expect(headline.length, `${stage}: no headline`).toBeGreaterThan(5);
      // One sentence, short enough to read at a glance.
      expect(headline.split(/\s+/).length, `${stage}: "${headline}" is not short`).toBeLessThanOrEqual(10);
      headlines.add(headline);
      // The six labels are in the strip, but not as visible text.
      const rail = /<ol[^>]*data-first-look-rail=""[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? '';
      expect(rail.match(/data-first-look-rail-step=/g) ?? []).toHaveLength(6);
      const visibleText = rail.replace(/<span class="sr-only">[\s\S]*?<\/span><\/li>/g, '').replace(/<[^>]+>/g, '').trim();
      expect(visibleText, `${stage}: the strip shows text over the code`).toBe('');
    }
    expect(headlines.size, 'two steps say the same headline').toBe(BUILD_UP_STAGES.length);
    expect(render(0)).toContain(`Reading your ${TOTAL} lines…`);
  });

  test('Pause stands beside Skip while the build-up plays, and says Continue once paused', () => {
    const playing = render(3000);
    expect(playing).toMatch(/data-first-look-pause="playing"[^>]*>[\s\S]*?Pause/);
    expect(playing).toContain('data-first-look-skip=""');
    const paused = render(3000, true);
    expect(paused).toMatch(/data-first-look-pause="paused"[^>]*>[\s\S]*?Continue/);
    expect(paused).toContain('data-first-look-paused=""');
    // Past its end there is nothing left to pause; Skip stays.
    const over = render(BUILD_UP_BUDGET.endAt + 1000);
    expect(over).not.toContain('data-first-look-pause=');
    expect(over).toContain('data-first-look-skip=""');
    // Without a clock that can pause, no control that would do nothing.
    expect(render(3000, null)).not.toContain('data-first-look-pause=');
  });
});

/* ------------------------------------------------------------- in a browser */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'FirstLookPace123!';

async function communityAccount(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'First', lastName: 'Look', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  return email;
}

/** When each step first stood, and when the build-up gave way — by the browser's clock. */
async function recordSteps(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __steps: Record<string, number>; __ended: number | null; __overflow: number };
    w.__steps = {};
    w.__ended = null;
    w.__overflow = 0;
    new MutationObserver(() => {
      const stage = document.querySelector('[data-first-look-buildup]')?.getAttribute('data-first-look-buildup');
      if (stage && !(stage in w.__steps)) w.__steps[stage] = performance.now();
      if (stage) w.__overflow = Math.max(w.__overflow, document.documentElement.scrollWidth - window.innerWidth);
      if (!stage && Object.keys(w.__steps).length > 0 && w.__ended === null) w.__ended = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

async function startExample(page: Page, example: string, viewport: { width: number; height: number }) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const list = page.locator('[data-cc-workspace]');
  await expect(list).toBeVisible({ timeout: 90000 });
  await page.setViewportSize(viewport);
  const start = list.locator(`[data-example-start="${example}"]`).first();
  if (!(await start.isVisible().catch(() => false))) {
    await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
  }
  await start.click({ timeout: 60000 });
  await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
}

test.describe('the pace, in a browser (owner, 03.10.2026)', () => {
  test('each step stands at least its minimum, the whole within the window; a revisit does not replay', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const email = await communityAccount('fl-pace');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordSteps(page);
    await startExample(page, 'Z_MM_PO_APPROVAL', { width: 1440, height: 1000 });

    await expect(page.locator('[data-first-look="building"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 90000 });
    const { steps, ended } = await page.evaluate(() => {
      const w = window as unknown as { __steps: Record<string, number>; __ended: number | null };
      return { steps: w.__steps, ended: w.__ended };
    });
    expect(Object.keys(steps), 'a step never stood on the page').toEqual([...BUILD_UP_STAGES]);
    // Each step stood at least its minimum (a frame of slack for the clock).
    const marks = [...BUILD_UP_STAGES.map((s) => steps[s]), ended ?? Number.NaN];
    for (let i = 0; i < BUILD_UP_STAGES.length; i += 1) {
      expect(marks[i + 1] - marks[i], `${BUILD_UP_STAGES[i]} stood too briefly`).toBeGreaterThanOrEqual(BUILD_UP_MIN_STEP - 100);
    }
    // The whole: no shorter than the window; no longer than it plus the cap
    // of the wait for a signing that is still under way.
    const total = (ended ?? 0) - steps['code-read'];
    expect(total).toBeGreaterThanOrEqual(BUILD_UP_WINDOW.min);
    expect(total).toBeLessThanOrEqual(BUILD_UP_BUDGET.endAt + BUILD_UP_MAP_WAIT + 1000);

    // The same address again — the first look was recorded as seen when it
    // was first shown, so it opens in the end state and plays nothing.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-first-look]')).toHaveAttribute('data-first-look', 'end-state', { timeout: 60000 });
    const replayed = await page.evaluate(() => Object.keys((window as unknown as { __steps: Record<string, number> }).__steps).length);
    expect(replayed, 'the revisit played the build-up again').toBe(0);
  });

  test('Pause stops the build-up, Continue runs it on, Skip ends it — by keyboard; a phone never scrolls sideways', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const email = await communityAccount('fl-pause');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordSteps(page);
    await startExample(page, 'Z_SALES_ORDER_CREATOR', { width: 390, height: 844 });

    const buildUp = page.locator('[data-first-look-buildup]');
    await expect(buildUp).toHaveAttribute('data-first-look-buildup', 'process-recognised', { timeout: 60000 });
    const pause = page.locator('[data-first-look-pause]');
    await expect(pause).toHaveAttribute('data-first-look-pause', 'playing');
    await pause.focus();
    await page.keyboard.press('Enter');
    await expect(pause).toHaveAttribute('data-first-look-pause', 'paused');
    await expect(pause).toContainText('Continue');
    const progress = page.locator('[data-first-look-progress]');
    const before = await progress.getAttribute('data-first-look-progress');
    // Longer than the rest of the step: a running clock would have moved on.
    await page.waitForTimeout(BUILD_UP_MIN_STEP + 3500);
    await expect(buildUp).toHaveAttribute('data-first-look-buildup', 'process-recognised');
    expect(await progress.getAttribute('data-first-look-progress'), 'the clock ran on while paused').toBe(before);
    await expect(page.locator('[data-first-look="building"]')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(pause).toHaveAttribute('data-first-look-pause', 'playing');
    await expect(buildUp).toHaveAttribute('data-first-look-buildup', 'business-language', { timeout: 15000 });

    const overflow = await page.evaluate(() => (window as unknown as { __overflow: number }).__overflow);
    expect(overflow, 'the build-up scrolls sideways on a phone').toBeLessThanOrEqual(1);

    const skip = page.locator('[data-first-look-skip]');
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(skip).toHaveCount(0);
    await expect(page.locator('[data-first-look]')).not.toHaveAttribute('data-first-look', 'building');
  });
});
