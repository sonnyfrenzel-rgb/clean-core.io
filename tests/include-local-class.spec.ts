import { test, expect } from '@playwright/test';
import { classifySource, resolveIncludes } from '../lib/abap/include-resolution';
import { assembleOwnCode, assemblyReady, readSourceBytes, type OwnCodeFile } from '../lib/own-code-import';

/**
 * An include that holds a LOCAL class is still an include (shadow comparison
 * of 15.11.2026: 24 files in 15 of 86 multi-file benchmark learn uploads).
 *
 * Before, any `CLASS x DEFINITION` made a source a class named after x, so a
 * TOP include with `CLASS lcl DEFINITION DEFERRED.` was a second program (a
 * blocking error), its C01 a different copy of the same object, and both were
 * reported as includes nobody uploaded. Only `CLASS x DEFINITION PUBLIC` names
 * a global class — the rule an interface already followed.
 */

const enc = (text: string) => new TextEncoder().encode(text);
let seq = 0;
function file(name: string, text: string): OwnCodeFile {
  const bytes = enc(text);
  const { source, issues } = readSourceBytes(name, bytes);
  return { id: `l${++seq}`, name, bytes: bytes.length, zip: false, sources: source ? [source] : [], issues };
}

const MAIN = [
  'REPORT z_lcl_main.',
  'INCLUDE z_lcl_top.',
  'INCLUDE z_lcl_c01.',
  'START-OF-SELECTION.',
  '  NEW lcl_app( )->run( ).',
  '',
].join('\n');
const TOP = [
  'CLASS lcl_app DEFINITION DEFERRED.',
  'DATA go_app TYPE REF TO lcl_app.',
  'TABLES ekko.',
  '',
].join('\n');
const C01 = [
  '*----------------------------------------------------------------------*',
  '* CLASS lcl_app DEFINITION PUBLIC (only in a comment)',
  'CLASS lcl_app DEFINITION FINAL', // the statement spans two lines
  '  CREATE PUBLIC. " a local class, PUBLIC only as its CREATE addition',
  '  PUBLIC SECTION.',
  '    METHODS run.',
  'ENDCLASS.',
  'CLASS lcl_app IMPLEMENTATION.',
  '  METHOD run.',
  '    SELECT SINGLE * FROM ekko INTO @DATA(ls_ekko).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
].join('\n');

test.describe('a local class does not make an include a class', () => {
  test('a TOP include with CLASS … DEFINITION DEFERRED is an include', () => {
    expect(classifySource(TOP, 'Z_LCL_TOP.abap')).toEqual({ object: 'Z_LCL_TOP', role: 'include' });
    expect(classifySource('CLASS zcl_glob DEFINITION DEFERRED PUBLIC.\n', 'Z_X_TOP.abap')).toEqual({ object: 'Z_X_TOP', role: 'include' });
    expect(classifySource('CLASS zcl_glob DEFINITION LOAD.\n', 'Z_X_TOP.abap')).toEqual({ object: 'Z_X_TOP', role: 'include' });
  });

  test('an include with a local class definition and implementation is an include', () => {
    expect(classifySource(C01, 'Z_LCL_C01.abap')).toEqual({ object: 'Z_LCL_C01', role: 'include' });
    expect(classifySource('CLASS lcl_x DEFINITION.\nENDCLASS.\nCLASS lcl_x IMPLEMENTATION.\nENDCLASS.\n', 'Z_X_C01.abap'))
      .toEqual({ object: 'Z_X_C01', role: 'include' });
    expect(classifySource('CLASS lcl DEFINITION FINAL CREATE PRIVATE.\nENDCLASS.\n', 'Z_X_C02.abap'))
      .toEqual({ object: 'Z_X_C02', role: 'include' });
    expect(classifySource('CLASS lcl DEFINITION CREATE PUBLIC FINAL.\nENDCLASS.\n', 'Z_X_C03.abap'))
      .toEqual({ object: 'Z_X_C03', role: 'include' });
  });

  test('a /PUBLIC/ namespace in a local class header is no PUBLIC addition', () => {
    expect(classifySource('CLASS lcl_x DEFINITION INHERITING FROM /public/cl_base.\nENDCLASS.\n', 'Z_X_C04.abap'))
      .toEqual({ object: 'Z_X_C04', role: 'include' });
    expect(classifySource('CLASS lcl_y DEFINITION FINAL FRIENDS /PUBLIC/CL_FRIEND.\nENDCLASS.\n', 'Z_X_C05.abap'))
      .toEqual({ object: 'Z_X_C05', role: 'include' });
    // A global class whose base sits in that namespace is still global.
    expect(classifySource('CLASS zcl_z DEFINITION PUBLIC INHERITING FROM /public/cl_base.\nENDCLASS.\n', 'zcl_z.abap'))
      .toEqual({ object: 'ZCL_Z', role: 'class' });
  });

  test('LOCAL FRIENDS never counts, PUBLIC or not', () => {
    expect(classifySource('CLASS zcl_x DEFINITION LOCAL FRIENDS ltcl_x.\n', 'Z_X_FRIENDS.abap'))
      .toEqual({ object: 'Z_X_FRIENDS', role: 'include' });
    expect(classifySource('CLASS zcl_x DEFINITION LOCAL FRIENDS lcl_public.\n', 'Z_X_FRIENDS.abap'))
      .toEqual({ object: 'Z_X_FRIENDS', role: 'include' });
  });

  test('a comment that reads like a global class header counts for nothing', () => {
    expect(classifySource('* CLASS zcl_x DEFINITION PUBLIC.\n" CLASS zcl_y DEFINITION PUBLIC.\nDATA gv TYPE i.\n', 'Z_X_TOP.abap'))
      .toEqual({ object: 'Z_X_TOP', role: 'include' });
  });

  test('the upload joins the program: no second program, no duplicate, nothing missing', () => {
    const a = assembleOwnCode([file('z_lcl_main.abap', MAIN), file('Z_LCL_TOP.abap', TOP), file('Z_LCL_C01.abap', C01)]);
    const kinds = a.rows.flatMap((r) => r.issues.map((i) => i.kind));
    expect(kinds).not.toContain('second-program');
    expect(kinds).not.toContain('duplicate-different');
    expect(a.main?.object).toBe('Z_LCL_MAIN');
    expect(a.objects).toEqual(['Z_LCL_MAIN', 'Z_LCL_TOP', 'Z_LCL_C01']);
    expect(a.missing).toEqual([]);
    expect(assemblyReady(a)).toBe(true);
    const r = resolveIncludes({ 'z_lcl_main.abap': MAIN, 'Z_LCL_TOP.abap': TOP, 'Z_LCL_C01.abap': C01 });
    expect(r.source).toBe(a.source);
    expect(r.otherPrograms).toEqual([]);
    expect(r.duplicates).toEqual([]);
  });
});

test.describe('a global class is still a class', () => {
  test('CLASS … DEFINITION PUBLIC, with its additions in any order and over several lines', () => {
    expect(classifySource('CLASS zcl_x DEFINITION PUBLIC FINAL CREATE PUBLIC.\nENDCLASS.\n', 'zcl_x.abap'))
      .toEqual({ object: 'ZCL_X', role: 'class' });
    expect(classifySource('class zcl_y definition\n  inheriting from /abc/cl_base " the base\n  final\n  public\n  create private.\nendclass.\n', 'any.abap'))
      .toEqual({ object: 'ZCL_Y', role: 'class' });
    expect(classifySource('CLASS zcl_t DEFINITION ABSTRACT FOR TESTING PUBLIC RISK LEVEL HARMLESS DURATION SHORT.\nENDCLASS.\n', 'zcl_t.abap'))
      .toEqual({ object: 'ZCL_T', role: 'class' });
  });

  test('the global class wins over local classes defined before it in the same file', () => {
    const text = 'CLASS lcl_a DEFINITION DEFERRED.\nCLASS zcl_main DEFINITION PUBLIC CREATE PUBLIC.\nENDCLASS.\n';
    expect(classifySource(text, 'whatever.abap')).toEqual({ object: 'ZCL_MAIN', role: 'class' });
  });

  test('abapGit class files are read as before', () => {
    expect(classifySource('CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n', 'src/zcl_x.clas.abap'))
      .toEqual({ object: 'ZCL_X', role: 'class' });
    expect(classifySource('CLASS lcl_helper DEFINITION.\nENDCLASS.\n', 'src/zcl_x.clas.locals_imp.abap'))
      .toEqual({ object: 'ZCL_X.LOCALS_IMP', role: 'include' });
    expect(classifySource('CLASS ltcl_x DEFINITION FINAL FOR TESTING.\nENDCLASS.\n', 'src/zcl_x.clas.testclasses.abap'))
      .toEqual({ object: 'ZCL_X.TESTCLASSES', role: 'include' });
    expect(classifySource('INTERFACE zif_x PUBLIC.\nENDINTERFACE.\n', 'src/zif_x.intf.abap'))
      .toEqual({ object: 'ZIF_X', role: 'interface' });
    const r = resolveIncludes({
      'src/zcl_x.clas.abap': 'CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n',
      'src/zcl_x.clas.locals_imp.abap': 'CLASS lcl_helper DEFINITION.\nENDCLASS.\n',
    });
    expect(r.main?.object).toBe('ZCL_X');
    expect(r.otherPrograms).toEqual([]);
  });

  test('a report with a local class stays a program', () => {
    expect(classifySource('REPORT z_r.\nCLASS lcl DEFINITION.\nENDCLASS.\n', 'z_r.abap')).toEqual({ object: 'Z_R', role: 'program' });
  });
});
