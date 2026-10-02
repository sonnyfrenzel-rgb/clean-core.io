# GLM full-codebase review — Config, CI and tests

**Model:** `z-ai/glm-5.3` via OpenRouter · **Date:** 2026-08-27 · **Pass:** `meta`
**Bundle:** 56 files, 275 KB.
**Usage:** 70603 prompt / 5145 completion tokens, 114s.

Secrets, env files, keys, service accounts, the public Firebase web config and the generated SAP
catalog data were excluded from the bundle by path, and a pattern scan over the assembled text
refused nothing.

**This output is unedited.** It has NOT been verified against the code. Two of roughly twenty
findings in the comparable Grok 4.6 review were wrong; treat every claim below as a hypothesis until
it is reproduced. See `docs/reviews/2026-08-26-TRIAGE.md` for how that was done.

---

## Findings

### 1. Audit-signature verification accepts a committed fallback key — forgeable "valid" verdicts
- **Severity: High**
- **File:** `tests/audit-compliance-v181.spec.ts`, tests `api/export/verify should validate correct signature using dev fallback key` (~line 80) and the run-bound variant below it.
- **What goes wrong:** The test computes an HMAC with the literal string `dev_audit_signing_key_fallback_clean_core` — a key now public in the repository — and asserts the production verify endpoint answers `200 { valid: true }`. That proves the route falls back to a hardcoded key when `AUDIT_SIGNING_KEY` is unset. Scenario: any deployment (local, a misconfigured env, a future platform where the secret fails to propagate) verifies a manifest an attacker signed with the public fallback key as *cryptographically authentic*. For a product whose selling point is a recomputable, signed evidence chain, a forged "valid" is the worst possible false success state. The deploy workflow asserts the secret exists, which mitigates but does not remove the fallback path.
- **Fix:** Make a missing `AUDIT_SIGNING_KEY` a hard startup failure (fail closed) instead of a fallback, and change the test to assert the fallback is *rejected*. (Caveat: the route source isn't in this file set; the test's assertions are the evidence the fallback exists.)

### 2. ESLint gate checks nothing for TypeScript or React hooks
- **Severity: Medium**
- **File:** `eslint.config.mjs`, rules block (~line 30).
- **What goes wrong:** `@typescript-eslint` and `react-hooks` are registered in `plugins`, but the `rules` object only spreads `pluginNext.configs.recommended` and `core-web-vitals`. Zero typescript-eslint rules and zero react-hooks rules (including `rules-of-hooks` and `exhaustive-deps`) are ever enabled. Scenario: a PR introduces a conditional hook call or an unsafe `any` chain; `npm run lint` in the deploy pipeline passes, and the "lint errors block deployment" claim (F-07 in `next.config.mjs`) is false confidence — the exact class of bug `tests/no-fabricated-figures.spec.ts` guards against by hand because lint never catches it.
- **Fix:** Spread `tsPlugin.configs.recommended.rules` and `pluginReactHooks.configs.recommended.rules` into the rules object (or use the plugins' flat configs).

### 3. Five tests pass vacuously when the element they claim to verify is absent
- **Severity: Medium**
- **Files:**
  - `tests/analyze-design.spec.ts` — "should verify the global glossary overlays toggle behavior": `if (await chatbotTrigger.count() > 0) { await expect(...).toBeVisible(); }`
  - `tests/landing.spec.ts` — "should navigate to the legal notice page": entire body inside `if (await legalNoticeLink.count() > 0)`.
  - `tests/stage1-2.spec.ts` — same legal-notice pattern.
  - `tests/sandbox-delivery.spec.ts` — "should verify workspace settings…": community badge conditional.
  - `tests/transformation-docs.spec.ts` — glossary sidebar conditional.
- **What goes wrong:** If the "Ask AI" trigger, the `/impressum` footer link, or the community badge is removed or never renders, `count()` is 0, the conditional body is skipped, and the test reports green. Scenario: a refactor drops the legal-notice link (a compliance obligation for a German-operated site); the suite named "should navigate to the legal notice page" still passes, and CI deploys.
- **Fix:** Replace the `if` with an unconditional `await expect(locator).toHaveCount(1)` (or `toBeVisible()`), so absence is a failure.

### 4. Unpinned remote installer executed in CI with a PR-writing token
- **Severity: Medium**
- **File:** `.github/workflows/grok-review.yml`, "Install Grok CLI" step.
- **What goes wrong:** `curl -fsSL https://x.ai/cli/install.sh | bash` executes whatever x.ai's CDN serves at run time, unpinned, in a job holding `pull-requests: write` and `--always-approve` (agent acts unattended). Scenario: compromise or hijack of that URL runs arbitrary code on every PR against this repository, with a token that can post comments and a full clone (`fetch-depth: 0`). The in-file note acknowledges this and lists mitigations, so this is a known-accepted risk rather than an oversight — but it remains the one unpinned execution path in an otherwise SHA-pinned CI.
- **Fix:** Download the installer, checksum-pin it (or vendor a pinned binary), then execute; or drop the job until a versioned artifact exists.

### 5. "Assert No Emulator Flag in Deploy" asserts an environment that never had the flag
- **Severity: Low**
- **File:** `.github/workflows/deploy.yml`, "Assert No Emulator Flag in Deploy" step.
- **What goes wrong:** The check reads `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` from the *deploy job's* runner env. That variable was only ever set as step-level env in the `validate` job; the deploy job never receives it, so the guard is trivially true and proves nothing about the artifact Cloud Run builds. Scenario: someone adds `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` to the Cloud Run `env_vars`/`--set-build-env-vars` block two steps below — the guard still passes and production ships emulator-pointed Firebase config.
- **Fix:** Grep the `env_vars`/`flags` values (or the built artifact) for the flag, or assert on the workflow inputs that feed the deploy step.

### 6. Firebase emulator readiness is a fixed `sleep 10`
- **Severity: Low**
- **File:** `.github/workflows/deploy.yml`, "Start Firebase Emulator" step.
- **What goes wrong:** `npx firebase emulators:start … & sleep 10` — on a slow/cold runner (Java 21 first start, downloading emulator jars) the emulator isn't listening on 9099/8080 after 10s; the subsequent build's Firebase calls and the whole Playwright suite then fail spuriously, blocking deploys. There is no readiness probe and no error surfaced from the background process.
- **Fix:** Poll the emulator's health endpoints (`http://127.0.0.1:9099/` and `:8080/`) in a retry loop with a timeout before proceeding.

### 7. `tsx` declared twice with conflicting version ranges
- **Severity: Low**
- **File:** `package.json` — `"tsx": "^4.21.0"` in `dependencies`, `"tsx": "^4.19.0"` in `devDependencies`.
- **What goes wrong:** npm resolves the duplication silently (dev wins for local installs), but the two ranges can drift apart: a production install (`--omit=dev`) gets ^4.21 while CI/dev gets whatever ^4.19 resolves to, so operational scripts (`sync:catalog`, `send-usage-report`) can behave differently between environments. It also signals an accidental double-add rather than a decision.
- **Fix:** Keep `tsx` in `devDependencies` only (scripts are run from a checkout, not from the deployed runtime) and delete the `dependencies` entry.

### 8. Marketing scripts hardcode a personal Windows desktop path
- **Severity: Low**
- **Files:** `scripts/generate-whitepaper-grid.js`, `scripts/generate-whitepaper-png.js`, `scripts/md-to-pdf.js` (`C:\Users\felix\OneDrive\Desktop`).
- **What goes wrong:** Any run on another machine (or CI) throws `ENOENT` on the hardcoded path — `generate-whitepaper-grid.js` fails before doing anything, `md-to-pdf.js` fails *after* producing the PDF at the copy step. These are one-off assets, so impact is limited to a broken script for anyone but the author.
- **Fix:** Take the output directory from `argv` or `process.env`, defaulting to the repo's `public/`.

---

**Not reported, with reasons:** the `security` job in `deploy.yml` gating at `critical` while `security-ci.yml` gates at `high` looks inconsistent, but both carry explicit triage comments, so I read it as intentional. The `vercel.json` file is dead config next to a Cloud Run deploy, but it causes no runtime behavior. I could not verify whether `/api/test/seed` (used by `tests/helpers/admin-seed.ts`, authenticated with `PILOT_APPROVAL_SECRET`) is compiled into production builds — if it is, that would be a High finding; the route source isn't in this file set, so I'm flagging it as unverified rather than asserting it.