import { test, expect } from '@playwright/test';
import { checkFrozen, frozenFiles } from '../scripts/engine/frozen-digests';

/**
 * Frozen digests per release (roadmap 3.4.0 item (4), was 3.5.0 item 2; engine review §4.2 C):
 * every `tests/fixtures/engine-v*-frozen.json` of format 2 or 3 holds what one
 * release's engine answered (evidence and route, both editions) for the
 * starter examples, the benchmark learn halves (never the holdout) and the
 * probes. The engine of today, called with that release's version, must answer
 * the same byte for byte: a change that leaks past its gate, or a refactor that
 * is not neutral (parse once), moves a digest. Captured with
 * `scripts/engine/frozen-digests.ts capture` in the release workflow
 * (`.github/workflows/engine-release-capture.yml`), never regenerated. Format 3 (from
 * 3.4.0) adds the process skeleton, the business statements and the engine digest. The v3.0.11 and
 * v3.0.12 files (which also cover the holdout) stay with
 * `engine-version-rebuild.spec.ts`. Server-free.
 */
test('there is a frozen file for the current engine line', () => {
  expect(frozenFiles()).toContain('engine-v3.2.0-frozen.json');
});

for (const name of frozenFiles()) {
  test(`${name}: every program and probe, both editions, byte for byte`, () => {
    test.setTimeout(600_000);
    const r = checkFrozen(name);
    expect(r.missing).toEqual([]);
    expect(r.compared).toBeGreaterThanOrEqual(300);
    expect(r.moved).toEqual([]);
  });
}
