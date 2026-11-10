import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  INVITATION_DELIVERY_RECORDS,
  invitationDeliveryRecord,
  invitationDeliveryRecordExpiry,
  invitationKindOfSubject,
  recordInvitationEvent,
  recordInvitationSent,
  type InvitationRecordDb,
} from '../lib/invitation-delivery-record';
import { accountHashOf } from '../lib/pseudonym';
import { INVITATION_EMAIL_SUBJECT } from '../lib/invitation-email';
import { PORTFOLIO_INVITATION_SUBJECT } from '../lib/portfolio/invitation-email';
import { retainProofsOfErasedAccount, type ProofLogDb } from '../lib/proof-log-erasure';

/**
 * The delivery record of an invitation mail (privacy policy sections 6 and 8):
 * keyed hash of the address, inviter, time, provider message id, delivery
 * status — six months from sending, with no address in clear, deleted by a
 * TTL policy on `expiresAt`. Server-free: an in-memory stand-in for the
 * transaction the writes use, plus source checks of the wiring.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENV = { PSEUDONYM_PEPPER: 'spec-pseudonym-pepper-0123456789abcdef' };
const DEL = Symbol('delete');
const ADDRESS = 'Invited.Person@Example.org';

type Row = Record<string, unknown>;

function memoryDb() {
  const store = new Map<string, Map<string, Row>>();
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const merge = (target: Row | undefined, data: Row): Row => {
    const out: Row = { ...(target ?? {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v === DEL) delete out[k];
      else out[k] = v;
    }
    return out;
  };
  const ref = (c: string, id: string) => ({ c, id, get: async () => ({ id, exists: col(c).has(id), ref: ref(c, id), data: () => col(c).get(id) }) });
  const db: InvitationRecordDb & ProofLogDb = {
    collection: (name: string) => ({
      doc: (id?: string) => ref(name, id ?? 'auto'),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...col(name).entries()].filter(([, d]) => d[field] === value).map(([id, d]) => ({ id, ref: ref(name, id), data: () => d })),
        }),
      }),
    }),
    runTransaction: async <T,>(fn: (tx: { get(r: unknown): Promise<{ exists: boolean; data(): Row | undefined }>; set(r: unknown, d: Row, o?: { merge: boolean }): unknown }) => Promise<T>) => {
      const ops: Array<() => void> = [];
      const out = await fn({
        get: async (r) => {
          const x = r as { c: string; id: string };
          return { exists: col(x.c).has(x.id), data: () => col(x.c).get(x.id) };
        },
        set: (r, d, o) => ops.push(() => {
          const x = r as { c: string; id: string };
          col(x.c).set(x.id, o?.merge ? merge(col(x.c).get(x.id), d) : merge(undefined, d));
        }),
      });
      ops.forEach((op) => op());
      return out;
    },
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: unknown, d: Row, o?: { merge: boolean }) => ops.push(() => { const x = r as { c: string; id: string }; col(x.c).set(x.id, o?.merge ? merge(col(x.c).get(x.id), d) : merge(undefined, d)); }),
        update: (r: unknown, d: Row) => ops.push(() => { const x = r as { c: string; id: string }; col(x.c).set(x.id, merge(col(x.c).get(x.id), d)); }),
        delete: (r: unknown) => ops.push(() => { const x = r as { c: string; id: string }; col(x.c).delete(x.id); }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  } as unknown as InvitationRecordDb & ProofLogDb;
  return { db, col };
}

test.describe('the record', () => {
  test('six calendar months from sending', () => {
    expect(invitationDeliveryRecordExpiry(new Date('2026-11-05T10:00:00Z')).toISOString()).toBe('2027-05-05T10:00:00.000Z');
    expect(invitationDeliveryRecordExpiry(new Date('2026-08-31T08:00:00Z')).toISOString()).toBe('2027-02-28T08:00:00.000Z');
    expect(invitationDeliveryRecordExpiry(new Date('2027-08-31T08:00:00Z')).toISOString()).toBe('2028-02-29T08:00:00.000Z');
  });

  test('holds the keyed hash, the inviter, the time, the message id and its deletion date — no address', () => {
    const sentAt = new Date('2026-11-05T10:00:00Z');
    const record = invitationDeliveryRecord({ messageId: 'msg-1', recipient: ADDRESS, inviterUid: 'inviter-1', kind: 'project', sentAt }, ENV)!;
    expect(record).toEqual({
      messageId: 'msg-1',
      kind: 'project',
      recipientHash: accountHashOf(ADDRESS, ENV),
      inviterUid: 'inviter-1',
      sentAt,
      retention: 'six-months-after-sending',
      expiresAt: new Date('2027-05-05T10:00:00.000Z'),
    });
    expect(JSON.stringify(record).toLowerCase()).not.toContain('invited.person');
  });

  test('without the pepper nothing is written', async () => {
    expect(invitationDeliveryRecord({ messageId: 'm', recipient: ADDRESS, inviterUid: 'i', kind: 'portfolio', sentAt: new Date() }, {})).toBeNull();
    const { db, col } = memoryDb();
    expect(await recordInvitationSent(db, { messageId: 'm', recipient: ADDRESS, inviterUid: 'i', kind: 'portfolio' }, {})).toBe('no-pepper');
    expect(col(INVITATION_DELIVERY_RECORDS).size).toBe(0);
  });

  test('the subjects of both invitation mails, and no other', () => {
    expect(invitationKindOfSubject(INVITATION_EMAIL_SUBJECT)).toBe('project');
    expect(invitationKindOfSubject(PORTFOLIO_INVITATION_SUBJECT)).toBe('portfolio');
    expect(invitationKindOfSubject('Welcome to Clean-Core.io')).toBeNull();
  });
});

test.describe('the delivery status', () => {
  test('sent, then delivered, then a scanner\'s open; a bounce always wins; a retried event counts once', async () => {
    const { db, col } = memoryDb();
    const sentAt = new Date('2026-11-05T10:00:00Z');
    await recordInvitationSent(db, { messageId: 'm1', recipient: ADDRESS, inviterUid: 'inv', kind: 'project', sentAt }, ENV);
    expect(col(INVITATION_DELIVERY_RECORDS).get('m1')!.status).toBe('email.sent');
    const event = (type: string, id: string) =>
      recordInvitationEvent(db, { messageId: 'm1', type, to: [ADDRESS], subject: INVITATION_EMAIL_SUBJECT, occurredAt: `2026-11-05T10:0${id}:00Z` }, `evt-${id}`, ENV);
    expect(await event('email.delivered', '1')).toBe(true);
    expect(await event('email.opened', '2')).toBe(true);
    expect(await event('email.delivered', '3')).toBe(true);
    const r = col(INVITATION_DELIVERY_RECORDS).get('m1')!;
    expect(r.status).toBe('email.opened');
    expect(r.statusAt).toBe('2026-11-05T10:02:00Z');
    await event('email.bounced', '4');
    await event('email.bounced', '4');
    await event('email.clicked', '5');
    const after = col(INVITATION_DELIVERY_RECORDS).get('m1')!;
    expect(after.status).toBe('email.bounced');
    expect(after.seenEventIds).toEqual(['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5']);
    // Nothing the provider sent beyond the status is kept.
    expect(JSON.stringify(after).toLowerCase()).not.toContain('invited.person');
    expect(after.subject).toBeUndefined();
    expect(after.to).toBeUndefined();
  });

  test('an event that outruns the send creates the record with the hash, and the send completes it', async () => {
    const { db, col } = memoryDb();
    expect(await recordInvitationEvent(db, { messageId: 'm2', type: 'email.delivered', to: [ADDRESS], subject: PORTFOLIO_INVITATION_SUBJECT, occurredAt: 'then' }, 'e1', ENV)).toBe(true);
    expect(col(INVITATION_DELIVERY_RECORDS).get('m2')).toMatchObject({ kind: 'portfolio', recipientHash: accountHashOf(ADDRESS, ENV), status: 'email.delivered' });
    const sentAt = new Date('2026-11-05T10:00:00Z');
    await recordInvitationSent(db, { messageId: 'm2', recipient: ADDRESS, inviterUid: 'inv', kind: 'portfolio', sentAt }, ENV);
    const r = col(INVITATION_DELIVERY_RECORDS).get('m2')!;
    expect(r).toMatchObject({ status: 'email.delivered', inviterUid: 'inv', sentAt, expiresAt: new Date('2027-05-05T10:00:00.000Z') });
  });

  test('any other mail is left to email_events; without the pepper an early invitation event stores nothing', async () => {
    const { db, col } = memoryDb();
    expect(await recordInvitationEvent(db, { messageId: 'w', type: 'email.delivered', to: ['x@example.org'], subject: 'Welcome' }, 'e', ENV)).toBe(false);
    expect(await recordInvitationEvent(db, { messageId: 'm3', type: 'email.delivered', to: [ADDRESS], subject: INVITATION_EMAIL_SUBJECT }, 'e', {})).toBe(true);
    expect(col(INVITATION_DELIVERY_RECORDS).size).toBe(0);
    expect(read('lib/email-events.ts')).toContain('if (await recordInvitationEvent(db, input, eventId)) return;');
  });
});

test.describe('wiring and erasure', () => {
  test('both invitation routes write this record and not an email_events record', () => {
    for (const [rel, kind] of [
      ['app/api/projects/[projectId]/invitations/route.ts', "kind: 'project'"],
      ['app/api/portfolio/selections/[selectionId]/invitations/route.ts', "kind: 'portfolio'"],
    ] as const) {
      const src = read(rel);
      expect(src, rel).toContain('deliveryRecord: (messageId) =>');
      expect(src, rel).toContain('recordInvitationSent(');
      expect(src, rel).toContain(kind);
    }
    const mail = read('lib/transactional-mail.ts');
    expect(mail).toContain('if (messageId && msg.deliveryRecord) {');
    expect(mail).toMatch(/\} else if \(messageId\) \{[\s\S]{0,300}recordEmailSent\(messageId, msg\.to, msg\.subject, msg\.label, msg\.uid\)/);
  });

  test('an erased inviter becomes the keyed hash; the record stays until its date', async () => {
    const { db, col } = memoryDb();
    const sentAt = new Date('2026-11-05T10:00:00Z');
    await recordInvitationSent(db, { messageId: 'm4', recipient: ADDRESS, inviterUid: 'inviter-gone', kind: 'project', sentAt }, ENV);
    await recordInvitationSent(db, { messageId: 'm5', recipient: ADDRESS, inviterUid: 'someone-else', kind: 'project', sentAt }, ENV);
    const out = await retainProofsOfErasedAccount(db, () => DEL, { uid: 'inviter-gone', addresses: ['inviter@example.org'], endedAt: sentAt, ending: 'account-deletion', env: ENV });
    const r = col(INVITATION_DELIVERY_RECORDS).get('m4')!;
    expect(r.inviterUid).toBeUndefined();
    expect(r).toMatchObject({ inviterHash: out.accountHash, recipientHash: accountHashOf(ADDRESS, ENV), expiresAt: new Date('2027-05-05T10:00:00.000Z') });
    expect(col(INVITATION_DELIVERY_RECORDS).get('m5')!.inviterUid).toBe('someone-else');
    // Without the pepper the cascade deletes them instead.
    expect(read('lib/firebase-admin.ts')).toContain("await deleteCollectionByUid(INVITATION_DELIVERY_RECORDS, 'inviterUid');");
  });

  test('the register names the collection with a TTL claim the verifier reads', () => {
    const row = read('docs/DATA-RETENTION.md').split('\n').find((l) => l.startsWith('| `invitation_delivery_records/'));
    expect(row).toBeDefined();
    expect(row!).toContain('`expiresAt` drives the proof-log TTL policy');
  });
});
