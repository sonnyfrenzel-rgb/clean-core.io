import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { deliveryRecordHashes, isKeyedHash, planEmailEventRewrite, withoutAddresses } from '../lib/email-event-hashing';
import { accountHashOf, subjectHashOf, PseudonymPepperMissingError } from '../lib/pseudonym';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';

/**
 * The mail log keeps a hash, not the address or the subject (legal texts
 * Fassung 1.1, privacy policy sections 2 and 6): `email_events` holds the
 * recipient address and the subject only as keyed hashes, the provider's
 * diagnostic without addresses, and still the kind, the time, the message id
 * and the status for 90 days. Records written before are rewritten by the
 * owner's one-off `scripts/hash-email-events.ts`.
 *
 * Server-free: the pure rule (`lib/email-event-hashing.ts`) runs here; the
 * writers are read from source. The writes against the emulator are
 * `tests/email-events-behaviour.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENV = { PSEUDONYM_PEPPER: 'spec-pseudonym-pepper-0123456789abcdef' };
const DEL = Symbol('delete');
const ADDRESS = 'Someone@Example.org';

test.describe('what a delivery record keeps', () => {
  test('the address as the same keyed hash an erasure writes, the subject as a keyed hash of its own', () => {
    const h = deliveryRecordHashes({ to: [ADDRESS], subject: 'Welcome to Clean-Core.io' }, ENV)!;
    expect(h.to).toEqual([accountHashOf(ADDRESS, ENV)]);
    expect(h.subjectHash).toBe(subjectHashOf('Welcome to Clean-Core.io', ENV));
    expect(isKeyedHash(h.to[0]) && isKeyedHash(h.subjectHash)).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/someone|example|welcome/i);
    // A subject and an address that read alike do not hash alike.
    expect(subjectHashOf('a@b.c', ENV)).not.toBe(accountHashOf('a@b.c', ENV));
  });

  test('without the pepper: nothing — never the address or the subject in clear', () => {
    expect(deliveryRecordHashes({ to: [ADDRESS], subject: 'x' }, {})).toBeNull();
    expect(() => subjectHashOf('x', {})).toThrow(PseudonymPepperMissingError);
  });

  test('the provider diagnostic loses any address it quotes', () => {
    expect(withoutAddresses('550 5.1.1 <someone@example.org>: Recipient address rejected')).toBe('550 5.1.1 <[address]>: Recipient address rejected');
    expect(withoutAddresses('mailbox does not exist')).toBe('mailbox does not exist');
    expect(withoutAddresses(null)).toBeNull();
  });

  test('the send and the webhook write the hashes and remove a subject in clear', () => {
    const src = read('lib/email-events.ts');
    const sent = src.slice(src.indexOf('export async function recordEmailSent'));
    const event = src.slice(src.indexOf('export async function recordEmailEvent'), src.indexOf('export async function recordEmailSent'));
    for (const fn of [sent, event]) {
      expect(fn).toContain('to: hashed ? hashed.to : [],');
      expect(fn).toContain('subject: FieldValue.delete(),');
      expect(fn).not.toMatch(/^\s*to: \[to\],$|^\s*to: input\.to,$|^\s*subject,$|subject: input\.subject \?\?/m);
    }
    expect(event).toContain('detail: withoutAddresses(event.detail)');
    // The period is unchanged: 90 days from sending.
    expect(sent).toContain('expiresAt: mailDeliveryRecordExpiry(new Date()),');
    // The weekly report still leaves the CI's mail out without the address.
    expect(sent).toContain('...(isTestAccount(to) ? { testRecipient: true } : {}),');
    expect(read('lib/usage-report.ts')).toContain('!m.test && !isTestAccount(m.to)');
  });

  test('an erasure finds a record by the keyed hash and by the subject hash', () => {
    expect(read('lib/proof-log-erasure.ts')).toContain('for (const address of addresses) keys.add(accountHashOf(address, env));');
    expect(read('lib/firebase-admin.ts')).toContain("where('subjectHash', '==', subjectHashOf(subject))");
  });
});

test.describe('the one-off rewrite of older records', () => {
  test('address and subject become hashes; kind, id, status, times and expiry stay', () => {
    const old = {
      messageId: 'm1',
      to: [ADDRESS],
      subject: 'Your Clean-Core.io account',
      kind: 'welcome',
      uid: 'u1',
      status: 'email.bounced',
      lastDetail: 'rejected: someone@example.org',
      lastEventAt: '2026-10-01T10:00:00Z',
      timeline: [{ type: 'email.bounced', at: 't', detail: '<someone@example.org> unknown' }, { type: 'email.sent', at: 's', detail: null }],
      expiresAt: 'kept',
    };
    const update = planEmailEventRewrite(old, DEL, ENV)!;
    expect(update.to).toEqual([accountHashOf(ADDRESS, ENV)]);
    expect(update.subject).toBe(DEL);
    expect(update.subjectHash).toBe(subjectHashOf('Your Clean-Core.io account', ENV));
    expect(update.lastDetail).toBe('rejected: [address]');
    expect((update.timeline as Array<{ detail: string | null }>).map((t) => t.detail)).toEqual(['<[address]> unknown', null]);
    for (const kept of ['messageId', 'kind', 'uid', 'status', 'lastEventAt', 'expiresAt']) expect(update, `${kept} was touched`).not.toHaveProperty(kept);
    expect(update).not.toHaveProperty('testRecipient');
  });

  test('a second run finds nothing to do; a test recipient is marked; a string recipient becomes a list', () => {
    const once = { to: [accountHashOf(ADDRESS, ENV)], subjectHash: subjectHashOf('s', ENV), lastDetail: 'ok', kind: 'welcome' };
    expect(planEmailEventRewrite(once, DEL, ENV)).toBeNull();
    expect(planEmailEventRewrite({ to: ['ci@cleancore-test.io'] }, DEL, ENV)).toMatchObject({ testRecipient: true });
    expect(planEmailEventRewrite({ to: ADDRESS }, DEL, ENV)).toEqual({ to: [accountHashOf(ADDRESS, ENV)] });
  });

  test('the script is a dry run by default, refuses CI and without the pepper, and prints counts only', () => {
    const src = read('scripts/hash-email-events.ts');
    expect(src).toContain("const apply = process.argv.includes('--apply');");
    expect(src).toContain('if (process.env.CI || process.env.GITHUB_ACTIONS)');
    expect(src).toContain('if (!pseudonymPepperConfigured())');
    expect(src).toContain('planEmailEventRewrite(doc.data()');
    expect(src).not.toMatch(/console\.log\([^)]*(doc\.id|\.to\b|subject\))/);
  });
});

test.describe('the texts say what the record holds', () => {
  test('privacy section 2: address and subject only as a keyed hash', () => {
    expect(PRIVACY_DE).toContain('Empfängeradresse und Betreff nur als schlüsselbasierten Hashwert, keinen Inhalt');
    expect(PRIVACY_EN).toContain('the recipient address and the subject only as a keyed hash; no content');
  });

  test('privacy section 6: still the 90 days, with the hash only', () => {
    expect(PRIVACY_DE).toContain('{{mailDeliveryRecordRetention}} nach dem Versand, mit Adresse und Betreff nur als Hashwert');
    expect(PRIVACY_EN).toContain('{{mailDeliveryRecordRetention}} after sending, with the address and the subject only as a hash');
  });

  test('the retention register names the hashes and the owner\'s rewrite', () => {
    const row = read('docs/DATA-RETENTION.md').split('\n').find((l) => l.startsWith('| `email_events/'))!;
    expect(row).toContain('only as keyed hashes');
    expect(row).toContain('scripts/hash-email-events.ts');
    expect(row).toContain('**90 days**');
  });
});
