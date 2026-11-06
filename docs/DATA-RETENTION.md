# Data Retention & Backup Policy

**Version 1.0 · Clean-Core.io**

Single source of truth for what data Clean-Core.io stores, where, for how long, and how it is deleted and backed up. The deletion cascade is exercised by the automated GDPR Art. 17 tests (`tests/security-compliance.spec.ts` for the owner and the invited-reader cascades, `tests/account-erasure.spec.ts` for the all-or-nothing order); they seed the collections that hold secrets, code and runs, not every row of the registry below. The claims this file makes about *infrastructure* — backup schedules, the `rate_limits` TTL policy, log retention, point-in-time recovery — are checked against the live project by **`npm run retention:verify`**; see Backups below for why that command exists.

## Storage location

Production data lives in **Google Cloud Firestore**, project `cleancore-491216`, database `clean-core-eu`, region **europe-west1 (Belgium, EU)**.

The dev database (`…030e1ee1…`) has not moved yet: it is still in **us-west1**, a leftover from the original prototype provisioning that also applied to production until the migration on 2026-08-20. It holds test data only; migrating it is tracked in `docs/BACKLOG.md`. The owner confirmed on 2026-11-06 that it holds no real accounts and no copies of production data, which is why the privacy policy does not list it.

**Old databases (owner, 2026-11-05 and 2026-11-06).** The former production database `ai-studio-e57d33e3-…` in us-west1 — the source of the 2026-08-20 migration — was **deleted on 2026-11-05**: no service used it any more, and it had no backups. The three leftovers were **deleted by the owner on 2026-11-06**, after a check that no Cloud Run service referenced them: `ai-studio-d80950ff-…` and `ai-studio-39b46c45-…` (both us-west1, one document each, unused; the latter the database of the retired test lane, unused since `clean-core-test` was deleted on 2026-08-31) and the empty `clean-core-prod` (europe-west1). Each deleted database left the rules deploy target `firebase.rules-all-dbs.json` in the same change (`clean-core-prod` never was one). `gcloud firestore databases list` on 2026-11-06 shows `(default)`, `clean-core-eu` and the dev database only.

Two sub-processors receive data in transit for the features that require them — the **Google Gemini API** (your ABAP source, for analysis and transformation) and **Resend** (email address, for transactional mail) — and may process it outside the EU under their own terms; neither is used as a persistent store.

## Collection registry

| Collection | Contents | Owner key | Retention | Deleted on account erasure? |
|---|---|---|---|---|
| `users/{uid}` | Profile, tier, quota counters | uid | Life of account | ✅ direct |
| `projects/{id}` | Project metadata, `legacyCode`, pointers | `userId` | Life of account | ✅ recursiveDelete |
| `projects/{id}/runs/{runId}` | Immutable signed analysis runs (evidence + narrative) | `userId` | Life of account (immutable while retained) | ✅ via project recursiveDelete |
| `projects/{id}/invitations/{id}` | Read-by-invitation grants: the **invited email address**, inviter uid/name, invited/expiry/acceptance/revocation times, status, accepting uid+email | parent project `userId`; invited `email` | Life of the project (expiry closes an invitation nobody accepted, not the record; an accepted one grants reading until the owner withdraws it — `SECURITY.md` §3.7) | ✅ **owner:** via project recursiveDelete · **invited reader:** every invitation naming their address is deleted (not marked `revoked` — that would leave the address behind), and their uid is removed from `projects/{id}.readers` |
| `portfolio_batches/{id}` + `items/{id}` | Portfolio batch run (roadmap 3.0.21): owner, name, target, counts; per program its name, file name, status, project id, run id or failure reason — and **its ABAP source only until the step makes its project** (removed in the same write; removed when the batch is cancelled) | `userId` | Until the owner removes the record, or life of account | ✅ recursiveDelete (`lib/portfolio/erasure.ts`) |
| `portfolio_selections/{id}` + `invitations/{id}` | Named selection (a list of project ids, a name, the uids of accepted readers) and its e-mail-bound read invitations (invited address, as for projects) | `ownerId`; invited `email` | Until the owner deletes it, or life of account | ✅ **owner:** recursiveDelete · **invited reader:** uid removed from `readers`; invitations naming their address deleted by the collection-group sweep of `invitations` |
| `content_holds/{holdId}` + `held_documents/{path}` | **Content blocked after a report of illegal content** (Terms section 7, /report, privacy policy sections 2, 6, 8; legal texts Fassung 1.1; `lib/content-hold.ts`): the hold record — project id, owner uid, suspicion flags, the dated evidence log (blocked, police informed, authority decision, retention extended, released, deleted) — and, while held, every document of the blocked project moved there unchanged under its own path. No rule names the collection (default deny); no route returns `held_documents` | `ownerUid` | Held content: with a suspected offence until the authority has decided whether to secure it, at most **90 days** after it was informed unless it asked for longer, then deleted by the operator (the admin console lists what is due); without suspicion until the decision, then released or deleted. The record (no content): **six months** after release or deletion — `expiresAt`, for a TTL policy the owner creates (`--collection-group=content_holds`), **not yet in place** | ❌ kept until its period ends, also after the account is erased: the erasure does not touch it (the subcollection is deliberately not called `runs` or `invitations`, which the erasure sweeps by collection group). The profile's `contentBlocks` notice goes with the profile |
| `abap_examples/{id}` | User-saved ABAP snippets | `userId` | Life of account | ✅ query delete |
| `support_tickets/{id}` | Support messages | `userId` | Life of account | ✅ query delete |
| `files/{id}` | Uploaded file metadata | `userId` | Life of account | ✅ query delete |
| `write_ceilings/{uid}` | Per-account write ceiling of the browser's own creates (`lib/write-ceiling.ts`, `firestore.rules`): per kind (project, support ticket) a count, the start of its one-day window and the id of the last created document | uid | Life of account | ✅ direct |
| `user_secrets/{uid}/providers/*` | **Encrypted BYOK Gemini keys** (AES-256-GCM under `BYOK_ENCRYPTION_KEY`, key version recorded and bound with uid and provider into the additional data; never `S4_ENCRYPTION_KEY`) | uid | Life of account | ✅ recursiveDelete |
| `s4_credentials/{uid}` | **Encrypted S/4HANA creds** (AES-256-GCM) | uid | Life of account | ✅ direct |
| `mfa_secrets/{uid}` | **Legacy** (until roadmap 0.13): application-level TOTP secret + hashed backup codes — no longer written; emptied by enrolment, disablement, `scripts/mfa-reset.ts` and deletion | uid | Until the account enrols Firebase's factor or is deleted | ✅ direct |
| `mfa_pending/{uid}` | **Legacy** in-flight enrolment of the application-level TOTP — no longer written | uid | Until emptied | ✅ direct |
| Firebase Auth multi-factor enrolment | TOTP factor (secret held by Firebase Authentication, never by this app) | uid | Life of account; removed by `/api/mfa/disable`, `scripts/mfa-reset.ts` or account deletion | ✅ deleted with the Auth user |
| `projects/{id}/process_revisions/{n}`, `process_states/{id}`, `repairDrafts/{id}` | Saved BPMN revisions, process states and repair drafts of the project | parent project `userId` | Life of the project | ✅ via project recursiveDelete |
| `consent_events/{id}` | **Proof log** (privacy policy sections 2, 5, 6; Terms 1.3): append-only Terms/Privacy acceptance — uid, email, terms version, **language version accepted** and the SHA-256 of that language version's archived wording, locale, place, server time (`lib/consent.ts`); for a declaration with "Withdraw from / end the contract" (C13, Terms 13) a `withdrawal-declared` record (declaration word for word, contract, contract language, time of receipt) and a `withdrawal-receipt` record (sent or not, the time it was sent, the delivery record's message id), no name (`lib/withdrawal-declaration.ts`); after the contract ends also one `contract-ended` record (time and kind of the end, `withdrawal-function` for that path) | `userId`; after the end `accountHash` | While the contract runs `expiresAt` is null and `retention` names the rule; when it ends, `expiresAt` is set to 31 December of the third calendar year after the end (§§ 195, 199 BGB) and `expiresAt` drives the proof-log TTL policy | ❌ kept, **pseudonymised**: uid, email and locale are removed and the keyed hash of the address (`accountHash`, HMAC-SHA256 under `PSEUDONYM_PEPPER`, `lib/pseudonym.ts`) takes their place, with the end of the contract and its deletion date (`lib/proof-log-erasure.ts`) |
| `byok_agreement_events/{id}` | **Proof log** of the Additional Agreement on Own Model Keys (its clause 12): acceptance (version, language version, SHA-256 of that wording), blocking and ending (how it ended), server time — Admin SDK only, no client rule names it | `userId`; after the end `accountHash` | As `consent_events`: null while the contract runs, then 31 December of the third year after the end; `expiresAt` drives the proof-log TTL policy | ❌ kept, pseudonymised as `consent_events` |
| `erasure_notes/{accountHash}__{day}` | **Deletion note** "account (hash) deleted on [date]" (privacy policy sections 5 and 6): the keyed hash, the time and the kind of the end — nothing else | `accountHash` | Three years from the deletion; `expiresAt` drives the proof-log TTL policy | — (written by the erasure) |
| `registration_requests/{uid}` | Pilot access requests | uid | Life of account | ✅ direct |
| `tenant_access_requests/{uid}` | BYOT access requests | uid | Life of account | ✅ direct |
| `tenant_access_nonces/{uid}` | One-time nonce of a pending tenant-approval link | uid | Until used or replaced | ✅ direct |
| `s4_proxy_capabilities/{id}` | Capability of one live test run: project id, uid, tenant host, run id, request counter, expiry — never a credential (`lib/s4-proxy-capability-store.ts`) | `uid` | Deleted when the run returns; written only by the live test path, which is locked (`SECURITY.md` §7.1). Each document carries `expiresAt` (the capability's own expiry, at most ten minutes after issue) for a Firestore TTL policy to sweep what a crashed run left behind; the policy is created by hand (`gcloud firestore fields ttls update expiresAt --collection-group=s4_proxy_capabilities --enable-ttl --database=clean-core-eu --project=cleancore-491216`) and was **not yet in place** on 2026-10-02 | ✅ query delete by `uid` (since 2026-10-02) |
| `survey_campaigns/{campaign}` | Campaign metadata: name, send and close dates, invitation count — no address | none | Kept for the campaign record | — (no personal data) |
| `survey_responses/{campaign}__{uid}` | Survey answers and the free-text comment beside them | `uid` | Life of account | ✅ query delete |
| `email_sends/{campaign}__{uid}` | Bulk-mail outbox: recipient address, uid, send state per campaign | `uid` | Life of account | ✅ query delete |
| `email_events/{messageId}` | Delivery record per sent mail except the invitations (those are `invitation_delivery_records`, below, since 3.0.21): kind, message id, delivery status with its time, the provider's diagnostic with any address in it replaced by "[address]", and — **since 3.0.21 only as keyed hashes** (HMAC-SHA256 under `PSEUDONYM_PEPPER`, `lib/email-event-hashing.ts`) — the recipient address (`to`) and the subject (`subjectHash`); a mail to a CI test account carries `testRecipient`. No address and no subject in clear; without `PSEUDONYM_PEPPER` neither is kept (critical log line). Records written before carry both in clear until `scripts/hash-email-events.ts` rewrites them (one-off, owner; dry run first) | `uid` where the sender passed one (since 2026-10-02 also on the operator's signup notification); the keyed hash of the address in `to` | The open value `mailDeliveryRecordRetention` (**90 days**) after sending, privacy policy section 6: every record written since 3.0.21 carries `expiresAt` (`lib/email-events.ts`), and `expiresAt` drives the proof-log TTL policy. Records written before carry none; the erasure sets one, the rest need a one-off backfill (open, owner) | ❌ kept until their date, **pseudonymised**: `to` becomes the keyed hash of the account's address, uid, subject hash and provider text go (by uid, by address and by its keyed hash). The operator's signup notification about the account is deleted (by uid, and by its subject or subject hash for records without one) |
| `invitation_delivery_records/{messageId}` | Delivery record of each project and portfolio invitation mail (privacy policy sections 6 and 8, § 11 UWG; since 3.0.21): the keyed hash of the invited address (`recipientHash`, HMAC-SHA256 under `PSEUDONYM_PEPPER`), the inviting account (`inviterUid`), the kind (project or portfolio), the sending time, the provider's message id and the delivery status with its time — **no address, no subject, no provider text** (`lib/invitation-delivery-record.ts`; written by both invitation routes through `sendTransactionalMail`'s `deliveryRecord`, status from `POST /api/webhooks/resend`). Without `PSEUDONYM_PEPPER` no record is written (critical log line); the invitation still goes out | `inviterUid`; after the inviter's erasure `inviterHash` | Six calendar months after sending: every record carries `expiresAt`, and `expiresAt` drives the proof-log TTL policy | ❌ kept until its date: the inviter's uid becomes the keyed hash of its address (`lib/proof-log-erasure.ts`); without the pepper deleted. The invited person's record holds only the hash already |
| `email_suppressions/{keyed hash}` | Opt-out list for community mail: since 3.0.21 the document id is the keyed hash of the address (`hmac1_…`, `lib/pseudonym.ts`) and the entry holds list, source and time, **no address** (`app/api/unsubscribe/route.ts`). Older entries (`{sha256(address)}`, address in clear) are read as well (`scripts/send-survey.ts`) and replaced on erasure | the keyed hash (document id) | As long as community mail is sent, or until the person asks for the entry to be removed (privacy policy sections 2, 5 and 6, legal texts Fassung 1.1); lifted when the account switches community mail on again. A removal on request is the operator's manual delete of the document named by the keyed hash of the address | ❌ kept as the keyed hash only; a clear-text entry is replaced by a keyed one (`lib/proof-log-erasure.ts`) |
| `invitation_suppressions/{keyed hash}` | Opt-out list for invitations to a project or a portfolio (C10/C12, since 3.0.21): the document id is the keyed hash of the address (`hmac1_…`, `lib/invitation-suppression.ts`); the entry holds list, source and time, **no address** (`app/api/unsubscribe/invitations/route.ts`). Both invitation routes refuse an address on it | the keyed hash (document id) | As long as invitations are sent, or until the person asks for the entry to be removed (privacy policy sections 5, 6 and 8, C10/C12, legal texts Fassung 1.1); a removal on request is the operator's manual delete of the document named by the keyed hash of the address | ❌ kept as the keyed hash only; the erasure does not touch it |
| `usage_reports/{id}` | Weekly admin report snapshot. **Since 2026-09-30 figures only** — counts, analyses per newly activated account, failed mails per kind; no name, address, uid or recipient (`usageReportSnapshot`, `lib/usage-report.ts`). Older snapshots listed accounts by name and address | none (figures); older snapshots: address inside the lists | Kept for the trend | ✅ the account's entries are removed from older snapshots, by address; everybody else's stay (see note) |
| `audit_events/{id}` | Security log of administrative and self-service actions (see note): actor uid, action, subject uid or object id, time; the acting administrator's address on administrative rows only | `actorUid`, `targetUid` | **24 months** from the recorded action, then deleted (see note) | ❌ rows kept, **pseudonymised**: where the erased account is actor or subject its uid becomes the keyed hash and no address of it stays; another administrator's uid and address stay (`lib/audit-pseudonymisation.ts`) |
| `rate_limits/{key}` | Sliding-window counters. The document id is an HMAC-SHA256 under `RATE_LIMIT_PEPPER` of the route-scoped key (`<route>:<uid and/or ip>`, e.g. `gemini:<uid>:<ip>`), so no address is stored in readable form | composite (hashed) | Self-expiring: `expiresAt` drives a Firestore TTL policy, **created 2026-09-18** | ❌ no durable PII, auto-expires |
| `platform_model_budget/{YYYY-MM-DD}` | The community model key's call count for one UTC day, the cap in force and when the breaker opened (`lib/platform-model-budget.ts`) — no account, no content | — | Each document carries `expiresAt` (three days after its day) for a Firestore TTL policy; the policy is created by hand (`gcloud firestore fields ttls update expiresAt --collection-group=platform_model_budget --enable-ttl --database=clean-core-eu --project=cleancore-491216`) and was **not yet in place** on 2026-10-22 | ❌ no personal data |
| `model_receipt_uses/{jti}` | The first use of a model receipt by a store that checks it without its text: project id, artefact name, time (`lib/model-receipt-uses.ts`) — no account, no content | — | Each document carries `expiresAt` (two days after the receipt was issued) for a Firestore TTL policy, created by hand like the one above (`--collection-group=model_receipt_uses`); **not yet in place** on 2026-10-22 | ❌ no personal data |
| `test_run_locks/{uid}` | The account's one test-run slot and its runner seconds of the current UTC day: run id, start, lapse time, day, seconds (`lib/test-run-lock.ts`) — no content | `uid` (document id) | Overwritten by every run; the slot lapses on its own after three minutes | ✅ deleted by id |

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

**`email_suppressions` note:** until 3.0.21 the opt-out was removed on erasure
(owner decision 30.09.2026). The legal texts of Fassung 1.1 say otherwise — the
keyed hash stays on the list "so that we do not mail you again" (since the legal texts Fassung 1.1: as long as such mail is sent, or until the person asks for the entry to be removed)
— and the erasure follows them now. A request to remove an entry from either
suppression list (`email_suppressions`, `invitation_suppressions`) is handled and
confirmed to the person within one month of receipt (Art. 12(3) GDPR; privacy
policy sections 2, 5 and 8). There is no self-service path: the operator deletes
the document whose id is the keyed hash of the address given, and replies. The invitation opt-out list the texts also
name (privacy policy sections 5 and 8, C7) exists since 3.0.21 as
`invitation_suppressions` (above): both invitation mails carry an unsubscribe link.
The six-month invitation delivery record the texts name (sections 6 and 8) exists
since 3.0.21 as `invitation_delivery_records` (above). It is a collection of its own
rather than a kind of `email_events` record because the two have different periods
and shapes — `email_events` runs 90 days and carries the account's uid and the
provider's diagnostic; an invitation's record holds the keyed hash, the inviting
account and the status only and runs six months, and one collection with two shapes
would leave that to whichever writer came last. Since 3.0.21 `email_events` too holds
the address and the subject only as keyed hashes. Invitation mails sent before
05.11.2026 have an `email_events` record of the old shape (address and subject in
clear); `scripts/hash-email-events.ts` rewrites those to hashes, and they run out
after their 90 days either way.

**Reports of illegal content and blocked content (legal texts Fassung 1.1):** two data sets
with two periods. The **report itself** — the e-mail to info@clean-core.io with the
reporting person's name and address where given, and the operator's notes on it — lives
in the operator's mailbox, not in this database, and is kept **six months after the
examination is closed**, longer only while proceedings are pending (privacy policy
sections 2 and 6). The **blocked content** and the record of its block live in
`content_holds` (above) with their own periods. Deleting the report does not delete
the hold, and the end of a hold does not shorten the report's period.

## The proof log (3.0.21, acceptance tests T05/T06)

The privacy policy (sections 2, 5, 6), Terms 1.3 and the deletion dialog C7 promise
"proofs, not data": the record of an acceptance is kept apart from operational data,
nobody can change it afterwards, every entry carries its own deletion date, a nightly
routine deletes what has expired, and after the contract ends a keyed hash of the
address stands where account and address stood.

- **Records:** `consent_events`, `byok_agreement_events` (append-only, Admin SDK only),
  the deletion notes in `erasure_notes`, the pseudonymised delivery records in
  `email_events`, the invitation delivery records in `invitation_delivery_records`
  and opt-outs in `email_suppressions`.
- **Deletion date:** `expiresAt` on every record (`lib/proof-log.ts`,
  `lib/invitation-delivery-record.ts`): null while the contract runs (the date depends
  on the end), then 31 December of the third calendar year after the end; three years
  for a deletion note; 90 days after sending for a delivery record; six calendar months
  after sending for an invitation delivery record.
- **The nightly routine is Firestore TTL.** A TTL policy on `expiresAt` makes Firestore
  delete each document once that time has passed, typically within 24 hours. The five
  policies are created by hand, like the others in this file, and `npm run
  retention:verify` checks each one (the rows above that say "drives the proof-log TTL
  policy"):

  ```bash
  for c in consent_events byok_agreement_events erasure_notes email_events invitation_delivery_records; do
    gcloud firestore fields ttls update expiresAt --collection-group=$c --enable-ttl \
      --database=clean-core-eu --project=cleancore-491216
  done
  ```

  **Not yet in place on 2026-10-23** — until they are, nothing is deleted on its date.
- **Keyed hash:** HMAC-SHA256 under `PSEUDONYM_PEPPER` (a repository secret the deploy
  passes to Cloud Run; at least 32 characters). It must never be rotated without
  re-keying: a new pepper makes every kept hash unmatchable, and with it the proof.
  Without the secret an erasure deletes the proof records instead of keeping them with
  the address, and logs a critical line (`lib/firebase-admin.ts`).
- **Tests:** `tests/proof-log-3021.spec.ts` (server-free: periods, pseudonymisation,
  idempotence, opt-outs, the missing-pepper path), `tests/invitation-delivery-record.spec.ts`
  (server-free: the invitation record, its status, its erasure); `tests/account-erasure.spec.ts` and
  `tests/hardening-v220-cf.spec.ts` against the emulator.

**`audit_events` note:** kept through an erasure, pseudonymised, to preserve a tamper-evident record of who did what (legitimate interest, Art. 6(1)(f) GDPR; Art. 17(3)(e) GDPR). What a row holds, as the code writes it today:

- **Administrative actions** — granting or withdrawing administrator rights, approving (reinstating) or revoking (restricting) an account, granting or withdrawing the S/4HANA functions and deciding a tenant-access request, blocking an own model key or deleting it after the agreement ended in text form, deleting an account, removing a second factor (`scripts/mfa-reset.ts`), the runner self-test: the administrator's uid **and address** (`actorEmail`), the action, the affected account's uid (`targetUid`) and the time; the second-factor removal also the affected address (`targetEmail`), the number of factors removed and the operator's reason. The set is `PRIVILEGED_AUDIT_ACTIONS` in `lib/audit-pseudonymisation.ts`.
- **Self-service actions** — an account saving or deleting its own model key (a failed attempt and a failed key test too) or switching its automatic steps, its project commands (`app/api/projects/[projectId]/commands/route.ts`), withdrawing a reader (the reader's uid as subject) or an open invitation (the invitation id), adopting a repair draft: the account's uid, the action (with the project id where there is one), the subject and the time — **no address** since 3.0.21. Not recorded: signing in, sending or accepting an invitation, changing the profile, enrolling a second factor, deleting the own account.
- **Maintenance scripts** (`scripts/purge-audit-events.ts`, `scripts/pseudonymise-audit-events.ts`, the v2.3 quota migration) write rows naming no person.

**After an account is erased** (`deleteUserDataAndAccount`, `lib/firebase-admin.ts`), every row in which it is the actor or the subject keeps its action and time; its uid is replaced by the keyed hash the proof log names it by (HMAC-SHA256 under `PSEUDONYM_PEPPER` of its address, else of `uid:<uid>`; `erasedAccountPseudonym`), and its address (`actorEmail`, `targetEmail`) is removed (`auditRowErasureUpdate`). Another administrator's uid and address in the same row stay — they attribute a privileged act on the account to whoever made it. An administrator's deletion of an account writes its own row after the cascade, naming the account by the same hash. Without `PSEUDONYM_PEPPER` the rows naming the account are deleted instead (critical log line), as the proof records are. Until this change the erasure replaced only `actorEmail` with an unkeyed `acct_…` value and kept the uid.

**Legacy rows** — self-service rows written before 3.0.21 carry the account's address; rows of accounts erased before this change carry their uid and the `acct_…` placeholder. **`scripts/pseudonymise-audit-events.ts`** converts them with the same rule: dry run by default (counts only — no uid, no address, no document id), `--apply` rewrites, `--database <id>` (default `FIRESTORE_DB_ID`, i.e. `clean-core-eu`); it needs the deployment's `PSEUDONYM_PEPPER`, refuses to run in CI, stops when none of the accounts the log names exists (wrong target), treats an account as existing when it has a sign-in or a profile, and a second run changes nothing. **Whether and when it runs against production is the owner's decision; it has not been run.** Until it is, those legacy rows are as described.

The period is **24 months from the recorded action**, decided by the owner on **2026-09-18**. Until that decision this row said only "retained", which is not a retention period: Art. 13(2)(a) GDPR asks for the storage duration or, where none can be given, the criteria used to determine it, and a legal review flagged the omission. Twenty-four months covers two annual security reviews, so a privileged action stays traceable across both of them, while the administrator identities the record names do not outlive the reason for holding them.

The purge is **`scripts/purge-audit-events.ts`** — dry run by default, `--apply` deletes, `--older-than <months>` overrides the period, and every record it is about to delete is written to a JSON backup before anything is removed. It prints counts and document ids only; the backup holds the full records, including who acted, and must not be committed. The purge writes one record of itself, so the journal never loses entries silently.

It is run by hand today because nothing can be 24 months old yet: the first records are from 2026, so the earliest document reaches the period in 2028. **Automation must be in place before the first records reach 24 months (first possible: 2028)** — a period that depends on somebody remembering a command is no more a retention period than "retained" was.

## GDPR Art. 17 (Right to Erasure)

Account deletion runs the server-side cascade `deleteUserDataAndAccount(uid)` (`lib/firebase-admin.ts`), which purges every ✅ collection above (subcollections via `recursiveDelete`) and the Firebase Auth user, and pseudonymises the proof log, the delivery records and the opt-out (section "The proof log" above) instead of deleting them. The cascade is exercised by `tests/security-compliance.spec.ts` and `tests/account-erasure.spec.ts`, which seed the collections that hold secrets, code and runs and assert they are gone.

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
