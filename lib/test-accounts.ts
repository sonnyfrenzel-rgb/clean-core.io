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
 *
 * The domain is the rule, and the only rule. The list used to carry local-part
 * prefixes as well — `/^security-user-/i`, `/^temp-delete-/i`, `/^perf-user-/i`
 * and the rest — anchored at the start of the whole address and constrained by
 * nothing else. `security-user-alice@example.com` is a perfectly ordinary
 * address for a person to own, and it matched; `scripts/cleanup-test-accounts.ts`
 * treats every match as a deletion candidate and `--apply` hands the uid to
 * `deleteUserDataAndAccount`, which removes the profile, the projects, the runs,
 * the stored secrets and the Firebase Auth account. A naming convention is not
 * evidence about who owns an address; a domain the CI owns is. Every suite
 * registers on one of the two below — `tests/full-pipeline.spec.ts:26`,
 * `tests/security-compliance.spec.ts:31`, `tests/starter-examples.spec.ts:18`,
 * `tests/unsubscribe.spec.ts:16`, `tests/admin-usage-panel.spec.ts:74` — so
 * nothing is lost by requiring it.
 */

/** Domains the CI owns outright. No person receives mail at either of them. */
const TEST_DOMAINS: readonly string[] = ['cleancore-test.io', 'usage-e2e.io'];

/** True for an address created by the test suite rather than a person. */
export function isTestAccount(email: string | null | undefined): boolean {
  const value = (email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return false;
  return TEST_DOMAINS.includes(value.slice(at + 1));
}
