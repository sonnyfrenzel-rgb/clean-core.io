import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import {
  PROCESS_DOCUMENT_SECTIONS,
  QUESTION_THEMES,
  businessSentences,
  documentTexts,
  isBusinessStatement,
  isTrivialStatement,
  sentenceKey,
  sentencesOf,
  wordCount,
  type ProcessDocument,
} from '../lib/process-document';
import { documentOutline, longTables, processDocumentBlocks } from '../lib/process-document-outline';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { blocksMarkdown, blocksDocxParts } from '../lib/requirements-export';
import { escapeHtml } from '../lib/export-safety';

/**
 * The process description of the Documentation stage — as data, over the two
 * examples the owner looked at.
 *
 * Owner 03.10.2026: "Nobody can understand that. Endless lists and nothing
 * coherent for successors." Owner 04.10.2026: "far too long, complex,
 * linguistically complicated and not enterprise-ready … much smarter-looking,
 * to the point and more concise."
 *
 * What it holds: a one-page summary on top (at most five rules and risks, six
 * key figures, two or three short sentences); every section opening with one
 * line of at most twenty words; a body in business words — no program names in
 * the plain lines — about half as long as before; and nothing lost: every text
 * the builder wrote stands in the export's body or appendix, the technical
 * trace whole. One outline behind the page, the Confluence page, the Markdown
 * and the Word file.
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = [
  ['Z_MM_PO_APPROVAL.abap', 'Z_MM_PO_APPROVAL'],
  ['Z_SALES_ORDER_CREATOR.txt', 'Z_SALES_ORDER_CREATOR'],
] as const;

function sourceOf(file: string): string {
  return fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
}

function mapOf(source: string, file: string) {
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  return buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null, 'no-key'), fileName: file });
}

const built = new Map<string, { source: string; doc: ProcessDocument }>();
function documentOf(file: string) {
  if (!built.has(file)) {
    const source = sourceOf(file);
    built.set(file, { source, doc: buildProcessDocument({ source, map: mapOf(source, file) }) });
  }
  return built.get(file)!;
}

const htmlOf = async (doc: ProcessDocument) => buildEngineConfluenceHtml(doc, null, { projectName: doc.program }).text();
const markdownOf = (doc: ProcessDocument) => blocksMarkdown(processDocumentBlocks(doc, { projectName: doc.program }));
/** The body of the Markdown — everything above the appendix. */
const bodyOf = (md: string) => md.slice(0, md.indexOf('## Appendix'));

/** A name only the program uses: `BAPI_PO_CREATE1`, `gs_eban-frgkz`, `ZMM_PO_APPR`. */
const PROGRAM_NAME = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b[a-z][a-z0-9]*_[a-z0-9_-]+\b|\bZ[A-Z0-9_]{3,}\b/;

for (const [file] of EXAMPLES) {
  test.describe(file, () => {
    test('the summary comes first, then the sections in the order of a process description', async () => {
      const { doc } = documentOf(file);
      const html = await htmlOf(doc);
      const order = [...html.matchAll(/data-doc-section="([a-z]+)"/g)].map((m) => m[1]);
      expect(order).toEqual(PROCESS_DOCUMENT_SECTIONS.map((s) => s.key));
      const md = markdownOf(doc);
      const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      expect(headings).toEqual(['At a glance', ...PROCESS_DOCUMENT_SECTIONS.map((s) => s.title)]);
      // The cover and the summary stand before section 1; the diagram after the overview's heading.
      expect(html.indexOf('data-doc-cover')).toBeLessThan(html.indexOf('data-glance-export'));
      expect(html.indexOf('data-glance-export')).toBeLessThan(html.indexOf('data-doc-section="purpose"'));
      expect(html).toContain('<svg');
      expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('data-doc-section="overview"'));
    });

    test('at a glance: two or three short sentences, six key figures, at most five rules and risks', () => {
      const { doc } = documentOf(file);
      const o = documentOutline(doc);
      expect(doc.glance.summary.length).toBeGreaterThanOrEqual(1);
      expect(doc.glance.summary.length).toBeLessThanOrEqual(3);
      expect(o.glance.figures.map((f) => f.label)).toEqual(['Steps', 'Decision points', 'Business rules', 'Exceptions', 'Integrations', 'Open questions']);
      expect(doc.glance.points.length).toBeLessThanOrEqual(5);
      for (const p of doc.glance.points) expect(p.anchors.length, p.text).toBeGreaterThan(0);
      // Rules before risks; a rule names its id.
      const kinds = doc.glance.points.map((p) => p.kind);
      expect([...kinds].sort((a, b) => (a === b ? 0 : a === 'rule' ? -1 : 1))).toEqual(kinds);
      for (const p of doc.glance.points.filter((x) => x.kind === 'rule')) expect(p.ref).toMatch(/^BR-\d+$/);
    });

    test('plain language: every summary sentence, lead and step line has at most twenty words and no program names', () => {
      const { doc } = documentOf(file);
      const o = documentOutline(doc);
      const plain = [
        ...doc.glance.summary.map((s) => s.text.replace(doc.program, 'The program')),
        doc.glance.trigger.text,
        ...Object.values(o.leads),
        ...doc.overview.path.flatMap((e) => (e.kind === 'step' ? [e.line] : [])).filter(Boolean),
        ...doc.purpose.outOfScope.map((s) => s.text),
        doc.purpose.users.text,
      ];
      const tables = doc.trigger.data.map((d) => d.name);
      for (const text of plain) {
        for (const sentence of sentencesOf(text)) expect(wordCount(sentence), sentence).toBeLessThanOrEqual(20);
        expect(text, 'a program name in a plain line').not.toMatch(PROGRAM_NAME);
        for (const t of tables) expect(text.split(/[^A-Z0-9_/]+/), `${t} in a plain line: ${text}`).not.toContain(t);
      }
    });

    test('the business part says nothing trivial and nothing twice', () => {
      const { doc } = documentOf(file);
      const sentences = businessSentences(doc);
      for (const s of sentences) {
        expect(isTrivialStatement(s.text), s.text).toBe(false);
        expect(s.text, 'a field assignment in the business part').not.toMatch(/\bis set to\b/);
        expect(s.text).not.toMatch(/only proves that this point in the code was reached/);
      }
      const keys = sentences.map((s) => sentenceKey(s.text));
      expect(new Set(keys).size, 'a sentence stands twice in the business part').toBe(keys.length);
      for (const step of doc.overview.path) {
        if (step.kind !== 'step') continue;
        for (const d of step.does) expect(isBusinessStatement(d.text), d.text).toBe(true);
      }
    });

    test('every step, rule, exception, output, integration and control names its lines', () => {
      const { doc } = documentOf(file);
      const steps = doc.overview.path.filter((e) => e.kind === 'step');
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.anchors.length, `${step.name} has no lines`).toBeGreaterThan(0);
        for (const d of step.does) expect(d.anchors.length).toBeGreaterThan(0);
      }
      for (const list of [doc.rules, doc.exceptions, doc.outputs, doc.integrations, doc.controls]) {
        for (const row of list) expect(row.anchors.length, JSON.stringify(row)).toBeGreaterThan(0);
      }
      for (const s of doc.glance.summary) expect(s.anchors.length).toBeGreaterThan(0);
      const lines = doc.lineCount;
      const all = [...steps.flatMap((s) => s.anchors), ...doc.rules.flatMap((r) => r.anchors)];
      for (const a of all) {
        expect(a.lineStart).toBeGreaterThanOrEqual(1);
        expect(a.lineEnd).toBeLessThanOrEqual(lines);
      }
    });

    test('the appendix holds the whole technical trace, each sentence once', () => {
      const { source, doc } = documentOf(file);
      const engine = buildProcessDocumentation({ source, map: mapOf(source, file) });
      const inAppendix = doc.appendix.groups.flatMap((g) => g.statements.map((s) => sentenceKey(s.text)));
      expect(new Set(inAppendix).size).toBe(inAppendix.length);
      expect(new Set(inAppendix)).toEqual(new Set(engine.statements.map((s) => sentenceKey(s.text))));
      expect(doc.appendix.elements.map((e) => e.id)).toEqual(engine.steps.map((s) => s.id));
      const shown = doc.appendix.elements.filter((e) => e.does).map((e) => sentenceKey(e.does!));
      expect(new Set(shown).size).toBe(shown.length);
      expect(doc.appendix.merged).toBe(engine.statements.length - new Set(engine.statements.map((s) => sentenceKey(s.text))).size);
    });

    test('nothing is lost: the Confluence page, the Markdown and the Word file carry every text, in the body or the appendix', async () => {
      const { doc } = documentOf(file);
      const html = await htmlOf(doc);
      const blocks = processDocumentBlocks(doc, { projectName: doc.program });
      const md = blocksMarkdown(blocks);
      const word = blocksDocxParts(blocks)['word/document.xml'];
      for (const text of documentTexts(doc)) {
        expect(html, `the export lost: ${text}`).toContain(escapeHtml(text));
        expect(md.includes(text) || md.includes(text.replace(/\|/g, '\\|')), `the Markdown lost: ${text}`).toBe(true);
        const xml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        expect(word.includes(xml) || word.includes(xml.replace(/"/g, '&quot;')), `the Word file lost: ${text}`).toBe(true);
      }
      // Every row of a table the body shortens stands whole in the appendix.
      const appendix = md.slice(md.indexOf('## Appendix'));
      for (const t of longTables(documentOutline(doc))) {
        expect(appendix).toContain(`#### ${t.caption} (${t.rows.length})`);
        for (const r of t.rows) expect(appendix, r.cells.join(' | ')).toContain(`| ${r.cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`);
      }
    });

    test('the Word file maps headings to Word styles, prints real tables and starts the appendix on a new page', () => {
      const { doc } = documentOf(file);
      const xml = blocksDocxParts(processDocumentBlocks(doc, { projectName: doc.program }))['word/document.xml'];
      expect(xml).toContain('<w:pStyle w:val="Title"/>');
      expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
      expect((xml.match(/<w:tbl>/g) ?? []).length).toBeGreaterThan(5);
      const pageBreaks = [...xml.matchAll(/<w:br w:type="page"\/>/g)].map((m) => m.index!);
      expect(pageBreaks.length).toBe(2);
      expect(pageBreaks[1]).toBeLessThan(xml.indexOf('Appendix: technical trace'));
    });

    test('deterministic: the same source gives the same document', () => {
      const source = sourceOf(file);
      const a = buildProcessDocument({ source, map: mapOf(source, file) });
      const b = buildProcessDocument({ source, map: mapOf(source, file) });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
}

test.describe('Z_MM_PO_APPROVAL reads like a process description', () => {
  test('the body is about half as long as before, and the summary names the business', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    // Before 04.10.2026 the body (everything above the appendix) was 2,801
    // words by this count; the owner asked for about half.
    const body = wordCount(bodyOf(markdownOf(doc)));
    expect(body, `the body has ${body} words`).toBeLessThanOrEqual(1650);
    const summary = doc.glance.summary.map((s) => s.text).join(' ');
    expect(summary).toContain('creates the purchase order');
    expect(summary).toContain('the purchase requisition');
    expect(summary).not.toContain('BAPI_PO_CREATE1');
    // The program's names are kept — in the source column, not in the sentence.
    expect(doc.glance.summary[0].detail).toContain('BAPI_PO_CREATE1');
  });

  test('inputs, rules and messages keep their facts', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    expect(doc.trigger.selection.map((i) => i.name)).toEqual(['p_banfn', 'p_bnfpo', 'p_file', 'p_test']);
    expect(doc.trigger.selection[0]).toMatchObject({ meaning: 'Purchase requisition number', required: true });
    const steps = doc.overview.path.filter((e) => e.kind === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(12);
    expect(steps[0].name).toBe('Check authority');
    const limit = doc.rules.find((r) => r.ref === 'BR-010')!;
    expect(limit.condition).toContain('50000.00');
    expect(limit.anchors.some((a) => a.lineStart === 422)).toBe(true);
    // The threshold rules lead the summary's points.
    expect(doc.glance.points.slice(0, 2).map((p) => p.ref)).toEqual(['BR-009', 'BR-010']);
    const notFound = doc.exceptions.find((e) => e.shown?.includes('Purchase requisition not found'))!;
    expect(notFound.messageRef).toBe('E001 · ZMM_PO');
    expect(notFound.message).toContain('Error E001 of class ZMM_PO');
  });

  test('open questions: one plain line each, numbered Q1…, grouped by theme, what blocks first, near-duplicates asked once', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const qs = doc.questions;
    expect(qs.map((q) => q.number)).toEqual(qs.map((_, i) => i + 1));
    // No ABAP and no line numbers in a question; the names stand aside.
    for (const q of qs) {
      expect(q.question, q.question).not.toMatch(/\b[a-z][a-z0-9]*_[a-z0-9_-]+\b|\bCASE\b|\bat L\d+/);
      expect(q.question, q.question).not.toMatch(/\bZ[A-Z0-9_]{3,}\b/);
    }
    // Themes in their order; within a theme, what blocks the design or the cutover first.
    const rank = (t: string) => QUESTION_THEMES.findIndex((x) => x.key === t);
    for (let i = 1; i < qs.length; i += 1) {
      expect(rank(qs[i].theme)).toBeGreaterThanOrEqual(rank(qs[i - 1].theme));
      if (qs[i].theme === qs[i - 1].theme && qs[i].blocks) expect(qs[i - 1].blocks, `Q${qs[i].number}`).not.toBeNull();
    }
    // The two takeover questions are one, with both tables; the old ids stay in the trace.
    const takeover = qs.find((q) => q.refs.includes('TBD-02'))!;
    expect(takeover.refs).toEqual(['TBD-02', 'TBD-03']);
    expect(takeover.detail).toBe('ZMM_PO_APPR, ZMM_PO_ATTACH');
    expect(takeover.blocks).toBe('cutover');
    expect(qs.find((q) => q.refs.includes('C-01'))!.refs).toEqual(['C-01', 'C-02']);
    // The owner is asked once.
    expect(qs.filter((q) => /owns this process/.test(q.question))).toHaveLength(1);
    expect(qs.filter((q) => /How many records/.test(q.question))).toHaveLength(1);
    // The unreached rule is asked in plain words; its ABAP stands aside.
    const unreached = qs.find((q) => q.refs.includes('TBC-02'))!;
    expect(unreached.question).toBe('Is rule BR-007 still needed, although the program never reaches it?');
    expect(unreached.detail).toContain('knttp');
  });
});

test.describe('model wording, only as a proposal', () => {
  const file = 'Z_MM_PO_APPROVAL.abap';

  test('without a narrative or proposals the document carries no model text', () => {
    const { doc } = documentOf(file);
    expect(doc.purpose.proposal).toBeNull();
    for (const e of doc.overview.path) if (e.kind === 'step') expect(e.proposal).toBeNull();
  });

  test('a narrative sentence anchored to lines becomes the purpose proposal; an unanchored one does not', () => {
    const source = sourceOf(file);
    const narrative = JSON.stringify({
      asIsContext: 'The program approves emergency purchase requisitions and creates the purchase order [L591-600]. It is very important for the business.',
    });
    const doc = buildProcessDocument({ source, map: mapOf(source, file), narrative });
    expect(doc.purpose.proposal).toMatchObject({ origin: 'narrative' });
    expect(doc.purpose.proposal!.text).toContain('approves emergency purchase requisitions');
    expect(doc.purpose.proposal!.text).not.toContain('very important');
    expect(doc.purpose.proposal!.anchors).toEqual([{ lineStart: 591, lineEnd: 600 }]);
    // The engine's summary stays beside it.
    expect(doc.glance.summary.length).toBeGreaterThan(0);
  });

  test('a statement proposal stands at its step; one that contradicts the code is left out', () => {
    const source = sourceOf(file);
    const doc = buildProcessDocument({
      source,
      map: mapOf(source, file),
      proposals: [
        { text: 'The buyer’s authorization for the purchasing group is checked.', anchors: [{ lineStart: 108, lineEnd: 110 }] },
        { text: 'Contradicting sentence.', anchors: [{ lineStart: 61, lineEnd: 64 }], contradicts: true },
      ],
    });
    const steps = doc.overview.path.filter((e) => e.kind === 'step');
    expect(steps[0].proposal?.text).toContain('authorization for the purchasing group');
    expect(steps.every((s) => s.proposal?.text !== 'Contradicting sentence.')).toBe(true);
  });
});
