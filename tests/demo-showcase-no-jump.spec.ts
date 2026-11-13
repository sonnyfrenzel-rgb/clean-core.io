import { test, expect, type Page } from './helpers/test';

/**
 * The public demo showcase's guide box does not jump (roadmap 3.5.0 item 8,
 * DEMO-3; owner decision 13.11.2026: mockup v3, variant A).
 *
 * The owner's rule, measured as the mockup measured it: a real click on Next
 * through steps 1 to 10 and on to the end, at 1440 x 900, 1280 x 800,
 * 768 x 1024 and 390 x 844. On every step
 *   - the box has the same position and size as on step 1 (0 px shift),
 *   - the page has not scrolled (the stage scrolls inside, never the page),
 *   - the explained part is not under the box and starts inside the stage,
 *   - the product frame is zoomed no further out than 70 %,
 * and over the whole walk the layout shift a reader did not cause is 0. The
 * load itself is measured apart: the site's own Inter file replaces the
 * fallback face once it has loaded (`app/layout.tsx`, `display: swap`), which
 * moves some text by a pixel or two on every page (measured 0.0004 to 0.002 here); that is held under 0.005.
 * Each step's numbers are attached to the report.
 */

const VIEWPORTS: ReadonlyArray<readonly [string, number, number]> = [
  ['1440x900', 1440, 900],
  ['1280x800', 1280, 800],
  ['768x1024', 768, 1024],
  ['390x844', 390, 844],
];

type Box = { x: number; y: number; w: number; h: number };

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const box = rect(document.querySelector('[data-showcase-box]'));
    // Step 5 explains two cards: the part is the first, which the stage is fitted to (as mockup v3 measured).
    const part = rect(document.querySelector('[data-showcase-target]'));
    const stage = rect(document.querySelector('[data-showcase-stage]'));
    const frame = document.querySelector<HTMLElement>('[data-showcase-stage] .app, [data-showcase-stage] .endwrap');
    let covered = 0;
    if (box && part) {
      const ox = Math.max(0, Math.min(part.right, box.right) - Math.max(part.x, box.x));
      const oy = Math.max(0, Math.min(part.bottom, box.bottom) - Math.max(part.y, box.y));
      covered = Math.round(ox * oy);
    }
    return {
      step: document.querySelector('[data-showcase]')?.getAttribute('data-showcase-step') ?? null,
      box,
      part,
      stage,
      covered,
      zoom: Number(frame?.dataset.showcaseZoom ?? '1'),
      pageScroll: Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0, document.documentElement.scrollTop),
      cls: (window as unknown as { __cls?: number }).__cls ?? 0,
    };
  });
}

for (const [name, width, height] of VIEWPORTS) {
  test(`the guide box keeps its place through every step at ${name}`, async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/demo', { waitUntil: 'load' });
    await expect(page.locator('[data-showcase-ready="true"]')).toBeAttached({ timeout: 60_000 });
    await expect(page.locator('[data-showcase-target]').first()).toBeVisible();
    // The load's shift (the web font replacing its fallback) is counted apart from the walk's.
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300))));
    const loadCls = (await measure(page)).cls;
    expect(loadCls, 'layout shift while the page loads').toBeLessThan(0.005);
    await page.evaluate(() => {
      (window as unknown as { __cls: number }).__cls = 0;
    });

    const next = page.locator('[data-showcase-next]:visible');
    const rows: Array<Record<string, unknown>> = [];
    let first: Box | null = null;

    for (let step = 1; step <= 10; step++) {
      await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', String(step));
      // Two frames: the fit runs before paint, the measurement after it.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const m = await measure(page);
      expect(m.box, `step ${step}: no guide box`).not.toBeNull();
      expect(m.part, `step ${step}: no explained part`).not.toBeNull();
      const box = { x: Math.round(m.box!.x), y: Math.round(m.box!.y), w: Math.round(m.box!.w), h: Math.round(m.box!.h) };
      first ??= box;
      const shift = Math.max(Math.abs(box.x - first.x), Math.abs(box.y - first.y), Math.abs(box.w - first.w), Math.abs(box.h - first.h));
      rows.push({ step, box, shift, pageScroll: m.pageScroll, covered: m.covered, zoom: m.zoom });

      expect(shift, `step ${step}: the box moved or changed size`).toBe(0);
      expect(m.pageScroll, `step ${step}: the page scrolled`).toBe(0);
      expect(m.covered, `step ${step}: the explained part is under the box`).toBe(0);
      expect(m.part!.y, `step ${step}: the explained part starts above the stage`).toBeGreaterThanOrEqual(m.stage!.y - 1);
      expect(m.part!.y, `step ${step}: the explained part starts below the stage`).toBeLessThan(m.stage!.bottom);
      expect(m.zoom, `step ${step}: zoomed out too far`).toBeGreaterThanOrEqual(0.7);

      await next.first().click();
    }

    await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', 'end');
    await expect(page.locator('[data-showcase-end]')).toBeVisible();
    const end = await measure(page);
    expect(end.pageScroll, 'the end scrolled the page').toBe(0);
    await page.waitForTimeout(500);
    const cls = (await measure(page)).cls;
    rows.push({ step: 'end', pageScroll: end.pageScroll, walkCls: cls, loadCls });
    expect(cls, 'layout shift nobody caused, from step 1 to the end').toBe(0);

    console.log(`no-jump ${name} ${JSON.stringify(rows)}`);
    await test.info().attach(`no-jump-${name}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
  });
}
