/**
 * Recognises the accounts the CI creates, so they can be kept out of anything
 * meant for people.
 *
 * Every pipeline run registers a fresh user to drive the E2E suite, and none of
 * them are ever cleaned up — they had grown to 125 of the 155 documents in
 * `users`, drowning the real accounts in the admin console and putting 125
 * addresses one careless query away from a bulk send.
 *
 * Single source of truth: the admin console filter, the bulk sender and the
 * cleanup script all import this. If the tests ever adopt a new naming scheme,
 * this is the one place that has to learn about it.
 */

const TEST_PATTERNS: RegExp[] = [
  /@cleancore-test\.io$/i,
  /^superduper-e2e/i,
  /^security-user-/i,
  /^temp-delete-/i,
  /^perf-user-/i,
  /^starter-examples-e2e/i,
  /^unsub-(e2e|idem|forged|expired|get)-/i,
  /^prod-unsub-probe/i,
  /@usage-e2e\.io$/i,
];

/** True for an address created by the test suite rather than a person. */
export function isTestAccount(email: string | null | undefined): boolean {
  const value = (email || '').trim().toLowerCase();
  if (!value) return false;
  return TEST_PATTERNS.some((pattern) => pattern.test(value));
}
