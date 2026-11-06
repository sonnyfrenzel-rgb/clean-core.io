import { expect, test } from './helpers/test';
import { readProgramShape } from '../lib/abap/program-shape';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { ENGINE_READS_3022_FROM } from '../lib/abap/engine-reads-3022-gate';

/**
 * "In short" by the program's shape and in German names (concept "Business-Lesbarkeit" H8): `lib/abap/program-shape.ts`,
 * the German purpose words of `program-domain.ts`, the dictionary's words for calls. Minimal programs written for this
 * spec; none is taken from the process benchmark.
 */

const NEW = ENGINE_READS_3022_FROM;
const OLD = '3.0.21';

const inShort = (src: string, engine: string) => businessInShort(programSummary(programSummaryFactsOf(src, { engineVersion: engine })), { codes: false }).map((l) => l.text);

test('a BAdI, a customer exit and a user exit are enhancements SAP calls, by their name', () => {
  expect(readProgramShape(['CLASS zcl_impl DEFINITION.', '  PUBLIC SECTION.', '    INTERFACES if_ex_me_process_po_cust.', 'ENDCLASS.'].join('\n'))?.text)
    .toBe('An enhancement SAP calls during its own processing (BAdI ME_PROCESS_PO_CUST).');
  expect(readProgramShape(['FUNCTION exit_sapmv45a_002.', 'ENDFUNCTION.'].join('\n'))?.kind).toBe('customer-exit');
  expect(readProgramShape(['FORM userexit_save_document_prepare.', 'ENDFORM.'].join('\n'))?.text)
    .toBe('An enhancement SAP calls during its own processing (user exit USEREXIT_SAVE_DOCUMENT_PREPARE).');
});

test('an output program, an inbound IDoc function and a BW extractor are said by what SAP runs them for; a plain report has no shape', () => {
  const output = ['REPORT zt_output.', 'TABLES nast.', 'FORM entry USING return_code us_screen.', '  return_code = 0.', 'ENDFORM.'].join('\n');
  expect(readProgramShape(output)?.kind).toBe('output-program');
  const idoc = ['FUNCTION z_idoc_input_orders.', '  LOOP AT idoc_contrl.', '    LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.', '    ENDLOOP.', '  ENDLOOP.', 'ENDFUNCTION.'].join('\n');
  expect(readProgramShape(idoc)?.kind).toBe('idoc-inbound');
  const bw = ['FUNCTION z_bw_extract.', '  IF i_dsource IS INITIAL.', '    RETURN.', '  ENDIF.', '  APPEND INITIAL LINE TO e_t_data.', 'ENDFUNCTION.'].join('\n');
  expect(readProgramShape(bw)?.kind).toBe('bw-extractor');
  expect(readProgramShape(['REPORT zt_plain.', 'START-OF-SELECTION.', "  WRITE / 'x'."].join('\n'))).toBeNull();
});

test('"In short" opens with the shape from 3.0.22 and calls an enhancement no report; 3.0.21 reads as before', () => {
  const src = ['FORM userexit_save_document_prepare.', '  DATA ls_vbak TYPE vbak.', '  SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = space.', 'ENDFORM.'].join('\n');
  const now = inShort(src, NEW);
  expect(now[0]).toBe('An enhancement SAP calls during its own processing (user exit USEREXIT_SAVE_DOCUMENT_PREPARE).');
  expect(now.join(' ')).not.toMatch(/\breport\b/);
  expect(inShort(src, OLD).join(' ')).not.toContain('enhancement');
});

test('a German program name gives its purpose; a posting call says its dictionary word, not its code', () => {
  const german = [
    'REPORT zmm_rechnung_pruefung.',
    'DATA: ls_rbkp TYPE rbkp, ls_ekko TYPE ekko.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM rbkp INTO ls_rbkp WHERE belnr = space.',
    '  SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = space.',
    '  SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = ls_rbkp-belnr.',
    '  WRITE / ls_rbkp-belnr.',
  ].join('\n');
  expect(inShort(german, NEW)[0]).toMatch(/^Checks invoices\b|^Checks supplier invoices\b/);
  expect(inShort(german, OLD)[0]).not.toMatch(/^Checks/);
  const posting = ['REPORT zt_release.', 'PARAMETERS p_aufnr TYPE aufnr.', 'START-OF-SELECTION.', "  CALL FUNCTION 'BAPI_PRODORD_RELEASE'.", "  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'."].join('\n');
  expect(inShort(posting, NEW)[0]).toMatch(/^Releases production orders in SAP/);
  expect(inShort(posting, OLD)[0]).not.toMatch(/^Releases production orders/);
});
