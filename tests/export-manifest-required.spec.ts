/**
 * SEC-653cff9-01 — the audit-pack export compares the run's inputs even when the
 * run recorded no input manifest.
 *
 * A missing or malformed manifest makes every live input `not-recorded`, which
 * is an invalidating reason, and the route refuses the pack: a run whose inputs
 * cannot be shown to still match is re-run, not exported. The one exception is
 * the migration promise C23-A02: a run whose signed analyzer version predates
 * the manifest (before v2.12.0) exports as it did
 * (tests/conservative-invalidity.spec.ts).
 *
 * Server-free: the verdict function is pure, and the route's wiring is read
 * from source.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INPUT_IDS, invalidatingInputs, unverifiedInputs, type InputManifest } from '../lib/input-manifest';

const LIVE = {
  [INPUT_IDS.source]: 'a'.repeat(64),
  [INPUT_IDS.deployment]: 'b'.repeat(64),
  [INPUT_IDS.catalog]: 'c'.repeat(64),
  [INPUT_IDS.ruleset]: 'd'.repeat(64),
};

test.describe('SEC-653cff9-01: no manifest, no pack', () => {
  for (const [label, recorded] of [
    ['absent (undefined)', undefined],
    ['null', null],
    ['an object without inputs', {} as unknown as InputManifest],
    ['inputs that are not a list', { hash: 'x', inputs: 'nope' } as unknown as InputManifest],
  ] as const) {
    test(`a manifest that is ${label} leaves every live input unverified and invalidating`, () => {
      const out = invalidatingInputs(unverifiedInputs(recorded, LIVE));
      expect(out.map((u) => u.id).sort()).toEqual(Object.keys(LIVE).sort());
      expect(out.every((u) => u.reason === 'not-recorded')).toBe(true);
    });
  }

  test('the export route compares every run except one signed before the manifest existed', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'api', 'audit-pack', 'create', 'route.ts'), 'utf8');
    const start = src.indexOf('const recordedManifest');
    const call = src.indexOf('unverifiedInputs(recordedManifest', start);
    expect(start, 'the route reads the recorded manifest').toBeGreaterThan(0);
    expect(call, 'and compares it').toBeGreaterThan(start);
    const between = src.slice(start, call);
    // The only way around the comparison is a run signed before v2.12.0: no manifest AND an old signed analyzer.
    expect(between).toMatch(/const signedBeforeManifest = !recordedManifest && analyzerBefore\(runData\.analyzerVersion, \[2, 12, 0\]\);/);
    expect(between).toMatch(/if \(!signedBeforeManifest\) \{/);
    const gate = between.indexOf('if (!signedBeforeManifest)');
    expect(between.slice(0, gate), 'no other condition stands before the comparison').not.toMatch(/\bif\s*\(/);
    // An unreadable analyzer version is not old: it is held to the manifest.
    const helper = src.slice(src.indexOf('function analyzerBefore'));
    expect(helper).toMatch(/if \(typeof version !== 'string'\) return false;/);
    expect(helper).toMatch(/if \(!m\) return false;/);
    // The comparison's verdict reaches the blocker list.
    expect(src.slice(call, call + 400)).toMatch(/blockers\.push\(\{\s*code:\s*'inputs-unverified'/);
  });
});
