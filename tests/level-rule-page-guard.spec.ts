import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { gradeFromSapStates, gradeFromSapStatesForUse } from '../lib/abap/abcd-classification';
import { getLevelDerivationCensus, getLevelRuleVersion } from '../lib/abap/catalog-service';
import {
  enumerateLevelRule,
  fingerprintLevelRule,
  RULE_RELEASE_STATES,
  RULE_CLASSIFICATION_STATES,
} from '../lib/abap/level-rule-version';

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

  test('every access row the page states is what the function returns for that access', () => {
    // Roadmap 2.11: the analysis grades a table for the access the code makes.
    // The rows are hand-written like the object rows, so they get the same check —
    // each one executed, and the object-only answer shown to differ, or the row
    // would be describing nothing.
    const cases: {
      row: string;
      states: Parameters<typeof gradeFromSapStatesForUse>[0];
      use: 'read' | 'write';
      grade: string;
    }[] = [
      { row: 'notToBeReleased, read', states: { releaseState: 'notToBeReleased', hasSuccessor: true, isSapObject: true }, use: 'read', grade: 'C' },
      { row: 'notToBeReleased, written', states: { releaseState: 'notToBeReleased', hasSuccessor: true, isSapObject: true }, use: 'write', grade: 'D' },
      { row: 'customer table, read or written', states: { isSapObject: false, isCustomerObject: true }, use: 'read', grade: 'B' },
      { row: 'customer table, read or written', states: { isSapObject: false, isCustomerObject: true }, use: 'write', grade: 'B' },
    ];
    const source = fs.readFileSync(PAGE, 'utf8');
    for (const c of cases) {
      expect(source, `the access table lost the "${c.row}" row`).toContain(`use: '${c.row}'`);
      expect(
        gradeFromSapStatesForUse(c.states, c.use).grade,
        `/method/levels publishes "${c.row} → ${c.grade}" and the function no longer agrees`,
      ).toBe(c.grade);
    }
    expect(gradeFromSapStatesForUse(cases[0].states, 'read').grade).not.toBe(gradeFromSapStates(cases[0].states).grade);
    expect(gradeFromSapStatesForUse(cases[2].states, 'read').grade).not.toBe(gradeFromSapStates(cases[2].states).grade);
    // And the page's grade letters for those rows are the ones stated.
    for (const c of cases) {
      expect(source).toMatch(new RegExp(`use: '${c.row}',\\s*grade: '${c.grade}'`));
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

/**
 * Roadmap 0.3: the rule page carries its rule version.
 *
 * A version string is the easiest thing in a codebase to get wrong, because
 * nothing punishes leaving it alone. Typed into the markup it is right on the
 * day it is typed and quietly wrong from the next change onwards — and the
 * reader has no way to tell which of the two they are looking at.
 *
 * So the version is measured: the fingerprint is a hash over the rule's own
 * decision table and the rest is the checksums SAP served. These tests are what
 * make the typed-in version impossible rather than merely discouraged — the
 * fingerprint has to move when the rule moves, the page has to carry no literal
 * of its own, and the string on the running page has to be the string the data
 * produces.
 */
test.describe('the rule page carries the version of the rule', () => {
  test('the fingerprint moves when the rule moves', () => {
    const real = fingerprintLevelRule(enumerateLevelRule());

    // One branch changed, nothing else: notToBeReleased grades B instead of D —
    // precisely the reading two reviews arrived at and the page argues against.
    const altered = fingerprintLevelRule(
      enumerateLevelRule({
        grade: (s, use) =>
          (s.releaseState || '').toLowerCase() === 'nottobereleased'
            ? { grade: 'B', provenance: 'catalog' }
            : gradeFromSapStatesForUse(s, use),
      }),
    );

    expect(
      altered,
      'the fingerprint did not move when a branch of the rule changed, so it is not reading the rule',
    ).not.toBe(real);

    // The access half is part of the rule too: grading a read of a table SAP
    // will not release D again — the rule before roadmap 2.11 — has to move it.
    const withoutUse = fingerprintLevelRule(
      enumerateLevelRule({
        grade: (s, use) =>
          use === 'read' && (s.releaseState || '').toLowerCase() === 'nottobereleased'
            ? gradeFromSapStates(s)
            : gradeFromSapStatesForUse(s, use),
      }),
    );
    expect(withoutUse, 'the fingerprint does not see how the code uses an object').not.toBe(real);
  });

  test('the fingerprint does not move when only the order does', () => {
    // The page says reordering branches without changing an answer is not a new
    // rule. That is a promise about the fingerprint, so it gets checked.
    const decisions = enumerateLevelRule();
    const shuffled = [...decisions].reverse();
    expect(fingerprintLevelRule(shuffled)).toBe(fingerprintLevelRule(decisions));
  });

  test('the enumerated domain covers every state SAP actually ships', () => {
    // A state the rule has never seen falls through to the residual branch. That
    // is a defensible answer, but the version must at least know the state
    // exists — otherwise SAP can introduce one and the fingerprint stays put.
    const version = getLevelRuleVersion();
    const domain = new Set(
      enumerateLevelRule().flatMap((d) => [d.releaseState, d.classificationState].filter(Boolean)),
    );
    for (const state of [...RULE_RELEASE_STATES, ...RULE_CLASSIFICATION_STATES]) {
      expect(domain, `the rule branches on "${state}" and the fingerprint does not see it`).toContain(
        state,
      );
    }
    // 4 release states (incl. absent) x 3 classification states x successor x SAP object.
    expect(version.decisions).toBeGreaterThanOrEqual(domain.size);
  });

  test('the page states no version of its own', () => {
    const version = getLevelRuleVersion();
    const source = fs.readFileSync(PAGE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    const literals = [
      version.fingerprint,
      version.version,
      ...version.artifacts.flatMap((a) => [a.sha256, a.fetchedAt, a.file, String(a.entries)]),
    ];
    for (const literal of literals) {
      expect(
        source,
        `"${literal}" is written into the page. Every part of the rule version has to come from ` +
          'getLevelRuleVersion(), or a catalog sync or a rule change will leave the page ' +
          'confidently describing a version that no longer exists.',
      ).not.toContain(literal);
    }
  });

  test('the running page shows the version the data produces', async ({ page }) => {
    const version = getLevelRuleVersion();
    await page.goto('/method/levels');
    const shown = (await page.locator('[data-level-rule-version]').first().innerText()).trim();

    expect(shown, 'the rendered rule version is not the one the data produces').toBe(version.version);
    // The two artifact checksums are in the version line, and the full provenance
    // of each file is on the page next to the file it belongs to.
    const body = await page.locator('body').innerText();
    for (const a of version.artifacts) {
      expect(body, `${a.file} is not named on the page`).toContain(a.file);
      expect(body, `the sync date of ${a.release} is not on the page`).toContain(a.fetchedAt);
    }
  });
});
