import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';
import { availableCoachMarks, dockSheet, placeCoachMark, rectsIntersect, scrollToShow, type CoachRect } from '../lib/coach-marks';

/**
 * A coach mark stands beside what it explains, never over it.
 *
 * After the start build-up (ADR-072) the first tip, "1 of 3", sat under the
 * title of the process card and covered the card's own text; in the IT view it
 * covered the Not determined value and the Open Design button. The placement is
 * now decided by `placeCoachMark` (`lib/coach-marks.ts`): below the target,
 * beside it, or above it — the first place that covers neither the target nor
 * a primary action — and on a phone the tip is a bottom sheet with the target
 * scrolled into the part of the screen the sheet leaves free. The map's tip,
 * whose target fills the screen, stands in the flow right above the map.
 *
 * The pure half holds the rule; the rendered half holds it on the real page
 * after a real start, at 1440 and at 390.
 *
 * **Next step first** (owner, 04.10.2026). The tour starts at "Your next
 * step", the page's one primary action, and then follows the page. Its first
 * tip used to be the map's, and it scrolled the page to the map 0.8 s and
 * 1.5 s after it appeared — on a phone the reader was carried past the next
 * step before reading it. Now the first tip leaves the page where it is, and
 * only "Next" scrolls. The rendered half walks the whole tour and checks
 * every tip.
 */

const rect = (top: number, left: number, width: number, height: number): CoachRect => ({ top, left, width, height });
const VIEW = { width: 1440, height: 900, top: 57, scrollY: 0 };

test.describe('placeCoachMark — the rule', () => {
  test('below the target when there is room, and never over it', () => {
    const target = rect(200, 100, 300, 40);
    const placed = placeCoachMark({ target, point: target, popover: { width: 320, height: 160 }, avoid: [], viewport: VIEW });
    expect(placed.side).toBe('below');
    expect(rectsIntersect(rect(placed.top, placed.left, 320, 160), target)).toBe(false);
  });

  test('a primary action below the target sends the tip beside it, at its height', () => {
    // The IT view: the Not determined figure at the right, "Draft the design" under it.
    const target = rect(560, 1060, 330, 110);
    const action = rect(690, 1260, 130, 40);
    const placed = placeCoachMark({ target, point: target, popover: { width: 320, height: 170 }, avoid: [action], viewport: VIEW });
    const box = rect(placed.top, placed.left, 320, 170);
    expect(placed.side).toBe('left');
    expect(placed.top).toBe(target.top);
    expect(rectsIntersect(box, target)).toBe(false);
    expect(rectsIntersect(box, action)).toBe(false);
  });

  test('no room below or beside: above the target', () => {
    const target = rect(560, 16, 1408, 110);
    const action = rect(690, 16, 400, 40);
    const placed = placeCoachMark({ target, point: target, popover: { width: 320, height: 170 }, avoid: [action], viewport: VIEW });
    const box = rect(placed.top, placed.left, 320, 170);
    expect(placed.side).toBe('above');
    expect(rectsIntersect(box, target)).toBe(false);
    expect(rectsIntersect(box, action)).toBe(false);
  });

  test('no clean place: below the target, which by construction does not cover it', () => {
    const target = rect(100, 16, 1408, 400);
    const everywhere = rect(-5000, 0, 1440, 20000);
    const placed = placeCoachMark({ target, point: target, popover: { width: 320, height: 160 }, avoid: [everywhere], viewport: VIEW });
    expect(placed.side).toBe('below');
    expect(rectsIntersect(rect(placed.top, placed.left, 320, 160), target)).toBe(false);
  });

  test('on a phone the target is scrolled above the sheet', () => {
    const phone = { width: 390, height: 844, top: 57, scrollY: 0 };
    const sheet = rect(644, 16, 358, 184);
    expect(scrollToShow({ target: rect(1500, 16, 200, 32), popover: sheet, sheet: true, viewport: phone })).toBe(1500 - 57 - 16);
    expect(scrollToShow({ target: rect(300, 16, 200, 32), popover: sheet, sheet: true, viewport: phone })).toBe(0);
  });

  test('on a phone a sheet docked at the top has the target scrolled to just below it, never behind it', () => {
    // QA 86f984ca90aa: the target went to the top of the screen, where the sheet stood.
    const phone = { width: 390, height: 844, top: 57, scrollY: 0 };
    const docked = rect(57 + 8, 16, 358, 184);
    const below = 57 + 8 + 184 + 12;
    // Far down the page, and the next step's button holds the bottom: the sheet docks at the top.
    const far = rect(1500, 16, 200, 32);
    expect(dockSheet({ target: far, sheetHeight: 184, avoid: [rect(760, 16, 160, 44)], viewport: phone })).toBe('top');
    const by = scrollToShow({ target: far, popover: docked, sheet: true, dock: 'top', viewport: phone });
    expect(by).toBe(1500 - below);
    // After the scroll the target is in view and clear of the sheet.
    const after = rect(far.top - by, far.left, far.width, far.height);
    expect(rectsIntersect(after, docked)).toBe(false);
    expect(after.top + after.height).toBeLessThanOrEqual(phone.height);
    // Already below the sheet and on screen: no scroll.
    expect(scrollToShow({ target: rect(500, 16, 200, 32), popover: docked, sheet: true, dock: 'top', viewport: phone })).toBe(0);
    // Behind the sheet: scrolled down out from under it (a negative scroll).
    const hidden = rect(120, 16, 200, 32);
    const up = scrollToShow({ target: hidden, popover: docked, sheet: true, dock: 'top', viewport: phone });
    expect(rectsIntersect(rect(hidden.top - up, 16, 200, 32), docked)).toBe(false);
    // The popover measured where it stood before the dock moved: the dock decides, not the stale rectangle.
    const stale = rect(644, 16, 358, 184);
    expect(scrollToShow({ target: far, popover: stale, sheet: true, dock: 'top', viewport: phone })).toBe(1500 - below);
    // Without a dock, a popover in the upper half is read as docked at the top.
    expect(scrollToShow({ target: far, popover: docked, sheet: true, viewport: phone })).toBe(1500 - below);
    // The page passes the dock it decides at the moment of the scroll.
    const src = fs.readFileSync(path.resolve(__dirname, '../components/workspace/CoachMarks.tsx'), 'utf8');
    expect(src).toMatch(/scrollToShow\(\{[\s\S]{0,200}dock,/);
  });

  test('on a phone the sheet stands at the bottom, or at the top where the bottom would cover', () => {
    const phone = { width: 390, height: 844, top: 57, scrollY: 0 };
    // Target high up: the bottom is free.
    expect(dockSheet({ target: rect(120, 16, 358, 80), sheetHeight: 180, avoid: [], viewport: phone })).toBe('bottom');
    // Target low on the screen: the sheet goes to the top rather than move the page.
    expect(dockSheet({ target: rect(700, 16, 358, 80), sheetHeight: 180, avoid: [], viewport: phone })).toBe('top');
    // The next step's button low on the screen counts as much as the target.
    expect(dockSheet({ target: rect(400, 16, 358, 80), sheetHeight: 180, avoid: [rect(760, 16, 160, 44)], viewport: phone })).toBe('top');
    // Neither edge clean: the bottom, as before.
    expect(dockSheet({ target: rect(60, 16, 358, 800), sheetHeight: 180, avoid: [], viewport: phone })).toBe('bottom');
  });
});

test('a view offers only the marks it has a place for — Management shows its one tip, not none', () => {
  expect(availableCoachMarks({ hasDecision: true, hasNextStep: true, only: ['next-step'] }).map((m) => m.id)).toEqual(['next-step']);
  // Business reads its page: the next step, the decision point at the map, the open points at the foot.
  expect(availableCoachMarks({ hasDecision: true, hasNextStep: true }).map((m) => m.id)).toEqual(['next-step', 'decision', 'not-determined']);
});

test('the first tip never scrolls the page by itself; "Next" does, smoothly unless reduced motion is asked for', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/workspace/CoachMarks.tsx'), 'utf8');
  // No timed corrections after a tip appears.
  expect(src).not.toMatch(/setTimeout/);
  // The scroll waits for the reader.
  expect(src).toMatch(/if \(!mark\.follow\) return;/);
  expect(src).toMatch(/behavior: reducedMotion\(\) \? 'auto' : 'smooth'/);
  const hook = fs.readFileSync(path.resolve(__dirname, '../hooks/useCoachMarks.ts'), 'utf8');
  expect(hook).toMatch(/const \[follow, setFollow\] = useState\(false\);/);
});

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
const PASSWORD = 'CoachPlacement123!';
const EXAMPLE = 'Z_SALES_ORDER_CREATOR';

async function startExample(page: Page, viewport: { width: number; height: number }): Promise<void> {
  const email = `coach-place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Coach', lastName: 'Placement', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInViaLanding(page, email, PASSWORD);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const list = page.locator('[data-cc-workspace]');
  await expect(list).toBeVisible({ timeout: 90000 });
  await page.setViewportSize(viewport);
  const start = list.locator(`[data-example-start="${EXAMPLE}"]`).first();
  if (!(await start.isVisible().catch(() => false))) {
    await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
  }
  await start.click({ timeout: 60000 });
  await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
  await expect(page.locator('[data-first-look="complete"], [data-first-look="end-state"]').first()).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
}

/** A tip and its target, measured once both have stopped moving. */
async function measure(page: Page, id: string) {
  const mark = page.locator(`[data-coach-mark="${id}"]`);
  await expect(mark).toBeVisible({ timeout: 60000 });
  // After "Next" the page scrolls smoothly to the mark; let it land.
  await page.waitForTimeout(600);
  // Settled: the same position and scroll four samples in a row.
  let last = '';
  let same = 0;
  for (let i = 0; i < 60 && same < 4; i += 1) {
    const now = await page.evaluate(() => {
      const m = document.querySelector('[data-coach-mark]')!.getBoundingClientRect();
      return `${Math.round(m.top)},${Math.round(m.left)},${Math.round(window.scrollY)}`;
    });
    same = now === last ? same + 1 : 0;
    last = now;
    await page.waitForTimeout(250);
  }
  return page.evaluate((markId) => {
    const box = (r: DOMRect) => ({ top: r.top, left: r.left, width: r.width, height: r.height });
    // The element the tip is about, found as the component finds it: the
    // smallest one on screen that carries the mark's target attribute.
    const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-coach-target="${markId}"]`))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .sort((a, b) => a.width * a.height - b.width * b.height);
    const markEl = document.querySelector<HTMLElement>('[data-coach-mark]')!;
    const actions = Array.from(document.querySelectorAll<HTMLElement>('[data-cc-button="primary"]'))
      .filter((el) => !markEl.contains(el))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map(box);
    return {
      form: markEl.getAttribute('data-coach-form'),
      mark: box(markEl.getBoundingClientRect()),
      target: targets[0] ? box(targets[0]) : null,
      actions,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, id);
}

type Measured = Awaited<ReturnType<typeof measure>>;

function holds(m: Measured, form: string, what: string) {
  expect(m.form, what).toBe(form);
  expect(m.target, `${what}: no target on the page`).not.toBeNull();
  expect(rectsIntersect(m.mark, m.target!), `${what}: tip ${JSON.stringify(m.mark)} covers its target ${JSON.stringify(m.target)}`).toBe(false);
  // The target is on screen with the tip, not scrolled away from it.
  expect(m.target!.top, `${what}: target above the screen`).toBeGreaterThanOrEqual(0);
  expect(m.target!.top, `${what}: target below the screen`).toBeLessThan(m.viewport.height);
  for (const a of m.actions) expect(rectsIntersect(m.mark, a), `${what}: tip covers a primary action ${JSON.stringify(a)}`).toBe(false);
  // Inside the screen: never cut off at a side, and a floating tip or a sheet
  // never past the top or the bottom either. An inline tip is in the flow, so
  // only its start has to be on screen.
  expect(m.mark.left, `${what}: tip leaves the screen on the left`).toBeGreaterThanOrEqual(0);
  expect(m.mark.left + m.mark.width, `${what}: tip leaves the screen on the right`).toBeLessThanOrEqual(m.viewport.width + 0.5);
  expect(m.mark.top, `${what}: tip starts above the screen`).toBeGreaterThanOrEqual(0);
  expect(m.mark.top, `${what}: tip starts below the screen`).toBeLessThan(m.viewport.height);
  if (form !== 'inline') {
    expect(m.mark.top + m.mark.height, `${what}: tip ends below the screen`).toBeLessThanOrEqual(m.viewport.height + 0.5);
  }
}

/** Saves what the reader sees at this step of the tour, when COACH_SHOTS names a folder. */
async function shot(page: Page, name: string) {
  const dir = process.env.COACH_SHOTS;
  if (!dir) return;
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function next(page: Page, id: string) {
  await page.click(`[data-coach-mark-dismiss="${id}"]`);
}

for (const vp of [
  { name: 'desktop 1440', slug: 'desktop', width: 1440, height: 900, touch: false, floatForm: 'popover' },
  { name: 'phone 390', slug: 'phone', width: 390, height: 844, touch: true, floatForm: 'sheet' },
]) {
  test.describe(vp.name, () => {
    test.use({ hasTouch: vp.touch });

    test(`the tour starts at the next step, follows the page, and no tip covers its target or the primary action — ${vp.name}`, async ({ page }) => {
      test.setTimeout(420 * 1000);
      await startExample(page, { width: vp.width, height: vp.height });

      // Business, "1 of 3": "Your next step", in the flow right above the bar —
      // and the page has not moved to show it: the reader is where they were.
      const mark = page.locator('[data-coach-mark]');
      await expect(mark).toHaveAttribute('data-coach-mark', 'next-step', { timeout: 60000 });
      const before = await page.evaluate(() => window.scrollY);
      holds(await measure(page, 'next-step'), 'inline', 'Business, Your next step');
      await expect(mark).toContainText('1 of 3');
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.scrollY), 'the first tip scrolled the page by itself').toBe(before);
      await shot(page, `${vp.slug}-business-1-next-step`);

      // "Next": the decision point, in the flow right above the map.
      await next(page, 'next-step');
      holds(await measure(page, 'decision'), 'inline', 'Business, Select the decision point');
      await shot(page, `${vp.slug}-business-2-decision`);

      // "Next": what could not be determined, at the foot of the page.
      await next(page, 'decision');
      holds(await measure(page, 'not-determined'), vp.floatForm, 'Business, This is what we could not determine');
      await shot(page, `${vp.slug}-business-3-not-determined`);
      await next(page, 'not-determined');
      await expect(mark).toHaveCount(0);

      // IT: "Next step" under the answer, then the Not determined figure in
      // the answer, then the decision further down.
      const id = new URL(page.url()).pathname.split('/')[2];
      await page.evaluate(() => window.localStorage.removeItem('cc.workspace.coachMarks.dismissed'));
      await page.goto(`/project/${id}?view=it`, { waitUntil: 'domcontentloaded' });
      await expect(mark).toHaveAttribute('data-coach-mark', 'next-step', { timeout: 60000 });
      // On a phone IT's header fills the first screen and the answer starts
      // under it. The tip waits at the next step rather than pull the page
      // there; the reader meets it on the way down.
      const itBefore = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.scrollY), 'IT: the first tip scrolled the page by itself').toBe(itBefore);
      await mark.scrollIntoViewIfNeeded();
      holds(await measure(page, 'next-step'), 'inline', 'IT, Your next step');
      await shot(page, `${vp.slug}-it-1-next-step`);
      await next(page, 'next-step');
      holds(await measure(page, 'not-determined'), vp.floatForm, 'IT, This is what we could not determine');
      await shot(page, `${vp.slug}-it-2-not-determined`);
      await next(page, 'not-determined');
      holds(await measure(page, 'decision'), vp.floatForm, 'IT, Select the decision point');
      await shot(page, `${vp.slug}-it-3-decision`);

      // Management: its one tip, "Your next step" on the answer.
      await page.evaluate(() => window.localStorage.removeItem('cc.workspace.coachMarks.dismissed'));
      await page.goto(`/project/${id}?view=management`, { waitUntil: 'domcontentloaded' });
      await expect(mark).toHaveAttribute('data-coach-mark', 'next-step', { timeout: 60000 });
      holds(await measure(page, 'next-step'), vp.floatForm, 'Management, Your next step');
      await shot(page, `${vp.slug}-management-1-next-step`);
    });
  });
}
