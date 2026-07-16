# Security Architecture — Clean-Core.io Platform

> **Version:** 4.0 · **Date:** 2026-07-02 · **Classification:** Internal

> **v4.0 changes:** documented the Evidence Trust Chain (run immutability, `runHash` + HMAC signature, audit-pack cryptography — §14) and operational readiness (§15: health probe, complete GDPR Art. 17 cascade, data-retention & incident-response policies, supply-chain CI gates). Corrected the admin-gating description (§3.2) to match the custom-claim implementation.

---

## 1. Executive Summary

This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform following a comprehensive security audit (Code Review 2026-06). Most critical and high-severity findings (P0/P1) have been remediated; the ones that remain **mitigated rather than closed** are called out below and in the code. Most importantly, the `/api/run-tests` runner is **defense-in-depth, not a complete isolation boundary** (see F-02), and the audit-pack signature still covers some client-editable fields. Live runner egress stays disabled unless enforced at the infrastructure level (`S4_TEST_RUNNER_EGRESS_ENFORCED`).

---

## 2. Findings & Remediation Status

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|-------------|
| F-01 | Live API keys in repository | **P0** | ✅ Resolved | Keys rotated; `.env.example` contains only placeholders. `.gitignore` enforces exclusion of `.env*` files. |
| F-02 | Remote Code Execution via `/api/run-tests` | **P0** | ⚠️ Mitigated (not closed) | esbuild in-process bundling + Node Permission Model (`--permission`; no child-process/worker/native-addon escape) + a **network-egress guard** preloaded into the child (`__netguard.mjs`) that blocks the common JS egress paths (TCP, the `dgram` factory + `dgram.Socket` constructor, DNS, `fetch`, `process.binding`). This is **defense-in-depth, not a complete isolation boundary** — a code-level monkey-patch is not a kernel/infra guarantee, and Node's permission model does not restrict the network on the current runtime. Live egress stays disabled unless enforced at the infrastructure level (`S4_TEST_RUNNER_EGRESS_ENFORCED`); a fully isolated runner service is the roadmap gold standard. |
| F-03 | SAP credentials stored in cleartext | **P0** | ✅ Resolved | AES-256-GCM encryption via `S4_ENCRYPTION_KEY`. Credentials in server-only `s4_credentials` collection. |
| F-04 | Missing admin check on email routes | **P1** | ✅ Resolved | `verifyAdminRequest()` + email format validation on all 3 mail routes. |
| F-05 | SSRF filter bypass | **P1** | ✅ Resolved | Async DNS resolution, full IPv4/v6 CIDR blocking, `safeFetch()` with IP pinning and redirect re-validation. |
| F-06 | Client-side quota enforcement | **P1** | ✅ Resolved | Atomic Firestore transaction via `reserveTransformationQuota()` server-side. |
| F-07 | Live tenant (BYOT) endpoints unsecured | **P1** | ✅ Resolved | Gated S/4HANA credentials, test connection, and metadata API endpoints behind `assertS4TenantAccess()` role check. |
| F-08 | Client-side GDPR account erasure orchestration | **P1** | ✅ Resolved | Replaced client-side delete routines with transaction-backed server-side deletion route `/api/account/delete`. |
| F-09 | Decorative-only email approval HMAC checks | **P1** | ✅ Resolved | Transitioned email activation/approval hooks to server-side cryptographic HMAC token re-validation routes. |
| F-10 | Vulnerability to HTML Injection in transactional emails | **P2** | ✅ Resolved | Added HTML escaping for all interpolated user fields inside the transactional email templates. |
| A-01 | Orphaned Firebase Auth user after pilot registration reject | **P2** | ✅ Resolved | `approveUserWithToken` reject branch now deletes the Firebase Auth user via `getAuth().deleteUser(uid)`. Idempotent: `auth/user-not-found` is silently ignored. |
| F-15 | `/api/test/seed` admin escalation behind single env gate | **P2** | ✅ Resolved | Defense-in-depth: 3 independent gates (NODE_ENV, emulator flag, secret header). Returns 404 in production. CI assertion prevents accidental deployment with emulator flag. |
| F-05n | Email registration missing Bearer token on `/api/request-pilot` | **P2** | ✅ Resolved | Password sign-up now calls `getIdToken()` and sends `Authorization: Bearer` header, matching the Google sign-in flow. |
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
- Protected admin routes: `/api/send-approval-email`, `/api/send-tenant-approval-email`, `/api/send-tenant-revoke-email`
- Non-admin tokens receive **403** (not 401) — fail-closed.
- Recipient email addresses are format-validated (defense-in-depth).

### 3.3 Firestore Security Rules
- All collections enforce `isAuthenticated()` for reads.
- **Hardened Onboarding (F-06 Härtung)**: Direct creation of profiles in `/users/{userId}` is permitted but strictly gated:
  - Non-admin users are restricted to a strict keys allowlist (`userClientCreateKeys()`) and safe default values (`tier == 'pilot'`, `status == 'pending'`, `isAdmin == false`, `transformationsUsed == 0`, `transformationsLimit == 5`, `maxTeamMembers == 1`, `s4TenantAccessAllowed == false`, `mfaEnabled == false`).
  - Creation requires `orgId == null` to prevent unauthorized tenant assignments.
- **Field-Level Protection**: Client-side updates to user profiles are restricted to an allowlist of uncritical fields (`userClientUpdateKeys()`: firstName, lastName, theme, defaultView, etc.). Modifying status, tier, transformationsLimit, s4 access, or mfaEnabled directly from the client is blocked.
- **Project Isolation**: Direct creation and updates of `/projects/{projectId}` are restricted to `projectAllowedKeys()`. The `orgId` on projects is validated to match the user's profile `orgId`, preventing cross-tenant project modifications.
- **No Existential Leakage**: Read rules across collections do not permit `resource == null` checks, preventing unauthenticated clients from probing for document existence.
- **Server-Only Credentials**:
  - `s4_credentials/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.
  - `mfa_secrets/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.

### 3.4 Onboarding Link Cryptography (F-09)
- Action-bound approval/rejection links (sent via Resend) are protected by a cryptographically signed HMAC token.
- Tokens are bound to the specific `uid`, `requestType` (e.g. pilot, tenant), and `action` (e.g. approve, reject), and carry a 7-day expiration time (`exp`).
- Signature verification uses Node's `crypto.createHmac('sha256')` with `timingSafeEqual` comparison to eliminate timing side-channel attacks.
- Fail-closed behavior is enforced: if `PILOT_APPROVAL_SECRET` is missing or less than 16 characters, token creation/verification fails immediately.
 
### 3.5 Two-Factor Authentication (MFA) — Server-Side (Option B)
- **Architecture**: Enforces custom application-level MFA verification on the server-side, preventing raw secrets from leaking to the client bundle.
- **MFA Session Cookie (HTTP-only)**: A cryptographically signed and encrypted `mfa_session` cookie is set upon successful MFA verification (TOTP or backup code). All protected API routes (Gemini, Test Runner, S/4 HANA connections) assert that this cookie is valid, belongs to the calling user, and is not expired (max 12 hours).
- **MFA Step-up Verification**: Sensitive actions (GDPR deletion, disabling MFA, admin console actions) enforce recent re-authentication and recent MFA verification (max 5 minutes).
- **Storage & Cryptography**:
  - **Encrypted TOTP Secret**: Stored in the private `/mfa_secrets/{uid}` collection. Secrets are encrypted using AES-256-GCM under the `S4_ENCRYPTION_KEY` env var.
  - **Salt & Pepper Recovery Backup Codes**: Stored in `/mfa_secrets/{uid}`. Backup codes are hashed using a unique cryptographically random salt and a server-side pepper (`MFA_BACKUP_CODE_PEPPER`), compared timing-safely to protect against timing attacks.
  - **Pending Setup Storage**: MFA secrets generated during `/setup/start` are stored encrypted in a temporary `/mfa_pending/{uid}` collection with a 10-minute expiration, preventing client-side secret injection.

### 3.6 Admin Governance & Logging
- **Console API Routes**: All administrative tasks (user approval/revocation, S/4 HANA access grant/revocation, profile deletion) are routed through secure, server-side APIs (such as `/api/admin/console-action`), preventing direct client-side writes to Firestore.
- **Audit Logging**: Every administrative action is automatically logged to the `audit_events` collection, capturing the actor's UID/email, action type, target UID, and timestamp.
- **Admin Verification**: Access requires valid admin credentials, recent re-auth (< 5 min), and active MFA session verification.

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

## 7. Test Runner Sandbox (F-02)

### Architecture
```
Client (Testing Page)
  │
  ▼  POST /api/run-tests { code, tests, s4Environment }
  │
Server (API Route)
  │  1. verifyRequestAuth(req)
  │  2. Load esbuild (fail-closed if unavailable)
  │  3. Resolve Node Permission Model flag (fail-closed if Node < 22.8)
  │  4. Bundle user code via esbuild (in-process, no shell)
  │  5. Load S4 credentials server-side via loadS4ConfigForUser(uid)  ← F-03
  │  6. Spawn child process with --permission flag:
  │     --allow-fs-read={sandboxDir,node_modules}
  │     --allow-fs-write={sandboxDir}
  │     → child_process, worker_threads, native addons: BLOCKED
  │     --import __netguard.mjs
  │     → outbound network (net/dgram/dns/fetch/process.binding): BLOCKED  ← F-01 egress guard
  │  7. Parse TAP output, return results
  ▼
  Ephemeral sandbox directory (cleaned up in finally block)
```

### Security Properties
- **No shell execution**: `spawn()` with explicit args array, never `exec()` or shell strings.
- **Common network-egress paths blocked**: a preloaded guard (`__netguard.mjs`, via `--import`) neutralises `net.Socket.prototype.connect`, `net.connect`/`createConnection`, the `dgram` factory and the `dgram.Socket` constructor (incl. `prototype.send`/`bind`/`connect`), global `fetch`, `process.binding`, and every `dns` entry point (c-ares `resolve*` + getaddrinfo `lookup` + `dns.promises` + `Resolver`, which bypass `net.Socket`) before the test bundle loads. This blocks the usual JS egress routes to the GCP metadata endpoint (`169.254.169.254`) and the network, but it is a **code-level guard, not a kernel/infra boundary** — Node's permission model is explicitly not a security guarantee against malicious code, so treat the runner as defense-in-depth, not a sandbox for untrusted code. Skipped only when infra-level egress enforcement is active (`S4_TEST_RUNNER_EGRESS_ENFORCED`). A fully isolated runner service remains the roadmap gold standard.
- **Fail-closed**: Without esbuild or Node >= 22.8, route returns HTTP 500 (no silent unsafe fallback).
- **Minimal environment**: Child process receives only `PATH`, `SYSTEMROOT`, `NODE_ENV=test`, and S4 env vars.
- **S4 credentials**: Never from request body — always loaded server-side from encrypted store (F-03 closure).
- **Output cap**: Stdout/stderr limited to prevent memory exhaustion.
- **Timeout**: Child process killed after timeout.

### Requirements
- Node.js >= 22.8 (for `--experimental-permission` / `--permission` flag)
- `esbuild` in devDependencies

---

## 8. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Server-side Gemini API calls |
| `RESEND_API_KEY` | Yes | Transactional email sending (approval/revoke mails) |
| `NEXT_PUBLIC_APP_URL` | Yes | Self-referential URLs (prevents Host header injection) |
| `S4_ENCRYPTION_KEY` | Yes (if S4 features used) | AES-256-GCM key for credential encryption |
| `S4_HOST_ALLOWLIST` | Recommended | Comma-separated SAP host suffixes for SSRF allowlist |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | For Admin SDK | JSON service account key |
| `NEXT_PUBLIC_FIRESTORE_DB_ID` | Yes | Named Firestore database ID |

> **⚠️ NEVER commit `.env`, `.env.local`, or any file containing live keys to Git.**

---

## 9. Runtime Requirements

| Requirement | Value | Reason |
|-------------|-------|--------|
| Node.js | >= 22.8 | Permission Model for test runner sandbox (F-02) |
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
| `authDomain` | `firebase-applet-config.json` | `cleancore-491216.firebaseapp.com` | Must match the domain in `frame-src` and `script-src`. Changing to a custom domain (e.g. `clean-core.io`) requires a Firebase Hosting reverse proxy — a Next.js rewrite is **not sufficient** because it breaks `postMessage` communication. |
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
- The AI narrative is **not** part of the signed run payload — it is referenced by a separate `responseHash` and stored unsigned, so deterministic evidence and free-text narrative are cleanly separated. Architect sign-off recorded in the pack is **self-attested** (from the signed-in user's own session), not a formally governed organizational approval.

> **Known residual (roadmap):** architect sign-off is recorded client-side (self-attestation) rather than through a server-side sign-off route with an immutable event log. Owner-writes to sign-off fields are constrained by `firestore.rules`, and the audit pack labels the attestation as self-attested. A server-authoritative sign-off endpoint + org/role model is deferred (see `docs/ROADMAP-2.0.md`) — it adds cost without matching the current single-user community audience.

---

## 15. Operational Readiness

- **Health probe:** `GET /api/health` (liveness + config presence; `?deep=1` adds a Firestore ping) for Cloud Run checks and uptime monitoring. Returns 503 when misconfigured; response is minimal (no per-check disclosure).
- **GDPR Art. 17 erasure:** `deleteUserDataAndAccount()` purges every collection in `docs/DATA-RETENTION.md`, including the `runs` subcollection and encrypted BYOK keys (`user_secrets`) via `recursiveDelete`. Completeness is enforced by an automated test (`tests/security-compliance.spec.ts`).
- **Data retention & residency:** documented per-collection in `docs/DATA-RETENTION.md`; all data in Firestore **europe-west1 (EU)**. Public transparency page at `/trust`.
- **Incident response:** `docs/INCIDENT-RESPONSE.md` — severity classes, key-compromise / data-breach (GDPR 72h) / exposed-seed runbooks, blameless post-mortem.
- **Supply-chain hygiene (CI):** `.github/workflows/security-ci.yml` runs secret scanning (gitleaks), dependency audit (`npm audit --audit-level=high`, blocking), and a CycloneDX SBOM on PRs, deploy-branch pushes, and weekly.

