import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate } from '../lib/test-sandbox/type-check';
import { abapCheck } from '../lib/transformation/abap-check';
import { accessPointsOf } from '../lib/transformation/access-layer';
import { candidateFiles, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, isReleasedSapClass } from '../lib/transformation/markers';
import { fillInstructionHeader } from '../lib/transformation/fill-prompt';
import { runGeneration, type OrchestratorInput } from '../lib/transformation/orchestrator';
import { mapTypeFindings, markerSpans, nodeScaffoldCheck, type VerifyRunAnswer } from '../lib/transformation/verify';
import { readEngineFacts } from '../lib/transformation/unit-plan';
import { deriveReleasedClasses, RELEASED_CLASSES_FILE, RELEASED_INTERFACES_FILE } from '../lib/abap/cloudification-repo';
import type { FillRequest } from '../lib/transformation/types';
import { poDemo } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13 — the three engine defects of the fourth real acceptance run (14.10.2026, 94874c90, three runs per
 * program and track). None was the model's: each stopped a faithful body, or hid a body's error from repair.
 *
 *   1. RAP, PO approval U06 in 3 of 3 runs: `DATA ls_appr TYPE zmm_po_appr` — "ZMM_PO_APPR not found". The original
 *      writes the customer table and types its data by it; the package does not ship its definition, and the access
 *      layer had no write method for it.
 *   2. RAP, SD returns U03 in 2 of 3 runs: `cl_system_uuid=>…` refused as "a call outside the logic class" — a class
 *      SAP releases for ABAP Cloud.
 *   3. Node, SD returns in 3 of 3 runs: TS2355 in srv/lib/guards.ts, owned by no unit. The compiler reports a body
 *      that does not return on every path on its function's return type — the signature line the engine wrote, outside
 *      the fill markers — so it was booked as engine code, never sent back, and the loop stopped "passed".
 *
 * Server-free: abaplint and the TypeScript compiler run in-process, as the routes run them.
 */

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const syntaxOf = (r: ReturnType<typeof abapCheck>) => JSON.stringify(r.ran && r.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5));

/* ------------------------------------------------------------------ 1 */

test.describe('1 — a customer table the original writes and types data by', () => {
  const p = prep(poDemo(), 'rap');
  const logic = p.scaffold.files.find((f) => f.path.endsWith('_logic.clas.abap'))!.content;
  const intf = p.scaffold.files.find((f) => /zif_\w+_access\.intf\.abap$/.test(f.path))!.content;
  const u06 = p.plan.units.find((u) => u.routine === 'LOG_APPROVAL')!;

  test('the class declares its row under the table name, from the fields the original uses', () => {
    // 3.0.18 item 13: the types the access interface takes are declared in it; the logic class aliases them.
    expect(logic).toMatch(/TYPES zmm_po_appr TYPE zif_\w+_access=>zmm_po_appr\./);
    const appr = intf.slice(intf.indexOf('TYPES BEGIN OF zmm_po_appr.'), intf.indexOf('TYPES END OF zmm_po_appr.'));
    for (const f of ['mandt TYPE c LENGTH 3', 'approver TYPE xubname', 'erdat TYPE d', 'erzet TYPE t']) expect(appr).toContain(`TYPES ${f}.`);
    for (const f of ['banfn', 'bnfpo', 'amount', 'message']) expect(appr).toMatch(new RegExp(`TYPES ${f} TYPE `));
    // INSERT zmm_po_attach FROM @( VALUE #( mandt = … objkey = … length = … erdat = … ) ): the fields of the VALUE.
    const attach = intf.slice(intf.indexOf('TYPES BEGIN OF zmm_po_attach.'), intf.indexOf('TYPES END OF zmm_po_attach.'));
    for (const f of ['mandt', 'objkey', 'length', 'erdat']) expect(attach).toMatch(new RegExp(`TYPES ${f} TYPE `));
    expect(attach).toContain('TYPES length TYPE i.');
  });

  test('the access layer writes it: write_zmm_po_appr( is_row | it_rows ), the row typed by the class', () => {
    expect(intf).toMatch(/"! Writes ZMM_PO_APPR \(a customer table of the original system, not in this package\) where the original does, L353/);
    expect(intf).toMatch(/METHODS write_zmm_po_appr\n\s+IMPORTING\n\s+is_row TYPE zif_\w+_access=>zmm_po_appr OPTIONAL\n\s+it_rows TYPE STANDARD TABLE OPTIONAL/);
    expect(intf).toContain('METHODS write_zmm_po_attach');
    // The CAP shell keeps writing customer tables as entities of its own: no write method there.
    expect(accessPointsOf(readEngineFacts(poDemo())).points.some((x) => x.customer && x.kind === 'write')).toBe(false);
    expect(accessPointsOf(readEngineFacts(poDemo()), { customerWrites: true }).points.filter((x) => x.customer && x.kind === 'write').map((x) => x.method)).toEqual([
      'write_zmm_po_appr',
      'write_zmm_po_attach',
    ]);
    const scaffold = abapCheck(p.scaffold.files);
    expect(scaffold.ran && scaffold.activation.activatable, syntaxOf(scaffold)).toBe(true);
  });

  test("the run's own body shape activates: data typed by the table, written through the layer", () => {
    const body = [
      'DATA ls_appr TYPE zmm_po_appr.',
      'DATA lt_appr TYPE STANDARD TABLE OF zmm_po_appr WITH EMPTY KEY.',
      'ls_appr-mandt = sy-mandt.',
      'ls_appr-banfn = p_banfn.',
      'ls_appr-bnfpo = p_bnfpo.',
      'ls_appr-approver = gv_approver.',
      'ls_appr-amount = gv_amount.',
      'ls_appr-message = gv_message.',
      'ls_appr-erdat = cl_abap_context_info=>get_system_date( ).',
      'ls_appr-erzet = cl_abap_context_info=>get_system_time( ).',
      'APPEND ls_appr TO lt_appr.',
      'mo_access->write_zmm_po_appr( is_row = ls_appr ).',
      'mo_access->write_zmm_po_appr( it_rows = lt_appr ).',
    ].join('\n');
    expect(bodyGuards(body, guardContextOf(p, u06.id))).toEqual([]);
    const r = abapCheck(candidateFiles(p, new Map([[u06.id, body]])));
    expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
  });

  test('a body writing the table directly is refused, naming the method; an internal table of that name is not', () => {
    const ctx = guardContextOf(p, u06.id);
    const direct = bodyGuards('DATA ls_appr TYPE zmm_po_appr.\nls_appr-banfn = p_banfn.\nINSERT zmm_po_appr FROM ls_appr.', ctx).find((r) => r.code === 'customer-write');
    expect(direct?.message).toContain('ZMM_PO_APPR (write it with mo_access->write_zmm_po_appr( is_row = … ) or ( it_rows = … ))');
    for (const stmt of ['MODIFY zmm_po_appr FROM ls_appr.', 'UPDATE zmm_po_appr SET message = gv_message WHERE banfn = p_banfn.', 'DELETE FROM zmm_po_appr WHERE banfn = p_banfn.']) {
      expect(bodyGuards(`DATA ls_appr TYPE zmm_po_appr.\n${stmt}`, ctx).map((r) => r.code), stmt).toContain('customer-write');
    }
    const local = bodyGuards('DATA ls_appr TYPE zmm_po_appr.\nDATA lt_appr TYPE STANDARD TABLE OF zmm_po_appr WITH EMPTY KEY.\nINSERT ls_appr INTO TABLE lt_appr.', ctx);
    expect(local.map((r) => r.code)).not.toContain('customer-write');
    expect(fillInstructionHeader('rap')).toContain('write it through mo_access->write_zmm_x( is_row = ls_x ) or ( it_rows = lt_x ); never SQL on it.');
  });

  test('any program: a table typed by a customer table, rows read in a loop, written back — the structure from its fields', () => {
    const source = `REPORT zcc_cust_write.
PARAMETERS p_kunnr TYPE c LENGTH 10.
DATA gt_log TYPE STANDARD TABLE OF zsd_credit_log WITH DEFAULT KEY.
DATA gv_count TYPE i.

START-OF-SELECTION.
  PERFORM write_log.

FORM write_log.
  DATA ls_log TYPE zsd_credit_log.
  LOOP AT gt_log INTO ls_log.
    ls_log-kunnr = p_kunnr.
    ls_log-cnt = gv_count.
    MODIFY gt_log FROM ls_log.
  ENDLOOP.
  MODIFY zsd_credit_log FROM TABLE gt_log.
ENDFORM.
`;
    const q = prep(source, 'rap');
    // 3.0.18 item 13: the types the access interface takes are declared in it; the logic class aliases them.
    const cls = q.scaffold.files.find((f) => f.path.endsWith('_access.intf.abap'))!.content;
    const struct = cls.slice(cls.indexOf('TYPES BEGIN OF zsd_credit_log.'), cls.indexOf('TYPES END OF zsd_credit_log.'));
    expect(struct).toContain('TYPES kunnr TYPE c LENGTH 10.');
    expect(struct).toContain('TYPES cnt TYPE i.');
    const scaffold = abapCheck(q.scaffold.files);
    expect(scaffold.ran && scaffold.activation.activatable, syntaxOf(scaffold)).toBe(true);
    const unit = q.plan.units.find((u) => u.routine === 'WRITE_LOG') ?? q.plan.units.find((u) => u.kind === 'orchestrator')!;
    const body = ['DATA ls_log TYPE zsd_credit_log.', 'LOOP AT gt_log INTO ls_log.', '  ls_log-kunnr = p_kunnr.', '  ls_log-cnt = gv_count.', '  MODIFY gt_log FROM ls_log.', 'ENDLOOP.', 'mo_access->write_zsd_credit_log( it_rows = gt_log ).'].join('\n');
    expect(bodyGuards(body, guardContextOf(q, unit.id))).toEqual([]);
    const r = abapCheck(candidateFiles(q, new Map([[unit.id, body]])));
    expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
  });
});

/* ------------------------------------------------------------------ 2 */

test.describe('2 — a class SAP releases for ABAP Cloud may be called', () => {
  const p = prep(poDemo(), 'rap');
  const unit = p.plan.units.find((u) => u.routine === 'LOG_APPROVAL')!;
  const ctx = guardContextOf(p, unit.id);

  test('cl_system_uuid=> passes the body guard; an unreleased or invented class is still refused', () => {
    expect(isReleasedSapClass('CL_SYSTEM_UUID')).toBe(true);
    const uuid = bodyGuards('TRY.\n  DATA(lv_uuid) = cl_system_uuid=>create_uuid_x16_static( ).\nCATCH cx_uuid_error.\n  RETURN.\nENDTRY.', ctx);
    expect(uuid.map((r) => r.code)).not.toContain('foreign-call');
    // The run's own refusal (PO U15) and an invented name: neither declared by the package nor released.
    expect(isReleasedSapClass('cl_mm_internal')).toBe(false);
    const internal = bodyGuards('cl_mm_internal=>post( ).', ctx).find((r) => r.code === 'foreign-call');
    expect(internal?.message).toContain('cl_mm_internal=>');
    expect(bodyGuards('zcl_invented_helper=>run( ).', ctx).map((r) => r.code)).toContain('foreign-call');
  });

  test('the released-class list is the synced one, and small: the engine carries it instead of the catalog', () => {
    const generated = path.join(__dirname, '..', 'lib', 'abap', 'generated');
    const file = path.join(generated, RELEASED_CLASSES_FILE);
    const latest = JSON.parse(fs.readFileSync(path.join(generated, 'cloudification-repo.latest.json'), 'utf8'));
    // Derived from the committed catalog: a sync that changes one changes the other (scripts/sync-cloudification-repo.ts).
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(deriveReleasedClasses(latest));
    expect(fs.statSync(file).size).toBeLessThan(64 * 1024);
    // The only generated file the transformation engine imports.
    const dir = path.join(__dirname, '..', 'lib', 'transformation');
    const imports = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/from '\.\.\/abap\/generated\/([^']+)'/g)].map((m) => m[1]));
    // Since 3.0.14 (item 4) the released interface names beside them (tests/transformation-3014-generation.spec.ts).
    expect([...new Set(imports)].sort()).toEqual([RELEASED_CLASSES_FILE, RELEASED_INTERFACES_FILE].sort());
  });
});

/* ------------------------------------------------------------------ 3 */

const NODE_GUARD = `REPORT zcc_return_paths.
DATA gv_total TYPE p LENGTH 10 DECIMALS 2.
PARAMETERS p_org TYPE c LENGTH 4.
PARAMETERS p_limit TYPE p LENGTH 8 DECIMALS 2 DEFAULT '100.00'.

START-OF-SELECTION.
  IF p_org IS INITIAL.
    MESSAGE 'One sales organization is required' TYPE 'E'.
  ENDIF.
  PERFORM sum_up.

FORM sum_up.
  gv_total = gv_total + p_limit.
ENDFORM.
`;

test.describe('3 — a body that does not return on every path is its own error, not the engine\'s', () => {
  const p = prep(NODE_GUARD, 'node');
  const guard = p.plan.guards.find((g) => g.line === 7 && g.regionId)!;

  test('TS2355 / TS2366 on the signature line go back to the function whose body it is', () => {
    expect(guard, 'the guard at L7 has a predicate to fill').toBeTruthy();
    for (const [body, code] of [
      ['sel.org === null;', 'TS2355'],
      ['if (sel.org === null) return true;', 'TS2366'],
    ] as const) {
      const files = candidateFiles(p, new Map([[guard.regionId!, body]]));
      const r = typeCheckCandidate(files);
      expect(r.ran).toBe(true);
      if (!r.ran) continue;
      expect(r.findings.map((f) => f.code)).toEqual([code]);
      const spans = markerSpans(files);
      const span = spans.find((s) => s.path === 'srv/lib/guards.ts' && s.openLine === r.findings[0].line);
      expect(span, 'the error stands on the open line of a fill region').toBeTruthy();
      const mapped = mapTypeFindings(r.findings, spans);
      // Before: unitId null — "1 type error outside the written functions", never a repair reason.
      expect(mapped).toHaveLength(1);
      expect(mapped[0].unitId).toBe(guard.regionId!.split('.')[0]);
      // Since 3.0.14 (item 1) by the check whose predicate it is, with the function's name.
      expect(mapped[0].failure).toContain(`predicate ${guard.id} (${span!.fn}) — ${code}`);
      expect(mapped[0].failure).toContain('the body must return a value on every path');
    }
    // A complete body compiles.
    const ok = typeCheckCandidate(candidateFiles(p, new Map([[guard.regionId!, 'return sel.org === null;']])));
    expect(ok.ran && ok.findings).toEqual([]);
  });

  test('a type error in engine-written code stays the engine\'s, and the scaffold check before the fills names it', async () => {
    const mapped = mapTypeFindings([{ path: 'srv/lib/decimal.ts', line: 12, code: 'TS2355', message: 'A function … must return a value.' }], markerSpans(p.scaffold.files));
    expect(mapped.map((m) => m.unitId)).toEqual([null]);
    const answer = (errors: number): VerifyRunAnswer => ({
      mode: 'verify',
      types: { ran: true, typescript: '5.9.3', files: 40, failedFiles: errors ? 1 : 0, errors, findings: errors ? [{ path: 'srv/lib/guards.ts', line: 3, code: 'TS2355', message: 'must return a value' }] : [] },
      engine: { ran: false, reason: 'stub' },
      probes: { ran: false, reason: 'stub' },
    });
    const failing = await nodeScaffoldCheck(p.scaffold.files, async () => answer(1))(new AbortController().signal);
    expect(failing?.failures.map((f) => f.unitId)).toEqual([null, null]);
    expect(failing?.failures[0].failure).toContain('1 type error in the scaffold (TypeScript 5.9.3');
    expect(await nodeScaffoldCheck(p.scaffold.files, async () => answer(0))(new AbortController().signal)).toEqual({ failures: [] });
    expect(await nodeScaffoldCheck(p.scaffold.files, async () => ({ ...answer(0), types: { ran: false, reason: 'no compiler' } }))(new AbortController().signal)).toBeNull();
  });

  test('the loop does not end "passed" while engine code fails: it ends engine-code, the generation partial', async () => {
    const requestOf = (prompt: string): FillRequest => JSON.parse(prompt.slice(prompt.indexOf('REQUEST (JSON):\n') + 'REQUEST (JSON):\n'.length));
    const input: OrchestratorInput = {
      units: p.fillUnits,
      bundleOptions: { track: 'node', program: 'ZTEST', context: '' },
      model: async (prompt) => JSON.stringify({ units: requestOf(prompt).units.map((u) => ({ unitId: u.unitId, body: 'return;', guards: (u.guards ?? []).map((g) => ({ id: g.id, body: 'return false;' })), needs: [], refused: null })) }),
      guardBody: () => null,
      verify: async () => ({ checks: [{ kind: 'types', total: 10, failed: 1, ms: 1 }], failures: [{ unitId: null, check: 'types', failure: 'srv/lib/guards.ts: 1 type error outside the written functions' }], notRun: [] }),
      budget: 48,
      sleep: async () => {},
      now: () => 0,
    };
    const result = await runGeneration(input);
    expect(result.stop).toBe('engine-code');
    expect(result.status).toBe('partial');
    expect(result.scaffoldFindings).toEqual(['types: srv/lib/guards.ts: 1 type error outside the written functions']);
    const clean = await runGeneration({ ...input, verify: async () => ({ checks: [], failures: [], notRun: [] }) });
    expect(clean.stop).toBe('passed');
  });
});
