import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { DocumentData } from 'firebase-admin/firestore';
import { buildUsageReport, objectedToUsageReport, type UsageReportSource } from '../lib/usage-report';
import { auditRowNamesActorEmail } from '../lib/audit-pseudonymisation';

/**
 * Privacy policy section 9 (release 3.2.0): an account that objects to the
 * usage figures by e-mail is marked by the operator in the Admin Console
 * (`usageReportObjectionAt`, written by the Admin SDK only), and from the next
 * weekly report on it is left out entirely — its account, runs, projects and
 * mails are neither counted nor listed. Server-free: the report is built over
 * an in-memory source, the way the Friday job builds it over REST.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

type Doc = { id: string; data: DocumentData };
type World = { users: Doc[]; projects: Doc[]; runs: Doc[]; email_events: Doc[] };

function source(world: World): UsageReportSource {
  const snap = (docs: Doc[]) => ({ get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }) });
  return {
    collection: (name: string) => snap((world as Record<string, Doc[]>)[name] ?? []),
    collectionGroup: (name: string) => snap((world as Record<string, Doc[]>)[name] ?? []),
  };
}

const END = new Date('2026-11-20T11:00:00Z');
const day = (n: number) => new Date(END.getTime() - n * 24 * 60 * 60 * 1000);

/** Two ordinary accounts with a little of everything, this week and last. */
function baseWorld(): World {
  return {
    users: [
      { id: 'u-a', data: { email: 'a@customer.example.org', createdAt: day(20), transformationsUsed: 2, transformationsLimit: 5, chargedInputs: { x: 1, y: 1 } } },
      { id: 'u-b', data: { email: 'b@customer.example.org', createdAt: day(3), transformationsUsed: 0, transformationsLimit: 5 } },
    ],
    projects: [
      { id: 'p-a1', data: { userId: 'u-a', createdAt: day(10) } },
      { id: 'p-a2', data: { userId: 'u-a', createdAt: day(2) } },
    ],
    runs: [
      { id: 'r-a1', data: { userId: 'u-a', createdAt: day(10).toISOString(), metering: 'charged' } },
      { id: 'r-a2', data: { userId: 'u-a', createdAt: day(2).toISOString(), metering: 'charged' } },
    ],
    email_events: [
      { id: 'm-b', data: { to: ['hmac1_' + 'b'.repeat(64)], uid: 'u-b', kind: 'welcome', status: 'email.delivered', sentAt: day(3) } },
    ],
  };
}

/**
 * The objecting account touches every figure the report has: registered this
 * week, first analysis this week, a project, at its limit, a key of its own on
 * a second account of the same kind, charged objects, and mail that bounced —
 * one record with its uid (since 3.0.21 the address is a keyed hash), one
 * older record with the address in clear and no uid.
 */
function withObjector(world: World, marked: boolean): World {
  const marker = marked ? { usageReportObjectionAt: { toDate: () => day(1) } } : {};
  return {
    users: [
      ...world.users,
      { id: 'u-x', data: { email: 'Objector@Customer.example.org', createdAt: day(4), transformationsUsed: 5, transformationsLimit: 5, chargedInputs: { a: 1, b: 1, c: 1 }, ...marker } },
      { id: 'u-y', data: { email: 'byok@customer.example.org', createdAt: day(9), byokConfigured: true, tier: 'pilot', ...marker } },
    ],
    projects: [...world.projects, { id: 'p-x', data: { userId: 'u-x', createdAt: day(3) } }, { id: 'p-y', data: { userId: 'u-y', createdAt: day(8) } }],
    runs: [
      ...world.runs,
      { id: 'r-x1', data: { userId: 'u-x', createdAt: day(3).toISOString(), metering: 'charged' } },
      { id: 'r-x2', data: { userId: 'u-x', createdAt: day(2).toISOString(), metering: null } },
      { id: 'r-y1', data: { userId: 'u-y', createdAt: day(8).toISOString(), metering: 'unmetered' } },
    ],
    email_events: [
      ...world.email_events,
      { id: 'm-x1', data: { to: ['hmac1_' + 'c'.repeat(64)], uid: 'u-x', kind: 'welcome', status: 'email.bounced', sentAt: day(4) } },
      { id: 'm-x2', data: { to: ['objector@customer.example.org'], kind: 'tenant approval', status: 'email.complained', sentAt: day(2) } },
      { id: 'm-x3', data: { to: ['hmac1_' + 'd'.repeat(64)], uid: 'u-x', kind: 'admin signup', status: 'email.sent', sentAt: day(4) } },
    ],
  };
}

const figures = async (world: World) => {
  // `generatedAt` is the clock at build time, not a figure.
  const report: Partial<Awaited<ReturnType<typeof buildUsageReport>>> = await buildUsageReport(source(world), END);
  delete report.generatedAt;
  return report as Omit<Awaited<ReturnType<typeof buildUsageReport>>, 'generatedAt'>;
};

test('a marked account changes no figure of the weekly report', async () => {
  const without = await figures(baseWorld());
  const marked = await figures(withObjector(baseWorld(), true));
  expect(marked).toEqual(without);
});

test('the same accounts unmarked do change the figures, so the comparison above proves something', async () => {
  const without = await figures(baseWorld());
  const unmarked = await figures(withObjector(baseWorld(), false));
  expect(unmarked.totals.accounts).toBe(without.totals.accounts + 2);
  expect(unmarked.current.registrations).toBe(without.current.registrations + 1);
  expect(unmarked.current.activations).toBe(without.current.activations + 1);
  expect(unmarked.current.runs).toBe(without.current.runs + 2);
  expect(unmarked.current.projects).toBe(without.current.projects + 1);
  expect(unmarked.previous.projects).toBe(without.previous.projects + 1);
  expect(unmarked.totals.atLimit).toBe(without.totals.atLimit + 1);
  expect(unmarked.totals.byok).toBe(without.totals.byok + 1);
  expect(unmarked.totals.objectsAnalysed).toBe(without.totals.objectsAnalysed + 3);
  expect(unmarked.newlyActivated.length).toBe(without.newlyActivated.length + 1);
  expect(unmarked.delivery.sent).toBe(without.delivery.sent + 3);
  expect(unmarked.delivery.bounced).toBe(without.delivery.bounced + 1);
  expect(unmarked.delivery.complained).toBe(without.delivery.complained + 1);
  expect(unmarked.delivery.awaiting).toBe(without.delivery.awaiting + 1);
  expect(unmarked).not.toEqual(without);
});

test('the marker counts when set and not when absent or cleared', () => {
  expect(objectedToUsageReport({ usageReportObjectionAt: { toDate: () => new Date() } })).toBe(true);
  expect(objectedToUsageReport({ usageReportObjectionAt: new Date() })).toBe(true);
  expect(objectedToUsageReport({})).toBe(false);
  expect(objectedToUsageReport({ usageReportObjectionAt: null })).toBe(false);
});

test('no browser can write the marker: it is in neither client allowlist of the rules', () => {
  const rules = read('firestore.rules');
  expect(rules).not.toContain('usageReportObjectionAt');
  // The users rule admits only the listed keys on create and update.
  expect(rules).toContain('request.resource.data.keys().hasOnly(userClientCreateKeys())');
  expect(rules).toContain('request.resource.data.diff(resource.data).addedKeys().hasOnly(userClientUpdateKeys())');
  expect(rules).toContain('request.resource.data.diff(resource.data).removedKeys().hasOnly([])');
});

test('the operator sets and clears it in the Admin Console, with an audit row in the same batch', () => {
  const route = read('app/api/admin/console-action/route.ts');
  expect(route).toContain("case 'usage-report-objection-on':");
  expect(route).toContain("case 'usage-report-objection-off': {");
  expect(route).toContain("adminSetUsageReportObjection(decodedAdmin.uid, uid, action === 'usage-report-objection-on')");

  const lib = read('lib/firebase-admin.ts');
  const start = lib.indexOf('export async function adminSetUsageReportObjection(');
  expect(start).toBeGreaterThan(-1);
  const body = lib.slice(start, lib.indexOf('\n}\n', start));
  expect(body).toContain("usageReportObjectionAt: on ? FieldValue.serverTimestamp() : FieldValue.delete()");
  expect(body).toContain("await auditEventRecord(db, adminUid, on ? 'USAGE_REPORT_OBJECTION_ON' : 'USAGE_REPORT_OBJECTION_OFF', targetUid)");
  // `update`, not a merge: the marker never creates a profile for an unknown uid.
  expect(body).toContain('batch.update(userRef,');
  expect(body.match(/await batch\.commit\(\)/g) ?? []).toHaveLength(1);
  for (const action of ['USAGE_REPORT_OBJECTION_ON', 'USAGE_REPORT_OBJECTION_OFF']) {
    expect(auditRowNamesActorEmail(action), action).toBe(true);
  }

  const page = read('app/(app)/admin/page.tsx');
  expect(page).toContain("'usage-report-objection-off' : 'usage-report-objection-on'");
});
