import { test, expect } from '@playwright/test';
import { prepareEngineLed, preflightFactsOf, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { preflight } from '../lib/transformation/preflight';
import { TRANSFORMATION_CODES } from '../lib/transformation/error-codes';
import { attributeCollisionReason } from '../lib/transformation/rap-contract';
import { ENGINE_RUNTIME_JS } from '../lib/test-sandbox/engine-runtime';
import { readExample } from './helpers/starter-example-files';

/**
 * Two owner decisions of 22.10.2026 for the generation (release 3.0.20, scaffold version 22):
 *
 *   1. RAP: two different local classes declaring an attribute of the same name are no longer merged into one
 *      attribute of the logic class — the program is refused, before any lease or model call, with the classes, their
 *      lines and the name. A class attribute that is also a global name stays the global's, as before. The Node track
 *      carries no class attributes, so it has nothing to merge and nothing to refuse.
 *   2. The engine-case runtime's reason for a case the original's authorization check refused is worded so it is true
 *      in the package's own run and in the app's sandbox, which always grants.
 *
 * Server-free.
 */

function prep(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(`${track}: ${p.reason}`);
  return p;
}

const logicOf = (p: EngineLedPrepared) => p.scaffold.files.find((f) => f.path.endsWith('_logic.clas.abap'))!.content;

/** Two local classes, each with its own `mv_total`; both also declare `gv_status`, which the program declares globally. */
const CLASH = [
  'REPORT zcc_attr_clash.', // 1
  'DATA gv_status TYPE c LENGTH 1.', // 2
  'CLASS lcl_order DEFINITION.', // 3
  '  PUBLIC SECTION.', // 4
  '    DATA mv_total TYPE p LENGTH 8 DECIMALS 2.', // 5
  '    DATA gv_status TYPE c LENGTH 1.', // 6
  '    METHODS add IMPORTING iv_amount TYPE i.', // 7
  'ENDCLASS.', // 8
  'CLASS lcl_item DEFINITION.', // 9
  '  PUBLIC SECTION.', // 10
  '    DATA mv_total TYPE i.', // 11
  '    DATA gv_status TYPE c LENGTH 1.', // 12
  '    METHODS count.', // 13
  'ENDCLASS.', // 14
  'CLASS lcl_order IMPLEMENTATION.', // 15
  '  METHOD add.', // 16
  '    mv_total = mv_total + iv_amount.', // 17
  '  ENDMETHOD.', // 18
  'ENDCLASS.', // 19
  'CLASS lcl_item IMPLEMENTATION.', // 20
  '  METHOD count.', // 21
  '    mv_total = mv_total + 1.', // 22
  '  ENDMETHOD.', // 23
  'ENDCLASS.', // 24
  'START-OF-SELECTION.', // 25
  '  DATA(lo_order) = NEW lcl_order( ).', // 26
  '  lo_order->add( 10 ).', // 27
  '  DATA(lo_item) = NEW lcl_item( ).', // 28
  '  lo_item->count( ).', // 29
  "  IF gv_status = 'X'.", // 30
  "    WRITE / 'done'.", // 31
  '  ENDIF.', // 32
].join('\n');

/** The same program with distinct attribute names: only the global-name case is left. */
const GLOBAL_ONLY = CLASH.replace('    DATA mv_total TYPE i.', '    DATA mv_count TYPE i.').replace('    mv_total = mv_total + 1.', '    mv_count = mv_count + 1.');

const CLASH_REASON =
  'The local classes LCL_ORDER (L5) and LCL_ITEM (L11) both declare the attribute mv_total. The ABAP Cloud package holds ' +
  "the original's classes as one logic class with one attribute per name, so these would silently share one value — " +
  'generation is refused for this program.';

test.describe('decision 1 — two local classes with an attribute of the same name are refused (RAP)', () => {
  test('the scaffold carries the refusal: the classes, their lines and the name', () => {
    const p = prep(CLASH, 'rap');
    expect(p.scaffold.refusal).toEqual({ code: 'rap-attribute-collision', detail: CLASH_REASON });
  });

  test('the pre-flight check blocks the start with that reason, before any limit', () => {
    const p = prep(CLASH, 'rap');
    const check = preflight({ ...preflightFactsOf(p, 'PLATFORM KNOWLEDGE (test)'), window: { used: 99, limit: 1, nextFreeInSeconds: 60 } });
    expect(check.blocked).toMatchObject({
      code: 'rap-attribute-collision',
      label: 'rap-attribute-collision',
      title: TRANSFORMATION_CODES['rap-attribute-collision'].title,
      detail: CLASH_REASON,
      kind: 'change',
    });
    expect(check.notWritten).toEqual([]);
  });

  test('three classes on one name are named together; several names each in their own clause', () => {
    expect(
      attributeCollisionReason([
        { name: 'mv_a', classes: [{ name: 'LCL_X', line: 4 }, { name: 'LCL_Y', line: 9 }, { name: 'LCL_Z', line: 14 }] },
        { name: 'mv_b', classes: [{ name: 'LCL_X', line: 5 }, { name: 'LCL_Y', line: 10 }] },
      ]),
    ).toBe(
      'The local classes LCL_X (L4), LCL_Y (L9) and LCL_Z (L14) all declare the attribute mv_a; LCL_X (L5) and LCL_Y (L10) both ' +
        "declare the attribute mv_b. The ABAP Cloud package holds the original's classes as one logic class with one attribute " +
        'per name, so these would silently share one value — generation is refused for this program.',
    );
    expect(attributeCollisionReason([])).toBeNull();
  });

  test('a class attribute that is also a global name stays the global\'s: no refusal, declared once', () => {
    const p = prep(GLOBAL_ONLY, 'rap');
    expect(p.scaffold.refusal).toBeUndefined();
    expect(preflight({ ...preflightFactsOf(p, 'PLATFORM KNOWLEDGE (test)'), window: null }).blocked).toBeNull();
    const logic = logicOf(p);
    expect(logic.match(/\n {4}DATA gv_status /g) ?? []).toHaveLength(1);
    for (const a of ['mv_total', 'mv_count']) expect(logic.match(new RegExp(`\\n {4}DATA ${a} `, 'g')) ?? [], a).toHaveLength(1);
  });

  test('inherited attributes are declared once by their class: the order-integrity example is not refused', () => {
    const p = prep(readExample('Z_ORDER_INTEGRITY_CHECK.txt'), 'rap');
    expect(p.scaffold.refusal).toBeUndefined();
  });

  test('the Node track carries no class attributes, so it merges nothing and refuses nothing', () => {
    const p = prep(CLASH, 'node');
    expect(p.scaffold.refusal).toBeUndefined();
    // The program's globals reach the Node package as `Locals`; the classes' attributes are not among them.
    const types = p.scaffold.files.find((f) => f.content.includes('export interface Locals {'));
    expect(types, 'a file declares Locals').toBeDefined();
    const locals = types!.content.slice(types!.content.indexOf('export interface Locals {'));
    expect(locals.slice(0, locals.indexOf('\n}'))).toMatch(/\bgvStatus\b/);
    expect(locals.slice(0, locals.indexOf('\n}'))).not.toMatch(/\bmvTotal\b/);
  });
});

test.describe('decision 2 — the authority wording of the engine-case runtime', () => {
  test('one neutral sentence, true in the package\'s own run and in the app\'s sandbox', () => {
    expect(ENGINE_RUNTIME_JS).toContain('denies every check until it is granted (${AUTHORITY_DEMO_ENV}=grant, test only), and the authority check refused it');
    expect(ENGINE_RUNTIME_JS).not.toContain('this run did not grant it');
  });
});
