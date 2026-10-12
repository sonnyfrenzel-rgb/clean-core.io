import { test, expect } from '@playwright/test';
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
