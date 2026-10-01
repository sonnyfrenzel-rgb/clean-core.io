import { test, expect } from '@playwright/test';
import { declineMark, declinedInThisSignIn } from '../lib/terms-decline';

/**
 * A "not now" on the Terms gate lasts for one sign-in, not for the tab.
 *
 * Carried QA finding 3f5a34a117be: the decline was stored as `'1'` in session
 * storage, so somebody who declined, signed out and signed in again in the same
 * tab was not asked again — although a new sign-in is exactly when the gate has
 * to ask (Sonny, 18.09.2026).
 */

const SIGN_IN_1 = { uid: 'u-1', metadata: { lastSignInTime: 'Wed, 01 Oct 2026 08:00:00 GMT' } };
const SIGN_IN_2 = { uid: 'u-1', metadata: { lastSignInTime: 'Wed, 01 Oct 2026 09:30:00 GMT' } };
const OTHER = { uid: 'u-2', metadata: { lastSignInTime: 'Wed, 01 Oct 2026 08:00:00 GMT' } };

test('a decline holds for the sign-in it was made in — a reload keeps both uid and sign-in time', () => {
  expect(declinedInThisSignIn(declineMark(SIGN_IN_1), SIGN_IN_1)).toBe(true);
});

test('signing in again in the same tab asks again', () => {
  expect(declinedInThisSignIn(declineMark(SIGN_IN_1), SIGN_IN_2)).toBe(false);
});

test('another account in the same tab is asked', () => {
  expect(declinedInThisSignIn(declineMark(SIGN_IN_1), OTHER)).toBe(false);
});

test('the bare marker the gate used to store counts for nobody', () => {
  expect(declinedInThisSignIn('1', SIGN_IN_1)).toBe(false);
  expect(declinedInThisSignIn(null, SIGN_IN_1)).toBe(false);
  expect(declineMark(null)).toBeNull();
});
