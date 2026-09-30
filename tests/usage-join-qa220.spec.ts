/**
 * Usage percentiles read per-object totals, and the quadrant texts claim only
 * what the quadrant establishes.
 *
 * QA full review of v2.20.0 (fc787674705f): 92c5ed62ee59, 54e57c348f61.
 *
 * Serverless: pure functions.
 */
import { test, expect } from '@playwright/test';
import { joinUsageWithEvidence, QUADRANT_META } from '../lib/abap/usage-join';
import type { UsageReport } from '../lib/abap/usage-model';

const record = (objectName: string, callCount: number) => ({ objectName, callCount, source: 'scmon' as const });

test('92c5ed62ee59 — ten rows of one object are one object when the thresholds are set', () => {
  const usage = {
    records: [...Array.from({ length: 10 }, () => record('ZA', 1)), record('ZB', 2), record('ZC', 3)],
    source: 'scmon',
    importedAt: '',
    warnings: [],
  } as unknown as UsageReport;
  const rows = joinUsageWithEvidence(usage, { findings: [] }, {} as never, () => false);
  const bucket = (name: string) => rows.find((r) => r.objectName === name)?.usage;
  expect(rows.find((r) => r.objectName === 'ZA')?.callCount).toBe(10);
  // Per object: 2, 3, 10 — ZA is the heavy one, not ZB and ZC.
  expect(bucket('ZA')).toBe('heavy');
  expect(bucket('ZB')).not.toBe('heavy');
  expect(bucket('ZC')).not.toBe('heavy');
});

test('54e57c348f61 — the quadrant texts do not assert a path the quadrant does not establish', () => {
  // `needs-architect` lands in danger; moderate and low usage land in low-priority whatever the path.
  expect(QUADRANT_META.danger.description).not.toMatch(/no clean path/i);
  expect(QUADRANT_META['low-priority'].description).not.toMatch(/clean path/i);
});
