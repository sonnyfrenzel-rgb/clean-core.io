# CLAUDE.md — Clean-Core.io

Guide for working in this repo. Deeper reference: `docs/ARCHITECTURE.md` (architecture + runbook). Also `README.md` (product story), `SECURITY.md` (threat model).

## What this is

**Clean-Core.io** (package name `ai-studio-applet`) — an enterprise platform that modernizes SAP ABAP legacy code to TypeScript/Node.js, aligned with SAP's Clean Core Extensibility paradigm. A deterministic ABAP evidence engine runs first, then Google Gemini transforms code; every analysis is captured as an immutable, HMAC-signed "Run" that anchors a server-authoritative trust/audit chain.

Stack: **Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · Firebase (client + Admin SDK) · Gemini**. Node **>= 22.8** (see gotcha below).

## Commands

```bash
npm run dev          # Next dev server (localhost:3000, 4 GB heap)
npm run build        # production build — fails on any TS/ESLint error
npm start            # serve production build
npm run lint         # eslint
npx playwright test  # E2E/integration tests (need Firebase emulators running)
npm run sync:catalog # refresh SAP cloudification catalog (latest)
npm run sync:catalog:all # refresh every registry entry incl. the A-D classification file
```

Emulators for tests: `firebase emulators:start --only auth,firestore --project=cleancore-491216`
(auth :9099, firestore :8080). **The `--project` flag is not optional.** Without it —
and there is no `.firebaserc` to supply it — the CLI falls back to `demo-no-project`,
the browser mints tokens for that project, and the Admin SDK rejects every one of
them with `incorrect "aud" claim`. The symptom is a handful of auth-dependent specs
failing with "There is no user record" or "Authentication required" while everything
else passes, which reads like a code regression and is not one. CI passes the flag
(`.github/workflows/deploy.yml`).

## Layout

- `app/` — App Router. `app/(app)/` = authenticated product shell; public/legal pages + `api/` at top level.
- `app/(app)/project/[projectId]/` — the **7-stage workflow**, one page each: `analyze` → `design` → `transformation` → `documentation` → `testing` → `tco` → `delivery`.
- `app/api/*/route.ts` — ~38 route handlers (gemini proxy, runs/create, mfa, admin, export sign/verify, s4 connectivity, email, abcd-classify).
- `components/` — shared `.tsx`; feature subfolders `components/analyze/`, `components/design/`.
- `lib/` — non-UI logic. `lib/abap/` is the deterministic evidence/grounding engine (~24 files).
- `hooks/`, `scripts/`, `tests/`, `docs/`.

### Key lib modules
- Auth/DB: `lib/firebase.ts` (client, `getDb`/`getAuth`), `lib/firebase-admin.ts` (`verifyRequestAuth`, `getAdminDb`).
- Trust chain: `app/api/runs/create/route.ts` (immutable HMAC-signed runs), `lib/run-guard.ts` (`enforceActiveRun`), `lib/project-loader.ts` (`loadProjectAndHydrate`), `lib/audit-pack.ts` / `lib/audit-pack-verify.ts`.
- ABAP engine: `lib/abap/evidence-model.ts` (`buildAbapEvidence`), `code-assessment.ts`, `extensibility-router.ts`, catalog layer (`catalog-service.ts`, `sap-api-catalog.ts`).
- Clean core levels A–D: `lib/abap/abcd-classification.ts` (pure, no imports — the consuming panel is a client component), lookup via `gradeSapObject()` in `catalog-service.ts` (server-only), batch lookup for clients via `/api/abcd-classify`. Two synced SAP artifacts back it; see `docs/ARCHITECTURE.md` §4.1–4.3. The grade is **never** part of the signed audit pack.
- Crypto/secrets: `lib/s4-credentials.ts` (AES-256-GCM), `lib/mfa.ts`, `lib/approval-token.ts`.

## Conventions

- Path alias `@/*` → repo root (e.g. `@/lib/...`, `@/components/...`).
- **No global state library and no React Context** — component-local `useState`/`useEffect` + Firestore as source of truth via `getDb()` and the `useUserProfile` hook.
- Naming: components `PascalCase.tsx`, hooks `useX.ts`, lib modules kebab-case, route handlers always `route.ts`, pages `page.tsx`, stage folders lowercase verbs.
- Styling: Tailwind v4 + `clsx`/`tailwind-merge` (`lib/utils.ts`), dark mode via `dark` class from profile. Icons `lucide-react`, diagrams `mermaid`/`@xyflow/react`, charts `recharts`, animation `motion`.
- Security: Gemini keys **never** reach the client — always proxy through `/api/gemini`. Mutating API routes require a verified Firebase ID token. CSP is set in `middleware.ts`; HTML sanitized via `lib/sanitize-html.ts`.

## Deploy — Cloud Run via GitHub Actions

`.github/workflows/deploy.yml` ("Secure CI/CD Pipeline") triggers on push to `dev`/`release`/`main`. Job `validate` (lint → build → Playwright on emulator) then `deploy` (OIDC to GCP `cleancore-491216`, `europe-west1`):

| Branch | Cloud Run service | URL |
|---|---|---|
| `main` | `clean-core` | https://clean-core.io |
| `release` | `clean-core-test` | https://test.clean-core.io |
| `dev` | `clean-core-dev` | https://dev.clean-core.io |

There is **no** Firebase Hosting deploy; `firebase.json` is only rules + emulators. `vercel.json` only sets cache headers.

## Diagnostics / logs (both CLIs are installed & authenticated)

GitHub Actions — repo `sonnyfrenzel-rgb/clean-core.io`:
```bash
gh run list -L 10                 # recent CI runs
gh run view <run-id> --log        # full log of a run
gh run view <run-id> --log-failed # only failed steps
```

Cloud Run logs — GCP project `cleancore-491216`:
```bash
gcloud run services list --region=europe-west1
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name="clean-core"' \
  --limit=50 --freshness=1h --format='table(timestamp,severity,textPayload)'
gcloud builds list --limit=10     # Cloud Build history
```

## Skills available (user-level `~/.claude/skills/`)

- **SEO/GEO:** `seo-audit` (diagnostic report), `seo-geo-optimizer` (SEO+GEO+AEO, stdlib-only Python scripts — run with `python`, not `python3`), `indexing-issue-auditor` (crawl/index/sitemap audit). The app has a large SEO surface: `app/robots.ts` (AI-crawler allowlist: GPTBot/PerplexityBot/ClaudeBot/…), `app/sitemap.ts`, per-page `metadata` + `alternates.canonical`, JSON-LD `@graph` in landing pages (`app/page.tsx`), ISR `revalidate = 300`.
- **Firebase:** `firebase-basics`, `firebase-auth-basics`, `firebase-security-rules-auditor`, `firebase-ai-logic-basics`, `firebase-app-hosting-basics`.
- Native (no skill needed): Jupyter via the `NotebookEdit` tool; charts via the `dataviz` skill.

## Landing page — one style, enforced

`app/page.tsx` must not write a section header of its own. Every one comes from
`components/SectionHeader.tsx`, which owns the eyebrow pill, the `h2` scale and
the lead. Three knobs and no more: `align` (`center` | `left`), `tone` (`light` |
`dark`), `titleId`.

Why it is a component rather than a convention: the page had drifted to three
eyebrow variants, four heading scales, an emoji on one section, an `h3` where an
`h2` belonged, and one section with no header at all. Nobody decided any of that
— every section carried its own copy of the classes and nothing compared them.

`tests/landing-style-guard.spec.ts` holds the line, and the rendered half is the
half that matters: it reads the live page and compares the computed font, weight,
letter-spacing, size and colour of every `[data-section-heading]` against the
first. A source guard can be satisfied by a component that quietly accepts a
`className` override; computed style cannot.

**Colour shades must be declared.** `app/globals.css` has an `@theme` block with
56 half-step shades — `slate-650`, `gray-955`, `green-150`, `emerald-505` and the
rest — because Tailwind emits *nothing* for a shade it does not know, and the
element then silently inherits its colour. 131 usages across the app were doing
exactly that: they looked close enough, and two headings side by side were not two
shades apart but one styled and one not. Inventing a shade is fine; inventing it
silently is not, and the same spec fails the suite on any colour class naming an
undeclared shade.

## Gotchas

- **Node version:** package.json requires `>=22.8`; the local machine currently runs **v20.12.2**. `npm run dev`/`build` may warn or fail on engine checks — bump Node to 22 LTS for parity with CI/Cloud Run.
- **Never regenerate `package-lock.json` on local Node 20.** npm 10.5 resolves the `overrides` block differently from the npm 11 in the Cloud Run buildpack: it silently drops nested entries (e.g. `@apidevtools/json-schema-ref-parser/node_modules/js-yaml`), CI's `npm ci` still passes, and the deploy then dies in Cloud Build with `npm ci can only install packages when your package.json and package-lock.json are in sync`. Use the matching toolchain — `npx --yes --package=node@22 --package=npm@11 -- npm install --package-lock-only` — and validate with the same prefix plus `npm ci --dry-run` before pushing.
- Ignore for code work: `scratch/`, `tmp/`, `dist/` (stray build artifact — gitignored; the project is web-only, there is no desktop/Electron app), `clean-core-video/`, and committed `*-debug.log` files.
- Builds fail on any TS or ESLint error (`next.config.mjs` sets `ignoreBuildErrors: false`) — keep the tree clean before committing.
