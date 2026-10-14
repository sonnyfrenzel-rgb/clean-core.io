/**
 * Roadmap 3.0.13 — the four small engine rules, the customer's own enhancement
 * point, and the expected ATC message said apart from the grade.
 *
 * Every rule is engine-version gated (`PRECISION_FIXES_FROM`): a run of engine
 * 3.0.12 keeps the findings, the score and the route it signed, and each test
 * below asks both engines. None of the new kinds costs score points or chooses
 * the route; the tests hold that too.
 *
 * Pure: no server.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { expectedAtcMessage, gradeFromSapStates, gradeFromSapStatesForUse } from '../lib/abap/abcd-classification';
import { readHookImplementations, readSystemTimeUses } from '../lib/abap/engine-rules';
import { readStatements } from '../lib/abap/statement-reader';

const NEW = 'v3.0.13';
const OLD = 'v3.0.12';

const evidence = (code: string, engine: string, file = 'ZTEST.abap') => buildAbapEvidence(code, file, 'private', undefined, engine);
const ofKind = (code: string, kind: string, engine = NEW, file?: string): EvidenceFinding[] =>
  evidence(code, engine, file).findings.filter((f) => f.kind === kind);

/** The score and the route of a program, with and without a construct that must not move them. */
function scoreAndRoute(code: string, engine = NEW) {
  const report = routeExtensibility(evidence(code, engine), 'private', engine);
  return { score: report.cleanCoreScore, route: report.recommendedRoute };
}

test.describe('the customer\'s own enhancement point (suspected defect)', () => {
  const OWN = `REPORT zsd_own_points.
DATA lv_x TYPE i.
ENHANCEMENT-POINT zep_before_save SPOTS zes_sd_own.
lv_x = 1.
ENHANCEMENT-SECTION zes_calc SPOTS zes_sd_own STATIC.
lv_x = 2.
END-ENHANCEMENT-SECTION.`;

  test('in a Z program, for Z spots, it is no level D enhancement and costs no points', () => {
    const findings = evidence(OWN, NEW).findings;
    expect(findings.filter((f) => f.kind === 'enhancement')).toHaveLength(0);
    const own = findings.filter((f) => f.kind === 'own-enhancement-point');
    expect(own.map((f) => f.objectType)).toEqual(['Own Enhancement Point', 'Own Enhancement Section']);
    expect(own.every((f) => f.severity === 'Low')).toBe(true);
    expect(scoreAndRoute(OWN).score).toBe(100);
  });

  test('a run of engine 3.0.12 keeps the level D finding it signed', () => {
    expect(ofKind(OWN, 'enhancement', OLD)).toHaveLength(2);
    expect(ofKind(OWN, 'own-enhancement-point', OLD)).toHaveLength(0);
  });

  test('a point for an SAP spot, or in a program that is not the customer\'s, stays level D', () => {
    expect(ofKind(`REPORT zsd_x.\nENHANCEMENT-POINT ep_check SPOTS es_sales.`, 'enhancement')).toHaveLength(1);
    expect(ofKind(`REPORT sapmv45a.\nENHANCEMENT-POINT zep SPOTS zes_x.`, 'enhancement')).toHaveLength(1);
    // No program statement and no customer file name: not known to be the customer's.
    expect(ofKind(`ENHANCEMENT-POINT zep SPOTS zes_x.`, 'enhancement', NEW, 'source.abap')).toHaveLength(1);
  });
});

test.describe('rule 1: the server\'s date and time', () => {
  test('comparisons, deadlines, stored stamps and a scheduled job are read; a display and a parameter are not', () => {
    const uses = readSystemTimeUses(readStatements(`REPORT ztime.
IF lv_due < sy-datum. ENDIF.
SELECT * FROM zt INTO TABLE @DATA(t) WHERE valid_to >= @sy-datum.
lv_deadline = sy-datum + 30.
ls_log-erdat = sy-datum.
WRITE: / sy-datum, sy-uzeit.
CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY' EXPORTING date = sy-datum foreign_amount = 1.
CALL FUNCTION 'JOB_CLOSE' EXPORTING jobcount = lv_count jobname = lv_name sdlstrtdt = lv_date sdlstrttm = lv_time.`));
    expect(uses.map((u) => `${u.line}:${u.use}`)).toEqual(['2:comparison', '3:comparison', '4:deadline', '5:write', '8:job-schedule']);
  });

  test('one finding per program, with a day-boundary test case and sy-datlo as the remedy; no points, no route', () => {
    const code = `REPORT zdue.\nDATA lv_due TYPE d.\nIF lv_due < sy-datum.\n  WRITE 'late'.\nENDIF.`;
    const found = ofKind(code, 'system-time');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('Medium');
    expect(found[0].recommendation).toContain('sy-datlo');
    expect(found[0].recommendation).toContain('cl_abap_context_info');
    expect(found[0].recommendation).toMatch(/day-boundary test case/);
    expect(scoreAndRoute(code)).toEqual(scoreAndRoute(code, OLD));
    expect(ofKind(code, 'system-time', OLD)).toHaveLength(0);
  });

  test('a stored stamp alone is no finding, but a note that stays visible (owner decision 14.10.2026)', () => {
    const code = `REPORT zstamp.\nls_row-erdat = sy-datum.\nUPDATE zlog SET aedat = sy-datum WHERE id = lv_id.\nAPPEND VALUE #( erzet = sy-uzeit ) TO lt_log.`;
    const report = evidence(code, NEW);
    expect(report.findings.filter((f) => f.kind === 'system-time')).toHaveLength(0);
    expect(report.notes).toHaveLength(1);
    expect(report.notes![0].kind).toBe('system-time-stamp');
    expect(report.notes![0].lines).toEqual([2, 3, 4]);
    expect(report.notes![0].text).toBe("3 fields store the server's date or time as a stamp (erdat, aedat, erzet) — fine in UTC unless a later step reads them as the local day.");
    expect(scoreAndRoute(code)).toEqual(scoreAndRoute(code, OLD));
    // A run of engine 3.0.12 has neither the finding nor the note.
    expect(evidence(code, OLD).notes).toBeUndefined();
  });

  test('a decision and a stamp in one program: the finding names only the decision, the stamp is the note', () => {
    const code = `REPORT zmixed.\nIF lv_due < sy-datum. ENDIF.\nls_row-erdat = sy-datum.\nlv_deadline = sy-datum + 30.`;
    const report = evidence(code, NEW);
    const found = report.findings.filter((f) => f.kind === 'system-time');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('Medium');
    expect(found[0].technicalDetail).toContain('on lines 2, 4.');
    expect(found[0].technicalDetail).not.toContain('stored');
    expect(report.notes?.map((n) => n.lines)).toEqual([[3]]);
    expect(report.notes![0].text).toMatch(/^1 field stores .* \(erdat\) — fine in UTC unless a later step reads it as the local day\.$/);
  });

  test('many comparisons in one program are one finding, with a short recommendation', () => {
    const many = Array.from({ length: 20 }, (_, i) => `IF lv_d${i} < sy-datum. ENDIF.`).join('\n');
    const found = ofKind(`REPORT zmany.\n${many}`, 'system-time');
    expect(found).toHaveLength(1);
    expect(found[0].recommendation.length).toBeLessThanOrEqual(260);
  });
});

test.describe('rule 2: exit, BAdI and VOFM implementations', () => {
  const IN_HOOK = `FORM userexit_save_document_prepare.
  DATA lv_sum TYPE p.
  LOOP AT xvbap INTO DATA(ls_vbap).
    lv_sum = lv_sum + ls_vbap-netwr.
  ENDLOOP.
  IF lv_sum > 1000.
    MESSAGE e001(zsd).
  ENDIF.
ENDFORM.`;
  const DELEGATED = `CLASS zcl_im_po DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_ex_me_process_po_cust.
ENDCLASS.
CLASS zcl_im_po IMPLEMENTATION.
  METHOD if_ex_me_process_po_cust~check.
    zcl_mm_po_rules=>check( im_header ).
  ENDMETHOD.
  METHOD if_ex_me_process_po_cust~open.
  ENDMETHOD.
ENDCLASS.`;

  test('the statements in the hook are counted, and delegation to a class is recognised', () => {
    const [inHook] = readHookImplementations(readStatements(IN_HOOK));
    expect(inHook).toMatchObject({ kind: 'user-exit', name: 'USEREXIT_SAVE_DOCUMENT_PREPARE', delegatedTo: null });
    expect(inHook.statements).toBe(6);
    const delegated = readHookImplementations(readStatements(DELEGATED));
    // The empty method is a stub the interface requires, not an implementation.
    expect(delegated).toHaveLength(1);
    expect(delegated[0]).toMatchObject({ kind: 'badi', delegatedTo: 'ZCL_MM_PO_RULES', owner: 'ZCL_IM_PO' });
  });

  test('both answers reach the finding and the route rationale; nothing moves the score', () => {
    const hook = ofKind(IN_HOOK, 'hook-implementation');
    expect(hook).toHaveLength(1);
    expect(hook[0].technicalDetail).toContain('Delegated to a class: no.');
    expect(routeExtensibility(evidence(IN_HOOK, NEW), 'private', NEW).rationale).toMatch(/hold their logic in the hook .*statement by statement/);
    const delegated = ofKind(DELEGATED, 'hook-implementation');
    expect(delegated[0].title).toContain('delegated to ZCL_MM_PO_RULES');
    expect(routeExtensibility(evidence(DELEGATED, NEW), 'private', NEW).rationale).toMatch(/only the call in the hook is re-pointed/);
    expect(scoreAndRoute(IN_HOOK)).toEqual(scoreAndRoute(IN_HOOK, OLD));
    expect(ofKind(IN_HOOK, 'hook-implementation', OLD)).toHaveLength(0);
    expect(routeExtensibility(evidence(IN_HOOK, OLD), 'private', OLD).rationale).not.toMatch(/in the hook/);
  });

  test('a VOFM routine and a customer exit that keeps its logic in a ZX include', () => {
    expect(readHookImplementations(readStatements(`FORM kobed_905.\n  sy-subrc = 4.\nENDFORM.`))[0].kind).toBe('vofm');
    const exit = ofKind(`FUNCTION exit_saplkedrcopa_001.\n  INCLUDE zxkkeu11.\nENDFUNCTION.`, 'hook-implementation');
    expect(exit[0].title).toContain('logic in include ZXKKEU11');
  });
});

test.describe('rule 3: form output', () => {
  test('SAPscript, Smart Forms and Adobe Forms are recognised; the change of technology is optional and costs nothing', () => {
    const code = `REPORT zprint.
SELECT SINGLE * FROM zinvoice INTO @DATA(ls_inv) WHERE id = @p_id.
CALL FUNCTION 'OPEN_FORM' EXPORTING form = 'ZINVOICE'.
CALL FUNCTION 'WRITE_FORM' EXPORTING element = 'ITEM'.
CALL FUNCTION 'CLOSE_FORM'.
CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME' EXPORTING formname = 'ZSF_INV' IMPORTING fm_name = lv_fm.
CALL FUNCTION 'FP_JOB_OPEN' CHANGING ie_outputparams = ls_out.
CALL FUNCTION 'FP_FUNCTION_MODULE_NAME' EXPORTING i_name = 'ZAF_INV' IMPORTING e_funcname = lv_fm.`;
    const found = ofKind(code, 'form-output');
    expect(found.map((f) => f.title)).toEqual([
      'Form output with SAPscript (OPEN_FORM, WRITE_FORM, CLOSE_FORM)',
      'Form output with Smart Forms (SSF_FUNCTION_MODULE_NAME)',
      'Form output with Adobe Forms (Interactive Forms by Adobe) (FP_JOB_OPEN, FP_FUNCTION_MODULE_NAME)',
    ]);
    expect(found[0].cleanCoreImpact).toMatch(/follows the data it reads and writes/);
    expect(found[0].recommendation).toMatch(/^Optional/);
    expect(scoreAndRoute(code)).toEqual(scoreAndRoute(code, OLD));
    expect(ofKind(code, 'form-output', OLD)).toHaveLength(0);
  });
});

test.describe('rule 4: ABAP proxies', () => {
  test('consumer and provider proxies are recognised, with the retire question', () => {
    const consumer = ofKind(`CLASS zcl_sender IMPLEMENTATION.
  METHOD send.
    DATA lo_proxy TYPE REF TO zco_hr_employee_out.
    TRY.
        lo_proxy = NEW #( ).
      CATCH cx_ai_system_fault INTO DATA(lx).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`, 'abap-proxy');
    expect(consumer.map((f) => [f.objectName, f.objectType])).toEqual([['ZCO_HR_EMPLOYEE_OUT', 'ABAP Consumer Proxy']]);
    expect(consumer[0].needsBusinessDecision).toBe(true);
    expect(consumer[0].targetOptions).toContain('Retire');
    expect(consumer[0].recommendation).toMatch(/still runs/);
    expect(consumer[0].cleanCoreImpact).toMatch(/regenerated in the target system/);

    const provider = ofKind(`CLASS zcl_gr_in DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES zii_mm_goods_receipt_in.\nENDCLASS.`, 'abap-proxy');
    expect(provider.map((f) => f.objectType)).toEqual(['ABAP Provider Proxy']);
    expect(ofKind(`CLASS zcl_gr_in DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES zii_mm_goods_receipt_in.\nENDCLASS.`, 'abap-proxy', OLD)).toHaveLength(0);
  });

  test('a class with CO_ in its name is no proxy without a proxy fault beside it', () => {
    expect(ofKind(`DATA lo TYPE REF TO zco_helper.\nlo = NEW #( ).`, 'abap-proxy')).toHaveLength(0);
  });
});

test.describe('the expected ATC message, said apart from the grade', () => {
  const sap = (releaseState?: string, classificationState?: string, hasSuccessor = false) =>
    gradeFromSapStates({ releaseState, classificationState, hasSuccessor, isSapObject: true, isCustomerObject: false });

  test('each SAP state gets its expected message; the grade is untouched', () => {
    expect(expectedAtcMessage(sap('released')).text).toBe('ATC expected: no finding (released API)');
    expect(expectedAtcMessage(sap(undefined, 'classicAPI')).text).toBe('ATC expected: classic API · priority 3 (information)');
    expect(expectedAtcMessage(sap(undefined, 'noAPI')).text).toBe('ATC expected: noAPI · priority 1 (error)');
    expect(expectedAtcMessage(sap()).text).toBe('ATC expected: internal API · priority 2 (warning)');
    // The two overlaps the roadmap row asks about: our grade D, the check's expected message apart.
    const overlap = sap('notToBeReleased', 'classicAPI', true);
    expect(overlap.grade).toBe('D');
    expect(expectedAtcMessage(overlap).priority).toBe(3);
    const notReleasedAlone = sap('notToBeReleased');
    expect(notReleasedAlone.grade).toBe('D');
    expect(expectedAtcMessage(notReleasedAlone).priority).toBe(2);
  });

  test('where no public source says what ATC reports, it is "not determined", never a guess', () => {
    expect(expectedAtcMessage(sap('deprecated', undefined, true)).text).toBe('ATC: not determined');
    expect(expectedAtcMessage(sap('deprecated')).text).toBe('ATC: not determined');
    const write = gradeFromSapStatesForUse({ releaseState: 'notToBeReleased', isSapObject: true }, 'write');
    expect(expectedAtcMessage(write).text).toBe('ATC: not determined');
    const own = gradeFromSapStatesForUse({ isCustomerObject: true }, 'read');
    expect(expectedAtcMessage(own).text).toBe('ATC: not determined');
    expect(expectedAtcMessage(null).text).toBe('ATC: not determined');
  });
});
