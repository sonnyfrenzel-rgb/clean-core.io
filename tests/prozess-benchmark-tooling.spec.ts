import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { selectBenchmarkIds } from './prozess-benchmark/select-ids';

/**
 * The process benchmark's own tooling (`tests/prozess-benchmark/`): which cases a measurement selects, and the naming
 * measurement's spend guard. Server-free; reads no benchmark case and makes no model call.
 */

const ALL = ['BM-001', 'BM-002', 'BM-003', 'BM-004', 'BM-005', 'BM-006'];
const SPLIT = { learn: ['BM-001', 'BM-003'], w3_learn: ['BM-005'] };

test('BM_SPLIT=learn selects only the learning halves, also inside a range', () => {
  const pick = (range?: string, split?: string) => selectBenchmarkIds(ALL, { range, split, readSplit: () => SPLIT });
  expect(pick(undefined, 'learn')).toEqual(['BM-001', 'BM-003', 'BM-005']);
  expect(pick('2-5', 'learn')).toEqual(['BM-003', 'BM-005']);
  // A range with no learning case selects nothing, never a test-half case.
  expect(pick('2-2', 'learn')).toEqual([]);
  expect(pick('2-4')).toEqual(['BM-002', 'BM-003', 'BM-004']);
  expect(pick()).toEqual(ALL);
  expect(() => pick(undefined, 'test')).toThrow(/only "learn"/);
});

test('the split file is read only when a split is asked for', () => {
  let read = 0;
  selectBenchmarkIds(ALL, { readSplit: () => { read++; return SPLIT; } });
  expect(read).toBe(0);
});

test('the naming measurement refuses a budget or case count that is not a finite number, before any model client', () => {
  const out = mkdtempSync(join(tmpdir(), 'naming-messung-'));
  try {
    for (const args of [['--budget', 'nope'], ['--budget', 'Infinity'], ['--budget', '-1'], ['--cases', 'x']]) {
      const run = spawnSync(
        process.execPath,
        [join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('tests', 'prozess-benchmark', 'naming-messung.ts'), ...args, '--cases', '0', '--out', out],
        // A dummy key: the main checkout's key is never read, and with `--cases 0` no call is made whatever happens.
        { encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: 'dummy-key-for-argument-test' }, timeout: 60_000 },
      );
      expect(run.status, `${args.join(' ')}: ${run.stderr}`).toBe(2);
      expect(run.stderr).toContain(args[0]);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
