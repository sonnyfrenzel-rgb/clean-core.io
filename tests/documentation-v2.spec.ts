import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoProcessMap } from '../lib/demo-workspace';
import { DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { buildProcessDocument } from '../lib/process-document-build';
import { readProcess, readRules } from '../lib/first-look';
import { aroundTheMap } from '../lib/around-the-map';
import { documentationPage, documentationAnchors, DOC_CHAPTERS } from '../lib/documentation-page';
import { figureParts, processFigure, processFigureSvg, A4_PART_WIDTH } from '../lib/process-figure';
import { elementsOfPlane, processCounts } from '../lib/process-map';

/**
 * ADR-127 — Documentation as one page in the order of the Word file (DOC-N0 … DOC-N6). Server-free: the page's
 * model (`lib/documentation-page.ts`) and Figure 1 (`lib/process-figure.ts`) over the shipped demo example, and source
 * guards that hold what the v2 page leaves behind.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCE = read(path.join('public', 'starter-examples', DEMO_SOURCE_FILE)).replace(/\r\n/g, '\n');
const MODEL = demoProcessMap(SOURCE);
const DOC = buildProcessDocument({ source: SOURCE, map: MODEL });
const AROUND = (() => {
  const proc = readProcess(SOURCE);
  const ruleSet = readRules(SOURCE, proc, null);
  return aroundTheMap({ source: SOURCE, skeleton: proc.skeleton, ruleSet, processFacts: proc.facts, engineVersion: null, customerTexts: null, narrative: null });
})();
const PAGE = documentationPage({ document: DOC, model: MODEL, around: AROUND });

test.describe('the page model (ADR-127)', () => {
  test('one step count: the tasks on the map\'s top level, the same as the map counts them (D9)', () => {
    const top = processCounts(elementsOfPlane(MODEL, null));
    expect(PAGE.stepCount).toBe(top.steps);
    expect(PAGE.answer.counts.find((c) => c.key === 'steps')?.value).toBe(top.steps);
    expect(PAGE.steps.length).toBeGreaterThan(0);
  });

  test('four numbers, each with its chapter (D5)', () => {
    expect(PAGE.answer.counts.map((c) => c.key)).toEqual(['steps', 'ends', 'rules', 'questions']);
    const chapters = new Set<string>(DOC_CHAPTERS.map((c) => c.key));
    for (const c of PAGE.answer.counts) expect(chapters.has(c.chapter)).toBe(true);
  });

  test('every step stands in exactly one of Analyze\'s phases, in order', () => {
    const listed = PAGE.phases.flatMap((p) => p.steps);
    expect(listed).toEqual(PAGE.steps.map((s) => s.position));
    expect(PAGE.phases.map((p) => p.title)).toEqual(AROUND.runs.map((r) => r.title));
  });

  test('the open questions are Analyze\'s, in its words (D7)', () => {
    expect(PAGE.questions.map((q) => q.text)).toEqual(AROUND.questions.map((q) => q.text));
    expect(PAGE.questionsMore).toBe(AROUND.questionsMore);
  });

  test('roles are read from the code — Analyze\'s "Who is involved" (D6)', () => {
    expect(PAGE.roles.map((r) => r.role)).toEqual(AROUND.who.map((r) => r.role));
  });

  test('the bar names at most six sections, in page order, the questions in amber', () => {
    const anchors = documentationAnchors(PAGE);
    expect(anchors.length).toBeLessThanOrEqual(6);
    const order: string[] = DOC_CHAPTERS.map((c) => c.id);
    const at = anchors.map((a) => order.indexOf(a.target));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const q = anchors.find((a) => a.key === 'questions');
    if (PAGE.questions.length + PAGE.questionsMore > 0) expect(q?.tone).toBe('open');
  });
});

test.describe('Figure 1 — the map, read-only (ADR-127 (2), (3))', () => {
  test('the figure draws the map\'s top level: the same elements and the same names as the file', () => {
    const figure = processFigure(MODEL);
    expect(figure).not.toBeNull();
    const top = elementsOfPlane(MODEL, null).filter((e) => e.tag !== 'boundaryEvent');
    const drawn = new Set(figure!.shapes.map((s) => s.id));
    for (const e of top) expect(drawn.has(e.id), e.id).toBe(true);
    expect(figure!.edges.length).toBeGreaterThan(0);
  });

  test('the steps carry the numbers of chapter 1', () => {
    const numbered = PAGE.figure!.shapes.filter((s) => s.step !== null);
    expect(numbered.length).toBe(PAGE.steps.filter((s) => PAGE.figure!.shapes.some((f) => f.id === s.id)).length);
    for (const s of numbered) expect(PAGE.steps.find((st) => st.id === s.id)?.position).toBe(s.step);
  });

  test('cut for A4 in parts at gaps, every part at a readable width, together the whole figure', () => {
    const figure = PAGE.figure!;
    const parts = figureParts(figure);
    expect(parts.length).toBe(Math.max(1, parts.length));
    for (const p of parts) expect(p.width).toBeLessThanOrEqual(A4_PART_WIDTH + 0.001);
    const sum = parts.reduce((n, p) => n + p.width, 0);
    expect(Math.abs(sum - figure.box.width)).toBeLessThan(0.01);
    if (figure.box.width > A4_PART_WIDTH) expect(parts.length).toBeGreaterThan(1);
  });

  test('the SVG escapes every text and names the figure', () => {
    const figure = processFigure({ ...MODEL, processName: 'A <b>&"name"' })!;
    const svg = processFigureSvg(figure);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('A &lt;b&gt;&amp;&quot;name&quot;');
    expect(svg).not.toContain('<b>');
  });
});

test.describe('the one page, rendered (static markup)', () => {
  type Mod = { default: (props: Record<string, unknown>) => React.ReactElement | null };
  let mod: Mod | null = null;
  async function load(): Promise<Mod> {
    if (mod) return mod;
    const out = path.join(ROOT, 'tmp', 'documentation-v2', String(process.pid), 'DocumentationOnePage.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'documentation', 'DocumentationOnePage.tsx')],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    mod = require(out) as Mod;
    return mod;
  }
  const render = async (props: Record<string, unknown> = {}) => {
    const { default: OnePage } = await load();
    return renderToStaticMarkup(React.createElement(OnePage, {
      page: PAGE,
      document: DOC,
      title: 'Emergency purchase approval',
      exports: { kinds: ['docx', 'html', 'md', 'print', 'bpmn'], onExport: () => undefined },
      analyzeHref: '/project/p/analyze',
      questionsHref: '/project/p/analyze#questions',
      next: { label: 'Testing', href: '/project/p/testing', sentence: 'Next.' },
      ...props,
    }));
  };

  test('the first screen answers: Starts, Ends, Needs a decision, four numbers, Ready to hand over with Word first', async () => {
    const html = await render();
    expect(html).toContain('data-answer-card=""');
    expect(html).toContain('data-doc-answer-facts=""');
    expect(html.match(/data-facet="(steps|ends|rules|questions)"/g)?.length).toBe(4);
    expect(html).toContain('Ready to hand over');
    const word = html.indexOf('Export as Word (.docx)');
    for (const other of ['data-export-confluence', 'data-export-process-md', 'data-export-print', 'data-export-bpmn']) {
      expect(html.indexOf(other), other).toBeGreaterThan(word);
    }
  });

  test('chapters 1–7 and the appendix in the order of the Word file, the bar before chapter 1', async () => {
    const html = await render();
    const order = [...html.matchAll(/data-doc-chapter="([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(DOC_CHAPTERS.map((c) => c.key));
    expect(html.indexOf('data-page-anchors')).toBeLessThan(html.indexOf('data-doc-chapter="process"'));
    expect(html.indexOf('data-doc-appendix=""')).toBeGreaterThan(html.indexOf('data-doc-chapter="questions"'));
    // The bar names its items by `data-doc-nav`, so a chapter is counted once.
    expect(html.match(/data-doc-nav="/g)?.length).toBe(documentationAnchors(PAGE).length);
  });

  test('Figure 1 is drawn with the steps of chapter 1, and a step opens its page in place', async () => {
    const html = await render();
    expect(html).toContain('data-doc-figure=""');
    const numbered = PAGE.figure!.shapes.filter((s) => s.step !== null).length;
    expect(html.match(/data-doc-figure-step="/g)?.length).toBe(numbered);
    expect(html.match(/data-doc-step="/g)?.length).toBe(PAGE.steps.length);
    // A phone reads the steps as the list; the figure steps back for one line.
    expect(html).toContain('data-doc-figure-phone=""');
  });

  test('no inputs, no editor, no view switch; no dead end ("Nothing more to write")', async () => {
    const html = await render();
    expect(html).not.toMatch(/<input\b|<textarea\b|<select\b|contenteditable/);
    expect(html).not.toMatch(/data-raci-edit|data-process-map-canvas|data-handbook/);
    expect(html).not.toContain('Nothing more to write');
    expect(html).not.toContain('Not written yet');
    const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
    expect(page).toMatch(/<StageHeader\b[^>]*view="one-page"/);
    expect(page).not.toMatch(/searchParams\.get\('view'\)|view === 'it'|view === 'management'/);
  });

  test('the demo exports nothing and says so where the exports stand', async () => {
    const html = await render({ exports: null, noExportNote: 'The demo exports nothing.' });
    expect(html).not.toMatch(/data-export-(process-docx|confluence|process-md|print|bpmn)/);
    expect(html).toContain('The demo exports nothing.');
  });

  test('chips are the family\'s six only, never the old provenance chip', async () => {
    const html = await render();
    expect(html).toContain('data-family-chip="engine"');
    expect(html).not.toContain('data-provenance=');
    const src = fs.readFileSync(path.join(ROOT, 'components', 'documentation', 'DocumentationOnePage.tsx'), 'utf8');
    expect(src).not.toContain('CcProvenanceChip');
  });
});
