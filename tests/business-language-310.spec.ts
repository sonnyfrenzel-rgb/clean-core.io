import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { conditionToQuestion, plainContext, plainLabels } from '../lib/abap/plain-language';
import { buildExportModel, type ExportNode } from '../lib/bpmn/model';
import { businessLevelOf } from '../lib/bpmn/export';
import { ENGINE_READS_310_FROM, engineReads310Apply } from '../lib/abap/engine-reads-310-gate';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';

/**
 * The Business view in business language, from engine 3.1.0 (concept "Business-Lesbarkeit" of 05.11.2026, owner
 * decisions E1–E4 of 06.11.2026; `lib/abap/engine-reads-310-gate.ts`). Every idiom the engine now words has its own
 * minimal program here, written for this spec — none is taken from the process benchmark. Each also shows that the
 * engine before 3.1.0 keeps its picture.
 */

const NEW = ENGINE_READS_310_FROM;
const OLD = '3.0.21';

function mapOf(source: string, engine: string) {
  const skeleton = buildProcessSkeleton(source, { engineVersion: engine });
  const model = buildExportModel(skeleton, businessLevelOf(skeleton, source, engine));
  const nodes = model.containers.flatMap((c) => c.nodes);
  const flows = model.containers.flatMap((c) => c.flows);
  const named = (re: RegExp) => nodes.filter((n) => re.test(n.name));
  const arms = (g: ExportNode) => g.outgoing.map((id) => flows.find((f) => f.id === id)!).map((f) => ({
    label: f.label ?? '',
    to: nodes.find((n) => n.id === f.targetId)?.name ?? '',
  }));
  return { nodes, named, arms };
}

const gateways = (m: ReturnType<typeof mapOf>) => m.nodes.filter((n) => n.tag === 'exclusiveGateway').map((n) => n.name);

test('the gate: 3.1.0 and later read in business language; 3.0.21, a 3.0.22 hotfix and a missing version do not', () => {
  expect(engineReads310Apply('3.1.0')).toBe(true);
  expect(engineReads310Apply('v3.1.0')).toBe(true);
  expect(engineReads310Apply('3.2.0')).toBe(true);
  expect(engineReads310Apply('v3.5.0')).toBe(true);
  // Owner decision 06.11.2026: 3.0.22, 3.0.23 … are hotfixes of the released line and keep its reading.
  expect(engineReads310Apply('3.0.22')).toBe(false);
  expect(engineReads310Apply('v3.0.23')).toBe(false);
  expect(engineReads310Apply('3.0.99')).toBe(false);
  expect(engineReads310Apply('3.0.21')).toBe(false);
  expect(engineReads310Apply(null)).toBe(false);
});

test('E1: a negated question is asked the positive way round, and each branch still goes where the code sends it', () => {
  const src = [
    'REPORT zt_auth.',
    'PARAMETERS p_werks TYPE werks_d.',
    'START-OF-SELECTION.',
    "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
    '  IF sy-subrc <> 0.',
    "    MESSAGE 'No authorization for this plant' TYPE 'E'.",
    '  ENDIF.',
    "  WRITE / 'ok'.",
  ].join('\n');
  const now = mapOf(src, NEW);
  const g = now.named(/^Authorized\?$/);
  expect(g).toHaveLength(1);
  const arms = now.arms(g[0]);
  expect(arms.find((a) => a.label === 'No')?.to).toBe('Stop: no authorization for this plant');
  expect(arms.find((a) => a.label === 'Yes')?.to).not.toMatch(/^Stop/);
  // The engine before keeps its question.
  expect(gateways(mapOf(src, OLD))).toContain('Not authorized?');
});

test('E1: a flag tested for "not set" asks whether it is set', () => {
  const src = [
    'REPORT zt_flag.',
    'PARAMETERS p_test AS CHECKBOX.',
    'START-OF-SELECTION.',
    '  IF p_test = abap_false.',
    "    UPDATE ztt_items SET status = 'X' WHERE id = 1.",
    '  ENDIF.',
  ].join('\n');
  const now = mapOf(src, NEW);
  const g = now.named(/^Test run selected\?$/);
  expect(g).toHaveLength(1);
  expect(now.arms(g[0]).find((a) => a.label === 'No')?.to).toMatch(/^(?:Update|Save)/);
});

test('E1: the result check after a BAPI asks whether SAP reported an error — by READ TABLE, by type field, by line_exists', () => {
  const read = [
    'REPORT zt_bapi1.',
    'DATA: gt_return TYPE TABLE OF bapiret2, ls_return TYPE bapiret2.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2' TABLES return = gt_return.",
    "  READ TABLE gt_return INTO ls_return WITH KEY type = 'E'.",
    '  IF sy-subrc = 0.',
    "    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.",
    '  ELSE.',
    "    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.",
    '  ENDIF.',
  ].join('\n');
  const m = mapOf(read, NEW);
  const g = m.named(/^Did SAP report an error\?$/);
  expect(g).toHaveLength(1);
  expect(m.arms(g[0]).find((a) => a.label === 'Yes')?.to).toBe('Discard the changes');
  expect(m.arms(g[0]).find((a) => a.label === 'No')?.to).toBe('Save the changes');
  expect(gateways(mapOf(read, OLD))).not.toContain('Did SAP report an error?');

  const typed = read.replace("  READ TABLE gt_return INTO ls_return WITH KEY type = 'E'.\n  IF sy-subrc = 0.", "  LOOP AT gt_return INTO ls_return.\n  ENDLOOP.\n  IF ls_return-type CA 'EA'.");
  expect(gateways(mapOf(typed, NEW))).toContain('Did SAP report an error?');

  const exists = read.replace("  READ TABLE gt_return INTO ls_return WITH KEY type = 'E'.\n  IF sy-subrc = 0.", "  IF line_exists( gt_return[ type = 'E' ] ) OR line_exists( gt_return[ type = 'A' ] ).");
  expect(gateways(mapOf(exists, NEW))).toContain('Did SAP report an error?');
  expect(gateways(mapOf(exists, OLD)).join(' ')).toMatch(/Entry exists/);
});

test('E1: CASE sy-subrc asks how the step before it ended', () => {
  const src = [
    'REPORT zt_case.',
    'DATA lv_x TYPE i.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'Z_DO_IT' EXCEPTIONS failed = 1 OTHERS = 2.",
    '  CASE sy-subrc.',
    '    WHEN 0.',
    "      WRITE / 'done'.",
    '    WHEN 1.',
    "      MESSAGE 'Failed' TYPE 'E'.",
    '  ENDCASE.',
  ].join('\n');
  expect(gateways(mapOf(src, NEW))).toContain('How did the previous step end?');
});

test('a compound condition too long for a label says its first part and how many follow, not "Condition met?"', () => {
  const src = [
    'REPORT zt_long.',
    'DATA: gv_quantity_on_stock TYPE i, gv_quantity_ordered_by_customer TYPE i, gv_reserved_quantity_of_plant TYPE i.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM mard INTO @DATA(ls_mard) WHERE matnr = @space.',
    '  IF sy-subrc <> 0 OR gv_quantity_on_stock < gv_quantity_ordered_by_customer OR gv_reserved_quantity_of_plant > 0.',
    "    WRITE / 'short'.",
    '  ENDIF.',
  ].join('\n');
  const now = gateways(mapOf(src, NEW));
  expect(now).not.toContain('Condition met?');
  expect(now.some((q) => /, or 2 more conditions\?$/.test(q))).toBe(true);
});

test('an internal table is named after where its rows come from — or as the code of its table, never a made-up plural', () => {
  const src = [
    'REPORT zt_source.',
    'DATA: gt_mel TYPE STANDARD TABLE OF qmel, gt_zz TYPE STANDARD TABLE OF zt_ship_sched.',
    'START-OF-SELECTION.',
    '  SELECT * FROM qmel INTO TABLE gt_mel UP TO 10 ROWS.',
    '  IF gt_mel IS INITIAL.',
    '    RETURN.',
    '  ENDIF.',
    '  SELECT * FROM zt_ship_sched INTO TABLE gt_zz.',
    '  LOOP AT gt_zz INTO DATA(ls_zz).',
    "    WRITE / 'x'.",
    '  ENDLOOP.',
  ].join('\n');
  const now = mapOf(src, NEW).nodes.map((n) => n.name);
  expect(now).toContain('Any notifications?');
  expect(now.some((n) => /entr(?:y|ies) of ZT_SHIP_SCHED/.test(n))).toBe(true);
  expect(mapOf(src, OLD).nodes.map((n) => n.name)).toContain('Any mels?');
});

test('a dictionary field is said by its dictionary word and "set", never as "Field PROFL given?"; a field no one has a word for stays its code', () => {
  const src = [
    'REPORT zt_field.',
    'TYPES: BEGIN OF ty_mat, profl TYPE c LENGTH 3, zzqx TYPE c LENGTH 1, END OF ty_mat.',
    'DATA ls_mat TYPE ty_mat.',
    'START-OF-SELECTION.',
    '  IF ls_mat-profl IS NOT INITIAL.',
    "    WRITE / 'dangerous'.",
    '  ENDIF.',
    '  IF ls_mat-zzqx IS NOT INITIAL.',
    "    WRITE / 'other'.",
    '  ENDIF.',
  ].join('\n');
  // Owner decision 06.11.2026 (H5): the dictionary's word (`lib/abap/sap-dictionary.ts`), asked with "set".
  expect(gateways(mapOf(src, NEW))).toContain('Dangerous goods profile set?');
  expect(gateways(mapOf(src, NEW))).toContain('Field ZZQX set?');
  expect(gateways(mapOf(src, OLD))).toContain('Profl given?');
});

test('E2: a stop says the message\'s own WITH text; a German text that cannot be put into English stays in the detail', () => {
  const src = [
    'REPORT zt_stop.',
    'DATA lv_ekgrp TYPE ekgrp.',
    'START-OF-SELECTION.',
    "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'EKGRP' FIELD lv_ekgrp ID 'ACTVT' FIELD '02'.",
    '  IF sy-subrc <> 0.',
    "    MESSAGE e002(zmm) WITH 'No authorization for group' lv_ekgrp.",
    '  ENDIF.',
    "  SELECT SINGLE * FROM eban INTO @DATA(ls_eban) WHERE ekgrp = @lv_ekgrp.",
    '  IF sy-subrc <> 0.',
    "    MESSAGE 'Fehler beim Lesen der Bestellanforderung' TYPE 'E'.",
    '  ENDIF.',
  ].join('\n');
  const skeleton = buildProcessSkeleton(src);
  const labels = plainLabels(skeleton, src, { engineVersion: NEW });
  const ends = skeleton.nodes.filter((n) => n.kind === 'end-error');
  const names = ends.map((n) => labels.nodes.get(n.id));
  expect(names).toContain('Stop: no authorization for group (E002)');
  // The German text is not the label: the condition before it speaks instead (or, without one, "a message in German").
  const german = ends.find((n) => n.anchor?.lineStart === 10);
  expect(german, names.join(' | ')).toBeTruthy();
  expect(labels.nodes.get(german!.id)).toBe('Stop: no purchase requisition found');
  expect(labels.technical(german!.id)).toContain('Fehler beim Lesen der Bestellanforderung');
  const old = plainLabels(skeleton, src, { engineVersion: OLD });
  expect(ends.map((n) => old.nodes.get(n.id))).toContain('Stop: not authorized (E002)');
});

test('technique one level down: a lock and its release fold into the step they serve, with every line kept', () => {
  const src = [
    'REPORT zt_lock.',
    'PARAMETERS p_vbeln TYPE vbeln_va.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'ENQUEUE_EVVBAKE' EXPORTING vbeln = p_vbeln.",
    "  UPDATE vbak SET lifsk = '01' WHERE vbeln = p_vbeln.",
    "  CALL FUNCTION 'DEQUEUE_EVVBAKE' EXPORTING vbeln = p_vbeln.",
  ].join('\n');
  const now = mapOf(src, NEW);
  expect(now.named(/lock/i)).toHaveLength(0);
  const step = now.nodes.find((n) => (n.folded ?? []).length === 2);
  expect(step, now.nodes.map((n) => n.name).join(' | ')).toBeTruthy();
  expect(step!.anchorLabel).toBe('L4, L5, L6');
  expect(step!.folded!.map((f) => f.name)).toEqual(['Lock data for editing', 'Release the lock']);
  expect(mapOf(src, OLD).named(/lock/i).length).toBe(2);
});

test('In short: batch input is a change, said by its transaction; a started report\'s changes are not claimed', () => {
  const bdc = [
    'REPORT zt_bdc.',
    'DATA gt_bdc TYPE TABLE OF bdcdata.',
    'START-OF-SELECTION.',
    "  SELECT * FROM qmel INTO TABLE @DATA(gt_mel) UP TO 5 ROWS.",
    "  CALL TRANSACTION 'IW31' USING gt_bdc MODE 'N'.",
  ].join('\n');
  const said = (src: string, engine: string) =>
    businessInShort(programSummary(programSummaryFactsOf(src, { engineVersion: engine })), { codes: false }).map((l) => l.text).join(' ');
  expect(said(bdc, OLD)).toMatch(/does not post or change data/);
  expect(said(bdc, NEW)).not.toMatch(/does not post or change data/);
  // H5: IW31 is in the dictionary ("Create maintenance order"), so the change is said by its word.
  expect(said(bdc, NEW)).toMatch(/^Creates maintenance orders in SAP/);
  // A transaction no one has a word for is said by how it is made.
  expect(said(bdc.replace("'IW31'", "'ZT01'"), NEW)).toMatch(/transaction ZT01 with prepared entries/);

  const submit = [
    'REPORT zt_submit.',
    'START-OF-SELECTION.',
    "  SELECT * FROM qmel INTO TABLE @DATA(gt_mel) UP TO 5 ROWS.",
    '  SUBMIT zt_other_report AND RETURN.',
  ].join('\n');
  expect(said(submit, NEW)).not.toMatch(/does not post or change data/);
  expect(said(submit, NEW)).toMatch(/starts the report ZT_OTHER_REPORT; what that report changes in SAP is not visible in this code/);
});

test('two bounds on one field read as a range only where the words keep each endpoint (QA review 268ed7624e53)', () => {
  const ctx = plainContext(['REPORT zt_range.', 'DATA lv_amount TYPE i.'].join('\n'), { engineVersion: NEW });
  const ask = (condition: string) => conditionToQuestion(condition, ctx, 2).question;
  expect(ask('lv_amount >= 5 AND lv_amount <= 10')).toBe('Amount between 5 and 10?');
  expect(ask('lv_amount < 5 OR lv_amount > 10')).toBe('Amount outside 5 to 10?');
  // Strict bounds inside, inclusive bounds outside: the reader must be able to tell them apart.
  expect(ask('lv_amount > 5 AND lv_amount < 10')).not.toMatch(/between/i);
  expect(ask('lv_amount <= 5 OR lv_amount >= 10')).not.toMatch(/outside/i);
});
