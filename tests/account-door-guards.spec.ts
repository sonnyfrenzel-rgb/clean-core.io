import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { isRecentLogin } from '../lib/recent-login';

/**
 * L-01 and L-09 — the doors into and out of an account.
 *
 * L-09: the recent-login check of the account deletion subtracted a missing
 * `auth_time` and compared NaN, which never exceeds a limit. `isRecentLogin`
 * allows only a provably recent sign-in.
 *
 * L-01: an ID token outlives the erasure of its account by up to an hour.
 * Registration and consent ask Firebase Auth whether the account still exists
 * (`checkRevoked`), and `recordConsent` updates the profile instead of merging
 * onto it, so neither recreates a deleted account. The consent half is proven
 * against the emulator in `tests/terms-version-archive.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('isRecentLogin (L-09)', () => {
  const now = 1_800_000_000;
  test('a sign-in within the window is recent', () => {
    expect(isRecentLogin({ auth_time: now - 299 }, 300, now)).toBe(true);
    expect(isRecentLogin({ auth_time: now }, 300, now)).toBe(true);
  });
  test('an older sign-in is not', () => {
    expect(isRecentLogin({ auth_time: now - 301 }, 300, now)).toBe(false);
  });
  test('a token without a numeric auth_time is not a recent login', () => {
    expect(isRecentLogin({}, 300, now)).toBe(false);
    expect(isRecentLogin({ auth_time: undefined }, 300, now)).toBe(false);
    expect(isRecentLogin({ auth_time: '1800000000' }, 300, now)).toBe(false);
    expect(isRecentLogin({ auth_time: Number.NaN }, 300, now)).toBe(false);
    expect(isRecentLogin(null, 300, now)).toBe(false);
  });
  test('a sign-in time in the future is not evidence', () => {
    expect(isRecentLogin({ auth_time: now + 3600 }, 300, now)).toBe(false);
  });
});

test('the account deletion asks isRecentLogin and does no arithmetic of its own', () => {
  const src = read('app/api/account/delete/route.ts');
  expect(src).toContain('isRecentLogin(decodedToken, 300)');
  expect(src).not.toMatch(/nowSeconds\s*-\s*authTime/);
});

test('registration and consent verify the token against the account (checkRevoked)', () => {
  for (const rel of ['app/api/account/register/route.ts', 'app/api/consent/route.ts']) {
    const src = read(rel);
    expect(src, rel).toMatch(/verifyRequestAuth\((request|req), \{ checkRevoked: true \}\)/);
    expect(src, `${rel} has no unchecked verification left`).not.toMatch(/verifyRequestAuth\((request|req)\)/);
  }
  const admin = read('lib/firebase-admin.ts');
  expect(admin).toMatch(/if \(checkRevoked\) return auth\.verifyIdToken\(idToken, true\);/);
});
