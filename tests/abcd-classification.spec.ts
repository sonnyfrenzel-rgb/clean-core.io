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
  gradeDistribution,
  worstGrade,
  ABCD_META,
  ALL_GRADES,
} from '../lib/abap/abcd-classification';

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
      expect(ABCD_META[g].atc).toBeTruthy();
    }
  });
});
