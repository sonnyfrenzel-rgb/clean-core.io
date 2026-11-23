import { test, expect } from './helpers/test';
import { PHASES } from '../lib/workflow-steps';

/**
 * Roadmap 0.2, UX-102 — the follow-up on the public landing page.
 *
 * `/how-to` was rebuilt on 17.09.2026 to describe the seven phases the product
 * has. The landing page kept showing the six it used to: `LandingSlideshow` ran
 * six screenshots taken in July (`public/screenshots/step-1…6.jpg`), each one
 * photographing a stepper with "Upload" as a phase of its own, no Economics and
 * Testing before Documentation, under badges the product has since removed from
 * its own screens — and the section lead spelled that six-step lifecycle out in
 * words. It is the public page, so a visitor was shown a workflow that does not
 * exist before they had signed in to find out.
 *
 * Both checks read the rendered page, for the reason `landing-style-guard`
 * gives: a source check passes for a component that holds a literal of its own.
 *
 *   1. The section is `PHASES` — count, order and labels — so the landing page
 *      and /how-to cannot describe two different products again.
 *   2. Nothing in the section advertises what the product does not do. The five
 *      badges are the ones `tests/claims-honesty-guard.spec.ts` already forbids
 *      inside the product; they were being shown outside it, in a picture, where
 *      that guard does not look.
 */

/** What the July pictures and captions claimed, in the words they used. */
const RETIRED_CLAIMS = [
  'AI Verified',
  'Strict Legacy Mode',
  'SAP Build-Compatible',
  'Ready for Deployment',
  'Estimated Coverage',
  'Confluence integration',
];

test.describe('the landing page shows the phases the product has', () => {
  test('the seven phases, in the product order, with the product labels', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });

    // Since the landing page 3.5 a row of seven tools in "What happens after the
    // decision?" (#after): one item per phase (`[data-landing-phase]`) with the
    // product label (`[data-landing-phase-title]`). The 3.0 timeline with a panel
    // and a capture per phase retired with the accepted mockup; what the tools
    // produce is said in the section's lead and its reader lines.
    const items = page.locator('#after [data-landing-phase]');
    await expect(items).toHaveCount(PHASES.length);
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute('data-landing-phase')))).toEqual(
      PHASES.map((p) => p.key),
    );
    expect(await page.locator('#after [data-landing-phase-title]').allInnerTexts()).toEqual(PHASES.map((p) => p.label));
    // The section says something about them, in the HTML — a bare row of names
    // would satisfy the order check.
    const section = (await page.locator('#after').evaluate((el) => el.textContent ?? '')).trim();
    expect(section.length, '#after has no text beside the names').toBeGreaterThan(400);
  });

  test('no July screenshot is served or referenced any more', async ({ page }) => {
    test.setTimeout(240_000);
    const requested: string[] = [];
    page.on('request', (r) => {
      if (/\/screenshots\/step-\d+\.jpg/.test(r.url())) requested.push(r.url());
    });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    // The slideshow preloaded all six into a hidden div, so "visible" is not the test.
    const srcs = await page.locator('img').evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src));
    expect(srcs.filter((s) => /\/screenshots\/step-/.test(s)), 'a July step screenshot is still on the page').toEqual([]);
    expect(requested, 'the page still fetches a July step screenshot').toEqual([]);

    // And the files are gone, so nothing can link them either.
    const res = await page.request.get('/screenshots/step-1.jpg');
    expect(res.status(), 'public/screenshots/step-1.jpg is still being served').toBe(404);
  });

  test('the process section advertises nothing the product does not do', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    // Since the landing page 3.5 the seven tools sit in #after; #process is the map.
    const section = await page.locator('#after').innerText();

    for (const claim of RETIRED_CLAIMS) {
      expect(section.toLowerCase(), `"${claim}" is back on the landing page`).not.toContain(claim.toLowerCase());
    }
    // "Upload" as a phase of its own is the tell that the July stepper is back.
    expect(
      await page.locator('[data-landing-phase-title]').allInnerTexts(),
      'Upload is not a phase of this product',
    ).not.toContain('Upload');
  });
});
