import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FAMILY_CHIP_KINDS,
  FAMILY_CHIP_MAX,
  FAMILY_CHIPS,
  familyChipOf,
} from '../lib/family-chips';
import { PROVENANCE_VALUES } from '../lib/provenance';
import { familyTitleOf } from '../lib/family-title';
import { familyViewMode, ONE_PAGE_NOTE, VIEW_SWITCH_TOOLS } from '../lib/family-frame';
import { familyBackLink } from '../lib/workspace-back-href';
import { PHASES } from '../lib/workflow-steps';
import { PAGE_ANCHOR_MAX, type PageAnchor } from '../lib/page-anchors';

/**
 * The shared frame of the tools' family (3.5.0; mock-ups of 15.11.2026, ADR-126, ADR-139, ADR-140; UX review
 * 22.11.2026, L2, L5, L7, Q9, Q12). Server-free: the pure rules, static renders of the family components, and the
 * sources of the header, the tool row and the shell.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const OUT = path.join(ROOT, 'tmp', 'family-frame', String(process.pid));

async function load<T>(rel: string): Promise<T> {
  const name = rel.replace(/[\\/]/g, '_').replace(/\.tsx?$/, '');
  const out = path.join(OUT, `${name}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out) as T;
}

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test.describe('one provenance vocabulary of six chips (L2)', () => {
  test('six kinds at most, each with its own word, icon and form', () => {
    expect(FAMILY_CHIP_KINDS.length).toBeLessThanOrEqual(FAMILY_CHIP_MAX);
    expect(FAMILY_CHIP_MAX).toBe(6);
    const labels = FAMILY_CHIP_KINDS.map((k) => FAMILY_CHIPS[k].label);
    expect(new Set(labels).size, 'two chips share a word').toBe(labels.length);
    expect(labels).toEqual(['Signed', 'From the engine', 'Yours', 'AI-generated', 'Simulation', 'Not determined']);
    for (const k of FAMILY_CHIP_KINDS) {
      const e = FAMILY_CHIPS[k];
      expect(e.meaning.length, k).toBeGreaterThan(10);
      expect(['filled', 'outline', 'dashed']).toContain(e.form);
      // Sentence case, no em dash in a UI string.
      expect(e.label[0], k).toBe(e.label[0].toUpperCase());
      expect(`${e.label} ${e.meaning}`, k).not.toContain('—');
    }
    // AI-generated keeps the lawyer-reviewed word (3.0.21) and the dashed form of a provisional statement.
    expect(FAMILY_CHIPS.ai).toMatchObject({ label: 'AI-generated', form: 'dashed', state: 'warning' });
  });

  test('every provenance value reduces to one of the six, or to none (stale)', () => {
    for (const value of PROVENANCE_VALUES) {
      const chip = familyChipOf(value);
      if (value === 'stale') {
        expect(chip, 'stale is said by a strip and the tool bar mark, never a chip').toBeNull();
        continue;
      }
      expect(chip, value).not.toBeNull();
      expect(FAMILY_CHIP_KINDS).toContain(chip!.kind);
    }
    expect(familyChipOf('proposed')).toEqual({ kind: 'ai' });
    expect(familyChipOf('imported')).toEqual({ kind: 'engine', note: 'imported' });
    expect(familyChipOf('demonstrated-mock')).toEqual({ kind: 'simulation', note: 'mocks' });
  });

  test('the chip renders the word, an icon and its form — and takes no label', async () => {
    const { default: FamilyChip } = await load<{ default: (p: Record<string, unknown>) => React.ReactElement | null }>(
      'components/family/FamilyChip.tsx',
    );
    const ai = renderToStaticMarkup(React.createElement(FamilyChip, { kind: 'ai' }));
    expect(ai).toContain('data-family-chip="ai"');
    expect(ai).toContain('data-cc-form="dashed"');
    expect(ai).toContain('border-dashed');
    expect(plain(ai)).toBe('AI-generated');
    expect(ai).toContain(`title="${FAMILY_CHIPS.ai.meaning}"`);
    const mock = renderToStaticMarkup(React.createElement(FamilyChip, { value: 'demonstrated-mock' }));
    expect(plain(mock)).toBe('Simulation· mocks');
    expect(renderToStaticMarkup(React.createElement(FamilyChip, { value: 'stale' }))).toBe('');
    // 12 px / 600, a pill (ADR-140 W4).
    expect(ai).toMatch(/class="[^"]*\brounded-full\b[^"]*\btext-\[12px\][^"]*\bfont-semibold\b/);
    expect(read('components/family/FamilyChip.tsx')).not.toMatch(/\blabel\??:\s*string/);
  });
});

test.describe('the title of a tool is the program (family header)', () => {
  const summary = (processTitle: string | null) => ({
    version: 1,
    runId: 'run-1',
    sourceSha256: 'x',
    mapThumb: null,
    mapSteps: null,
    mapRevision: 1,
    rulesDerived: null,
    cleanCoreScore: 40,
    recommendation: null,
    processTitle,
    writtenAt: '2026-11-23T00:00:00Z',
  });

  test('business name first, technical name under it, never the same twice', () => {
    const fp = { inputFingerprint: { fileName: 'Z_MM_PO_APPROVAL.abap' } };
    expect(
      familyTitleOf({ name: 'PO approval', activeRunId: 'run-1', summary: summary('Emergency purchase approval'), auditMetadata: fp }),
    ).toEqual({ title: 'Emergency purchase approval', programId: 'Z_MM_PO_APPROVAL' });
    // No business name read: the project's name, the file under it.
    expect(familyTitleOf({ name: 'PO approval', activeRunId: 'run-1', summary: summary(null), auditMetadata: fp })).toEqual({
      title: 'PO approval',
      programId: 'Z_MM_PO_APPROVAL',
    });
    // A summary of an earlier run is not this run's: not read.
    expect(familyTitleOf({ name: 'PO approval', activeRunId: 'run-2', summary: summary('Emergency purchase approval') })).toEqual({
      title: 'PO approval',
      programId: null,
    });
    // The business name took the title and there is no file: the project's name is the line under it.
    expect(familyTitleOf({ name: 'zpo_check', activeRunId: 'run-1', summary: summary('Emergency purchase approval') })).toEqual({
      title: 'Emergency purchase approval',
      programId: 'zpo_check',
    });
    // Nothing that only repeats the title.
    expect(familyTitleOf({ name: 'Z_MM_PO_APPROVAL', auditMetadata: fp })).toEqual({ title: 'Z_MM_PO_APPROVAL', programId: null });
    expect(familyTitleOf({ name: '  ' })).toBeNull();
    expect(familyTitleOf(null)).toBeNull();
  });
});

test.describe('one way back (ADR-140)', () => {
  test('My workspace by default, Analyze in the view the address carries, the demo workspace in the demo', () => {
    expect(familyBackLink({ projectId: 'p-1', search: '' })).toEqual({ kind: 'link', href: '/dashboard', place: 'My workspace', to: 'my-workspace' });
    expect(familyBackLink({ projectId: 'p-1', search: '?view=business' })).toMatchObject({ href: '/dashboard', to: 'my-workspace' });
    expect(familyBackLink({ projectId: 'p-1', search: '?view=it' })).toEqual({
      kind: 'link',
      href: '/project/p-1/analyze?view=it',
      place: 'Analyze, IT view',
      to: 'analyze',
    });
    expect(familyBackLink({ projectId: 'p-1', search: '?view=business&from=workspace-tools&layer=evidence' })).toMatchObject({
      href: '/project/p-1/analyze?view=it#it-trust',
      // The workspace page dissolved (AB-11): the Business evidence layer is IT's signed run, in Analyze.
      place: 'Analyze, IT view',
      to: 'analyze',
    });
    // The project's entry (Analyze, Business) always goes to the list.
    expect(familyBackLink({ projectId: 'p-1', search: '?view=it', toMyWorkspace: true })).toMatchObject({ href: '/dashboard', to: 'my-workspace' });
    expect(familyBackLink({ projectId: '', search: '', demo: true })).toEqual({
      kind: 'link',
      href: '/demo/workspace',
      place: 'Demo workspace',
      to: 'demo',
    });
    // The demo's entry (its Analyze, Business) goes to the list as well: its demo workspace leads back to itself.
    expect(familyBackLink({ projectId: '', search: '', demo: true, toMyWorkspace: true })).toMatchObject({ href: '/dashboard', to: 'my-workspace' });
    expect(familyBackLink({ projectId: '', search: '' })).toEqual({ kind: 'none' });
  });

  test('the header draws that one form: a chevron, the place, the program', () => {
    const src = read('components/StageHeader.tsx');
    expect(src).toContain('familyBackLink({ projectId, search, demo, toMyWorkspace: backToMyWorkspace })');
    expect(src).toContain('<ChevronLeft');
    expect(src).not.toContain('<StageBackText');
    expect(src).not.toContain('<ArrowLeft');
    // A choice's way back stays one level deep.
    expect(src).toContain('<ChoiceBackLink');
  });
});

test.describe('the header of the family', () => {
  test('the switch on Analyze and Design, the note on the five others', () => {
    expect([...VIEW_SWITCH_TOOLS].sort()).toEqual(['analyze', 'design']);
    const modes = Object.fromEntries(PHASES.map((p) => [p.key, familyViewMode(p.key)]));
    expect(modes).toEqual({
      analyze: 'switch',
      tco: 'one-page',
      design: 'switch',
      transformation: 'one-page',
      documentation: 'one-page',
      testing: 'one-page',
      delivery: 'one-page',
    });
    expect(familyViewMode(null)).toBe('none');
    expect(ONE_PAGE_NOTE).toMatch(/^One page for every reader/);
    expect(ONE_PAGE_NOTE).not.toContain('—');
  });

  test('the program is the h1, the tool the eyebrow; invite to view for the owner; every tool page hands its project', () => {
    const src = read('components/StageHeader.tsx');
    expect(src).toMatch(/<h1 data-stage-title className="[^"]*\bcc-text-title\b/);
    expect(src).toContain('Tool · {eyebrowTool}');
    expect(src).toContain('familyTitleOf(');
    expect(src).toContain('<InviteToView');
    // Every tool has its icon in the eyebrow.
    for (const p of PHASES) expect(src, p.key).toMatch(new RegExp(`\\b${p.key}: [A-Z]\\w+,`));
    // Every tool page hands the project, so its title and its owner are known — no page passes the bare name.
    for (const st of ['analyze', 'tco', 'design', 'transformation', 'documentation', 'testing', 'delivery']) {
      const page = read(`app/(app)/project/[projectId]/${st}/page.tsx`);
      if (!/<StageHeader\b/.test(page)) continue;
      expect(page, st).not.toMatch(/<StageHeader\b[^>]*projectName=\{project\?\.name\}/);
      expect(page, st).toMatch(/<StageHeader\b[\s\S]*?project=\{project\}/);
    }
    // The invitation reuses the existing flow: the dialog and its route, no new data.
    const invite = read('components/family/InviteToView.tsx');
    expect(invite).toContain("import InviteReaderDialog from '@/components/InviteReaderDialog'");
    expect(invite).not.toMatch(/fetch\(|getDb\(|setDoc|updateDoc/);
  });
});

test.describe('one tool row (ADR-140, Q9, Q12, L5)', () => {
  test('no second navigation at exactly 1024 px: each breakpoint pair is the two sides of one width', () => {
    const src = read('components/workspace/ToolBar.tsx');
    const bar = src.match(/const barHidden = open \? '([^']+)' : '([^']+)';/)!;
    const menu = src.match(/const menuHidden = open \? '([^']+)' : '([^']+)';/)!;
    const px = (cls: string) => Number(cls.match(/\[(\d+)px\]/)![1]);
    // Tailwind v4: `max-[N]` is width < N, `min-[N]` is width >= N — the same N, or both stand on one width.
    expect(px(bar[1])).toBe(px(menu[1]));
    expect(px(bar[2])).toBe(px(menu[2]));
    expect(bar[2]).toMatch(/^max-\[/);
    expect(menu[2]).toMatch(/^min-\[/);
  });

  test('a stage draws the family strip: one row, no menu, "2 of 7" on a phone, 44 px targets', () => {
    const src = read('components/workspace/ToolBar.tsx');
    expect(src).toMatch(/if \(surface === 'stage'\) \{\s*return <FamilyToolStrip/);
    const strip = src.slice(src.indexOf('function FamilyToolStrip'), src.indexOf('export default function WorkspaceToolBar'));
    expect(strip).toContain('data-stage-tools="open"');
    expect(strip).not.toContain('data-stage-tools="menu"');
    expect(strip).toContain('toolsPosition(at + 1, tools.length)');
    expect(strip).toContain('max-sm:[&_a]:min-h-11');
    expect(strip).toContain('flex-nowrap');
    expect(strip).toContain('overflow-x-auto');
  });

  test('the phone position reads "2 of 7"', async () => {
    const { toolsPosition, toolsPositionLabel } = await import('../lib/messages/workspace-shell');
    expect(toolsPosition(2, 7)).toBe('2 of 7');
    expect(toolsPositionLabel(2, 7, 'Economics')).toBe('Tool 2 of 7: Economics');
  });
});

test.describe('the answer card and four facets', () => {
  type Mod = {
    default: (p: Record<string, unknown>) => React.ReactElement;
    Facet: (p: Record<string, unknown>) => React.ReactElement;
    Facets: (p: Record<string, unknown>) => React.ReactElement;
  };

  test('question, answer, condition, one action with its note, four facets — from props alone', async () => {
    const { default: AnswerCard } = await load<Mod>('components/family/AnswerCard.tsx');
    const html = renderToStaticMarkup(
      React.createElement(AnswerCard, {
        id: 'answer',
        question: 'Is the program tested?',
        chips: React.createElement('span', { 'data-test-chip': '' }, 'Simulation'),
        answer: 'Not yet. 12 of 19 business rules have a case; none ran.',
        condition: 'It rests on the generated package of 21.11.',
        action: React.createElement('button', { type: 'button', 'data-test-action': '' }, 'Run the tests'),
        actionNote: 'Runs against SAP mocks, not your system.',
        facets: [
          { id: 'scenarios', label: 'Scenarios', value: '24', note: '18 by the engine' },
          { id: 'rules', label: 'Rules with a case', value: '12', unit: 'of 19', href: '#s-rules' },
          { id: 'result', label: 'Result', value: 'Not run', onClick: () => undefined },
          { id: 'open', label: 'Not proven', value: '3' },
        ],
      }),
    );
    expect(html).toMatch(/^<section id="answer" aria-labelledby="answer-q" data-answer-card=""/);
    expect(html).toContain('id="answer-q"');
    const text = plain(html);
    for (const s of ['Is the program tested?', 'Simulation', 'Not yet. 12 of 19', 'It rests on the generated package', 'Run the tests', 'Runs against SAP mocks'])
      expect(text).toContain(s);
    expect(html.match(/data-facet="/g)?.length).toBe(4);
    expect(html).toContain('href="#s-rules"');
    expect(html).toMatch(/<button type="button" data-facet="result"/);
    // The type scale of DESIGN.md §1.2 (owner 22.11.2026), not the mock-ups' half sizes.
    expect(html).toMatch(/data-answer=""[^>]*class="[^"]*\bcc-text-h2\b/);
    expect(html).toMatch(/class="[^"]*\bcc-text-figure\b[^"]*\btabular-nums\b/);
    // Four columns, two below 1100 px.
    expect(html).toMatch(/data-facets=""[^>]*class="[^"]*\bgrid-cols-4\b[^"]*\bmax-\[1100px\]:grid-cols-2\b/);
  });

  test('without facets or action the card is the answer alone', async () => {
    const { default: AnswerCard } = await load<Mod>('components/family/AnswerCard.tsx');
    const html = renderToStaticMarkup(React.createElement(AnswerCard, { question: 'Q', answer: 'A' }));
    expect(html).not.toContain('data-facets');
    expect(html).not.toContain('data-answer-next');
    expect(html).toContain('pb-4');
    // Pure: it reads and stores nothing.
    const src = read('components/family/AnswerCard.tsx');
    expect(src).not.toMatch(/getDb|fetch\(|localStorage|useEffect/);
  });
});

test.describe('"On this page" to its spec (ADR-126 (3))', () => {
  const anchors = (n: number, extra: Partial<PageAnchor> = {}): PageAnchor[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, target: `s-${i}`, label: `Section ${i + 1}`, ...extra }));

  test('a 48 px sticky strip, the label in sentence case, items 15 px in ink, six at most, none for one section', async () => {
    const { default: Bar } = await load<{ default: (p: Record<string, unknown>) => React.ReactElement | null }>('components/PageAnchorBar.tsx');
    const html = renderToStaticMarkup(React.createElement(Bar, { anchors: anchors(8), label: 'Sections', name: 'x-anchor', plural: 'x-anchors' }));
    expect(html).toMatch(/<nav[^>]*class="[^"]*\bsticky\b[^"]*\btop-14\b[^"]*\bz-cc-sticky\b[^"]*\bh-12\b[^"]*\bbg-cc-surface\b/);
    expect(html).toMatch(/data-page-anchors-label=""[^>]*>On this page</);
    expect(html).not.toMatch(/data-page-anchors-label=""[^>]*\buppercase\b/);
    expect([...html.matchAll(/data-x-anchor="(k\d)"/g)].map((m) => m[1])).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    expect(PAGE_ANCHOR_MAX).toBe(6);
    expect(html).toMatch(/class="[^"]*\btext-\[15px\][^"]*\btext-cc-ink\b[^"]*\bfont-medium\b/);
    // The 3 px bar under every item, shown on the current one.
    expect(html.match(/h-\[3px\]/g)?.length).toBe(6);
    expect(renderToStaticMarkup(React.createElement(Bar, { anchors: anchors(1), label: 'x', name: 'x', plural: 'xs' }))).toBe('');
  });

  test('quiet counts, amber only for open questions; one action at the end', async () => {
    const { default: Bar } = await load<{ default: (p: Record<string, unknown>) => React.ReactElement | null }>('components/PageAnchorBar.tsx');
    const list: PageAnchor[] = [
      { key: 'a', target: 's-a', label: 'Findings', count: '12' },
      { key: 'q', target: 's-q', label: 'Open questions', count: '3', tone: 'open' },
    ];
    const html = renderToStaticMarkup(
      React.createElement(Bar, { anchors: list, label: 'x', name: 'x-anchor', plural: 'xs', action: React.createElement('button', { type: 'button' }, 'Export') }),
    );
    expect(html).toMatch(/data-x-anchor-count="" data-tone="quiet" class="[^"]*\bbg-cc-surface-muted\b/);
    expect(html).toMatch(/data-x-anchor-count="" data-tone="open" class="[^"]*\bbg-cc-warning-bg\b/);
    expect(html).toMatch(/data-page-anchors-action=""[^>]*><button type="button">Export<\/button>/);
    // A click moves the focus to the section's heading.
    expect(read('components/PageAnchorBar.tsx')).toContain('focusSectionHeading(a.target)');
  });
});

test.describe('one shell width, a slim footer (ADR-140 W1, Q9)', () => {
  test('the shell bar and the step footer stand at one width on every page; tools 1536, lists 1280', () => {
    const src = read('app/(app)/layout.tsx');
    expect(src).toMatch(/h-14 items-center[^']*', SHELL_WIDTH_CLASS\)/);
    expect(src).toContain('isWidePage ? TOOL_WIDTH_CLASS : LIST_WIDTH_CLASS');
    expect(src).toContain('data-app-footer="slim"');
    expect(src).toMatch(/data-app-footer="slim"[\s\S]{0,200}py-3/);
  });
});
