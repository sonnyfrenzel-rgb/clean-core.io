# Clean-Core.io — Roadmap to 3.0

**Version 2.8 · as of 15.09.2026 · valid from v2.9.11 · replaces version 2.7 of 12.09.2026**

This file is the only binding roadmap. It says three things: **in which
phases and small steps the UX rebuild along the mockups 2.7 becomes 3.0**,
**what is deliberately not built**, and **what is still to be decided**.

Besides this file there are exactly two active roadmap documents; everything earlier is
in the [archive](archiv/README.md). Acceptance cases (W22, C23, QA24, V25) and finding IDs
(CR-nn, Exx) continue to be cited — they are defined in the archived
source documents. **Where an archived document contradicts this file, this file
applies** — this concerns above all account, roles, sharing and the order (§2).

| Document | Role |
|---|---|
| [`roadmap/clean-core-mockups-v2_8.html`](roadmap/clean-core-mockups-v2_8.html) | **Target picture of 3.0**, built to [`DESIGN.md`](../DESIGN.md); §5 says where each element is created. The predecessor mockups 2.7 stay in `roadmap/` as provenance |
| [`../DESIGN.md`](../DESIGN.md) · [`design/decisions.md`](design/decisions.md) | **Look, structure and behaviour** of the 3.0 interface and the decision log for it |
| [`archiv/roadmap-2.8/SCHNITT-0-UMFANG.md`](archiv/roadmap-2.8/SCHNITT-0-UMFANG.md) | Work packages of Phase 0 (v2.10), with the changes from §4 |
| [`archiv/roadmap-2.7/`](archiv/README.md) | Version 2.7, long-form backlog with the acceptance catalogs, review of 08.09. with the finding register, ID bridge, cuts A–C, slice graph |
| [`archiv/ROADMAP-2.0.md`](archiv/ROADMAP-2.0.md) | Rationale for v2.0, why enterprise features were deferred |
| `docs/BACKLOG.md` | Work log: what was actually released |

---

## 1. The direction in five sentences

1. **Clean-Core.io remains a free community tool** that takes a piece of custom
   code from the not-understood Z program to an evidence-backed decision — the
   deterministic engine first, every result signed.
2. **3.0 is the big UX rebuild along the mockups 2.7:** one workspace per
   project, in which process, standard, costs, architecture and decision
   lie together. The seven current stages are kept as tools. Publicly
   there is only this one jump.
3. **The Business view becomes the strongest part.** The process is reconstructed
   from the code as BPMN, every element with a line anchor, editable as in a
   process modeller and exchangeable with SAP Signavio via BPMN 2.0 XML — for
   everyone who licenses Signavio themselves.
4. **Accountability stays with the signed-in user.** Business, IT and
   Management view only arrange the presentation. They are stored nowhere and
   touch neither result, signature nor audit pack.
5. **Sign-up and account stay as they are.** Sharing is by invitation to
   an e-mail address: the invited person signs in as usual,
   accepts the Terms and gets read access.

**USP (approved by Sonny on 01.10.2026, to be used verbatim):** "From custom ABAP
nobody understands to a reviewed, tested rebuild — on one chain of evidence you can
check." The long form and the limits that travel with it (the code is a draft for
review; the tests check against test scenarios, not in the real S/4 system) are in the
`README.md`. Previously: From the not-understood Z program to an evidence-backed decision — free,
verifiable, without an SAP licence.

---

## 2. What changes compared with version 2.7

| Topic | Version 2.7 (12.09.) | Version 2.8 (15.09.) |
|---|---|---|
| **Account** | Account = e-mail + handle; remove name fields, `tier 'enterprise'`, `orgId` and Okta/Azure fields, migrate existing accounts, pseudonymise contributions on deletion | **No change.** No handle, no migration. Registration, onboarding, profile and mails stay |
| **Roles** | Virtual role ("Playing as") on the contribution, `self_play` marker, separate role mandates, role and pseudonymous signer ID in pack and MCP | **Views only.** No role attribute on contributions, runs, signatures or exports. Confirmation is by the account — as a self-declaration, as already today in the Design stage (`lib/workflow-steps.ts:262`) |
| **Sharing** | Case sharing with named members, rights read/comment/edit, raw-code switch, journal — an L-sized new build with its own source document | **Read access by invitation:** e-mail-bound link, read including source code, expiry and revocation |
| **Process / BPMN** | R2 (v2.12); "a complete BPMN editor is not a 3.0 must" | **Own phases directly after the scaffold:** reconstruction from the code, editor, import/export with a checked Signavio round trip |
| **Case** | Own case scope across several objects (L) | **Project = case.** No new case model |
| **Decision Request** | Answer by link, without mandate effect | **dropped** — whoever should have a say gets read access |
| **Planning** | Gates R0 · R1 · R2 · 3.0 with 76 slices up to size XL | **Phases 0–8 with steps of size S or M, then 3.0** |
| **Publicly** | Every gate a release with its own message | v2.10 corrects public statements; 2.11–2.18 are work states; **3.0 is what gets announced** |

---

## 3. Starting point in the code (v2.9.11, read on 15.09.2026)

What the phases presuppose or replace. Read, not run.

- **BPMN today is a flowchart with BPMN names.** Gemini produces a sequence of steps from
  1,000 characters each of generated code, design and analysis
  (`app/(app)/project/[projectId]/documentation/page.tsx:332-384`). From that comes a
  `.bpmn` with one pool, lanes per role text, only exclusive gateways without
  a condition and a grid layout (`:86-248`). No reference to source lines, no
  editor, no import; lane and node names are not escaped (CR-21). The
  interface calls the file "Signavio-importable" (`:756-762`) — an import was
  never checked.
- **The engine knows no control flow.** It delivers statements with lines and
  line-exact findings. IF/CASE are only counted for nesting depth
  (`lib/abap/code-assessment.ts:307-315`), PERFORM calls are not followed,
  AUTHORITY-CHECK is captured without object and fields (`lib/abap/evidence-model.ts:525-538`).
- **The anchor check does not recognise the engine IDs.** Findings are called `CC-001`
  (`evidence-model.ts:209`), the parser only accepts `[F-…]`
  (`lib/abap/narrative-anchors.ts:71`), but the prompt gives the model the
  `CC-`IDs (`:205-221`). Correctly cited sentences count as unsupported; the test
  hides it with `F-`fixtures.
- **No view, no sharing.** No Business/IT/Management switch;
  `projects` reads only owner or admin.
- **Two building blocks are missing for invitation links.** Sign-in does not return to
  a starting page, and e-mail addresses are not verified
  (`sendEmailVerification` is called nowhere; an account is unlocked automatically
  after consent).
- **Reusable:** immutable signed runs (HMAC + Ed25519),
  offline verifier, phase contract with stale cascade (`lib/workflow-steps.ts`),
  both SAP catalog views, usage import (v2.9.7), the sentence anchor mechanism.

---

## 4. Phases to 3.0

**As of 28.09.2026.** `main` is **v2.20.0** (`fc787674`). New is the process benchmark
(`docs/prozess-benchmark/BERICHT.md`): 300 blind-written, cross-checked and frozen
ABAP cases in three waves, measured with the comparator of the reference corpus. Grown on it:
method calls as steps (D2), dynpro modules and function modules as entry points (D1),
ADR-054 (subprocess start, own end per early exit), framework entry points
(callbacks, ALV/event handlers, BAdI methods, redefinitions) and 17.10 (path B as
a proposal with evidence and contradiction marking, behind the workspace preview). Skeleton
61.3 % → 81.1 % (wave 1+2, check half 82.1 %), wave 3 39.5 % → 72.3 %. Block D stands at
10 of 40 steps and is the next work block; the decisions of the two days are
in §9.

**As of 18.09.2026, evening.** `main` is v2.13.0 (`b88c77b`): Phase 2 and Phase 5 complete.
On `dev` (`acf09bb`) there is on top: Phase 6 at four eighths (6.1, 6.5, 6.6, 6.7), Phase 7 at
six eighths (7.1, 7.2, 7.3, 7.5, 7.6, 7.7 — 7.6 without the board, see BACKLOG 30), the MFA requirement
for S/4 access and own Gemini key (SEC-2026-135/136/137), the repairs from the three
reviews of v2.13.0 (seven UX, six security — among them SEC-2026-152 and -236, two raw
model URLs on `href`) and the rolled-out Firestore rules. Open before v2.16/v2.17: 6.2, 6.3,
6.4, 6.8, 7.4, 7.8; plus the 226 high findings of the QA full review (§14, BACKLOG 33). The three
decisions of the evening are in §9. Next promotion to `main` on Sonny's go.

**How a step runs.** Every step is a patch release following the routine from
2.9: code, guard spec with cited acceptance, CHANGELOG, `dev` first, `main` only on
approval. Sizes are planning hypotheses for one maintainer with AI support —
**S** under one week, **M** one to three weeks —, not dates. No step is
larger than M.

**What becomes visible.** Corrections to the current interface and to the engine
go out normally. Everything that belongs to the new interface grows behind a
switch (admin only) and is switched on for everyone with 3.0. That way every phase stays
deployable without anyone seeing half a rebuild.

```
Phase 0  v2.10  Evidenced .................... correct public statements (agreed 12.09.)
Phase 1  v2.11  Scaffold ..................... preservation register, zero-LLM, workspace shell
Phase 2  v2.12  Process from the code ........ control flow, BPMN reconstruction with anchors
Phase 3  v2.13  Model ........................ editor, rules, keep/change/drop, as-is/to-be
Phase 4  v2.14  Exchange ..................... BPMN export, Signavio export checked, short brief
Phase 5  v2.15  Share ........................ invitation by e-mail link, read access
Phase 6  v2.16  Views ........................ Business · IT · Management, layers, overlays
Phase 7  v2.17  Standard and costs ........... standard coverage, cross-check, options
Phase 8  v2.18  Decide and hand over ......... architecture contract, decision, evidence chain
3.0             Switch-over .................. new workspace for everyone, demo with tour, new landing page with real product views
```

**Why this order.** First the truth of today's statements and the protection
of what works (0, 1). Then the content of the Business view (2–4), because
views can only arrange what is there, and sharing only pays off once there is a process
to show. Standard, costs and decision last, because they stand on the
confirmed need from Phase 3.

**Dependencies.** Phase 2 needs 0.5 (model revisions bind to the
source state) and 1.2 (skeleton without a model). Phase 4 needs 3.2 (revisions).
**Phase 5 needs only 0.7 and 1.4** and could be brought forward. Phase 7 needs 3.5,
Phase 8 needs 7.

### Phase 0 — v2.10 "Evidenced"

Nothing claims more than the data supports. Scope as agreed on 12.09.
([`archiv/roadmap-2.8/SCHNITT-0-UMFANG.md`](archiv/roadmap-2.8/SCHNITT-0-UMFANG.md)), with three changes
of 15.09. (**bold**).

| # | Step | Size |
|---|---|---|
| 0.1 | `G0:R0` — lock of the live test mode with reason and reopening condition in `SECURITY.md` — **built in v2.10.0** (`lib/locked-paths.ts`, `SECURITY.md` §7.1, `tests/locked-paths-guard.spec.ts`) | S |
| 0.2 | Facts service, copy CI, audit corrections. **In addition: take the Signavio statements** ("validated for SAP Signavio", "Signavio-importable", "importable into SAP Signavio") back to "BPMN 2.0 XML" until step 4.3 proves that our export opens in SAP Signavio Process Manager — **Signavio part built in v2.10.2** | M |
| 0.3 | Level rule page with rule version; TCO promise removed. **Name question decided (Sonny, 16.09.2026): the name stays "Clean Core Score", and it is made known.** The research carries the decision: SAP has no "Clean Core Score" at all — the documented SAP metrics in the RISE dashboard are called `Technical Debt Score`, `Clean Core Share`, `Clean Core Level` (A–D); only the `Technical Debt Score` runs in the opposite direction (SAP verbatim: "a higher score indicating greater technical debt"). In trademark terms nobody holds "Clean Core" in class 9 or 42, SAP holds nothing, and the USPTO required a disclaimer on "CLEAN CORE" for a third-party mark — officially descriptive, so usable by nobody against us. `/clean-core-score` keeps its URL, canonical and its position 7. **What follows from this:** (1) the distinction belongs visibly in the product — chatbot knowledge, `llms.txt` and the score page say that this is not SAP's `Technical Debt Score` and points in the other direction (closes UX-088); (2) the rule page with rule version and the removal of the TCO promises stay in this step; (3) "making it known" is SEO and content work on the existing page, not a rebuild. **Built 16.09.2026 (`dev`):** `/method/levels` names the rule version, and it is measured — a fingerprint over all 48 inputs the derivation can distinguish, plus release and checksum of both SAP files (`lib/abap/level-rule-version.ts`, `tests/level-rule-page-guard.spec.ts`) · five TCO promises removed on four surfaces, and the guard that should have caught them so far only caught amounts with currency signs, not the promise in words (`tests/money-honesty-guard.spec.ts`, new test including fixtures) · chatbot knowledge, `/llms.txt` and `/clean-core-score` distinguish the score from SAP's `Technical Debt Score`, `Clean Core Share` and `Clean Core Level`, with the direction of each metric (`tests/score-name-guard.spec.ts`; closes UX-088). `/clean-core-score` kept its URL, canonical and position. Two follow-ups without an obstacle: EUTM 019420980 "CleanCore Radar" (filed 11.09.2026, under examination) and "CLEAN CORE X-RAY" (WO 1830724, effective in the EU) — same construction, different name | M |
| 0.4 | No money values without an assumptions revision — **built in v2.10.3** | S |
| 0.5 | Manifest and input contract: `inputs[]` with revision and hash. **Built 16.09.2026 (`dev`):** `lib/input-manifest.ts` — six inputs with id, data class (QA24-14), revision, `binding` and digest, one canonical form, one hash; in the signed payload, mirrored to `auditMetadata.inputManifest`, in the pack as `08-input-manifest.json` (signed, not attested). `binding` distinguishes `value` (the bytes were read) from `reference` (bound under name and revision), so that no run claims to have read five megabytes of catalog; an input of class `secret-identity` is rejected. The canonical form of the audit packs is untouched, every previously sealed pack verifies byte for byte (C23-A02). `tests/input-manifest.spec.ts` | M |
| 0.6 | Conservative invalidity instead of a freshness heuristic. **Built 16.09.2026 (`dev`):** `staleness()` and `/api/audit-pack/create` no longer ask "does anything prove that this is old?" — divergent, unreadable and never recorded are three reasons and one verdict. The data class decides the consequence: source, catalog, rule set and target system block, engine build and narrative model only report, otherwise every release would invalidate every project. A catalog resync between run and export now refuses the pack. In addition W22-A06: run and project state go in one transaction that rereads the source — 409 instead of silent overwriting, quota unit returned. Runs without a manifest do not become invalid retroactively (C23-A02). `tests/conservative-invalidity.spec.ts` | S |
| 0.7 | Approval fields only via server-validated commands, manual rules deploy before the app. **Concept part now only: read access by invitation** (rights levels, raw-code switch, virtual roles dropped). **Data minimisation struck**. **Built 16.09.2026 (`dev`):** six fields leave the client-writable allowlist and are written only by `POST /api/projects/{projectId}/commands` — the address comes from the verified ID token instead of from `auth.currentUser.email`, the time from the server clock, `lib/project-commands.ts` decides the transition, and every accepted change writes its `audit_events` row in the same `WriteBatch`. Ownership decides over the route, not admin rights. Closes SEC-2026-008. **The rules deploy was the actual finding:** the first look via the Rules API showed in production the ruleset of 20.08., one month and three tightenings behind the repository; rolled out on 16.09. at 14:43:04Z with Sonny's go and re-checked on all six databases. `docs/registers/rules-deployment.json` records what is live, `npm run deploy:rules` writes it along, `npm run rules:check` compares offline, `npm run rules:verify` asks production; `tests/rules-deploy-order.spec.ts` breaks on the one order that breaks production. `tests/project-command-boundary.spec.ts` holds client, server, index and export to the same list and refuses each of the six fields against the running emulator rules (QA24-A12). Concept part without implementation: `docs/archiv/konzepte/CONCEPT-EINSICHT-PER-EINLADUNG.md` | M |
| 0.8 | **A coverage verdict without findings is not a full verdict** (UX-002, critical): an empty finding list no longer yields "Fully Supported" and no "Unconditional Go-Live Approved / LOW RISK" in the board deck; own step before the rest of the work. **Built 16.09.2026 (`dev`):** `lib/board-deck.ts` knows "not determined" — zero findings give no level, no risk, no recommendation, and slides 2–4 say "coverage not established" instead of green rows; no more "Approved" from the static roll-up (QA 4a4321a45f3c) — the sign-off is reported as it is (recorded/self-attested/not recorded); "Resolved Objects" (object count minus finding count, QA a71be0146d3c) replaced by "Findings by Level"; the Delivery page shows a detector error instead of passing it through as an empty list; `tests/board-deck.integrity.test.ts` requires the opposite of the old behaviour (QA 00875a4ff030). The coverage verdict card in Analyze was already honest (`CoverageVerdict.tsx`) | S |
| 0.9 | **Examples cost no quota** (decision Sonny 15.09.2026): only the existing starter examples from `lib/starter-examples.ts`, recognised server-side by the fingerprint of the unchanged source text (a changed example is own code); **each one free once** per account; **every further start** of the same example counts like an analysis, also against the rule "the same source again is free"; after the five analyses it continues only with an own Gemini key (BYOK) (clarification Sonny 15.09.2026). Whoever starts the same example again is warned beforehand — *"You ran this example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes."* — and the quota is deducted only **after a completed analysis**, never on abort or error. Bookkeeping server-side only (Admin SDK, like `chargedInputs`), no client field. Along with: Terms of Use §6, welcome mail, `lib/clean-core-capabilities.ts` and admin usage view, which today say "re-analysing the same source is free". **Built 16.09.2026 (`dev`):** the eight examples from `lib/starter-examples.ts` are each free once, recognised server-side by the fingerprint of the unchanged source text — a client flag would print free runs, an edited example is own code and costs. Every further start of the same example is an ordinary analysis, deliberately past the repetition exemption. Bookkeeping in `users/{uid}.starterExamplesUsed`, written only by the Admin SDK, so without a rules deploy; the reservation stays atomic, a failed run returns it — including the 409 path from 0.6, which previously deducted it in the paid branch. The line stands before the click (ADR-039); Terms §6, welcome mail, capabilities list, admin panel and first-run guide now say what a second start costs. `tests/starter-example-quota.spec.ts` | S |
| 0.10 | **Demo project for every account** (decision Sonny 15.09.2026, `DESIGN.md` §6.1.2): a fully played-through, clearly marked project from a real run of the eighth starter example `Z_MM_PO_APPROVAL` (Emergency purchase approval — the same case as in the mockups), **one** demo for all accounts (no copy per account, sign-up unchanged), usable without consequences — state only in the browser, "Reset demo", does not count against the quota. In the current product with the seven stages; with a recurring invitation to an example or own code (at most one per screen, never blocking). The tour with around twelve stations grows with the workspace (3.0.7). **Built 16.09.2026 (`dev`):** `/demo/{stage}` shows the seven stages on a real engine run over `Z_MM_PO_APPROVAL` — 31 findings with line anchors, Clean Core Score 28 (as of 24.09.2026, source `lib/demo-release.json`; at build time 30 and 43), the route with its assumptions, the constructs the engine explicitly did not assess; every number computed at runtime, so nothing goes stale either. Kept out of the trust chain structurally, not by flag: own route without a project document, without run, pack, export or model call, without Firestore write access, plus `assertNoTrustChain`, which throws at build time. The three stages that a model writes in a real run carry the deterministic half and say on the stage what the model part would add — writing convincing model text by hand would be the invention this product rejects. Usable without consequences (`localStorage`, "Reset demo"), one invitation per screen, in the dashboard as a marked entry above the project list. `tests/demo-project.spec.ts` | M |
| 0.11 | **Trust before uploading** (decision Sonny 15.09.2026, `DESIGN.md` §6.1.3): in the current upload a line on Terms §5 and §8 without a checkbox and the card "Your code and your trust" — EU storage, access only for the account, server proxy and encrypted key, signed runs, no tracking, deletion, public security model, training: with the community key the paid Gemini API tier applies — no training by Google; with an own key the terms of one's own Google account (Sonny 15.09.2026; the privacy policy names the paid tier of the community key explicitly before the card says it); "free community project"; "Our security model is public" links to `SECURITY.md` in the public repository. The access sentence names the admin account as long as `firestore.rules` gives it read access to projects, and the privacy policy names this access before the card goes live. Every statement with a link to its source; a guard checks that the card contains only statements that are in the Terms, privacy policy or `SECURITY.md`. **Built 16.09.2026 (`dev`):** a line above the upload without its own checkbox (the Terms are accepted at registration) and the card "Your code and your trust". The card is not copy: every line is a claim in `lib/trust-claims.ts` next to the sentence from Terms, privacy policy or `SECURITY.md` that carries it, and `tests/trust-card-guard.spec.ts` falls over if a piece of evidence is not verbatim in the document, a link does not arrive or the card shows text the register does not hold — checked on the rendered page, because a sentence in a dead constant is not evidence. For that the documents had to catch up: privacy §3 (the shared community key is a paid Gemini key, the free-tier restriction belongs to BYOK), §5 (deletion takes projects and source code), §8 (who can open a project), Terms §2 (free community project without a paid tier). Left out, because nothing carries it: "Others see it only if you invite them" — sharing comes with Phase 5 | S |
| 0.12 | **Signed exports read only from the run** (QA full review 15.09.2026, §14: 70c8917150e7, 13c6115ec642 — critical, own step before the rest of the work): audit pack generators and the initial worklist take every field that goes into a signed hash from the immutable run — nothing from the project document (whose fields the owner may write per `firestore.rules`), nothing from the model narrative. What users or the model contribute stands in its own, unsigned and so-named part (`00-provenance.md` only says so today, the signature covers it anyway). With a test that turns a client-side changed field in the signed part red. **Built 16.09.2026 (`dev`), variant A per Sonny's decision:** `lib/audit-pack-build.ts` builds the input of the signed generators from a named list of run fields; name, target architecture, sign-off, approver, justification and workflow status are in `07-user-attested.md`, which `manifest.json` lists under `attested` — the name is bound into the signed hash, the content is not (`lib/audit-pack-canonical.ts`, one implementation for issuer and web verifier). Both verifiers show the file as "user-attested · not covered by the signature"; the narrative gaps now go only into the project worklist, not into the signed run. `tests/audit-pack-signed-input.spec.ts` changes every client-writable field and checks that no signed byte moves. The approval fields become signable only with 0.7 | M |
| 0.13 | **Second factor before the session** (§14: cfafefac08ec — critical; c4c4f5112a00): with an active second factor, sign-in counts only after the code. The mutating server routes already check this (`assertMfaSatisfied`); the client session and the account's Firestore read access, however, already arise after the password. Solution without a change to sign-up and account (rule above): Firebase multi-factor or a server-set claim that `firestore.rules` and the pages check — manual rules deploy before the app as in 0.7. In addition: recovery codes (`CC-XXXX-YYYY`) can be entered in the sign-in dialog, not just advertised. **Built 16.09.2026 (`dev`), variant 2 per Sonny's decision** — Firebase-native TOTP MFA (Identity Platform): Firebase issues no ID token before the second factor, the server gates read `firebase.sign_in_second_factor` from the token (`lib/mfa-gate.ts`), no cookie, no rules deploy. Enrolment in the browser against Firebase Auth (`multiFactor().enroll`), `POST /api/mfa/enrolled` reads the factor back and sets the flag, `POST /api/mfa/disable` removes it via Admin SDK only from a session with a factor. The own TOTP apparatus (routes, `lib/mfa.ts`, `lib/totp.ts`, `mfa_session`, `mfa_secrets`, `mfa_pending`, backup codes) is gone; recovery via `scripts/mfa-reset.ts` by the admin (c4c4f5112a00 thereby moot: there are no more codes, the interface advertises none). Prerequisites only Sonny sets: Identity Platform upgrade in the Firebase console, then `scripts/mfa-enable-totp.ts --apply`; his admin account (Google, verified) sets up the factor again in the settings. **Not in CI:** the Auth emulator cannot do TOTP — gate decision and negative paths are tested, enrolment and factor login are checked on `dev` against the real Auth | M |
| 0.14 | **Account, keys and rights report only what happened** (§14: 569fc1c41e35, cc5845ec545e, 8c7c26a637d1, 1c5a5c920b77, 19054f8f195f, e538b51c10f5, 85e767799587, 4f7643df8c3e, 990aa825e15f, 0ce6b0b508e6): no `ok` if a sub-step of deletion or revocation failed; account deletion complete (including survey answers) or aborted, never "Auth gone, data there"; admin revocation takes effect immediately and the Firestore mirror decides nothing; third-party responses (S/4 metadata) with time and size limits; rate limit keys without client headers (on Cloud Run the last `X-Forwarded-For` entry is the real one); MFA setup can be completed only once per account; a profile read from an old session does not reach a new one **Built 16.09.2026 (`dev`)**: the admin claim is the only rights signal (the mirror `users.isAdmin` only displays), a revocation revokes the refresh tokens and a token with a claim is checked against the revocation; deleting a secret reports its error instead of `ok`; account deletion takes the account last, deletes survey answers too and names on abort what remains; rate limit keys from the last `X-Forwarded-For` entry; S/4 responses with size and time limits; profile fetches of an old session no longer overwrite the new one. Six new specs; `lib/firebase-admin.ts` loads the Auth module only where it is needed (otherwise the specs do not load under Node 20) | M |
| 0.15 | **Corrections in dashboard, admin and the seven stages** (§14, high: 9b1af76b65c9, 2ea4b0048642, 2d714ac42b63, e184fc0c59bf, 3bb4158405d8, e078d502e983, d967e435917c, 0c3362018102; medium: 57876fae0053, aad1ecf24d47, 8d9184e6f94f, 210bafeb4c8b, 024ec609bc86, 06f7c0c56a6c, 4db1e81408f4, 217726b404c9, 40e1db9fd37a, 03380a33a523, ce37b706107d, f480d96b63d1, 883625214774, 989dafdac359, 4362479eb86e, 823a09338d58, 72556d36c205): year-1 ROI includes the investment; the transformation does not start twice and does not save an empty model response as done; only ABAP is accepted as ABAP and the security scan runs before every analysis, also from the text field; the quota does not lock BYOK and enterprise accounts; 1 MB applies; exports (Confluence HTML, preview) escape model values; the sample abapGit export is activatable; admin mail errors are errors; "Suspended" does not mean "Pending". What 3.0 replaces gets only the smallest fix **Built 16.09.2026 (`dev`)**: quota rule once in `lib/run-quota-rule.ts` (it no longer locks BYOK and enterprise), ABAP check in `lib/abap-input-check.ts` instead of "not empty", security scan in the analysis start itself, model copies of the signed metrics are discarded before saving, empty model responses are not saved as a transformation, year-1 ROI includes the investment, escaping in both Confluence exports (`lib/export-safety.ts`), admin reports undelivered mails, "Suspended" means "Suspended", 1 MB applies, abapGit package activatable. New guards: `abap-input-gate`, `export-escaping-guard`, `sample-package-guard` | M |
| 0.16 | **Scripts and workflows** (§14: a4f7e6aef79b, 1e47826dd2c5, 5a660ef009dc, f4561d983d92, 6a774e02134e, 6d40362efbf6, 2b0cacd91960, 14edf99a390c, 0a0ff08e1793, 6500f93e60fd, 5dbe58873773, 230989f67624, f7110f3d6619, 8ccb1b1b765b): review workflow with a pinned installer and without secrets in the reviewer job; migration check over whole documents instead of three fields; send record or idempotency key **before** the provider call (survey and community mail); mail "success" only on accepted delivery; escaping in admin mails; the security agent gets its own CISO brief as an object of review, the UX agent also `lib/*-content.ts` and the mails. **The survey workflows stay off for good** (Sonny, 16.09.2026: "can stay off in general, it's over anyway without success" — `docs/BACKLOG.md`). **Built 16.09.2026 (`dev`)**: the review workflow runs on an artefact pinned to SHA-256, without `--always-approve` and without a repo token in the step that reads PR content; the migration check compares a canonical hash of every document and recomputes every signed run (`manifestVersion: 2`); the three agent briefs that code loads as a prompt are in the security agent's review scope; the UX agent sees `lib/*-content.ts`, the guide and all mail renderers; community mail via the outbox (claim before sending) with `Idempotency-Key`, missing mail configuration in production yields 503 instead of `success`, failed one-click opt-out 503, bounce detail survives later scanner events, escaping in the weekly report; survey answers serialised per question, `linkFetchedAt` transactional. `2b0cacd91960` refuted (outbox rebuild), residual risk closed via the idempotency key | M |
| 0.17 | **Tests that check what they claim** (§14: d943e1fc71a5, d163622eab8e, f3428b0782a9, 812cbce3b485, bcbe2c770c8a; plus 6a1e32c0b973, 1738da3d6e64, cca300dfb572 and 6f7a14516006 from the delta reviews of 16.09. — the override marking in the Analyze step is tested as a decision (`lib/route-override.ts`), but not on the rendered screen; that needs a project with a deviating route in the seed, i.e. the same machinery as the other three, — the transaction evidence for `linkFetchedAt` in `tests/survey-guard.spec.ts` likewise reads only source text (two simultaneous server renderings of the survey page cannot be controlled from a spec), — `tests/profile-session-guard.spec.ts` checks the generation protection by source-text regex instead of running the hook (that needs a renderer for hooks, which does not yet exist in the repo), and the ordering safeguard in `tests/mfa-coverage-guard.spec.ts` reads source text because the Auth emulator cannot do TOTP — runtime evidence only with a second Firebase project or on `dev` against the real Auth): emulator tests for the MFA requirement of the trust chain and audit pack creation instead of source-text grep; a `rejects.not.toThrow('…')` is no proof; TCO guard against the page instead of against a copy of its arithmetic, with the zero case; provenance mapping instead of cardinality; the seventh stage in the rendered style guard **Partly built 16.09.2026 (`dev`)**: `lib/tco-model.ts` (page and test compute the same function, old copy in `tco-finite-guard.spec.ts` replaced; plus `tests/tco-page-rendered.spec.ts`, which checks the numbers on screen to the euro against the model) · `tests/mfa-trust-chain-gate.spec.ts` (MFA refusal on **all** routes that check for the factor, with a before/after state comparison; the catalog `tests/helpers/gated-routes.ts` proves its own completeness and in doing so found three unlisted routes: account deletion, Jira URL, Gemini key test) · `tests/analyze-route-override-rendered.spec.ts` (override marking on the rendered screen) · `lib/survey/link-fetch.ts` + `tests/survey-link-fetch.spec.ts` (two simultaneous claims, exactly one wins) · seventh stage in the rendered style guard. **Open:** `1738da3d6e64` (the profile hook needs a hook renderer the repo does not have), `6a1e32c0b973` (the ordering in `/api/mfa/disable` needs injectable Auth and Firestore doubles in the route), `d163622eab8e` (provenance instead of cardinality in `reference-analysis`), `812cbce3b485` (trust chain E2E against real responses instead of against identifiers), `96423cbf366f` (the reference case run-through in `tests/preservation-register.spec.ts` opens every stage in the browser, but there checks only stepper, stale notice and delivery switch — not that the stage shows the outputs the register attributes to it; if a stage stops rendering its inventory while a dead `.field` reference remains in the source text, the register keeps reporting success. The register already knows the outputs per stage; what is missing is the handle from field name to visible element) In addition open from the review of the security agent itself: `42a7d6a55d3b` — the loss tolerance of the two CISO calls is tested on the building blocks, not at the entry point; for that `audit.mjs` would have to export its orchestration as a function instead of starting a review on import. **The points listed above as open have been followed up (16.09.2026, `dev`), so the step is done:** `812cbce3b485` — the trust chain E2E runs against the emulators (422 without a run and nothing minted, an archive whose signature `/api/export/verify` accepts and one byte of difference not, 409 for the subsequently changed run, 410 for `/api/export/sign`); `1738da3d6e64` — the noted blocker was wrong, the hook runs in the browser, and the test holds back every response with the user document of the first account (what came out of it: the guarded branch is never entered on an account switch, because `firestore.rules` already refuses the running read access — the hook protection is defence in depth, and the test secures both); `6a1e32c0b973` — `retireSecondFactor` in `lib/mfa-disable.ts` takes Auth and Firestore as parameters with a production default, the route passes nothing, and `tests/mfa-disable-order.spec.ts` drives both error paths; `d163622eab8e` — the reference runs are mapped instead of counted (an upper bound also holds at zero); `96423cbf366f` — the register knows the handle from field name to visible element (`shows` · `onlyAfterARun` · `notShown` · `notYetAnchored`, checked in both directions). **Still open, because agent machinery:** `42a7d6a55d3b` | M |
| 0.18 | **Engine corrections from the full review** (§14: eac6118f1eac, 45737310a1d7, 778c72a5cde2, 14d4000c4586, 9fb67cc60860, ba5757ea1a85, 297e73fb33a7, a4fe4e2de430, a48a8ba01b64; rule in §11: known functional errors are corrected): `code-assessment.ts` gets the internal table / Open SQL distinction that `evidence-model.ts` already has; unassessed constructs (`assessCoverage`) lower the score and the routing text instead of "100 %, trivial"; LQUA is a quant, not a storage bin, VBKD is commercial data, not partners; `SELECT` in a literal is not a SELECT; missing interfaces are not "fully resolved"; a sentence with an invented citation is not anchored; percentiles after aggregation, `Infinity` is not a measurement. Every point with a reference case in the corpus. **Built 16.09.2026 (`dev`):** `lib/abap/open-sql-discrimination.ts` (internal table vs. database write access; `MODIFY dbtab FROM TABLE itab` remains a write access) · `assessCoverage` lowers score and routing text instead of reporting "100 %, trivial" (`tests/coverage-not-clean.spec.ts`) · VBKD and LQUA removed from `sap-api-catalog.ts` · `lib/abap/select-parser.ts` masks literals character by character, a SELECT in a text is not a query (`tests/select-parser-literals.spec.ts`) | M |

**The auto-heal is ineffective today — found on 18.09.2026 while building 0.17.**

Regardless of which file it tries to repair: since
E07-F02, `/api/run-tests` deliberately runs the **saved** artefacts and no longer reads `code`/`tests` from the
body. The repeat run therefore never sees the repair, and at the end
it always says "nothing was saved". Target determination has been correct since 0.17 — that changes
nothing about it, it only makes the failure honest.

Closing it means deciding between two things, and both are
product decisions, not bug fixes:

- **Either** overturn the assurance from 0.2 that a repair is written only after a
  run without build errors — then the repeat run would run on
  already written, unchecked code;
- **or** give the route a **receipt-less candidate mode**: it runs a
  candidate sent along, but writes **no** receipt and **no**
  verdicts, so that nothing can turn green from it. Only the run over the
  saved artefacts issues a receipt.

The second way keeps both assurances and is therefore the more likely one — but it
needs a clear separation in the code and in the interface, so that "tried out"
never looks like "proven". Until then: the auto-heal tries, and it does not help.

| alongside | **Faster deploy on Cloud Run** (decision Sonny 16.09.2026, option 2 from the analysis of the QA round time): a round on `dev` takes 14–17 min, of which model review 8–125 s, `validate` ~7 min (npm ci 33 s, build 83 s, Playwright 190 s) and the Cloud Run deploy ~7 min — a buildpack build without cache. Goal: Dockerfile with layer cache via Artifact Registry, deploy in 2–3 min; `validate` stays as the gate before it. Own step on `deploy.yml` with a trial run on `dev`, never on the side; the model stays Luna (cost 0.3–7 cents per round, no lever) | M |
| alongside | Reference corpus v1 with external review. **In addition: the expected process skeleton per case** as ground truth for Phase 2 | M, external |

**Done when** V25-A09/A10 (a hard number breaks the build; pages name identical
values), V25-A06 (no money value without an assumptions revision), QA24-A12 (client, server and
export have the same limits) — and no page and no badge promises a
Signavio import any more.

### Phase 1 — v2.11 "Scaffold"

Before anything is rebuilt, what works is named — and the frame is set into which
everything else is built.

| # | Step | Size |
|---|---|---|
| 1.1 | **Preservation register:** the seven stages with inputs, outputs, preconditions, errors and one reference case each; commit, build and rules pinned. Nothing gets lost unnoticed in the rebuild (QA24-A04, W22-A04). **Built 16.09.2026 (`dev`):** `docs/registers/preservation-register.json` as data instead of prose, `docs/PRESERVATION-REGISTER.md` for purpose, limits and the change path, `tests/preservation-register.spec.ts` in three layers: `lib/workflow-steps.ts` on its own reference cases, then stage sources, `firestore.rules` and `app/api/runs/create/route.ts` field by field against the register, then seven reference cases in the emulator, every stage opened in the browser — without a single model call. While being written it found nine limits and recorded them as limits instead of preserving them as parity, each with an assertion, so that a fix forces the register to move with it. Followed up from 0.5/0.6 (`inputManifest` among the signed fields; a marker that no longer hits anything is an error instead of an empty comparison) and from 0.17 (the handle from the field name to the visible element) | M |
| 1.2 | **Zero-LLM locked path:** run without an API key up to the signed evidence state; model stages switchable one by one; "not generated" instead of empty (V25-A12). **Built 16.09.2026 (`dev`):** the model call is a section of the analysis that may be missing — an account without a key used to get 503 and *no* run, although every finding on the page is computed without a model. Now the signature is made over the deterministic evidence, the server decides from the one fact it can check (did a narrative arrive?) and writes `modelParticipation: 'none'`, `model.provider`/`modelId` and `aiNarrativeMeta.responseHash` as `null` and `model:narrative` with revision `none` into the input manifest; the *reason* is deliberately not in the run. Five model stages switchable one by one via `users/{uid}.modelStages` (Admin SDK only, no rules deploy needed), `/api/gemini` honours the switch server-side and answers with a code. "Not generated" instead of empty in five stages, in the audit pack and on the handover page — before, the Analyze stage showed the upload form again for a signed run without a narrative. `tests/zero-llm-path.spec.ts`, each of the six cases shown red first | S |
| 1.3 | **Anchor fix:** parser and prompt use the engine's `CC-`IDs; test with real engine IDs. **Brought forward, built in v2.10.1** | S |
| 1.4 | **Workspace shell behind the switch:** header as in the mockup (path, project title, meta line with manifest, revision, source state, engine, rules from 0.5), seven status chips — each honest, "not started" as long as nothing is there —, layer bar, tool bar with the seven stages below the header. **Opens in the Business view** and has a "Not determined" area (`DESIGN.md` §2.3, §4). **Built 16.09.2026 (`dev`):** `/project/{id}` has never delivered anything and now delivers the shell — for everyone except an administrator with the preview switched on it stays exactly that way. Switch `users/{uid}.workspaceShell`, written solely by `POST /api/workspace-shell` via the Admin SDK; the field is not in `userClientUpdateKeys()`, so **no rules change was needed**, and it is read only together with continuing admin rights. Seven status chips, five of them from `workflowSteps()` via the one bridge `statusOfPhase`, which holds the rule from 1.7: `success` is reached from `proven` and from nothing else. Need and Standard have no artefact in this release and say "not started" with what is missing, instead of borrowing the routing recommendation (`DESIGN.md` §5.3). Meta line from the input manifest of the signed run (0.5) with "not recorded" instead of a dash, layer bar with count and "More", tool bar with the seven stages, opening in the Business view (ADR-002), view only in `?view=` (ADR-018); "Not determined" area from `assessCoverage` with reason and line, three states with three sentences, "none" phrased as a limit of the question answered | M |
| 1.5 | **Design per `DESIGN.md` as components** (card, tag, status chip, provenance chip in three forms, anchor, artefact row, message strip, empty state, "Why?" popover, segmented control, icon button): semantic tokens instead of hex literals, four button styles, font ≥ 11 px, **one provenance list `lib/provenance.ts`** with a guard against freely worded badges; style guard on the pattern of `tests/workflow-style-guard.spec.ts`. In addition, from the mockups: the further fixed lists with their own form (object status, evidence level, level, rule property, `DESIGN.md` §4.1), form with value states, filter bar empty vs. "No findings match these filters", modal message box, toast, code surface, contrast guard; **run indicator** for long runs (cost before the click, cancel, leave, error strip with action, §2.8); **`lib/model-text.ts`** against AI traces in the interface, exports and mails (§3.1). **Built 16.09.2026 (`dev`):** `--cc-*` tokens in `app/globals.css` plus `--color-cc-*` as Tailwind aliases (aliases instead of copies — a second literal is a second value that drifts apart), primary action `--cc-brand-strong` at 5.0 : 1 instead of 3.3 : 1. `lib/provenance.ts` holds the nine values, `CcProvenanceChip` takes a value and no label — a wrong badge cannot be written with it, only valued wrongly, and TypeScript catches that; the replaced spellings stand in the code, so that a red guard says what was meant. In addition the remaining fixed lists from §4.1, each with its own form, and the components in `components/cc/` — none takes a `className`, that is the hole through which every style guard leaks. `lib/model-text.ts` against AI traces (block list breaks, style list reports); the only hit in our own copy: "AI-powered explanations" in the chatbot knowledge base. Gallery under `app/(app)/admin/design-system`, guards `cc-token-guard` and `cc-provenance-guard` — source text where a hole is being closed, rendered where the effect matters: the rendered guard found that the message box has to be portalled, because `inert` is inherited and the focus otherwise never arrives in the box | M |
| 1.8 | **"My workspace" as a List Report** (`DESIGN.md` §2.2, mockup s7): live filter, table with object status, running analysis with cancel, failed run with "Retry" and "Run without model", *Stale*; the demo as the first row and the "Your turn" card as long as no own project exists (0.10). **Built 16.09.2026 (`dev`):** behind the same admin gate as 1.5, until 1.4 builds the switch; `/dashboard` stays unchanged for every account. `lib/workspace-rows.ts` prints a word instead of a zero for a never-analysed project — zero is not zero findings —, the demo is the first row and carries "partial", never "handed over", *Stale* stands as a provenance chip next to the object status and not as a status (§4.1), empty and "no match" are two components with two sentences, the price stands before the click, the run shows stages instead of percentages, and cancel says what it does not achieve. New in `components/cc/`: `ObjectIdentifier` and `Table`. `lib/analysis-run.ts` is the one sequence evidence → narrative → signed run, startable from two screens, so that an analysis started from the table produces no different worklist than one from the stage. `tests/workspace-list-report.spec.ts` reads the rendered page: nine tests, each proven red individually | M |
| 1.6 | **No dark mode:** the theme switch in the settings and the `.dark` overrides in `app/globals.css` are dropped, with a guard (decision 15.09.2026; settles UX-023, UX-044, UX-061, UX-062). **Built 16.09.2026 (`dev`):** what was removed was never a theme — 58 lines of `.dark` overrides recoloured a hand-picked list of utility classes with `!important`, and everything the list did not name stayed light: the dashboard table kept its white background under an almost black body. Gone are the overrides, the 15 remaining `dark:` variants, the Light/Dark/System picker, the theme bootstrapper in the shell, the `localStorage` copy and every reach for `prefers-color-scheme`. The profile field `theme` stays, documented as dead and no longer read by anything — deleting it would be a migration of account data —, and the settings no longer write it. `tests/dark-mode-guard.spec.ts` checks source and effect: `class="dark"` on `<html>` must not move a single colour on around 600 elements; both halves shown red first. Settles UX-023, UX-044, UX-061, UX-062 — the UX review of this release said the same from the outside: the cited places were never dark, but light surfaces under an almost black body | S |
| 1.7 | **Honest encoding up to the shell:** stepper and Verification Rail show "done" the same way, green only for proven; the tenant tab is called "Tenant-Verbindung prüfen", the lock notice stands once, with the BYOT unlock path (`DESIGN.md` §5.3, decision 15.09.2026). **Built 16.09.2026 (`dev`):** the Verification Rail painted the phase the reader was on green before it asked anything else — on the Economics page, which nobody can complete in this version, the green dot was the most certain thing on the screen, while the stepper showed the same phase yellow; and five of the seven greens stood for work that checked nothing. `phaseTone` in `lib/workflow-steps.ts` is now the one rule for stepper, rail and dashboard row: green exactly when `RailStep.proven`. `done` stays what it was, so that `workflowSummary().next` does not park anyone on a phase they cannot complete; the reader's position is no longer a colour. The tenant tab is called "Check tenant connection" (ADR-004), and the lock notice stands once instead of three times — three refusals read like three different ones, and none said how to get the connection; now the BYOT path stands with it, including the sentence that a BYOT approval does not lift G0:R0. `tests/phase-honesty-guard.spec.ts` measures both surfaces with `getComputedStyle`; `tests/locked-paths-guard.spec.ts` now requires exactly one lock notice instead of at least three | S |
| 1.9 | **Corpus comparator with facet status** (CR-05): per facet check status, denominator and scope — "not checked" never means *agree*; the real `buildProcessSkeleton` output is bound (edges, guards, opaque regions, events), successors typed 0/1/n/unknown checked, a purely syntactic anchor check is called *anchor_validation_passed*; the six mutants M01–M06 of the counter-review become a ratchet — each must turn red in its facet. **Sharpened and brought forward on 22.09.2026 (decision Sonny; §16 V1) — before 2.15, because without this step no engine rule can ever turn red through the corpus:** `tests/helpers/korpus-comparison.ts:321` today calls `buildProcessFacts`, **never** `buildProcessSkeleton`; `compareSkeleton` (:637–690) compares only `gateway`/`loop` line by line, neither node kind nor edge; line 685 says literally "die Engine baut kein Prozessskelett", which has been wrong since `lib/abap/process-skeleton.ts`. Measured: across the 47 `agree` cases of the class `skelett`, **71 of 390 expected nodes (18.2 %) were comparable at all**; CC-001 stands at `agree` with the reason "2 von 8 Knoten vergleichbar", and the class `fachsaetze` stands at `agree` 68 times with the reason "die Engine erzeugt keine Fachsätze" — a green that means "not checked". From now on `skelett` compares **node kind per anchor across all kinds from `SkeletonNodeKind`**, edges with kind (`sequence`/`conditional`/`default`/`loop-back`/`boundary`), the gateway class (2.15), the lane count with proof (2.16) and parallelism (2.17); a case is only `agree` if **at least half** of its expected nodes were comparable, and `baseline.json` names numerator and denominator per case. **Done when** no `agree` in `skelett` stands below 50 %, no `reason` contains "baut kein Prozessskelett" any more, M01–M06 turn red in their facet and CC-001 says "8 von 8 verglichen" | M |

**Done when** every stage passes its reference case in the register, a run without a key
delivers a signed pack, the shell opens for a real project with honest chips
— and nothing changes for users with the switch turned off.

### Phase 2 — v2.12 "Process from the code"

Mockup screen 1, left column: the process map "reconstructed from code" and the
code card below it.

| # | Step | Size |
|---|---|---|
| 2.1 | **Branches:** IF/ELSEIF/ELSE and CASE/WHEN with condition text and line range — deterministically in `lib/abap/` | M |
| 2.2 | **Calls:** FORM/PERFORM graph, function module names (BAPIs included), CALL TRANSACTION, SUBMIT program, AUTHORITY-CHECK with object and fields, write accesses | M |
| 2.3 | **Process skeleton:** steps, decisions, start and end from 2.1/2.2 — every node with a line range, without a model call. With the palette from `DESIGN.md` §5.8: error end, subprocesses from FORMs with effect, call activity, service, send, user and business rule task, multi-instance from `LOOP AT`, error boundary event, external system as a pool, data store; **unreached code, clones and technical helpers** are recognised and named instead of drawn. Reference case: `ZLEGACY_ORDER_FULFILLMENT_AUDIT` (1,000 lines, 341 of them unreached) | L |
| 2.4 | **Business naming:** the model names only skeleton nodes **and the lanes that 2.16 derives from the code — it proposes no lane for which the code has no proof** (changed 22.09.2026, §16 V3). An element without an anchor is called "unevidenced". Lanes carry the mockup sentence: reconstructed from AUTHORITY-CHECK and naming, no organisational statement. **Since 22.09.2026 the naming contract is explicitly two-part** (decision §9 No. 20): `sourceToken` stays unchanged as the token from the source and carries the anchor; next to it stands an **approved** `businessLabel`. A Model proposal is a proposal and never counts as approved automatically; without approval the interface shows the `sourceToken`. A deterministic checker rejects a proposal that contains a repository identifier — table, CDS view, OData name, function module, `SCREAMING_SNAKE`, Z/Y prefix or registered namespace; in 12,168 SAP activity labels something like this occurs three times (0.02 %) | M |
| 2.5 | **BPMN view in the workspace** (bpmn-js, read-only): legend Reconstructed · Confirmed · Proven; a click on an element opens the code card with marked lines; traceability ratio stored per model. Without a mouse per DESIGN.md §5.7: equivalent step list "Map | Steps", one tab stop with arrow keys, named nodes, rendered keyboard test | M |
| 2.6 | **BPMN export done right:** valid XML (escaping, CR-21), stable IDs, conditions on the edges, automatic layout, anchors and status in their own namespace under `extensionElements`; collapsed subprocesses as real BPMN subprocesses, external systems as a pool with message flow, data stores; schema validation in the test; `.bpmn` also in the Delivery ZIP. In addition, PNG and PDF export of the process map with provenance chips and anchors — no public link (`DESIGN.md` §5.3, §5.7) | M |
| 2.7 | **First look:** after import or example the workspace builds up in four stages — code read · process recognised · in business language · "This is your process" with process name, traceability, decisions, rules and "not determined". Every number from the run, skippable, `prefers-reduced-motion` shows the end state. In addition the three coach marks and the pre-answered question in "Ask this case" from the branches of the code, without a model call (`DESIGN.md` §5, §6.2). **Before that, "New project"** per `DESIGN.md` §6.1.1: one sentence of core, three lines on what is different, Clean Core in three glances (meaning, Level A–D, provenance of the evidence with the state of the catalog sync), then example or own code with the quota line from 0.9 | M |
| 2.8 | **Hidden business rules:** literals in conditions — tolerances, plants, company codes, customer and supplier numbers, date limits, exception lists — deterministically as rule candidates with an anchor; each one is kept, changed, dropped or moved into Customizing in 3.5 (feedback 15.09.2026). Classifying FORMs (`IF/ELSEIF` chains on literals) open as a decision table at the business rule task | M |
| 2.9 | **Navigating large processes** (`DESIGN.md` §5.9): overview of the phases as collapsed subprocesses, levels with a path line, outline tree instead of a flat step list, problem line per subprocess, minimap, "Show paths to here" and "Main path", run variants from the selection switches, overlays as filters, search opens the level of the hit, stable arrangement, level and selection in the URL. Acceptance on the 1,000-line example: every step reachable in at most three actions, by keyboard as by mouse | L |
| 2.10 | **Reference corpus v2.1 in the repository:** `docs/korpus/referenzkorpus-v2.1.md` (the case book with frame, rule register, negative list, counter-review, author reports) and `tests/korpus/cases/CC-nnn/` with `source.abap`, `profile.json`, `expected.json` per case, generated from the case book by `scripts/korpus/build-bundle.mjs` (deterministic, source hashes checked). `tests/korpus-engine.spec.ts` runs the engine against all 68 cases and compares findings, levels, objects, skeleton nodes; **ratchet** as with abaplint: `tests/korpus/baseline.json` lists every deviation with a verdict (`engine-defekt` · `korpus-offen` · `nicht-vergleichbar`) and reason, a case that matched and no longer does turns the run red, and so does a deviation that silently disappeared. Locations from public repositories stand in the repository **only as the SHA-256 of the excerpt** — no third-party code, and no pointer to it either: neither URL nor commit ID nor path, because eleven of twelve sources are without a licence and the load-bearing ones are, by all indications, employer holdings uploaded without authorisation. This repository is public and Git forgets nothing; a link with commit and line would be a permanent, indexed pointer to a third-party disclosure, even after someone takes it out again. The full evidence lies outside. Held by `tests/korpus-engine.spec.ts` ("docs/korpus/ trägt keinen Zeiger auf ein fremdes Repository"), which fires on every host name and every 40-character hex string. The case sources themselves are all **constructed** — no case comes from a customer system. The corpus is never used as prompt or training material for the model it checks. **Extended on 22.09.2026 by eight case forms (decision Sonny; §16 V5):** today the corpus checks **constructs**, but no **process form** — 68 cases, 5–36 lines, median 15, skeletons with a median of 5 nodes; in all 68 `expected.json` there is no lane, no pool, no message, no parallel node, and 31 of 66 sources have no gateway at all. Measured against a holding of 1,246 reference diagrams, **not a single case checks a process form that occurs there more often than 9 %**; the two most frequent (28.9 % and 18.9 %) have zero cases. Added is one constructed case family each: **F1** entry via function module, BAdI or RAP handler with response · **F2** handover between ≥ 2 different `AUTHORITY-CHECK` objects or dialog + update task · **F3** aRFC with `RECEIVE RESULTS` in `PERFORM … ON END OF TASK` · **F4** ≥ 2 `STARTING NEW TASK` before a `WAIT UNTIL` · **F5** rework loop (`DO`/`WHILE` around a call, exit on a status field) · **F6** medium-sized process, 150–400 lines, ≥ 3 business decisions on structure components · **F7** chain without a decision with several participants (BAPI → `COMMIT` → IDoc/mail → log) · **F8** dialog process (module pool, several PAI modules, `CASE sy-ucomm`). Every `expected.json` carries lanes with proof, gateway class (2.15) and parallelism (2.17). Constructed like all other cases: no customer code, no third-party diagram, no role list; the restriction of 16.09.2026 (no external reviewer) continues to apply. **Done when** `manifest.json` names ≥ 1 case per family, every new case runs through 1.9 with ≥ 50 % comparable nodes and has been pulled through abaplint and the metamorphic properties | M |

| 2.11 | **What the corpus finds in the engine** (baseline of 17.09.2026, `tests/korpus/baseline.json`): 24 engine defects in three families, plus 134 statement classes the engine does not produce at all yet. The families, not the individual cases, are the work. **As of 18.09.2026: 1 defect left** (CC-050 · level — a product decision, not a bug fix), 130 statement classes not yet produced — see below | L |
| 2.12 | **Effect status in the base model** (CR-06, per decision §9 No. 15): `IN UPDATE TASK` = registration, `COMMIT` = trigger, `ROLLBACK` = discard as states of the canonical model — views condense, they do not remove; V1/V2, local update mode and `AND WAIT` only in the evidenced context; CC-026/CC-027 as acceptance | S |
| 2.13 | **Functional method calls as effect carriers; "unreachable" only with evidence** (CR-07): `lo_stmt->execute_update( … )` in an assignment appears as an effect node or as an explicitly opaque executable task with an SQL/source reference; `CATCH` stays connected as a possible path, without control-flow evidence *unknown/not-modelled* — CC-034 as acceptance; in progress since 19.09.2026 | S |
| 2.14 | **Choosing the entry** (CR-08): method, FORM or dynpro event as the starting point; the multi-file case requests missing includes; an interface-only upload reports "not applicable" with an explanation instead of 0 steps — on 18.09. 9 of 74 corpus sources had no entry. **Added 22.09.2026 (§16 V5):** a `FUNCTION name.` opens a start event with the name `name` and `implicit = false` — **never** `START-OF-SELECTION`, as today. A public `METHOD` and a `MODULE … INPUT` each yield a start event instead of `no-entry-point`; measured, class method, module pool and bare `FORM` today yield **zero nodes**. Whether it is a message start (RFC, IDoc, BAdI) the source does not carry: then *Not determined* with a reason, not guessed — in the reference holding 14 % of processes start with a message, but that is no evidence about a single source | M |
| 2.15 | **A return code is the effect of a step, not a decision of the process** (22.09.2026, §16 V2; after 1.9): a gateway all of whose conditions check `sy-subrc`, `sy-tabix`, `IS ASSIGNED`/`IS BOUND` or `lines( )` and whose only predecessor is a call, read or write node is **not** exported as an `exclusiveGateway`; its error arm hangs as a boundary event on the step — the boundary event that `walkFunction` today creates **in addition** becomes the only one. The condition text stays **verbatim** on the flow (rule 6 untouched), the branch content stays reachable, a gateway on a business field stays a gateway, and the Technical layer continues to show the return code. Measured: **29 of 68 gateways (42.6 %)** of the eight shipped examples are technical (ZLEGACY 10/28, Z_MM 16/31); decisions per activity 0.82 against 0.10 in the median of the reference holding. The double drawing is evidenced in the code — `lib/abap/process-skeleton.ts:1500–1525` attaches the boundary event and leaves the `IF` standing, which then runs as a gateway; `tests/abap-process-skeleton.spec.ts:288–299` pins only the pair, not the gateway behind it. **Blast radius:** no signed number affected (the skeleton does not reach the run), revision 1 of existing projects stays (3.2), the demo is regenerated anyway (3.0.7). **Residual risk, named:** a decision meant in business terms that is written as `sy-subrc` (`SELECT SINGLE … IF sy-subrc <> 0` = "does not exist") moves from the gateway to the boundary event — the content stays, the form becomes "exception at the step"; that is the reading of the target format, not proven, which is why the condition stays visible. **Done when** activities with a boundary event followed by a `sy-subrc` gateway are **0** (today 5/5), the share of purely technical XOR in the export is ≤ 10 % (a setting, not a measured optimum) and every removed branch stays reachable as a flow with condition text | M |
| 2.16 | **Lanes from four kinds of proof, deterministically** (22.09.2026, §16 V3; after 1.9): `AUTHORITY-CHECK OBJECT x` (one lane per **different** object) · `CALL SCREEN`/dynpro/popup/ALV (human) · `IN UPDATE TASK`/`IN BACKGROUND TASK`/`VIA JOB` (system) · `DESTINATION` (external system — stays a pool). Lane count = number of **different** proofs, never more, with an upper limit; without proof exactly one lane; every lane carries a line anchor; status `reconstructed`, not *Model proposal*. **The lane name is the proof token** (`V_VBAK_VKO`, `SCREEN 9000`, `UPDATE TASK`); a business name comes only as an approved `businessLabel` next to it (2.4, §9 No. 20) and **never** as a job title from a list. Export: `laneSet`/`lane` with `flowNodeRef`, anchor in the extension namespace (2.6); map: lanes as bands (2.5); handover is a sequence flow across the lane boundary, not a symbol and not a message flow. `DESIGN.md` §5.8 is moved from "Lanes (proposal)" to "Lanes (reconstructed, from four kinds of proof)", with an ADR. Measured: `laneSet` occurs **zero times** in `lib/bpmn/`, while `lib/abap/process-skeleton.ts:1375` explicitly declares `AUTHORITY-CHECK` to be lane proof; `ZLEGACY_ORDER_FULFILLMENT_AUDIT` contains all four kinds of proof (L197/L205, L510, L670, L402) and would yield **2 lanes** — in the reference holding 71 % of the diagrams have ≥ 2 lanes, median 2. **Blast radius:** a lane is the only place where the product could say something about people; §8 forbids role lists and role mandates, therefore name = code token, and `tests/process-naming.spec.ts:326` ("CFO is dropped") also applies to deterministic lanes. What Signavio does with `laneSet` is **unmeasured** — 4.3 already lists lanes as a protocol point. If the bands in 2.5 push the step beyond M: split into 2.16a (skeleton + export) and 2.16b (map). **Done when** ZLEGACY carries exactly 2 lanes with anchors, a case without proof exactly one, every `flowNodeRef` resolves, no lane exists without an anchor, no lane name contains a token the source does not contain, and a proof in unreached code does not count | M |
| 2.17 | **Bringing `DESIGN.md` §5.8 and the code into line** (22.09.2026, §16 V4). **(a) Parallel gateway — the code gives way:** `STARTING NEW TASK` ×≥ 2 before a `WAIT UNTIL` (or `RECEIVE RESULTS` in `ON END OF TASK`) yields a `parallelGateway` fork; a join only if `WAIT UNTIL` is there — the reference holding allows a fork without a join (91 of 172 parallel diagrams have only one of the two), so no join obligation. A single `STARTING NEW TASK` stays a service task. Reason: 434 parallel gateways in the holding, the promise stands publicly in §5.8, `startingNewTask` is already captured — what is missing is the node kind and the evaluation of `WAIT UNTIL`. **(b) `LOOP AT` — `DESIGN.md` wins the default, the code keeps the exception:** a `LOOP AT` whose body does not leave the block becomes **one** activity (or a collapsed subprocess) with `multiInstanceLoopCharacteristics isSequential="true"`; a `LOOP AT` with `EXIT`/`RETURN`/error end and `DO`/`WHILE` with a status exit stay a cycle — there the argument from `lib/bpmn/model.ts` decision 2 applies literally, the flow leaves the body. The finding that decides it: our **own** hint `gateway-without-condition` fires six times on ZLEGACY (pinned in `tests/process-editor.spec.ts:97`), and **all six are `LOOP AT` gateways** — the product warns about its own drawing. **Not measurable, and to be recorded as such in the ADR:** how the reference holding draws "per item" — multi-instance markers cannot be extracted from the source; (b) is a decision about the reading, supported by our own rule collision, not evidence from outside. **Done when** the parallel probe yields 1 fork, 1 join and 2 parallel service tasks, and without `WAIT UNTIL` a fork without a join; ZLEGACY has 0 `gateway-without-condition` hits (today 6) and its 11 loops are drawn as a marker or a cycle according to the criterion; `DESIGN.md` §5.8 carries the exception, `model.ts` decision 2 is reworded and an ADR stands in `docs/design/decisions.md` | M |

**Two follow-ups to 2.6, found while building 2.9 (18.09.2026):**

- **A guard is not a branch.** A leading `CHECK p_rfc = abap_true.`
  is drawn as a conditional flow **without a bypass edge**. Anyone who follows it like a
  branch claims the program ends at the switch: `p_rfc` off would yield
  "31 of 65 steps do not run", in fact 59 run. 2.9 therefore distinguishes
  guard from branch; the clean solution is a bypass edge in
  `lib/bpmn`, so that the file itself carries the truth and not its reader.
- **`dataAssociations` do not get out of the export.** The tables per node
  stand in the BPMN only as text references (`<bpmn:sourceRef>`). A
  `dataByElement: Record<id, { reads, writes }>` on `BpmnExport` would make the
  data overlay possible without a second XML parser — without it, it stays
  unbuilt (2.9, deliberately).

**Done when**
- every task, every gateway and every lane carries a line anchor or is visibly
  "unevidenced", and the ratio is displayed (V25-A01);
- a rule outside the first 1,000 characters appears in the model (QA24-A10);
- names with umlauts, `&` and quotation marks yield schema-valid XML (CR-21);
- without an API key the skeleton appears with technical names;
- a syntactically valid model is never presented as an evidenced end-to-end as-is
  process;
- for corpus cases with process ground truth the skeleton matches.

**The three defect families from 2.11 — baseline 17.09.2026, as of 18.09.2026**

The baseline compares five statement classes per case: 340 pairs. On **17.09.2026**
178 matched; of the 162 deviations, 134 were **not comparable** (the
engine does not know the statement class — business statements throughout, level and objects for the
new classes), 4 **korpus-offen** and **24 engine defects** in three families.

On **18.09.2026**, after strands C (families a and b), D (family c) and K (the
residual root of a), **205** pairs match, 130 are not comparable, 4
korpus-offen — and **one** engine defect is left. The 27 new matches did not
come from a more lenient measurement. The comparison layer
`tests/helpers/korpus-comparison.ts` got exactly **one** new bridge (R01(c) →
R33, reading via a logical database at the `GET` event), and precisely where the
engine actually carries the statement; four cases have moved from "not comparable" to a
*visible* verdict, because the engine now produces the statement class at all.
Deliberately **no** bridge for R29, R15, R26, R12 and R13b: there the engine
carries no finding mark, and a bridge would have counted "missed" where nothing is
claimed. The next honest step there is a finding mark for the type dependency
(R29) — then CC-045 · befunde becomes a real comparison instead of a silence.

**(a) The grade read the catalog entry halfway — 9 cases, closed.**
CC-001, CC-002, CC-007, CC-008, CC-049, CC-051, CC-062, CC-063, CC-067 were graded **D**
where the corpus says **C**. The root: the engine took the worst
catalog grade across all objects and ignored the **access type** and the
**catalogued successor**. *Reading* KNA1 is C with successor `I_CUSTOMER` (R01);
only an unsupported *write access* is D (R02). Both facts stand in
the same catalog source. The residual root was **CC-045 · level**, which only became visible
when the engine saw the object at all thanks to family (c): a type dependency
(`TABLES`, `TYPE`, `INCLUDE STRUCTURE`, `SELECT-OPTIONS … FOR`) carried no access type in
the sense of the grading, so `gradeSapObjectUse` fell back to the name grade D, where R29 demands the
grade from the object's state. It is now a **use of its own**
(`reference`) and is graded by the state of the object — C for a table that SAP
does not release, instead of a D that accused the program of bypassing the application,
although it touches no row. A type reference to an *own* name deliberately stays
`Unknown`; CC-020 and CC-038 answer exactly that.

**(b) The engine judged more leniently than it may — 5 cases, four closed.** CC-024,
CC-029, CC-030 and CC-033 delivered **Unknown** instead of B.

**The one remaining defect: CC-050 · level — and it does not belong in the object grade.** The
engine says **A**, the corpus **B**. The earlier reasoning in this place (`SELECT …
WITH PRIVILEGED ACCESS` bypasses the DCL check and the engine sees nothing in it) is
**wrong** and stands here only as a corrected error: **R28** says literally "Own
findings that **never** change the A–D level", and the expected finding CC-050-F01 says it
itself — "Level unchanged B; … compliance finding, not a level finding."

Re-checked against the case book (18.09.2026): the case's B stands in its own
exclusion list — *"No A: the REPORT with a WRITE list is classic ABAP; usable
denotes the API surface, not the implementation"*. That is **R03**:
standard language version plus released dependency yields B. Cross-check: **CC-058,
profile 1** — the same source without the addition — also answers B. So the expected answer
holds; this is **not** `korpus-offen`.

The engine's A is the grade of the released `I_CUSTOMER` and correct as an object grade;
the case confirms it with `cloud_api_surface: usable`. What the engine does not see is
the **language version**. The answer to that would be a **level per artefact**, which
`/method/levels` today explicitly refuses ("There is no level here for a program as a
whole"). That is a **product decision and not a bug fix** — it changes a publicly
promised statement and needs Sonny's decision. Until then the defect stays:
correctly measured, with its reason in the ratchet. CC-050 is the only case where the
difference becomes visible at all — all other expected-B cases with engine A have zero
seen objects.

**(c) Dependencies nobody saw — 9 cases, one finding. Closed.** At these places the engine
reported nothing or something invented: **ADBC** (CC-034) — the string template
of a `cl_sql_statement->execute_update` *is* SQL, KNA1 did not occur in the whole output;
**macro expansion** (CC-042) — the placeholder `&1` from `DEFINE` was reported as a table,
KNA1 and KNB1 not at all; **dynamic targets** (CC-020, CC-036, CC-037, CC-038)
— `(LC_TAB)` and `(P_TAB)` stood as a database dependency in the output, the
resolved target was missing; **type reference without SQL** (CC-045, R29), **logical database**
(CC-047, `NODES`/`GET`) and **program-global field via literal** (CC-040, `ASSIGN
('(SAPMV45A)VBAK-…')`) — zero findings, zero coupling.
Both engines now read this from **one** file (`lib/abap/table-dependencies.ts`) instead of
from two copies of the same pattern, and the same file asks the declarations — which is why
`MODIFY gt_bp_data FROM gs_bp_data` is no longer an invented database coupling. A
target that the source does not close is not a table but the coverage class
`dynamic-target` ("Not determined"); the value next to it stands as a *possible* target,
marked and never as known.

**What the corpus itself has wrong — 4 cases, `korpus-offen`.** CC-001, CC-002, CC-007 and
CC-008 anchor R01 on the `FROM` line; R27 sets the start of the statement as the primary anchor.
The corpus contradicts itself here (v1 convention against the v2.1 rule), and
the engine follows R27. That goes to the case authors, not to the engine.

**The ratchet holds this:** `tests/korpus-engine.spec.ts` turns red when an `agree` becomes
`disagree`, when a `disagree` disappears without being struck, when an entry loses its
verdict or its reasoning, when the bundle drifts from the case book — and when
a host name or a forty-character commit ID ever gets into `docs/korpus/`.

**Findings of 16.09.2026 from the independence checks, to be fixed in 2.1/2.2:**
- **Chained statements under-counted in the coverage.** The engine has two
  statement readers: `readStatements` (`statement-reader.ts`) expands
  `WRITE: a, b, c.` into three statements, `tokenize` (`declaration-parser.ts`)
  does not — and `assessCoverage`/`buildAbapEvidence` read through `tokenize`.
  `Z_MATERIAL_STOCK_CALC` reports "3 × classic list output", written out there are
  10; `Z_SALES_ORDER_CREATOR` 3 instead of 5, `Z_MM_PO_APPROVAL` 2 instead of 4. Not
  to be fixed blindly: `tokenize` also feeds the class parser, which splits chains
  itself — expanding twice would be the next defect. Corpus case CC-043
  (v2) sets the expected value: one anchor per chain link. Found by
  property P2.
- **Local internal tables as a database dependency.** `extractDataCoupling`
  reports `MODIFY gt_bp_data FROM gs_bp_data.` (`Z_BUSINESS_PARTNER_SYNC.txt:59`)
  as `GT_BP_DATA · Write · Medium`; `evidence-model.ts` suppresses the same
  name as locally declared, `extractDataCoupling` does not ask the declared
  names. The over-reporting of `open-sql-discrimination.ts` is intended,
  but here it hits a variable — the class "invented dependency" from
  QA review 33471220d6e9. Found while building property P1.

### Phase 3 — v2.13 "Model"

Mockup Screen 1: the rule card BR-004 with anchors and the states "Keep · Change
deliberately · Drop · Clarify".

| # | Step | Size |
|---|---|---|
| 3.1 | **Editor** (bpmn-js Modeler) with the common BPMN 2.0 elements: pools and lanes, start, intermediate and end events, exclusive and parallel gateways, task types, subprocess, data object, message flow, annotation | M |
| 3.2 | **Revisions:** every save an immutable revision with account and time; the reconstructed as-is stays revision 1; comparison of two revisions | M |
| 3.3 | **Check hints while modelling:** bpmnlint standard rules plus our own — task without anchor, gateway without condition, lane only reconstructed, element deviates from the code without a state. Hints, not locks. **Distinguished by provenance since 22.09.2026 (§16 V7, after 2.17):** "Gateway without condition" (`lib/process-hints.ts:82`) stays `warn` on **reconstructed** gateways — there the code always has a condition, a missing one is an engine defect —, never fires on multi-instance (2.17) and is `info` on **modelled** gateways. Measured: the rule in its current form would fire on **554 of 1,320 XOR splits (42.0 %)** and in **310 of 1,246 diagrams (24.9 %)** of the reference set; there only 8.5 % of all flows carry a condition at all. On our own reconstruction all six hits are loops. A rule that fires on almost every second reference diagram trains people to skip hints — after that "Task without anchor" is no longer read either | S |
| 3.4 | **Business rules `BR-nnn`:** rule text with sentence anchors and quote, type (rule or control), source (program, include, form), linked to process elements | M |
| 3.5 | **Keep · change deliberately · drop · clarify** per element and rule. A confirmation is a new revision by the account — a new revision of the need, not code preservation | M |
| 3.6 | **As-is and to-be:** to-be model from the as-is and the states; side-by-side of what stays, changes, is dropped or is open | M |

**Done when** W22-A14 (a changed confirmed rule marks only the affected
derivations), C23-A06 (a need without code gets no invented anchor), every
confirmation shows name and time and the as-is revision is unchanged after
editing.

### Phase 4 — v2.14 "Exchange"

The path **to** SAP Signavio — via files, not via a connection (§6).
**Only the outbound direction** (decision Sonny, 18.09.2026): the BPMN import and the
round trip back wait for the time after 3.0, because the way back cannot be checked
honestly today — it needs a foreign file from a licensed
Signavio workspace, and without one every import test would be a test against our own
export. What stands here is therefore what we can prove ourselves.

| # | Step | Size |
|---|---|---|
| 4.3 | **Signavio export checked — deferred, Sonny carries it out before the 3.0 release (decision 18.09.2026):** export → import into SAP Signavio Process Manager, in the workspace of a member with a licence. A log of what survives (namespace extensions, lanes, layout) and what does not. Only after that may a page say "tested with SAP Signavio Process Manager" — with a date, and expressly only for this one direction **No longer a condition for 3.0 (Sonny, 30.09.2026): he takes the risk; until a log exists, the statement stays "not verified".** | S, external |
| 4.4 | **Short brief:** process picture, rules, open questions — every statement with an anchor; PDF and `.bpmn` in one download | M |

The numbers 4.1 and 4.2 stay unassigned: they carried the BPMN import and the
round trip and now stand in §7. The gap is deliberate — step 0.2 refers
to 4.3 by name, and renumbering would silently make this reference
wrong.

**Done when** our own export opens in SAP Signavio Process Manager, the
log from 4.3 lies in the repo with a date and no page claims more than this
log covers.

### Phase 5 — v2.15 "Share" — **Invitations implemented (18.09.2026); end-to-end read acceptance open (CR-13 → 5.6)**

Mockup Screen 1: "Share with members" and the avatar row; Screen 4: "Members on
this case".

**All five steps are on `main`, and the four acceptance criteria each have
an executed test** (`invitation-flow`, `invitation-rendered`,
`firestore-rules-readers`, `project-readers` — 40 tests). The phase had been
finished on `dev` since 17.09. and was waiting only for the four public texts: one
of them, section 8 of the Datenschutzerklärung, literally claimed *"There is no
sharing feature today"*. On 18.09. they are written, the rules deploy for 5.4
is out and verified against production (`88b5fe431436…`, five databases),
and what the reviews of the same day demanded has been added: a
cap of three simultaneously open invitations per project, the Art. 14 notice
in the invitation mail, a hint to the inviter that the mail may land in spam,
and a deletion cascade that leaves an invited reader nothing in other people's
projects.

| # | Step | Size |
|---|---|---|
| 5.1 | **Back to the link:** sign-in and registration unchanged; afterwards the app leads back to the invitation link (own paths only, no open redirect) | S |
| 5.2 | **Invite:** the owner enters an e-mail address; the server creates the invitation with an expiry date and sends the link | M |
| 5.3 | **Accept:** signed in, Terms accepted (existing consent path), account e-mail equal to the invited address and confirmed. Google login counts as confirmed; a password account gets a confirmation mail at this moment — registration itself does not change | M |
| 5.4 | **Read access:** the invited person reads the project in full, **including ABAP source code**. Generating, confirming, signing and exporting stay with the owner. `firestore.rules`: reading is allowed for the **owner or an accepted invitation** — not the administrator (see below) — **rules deploy before the app** | M |
| 5.5 | **Overview and revocation:** the owner sees who has had read access since when, and revokes; effective immediately | S |
| 5.6 | **End-to-end read acceptance** (CR-13): owner, invited reader, non-invitee, revoked reader and admin claim without membership across all GET and write routes — process map, naming, revisions, states, export, revocation; readers see the shared revision, change and start nothing. On 19.09. the four process routes required the owner even for GET; that is the repair, the acceptance is the test across all roles | S |

**Done when**
- a forwarded link opens nothing for a different account (C23-A14);
- after revocation, reading fails at the rules, not only in the interface;
- an unconfirmed password account gets no read access;
- the invitation dialog says expressly: "including source code".

**"Admin" was struck from 5.4 on 18.09.2026** (Sonny). The line had stood there since
15.09. and contradicted the withdrawal of operator reading from 16.09. — it was one
day older, and the later decision holds. Reading is allowed for the owner and the
accepted invitation, nobody else; `firestore.rules` never did it differently,
the contradiction stood in this line alone. An emergency — a reported
malicious code upload — still runs server-side through the Admin SDK, which bypasses the rules:
a deliberate action with a log, not a console that stands open.
An operator who wants to read a project has the same path as everyone: being
invited.

### Phase 6 — v2.16 "Views" — **on `dev`: 6.1, 6.5, 6.6, 6.7 (18.09.2026); open 6.2, 6.3, 6.4, 6.8**

Mockup Screens 1–4: switcher, layers, status chips, next step, search.

| # | Step | Size |
|---|---|---|
| 6.1 | **Switcher Business · IT · Management** (always in this order, Business first and selected on opening; decision Sonny 15.09.2026), in IT with focus Application · Solution · Enterprise. Held in URL and browser — not in the account, not in the project, not in run or audit pack. Plus **the three views in motion** in "New project" (`DESIGN.md` §6.1.1): one fact with a fixed anchor travels once through the three views, from the real run of the example, skippable, still under reduced motion. Below the switcher, per view, one sentence on which question it answers, with "About this view" (`DESIGN.md` §2.3) | M |
| 6.2 | **Layers:** Need & process · Standard fit · Costs & assumptions · Architecture & dependencies · Evidence & controls · Changes & commitments. A layer without content says so instead of inventing something (W22-A03) | M |
| 6.3 | **Overlays on the process model:** clean core level of the code behind a task, findings, usage (if imported) — presentation, not content; the level stays outside the signed audit pack | M |
| 6.4 | **Management view of the same project:** what is confirmed, what is missing, what a decision would bind; **Clean Core Score with rule version and history** — a history compares only runs of the same rule version — no portfolio. **The presentation of this view is step 3.0.10** (charts, overview screen, "not determined" as its own area): here the answers are created, there their form — whoever builds 6.4 reads 3.0.10 alongside, so that the figures carry from the start the coverage the chart must show | M |
| 6.5 | **Next step:** rule-based, the next open item with a reason, without a model call | S |
| 6.6 | **Search in the project** (⌘K) across elements, rules, findings, lines and glossary; **glossary at launch** per `DESIGN.md` §6.1 (SAP and product terms, source per SAP term), also in "Ask this case": technical terms with a popover, "What is …?" from the entry without a model call (decision 15.09.2026) | M |
| 6.7 | **Public cloud fit and four buckets:** which objects of the project have no path in Public Cloud (Tier 3 only) and thereby block the deployment decision; classification of every object into Retire · Keep · Rebuild · **No catalogued path** (no released API, no successor — with data basis and date; it is called "Blocked by SAP" only with a confirmed need, target profile and checked alternatives, CR-18) — the fourth bucket separates our own homework from SAP's roadmap. Derived from catalog and level, every assignment with evidence (feedback 15.09.2026). Rules per `DESIGN.md` §5.6 (decision 15.09.2026): dependent on the target platform; Retire only from a confirmed Drop; zero usage over ≥ 13 months yields a **Retire candidate** (open check) with source, period and capture type — a year change in the window is calendar information, not a captured year-end closing (CR-17); Blocked only for catalog objects without a released successor, modifications are Rebuild | M |
| 6.8 | **"Ask this case" via the embedded help AI** (decision Sonny 15.09.2026): no second chat — the existing assistant (`components/GlossaryChatbot.tsx`, `lib/chatbot-knowledge.ts`) is extended for 3.0. In the project it answers only from the project's evidence, every statement with an anchor, provenance *Model proposal*; outside a project it stays product and SAP help. The question answered in advance from the branches of the code (2.7) and glossary answers without a model call (6.6) run through the same assistant. Does not count against the quota; model text through `lib/model-text.ts` (1.5) | M |
| 6.9 | **Revision notice in the workspace** (CR-15) and **fragment anchors across the view switch** (CR-14): revision badge, inexpensive status check on focus, reload and before every writing action, change banner with "keep old state / update"; `setView`/`setFocus` keep `#fragment` — the same subject, a different look, the same place | S |
| 6.10 | **The Management view begins with its answer** (Sonny, 23.09.2026; ADR-029, `DESIGN.md` §597). Today it reads: public cloud fit (6.7, `WorkspaceShell.tsx:455–459`) → "Members on this case" (5.5, `:461–470`) → **only then** the four answers (6.4, `app/(app)/project/[projectId]/page.tsx:186–189`, as siblings *after* the shell). A decision-maker thus first sees an access management list and last the verdict — exactly the state ADR-029 abolished ("Management saw '58', '4 objects' and cost ranges without a verdict"). It came about without a wrong decision: 6.7 was built into the shell, 6.4 one step later onto the route, because another agent was working in the shell there; both places carry the same clean comment, only nobody laid them side by side. **A move, not a rebuild:** the `view === 'management'` block moves in `WorkspaceShell.tsx` **above** `PublicCloudFitPanel`; `projectId` is already available there. **Done when** the order answers → public cloud fit → members is checked on the rendered screen and the structure guards (`workspace-shell-guard`, `workspace-layers`) are brought along — with a counter-check, not with an adjusted expectation. | S |

**Done when** W22-A01/A02 (a switch keeps element, revision and selection and
creates no new hypothesis), a switch triggers no model call and a guard
proves that no stored artefact, no run and no pack carries a view attribute.

### Phase 7 — v2.17 "Standard and costs" — **on `dev`: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7 (18.09.2026); open 7.4, 7.8**

Mockup Screen 2.

| # | Step | Size |
|---|---|---|
| 7.1 | **ATC import** next to the existing usage import; imported findings reconciled with the engine | M |
| 7.2 | **Standard coverage per capability** with evidence level E0–E4: a catalog link yields at most E1, a scope item is an ID to be checked, a missing catalog hit proves nothing | M |
| 7.3 | **Counter-check scenarios** from the confirmed need, **as Given/When/Then with test data needs**, so that business departments check them without ABAP; Testing stores verdicts as a receipt with scope, environment and stubs | M |
| 7.4 | **Options with costs** only from an assumption revision; **"Do nothing" as a comparison option** (regression test per release, upgrade delay) and the sensitivity of the assumptions; no cost winner as long as an option is incomplete. **Mandatory fields** (decision 15.09.2026, ADR-035): currency without default, two day rates (development, test/key user), period under consideration without default, release cadence only confirmed, per option one-off effort as a range and ongoing effort per release, maintenance baseline for Keep and Do nothing; no field from a model, the fixed effort factors per 1,000 lines only as a proposal requiring confirmation **Before 8.4** (counter-review c5085bb, §8.3): the option calculation stands before the decision binds it; domain validation immediately — no negative amounts, score only in 0–100, rounding only at presentation (CR-16) | M |
| 7.5 | **Check tasks instead of sham knowledge:** a usage window that is too short, a missing include, a dynamic call become tasks, not verdicts | S |
| 7.6 | **What changes for users:** which transaction or app carries the step today and in future, what looks different, where training is needed — as an evidence level like 7.2, never as a claim (feedback 15.09.2026) | M |
| 7.8 | **Adaptation options towards the standard, directly on the element** (decision Sonny 16.09.2026): in the Business view every element with a standard candidate shows directly which adaptation of the process leads closer to fit-to-standard — in the process map (Map as well as Steps, 2.5), in the process chain or phase overview (2.9) and in the standard fit tables (7.2; screens s1 and s3). **Per operating model:** in Public Edition only what works with the scope item and key user/developer extensibility without modification; in Private Edition/RISE additionally the ways that remain allowed there (classic extension, modification as a named deviation with upgrade consequence). Every option names the process step that changes, the scope item as an ID to be checked, the evidence level E0–E4 from 7.2, what changes for users (7.6) and, as soon as 7.4 has an assumption revision, its costs next to "Do nothing"; without a standard candidate it says *Not determined* with a reason (7.5), never an invented path. A chosen option becomes a to-be proposal in 3.6 (as-is and to-be) and a decision per element in 3.5 — never an automatic change. Aligned with the four buckets from 6.7: "Blocked by SAP" has no adaptation option, only the reference to SAP's roadmap. Deterministic from catalog, level and scope item assignment; the model at most phrases the plain language, with anchor and provenance *Model proposal*. **Comparability per element, added 22.09.2026 (§16 V6):** **before** any standard assignment every element deterministically gets a comparability class — *business-comparable* (task, subprocess, call activity, business rule task, gateway on a business field) · *technical* (read/write step, technical gateway from 2.15, boundary event, error end, helper) · *structural* (start, end, lane, pool, data object, annotation) · *unknown* (`call-opaque`, dynamic target). Only *business-comparable* carries a standard candidate or *Not determined*; *technical* and *structural* **never** carry "no standard candidate", but "not comparable"; *unknown* means unknown. **Three results, never two:** proven covered · proven not covered · unknown. The class stands on the element, **never** in the signed pack — like the level. Why here and not in 7.2: 7.2 works on capabilities from rules, 7.8 brings the standard candidate to the element for the first time, and that is where the risk arises. Measured: in the 1,000-line example **15 of 65 flow nodes (23 %) are end events**, six of them with an error definition; across the eight examples 14 `errorEventDefinition`, 5 `boundaryEvent`, 115 data elements. In the reference set: typed end events 3 of 2,172, data objects 24 of 19,876 — **but absence in the diagram is no negative proof of function**, the set abstracts implementation details, and how completely is not measured. Exactly for that reason three results. **Done when** across the eight examples no end event, gateway, boundary event and no data store carries a standard candidate or "not covered", every `call-opaque` stands as unknown and the class function is pure (without import from `lib/bpmn`, like `abcd-classification.ts`) | M |
| 7.7 | **Compliance check hints:** deterministic hints on personal, tax- or audit-relevant data from the tables read — they determine check depth and test obligation, but are hints, not a classification (feedback 15.09.2026) | S |
| 7.9 | **Two dimensions per catalog object** (CR-01): classic release status and ABAP Cloud usability visible separately, successor named (CL_HTTP_UTILITY: classically released · Cloud: not to be released · successor CL_WEB_HTTP_UTILITY); the grade stays the clean core target reference (decision §9 no. 18) and says so on the object; `deprecated` without a successor is a check, not an automatic D | S |
| 7.10 | **Model built 23.09.2026 (14fcac9), wired 30.09.2026, Sonny's decisions of 30.09. implemented (PCE shipped, missing details only as a hint).** **Target profile as input** (CR-02): edition, language version per object, release/component level, catalog snapshot and rule version as a versioned `AssessmentProfile` through analysis, catalog lookup, result, decision and receipt; profiles not covered are visibly rejected or carried as unconfirmed; a profile change changes the subject hash and invalidates dependent approvals; a latest entry does not silently replace an older release snapshot | L |

**Decisions on the Economics stage (Sonny, 23.09.2026), after 7.4:**

| No. | Step | Size |
|---|---|---|
| 7.11 | **One currency for the whole page.** The Economics stage today has two notions of money: the upper calculation part prints a fixed `€` in six places (`tco/page.tsx` l. 38, 39, 357, 429, 440, 447) and has **no** input field for it, while the panel from 7.4 below asks for the currency. The same part already asks for the day rates (`devRate`/`userRate` are `null`, l. 74 lists the gaps) — only the unit it invents. In future the reader names the currency **once**, and both parts use it. As long as none is named, the upper part says "Not determined" instead of a number — exactly as it already does for missing day rates. **No loss of check sharpness:** `tests/tco-page-rendered.spec.ts:119/122` checks that the page does not calculate itself; the currency sign is only the prefix there and in future comes from the same source as on the page. | S |
| 7.12 | **Tipping points instead of a set radius.** `SENSITIVITY_FACTOR` (±25 %) is set, not derived: there is no distribution, no project history, no reference in the repository from which a value would follow — and a plausible constant without provenance is exactly what this product stands against. In future the panel calculates **how far** an assumption must move until the lead changes, and says so: not "at ±25 % A stays ahead", but "A stays ahead until the developer day rate rises by 38 %". A calculated number instead of a set one, and the reader can judge it themselves. No confidence interval — the distribution for that is still missing. **Done when** the radius is dropped without replacement and per assumption there is either a tipping point or a sentence on why there is none. | M |

**Status 7.10 (23.09.2026).** `lib/assessment-profile.ts` stands with 21 checks:
three coverage states (`covered`, `unconfirmed`, `rejected`), nine gap codes,
`profileRevision()` as `edition@release/snapshot#rule+fp12`,
`assessmentSubjectHash()`. `profileManifestInput()` throws on `rejected` — a
rejection that can be signed anyway is not one. The invalidation path
uses the existing `source-artefact` pattern. The wiring through the five
stations is deliberately not part of it.

**Noticed along the way, and in effect today:** `lib/abap/catalog-service.ts` knows
neither `deployment` nor `edition` — not a single occurrence —, and the only
snapshot is `abap-atc-cr-cv-s4hc`, the release list of the **Public** Cloud.
A Private Edition project is judged against it, and the result does not say
which snapshot answered. Exactly the silent substitution that
CR-02 names. Station 2 (catalog lookup) is therefore the actual **L**: the
snapshot must become an argument, and `pce-latest` must be synchronised and
shipped (~3 MB).

**Two decisions belong before the wiring, not after:**
1. **Private Edition.** As long as only the Public list is available, every
   Private project permanently carries an unconfirmed note in the signed manifest.
   Is that right — or does `pce-latest` become a prerequisite for station 1?
2. **Existing runs.** On the day station 1 is built, no existing
   run has a profile entry in the manifest; every existing project would stand at
   "unconfirmed". The same question as C23-A02.

**Status 7.10 (30.09.2026) — wired.** New: `lib/assessment-target.ts` (what the
owner declares — release, component level, language version per object — and how, together with
snapshot and rule version, the profile comes from it). Per station:
1. **Analysis** — `/api/runs/create` builds the profile before the quota is reserved. An
   edition for which nothing can be looked up is a **422** with the model's sentence;
   until now everything other than `public`/`private` silently became `public`. The declaration comes from the
   analysis step (`targetProfile`) or, if the caller sends none, from the project
   (`assessmentTarget`, Admin SDK only — **no rules change**).
2. **Catalog lookup** — `getCatalogSnapshotRef()` names key *and* digest; the lookups take
   the snapshot as an argument and throw `CatalogSnapshotNotShipped` instead of answering from `latest`.
   `/api/abcd-classify` names the snapshot in every response, rejects one that is not
   shipped (422) and carries the coverage for `profile`.
3. **Result** — the run signs `assessmentProfile`, `profileCoverage` and
   `assessmentSubject`; the manifest carries `profile:assessment` (`source-artefact`). The
   analysis page shows the profile with its state and every reason; the A–D panel says which
   snapshot answered.
4. **Decision** — same source, different profile is a new subject: `runs/create`
   writes the change record (`reason: 'profile'`), approval and artefacts read as
   outdated. Approval and decision on a run whose profile the project no longer
   has are a **409** `profile-changed`; `staleness()` counts the profile in.
5. **Receipt** — the pack checks the profile before signing and carries it in
   `08-input-manifest.json` (`targetProfile`: claim, reasons, subject). No grade.

**Decisions Sonny (30.09.2026), implemented:**
1. **No "unconfirmed" as the normal case.** If release or language version is missing, the run stays
   `covered`; the gap is a hint (severity `notes`) with a path to the input. "Unconfirmed"
   now means only real non-coverage: a snapshot that is not the one of this target
   (`snapshot-substituted`), or the moving list instead of the pinned one (`snapshot-unpinned`).
2. **PCE shipped.** `pce-latest`, `pce-2025-1`, `pce-2025-0`, `pce-2023-3` from
   github.com/SAP/abap-atc-cr-cv-s4hc, together ~6.3 MB, loaded server-side only
   (`lib/abap/catalog-snapshots.ts`, not in the browser bundle); the weekly sync pulls them
   along. A named release (e.g. "2023 FPS03") reads its pinned list and is confirmed;
   without a release it reads `pce-latest`; a release without a pinned list (2022) reads `pce-latest`
   and is visibly unconfirmed.
3. **Existing runs** stay as built: valid, marked `run-before-profile`, not
   unconfirmed, nothing checked against a profile they never had.

After a profile change, outdated texts say "a previous target profile" instead of "a previous
source". Open: the derived displays (contract, IT findings, demo) still read object states
from the standard list; the signed run and the A–D lookup read the target's snapshot.
Tests: `tests/assessment-profile-wiring.spec.ts`, `tests/assessment-profile.spec.ts`.

**Done when** V25-A02 (both catalog views with precedence rule and rule version),
V25-A05 (a window that is too short creates a check task), V25-A06 and W22-A15/A16
(simulated, skipped or a different code hash never counts as passed) — and every
element with a standard candidate in process map, process chain and standard fit table names, per
operating model, an adaptation option with scope item ID and evidence level or
says *Not determined* (7.8).

### Phase 8 — v2.18 "Decide and hand over"

Mockup Screens 3, 4 and 5 (left column).

| # | Step | Size |
|---|---|---|
| 8.1 | **IT view:** findings with both catalog views, level distribution, trace requirement → anchor → finding → target design | M |
| 8.2 | **Architecture contract as a document:** target context, runtime, persistence, APIs, bound inputs — **and why the alternatives were rejected** | M |
| 8.3 | **Generation follows the contract;** a deviation from the recommendation is recorded and applied | M |
| 8.4 | **Decision:** binds need, option, cost revision and contract; conditions with status; timeline; **reversible yes/no**. Confirmed by the account — "self-declaration, not an organisational mandate" | M |
| 8.5 | **Evidence chain and handover package:** requirement → decision → receipt → delivery artefact; the signature manifest names `covers[]`; the existing offline verifier checks it | M |
| 8.6 | **Steering one-pager:** one page (PDF) with exclusively figures that lead via link to the evidence, each with its coverage, and the column "not determined" (feedback 15.09.2026) | M |
| 8.7 | **Repair drafts server-side** (CR-10): immutable draft with parent revision, code/suite hash and draft ID; the runner executes exactly this draft, adoption only via compare-and-swap, receipt bound to the state actually executed — today the client holds the repair only in memory and the runner reads only the stored state, so the retry runs against the old code; until 8.7 auto-healing is blocked instead of silently ineffective | M |
| 8.8 | **Approval bound to the run that was read** (CR-11): `expectedRunId` and evidence digest in the command `approve-architecture`, comparison in the same transaction, 409 with an understandable diff on deviation, never silently re-pointing to the newest state — precondition of 8.4 | S |
| 8.9 | **Isolated test runner** (CR-09, decision §9 no. 16): its own Cloud Run service or job with a service account without roles, without app secrets, its own file system and network boundary; the mock path runs there or not at all; result evidence comes from the isolated worker; an authorised negative test on the deployment profile reaches neither foreign files nor credentials — until now "after 3.0, without a version". **Decided (Sonny, 24.09.2026): now, completely, as a Cloud Run service; the mock path is not blocked until then; the live path comes back before 3.0.** Setup: two services, `clean-core-runner` (mock) and `clean-core-runner-live`, both with a service account **without roles**, without secrets, ingress internal, invocation only by the app (`run.invoker`). All outbound traffic via its own VPC without NAT: the mock runner reaches nothing; the live runner reaches only the app, via Private Google Access. **The S/4 credentials never reach the runner:** it calls the tenant via a proxy of the app that serves only the approved host and inserts the credentials itself — generated test code cannot grab them, because it never has them. The infrastructure is created by the project owner (script with the operator), the code comes via the pipeline **Decided (Sonny, 24.09.2026): no external review** — the live path opens after the negative test on the deployed profile, the IAM check and a documented own review (full QA review and security audit of a main release read runner, proxy and routes completely; every finding fixed or refuted with evidence), then on Sonny's decision. | L |

**Done when** C23-A29 (manipulated evidence is detected), V25-A11
(offline verification with `covers[]`), W22-A17 (export is not adoption) and
QA24-A17 (a fingerprint without confirmation is not a green status).

### 3.0 — Switch-over

| # | Step | Size |
|---|---|---|
| D | **Block D — the whole app of a piece per `DESIGN.md`** (decision Sonny, 24.09.2026, before 3.0): gap list against DESIGN.md (193 of 230 UI files without a cc component; 7,450 palette classes, 729 texts < 11 px, 977× `font-black`, 141 button styles, 26 native dialogs), reduction in D.1–D.30 in three lanes (A library/guards, B the seven tools, C frame/account/public). D.1 sets an app-wide guard with a ratchet (per file and rule only decreasing), D.30 sets all exceptions to zero. Decisions E-1–E-7 accepted as recommended (12 px meta/chip; 2 px only in chips; stage header 22/800; `lib/severity.ts`; tokens also public; the old dashboard and the old stage demo are rebuilt per DESIGN.md, nothing is removed instead of rebuilt — with 3.0 everything is new, of a piece (Sonny, 24.09.2026); German Datenschutzerklärung as the legal-text exception) | L |
| 3.0.1 | **Switch for everyone:** every project opens in the workspace; the seven stages stay as tools. With the switch (decisions Sonny 24.09.2026): (a) the landing captures (`lib/landing-shots.ts`, `CAPTURE_LANDING` in `tests/capture-screens.spec.ts`) are re-recorded with a normal community account instead of the restricted admin account; (b) "Explore the demo" on the landing page leads to `/demo/workspace` (the workspace demo with the tour), and `lib/return-path.ts` allows `/demo/workspace` as the sign-in return target | S |
| 3.0.2 | **Existing projects** open without loss of IDs, runs and signatures (C23-A02) | M |
| 3.0.3 | **Preservation register in the new workspace:** every reference case from 1.1 passes | S |
| 3.0.4 | **Accessibility baseline:** keyboard, screen reader, `forced-colors`, phone in breakpoint S with the order from `DESIGN.md` §2.9, print layout per §7.1; "Keyboard shortcuts" in the help menu; heading order and live regions in the rendered test (§8) | M |
| 3.0.5 | **Clean-up:** the old 1,000-character generator and the unused `components/ProcessDocumentation.tsx` go — never a public page with search reach (3.0.6) **Decided (Sonny, 24.09.2026): way C** — the Documentation stage writes `documentation` from the engine results (process skeleton, business statements 17.7, effect status 2.12, names/lanes of the naming stage), without invented roles, KPIs and duration; after that the generator falls, and L-04 deliberately goes with it. `components/ProcessDocumentation.tsx` is already removed (383f8a9). | M |
| 3.0.6 | **New landing page and public texts — part of the 3.0 release, not after** (decision Sonny 15.09.2026): the home page per `docs/roadmap/clean-core-landing-v3_0.html`; **every product view on it from the real workspace** — screenshots or an embedded preview of the demo project `Z_MM_PO_APPROVAL`, regenerated with every release with `tests/capture-screens.spec.ts`, so that picture and product never drift apart; no mockup images. Kept: the sign-in button in the same place, navigation to the knowledge pages, metadata and canonical, JSON-LD (Organization, SoftwareApplication, FAQPage congruent with the visible FAQ, BreadcrumbList), sitemap, robots and live figures from the catalog. **The catalog and knowledge pages stay reachable with URL, canonical and content unchanged** (decision Sonny 15.09.2026, many impressions): `/catalog`, `/catalog/[object]`, `/catalog/browse/[letter]`, `/catalog/module/[area]`, `/catalog-sitemap.xml`, `/sap-clean-core-object-classification`, `/method/levels`, `/sap-cloudification`, `/clean-core-explained`, `/how-it-works`, `/knowledge`, `/abap-custom-code-analysis`, `/clean-core-score`, `/features/[slug]`, `/how-to`, `/whitepaper`, `/licenses`, `/about`, `/trust` — they get only the 3.0 look; the new home page actively links into them (object search, example objects, A–Z). The basis is Google Search Console (last 6 months to 15.09.2026: 9,115 impressions, of which 3,706 in the last 30 days; home page 1,509, `/catalog` 1,491, `/knowledge` 1,417, `/sap-cloudification` 1,371, `/abap-custom-code-analysis` 1,150, around 70 object pages). Titles and visible headings follow the search queries that already have reach but hardly any clicks — "SAP Cloudification Repository viewer" (403 impressions, position 8, 0 clicks), "cloudify SAP", "ABAP (static) code analysis", "Clean Core Score". Held by `tests/seo-surface-guard.spec.ts`. With the rebuild, `tests/landing-consistency-guard.spec.ts` (comparison rows, BenefitCard) and `tests/landing-style-guard.spec.ts` (eyebrow, weights ≤ 800) deliberately change; `tests/landing.spec.ts` stays valid. The pilot banner is dropped ("Powered by Generative AI" violates `DESIGN.md` §3.1); the banner in the product ("Free Community Edition … provided without warranty") is dropped too (decision Sonny 24.09.2026) — privacy, imprint and Terms stand in the footer of every page of the app shell, held by `tests/landing-consistency-guard.spec.ts`; **showroom struck, no /how-it-works (Sonny, 24.09.2026)** — with it replay, example package and the drawn examples are dropped; the seven stages stand as "The tools in your workspace" (`#workspace-tools`) on the home page and lead into the demo with tour. Plus README, How-to, Whitepaper, `llms.txt`, Facts | L |
| 3.0.7 | **Demo project and tour in the workspace** (`DESIGN.md` §6.1.2): the demo from 0.10 in all views and layers, regenerated with every release that changes the engine or rule version; tour with around twelve stations (reveal to handover), one station per place, progress only in the browser, invitation after every third station and at the end; "Show tips again" in the help menu | M |
| 3.0.8 | **Bring everything public in the repository to 3.0 — of a piece, with 3.0, not before** (decision Sonny 16.09.2026; **extended 24.09.2026: not only the files that name struck items, but every one**). The repository is public, so every checked-in text file is product communication. **Scope** (as of 24.09.2026: 132 Markdown and text files): the six in the root directory — `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `DESIGN.md`, `SECURITY.md`, `THIRD-PARTY-NOTICES.md` —, the 72 under `docs/` outside archive and corpus (`ARCHITECTURE.md`, the runbooks of the three agents, concepts, plans, mails), the skills under `.claude/skills/`, `llms.txt` (`app/llms.txt/route.ts`), the description in `package.json` and everything that is delivered publicly as text. **Of a piece means:** *one product picture* (the workspace with three views, the seven stages as tools — 3.0.1; nowhere any longer the seven stages as the product, the old home page, Signavio import, dark mode or other struck parts), *one vocabulary* (views, layers, Level A–D, the provenance values from `lib/provenance.ts`, "not determined", the sentence on self-declaration — each with exactly one spelling), *one voice* (factual, evidenced, without self-praise, every number with a source), *one state* (version, models, environments, agents and processes agree with the code everywhere). **Procedure:** inventory with one decision per file — update, move to `docs/archiv/` (with an entry in the index) or delete; finished concept and plan papers are archived, not rewritten; `docs/korpus/` and `docs/archiv/` are a domain source and history respectively and are only checked for references. **Acceptance:** a guard checks that (a) no public file names items that 3.0 removed (list from 3.0.5 and §8), (b) the core terms each have one spelling and (c) every file outside archive and corpus stands in the inventory with its decision. Until then the texts stay as they are — they describe what is shipped. Together with the product texts from 3.0.6 | L |
| 3.0.9 | **Mail deliverability** (decision Sonny 16.09.2026): welcome, approval, survey, digest and community mails land automatically in spam, although SPF, DKIM, DMARC `p=reject` and the aligned return path have been correct since 01.09.2026 (`docs/ARCHITECTURE.md`, mail table) and the bulk sends meet RFC 8058. Measure first, then turn: seed test per campaign at Gmail, Outlook, GMX/web.de and T-Online (inbox or spam, headers complete), Google Postmaster Tools and Microsoft SNDS for the domain, actually read the DMARC reports to `dmarc@clean-core.io`. Then the levers in this order: Resend tracking off (only Sonny can check it — every link must begin with `https://clean-core.io/`), DKIM to 2048 bit between two sends, its own subdomain for campaigns and the root domain only for transactional mails, one sender name for everything, warming up with small volumes to recipients who have opened, suppression from bounces and complaints (`email_events`) before every send, text and HTML part congruent, no images, no short links. **Done when** the seed test lands in the inbox at the four providers and Postmaster does not call the domain reputation "bad" — checked before every send, not once **Acceptance changed (Sonny, 30.09.2026):** no CSA certification (too expensive and laborious), T-Online is dropped (hardly any business context, mailbox only with a Telekom mobile number). **Done when** the seed test lands in the inbox at **Gmail and Microsoft (Microsoft 365 and Outlook.com)** and Postmaster does not call the domain reputation "bad". **GMX/web.de** is measured along in every seed run and reported, but does not block: there only time, low steady volume and asking users to add the sender to their contacts remain — named as a known limitation. **Accepted 30.09.2026:** seed run 20260930-a (welcome, welcome-approval, invitation; 15 mails) landed in the inbox at Microsoft 365, Outlook.com and Gmail, none in spam; SPF, DKIM, DMARC and the return path re-checked the same day; Google Postmaster Tools set up for clean-core.io (no reputation data yet at this volume, which is not "bad"). GMX/web.de not reported for this run — measured again with the next seed run. Before every campaign the same seed check runs again (`docs/MAIL-SEED-TEST.md`). | M |
| 3.0.10 | **The Management view becomes readable in seconds** (decision Sonny, 18.09.2026 — part of the 3.0 release, not after): the view answers its question *"What do I risk, what do I decide?"* today in cards and tables; for that it gets charts and an overview that a board reads at a glance. **Binding remains `DESIGN.md`, not taste:** ADR-029 holds unchanged — every card begins with its **answer sentence as the title**, only below it number, chart and table, and a classification that is easily misread ("a grade, not a compliance percentage", "Simulation, not a quote") stands in the answer sentence, never only in the popover. Colours per **§1.8**: charts that count states (Level A–D, findings per severity) take the state colours with letter and labelled category; **all others** the categorical palette and **never** a state colour. What is built: **(a)** an overview screen that answers the view's question in **one** sentence and carries at most six cards below it, each with one answer; **(b)** the **four buckets** (Retire · Keep · Rebuild · Blocked by SAP) as a distribution with *not assigned* as its own, visible area — plus the side-by-side "what moves when the target platform changes", because the same B classification is *Keep* in the Private Edition and *Rebuild* in the Public Edition; **(c)** the **readiness history** across runs of the **same** rule version, with the rule version on the axis — a history across two rule versions is not drawn but named as a break; **(d)** the **level distribution A–D** per §1.8; **(e)** "**what blocks the decision**" as a short, ordered list with evidence per row, not as a pie chart — an object without a public cloud path blocks the decision, that is not a rate; **(f)** the **decision status**: which decision is open and what it is waiting for. **Three limits that no design softens:** "**not determined**" is its own, visible area in every chart and is never rounded away or folded into "other"; **every number names its coverage** ("42 findings in 907 of 907 lines · 2 includes not read") and **every number in the chart is also reachable as text** (table or `aria-label`, §1.8); **costs appear only as a simulation** with their assumption revision (0.4) — no money value without it, not even as an axis label. Language per §3.1: clear and without AI traces, no superlatives, no progress bars for something that is not progress. Keyboard, screen reader, `forced-colors` and the print layout per §7.1 apply as everywhere (3.0.4) — a chart that only works on screen is not finished. Held by `tests/no-fabricated-figures.spec.ts`, `tests/money-honesty-guard.spec.ts` and one rendered test per chart | L |
| 3.0.11 | **Generation server-side with compare-and-swap** (full review of `81810c8026e0`: `e649177b3894`, `c42de15e9c75`): two tabs or an outdated state must not overwrite a newer generation — the server writes code, test suite, status and contract binding in the same transaction as the binding, against a token that the page read **before** the model call; `solutionDesign` belongs in the fingerprint. Next to 8.7. **Built 24.09.2026 (`feat/3.0.11-generation-cas`, local):** `GET /api/projects/{id}/contract` issues a token together with the inputs it covers; the `POST` writes the four fields in one transaction against token and `updateTime`, otherwise 409. `solutionDesign` stands deliberately in the token (`lib/generation-revision.ts`), not in the contract fingerprint — that one is bound in stored bindings and in the decision's manifest. No rules change (`tests/generation-store-cas.spec.ts`) | M |
| 3.0.12 | **Blocked accounts lose Firestore access immediately** (`2a9864f3b52e`, again `f71a57e2d326`): a rule reads the account status on project, run and user documents, with the `exists` guard for the emulator; **manual rules deploy by Sonny** before the app release — *as of 24.09.2026: on dev, rules deploy by Sonny open (`npm run deploy:rules`, then `npm run rules:verify`)* | S |
| 3.0.13 | **BYOK hardening before 3.0** (decision Sonny, 30.09.2026 — the extension to OpenAI/Anthropic stays with **3.5**; investigation of 30.09.2026): **(a)** `/api/gemini` does not take a truncated or aborted response as a result — the finish reason is checked, and without a complete response there is no model receipt; **(b)** `provider` is set explicitly in the receipt, not derived from a constant, so that 3.5 does not have to change anything in the canonicalisation; **(c)** the tier rule for BYOK applies server-side in `app/api/secrets/*` — today only the browser checks it (`settings/page.tsx`); who may use BYOK is decided by Sonny, until then today's list applies; **(d)** the rate limit of the key test applies per account, not per account and IP; **(e)** errors are mapped to codes before logging — no whole error object from the test and storage path; **(f)** `requireCurrentTerms` does not let `null` through as "accepted"; **(g)** BYOK keys get their own, versioned key instead of sharing `S4_ENCRYPTION_KEY`. No change to sign-up and account; a negative test per item. **Owner decisions 30.09.2026:** (d) saving and removing a key are limited per account as well, not per account and address (`lib/byok-rate-limit.ts`, a 429 that names the limit); (f) no census of and no mail to accounts without a recorded Terms consent — they give it at sign-in with 3.0, through the Terms gate; (g) no re-keying: a dry run against both databases found no stored model key, so the read path for pre-3.0.13 records through `S4_ENCRYPTION_KEY` and the re-key script are gone (the version field stays for later rotation), and the production deploy stops when `BYOK_ENCRYPTION_KEY` is missing or not 32 bytes | M |
| 3.0.14 | **Everything public in the repository is current and in English — and only English** (decision Sonny, 30.09.2026, a condition for 3.0): README, CHANGELOG, ROADMAP, BACKLOG, ARCHITECTURE, SECURITY, DESIGN, the decision log, runbooks, plans, registers with prose, skills under `.claude/skills/`, `llms.txt`, code comments and test descriptions that are public, every other `.md`/`.txt` outside `docs/archiv/` — brought up to the 3.0 state *and* translated where they are German. Builds on 3.0.8 (inventory in `docs/registers/public-texts.json`). Exceptions, named and nothing else: the German privacy notice `app/datenschutz/de` (a legal text the German version of which prevails, E-7) and archived documents in `docs/archiv/` (history, marked as such). Held by a guard that fails on German prose in public text files outside the exceptions. Done last before the release, after the other steps have stopped changing the documents | M |
| 3.0.15 | **SAP BTP is now named as the SAP Business AI Platform** (decision Sonny, 30.09.2026, a condition for 3.0): SAP presented the SAP Business AI Platform (BAIP) at Sapphire 2026 as the portfolio that contains SAP BTP, Business Data Cloud and Business Transformation Management. Visible product and public copy names it "SAP Business AI Platform (formerly SAP BTP)" at the first mention on a page and "BAIP" after that; a service SAP itself still names with BTP (e.g. the ABAP environment) keeps SAP's name; catalog and engine data from SAP sources stay unchanged. Held by a guard that fails on a bare "BTP" in visible copy outside the named exceptions. Runs before 3.0.14, after Block D and the landing parity work, so the copy is touched once | S |
| 3.0.16 | **Final external review before go-live** (decision Sonny, 01.10.2026, a condition for 3.0): shortly before the release a complete export of the release candidate (source, tests, workflows, every .md incl. ROADMAP, ARCHITECTURE, DESIGN, decisions, runbooks, plus a review guide and prompts for code, architecture and competition review) goes to Sonny for a large external OpenAI review on his own licence. Every finding that comes back is verified against the code like any model finding — fixed with a test, refuted with evidence, or scheduled — before the release; security details stay out of public files | M |
| — | **BPMN import before 3.0** (decision Sonny, 01.10.2026, replaces the 18.09. deferral): the professional editor imports BPMN 2.0 files (e.g. from SAP Signavio) as a new revision — parsed with bpmn-moddle, unsafe or unknown content refused, line anchors never taken from the file but restored from the reconstruction by id or unique type and name, everything else marked "added outside Clean-Core.io — no line anchor" (ADR-056). Round trip with a real Signavio file still open (4.3) | M |

**Done when** all phase acceptances have run on `main`, one corpus case passes through the
whole flow and the copy CI is green — **and the new landing page is live with
real product views**: no mockup image on a public page,
sign-in reachable as today, landing guards and Signavio/money guards green,
JSON-LD and visible FAQ congruent. 3.0 is not
released without the new start page. **The checked Signavio export from 4.3 is no longer a condition**
(decision Sonny, 30.09.2026 — changes the one from 18.09.2026: "I take the risk,
it can also be adopted without a protocol"). What remains: without a protocol no
page says "tested with SAP Signavio Process Manager" — the statement stays "BPMN 2.0 XML,
import into Signavio not verified", held by the Signavio guards — **and 3.0 does not appear without the Management view from 3.0.10**: its question answered in
one sentence, the four pots and the readiness history as a chart, "not
determined" in each of them as its own area, every number with its coverage and reachable
as text, costs only as a simulation with an assumptions revision.

**Acceptance order before 3.0 (counter-review c5085bb, adopted 19.09.2026):** not one corpus case
through the whole flow, but **three complete paths** — standard adoption, targeted
extension, retirement — plus one case that stays undecidable on business grounds and is shown
exactly as such, each with negative probes (wrong evidence, faulty generation, access
and revision changes). Order and minimum acceptances G0–G4 in §15.

---

## 5. Reconciliation with the mockups

The target picture of 3.0 is the **mockups 2.8** (`docs/roadmap/clean-core-mockups-v2_8.html`, 16 screens), built to
`DESIGN.md` and **accepted by Sonny on 15.09.2026**. They are reflected **1:1** in this roadmap: every
element of every screen is listed below with the step that builds it and fills it with real content. An element in the mockup
without a step is an error of this roadmap, not of the mockup; `tests/mockup-roadmap-guard.spec.ts` holds this
(every screen has a row here, every named step exists, and so does every step marker in the mockup).

The numbers in the mockups are placeholders until a real run delivers them — the exception is the line anchors of the
example `Z_MM_PO_APPROVAL` (L87, L108, L231, L412, L470, L502, L512), which are real lines. The landing page for
3.0 has its own mockup (`docs/roadmap/clean-core-landing-v3_0.html`, step 3.0.6).

| Screen | Element | Step |
|---|---|---|
| s0 First look | Build-up in four moments, ≤ 3 s, "Skip", end state with reduced motion, counter only with real lines | 2.7 |
| s0 | Code area with glowing lines, nodes grow out of their line | 2.3, 2.7, 1.5 |
| s0 | business names supplied once afterwards, chip *Model proposal*; the model does not hold up the build-up | 2.4, 2.7 |
| s0 | Plain-language sentence with anchor; reveal "hard-coded in the program" with "Why?"; *Not determined* next to it | 2.4, 2.8, 7.5, 1.5 |
| s1 Business · Process & rules | Header with title, "Details" (meta line), row "Project status" | 1.4, 0.5 |
| s1 | View switcher with question sentence and "About this view" | 6.1 |
| s1 | Menu "Tools", Anchor Bar with layers and "More" for empty ones | 1.4, 6.2 |
| s1 | Card "Next step" | 6.5 |
| s1 | Process card "Map \| Steps", zoom, focus, source column with tabs, "Legend" | 2.5 |
| s1 | Export PNG and PDF with chips and anchors | 2.6 |
| s1 | Business rules collapsed, tag *hard-coded in program*, decision per rule | 3.4, 3.5, 2.8 |
| s1 | "What this process does" with anchors, unsupported sentences grey | 2.4 |
| s1 | *Not determined* with reason and next path | 7.5 |
| s1 | Standard candidates with evidence level E1 | 7.2 |
| s1 | "Ask this case" with a question answered in advance | 6.8, 2.7 |
| s1 | Coach mark 1 of 3 | 2.7 |
| s1 | "Invite to view", initials with read access | 5.2, 5.5 |
| s2 Edit rules | Decision form with value states, focused error strip | 3.5, 1.5 |
| s2 | Footer bar "Unsaved changes", popover "Checks (3)", "Save as revision 2" | 3.2, 3.3 |
| s3 Standard fit | Capabilities with evidence levels E0–E4 as identifier, scope item as an ID to be checked | 7.2 |
| s3 | "What changes for users" | 7.6 |
| s3 | Given/When/Then scenarios | 7.3 |
| s3 | Check assignments | 7.5 |
| s3 | Compliance notes | 7.7 |
| s4 IT · Findings & chain | IT focus Application · Solution · Enterprise | 6.1 |
| s4 | Chain per selected finding with coverage "Chain complete for 31 of 42" | 8.1 |
| s4 | Findings with both catalog views, five rows and "Show all", live filter | 8.1, 1.5 |
| s4 | Level facet, overlays | 6.3 |
| s4 | Architecture contract AC-1 with rejected alternatives, generation follows it | 8.2, 8.3 |
| s4 | Imports: ATC and usage | 7.1 |
| s5 Management · Decide | Answer sentence above all cards, answer title per card | 6.4 |
| s5 | Clean Core Score with rule version and history, *Imported* | 6.4, 0.3 |
| s5 | Public cloud fit and four pots per target platform, Retire with 13-month evidence | 6.7 |
| s5 | Decision DEC-1 with conditions, reversibility, modal confirmation | 8.4, 1.5 |
| s5 | Costs only as *Simulation*, "Do nothing", required fields "What the comparison still needs" | 7.4, 0.4 |
| s5 | Steering one-pager | 8.6 |
| s5 | Timeline collapsed | 8.4 |
| s6 Handover & evidence chain | Chain requirement → decision → evidence → artefact, handover package | 8.5 |
| s6 | Evidence *Imported* or *Demonstrated · mock*; locked live test mode | 8.5, 0.1 |
| s6 | Toast "Handover package downloaded" | 1.5 |
| s7 My workspace | List report with live filter, object status, *Stale* | 1.8, 0.6 |
| s7 | running analysis with cancel, failed run with "Retry" | 1.8, 1.5 |
| s7 | Demo as first row, card "Your turn" | 0.10, 1.8 |
| s7 | Quota row | 0.9 |
| s8 Check tenant connection | Lock notice once with BYOT path, mock tab runs tests, no stepper | 1.7, 0.1 |
| s9 States | nine provenance chips in three forms, print and `forced-colors` | 1.5, 3.0.4 |
| s9 | four buttons, `dark` only in the modal message box | 1.5 |
| s9 | Form with value states, required fields | 1.5 |
| s9 | Filter empty vs. "No findings match these filters", empty state | 1.5 |
| s9 | three views with first answer and coverage | 6.1 |
| s9 | "Why?" popover, glossary in the text, example strip | 1.5, 6.6 |
| s9 | three coach marks, help menu with "Show tips again" | 2.7, 3.0.7 |
| s9 | "Ask this case" with glossary term and "What is a released API?" without a model call | 6.8, 6.6 |
| s9 | Search ⌘K, initials popover | 6.6, 5.5 |
| s10 Phone & print | Breakpoint S: order, step list instead of map, "Why?" as a 44 px target | 3.0.4 |
| s10 | Print view without bars, chips with word and icon | 3.0.4 |
| s11 New project — Upload | Form with drop zone and value states | 2.7, 1.5 |
| s11 | "What it counts": five analysis runs, own key, each example free once | 0.9 |
| s11 | "Where a model is called" and what is produced without a model call | 2.4 |
| s11 | Card "Your code and your trust" with links, commitment line without tick marks | 0.11 |
| s12 Large process · Overview | Phases as collapsed subprocesses with problem line, outline tree, path line | 2.9 |
| s12 | Palette: error ends, conditional flow, external system as pool with message flow, error boundary event | 2.3, 2.6 |
| s12 | Run variants from the selection switches, overlays as filters | 2.9, 6.3 |
| s12 | unreached code, clones, technical helpers | 2.3 |
| s13 Large process · one level deeper | Breadcrumbs, "Show paths to here", outline tree expanded, source column | 2.9 |
| s13 | Multi-instance, call activity VA02 with Level D, data store, text annotation | 2.3, 6.3 |
| s13 | Overlay "Technical" (commit every 50 orders) | 6.3 |
| s13 | Keyboard shortcut hint, legend of the palette | 3.0.4, 2.5 |
| s14 New project — Entry | Core sentence, three differences, clean core in three glances with status of the catalog sync | 2.7 |
| s14 | the three views in motion, reduced motion as three columns | 6.1 |
| s14 | eight examples, `Z_MM_PO_APPROVAL` first; warning on restart | 0.9, 2.7 |
| s14 | returning visit: one line "What is Clean-Core.io?" | 2.7 |
| s15 Demo project with tour | Demo strip with "Reset demo", title "Demo ·" | 0.10, 3.0.7 |
| s15 | Tour with twelve stations, "3 of 12", invitation at the end of the stations | 3.0.7 |

**Landing page 3.0** (`docs/roadmap/clean-core-landing-v3_0.html`, accepted by Sonny on 15.09.2026) — also
1:1; every section of the page has a row here, the guard checks them against the sections of the file:

| Section | Element | Step |
|---|---|---|
| Landing · header | Logo "Free Community Edition", navigation to the knowledge pages and to the object catalog, sign-in button in the same place (`?auth=signin`) | 3.0.6 |
| Landing · hero | h1 with "SAP Clean Core Accelerator", "Explore the demo" (leads to the demo via sign-in) and "Start with your own code"; preview with real anchors of `Z_MM_PO_APPROVAL` — with 3.0 from the real workspace | 3.0.6, 0.10, 2.7 |
| Landing · what | one quotable sentence on what Clean-Core.io is, three differences | 3.0.6 |
| Landing · views | the three views to switch through, single pass, three columns with reduced motion | 6.1, 3.0.6 |
| Landing · clean-core | Schema "What clean core means", A–D ladder with real example objects, evidence steps with provenance | 2.7, 0.3, 3.0.6 |
| Landing · catalog | "SAP Cloudification Repository viewer": object search (without JavaScript a link to `/catalog`), example objects with catalog page, A–Z, live number from `getCatalogStats()` | 3.0.6 |
| Landing · process | BPMN from ABAP as a real flow diagram from left to right with lanes, gateways, collapsed phases, external system pool and anchors; phases expand in place; "Map \| Steps" | 2.3, 2.5, 2.9, 3.0.6 |
| Landing · verify | "Verify it yourself": reference run with live numbers, SAP objects touched, check steps | 3.0.6 |
| Landing · honest | Provenance chips, four pots per target platform, Retire only from 13 months | 1.5, 6.7, 3.0.6 |
| Landing · toolchain | Positioning next to ATC, ADT, SAP Signavio and Cloud ALM; Signavio import as not yet checked | 0.2, 4.3, 3.0.6 |
| Landing · demo | Demo preview with tour, note on the required account | 0.10, 3.0.7 |
| Landing · start | three steps, example selection (each free once), five analyses, own key, access cards `card-sandbox` / `card-developer` | 0.9, 3.0.6 |
| Landing · trust | "Your data stays yours" with the evidenced statements from `DESIGN.md` §6.1.3 and their sources | 0.11, 3.0.6 |
| Landing · faq | FAQ as visible text, congruent with JSON-LD `FAQPage` | 3.0.6 |
| Landing · site-footer | all pages with search reach, legal, version stamp | 3.0.6 |

**Deliberately not adopted from the mockups 2.7** — the deviations all follow from §2 (account unchanged, roles
only as views, sharing only as read access):

| Mockup 2.7 | Why not |
|---|---|
| "Intent: Understand / Decide / Assure" | one axis (view) instead of two |
| "Playing as ▾", roles on rules, conditions and signatures | Roles are views; confirmation comes from the account ("confirmed by ‹name› · date") |
| "Members on this case" with permission levels | Read access by invitation, overview and revocation (5.5), no permission levels |
| Share dialog with handle and frozen "Evidence link" | Invitation to a confirmed e-mail address (5.2–5.4); a frozen state is the export |
| "Discussion" | open (§9) |
| "Expected vs. observed" | after 3.0 (§7) |
| MCP access | after 3.0 (§7), without virtual roles |

---

## 6. Close to Signavio, not a copy

**Adopted because it is good BPMN practice:** BPMN 2.0 as notation and
exchange format, check hints while modelling, revisions with comparison,
overlays for different readers.

**Our own — what a process modeller does not have:**
- The model **arises from the ABAP code**. Every element carries a line anchor
  and a status: reconstructed, confirmed or evidenced.
- Gateways carry the condition from the code; lanes are marked as a reconstruction,
  never as an organisation.
- Overlays show clean core level and findings behind a task.
- Keep / deliberately change / drop leads from as-is to to-be — and on to
  standard fit, options and decision.
- Without an API key the skeleton is produced anyway.

**Not built:** process repository or process landscape across projects,
value chains, glossary management, publishing portal,
approval workflows, simulation, process mining, SAP reference processes as content (only
a reference by scope item ID), handover to Cloud ALM, **API connection to a
Signavio workspace**. The exchange runs via files; the workspace and its
credentials stay with the customer.

**Technology.** bpmn-js for display and editor (bpmn.io licence: MIT with the condition
to leave the bpmn.io watermark visible), bpmn-moddle (MIT) for reading and
writing, bpmnlint (MIT) for check rules. Signavio imports and exports
standard-conformant BPMN 2.0 XML (SAP help, "Import/Export BPMN 2.0 XML"). **Unchecked
is how Signavio handles foreign `extensionElements`** — exactly that is what 4.3 settles.

---

## 7. After 3.0

| Version | What is added |
|---|---|
| **3.1** | Read-only MCP access per project with scoped token (screen 6) and Open Evidence Format · comparison pages "when Nova, when Clean-Core.io, when both" and German core pages (both can be brought forward at any time after 0.2) |
| **3.2** | Cloudification changelog with RSS as trigger for resubmissions |
| **after 3.0, no version** | **BPMN import and round trip** (was Phase 4.1/4.2, moved on 18.09.2026): import of `.bpmn` and `.xml` with report — error means not imported, warning means the element is dropped; imported elements carry the provenance "imported" and never appear as reconstructed from code. Plus the round trip: re-importing our own export recognises elements by ID, anchors and states remain, external changes come in as a new revision with comparison. **Why only here:** the way back cannot be checked honestly without a real export file from a licensed Signavio workspace — an import test against our own export only proves that we can read ourselves |
| **3.3** | Impact analysis: a catalog change creates check assignments only for affected projects |
| **3.4** | Pattern library (CC-BY, only after a publication review) |
| **3.5** | Observed effect against the frozen cost revision (screen 5 right) · multi-provider BYOK |
| **Candidates (feedback 15.09.2026)** | Code anonymisation before the model call · CLI/API that checks pull requests against clean core rules (shift-left) · effort estimate from metrics, only with calibration from the bench |
| **after 3.0, review** | QA 8cb85af1fee3 — grouped business rules whose occurrences mix controlling and continuing behaviour (`lib/abap/business-rule-set.ts`): review the type-per-group rule after 3.0; no code change before (owner decision 30.09.2026) |
| — | **After 3.0 · Engine: block-list checks as business rules** (decision Sonny, 01.10.2026): a table read of a block/exclusion list followed by a reject (e.g. ZMM_VEND_BLOCK at L228–232 in the demo) becomes a business rule candidate, so "vendor block list" can appear in the Business card and the landing hero. Changes engine output — bundled with the other engine findings of the QA slice review and a new benchmark measurement | M |
| — | **After 3.0 · Transformation: recorded finding → code mapping** (decision Sonny, 01.10.2026): the generation records which generated file and lines answer each finding, replacing today's clearly labelled text search on the Transformation page | M |
| — | **After 3.0 · Account deletion closes the token window** (decision Sonny, 01.10.2026; QA 483136c43105): a server-written tombstone on deletion that the rules check, so a still-valid token cannot recreate a profile. Needs a manual rules deploy | S |
| — | **After 3.0 · Key history for the audit signing key** (decision Sonny, 01.10.2026; QA 462335bf7edb): verify against a list of keys, then the deploy checks the key length again (tests/signing-key-guard.spec.ts) | M |
| — | **Kept as is · Welcome mail to an unverified address** (decision Sonny, 01.10.2026; QA 4359c775bab2, fd3acb754f97): sign-up stays unchanged; address verification at sign-up would be its own product step | — |
| no version | Publish the bench, fair comparison, team acceptance — need appointments with third parties, not development time · Runner isolation: since 19.09.2026 before 3.0 as 8.9 (CR-09)|

---

## 8. What is deliberately not built

| Not built | Instead |
|---|---|
| Changes to sign-in, registration and account — handle, removal of the name fields, migration, pseudonymisation | Account stays as today |
| Roles on contributions, "Playing as", self-play, role mandates, role list, role management | Views without effect on result and audit; accountability with the account |
| Permission levels comment/edit, raw-code switch, open links, guests without an account | Read access by e-mail-bound invitation |
| Decision Request | Read access |
| Case scoping across several objects | Project = case |
| Tenants, SSO, organisation accounts, self-hosted edition, ALM adapters, portfolio steering | Export, after 3.0 read-only MCP |
| Signavio API connection, process repository, simulation, process mining | BPMN file exchange (§6) |
| Writing MCP tools, agentically triggered decisions | everything read-only |
| Wave planning across several projects, capacity planning, mandatory owners per object as a role (feedback 15.09.2026) | Project = case; confirmation comes from the account; prioritisation within a project via the next step (6.5) |

`tier: 'enterprise'`, `orgId`, `maxTeamMembers` and the Okta/Azure fields in the profile
describe an expansion stage that is not coming. They stay anyway, because
this roadmap does not touch the account.

---

## 9. Decisions

### Closed on 30.09.2026 (Sonny)

- **Test audit (27.09.2026): all three stages approved** — (1) `docs/testing.md`, one smoke spec instead of five,
  shared sign-in helper; (2) fixed pauses replaced by waiting for an end state, Gemini stub in CI and one real
  call in the smoke check after the deploy, trial run with two workers, remove survey code, specs by feature;
  (3) sign-in once per file, animations via `page.clock`, the four gaps (admin switch, registration via
  the UI, audit pack export→verification, invitee read view). Stage 1 was built on 30.09.
- **3.0.14: everything public in the repository current and English only** — condition for 3.0; the only exceptions are the German
  Datenschutzerklärung (legal text) and the archive.
- **4.3 Signavio export is no longer a condition for 3.0** — Sonny takes the risk; without a protocol every
  public statement stays at "BPMN 2.0 XML, import not verified" (row 4.3, 3.0 "Done when").
- **3.0.9 Mail deliverability:** no CSA certification, T-Online dropped; acceptance = inbox at Gmail and Microsoft,
  GMX/web.de measured and named as a known limitation (row 3.0.9).
- **BYOK for OpenAI and Anthropic stays at 3.5.** The hardening that also benefits Gemini today comes **before 3.0** as
  3.0.13. The open questions of the extension (providers, consent/Terms version, measurement per provider, who may use BYOK)
  are decided at 3.5.
- **Community mail only with consent (QA bef96e7f054f).** Surveys and community updates go only to accounts that
  switched "Community mail" on in the settings (default off, written server-side by `POST /api/community-mail`,
  consent and withdrawal timestamped on the profile). Every sender passes the gate in `lib/community-mail.ts`; an
  unsubscribe also switches the consent off; the privacy policy (EN + DE) names purpose, consent under Art. 6(1)(a)
  and how to withdraw. Sign-up unchanged.
- **Firebase Authentication is not regional (QA 69a2e0b89ac9).** The privacy policy names europe-west1 only for
  Cloud Run hosting and Firestore, and lists Firebase Authentication under the third-country transfer paragraph
  (DPF/SCC), EN + DE.
- **The unsubscribe token leaves the logged URL (QA 8e25777f1339).** The visible mail link carries it in the
  `#fragment` and the page POSTs it; old `?t=` links keep working and are stripped from the address bar. The RFC 8058
  one-click URL in the header keeps the token in the query by design — accepted residual risk, the token can only
  unsubscribe.
- **Welcome mail to an unverified address (QA 7dac795fcb81): accepted risk, no code change** — verifying at sign-up
  would change sign-up, which stays unchanged. Recorded with `scripts/qa/refute.mjs`.

### Closed on 27./28.09.2026 (Sonny)

| # | Decision | Consequence |
|---|---|---|
| 1 | A process benchmark of constructed ABAP cases measures the hit accuracy of the process description; wave 2 from edge modules with borderline cases; wave 3 as a hidden, hard check set — "we need even more quality" | `tests/prozess-benchmark/`, report `docs/prozess-benchmark/BERICHT.md` |
| 2 | Improvements must be sustainable and generic, not tailored to the examples | Learning/check halves, frozen before the first run; check halves only as a sum |
| 3 | Path B (Gemini business statements) is measured as well; afterwards: B as proposal, A as evidence beneath it, contradiction marked | Roadmap **17.10**, ADR-055, DESIGN.md §5.10 |
| 4 | Design change for ≥ 80 %, "super user-friendly": start event per expandable subprocess, own end per `RETURN` | **ADR-054**, DESIGN.md §5.8; `CHECK` stays a conditional flow (coordinator, covered by §5.8) |
| 5 | Bodies of multi-loops that §5.8 draws as their own level also get a start event | **open, next step** (after v2.20.0) |
| 6 | Block D is the next session | Plan `docs/design/block-d-plan.md` |
| 7 | Release v2.20.0 on `main` only once the findings from wave 3 are incorporated | fulfilled on 28.09.2026 |

**Open after 28.09.2026:** (a) wave 3 below 80 % — polymorphic calls with an open target
(do not guess vs. show all candidates) and small methods as one step are design questions;
(b) approval of the stages from the test audit (fixed pauses, Gemini stub in CI, workers, survey code);
(c) language of the generated sentences against ADR-009; (d) BM-232 carries a business-wise wrong cluster ID
in the source text (`'DE'` instead of `'RD'`), which the checker was not allowed to change — without
effect on the measurement, for decision.

### Closed on 22.09.2026

**No. 20 — Naming and provenance are separated. The contract is explicitly
extended.** Rule 6 of the engine reads "every label is a token from the source,
never a phrasing that this engine invented". That guarantees
**traceability** — it does **not** guarantee **business language**. A checker can recognise this
conflict but not resolve it; it was a product decision, not a
technical one.

Sonny's decision: **extend.** `sourceToken` stays unchanged the token from
the source and carries the anchor; next to it stands an **approved** `businessLabel`.
A Model proposal is a proposal and never counts as approved automatically —
without approval the UI shows the `sourceToken`, not the proposal. This way
rule 6 stays untouched at its core: traceability still hangs on the
token, not on a name someone thought nicer.

Plus a deterministic checker on the proposal, **without a model call**: it rejects
whatever contains a repository identifier — table name, CDS view, OData name,
function module, `SCREAMING_SNAKE`, Z/Y prefix, registered namespace. The
clause is calibrated on a stock of 12,168 business activity labels:
something like that occurs there **three times**, 0.02 %. A step called "Select
VBAK" is not unsightly — it is outside of what a business model
ever does. If the model finds no business name, it shows "unsupported" instead of a
technical name pretending to be one.

The remaining style clauses (verb first, 2–8 words, Title Case, length) do
**not** become product rules: they come from a single measurement series, and a
second opinion explicitly considers them not derivable from the same numbers. They
may be a hint, never a condition.

Implemented in **2.4**; the lanes from **2.16** inherit the same separation — evidence token
as name, business name only approved next to it.

### Closed on 18.09.2026

The seven points that stood in the work log on the evening of 17.09. as "it cannot go on without Sonny",
plus half of the most urgent security finding.

| Decision | Result |
|---|---|
| **The four public texts** | Drafts for all four (privacy §8, trust card, `SECURITY.md`, `docs/DATA-RETENTION.md`); the privacy policy and `SECURITY.md` go to `main` only after Sonny has read them |
| **Rules deploy 5.4** | Is rolled out before the app follows — as 5.4 requires |
| **Survey migration** | Backup and dry run now, the writing step only after Sonny has looked at the result |
| **Key rotation** | Prepared (new Ed25519 pair, old public key in `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`); Sonny sets the secrets |
| **"Admin" in 5.4** | **Struck.** Reading is allowed for the owner and an accepted invitation, nobody else — the decision of 16.09. beats the row of 15.09. |
| **MFA requirement for S/4 access** (evening) | **Yes.** All six routes that reach a tenant require an *enrolled* TOTP and the factor on the token; the admin claim exempts from the approval, not from the factor. Plus (late) **the own Gemini key**: saving, testing, deleting likewise require an enrolled factor — otherwise a stolen token could replace the key. Everything else — runs, audit pack, Jira — keeps optional MFA (accepted risk, IDs in §12); a requirement on `runs/create` would exclude every account without a factor from analysing. The welcome mail recommends MFA to every account, explains the setup and names the two mandatory places. Blast radius measured: exactly one production account with S/4 approval without a factor, no account with its own key. |
| **7.3, three questions** (late) | **All three: leave as built.** A sandbox run is called "passed" at no capability (E3, `mock-only`, `demonstrated-mock`); the receipt version jump 1→2 retires old receipts instead of backfilling them; a run with replaced packages reaches E3 and *names* the stubs. The mapping scenario→test case stays declared, never guessed; the UI in the Testing stage is a follow-up step. |
| **Roll out rules** (late) | **Immediately.** Rolled out on the evening of 18.09. to all five databases, `rules:verify` confirms: production, register and working copy match (`7a068dad…`). |
| **Signavio export (4.3)** | **Later.** The 3.0 gate stays; nobody runs it now. |
| **Invitations per project** | **At most three open at the same time** (`INVITATION_MAX_OPEN`). Only open ones take a slot; a revocation frees it immediately |
| **PDF writer** | Our own stays. No new dependency for 491 lines that are cross-checked with `pypdf` |
| **WIF condition** | **Narrowed** to repository **and** ref (`main`, `dev`) **and** the two workflows that fetch a token at all (`deploy.yml`, `usage-report.yml`) |

In the afternoon of the same day, from two legal reviews of the public texts:

| Decision | Result |
|---|---|
| **Personal data in the upload** | **Upload ban instead of a data processing agreement.** A DPA would permanently make a free one-person project a processor for other parties' customer data. Both documents explicitly add that the platform neither detects nor blocks any of it |
| **Minimum age** | **18**, in privacy policy and ToS alike. Art. 8 GDPR and legal capacity are two questions; at 16, consent to the ToS without parents would be provisionally ineffective |
| **Language versions** | In case of discrepancies the **German version prevails** — German controller, German supervisory authority |
| **Retention of the security log** | **24 months**, deleted afterwards; the tool is ready, automation before 2028 |
| **Backups** | There were **none**. Daily 7 days and weekly 28 days set up, so that the 30-day commitment is covered again |
| **ToS version** | **Jumps to `2026-09-18`** (document v2.1.0) — but only after the consent path was built. Without it the jump would have locked out all 158 accounts |
| **Guard for personal data** | Is being built: deterministic, in the browser, before the upload, with deliberate confirmation — on both upload paths **and** on the usage data import. It shows patterns, it does not detect personal data |
| **dev service with the production secret set** | Deliberately left as is (Sonny, 18.09.2026, evening). The QA full review of `b88c77b` calls it critical eight times; the premise — a second account with write access — does not exist (collaborator list: exactly one), and the two-environments decision is in `CLAUDE.md`. Becomes a question again as soon as a second account gets write access — that is how it stands as a condition in the QA register. |
| **gitleaks and the sealed registers** | Rule allowlist instead of a fingerprint per write (Sonny, 18.09.2026, evening). `docs/security/register.enc.json` and `docs/qa/refuted-findings.enc.json` are entirely ciphertext from one function (`v`, `alg`, `key`, `iv`, `tag`, `data`); the AES key wrapped via RSA-OAEP crosses the entropy threshold of `generic-api-key` depending on chance — three times in one day. `.gitleaks.toml` names the two paths; `.gitleaksignore` stays for individual cases with a justification. |

**Still open (Sonny):** the three contract points of the first review —
liability cascade in ToS § 4 (the paragraph on cardinal obligations contradicts the sentence
above it), the consumer rules for free digital products
(§§ 327 ff. BGB), and the deemed consent in § 10 (ineffective in this generality according to BGH XI ZR 26/20
— in fact it is
already replaced by the consent dialog, the text just does not say so yet). That is contract drafting,
not text maintenance.

### Closed on 15.09.2026

| Decision | Result |
|---|---|
| **Account** | Sign-in and account stay unchanged; the data minimisation from 2.7 is struck |
| **Roles** | Only views, without influence on auditability; accountability lies with the signed-in user |
| **Sharing** | Invitation to an e-mail address; the link opens only for an account with exactly this confirmed address; read access including source code, the dialog says so |
| **Business view** | BPMN modelling close to Signavio, not a copy; import and export for Signavio licensees |
| **Versions** | Externally, 3.0 counts = the UX rebuild along the mockups 2.7; until then small steps in phases |
| **Form** | This file short and solely binding; earlier roadmaps in the archive `docs/archiv/` |
| **Design** | `DESIGN.md`: adopt SAP Fiori patterns, not the Fiori theme; the look of Clean-Core.io stays; the workspace opens in the Business view; provenance as a fixed list in the code |
| **Dark mode** | dropped (1.6) |
| **Tenant tab and stepper** | Tab stays visible as "Check tenant connection" with BYOT path; do not rebuild the stepper, only unify the encoding (1.7) |

The decisions of 12.09. on Phase 0 (scope "core + foundation", lock instead of
runner isolation, public texts only where wrong) still apply; their points
"data minimisation postponed" and "positioning later" are replaced by §2 and
3.0.6.

### Still open

| # | Decision | Why it matters |
|---|---|---|
| 1 | **Reference corpus — decided** | 16.09.2026 (Sonny): no external SAP architect, the scope could not be countersigned in a reasonable time; the corpus lives with this limitation and carries it on every case. 17.09.2026 (Sonny): the final corpus **goes into the repository** — as a machine-readable bundle per case plus a spec against the engine, step **2.10**. Until then v2.1 sits next to v1 and v2 on the Desktop |
| 2 | **Who provides a Signavio workspace for 4.3?** | Clean-Core.io has no licence. Without a member's workspace the claim stays "BPMN 2.0 XML", never "tested with Signavio" |
| 3 | **"Discussion" from the mockup before 3.0?** | Comments by invited people on the element would be another M step in Phase 5. A comment would not be a confirmation |
| 4 | **Preview before 3.0?** | Until 3.0 admin only — or from Phase 5 a preview for selected members, who then give real feedback |
| 5 | **Tally of the activation survey** | It should determine the order within the phases — the ATC import (7.1) and the German interface (3.1) are candidates |
| 6 | **Schedule rules deploys** | CI does not roll out `firestore.rules`. 0.7 and 5.4 need the manual production deploy **before** the app |
| 7 | **Rotate three repository secrets?** | `S4_ENCRYPTION_KEY`, `PILOT_APPROVAL_SECRET` and `MFA_BACKUP_CODE_PEPPER` were in every run of the public CI until 16.09.2026. No sign of exfiltration — it is a question of blast radius. The key is the expensive one: every stored S/4 credential file is encrypted with it; rotating means re-encrypting or having them re-entered. The other two cost nothing (SEC-2026-024, fixed — the rotation is the question after it) |
| 8 | **CSP without `unsafe-inline`?** | SEC-2026-016. `middleware.ts` explains over twenty lines why `script-src` carries `'unsafe-inline'` today: Next.js does not pass middleware-generated nonces on to its own `<script>` tags. Whether that still holds with Next 15 is the actual question. Tightening means: test against the real Google login, otherwise it locks people out |
| 9 | **S/4 credentials out of the child-process environment?** | SEC-2026-018. The sandbox child process receives decrypted credentials as environment variables and runs model-written test code. Network block loaded unconditionally, no shell, heap capped — the damage stays with the account holder. A proxy instead of environment variables would be cleaner, but is a design, not a repair |

| 10 | **Repair the faulty ABAP in the shipped example?** | abaplint (second parser, since 16.09.2026 as a ratchet in `tests/abaplint-second-opinion.spec.ts`) rejects `ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap:500` and `:524`: `INSERT ztab FROM @VALUE #( … )` is not valid ABAP, a host expression is written `@( … )`. Our reader is lenient and still captures the write. Repairing changes numbers that four specs pin |
| 11 | **Unquoted decimal number: read leniently or not?** | Since 3342f34 the engine reads `lv = 12.50.` as one statement. abaplint — and the language — read two: ABAP number literals are integers, `'12.50'` would be correct. So our rule reads code that would not compile. The case occurs in none of the eight examples; the rule is untested there |
| 12 | **Comment lines count as LOC in the complexity** | `computeComplexityScore` (`lib/abap/code-assessment.ts`) counts comment and continuation lines: `Z_MM_PO_APPROVAL` rises from 8 to 9 when a comment precedes every line. Found by the metamorphic property P3 (`tests/abap-metamorphic.spec.ts`). Changing it means changing a number that every signed run stores |
| 13 | **QA delta review: budget versus large diffs** | A diff that on its own exceeds the budget of one model call is never read — `tests/abap-metamorphic.spec.ts` (52,712 characters) has held the checkpoint at `a19945e` since `04b4684`, and in the full review it hit `analyze/page.tsx` with 172,900 characters. The checkpoint was already stuck once today for 41 commits (44a8715 → a19945e) and was caught up with six `workflow_dispatch` slices, without touching the budget. Options: raise the per-call budget for single files, read test files with their own budget, or review large files in sections. Each of them changes `scripts/qa/lib/config.mjs` or `review.mjs` — agent machinery, needs your go |
| 14 | **Scope items as a registry entry (7.2/7.8)** | SAP does not publicly provide a machine-readable complete inventory (checked 18.09.2026 incl. community: Process Navigator behind a login, rapid.sap.com dead, Excel export described contradictorily). What remains: entry from the account (route 1) or an export pulled by the operator. **As of 18.09.2026, evening: Sonny is fetching a Signavio export; wait until then (BACKLOG 27).** |
| 15 | **Effect status in the base model — transaction semantics (CR-06)** | Today: `IN UPDATE TASK` as a normal task, `COMMIT`/`ROLLBACK` only as a note ("commit only in the Technical Overlay", `DESIGN.md`). The counter-review shows on CC-026 that the Business view reads such an uncompleted effect as a completed task. **Recommendation:** registration, triggering and discarding as states of the canonical model; views condense them. Accepted (not in the list "Open for Sonny"); built as 2.12 on 24.09.2026 (`lib/abap/luw-states.ts`). |
| 16 | **Isolation boundary of the mock test runner (CR-09)** | The counter-review proves locally that the Node permission boundary does not hold (details private in the review package); the roadmap so far listed runner isolation under "after 3.0, without a version". **Recommendation:** before 3.0 as 8.9 — and until then lock the mock path like the live path, with the reason in the interface; interim protection (builtin allowlist, load hooks, `fetch` closed) immediately, without selling it as a boundary. Blast radius in the report of 19.09. |
| 17 | **Product positioning 3.0: read access (A) or small team room (B)?** | The counter-review recommends B — replies on the artefact and on a revision (thread, mention, resolve, separate confirmation; no chat, no role management); §8 has excluded commenting since 15.09. **Recommendation:** market 3.0 as A — "read access by invitation", never "decide together in the product" — and B as a 3.1 candidate on the same authorisation and journal basis; not both halfway. |
| 18 | **Grade definition (CR-01): clean core target reference or classic usability?** | `CL_HTTP_UTILITY` is released classically (B) and not to be released in ABAP Cloud (D, successor `CL_WEB_HTTP_UTILITY`); SAP's example grades classic as B. The code decided D deliberately (21 of 22 overlap objects have a successor). **Recommendation:** the grade remains the target reference, both dimensions stand next to it (7.9), the definition stands on the object. |
| 19 | **A dead Gemini key lies publicly in the repository's history** (found 21.09.2026 while following up the red security CI) | In the very first commit of 28.05.2026 there is a 12 MB log of an IDE session, and in it a `GEMINI_API_KEY` in plain text. The commit no longer hangs on any branch — neither locally nor on GitHub —, but GitHub keeps serving dangling commits of a public repository: the file can be retrieved without any sign-in, verified on 21.09. **Blast radius: none.** The key is dead — Google answers `API_KEY_INVALID`, it no longer exists. It counts against no bill and opens nothing. **What remains open is the state, not the damage:** the full gitleaks run finds it on every run across all branches, and only GitHub itself can remove a dangling commit. **Recommendation:** (a) ask support to clean up the history — the only route that works; (b) delete the four old `feature/*` branches from May that keep the commit alive locally, as soon as Sonny confirms that nothing unpublished is on them; (c) **do not** add it to the allowlist — a real key does not belong in a false-positive list, not even a dead one. Until then the Monday run is not affected: it reads only the history of `main`, and that does not contain the commit. |

**Open for Sonny:** 7, 8, 9, 10, 11, 12, 13 and 19. None of them blocks a
release; they stand here so they do not have to be searched for again. 10 to 12
were added on the evening of 16.09., 13 during the night, 19 on 21.09. The nine
UX findings that stood in the same list on 16.09. were done on 17.09. — see the
next paragraph.

**The nine UX findings were done on 17.09.2026** (`dev`, §13 set to "fixed").
All nine still stood as quoted — none had been made obsolete by v2.10.x or
v2.11.x —, and all nine were closed in the same direction:
less claimed, not claimed more nicely. Four promises were
removed rather than reworded, because there was nothing true to say
about them: the quirk remediation switch (it switched text, never code — real
switching is a second, mode-dependent model call and therefore
engine work of a later phase), the three static "Transformation
Insights", the SAP Build badge (there is no SAP Build export) and the
write half of the forum including likes and comments (it wrote to
`useState`, there is no backend it could be bound to; the
announcements stay readable, labelled read-only, next to the
administrator address). Held by `tests/claims-honesty-guard.spec.ts`:
eight of the nine on the rendered screen, the ninth — the Jira modal — from
the source, because nothing mounts it and no browser reaches it.
**Step 0.2 is therefore not finished:** the facts service and copy CI are still
outstanding, and §14 schedules around thirty QA findings into the same step.

On **1** (reference corpus), as of 16.09.2026 late: The four models — Grok 4.6
(130 cases), GLM 5.3 (105), Claude Fable 5.1 (122), DeepSeek v4 Pro (103), all
with an identical starting position — unanimously did **not approve** v1. Their
gaps converge (update processing/LUW, dynamic and native code, macros,
authorisation as a missing statement class); Fable additionally found internal
contradictions of the corpus (three anchor conventions, one wrongly worded
rule, R13 one-sided — an engine that passes v1 lets a KNA1 update via
ADBC through with zero findings). Not a single model case carries an evidenced
occurrence: 322 `konstruiert`, 0 `verifiziert` for three of them; Fable's 19
`verifiziert` explicitly mean only that the SAP objects and the syntax
exist. The reports are an attack surface map, not evidence.

From this, **reference corpus v2** (file `referenzkorpus-v2.md` next to the
v1 drafts on the Desktop; not in the repository): key *(source,
target profile)* instead of *source*; one anchor convention (statement start +
token offset); R13 split in two; eight new construct classes K12–K19 with
31 distilled cases CC-026 to CC-060, each with a convergence line,
evidence grade and the **independence levels** it has met
(`modellreview` · `abaplint` · `metamorph` · `sap-doku` · `architekt` — the
last for no case, and it says so); a negative list in every
export; the v1 corrections; the author reports with what was deliberately *not*
included. What replaces the architect without replacing him has run
since then as a ratchet in the tests: abaplint as a second parser
(`tests/abaplint-second-opinion.spec.ts`, nine deviations with a verdict in the
register, "we are right" is forbidden there) and five metamorphic
properties (`tests/abap-metamorphic.spec.ts`, 98 tests, one red proof per
property). On the first day both delivered seven engine findings that
no v1 case would have seen — four fixed (string template literals in three
readers; `ENDIF. " done` did not count as a closer), three stand above as 10–12
and in Phase 2.

Next steps on the corpus, in this order: pull every `source.abap` from v2
through abaplint and the properties (only then do the new cases carry
these levels); a targeted pass through public ABAP repositories
**by construct** (`IN UPDATE TASK`, `EXEC SQL`, `cl_sql_statement`,
`CALL TRANSACTION USING`, `ENQUEUE_`, `AUTHORITY-CHECK`, `ASSIGN (`,
`GENERATE SUBROUTINE POOL`) — hits with a pinned commit raise cases to
`verifiziert (Fundstelle)`, a nil return proves that the class does not occur
publicly; the machine-readable case bundle with a context hash.

---

## 10. How the benefit is measured

- **Traceability rate** per process model and per rule — share of elements and
  sentences with a line anchor (stored from 2.5).
- **Confirmation share** — how many elements of a model carry a state
  "keep / change / drop" (from 3.5).
- **Signavio export** — which elements and attributes survive the route to SAP
  Signavio (log from 4.3). The route back is measured only after 3.0.
- **Question → decision** — time and revisions from the first run to the confirmed
  decision (from 8.4).
- **Bench metrics** after 3.0 — precision and recall of the findings,
  hallucination rate (sentences without an anchor), honest abstention.

---

## 11. Working rules

- A step counts as delivered only once its acceptance has run — an exit list is
  a claim until it has been re-derived from the catalogue and the code.
- Run test commands unwrapped and search the **whole** log.
- No higher certainty in the text than in the data: missing stays missing,
  simulated stays simulated, reconstructed stays reconstructed.
- Known functional errors are corrected, not preserved as parity.
- New interface only behind the switch; what becomes visible to users is decided
  by 3.0.
- **Every push to `dev`** goes through the QA loop (`docs/QA-REVIEW-LOOP.md`);
  **every version on `main`** goes through the security audit (`docs/SECURITY-AUDIT-AGENT.md`) and the
  UX review (`docs/UX-REVIEW-AGENT.md`).

---

## 12. Security findings from the security agent

Confirmed findings of the audit of every `main` version are scheduled here by
priority. **Publicly, only ID, severity, priority, roadmap step and
status are shown** — titles, locations and descriptions are in the sealed register
(`docs/security/register.enc.json`) until a finding is fixed and shipped.

Scheduling: **critical** immediately as its own patch step before any other work ·
**high** into the current phase · **medium** into the next fitting step ·
**low** alongside related work.

| ID | Severity | Priority | Roadmap step | Status |
|---|---|---|---|---|
| SEC-2026-008 | high | P1 | Phase 0 · 0.7 | fixed |
| SEC-2026-014 | high | P1 | Phase 1 · export escaping | fixed |
| SEC-2026-015 | high | P2 | Phase 1 · export escaping | fixed |
| SEC-2026-016 | high | P2 | own step, needs Sonny's go | scheduled |
| SEC-2026-018 | high | P3 | own step: S/4 credential proxy, needs Sonny's decision | scheduled |
| SEC-2026-021 | info | P1 | Phase 0 · fixed immediately | fixed |
| SEC-2026-023 | high | P2 | Phase 0 · fixed immediately | fixed |
| SEC-2026-024 | high | P1 | Phase 0 · fixed immediately | fixed |
| SEC-2026-025 | high | P1 | patch step immediately, before any roadmap work (critical after review) | fixed |
| SEC-2026-026 | high | P1 | Phase 2 · CI hardening, GCP part needs Sonny's go | scheduled |
| SEC-2026-029 | medium | P2 | own step, needs Sonny's go | scheduled |
| SEC-2026-031 | medium | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-033 | medium | P3 | Phase 2 · hardening alongside related work | scheduled |
| SEC-2026-034 | medium | P2 | Phase 2 · data protection step | fixed |
| SEC-2026-036 | medium | P3 | Phase 4 · Exchange | scheduled |
| SEC-2026-037 | medium | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-038 | medium | P2 | Phase 2 · CI hardening, GCP part needs Sonny's go | scheduled |
| SEC-2026-039 | medium | P3 | Phase 2 · CI hardening, GCP part needs Sonny's go | scheduled |
| SEC-2026-040 | medium | P2 | Phase 2 · CI hardening, GCP part needs Sonny's go | scheduled |
| SEC-2026-041 | low | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-055 | low | P2 | Phase 2 · data protection step | fixed |
| SEC-2026-065 | low | P3 | Phase 2 · data protection step | fixed |
| SEC-2026-067 | low | P3 | Phase 2 · CI hardening, GCP part needs Sonny's go | scheduled |
| SEC-2026-073 | medium | P2 | own step, needs Sonny's go | scheduled |
| SEC-2026-074 | low | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-076 | low | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-079 | low | P3 | Phase 2 · hardening alongside related work | fixed |
| SEC-2026-080 | high | — | — | fixed |
| SEC-2026-081 | medium | — | — | fixed |
| SEC-2026-099 | critical | — | — | accepted risk |
| SEC-2026-100 | high | P2 | immediately | fixed |
| SEC-2026-110 | high | — | — | accepted risk |
| SEC-2026-131 | high | P2 | 3.0 | scheduled |
| SEC-2026-135 | high | P1 | immediately | fixed |
| SEC-2026-136 | high | P1 | immediately | fixed |
| SEC-2026-137 | high | P1 | immediately | fixed |
| SEC-2026-150 | high | P2 | 3.0 | scheduled |
| SEC-2026-151 | high | — | — | accepted risk |
| SEC-2026-152 | high | P1 | immediately | fixed |
| SEC-2026-219 | medium | — | — | accepted risk |
| SEC-2026-220 | medium | — | — | accepted risk |
| SEC-2026-221 | medium | — | — | accepted risk |
| SEC-2026-222 | medium | — | — | accepted risk |
| SEC-2026-223 | medium | — | — | accepted risk |
| SEC-2026-224 | medium | — | — | accepted risk |
| SEC-2026-225 | medium | P2 | immediately | fixed |
| SEC-2026-226 | medium | P3 | 3.0 | scheduled |
| SEC-2026-227 | medium | P2 | immediately | fixed |
| SEC-2026-228 | medium | P2 | immediately | scheduled |
| SEC-2026-229 | medium | P2 | 3.0 | scheduled |
| SEC-2026-230 | medium | P3 | 3.0 | scheduled |
| SEC-2026-231 | medium | P3 | 3.0 | scheduled |
| SEC-2026-232 | medium | P3 | immediately | fixed |
| SEC-2026-233 | medium | P3 | 3.0 | scheduled |
| SEC-2026-234 | medium | P2 | immediately | scheduled |
| SEC-2026-235 | medium | P2 | immediately | fixed |
| SEC-2026-236 | medium | P1 | immediately | fixed |
| SEC-2026-276 | low | P2 | immediately | scheduled |
| SEC-2026-277 | low | P2 | immediately | scheduled |
| SEC-2026-278 | low | P2 | immediately | scheduled |
| SEC-2026-279 | low | P2 | immediately | scheduled |
| SEC-2026-280 | low | P2 | immediately | scheduled |
| SEC-2026-281 | low | P2 | immediately | scheduled |
| SEC-2026-282 | low | P2 | immediately | scheduled |
| SEC-2026-283 | low | P2 | immediately | scheduled |
| SEC-2026-284 | low | P2 | immediately | scheduled |
| SEC-2026-285 | low | P2 | immediately | scheduled |
| SEC-2026-286 | low | P3 | immediately | scheduled |
| SEC-2026-287 | low | P3 | immediately | scheduled |
| SEC-2026-288 | low | P3 | immediately | scheduled |
| SEC-2026-289 | low | P3 | immediately | scheduled |
| SEC-2026-290 | low | P3 | immediately | scheduled |
| SEC-2026-291 | low | P3 | immediately | scheduled |
| SEC-2026-292 | low | P3 | immediately | scheduled |
| SEC-2026-293 | low | P3 | immediately | scheduled |
| SEC-2026-294 | low | P3 | immediately | scheduled |
| SEC-2026-295 | low | P3 | immediately | scheduled |
| SEC-2026-296 | low | P2 | immediately | scheduled |
| SEC-2026-297 | low | P2 | immediately | scheduled |
| SEC-2026-298 | low | P3 | immediately | scheduled |
| SEC-2026-299 | low | P3 | immediately | scheduled |
| SEC-2026-300 | low | P3 | immediately | scheduled |
| SEC-2026-301 | low | P3 | immediately | scheduled |
| SEC-2026-302 | low | P3 | immediately | scheduled |
| SEC-2026-318 | low | P1 | immediately | scheduled |
| SEC-2026-319 | low | P2 | immediately | scheduled |
| SEC-2026-320 | low | P2 | immediately | scheduled |
| SEC-2026-321 | low | P2 | immediately - with the next rules deploy | fixed |
| SEC-2026-322 | low | P3 | 3.0 | scheduled |
| SEC-2026-323 | low | P3 | 3.0 | scheduled |
| SEC-2026-324 | low | P2 | immediately | scheduled |
| SEC-2026-325 | low | P3 | 3.0 | scheduled |
| SEC-2026-336 | high | P1 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-337 | high | P2 | Phase 2 · hardening alongside related work | scheduled |
| SEC-2026-338 | high | P2 | Phase 2 · hardening alongside related work | scheduled |
| SEC-2026-343 | high | P1 | own step: approval token against reuse | scheduled |
| SEC-2026-344 | high | P3 | own step: S/4 key hygiene with migration, needs Sonny's go | scheduled |
| SEC-2026-418 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-419 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-420 | medium | P3 | Phase 2 - hardening alongside related work | fixed |
| SEC-2026-421 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-422 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-423 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-424 | medium | P2 | Phase 2 - CI hardening, needs Sonny's go (own repository secret) | scheduled |
| SEC-2026-425 | medium | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-426 | medium | P3 | Phase 2 - data protection step | scheduled |
| SEC-2026-427 | medium | P3 | Phase 2 - data protection step | scheduled |
| SEC-2026-428 | medium | P3 | only if the Jira integration is ever activated | scheduled |
| SEC-2026-429 | low | P3 | only if the Jira integration is ever activated | scheduled |
| SEC-2026-430 | low | P3 | only if the Jira integration is ever activated | scheduled |
| SEC-2026-431 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-432 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-433 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-434 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-435 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-436 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-437 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-438 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-439 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-440 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-441 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-442 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-443 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-444 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-445 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-446 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-447 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-448 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-449 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-450 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-451 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-452 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-453 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-454 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-455 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-456 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-457 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-458 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-459 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-460 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-461 | low | P3 | Phase 2 - data protection step | scheduled |
| SEC-2026-462 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-463 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-464 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-465 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-466 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-467 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-468 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-469 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-470 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-471 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-472 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-473 | low | P2 | fixed in this patch step | scheduled |
| SEC-2026-474 | low | P2 | fixed in this patch step | scheduled |
| SEC-2026-475 | medium | P2 | fixed in this patch step | scheduled |
| SEC-2026-476 | medium | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-477 | medium | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-478 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-479 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-480 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-481 | low | P3 | v2.19 security step A - immediately | fixed |
| SEC-2026-482 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-483 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-484 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-485 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-486 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-487 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-488 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-489 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-490 | low | P3 | only if the Jira integration is ever activated | scheduled |
| SEC-2026-491 | low | P3 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-492 | low | P3 | v2.19 security step A - immediately | fixed |
| SEC-2026-493 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-494 | low | P3 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-495 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-496 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-497 | low | P3 | v2.19 security step A - immediately | fixed |
| SEC-2026-498 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-499 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-500 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-501 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-502 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-503 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-504 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-505 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-506 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-507 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-508 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-509 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-511 | low | P3 | only if the Jira integration is ever activated | scheduled |
| SEC-2026-512 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-513 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-514 | low | P2 | v2.19 security step A - immediately | fixed |
| SEC-2026-515 | info | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-516 | info | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-517 | info | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-518 | info | P3 | own step: S/4 key hygiene with migration, needs Sonny's go | scheduled |
| SEC-2026-519 | info | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-520 | info | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-521 | info | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-522 | info | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-523 | info | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-524 | medium | P2 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-525 | medium | P2 | v2.19 security step A - immediately | fixed |
| SEC-2026-526 | medium | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-527 | medium | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-528 | medium | P2 | Phase 2 · data protection step | fixed |
| SEC-2026-529 | medium | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-557 | medium | P2 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-558 | medium | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-559 | medium | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-561 | medium | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-565 | medium | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-566 | medium | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-568 | medium | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-569 | medium | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-570 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-571 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-572 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-573 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-576 | low | P3 | Phase 2 - hardening alongside related work | fixed |
| SEC-2026-577 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-578 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-580 | low | P3 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-581 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-582 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-583 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-585 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-586 | low | P3 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-588 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-589 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-590 | low | P3 | Phase 2 · data protection step | fixed |
| SEC-2026-592 | low | P3 | Phase 2 - hardening alongside related work | fixed |
| SEC-2026-596 | low | P3 | own step: S/4 key hygiene with migration, needs Sonny's go | scheduled |
| SEC-2026-597 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-598 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-599 | low | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-600 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-601 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-603 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-606 | low | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-607 | low | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-608 | low | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-609 | low | P2 | Phase 2 · data protection step | fixed |
| SEC-2026-610 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-611 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-613 | low | P3 | Phase 2 - dependency step (firebase-tools, only with the Node 22 and npm 11 toolchain) | scheduled |
| SEC-2026-616 | low | P3 | v2.19 security step C - before 3.0 | fixed |
| SEC-2026-620 | info | P3 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-624 | info | P3 | v2.19 security step F - hardening alongside related work | fixed |
| SEC-2026-626 | info | P3 | Phase 2 - hardening alongside related work | scheduled |
| SEC-2026-627 | info | P2 | v2.19 security step B - with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-629 | info | P3 | Phase 2 · data protection step | fixed |

**Audit of v2.20.0 (`fc78767`), 28.09.2026: 1 high, 15 medium, 50 low, 13 info — all 188
candidates verified; 45 scheduled, 30 refuted, the inbox is empty.** 75 new
register entries (SEC-2026-555 to -629): three findings carry the fingerprints of already scheduled
entries (SEC-2026-509, -512), two share one. The audit model rewords at every release;
most findings are old findings with a new fingerprint and take over their decision,
each checked at the cited line of `fc78767`. The one reported as high is refuted, as
was its predecessor SEC-2026-552; the reasons are in the sealed register. Among the
scheduled ones, none is critical or high. Scheduled:

- **Step B — with the next rules deploy, needs Sonny's go:** SEC-2026-559, -561, -577,
  -599, -627 (P2); -565, -568, -570, -581, -588, -597, -598, -600, -608, -620 (P3).
- **Step C — before 3.0:** SEC-2026-566, -571, -572, -573, -601, -610, -611, -616 (P3).
- **Step F — alongside related work:** SEC-2026-558, -582, -583, -585, -589, -606, -622, -624 (P3).
- Into existing steps: SEC-2026-557 (P2), -580, -586 to the CSP step; SEC-2026-609 (P2), -590,
  -629 to the data protection step; SEC-2026-576, -592, -607, -626 to the hardening in Phase 2;
  SEC-2026-578, -603, -613 to the dependency step; SEC-2026-596 to the S/4 key step.

**Audit of v2.19.0 (`a12774c`), 24.09.2026: 1 high, 12 medium, 52 low, 16 info — 55
scheduled, 26 refuted, the inbox is empty.** 79 new register entries
(SEC-2026-476 to -554): one finding carries the fingerprint of the already refuted SEC-2026-090,
two share one. Every finding was checked at the cited line of today's code; the one reported as
high is refuted; the reasons are in the sealed register. The Firestore rules
are unchanged since the audit (hash `32e1970bb02e`, rolled out as such on 24.09.). The new steps:

- **Step A — immediately:** SEC-2026-514, -525 (P2); -481, -492, -497 (P3). Fixed on 24.09.2026, not yet on `main`.
- **Step B — with the next rules deploy, needs Sonny's go:** SEC-2026-482, -489, -496,
  -500, -519, -520, -526 (P2); -476, -479, -483, -484, -488, -498, -499, -501, -507, -515 (P3).
  Belongs in the same deploy as the already scheduled SEC-2026-321. Deployed on 30.09.2026 (rules `def53aa1`) and closed, together with
  the same step's rows from the v2.20.0 audit and SEC-2026-420.
- **Step C — before 3.0:** SEC-2026-477, -478, -480, -485, -502, -503, -506, -508, -510, -512,
  -513, -523, -527 (P3), together with SEC-2026-421 and -422.
- **Step F — alongside related work:** SEC-2026-486, -487, -493, -495, -505, -517, -522, -529 (P3).
- Into existing steps: SEC-2026-524, -491, -494 to the CSP step of SEC-2026-336; SEC-2026-528
  to the data protection step; SEC-2026-490, -511 to the Jira condition; SEC-2026-504, -509, -516 to the
  dependency step; SEC-2026-518 to the S/4 key step; SEC-2026-521 next to SEC-2026-425.

**Addendum to the audit of v2.13.0 (`b88c77b`), 22.09.2026: the last 90 findings (87 low,
3 info) are triaged — 54 refuted, 35 scheduled, 89 register entries, because two findings
carry the same fingerprint.** With that, the inbox of this audit is empty. Every finding was
checked at the cited line, not against the report: the auditor had no tools, and
`firestore.rules`, `lib/sanitize-html.ts`, `lib/json-ld.ts` and `lib/export-safety.ts` were not
available to him at all, which is why the most frequent kind of error reads "a check is missing here" and the check is in
a file he did not have. Three blocks account for most of the refutations:
dependency advisories attributed to the wrong package (`firebase-tools` is in
`devDependencies`, and the reported transitives hang off `@google/genai`, not the CLI),
sinks in `dangerouslySetInnerHTML` that have long gone through `jsonLdHtml()` or `renderMarkdownSafe`,
and findings about `docs/roadmap/*.html`, which are not shipped at all.

**Two findings were measured instead of estimated, and both are more severe than reported.**
`tokenize()` needs **154 seconds** for 220 kB of ABAP, because it rescans the buffer on every
line — `readStatements` handles the same input in 12 ms; and a deep PERFORM chain makes the
process reconstruction fail at the stack limit already at 221 kB, after which the Business view
of one's own project answers 500 permanently. Both routes are reachable without throttling. They are
scheduled as their own step, together with the limits in the two routes that call the
engine.

**Three things need Sonny, not code:** a dedicated `RATE_LIMIT_PEPPER` as a repository secret
(the pepper today shares the key with `AUDIT_SIGNING_KEY`; the literal as a third
fallback has already been removed), the rules deploy for the already scheduled tightening of the
`create` and `update` rules of `files`, `abap_examples` and `support_tickets`, and the
decision whether the weekly report should continue to give the name and address of every new account — that
is not a gap but a trade-off between retention and the benefit the report has for
approaching new accounts.

**Audit of v2.13.0 (`a7c9e71`, 18.09.2026): 3 critical, 1 high, 7 medium, 14 low — 2 fixed,
7 scheduled, 16 refuted.** Fixed are the zip slip in the delivery (model-generated paths
went unchecked into the archive; the check now rejects instead of repairing) and an SSRF in the
egress allowlist (`h.endsWith(s)` instead of `h.endsWith('.' + s)` — so `evil-sap.com` matched
`sap.com`; unreachable today because the live test mode is locked, real once it reopens). All
three reported as critical were false positives of the same naming pattern.

**One recommendation of the audit is explicitly not followed (SEC-2026-077).** The report proposes
removing the `AIzaSy` exception in the secret detector. The finding that would result
carries `snippet: text` — a real key would thereby land **in the signed audit pack**, exactly
where it belongs least and is hardest to get out again. The step
first needs a redactor for the location, then the exception. Whoever takes it the other way round builds
the leak it is meant to close.

**On the noise in the detector:** the pattern `[A-Z0-9]_KEY` hits exactly four times across all
versioned files, and all four are false positives — two `localStorage` key names, a public
address (`TRUSTED_KEY_URL`) and an emulator test password. `_URL` in the exception list of
`scripts/qa/lib/redact.mjs:41` removes **one** of them; what would also be effective is an exception by
the **shape of the value** (a URL or a dotted lowercase identifier such as
`cc.workspace.*` is not a secret). Both belong in a dedicated step on the
agent machinery and need Sonny's go.

First audit: v2.11.0 (16.09.2026), 247 reported findings. The report itself says
that its verification stage did not come back — the findings are reported, not
checked. The three reported as critical have been re-checked and **all three refuted**,
as have four of those reported as high; the reasoning with evidence references is in the
sealed register. Of the 29 reported as high, 21 are decided: fourteen refuted, five scheduled, two fixed immediately. The largest refuted block concerned supposedly client-writable fields and a "not inspected" sanitizer -- read, it is DOMPurify with a tight allowlist. The rest are being triaged continuously.

---

## 13. UX findings from the UX agent

The UX agent's first review takes on the whole product; after that every
`main` version gets a review of its delta (`docs/UX-REVIEW-AGENT.md`). Claude checks every
finding against code and screenshot and schedules confirmed ones here. UX findings describe
screens, not vulnerabilities — they appear with their title in the table; the register is
`docs/ux/register.json`.

Scheduling: **critical** immediately as a step of its own · **high** into the current phase —
consistency and components to **1.5**, frame and navigation to **1.4** · **medium** into the
next fitting step · **low** alongside related work or after **3.0**. What the
3.0 rebuild replaces anyway is deferred, not built twice.

**Full review of 7bdac5e (15.09.2026, 9 model calls, $1.36):** 86 findings, of which 69 confirmed (1 critical, 14 high, 28 medium, 26 low — severity after checking), 15 refuted, 2 deferred. The refuted ones mostly concerned components that are rendered nowhere, and artefacts of the capture environment.

**Delta review of e3817ce (v2.12.0, 17.09.2026, 3 model calls, $0.52):** twelve findings were undecided, six are confirmed (UX-102, UX-104, UX-106, UX-107 newly scheduled; UX-105 and UX-110 downgraded to *low*), six refuted. The degree of repetition stands out: three findings reported the same token list from the design scan (UX-111/112/113) and read the deliberately new `cc` vocabulary behind the admin switch as drift — although the values are decided in `DESIGN.md` §1.2 and §1.5 and the `coverage_notes` of the same report say so themselves; a fourth (UX-109) repeats UX-106 from the screenshot side, a fifth (UX-108) the already fixed UX-092. Only UX-103 was a genuine checking error: the empty state whose absence it claims is in the code.

**Delta review of a7c9e71 (v2.13.0, 18.09.2026, 3 model calls, $0.46):** four findings
were undecided, all four are scheduled (UX-117 to UX-120). Two are evidenced at the
cited location: the technical blueprint still invites questions in its closing sentence,
although next to it it says that the board is read-only
(`app/(app)/dashboard/page.tsx:635` against `:1697`), and the same back link is called
three different things in three places (`components/BackLink.tsx:55`, `app/(app)/layout.tsx:150`,
`app/(app)/settings/page.tsx:873`). UX-119 is evidenced too, but in the frame rather than in the
empty state: `NotGenerated` is compact, the area comes from the `p-12 md:p-20` of the
dashed container in `documentation/page.tsx:1558`.

**UX-120 holds only by half.** The finding reports `rounded-[6px]` and `rounded-[8px]`
together as drift. `8 px` is the scale decided in `DESIGN.md` §1.4 (table l. 134)
for row, field and button — that is not drift but its implementation. Genuine are
`rounded-[6px]` (`components/cc/SegmentedControl.tsx:77`,
`components/process-states/StateChoice.tsx:126`), `text-[16px]`
(`components/cc/MessageBox.tsx:126` — already named in the refutation of UX-111 as the only
genuine remainder) and `text-[18px]` (`components/workspace/FirstLook.tsx`). According to
`DESIGN.md` l. 913 a new radius is a change to that file; hence scheduled
rather than refuted, but with this scope: three values, not seven.

**Delta review of ac27aed (24.09.2026):** twelve findings were undecided, six
scheduled (UX-145 to UX-147, UX-149, UX-155, UX-156), three refuted, three
deferred. Three of the six are repeats of open entries at the same place:
UX-147 is UX-117 (the board is still called "Active Discussions" and invites people to join
in, `app/(app)/dashboard/page.tsx:1609-1617`), UX-156 is UX-118 (Settings renders its
own back link in small caps instead of `BackLink`, `app/(app)/settings/page.tsx:871`),
UX-146 is UX-110 (mail detail only in the `title`, `app/(app)/admin/page.tsx:475`). New and
evidenced is UX-145: the admin tab "suspended" filters `status !== 'approved'` and thus
also shows waiting and deleted accounts (`app/(app)/admin/page.tsx:309`). Refuted are
the two assistant findings (UX-150/151) — header button and floating pill open
the same dialog with the same label, "Ask AI" no longer exists; whether two entry points
are needed is a design question, not a defect. UX-152 (automatic approval via mail link)
is security-relevant and moves to the security register; UX-148 (context before accepting
an invitation) needs Sonny to weigh it against forwarded links.

**Addendum 24.09.2026:** UX-148 and UX-152 are scheduled and built after Sonny's decision (option B in each case) — the invitation page names the inviter and the expiry date to the invited, confirmed account before acceptance (c6f7494); the tenant approval page no longer acts on opening, and both links of a request together are valid exactly once (3a56171). They will be marked as fixed when the next UX review on `main` confirms it.

| ID | Severity | Finding | Roadmap step | Status |
|---|---|---|---|---|
| UX-002 | critical | Zero findings sealed as Fully Supported | 0.8 | fixed |
| UX-001 | high | Invented 95% and 80% bars without measurement | 0.2 | fixed |
| UX-003 | high | Verify-pack upload cannot be operated by keyboard | 1.5 | fixed |
| UX-004 | high | Confluence export invents missing assessments | 1.2 | scheduled |
| UX-007 | high | Target choice and dialogs not keyboard-operable | 1.5 | scheduled |
| UX-019 | high | States shown stronger than evidenced – bars, ticks, exports | 3.0 | scheduled |
| UX-020 | high | Core paths blocked for keyboard and screen reader | 3.0 | scheduled |
| UX-023 | high | Dark mode breaks on central surfaces | 1.6 | fixed |
| UX-024 | high | Orientation breaks between the areas | — | deferred |
| UX-037 | high | Transformation promises Node.js in the RAP track too | 0.2 | fixed |
| UX-038 | high | Remediation mode switches only text, not code | 0.2 | fixed |
| UX-040 | high | Transformation Insights are static and wrong for the track | 0.2 | fixed |
| UX-044 | high | Dark mode breaks on project row and stepper | 1.6 | scheduled |
| UX-059 | high | Forum pretends a public post, stores only locally | 0.2 | fixed |
| UX-061 | high | Dashboard without dark parity, project row barely readable | 1.6 | scheduled |
| UX-062 | high | Dashboard table stays white in dark mode | 1.6 | scheduled |
| UX-087 | high | Missing debt status appears in success green instead of neutral | 0.8 | scheduled |
| UX-088 | high | Clean Core Score without distinction from SAP's opposite-direction score | 0.3 | scheduled |
| UX-091 | high | Mail warning promises resending, the row cannot do it | — | fixed |
| UX-094 | high | Old backup codes are rejected without a transition | — | deferred |
| UX-102 | high | How-to names 6 phases, product has 7 stages | 0.2 | fixed |
| UX-121 | high | Invite icon without a name — only a title, no label | immediately | fixed |
| UX-122 | high | ToS notice pushes the content aside on all routes | immediately | fixed |
| UX-138 | high | Integrity green means existence one time, checking the next | immediately | fixed |
| UX-145 | high | Tab "suspended" also shows Pending and Deleted | immediately | scheduled |
| UX-165 | high | Blocked start explained only by tooltip, invisible to keyboard | D.10b | scheduled |
| UX-166 | high | Documentation shows saved and missing state at the same time | D.16a | scheduled |
| UX-005 | medium | Route change without confirmation and undo | 0.7 | scheduled |
| UX-006 | medium | No way from a finding into the code | 1.5 | scheduled |
| UX-012 | medium | Sticky header and tabs cover content on phone | 1.4 | scheduled |
| UX-017 | medium | Very small type makes reading hard | 1.5 | scheduled |
| UX-022 | medium | 78 button styles instead of one shared language | 1.5 | scheduled |
| UX-025 | medium | Generation and errors without a way out and undo | 1.5 | scheduled |
| UX-027 | medium | Green tick for unchecked code | 0.2 | fixed |
| UX-029 | medium | Compatibility claimed but not evidenced | 0.2 | fixed |
| UX-030 | medium | Phone covers content and swallows actions | 1.4 | scheduled |
| UX-032 | medium | Printout without its own cost figures | 0.3 | scheduled |
| UX-034 | medium | Task drawer does not trap the keyboard | 3.0.4 | scheduled |
| UX-036 | medium | Systematic small type below 12px | 1.5 | scheduled |
| UX-039 | medium | Audit check-offs are lost on reload | 0.7 | scheduled |
| UX-041 | medium | Maps and minimap not keyboard-operable | 1.5 | scheduled |
| UX-042 | medium | Buttons have 78 styles instead of one shared language | 1.5 | scheduled |
| UX-043 | medium | Masses of text below 12px weaken legibility and contrast | 1.5 | scheduled |
| UX-045 | medium | Glossary and overlays not keyboard- and screen-reader-capable | 3.0.4 | scheduled |
| UX-049 | medium | Missing design sections disappear silently | 1.2 | scheduled |
| UX-056 | medium | Stepper and rail encode Done differently | — | deferred |
| UX-063 | medium | Two example libraries compete on the dashboard | 3.0.5 | scheduled |
| UX-064 | medium | Every section invents its own primary button | 1.5 | scheduled |
| UX-065 | medium | Toggles without switch semantics for screen readers | 3.0.4 | scheduled |
| UX-067 | medium | Critical actions in native browser dialogs | 1.5 | scheduled |
| UX-068 | medium | Slideshow controls without focus and too small a hit area | 3.0.4 | scheduled |
| UX-069 | medium | Modal icon buttons without names for screen readers | 3.0.4 | scheduled |
| UX-070 | medium | Tiny type in load-bearing places barely readable | 1.5 | scheduled |
| UX-073 | medium | Tiny type 9-10px for badges and banners | 1.5 | scheduled |
| UX-075 | medium | Eye buttons without an accessible name | 3.0.4 | scheduled |
| UX-076 | medium | Onboarding cancellation with blaming wording | 0.2 | fixed |
| UX-089 | medium | Four terms for one value: Audit, Valuation, Asset Value, IP Score | 1.5 | scheduled |
| UX-090 | medium | Deck error shows raw technical text without a next step | 0.8 | fixed |
| UX-092 | medium | Start button blocked by scan without a reason at the button | — | fixed |
| UX-093 | medium | Unsaved reports itself as a failed connection | — | fixed |
| UX-097 | medium | Empty blueprint page offers export of nothing | immediately | fixed |
| UX-098 | medium | Package download fails silently without notice | immediately | fixed |
| UX-099 | medium | Matrix close buttons without names for screen readers | immediately | fixed |
| UX-104 | medium | First-run back link leads signed-out users behind login | 1.4 | fixed |
| UX-106 | medium | NotGenerated names Settings but does not lead there | 1.5 | scheduled |
| UX-107 | medium | Admin button signs out instead of in | immediately | fixed |
| UX-116 | medium | FREE badge conceals the first-run limit | immediately | fixed |
| UX-117 | medium | Read-only board still invites questions at the bottom | immediately | scheduled |
| UX-118 | medium | Back link has three different names | 1.5 | scheduled |
| UX-123 | medium | ToS card pushes work content aside on every route | immediately | fixed |
| UX-124 | medium | ToS gate pushes the task out of the first viewport | immediately | fixed |
| UX-125 | medium | Resend mail instructed but not possible | immediately | fixed |
| UX-126 | medium | Filters promise discussion, board is read-only | immediately | fixed |
| UX-127 | medium | Disabled start does not name the personal-data reason | immediately | fixed |
| UX-131 | medium | ToS notice pushes the work area aside in the first viewport | — | deferred |
| UX-135 | medium | Quota stop in native alert instead of the product dialog | 1.4 | scheduled |
| UX-136 | medium | Five icon buttons without text – Invite barely discoverable | 1.5 | scheduled |
| UX-139 | medium | Refused bundle without a direct way to Transformation | immediately | fixed |
| UX-140 | medium | Confirmation lapses after edit without explanation | immediately | fixed |
| UX-146 | medium | Welcome mail detail readable only via hover title | 3.0.4 | scheduled |
| UX-147 | medium | Read-only board still promises discussion | immediately | scheduled |
| UX-148 | medium | Invitation without context forces blind acceptance | immediately | scheduled |
| UX-149 | medium | Error boundary shows raw error message open instead of collapsed | immediately | scheduled |
| UX-152 | medium | Automatic approval runs without a way to cancel | immediately | scheduled |
| UX-153 | medium | Invited readers land on analysis start | — | deferred |
| UX-157 | medium | Approval page: counter-decision only via a second mail link | — | deferred |
| UX-158 | medium | Invite only as an icon without a visible name, hard to find | 1.5 | scheduled |
| UX-159 | medium | Workspace loading shows sighted users an empty page | 1.4 | scheduled |
| UX-160 | medium | Import errors without feedback to the user | 1.4 | scheduled |
| UX-161 | medium | Export without visible confirmation | 1.4 | scheduled |
| UX-162 | medium | Pre-analysis overloads the start | — | deferred |
| UX-167 | medium | Counter-decision notice small and low-contrast | D.21 | scheduled |
| UX-168 | medium | Technical announcement invites questions without a way to answer | D.22a | scheduled |
| UX-169 | medium | Documentation is named differently from the stage itself | D.9 | scheduled |
| UX-170 | medium | Confirmation page without a way out on an invalid link | D.26 | scheduled |
| UX-174 | medium | New one-off tokens for sizes and spacing without a system | Block D | scheduled |
| UX-008 | low | Slideshow controls without names, arrow keys hijacked | 3.0.4 | fixed |
| UX-011 | low | Confusing finding terms and language mix | 1.5 | scheduled |
| UX-013 | low | Preview contradicts editability, start misleading | 1.5 | scheduled |
| UX-015 | low | Back navigation behaves differently per page | 1.4 | fixed |
| UX-016 | low | Catalog loses the workspace context | 1.4 | scheduled |
| UX-026 | low | Terms and promises change per stage | 0.2 | fixed |
| UX-028 | low | LoC slider cannot represent the real value | 0.3 | scheduled |
| UX-031 | low | SOP next step only in hover tooltip | 1.2 | scheduled |
| UX-033 | low | Slide switch without names | 3.0.4 | scheduled |
| UX-035 | low | Long generation without cancel | 1.5 | scheduled |
| UX-050 | low | Tiny labels and status only via colour | 1.5 | scheduled |
| UX-053 | low | Error and 404 pages speak three languages | 3.0 | scheduled |
| UX-057 | low | Grounded Grounding Audit duplicated and inconsistent | 0.3 | scheduled |
| UX-058 | low | QuickAnswer reports open although collapsed | 3.0.4 | scheduled |
| UX-060 | low | Project row and icon actions not keyboard-operable | 3.0.4 | scheduled |
| UX-066 | low | 2FA button claims scan without a QR code | 3.0 | scheduled |
| UX-072 | low | Admin uses native confirm/alert instead of product patterns | 3.0 | scheduled |
| UX-074 | low | Settings cards with arbitrary colour stripe | 1.5 | scheduled |
| UX-078 | low | Admin rows without expanded state | 3.0.4 | scheduled |
| UX-079 | low | Disabled register button does not explain itself | 5.1 | scheduled |
| UX-080 | low | Showroom tabs without visible keyboard focus | 3.0.4 | fixed |
| UX-081 | low | Autoplay ignores reduced motion | 3.0.4 | scheduled |
| UX-082 | low | Two header patterns on public pages | 3.0.6 | scheduled |
| UX-083 | low | Download error stays invisible | 3.0 | scheduled |
| UX-084 | low | First-run names the quota differently from the header | 0.2 | fixed |
| UX-085 | low | Tiny labels in 10px small caps | 1.5 | scheduled |
| UX-100 | low | Filter entry mixes German and English | immediately | fixed |
| UX-101 | low | 2FA key cannot be copied | immediately | fixed |
| UX-105 | low | Dark removal without notice to existing accounts | 1.6 | scheduled |
| UX-110 | low | Badge detail hidden only in hover title | 3.0.4 | scheduled |
| UX-115 | low | Demo promises seven stages without taking the user along | 0.2 | scheduled |
| UX-119 | low | Empty documentation frame with a lot of empty space | 1.5 | scheduled |
| UX-120 | low | New radii and font sizes without connection to the system | 1.5 | scheduled |
| UX-128 | low | New radii and one-off dimensions without connection to the system | 1.5 | scheduled |
| UX-134 | low | Blocked start explains itself only via hover title | 1.5 | scheduled |
| UX-137 | low | New one-off radii and fonts without binding to the scale | 1.5 | scheduled |
| UX-141 | low | Search promises discussions on read-only announcements | immediately | fixed |
| UX-142 | low | Optional imports with inconsistent version label | immediately | fixed |
| UX-143 | low | Labels without a field on the approval page | immediately | fixed |
| UX-144 | low | Workspace gate loads silently for screen readers | immediately | fixed |
| UX-155 | low | Workspace loading empty for sighted users, only sr-only text | 1.4 | scheduled |
| UX-156 | low | Back link in two capitalisations | 1.5 | scheduled |
| UX-164 | low | Back link in two spellings | 1.5 | scheduled |
---

## 14. QA findings from the full review

Every version on `main` gets, besides the delta review, a review of the whole code base
(`openai/gpt-5.6-sol`, `node scripts/qa/await.mjs <sha> --full`, `docs/QA-REVIEW-LOOP.md`). It blocks
nothing — `main` is already out —, but every finding is checked against the code, refuted ones are recorded with
evidence in `docs/qa/refuted-findings.enc.json`, and confirmed ones are scheduled here.
The location is in the table; titles of security and integrity findings only once the
fix is on `main` (§12 applies accordingly). The full text lives only locally under `.qa-review/`.

Scheduling as in §12: **critical** as a step of its own before any other work · **high** into the
current phase · **medium** into the next fitting step · **low** alongside related work.
What the 3.0 rebuild replaces anyway is deferred, not built twice.

**The 226 high findings of b88c77b4b5d1 were triaged on 22.09.2026 — the inbox of this
full review is thus empty.** Split across eight parallel checks, each against today's code,
not against the report. The result: **around thirty distinct defects.** The rest falls
into three groups, and each says something about the reviewer:

- **Duplicates.** The same location came up to six times under different fingerprints. One
  batch of 26 findings consisted of four matters, one of 36 of thirteen.
- **Fixed since the reviewed commit — 65 of them**, almost all by the two engine commits
  `2af1890` ("the judging part no longer says more than it found") and `875bb99` ("a literal
  is text, not code"). Four places carry their own fingerprint as a comment in the code.
- **Wrong.** Several times the report cites lines that contained what it claims neither today nor at the
  reviewed commit — and twelve findings on `lib/workflow-steps.ts` describe a
  client heuristic as a security boundary, although the boundary lies server-side in
  `app/api/audit-pack/create/route.ts` and is recomputed independently there.

190 refutations with evidence are in `docs/qa/refuted-findings.enc.json` (375 in total).

**Confirmed and scheduled, by weight.** Two concern the trust chain and are reproducible
at any time, not only as a race: `55cf6c0ed62a`
(`app/(app)/project/[projectId]/transformation/page.tsx`) — a model response that is not JSON
must be treated as a generation error instead of being packaged; and `dfa0816bc852`
(`app/(app)/project/[projectId]/analyze/page.tsx`) — the target platform belongs passed through
as a parameter, not read from the state at click time. In addition `7976bced4c28` (completeness
of a transformation package), `48391b645e76` and `58201e6aaedb` (schema check before writing),
`39b694577e7e` (process revision after a re-analysis), `865c1d771d8c` (six child writes
without a parent condition), `66f75a3d4632`, `f80230a27c70`, `6b0c0ae8ac9c`, `3e32d011b3c6`, `e4f486917474`,
`ae206f1937c6`, `c5271f4aa951`, `310220ecef2e`, `b76cb79dacf6`, `3d1ade86103c`, `3e6453d5c9ce`,
`a2b81a5bd2ab`, `827cf6758637`, `be7c1dfdf508`, `20fe6d7b4308`, `e955a181ba42`, `854c7e288bb7`,
`13a62385b2e0`, `7a2f826bddf8`, `5198d59e7ea5`, `9028321e9795`.

**Two of them are on a public page and are therefore brought forward:** `5198d59e7ea5`
(`components/SamplePackageDownload.tsx`) and `9028321e9795`
(`components/TransformationReplay.tsx`). Both claim something on the home page that the code
does not deliver — on a page whose promise is "evidenced, not guessed", that is the
most expensive defect on the list, although technically nothing is exposed.

**One architecture question, reported three times** (`ebb0e6e4a363`, `36f3d696ddda`, `b97e45a2976d`):
`firestore.rules` knows only the token claim and ownership — no account status, no
admin step-up, no revocation. A rule cannot do that either: the step-up needs a
server-side state that the ID token does not carry, and `checkRevoked` exists only in the Admin SDK.
The pattern against it, however, was already established on 16.09.2026 for `/projects` — take direct write access away from
the rules, only via hardened routes. Carrying it over to the remaining privileged
collections is a step of its own and needs Sonny's decision, because it touches the admin
console.

### Full reviews of a12774cd2b7f and fc787674705f (v2.20.0) — three public-copy findings decided on 30.09.2026

Sonny decided all three on 30.09.2026; built on `decide/terms-30` (from `integrate/3.0`, live with 3.0).

| Fingerprint | Severity | File | Decision | State |
|---|---|---|---|---|
| `6b83ef361e80` | medium | `app/terms/page.tsx` | A new Terms version, v2.2.0, live with 3.0: section 4.1 names the deterministic results (evidence, not a guarantee) and the model-generated output (a draft that must be reviewed); v2.1.0 and v2.2.0 archived with their digests | fixed (`88377f92`, `97e2d702`) |
| `c9ab2c6a6c1c` | medium | `components/LandingModals.tsx` | The sign-up disclaimer and the Terms summary say the same as 4.1 — and so do the disclaimer and summary in `components/UserOnboarding.tsx`, which said the same untrue sentence; `tests/terms-provenance-guard.spec.ts` holds the three together | fixed (`88377f92`) |
| `8eb20d13b5b1` | medium | `app/page.tsx` | Reword to "What will moving it take — effort, and a cost estimate from your inputs" | fixed by 3.0.6 on `integrate/3.0` (`ffa37d17`): `components/BenefitCard.tsx` and its FAQ entry no longer exist on the 3.0 landing, and Economics is described there as a calculation on figures you enter (`lib/landing-stages.ts`). Still live on `main` until 3.0 |

With it, consent: every existing account must accept v2.2.0 at its next sign-in with 3.0 — no mails, no census
(Sonny, 30.09.2026). `TERMS_VERSIONS_IN_FORCE` holds the current version alone (`122d9275`); this sets aside
§ 10.1 (six weeks' notice by mail) and § 10.3 (carry on under the accepted Terms; ending that takes 30 days'
notice) of the Terms those accounts accepted, on the owner's decision. The effective date is 6 October 2026,
the agreed 3.0 release day (it replaced the placeholder 15 October 2026 before anything was published).

### Full review of 3131afa (v2.14.0), triaged on 23.09.2026

**The five critical findings were the same false alarm** — three localStorage keys, one
interpolated template and one public URL, each reported as "rotate credentials" and each
as `RE-RAISED after refutation`, because the refutation lies in the register and the hit arises anew in the scanner on every
run. Since `953575f` the rule decides on the value instead of the path.

**More important than any single finding is the coverage:** the run stopped at 14 calls at the
call counter — not at the money, 4.46 of 10 USD were left — and reported **470 files with
5.4 MB as NOT REVIEWED**, among them every component of the process map, the process revisions, the
process states and the workspace shell. Around half of the code, and the newest half at that.
`maxBatches` is now at 24; a release review thus costs around 9.50 instead of 5.50 USD. **Full
coverage would be about 28 calls and around 11 USD — that is a decision about the cap and
lies with Sonny.**

Of the 59 high findings, 16 distinct matters are confirmed, 13 refuted and recorded
(among them five that report a documented design as a defect, and `f9b0a7417acd`, whose
fingerprint is in the code as already fixed — the file was on the NOT-REVIEWED list of the same
report). Fixed in `4d6f35c`: `2878b5f8fae3`/`dfa0816bc852` (target platform as a parameter),
`b97e45a2976d` (session of a suspended sign-in), `3e32d011b3c6` (write to a
deleted project). Scheduled, by weight: `67ac19222d96`, `45a8a7cf4a0c`, `f9695d22d124`,
`0d8443fae823`, `c816fed880a9`, `827cf6758637`, `66f75a3d4632`, `6db23bf69b81`, `a63e125a5dc2`,
`8bf84ca5d67c`, `773af92784d5`, `b5825ac75816`, `ae206f1937c6`.

**`2a9864f3b52e`** (delta review of `4d6f35c`, `lib/firebase-admin.ts`) belongs to the same
architecture question as the paragraph above and is the honest limit of the repair in `4d6f35c`: an
already issued ID token stays valid for up to an hour, and no rule reads the
account status. Unlimited thus becomes one hour; it is only closed with the rules change —
and that needs a manual rules deploy.

**Full review of 81810c8026e0 (v2.18.0, 24.09.2026, `openai/gpt-5.6-sol`, 28 calls, $2.10):** verdict `no_go`, **INCOMPLETE** (around 250 files outside the budget). New: 2 critical, 10 high. Critical `7be9e6ff7de4` (with the carried-over `a862eec671b7`/`ba99f286796e`) fixed — specs using the Firebase client abort without the emulator and use throwaway accounts; `8f985df72110` refuted (test literal). Of the ten high ones all are confirmed: fixed `7d0d04a45324`, `d5a87a5db395`, `183ed4edf700`, `68c8263e20f6`, `bfbbcc22a9f2`, `ff8dcda705e4`, `c6b7be3306be`; scheduled `e649177b3894`/`c42de15e9c75` (3.0.11) and `f71a57e2d326` (3.0.12). Full text only locally under `.qa-review/81810c8026e0.full.json`.

**Full review of b88c77b4b5d1 (v2.13.0, 18.09.2026, `openai/gpt-5.6-sol`, 769 files, $5.70):**
1446 findings — 49 critical, 226 high, 1129 medium, 42 low — verdict `no_go`, **INCOMPLETE**. First
pass in the evening: **47 of the 49 critical refuted with evidence** — 34 workflow findings (the premise is a
second collaborator with write access; the collaborator list names exactly one account, fork PRs get
no secrets; recorded as a condition in the register: from the second account on, each of them becomes true), 5 "secret-named
literal" (storage key names), 8 on the signature chain (`files[].bytes` is deliberately excluded in the header of
`lib/audit-pack-canonical.ts` — the content hash pins the file; the
`provenance` label is read by no verifier, the classification comes from the signed
`attested` list, `lib/audit-pack-verify.ts:125–153`). **Open:** `26350daa4493`/`8f267dbfbd9b` — the
web verifier hashes `file.async('text')` instead of the archive bytes; an invalid UTF-8 byte that decodes to the
same character passes — effect nil (same text), hardening small (BACKLOG 33). **The
226 high ones are not triaged;** grouped by file in BACKLOG 33 — router misroutes, Open SQL readers,
concurrency in Transformation/Design/Documentation, deleted projects are recreated by running runs,
suspended accounts keep Firestore/S/4 access, receipts not bound to the source.
Triage by topic, one step per topic, suspended accounts and deletion first — next session. Full text
only locally under `.qa-review/b88c77b4b5d1.full.json`.

**Full review of a19945ef01dc (v2.11.1, 16./17.09.2026, `openai/gpt-5.6-sol`, 14 calls, $4.57):**
504 findings — 30 critical, 94 high, 373 medium, 7 low — verdict `no_go`, **INCOMPLETE** (the diff of
`analyze/page.tsx` alone, 172,900 characters, fits in no call; over sixty further files lay
outside the 14 calls). First pass in the night: 6 of the 30 critical are already in the table
below (five "fixed (dev)", among them `cfafefac08ec` via 0.13 and `1b75f0d332da`), 8 are
refuted with evidence — `vercel.json` and the two survey workflows do not exist at the reviewed commit
(`git cat-file -e` fails, no workflow calls `scripts/send-survey*.ts`), three pattern hits
"secret-named literal" mean the public verifier and the documented test key. **Checked on 17.09.
— six of them, five refuted and one fixed:** the four findings "client-writable
artefacts get into server-signed packs" (`design/documentation/transformation/page.tsx`,
`firestore.rules:169`) describe an allowlist that exists, and a path from there into a signed
file that has not existed since 0.12: `lib/audit-pack-build.ts` builds the input of the signed
generators from named fields of the immutable run, the account holder's statements are in
`07-user-attested.md`, which the signature expressly does not cover, and `tests/audit-pack-signed-input.spec.ts`
measures both. The workflow finding (`usage-report.yml:27`) is a carried-over finding of an older
review and was already settled at the reviewed commit — the recipient field has been gone since `b2eceeb`,
`tests/no-fabricated-figures.spec.ts` keeps it gone. Confirmed and fixed is `6a3eea208009`
(`app/api/projects/[projectId]/route.ts`, table below). **Still open and next to check:** the
family around the audit-pack canonicalisation — eleven findings on
`lib/audit-pack-canonical.ts:46` (delimiter collisions in the signed file list),
`lib/audit-pack-verify.ts:136/174` (attestation changeable after sealing, manifest metadata not
authenticated) and `scripts/verify-pack.mjs:212–269`. Of the 94 high ones 14 are known, 80 new — triage after
the critical ones. Fingerprints are still unstable (`5c7ab85b9493` is a twin of `cfafefac08ec`).
Full text only locally under `.qa-review/a19945ef01dc.full.json`.

**Result of the triage of 17.09.2026, morning:** Of the 30 critical ones,
**all are thus decided** — 6 were known, 13 refuted with evidence, **11 confirmed and fixed**
(one row per fingerprint in the table below). The eleven were three defects in the
trust chain, and the first is the most serious of the day:

- **The signature did not cover what it claimed to cover.** A file name was allowed to carry the
  delimiter of the canonical form, so two signed evidence files could be merged
  into one: same canonical bytes, valid signature, one evidence file
  fewer in the archive — `verify-pack` answered "Verified" with exit 0. Independently
  reproduced before the fix was built.
- **The attestation could be rewritten after sealing:** `lib/audit-pack-verify.ts`
  checked only *whether* the file is in the archive, not its content. `07-user-attested.md`
  changed from "sign-off: not given" to an invented sign-off — both verifiers green.
- **Issue date and format version were not bound;** a date set to 2019
  was printed by the CLI and shown as confirmed.

Fixed in `2269c2f` (format 3 of the canonical form, uniqueness check, digest per
attested file, issue section before the hash). **Old packs keep verifying
byte-identically** — without `version` or under format 3 the canonical
string is unchanged, and the delimiter check closes the hole retroactively on
them too. A trap along the way: a broader first rule shot down the issuer route with 500,
because the real catalog state contains a colon *and* a comma and every previous pack
is signed with that value; the run-binding fields therefore keep only the
section character free, from format 3 on it is escaped, and a spec pins the live value.

Refuted were, among others: `vercel.json` and the two survey workflows do not exist at the
reviewed commit; three "secret-named literal" hits mean the public
verifier and the documented test key; the four findings on client-writable
artefacts in signed packs were already closed by step 0.12. Of the 94 high ones,
14 are known; the remaining 80 are the next triage.

| Location | Fingerprints | Status |
|---|---|---|
| `lib/audit-pack-canonical.ts` | 5c21559e33f1, ed6cf1966ae3, ac87d7b88177 | fixed (dev) |
| `scripts/verify-pack.mjs` | 22f63fdbc2aa, f3c3f9e6707a, 79fcd214a0a5 | fixed (dev) |
| `lib/audit-pack-verify.ts` | 906a1b09ed21, f205740a59d0, 6ea54787de01, 426849c4fc04, c20756cda847 | fixed (dev) |

**Full review of 44f3efb8b007 (v2.10.8, 16.09.2026, `openai/gpt-5.6-sol`, 452 files):** 279 findings,
verdict `no_go`, report marked as **INCOMPLETE**. 128 fingerprints are identical to the review of
v2.10.7 and are already in the table below; 151 are new, of which 6 critical, 31 high, 113 medium, 1 low.
**Important for the triage:** the fingerprints are not stable between two runs — several "new" findings
are the same defect under a new identifier (`3648021daaef` = `2d714ac42b63`, `794a874a08f5` = `2ea4b0048642`,
`c1e5727ba1d1` = `3bb4158405d8`, `2d6f76f3fccb` = `0c3362018102`), all four fixed with 0.15 on 16.09.; the
MFA findings (`5c7ab85b9493`, `cfafefac08ec`) are moot with 0.13. The triage of the rest — first the
six critical ones, among them two workflow findings (`workflow_dispatch` with a free recipient address) and two
audit-pack findings claiming the 0.12 fix is not enough — is **open** and the next step after 0.16.
Full text only locally under `.qa-review/44f3efb8b007.full.json`.

**Full review of 33471220d6e9 (v2.10.7, 15.09.2026; 13 model calls, 443 files, $4.91):**
144 findings — 11 critical, 36 high, 95 medium, 2 low. Checked on 16.09.2026: **130 confirmed,
11 refuted, 2 unclear, 1 settled by a change on the same day.** Of the critical ones, 8 were fixed on
16.09. on `dev` (test-account detection only via the CI domain; delta sync does not overwrite
newer target documents; survey scripts print no addresses and no digest into the public
log; the offline verifier follows no `signingKeyUrl` from the pack, rejects unlisted
archive entries and ends an unsigned pack with 2 instead of 0; the web verification rejects unlisted
entries; `vercel.json` removed), 3 are steps of their own **0.12–0.13** — 0.12 was built the same day. The high and
medium findings fill the new Phase 0 steps **0.14–0.18** and the existing ones named. The
refuted ones mostly concerned components and functions that are rendered or called nowhere,
and safeguards elsewhere (server guard, emulator exception, fix already built).

**Result of the triage of 18.09.2026 — the 94 high ones are thus all decided:** 15 were
known, **14 refuted with evidence, 62 confirmed** (of which 28 twins, so **39 distinct
defects**) and 3 unclear and therefore treated as confirmed. 21 of the confirmed ones were reproduced on the
running code — with an engine probe, the Firestore emulator or a rebuilt regex,
not from the paperwork. Every refutation lies with its evidence in the sealed
`docs/qa/refuted-findings.enc.json` (115 entries).

The three most serious:

- **A comment line can delete a critical finding completely.** A
  commented-out `* DATA vbak TYPE ztab.` makes "Direct Write to SAP Standard Table VBAK"
  disappear entirely — a finding becomes zero (`f4383c553eaa`).
- **Every survey answer ever submitted is invisible.** The route writes with a dot in the
  key and thereby creates a field *named* `answers.q1` instead of writing into `answers`;
  `data.answers` stays `undefined`, the survey page sees nothing and the
  digest counts zero (`b22563b1cd74`, reproduced on the emulator).
- **After a change of the Ed25519 key no already issued pack verifies
  any more**, because `/.well-known/` publishes only the current key (`40294c1bc63a`).

**The pattern is worth more than the number.** Six of the fourteen refutations are the same
reasoning error: **the reviewer reads a backward-compatibility test as a frozen defect.**
It sees a version 2.0 manifest stay green in a test and concludes that the spec
pins the implementation — without opening the spec next to it, which demands exactly the opposite for today's
output format. The same misreading hit, on the same day, four findings reported as
`high` in the delta review of `13d1ffa`, there in the form "an assertion
was removed", while the commit had replaced it with a sharper multi-line one. **Rule of thumb
for the next triage:** for every `test-weakening` finding first check which
format or version variant the test builds, and then look at the `git log` of the target file for the
net balance. Four further refutations point at lines that no longer existed at the reviewed commit
(`carried: true` is a good suspicion filter for this).

**And a finding about the findings:** the thirteen engine defects share **one** cause —
comments and string templates `|…|` are not masked before regex detection
(`f4383c553eaa`, `f5f91aeacd41`, `19bdc218308b`, `359639c30d77`). A literal- and
comment-aware pre-stage for all detectors closes four high findings at once; that is
the most rewarding single step in 0.18.

Scheduling: **0.14** security (15 fingerprints, titles withheld) · **0.15** stages (15) ·
**0.18** engine (13) · **0.2** honest statements (11) · **0.16** survey (2) ·
**0.5 / 0.6 / 0.7 / 0.17 / E07-F02** trust chain (9).

| ID | Severity | Location | Finding | Roadmap step | Status |
|---|---|---|---|---|---|
| 13c6115ec642 | critical | app/api/runs/create/route.ts | *(Title withheld until shipped — integrity)* | 0.12 | fixed (dev) |
| 1b75f0d332da | critical | scripts/firestore-delta-sync.ts | *(Title withheld until shipped — integrity)* | — | fixed (dev) |
| 33e463a6876e | critical | scripts/verify-pack.mjs | *(Title withheld until shipped — security)* | — | fixed (dev) |
| 4a4afa88c231 | critical | scripts/verify-pack.mjs | *(Title withheld until shipped — integrity)* | — | fixed (dev) |
| 4a593e8bd77b | critical | scripts/send-survey-digest.ts | *(Title withheld until shipped — security)* | — | fixed (dev); workflow stays off until `main` |
| 6a3eea208009 | critical | app/api/projects/[projectId]/route.ts | *(Title withheld until shipped — security)* | — | fixed (dev) — full review a19945ef01dc |
| 70c8917150e7 | critical | app/api/audit-pack/create/route.ts | *(Title withheld until shipped — integrity)* | 0.12 | fixed (dev) |
| c5eeaff9124a | critical | lib/audit-pack-verify.ts | *(Title withheld until shipped — integrity)* | 0.5 | partly fixed (dev) — archive complete; manifest fields in 0.5 |
| cfafefac08ec | critical | components/LandingModals.tsx | *(Title withheld until shipped — security)* | 0.13 | fixed (dev) — 0.13, Firebase MFA |
| d2006fdbfa95 | critical | scripts/send-survey.ts | *(Title withheld until shipped — security)* | — | fixed (dev); workflow stays off until `main` |
| d87b93e17d38 | critical | vercel.json | *(Title withheld until shipped — security)* | — | fixed (dev) — file removed, without effect on Cloud Run |
| f8ef554cfa89 | critical | lib/test-accounts.ts | *(Title withheld until shipped — integrity)* | — | fixed (dev) |
| 0c3362018102 | high | components/SamplePackageDownload.tsx | The advertised importable package contains an invalid CDS view-entity annotation | 0.15 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| 0fd415bb9927 | high | tests/security-compliance.spec.ts | Admin E2E requests cannot satisfy the enforced MFA step-up | — | refuted |
| 1012acfcd241 | high | components/TransformationReplay.tsx | Timer-driven replay reports compilation and test-generation results that were never produced | 0.2 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| 19054f8f195f | high | lib/firebase-admin.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 1c5a5c920b77 | high | lib/firebase-admin.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 1e47826dd2c5 | high | .github/workflows/grok-review.yml | *(Title withheld until shipped — security)* | 0.16 | scheduled |
| 2526b03d8fd4 | high | lib/project-loader.ts | Run metadata overwrites project workflow state during hydration | — | refuted |
| 2d714ac42b63 | high | app/(app)/project/[projectId]/analyze/page.tsx | Any non-empty text is accepted, charged and signed as legacy code | 0.15 | scheduled |
| 2ea4b0048642 | high | app/(app)/project/[projectId]/analyze/page.tsx | *(Title withheld until shipped — security)* | 0.15 | scheduled |
| 3bb4158405d8 | high | app/(app)/project/[projectId]/tco/page.tsx | Year-1 ROI excludes the implementation investment from the return | 0.15 | scheduled |
| 3d1ade86103c | high | lib/analysis-prompt.ts | An unspecified deployment target is asserted as Private Edition / RISE | — | unclear — reachable only via a hand-built URL with `autoAnalyze`; closed along with 0.15 |
| 45737310a1d7 | high | lib/abap/extensibility-router.ts | Incomplete detector coverage is converted into a 100% clean score and “trivial” feasibility claim | 0.18 | scheduled |
| 4a4321a45f3c | high | lib/board-deck.ts | Board deck manufactures go-live approval without approval evidence | 0.8 | fixed (dev) (= UX-002) |
| 4f7643df8c3e | high | app/api/fetch-odata-metadata/route.ts | S/4 metadata responses can stream without a timeout or size bound | 0.14 | scheduled |
| 50fd6bd9d3c3 | high | components/analyze/TargetScopeMapping.tsx | Every project is shown fabricated cloud-readiness and decommission percentages | 0.2 | scheduled (= UX-001) |
| 512ed3a9e6bd | high | scripts/send-survey.ts | *(Title withheld until shipped — integrity)* | — | fixed (dev) |
| 569fc1c41e35 | high | app/api/admin/set-admin-claim/route.ts | *(Title withheld until shipped — security)* | 0.14 | scheduled |
| 5a660ef009dc | high | scripts/firestore-verify-migration.ts | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| 7569e044e45d | high | scripts/verify-pack.mjs | Packs whose authenticity is skipped receive the verifier's success exit code | — | fixed (dev) |
| 778c72a5cde2 | high | lib/abap/sap-api-catalog.ts | Catalog maps warehouse quant data to a storage-bin master view | 0.18 | scheduled |
| 789f1985a410 | high | components/TransformationShowroom.tsx | Static showroom markup presents unexecuted tests and compilation as passed validations | 0.2 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| 7b679cca1fbf | high | lib/runner-egress-attestation.ts | Two blocked destinations are treated as proof that generated runner code has restricted egress | — | refuted |
| 85e767799587 | high | lib/rate-limit.ts | *(Title withheld until shipped — security)* | 0.14 | scheduled |
| 8c7c26a637d1 | high | lib/firebase-admin.ts | *(Title withheld until shipped — security)* | 0.14 | scheduled |
| 9b1af76b65c9 | high | app/(app)/dashboard/page.tsx | BYOK and enterprise users are still blocked by the free transformation limit | 0.15 | scheduled |
| a16b24c91b2d | high | components/analyze/EvidenceSweep.tsx | An evidence scan with zero findings never completes | — | refuted |
| a3b0057bd113 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing analysis is replaced with a fabricated project-specific decision matrix | 0.2 | scheduled |
| a4f7e6aef79b | high | .github/workflows/grok-review.yml | *(Title withheld until shipped — security)* | 0.16 | scheduled |
| cc5845ec545e | high | lib/firebase-admin.ts | *(Title withheld until shipped — security)* | 0.14 | scheduled |
| d967e435917c | high | app/(app)/project/[projectId]/transformation/page.tsx | *(Title withheld until shipped — integrity)* | 0.15 | scheduled |
| e078d502e983 | high | app/(app)/project/[projectId]/transformation/page.tsx | Profile hydration can start the automatic transformation twice | 0.15 | scheduled |
| e184fc0c59bf | high | app/(app)/project/[projectId]/analyze/page.tsx | *(Title withheld until shipped — integrity)* | 0.15 | scheduled |
| e538b51c10f5 | high | lib/s4-credentials.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| eac2cdb069a7 | high | lib/chatbot-knowledge.ts | Chatbot teaches a workflow that contradicts the canonical seven phases | 0.2 | scheduled |
| eac6118f1eac | high | lib/abap/code-assessment.ts | Internal-table INSERT, MODIFY and DELETE statements are reported as database coupling | 0.18 | scheduled |
| f4561d983d92 | high | scripts/security/lib/surface.mjs | *(Title withheld until shipped — security)* | 0.16 | scheduled |
| 052d2fe8f51c | high | lib/abap/code-assessment.ts | Short programs that write SAP standard tables are recommended for retirement | 0.18 | scheduled |
| 0613631545b2 | high | app/(app)/project/[projectId]/analyze/page.tsx | Confluence export fabricates project-specific routing evidence when optional analysis is missing | 0.2 | scheduled |
| 093df0feed02 | high | app/api/test-s4-odata-read/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 0e2d5f95821f | high | app/api/fetch-s4-metadata/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 1386ead8a318 | high | app/api/runs/create/route.ts | The signing route accepts arbitrary non-ABAP text as a completed analysis run | 0.15 | scheduled |
| 1925189d0606 | high | app/page.tsx | Worked examples are falsely described as compiled, tested, and verified | 0.2 | scheduled |
| 19bdc218308b | high | lib/abap/findings-detector.ts | Keywords inside string templates become support findings | 0.18 | scheduled |
| 241c291b4205 | high | lib/workflow-steps.ts | Client-authored test statuses still unlock Testing and Delivery | E07-F02 | scheduled |
| 2913b2ec26d6 | high | lib/audit-signing-keypair.ts | Signing-key rotation makes previously issued packs fail default verification | 0.5 | scheduled |
| 2ba9cba8e984 | high | app/api/fetch-odata-metadata/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 2f60dc7f9d20 | high | app/whitepaper/page.tsx | Whitepaper promises export of a compiled package without an ABAP compilation path | 0.2 | scheduled |
| 359639c30d77 | high | lib/abap/code-assessment.ts | RFC/BAPI detection misses normal module names and scans non-executable text | 0.18 | scheduled |
| 3ad7de2e710c | high | app/api/audit-pack/create/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 40294c1bc63a | high | lib/audit-signing-keypair.ts | Key rotation breaks default verification of previously issued packs | 0.5 | scheduled |
| 45b717594b8d | high | app/(app)/project/[projectId]/delivery/page.tsx | ABAP delivery archives do not contain valid abapGit repository metadata | 0.15 | scheduled |
| 4692f9ace1b9 | high | app/(app)/project/[projectId]/design/page.tsx | Any non-empty model response is persisted as a completed design | 0.15 | scheduled |
| 46b217f0aebb | high | lib/workflow-steps.ts | Client-authored Passed strings are still treated as proven test execution | E07-F02 | scheduled |
| 46cf75c33b44 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing comparative analysis is replaced with fabricated project-specific conclusions | 0.2 | scheduled |
| 498a8c35f988 | high | components/design/CloudServiceIntegrations.tsx | SAP HANA services are mapped to the PostgreSQL implementation guide | 0.2 | scheduled |
| 4aadc9188407 | high | app/(app)/project/[projectId]/documentation/page.tsx | Parseable but structurally invalid JSON is saved as completed documentation | 0.15 | scheduled |
| 50704cd319b4 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing route evidence is replaced with fabricated project assessments | 0.2 | scheduled |
| 5af40f93f84c | high | app/(app)/project/[projectId]/transformation/page.tsx | The generation lock does not prevent cross-tab transformations from overwriting each other | 0.15 | scheduled |
| 5dce9bd7ff9e | high | lib/abap/usage-parser.ts | Whitespace-only XLSX counts become measured zeroes and retirement candidates | 0.18 | scheduled |
| 62c08912d745 | high | components/design/CloudServiceIntegrations.tsx | SAP HANA services are still mapped to the PostgreSQL implementation guide | 0.2 | scheduled |
| 666a399f4dd2 | high | components/TransformationReplay.tsx | Timer-driven replay still reports compilation and generated tests that never occurred | 0.2 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| 7182b3754472 | high | app/api/test-s4-odata-read/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 725c5d80afc6 | high | lib/abap/extensibility-router.ts | Routing checkpoints assert constructs that were not detected | 0.18 | scheduled |
| 751bd4ef8e8b | high | app/(app)/project/[projectId]/transformation/page.tsx | Non-JSON model output is still saved as a completed transformation | 0.15 | scheduled |
| 766ae59f10e4 | high | lib/abap/usage-parser.ts | Whitespace-only spreadsheet counts still become measured zeroes | 0.18 | scheduled |
| 76c6c79c6f72 | high | lib/firebase-admin.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 79dc8a8a2d59 | high | lib/firebase-admin.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 7bf8808c5773 | high | lib/firebase-admin.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 7ce412f6a068 | high | lib/audit-signing-key.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 80da84ae34ce | high | lib/abap/usage-parser.ts | Negative fractional counts can be rounded into retirement evidence | 0.18 | scheduled |
| 832ddd8c145e | high | firestore.rules | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 8e69958dd531 | high | app/(app)/project/[projectId]/design/page.tsx | Concurrent design regenerations can overwrite each other and mix design with unrelated NFRs | 0.15 | scheduled |
| 95d0baf27ef4 | high | app/api/test-s4-connection/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| 9a6e2d291c22 | high | .github/workflows/deploy.yml | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| a0a649312df1 | high | app/api/survey/vote/route.ts | Survey answers are stored under literal dotted field names | 0.16 | scheduled |
| a2b81a5bd2ab | high | app/(app)/project/[projectId]/analyze/page.tsx | Model-authored routing confidence still overrides the deterministic run confidence on screen | 0.15 | scheduled |
| a3b0bfd48551 | high | lib/abap/select-parser.ts | A decimal literal can truncate a SELECT before later joins | 0.18 | scheduled |
| ac4cdeea96b6 | high | app/api/test-s4-connection/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| ae52df4b0683 | high | app/api/runs/create/route.ts | The signing route still accepts arbitrary non-ABAP text as a completed run | 0.15 | scheduled |
| ae858da40fb5 | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis objects make documentation generation fail before calling Gemini | 0.15 | scheduled |
| b22563b1cd74 | high | app/api/survey/vote/route.ts | Survey answers are still stored under literal dotted field names | 0.16 | scheduled |
| b429fb9e0d5b | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis data crashes documentation generation | 0.15 | scheduled |
| b70c8431c87d | high | lib/workflow-steps.ts | Editing one byte of a stale artefact makes it appear current | 0.6 | scheduled |
| c1523df5fc4e | high | hooks/useTestExecution.ts | Auto-healing replaces the complete generated package with one unverified source file | 0.2 | scheduled |
| c7ed32966a98 | high | app/api/run-tests/route.ts | Caller-supplied tests and code are reported as project test results without artefact binding | 0.17 | scheduled |
| ce41dce9ccd5 | high | app/whitepaper/page.tsx | Whitepaper still advertises an uncompiled package as compiled | 0.2 | scheduled |
| cece3b6a9c51 | high | app/api/fetch-s4-metadata/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| d228da9ee431 | high | app/(app)/project/[projectId]/design/page.tsx | Concurrent regenerations can mix a design with unrelated NFRs | 0.15 | scheduled |
| d67ef0b953f0 | high | lib/audit-signing-key.ts | *(Title withheld until shipped — integrity)* | 0.14 | scheduled |
| de2651041d61 | high | app/api/projects/[projectId]/commands/route.ts | Concurrent analysis can attach an architect sign-off to an unreviewed run | 0.7 | scheduled |
| dfa0816bc852 | high | app/(app)/project/[projectId]/analyze/page.tsx | Changing deployment in the confirmation modal signs the run against the previous deployment | 0.15 | scheduled |
| e0261e6cf390 | high | app/api/runs/create/route.ts | Model receipts are not bound to the source or project represented by the signed run | 0.17 | scheduled |
| e1523558dc46 | high | app/(app)/project/[projectId]/design/page.tsx | Any non-empty model response is persisted as a completed solution design | 0.15 | scheduled |
| ed2b52cc2d3f | high | lib/abap/select-parser.ts | Valid unqualified JOIN clauses bypass complex-query assessment | 0.18 | scheduled |
| ee1fe33023c7 | high | lib/workflow-steps.ts | Client-writable test statuses are treated as execution evidence and can unlock Delivery | E07-F02 | scheduled |
| ee2390f88be0 | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis data still crashes documentation generation | 0.15 | scheduled |
| f4383c553eaa | high | lib/abap/evidence-model.ts | Declarations inside comments can suppress critical database-write findings | 0.18 | scheduled |
| f5f91aeacd41 | high | lib/abap/open-sql-discrimination.ts | ABAP string templates are not masked before internal-table discrimination | 0.18 | scheduled |
| fa9e39148077 | high | app/page.tsx | Landing page still calls static demonstrations compiled, tested, and verified | 0.2 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| fbc8bdcaa983 | high | lib/abap/extensibility-router.ts | Private-cloud standard-table writes are incorrectly presented as Tier-2 wrappable | 0.18 | scheduled |
| fd3e6ec4d394 | high | lib/abap/coverage.ts | Common dynamic instance-method calls are omitted from findings and coverage gaps | 0.18 | scheduled |
| 00875a4ff030 | medium | tests/board-deck.integrity.test.ts | The tests require go-live approval without execution or sign-off evidence | 0.8 | fixed (dev) |
| 024ec609bc86 | medium | app/(app)/project/[projectId]/design/page.tsx | *(Title withheld until shipped — security)* | 0.15 | scheduled |
| 03380a33a523 | medium | app/(app)/project/[projectId]/testing/page.tsx | Project-load failures leave the testing page permanently loading | 0.15 | scheduled |
| 06f7c0c56a6c | medium | app/(app)/project/[projectId]/documentation/page.tsx | *(Title withheld until shipped — security)* | 0.15 | scheduled |
| 0a0ff08e1793 | medium | app/api/unsubscribe/route.ts | Failed one-click opt-outs are acknowledged as successful HTTP delivery | 0.16 | scheduled |
| 0ce6b0b508e6 | medium | hooks/useUserProfile.ts | *(Title withheld until shipped — security)* | 0.14 | scheduled |
| 11e4ad696bbf | medium | components/UpgradeToEnterpriseModal.tsx | The Jira modal leaves focus in the background and has an unnamed close control | — | refuted — dead code |
| 130557afb876 | medium | app/(app)/abap-custom-code-analysis/page.tsx | The page advertises an unsupported 80% speed improvement | 0.2 | scheduled |
| 13853f86d16f | medium | app/datenschutz/page.tsx | Privacy policy omits non-session local storage written by Settings | 0.2 | scheduled |
| 14d4000c4586 | medium | lib/abap/select-parser.ts | SELECT text inside an ABAP string is parsed as a database statement | 0.18 | scheduled |
| 14edf99a390c | medium | app/api/send-approval-email/route.ts | Missing production mail configuration still returns email success | 0.16 | scheduled |
| 17a808b9bdf7 | medium | components/design/ArchitectureOverview.tsx | Missing architecture evidence is replaced with concrete platform defaults | 0.2 | scheduled |
| 1c17fddcb8ee | medium | components/analyze/UsageUpload.tsx | Keyboard users cannot open the usage-file chooser | 1.5 | scheduled |
| 210bafeb4c8b | medium | app/(app)/project/[projectId]/analyze/page.tsx | Route overrides retain the original route's confidence and rationale | 0.15 | scheduled |
| 217726b404c9 | medium | app/(app)/project/[projectId]/tco/page.tsx | The financial chart omits the Year-0 investment point | 0.15 | scheduled |
| 2217e46dd75a | medium | app/method/levels/page.tsx | Hard-coded disagreement count can drift from the generated census | 0.2 | scheduled |
| 230989f67624 | medium | lib/usage-report-email.ts | *(Title withheld until shipped — security)* | 0.16 | scheduled |
| 25c80cb2df6f | medium | components/analyze/ConstructFindings.tsx | The UI labels findings “Signed Off” without recording any sign-off | 0.7 | scheduled |
| 288aeb937b18 | medium | app/(app)/dashboard/page.tsx | The advertised public forum exists only in local component state | 0.2 | fixed (dev) — the same defect as UX-059 |
| 2954ffcda441 | medium | components/design/CloudServiceIntegrations.tsx | *(Title withheld until shipped — security)* | 0.2 | scheduled |
| 297e73fb33a7 | medium | lib/abap/result-diff.ts | Ordered value mismatches report zero rows on both sides | 0.18 | scheduled |
| 2b0cacd91960 | medium | scripts/send-survey.ts | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| 33a64dc1deb0 | medium | app/(app)/project/[projectId]/documentation/page.tsx | BPMN export does not escape names, roles, or identifiers | 2.6 | scheduled |
| 34de0a87ea62 | medium | scripts/qa/lib/report.mjs | Report verdict is not derived consistently from blocking findings | — | unclear — agent infrastructure; the gate `blocks()` applies independently of the verdict |
| 40e1db9fd37a | medium | app/(app)/project/[projectId]/testing/page.tsx | Test Connection ignores the connection details currently shown in the form | 0.15 | scheduled |
| 4362479eb86e | medium | components/design/TargetArchitectureDiagram.tsx | Sparse RAP design data produces architecture nodes that were not in the design | 0.15 | scheduled |
| 443b6524fe1a | medium | components/HowToClient.tsx | The walkthrough falsely presents generated strategy as SAP-verified and ISO-compliant | 0.2 | scheduled |
| 47da79e233b5 | medium | app/catalog/page.tsx | Catalog promises lookup of objects it explicitly does not index | 0.2 | scheduled |
| 484096c89fe2 | medium | app/page.tsx | Landing page makes an absolute no-training promise that the privacy policy disclaims | 0.11 | scheduled |
| 4c53f05b5d23 | medium | lib/abap/support-matrix.ts | Direct SELECT is called fully supported even when no released mapping exists | 0.2 | scheduled |
| 4cce312958d5 | medium | app/(app)/sap-clean-core-object-classification/page.tsx | Quick Answer incorrectly says every graded object is a lookup | 0.2 | scheduled |
| 4db1e81408f4 | medium | app/(app)/project/[projectId]/documentation/page.tsx | *(Title withheld until shipped — integrity)* | 0.15 | scheduled |
| 50a1f1296bef | medium | app/(app)/how-to/page.tsx | Structured guidance publishes a six-stage workflow instead of the product's seven stages | 0.2 | scheduled |
| 54635593d237 | medium | app/(app)/project/[projectId]/testing/page.tsx | ABAP suites bypass the UI's global live-test lock | — | refuted |
| 57876fae0053 | medium | app/(app)/admin/page.tsx | Email API failures are treated as successful notifications | 0.15 | scheduled |
| 58dc160fd6c3 | medium | app/components/LegalOverlay.tsx | Legal overlay does not behave as an accessible modal | 3.0.4 | scheduled |
| 5bbe253e35ef | medium | app/catalog/page.tsx | SAP-area cards label the total object count as successor coverage | 0.2 | scheduled |
| 5db7f0eb4e38 | medium | lib/abap/transformation-prompt.ts | Untrusted ABAP is appended to the model prompt without an instruction boundary | — | refuted — no caller |
| 5dbe58873773 | medium | lib/email-events.ts | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| 605eb59318f7 | medium | app/(app)/project/[projectId]/transformation/page.tsx | The source analysis score is presented as grounding of generated code | 0.2 | scheduled |
| 63c0cec78234 | medium | components/design/ApiBusinessHubMapping.tsx | Unverified model mappings are presented as officially released SAP APIs | 0.2 | scheduled |
| 6500f93e60fd | medium | lib/admin-signup-email.ts | Signup notification claims the welcome email reached the user before delivery is known | 0.16 | scheduled |
| 6a774e02134e | medium | scripts/ux/lib/config.mjs | The full UX review omits TypeScript modules that supply visible copy and email content | 0.16 | scheduled |
| 6d40362efbf6 | medium | scripts/send-community-mail.ts | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| 72556d36c205 | medium | components/SamplePackageDownload.tsx | The ABAP Unit include is named for the local test class instead of its owning global class | 0.15 | dropped with 3.0.6 (showroom removed, 24.09.2026) |
| 75fb0bb39b9e | medium | app/(app)/project/[projectId]/analyze/page.tsx | Keyboard-only users cannot complete the new-analysis flow | 1.5 | scheduled |
| 78c8013a33c1 | medium | components/design/SecurityHardeningChecklist.tsx | Security checklist explanations are mouse-only | 1.5 | scheduled |
| 7cd9bc8bd16b | medium | components/UserOnboarding.tsx | The onboarding privacy notice gives an unconditional no-training assurance for BYOK requests | 0.11 | scheduled |
| 812cbce3b485 | medium | tests/trust-chain-e2e.spec.ts | Trust-chain test can pass while audit-pack creation is completely broken | 0.17 | scheduled |
| 823a09338d58 | medium | components/GuideShareBar.tsx | Clipboard fallback reports success without copying anything | 0.15 | scheduled |
| 8272a89de93c | medium | app/(app)/knowledge/page.tsx | The knowledge page claims the app deploys and configures BTP security infrastructure | 0.2 | scheduled |
| 883625214774 | medium | components/analyze/GapsWorklist.tsx | *(Title withheld until shipped — integrity)* | 0.15 | scheduled |
| 8a977779b6bd | medium | components/analyze/ExtensibilityDecisionMatrix.tsx | An empty checkpoint result crashes the decision matrix | — | refuted |
| 8d9184e6f94f | medium | app/(app)/project/[projectId]/analyze/page.tsx | The advertised 1 MB upload limit is not enforced | 0.15 | scheduled |
| 989dafdac359 | medium | components/analyze/UsageRiskMatrix.tsx | Changing matrix cells leaves the previous object's detail displayed | 0.15 | scheduled |
| 98e7aca0c7ef | medium | lib/chatbot-knowledge.ts | Knowledge base presents drafted architecture as infrastructure the service configures | 0.2 | scheduled |
| 990aa825e15f | medium | app/api/mfa/setup/verify/route.ts | *(Title withheld until shipped — integrity)* | 0.14 | moot (dev) — the setup routes are gone with 0.13 |
| 9fb67cc60860 | medium | lib/abap/findings-detector.ts | A hierarchy with missing interfaces is still described as fully resolved | 0.18 | scheduled |
| a2f85ffb6ce5 | medium | app/(app)/project/[projectId]/delivery/page.tsx | The audit pack is labelled Ready based only on an input fingerprint | 0.6 | scheduled |
| a3a6c21cd984 | medium | components/LandingSlideshow.tsx | The landing slideshow presents draft generated output as deployment-ready | 0.2 | scheduled |
| a48a8ba01b64 | medium | lib/abap/usage-parser.ts | Non-finite execution counts are accepted as measurements | 0.18 | scheduled |
| a4fe4e2de430 | medium | lib/abap/usage-join.ts | Usage percentiles are calculated before duplicate object rows are aggregated | 0.18 | scheduled |
| a530d2532b95 | medium | hooks/useTestExecution.ts | Simulated ABAP cases are still presented as passes | 0.2 | scheduled |
| a5cd304e9023 | medium | components/PresentationViewer.tsx | Presentations display the viewing date instead of their recorded date | — | refuted |
| a71be0146d3c | medium | lib/board-deck.ts | Resolved-object metric subtracts finding occurrences from object count | 0.8 | fixed (dev) |
| a73e75baec14 | medium | components/design/SyncPatternCard.tsx | The design-stage sync card always claims the core has been transformed | 0.2 | scheduled |
| aad1ecf24d47 | medium | app/(app)/admin/page.tsx | Suspended accounts are displayed as pending applications | 0.15 | scheduled |
| ab15c7746a28 | medium | app/(app)/sap-cloudification/page.tsx | Public copy calls unvalidated model output clean-core-compliant | 0.2 | scheduled |
| ad567beae4a0 | medium | components/VerificationRail.tsx | The current phase always appears green even when workflowSteps marks it stale or partial | 1.7 | scheduled |
| b0b3150a1974 | medium | components/UserOnboarding.tsx | The mandatory onboarding overlay lacks dialog focus management and semantic labeling | 3.0.4 | scheduled |
| b18d35df575f | medium | scripts/qa/refute.mjs | Full-review findings cannot be selected by the refutation command | — | fixed (dev) |
| b43997202535 | medium | app/(app)/project/[projectId]/transformation/page.tsx | ABAP Cloud transformations are presented as Node.js output | 0.2 | fixed (dev) — the same defect as UX-037 |
| ba5757ea1a85 | medium | lib/abap/narrative-anchors.ts | *(Title withheld until shipped — integrity)* | 0.18 | scheduled |
| c217cf83fa3c | medium | app/(app)/project/[projectId]/tco/page.tsx | TCO range controls have no accessible names | 1.5 | scheduled |
| c2923dfd70ab | medium | app/(app)/settings/page.tsx | Settings form controls lack programmatic labels and switch state | 3.0.4 | scheduled |
| c47eaa19b11d | medium | app/api/v1/purchase-orders/mass-create/route.ts | Mock purchase orders are returned as completed successes without simulation labeling | 0.2 | scheduled |
| c4c4f5112a00 | medium | components/LandingModals.tsx | The advertised MFA recovery-code path cannot accept recovery codes | 0.13 | moot (dev) — no more recovery codes, 0.13 |
| c50ddb41f588 | medium | components/SectionBoundary.tsx | Every section crash is attributed to an older analysis run without evidence | 0.2 | scheduled |
| c7466a7f2570 | medium | app/(app)/project/[projectId]/transformation/page.tsx | Remediation mode claims code changes but only changes banner text | 0.2 | fixed (dev) — the same defect as UX-038 |
| ce37b706107d | medium | app/(app)/project/[projectId]/transformation/page.tsx | Successful generation does not update the project used by the workflow UI | 0.15 | scheduled |
| cff3ec1639d4 | medium | app/(app)/tenant-security/page.tsx | Documented admin review claims connection details that the request never collects | 0.2 | scheduled |
| d163622eab8e | medium | tests/reference-analysis.spec.ts | Settled-count assertion does not prove which findings have provenance | 0.17 | scheduled |
| d2a2d7d872e3 | medium | lib/markdownFormatter.ts | Most generated report formatters bypass mandatory money masking | 0.4 | scheduled — addendum to 0.4 |
| d943e1fc71a5 | medium | tests/mfa-coverage-guard.spec.ts | Trust-chain MFA coverage only checks that a call-shaped string exists | 0.17 | scheduled |
| db4bbb64fd81 | medium | components/design/CloudServiceIntegrations.tsx | Cloud-service deep dives cannot be opened with a keyboard | 1.5 | scheduled |
| dddbda2a0c32 | medium | app/(app)/how-it-works/page.tsx | The generation stage is described as deterministic and compiled when it is neither | 0.2 | scheduled |
| dfc85c150088 | medium | app/(app)/verify-pack/page.tsx | The Audit Pack upload control is not keyboard operable | 1.5 | scheduled (= UX-003) |
| e8f7f5d6c528 | medium | app/(app)/knowledge/page.tsx | Both extensibility routes are given an absolute zero-upgrade-impact guarantee | 0.2 | scheduled |
| ed9796910f5a | medium | app/globals.css | Mobile document tables remove column headers from the accessibility tree | 3.0.4 | scheduled |
| edf9bcc47461 | medium | app/(app)/project/[projectId]/delivery/page.tsx | *(Title withheld until shipped — integrity)* | 0.6 | scheduled |
| f3428b0782a9 | medium | tests/tco-finite-guard.spec.ts | TCO boundary tests execute a copied model and omit the missing-score case | 0.17 | scheduled |
| f480d96b63d1 | medium | app/api/test-s4-connection/route.ts | Endpoints that reject HEAD are never retried with GET | 0.15 | scheduled |
| f7110f3d6619 | medium | app/survey/[token]/SurveyClient.tsx | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| f95980a7ffed | medium | lib/audit-pack-verify.ts | Signature-service failures are represented as an unsigned pack | 0.5 | scheduled |
| fae6b4d2b2d0 | medium | app/survey/[token]/SurveyClient.tsx | Confirming an emailed preselection clears it for multi-select questions | — | refuted |
| 8ccb1b1b765b | low | app/survey/[token]/page.tsx | *(Title withheld until shipped — integrity)* | 0.16 | scheduled |
| bcbe2c770c8a | low | tests/workflow-style-guard.spec.ts | Rendered seven-stage style check omits the TCO stage | 0.17 | scheduled |

## 15. Counter-review c5085bb (18.09.2026) — intake

Sonny had the complete code export of `c5085bb` reviewed externally. The package
(`clean-core-review-c5085bb.zip`, private, with the export itself) — unlike the three
agents — actually executed functions: router, classification, skeleton and BPMN generator on
72 corpus sources, TCO model, XML guard, the corpus comparator with six mutants and a
local Node permission probe; plus twelve SAP/vendor primary sources. 20 findings (14 P1, 6 P2),
its own 3.0 order (G0–G4) and a market assessment. Every point was re-checked against the
code on 19.09.; the verdict is here, the steps are in the phase tables.

**The review's release recommendation** — keep developing, preserve the strengths, do not market the
current state as a consistently reliable 3.0 decision platform — is congruent with §4 "Status".

| ID | Finding | Verdict at the code | Adoption |
|---|---|---|---|
| CR-01 | Classic/cloud precedence | partly: D is deliberate (comment in `abcd-classification.ts`, 21/22 overlap objects with successor) and defensible for the cloud target reference; undisputed: the second dimension is missing | 7.9 · decision §9 No. 18 |
| CR-02 | No target release contract | confirmed (design): catalog "latest" global, run signs only catalog and rule version | 7.10 (L, before 3.0 — G0) |
| CR-03 | Public Edition forces CAP | confirmed, factual error: Developer Extensibility has its own tables on-stack (SAP Learning) | router fix in progress 19.09. (agent), ratchet checked |
| CR-04 | Standard fit from write accesses | confirmed: technical observation as business answer | router fix in progress 19.09.; the fit is carried by 7.2/7.3 |
| CR-05 | Corpus traffic light does not check what it says | confirmed (six mutants stay *agree*) | 1.9 |
| CR-06 | Update task too early as a task | design decision, recommendation: accept | §9 No. 15 → 2.12 |
| CR-07 | ADBC effect missing, CATCH "unreachable" | confirmed (generator run CC-034) | 2.13, in progress 19.09. (agent) |
| CR-08 | No entry point for methods/exits/dynpro | confirmed (9 of 74 without entry point) | 2.14 |
| CR-09 | Mock runner without a reliable boundary | confirmed; minimal environment without secrets exists, the boundary still does not hold (details private) | §9 No. 16 → 8.9; **interim protection built on 21.09. (`4f18fc6`)** — bundler, CommonJS loader, resolve hook and Node's own switch, explicitly not a boundary |
| CR-10 | Auto-healing against server-authoritative runner | confirmed at both comments: the retry runs against the old state | 8.7; auto-healing locked until then |
| CR-11 | Approval not bound to the run | confirmed (validator without `expectedRunId`) | 8.8 |
| CR-12 | Transformation follows the recommendation | confirmed — stands as 8.3 | 8.3, unchanged |
| CR-13 | Invited readers fail at four routes | confirmed (`project.userId !== uid` also on GET) | **fixed 21.09. (`4f18fc6`)**, reading via `mayReadProject`, writing stays with the owner; acceptance across all roles is 5.6 |
| CR-14 | View switch loses `#fragment` | confirmed (`router.push('?…')`) | **fixed 21.09. (`4f18fc6`)**; the revision notice next to it stays 6.9 |
| CR-15 | No revision notice in the workspace | confirmed (design) | 6.9 |
| CR-16 | TCO: negative values, early rounding | partly: finite checks present, sign and score interval not, rounding early | **validation fixed 21.09. (`4f18fc6`)**; the option calculation itself stays 7.4 |
| CR-17 | Zero usage → definitive Retire | confirmed | 6.7 reworded; implementation follows |
| CR-18 | No catalog path → "Blocked by SAP" | confirmed | 6.7 reworded; implementation follows |
| CR-19 | Old documentation, second process truth | confirmed — stands as 3.0.5 | 3.0.5, unchanged |
| CR-20 | XML regex: accepts broken, rejects default namespace | confirmed (three probes reproduced) | **fixed 21.09. (`4f18fc6`)**: `saxen` parses, well-formedness and BPMN root are two states — and `saxen` is now declared instead of borrowed transitively |

**Not adopted, with reason.** (a) CR-01 as Grade B: the grade is the clean core target reference,
not classic usability — showing both is the answer, not changing the
definition (Sonny's decision, No. 18). (b) Rejecting the mockups as a substitute for evidence is
right — and already planned that way: 3.0.6 requires real product views. (c) The pilot with twelve
new cases and an independent reviewer (§11 of the review) is not a development step; it
stands in §7 under "without version" next to the bench and the fair comparison, now with the review's eight metrics
as a template. (d) The market assessment (§10) changes no step; its thesis — the
differentiation lies in lower translation and coordination effort per reliable
decision, not in views, BPMN, audit or "free" — is that of §1 and becomes the
yardstick for 3.0.6 and 3.0.10.

**Acceptance order G0–G4 (adopted; mapping to our steps):**

| Gate | Purpose | Steps | Minimum acceptance |
|---|---|---|---|
| G0 — correct, refutable answers | Classification, target profile, process semantics, real comparator facets | 1.9 · 2.12 · 2.13 · 7.9 · 7.10 · router (CR-03/04) | overlap case classic B/cloud not; deprecated with and without successor; same source under two profiles; Public table with Developer Extensibility; ADBC with error path; `IN UPDATE TASK` with and without commit; the six mutants red |
| G1 — trust boundaries | Authorization, revision-bound commands, runner | 5.6 · 8.7 · 8.8 · 8.9 | owner/reader/revocation/admin claim across all routes; A reads, B activates, A approves → 409; repair draft with a new identity; evidence only from the isolated worker |
| G2 — one consistent work item | View switch, entry point, process and documentation on one state | 2.14 · 6.9 · 3.0.5 · immediately (CR-14, CR-20) | Business → IT → Management → back: selection and revision identical, also after reload; tab B creates a revision, tab A gets the notice; XML well-formedness and business validity as separate states |
| G3 — decide first, then build | Need, cross-check, option costs, binding architecture | 7.2 · 7.3 · 7.4 (before 8.4) · 7.8 · 8.2–8.4 · 6.7 (candidate ≠ confirmed) | no standard fit from a legacy construct; no confirmed decommissioning from usage alone; the decision binds need and cost revision |
| G4 — proven handover | Generator contract, receipts, handover, interoperability, copy | 8.3 · 8.5 · 8.6 · 4.3 · 3.0.6 | three complete paths plus the case that stays open, each with negative probes; licensed Signavio import logged; screen, access and performance check on real views |

What the review says about the roadmap and what applies here: "Sharing complete" went too far (header
reworded); 7.4 belongs before 8.4 (noted); the four buckets are candidates until someone
confirms (6.7); transaction knowledge stays in the base model (No. 15); security foundations are
not postponed past 3.0 because they are infrastructurally unpleasant (No. 16, 8.9).

---

## 16. Evaluation of an SAP process inventory (22.09.2026) — intake

Sonny provided a machine-readable archive of **1,246 BPMN process diagrams** from an
SAP standard inventory (573 scope items, 19,876 nodes, 19,469 flows).
Four independent evaluations measured it — three locally, one as a second opinion
via an outside model that received **exclusively** an anonymised numerical extract
and never saw the diagrams.

**The condition, and it is not negotiable.** The inventory is bound by licence:
it may not go into the repository, not be shipped and not be held
server-side. §6 excludes "SAP reference processes as content" anyway.
**Therefore nothing was adopted as content, only as insight** — numbers,
distributions and form rules. Copyright protects the expression, not the insight.
None of the seven steps below brings outside content into the product; none contains
a list of roles, labels or processes.

**The finding in two sentences.** The engine today produces a control flow graph
with BPMN names — return codes as decisions, no actors, loops as
cycles. And the check tool that should uncover this compares **18.2 %** of the
skeleton nodes and calls the rest green.

**Decision Sonny, 22.09.2026: all seven with high priority.**

| | What | Where | Size | Goal |
|---|---|---|---|---|
| V1 | Sharpen the corpus skeleton comparison — **first** | 1.9 | M | Credibility · preserves |
| V2 | Return code is an effect, not a decision | 2.15 (new) | M | Usability · increases |
| V3 | Lanes deterministically from four kinds of evidence | 2.16 (new), 2.4 | M | Competition · increases |
| V4 | `DESIGN.md` §5.8 and code in line (a parallelism, b loops) | 2.17 (new) | M | Credibility · preserves |
| V5 | Eight case forms; `FUNCTION` is not a report | 2.10, 2.14 | M | Credibility · increases |
| V6 | Comparison eligibility per element, three results | 7.8 | M | Credibility · preserves |
| V7 | "Gateway without condition" by provenance | 3.3 | S | Usability · preserves |

**Order and dependencies.** V1 comes before V2, V3, V4 and V5 — without the
sharpened comparator no engine rule can ever turn red through the corpus, and
a change without a ratchet is a claim. V5 needs V2, V3 and V4 as
target values. V7 follows V4 (b). V6 is independent and can be done at any time, as long as 7.8
is open.

**What was explicitly not adopted**, checked and rejected:

- **Holding the inventory server-side and silently comparing against it.** The risk
  lies in possessing the copy, not in the shipped result, and is therefore binary —
  good safeguards do not make it smaller. The repository is public and Git
  forgets nothing.
- **"Every XOR branch needs a condition" as a conformance rule.** It fires on the
  reference inventory itself in 53.9 % of cases. V7 narrows our rule instead of
  tightening it.
- **Concluding "does not exist" from "not drawn in the inventory".** Boundary events
  and task subtypes structurally cannot appear in this inventory at all —
  it is reconstructed from vector PDF. V6 is the answer to that: three results
  instead of two.
- **Gateway density as a target metric.** Whether 26 % versus 13 % is "wrong" cannot be
  answered without a program ↔ diagram mapping; ABAP is legitimately finer than an
  L3 process. V2 therefore measures the **class** of a condition, not the density.
- **The style part of the naming contract as a product rule** (verb first, word count,
  spelling). Single-source finding, explicitly considered not derivable by the second
  opinion. It may be a hint, never a condition (§9 No. 20).
- **Comparison against an outside BPMN export uploaded by the user.** That would be
  BPMN import through the back door; it has deliberately been placed after 3.0 since 18.09.2026.
- **Lanes from packages, classes or includes.** No actor evidence.

**What the inventory cannot answer**, explicitly recorded so that it is not later
read as answered: boundary events and task subtypes (structurally
not extractable) · event subtypes other than message (measurable only as a sum) ·
data stores · loop and multi-instance markers · **and above all the
round-trip behaviour of `extensionElements`, i.e. exactly the question of 4.3** — a
PDF export carries no extensions. That remains an experiment with a real file
against a real licensed workspace.

**A pleasant confirmation:** `DESIGN.md` §5.9 sets "overview ≈ 12 elements, one
layer ≤ 25". The inventory has median 12 and p85 25. That was a design opinion and is
now measured — nothing to change here.

## 17. Model per stage (23.09.2026) — investigation and intake

The product calls the same Gemini model for all six model stages. On
23.09.2026 Sonny commissioned an investigation: "model per stage" checked against the roadmap,
with a comparison run, without a code change. The full report lies outside the
repository (`scratch/modellvergleich/BERICHT.md`, not checked in); here is
what follows from it.

**The roadmap is silent on model choice — completely.** No model name, no version,
no condition on model quality. It governs *whether* a model is called (1.2,
stages switchable individually), never *which*. So no commitment would be broken. The
only constraint is in `DESIGN.md`: ADR-025 requires **speed** for the naming stage
("22 names per model call do not reliably fit in 3 s") — the only place in the
rule set that demands any model property at all, and it demands
speed, not quality. §10 schedules bench metrics (hallucination rate)
explicitly **after 3.0**.

**The facet `fachsaetze` measures no model.** `tests/helpers/korpus-comparison.ts`
only checks whether anchors point to existing lines, and is hard-wired to `disagree`:
*"Never `agree`: the content of the business statements was not compared."* The
number "0 agree / 68 disagree" means **nothing was compared**, not "the model
fails" — and none of the five facets calls a model; the corpus would be bit-identical for every
model. But it carries the only real ground truth of the repository:
**173 anchored business statements for which there is no producer today.**

**Measured, 68 calls across four models:** zero invented anchors, zero invented
monetary amounts, schema adhered to practically throughout. The anchor rates are
**statistically indistinguishable** — paired per case, each of the six
95 % intervals contains zero. Only cost and time stand out from the noise:
`gemini-3.5-flash-lite` costs a third and is 2.4 times faster because it produces no
thinking tokens.

**A model change cannot move a signed number.**
`app/api/runs/create/route.ts:459` signs `Omit<…, 'analysis'>` — the model prose
is explicitly excluded from the signature, and every number from the model is
overwritten server-side. The risk axis therefore does not separate `analyze` from the
rest, but **`design` and `testing`** (answer stored unchecked) from
**`naming` and `transformation`** (real gates).

**Decided (Sonny, 23.09.2026): no global switch.** The measurement ran on
corpus cases averaging 543 bytes; the real analysis prompt is 19,477
tokens. A model without thinking tokens is, on the hardest stage, the opposite of
what you want, and the comparison supports "just as good" as little as "better". Plus the
number that is bigger than the model question: **40 of 53 expected business statements (75 %)
were hit by no model.**

| No. | Step | Size |
|---|---|---|
| 17.1 | **Dead registry entry.** `gemini-2.5-pro` is listed in `app/api/gemini/route.ts` as "GA — stable fallback" and answers the production key with **HTTP 404, "no longer available to new users"** (re-checked 23.09.2026, twice). The escape hatch `GEMINI_MODEL` would accept it — an emergency exit to a model that does not answer. Remove it or replace it with a live GA model, and the pin guard will in future check that **every** registry entry answers. | S |
| 17.2 | **Harden `testing` like `documentation`.** `hooks/useTestGeneration.ts:93-108` parses the model answer without a type check, `result.testCases \|\| []` accepts an object, stores it, and `testing/page.tsx:1735` calls `.map` on it. The same defect that `0cb64a5` fixed in the documentation stage — and **only the documentation stage has an `error.tsx`**, so the testing stage catches the crash at the root and takes the button with it. Check before writing plus a segment boundary. | M |
| 17.3 | **`naming` on `gemini-3.5-flash-lite`** — for latency, not quality: ADR-025 requires speed, lite is the only measured model without thinking tokens, the naming prompt is the cheapest at 2,658 instead of 19,477 tokens, the stage has the strictest validation and **no signature contact**. Honest limit: **the naming stage itself was not measured**; the conclusion rests on mechanism and prompt size. Acceptance: a measurement run of the stage, three passes, against today's default. | M |
| 17.4 | **Clean measurement run before any further model decision.** Three passes per model on **real** starter examples instead of 21-line snippets. Without it, no statement about `analyze` holds. | M |

**Result 17.4 (measured, 24.09.2026, approved by Sonny).** Three passes per
model on all eight starter examples (`public/starter-examples`, 87 to 1,000 lines,
prompt up to around 30,000 tokens), five models, 120 of 120 calls, **$1.95**. Prompt
and scoring from the product code (`buildAnalysisPrompt`, `anchorNarrative`,
`containsAmount`); script `scratch/modellvergleich/run-174.ts`, not checked in.

| Model | Statements with anchor | Schema adhered to | Median latency | Cost 24 calls |
|---|---|---|---|---|
| `gemini-3.8-flash` (default) | 134/216 (62 %) | 20/24 | 14.6 s | $0.51 |
| `gemini-3.5-flash` | 167/206 (81 %) | 24/24 | 21.7 s | $0.53 |
| `gemini-3-flash-preview` | 92/178 (52 %) | 24/24 | 14.3 s | $0.33 |
| `gemini-3.5-flash-lite` | 83/143 (58 %) | 22/24 | 5.3 s | $0.11 |
| `gemini-2.5-flash` | 140/305 (46 %) | 20/24 | 25.9 s | $0.48 |

No model invented a monetary amount, all 120 took over score and route unchanged,
a single anchor pointed into nothing (`lite`). **The noise is the real
number:** the same model on the same example varies between three passes by
**33 percentage points** of anchor rate on average. Paired per example against the default,
`3.5-flash` is at +18 pp, the 95 % interval (−2 … +39) narrowly includes zero —
a candidate for a larger run, not a proven winner; the others are equal
or below. The single passes of 23.09. thus carry, in retrospect, even less
than was already stated there.

**Side finding, a product defect:** on the 1,000-line example the default returns
`gaps` in 2 of 3 passes as a **single object instead of a list** (as do `lite`
and `2.5-flash`). `lib/analysis-run.ts:236` reads `Array.isArray(obj.gaps) ? obj.gaps
: []` — the business gap silently drops out of the work list.

**Result 17.3 (measured, 24.09.2026).** The naming stage itself, three passes on
the eight starter examples, default against `gemini-3.5-flash-lite`, scored with
`validateNamingAnswer` — the same check the route applies before saving.
48 of 48 calls, under $0.30.

| | `3.8-flash` (default) | `3.5-flash-lite` |
|---|---|---|
| Latency median / p90 | 5.0 s / 21.5 s | 1.3 s / 6.4 s |
| within 3 s (ADR-025) | 4/24 | 19/24 |
| Nodes with accepted name | 644/921 (70 %) | 532/921 (58 %) |
| rejected by the check | 1 | 2 |

The difference lies not in the quality of the names but in **which** nodes
get named: `lite` skips start, end and branches (invoice export 8 of
17 instead of 17 of 17) — and it is precisely the branches that carry a BPMN in business terms. Unnamed
nodes keep their technical token; that is not an error, but visible. The
17.4 run ran in parallel and burdens the absolute latencies of both models equally.
**Re-measurement and decision (Sonny, 24.09.2026, path C).** The prompt now explicitly requires start, end and branches to be named. With it, same setup: `lite` names **96 %** of these nodes (before 36 %) and 66 % of all, median 2.0 s, 18/24 under 3 s; the default 100 % and 82 % respectively, 4.6 s, 2/24. The naming stage has run on `gemini-3.5-flash-lite` since then (`NAMING_GEMINI_MODEL`, 91701bb).

**Two levers are bigger than the model choice, both schedulable independently:** the
evidence JSON makes up **49–56 %** of the analysis prompt and is serialised
indented; and `testing` makes **up to four model calls per click**. Both
affect every stage and every model. Caution is needed with the evidence JSON:
it goes into the hash that the receipt names.

**Follow-up 01.01.2027:** the price of today's default doubles
(0.75 → 1.50 input, 3.75 → 7.50 output per million tokens).

**Do not touch, regardless of which step comes:**
`lib/model-receipt.ts` (the `modelId` is what was *actually passed*, not
what was requested), `/api/gemini` as the only way out,
`runs/create:459` (`analysis` outside the signature), and historical receipts.

### The ground truth that nobody produces (17.5 and 17.6)

Recounted on 23.09.2026: **all 68 corpus cases** carry business statements, together
**173 statements with 435 anchors** — every statement has at least one. They look like this:

> `CC-003-B01` — *„Negative Beträge werden als INVALID eingeordnet."* → `source.abap:9`
> `CC-002-B01` — *„Nur eine nicht leere Kundennummer wird als Selektionsschlüssel aufgenommen."* → `source.abap:6–7`

That is not the executive summary that `lib/analysis-prompt.ts:38` orders from the model
("plain english business executive summary"). It is the anchored
individual statement about what the code does at this point — **closer to what the
Business view shows after 3.0 than to what is requested today.** The
baseline for 2.11 says so itself: *"the engine does not know the statement class —
business statements throughout."*

Three things thus stand side by side that belong together: a hand-written
target value, a prompt that orders something else, and a facet
that pretends to check both. As long as that stands, **no prompt change and
no model change can ever show whether it got better or worse.**
3.0 does not make this smaller: the main statement of the Business view is exactly the
anchored individual statement.

| No. | Step | Size |
|---|---|---|
| 17.5 | **Done 23.09.2026 (adb6d7d).** **The facet really compares.** `compareBusinessStatements` today only checks whether anchors point to existing lines, and is hard-wired to `disagree`; the verdict is `nicht-vergleichbar`. In future it compares the produced statements against the 173 target statements — **deterministically**, via the anchor as key and a disclosed text measure, **no model as judge** (the second measurement of 23.09. did exactly that and therefore carries nothing). Per case numerator and denominator as in 1.9; "not checked" remains forbidden as `agree`. **Done when** `baseline.json` names a number for `fachsaetze` that moves when you change the prompt — and when a deliberately degraded prompt turns the facet red. | M |
| 17.6 | **Decided 23.09.2026 (Sonny): A+B, A first.** **Who produces the business statements** — today nobody, and that is a product decision, not a technical question. Two paths, and they are not mutually exclusive: **(a) the engine** from the skeleton, deterministic and therefore without model cost and without hallucination, but limited to what the control flow yields; **(b) the model** with a prompt that asks for exactly that, instead of a summary — anchored, and measurable through 17.5. Belongs answered **before** the expansion of the Business view, because it determines what that view actually says. The decision belongs to Sonny; this step prepares it with measured numbers from 17.5 instead of anticipating it. | M |

**Result 17.5 (measured, 23.09.2026).** The facet previously compared
nothing: no module in `lib/`, `app/` or `components/` produces any
business statement at all today, and the facet only checked the anchor — a statement that was
correctly anchored and wrong in content got through. `0/173` was wiring,
now it is a measurement. Three sub-checks (`ankerpruefung`,
`fachsatzabdeckung`, `fachsatzinhalt`), the key is the ABAP statement at the
anchor line, text measure Dice over normalised content words. The threshold 0.50 is
calibrated on the corpus and recalculated on every run: different
target statements reach at most 0.400, the mildest rewording does not fall
below 0.571; 0.30 and 0.65 both go red.

**The number for 17.6:** what `lib/analysis-prompt.ts` orders today — an
executive summary — hits **0 of 173** target statements with 173/173 compared
statements. Not "incomparable", but comparable and off target. The upper bound of the
measure is 173/173 (target echo). A target number for the first producer is still missing
and belongs in 17.6, otherwise one again measures without a target value.

**Open in 17.6, in addition to the path question:** does invention count as an error? Today
not — produced statements without a target statement go unpunished, because the case book nowhere
declares its business statement list complete. With path (b) that is exactly the
hallucination risk. If it is to count, **the corpus** must declare completeness per
case (analogous to `declaredEmpty` for findings and objects).

### The decision on 17.6 (Sonny, 23.09.2026) and what follows from it

**Both paths, A first.** The engine sets the lower bound, the model is
measured against it; if the model is worse than the engine, it is dropped.

Plus three requirements that change the scope of both steps:

1. **The statement must make the code understandable to a business person.**
   Not "SELECT on KNA1", but what happens in business terms. That is the yardstick,
   not technical correctness alone.
2. **The statement sits on the BPMN element**, not in a list next to it — the way the
   Business view is intended in 3.0 (`docs/roadmap/clean-core-mockups-v2_8.html`).
   Where the matter requires it, **with all details**; brevity is not a value in itself.
3. **Vagueness is resolved *and* disclosed — in that order.**
   This is the sharpest of the three and contradicts the convenient path: `notDetermined`
   may **not take the place of a statement**. First the best possible
   evidenced statement is formed, then the remaining uncertainty is noted *on* that
   statement. An element without a statement but with "not determined" does not fulfil
   this step.

**Provenance per statement, from the existing vocabulary (`lib/provenance.ts`), never newly
invented:** engine statements are `reconstructed`, model statements `proposed`.
`notDetermined` remains permissible for a *component* of a statement, never for the
statement itself.

**No hallucinating, and that is measurable, not promised.** Path B may only
go live once the corpus declares per case that its business statement list is
complete (pattern: `declaredEmpty` for findings and objects). Without that,
17.5 only counts hits and hides inventions — then one measures a model by
what it gets right, and never by what it makes up.

| No. | Step | Size |
|---|---|---|
| 17.7 | **Path A — the engine produces the business statement.** Deterministically from skeleton and evidence, without a model call, without network. Provenance `reconstructed`, anchor on the ABAP statement, display on the BPMN element. Opens rule 6 from `lib/abap/process-skeleton.ts` (never an invented phrase there) for **one clearly separated layer** — the node label itself stays a literal token. **Built 23.09.2026 (`3535f14`): 69 of 173, coverage 167/173, 14 of 68 cases green.** **Acceptance adjusted (Sonny, 23.09.2026): ≥ 90 of 173.** The original number 120 was set before there was a producer. Measured since then is the **ceiling for path A: 116** — a sentence kit that takes from each target statement exactly the words derivable from the anchor gets no further (`tests/business-statement.spec.ts`, last test; recalculated, the comment previously wrongly said 107). The missing target statements are mostly the case book's assessment prose — "not evidenced", "unknown in the slice", references to other cases — i.e. wording and not content; but this wording is judgement and cannot be derived. 69 to 90 is fine-tuning of a demonstrably working producer, 90 to 116 would be chasing individual cases with diminishing returns — the rest is carried by 17.8. **Done when** `baseline.json` names **≥ 90 of 173** for `fachsaetze` and the cross-check from 17.5 (neighbour's statement at one's own anchor) stays red. | M |
| 17.8 | **Path B — the model produces the business statement**, with a prompt that orders anchored individual statements instead of an executive summary (today: 0 of 173). Provenance `proposed`, outside the signature like every narrative. **Prerequisite:** the completeness declaration in the corpus (above), otherwise invention goes unpunished. **Done when** B beats the number measured for A — otherwise A remains alone, and that is a permissible result. | M |
| 17.9 | **Built 23.09.2026.** **Forbidden statements are compared — the hallucination measurement for 17.8** (Sonny, 23.09.2026). The corpus carries in **47 of 68 cases** a field `forbiddenConclusions` with **197 explicitly forbidden statements**, 158 of them with anchor prefix `source.abap:NN` — hand-written, in the repository for months, and `tests/helpers/korpus-comparison.ts` mentions the field **zero times**. The same pattern as with `fachsaetze` before 17.5: a target value is there, nothing compares it. This is the right measurement against invention, and it replaces the originally planned completeness declaration: an "additional" statement from the engine is **not** a hallucination, but more coverage than the case book wrote — a rule "extras are errors" would have punished 17.7 for being more thorough. A hallucination is a statement that the code at its anchor does not support, and exactly those are named by the 197 statements. **The machine is in place and is only reversed:** the same text measure from 17.5, the same threshold, the same anchors — if a produced statement reaches the threshold against a *forbidden* statement, that is an error instead of a hit. **Two things are craft, not principle:** the 39 statements without anchor prefix ("whole slice") apply to the whole case instead of to one line, and a negation ("Kein Befund X melden") is linguistically not the statement X — the measure needs the core of the forbidden statement, not its wrapping. **Done when** `baseline.json` carries per case its own sub-check `verbotene-aussagen` with numerator and denominator, a producer that deliberately makes a forbidden statement turns the facet red, and today's engine producer from 17.7 names its number. **Measured:** 166 of the 197 statements have a derivable core, 31 do not (throughout classification verdicts such as "Kein D", from which no business statement can be formed); the engine producer from 17.7 violates **4 of 166**. **Before 17.8.** | M |

**Result 17.8 (measured, 24.09.2026, approved by Sonny).** Path B is built
and measured, not wired. `lib/business-statement-prompt.ts` orders, per
ABAP statement and BPMN element, an anchored business statement instead of an executive
summary; `validateStatementAnswer` rejects and counts like the naming stage (file,
line, statement at the line, element at the anchor, foreign fields, Markdown), provenance
`proposed`, outside any signature. **Measured across all 68 cases,
`gemini-3.8-flash`, two passes:** **7 and 9 of 173** hits against **69** for the
engine; forbidden statements 0 and 1 of 166 violated (the one is
word overlap, CC-061); rejected 0 of 500 statements; both together 72. Cost
$3.80. **B does not beat A — A remains alone.** Honest limit: the model statements
are, on reading, mostly correct in content, but worded differently, and the
Dice measure from 17.5 is calibrated on shortening, not on independent wording. Whether
B *explains* better, this measure cannot say, and that is not a number that may make B
the winner after the fact. The prompt was sharpened once after trial runs on five
cases, without a separate control set — a small advantage for
B that changes nothing in the result. **The completeness declaration from row 17.8
is not built** (Sonny, 24.09.2026): 17.9 replaced it, and a trial build would have
counted a true engine statement as an invention (CC-054, `TYPES` line).

**Result 17.9 (measured, 23.09.2026).** The sub-check `verbotene-aussagen`
is in `tests/korpus/baseline.json` per case: **162 upheld out of 166
comparable** forbidden statements, measured at all in 46 of the 68 cases. The
other four facets stayed bit-identical, `fachsatzinhalt` stands
unchanged at 69 of 173.

Two craft questions, both justified in the code
(`tests/helpers/korpus-comparison.ts`): **anchorless statements** — of the 39 without
prefix `source.abap:NN`, 21 name their anchor after a profile specification, 18
really apply to the whole slice and are therefore measured against *every*
produced statement of the case instead of being skipped. **The negation** — the
core comes from the first clause (the justification behind it is a *true*
statement and must never become a prohibition), and where the case book has put the forbidden
statement in quotation marks, the quotation is conclusive; if it is not enough
for two content words, the statement counts as **not comparable** instead of
passed. This is calibrated by the fact that the case book's 173 target statements
violate the forbidden statements of their own case **zero times**
(`tests/korpus-mutation.spec.ts`, V2).

**The four violations of the engine producer — a finding, not a threshold question.**
CC-067: "Es werden Kunden selektiert" (customers are selected) at line 6, which the case lists as
unreachable in the slice ("Kein Fachsatz ‚Kunden werden gefunden'" — no business statement "customers are found") — that is the
invention this measurement is meant to find. CC-043, CC-049 and CC-061 are
word overlap without a shared claim: "Die Berechtigung auf F_KNA1_GEN
wird geprüft" (the authorization on F_KNA1_GEN is checked; true) against the prohibition "nur mit F_KNA1_GEN-Berechtigung wird
ausgegeben" (output only with F_KNA1_GEN authorization), 0.67 — the Dice measure sees "geprüft" and "ausgegeben" as
equivalent single words. The limit stands at 4 and is a ratchet against
deterioration, not a licence.

**Order:** 17.5 before 17.6, and both before any further model decision —
otherwise one optimises a quantity that nobody measures. 17.5 is useful and cheap
independently of the model question: the target value has been in the repository for months.

### The decision on path B (Sonny, 27.09.2026) and 17.10

A benchmark of 200 constructed cases (`tests/prozess-benchmark/`) had 2,273
target statements rated **blind** by five judges — for each target statement three variants without
provenance, the assignment opened only after all verdicts
(`judge/schluss/zuordnung.json`):

| | same | divergent | false statements | forbidden conclusions |
|---|---|---|---|---|
| Path A (engine, after the business statement corrections) | 10.3 % | 0.1 % | 11 | 4 |
| Path B (model, `lib/business-statement-prompt.ts`) | 86.5 % | 0.3 % | 39 | 19 |

B almost always hits the business meaning, but invents more often; A is reliable, but
technical. **Sonny follows the proposal:** B delivers the readable sentence with provenance
*Model proposal*, A stands beneath it as the evidenced statement, and a contradiction between
the two is marked.

| No. | Step | Size |
|---|---|---|
| 17.10 | **Built 27.09.2026.** **Path B into the Business view, path A as evidence beneath it, contradiction marked.** A model stage of its own, `statements` (a switch like `naming`, offered until 3.0 only with the workspace preview), triggered **only** through a button in Documentation, with the cost line before the click. The path is that of the naming stage: browser → `/api/gemini` (stage switch, missing key, own key, hourly limit per account) → `POST /api/projects/{id}/statement-proposal` with receipt; the route rebuilds the context from the stored source, refuses a foreign source (409) and an answer without a valid receipt (422) — since the QA review of 8f9ea35a000e also a receipt that `/api/gemini` issued under a stage other than `statements` (the stage is now part of the signed receipt), checks with `validateStatementAnswer` and stores via the Admin SDK under `projects/{id}/statement_proposal/current` — **never** in run, receipt, signature or audit pack, no rules change. Readers read, only the owner requests. The contradiction is checked deterministically by `lib/statement-contradiction.ts` at the anchors of the B sentence, on display, not stored. **Measured:** see below. | M |

**Result 17.10 (measured, 27.09.2026).** First the correction to 17.8: there it said
"B does not beat A — A stays alone", with 7 and 9 against 69 of 173. The measure was the
Dice measure from 17.5, calibrated on shortening and not on independent wording — it
measured **word choice**, not **content**. The closing sentence of 17.8 named that as a limit
and decided anyway; the blind rating by content reverses the result
(86.5 % against 10.3 % "same"). What remains right about 17.8 is the warning that a number
found after the fact must not *make* B the winner — here it was fixed beforehand
and collected blind, and it also measures the flip side: B invents
more (39 against 11 false statements). That is why A stands under every B sentence, and why the
marking.

**The contradiction module**, developed only on the learning half (`split.json → learn`), the
test half measured once at the end (`tests/prozess-benchmark/widerspruch.ts`). Hit =
target statements at which the judges gave B the defect `falsch` and one of the B sentences there
is marked; false alarm = marked B sentence at a target statement with verdict `gleich`:

| | hits "false" | forbidden conclusions marked | false alarms at "same" | marked in total |
|---|---|---|---|---|
| Learning half (100 cases) | 11 of 25 (44 %) | 4 of 12 | 7 of 1,580 (0.4 %) | 20 of 1,658 |
| Test half (100 cases) | **2 of 14 (14 %)** | **0 of 7** | **6 of 1,869 (0.3 %)** | 8 of 1,930 |

Read honestly: **the module is cautious, but it finds little.** The false alarm rate
holds on the test half (under 1 %), the hit rate does not — of the 11 hits of the
learning half, 5 come from one case (BM-012, five times `MESSAGE … INTO`), and on the
test half this pattern does not occur. Most false B statements are about content (an invented
"active" filter, a return code from the wrong call, `AT END OF` with an unreliable
field value) and cannot be caught by a rule without interpretation. **All 13 "false alarms"**
of both halves come from two rules whose statement **is true of the code**, but which the judges
rated inconsistently: `MESSAGE … RAISING` ("displayed" only if the caller does not handle the
exception — 5 times at a sentence rated false, 10 times at a
"same" sentence, 4 of them in one case, BM-199; therefore only *Not supported by the code*,
never *Contradicts*) and `RETURN`/`STOP` in `START-OF-SELECTION` with a following
`END-OF-SELECTION` ("the program is terminated" — 3 hits, 3 false alarms). The
`RAISING` rule **stays** (decision 27.09.2026): it says something true that the judges
mostly did not consider an error, and therefore stands only as *Not supported by
the code*.
The numbers are the status after the QA review of 8f9ea35a000e (before: 8 and 13
false alarms, hits unchanged): a named `MESSAGE … INTO` is no longer
marked if something else in the same block can produce output, `SELECT` no longer counts as
writing, and "display transaction" now only means a fixed list of SAP standard codes
— never a Z code. The test half was not used for development in the process; the
changes came from the findings, not from its numbers.
Measurement limit: the judge files carry, per B sentence, only the lines of its target statement, not
its own anchors; in the product the module checks against the anchors that validation left the
sentence. Four rules (`WRITE … TO`, persistence without a write statement, non-existent
exception, display transaction as "creation") fired on neither half —
neither hit nor false alarm; they come from the judges' findings on the engine sentences and
are tested with minimal ABAP of their own. **Not built:** "all/every" at `LOOP … WHERE`,
`CHECK` and an empty `FOR ALL ENTRIES` table — on the learning half there was not a single
B finding of this kind, and a rule without evidence would be guesswork.

**Cost per analysis.** The stage costs nothing until someone presses the button: one call
of `gemini-3.8-flash` per source, with the whole source text and its line numbers in the
prompt. Measured in 17.8: $3.80 for two passes over 68 cases, so about **3 cents per
call** at corpus size; larger sources correspondingly more. It does not count toward the five
analysis runs, but toward the account's hourly limit of model calls (20 per hour in
`/api/gemini`); with its own key the account pays itself.

**Open after 17.10:**

- **Language of the generated sentences.** Path A and path B both write German; ADR-009 requires
  English for generated content too. That applies equally to both paths and must be
  decided before 3.0 — the prompt, the engine's glossary and the rules of the contradiction module read
  German sentences today.
- **The contradiction module is a safety net, not a guarantee.** On the test half
  it marks 2 of 14 B statements rated false. A model sentence without a marking
  is not verified correct, but has merely not failed one of the rules — that is why
  the engine's sentence always stands beneath it.
