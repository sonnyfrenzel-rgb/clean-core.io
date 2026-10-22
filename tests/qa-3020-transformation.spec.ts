import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { wrapAbapLine } from '../lib/transformation/abap-line-length';
import { accessPointsOf } from '../lib/transformation/access-layer';
import { goldenMasterComparedWords, goldenMasterForScaffold, goldenMasterSentence, type GoldenMasterTestClass } from '../lib/transformation/golden-master';
import { fileUrl, nodePackage, ROOT, runInPackage } from './helpers/transformation-scaffold';

/**
 * QA review of ee72ca2218e1 (3.0.20), the transformation findings confirmed on that commit: a string template's
 * apostrophes are no literal's delimiters when a long line is wrapped; a file named by a string template gets its
 * access method; a demo case whose unbound table holds rows is not carried; the demo-case summary never says a case
 * not carried over runs; the Node demo runner honours the baseline's unread statements. Server-free.
 */

const three = () => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'golden-master', 'three-cases.abap'), 'utf8');

test('e32348bc3bf7: a long line wraps without rewriting the apostrophes of a string template into literals', () => {
  // The two apostrophes are more than a chunk (200 characters) apart: read as a literal, the text between them was cut.
  const template = `|isn't ${'y'.repeat(210)} it's|`;
  const line = `    lv_text = lv_prefix && ${template} && lv_suffix.`;
  expect(line.length).toBeGreaterThan(255);
  const wrapped = wrapAbapLine(line);
  for (const l of wrapped) expect(l.length).toBeLessThanOrEqual(255);
  // The template comes out whole, as written.
  expect(wrapped.some((l) => l.includes(template)), wrapped.join('\n')).toBe(true);
  expect(wrapped.join('\n')).not.toContain('`');
  // A real literal longer than a line is still split.
  const long = `    lv_text = '${'z'.repeat(300)}'.`;
  expect(wrapAbapLine(long).join('\n')).toMatch(/&&/);
});

test('6641831dcbe5: a file named by a string template gets the access method the body refusal points to', () => {
  const statements = [
    { text: 'OPEN DATASET |{ p_dir }/out.csv| FOR OUTPUT IN TEXT MODE ENCODING DEFAULT', lineStart: 10 },
    { text: 'TRANSFER lv_line TO |{ p_dir }/out.csv|', lineStart: 11 },
    { text: 'CLOSE DATASET |{ p_dir }/out.csv|', lineStart: 12 },
  ];
  const { points } = accessPointsOf({ statements, graph: { databaseWrites: [], functionModules: [] } } as never, { files: true });
  expect(points.map((p) => [p.method, p.kind, p.file, p.lines])).toEqual([['write_file_file', 'file', 'write', [10, 11, 12]]]);
});

test('7f457d6823d1: a case whose baseline table holds rows the state type has no component for is not carried', () => {
  // GT_RATES has a row in the baseline; the state type has a component for GT_CLAIMS only.
  const out = goldenMasterForScaffold(three().replace(/ {6}gv_sealed = space\.\r?\n/, ''), {
    logicClass: 'zcl_gm_credit_logic',
    accessDouble: null,
    selection: [{ original: 'P_ORG', component: 'org', range: false }],
    stateComponents: ['claims'],
  })!;
  for (const m of out.testClass.methods) {
    expect(m.bound, m.name).toBe(false);
    expect(m.carried, m.name).toBe(false);
    expect(m.notCarried.some((r) => /^table GT_RATES\b.*\(ty_state has no component for it\)$/.test(r)), JSON.stringify(m.notCarried)).toBe(true);
  }
  expect(out.testClass.lines.join('\n')).toMatch(/METHOD case_00\.[\s\S]*?cl_abap_unit_assert=>skip\( msg = 'Case 0 not carried over: table GT_RATES with 1 row/);
});

test('851baeec2d3d: the demo-case summary never says a case not carried over runs, nor counts its rows as passed', () => {
  const method = (n: number, carried: boolean): GoldenMasterTestClass['methods'][number] => ({
    name: `case_0${n}`,
    case: n,
    title: `Case ${n}`,
    bound: true,
    partial: false,
    compared: false,
    carried,
    notCarried: carried ? [] : ['MODIFY at L10'],
  });
  const sentence = goldenMasterSentence({ methods: [method(0, true), method(1, false), method(2, false)] });
  expect(sentence).toContain('1 of 3 with their data carried completely');
  expect(sentence).toContain('1 of 3 pass all their rows to the logic');
  expect(sentence).not.toContain('each runs through the logic');
  expect(sentence).toContain('the one carried over runs through the logic, but no result is compared yet');
  expect(goldenMasterComparedWords(2, 0, 2)).toBe('none runs through the logic');
  expect(goldenMasterComparedWords(5, 1, 2)).toBe("1 compared with the original's result on record; the other 2 carried over run through the logic and are reported as skipped, not passed");
  // Without a case not carried over the words are as before.
  expect(goldenMasterComparedWords(3, 0)).toMatch(/^each runs through the logic/);
});

test('b6ed355d8b56: the Node demo runner does not run a case when the baseline has a statement it could not read', () => {
  const { dir } = nodePackage(three());
  try {
    const json = path.join(dir, 'test', 'fixtures', 'original-demo.json');
    const demo = JSON.parse(fs.readFileSync(json, 'utf8'));
    expect(demo.cases.length).toBeGreaterThan(0);
    demo.baseline.unread = [{ line: 42, text: 'MODIFY gt_claims FROM ls_claim TRANSPORTING qty WHERE org = p_org' }];
    for (const c of demo.cases) c.unread = [];
    fs.writeFileSync(json, JSON.stringify(demo));
    const runs = runInPackage<Array<{ state: string; reason?: string }>>(
      dir,
      `const f = await import(${JSON.stringify(fileUrl(dir, 'srv/fixtures.ts'))});
       const fs = await import('node:fs');
       const demo = JSON.parse(fs.readFileSync(new URL(${JSON.stringify(fileUrl(dir, 'test/fixtures/original-demo.json'))}), 'utf8'));
       console.log(JSON.stringify(demo.cases.map((c) => { const r = f.runDemoCase(demo, c); return { state: r.state, reason: r.reason }; })));`,
    );
    for (const r of runs) {
      expect(r.state).toBe('not-run');
      expect(r.reason).toContain('not carried over: MODIFY at L42 of the baseline');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
