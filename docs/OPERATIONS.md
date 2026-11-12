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

## Acceptance T08: AI marking per format (Art. 50(2) AI Act, due 02.12.2026)

The legal review of 05.11.2026 confirmed the approach (a header comment per file a model wrote or co-wrote, a metadata field per export, the offline verifier as the detection path) and requires T08 to pass "including mixed artefacts". In a mixed file every model-written element carries its origin with provider and model, and nothing the engine wrote carries one. Four spellings of one fact (`lib/ai-marking.ts`):

| Format | Per-element mark | File level |
|---|---|---|
| Markdown | `<!-- cc:origin value="ai" ai_provider="…" ai_model="…" -->` … `<!-- /cc:origin -->` | header comment `<!-- Generated with AI assistance (…) … -->` |
| HTML | `data-origin="ai" data-ai-provider="…" data-ai-model="…"` on the element | header comment and `<meta name="ai-generated">` |
| Word (.docx) | a content control (`w:sdt`) titled "AI-generated (…)", tag `cc:origin=ai;ai_provider=…;ai_model=…`, locked against deletion | core property *Description* (`dc:description`) |
| BPMN | `<cc:origin value="ai" …/>` in the element's `extensionElements` (no download writes model names today: owner decision) | header comment and `cc:aiMarking` |
| Excel (test cases) | columns *Origin*, *AI provider*, *AI model* per row | workbook *Description* |

"not-recorded" in place of provider and model means a model wrote the element but its call was not recorded per project (design proposals, naming-stage names, decision proposals); that is the honest state, not a defect.

Use a project with a signed run, a business layer (SOP + RACI), a saved naming, at least one accepted wording proposal for a functional requirement, a solution design with NFR proposals, and a requirements specification with an open decision that has a proposal. For each row: export, open, check.

1. **Functional requirements** (Design → Functional requirements → *Download .md* and *Download .docx*). Markdown in a text editor: the worded requirement's overview cell and its bold statement sit inside a `cc:origin` pair naming the wording model; requirements without a proposal have none; the line "AI-generated. Engine wording: …" stays outside. Word: click the worded sentence — a frame titled "AI-generated (Google Gemini …)" appears (Developer tab → *Properties* shows the tag); an engine requirement has no frame. *File → Info → Properties* shows the statement.
2. **Non-functional requirements and the specification** (Design → Non-functional requirements → *.md*, *.docx*, *Specification* *.md*/*.docx*; and *Copy as text* pasted into Word). Only the proposal cell of section 4 / D is marked (not-recorded); the category and the names column are not. In the specification the worded functional sentences carry the wording model, the proposals not-recorded.
3. **Requirements specification** (Requirements workspace → Export → Word, Markdown, Confluence). In section 7 only the part after "Open · " — "AI-generated: …" — is marked; the answer is not. Confluence page in a browser: *Inspect* the cell, the proposal is a `<span data-origin="ai" …>`.
4. **Process description** (Documentation → Export → Word, Markdown, Confluence). The glance proposal (analysis model), the proposed RACI (SOP model; an owner-edited RACI is unmarked), a step's proposal line, and every business name of the naming stage (step table, step summary, step heading — only the name, not the number) are marked. Word: the RACI table is one frame. "Main path: …" is a sentence of names and is not marked per name (known limit).
5. **Analysis report** (Analyze → Export) and **documentation page**: unchanged since 3.0.21 — the narrative parts carry `data-origin`, nothing after "Detailed Technical Assessment".
6. **Delivery package** (Delivery → download the package and the audit pack). Open `docs/process-documentation.md`: with a saved naming it now starts with the header comment (not recorded) and every business name and proposed lane sits in a `cc:origin` pair; `docs/business-documentation.md` marks each SOP sentence (its basis in brackets stays outside), each exception, the RACI and old control rows with the SOP model. `manifest.json` names `docs/process-documentation.md` with `"ai": "documentation"`. `docs/decision.md`: every cell of the column "Design's comparison (proposal)" sits in a `cc:origin` pair, the file starts with the header comment, and `manifest.json` names it with `"ai": "design"`; a decision record without a comparison carries none of these. Then run `node scripts/verify-pack.mjs <pack.zip> --package <package.zip>`: an `element` line per mixed file says how many elements which model wrote, and the verdict says the package matches its own manifest and the manifest names the run and the source the audit pack signed; the exit code is 2, because the audit pack's signature does not cover the package's files. On https://clean-core.io/verify-pack the same list appears under "Which model took part".
7. **Business documentation download** (Delivery → Business documentation → *Export Markdown*): header comment plus the per-element pairs of 6.
8. **Test cases in Excel** (Testing → Export to Excel): the summary sheet's *Origin*/*AI provider*/*AI model* columns are filled for the model's scenarios and empty for the engine's cases; each scenario sheet has an "Origin" row.
9. **Dashboard downloads** (Dashboard → a project → *Download* on analysis, design, code, test suite, documentation, slide deck): each model-written file starts with the header comment; the original source and the test status do not.
10. **Negative check**: a project with no model text (engine-only documentation, no wording, no proposals) exports every format above without any `cc:origin`, `data-origin`, content control or header.

Record the result per row; only formats that pass may be named on the trust page.

## Secret rotation

Rotate on a defined cadence and after any suspected exposure: `AUDIT_SIGNING_KEY`, `AUDIT_SIGNING_PRIVATE_KEY` (move the old public key into `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED` so earlier packs keep verifying), `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `S4_ENCRYPTION_KEY`, `BYOK_ENCRYPTION_KEY` (versioned: add a new version to the key ring in `lib/byok-key.ts`, then retire the old one), `RATE_LIMIT_PEPPER` (resets the current windows), `PILOT_APPROVAL_SECRET`, the Firebase service account. `MFA_BACKUP_CODE_PEPPER` is retired with the backup codes: no code reads it and, since 02.10.2026, the deploy no longer passes it. Rotating `AUDIT_SIGNING_KEY` invalidates prior HMAC signatures — there is no key history for it yet (treat old packs as `integrity-only`); see `docs/INCIDENT-RESPONSE.md` R1.

## Deploy pipeline

`main`/`dev` push → GitHub Actions `deploy.yml` (`release` is retired and fails): `validate` (lint + build + type check + Playwright E2E on the Firestore emulator) and `security` (`npm audit --omit=dev --audit-level=high`) → `deploy-runner` (the isolated test runners, when `RUNNER_DEPLOY_ENABLED`) → `deploy` (Cloud Run app, its VPC egress per `APP_VPC_NETWORK` / `APP_VPC_SUBNET`; see `SECURITY.md` §7). `security-ci.yml` runs gitleaks + `audit-ci` + SBOM in parallel.
