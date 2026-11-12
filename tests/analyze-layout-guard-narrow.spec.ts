import { test, expect } from './helpers/test';
import { ENFORCED, measureStates, seedLayoutProject, summarise, VIEWPORT_GROUPS } from './helpers/analyze-layout';

/**
 * The layout guard of the Analyze rebuild, narrow viewports: 1024 × 768, 768 × 1024 and the phone (390 × 844)
 * (plan `docs/design/analyze-business-first-plan.md` §4.1, AB-0; the other
 * group is `tests/analyze-layout-guard.spec.ts`, a file of its own so the shard plan can split them).
 *
 * The rule the accepted mockup v4.1 was built under: nothing covers anything.
 * `tests/helpers/overlap.ts` measures overlaps, clipping, focus-out and
 * sideways scroll on the product's `data-layout-*` hooks, every control,
 * heading and text block; `tests/helpers/first-screen-count.ts` counts the
 * first screen as §1.2 does. Both are proved on the mockup itself, with a
 * negative probe, in `tests/analyze-layout-mockup.spec.ts`.
 *
 * **Report-only until AB-2**: today's pages are measured and the numbers are
 * attached to the test; a finding fails only for a state listed in
 * `ENFORCED` (`tests/helpers/analyze-layout.ts`), which AB-2 and AB-3 fill.
 * Needs the app and the emulators, like every rendered spec.
 */
test.describe('Analyze layout, narrow viewports (report-only until AB-2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('today\'s Business view and Analyze page, measured', async ({ page }) => {
    test.setTimeout(420_000);
    const seeded = await seedLayoutProject('layout-narrow');
    const measured = await measureStates(page, seeded, VIEWPORT_GROUPS.narrow);
    const { text, failing } = summarise(measured);
    await test.info().attach('analyze-layout-narrow.txt', { body: text, contentType: 'text/plain' });
    expect(measured.length).toBe(2 * VIEWPORT_GROUPS.narrow.length);
    for (const m of measured) expect(m.report.items, `${m.name}: nothing measured`).toBeGreaterThan(10);
    expect(failing, `enforced states: ${ENFORCED.join(', ') || 'none yet'}`).toEqual([]);
  });
});
