import { test, expect } from '@playwright/test';
import { guardBodyOf, prepareEngineLed } from '../lib/transformation/engine-led';

/**
 * QA review of 3cd7c2e2345c, finding a63075170a5e (high; roadmap 3.0.17 criterion 3): with `ends: 'loop'`, an
 * authority call inside a nested inner loop with `if (rc !== 0) continue;` skipped only the inner loop, and the
 * protected work after it still ran. A continue or break now counts only for the loop of the original check: the call
 * stands as deep in the body's loops as the check in the original's, and the jump stands in the same loops as the
 * call, aimed at the loop directly around it. A synthetic snippet, not any acceptance program. Server-free.
 */

const SOURCE = [
  'REPORT z_cc_authority_nested.',
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
  '      CONTINUE.',
  '    ENDIF.',
  '    gv_done = gv_done + 1.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
].join('\n');

test('a63075170a5e: a continue of an inner loop is refused; the flat loop of the original check keeps its continue', () => {
  const p = prepareEngineLed({ source: SOURCE, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const line = SOURCE.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
  const unit = p.plan.units.find((u) => u.routine === 'CHECK_ITEMS')!;
  const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition))!;
  expect(p.scaffold.authority?.[unit.id]).toEqual([expect.objectContaining({ line, ends: 'loop', loopDepth: 1 })]);
  const call = `authority_check(st, 'M_MATE_WRK', { 'WERKS': ls.werks, 'ACTVT': '03' }, ${line})`;
  const skip = `if (${guard.helper}(sel, st, null, { sySubrc: 0 })) continue;`;
  const why = (body: string[]) => guardBodyOf(p)(unit.id, body.join('\n'), []);

  // The faithful port: one loop, the check in it, continue with the next record.
  const flat = ['for (const ls of st.local.gtItems) {', `  const rc = ${call};`, '  if (rc !== 0) continue;', `  ${skip}`, '  st.local.gvDone = st.local.gvDone + 1;', '}'];
  expect(why(flat)).toBeNull();
  // A label on the loop around the call is the same loop.
  expect(why(['rows: for (const ls of st.local.gtItems) {', `  const rc = ${call};`, '  if (rc !== 0) continue rows;', `  ${skip}`, '  st.local.gvDone = st.local.gvDone + 1;', '}'])).toBeNull();

  for (const [label, body] of [
    [
      'the call in an inner loop: its continue leaves the work after the inner loop running',
      [
        'for (const ls of st.local.gtItems) {',
        '  for (const n of [1]) {',
        `    const rc = ${call};`,
        '    if (rc !== 0) continue;',
        '    void n;',
        '  }',
        `  ${skip}`,
        '  st.local.gvDone = st.local.gvDone + 1;',
        '}',
      ],
    ],
    [
      'the jump in a loop of its own inside the call\'s loop',
      [
        'for (const ls of st.local.gtItems) {',
        `  const rc = ${call};`,
        '  for (const n of [1]) {',
        '    if (rc !== 0) break;',
        '    void n;',
        '  }',
        `  ${skip}`,
        '  st.local.gvDone = st.local.gvDone + 1;',
        '}',
      ],
    ],
    [
      'a label that aims past the call\'s loop',
      [
        'outer: for (const x of [1]) {',
        '  for (const ls of st.local.gtItems) {',
        `    const rc = ${call};`,
        '    if (rc !== 0) continue outer;',
        `    ${skip}`,
        '    st.local.gvDone = st.local.gvDone + 1;',
        '  }',
        '  void x;',
        '}',
      ],
    ],
  ] as const) {
    expect(why([...body]), label).toContain('ignores its answer');
  }
});
