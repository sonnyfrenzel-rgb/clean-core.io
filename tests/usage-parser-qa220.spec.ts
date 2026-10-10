/**
 * The usage import reads what the export holds, and stores no address.
 *
 * QA full review of v2.20.0 (fc787674705f): d371bd76e13b, b19f783e7d19,
 * 155aeedb1cff, a48a8ba01b64, 8a780126c364. QA full review of v3.0.6: 5b36ba237426.
 *
 * Serverless: File objects in memory.
 */
import { test, expect } from '@playwright/test';
import { parseUsage } from '../lib/abap/usage-parser';

const csv = (body: string) => new File([body], 'usage.csv', { type: 'text/csv' });
const TODAY = '2026-09-11';

test('d371bd76e13b — an unmapped heading that is an e-mail address is counted, not copied', async () => {
  const r = await parseUsage(csv('OBJECT_NAME,CALLS,jane.doe@example.com,PACKAGE\nZPROG_A,5,1,ZPKG\n'), { today: TODAY });
  const text = r.warnings.join(' ');
  expect(text).not.toContain('jane.doe@example.com');
  expect(text).toMatch(/Unmapped columns ignored: PACKAGE; 1 column with a heading that is not a known SAP column name \(not listed\)/);
});

test('5b36ba237426 — an unmapped heading that is a SAP user ID is counted, not copied', async () => {
  const r = await parseUsage(csv('OBJECT_NAME,CALLS,JSMITH,MMUELLER,PACKAGE\nZPROG_A,5,1,2,ZPKG\n'), { today: TODAY });
  const text = r.warnings.join(' ');
  expect(text).not.toContain('JSMITH');
  expect(text).not.toContain('MMUELLER');
  expect(text).toMatch(/Unmapped columns ignored: PACKAGE; 2 columns with a heading that is not a known SAP column name \(not listed\)/);
});

test('b19f783e7d19 — two call-count columns are named as ambiguous', async () => {
  const r = await parseUsage(csv('OBJECT_NAME,CALLS,EXECUTIONS\nZPROG_A,5,500\n'), { today: TODAY });
  expect(r.warnings.join(' ')).toMatch(/2 columns could hold the call count \(CALLS, EXECUTIONS\); CALLS was read/);
  // One count column: no such warning.
  const single = await parseUsage(csv('OBJECT_NAME,CALLS\nZPROG_A,5\n'), { today: TODAY });
  expect(single.warnings.join(' ')).not.toMatch(/could hold the call count/);
});

test('155aeedb1cff — repeated thousands separators are read', async () => {
  const r = await parseUsage(
    csv('OBJECT_NAME;CALLS\nZPROG_A;1.234.567\nZPROG_B;"1,234,567"\nZPROG_C;1.234.567,00\nZPROG_D;1.234\n'),
    { today: TODAY },
  );
  expect(r.records.map((x) => [x.objectName, x.callCount])).toEqual([
    ['ZPROG_A', 1234567],
    ['ZPROG_B', 1234567],
    ['ZPROG_C', 1234567],
    ['ZPROG_D', 1234],
  ]);
});

test('a48a8ba01b64 — Infinity and an overflowing count are unknown, not measured', async () => {
  const r = await parseUsage(csv('OBJECT_NAME,CALLS\nZPROG_A,Infinity\nZPROG_B,1e309\nZPROG_C,12\n'), { today: TODAY });
  expect(r.records.map((x) => x.callCount)).toEqual([null, null, 12]);
});

test('8a780126c364 — a single execution date is reported as the observed end', async () => {
  const r = await parseUsage(csv('OBJECT_NAME,CALLS,LAST_USED\nZPROG_A,5,2026-01-15\n'), { today: TODAY });
  expect(r.observedTo).toBe('2026-01-15');
  expect(r.observedFrom).toBe('2026-01-15');
});
