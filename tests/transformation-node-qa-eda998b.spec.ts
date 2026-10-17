import { test, expect } from '@playwright/test';
import { guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';

/**
 * QA review of eda998b6b535, finding 9bdd914427a5 (high; roadmap 3.0.17 criterion 3): inside a loop,
 * `if (rc !== 0) break;` passed the authority-use check, and the protected work after the loop still ran. The exit
 * a body uses must be as strong as the original's handling of sy-subrc at that check: a refusal or a RETURN needs
 * return or throw; a CONTINUE (or CHECK, or EXIT inside the loop) also takes continue or break.
 * A synthetic snippet, not any acceptance program. Server-free.
 */

const source = (ending: string) =>
  [
    'REPORT z_cc_authority_loop.',
    'TYPES: BEGIN OF ty_item,',
    '         werks TYPE c LENGTH 4,',
    '         qty   TYPE i,',
    '       END OF ty_item.',
    'DATA: gt_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,',
    '      gv_done  TYPE i.',
    "PARAMETERS p_vkorg TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
    'START-OF-SELECTION.',
    '  PERFORM read_items.',
    '  PERFORM check_items.',
    'FORM read_items.',
    '  SELECT werks qty FROM zitem INTO TABLE gt_items WHERE vkorg = p_vkorg.',
    'ENDFORM.',
    'FORM check_items.',
    '  DATA ls_item TYPE ty_item.',
    '  LOOP AT gt_items INTO ls_item.',
    "    AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD ls_item-werks ID 'ACTVT' FIELD '03'.",
    '    IF sy-subrc <> 0.',
    `      ${ending}`,
    '    ENDIF.',
    '    gv_done = gv_done + 1.',
    '  ENDLOOP.',
    'ENDFORM.',
    '',
  ].join('\n');

function prep(ending: string): { p: EngineLedPrepared; why: (exit: string) => string | null; ends: string | undefined } {
  const src = source(ending);
  const p = prepareEngineLed({ source: src, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const line = src.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
  const unit = p.plan.units.find((u) => u.routine === 'CHECK_ITEMS')!;
  const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition))!;
  const entry = p.scaffold.authority?.[unit.id]?.find((e) => e.line === line);
  expect(entry?.fn, 'a WHERE value only the loop knows: the body writes the call').toBeNull();
  // The derived check as the body must call it, with a value that never decides anything here.
  const helperCall =
    guard.outcome === 'refuses'
      ? `const r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\n  if (r) return r;`
      : `if (${guard.helper}(sel, st, null, { sySubrc: 0 })) ${guard.outcome === 'skips' ? 'continue' : 'return'};`;
  const why = (exit: string) =>
    guardBodyOf(p)(
      unit.id,
      [
        'for (const ls of st.local.gtItems) {',
        `  const rc = authority_check(st, 'M_MATE_WRK', { 'WERKS': ls.werks, 'ACTVT': '03' }, ${line});`,
        `  if (rc !== 0) ${exit};`,
        `  ${helperCall}`,
        '  st.local.gvDone = st.local.gvDone + 1;',
        '}',
      ].join('\n'),
      [],
    );
  return { p, why, ends: entry?.ends };
}

const refusal = "return new Refusal([{ field: null, rule: 'AUTH', message: 'denied' }])";

test.describe('9bdd914427a5: an authority answer ends the path as strongly as the original does', () => {
  test('the original refuses (MESSAGE E): break and continue leave the work after the loop running — refused; return passes', () => {
    const { why, ends } = prep("MESSAGE 'No authorization' TYPE 'E'.");
    expect(ends).toBeUndefined();
    expect(why('break')).toContain('ignores its answer');
    expect(why('continue')).toContain('ignores its answer');
    expect(why(refusal)).toBeNull();
    expect(why("throw new Error('denied')")).toBeNull();
  });

  test('the original returns (RETURN in the loop): only return or throw', () => {
    const { why, ends } = prep('RETURN.');
    expect(ends).toBeUndefined();
    expect(why('break')).toContain('ignores its answer');
    expect(why('continue')).toContain('ignores its answer');
    expect(why('return')).toBeNull();
  });

  test('the original continues with the next record (CONTINUE): continue is the faithful port, break and return pass too', () => {
    const { why, ends } = prep('CONTINUE.');
    expect(ends).toBe('loop');
    expect(why('continue')).toBeNull();
    expect(why('break')).toBeNull();
    expect(why('return')).toBeNull();
    // An empty branch is still no use of the answer.
    expect(why('{}')).toContain('ignores its answer');
  });
});
