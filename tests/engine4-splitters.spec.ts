import { test, expect } from '@playwright/test';
import { tokenize, tokenizeShipping } from '../lib/abap/declaration-parser';
import { plainStatements, splitStatements } from '../lib/abap/plain-language';
import { runSplitterNeutrality } from '../scripts/engine/splitter-neutrality';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Parse once, the other two splitters (3.5.0; docs/design/engine4.md, "Retiring the other splitters"):
 * `declaration-parser.tokenize` and `plain-language`'s statements read the parse-once tokens and fall back to
 * their 3.x scans wherever a reason is named. Byte for byte on a slice of the corpus and its mutations here; the
 * whole corpus and the external sample run with `scripts/engine/splitter-neutrality.ts`. Server-free.
 */
test('both splitters answer their 3.x scans byte for byte on the corpus and its mutations', () => {
  test.setTimeout(300_000);
  const r = runSplitterNeutrality(shadowCorpus().slice(0, 80));
  expect(r.samples).toEqual([]);
  expect(r.tokenize.parsed).toBeGreaterThan(1000);
  expect(r.plain.parsed).toBeGreaterThan(1000);
});

test('the fallback classes: a bare carriage return, an indented asterisk, an escaped template bar', () => {
  const cr = 'DATA a TYPE i.\rDATA b TYPE i.';
  expect(tokenize(cr)).toEqual(tokenizeShipping(cr));
  const star = 'DATA a TYPE i.\n  * not a comment for the scan\nDATA b TYPE i.';
  expect(plainStatements(star)).toEqual(splitStatements(star.split('\n')));
  const bar = "x = |a\\|b|.\nWRITE x.";
  expect(plainStatements(bar)).toEqual(splitStatements(bar.split('\n')));
});
