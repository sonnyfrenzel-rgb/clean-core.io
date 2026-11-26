import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { readProcess, readRules } from '../lib/first-look';
import { aroundTheMap } from '../lib/around-the-map';
import { documentationPage } from '../lib/documentation-page';
import {
  A4_PORTRAIT,
  FIGURE_CAPTION_ROOM,
  FIGURE_MIN_SCALE,
  edgeLabelExtent,
  figureCaption,
  figurePage,
  figureParts,
  figureScale,
  processFigureSvg,
  type FigurePart,
  type ProcessFigure,
} from '../lib/process-figure';
import { buildEngineConfluenceHtml, confluenceHeadingAnchor } from '../lib/documentation-export';
import { processDocumentBlocks } from '../lib/process-document-outline';
import { blocksDocxParts, blocksMarkdown, DOCX_TEXT_WIDTH_PX } from '../lib/requirements-export';

/**
 * Owner 26.11.2026: "Confluence export aber auch alle anderen Exporte … BPMN-Visualisierungen werden nicht sauber
 * angezeigt", "im Bildumbruch nicht lesbar", and "die Go-to-Navigation im Confluence-Export muss vollständig
 * funktionieren". Server-free, over the shipped examples.
 *
 * What was wrong: the map's layout wraps a long process into rows, and Figure 1 was cut for A4 *between columns* —
 * part 1 showed the left half of every row, part 2 the right half, so no row could be read through; a part was taller
 * than the Word page; flow labels were cut at the part's edge and drawn under shapes. Now a wide figure goes on a
 * landscape page and a tall one is cut *between rows*, each part whole and within its page at one readable scale.
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = ['Z_MM_PO_APPROVAL.abap', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'Z_SD_FREIGHT_RATE_CHECK.abap'];

function exampleOf(file: string) {
  const name = file.replace(/\..*$/, '');
  const source = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: name, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const doc = buildProcessDocument({ source, map: model });
  const proc = readProcess(source);
  const around = aroundTheMap({ source, skeleton: proc.skeleton, ruleSet: readRules(source, proc, null), processFacts: proc.facts, engineVersion: null, customerTexts: null, narrative: null });
  const figure = documentationPage({ document: doc, model, around }).figure!;
  const block = { caption: figureCaption(figure), parts: figureParts(figure).map((p) => ({ caption: figureCaption(figure, p), svg: processFigureSvg(figure, p) })) };
  return { name, doc, figure, block };
}

/** Where a shape draws, read back from its drawing in the SVG: outline and every text of its name and anchor. */
function shapeBox(figure: ProcessFigure, id: string) {
  const s = figure.shapes.find((sh) => sh.id === id)!;
  const ys = [s.y, s.y + s.height];
  if (s.labelBox) ys.push(s.labelBox.y, s.labelBox.y + Math.max(1, s.lines.length) * 14.4 + (s.anchor ? 15 : 0));
  return { top: Math.min(...ys), bottom: Math.max(...ys), left: s.x, right: s.x + s.width };
}

const inside = (part: FigurePart, top: number, bottom: number, left: number, right: number) =>
  top >= part.y - 0.5 && bottom <= part.y + part.height + 0.5 && left >= part.x - 0.5 && right <= part.x + part.width + 0.5;

for (const file of EXAMPLES) {
  test.describe(`Figure 1 of ${file} on paper`, () => {
    const { name, doc, figure, block } = exampleOf(file);
    const page = figurePage(figure);
    const scale = figureScale(figure, page);
    const parts = figureParts(figure);

    test('the figure box holds every shape, every flow and every flow label', () => {
      const { x, y, width, height } = figure.box;
      for (const s of figure.shapes) {
        const b = shapeBox(figure, s.id);
        expect(b.top, s.id).toBeGreaterThanOrEqual(y);
        expect(b.bottom, s.id).toBeLessThanOrEqual(y + height);
        expect(b.left, s.id).toBeGreaterThanOrEqual(x);
        expect(b.right, s.id).toBeLessThanOrEqual(x + width);
      }
      for (const e of figure.edges) {
        for (const p of e.points) expect(p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height, e.id).toBe(true);
        const l = edgeLabelExtent(e);
        if (l) expect(l.x >= x && l.x + l.width <= x + width && l.y >= y && l.y + l.height <= y + height, `${e.id} label`).toBe(true);
      }
    });

    test('a figure that would shrink below a readable size on an upright page goes on a landscape page', () => {
      expect(scale).toBeGreaterThanOrEqual(FIGURE_MIN_SCALE);
      if (figure.box.width * FIGURE_MIN_SCALE > A4_PORTRAIT.width) expect(page.orientation).toBe('landscape');
      // The shipped examples are rows of the layout; on their page they are never cut between columns.
      expect(new Set(parts.map((p) => p.x)).size).toBe(1);
    });

    test('every part fits its page with its caption, the parts read top to bottom and together are the figure', () => {
      for (const p of parts) {
        expect(p.width * scale, `part ${p.index} width`).toBeLessThanOrEqual(page.width + 0.5);
        expect(p.height * scale, `part ${p.index} height`).toBeLessThanOrEqual(page.height - FIGURE_CAPTION_ROOM + 0.5);
      }
      for (let i = 1; i < parts.length; i += 1) expect(parts[i].y).toBeGreaterThanOrEqual(parts[i - 1].y + parts[i - 1].height - 0.01);
      const area = parts.reduce((n, p) => n + p.width * p.height, 0);
      expect(Math.abs(area - figure.box.width * figure.box.height)).toBeLessThan(1);
    });

    test('no break goes through a shape, its name, its line anchor or a flow label (im Bildumbruch lesbar)', () => {
      for (const s of figure.shapes) {
        const b = shapeBox(figure, s.id);
        expect(parts.filter((p) => inside(p, b.top, b.bottom, b.left, b.right)).length, `${s.id} ${s.name}`).toBe(1);
      }
      for (const e of figure.edges) {
        const l = edgeLabelExtent(e);
        if (l) expect(parts.filter((p) => inside(p, l.y, l.y + l.height, l.x, l.x + l.width)).length, `${e.id} ${e.label}`).toBe(1);
      }
    });

    test('a cut figure says in every caption where it continues', () => {
      if (parts.length === 1) {
        expect(figureCaption(figure, parts[0])).not.toContain('part');
        return;
      }
      expect(figureCaption(figure, parts[0])).toContain(`part 1 of ${parts.length} (continues in part 2)`);
      expect(figureCaption(figure, parts[parts.length - 1])).toContain(`continued from part ${parts.length - 1}`);
    });

    test('each part\'s SVG shows exactly its slice at the page\'s size, and every name stands in one of them', () => {
      const all = block.parts.map((p) => p.svg).join('');
      parts.forEach((p, i) => {
        const svg = block.parts[i].svg;
        expect(svg).toContain(`viewBox="${p.x} ${p.y} ${p.width} ${p.height}"`);
        const width = Number(/\swidth="(\d+)"/.exec(svg)![1]);
        const height = Number(/\sheight="(\d+)"/.exec(svg)![1]);
        expect(width).toBeLessThanOrEqual(page.width);
        expect(height).toBeLessThanOrEqual(page.height - FIGURE_CAPTION_ROOM + 1);
      });
      for (const s of figure.shapes) for (const line of s.lines) expect(all, s.id).toContain(line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
      // A flow's label is drawn after the shapes, on white, so no shape covers it.
      for (const { svg } of block.parts) {
        const lastShape = Math.max(svg.lastIndexOf('rx="10"'), svg.lastIndexOf('<circle'));
        for (const e of figure.edges.filter((f) => f.label)) {
          const at = svg.indexOf(`>${e.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`);
          if (at >= 0) expect(at, e.label).toBeGreaterThan(lastShape);
        }
      }
    });

    test('Word: a wide figure stands in a landscape section, every picture within its page and kept with its caption', () => {
      const blocks = processDocumentBlocks(doc, { projectName: name, figure: block });
      const xml = blocksDocxParts(blocks)['word/document.xml'];
      const pictures = [...xml.matchAll(/<w:p><w:pPr><w:keepNext\/><w:jc w:val="center"\/><\/w:pPr><w:r><w:drawing>[\s\S]*?<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)];
      expect(pictures).toHaveLength(parts.length);
      const landscape = page.orientation === 'landscape';
      const textWidth = landscape ? DOCX_TEXT_WIDTH_PX.landscape : DOCX_TEXT_WIDTH_PX.portrait;
      const textHeight = landscape ? 697 : 971;
      for (const [, cx, cy] of pictures) {
        expect(Number(cx) / 9525).toBeLessThanOrEqual(textWidth + 0.5);
        expect(Number(cy) / 9525).toBeLessThanOrEqual(textHeight - FIGURE_CAPTION_ROOM + 1);
      }
      const first = xml.indexOf('<w:drawing>');
      const before = xml.lastIndexOf('<w:sectPr>', first);
      const after = xml.indexOf('<w:sectPr>', xml.lastIndexOf('<w:drawing>'));
      if (landscape) {
        // The section before the figure closes upright, the figure's own section is landscape, the rest upright again.
        expect(xml.slice(before, xml.indexOf('</w:sectPr>', before))).not.toContain('landscape');
        expect(xml.slice(after, xml.indexOf('</w:sectPr>', after))).toContain('w:orient="landscape"');
        expect(xml.slice(xml.lastIndexOf('<w:sectPr>'))).not.toContain('landscape');
      } else {
        expect(xml).not.toContain('landscape');
      }
    });

    test('Confluence page: every in-page link lands on an anchor, the chapters on the anchors Confluence gives headings', async () => {
      const html = await buildEngineConfluenceHtml(doc, null, { projectName: name, figure }).text();
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      const links = [...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]);
      expect(links.length).toBeGreaterThan(0);
      for (const l of links) expect(ids.has(l), l).toBe(true);
      // No chapter is linked by a key Confluence would drop on paste; each heading's id is the one Confluence writes.
      expect(links.filter((l) => l.startsWith('pd-'))).toEqual([]);
      for (const m of html.matchAll(/<h([1-6])[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
        const text = m[3].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        expect(m[2].replace(/&amp;/g, '&')).toBe(confluenceHeadingAnchor(text));
      }
      expect(confluenceHeadingAnchor(' 1. How the  process works ')).toBe('1.-How-the-process-works');
      // The figure prints on the page it was laid out for.
      expect(html.match(new RegExp(`<figure [^>]*data-doc-figure-page="${page.orientation}"`, "g"))?.length).toBe(parts.length);
      expect(html).toContain('@page cc-figure-landscape { size: A4 landscape;');
    });

    test('Markdown and Word: every in-page link lands on its anchor or bookmark', () => {
      const blocks = processDocumentBlocks(doc, { projectName: name, figure: block });
      const md = blocksMarkdown(blocks);
      const mdIds = new Set([...md.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
      const mdLinks = [...md.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(mdLinks.length).toBeGreaterThan(0);
      for (const l of mdLinks) expect(mdIds.has(l), l).toBe(true);
      const xml = blocksDocxParts(blocks)['word/document.xml'];
      const marks = new Set([...xml.matchAll(/<w:bookmarkStart w:id="\d+" w:name="([^"]+)"\/>/g)].map((m) => m[1]));
      const wordLinks = [...xml.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map((m) => m[1]);
      expect(wordLinks.length).toBeGreaterThan(0);
      for (const l of wordLinks) expect(marks.has(l), l).toBe(true);
    });

    test('rendered: in a Confluence-wide page every figure fits the width and no label is clipped', async ({ page: browser }) => {
      const html = await buildEngineConfluenceHtml(doc, null, { projectName: name, figure }).text();
      await browser.setViewportSize({ width: 760, height: 900 });
      await browser.setContent(html);
      const report = await browser.evaluate(() => [...document.querySelectorAll('figure[data-doc-figure] svg')].map((svg) => {
        const s = svg as SVGSVGElement;
        const vb = s.viewBox.baseVal;
        const r = s.getBoundingClientRect();
        const clipped = [...s.querySelectorAll('text')].filter((t) => {
          const b = (t as SVGTextElement).getBBox();
          return b.x < vb.x - 1 || b.y < vb.y - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y + b.height > vb.y + vb.height + 1;
        }).map((t) => t.textContent);
        // A text cut by a part's edge belongs to another part: only texts that start inside the slice count.
        const own = [...s.querySelectorAll('text')].filter((t) => {
          const b = (t as SVGTextElement).getBBox();
          return b.x + b.width / 2 > vb.x && b.x + b.width / 2 < vb.x + vb.width && b.y + b.height / 2 > vb.y && b.y + b.height / 2 < vb.y + vb.height;
        }).map((t) => t.textContent);
        return { right: r.right, clipped: clipped.filter((c) => own.includes(c)), width: document.documentElement.clientWidth };
      }));
      expect(report.length).toBe(parts.length);
      for (const r of report) {
        expect(r.right).toBeLessThanOrEqual(r.width + 0.5);
        expect(r.clipped).toEqual([]);
      }
    });
  });
}
