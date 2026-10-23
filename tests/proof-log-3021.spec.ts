import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  ERASURE_NOTES,
  PROOF_LOG_RETENTION,
  erasureNoteExpiry,
  mailDeliveryRecordDays,
  mailDeliveryRecordExpiry,
  proofLogExpiry,
} from '../lib/proof-log';
import { accountHashOf, PseudonymPepperMissingError } from '../lib/pseudonym';
import { retainProofsOfErasedAccount, suppressionKeyOf, type ProofLogDb } from '../lib/proof-log-erasure';
import { suppressionId } from '../lib/unsubscribe-token';
import { ADMIN_SIGNUP_MAIL_KIND } from '../lib/admin-signup-email';

/**
 * Roadmap 3.0.21 — the proof log of the legal texts, Fassung 1.1 (acceptance
 * tests T05/T06; open values `proofLog` and `retentionRegister`): every proof
 * record carries its own deletion date, an erasure keeps "proofs, not data" —
 * the keyed hash in place of address and account — and deletes the rest.
 *
 * Server-free: the erasure step runs against an in-memory stand-in for the
 * handful of Firestore calls it makes. The whole cascade against the emulator
 * is `tests/account-erasure.spec.ts` and `tests/hardening-v220-cf.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENV = { PSEUDONYM_PEPPER: 'spec-pseudonym-pepper-0123456789abcdef' };
const DELETE = Symbol('delete');

type Row = Record<string, unknown>;

/** Collections of documents in memory; `where`, `doc().get()` and batched set/update/delete. */
function memoryDb(seed: Record<string, Record<string, Row>>) {
  const store = new Map<string, Map<string, Row>>();
  for (const [c, docs] of Object.entries(seed)) store.set(c, new Map(Object.entries(docs).map(([id, d]) => [id, { ...d }])));
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  let auto = 0;
  const ref = (c: string, id: string) => ({
    c,
    id,
    get: async () => ({ id, ref: ref(c, id), exists: col(c).has(id), data: () => col(c).get(id) }),
  });
  const apply = (target: Row | undefined, data: Row): Row => {
    const out: Row = { ...(target ?? {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete out[k];
      else out[k] = v;
    }
    return out;
  };
  const db: ProofLogDb = {
    collection: (name) => ({
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...col(name).entries()]
            .filter(([, d]) => (op === '==' ? d[field] === value : Array.isArray(d[field]) && (d[field] as unknown[]).includes(value)))
            .map(([id, d]) => ({ id, ref: ref(name, id), data: () => d })),
        }),
      }),
      doc: (id?: string) => ref(name, id ?? `auto${++auto}`),
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r, data, opts) => ops.push(() => { const x = r as { c: string; id: string }; col(x.c).set(x.id, opts?.merge ? apply(col(x.c).get(x.id), data) : apply(undefined, data)); }),
        update: (r, data) => ops.push(() => { const x = r as { c: string; id: string }; if (!col(x.c).has(x.id)) throw new Error('NOT_FOUND'); col(x.c).set(x.id, apply(col(x.c).get(x.id), data)); }),
        delete: (r) => ops.push(() => { const x = r as { c: string; id: string }; col(x.c).delete(x.id); }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db, col };
}

const UID = 'erased-uid';
const EMAIL = 'Person@Example.org';
const ENDED = new Date('2026-10-13T09:30:00Z');

function seeded() {
  return memoryDb({
    consent_events: {
      c1: { uid: UID, userId: UID, email: EMAIL, kind: 'accepted', termsVersion: '2026-10-23', termsLanguage: 'de', contentSha256: 'abc', locale: 'de-DE', source: 'api/account/register', retention: PROOF_LOG_RETENTION, expiresAt: null },
      other: { uid: 'someone', userId: 'someone', email: 'x@example.org', kind: 'accepted', expiresAt: null },
    },
    byok_agreement_events: {
      b1: { uid: UID, userId: UID, provider: 'anthropic', kind: 'accepted', version: 'ZV-BYOK-1.0', language: 'en', contentSha256: 'def', expiresAt: null },
    },
    email_events: {
      m1: { messageId: 'm1', to: [EMAIL], uid: UID, subject: 'Welcome', kind: 'welcome', status: 'email.delivered', lastDetail: 'ok', sentAt: new Date('2026-10-01T10:00:00Z') },
      m2: { messageId: 'm2', to: [EMAIL], uid: null, subject: 'old', kind: 'tenant approval', status: 'email.sent' },
      m3: { messageId: 'm3', to: ['info@clean-core.io'], uid: UID, subject: 'New account', kind: ADMIN_SIGNUP_MAIL_KIND, status: 'email.sent' },
      m4: { messageId: 'm4', to: ['other@example.org'], uid: 'someone', kind: 'welcome', status: 'email.sent' },
    },
    email_suppressions: {
      [suppressionId(EMAIL)]: { email: EMAIL.toLowerCase(), list: 'community-updates', source: 'one-click', unsubscribedAt: 'then' },
      [suppressionId('other@example.org')]: { email: 'other@example.org', list: 'community-updates' },
    },
  });
}

test.describe('every proof record carries its own deletion date (T05/T06)', () => {
  test('the periods the texts state', () => {
    // Privacy section 5: "contract ended 13 October 2026 → deletion on 31 December 2029".
    expect(proofLogExpiry(new Date('2026-10-13T12:00:00Z')).toISOString()).toBe('2029-12-31T00:00:00.000Z');
    expect(proofLogExpiry(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2029-12-31T00:00:00.000Z');
    // The deletion note: three years.
    expect(erasureNoteExpiry(ENDED).toISOString()).toBe('2029-10-13T09:30:00.000Z');
    // Delivery records: the open value the privacy policy renders (90 days).
    expect(mailDeliveryRecordDays()).toBe(90);
    expect(mailDeliveryRecordExpiry(new Date('2026-10-01T00:00:00Z')).toISOString()).toBe('2026-12-30T00:00:00.000Z');
  });

  test('written with the record: acceptance, agreement events and delivery records', () => {
    expect(read('lib/consent.ts')).toMatch(/retention: PROOF_LOG_RETENTION,\s*expiresAt: null,/);
    expect(read('lib/firebase-admin.ts')).toMatch(/retention: PROOF_LOG_RETENTION,\s*expiresAt: null,/);
    const events = read('lib/email-events.ts');
    expect(events).toContain('expiresAt: mailDeliveryRecordExpiry(new Date()),');
    expect(events).toContain('...(data.expiresAt ? {} : { expiresAt: mailDeliveryRecordExpiry(new Date()) }),');
  });

  test('the TTL policies that delete them are in the register, and the verifier checks each', () => {
    const register = read('docs/DATA-RETENTION.md');
    for (const c of ['consent_events', 'byok_agreement_events', 'erasure_notes', 'email_events']) {
      const row = register.split('\n').find((l) => l.startsWith(`| \`${c}/`));
      expect(row, `${c} has no row in docs/DATA-RETENTION.md`).toBeDefined();
      expect(row!, `${c}: no TTL claim the verifier reads`).toContain('`expiresAt` drives the proof-log TTL policy');
    }
    expect(read('scripts/retention-verify.ts')).toContain("line.includes('drives the proof-log TTL policy')");
  });
});

test.describe('an erasure keeps proofs, not data (privacy section 5, Terms 1.3, C7)', () => {
  test('the acceptance records stay with the keyed hash, the end of the contract and their deletion date', async () => {
    const { db, col } = seeded();
    const out = await retainProofsOfErasedAccount(db, () => DELETE, { uid: UID, addresses: [EMAIL], endedAt: ENDED, ending: 'account-deletion', env: ENV });
    const hash = accountHashOf(EMAIL, ENV);
    expect(out.accountHash).toBe(hash);
    expect(hash).toMatch(/^hmac1_[0-9a-f]{64}$/);
    // Not the plain digest anyone could recompute from an address list.
    expect(hash).not.toContain(suppressionId(EMAIL));

    const c1 = col('consent_events').get('c1')!;
    expect(c1).toMatchObject({ accountHash: hash, termsVersion: '2026-10-23', termsLanguage: 'de', contentSha256: 'abc', contractEnding: 'account-deletion' });
    for (const gone of ['uid', 'userId', 'email', 'locale']) expect(c1[gone], `consent row kept ${gone}`).toBeUndefined();
    expect((c1.expiresAt as Date).toISOString()).toBe('2029-12-31T00:00:00.000Z');
    const b1 = col('byok_agreement_events').get('b1')!;
    expect(b1).toMatchObject({ accountHash: hash, version: 'ZV-BYOK-1.0', language: 'en', contentSha256: 'def' });
    expect(b1.uid).toBeUndefined();
    // Somebody else's record is untouched.
    expect(col('consent_events').get('other')).toMatchObject({ uid: 'someone', email: 'x@example.org', expiresAt: null });
  });

  test('the end of the contract and the deletion note are recorded, once even on a retry', async () => {
    const { db, col } = seeded();
    const input = { uid: UID, addresses: [EMAIL], endedAt: ENDED, ending: 'account-deletion' as const, env: ENV };
    await retainProofsOfErasedAccount(db, () => DELETE, input);
    await retainProofsOfErasedAccount(db, () => DELETE, input);
    const hash = accountHashOf(EMAIL, ENV);
    const ends = [...col('consent_events').values()].filter((r) => r.kind === 'contract-ended');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ accountHash: hash, contractEnding: 'account-deletion' });
    expect((ends[0].expiresAt as Date).toISOString()).toBe('2029-12-31T00:00:00.000Z');
    const notes = [...col(ERASURE_NOTES).values()];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ accountHash: hash, deletedAt: ENDED });
    expect((notes[0].expiresAt as Date).toISOString()).toBe('2029-10-13T09:30:00.000Z');
    // No address anywhere in what is kept.
    const kept = JSON.stringify([...col('consent_events').values(), ...col(ERASURE_NOTES).values(), ...col('byok_agreement_events').values()]);
    expect(kept.toLowerCase()).not.toContain(EMAIL.toLowerCase().split('@')[0]);
  });

  test('delivery records stay pseudonymised until their own date; the operator notification goes', async () => {
    const { db, col } = seeded();
    await retainProofsOfErasedAccount(db, () => DELETE, { uid: UID, addresses: [EMAIL], endedAt: ENDED, ending: 'account-deletion', env: ENV });
    const hash = accountHashOf(EMAIL, ENV);
    const m1 = col('email_events').get('m1')!;
    expect(m1).toMatchObject({ to: [hash], kind: 'welcome', status: 'email.delivered', messageId: 'm1' });
    for (const gone of ['uid', 'subject', 'lastDetail']) expect(m1[gone], `delivery record kept ${gone}`).toBeUndefined();
    expect((m1.expiresAt as Date).toISOString()).toBe('2026-12-30T10:00:00.000Z');
    // A record without a sending time counts from the erasure.
    expect((col('email_events').get('m2')!.expiresAt as Date).toISOString()).toBe(mailDeliveryRecordExpiry(ENDED).toISOString());
    expect(col('email_events').get('m2')!.to).toEqual([hash]);
    expect(col('email_events').has('m3'), 'the operator notification about the account outlived it').toBe(false);
    expect(col('email_events').get('m4')).toMatchObject({ to: ['other@example.org'], uid: 'someone' });
  });

  test('an opt-out stays as the keyed hash only; the clear-text entry goes, somebody else\'s stays', async () => {
    const { db, col } = seeded();
    await retainProofsOfErasedAccount(db, () => DELETE, { uid: UID, addresses: [EMAIL], endedAt: ENDED, ending: 'account-deletion', env: ENV });
    expect(col('email_suppressions').has(suppressionId(EMAIL))).toBe(false);
    const keyed = col('email_suppressions').get(suppressionKeyOf(EMAIL, ENV))!;
    expect(keyed).toMatchObject({ list: 'community-updates', keyed: true, retention: 'without-time-limit', unsubscribedAt: 'then' });
    expect(keyed.email).toBeUndefined();
    expect(col('email_suppressions').get(suppressionId('other@example.org'))).toMatchObject({ email: 'other@example.org' });
  });

  test('without the pepper nothing is written, and the cascade deletes instead of keeping the address', async () => {
    const { db, col } = seeded();
    await expect(retainProofsOfErasedAccount(db, () => DELETE, { uid: UID, addresses: [EMAIL], endedAt: ENDED, ending: 'account-deletion', env: {} })).rejects.toBeInstanceOf(PseudonymPepperMissingError);
    expect(col('consent_events').get('c1')!.email).toBe(EMAIL);
    const admin = read('lib/firebase-admin.ts');
    const at = admin.indexOf('if (!(e instanceof PseudonymPepperMissingError)) throw e;');
    expect(at).toBeGreaterThan(-1);
    expect(admin.slice(at, at + 900)).toContain("await deleteCollectionByUid('consent_events');");
    // The erasure no longer deletes the proof log outright.
    expect(admin.slice(0, at)).not.toContain("await deleteCollectionByUid('consent_events');");
    expect(read('.github/workflows/deploy.yml')).toContain('PSEUDONYM_PEPPER=${{ secrets.PSEUDONYM_PEPPER }}');
  });

  test('new opt-outs store the keyed hash only; opting in again lifts both shapes', () => {
    const unsub = read('app/api/unsubscribe/route.ts');
    expect(unsub).toContain("db.collection('email_suppressions').doc(suppressionKeyOf(address))");
    expect(unsub).not.toMatch(/email: address,\s*list:/);
    const optIn = read('app/api/community-mail/route.ts');
    expect(optIn).toContain("batch.delete(db.collection('email_suppressions').doc(suppressionKeyOf(address)));");
    expect(optIn).toContain("batch.delete(db.collection('email_suppressions').doc(suppressionId(address)));");
    expect(read('scripts/send-survey.ts')).toContain('keyedIds.has(accountHashOf(email))');
  });
});
