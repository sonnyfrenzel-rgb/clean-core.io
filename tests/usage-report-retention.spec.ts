import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  USAGE_REPORT_RETENTION_MONTHS,
  usageReportBackfillExpiry,
  usageReportExpiry,
  usageReportSnapshot,
  type UsageReport,
} from '../lib/usage-report';
import {
  backfillUsageReportExpiry,
  type UsageReportBackfillDoc,
  type UsageReportBackfillStore,
} from '../scripts/backfill-usage-report-expiry';
import type { Timestamp } from 'firebase-admin/firestore';

/**
 * The weekly usage report's snapshots are deleted 24 months after the week they cover (release 3.2.0): the privacy
 * policy names the period, every snapshot carries its own `expiresAt`, a Firestore TTL policy deletes on it, the
 * verifier checks that policy, and a one-off backfill gives the snapshots stored before their date. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const report: UsageReport = {
  generatedAt: new Date('2026-11-13T11:00:00Z'),
  periodStart: new Date('2026-11-06T11:00:00Z'),
  periodEnd: new Date('2026-11-13T11:00:00Z'),
  current: { registrations: 1, activations: 0, activeAccounts: 1, runs: 2, projects: 1, units: 2 },
  previous: { registrations: 0, activations: 0, activeAccounts: 0, runs: 0, projects: 0, units: 0 },
  totals: { accounts: 3, activated: 1, neverStarted: 2, atLimit: 0 },
  newAccounts: 1,
  reachedLimit: 0,
  delivery: { sent: 1, delivered: 1, delayed: 0, bounced: 0, complained: 0, awaiting: 0, failures: [] },
};

test('a snapshot is kept 24 calendar months after the week it covers', () => {
  expect(USAGE_REPORT_RETENTION_MONTHS).toBe(24);
  expect(usageReportExpiry(new Date('2026-11-13T11:00:00Z')).toISOString()).toBe('2028-11-13T11:00:00.000Z');
  expect(usageReportSnapshot(report, { providerId: 'p' }).expiresAt.toISOString()).toBe('2028-11-13T11:00:00.000Z');
});

test('the Friday job stores the snapshot with its date', () => {
  const job = read('scripts/send-usage-report.ts');
  expect(job).toContain('...usageReportSnapshot(report, { providerId: id }),');
});

test('an older snapshot is dated from its own week; one with a date or without a time is left alone', () => {
  expect(usageReportBackfillExpiry({ periodEnd: new Date('2026-09-25T10:00:00Z') })).toEqual({ expiresAt: new Date('2028-09-25T10:00:00Z') });
  const ts = (d: Date) => ({ toDate: () => d });
  expect(usageReportBackfillExpiry({ generatedAt: ts(new Date('2026-08-21T10:00:00Z')) })).toEqual({ expiresAt: new Date('2028-08-21T10:00:00Z') });
  expect(usageReportBackfillExpiry({ periodEnd: '2026-10-02T10:00:00Z', expiresAt: ts(new Date('2030-01-01T00:00:00Z')) })).toEqual({ skip: 'has-expiry' });
  expect(usageReportBackfillExpiry({ periodEnd: 'not a date' })).toEqual({ skip: 'no-time' });
});

test('the backfill counts on a dry run and writes with a precondition on --apply', async () => {
  const stamp = { seconds: 1 } as unknown as Timestamp;
  const docs: UsageReportBackfillDoc[] = [
    { id: 'a', data: () => ({ periodEnd: new Date('2026-09-25T10:00:00Z') }), updateTime: stamp },
    { id: 'b', data: () => ({ periodEnd: new Date('2026-10-02T10:00:00Z'), expiresAt: new Date('2028-10-02T10:00:00Z') }), updateTime: stamp },
    { id: 'c', data: () => ({}), updateTime: stamp },
  ];
  const writes: Array<{ id: string; expiresAt: Date; precondition: unknown }> = [];
  const store: UsageReportBackfillStore = {
    all: async () => docs,
    batch: () => ({
      update: (id, data, precondition) => writes.push({ id, expiresAt: data.expiresAt, precondition }),
      commit: async () => undefined,
    }),
  };
  const now = new Date('2026-11-14T00:00:00Z').getTime();
  expect(await backfillUsageReportExpiry(store, { apply: false, now })).toEqual({ scanned: 3, hasExpiry: 1, noTime: 1, toWrite: 1, alreadyDue: 0, written: 0 });
  expect(writes).toEqual([]);
  expect(await backfillUsageReportExpiry(store, { apply: true, now })).toMatchObject({ toWrite: 1, written: 1 });
  expect(writes).toEqual([{ id: 'a', expiresAt: new Date('2028-09-25T10:00:00Z'), precondition: { lastUpdateTime: stamp } }]);

  const script = read('scripts/backfill-usage-report-expiry.ts');
  expect(script, 'the backfill refuses to run in CI: the Actions log is public').toContain('Refusing to run in CI');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  expect(pkg.scripts['retention:backfill-usage-report-expiry']).toBe('tsx scripts/backfill-usage-report-expiry.ts');
});

test('the register names the period and the policy the verifier checks', () => {
  const register = read('docs/DATA-RETENTION.md');
  const row = register.split('\n').find((l) => l.startsWith('| `usage_reports/'));
  expect(row, 'usage_reports has no row in docs/DATA-RETENTION.md').toBeDefined();
  expect(row!).toContain('**24 months**');
  expect(row!).toContain('`expiresAt` drives the retention TTL policy');
  expect(row!).not.toContain('Kept for the trend');
  expect(register).toContain('--collection-group=usage_reports --enable-ttl');
  expect(read('scripts/retention-verify.ts')).toContain("line.includes('drives the retention TTL policy')");
});
