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
