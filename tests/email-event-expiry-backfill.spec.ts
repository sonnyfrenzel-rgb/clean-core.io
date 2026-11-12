import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mailDeliveryRecordExpiry } from '../lib/proof-log';
import { emailEventBackfillExpiry } from '../scripts/backfill-email-event-expiry';

/**
 * Hotfix 3.0.22 — the delivery records of mails (`email_events`) written
 * before 3.0.21 carry no `expiresAt`, so the TTL policy never deletes them.
 * `scripts/backfill-email-event-expiry.ts` gives them the date the live writer
 * would have set. Server-free: the rule is a pure function.
 */

const ROOT = path.resolve(__dirname, '..');
const SENT = new Date('2026-08-01T10:00:00Z');
const ts = (d: Date) => ({ toDate: () => d });

test.describe('email_events expiresAt backfill', () => {
  test('counts the live period from sentAt', () => {
    const plan = emailEventBackfillExpiry({ sentAt: ts(SENT), updatedAt: ts(new Date('2026-08-05T00:00:00Z')) });
    expect(plan).toEqual({ expiresAt: mailDeliveryRecordExpiry(SENT) });
  });

  test('never touches a record that already has expiresAt', () => {
    expect(emailEventBackfillExpiry({ sentAt: ts(SENT), expiresAt: ts(new Date('2027-01-01T00:00:00Z')) })).toEqual({
      skip: 'has-expiry',
    });
  });

  test('a webhook-only record counts from its earliest event', () => {
    const plan = emailEventBackfillExpiry({
      lastEventAt: '2026-08-03T00:00:00Z',
      timeline: [
        { type: 'email.opened', at: '2026-08-03T00:00:00Z' },
        { type: 'email.delivered', at: '2026-08-01T10:00:00Z' },
        { type: 'email.bogus', at: 'not a date' },
      ],
      updatedAt: ts(new Date('2026-08-03T00:00:00Z')),
    });
    expect(plan).toEqual({ expiresAt: mailDeliveryRecordExpiry(SENT) });
  });

  test('falls back to lastEventAt, then updatedAt', () => {
    expect(emailEventBackfillExpiry({ lastEventAt: SENT.toISOString() })).toEqual({
      expiresAt: mailDeliveryRecordExpiry(SENT),
    });
    expect(emailEventBackfillExpiry({ updatedAt: ts(SENT) })).toEqual({ expiresAt: mailDeliveryRecordExpiry(SENT) });
  });

  test('leaves a record without any time alone', () => {
    expect(emailEventBackfillExpiry({ messageId: 'm', status: 'email.sent' })).toEqual({ skip: 'no-time' });
    expect(emailEventBackfillExpiry({ lastEventAt: 'garbage', timeline: [] })).toEqual({ skip: 'no-time' });
  });

  test('the script reads the period from the shared constant, writes in batches of at most 400, and is wired up', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/backfill-email-event-expiry.ts'), 'utf8');
    expect(src).toContain("import { mailDeliveryRecordExpiry } from '../lib/proof-log';");
    expect(src).not.toMatch(/\b90\b\s*\*/);
    expect(src).toContain('const BATCH_SIZE = 400;');
    expect(src).toContain("process.argv.includes('--apply')");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['retention:backfill-email-expiry']).toBe('tsx scripts/backfill-email-event-expiry.ts');
    expect(fs.readFileSync(path.join(ROOT, 'docs/DATA-RETENTION.md'), 'utf8')).toContain(
      'scripts/backfill-email-event-expiry.ts',
    );
  });
});
