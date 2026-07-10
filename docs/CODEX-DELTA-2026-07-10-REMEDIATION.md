# Codex v2.0.0 Delta / Tiefenanalyse (2026-07-10) — Remediation Map (v2.1.0)

This documents how each finding from the Codex "Delta Report und Tiefenanalyse" (2026-07-10)
was addressed in the **v2.1.0** release. Scope decision by the product owner: implement gates
**G0 + G1 + G2**; leave the untrusted test-runner (F-01) code unchanged for now (only its
public claims are corrected); land large architectural items (F-04, full F-05) in their
risk-reduced form and defer the full build to a later release.

| ID | Sev | Status in v2.1.0 | What changed |
|---|---|---|---|
| F-01 | P0 | **Deferred (owner decision)** | Runner code unchanged. Public "hardened/isolated/no host access" claims corrected to honest wording. Isolated zero-trust runner remains the top roadmap item. |
| F-02 | P1 | **Fixed** | New `assertAccountActive(uid, {requireApproved, requireCurrentTerms, isAdminClaim})` in `lib/firebase-admin.ts`, applied to `/api/gemini`, `/api/runs/create`, `/api/audit-pack/create`, `/api/run-tests`, `/api/secrets/gemini`. BYOK no longer bypasses approval. |
| F-03 | P1 | **Fixed** | `DELETE /api/projects/[projectId]` (Admin SDK `recursiveDelete`); dashboard calls it; `firestore.rules` project delete → `if false`; account erasure gained a `collectionGroup('runs')` orphan backstop. |
| F-04 | P1 | **Partly (labeling)** | A–D removed from the signed pack (see F-05). Full per-field provenance model (`server-computed` / `model-generated` / `user-attested` / `reviewer-approved`) is roadmap. Existing `attestationType: 'self-attested'` retained. |
| F-05 | P1 | **Fixed (as Preview)** | A/B/C/D panel + knowledge page relabelled **Experimental Preview**; removed from the signed audit pack (`lib/audit-pack.ts`). Full SAP-exact worst-finding/repository-lookup derivation is roadmap. |
| F-06 | P1 | **Fixed** | `assertAdminStepUp` fails closed if the admin has no MFA enrolled (relaxed only under the Firebase emulator for CI/E2E). |
| F-07 | P1 | **Fixed** | `deleteUserDataAndAccount` collects per-resource errors, tolerates idempotent not-found, runs an orphan-runs backstop, and **throws on partial erasure** instead of reporting success. |
| F-08 | P1 | **Fixed** | Overstated claims corrected across whitepaper page + PDF, `lib/board-deck.ts`, homepage, trust page, `lib/features-content.ts`, the four transactional emails, settings and onboarding. `vv2.0.0` double-`v` fixed. |
| F-09 | P1 | **Fixed** | Dead Gemini 2.0 IDs removed from the allowlist; GA vs. preview documented. Default model pinned; GA-default promotion gated on a golden-set check (roadmap). |
| F-10 | P2 | **Fixed (code)** | `rate_limits` doc id is now an HMAC (`RATE_LIMIT_PEPPER`) and each write sets `expiresAt`. **Ops action required:** configure a Firestore TTL policy on `rate_limits.expiresAt` (see below). |
| F-11 | P2 | **Fixed** | `deploy.yml` gains a `security` job (`npm audit --omit=dev --audit-level=critical`); `deploy.needs: [validate, security]`. Removed the client-bundled `NEXT_PUBLIC_GEMINI_API_KEY` test env var. |
| F-14 | P2 | **Fixed (claim)** | Licenses page "all permissive" → generated inventory reviewed per build, not a legal certification; lockfile root version bumped to 2.1.0. Full SBOM regeneration is an ops step. |
| F-15 | P2 | **Fixed** | `scripts/verify-export.ps1` uses `-LiteralPath` everywhere (bracketed dynamic routes no longer false-"missing"). |
| F-16 | P2 | **Fixed (server gate + route)** | `POST /api/consent` writes append-only `consent_events` (server timestamp) + mirrors the profile; `assertAccountActive(requireCurrentTerms)` enforces re-consent on a stale accepted version. Client reconsent-modal wiring is roadmap. |
| F-17 | P2 | **Fixed** | `next.config.mjs` permanent redirect `/sap-tier-2-extensions` → `/sap-clean-core-object-classification`. |
| F-19 | P2 | **Fixed (gated)** | Jira OAuth `url` + `callback` return 404 unless `JIRA_INTEGRATION_ENABLED=true` — no simulated success in production. |
| F-20 | P2 | **Fixed (gated)** | `/api/v1/purchase-orders/mass-create` returns 404 in production unless `ENABLE_MOCK_PO_ROUTE=true`. |
| F-12, F-13, F-18 | P2 | **Deferred (roadmap)** | Dedicated runtime service account, operational control-evidence pack, and asymmetric offline-verifiable signatures. |

## Operator / ops follow-ups (not code)

1. **Enrol admin MFA before relying on F-06.** With F-06 live, admin console actions in
   production require an enrolled second factor. Enable MFA in Settings **first**, or admin
   actions will 403. (MFA enrolment itself does not require the admin step-up.)
2. **Configure the Firestore TTL policy** on `rate_limits.expiresAt` (and, if desired,
   `consent_events`) so F-10 records actually self-delete:
   `gcloud firestore fields ttls update expiresAt --collection-group=rate_limits --enable-ttl`
   (run per database id).
3. **Deploy the updated Firestore rules to all databases** (`npm run deploy:rules`) — the
   project client-delete block and `consent_events` rule must be live for F-03/F-16.
4. **Optional env flags** now recognised: `RATE_LIMIT_PEPPER` (F-10),
   `JIRA_INTEGRATION_ENABLED` (F-19), `ENABLE_MOCK_PO_ROUTE` (F-20, non-prod only).
5. **F-01 remains open by design** — do not market the runner as "isolated / no host access"
   until the isolated zero-trust runner track lands.
