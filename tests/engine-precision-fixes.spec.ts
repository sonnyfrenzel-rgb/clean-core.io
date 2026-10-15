import { test, expect } from '@playwright/test';
import { buildAbapEvidence, rfcDestinationOf } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';
import { PRECISION_FIXES_FROM, precisionFixesApply } from '../lib/abap/precision-fixes-gate';
import { readSecurityReviewTasks } from '../lib/abap/security-review';

/**
 * Roadmap 3.0.13 — the engine corrections of the QA review of 5a559787, each
 * from `PRECISION_FIXES_FROM` on. A run of v3.0.12 keeps what it signed:
 * `tests/engine-version-rebuild.spec.ts` holds it to the frozen v3.0.12
 * answers, which include a probe of each case below.
 *
 * Server-free.
 */

const OLD = 'v3.0.12';
const NEW = `v${PRECISION_FIXES_FROM}`;

test('the gate opens at 3.0.13 and stays shut for v3.0.12 and for a run without a version', () => {
  expect(precisionFixesApply(NEW)).toBe(true);
  expect(precisionFixesApply('v3.1.0')).toBe(true);
  expect(precisionFixesApply(OLD)).toBe(false);
  expect(precisionFixesApply(null)).toBe(false);
  expect(precisionFixesApply(undefined)).toBe(false);
});

test.describe("DESTINATION 'NONE' is the whole literal (QA 5a559787: 1ebc0f7934c5)", () => {
  const call = (dest: string) => `CALL FUNCTION 'Z_X' DESTINATION ${dest}.`;

  test('a destination that only begins with NONE is another system, in both engines', () => {
    expect(rfcDestinationOf(call("'NONE_PROD'"), false)).toBe('remote');
    expect(rfcDestinationOf(call("'NONE_PROD'"), true)).toBe('remote');
    expect(rfcDestinationOf(call("'NONE'"), true)).toBe('local');
    expect(rfcDestinationOf(call("'none'"), true)).toBe('local');
  });

  test("from 3.0.13 the backtick literal is NONE too, and 'NONE''X' is not", () => {
    expect(rfcDestinationOf(call('`NONE`'), true)).toBe('local');
    expect(rfcDestinationOf(call("'NONE''X'"), true)).toBe('remote');
    // What v3.0.12 signed.
    expect(rfcDestinationOf(call('`NONE`'), false)).toBe('remote');
    expect(rfcDestinationOf(call("'NONE''X'"), false)).toBe('local');
  });

  test('the evidence follows the engine version', () => {
    const src = ['REPORT zrfc.', "CALL FUNCTION 'Z_B' DESTINATION 'NONE_PROD'.", "CALL FUNCTION 'Z_C' DESTINATION `NONE`.", "CALL FUNCTION 'Z_D' DESTINATION 'NONE''X'.", ''].join('\n');
    const rfcLines = (engine: string) =>
      buildAbapEvidence(src, 'zrfc.abap', 'private', undefined, engine).findings.filter((f) => f.kind === 'rfc-call').map((f) => f.lineStart);
    expect(rfcLines(NEW)).toEqual([2, 4]);
    expect(rfcLines(OLD)).toEqual([2, 3]);
  });
});

test.describe('an outbound RFC does not hide a standard-table write (QA 5a559787: 3fe882da065d)', () => {
  const SRC = ['REPORT zsd_upd.', "UPDATE vbak SET netwr = 0 WHERE vbeln = '1'.", "CALL FUNCTION 'Z_REMOTE' DESTINATION 'PRD_100'.", ''].join('\n');
  const route = (deployment: 'public' | 'private', engine: string) =>
    routeExtensibility(buildAbapEvidence(SRC, 'zsd_upd.abap', deployment, undefined, engine), deployment, engine);

  for (const deployment of ['public', 'private'] as const) {
    test(`${deployment}: the RFC chooses the route, and the write is named in the rationale, the In-App track and the assumptions`, () => {
      const r = route(deployment, NEW);
      expect(r.recommendedRoute).toMatch(/Side-by-Side/);
      expect(r.rationale).toContain('RFC integrations are present.');
      expect(r.rationale).toMatch(/1 direct write\(s\) to SAP standard tables are not fixed by this route: a side-by-side service cannot write SAP's tables either/);
      const inApp = r.checkpoints.find((c) => c.question.startsWith('Is the logic compatible'))!;
      expect(inApp.evaluation).toMatch(/1 direct write\(s\) to SAP standard tables have to be replaced by .+ as well\./);
      expect(r.comparativeAnalysis.inAppABAPCloud.fitDetails).toMatch(/1 direct write\(s\) to SAP standard tables have to be replaced/);
      expect(r.assumptions.some((a) => a.startsWith('Direct writes to SAP standard tables are replaced with'))).toBe(true);
    });
  }

  test('a custom-table write that takes the rationale no longer hides it either', () => {
    const src = ['REPORT zmix.', 'DATA ls_log TYPE zco_log.', 'INSERT zco_log FROM ls_log.', "UPDATE vbak SET netwr = 0 WHERE vbeln = '1'.", ''].join('\n');
    const r = routeExtensibility(buildAbapEvidence(src, 'zmix.abap', 'private', undefined, NEW), 'private', NEW);
    expect(r.rationale).toContain('write(s) to custom database persistence');
    expect(r.rationale).toMatch(/The 1 direct write\(s\) to SAP standard tables are not clean core in any edition: each is replaced on-stack by a released write API, a BAPI or a RAP action\./);
  });

  test('a run of v3.0.12 keeps the words it signed', () => {
    const r = route('public', OLD);
    expect(r.rationale).toBe('RFC integrations are present. These should be externalized via SAP Integration Suite destination service.');
    expect(r.comparativeAnalysis.inAppABAPCloud.fitDetails).not.toMatch(/standard tables/);
    expect(r.assumptions.some((a) => a.startsWith('Direct writes to SAP standard tables'))).toBe(false);
  });
});

test.describe('a file-name validation counts only when its failure stops the program (QA 5a559787: 7e158fe18264)', () => {
  const src = (validation: string) =>
    ['REPORT zfile.', 'PARAMETERS p_path TYPE string.', validation, 'OPEN DATASET p_path FOR INPUT IN TEXT MODE ENCODING DEFAULT.', ''].join('\n');
  const CALL = "CALL FUNCTION 'FILE_VALIDATE_NAME' EXPORTING logical_filename = 'Z_IN' CHANGING physical_filename = p_path";
  const kinds = (validation: string, precisionFixes: boolean) =>
    readSecurityReviewTasks(src(validation), { precisionFixes }).map((t) => t.kind);

  test('a handled failure whose sy-subrc nobody reads leaves the task', () => {
    expect(kinds(`${CALL} EXCEPTIONS OTHERS = 1.`, true)).toEqual(['file-path-from-input']);
    // The same with the result read in the statement after the call: covered.
    expect(kinds(`${CALL} EXCEPTIONS OTHERS = 1.\nIF sy-subrc <> 0. RETURN. ENDIF.`, true)).toEqual([]);
    // Read only later: something in between may have overwritten it.
    expect(kinds(`${CALL} EXCEPTIONS OTHERS = 1.\nWRITE / p_path.\nIF sy-subrc <> 0. RETURN. ENDIF.`, true)).toEqual(['file-path-from-input']);
  });

  test('without EXCEPTIONS a failure ends the program: covered', () => {
    expect(kinds(`${CALL}.`, true)).toEqual([]);
  });

  test('v3.0.12 counted any earlier call, and keeps doing so', () => {
    expect(kinds(`${CALL} EXCEPTIONS OTHERS = 1.`, false)).toEqual([]);
  });

  test('buildAbapEvidence passes the gate', () => {
    const code = src(`${CALL} EXCEPTIONS OTHERS = 1.`);
    const tasks = (engine: string) => buildAbapEvidence(code, 'zfile.abap', 'private', undefined, engine).findings.filter((f) => f.kind === 'security-review').length;
    expect(tasks(NEW)).toBe(1);
    expect(tasks(OLD)).toBe(0);
  });
});

test.describe('a statement that only mentions sy-subrc does not count as evaluating it (SEC-2026-812, SEC-2026-814)', () => {
  const CHECK = "AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD p_bukrs ID 'ACTVT' FIELD '02'.";
  const auth = (after: string) =>
    ['REPORT zauth.', 'PARAMETERS p_bukrs TYPE bukrs.', CHECK, after, 'DELETE FROM zbkpf WHERE bukrs = p_bukrs.', ''].join('\n');
  const authTasks = (after: string, precisionFixes: boolean) =>
    readSecurityReviewTasks(auth(after), { precisionFixes }).filter((t) => t.kind === 'authority-result-not-evaluated').length;

  test('after an AUTHORITY-CHECK, a statement that decides on sy-subrc clears the task', () => {
    for (const after of [
      'IF sy-subrc <> 0. RETURN. ENDIF.',
      'CHECK sy-subrc = 0.',
      'CASE sy-subrc. WHEN 0. WHEN OTHERS. LEAVE PROGRAM. ENDCASE.',
      'ASSERT sy-subrc = 0.',
      'DATA(ok) = COND abap_bool( WHEN sy-subrc = 0 THEN abap_true ELSE THROW zcx_no_auth( ) ).',
    ]) {
      expect(authTasks(after, true), after).toBe(0);
    }
  });

  test('after an AUTHORITY-CHECK, a value decided on sy-subrc and assigned clears the task', () => {
    for (const after of [
      // An is_authorized method returning the decision.
      'rv_ok = xsdbool( sy-subrc = 0 ).',
      'DATA(ok) = xsdbool( sy-subrc = 0 ).',
      'ev_ok = boolc( sy-subrc IS INITIAL ).',
      "lv_bit = boolx( bool = 0 <> sy-subrc bit = 1 ).",
      // The RAP global-authorization pattern.
      'lv_auth = COND #( WHEN sy-subrc = 0 THEN if_abap_behv=>auth-allowed\n ELSE if_abap_behv=>auth-unauthorized ).',
      'result-%create = COND #( WHEN sy-subrc EQ 0 THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
      'lv_auth = SWITCH #( sy-subrc WHEN 0 THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
    ]) {
      expect(authTasks(after, true), after).toBe(0);
    }
  });

  test('after an AUTHORITY-CHECK, a statement that only mentions sy-subrc keeps the task', () => {
    for (const after of [
      'WRITE sy-subrc.',
      'lv_rc = sy-subrc.',
      "MESSAGE |rc { sy-subrc }| TYPE 'S'.",
      'lv_text = |rc { sy-subrc }|.',
      'lo_log->add( sy-subrc ).',
      'lv_flag = xsdbool( lv_x = 1 ) + sy-subrc.',
      'lv_rc = COND #( WHEN lv_x = 1 THEN sy-subrc ).',
    ]) {
      expect(authTasks(after, true), after).toBe(1);
    }
    // What v3.0.12 signed: any mention counted.
    expect(authTasks('WRITE sy-subrc.', false)).toBe(0);
  });

  test('a copy of sy-subrc counts only when the very next statement decides on the copy (QA leftovers of hotfix 2)', () => {
    // The copy controls the protected operation: evaluated.
    for (const after of [
      'lv_rc = sy-subrc.\nIF lv_rc <> 0. RETURN. ENDIF.',
      'DATA(lv_rc) = sy-subrc.\nCHECK lv_rc = 0.',
      'MOVE sy-subrc TO lv_rc.\nIF lv_rc IS NOT INITIAL. RAISE EXCEPTION NEW zcx_no_auth( ). ENDIF.',
    ]) {
      expect(authTasks(after, true), after).toBe(0);
    }
    // A copy nobody decides on right away, or a decision on another name: not evaluated.
    for (const after of [
      'DATA(lv_rc) = sy-subrc.',
      'DATA(lv_rc) = sy-subrc.\nWRITE lv_rc.',
      'lv_rc = sy-subrc.\nIF lv_rc2 <> 0. RETURN. ENDIF.',
      'lv_rc = sy-subrc.\nIF lv_other <> 0. RETURN. ENDIF.',
      "lv_rc = sy-subrc.\nlv_text = 'lv_rc <> 0'.",
      'lv_rc = sy-subrc.\nCLEAR lv_x.\nIF lv_rc <> 0. RETURN. ENDIF.',
    ]) {
      expect(authTasks(after, true), after).toBe(1);
    }
    // The same rule for a file-name validation with EXCEPTIONS.
    const src = (after: string) => ['REPORT zfile.', 'PARAMETERS p_file TYPE string.',
      "CALL FUNCTION 'FILE_VALIDATE_NAME' EXPORTING logical_filename = 'ZLOG' CHANGING physical_filename = p_file EXCEPTIONS OTHERS = 1.",
      after, 'OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.', ''].join('\n');
    const fileTasks = (after: string) =>
      readSecurityReviewTasks(src(after), { precisionFixes: true }).filter((t) => t.kind === 'file-path-from-input').length;
    expect(fileTasks('DATA(lv_rc) = sy-subrc.\nIF lv_rc <> 0. RETURN. ENDIF.')).toBe(0);
    expect(fileTasks('DATA(lv_rc) = sy-subrc.\nWRITE lv_rc.')).toBe(1);
  });

  test('after a file-name validation with EXCEPTIONS, the same rule decides whether the path is covered', () => {
    const src = (after: string) => ['REPORT zfile.', 'PARAMETERS p_file TYPE string.',
      "CALL FUNCTION 'FILE_VALIDATE_NAME' EXPORTING logical_filename = 'ZLOG' CHANGING physical_filename = p_file EXCEPTIONS validation_failed = 1 OTHERS = 2.",
      after, 'OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.', ''].join('\n');
    const fileTasks = (after: string) =>
      readSecurityReviewTasks(src(after), { precisionFixes: true }).filter((t) => t.kind === 'file-path-from-input').length;
    expect(fileTasks('WRITE sy-subrc.')).toBe(1);
    expect(fileTasks('lv_rc = sy-subrc.')).toBe(1);
    expect(fileTasks('IF sy-subrc <> 0. RETURN. ENDIF.')).toBe(0);
    expect(fileTasks('CHECK sy-subrc = 0.')).toBe(0);
    expect(fileTasks('DATA(lv_ok) = xsdbool( sy-subrc = 0 ).')).toBe(0);
  });

  test('the benchmark shapes: an is_authorized method and a RAP global authorization read the result', () => {
    const isAuthorized = ['CLASS zcl_reader IMPLEMENTATION.', '  METHOD is_authorized.',
      "    AUTHORITY-CHECK OBJECT 'P_ORGIN'", "      ID 'INFTY' FIELD '2001'", "      ID 'SUBTY' DUMMY", "      ID 'AUTHC' FIELD 'R'.",
      '    rv_ok = xsdbool( sy-subrc = 0 ).', '  ENDMETHOD.', 'ENDCLASS.', ''].join('\n');
    const globalAuth = ['CLASS lhc_x IMPLEMENTATION.', '  METHOD get_global_authorizations.',
      "    AUTHORITY-CHECK OBJECT 'M_MSEG_BWA'", "      ID 'ACTVT' FIELD '01'", "      ID 'BWART' FIELD '311'.",
      '    lv_auth = COND #( WHEN sy-subrc = 0 THEN if_abap_behv=>auth-allowed',
      '                                        ELSE if_abap_behv=>auth-unauthorized ).',
      '    IF requested_authorizations-%create = if_abap_behv=>mk-on.', '      result-%create = lv_auth.', '    ENDIF.',
      '  ENDMETHOD.', 'ENDCLASS.', ''].join('\n');
    for (const src of [isAuthorized, globalAuth]) {
      expect(readSecurityReviewTasks(src, { precisionFixes: true }).filter((t) => t.kind === 'authority-result-not-evaluated')).toEqual([]);
    }
  });

  test('buildAbapEvidence passes the gate', () => {
    const code = auth('WRITE sy-subrc.');
    const tasks = (engine: string) => buildAbapEvidence(code, 'zauth.abap', 'private', undefined, engine).findings
      .filter((f) => f.kind === 'security-review' && /result is not read/.test(f.title)).length;
    expect(tasks(NEW)).toBe(1);
    expect(tasks(OLD)).toBe(0);
  });
});

test.describe('the flow from input is followed however long the chain and in whatever order the source writes it (SEC-2026-813)', () => {
  const LENGTH = 12;
  const chain = (reversed: boolean) => {
    const steps: string[] = [];
    for (let i = 2; i <= LENGTH; i++) steps.push(`v${i} = v${i - 1}.`);
    const assignments = ['v1 = p_file.', ...steps];
    return ['REPORT zchain.', 'PARAMETERS p_file TYPE string.',
      `DATA: ${Array.from({ length: LENGTH }, (_, i) => `v${i + 1} TYPE string`).join(', ')}.`,
      ...(reversed ? assignments.reverse() : assignments),
      `OPEN DATASET v${LENGTH} FOR INPUT IN TEXT MODE ENCODING DEFAULT.`, ''].join('\n');
  };
  const fileTasks = (reversed: boolean, precisionFixes: boolean) =>
    readSecurityReviewTasks(chain(reversed), { precisionFixes }).filter((t) => t.kind === 'file-path-from-input').length;

  test('a tainted name overwritten unconditionally by a constant before the clause no longer reaches it (QA leftovers of hotfix 2)', () => {
    const src = (between: string[]) => ['REPORT zdyn.', 'PARAMETERS p_where TYPE string.', 'DATA lv_where TYPE string.',
      'lv_where = p_where.', ...between, 'SELECT * FROM vbak INTO TABLE @DATA(lt) WHERE (lv_where).', ''].join('\n');
    const dyn = (between: string[], precisionFixes: boolean) =>
      readSecurityReviewTasks(src(between), { precisionFixes }).filter((t) => t.kind === 'dynamic-sql-from-input').length;
    // Overwritten on every way to the clause: the input no longer reaches it.
    expect(dyn(["lv_where = `VBELN <> ''`."], true)).toBe(0);
    expect(dyn(['CLEAR lv_where.'], true)).toBe(0);
    // What v3.0.12 signed: once tainted, always tainted.
    expect(dyn(["lv_where = `VBELN <> ''`."], false)).toBe(1);
    // Untouched, or overwritten only on one branch, or again from input: still a task.
    expect(dyn([], true)).toBe(1);
    expect(dyn(["IF sy-uname = 'X'.", "lv_where = `VBELN <> ''`.", 'ENDIF.'], true)).toBe(1);
    expect(dyn(["IF sy-uname = 'X'.", "lv_where = `VBELN <> ''`.", 'ELSE.', 'WRITE / lv_where.', 'ENDIF.'], true)).toBe(1);
    expect(dyn(["lv_where = `VBELN <> ''`.", 'lv_where = p_where.'], true)).toBe(1);
    expect(dyn(["lv_where = |{ p_where } AND VBELN <> ''|."], true)).toBe(1);
    // Overwritten in a block that encloses the clause: on every way to it.
    const nested = ['REPORT zdyn.', 'PARAMETERS p_where TYPE string.', 'DATA lv_where TYPE string.', 'lv_where = p_where.',
      'DO 3 TIMES.', "  lv_where = `VBELN <> ''`.", "  IF sy-index = 2.", '    SELECT * FROM vbak INTO TABLE @DATA(lt) WHERE (lv_where).', '  ENDIF.', 'ENDDO.', ''].join('\n');
    expect(readSecurityReviewTasks(nested, { precisionFixes: true }).filter((t) => t.kind === 'dynamic-sql-from-input')).toEqual([]);
    // The same for a file path.
    const path = ['REPORT zfile.', 'PARAMETERS p_file TYPE string.', 'DATA lv_file TYPE string.', 'lv_file = p_file.',
      "lv_file = '/usr/sap/trans/data/out.txt'.", 'OPEN DATASET lv_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.', ''].join('\n');
    expect(readSecurityReviewTasks(path, { precisionFixes: true }).filter((t) => t.kind === 'file-path-from-input')).toEqual([]);
    expect(readSecurityReviewTasks(path, { precisionFixes: false }).filter((t) => t.kind === 'file-path-from-input')).toHaveLength(1);
  });

  test('a constant written to one component of a structure clears no other component (QA 3fd753f5de41: b0133ee3eb34)', () => {
    const src = (between: string[]) => ['REPORT zdyn.', 'PARAMETERS p_where TYPE string.',
      'DATA: BEGIN OF ls_filter, where TYPE string, description TYPE string, END OF ls_filter.',
      'ls_filter-where = p_where.', ...between, 'SELECT * FROM vbak INTO TABLE @DATA(lt) WHERE (ls_filter-where).', ''].join('\n');
    const dyn = (between: string[]) =>
      readSecurityReviewTasks(src(between), { precisionFixes: true }).filter((t) => t.kind === 'dynamic-sql-from-input').length;
    expect(dyn(["ls_filter-description = 'X'."])).toBe(1);
    expect(dyn(['CLEAR ls_filter-description.'])).toBe(1);
    // The whole structure overwritten still clears it.
    expect(dyn(['CLEAR ls_filter.'])).toBe(0);
  });

  test('a chain written forwards reaches the path in both engines', () => {
    expect(fileTasks(false, true)).toBe(1);
    expect(fileTasks(false, false)).toBe(1);
  });

  test('a chain written backwards reaches the path from 3.0.13', () => {
    expect(fileTasks(true, true)).toBe(1);
    // What v3.0.12 signed: eight passes, one link each.
    expect(fileTasks(true, false)).toBe(0);
  });

  test('buildAbapEvidence passes the gate', () => {
    const tasks = (engine: string) => buildAbapEvidence(chain(true), 'zchain.abap', 'private', undefined, engine).findings
      .filter((f) => f.kind === 'security-review').length;
    expect(tasks(NEW)).toBe(1);
    expect(tasks(OLD)).toBe(0);
  });
});

test.describe("the IDoc sentence attributes SAP's classification only to SAP's modules (QA leftovers of hotfix 2)", () => {
  const program = (...modules: string[]) => ['REPORT zidoc.', ...modules.map((m) => `CALL FUNCTION '${m}' EXPORTING x = 1.`), ''].join('\n');
  const why = (code: string, engine: string) =>
    recommendArchitecture(code, extractCodeInventory(code), extractDataCoupling(code), undefined, engine).justification;

  test('a module in a customer or partner namespace is not said to be in SAP\'s classification file', () => {
    const own = why(program('Z_SEND_IDOC'), NEW);
    expect(own).toContain('IDoc function modules in a customer or partner namespace are called (Z_SEND_IDOC)');
    expect(own).not.toMatch(/IDoc function modules are called/);
    expect(why(program('/ACME/SEND_IDOC'), NEW)).toContain('customer or partner namespace are called (/ACME/SEND_IDOC)');
    // What v3.0.12 signed.
    expect(why(program('Z_SEND_IDOC'), OLD)).toMatch(/^IDoc function modules are called \(Z_SEND_IDOC\)\. SAP's classification file lists/);
  });

  test('SAP\'s module keeps the classification; a customer module beside it is named apart', () => {
    expect(why(program('MASTER_IDOC_DISTRIBUTE'), NEW)).toMatch(/^IDoc function modules are called \(MASTER_IDOC_DISTRIBUTE\)\. SAP's classification file lists/);
    const mixed = why(program('MASTER_IDOC_DISTRIBUTE', 'Y_IDOC_POST'), NEW);
    expect(mixed).toMatch(/^IDoc function modules are called \(MASTER_IDOC_DISTRIBUTE\)\./);
    expect(mixed).toContain('Y_IDOC_POST is in a customer or partner namespace, which SAP\'s classification file does not cover: its level is the level of what it calls.');
  });
});
