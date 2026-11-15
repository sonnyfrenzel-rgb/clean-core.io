import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ENGAGEMENT_EVENTS, isDeliveredStatus, isEngagementEvent, mailStatusWins, RANK, rankOf } from '../lib/mail-status';
import { buildUsageReport, usageReportSnapshot, type UsageReportSource } from '../lib/usage-report';
import { renderUsageReportEmail, renderUsageReportText } from '../lib/usage-report-email';

/**
 * Open and click tracking is off in the mail provider's account, and the platform records neither event (release
 * 3.2.0, privacy review of the weekly report): the webhook drops them, neither delivery record stores them, and the
 * weekly report counts delivery only, so "delivered" describes everything it holds. A record written while tracking
 * may have been on, whose status is still an open or a click, counts as the delivery it implies. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('an open and a click are engagement events, and nothing ranks them', () => {
  expect([...ENGAGEMENT_EVENTS].sort()).toEqual(['email.clicked', 'email.opened']);
  expect(isEngagementEvent('email.opened')).toBe(true);
  expect(isEngagementEvent('email.clicked')).toBe(true);
  expect(isEngagementEvent('email.delivered')).toBe(false);
  expect(Object.keys(RANK).some((k) => isEngagementEvent(k))).toBe(false);
  // An older record's open ranks as delivered: a later delivery does not move it, a bounce does.
  expect(rankOf('email.opened')).toBe(RANK['email.delivered']);
  expect(mailStatusWins('email.opened', 'email.delivered')).toBe(false);
  expect(mailStatusWins('email.opened', 'email.bounced')).toBe(true);
  expect(isDeliveredStatus('email.clicked')).toBe(true);
  expect(isDeliveredStatus('email.sent')).toBe(false);
});

test('the webhook and both recorders drop an engagement event before anything is stored', () => {
  const route = read('app/api/webhooks/resend/route.ts');
  const drop = route.indexOf('if (isEngagementEvent(type))');
  expect(drop, 'the webhook drops opens and clicks').toBeGreaterThan(-1);
  expect(drop).toBeLessThan(route.indexOf('await recordEmailEvent('));

  const events = read('lib/email-events.ts');
  const body = events.slice(events.indexOf('export async function recordEmailEvent('));
  expect(body.indexOf('if (isEngagementEvent(event.type)) return;')).toBeGreaterThan(-1);
  expect(body.indexOf('if (isEngagementEvent(event.type)) return;')).toBeLessThan(body.indexOf('getAdminDb()'));
  expect(events).not.toMatch(/'email\.(opened|clicked)'/);

  const invitations = read('lib/invitation-delivery-record.ts');
  const inv = invitations.slice(invitations.indexOf('export async function recordInvitationEvent('));
  expect(inv.indexOf('if (isEngagementEvent(input.type)) return true;')).toBeGreaterThan(-1);
  expect(inv.indexOf('if (isEngagementEvent(input.type)) return true;')).toBeLessThan(inv.indexOf('runTransaction'));
});

/** The four collections the report reads, from plain arrays. */
function source(mail: Array<Record<string, unknown>>): UsageReportSource {
  const of = (rows: Array<Record<string, unknown>>) => ({
    get: async () => ({ docs: rows.map((r, i) => ({ id: `d${i}`, data: () => r })) }),
  });
  return {
    collection: (name: string) => of(name === 'email_events' ? mail : []),
    collectionGroup: () => of([]),
  };
}

test('the weekly report counts delivery only; an older open counts as delivered', async () => {
  const periodEnd = new Date('2026-11-13T11:00:00Z');
  const sentAt = new Date('2026-11-10T09:00:00Z');
  const mail = [
    { kind: 'welcome', status: 'email.delivered', sentAt },
    { kind: 'welcome', status: 'email.opened', sentAt },
    { kind: 'welcome', status: 'email.clicked', sentAt },
    { kind: 'welcome', status: 'email.bounced', sentAt },
    { kind: 'welcome', status: 'email.sent', sentAt },
  ];
  const report = await buildUsageReport(source(mail), periodEnd);
  expect(report.delivery).toEqual({ sent: 5, delivered: 3, delayed: 0, bounced: 1, complained: 0, awaiting: 1, failures: [{ kind: 'welcome', status: 'email.bounced', count: 1 }] });

  const snapshot = usageReportSnapshot(report, { providerId: 'p' });
  expect(Object.keys(snapshot.delivery).sort()).toEqual(['awaiting', 'bounced', 'complained', 'delayed', 'delivered', 'failures', 'sent']);

  const html = renderUsageReportEmail(report);
  const text = renderUsageReportText(report);
  for (const body of [html, text]) {
    expect(body).not.toMatch(/geöffnet|geklickt|opened|clicked/i);
  }
  expect(text).toContain('Zugestellt: 3');
});
