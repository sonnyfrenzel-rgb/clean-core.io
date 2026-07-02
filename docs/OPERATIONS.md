# Operations & Monitoring

**Version 2.0.0 · Clean-Core.io**

Operational runbook for running Clean-Core.io in production (Google Cloud Run, project `cleancore-491216`, region `europe-west1`). Complements `SECURITY.md`, `docs/DATA-RETENTION.md`, and `docs/INCIDENT-RESPONSE.md`.

## Health probe

`GET /api/health` — liveness/readiness for Cloud Run health checks and uptime monitors.
- Shallow (default): process up + required config (`AUDIT_SIGNING_KEY`, `GEMINI_API_KEY`) present → `200 {status:'ok'}`, else `503 {status:'degraded'}`.
- Deep: `GET /api/health?deep=1` additionally pings Firestore.
- Minimal body by design (no per-check disclosure to unauthenticated callers).

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

- **Scheduled Firestore exports** (managed) to a dedicated EU GCS bucket, daily, 30-day retention:
```bash
gcloud firestore export gs://cleancore-backups/$(date +%F) \
  --database=ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e --region=europe-west1
# Schedule via Cloud Scheduler → a small job / Cloud Function invoking the export.
```
- **Restore must be tested** at least annually (an untested backup is not a backup); record the result in the ops log.
- Backup vs. GDPR erasure: Art. 17 deletions remove live data immediately; residual backup copies age out within the 30-day window (see `docs/DATA-RETENTION.md`).

## Firestore rules deployment (all databases)

Rules must be deployed to **every** database the app uses, not just `(default)`:
```bash
npm run deploy:rules   # firebase deploy --only firestore:rules --config firebase.rules-all-dbs.json
```
(A stale ruleset on the named production DB was the root cause of the v2.0 "empty Solution Design" incident — see CHANGELOG.)

## Secret rotation

Rotate on a defined cadence and after any suspected exposure: `AUDIT_SIGNING_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER`, `PILOT_APPROVAL_SECRET`, Firebase service account. Rotating `AUDIT_SIGNING_KEY` invalidates prior audit-pack signatures (treat old packs as `integrity-only`); see `docs/INCIDENT-RESPONSE.md` R1.

## Deploy pipeline

`main`/`release`/`dev` push → GitHub Actions `deploy.yml` (`validate`: lint + build + Playwright E2E on the Firestore emulator → `deploy`: Cloud Run). `security-ci.yml` runs gitleaks + dependency audit + SBOM in parallel.
