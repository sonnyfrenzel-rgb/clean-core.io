import { test, expect } from '@playwright/test';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { readDemoSwitches } from '../lib/abap/demo-switches';
import { readGoldenMaster } from '../lib/transformation/golden-master';

/**
 * Roadmap 3.0.17 item 8 (owner 17.10.2026, from an acceptance program): the
 * business rules counted the arms of the original's demo-case switch as rules
 * — 31 of the form "CASE p_case has 32 branches; this one is for 1" — and
 * business readers saw them in Analyze and the documentation. A branch of the
 * demo-case switch (the golden master's case routine) is demo data, not a
 * business rule.
 *
 * The test is on the shape, not on a program: a hand-written report with a
 * demo flag, a demo-case selection parameter, fixture routines, a baseline,
 * and a case routine with a `CASE` over the parameter — performed *after* the
 * flag test, which says no more than `IF p_demo <> 'X'. MESSAGE … ENDIF.`, so
 * the call structure alone (3.0.13) does not find it. Beside it, a genuine
 * business `CASE` over the document type, which must stay rules.
 *
 * Not vacuous: with `lib/abap/demo-switches.ts` as it was before this item,
 * the first two tests go red (the four arms stand among the rules, and there
 * is no `demoCases`).
 *
 * Pure: no server, no browser, no model.
 */

const SOURCE = `REPORT zfx_demo_case_shape.

TYPES: BEGIN OF ty_order,
         vbeln TYPE c LENGTH 10,
         auart TYPE c LENGTH 4,
         netwr TYPE p LENGTH 8 DECIMALS 2,
       END OF ty_order.

DATA: gt_orders TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY,
      gv_title  TYPE c LENGTH 80,
      gv_route  TYPE c LENGTH 10.

PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',
            p_case TYPE i DEFAULT 0.

START-OF-SELECTION.
  IF p_demo <> 'X'.
    MESSAGE 'This report runs on its own demo data only' TYPE 'E'.
  ENDIF.
  PERFORM build_demo.
  PERFORM apply_case.
  PERFORM route_orders.

FORM add_order USING iv_vbeln TYPE c iv_auart TYPE c iv_netwr TYPE c.
  DATA ls_order TYPE ty_order.
  ls_order-vbeln = iv_vbeln.
  ls_order-auart = iv_auart.
  ls_order-netwr = iv_netwr.
  APPEND ls_order TO gt_orders.
ENDFORM.

FORM build_demo.
  PERFORM add_order USING '0000000001' 'ZOR' '100.00'.
  PERFORM add_order USING '0000000002' 'ZRE' '40.00'.
  PERFORM add_order USING '0000000003' 'ZFD' '0.00'.
ENDFORM.

FORM apply_case.
  CASE p_case.
    WHEN 0.
      gv_title = 'Baseline: one order of each type'.
    WHEN 1.
      gv_title = 'A return without a standard order'.
      DELETE gt_orders WHERE auart = 'ZOR'.
    WHEN 2.
      gv_title = 'Two standard orders of one value'.
      PERFORM add_order USING '0000000004' 'ZOR' '100.00'.
    WHEN 3.
      gv_title = 'No orders at all'.
      CLEAR gt_orders.
  ENDCASE.
ENDFORM.

FORM route_orders.
  DATA ls_order TYPE ty_order.
  LOOP AT gt_orders INTO ls_order.
    CASE ls_order-auart.
      WHEN 'ZOR'.
        gv_route = 'STANDARD'.
      WHEN 'ZRE'.
        gv_route = 'RETURN'.
      WHEN 'ZFD'.
        gv_route = 'FREE'.
    ENDCASE.
    WRITE: / ls_order-vbeln, gv_route.
  ENDLOOP.
ENDFORM.
`;

const labels = (src: string) => deriveBusinessRules(src).rules.map((r) => r.label);

test.describe('the demo-case switch is demo data, not business rules (3.0.17 item 8)', () => {
  test('the golden master reads the shape: a CASE on the demo-case parameter in the case routine', () => {
    const gm = readGoldenMaster(SOURCE);
    expect(gm?.switchParameter).toBe('P_CASE');
    expect(gm?.caseRoutine.name).toBe('APPLY_CASE');
    expect(gm?.cases.map((c) => c.number)).toEqual([0, 1, 2, 3]);

    const demo = readDemoSwitches(SOURCE);
    expect(demo?.flag.name).toBe('P_DEMO');
    expect(demo?.selectors).toEqual(['P_CASE']);
    expect(demo?.routines).toEqual(['APPLY_CASE', 'BUILD_DEMO']);
    expect(demo?.cases.map((c) => ({ selector: c.selector, arms: c.arms, routine: c.routine }))).toEqual([
      { selector: 'P_CASE', arms: 4, routine: 'APPLY_CASE' },
    ]);
  });

  test('its arms are counted apart; the business CASE on the document type stays rules', () => {
    const set = deriveBusinessRules(SOURCE);
    const ruleLabels = set.rules.map((r) => r.label);
    expect(ruleLabels.filter((l) => /p_case/i.test(l))).toEqual([]);
    expect(ruleLabels).toEqual(expect.arrayContaining(["CASE ls_order-auart: 'ZOR'", "CASE ls_order-auart: 'ZRE'", "CASE ls_order-auart: 'ZFD'"]));
    expect(set.demoCases?.flag).toBe('P_DEMO');
    expect(set.demoCases?.rules.map((r) => r.label)).toEqual(['CASE p_case: 1', 'CASE p_case: 2', 'CASE p_case: 3']);
    expect(set.counts.rules).toBe(set.rules.length);
  });

  test('without a demo flag the same CASE on a number stays a rule (3.0.13 holds)', () => {
    const plain = SOURCE.replace(/p_demo/gi, 'p_full');
    expect(readDemoSwitches(plain)).toBeNull();
    expect(labels(plain)).toEqual(expect.arrayContaining(['CASE p_case: 1', 'CASE p_case: 2', 'CASE p_case: 3']));
  });

  test('a CASE on a parameter whose arms do not change demo data is no demo-case switch', () => {
    // The arms only set a value: the golden master reads no case switch, so the
    // arms stay rules even with a demo flag declared.
    const noData = SOURCE.replace(/DELETE gt_orders WHERE auart = 'ZOR'\.|PERFORM add_order USING '0000000004' 'ZOR' '100\.00'\.|CLEAR gt_orders\./g, "gv_route = 'X'.");
    expect(readGoldenMaster(noData)).toBeNull();
    expect(readDemoSwitches(noData)).toBeNull();
    expect(labels(noData).some((l) => /^CASE p_case/.test(l))).toBe(true);
  });
});
