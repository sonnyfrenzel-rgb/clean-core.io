import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
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

// QA 44adc3b1d5b0: the helper only protects the page if the page asks it — for the
// fallback, for the origin line and for the chip, and nowhere a plain `||` or truthiness.
test('the Analyze page decides the plan and its origin through modelActionPlan', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'analyze', 'page.tsx'), 'utf8');
  expect(page).toContain("import { modelActionPlan } from '@/lib/action-plan';");
  expect(page.match(/modelActionPlan\(\s*[a-zA-Z]+\.businessValueAnalysis\?\.plainEnglishActionPlan\s*\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  expect(page, 'a raw truthiness check on the plan decides the fallback or the origin again')
    .not.toMatch(/businessValueAnalysis\?\.plainEnglishActionPlan\s*(\|\||\?\s)/);
});
