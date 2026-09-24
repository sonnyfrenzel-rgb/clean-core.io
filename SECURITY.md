# Security Architecture — Clean-Core.io Platform

> **Version:** 4.1 · **Date:** 2026-09-15 · **Classification:** Internal

> **v4.1 changes:** live test execution against a connected tenant is a documented, locked path (§7.1, roadmap gate `G0:R0`): boundary, reason and the conditions for reopening, read from the same definition the route and the interface use.

> **v4.0 changes:** documented the Evidence Trust Chain (run immutability, `runHash` + HMAC signature, audit-pack cryptography — §14) and operational readiness (§15: health probe, complete GDPR Art. 17 cascade, data-retention & incident-response policies, supply-chain CI gates). Corrected the admin-gating description (§3.2) to match the custom-claim implementation.

---

## 1. Executive Summary

This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform following a comprehensive security audit (Code Review 2026-06). Most critical and high-severity findings (P0/P1) have been remediated; the ones that remain **mitigated rather than closed** are called out below and in the code. Since roadmap 8.9 generated tests no longer execute inside the API service: they run in an **isolated runner service** (own Cloud Run service, service account without roles, no secrets, internal ingress, egress through a VPC without NAT — §7), and a deployed app without that runner runs no tests at all. The Node-level guards inside the runner remain defense in depth, not a boundary of their own (see F-02), and the audit-pack signature still covers some client-editable fields. **Live test execution against a connected S/4HANA tenant is locked** (§7.1, gate `G0:R0`): the route refuses it before any measurement, and the interface says so wherever the path would otherwise be offered. It reopens only under the conditions listed there — a measurement passing is not one of them.

---

## 2. Findings & Remediation Status

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|-------------|
| F-01 | Live API keys in repository | **P0** | ✅ Resolved | Keys rotated; `.env.example` contains only placeholders. `.gitignore` enforces exclusion of `.env*` files. |
| F-02 | Remote Code Execution via `/api/run-tests` | **P0** | ⚠️ Mitigated (not closed) | Since roadmap 8.9 generated code executes only in the **isolated runner service** (`runner/`, §7): its own Cloud Run service with a service account without roles, no app secrets, `--ingress=internal`, invocable only by the app (`run.invoker`), and all egress through a VPC without NAT. A deployed app without `RUNNER_URL` refuses to run tests; the in-app child process exists only in an emulator build (local, CI) and is named `local-emulator` in the response and the receipt. Inside the runner the old layers stay as defense in depth: esbuild bundling with a single resolver, Node Permission Model, `--no-experimental-sqlite`, the module guard and the network guard (`__netguard.mjs`). What is not closed: the proof on the deployed profile (§7.2, authorized negative test) and an external review. Live test execution against a tenant is **locked** (§7.1, `G0:R0`); the old switch `S4_TEST_RUNNER_EGRESS_ENFORCED` and its egress probe are removed. |
| F-03 | SAP credentials stored in cleartext | **P0** | ✅ Resolved | AES-256-GCM encryption via `S4_ENCRYPTION_KEY`. Credentials in server-only `s4_credentials` collection. |
| F-04 | Missing admin check on email routes | **P1** | ✅ Resolved | `verifyAdminRequest()` + email format validation on all 3 mail routes. |
| F-05 | SSRF filter bypass | **P1** | ✅ Resolved | Async DNS resolution, full IPv4/v6 CIDR blocking, `safeFetch()` with IP pinning and redirect re-validation. |
| F-06 | Client-side quota enforcement | **P1** | ✅ Resolved | Atomic Firestore transaction via `reserveTransformationQuota()` server-side. |
| F-07 | Live tenant (BYOT) endpoints unsecured | **P1** | ✅ Resolved | Gated S/4HANA credentials, test connection, and metadata API endpoints behind `assertS4TenantAccess()` role check. Since 18.09.2026 the same gate also requires an **enrolled** second factor (`s4AccessRequiresEnrolment`, `lib/mfa-gate.ts`) and every S/4 route requires the factor on the token (`assertMfaSatisfied`); the admin claim exempts from the approval, not from the factor. Held by `tests/s4-mfa-enrolment-guard.spec.ts`. |
| F-08 | Client-side GDPR account erasure orchestration | **P1** | ✅ Resolved | Replaced client-side delete routines with transaction-backed server-side deletion route `/api/account/delete`. |
| F-09 | Decorative-only email approval HMAC checks | **P1** | ✅ Resolved | Transitioned email activation/approval hooks to server-side cryptographic HMAC token re-validation routes. |
| F-10 | Vulnerability to HTML Injection in transactional emails | **P2** | ✅ Resolved | Added HTML escaping for all interpolated user fields inside the transactional email templates. |
| A-01 | Orphaned Firebase Auth user after pilot registration reject | **P2** | ✅ Resolved (since obsolete) | `approveUserWithToken` deleted the Firebase Auth user on reject. The whole pilot approval path was removed in v2.4.2 — accounts activate on registration — so there is no reject branch left to orphan anything. |
| F-15 | `/api/test/seed` admin escalation behind single env gate | **P2** | ✅ Resolved | Defense-in-depth: 3 independent gates (NODE_ENV, emulator flag, secret header). Returns 404 in production. CI assertion prevents accidental deployment with emulator flag. |
| F-05n | Email registration missing Bearer token on `/api/request-pilot` | **P2** | ✅ Resolved | Registration is authenticated end to end. `/api/request-pilot` was replaced by `/api/account/register` in v2.4.2, which rejects an unverified caller with 401 and derives both the UID and the mail recipient from the token. |
| F-08n | `mfa_pending` collection lacks explicit Firestore deny rule | **P3** | ✅ Resolved | Added explicit `allow read, write: if false` rule for audit clarity (previously covered by default-deny). |
| F-03n | Mermaid label sanitizer insufficient against XSS | **P2** | ✅ Resolved | Hardened `sanitize()` to strip HTML tags, JS protocol, event handlers, Mermaid control tokens, and arrow syntax. |

---

## 3. Authentication & Authorization Model

### 3.1 Firebase Auth
- All API routes require a valid Firebase ID Token via `Authorization: Bearer <token>`.
- Token verification uses Firebase Admin SDK (`verifyRequestAuth()`).

### 3.2 Admin Gating (F-04)
- Admin routes use `verifyAdminRequest()` which checks:
  1. Valid Firebase ID token, and
  2. The `admin` **custom claim** (`decoded.admin === true`) — the sole authority in production.
  - Emulator/CI only: a Firestore `users/{uid}.isAdmin` fallback is allowed (never in production).
  - Firestore rules mirror this: `isAdmin()` reads `request.auth.token.admin` (custom claim) only.
  - Privileged admin actions additionally require recent auth + MFA step-up (`assertAdminStepUp`).
- Protected admin routes: `/api/admin/console-action`, `/api/send-approval-email`, `/api/send-tenant-approval-email`, `/api/send-tenant-revoke-email`
- Non-admin tokens receive **403** (not 401) — fail-closed.
- Recipient email addresses are format-validated (defense-in-depth).

### 3.3 Firestore Security Rules
- All collections enforce `isAuthenticated()` for reads.
- **Hardened Onboarding (F-06 Härtung)**: Direct creation of profiles in `/users/{userId}` is permitted but strictly gated:
  - Non-admin users are restricted to a strict keys allowlist (`userClientCreateKeys()`) and safe default values (`tier == 'pilot'`, `status == 'pending'`, `isAdmin == false`, `transformationsUsed == 0`, `transformationsLimit == 5`, `maxTeamMembers == 1`, `s4TenantAccessAllowed == false`, `mfaEnabled == false`).
  - **V14 (v2.4.2)**: `termsVersionAccepted` and `termsAcceptedAt` were removed from that allowlist. A client could previously assert its own Terms acceptance, timestamp included, with no `consent_events` row behind it. Consent is now written exclusively by the Admin SDK through `lib/consent.ts` (`POST /api/consent`, `POST /api/account/register`).
  - `status` stays server-authoritative even though signup no longer needs an approval: the create rule pins it to `pending`, and only `activateAccount()` — reached through `POST /api/account/register` — moves it to `approved`, once per account and never from `suspended`.
  - Creation requires `orgId == null` to prevent unauthorized tenant assignments.
- **Field-Level Protection**: Client-side updates to user profiles are restricted to an allowlist of uncritical fields (`userClientUpdateKeys()`: firstName, lastName, theme, defaultView, etc.). Modifying status, tier, transformationsLimit, s4 access, or mfaEnabled directly from the client is blocked.
- **Project Isolation**: Direct creation and updates of `/projects/{projectId}` are restricted to `projectAllowedKeys()`. The `orgId` on projects is validated to match the user's profile `orgId`, preventing cross-tenant project modifications.
- **No Existential Leakage**: Read rules across collections do not permit `resource == null` checks, preventing unauthenticated clients from probing for document existence.
- **Server-Only Credentials**:
  - `s4_credentials/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.
  - `mfa_secrets/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.

### 3.4 Onboarding Link Cryptography (F-09)
- Applies to **live-tenant (BYOT) access only**. The pilot equivalent — two one-click links in the administrator's signup mail — was removed in v2.4.2 along with the approval gate itself: an emailed link that changes account state is not worth keeping for a decision nobody makes any more. Account state is changed in the admin console, behind a login and `assertAdminStepUp`.
- Action-bound approval/rejection links (sent via Resend) are protected by a cryptographically signed HMAC token.
- Tokens are bound to the specific `uid`, `requestType` (`tenant`), and `action` (e.g. approve, reject), and carry a 7-day expiration time (`exp`).
- Signature verification uses Node's `crypto.createHmac('sha256')` with `timingSafeEqual` comparison to eliminate timing side-channel attacks.
- Fail-closed behavior is enforced: if `PILOT_APPROVAL_SECRET` is missing or less than 16 characters, token creation/verification fails immediately.
 
### 3.5 Two-Factor Authentication (MFA) — Firebase's factor, proven by the token
- **Architecture** (roadmap 0.13, 16.09.2026): the second factor is Firebase Authentication's own TOTP multi-factor (Identity Platform). The browser enrols it with the Firebase SDK against Firebase Auth directly — no secret, code or backup code ever reaches this server. Firebase issues **no ID token before the factor is resolved**, and the token it then issues names the factor (`firebase.sign_in_second_factor`).
- **The gate is a token field, not a cookie.** `assertMfaSatisfied` (every route that mints, mutates or destroys evidence) rejects a token from an `mfaEnabled` account unless the token carries the factor; `assertMfaStepUp` / `assertAdminStepUp` (GDPR deletion, disabling MFA, admin console actions) additionally require the sign-in that produced the token to be at most five minutes old — re-authenticating an enrolled account runs the factor again, so both facts arrive on one token. The decision is `lib/mfa-gate.ts`, tested without the Admin SDK (`tests/mfa-native-gate.spec.ts`).
- **What the server keeps:** `users/{uid}.mfaEnabled` and `mfaFactor`, written by two routes and by nothing else — `POST /api/mfa/enrolled` sets them after reading back from Firebase Auth that the factor exists, `POST /api/mfa/disable` clears them when it has removed the factor (or when there is none left to remove). A client writes neither: the update allowlist in `firestore.rules` excludes both fields. `POST /api/mfa/disable` removes the factor in Firebase Auth through the Admin SDK — only from a session that carries it. Two systems and no transaction, so the order is chosen so that every state a failure leaves behind is over-strict, never under-strict: the factor is removed first (a failure changes nothing), the flag second (a failure leaves a flag without a factor, which every gate refuses). That state is recovered by the same route without a step-up, because there is nothing left that a first-factor token could remove, only a flag refusing its own owner; the retired application-level TOTP left the same state behind. No compensating write: a compensation that can itself fail is where a factor with the gate off would come from. If recording an enrolment fails after Firebase enrolled the factor, the Settings page records it again on its next visit — the route is idempotent and reads the factor back from Firebase Auth.
- **S/4HANA access requires the factor to be enrolled** (decision 18.09.2026). `assertMfaSatisfied` is conditional by design — an account that never enrolled passes it with any token, which is right for optional MFA and was the gap two audits named for the six routes that reach a customer's tenant with stored credentials. `assertS4TenantAccess`, the gate every one of those routes calls, therefore also asks `s4AccessRequiresEnrolment` (`lib/mfa-gate.ts`) and refuses an un-enrolled account with a message that names the way out; the admin claim exempts from the approval, not from the factor. The only skip is the Firebase emulator, which cannot enrol TOTP — the decision is a pure function tested without it, and `tests/s4-mfa-enrolment-guard.spec.ts` pins the wiring on every S/4 route. The own-key routes (`/api/secrets/gemini`, `/api/secrets/gemini/test` — store, remove, test) require enrolment the same way, through `assertMfaSatisfied(…, { requireEnrolment: byokRequiresEnrolment })`, because a stolen first-factor token could otherwise replace the key; measured before shipping, no production account held one. Run minting, audit-pack signing and the Jira start keep optional MFA on purpose — requiring the factor on `runs/create` would stop every un-enrolled account from analysing. The welcome mail recommends enrolment to every account and names the two places it is required.
- **No backup codes.** Firebase's factor has none. A lost authenticator is handled out of band: the person writes from their account address, an administrator confirms with them and runs `scripts/mfa-reset.ts <email> --apply`, which unenrols the factor; the account signs in with its first factor alone and enrols again in Settings.
- **E-mail verification is a prerequisite** Firebase enforces (`auth/unverified-email`): Google accounts arrive verified; a password account verifies once from Settings before enrolling.
- **Retired:** the application-level TOTP (`/api/mfa/setup/*`, `/api/mfa/verify`), the `mfa_session` cookie, the encrypted `mfa_secrets/{uid}` and `mfa_pending/{uid}` documents and the peppered backup codes. The two collections are emptied by enrolment, disablement, the reset script and account deletion, and are no longer written; their deny-all rules stay.
- **Why:** the application-level prompt was a React state change after the password had already produced a valid Firebase session, and Firestore's rules never saw the session cookie — a stolen ID token from an MFA account read every document its owner could (QA full review of 33471220d6e9, cfafefac08ec). Firebase's factor closes that at the source: there is no session to steal until the code is entered.
- **Not covered by CI:** the Auth emulator (firebase-tools 15.30.1) cannot enrol a TOTP factor. The gate decision and the negative route paths are tested; enrolment and factor sign-in are verified on the `dev` deployment against the real Auth project and by the administrator's own account.

### 3.6 Admin Governance & Logging
- **Console API Routes**: All administrative tasks (user approval/revocation, S/4 HANA access grant/revocation, profile deletion) are routed through secure, server-side APIs (such as `/api/admin/console-action`), preventing direct client-side writes to Firestore.
- **Audit Logging**: Every administrative action is automatically logged to the `audit_events` collection, capturing the actor's UID/email, action type, target UID, and timestamp.
- **Admin Verification**: Access requires valid admin credentials, recent re-auth (< 5 min), and the second factor on the ID token (`assertAdminStepUp`).

### 3.7 Who May Read a Project (roadmap 5, "Teilen")

A project carries uploaded ABAP, so who may read it is stated here in full. There are **two** read paths from a browser and one deliberate server-side act; there is no third.

- **The owner.** `firestore.rules` grants `resource.data.userId == request.auth.uid`.
- **An invited account that accepted.** The owner invites one e-mail address; the server creates an invitation at `projects/{projectId}/invitations/{invitationId}` and mails a link. Accepting requires a signed-in account whose **own, confirmed** e-mail address equals the invited one — Google sign-in counts as confirmed, a password account is sent a confirmation first. Only then is the accepting uid written into the `readers` array on the project document, and only then does the rule answer. A forwarded link therefore opens nothing: the link names the invitation, the account is what is checked.
- **The administrator has no read.** It was removed on 16.09.2026 and did not come back with sharing. An emergency — a credible report of malicious code in an upload — is handled server-side through the Admin SDK, which bypasses the rules by design; that is a deliberate act with a record, not a standing permission.

Properties this rests on, each enforced rather than asked for:

- **The grant is one field in one place.** Reading is answered by `readers` on the project document, with no `get()` into another document. A revocation removes the uid from that one array and takes effect on the next read — it does not have to succeed in N documents to be complete. For the same reason `projects/{id}/runs/{runId}` is **not** widened: an invited reader gets a run's contents through `GET /api/projects/{projectId}`, which re-reads `readers` on every request.
- **`readers` is not client-writable.** A browser that could write it could invite itself, which is the whole grant. The field is absent from the project update allowlist, and `tests/invitation-flow.spec.ts` reads the rules file to prove it.
- **The invitation subcollection is server-only, out loud.** `allow read, write: if false` — written down rather than left to default-deny, because an invitation carries the e-mail address of the person it was sent to, and a project's invitation list is therefore a list of other people's addresses. The owner's overview is answered by `GET /api/projects/{projectId}/readers`, which returns the accepted readers and never the pending addresses.
- **Nothing on an invitation comes from the caller.** Both timestamps are the server's clock, `invitedBy` is the verified token, `status` is `pending` because this route is the only thing that creates one, and a requested lifetime outside 1–90 days collapses to the default of 14 rather than being honoured. Documents are written with `create()`, never `set()`, and the id is 24 random bytes.
- **Inviting and revoking sit behind the second factor**, like every other route that touches a project's code, and behind a rate limit. A project may hold at most **three** open invitations at once (`INVITATION_MAX_OPEN`, decided 18.09.2026): the rate limit caps how fast invitations go out and cannot cap how many stand open, and a route that mails an address its caller typed needs both halves.
- **An invitation nobody was told about is not left behind.** If the mail provider refuses, the invitation is withdrawn in the same request and the owner is told nothing went out.
- **Reading is all it grants.** Analysing, confirming, signing and exporting remain with the owner; every one of those routes still answers on `userId`.

**Rules deploy:** this is one of the two steps whose `firestore.rules` change must be deployed **before** the app that relies on it (`npm run deploy:rules`). CI does not deploy rules.

---

## 4. Credential Encryption (F-03)

### Architecture
```
Client (Settings/Testing Page)
  │
  ▼  POST /api/s4-credentials { url, username, password, authType, ... }
  │
Server (API Route)
  │  1. verifyRequestAuth(req)
  │  2. await isUrlSafe(body.url) — async SSRF check with DNS resolution
  │  3. AES-256-GCM encrypt(password + btpDestinationJson)
  │  4. Write to s4_credentials/{uid}  (server-only collection)
  │  5. Write s4Meta to users/{uid}     (non-secret metadata)
  │  6. Delete legacy s4Config field
  ▼
Firestore
  ├── users/{uid}.s4Meta       ← { configured, url, username, authType } — client-readable
  └── s4_credentials/{uid}     ← { secretEnc, url, username, authType } — Admin SDK only
```

### Key Management
- **Key**: 32-byte AES key stored as `S4_ENCRYPTION_KEY` (base64-encoded).
- **Rotation**: Generate new key → re-encrypt all `s4_credentials` docs → swap env var.
- **Storage**: GitHub Secrets → Cloud Run encrypted env vars.
- **Generate**: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### Write-Only Pattern
- Passwords are **never returned to the client** (write-only).
- Settings page shows `•••••• (stored)` placeholder.
- Consumer routes use `useStoredCredentials: true` flag to tell the server to load from encrypted store.

---

## 5. SSRF Protection (F-05)

### Defense Layers

| Layer | Check | Module |
|-------|-------|--------|
| 1 | Protocol: HTTPS only | `isUrlSafe()` |
| 2 | Credentials in URL blocked | `isUrlSafe()` |
| 3 | Internal TLDs blocked (.internal, .local) | `isUrlSafe()` |
| 4 | Production tenant API blocked (`-api.s4hana.ondemand.com`) | `isUrlSafe()` |
| 5 | Host allowlist enforcement (`S4_HOST_ALLOWLIST`) | `isUrlSafe()` |
| 6 | DNS resolution (A/AAAA records) — normalizes encoded IPs | `isUrlSafe()` |
| 7 | Full IPv4 CIDR blocking (RFC 1918, link-local, CGNAT, loopback, multicast, reserved) | `isBlockedV4()` |
| 8 | Full IPv6 blocking (::1, ULA fc00::/7, link-local fe80::/10, IPv4-mapped, NAT64, multicast) | `isBlockedV6()` |
| 9 | IP pinning via undici Agent (anti DNS-rebinding between check and connect) | `safeFetch()` |
| 10 | Manual redirect following with re-validation per hop (max 3 hops) | `safeFetch()` |
| 11 | `tokenUrl` validated before OAuth token exchange | All S4 routes |

### Host Allowlist
- Configured via `S4_HOST_ALLOWLIST` env var (comma-separated suffixes).
- Example: `.s4hana.cloud,.hana.ondemand.com,sandbox.api.sap.com`
- Empty = blocklist-only mode (all public hosts allowed, private IPs still blocked).

### Residual Risk
- `safeFetch` pins the validated IP for each hop, but TLS SNI uses the hostname (correct behavior).
- Network egress filtering on the Cloud Run service is recommended as additional defense (documented Restrisiko).

---

## 6. Quota Enforcement (F-06)

- **Server-side**: `reserveTransformationQuota(uid)` in `lib/firebase-admin.ts` performs an atomic Firestore transaction:
  1. Read `transformationsUsed` and `transformationsLimit`
  2. If `used < limit`: increment atomically and return success
  3. If `used >= limit`: throw `QuotaError(403)`
- **Enterprise/Admin bypass**: Enterprise tier users and hardcoded super-admins have unlimited quota (no metering).
- **Refund**: `refundTransformationQuota(uid)` decrements on AI call failure (best-effort, never goes below 0).
- **Client**: `incrementTransformations()` in `useUserProfile.ts` is a **no-op** — quota is only enforced server-side.
- **Prerequisite**: Cloud Run service account needs `Cloud Datastore User` role for Firestore write access.

---

## 7. Test Runner Sandbox (F-02) — the isolated runner (roadmap 8.9)

### Architecture
```
Client (Testing Page)
  │
  ▼  POST /api/run-tests { projectId, selectedTestIds, s4Environment, draftId? }
  │
App (API route, public service)
  │  1. verifyRequestAuth · assertMfaSatisfied · assertAccountActive · rate limit
  │  2. s4Environment = "live" && LIVE_TEST_EXECUTION.locked → HTTP 403   ← §7.1, before any work
  │  3. owner check; code and suite are the project's (or the caller's repair draft) — never the body
  │  4. resolveRunnerTarget (lib/test-runner-client.ts):
  │       mock: RUNNER_URL → isolated runner · emulator build → local-emulator · else HTTP 503
  │       live: RUNNER_LIVE_URL + RUNNER_SERVICE_ACCOUNT + S4_PROXY_BASE_URL + key → live runner · else 403
  │  5. (live) assertS4TenantAccess → capability {project, account, tenant host, run, ≤10 min},
  │     registered in s4_proxy_capabilities, deleted when the run returns
  │  6. POST <runner>/run with the app's Google ID token (audience = runner URL)
  │  7. check the report: SHA-256 of every file and of the suite = what was sent, mode = asked for
  │  8. verdicts + receipt (runner kind, self-reported K_REVISION, files digest) — mock runs only
  ▼
Runner service (clean-core-runner / clean-core-runner-live, one image)
     SA without roles · no secrets · ingress internal · run.invoker: the app only
     egress: VPC runner-net without NAT (mock: nothing; live: the app via Private Google Access)
     concurrency 1 · fresh temp dir per run, removed afterwards
     child: node --permission --allow-fs-read/write=<run dir> --no-experimental-sqlite
            --import __netguard.mjs --import __modguard.mjs   (defense in depth)
     live only: loopback relay on 127.0.0.1 → the app's /api/s4-proxy/{capability}/…
                (the relay adds the runner's ID token; the child holds no credential)

App credential proxy (GET|HEAD /api/s4-proxy/{capability}/sap/…)
     runner ID token (aud = app, email = RUNNER_SERVICE_ACCOUNT) · capability HMAC + expiry
     · run still active and within 200 requests · tenant access re-checked
     · stored connection still on the capability's host · paths below /sap/ only
     · safeFetch, no redirects, 15 s, 8 MB · credentials added here, scrubbed from the answer
```

### Security Properties
- **The boundary is the service, not the process.** The runner's service account has no roles; the image contains Node, the bundled runner and esbuild — no app code, no `.env`, no secrets (`runner/Dockerfile`, `runner/Dockerfile.dockerignore`). A generated test that got past every Node-level guard would find no credential in its environment or file system and no network path out of the mock runner. The metadata server stays reachable from any Cloud Run instance; the token it hands out belongs to an account that may do nothing.
- **"Dort oder gar nicht".** Without `RUNNER_URL` a deployed app refuses to run tests (HTTP 503). The local path exists only when the build itself was made for the Firebase emulator, and is named `local-emulator` wherever its result appears.
- **What ran is what was sent.** The runner reports the SHA-256 of every file and of the suite plus its `K_REVISION`; the app refuses a report whose hashes do not match what it sent and writes the digest and the revision into the receipt (`lib/test-receipt.ts`, `runner`). The revision is self-reported: the app checks only its shape, because it has no independent source to compare it with.
- **No credential ever reaches a runner.** A live run carries a capability; the credential proxy adds the credentials per request, for one host, one run, ten minutes at most, read-only methods.
- **Node-level layers, kept as defense in depth.** Bundler with one resolver (imports must stay inside the run directory, bare packages become a stub), Permission Model (file system scoped to the run directory; no child processes, workers or addons), `--no-experimental-sqlite`, the module guard (`lib/sandbox-module-guard.ts`) and the network guard (`lib/test-sandbox/net-guard.ts`: closed on mock runs; on live runs exactly one loopback port, DNS closed on both). None of these is claimed as a boundary.
- **No shell execution, minimal environment, output cap, 15 s timeout, 256 MB child heap.**

### Requirements
- Node.js >= 22.8 in the runner image (`node:22-slim`); the runner refuses to execute without the Permission Model.
- `esbuild` in the runner image (`runner/package.json`, pinned to the app's version).

### 7.1 Locked path: live test execution (`G0:R0`)

Decided 12.09.2026 (roadmap step 0.1, `docs/roadmap/SCHNITT-0-UMFANG.md` §1, "Weg 2"): a known blocker is
either fixed or locked with its reason named. This one is locked. The definition lives in
`lib/locked-paths.ts` (`LIVE_TEST_EXECUTION`); `tests/locked-paths-guard.spec.ts` fails when this section and
that definition say different things.

**Closed.** Executing generated tests against a connected S/4HANA tenant: POST /api/run-tests with s4Environment "live", which would let generated code send requests to the tenant through the application credential proxy.

**Open.** Running generated tests against mocks in the isolated test runner (its own Cloud Run service; a deployed app without it runs no tests); checking a tenant connection, reading its OData metadata and one read-only OData call (/api/test-s4-connection, /api/fetch-s4-metadata, /api/test-s4-odata-read) — none of these executes generated code.

**Why.** Generated test code is untrusted. Since roadmap 8.9 it runs in a separate runner service without roles, secrets or open network egress, and a live run reaches the tenant only through a proxy that holds the credentials itself; the guards inside the runner process (Node permission model, preloaded module and network guards) remain defense in depth, not an isolation boundary. What is not done yet is the proof on the deployed profile and an external review of the runner (review findings CR-09, CR-15).

**What changed with 8.9.** The path behind the lock is built: a live run executes in the isolated live
runner, which never receives a credential; the app's credential proxy adds the credentials per request, for
the one tenant host and the one run a capability names. The old switch — `S4_TEST_RUNNER_EGRESS_ENFORCED`
together with an egress probe of two addresses (`lib/runner-egress-attestation.ts`), which put decrypted
credentials into a child process of the API service — is removed, not merely unused. Even with this lock
lifted, the route refuses a live run unless the live runner and the proxy are configured.

**Reopens only when all of these hold:**
- The isolated live runner and the credential proxy are deployed and configured (RUNNER_LIVE_URL, RUNNER_SERVICE_ACCOUNT, S4_PROXY_BASE_URL); without them the route refuses a live run even with this lock lifted.
- Required, not yet met: a run of the authorized negative test (tests/runner-isolation.spec.ts) against the deployed runners, with both runners configured, in which every probe holds — no secret-named variable, no file outside the sandbox directory, none of the fixed destinations it probes reachable (SECURITY.md §7.2) — plus a gcloud check that the runner service account holds no role, since the metadata server stays reachable by design.
- An external review of that runner is done and its findings are closed.
- Sonny decides to reopen, and this entry, SECURITY.md §7.1 and the guard spec change in the same release.

**How it shows.** The route answers a live run with HTTP 403 and the user notice. The testing page marks the
tenant tab as a connection check, states the lock in the tenant panel, disables running tests against the
tenant and does not send the request; the chatbot, the landing page, the knowledge and tenant-security pages,
the whitepaper, the capability guide and the tenant-approval mail describe the connection check and name the
lock. User notice, verbatim:

> Running generated tests against a connected tenant is locked until the isolated live runner has passed its external review. The tenant connection check, the metadata read and the read-only OData call still work; tests run against mocks in the isolated test runner.

**Tracked.** Roadmap 8.9 (`docs/ROADMAP.md`, CR-09, decision §9 no. 16) built the isolated runner; the
proof on the deployed profile, the external review and the decision to reopen are what is left. The
preservation register (roadmap step 1.1) inherits this entry.

### 7.2 Authorized negative test of the deployed runner

Roadmap 8.9 requires an authorized negative test against the deployed runner profile, and it is one of the
reopening conditions in §7.1. The runners accept traffic only from the app, so the test travels the way
generated code travels: `POST /api/admin/runner-selftest` (administrators, fresh step-up) makes the app send
a fixed probe suite (`lib/runner-selftest.ts`) to the mock runner's sandbox and ask both runners for a fixed
network probe from their server process. Every probe passes only when the access fails: no secret-named
environment variable, no file outside the sandbox directory, and none of the fixed destinations reachable —
`www.google.com:443`, `8.8.8.8:53` and `10.10.0.1:443` (plus `169.254.169.254:80` from inside the sandbox).
The app accepts a runner's network answer only when it names exactly the expected targets
(`RUNNER_NETWORK_PROBES`, `lib/test-sandbox/protocol.ts`). Without `RUNNER_LIVE_URL` the result is
`incomplete`, never a pass.

What it can prove: that on the deployed profile these files, variables and destinations were out of reach at
the time of the run. What it cannot prove: that no other destination is reachable — the probes are samples; the
egress boundary is the runner VPC without NAT and its firewall, and that has to be checked where it is
configured. Nor the metadata server (below).

**Status: not run yet.** The runners are being deployed for the first time; `run.invoker` and the runner URLs
on the app are not configured yet. No result of this test exists.

How the owner runs it, after the runners are deployed and `RUNNER_URL` is set:

1. Sign in to the deployed app as an administrator and complete the step-up.
2. Copy the ID token of that session (browser developer tools, `Authorization` header of any API call).
3. `RUNNER_SELFTEST_APP_URL=<app origin> RUNNER_SELFTEST_ADMIN_TOKEN=<token> npx playwright test tests/runner-isolation.spec.ts`

Checked separately with gcloud, because a probe cannot see it: the runner service account holds no role in
the project (`gcloud projects get-iam-policy … --filter=bindings.members:clean-core-runner@…` returns
nothing). Every Cloud Run container reaches its own metadata server; that account having no roles is what
makes the token it hands out worthless. Until both checks have passed, the isolation is configured but not
proven on the deployed profile.

---

## 8. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Server-side Gemini API calls |
| `RESEND_API_KEY` | Yes | Transactional email sending (approval/revoke mails) |
| `NEXT_PUBLIC_APP_URL` | Yes | Self-referential URLs (prevents Host header injection) |
| `S4_ENCRYPTION_KEY` | Yes (if S4 features used) | AES-256-GCM key for credential encryption |
| `S4_HOST_ALLOWLIST` | Recommended | Comma-separated SAP host suffixes for SSRF allowlist |
| `RUNNER_URL` | Yes, for test execution | URL of the isolated mock runner (`clean-core-runner`). Unset = a deployed app runs no tests (fail closed) |
| `RUNNER_LIVE_URL` | No (live path locked) | URL of the isolated live runner (`clean-core-runner-live`). Unset = no live runs, even with the lock lifted |
| `RUNNER_SERVICE_ACCOUNT` | With the live runner | The runners' service account; the credential proxy admits ID tokens of this account only |
| `S4_PROXY_BASE_URL` | With the live runner | The app's own `run.app` URL — where the live runner reaches the credential proxy, and the proxy's token audience |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | For Admin SDK | JSON service account key |
| `NEXT_PUBLIC_FIRESTORE_DB_ID` | Yes | Named Firestore database ID |

> **⚠️ NEVER commit `.env`, `.env.local`, or any file containing live keys to Git.**

---

## 9. Runtime Requirements

| Requirement | Value | Reason |
|-------------|-------|--------|
| Node.js | >= 22.8 | Permission Model inside the isolated runner (F-02) |
| CI Runner | Node 22 | `deploy.yml` uses `node-version: 22` |
| Cloud Run SA | `Cloud Datastore User` | Firestore writes for quota enforcement (F-06) |

---

## 10. XSS & Content Sanitization
- **Safe Markdown Rendering**: AI chatbot tables, answers, and project process documentation are parsed using `marked` and sanitized client-side using `DOMPurify` (via the wrapper `renderMarkdownSafe`). This protects against HTML injection and cross-site scripting (XSS) from unverified model outputs.
- **Mermaid Sandbox Rules**: Interactively rendered BPMN 2.0 flowcharts configure Mermaid to run with `securityLevel: 'strict'` and `htmlLabels: false`, preventing arbitrary JavaScript execution in inline SVG elements.

---

## 11. Evidentiary Board Presentation & Rollup Safety
- **Deterministic Presentation Builder**: Replaced dynamic Gemini-based slide generation with a local, deterministic deck builder (`lib/board-deck.ts`) to prevent prompt injection and LLM hallucinations.
- **Worst-Case Rollup Safety**: The overall project recommendation is evaluated using a strict rollup function. If a project contains any `not-supported` findings, Slide 1 recommendation is automatically downgraded to "Core Redesign Required" (Hold / Rejection) to prevent false positives.

---

## 12. Security Checklist for New Features

- [ ] All API routes use `verifyRequestAuth()` or `verifyAdminRequest()`
- [ ] No user-supplied URLs are fetched without `await isUrlSafe()` validation
- [ ] All outgoing fetches to user-controlled URLs use `safeFetch()` (not raw `fetch()`)
- [ ] `tokenUrl` is validated before any OAuth token exchange
- [ ] No credentials are stored in client-readable Firestore collections
- [ ] No user-supplied code is executed without Node Permission Model sandbox
- [ ] Quota-affecting operations use atomic server-side transactions
- [ ] Admin-only operations check `verifyAdminRequest()` + email format validation
- [ ] New env vars are documented in `.env.example` (without values)
- [ ] New dependencies are added to `serverExternalPackages` if they use native bindings
- [ ] **CSP changes tested against Google Sign-In** (see Section 13 below)

---

## 13. Content Security Policy (CSP) & Firebase Auth — DO NOT BREAK

> **Incident Reference:** v1.13.2 (June 28, 2026) — Google Sign-In was silently broken for weeks due to CSP `script-src` and `frame-src` blocking Firebase Auth's hidden iframe. The failure mode is completely silent: no popup opens, no visible error, Firebase throws `auth/internal-error`.

### 13.1 How Google Sign-In Works (signInWithPopup)

```
App (clean-core.io)
  └─ Firebase SDK loads hidden <iframe> from cleancore-491216.firebaseapp.com/__/auth/iframe
      └─ iframe executes JavaScript (from firebaseapp.com)
          └─ iframe opens popup window to accounts.google.com
              └─ user authenticates with Google (+ optional 2FA)
                  └─ popup redirects to cleancore-491216.firebaseapp.com/__/auth/handler
                      └─ handler sends credential back via window.postMessage
                          └─ iframe receives credential → passes to app
                              └─ app has authenticated user ✅
```

### 13.2 Required CSP Directives

The following CSP directives in `middleware.ts` are **ALL required** for Google Sign-In. Removing any one of them silently breaks authentication.

| Directive | Domain | Why |
|---|---|---|
| `script-src` | `cleancore-491216.firebaseapp.com` | The auth iframe loads and executes JS from this domain. Without it, the iframe HTML renders but its scripts are blocked → popup never opens. **This was the root cause of the v1.13.2 outage.** |
| `script-src` | `apis.google.com` | Google's OAuth client library used by the auth handler page. |
| `frame-src` | `cleancore-491216.firebaseapp.com` | Firebase SDK embeds a hidden `<iframe>` for cross-origin auth state management via `postMessage`. |
| `frame-src` | `accounts.google.com` | The Google account chooser / consent screen popup. |
| `connect-src` | `accounts.google.com` | XHR/fetch calls during OAuth token exchange. |
| `connect-src` | `identitytoolkit.googleapis.com` | Firebase Auth REST API for token verification. |
| `connect-src` | `securetoken.googleapis.com` | Firebase Auth token refresh endpoint. |

### 13.3 Configuration Dependencies

| Setting | File | Value | Why |
|---|---|---|---|
| `authDomain` | `firebase-config.json` | `cleancore-491216.firebaseapp.com` | Must match the domain in `frame-src` and `script-src`. Changing to a custom domain (e.g. `clean-core.io`) requires a Firebase Hosting reverse proxy — a Next.js rewrite is **not sufficient** because it breaks `postMessage` communication. |
| Authorized domains | Firebase Console → Auth → Settings | Must include `clean-core.io` | Firebase rejects auth requests from unlisted domains. |
| OAuth redirect URI | Google Cloud Console → Credentials | `https://cleancore-491216.firebaseapp.com/__/auth/handler` | Must match `authDomain`. If `authDomain` changes, this URI must be updated. Google propagation takes 1-5 minutes. |

### 13.4 Failure Modes & Debugging

| Symptom | Likely Cause | Fix |
|---|---|---|
| No popup, no error, `auth/internal-error` in console | CSP `script-src` missing `cleancore-491216.firebaseapp.com` | Add domain to `script-src` in `middleware.ts` |
| No popup, no error, `auth/internal-error` | CSP `frame-src` missing `cleancore-491216.firebaseapp.com` | Add domain to `frame-src` in `middleware.ts` |
| Popup opens but shows `redirect_uri_mismatch` | `authDomain` changed but OAuth redirect URI not updated in Google Cloud Console | Add `https://<authDomain>/__/auth/handler` to OAuth client redirect URIs |
| Popup opens, user authenticates, but app doesn't recognize login | Using `signInWithRedirect` fallback — cross-origin storage blocked | Use `signInWithPopup` only (no redirect fallback) |
| `auth/popup-blocked` | Browser popup blocker | User must allow popups for `clean-core.io` |

### 13.5 Testing CSP Changes

Before deploying any CSP modification:

1. **Build locally**: `npm run build`
2. **Start production server**: `npm run start`
3. **Open** `http://localhost:3000`
4. **Click Google Sign-In** — a popup should open to `accounts.google.com`
5. **Check browser console** — NO `auth/internal-error` or CSP violations
6. If the popup doesn't open, check the console for `Refused to load` or `Refused to execute` errors — these indicate a CSP block

---

## 14. Evidence Trust Chain (Run Immutability & Audit Pack Cryptography)

The platform's core assurance is that an analysis result cannot be silently altered after the fact. This is enforced server-side.

### 14.1 Immutable, signed Runs
- Every successful analysis is persisted as a **Run** document at `projects/{id}/runs/{runId}` by `app/api/runs/create/route.ts`.
- The server **recomputes** the deterministic evidence, scores, and extensibility routing (it does not trust client-supplied scores).
- A canonical (key-sorted) JSON serialization of the run payload is hashed with **SHA-256 → `runHash`**, then signed with **HMAC-SHA256** using `AUDIT_SIGNING_KEY` → `signature`.
- Runs are **immutable to clients**: `firestore.rules` sets `allow write: if false` on the `runs` subcollection; only the Admin SDK writes them. Read is owner/admin-scoped.

### 14.2 Server-authoritative audit packs
- `enforceActiveRun()` gates every downstream page (Design, Transformation, Documentation, Testing, TCO, Delivery); a missing run redirects to Analyze.
- Audit packs are generated by `/api/audit-pack/create`: the **server** selects the project's active run (the client cannot request a stale/foreign run — **HTTP 422** if none), requires a valid `runHash` (**HTTP 422** otherwise), generates the evidence files, hashes them, HMAC-signs the manifest, and streams the ZIP. The client never supplies file content or hashes for signing, so a valid signature attests to server-generated content.
- The legacy `/api/export/sign` endpoint — which signed *client-supplied* file hashes — is **retired (HTTP 410)**. This closes the gap where an authenticated owner could obtain a valid signature for arbitrary, non-server-generated content. Verification of previously issued packs is unaffected.

### 14.3 Audit Pack verification
- Audit packs carry a SHA-256 **manifest** and an HMAC **signature** (`lib/audit-pack.ts` / `lib/audit-pack-verify.ts`).
- The verify endpoint hardens input (64-char hex signature, ≤32 KB canonical manifest) and compares with `timingSafeEqual`.
- Verification is reported in **three honest tiers**: `authentic` → `integrity-only` (unsigned but hash-consistent) → `failed`. A green "authentic" state is never shown without a valid signature.
- The AI narrative is **not** part of the signed run payload — it is referenced by a separate `responseHash` and stored unsigned, so deterministic evidence and free-text narrative are cleanly separated. The narrative's `gaps` are narrative too: since roadmap 0.12 (2026-09-16) they go to the project's interactive worklist and never into the run's signed `worklist`.
- **Signed files read the run only** (roadmap 0.12). The generators' input is a named list of run fields (`lib/audit-pack-build.ts`); nothing from the client-writable project document reaches a hashed file. What the account holder stated — project name, chosen target architecture, architect sign-off, approver, override reason, workflow status — is written to `07-user-attested.md`, listed under `attested` in `manifest.json`. Its **name** is bound into the manifest hash (`lib/audit-pack-canonical.ts`), so it cannot be added, removed or joined by a second such file after sealing; its **contents** carry no digest and no signature, and both verifiers label it "user-attested · not covered by the signature". Since roadmap 0.7 those fields are written by the server rather than by the browser — see below — and they stay in the attested file all the same: a record the server wrote down faithfully is still the account holder's own statement. Architect sign-off recorded in the pack is **self-attested** (from the signed-in user's own session), not a formally governed organizational approval.

**Sign-off is written by the server (roadmap 0.7, 2026-09-16).** The five release fields — `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`, `architectSignOffAt`, `approvedBy` — and the usage import `usageReport` left the client-writable allowlist in `firestore.rules`. The only writer is `POST /api/projects/{projectId}/commands`, which requires a verified ID token, the second factor when the account carries one, an unsuspended account and **ownership of the project** (an administrator does not qualify; an operator recording somebody else's sign-off is the worse half of an operator reading their code). The transition is validated in `lib/project-commands.ts`: a sign-off needs a signed run to be about, the architecture is one of five named values, departing from the engine's recommendation needs a written reason, and a withdrawal needs something to withdraw. What is recorded is the server's answer, not the browser's: `approvedBy` is the address on the ID token — the page used to send `auth.currentUser.email`, i.e. the browser chose whose name went on the sign-off — and `architectSignOffAt` is the server clock. Every accepted command writes an `audit_events` row through the Admin SDK. `usageReport` was validated in the rules as `is map` and nothing else; the route holds it to the key set of `lib/abap/usage-model.ts` and a row ceiling. Proof: `tests/project-command-boundary.spec.ts` refuses each of the six against the live emulator rules with the real client SDK, then performs an allowed write on the same document so the refusal is the rule and not a broken fixture.

> **What this deliberately does not change:** the sign-off is still a **self-declaration of the signed-in account**, not an organisational mandate, and the audit pack still carries it in `07-user-attested.md`, outside the signature. Server-validated means truthfully recorded, not authoritative. An org/role model remains out of scope — the rationale is in `docs/archiv/ROADMAP-2.0.md`.

> **Known residual (roadmap):** `firestore.rules` is deployed by hand and never by CI, so between a tightening and its deploy the older rules are live. On 2026-09-16 the released ruleset was read back out of the Firebase Rules API for the first time and was the one from **20 August** — three tightenings behind the repository. It was deployed the same day and verified against the working copy. `docs/registers/rules-deployment.json` now records which text is live, `npm run rules:check` compares it with the working copy offline, `npm run rules:verify` asks production, and `tests/rules-deploy-order.spec.ts` fails when an app change would ship ahead of a rules change it depends on.

---

## 15. Operational Readiness

- **Health probe:** `GET /api/health` (liveness + config presence; `?deep=1` adds a Firestore ping) for Cloud Run checks and uptime monitoring. Returns 503 when misconfigured; response is minimal (no per-check disclosure).
- **GDPR Art. 17 erasure:** `deleteUserDataAndAccount()` purges every collection in `docs/DATA-RETENTION.md`, including the `runs` subcollection and encrypted BYOK keys (`user_secrets`) via `recursiveDelete`. Completeness is enforced by an automated test (`tests/security-compliance.spec.ts`).
- **Data retention & residency:** documented per-collection in `docs/DATA-RETENTION.md`; all data in Firestore **europe-west1 (EU)**. Public transparency page at `/trust`.
- **Incident response:** `docs/INCIDENT-RESPONSE.md` — severity classes, key-compromise / data-breach (GDPR 72h) / exposed-seed runbooks, blameless post-mortem.
- **Supply-chain hygiene (CI):** `.github/workflows/security-ci.yml` runs secret scanning (gitleaks), dependency audit (`npm audit --audit-level=high`, blocking), and a CycloneDX SBOM on PRs, deploy-branch pushes, and weekly.

