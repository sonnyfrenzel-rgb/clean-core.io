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
| `release` | `clean-core-test` | https://test.clean-core.io |
| `dev` | `clean-core-dev` | https://dev.clean-core.io |

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
