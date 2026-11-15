import { test, expect } from '@playwright/test';
import type { DocumentData } from 'firebase-admin/firestore';
import { buildUsageReport, usageReportSnapshot, type UsageReportSource } from '../lib/usage-report';
import { renderUsageReportEmail, renderUsageReportSubject, renderUsageReportText } from '../lib/usage-report-email';

/**
 * The weekly usage report holds what privacy policy 1.3 says it holds, and no more (owner decision 15.11.2026:
 * trim the report to the text rather than extend the text).
 *
 * Removed from the report, the stored snapshot and the mail: the count of accounts with their own model key, the
 * number of distinct analysed programmes, the all-time totals of granted units, used units and runs, and the list
 * "analyses per newly activated account" — one figure per account, which is a per-account value even without a name.
 * Kept: new and active accounts, accounts with a first signed run, runs, projects, used units (this and the previous
 * week), accounts in total, never started and at their limit, and the delivery counts.
 *
 * Built over an in-memory source from accounts that would fill every removed figure — a key of its own, charged
 * programmes, several first analyses this week — so a removed field that came back would carry a value. Server-free.
 */

type Doc = { id: string; data: DocumentData };

function source(world: Record<string, Doc[]>): UsageReportSource {
  const snap = (docs: Doc[]) => ({ get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }) });
  return {
    collection: (name: string) => snap(world[name] ?? []),
    collectionGroup: (name: string) => snap(world[name] ?? []),
  };
}

const END = new Date('2026-11-20T11:00:00Z');
const day = (n: number) => new Date(END.getTime() - n * 24 * 60 * 60 * 1000);

const world: Record<string, Doc[]> = {
  users: [
    { id: 'u-a', data: { email: 'a@customer.example.org', createdAt: day(3), transformationsUsed: 5, transformationsLimit: 5, chargedInputs: { p1: 1, p2: 1, p3: 1 } } },
    { id: 'u-b', data: { email: 'b@customer.example.org', createdAt: day(2), transformationsUsed: 1, transformationsLimit: 5, chargedInputs: { p4: 1 } } },
    { id: 'u-k', data: { email: 'k@customer.example.org', createdAt: day(30), byokConfigured: true, tier: 'pilot' } },
    { id: 'u-n', data: { email: 'n@customer.example.org', createdAt: day(40) } },
  ],
  projects: [
    { id: 'p-a', data: { userId: 'u-a', createdAt: day(3) } },
    { id: 'p-b', data: { userId: 'u-b', createdAt: day(2) } },
  ],
  runs: [
    { id: 'r-a1', data: { userId: 'u-a', createdAt: day(3).toISOString(), metering: 'charged' } },
    { id: 'r-a2', data: { userId: 'u-a', createdAt: day(2).toISOString(), metering: 'charged' } },
    { id: 'r-a3', data: { userId: 'u-a', createdAt: day(1).toISOString(), metering: 'charged' } },
    { id: 'r-b1', data: { userId: 'u-b', createdAt: day(2).toISOString(), metering: 'charged' } },
    { id: 'r-k1', data: { userId: 'u-k', createdAt: day(20).toISOString(), metering: 'unmetered' } },
  ],
  email_events: [
    { id: 'm-1', data: { to: ['hmac1_' + 'a'.repeat(64)], uid: 'u-a', kind: 'welcome', status: 'email.bounced', sentAt: day(3) } },
    { id: 'm-2', data: { to: ['hmac1_' + 'b'.repeat(64)], uid: 'u-b', kind: 'welcome', status: 'email.delivered', sentAt: day(2) } },
  ],
};

const REMOVED_FIELDS = ['byok', 'unitsUsed', 'unitsGranted', 'objectsAnalysed', 'runsAllTime', 'newlyActivated', 'distinctObjects'];

/** Every key at every depth of a plain value, with its path. */
function keysOf(value: unknown, at = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysOf(v, `${at}[${i}]`));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) => [`${at}${at ? '.' : ''}${k}`, ...keysOf(v, `${at}${at ? '.' : ''}${k}`)]);
  }
  return [];
}

/** Paths of every array in a plain value. */
function arraysOf(value: unknown, at = ''): string[] {
  if (Array.isArray(value)) return [at, ...value.flatMap((v, i) => arraysOf(v, `${at}[${i}]`))];
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) => arraysOf(v, `${at}${at ? '.' : ''}${k}`));
  }
  return [];
}

test('the world fills what the report keeps, so the absence of the rest proves something', async () => {
  const report = await buildUsageReport(source(world), END);
  expect(report.totals).toEqual({ accounts: 4, activated: 3, neverStarted: 1, atLimit: 1 });
  expect(report.current.activations).toBe(2);
  expect(report.current.runs).toBe(4);
  expect(report.current.units).toBe(4);
  expect(report.newAccounts).toBe(2);
  expect(report.delivery.bounced).toBe(1);
});

test('the report and its stored snapshot carry none of the removed fields and no per-account list', async () => {
  const report = await buildUsageReport(source(world), END);
  const snapshot = usageReportSnapshot(report, { providerId: 'p' });

  for (const [name, value] of [['report', report], ['snapshot', snapshot]] as const) {
    const leaves = keysOf(value).map((k) => k.split('.').pop()!.replace(/\[\d+\]$/, ''));
    expect(leaves.filter((k) => REMOVED_FIELDS.includes(k)), `${name}: a removed field`).toEqual([]);
    // The one list left is the failed mail, counted per kind of mail and outcome, never per account.
    expect(arraysOf(value), `${name}: a list other than the failed mail per kind`).toEqual(['delivery.failures']);
  }

  expect(Object.keys(snapshot).sort()).toEqual(
    ['current', 'delivery', 'expiresAt', 'newAccounts', 'periodEnd', 'periodStart', 'previous', 'providerId', 'reachedLimit', 'totals'],
  );
  expect(Object.keys(snapshot.totals).sort()).toEqual(['accounts', 'activated', 'atLimit', 'neverStarted']);
  for (const week of [snapshot.current, snapshot.previous]) {
    expect(Object.keys(week).sort()).toEqual(
      expect.arrayContaining(['activations', 'activeAccounts', 'projects', 'registrations', 'runs', 'units']),
    );
    expect(Object.keys(week).filter((k) => !['activations', 'activeAccounts', 'projects', 'registrations', 'runs', 'units', 'unitsUndetermined'].includes(k))).toEqual([]);
  }
});

test('a caller object with the old fields does not carry them into the snapshot', async () => {
  // A report shaped as before 15.11.2026 — say from an older build in a running job — is trimmed on the way to storage.
  const report = await buildUsageReport(source(world), END);
  const old = {
    ...report,
    totals: { ...report.totals, byok: 1, unitsUsed: 9, unitsGranted: 20, objectsAnalysed: 4, runsAllTime: 5 },
    newlyActivated: [3, 1],
  };
  const snapshot = usageReportSnapshot(old, { providerId: 'p' });
  const leaves = keysOf(snapshot).map((k) => k.split('.').pop()!);
  expect(leaves.filter((k) => REMOVED_FIELDS.includes(k))).toEqual([]);
});

test('the mail names none of the removed figures, in either part', async () => {
  const report = await buildUsageReport(source(world), END);
  const html = renderUsageReportEmail(report);
  const text = renderUsageReportText(report);
  const subject = renderUsageReportSubject(report);
  for (const [part, body] of [['subject', subject], ['html', html], ['text', text]] as const) {
    for (const label of ['BYOK', 'Mit eigenem Gemini-Key', 'Analysen insgesamt', 'ABAP-Objekte', 'vergebenen', 'Einheiten verbraucht', 'je Account']) {
      expect(body.includes(label), `${part}: "${label}" is in the mail`).toBe(false);
    }
  }
  // What it keeps is there.
  for (const label of ['Neue Registrierungen', 'Erstmals aktiviert', 'Aktive Accounts', 'Analysen durchgef', 'Neue Projekte', 'Verbrauchte Einheiten', 'Noch nie gestartet', 'Accounts (ohne Testkonten)', 'Versendet', 'Zugestellt', 'Abgeprallt']) {
    expect(html.includes(label), `html: "${label}" is missing`).toBe(true);
  }
  expect(text).toMatch(/ERSTMALS AKTIVIERT\n {2}2 Accounts\n/);
});
