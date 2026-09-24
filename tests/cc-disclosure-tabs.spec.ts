import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import { parseColor } from './helpers/contrast';

/**
 * Loading, folding, tabs and the table limit — block D, step D.5c.
 *
 * `DESIGN.md` §2.8 (skeleton after 300 ms, busy indicator on the element after
 * 400 ms, the page stays usable), §2.11 ("Business rules (7) · Show", "Show all
 * 42") and §1.7 (motion only under `motion-safe:`). Held in place as behaviour:
 *
 *   - the thresholds are measured in the browser, from the click to the first
 *     paint of the indicator — a lower bound, so a fast CI machine cannot make
 *     it pass by accident and a slow one cannot make it fail;
 *   - a busy button keeps its width, its name and its focus, swallows a second
 *     click, and does not block the button beside it;
 *   - the disclosure is a button with `aria-expanded` controlling a named region,
 *     the tabs are the WAI-ARIA tabs pattern with roving tabindex, the table
 *     limit is a real button that says how many rows there are;
 *   - folded and limited content is only not displayed: it prints;
 *   - under reduced motion nothing turns and nothing slides.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const DEMO = '[data-cc-demo="loading"]';

test.describe('the source keeps the thresholds and the stillness', () => {
  test('300 ms for a skeleton, 400 ms for a busy indicator, in one place', () => {
    const delay = read('components/cc/delay.ts');
    expect(delay).toMatch(/CC_SKELETON_DELAY_MS = 300\b/);
    expect(delay).toMatch(/CC_BUSY_DELAY_MS = 400\b/);
    expect(read('components/cc/Skeleton.tsx')).toMatch(/useCcDelayedFlag\(true, CC_SKELETON_DELAY_MS\)/);
    expect(read('components/cc/Button.tsx')).toMatch(/useCcDelayedFlag\(busy, CC_BUSY_DELAY_MS\)/);
  });

  test('the skeleton does not move, and the busy indicator turns only when motion is welcome', () => {
    const skeleton = read('components/cc/Skeleton.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(skeleton, 'a skeleton that pulses is perpetual motion (§1.7)').not.toMatch(/animate-/);
    const button = read('components/cc/Button.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of button.matchAll(/(\S*)animate-\w+/g)) {
      expect(m[1], 'an animation in the button without motion-safe:').toContain('motion-safe:');
    }
  });

  test('a busy button is not disabled, so it keeps the focus', () => {
    const src = read('components/cc/Button.tsx');
    expect(src).not.toMatch(/(?<![-\w])disabled=\{[^}]*busy/);
    expect(src).toContain('aria-busy={busy');
  });
});

test.describe('loading, folding, tabs and the table limit, rendered', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccd5c');
  });

  /**
   * Clicks `selector` inside the page and resolves with the milliseconds until
   * `until` first matches — measured with a MutationObserver, so the number is
   * the browser's, not the test runner's round trips.
   */
  const msUntil = (page: Page, selector: string, until: string) =>
    page.evaluate(
      ([sel, target]) =>
        new Promise<number>((resolve, reject) => {
          const start = performance.now();
          const done = () => {
            if (document.querySelector(target)) {
              observer.disconnect();
              resolve(performance.now() - start);
              return true;
            }
            return false;
          };
          const observer = new MutationObserver(() => void done());
          observer.observe(document.body, { subtree: true, childList: true, attributes: true });
          (document.querySelector(sel) as HTMLElement).click();
          window.setTimeout(() => {
            observer.disconnect();
            reject(new Error(`${target} did not appear within 5 s`));
          }, 5000);
        }),
      [selector, until] as const,
    );

  test('the busy button: said at once, painted after 400 ms, same width, page usable', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);
    const save = demo.locator('[data-cc-demo-save]');
    const read_ = demo.locator('[data-cc-demo-read]');
    const counts = demo.locator('[data-cc-demo-counts]');

    const before = await save.evaluate((el) => el.getBoundingClientRect().width);
    await expect(save).not.toHaveAttribute('aria-busy', /.*/);

    const ms = await msUntil(page, `${DEMO} [data-cc-demo-save]`, `${DEMO} [data-cc-busy-indicator]`);
    expect(ms, 'the busy indicator appeared before 400 ms (§2.8)').toBeGreaterThanOrEqual(380);

    // Busy is announced, the name is still the label, and the width did not move.
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAttribute('data-cc-busy', 'shown');
    await expect(save).toHaveAccessibleName('Save decision');
    expect(await save.evaluate((el) => el.getBoundingClientRect().width)).toBe(before);

    // A second click does nothing; the button beside it still works. `force`,
    // because Playwright itself treats aria-disabled as "wait until enabled".
    await save.click({ force: true });
    await read_.click();
    await expect(save).toHaveAttribute('data-cc-busy', 'shown');
    await expect(counts).toHaveText('Saved 1 · marked 1');

    // And a busy button keeps its focus instead of dropping it to the page.
    await save.focus();
    await expect(save).toBeFocused();

    await expect(save).not.toHaveAttribute('aria-busy', /.*/, { timeout: 5000 });
    await expect(demo.locator('[data-cc-busy-indicator]')).toHaveCount(0);
  });

  test('before 400 ms there is no indicator — only the announcement', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const state = await page.evaluate((demo) => {
      const button = document.querySelector(`${demo} [data-cc-demo-save]`) as HTMLElement;
      button.click();
      return new Promise<{ busy: string | null; phase: string | null; indicator: boolean }>((resolve) =>
        requestAnimationFrame(() =>
          resolve({
            busy: button.getAttribute('aria-busy'),
            phase: button.getAttribute('data-cc-busy'),
            indicator: !!document.querySelector(`${demo} [data-cc-busy-indicator]`),
          }),
        ),
      );
    }, DEMO);
    expect(state).toEqual({ busy: 'true', phase: 'pending', indicator: false });
  });

  test('the skeleton: after 300 ms, still, spoken once, then the content', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const ms = await msUntil(page, `${DEMO} [data-cc-demo-load]`, `${DEMO} [data-cc-skeleton="table"][data-cc-skeleton-shown="true"]`);
    expect(ms, 'the skeleton appeared before 300 ms (§2.8)').toBeGreaterThanOrEqual(280);

    const skeleton = demo.locator('[data-cc-skeleton="table"]');
    await expect(skeleton).toHaveAttribute('role', 'status');
    await expect(skeleton).toHaveText('Loading findings');
    const animations = await skeleton
      .locator('[data-cc-skeleton-block]')
      .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).animationName))]);
    expect(animations, 'a skeleton block moves (§1.7)').toEqual(['none']);

    // The load ends and the table is back where the skeleton stood.
    await expect(skeleton).toHaveCount(0, { timeout: 5000 });
    await expect(demo.getByRole('table', { name: /Twelve findings/ })).toBeVisible();
  });

  test('the disclosure: a button that says the count and controls a named region', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const trigger = demo.getByRole('button', { name: /^Business rules \(7\)/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toContainText('Show');
    const regionId = await trigger.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    const region = page.locator(`[id="${regionId}"]`);
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toBeHidden();
    // Folded is not removed: all seven rules are in the document.
    await expect(region.locator('li')).toHaveCount(7);

    // The keyboard opens it and closes it.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toContainText('Hide');
    await expect(region).toBeVisible();
    await expect(demo.getByRole('region', { name: 'Business rules (7)' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(region).toBeHidden();

    // Its heading keeps it in the outline while it is closed.
    await expect(demo.getByRole('heading', { level: 4, name: /Business rules/ })).toHaveCount(1);

    // "Details" starts open.
    await expect(demo.getByRole('button', { name: /^Details/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('the tabs: one tab stop, arrows move and wrap, Home and End, panel named by its tab', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const list = demo.getByRole('tablist', { name: 'About this rule' });
    const tabs = list.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    const source = list.getByRole('tab', { name: 'Source' });
    const open = list.getByRole('tab', { name: /Not determined/ });
    const what = list.getByRole('tab', { name: 'What it does' });

    await expect(source).toHaveAttribute('aria-selected', 'true');
    // Roving tabindex: exactly one tab is in the tab order.
    expect(await tabs.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')))).toEqual(['0', '-1', '-1']);

    const visiblePanel = async () => {
      const panel = demo.locator('[role="tabpanel"]:visible');
      await expect(panel).toHaveCount(1);
      const labelledBy = await panel.getAttribute('aria-labelledby');
      return page.locator(`[id="${labelledBy}"]`).textContent();
    };
    expect(await visiblePanel()).toBe('Source');

    await source.focus();
    await page.keyboard.press('ArrowRight');
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute('aria-selected', 'true');
    expect(await visiblePanel()).toMatch(/^Not determined/);

    await page.keyboard.press('End');
    await expect(what).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(source).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(what).toBeFocused();
    await page.keyboard.press('Home');
    await expect(source).toBeFocused();
    await expect(source).toHaveAttribute('aria-selected', 'true');
    expect(await tabs.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')))).toEqual(['0', '-1', '-1']);

    // Tab leaves the list for the panel, not for the next tab.
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focused).toBe('tabpanel');

    // The chosen tab is ink, not green (§1.1).
    const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cc-ink').trim());
    const line = await source.evaluate((el) => getComputedStyle(el).borderBottomColor);
    expect(parseColor(line)).toEqual(parseColor(ink));
  });

  test('the table limit: five rows, "Show all 12", and back', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);
    const table = demo.getByRole('table', { name: /Twelve findings/ });

    await expect(table.locator('tbody tr:visible')).toHaveCount(5);
    const more = demo.getByRole('button', { name: 'Show all 12' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    const controls = await more.getAttribute('aria-controls');
    expect(await table.locator('tbody').getAttribute('id')).toBe(controls);

    await more.focus();
    await page.keyboard.press('Enter');
    await expect(table.locator('tbody tr:visible')).toHaveCount(12);
    const less = demo.getByRole('button', { name: 'Show the first 5' });
    await expect(less).toHaveAttribute('aria-expanded', 'true');
    await expect(less).toBeFocused();

    await less.click();
    await expect(table.locator('tbody tr:visible')).toHaveCount(5);
  });

  test('on paper, folded and limited content is all there', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    await page.emulateMedia({ media: 'print' });
    await expect(demo.getByRole('table', { name: /Twelve findings/ }).locator('tbody tr:visible')).toHaveCount(12);
    await expect(demo.locator('[data-cc-table-show-all]')).toBeHidden();
    await expect(demo.locator('[data-cc-demo-rules]')).toBeVisible();
    await expect(demo.locator('[role="tabpanel"]:visible')).toHaveCount(3);
  });

  test('the new controls show the focus ring when tabbed to', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const focus = parseColor(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cc-focus').trim()),
    );
    const demo = page.locator(DEMO);
    const targets = [
      demo.getByRole('button', { name: /^Business rules/ }),
      demo.getByRole('tab', { name: 'Source' }),
      demo.getByRole('tabpanel').first(),
      demo.getByRole('button', { name: 'Show all 12' }),
    ];
    for (const target of targets) {
      // Keyboard focus, so :focus-visible matches: focus the element before it and tab.
      await target.evaluate((el) => {
        const all = [...document.querySelectorAll<HTMLElement>('button, [tabindex="0"], a[href], input, select, textarea')];
        const i = all.indexOf(el as HTMLElement);
        (all[i - 1] ?? document.body).focus();
      });
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
      const ring = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: parseFloat(s.outlineWidth), style: s.outlineStyle, color: s.outlineColor };
      });
      expect(ring.width, 'no focus ring (§1.6)').toBeGreaterThanOrEqual(2);
      expect(ring.style).not.toBe('none');
      expect(parseColor(ring.color)).toEqual(focus);
    }
  });

  test('reduced motion: the indicator stands still, the chevron does not slide', async ({ browser }) => {
    test.setTimeout(180 * 1000);
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    await demo.locator('[data-cc-demo-save]').click();
    const indicator = demo.locator('[data-cc-busy-indicator] svg');
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');

    // No transition of its own (motion-safe: is off), and D.3's global rule
    // would cut one to 0.01 ms anyway.
    const chevron = demo.getByRole('button', { name: /^Business rules/ }).locator('svg');
    const duration = await chevron.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(duration, 'the chevron slides under reduced motion').toBeLessThan(0.001);

    await context.close();
  });

  test('with motion welcome, the indicator turns — so the reduced-motion test measures something', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openGallery(page, admin);
    const demo = page.locator(DEMO);
    await demo.locator('[data-cc-demo-save]').click();
    const indicator = demo.locator('[data-cc-busy-indicator] svg');
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((el) => getComputedStyle(el).animationName)).toBe('spin');
    const chevron = demo.getByRole('button', { name: /^Business rules/ }).locator('svg');
    expect(await chevron.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeCloseTo(0.15, 2);
  });

  test('dates: text, ISO in mono, the time with its zone, and nothing guessed', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const dates = page.locator('[data-cc-demo-dates]');
    await expect(dates.locator('[data-cc-date="text"]')).toHaveText('15 Sep 2026');
    const iso = dates.locator('[data-cc-date="iso"]');
    await expect(iso).toHaveText('2026-09-15');
    await expect(iso).toHaveAttribute('datetime', '2026-09-15T14:05:00.000Z');
    await expect(iso).toHaveAttribute('title', '15 Sep 2026, 14:05 UTC');
    expect(await iso.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono|Consolas|Menlo/i);
    await expect(dates.locator('[data-cc-date="datetime"]')).toHaveText('15 Sep 2026, 14:05 UTC');
    await expect(dates.locator('[data-cc-date="none"]')).toHaveText('no date recorded');
  });
});
