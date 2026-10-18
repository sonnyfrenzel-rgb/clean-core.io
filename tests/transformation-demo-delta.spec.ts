import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildNodeScaffold } from '../lib/transformation';
import { ORIGINAL_DEMO_DELTA_FORMAT, originalDemoCaseRows, originalDemoCases, type OriginalDemoCases, type OriginalDemoDelta } from '../lib/transformation/golden-master';
import { fileUrl, planOf, ROOT, runInPackage, writePackage } from './helpers/transformation-scaffold';
import { corpusFiles, examplePath } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.17 item (7): the Node package's demo cases (`test/fixtures/original-demo.json`) carry per case only
 * the tables it changes; every other table is read from the baseline when the case is replayed — by
 * `originalDemoCaseRows` here and by the package's own `srv/fixtures.ts` (`caseRows`, `runDemoCase`) there. Each
 * case must replay to exactly the rows of the full form it replaced, and the fixture must shrink. Server-free:
 * the repository's own sources only.
 */

const SOURCES = [
  ...corpusFiles().map((f) => examplePath(f)),
  path.join(ROOT, 'tests', 'fixtures', 'golden-master', 'three-cases.abap'),
  path.join(ROOT, 'tests', 'fixtures', 'sd-locked-probe-demo.abap'),
];

/** The sources that have demo cases: the full form as the engine reads it, and the package the Node route writes. */
function withCases(): Array<{ name: string; full: OriginalDemoCases; files: ReturnType<typeof buildNodeScaffold>['files'] }> {
  const out: ReturnType<typeof withCases> = [];
  for (const file of SOURCES) {
    const source = fs.readFileSync(file, 'utf8');
    const full = originalDemoCases(source);
    if (!full) continue;
    const { facts, plan } = planOf(source);
    out.push({ name: path.basename(file), full, files: buildNodeScaffold(plan, facts).files });
  }
  return out;
}

const fixtureOf = (files: ReadonlyArray<{ path: string; content: string }>) => files.find((f) => f.path === 'test/fixtures/original-demo.json')!.content;

test('every case replays to exactly the rows of the full form, and carries only the tables that differ from the baseline', () => {
  const programs = withCases();
  expect(programs.map((p) => p.name)).toEqual(expect.arrayContaining(['three-cases.abap', 'sd-locked-probe-demo.abap']));
  for (const { name, full, files } of programs) {
    const delta = JSON.parse(fixtureOf(files)) as OriginalDemoDelta;
    expect(delta.format, name).toBe(ORIGINAL_DEMO_DELTA_FORMAT);
    expect(delta.baseline, name).toEqual(full.baseline);
    expect(delta.cases.length, name).toBe(full.cases.length);
    full.cases.forEach((c, i) => {
      const d = delta.cases[i];
      // Exactly the same rows, tables in the same order.
      expect(JSON.stringify(originalDemoCaseRows(delta, d)), `${name} case ${c.number}`).toBe(JSON.stringify(c.rows));
      // Only the tables that differ from the baseline; the rest of the case unchanged.
      const differing = Object.keys(c.rows).filter((t) => JSON.stringify(c.rows[t]) !== JSON.stringify(full.baseline.rows[t]));
      expect(Object.keys(d.rows), `${name} case ${c.number}`).toEqual(differing);
      expect({ ...d, rows: null }, `${name} case ${c.number}`).toEqual({ ...c, rows: null });
    });
    // The full form expands as it is.
    full.cases.forEach((c) => expect(originalDemoCaseRows(full, c)).toBe(c.rows));
  }
});

test('the fixture shrinks: no case repeats a baseline table it does not change', () => {
  const sizes: Record<string, [number, number]> = {};
  for (const { name, full, files } of withCases()) {
    const delta = fixtureOf(files);
    // The full form as the package wrote it until 3.0.17, with the same note: only the case rows differ.
    const before = `${JSON.stringify({ ...full, note: JSON.parse(delta).note }, null, 2)}\n`;
    const unchanged = full.cases.reduce((n, c) => n + Object.keys(c.rows).filter((t) => JSON.stringify(c.rows[t]) === JSON.stringify(full.baseline.rows[t])).length, 0);
    sizes[name] = [before.length, delta.length];
    // A program whose every case changes every table has nothing to drop, and must not grow either.
    if (unchanged > 0) expect(delta.length, `${name}: ${before.length} → ${delta.length} bytes`).toBeLessThan(before.length);
    else expect(delta.length, name).toBe(before.length);
  }
  // three-cases.abap: two tables; case 0 changes none, case 1 one, case 2 both — 4,616 → 3,944 bytes (17.10.2026).
  const [before, after] = sizes['three-cases.abap'];
  expect(after, `${before} → ${after} bytes`).toBeLessThan(before * 0.9);
});

test("the package's own replay expands the delta: the same rows and the same run as the full form", () => {
  for (const { name, full, files } of withCases()) {
    const dir = writePackage(files, 'cc-demo-delta-');
    try {
      // The old full form beside the new one, written by this test only.
      fs.writeFileSync(path.join(dir, 'test', 'fixtures', 'original-demo.full.json'), JSON.stringify(full));
      const runs = runInPackage<{ rows: string[]; delta: string[]; fullRuns: string[] }>(
        dir,
        `const f = await import(${JSON.stringify(fileUrl(dir, 'srv/fixtures.ts'))});
         const fs = await import('node:fs');
         const delta = JSON.parse(fs.readFileSync(new URL(${JSON.stringify(fileUrl(dir, 'test/fixtures/original-demo.json'))}), 'utf8'));
         const full = JSON.parse(fs.readFileSync(new URL(${JSON.stringify(fileUrl(dir, 'test/fixtures/original-demo.full.json'))}), 'utf8'));
         const run = (demo, c) => { const r = f.runDemoCase(demo, c); return JSON.stringify(r.state === 'ran' ? { state: r.state, complete: r.outcome.complete, notFilled: r.outcome.notFilled, local: r.outcome.state.local } : r); };
         console.log(JSON.stringify({
           rows: delta.cases.map((c) => JSON.stringify(f.caseRows(delta, c))),
           delta: delta.cases.map((c) => run(delta, c)),
           fullRuns: full.cases.map((c) => run(full, c)),
         }));`,
      );
      expect(runs.rows, name).toEqual(full.cases.map((c) => JSON.stringify(c.rows)));
      expect(runs.delta, name).toEqual(runs.fullRuns);
      expect(runs.delta.some((r) => r.startsWith('{"state":"ran"')), name).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
