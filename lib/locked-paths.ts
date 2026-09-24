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

/**
 * Roadmap 8.9 (Sonny, 24.09.2026: "der Live-Pfad kommt vor 3.0 zurück") built the
 * path behind this lock: the isolated live runner, which never holds a tenant
 * credential, and the app's credential proxy, which adds the credentials per
 * request for one run and one host. The old switch — `S4_TEST_RUNNER_EGRESS_ENFORCED`
 * plus an egress probe, putting decrypted credentials into a child process of
 * the API service — is gone. The lock itself stays until its conditions hold,
 * and even with `locked: false` the route refuses a live run unless the live
 * runner and the proxy are configured (`resolveRunnerTarget`,
 * `lib/test-runner-client.ts`).
 */
export const LIVE_TEST_EXECUTION: LockedPath = {
  id: 'G0:R0',
  locked: true,
  since: '2026-09-15',
  boundary: {
    closed:
      'Executing generated tests against a connected S/4HANA tenant: POST /api/run-tests with s4Environment "live", which would let generated code send requests to the tenant through the application credential proxy.',
    open:
      'Running generated tests against mocks in the isolated test runner (its own Cloud Run service; a deployed app without it runs no tests); checking a tenant connection, reading its OData metadata and one read-only OData call (/api/test-s4-connection, /api/fetch-s4-metadata, /api/test-s4-odata-read) — none of these executes generated code.',
  },
  reason:
    'Generated test code is untrusted. Since roadmap 8.9 it runs in a separate runner service without roles, secrets or open network egress, and a live run reaches the tenant only through a proxy that holds the credentials itself; the guards inside the runner process (Node permission model, preloaded module and network guards) remain defense in depth, not an isolation boundary. What is not done yet is the proof on the deployed profile and an external review of the runner (review findings CR-09, CR-15).',
  reopenWhen: [
    'The isolated live runner and the credential proxy are deployed and configured (RUNNER_LIVE_URL, RUNNER_SERVICE_ACCOUNT, S4_PROXY_BASE_URL); without them the route refuses a live run even with this lock lifted.',
    'The authorized negative test (tests/runner-isolation.spec.ts) has been run against the deployed runners, with both runners configured, and every probe held: no secret-named variable, no file outside the sandbox directory, none of the fixed destinations it probes reachable (SECURITY.md §7.2) — and gcloud shows that the runner service account holds no role, since the metadata server stays reachable by design.',
    'An external review of that runner is done and its findings are closed.',
    'Sonny decides to reopen, and this entry, SECURITY.md §7.1 and the guard spec change in the same release.',
  ],
  userNotice:
    'Running generated tests against a connected tenant is locked until the isolated live runner has passed its external review. The tenant connection check, the metadata read and the read-only OData call still work; tests run against mocks in the isolated test runner.',
};
