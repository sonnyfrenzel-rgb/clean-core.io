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
- Catalog: `catalog-service.ts` (`getMergedCatalogVersion`, `MERGED_TABLE_MAP`), `sap-api-catalog.ts`, `cds-catalog.ts`, `cloudification-repo.ts`, `support-matrix.ts`, `generated/cloudification-repo.latest.json`. Refresh via `npm run sync:catalog`.

---

## 5. Security & secrets

Full detail in `SECURITY.md`. Key points for day-to-day work:

- **AI keys never client-side** — all Gemini calls proxy through `app/api/gemini/route.ts` (`lib/gemini.ts`).
- **Auth** — mutating API routes require a verified Firebase ID token via `lib/firebase-admin.ts` (`verifyRequestAuth`). Admin routes add `verifyAdminRequest()` email allowlist.
- **Encryption** — S/4HANA creds AES-256-GCM at rest (`lib/s4-credentials.ts`, `S4_ENCRYPTION_KEY`), server-only Firestore collection `s4_credentials/{uid}` (`allow read, write: if false`). MFA backup codes hashed with `MFA_BACKUP_CODE_PEPPER` (`lib/mfa.ts`).
- **SSRF** — multi-layer defense on S/4 connectivity (HTTPS-only, DNS re-check, `S4_HOST_ALLOWLIST`, metadata-endpoint block, redirect validation).
- **CSP / headers** — `middleware.ts` (CSP, documented Firebase Sign-In exceptions) + `next.config.mjs` (HSTS/X-Frame). HTML sanitized via `lib/sanitize-html.ts` (dompurify).
- **Firestore rules** — `firestore.rules` freezes privileged fields (`isAdmin`, `tier`, quota counters); tested by `tests/firestore-rules.spec.ts`.
- **Env vars** — template in `.env.example`; runtime secrets injected as Cloud Run env vars per environment. `run-tests` route is permanently 503 (RCE prevention).

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

## 10. Gotchas

- Local Node is v20.x but the project requires ≥22.8 (CI/Cloud Run use 22). Bump local Node for parity.
- Builds fail on any TS/ESLint error (`ignoreBuildErrors: false`).
- Ignore for code work: `scratch/`, `tmp/`, `dist/` (stray gitignored build artifact — the project is web-only, no desktop/Electron app), `clean-core-video/`, committed `*-debug.log`.
