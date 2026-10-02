# Data Retention & Backup Policy

**Version 1.0 · Clean-Core.io**

Single source of truth for what data Clean-Core.io stores, where, for how long, and how it is deleted and backed up. The deletion cascade is exercised by the automated GDPR Art. 17 tests (`tests/security-compliance.spec.ts` for the owner and the invited-reader cascades, `tests/account-erasure.spec.ts` for the all-or-nothing order); they seed the collections that hold secrets, code and runs, not every row of the registry below. The claims this file makes about *infrastructure* — backup schedules, the `rate_limits` TTL policy, log retention, point-in-time recovery — are checked against the live project by **`npm run retention:verify`**; see Backups below for why that command exists.

## Storage location

Production data lives in **Google Cloud Firestore**, project `cleancore-491216`, database `clean-core-eu`, region **europe-west1 (Belgium, EU)**.

The non-production databases have not moved yet: dev (`…030e1ee1…`) is still in **us-west1**, a leftover from the original prototype provisioning that also applied to production until the migration on 2026-08-20; so is the database of the retired test lane (`…39b46c45…`), which no service has used since `clean-core-test` was deleted on 2026-08-31 (checked with `gcloud firestore databases list` on 2026-10-02). They hold test data only; migrating them is tracked in `docs/BACKLOG.md`.

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
| `user_secrets/{uid}/providers/*` | **Encrypted BYOK Gemini keys** (AES-256-GCM under `BYOK_ENCRYPTION_KEY`, key version recorded and bound with uid and provider into the additional data; never `S4_ENCRYPTION_KEY`) | uid | Life of account | ✅ recursiveDelete |
| `s4_credentials/{uid}` | **Encrypted S/4HANA creds** (AES-256-GCM) | uid | Life of account | ✅ direct |
| `mfa_secrets/{uid}` | **Legacy** (until roadmap 0.13): application-level TOTP secret + hashed backup codes — no longer written; emptied by enrolment, disablement, `scripts/mfa-reset.ts` and deletion | uid | Until the account enrols Firebase's factor or is deleted | ✅ direct |
| `mfa_pending/{uid}` | **Legacy** in-flight enrolment of the application-level TOTP — no longer written | uid | Until emptied | ✅ direct |
| Firebase Auth multi-factor enrolment | TOTP factor (secret held by Firebase Authentication, never by this app) | uid | Life of account; removed by `/api/mfa/disable`, `scripts/mfa-reset.ts` or account deletion | ✅ deleted with the Auth user |
| `projects/{id}/process_revisions/{n}`, `process_states/{id}`, `repairDrafts/{id}` | Saved BPMN revisions, process states and repair drafts of the project | parent project `userId` | Life of the project | ✅ via project recursiveDelete |
| `consent_events/{id}` | Append-only Terms/Privacy acceptance: uid, email, terms version, content hash, locale, source, server time (`lib/consent.ts`) | `userId` | Life of account | ✅ query delete |
| `registration_requests/{uid}` | Pilot access requests | uid | Life of account | ✅ direct |
| `tenant_access_requests/{uid}` | BYOT access requests | uid | Life of account | ✅ direct |
| `tenant_access_nonces/{uid}` | One-time nonce of a pending tenant-approval link | uid | Until used or replaced | ✅ direct |
| `s4_proxy_capabilities/{id}` | Capability of one live test run: project id, uid, tenant host, run id, request counter, expiry — never a credential (`lib/s4-proxy-capability-store.ts`) | `uid` | Deleted when the run returns; written only by the live test path, which is locked (`SECURITY.md` §7.1). Each document carries `expiresAt` (the capability's own expiry, at most ten minutes after issue) for a Firestore TTL policy to sweep what a crashed run left behind; the policy is created by hand (`gcloud firestore fields ttls update expiresAt --collection-group=s4_proxy_capabilities --enable-ttl --database=clean-core-eu --project=cleancore-491216`) and was **not yet in place** on 2026-10-02 | ✅ query delete by `uid` (since 2026-10-02) |
| `survey_campaigns/{campaign}` | Campaign metadata: name, send and close dates, invitation count — no address | none | Kept for the campaign record | — (no personal data) |
| `survey_responses/{campaign}__{uid}` | Survey answers and the free-text comment beside them | `uid` | Life of account | ✅ query delete |
| `email_sends/{campaign}__{uid}` | Bulk-mail outbox: recipient address, uid, send state per campaign | `uid` | Life of account | ✅ query delete |
| `email_events/{messageId}` | Delivery log per sent mail: recipient address, subject, kind, delivery status | `uid` where the sender passed one (since 2026-10-02 also on the operator's signup notification, whose subject names the account); recipient address in `to` | Life of account | ✅ query delete, by uid and by address; signup notifications written before they carried the uid, by their subject (built from the name in `registration_requests`) and kind |
| `email_suppressions/{sha256(address)}` | Opt-out list for community mail: the normalised address, list, source, time | hash of the address (document id); `uid` where an entry carries one | Until the address opts in again or its account is erased | ✅ by the hashed address, by the stored address and by uid (since 2026-09-30) |
| `usage_reports/{id}` | Weekly admin report snapshot. **Since 2026-09-30 figures only** — counts, analyses per newly activated account, failed mails per kind; no name, address, uid or recipient (`usageReportSnapshot`, `lib/usage-report.ts`). Older snapshots listed accounts by name and address | none (figures); older snapshots: address inside the lists | Kept for the trend | ✅ the account's entries are removed from older snapshots, by address; everybody else's stay (see note) |
| `audit_events/{id}` | Admin/security audit log | server | **24 months** from the recorded action, then deleted (see note) | ❌ intentionally kept |
| `rate_limits/{key}` | Sliding-window counters. The document id is an HMAC-SHA256 under `RATE_LIMIT_PEPPER` of the route-scoped key (`<route>:<uid and/or ip>`, e.g. `gemini:<uid>:<ip>`), so no address is stored in readable form | composite (hashed) | Self-expiring: `expiresAt` drives a Firestore TTL policy, **created 2026-09-18** | ❌ no durable PII, auto-expires |

**`rate_limits` note:** `lib/rate-limit.ts` has written `expiresAt` since F-10 and its
comment said the field "drives a Firestore TTL policy … so windows self-delete instead
of accumulating forever". The policy did not exist. `gcloud firestore fields ttls list`
on `clean-core-eu` returned nothing until it was created on **2026-09-18**; the
documents had been accumulating since the field was introduced. A comment describing a
setting is not the setting — the pattern is the same one the Backups section below
records, and it is why both are now named with the command that proves them:
`npm run retention:verify` checks this policy is present and `ACTIVE` in the same run
that checks the backups.

**`usage_reports` note:** the weekly report — the mail and the snapshot stored beside
it — carries figures only since the owner's decision of **2026-09-30**; "who" is answered
by the admin panel, behind a login and a second factor. Snapshots written before that
date listed new accounts, newly activated accounts and accounts at their limit by name
and address, failed deliveries by recipient and provider text, and the administrator's
address as `recipient`. The account erasure removes the erased account's entries from
them. **`scripts/scrub-usage-report-snapshots.ts`** turns every old snapshot into the
current figures-only shape: dry run by default (counts and field names only, never a
value), `--apply` only together with `SCRUB_USAGE_REPORTS_CONFIRM=remove-personal-data`,
and it refuses to run in CI. It writes no backup, since a backup would be one more copy of
the data being removed. Whether and when it runs against production is the owner's
decision. Mails already sent sit in the administrator's mailbox and at the mail provider,
outside this database; no erasure reaches them.

**`email_suppressions` note:** removing the opt-out on erasure does not re-open
community mail to the address: the profile and the outbox records go in the same
cascade, so no send script has the address any more. A new account under the same
address starts without an opt-out, as any new account does.

**`audit_events` note:** deliberately excluded from erasure to preserve a tamper-evident record of privileged actions (approvals, deletions). Contains actor uid/email and action type — a legitimate-interest legal basis for security accountability. Reviewed for minimization; no analysis content stored.

The period is **24 months from the recorded action**, decided by the owner on **2026-09-18**. Until that decision this row said only "retained", which is not a retention period: Art. 13(2)(a) GDPR asks for the storage duration or, where none can be given, the criteria used to determine it, and a legal review flagged the omission. Twenty-four months covers two annual security reviews, so a privileged action stays traceable across both of them, while the administrator identities the record names do not outlive the reason for holding them.

The purge is **`scripts/purge-audit-events.ts`** — dry run by default, `--apply` deletes, `--older-than <months>` overrides the period, and every record it is about to delete is written to a JSON backup before anything is removed. It prints counts and document ids only; the backup holds the full records, including who acted, and must not be committed. The purge writes one record of itself, so the journal never loses entries silently.

It is run by hand today because nothing can be 24 months old yet: the first records are from 2026, so the earliest document reaches the period in 2028. **Automation must be in place before the first records reach 24 months (first possible: 2028)** — a period that depends on somebody remembering a command is no more a retention period than "retained" was.

## GDPR Art. 17 (Right to Erasure)

Account deletion runs the server-side cascade `deleteUserDataAndAccount(uid)` (`lib/firebase-admin.ts`), which purges every ✅ collection above (subcollections via `recursiveDelete`) and the Firebase Auth user. The cascade is exercised by `tests/security-compliance.spec.ts` and `tests/account-erasure.spec.ts`, which seed the collections that hold secrets, code and runs and assert they are gone.

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
