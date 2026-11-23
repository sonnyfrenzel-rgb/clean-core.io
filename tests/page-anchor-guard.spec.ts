import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  analyzeAnchors,
  deliveryAnchors,
  economicsAnchors,
  PAGE_ANCHOR_IDS,
  PAGE_ANCHOR_LABELS,
  testingAnchors,
  transformationAnchors,
  type PageAnchor,
} from '../lib/page-anchors';
import { IT_ANCHORS } from '../lib/it-sections';
import { designAnchors } from '../lib/design-views';
import { analyzeItAnchors } from '../lib/analyze-it';
import { DOC_CHAPTERS } from '../lib/documentation-page';
import { NAVIGATION_MESSAGES } from '../lib/messages/navigation';

/**
 * One "On this page" bar on every tool that has one (owner 10.10.2026, ADR-091).
 *
 * Before: four tools drew an anchor bar of their own — Analyze, Transformation,
 * Delivery, and a Testing one nobody used — each with its own underline, its
 * own "(n)", its own scroll spy (Transformation's had none: its first link
 * stayed marked wherever the reader was), and the IT view and Documentation a
 * fifth look. Now one component draws them all, `lib/page-anchors.ts` says
 * which sections each tool names, and this spec holds three things, all
 * without a server:
 *
 *   1. one bar: `PageAnchorBar` is the only anchor bar, it says "On this page"
 *      itself (a page cannot pass other words), and it is used only where
 *      ADR-091 says — not on Design, not in Management; Economics carries one
 *      since it leads with its answer (ADR-128, mock-up E6);
 *   2. only ids that render: every section id a bar may name is the id of an
 *      element in the files that draw that tool — real and demo — and the
 *      builders never name one that is not on the page, never an "empty" chip;
 *   3. one place: on every tool the bar is drawn before the first section it
 *      names, outside any one section's container, so it stays in view to the
 *      last of them. The rendered half of this (same x, full frame width,
 *      sticky under the shell bar) is in `tests/workflow-style-guard.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'page-anchor-guard', String(process.pid));
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
/** Code only — a comment may name an id or a component without drawing it. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = (stage: string) => `app/(app)/project/[projectId]/${stage}/page.tsx`;

/** Every file that renders a `PageAnchorBar`, and nothing else may. */
const BAR_CALLERS = [
  'components/analyze/EvidenceFindingsTable.tsx', // AnalyzeAnchorBar — Analyze's demo
  'components/analyze/AnalyzeIt.tsx', // Analyze, IT — one page, code first (AB-9, ADR-140)
  'components/transformation/TransformationObjectPage.tsx', // Transformation and its demo
  'components/documentation/DocumentationOnePage.tsx', // Documentation and its demo (ADR-127)
  PAGE('testing'),
  'components/demo/DemoTesting.tsx',
  PAGE('delivery'),
  'components/delivery/DemoDelivery.tsx',
  PAGE('design'), // ADR-130 (G12): Design's sections per view and decision case
  'components/demo/DemoDesign.tsx',
  'components/tco/EconomicsObjectPage.tsx', // Economics and its demo (ADR-128)
  'components/workspace/ItAnswers.tsx', // the IT view (ADR-086)
  'app/(app)/settings/page.tsx', // Profile settings in the tools' family (ADR-139 (3))
  'components/analyze/AnalyzeManagement.tsx', // Analyze, Management (AB-10, ADR-143)
];

/** Where each tool draws its sections — the real page and its demo twin. */
const RENDERERS: Record<keyof typeof PAGE_ANCHOR_IDS, { real: string[]; demo: string[]; demoIds: string[] }> = {
  analyze: {
    real: [PAGE('analyze'), 'components/analyze/AnalyzeIt.tsx', 'components/analyze/ItTouches.tsx', 'components/analyze/EvidenceFindingsTable.tsx'],
    demo: ['components/demo/DemoAnalyze.tsx', 'components/analyze/EvidenceFindingsTable.tsx'],
    // The demo has no model summary, and so no anchor for it. No anchor for the
    // score: it is the hero above the bar, the page's top (ADR-093).
    demoIds: ['focus', 'where', 'kinds', 'detail'],
  },
  transformation: {
    real: ['components/transformation/TransformationObjectPage.tsx', PAGE('transformation')],
    demo: ['components/transformation/TransformationObjectPage.tsx'],
    // The code is in a drawer, not a section (ADR-129); the demo draws all five sections.
    demoIds: ['flow', 'open', 'package', 'checks', 'trace'],
  },
  testing: {
    real: [PAGE('testing')],
    demo: ['components/demo/DemoTesting.tsx'],
    // ADR-131 (S12): the demo runs nothing, so it has no "Where it ran" and no developer depth.
    demoIds: ['tested', 'open', 'acceptance', 'hand'],
  },
  economics: {
    real: ['components/tco/EconomicsObjectPage.tsx', PAGE('tco')],
    demo: ['components/tco/EconomicsObjectPage.tsx', 'components/tco/DemoEconomics.tsx'],
    // The demo has no model summary, and so no fold for it.
    demoIds: ['range', 'options', 'firm', 'effort', 'how'],
  },
  delivery: {
    real: [PAGE('delivery'), 'components/delivery/DeliveryObjectPage.tsx'],
    demo: ['components/delivery/DemoDelivery.tsx', 'components/delivery/DeliveryObjectPage.tsx'],
    demoIds: ['open', 'package', 'proof', 'pack'],
  },
  design: {
    real: [PAGE('design'), 'components/design/DesignCanvasStage.tsx'],
    demo: ['components/demo/DemoDesign.tsx', 'components/design/DesignCanvasStage.tsx'],
    // The demo has no business answers and no requirements module of its own on the page.
    demoIds: ['answer', 'board', 'canvas', 'contract', 'objects', 'checklist', 'options'],
  },
};

/** The section's element carries the id as written — `id="analyze-focus"`. */
const rendersId = (files: string[], id: string) => files.some((f) => code(f).includes(`id="${id}"`));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.tsx$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test.describe('one bar', () => {
  test('PageAnchorBar is drawn only where ADR-091 says, and no tool draws an anchor bar of its own', () => {
    const files = [...walk('app'), ...walk('components')];
    const callers = files.filter((f) => /<PageAnchorBar\b/.test(code(f))).sort();
    expect(callers).toEqual([...BAR_CALLERS].sort());

    // A hand-made anchor bar marks its link `aria-current="location"`; only the
    // one bar may (the landing page's process explorer is a breadcrumb).
    const ownBars = files.filter(
      (f) => f !== 'components/PageAnchorBar.tsx' && !f.startsWith('components/landing/') && /aria-current=\{[^}]*'location'/.test(code(f)),
    );
    expect(ownBars, 'a tool draws an anchor bar of its own').toEqual([]);
    for (const gone of ['components/testing/SectionAnchorBar.tsx']) expect(fs.existsSync(path.resolve(ROOT, gone)), gone).toBe(false);
    expect(code('components/delivery/DeliveryObjectPage.tsx')).not.toContain('DeliveryAnchorBar');

    // Management has none (ADR-087). Design has the one bar since ADR-130 (G12); its canvas component draws none of
    // its own. Economics draws its bar in the object page it shares with the demo (ADR-128), not in the route or the
    // demo wrapper.
    for (const rel of [
      'components/design/DesignCanvasStage.tsx',
      PAGE('tco'),
      'components/tco/DemoEconomics.tsx',
      'components/workspace/ManagementExecutive.tsx',
      'components/workspace/ManagementAnswers.tsx',
    ]) {
      expect(code(rel), `${rel} carries an anchor bar`).not.toMatch(/AnchorBar\b|<DocumentChapterBar\b/);
    }
  });

  test('every bar says "On this page" — the component says it, a page cannot', async () => {
    expect(NAVIGATION_MESSAGES['nav.onThisPage']).toBe('On this page');
    const bar = code('components/PageAnchorBar.tsx');
    expect(bar).toContain("nav('nav.onThisPage')");
    // No eyebrow prop: the words cannot differ from page to page.
    expect(bar).not.toMatch(/\blead\b/);
    for (const rel of BAR_CALLERS) expect(code(rel), rel).not.toMatch(/<PageAnchorBar\b[^>]*\blead=/);

    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'PageAnchorBar.tsx')],
      outfile: path.join(OUT, 'PageAnchorBar.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    const PageAnchorBar = require(path.join(OUT, 'PageAnchorBar.cjs')).default as (p: Record<string, unknown>) => React.ReactElement;
    const anchors: PageAnchor[] = [
      { key: 'a', target: 'sec-a', label: 'First', count: '3' },
      { key: 'b', target: 'sec-b', label: 'Second', count: null },
      { key: 'c', target: 'sec-c', label: 'Third', count: '' },
    ];
    const html = renderToStaticMarkup(React.createElement(PageAnchorBar, { anchors, label: 'Sections of X', name: 'x-anchor', plural: 'x-anchors' }));
    expect(html).toContain('On this page');
    expect(html).toMatch(/<nav[^>]*aria-label="Sections of X"/);
    expect(html).toContain('data-page-anchors=""');
    expect(html).toContain('data-x-anchors=""');
    // Sticky under the shell bar, above the page.
    expect(html).toMatch(/<nav[^>]*class="[^"]*\bsticky\b[^"]*\btop-14\b[^"]*\bz-cc-sticky\b/);
    expect([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])).toEqual(['sec-a', 'sec-b', 'sec-c']);
    // A count where there is one; no empty chip where there is none.
    expect(html.match(/data-x-anchor-count=""/g)?.length).toBe(1);
    // Nothing marked before the reader scrolls (the server knows no scroll).
    expect(html).not.toContain('aria-current');
    // With nothing to name, no bar at all.
    expect(renderToStaticMarkup(React.createElement(PageAnchorBar, { anchors: [], label: 'x', name: 'x', plural: 'xs' }))).toBe('');
  });
});

test.describe('only ids that render', () => {
  for (const [tool, ids] of Object.entries(PAGE_ANCHOR_IDS) as Array<[keyof typeof PAGE_ANCHOR_IDS, Record<string, string>]>) {
    test(`${tool}: every section the bar can name is an element of the page — and of the demo`, () => {
      const r = RENDERERS[tool];
      const missing = Object.values(ids).filter((id) => !rendersId(r.real, id));
      expect(missing, `${tool}: anchors with no element on the page`).toEqual([]);
      const demoMissing = r.demoIds.map((k) => ids[k]).filter((id) => !rendersId(r.demo, id));
      expect(demoMissing, `${tool}: anchors with no element in the demo`).toEqual([]);
      expect(PAGE_ANCHOR_LABELS[tool]).toMatch(/^Sections of /);
    });
  }

  test('the IT view and Documentation name only sections that render', () => {
    const it = code('components/workspace/ItAnswers.tsx') + code('components/workspace/ItRail.tsx');
    for (const key of IT_ANCHORS) expect(it, `IT anchor ${key}`).toContain(`id={IT_SECTION_IDS.${key}}`);
    // Documentation (ADR-127): every chapter the bar names is a `Chapter` drawn with its id from `DOC_CHAPTERS`.
    const doc = code('components/documentation/DocumentationOnePage.tsx');
    expect(doc).toContain('id={c.id}');
    expect(code('lib/documentation-page.ts')).toContain('target: c.id');
    for (const { key } of DOC_CHAPTERS) expect(doc, `chapter ${key}`).toContain(`chapter="${key}"`);
  });

  test('the builders name only their own ids, in the page order, and never an empty chip', () => {
    const check = (tool: keyof typeof PAGE_ANCHOR_IDS, list: PageAnchor[], extra: string[] = []) => {
      const allowed = new Set<string>([...Object.values(PAGE_ANCHOR_IDS[tool]), ...extra]);
      const order = [...Object.values(PAGE_ANCHOR_IDS[tool]), ...extra];
      for (const a of list) {
        expect(allowed.has(a.target), `${tool}: ${a.target}`).toBe(true);
        expect(a.count, `${tool}: ${a.key} shows a 0`).not.toBe('0');
        expect(a.label.trim().length).toBeGreaterThan(0);
      }
      const idx = list.map((a) => order.indexOf(a.target));
      expect(idx, `${tool}: not in the page's order`).toEqual([...idx].sort((x, y) => x - y));
      expect(new Set(list.map((a) => a.key)).size).toBe(list.length);
    };

    // Analyze — nothing picked, no map, no summary: those anchors go; the list says "none".
    // The score has no anchor: it is the hero above the bar (ADR-093), so the bar starts with Look here first.
    const bare = analyzeAnchors({ picks: 0, where: false, findings: 0, summary: false });
    check('analyze', bare);
    expect(bare.map((a) => a.key)).toEqual(['kinds', 'detail']);
    expect(bare.find((a) => a.key === 'kinds')!.count).toBe('none');
    const full = analyzeAnchors({ picks: 3, where: true, findings: 41, summary: true });
    check('analyze', full);
    expect(full.map((a) => [a.key, a.count ?? null])).toEqual([
      ['focus', '3'], ['where', null], ['kinds', '41'], ['summary', null], ['detail', null],
    ]);
    expect(full.some((a) => a.label === 'Clean Core Score')).toBe(false);
    expect(Object.values(PAGE_ANCHOR_IDS.analyze)).not.toContain('analyze-score');
    // Analyze, IT (AB-9, the family mock-up): Score, First look, Findings, SAP objects, Summary, Detail — six at most.
    const it = analyzeItAnchors({ picks: 3, findings: 26, touches: 8, summary: true, score: true });
    check('analyze', it);
    expect(it.map((a) => [a.label, a.count ?? null])).toEqual([
      ['Score', null], ['First look', '3'], ['Findings', '26'], ['SAP objects', '8'], ['Summary', null], ['Detail', null],
    ]);
    const itBare = analyzeItAnchors({ picks: 0, findings: 0, touches: null, summary: false, score: false });
    check('analyze', itBare);
    expect(itBare.map((a) => a.key)).toEqual(['kinds', 'touch', 'detail']);

    // Transformation (ADR-129, mock-up T10) — Findings · Open · Package · Checks · Trace, always all five; the package
    // counts its objects only once one is stored, Open and a failed check count in amber.
    const demoTf = transformationAnchors({ findings: 12, open: 3, objects: null, checksFailed: 0 });
    check('transformation', demoTf);
    expect(demoTf.map((a) => a.label)).toEqual(['Findings', 'Open', 'Package', 'Checks', 'Trace']);
    expect(demoTf.find((a) => a.key === 'package')!.count).toBeNull();
    expect(demoTf.find((a) => a.key === 'open')!.tone).toBe('open');
    const tf = transformationAnchors({ findings: 12, open: 0, objects: 9, checksFailed: 1 });
    check('transformation', tf);
    expect(tf.find((a) => a.key === 'package')!.count).toBe('9');
    expect(tf.find((a) => a.key === 'open')!.count).toBe('none');
    expect(tf.find((a) => a.key === 'open')!.tone).toBeUndefined();
    expect(tf.find((a) => a.key === 'checks')).toMatchObject({ count: '1 failed', tone: 'open' });

    // Design (ADR-130, G12) — each view and case names its own sections, at most six, never a 0.
    for (const view of ['business', 'it', 'management'] as const) {
      for (const c of ['none', 'rebuild', 'standard', 'retire', 'keep'] as const) {
        const list = designAnchors(view, c, { open: 0, objects: 0, steps: 13 });
        check('design', list);
        expect(list.length).toBeLessThanOrEqual(6);
        expect(list[0].target).toBe('design-answer');
      }
    }
    expect(designAnchors('business', 'rebuild', { open: 2, objects: 19, steps: 13 }).find((a) => a.key === 'questions')).toMatchObject({ count: '2', tone: 'open' });

    // Testing (ADR-131, S14) — What was tested · Where it ran · Not proven (amber) · Acceptance checks · For developers.
    const testingDemo = testingAnchors({ rules: 12, ran: false, notProven: 1, acceptance: 0, developers: false });
    check('testing', testingDemo);
    expect(testingDemo.map((a) => a.key)).toEqual(['tested', 'open']);
    const testingFull = testingAnchors({ rules: 12, ran: true, notProven: 4, acceptance: 11, developers: true });
    check('testing', testingFull);
    expect(testingFull.map((a) => [a.key, a.count ?? null, a.tone ?? null])).toEqual([
      ['tested', '12', null], ['ran', null, null], ['open', '4', 'open'], ['acceptance', '11', null], ['developers', null, null],
    ]);
    expect(testingAnchors({ rules: null, ran: true, notProven: 0, acceptance: null, developers: true }).find((a) => a.key === 'open')!.count).toBeNull();

    // Delivery (ADR-132 L13) — Before go-live carries an amber count only while something blocks; the demo has no
    // import and no timeline, and its package no count.
    const d = deliveryAnchors({ blocking: 0, parts: 6, events: 4 });
    check('delivery', d);
    expect(d.map((a) => [a.key, a.count ?? null])).toEqual([
      ['open', null], ['package', '6'], ['proof', null], ['pack', null], ['import', null], ['timeline', '4'],
    ]);
    const blocked = deliveryAnchors({ blocking: 3, parts: 0, packNote: 'blocked', events: 0 });
    check('delivery', blocked);
    expect(blocked.find((a) => a.key === 'open')).toMatchObject({ count: '3', tone: 'open' });
    expect(blocked.find((a) => a.key === 'package')!.count).toBe('none');
    const demo = deliveryAnchors({ blocking: 5, parts: null, events: null });
    check('delivery', demo);
    expect(demo.map((a) => a.key)).toEqual(['open', 'package', 'proof', 'pack']);

    // Economics — the model's view only where the analysis wrote one (ADR-128, mock-up E6).
    const econ = economicsAnchors({ model: true });
    check('economics', econ);
    expect(econ.map((a) => a.key)).toEqual(['range', 'options', 'firm', 'effort', 'how', 'model']);
    expect(economicsAnchors({ model: false }).map((a) => a.key)).not.toContain('model');
  });
});

test.describe('one place', () => {
  /** The bar comes before the first section it names, in the file that draws both. */
  const before = (rel: string, bar: RegExp, first: string) => {
    const src = code(rel);
    const b = src.search(bar);
    const s = src.indexOf(first);
    expect(b, `${rel}: no bar`).toBeGreaterThan(-1);
    expect(s, `${rel}: no ${first}`).toBeGreaterThan(-1);
    expect(b, `${rel}: the bar stands below ${first}`).toBeLessThan(s);
  };

  test('under the header and the answer, before the first section, on every tool', () => {
    // Analyze: the page draws it between the answer and the findings — in both
    // kinds of report — and the findings component no longer draws one inside
    // itself, where it stopped being sticky at the end of the list.
    // Since 3.5.0 the IT page (`AnalyzeIt`, AB-9) draws the family's bar between the answer card and its first section;
    // the page itself draws none.
    const analyze = code(PAGE('analyze'));
    expect(analyze).not.toMatch(/<AnalyzeAnchorBar\b|<PageAnchorBar\b/);
    expect(analyze.match(/<AnalyzeIt\b/g)?.length).toBe(1);
    before('components/analyze/AnalyzeIt.tsx', /<PageAnchorBar\b/, 'id="analyze-moves"');
    const itSrc = code('components/analyze/AnalyzeIt.tsx');
    expect(itSrc.indexOf('<AnswerCard')).toBeLessThan(itSrc.indexOf('<PageAnchorBar'));
    expect(code('components/demo/DemoAnalyze.tsx')).toMatch(/<AnalysisAnswer\b[\s\S]*?\/>[\s{}]*<AnalyzeAnchorBar\b[\s\S]*?\/>[\s{}]*<EvidenceFindingsTable\b/);
    const table = code('components/analyze/EvidenceFindingsTable.tsx');
    const body = table.slice(table.indexOf('export default function EvidenceFindingsTable'));
    expect(body).not.toMatch(/AnchorBar\b/);

    before('components/transformation/TransformationObjectPage.tsx', /<PageAnchorBar\b/, 'id="tf-flow"');
    before(PAGE('testing'), /<PageAnchorBar\b/, 'id="testing-tested"');
    before('components/demo/DemoTesting.tsx', /<PageAnchorBar\b/, 'id="testing-tested"');
    before(PAGE('delivery'), /<PageAnchorBar\b/, 'id="before-go-live"');
    before('components/delivery/DemoDelivery.tsx', /<PageAnchorBar\b/, 'id="before-go-live"');
    // Economics: under the answer card, before the range chart (ADR-128).
    before('components/tco/EconomicsObjectPage.tsx', /<AnswerCard\b/, '<PageAnchorBar');
    before('components/tco/EconomicsObjectPage.tsx', /<PageAnchorBar\b/, 'id="economics-range"');
    before('components/documentation/DocumentationOnePage.tsx', /<PageAnchorBar\b/, 'chapter="process"');
    before('components/workspace/ItAnswers.tsx', /<ItAnchorBar\b/, 'id={IT_SECTION_IDS.findings}');

    // The bar is never wrapped in a section's own container: on Testing and
    // Delivery it is a direct child of the frame.
    for (const stage of ['testing', 'delivery']) {
      const src = code(PAGE(stage));
      const at = src.search(/<PageAnchorBar\b/);
      const indent = src.slice(src.lastIndexOf('\n', at) + 1, at);
      // StageFrame's children stand at six spaces.
      expect(indent.length, `${stage}: the bar is nested inside a section`).toBeLessThanOrEqual(8);
    }
    // Documentation (ADR-127): a direct child of the page's own element, which runs to the foot of the page.
    const one = code('components/documentation/DocumentationOnePage.tsx');
    const at = one.search(/<PageAnchorBar\b/);
    expect(one.slice(one.lastIndexOf('\n', at) + 1, at), 'Documentation: the bar is nested inside a section').toBe('      ');
  });
});
