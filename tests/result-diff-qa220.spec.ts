/**
 * The result-set diff normalizes null by type and counts ordered mismatches.
 *
 * QA full review of v2.20.0 (fc787674705f): 97b03a5d60dd, 042abeab9b3f.
 *
 * Serverless: a pure function.
 */
import { test, expect } from '@playwright/test';
import { diffResultSets } from '../lib/abap/result-diff';

test('97b03a5d60dd — a null number from an outer join equals ABAP\'s initial 0', () => {
  expect(diffResultSets([{ id: '1', amount: 0 }], [{ id: '1', amount: null }]).equal).toBe(true);
  expect(diffResultSets([{ id: '1', amount: 0 }], [{ id: '1', amount: null }], { unordered: false }).equal).toBe(true);
  // Named explicitly, even where no row shows a number for it.
  expect(diffResultSets([{ amount: null }], [{ amount: 0 }], { numericFields: ['AMOUNT'] }).equal).toBe(true);
});

test('97b03a5d60dd — a character field keeps null as the empty string, and a real difference stays one', () => {
  expect(diffResultSets([{ name: '' }], [{ name: null }]).equal).toBe(true);
  expect(diffResultSets([{ amount: 5 }], [{ amount: null }]).equal).toBe(false);
});

test('042abeab9b3f — an ordered mismatch at the same position counts on both sides', () => {
  const r = diffResultSets([{ id: 1 }], [{ id: 2 }], { unordered: false });
  expect(r.equal).toBe(false);
  expect(r.onlyInAbap).toBe(1);
  expect(r.onlyInTarget).toBe(1);

  const longer = diffResultSets([{ id: 1 }, { id: 2 }], [{ id: 1 }], { unordered: false });
  expect([longer.onlyInAbap, longer.onlyInTarget]).toEqual([1, 0]);
});
