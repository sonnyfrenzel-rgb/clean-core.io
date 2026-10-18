import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { ENGINE_READS_FROM } from '../lib/abap/engine-reads-gate';
import { withContextDigest } from '../lib/project-loader';
import { handoverNextStep } from '../lib/handover';
import type { Project } from '../lib/types';
import {
  CONTEXT_BLOCKERS,
  handoverBlockers,
  handoverNotice,
  staleness,
  workflowSteps,
} from '../lib/workflow-steps';

/**
 * The four high findings of the QA full review of c41f14953c1d (v3.0.17).
 *
 * The three engine ones change what a run signs, so they stand behind
 * `ENGINE_READS_FROM` (3.0.18): each test shows the new reading on a 3.0.18
 * engine and the signed reading of a 3.0.17 run, unchanged. Server-free.
 */

const NEW = ENGINE_READS_FROM;
const OLD = '3.0.17';
const kinds = (code: string, engine: string) =>
  buildAbapEvidence(code, 'zqa.prog.abap', 'private', undefined, engine).findings.map((f) => f.kind);

test.describe('a constant names a module only where a call uses it (1dcf075d8530)', () => {
  const unused = [
    'REPORT zqa.',
    "CONSTANTS c_label TYPE string VALUE 'REUSE_ALV_GRID_DISPLAY'.",
    "CONSTANTS c_mail TYPE string VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
    'WRITE / c_label.',
  ].join('\n');

  test('a constant no call uses: no ALV and no mail finding', () => {
    const now = kinds(unused, NEW);
    expect(now).not.toContain('classic-alv');
    expect(now).not.toContain('legacy-mail');
    // A 3.0.17 run keeps what it signed.
    const before = kinds(unused, OLD);
    expect(before).toContain('classic-alv');
    expect(before).toContain('legacy-mail');
  });

  test('a constant a dynamic call uses still names the module — directly, through a copy, in a chain', () => {
    const direct = [
      'REPORT zqa.',
      "CONSTANTS: c_other TYPE string VALUE 'X', c_fm TYPE rs38l_fnam VALUE 'REUSE_ALV_GRID_DISPLAY'.",
      'CALL FUNCTION c_fm EXPORTING i_callback_program = sy-repid.',
    ].join('\n');
    expect(kinds(direct, NEW)).toContain('classic-alv');
    const copied = [
      'REPORT zqa.',
      "CONSTANTS c_mail TYPE rs38l_fnam VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
      'DATA lv_fm TYPE rs38l_fnam.',
      'lv_fm = c_mail.',
      'CALL FUNCTION lv_fm.',
    ].join('\n');
    expect(kinds(copied, NEW)).toContain('legacy-mail');
    // The chain: only the declaration a call uses counts.
    const chain = [
      'REPORT zqa.',
      "CONSTANTS: c_alv TYPE rs38l_fnam VALUE 'REUSE_ALV_GRID_DISPLAY', c_used TYPE rs38l_fnam VALUE 'Z_OTHER'.",
      'CALL FUNCTION c_used.',
    ].join('\n');
    expect(kinds(chain, NEW)).not.toContain('classic-alv');
    // A static call is read as before.
    expect(kinds("REPORT zqa.\nCALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'.", NEW)).toContain('classic-alv');
  });
});

test.describe("a literal starting with 'Sys' is no system name (ae38972224d6)", () => {
  const hardcoded = (line: string, engine: string) =>
    kinds(`REPORT zqa.\n${line}`, engine).filter((k) => k === 'hardcoded-value').length;

  test('words are not reported; system and client names still are', () => {
    for (const line of ["MESSAGE 'Systemfehler: keine Berechtigung' TYPE 'E'.", "WRITE / 'PRDHA'.", "WRITE / 'Clntname'."]) {
      expect(hardcoded(line, NEW), line).toBe(0);
    }
    expect(hardcoded("MESSAGE 'Systemfehler: keine Berechtigung' TYPE 'E'.", OLD)).toBe(1);
    for (const line of [
      "IF sy-sysid = 'PRD'. ENDIF.",
      "lv_dest = 'PRDCLNT100'.",
      "lv_sys = 'SYS'.",
      "lv_sys = 'SYS_100'.",
      "lv_client = 'CLNT100'.",
      "lv_url = 'https://example.org/api'.",
      "lv_path = 'C:\\temp\\out.txt'.",
    ]) {
      expect(hardcoded(line, NEW), line).toBeGreaterThan(0);
    }
  });
});

test.describe('credit words in a literal are text, not credit logic (9e7373e53138)', () => {
  test('a parameter value with credit words: no finding; a credit module or credit code still is one', () => {
    const prose = "REPORT zqa.\nCALL FUNCTION 'BAPI_PO_CREATE1' EXPORTING iv_text = 'credit risk ok'.";
    expect(kinds(prose, NEW)).not.toContain('credit-management');
    expect(kinds(prose, OLD)).toContain('credit-management');
    expect(kinds("REPORT zqa.\nCALL FUNCTION 'Z_CREDIT_CHECK' EXPORTING iv_kunnr = lv_kunnr.", NEW)).toContain('credit-management');
    expect(kinds("REPORT zqa.\nCALL FUNCTION 'Z_CHECK' EXPORTING iv_credit_exposure = lv_amount.", NEW)).toContain('credit-management');
  });
});

test.describe('code generated before the latest decisions blocks the handover (1c3210b0f3ee)', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);
  function project(current: string): Project {
    const p = {
      id: 'p1',
      name: 'Context',
      legacyCode: 'REPORT zctx.\nWRITE / 1.',
      activeRunId: 'run-1',
      solutionDesign: '# Design',
      approvedByArchitect: true,
      generatedCode: JSON.stringify([{ path: 'srv/process.ts', content: 'export {};' }]),
      generationBinding: { path: 'engine-led', contextDigest: A, engine: null, basis: [] },
      testCases: [{ id: 't1', title: 'one', status: 'passed' }],
    } as unknown as Project;
    return withContextDigest(p, current);
  }

  test('a moved context: the code and its suite block, named by what moved', () => {
    const p = project(B);
    expect(staleness(p)).toMatchObject({ context: true, code: false, sourceChanged: false });
    expect(handoverBlockers(p)).toEqual([CONTEXT_BLOCKERS.code, CONTEXT_BLOCKERS.tests]);
    const delivery = workflowSteps(p).find((s) => s.key === 'delivery')!;
    expect(delivery).toMatchObject({ state: 'stale', badge: 'Blocked', done: false });
    expect(delivery.detail).not.toMatch(/previous source/);
    const notice = handoverNotice(p);
    expect(notice.title).toBe('Handover blocked — built before the latest decisions');
    expect(notice.reasons).toHaveLength(2);
    for (const r of notice.reasons) expect(r).toContain('regenerate the code in Transformation, then the suite');
    const next = handoverNextStep(p as never, workflowSteps(p), handoverBlockers(p), [], 'p1');
    expect(next.kind).toBe('blocked');
    expect(`${next.headline} ${next.reason}`).not.toMatch(/previous source|source under analysis/);
  });

  test('the same context: nothing blocks', () => {
    const p = project(A);
    expect(handoverBlockers(p)).toEqual([]);
    expect(handoverNotice(p).reasons).toEqual([]);
  });
});
