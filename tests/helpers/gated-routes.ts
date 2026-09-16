/**
 * The routes that mint, mutate or destroy evidence, and how to knock on each.
 *
 * One list, read by both halves of the MFA coverage: the wiring check that
 * every one of these files calls the gate (`tests/mfa-coverage-guard.spec.ts`)
 * and the runtime check that every one of them actually refuses a token
 * without the second factor (`tests/mfa-trust-chain-gate.spec.ts`). They used
 * to keep separate lists, so a route could be added to the grep and never
 * knocked on (QA review of 10b1c3939600, 2f384e262d78).
 *
 * `path` is a function because some of these need a project of the caller's
 * own. `body` is the smallest payload that gets past request parsing — the
 * gate is meant to answer before anything looks at it.
 */
export interface GatedRoute {
  /** Source file, as the wiring check reads it. */
  file: string;
  /** HTTP method the gate sits on. */
  method: 'POST' | 'DELETE' | 'GET';
  /** Request path; `projectId` is one the calling account owns. */
  path: (projectId: string) => string;
  body?: Record<string, unknown>;
  /**
   * What a first-factor token must get. 403 everywhere except where the route
   * refuses even earlier for a reason of its own — a feature flag that turns
   * the whole integration off answers 404 before it looks at anyone.
   */
  expectedStatus?: number[];
}

export const GATED_ROUTES: GatedRoute[] = [
  { file: 'app/api/runs/create/route.ts', method: 'POST', path: () => '/api/runs/create', body: { projectId: 'nowhere', legacyCode: 'REPORT z.', s4Deployment: 'public', analysis: '{}' } },
  { file: 'app/api/audit-pack/create/route.ts', method: 'POST', path: () => '/api/audit-pack/create', body: { projectId: 'nowhere' } },
  { file: 'app/api/projects/[projectId]/route.ts', method: 'DELETE', path: (p) => `/api/projects/${p}` },
  // Roadmap 0.7: the only writer of the five release fields and the usage
  // import. The sign-off it records is carried by the audit pack's decision
  // record, so a token obtained before the second factor must not reach it.
  { file: 'app/api/projects/[projectId]/commands/route.ts', method: 'POST', path: (p) => `/api/projects/${p}/commands`, body: { command: 'revoke-architecture' } },
  { file: 'app/api/gemini/route.ts', method: 'POST', path: () => '/api/gemini', body: { prompt: 'hello' } },
  { file: 'app/api/run-tests/route.ts', method: 'POST', path: () => '/api/run-tests', body: { projectId: 'nowhere', testCases: [] } },
  { file: 'app/api/s4-credentials/route.ts', method: 'POST', path: () => '/api/s4-credentials', body: { url: 'https://example.invalid', username: 'u', password: 'p', authType: 'basic' } },
  { file: 'app/api/s4-credentials/route.ts', method: 'DELETE', path: () => '/api/s4-credentials' },
  { file: 'app/api/secrets/gemini/route.ts', method: 'POST', path: () => '/api/secrets/gemini', body: { apiKey: 'not-a-real-key' } },
  { file: 'app/api/secrets/gemini/route.ts', method: 'DELETE', path: () => '/api/secrets/gemini' },
  { file: 'app/api/test-s4-connection/route.ts', method: 'POST', path: () => '/api/test-s4-connection', body: { useStoredCredentials: true } },
  { file: 'app/api/fetch-s4-metadata/route.ts', method: 'POST', path: () => '/api/fetch-s4-metadata', body: { useStoredCredentials: true } },
  { file: 'app/api/fetch-odata-metadata/route.ts', method: 'POST', path: () => '/api/fetch-odata-metadata', body: { useStoredCredentials: true } },
  { file: 'app/api/test-s4-odata-read/route.ts', method: 'POST', path: () => '/api/test-s4-odata-read', body: { useStoredCredentials: true, entitySet: 'A_SalesOrder' } },
  // Found by the completeness check, not by anyone remembering them
  // (QA review of 84f183b16761, 2f384e262d78): three routes that gate on the
  // factor and were in none of these lists. Deleting the account is the one
  // that matters most — a refusal there has to hold or the spec's own account
  // disappears, which is exactly the failure it would report.
  { file: 'app/api/account/delete/route.ts', method: 'POST', path: () => '/api/account/delete', body: { confirm: 'DELETE' } },
  // JIRA_INTEGRATION_ENABLED is off, so this answers 404 before the gate. The
  // day it is switched on, 403 is what it must answer, and both are accepted
  // here so that neither state is a surprise.
  { file: 'app/api/auth/jira/url/route.ts', method: 'GET', path: () => '/api/auth/jira/url', expectedStatus: [404, 403] },
  { file: 'app/api/secrets/gemini/test/route.ts', method: 'POST', path: () => '/api/secrets/gemini/test', body: { apiKey: 'not-a-real-key' } },
  // Roadmap 1.2 — the per-stage model switch. Reading it says whether a key
  // exists for this account; writing it decides what the account's own key and
  // quota may be spent on. Both sit behind the factor.
  { file: 'app/api/model-stages/route.ts', method: 'GET', path: () => '/api/model-stages' },
  { file: 'app/api/model-stages/route.ts', method: 'POST', path: () => '/api/model-stages', body: { stages: { design: false } } },
];

/**
 * Routes that must NOT require the factor. Recording an enrolment cannot depend
 * on it — the session that enrols predates it — and public verification has no
 * session at all.
 */
export const MUST_NOT_GATE = [
  'app/api/mfa/enrolled/route.ts',
  'app/api/export/verify/route.ts',
];

/** Removing the factor needs the stronger step-up: a recent sign-in that carried it. */
export const MUST_STEP_UP = ['app/api/mfa/disable/route.ts'];

/**
 * Where a step-up route's two-system writes live, when they are not in the
 * route file itself.
 *
 * `/api/mfa/disable` touches Firebase Auth and Firestore in a fixed order, and
 * that order was only ever asserted as text because the failing branch cannot
 * be reached through the route: the Auth emulator enrols no TOTP factor. The
 * writes therefore sit in `lib/mfa-disable.ts` behind a dependency parameter,
 * where `tests/mfa-disable-order.spec.ts` runs both failure paths (roadmap
 * 0.17, QA review 6a1e32c0b973). The gate stays in the route.
 *
 * Named here rather than hard-coded in the guard so that the two halves keep
 * reading the same catalog: a route that moved its writes somewhere else and
 * did not say so here would be checked in neither file.
 */
export const STEP_UP_IMPLEMENTATION: Record<string, { module: string; importedAs: string }[]> = {
  'app/api/mfa/disable/route.ts': [{ module: 'lib/mfa-disable.ts', importedAs: '@/lib/mfa-disable' }],
};

/** The files the wiring check must find a gate call in — one entry per file. */
export const GATED_FILES = [...new Set(GATED_ROUTES.map((r) => r.file))];
