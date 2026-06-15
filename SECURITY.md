# Security Architecture — Clean-Core.io Platform

> **Version:** 2.0 · **Date:** 2026-06-16 · **Classification:** Internal

---

## 1. Executive Summary

This document describes the security architecture and hardening measures implemented in the Clean-Core.io platform following a comprehensive security audit (Code Review 2026-06). All critical and high-severity findings (P0/P1) have been remediated.

---

## 2. Findings & Remediation Status

| ID | Finding | Severity | Status | Remediation |
|----|---------|----------|--------|-------------|
| F-01 | Live API keys in repository | **P0** | ✅ Resolved | Keys rotated; `.env.example` contains only placeholders. `.gitignore` enforces exclusion of `.env*` files. |
| F-02 | Remote Code Execution via `/api/run-tests` | **P0** | ✅ Resolved | Route permanently disabled (HTTP 503). Future: sandboxed Cloud Run Jobs. |
| F-03 | SAP credentials stored in cleartext | **P0** | ✅ Resolved | AES-256-GCM encryption via `S4_ENCRYPTION_KEY`. Credentials in server-only `s4_credentials` collection. |
| F-04 | Missing admin check on email routes | **P1** | ✅ Resolved | `verifyAdminRequest()` + email allowlist on all 3 mail routes. |
| F-05 | SSRF filter bypass | **P1** | ✅ Resolved | DNS resolution check, host allowlist, credential-in-URL block, internal TLD block. |
| F-06 | Client-side quota enforcement | **P1** | ✅ Resolved | Atomic Firestore transaction via `reserveTransformationQuota()` server-side. |

---

## 3. Authentication & Authorization Model

### 3.1 Firebase Auth
- All API routes require a valid Firebase ID Token via `Authorization: Bearer <token>`.
- Token verification uses Firebase Admin SDK (`verifyRequestAuth()`).

### 3.2 Admin Gating
- Admin routes use `verifyAdminRequest()` which checks:
  1. Valid Firebase ID token
  2. Email in the hardcoded admin allowlist (`lib/constants.ts`)
  3. `isAdmin: true` flag in the user's Firestore document
- Protected admin routes: `/api/send-approval-email`, `/api/send-rejection-email`, `/api/send-tenant-approval-email`

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
  │  2. isUrlSafe(body.url) — SSRF check
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
- **Storage**: Secret Manager or Vercel/Cloud Run encrypted env vars.
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
| 3 | IPv6 addresses blocked | `isUrlSafe()` |
| 4 | Encoded/obfuscated IPs blocked (hex, octal, decimal int) | `isUrlSafe()` |
| 5 | Cloud metadata endpoints blocked (169.254.169.254 etc.) | `isUrlSafe()` |
| 6 | Localhost variants blocked | `isUrlSafe()` |
| 7 | Internal TLDs blocked (.internal, .local, .localhost, .corp) | `isUrlSafe()` |
| 8 | Private IPv4 CIDR ranges blocked | `isUrlSafe()` |
| 9 | Host allowlist enforcement (`S4_HOST_ALLOWLIST`) | `isUrlSafe()` |
| 10 | DNS resolution → IP re-check (anti DNS-rebinding) | `isUrlSafeWithDNS()` |
| 11 | Redirect target validation (manual redirect following) | `safeFetch()` |

### Host Allowlist
- Configured via `S4_HOST_ALLOWLIST` env var (comma-separated suffixes).
- Default: `.s4hana.cloud,.hana.ondemand.com,.sapcloud.cn,sandbox.api.sap.com,.sap-api.com`
- Empty = blocklist-only mode (all public hosts allowed).

---

## 6. Quota Enforcement (F-06)

- **Server-side**: `reserveTransformationQuota(uid)` in `lib/firebase-admin.ts` performs an atomic Firestore transaction:
  1. Read `transformationsUsed` and `transformationsLimit`
  2. If `used < limit`: increment atomically and return success
  3. If `used >= limit`: reject without modification
- **Refund**: `refundTransformationQuota(uid)` decrements on AI call failure.
- **Client**: `incrementTransformations()` in `useUserProfile.ts` is a **no-op** — quota is only enforced server-side.

---

## 7. Remote Code Execution Prevention (F-02)

- `/api/run-tests` is permanently disabled (HTTP 503).
- Future architecture: Cloud Run Jobs with:
  - Minimal Service Account (no Firestore/Secret access)
  - No network egress
  - Ephemeral containers
  - Separate GCP project

---

## 8. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Server-side Gemini API calls |
| `GAMMA_API_KEY` | Optional | Alternate AI API key |
| `NEXT_PUBLIC_APP_URL` | Yes | Self-referential URLs |
| `S4_ENCRYPTION_KEY` | Yes (if S4 features used) | AES-256-GCM key for credential encryption |
| `S4_HOST_ALLOWLIST` | Optional | Comma-separated SAP host suffixes |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | For Admin SDK | JSON service account key |

> **⚠️ NEVER commit `.env`, `.env.local`, or any file containing live keys to Git.**

---

## 9. Security Checklist for New Features

- [ ] All API routes use `verifyRequestAuth()` or `verifyAdminRequest()`
- [ ] No user-supplied URLs are fetched without `isUrlSafe()` validation
- [ ] No credentials are stored in client-readable Firestore collections
- [ ] No user-supplied code is executed server-side
- [ ] Quota-affecting operations use atomic server-side transactions
- [ ] Admin-only operations check `verifyAdminRequest()` + email allowlist
- [ ] New env vars are documented in `.env.example` (without values)
