import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  INCLUDE_OPEN_MARK,
  classifySource,
  joinedLineOf,
  locateSourceLine,
  objectNameOfFile,
  readIncludeAnchors,
  resolveIncludes,
} from '../lib/abap/include-resolution';
import { assembleOwnCode, readSourceBytes, type OwnCodeFile } from '../lib/own-code-import';
import { readZipSources } from '../lib/own-code-zip';
import { ownCodeIssueText } from '../lib/messages/own-code';
import { codeCardLabel } from '../lib/process-map';
import { assessCoverage } from '../lib/abap/coverage';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { ENGINE_READS_3021_FROM, engineReads3021Apply } from '../lib/abap/engine-reads-3021-gate';

/**
 * Roadmap 3.0.21 — a program read with its includes, and every line traced back
 * to the file it came from (owner decision 22.10.2026).
 *
 * The join was already in the own-code upload; what these specs hold is what
 * 3.0.21 adds to it: one pure function a batch can call, a way back from every
 * line of the analysed source to the include and line it came from — read off
 * the signed text itself, so no second record can drift from it — abapGit's
 * file names, and macros named "not expanded" where they are used.
 */

const ROOT = path.resolve(__dirname, '..');
const enc = (text: string) => new TextEncoder().encode(text);

const MAIN = ['REPORT z_demo_main.', 'INCLUDE z_demo_top.', 'START-OF-SELECTION.', '  PERFORM check_limit.', 'INCLUDE z_demo_f01.', 'INCLUDE z_demo_missing.', ''].join('\n');
const TOP = ['DATA gv_limit TYPE p DECIMALS 2.', 'TABLES ekko.', ''].join('\n');
const F01 = ['FORM check_limit.', '  SELECT SINGLE * FROM ekko WHERE ebeln = @gv_ebeln INTO @DATA(ls_ekko).', 'ENDFORM.', ''].join('\n');

let seq = 0;
function file(name: string, text: string): OwnCodeFile {
  const bytes = enc(text);
  const { source, issues } = readSourceBytes(name, bytes);
  return { id: `r${++seq}`, name, bytes: bytes.length, zip: false, sources: source ? [source] : [], issues };
}

test.describe('resolveIncludes: one pure call for a batch', () => {
  test('joins exactly as the own-code upload does, and names the missing include', () => {
    const files = { 'z_demo_main.abap': MAIN, 'Z_DEMO_TOP.abap': TOP, 'Z_DEMO_F01.abap': F01 };
    const r = resolveIncludes(files);
    const upload = assembleOwnCode(Object.entries(files).map(([n, t]) => file(n, t)));
    expect(r.source).toBe(upload.source);
    expect(r.main?.object).toBe('Z_DEMO_MAIN');
    expect(r.used).toEqual(['Z_DEMO_MAIN', 'Z_DEMO_TOP', 'Z_DEMO_F01']);
    expect(r.missing).toEqual(['Z_DEMO_MISSING']);
    expect(r.activatable).toBe(true);
    expect(r.anchors.joined).toBe(true);
  });

  test('a single file comes back byte for byte, with no map', () => {
    const text = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');
    const r = resolveIncludes(new Map([['Z_MM_PO_APPROVAL.abap', text]]));
    expect(r.source).toBe(text);
    expect(r.anchors.joined).toBe(false);
    expect(r.missing).toEqual(['Z_MM_PO_NOTIFY', 'Z_MM_PO_LOG']);
    // The way back for a single file is the identity.
    expect(locateSourceLine(r.anchors, 5)).toBeNull();
    expect(joinedLineOf(r.anchors, null, 5)).toBe(5);
    expect(joinedLineOf(r.anchors, 'Z_MM_PO_NOTIFY', 5)).toBeNull();
  });

  test('a main program named by the caller wins; a second program is left out and said', () => {
    const r = resolveIncludes({ 'A.abap': 'REPORT z_a.\nWRITE 1.\n', 'B.abap': 'REPORT z_b.\nWRITE 2.\n' }, 'B.abap');
    expect(r.main?.object).toBe('Z_B');
    expect(r.otherPrograms).toEqual(['Z_A']);
    expect(r.source).not.toContain('z_a');
  });

  test('loops and repeats make the join a program SAP would not activate', () => {
    const loop = resolveIncludes({ 'Z_MAIN.abap': 'REPORT z_main.\nINCLUDE z_a.\n', 'Z_A.abap': 'INCLUDE z_b.\n', 'Z_B.abap': 'INCLUDE z_a.\n' });
    expect(loop.activatable).toBe(false);
    expect(loop.cycles).toEqual([['Z_A', 'Z_B', 'Z_A']]);
    const twice = resolveIncludes({ 'Z_MAIN.abap': 'REPORT z_main.\nINCLUDE z_top.\nINCLUDE z_top.\n', 'Z_TOP.abap': 'DATA gv TYPE i.\n' });
    expect(twice.activatable).toBe(false);
    expect(twice.repeated).toEqual([{ in: 'Z_MAIN', name: 'Z_TOP', line: 3 }]);
  });
});

test.describe('the way back: every line of the analysed source to its file and line', () => {
  const r = resolveIncludes({ 'z_demo_main.abap': MAIN, 'Z_DEMO_TOP.abap': TOP, 'Z_DEMO_F01.abap': F01 });
  const lines = r.source.split('\n');
  const lineOf = (text: string) => lines.indexOf(text) + 1;

  test('an include line points at the include and its own line number', () => {
    expect(locateSourceLine(r.anchors, lineOf('TABLES ekko.'))).toEqual({ object: 'Z_DEMO_TOP', file: 'Z_DEMO_TOP.abap', line: 2, marker: false });
    expect(locateSourceLine(r.anchors, lineOf('ENDFORM.'))).toEqual({ object: 'Z_DEMO_F01', file: 'Z_DEMO_F01.abap', line: 3, marker: false });
  });

  test('a line of the main program keeps the number it has in its own file — the commented INCLUDE included', () => {
    expect(locateSourceLine(r.anchors, lineOf('*INCLUDE z_demo_top.'))).toEqual({ object: null, file: null, line: 2, marker: false });
    expect(locateSourceLine(r.anchors, lineOf('  PERFORM check_limit.'))).toMatchObject({ object: null, line: 4 });
    // The missing include is left as written, on the main program's own line 6.
    expect(locateSourceLine(r.anchors, lineOf('INCLUDE z_demo_missing.'))).toMatchObject({ object: null, line: 6 });
  });

  test('a marker line stands in no file and says so', () => {
    const marker = lines.findIndex((l) => l.startsWith(INCLUDE_OPEN_MARK)) + 1;
    expect(locateSourceLine(r.anchors, marker)).toMatchObject({ marker: true, line: 0, object: 'Z_DEMO_TOP' });
  });

  test('the other direction: an include line to the analysed source', () => {
    expect(joinedLineOf(r.anchors, 'Z_DEMO_F01', 3)).toBe(lineOf('ENDFORM.'));
    expect(joinedLineOf(r.anchors, 'z_demo_top', 1)).toBe(lineOf('DATA gv_limit TYPE p DECIMALS 2.'));
    expect(joinedLineOf(r.anchors, 'Z_DEMO_MAIN', 4, 'Z_DEMO_MAIN')).toBe(lineOf('  PERFORM check_limit.'));
    expect(joinedLineOf(r.anchors, 'Z_DEMO_MISSING', 1)).toBeNull();
    expect(joinedLineOf(r.anchors, 'Z_DEMO_F01', 99)).toBeNull();
  });

  test('every line is accounted for, and the parts count their files exactly', () => {
    expect(r.anchors.at.length).toBe(lines.length);
    const parts = Object.fromEntries(r.anchors.parts.map((p) => [p.object ?? 'main', p.lines]));
    expect(parts).toEqual({ main: MAIN.split('\n').length - 1, Z_DEMO_TOP: 2, Z_DEMO_F01: 3 });
  });

  test('markers that do not pair up are read as one file, never as a half-true map', () => {
    const broken = r.source.replace(/\*<<< Clean-Core\.io: end of include Z_DEMO_TOP/, '* removed by hand');
    expect(readIncludeAnchors(broken).joined).toBe(false);
  });

  test('a code card names the include and its line beside the analysed line', () => {
    const at = lineOf('ENDFORM.');
    expect(codeCardLabel('Z_DEMO_MAIN', { lineStart: at, lineEnd: at }, r.source)).toBe(
      `Z_DEMO_MAIN, line ${at} — include Z_DEMO_F01 (Z_DEMO_F01.abap), line 3`,
    );
    const from = lineOf('FORM check_limit.');
    expect(codeCardLabel('Z_DEMO_MAIN', { lineStart: from, lineEnd: at }, r.source)).toContain('include Z_DEMO_F01 (Z_DEMO_F01.abap), lines 1 to 3');
    // A range that crosses from one file into another keeps the analysed numbers only.
    expect(codeCardLabel('Z_DEMO_MAIN', { lineStart: 1, lineEnd: at }, r.source)).toBe(`Z_DEMO_MAIN, lines 1 to ${at}`);
    // A single file reads exactly as before.
    expect(codeCardLabel('Z_ONE', { lineStart: 3, lineEnd: 3 }, 'REPORT z_one.\nWRITE 1.\nWRITE 2.\n')).toBe('Z_ONE, line 3');
  });
});

test.describe('abapGit file names', () => {
  test('the object is read from the file name abapGit writes', () => {
    expect(objectNameOfFile('src/z_demo_top.prog.abap')).toBe('Z_DEMO_TOP');
    expect(objectNameOfFile('src/#cc#demo_f01.prog.abap')).toBe('/CC/DEMO_F01');
    expect(objectNameOfFile('src/zfoo.fugr.lzfootop.abap')).toBe('LZFOOTOP');
    expect(objectNameOfFile('src/zcl_x.clas.locals_imp.abap')).toBe('ZCL_X.LOCALS_IMP');
    // Not abapGit: as before.
    expect(objectNameOfFile('Z_DEMO_TOP.abap')).toBe('Z_DEMO_TOP');
  });

  test('a function group TOP include is the include the main program names, not the group', () => {
    expect(classifySource('FUNCTION-POOL zfoo.\nDATA gv TYPE i.\n', 'src/zfoo.fugr.lzfootop.abap')).toEqual({ object: 'LZFOOTOP', role: 'function-group' });
  });

  test('a class’s local classes are a part of it, never a second program', () => {
    const r = resolveIncludes({
      'src/zcl_x.clas.abap': 'CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n',
      'src/zcl_x.clas.locals_imp.abap': 'CLASS lcl_helper DEFINITION.\nENDCLASS.\nCLASS lcl_helper IMPLEMENTATION.\nENDCLASS.\n',
    });
    expect(r.main?.object).toBe('ZCL_X');
    expect(r.otherPrograms).toEqual([]);
    expect(r.unreferenced).toEqual(['ZCL_X.LOCALS_IMP']);
    expect(locateSourceLine(r.anchors, r.source.split('\n').indexOf('CLASS lcl_helper IMPLEMENTATION.') + 1)).toMatchObject({ object: 'ZCL_X.LOCALS_IMP', line: 3 });
  });

  test('an abapGit ZIP resolves its includes; its description files are counted, not listed as unread code', async () => {
    const zip = new JSZip();
    zip.file('src/z_demo_main.prog.abap', MAIN);
    zip.file('src/z_demo_main.prog.xml', '<abapGit/>');
    zip.file('src/z_demo_top.prog.abap', TOP);
    zip.file('src/z_demo_top.prog.xml', '<abapGit/>');
    zip.file('src/z_demo_f01.prog.abap', F01);
    zip.file('src/package.devc.xml', '<abapGit/>');
    zip.file('docs/readme.pdf', 'not code');
    const { sources, issues } = await readZipSources(await zip.generateAsync({ type: 'uint8array' }));
    expect(sources.map((s) => s.object).sort()).toEqual(['Z_DEMO_F01', 'Z_DEMO_MAIN', 'Z_DEMO_TOP']);
    expect(issues).toEqual([
      { kind: 'zip-skipped', names: ['docs/readme.pdf'] },
      { kind: 'zip-abapgit-metadata', count: 3 },
    ]);
    expect(ownCodeIssueText({ kind: 'zip-abapgit-metadata', count: 3 })).toContain('abapGit description files not read (3)');
    const a = assembleOwnCode([{ id: 'zip', name: 'export.zip', bytes: 1, zip: true, sources, issues }]);
    expect(a.missing).toEqual(['Z_DEMO_MISSING']);
    expect(a.objects).toEqual(['Z_DEMO_MAIN', 'Z_DEMO_TOP', 'Z_DEMO_F01']);
  });
});

test.describe('macros: named "not expanded" where they are used (engine 3.0.21)', () => {
  const SOURCE = [
    'REPORT z_macro.',
    'DATA gt_fcat TYPE lvc_t_fcat.',
    'DEFINE add_field.',
    "  APPEND VALUE #( fieldname = &1 ) TO gt_fcat.",
    '  add_inner &1.',
    'END-OF-DEFINITION.',
    'START-OF-SELECTION.',
    "  add_field 'MATNR'.",
    "  add_field: 'WERKS', 'LGORT'.",
    '',
  ].join('\n');

  test('the gate is 3.0.21', () => {
    expect(ENGINE_READS_3021_FROM).toBe('3.0.21');
    expect(engineReads3021Apply('v3.0.21')).toBe(true);
    expect(engineReads3021Apply('v3.0.20')).toBe(false);
    expect(engineReads3021Apply(null)).toBe(false);
  });

  test('without the option the report is exactly the earlier one — the definition alone', () => {
    const report = assessCoverage(SOURCE);
    const macros = report.unassessed.filter((u) => u.gap === 'macro');
    expect(macros).toEqual([
      {
        gap: 'macro',
        label: 'Macro definition',
        why: 'Macro bodies are expanded by the compiler, not by this engine, so any statement written inside one is invisible to every detector.',
        line: 3,
        snippet: 'DEFINE add_field',
      },
    ]);
  });

  test('with it, every use is listed with the line the macro is defined on, and the definition says what is read', () => {
    const report = assessCoverage(SOURCE, { macroUsesNamed: true });
    const macros = report.unassessed.filter((u) => u.gap === 'macro');
    expect(macros.map((m) => m.line)).toEqual([3, 8, 9]);
    expect(macros.every((m) => m.label === 'Macro not expanded')).toBe(true);
    expect(macros[0].why).toContain('read once, where they are written');
    expect(macros[1].why).toContain('uses the macro ADD_FIELD, defined at line 3');
    expect(macros[1].why).toContain('not here where they run');
    // The use inside the body is the nesting this engine does not follow, not a use.
    expect(macros.some((m) => m.line === 5)).toBe(false);
    // One gap, so the score's count of gaps does not move.
    expect(report.gaps.filter((g) => g.gap === 'macro')).toEqual([{ gap: 'macro', label: 'Macro not expanded', count: 3, firstLine: 3 }]);
  });

  test('the engine passes the option from 3.0.21 only; a run of 3.0.20 keeps what it signed', () => {
    const old = buildAbapEvidence(SOURCE, 'z_macro.abap', 'public', undefined, 'v3.0.20');
    const now = buildAbapEvidence(SOURCE, 'z_macro.abap', 'public', undefined, 'v3.0.21');
    expect(old.coverage?.unassessed.filter((u) => u.gap === 'macro').map((u) => u.line)).toEqual([3]);
    expect(now.coverage?.unassessed.filter((u) => u.gap === 'macro').map((u) => u.line)).toEqual([3, 8, 9]);
    expect(now.coverage?.gaps.length).toBe(old.coverage?.gaps.length);
  });
});
