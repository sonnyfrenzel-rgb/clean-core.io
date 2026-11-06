import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { businessLevelOf } from '../lib/bpmn/export';
import { ENGINE_READS_350_FROM } from '../lib/abap/engine-reads-350-gate';

/**
 * The steps the engine draws from 3.5.0 for an arm that would otherwise draw nothing (`process-skeleton.ts`: a flag a
 * later decision reads, the call of a technical helper), said as business steps — never the assignment as code.
 * Minimal programs written for this spec.
 */

const NEW = ENGINE_READS_350_FROM;

function names(source: string, engine: string): string[] {
  const skeleton = buildProcessSkeleton(source, { engineVersion: engine });
  return buildExportModel(skeleton, businessLevelOf(skeleton, source, engine)).containers.flatMap((c) => c.nodes).map((n) => n.name);
}

const FLAG = [
  'REPORT zt_flag.',
  'DATA: gv_approved TYPE abap_bool, gv_reason TYPE string.',
  'PARAMETERS p_amount TYPE p DECIMALS 2.',
  'START-OF-SELECTION.',
  '  IF p_amount < 1000.',
  '    gv_approved = abap_true.',
  "    gv_reason = 'Approved without limit check'.",
  '  ELSE.',
  "    WRITE / 'needs approval'.",
  '  ENDIF.',
  '  IF gv_approved = abap_true.',
  "    WRITE / 'approved'.",
  '  ENDIF.',
].join('\n');

test('a flag step says the program\'s own sentence of its arm, or what it sets — never "Gv approved = ABAP true"', () => {
  const now = names(FLAG, NEW);
  expect(now.some((n) => /=|ABAP true/i.test(n)), now.join(' | ')).toBe(false);
  expect(now).toContain('Approved without limit check');
  const bare = names(FLAG.replace("    gv_reason = 'Approved without limit check'.\n", ''), NEW);
  expect(bare).toContain('Mark as approved');
});

test('a 3.0.22 hotfix and 3.0.21 draw no flag step at all', () => {
  for (const engine of ['3.0.21', '3.0.22']) {
    const before = names(FLAG, engine);
    expect(before).not.toContain('Approved without limit check');
    expect(before).not.toContain('Mark as approved');
  }
});

test('a log helper that is an arm\'s only step says its sentence, or what it does; never "Add log"', () => {
  const src = [
    'REPORT zt_log.',
    'PARAMETERS p_kunnr TYPE kunnr.',
    'START-OF-SELECTION.',
    '  IF p_kunnr IS INITIAL.',
    "    PERFORM add_log USING 'Customer missing in the selection'.",
    '  ELSE.',
    "    WRITE / p_kunnr.",
    '  ENDIF.',
    "  WRITE / 'done'.",
    'FORM add_log USING iv_text TYPE string.',
    '  APPEND iv_text TO gt_log.',
    'ENDFORM.',
    'DATA gt_log TYPE STANDARD TABLE OF string.',
  ].join('\n');
  const now = names(src, NEW);
  expect(now).not.toContain('Add log');
  expect(now.some((n) => /^Note: customer missing/i.test(n) || n === 'Note in the run log'), now.join(' | ')).toBe(true);
});

test('a row the engine draws as the yes of an arm goes into the result list, said by what the row is or as "the row"', () => {
  const src = [
    'REPORT zt_collect.',
    'DATA: gt_out TYPE STANDARD TABLE OF vbak, ls_vbak TYPE vbak.',
    'PARAMETERS p_limit TYPE p DECIMALS 2.',
    'START-OF-SELECTION.',
    '  SELECT * FROM vbak INTO ls_vbak UP TO 10 ROWS.',
    '    IF ls_vbak-netwr > p_limit.',
    '      APPEND ls_vbak TO gt_out.',
    '    ENDIF.',
    '  ENDSELECT.',
    '  LOOP AT gt_out INTO ls_vbak.',
    "    WRITE / ls_vbak-vbeln.",
    '  ENDLOOP.',
  ].join('\n');
  const now = names(src, NEW);
  expect(now.some((n) => /^Add the .* to the list$/.test(n)), now.join(' | ')).toBe(false);
  expect(now.some((n) => /^Put the (?:sales order|row) in the result list$/.test(n)), now.join(' | ')).toBe(true);
});
