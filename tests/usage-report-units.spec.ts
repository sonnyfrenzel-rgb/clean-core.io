import { test, expect } from '@playwright/test';
import { buildUsageReport, type UsageReportSource } from '../lib/usage-report';
import { renderUsageReportEmail, renderUsageReportText } from '../lib/usage-report-email';

/**
 * "Verbrauchte Einheiten" is what the week's runs were charged when they ran
 * (codex code-mail-03).
 *
 * It used to be every run of an account that is metered *now*: a free starter
 * example and a free re-analysis counted as a unit each, and an account that
 * added its own key afterwards took its earlier, charged runs out of last
 * week's figure. Each run now records the quota's decision (`metering`, inside
 * the signed payload), and the report counts that. Runs from before the record
 * are named as undetermined instead of being guessed.
 *
 * An in-memory source: `buildUsageReport` takes anything with `collection()`
 * and `collectionGroup()`, so the arithmetic needs no emulator.
 */

const NOW = new Date('2026-10-09T10:00:00Z');
const IN_WEEK = new Date('2026-10-06T10:00:00Z');

const docs = (rows: Record<string, unknown>[]) => ({
  get: async () => ({ docs: rows.map((r, i) => ({ id: String(r.id ?? i), data: () => r })) }),
});

function source(): UsageReportSource {
  const users = [
    // Metered now and then.
    { id: 'a', email: 'a@units.example.org', tier: 'pilot', status: 'approved', createdAt: IN_WEEK },
    { id: 'b', email: 'b@units.example.org', tier: 'pilot', status: 'approved', createdAt: IN_WEEK },
    // Added a key after a charged run this week: unmetered now, charged then.
    { id: 'c', email: 'c@units.example.org', tier: 'pilot', status: 'approved', byokConfigured: true, createdAt: IN_WEEK },
  ];
  const run = (userId: string, metering?: string) => ({ userId, createdAt: IN_WEEK.toISOString(), ...(metering ? { metering } : {}) });
  const runs = [
    run('a', 'charged'),
    run('a', 'reanalysis'),
    run('a', 'starter-example'),
    run('a', 'byok'),
    run('b', 'charged'),
    run('b'), // created before runs recorded their charge
    run('c', 'charged'),
  ];
  return {
    collection: (name: string) => docs(name === 'users' ? users : []),
    collectionGroup: (name: string) => docs(name === 'runs' ? runs : []),
  };
}

test('units are the charges recorded on the runs, and older runs are named undetermined', async () => {
  const report = await buildUsageReport(source(), NOW);
  expect(report.current.runs).toBe(7);
  expect(report.current.units, 'free runs counted, or a later key change rewrote the figure').toBe(3);
  expect(report.current.unitsUndetermined).toBe(1);
});

test('the mail names the undetermined runs beside the figure', async () => {
  const report = await buildUsageReport(source(), NOW);
  expect(renderUsageReportText(report)).toMatch(/Dazu 1 Analyse von vor der Erfassung/);
  expect(renderUsageReportEmail(report)).toMatch(/Dazu 1 Analyse von vor der Erfassung/);

  const recorded = { ...report, current: { ...report.current, unitsUndetermined: 0 } };
  expect(renderUsageReportText(recorded)).not.toMatch(/vor der Erfassung/);
});

test('every run the route writes carries the quota decision inside the signed payload', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'api', 'runs', 'create', 'route.ts'), 'utf8');
  expect(src).toContain('metering = quota.reason;');
  const payload = src.slice(src.indexOf('const unsignedRunPayload'), src.indexOf('const canonicalPayloadStr'));
  expect(payload, 'the quota decision is not in the signed run payload').toMatch(/\n\s*metering,\r?\n/);
});
