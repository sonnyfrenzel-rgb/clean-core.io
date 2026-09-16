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
}

export const GATED_ROUTES: GatedRoute[] = [
  { file: 'app/api/runs/create/route.ts', method: 'POST', path: () => '/api/runs/create', body: { projectId: 'nowhere', legacyCode: 'REPORT z.', s4Deployment: 'public', analysis: '{}' } },
  { file: 'app/api/audit-pack/create/route.ts', method: 'POST', path: () => '/api/audit-pack/create', body: { projectId: 'nowhere' } },
  { file: 'app/api/projects/[projectId]/route.ts', method: 'DELETE', path: (p) => `/api/projects/${p}` },
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
];

/** The files the wiring check must find a gate call in — one entry per file. */
export const GATED_FILES = [...new Set(GATED_ROUTES.map((r) => r.file))];
