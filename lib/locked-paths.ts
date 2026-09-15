/**
 * Paths the product keeps closed on purpose — with the boundary, the reason and
 * what it takes to reopen them. The one place the testing page, the test hook,
 * the chatbot and the run-tests route read, and the section of SECURITY.md that
 * `tests/locked-paths-guard.spec.ts` holds against it.
 *
 * Pure, no imports: client components read it.
 *
 * Roadmap step 0.1 (`G0:R0`, decided 12.09.2026 in docs/roadmap/SCHNITT-0-UMFANG.md
 * §1, "Weg 2"): a known blocker is either fixed or locked with its reason named.
 * Leaving it unnamed is not an option — and a lock that the interface still
 * offers as a feature is unnamed in the only place users look.
 */

export interface LockedPath {
  /** Gate id from the roadmap. */
  id: string;
  locked: boolean;
  /** Since when, ISO date. */
  since: string;
  /** What is closed — and, as precisely, what stays open. */
  boundary: { closed: string; open: string };
  reason: string;
  /** All of these, not any of them. */
  reopenWhen: string[];
  /** The sentence users see wherever the path would otherwise be offered. */
  userNotice: string;
}

export const LIVE_TEST_EXECUTION: LockedPath = {
  id: 'G0:R0',
  locked: true,
  since: '2026-09-15',
  boundary: {
    closed:
      'Executing generated tests against a connected S/4HANA tenant: POST /api/run-tests with s4Environment "live", which would put decrypted tenant credentials into the test child process.',
    open:
      'Running generated tests in the isolated sandbox against mocks; checking a tenant connection, reading its OData metadata and one read-only OData call (/api/test-s4-connection, /api/fetch-s4-metadata, /api/test-s4-odata-read) — none of these executes generated code.',
  },
  reason:
    'Generated test code is untrusted and runs as a child process inside the API service. The guards around it (Node permission model, a preloaded network guard, an egress probe) are defense in depth, not an isolation boundary, and the service itself has open network egress. With tenant credentials inside that process, a generated test could send them anywhere the guard misses (review finding CR-15, story E08-F01-US01).',
  reopenWhen: [
    'The test runner runs as its own short-lived service, separate from the API service, with a service account that holds nothing but what one run needs.',
    'Its network egress is deny-by-default at the infrastructure level, with the tenant host as the only destination — and a CI check proves it on every deploy, not a probe of two addresses.',
    'An external review of that runner is done and its findings are closed.',
    'Sonny decides to reopen, and this entry, SECURITY.md §7.1 and the guard spec change in the same release.',
  ],
  userNotice:
    'Running generated tests against a connected tenant is locked until the test runner has its own isolated service. The tenant connection check, the metadata read and the read-only OData call still work; tests run in the sandbox against mocks.',
};
