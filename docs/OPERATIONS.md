# Operations & Monitoring

**Clean-Core.io · reviewed for 3.0 on 02.10.2026** (the app version is `lib/version.ts`)

Operational runbook for running Clean-Core.io in production (Google Cloud Run, project `cleancore-491216`, region `europe-west1`). Complements `SECURITY.md`, `docs/DATA-RETENTION.md`, and `docs/INCIDENT-RESPONSE.md`.

## Health probe

`GET /api/health` — liveness/readiness for Cloud Run health checks and uptime monitors.
- Shallow (default): process up, `AUDIT_SIGNING_KEY` and `GEMINI_API_KEY` present, `BYOK_ENCRYPTION_KEY` usable, and — when set — `AUDIT_SIGNING_PRIVATE_KEY` loadable as an Ed25519 key → `200 {status:'ok'}`, else `503 {status:'degraded'}`. The signing key is checked for presence only, not for the 32-character minimum the signing routes enforce.
- Deep: `GET /api/health?deep=1` additionally reads Firestore — at most once per 10 s per instance, concurrent callers share one read.
- Minimal body by design: status, version, short commit and time; no per-check disclosure to unauthenticated callers.

## Structured logging

Critical routes emit structured JSON via `lib/logger.ts` (`{severity, message, service, time, route, ...}`). Cloud Logging parses `severity` and promotes the fields to `jsonPayload`, enabling log-based metrics and alerts. Never log secrets or request bodies — only ids and metadata.

Query examples:
```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name="clean-core" AND severity>=ERROR' \
  --limit=50 --freshness=1h --format='table(timestamp,severity,jsonPayload.route,jsonPayload.error)'
```

## Alerting (to configure)

Recommended Cloud Monitoring alert policies (one-time setup; requires a notification channel):

1. **5xx error rate** on the Cloud Run service (`run.googleapis.com/request_count`, `response_code_class="5xx"`) — threshold e.g. > 5 in 5 min.
2. **Log-based error metric** on `severity>=ERROR` from the structured logs → alert on spikes.
3. **Uptime check** hitting `https://clean-core.io/api/health` (expect 200).

Setup sketch:
```bash
# 1. Notification channel (email)
gcloud beta monitoring channels create --display-name="Ops" \
  --type=email --channel-labels=email_address=YOUR_EMAIL

# 2. Uptime check on /api/health, then an alert policy referencing the channel
#    (create via Console → Monitoring → Alerting, or `gcloud alpha monitoring policies create --policy-from-file=...`).
```

## Backups & restore

- **Firestore managed backup schedules** on `clean-core-eu` (europe-west1): a **daily** backup kept **7 days** and a **weekly** backup (Sunday) kept **28 days**; **point-in-time recovery** with a 7-day window on the same database. There is no export bucket. The authoritative description, and why an earlier version of this section described exports that never existed, is `docs/DATA-RETENTION.md` → Backups.
- Check the live configuration with `npm run retention:verify` (read-only, needs a developer's `gcloud` login, not in CI).
- **Restore has not been tested yet** (an untested backup is not a backup); a restore drill into a scratch database is the next operations step. Record the result in the ops log.
- Backup vs. GDPR erasure: Art. 17 deletions remove live data immediately; residual backup copies age out within 30 days (see `docs/DATA-RETENTION.md`).

## Firestore rules deployment (all databases)

Rules must be deployed to **every** database the app uses, not just `(default)`:
```bash
npm run deploy:rules   # deploys via firebase.rules-all-dbs.json, then records the result
npm run rules:check    # offline: is the working copy the text we recorded as live?
npm run rules:verify   # online: what is production actually serving? (needs the gcloud login)
npm run rules:record -- --pending "why"   # the rules changed and the deploy has to wait
npm run rules:record -- --deployed        # deployed by hand elsewhere; write it down
```
(A stale ruleset on the named production DB was the root cause of the v2.0 "empty Solution Design" incident — see CHANGELOG. It happened again, unnoticed, until 2026-09-16: production was serving the ruleset of 20 August, three tightenings behind the repository. That is why `docs/registers/rules-deployment.json` exists and why `npm run deploy:rules` now records as well as deploys.)

**Never in CI.** No workflow deploys the rules and none may query the Rules API; `tests/rules-deploy-order.spec.ts` fails if one starts to. CI holding credentials that can rewrite security rules is one bad merge from an open database.

## Switching a model provider off (T01, C11)

The Additional Agreement on Own Model Keys (clause 6) and the privacy policy (section 4) promise that, should a provider's contracting entity change or the basis for calling it cease, the operator stops calling that provider — without a fallback to another provider or to the platform key — and the step stops and says since when and why. Three server variables on the Cloud Run service do it, without a deploy:

| Variable | Value | Effect |
|---|---|---|
| `MODEL_PROVIDERS_SUSPENDED` | provider ids, comma-separated: `anthropic`, `gemini` | Every call to that provider stops before it is made (`/api/gemini`, the key save and key test routes, the stage availability). Stored keys stay until their owners delete them. |
| `MODEL_PROVIDERS_SUSPENDED_AT` | the day the calls stopped, `YYYY-MM-DD` | The date the notice C11 names. |
| `MODEL_PROVIDERS_SUSPENDED_REASON` | `contracting-entity`, `data-region` or `binding-decision` | The reason C11 names — the three reasons of `lib/legal/consent-texts.ts` (`anthropicSuspended.reasons`), in that order. |

```bash
gcloud run services update clean-core --region=europe-west1 --project=cleancore-491216 \
  --update-env-vars=MODEL_PROVIDERS_SUSPENDED=anthropic,MODEL_PROVIDERS_SUSPENDED_AT=2026-11-02,MODEL_PROVIDERS_SUSPENDED_REASON=data-region
```

With all three set for Anthropic, the step, the key routes and Settings show C11 word for word ("Calls to Anthropic have been suspended since {date}: {reason}. …", `lib/provider-suspension.ts`). Without a valid date or reason — or for Gemini, for which C11 has no wording — they show the generic sentence of `providerSuspendedMessage` (`lib/model-providers.ts`), which still says that nothing was sent and no other provider or key was used. Set the date and the reason together with the switch. The deploy merges its own variables into the service (`deploy-cloudrun`, default strategy) and does not touch these three. To lift the switch-off: `--remove-env-vars=MODEL_PROVIDERS_SUSPENDED,MODEL_PROVIDERS_SUSPENDED_AT,MODEL_PROVIDERS_SUSPENDED_REASON`.

## Secret rotation

Rotate on a defined cadence and after any suspected exposure: `AUDIT_SIGNING_KEY`, `AUDIT_SIGNING_PRIVATE_KEY` (move the old public key into `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED` so earlier packs keep verifying), `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `S4_ENCRYPTION_KEY`, `BYOK_ENCRYPTION_KEY` (versioned: add a new version to the key ring in `lib/byok-key.ts`, then retire the old one), `RATE_LIMIT_PEPPER` (resets the current windows), `PILOT_APPROVAL_SECRET`, the Firebase service account. `MFA_BACKUP_CODE_PEPPER` is retired with the backup codes: no code reads it and, since 02.10.2026, the deploy no longer passes it. Rotating `AUDIT_SIGNING_KEY` invalidates prior HMAC signatures — there is no key history for it yet (treat old packs as `integrity-only`); see `docs/INCIDENT-RESPONSE.md` R1.

## Deploy pipeline

`main`/`dev` push → GitHub Actions `deploy.yml` (`release` is retired and fails): `validate` (lint + build + type check + Playwright E2E on the Firestore emulator) and `security` (`npm audit --omit=dev --audit-level=high`) → `deploy-runner` (the isolated test runners, when `RUNNER_DEPLOY_ENABLED`) → `deploy` (Cloud Run app, its VPC egress per `APP_VPC_NETWORK` / `APP_VPC_SUBNET`; see `SECURITY.md` §7). `security-ci.yml` runs gitleaks + `audit-ci` + SBOM in parallel.
