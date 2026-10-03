import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';
import { availableCoachMarks, placeCoachMark, rectsIntersect, scrollToShow, type CoachRect } from '../lib/coach-marks';

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
});

test('a view offers only the marks it has a place for — Management shows its one tip, not none', () => {
  expect(availableCoachMarks({ hasDecision: true, hasNextStep: true, only: ['next-step'] }).map((m) => m.id)).toEqual(['next-step']);
  expect(availableCoachMarks({ hasDecision: true, hasNextStep: true }).map((m) => m.id)).toEqual(['decision', 'not-determined', 'next-step']);
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
  // The mark brings itself and its target into view, and checks again within
  // the first second and a half while the page settles.
  await page.waitForTimeout(1800);
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
}

for (const vp of [
  { name: 'desktop 1440', width: 1440, height: 900, itForm: 'popover' },
  { name: 'phone 390', width: 390, height: 844, itForm: 'sheet' },
]) {
  test(`after the build-up, a tip does not cover its target or the primary action — ${vp.name}`, async ({ page }) => {
    test.setTimeout(360 * 1000);
    await startExample(page, { width: vp.width, height: vp.height });
    // Business, "1 of 3": in the flow right above the map it is about.
    holds(await measure(page, 'decision'), 'inline', 'Business, Select the decision point');

    // IT, "1 of 3": the Not determined figure, with "Draft the design" right under it.
    const id = new URL(page.url()).pathname.split('/')[2];
    await page.evaluate(() => window.localStorage.removeItem('cc.workspace.coachMarks.dismissed'));
    await page.goto(`/project/${id}?view=it`, { waitUntil: 'domcontentloaded' });
    holds(await measure(page, 'not-determined'), vp.itForm, 'IT, This is what we could not determine');
  });
}
