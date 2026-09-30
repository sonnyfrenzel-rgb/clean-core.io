import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { buildUsageReport, usageReportSnapshot } from '../lib/usage-report';
import {
  renderUsageReportEmail,
  renderUsageReportSubject,
  renderUsageReportText,
} from '../lib/usage-report-email';

/**
 * The weekly report carries figures, and nothing that names a person (Sonny,
 * 30.09.2026).
 *
 * Built the way the Friday job builds it — `buildUsageReport` over the
 * emulator — from accounts that have a first name, a last name and an address,
 * and that land in every place the report used to list people: registered this
 * week, first analysis this week, at the quota limit, and a bounced message.
 * Then every channel the report leaves through is searched for any of it: the
 * mail's subject, HTML and text part, and the snapshot the job stores in
 * `usage_reports`.
 *
 * The seeded addresses are deliberately *not* on a CI test domain: the report
 * drops those accounts before it counts anything, and a spec whose people were
 * never in the report would pass without proving a thing. That is also why the
 * counts are checked first.
 */

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

test('the weekly report and its stored snapshot carry figures only', async () => {
  test.setTimeout(60_000);
  const db = adminDb();
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const people = [
    { uid: `figonly-a-${tag}`, firstName: `Annegret${tag}`, lastName: `Vogelsang${tag}`, email: `annegret.${tag}@figures-only.example.org` },
    { uid: `figonly-b-${tag}`, firstName: `Bartholomew${tag}`, lastName: `Quist${tag}`, email: `b.quist.${tag}@figures-only.example.org` },
  ];
  const projectRef = db.collection('projects').doc(`figonly-p-${tag}`);
  const runRef = projectRef.collection('runs').doc(`figonly-r-${tag}`);
  const bounceRef = db.collection('email_events').doc(`figonly-m-${tag}`);
  const refs = [...people.map((p) => db.collection('users').doc(p.uid)), runRef, projectRef, bounceRef];

  try {
    for (const p of people) {
      await db.collection('users').doc(p.uid).set({
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        status: 'approved',
        tier: 'pilot',
        createdAt: hourAgo,
        // The second one is at the limit.
        transformationsUsed: p === people[1] ? 5 : 1,
        transformationsLimit: 5,
      });
    }
    // The first one ran their first analysis this week.
    await projectRef.set({ userId: people[0].uid, name: 'figures-only', createdAt: hourAgo });
    await runRef.set({ userId: people[0].uid, createdAt: hourAgo.toISOString() });
    // A message to the second one bounced, and the provider's reason repeats
    // the address — as real bounce texts do.
    await bounceRef.set({
      messageId: `figonly-m-${tag}`,
      to: [people[1].email],
      uid: people[1].uid,
      kind: 'welcome',
      status: 'email.bounced',
      lastDetail: `550 5.1.1 <${people[1].email}> (${people[1].firstName} ${people[1].lastName}): mailbox unavailable`,
      sentAt: hourAgo,
      lastEventAt: hourAgo,
    });

    const report = await buildUsageReport(db, new Date(now.getTime() + 60_000));

    // The seeded people are in the figures — otherwise the search below proves nothing.
    expect(report.current.registrations, 'the new accounts were not counted').toBeGreaterThanOrEqual(2);
    expect(report.current.activations, 'the first analysis was not counted').toBeGreaterThanOrEqual(1);
    expect(report.totals.atLimit, 'the account at the limit was not counted').toBeGreaterThanOrEqual(1);
    expect(report.delivery.bounced, 'the bounce was not counted').toBeGreaterThanOrEqual(1);

    const channels: Record<string, string> = {
      subject: renderUsageReportSubject(report),
      html: renderUsageReportEmail(report),
      text: renderUsageReportText(report),
      snapshot: JSON.stringify(usageReportSnapshot(report, { providerId: 'seed-provider-id' })),
    };

    const needles = people.flatMap((p) => [
      p.uid,
      p.email,
      p.email.split('@')[0],
      p.firstName,
      p.lastName,
    ]);
    const leaks: string[] = [];
    for (const [channel, content] of Object.entries(channels)) {
      const haystack = content.toLowerCase();
      for (const needle of needles) {
        if (haystack.includes(needle.toLowerCase())) leaks.push(`${channel}: ${needle}`);
      }
    }
    expect(leaks, 'a name, address or uid reached the report').toEqual([]);
  } finally {
    await Promise.all(refs.map((r) => r.delete().catch(() => {})));
  }
});

test('the Friday job stores the named snapshot, not the report object or its recipient', () => {
  // The spec above proves what `usageReportSnapshot` returns; this proves the job
  // writes that and nothing beside it. A `...report` spread is what stored the
  // lists of people for as long as the report carried them.
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'send-usage-report.ts'), 'utf8');
  const write = source.slice(source.indexOf(".collection('usage_reports').add("));
  const call = write.slice(0, write.indexOf('});') + 3);
  expect(call, 'the snapshot write was not found').toContain('usageReportSnapshot(report');
  expect(call).not.toMatch(/\.\.\.report\b/);
  expect(call).not.toMatch(/\brecipient\b/);
  expect(call).not.toMatch(/\bto\b/);
});
