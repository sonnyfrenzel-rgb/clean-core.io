import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  analyzeAnchors,
  deliveryAnchors,
  PAGE_ANCHOR_IDS,
  PAGE_ANCHOR_LABELS,
  testingAnchors,
  transformationAnchors,
  type PageAnchor,
} from '../lib/page-anchors';
import { IT_ANCHORS } from '../lib/it-sections';
import { PROCESS_DOCUMENT_SECTIONS } from '../lib/process-document';
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
 *      ADR-091 says — not on Design, not on Economics, not in Management;
 *   2. only ids that render: every section id a bar may name is the id of an
 *      element in the files that draw that tool — real and demo — and the
 *      builders never name one that is not on the page, never an "empty" chip;
 *   3. one place: on every tool the bar is drawn before the first section it
 *      names, outside any one section's container, so it stays in view to the
 *      last of them. The rendered half of this (same x, full frame width,
 *      sticky under the shell bar) is in `tests/workflow-style-guard.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'page-anchor-guard');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
/** Code only — a comment may name an id or a component without drawing it. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = (stage: string) => `app/(app)/project/[projectId]/${stage}/page.tsx`;

/** Every file that renders a `PageAnchorBar`, and nothing else may. */
const BAR_CALLERS = [
  'components/analyze/EvidenceFindingsTable.tsx', // AnalyzeAnchorBar — Analyze and its demo
  'components/transformation/TransformationObjectPage.tsx', // Transformation and its demo
  'components/documentation/ProcessDocumentView.tsx', // DocumentChapterBar — Documentation and its demo
  PAGE('testing'),
  'components/demo/DemoTesting.tsx',
  PAGE('delivery'),
  'components/delivery/DemoDelivery.tsx',
  'components/workspace/ItAnswers.tsx', // the IT view (ADR-086)
];

/** Where each tool draws its sections — the real page and its demo twin. */
const RENDERERS: Record<keyof typeof PAGE_ANCHOR_IDS, { real: string[]; demo: string[]; demoIds: string[] }> = {
  analyze: {
    real: [PAGE('analyze'), 'components/analyze/EvidenceFindingsTable.tsx'],
    demo: ['components/demo/DemoAnalyze.tsx', 'components/analyze/EvidenceFindingsTable.tsx'],
    // The demo has no model summary, and so no anchor for it. No anchor for the
    // score: it is the hero above the bar, the page's top (ADR-093).
    demoIds: ['focus', 'where', 'kinds', 'detail'],
  },
  transformation: {
    real: ['components/transformation/TransformationObjectPage.tsx', PAGE('transformation')],
    demo: ['components/transformation/TransformationObjectPage.tsx'],
    // The side-by-side viewer is a project's (`extraAnchors`); the demo has none.
    demoIds: ['flow', 'package', 'changes', 'plan'],
  },
  testing: {
    real: [PAGE('testing')],
    demo: ['components/demo/DemoTesting.tsx'],
    demoIds: ['write', 'run', 'hand'],
  },
  delivery: {
    real: [PAGE('delivery'), 'components/delivery/DeliveryObjectPage.tsx'],
    demo: ['components/delivery/DemoDelivery.tsx', 'components/delivery/DeliveryObjectPage.tsx'],
    demoIds: ['chain', 'needed', 'artefacts', 'pack'],
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

    // ADR-091: Design is a canvas with its own tabs, Economics a guided flow
    // whose step guide is its navigation; Management has none (ADR-087).
    for (const rel of [
      PAGE('design'),
      'components/design/DesignCanvasStage.tsx',
      'components/demo/DemoDesign.tsx',
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
    const doc = code('components/documentation/ProcessDocumentView.tsx');
    expect(doc).toContain('target: `pd-${c.key}`');
    for (const { key } of PROCESS_DOCUMENT_SECTIONS) {
      expect(doc.includes(`<SectionCard id="${key}"`) || doc.includes(`id="pd-${key}"`), `chapter ${key}`).toBe(true);
    }
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

    // Transformation — the demo's package has no count; an empty plan has no anchor.
    const demoTf = transformationAnchors({ files: null, findings: 12, kinds: 0 });
    check('transformation', demoTf);
    expect(demoTf.find((a) => a.key === 'package')!.count).toBeNull();
    expect(demoTf.some((a) => a.key === 'plan')).toBe(false);
    const tf = transformationAnchors({ files: 0, findings: 12, kinds: 4, extra: [['tf-side', 'Side by side']] });
    check('transformation', tf);
    expect(tf.find((a) => a.key === 'package')!.count).toBe('none');
    expect(tf.at(-1)!.target).toBe('tf-side');

    // Testing — scenarios only once written, the SAP result only on its route.
    const empty = testingAnchors({ scenarios: 0, handChecks: null, sapResult: false });
    check('testing', empty);
    expect(empty.map((a) => a.key)).toEqual(['write', 'run', 'hand']);
    const abap = testingAnchors({ scenarios: 8, handChecks: 0, sapResult: true });
    check('testing', abap);
    expect(abap.map((a) => [a.key, a.count ?? null])).toEqual([
      ['write', null], ['run', null], ['sap-result', null], ['hand', 'none'], ['scenarios', '8'],
    ]);

    // Delivery — "none" still needed is the answer; the slides only with a deck.
    const d = deliveryAnchors({ stillNeeded: 0, artefacts: 6, pack: 'Available', slides: false });
    check('delivery', d);
    expect(d.map((a) => [a.key, a.count ?? null])).toEqual([
      ['chain', null], ['needed', 'none'], ['artefacts', '6'], ['pack', 'available'],
    ]);
    check('delivery', deliveryAnchors({ stillNeeded: 3, artefacts: 6, pack: null, slides: true }));
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
    const analyze = code(PAGE('analyze'));
    expect(analyze.match(/<AnalyzeAnchorBar\b/g)?.length).toBe(2);
    expect(analyze.match(/<AnalysisAnswer\b[\s\S]*?\/>[\s{}]*<AnalyzeAnchorBar\b[\s\S]*?\/>[\s{}]*<EvidenceFindingsTable\b/g)?.length).toBe(2);
    expect(code('components/demo/DemoAnalyze.tsx')).toMatch(/<AnalysisAnswer\b[\s\S]*?\/>[\s{}]*<AnalyzeAnchorBar\b[\s\S]*?\/>[\s{}]*<EvidenceFindingsTable\b/);
    const table = code('components/analyze/EvidenceFindingsTable.tsx');
    const body = table.slice(table.indexOf('export default function EvidenceFindingsTable'));
    expect(body).not.toMatch(/AnchorBar\b/);

    before('components/transformation/TransformationObjectPage.tsx', /<PageAnchorBar\b/, 'id="tf-flow"');
    before(PAGE('testing'), /<PageAnchorBar\b/, 'id="testing-write"');
    before('components/demo/DemoTesting.tsx', /<PageAnchorBar\b/, 'id="testing-write"');
    before(PAGE('delivery'), /<PageAnchorBar\b/, 'id="evidence-chain"');
    before('components/delivery/DemoDelivery.tsx', /<PageAnchorBar\b/, 'id="evidence-chain"');
    before(PAGE('documentation'), /<DocumentChapterBar\b/, 'data-documentation-description');
    before('components/workspace/ItAnswers.tsx', /<ItAnchorBar\b/, 'id={IT_SECTION_IDS.findings}');

    // The bar is never wrapped in a section's own container: on Testing and
    // Delivery it is a direct child of the frame, the same as Documentation's.
    for (const stage of ['testing', 'delivery', 'documentation']) {
      const src = code(PAGE(stage));
      const at = src.search(stage === 'documentation' ? /<DocumentChapterBar\b/ : /<PageAnchorBar\b/);
      const indent = src.slice(src.lastIndexOf('\n', at) + 1, at);
      // StageFrame's children stand at six spaces; Documentation's bar sits in a `{cond ? … : null}` one level in.
      expect(indent.length, `${stage}: the bar is nested inside a section`).toBeLessThanOrEqual(8);
    }
  });
});
