import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { buildBpmnExport, businessLevelOf } from '../lib/bpmn/export';
import { ENGINE_READS_350_FROM } from '../lib/abap/engine-reads-350-gate';
import {
  DICTIONARY_SOURCES,
  NAMING_ABBREVIATIONS,
  SAP_AUTHORIZATION_OBJECTS,
  SAP_FIELDS,
  SAP_FUNCTIONS,
  SAP_TABLES,
  SAP_TRANSACTIONS,
} from '../lib/abap/sap-dictionary';
import { FIELD_TERMS_EN, TABLE_TERMS_EN } from '../lib/abap/plain-glossary';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';

/**
 * The dictionary of the Business view (concept "Business-Lesbarkeit" H5, owner decision 06.11.2026:
 * `lib/abap/sap-dictionary.ts`). Every program here is a minimal one written for this spec — none is taken from the
 * process benchmark. Each shows that an engine before 3.5.0 keeps its picture.
 */

const NEW = ENGINE_READS_350_FROM;
const OLD = '3.0.21';

function names(source: string, engine: string): string[] {
  const skeleton = buildProcessSkeleton(source);
  return buildExportModel(skeleton, businessLevelOf(skeleton, source, engine)).containers.flatMap((c) => c.nodes).map((n) => n.name);
}

test('every entry names its source, and the dictionary never overrides the glossary every engine reads', () => {
  for (const term of [...Object.values(SAP_TABLES), ...Object.values(SAP_FIELDS)]) {
    expect(Object.keys(DICTIONARY_SOURCES)).toContain(term.source);
    expect(term.singular.trim().length).toBeGreaterThan(1);
  }
  for (const key of Object.keys(SAP_TABLES)) expect(TABLE_TERMS_EN[key], `table ${key} is in the glossary already`).toBeUndefined();
  for (const key of Object.keys(SAP_FIELDS)) expect(FIELD_TERMS_EN[key], `field ${key} is in the glossary already`).toBeUndefined();
  for (const map of [SAP_FUNCTIONS, SAP_TRANSACTIONS, SAP_AUTHORIZATION_OBJECTS]) {
    for (const [key, word] of Object.entries(map)) {
      expect(key).toBe(key.toUpperCase());
      expect(word.trim().length).toBeGreaterThan(2);
    }
  }
  for (const key of Object.keys(NAMING_ABBREVIATIONS)) expect(key).toBe(key.toLowerCase());
});

test('the dictionary module reaches no SAP website: no fetch, no URL of help.sap.com, api.sap.com or the Fiori library', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'abap', 'sap-dictionary.ts'), 'utf8');
  expect(code).not.toMatch(/\bfetch\(|https?:\/\//);
  expect(code.match(/^import .*$/gm) ?? []).toEqual(["import type { PlainTerm } from './plain-glossary';"]);
});

test('a standard table, a function module and a transaction the glossary does not know are said in their dictionary words', () => {
  const src = [
    'REPORT zt_dict.',
    'DATA: ls_reguv TYPE reguv, ls_bdc TYPE bdcdata, lt_bdc TYPE STANDARD TABLE OF bdcdata.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM reguv INTO ls_reguv WHERE laufd = sy-datum.',
    "  CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'.",
    "  CALL TRANSACTION 'IW31' USING lt_bdc MODE 'N'.",
  ].join('\n');
  const now = names(src, NEW);
  expect(now).toContain('Read payment run control data');
  expect(now).toContain('Create maintenance notification');
  expect(now).toContain('Create maintenance order by simulated entry');
  const before = names(src, OLD);
  expect(before).toContain('Read REGUV');
  expect(before).toContain('Alm notif create');
  // A 3.0.22 hotfix keeps the released reading (owner decision 06.11.2026).
  expect(names(src, '3.0.22')).toContain('Read REGUV');
});

test('a value of a fixed SAP domain carries its meaning; a check on a field whose purpose the code does not state says so in its documentation', () => {
  const src = [
    'REPORT zt_status.',
    'DATA ls_vbuk TYPE vbuk.',
    'DATA ls_mara TYPE mara.',
    'START-OF-SELECTION.',
    "  IF ls_vbuk-gbstk = 'C'.",
    "    WRITE / 'complete'.",
    '  ENDIF.',
    '  IF ls_mara-profl IS NOT INITIAL.',
    "    WRITE / 'dangerous'.",
    '  ENDIF.',
  ].join('\n');
  expect(names(src, NEW)).toContain('Overall status C (completely processed)?');
  const xml = buildBpmnExport(buildProcessSkeleton(src), { processName: 't', sourceFileName: 't.abap', source: src, names: 'plain', exporterVersion: NEW }).xml;
  expect(xml).toContain('The code does not say what this check means (field PROFL).');
  // A domain value says what it means: no such note on the status check.
  expect(xml).not.toContain('(field GBSTK)');
  const old = buildBpmnExport(buildProcessSkeleton(src), { processName: 't', sourceFileName: 't.abap', source: src, names: 'plain', exporterVersion: OLD }).xml;
  expect(old).not.toContain('The code does not say what this check means');
});

test('a rule on a constant is titled with the dictionary word of its name, not the name made into a word', () => {
  const src = [
    'REPORT zt_rule.',
    "CONSTANTS c_gewei TYPE c LENGTH 3 VALUE 'KG'.",
    'DATA ls_lips TYPE lips.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM lips INTO ls_lips WHERE gewei = c_gewei.',
    "  WRITE / ls_lips-vbeln.",
  ].join('\n');
  const skeleton = buildProcessSkeleton(src);
  const facts = buildProcessFacts(src);
  const titles = (engine: string) => {
    const ruleSet = deriveBusinessRulesFrom(src, facts, skeleton, engine);
    return explainBusinessRules(src, ruleSet, facts, engine).rules.map((r) => r.headline ?? '');
  };
  expect(titles(NEW).some((t) => /^Only weight unit KG$/i.test(t))).toBe(true);
  expect(titles(OLD).some((t) => /^Only gewei KG$/i.test(t))).toBe(true);
});

test('a customer table is said in the words of its own name, with its code beside them, only when every word is known', () => {
  const src = [
    'REPORT zt_custom.',
    'DATA: lt_abgr TYPE STANDARD TABLE OF zfi_abgrenzung, lt_strat TYPE STANDARD TABLE OF zsd_price_strat.',
    'START-OF-SELECTION.',
    '  SELECT * FROM zfi_abgrenzung INTO TABLE lt_abgr.',
    '  SELECT * FROM zsd_price_strat INTO TABLE lt_strat.',
  ].join('\n');
  const now = names(src, NEW);
  expect(now).toContain('Read accruals (ZFI_ABGRENZUNG)');
  // "strat" is no word anyone has written down: the table stays its code.
  expect(now).toContain('Read ZSD_PRICE_STRAT');
  expect(names(src, OLD)).toContain('Read ZFI_ABGRENZUNG');
});
