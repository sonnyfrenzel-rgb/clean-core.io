import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ABCD_META } from '../lib/abap/abcd-classification';
import { GLOSSARY_ITEMS } from '../lib/glossary';
import { cleanCoreLevelExplanation } from '../lib/clean-core-level-explain';

/**
 * The clean core level explains itself in the IT view (owner, 06.10.2026):
 * hover on a desktop, a tap on a phone, keyboard focus, Escape closes.
 *
 * Two halves here, both without a browser: the words come from the one
 * definition there is (`ABCD_META`, the glossary's caveat) and nothing else,
 * and the component has the mechanics a hover-only tooltip would leave out.
 */
const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('what a level means comes from the one definition', () => {
  test('each level A–D: its name, its meaning and the ATC reading are ABCD_META\'s', () => {
    for (const g of ['A', 'B', 'C', 'D'] as const) {
      const e = cleanCoreLevelExplanation(g);
      expect(e.title).toBe(`Level ${g}: ${ABCD_META[g].label}`);
      expect(e.meaning).toBe(ABCD_META[g].description);
      expect(e.atc).toBe(`ATC (our reading): ${ABCD_META[g].atcReading}`);
      expect(e.caveat).toBe(GLOSSARY_ITEMS['Clean core levels'].cleanCoreImplication);
      expect(e.source).toMatch(/SAP.s clean core level concept/);
    }
  });

  test('a level that was not determined says so, and claims no ATC severity', () => {
    const e = cleanCoreLevelExplanation('Unknown');
    expect(e.title).toBe(`Level not determined: ${ABCD_META.Unknown.label}`);
    expect(e.atc).toBeNull();
  });
});

test.describe('the explanation works without a mouse', () => {
  const src = read('components/cc/LevelExplained.tsx');

  test('a button, described by its explanation, expandable, closing on Escape and outside', () => {
    expect(src).toContain('type="button"');
    expect(src).toContain('aria-describedby={id}');
    expect(src).toContain('aria-expanded={open}');
    expect(src).toContain('role="tooltip"');
    expect(src).toContain("event.key !== 'Escape'");
    expect(src).toContain("addEventListener('pointerdown'");
    // A tap pins it; a hover only counts for a mouse, a focus only for the keyboard.
    expect(src).toContain('onClick=');
    expect(src).toContain("event.pointerType === 'mouse'");
    expect(src).toContain(":focus-visible");
    // A thumb-sized target on a phone and under a coarse pointer (DESIGN.md §2.9).
    expect(src).toContain('pointer-coarse:min-h-11');
    // On the popover layer of the scale, and never clipped by a scrolling table.
    expect(src).toContain('z-cc-popover');
    expect(src).toMatch(/className="fixed /);
  });

  test('the chip inside is the one level identifier, not a copy', () => {
    expect(src).toContain('<CcCleanCoreLevel value={value} withLabel={withLabel} />');
    expect(src).not.toContain('data-cc-identifier');
  });
});

test.describe('where the IT view shows a level, it explains it', () => {
  const it = read('components/workspace/ItAnswers.tsx');

  test('findings, "What the code uses" and the level figure all use the explained chip', () => {
    expect(it).toContain('<CcCleanCoreLevelExplained value={row.level} />');
    expect(it).toContain('<CcCleanCoreLevelExplained value={u.level} />');
    expect(it).toMatch(/<CcCleanCoreLevelExplained value=\{slice\.grade\} trigger=/);
    expect(it, 'a bare level chip is left in the IT view').not.toMatch(/<CcCleanCoreLevel\s/);
  });

  test('the level figure is no image any more — an image hides the buttons inside it', () => {
    expect(it).not.toMatch(/data-figure-value="" role="img"/);
  });
});

test.describe('where the Management view shows a level, it explains it (owner 06.10.2026, ADR-079)', () => {
  const exec = read('components/workspace/ManagementExecutive.tsx');
  const overview = read('components/workspace/ManagementOverview.tsx');

  test('the distance-to-standard rows and the level table use the explained chip, and no bare chip is left', () => {
    expect(exec).toContain('<CcCleanCoreLevelExplained value={item.level} />');
    expect(exec, 'a bare level chip is left in the Management panel').not.toMatch(/<CcCleanCoreLevel\s/);
    expect(overview).toMatch(/<CcCleanCoreLevelExplained value=\{r\.key\} trigger=\{r\.label\} \/>/);
    expect(overview, 'a bare level chip is left in the Management overview').not.toMatch(/<CcCleanCoreLevel\s/);
  });

  test('the explanation never sits inside a picture: the level bar stays role="img", the explained rows are the table under it', () => {
    // An image hides the buttons inside it (the IT view's lesson): the levels
    // bar carries no chip, the table beside it carries the explained ones.
    expect(overview).toMatch(/<StackedBar label=\{wt\('mgmt\.levelsChart'\)\}/);
    expect(read('components/workspace/ManagementExecutive.tsx')).not.toMatch(/role="img"[^>]*>\s*<CcCleanCoreLevelExplained/);
  });
});
