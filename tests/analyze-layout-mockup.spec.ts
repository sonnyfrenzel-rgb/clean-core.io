import { test, expect } from './helpers/test';
import path from 'path';
import { pathToFileURL } from 'url';
import { layoutLine, measureLayout, type LayoutCheckOptions } from './helpers/overlap';
import { countFirstScreen } from './helpers/first-screen-count';

/**
 * The layout check proved on the accepted mockup itself (plan
 * `docs/design/analyze-business-first-plan.md`, AB-0).
 *
 * `tests/helpers/overlap.ts` is the mockup's own check, moved into the suite.
 * Before it judges the product it has to show two things on the picture it was
 * taken from: the accepted states measure clean, as the mockup run reported
 * (0 overlaps, 0 clipping, 0 focus-out, no sideways scroll), and a card moved
 * over the map turns it red. A check that passes everything passes this
 * spec's first half and fails its second.
 *
 * No server: the mockup is a file (`file://`), with no network and no script
 * from outside. The states are the ones v3.1.0 builds (§4.1): 1 and 2 (names
 * arriving), 3 (names ready), 7 (code on click), 17 (return visit), 18 (a
 * larger program), at the six viewports of [look].
 */

const MOCKUP = pathToFileURL(path.resolve(__dirname, '..', 'docs/roadmap/analyze-business-first-mockup.html')).href;

const STATES = [
  ['early', '01'],
  ['mid', '02'],
  ['ready', '03'],
  ['code', '07'],
  ['ret', '17'],
  ['complex', '18'],
] as const;

const VIEWPORTS = [
  ['1920x1080', 1920, 1080],
  ['1440x900', 1440, 900],
  ['1280x800', 1280, 800],
  ['1024x768', 1024, 768],
  ['768x1024', 768, 1024],
  ['phone', 390, 844],
] as const;

/** The mockup's classes, as its own run checked them; the product is checked on `data-layout-*` hooks instead. */
function mockupLayout(width: number): LayoutCheckOptions {
  return {
    items:
      'svg.map text, svg.map .badge, .card, .sumcard, .mapcard, .fscanvas, .maptools, .status, .mapnote, .tour, .codepanel, .strip, .ctx, .way, .walked, .panel, .fsbar, .palette, .indic, button, a, [role=radio], .fsfind, .search, p, h1, h2, h3, h4, li, td, th, .code, .chart, .lv, .anc, .pv, .mtag',
    ignore: '#mock',
    sameSlot: { group: '.el', part: '.nm' },
    within: [{ scope: 'svg.map', items: '.el text, .fl text', boxes: '.band rect' }],
    focus: {
      frame: '#mapcard',
      targets: width < 600 ? 'svg.map .el.prime .sh, svg.map .el.sel .sh' : 'svg.map .el.here .sh, svg.map .el.sel .sh',
    },
    tolerance: 2,
  };
}

test.describe('the layout check, on the accepted mockup', () => {
  for (const [vn, width, height] of VIEWPORTS) {
    test(`the v3.1.0 states measure clean at ${vn}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const lines: string[] = [];
      const dirty: string[] = [];
      for (const [state, number] of STATES) {
        await page.goto(`${MOCKUP}#state=${state}&embed=1`);
        // The mockup sets its state from the address once; a hash change alone does not re-render it.
        await page.reload();
        await page.waitForTimeout(450);
        const report = await measureLayout(page, mockupLayout(width));
        lines.push(layoutLine(`${number}-${state}@${vn}`, report));
        const findings = [...report.overlaps, ...report.clipped, ...report.focusOut.map((f) => `focus out: ${f}`)];
        if (report.overflowX > 0) findings.push(`page scrolls sideways by ${report.overflowX}px`);
        for (const f of findings) dirty.push(`${number}-${state}@${vn}: ${f}`);
        expect(report.items, `${state}@${vn}: the check found nothing to measure`).toBeGreaterThan(20);
      }
      await test.info().attach(`layout-${vn}.txt`, { body: lines.join('\n'), contentType: 'text/plain' });
      expect(dirty).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('a card moved over the map turns the check red (negative probe)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${MOCKUP}#state=ready&embed=1`);
    await page.reload();
    await page.waitForTimeout(450);
    const before = await measureLayout(page, mockupLayout(1440));
    expect(before.overlaps).toEqual([]);
    // The summary card, lifted out of the flow and laid over the map card.
    const moved = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.sumcard') ?? document.querySelector<HTMLElement>('.card');
      const map = document.querySelector<HTMLElement>('#mapcard');
      if (!card || !map) return false;
      const m = map.getBoundingClientRect();
      card.style.position = 'fixed';
      card.style.left = `${m.left + 40}px`;
      card.style.top = `${Math.max(m.top, 0) + 40}px`;
      card.style.width = `${Math.min(m.width - 80, 560)}px`;
      card.style.zIndex = '50';
      return true;
    });
    expect(moved, 'the mockup has a card and a map to move it over').toBe(true);
    const after = await measureLayout(page, mockupLayout(1440));
    expect(after.overlaps.length, 'the check must see a card lying on the map').toBeGreaterThan(0);
  });

  test('the first screen of state 3 counts what §1.2 reports for the mockup', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${MOCKUP}#state=ready&embed=1`);
    await page.reload();
    await page.waitForTimeout(450);
    const count = await countFirstScreen(page, { root: 'main', shell: '', primary: '.btn.primary' });
    await test.info().attach('first-screen-ready-1440.json', { body: JSON.stringify(count), contentType: 'application/json' });
    // §1.2: 18 controls at 1440 × 900 once the names are ready, and one primary button while the tour is offered.
    expect(count.actions).toBe(18);
    expect(count.primary).toBe(1);
  });
});
