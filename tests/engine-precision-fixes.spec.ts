import { test, expect } from '@playwright/test';
import { buildAbapEvidence, rfcDestinationOf } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
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

  test('after an AUTHORITY-CHECK, a statement that only mentions sy-subrc keeps the task', () => {
    for (const after of ['WRITE sy-subrc.', 'lv_rc = sy-subrc.', "MESSAGE |rc { sy-subrc }| TYPE 'S'.", 'DATA(ok) = xsdbool( sy-subrc = 0 ).']) {
      expect(authTasks(after, true), after).toBe(1);
    }
    // What v3.0.12 signed: any mention counted.
    expect(authTasks('WRITE sy-subrc.', false)).toBe(0);
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
