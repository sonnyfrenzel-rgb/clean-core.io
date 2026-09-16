import { test, expect } from '@playwright/test';
import { isTestAccount } from '../lib/test-accounts';

/**
 * `isTestAccount` feeds a deletion cascade. `scripts/cleanup-test-accounts.ts
 * --apply` deletes every user it returns true for — profile, projects, runs,
 * secrets and the Auth account — so a false positive is a person losing their
 * account because of the name they chose.
 *
 * The classifier used to match on local-part prefixes alone, anchored at the
 * start of the whole address: `security-user-alice@example.com` was a test
 * account. Now the domain is the rule. These cases fail against the old list.
 */

const CI_ADDRESSES = [
  'superduper-e2e-dev@cleancore-test.io',
  'security-user-dev-1726000000000-42@cleancore-test.io',
  'temp-delete-dev-1726000000000@cleancore-test.io',
  'starter-examples-e2e@cleancore-test.io',
  'unsub-idem-1726000000000@cleancore-test.io',
  'anything-at-all@usage-e2e.io',
  '  MIXED-Case@CleanCore-Test.IO  ',
];

// Real-looking addresses that begin with every prefix the old list matched on.
const PEOPLE_WITH_UNLUCKY_NAMES = [
  'security-user-alice@example.com',
  'temp-delete-me@gmail.com',
  'perf-user-bob@company.de',
  'superduper-e2e@outlook.com',
  'starter-examples-e2e@sap.com',
  'unsub-e2e-carol@protonmail.com',
  'prod-unsub-probe@clean-core.io',
];

test.describe('an address on a CI-owned domain', () => {
  for (const email of CI_ADDRESSES) {
    test(`${email.trim()} is a test account`, () => {
      expect(isTestAccount(email)).toBe(true);
    });
  }
});

test.describe('a person whose local part happens to look like a suite prefix', () => {
  for (const email of PEOPLE_WITH_UNLUCKY_NAMES) {
    test(`${email} is not a test account`, () => {
      expect(isTestAccount(email)).toBe(false);
    });
  }
});

test.describe('the domain has to be exact', () => {
  test('a look-alike domain does not count', () => {
    expect(isTestAccount('user@cleancore-test.io.example.com')).toBe(false);
    expect(isTestAccount('user@notcleancore-test.io')).toBe(false);
    expect(isTestAccount('user@sub.cleancore-test.io')).toBe(false);
  });

  test('a missing or malformed address is not a test account', () => {
    expect(isTestAccount(undefined)).toBe(false);
    expect(isTestAccount(null)).toBe(false);
    expect(isTestAccount('')).toBe(false);
    expect(isTestAccount('cleancore-test.io')).toBe(false);
    expect(isTestAccount('@cleancore-test.io')).toBe(false);
    expect(isTestAccount('user@')).toBe(false);
  });
});
