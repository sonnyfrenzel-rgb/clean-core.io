import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * QA review of 25680c66 (e2fc0565e012): the next step became one row above the
 * decision, and that row dropped the decision's own step ("for the decision:
 * …") which the box below it still carried — so with a decision on the page
 * and a primary action going elsewhere, the reader lost the link.
 */
test('the next-step row and the next-step box both carry the decision’s own step', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'workspace', 'ManagementExecutive.tsx'), 'utf8');
  const row = src.slice(src.indexOf('const nextRow = ('), src.indexOf('return (', src.indexOf('const nextRow = (')));
  const box = src.slice(src.indexOf('const nextBox = ('), src.indexOf('const nextRow = ('));
  for (const [name, part] of [['row', row], ['box', box]] as const) {
    expect(part, `next-step ${name} found`).toContain('data-executive-next=""');
    expect(part, `the next-step ${name} names the decision's own step`).toMatch(/\{decisionStep \?[\s\S]*data-executive-decision-step=""[\s\S]*hrefFor\(decisionStep\.target\)/);
  }
});
