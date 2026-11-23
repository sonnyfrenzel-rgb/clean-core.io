import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

test('the capture runs on main only: dispatched on another ref, nothing is captured or pushed (QA 8bcde2dc4871)', () => {
  const wf = readFileSync('.github/workflows/engine-release-capture.yml', 'utf8').replace(/\r\n/g, '\n');
  const jobs = wf.slice(wf.indexOf('\njobs:\n'));
  const job = (name: string) => {
    const start = jobs.indexOf(`\n  ${name}:\n`);
    expect(start).toBeGreaterThan(-1);
    const rest = jobs.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };
  expect(wf).toMatch(/\n {2}push:\n {4}branches: \[main\]\n/);
  expect(job('capture')).toMatch(/\n {4}if: github\.ref == 'refs\/heads\/main'\n/);
  // The job with the write token runs only after a capture on main, never on its own.
  expect(job('push')).toMatch(/\n {4}needs: capture\n/);
  expect(job('push')).not.toMatch(/always\(\)|!cancelled\(\)/);
});

test('a new capture never force-pushes over a capture that has not reached main yet (QA 03ae7fa40a1e)', () => {
  const wf = readFileSync('.github/workflows/engine-release-capture.yml', 'utf8').replace(/\r\n/g, '\n');
  const refuse = wf.indexOf('- name: Refuse to replace an unintegrated capture');
  const force = wf.indexOf('push --force');
  expect(refuse).toBeGreaterThan(-1);
  expect(force).toBeGreaterThan(refuse);
  const step = wf.slice(refuse, wf.indexOf('\n      - name:', refuse + 1));
  expect(step).toContain('compare/main...chore/engine-release-capture');
  expect(step).toMatch(/if \[ "\$ahead" != "0" \]; then[\s\S]*?exit 1/);
});
