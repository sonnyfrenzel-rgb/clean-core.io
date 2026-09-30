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
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  // The Confluence export moved to lib/analysis-export.ts in D.28 and takes one of
  // the reads with it; page and export are checked together, each on its own.
  const pageOnly = read('app', '(app)', 'project', '[projectId]', 'analyze', 'page.tsx');
  const exportModule = read('lib', 'analysis-export.ts');
  for (const [name, source] of [['analyze/page.tsx', pageOnly], ['lib/analysis-export.ts', exportModule]]) {
    expect(source, `${name} does not import modelActionPlan`).toContain("import { modelActionPlan } from '@/lib/action-plan';");
  }
  expect(pageOnly.match(/modelActionPlan\(\s*[a-zA-Z]+\.businessValueAnalysis\?\.plainEnglishActionPlan\s*\)/g)?.length ?? 0, 'the page: fallback, origin line and chip').toBeGreaterThanOrEqual(3);
  expect(exportModule.match(/modelActionPlan\(\s*[a-zA-Z]+\.businessValueAnalysis\?\.plainEnglishActionPlan\s*\)/g)?.length ?? 0, 'the export: its fallback').toBeGreaterThanOrEqual(1);
  const page = `${pageOnly}\n${exportModule}`;
  // Every read of the plan goes through the helper — no `&&`, ternary, `!!` or
  // `||` on the raw field can decide the fallback or the origin (QA f0cde36e47bf).
  const reads = page.match(/businessValueAnalysis\?\.plainEnglishActionPlan/g)?.length ?? 0;
  const guarded = page.match(/modelActionPlan\(\s*[a-zA-Z]+\.businessValueAnalysis\?\.plainEnglishActionPlan\s*\)/g)?.length ?? 0;
  expect(reads, 'the plan is read somewhere without modelActionPlan').toBe(guarded);
});
