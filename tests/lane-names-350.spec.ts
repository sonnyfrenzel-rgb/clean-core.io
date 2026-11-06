import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { buildBpmnExport, businessLevelOf } from '../lib/bpmn/export';
import { ENGINE_READS_350_FROM } from '../lib/abap/engine-reads-350-gate';

/**
 * Lanes named for a business reader (concept "Business-Lesbarkeit" H9): an authorization lane says what the check
 * protects, from the dictionary (`SAP_AUTHORIZATION_OBJECTS`), with the object beside it. A minimal program written
 * for this spec.
 */

const SRC = [
  'REPORT zt_lanes.',
  'PARAMETERS p_ekgrp TYPE ekgrp.',
  'START-OF-SELECTION.',
  "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'EKGRP' FIELD p_ekgrp ID 'ACTVT' FIELD '02'.",
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'No authorization' TYPE 'E'.",
  '  ENDIF.',
  "  AUTHORITY-CHECK OBJECT 'Z_OWN_OBJ' ID 'ACTVT' FIELD '03'.",
  "  WRITE / 'ok'.",
].join('\n');

const lanes = (engine: string) => {
  const skeleton = buildProcessSkeleton(SRC);
  return buildExportModel(skeleton, businessLevelOf(skeleton, SRC, engine)).lanes.map((l) => l.name);
};

test('an authorization lane says what it protects, with its object; a customer object keeps its code; 3.0.21 keeps the token', () => {
  const now = lanes(ENGINE_READS_350_FROM);
  expect(now).toContain('Authorization for purchase requisitions by purchasing group (M_BANF_EKG)');
  expect(now).toContain('Z_OWN_OBJ');
  expect(lanes('3.0.21')).toContain('M_BANF_EKG');
  const xml = buildBpmnExport(buildProcessSkeleton(SRC), { processName: 't', sourceFileName: 't.abap', source: SRC, names: 'plain', exporterVersion: ENGINE_READS_350_FROM }).xml;
  expect(xml).toContain('name="Authorization for purchase requisitions by purchasing group (M_BANF_EKG)"');
});
