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
  sectionTitle,
  businessSentences,
  documentTexts,
  isBusinessStatement,
  isTrivialStatement,
  sentenceKey,
  sentencesOf,
  wordCount,
  type PdStep,
  type ProcessDocument,
} from '../lib/process-document';
import { decisionTableHitPolicy } from '../lib/decision-tables';
import type { OpenQuestions } from '../lib/open-questions';
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
      expect(html.indexOf('data-glance-export')).toBeLessThan(html.indexOf('data-doc-section="overview"'));
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
      expect(pageBreaks[1]).toBeLessThan(xml.indexOf('Appendix: details and evidence'));
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

/* ---------------------------------------------------------------- ADR-084 */

/** A dialogue report: a selection screen with a preset, a filtered read, a popup whose answer is dropped, a batch input. */
const DIALOGUE = `REPORT zdemo_dates.
TABLES: ekko, eket.
CONSTANTS c_x TYPE c VALUE 'X'.
DATA: gt_po  TYPE STANDARD TABLE OF ekpo,
      gs_po  TYPE ekpo,
      gv_sum TYPE p,
      it_bdc LIKE bdcdata OCCURS 0 WITH HEADER LINE,
      g_answer(1) TYPE c,
      l_datum(10) TYPE c.
SELECT-OPTIONS s_bedat FOR ekko-bedat.
PARAMETERS p_unused AS CHECKBOX.
INITIALIZATION.
  s_bedat-low = sy-datum - 365.
  APPEND s_bedat.
START-OF-SELECTION.
  SELECT * FROM ekpo INTO TABLE gt_po WHERE loekz = space AND aedat IN s_bedat.
  PERFORM change_dates.
FORM change_dates.
  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING text_question = 'Change the dates?'
    IMPORTING answer = g_answer.
  LOOP AT gt_po INTO gs_po.
    gv_sum = gv_sum + gs_po-menge.
    REFRESH it_bdc.
    PERFORM bdc_dynpro USING 'SAPMM06E' '0105'.
    PERFORM bdc_field  USING 'RM06E-BSTNR' gs_po-ebeln.
    PERFORM bdc_dynpro USING 'SAPMM06E' '1117'.
    PERFORM bdc_field  USING 'EKET-EEIND(01)' l_datum.
    PERFORM bdc_field  USING 'BDC_OKCODE'  '=BU'.
    CALL TRANSACTION 'ME22' USING it_bdc MODE 'N' UPDATE 'S'.
  ENDLOOP.
ENDFORM.
FORM bdc_dynpro USING program dynpro.
  CLEAR it_bdc.
  it_bdc-program  = program.
  it_bdc-dynpro   = dynpro.
  it_bdc-dynbegin = c_x.
  APPEND it_bdc.
ENDFORM.
FORM bdc_field USING fnam fval.
  CLEAR it_bdc.
  it_bdc-fnam = fnam.
  it_bdc-fval = fval.
  APPEND it_bdc.
ENDFORM.
`;

function documentOfSource(source: string, file = 'zdemo_dates.abap') {
  return buildProcessDocument({ source, map: mapOf(source, file) });
}

test.describe('ADR-084: seven sections, a title that leads with the process, reader questions, who acts', () => {
  test('the title is "<project> — <PROGRAM>", "Process description" under it, in every rendering', async () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const o = documentOutline(doc, { projectName: 'Emergency purchase approval' });
    expect(o.title).toBe('Emergency purchase approval — Z_MM_PO_APPROVAL');
    expect(o.subtitle).toBe('Process description');
    // A project named after its program does not say it twice.
    expect(documentOutline(doc, { projectName: 'Z_MM_PO_APPROVAL' }).title).toBe('Z_MM_PO_APPROVAL');
    const md = blocksMarkdown(processDocumentBlocks(doc, { projectName: 'Emergency purchase approval' }));
    expect(md.startsWith('# Emergency purchase approval — Z_MM_PO_APPROVAL\n\n*Process description*')).toBe(true);
    const html = await buildEngineConfluenceHtml(doc, null, { projectName: 'Emergency purchase approval' }).text();
    expect(html).toContain('<h1>Emergency purchase approval — Z_MM_PO_APPROVAL</h1>');
    expect(html).toContain('data-doc-subtitle="">Process description<');
  });

  test('"Go to": the reader questions lead to their sections — links in Confluence, a plain line in a file', async () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const o = documentOutline(doc);
    expect(o.glance.goTo.map((g) => g.label)).toEqual([
      'What does it do?', 'Who acts?', 'Which rules decide?', 'What if it fails?', 'What changes in SAP?', 'Which systems and data?', 'What is still open?',
    ]);
    const keys = new Set<string>(PROCESS_DOCUMENT_SECTIONS.map((s) => s.key));
    for (const g of o.glance.goTo) expect(keys.has(g.section)).toBe(true);
    const html = await htmlOf(doc);
    // Every link has its target in the page.
    for (const g of o.glance.goTo) {
      expect(html).toContain(`href="#pd-${g.anchor ?? g.section}"`);
      expect(html).toContain(`id="pd-${g.anchor ?? g.section}"`);
    }
    const md = markdownOf(doc);
    expect(md).toContain(`Go to: What does it do? → ${sectionTitle('overview')} · Who acts? → ${sectionTitle('overview')}`);
    // Under the key figures, before the rules and risks.
    expect(md.indexOf('Go to:')).toBeLessThan(md.indexOf('**Rules and risks to know**'));
  });

  test('purpose and scope stand in the glance; data, integrations and controls are one section', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const md = markdownOf(doc);
    const glance = md.slice(md.indexOf('## At a glance'), md.indexOf(`## ${sectionTitle('overview')}`));
    for (const s of doc.purpose.outOfScope) expect(glance).toContain(s.text);
    expect(glance).toContain(doc.purpose.users.text);
    const systems = md.slice(md.indexOf(`## ${sectionTitle('systems')}`), md.indexOf(`## ${sectionTitle('questions')}`));
    for (const h of ['### Data it reads', '### Integrations', '### Controls']) expect(systems).toContain(h);
    // How a run starts opens the process section.
    const process = md.slice(md.indexOf(`## ${sectionTitle('overview')}`), md.indexOf(`## ${sectionTitle('rules')}`));
    expect(process.indexOf('### How a run starts')).toBeGreaterThan(-1);
    expect(process.indexOf('### How a run starts')).toBeLessThan(process.indexOf('### Steps'));
    expect(process).toContain('| Input | Required | Default | Source |');
    // No section is named by its number anywhere in the body.
    expect(md.slice(0, md.indexOf('## Appendix'))).not.toMatch(/\bsection \d/i);
  });

  test('who acts: a run the code does not prove has no column, only a sentence; a dialogue names the user where the dialogue stands', async () => {
    // Z_MM_PO_APPROVAL (the demo) holds no dialogue, background or update-task
    // statement: its run lane is the program, so no step's actor is proven.
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
    for (const s of steps) {
      expect(s.actor?.who ?? null, s.name).toBeNull();
      expect(s.actor?.basis).toMatch(/proves no dialogue/);
    }
    // Owner decision 10.10.2026: proven only — with no step proven there is no
    // column and no tag, only one sentence in the process section, in every rendering.
    const o = documentOutline(doc);
    expect(o.whoActs).toBe(false);
    expect(o.tables.steps.head).toEqual(['No.', 'Step', 'What happens']);
    expect(o.tables.steps.rows.every((r) => r.cells.length === 3 && !r.cells.includes('Not determined'))).toBe(true);
    // Owner review 10.10.2026: the start is proven, who carries out the steps is not — the line and the summary say both.
    expect(o.whoActsLine).toBe('How a run starts is read from the code; who carries out the steps is not provable from it: the steps hold no dialogue, background or update-task statement that says so.');
    expect(o.glance.trigger.text).toMatch(/selection screen/);
    expect(o.glance.trigger.text.endsWith('Who carries out the steps is not provable from the code.')).toBe(true);
    const md = markdownOf(doc);
    const process = md.slice(md.indexOf(`## ${sectionTitle('overview')}`), md.indexOf(`## ${sectionTitle('rules')}`));
    expect(process).toContain(o.whoActsLine!);
    // No column head, and no per-step line in the appendix's step details.
    expect(md).not.toContain('| Who acts |');
    expect(md).not.toContain('Who acts: ');
    const html = await htmlOf(doc);
    expect(html).toContain('data-doc-who-acts-none=""');
    expect(html).not.toContain('<th>Who acts</th>');

    const dialogue = documentOfSource(DIALOGUE);
    const actors = dialogue.overview.path.filter((e): e is PdStep => e.kind === 'step').map((s) => s.actor);
    // The popup stands in the step's own code: the user acts there, and the basis names the statement and its line.
    const user = actors.find((a) => a?.who === 'User');
    expect(user?.basis).toContain('POPUP_TO_CONFIRM');
    expect(user?.anchors.length).toBeGreaterThan(0);
    for (const a of actors) expect(a?.who).not.toBeNull();
    // With a proven actor the column stands, and the sentence does not.
    const shown = documentOutline(dialogue);
    expect(shown.whoActs).toBe(true);
    expect(shown.whoActsLine).toBeNull();
    expect(shown.tables.steps.head).toEqual(['No.', 'Step', 'Who acts', 'What happens']);
    expect(await buildEngineConfluenceHtml(dialogue, null).text()).toContain('<th>Who acts</th>');
  });

  test('a decision table without an Otherwise row says what happens when no row matches', () => {
    const line = { lineStart: 1, lineEnd: 1 };
    expect(decisionTableHitPolicy({ field: 'gs_row-ampel', rows: [
      { condition: 'a > 1', value: 'c_rot', constant: null, anchor: line },
      { condition: 'a > 0', value: 'c_gelb', constant: null, anchor: line },
      { condition: 'a = 0', value: 'c_gruen', constant: null, anchor: line },
    ] })).toBe('The first matching row wins; the rows below it are not checked. There is no Otherwise row: when no row matches, the table does not set gs_row-ampel.');
  });

  test('a row on the line of an open question points at it — in the outline, in Confluence, in a file', async () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const rule = doc.rules.find((r) => r.ref === 'BR-010')!;
    const line = rule.anchors[0].lineStart;
    const list = {
      noSource: false, open: 1, blocking: 0, top: 'Confirm the rules', limits: null, catalogPending: false,
      groups: [{
        action: 'confirm-rules', owner: 'Business', title: 'Confirm the rules', resolves: 'The owner confirms each rule.',
        blocksDecision: false, count: 1, lines: [{ label: 'BR-010', why: 'A threshold in the code', anchor: `L${line}` }],
        end: 'open', evidence: null, answer: null, outdated: null, basis: '', catalogPending: false,
      }],
    } as unknown as OpenQuestions;
    const o = documentOutline(doc, { openQuestions: list });
    const row = o.tables.rules!.rows.find((r) => r.cells[0] === 'BR-010')!;
    expect(row.question).toEqual({ action: 'confirm-rules', title: 'Confirm the rules' });
    expect(o.questions.table!.rows[0].id).toBe('oq-confirm-rules');
    const html = await buildEngineConfluenceHtml(doc, null, { openQuestions: list }).text();
    expect(html).toContain('<a href="#oq-confirm-rules">→ Open question: Confirm the rules</a>');
    expect(html).toContain('<tr id="oq-confirm-rules">');
    const md = blocksMarkdown(processDocumentBlocks(doc, { openQuestions: list }));
    expect(md).toContain('→ Open question: Confirm the rules');
    // A closed group is no open question: nothing points at it.
    const closed = { ...list, groups: [{ ...list.groups[0], end: 'answered' }] } as OpenQuestions;
    expect(documentOutline(doc, { openQuestions: closed }).tables.rules!.rows.some((r) => r.question)).toBe(false);
  });

  test('how a run starts, which rows a read takes, what a batch input changes', () => {
    const doc = documentOfSource(DIALOGUE);
    // The preset written in INITIALIZATION is the input's default.
    const bedat = doc.trigger.selection.find((i) => i.name.toUpperCase() === 'S_BEDAT')!;
    expect(bedat.defaultValue).toBe('LOW sy-datum - 365 (set when the program starts)');
    // The input nothing reads, and the dialogue answer nothing reads, in plain words with their lines.
    const unused = doc.trigger.inputUse ?? [];
    expect(unused.map((u) => u.detail)).toEqual(expect.arrayContaining(['P_UNUSED']));
    expect(unused.some((u) => /answer to a dialogue/.test(u.text))).toBe(true);
    for (const u of unused) expect(u.anchors.length).toBeGreaterThan(0);
    // Which rows: the WHERE as written, the fixed filter first.
    const ekpo = doc.trigger.data.find((d) => d.name === 'EKPO')!;
    expect(ekpo.scope).toBe('Only where loekz = space (fixed in the code); restricted by the selection screen: aedat IN s_bedat');
    // A running total is a computed value.
    expect(doc.derived?.some((d) => d.target === 'gv_sum' && d.accumulates)).toBe(true);
    // The batch input changes the delivery date; the order number on the first screen is no change.
    const change = doc.outputs.find((o) => o.kind === 'Changes data (batch input)')!;
    expect(change.what).toBe('Changes the delivery date of the purchase order schedule line through a transaction (batch input)');
    expect(change.objects).toEqual(['ME22', 'EKET-EEIND(01)']);
    expect(change.anchors.length).toBeGreaterThan(0);
  });
});

/**
 * Owner review of 10.10.2026 ("good direction, better than today"): the chapter
 * bar, one open question said once for many rows, an appendix that opens with a
 * compact summary, the pictures' data, and five wording fixes — held over the
 * shipped example, in the outline and in every file.
 */
test.describe('owner review 10.10.2026: chapters, shared questions, appendix summary, plain wording', () => {
  test('seven chapters in the page order, each with its reader question; the files keep the Go to line', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const o = documentOutline(doc);
    expect(o.chapters.map((c) => c.key)).toEqual(PROCESS_DOCUMENT_SECTIONS.map((s) => s.key));
    expect(o.chapters.map((c) => c.label)).toEqual(['How it works', 'Rules', 'Exceptions', 'Changes', 'Systems & data', 'Open questions', 'Appendix']);
    // The reader questions of the old "Go to" line are the chips' tooltips now.
    for (const g of o.glance.goTo) expect(o.chapters.some((c) => c.question.includes(g.label))).toBe(true);
    const steps = doc.overview.path.filter((e) => e.kind === 'step').length;
    expect(o.chapters[0].count).toBe(String(steps));
    // Without the project's list the open questions are not counted, never "0".
    expect(o.chapters.find((c) => c.key === 'questions')!.count).toBeNull();
    expect(o.chapters.find((c) => c.key === 'appendix')!.count).toBeNull();
    // A file cannot hold a bar: it keeps the line.
    expect(markdownOf(doc)).toContain('Go to: What does it do?');
  });

  test('the stage draws the chapter bar once, from the shared anchor bar, and no Go to line', () => {
    const view = fs.readFileSync(path.join(ROOT, 'components', 'documentation', 'ProcessDocumentView.tsx'), 'utf8');
    expect(view).toContain("from '@/components/PageAnchorBar'");
    expect(view).toContain('export function DocumentChapterBar');
    expect(view).not.toContain('data-doc-goto');
    const it = fs.readFileSync(path.join(ROOT, 'components', 'workspace', 'ItAnswers.tsx'), 'utf8');
    expect(it).toContain('<PageAnchorBar');
    for (const file of [['app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'], ['components', 'demo', 'DemoDocumentation.tsx']]) {
      expect(fs.readFileSync(path.join(ROOT, ...file), 'utf8').match(/<DocumentChapterBar\b/g)?.length, file.join('/')).toBe(1);
    }
  });

  test('an open question on several rows of a table is said once above it; a row keeps only its own', async () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const lines = (anchors: Array<{ lineStart: number }>) => anchors.map((a) => ({ label: 'x', why: 'y', anchor: `L${a.lineStart}` }));
    const many = doc.integrations.slice(0, 4);
    const one = doc.integrations[5];
    const group = (action: string, title: string, l: Array<{ label: string; why: string; anchor: string }>) => ({
      action, owner: 'IT', title, resolves: 'Import it.', blocksDecision: false, count: l.length, lines: l,
      end: 'open', evidence: null, answer: null, outdated: null, basis: '', catalogPending: false,
    });
    const list = {
      noSource: false, open: 2, blocking: 0, top: 'Add ATC results', limits: null, catalogPending: false,
      groups: [
        group('add-atc', 'Add ATC results', lines(many.flatMap((i) => i.anchors))),
        group('name-target', 'Name the call target', lines(one.anchors)),
      ],
    } as unknown as OpenQuestions;
    const o = documentOutline(doc, { openQuestions: list });
    const t = o.tables.integrations!;
    expect(t.shared).toEqual([{ action: 'add-atc', title: 'Add ATC results', rows: many.length }]);
    expect(t.rows.some((r) => r.question?.action === 'add-atc')).toBe(false);
    expect(t.rows.filter((r) => r.question?.action === 'name-target').length).toBe(1);
    const md = blocksMarkdown(processDocumentBlocks(doc, { openQuestions: list }));
    expect(md).toContain(`→ Open question for ${many.length} of the ${t.rows.length} rows: Add ATC results`);
    expect(md.split('→ Open question: Add ATC results').length - 1).toBe(0);
    const html = await buildEngineConfluenceHtml(doc, null, { openQuestions: list }).text();
    expect(html).toContain('data-doc-shared-question="add-atc"');
    expect(html).toContain('<a href="#oq-name-target">→ Open question: Name the call target</a>');
  });

  test('the appendix opens with one compact table of the steps, in every file', async () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const md = markdownOf(doc);
    const appendix = md.slice(md.indexOf('## Appendix'));
    expect(appendix).toContain('| No. | Step | What it does | Lines | Details |');
    expect(appendix.indexOf('| No. | Step | What it does')).toBeLessThan(appendix.indexOf('#### 1.'));
    const html = await htmlOf(doc);
    const a1 = html.slice(html.indexOf('A.1 Step details'));
    expect(a1.indexOf('<th>What it does</th>')).toBeGreaterThan(-1);
    expect(a1.indexOf('<th>What it does</th>')).toBeLessThan(a1.indexOf('data-doc-step=""'));
  });

  test('plain wording: a negated decision asked the plain way, the condition beside it, exceptions named, values in words', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const gates = doc.overview.path.filter((e) => e.kind === 'gate');
    expect(gates.some((g) => /^Not /.test(g.label))).toBe(false);
    const rejected = gates.find((g) => g.label === 'Rejected?')!;
    expect(rejected.outcomes.find((x) => x.ends)!.when).toBe('Yes');
    expect(rejected.condition).toBe('gv_rejected = abap_false');
    // The exception the map calls only "On error" is named from what the user sees.
    expect(doc.exceptions.some((e) => e.what === 'On error')).toBe(false);
    expect(doc.exceptions.map((e) => e.what)).toEqual(expect.arrayContaining(['Attachment could not be read', 'Notification failed']));
    // Values in words where the glossary knows them; the variable stays the source column's.
    const amount = doc.derived!.find((d) => d.target === 'gv_amount')!;
    expect(amount.label).toBe('Amount');
    expect(amount.plainExpression).toBe('Quantity × Price ÷ Price unit');
    const row = documentOutline(doc).tables.derived!.rows.find((r) => r.cells[0] === 'Amount')!;
    expect(row.tech).toContain('gv_amount = gs_eban-menge * gs_eban-preis / gs_eban-peinh');
  });

  test('what it touches in SAP: the tables it reads and the tables it changes, from the code', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    expect(doc.writes!.map((w) => w.name)).toEqual(expect.arrayContaining(['EBAN', 'ZMM_PO_APPR', 'ZMM_PO_ATTACH']));
    for (const w of doc.writes!) expect(w.anchors.length).toBeGreaterThan(0);
    const upload = doc.overview.path.find((e): e is PdStep => e.kind === 'step' && e.technicalName === 'UPLOAD_ATTACHMENT')!;
    expect(upload.touches!.writes.map((w) => w.name)).toContain('ZMM_PO_ATTACH');
  });
});
