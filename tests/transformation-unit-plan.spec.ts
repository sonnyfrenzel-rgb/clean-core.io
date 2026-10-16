import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { PlanRefusal, fillGuardsOf, planUnits } from '../lib/transformation';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * The unit plan of the engine-led transformation (docs/design/engine-led-transformation.md §7):
 * one unit per reachable routine, event blocks into the orchestrator, tiny single-caller helpers
 * folded, unreachable and demo-data routines excluded, rule decisions applied. Server-free.
 *
 * The four review programs the design was measured on (CO 35, PP 25, SD 11, PO demo 19 fill
 * units) are not in the repository; `scripts/transformation/measure.ts` reproduces them from the
 * files. The PO demo is (public/starter-examples), so its count is pinned here; the other three
 * shapes are hand-written fixtures modelled on them.
 */

const names = (plan: ReturnType<typeof planOf>['plan']) => plan.units.map((u) => u.routine ?? u.kind);

test.describe('the PO demo, as measured for the design (§10)', () => {
  test('22 reachable of 35 routines, 13 unreachable, 3 folded — 19 fill units and the orchestrator', () => {
    const { plan } = planOf(poDemo());
    expect(plan.stats.routines).toBe(35);
    expect(plan.stats.reachable).toBe(22);
    expect(plan.stats.unreachable).toBe(13);
    expect(plan.stats.folded).toBe(3);
    expect(plan.stats.fixtures).toBe(0);
    expect(plan.stats.routineUnits).toBe(19);
    expect(plan.stats.units).toBe(20);
    expect(plan.units[0]).toMatchObject({ id: 'U00', kind: 'orchestrator', fn: 'runSteps', file: 'srv/process.ts' });
    expect(plan.notCarried.filter((n) => n.reason === 'unreachable')).toHaveLength(13);
    expect(plan.stats.overSoftBudget).toEqual([]);
  });

  test('every unit gets a stable id, a function name and a file of its own', () => {
    const { plan } = planOf(poDemo());
    const ids = plan.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(plan.units.map((u) => u.fn)).size).toBe(ids.length);
    expect(new Set(plan.units.map((u) => u.file)).size).toBe(ids.length);
    for (const u of plan.units.slice(1)) {
      expect(u.file).toMatch(/^srv\/steps\/\d{2}-[a-z0-9-]+\.ts$/);
      expect(u.signature).toContain(`export function ${u.fn}(sel: Selection, st: RunState`);
      expect(u.abap[0].routine).toBe(u.routine);
    }
    expect(planOf(poDemo()).plan.digest).toBe(plan.digest);
  });
});

test.describe('the CO shape', () => {
  const { plan } = planOf(fixture('co-shape'));

  test('reachable routines are units; a helper with two callers is shared; tiny single-caller helpers fold', () => {
    expect(names(plan)).toEqual(['orchestrator', 'READ_RECEIVERS', 'VALIDATE_POLICY', 'ALLOCATE', 'CSV_CELL']);
    // ROUND_CENTS: 3 lines, one caller → into ALLOCATE's slice. EXPORT_CSV is performed by START-OF-SELECTION
    // only → into the orchestrator, and its own helper WRITE_TOTAL with it. CSV_CELL has two callers → a unit.
    expect(plan.folded).toEqual(
      expect.arrayContaining([
        { routine: 'ROUND_CENTS', into: 'U03' },
        { routine: 'EXPORT_CSV', into: 'U00' },
        { routine: 'WRITE_TOTAL', into: 'U00' },
      ]),
    );
    const allocate = plan.units.find((u) => u.routine === 'ALLOCATE')!;
    expect(allocate.abap.map((a) => a.routine)).toEqual(['ALLOCATE', 'ROUND_CENTS']);
  });

  test('demo data is a fixture — by its name, even when tiny, and when reached only from demo routines', () => {
    expect(plan.notCarried.filter((n) => n.reason === 'fixture').map((n) => n.routine)).toEqual(['LOAD_DEMO_RECEIVERS', 'ADD_DEMO_LINE', 'SET_DEMO_YEAR']);
    expect(plan.notCarried.filter((n) => n.reason === 'unreachable').map((n) => n.routine)).toEqual(['OBSOLETE_REPORT']);
    // The check inside SET_DEMO_YEAR is not carried: its routine is demo data.
    const demoCheck = plan.guards.find((g) => g.condition.startsWith('lv_year <> p_gjahr'))!;
    expect(demoCheck).toMatchObject({ carried: false, place: 'not-carried', unitId: null, regionId: null });
  });

  test('"sample" is not demo data: a routine that judges an inspection sample is carried, sample data is not (scaffold 15)', () => {
    // The QM acceptance program (16.10.2026): ASSESS_SAMPLE, the routine that judges each sample, matched
    // the old /SAMPLE/ and was dropped as a fixture with its checks.
    const source = [
      'REPORT zqm_sample_shape.',
      'TYPES: BEGIN OF ty_sample, id TYPE i, measured TYPE p DECIMALS 2, known TYPE c LENGTH 1, END OF ty_sample.',
      'DATA: gt_samples TYPE STANDARD TABLE OF ty_sample, gs_sample TYPE ty_sample, gv_reason TYPE string.',
      'START-OF-SELECTION.',
      '  PERFORM load_sample_data.',
      '  LOOP AT gt_samples INTO gs_sample.',
      '    PERFORM assess_sample USING gs_sample CHANGING gv_reason.',
      '  ENDLOOP.',
      'FORM assess_sample USING is_s TYPE ty_sample CHANGING cv_reason TYPE string.',
      '  IF is_s-known IS INITIAL.',
      "    cv_reason = 'MISSING_MEASUREMENT'.",
      '    RETURN.',
      '  ENDIF.',
      '  IF is_s-measured < 0.',
      "    cv_reason = 'NEGATIVE_MEASUREMENT'.",
      '    RETURN.',
      '  ENDIF.',
      "  cv_reason = 'OK'.",
      'ENDFORM.',
      'FORM load_sample_data.',
      '  gs_sample-id = 1. gs_sample-measured = 4. gs_sample-known = abap_true.',
      '  APPEND gs_sample TO gt_samples.',
      'ENDFORM.',
    ].join('\n');
    const { plan } = planOf(source);
    expect(plan.notCarried.filter((n) => n.reason === 'fixture').map((n) => n.routine)).toEqual(['LOAD_SAMPLE_DATA']);
    expect(plan.units.map((u) => u.routine)).toContain('ASSESS_SAMPLE');
    const checks = plan.guards.filter((g) => g.line >= 9 && g.line <= 19);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((g) => g.carried)).toBe(true);
  });

  test('the demo cases are demo data by their shape: the baseline and the case switch, whatever their names (scaffold 15)', () => {
    // The QM acceptance program builds its baseline in BUILD_BASELINE (580 lines of literal rows) and the PM
    // program switches its cases in APPLY_CASE; neither name says demo, and both went to the model to fill.
    const original = fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap'), 'utf8');
    const source = original.replace(/build_demo/gi, 'build_baseline');
    const { plan } = planOf(source);
    const fixtures = plan.notCarried.filter((n) => n.reason === 'fixture').map((n) => n.routine);
    expect(fixtures).toEqual(expect.arrayContaining(['BUILD_BASELINE', 'APPLY_CASE', 'ADD_CLAIM', 'ADD_RATE']));
    // CREDIT, the logic, is carried — folded into the orchestrator, as a small routine with one caller is.
    expect(plan.units.some((u) => u.abap.some((a) => a.routine === 'CREDIT'))).toBe(true);
    expect(plan.units.map((u) => u.routine)).not.toContain('APPLY_CASE');
  });

  test('guards: the selection-screen check belongs to the orchestrator; a routine calls its refusing guards first', () => {
    const screen = plan.guards.find((g) => g.line === 29)!;
    expect(screen).toMatchObject({ id: 'G-0029', place: 'selection-screen', unitId: 'U00', outcome: 'refuses', regionId: 'U00.G0029' });
    expect(plan.units[0].guardCalls).not.toContain('G-0029');
    const validate = plan.units.find((u) => u.routine === 'VALIDATE_POLICY')!;
    expect(validate.guards).toEqual(['G-0054', 'G-0058', 'G-0061', 'G-0066']);
    // Raw checks (the records and the selection) at the entry; the check on the computed sum where the original makes it.
    expect(validate.guardCalls).toEqual(['G-0054', 'G-0058', 'G-0061']);
    expect(validate.bodyCalls).toEqual(['G-0066']);
    // CHECK inside a loop skips a record: a helper of the body, not called before the marker.
    const skip = plan.guards.find((g) => g.condition.startsWith('<ls_rcv>-quota > 0'))!;
    expect(skip.outcome).toBe('skips');
    expect(skip.helper).toMatch(/^skip_/);
    expect(plan.units.find((u) => u.routine === 'ALLOCATE')!.guardCalls).toEqual([]);
  });

  test('raw checks run first; a check on a computed value keeps its place and takes the computed values (QA 4e9d1315469d)', () => {
    const g = (line: number) => plan.guards.find((x) => x.line === line)!;
    expect(g(29)).toMatchObject({ basis: 'raw', placement: 'selection' });
    expect(g(58)).toMatchObject({ basis: 'raw', placement: 'entry', operands: [] }); // ls_rcv-kostl = p_sender: input record and selection
    expect(g(61)).toMatchObject({ basis: 'raw', placement: 'entry', op: '>', literals: ['100'] });
    expect(g(66)).toMatchObject({ basis: 'derived', placement: 'body', operands: [{ name: 'lv_sum', key: 'lvSum' }], op: '>', literals: ['100'] });
    expect(g(66).basisReason).toBe('lv_sum is written at L64 in VALIDATE_POLICY');
    expect(g(47)).toMatchObject({ basis: 'derived', placement: 'body', operands: [{ name: 'sy-subrc', key: 'sySubrc' }] });
    expect(g(74)).toMatchObject({ basis: 'raw', placement: 'body', outcome: 'skips' });
    expect(plan.units.find((u) => u.routine === 'READ_RECEIVERS')!).toMatchObject({ guardCalls: [], bodyCalls: ['G-0047'] });
    expect(plan.units.find((u) => u.routine === 'ALLOCATE')!.bodyCalls).toEqual(['G-0074']);
    const listed = fillGuardsOf(plan, 'U02');
    expect(listed.map((x) => [x.id, x.placement, x.regionId, x.values])).toEqual([
      ['G-0054', 'entry', 'U02.G0054', []],
      ['G-0058', 'entry', 'U02.G0058', []],
      ['G-0061', 'entry', 'U02.G0061', []],
      ['G-0066', 'body', 'U02.G0066', ['lvSum']],
    ]);
  });

  test('base values come from the original: DEFAULT, demo data, checks — never a placeholder', () => {
    const base = Object.fromEntries(plan.fields.filter((f) => f.where !== 'internal').map((f) => [f.original, f.base]));
    expect(base.P_KOKRS).toEqual({ value: 'A100', source: 'default' });
    expect(base.P_DEMO).toEqual({ value: true, source: 'default' });
    expect(base.P_SENDER).toEqual({ value: 'C900', source: 'demo' }); // set by LOAD_DEMO_RECEIVERS
    expect(base.QUOTA).toEqual({ value: '40.00', source: 'demo' }); // handed to ADD_DEMO_LINE, put into the record
    expect(base.AMOUNT).toEqual({ value: '1000.00', source: 'demo' });
    expect(base.KOSTL).toEqual({ value: 'C100', source: 'demo' });
    expect(base.P_GJAHR).toEqual({ value: '1900', source: 'guard' }); // passes "p_gjahr < '1900' OR p_gjahr > '2199'"
    expect(plan.missingBaseValues).toEqual([]);
    // No source: the obligatory fields are listed, never filled with a guess.
    const sd = planOf(fixture('sd-shape')).plan;
    expect(sd.missingBaseValues).toEqual(['NETWR', 'P_VKORG']);
    expect(sd.fields.find((f) => f.original === 'P_DISCNT')!.base).toEqual({ value: '2.50', source: 'default' });
    expect(sd.fields.find((f) => f.original === 'P_FROM')!.base).toBeNull();
  });

  test('the request: obligatory selection, packed record fields with their bounds, working decimals internal', () => {
    const byName = Object.fromEntries(plan.fields.map((f) => [f.original, f]));
    expect(byName.P_GJAHR).toMatchObject({ path: 'gjahr', kind: 'digits', digits: 4, obligatory: true });
    expect(byName.P_KOKRS).toMatchObject({ path: 'kokrs', kind: 'text', obligatory: true, defaultValue: "'A100'" });
    expect(byName.P_DEMO).toMatchObject({ kind: 'flag' });
    expect(byName.QUOTA).toMatchObject({ path: 'records[].quota', kind: 'packed', digits: 7, places: 2, max: '99999.99', obligatory: true });
    expect(byName.KOSTL).toMatchObject({ path: 'records[].kostl', kind: 'text', obligatory: false });
    expect(byName.GV_TOTAL).toMatchObject({ path: null, where: 'internal', digits: 15, places: 2 });
    expect(plan.csvDelimiter).toBe(';');
  });

  test('rule decisions: DROP removes the rule and its guard, CHANGE carries the proposal, no answer is OPEN', () => {
    const open = planOf(fixture('co-shape')).plan;
    expect(open.rules.every((r) => r.decision === 'open')).toBe(true);
    const decided = planOf(fixture('co-shape'), {
      decisions: [
        { id: 'BR-003', answer: 'drop', note: 'No longer a policy.' },
        { id: 'BR-004', answer: 'change', note: 'The sum of quotas may reach 120.' },
        { id: 'BR-002', answer: 'clarify', note: 'Which years?' },
      ],
    }).plan;
    const rule = (id: string) => decided.rules.find((r) => r.id === id)!;
    expect(rule('BR-003')).toMatchObject({ decision: 'drop', unitId: null });
    expect(rule('BR-004')).toMatchObject({ decision: 'change', proposal: 'The sum of quotas may reach 120.', unitId: 'U02' });
    expect(rule('BR-002').decision).toBe('open');
    const dropped = decided.guards.find((g) => g.rule === 'BR-003')!;
    expect(dropped).toMatchObject({ carried: false, decision: 'drop', unitId: null });
    const validate = decided.units.find((u) => u.routine === 'VALIDATE_POLICY')!;
    expect(validate.rules).toEqual(['BR-004']);
    expect(validate.guards).not.toContain(dropped.id);
    expect(decided.digest).not.toBe(open.digest);
    expect(decided.stats.rules).toEqual({ keep: 0, change: 1, drop: 1, open: 1 });
  });
});

test.describe('the PP and SD shapes', () => {
  test('PP: RETURN stops the step, CONTINUE and CHECK in a loop skip; the demo loader is a fixture', () => {
    const { plan } = planOf(fixture('pp-shape'));
    expect(names(plan)).toEqual(['orchestrator', 'READ_COMPONENTS', 'CHECK_COVERAGE', 'DISPLAY']);
    expect(plan.folded).toEqual([{ routine: 'WRITE_LINE', into: 'U03' }]);
    expect(plan.notCarried.map((n) => `${n.routine}:${n.reason}`)).toEqual(['LOAD_DEMO:fixture']);
    expect(plan.guards.map((g) => `${g.id}:${g.outcome}`)).toEqual(['G-0039:stops', 'G-0053:skips', 'G-0068:skips']);
    expect(plan.units.find((u) => u.routine === 'READ_COMPONENTS')!.guardCalls).toEqual(['G-0039']);
    const range = plan.fields.find((f) => f.original === 'S_MATNR')!;
    expect(range).toMatchObject({ kind: 'range', path: 'matnr' });
  });

  test('SD: the ALV callback is a reachable unit the orchestrator reaches; dialog modules stand in the orchestrator', () => {
    const { plan } = planOf(fixture('sd-shape'));
    expect(names(plan)).toEqual(['orchestrator', 'READ_ORDERS', 'USER_COMMAND', 'APPLY_DISCOUNT']);
    const orch = plan.units[0];
    expect(orch.folded).toEqual(['SHOW_ALV']);
    expect(orch.callees).toEqual(['U01', 'U02']);
    expect(orch.abap.map((a) => a.routine)).toEqual(expect.arrayContaining(['START-OF-SELECTION', 'END-OF-SELECTION', 'STATUS_0100', 'USER_COMMAND_0100', 'SHOW_ALV']));
    expect(plan.units.find((u) => u.routine === 'USER_COMMAND')!.callees).toEqual(['U03']);
    // LEAVE TO SCREEN in the PAI module: a check of the orchestrator, called before its body.
    expect(plan.guards.find((g) => g.line === 77)).toMatchObject({ place: 'orchestrator', unitId: 'U00' });
    expect(orch.guardCalls).toContain('G-0077');
  });
});

test('record fields are what the original takes as input — computed components are results, never request fields', () => {
  const pp = planOf(fixture('pp-shape')).plan;
  const where = (plan: typeof pp, name: string) => plan.fields.find((f) => f.original === name)?.where ?? 'absent';
  // GT_COMP is read from RESB: its quantities are input; STATUS is set by CHECK_COVERAGE — a result.
  expect(['BDMNG', 'ENMNG', 'LABST', 'MATNR'].map((n) => where(pp, n))).toEqual(['record', 'record', 'record', 'record']);
  expect(where(pp, 'STATUS')).toBe('absent');
  const source = [
    'REPORT zfx_records.',
    'TYPES: BEGIN OF ty_in,',
    '         vbeln TYPE vbeln_va,',
    '         netwr TYPE p LENGTH 8 DECIMALS 2,',
    '         calc_discount TYPE p LENGTH 8 DECIMALS 2,',
    '       END OF ty_in.',
    'TYPES: BEGIN OF ty_work,',
    '         rem_num TYPE p LENGTH 16 DECIMALS 0,',
    '       END OF ty_work.',
    'DATA gt_in TYPE STANDARD TABLE OF ty_in WITH EMPTY KEY.',
    'DATA gs_work TYPE ty_work.',
    "PARAMETERS p_vkorg TYPE vkorg OBLIGATORY DEFAULT '1000'.",
    'START-OF-SELECTION.',
    '  SELECT vbeln, netwr FROM vbak WHERE vkorg = @p_vkorg INTO CORRESPONDING FIELDS OF TABLE @gt_in.',
    '  LOOP AT gt_in ASSIGNING FIELD-SYMBOL(<ls_in>).',
    '    <ls_in>-calc_discount = <ls_in>-netwr * 2 / 100.',
    '    gs_work-rem_num = gs_work-rem_num + 1.',
    '  ENDLOOP.',
  ].join('\n');
  const { plan } = planOf(source);
  expect(where(plan, 'NETWR')).toBe('record');
  expect(where(plan, 'VBELN')).toBe('record');
  expect(plan.fields.find((f) => f.original === 'CALC_DISCOUNT')).toMatchObject({ where: 'internal', path: null, obligatory: false });
  expect(plan.fields.find((f) => f.original === 'REM_NUM')).toMatchObject({ where: 'internal', path: null, obligatory: false });
  expect(plan.missingBaseValues).toEqual(['NETWR']);
});

test('a guard names the same rule as the engine case on its line, on every fixture', () => {
  for (const source of [poDemo(), fixture('co-shape'), fixture('pp-shape'), fixture('sd-shape')]) {
    const { facts, plan } = planOf(source);
    const cases = deriveEngineCases(facts.source, facts.ruleSet.rules).cases.filter((c) => c.engineCase.family === 'guard');
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      const line = c.engineCase.trace.lines[0].start;
      const guard = plan.guards.find((g) => g.line === line);
      expect(guard, `guard at L${line}`).toBeTruthy();
      expect(guard!.rule).toBe(c.engineCase.trace.ruleId ?? null);
    }
  }
});

test('a routine above the hard budget is split into parts at its top-level statements', () => {
  const body = Array.from({ length: 330 }, (_, i) => `  lv_total = lv_total + ${i + 1}.`).join('\n');
  const source = `REPORT zfx_big.\nDATA lv_total TYPE i.\nSTART-OF-SELECTION.\n  PERFORM big.\nFORM big.\n${body}\n  IF lv_total > 1000.\n    MESSAGE e001(zz).\n  ENDIF.\nENDFORM.\n`;
  const { plan } = planOf(source);
  expect(plan.stats.split).toEqual(['BIG']);
  const parts = plan.units.filter((u) => u.part);
  expect(parts.length).toBe(2);
  for (const p of parts) {
    expect(p.part!.parent).toBe('U01');
    expect(p.abap[0].lineEnd - p.abap[0].lineStart + 1).toBeLessThanOrEqual(300);
  }
  // The check at the end belongs to the part that holds it.
  const guard = plan.guards[0];
  expect(guard.unitId).toBe(parts[parts.length - 1].id);
});

test('more than 120 units refuse the plan (the single-call fallback runs, §16.2)', () => {
  const forms = Array.from({ length: 125 }, (_, i) => `FORM step_${i}.\n${Array.from({ length: 12 }, (_, j) => `  lv_x = lv_x + ${j}.`).join('\n')}\nENDFORM.`).join('\n');
  const calls = Array.from({ length: 125 }, (_, i) => `  PERFORM step_${i}.`).join('\n');
  const source = `REPORT zfx_many.\nDATA lv_x TYPE i.\nSTART-OF-SELECTION.\n${calls}\n${forms}\n`;
  expect(() => planUnits(source)).toThrow(PlanRefusal);
});

test('a routine named CONSTRUCTOR never becomes the RAP logic class constructor; RAP names stay unique and within 30 characters', () => {
  // abaplint check_syntax on Z_ORDER_INTEGRITY_CHECK: `METHODS constructor IMPORTING is_sel … CHANGING cs_st` —
  // an instance constructor cannot have CHANGING parameters, and NEW zcl_…_logic( ) then lacks is_sel.
  const big = (n: string) => `${n}.\n${Array.from({ length: 12 }, (_, j) => `  lv_x = lv_x + ${j}.`).join('\n')}\n`;
  const source = [
    'REPORT zfx_ctor.',
    'DATA lv_x TYPE i.',
    'CLASS lcl_order DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS constructor.',
    '    METHODS class_constructor_like.',
    'ENDCLASS.',
    'CLASS lcl_order IMPLEMENTATION.',
    `  ${big('METHOD constructor')}  ENDMETHOD.`,
    `  ${big('METHOD class_constructor_like')}  ENDMETHOD.`,
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  DATA(lo_order) = NEW lcl_order( ).',
    '  lo_order->class_constructor_like( ).',
    '  PERFORM constructor.',
    '  PERFORM class_constructor.',
    big('FORM constructor') + 'ENDFORM.',
    big('FORM class_constructor') + 'ENDFORM.',
    '',
  ].join('\n');
  const { plan } = planOf(source);
  const rap = plan.units.filter((u) => u.kind !== 'orchestrator').map((u) => u.rapName);
  expect(rap.length).toBeGreaterThanOrEqual(3);
  for (const name of rap) {
    expect(['constructor', 'class_constructor', 'run_steps', 'run_process']).not.toContain(name);
    expect(name.length).toBeLessThanOrEqual(30);
  }
  expect(new Set(rap).size).toBe(rap.length);
  // The original's name stays the unit's anchor in the trace.
  expect(plan.units.filter((u) => /^(?:LCL_ORDER=>)?CONSTRUCTOR$|CONSTRUCTOR$/.test(u.routine ?? '')).length).toBeGreaterThan(0);
});
