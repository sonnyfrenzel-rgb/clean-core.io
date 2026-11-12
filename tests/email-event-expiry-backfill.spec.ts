import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mailDeliveryRecordExpiry } from '../lib/proof-log';
import type { Timestamp } from 'firebase-admin/firestore';
import { backfillEmailEventExpiry, emailEventBackfillExpiry, type BackfillDoc, type BackfillStore } from '../scripts/backfill-email-event-expiry';

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

/**
 * A fake of the two Firestore operations the backfill uses: pages in id order,
 * and batches that apply all-or-nothing and fail when a record's update time is
 * no longer the one it was read with — Firestore's `lastUpdateTime` precondition.
 */
function fakeStore(records: Array<{ id: string; data: Record<string, unknown> }>) {
  const live = new Map(records.map((r) => [r.id, { data: { ...r.data }, version: 1 }]));
  const log: string[] = [];
  const batches: number[] = [];
  const version = (t: Timestamp) => (t as unknown as { version: number }).version;
  const store: BackfillStore = {
    async page(after, limit) {
      log.push('page');
      const ids = [...live.keys()].sort().filter((id) => !after || id > after.id).slice(0, limit);
      return ids.map((id): BackfillDoc => {
        const r = live.get(id)!;
        const data = { ...r.data };
        return { id, data: () => data, updateTime: { version: r.version } as unknown as Timestamp };
      });
    },
    batch() {
      const ops: Array<{ id: string; data: { expiresAt: Date }; at: number }> = [];
      return {
        update: (id, data, pre) => void ops.push({ id, data, at: version(pre.lastUpdateTime) }),
        async commit() {
          log.push('commit');
          batches.push(ops.length);
          if (ops.some((o) => live.get(o.id)?.version !== o.at)) throw new Error('FAILED_PRECONDITION');
          for (const o of ops) {
            const r = live.get(o.id)!;
            r.data = { ...r.data, ...o.data };
            r.version++;
          }
        },
      };
    },
  };
  /** Another writer (a late webhook) changes a record after the scan read it. */
  const touch = (id: string) => {
    const r = live.get(id)!;
    r.data = { ...r.data, expiresAt: ts(new Date('2027-01-01T00:00:00Z')) };
    r.version++;
  };
  return { store, live, log, batches, touch };
}

const id = (i: number) => `e${String(i).padStart(5, '0')}`;
const legacy = (n: number) => Array.from({ length: n }, (_, i) => ({ id: id(i), data: i % 2 ? { sentAt: ts(SENT) } : { sentAt: ts(SENT), expiresAt: ts(new Date('2027-01-01T00:00:00Z')) } }));

test.describe('email_events expiresAt backfill — against a fake store', () => {
  test('a dry run reads every page and writes nothing', async () => {
    const f = fakeStore(legacy(1200));
    const c = await backfillEmailEventExpiry(f.store, { apply: false, now: SENT.getTime() });
    expect(c).toEqual({ scanned: 1200, hasExpiry: 600, noTime: 0, toWrite: 600, alreadyDue: 0, written: 0 });
    expect(f.log.filter((l) => l === 'commit')).toEqual([]);
    expect([...f.live.values()].filter((r) => r.version !== 1)).toEqual([]);
  });

  test('--apply writes only the records without expiresAt, in batches of at most 400, page by page', async () => {
    const f = fakeStore([...legacy(1200), ...Array.from({ length: 900 }, (_, i) => ({ id: `f${String(i).padStart(5, '0')}`, data: { sentAt: ts(SENT) } }))]);
    const c = await backfillEmailEventExpiry(f.store, { apply: true, now: SENT.getTime() });
    expect(c.written).toBe(1500);
    expect(c.toWrite).toBe(1500);
    expect(Math.max(...f.batches)).toBeLessThanOrEqual(400);
    for (const [key, r] of f.live) {
      expect(r.data.expiresAt, key).toBeDefined();
      // A record that had a date keeps it: it was never written.
      if (key.startsWith('e') && Number(key.slice(1)) % 2 === 0) expect(r.version, key).toBe(1);
    }
    expect((f.live.get(id(1))!.data.expiresAt as Date).getTime()).toBe(mailDeliveryRecordExpiry(SENT).getTime());
    // Each page is written before the next one is read: nothing but counters outlives a page.
    expect(f.log.slice(0, 3)).toEqual(['page', 'commit', 'page']);
    // A second run finds nothing to do.
    const again = await backfillEmailEventExpiry(f.store, { apply: true, now: SENT.getTime() });
    expect(again.written).toBe(0);
  });

  test('a record another writer changed after the scan read it is not overwritten', async () => {
    const f = fakeStore(legacy(10));
    const page = f.store.page.bind(f.store);
    f.store.page = async (after, limit) => {
      const docs = await page(after, limit);
      f.touch(id(3)); // a late webhook writes its own expiresAt between the read and the batch
      return docs;
    };
    await expect(backfillEmailEventExpiry(f.store, { apply: true, now: SENT.getTime() })).rejects.toThrow('FAILED_PRECONDITION');
    expect((f.live.get(id(3))!.data.expiresAt as { toDate: () => Date }).toDate().toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect([...f.live.values()].filter((r) => r.version !== 1).length).toBe(1);
  });
});
