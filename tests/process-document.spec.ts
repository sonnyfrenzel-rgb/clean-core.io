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
  businessSentences,
  documentTexts,
  isBusinessStatement,
  isTrivialStatement,
  processDocumentBlocks,
  sentenceKey,
  type ProcessDocument,
} from '../lib/process-document';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { blocksMarkdown, blocksDocxParts } from '../lib/requirements-export';
import { escapeHtml } from '../lib/export-safety';

/**
 * The process description of the Documentation stage (owner 03.10.2026:
 * "Nobody can understand that. Endless lists and nothing coherent for
 * successors.") — as data, over the two examples the owner looked at.
 *
 * What it holds: the sections in the order of a process description; a
 * business part without "the field … is set to …" and without a sentence
 * twice; every step and every rule on its lines; the technical trace whole,
 * in the appendix; and one builder behind the page, the Confluence page, the
 * Markdown and the Word file.
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

for (const [file] of EXAMPLES) {
  test.describe(file, () => {
    test('the sections stand in the order of a process description, in the export and the Markdown', async () => {
      const { doc } = documentOf(file);
      const html = await htmlOf(doc);
      const order = [...html.matchAll(/data-doc-section="([a-z]+)"/g)].map((m) => m[1]);
      expect(order).toEqual(PROCESS_DOCUMENT_SECTIONS.map((s) => s.key));
      const md = blocksMarkdown(processDocumentBlocks(doc, { projectName: doc.program }));
      const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      expect(headings).toEqual(PROCESS_DOCUMENT_SECTIONS.map((s) => s.title));
      // No table before the first section: a pasted page opens with its purpose.
      expect(html.indexOf('<table')).toBeGreaterThan(html.indexOf('data-doc-section="purpose"'));
      // The diagram is in the file, not a link to a screen.
      expect(html).toContain('<svg');
      expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('data-doc-section="overview"'));
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
      for (const s of doc.purpose.summary) expect(s.anchors.length).toBeGreaterThan(0);
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
      // A shared sentence stands at its first element and the others point there.
      const shown = doc.appendix.elements.filter((e) => e.does).map((e) => sentenceKey(e.does!));
      expect(new Set(shown).size).toBe(shown.length);
      expect(doc.appendix.merged).toBe(engine.statements.length - new Set(engine.statements.map((s) => sentenceKey(s.text))).size);
    });

    test('the page builder, the Confluence page, the Markdown and the Word file say the same', async () => {
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
  test('purpose, trigger and main path name the business, not the variables', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const purpose = doc.purpose.summary.map((s) => s.text).join(' ');
    expect(purpose).toContain('purchase requisition (EBAN)');
    expect(purpose).toContain('creates the purchase order (BAPI_PO_CREATE1)');
    expect(doc.trigger.selection.map((i) => i.name)).toEqual(['p_banfn', 'p_bnfpo', 'p_file', 'p_test']);
    expect(doc.trigger.selection[0]).toMatchObject({ meaning: 'Purchase requisition number', required: true });
    const steps = doc.overview.path.filter((e) => e.kind === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(12);
    expect(steps[0].name).toBe('Check authority');
    // The 50,000 limit is a rule with its line, in words.
    const limit = doc.rules.find((r) => r.ref === 'BR-010')!;
    expect(limit.condition).toContain('50000.00');
    expect(limit.anchors.some((a) => a.lineStart === 422)).toBe(true);
    // The message the user sees, with its line.
    expect(doc.exceptions.some((e) => e.message?.includes('Purchase requisition not found'))).toBe(true);
    // Open questions: the owner is asked once, and only there.
    expect(doc.questions.filter((q) => /owns this process/.test(q.question))).toHaveLength(1);
  });

  test('each open question is asked once', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const keys = doc.questions.map((q) => sentenceKey(q.question));
    expect(new Set(keys).size).toBe(keys.length);
    // The volume question is the non-functional one; the functional duplicate is not asked again.
    expect(doc.questions.filter((q) => /How many records does one run handle/.test(q.question))).toHaveLength(1);
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
    // The engine's purpose stays beside it.
    expect(doc.purpose.summary.length).toBeGreaterThan(0);
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
