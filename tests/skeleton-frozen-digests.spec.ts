import { test, expect } from '@playwright/test';
import { checkSkeletonFrozen, SKELETON_ENGINES } from '../scripts/engine/skeleton-neutrality';

/**
 * The process skeleton, frozen (engine 4 phase 3; `docs/design/engine4.md`, "Phase 3").
 *
 * `engine-frozen-digests.spec.ts` freezes evidence and route; neither carries the skeleton. Phase 3 splits
 * `SkeletonBuilder` into typed passes (`lib/abap/skeleton/`), one at a time, and every pass must leave the
 * skeleton byte for byte as it was — key order included — for every engine line the skeleton reads differently
 * (3.0.23, 3.1.0, 3.2.0). `tests/fixtures/skeleton-v3.2.0-frozen.json` was captured once from `lib/` before the
 * first pass (`scripts/engine/skeleton-neutrality.ts freeze`) and is never regenerated. Server-free.
 */
test('the skeleton of every starter, learn case, learn file and probe is unchanged, on every engine line', () => {
  test.setTimeout(600_000);
  const r = checkSkeletonFrozen();
  expect(r.missing).toEqual([]);
  expect(r.compared).toBeGreaterThanOrEqual(1500);
  expect(r.moved).toEqual([]);
});

test('the engine lines frozen are the ones the skeleton reads differently', () => {
  expect([...SKELETON_ENGINES]).toEqual(['v3.0.23', 'v3.1.0', 'v3.2.0']);
});
