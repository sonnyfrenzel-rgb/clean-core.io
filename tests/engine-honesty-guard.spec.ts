import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { diffResultSets } from '../lib/abap/result-diff';
import { matchCdsView } from '../lib/abap/cds-catalog';

/**
 * Release 5: options that were ignored, confidence that was unearned, and four
 * sentences that claimed more than they could.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const rendered = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the ordering option is read', () => {
  const A = [{ vbeln: '0001' }, { vbeln: '0002' }];
  const B = [{ vbeln: '0002' }, { vbeln: '0001' }];

  test('unordered: false compares positionally', () => {
    // `unordered` sat in DiffOptions and appeared nowhere in the body, so a
    // caller asking for ordered semantics silently got a multiset comparison and
    // was told two differently-ordered result sets were equal.
    const report = diffResultSets(A, B, { unordered: false });
    expect(report.equal).toBe(false);
    expect(report.sampleMismatch).toBeTruthy();
  });

  test('the default stays set-based, as the docstring has always promised', () => {
    // An ABAP SELECT without ORDER BY has no guaranteed row order to compare
    // against, so changing the default would have been the riskier fix.
    expect(diffResultSets(A, B).equal).toBe(true);
    expect(diffResultSets(A, B, { unordered: true }).equal).toBe(true);
  });

  test('an ordered comparison still passes on identical order', () => {
    expect(diffResultSets(A, A, { unordered: false }).equal).toBe(true);
  });

  test('and it notices a length difference', () => {
    const report = diffResultSets(A, [A[0]], { unordered: false });
    expect(report.equal).toBe(false);
    expect(report.onlyInAbap).toBe(1);
  });
});

test.describe('a table-set match is a candidate, not a proof', () => {
  test('an exact set no longer scores like a verified equivalence', () => {
    const model = {
      from: { name: 'VBAK' },
      joins: [{ table: { name: 'VBAP' } }],
      quirks: [],
    } as any;
    const match = matchCdsView(model);
    expect(match).not.toBeNull();
    // Join predicates, cardinality, selected fields and filters are all
    // invisible here. `SELECT ... FROM vbak CROSS JOIN vbap` has this same table
    // set and used to come back at 0.95.
    expect(match!.confidence).toBeLessThan(0.8);
  });

  test('the recommendation asks for a check, not a replacement', () => {
    const src = read('lib/abap/complex-join-findings.ts');
    expect(src).not.toMatch(/`Replace the join with released view/);
    expect(src).toMatch(/Check released view/);
  });
});

test.describe('no run-wide flag can declare a query verified', () => {
  const REL = 'lib/abap/complex-join-findings.ts';

  test('the flag is gone', () => {
    const src = rendered(REL);
    // One boolean for a whole run, combined with `cds?.exact`, would have marked
    // every exact match "fully verified" off a single test — or off none, since
    // its only caller would have been the fake sandbox tester removed in v2.5.0.
    expect(src).not.toContain('differentialVerified');
  });

  test('and every complex join still asks for sign-off', () => {
    const src = rendered(REL);
    expect(src).toContain("const level = 'partial';");
    expect(src).toContain('requiresSignOff: true');
  });
});

test.describe('the public text claims what it can support', () => {
  test('the privacy policy names the email and password path', () => {
    const jsx = rendered('app/datenschutz/page.tsx');
    // §3 described only Google Sign-In, although the second path has always
    // existed and processes data.
    expect(jsx).toMatch(/Email and password/i);
  });

  test('and carries the free-tier caveat the whitepaper already had', () => {
    const jsx = rendered('app/datenschutz/page.tsx');
    // The whitepaper's "Honest boundary" box said free-tier terms differ. The
    // privacy policy — the document that actually governs — said only
    // "applicable terms".
    expect(jsx).toMatch(/free-tier/i);
  });

  test('the catalog module page counts what it claims', () => {
    const src = read('app/catalog/module/[area]/page.tsx');
    // "N objects in this area carry a released successor" — while the table
    // below rendered "no released path" for some of those very rows.
    expect(src).toMatch(/rows\.filter\(\(r\) => r\.successor\)\.length/);
  });

  test('the reference run does not publish a per-request wall clock as reproducible', () => {
    const src = read('app/reference-analysis/page.tsx');
    // The page invites the reader to run the file and see the same numbers. The
    // other three figures are deterministic; this one was measured on whichever
    // instance served the request.
    expect(src).not.toMatch(/\$\{r\.durationMs\} ms/);
  });
});
