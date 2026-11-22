import { test, expect } from '@playwright/test';
import { INCLUDE_CLOSE_MARK, INCLUDE_OPEN_MARK, resolveIncludes } from '../lib/abap/include-resolution';
import { readUpload } from '../lib/engine4';
import { JOIN_CLOSE_MARK, JOIN_OPEN_MARK, classIncludeOf, hostOfStem, includeSuffixOf, isCustomerName } from '../lib/engine4/conventions';
import { layout, macrosFor, type UploadFile, type UploadLayout } from '../lib/engine4/layout';
import { runLayoutShadow } from '../scripts/engine4/shadow-layout';

/**
 * Engine 4.0, L3 upload layout (docs/design/engine4.md, "L3 step"): objects,
 * parts, reading order, missing includes and the macros every part sees, for
 * each way the product receives code. Server-free.
 */

const f = (name: string, ...lines: string[]): UploadFile => ({ name, source: `${lines.join('\n')}\n` });
const objectsOf = (l: UploadLayout) => l.objects.map((o) => `${o.type}:${o.name}${o.main ? '' : '(no main)'}`);
const orderOf = (l: UploadLayout, object?: string) => (object ? l.objects.find((o) => o.name === object)!.order : l.order.map((e) => e.part));
const codes = (l: UploadLayout) => l.diagnostics.map((d) => d.code);

test.describe('L3: conventions', () => {
  test('include suffixes, hosts and class includes', () => {
    expect(includeSuffixOf('ZREP_F01')).toEqual({ stem: 'ZREP', suffix: 'F01', role: 'forms' });
    expect(includeSuffixOf('LZFOOTOP')).toEqual({ stem: 'LZFOO', suffix: 'TOP', role: 'top' });
    expect(includeSuffixOf('LZFOOUXX')?.role).toBe('functionModules');
    expect(includeSuffixOf('MZPM_STOER_O01')?.role).toBe('pbo');
    expect(includeSuffixOf('ZREPORT')).toBeNull();
    expect(hostOfStem('LZFOO')).toEqual({ type: 'functionGroup', object: 'ZFOO', program: 'SAPLZFOO' });
    expect(hostOfStem('MZFOO')).toEqual({ type: 'program', object: 'SAPMZFOO', program: 'SAPMZFOO' });
    expect(hostOfStem('SAPMZFOO').object).toBe('SAPMZFOO');
    expect(hostOfStem('ZXQQM')).toEqual({ type: 'functionGroup', object: 'XQQM', program: 'SAPLXQQM' });
    expect(hostOfStem('ZREP')).toEqual({ type: 'program', object: 'ZREP', program: 'ZREP' });
    expect(classIncludeOf('ZCL_X=========CCDEF')).toEqual({ object: 'ZCL_X', role: 'classLocalDefinitions' });
    expect(classIncludeOf('ZCL_X_CCIMP')).toEqual({ object: 'ZCL_X', role: 'classLocalImplementations' });
    expect(classIncludeOf('ZCL_X.LOCALS_DEF')).toEqual({ object: 'ZCL_X', role: 'classLocalDefinitions' });
    expect(classIncludeOf('ZCL_X=====CM001')?.role).toBe('classMethod');
    expect(classIncludeOf('ZCL_X_CU')).toBeNull();
    expect([isCustomerName('ZFOO_TOP'), isCustomerName('LZFOOTOP'), isCustomerName('SAPMZFOO'), isCustomerName('/ABC/FOO'), isCustomerName('DBPNPMAC'), isCustomerName('MV45AFZZ')])
      .toEqual([true, true, true, true, false, false]);
  });

  test('the join markers are the shipping join\'s', () => {
    expect([JOIN_OPEN_MARK, JOIN_CLOSE_MARK]).toEqual([INCLUDE_OPEN_MARK, INCLUDE_CLOSE_MARK]);
  });
});

test.describe('L3: one pasted source', () => {
  test('a report is one program, named by its header', () => {
    const l = layout([f('paste.abap', 'REPORT zdemo.', 'WRITE 1.')]);
    expect(objectsOf(l)).toEqual(['program:ZDEMO']);
    expect(orderOf(l)).toEqual(['ZDEMO']);
    expect(l.primary).toBe('ZDEMO');
    expect(l.activatable).toBe(true);
  });

  test('a fragment without a header stands alone', () => {
    const l = layout([f('snippet.txt', 'SELECT * FROM mara INTO TABLE @DATA(lt).')]);
    expect(objectsOf(l)).toEqual(['include:SNIPPET']);
    expect(l.diagnostics).toEqual([]);
  });

  test('a pasted global class is a class; a pasted function module a function module', () => {
    expect(objectsOf(layout([f('x.abap', 'CLASS zcl_a DEFINITION PUBLIC.', 'ENDCLASS.', 'CLASS zcl_a IMPLEMENTATION.', 'ENDCLASS.')]))).toEqual(['class:ZCL_A']);
    expect(objectsOf(layout([f('x.abap', 'FUNCTION z_fm.', 'ENDFUNCTION.')]))).toEqual(['functionModule:Z_FM']);
  });

  test('a source the product joined is cut back into its files, INCLUDEs restored', () => {
    const files = {
      'zrep.abap': 'REPORT zrep.\nINCLUDE zrep_top.\nINCLUDE zrep_f01.\nSTART-OF-SELECTION.\n  PERFORM run.\n',
      'zrep_top.abap': 'DATA gv TYPE i.\n',
      'zrep_f01.abap': 'FORM run.\n  gv = 1.\nENDFORM.\n',
    };
    const joined = resolveIncludes(files).source;
    expect(joined).toContain(INCLUDE_OPEN_MARK);
    const fromFiles = layout(Object.entries(files).map(([name, source]) => ({ name, source })));
    const fromJoined = layout([{ name: 'legacyCode', source: joined }]);
    expect(codes(fromJoined)).toEqual(['joined-source']);
    expect(orderOf(fromJoined)).toEqual(orderOf(fromFiles));
    expect(fromJoined.parts.map((p) => p.source)).toEqual(fromFiles.parts.map((p) => p.source));
    const f01 = fromJoined.parts.find((p) => p.name === 'ZREP_F01')!;
    const joinedLines = joined.split('\n');
    expect(f01.lineMap!.map((row) => joinedLines[row - 1])).toEqual(['FORM run.', '  gv = 1.', 'ENDFORM.']);
  });

  test('markers that do not pair up leave the source one file', () => {
    const l = layout([f('x.abap', 'REPORT z.', `${INCLUDE_OPEN_MARK} ZA · za.abap`, 'WRITE 1.')]);
    expect(l.parts).toHaveLength(1);
  });
});

test.describe('L3: a report and its includes', () => {
  const report = [
    f('zrep.abap', 'REPORT zrep.', '* INCLUDE zrep_old.', 'INCLUDE: zrep_top, zrep_sel.', 'INCLUDE zrep_f01.', 'DATA ls TYPE zstr.', 'INCLUDE STRUCTURE zs.'),
    f('zrep_f01.abap', 'FORM a.', 'ENDFORM.'),
    f('zrep_sel.abap', 'PARAMETERS p TYPE i.'),
    f('zrep_top.abap', 'DATA gv TYPE i.'),
  ];

  test('the order is where the INCLUDE statements stand; a chain is two includes, a comment and INCLUDE STRUCTURE none', () => {
    const l = layout(report);
    expect(objectsOf(l)).toEqual(['program:ZREP']);
    expect(orderOf(l)).toEqual(['ZREP', 'ZREP_TOP', 'ZREP_SEL', 'ZREP_F01']);
    expect(l.parts.find((p) => p.name === 'ZREP_TOP')).toMatchObject({ role: 'top', how: 'include' });
    expect(l.objects[0].missing).toEqual([]);
  });

  test('the order does not depend on the order of the files', () => {
    expect(orderOf(layout([...report].reverse()))).toEqual(orderOf(layout(report)));
  });

  test('a missing customer include is a warning, an SAP include and IF FOUND are info', () => {
    const l = layout([f('zrep.abap', 'REPORT zrep.', 'INCLUDE zrep_top.', 'INCLUDE dbpnpmac.', 'INCLUDE zrep_opt IF FOUND.')]);
    expect(l.objects[0].missing).toEqual([
      { name: 'ZREP_TOP', from: 'ZREP', row: 2, optional: false, customer: true },
      { name: 'DBPNPMAC', from: 'ZREP', row: 3, optional: false, customer: false },
      { name: 'ZREP_OPT', from: 'ZREP', row: 4, optional: true, customer: true },
    ]);
    expect(l.diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual(['missing-include:warning', 'missing-sap-include:info', 'missing-include:info']);
  });

  test('a loop and a second INCLUDE are errors, and every part is still read once', () => {
    const l = layout([
      f('zrep.abap', 'REPORT zrep.', 'INCLUDE za.', 'INCLUDE za.'),
      f('za.abap', 'INCLUDE zb.'),
      f('zb.abap', 'INCLUDE za.'),
    ]);
    expect(orderOf(l)).toEqual(['ZREP', 'ZA', 'ZB']);
    expect(codes(l).sort()).toEqual(['include-cycle', 'include-repeated']);
    expect(l.activatable).toBe(false);
  });

  test('an include nobody names is read after the program, by its role, and said so', () => {
    const l = layout([f('zrep.abap', 'REPORT zrep.', 'INCLUDE zrep_top.'), f('zrep_top.abap', 'DATA a.'), f('zrep_f02.abap', 'FORM b.', 'ENDFORM.')]);
    expect(orderOf(l)).toEqual(['ZREP', 'ZREP_TOP', 'ZREP_F02']);
    expect(codes(l)).toEqual(['not-referenced']);
  });

  test('a TOP that declares a local class DEFERRED stays the TOP (the shipping join agrees since 07cf0e32)', () => {
    const files = [f('zrep.abap', 'REPORT zrep.', 'INCLUDE zrep_top.', 'INCLUDE zrep_c01.'), f('zrep_top.abap', 'CLASS lcl DEFINITION DEFERRED.', 'DATA go TYPE REF TO lcl.'), f('zrep_c01.abap', 'CLASS lcl DEFINITION.', 'ENDCLASS.', 'CLASS lcl IMPLEMENTATION.', 'ENDCLASS.')];
    const l = layout(files);
    expect(orderOf(l)).toEqual(['ZREP', 'ZREP_TOP', 'ZREP_C01']);
    expect(l.objects[0].missing).toEqual([]);
    expect(resolveIncludes(Object.fromEntries(files.map((x) => [x.name, x.source]))).missing).toEqual([]);
  });

  test('two copies of one include: the first is read, the second reported', () => {
    const l = layout([f('zrep.abap', 'REPORT zrep.', 'INCLUDE za.'), f('za.abap', 'DATA a.'), f('sub/za.abap', 'DATA b.')]);
    expect(l.parts.find((p) => p.name === 'ZA')!.file).toBe('za.abap');
    expect(codes(l)).toEqual(['duplicate-part']);
  });

  test('a file that is no source is left out with a note', () => {
    const l = layout([f('zrep.abap', 'REPORT zrep.'), f('zrep.prog.xml', '<asx/>')]);
    expect(l.parts).toHaveLength(1);
    expect(codes(l)).toEqual(['not-source']);
  });
});

test.describe('L3: several objects in one upload', () => {
  test('a report and a global class as two plain files are two objects, the report first (review §5 #8)', () => {
    const files = [f('zcl_calc.abap', 'CLASS zcl_calc DEFINITION PUBLIC.', 'ENDCLASS.', 'CLASS zcl_calc IMPLEMENTATION.', 'ENDCLASS.'), f('zrun.abap', 'REPORT zrun.', 'START-OF-SELECTION.')];
    const l = layout(files);
    expect(objectsOf(l)).toEqual(['program:ZRUN', 'class:ZCL_CALC']);
    expect(l.primary).toBe('ZRUN');
    expect(orderOf(l)).toEqual(['ZRUN', 'ZCL_CALC']);
    expect(resolveIncludes(Object.fromEntries(files.map((x) => [x.name, x.source]))).otherPrograms).toEqual(['ZRUN']);
  });

  test('a function module file joins the only function group of the upload; with two groups it stays alone', () => {
    const top = f('lzfootop.abap', 'FUNCTION-POOL zfoo.', 'DEFINE set_status.', '  gv = &1.', 'END-OF-DEFINITION.');
    const fm = f('z_idoc_input.abap', 'FUNCTION z_idoc_input.', '  set_status 53.', 'ENDFUNCTION.');
    const one = layout([fm, top, f('lzfoof01.abap', 'FORM x.', 'ENDFORM.')]);
    expect(objectsOf(one)).toEqual(['functionGroup:ZFOO(no main)']);
    expect(orderOf(one)).toEqual(['LZFOOTOP', 'Z_IDOC_INPUT', 'LZFOOF01']);
    expect(one.parts.find((p) => p.name === 'Z_IDOC_INPUT')).toMatchObject({ role: 'functionModule', how: 'onlyGroup' });
    expect(macrosFor(one, 'Z_IDOC_INPUT')).toContain('SET_STATUS');
    const two = layout([fm, top, f('lzbartop.abap', 'FUNCTION-POOL zbar.')]);
    expect(objectsOf(two)).toEqual(['functionGroup:ZBAR(no main)', 'functionGroup:ZFOO(no main)', 'functionModule:Z_IDOC_INPUT']);
  });
});

test.describe('L3: function groups', () => {
  test('without SAPL…: TOP, local classes, function modules, routines, PBO, PAI', () => {
    const l = layout([
      f('lzrmaf01.abap', 'FORM a.', 'ENDFORM.'),
      f('lzrmai01.abap', 'MODULE pai INPUT.', 'ENDMODULE.'),
      f('lzrmao01.abap', 'MODULE pbo OUTPUT.', 'ENDMODULE.'),
      f('lzrmau01.abap', 'FUNCTION z_rma.', 'ENDFUNCTION.'),
      f('lzrmac01.abap', 'CLASS lcl DEFINITION.', 'ENDCLASS.'),
      f('lzrmatop.abap', 'FUNCTION-POOL zrma.'),
    ]);
    expect(objectsOf(l)).toEqual(['functionGroup:ZRMA(no main)']);
    expect(orderOf(l)).toEqual(['LZRMATOP', 'LZRMAC01', 'LZRMAU01', 'LZRMAF01', 'LZRMAO01', 'LZRMAI01']);
    expect(codes(l)).toEqual(['missing-main']);
    expect(l.parts.find((p) => p.name === 'LZRMAU01')!.defines).toEqual([{ kind: 'function', name: 'Z_RMA', row: 1, global: true }]);
  });

  test('abapGit: SAPL… reads TOP and UXX; the function module files stand where UXX would', () => {
    const l = layout([
      f('src/zfoo.fugr.saplzfoo.abap', 'INCLUDE lzfootop.', 'INCLUDE lzfoouxx.', 'INCLUDE lzfoof01.'),
      f('src/zfoo.fugr.lzfootop.abap', 'FUNCTION-POOL zfoo.'),
      f('src/zfoo.fugr.lzfoof01.abap', 'FORM a.', 'ENDFORM.'),
      f('src/zfoo.fugr.z_b.abap', 'FUNCTION z_b.', 'ENDFUNCTION.'),
      f('src/zfoo.fugr.z_a.abap', 'FUNCTION z_a.', 'ENDFUNCTION.'),
      f('src/zfoo.fugr.xml', '<asx/>'),
    ]);
    expect(objectsOf(l)).toEqual(['functionGroup:ZFOO']);
    expect(orderOf(l)).toEqual(['SAPLZFOO', 'LZFOOTOP', 'Z_A', 'Z_B', 'LZFOOF01']);
    expect(l.parts.find((p) => p.name === 'SAPLZFOO')!.includes.map((r) => r.state)).toEqual(['resolved', 'generated', 'resolved']);
    expect(l.objects[0].missing).toEqual([]);
  });

  test('a customer exit: the exit function module reads its ZX include; alone, the include belongs to SAP\'s exit group', () => {
    const withFm = layout([f('exit_sapmiwo0_020.abap', 'FUNCTION exit_sapmiwo0_020.', '  INCLUDE zxqqmu20.', 'ENDFUNCTION.'), f('zxqqmu20.abap', 'e_x = 1.')]);
    expect(objectsOf(withFm)).toEqual(['functionModule:EXIT_SAPMIWO0_020']);
    expect(orderOf(withFm)).toEqual(['EXIT_SAPMIWO0_020', 'ZXQQMU20']);
    expect(objectsOf(layout([f('zxqqmu20.abap', 'e_x = 1.'), f('zrep.abap', 'REPORT zrep.')]))).toEqual(['program:ZREP', 'functionGroup:XQQM(no main)']);
  });
});

test.describe('L3: module pools and classes', () => {
  test('a module pool: SAPM… reads its M… includes; without it the TOP with PROGRAM is the TOP, not the main', () => {
    const parts = [
      f('mzdemotop.abap', 'PROGRAM sapmzdemo.', 'DATA ok_code TYPE sy-ucomm.'),
      f('mzdemoi01.abap', 'MODULE user_command_0100 INPUT.', 'ENDMODULE.'),
      f('mzdemoo01.abap', 'MODULE status_0100 OUTPUT.', 'ENDMODULE.'),
    ];
    const withMain = layout([f('sapmzdemo.abap', 'INCLUDE mzdemotop.', 'INCLUDE mzdemoo01.', 'INCLUDE mzdemoi01.'), ...parts]);
    expect(objectsOf(withMain)).toEqual(['program:SAPMZDEMO']);
    expect(orderOf(withMain)).toEqual(['SAPMZDEMO', 'MZDEMOTOP', 'MZDEMOO01', 'MZDEMOI01']);
    const without = layout(parts);
    expect(objectsOf(without)).toEqual(['program:SAPMZDEMO(no main)']);
    expect(orderOf(without)).toEqual(['MZDEMOTOP', 'MZDEMOO01', 'MZDEMOI01']);
  });

  test('abapGit class: local definitions and macros before the class, local implementations and tests after', () => {
    const l = layout([
      f('zcl_x.clas.testclasses.abap', 'CLASS ltc DEFINITION FOR TESTING.', 'ENDCLASS.'),
      f('zcl_x.clas.locals_imp.abap', 'CLASS lcl IMPLEMENTATION.', 'ENDCLASS.'),
      f('zcl_x.clas.macros.abap', 'DEFINE log.', '  WRITE &1.', 'END-OF-DEFINITION.'),
      f('zcl_x.clas.abap', 'CLASS zcl_x DEFINITION PUBLIC.', 'ENDCLASS.', 'CLASS zcl_x IMPLEMENTATION.', '  METHOD m.', '    log 1.', '  ENDMETHOD.', 'ENDCLASS.'),
      f('zcl_x.clas.locals_def.abap', 'CLASS lcl DEFINITION.', 'ENDCLASS.'),
    ]);
    expect(objectsOf(l)).toEqual(['class:ZCL_X']);
    expect(orderOf(l)).toEqual(['ZCL_X.LOCALS_DEF', 'ZCL_X.MACROS', 'ZCL_X', 'ZCL_X.LOCALS_IMP', 'ZCL_X.TESTCLASSES']);
    const read = readUpload(l.parts.map((p) => ({ name: p.file, source: p.source })));
    const main = read.parts.find((p) => p.part === 'ZCL_X')!;
    expect(main.statements.map((s) => s.kind)).toContain('MacroCall');
  });

  test('a class pool by SAP\'s include names: CP reads CCDEF, CU, CCMAC and CCIMP, padding aside', () => {
    const l = layout([
      f('ZCL_Y=========CP.abap', 'CLASS-POOL.', 'INCLUDE zcl_y=========ccdef.', 'INCLUDE zcl_y=========cu.', 'INCLUDE zcl_y=========ccmac.', 'INCLUDE zcl_y=========ccimp.'),
      f('ZCL_Y=====CU.abap', 'CLASS zcl_y DEFINITION PUBLIC.', 'ENDCLASS.'),
      f('ZCL_Y=========CCDEF.abap', 'CLASS lcl DEFINITION.', 'ENDCLASS.'),
      f('ZCL_Y=========CCIMP.abap', 'CLASS lcl IMPLEMENTATION.', 'ENDCLASS.'),
    ]);
    expect(objectsOf(l)).toEqual(['class:ZCL_Y']);
    expect(orderOf(l)).toEqual(['ZCL_Y=========CP', 'ZCL_Y=========CCDEF', 'ZCL_Y=====CU', 'ZCL_Y=========CCIMP']);
    expect(l.objects[0].missing.map((m) => m.name)).toEqual(['ZCL_Y=========CCMAC']);
  });

  test('plain-named local parts of a class (…_CCDEF, …_LHC) belong to the class', () => {
    const l = layout([
      f('zbp_i_x.abap', 'CLASS zbp_i_x DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zi_x.', 'ENDCLASS.', 'CLASS zbp_i_x IMPLEMENTATION.', 'ENDCLASS.'),
      f('zbp_i_x_lhc.abap', 'CLASS lhc_x DEFINITION INHERITING FROM cl_abap_behavior_handler.', 'ENDCLASS.'),
      f('zbp_i_x_ccdef.abap', 'TYPES ty TYPE i.'),
    ]);
    expect(objectsOf(l)).toEqual(['class:ZBP_I_X']);
    expect(orderOf(l)).toEqual(['ZBP_I_X_CCDEF', 'ZBP_I_X', 'ZBP_I_X_LHC']);
    expect(l.parts.find((p) => p.name === 'ZBP_I_X_LHC')!.how).toBe('prefix');
  });
});

test.describe('L3: macros for L1', () => {
  test('a macro defined in the TOP is known in every include of the program, not in another object', () => {
    const r = readUpload([
      f('zrep.abap', 'REPORT zrep.', 'INCLUDE zrep_top.', 'INCLUDE zrep_f01.'),
      f('zrep_top.abap', 'DEFINE add_line.', '  APPEND &1 TO gt.', 'END-OF-DEFINITION.'),
      f('zrep_f01.abap', 'FORM a.', '  add_line 1.', 'ENDFORM.'),
      f('zcl_o.abap', 'CLASS zcl_o DEFINITION PUBLIC.', 'ENDCLASS.', 'CLASS zcl_o IMPLEMENTATION.', '  METHOD m.', '    add_line 1.', '  ENDMETHOD.', 'ENDCLASS.'),
    ]);
    const kinds = (part: string) => r.parts.find((p) => p.part === part)!.statements.map((s) => s.kind);
    expect(kinds('ZREP_F01')).toContain('MacroCall');
    expect(kinds('ZCL_O')).toContain('Unknown');
  });

  test('RP_PROVIDE_FROM_LAST is an HR system macro when the program reads the HR logical database', () => {
    const hr = readUpload([f('source.abap', 'REPORT zpy.', 'TABLES: pernr.', 'NODES: peras.', 'INFOTYPES: 0009.', 'GET peras.', '  rp_provide_from_last p0009 space pn-begda pn-endda.')]);
    expect(hr.layout.objects[0].systemMacros).toContainEqual({ name: 'RP_PROVIDE_FROM_LAST', from: 'hrLogicalDatabase' });
    expect(hr.parts[0].statements.at(-1)!.kind).toBe('MacroCall');
    const plain = readUpload([f('source.abap', 'REPORT zpy.', 'INFOTYPES: 0009.', 'rp_provide_from_last p0009 space a b.')]);
    expect(plain.parts[0].statements.at(-1)!.kind).toBe('Unknown');
    const trmac = readUpload([f('source.abap', 'REPORT zpy.', 'rp-provide-from-last p0009 space a b.')]);
    expect(trmac.parts[0].statements.at(-1)!.kind).toBe('MacroCall');
  });

  test('the upload\'s own DEFINE wins over a system macro of the same name', () => {
    const l = layout([f('x.abap', 'REPORT z.', 'TABLES pernr.', 'DEFINE rp_provide_from_last.', 'END-OF-DEFINITION.')]);
    expect(l.objects[0].systemMacros.map((m) => m.name)).not.toContain('RP_PROVIDE_FROM_LAST');
    expect(l.objects[0].macros).toContain('RP_PROVIDE_FROM_LAST');
  });
});

/**
 * The shadow against the shipping upload path on the starter examples and the
 * benchmark learn halves (never the holdout). Floors are the numbers of
 * 15.11.2026; every difference has a named category.
 */
test('L3 reads every uploaded file, explains every difference from the shipping join, and leaves no macro call unknown', () => {
  const r = runLayoutShadow();
  expect(r.uploads).toBeGreaterThanOrEqual(157);
  expect(r.l3Read).toBe(r.files);
  expect(r.mainAgree).toBeGreaterThanOrEqual(128);
  expect(r.joinOrderAgree).toBeGreaterThanOrEqual(133);
  expect(r.missingAgree).toBeGreaterThanOrEqual(147);
  expect(r.unknown.l3).toBe(0);
  expect(r.macroCalls.l3).toBeGreaterThanOrEqual(r.macroCalls.perCase);
  const unexplained = Object.keys(r.categories).filter((k) => k.endsWith('unexplained'));
  expect(unexplained, JSON.stringify(unexplained.map((k) => r.samples[k]), null, 1)).toEqual([]);
});
