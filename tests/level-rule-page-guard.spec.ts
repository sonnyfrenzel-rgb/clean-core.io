import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { gradeFromSapStates } from '../lib/abap/abcd-classification';
import { getLevelDerivationCensus } from '../lib/abap/catalog-service';

/**
 * A published rule that drifts from the code is worse than no published rule.
 *
 * /method/levels exists because two independent reviews read the derivation in
 * source and both got it backwards. The page fixes that by writing the
 * precedence out — which only helps for as long as the page and the function
 * still agree. Prose cannot be type-checked, so it gets checked here instead:
 * every branch the page claims is executed against the real function, and the
 * grade it prints has to be the grade that comes back.
 *
 * The page deliberately hand-writes its rule list rather than generating it from
 * the function. A generated list would agree with itself no matter what the
 * function did, which is exactly the reassurance nobody needs.
 */

const PAGE = path.resolve(__dirname, '..', 'app/method/levels/page.tsx');

test.describe('the published rule matches the code it describes', () => {
  test('every branch the page states is the branch the function takes', () => {
    // Same inputs the page's rows describe, in the same order.
    const cases: { row: string; states: Parameters<typeof gradeFromSapStates>[0]; grade: string }[] = [
      { row: 'released', states: { releaseState: 'released', isSapObject: true }, grade: 'A' },
      { row: 'notToBeReleased', states: { releaseState: 'notToBeReleased', isSapObject: true }, grade: 'D' },
      { row: 'deprecated + successor', states: { releaseState: 'deprecated', hasSuccessor: true, isSapObject: true }, grade: 'C' },
      { row: 'deprecated, no successor', states: { releaseState: 'deprecated', hasSuccessor: false, isSapObject: true }, grade: 'D' },
      { row: 'classicAPI', states: { classificationState: 'classicAPI', isSapObject: true }, grade: 'B' },
      { row: 'noAPI', states: { classificationState: 'noAPI', isSapObject: true }, grade: 'D' },
      { row: 'listed in neither file', states: { isSapObject: true }, grade: 'C' },
    ];

    for (const c of cases) {
      expect(
        gradeFromSapStates(c.states).grade,
        `/method/levels publishes "${c.row} → ${c.grade}" and the function no longer agrees`,
      ).toBe(c.grade);
    }
  });

  test('the page lists every branch, and no branch it does not have', () => {
    const source = fs.readFileSync(PAGE, 'utf8');
    for (const state of [
      'released',
      'notToBeReleased',
      'deprecated + successor',
      'deprecated, no successor',
      'classicAPI',
      'noAPI',
      'listed in neither file',
    ]) {
      expect(source, `the rule table lost the "${state}" row`).toContain(`state: '${state}'`);
    }
  });

  test('the page states no count of its own', () => {
    const source = fs.readFileSync(PAGE, 'utf8');
    // The contested figure is the one most likely to be typed in and then go
    // stale, so it is computed. Catch a literal 22 or 21 written into the prose.
    expect(
      source.replace(/\/\*[\s\S]*?\*\//g, ''),
      'a count is hardcoded in the page. Every figure has to come from ' +
        'getLevelDerivationCensus(), or a catalog sync will silently make the ' +
        'page wrong about its own data.',
    ).not.toMatch(/>\s*2[12]\s+objects/);
  });
});

test.describe('the census the page prints is derived from the artifacts', () => {
  test('the pairing counts add up to the catalog', () => {
    const census = getLevelDerivationCensus();
    const summed = census.combinations.reduce((n, c) => n + c.objects, 0);
    expect(summed).toBe(census.totalObjects);
  });

  test('the overlap is counted from the intersection, not inferred', () => {
    const census = getLevelDerivationCensus();
    expect(census.releaseFileOnly + census.classificationFileOnly + census.inBoth).toBe(
      census.totalObjects,
    );
    // The contested rows are the reason the page exists; if the data ever stops
    // containing them, the worked example on the page is describing nothing.
    const contested = census.combinations.filter(
      (c) => c.releaseState && c.classificationState && c.grade !== 'A',
    );
    expect(contested.length).toBeGreaterThan(0);
  });

  test('the successor count is measured, not assumed to be all-but-one', () => {
    const census = getLevelDerivationCensus();
    for (const c of census.combinations) {
      expect(c.withSuccessor).toBeLessThanOrEqual(c.objects);
      expect(c.withSuccessor).toBeGreaterThanOrEqual(0);
    }
    // A deprecated object grades C precisely when SAP named a replacement, so
    // that row is the one place the two numbers must agree exactly — and it is
    // how we know withSuccessor is reading the artifact rather than guessing.
    const deprecatedWithSuccessor = census.combinations.find(
      (c) => c.releaseState === 'deprecated' && !c.classificationState && c.grade === 'C',
    );
    expect(deprecatedWithSuccessor).toBeDefined();
    expect(deprecatedWithSuccessor!.withSuccessor).toBe(deprecatedWithSuccessor!.objects);

    const deprecatedWithout = census.combinations.find(
      (c) => c.releaseState === 'deprecated' && !c.classificationState && c.grade === 'D',
    );
    expect(deprecatedWithout).toBeDefined();
    expect(deprecatedWithout!.withSuccessor).toBe(0);
  });
});
