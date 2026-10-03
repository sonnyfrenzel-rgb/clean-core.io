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
// Since 02.10.2026 the plan is shown on Economics (components/tco/BusinessValuePlan.tsx),
// which decides it once and reads that one decision for all three; Analyze no longer reads it.
test('the plan and its origin are decided through modelActionPlan wherever it is shown', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const analyzePage = read('app', '(app)', 'project', '[projectId]', 'analyze', 'page.tsx');
  expect(analyzePage, 'Analyze reads the action plan again').not.toMatch(/plainEnglishActionPlan/);
  // The Confluence export moved to lib/analysis-export.ts in D.28.
  const planModule = read('components', 'tco', 'BusinessValuePlan.tsx');
  const exportModule = read('lib', 'analysis-export.ts');
  for (const [name, source] of [['components/tco/BusinessValuePlan.tsx', planModule], ['lib/analysis-export.ts', exportModule]]) {
    expect(source, `${name} does not import modelActionPlan`).toContain("import { modelActionPlan } from '@/lib/action-plan';");
  }
  const GUARDED = /modelActionPlan\(\s*[a-zA-Z]+\.businessValueAnalysis\?\.plainEnglishActionPlan\s*\)/g;
  expect(planModule.match(GUARDED)?.length ?? 0, 'Economics: one decision').toBe(1);
  // The fallback, the origin line and the chip all read that one decision.
  expect(planModule).toMatch(/const steps = plan \?\? \[/);
  expect(planModule).toMatch(/data-action-plan-origin=\{plan \? 'model' : 'generic'\}/);
  expect(planModule).toMatch(/\{plan \? \(\s*<CcProvenanceChip value="proposed" \/>/);
  expect(exportModule.match(GUARDED)?.length ?? 0, 'the export: its fallback').toBeGreaterThanOrEqual(1);
  const page = `${planModule}
${exportModule}`;
  // Every read of the plan goes through the helper — no `&&`, ternary, `!!` or
  // `||` on the raw field can decide the fallback or the origin (QA f0cde36e47bf).
  const reads = page.match(/businessValueAnalysis\?\.plainEnglishActionPlan/g)?.length ?? 0;
  const guarded = page.match(GUARDED)?.length ?? 0;
  expect(reads, 'the plan is read somewhere without modelActionPlan').toBe(guarded);
});

// Owner, 03.10.2026: without the model's narrative there is nothing to show
// and no button here that writes it, so the section is left out rather than
// shown as an empty "Not generated" box.
test('the business value section is left out when the run has no narrative', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'tco', 'BusinessValuePlan.tsx'), 'utf8');
  expect(src).toMatch(/if \(!data\) return null;/);
  expect(src).not.toContain('<NotGenerated');
});
