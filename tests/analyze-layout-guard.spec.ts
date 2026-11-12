import { test, expect } from './helpers/test';
import { ENFORCED, LAYOUT_STATES, measureStates, seedLayoutProject, summarise, VIEWPORT_GROUPS } from './helpers/analyze-layout';

/**
 * The layout guard of the Analyze rebuild, wide viewports: 1920 × 1080, 1440 × 900 and 1280 × 800
 * (plan `docs/design/analyze-business-first-plan.md` §4.1, AB-0; the other
 * group is `tests/analyze-layout-guard-narrow.spec.ts`, a file of its own so the shard plan can split them).
 *
 * The rule the accepted mockup v4.1 was built under: nothing covers anything.
 * `tests/helpers/overlap.ts` measures overlaps, clipping, focus-out and
 * sideways scroll on the product's `data-layout-*` hooks, every control,
 * heading and text block; `tests/helpers/first-screen-count.ts` counts the
 * first screen as §1.2 does. Both are proved on the mockup itself, with a
 * negative probe, in `tests/analyze-layout-mockup.spec.ts`.
 *
 * Every state is measured and the numbers are attached to the test; a
 * finding fails for a state listed in `ENFORCED`
 * (`tests/helpers/analyze-layout.ts`): 3, 7 and 17 since AB-2, which made
 * Analyze's Business view the project's entry; AB-3 adds 1, 2 and 18.
 * Needs the app and the emulators, like every rendered spec.
 */
test.describe('Analyze layout, wide viewports (states 3, 7 and 17 enforced since AB-2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Analyze in Business (states 3, 7, 17) and its IT page (state 12), measured', async ({ page }) => {
    test.setTimeout(420_000);
    const seeded = await seedLayoutProject('layout-wide');
    const measured = await measureStates(page, seeded, VIEWPORT_GROUPS.wide);
    const { text, failing } = summarise(measured);
    await test.info().attach('analyze-layout-wide.txt', { body: text, contentType: 'text/plain' });
    expect(measured.length).toBe(LAYOUT_STATES.length * VIEWPORT_GROUPS.wide.length);
    for (const m of measured) expect(m.report.items, `${m.name}: nothing measured`).toBeGreaterThan(10);
    expect(failing, `enforced states: ${ENFORCED.join(', ') || 'none yet'}`).toEqual([]);
  });
});
