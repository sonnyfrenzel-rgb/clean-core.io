import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mfaRemovalBlockedByOwnKey, OWN_KEY_BLOCKS_MFA_REMOVAL } from '../lib/mfa-gate';

/**
 * Gates around an account's stored secrets (25.11.2026): an own model key is held only with the second factor,
 * so the factor goes only after the key.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

test('the second factor is not removed while an own model key is stored', () => {
  expect(mfaRemovalBlockedByOwnKey({ byokConfigured: true })).toBe(OWN_KEY_BLOCKS_MFA_REMOVAL);
  expect(OWN_KEY_BLOCKS_MFA_REMOVAL.status).toBe(409);
  for (const p of [null, undefined, {}, { byokConfigured: false }, { byokConfigured: 'true' }]) expect(mfaRemovalBlockedByOwnKey(p)).toBeNull();

  const route = read('app/api/mfa/disable/route.ts');
  const gate = route.indexOf('mfaRemovalBlockedByOwnKey(');
  expect(gate, 'the disable route does not ask about a stored key').toBeGreaterThan(-1);
  expect(gate, 'the key is asked about after the factor is already gone').toBeLessThan(route.indexOf('retireSecondFactor(uid'));
  // Only while Firebase Auth holds a factor: a flag without one could not remove the key either.
  expect(route.slice(route.lastIndexOf('if (hasFactor)', gate), gate)).toContain('if (hasFactor)');
});

test('the S/4 credentials route reads its body under a bound', () => {
  const route = read('app/api/s4-credentials/route.ts');
  expect(route).toContain('readBoundedRequestJson(req, S4_REQUEST_BODY_LIMITS)');
  expect(route).not.toContain('await req.json()');
});

test('one address receives at most three invitation mails a day, whoever sends them', async () => {
  const { invitationRecipientRefusal, INVITATION_RECIPIENT_DAILY_LIMIT } = await import('../lib/portfolio/selection-invitations');
  const counts = new Map<string, number>();
  const limit = async (key: string, max: number) => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > max) throw Object.assign(new Error('Rate limit exceeded.'), { status: 429 });
  };
  const key = (email: string) => `hmac1_${email.length}`;
  for (let i = 0; i < INVITATION_RECIPIENT_DAILY_LIMIT; i++) expect(await invitationRecipientRefusal('a@example.org', { key, limit })).toBeNull();
  expect(await invitationRecipientRefusal('a@example.org', { key, limit })).toMatchObject({ status: 429, code: 'invitation-recipient-limit' });
  // Counted by the keyed hash, never the address; without a pepper there is no key and nothing is counted.
  expect([...counts.keys()].every((k) => !k.includes('@'))).toBe(true);
  expect(await invitationRecipientRefusal('a@example.org', { key: () => null, limit })).toBeNull();
  // A store failure is not a refusal of the address.
  await expect(invitationRecipientRefusal('b@example.org', { key, limit: async () => { throw new Error('unavailable'); } })).rejects.toThrow('unavailable');
  // Both routes that send invitations ask it.
  for (const rel of ['app/api/projects/[projectId]/invitations/route.ts', 'app/api/portfolio/selections/[selectionId]/invitations/route.ts']) {
    expect(read(rel), rel).toContain('invitationRecipientRefusal(');
  }
});
