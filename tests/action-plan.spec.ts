import { test, expect } from '@playwright/test';
import { modelActionPlan } from '../lib/action-plan';

// QA 18c913d26e13: an empty plan from the model is no plan — the page must fall
// back to its generic guidance and must not call that guidance a model proposal.
test.describe('modelActionPlan', () => {
  test('an empty list is no plan', () => {
    expect(modelActionPlan([])).toBeNull();
  });
  test('blank strings are no plan', () => {
    expect(modelActionPlan(['', '   '])).toBeNull();
  });
  test('a value that is not a list is no plan', () => {
    expect(modelActionPlan(undefined)).toBeNull();
    expect(modelActionPlan(null)).toBeNull();
    expect(modelActionPlan('1. Do it')).toBeNull();
  });
  test('a plan keeps its non-blank steps in order', () => {
    expect(modelActionPlan(['1. A', '', '2. B', 3])).toEqual(['1. A', '2. B']);
  });
});
