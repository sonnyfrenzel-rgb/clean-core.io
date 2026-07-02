# Data Retention & Backup Policy

**Version 1.0 · Clean-Core.io**

Single source of truth for what data Clean-Core.io stores, where, for how long, and how it is deleted and backed up. Retention is verified by the automated GDPR Art. 17 test (`tests/security-compliance.spec.ts`) which asserts the deletion cascade covers every collection listed here.

## Storage location

All persistent data lives in **Google Cloud Firestore**, project `cleancore-491216`, region **europe-west1 (Belgium, EU)**. Per-environment databases: prod `ai-studio-e57d33e3…`, test `…39b46c45…`, dev `…030e1ee1…`. No user data leaves the EU region.

## Collection registry

| Collection | Contents | Owner key | Retention | Deleted on account erasure? |
|---|---|---|---|---|
| `users/{uid}` | Profile, tier, quota counters | uid | Life of account | ✅ direct |
| `projects/{id}` | Project metadata, `legacyCode`, pointers | `userId` | Life of account | ✅ recursiveDelete |
| `projects/{id}/runs/{runId}` | Immutable signed analysis runs (evidence + narrative) | `userId` | Life of account (immutable while retained) | ✅ via project recursiveDelete |
| `abap_examples/{id}` | User-saved ABAP snippets | `userId` | Life of account | ✅ query delete |
| `support_tickets/{id}` | Support messages | `userId` | Life of account | ✅ query delete |
| `files/{id}` | Uploaded file metadata | `userId` | Life of account | ✅ query delete |
| `user_secrets/{uid}/providers/*` | **Encrypted BYOK Gemini keys** (AES-256-GCM) | uid | Life of account | ✅ recursiveDelete |
| `s4_credentials/{uid}` | **Encrypted S/4HANA creds** (AES-256-GCM) | uid | Life of account | ✅ direct |
| `mfa_secrets/{uid}` | TOTP secret + hashed backup codes | uid | Life of account | ✅ direct |
| `mfa_pending/{uid}` | In-flight MFA enrolment | uid | Transient (until confirmed) | ✅ direct |
| `registration_requests/{uid}` | Pilot access requests | uid | Life of account | ✅ direct |
| `tenant_access_requests/{uid}` | BYOT access requests | uid | Life of account | ✅ direct |
| `audit_events/{id}` | Admin/security audit log | server | **Retained** for security accountability (see note) | ❌ intentionally kept |
| `rate_limits/{key}` | Sliding-window counters (`gemini:<uid>:<ip>`) | composite | Self-expiring (window) | ❌ no durable PII, auto-expires |

**`audit_events` note:** deliberately excluded from erasure to preserve a tamper-evident record of privileged actions (approvals, deletions). Contains actor uid/email and action type — a legitimate-interest legal basis for security accountability. Reviewed for minimization; no analysis content stored.

## GDPR Art. 17 (Right to Erasure)

Account deletion runs the server-side cascade `deleteUserDataAndAccount(uid)` (`lib/firebase-admin.ts`), which purges every ✅ collection above (subcollections via `recursiveDelete`) and the Firebase Auth user. The cascade's completeness is enforced by an automated test that seeds every collection and asserts it is gone.

## Backups

- **Firestore scheduled exports** (managed) to a dedicated GCS bucket in europe-west1.
- Backup retention: 30 days rolling. Backups are encrypted at rest (Google-managed keys).
- **Restore is tested** at least annually (an untested backup is not a backup); result recorded in the ops log.
- **Backup vs. erasure:** an Art. 17 deletion removes live data immediately; residual copies in backups age out within the 30-day window and are not restored selectively. This lawful basis/timeline is disclosed to users on request.

## Review

This policy is reviewed on each release that adds a collection. Adding a Firestore collection **requires** adding a row here and extending the deletion cascade + test in the same change.
