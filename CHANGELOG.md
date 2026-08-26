# Changelog

All notable changes to the Clean-Core.io platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.4.1] — 2026-08-26

Everything an external code review found, worked through. A Grok 4.6 pass over
the whole codebase produced roughly twenty findings; each was reproduced against
the code before being acted on, and two were refuted rather than fixed. Five
engine defects shipped in v2.4.0; this release covers the rest, plus a rebuilt
benefit section on the landing page.

The full triage, and the raw review output unedited, are in `docs/reviews/`.

### Fixed — numbers nobody measured

The delivery handover screen read `project?.testCases?.length || 10` and
`coverageEstimate?.percentage || 92`. With those fields missing — and because
`length === 0` is falsy, also when a run generated nothing at all — it stated
**10 automated tests and 92% estimated coverage**, under a green tick, on the one
screen a customer photographs for a steering pack. Two more sites did the same
for confidence: 95% routing confidence in Analyze, and 75% recommendation
confidence in Design, the latter directly above the architect's signature.

All four now say what is true: "No test suite generated", "Coverage not
estimated", "Confidence not computed". `ArchitectSignOff.confidenceScore` is
optional, so a caller cannot silently default it, and the tick in front of each
line follows the fact rather than the layout. Product defaults are untouched —
the free tier's 5 transformations is configuration, not a measurement.

### Fixed — security

- **A rate-limited verification reported a valid pack as forged.** `QuotaError`
  carries `.status`; `/api/export/verify` and `/api/audit-pack/create` tested
  `.statusCode`, so the 429 branch was unreachable and the outer catch answered
  HTTP 200 `{ valid: false }`. The 31st verification in a minute told an auditor
  the signature was bad. Both now test the property the class sets, and the
  failure path returns 500 with no `valid` field: failing to check a signature is
  a different statement from checking it and finding it bad.
- **The trust chain did not require MFA.** Firebase Auth issues a valid ID token
  before any custom second factor runs — the TOTP prompt is a React state change,
  not an authentication step. `assertMfaSatisfied` guarded the S/4, Gemini and
  secrets routes but not the two that MINT signed runs and signed audit packs,
  nor project deletion, which destroys the runs underneath. Those three are now
  gated. An audit of every mutating route found the rest already covered:
  `account/delete` and `mfa/disable` use `assertMfaStepUp`, and the four admin
  routes use `assertAdminStepUp`, which also requires recent auth and an enrolled
  factor.
- **Two client sign-in paths let a session survive.** The email path read the
  profile inside the same `try` as the credential check, so a Firestore error
  surfaced as "Invalid email or password" while the session stayed live and the
  MFA branch never ran — the user was signed in by an error telling them they
  were not. The redirect path went straight to the dashboard without consulting
  the profile at all, skipping the second factor on that path only. Both now fail
  closed.
- **Stored S/4 credentials could be sent to a caller-supplied URL.** Four routes
  merged the stored connection field by field, so a request could ask for the
  vault and supply its own `url` — and the decrypted password went there.
  `resolveS4Connection()` now owns the invariant for all four: stored means the
  whole connection identity comes from storage, or nothing does.
- **Any non-boolean granted admin.** `isAdmin !== false` gave the claim to the
  string `"false"` and to `"0"`.
- **Shell injection in the weekly usage report.** `${{ inputs.recipient }}` was
  interpolated into a `run:` block in a job holding `id-token: write`, GCP
  workload identity federation and the Resend key. The input now reaches the
  shell only as an environment variable.
- **Consent was recorded where it was never given.** Google auto-provisioning
  wrote `termsVersionAccepted`, so the record existed and the person was never
  asked. Those fields are gone from that branch; the sign-up form's Google button
  is gated on the same checkboxes as its submit button. The email registration
  path also recorded `identityProvider: 'google'`.

### Fixed — four more, from the same review

- **An OData service path was constrained in one route and not its sibling.** The
  SSRF allowlist decides which *host* may be reached; nothing decided which
  *path*, so `/api/fetch-s4-metadata` concatenated the raw body value onto an
  allowlisted host and could read anything those credentials can — the vault's,
  under `useStoredCredentials`. `isSafeODataServicePath()` now lives in
  `lib/url-validation.ts` and both routes use it.
- **The audit pack export timestamp never landed.** Firestore's `set` does not
  interpret dotted field names — only `update` does — so
  `set({ 'auditMetadata.auditPackExportedAt': x }, { merge: true })` created a
  literal top-level field with a dot in its name and left the intended one unset.
  No exception, no warning. Written nested now; a scan confirmed it was the only
  instance.
- **The compliance HUD claimed 100 %.** Two substitutions:
  `project?.cleanCoreScore || 70` invented a baseline for an unscored project,
  and `signOffFindings.length > 0 ? … : 100` declared full compliance whenever no
  finding happened to require sign-off — which happens on a parse miss, on empty
  source, and whenever all findings are informational. It overrode a real stored
  score of 40 with a green ring. The project's own score now stands, and an
  unscored project shows "Not scored yet" rather than a number.
- **The Jira flow reported success it had not achieved.** The callback sent
  `JIRA_AUTH_SUCCESS` while token persistence is still a TODO, and the modal's
  sync ran a timer and jumped to a success screen. Nothing renders that modal
  today, but a fake success in the tree is a trap for whoever wires it up.

### Known, not fixed in this release

- Sign-offs in the transformation view are component state only, so a refresh
  discards them and the score moves back. Persisting them is a product change,
  not a fix.
- The published fallback signing key (`dev_audit_signing_key_fallback_clean_core`)
  remains in three routes, and `tests/audit-compliance-v181.spec.ts` signs with
  it and asserts the result is valid — so setting a real `AUDIT_SIGNING_KEY` in
  CI would break the suite. Production is protected by the deploy guard, which
  fails the deploy when the secret is missing. Closing this needs a decision
  about giving CI its own key.
- Four medium findings remain open and are listed in
  `docs/reviews/2026-08-26-TRIAGE.md`.

### Fixed — two Rules of Hooks violations

`UserOnboarding` returned on `!auth` before its `useEffect`: the server render
stopped early (auth is null there) while the browser render ran it, and React
throws on the hook-count mismatch during hydration. `RoutingRationale` returned
on a missing route before its `useMemo`, which fires whenever a project loads
asynchronously and the same instance renders again with a route. Both guards
moved below the hooks.

### Changed — the landing page benefit section

Rebuilt around the two questions every legacy decision waits on, and moved below
the slideshow. A competitor scan drove the shape: smartShift inventories code and
reports retain/retire/redesign; CoreAssess.AI produces a backlog and sells on
"up to 70% faster"; SAP Signavio is the only one facing the business and it mines
transaction data, so it can show a process is slow but not what a Z-program does
inside it. Everyone ships a backlog, and a backlog never says why the program
exists.

So "What does this thing actually do?" leads and takes three fifths of the
width, with the artifacts drawn rather than listed — a plain-language answer, a
BPMN flow, a RACI in business roles. "How much work is this?" sits beside it with
the 21/17/4 split. Still no time or percentage claim: against "70% faster" the
answer is a reproducible figure, not a larger one.

### Refuted — checked, not defects

- *"Unhandled release states are counted as residual C."* Both generated
  artifacts contain only `released`, `notToBeReleased`, `deprecated`,
  `classicAPI` and `noAPI`. Enumerated.
- *"`set({chargedInputs}, {merge:true})` replaces the map and breaks quota
  idempotency."* Firestore merges map fields recursively. Proven on the emulator:
  after writing a second fingerprint the first is still `true` and the counter
  reads 2.

### Added — guards for each class of defect

`no-fabricated-figures`, `credential-and-consent-guard` and `mfa-coverage-guard`
(37 tests). Mostly source-level, because each defect is a shape rather than a
behaviour: `|| <number>` on a measured value, a `${{ }}` expression inside
`run:`, a hook after an early return, a field-by-field merge of stored
credentials. The MFA spec lists both which routes must require the factor and
which must not — enrolment cannot depend on the factor being enrolled — so adding
a route forces a decision instead of defaulting to unguarded.

Also `reference-analysis.spec.ts`, which guards the published run's properties
rather than freezing its numbers: the buckets partition the findings exactly,
nothing counts as settled without a real catalog lookup, and the handed-back
bucket is never silently emptied. An empty red band would read as "we transform
everything".

223 passed, 0 failed.

## [v2.4.0] — 2026-08-26

Clean core levels stop being an estimate. SAP publishes a second classification
file that this repo was not syncing; with it, levels A, B and D become lookups
against SAP's own data instead of inferences from a risk heuristic. Alongside
that, the search-visibility fixes that three months of Search Console data
showed were losing traffic the site had already earned.

### Added
- **`objectClassifications_SAP.json` is now synced** (formatVersion 2, 8,587
  entries after normalisation). It carries the two states that separate level B
  from level D: `classicAPI` (8,116 — documented, upgrade-stable classic APIs)
  and `noAPI` (471 — not intended for customer use). It is near-disjoint from
  `objectReleaseInfoLatest.json` (196 keys overlap), so catalog coverage grows
  from 23,696 to **32,103** classified objects.
- **`gradeFromSapStates()` and `gradeSapObject()`** derive the clean core level
  from SAP data: `released` → A, `classicAPI` → B, `noAPI` / `notToBeReleased`
  → D, `deprecated` → C with a successor and D without. An SAP object listed in
  neither file is graded C, which is what the clean core level concept defines
  level C to be. Every result carries a `provenance` field (`catalog`,
  `catalog-residual`, `heuristic`).
- **`/api/abcd-classify`** — auth-gated, read-only batch lookup, capped at 500
  objects per call. It exists because the analyze panel is a client component
  and the catalog artifacts are ~4 MB: names go out, grades come back, and the
  analyze bundle stays at 161 kB.
- **A–D census on `/sap-clean-core-object-classification`** — the distribution
  across everything SAP publishes (A 72.1% · B 24.7% · C 0.2% · D 3.0% over
  32,103 objects), with both source files named by sha256 and fetch date so the
  figures can be reproduced. Labelled as a census of SAP's data, not a
  benchmark of any customer's code.
- **Enhancement and modification detection** — two new evidence kinds. Statement
  level: `ENHANCEMENT`, `ENHANCEMENT-POINT`, `ENHANCEMENT-SECTION` (level D
  technologies), `GET`/`CALL BADI` and `CL_EXITHANDLER=>GET_INSTANCE` (level B,
  reported at low severity so an SAP-provided extension point is not penalised
  like a modification). Modification markers (`*{ INSERT|REPLACE|DELETE`) are
  full-line comments that `tokenize()` drops by design, so they are matched
  against the raw source in a separate pass — without it, the most severe clean
  core violation was invisible to the engine. Both feed the Clean Core Score.
- **`/llms.txt`** — previously a 404. States what the site holds, the figures
  worth citing with their provenance, the entry points and the limits. Figures
  are read from the generated artifact, not hardcoded.
- Registry entries for the 2025 PCE releases and the BTP release file. A grade
  is release-dependent: an object released in 2025 is still unreleased against
  a 2023 target.

### Changed
- **The A–D grade is now presented in two tiers instead of one blanket
  disclaimer.** Looked-up grades are marked "SAP data" with the state that
  produced them; only customer Z/Y objects, which SAP cannot have classified,
  fall back to the heuristic and are marked "est.". The analyze panel states
  the split ("N of M grades come from SAP's published object data"). The grade
  remains outside the signed audit pack, and every surface still says so.
- **Catalog object pages show the clean core level** under the object name
  (VBAK → D, `notToBeReleased`; MAKT → C, listed in neither file).
- **`/knowledge` FAQ answers are in the server HTML.** They were rendered as
  `{isActive && (...)}` with `activeFaq` starting at `null`, so the page shipped
  five headings and no substance — 5,401 characters of visible text in a 63,719
  byte page, with the answers reachable only inside the JSON-LD block that text
  extractors strip. The answer now stays in the DOM and collapses visually; the
  header became a real button with `aria-expanded`/`aria-controls`. Visible
  text: 5,401 → 8,633 characters.
- **`dateModified` in the homepage JSON-LD tracks the release constant.** It was
  frozen at 2026-06-26. The new `APP_RELEASE_DATE_ISO` is an explicit literal:
  deriving it from `APP_RELEASE_DATE` via `toISOString()` shifts the date one
  day back in every positive UTC offset, CET included.
- **`/sap-cloudification` leads with the lookup.** It held position 8.4 on
  "cloudification repository (viewer)" queries at 0.11% CTR because its snippet
  read as an article. Title, description and an above-the-fold entry point now
  point at `/catalog`, which already carried the correct title but ranked lower.
- **`/whitepaper` retitled** to lead with the searched term rather than the
  product name (position 12, 0% CTR over three months).
- **SAP BAIP is documented alongside SAP BTP, not instead of it.** SAP announced
  the Business AI Platform at Sapphire 2026, but shipped "SAP BTP ABAP
  Environment — Release 2608" on 15 August 2026 under the old name. BTP stays
  as the name of the concrete services; BAIP is noted as the portfolio around
  them in the glossary, the chatbot knowledge base and on `/knowledge`.

### Fixed
- **The ATC severity mapping is no longer asserted as SAP doctrine.** `ABCD_META`
  published A/B/C/D = no message/P3/P2/P1 as fact, and no SAP source for that
  mapping could be cited. The field is now `atcReading` and is shown as our
  reading; the four places in public copy claiming the grades "map to ATC
  priorities" no longer say so.
- **FUGR rows in the classification file are indexed by function module.** SAP
  puts the function GROUP in `tadirObjName` and the MODULE in `objectKey`, and
  custom code calls the module — 5,246 entries would otherwise have been filed
  under a name nothing looks up.
- `released` takes precedence over `classicAPI` for the 196 objects listed in
  both files. Reversed, it would have silently downgraded released objects from
  A to B. Covered by test.
- The hero on the classification page said SAP grades "technical objects"; SAP
  grades extensions.

### Fixed — false positives found by an external code review

A Grok 4.6 review over the full codebase surfaced four defects in the evidence
engine, all reproduced before fixing. Three of them predate this release; they
are fixed here because they put wrong findings in front of architects.

- **Internal table operations were reported as database writes.** ABAP spells
  internal-table and database access with the same keywords, and the detectors
  matched the first token after INSERT/MODIFY/DELETE. `INSERT ls_wa INTO TABLE
  lt_vbap.` produced a Critical "direct write to SAP standard table LS_WA", and
  `INSERT LINES OF …` produced one against an object called LINES. Since every
  real ABAP program uses internal tables constantly, this inflated the Critical
  count, depressed the Clean Core Score and could flip the routing decision to
  side-by-side. The engine now collects the data objects declared in the source
  and excludes them, guards on the clauses that only exist in the internal-table
  form, and treats `DELETE itab WHERE` (no FROM) as internal. Where syntax alone
  cannot decide — `MODIFY lt_x FROM ls_y` and `MODIFY dbtab FROM ls_y` are
  identical — a conventional ABAP prefix decides, but only for names absent from
  both SAP artifacts: 103 real SAP objects (CS_BOM_EXPL_MAT_V2, RS_*, CT_*) share
  those prefixes and must stay detectable.
- **The correct ABAP Cloud pattern was reported as a violation.** `SELECT * FROM
  i_salesorder` was a High "illegal standard-table read" on public cloud, with
  the invented successor `I_I_SALESORDER`. I_SALESORDER is `released` in the
  artifact the engine already loads. Released objects are now the target state,
  not a finding.
- **Successors are no longer guessed.** An unmapped object produced
  `sapReplacement: I_${name}` at confidence "Candidate" — an object that does not
  exist, shown beside a catalog version. Only real catalog matches are emitted.
- **The release state now decides before the classification state.** 180 objects
  appear in both SAP files; 158 are released, and the other 22 are `classicAPI`
  together with `notToBeReleased` or `deprecated`. 21 of those 22 carry an
  explicit successor (CL_HTTP_CLIENT → IF_WEB_HTTP_CLIENT, CL_BCS →
  CL_BCS_MAIL_MESSAGE). Level B means "usable where no level A path exists", and
  here SAP names the path, so B was wrong. The published census moves
  accordingly: B 7,958 → 7,936, D 938 → 959, C 68 → 69.
- **Reserved-namespace objects are no longer claimed as SAP-internal.**
  `/ACME/TABLE1` was graded residual C, and a write to `/ACME/ZTAB` was a
  Critical standard-table violation. A `/NS/` name can belong to SAP, a partner
  or the customer; when it appears in neither artifact the grade falls through to
  the heuristic and is labelled estimated. Namespaced objects SAP does list
  (/AIF/CL_TRANSFORM_DATA) keep their catalog grade.

### Added — a guard against the class of bug above

`tests/false-positive-guard.spec.ts` (16 tests). The three existing engine specs
carry 116 assertions between them and not one asserts absence — no
`toHaveLength(0)`, no `.not.`, no `toBe(0)`. Every test states that a pattern
*produces* a finding, so a detector that fires on everything passes all 116. That
is how these defects survived. The new spec asserts what must NOT be reported,
with a "must still fire" block so suppression cannot regress the other way.
- **`tar` bumped past GHSA-r292-9mhp-454m.** The existing override pinned
  `^7.5.16`, which resolved to 7.5.19 — still inside the advisory's `<=7.5.20`
  range, so the Security CI gate (audit-ci, high+) failed while the deploy gate
  (`--omit=dev --audit-level=critical`) passed, because `tar` is a dev-only
  transitive. Override is now `^7.5.21`, resolving to 7.5.22. The lockfile was
  regenerated with the pinned Node 22 / npm 11 toolchain, and the nested
  `@apidevtools/json-schema-ref-parser/node_modules/js-yaml` entry that local
  npm 10.5 silently drops was verified present afterwards.

## [v2.3.1] — 2026-08-20

Community activation. A long-form Clean Core explainer built to be forwarded, a
paper edition of it as a PDF, and the sharing affordances around both. Nothing in
the analysis engine or the trust chain changed.

### Added
- **`/clean-core-explained` — the complete Clean Core explainer.** Seven parts,
  about twenty minutes, every term defined before it is used: from what "the core"
  is and why modifying it breaks upgrades, through the five dimensions and the
  in-app-versus-side-by-side decision, to the A–D grading model. Part 6 states what
  Clean-Core.io does per stage with its benefit, its effort and — as plainly —
  *where it stops*, followed by Honest Scope.
- **Content as data.** `lib/clean-core-guide.ts` and `lib/clean-core-capabilities.ts`
  hold the material; the visible text and the `Article` + `FAQPage` JSON-LD are
  generated from the same objects, so the two cannot drift.
- **`/clean-core-explained-print` and a PDF build step.** A second renderer over the
  same data with a cover, controlled page breaks and ink-frugal styling, printed to
  `public/clean-core-explained.pdf` by `npm run build:guide-pdf` (Chromium, so the
  result is vector text with real page numbers). `-- --check` compares a hash of the
  source files against `public/clean-core-explained.pdf.sha256` and fails if the PDF
  is stale. The route is `noindex` and outside the `(app)` group, so it inherits no
  header, footer or chatbot.
- **Share bar at the top of the guide** (`components/GuideShareBar.tsx`): copy the
  link, download the PDF, share on LinkedIn. Staggered entrance, hover lift and a
  copied-state confirmation; everything collapses to a plain fade under
  `prefers-reduced-motion`.
- **Landing announcement.** A "NEW" pill above the hero eyebrow pointing at the
  guide, plus nav, footer, sitemap and knowledge-hub entries.
- **Campaign registry in the bulk sender.** `scripts/send-community-mail.ts` now takes
  `--campaign`; the id recorded in `email_sends`, the subject and the two template
  files are registered together so they cannot drift apart.

### Changed
- **Landing header spacing.** A fourth nav item made the labels wrap onto two lines,
  which read as uneven spacing. Labels are now `whitespace-nowrap`; to make room the
  community badge appears from `2xl` and *Classification A–D* from `xl` (both remain
  reachable from the hero eyebrow and the footer). Verified at 390 / 768 / 1024 /
  1152 / 1280 / 1440 / 1536 / 1920 px.
- **Comparison tables restack on phones.** `.doc-table` (in `app/globals.css`) turns
  three-column tables into labelled blocks below 640px — one DOM, so crawlers and
  screen readers still receive a real `<table>` instead of a sideways scroll.
- **Print edition: 21 pages down to 15.** `break-inside: avoid` on `.chapter` was the
  cause; two chapters measured 1001px and 1090px against a 979px page, so the rule
  could not be honoured and the fragmenter stranded the pages before them at under
  16% full. Only small units stay atomic now, `.part:first-of-type` (which never
  matched, because the answer box is also a `<section>`) became an explicit class,
  and the setting is tighter — body leading 1.62 → 1.52, a narrower term column —
  so the vocabulary list and the FAQ each fit their page.

### Removed
- **`/api/share/guide`, the mail-the-PDF endpoint.** Removed at the owner's call
  before it saw real traffic. An unauthenticated endpoint that sends mail from this
  domain to an address a stranger types is a spam relay unless every defence holds
  at once, and the domain also carries the community list — one abuse incident would
  have cost deliverability for every recipient on it. The defences were in place
  (constant subject, name stripped to letters, per-IP and global rate limits,
  honeypot, nothing stored), but the downside was uncapped and the upside was saving
  a sharer one attachment step. The download covers the same intention.

### Operations
- Community mail `clean-core-explained` sent to 30 recipients (0 failures); the
  account holder had already received it as the test send.
- The manually-registered "Super Duper" test account was added to
  `email_suppressions` — `lib/test-accounts.ts` only recognises CI-created accounts,
  and `ifcoat.com` is a disposable-mail domain, so a bounce there would have cost
  reputation on the first bulk campaign.

## [v2.3.0] — 2026-08-19

Metering realignment. The free community quota now counts what the product actually
promises — ABAP-to-Cloud transformations — instead of individual AI calls, and the
Admin Control Room gained a live view of that consumption per user.

### Changed
- **The metered unit is now one analysis run, not one Gemini call (BREAKING for
  metering semantics).** The quota gate moved from `/api/gemini` to
  `/api/runs/create` (`reserveRunQuota` in `lib/firebase-admin.ts`). Previously every
  AI request was charged, so a single ABAP object cost 6–7 units across the seven
  workflow stages — a free account could not finish one project, which contradicted
  both "Up to 5 ABAP-to-Cloud transformations" and "Full 7-stage modernization
  workflow — every feature included" on the pricing card, and Terms §6. One object
  now costs exactly one unit; design, transformation, documentation, testing, TCO and
  delivery are unmetered.
- **The glossary chatbot no longer consumes quota.** It falls out of metering with the
  gate move, without a special case in the code. The same applies to the test-suite
  self-healing loop, which could previously burn up to five units in a single click.
- **Charging is idempotent per source fingerprint.** Re-analysing the same ABAP source
  — a retry, a tweak, the same object in a second project — is free. Paid-for
  fingerprints live in `users/{uid}.chargedInputs`, which the Firestore rules keep
  outside the client's write allowlist, so it cannot be forged.
- **Terms §6 now names the unit precisely** — what counts, what does not, and that
  re-analysis is free.

### Added
- **Starter examples for every account.** `abap_examples` is per-user and starts
  empty, so an approved account's first task was extracting custom ABAP out of a
  customer system — an IP and effort hurdle before any value had been shown, and
  two thirds of accounts never cleared it. Seven realistic, fictional legacy reports
  (87 to 1,000 lines, the same files the engine is regression-tested against) now sit
  on the dashboard above the personal library. One click creates the project with the
  source staged and lands in the analysis. Served from `public/starter-examples/` and
  fetched on demand, so the ABAP never enters the client bundle.
- **`/first-run` — the click-by-click first run.** Seven steps from signing in to a
  downloadable package, naming the literal on-screen labels and what should appear
  after each click. `/how-to` keeps the narrated tour and links here.
- **One-click unsubscribe (RFC 8058).** `POST /api/unsubscribe` honours an
  unauthenticated, signed-token opt-out — the `List-Unsubscribe` /
  `List-Unsubscribe-Post` target Gmail and Yahoo require of bulk senders. GET hands
  the reader the `/unsubscribe` confirmation page instead of acting, since scanners
  and prefetchers follow GETs. Opt-outs land in `email_suppressions`, server-only in
  the rules. Tokens are HMAC-signed with `PILOT_APPROVAL_SECRET` under a separate
  `unsub` purpose (`lib/unsubscribe-token.ts`), so no new deployment secret is needed.
- **`scripts/send-community-mail.ts`** — batched bulk sender. Dry run by default;
  excludes CI accounts, suppressions and anyone already recorded in `email_sends` for
  the campaign, so an interrupted run resumes without double-sending.

- **Admin Control Room: "Usage & Quota" section** (`components/admin/UsageQuotaPanel.tsx`).
  Live `onSnapshot` on `users` — no new API surface — with a KPI strip (units consumed
  vs. granted, distinct ABAP objects, active last 7 days, accounts at limit, BYOK,
  total), per-user meters, filters (at limit / active / unused / BYOK), search, sorting
  and an expandable per-user detail row.
- `tests/admin-usage-panel.spec.ts` — E2E coverage of the panel against a seeded cohort
  (fresh, partial, exhausted, BYOK, pending), including a clipping measurement on the
  expanded detail row.

### Removed
- The dead client-side charging path: the `incrementTransformations()` no-op in
  `useUserProfile` and the `charged`-flag guard in the analyze stage, both of which
  suggested a per-project charge that had not been in effect since F-06.

### Security
- `/api/gemini` keeps authentication, MFA, the account-state gate and `assertRateLimit`.
  With per-call metering gone, that rate limit (20/h per user+IP) is now the primary
  cost guard on the shared community Gemini key.

## [v2.2.0] — 2026-07-11

Codex Delta "part 2" — the trust-boundary items deferred from v2.1.0, done as
non-breaking changes with live-production safety as the hard constraint (E2E stays
green, the environment stays runnable). Structured and verified via the fable-method loop.

### Changed
- **Untrusted test runner is now network-egress-blocked (F-01, P0).** `/api/run-tests`
  preloads a guard into the sandboxed child (`--import __netguard.mjs`) that neutralises every
  outbound path — `net.Socket.prototype.connect`, `net.connect`/`createConnection`, `dgram`,
  global `fetch`, `process.binding`, and every `dns` entry point (c-ares/getaddrinfo bypass
  `net.Socket`) — BEFORE the test bundle loads. With the existing Node
  permission model (no child-process/worker/native-addon escape), pure-JS test code can no
  longer reach the GCP metadata endpoint (`169.254.169.254`) or any network — closing the
  runtime-identity token-exfiltration path. **In-cloud CAP test execution is kept.** Verified
  locally through the real `node:test` runner path (fetch/`net.connect` blocked, normal tests
  pass). Defense-in-depth, not a formal microVM boundary — the isolated runner service remains
  roadmap.
- **Audit pack ships a signed provenance manifest (F-04).** A new \`00-provenance.md\` (hashed +
  HMAC-signed like every other file) labels each evidence file and headline field by class —
  \`server-computed\` / \`model-generated\` / \`user-attested\` / \`static\` — making the
  signature's meaning explicit (package integrity, not per-value determinism) so auditors can
  separate deterministic facts from AI drafts and self-attested inputs.
- **A/B/C/D preview derivation is more honest (F-05).** Added an \`Unknown\` grade for
  insufficient evidence (no more silent default to Medium), unknown catalog state now maps to
  \`Unknown\`, and a \`worstGrade()\` worst-finding rollup helper — unit-tested
  (\`tests/abcd-classification.spec.ts\`). Still a labelled preview, excluded from the signed pack.

### Deferred (roadmap)
- Fully isolated zero-trust runner service (F-01 gold standard), append-only reviewEvents
  provenance refactor (F-04), full SAP target-release A/B/C/D model (F-05), dedicated runtime
  service account (F-12), operational control-evidence pack (F-13), and asymmetric
  offline-verifiable signatures (F-18) — infra/crypto-heavy, deferred to protect live stability.

## [v2.1.0] — 2026-07-10

Trust-boundary hardening per the Codex v2.0.0 Delta / Tiefenanalyse review (2026-07-10).
Closes the central-authorization, deletion, admin-MFA, provenance-labeling and claim-hygiene
findings (gates G0–G2). The untrusted test-runner network isolation (F-01, P0) is tracked
separately and intentionally deferred in this release.

### Added
- **Central account-state gate `assertAccountActive`** applied to every business API
  (`/api/gemini`, `/api/runs/create`, `/api/audit-pack/create`, `/api/run-tests`,
  `/api/secrets/gemini`): a `pending`/`suspended`/stale-Terms account is consistently 403 —
  **including the BYOK path**, which previously bypassed the shared-quota approval check (F-02).
- **Server-authoritative project deletion** `DELETE /api/projects/{id}` using Admin SDK
  `recursiveDelete`, so the immutable `runs/{runId}` subcollection is purged too. Client
  project deletes are disabled in Firestore rules; the account-erasure cascade gained a
  collection-group backstop for legacy orphaned runs (F-03).
- **Server-authoritative Terms consent** `POST /api/consent`: append-only `consent_events`
  (server timestamp + server-derived email), mirrored to the profile; the account gate
  enforces re-consent when a previously accepted version goes stale (F-16).

### Changed
- **A/B/C/D "Cloud Readiness Classification" is now an explicit Experimental Preview** in the
  analysis panel and knowledge page, and is **removed from the signed audit pack** — it is a
  heuristic estimate, not an authoritative SAP ATC classification (F-05).
- **Admin actions require enrolled MFA** — `assertAdminStepUp` fails closed without it in
  production (relaxed only under the Firebase emulator for CI/E2E) (F-06).
- **Account erasure no longer swallows partial failures** — errors are collected, a missing
  resource is tolerated as idempotent, and a partial erasure throws instead of reporting
  success (F-07).
- **Rate-limit records are pseudonymised** (HMAC document id) and carry an `expiresAt` for a
  Firestore TTL, so they hold no durable PII and self-expire (F-10).
- **Gemini model allowlist** cleaned — dead 2.0 IDs removed; GA vs. preview documented (F-09).
- **Overstated public claims corrected** across the whitepaper page + PDF, board deck,
  homepage, trust page, feature content, transactional emails, settings and onboarding:
  "deterministic AST engine" → deterministic evidence scanner; "credentials in memory only" →
  encrypted at rest, server-side only; "atomic/immediate erasure" → idempotent multi-system
  workflow; "GDPR-compliant by design" / "conform fully to GDPR" → GDPR-aligned; "all
  permissive licenses" → generated inventory reviewed per build; residual "Tier-2" → "classic";
  fixed the `vv2.0.0` double-`v` render (F-08, F-14).
- **Security dependency audit is now a required deploy gate** (`deploy.needs: [validate,
  security]`, `npm audit --omit=dev --audit-level=critical`); the client-bundled
  `NEXT_PUBLIC_GEMINI_API_KEY` test env var was removed (F-11).
- **Old `/sap-tier-2-extensions` URL** permanently redirects to
  `/sap-clean-core-object-classification` (F-17).

### Fixed
- **`scripts/verify-export.ps1`** uses `-LiteralPath` throughout, so Next.js dynamic-route
  files (`[projectId]` etc.) no longer report a false "File missing" (F-15).

### Security / deferred
- The mock purchase-order route and the incomplete Jira OAuth callback are gated out of
  production behind flags so they cannot return a simulated success (F-19, F-20).
- **Deferred (roadmap):** isolated zero-trust test runner (F-01, P0), full per-field audit
  provenance model (F-04), full SAP-exact A/B/C/D derivation (F-05), asymmetric offline-
  verifiable signatures (F-18), operational control-evidence (F-13) and the enterprise
  identity/governance track.

## [Unreleased] — Promo-readiness hardening (2026-07-07)

Claim-hygiene and a real GDPR erasure fix ahead of broader promotion, per the Codex
Promo-Readiness Delta review (2026-07-06). No feature changes.

### Fixed
- **Admin account deletion now runs the full GDPR Art. 17 cascade.** `adminDeleteUser`
  previously removed only `users` + `registration_requests`, orphaning projects, immutable
  runs, encrypted BYOK/S4 secrets, MFA data and the Firebase Auth account. It now delegates
  to `deleteUserDataAndAccount` (identical to self-service deletion); the Auth delete is
  idempotent (`auth/user-not-found` tolerated). Covered by a new emulator E2E test
  (_admin console delete-user runs the full GDPR erasure cascade_).

### Changed
- **Softened absolute GDPR/EU/sovereignty claims** to defensible wording across the trust
  page, landing page, about page and board deck: "GDPR-aligned", "EU-hosted storage", and
  explicit disclosure that AI (Gemini) and email (Resend) subprocessors process data under
  their own terms — instead of "GDPR Compliant", "data does not leave the EU",
  "strictly enforced / fully sovereign".
- **Landing `/whitepaper` page** now mirrors the downloadable PDF (LinkedIn whitepaper)
  content and drops the "fits enterprise procurement expectations" wording.
- **Business SOP & Compliance** documentation is generated in pure business language — no
  IT/technical terms (those already live in the Technical Blueprint).
- **Video subtitles** (en/de/es): "Pilot" → "Free Community Edition", "automated SaaS engine"
  → "free community assistant", "final deployable asset" → "reviewable handover package".
- **Footer & sitemap**: added `/terms` and `/licenses` to the shared site footer and sitemap.
- **Terms consent**: record `termsVersionAccepted` + `termsAcceptedAt` at signup (additive
  Firestore rule, deployed to all databases); `COMMUNITY_QUOTA` centralized.

### Removed
- **Stale public self-certification / marketing artifacts** carrying unsupported claims:
  `public/whitepaper-template.html` ("CISO APPROVED", "Customer-Grade", "fully sovereign"),
  `public/QE_Engineer_Report.pdf` + `public/report-template.html` ("RELEASE-TESTS PASSED",
  "This document certifies…"), the `generate-report.js` script + `build:report` npm script,
  and the admin "Quality Engineering Audit" banner.

## [v2.0.0] — 2026-07-02

Special milestone release: a **security-hardened, audit-friendly trust chain and operational readiness** for the Free Community Edition, plus a **sharpened community / complementary narrative**. This is not a certified, procurement-grade enterprise platform — enterprise identity/governance features (SSO, multi-role RBAC, formal DPA/TOMs, external pentest) are intentionally in the backlog for the current audience — see `docs/ROADMAP-2.0.md`.

### Added
- **Server-authoritative audit packs** (`POST /api/audit-pack/create`): evidence files are generated, hashed and HMAC-signed entirely server-side from the immutable run — the client never supplies content or hashes for signing.
- **Complete GDPR Art. 17 erasure**: the deletion cascade now purges `runs` subcollections, encrypted BYOK keys (`user_secrets`) and `mfa_pending`; enforced by an automated test.
- **Supply-chain CI** (`.github/workflows/security-ci.yml`): gitleaks secret scan, `audit-ci` High/Critical gate, and a CycloneDX SBOM.
- **`/api/health`** liveness/readiness probe and **structured JSON logging** on critical routes (`lib/logger.ts`).
- **Public `/trust` page**, `docs/DATA-RETENTION.md`, `docs/INCIDENT-RESPONSE.md`, `docs/OPERATIONS.md`, `docs/ROADMAP-2.0.md`, and **SECURITY.md v4.0** documenting the evidence trust chain.
- **Public SAP Object Catalog** (`/catalog`) — hundreds of SEO/GEO reference pages generated from the merged Cloudification catalog.
- **Test auto-healing**: on a compilation error the AI repairs the offending module/test code and retries automatically.
- Full emulator-backed trust-chain E2E tests (audit-pack + sign endpoint negatives: foreign user, stale run, missing runHash).

### Changed
- **Narrative**: removed monetization/locked-export UI and premium signals — every feature is free (5 transformations; BYOK for unlimited); retired visible "pilot" wording in favour of "Free Community Edition" (internal tier identifiers are kept for compatibility); positioned as **complementary** to SAP tooling (ADT/ATC), not a competitor.
- The **AI narrative is excluded from the signed run payload** — signatures attest to server-computed evidence, not client free-text.
- Global **SAP non-affiliation trademark disclaimer**; removed false "certified / SAP-approved" claims; unified ROI figures; hedged absolute claims.
- Migrated Excel parsing from `xlsx` (unfixed advisory) to `exceljs`; dropped `xlsx`.

### Fixed
- **Empty Solution Design** (production): Firestore rules had never been deployed to the named production database, so the `runs` subcollection was unreadable and analysis never reached downstream pages. Rules deployed to all databases + multi-database `firebase.json` and an `npm run deploy:rules` script.
- **Blank Target Architecture diagram**: the SVG sanitizer stripped mermaid's `<foreignObject>` labels; added a mermaid-aware sanitizer that preserves labels while stripping active content.
- **False "analyzed with an older engine" banner**: run-capability detection now reads findings from `evidenceReport`.
- **Test sandbox "esbuild not installed"**: moved `esbuild` to runtime dependencies.
- `loadProjectAndHydrate` now surfaces run-load failures instead of silently rendering an empty page.

## [v1.22.1] — 2026-07-02

### Fixed
- **Usage Persistence**: Added `usageReport` to Firestore Rules project update allowlist with `is map` validation. Usage imports now persist across page reloads.
- **Usage Bucketing (Low ≠ Dormant)**: Introduced new `low` usage bucket for objects with below-average but non-zero, recent usage. Low-frequency objects (monthly closings, year-end, audit reports) are no longer misclassified as `dormant` or `retire-candidate`.
- **Retire-Candidate Guardrails**: `retire-candidate` quadrant now requires zero usage or 13+ months dormancy. Description updated to require "business owner confirmation" before retirement.
- **Call Count Locale Parsing**: Fixed number format ambiguity where `1,234` (EN) was misinterpreted as `1.234` → rounded to `1`. New locale-aware parser correctly handles DE (`1.234`), EN (`1,234`), mixed (`1.234,00` / `1,234.00`), and space-separated (`1 234`) formats.
- **Solution Design Generation**: Fixed object/string type mismatch in `prepareAnalysisContext()` where Firestore hydration returned analysis as an object instead of a string. Added comprehensive `[Design]`-prefixed debug logging.
- **Evidence Scan Visual Overhaul**: SweepVerdictBar with stronger contrast, colored top borders, scale effects. SweepCodeViewer with larger fonts, line-level severity highlighting. Minimum scan duration increased to 6 seconds.
- **Export Script P0 Fix**: Replaced all `-Path` with `-LiteralPath` in `export-source.ps1` to correctly handle Next.js dynamic routes with square brackets (`[projectId]`).

### Changed
- **Risk Matrix UI**: Added `Low Usage` row with yellow color scheme between Moderate and Dormant. Tooltips for Low, Dormant, and Unknown rows explaining classification logic.
- **package-lock.json**: Regenerated from scratch to fix Cloud Build `npm ci` sync failures (missing `js-yaml@3.15.0`, `argparse@1.0.10`).

## [v1.22.0] — 2026-07-02

### Added
- **Usage Import & Risk Prioritization**: Upload SAP usage exports (SCMON, UPL, ST03N) for usage-weighted risk analysis. Format-tolerant parser with CSV delimiter sniffing and XLSX support via SheetJS.
- **Risk/Usage Matrix**: Interactive 2D quadrant visualization (Usage × Feasibility) with drill-down object detail flyout. Quadrants: Danger Zone, Prioritize, Retire Candidate, Low Priority, Unknown.
- **"Unknown ≠ Dormant" Safeguard**: Objects without usage data always show "Unknown" status with mandatory tooltip. Never classified as unused or retire-candidate without evidence.
- **Privacy-First Import Layer**: Whitelist-based PII sanitization strips usernames, terminals, IPs before persistence. Only object × frequency stored. 90-day retention TTL.
- **UPL Aggregation**: Procedure-level Usage & Procedure Logging exports automatically aggregated to object-level for evidence engine matching.
- **Run Capabilities Extension**: Shape-based `hasUsageData` capability. Usage is optional — absence does not trigger legacy run.
- **Solution Design Rendering Patch**: All design page sections wrapped in SectionBoundary for crash isolation. LegacyRunBanner for pre-v1.14 runs. RoutingRationale/TargetArchitectureDiagram data guards.

### Changed
- `lib/run-capabilities.ts` extended with `usageReport` field and `hasUsageData` capability
- `lib/types.ts` Project interface extended with `usageReport` field

## [v1.21.0] — 2026-07-02

### Added
- **Evidence Sweep Animation (v1.21 Roadmap)**: Real-time animated overlay during analysis that replays the instant `buildAbapEvidence()` scan results. Findings appear sequentially with a glowing scan-line sweeping through the source code, replacing the previous fake loading stages.
- **SweepCodeViewer**: Monospace ABAP code viewer with syntax highlighting, line numbers, finding badges pinned to exact code lines, and auto-scroll following the scan-line position.
- **SweepVerdictBar**: Animated severity counter tiles (Critical/High/Medium/Low) that tick up as findings appear. Verdict "locks in" with glow pulse on completion.
- **EvidenceSweep Orchestrator**: Sequences finding reveals over ~3.5s minimum duration. Gemini API call runs in parallel — results are buffered until the sweep animation completes.
- **Accessibility**: `prefers-reduced-motion` skips animation entirely and shows instant end-state. `aria-live` on verdict region. All new components fully responsive (mobile-first).

### Fixed
- **Solution Design 1000+ LOC Bug**: Fixed critical bug where Solution Design generation failed for large ABAP programs (1000+ LOC). Added `prepareAnalysisContext()` that extracts only design-relevant analysis fields (capped at 15K chars) instead of dumping the full 30-50KB raw analysis JSON into the design prompt.
- **Design Error State**: Replaced silent `alert()` with persistent `designError` state and visible error UI with retry button and contextual guidance.

## [v1.20.0] — 2026-07-02

### Added
- **SAP Cloudification Repository Integration**: Analysis engine now maps against SAP's official Cloudification Repository (23,696 classified objects) — the same authoritative source SAP's own ATC compliance checks use.
- **Layered Catalog Architecture**: Curated field-level entries (Layer 1) always take precedence; SAP repository entries (Layer 2) provide broad, authoritative coverage. Each finding carries its source layer (`curated` vs. `sap-official`) for full audit traceability.
- **No-Path Verdicts**: Objects without released successors now produce a positive "no clean path" signal backed by SAP's official classification — not just absence from a curated list.
- **Auto-Sync Pipeline**: Weekly GitHub Actions workflow (`sync-catalog.yml`) syncs the repository, generates a deterministic artifact (SHA-256 verified), and opens a PR. Catalog version in every Audit Pack includes commit hash, entry count, and fetch date.
- **Dynamic Catalog Badge**: Landing page comparison section shows live classified-object count from the synced artifact.

### Changed
- **Narrative Correction**: Corrected terminology from "SAP API Business Hub" to "SAP Cloudification Repository" across all public-facing pages (landing page, how-it-works, ABAP analysis, QuickAnswer blocks).
- **T005 Mapping Upgrade**: T005 (Countries) now correctly maps to `I_COUNTRY` (SAP-official) instead of guessed `I_T005`.

## [v1.19.0] — 2026-07-02

### Trust Chain Closure (Security / P0)
- **Downstream Run Enforcement**: All 6 downstream pages (Design, Transformation, Testing, Documentation, Delivery, TCO) now enforce `activeRunId` presence via `enforceActiveRun()` guard. Projects without an immutable analysis run are redirected to the Analyze page with an informational banner.
- **Run Guard Module**: New `lib/run-guard.ts` provides `hasActiveRun()` and `enforceActiveRun()` utilities for centralized Trust Chain enforcement across the platform.
- **Audit Pack Run Gate**: Audit Pack export now throws an explicit error when no `activeRunId` exists, preventing generation of unbound packs with empty run references.
- **Server-Authoritative Run Validation**: The `/api/export/sign` endpoint now validates that the requested run is the active run for the project (HTTP 409 if stale) and that the run has a valid `runHash` (HTTP 422 if incomplete).
- **E2E Trust Chain Test**: New `tests/trust-chain-e2e.spec.ts` with 15 test cases covering run guard logic, audit pack run gate, sign endpoint validation, downstream page guards, and module completeness.

## [v1.18.1] — 2026-07-01

### Added
- **Cryptographic Run Binding**: Server-side signing endpoint is now bound to the Firestore Run document by including the project ID, run ID, run hash, engine version, and SAP API catalog version in the signature input.
- **Unsigned Suffix Alignment**: Unsigned manifest exports also compute and check the same suffix metadata context, ensuring uniform integrity verification across all platforms.
- **Signature verification hardening**: Enforced input length and hex constraints on signature verification to protect the public API endpoint.

## [v1.18.0] — 2026-07-01

### Added
- **Enterprise Non-Functional Requirements**: Dedicated Gemini-powered call in Solution Design to generate detailed guidelines across 8 categories (Data Migration, Retention, Audit Trail, Authorization, Error Handling, Monitoring, SLAs, Cutover). Rendered using a premium accordion UI.
- **Credit Management Detection**: Deterministic finding for legacy Credit Management patterns (Z_CREDIT_*, FSCM) indicating SAP standard replacement paths and tagging for architect review.
- **Verify Pack Distinction**: Visual warning states in the Audit Verification page to clearly flag unsigned integrity-only packages from authentic (cryptographically signed) exports.
- **E2E Test Coverage**: Complete regression suite (`tests/evidence-engine-v118.spec.ts`) asserting new scanner mechanics and scoring calibrations.

### Changed
- **Verified -> Catalog Match**: Global rename of confidence labels to align with professional auditing terminology. Full backward compatibility maintained for existing Firestore runs.
- **Deployment-Aware Severity**: Calibration of Standard Fit severity where Public Cloud table reads trigger Critical/High severity warnings, and Private Cloud table reads show Medium severity upgrade risks.
- **Granular API Mappings**: Matched tables like MARD to `I_MaterialStockInStorageLocation` instead of broad Product master data, adding MARDH and MCHB mappings.
- **ROI Range Estimates**: Replaced single-value dollar figures with range-based TCO projections and baseline calibration warnings.
- **Signature Input Alignment**: Uniform HMAC-SHA256 calculation over the manifest SHA-256 hash across both PowerShell and Web-based exports.

## [v1.17.0] — 2026-07-01

### Audit Pack v2 & Signed Exports
- **Cryptographic Manifest**: Every Audit Pack ZIP now contains a `manifest.json` with SHA-256 hashes for all included files, engine metadata, and SAP API Catalog version.
- **Server-Side HMAC Signing**: New API endpoint `POST /api/export/sign` computes an HMAC-SHA256 signature over the canonical manifest using the server-only `AUDIT_SIGNING_KEY`, ensuring tamper-proof audit exports without exposing the signing key to the client.
- **Public Verification Endpoint**: New `POST /api/export/verify` endpoint allows external auditors (e.g., KPMG, SAP) to verify audit pack signatures without a platform account.
- **Verification Engine** (`lib/audit-pack-verify.ts`): Client-side ZIP integrity checker that validates file hashes, manifest consistency, and cryptographic signatures via the server endpoint.
- **Verify Pack Page** (`/verify-pack`): Drag-and-drop compliance verification page with real-time integrity badges, file-by-file hash status, signature verification, and export metadata display.
- **AnalysisRun Completeness**: Extended the `AnalysisRun` interface with `dataCoupling`, `codeInventory`, `worklist`, and recommendation fields to ensure audit packs contain all assessment data from immutable run documents.
- **Graceful Fallback**: If the signing service is unavailable, audit packs are exported with an unsigned manifest and a clear warning — no data loss or export failure.
- **Catalog Version Display**: Executive Summary and Model Card now include the SAP API Catalog version for full audit traceability.

## [v1.16.0] — 2026-07-01

### Security Hardening
- **Phase 2 — Immutable Analysis Runs & Fallback Hardening (F-01)**: Fully completed the transition to server-authoritative calculations for runs in [route.ts](app/api/runs/create/route.ts). Enforced that the server loads/validates inputs (`legacyCode` & `s4Deployment`) directly from the parent project, with a fallback to body parameters for initial uploads or re-analysis.
- **Run Metadata Cleanup**: Ensured the deletion of denormalized analysis result fields on the parent project document to prevent stale data conflicts.
- **Strict Firestore Rules Allowlist**: Overhauled update rules in [firestore.rules](firestore.rules) to enforce a strict allowlist of permitted client-writable draft/interactive fields (e.g. `status`, `s4Environment`, `solutionDesign`, `targetArchitecture`), ensuring all other metadata and results remain immutable.
- **Workflows Signing Key Verification**: Configured the GitHub Actions [deploy.yml](.github/workflows/deploy.yml) workflow to assert that the `AUDIT_SIGNING_KEY` environment secret is set before triggering compilation.
- **Cryptographic Export Signing**: Upgraded the [export-source.ps1](scripts/export-source.ps1) script to dynamically read the platform version from `package.json`, generate a `manifest.json` with file hashes, and compute an HMAC-SHA256 signature using the `AUDIT_SIGNING_KEY`.
- **Export Verification Utility**: Added a new PowerShell script [verify-export.ps1](scripts/verify-export.ps1) to verify manifest integrity and authenticate signatures of exported codebase zip archives.
- **Downstream Page Hydration**: Unified downstream page state loading by replacing direct `getDoc` calls with a shared `loadProjectAndHydrate()` resolver across all stage controllers.

## [v1.15.0] — 2026-06-30

### Security Hardening
- **Phase 2 — BYOK Server-Only Secret Store (F-01)**: Migrated Gemini API Key storage from client-readable Firestore profiles (`users/{uid}`) to a server-only encrypted collection (`user_secrets/{uid}/providers/gemini`). Credentials are encrypted at rest using AES-256-GCM under the `S4_ENCRYPTION_KEY` environment variable.
- **Client Profile Security Isolation**: Restricted Firestore client-side update access rules by removing `'geminiApiKey'` from the permitted client update keys and fully blocking direct client-side read/write access to the `user_secrets` collection.
- **Client-to-Server BYOK Endpoints**: Implemented new API routes `/api/secrets/gemini` (POST to save, DELETE to delete) and `/api/secrets/gemini/test` (POST to verify connectivity using server-side decrypted credentials) to ensure client-side code never handles cleartext keys in transit or at rest.
- **Playwright E2E Security Tests**: Added automated E2E test suites in `tests/security-compliance.spec.ts` asserting secure key rotation, API key deletion, connection testing, and Firestore rules blocking client-side access.
- **Admin Panel Reference Sanitization**: Verified and ensured the removal of name placeholders ("e.g. Sonny Frenzel") from the platform administrator and tenant approval panels.

## [v1.14.0] — 2026-06-29

### Added
- **Phase 2 & 3 — Deterministic Evidence Scanner:** Implemented a statement-based static scanner (`buildAbapEvidence` in `lib/abap/evidence-model.ts`) that extracts concrete legacy patterns (BDC, RFC, Native SQL, DB Writes, Dynpro, ALV, GUI Downloads) and persists the complete report as `evidenceReport` in Firestore.
- **Phase 4 & 7 — Extensibility Router & Score Calibration:** Added `lib/abap/extensibility-router.ts` to calculate Clean Core score, recommendation confidence, decision checkpoints, and target architectures (In-App RAP vs Side-by-Side CAP) mathematically from scanner findings, eliminating LLM hallucinations.
- **Class Model Resolver:** Created `lib/abap/class-model-resolver.ts` to build topological sort linearization and missing dependency trees, replacing the mocked `ClassModel` across all 5 analysis UI hooks.
- **Evidence Findings Table:** Added a dedicated evidence findings table to the Decision & Evidence tab — deduplicated by kind+objectName, sorted Critical→Low, with severity filter buttons and occurrence count aggregation.
- **Inline Code Viewer:** Replaced the external "DOCS ↗" link in the Gaps Worklist with an inline "View Code" toggle showing source code context (±2 lines) with amber line highlighting for each occurrence.
- **Confluence Export — Evidence & Worklist:** Added Evidence Findings table and Gaps Worklist table to the Confluence HTML export with Pattern, Lines, Snippet, Severity, SAP Replacement + Confidence, Target, Status.
- **Inheritance Unit Tests:** Added unit tests verifying inheritance linearization and missing dependencies in `tests/abap-inheritance.spec.ts`.

### Changed
- **Phase 5 & 6 — Unified Report Model & Grounding:** Restructured the Gemini prompt to act purely as a narrative generator, grounded on deterministic findings instead of raw legacy code.
- **Score Formula Recalibration:** Replaced linear per-finding deductions with diminishing returns per category and a 5% floor, producing realistic 12-18% scores for heavily legacy code (was 0%).
- **Criticality Score Boost:** Added business-critical process detection (Sales/Delivery/Credit/Audit/Partner tables and keywords) raising fulfillment code from 5/10 to 7-8/10.
- **Prompt Hardening:** Softened decommissioning language ("retire after validation and business sign-off"), added API confidence markers (Verified/Candidate/Needs Validation), hedged ROI claims with ranges and assumptions, instructed hybrid routing guidance.
- **Worklist Deduplication:** Grouped evidence findings by kind+objectName in both the Gaps Worklist and fallback builder, aggregating line numbers into a single row with `(N×)` count.
- **Sprint 1 Data Coupling:** Hardened data coupling table parser with `tokenize` statement grouping, blacklist filtering (MODE, RISK, SCREEN, LINE, ADJACENT), and correct data export mapping.
- **Dynamic Version in Exports:** Confluence report footer now uses `APP_VERSION` dynamically instead of hardcoded `v1.13`.

### Fixed
- **Language Consistency:** Translated remaining German UI text ("Aktion erforderlich" block) to English for consistent language across the entire platform.

### Security
- **Admin Rate-Limit Bypass:** Enabled admins (`admin: true`) to bypass the hourly quota limits in `app/api/gemini/route.ts` to prevent "Rate limit exceeded" blockages during large modernization runs.

---

## [v1.13.2] — 2026-06-28

### Security
- **F-15 — Seed Route Defense-in-Depth:** `/api/test/seed` now requires three independent gates (NODE_ENV ≠ production, emulator flag = true, secret header match). Returns 404 instead of 403.
- **F-03 — Mermaid Label Sanitizer:** Hardened `sanitize()` in TargetArchitectureDiagram to strip HTML tags, JS protocol, event handlers, and Mermaid control tokens.
- **F-08 — mfa_pending Firestore Rule:** Added explicit `allow read, write: if false` for audit clarity (was covered by default-deny).
- **CI Assertion:** Deploy workflow now fails if `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is accidentally set to `true` in production.

### Fixed
- **Google Auth on Production:** CSP `frame-src` was blocking `accounts.google.com`, preventing the OAuth popup from opening. Added Google OAuth domains to `frame-src` and `connect-src`.
- **F-05 — Email Registration Bearer Token:** Password sign-up now sends a Bearer token to `/api/request-pilot`, matching the Google sign-in flow. Previously, the approval email silently failed with 401.
- **Google Auth UX:** Improved error messages when both popup and redirect sign-in fail.

### Changed
- **F-10 — Admin Panel:** Replaced personal example name with generic "platform administrator" text.

---

## [v1.13.1] — 2026-06-28

### Fixed
- **Clean Core Score formula:** Redesigned from stale AI-only value to a generic weighted formula (60% deterministic construct coverage, 30% standard fit, 10% AI calibration). Scores now correctly reflect migration readiness.
- **Mermaid architecture diagrams:** Fixed empty boxes caused by DOMPurify stripping foreignObject HTML children. Diagrams now render with full labels.
- **Severity consistency:** Prioritization Matrix gap items now show Effort (complexity) matching the Worklist column instead of contradictory severity labels.
- **AI recommendation contradictions:** Reconciliation logic suppresses "rewrite" recommendations when an object is marked for decommission/retirement.

### Changed
- **Tab rename:** "Detailed Assessment" → "Assessment & Value" to surface the Business Value Audit / ROI section.
- **Cloud Service Integrations:** Labels and deep dives are now context-aware — SAP-native services (CDS Views, IAM, LUW Manager) show dedicated ABAP code patterns and "Released SAP Objects" instead of generic Node.js NPM content.
- 5 new SAP-native deep dive entries: Released CDS View, IAM Business Roles, LUW Manager, BAdI Enhancement, RAP Service Binding.

### Security
- MermaidDiagram component bypasses DOMPurify for deterministically generated chart content (no user input in chart data). All other HTML sanitization remains intact.

---

## [v1.13.0] — 2026-06-28

### Added
- **UX Concept Block A — Evidence Backbone:** Deterministic Coverage Verdict donut chart + Construct Findings checklist from `findings-detector`, replacing opaque LLM-generated coverage numbers.
- **UX Concept Block B — Progressive Output:** Sticky Decision-Header with route badge, Clean Core Score, deployment target, and "Continue to Design" CTA. Tabbed workspace layout (Evidence, Gaps Backlog, Detailed Assessment, Modernization Strategy). Sequential stage simulation logs during analysis.
- **UX Concept Block C — Interactive Gaps Worklist:** Sortable/filterable backlog table with per-row status management (Open → In Review → Signed Off), burndown progress bar, and Firestore-persisted `WorklistItem` data model.
- **UX Concept Block D — Target Architecture Diagram:** Auto-generated Mermaid flowchart from DesignData JSON (RAP/CAP). "Why This Routing" rationale panel binding Design back to Analyze evidence. Security Hardening ↔ Construct coupling badges.
- **UX Concept Block E — Input & Gap Guidance:** Missing Dependency Prompt for ancestor classes/interfaces. Pre-Analysis Preview showing LOC, recognized constructs, object type, and estimated coverage before the full analysis run.
- **UX Concept Block F — Monolith Split:** Design page decomposed into 9 modular components: `ArchitectureOverview`, `InteractiveTopology`, `ProjectBlueprintExplorer`, `ApiEndpointsCatalog`, `ApiBusinessHubMapping`, `CloudServiceIntegrations`, `SecurityHardeningChecklist`, `ModernizationRoadmap`, `SyncPatternCard`.
- 27 new component files in `components/analyze/` and `components/design/`.
- GDPR consent checkboxes and AI disclaimer integrated into the signup form.
- Inline legal consent notice ("By signing in, you agree to...") on the sign-in form.
- Auto-profile creation for Google sign-in users (no separate onboarding step).
- `CHANGELOG.md` and release process documentation.

### Changed
- Auth modal now fully responsive with `max-h-[95vh]`, scroll support, and mobile-optimized padding.
- Signup form requires GDPR + Terms acceptance before the Register button enables.

### Removed
- **Pilot Registration Modal (`UserOnboarding.tsx`):** The blocking post-login onboarding modal is removed from `layout.tsx`. Profile creation is now handled inline during authentication.

---

## [v1.12.2] — 2026-06-26

### Fixed
- Security patch A-01: `approveUserWithToken` reject branch now deletes the orphaned Firebase Auth user, preventing re-registration issues.

### Changed
- Bumped all version references from v1.12.0 to v1.12.2 across landing page, showroom, replay, sample package, and board-deck components.
- Updated `SECURITY.md` to v3.6 with A-01 finding documentation.

---

## [v1.12.0] — 2026-06-25

### Added
- Server-side two-factor authentication (MFA) via TOTP using AES-256-GCM encrypted secrets and hashed backup codes.
- Interactive Modernization Whitepaper page at `/whitepaper` (Edition 2.0) — 10-section enterprise guide.
- Firestore-backed API rate limiting on Gemini, MFA, pilot request, and tenant request endpoints.
- XSS protection (`escapeHtml`) on all email template name fields with length validation.
- S/4HANA test runner egress enforcement gate for live tenant connections.
- `rate_limits` collection in Firestore security rules (blocked from client access).

### Changed
- Hardened client-side onboarding by restricting default fields in Firestore security rules to prevent privilege escalation.
- Removed all hardcoded admin email checks — admin authorization now uses Firebase Custom Claims exclusively.
- Added `assertAdminStepUp` enforcement (recent auth + MFA) on all admin API routes.
- Enforced MFA backup code pepper minimum length (32 chars).
- Removed CSP-Report-Only header (report-only, no enforcement value).
- Updated hero CTA to link to whitepaper page instead of static PDF download.

---

## [v1.11.0] — 2026-06-25

### Added
- Redesigned Board Presentation (Stage 7): deterministic, evidence-based slides derived from project metrics and findings.
- Metrics, support-specification-matrix, and risk-register slide types in `PresentationViewer`.
- Word document (.doc) executive summary exports in client-generated Compliance Audit Pack ZIP.

### Changed
- Overall recommendation automatically downgrades based on findings severity (Worst-Case Rollup).
- Unified specifications from `SUPPORT_MATRIX` with deep links to how-it-works documentation.

### Security
- Hardened onboarding email links with action-bound cryptographic HMAC signatures and timing-safe verify routes.
- Secured Markdown and chat responses from HTML Injection / XSS using DOMPurify and `marked` sanitizers.
- Implemented strict sandbox `securityLevel` for Mermaid BPMN 2.0 flowcharts.

---

## [v1.10.0] — 2026-06-24

### Added
- Compliance Audit Pack — exportable ZIP evidence package for architecture governance and compliance reviews.
- Audit pack includes: executive summary, SHA-256 input fingerprint, architecture decision record, findings CSV, model card, and known limitations.
- Input fingerprint (SHA-256 hash) computed silently during analysis — only hashes code content, no secrets or PII.
- Model card metadata (provider, model, engine version, BYOK flag) logged per project analysis for full traceability.
- Audit Pack section in Delivery stage as collapsible accordion.

---

## [v1.9.0] — 2026-06-24

### Added
- Modernization Assessment engine computing complexity and business-criticality scores from uploaded ABAP code.
- Code Inventory and Data Coupling analysis panels with collapsible accordion UI pattern (Stage 1).
- Deterministic architecture recommendation logic (Decision Tree) based on parsed table access and code structure.
- Architect Sign-Off gate in Solution Design (Stage 2) requiring explicit target architecture confirmation.
- Override flow with justification tracking and audit trail for architecture decisions.

### Changed
- Gated Stage 3 navigation behind architecture approval to prevent mismatched transformation output.
- Created reusable `CollapsibleAccordion` and `ArchitectSignOff` UI components, fully responsive on mobile.
- Extended `Project` type with assessment fields (`complexityScore`, `criticalityScore`, `codeInventory`, `dataCoupling`, `targetArchitecture`).

---

## [v1.8.0] — 2026-06-24

### Security
- Moved GDPR account deletion to server-side transaction API, recursively purging credentials, projects, and metadata (Art. 17 compliance).
- Enforced cryptographic HMAC verification of onboarding email approval links.
- Admin-gated all live S/4HANA bridge connectivity (BYOT) endpoints behind strict role and custom-claim validation.
- Sanitized pilot welcome and administrator approval email templates against HTML injection.

### Changed
- Replaced dynamic site-generation dates with static constants in `sitemap.xml` for stable SEO crawl signals.
- Aligned documentation regarding live credentials storage (AES-256-GCM) and business data processing (stateless in-memory).
- Bumped Next.js from v15.5.14 to v15.5.19 (security advisory).
- Introduced comprehensive Playwright E2E security and compliance test suites.

---

## [v1.7.4] — 2026-06-17

### Added
- Visual Code-Transformation Compliance Shield (Hero HUD) showing dynamic scores.
- Interactive Code-Integrity Minimap heatmap scrollbar.
- Sliding Grounded Audit Drawer panel with CDS mappings, SQL quirk settings, and differential sandbox query tester.
- Realistic ABAP OO / SQL Join test script balloon in workspace for pilot testing.

### Changed
- Improved landing page with visual compliance highlights and direct links to Methodology page.
- Admin identification via Custom Claims instead of hardcoded email addresses (patch-F-10).
- Firestore log level set to silent; transient stream errors handled cleanly at point-of-use (F-09).

---

## [v1.7.3] — 2026-06-16

### Added
- Standalone `/impressum` and `/datenschutz` legal route pages for SEO and GDPR compliance.
- Transformation Showroom with real end-to-end code examples.
- `/how-it-works` page with honest coverage matrix.
- Mobile-optimized comparison table with stacked card layout.

### Fixed
- JSON-LD structured data: removed duplicate schema, added static dates for Google Rich Results.
- Improved Transformation Showroom ABAP-Unit test with proper CDS Test Double pattern.
- Corrected Quick Answer heading hierarchy (h2 → semantic span badge).
- Removed Jira Integration placeholders from Solution Design page.
- Enhanced SAP API Hub mapping accuracy for financial tables (BSEG, BKPF).

---

## [v1.7.0] — 2026-06-01

### Added
- BPMN 2.0 business process blueprinting.
- Level 5 SOP narrative generation.
- RACI matrix auto-generation.
- Side-by-side code transformation view improvements.

---

## [v1.6.0] — 2026-05-15

### Added
- Live S/4HANA tenant connection (BYOT) with admin approval gate.
- Enhanced sandbox test runner with real-time TAP output.
- Confluence blueprint export format.
- Improved abapGit ZIP packaging with proper directory structure.

---

## [v1.5.0] — 2026-04-28

### Added
- **Initial public pilot release.**
- Core ABAP parser and AST extraction engine.
- SAP API Business Hub integration.
- Dual-target code generation (RAP + CAP Node.js).
- ABAP-Unit test class generation.
- Clean Core compliance scoring.
