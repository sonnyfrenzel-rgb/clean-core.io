import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * No screen may report a verification it did not perform.
 *
 * Stage 3 carried a "Differential Sandbox Tester": a button that waited 1200ms on
 * a setTimeout and then rendered "ResultSet Equivalence Verified" over
 * "S/4HANA: 243 rows fetched / TypeScript Node.js: 243 items compared" — with 243
 * a literal in the markup. It executed nothing and contacted nothing. Worse, the
 * same callback added the complex-sql-join finding to `signedOffIds`, which feeds
 * the compliance figure on that page, so a timer raised a score and signed a
 * finding off.
 *
 * The capability it mimed is real and now lives in stage 5, where the tenant
 * connection actually exists. These tests pin both halves: the fake stays gone,
 * and the real one does not grow the claim the fake made.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the fabricated sandbox test stays gone', () => {
  const transformation = () => read('app/(app)/project/[projectId]/transformation/page.tsx');

  test('stage 3 has no differential tester', () => {
    const s = transformation();
    const rendered = s.slice(s.indexOf('return ('));
    for (const gone of ['Differential Sandbox Tester', 'ResultSet Equivalence', '243 rows', 'diffTestStatus', 'runDiffTest']) {
      expect(rendered, `${gone} came back`).not.toContain(gone);
    }
  });

  test('nothing in stage 3 signs a finding off on a timer', () => {
    const s = transformation();
    // `signedOffIds` may only grow from an explicit user sign-off action, never
    // from a setTimeout callback pretending a test ran.
    const timers = [...s.matchAll(/setTimeout\(([\s\S]{0,400}?)\},\s*\d+\)/g)];
    for (const t of timers) {
      expect(t[1], 'a setTimeout writes to signedOffIds').not.toContain('setSignedOffIds');
    }
  });
});

test.describe('the real read in stage 5 claims only what it did', () => {
  const testing = () => read('app/(app)/project/[projectId]/testing/page.tsx');

  test('it calls the route instead of simulating one', () => {
    const s = testing();
    expect(s).toContain('handleReadEntitySet');
    expect(s).toContain("'/api/test-s4-odata-read'");
    // The count shown has to be the one that came back.
    expect(s).toContain('result.recordCount');
  });

  test('it does not claim equivalence, and signs nothing off', () => {
    const s = testing();
    // The rendered output only — the doc comment above the handler names the
    // claim it replaced, which is how the next person learns why it is absent.
    const rendered = s.slice(s.indexOf('return ('));
    for (const overclaim of ['Equivalence', 'Type coercion holds', 'rows fetched']) {
      expect(rendered, `stage 5 renders "${overclaim}"`).not.toContain(overclaim);
    }
    const idx = s.indexOf('const handleReadEntitySet');
    const body = s.slice(idx, s.indexOf('\n  };\n', idx));
    expect(body, 'the read signs a finding off').not.toContain('signedOff');
    // It says out loud that it is a read and not a comparison.
    expect(body).toContain('not a comparison');
  });

  test('no row count in the read path is a literal', () => {
    const s = testing();
    const idx = s.indexOf('const handleReadEntitySet');
    const body = s.slice(idx, s.indexOf('\n  };\n', idx));
    expect(body).not.toMatch(/\b\d{2,}\s+(rows|records|items)\b/i);
  });
});
