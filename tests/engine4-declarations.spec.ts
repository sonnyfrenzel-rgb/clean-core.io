import { test, expect } from '@playwright/test';
import { readSource } from '../lib/engine4/index';
import { declarations } from '../lib/engine4/declarations';
import { runDeclarationShadow } from '../scripts/engine4/shadow-declarations';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Engine 4.0, L3 second half: class and interface declarations (`lib/engine4/declarations.ts`). Inert. The shadow
 * compares with today's `parseDeclarations` on the corpus; every difference is a named category. Server-free.
 */
const SOURCE = `INTERFACE lif_store PUBLIC.
  METHODS save IMPORTING is_row TYPE zrow RETURNING VALUE(rv_ok) TYPE abap_bool RAISING zcx_store.
  EVENTS saved EXPORTING VALUE(ev_id) TYPE i.
  DATA mv_name TYPE string READ-ONLY.
ENDINTERFACE.
CLASS lcl_base DEFINITION ABSTRACT CREATE PROTECTED FRIENDS lcl_test.
  PUBLIC SECTION.
    INTERFACES lif_store ABSTRACT METHODS save.
    ALIASES save FOR lif_store~save.
    CONSTANTS c_max TYPE i VALUE 10.
    CONSTANTS: BEGIN OF c_status, open TYPE c VALUE 'O', done TYPE c VALUE 'D', END OF c_status.
    CLASS-METHODS class_constructor.
    METHODS constructor IMPORTING iv_x TYPE i OPTIONAL iv_y TYPE string DEFAULT 'A'.
    METHODS on_saved FOR EVENT saved OF lif_store IMPORTING ev_id.
  PROTECTED SECTION.
    METHODS run ABSTRACT EXCEPTIONS failed.
    CLASS-DATA gt_rows TYPE STANDARD TABLE OF zrow WITH DEFAULT KEY.
  PRIVATE SECTION.
    DATA mo_log TYPE REF TO zcl_log.
    TYPES ty_id TYPE n LENGTH 10.
ENDCLASS.
CLASS lcl_impl DEFINITION INHERITING FROM lcl_base FINAL.
  PUBLIC SECTION.
    METHODS lif_store~save REDEFINITION.
  PROTECTED SECTION.
    METHODS run REDEFINITION.
ENDCLASS.
CLASS lcl_impl IMPLEMENTATION.
  METHOD lif_store~save. ENDMETHOD.
  METHOD run. ENDMETHOD.
ENDCLASS.
CLASS lcl_later DEFINITION DEFERRED.
CLASS lcl_base DEFINITION LOCAL FRIENDS lcl_x lcl_y.
`;

test('a class and an interface, every member with its section and flags', () => {
  const r = readSource(SOURCE);
  const d = declarations(r.statements, r.tree);
  expect(d.types.map((t) => `${t.kind} ${t.name}`)).toEqual(['interface LIF_STORE', 'class LCL_BASE', 'class LCL_IMPL']);
  const [intf, base, impl] = d.types;
  expect(intf.isGlobal).toBe(true);
  expect(intf.methods[0]).toMatchObject({ name: 'SAVE', raising: ['ZCX_STORE'] });
  expect(intf.methods[0].parameters).toEqual([
    { name: 'IS_ROW', direction: 'importing', passing: 'reference', type: { kind: 'value', name: 'ZROW' }, optional: false },
    { name: 'RV_OK', direction: 'returning', passing: 'value', type: { kind: 'value', name: 'ABAP_BOOL' }, optional: false },
  ]);
  expect(intf.events.map((e) => `${e.name} ${e.parameters.map((p) => p.name)}`)).toEqual(['SAVED EV_ID']);
  expect(intf.attributes[0]).toMatchObject({ name: 'MV_NAME', isReadOnly: true });
  expect(base).toMatchObject({ isAbstract: true, isFinal: false, create: 'protected', friends: ['LCL_TEST'] });
  expect(base.interfaces).toMatchObject([{ name: 'LIF_STORE', abstractMethods: ['SAVE'] }]);
  expect(base.aliases).toMatchObject([{ alias: 'SAVE', target: 'LIF_STORE~SAVE' }]);
  expect(base.attributes.map((a) => `${a.name} ${a.visibility} ${a.isStatic} ${a.isConstant} ${a.type.kind}:${a.type.name}`)).toEqual([
    'C_MAX public true true value:I', 'C_STATUS public true true generic:null', 'GT_ROWS protected true false value:ZROW', 'MO_LOG private false false ref:ZCL_LOG',
  ]);
  expect(base.methods.map((m) => `${m.name} ${m.visibility}${m.isStatic ? ' static' : ''}${m.isAbstract ? ' abstract' : ''}${m.isConstructor ? ' ctor' : ''}${m.isClassConstructor ? ' cctor' : ''}`)).toEqual([
    'CLASS_CONSTRUCTOR public static cctor', 'CONSTRUCTOR public ctor', 'ON_SAVED public', 'RUN protected abstract',
  ]);
  const ctor = base.methods[1];
  expect(ctor.parameters.map((p) => `${p.name} ${p.optional} ${p.default ?? '-'}`)).toEqual(['IV_X true -', "IV_Y true 'A'"]);
  expect(base.methods[2].handles).toEqual({ event: 'SAVED', of: 'LIF_STORE' });
  expect(base.methods[3].exceptions).toEqual(['FAILED']);
  expect(base.types).toEqual(['TY_ID']);
  expect(impl).toMatchObject({ superclass: 'LCL_BASE', isFinal: true });
  expect(impl.methods.map((m) => `${m.name} ${m.isRedefinition}`)).toEqual(['LIF_STORE~SAVE true', 'RUN true']);
  expect(d.implementations.map((i) => `${i.name} ${[...i.methods.keys()]}`)).toEqual(['LCL_IMPL LIF_STORE~SAVE,RUN']);
  expect(d.announced).toEqual(['LCL_LATER']);
  expect(d.localFriends).toEqual([{ name: 'LCL_BASE', friends: ['LCL_X', 'LCL_Y'] }]);
});

test('shadow against today\'s declaration parser: every difference named', () => {
  test.setTimeout(300_000);
  const r = runDeclarationShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.oldTypes).toBe(r.newTypes);
  expect(r.typesAgree).toBe(r.oldTypes);
  expect(Object.keys(r.categories).filter((k) => k.endsWith(':unexplained'))).toEqual([]);
  expect(r.members.agree).toBeGreaterThanOrEqual(420);
});
