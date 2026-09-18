# Data Retention & Backup Policy

**Version 1.0 · Clean-Core.io**

Single source of truth for what data Clean-Core.io stores, where, for how long, and how it is deleted and backed up. Retention is verified by the automated GDPR Art. 17 test (`tests/security-compliance.spec.ts`) which asserts the deletion cascade covers every collection listed here. The claims this file makes about *infrastructure* — backup schedules, the `rate_limits` TTL policy, log retention, point-in-time recovery — are checked against the live project by **`npm run retention:verify`**; see Backups below for why that command exists.

## Storage location

Production data lives in **Google Cloud Firestore**, project `cleancore-491216`, database `clean-core-eu`, region **europe-west1 (Belgium, EU)**.

The non-production databases have not moved yet: test (`…39b46c45…`) and dev (`…030e1ee1…`) are still in **us-west1**, a leftover from the original prototype provisioning that also applied to production until the migration on 2026-08-20. They hold test data only; migrating them is tracked in `docs/BACKLOG.md`.

Two sub-processors receive data in transit for the features that require them — the **Google Gemini API** (your ABAP source, for analysis and transformation) and **Resend** (email address, for transactional mail) — and may process it outside the EU under their own terms; neither is used as a persistent store.

## Collection registry

| Collection | Contents | Owner key | Retention | Deleted on account erasure? |
|---|---|---|---|---|
| `users/{uid}` | Profile, tier, quota counters | uid | Life of account | ✅ direct |
| `projects/{id}` | Project metadata, `legacyCode`, pointers | `userId` | Life of account | ✅ recursiveDelete |
| `projects/{id}/runs/{runId}` | Immutable signed analysis runs (evidence + narrative) | `userId` | Life of account (immutable while retained) | ✅ via project recursiveDelete |
| `projects/{id}/invitations/{id}` | Read-by-invitation grants: the **invited email address**, inviter uid/name, invited/expiry/acceptance/revocation times, status, accepting uid+email | parent project `userId`; invited `email` | Life of the project (expiry ends the grant, not the record) | ✅ **owner:** via project recursiveDelete · **invited reader:** every invitation naming their address is deleted (not marked `revoked` — that would leave the address behind), and their uid is removed from `projects/{id}.readers` |
| `abap_examples/{id}` | User-saved ABAP snippets | `userId` | Life of account | ✅ query delete |
| `support_tickets/{id}` | Support messages | `userId` | Life of account | ✅ query delete |
| `files/{id}` | Uploaded file metadata | `userId` | Life of account | ✅ query delete |
| `user_secrets/{uid}/providers/*` | **Encrypted BYOK Gemini keys** (AES-256-GCM) | uid | Life of account | ✅ recursiveDelete |
| `s4_credentials/{uid}` | **Encrypted S/4HANA creds** (AES-256-GCM) | uid | Life of account | ✅ direct |
| `mfa_secrets/{uid}` | **Legacy** (until roadmap 0.13): application-level TOTP secret + hashed backup codes — no longer written; emptied by enrolment, disablement, `scripts/mfa-reset.ts` and deletion | uid | Until the account enrols Firebase's factor or is deleted | ✅ direct |
| `mfa_pending/{uid}` | **Legacy** in-flight enrolment of the application-level TOTP — no longer written | uid | Until emptied | ✅ direct |
| Firebase Auth multi-factor enrolment | TOTP factor (secret held by Firebase Authentication, never by this app) | uid | Life of account; removed by `/api/mfa/disable`, `scripts/mfa-reset.ts` or account deletion | ✅ deleted with the Auth user |
| `registration_requests/{uid}` | Pilot access requests | uid | Life of account | ✅ direct |
| `tenant_access_requests/{uid}` | BYOT access requests | uid | Life of account | ✅ direct |
| `survey_responses/{campaign}__{uid}` | Survey answers and the free-text comment beside them | `uid` | Life of account | ✅ query delete |
| `audit_events/{id}` | Admin/security audit log | server | **24 months** from the recorded action, then deleted (see note) | ❌ intentionally kept |
| `rate_limits/{key}` | Sliding-window counters. The document id is an HMAC-SHA256 of `gemini:<uid>:<ip>` under `RATE_LIMIT_PEPPER`, so no address is stored in readable form | composite (hashed) | Self-expiring: `expiresAt` drives a Firestore TTL policy, **created 2026-09-18** | ❌ no durable PII, auto-expires |

**`rate_limits` note:** `lib/rate-limit.ts` has written `expiresAt` since F-10 and its
comment said the field "drives a Firestore TTL policy … so windows self-delete instead
of accumulating forever". The policy did not exist. `gcloud firestore fields ttls list`
on `clean-core-eu` returned nothing until it was created on **2026-09-18**; the
documents had been accumulating since the field was introduced. A comment describing a
setting is not the setting — the pattern is the same one the Backups section below
records, and it is why both are now named with the command that proves them:
`npm run retention:verify` checks this policy is present and `ACTIVE` in the same run
that checks the backups.

**`audit_events` note:** deliberately excluded from erasure to preserve a tamper-evident record of privileged actions (approvals, deletions). Contains actor uid/email and action type — a legitimate-interest legal basis for security accountability. Reviewed for minimization; no analysis content stored.

The period is **24 months from the recorded action**, decided by the owner on **2026-09-18**. Until that decision this row said only "retained", which is not a retention period: Art. 13(2)(a) GDPR asks for the storage duration or, where none can be given, the criteria used to determine it, and a legal review flagged the omission. Twenty-four months covers two annual security reviews, so a privileged action stays traceable across both of them, while the administrator identities the record names do not outlive the reason for holding them.

The purge is **`scripts/purge-audit-events.ts`** — dry run by default, `--apply` deletes, `--older-than <months>` overrides the period, and every record it is about to delete is written to a JSON backup before anything is removed. It prints counts and document ids only; the backup holds the full records, including who acted, and must not be committed. The purge writes one record of itself, so the journal never loses entries silently.

It is run by hand today because nothing can be 24 months old yet: the first records are from 2026, so the earliest document reaches the period in 2028. **Automation must be in place before the first records reach 24 months (first possible: 2028)** — a period that depends on somebody remembering a command is no more a retention period than "retained" was.

## GDPR Art. 17 (Right to Erasure)

Account deletion runs the server-side cascade `deleteUserDataAndAccount(uid)` (`lib/firebase-admin.ts`), which purges every ✅ collection above (subcollections via `recursiveDelete`) and the Firebase Auth user. The cascade's completeness is enforced by an automated test that seeds every collection and asserts it is gone.

The cascade is all-or-nothing in one direction: the profile (`users/{uid}`) and the Auth user are deleted only after everything else is gone. If any step is refused, both are kept, the error names what is still stored, and the person can retry from a signed-in account (`tests/account-erasure.spec.ts`). The alternative — account gone, credentials left — cannot be retried, because the deletion endpoint requires a recent sign-in.

## Backups

- **Firestore managed backup schedules** on `clean-core-eu` (europe-west1), created 2026-09-18: a **daily** backup kept **7 days** and a **weekly** backup (Sunday) kept **28 days**. Nothing therefore survives beyond 30 days. Backups are encrypted at rest (Google-managed keys).
- **Point-in-time recovery** is enabled on the same database; its window is 7 days and it is independent of the schedules above.
- **Backup vs. erasure:** an Art. 17 deletion removes live data immediately; residual copies age out within the windows above and are not restored selectively. The privacy policy states the 30-day ceiling, and these settings are what make that statement true.

**What this section said until 2026-09-18, and why it was wrong.** It described
"Firestore scheduled exports (managed) to a dedicated GCS bucket", "30 days rolling"
and "restore is tested at least annually". None of it was configured.
`gcloud firestore backups schedules list` returned nothing, `gcloud firestore backups
list` returned nothing, and `gs://cleancore-491216-firestore-backup/` held exactly one
folder — `2026-08-20-pre-migration/`, a one-off export taken before the August move.
The only real protection was point-in-time recovery, seven days, and the privacy
policy was promising thirty.

It was found by checking the configuration while answering a legal review, not by a
test, which is the uncomfortable part: a retention policy is a document about
infrastructure, and nothing in this repository compared the two.

Something does now. **`npm run retention:verify`** (`scripts/retention-verify.ts`)
reads the expected values out of *this file* — the two schedules and their
retention, the ceiling above, the point-in-time recovery window, the region, the
`rate_limits` TTL field, the log bucket retention below — and asks the project what
is actually configured, then prints a verdict per claim and exits non-zero on any
disagreement. It holds its own copy of nothing: a checker with its own numbers is a
third place for them to drift, and the one place that would still look right while
the other two disagreed.

It is read-only by construction — every call is a `list` or a `describe`, and
`tests/retention-verify.spec.ts` fails if a mutating command ever appears in it.
Configuring a backup is a deliberate human act; a script that could "fix"
production to match this document would make the document true in the wrong
direction. It needs a developer's `gcloud` login and is therefore **not in CI**,
for the same reason `npm run rules:verify` is not. Run it whenever this section
changes, and before any statement about retention leaves the building.

- **Restore has not been tested yet.** The first scheduled backups appear on
  2026-09-19. An untested backup is not a backup; a restore drill into a scratch
  database belongs in the next operations step, and this line stays here, saying so,
  until it has run. Nothing automated can check this one: `npm run retention:verify`
  can prove a backup exists and cannot prove anybody has ever restored it.

## Logs

- **Cloud Run request and error logs** — the one place a visitor's IP address is
  written down — land in the Cloud Logging bucket `_Default` of project
  `cleancore-491216`, where they are kept **30 days** and are then deleted by
  Google. That is the number section 9 of the privacy notice states to users, and
  `npm run retention:verify` reads it back.
- `_Required` is a different bucket, holding Google's own Admin Activity audit
  logs — who changed a setting in the project, not who visited the site. Its
  retention is fixed by Google at **400 days** and cannot be shortened. It is named
  here so that the two are never read as one: checking `_Required`, seeing 400 days
  and calling the log question answered would say nothing at all about how long
  visitor IP addresses are kept.
- Application logs are structured JSON written by `lib/logger.ts` and carry ids and
  metadata only, never request bodies or secrets (`docs/OPERATIONS.md`). They share
  the `_Default` bucket and therefore the same 30 days.

## Review

This policy is reviewed on each release that adds a collection. Adding a Firestore collection **requires** adding a row here and extending the deletion cascade + test in the same change.
