/**
 * The original's demo cases on the Node route (roadmap 3.0.13, A4): the
 * golden master (`golden-master.ts`, `originalDemoCases`) written into the
 * package as `test/fixtures/original-demo.json`, a typed loader that turns one
 * case into a run of the package's own process (`srv/fixtures.ts`), and a
 * node:test file that runs every case (`test/original-demo.test.mjs`).
 *
 * How a case runs: its selection (the parameters' DEFAULTs, the case number,
 * the case's own settings) goes through the input contract; its tables — the
 * original's global tables after the case ran on the baseline — seed the run's
 * globals (`RunState.local`, typed by `abap-shapes.ts`); then `runProcess`.
 * That is what the original does in demo mode: fill its global tables, then
 * run its steps on them.
 *
 * What a case asserts: only that it runs — the code under test is reached,
 * nothing throws, no function it reaches is still a stub. No expected value is
 * invented: the case's title is what the original says it shows, to be
 * confirmed once in your system. A case that cannot be carried into the port
 * (a table or a setting with no place in it, statements the reader did not
 * read) is not run, and is counted apart as not a test (the counting rule of
 * `lib/testing-abap-unit.ts`, applied on Node: a case that skips or does not
 * call the code is not a test).
 *
 * Pure: plan and shapes in, files out.
 */

import type { OriginalDemoCases } from './golden-master';
import type { AbapShapes } from './abap-shapes';
import type { ScaffoldFile, UnitPlan } from './types';

const q = (s: string) => JSON.stringify(s);

/** The tables and scalars of the original a case may fill, with their place in `Locals`. */
function placesOf(shapes: AbapShapes) {
  const byName = new Map(shapes.structures.map((s) => [s.tsName, s]));
  const tables: Record<string, { key: string; columns: Record<string, string>; row: string }> = {};
  const structs: Record<string, { key: string; columns: Record<string, string> }> = {};
  const scalars: Record<string, string> = {};
  for (const g of shapes.globals) {
    const name = g.name.toUpperCase();
    if (g.ts.endsWith('[]')) {
      const s = byName.get(g.ts.slice(0, -2));
      if (!s) continue;
      // The initial row: every component at its initial value, as the structure declares it.
      const row = `{ ${s.fields.map((f) => `${f.key}: ${f.init}`).join(', ')} }`;
      tables[name] = { key: g.key, columns: Object.fromEntries(s.fields.map((f) => [f.name, f.key])), row };
    } else if (byName.has(g.ts)) {
      structs[name] = { key: g.key, columns: Object.fromEntries(byName.get(g.ts)!.fields.map((f) => [f.name, f.key])) };
    } else if (g.ts === 'string') {
      scalars[name] = g.key;
    }
  }
  return { tables, structs, scalars };
}

const FIXTURES_CORE = String.raw`
export type DemoValue = string | { param: string; op: '+' | '-'; n: number };

export interface OriginalDemoCase {
  number: number;
  title: string;
  titleSource: 'assignment' | 'comment' | 'none';
  lines: { start: number; end: number };
  rows: Record<string, Array<Record<string, DemoValue>>>;
  changedTables: string[];
  settings: Array<{ target: string; value: DemoValue; line: number; parameter: string | null }>;
  ranges: Record<string, Array<Record<string, string>>>;
  unread: Array<{ line: number; text: string }>;
}

export interface OriginalDemo {
  format: string;
  note?: string;
  switch: { operand: string; parameter: string | null; routine: string; lines: { start: number; end: number } } | null;
  demoFlag: string | null;
  parameters: Record<string, { default: string; written: string; type: string }>;
  aliases: Record<string, string>;
  cases: OriginalDemoCase[];
}

export function loadOriginalDemo(file: URL = new URL('../test/fixtures/original-demo.json', import.meta.url)): OriginalDemo {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as OriginalDemo;
}

/** One case run: ran (with the process outcome), threw (the code under test threw), or not run, with the reason. */
export type DemoRun =
  | { state: 'ran'; outcome: ProcessOutcome }
  | { state: 'threw'; message: string }
  | { state: 'not-run'; reason: string };

/** A value as the original writes it; one relative to a parameter (p_key + 10) from the parameter's value, whole numbers only. */
function valueOf(v: DemoValue, params: Record<string, string>): string | null {
  if (typeof v === 'string') return v;
  const base = params[v.param];
  if (base === undefined || !/^-?\d+$/.test(base.trim()) || !Number.isInteger(v.n)) return null;
  const n = BigInt(base.trim());
  return String(v.op === '+' ? n + BigInt(v.n) : n - BigInt(v.n));
}

/**
 * One case of the original, run through the package's own process: its selection through the input contract,
 * its tables as the run's globals. Asserts nothing about the result — see the file comment.
 */
export function runDemoCase(demo: OriginalDemo, c: OriginalDemoCase): DemoRun {
  if (c.unread.length > 0) {
    return { state: 'not-run', reason: 'the case was read only in part (' + c.unread.length + ' statement(s) not read, first at L' + c.unread[0].line + ')' };
  }
  const params: Record<string, string> = {};
  for (const [p, v] of Object.entries(demo.parameters)) params[p] = v.default;
  if (demo.switch && demo.switch.parameter) params[demo.switch.parameter] = String(c.number);
  const local: Record<string, unknown> = {};
  for (const s of c.settings) {
    const value = valueOf(s.value, params);
    if (value === null) return { state: 'not-run', reason: 'the value the case gives ' + s.target + ' (L' + s.line + ') cannot be computed here' };
    if (s.parameter) params[s.parameter] = value;
    else if (SCALARS[s.target]) local[SCALARS[s.target]] = value;
    else {
      const dash = s.target.indexOf('-');
      const st = dash > 0 ? STRUCTS[s.target.slice(0, dash)] : undefined;
      const column = st ? st.columns[s.target.slice(dash + 1).toLowerCase()] : undefined;
      if (!st || !column) return { state: 'not-run', reason: 'the case sets ' + s.target + ' (L' + s.line + '), which has no place in this package' };
      const held = (local[st.key] ?? {}) as Record<string, unknown>;
      local[st.key] = { ...held, [column]: value };
    }
  }
  const raw: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (f.where !== 'selection') continue;
    if (f.kind === 'range') {
      const rows = c.ranges[f.original];
      if (rows && rows.length > 0) raw[f.key] = rows.map((r) => ({ sign: r.sign || 'I', option: r.option || 'EQ', low: r.low ?? '', high: r.high ? r.high : null }));
      continue;
    }
    const v = params[f.original];
    if (v === undefined) continue;
    raw[f.key] = f.kind === 'flag' ? v.trim().toUpperCase() === 'X' : v;
  }
  const sel = validateSelection(raw);
  if (!sel.ok || !sel.selection) {
    return { state: 'not-run', reason: "the original's selection for this case is refused by the input contract: " + sel.errors.map((e) => e.message).join('; ') };
  }
  for (const [table, rows] of Object.entries(c.rows)) {
    const t = TABLES[table];
    if (!t) {
      if (rows.length > 0) return { state: 'not-run', reason: 'the table ' + table + ' has no place in this package' };
      continue;
    }
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const row = t.row();
      for (const [component, v] of Object.entries(r)) {
        const key = t.columns[component.toLowerCase()];
        if (!key) return { state: 'not-run', reason: 'the component ' + table + '-' + component.toUpperCase() + ' has no place in this package' };
        const value = valueOf(v, params);
        if (value === null) return { state: 'not-run', reason: 'a value of ' + table + '-' + component.toUpperCase() + ' cannot be computed here' };
        row[key] = value;
      }
      out.push(row);
    }
    local[t.key] = out;
  }
  try {
    return { state: 'ran', outcome: runProcess(sel.selection, [], local as Partial<Locals>) };
  } catch (err) {
    return { state: 'threw', message: err instanceof Error ? err.message : String(err) };
  }
}
`;

const DEMO_TEST_MJS = String.raw`// The original's own demo cases, run through this package's process - from the original, to be confirmed once.
// Written by Clean-Core.io (engine). A case asserts only that it runs: the code under test is reached, nothing
// throws, no function it reaches is a stub. No expected value is invented; the title is what the original says
// the case shows. A case that cannot be carried into the package is not run and is not a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginalDemo, runDemoCase } from '../srv/fixtures.ts';

const demo = loadOriginalDemo();
for (const c of demo.cases) {
  test('ORIGINAL_DEMO_' + c.number + ' ' + c.title + ' (from the original, confirm once)', (t) => {
    const r = runDemoCase(demo, c);
    if (r.state === 'not-run') {
      t.skip('NOT RUN - not a test: ' + r.reason);
      return;
    }
    assert.notEqual(r.state, 'threw', r.state === 'threw' ? 'the code threw on the original\'s own case: ' + r.message : '');
    if (r.state !== 'ran') return;
    assert.equal(r.outcome.complete, true, 'functions still stubs: ' + r.outcome.notFilled.join(', '));
  });
}
`;

/** The note a package without demo cases carries. */
const NO_CASES_NOTE = 'The original has no demo cases the engine recognises (fixture routines, a case switch): nothing to run here.';

/**
 * The files of the demo cases: the JSON, the loader and the test — or only the JSON's note and the loader when
 * the original has none the engine recognises (it then still says why).
 */
export function nodeDemoFiles(plan: UnitPlan, shapes: AbapShapes, demo: OriginalDemoCases | null): ScaffoldFile[] {
  const fixtures = plan.notCarried.filter((n) => n.reason === 'fixture');
  if (!demo && fixtures.length === 0) return [];
  const { tables, structs, scalars } = placesOf(shapes);
  const header = [
    '/**',
    " * The original's demo cases (test/fixtures/original-demo.json, read from the original by the engine — the",
    ' * golden master) and how one runs through this package: its selection through the input contract, its',
    " * tables as the run's globals, then runProcess. A case asserts only that it runs; its title is the original's,",
    ' * to be confirmed once in your system.',
    ...(fixtures.length ? [` * The original's fixture routines (${fixtures.map((f) => `${f.routine} L${f.lineStart}–L${f.lineEnd}`).join(', ').replace(/\*\//g, '* /')}) are not code of this package: their data is.`] : []),
    ' * Written by Clean-Core.io (engine).',
    ' */',
    "import fs from 'node:fs';",
    "import { FIELDS, validateSelection } from './lib/input-contract.ts';",
    "import type { Locals } from './lib/types.ts';",
    "import { runProcess, type ProcessOutcome } from './process.ts';",
    '',
    "/** The original's global tables a case fills: their place in Locals, their components, an initial row. */",
    'const TABLES: Record<string, { key: string; columns: Record<string, string>; row: () => Record<string, unknown> }> = {',
    ...Object.entries(tables).map(([name, t]) => `  ${q(name)}: { key: ${q(t.key)}, columns: ${JSON.stringify(t.columns)}, row: () => (${t.row}) },`),
    '};',
    "/** The original's global structures a case's setting may name (GS_SEL-ATOMIC). */",
    `const STRUCTS: Record<string, { key: string; columns: Record<string, string> }> = ${JSON.stringify(structs)};`,
    "/** The original's global scalars a case's setting may name (GV_SEALED). */",
    `const SCALARS: Record<string, string> = ${JSON.stringify(scalars)};`,
  ].join('\n');
  const json = demo
    ? { ...demo, note: 'The original\'s demo cases, read from the original by the engine. Each runs through srv/fixtures.ts runDemoCase (npm test: test/original-demo.test.mjs) and asserts only that it runs — from the original, to be confirmed once in your system.' }
    : { format: 'clean-core.original-demo/1', note: NO_CASES_NOTE, switch: null, demoFlag: null, parameters: {}, aliases: {}, cases: [] };
  const files: ScaffoldFile[] = [
    { path: 'srv/fixtures.ts', owner: 'engine', content: `${header}\n${FIXTURES_CORE}` },
    { path: 'test/fixtures/original-demo.json', owner: 'engine', content: `${JSON.stringify(json, null, 2)}\n` },
  ];
  if (demo && demo.cases.length > 0) files.push({ path: 'test/original-demo.test.mjs', owner: 'engine', content: DEMO_TEST_MJS });
  return files;
}
