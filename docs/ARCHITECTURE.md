# Clean-Core.io — Architecture & Runbook

Deep reference for the platform. For the quick orientation read `CLAUDE.md`; for the security threat model read `SECURITY.md`; for the product/roadmap read `README.md`.

---

## 1. System overview

Clean-Core.io modernizes SAP ABAP legacy code to TypeScript/Node.js aligned with SAP's Clean Core paradigm. The pipeline is **deterministic-first, AI-second**: a static ABAP evidence engine (`lib/abap/`) produces the auditable facts, and Gemini only *narrates/transforms* on top of them. Every analysis is frozen into an immutable, HMAC-signed **Run**, which is the root of the trust/audit chain.

```
Upload ABAP ─▶ Deterministic Evidence Engine (lib/abap) ─▶ Run (immutable, signed)
                                                              │
        Gemini narrative / transformation ◀──────────────────┤
                                                              ▼
   Design ▶ Transformation ▶ Documentation ▶ Testing ▶ TCO ▶ Delivery
                                                              │
                                                     Audit Pack (signed ZIP) ▶ Verify
```

**Stack:** Next.js 15 App Router · React 19 · TypeScript strict · Tailwind v4 · Firebase (client SDK + Admin SDK) · Google Gemini (`@google/genai`). Node ≥ 22.8. Deploy: Google Cloud Run (`europe-west1`, project `cleancore-491216`).

---

## 2. The 7-stage workflow

Under `app/(app)/project/[projectId]/`, each stage is its own `page.tsx` (`'use client'`, `export const dynamic = 'force-dynamic'`), hydrated by `lib/project-loader.ts` and gated by `lib/run-guard.ts`:

| # | Stage | Route | Purpose |
|---|-------|-------|---------|
| 1 | Analyze | `analyze/` | Upload ABAP → run static evidence engine → code inventory + findings → create Run |
| 2 | Design | `design/` | Target architecture (RAP/CAP/…), topology, roadmap |
| 3 | Transformation | `transformation/` | Gemini-generated modern code |
| 4 | Documentation | `documentation/` | Process docs / BPMN |
| 5 | Testing | `testing/` | Test generation & execution (ADT cockpit, optional S/4 live bridge) |
| 6 | TCO | `tco/` | Total cost of ownership |
| 7 | Delivery | `delivery/` | Final delivery + audit pack |

Downstream stages call `enforceActiveRun()` — missing Run redirects to Analyze. Legacy runs degrade gracefully via `lib/run-capabilities.ts` (shape detection → `LegacyRunBanner`).

---

## 3. The trust chain (server-authoritative)

This is the platform's core differentiator — keep it intact when editing.

- **Run creation** — `app/api/runs/create/route.ts`: canonical-JSON serialization + HMAC signature (`AUDIT_SIGNING_KEY`). Stored at `projects/{id}/runs/{runId}`, immutable.
- **Run enforcement** — `lib/run-guard.ts`: `hasActiveRun` / `enforceActiveRun`.
- **Hydration** — `lib/project-loader.ts`: `loadProjectAndHydrate` merges project doc + active run subdoc.
- **Audit pack** — `lib/audit-pack.ts` / `lib/audit-pack-verify.ts`: build/verify signed ZIP (SHA-256 manifest + HMAC). Sign endpoint validates that the requested run is the active run (409) and has a valid `runHash` (422). Three-tier verify status: `authentic` → `integrity-only` → `failed`.

- **The signing key** — `lib/audit-signing-key.ts` is the only place that reads `AUDIT_SIGNING_KEY`, and there is **no fallback**. If the variable is unset, the three routes above return 500 — in every environment, not only when `NODE_ENV === 'production'`. Until v2.7.2 a constant committed to this public repository stood in for it, and `/api/export/verify` honoured that constant too, so any instance running without the variable would certify a forged pack as genuine. `tests/signing-key-guard.spec.ts` keeps it out. Local development needs the variable in `.env.local`; the Playwright run gets a throwaway value from `playwright.config.ts`.

**Invariant:** the client must never be able to forge run binding or supply signed content. When touching runs/audit/sign/verify, preserve server-side validation and re-read `docs/codex-audit-v119.md` + `docs/WEEK2_AUDIT_INTEGRITY_PLAN.md`.

---

## 4. The ABAP evidence engine (`lib/abap/`, ~24 files)

Deterministic, no LLM. Runs synchronously so results can be replayed as the Evidence Sweep overlay during the Gemini call.

- `evidence-model.ts` — core `buildAbapEvidence`, `EvidenceKind`/`EvidenceFinding` taxonomy.
- `code-assessment.ts` — `extractCodeInventory`, `extractDataCoupling`, complexity/criticality scoring, standard-table → CDS/API map.
- Parsers: `declaration-parser.ts` (tokenizer), `select-parser.ts`, `sql-model.ts`, `sql-quirk-rules.ts`, `complex-join-findings.ts`, `findings-detector.ts`, `result-diff.ts`.
- `extensibility-router.ts` — `routeExtensibility` decides RAP (in-app) vs CAP (side-by-side) track.
- OO resolver: `class-model.ts` / `class-model-resolver.ts` — linearizes inheritance (MRO), maps constructors/interface aliases before LLM to prevent structure hallucination.
- Usage import: `usage-*.ts` — SCMON/UPL/ST03N parsing + `usage-privacy.ts` (pseudonymization).
- Catalog: `catalog-service.ts` (`getMergedCatalogVersion`, `MERGED_TABLE_MAP`), `sap-api-catalog.ts`, `cds-catalog.ts`, `cloudification-repo.ts`, `support-matrix.ts`. Refresh via `npm run sync:catalog` (single release) or `npm run sync:catalog:all`.

### 4.1 The two catalog files, and why both

SAP's [Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc) ships two schemas, and the engine syncs both into `lib/abap/generated/`:

| Artifact | Source | formatVersion | Entries | States |
|---|---|---|---|---|
| `cloudification-repo.latest.json` | `objectReleaseInfoLatest.json` | 1 | 23,696 | `released`, `deprecated`, `notToBeReleased` |
| `cloudification-repo.classifications-sap.json` | `objectClassifications_SAP.json` | 2 | 8,587 | `classicAPI`, `noAPI` |

They are **near-disjoint** — 196 keys overlap — so the second file is additional coverage, not a restatement. Together they classify **32,103** objects.

Two things about the second file are easy to get wrong:

- **FUGR rows name the function GROUP in `tadirObjName` and the function MODULE in `objectKey`.** Custom code calls the module (`CALL FUNCTION 'BAPI_…'`), so `normalizeClassificationFile()` indexes FUGR rows by `objectKey` and everything else by `tadirObjName`. Indexing all rows the same way would file 5,246 entries under a name nothing looks up.
- **`released` beats `classicAPI`** on the 196 overlapping objects. Reversed, released (level A) objects would be silently downgraded to B.

`scripts/sync-cloudification-repo.ts` dispatches on the registry entry (`CLASSIFICATION_RELEASES`) rather than sniffing the payload, and throws on a shape mismatch — a half-parsed catalog would produce confidently wrong grades.

### 4.2 Clean core levels A–D, and their provenance

`abcd-classification.ts` is deliberately **dependency-free**: the panel that renders grades is a client component, and importing the catalog there would ship ~4 MB of JSON to the browser. The lookup therefore lives in `catalog-service.ts` (server-only) and the pure grading functions live in `abcd-classification.ts`.

| SAP state | Level | `provenance` |
|---|---|---|
| `released` | A | `catalog` |
| `classicAPI` | B | `catalog` |
| `deprecated` + successor | C | `catalog` |
| `deprecated` without successor | D | `catalog` |
| `noAPI`, `notToBeReleased` | D | `catalog` |
| SAP object in neither file | C | `catalog-residual` |
| customer Z/Y object | — falls back to `gradeFromCoupling` / `gradeFromInventory` | `heuristic` |

The `catalog-residual` case is not a guess: "SAP internal objects, not classified or intended for customer use" is what the clean core level concept defines level C to be.

Client surfaces receive resolved grades, never the maps:

- Server components (`/catalog/[object]`, `/sap-clean-core-object-classification`) call `gradeSapObject()` / `getPublishedGradeDistribution()` directly.
- The client `AbcdClassificationPanel` posts object names to **`/api/abcd-classify`** (auth-gated, read-only, max 500 objects) and renders heuristic grades until the lookup lands, so a slow or failed call never blanks the panel.

**The A–D grade is deliberately excluded from the signed audit pack.** It is an orientation aid, not evidence; a wrong grade must never become signed material. Every surface that shows a grade repeats this.

The ATC severity per level is stored as `atcReading` — *our* reading, not an SAP-published mapping. No SAP source stating it outright could be cited; what SAP does document is the recommendation to run ATC in blocking mode for Priority 1 and 2 findings. Do not present it as SAP doctrine without a source.

### 4.3 Enhancement and modification detection

The clean core level concept turns on *which extension technology* was used, which is also what SAP's ATC check "Allowed Enhancement Technologies" examines. Two evidence kinds cover it:

- `enhancement` — `ENHANCEMENT`, `ENHANCEMENT-POINT`, `ENHANCEMENT-SECTION` (level D technologies, High severity); `GET`/`CALL BADI` and `CL_EXITHANDLER=>GET_INSTANCE` (level B, Low severity — an SAP-provided extension point must not be penalised like a modification).
- `modification` — `*{ INSERT|REPLACE|DELETE` markers, Critical.

**Modification markers are full-line comments, which `tokenize()` drops by design** (`declaration-parser.ts`). They are matched against the raw source in a separate pass after the statement loop. Removing that pass makes the most severe clean core violation invisible to the engine — `tests/enhancement-detection.spec.ts` guards it.

---

## 5. Security & secrets

Full detail in `SECURITY.md`. Key points for day-to-day work:

- **AI keys never client-side** — all Gemini calls proxy through `app/api/gemini/route.ts` (`lib/gemini.ts`).
- **Auth** — mutating API routes require a verified Firebase ID token via `lib/firebase-admin.ts` (`verifyRequestAuth`). Admin routes add `verifyAdminRequest()` email allowlist.
- **Encryption** — S/4HANA creds AES-256-GCM at rest (`lib/s4-credentials.ts`, `S4_ENCRYPTION_KEY`), server-only Firestore collection `s4_credentials/{uid}` (`allow read, write: if false`). MFA backup codes hashed with `MFA_BACKUP_CODE_PEPPER` (`lib/mfa.ts`).
- **SSRF** — multi-layer defense on S/4 connectivity (HTTPS-only, DNS re-check, `S4_HOST_ALLOWLIST`, metadata-endpoint block, redirect validation).
- **CSP / headers** — `middleware.ts` (CSP, documented Firebase Sign-In exceptions) + `next.config.mjs` (HSTS/X-Frame). HTML sanitized via `lib/sanitize-html.ts` (dompurify).
- **Firestore rules** — `firestore.rules` freezes privileged fields (`isAdmin`, `tier`, quota counters); tested by `tests/firestore-rules.spec.ts`.
- **Env vars** — template in `.env.example`; runtime secrets injected as Cloud Run env vars per environment. `run-tests` executes generated tests in a hardened sandbox (esbuild + Node Permission Model, temp-dir-scoped FS, minimal env, time/output limits); live S/4 egress stays off unless `S4_TEST_RUNNER_EGRESS_ENFORCED=true`.

Required secrets: `GEMINI_API_KEY`, `RESEND_API_KEY`, `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER`, `PILOT_APPROVAL_SECRET`, `AUDIT_SIGNING_KEY`, `S4_HOST_ALLOWLIST`.

---

### 5.1 Two invariants that are easy to break by copy-paste

**MFA is a server-side control, not a modal.** Firebase Auth issues a valid ID
token *before* any custom second factor runs — the TOTP prompt is a React state
change. The client can therefore only ask; the gate is `assertMfaSatisfied` on
the server, which rejects a token from an `mfaEnabled` account without the
`mfa_session` cookie. Every route that mints, mutates or destroys evidence must
call it (or the stronger `assertMfaStepUp` / `assertAdminStepUp`). Enrolment and
verification must NOT — they cannot depend on the factor being enrolled.
`tests/mfa-coverage-guard.spec.ts` lists both sides explicitly so a new route
forces a decision rather than defaulting to unguarded.

**The S/4 credential vault is all-or-nothing.** `resolveS4Connection()` in
`lib/s4-credentials.ts` owns this: if a request asks for stored credentials the
whole connection identity comes from storage and body overrides are ignored;
otherwise storage is not read at all. Merging field by field —
`url: body.url ?? stored?.url` beside `password: body.password ?? stored?.password`
— let a request keep the vault password and redirect it to a URL of its own. The
SSRF allowlist narrows that but is a config value, not a code invariant.

### 5.2 Registration is automatic; consent and status are not

There is no administrator approval on signup. A browser writes `users/{uid}` as
`status: 'pending'` — the create rule pins that value and rejects anything else —
and then calls `POST /api/account/register`, which is the only thing that can
move an account to `approved`. Automatic is not the same as client-decided: the
decision is still made by the server, so a Firestore write cannot mint an active
account.

`activateAccount()` (`lib/firebase-admin.ts`) runs once per account, in a
transaction, and refuses anything that is not `pending` or that already carries
`activatedAt`. That guard is what makes revocation stick — `adminRevokeUser`
now writes `status: 'suspended'` rather than pushing the account back to
`pending`, which self-service activation would silently have undone.

**Consent is written by the server or not at all.** `termsVersionAccepted` and
`termsAcceptedAt` used to sit in `userClientCreateKeys()`, so a browser recorded
its own Terms acceptance with its own clock and nothing behind it. Both fields
are out of that allowlist; `lib/consent.ts` is the single writer, appending to
`consent_events` (server-only, `allow read, write: if false`) and mirroring the
version onto the profile through the Admin SDK. `POST /api/consent` (re-consent)
and `POST /api/account/register` (signup) both go through it.

One consequence worth knowing: `components/UserOnboarding.tsx` must stay mounted
in `app/(app)/layout.tsx`. A first Google sign-in deliberately creates no profile
— a popup asks for nothing, so there is no agreement to record — and that modal
is where the name and both agreements are collected. It went unmounted for a
while, and the auto-provisioning branch that filled the gap produced accounts
with no consent record and no way to give one.

Registration sends exactly two mails, both built from `lib/welcome-email.ts` and
`lib/admin-signup-email.ts`: one to the new user (first-run guide + the security
answers their IT department will ask for) and one to `info@clean-core.io` that
carries no privileged action — no approve link, no token in a URL.
`tests/registration-flow-guard.spec.ts` holds all of this in place.

### 5.3 A signature that is never checked is decoration

`runs/create` hashes the run over a canonical serialisation and signs the hash.
`audit-pack/create` used to confirm that `runHash` was a non-empty string and
then sign a manifest attesting to it — it never recomputed the hash and never
verified the HMAC. A run altered after creation therefore came back out as a
validly signed pack over the altered content, the signature laundering the change
rather than catching it.

`lib/run-signature.ts` owns the canonicaliser, `computeRunHash`, `signRunHash`
and `verifyRunIntegrity`, and both routes use it. That is the point of the
module: **the verifier has to rebuild the payload the way the producer built it.**
Two implementations of "canonical" drift, and a verification that drifts is a
verification that passes.

Two rules follow, and both are guarded by `tests/run-integrity-guard.spec.ts`:

- **Evidence comes from the run, never from the project.** `worklist` and
  `extensibilityRoute` are both in the client-writable update allowlist in
  `firestore.rules`, and the pack read them from the project in preference to the
  run. The owner could delete an inconvenient finding and have the pack sign the
  edited version as bound to the immutable run. If interactive changes are ever
  worth exporting, they belong in a separately identified, user-attested file.
- **`success` means authentic.** `verifyAuditPack` returned true for anything
  internally consistent, including a ZIP anyone can assemble with `signed: false`.
  Local checksum consistency is a real fact and keeps its own field,
  `integrityValid`; it is not the same claim.

### 5.4 Re-enrolment is not enrolment

MFA setup cannot require the factor it is about to create — that is why
`mfa/setup/start` and `mfa/setup/verify` sit in the `MUST_NOT_GATE` half of
`tests/mfa-coverage-guard.spec.ts`. The reasoning is right and its scope was
wrong: applied unconditionally it meant an account that *already* had MFA could
have its factor replaced with nothing but a stolen ID token — start, take the new
secret, compute its code, verify, done.

The distinction is the enrolled state, not the route. `assertReEnrolmentAllowed`
reads `users/{uid}.mfaEnabled` and applies `assertMfaStepUp` only when a factor
exists. Both routes check it: they are independent endpoints and a caller can
reach verify directly with a pending secret.

### 5.5 Consent is what the server knows, not what the caller says

`lib/consent.ts` is the single writer of `consent_events`, and it takes no
version and no document hash from its caller. Both used to arrive in the request
body and go straight into the append-only row, so an authenticated caller could
state acceptance of a privacy document this server never served. A consent record
whose contents the consenting party chooses is not evidence of consent. `locale`
is the one field a caller still supplies, because it describes the reader rather
than claiming what they accepted.

### 5.6 Provenance survives the trip to the screen

`MERGED_TABLE_MAP` is two layers: SAP's published release data
(`confidence: 'sap-official'`) and a hand-curated field-level mapping
(`'curated'`), with the curated layer winning. Both are useful; only one is a
lookup. `evidence-model.ts` used to flatten them into `'Catalog Match'` and stamp
SAP's catalog version alongside, and two UI sites went further and relabelled
`'Verified'` as `'Catalog Match'` on screen — so a hand-written pairing read as a
citation. `VBAK -> API_SALES_ORDER_SRV` was presented as SAP's answer when SAP's
answer is `I_SALESDOCUMENT`.

`replacementProvenance()` maps the two apart, and the catalog version rides only
on a genuine lookup. `bucketOf` accepts both as settled, because "we can point
you at a released successor" is true of both — an inference (`'Candidate'`,
`'Needs Validation'`) still is not.

### 5.7 Computed output has to look computed

The landing benefit card is the visible half of the same rule. It carries prose
and it carries figures recomputed from a file in this repository, and for a
product selling auditability a reader must be able to tell them apart without
reading every word. There is exactly one dark region on that card and it is the
evidence — numbers, bar, object roll-call in monospace. The prose stays light.
`tests/benefit-card-guard.spec.ts` fails if a second dark region appears.

The same rule, stated as a prohibition, is why the "Differential Sandbox Tester"
was deleted rather than relabelled: a screen may not report a verification it did
not perform. `tests/fabricated-verification-guard.spec.ts` additionally forbids
any `setTimeout` in the transformation view from writing to `signedOffIds` —
naming the shape, not just the string.

### 5.8 A 200 from the mailer is not a delivered mail

`POST https://api.resend.com/emails` returning 200 means the message was queued.
The platform logged that as "Sent" and learned nothing afterwards, so a welcome
mail quarantined by a corporate filter and one that reached an inbox produced
identical logs. The whole registration flow hangs on that single message, and
thirty community accounts were onboarded without anyone being able to say
whether it arrived — which is a plausible explanation for how little the
platform was used.

`POST /api/webhooks/resend` closes it. Three things about that route are
deliberate:

- **It is unauthenticated, and the signature is the authentication.** Resend
  cannot carry a Firebase token. Verification is Svix-style HMAC over
  `${svix-id}.${svix-timestamp}.${raw body}` with a five-minute replay window,
  implemented in `lib/email-events.ts` rather than pulled in as a dependency.
- **Without `RESEND_WEBHOOK_SECRET` it answers 503.** An endpoint that writes to
  Firestore on anyone's say-so is worse than no endpoint, so the missing-config
  case refuses rather than degrades.
- **It answers 2xx for payloads it does not understand.** A webhook that returns
  an error is retried, and retrying an event nobody will ever handle is noise on
  both sides. Bounces and complaints additionally get a log line of their own,
  because those are the cases somebody has to act on.

Two things follow on the sending side. The Resend message id is recorded at send
time (`recordEmailSent`) — without it a later event cannot be joined to the send.
And every outgoing mail carries a plain-text alternative and a `reply_to` that
exists: `team@` and `system@clean-core.io` are sending identities, not mailboxes
at the provider, so a reply to either bounced while the welcome mail was asking
the reader to reply.

`email_events` is server-only in `firestore.rules` — the documents carry
recipient addresses. Which is why the verdict does not stay there: the welcome
mail's send record keeps the `uid`, and a delivery event mirrors its status onto
`registration_requests/{uid}`, where the admin console already reads. An account
created and never used now looks different from one whose first-run guide sat in
a quarantine. `email.sent` deliberately produces no badge — that is the state
the platform always had, and it is the one that meant nothing.

### 5.9 Never substitute a figure for a measurement

`|| <number>` on a value the product measured turns "we do not know" into
something a customer will quote. The delivery handover once read `|| 10` tests
and `|| 92` % coverage under a green tick. Say "not generated" / "not computed"
instead, and let the status icon follow the fact. Product defaults (the free
tier's 5 transformations) are configuration and are fine.
`tests/no-fabricated-figures.spec.ts` guards the known sites.

---

## 6. Testing

- Config: `playwright.config.ts` — chromium, `baseURL localhost:3000`, forces emulator env (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, auth `127.0.0.1:9099`, firestore `127.0.0.1:8080`), suppresses real emails (`RESEND_API_KEY=''`).
- Emulators: `firebase.json` (auth 9099 + firestore 8080, UI off), rules from `firestore.rules`. Seed admin via `tests/helpers/admin-seed.ts`.
- Run: start emulators (`firebase emulators:start --only auth,firestore`), then `npx playwright test`.
- Key specs: `full-pipeline.spec.ts`, `trust-chain-e2e.spec.ts`, `evidence-engine-v118.spec.ts`, `firestore-rules.spec.ts`, `security-compliance.spec.ts`, `audit-compliance-v181.spec.ts`, `version-drift-guard.spec.ts`, `support-matrix-drift.spec.ts`. See `docs/testing.md`.

---

## 7. Build & deploy (CI/CD)

`.github/workflows/deploy.yml` ("Secure CI/CD Pipeline"), triggers on push to `dev` / `release` / `main`:

1. **validate** — lint → `npm run build` (fails on any TS/ESLint error) → Playwright against emulator → QE report.
2. **deploy** — OIDC Workload Identity to GCP `cleancore-491216`, `gcloud run deploy` from source (`europe-west1`, 2 GiB / 2 CPU). Guards assert the emulator flag never leaks and required secrets exist.

| Branch | Service | URL |
|--------|---------|-----|
| `main` | `clean-core` | https://clean-core.io |
| `release` | **retired 2026-08-31** | the deploy job stops with an error on this branch |
| `dev` | `clean-core-dev` | https://dev.clean-core.io — **no A record**, see below |

> **There are two environments, not three.** `clean-core-test` was deleted on
> 2026-08-31. Its serving revision dated from 2026-07-26 and `origin/release` had
> not moved since 2026-06-09, so it was a publicly reachable copy of the June
> application, missing six of the seven secrets. Deploying `release` as configured
> would have recreated it pointing at a hostname with no A record, against a
> Firestore database still in us-west1 carrying the `freeTierLimited` cap that took
> the platform down on 19 August — so the pipeline now fails that branch loudly
> rather than rebuilding three broken things. Restoring the lane means a
> europe-west1 database, a working domain mapping, and putting the service name
> back in `.github/workflows/deploy.yml`.
>
> `dev.clean-core.io` exists in the zone and points at nothing (NODATA against
> 8.8.8.8, re-checked 2026-08-31). Until the Cloud Run domain mapping and the CNAME
> at Strato are restored, reach it at
> `https://clean-core-dev-qcevuoi3uq-ew.a.run.app`. A deploy that "isn't visible on
> dev" is usually this, not the deploy.

Each env has its own `NEXT_PUBLIC_FIRESTORE_DB_ID`. `firebase.json` has **no** hosting deploy; `vercel.json` only sets cache headers. Second workflow `sync-catalog.yml` refreshes the SAP catalog.

---

## 8. Diagnostics / log runbook

CI (repo `sonnyfrenzel-rgb/clean-core.io`):
```bash
gh run list -L 10
gh run view <run-id> --log-failed     # only failed steps
gh run watch <run-id>                  # follow a live run
```

Cloud Run runtime (project `cleancore-491216`):
```bash
gcloud run services list --region=europe-west1
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name="clean-core" AND severity>=WARNING' \
  --limit=50 --freshness=1h --format='table(timestamp,severity,textPayload)'
gcloud builds list --limit=10
```
Switch `service_name` to `clean-core-test` / `clean-core-dev` for the other envs.

---

## 9. Conventions cheat-sheet

- Path alias `@/*` → repo root.
- No global state lib / no React Context — component-local state + Firestore via `getDb()` and `useUserProfile`.
- Naming: components `PascalCase.tsx`, hooks `useX.ts`, lib kebab-case, routes `route.ts`, pages `page.tsx`, stage folders lowercase verbs.
- Styling: Tailwind v4 + `clsx`/`tailwind-merge` (`lib/utils.ts`); dark mode via `dark` class from profile; icons `lucide-react`, diagrams `mermaid`/`@xyflow/react`, charts `recharts`, animation `motion`.
- `lib/version.ts` (`APP_VERSION`, `APP_RELEASE_DATE`) drives sitemap `lastModified` and drift-guard tests — keep it in sync on release.

## 10. Public content surface (the Clean Core guide)

`/clean-core-explained` is a long-form explainer that exists to be forwarded — it
is the top of the funnel, not a product page. Three properties matter when
changing it.

**Content is data, not markup.** `lib/clean-core-guide.ts` (parts, chapters,
notes, tables, FAQ) and `lib/clean-core-capabilities.ts` (the seven stages with
benefit / effort / *where it stops*, plus Honest Scope) are the single source.
The visible text and the `Article` + `FAQPage` JSON-LD are generated from the
same objects, so a correction cannot land in one and miss the other. Edit the
data module, never the page.

**There are two renderers over that data.**

| Route | Purpose | Notes |
|---|---|---|
| `app/(app)/clean-core-explained/page.tsx` | The web version | Hero, share bar, CTAs; indexed, canonical, in the sitemap |
| `app/clean-core-explained-print/page.tsx` | The paper version | Cover, page breaks, ink-frugal; **noindex**, outside `(app)` so it inherits no shell |

The print route is a second renderer rather than a print stylesheet because the
web version leads with things that have no place in a forwarded document.

**The PDF is a committed build artefact.**

```bash
npm run build:guide-pdf              # renders the print route via Chromium → public/clean-core-explained.pdf
npm run build:guide-pdf -- --check   # no browser: is the committed PDF still current?
```

It is not generated per request: a headless Chromium in the Cloud Run image
would cost hundreds of megabytes to produce a document that changes monthly.
The price of that choice is silent drift — content edited, website current,
forwarded PDF still saying the old thing — so the generator writes a hash of its
source files to `public/clean-core-explained.pdf.sha256` and `--check` compares
against it. **After any edit to the two data modules or the print page,
regenerate the PDF and commit it.** The check is not wired into CI yet (see
`docs/BACKLOG.md`).

**Print pagination, if you touch the CSS.** Never put `break-inside: avoid` on a
`.chapter` — several are taller than an A4 text block, so the rule cannot be
honoured and the fragmenter strands the preceding page nearly blank. Keep
`avoid` for small units only (headings, notes, figures, table rows, definition
rows, capability cards) and use `break-after: avoid` to keep headings attached
to what follows. To verify a change, measure each `.part` against the 979px page
box with print media emulated; every part should either fit a page or leave a
tail above ~60%.

## 11. Gotchas

- Local Node is v20.x but the project requires ≥22.8 (CI/Cloud Run use 22). Bump local Node for parity.
- Builds fail on any TS/ESLint error (`ignoreBuildErrors: false`).
- Ignore for code work: `scratch/`, `tmp/`, `dist/` (stray gitignored build artifact — the project is web-only, no desktop/Electron app), `clean-core-video/`, committed `*-debug.log`.
