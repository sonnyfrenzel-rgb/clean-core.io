# Security Architecture — Clean-Core.io Platform

> **Version:** 5.0 · **Date:** 2026-10-02 · **Classification:** Internal

> **v5.0 changes (the 3.0 state):** the app's own VPC network and how it reaches the internal runners, with the runners' deployment status (§7, §7.2); audit packs signed with HMAC and Ed25519, the canonical manifest, browser and offline verification, what the signature covers — the Clean Core Score yes, the level A–D no (§14); owner-only reads incl. runs and suspended accounts (§3.3); headers and the `'unsafe-inline'` gap (§13.6); supply-chain gate and the three review agents (§15); the public surface — content pages, crawlers, demo, invitation pages, unauthenticated routes (§16). Corrected against the code: admin routes and audit logging (§3.2, §3.6), the tenant-link nonce (§3.4), run quota (§6), environment variables (§8), BPMN parsing in place of Mermaid (§10). English throughout.

> **v4.1 changes:** live test execution against a connected tenant is a documented, locked path (§7.1, roadmap gate `G0:R0`): boundary, reason and the conditions for reopening, read from the same definition the route and the interface use.

> **v4.0 changes:** documented the Evidence Trust Chain (run immutability, `runHash` + HMAC signature, audit-pack cryptography — §14) and operational readiness (§15: health probe, complete GDPR Art. 17 cascade, data-retention & incident-response policies, supply-chain CI gates). Corrected the admin-gating description (§3.2) to match the custom-claim implementation.

---

## 1. Executive Summary

This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform following a comprehensive security audit (Code Review 2026-06). Most critical and high-severity findings (P0/P1) have been remediated; the ones that remain **mitigated rather than closed** are called out below and in the code. Since roadmap 8.9 generated tests no longer execute inside the API service: they run in an **isolated runner service** (own Cloud Run service, service account without roles, no secrets, internal ingress, egress through a VPC without NAT — §7), and a deployed app without that runner runs no tests at all. The Node-level guards inside the runner remain defense in depth, not a boundary of their own (see F-02), and the isolation is configured but not yet proven on the deployed profile (§7.2). The signed files of an audit pack are generated from the signed run only; what the account holder states travels in a separately labelled file outside the signature (§14.3). **Live test execution against a connected S/4HANA tenant is locked** (§7.1, gate `G0:R0`): the route refuses it before any measurement, and the interface says so wherever the path would otherwise be offered. It reopens only under the conditions listed there — a measurement passing is not one of them.

---

## 2. Findings & Remediation Status

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|-------------|
| F-01 | Live API keys in repository | **P0** | ✅ Resolved | Keys rotated; `.env.example` contains only placeholders. `.gitignore` enforces exclusion of `.env*` files. |
| F-02 | Remote Code Execution via `/api/run-tests` | **P0** | ⚠️ Mitigated (not closed) | Since roadmap 8.9 generated code executes only in the **isolated runner service** (`runner/`, §7): its own Cloud Run service with a service account without roles, no app secrets, `--ingress=internal`, invocable only by the app (`run.invoker`), and all egress through a VPC without NAT. A deployed app without `RUNNER_URL` refuses to run tests; the in-app child process exists only in an emulator build (local, CI) and is named `local-emulator` in the response and the receipt. Inside the runner the old layers stay as defense in depth: esbuild bundling with a single resolver, Node Permission Model, `--no-experimental-sqlite`, the module guard and the network guard (`__netguard.mjs`). What is not closed: the proof on the deployed profile (§7.2, authorized negative test) and the documented review. Live test execution against a tenant is **locked** (§7.1, `G0:R0`); the old switch `S4_TEST_RUNNER_EGRESS_ENFORCED` and its egress probe are removed. |
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
- Every API route requires a valid Firebase ID Token via `Authorization: Bearer <token>`, except the few listed with their own gate in §16.
- Token verification uses Firebase Admin SDK (`verifyRequestAuth()`).

### 3.2 Admin Gating (F-04)
- Admin routes use `verifyAdminRequest()` which checks:
  1. Valid Firebase ID token, and
  2. The `admin` **custom claim** (`decoded.admin === true`) — the sole authority in production.
  - The `users/{uid}.isAdmin` mirror grants nothing — the former emulator-only fallback to it is gone — but `isAdmin == false` on the profile strips the claim in `verifyRequestAuth`, which makes a withdrawal hold before the old token expires.
  - Firestore rules mirror this: `isAdmin()` reads `request.auth.token.admin` (custom claim) only.
  - Privileged admin actions additionally require recent auth + MFA step-up (`assertAdminStepUp`).
- Protected admin routes: `/api/admin/console-action`, `/api/admin/approve-tenant`, `/api/admin/set-admin-claim`, `/api/admin/runner-selftest`, `/api/send-approval-email` (the welcome mail on demand, e.g. after reinstating an account), `/api/send-tenant-approval-email`, `/api/send-tenant-revoke-email` — each with `verifyAdminRequest` and `assertAdminStepUp`
- Non-admin tokens receive **403** (not 401) — fail-closed.
- Mail recipients are read from the target account (Firebase Auth), not taken from the request body.

### 3.3 Firestore Security Rules
- All collections enforce `isAuthenticated()` for reads.
- **Hardened Onboarding (F-06 hardening)**: Direct creation of profiles in `/users/{userId}` is permitted but strictly gated:
  - Non-admin users are restricted to a strict keys allowlist (`userClientCreateKeys()`) and safe default values (`tier == 'pilot'`, `status == 'pending'`, `isAdmin == false`, `transformationsUsed == 0`, `transformationsLimit == 5`, `maxTeamMembers == 1`, `s4TenantAccessAllowed == false`, `mfaEnabled == false`).
  - **V14 (v2.4.2)**: `termsVersionAccepted` and `termsAcceptedAt` were removed from that allowlist. A client could previously assert its own Terms acceptance, timestamp included, with no `consent_events` row behind it. Consent is now written exclusively by the Admin SDK through `lib/consent.ts` (`POST /api/consent`, `POST /api/account/register`).
  - `status` stays server-authoritative even though signup no longer needs an approval: the create rule pins it to `pending`, and only `activateAccount()` — reached through `POST /api/account/register` — moves it to `approved`, once per account and never from `suspended`.
  - Creation requires `orgId == null` to prevent unauthorized tenant assignments.
- **Field-Level Protection**: Client-side updates to user profiles are restricted to an allowlist of uncritical fields (`userClientUpdateKeys()`: firstName, lastName, theme, defaultView, etc.). Modifying status, tier, transformationsLimit, s4 access, or mfaEnabled directly from the client is blocked.
- **Project Isolation**: A project is created with a fixed key set whose `userId` must be the caller; updates are open to the owner only, restricted to an allowlist of draft fields (`userId` and `createdAt` are not on it, nor are the server-written sign-off fields and `readers` — §3.7, §14.3). The administrator can neither read nor write a project through the rules. Deleting a project is server-only (`DELETE /api/projects/{projectId}`, `recursiveDelete`), so the immutable runs are never orphaned.
- **Suspended accounts lose their data at the rules** (roadmap 3.0.12): every owner and invited-reader grant also asks `accountActive()`, which reads the caller's own profile and refuses `status` `suspended` or `deleted`, `disabled == true`, or a missing profile — so a token issued before the suspension stops reading at once rather than when it expires. The server-side twin is `assertAccountActive`.
- **No Existential Leakage**: Read rules across collections do not permit `resource == null` checks, preventing unauthenticated clients from probing for document existence.
- **Server-Only Credentials**:
  - `s4_credentials/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.
  - `mfa_secrets/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.

### 3.4 Onboarding Link Cryptography (F-09)
- Applies to **live-tenant (BYOT) access only**. The pilot equivalent — two one-click links in the administrator's signup mail — was removed in v2.4.2 along with the approval gate itself: an emailed link that changes account state is not worth keeping for a decision nobody makes any more. Account state is changed in the admin console, behind a login and `assertAdminStepUp`.
- Action-bound approval/rejection links (sent via Resend) are protected by a cryptographically signed HMAC token.
- Tokens are bound to the specific `uid`, `requestType` (`tenant`), and `action` (e.g. approve, reject), carry a 7-day expiration time (`exp`) and a one-time nonce stored server-side in `tenant_access_nonces/{uid}`: using either link consumes it, and a new request replaces it, so a replayed or earlier link is refused.
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
- **Audit Logging**: The console actions — approve, suspend, grant and revoke S/4 access, delete an account — write an `audit_events` row (actor UID/email, action type, target UID, timestamp), the state changes in the same batch as their row. Granting or withdrawing the admin claim, approving a tenant through the mailed link, the runner self-test and the admin mail routes write no row today. Owner actions are logged too: own-key changes, sign-off commands, reader removal, invitation revocation and repair drafts.
- **Admin Verification**: Access requires valid admin credentials, recent re-auth (< 5 min), and the second factor on the ID token (`assertAdminStepUp`).

### 3.7 Who May Read a Project (roadmap 5, sharing)

A project carries uploaded ABAP, so who may read it is stated here in full. There are **two** read paths from a browser and one deliberate server-side act; there is no third.

- **The owner.** `firestore.rules` grants `resource.data.userId == request.auth.uid`.
- **An invited account that accepted.** The owner invites one e-mail address; the server creates an invitation at `projects/{projectId}/invitations/{invitationId}` and mails a link. Accepting requires a signed-in account whose **own, confirmed** e-mail address equals the invited one — Google sign-in counts as confirmed, a password account is sent a confirmation first. The invitation page is `noindex` and shows a signed-out visitor nothing of the project (§16). Only then is the accepting uid written into the `readers` array on the project document, and only then does the rule answer. A forwarded link therefore opens nothing: the link names the invitation, the account is what is checked.
- **The administrator has no read.** It was removed on 16.09.2026 and did not come back with sharing. An emergency — a credible report of malicious code in an upload — is handled server-side through the Admin SDK, which bypasses the rules by design; that is a deliberate act with a record, not a standing permission.

Properties this rests on, each enforced rather than asked for:

- **The grant is one field in one place.** Reading is answered by `readers` on the project document, with no `get()` into another document. A revocation removes the uid from that one array and takes effect on the next read — it does not have to succeed in N documents to be complete. For the same reason `projects/{id}/runs/{runId}` is **not** widened: an invited reader gets a run's contents through `GET /api/projects/{projectId}`, which re-reads `readers` on every request.
- **`readers` is not client-writable.** A browser that could write it could invite itself, which is the whole grant. The field is absent from the project update allowlist, and `tests/invitation-flow.spec.ts` reads the rules file to prove it.
- **The invitation subcollection is server-only, out loud.** `allow read, write: if false` — written down rather than left to default-deny, because an invitation carries the e-mail address of the person it was sent to, and a project's invitation list is therefore a list of other people's addresses. The owner's overview is answered by `GET /api/projects/{projectId}/readers`, which returns the accepted readers and never the pending addresses.
- **Nothing on an invitation comes from the caller.** Both timestamps are the server's clock, `invitedBy` is the verified token, `status` is `pending` because this route is the only thing that creates one, and a requested lifetime outside 1–90 days collapses to the default of 14 rather than being honoured. Documents are written with `create()`, never `set()`, and the id is 24 random bytes.
- **Inviting and revoking sit behind the second factor**, like every other route that touches a project's code; inviting, previewing and accepting are also rate-limited. A project may hold at most **three** open invitations at once (`INVITATION_MAX_OPEN`, decided 18.09.2026): the rate limit caps how fast invitations go out and cannot cap how many stand open, and a route that mails an address its caller typed needs both halves.
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
- **Own model keys (BYOK)** are not under this key since roadmap 3.0.13: `user_secrets/{uid}/providers/*` is sealed with `BYOK_ENCRYPTION_KEY`, the key version is recorded in each record and bound into the GCM additional data together with the account and the provider (`lib/byok-key.ts`). Only versions in the module's key ring are opened; a record without a version (the pre-3.0.13 shape, sealed with `S4_ENCRYPTION_KEY`) or with an unknown version is unreadable and is never handed to the S/4 key — no BYOK code imports `lib/s4-credentials.ts` or names `S4_ENCRYPTION_KEY`. There was no migration to run: a dry run on 30.09.2026 found no stored model key in either database. The version field stays so the key can be rotated later.
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
- The app's public egress is not filtered at the network level: its VPC attachment (§7) carries private ranges only, so tenant calls leave directly and rely on the checks above. Egress filtering for the app service remains a documented residual risk.

---

## 6. Quota Enforcement (F-06)

- **Server-side**: `reserveRunQuota(uid, inputHash)` in `lib/firebase-admin.ts` performs an atomic Firestore transaction: an account that is not approved gets 403; otherwise one analysis run is reserved against `transformationsUsed` / `transformationsLimit`, and a full quota throws `QuotaError(403)`.
- **Not metered**: re-analysing the same input fingerprint, the first run of each starter example, enterprise-tier accounts and accounts using their own model key (BYOK). There are no hardcoded super-admins.
- **Refund**: `refundRunQuota(…)` gives the reservation back when the run fails (best-effort, never below 0, a failure is logged).
- **Client**: there is no client-side counter any more — quota is only enforced server-side.
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
  │  6. POST <runner>/run with the app's Google ID token (audience = runner URL),
  │     sent through the app's own VPC egress (below) — internal ingress admits nothing else
  │  7. check the report: SHA-256 of every file and of the suite = what was sent, mode = asked for
  │  8. verdicts + receipt (runner kind, self-reported K_REVISION, files digest) — mock runs only
  ▼
Runner service (clean-core-runner / clean-core-runner-live, one image)
     SA without roles · no secrets · ingress internal · run.invoker: the app's service account only
     egress: all traffic into VPC runner-net, no Cloud NAT; egress firewall by network tag —
       mock: deny all · live: tcp/443 to private.googleapis.com (199.36.153.8/30) only,
       which is how it reaches the app's run.app URL (private DNS zone run.app → private.googleapis.com)
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
- **How the app reaches the runner.** A runner with internal ingress answers only requests that leave a VPC network of this project. The app therefore has a network of its own, `app-net` with the subnet `app-run-egress` (10.20.0.0/24, Private Google Access) and private DNS that resolves `*.run.app` to `private.googleapis.com` (199.36.153.8/30). The `run.app` zone's CNAME alone is not enough: Cloud DNS does not follow a CNAME from a private zone into public DNS, only into private zones of the same network, so `app-net` also needs a private zone for the single name `private.googleapis.com` with its four A records — never a zone for all of `googleapis.com`, which is what broke sign-in on `runner-net`. Without it the runner names do not resolve and the self-test reports the runners unreachable (02.10.2026). The app is attached with `--vpc-egress=private-ranges-only`, so the app's public egress (Gemini, mail, tenants) does not change. The deploy reads network and subnet from `APP_VPC_NETWORK` / `APP_VPC_SUBNET`, refuses `runner-net` for the app (its private `googleapis.com` zone made every sign-in check fail on 01.10.2026), and detaches the app with `--clear-network` when the subnet is unset, because a deploy without network flags keeps the previous revision's network (`.github/workflows/deploy.yml`, held by `tests/runner-deploy-guard.spec.ts`). Admission is the ID token: Cloud Run checks its audience and the `run.invoker` binding, which on all four runner services names only the app's service account `clean-core-run`. The runners stay on `runner-net` without NAT. The app's own ingress is public, as it has to be for its users; that is also the path the live runner's credential relay takes.
- **There or not at all.** Without `RUNNER_URL` a deployed app refuses to run tests (HTTP 503). The local path exists only when the build itself was made for the Firebase emulator, and is named `local-emulator` wherever its result appears.
- **What ran is what was sent.** The runner reports the SHA-256 of every file and of the suite plus its `K_REVISION`; the app refuses a report whose hashes do not match what it sent and writes the digest and the revision into the receipt (`lib/test-receipt.ts`, `runner`). The revision is self-reported: the app checks only its shape, because it has no independent source to compare it with.
- **No credential ever reaches a runner.** A live run carries a capability; the credential proxy adds the credentials per request, for one host, one run, ten minutes at most, read-only methods.
- **Node-level layers, kept as defense in depth.** Bundler with one resolver (imports must stay inside the run directory, bare packages become a stub), Permission Model (file system scoped to the run directory; no child processes, workers or addons), `--no-experimental-sqlite`, the module guard (`lib/sandbox-module-guard.ts`) and the network guard (`lib/test-sandbox/net-guard.ts`: closed on mock runs; on live runs exactly one loopback port, DNS closed on both). None of these is claimed as a boundary.
- **No shell execution, minimal environment, output cap, 15 s timeout, 256 MB child heap.**

### Requirements
- Node.js >= 22.8 in the runner image (`node:22-slim`); the runner refuses to execute without the Permission Model.
- `esbuild` in the runner image (`runner/package.json`, pinned to the app's version).

### 7.1 Locked path: live test execution (`G0:R0`)

Decided 12.09.2026 (roadmap step 0.1, `docs/roadmap/SCHNITT-0-UMFANG.md` §1, option 2): a known blocker is
either fixed or locked with its reason named. This one is locked. The definition lives in
`lib/locked-paths.ts` (`LIVE_TEST_EXECUTION`); `tests/locked-paths-guard.spec.ts` fails when this section and
that definition say different things.

**Closed.** Executing generated tests against a connected S/4HANA tenant: POST /api/run-tests with s4Environment "live", which would let generated code send requests to the tenant through the application credential proxy.

**Open.** Running generated tests against mocks in the isolated test runner (its own Cloud Run service; a deployed app without it runs no tests); checking a tenant connection, reading its OData metadata and one read-only OData call (/api/test-s4-connection, /api/fetch-s4-metadata, /api/test-s4-odata-read) — none of these executes generated code.

**Why.** Generated test code is untrusted. It runs in a separate runner service without roles, secrets or open network egress, and a live run reaches the tenant only through a proxy that holds the credentials itself; the guards inside the runner process (Node permission model, preloaded module and network guards) remain defense in depth, not an isolation boundary. What is not done yet is the proof on the deployed profile and the documented review of the runner (review findings CR-09, CR-15).

**What changed with 8.9.** The path behind the lock is built: a live run executes in the isolated live
runner, which never receives a credential; the app's credential proxy adds the credentials per request, for
the one tenant host and the one run a capability names. The old switch — `S4_TEST_RUNNER_EGRESS_ENFORCED`
together with an egress probe of two addresses (`lib/runner-egress-attestation.ts`), which put decrypted
credentials into a child process of the API service — is removed, not merely unused. Even with this lock
lifted, the route refuses a live run unless the live runner and the proxy are configured.

**Reopens only when all of these hold:**
- The isolated live runner and the credential proxy are deployed and configured (RUNNER_LIVE_URL, RUNNER_SERVICE_ACCOUNT, S4_PROXY_BASE_URL); without them the route refuses a live run even with this lock lifted.
- Required, not yet met: a run of the authorized negative test (tests/runner-isolation.spec.ts) against the deployed runners, with both runners configured, in which every probe holds — no secret-named variable, none of the four fixed system files it reads readable, none of the fixed destinations it probes reachable (SECURITY.md §7.2) — plus a gcloud check that the runner service account holds no role, since the metadata server stays reachable by design.
- Required, not yet met: a documented review of the runner, the credential proxy and their routes — the full QA review and the security audit of a release on main read these files completely (not INCOMPLETE for them), and every finding on them is fixed or refuted with evidence (decision Sonny, 24.09.2026: no external review).
- Sonny decides to reopen, and this entry, SECURITY.md §7.1 and the guard spec change in the same release.

**How it shows.** The route answers a live run with HTTP 403 and the user notice. The testing page marks the
tenant tab as a connection check, states the lock in the tenant panel, disables running tests against the
tenant and does not send the request; the chatbot, the landing page, the knowledge and tenant-security pages,
the whitepaper, the capability guide and the tenant-approval mail describe the connection check and name the
lock. User notice, verbatim:

> Running generated tests against a connected tenant is locked until the isolated live runner has passed its review. The tenant connection check, the metadata read and the read-only OData call still work; tests run against mocks in the isolated test runner.

**Tracked.** Roadmap 8.9 (`docs/ROADMAP.md`, CR-09, decision §9 no. 16) built the isolated runner; the
proof on the deployed profile, the documented review and the decision to reopen are what is left. The
external review that an earlier version of this entry required is **waived as a policy decision** (Sonny,
24.09.2026) — it is not replaced by anything already done: the documented review and the proof on the
deployed profile are both still open gates. The preservation register (roadmap step 1.1) inherits this entry.

### 7.2 Authorized negative test of the deployed runner

Roadmap 8.9 requires an authorized negative test against the deployed runner profile, and it is one of the
reopening conditions in §7.1. The runners accept traffic only from the app, so the test travels the way
generated code travels: `POST /api/admin/runner-selftest` (administrators, fresh step-up) makes the app send
a fixed probe suite (`lib/runner-selftest.ts`) to the mock runner's sandbox and ask both runners for a fixed
network probe from their server process. Every probe passes only when the access fails: no secret-named
environment variable, none of four fixed system files readable, and none of the fixed destinations reachable —
`www.google.com:443`, `8.8.8.8:53` and `10.10.0.1:443` (plus `169.254.169.254:80` from inside the sandbox).
The app accepts a runner's network answer only when it names exactly the expected targets
(`RUNNER_NETWORK_PROBES`, `lib/test-sandbox/protocol.ts`). Without `RUNNER_LIVE_URL` the result is
`incomplete`, never a pass.

What it can prove: that on the deployed profile these files, variables and destinations were out of reach at
the time of the run. What it cannot prove: that no other destination is reachable — the probes are samples; the
egress boundary is the runner VPC without NAT and its firewall, and that has to be checked where it is
configured. Nor the metadata server (below).

**Status (02.10.2026): deployed and wired, no result recorded.** All four runner services (`clean-core-runner`,
`clean-core-runner-live` and their `-dev` twins) are deployed with internal ingress; `run.invoker` on each names
the app's service account only; the runner URLs are set as deploy variables for both lanes. The `dev` app runs on
`app-net`; the production app receives the network with its next deploy from `main`. The gcloud check below was
read on 02.10.2026: `clean-core-runner` held no role in the project. No result of the probe run is recorded in
the repository yet, so the isolation counts as configured, not proven.

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
| `S4_ENCRYPTION_KEY` | Yes (if S4 features used) | AES-256-GCM key for credential encryption; also the HKDF source of the proxy capability signing key |
| `AUDIT_SIGNING_KEY` | Yes | HMAC key for runs and audit packs, at least 32 characters, no fallback (`lib/audit-signing-key.ts`); asserted by the deploy |
| `AUDIT_SIGNING_PRIVATE_KEY` | No | Ed25519 key for audit packs; unset = HMAC-only packs and the well-known key document answers 503 |
| `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED` | No | Retired Ed25519 public keys still published, so packs from before a rotation verify |
| `RATE_LIMIT_PEPPER` | Yes | HMAC pepper for rate-limit document ids; no fallback, rate-limited routes fail without it |
| `PILOT_APPROVAL_SECRET` | Yes | HMAC key of the tenant approval links (at least 16 characters, §3.4) |
| `RESEND_WEBHOOK_SECRET` | Yes, for delivery events | Svix signature of the mail provider's webhook; unset = the webhook answers 503 |
| `BYOK_ENCRYPTION_KEY` | Yes | AES-256-GCM key for stored own model keys (BYOK), version 1 (`lib/byok-key.ts`). Unset or not 32 bytes = the production deploy stops before deploying; on a running revision, storing a key is refused and `/api/health` reports degraded. Never falls back to `S4_ENCRYPTION_KEY` |
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
| Cloud Run SA (app) | `clean-core-run`: `Cloud Datastore User`, `Firebase Authentication Admin`, `Logs Writer` (read 02.10.2026) | Firestore writes for quota enforcement (F-06), MFA and account administration, structured logs |
| Cloud Run SA (runners) | `clean-core-runner`: no project role | The token its metadata server hands out may do nothing (§7) |

---

## 10. XSS & Content Sanitization
- **Safe Markdown Rendering**: AI chatbot tables, answers, and project process documentation are parsed using `marked` and sanitized client-side using `DOMPurify` (via the wrapper `renderMarkdownSafe`). This protects against HTML injection and cross-site scripting (XSS) from unverified model outputs.
- **BPMN diagrams** are rendered with bpmn-js (viewer and modeler); names and documentation are shown as text only. An uploaded BPMN 2.0 XML file is parsed in the browser with bpmn-moddle (`lib/bpmn/import.ts`) and refused when it is empty or larger than 800,000 characters, carries a `DOCTYPE` or `ENTITY` declaration, is not BPMN definitions, uses unknown elements, references other files (`bpmn:import`), has more than 5,000 flow nodes or no diagram layout. Every `cc:*` claim in the file is dropped — line anchors and proof states are never taken from a file but re-derived from the reconstruction — and names and documentation are length-capped with control and bidi characters stripped. Stored revisions are parsed on the server with saxen, without DTDs or entities (`lib/process-revisions.ts`).
- **Mermaid**: `components/MermaidDiagram.tsx` is no longer imported anywhere; the `mermaid` package remains a dependency until it is removed.

---

## 11. Evidentiary Board Presentation & Rollup Safety
- **Deterministic Presentation Builder**: Replaced dynamic Gemini-based slide generation with a local, deterministic deck builder (`lib/board-deck.ts`) to prevent prompt injection and LLM hallucinations.
- **Worst-Case Rollup Safety**: The overall project recommendation is evaluated using a strict rollup function. If a project contains any `not-supported` finding, the recommendation is "Redesign needed before release"; any `partial` finding gives "Release only with architect sign-off"; no findings at all gives no verdict, because coverage is not established.

---

## 12. Security Checklist for New Features

- [ ] All API routes use `verifyRequestAuth()` or `verifyAdminRequest()`
- [ ] No user-supplied URLs are fetched without `await isUrlSafe()` validation
- [ ] All outgoing fetches to user-controlled URLs use `safeFetch()` (not raw `fetch()`)
- [ ] `tokenUrl` is validated before any OAuth token exchange
- [ ] No credentials are stored in client-readable Firestore collections
- [ ] No generated or user-supplied code is executed outside the isolated runner (§7)
- [ ] Quota-affecting operations use atomic server-side transactions
- [ ] Admin-only operations check `verifyAdminRequest()` + `assertAdminStepUp` and write an `audit_events` row
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

### 13.6 Other headers and a known gap

- `middleware.ts` sets the page CSP only in production builds (none under `npm run dev`); besides the directives above it pins `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` and `object-src 'none'`. API responses get their own policy from `next.config.mjs` (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`), and every response carries HSTS (two years, `includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off camera, microphone and geolocation.
- **Known gap, scheduled after 3.0:** `script-src` and `style-src` still carry `'unsafe-inline'`, so the CSP does not stop an injected inline script on its own; output sanitizing (§10) is what does. Moving to nonces is a step of its own with a measurement against the real Google sign-in, because a wrong CSP here locks people out silently (§13.4). Tracked under SEC-2026-016 and related IDs in `docs/ROADMAP.md` §12.

---

## 14. Evidence Trust Chain (Run Immutability & Audit Pack Cryptography)

The platform's core assurance is that an analysis result cannot be silently altered after the fact. This is enforced server-side.

### 14.1 Immutable, signed Runs
- Every successful analysis is persisted as a **Run** document at `projects/{id}/runs/{runId}` by `app/api/runs/create/route.ts`.
- The server **recomputes** the deterministic evidence, scores, and extensibility routing (it does not trust client-supplied scores).
- A canonical (key-sorted) JSON serialization of the run payload is hashed with **SHA-256 → `runHash`**, then signed with **HMAC-SHA256** using `AUDIT_SIGNING_KEY` → `signature` (`lib/run-signature.ts`). The AI narrative (`analysis`) is outside the hash by design. A run is signed with HMAC only; Ed25519 applies to the audit pack (§14.2). Without a signing key of at least 32 characters (`lib/audit-signing-key.ts`, no fallback) the route refuses with HTTP 500 and no run is written.
- The **Clean Core Score** is computed by the deterministic router before any model runs and is part of the signed run payload (`cleanCoreScore`, `lib/clean-core-score.ts`); the bands are a fixed reading of that number, not a second measurement. The **clean-core level A–D** is not: it comes from SAP's classification file, is looked up for display (`gradeSapObject`, `/api/abcd-classify`) and never appears in a signed pack file (§14.3).
- Runs are **immutable to clients**: `firestore.rules` sets `allow write: if false` on the `runs` subcollection; only the Admin SDK writes them. Read is owner-only — the administrator has no read, and an invited reader receives a run's contents only through `GET /api/projects/{projectId}` (§3.7).

### 14.2 Server-authoritative audit packs
- `enforceActiveRun()` gates every downstream page (Design, Transformation, Documentation, Testing, TCO, Delivery); a missing run redirects to Analyze.
- Audit packs are generated by `/api/audit-pack/create` for the project's owner only (an administrator does not qualify): the **server** selects the project's active run (the client cannot request a stale/foreign run — **HTTP 422** if none), requires a valid `runHash` (**HTTP 422** otherwise), re-checks the run's own hash and HMAC (`verifyRunIntegrity`, **HTTP 409** on a mismatch), generates the evidence files, hashes them, signs the manifest, and streams the ZIP.
- **Two signatures over one hash.** The manifest is reduced to a canonical string (`lib/audit-pack-canonical.ts`: the files as `<path>:<sha256>` sorted by path, then project, run, `runHash`, engine and catalog versions, the attested file names and digests, the issue time and the coverage rows, with separators refused inside values) and hashed with SHA-256 → `manifestHash`. That hash is signed with **HMAC-SHA256** (`AUDIT_SIGNING_KEY`) and, when `AUDIT_SIGNING_PRIVATE_KEY` is configured, also with **Ed25519** (`signatureEd25519`, `signingKeyId`, manifest version 4.1; without the key the pack is HMAC-only, version 4.0). The public keys are published unauthenticated at `/.well-known/clean-core-io-signing.json` (active key plus the retired keys listed in `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`, so packs from before a rotation still verify; removing a key from that list is how a compromised key is revoked). With no Ed25519 key configured that document answers 503.
- **Known gap, accepted until after 3.0 (owner decision 01.10.2026):** the deploy asserts that `AUDIT_SIGNING_KEY` is set but not its length; the running app refuses a key shorter than 32 characters, so a short key stops signing rather than signing weakly. The length check in the deploy returns together with a key history for the HMAC key (verification against a list of keys), because forcing a rotation without one would leave every issued pack unverifiable (`docs/ROADMAP.md` §7, `tests/signing-key-guard.spec.ts`). The client never supplies file content or hashes for signing, so a valid signature attests to server-generated content.
- The legacy `/api/export/sign` endpoint — which signed *client-supplied* file hashes — is **retired (HTTP 410)**. This closes the gap where an authenticated owner could obtain a valid signature for arbitrary, non-server-generated content. Verification of previously issued packs is unaffected.

### 14.3 Audit Pack verification
- Audit packs carry a SHA-256 **manifest**, an HMAC **signature** and, where configured, an Ed25519 signature (`lib/audit-pack.ts` / `lib/audit-pack-verify.ts`).
- **In the browser** (`/verify-pack`, reachable without an account): the ZIP is opened locally, every file's SHA-256 is recomputed, unlisted or duplicate entries and attested digests are checked and the canonical manifest is rebuilt. The archive is never uploaded; only the canonical manifest and the HMAC signature go to `POST /api/export/verify`, because an HMAC can be checked only by the holder of the key.
- **The verify endpoint** is public, rate-limited per IP, accepts a canonical manifest of at most 32 KB and either a 64-character hex HMAC (compared with `timingSafeEqual`) or an Ed25519 signature, which it checks against this instance's own key. It reads and writes nothing in the database.
- **Offline, without the issuer:** `node scripts/verify-pack.mjs <pack.zip> [--key …]` recomputes every file hash and the manifest hash and verifies the Ed25519 signature against the key published at `https://clean-core.io/.well-known/clean-core-io-signing.json` (or a key given explicitly; a URL inside the pack is ignored). A pack with only an HMAC signature is reported as not checkable offline (exit code 2), never as verified.
- Verification is reported in **three honest tiers**: `authentic` → `integrity-only` (unsigned but hash-consistent) → `failed`. A green "authentic" state is never shown without a valid signature.
- The AI narrative is **not** part of the signed run payload — it is referenced by a separate `responseHash` and stored unsigned, so deterministic evidence and free-text narrative are cleanly separated. The narrative's `gaps` are narrative too: since roadmap 0.12 (2026-09-16) they go to the project's interactive worklist and never into the run's signed `worklist`.
- **Signed files read the run only** (roadmap 0.12). The generators' input is a named list of run fields (`lib/audit-pack-build.ts`); nothing from the client-writable project document reaches a hashed file. The Clean Core Score is among those fields; the clean-core level A–D is not, and the tests keep it out (`tests/pce-derived-displays.spec.ts`, `tests/assessment-profile-wiring.spec.ts`); the Delivery handover names it under what the signature does not cover (`NOT_SIGNED`, `lib/handover.ts`). What the account holder stated — project name, chosen target architecture, architect sign-off, approver, override reason, workflow status — is written to `07-user-attested.md`, listed under `attested` in `manifest.json`. Its **name** is bound into the manifest hash (`lib/audit-pack-canonical.ts`), so it cannot be added, removed or joined by a second such file after sealing; its **contents** carry no digest and no signature, and both verifiers label it "user-attested · not covered by the signature". Since roadmap 0.7 those fields are written by the server rather than by the browser — see below — and they stay in the attested file all the same: a record the server wrote down faithfully is still the account holder's own statement. Architect sign-off recorded in the pack is **self-attested** (from the signed-in user's own session), not a formally governed organizational approval.

**Sign-off is written by the server (roadmap 0.7, 2026-09-16).** The five release fields — `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`, `architectSignOffAt`, `approvedBy` — and the usage import `usageReport` left the client-writable allowlist in `firestore.rules`. The only writer is `POST /api/projects/{projectId}/commands`, which requires a verified ID token, the second factor when the account carries one, an unsuspended account and **ownership of the project** (an administrator does not qualify; an operator recording somebody else's sign-off is the worse half of an operator reading their code). The transition is validated in `lib/project-commands.ts`: a sign-off needs a signed run to be about, the architecture is one of five named values, departing from the engine's recommendation needs a written reason, and a withdrawal needs something to withdraw. What is recorded is the server's answer, not the browser's: `approvedBy` is the address on the ID token — the page used to send `auth.currentUser.email`, i.e. the browser chose whose name went on the sign-off — and `architectSignOffAt` is the server clock. Every accepted command writes an `audit_events` row through the Admin SDK. `usageReport` was validated in the rules as `is map` and nothing else; the route holds it to the key set of `lib/abap/usage-model.ts` and a row ceiling. Proof: `tests/project-command-boundary.spec.ts` refuses each of the six against the live emulator rules with the real client SDK, then performs an allowed write on the same document so the refusal is the rule and not a broken fixture.

> **What this deliberately does not change:** the sign-off is still a **self-declaration of the signed-in account**, not an organisational mandate, and the audit pack still carries it in `07-user-attested.md`, outside the signature. Server-validated means truthfully recorded, not authoritative. An org/role model remains out of scope — the rationale is in `docs/archiv/ROADMAP-2.0.md`.

> **Known residual (roadmap):** `firestore.rules` is deployed by hand and never by CI, so between a tightening and its deploy the older rules are live. On 2026-09-16 the released ruleset was read back out of the Firebase Rules API for the first time and was the one from **20 August** — three tightenings behind the repository. It was deployed the same day and verified against the working copy. `docs/registers/rules-deployment.json` now records which text is live, `npm run rules:check` compares it with the working copy offline, `npm run rules:verify` asks production, and `tests/rules-deploy-order.spec.ts` fails when an app change would ship ahead of a rules change it depends on.

---

## 15. Operational Readiness

- **Health probe:** `GET /api/health` (liveness + config presence; `?deep=1` adds a Firestore ping) for Cloud Run checks and uptime monitoring. Returns 503 when misconfigured; response is minimal (no per-check disclosure).
- **GDPR Art. 17 erasure:** `deleteUserDataAndAccount()` purges every collection in `docs/DATA-RETENTION.md`, including the `runs` subcollection and encrypted BYOK keys (`user_secrets`) via `recursiveDelete`. The cascade also removes the account's uid from other projects' `readers` and deletes every invitation addressed to it; if any step fails, the profile and the sign-in are kept so the erasure can be retried. Tested in `tests/security-compliance.spec.ts` and `tests/account-erasure.spec.ts`.
- **Known gap, scheduled after 3.0 (owner decision 01.10.2026):** an ID token issued before the deletion stays valid for up to an hour; a server-written marker that the rules check will close that window (`docs/ROADMAP.md` §7). The welcome mail is sent at sign-up before the address is confirmed, and this stays as it is — confirming the address at sign-up would change sign-up, which is kept unchanged (`docs/ROADMAP.md` §9).
- **Data retention & residency:** documented per-collection in `docs/DATA-RETENTION.md`; all data in Firestore **europe-west1 (EU)**. Public transparency page at `/trust`.
- **Incident response:** `docs/INCIDENT-RESPONSE.md` — severity classes, key-compromise / data-breach (GDPR 72h) / exposed-seed runbooks, blameless post-mortem.
- **Supply-chain hygiene (CI):** `.github/workflows/security-ci.yml` runs secret scanning (gitleaks, full history), a dependency gate (`audit-ci` at high and critical over a dependency tree installed with `--ignore-scripts`; `audit-ci.jsonc` holds an empty allowlist) and a CycloneDX SBOM on every pull request, on pushes to the deploy branches and weekly; a red scheduled run mails the administrator. The deploy itself waits for its own production audit (`npm audit --omit=dev --audit-level=high`, job `security` in `deploy.yml`). Vulnerable transitive versions are pinned through `overrides` in `package.json` — for example `basic-ftp` under `get-uri` at `^6.2.1`, which the lock file resolves to 6.2.1 (a development dependency). There is no Dependabot; `package-lock.json` is regenerated only with the CI toolchain (npm 11 on Node 22).
- **Review agents (read-only, sealed).** Three model-based reviewers run in GitHub Actions; none of them gates a deploy, writes to the repository or receives an application secret, and every report is sealed before it is stored as a workflow artifact, so nothing they find appears in a public log.
  - *QA agent* (`.github/workflows/qa-review.yml`): a delta review of every push to `dev` plus a smoke check of the deployed revision, and a full review of every release on `main`. Model: OpenRouter's Auto Router (`openrouter/auto`) with a price ceiling per tier; a delta review is capped at an estimated USD 6.50 and 96,000 output tokens, a full review at USD 10 (`scripts/qa/lib/config.mjs`); the hard ceiling is the credit limit on the key. It reads a checkout without `.env*` or key files, redacted before sending; the model has no tools and the job runs no `npm ci`. Reports are sealed with AES-256-GCM under `QA_REVIEW_KEY`. Findings verified as wrong go into a sealed refuted list (`docs/qa/refuted-findings.enc.json`) that the next review receives, so a refuted finding returns only when the code invalidates the reason.
  - *Security audit agent* (`.github/workflows/security-audit.yml`): a full audit of every release on `main` by a CISO and five consultants — model calls without tools through the Auto Router, budget USD 20. The model job holds only the OpenRouter key and seals with the public key `docs/security/audit-public-key.pem` (fresh AES-256-GCM key per report, wrapped with RSA-OAEP), so it cannot open its own report; a separate job without a model decrypts it and mails it to the owner. Decisions live in the sealed register `docs/security/register.enc.json`; public files carry finding IDs only (`docs/ROADMAP.md` §12).
  - *UX agent* (`.github/workflows/ux-review.yml`): reviews source and screenshots of a seeded demo project; the screenshots are taken in a job without secrets, the model job (Auto Router, image-capable models only) runs no `npm ci` and seals with `UX_REVIEW_KEY`.
  - Each has a kill switch (`QA_REVIEW_ENABLED`, `SECURITY_AUDIT_ENABLED`, `UX_REVIEW_ENABLED`), and a weekly health check (`qa-weekly-health.yml`, no model) reports red or stale workflows. Runbooks: `docs/QA-REVIEW-LOOP.md`, `docs/SECURITY-AUDIT-AGENT.md`, `docs/UX-REVIEW-AGENT.md`.


---

## 16. Public Surface

What a visitor reaches without an account, and what it can and cannot see. The app shell (`app/(app)/layout.tsx`) does not gate pages by sign-in; protection rests on the API checks (§3) and the Firestore rules, so a page that loads signed out holds no private data unless an authenticated call fetches it.

- **Content pages and machine-readable texts.** The landing page, the knowledge and method pages, `/trust`, `/tenant-security`, the whitepaper (`/whitepaper`, its print view `/whitepaper-print` — `noindex` — and the PDFs under `public/` with a `.sha256` beside each), `/llms.txt`, `/llms-full.txt`, `/facts`, `/facts.json` and the sitemaps are generated from code, the bundled SAP catalog and fixed texts. None of them reads Firestore or an account.
- **Crawlers.** `app/robots.ts` allows named AI crawlers and answer fetchers (OpenAI, Anthropic, Perplexity, Google-Extended, Applebot-Extended) on the public pages and disallows `/admin/`, `/project/`, `/dashboard/`, `/settings/`, `/api/` and `/invitation/` for every agent. `htmlLimitedBots` in `next.config.mjs` only makes Next.js put the page metadata into `<head>` for those bots; it is not a security control.
- **Share card.** A static image rendered offline from the fictitious demo program and labelled as a demo; no route generates it from user data.
- **Demo** (`/demo/{stage}`, `noindex`). Built at render time from a bundled example program run through the deterministic engine. It calls no API route, writes nothing, calls no model and creates no run: `assertNoTrustChain` (`lib/demo-project.ts`) throws if the demo object carries a signature or an account field, the run is labelled "unsigned", and the Delivery stage states that a demo produces no audit pack and no signed export. Reader state stays in the browser's `localStorage`. `/demo/workspace` answers 404 unless the account is an administrator with the workspace switch on.
- **Invitation page** (`/invitation/{projectId}/{invitationId}`, `noindex`, disallowed in `robots.txt`). Signed out it shows fixed text and a sign-in link and makes no API call; signed in, it learns only who invited and when the invitation expires, and the project name appears only after acceptance succeeded (§3.7).
- **Verification.** `/verify-pack`, `POST /api/export/verify` and `/.well-known/clean-core-io-signing.json` are public by design (§14.3).
- **API routes without a Firebase ID token**, each with its own gate: `/api/health` (status, version, short commit, time — nothing per check; the deep probe is rate-capped per instance), `/api/export/verify` (rate limit per IP), `/api/export/sign` (always 410), `/api/unsubscribe` (HMAC token from the mail), `/api/survey/vote` (signed survey token, rate limit per IP), `/api/webhooks/resend` (Svix signature under `RESEND_WEBHOOK_SECRET`, 503 without it), `/api/auth/jira/callback` (404 unless the integration is switched on; OAuth `state` bound to an httpOnly cookie), `/api/s4-proxy/…` (the runner's Google ID token plus a per-run capability, §7) and `/api/test/seed` (404 outside an emulator build, §2 F-15). Every other route verifies the ID token.
