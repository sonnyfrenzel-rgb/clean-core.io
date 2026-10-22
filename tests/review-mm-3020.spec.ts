import { test, expect } from '@playwright/test';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { authorClaimOf, checkPurposeProposal } from '../lib/program-summary-check';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { postCheckDesign, proposesDcl } from '../lib/design-post-checks';
import { formatDesignToMarkdown } from '../lib/markdownFormatter';
import { abapTestEvidence, abapTestEvidenceSentences } from '../lib/testing-abap-unit';
import { declarationOperandSentence, invalidDeclarationOperands } from '../lib/abap-input-check';
import { assembleOwnCode, readSourceBytes, type OwnCodeFile } from '../lib/own-code-import';
import { ownCodeIssueText } from '../lib/messages/own-code';

/**
 * Owner decisions of 22.10.2026 on an external review of a generated delivery package for an MM invoice check, held
 * on synthetic ABAP and text written here, never on the reviewed program:
 *
 *   - a header comment naming the "posted history" a read-only check compares against is not a claim of a posting;
 *   - the design post-check does not refuse a sentence that says a custom entity has no DCL, and never calls an
 *     object the package delivers "not in the package";
 *   - a model test that calls the run with an empty input only and asserts no more than a non-empty result is not
 *     counted as a test of the code;
 *   - a LENGTH or DECIMALS that is no number and no constant the program defines is reported, with its line.
 *
 * Pure: no server, no browser, no model.
 */

/* ------------------------------------------------------------------ header comment */

const HEADER_PROGRAM = [
  'REPORT zmm_invoice_explain.',
  '*&---------------------------------------------------------------------*',
  '*& PURPOSE:',
  '*&   Explain whether each complete supplier document matches its EXPLICIT',
  '*&   receipt references, posted history and cumulative commercial tolerance.',
  '*&   No invoice is posted, no payment block is released, no GR/IR account is cleared.',
  '*&   "Committed" below means accepted into this run\'s private simulation.',
  '*&   It NEVER means COMMIT WORK, a database reservation, or an ERP posting.',
  '*&---------------------------------------------------------------------*',
  'PARAMETERS p_bukrs TYPE bukrs.',
  'DATA lt_rbkp TYPE STANDARD TABLE OF rbkp.',
  'START-OF-SELECTION.',
  '  SELECT * FROM rbkp INTO TABLE lt_rbkp WHERE bukrs = p_bukrs.',
  '  WRITE / lines( lt_rbkp ).',
].join('\n');

test.describe('a header that names posted history claims no posting', () => {
  const facts = programSummaryFactsOf(HEADER_PROGRAM);

  test('the whole header passes the purpose check, and so does every sentence of it', () => {
    expect(facts.changes.state).toBe('none');
    const claim = facts.headerClaim!;
    expect(claim.text).toContain('posted history and cumulative commercial tolerance');
    expect(claim.text).toContain('It NEVER means COMMIT WORK, a database reservation, or an ERP posting.');
    expect(checkPurposeProposal(claim.text, facts)).toEqual({ ok: true, problems: [] });
    for (const sentence of claim.text.split(/(?<=[.!?])\s+/)) expect(checkPurposeProposal(sentence, facts), sentence).toEqual({ ok: true, problems: [] });
    expect(authorClaimOf(facts)).toMatchObject({ state: 'shown', lineStart: 3, lineEnd: 8 });
  });

  test('the process documentation quotes it instead of saying it claims a posting', () => {
    const file = 'zmm_invoice_explain.abap';
    const bpmn = buildBpmnExportFromSource(HEADER_PROGRAM, { processName: file, sourceFileName: file });
    const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(HEADER_PROGRAM), null), fileName: file });
    const md = processDocumentationToMarkdown(buildProcessDocumentation({ source: HEADER_PROGRAM, map }));
    expect(md).not.toContain('claims a posting or a data change');
    expect(md).toContain('posted history and cumulative commercial tolerance');
  });

  test('"It posts the invoice" still claims a posting, and so do posting history words that act', () => {
    expect(checkPurposeProposal('It posts the invoice.', facts).problems).toEqual(['claims a posting or a data change; the code changes no data']);
    expect(checkPurposeProposal('The report posted the invoice to the ledger.', facts).ok).toBe(false);
    expect(checkPurposeProposal('It compares the posted records and the posting history of each supplier invoice.', facts).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ design post-check */

const CE_PROGRAM = [
  'REPORT zmm_receipt_check.',
  'PARAMETERS p_werks TYPE werks_d.',
  'DATA lt_ekbe TYPE STANDARD TABLE OF ekbe.',
  'START-OF-SELECTION.',
  '  SELECT * FROM ekbe INTO TABLE lt_ekbe WHERE werks = p_werks.',
  '  WRITE / lines( lt_ekbe ).',
].join('\n');

const PACKAGE_FILES = [
  'src/zmm_receipt_i_ce.ddls.asddls',
  'src/zcl_mm_receipt_i_query.clas.abap',
  'src/zcl_mm_receipt_i_logic.clas.abap',
  'src/zmm_receipt_i_sd.srvd.srvdsrv',
  'src/package.devc.xml',
];

const CE_DESIGN = {
  projectName: 'Receipt check',
  architectureOverview: { approachDescription: 'A RAP query.', nodeFramework: 'SAP RAP', runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)' },
  nodeAppBlueprint: {
    projectStructure: [
      { path: 'zmm_receipt_i_ce', purpose: 'Custom entity' },
      { path: 'ZCL_MM_RECEIPT_I_QUERY', purpose: 'Query provider' },
      { path: 'src/zcl_mm_receipt_i_logic.CLAS.ABAP', purpose: 'Logic' },
      { path: 'zmm_receipt_i_sd.srvd', purpose: 'Service definition' },
      { path: 'zmm_receipt_archive', purpose: 'An archive table the package does not hold' },
    ],
    apiEndpoints: [],
  },
  securityHardening: [
    { category: 'Authorization', requirement: 'Ensure plant-level authorization check is executed in the query implementation as custom entities lack DCL access controls' },
    { category: 'Authorization', requirement: 'Custom entities have no DCL; the query provider runs AUTHORITY-CHECK for the plant.' },
    { category: 'Authorization', requirement: 'Define a DCL for the custom entity with pfcg_auth' },
  ],
  roadmap: [],
};

test.describe('the design post-check of a custom entity', () => {
  test('a sentence saying a custom entity has no DCL is kept; one proposing a DCL is refused', () => {
    expect(proposesDcl('Ensure plant-level authorization check is executed in the query implementation as custom entities lack DCL access controls')).toBe(false);
    expect(proposesDcl('The entity is not protected by a CDS access control; the check runs in the query provider.')).toBe(false);
    expect(proposesDcl('Instead of a DCL, the query provider runs AUTHORITY-CHECK.')).toBe(false);
    expect(proposesDcl('DCL does not apply to custom entities.')).toBe(false);
    expect(proposesDcl('Define a DCL for the custom entity with pfcg_auth')).toBe(true);
    expect(proposesDcl('Custom entities lack DCL, so define role zmm_receipt with pfcg_auth.')).toBe(true);

    const post = postCheckDesign(CE_DESIGN, CE_PROGRAM, PACKAGE_FILES);
    expect(post.delivered?.variant).toBe('custom-entity');
    expect(post.dclRefused).toEqual(['Define a DCL for the custom entity with pfcg_auth']);
    expect((post.design.securityHardening as Array<{ requirement: string }>).map((r) => r.requirement)).toEqual([
      'Ensure plant-level authorization check is executed in the query implementation as custom entities lack DCL access controls',
      'Custom entities have no DCL; the query provider runs AUTHORITY-CHECK for the plant.',
    ]);
  });

  test('an object the package delivers is never "not in the package", whatever its case or suffix', () => {
    const post = postCheckDesign(CE_DESIGN, CE_PROGRAM, PACKAGE_FILES);
    expect(post.beyond).toEqual(['zmm_receipt_archive']);
    const md = formatDesignToMarkdown(JSON.stringify(CE_DESIGN), { code: CE_PROGRAM, packageFiles: PACKAGE_FILES });
    const beyondLine = md.split('\n').find((l) => l.includes('Not in the package')) ?? '';
    expect(beyondLine).toContain('`zmm_receipt_archive`');
    for (const own of ['zmm_receipt_i_ce', 'ZCL_MM_RECEIPT_I_QUERY', 'zcl_mm_receipt_i_logic', 'zmm_receipt_i_sd']) expect(beyondLine).not.toContain(own);
    expect(md).toContain("Delivered objects (read from the package's files)");
    expect(md).not.toContain('Refused — CDS access control proposed for a custom entity: “Ensure plant-level');
  });
});

/* ------------------------------------------------------------------ test counting */

const LOGIC = [
  'CLASS zcl_mm_iv_logic DEFINITION PUBLIC FINAL CREATE PUBLIC.',
  '  PUBLIC SECTION.',
  '    TYPES BEGIN OF ty_run_selection.',
  '    TYPES p_demo TYPE c LENGTH 1.',
  '    TYPES END OF ty_run_selection.',
  '    TYPES BEGIN OF ty_run_input.',
  '    TYPES gt_invoices TYPE string_table.',
  '    TYPES END OF ty_run_input.',
  '    TYPES BEGIN OF ty_run_result.',
  '    TYPES gt_verdicts TYPE string_table.',
  '    TYPES gt_messages TYPE string_table.',
  '    TYPES END OF ty_run_result.',
  '    METHODS run',
  '      IMPORTING',
  '        is_selection TYPE ty_run_selection',
  '        is_input TYPE ty_run_input OPTIONAL',
  '      RETURNING VALUE(rs_result) TYPE ty_run_result.',
  'ENDCLASS.',
  'CLASS zcl_mm_iv_logic IMPLEMENTATION.',
  '  METHOD run.',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const MODEL = [
  'CLASS ltcl_iv DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
  '  PRIVATE SECTION.',
  '    DATA mo_cut TYPE REF TO zcl_mm_iv_logic.',
  '    METHODS setup.',
  '    METHODS tc01_matching_invoice FOR TESTING.',
  '    METHODS tc02_price_tolerance FOR TESTING.',
  '    METHODS tc03_quantity_tolerance FOR TESTING.',
  '    METHODS tc04_empty_run_messages FOR TESTING.',
  '    METHODS tc05_bound_only FOR TESTING.',
  'ENDCLASS.',
  'CLASS ltcl_iv IMPLEMENTATION.',
  '  METHOD setup.',
  '    mo_cut = NEW zcl_mm_iv_logic( ).',
  '  ENDMETHOD.',
  '  METHOD tc01_matching_invoice.',
  '    DATA ls_sel TYPE zcl_mm_iv_logic=>ty_run_selection.',
  '    DATA ls_inp TYPE zcl_mm_iv_logic=>ty_run_input.',
  '    APPEND `INV-1` TO ls_inp-gt_invoices.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = ls_inp ).',
  '    cl_abap_unit_assert=>assert_equals( act = lines( ls_res-gt_verdicts ) exp = 1 ).',
  '  ENDMETHOD.',
  '  METHOD tc02_price_tolerance.',
  '    DATA ls_sel TYPE zcl_mm_iv_logic=>ty_run_selection.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ).',
  '    cl_abap_unit_assert=>assert_not_initial( act = ls_res ).',
  '  ENDMETHOD.',
  '  METHOD tc03_quantity_tolerance.',
  '    DATA ls_sel TYPE zcl_mm_iv_logic=>ty_run_selection.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ).',
  "    cl_abap_unit_assert=>assert_not_initial( act = ls_res msg = 'quantity tolerance' ).",
  '  ENDMETHOD.',
  '  METHOD tc04_empty_run_messages.',
  '    DATA ls_sel TYPE zcl_mm_iv_logic=>ty_run_selection.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ).',
  '    cl_abap_unit_assert=>assert_not_initial( act = ls_res-gt_messages ).',
  '  ENDMETHOD.',
  '  METHOD tc05_bound_only.',
  '    DATA ls_sel TYPE zcl_mm_iv_logic=>ty_run_selection.',
  '    DATA(lr_res) = REF #( mo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ) ).',
  '    cl_abap_unit_assert=>assert_bound( act = lr_res ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

test('a model test that calls the run with an empty input only and asserts a non-empty result is not counted, and is named', () => {
  const e = abapTestEvidence([{ path: 'src/zcl_mm_iv_logic.clas.abap', content: LOGIC }], MODEL)!;
  // tc01 hands in rows; tc04 checks a component of the empty run's result (its messages) — both are tests.
  expect(e.counts).toMatchObject({ methods: 5, tests: 2, emptyInputOnly: 3 });
  expect(e.counts.emptyInputOnlyNames).toEqual(['ltcl_iv.tc02_price_tolerance', 'ltcl_iv.tc03_quantity_tolerance', 'ltcl_iv.tc05_bound_only']);
  const sentences = abapTestEvidenceSentences(e);
  expect(sentences[sentences.length - 1]).toContain(
    '2 of 5 ABAP Unit test methods call the code under test; 3 call it with an empty input only and check no more than that a result comes back — not counted as tests.',
  );
  expect(sentences).toContain(
    'Test calls it with an empty input only — it checks that a result comes back, not the rule its name stands for: ltcl_iv.tc02_price_tolerance, ltcl_iv.tc03_quantity_tolerance, ltcl_iv.tc05_bound_only pass is_input = VALUE #( ) and assert only that the whole result is not initial.',
  );
});

/* ------------------------------------------------------------------ declarations */

const DECL_PROGRAM = [
  'REPORT zmm_decl_check.',
  'CONSTANTS gc_len TYPE i VALUE 10.',
  'TYPES: BEGIN OF ty_row,',
  '         id     TYPE i,',
  '         status TYPE c LENGTH ode,',
  '         name   TYPE c',
  '                LENGTH gc_len,',
  '         code   TYPE c LENGTH 4,',
  '       END OF ty_row.',
  'DATA lv_amount TYPE p LENGTH 8 DECIMALS dec.',
  'DATA lv_text TYPE c LENGTH zif_mm_sizes=>co_text.',
  "DATA lv_label TYPE string VALUE 'LENGTH ode'.",
  'START-OF-SELECTION.',
  '  DESCRIBE FIELD lv_label LENGTH DATA(lv_len) IN CHARACTER MODE.',
].join('\n');

test.describe('a LENGTH or DECIMALS the program does not define', () => {
  test('is reported with its line and declaration, in a reader\'s words; numbers, constants and class constants are not', () => {
    const problems = invalidDeclarationOperands(DECL_PROGRAM);
    expect(problems).toEqual([
      { line: 5, keyword: 'LENGTH', operand: 'ode', declaration: 'status TYPE c LENGTH ode' },
      { line: 10, keyword: 'DECIMALS', operand: 'dec', declaration: 'lv_amount TYPE p LENGTH 8 DECIMALS dec' },
    ]);
    expect(declarationOperandSentence(problems[0])).toBe(
      'Line 5 declares a length `ode` that is no number and no constant the program defines (`status TYPE c LENGTH ode`) — the program would not activate as written.',
    );
    expect(declarationOperandSentence(problems[1])).toContain('Line 10 declares a number of decimals `dec`');
  });

  test('is not judged where an include the source does not hold may define the constant', () => {
    expect(invalidDeclarationOperands(`${DECL_PROGRAM}\nINCLUDE zmm_decl_top.`)).toEqual([]);
  });

  test('the own-code input check says it as a notice that stops nothing; a constant from an uploaded TOP include counts', () => {
    const fileOf = (name: string, text: string): OwnCodeFile => {
      const read = readSourceBytes(name, new TextEncoder().encode(text));
      return { id: name, name, bytes: text.length, zip: false, sources: read.source ? [read.source] : [], issues: read.issues };
    };
    const single = assembleOwnCode([fileOf('zmm_decl_check.abap', DECL_PROGRAM)]);
    const issues = single.rows[0].issues.filter((i) => i.kind === 'invalid-declaration');
    expect(issues).toHaveLength(2);
    expect(single.rows[0].state).toBe('warning');
    expect(single.attention).toEqual([]);
    expect(ownCodeIssueText(issues[0])).toBe(
      'Line 5 declares a length `ode` that is no number and no constant the program defines (`status TYPE c LENGTH ode`) — the program would not activate as written. The analysis reads it as written and repairs nothing.',
    );

    const main = ['REPORT zmm_split.', 'INCLUDE zmm_split_top.', 'DATA lv_x TYPE c LENGTH gc_size.', 'START-OF-SELECTION.', '  WRITE lv_x.'].join('\n');
    const top = ['CONSTANTS gc_size TYPE i VALUE 12.'].join('\n');
    const joined = assembleOwnCode([fileOf('zmm_split.abap', main), fileOf('zmm_split_top.abap', top)]);
    expect(joined.rows.flatMap((r) => r.issues).filter((i) => i.kind === 'invalid-declaration')).toEqual([]);
  });
});
