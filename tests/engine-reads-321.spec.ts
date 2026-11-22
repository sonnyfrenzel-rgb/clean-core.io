/**
 * The readings of engine 3.2.1 (`ENGINE_READS_321_FROM`), each behind the version gate: a run of 3.2.0 or older
 * keeps the evidence it signed. Every source here is written for this spec; none is a benchmark case.
 *
 *   - ER-01: a string template whose embedded expression spans lines, with a `"` in its text on the last line, no
 *     longer swallows the rest of the source (`tokenize`, `multiLineTemplates`).
 *   - ER-02: a dynamic `CALL FUNCTION name` whose name the source closes is read as the call of that module
 *     (`resolveDynamicCalls`) — only where one value reaches the call on every path.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { tokenize } from '../lib/abap/declaration-parser';
import { readStatements } from '../lib/abap/statement-reader';
import { assessCoverage } from '../lib/abap/coverage';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { resolveDynamicCalls } from '../lib/abap/dynamic-call-resolution';
import { ENGINE_READS_321_FROM, engineReads321Apply } from '../lib/abap/engine-reads-321-gate';

const NEW = ENGINE_READS_321_FROM;
const OLD = '3.2.0';
const evidence = (code: string, engine: string) => buildAbapEvidence(code, 'ZT', 'public', undefined, engine);
const gaps = (code: string, engine: string) => evidence(code, engine).coverage.unassessed.map((u) => `${u.gap}@${u.line}`);
const found = (code: string, engine: string) => evidence(code, engine).findings.map((f) => `${f.kind}@${f.lineStart}:${f.objectName ?? ''}`);
const resolved = (code: string) => Object.fromEntries(
  [...resolveDynamicCalls(tokenize(code, { multiLineTemplates: true }))].map(([i, name]) => [tokenize(code, { multiLineTemplates: true })[i].line, name]),
);

test.describe('the gate', () => {
  test('3.2.1 and later carry the readings; 3.2.0, an earlier release, or no version, does not', () => {
    expect(ENGINE_READS_321_FROM).toBe('3.2.1');
    expect(engineReads321Apply('v3.2.1')).toBe(true);
    expect(engineReads321Apply('3.3.0')).toBe(true);
    expect(engineReads321Apply('v3.2.0')).toBe(false);
    expect(engineReads321Apply('3.1.0')).toBe(false);
    expect(engineReads321Apply(null)).toBe(false);
    expect(engineReads321Apply(undefined)).toBe(false);
  });
});

/** ER-01, the repro of the engine review: the `"` on line 5 is template text, not a comment. */
const TEMPLATE = [
  'REPORT zt.', //                                   1
  'DATA lv_fm TYPE c LENGTH 30.', //                 2
  'DATA(s) = |abc { COND string(', //               3
  "    WHEN lv_fm = 'B' THEN 'x'", //                4
  "    ELSE 'z' ) } end. \"|.", //                   5
  'CALL FUNCTION lv_fm.', //                         6
  "WRITE / 'list'.", //                              7
  'ROLLBACK WORK.', //                               8
].join('\n');

test.describe('ER-01: an embedded expression of a string template spans lines', () => {
  test('the statements are cut where readStatements and the language cut them', () => {
    const lines = (code: string, multiLineTemplates: boolean) => tokenize(code, { multiLineTemplates }).map((s) => s.line);
    // Before: the `"` on line 5 was taken for a comment, and lines 3 to 8 became one statement.
    expect(lines(TEMPLATE, false)).toEqual([1, 2]);
    expect(lines(TEMPLATE, true)).toEqual([1, 2, 3, 6, 7, 8]);
    expect(lines(TEMPLATE, true)).toEqual(readStatements(TEMPLATE).map((s) => s.lineStart));
    // The template keeps its text, the `"` included.
    expect(tokenize(TEMPLATE, { multiLineTemplates: true })[2].text).toContain('} end. "|');
  });

  test('the coverage no longer reports a source it never read as complete', () => {
    const before = assessCoverage(TEMPLATE);
    expect(before.complete).toBe(true);
    const after = assessCoverage(TEMPLATE, { multiLineTemplates: true });
    expect(after.complete).toBe(false);
    expect(after.unassessed.map((u) => `${u.gap}@${u.line}`)).toEqual(['dynamic-invocation@6', 'classic-list-output@7']);
  });

  test('gated: a run of 3.2.0 keeps its complete coverage, a run of 3.2.1 reads the rest of the file', () => {
    expect(evidence(TEMPLATE, OLD).coverage.complete).toBe(true);
    expect(gaps(TEMPLATE, OLD)).toEqual([]);
    expect(gaps(TEMPLATE, NEW)).toEqual(['dynamic-invocation@6', 'classic-list-output@7']);
  });

  test('a comment inside a multi-line embedded expression is still a comment', () => {
    const code = [
      'DATA(s) = |{ COND string( " which text', //   1
      "  WHEN a = 1 THEN 'x' ELSE 'y' ) }|.", //       2
      'COMMIT WORK.', //                                3
    ].join('\n');
    const read = tokenize(code, { multiLineTemplates: true });
    expect(read.map((s) => s.line)).toEqual([1, 3]);
    expect(read[0].text).not.toContain('which text');
  });

  test('a source without a multi-line template is cut exactly as before', () => {
    const code = [
      'REPORT zt.',
      'DATA(m) = |Say "hi". Then { lv_x } more.|. " a comment',
      "lv_y = 'a \"b'. \" another",
      'lv_price = 12.50.',
      '* a comment line',
      'lv_dev = ( lv_a - lv_b )',
      '  * 100.',
      'WRITE / m.',
    ].join('\n');
    expect(tokenize(code, { multiLineTemplates: true })).toEqual(tokenize(code));
  });
});

test.describe('ER-02: a dynamic CALL FUNCTION whose name the source closes', () => {
  /** The engine review's probe: a constant called directly, and one copied into a variable right before the call. */
  const CONSTANTS = [
    'REPORT zprobe.', //                                                             1
    "CONSTANTS c_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.", //                  2
    "CONSTANTS c_alv TYPE rs38l_fnam VALUE 'REUSE_ALV_GRID_DISPLAY'.", //           3
    'DATA lv_fm TYPE rs38l_fnam.', //                                                4
    'lv_fm = c_fm.', //                                                              5
    'CALL FUNCTION lv_fm.', //                                                       6
    'CALL FUNCTION c_alv.', //                                                       7
  ].join('\n');

  test('3.2.0 put the ALV finding on the CONSTANTS line and still listed the call as not determined', () => {
    expect(found(CONSTANTS, OLD)).toEqual(['classic-alv@3:REUSE_ALV_GRID_DISPLAY']);
    expect(gaps(CONSTANTS, OLD)).toEqual(['dynamic-invocation@6', 'dynamic-invocation@7']);
  });

  test('3.2.1 reads both calls as the literal calls: findings and catalog answer at the call, no dynamic gap', () => {
    expect(found(CONSTANTS, NEW)).toEqual([
      'classic-api@6:POPUP_TO_CONFIRM',
      'classic-alv@7:REUSE_ALV_GRID_DISPLAY',
    ]);
    // The ALV module is not in SAP's files, so it is a local call not assessed — as `CALL FUNCTION 'REUSE_…'` is.
    expect(gaps(CONSTANTS, NEW)).toEqual(['local-function-call@7']);
    expect(evidence(CONSTANTS, NEW).coverage.answered?.map((a) => `${a.name}@${a.line}`)).toEqual(['POPUP_TO_CONFIRM@6']);
  });

  test('the same evidence as the program that writes the names as literals', () => {
    const literal = CONSTANTS
      .replace('CALL FUNCTION lv_fm.', "CALL FUNCTION 'POPUP_TO_CONFIRM'.")
      .replace('CALL FUNCTION c_alv.', "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'.");
    expect(found(CONSTANTS, NEW)).toEqual(found(literal, NEW));
    expect(gaps(CONSTANTS, NEW)).toEqual(gaps(literal, NEW));
  });

  test('a DATA … VALUE the source never writes again, and a literal assigned right before the call', () => {
    const code = [
      'REPORT zt.', //                                                     1
      "DATA lv_popup TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.", //       2
      'DATA lv_conv TYPE rs38l_fnam.', //                                  3
      'START-OF-SELECTION.', //                                            4
      '  CALL FUNCTION lv_popup.', //                                      5
      "  lv_conv = 'CONVERSION_EXIT_ALPHA_INPUT'.", //                     6
      '  CLEAR lv_other.', //                                              7
      '  CALL FUNCTION lv_conv EXPORTING input = p_id IMPORTING output = lv_out.', // 8
    ].join('\n');
    expect(resolved(code)).toEqual({ 5: 'POPUP_TO_CONFIRM', 8: 'CONVERSION_EXIT_ALPHA_INPUT' });
    expect(gaps(code, NEW).filter((g) => g.startsWith('dynamic-invocation'))).toEqual([]);
    expect(gaps(code, OLD)).toEqual(['dynamic-invocation@5', 'dynamic-invocation@8']);
  });

  test('more than one value may reach the call: it stays dynamic', () => {
    const cases: Record<string, string[]> = {
      'assigned in a branch': [
        "DATA lv_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.",
        "IF p_x = 'X'. lv_fm = 'POPUP_TO_DECIDE'. ENDIF.",
        'CALL FUNCTION lv_fm.',
      ],
      'a branch between the assignment and the call': [
        'DATA lv_fm TYPE rs38l_fnam.',
        "lv_fm = 'POPUP_TO_CONFIRM'.",
        "IF p_x = 'X'.",
        'CALL FUNCTION lv_fm.',
        'ENDIF.',
      ],
      'reassigned in a loop after the call': [
        'DO 2 TIMES.',
        "  DATA lv_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.",
        '  CALL FUNCTION lv_fm.',
        "  lv_fm = 'POPUP_TO_DECIDE'.",
        'ENDDO.',
      ],
      'a parameter of the routine': [
        'FORM run USING lv_fm TYPE rs38l_fnam.',
        '  CALL FUNCTION lv_fm.',
        'ENDFORM.',
      ],
      'declared twice': [
        "DATA lv_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.",
        'FORM run.',
        "  DATA lv_fm TYPE rs38l_fnam VALUE 'POPUP_TO_DECIDE'.",
        '  CALL FUNCTION lv_fm.',
        'ENDFORM.',
      ],
      'passed to a routine that may change it': [
        "DATA lv_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.",
        'PERFORM pick CHANGING lv_fm.',
        'CALL FUNCTION lv_fm.',
      ],
      'assigned from a variable': [
        'lv_fm = lv_from_screen.',
        'CALL FUNCTION lv_fm.',
      ],
      'a structure component': [
        "CONSTANTS: BEGIN OF gc, fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM', END OF gc.",
        'CALL FUNCTION gc-fm.',
      ],
      'a remote call': [
        "CONSTANTS c_fm TYPE rs38l_fnam VALUE 'POPUP_TO_CONFIRM'.",
        "CALL FUNCTION c_fm DESTINATION 'NONE'.",
      ],
    };
    for (const [why, lines] of Object.entries(cases)) {
      const code = lines.join('\n');
      expect(resolved(code), why).toEqual({});
      expect(gaps(code, NEW).some((g) => g.startsWith('dynamic-invocation')), why).toBe(true);
    }
  });
});
