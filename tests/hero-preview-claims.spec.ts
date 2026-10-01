import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The hero's caption tells the visitor what to do — so it may only offer what
 * a keyboard can do (QA c912b926e44d). The code lines are plain list items and
 * not Tab stops; the BPMN steps are. A caption that asks the visitor to *focus*
 * a code line promises a path the keyboard does not have.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\s*\r?\n\s*/g, ' ');

test('the caption offers focus only where there is a Tab stop', () => {
  const hero = read('components/landing/HeroPreview.tsx');
  const caption = hero.match(/<figcaption[^>]*>(.*?)<\/figcaption>/)?.[1] ?? '';
  expect(caption, 'the hero has no caption').not.toBe('');
  const linesFocusable = /<li key=\{line\.number\} data-l=\{line\.number\}[^>]*tabIndex/.test(hero);
  if (!linesFocusable) expect(caption).not.toMatch(/focus[^.—]*(?:or|and) a code line/i);
  // The keyboard path the caption does offer: every step is a Tab stop.
  expect(read('components/landing/BpmnPlaneSvg.tsx')).toMatch(/className: 'cc-bpmn-node',\s*tabIndex: 0,/);
});
