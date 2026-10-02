# GLM full-codebase review — Security, auth and the trust chain

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `security`
**Bundle:** 52 files, 349 KB.
**Usage:** 88034 prompt / 5972 completion tokens, 136s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

### 1. MFA session cookie is corrupted by its own base64 padding — MFA-gated routes fail intermittently
- **Severity:** High
- **File:** `lib/firebase-admin.ts` — `assertMfaSatisfied` and `assertMfaStepUp` (cookie parsing: `const [name, val] = c.trim().split('=')`)
- **Failure:** The `mfa_session` cookie value is `encrypt(...)` output — base64, which ends in `=` padding ~75 % of the time. The parser splits on `=` and keeps only the second segment, so `abc==` becomes `abc`. `decrypt()` then throws and every MFA-enabled user is told "Invalid or expired MFA session" *at random*, right after a successful TOTP verification. Reachable via any gated route (`/api/runs/create`, `/api/audit-pack/create`, `/api/gemini`, admin step-up, account deletion).
- **Fix:** Parse with `part.trim()` and `slice(part.indexOf('=') + 1)` (or split with a limit of 2 and rejoin), as `app/api/auth/jira/callback/route.ts` already does correctly.

### 2. Client-supplied "gaps" are baked into the HMAC-signed run, contradicting the server-authoritative provenance claim
- **Severity:** High
- **File:** `app/api/runs/create/route.ts` — `gapsList` → `initialWorklist` → `unsignedRunPayload.worklist`
- **Failure:** The route deliberately keeps the AI narrative out of the signed payload ("arbitrary client free-text out of the cryptographic evidence guarantee"), but `analysisObj.gaps` — arbitrary JSON relayed by the client and fully modifiable before the POST — is mapped into `initialWorklist`, which **is** part of `runHash` and the signature. A user can craft gap titles/severities/effort that then appear inside the immutable, signed run and in the audit pack's ADR ("Transformed / fully mapped" lists), where `generateProvenanceManifest` labels the worklist as `server-computed`. That is a provably false provenance statement in front of an auditor.
- **Fix:** Either exclude gap-derived worklist items from the signed payload (store them alongside `analysis`, outside the hash), or recompute them server-side from the evidence report only, and correct the provenance manifest's classification.

### 3. Publicly-known fallback signing key mints verifiable signatures on any non-production deployment
- **Severity:** High
- **Files:** `app/api/runs/create/route.ts`, `app/api/audit-pack/create/route.ts`, `app/api/export/verify/route.ts` (`dev_audit_signing_key_fallback_clean_core`)
- **Failure:** The production check is `NODE_ENV === 'production' && !emulator`. Any staging/preview deployment (Cloud Run preview, Vercel preview, a misconfigured prod env where `NODE_ENV` isn't `production`) signs runs and audit packs with a constant committed to the repository. Anyone can then forge a manifest whose signature `/api/export/verify` reports as `valid: true` — a fabricated audit pack that passes the platform's own verification.
- **Fix:** Fail closed whenever `AUDIT_SIGNING_KEY` is absent, regardless of `NODE_ENV`; permit the fallback only when `NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'`.

### 4. `fetch-odata-metadata` Mode 1 allows arbitrary paths on the tenant host when using stored vault credentials
- **Severity:** Medium
- **File:** `app/api/fetch-odata-metadata/route.ts` — MODE 1 `urlCandidates` (`${resolvedUrl}/${cleanPath}/$metadata`)
- **Failure:** `servicePath` is only checked against `/^[A-Za-z0-9_./-]{1,120}$/` (no `..`, `?`, `#`) — it is **not** constrained to `/sap/opu/odata/...` the way `isSafeODataServicePath` does in `fetch-s4-metadata` and `test-s4-odata-read`. With `useStoredCredentials: true`, a user with S/4 access can send `servicePath: "sap/public/icf/logoff"` or any other path and have the server GET it with the **decrypted vault credentials** attached — reading arbitrary endpoints the credentials can reach, outside the OData contract the vault exists for.
- **Fix:** Route Mode 1 through `isSafeODataServicePath` (or an equivalent prefix check) before building candidate URLs.

### 5. `safeFetch` forwards the Authorization header across redirects, leaking vault credentials to a redirect target
- **Severity:** Medium
- **File:** `lib/url-validation.ts` — `safeFetch` redirect loop
- **Failure:** Redirects are followed manually with the original `init` unchanged, so `Authorization: Basic <vault password>` (or the Bearer token just minted from the vault's OAuth client secret) is re-sent to whatever host the first response redirects to. A tenant URL under the attacker's control (or a compromised/misconfigured allowed host) can 302 to any other allowlisted host and harvest the stored credentials. Reachable via `/api/test-s4-connection`, `/api/fetch-s4-metadata`, etc. with `useStoredCredentials`.
- **Fix:** On a cross-origin redirect hop, strip `Authorization` (and `APIKey`) headers before the next request.

### 6. `getClientIp` trusts the first `X-Forwarded-For` entry — rate limits keyed on IP are bypassable
- **Severity:** Medium
- **File:** `lib/rate-limit.ts` — `getClientIp`
- **Failure:** A client can send its own `X-Forwarded-For: 1.2.3.4`; proxies append the real IP, and this function takes the **first** entry — the attacker-chosen one. Every per-IP limit is then defeated by rotating a header value. Most damaging on the **unauthenticated** `/api/export/verify` (30/min): an attacker gets an unlimited signature-verification oracle, and more practically can hammer it to exhaust Firestore transactions. Also weakens the per-IP component of `gemini`, `mfa-verify`, etc.
- **Fix:** Take the last untrusted hop (rightmost entry added by your own load balancer) or use the platform-provided client-IP header only.

### 7. OAuth token-exchange failures are silently treated as "no auth" and can produce a false success
- **Severity:** Medium
- **File:** `app/api/test-s4-odata-read/route.ts` — `buildAuthHeaders` (also `app/api/fetch-odata-metadata/route.ts`, BTP branch)
- **Failure:** The token response is parsed with `tokenResp.json()` without checking `tokenResp.ok`. When the token endpoint returns HTTP 400/401 (bad client secret), `tokenData.access_token` is undefined, no `Authorization` header is set, and the subsequent OData GET proceeds **unauthenticated**. If the service happens to be publicly readable (or returns 200 for another reason), the route answers `status: 'success', recordCount: N` — a false success state for a connection whose credentials never worked.
- **Fix:** Check `tokenResp.ok` and throw on failure (as `fetchOAuth2Token` in the sibling routes correctly does).

### 8. Account is activated without Terms consent ever being recorded
- **Severity:** Medium
- **File:** `app/api/account/register/route.ts` (with `assertAccountActive` in `lib/firebase-admin.ts`)
- **Failure:** `activateAccount()` runs regardless of `acceptedTerms`/`acceptedPrivacy`; consent is only recorded when both are true *and* no version is on file. `assertAccountActive({ requireCurrentTerms })` only blocks when a **previously accepted** version is stale — a missing acceptance is grandfathered. So a client that calls `/api/account/register` with `acceptedTerms: false` gets a fully `approved` account with full API access and no `consent_events` row at all — the "provable consent" mechanism (V14/F-16) is optional in practice.
- **Fix:** Refuse activation (or gate `requireApproved` routes) until a consent event exists for the current version for accounts created after the consent system shipped.

### 9. Quota refunded after the run document was already written — user is charged twice for one analysis
- **Severity:** Low
- **File:** `app/api/runs/create/route.ts` — catch block / `refundRunQuota`
- **Failure:** If `newRunDoc.set()` succeeds but the subsequent project `set()`/`update()` throws, the catch refunds the unit and returns 500 — yet a signed, immutable run now exists (orphaned, `activeRunId` unset). The retry is treated as a fresh analysis (`chargedInputs` was deleted by the refund) and charges again: one successful run, two units.
- **Fix:** Only refund when the run document write itself failed; if the run was persisted, keep the charge (or set `activeRunId` best-effort before refunding).

### 10. `test-s4-connection` reports `status: 'connected'` on HTTP 401/403
- **Severity:** Low
- **File:** `app/api/test-s4-connection/route.ts` — `evaluateHttpStatus`
- **Failure:** A tenant that rejects the credentials outright yields `{ status: 'connected', httpStatus: 401 }`. The human-readable message is honest ("credentials were rejected"), but any UI branching on `status === 'connected'` shows a green "connected" state for credentials that provably do not work — a false success state in the connection wizard.
- **Fix:** Return a distinct status (e.g. `'reachable'`) for 401/403 so "connected" means authenticated reachability.

---

**Not reported (checked and judged fine):** the Jira callback's honest `JIRA_AUTH_INCOMPLETE` postMessage; `resolveS4Connection`'s all-or-nothing vault semantics; the approval/unsubscribe token construction (domain-separated, fail-closed); `recursiveDelete` on project/account deletion; the Firestore rules allowlists (client cannot reach `isAdmin`, quota fields, secrets, or consent); the run-tests sandbox (permission model + netguard + ownership check); `escapeHtml`/`csvCell` in the audit pack generators. One thing I could not fully verify from these files: whether `NextResponse.cookies.set` percent-encodes the `mfa_session` value in a way that would mask finding 1 — the parsing bug is real either way for any value containing `=`, but if you observe MFA working consistently in production, check what the cookie actually looks like on the wire before prioritizing.