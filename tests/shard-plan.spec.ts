import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Release 3.0.21, test-quality measure 2: the CI shards run whole spec files,
 * split by measured duration (tests/shard-plan.json, scripts/test/shard-plan.mjs),
 * instead of `--shard=i/6`, which split by test count and gave shards of 2.3 to
 * 26.7 minutes on run 39819463543. The workflow step is held by
 * tests/quality-gate-guard.spec.ts; this spec holds the plan.
 *
 * Server-free.
 */
const ROOT = path.resolve(__dirname, '..');
const lib = () => import(path.join(ROOT, 'scripts/test/shard-plan.mjs'));

type Plan = { shardCount: number; durations: Record<string, number>; shards: { files: string[]; seconds: number }[] };
const readPlan = (): Plan => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/shard-plan.json'), 'utf8'));

test('every spec file on disk is in exactly one shard, and every planned file still exists', async () => {
  const { discoverSpecFiles } = await lib();
  const onDisk: string[] = discoverSpecFiles();
  // The discovery sees what Playwright collects: this very spec, and the one *.test.ts file.
  expect(onDisk).toContain('tests/shard-plan.spec.ts');
  expect(onDisk).toContain('tests/board-deck.integrity.test.ts');

  const plan = readPlan();
  const planned = plan.shards.flatMap((s) => s.files);
  const missing = onDisk.filter((f) => !planned.includes(f));
  expect(missing, 'spec files no shard runs - run `node scripts/test/shard-plan.mjs refresh`').toEqual([]);
  const gone = planned.filter((f) => !onDisk.includes(f));
  expect(gone, 'planned spec files that no longer exist - run `node scripts/test/shard-plan.mjs refresh`').toEqual([]);
  expect(planned.length, 'a spec file is planned in two shards').toBe(new Set(planned).size);
  expect(Object.keys(plan.durations).filter((f) => !onDisk.includes(f)), 'durations of files that are gone').toEqual([]);
});

test('the plan is what the generator makes of the stored durations, not a hand edit', async () => {
  const { discoverSpecFiles, planShards, SHARD_COUNT } = await lib();
  const plan = readPlan();
  expect(plan.shardCount).toBe(SHARD_COUNT);
  expect(plan.shards).toEqual(planShards(discoverSpecFiles(), plan.durations, plan.shardCount));
  // Balanced: no shard more than its heaviest file above the lightest one.
  const seconds = plan.shards.map((s) => s.seconds);
  const heaviest = Math.max(...Object.values(plan.durations));
  expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(heaviest);
});

test('no spec path, read the way Playwright reads a CLI filter, also matches another spec file', async () => {
  const { discoverSpecFiles, overlappingFilters } = await lib();
  // Playwright takes each argument as a case-insensitive, unanchored regular expression over the path.
  expect(overlappingFilters(['tests/run.spec.ts', 'tests/dry-run.spec.ts', 'tests/a/tests/run.spec.ts'])).toEqual([['tests/run.spec.ts', 'tests/a/tests/run.spec.ts']]);
  expect(overlappingFilters(discoverSpecFiles())).toEqual([]);
});

test('longest first onto the lightest shard, with new files at the median and gone files dropped', async () => {
  const { planShards, shardFiles, median } = await lib();
  const durations = { 'tests/a.spec.ts': 100, 'tests/b.spec.ts': 60, 'tests/c.spec.ts': 50, 'tests/d.spec.ts': 10, 'tests/e.spec.ts': 10 };
  const files = Object.keys(durations);
  const shards = planShards(files, durations, 2);
  // a → 1 (100), b → 2 (60), c → 2 (110), d → 1 (110), e → 1 on the tie (120).
  expect(shards).toEqual([
    { files: ['tests/a.spec.ts', 'tests/d.spec.ts', 'tests/e.spec.ts'], seconds: 120 },
    { files: ['tests/b.spec.ts', 'tests/c.spec.ts'], seconds: 110 },
  ]);
  expect(median(Object.values(durations))).toBe(50);

  // On disk now: b is gone, n1 and n2 are new and not planned yet.
  const plan = { shardCount: 2, durations, shards };
  const onDisk = ['tests/a.spec.ts', 'tests/c.spec.ts', 'tests/d.spec.ts', 'tests/e.spec.ts', 'tests/n1.spec.ts', 'tests/n2.spec.ts'];
  const one = shardFiles(plan, onDisk, 1);
  const two = shardFiles(plan, onDisk, 2);
  // Shard 2 lost b and holds 50 s; each new file counts 50 s, so both go there (100, then 150 > 120 only after n2).
  expect(two).toEqual(['tests/c.spec.ts', 'tests/n1.spec.ts', 'tests/n2.spec.ts']);
  expect(one).toEqual(['tests/a.spec.ts', 'tests/d.spec.ts', 'tests/e.spec.ts']);
  expect([...one, ...two].sort()).toEqual(onDisk);
  expect(() => shardFiles(plan, onDisk, 3)).toThrow(/not one of 1\.\.2/);
});

test('durations come from a CI run log (begin to begin, last test to the summary) and from JSON reports', async () => {
  const { durationsFromRunLog, durationsFromJsonReport } = await lib();
  const line = (job: string, t: string, text: string) => `${job}\tUNKNOWN STEP\t2026-10-22T17:${t}Z ${text}`;
  const log = [
    line('e2e (1)', '14:00.0000000', 'Running 3 tests using 1 worker, shard 1 of 6'),
    line('e2e (1)', '14:01.0000000', '[1/3] [chromium] › tests/a.spec.ts:3:5 › first'),
    line('e2e (1)', '14:05.5000000', 'some output of the test'),
    line('e2e (1)', '14:11.0000000', '[2/3] [chromium] › tests/a.spec.ts:9:5 › second (retry #1)'),
    line('e2e (2)', '14:02.0000000', '[1/1] [chromium] › tests/b.spec.ts:3:5 › only'),
    line('e2e (1)', '14:12.0000000', '[3/3] [chromium] › tests/c.spec.ts:3:5 › third'),
    line('e2e (2)', '14:32.0000000', '  1 passed (30.0s)'),
    line('e2e (1)', '14:15.0000000', '  3 passed (15.0s)'),
  ].join('\n');
  expect(durationsFromRunLog(log)).toEqual({ 'tests/a.spec.ts': 11, 'tests/b.spec.ts': 30, 'tests/c.spec.ts': 3 });

  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/ci-test-summary/report.json'), 'utf8'));
  // Every attempt counts, the failed first try of a flaky test included.
  expect(durationsFromJsonReport(report)).toEqual({ 'tests/owner-sources.spec.ts': 0, 'tests/workspace.spec.ts': 36.6 });
});
