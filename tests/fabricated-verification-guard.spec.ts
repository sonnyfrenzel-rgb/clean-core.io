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
    // The whole page's code, comments taken out: the history comment that says
    // what the tester did and why it went may name it. Slicing from the first
    // `return (` stopped meaning "the markup" once an earlier function returned
    // JSX (3.0.12), and then caught that comment instead of any code.
    const code = transformation()
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const gone of ['Differential Sandbox Tester', 'ResultSet Equivalence', '243 rows', 'diffTestStatus', 'runDiffTest']) {
      expect(code, `${gone} came back`).not.toContain(gone);
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

  test('Testing holds no tenant read any more, so it can claim none (ADR-131 (5))', () => {
    // The read-only OData call stood in Testing's tenant section; since 3.5.0 the tenant connection is "Your SAP
    // test system" in Settings and Testing links there. What Testing renders cannot claim a read it does not do.
    const s = testing();
    expect(s).not.toContain("'/api/test-s4-odata-read'");
    expect(s).not.toContain('handleReadEntitySet');
    const rendered = s.slice(s.indexOf('return ('));
    for (const overclaim of ['Equivalence', 'Type coercion holds', 'rows fetched']) {
      expect(rendered, `Testing renders "${overclaim}"`).not.toContain(overclaim);
    }
    expect(rendered).not.toMatch(/signedOff/);
  });
});
