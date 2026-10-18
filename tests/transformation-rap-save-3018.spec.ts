import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { abapCheck } from '../lib/transformation/abap-check';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { rapNoInputIn, rapSaveOf } from '../lib/transformation/rap-save';
import { readEngineFacts } from '../lib/transformation/unit-plan';
import { withTrace } from '../lib/transformation/trace';
import { fixture, ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.18 item 14, third part, and the package halves of item 13 (QM-03, FI-F09, QM-05) — scaffold version 18:
 *   - the RAP implementation type follows how the original writes (`rap-save.ts`): until 17 every writing program was
 *     `managed implementation … persistent table`;
 *   - a package whose query, job and action hand the logic no input says so plainly (`@cc-no-input`);
 *   - a reason or message component of the visible result reaches the custom entity, also where CDS cannot name its type.
 * Server-free.
 */

const read = (file: string) => fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8');

function prepared(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'rap', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}
const fileEnding = (p: EngineLedPrepared, end: string) => p.scaffold.files.find((f) => f.path.endsWith(end))!.content;
const activatable = (p: EngineLedPrepared) => {
  const r = abapCheck(p.scaffold.files);
  // The saver's base is one of the SAP stubs the check (and the package's own abaplint.json) reads: not unresolved.
  const saverUnresolved = r.ran && JSON.stringify(r.findings).toLowerCase().includes('cl_abap_behavior_saver');
  return { ok: r.ran && r.activation.activatable && !saverUnresolved, why:JSON.stringify(r.ran ? r.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5) : r) };
};

test.describe('the implementation type follows the original', () => {
  test('the PO approval writes through BAPI_PO_CREATE1 and into EBAN: managed with unmanaged save, no persistent table, a saver', () => {
    test.setTimeout(180_000);
    expect(rapSaveOf(readEngineFacts(read('Z_MM_PO_APPROVAL.abap')))).toMatchObject({ kind: 'unmanaged-save', reasons: ['BAPI_PO_CREATE1 (L591)', 'UPDATE EBAN (L246, L455)'] });
    const p = prepared(read('Z_MM_PO_APPROVAL.abap'));
    const bdef = fileEnding(p, '.bdef.asbdef');
    // Before: `managed implementation in class … unique;` with `persistent table zmm_po_appro_rec`.
    expect(bdef.split('\n')[0]).toBe('managed with unmanaged save implementation in class zbp_mm_po_approv_r unique;');
    expect(bdef).not.toMatch(/\npersistent table /);
    const pool = fileEnding(p, '.clas.locals_imp.abap');
    expect(pool).toContain('CLASS lsc_rec DEFINITION INHERITING FROM cl_abap_behavior_saver.');
    expect(pool).toContain('    METHODS save_modified REDEFINITION.');
    expect(pool).toContain('zif_mm_po_approv_access~write_eban');
    expect(pool).not.toContain('zif_mm_po_approv_access~read_eban');
    const a = activatable(p);
    expect(a.ok, a.why).toBe(true);
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain('- Implementation type of the business object: managed with unmanaged save — the original writes SAP\'s data through BAPI_PO_CREATE1 (L591), UPDATE EBAN (L246, L455)');
  });

  test('the 1,000-line example writes its own tables and Z_SD_LEGACY_LOG_WRITE IN UPDATE TASK: managed with additional save', () => {
    test.setTimeout(180_000);
    const p = prepared(read('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'));
    const bdef = fileEnding(p, '.bdef.asbdef');
    expect(bdef.split('\n')[0]).toBe('managed with additional save implementation in class zbp_legacy_order_r unique;');
    expect(bdef).toMatch(/\npersistent table \w+\n/);
    expect(bdef).toContain('Z_SD_LEGACY_LOG_WRITE IN UPDATE TASK (L509)');
    expect(fileEnding(p, '.clas.locals_imp.abap')).toContain('METHOD save_modified.');
    const a = activatable(p);
    expect(a.ok, a.why).toBe(true);
  });

  test('the freight example writes only its own log table: managed, unchanged, no saver', () => {
    const p = prepared(read('Z_SD_FREIGHT_RATE_CHECK.abap'));
    const bdef = fileEnding(p, '.bdef.asbdef');
    expect(bdef.split('\n')[0]).toMatch(/^managed implementation in class \w+ unique;$/);
    expect(bdef).toMatch(/\npersistent table \w+\n/);
    expect(fileEnding(p, '.clas.locals_imp.abap')).not.toContain('lsc_rec');
  });

  test('a reading BAPI and the transaction BAPIs are no write; a change document is an additional save', () => {
    const facts = (lines: string[]) => readEngineFacts(['REPORT z.', 'START-OF-SELECTION.', ...lines, ''].join('\n'));
    expect(rapSaveOf(facts(["  CALL FUNCTION 'BAPI_MATERIAL_GET_DETAIL' EXPORTING material = 'X'.", "  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.", '  INSERT zlog FROM ls_x.'])).kind).toBe('managed');
    expect(rapSaveOf(facts(['  INSERT zlog FROM ls_x.', "  CALL FUNCTION 'ZLOG_WRITE_DOCUMENT' EXPORTING objectid = 'X'."])).kind).toBe('additional-save');
    expect(rapSaveOf(facts(['  MODIFY ENTITIES OF i_salesordertp ENTITY salesorder UPDATE FIELDS ( purchaseorderbycustomer ) WITH lt_x.'])).kind).toBe('unmanaged-save');
  });
});

test.describe('QM-03 / FI-F09: a package whose callers hand the logic no input says so', () => {
  test('the CO shape: the query and the job call run( is_selection ) alone, the logic takes GT_RCV as is_input — tagged, and TRACE.md says "a business library"', () => {
    const p = prepared(fixture('co-shape'));
    expect(rapNoInputIn(p.scaffold.files)).toEqual(['GT_RCV']);
    const query = fileEnding(p, '_query.clas.abap');
    expect(query).toMatch(/" @cc-no-input GT_RCV: is_input of the logic, handed in by nothing here - a business library until an adapter is written\.\n\s+(?:TRY\.|DATA\(ls_result\))/);
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain('- A business library: the service (its query or action) and the job call the logic class without data until an adapter is written');
    expect(trace).toContain("Connecting the access layer's SAP calls does not change that");
    // STATUS.md of the delivery package writes the same sentence.
    expect(fs.readFileSync(path.join(ROOT, 'lib', 'delivery-package.ts'), 'utf8')).toContain('if (inputs.noInput?.length) lines.push(rapNoInputWords(inputs.noInput)');
  });

  test('a package whose logic takes no input table says nothing', () => {
    const p = prepared(read('Z_BUSINESS_PARTNER_SYNC.txt'));
    expect(rapNoInputIn(p.scaffold.files)).toEqual([]);
  });
});

test('QM-05: a reason the visible result carries reaches the custom entity, also typed LIKE another object', () => {
  test.setTimeout(180_000);
  const source = [
    'REPORT zqm_reason.',
    'TYPES: BEGIN OF ty_rule, text TYPE c LENGTH 80, END OF ty_rule.',
    'TYPES: BEGIN OF ty_out,',
    '         lot    TYPE c LENGTH 12,',
    '         status TYPE c LENGTH 20,',
    '         reason TYPE ty_rule-text,',
    '         fail_n TYPE i,',
    '       END OF ty_out.',
    'DATA gt_out TYPE STANDARD TABLE OF ty_out WITH DEFAULT KEY.',
    'DATA gs_out TYPE ty_out.',
    "PARAMETERS p_lot TYPE c LENGTH 12 DEFAULT 'L1'.",
    'START-OF-SELECTION.',
    '  gs_out-lot = p_lot.',
    "  gs_out-status = 'FAIL'.",
    "  gs_out-reason = 'INITIAL_NONCONFORMITY'.",
    '  APPEND gs_out TO gt_out.',
    '  LOOP AT gt_out INTO gs_out.',
    '    WRITE: / gs_out-lot, gs_out-status, gs_out-reason.',
    '  ENDLOOP.',
    '',
  ].join('\n');
  const p = prepared(source);
  const ce = fileEnding(p, '_ce.ddls.asddls');
  // Before: lot, status and fail_n — the reason was dropped because CDS cannot name `TYPE ty_rule-text`.
  expect(ce).toContain('      reason : abap.char( 255 );');
  expect(ce).toContain('      status : abap.char( 20 );');
  const a = activatable(p);
  expect(a.ok, a.why).toBe(true);
});
