import { test, expect } from '@playwright/test';
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

    const cards = page.locator('[data-landing-phase]');
    await expect(cards).toHaveCount(PHASES.length);
    expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-landing-phase')))).toEqual(
      PHASES.map((p) => p.key),
    );
    expect(await page.locator('[data-landing-phase-title]').allInnerTexts()).toEqual(PHASES.map((p) => p.label));

    // Every card says something. An empty card would satisfy the order check.
    for (const phase of PHASES) {
      const card = page.locator(`[data-landing-phase="${phase.key}"]`);
      expect((await card.innerText()).trim().length, `${phase.key} has no text`).toBeGreaterThan(80);
    }
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
    // Since 3.0.6 the seven stages sit in the showroom section; #process is the BPMN section.
    const section = await page.locator('#showroom').innerText();

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
