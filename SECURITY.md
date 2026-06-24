# Security Architecture — Clean-Core.io Platform

> **Version:** 3.3 · **Date:** 2026-06-24 · **Classification:** Internal

---

## 1. Executive Summary

This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform following a comprehensive security audit (Code Review 2026-06). All critical and high-severity findings (P0/P1) have been remediated.

---

## 2. Findings & Remediation Status

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|-------------|
| F-01 | Live API keys in repository | **P0** | ✅ Resolved | Keys rotated; `.env.example` contains only placeholders. `.gitignore` enforces exclusion of `.env*` files. |
| F-02 | Remote Code Execution via `/api/run-tests` | **P0** | ✅ Resolved | esbuild in-process bundling + Node Permission Model sandbox (`--permission`). Child process restricted to fs-only access. |
| F-03 | SAP credentials stored in cleartext | **P0** | ✅ Resolved | AES-256-GCM encryption via `S4_ENCRYPTION_KEY`. Credentials in server-only `s4_credentials` collection. |
| F-04 | Missing admin check on email routes | **P1** | ✅ Resolved | `verifyAdminRequest()` + email format validation on all 3 mail routes. |
| F-05 | SSRF filter bypass | **P1** | ✅ Resolved | Async DNS resolution, full IPv4/v6 CIDR blocking, `safeFetch()` with IP pinning and redirect re-validation. |
| F-06 | Client-side quota enforcement | **P1** | ✅ Resolved | Atomic Firestore transaction via `reserveTransformationQuota()` server-side. |
| F-07 | Live tenant (BYOT) endpoints unsecured | **P1** | ✅ Resolved | Gated S/4HANA credentials, test connection, and metadata API endpoints behind `assertS4TenantAccess()` role check. |
| F-08 | Client-side GDPR account erasure orchestration | **P1** | ✅ Resolved | Replaced client-side delete routines with transaction-backed server-side deletion route `/api/account/delete`. |
| F-09 | Decorative-only email approval HMAC checks | **P1** | ✅ Resolved | Transitioned email activation/approval hooks to server-side cryptographic HMAC token re-validation routes. |
| F-10 | Vulnerability to HTML Injection in transactional emails | **P2** | ✅ Resolved | Added HTML escaping for all interpolated user fields inside the transactional email templates. |

---

## 3. Authentication & Authorization Model

### 3.1 Firebase Auth
- All API routes require a valid Firebase ID Token via `Authorization: Bearer <token>`.
- Token verification uses Firebase Admin SDK (`verifyRequestAuth()`).

### 3.2 Admin Gating (F-04)
- Admin routes use `verifyAdminRequest()` which checks:
  1. Valid Firebase ID token
  2. Email in the hardcoded admin allowlist (`lib/constants.ts`)
  3. `isAdmin: true` flag in the user's Firestore document (REST lookup)
- Protected admin routes: `/api/send-approval-email`, `/api/send-tenant-approval-email`, `/api/send-tenant-revoke-email`
- Non-admin tokens receive **403** (not 401) — fail-closed.
- Recipient email addresses are format-validated (defense-in-depth).

### 3.3 Firestore Security Rules
- All collections enforce `isAuthenticated()` for reads.
- Privileged fields (`isAdmin`, `tier`, `transformationsUsed`, `transformationsLimit`, `s4TenantAccessAllowed`) are frozen for non-admin users.
- `s4_credentials/{uid}`: `allow read, write: if false;` — exclusively accessed via Admin SDK.

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
  │  7. Parse TAP output, return results
  ▼
  Ephemeral sandbox directory (cleaned up in finally block)
```

### Security Properties
- **No shell execution**: `spawn()` with explicit args array, never `exec()` or shell strings.
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

## 10. Security Checklist for New Features

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
