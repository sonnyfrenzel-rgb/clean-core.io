import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { benchSourcePath, holdLedger, SpendGate, worstCaseCostUsd } from './prozess-benchmark/bench-guard';

/**
 * The guards of the paid benchmark runners (`tests/prozess-benchmark/stage-bench.ts`, `weg-b-model.ts`):
 * an id from the id file names a case folder or a starter file and nothing else, and the spend cap counts the
 * calls in flight; one runner holds a ledger at a time. Server-free; calls no model.
 */
const roots = { cases: join('root', 'cases'), starters: join('root', 'starters') };

test('an id names a case folder or a starter file under its own root', () => {
  expect(benchSourcePath('BM-007', roots)).toEqual({ kind: 'case', path: resolve('root', 'cases', 'BM-007') });
  expect(benchSourcePath('starter:Z_MM_PO_APPROVAL.abap', roots)).toEqual({ kind: 'starter', path: resolve('root', 'starters', 'Z_MM_PO_APPROVAL.abap') });
  expect(benchSourcePath('starter:Z_INVOICE_EXTRACTOR.txt', roots).kind).toBe('starter');
});

test('an id that would leave its folder or read another file is refused', () => {
  for (const id of [
    'starter:../../.env.local',
    'starter:..\\..\\.env.local',
    'starter:/etc/passwd',
    'starter:C:\\Windows\\win.ini',
    'starter:.env.local',
    'starter:sub/Z_X.abap',
    'starter:',
    '../BM-001',
    'BM-001/../../.env.local',
    '..',
    'cases',
    'BM-1',
  ]) {
    expect(() => benchSourcePath(id, roots), id).toThrow();
  }
});

test('parallel calls cannot pass the cap together: the calls in flight count', () => {
  let ledger = 0.9;
  const gate = new SpendGate(1, () => ledger);
  // Three workers read the same ledger total below the cap; only the first fits its worst case beside it.
  expect(gate.tryReserve(0.08)).toBe(true);
  expect(gate.tryReserve(0.08)).toBe(false);
  expect(gate.tryReserve(0.08)).toBe(false);
  // The first call's real cost lands in the ledger and its reservation is given back.
  ledger += 0.03;
  gate.release(0.08);
  expect(gate.inFlightUsd).toBe(0);
  expect(gate.tryReserve(0.05)).toBe(true);
  expect(gate.tryReserve(0.05)).toBe(false);
});

test('without a cap every call goes through, and the worst case bounds the real cost', () => {
  const free = new SpendGate(0, () => 1e9);
  expect(free.tryReserve(100)).toBe(true);
  // Every prompt character counted as a token, and the whole output allowance.
  expect(worstCaseCostUsd(1_000_000, 0, [1.5, 7.5])).toBeCloseTo(1.5);
  expect(worstCaseCostUsd(0, 1_000_000, [1.5, 7.5])).toBeCloseTo(7.5);
});

test('one runner per ledger: a second hold on the same ledger is refused until the first lets go', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-ledger-'));
  try {
    const ledger = join(dir, 'spend.jsonl');
    const release = holdLedger(ledger);
    expect(existsSync(`${ledger}.lock`)).toBe(true);
    expect(() => holdLedger(ledger)).toThrow(/another runner holds the ledger/);
    // Another ledger is free.
    holdLedger(join(dir, 'other.jsonl'))();
    release();
    expect(existsSync(`${ledger}.lock`)).toBe(false);
    holdLedger(ledger)();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
