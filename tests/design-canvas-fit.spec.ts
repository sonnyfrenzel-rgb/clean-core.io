import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';

/**
 * The Design stage keeps the page's proportions at every width.
 *
 * Owner, 02.10.2026, on a ~3400 px window: "hier stimmen die Größen/Proportionen
 * überhaupt nicht". The stage ran edge to edge out of the page column and the
 * architecture SVG was `width="100%"` of that, so its viewBox scaled with the
 * window: box titles near 30 px beside a 15 px page, the Decision panel a thin
 * strip at the far right, its "Confirm target" below the fold. The stage now
 * sits in the wide page column like Documentation, and the drawing never grows
 * past its natural size — the type scale (DESIGN.md §1.2) tops out at 22 px for
 * a project title, so no canvas label may exceed 20 px. Narrower columns shrink
 * it to 0.8 at most and pan beyond (it had dropped to 7 px at 1280 before).
 *
 * `DESIGNFIT_SHOTS=<dir>` writes a screenshot per width, for looking at.
 */

const MAX_LABEL_PX = 20;
// The floor of the type scale (11 px) at the smallest "Fit" scale, 0.8 — the
// process map's floor as well (`components/process-map/bpmn-view.ts`).
const MIN_LABEL_PX = 11 * 0.8;
const SHOTS = process.env.DESIGNFIT_SHOTS;

async function canvasLabelSizes(page: Page): Promise<{ max: number; min: number }> {
  return page.locator('svg[data-architecture-canvas]').evaluate((svg) => {
    const sizes = [...svg.querySelectorAll('text, tspan')]
      .filter((t) => (t.textContent ?? '').trim().length > 0)
      .map((t) => (t as SVGGraphicsElement).getBoundingClientRect().height > 0 ? t : null)
      .filter((t): t is Element => t !== null)
      .map((t) => {
        // Rendered size: the attribute times the SVG's user-unit scale.
        const own = parseFloat(t.getAttribute('font-size') ?? getComputedStyle(t).fontSize);
        const ctm = (svg as SVGSVGElement).getScreenCTM();
        return own * (ctm ? ctm.a : 1);
      });
    return { max: Math.max(...sizes), min: Math.min(...sizes) };
  });
}

async function expectFits(page: Page, width: number, height: number, name: string) {
  await page.setViewportSize({ width, height });
  if (width < 720) {
    // The phone form reflows as HTML instead of shrinking the drawing.
    await expect(page.locator('[data-architecture-canvas-tall]').first()).toBeVisible({ timeout: 120_000 });
  } else {
    await expect(page.locator('svg[data-architecture-canvas]')).toBeVisible({ timeout: 120_000 });
  }
  // Let the resize settle before measuring.
  await page.waitForTimeout(300);

  if (width >= 720) {
    const { max, min } = await canvasLabelSizes(page);
    expect.soft(max, `largest canvas label at ${width} px`).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect.soft(min, `smallest canvas label at ${width} px`).toBeGreaterThanOrEqual(MIN_LABEL_PX - 0.05);
    if (width >= 1920) {
      // From 1920 px on, the whole drawing is in view without panning.
      const cut = await page.locator('[data-canvas-zoom]').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect.soft(cut, `canvas pans at ${width} px`).toBeLessThanOrEqual(0);
    }
  }

  const confirm = page.locator('[data-design-confirm]');
  if (width >= 1100) {
    // Beside the canvas, the panel's actions stay on screen whenever the stage
    // is: with the stage's top at the viewport's top, Confirm target is inside
    // the viewport however tall the canvas grows.
    await page.locator('[data-design-canvas-stage]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const atTop = await confirm.boundingBox();
    expect.soft(atTop!.y, `Confirm target below the fold at ${width} px`).toBeGreaterThanOrEqual(0);
    expect.soft(atTop!.y + atTop!.height, `Confirm target below the fold at ${width} px`).toBeLessThanOrEqual(height);
  }
  // Reached, nothing covers it.
  await confirm.scrollIntoViewIfNeeded();
  const box = await confirm.boundingBox();
  expect(box, 'Confirm target is laid out').not.toBeNull();
  expect.soft(box!.y + box!.height).toBeLessThanOrEqual(height);
  expect.soft(box!.x + box!.width).toBeLessThanOrEqual(width);
  const onTop = await confirm.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  });
  expect.soft(onTop, 'nothing covers Confirm target').toBe(true);

  if (width >= 1100) {
    // The panel sits beside the canvas at its fixed width, not squeezed.
    const panel = await page.locator('[data-design-panel]').boundingBox();
    expect.soft(panel!.width).toBeGreaterThanOrEqual(360);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect.soft(overflow, `sideways scroll at ${width} px`).toBeLessThanOrEqual(0);

  if (SHOTS) {
    if (width >= 720) await page.evaluate(() => window.scrollTo(0, 0));
    else await page.locator('[data-design-canvas-stage]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(SHOTS, `designfit-${name}-${width}.png`) });
  }
}

const WIDTHS: [number, number][] = [
  [390, 844],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [3400, 1440],
];

test.describe('the Design stage keeps its proportions', () => {
  test.describe.configure({ mode: 'serial' });
  let seeded: SeededProject;

  test('a signed-in project, from phone to a 3400 px window', async ({ page }) => {
    test.setTimeout(300_000);
    seeded = await seedStageProject({ prefix: 'designfit', acceptTerms: true });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
    for (const [w, h] of WIDTHS) await expectFits(page, w, h, 'project');
  });

  test('the demo, which draws the same stage', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/demo/design', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60_000 });
    for (const [w, h] of WIDTHS) await expectFits(page, w, h, 'demo');
  });
});
