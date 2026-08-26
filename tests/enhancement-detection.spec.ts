/**
 * A5: coverage for the enhancement / modification detectors.
 *
 * These exist because the D grade is described as covering "modifications and
 * implicit enhancements" — a claim the engine could not previously back, since
 * none of its evidence kinds detected them. The clean core level concept turns
 * on which extension technology was used, and SAP's ATC check "Allowed
 * Enhancement Technologies" checks exactly this.
 *
 * The modification case matters most: markers are full-line comments, which
 * tokenize() drops by design, so they need the raw-source pass. A regression
 * there would silently hide the single most severe violation.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';

const kinds = (code: string) => buildAbapEvidence(code, 'ZTEST', 'private').findings;
const of = (code: string, kind: string) => kinds(code).filter((f) => f.kind === kind);

test.describe('enhancement technology detection', () => {
  test('flags an enhancement implementation as a not-recommended technology', () => {
    const found = of(
      `ENHANCEMENT 1 Z_SALES_ORDER_CHECK.
         DATA lv_flag TYPE abap_bool.
       ENDENHANCEMENT.`,
      'enhancement',
    );
    expect(found).toHaveLength(1);
    expect(found[0].objectName).toBe('Z_SALES_ORDER_CHECK');
    expect(found[0].objectType).toBe('Enhancement Implementation');
    expect(found[0].severity).toBe('High');
  });

  test('flags enhancement points and sections', () => {
    const points = of(`ENHANCEMENT-POINT ep_check SPOTS es_sales.`, 'enhancement');
    expect(points).toHaveLength(1);
    expect(points[0].objectType).toBe('Enhancement Point');

    const sections = of(`ENHANCEMENT-SECTION es_calc SPOTS es_sales.`, 'enhancement');
    expect(sections).toHaveLength(1);
    expect(sections[0].objectType).toBe('Enhancement Section');
  });

  test('reports BAdI usage as level B, not as a blocker', () => {
    const found = of(`GET BADI lo_handle.`, 'enhancement');
    expect(found).toHaveLength(1);
    expect(found[0].objectType).toBe('BAdI');
    // A BAdI is an SAP-provided extension point — it must not be reported at
    // the same severity as an enhancement implementation.
    expect(found[0].severity).toBe('Low');
    expect(found[0].cleanCoreImpact).toContain('level B');
  });

  test('detects the classic exit handler', () => {
    const found = of(
      `CALL METHOD cl_exithandler=>get_instance EXPORTING exit_name = 'BADI_X'.`,
      'enhancement',
    );
    expect(found).toHaveLength(1);
    expect(found[0].objectName).toBe('CL_EXITHANDLER');
  });
});

test.describe('core modification detection', () => {
  // Markers are comments, so this is the regression guard for the raw-source pass.
  const modified = `REPORT zmod.
*{   INSERT         DEVK900123                                        1
  WRITE 'custom line'.
*}   INSERT
  WRITE 'standard line'.`;

  test('finds a modification marker that the tokenizer drops', () => {
    const found = of(modified, 'modification');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('Critical');
    expect(found[0].objectName).toBe('DEVK900123');
    expect(found[0].needsBusinessDecision).toBe(true);
  });

  test('counts one finding per modification, not per marker line', () => {
    // Opening and closing marker carry the same transport request.
    expect(of(modified, 'modification')).toHaveLength(1);
  });

  test('recognises REPLACE and DELETE markers too', () => {
    expect(of(`*{   REPLACE       DEVK900456                    1`, 'modification')).toHaveLength(1);
    expect(of(`*{   DELETE        DEVK900789                    1`, 'modification')).toHaveLength(1);
  });

  test('does not fire on ordinary comments or code', () => {
    const clean = `REPORT zclean.
* just a comment about INSERT statements
  INSERT ztable FROM ls_row.`;
    expect(of(clean, 'modification')).toHaveLength(0);
  });
});

test.describe('routing and score react to the new evidence', () => {
  test('a modification dominates the rationale and costs the most score', () => {
    const evidence = buildAbapEvidence(
      `REPORT zmod.
*{   INSERT         DEVK900123                                        1
  WRITE 'x'.
*}   INSERT`,
      'ZMOD',
      'private',
    );
    const route = routeExtensibility(evidence, 'private');
    expect(route.rationale).toContain('core modification');
    expect(route.cleanCoreScore).toBeLessThan(75);
  });

  test('BAdI usage alone does not tank the score', () => {
    const evidence = buildAbapEvidence(`GET BADI lo_handle.`, 'ZBADI', 'private');
    const route = routeExtensibility(evidence, 'private');
    // Level B is acceptable: it must not be penalised like a modification.
    expect(route.cleanCoreScore).toBe(100);
  });
});
