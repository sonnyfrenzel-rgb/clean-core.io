import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import * as abaplint from '@abaplint/core';
import { ABAPLINT_RENAMED_ANCHORS, CLEAN_ABAP_RULES, adoptedCleanAbapRuleKeys, cleanAbapAbaplintRules, cleanAbapCitedSections } from '../lib/clean-abap-rules';
import { buildRapScaffold, planUnits, readEngineFacts } from '../lib/transformation';

/**
 * Clean ABAP for the RAP path (owner decision 13.10.2026): the table of abaplint rules that cite
 * SAP's Clean ABAP guide, which ones are adopted, and the abaplint config of the adopted ones.
 * The engine-written RAP scaffold must pass every adopted rule for every shipped example and
 * fixture; a hand-written violation must fail each one. Server-free; no network.
 */

const ROOT = path.join(__dirname, '..');
const installed = new Map(abaplint.ArtifactsRules.getRules().map((r) => [r.getMetadata().key, r]));
const citesCleanAbap = (r: { getMetadata(): { extendedInformation?: string } }) => /clean-abap\/CleanABAP\.md/.test(r.getMetadata().extendedInformation ?? '');

/**
 * Stand-ins for the SAP classes the scaffold inherits from. Without them every class of the package has a syntax
 * error (an unknown superclass), and the rules that need a syntax pass (clear_exporting_parameters,
 * static_call_via_instance) silently skip it. Only the inheritance is modelled.
 */
const stub = (name: string, defs: string[] = [], impl: string[] = [], head = 'ABSTRACT CREATE PUBLIC') => ({
  name: `${name}.clas.abap`,
  content: [`CLASS ${name} DEFINITION PUBLIC ${head}.`, ...defs, 'ENDCLASS.', `CLASS ${name} IMPLEMENTATION.`, ...impl, 'ENDCLASS.', ''].join('\n'),
});
const SAP_STUBS = [
  stub(
    'cx_root',
    ['  PUBLIC SECTION.', '    DATA previous TYPE REF TO cx_root READ-ONLY.', '    METHODS constructor IMPORTING previous LIKE previous OPTIONAL.'],
    ['  METHOD constructor.', '    me->previous = previous.', '  ENDMETHOD.'],
  ),
  stub('cx_no_check', [], [], 'INHERITING FROM cx_root ABSTRACT CREATE PUBLIC'),
  stub('cx_static_check', [], [], 'INHERITING FROM cx_root ABSTRACT CREATE PUBLIC'),
  stub('cl_abap_behavior_handler'),
];

/** abaplint over in-memory files, ABAP Cloud, with the adopted rules and parser_error. */
function lint(files: { name: string; content: string }[]): readonly abaplint.Issue[] {
  const conf = abaplint.Config.getDefault().get();
  conf.syntax.version = abaplint.Version.Cloud;
  conf.syntax.errorNamespace = '^(Z|Y|LCL_|TY_|LIF_|LTD_|LTC_|LHC_|LSC_)';
  conf.rules = { ...cleanAbapAbaplintRules(), parser_error: true };
  const reg = new abaplint.Registry(new abaplint.Config(JSON.stringify(conf)));
  for (const f of [...files, ...SAP_STUBS]) reg.addFile(new abaplint.MemoryFile(f.name, f.content));
  reg.parse();
  return reg.findIssues();
}

const klass = (name: string, defs: string, impl: string, head = 'CREATE PUBLIC') =>
  ({ name: `${name}.clas.abap`, content: [`CLASS ${name} DEFINITION PUBLIC FINAL ${head}.`, defs, 'ENDCLASS.', '', `CLASS ${name} IMPLEMENTATION.`, impl, 'ENDCLASS.', ''].join('\n') });
const method = (name: string, body: string[], defs = `  PUBLIC SECTION.\n    METHODS run IMPORTING iv_a TYPE i.`) => klass(name, defs, ['  METHOD run.', ...body.map((l) => `    ${l}`), '  ENDMETHOD.'].join('\n'));

/** One violation per adopted rule, nothing else wrong. */
const BAD: Record<string, { name: string; content: string }[]> = {
  avoid_use: [klass('zcl_ca_avoid_use', '  PUBLIC SECTION.\n    TYPES tt_a TYPE STANDARD TABLE OF string WITH DEFAULT KEY.', '')],
  clear_exporting_parameters: [
    klass('zcl_ca_clear_exp', '  PUBLIC SECTION.\n    TYPES tt_text TYPE STANDARD TABLE OF string WITH EMPTY KEY.\n    METHODS run EXPORTING et_a TYPE tt_text ev_n TYPE i.', '  METHOD run.\n    ev_n = lines( et_a ).\n    INSERT `x` INTO TABLE et_a.\n  ENDMETHOD.'),
  ],
  commented_code: [method('zcl_ca_commented', ['" DATA(lv_b) = iv_a + 1.', 'RETURN.'])],
  constructor_visibility_public: [
    klass('zcl_ca_ctor', '  PUBLIC SECTION.\n    CLASS-METHODS create RETURNING VALUE(ro_a) TYPE REF TO zcl_ca_ctor.\n  PRIVATE SECTION.\n    METHODS constructor.', '  METHOD create.\n    ro_a = NEW #( ).\n  ENDMETHOD.\n  METHOD constructor.\n    RETURN.\n  ENDMETHOD.', 'CREATE PRIVATE'),
  ],
  empty_structure: [method('zcl_ca_empty', ['IF iv_a = 1.', 'ENDIF.'])],
  exit_or_check: [method('zcl_ca_check', ['CHECK iv_a > 0.'])],
  fully_type_itabs: [method('zcl_ca_itab', ['DATA lt_a TYPE STANDARD TABLE OF string.', 'INSERT `x` INTO TABLE lt_a.'])],
  functional_writing: [klass('zcl_ca_functional', '  PUBLIC SECTION.\n    METHODS run.\n    METHODS other.', '  METHOD run.\n    CALL METHOD me->other.\n  ENDMETHOD.\n  METHOD other.\n    RETURN.\n  ENDMETHOD.')],
  method_length: [method('zcl_ca_long', ['DATA lv_b TYPE i.', ...Array.from({ length: 101 }, () => 'lv_b = lv_b + iv_a.')])],
  method_overwrites_builtin: [klass('zcl_ca_builtin', '  PUBLIC SECTION.\n    METHODS lines RETURNING VALUE(rv_a) TYPE i.', '  METHOD lines.\n    rv_a = 1.\n  ENDMETHOD.')],
  mix_returning: [klass('zcl_ca_mix', '  PUBLIC SECTION.\n    METHODS run EXPORTING ev_a TYPE i RETURNING VALUE(rv_b) TYPE i.', '  METHOD run.\n    ev_a = 1.\n    rv_b = 2.\n  ENDMETHOD.')],
  nesting: [method('zcl_ca_nesting', [...Array.from({ length: 6 }, (_, i) => `${'  '.repeat(i)}IF iv_a > ${i}.`), '          RETURN.', ...Array.from({ length: 6 }, (_, i) => `${'  '.repeat(5 - i)}ENDIF.`)])],
  no_chained_assignment: [method('zcl_ca_chain', ['DATA lv_b TYPE i.', 'DATA lv_c TYPE i.', 'lv_b = lv_c = iv_a.'])],
  no_public_attributes: [klass('zcl_ca_public', '  PUBLIC SECTION.\n    DATA mv_a TYPE i.', '')],
  obsolete_statement: [method('zcl_ca_obsolete', ['DATA lv_b TYPE i.', 'ADD iv_a TO lv_b.'])],
  prefer_pragmas: [method('zcl_ca_pseudo', ['DATA lv_b TYPE i. "#EC NEEDED'])],
  prefer_returning_to_exporting: [klass('zcl_ca_exporting', '  PUBLIC SECTION.\n    METHODS run EXPORTING ev_a TYPE i.', '  METHOD run.\n    ev_a = 1.\n  ENDMETHOD.')],
  prefer_xsdbool: [method('zcl_ca_boolc', ['DATA(lv_b) = boolc( iv_a = 1 ).'])],
  sql_escape_host_variables: [method('zcl_ca_sql', ['SELECT SINGLE f FROM zca_tab WHERE f = iv_a INTO @DATA(lv_f).'])],
  static_call_via_instance: [
    klass('zcl_ca_static', '  PUBLIC SECTION.\n    CLASS-METHODS helper.\n    METHODS run.', '  METHOD helper.\n    RETURN.\n  ENDMETHOD.\n  METHOD run.\n    DATA(lo_a) = NEW zcl_ca_static( ).\n    lo_a->helper( ).\n  ENDMETHOD.'),
  ],
  use_class_based_exceptions: [klass('zcl_ca_classic', '  PUBLIC SECTION.\n    METHODS run EXCEPTIONS failed.', '  METHOD run.\n    RETURN.\n  ENDMETHOD.')],
};

/** What the model is asked to write: Clean ABAP that ABAP Cloud accepts. */
const GOOD = klass(
  'zcl_ca_good',
  [
    '  PUBLIC SECTION.',
    '    TYPES tt_amount TYPE SORTED TABLE OF i WITH NON-UNIQUE KEY table_line.',
    '    METHODS total IMPORTING it_amount TYPE tt_amount RETURNING VALUE(rv_total) TYPE i.',
    '    METHODS has_negative IMPORTING it_amount TYPE tt_amount RETURNING VALUE(rv_has) TYPE abap_bool.',
    '    METHODS first_over IMPORTING it_amount TYPE tt_amount iv_limit TYPE i RETURNING VALUE(rv_amount) TYPE i.',
  ].join('\n'),
  [
    '  METHOD total.',
    '    LOOP AT it_amount INTO DATA(lv_amount).',
    '      rv_total = rv_total + lv_amount.',
    '    ENDLOOP.',
    '  ENDMETHOD.',
    '',
    '  METHOD has_negative.',
    '    " A negative amount is a credit; the original counts it apart (L42).',
    '    rv_has = xsdbool( line_exists( it_amount[ table_line = -1 ] ) ).',
    '  ENDMETHOD.',
    '',
    '  METHOD first_over.',
    '    IF iv_limit < 0.',
    "      RAISE EXCEPTION NEW cx_sy_arithmetic_overflow( ).",
    '    ENDIF.',
    '    LOOP AT it_amount ASSIGNING FIELD-SYMBOL(<lv_amount>) WHERE table_line > iv_limit.',
    '      rv_amount = <lv_amount>.',
    '      RETURN.',
    '    ENDLOOP.',
    '  ENDMETHOD.',
  ].join('\n'),
);

const EXAMPLES = path.join(ROOT, 'public', 'starter-examples');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'transformation');
const SOURCES = [
  ...fs.readdirSync(EXAMPLES).map((f) => path.join(EXAMPLES, f)),
  ...fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.abap')).map((f) => path.join(FIXTURES, f)),
];

function rapScaffoldFiles(file: string) {
  const source = fs.readFileSync(file, 'utf8');
  const facts = readEngineFacts(source);
  const scaffold = buildRapScaffold(planUnits(source, {}, facts), facts);
  return scaffold.files.filter((f) => /\.(abap|asddls|asbdef)$/.test(f.path)).map((f) => ({ name: path.basename(f.path), content: f.content }));
}

test('every rule in the table exists in the installed abaplint, once, and every option is one the rule has', () => {
  const keys = CLEAN_ABAP_RULES.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const r of CLEAN_ABAP_RULES) {
    const rule = installed.get(r.key);
    expect(rule, r.key).toBeDefined();
    expect(r.reason.length, r.key).toBeGreaterThan(10);
    expect(r.sections.length, r.key).toBeGreaterThan(0);
    for (const sec of r.sections) expect(sec.anchor, r.key).toMatch(/^[a-z0-9_-]+$/);
    expect(['correctness', 'maintainability'].includes(r.because), r.key).toBe(r.status === 'adopted');
    const defaults = rule!.getConfig() as unknown as Record<string, unknown>;
    for (const option of Object.keys(r.options ?? {})) expect(option in defaults, `${r.key}.${option}`).toBe(true);
    if (r.status === 'not-adopted') expect(r.options, r.key).toBeUndefined();
  }
});

test('the table decides every abaplint rule that cites Clean ABAP, and cites the sections abaplint cites', () => {
  const cited = [...installed.values()].filter(citesCleanAbap).map((r) => r.getMetadata().key).sort();
  expect(CLEAN_ABAP_RULES.map((r) => r.key).sort()).toEqual(cited);
  for (const r of CLEAN_ABAP_RULES) {
    const ours = new Set(r.sections.map((s) => s.anchor));
    const theirs = (installed.get(r.key)!.getMetadata().extendedInformation ?? '').match(/CleanABAP\.md#[\w-]+/g) ?? [];
    for (const link of theirs) {
      const anchor = link.split('#')[1];
      expect(ours.has(ABAPLINT_RENAMED_ANCHORS[anchor] ?? anchor), `${r.key} cites ${anchor}`).toBe(true);
    }
  }
});

test('the config is the adopted rules only, valid for abaplint, and the cited sections list each section once', () => {
  const rules = cleanAbapAbaplintRules();
  expect(Object.keys(rules).sort()).toEqual(adoptedCleanAbapRuleKeys());
  expect(adoptedCleanAbapRuleKeys().length).toBeGreaterThan(10);
  const conf = abaplint.Config.getDefault().get();
  conf.syntax.version = abaplint.Version.Cloud;
  conf.rules = rules;
  const config = new abaplint.Config(JSON.stringify(conf));
  const enabled = config.getEnabledRules().map((r) => r.getMetadata().key).sort();
  expect(enabled).toEqual(adoptedCleanAbapRuleKeys());
  for (const r of config.getEnabledRules()) {
    const options = CLEAN_ABAP_RULES.find((x) => x.key === r.getMetadata().key)!.options ?? {};
    for (const [k, v] of Object.entries(options)) expect((r.getConfig() as unknown as Record<string, unknown>)[k], `${r.getMetadata().key}.${k}`).toEqual(v);
  }
  const sections = cleanAbapCitedSections();
  expect(new Set(sections.map((s) => s.anchor)).size).toBe(sections.length);
  for (const s of sections) expect(s.url).toMatch(/^https:\/\/github\.com\/SAP\/styleguides\/blob\/[0-9a-f]{40}\/clean-abap\/CleanABAP\.md#/);
});

test('a hand-written violation fails each adopted rule, and only that rule', () => {
  expect(Object.keys(BAD).sort()).toEqual(adoptedCleanAbapRuleKeys());
  for (const [key, files] of Object.entries(BAD)) {
    const found = [...new Set(lint(files).map((i) => i.getKey()))];
    expect(found, key).toEqual([key]);
  }
});

test('Clean ABAP the model is asked to write passes every adopted rule', () => {
  expect(lint([GOOD]).map((i) => `${i.getKey()} L${i.getStart().getRow()}: ${i.getMessage()}`)).toEqual([]);
});

test('the engine-written RAP scaffold passes every adopted rule for every shipped example and fixture', () => {
  expect(SOURCES.length).toBeGreaterThanOrEqual(11);
  for (const file of SOURCES) {
    const files = rapScaffoldFiles(file);
    expect(files.filter((f) => f.name.endsWith('.abap')).length, file).toBeGreaterThanOrEqual(4);
    expect(lint(files).map((i) => `${i.getKey()} ${i.getFilename()}:${i.getStart().getRow()} ${i.getMessage()}`), path.basename(file)).toEqual([]);
  }
});

test('the rules do run on the scaffold: a violation written into a fill region is found', () => {
  const files = rapScaffoldFiles(path.join(EXAMPLES, 'Z_MM_PO_APPROVAL.abap'));
  const logic = files.find((f) => f.name.endsWith('_logic.clas.abap'))!;
  const stub = logic.content.match(/^\s*RAISE EXCEPTION NEW zcx_\w+\( unit = '[^']+' \)\.$/m)![0];
  const filled = { ...logic, content: logic.content.replace(stub, stub.replace(/\S.*$/, 'CHECK is_sel IS NOT INITIAL.')) };
  const issues = lint(files.map((f) => (f === logic ? filled : f)));
  expect(issues.map((i) => i.getKey())).toEqual(['exit_or_check']);
  expect(issues[0].getFilename()).toBe(logic.name);
});
