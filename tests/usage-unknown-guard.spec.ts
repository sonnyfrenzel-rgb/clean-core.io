import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { parseUsage } from '../lib/abap/usage-parser';
import { joinUsageWithEvidence } from '../lib/abap/usage-join';

/**
 * Missing usage data is not a measurement of zero.
 *
 * Both review passes reported this; for GPT it was the only Blocking finding of
 * the whole review. `usage-join.ts` carries an explicit safeguard against it —
 * "§5 SAFEGUARD: no record → unknown, NEVER dormant", under a comment reading
 * "Missing data is not evidence of non-use". The safeguard tests whether a
 * *record* exists. It says nothing about whether that record carries a count,
 * and `usage-parser.ts` was coercing an absent count to 0 one file earlier.
 *
 * The consequence: an SCMON or UPL export whose call-count column is named
 * something the parser does not recognise turned every object in it into a
 * `retire-candidate` — a recommendation to delete production code, derived from
 * the absence of data.
 *
 * These tests run the real parser over real CSV text, because the defect lived
 * in the seam between two modules that each looked correct alone.
 */
const csvFile = (body: string, name = 'usage.csv') =>
  new File([body], name, { type: 'text/csv' });

/** Minimal evidence report: the join only reads `findings[].objectName`. */
const evidence = (objectNames: string[]) =>
  ({
    findings: objectNames.map((objectName, i) => ({
      id: `f${i}`,
      objectName,
      severity: 'Medium',
      kind: 'direct-table-access',
    })),
  }) as any;

const ROUTE = {} as any;

test.describe('an export with no recognised call-count column', () => {
  const CSV = 'OBJECT_NAME,LAST_USED\nZPROG_ONE,2026-01-15\nZPROG_TWO,2026-02-20\n';

  test('records no count rather than a fabricated zero', async () => {
    const report = await parseUsage(csvFile(CSV));
    expect(report.records).toHaveLength(2);
    for (const r of report.records) {
      expect(r.callCount, `${r.objectName} was given a count it never had`).toBeNull();
    }
  });

  test('says so, instead of leaving it to be guessed at', async () => {
    const report = await parseUsage(csvFile(CSV));
    expect(report.warnings.join(' ')).toMatch(/call-count column/i);
  });

  test('classifies every object as unknown, never as a retirement candidate', async () => {
    const report = await parseUsage(csvFile(CSV));
    const rows = joinUsageWithEvidence(report, evidence(['ZPROG_ONE', 'ZPROG_TWO']), ROUTE);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.usage, `${row.objectName} bucketed on missing data`).toBe('unknown');
      expect(row.quadrant, `${row.objectName} proposed for retirement`).toBe('unknown');
    }
  });
});

test.describe('an export that does carry counts', () => {
  // The fix must not blunt the feature: a measured zero is real evidence.
  const CSV =
    'OBJECT_NAME,CALLS,LAST_USED\n' +
    'ZPROG_ONE,0,2026-01-15\n' +
    'ZPROG_TWO,4200,2026-01-20\n' +
    'ZPROG_THREE,3800,2026-01-21\n';

  test('a measured zero still means dormant', async () => {
    const report = await parseUsage(csvFile(CSV));
    const rows = joinUsageWithEvidence(report, evidence(['ZPROG_ONE']), ROUTE);
    expect(rows.find((r) => r.objectName === 'ZPROG_ONE')?.usage).toBe('dormant');
  });

  test('a heavily used object is neither dormant nor unknown', async () => {
    const report = await parseUsage(csvFile(CSV));
    const rows = joinUsageWithEvidence(report, evidence(['ZPROG_TWO']), ROUTE);
    const two = rows.find((r) => r.objectName === 'ZPROG_TWO');
    expect(two?.usage).not.toBe('dormant');
    expect(two?.usage).not.toBe('unknown');
    expect(two?.callCount).toBe(4200);
  });

  test('no warning is raised when the column is there', async () => {
    const report = await parseUsage(csvFile(CSV));
    expect(report.warnings.join(' ')).not.toMatch(/call-count column/i);
  });
});

test.describe('a single row whose count cannot be read', () => {
  test('is unknown, while its neighbours keep their counts', async () => {
    const report = await parseUsage(
      csvFile('OBJECT_NAME,CALLS\nZPROG_ONE,not available\nZPROG_TWO,17\n'),
    );
    expect(report.records.find((r) => r.objectName === 'ZPROG_ONE')?.callCount).toBeNull();
    expect(report.records.find((r) => r.objectName === 'ZPROG_TWO')?.callCount).toBe(17);
  });

  test('does not drag the object into a retirement recommendation', async () => {
    const report = await parseUsage(
      csvFile('OBJECT_NAME,CALLS\nZPROG_ONE,not available\nZPROG_TWO,17\n'),
    );
    const rows = joinUsageWithEvidence(report, evidence(['ZPROG_ONE']), ROUTE);
    const one = rows.find((r) => r.objectName === 'ZPROG_ONE');
    expect(one?.usage).toBe('unknown');
    expect(one?.quadrant).toBe('unknown');
  });
});

test('the coercion itself stays gone', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'lib/abap/usage-parser.ts'),
    'utf8',
  );
  // The one-character version of the whole defect.
  expect(src).not.toMatch(/callCount:\s*callCount\s*\?\?\s*0/);
});

test.describe('the observed span is not called a measurement window', () => {
  test('no view claims a measurement period the export never stated', () => {
    for (const rel of [
      'components/analyze/UsageRiskMatrix.tsx',
      'components/analyze/UsageUpload.tsx',
    ]) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
      const rendered = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      // SCMON and UPL exports do not state how long monitoring ran. Deriving it
      // from the first and last execution reported "two days" for a year of data.
      expect(rendered, `${rel} still calls it a measurement window`).not.toMatch(/measurement window/i);
      expect(rendered).not.toMatch(/periodDays/);
    }
  });
});

test.describe('a customer ancestor outside the upload is not "resolved"', () => {
  test('ZCL_ and ZIF_ no longer get the benefit of the doubt', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'lib/abap/class-model-resolver.ts'),
      'utf8',
    );
    const rendered = src.replace(/\/\/[^\n]*/g, '');
    // CL_/CX_/IF_ are SAP's own — present in every system, just not in this
    // upload. A ZCL_ parent is the customer's: if it is not here, it was not
    // parsed, and "inheritance chain fully resolved" is a claim about code
    // nobody read.
    expect(rendered).not.toMatch(/startsWith\('ZCL_'\)/);
    expect(rendered).not.toMatch(/startsWith\('ZCX_'\)/);
    expect(rendered).not.toMatch(/startsWith\('ZIF_'\)/);
    expect(rendered).toMatch(/startsWith\('CL_'\)/);
  });
});
