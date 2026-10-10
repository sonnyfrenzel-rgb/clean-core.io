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

  test('findings, "Objects & dependencies" and the level figure all use the explained chip', () => {
    expect(it).toContain('<CcCleanCoreLevelExplained value={row.level} />');
    // "What the code uses" merged into Objects & dependencies (ADR-086).
    expect(it).toContain('<CcCleanCoreLevelExplained value={r.level} />');
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
    expect(overview, 'a bare level chip is left in the Management overview').not.toMatch(/<CcCleanCoreLevel\s/);
    // ADR-087 (7fecaa01, owner 10.10.2026): the overview's levels card and its
    // level table are gone — each fact once, and the level of each object is
    // said in the distance-to-standard rows above. It must not come back as a
    // second, differently drawn level list.
    expect(overview, 'the overview shows levels again beside the distance rows').not.toContain('CcCleanCoreLevelExplained');
  });

  test('the explanation never sits inside a picture: the level bar stays role="img", the explained rows are the table under it', () => {
    // An image hides the buttons inside it (the IT view's lesson): the levels
    // bar carries no chip, the table beside it carries the explained ones.
    // The levels bar left the overview with ADR-087 (7fecaa01); the bar it was
    // drawn with is still a picture and still carries no chip.
    const bar = exec.slice(exec.indexOf('export function StackedBar('), exec.indexOf('/* ------------------------------------------------------------ pieces */'));
    expect(bar).toContain('role="img"');
    expect(bar, 'a level chip sits inside the bar picture').not.toContain('CcCleanCoreLevel');
    expect(read('components/workspace/ManagementExecutive.tsx')).not.toMatch(/role="img"[^>]*>\s*<CcCleanCoreLevelExplained/);
  });
});

/*
 * Roadmap 3.0.6 (decision Sonny, 06.10.2026): level chips explain themselves
 * everywhere — the steering one-pager, the print sheet and the Analyze tables
 * use the same explanation as IT and Management, and it never breaks paper.
 */
test.describe('level chips explain themselves everywhere (3.0.6)', () => {
  test('the steering one-pager explains the level of each risk, and no bare chip is left', () => {
    const src = read('components/workspace/SteeringOnePager.tsx');
    expect(src).toContain('<CcCleanCoreLevelExplained value={r.level} />');
    expect(src).not.toMatch(/<CcCleanCoreLevel\s/);
  });

  test('the Analyze tables explain the level of each row', () => {
    const findings = read('components/analyze/EvidenceFindingsTable.tsx');
    expect(findings).toContain('<CcCleanCoreLevelExplained value={level} />');
    // The one bare chip left sits inside the group's disclosure button, where a second button cannot go.
    expect(findings.match(/<CcCleanCoreLevel\s/g) ?? []).toHaveLength(1);
    expect(findings).toMatch(/a button cannot hold another\.[\s\S]{0,400}<CcCleanCoreLevel value=\{l as CloudReadinessGrade\} \/>/);
    const abcd = read('components/analyze/AbcdClassificationPanel.tsx');
    expect(abcd).toContain('<CcCleanCoreLevelExplained value={it.grade} />');
    // The legend writes the explanation out beside its chips.
    expect(abcd.match(/<CcCleanCoreLevel\s/g) ?? []).toHaveLength(1);
  });

  test('the print sheet prints the same words as a legend, since paper has no hover', () => {
    const src = read('components/workspace/WorkspacePrintSheet.tsx');
    expect(src).toContain("from '@/lib/clean-core-level-explain'");
    expect(src).toContain('{cleanCoreLevelExplanation(value).meaning}');
    expect(src).toContain('data-print-level-caveat');
  });

  test('on paper only the chip prints: the panel is hidden even when open, the target shrinks', () => {
    const src = read('components/cc/LevelExplained.tsx');
    expect(src).toMatch(/className="fixed z-cc-popover block print:hidden /);
    expect(src).toContain('print:min-h-0');
  });
});
