import { test, expect } from '@playwright/test';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { buildBusinessStatements } from '../lib/abap/business-statement';

/**
 * Engine fixes from the ZMM_BESTELLUEBERSICHT review (owner, 06.10.2026).
 *
 * 1. `MODIFY gt_fieldcat FROM gs_fieldcat` reads exactly like a database
 *    MODIFY to `databaseWriteIn`. The call graph asked nothing else, so the
 *    requirements said the program "only reads" its custom table and anchored
 *    their questions on an ALV field catalogue. A declared local data object is
 *    an internal table, never a database write. (The process skeleton still
 *    draws the step as before; changing its node kind removed whole routines
 *    from the shipped examples and is scheduled with the 3.0.7 engine work.)
 * 2. A quoted literal passed to a function module is one value: `(\S+)` cut
 *    'Neues Lieferdatum' to "'Neues".
 * 3. The batch-input recommendation named the sales order API for every
 *    transaction, purchase orders included.
 *
 * Synthetic source — the shape of the reviewed report, not its text.
 */
const SOURCE = `REPORT zsynthetic_po_list.
TABLES zstat_tab.
DATA: gt_fieldcat TYPE slis_t_fieldcat_alv,
      gs_fieldcat TYPE slis_fieldcat_alv,
      gt_out      TYPE STANDARD TABLE OF ekpo,
      gs_out      TYPE ekpo,
      gv_date     TYPE sy-datum.

START-OF-SELECTION.
  SELECT * FROM ekpo INTO TABLE gt_out UP TO 10 ROWS.
  gs_fieldcat-fieldname = 'EBELN'.
  MODIFY gt_fieldcat FROM gs_fieldcat.
  LOOP AT gt_out INTO gs_out.
    MODIFY gt_out FROM gs_out.
  ENDLOOP.
  zstat_tab-ebeln = gs_out-ebeln.
  MODIFY zstat_tab.
  CALL FUNCTION 'POPUP_GET_VALUES'
    EXPORTING
      popup_title = 'Neues Lieferdatum'
    IMPORTING
      returncode = gv_date.
  CALL TRANSACTION 'ME22' USING gt_out.
`;

test.describe('an internal table is never a database effect', () => {
  test('the call graph reports only the table the program writes', () => {
    const writes = readCallGraph(SOURCE).databaseWrites.map((w) => w.table);
    expect(writes).toEqual(['ZSTAT_TAB']);
  });
});

test('a quoted literal with a space is passed on whole', () => {
  const text = JSON.stringify(buildBusinessStatements(SOURCE));
  expect(text).not.toContain("'Neues\"");
  expect(text).not.toMatch(/passes 'Neues(?! Lieferdatum)/);
  expect(text).toContain('Neues Lieferdatum');
});

test('the batch-input recommendation is domain-neutral, not the sales order API', () => {
  const bdc = buildAbapEvidence(SOURCE, 'zsynthetic.abap').findings.filter((f) => f.kind === 'bdc');
  expect(bdc.length).toBeGreaterThan(0);
  for (const f of bdc) {
    expect(f.recommendation).not.toMatch(/Sales Order|VA01|VA02/);
    expect(f.recommendation).toContain("released SAP API");
  }
});
