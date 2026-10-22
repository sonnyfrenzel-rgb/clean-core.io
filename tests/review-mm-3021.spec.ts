import { test, expect } from '@playwright/test';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { abapCheck } from '../lib/transformation/abap-check';
import { QUERY_FILTER_AND_SORT, RAP_AMOUNT_MINOR_UNITS_TAG } from '../lib/transformation/scaffold-rap';
import { SAP_REFERENCE_PROMPT_RULES, STANDARD_EXCLUSION_NOTE, coverageClaims, findSapIdentifiers, standardExclusionClaims } from '../lib/sap-reference-check';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';
import { readNoResultStates } from '../lib/abap/no-result-states';
import { answerCase, NO_RESULT_QUESTION } from '../lib/case-answer';
import { claimsCountNotInCode, namingContextOf, validateNamingAnswer } from '../lib/process-naming';

/**
 * Roadmap 3.0.21 — the rest of the external MM review of 22.10.2026, points (1) and (3)–(6), held on synthetic ABAP
 * and text written here, never on the reviewed program (it is the owner's and not in the repository). Point (2), a
 * synthetic demonstration path through the query provider, is not built in this step (see the roadmap row). No SAP
 * site is read: point (4) is held by the identifier check against the data the repository has. Server-free.
 */

/** A read-only invoice check whose result row holds a currency, a packed amount and an amount in minor units. */
const CHECK_PROGRAM = [
  'REPORT zfx_inv_explain.',
  'TYPES: BEGIN OF ty_result,',
  '         belnr TYPE c LENGTH 10,',
  '         waers TYPE c LENGTH 5,',
  '         amount TYPE p LENGTH 8 DECIMALS 2,',
  '         amount_minor TYPE i,',
  '         status TYPE c LENGTH 20,',
  '       END OF ty_result.',
  'DATA: gt_result TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY,',
  '      gs_result TYPE ty_result.',
  'START-OF-SELECTION.',
  '  PERFORM check_lines.',
  '  LOOP AT gt_result INTO gs_result.',
  '    WRITE: / gs_result-belnr, gs_result-status.',
  '  ENDLOOP.',
  'FORM check_lines.',
  "  gs_result-belnr = '1'.",
  "  gs_result-waers = 'BHD'.",
  '  gs_result-amount_minor = 201.',
  "  gs_result-status = 'OK'.",
  '  APPEND gs_result TO gt_result.',
  'ENDFORM.',
].join('\n');

function rap(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'rap', program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

/* ------------------------------------------------------------- (1) filter and sort */

test('(1) the query provider applies the request filter and sort order after the logic ran over the whole input', () => {
  const p = rap(CHECK_PROGRAM);
  const query = p.scaffold.files.find((f) => /_q\.clas\.abap$|query/.test(f.path) && f.content.includes('if_rap_query_provider~select'))!.content;
  const run = query.search(/->run|=>run|run_with_state|\brun\(/);
  const filter = query.indexOf('get_filter( )->get_as_ranges( )');
  const sort = query.indexOf('SORT lt_data BY (lt_order).');
  const page = query.indexOf('get_paging( )');
  expect(filter, 'the filter is read').toBeGreaterThan(0);
  expect(sort, 'the sort order is applied').toBeGreaterThan(filter);
  // The logic runs first, over everything the selection names; the filter narrows only the rows shown; then the page.
  expect(run).toBeGreaterThan(0);
  expect(run).toBeLessThan(filter);
  expect(page).toBeGreaterThan(sort);
  expect(query).toContain(QUERY_FILTER_AND_SORT.join('\n'));
  // The total is counted after the filter.
  expect(query.indexOf('set_total_number_of_records')).toBeGreaterThan(sort);
  const r = abapCheck(p.scaffold.files);
  if (!r.ran) throw new Error(r.reason);
  expect(r.activation.activatable, JSON.stringify(r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
});

/* ------------------------------------------------------------- (3) currency and scale */

test('(3) the service entity carries the currency key, a packed amount references it, minor units are said to be no amount', () => {
  const entity = rap(CHECK_PROGRAM).scaffold.files.find((f) => f.path.endsWith('_ce.ddls.asddls'))!.content;
  expect(entity).toContain('      waers : abap.cuky( 5 );');
  expect(entity).toContain("      @Semantics.amount.currencyCode: 'waers'\n      amount : abap.curr( 15, 2 );");
  expect(entity).toMatch(new RegExp(`// ${RAP_AMOUNT_MINOR_UNITS_TAG} amount_minor is a whole number of the smallest unit of waers[^\\n]*a BHD value 201 is 0\\.201 BHD[^\\n]*\\n {6}amount_minor : abap\\.int4;`));
  expect(entity).toContain('      status : abap.char( 20 );');
});

test('(3) without a currency key the entity is as before', () => {
  const entity = rap(CHECK_PROGRAM.replace('         waers TYPE c LENGTH 5,\n', '').replace("  gs_result-waers = 'BHD'.\n", '')).scaffold.files.find((f) => f.path.endsWith('_ce.ddls.asddls'))!.content;
  expect(entity).toContain('      amount : abap.dec( 15, 2 );');
  expect(entity).not.toMatch(/@Semantics\.amount|cc-amount-minor-units/);
});

/* ------------------------------------------------------------- (4) app identifiers */

test('(4) an app or scope item the repository holds no SAP source for is marked, never printed as fact; the prompt asks for exact IDs', () => {
  const checks = findSapIdentifiers('Use F0859 Manage Supplier Invoices, the list F1060A and scope item 2TX.');
  expect(checks.map((c) => `${c.id} ${c.kind} ${c.status}`)).toEqual(['F0859 fiori-app unverified', 'F1060A fiori-app unverified', '2TX scope-item unverified']);
  expect(SAP_REFERENCE_PROMPT_RULES).toContain('do not swap the app that manages documents for the app that only lists them');
});

/* ------------------------------------------------------------- (5) no blanket exclusion */

test('(5) a blanket claim that the SAP standard cannot do something is found and said to be unbacked', () => {
  expect(standardExclusionClaims('The SAP standard cannot simulate the invoice before posting.')).toEqual(['The SAP standard cannot simulate the invoice before posting']);
  expect(standardExclusionClaims('This is not covered by the standard.')).toHaveLength(1);
  expect(standardExclusionClaims('There is no standard function for it.')).toHaveLength(1);
  // A concrete gap stays: it names the combination, not a blanket exclusion.
  expect(standardExclusionClaims('Simulate in supplier invoice processing covers one document; the cumulative tolerance across several receipts is the gap.')).toEqual([]);
  expect(coverageClaims('The SAP standard cannot simulate it.')).toEqual([]);
  expect(SAP_REFERENCE_PROMPT_RULES).toContain('Never rule the SAP standard out with a blanket claim');
  const md = formatAnalysisToMarkdown(JSON.stringify({ standardFit: { potential: 'Low', targetStandardProcess: 'Supplier invoice processing', rationale: 'The SAP standard cannot simulate the invoice.' } }));
  expect(md).toContain(STANDARD_EXCLUSION_NOTE);
});

/* ------------------------------------------------------------- (6) why no result */

/** A check program with the four ways to end with no result. */
const NO_RESULT_PROGRAM = [
  'REPORT zfx_no_result.',
  'PARAMETERS p_bukrs TYPE c LENGTH 4.',
  'DATA: gt_doc TYPE STANDARD TABLE OF zdoc WITH DEFAULT KEY, gs_doc TYPE zdoc, gt_out TYPE STANDARD TABLE OF zdoc WITH DEFAULT KEY.',
  'AT SELECTION-SCREEN.',
  '  IF p_bukrs IS INITIAL.',
  "    MESSAGE 'Company code missing' TYPE 'E'.",
  '  ENDIF.',
  'START-OF-SELECTION.',
  '  SELECT * FROM zdoc INTO TABLE gt_doc WHERE bukrs = p_bukrs.',
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'No documents' TYPE 'S'.",
  '    RETURN.',
  '  ENDIF.',
  '  LOOP AT gt_doc INTO gs_doc.',
  "    CHECK gs_doc-status <> 'X'.",
  '    APPEND gs_doc TO gt_out.',
  '  ENDLOOP.',
  "  DELETE gt_out WHERE blart = 'ZZ'.",
  '  LOOP AT gt_out INTO gs_doc.',
  '    WRITE: / gs_doc-belnr.',
  '  ENDLOOP.',
].join('\n');

test('(6) "Why is there no result?" leads to the concrete states, each with its line, without a model call', () => {
  expect(readNoResultStates(NO_RESULT_PROGRAM).map((s) => `${s.kind} L${s.lineStart}`)).toEqual([
    'input-rejected L5',
    'no-candidate L10',
    'excluded L15',
    'filtered-display L18',
  ]);
  expect(NO_RESULT_QUESTION.test('Why is there no result?')).toBe(true);
  const answer = answerCase([], { projectId: 'p', legacyCode: NO_RESULT_PROGRAM }, 'Why is there no result?');
  expect(answer.mode).toBe('deterministic');
  if (answer.mode !== 'deterministic') return;
  expect(answer.text).toContain('L5 — input rejected');
  expect(answer.text).toContain('L10 — nothing found to work on');
  expect(answer.text).toContain('L15 — a document excluded');
  expect(answer.text).toContain('L18 — rows filtered before they are shown');
  expect(answer.text).not.toMatch(/early exit/i);
});

test('(6) a zero price unit is not named a count of items: such a model name is refused', () => {
  expect(claimsCountNotInCode('Item count is zero', 'IF ls_item-peinh = 0.')).toBe(true);
  expect(claimsCountNotInCode('No items found', 'IF lines( lt_items ) = 0.')).toBe(false);
  expect(claimsCountNotInCode('Price unit is zero', 'IF ls_item-peinh = 0.')).toBe(false);
  const source = ['REPORT zfx_pu.', 'DATA ls_item TYPE ekpo.', 'START-OF-SELECTION.', '  IF ls_item-peinh = 0.', "    MESSAGE 'Price unit missing' TYPE 'E'.", '  ENDIF.'].join('\n');
  const context = namingContextOf(source);
  const gateway = context.skeleton.nodes.find((n) => n.kind === 'gateway')!;
  const result = validateNamingAnswer(context, JSON.stringify({ names: [{ id: gateway.id, name: 'Item count is zero?' }] }));
  expect(result.names).toEqual([]);
  expect(result.discarded.byRule['count-not-in-code']).toBe(1);
});
