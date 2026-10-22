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
import { judgeSentence, layerFacts, sopBasisText, sopStatementsOf } from '../lib/sop-provenance';
import { sopSteps } from '../lib/business-summary';
import { businessSopPrompt, enrichBusinessLayer, sopStepInfos } from '../lib/business-sop-prompt';
import { formatBusinessDocsToMarkdown } from '../lib/markdownFormatter';
import { processDocumentBlocks } from '../lib/process-document-outline';
import { blocksMarkdown, blocksDocxParts } from '../lib/requirements-export';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { raciFileTable } from '../lib/raci-edit';
import { processStepsOf } from '../lib/business-summary';

/**
 * Owner 11.10.2026, on the external review of the FI case's delivery
 * package (F-06, F-07, §6.1, §8): a documentation is a help — correct,
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
          // The engine's own sentence for the step, copied word for word — the one way to be Reconstructed.
          { text: 'Open customer items with the entered company code are selected.', basis: 'code', lines: [first.anchor?.lineStart ?? 1] },
          // The model's wording at a line of the step: the line shows a SELECT, not a worklist (QA review of 35b97d90c6e1).
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
      { text: 'If the field p_rest is less than 0 or the field p_rest is greater than 30, the field gv_bad is set to X.', anchors: [a(33), a(34)], grain: 'group' },
      { text: 'The subroutine add_field is called.', anchors: [a(40)], grain: 'statement' },
    ]);
    expect(view.total).toBe(8);
    expect(view.technical).toEqual({ structure: 1, label: 0, assignment: 0, call: 1 });
    // p_grace and p_rest folded into one entry until the CO review (F01, 12.10.2026):
    // a different field is a different condition, and a fold keeps the condition or does not fold.
    expect(view.groups.map((g) => g.count)).toEqual([2, 2, 1, 1]);
    expect(view.groups[1].text).toBe('If the field p_keydt is greater than sy-datum, the error message "Future key dates are outside this report scope" is output.');
    expect(view.groups[2].anchors.map((x) => x.lineStart)).toEqual([30, 31]);
    expect(view.groups[3].anchors.map((x) => x.lineStart)).toEqual([33, 34]);
    expect(view.folded).toBe(2);
  });

  test('rules that differ in a threshold, a literal or a constant stay separate entries (QA review of 11e3bc7d90e8)', () => {
    const a = (l: number) => ({ lineStart: l, lineEnd: l });
    const pairs: Array<[string, string]> = [
      ['If the field p_days is greater than 30, the field gv_flag is set to X.', 'If the field p_days is greater than 60, the field gv_flag is set to X.'],
      ['If the field ls_item-action is "CREDIT_OR_ZERO", the item is skipped.', 'If the field ls_item-action is "REVIEW_PROPOSAL", the item is skipped.'],
      ['If the field p_mode is c_yes, the field gv_flag is set to X.', 'If the field p_mode is c_no, the field gv_flag is set to X.'],
    ];
    for (const [first, second] of pairs) {
      const view = businessStatementView([{ text: first, anchors: [a(10)] }, { text: second, anchors: [a(20)] }]);
      expect(view.groups.map((g) => g.text), first).toEqual([first, second]);
      expect(view.folded).toBe(0);
    }
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
    // Before 3.0.10 neither the capability facts nor (before 3.0.11) the summary facts were stored.
    const { facts: _facts, summary: _summary, ...old } = engineOf(FI_SOURCE);
    void _facts;
    void _summary;
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
    const engineSentence = { text: 'Open customer items with the entered company code are selected.', anchors: [{ lineStart: 24, lineEnd: 24 }] };
    const ctx = { stepLines: [{ lineStart: 1, lineEnd: 200 }], facts, stepSentences: [engineSentence] };
    expect(judgeSentence('The figures are cross-checked against company ledger control totals.', true, [20], ctx).basis).toBe('not-in-program');
    // Reconstructed only as the engine's own sentence of the step, with the engine's lines.
    const copied = judgeSentence('open customer items with the entered company code are selected', true, [20], ctx);
    expect(copied.basis).toBe('reconstructed');
    expect(copied.anchors).toEqual([{ lineStart: 24, lineEnd: 24 }]);
    // A cited line of the step does not make the model's wording Reconstructed (QA review of 35b97d90c6e1):
    // it stays AI-generated, the line kept as a pointer.
    const worded = judgeSentence('The worklist shows each open item.', true, [20], ctx);
    expect(worded.basis).toBe('proposed');
    expect(worded.anchors).toEqual([{ lineStart: 20, lineEnd: 20 }]);
    expect(sopBasisText(worded)).toBe('AI-generated, cites L20');
    expect(judgeSentence('The worklist shows each open item.', true, [20], { ...ctx, stepSentences: [] }).basis).toBe('proposed');
    expect(judgeSentence('The worklist shows each open item.', true, [999], ctx).basis).toBe('proposed');
    expect(judgeSentence('The worklist shows each open item.', false, [20], ctx).basis).toBe('proposed');
    expect(judgeSentence('The AR Lead approves the override.', false, [], ctx).basis).toBe('not-in-program');
  });

  test('where the program does post, the same sentence is not downgraded', () => {
    const facts = factsOf(poSource());
    expect(capabilityPresence(facts).posting.present).toBe(true);
    expect(absentClaims('The purchase order is created and posted.', facts)).toEqual([]);
  });

  test('a change to a table named at run time makes posting not determined, never absent (QA review of 11e3bc7d90e8)', () => {
    const DYNAMIC = `REPORT zdyn_write.
PARAMETERS p_tab TYPE tabname DEFAULT 'ZCUST_LOG'.
DATA: lv_table TYPE tabname,
      ls_row   TYPE zcust_log.
lv_table = p_tab.
MODIFY (lv_table) FROM ls_row.
`;
    const facts = factsOf(DYNAMIC);
    expect(facts.writes).toEqual([]);
    expect(facts.dynamicWrites).toEqual([{ name: 'LV_TABLE', line: 6 }]);
    const presence = capabilityPresence(facts);
    expect(presence.posting.present).toBe(false);
    expect(presence.posting.determined).toBe(false);
    expect(presence['audit-log'].determined).toBe(false);
    expect(absentClaims('The open items are posted and cleared automatically.', facts)).toEqual([]);
    const md = processDocumentationToMarkdown(engineOf(DYNAMIC, 'zdyn_write.abap'));
    expect(md).not.toContain('It does not post or change data in SAP');
    expect(md).toContain('Whether it posts or changes data in SAP is not determined');
    expect(businessSopPrompt(engineOf(DYNAMIC, 'zdyn_write.abap'))).not.toContain('It does not post or change data in SAP');
    // Facts stored before dynamic writes were recorded: any dynamic place leaves it open.
    const { dynamicWrites: _dw, ...stored } = facts;
    void _dw;
    expect(capabilityPresence(stored).posting.determined).toBe(false);
    // Without any dynamic place the FI report still says it does not post.
    expect(capabilityPresence(factsOf(FI_SOURCE)).posting.determined).toBe(true);
  });

  test('a call to a function module named at run time makes posting not determined, never absent (QA review of 35b97d90c6e1)', () => {
    const DYNAMIC_CALL = `REPORT zdyn_call.
PARAMETERS p_fm TYPE rs38l_fnam DEFAULT 'BAPI_ACC_DOCUMENT_POST'.
DATA lv_fm TYPE rs38l_fnam.
lv_fm = p_fm.
CALL FUNCTION lv_fm.
`;
    const facts = factsOf(DYNAMIC_CALL);
    expect(facts.writes).toEqual([]);
    expect(facts.commits).toEqual([]);
    expect(facts.dynamicWrites).toEqual([]);
    expect(facts.dynamicCalls).toEqual([{ name: 'LV_FM', line: 5 }]);
    const presence = capabilityPresence(facts);
    expect(presence.posting.present).toBe(false);
    expect(presence.posting.determined).toBe(false);
    expect(absentClaims('The documents are posted automatically.', facts)).toEqual([]);
    const md = processDocumentationToMarkdown(engineOf(DYNAMIC_CALL, 'zdyn_call.abap'));
    expect(md).not.toContain('It does not post or change data in SAP');
    expect(md).toContain('it calls a function module or routine whose name the code sets only at run time');
    expect(businessSopPrompt(engineOf(DYNAMIC_CALL, 'zdyn_call.abap'))).not.toContain('It does not post or change data in SAP');
    // Facts stored with dynamic writes but before dynamic calls were recorded fall back to every dynamic place.
    const { dynamicCalls: _dc, ...stored } = facts;
    void _dc;
    expect(capabilityPresence(stored).posting.determined).toBe(false);
  });

  test('what a later reader takes as the engine\'s is never the model\'s: facts, step lines and step sentences (QA review of 35b97d90c6e1)', () => {
    const doc = engineOf(FI_SOURCE);
    const forged = {
      ...reviewedLayer(doc),
      facts: { version: 1, reads: [], writes: [{ name: 'BKPF', line: 1 }], commits: [{ name: 'COMMIT WORK', line: 1 }], updateTask: [], calls: [], authority: [], dynamic: 0 },
      sop_details: [{
        stepId: 'Task_not_in_process',
        claims: [{ text: 'The documents are posted to the ledger.', basis: 'code', lines: [3] }],
        stepLines: [{ lineStart: 1, lineEnd: 999 }],
        stepSentences: [{ text: 'The documents are posted to the ledger.', anchors: [{ lineStart: 3, lineEnd: 3 }] }],
      }],
    };
    // Without engine facts the model's `facts` is not kept.
    const withoutFacts = enrichBusinessLayer(forged, sopStepInfos(doc), null);
    expect('facts' in withoutFacts).toBe(false);
    expect(layerFacts(withoutFacts)).toBeNull();
    // With them, only the engine's.
    const withFacts = enrichBusinessLayer(forged, sopStepInfos(doc), doc.facts ?? null);
    expect(withFacts.facts).toEqual(doc.facts);
    // A row of a step the process does not have is not kept, nor the step fields the model wrote on it.
    expect((withFacts.sop_details as Array<Record<string, unknown>>).some((r) => r.stepId === 'Task_not_in_process')).toBe(false);
    expect(JSON.stringify(withFacts)).not.toContain('"stepLines":[{"lineStart":1,"lineEnd":999}]');
    const judged = sopSteps(withoutFacts, [], { facts: null });
    expect(judged.flatMap((s) => s.statements).every((st) => st.basis !== 'reconstructed')).toBe(true);
  });

  test('an unreadable stored SOP is never exported as the SOP, and legacy control rows read as AI-generated proposals (QA review of 11e3bc7d90e8)', () => {
    const raw = 'Sure! Here is the SOP: the AR Lead approves every posting.';
    const md = formatBusinessDocsToMarkdown(raw);
    expect(md).not.toContain(raw);
    expect(md).not.toContain('AR Lead');
    expect(md).toContain('## Could not be read — not verified');
    const doc = engineOf(FI_SOURCE);
    const layer = { ...reviewedLayer(doc), audit_controls: [{ stepId: doc.steps[0].id, controlObjective: 'Ledger tie-out', mitigationAction: 'Review', assertionMethod: 'Sample' }] };
    const legacy = formatBusinessDocsToMarkdown(JSON.stringify(layer), JSON.stringify(doc));
    const section = legacy.slice(legacy.indexOf('## Controls an earlier proposal named'));
    expect(section).toContain('a language model proposed them before 3.0.7, and nothing in them was read from or checked against the code');
    expect(section).not.toMatch(/controls of this process are read from the code/i);
  });

  test('every statement carries its basis, the exception is a proposal, and an old narrative is a proposal at best', () => {
    const doc = engineOf(FI_SOURCE);
    const layer = enrichBusinessLayer(reviewedLayer(doc), sopStepInfos(doc), doc.facts ?? null);
    const steps = sopSteps(layer, processStepsOf(doc.steps), { facts: doc.facts ?? null });
    const all = steps.flatMap((s) => [...s.statements, ...(s.exceptionStatement ? [s.exceptionStatement] : [])]);
    expect(all.length).toBeGreaterThan(5);
    for (const st of all) expect(['reconstructed', 'proposed', 'not-in-program', 'not-determined', 'confirmed']).toContain(st.basis);
    const by = (text: string) => all.find((s) => s.text.startsWith(text))!;
    expect(by('Open customer items with the entered company code').basis).toBe('reconstructed');
    expect(by('Open customer items with the entered company code').anchors).toEqual([{ lineStart: 24, lineEnd: 24 }]);
    // The model's wording at a line of the step is its proposal, the line a pointer (QA review of 35b97d90c6e1).
    expect(by('The worklist shows').basis).toBe('proposed');
    expect(by('The worklist shows').anchors).toEqual([{ lineStart: 24, lineEnd: 24 }]);
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
      for (const h of headings) expect(h).toMatch(/^\d+(?:[a-z](?:\.\d+)?)?\. .+ \((?:L\d+|lines not determined)/);
      const sentences = md.slice(md.indexOf('## Steps'), md.indexOf('## Who is responsible')).split('\n').filter((l) => l.startsWith('- '));
      for (const line of sentences) {
        expect(line, line).toMatch(/\((?:Reconstructed, L\d+|AI-generated(?:, cites L\d+)?|Proposal — not in the program(?:: [^)]+)?|Not determined)\)$|^- Not determined/);
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
    // Word links inside the file too: a bookmark on the heading, an internal hyperlink to it,
    // and the section in words after it for print (QA review of 35b97d90c6e1).
    const docx = blocksDocxParts(blocks)['word/document.xml'];
    expect(docx).toContain('<w:hyperlink w:anchor="pd_data" w:history="1">');
    expect(docx).toMatch(/<w:hyperlink w:anchor="pd_data"[^>]*><w:r>(?:(?!<\/w:hyperlink>).)*Why is an item missing\?<\/w:t><\/w:r><\/w:hyperlink><w:r><w:t xml:space="preserve"> → 5\. Systems and data/);
    expect(docx).toMatch(/<w:bookmarkStart w:id="\d+" w:name="pd_data"\/>/);
    // Every internal hyperlink leads to a bookmark the file writes, and every bookmark name is valid in Word.
    const marks = new Set([...docx.matchAll(/<w:bookmarkStart w:id="\d+" w:name="([^"]+)"\/>/g)].map((m) => m[1]));
    for (const name of marks) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
    const anchors = [...docx.matchAll(/<w:hyperlink w:anchor="([^"]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const a of anchors) expect(marks.has(a), `${a} has no bookmark`).toBe(true);
    expect([...docx.matchAll(/<w:bookmarkStart /g)].length).toBe([...docx.matchAll(/<w:bookmarkEnd /g)].length);
    // A link to a section the file does not write stays words, never a dangling hyperlink.
    const orphan = blocksDocxParts([{ k: 'links', items: [{ text: 'Where?', href: 'pd-nowhere', plain: 'Nowhere' }] }])['word/document.xml'];
    expect(orphan).not.toContain('<w:hyperlink');
    expect(orphan).toContain('Where? → Nowhere');
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
