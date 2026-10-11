import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { buildProcessDocument } from '../lib/process-document-build';
import { PROCESS_DOCUMENTATION_ANCHORS, PROCESS_DOCUMENTATION_SECTIONS, processDocumentationToMarkdown } from '../lib/process-documentation';
import { businessStatementView, isBusinessKindStatement, statementKind } from '../lib/abap/business-statement-kind';
import { absentClaims, capabilityPresence } from '../lib/documentation-capabilities';
import { capabilityFactsOf } from '../lib/documentation-facts';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { judgeSentence, sopStatementsOf } from '../lib/sop-provenance';
import { sopSteps } from '../lib/business-summary';
import { businessSopPrompt, enrichBusinessLayer, sopStepInfos } from '../lib/business-sop-prompt';
import { formatBusinessDocsToMarkdown } from '../lib/markdownFormatter';
import { processDocumentBlocks } from '../lib/process-document-outline';
import { blocksMarkdown, blocksDocxParts } from '../lib/requirements-export';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { raciFileTable } from '../lib/raci-edit';
import { processStepsOf } from '../lib/business-summary';

/**
 * Owner 11.10.2026, on the external review of the FI Collection Worklist
 * delivery package (F-06, F-07, §6.1, §8): a documentation is a help — correct,
 * consumable, exportable. These specs hold, without a server:
 *
 *   1. readable first — every rendering opens with the business page (what it
 *      does, what it does not do, limits, owner and approval, entry questions
 *      as links), and the technical reconstruction is the appendix;
 *   2. only business statements in the business list — structure definitions,
 *      field assignments, label texts and bare calls stay in the appendix, and
 *      near-identical sentences are one entry;
 *   3. the SOP is headed by business step names, never node ids, and every
 *      sentence carries its basis; organisational elements and capabilities the
 *      program does not have are a proposal, not in the program;
 *   4. the export order: business page → process → rules and exceptions →
 *      changes → systems and data → evidence and open questions → appendix.
 */

/** An FI-shaped report: read-only, a selection text, a local structure, a rule, two error messages, an ALV list. */
const FI_SOURCE = `REPORT zfi_demo_worklist.
TYPES: BEGIN OF ty_item,
         kunnr  TYPE kunnr,
         belnr  TYPE belnr_d,
         amount TYPE wrbtr,
         action TYPE char20,
       END OF ty_item.
DATA: gt_items TYPE STANDARD TABLE OF ty_item,
      gs_item  TYPE ty_item,
      tit_sc1  TYPE char40.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_keydt TYPE sy-datum DEFAULT sy-datum.
INITIALIZATION.
  tit_sc1 = 'Collections scope'.
AT SELECTION-SCREEN.
  IF p_keydt > sy-datum.
    MESSAGE 'Future key dates are outside this report scope' TYPE 'E'.
  ENDIF.
START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD p_bukrs ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE 'No FI document display authorization for company' TYPE 'E'.
  ENDIF.
  SELECT kunnr belnr wrbtr FROM bsid INTO TABLE gt_items WHERE bukrs = p_bukrs.
  LOOP AT gt_items INTO gs_item.
    IF gs_item-amount <= 0.
      gs_item-action = 'CREDIT_OR_ZERO'.
    ELSE.
      gs_item-action = 'REVIEW_PROPOSAL'.
    ENDIF.
    MODIFY gt_items FROM gs_item.
  ENDLOOP.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    TABLES
      t_outtab = gt_items.
`;

const FILE = 'zfi_demo_worklist.abap';

function mapOf(source: string, file = FILE) {
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  return buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
}

const engineOf = (source: string, file = FILE) => buildProcessDocumentation({ source, map: mapOf(source, file) });
const descriptionOf = (source: string, file = FILE) => buildProcessDocument({ source, map: mapOf(source, file) });
const factsOf = (source: string) => capabilityFactsOf(source, buildProcessSkeleton(source));
const PO_FILE = 'Z_MM_PO_APPROVAL.abap';
const poSource = () => fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', PO_FILE), 'utf8').replace(/\r\n/g, '\n');

/** The model's answer for the FI report, written the way the external review found it — upgrades included. */
function reviewedLayer(doc: ReturnType<typeof engineOf>) {
  const steps = doc.steps.filter((s) => s.level === null && !/^(Start|End|Decision)/.test(s.kind));
  const first = steps[0];
  const second = steps[1] ?? steps[0];
  return {
    raci_matrix: steps.map((s) => ({ stepId: s.id, r: 'Collections Specialist', a: 'AR Lead', c: '', i: 'Finance Manager' })),
    sop_details: [
      {
        stepId: first.id,
        claims: [
          { text: 'The worklist shows each open item with its proposed action.', basis: 'code', lines: [first.anchor?.lineStart ?? 1] },
          { text: 'The figures are cross-checked against company ledger control totals.', basis: 'code', lines: [first.anchor?.lineStart ?? 1] },
          { text: 'Proposals can be overridden with the approval of the AR Lead.', basis: 'proposal', lines: [] },
          { text: 'The amounts reconcile line by line.', basis: 'code', lines: [9999] },
        ],
        businessException: 'Escalate to the Finance Manager.',
      },
      {
        stepId: second.id,
        narrative: 'The specialist enables the credit option for full credit exposure analysis. Each line item receives an action proposal.',
        businessException: 'Route ambiguous items to the AR Lead.',
      },
    ],
  };
}

/* ------------------------------------------------- 2. what is a business statement */

test.describe('what counts as a business statement', () => {
  test('structure definitions, field assignments, label texts and bare calls are not; rules, messages, reads and checks are', () => {
    expect(statementKind('The local structure contains KUNNR, NAME1, BEGRU, FOUND and ALLOWED.')).toBe('structure');
    expect(statementKind('The field l_buk is set to Company code.')).toBe('label');
    expect(statementKind('The field tit_sc1 is set to FI-AR scope: end-of-day key-date view.')).toBe('label');
    expect(statementKind('Company: is output. The output only proves that this point in the code was reached.')).toBe('label');
    expect(statementKind('Worklist rows: is output, the row is output, Manual proposals: is output.')).toBe('label');
    expect(statementKind('The customer number is set to 0000100001 and the name is set to Demo Industrial Parts GmbH.')).toBe('assignment');
    expect(statementKind('A row of the internal table gt_items is changed; nothing is written to the database.')).toBe('assignment');
    expect(statementKind('The value pv_amount is formatted into lv_buffer; nothing is output.')).toBe('assignment');
    expect(statementKind('The subroutine add_field is called.')).toBe('call');
    expect(statementKind('The subroutine prepare_context is called; it reads company codes and outputs a message.')).toBe('call');
    expect(statementKind('Every row from gt_items is processed one by one.')).toBe('call');
    expect(statementKind('If the field ls_input-zfbdt is empty, the field pv_note is set to Missing baseline date; amount retained in UNKNOWN bucket.')).toBe('rule');
    expect(statementKind('The error message "Future key dates are outside this report scope" is output.')).toBe('exception');
    expect(statementKind('Open customer items with the entered company code are selected.')).toBe('data');
    expect(statementKind('The authorization for F_BKPF_BUK is checked.')).toBe('control');
    expect(isBusinessKindStatement('The local structure contains SEVERITY and MESSAGE.')).toBe(false);
    expect(isBusinessKindStatement('If the field gs_output-netdt is empty, the field gs_output-bucket is set to UNKNOWN.')).toBe(true);
  });

  test('near-identical sentences are one entry: a rule\'s parts fold into it, its message is quoted into it, one shape is one entry', () => {
    const a = (l: number, e = l) => ({ lineStart: l, lineEnd: e });
    const view = businessStatementView([
      { text: 'The local structure contains KUNNR and NAME1.', anchors: [a(3)], grain: 'statement' },
      { text: 'If the field p_demo is c_yes, the field gs_company-butxt is set to Demo, the currency is set to EUR and add_message is called.', anchors: [a(10), a(11), a(12), a(13)], grain: 'group' },
      { text: 'If the field p_demo is c_yes, the currency is set to EUR.', anchors: [a(10), a(12)], grain: 'group' },
      { text: 'If the field p_keydt is greater than sy-datum, an error message is output.', anchors: [a(20), a(21)], grain: 'group' },
      { text: 'The error message "Future key dates are outside this report scope" is output.', anchors: [a(21)], grain: 'statement' },
      { text: 'If the field p_grace is less than 0 or the field p_grace is greater than 30, the field gv_bad is set to X.', anchors: [a(30), a(31)], grain: 'group' },
      { text: 'If the field p_gap is less than 0 or the field p_gap is greater than 365, the field gv_bad is set to X.', anchors: [a(33), a(34)], grain: 'group' },
      { text: 'The subroutine add_field is called.', anchors: [a(40)], grain: 'statement' },
    ]);
    expect(view.total).toBe(8);
    expect(view.technical).toEqual({ structure: 1, label: 0, assignment: 0, call: 1 });
    expect(view.groups.map((g) => g.count)).toEqual([2, 2, 2]);
    expect(view.groups[1].text).toBe('If the field p_keydt is greater than sy-datum, the error message "Future key dates are outside this report scope" is output.');
    expect(view.groups[2].anchors.map((x) => x.lineStart)).toEqual([30, 31, 33, 34]);
    expect(view.folded).toBe(3);
  });

  test('two different messages the user sees are never folded into one', () => {
    const a = (l: number) => ({ lineStart: l, lineEnd: l });
    const view = businessStatementView([
      { text: 'The error message "Company code does not exist" is output.', anchors: [a(5)] },
      { text: 'The error message "Specify the frontend CSV filename" is output.', anchors: [a(9)] },
    ]);
    expect(view.groups).toHaveLength(2);
  });
});

/* ----------------------------------------------- 1. the business page, first */

test.describe('the package documentation reads business first', () => {
  test('the business page opens the file, says what the program does not do, and every question links to a section that exists', () => {
    const doc = engineOf(FI_SOURCE);
    expect(doc.facts?.writes).toEqual([]);
    expect(doc.facts?.commits).toEqual([]);
    const md = processDocumentationToMarkdown(doc);
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(PROCESS_DOCUMENTATION_SECTIONS.map((s) => s.title));
    const page = md.slice(md.indexOf('## In short'), md.indexOf('## 1. How the process works'));
    expect(page).toContain('**What it does**');
    expect(page).toContain('It does not post or change data in SAP');
    expect(page).toContain('It does not reconcile against the general ledger');
    expect(page).toContain('Process owner: Not determined');
    expect(page).toContain('Business approval: Not recorded');
    for (const q of ['Why is an item missing?', 'Why is a value unknown?', 'Why is there no proposal or result?', 'What changes in S/4HANA?']) {
      expect(page).toContain(`[${q}](#`);
    }
    // Every in-document link leads to an anchor the file writes.
    const ids = new Set([...md.matchAll(/<a id="([a-z0-9-]+)"><\/a>/g)].map((m) => m[1]));
    for (const m of md.matchAll(/\]\(#([a-z0-9-]+)\)/g)) expect(ids.has(m[1]), `#${m[1]} has no anchor`).toBe(true);
    // The technical reconstruction is last, and complete.
    expect(md.indexOf('## Appendix: technical reconstruction')).toBeGreaterThan(md.indexOf('## 5. Evidence and open decisions'));
    expect(md.indexOf('A.1 The process, element by element')).toBeGreaterThan(md.indexOf('## Appendix'));
    for (const s of doc.statements) expect(md.slice(md.indexOf(`<a id="${PROCESS_DOCUMENTATION_ANCHORS.statements}">`))).toContain(s.text);
  });

  test('the business list leaves structure, assignments and labels to the appendix', () => {
    const doc = engineOf(FI_SOURCE);
    const md = processDocumentationToMarkdown(doc);
    const business = md.slice(md.indexOf('## 1. How the process works'), md.indexOf('## Appendix'));
    for (const s of doc.statements) {
      const kind = statementKind(s.text);
      if (kind === 'structure' || kind === 'label' || kind === 'assignment' || kind === 'call') {
        expect(business, `a ${kind} sentence stands in the business part: ${s.text}`).not.toContain(`- ${s.text} (`);
      }
    }
    expect(business).toMatch(/\d+ business statements from the \d+ sentences the engine read/);
    expect(business).not.toMatch(/\bnd-\d+-\d+\b/);
  });

  test('a documentation stored before the facts were recorded says so instead of guessing', () => {
    const { facts: _facts, ...old } = engineOf(FI_SOURCE);
    void _facts;
    const md = processDocumentationToMarkdown(old);
    expect(md).toContain('Not determined — this documentation was read before');
    expect(md).not.toContain('It does not post or change data in SAP');
  });
});

/* ------------------------------------------- 3. every SOP sentence with its basis */

test.describe('the business SOP: step names, provenance on every sentence, nothing upgraded', () => {
  test('a capability the source shows to be absent is never current practice', () => {
    const facts = factsOf(FI_SOURCE);
    const presence = capabilityPresence(facts);
    expect(presence.posting.present).toBe(false);
    expect(presence.ledger.present).toBe(false);
    expect(presence.approval.present).toBe(false);
    expect(absentClaims('The figures are cross-checked against company ledger control totals.', facts).map((c) => c.capability)).toEqual(['ledger']);
    expect(absentClaims('Activate the credit option for full credit exposure analysis.', facts).map((c) => c.capability)).toEqual(['credit-exposure']);
    expect(absentClaims('The open items are posted and cleared automatically.', facts).map((c) => c.capability)).toContain('posting');
    expect(absentClaims('Items are listed with their posting date.', facts)).toEqual([]);
    const ctx = { stepLines: [{ lineStart: 1, lineEnd: 200 }], facts };
    expect(judgeSentence('The figures are cross-checked against company ledger control totals.', true, [20], ctx).basis).toBe('not-in-program');
    expect(judgeSentence('The worklist shows each open item.', true, [20], ctx).basis).toBe('reconstructed');
    expect(judgeSentence('The worklist shows each open item.', true, [999], ctx).basis).toBe('proposed');
    expect(judgeSentence('The worklist shows each open item.', false, [20], ctx).basis).toBe('proposed');
    expect(judgeSentence('The AR Lead approves the override.', false, [], ctx).basis).toBe('not-in-program');
  });

  test('where the program does post, the same sentence is not downgraded', () => {
    const facts = factsOf(poSource());
    expect(capabilityPresence(facts).posting.present).toBe(true);
    expect(absentClaims('The purchase order is created and posted.', facts)).toEqual([]);
  });

  test('every statement carries its basis, the exception is a proposal, and an old narrative is a proposal at best', () => {
    const doc = engineOf(FI_SOURCE);
    const layer = enrichBusinessLayer(reviewedLayer(doc), sopStepInfos(doc), doc.facts ?? null);
    const steps = sopSteps(layer, processStepsOf(doc.steps), { facts: doc.facts ?? null });
    const all = steps.flatMap((s) => [...s.statements, ...(s.exceptionStatement ? [s.exceptionStatement] : [])]);
    expect(all.length).toBeGreaterThan(5);
    for (const st of all) expect(['reconstructed', 'proposed', 'not-in-program', 'not-determined', 'confirmed']).toContain(st.basis);
    const by = (text: string) => all.find((s) => s.text.startsWith(text))!;
    expect(by('The worklist shows').basis).toBe('reconstructed');
    expect(by('The figures are cross-checked').basis).toBe('not-in-program');
    expect(by('Proposals can be overridden').basis).toBe('not-in-program');
    expect(by('The amounts reconcile line by line').basis).not.toBe('reconstructed');
    expect(by('The specialist enables the credit option').basis).toBe('not-in-program');
    expect(by('Each line item receives').basis).toBe('proposed');
    expect(by('Escalate to the Finance Manager').basis).toBe('not-in-program');
    // A row without a model's tag is never Reconstructed.
    expect(sopStatementsOf({ narrative: 'The list is shown.' }, { stepLines: [{ lineStart: 1, lineEnd: 99 }], facts: doc.facts ?? null }).statements[0].basis).toBe('proposed');
  });

  test('the delivery file heads each step by its business name, never a node id, and marks every sentence', () => {
    const doc = engineOf(FI_SOURCE);
    const enriched = enrichBusinessLayer(reviewedLayer(doc), sopStepInfos(doc), doc.facts ?? null);
    for (const md of [formatBusinessDocsToMarkdown(JSON.stringify(enriched)), formatBusinessDocsToMarkdown(JSON.stringify(reviewedLayer(doc)), JSON.stringify(doc))]) {
      expect(md).not.toMatch(/\bnd-\d+-\d+\b/);
      expect(md).not.toContain('Task:');
      const headings = [...md.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
      expect(headings.length).toBeGreaterThanOrEqual(2);
      for (const h of headings) expect(h).toMatch(/^\d+\. .+ \((?:L\d+|lines not determined)/);
      const sentences = md.slice(md.indexOf('## Steps'), md.indexOf('## Who is responsible')).split('\n').filter((l) => l.startsWith('- '));
      for (const line of sentences) {
        expect(line, line).toMatch(/\((?:Reconstructed, L\d+|Model proposal|Proposal — not in the program(?:: [^)]+)?|Not determined)\)$|^- Not determined/);
      }
      expect(md).toContain('cross-checked against company ledger control totals. (Proposal — not in the program: no ledger reconciliation in the code)');
      expect(md).toContain('## Who is responsible (RACI) — Proposal — not in the program');
      expect(md).toContain('## What the program does not do');
    }
  });

  test('the prompt asks for claims with their basis, forbids upgrades, and says what the program does not do', () => {
    const prompt = businessSopPrompt(engineOf(FI_SOURCE));
    expect(prompt).toContain('"claims"');
    expect(prompt).toContain('"basis": "code" ONLY when');
    expect(prompt).toContain('NEVER upgrade a technical fact');
    expect(prompt).toContain('Internal arithmetic checks are NOT a reconciliation against the general ledger');
    expect(prompt).toContain('What the program does NOT do');
    expect(prompt).toContain('It does not post or change data in SAP');
    expect(prompt).not.toContain('"narrative"');
  });
});

/* ------------------------------------------------------------ 4. export order */

test.describe('the exports follow the reader order', () => {
  test('Markdown and Word: business page, glance, sections, open questions, RACI, appendix — the questions link in Markdown', () => {
    const doc = descriptionOf(FI_SOURCE);
    const engine = engineOf(FI_SOURCE);
    const raci = raciFileTable(reviewedLayer(engine), processStepsOf(engine.steps), null);
    const blocks = processDocumentBlocks(doc, { projectName: 'FI demo', raci });
    const md = blocksMarkdown(blocks);
    const at = (s: string) => md.indexOf(s);
    const order = ['## In short', '## At a glance', '## 1. How the process works', '## 2. Business rules and decision points', '## 3. Exceptions',
      '## 4. What it changes and produces', '## 5. Systems and data', '## 6. Open questions', '## Who is responsible (RACI)', '## Appendix: details and evidence'];
    for (let i = 1; i < order.length; i += 1) expect(at(order[i - 1]), `${order[i - 1]} before ${order[i]}`).toBeLessThan(at(order[i]));
    expect(md).toContain('[Why is an item missing?](#pd-data)');
    expect(md).toContain('<a id="pd-data"></a>');
    expect(md).toContain('<a id="pd-exceptions"></a>');
    expect(md).toContain('<a id="pd-outputs"></a>');
    expect(md).toContain('Proposal — not in the program: the code names no role');
    // Word cannot link inside the file: it names the section instead.
    const docx = blocksDocxParts(blocks)['word/document.xml'];
    expect(docx).toContain('Why is an item missing? → 5. Systems and data');
  });

  test('Confluence: the business page first, the questions as links, every SOP sentence with its basis', async () => {
    const doc = descriptionOf(FI_SOURCE);
    const engine = engineOf(FI_SOURCE);
    const html = await buildEngineConfluenceHtml(doc, enrichBusinessLayer(reviewedLayer(engine), sopStepInfos(engine), engine.facts ?? null), { processSteps: processStepsOf(engine.steps) }).text();
    expect(html.indexOf('data-business-page')).toBeGreaterThan(html.indexOf('data-doc-cover'));
    expect(html.indexOf('data-business-page')).toBeLessThan(html.indexOf('data-glance-export'));
    expect(html).toContain('<a href="#pd-data">Why is an item missing?</a>');
    expect(html).toContain('id="pd-data"');
    expect(html).toContain('data-sop-statement="not-in-program"');
    expect(html).toContain('data-sop-statement="reconstructed"');
    expect(html).not.toMatch(/<td>[^<]*cross-checked against company ledger control totals[^<]*<\/td>/);
  });
});
