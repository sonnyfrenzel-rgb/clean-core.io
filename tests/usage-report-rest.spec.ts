import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { buildUsageReport, usageReportSnapshot } from '../lib/usage-report';
import { firestoreRest, SERVER_TIMESTAMP } from '../scripts/lib/firestore-rest';

/**
 * The weekly report runs in the one job that holds `id-token: write`, and since
 * QA review fa0aaea6cc47 it runs there without a single npm package: Firestore
 * over REST instead of `firebase-admin`, Node's type stripping instead of `tsx`.
 *
 * The workflow guard (`no-fabricated-figures.spec.ts`) proves nothing from npm
 * is installed. This proves the report is still the same report: the REST
 * client and the Admin SDK, over the same seeded emulator database, give
 * `buildUsageReport` identical input, and the snapshot the REST client writes
 * reads back as the Admin SDK would have written it.
 */

const ROOT = path.resolve(__dirname, '..');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

function seededDb() {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  const databaseId = `usage-rest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return { databaseId, db: adminFirestore(app, databaseId) };
}

async function seed(db: Firestore) {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000);
  await db.collection('users').doc('u-a').set({
    email: 'a@rest-parity.example.org', createdAt: Timestamp.fromDate(hoursAgo(5)),
    transformationsUsed: 5, transformationsLimit: 5, chargedInputs: { X: true, Y: true }, status: 'active',
  });
  await db.collection('users').doc('u-b').set({
    email: 'b@rest-parity.example.org', createdAt: Timestamp.fromDate(hoursAgo(200)),
    tier: 'enterprise', byokConfigured: true, transformationsUsed: 2,
  });
  await db.collection('users').doc('u-ci').set({ email: 'ci@cleancore-test.io', createdAt: Timestamp.fromDate(hoursAgo(1)) });
  await db.collection('projects').doc('p-1').set({ userId: 'u-a', createdAt: Timestamp.fromDate(hoursAgo(4)) });
  // `runs.createdAt` is an ISO string, the other collections use Timestamps.
  await db.collection('projects').doc('p-1').collection('runs').doc('r-1').set({ userId: 'u-a', createdAt: hoursAgo(3).toISOString() });
  await db.collection('projects').doc('p-1').collection('runs').doc('r-2').set({ userId: 'u-b', createdAt: hoursAgo(190).toISOString() });
  await db.collection('email_events').doc('m-1').set({
    to: ['a@rest-parity.example.org'], kind: 'welcome', status: 'email.bounced', sentAt: Timestamp.fromDate(hoursAgo(2)),
  });
  await db.collection('email_events').doc('m-2').set({
    to: 'b@rest-parity.example.org', kind: 'welcome', status: 'email.delivered', sentAt: Timestamp.fromDate(hoursAgo(2)),
  });
}

test('the REST client gives the report exactly what the Admin SDK gives it', async () => {
  test.setTimeout(60_000);
  const { databaseId, db } = seededDb();
  await seed(db);
  const rest = firestoreRest({
    projectId: firebaseConfig.projectId, databaseId, accessToken: 'owner', origin: `http://${EMULATOR}`,
  });

  const at = new Date(Date.now() + 60_000);
  const { generatedAt: _a, ...viaAdmin } = await buildUsageReport(db, at);
  const { generatedAt: _b, ...viaRest } = await buildUsageReport(rest, at);
  void _a; void _b;
  expect(viaAdmin.totals.accounts, 'the seed reached the report').toBe(2);
  expect(viaAdmin.delivery.bounced).toBe(1);
  expect(viaRest).toEqual(viaAdmin);

  // The snapshot write: same fields, Dates as Timestamps, and the server's own time.
  const report = await buildUsageReport(rest, at);
  const { id } = await rest.collection('usage_reports').add({
    ...usageReportSnapshot(report, { providerId: 'parity-test' }),
    generatedAt: SERVER_TIMESTAMP,
  });
  const stored = (await db.collection('usage_reports').doc(id).get()).data()!;
  expect(stored.generatedAt).toBeInstanceOf(Timestamp);
  expect(stored.periodEnd).toBeInstanceOf(Timestamp);
  expect((stored.periodEnd as Timestamp).toDate().toISOString()).toBe(report.periodEnd.toISOString());
  const expected = usageReportSnapshot(report, { providerId: 'parity-test' }) as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    if (value instanceof Date) continue;
    expect(stored[key], `stored field ${key}`).toEqual(value);
  }
});

test('the report runs with no node_modules at all, on Node type stripping', async () => {
  // The way the Friday job runs it: a copy of the import graph with no
  // `node_modules` anywhere above it, started by plain `node`. A package import
  // anywhere in the graph fails this run.
  const [major, minor] = process.versions.node.split('.').map(Number);
  test.skip(major < 22 || (major === 22 && minor < 15), `needs Node >= 22.15 for module.registerHooks; this is ${process.version}`);
  test.setTimeout(60_000);

  const { databaseId, db } = seededDb();
  await seed(db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-report-'));
  try {
    const files = [
      'package.json',
      'scripts/send-usage-report.ts', 'scripts/lib/firestore-rest.ts', 'scripts/lib/ts-extension-hook.mjs',
      'scripts/lib/report-recipient.ts',
      ...['usage-report', 'usage-report-email', 'email-layout', 'version', 'export-safety', 'test-accounts', 'constants']
        .map((f) => `lib/${f}.ts`),
    ];
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      FIRESTORE_EMULATOR_HOST: EMULATOR, NEXT_PUBLIC_FIRESTORE_DB_ID: databaseId,
      REPORT_RECIPIENT: 'nobody@rest-parity.example.org',
    };
    const run = spawnSync(process.execPath, [
      '--experimental-strip-types', '--import', './scripts/lib/ts-extension-hook.mjs', 'scripts/send-usage-report.ts',
    ], { cwd: dir, env, encoding: 'utf8', timeout: 45_000 });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('accounts    : 2 (2 activated, 0 never started)');
    expect(run.stdout).toContain('DRY RUN');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
