import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  abapLineForTargetLine,
  firstAbapLine,
  syncNote,
  syncScopeOf,
  targetLineForAbapLine,
  unitAtAbapLine,
  type FileSync,
} from '../lib/transformation/scroll-sync';
import type { Trace, TraceUnit } from '../lib/transformation/types';

/**
 * Roadmap 3.0.14, item 6 (owner decision 15.10.2026): side by side scrolls by
 * the trace, not by percent. Server-free: the mapping line → unit → line in
 * both directions, the nearest preceding unit, a package without traceability
 * and a file without a trace link. The rendered half is
 * `tests/transformation-scroll-sync-rendered.spec.ts`.
 */

const LOGIC = 'src/zcl_sd_cr_logic.clas.abap';

const unit = (unitId: string, fn: string, file: string, abap: Array<[number, number]>, kind: TraceUnit['kind'] = 'routine'): TraceUnit =>
  ({
    unitId,
    fn,
    file,
    title: unitId,
    kind,
    abap: abap.map(([lineStart, lineEnd]) => ({ lineStart, lineEnd })),
    rules: [],
    guards: [],
    filledBy: 'model',
    checks: { lint: null, cases: null, probes: null },
  }) as unknown as TraceUnit;

const trace = (units: TraceUnit[]): Trace =>
  ({
    format: 'clean-core.traceability/1',
    program: 'ZSD_RETURN_CREDIT_RECON',
    sourceSha256: 'x',
    contextDigest: null,
    scaffoldVersion: 11,
    planDigest: 'p',
    scaffoldDigest: 's',
    runId: null,
    functions: [],
    units,
    notCarried: [],
    openRules: [],
    droppedRules: [],
  }) as Trace;

// The logic class: a helper of the engine's at line 4, then the three units' methods.
const LOGIC_CLASS = [
  'CLASS zcl_sd_cr_logic IMPLEMENTATION.', // 1
  '', // 2
  '', // 3
  '  METHOD build_context.', // 4  engine helper, no unit
  '  ENDMETHOD.', // 5
  '  METHOD read_claims.', // 6  U01
  '    " body', // 7
  '  ENDMETHOD.', // 8
  '  method CONVERT_QUANTITIES.', // 9  U02 (case differs from the trace)
  '  ENDMETHOD.', // 10
  '  METHOD zif_sd_cr_access~select_claims.', // 11 interface method, no unit
  '  ENDMETHOD.', // 12
  '  METHOD post_results.', // 13 U03
  '  ENDMETHOD.', // 14
  'ENDCLASS.', // 15
].join('\n');

const RAP = trace([
  unit('U00', 'run', LOGIC, [[1000, 1200]], 'orchestrator'),
  unit('U01', 'read_claims', LOGIC, [[100, 180]]),
  unit('U02', 'convert_quantities', LOGIC, [[200, 260], [900, 920]]),
  unit('U03', 'post_results', LOGIC, [[1051, 1100]]),
  unit('U04', 'notify', 'src/zcl_sd_cr_notify.clas.abap', [[300, 340]]),
]);

function fileOf(t: Trace, p: string, content: string): FileSync {
  const scope = syncScopeOf(t, p, content);
  if (!scope.applies) throw new Error(`expected ${p} to sync, got ${scope.reason}`);
  return scope.file;
}

test('a line of the original brings the function of its unit to the top', () => {
  const file = fileOf(RAP, LOGIC, LOGIC_CLASS);
  expect(targetLineForAbapLine(RAP, file, 100)).toEqual({ unitId: 'U01', line: 6 });
  expect(targetLineForAbapLine(RAP, file, 150)).toEqual({ unitId: 'U01', line: 6 });
  expect(targetLineForAbapLine(RAP, file, 230)).toEqual({ unitId: 'U02', line: 9 });
  // A unit with two ABAP ranges is reached from either.
  expect(targetLineForAbapLine(RAP, file, 905)).toEqual({ unitId: 'U02', line: 9 });
  // The owner's example: line 1051 of the original sits next to its own function — the narrowest
  // range wins over the orchestrator that spans it.
  expect(targetLineForAbapLine(RAP, file, 1051)).toEqual({ unitId: 'U03', line: 13 });
});

test('between units, the nearest preceding one; before the first, none', () => {
  const file = fileOf(RAP, LOGIC, LOGIC_CLASS);
  expect(unitAtAbapLine(RAP, 190)?.unitId).toBe('U01');
  expect(unitAtAbapLine(RAP, 500)?.unitId).toBe('U04'); // ended at 340, the last before 500
  expect(targetLineForAbapLine(RAP, file, 190)).toEqual({ unitId: 'U01', line: 6 });
  expect(unitAtAbapLine(RAP, 12)).toBeNull();
  expect(targetLineForAbapLine(RAP, file, 12)).toBeNull();
});

test('a unit whose function is not in the open file moves nothing', () => {
  const file = fileOf(RAP, LOGIC, LOGIC_CLASS);
  expect(unitAtAbapLine(RAP, 320)?.unitId).toBe('U04');
  expect(targetLineForAbapLine(RAP, file, 320)).toBeNull();
});

test('a line of the open file brings its unit’s first ABAP line to the top of the original', () => {
  const file = fileOf(RAP, LOGIC, LOGIC_CLASS);
  expect(abapLineForTargetLine(RAP, file, 6)).toEqual({ unitId: 'U01', line: 100 });
  expect(abapLineForTargetLine(RAP, file, 7)).toEqual({ unitId: 'U01', line: 100 });
  expect(abapLineForTargetLine(RAP, file, 10)).toEqual({ unitId: 'U02', line: 200 });
  expect(abapLineForTargetLine(RAP, file, 14)).toEqual({ unitId: 'U03', line: 1051 });
  // Above the first method, inside an engine helper, inside an interface method: no unit.
  expect(abapLineForTargetLine(RAP, file, 2)).toBeNull();
  expect(abapLineForTargetLine(RAP, file, 5)).toBeNull();
  expect(abapLineForTargetLine(RAP, file, 12)).toBeNull();
});

test('both directions agree: a unit’s function maps back to a line that maps to the same unit', () => {
  const file = fileOf(RAP, LOGIC, LOGIC_CLASS);
  for (const u of RAP.units.filter((x) => x.file === LOGIC && x.kind !== 'orchestrator')) {
    const there = targetLineForAbapLine(RAP, file, firstAbapLine(u)!);
    expect(there?.unitId).toBe(u.unitId);
    const back = abapLineForTargetLine(RAP, file, there!.line);
    expect(back).toEqual({ unitId: u.unitId, line: firstAbapLine(u) });
  }
});

test('the Node route: exported functions of a step module', () => {
  const mod = 'srv/units/01-check.ts';
  const t = trace([unit('U01', 'checkClaims', mod, [[40, 80]]), unit('U02', 'routeClaims', 'srv/units/02-route.ts', [[90, 120]])]);
  const content = ['import x from "y";', '', 'export function whenG01() {}', 'export async function checkClaims() {', '  return 1;', '}'].join('\n');
  const file = fileOf(t, mod, content);
  expect(file.functions.map((f) => [f.name, f.line, f.unitId])).toEqual([
    ['whenG01', 3, null],
    ['checkClaims', 4, 'U01'],
  ]);
  expect(targetLineForAbapLine(t, file, 60)).toEqual({ unitId: 'U01', line: 4 });
  expect(abapLineForTargetLine(t, file, 5)).toEqual({ unitId: 'U01', line: 40 });
  // Function names on the Node route are case-sensitive.
  expect(syncScopeOf(t, mod, 'export function CHECKCLAIMS() {}')).toEqual({ applies: false, reason: 'no-link' });
});

test('no traceability: sync does not apply, and the note says so', () => {
  const scope = syncScopeOf(null, 'srv/service.ts', 'export function main() {}');
  expect(scope).toEqual({ applies: false, reason: 'no-trace' });
  expect(syncNote(scope, { on: true, stacked: false, fileName: 'service.ts' })).toBe(
    'Sync does not apply: this package has no traceability, so the panes scroll on their own.',
  );
});

test('a file without a trace link: TRACE.md, metadata, configuration — sync does not apply to it', () => {
  for (const [p, content] of [
    ['TRACE.md', '# How this code was built\n\nMETHOD read_claims.'],
    ['src/zcl_sd_cr_logic.clas.xml', '<abapGit/>'],
    ['package.json', '{"name":"x"}'],
    ['src/zcl_sd_cr_logic.clas.testclasses.abap', 'METHOD read_claims.\nENDMETHOD.'],
  ] as const) {
    const scope = syncScopeOf(RAP, p, content);
    expect(scope, p).toEqual({ applies: false, reason: 'no-link' });
  }
  expect(syncNote({ applies: false, reason: 'no-link' }, { on: true, stacked: false, fileName: 'TRACE.md' })).toBe(
    'Sync does not apply to TRACE.md: no function in it is traced to the original.',
  );
  // A traced file whose methods are not (yet) on screen does not claim to sync either.
  expect(syncScopeOf(RAP, LOGIC, 'CLASS zcl_sd_cr_logic IMPLEMENTATION.\nENDCLASS.')).toEqual({ applies: false, reason: 'no-link' });
});

test('the note: stacked panes on a phone, on and off', () => {
  const scope = syncScopeOf(RAP, LOGIC, LOGIC_CLASS);
  expect(syncNote(scope, { on: true, stacked: true, fileName: 'x' })).toBe('On a narrow screen the panes are stacked and scroll on their own.');
  expect(syncNote(scope, { on: true, stacked: false, fileName: 'x' })).toContain('brings its function to the top');
  expect(syncNote(scope, { on: false, stacked: false, fileName: 'x' })).toBe('The panes scroll on their own.');
});

test('the page syncs by the trace, measured in the DOM, not by percentage', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
  expect(page).not.toContain('scrollPercentage');
  expect(page).toContain('targetLineForAbapLine(packageTrace, scrollScope.file, topVisibleLine(legacyEl))');
  expect(page).toContain('abapLineForTargetLine(packageTrace, scrollScope.file, topVisibleLine(modernEl))');
  expect(page).toContain('aria-describedby="tf-sync-note"');
  const pane = fs.readFileSync(path.join(process.cwd(), 'lib/transformation/code-pane.ts'), 'utf8');
  expect(pane).toContain('[data-cc-code-line]');
  expect(pane).toContain('getBoundingClientRect');
});
