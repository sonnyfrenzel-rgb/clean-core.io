import { test, expect } from '@playwright/test';
import { measureScaling, SCALING_LIMIT } from '../scripts/engine/scaling-guard';

/**
 * The pipeline scaling guard (roadmap 3.5.0 item 2; engine review §4.3 and
 * §11 phase 0): twice the input may take at most 2.4 times as long in
 * `buildAbapEvidence`, at 1k, 10k and 25k lines. Before parse once the step
 * from 10k to 20k lines took 3.3 times as long and 25k lines took 32 s; the
 * numbers since are in docs/design/engine4.md, "Phase 0 wiring". Server-free.
 */
test('2x input costs at most 2.4x time at 1k, 10k and 25k lines', () => {
  test.setTimeout(600_000);
  const rows = measureScaling(3);
  const report = rows.map((r) => `${r.lines}: ${Math.round(r.single)} ms -> ${Math.round(r.double)} ms (${r.factor.toFixed(2)}x)`).join('; ');
  for (const r of rows) expect(r.factor, report).toBeLessThanOrEqual(SCALING_LIMIT);
});
