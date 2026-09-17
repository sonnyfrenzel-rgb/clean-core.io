/**
 * F-05: unit coverage for the A/B/C/D + Unknown clean-core readiness derivation.
 * Pure-function tests (no page/server) — asserts the derivation is honest:
 * missing evidence yields Unknown (not a guessed grade), and objects roll up to
 * their worst finding.
 */
import { test, expect } from '@playwright/test';
import {
  gradeFromCoupling,
  gradeFromInventory,
  gradeFromCatalogState,
  gradeFromSapStates,
  gradeFromSapStatesForUse,
  gradeKey,
  objectUseFromAccess,
  isCustomerObject,
  gradeDistribution,
  worstGrade,
  ABCD_META,
  ALL_GRADES,
} from '../lib/abap/abcd-classification';
import {
  gradeSapObject,
  gradeSapObjectUse,
  gradeSapObjectUses,
  getPublishedGradeDistribution,
} from '../lib/abap/catalog-service';
import { readFileSync } from 'fs';
import { join } from 'path';

test.describe('A/B/C/D readiness derivation', () => {
  test('gradeFromCoupling maps access + risk to A/B/C/D', () => {
    expect(gradeFromCoupling({ accessType: 'Read', riskLevel: 'Low' })).toBe('A');
    expect(gradeFromCoupling({ accessType: 'Read', riskLevel: 'Medium' })).toBe('B');
    expect(gradeFromCoupling({ accessType: 'Read', riskLevel: 'High' })).toBe('C');
    expect(gradeFromCoupling({ accessType: 'Write', riskLevel: 'Medium' })).toBe('C');
    expect(gradeFromCoupling({ accessType: 'Write', riskLevel: 'High' })).toBe('D');
  });

  test('gradeFromCoupling returns Unknown when risk evidence is missing', () => {
    expect(gradeFromCoupling({ accessType: 'Read' })).toBe('Unknown');
    expect(gradeFromCoupling({ accessType: 'Write', riskLevel: '' })).toBe('Unknown');
  });

  test('gradeFromInventory maps type + criticality, Unknown on missing criticality', () => {
    expect(gradeFromInventory({ type: 'Dynpro' })).toBe('D');
    expect(gradeFromInventory({ type: 'Screen' })).toBe('D');
    expect(gradeFromInventory({ type: 'Class', criticality: 'High' })).toBe('C');
    expect(gradeFromInventory({ type: 'Class', criticality: 'Low' })).toBe('A');
    expect(gradeFromInventory({ type: 'Class', criticality: 'Medium' })).toBe('B');
    expect(gradeFromInventory({ type: 'Class' })).toBe('Unknown');
  });

  test('gradeFromCatalogState maps release state, Unknown on unknown state', () => {
    expect(gradeFromCatalogState('released')).toBe('A');
    expect(gradeFromCatalogState('notToBeReleased')).toBe('D');
    expect(gradeFromCatalogState('deprecated', true)).toBe('C');
    expect(gradeFromCatalogState('deprecated', false)).toBe('D');
    expect(gradeFromCatalogState(undefined)).toBe('Unknown');
    expect(gradeFromCatalogState('mystery-state')).toBe('Unknown');
  });

  test('worstGrade rolls up to the most severe finding', () => {
    expect(worstGrade(['A', 'C', 'B'])).toBe('C');
    expect(worstGrade(['A', 'A'])).toBe('A');
    expect(worstGrade(['B', 'D', 'C'])).toBe('D');
    expect(worstGrade(['Unknown', 'A'])).toBe('A');       // Unknown ignored when something is assessable
    expect(worstGrade(['Unknown', 'Unknown'])).toBe('Unknown');
    expect(worstGrade([])).toBe('A');                      // no findings → clean
  });

  test('gradeDistribution counts all five buckets', () => {
    const dist = gradeDistribution(['A', 'A', 'C', 'Unknown']);
    expect(dist).toEqual({ A: 2, B: 0, C: 1, D: 0, Unknown: 1 });
  });

  test('ABCD_META covers every grade including Unknown', () => {
    for (const g of ALL_GRADES) {
      expect(ABCD_META[g]).toBeTruthy();
      expect(ABCD_META[g].badge).toBeTruthy();
      expect(ABCD_META[g].atcReading).toBeTruthy();
    }
  });
});

test.describe('catalog-backed A/B/C/D grading (SAP published data)', () => {
  test('maps each SAP state to its clean core level', () => {
    expect(gradeFromSapStates({ releaseState: 'released' })).toMatchObject({ grade: 'A', provenance: 'catalog' });
    expect(gradeFromSapStates({ classificationState: 'classicAPI' })).toMatchObject({ grade: 'B', provenance: 'catalog' });
    expect(gradeFromSapStates({ classificationState: 'noAPI' })).toMatchObject({ grade: 'D', provenance: 'catalog' });
    expect(gradeFromSapStates({ releaseState: 'notToBeReleased' })).toMatchObject({ grade: 'D', provenance: 'catalog' });
    expect(gradeFromSapStates({ releaseState: 'deprecated', hasSuccessor: true })).toMatchObject({ grade: 'C' });
    expect(gradeFromSapStates({ releaseState: 'deprecated', hasSuccessor: false })).toMatchObject({ grade: 'D' });
  });

  test('the release state decides before the classification state', () => {
    // 180 objects appear in both repository files. 158 are released; the other
    // 22 are classicAPI AND notToBeReleased/deprecated, and 21 of those carry an
    // explicit successor (CL_HTTP_CLIENT -> IF_WEB_HTTP_CLIENT). Checking
    // classicAPI first published level B for all 22.
    //
    // Two independent code reviews in September 2026 read this order as a bug and
    // filed it as a priority-zero defect — "SAP's own file says classicAPI and we
    // publish D". Both had read the function body without the reasoning above it.
    // An agent handed either review would have reordered these four lines and
    // silently regraded the mail and HTTP classes that appear in a large share of
    // real custom ABAP. If the rule is ever to change, the argument belongs here,
    // not in a patch that looks like a one-line fix.
    expect(gradeFromSapStates({ releaseState: 'released', classificationState: 'classicAPI' }))
      .toMatchObject({ grade: 'A', state: 'released' });
    expect(gradeFromSapStates({ releaseState: 'notToBeReleased', classificationState: 'classicAPI' }))
      .toMatchObject({ grade: 'D', state: 'notToBeReleased' });
    expect(gradeFromSapStates({ releaseState: 'deprecated', hasSuccessor: true, classificationState: 'classicAPI' }))
      .toMatchObject({ grade: 'C', state: 'deprecated' });
    // classicAPI on its own is still level B.
    expect(gradeFromSapStates({ classificationState: 'classicAPI' }))
      .toMatchObject({ grade: 'B', state: 'classicAPI' });
  });

  test('real conflicted objects resolve to the release state', () => {
    expect(gradeSapObject('CL_HTTP_CLIENT')).toMatchObject({ grade: 'D', state: 'notToBeReleased' });
    expect(gradeSapObject('IF_AUNIT_CONSTANTS')).toMatchObject({ grade: 'C', state: 'deprecated' });
  });

  test('both source views travel with the grade', () => {
    // The letter is a merge of two files that answer different questions, and
    // with only the letter on screen the merge is unreadable — which is how two
    // reviews came to opposite conclusions about CL_BCS. The halves are reported
    // so a reader can check the answer instead of reconstructing it.
    expect(gradeSapObject('CL_BCS')).toMatchObject({
      grade: 'D',
      cloudView: 'not-usable',
      classicView: 'classic-api',
    });
    expect(gradeFromSapStates({ releaseState: 'released' }))
      .toMatchObject({ grade: 'A', cloudView: 'usable', classicView: 'unlisted' });
    expect(gradeFromSapStates({ isSapObject: true }))
      .toMatchObject({ cloudView: 'unlisted', classicView: 'unlisted' });
  });

  test('a reserved-namespace object SAP does not list is not claimed as SAP-internal', () => {
    // /ACME/ could be SAP, a partner or the customer. Grading it residual C
    // asserts knowledge we do not have; it must fall through to the heuristic.
    expect(gradeSapObject('/ACME/TABLE1')).toMatchObject({ provenance: 'heuristic' });
    // …while a namespaced object SAP DOES list keeps its catalog grade.
    expect(gradeSapObject('/AIF/CL_TRANSFORM_DATA')).toMatchObject({ grade: 'D', provenance: 'catalog' });
  });

  test('an unlisted SAP object is level C by definition, not a guess', () => {
    expect(gradeFromSapStates({ isSapObject: true }))
      .toMatchObject({ grade: 'C', provenance: 'catalog-residual' });
  });

  test('customer objects fall through to the heuristic', () => {
    expect(isCustomerObject('ZMY_TABLE')).toBe(true);
    expect(isCustomerObject('YOLD_REPORT')).toBe(true);
    expect(isCustomerObject('VBAK')).toBe(false);
    expect(gradeFromSapStates({ isSapObject: false }))
      .toMatchObject({ grade: 'Unknown', provenance: 'heuristic' });
  });

  test('real objects resolve against the generated artifacts', () => {
    // VBAK/BSEG are notToBeReleased in SAP's own release data.
    expect(gradeSapObject('VBAK')).toMatchObject({ grade: 'D', provenance: 'catalog', state: 'notToBeReleased' });
    expect(gradeSapObject('ZDOES_NOT_EXIST')).toMatchObject({ provenance: 'heuristic' });
  });

  test('published distribution covers both artifacts and leaves nothing Unknown', () => {
    const { distribution, totalObjects } = getPublishedGradeDistribution();
    // Every key in either artifact carries a state, so none may fall through.
    expect(distribution.Unknown).toBe(0);
    // Pinned to the synced artifacts (release file of 2026-09-15, classifications of 2026-08-26): a sync that moves
    // these numbers has to be looked at, not absorbed.
    expect(distribution.A).toBe(24893);
    expect(distribution.B).toBe(7926);
    expect(distribution.C).toBe(76);
    expect(distribution.D).toBe(969);
    expect(totalObjects).toBe(
      distribution.A + distribution.B + distribution.C + distribution.D + distribution.Unknown,
    );
  });
});

/**
 * Roadmap 2.11, defect families (a) and (b): the level of a *use*.
 *
 * The reference corpus graded nine reads of KNA1/KNB1/KNVV C where the engine
 * said D, and four programs writing their own Z table B where the engine said
 * Unknown. One root each: the grade knew only the object's name. Reading a
 * table SAP will not release is using an internal object (C, corpus R01);
 * writing to it directly is D (R02); the customer's own table is classic ABAP
 * working on its own data (B, R20/R03).
 */
test.describe('the level of a use: read, write, own table', () => {
  test('a table SAP will not release is C to read and D to write', () => {
    const states = { releaseState: 'notToBeReleased', hasSuccessor: true, isSapObject: true };
    expect(gradeFromSapStatesForUse(states, 'read')).toMatchObject({
      grade: 'C',
      provenance: 'catalog',
      state: 'notToBeReleased',
      use: 'read',
      objectGrade: 'D',
    });
    expect(gradeFromSapStatesForUse(states, 'write')).toMatchObject({ grade: 'D', use: 'write' });
    expect(gradeFromSapStatesForUse(states, 'write').objectGrade).toBeUndefined();
    // Without a use nothing moves: the catalog page and the census keep the answer for the name.
    expect(gradeFromSapStatesForUse(states, null)).toEqual(gradeFromSapStates(states));
    // The successor does not decide it — R01 is about the state, not about a named replacement.
    expect(gradeFromSapStatesForUse({ ...states, hasSuccessor: false }, 'read').grade).toBe('C');
  });

  test('the classic file still decides where it speaks', () => {
    // The contested overlap keeps the precedence /method/levels argues for, and
    // noAPI is not for customer use whatever the access.
    expect(
      gradeFromSapStatesForUse({ releaseState: 'notToBeReleased', classificationState: 'classicAPI', isSapObject: true }, 'read').grade,
    ).toBe('D');
    expect(gradeFromSapStatesForUse({ classificationState: 'noAPI', isSapObject: true }, 'read').grade).toBe('D');
    expect(gradeFromSapStatesForUse({ releaseState: 'released', isSapObject: true }, 'write').grade).toBe('A');
    expect(gradeFromSapStatesForUse({ isSapObject: true }, 'read')).toMatchObject({ grade: 'C', provenance: 'catalog-residual' });
  });

  test("the customer's own table is B when the code reads or writes it, and nothing else is", () => {
    const own = { isSapObject: false, isCustomerObject: true };
    expect(gradeFromSapStatesForUse(own, 'write')).toMatchObject({ grade: 'B', provenance: 'own-object', use: 'write' });
    expect(gradeFromSapStatesForUse(own, 'read')).toMatchObject({ grade: 'B', provenance: 'own-object', use: 'read' });
    // A customer object the code only calls has an implementation nobody read.
    expect(gradeFromSapStatesForUse(own, null)).toMatchObject({ grade: 'Unknown', provenance: 'heuristic' });
    // A namespaced object SAP does not list is not assumed to be the customer's.
    expect(gradeFromSapStatesForUse({ isSapObject: false, isCustomerObject: false }, 'write')).toMatchObject({
      grade: 'Unknown',
      provenance: 'heuristic',
    });
  });

  test('real objects, graded for their use against the synced artifacts', () => {
    expect(gradeSapObjectUse('KNA1', 'read')).toMatchObject({ grade: 'C', state: 'notToBeReleased', objectGrade: 'D' });
    expect(gradeSapObjectUse('kna1', 'write')).toMatchObject({ grade: 'D', state: 'notToBeReleased' });
    expect(gradeSapObjectUse('ZCC_DECISION', 'write')).toMatchObject({ grade: 'B', provenance: 'own-object' });
    expect(gradeSapObjectUse('/ACME/TABLE1', 'write')).toMatchObject({ provenance: 'heuristic' });
    expect(gradeSapObjectUse('I_CUSTOMER', 'read')).toMatchObject({ grade: 'A', state: 'released' });
    expect(gradeSapObjectUse('KNA1', null)).toEqual(gradeSapObject('KNA1'));
  });

  test('the catalog page gets both answers only where the access decides the level', () => {
    expect(gradeSapObjectUses('KNA1')).toMatchObject({ read: { grade: 'C' }, write: { grade: 'D' } });
    // A released view, a class in the contested overlap, and a class SAP will not
    // release: one answer each, because reading and writing do not apply or do not matter.
    expect(gradeSapObjectUses('I_CUSTOMER')).toBeNull();
    expect(gradeSapObjectUses('CL_BCS')).toBeNull();
    expect(gradeSapObjectUses('CL_HTTP_CLIENT')).toBeNull();
  });

  test('access types and lookup keys', () => {
    expect(objectUseFromAccess('Read')).toBe('read');
    expect(objectUseFromAccess('Write')).toBe('write');
    expect(objectUseFromAccess('Read/Write')).toBe('write');
    expect(objectUseFromAccess(undefined)).toBeNull();
    expect(objectUseFromAccess('call')).toBeNull();
    expect(gradeKey(' kna1 ', 'read')).toBe('KNA1@read');
    expect(gradeKey('kna1', null)).toBe('KNA1');
  });

  test('the corpus comparison grades through the function the product shows', () => {
    // tests/korpus/baseline.json measures the engine's level through
    // tests/helpers/korpus-comparison.ts. If that helper graded objects any other
    // way than /api/abcd-classify does, the ratchet could go green on a grade no
    // user ever sees.
    const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
    const route = read('app/api/abcd-classify/route.ts');
    const comparison = read('tests/helpers/korpus-comparison.ts');
    expect(route).toMatch(/gradeSapObjectUse\(name, use\)/);
    expect(comparison).toMatch(/gradeSapObjectUse\(name, uses\.get\(name\) \?\? null\)/);
    expect(comparison).not.toMatch(/\bgradeSapObject\(/);
    expect(route).not.toMatch(/\bgradeSapObject\(/);
  });
});
