import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { HandoverProject } from '../lib/handover';
import { buildRapScaffold, withTrace } from '../lib/transformation';
import { abapCheck } from '../lib/transformation/abap-check';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { abaplintConfigJson } from '../lib/transformation/abaplint-config';
import { traceMarkdown } from '../lib/transformation/trace';
import { ENGINE_COUNTERPART_TAG, engineCounterpartsIn, releasedCounterpartNames, releasedCounterpartOf } from '../lib/transformation/released-counterparts';
import { SCAFFOLD_VERSION, type Scaffold } from '../lib/transformation/types';
import { abapUnfinishedMethods, createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import { FIXTURES, fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * Scaffold version 13 — roadmap 3.0.15 item (1), from the second SAP import (owner decision 16.10.2026): the SD
 * package activated in an SAP BTP ABAP trial, but the access layer left a stub for every SAP function module the
 * original calls, raising `zcx_<x>_access`. For DATE_CHECK_PLAUSIBILITY the logic reads that exception as "the date
 * is implausible": every timestamp was invalid, and the program refused every run until someone wired the check.
 *
 * A function module on the curated list (`lib/transformation/released-counterparts.ts`) is now written by the engine
 * in ABAP Cloud language means — exact, and checked by abaplint and the released-object check. Fixtures only
 * (`contract-shape.abap` calls DATE_CHECK_PLAUSIBILITY), never the owner's programs. Server-free.
 */

const contractShape = () => fs.readFileSync(path.join(FIXTURES, 'contract-shape.abap'), 'utf8');

function rap(source: string): Scaffold {
  const { facts, plan } = planOf(source);
  return buildRapScaffold(plan, facts, {});
}
const file = (s: Scaffold, re: RegExp) => s.files.find((f) => re.test(f.path))!.content;
/** The body of one method of a class implementation. */
const method = (text: string, name: string) => new RegExp(`\\n  METHOD [\\w~]*${name}\\.\\n([\\s\\S]*?)\\n  ENDMETHOD\\.`).exec(text)?.[1] ?? '';

/** A small program around one call of DATE_CHECK_PLAUSIBILITY, as the SD shape writes it. */
const SYNTHETIC = (call: string) =>
  [
    'REPORT zfx_date_probe.',
    'PARAMETERS p_stamp TYPE c LENGTH 14.',
    'DATA gv_code TYPE c LENGTH 20.',
    'START-OF-SELECTION.',
    '  PERFORM check_stamp USING p_stamp CHANGING gv_code.',
    '  WRITE gv_code.',
    'FORM check_stamp USING iv_stamp TYPE c CHANGING cv_code TYPE c.',
    '  DATA lv_date TYPE d.',
    '  lv_date = iv_stamp(8).',
    call,
    '  IF sy-subrc <> 0.',
    "    cv_code = 'INVALID_TIMESTAMP'.",
    '  ENDIF.',
    'ENDFORM.',
    '',
  ].join('\n');

test('the scaffold version is 13', () => {
  expect(SCAFFOLD_VERSION).toBe(13);
  expect(rap(contractShape()).version).toBe(13);
});

test('the list holds DATE_CHECK_PLAUSIBILITY, and every entry says why it is exact', () => {
  expect(releasedCounterpartNames()).toContain('DATE_CHECK_PLAUSIBILITY');
  for (const name of releasedCounterpartNames()) {
    const c = releasedCounterpartOf(name)!;
    expect(c.why.length, name).toBeGreaterThan(40);
    expect(releasedCounterpartOf(name.toLowerCase())).toBe(c);
  }
  // Considered and left open on purpose: not exact for every input (the module says why).
  expect(releasedCounterpartOf('CONVERSION_EXIT_ALPHA_INPUT')).toBeNull();
  expect(releasedCounterpartOf('REUSE_ALV_GRID_DISPLAY')).toBeNull();
});

test.describe('DATE_CHECK_PLAUSIBILITY in the access layer', () => {
  test('the default access writes the check itself: no @cc-open stub that refuses every run', () => {
    const s = rap(contractShape());
    const cls = file(s, /_access\.clas\.abap$/);
    const body = method(cls, 'call_date_check_plausibility');
    expect(body).toContain(`${ENGINE_COUNTERPART_TAG} DATE_CHECK_PLAUSIBILITY`);
    expect(body).not.toContain('@cc-open');
    expect(body).toContain('DATA(lv_date) = CONV d( date ).');
    expect(body).toContain('IF CONV d( CONV i( lv_date ) ) <> lv_date.');
    // The exception is raised only where the function module raised PLAUSIBILITY_CHECK_FAILED — inside the IF.
    expect(body).toMatch(/IF CONV d\( CONV i\( lv_date \) \) <> lv_date\.\n\s+RAISE EXCEPTION NEW zcx_\w+_access\( object = 'DATE_CHECK_PLAUSIBILITY' \)\.\n\s+ENDIF\./);
    // Not an unfinished method any more; the SAP read beside it still is.
    const open = abapUnfinishedMethods(cls).map((m) => m.method);
    expect(open.some((m) => /call_date_check_plausibility/.test(m))).toBe(false);
    expect(open.some((m) => /read_vbak/.test(m))).toBe(true);
    expect(method(cls, 'read_vbak')).toContain('@cc-open ACCESS');
    expect(engineCounterpartsIn(cls)).toEqual(['DATE_CHECK_PLAUSIBILITY']);
  });

  test('the test double runs the same counterpart, so a test of an implausible date sees the refusal', () => {
    const s = rap(contractShape());
    const include = file(s, /\.clas\.testclasses\.abap$/);
    const double = /CLASS ltd_access IMPLEMENTATION\.([\s\S]*?)ENDCLASS\./.exec(include)![1];
    expect(method(double, 'call_date_check_plausibility')).toMatch(/CAST zif_\w+_access\( NEW zcl_\w+_access\( \) \)->call_date_check_plausibility\( date = date \)\./);
    expect(method(double, 'read_vbak')).toContain('No SAP in a test');
  });

  test('the package tests its own claim: ltc_counterparts asks the counterpart for every listed value in ABAP Unit', () => {
    const s = rap(contractShape());
    const include = file(s, /\.clas\.testclasses\.abap$/);
    expect(include).toContain('CLASS ltc_counterparts DEFINITION FINAL FOR TESTING');
    const body = method(include, 'counterpart_1');
    expect(body).toContain('DATA lv_in TYPE d.');
    for (const k of releasedCounterpartOf('DATE_CHECK_PLAUSIBILITY')!.cases) {
      expect(body).toContain(`lv_in = '${k.value}'.`);
      expect(body).toContain(k.raises ? `DATE_CHECK_PLAUSIBILITY must raise for ${k.value}` : `DATE_CHECK_PLAUSIBILITY must accept ${k.value}`);
    }
    // Both outcomes are on the list: valid dates and the initial date pass, an impossible date raises.
    const cases = releasedCounterpartOf('DATE_CHECK_PLAUSIBILITY')!.cases;
    expect(cases.find((k) => k.value === '00000000')?.raises).toBe(false);
    expect(cases.find((k) => k.value === '20230229')?.raises).toBe(true);
    // A package with no counterpart has no such class.
    expect(file(rap(fixture('sd-shape')), /\.clas\.testclasses\.abap$/)).not.toContain('ltc_counterparts');
  });

  test('abaplint (shipped config) and the released-object check pass the access class and the test include', () => {
    const s = rap(contractShape());
    const lint = abaplintPackageCheck(s.files);
    expect(lint.issues.filter((i) => /_access\.clas\.abap$|\.testclasses\.abap$/.test(i.path)), JSON.stringify(lint.issues.slice(0, 5))).toEqual([]);
    const check = abapCheck(s.files);
    expect(check.ran).toBe(true);
    if (check.ran) expect(check.findings.filter((f) => /_access\.clas\.abap$|\.testclasses\.abap$/.test(f.path))).toEqual([]);
  });

  test('a char field handed to the function module is converted to a date first, as its typed VALUE parameter does', () => {
    const s = rap(SYNTHETIC("  CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'\n    EXPORTING date = lv_date\n    EXCEPTIONS plausibility_check_failed = 1 OTHERS = 2."));
    const cls = file(s, /_access\.clas\.abap$/);
    expect(engineCounterpartsIn(cls)).toEqual(['DATE_CHECK_PLAUSIBILITY']);
    const check = abapCheck(s.files);
    if (check.ran) expect(check.findings.filter((f) => /_access\.clas\.abap$/.test(f.path) && (f.kind === 'parser' || f.kind === 'syntax'))).toEqual([]);
  });

  test('a call whose parameters are not the module’s one date stays an open stub — no guessing', () => {
    const s = rap(SYNTHETIC("  CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'\n    EXPORTING date = lv_date unknown = cv_code\n    EXCEPTIONS plausibility_check_failed = 1 OTHERS = 2."));
    const cls = file(s, /_access\.clas\.abap$/);
    expect(engineCounterpartsIn(cls)).toEqual([]);
    expect(cls).toContain('@cc-open ACCESS: the original calls DATE_CHECK_PLAUSIBILITY');
  });

  test('a function module not on the list stays an open stub (the SD shape and the PO demo)', () => {
    for (const src of [fixture('sd-shape'), poDemo()]) {
      const s = rap(src);
      const cls = s.files.find((f) => /_access\.clas\.abap$/.test(f.path))?.content ?? '';
      expect(engineCounterpartsIn(cls)).toEqual([]);
    }
  });
});

test.describe('the package says which SAP calls the engine replaced', () => {
  test('TRACE.md names them', () => {
    const { facts, plan } = planOf(contractShape());
    const scaffold = buildRapScaffold(plan, facts, {});
    const { trace } = withTrace(plan, scaffold, scaffold.files, []);
    expect(trace.engineCounterparts).toEqual(['DATE_CHECK_PLAUSIBILITY']);
    expect(traceMarkdown(trace)).toContain('SAP function modules written by the engine in ABAP Cloud language means, not left to connect: DATE_CHECK_PLAUSIBILITY');
    // A package with none says nothing about it.
    const sd = planOf(fixture('sd-shape'));
    const none = withTrace(sd.plan, buildRapScaffold(sd.plan, sd.facts, {}), buildRapScaffold(sd.plan, sd.facts, {}).files, []).trace;
    expect(none.engineCounterparts).toBeUndefined();
  });

  test('STATUS.md names them, read from the access class of the package', () => {
    const source = contractShape();
    const s = rap(source);
    const p = {
      id: 'p-contract',
      name: 'Contract case',
      userId: 'owner-uid',
      legacyCode: source,
      extensibilityRoute: 'In-App (ABAP Cloud)',
      s4Deployment: 'private',
      generatedCode: JSON.stringify(s.files.map((f) => ({ path: f.path, content: f.content }))),
    } as unknown as HandoverProject;
    const facts = deliveryFactsOf(p, {
      phases: workflowSteps(p),
      rules: ruleFactsOf(null as never),
      score: scoreFactsOf(p, null),
      generatedAt: '2026-10-16T12:00:00.000Z',
      appVersion: 'v3.0.15',
      referenceSection: '',
      documentationFromEngine: true,
    });
    const bundle = createDeliveryBundle();
    for (const f of s.files) bundle.file(f.path, f.content, 'generated');
    bundle.file('abaplint.json', abaplintConfigJson());
    const out = finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' });
    const status = out.files.find((f) => f.path === 'STATUS.md')!.content;
    expect(status).toContain('SAP calls the engine replaced with an exact counterpart in ABAP Cloud language means — written, nothing to connect: DATE_CHECK_PLAUSIBILITY.');
  });
});
