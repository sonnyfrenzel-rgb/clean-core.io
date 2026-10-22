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
| 0.10 | **Demo project for every account** (decision Sonny 15.09.2026, `DESIGN.md` §6.1.2): a fully played-through, clearly marked project from a real run of the eighth starter example `Z_MM_PO_APPROVAL` (Emergency purchase approval — the same case as in the mockups), **one** demo for all accounts (no copy per account, sign-up unchanged), usable without consequences — state only in the browser, "Reset demo", does not count against the quota. In the current product with the seven stages; with a recurring invitation to an example or own code (at most one per screen, never blocking). The tour with around twelve stations grows with the workspace (3.0.7). **Built 16.09.2026 (`dev`):** `/demo/{stage}` shows the seven stages on a real engine run over `Z_MM_PO_APPROVAL` — 25 findings at 31 places in the code with line anchors, Clean Core Score 28 (as of 24.09.2026, source `lib/demo-release.json`; at build time 30 and 43), the route with its assumptions, the constructs the engine explicitly did not assess; every number computed at runtime, so nothing goes stale either. Kept out of the trust chain structurally, not by flag: own route without a project document, without run, pack, export or model call, without Firestore write access, plus `assertNoTrustChain`, which throws at build time. The three stages that a model writes in a real run carry the deterministic half and say on the stage what the model part would add — writing convincing model text by hand would be the invention this product rejects. Usable without consequences (`localStorage`, "Reset demo"), one invitation per screen, in the dashboard as a marked entry above the project list. `tests/demo-project.spec.ts` | M |
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
| 6.1 | **Switcher Business · IT · Management** (always in this order, Business first and selected on opening; decision Sonny 15.09.2026). ~~In IT with focus Application · Solution · Enterprise~~ — **IT focus switch removed 02.10.2026, owner decision** (ADR-058): it changed nothing on screen, and 3.0 has no multi-project scope a Solution or Enterprise focus could narrow to (§8); an old link with `?focus=…` opens the workspace normally and the parameter is ignored. An idea for after 3.0 only if a solution/landscape view is ever built (§7). Held in URL and browser — not in the account, not in the project, not in run or audit pack. Plus **the three views in motion** in "New project" (`DESIGN.md` §6.1.1): one fact with a fixed anchor travels once through the three views, from the real run of the example, skippable, still under reduced motion. Below the switcher, per view, one sentence on which question it answers, with "About this view" (`DESIGN.md` §2.3) | M |
| 6.2 | **Layers:** Need & process · Standard fit · Costs & assumptions · Architecture & dependencies · Evidence & controls · Changes & commitments. A layer without content says so instead of inventing something (W22-A03) | M |
| 6.3 | **Overlays on the process model:** clean core level of the code behind a task, findings, usage (if imported) — presentation, not content; the level stays outside the signed audit pack | M |
| 6.4 | **Management view of the same project:** what is confirmed, what is missing, what a decision would bind; **Clean Core Score with rule version and history** — a history compares only runs of the same rule version — no portfolio. **The presentation of this view is step 3.0.10** (charts, overview screen, "not determined" as its own area): here the answers are created, there their form — whoever builds 6.4 reads 3.0.10 alongside, so that the figures carry from the start the coverage the chart must show | M |
| 6.5 | **Next step:** rule-based, the next open item with a reason, without a model call | S |
| 6.6 | **Search in the project** (⌘K) across elements, rules, findings, lines and glossary; **glossary at launch** per `DESIGN.md` §6.1 (SAP and product terms, source per SAP term), also in "Ask this case": technical terms with a popover, "What is …?" from the entry without a model call (decision 15.09.2026) | M |
| 6.7 | **Public cloud fit and four buckets:** which objects of the project have no path in Public Cloud (classic ABAP only) and thereby block the deployment decision; classification of every object into Retire · Keep · Rebuild · **No catalogued path** (no released API, no successor — with data basis and date; it is called "Blocked by SAP" only with a confirmed need, target profile and checked alternatives, CR-18) — the fourth bucket separates our own homework from SAP's roadmap. Derived from catalog and level, every assignment with evidence (feedback 15.09.2026). Rules per `DESIGN.md` §5.6 (decision 15.09.2026): dependent on the target platform; Retire only from a confirmed Drop; zero usage over ≥ 13 months yields a **Retire candidate** (open check) with source, period and capture type — a year change in the window is calendar information, not a captured year-end closing (CR-17); Blocked only for catalog objects without a released successor, modifications are Rebuild | M |
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
| 3.0.1 | **Switch for everyone:** every project opens in the workspace; the seven stages stay as tools. With the switch (decisions Sonny 24.09.2026): (a) the landing captures (`lib/landing-shots.ts`, `CAPTURE_LANDING` in `tests/capture-screens.spec.ts`) are re-recorded with a normal community account instead of the restricted admin account; (b) "Explore the demo" on the landing page leads to `/demo/workspace` (the workspace demo with the tour), and `lib/return-path.ts` allows `/demo/workspace` as the sign-in return target. **Built 02.10.2026 (`feat/3.0.1-switch`, local; ADR-061):** the switch, its route and the admin toggle are gone; every branch that read it collapsed to the workspace (workspace page, "My workspace" list, New project and own-code import, stage header and footer, shell path, starter examples, invitation, "Show tips again", the workspace's model stages); the stepper, its rail and the "Proceed to" footer are removed; a demo stage leads back to `/demo/workspace` (owner 02.10.2026). The old page's read-only announcements board is dropped (owner 02.10.2026: outdated) | S |
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
| later | **Everything public in the repository is current and in English — and only English** (decision Sonny, 30.09.2026, a condition for 3.0; moved to 3.0.15 beside Claude BYOK, owner decision 15.10.2026; out of 3.0.15 and without priority, owner decision 16.10.2026): README, CHANGELOG, ROADMAP, BACKLOG, ARCHITECTURE, SECURITY, DESIGN, the decision log, runbooks, plans, registers with prose, skills under `.claude/skills/`, `llms.txt`, code comments and test descriptions that are public, every other `.md`/`.txt` outside `docs/archiv/` — brought up to the 3.0 state *and* translated where they are German. Builds on 3.0.8 (inventory in `docs/registers/public-texts.json`). Exceptions, named and nothing else: the German privacy notice `app/datenschutz/de` (a legal text the German version of which prevails, E-7), archived documents in `docs/archiv/` (history, marked as such), and — decided by Sonny on 02.10.2026 — the frozen measurement material: the corpus and benchmark cases (`tests/korpus/`, `tests/prozess-benchmark/`) and the two judge briefs (`tests/prozess-benchmark/judge/richter-brief*.md`), because translating them would mean measuring again; the security and UX reports mailed to the owner stay German too (sealed, not public). Held by a guard that fails on German prose in public text files outside the exceptions. Done last before the release, after the other steps have stopped changing the documents | M |
| 3.0.15 | **SAP BTP, part of the SAP Business AI Platform** (owner decision 02.10.2026, ADR-064, replacing his decision of 30.09.2026; a condition for 3.0): SAP BTP is not renamed — the SAP Business AI Platform is the portfolio that bundles SAP BTP, AI Foundation, SAP Business Data Cloud and SAP HANA Cloud (SAP Learning, "Introducing SAP Business AI Platform"; external audit finding CNT-03). Visible product and public copy names the platform "SAP BTP, part of the SAP Business AI Platform" at the first mention on a page and "SAP BTP" after that; the side-by-side route reads "Side-by-Side on SAP BTP"; "BAIP", "formerly SAP BTP" and the spelled-out "Business Technology Platform" do not appear; a service SAP names with BTP (e.g. the ABAP environment) keeps SAP's name; catalog and engine data from SAP sources and stored route values stay unchanged. Held by a guard that fails on a bare "BTP", "BAIP", the 30.09 wording or the spelled-out name in visible copy. Runs before 3.0.14, after Block D and the landing parity work, so the copy is touched once | S |
| 3.0.16 | **Final external review before go-live** (decision Sonny, 01.10.2026, a condition for 3.0): shortly before the release a complete export of the release candidate (source, tests, workflows, every .md incl. ROADMAP, ARCHITECTURE, DESIGN, decisions, runbooks, plus a review guide and prompts for code, architecture and competition review) goes to Sonny for a large external OpenAI review on his own licence. Every finding that comes back is verified against the code like any model finding — fixed with a test, refuted with evidence, or refuted — before the release; security details stay out of public files | M |
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
| s4 IT · Findings & chain | IT focus Application · Solution · Enterprise — **not built: removed 02.10.2026** (owner decision, ADR-058; the mockup keeps it, see §7) | 6.1 |
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
| **3.0.5** | **Owner fix bundle** (decision Sonny, 06.10.2026 — everything planned for 3.0.5 before moved to 3.0.6): the target edition (Public/Private) is asked on every start screen and drives the first signed run and every view; the Transformation progress follows the real steps instead of standing at 95 %; German ABAP names shown in English with the original in parentheses; distinct labels for "back to the project" and "My workspace"; level A–D explained on hover/tap in the IT view; "Work from this process" made the prominent next step; "Back to top of section" fixed; the Management view rebuilt around the four options Keep · Rebuild · Move to SAP standard · Retire (chosen directly except Rebuild, distance from SAP standard for the target edition, effort and cost per option, steering one-pager); safe engine fixes from the MM case review if Sonny confirms the split. LinkedIn post and video stay unchanged |
| **3.0.6** | **Released as v3.0.6 on 09.10.2026** (920b78e, 098d164, eaa5ad0, 018e1e2; QA rounds 1b75c99, ce3b4a5 — round 3 clean); `firestore.rules` is deployed by hand right after the release · **First: two high findings of the QA full review of v3.0.5 (`4810125`)** — `dc6b0376a11c` (security; details stay sealed until fixed) and `00b028c43e63` (the In-App route rates a program whose only finding is `COMMIT WORK` as highly compatible) · **First look: no "Run the analysis" while the start run is signing** (owner, 09.10.2026): the project has no run until it is signed, so Next step in Business, IT and Management still offered "Run the analysis" beside the map's "Signing…" — and pressing it could start a second run. Next step now says the analysis is running and offers no button (`WorkspaceShell` marks the open Analyze step as running, `NextStepCard`/`ManagementExecutive` drop the button), and an automatic start that only waits for the model answer already counts as running (`hooks/useStartRun.ts`); source guard `tests/start-run-next-step.spec.ts`, E2E `tests/start-run-next-step-rendered.spec.ts` holds `/api/runs/create` · **Security hardening** (SEC-2026-728 to -744, §12) · **"Not determined" becomes open questions you can close — with less, not more** (decision Sonny, 06.10.2026): the engine answers what its catalog already knows (graded function-module calls), list output and macros become one "limits of this reading" sentence, phase progress stays with Next step, duplicates go; one "Open questions" list per project grouped by the action that resolves it (add includes, name a call target, add ATC results, choose the target, add usage data, confirm rules with the business), each group with an owner and one button; three end states — resolved by evidence, answered (self-declaration, shown as confirmed, never proven), accepted as known open with a reason — while the value itself stays "Not determined" and no bucket, level, score or route changes, nothing enters a signed run; everywhere else one line ("7 open questions · 2 block the decision · top: …"). Removed in exchange: the unused `GapsWorklist`/`GapsPrioritization`, the per-view not-determined side cards and folds, three separate groupers, the duplicate Analyze facet, the Management "constructs stepped over" figure, sentences that name inputs the product does not have. Needs an ADR (DESIGN.md §5.5/§6.1 name a side column per view) and Sonny's go for the grading step — given 09.10.2026; measured: demo and starter scores unchanged (demo 11 → 8 not-determined constructs), 93 benchmark files +5, BM-173 C → D, no frozen expectation touched; a noAPI call now raises a finding without a deduction — whether it should cost points is a separate rule decision (ADR-080 Need & process, ADR-081 open questions) · **Level chips explain themselves everywhere** (decision Sonny, 06.10.2026; IT and Management view ship in 3.0.5): the steering one-pager, the print sheet and the Analyze tables get the same hover/tap explanation (`components/cc/LevelExplained.tsx`) · **Need & process leaves the Business view** (decision Sonny, 06.10.2026): there it repeats the map's counts and only links back up to the map; it stays in IT and Management, where the process row and the rules editor live. Needs an ADR, a redirect for `?view=business#need` back links, Business opening on the map, the imported usage records shown beside the map (fixing the five-row cut that hides them today), and seven specs · **Left open by the 3.0.5 QA loop** (three rounds done): the target-change notice lists only tools made outdated by that change; generation-log rows keep the time they were written; a usage count counts only when finite and not negative; rendered tests for the IT-view level explanation (hover, tap, Escape) and for the own-code import's target choice; a compact print layout for the steering one-pager instead of printing it at 70 % · **A tab from the previous build says so** (decision Sonny, 07.10.2026): when the error boundary recognises two builds mixed in one tab (`app/error.tsx`, the stale-chunk patterns) and its one automatic reload is spent, it shows "A new version of Clean-Core.io is available" with a reload button instead of "Something went wrong" and the raw message — after the 3.0.5 deploy an open 3.0.4 tab read like a crash | M |
| **before 3.0.7** | **(2) and (4) done 10.10.2026 (3f47009a), shipped in v3.0.7; (1) and (3) open, they need Sonny:** (1) create a Google Cloud project of its own with the Gemini API enabled and a small budget/spending cap, create a key there, then set the GitHub secret `TEST_GEMINI_API_KEY` to it (`gh secret set TEST_GEMINI_API_KEY`) and put the same key into the local `.env.local` as `GEMINI_API_KEY` — until then the listed real-model specs still spend production's key; (3) give the weekly health check a way to read the cap and the month's spend (read access to the billing budget of `cleancore-491216`, or Sonny names where the figure is read from), then `scripts/qa/health.mjs` reports it · **Tests never spend the production model budget** (decision Sonny, 09.10.2026): on the evening of the 3.0.6 release production's model calls answered 429 "monthly spending cap exceeded" — production, CI (`TEST_GEMINI_API_KEY`) and local `.env.local` share one key of `cleancore-491216`, and about 270 calls that day came from test runs (six parallel CI shards since 3.0.6, plus local runs) against 4 from production. (1) A separate test key in its own Google project with its own small cap, for CI and local runs (Sonny creates the project and key; the secret and `.env.local` are switched afterwards); (2) the E2E suite calls the model only where a spec needs a real answer — every other model call goes through the gated test stub (`geminiTestStubActive`), and a guard counts the specs allowed to call the real model; (3) the spend cap and the monthly spend become visible in the weekly pipeline health check; (4) `concurrency: cancel-in-progress` per branch in the pipeline, so a newer push ends the older run instead of both calling the model — on 06.10.2026 34 pipeline runs, nine nearly at once around 11:20–12:05 UTC, made the cost peak of 06./07.10. (≈1,270 of 1,304 Gemini calls from test runs, ≈36 from production) | M |
| **3.0.7** | **Released as v3.0.7 on 10.10.2026** (engine 42368738, 841a91f9; views 60cd2f85; first screen 0c3184f2, 10f64f35; Documentation lean cbb114f6, reader structure d9118223, b92dc8c0; IT view 254ab06e, 69bb71a5, ba746443; decision conditions 254ab06e, a5e4b449; inputs ef2d95e0; Analyze 9220b85d; Private Edition release add9b4ec; My workspace 66a9a9a8; QA full review of v3.0.6 26fb3fef, 9af26a37, 0061b617, 0ef2828d; SEC-2026-751 to -755 78485894; plus the Documentation round 2, the view switch, the Management rebuild and the one-pager print, committed before the release); `firestore.rules` (SEC-2026-751/-752, the tenant access request and `extensibilityRoute` server-only) is deployed by hand right after the release — not before, since the v3.0.6 app still writes `extensibilityRoute` from Analyze's route switch · **Added on 10.10.2026 (decisions Sonny of the same day):** the Management view shows only its own content (ADR-087) and the decision's open conditions say what to do and link to the place, the need condition counting rules and decision points (ADR-085); the IT view shows only its own content with its own section bar (ADR-086); one way to decide, enter and take over, first block *honesty and safety* (ADR-083); the process description follows a reader's questions (ADR-084) with a chapter bar, a summary table in the appendix, two pictures from the engine and an owner-editable RACI; a view switch drops the places of the old view, keeps a subject and opens at the top; the steering one-pager prints on one A4 landscape sheet (ADR-088); Analyze declutter wave 1 (the route report survives a reload, one route card, no client-side route switch, no invented strategy sentence); the Private Edition release asked at the start; the row actions of My workspace named · **Done as planned:** **Engine: what the MM case review showed** (decision Sonny, 06.10.2026; the safe fixes — callbacks as call-graph edges, internal tables never a database effect, GUI navigation is not BDC, cut literals — ship in 3.0.5): batch input read field by field (program, screen, `BDC_FIELD` targets mapped to the DDIC table) so the effect becomes "changes the PO schedule-line delivery date (EKET) via ME22", graded as a write to that table with a domain-specific successor; classification rules from IF/ELSEIF or CASE chains that assign the same field (e.g. a traffic light) shown as a decision table and one business-rule task, with constants on the right-hand side counted as used; a CASE with more than two arms gives one row per arm, and user actions reached from a list callback are shown as alternatives, not as a numbered sequence; only an early end (EXIT/STOP/LEAVE, error message) ends the run, a normal block end continues with the next reporting event; user input that is read and then ignored, and dialog parameters of the wrong type, are flagged; the authorization check is assessed (only the LOW value of a range checked, display-only activity while the program writes, writes without a check); lanes named "User"/"System" from role evidence, not after a function module; a change to an internal table drawn as a plain step, never as a write with an SAP data store or as an effect (the 3.0.5 fix covers the call graph; changing the skeleton's node kind removed whole calculation routines from the shipped examples, so it needs the routine-collapse rule adjusted with it); `CALL TRANSACTION` without `USING` read as SAP GUI navigation, not batch input (changes score, routing and the demo); `I_CALLBACK_PROGRAM` resolved by the value at the call site (assignments before the call, `MOVE … TO`), not by a whole-source scan; data scope (WHERE filters), derived values and selection defaults reported. Each step measured on the 300-case benchmark under the freeze and holdout rules · **The first screen is named for what it is** (decision Sonny, 10.10.2026): the first look of a new project reads "Reading your code" while it builds and "Your process" on its card (`lib/messages/workspace.ts`), and a reader easily takes it for the Analyze tool and passes over it. It gets a heading of its own — "First insights into your process" or close — that says it is the first reading of this program, not the analysis; the same name in the tour, the coach mark and the way back to it, and nothing on it that looks like the Analyze stage header. Text and heading only, no change to what it shows; text guards and the first-look specs follow · **Documentation lean** (decision Sonny, 09.10.2026, from the research report of the same day — the tool is weak because it holds too much): (1) the duplicate blocks go — `HandbookDrawer`, the second key-figure row in `HandbookStage`, inputs/outputs under the map (the description keeps them), "rules outside the process" becomes a filter of the rules table; (2) one **Export** menu in the stage header (`components/requirements/ExportMenu.tsx`, as ADR-078) instead of seven buttons in three places — Word · PDF/print · Confluence · Markdown · BPMN 2.0 — and the PDF is the description itself, so `lib/brief/*` retires once nothing else reads it; (4) **first, as a bug fix:** Documentation stops writing its files into `generatedCode` (`addOrUpdateFileInWorkspace`, documentation page) — `hasGeneratedPackage` (`lib/workflow-steps.ts`) counts any file, so opening Documentation before Transformation can mark code as present (reproduce with a spec first; Delivery already adds both files); (6) section 9 of the description uses the one open-questions list of ADR-081 (`lib/open-questions.ts`) with its end states, in the exports too, instead of its own theme list; (7) one card for model proposals (SOP/RACI and business sentences, one cost line), and the SOP prompt no longer asks for KPI targets, control objectives or assertion methods — the inventions 3.0.5 removed; controls come from the engine's section, RACI stays a proposal, the call stays automatic on open (decision 03.10.2026). Needs an ADR amending ADR-068/077 · **Left open by the 3.0.6 QA loop:** QA 59842baa5efe — the map-follow fix is guarded at source level; a browser test that changes the hash while a frame is pending, written so it does not race (CLAUDE.md, "a test that waits for a window") | L |
| **after 3.0.7** | **(1)–(4) released in v3.0.10 on 11.10.2026 (97e32d14, 1793a6f4, 3173c476, ADR-092, ADR-093); (5), (6) and the rest stay open** · **Left for later from the 3.0.7 work** (10.10.2026): (1) **Analyze: the score as the hero** — the clean core score central on the Analyze page (the visual direction for the tools) needs a mockup first, no build without it; (2) **Analyze declutter wave 2** — the rest of the Analyze clean-up that wave 1 (9220b85d) did not take, scoped against the mockup of (1); (3) **IT: dependency graph** — objects and their uses as a graph beside the one table of ADR-086, read from the same inventory and line ranges; (4) **the cost revision bound into the decision** — the record names the Economics revision it was taken on, so the Costs row can say "priced on the revision of …" instead of "the decision does not record costs" (a5e4b449); open owner question: does a later cost change make a confirmed decision outdated, as a need change does (ADR-085)? — **built on dev, 11.10.2026 (ADR-092):** the confirmation records the revision beside the record, outside the fingerprint; owner answer: a cost change outdates a confirmed decision only when a different option is now the cheapest (5) **a separate test key** — part (1) of the "before 3.0.7" row, waits for Sonny; (6) **ADR-083, block 2** — the decision component: one *Decide* anatomy for the program decision, the rule answers (segmented control, saved per rule), the Design sign-off and the other ~35 places of the audit, *Recorded by* with name else e-mail, the texts of `DESIGN.md` §1.5/§2.6/§2.7 and ADR-059/079 rewritten to match; (7) **remove the unused layer code** — the Need, Costs and Architecture layer sections that Management and IT no longer render since ADR-086/087 (their models stay as long as the steering one-pager and the specs read them); count the callers first, guards that name the files follow | M |
| **3.0.8** | **Released as v3.0.8 on 11.10.2026** (05c98ef9, 1e6aefc8, 9355de5c; CI and QA rounds 46ad87a9 to 9bead6a6) · **SEO/GEO after 3.0** (decision Sonny, 10.10.2026 — the next release right after 3.0.7, ahead of everything else; from the SEO/GEO report of the same day on the GSC exports of 09./10.10.): rankings did not fall — average position rose from about 20 to about 11 since 31.08, AI-feature impressions rose fivefold — but clicks are about 1 % CTR and the head terms ("sap clean core", position 38–46) were never won; Gemini still answers with 2.x facts. (1) Titles and descriptions of `/sap-cloudification`, `/catalog`, `/abap-custom-code-analysis` rewritten for the searches that reach them ("cloudify SAP", "cloudification repository viewer"), saying honestly that SAP has its own viewer, ≤ 60/155 characters; (2) `/how-it-works` and `/knowledge` rewritten to the 3.0 chain (process as BPMN with line anchors → level A–D → decision → design, draft, tests → signed run), with `dateModified`/`softwareVersion` — both still describe the 2.x TypeScript/Node.js pipeline; (3) the two PDFs get a canonical header to their HTML page (or noindex), `/clean-core-explained` becomes the one "SAP clean core" page (shorter description, a definition above the fold) after checking its index status — it has had no impressions in three months; (4) a dated "Clean-Core.io as of v3.0.x" paragraph and a "what changed in 3.0" answer on `/facts`, in `llms.txt` and in the landing FAQ (landing change approved by Sonny, 10.10.2026); (5) the three cloudification pages stop competing (`/features/cloudification-catalog` hands over to `/sap-cloudification`), and the `/features/*` pages lose their 2.x framing; (6) `/method/levels` `dateModified` as an ISO date, overlong titles and descriptions trimmed; (7) an honest comparison section of ABAP static-analysis tools (OWASP ABAP scanner, abaplint, ATC/Code Inspector, SonarQube) on `/abap-custom-code-analysis`; (8) Organization `alternateName`/`knowsAbout` against the brand mix-ups (cleaning-CRM "CleanCore", NYSE ZONE). Then: Sonny requests re-indexing of the changed pages in Search Console; in about three weeks a Performance export with "compare to previous period" decides whether the landing description needs "ABAP code analysis" back. Done already (10.10.2026): GitHub description, homepage and topics set to the 3.0 positioning | M |
| **3.0.11** | **Our own errors from the CO review — first** (external review of the CO case on v3.0.10, 12.10.2026; owner decision the same day: these three before Claude, everything after moved back): the core calculation passed 11/11 tests and 25/25 withheld reference scenarios; what failed is ours. **F01 [P0]** the business documentation folds rules that differ in condition and effect (SECONDARY_LOCK with CONFLICTING_DRIVER, NEGATIVE_DRIVER with BELOW_PLAN, the CSV export with the demo text, PARTIAL_REVIEW with UNPLANNED_COST, ZERO_PLAN_ZERO_COST with ON_PLAN) — a fold keeps condition, action, entity, status and branch context unchanged or does not fold; the five pairs become the test. **F02 [P0]** the main path of the process documentation is linearised wrongly: demo and live data are alternatives before the shared calculation, authorisation belongs to the live branch, the export is optional. **F16** STATUS.md says "Not read — the process has not been reconstructed" while the reconstruction is there: *not detected, not read, open, approved, changed on purpose* are separate states, and the package exports a rule register (current meaning, proposal, decision, evidence, revision). **F03 (part)** the generic limit line "Master and credit data (CSKS)" — the wording follows the business object the table holds. **F13** a scope item the SAP list names otherwise (1EG = Bank Integration with File Interface, given for cost centre accounting) reads *mismatched*, not *not verified*: the check gets SAP's scope-item list. **F17 (part)** "Compliance Score" left in the business analysis — one name, Clean Core Score, everywhere. **F10 (final review)** STATUS.md infers "Synthetic/mock data only" from the absence of an SAP call — the engine takes any caller-supplied data, so the data mode reads *not recorded — supplied by the caller* unless a run recorded it. **Built in v3.0.11 (12.10.2026):** F01 (ADR-097), F02 for the documentation and the SOP, F16 with the rule register (.md and .csv), F03 limit line, F13 with public SAP Help sources, F17 and the missing score, F10; with it the "In short" row (ADR-098), the reading worker, the reopened workspace and the Business tool bar (ADR-099), Standard fit in IT (ADR-096) and SEC-2026-790. **Still open:** F03's second half (current master data versus validity checked at period end) | M |
| **3.0.12** | **Released as v3.0.12 on 13.10.2026** · **The generated code keeps the original's guards, precision and run binding** (external review of the CO case on v3.0.10, 12.10.2026; owner decision the same day: these three before Claude, everything after moved back): **F04 [P0]** the original's policy guards are carried over and checked before any calculation (duplicate receiver membership, a sender as receiver, quotas over 100 %, unknown segments, no receivers) — read from the engine's business rules and asked for as rule-traced cases; **F05/F08 [P0]** every input channel validates the same contract (context such as controlling area and year, uniqueness, finite numbers, completeness) — CSV and JSON alike, no `parseInt` acceptance of "2026x", no NaN thresholds, an empty request is not a successful simulation; **F06/F07 [P1]** rounding and precision as the original declares them (packed decimals with their places, commercial rounding for both signs; a ratio of six places stays six) — the engine reads the declared types and the code-draft rules and a lint hold them; **F09 [P0]** no global "latest result": every result and export is bound to an immutable run id with its selection and rule revision; **F11 [P1]** result and CSV carry run id, source revision, extract and rule revision — `SOURCE=SIDE_BY_SIDE` is an architecture, not a provenance; **F12 [P2]** engine and app factory without a server start on import. Levers: code-draft rules in the prompt, deterministic lints (global mutable state, lenient number parsing, start on import), cases derived from the original's guards and declared types. Also from the FI review (section 5), the same family: an option the original honours is honoured or refused, never ignored (`includeCredit`); *record found / not found* kept apart from *found but empty* (customer master, dunning data); the document status filter (`BSTAT`) in the data contract; date arithmetic in UTC (a local `setDate` lost a day at the switch to summer time); zero kept apart from empty (a credit limit 0); amounts with an explicit currency and precision contract. **Acceptance:** the CO review's E01–E18 probes and its 25 reference scenarios, and the FI review's checks (credit note 1900000018 stays UNKNOWN whatever the customer filter; one selection gives 9 items / 4,780 EUR in list, totals and CSV), run against regenerated packages. **Built in v3.0.12 (13.10.2026):** the code-draft rules and deterministic lints for guards, input contract, precision, run binding and start on import; engine cases from the original's declared types and checks; the failure-pattern library and acceptance harness; and, through the extension row below, an engine-written scaffold that carries guards, one input contract, declared places and a run store bound to a run id. **Still open:** the acceptance itself — the reviews' probe sets run against packages regenerated with a real model key (see *Left from 3.0.12*) | L |
| **3.0.12** (extension) | **Released as v3.0.12 on 13.10.2026** · **Engine-led transformation** (owner decision 12.10.2026: "we must use the advantage that we already know so much about the legacy program and write the code quite differently with that context"; design `docs/design/engine-led-transformation.md`, ADR-101 in force, design and mockup `docs/roadmap/transformation-generation-mockup.html` approved by the owner 12.10.2026). Four stages instead of one model call: **(1) platform knowledge** — a budgeted context pack from the tools before Transformation (rule decisions keep/change/drop/open, decision record, "In short" facts, released successors, NFRs, data mode, the original's contract; never Economics); **(2) a deterministic scaffold written by the engine** — types with the original's places and bounds, one input contract for every channel, guards with rule ids, a collision-free run store, app factory without a start on import, RFC 4180 CSV with formula guard, the test call contract, and one function stub per reachable routine with its ABAP lines and rule ids (RAP: typed CDS, one validation per guard, determinations, behavior pool, ABAP Unit skeleton); **(3) step-wise fills** — the model writes only function bodies, from that routine's ABAP lines, its rules and the facts, in small parallel calls (≤ 4 units and ≤ 14,000 characters each, ≤ 4 in flight, one lease of ≤ 48 calls per generation), spliced between markers and refused if a scaffold character moves; **(4) verify and targeted repair** — lints, engine cases and failure-pattern probes before storing, at most two repair rounds for failing functions only. Every function traceable to ABAP lines and rule ids in code, `traceability.json`, STATUS.md and the UI; nothing generated is signed; a changed rule decision makes the draft stale. **The generation screen** replaces the progress bar: the earlier tools as a chain in workflow order with this project's numbers, levels and links, then scaffold, fills and checks as they happen; **before the run** optional quality tips (open rules, requirements, NFRs, stale design) with deep links and a way back. Measured: 35/25/11/19 fill units for CO/PP/SD/PO, largest prompt ≤ 14 k characters (today ≥ 95 k on CO and PP). Built in four parallel tracks (context · scaffold · fills/verify · screen), then integration and acceptance. **Acceptance:** the FI, CO, PP and SD probe sets of the 3.0.12 row pass on regenerated packages; generation time, median of three runs, not worse than today's on the CO, PP, SD and PO demo sources. **Built in v3.0.12 (13.10.2026):** all four stages and the generation screen; checks counted as passed, failed and not run and split by engine-written code and written functions; the engine and probe passes confined in SES (runner protocol 3); with it the DSAG ABAP guideline review (on-stack routing, new findings, level wording, RAP scaffold v2 with abaplint under ABAP Cloud, Clean ABAP rules and abapGit metadata files) and the SAP reference work (identifier check with source levels, six weekly-synced sources with licences and a citation registry). The single call stays as the fallback in the page. **Still open:** see *Left from 3.0.12* | L |
| **dropped** | **Dropped (owner decision 13.10.2026: not feasible for us and not worth it — no research, no build).** ~~**The customer's own SAP reference data via Open Resource Discovery (ORD)** (owner decision 13.10.2026: "das müssen wir gründlich untersuchen" — investigate thoroughly before anything is built). Today an SAP name the model writes is checked against general lists (curated SAP pages, SAP-docs CC BY 4.0, the Cloudification Repository, the owner's curated lists): they say *exists at SAP*, not *exists in this customer's system and release*. ORD (open standard, specification on GitHub under `open-resource-discovery`) lets a system describe its own APIs, events and entity types with version, release status, deprecation and successor. **Research questions, to be answered with sources before a design:** (1) from which S/4HANA releases and in which editions (Public, Private, on-premise) an ORD document is available, and how a customer exports it — checked by hand or with SAP's written answer, never by scripted access to SAP websites; (2) what the document holds that our check, Design and Transformation need (API IDs, communication scenarios, release state, successors) and what it lacks; (3) data protection: what an ORD document reveals about the customer's landscape, where it is stored, who can read it under sharing; (4) upload versus a live fetch through the S/4 connection — upload first (no credentials, no connection, bounded downside); a live fetch only after SEC-2026-018 is decided. **If the research holds:** a new top evidence level in the identifier check ("exists in your system, ORD of release X") above SAP page and SAP-docs; the customer's API list as context for Design and Transformation; a deprecated API flagged with its successor; Delivery records the ORD stand the package was planned against. Size: research M, build L.~~ |
| **after 3.0.12** | **(3) and (4) built in v3.0.13 (dev 13.10.2026; 2e200605, a702ac45); (1) built in v3.0.13 as the acceptance suite (f237a2cc, 3eba75ee; real-model runs on the owner's machine 14.–15.10.2026); (2) stays open — row "First import into SAP" below** · **Left from 3.0.12** (deliberately, 13.10.2026): **(1)** acceptance with a real model key against the external reviews' probe sets on regenerated packages, and the generation-time comparison on the CO, PP, SD and PO demo sources; **(2)** importing the generated abapGit package in a real SAP system — the files are format-checked against abapGit's serializers and SAP's ABAP file formats, not import-verified; **(3)** the Transformation phase goes stale on a changed context digest (today only the Built-on card marks the changed tools *Stale*; `staleness()` reads the project document alone); **(4)** probes that reach the written functions — display filter, additive recalculation, negative write | M |
| **3.0.13** | **Released as v3.0.12 on 13.10.2026 (moved into 3.0.12)** · **Design reasons with SAP's standard, not past it** (external review of the CO case on v3.0.10, 12.10.2026; owner decision the same day: these three before Claude, everything after moved back): **F14** the design compares standard, RAP and CAP concretely before ruling the standard out — here SAP's allocation test runs without journal entries — and a file upload alone never forces CAP (RAP large objects exist on S/4HANA 2022); the comparison names target release, fit-gap, effort, running cost and data contract; **F15** plan and actual are not both put on ACDOCA: a release-bound source matrix (actual ACDOCA, plan ACDOCP or BW, as configured), with the currency contract of the controlling area; **F17 (part)** the decision record and the cost revision it names are exported together so a reader can follow which revision priced the decision. From the final review: the standard comparison also names SAP's "Import Allocation Data – Values"; statistical key figures are sourced apart from plan (FINSSKF, not ACDOCA); an app ID is bound to the target release (F3338 and its newer F3338A are both right for their releases); and the decision's reason may not be circular ("CAP because the target architecture is CAP") — it names the requirement the other options miss. **Status: moved into 3.0.12, owner 12.10.2026; built:** a frontend file upload or download is never a route driver from engine 3.0.12 (runs signed earlier keep their rule), upload and download said apart, WS_DOWNLOAD/WS_UPLOAD in the detector (300-case benchmark: no route changes — both file cases also carry BDC — and their rationale now names the BDC instead of the file sentence); the design prompt compares standard, RAP and CAP on engine option facts with a release-bound data contract (actual ACDOCA, plan ACDOCP or the planning source as configured, statistical key figures apart, currency named), shown as a proposal, a circular reason refused; `docs/cost-revision.md` in the delivery package; `standardFitAssessed`/`decisionOnRecord` in `lib/standard-fit-gate.ts` for the warning tip and the context pack. Not built here: naming "Import Allocation Data – Values" and release-bound app IDs (the SAP identifier checks) | M |
| **with 3.0.11–3.0.13** | **What makes the advantage hard to copy** (external positioning review of 12.10.2026 after the FI and CO exercises; owner decision the same night): BPMN from code, generated documentation, RAP/CAP drafts, a score and a staged workflow are no longer unique — SAP's Fit-to-Standard Analysis Agent draws BPMN from code, Panaya's agentic correction frames correct/replace/redesign/retire. What is hard to copy is three things together: **(1) a meaning-true business model** — condition, effect, exception and limit survive every view (3.0.11 is its first test); **(2) a library of known failure patterns** with expectations from sources independent of the code reading — the same total with a wrong distribution, a classification that depends on a filter, negative rounding, missing versus zero, conflicting master data, a stale revision — generic checks every generated package is run against, seeded with the FI and CO findings; a test derived from the same interpretation as the code shares its error; **(3) a change chain on rule level** — a rule whose decision changes marks the cases, the code places and the drafts that rest on it as *to be checked*, as artefacts already do. **Positioning and texts** (landing, whitepaper, llms.txt, FAQ): "Understand your custom SAP process. Decide what should remain. Verify what changes."; the first audience is SAP architects, internal modernisation teams and specialised consultants — business readers come with them, not alone, until 3.0.11 holds; no savings or accuracy-on-real-code claims; BPMN from code is no longer called a distinction; the whitepaper's "others explain or rewrite, we connect both" is narrowed; and, open since the 01.10. analysis, the site title drops "SAP" from the product slogan ("Free SAP Clean Core Accelerator" → "a clean core accelerator for SAP custom ABAP"). The portfolio (3.0.20) is framed as triage — which programs deserve a decision dossier — not as an estate transformation. Integration stays files only and read-only MCP (owner, 12.10.2026) | M |
| **with 3.0.12–3.0.18** | **The PP review — a third case, the same classes of error** (external review of a PP/MM case on v3.0.10, 12.10.2026; verified against the 3.0.11 candidate: no finding refuted; the core calculation matched 26 of 26 withheld scenarios). Fixed in 3.0.11: the rule folds (F04), the score name, the master data line, the main-path order; the data-mode sentence and the author's heading in any case were corrected before release. **Into 3.0.12:** exact decimal arithmetic for packed quantities (binary floating point changed statuses at 0.3 kg), collision-free run ids that never overwrite a run, the original's CSV escaping and formula guard, upper bounds and invalid dates refused, a display filter honoured or refused (F07), importing the module never starts a server; the PP acceptance set (E01–E08, A01–A14, 26 reference scenarios) joins 3.0.12's. **Into 3.0.13, first:** the router's rationale no longer forces CAP from a GUI file feature (`lib/abap/extensibility-router.ts`) — our own sentence, in every package so far; a title check for every SAP identifier (app IDs, scope items, communication scenarios, API with protocol and release), "name found in the catalog" instead of "verified" for a name-only hit, and AUFK mapped by context (production order when AFKO/AFPO/RESB are read); one cost statement per export, and "handed over" counts the delivery package's export too. **Into 3.0.18 (was 3.0.19; quality release item 5, owner decision 18.10.2026):** failing cases carried into the package's test detail; test lints — a negative test breaks exactly one rule, an exclusion test makes the excluded input necessary; the original's in-code demo cases become cases, or STATUS names the reduced demo scope. **Into 3.0.18 (was 3.0.20; quality release item 8, owner decision 18.10.2026) (P1):** a routine that sets a fatal or status flag the main path checks is a step with an error effect; a routine performed from the main event block is a step unless it only clears; event callbacks (USER_COMMAND) are side paths, never the tail of the main path; a bare keyword is never a step name — measured on the 300-case benchmark. **Failure-pattern library, seeded now:** the 0.3 kg case, two runs in the same millisecond, one rule that differs in meaning — patterns seen in FI, CO and PP alike (identifiers, architecture from a file detector, lost guards, precision, run identity, compute versus display scope, self-contradicting export metadata, short forms that change meaning) | M |
| **with 3.0.12–3.0.18** | **The SD review — a fourth case, and the gap moves from traceability to meaning** (external review of an SD order-processing program on v3.0.10, 12.10.2026; verified against the 3.0.11 candidate: 33 findings, none refuted; STATUS, the decision record and the line anchors held). Corrected in 3.0.11 before release: a CASE without WHEN OTHERS reads as one choice, one rule count per document, a structure include stays in the appendix, "In short" leads with what the program shows when its changes run only on a user's command, and an author's claim the check cannot read is not quoted. **Into 3.0.18, first (was 3.0.20; quality release item 8, owner decision 18.10.2026) (P1) — effect analysis:** a BDC that fills only key fields and OK codes opens and saves without changing a field; `UPDATE … SET f = wa-f` with `wa-f` unassigned since the read writes back what it read; a write path whose precondition state is unreachable in a mode is dead there — this changes the decision itself (retire or move to standard instead of rebuild) and feeds the 3.0.13 route. Also P1: `sy-subrc` read after an unrelated statement (a lint and a correct statement); COMPUTE, ADD and SUBTRACT read as derived values and promoted to rules on output fields. P2: the early-exit guard for FOR ALL ENTRIES; WS_DOWNLOAD/WS_UPLOAD in the GUI detector and a finding never doubles as an unassessed gap (measured on the benchmark, it moves the score); the rule register counts business rules, not constant declarations or OK-code arms. **Into 3.0.12 (P0):** generated code never claims an integration it lacks — class names, success messages and comments naming SAP APIs, events or logging the code does not perform are refused; an event publisher only where no standard event exists, never in SAP's namespace; dependencies follow the import graph; the SD probes (rounding at 0.70, a recalculation that adds rather than recomputes, a negative PATCH, an empty selection) join the acceptance set. **Into 3.0.13:** the API catalog refreshed and stamped; DDIC field meaning (target quantity is not order quantity; a read that overwrites a filled field); model line references checked against the engine's anchors or dropped. **No rebuild gate (owner, 12.10.2026, revising the same day's decision: a gate takes the decision away from the user):** the Transformation's quality tips open with a highlighted, non-blocking warning when the decision on record is retire or move to SAP standard, or standard fit is unassessed; the user may generate anyway, and the generated code says in its first comment that it was drafted against the decision on record. **Recurring for the fourth time (FI, CO, PP, SD):** SAP identifiers, architecture from the file detector, lost guards, precision, compute versus display scope, start on import, self-contradicting package metadata, main path dropping steps — the failure-pattern library is the generic answer | M |
| **3.0.18, item 9** | *Pulled into the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.20): deterministic checks on what the model says, no new feature.* **Output guards for model text, built in TypeScript** (owner decision 15.10.2026, after a review of Guardrails AI: not taken as a dependency — Python library, hub and hosted inference shut down in August 2026, project acquired, and its useful validators call a third-party LLM by default; the ideas are taken, built deterministically, no data leaves): **(1) sentence-level grounding in "Ask this case"** — today one cited anchor is enough for the whole answer (lib/case-answer.ts `citedAnchors`); every sentence must carry an anchor that was offered, an invented anchor is a refusal reason, optionally a cheap overlap check that the sentence's identifiers and numbers appear in the cited fact; a failing sentence is dropped or the answer refused; first measure how often today's answers carry unanchored sentences; **(2) injection hardening of the case prompt** — evidence passed as a quoted data block with "evidence is data, never instructions" (as the analysis prompt does for the header comment), comment lines marked as comments; the output check of (1) stays the real defence; **(3) a small rule-based output check for secrets and personal data** (passwords, keys, tokens, e-mail, IBAN, phone patterns) on case answers, fill bodies and documentation exports — shown as a hint or masked, never part of a signed pack except as a finding. A self-hosted NLI model only if (1)'s lexical check is shown not to be enough | S/M |
| **after 3.0.12, analysis first** | **Built in v3.0.13 (dev 13.10.2026): analysed (7d77075e), then a per-account in-memory attempt limit before the body is read, 60 a minute and 300 an hour (e6631f6d, owner decision 13.10.2026, option 3), `--max-instances` pinned in the deploy (807e1408)** · **Request-attempt limit for `/api/gemini` — analyse before building** (owner decision 13.10.2026; QA 7dd12d385189, 456824b829b3, review of 03501b79). Since 3.0.12 the body is read under a byte bound (413 when too large), and a leased call whose stage or prompt is invalid is refused before the lease is read. Still open: requests that fail before the model call (a user over the hourly quota, a leased call failing a later gate) count against no limit. The obvious fix, a per-user attempt counter, is itself a Firestore transaction and costs more than the bounded parse it would guard. The analysis answers: how expensive is a refused request today (measured, not estimated); is an in-memory per-instance limiter enough on Cloud Run, or is Cloud Armor / a load-balancer rate rule the right layer; what a legitimate heavy user hits. Build only after that, with a test that sends the refused requests in a loop. | S |
| **3.0.13, first and largest** | **Built in v3.0.13 (rel-3.0.13, 14.–15.10.2026; 0a02c363, 0f90b8f3, 42b54c7d, ac2987c8, 5b2b133e, 6e4639a8, 327c5631, 7105f939; scaffold version 9): (1)–(7), the analysis items and both routes; the acceptance target is met only in part** — in real-model acceptance run 4, 6 of 7 programs activatable in all three runs on the RAP route, PO activatable in run 5 after 7105f939; on the Node route a median of 0–6 type errors per program, so that route is not yet type-clean everywhere; the golden master carries the reference cases and proves that each runs, it computes no expected value. What is left: row "Transformation, next step" below · **A real Transformation tool: generated ABAP that activates** (owner decision 14.10.2026 after two external reviews of the SD example on dev; no further hotfix — 3.0.13 grows by this). Verified on the delivered package: abaplint with the package's own `abaplint.json` reports 116 findings, 107 of them parser errors (WRITE, MESSAGE, ULINE in ABAP Cloud), while STATUS said "abaplint: 13 reported" and "complete"; the logic calls 12 access methods the interface does not declare; the bodies are the old FORMs (globals such as `gt_claims`, `p_org` used 23 times, selection fields renamed in the type but not in the bodies); quantities compared as strings (record components typed as text in the contract); guards generated but not called; the live-probe lock left the logic path; a read-only simulation became a managed BO with a persistent union table that cannot hold quantities or unit conversions; 40 of 45 engine tests are `skip`, the other 5 do not call the code; TRACE points at TypeScript files. **(1) Honest status first:** before the package is stored, abaplint runs with exactly the configuration we ship, parser and syntax against our own objects; with an error the generation reads "generated, not activatable" with the counts from that run, the raw findings go into the package, and Testing cannot be closed. **(2) A typed contract before any fill:** signatures from the FORM interfaces (USING/CHANGING), a state with the real business structures (claims, policies, conversions, events, effects, results, groups, run context), selection fields under their names, types kept numeric, the access interface generated from the calls the logic needs; the scaffold activates before it is filled. **(3) Fills against the contract:** the request names the class's attributes, types and the access methods; WRITE/MESSAGE/ULINE are refused and become result structures or exceptions; after every fill the syntax check runs again and its errors are the repair round's reason. **(4) Guards in the logic path:** every guard of the original is executed where the original executes it (or inline-equivalent), never only as a save validation; selection-screen checks become query parameters; a safety lock never leaves the logic path. **(5) Architecture follows the program:** a read-only or simulation program becomes a custom entity with a query provider (and an explicit action where the design says so); a managed BO only for real write paths; the data model normalised per source structure, never a field union. **(6) Golden master:** demo and test cases of the original are carried over as ABAP Unit test data; a test that does not call the code under test, or only skips, does not count; testing-model tests are checked against the class's declarations. **(7) Trace and manifest per route:** ABAP paths on the ABAP route, "implemented" only for code that is not a stub or an unbound access. **Acceptance:** the SD example (ZSD_RETURN_CREDIT_RECON) generates with 0 parser and 0 local syntax errors under the shipped config and its reference cases pass as ABAP Unit data; the PO, CO, PP and FI demos regenerate without regression; LOW against default thinking is re-measured with this gate as the metric (the 13.10. A/B measured usability with guards that did not see these defects). **With it, in the analysis:** rules in the header comment become register candidates; a constant gate (`IF <constant> <> 'X'. MESSAGE E`) marks the code behind it unreachable and "In short" does not describe it as the main path; demo switches are not business rules; a header that excludes postings is not read as claiming one; a three-state flag is explained with its allowed values; template remnants ("Node.js" in a RAP design), a circular decision reason and the MVCC snapshot promise are removed. **Both routes, owner decisions 14.10.2026:** the Node/side-by-side route gets the same treatment — a real type check of the candidate, "complete" only with zero type errors and cases and probes actually run, typed records per source structure instead of one field union, the original's cases as fixtures, prompt bundling instead of cutting at 14,000 characters; **the side-by-side route becomes real CAP in two steps** — first the strong Node core, then a CAP shell around it (`@sap/cds`, a service definition with an action for a simulation, handlers delegating to the core, a data model per source structure, a remote-service access layer on released OData APIs with mock data, `mta.yaml`; checked with `cds compile` and the type check, the core tested in the sandbox); **an acceptance suite with a real model key** runs before every release — the external reviewers' scenarios (CO, PP, FI, SD, PO; PM as holdout) as data, every demo generated end to end with the real model, gate result, reference cases matched, duration and cost per program, median of three runs; concurrency stays at 4 (since thinking LOW a SD generation takes about 2 minutes) | L |
| **3.0.13** | **Built in v3.0.13 (a8d4f222): the progress card, the ceiling following the model-call deadline (+15 s), large programs written in parts; the thinking level stays the provider default until measured** · **Documentation says what it is doing and how long it takes, and finishes on large programs** (owner, dev acceptance 14.10.2026): opening the Documentation tool can sit for a while with nothing visible happening, and a reader cannot tell whether it works. Same pattern as the other tools: from the first moment the tool says what it is doing (reading the signed run, writing the document with the model, storing it), shows the stages as they run, an expected duration before a model call and the elapsed time while it runs, and a clear end — written, failed with its reason and *Try again*, or nothing to write and why. No silent wait longer than a second; a rendered test with a delayed model answer proves the stages appear in order. **And the business layer (SOP and RACI) finishes on a large program:** on the SD example it stopped with "the model did not answer within 90 seconds" (`BUSINESS_LAYER_CEILING_MS`, set when Cloud Run cut requests at 120 s — since hotfix 2 the service allows 900 s and one model call 270 s). The ceiling follows the model-call deadline, the call thinks at the level its measured size needs, and a program too large for one call is written in parts; the SD and PO demo sources are the acceptance cases | S/M |
| **3.0.13** | **Built in v3.0.13, all twelve (3266cefa, 68c80af5, df07ef67, 2e200605, fc9edb1d, 473a0e00, 3585a4db, 487ce2e3, dcada850, 3026f01a)** · **QA leftovers from hotfix 2** (QA reviews of 6500c65c81c7, 353f5dd98c12, 4459238f2ef0 and 9056c6a018b4 on 14.10.2026; verified, confirmed, present since 3.0.12 or hotfix 1, not introduced by hotfix 2; owner decision 14.10.2026: they ship with 3.0.13): **(1)** a file-name validation call counts as validation only when its failure is handled (`lib/abap/security-review.ts`), and a `sy-subrc` that is only copied does not count as evaluating an authority check; **(2)** a lease is usable only after its hourly charge succeeded — a concurrent retry of the same run may not reuse it in between (`app/api/transformation/lease/route.ts`); **(3)** the route rationale names a standard write and its remedy also when an outbound RFC drives Side-by-Side (`lib/abap/extensibility-router.ts`); **(4)** a non-packed local shadows a packed global of the same name in the original contract (`lib/abap/original-contract.ts`); **(5)** RESB beside AUFK alone is not a production order, AFRU joins the production-order tables (`lib/abap/sap-api-catalog.ts`); **(6)** the IDoc sentence does not attribute SAP's classification to customer-namespace modules (`lib/abap/code-assessment.ts`); **(7)** no *proposed* chip on an empty or unreadable option comparison (`components/design/OptionComparison.tsx`); **(8)** curated successors carry their review stamp on the architecture canvas; **(9)** the Built-on card compares every stored fact, not the first (`components/transformation/BuiltOnCard.tsx`); **(10)** a tainted name overwritten by a constant before a dynamic clause; the Dynpro level wording against high criticality; **(11)** guard tightening without user effect: dsag-citations exact match, engine-version-callers scope and forwarded wrappers, generation-follows-contract identifier aliases, sap-references malformed prefix comments, a route-level model-deadline test, a concurrency group for sync-sap-references.yml. **(12)** from the review of 9056c6a018b4: Cancel also aborts a pending contract read (pass the signal to `fetchGenerationDecision`; the lease request stays un-aborted so its answer can be closed), and *Generate* waits until the preflight plan has loaded. A test that fails without the fix for each of (1)–(10) | M |
| **3.0.13, verify first** | **Verified in v3.0.13 (ef7a5777): `docs/design/abcd-vs-atc.md`, the expected ATC message beside the level ("ATC expected: … priority n" or "ATC: not determined"), the customer's own enhancement point no longer D; no grade changed — the change of decision §9 No. 18 waits for evidence (row below)** · **Level C/D against what ATC reports** (owner decision 14.10.2026): today an object flagged *not to be released* grades D, a *deprecated* one C or D (`lib/abap/abcd-classification.ts`, ARCHITECTURE §4.2, decision §9 No. 18), and the D card says "Priority 1 · error". If SAP's clean core ATC check reports such objects as a warning or information, or treats an object that is both *not to be released* and a classic API as B, our text contradicts the customer's own check tool. **First** verify against SAP Note 3565942 and the clean core ATC check variant, object by object for the overlaps (not-to-be-released + classic API, not-to-be-released alone, deprecated with and without successor); **then** put decision §9 No. 18 to the owner again. Either way the grade and the expected ATC message are said apart ("Level D · ATC reports: …"). Also verified in the same pass: forms and ALV output (SSF_FUNCTION_MODULE_NAME, OPEN_FORM, REUSE_ALV_GRID_DISPLAY — absent from the classification file, so graded C by the residual rule), user and customer exits, SUBMIT of an SAP program the catalog does not list, a table used only as a type, and *released* meaning system-internal use (C1) as opposed to remote use (C2) — a side-by-side option never reads C1 as *remotely usable*. **And a suspected defect, checked first:** every `ENHANCEMENT-POINT`/`ENHANCEMENT-SECTION` grades D, also inside a Z program, where it is the customer's own enhancement point with no SAP coupling. A change of grade is engine-version gated; signed runs keep theirs | S/M |
| **after 3.0.18, first** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15).* **"Back to SAP standard" becomes decidable — compact, one card** (owner decision 14.10.2026: the largest gain; built tight, very well visualised, no feature creep). Today the standard option always reads *not determined* and points to the Business view. **What is built, and nothing more:** in the Business view one card "Could the standard do this?" with three answers, each one click or one line: **(1)** what the process is — commodity · differentiating · required by law or industry · new; **(2)** can the gap be closed by configuration or an SAP industry solution — yes · no · not known; **(3)** what would be lost in the standard — one sentence, optional. Under the answers, the engine's evidence as chips with line anchors: **standard candidates** read from the tables and calls (a curated, SAP-sourced map, e.g. credit limit tables → SAP Credit Management, own release logic → flexible workflow, condition contracts, product master), always worded *candidate, check*; and **compatibility scope** — the program runs on functions whose use rights are time-limited (dates verified against SAP's compatibility scope matrix before any date is shown). **The result** is the existing standard option card turning *for*, *against* or staying *not determined*, with the answer that decided it named — commodity + configurable → for; differentiating or required by law → against; no answers → *not determined* as today. Answers are project inputs in the signed input manifest (not roles), shown in all three views; Management sees one line. Optional on *keep*: "bridge until SAP closes it" with a review date. **Not built:** workshops, weights, a score, a questionnaire beyond three answers, process-mining tools. Measured: with no answers every signed run and the 300-case benchmark stay identical; a test per mapping; the card is checked against the mockup and on a phone before release | M |
| **after 3.0.18, second** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15).* **Staying clean — a decision that comes back when SAP or the code moves** (owner decision 14.10.2026). Today keep and rebuild are end states. **(1)** A decision records the SAP objects that block the standard (no released successor, Level C/D); when the weekly catalog sync reports a released successor or a release-state change, the project shows *decision to review* — the signed run stays as it is. **(2)** The delivery package gets an upgrade checklist per C/D object: what to check at every support package and with which test; for an implicit enhancement also an order test (the logic may run at a shifted position after a support package and nothing warns). **(3)** The exception record per C/D dependency: options considered and why they were dropped (from the engine's option signals), the kind of reason (law · industry · differentiation · none, said openly), and three reasons that do not count (small impact, time pressure, "too complex"). **(4)** Keep means maintenance: a re-analysis of a *keep* project whose code grew (new writes, new SAP objects, new decision points) says so in the run comparison. Deterministic except the reason kind; no boards, no mandates, no portfolio score | M |
| **after 3.0.18** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15).* **Small engine rules and package artefacts** (owner decision 14.10.2026), each engine-version gated, with a test that fails without it: **rules —** VOFM routines (condition, value formula, copy requirement) graded B as a technique, objects graded apart, not available in the public edition; ODP extraction called by RFC is a breach of SAP's API policy, not only Level D; a direct write to a standard table names what it skips (documents, valuation, accounting — a curated map); a standard table with an organisational field (company code, sales org, plant, purchasing org) read without an authority check on it (the original may show too much; a rebuild on a released CDS view shows a restricted user fewer rows — a test case); personal data written to a Z table asks for a deletion/blocking rule; workflow start and release-strategy reads point to flexible workflow; successors for number ranges and the factory calendar; `SELECT SINGLE` without the full key or `UP TO 1 ROWS` without `ORDER BY` (results may change on another database — and the test expectation says so); `JOB_CLOSE` joins the UTC rule; two statements per program — *runs after conversion* apart from *clean* — and the upgrade adjustment that returns every release (SPDD, SPAU, SPAU_ENH). **Package artefacts (built) —** an interface inventory (kind, direction, target as far as literal in the code, released-API candidate, what must be created by hand in the target system); ATC setup notes, and on ATC import a hint when the check variant still shows the old model; "before you import" for RAP (software component, packages, usage logging); a clean-up list. **For business readers, checked first** (owner 14.10.2026: does it make the Business and Management views clearer for a business reader, or only longer — decided on a mockup before anything is built): technical debt typed (code, architecture, process, data) with its business effect, no money; the standard-fit figure renamed *technical fit (SAP objects)*, apart from the process question; level, decision and reason carried onto the tasks of the BPMN export | M |
| **3.0.19 — released 21.10.2026 (figures in the CHANGELOG)** | *Released with the owner decisions of 19.10.2026 (recommendation key user for a whole key-user program, score unchanged with Level A beside it, the key-user checks recorded as a self-declaration, split programs build only their code parts, key user as its own cost option, a key-user row in the decision record, the example in "Next", limits 20/40) and the note that a company may restrict key user (owner 21.10.2026). Two QA notes of f6b07e692346 (442c3294dcf2, 7223a86eee7f) go to 3.0.20.* *Owner decision 18.10.2026 — scope from the owner's book summary: Custom Fields and Logic, Custom Business Objects, Custom CDS Views, Custom Analytical Queries as the key-user tools the router can name and the example shows; the next release after the 3.0.18 quality release — a cleanly tested example of its own and the logic of key-user extensibility brought onto the platform (was after 3.0.15, then after 3.0.18).* **Key-user extensibility as an option for small changes** (owner decision 14.10.2026). Today the key-user checkpoint is always *neutral* and every route ends in code (RAP on the stack or CAP beside it); a small change that SAP's key-user tools cover is sent through a developer build it does not need. **The engine names key-user candidates from the code:** an added field on a standard object (Z fields in an append or include → custom field, with the business context it is needed in); logic in a BAdI implementation that only checks or derives values, without writes, external calls or a commit (→ custom logic in a released key-user BAdI); a reading list or report (→ custom analytical query or custom CDS view on a released view); UI-only changes (field hidden, renamed, made mandatory → adapt UI at runtime); a small own table of settings (→ custom business configuration) or of master data (→ custom business object). **Each candidate is said with its limit**, never as a promise: the key-user BAdI or the view must be released for key-user use in the target edition and release (from SAP's synced catalog where it says so, otherwise *not determined* with the check to make), and the moment a candidate needs a write, an external call or more logic than the tool allows, it leaves the key-user route. **Key user becomes a fourth option** in the design comparison (standard · key user · RAP · CAP) and a target route the decision can choose. **Its output is a step list, not code:** which app (Custom Fields, Custom Logic, Custom Analytical Queries, Custom CDS Views, Adapt UI, Custom Business Objects/Configuration), which object and context, which fields and rules — each step anchored to the ABAP lines it replaces — and how to test it; the delivery package carries it as a document. **When the decision is key user, the Transformation tool does not generate code:** no scaffold, no model fills, no lease — the tool stays in its place in the tool bar (one order from `lib/workflow-steps.ts`, seven tools for every project) but shows the key-user step list instead, built by the engine; Testing turns the same steps into acceptance checks a key user runs in the system; Economics prices configuration effort, not a build. A program whose parts split (some key user, some code) generates code only for the code part. Level A by construction, which the score says. Engine-version gated, a test per candidate kind, and the 300-case benchmark reports how many programs, or parts of them, the key-user route would cover | M/L |
| **after 3.0.18** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15).* **The placement decision, explainable step by step** (owner decision 14.10.2026; the form is open — a tree, a checklist or the existing rationale extended; what matters is the content). The route today is decided by one engine driver (an outbound RFC) and the key-user checkpoint is always neutral. Content to add: **(a)** the questions code cannot answer, asked of the user and bound into the signed input manifest as project inputs (not roles): consumers without an SAP user or a native mobile/offline UI; a solution offered to many customers; independence from the core system's operation (scaling, downtime, data centre, release cycle). No answer = *not determined*, with the assumption named; with no answers the 300-case route distribution stays identical; **(b)** coupling read from the code: standard reads and writes, commit and update-task, an exit/BAdI/VOFM implementation running inside a standard LUW → on-stack is required; loose coupling makes side-by-side *possible*, the answers in (a) decide, the default stays on-stack (DSAG guide, 3.0.12); **(c)** key-user extensibility as a route of its own — see the next row; **(d)** the rationale's first sentence names the step that decided and its evidence line; **(e)** later and larger: a hybrid route (anchor on the stack plus side-by-side) and placement per layer (UI, logic, data). Our strengths stay in front of it: keep · rebuild · standard · retire first, Level A–D per object, edition rules, *not determined*. Engine-version gated (`…_FROM`), a frozen fixture for the version before, and a labelled set of 40–60 cases with the expected route and deciding step — today the benchmark measures the route distribution, not whether a route is right | L |
| **3.0.13** | **Built in v3.0.13 (ef7a5777, a2567c9c): (1)–(4); a value only stored as a stamp is a note, not a finding (owner 14.10.2026); on the 300-case benchmark no route or score changes** · **Four small engine rules** (owner decision 14.10.2026, moved into 3.0.13 the same day), each engine-version gated, measured on the 300-case benchmark, with a test that fails without it: **(1)** `sy-datum`/`sy-uzeit` used in comparisons, deadlines or writes is a finding — the logic tips at the day boundary when the system runs in UTC and refuted jobs shift; remedy `sy-datlo`/`sy-timlo` or, in ABAP Cloud, `cl_abap_context_info` with an explicit time zone, plus a day-boundary test case; **(2)** for an exit, BAdI or VOFM implementation: is the logic inside the hook or delegated to a class — statements in the hook and delegated yes/no, into the effort estimate and the rationale; **(3)** form output read: SAPscript (`OPEN_FORM`…), Smart Forms (`SSF_*`), Adobe Forms (`FP_JOB_OPEN`); the level follows the print program's data access, the technology change to output management is an optional item; **(4)** ABAP proxy classes recognised: they are regenerated against the repository, not transported; and for every interface the question whether the process behind it still runs (a retire candidate) | M |
| **release routine, from 3.0.13** | **Acceptance runs on the owner's machine** (owner decision 14.10.2026): the reviewers' scenarios stay sealed in the repository (`scripts/acceptance/scenarios.mjs`); the demo and reference sources stay out of it, pinned by sha256 in `programs.json`; the full acceptance run with a real model key runs on the owner's machine before a release, not in CI | — |
| **3.0.18, item 8** | **Main-path rule** (owner decision 14.10.2026, stays with the engine step, renumbered 3.0.18 on 15.10.2026, 3.0.20 on 16.10.2026 and back to 3.0.18 on 18.10.2026 with the quality release — an engine correction, not a feature): a routine performed from the main event block is a step of the main path unless it only clears. Generic, measured on the process benchmark, frozen cases and the holdout untouched | S |
| **waits for evidence** | **Level C/D change, decision §9 No. 18** (owner decision 14.10.2026): no grade moves on public sources alone. The trial-system recipe in `docs/design/abcd-vs-atc.md` checks what the clean core ATC check reports for the overlaps; the classic behaviour needs an S/4HANA system, which is not available yet. With that evidence, decision No. 18 goes to the owner again; a change of grade is engine-version gated | S |
| **parked** | **CDS compiler licence** (owner decision 14.10.2026): `@sap/cds-compiler` (SAP Developer License) stays a development dependency used in CI, specs and the acceptance suite; production never runs it and tells the customer to install SAP CAP. The legal question whether that use is covered is parked | — |
| **after 3.0.18, not in scope** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15).* **Documentation reading load** (owner decision 14.10.2026): the SD process document runs to about 32,000 words, too long for a business reader; shortening it is not part of 3.0.13 | M |
| **3.0.14** | **Transformation, next step — RAP and CAP work very well first** (owner decision 14.10.2026, from the acceptance runs; 3.0.14 and before everything else, owner decision 15.10.2026: "es muss zuerst die Transformation sehr gut funktionieren für RAP und CAP"): **(1)** the remaining Node type errors, mostly number against text; **(2)** a gate-repair prompt of the largest units can exceed the 28,000-character cap — send only the failing body and its errors; **(3)** judging the Node scenarios by their ID is not wired (2 of 284 matched); **(4)** released interfaces are not in the client list the body guard reads (classes only); **(5)** PM is no longer a clean holdout — a rule was extended after seeing it, so a new holdout is needed; **(6)** side by side scrolls by the trace, not by percent (owner decision 15.10.2026, from the SD example on dev): today the two panes keep the same scroll percentage, so line 1051 of the original sits next to an unrelated part of whatever file is open on the right; with the package's traceability (the ABAP lines of every function) a line of the original brings its function into view on the right and a function brings its lines on the left, a file without a trace link (TRACE.md, metadata, configuration) says that sync does not apply to it, and a newly chosen file opens at the function of the original's current line; **(7)** the engine cases run in ABAP (owner decision 15.10.2026, from the first SAP activation of the SD package in a BTP ABAP trial: 77 ABAP Unit methods, 37 green, 0 red, 40 skipped): every TC_ENG_* case is written today as its specification and skips itself because its ABAP body does not exist yet — the scaffold writes the given/when/then of each case as executable ABAP against the logic class and the test double, so a case passes or fails instead of skipping; **(8)** the golden-master cases check the result, not only that the run completes: today each case runs the original's demo data through the logic and asserts nothing about the outcome ("confirm once in your system") — the expected results come from the original's observed output where the owner provides it (the characterization samples of 3.0.21, was 3.0.19) and are otherwise named as not yet compared, never as passed; **(9)** large programs fit (owner decision 15.10.2026: "wir müssen besser werden für große Beispiele"): one project is one Firestore document of at most 1 MiB, and the SD example no longer fits — saving its business documentation would make the project 1,229 KB, its regenerated package 1,018 KB, against 1,008 KB; nothing is lost (the write is refused whole and the draft can be downloaded), but a large program cannot keep its artefacts. The large artefacts (business documentation, process documentation, generated package, test cases) move into documents of their own, one per artefact, written by the server; existing projects keep loading through a read bridge; signed runs and audit packs stay byte-identical; the Firestore rules are deployed by hand | L |
| **3.0.15** | **Transformation, from the second SAP import** (owner decision 16.10.2026; SD package in the SAP BTP ABAP trial: activated, ABAP Unit 134 methods — 80 green, 53 skipped with their reason, 1 red). **(1)** A simple SAP function module with a clear ABAP Cloud counterpart — first DATE_CHECK_PLAUSIBILITY — is replaced in the access layer by engine-written ABAP Cloud code, not left as an open stub: today the stub raises, so every timestamp reads invalid and the program refuses every run until someone wires the check; each replacement with a test that fails without it and a list of the modules it covers. **(2)** The test suite the model writes runs the logic class with the test double of the access layer, never the default access: the one red method created the class without it and so tested the missing SAP connection, not the logic; **(3)** the CAP service's action is not called `run` (CAP rehearsal for the BTP trial, 16.10.2026: "custom action 'run()' conflicts with method in base class" — `run` is a method of every CAP service); the scaffold names it so it cannot shadow a CAP method, with a test; **(4)** a starter example shows no personal-data hint (owner 16.10.2026: "ein Beispiel mit PII ergibt wenig Sinn und schreckt User ab" — the 1000-line example warned about its own sender address): an unchanged starter example, recognised by its fingerprint, is the product's own known source and skips the hint; once the reader changes the code the hint applies as for any upload; **(5)** the CAP route from its first deploy to SAP BTP (owner 16.10.2026: the 1,000-line example, side-by-side by the engine's own recommendation, pushed to the Cloud Foundry trial with in-memory data and the shipped mocks): it builds and starts on the SAP BTP Node buildpack, the OData service and the mocked SAP APIs answer, the original's input check refuses an empty request — and a run with a valid selection crashed in a model-written body (U02 called the engine's `checked(st, fn)` with four arguments). Fix, each with a test: (a) the server's type check must run on every CAP/Node generation — this one stored "types not run · tsc not run" and `tsc` reports exactly that error; (b) an error inside a step answers 500 for that request and never takes the service down (it shut the CAP server down until Cloud Foundry restarted it); (c) the delivery package keeps the scaffold's `package.json` scripts — it replaced `start: cds-serve` with a start that serves nothing and dropped `test` and `compile`; (d) the delivered `tsconfig.json` carries `allowImportingTsExtensions` (158 false errors without it); (e) the code checks know that a CAP package uses `@sap/xssec`, `@cap-js/hana`, `@cap-js/sqlite` and `@cap-js/cds-types` through its configuration, not an import; (f) the engine cases' base request satisfies the original's mandatory selection (31 cases did not run because it lacked the sales organisation) | M |
| **3.0.17 — released 18.10.2026 (figures in the CHANGELOG)** | **RAP and CAP proven on SAP — before any other feature** (owner decision 16.10.2026: "erst wenn RAP und CAP sauber sitzen können wir wieder andere Features deployen"; until this step is released, a release carries only fixes, security and this step). Done means proven on the SAP BTP trial, not format-checked: **(1) CAP end to end** — merge the clean side-by-side starter example (freight rate check, branch `worktree-agent-a54cc06cebcbf2246`, no personal data), generate it on dev, push the delivery package to the Cloud Foundry trial (in-memory data, shipped mocks), and show that the process action answers a valid selection with a result, refuses an invalid one with the original's message, and that an error in a step answers 500 without taking the service down; the trial app is deleted after the test. **(2) RAP again, without hand patches** — the SD example generated with the scaffold of 3.0.15, imported into the ABAP trial via abapGit: activation without a single hand edit, ABAP Unit with no red method and every skipped one with its reason; the same for the owner's PM (1,924 lines) and QM (1,714 lines) examples, both routed In-App by the engine — larger RAP cases whose logic runs on internal tables without database access, so they test the logic class and the ABAP Unit cases more than the access layer. **(3)** Every defect either run shows becomes a fix with a test that fails without it, and the run is repeated until (1) and (2) hold. **(4)** From 3.0.15: an unchanged starter example shows no personal-data hint (item 4, not yet built). **(5)** The result is recorded with numbers (activation errors, ABAP Unit green/red/skipped, CAP requests answered) in the CHANGELOG. **(6)** Found by the CI gate of criterion (13) on 16.10.2026: a source with no event block — the starter example Z_ORDER_INTEGRITY_CHECK, classes and a FORM nobody calls — leaves the orchestrator to the model with no line of the original to port; the engine writes it, or the package names the missing entry point, never a model-invented run order (`tests/transformation-starter-gate.spec.ts` exempts that one case until then). **(7)** The Node package carries every demo case with all its tables (owner 17.10.2026, from the SD acceptance program: `test/fixtures/original-demo.json` 1 MB for 32 cases of about 15.6 kB each, though most cases change one table): store only the tables a case changes, the rest read from the baseline, with a test that every case still replays to the same rows. **(8)** The business rules count the arms of the original's demo-case switch as rules (owner 17.10.2026, from the QM acceptance program: 31 rules of the form "CASE p_case has 32 branches; this one is for 1"), and business readers see them in Analyze and the documentation: a branch of the demo-case switch (the golden master's case routine) is demo data, not a business rule, with a test on the shape, not on the program. **Acceptance definition — when Transformation counts as accepted and as stable** (owner decision 16.10.2026). *Acceptance set:* SD (RAP, access layer), PM and QM (RAP, large logic), the freight example and the 1,000-line example (CAP), and one holdout program from the owner that nobody has seen before — it never enters the repository and is never given to an agent. *A — generation, in the product:* (1) every case runs through to the delivery package without abort, the largest included, and a page reload on the way does not restart it; (2) the own checks are green — RAP: abaplint 0 errors; CAP: `tsc` 0 errors and actually run (“types not run” fails); (3) no open stub without its reason in STATUS.md; (4) every generated unit has a line anchor into the original, and every business rule of the analysis is in the code or named as open. *B — import on SAP (trial):* (5) RAP: abapGit pull and activation with 0 errors and 0 hand edits, except what the README names beforehand as a known trial limit (e.g. the service binding); (6) CAP: `cf push` builds and starts with only the trial manifest added, no code change. *C — running:* (7) RAP: ABAP Unit with 0 red methods (owner decision 18.10.2026, from the first trial runs: the model-written test class `LTCL_TEST` is a proposal, not evidence — the package says so and C(7) does not count it; C(7) counts the engine cases and the golden master; a repair round of the model tests against a real ABAP Unit run is 3.0.18 item 13); a method is skipped only because no expected result of the original is on record or because it needs real SAP data, each saying so; a method skipped because code is missing counts as red; every business rule has at least one green method; (8) CAP: a valid selection gets a result, an invalid one is refused with the original’s message, an error in a step answers 500 and the service keeps running, `npm test` 0 red. *D — honesty:* (9) STATUS.md and the product claim nothing that was not checked; “not compared” is never shown as passed. *E — owner walk-through:* (10) the owner runs every case in the product, upload to delivery package to import, without help and without an error message. **Accepted** when (1)–(10) hold for all six cases in one pass on one version. **Stable** when in addition: (11) every case generated three times anew meets A–C every time, not only the best run (18 generations); (12) the next release that touches Transformation passes the acceptance set again without a regression, and a regression blocks that release; (13) the checks of A run in CI on every shipped starter example (`tests/transformation-starter-gate.spec.ts`; SD, PM, QM and the holdout are not in the repository and are checked locally), and the trial runs of B and C are recorded with numbers in the CHANGELOG per release. *Not part of the acceptance:* functional equality with the original (the characterization samples of 3.0.21, was 3.0.19, prove it; until then “not compared”), and production operation of CAP with SAP HANA and XSUAA (the trial runs in memory with mocks; its own step) | M |
| **3.0.17 (legal deadline 02.12.2026)** | **Machine-readable marking of model-generated content, AI Act Art. 50(2)** (owner decision 17.10.2026 on G05, built ahead of the deadline at the owner's request: Clean-Core.io was on the market before August 2026, so the duty applies from 02.12.2026; whether generated code counts as "text" is not settled, and the exception for purely assistive editing hardly covers a real ABAP-to-RAP/CAP transformation — the marking costs almost nothing, so it is built). **(1)** One header comment in every artefact a model wrote or co-wrote, in the artefact's own comment syntax (ABAP `*`/`"`, TypeScript and CDS `//`, Markdown and HTML `<!-- -->`), of the form `Generated with AI assistance (<provider> <model>) by Clean-Core.io <version>, <date>` — provider and model from the run's model receipt (Gemini on the platform key, or the account's own provider with BYOK; never a hard-coded name), the date of the generation; files the engine wrote alone carry no such line, a file with engine frame and model bodies carries it. **(2)** The same statement as a metadata field in every export (the delivery package's `manifest.json`, the documentation and test exports, the Jira/Confluence exports); in the signed audit pack only as a new, versioned field, never by changing what an existing format signs. **(3)** The future read-only MCP answers to company clients carry the same field (a requirement for that step when it is built; no MCP exists today). **(4)** A test per artefact type that a model-written artefact carries the line and an engine-only one does not, and that provider and model match the receipt. Deterministic findings are not marked (G05) | S–M |
| **3.0.18 — Quality — released 19.10.2026 (figures in the CHANGELOG)** | *Released with items 1–7 and 9–14; item 8 (the benchmark targets: W1+W2 82.6 % of 87 %, W3 66.4 % of 75 %, edges 71.6 % of 78 %) cut by owner decision 18.10.2026 and moved to the next quality slot; SEC-2026-873 closed by owner decision (b); the reason columns of the QM program's characteristic and sample results as a second entity are a later feature (owner decision 18.10.2026); two QA notes of dd189e7328b2 (`db5b52a69e6a`, `96793b3a2001`, test gaps) go to the next quality slot.* **A quality release — no new feature** (owner decision 18.10.2026: "pack as much quality improvement into it as is realistic; every further feature is postponed behind it"). Until 3.0.18 is released, a release carries only 3.0.17, fixes, security and this step. **Renumbered the same day:** the own Claude key with the legal texts 1.0 (named 3.0.18 by the owner on 17.10.2026, never written down) → **after 3.0.19**, still waiting for the lawyer; **3.0.19 = key-user extensibility** (owner decision 18.10.2026: a cleanly tested example and the logic of key-user extensibility brought onto the platform); Portfolio step 1 (was 3.0.18) → **3.0.20**; Tests that count as evidence (was 3.0.19) → **3.0.21**; the unnumbered feature rows *after 3.0.15* → *after 3.0.18*. **Pulled in as quality, not postponed:** the engine step and the main-path rule (were 3.0.20: the accuracy of the core reading, no new surface), the PP review's test lints (were 3.0.19: they check our own generated tests), the PP and SD reviews' P1 engine rules (were 3.0.20: wrong readings, not new ones), the output guards (were after 3.0.20: deterministic checks on model text), the QA range check of 3.0.13 (was after 3.0.15: open findings, not a feature). **Sources:** the QA delta report of 73b8cad63d3e (339 carried findings — 0 high, 300 medium, 39 low; later rounds report one defect several times, so the counts below are findings, not defects), §12, §13, `docs/ux/register.json`, the 3.0.17 acceptance runs, the pipeline timings of 17.10.2026. **In order of user impact and risk; a finding closes fixed with a test that fails without the fix, or refuted with `scripts/qa/refute.mjs` and evidence:** **(1) Security first** — QA findings, IDs only until fixed (first group first, for its subject): `5888d3abf47b`, `7090518c27c8`, `7bfcc852fb2d`, `ce70fb8b4c26`, `de25902a2eba`; then `0b38f806bff2`, `26c4fece1f1b`, `4ab53dd11fa0`, `566a81a68f86`, `5b33d74a9936`, `811cc05ed59d`, `90a5bebd5ad2`, `94fe5f432946`, `9d7297f26a1f`, `be894550f236`, `c35cc25bc581`, `da45f743b974`, `f88fc81d6c07`; `69abb12523ed`, `98c0cfd6c4e1`, `b5628794687a`, `e6c756fa2d63`; `eab60e94d793`; `1c271a8c06a6`, `6990a3078f00`, `721875fcc5c5`, `805375485b70`, `9cdee7c6c184`, `e6ad647240fe`, `e9a74a57e280`; low: `7c8df6159989`, `d60f032f434a`, `dbadd595eb4f`, `e026ae2b00d2`, `80438394719f`, `89a74fba2f7f`, `db523bab4418`, `893fb8560897`, `9598a66b0076`, `c3ba2380fe08`, `d513825d910b`. §12: SEC-2026-829 (was 3.0.20) and the security bundle SEC-2026-817, -833 to -838, -847, -848, -855 to -857, -859, -860 (was after 3.0.15); SEC-2026-849 and -858 with the next rules deploy (owner's go); SEC-2026-870 stays with 3.0.17. §12 reconciled with the sealed register: SEC-2026-842 to -846 are named in the v3.0.15 CHANGELOG but still read *scheduled* here. *Acceptance:* every ID above decided in the QA or the sealed register; no §12 row *fixed* to a released step. **(2) Transformation: Cancel, lease and reload do what the screen says** (`app/(app)/project/[projectId]/transformation/page.tsx`, `app/api/transformation/lease/route.ts`, `lib/workflow-steps.ts`, `components/transformation/TransformationObjectPage.tsx`; 46 findings): Cancel aborts a pending contract read and lease request — the signal threaded through `fetchGenerationDecision` and `requestGenerationLease`, a granted lease still closed; the single-call fallback never calls the model without a lease; a refused contract or preflight blocks instead of reading as an unblocked plan; the lease route tells a new run from a retry when `runId` is missing, reports a failed charge confirmation as a failure and checks the project again at issuance; the Built-on basis stores only the facts the generation used; a reload opens an engine-led Node package at its first step; a changed generation context marks Testing stale and blocks its closing; package rows keep a visible disclosure cue (6 low, accessibility). *Acceptance:* a rendered spec cancels during the contract read and during the lease request and sees no model call and no open lease afterwards; a route spec per lease case; no open finding on these files in the next QA delta. **(3) Documentation ends cleanly** (`app/(app)/project/[projectId]/documentation/page.tsx`, 13; `app/(app)/dashboard/page.tsx`, 1): after a failed part every sibling call settles (`Promise.allSettled`) before the run ends and releases its lease — today the catch aborts and rethrows without waiting; a load error keeps the progress card with its end state and *Try again*; a failed artefact hydration ends the dashboard's loading state with a message. *Acceptance:* a spec with one part failing while another runs sees no part update after the run ended; a rendered spec of a load error shows the progress card; the dashboard spec with a failing artefact read shows the message, not the skeleton. **(4) The engine says only what it read** (`lib/abap/`, 132 findings in twelve files; engine-version gated wherever output moves; the 300-case benchmark and the demo read before and after): router — a local RFC is no evidence of a released API, a file-picker dialog is no completed transfer, Side-by-Side is not *highly compatible* with direct SAP-table writes, a Public Edition target does not assume Level A against findings (`extensibility-router.ts`, 35); catalog — contextual successors applied, the freshness stamp attached to the hits it is promised for (`sap-api-catalog.ts`, 21); SAP-owned slash namespaces are not customer modules, contextual table advice pinned to the run's engine version (`code-assessment.ts`, 16); a caught `RAISE` does not end a routine, a gate inside a conditional block marks nothing unreachable, FORM parameters shadow constants (`constant-gates.ts`, 11); system time under `IS INITIAL`, copied dates, delegated hooks, proxy-fault scope (`engine-rules.ts`, 15); `headerRuleRange` lists sparse rule IDs instead of a range that implies absent ones (`header-rules.ts`, 8); release status against a conflicting ATC classification — the expected ATC message only, no grade moves (§9 No. 18) (`abcd-classification.ts`, 5); FORM parameters as local shadows (`original-contract.ts`, 4); a second BOPF CDS annotation (`legacy-technology.ts`, 3); two claims in `evidence-model.ts`; the security-review rules (`security-review.ts`, 12 beside the IDs under (1)) and demo switches (`demo-switches.ts`, 2). With them the high findings of the v3.0.10 full review `1afc4f95d2ab` and `4af8e0a091fc` (check first whether still open) and `28f3547a5254` (IDs only). *Acceptance:* each change with a test that fails without it; benchmark and demo deltas named in the CHANGELOG; runs signed earlier re-render unchanged. **(5) Tests that guard what they claim** (66 findings in `tests/`, 3 in `scripts/acceptance/scenario-cases.ts`): guards removed without a replacement come back or become a behavioural test (`catalog-route-budget`, `transformation-chain`, `documentation-blueprint-shape`, `abap-table-dependencies`, `generation-follows-contract`); a spec that passes by skipping when a reference program is absent is counted as skipped, never as green (golden master, business-layer parts, the 3.0.14 owner-source spec); a literal source scan becomes a behavioural check where the claim is behaviour (`level-d-register` signed-content exclusion, `run-integrity-guard`, `security-gate-error-text-guard`); source guards that follow aliases and scope (`engine-version-callers`, `generation-follows-contract`, `dsag-citations`, `sap-references`); provider cancellation run through the route (`model-deadline`); runner protocol 3 without probes (`runner-protocol`); the scenario checker compares empty arrays and duplicate messages and does not read a null case as case 0. With them the PP review's test lints (were 3.0.19): failing cases carried into the package's test detail; a negative test breaks exactly one rule; an exclusion test makes the excluded input necessary; the original's in-code demo cases become cases, or STATUS names the reduced scope. And the 27 spec files with `test.skip`/`test.fixme`: each skip names its reason. *Acceptance:* every restored or new guard is shown failing on a deliberately broken copy (noted in the commit); the CI summary lists skipped tests with their reason. **(6) Transformation follow-ups from the 3.0.17 runs:** a unit the engine wrote entirely is never sent to the model — in one of three runs U01 came back omitted; the engine's body stays, or the unit is a stub with its reason in STATUS.md. *Acceptance:* the plan holds no model call for an engine-complete unit; a spec with an omitted answer shows the stub and its reason. With it two smaller findings: the SAP reference scan of `lib/transformation/abap-check.ts` reads every valid ABAP reference form, and a quoted zero does not fail an inferred passing case (`lib/transformation/abap-engine-cases.ts`). **Needs an owner decision before it is built** (each changes generated packages and the scaffold version): (a) the `CONSTANTS` name pattern in `lib/transformation/unit-plan.ts` (about line 859) has lost its backslashes (`s*`, `[w/]`), so no constant name reaches the guard plan — fixing it changes the guards every package carries; (b) whether the engine writes `IF` predicates itself instead of leaving them to a fill; (c) curated DDIC types for fields the contract reads as text (e.g. `likp-btgew`). **(7) Records say what is true:** the CHANGELOG's 14,000-character fill limit against the 28,000-character leased-prompt cap (13); the v3.0.15/v3.0.16 dates in `lib/version.ts` against the CHANGELOG (2); `lib/model-providers.ts` does not call the own Claude key available while `ANTHROPIC_OWN_KEY_OFFERED` is `false`; `components/design/OptionComparison.tsx` does not blame an absent comparison on an older design (2); a ZIP comment that contains an end-of-central-directory signature is read alike by `lib/audit-pack-verify.ts` and `scripts/verify-pack.mjs` (5); a `concurrency` group for `sync-dsag-guide.yml` and `sync-sap-identifiers.yml`, so an older sync never overwrites a newer bot-branch update (8 low). Done 18.10.2026: §12's first line held the eight status updates of 06.10.2026 (commit 3e96671e) instead of their rows — moved into the rows. *Acceptance:* no open claim-mismatch finding on these files in the next QA delta; a verifier test with such a comment on both verifiers. **(8) The engine reads better — measured** (row "3.0.18, item 8" below, was 3.0.20): the main-path rule, the PP review's P1 main-path rules, the SD review's P1 effect analysis, the confirmed engine rows of the v3.0.7 and v3.0.9 full reviews, then the misses of the process benchmark. *Acceptance:* no benchmark wave or band lower than before; the targets (W1+W2 ≥ 87 %, W3 ≥ 75 %, edges ≥ 78 %) reported met or missed with figures in the CHANGELOG; frozen cases and the holdout untouched. **The one item the release may cut:** what is not done once the others hold moves to the next quality slot by owner decision, never into a feature release. **(9) Output guards for model text** (row "3.0.18, item 9" below, was after 3.0.20): sentence-level grounding in "Ask this case", the case prompt's injection hardening, the rule-based secret and personal-data check. *Acceptance:* as in that row, starting with the measured share of unanchored sentences today. **(10) The QA machinery and the open QA range:** the slice review of the 3.0.13 range (row "3.0.18, item 10" below) until the checkpoint reaches the release head; the dev smoke check waits 45 minutes for the deploy pipeline (`scripts/qa/smoke.mjs`) inside a 60-minute job (`qa-review.yml`), while the pipeline ran 52–54 minutes on 17.10.2026, so the check times out — **needs the owner's go** to raise both (agent infrastructure); the UX review last ran on 06.10.2026 and failed with OpenRouter HTTP 404 ("no model or endpoint matches … the required parameters") — that run was on d9278367, before 14492c98 dropped `temperature` from the shared request builder (`scripts/qa/lib/openrouter.mjs`: with `require_parameters: true` one unsupported parameter leaves no endpoint), and it has not run since (by hand only). Hypothesis: already fixed; one manual delta run confirms it (**owner's go**, cap $1.50); if it is still 404, the image input together with `data_collection: deny` and the price ceiling is the next suspect. *Acceptance:* QA checkpoint at the 3.0.18 head; a dev smoke check that completes after a 55-minute pipeline; one green UX run, or its cause named. **(11) The UX register and the suite's own health:** the 86 entries of `docs/ux/register.json` still *eingeplant* for steps released long ago (0.x, 1.x, 3.0, 3.0.4 …) checked against today's screens — fixed, still open (fixed into §13 with a 3.x step) or obsolete through the rebuild; the pipeline's 52–54 minutes on six shards: the ten slowest specs named, and a spec that waits for a window rebuilt as CLAUDE.md says; the emulator's abandoned-channel hang handled in the spec helpers, so a local full run needs no restart. *Acceptance:* no register entry fixed to a released step without a decision; pipeline time before and after in the CHANGELOG (the target set after measuring); one local full run without an emulator restart. **(12) Small open defects of this table:** the same-page choice link that settles short (`hooks/useFollowHash.ts`), the failed execution status read from a client-writable field (`lib/workspace-model.ts`), the BPMN export hypothesis of a START-OF-SELECTION holding only `STOP.` (reproduce first). *Acceptance:* as in their rows. **(13) What the 3.0.17 trial runs and the external QM and FI reviews of 18.10.2026 showed** (confirmed findings only; the reviews are model output and every point is reproduced before it is built): *every check proves it reached what it names* — a skipped, empty or vacuous test never reads as passed, and the package keeps four states apart: case method created, case data carried completely, result compared, passed in SAP; the package names itself a business library where query and job hand no input to the core, or connects them to a sample snapshot (QM-03, FI-F09); the service shows reasons, not only a status (QM-05); a short rule keeps its parent condition (QM-06, FI-F11); the design describes the RAP variant delivered, no DCL on a custom entity (QM-07, FI-F02); SAP identifiers checked against SAP's own documentation — scope items, app IDs (QM-08, FI-F12); the rule register keeps statically mapped, decided and behaviour-tested apart (QM-09); a binding pre-posting check point named as an architecture decision with a channel matrix (FI-F01); the types the access interface needs live in the interface, so interface and logic class form no activation cycle (PM trial); the ADT trial runner joins the acceptance suite — every RAP package imported, activated and run in ABAP Unit on the trial without hand work; the model-written test class repaired against a real ABAP Unit run (the 4 red PM methods of 18.10.2026 were model tests with wrong preconditions). *Acceptance:* each point closed with a test that fails without it, or refuted with evidence; the trial runner records its numbers in the CHANGELOG. **(14) From the 3.0.17 acceptance and the owner's book summary (18.10.2026):** the original's ALV display (`REUSE_ALV_*`, `cl_salv_table`) becomes the run's rows on the CAP route, engine-written (the 1,000-line example answered `rows: []` with its records processed); the CAP package carries authorization — scopes and a role template in `xs-security.json` derived from the original's AUTHORITY-CHECKs and `@requires` on the service (today no scope, so any authenticated user of the subaccount may call the action; the original's check itself is fail-closed); the RAP implementation type follows the original — a program that writes through a BAPI or a standard business object gets `managed with unmanaged save`, one that writes its own table plus a change document or update module `managed with additional save` (today always `managed` with `persistent table`). *Acceptance:* each with a test on a starter example, and the trial runner shows the package still activating and running. **Not in 3.0.18:** the five Clean Core dimensions (extensibility, data, integration, processes, operations) as the frame of the Management view, and the decision record mapped to SAP's Clean Core Quality Gates in Cloud ALM (both from the owner's book summary, 18.10.2026 — features, after 3.0.19); key-user extensibility (3.0.19); fit to standard (3.0.20); the own Claude key and the legal texts 1.0 (after 3.0.19, waits for the lawyer); Portfolio step 1 (3.0.21); Tests that count as evidence (3.0.22); the weekly own-code report; "Back to SAP standard" decidable, Staying clean, small engine rules and package artefacts, key-user extensibility, the placement decision, the Documentation reading load (all after 3.0.18); every 3.x row; no new screen, input, export or provider | L |
| **after 3.0.18, first** | *Postponed behind the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.17, first).* **Weekly report: runs on the reader's own code** (owner decision 17.10.2026: "so dass wir noch besser sehen, wie und ob die Plattform für eigene Codes genutzt wird"). The weekly usage report (`lib/usage-report.ts`, `scripts/send-usage-report.ts`) counts runs and active accounts, but not what they ran. New figures, current week against the previous one and all time, CI accounts excluded as everywhere in the report: **(1)** runs on own code — a run whose analysed source is not the unchanged text of a shipped starter example; **(2)** accounts with at least one such run; **(3)** the share of own-code runs among all runs. "Own code" is decided by the source, not by the project's `fromExample` flag: since 3.0.17 an example the reader edited is the reader's code (`lib/shipped-example-fingerprint.ts`), so the report recognises a shipped example by the same normalised fingerprint. Before building: check whether the run's stored input fingerprint is enough to decide this (a hash of the raw text does not match the normalised one) or whether the report reads the project's source — nothing is added to a signed run for it. The report never names a program, a file or a line of anyone's code; counts only | S |
| **after 3.0.19 — with the legal texts 1.0, after the lawyer's sign-off** | *Named 3.0.18 by the owner on 17.10.2026 together with the own Claude key (never written down here); postponed behind the 3.0.18 quality release (owner decision 18.10.2026). It is a feature and still waits for the lawyer's sign-off; `ANTHROPIC_OWN_KEY_OFFERED` stays `false` until (5) is done. If the sign-off is still missing when 3.0.19 is due, the owner decides whether 3.0.20 goes first.* **What the product changes with the new legal texts** (owner decisions 17.10.2026; the texts themselves are prepared outside the repository and are not public until released). **(1)** No statutory right of withdrawal (free service, account data used only to provide it): no withdrawal information, no withdrawal button, no withdrawal right of the BYOK supplementary agreement — ending it deletes the key; consent withdrawal under data protection law stays where a processing rests on consent. Survey and community mail stay opt-in, off by default (since 30.09.2026), which this decision relies on. **(2)** Own Gemini key: the key field and the BYOK section say that Cloud Billing must be active on the key's project — without it Google's unpaid terms apply (use for training, human review), and only paid services may serve users in the EEA, Switzerland and the UK (Gemini API terms, 28.04.2026). **(3)** Own Anthropic key: every call sets `inference_geo: "us"` (only "us" and "global" exist on the direct API; a named region documents better than "global"); the key field says that this costs the key owner 1.1× the standard rate, that the provider's charges arise in the user's own contract with the provider and are neither charged nor refunded by Clean-Core.io, and that Anthropic's Commercial Terms are not meant for consumers; a test that the parameter is sent and that `usage.inference_geo` is recorded with the run's model receipt. **(4)** Invitation mails to people without an account stay strictly functional (one concrete case, no promotional text, the inviting person recognisable as sender, exactly one mail and no reminders, an unsubscribe link that puts the address on the peppered-HMAC block list) and carry the Art. 14 GDPR information themselves; the address in clear only until acceptance or expiry, the delivery record (HMAC, inviter, time, message id, status) for the period the lawyer chooses (6 months or 3 years); check today's invitation flow against each point. **(5)** A new version of Terms and privacy policy, re-acceptance at the next sign-in, the consent texts of version 1.0, the supplementary agreement for an own Anthropic key — then `ANTHROPIC_OWN_KEY_OFFERED` is switched on. **(6)** DPF evidence (Google LLC active; Resend active, re-certification under review) is renewed yearly and filed with its date outside the repository. **(7) The start page and every public summary say the same as the new texts** (owner 17.10.2026; public is fine): the start section ("after that you continue with your own Gemini API key") and the key card ("Your own Gemini key", "Add Your Gemini Key") name an own model key — Gemini or Claude; the key card says that a Gemini key needs Cloud Billing on its project (without it Google's unpaid terms apply, including use for training) and that with a Claude key inference runs in the US at 1.1× the provider's rate, paid to the provider; the trust header ("reaches the Google Gemini API only through our server") names the provider that answers; "Stored in the EU" stays true for storage and is not stretched to processing — with Claude, processing is in the US; the trust lines (`lib/trust-claims.ts`: upload confirmation "including with the Google Gemini API", key handling, training) and the FAQ (`lib/landing-faq.ts`: training, cost) follow the new privacy policy word for word — the guard that binds each line to its quote then holds; the privacy and terms modals (`components/LandingModals.tsx`) carry the new texts, not copies of the old; `llms.txt` and the JSON-LD say the same; withdrawal is not mentioned anywhere, since there is no statutory right of withdrawal | M |
| **with the lawyer's G04 decision** | **A proof archive, not a data archive** (owner principle 17.10.2026: keep per event only what carries the proof — Art. 5(1)(c, e) and 5(2) GDPR, Art. 7(1) for consent — and replace everything reproducible by a reference). Where the product stands: the Terms and the privacy policy are kept once per version with their SHA-256 and every acceptance points to that hash (`lib/terms-versions.ts`, `lib/consent.ts`) — that part holds. **Open:** **(1)** `consent_events` is deleted with the account (`lib/firebase-admin.ts`, erasure F-16) and holds uid and address in clear: keep it append-only beyond the account, the subject replaced on erasure by a peppered HMAC of the address, no profile; **(2)** every proof row carries its own `delete_after`, computed when it is written (acceptance: end of the third calendar year after the contract ends, §§ 195, 199 BGB; deletion log: three years), and a nightly purge job deletes after it — no later case-by-case decisions; **(3)** the opt-out list (`email_suppressions`) is deleted with the account and keyed by an unsalted SHA-256 beside the address in clear: keep only a peppered HMAC, without end, so an opt-out holds for good (this reverses the 30.09.2026 handling — confirmed by the owner on 17.10.2026; the rest of this row as written); **(4)** a deletion log, "account (HMAC) erased on date", three years; **(5)** mails: template id and version, provider message id and status by webhook, 30–90 days, never content — Resend deletes its copy after 30 days (owner 17.10.2026); check that our own send records hold nothing more; **(6)** no IP address in a proof (timestamp, account and method suffice); access logs with IP 7–14 days, then aggregated — Cloud Logging keeps 30 days by default, a retention setting for the owner; **(7)** a short deletion concept (data type, purpose, legal basis, period, trigger) and the Art. 30 records — owner and lawyer. The legal basis and the periods are the lawyer's G04 decision; the build waits for it | M |
| **3.0.18, item 10** | *Pulled into the 3.0.18 quality release (owner decision 18.10.2026; was after 3.0.15): open QA findings, not a feature.* **Check the QA findings of the whole 3.0.13 range** (owner decision 15.10.2026: planned, not part of 3.0.13). The delta reviews of the 3.0.13 pushes (latest aa8b12e8e8f3) read the 50 commits since checkpoint b4b5f068b555 only in part — ten calls do not cover the range, so every report was INCOMPLETE and the checkpoint did not move; they left about 140 medium and 16 low findings, none on the fixes of 15.10.2026. **(1)** Review the range in slices from the checkpoint (`docs/QA-REVIEW-LOOP.md` §8), each slice awaited with `--slice`, until the checkpoint reaches the release head. **(2)** Verify every finding against the cited line: fix the confirmed ones with a test that fails without the fix, refute the wrong ones with `scripts/qa/refute.mjs` and evidence. **(3)** Security-relevant ones go through the security register, IDs only in public files | M |
| **after the dev deploy of 3.0.13** | **First import into SAP** (owner decision 14.10.2026): the owner has an SAP BTP ABAP environment trial (2608) with ADT and abapGit; the generated packages are imported there for the first time after the dev deploy and the result is recorded. Until then the files are format-checked, not import-verified | S |
| **no version, needs partners** | **Pilot with real programs** (external positioning review of 12.10.2026 after the FI and CO exercises; owner decision the same night): 10–20 released custom programs from two or three partners, including poorly documented ones with missing dependencies; the baseline is an experienced SAP expert with his usual tools *and* an AI assistant, not a person without tools. Measured: expert time to an accepted decision (including review and rework), critical errors and unsupported claims in the accepted result, time to answer the typical business questions, effort to take the package into existing project and test tools, and whether people come back for a second case. Proposed measures, no results; three documented references with net savings weigh more than any feature. Waits for partners (Sonny, 12.10.2026: none yet) | — |
| **3.0.15** | **Data sovereignty over the model — Claude as BYOK, then as the platform model** (decision Sonny, 11.10.2026; raised to a priority the same evening: "hier müssen wir weiterkommen, um noch mehr ernst genommen zu werden" — a company whose code may not go to our key cannot use the tools that call a model today; scope and depth decided at the start of the step): **Part B first, needed in any case** — Claude as a BYOK provider beside Gemini: the encrypted key store gets a provider field, the key test reads Anthropic's Models API (no tokens spent), a provider choice in Settings, the proxy routes by provider, model receipt and audit pack name the provider that answered; privacy text for an own Claude key. **What makes it data sovereignty, not only a second provider:** with an own key set, no call of that account ever falls back to the platform key — a missing or failing key stops the step and says so; the account sees per stage which provider, model and key (own or platform) answered; the audit pack and the delivery package's STATUS.md name provider, model and key owner; the Trust page gets "where your code goes" per provider, linking the provider's own terms on region and retention instead of paraphrasing them; the engine-only path (no model at all) stays fully usable and is named as the choice for code that may not leave. **Part A, planned** — the platform's model calls move from Gemini to Claude: `@anthropic-ai/sdk` in the proxy and in `lib/gemini.ts` / `lib/model-completion.ts`, `responseSchema` → structured outputs, `thinkingConfig` → effort, refusals handled; working assumption Claude Haiku 5.5 for every stage and Claude Opus 5.5 only for the Transformation code draft, decided by a quality comparison on real cases (naming, business statements, design, code draft, test scenarios) before the switch. **First, measure:** log input/output tokens per call and stage, so cost is known, not estimated (11.10.2026: ~155 model calls in 30 days; estimate under 1 $ a month all-Haiku, ~15–30 $ with Opus for Transformation, ~30–50 $ all-Opus; ~0.50–0.90 $ per Opus code draft). **Sonny's part:** Anthropic as processor — privacy policy EN/DE, Terms, Trust page, DPA; a monthly spend limit in the Anthropic console. Runs signed before the switch keep naming Gemini in their receipts. Part B is the first step of row 3.5 "multi-provider BYOK" | M–L |
| **3.0.20** | *Removed from 3.0.20 by owner decision 21.10.2026.* Fit to standard was built in 3.0.20 (steps F1–F10 of `docs/design/fit-to-standard-concept.md`: the gate, the design in Design, the offer under the next step, the map mode in the Business view, the phase state *not applicable*, the package without code, decision format 2, the Economics inputs per gap kind) and taken out of the product and the code again; the decision record stays format 1, byte for byte. The "Move to SAP standard" answer of a business rule and its SAP-standard hints from the curated scope items stay. Moved to the row "later — fit to standard" below. | — |
| **3.0.20 — with it** | **The business reader is led, not handed a list** (owner 21.10.2026, two reports with screenshots; for business and management readers first, readability at least Signavio's). **(1) The walk-through of the process becomes the leading way in.** Today it shows the code and the process step but describes nothing in plain language ("Step 96 of 96: Background run given or no file?" beside an ABAP excerpt), sits below the fold, and asks a yes/no question before the reader knows what the step does. It becomes prominent on the Business view and guides attractively: every step said in plain, simple business language — what happens here, why it matters to the business, what decides it, what changes if it goes — engine-written from the reading (the step's rule, its condition with the enclosing branches, the data it touches, its effect), the code one fold down with its line anchors; progress, grouping by phase, skipping technical steps a business reader need not answer (logging, file handling, technical guards are grouped and answered once), and a summary at the end of what the business still needs. **(2) Business rules become a decision and explanation engine.** Today a flat list of 67 rows ("Only maximum raw 1000000000 is processed", "Dec 2", "Kind REV") with the ABAP condition beside it and "No answer yet". It becomes a guided decision flow: rules grouped by business topic and ordered by impact; each rule explained in plain business language (what it protects, an example with real values, what happens on either side of the limit, where it applies — with its parent condition), technical constants and demo switches set apart; a proposal with its reason (keep, change the value, drop, move to configuration or to SAP standard), the decision taken in one click with an optional note, and a discussion view for a workshop (open points, who decided what, what changed since the last session — *built and removed again by owner decision 21.10.2026: "so schreckt das total ab"; the rules are decided in the one guided flow*); the rule register and the delivery package carry the decisions. Deterministic first (engine-written explanations from the rule set, `lib/abap/business-statement*.ts`, the enclosing-branches reading of 3.0.18); a model may only reword an engine sentence, with the output guards of 3.0.18. *Acceptance:* a business reader answers the walk-through and the rules of the 1,000-line example without reading ABAP (a moderated test with the owner); every plain-language sentence anchored to its lines; screenshots before/after in the CHANGELOG; Business, IT and Management stay views only. | L |
| **3.0.20 — quality** | **A split part gets what it needs from its parent** (3.0.19 acceptance, 21.10.2026): the SD acceptance program's split part U10P2 was refused in two of the last three runs because the model used the parent routine's locals (`ls_effect`, `lv_code`, `ls_work`, `lv_delivered`) without `cs_local`; the function stays a stub and 32 golden-master cases are red. The engine writes the hand-over itself — every parent local a part reads or writes is passed through `cs_local` by the frame, so a fill cannot reach for it otherwise. *Acceptance:* three consecutive acceptance runs write SD 32 of 32; a spec with a split part that reads parent locals. | S |
| **3.0.20 — owner decisions of 22.10.2026** | **Four calls on the slice review's open points, built into 3.0.20.** (1) A value written like test data (`TEST*`, `DUMMY*`, `DEMO*`, `XXX*`) is test data only in a program with demo cases of its own — a demo flag or a recognised test data switch; elsewhere the business is asked (`DEMO-ORDER` can be a live order type). (2) Without a demo flag, only rows of fixed values the switch's branches write themselves make a test data switch; a routine call never does. (3) RAP: two local classes that declare an attribute of the same name are refused with the reason instead of being merged into one. (4) The test sandbox says "the authority check refused it" instead of "this run did not grant it", which was wrong in the app's sandbox. |
| **3.0.21 — with the legal texts** | **Automatic model steps with an own key are a switch, off by default** (owner decision 22.10.2026 on question B6 of the legal review, document 13): with the platform key the automatic plain wording and business names of 3.0.20 stay as they are; with the account's own Gemini or Claude key they run only after the account turns on "Automatic steps" in Settings — until then they come on a click. Recorded per key, shown where the key is managed. The legal texts of Fassung 1.0 (E02, E04) assume exactly this. Also from the review, for the live state and independent of Fassung 1.0 (L1–L4, waiting for the owner's go as a hotfix): the trust page names no Anthropic key while it is switched off; the sentence on enterprise procurement documents goes; the glossary assistant shows a permanent notice that it is an AI system (Art. 50(1) AI Act, in force since 02.08.2026); the privacy policy names the operator's mail about a new account. B4 (Resend deletes contents after 30 days) is confirmed by the owner, researched and agreed with the lawyer. |
| **3.0.21 — with the legal texts** | **"AI-generated" replaces "Model proposal" on the face** (owner decision 22.10.2026, with the AI Act labelling of the legal review, G05/E28): the provenance value `proposed` keeps its value and its pen icon (never a sparkle, DESIGN.md §3.1) and changes its word to *AI-generated* in every chip, export and help text; the tooltip names provider and model from the run's model receipt, never a hard-coded name. What the deterministic engine wrote (*Reconstructed*, *Derived*, score, findings) never carries the label. The machine-readable marking of 3.0.17 (`lib/ai-marking.ts`) stays as it is; no signed format changes what it signs — a stored label is re-rendered, not re-signed. DESIGN.md §4 and its "Today, for example" column, `lib/provenance.ts` (with *Model proposal* added to `RETIRED_PROVENANCE_WORDINGS`), the machine-strings, demo and capture guards follow. *Acceptance:* no *Model proposal* left in UI text or exports; a spec that an engine-only block carries no AI label; the lawyer confirms with G05/E28 that the visible label suffices. | S–M |
| **3.0.21 — with it** | **First insights becomes the strongest page of the app** (owner 22.10.2026: "first insights muss definitiv die stärkste page der app werden vom look & feel, handling, inhalte, übersichtlichkeit"; both stages in 3.0.21, "der first look muss perfekt sein das hält neue user auf der plattform"), with the demo project and the examples brought up to the same state. The bar is set against every other page: look and feel, handling, content and overview; measured with screenshots on desktop and phone against the mockup before it is shown to the owner. *Acceptance:* the owner's walk-through on dev with the demo and every example. | L |
| **3.0.21 — with it** | **First insights: "What the code gives away"** (owner decisions 22.10.2026 on the killer-feature analysis): one block with at most three findings a business reader would not expect, each a plain sentence with its line anchor and who to ask ("Question for IT / the users / the business"), built only from deterministic engine readings that exist today and the page does not show — in fixed order: code no run reaches (`constant-gates.ts`, `call-graph.ts`), input asked for and then ignored (`input-use.ts`), a test or demo switch in production code (`demo-switches.ts`), a fixed data scope (`data-scope.ts`), a header comment the code contradicts (`program-summary-check.ts`), direct writes to SAP tables, the authority check (`authority-assessment.ts`); "+ N more" links to Documentation and IT. No model call; chip *Read from the code*. **Honest limits:** unreachable code only when reachability is certain and no include is missing; every line phrased as a question; with nothing found the block says "none of the seven signs found", never "clean". **To make room (owner's choice):** the test-data box becomes one line in the block; a step's "Checks:" and "Can end here:" lines move into the walk-through (one line per step); "Ask this case" leaves the Business view (amends DESIGN.md §5.3; it stays reachable from IT and Help). **Kept by owner decision:** the "What it changes" box, all three process forms (step list, sketch, full map); Level A–D does not come onto First insights. *Acceptance:* a guard spec that every line carries an anchor and its reader; false hits counted on every starter example, the demo and a benchmark sample before release, figures in the CHANGELOG. | M |
| **3.0.22 — first** | **The seven tools say less and lead more — simpler without cutting content** (owner decisions 22.10.2026 on the tools-simplification analysis, screenshots of 21.10.2026). **Order:** first one release-wide step for all seven tools — the slim frame plus the answer line and the Next step — then the per-tool steps. **(1) Frame:** the project name once (the breadcrumb; the eyebrow drops it), the tool bar's global "Next:" hint line goes (the "Next" tag on the tool stays), the header's extra buttons go into one "More" menu, a compact phone frame. **(2) Answer and Next step on every tool:** one plain sentence with the state and the key figure, then `NextStepCard` with the one primary and its cost line on all seven tools (Analyze: "Open Design"); information strips move into its "Why" fold. **(3) Facet cards and status line retired:** at most three facets, only where they are the answer (Analyze score, Economics step guide). **(4) A limit is stated once per tool,** in one side card (e.g. tenant tests locked, not compiled). **(5) Plain words on the face** ("test copy of SAP" for SAP mocks, "lines of code" for LoC, "Architecture contract" for AC-1), the technical term in the tooltip or fold. **(6) Analyze:** the score explanation, edition box and provenance fold behind "How the score is computed" (amends ADR-093 H3–H4). **(7) Design:** one tab set (Design document · Contract · Alternatives · Assumptions · Evidence), the requirements specification a secondary row, not a second primary. **Open:** Documentation's "At a glance" (3 or 6 counters) is decided together with the open Documentation decisions on business rules and exceptions. Nothing is deleted: what leaves the face goes one fold deeper. *Acceptance:* the pinning specs named in the analysis updated, `CAPTURE_LANDING` re-run, desktop and phone screenshots of every tool before and after shown to the owner. | M–L |
| **3.0.21 — with it** | **The way in and the way back work** (owner decisions 22.10.2026 on the whole-app usability analysis, points 1–4, 7, 8, 12, 13, 15). **(1)** A signed-out reader who opens a project or tool link goes to sign-in and comes back to it (`signInLinkFor`), instead of the 404; a signed-in account without access reads one sentence ("This project does not exist or is not shared with this account") and "Go to My workspace". **(2)** The quota has one name everywhere — "analysis runs", counted as left ("4 of 5 runs left"): header, Settings ("Plan and usage" becomes "Analysis runs"), the server's quota message, the assistant's knowledge (UX-084 regressed). **(3)** The way to an own key after the limit links every hop: "Add your own key" on the limit notice, the sign-in-security anchor on the key card, and back to the key after turning on 2FA. **(4)** A new invited reader: the invitation path survives the e-mail confirmation, the invitation page offers "Create an account", shows "Signed in as … · Use another account", and accepting opens the project directly. **(7)** One error boundary for every tool with "Back to project workspace" and the stale-build recovery. **(8)** A tab left open across a deploy shows a quiet "Clean-Core.io was updated — Reload" when it comes back into view; never an automatic reload while the reader types. **(12)** The own-code footer names the edition actually chosen (bug: it always says SAP Cloud ERP Private); the start shows the target as one line "Assessed against SAP Cloud ERP Private · Change", the one-click start stays. **(13)** An invited reader sees one strip on the workspace and the tools: "Shared with you for reading by <owner> — read only", with fewer per-control notes. **(15)** The sign-in dialog: a neutral title "Sign in or create a free account", "already registered" offers "Sign in instead" and "Reset password", sentence case — the sign-up fields stay unchanged. *Acceptance:* a rendered spec per point; UX-153 checked and closed if resolved. | M |
| **3.0.21 — with it** | **A constant the code filters with is not "declared, not used"** (found 22.10.2026 by the Documentation analysis, owner decision the same day): the rule baskets explain read-only constants such as the PO example's document type, purchasing organisation and release group (BR-001–003) as "declared, not used … decides nothing", while the code sets the PO header and filters its reads with them, and the Documentation rightly says "processes only purchasing organisation 1000". A constant that filters what is read or sets what is written is a business decision ("only purchasing organisation 1000 — still right?"); only a constant that reaches no condition, WHERE or write stays technical. Engine-version gated; the 300-case benchmark and the demo read before and after. *Acceptance:* a spec on the PO example that BR-001–003 sit in the business basket with their lines; Design and Documentation agree. | S |
| **3.0.22 — with it** | **Help, waiting and loading behave the same everywhere** (owner decisions 22.10.2026 on the whole-app usability analysis, points 5, 6, 9–11, 14 and the example gallery). **(5)** Every model call waits like Design: what is happening, seconds against the ceiling, "you can leave", Cancel where the code aborts (with UX-025/-035). **(6)** One loading form for the tools (skeleton after 300 ms) and one failure strip "could not be loaded · Try again"; no load failure only in the console. **(9)** The help button is "Help" everywhere (assistant, show tips again, glossary, how it works, shortcuts on pointer devices); on a phone glossary and how it works sit in the account menu. **(10)** The Knowledge glossary renders `lib/glossary.ts`. **(11)** My workspace shows its filters from ten rows; Dashboard and Settings get the one-line footer; the example gallery folds to "Try an example (8) · Show" once own projects exist (changes the owner decision of 01.10.2026; with UX-188). **(14)** In the slim frame of "3.0.22 — first": Delivery gets `StageFooter`; no "Next" at the end of a tool (ADR-018 stays). *Acceptance:* a rendered spec per point. | M |
| **3.0.22 — with it** | **The Documentation reads the rule baskets — business decisions and four situations** (owner decisions 22.10.2026 on the Documentation analysis; amends ADR-077, -082, -097 with a new ADR). Today Documentation and every documentation export ignore the 3.0.20 baskets: the PO example shows four rule counts on one page (12, 21, "9 + 7 + 5", Design's 7 questions), 13 of 21 rows in its rules table are not business rules, and 19 exception rows describe about four situations. **(1)** One figure everywhere: "Business decisions" (= the Design questions; PO 7) replaces "Business rules", with technical checks, fixed values and rules without a visible business meaning counted in one line beside it. **(2)** Section 2 "What the business decides": at most five decisions on top, one per Design question, weightiest first — a plain sentence with the real value, step, rule ids and lines, the business's recorded answer shown read-only ("set by the business"; Documentation never asks); the rest folded; main-path gates leave the table (they stand in section 1). A fixed value counts as a business decision when it filters what is read or written. **(3)** Section 3 "What can go wrong and what happens then": at most four situations — the run stops with a message, the case is rejected, the case waits for someone, the run goes on with a warning — each with the message the user sees and its places folded under it; bare technical exits move to appendix A.2. Grouping, not merging: every place keeps its own line and anchor. **(4)** "At a glance" shows three counters: steps, business decisions, situations. **(5)** The delivery package's `docs/process-documentation.md` becomes the same process description the stage exports; the raw statements move to its appendix. **(6)** `rule-register.md`/`.csv` get a basket column and stay the complete IT record. Engine-version gated where output moves; nothing signed changes. *Acceptance:* on every starter example one rule figure on the page and in every export; PO section 2 shows at most five decisions and section 3 at most four situations; no place lost against today (a spec counts anchors before and after). | M |
| **3.0.21 — first** | **A split part on the Node track gets its parent routine's parameters** (found 22.10.2026 in the acceptance run of 3.0.20): the Node wrapper of a split routine receives the routine's USING/CHANGING parameters (`args`, e.g. `isClaim`, `csRow`) but calls each part as `(sel, st, local)` — since 3.0.18 a part never sees them, so the model guesses where its input comes from (SD's U10 parts read the claim from `lsWork`; the gate fails on the type errors in six of seven runs). RAP has always handed them over. Hand `args` to every part (Node signature and wrapper), keep the stop flag and the locals hand-over, and prove it with the SD acceptance run on Node. |
| **3.0.21 — with it** | **The rest of the external MM review of 22.10.2026** (owner decision 22.10.2026; the review's defects CF-01, CSV-01, API-01, SRC-01, DOC-01, ARCH-01 and TEST-02 are fixed in 3.0.20). (1) The RAP query provider evaluates the requested filters and sort order, and a filter that only narrows the display never removes competing documents from what is computed. (2) A complete synthetic demonstration path: an authorised call with synthetic data returns the same results as the logic class. (3) Amounts in the service entity carry their currency and scale (a BHD value 201 is 0.201 BHD), not bare integer subunits. (4) SAP app identifiers named precisely (F0859 Manage Supplier Invoices vs F1060A the list; scope item 2TX by its SAP name and process coverage). (5) The design does not exclude the SAP standard with a blanket claim where SAP documents a function for it (Simulate in supplier invoice processing); the fit-gap names the concrete combination the standard does not cover. (6) A reader question such as "Why is there no result?" leads to the concrete states (input rejected, no candidate, excluded document, filtered display) instead of "no early exit found"; a zero price unit is not named "item count is zero". |
| **3.0.21 — with it** | **A large method of a local class is split like a large FORM** (owner decision 22.10.2026, from the slice review): today a method inside `CLASS … IMPLEMENTATION` is never cut, however large (one of 483 lines stayed one unit), so its fill request is never made smaller. Split it at the same statement boundaries, with the same hand-over of the locals its parts read or write (scaffold version 21) and a method with `RETURNING` kept whole. Its own acceptance run on the trial. |
| **3.0.21 — with it** | **Architecture and route from what a run reaches** (external code audit of 22.10.2026, prioritised by the owner): the target architecture counted every database write of the call graph — one in a FORM nothing calls or behind a constant that is always off made a report a writing program — and no posting call; the route let an RFC call no run reaches choose side-by-side, and read `DESTINATION c_dest` with `c_dest` = 'NONE' as another system. One fact, `lib/abap/reachable-writes.ts` (table writes, posting BAPIs and `IN UPDATE TASK`, batch input, `MODIFY ENTITIES`, without unreached code), read by `programArchitecture`; `routeDrivers` leaves out findings marked unreachable or uncalled; a NONE destination constant is local. Engine-version gated (`ENGINE_READS_3021_FROM`). *Acceptance:* `tests/reachable-writes-3021.spec.ts`. | S |
| **3.0.21 — with it** | **Complexity and criticality on their own 1–10 scale** (external code audit of 22.10.2026, prioritised by the owner): both are computed 1–10 but the audit pack and the board deck printed them "/100" and the deck judged them against 70, 40 and 60, which a 1–10 score never reaches. One formatter (`lib/score-scale.ts`), thresholds 7, 4 and 6. A pack issued before keeps its bytes and verifies against its own manifest; no format bump. *Acceptance:* `tests/score-scale-3021.spec.ts`. | XS |
| **3.0.21 — with it** | **The BPMN reconstruction stays at the business level for class-based code** (found 22.10.2026 on dev with the owner's 937-line program: 1,680 shapes, 670 gateways): from engine 3.0.21 a routine is drawn once (later call sites are call activities) and a run of guard checks — each leaving early, the other arm going on — is one business-rule task "N checks" with every guard line, a decision and one early end. The skeleton is unchanged. *Acceptance:* `tests/bpmn-business-level-3021.spec.ts` (a synthetic rules class at most 0.35 shapes per executable statement, the 1,000-line example unchanged); the owner's program on dev. | S |
| **later** | **A refusal in test output read from a structured result** (owner decision 22.10.2026, from the slice review): whether a test was refused by the authority check is read from the run's text, which generated code could print too. The explanation stays a model proposal, so the risk is low; the fix is a structured result from the sandbox, a design change of its own. |
| **3.0.21** | *Postponed behind the 3.0.18 quality release, the own Claude key and fit-to-standard (owner decisions 18.10.2026; was 3.0.18, then 3.0.20).* **Portfolio, step 1 — many programs in one run, one aggregated view** (owner decision 11.10.2026, after the enterprise assessment of the same evening: a clean core programme asks about hundreds or thousands of Z objects, not one — without a way to the portfolio the product stays a single-case tool). Project = case stays: every program is its own project with its own signed run; the portfolio is a read-only view over projects. **Only with an own model key (BYOK, Sonny 11.10.2026):** the portfolio — batch run and view — is open only to an account that has its own model key stored and tested (3.0.15 comes first); every model step on a portfolio project runs on that key and never on the platform's, so many programs never spend the platform budget or send code to our key; without an own key the entry says why and leads to Settings. **(1) Batch run:** one upload (ZIP, abapGit export or several files) becomes one project per program, each analysed and signed by the same engine, queued on the server with a limit per account and a progress list that says what is done, running, failed and why; **engine only, no model call** in the batch — the model steps stay per project on request, so the batch neither spends the model budget nor sends code to a model. **(2) Aggregated view** over the account's projects or a named selection (a list of project ids, nothing written onto runs): programs by score band, Level A–D distribution of the SAP objects used, the four buckets Retire · Keep · Rebuild · Blocked by SAP with *not decided* as its own area, the SAP objects and kinds of finding that recur across programs ("BSEG written in 14 programs"), and what is *not determined* across the set; every figure names its coverage ("412 of 430 programs analysed · 18 failed · 37 with includes not read") and links to the projects behind it. **Never a portfolio score:** the score is a grade per program, not a compliance percentage — averaging it would invent a figure; the distribution is shown instead. **(3) Export** as CSV/XLSX and a one-page print for a steering meeting. **(4) Sharing** by the same e-mail-bound read invitation as a project. **Not in it:** steering — owners per object, waves, capacity, status workflow — tenants and SSO stay not built (table below); nothing aggregated is signed or put into an audit pack. **First:** a mockup for Sonny's approval (tools visual direction: Object Page); measure engine time and Firestore writes for 500 programs and set the limits from it; firestore.rules for the selection list are deployed by hand by Sonny | L |
| **3.0.22** | *Postponed behind the 3.0.18 quality release and fit-to-standard (owner decisions 18.10.2026; was 3.0.19, then 3.0.21): new inputs (observed samples), the live path and a new deliverable make it a feature; its test lints from the PP review moved into 3.0.18, item 5.* **Tests that count as evidence, not as a demonstration** (owner decision 11.10.2026, the same evening as the data sovereignty and portfolio steps: "auch das Test-Thema muss noch professioneller werden"). Today the mock runner is isolated (8.9: its own Cloud Run service without roles, secrets or open egress), but a pass shows only that the target did what a model-written test expected, against mocks; the expected results are model-stated (ADR-095), and the live path to an SAP system is built and locked (SECURITY.md §7.1). Four steps, in this order: **(1) Expected results observed from the original, not stated by a model** — characterization tests: the owner uploads what the old program actually produced for a selection (an ALV/list export, a CSV, a spool or IDoc sample, with the selection it was run with); the product turns each sample into a case whose expected result is the observed output, marked *Observed in the original* with its file and date, and the rule-traced cases that a sample covers stop reading *model-stated*. Only observed cases may say *unchanged*; a pass against a model-stated expectation keeps saying *not verified*. **(2) Open the live path against the owner's own non-production tenant** — close the three gates of §7.1: the authorised negative test (`tests/runner-isolation.spec.ts`) against the deployed runners on dev and production with every probe holding (SECURITY.md §7.2 updated with the result), the documented review (the full QA review and the security audit of a main release read runner, credential proxy and routes completely; every finding fixed or refuted), then Sonny decides; the tenant is confirmed by its owner as non-production, the run is bound to one approved host, and the receipt names tenant, runner revision and the proxy's request log count. **(3) The ABAP route with results from the owner's system** — ABAP Unit and ATC results imported (JUnit/ATC XML, already in part) are bound to the signed source and the transport or package they ran on; a result for other code says so and does not count. **(4) A test report as a deliverable** — the delivery package carries the suite, a JUnit XML of the last recorded run, the mutation probe's "catches k of n" and, per case, *observed / model-stated / imported from SAP*; its CI template runs the same suite. **Not in it:** running tests in a production tenant; executing the original ABAP on our side. **First:** (1) needs a mockup for Sonny and a decision which sample formats come first (the FI case suggests the ALV export) | L |
| **later — fit to standard, when SAP's scope items, capabilities and best-practice processes are machine-readable** | **Fit to standard — a design that lives with the standard instead of transforming** (was 3.0.20; removed from 3.0.20 by owner decision 21.10.2026). The owner's reason: "überzeugt mich nicht in der Umsetzung … bringt sehr viel Komplexität … wir kennen die Capabilities bzw. die jeweils neusten Scope Items und Better-Practice-Prozesse nicht; sobald wir das maschinenlesbar haben, wird es besser" — the implementation does not convince, it brings a great deal of complexity, and without SAP's current capabilities, scope items and best-practice processes the standard side of the comparison cannot be known. It returns once those are machine-readable. The plan stays `docs/design/fit-to-standard-concept.md` (the gate by kind of program, the engine proves what is given up and never that the standard covers it, a mode of Design shown in the Business view and decided in Management, a phase state *not applicable* only while the decision is on record, a package without code; steps F1–F10 with acceptance criteria, §8). | M–L |
| **3.0.18, item 8** | *Pulled into the 3.0.18 quality release (owner decision 18.10.2026; was 3.0.20): the accuracy of the core reading, measured, no new feature; the one item that release may cut.* **The engine reads better — measured, generic, never tuned to a case** (owner decision 11.10.2026: "die Engine muss noch besser werden"; today it is a strong first draft, not a substitute for a reviewer). **Where it stands (v3.0.10, process benchmark, 300 blind cases):** expected nodes hit 76.1 % of the comparable (W1 81.9 %, W2 82.2 %, holdout W1+W2 82.6 %, **W3 complex/OO 66.4 %**), edges 71.6 % (1,903 missing), skeleton agreement 11 of 300; by band: simple 90.4 %, medium 87.3 %, complex 74.6 %, very complex 74.0 %. W3 read 72.3 % on 28.09.2026 — first find out whether that is a drop or a changed measure. **Targets for the step:** W1+W2 ≥ 87 %, W3 ≥ 75 %, edges ≥ 78 %, complex and very complex bands ≥ 80 %. **Work, in order of the misses:** (1) W3: polymorphic calls with an open target and small methods (one class, many hops) — the decided next item "loop levels with their own start" (ADR-054 follow-up) with it; (2) missing edges — returns, exceptions and the branches after a call; (3) the confirmed engine rows of the QA full reviews of v3.0.7 and v3.0.9 (rows above) and the corpus check CC-054 (`REUSE_ALV_GRID_DISPLAY` B vs residual C); (4) where the engine is weak it says so on the map: a process from a very complex or OO-heavy program carries the measured band of its kind, so a reader knows where to review first. **Rules that do not move:** frozen cases and the holdout are never edited to raise a figure; a change must be generic (no case ids, no names from the cases); the holdout is measured once per release and the figures go into the CHANGELOG with the engine version; the 300 benchmark is read in full before and after every engine change (`tests/prozess-benchmark/evaluate.ts`, `report.py`), and a release that lowers any wave says so. Numbering note: the old phase plan above also has rows 3.0.10–3.0.16 from before the launch — the roadmap clean-up after 3.0.10 renames one of the two | L |
| **after 3.0.8** | **Package A released in v3.0.10 on 11.10.2026** (6677375d, 5950b025: the address module, follow and reveal on arrival, the origin back link); **packages B–G open** — the targets in Design, Economics and Requirements, in Management and the decision conditions, in Business/IT and the open questions, Next step and the tool bar, in Testing/Delivery/Analyze/Documentation, the demo twin, then the guard and the walk spec · **Every choice leads straight to its place — and back** (decision Sonny, 09.10.2026; moved behind SEO/GEO on 10.10.2026 — part of it came early in 3.0.7: deep links of the decision conditions, ADR-085, and the redirects of old layer addresses): every choice a user has to make in any tool — target sign-off in Design, Keep · Rebuild · Move to SAP standard · Retire in Management, confirming business rules, closing open questions (3.0.6), Economics assumptions, test and delivery approval — gets one stable address (`/project/<id>/<tool>?…#<anchor>`), and every place that asks for it (the other tools, the three views, the decision card, the open questions list, Next step) links to exactly that element, not to the top of the tool. The link carries its origin, so the target offers "Back to <origin>" and returns to the element the reader left by. Builds on what exists: `stageHref`/`workspaceBackHref` (`lib/workspace-back-href.ts`) return to only three workspace controls today, and `placeHref` (`components/workspace/DecisionCard.tsx`) leads into a tool without a way back; tool-to-tool links carry no origin at all. One registry of these choices in `lib/` (tool, anchor, label) that every link reads; a source guard fails on a choice without a rendered anchor or a link that bypasses the registry, and one E2E spec walks each choice there and back. Views stay views (§1): the origin lives in the URL only, never on an artefact or run | M |
| **3.0.10** | **Released as v3.0.10 on 11.10.2026** (owner bundle of 11.10.2026, go Sonny the same day) · the leftovers of 3.0.7 (1)–(4): Analyze with the score as the hero and declutter wave 2 (mockup approved, ADR-093), the IT dependency graph, the cost revision bound into the decision (ADR-092) · package A of "Every choice" · owner fixes: requirement arrows, the process map's button labels and Outline, readable business-rule titles, every finding names its SAP object or says it is a statement, the one-run score trend, a finished project opens with its process, process steps in business words · Testing: the suite repair's import paths, closing a failed or impossible run (ADR-094, "Closed · not verified") · **the external review of the FI case** (F-01 to F-10): the delivery package written from its own files with STATUS.md, manifest.json and docs/decision.md; SAP apps, scope items, APIs and communication scenarios checked; tests traced to the business rules with an invariant and a mutation probe (ADR-095); Documentation with a business page first and the provenance of every statement · QA full review of v3.0.9: `3a95f3a133de`, `327dc1af097d` fixed by the package · **Open after the release:** the test runner needs a redeploy before `TC_INV_01` runs (until then it reports Skipped); corpus case CC-054 expects B for `REUSE_ALV_GRID_DISPLAY`, the residual rule gives C — to check | L |
| **3.0.9** | **Released as v3.0.9 on 11.10.2026** (with the score rule, the test status, SEC-2026-758/-759/-764, the Economics inputs and the weekly Architecture Center sync; firestore.rules deployed by Sonny after the app) · **SAP reference architecture for the target, not for the route** (concept of 09.10.2026, decision Sonny on the timing pending): a static, hand-curated mapping `lib/sap-reference-architectures.ts` — in the style of `lib/abap/support-matrix.ts` — from each `TargetArchitectureCode` (`lib/project-commands.ts`) and each building block in `cloudServiceDetails` (`components/design/CloudServiceIntegrations.tsx`) to the matching reference architecture of the SAP Architecture Center (RA0001–RA0034, Apache-2.0), each binding with fit `direct` · `partial` · `none`, a one-sentence reason, the RA's last update and our verification date. Direct: `event` → RA0001, `integration` → RA0022/RA0021, `xsuaa`/`iamRoles` → RA0019; partial: `cap` → RA0007/RA0018, `destination` → RA0021/RA0022 (Cloud Connector and Destination service to on-premise; RA0006 only covers hyperscaler private links); none, said openly: `rap` (ABAP Cloud, released APIs and Level A–D are not covered there — the Cloudification Repository is the source), `keep`, `retire`, `standard`. For `event` the edition decides the sentence, quoted from RA0001 (`readme.md:107`, the only RA passage on ABAP): custom and derived events come from RAP on S/4HANA, from AIF on older releases and ECC. RFC is named in no RA, so an RFC driver may point to RA0022 only as `partial`. Shown in the Delivery handover (a "Reference patterns" section in the generated README by target code — RA0023 DevOps on SAP BTP for `cap`, `integration` and `event`; "no Architecture Center pattern, ABAP transport path" for `rap`), in `RoutingRationale` (a "SAP reference" row with badge, linked title and date, the reason for a partial fit beside the badge, not in a tooltip), in `CloudServiceIntegrations` (a link per block) and as one line in the Business and Management views ("SAP-documented pattern for this target: yes · partly · none"). Wording fixed to "SAP reference pattern for the target" — never "SAP-approved" or "SAP-compliant", no SAP logo. The layer never changes `routeDrivers()`, the route or the score, and no model chooses or writes an RA ID. In the design export (`lib/design-export.ts`) with RA ID and verification date; **not in the signed files of the audit pack** — the target is a user-attested statement there (`07-user-attested.md`, `lib/audit-pack.ts`), so the reference may only appear beside it, like the Level A–D grade. A metadata sync (`scripts/sync-sap-architecture-center.ts`, next to `sync-cloudification-repo.ts`: IDs, slugs, titles, last update, reported as a diff; the mapping stays manual with review), a unit test (every RA ID exists, every target code has an entry, `none` included) and a text guard that fails on "SAP-approved", "certified", "validated" or "compliant" near an RA reference. Corrections to the concept (checked against the Architecture Center repository, branch `dev`, 09.10.2026): RA0001 does name RAP, for events; `destination` maps to RA0021/RA0022, not RA0006; there is no MCP endpoint yet, so `referenceArchitectures` per case moves to 3.1; any adopted draw.io diagram carries its Apache-2.0 notice in `THIRD-PARTY-NOTICES.md` | M |
| **3.0.7, with Documentation lean** | **Released in v3.0.7 (cbb114f6, ADR-082)** · **Documentation: retire the legacy blueprint UI** (research report 09.10.2026, proposal 5; go Sonny 09.10.2026): about 450 lines render blueprints stored before 3.0.5 (L1–L4 cards, task index, task dialog, `buildLegacyConfluenceHtml`) and hold the last "N/A"; replace them with one strip "a model-written blueprint from before 3.0.5 is stored — download it as it was · replace with the code reading". Keeps the data (3.0.5: never migrated, never deleted), drops only its rendering; count the affected projects first | S–M |
| **after 3.0, no version** | **Architecture Center, optional rest of the concept** (only after community feedback on 3.0.9): an RA marker on canvas nodes in `ArchitectureCanvas`; a rejected alternative in the architecture contract may name an RA; a knowledge page "What SAP's reference architectures cover for clean core targets — and what not" (method/catalog pages, `facts.json`, `llms.txt`; not the frozen landing page); an "assumed, not priced" row in the Economics checklist for BTP run cost of side-by-side options (RA0007 §6, partial; RA0002 §9). **Rejected:** embedding the draw.io diagrams (they carry SAP logo shapes and show landscapes, not the case — link only), mapping BDC or native SQL drivers to an RA (no RA supports it), scoring the benchmark against RAs (no ground truth), any model choosing, summarising or retrieving RA text, RA0025 as urgency for Keep (it covers PI/PO only) | — |
| **3.1** | Read-only MCP access per project with scoped token (screen 6) and Open Evidence Format · comparison pages "when Nova, when Clean-Core.io, when both" and German core pages (both can be brought forward at any time after 0.2) |
| **after 3.1** | **Documentation enterprise** (moved behind 3.1 by Sonny on 11.10.2026; decision Sonny, 09.10.2026, research report of the same day): (8) a deterministic document-control cover — run ID and date, engine and rule version, process revision, target edition, clean-core level counts of the SAP objects used (never in the signed pack), the Management decision with its Confirmed chip, requirements and test status, "prepared by" the signed-in account (a self-declaration), change history from the revisions; (9) a traceability appendix — process step → business rule → code lines → requirement → test scenario → test status, only existing links, a missing one reads *Not determined*, in every export; (3) editing leaves Documentation: the map there is read-only with "Edit the process in the Business view", revisions and their compare go with it, and the description and its exports are built from the latest saved revision when one exists, the cover saying which; (10) Delivery ships the process description (with the trace as its appendix or its own file), and one name across the tool — Documentation, *Process description*, *Appendix* — no "blueprint", "handbook", "brief" or "trace" in visible text (UX-169). Not built: API push to Confluence, Cloud ALM or Signavio, an approval workflow, signing the documentation, a full arc42 set, a WYSIWYG editor, model-written KPIs or runbooks | M–L |
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
| — | **Released in v3.0.9 (11.10.2026)** · **3.0.9 · Test statuses no longer read from client-writable fields** (QA full review of 3.0.0, aad42f51c028, high, confirmed 03.10.2026; raised again by the full review of v3.0.7 `32285ae` and re-verified at dev HEAD 10.10.2026, so it moves from "after 3.0" into 3.0.9, the running phase): a stored `Simulated` status still yields the mock-execution label in `lib/workspace-model.ts:381-384` and `lib/workflow-steps.ts:311`; nothing writes it any more, so only old data or a direct browser write reach it — derive the label from server-written run data instead | M |
| — | **Released in v3.0.9 (11.10.2026; option c, owner 11.10.2026: runs signed before 3.0.9 keep the old rule)** · **3.0.9 · Engine: no score deduction for own Z/Y table writes in Private Edition** (owner decision Sonny, 10.10.2026; QA full review of v3.0.7 `32285ae`, `3a31270a65a0`): in Private Edition a write to the program's own Z/Y tables costs no Clean Core Score points — today `scoreFromFindings` (`lib/clean-core-score.ts`, called at `lib/abap/extensibility-router.ts:210` without the deployment model) charges `custom-table-write` 12/+2/cap 18 in both editions, while the route rationale (`extensibility-router.ts:351`) calls the same write no clean core violation. Public Cloud keeps the deduction. Scope: make the score deployment-aware for this one kind only; the Clean Core Score page and the band text (`lib/clean-core-score.ts` header: "91–100 … write to a custom table … cannot be in what was read") must say the edition rule, since they read the same table (`tests/score-bands-guard.spec.ts`). Versioning: the score has no rule version of its own — `level-rule-version.ts` fingerprints only the A–D level rule — so the change is identified by the engine version stamped into every run (`engineVersion: APP_VERSION`, `app/api/runs/create/route.ts`); decide in the step whether the score gets its own measured fingerprint like the level rule. Signed runs keep their value (never re-scored; a new run shows the new score). Before shipping: measure the benchmark and the demo record (Private Edition demo score moves), regenerate the demo if it changes, name the shift in the changelog | S |
| — | **After 3.0.9 · The failed execution status no longer read from a client-writable field** (found 11.10.2026 while fixing aad42f51c028): `lib/workspace-model.ts` still sets Execution to *failed* from a stored `Failed` status string, which a browser can write; `lib/workflow-steps.ts` already reads the receipt-backed `attestedFailures`. Same class as aad42f51c028 — derive it from the server's receipt | S |
| — | **To check · BPMN export: a START-OF-SELECTION holding only `STOP.`** (hypothesis, 11.10.2026, seen in a throwaway script while re-verifying ba1741f71631, not reproduced in a spec): with chaining on, the export may keep the block's normal end event unconnected. Reproduce first; fix only if a spec shows it | S |
| — | **After 3.0.9 · Security-relevant findings of the QA full review of v3.0.7** (`32285ae`, medium, confirmed 10.10.2026): `fa6c38804e7d`, `cc9ca5d26a97`, `c4547906a324` — details stay sealed in the QA report until fixed | S |
| — | **After 3.0.9 · Engine findings of the QA full review of v3.0.7** (`32285ae`, medium, confirmed 10.10.2026, each reproduced or traced at dev HEAD; bundle with the engine row above and a new benchmark measurement, since they change engine output): authority check ignores change-activity checks elsewhere `9920c5a44856`; logical-database `GET` and the `AT SELECTION-SCREEN` variants as event containers `de55f3f5fbc3`, `6101771be14b`; negated `IN`/`BETWEEN` and technical constants inside `IN` lists in business rules `3c3006869b0b`, `87e7efda95ed`; business statements — `ELSE` after an `ELSEIF` chain, macro bodies, "without a hit" only when the `SELECT` is on every path `0a11c22c1313`, `323ecc953f47`, `05f1c43705af` (the `FOR ALL ENTRIES` guard `848c34a0a9af` is already fixed in the working tree, to be committed); call graph — cycles through completed nodes, dynamic and `sy-repid` `IN PROGRAM` performs `28ea64bc558f`, `4d6580acbc13`, `447acaf419c9`; class model linearization and interface cycles `9709d95870a3`, `9f95566ab3bd`; period-terminated `INTERFACE` in the inventory `267594456d3e`; literal text read as code — environment/credit detectors, `sy-subrc` in a literal, `EXCEPTIONS`/`AND RETURN`/`VIA JOB` `bd810811a1b2`, `2f2589cc3d9e`, `2ca3861db976`, `0e2a75b18b7e`; Private Edition supporting-finding count `7464d6c0e687`; LUW scan `EXIT`/`CONTINUE` in loops `38f8cff605d5`; anchor check sentence split at `[` `caf2ee0d3a45`; templates with multi-line embedded expressions `e705a6d8d3ac`, `1526c63f4f46`; `sy-subrc` label skips method calls and `PERFORM` `913c79f23892`; unterminated routines and blocks drop their last statement, implicit report entry walks event blocks `6a95dae62db1`, `76661ffbf968`, `6f92ce093330`; null vs 0 date in the result diff `663e9310c1c9`; review tasks — dedup key, dynamic class with static method, `INCLUDE TYPE` `c2a5b7c3ecc7`, `d4b9ca4be03c`, `0d1954972a1e`; `SELECT-OPTIONS` parsed as a query `e07086677393`. `3a31270a65a0` decided by Sonny on 10.10.2026 and moved into 3.0.9 (row "3.0.9 · Engine: no score deduction for own Z/Y table writes in Private Edition" below) | L |
| — | **After 3.0.9 · App findings of the QA full review of v3.0.7** (`32285ae`, medium, confirmed 10.10.2026): workspace list shows only the newest 25 projects, no paging `c559b61a9b31`, `2f860a086a2f`; delivery bundle CI runs `npm test` without a test script or test file `327dc1af097d`, `056f52bd1257`; Testing — OData read sends the entity type as entity set, SAP Hub has no API-key field, connection form reset mid-edit `4b4c527a58bb`, `d6b5f6ce9032`, `e3d62b96fa28`; own-code retry after a failed target save creates a second project `99b36e71a3e1`; profile write failure at sign-up reported as account failure `9b2780323a6f`; remembered Terms decline hides the gate after a version expiry `a41d0439c942`; Economics edit lost when leaving before the token is ready `c6c06e08133a`; Transformation "jump to line" scrolls the wrong pane `a19ad46cef37`; assistant answers from a stale case context `083945ea79c7`; consent switch after withdrawal in another tab `7278316b2c12`; access list and rules editor fail silently `ca0fbe8d79d9`, `b1592a4c8968`; steering one-pager stuck when reopened `db989304cd94`; RACI phone list hides the 6th of six steps `8de35c28d207`; landing Steps view omits boundary events `87bcef965caa`; Analyze uploads and usage matrix state `6fa64d7df2dd`, `5b19511293f0`, `38c47363757f`; demo rules value-source edits `2508d863bfe2`; Design — cloud service guide substring match, unawaited copy, Assumptions tab count, hardening Explain on duplicates `f825e3b58bed`, `370ddbb053a7`, `fe4b4a1a615a`, `9696e42d490f`; empty generated file counts as code `f32bce6b1c39`; API routes — unlogged `catch {}` in repair-drafts and run-tests, BYOK save/delete reporting failure after an audit-write error, swallowed mail send records, Auth outage reported as missing account `ba993742d5bb`, `2539b4a32576`, `29876839c94c`, `76b83beec3c3`, `aca8faae050b`, `6d5b048c8adc`, `a9c42c914987`, `d66867b3ad36`; QA ledger lookup bounded by run window and retention (agent infrastructure) `338b9d15bcbc`. `8b16856ea89a` (dashboard skeleton on a failed initial read) closed by Sonny on 10.10.2026: not reproducible, the page is reached only by suspended, pending or profile-less accounts — left as is, refuted in the QA register | L |
| — | **After 3.0.9 · Security-relevant findings of the QA full review of v3.0.9** (`f574a22`, medium/low, confirmed 11.10.2026): `00056b1f98b9`, `a4f473456380`, `8505417a2b14`, `f8ff861c9af1`, `43380199f33d`, `15720d6e4026`, `6547c45ed2b3`, `6d2409432862`, `feb710b9d8f4`, `ca64acead6f5`, `185a42ba3836`, `b18ad282fdbe`, `6982e97a4cb9`, `7323f34682a8`, `8d914fa93d97`, `d4d8e94e8ff7`, `fef0c50ed9cc`, `0de1ea8849ae`, `973aba523e6f`, `1e99fc34a51d`, `c5c132e5384d` (one defect class, two unauthenticated routes first), `1d2256a3acd3`, `d45d1eaf2e4e` — details stay sealed in the QA report until fixed; check against SEC-2026-762/-763 first | M |
| — | **After 3.0.9 · Engine findings of the QA full review of v3.0.9** (`f574a22`, confirmed 11.10.2026, reproduced at dev HEAD; bundle with the v3.0.7 engine row above): benchmark-moving — `WRITE` list literal narrated twice `b60c5ccb8c62`, corpus stems in the glossary applied to every program `cb6d08f1b58e`, an assignment between `CALL FUNCTION … EXCEPTIONS` and `IF sy-subrc` drops the error boundary `989844d8bb4b`; evidence/demo-moving — an unused `CONSTANTS` naming a classic ALV function raises a finding `c06dafb728cd`, Private Edition persistence assumption and Tier-2/SAP GUI/enhancement wording of the router `7517c0c0de3c`, `5bd477eb6c74`, `eb80c4e98cdb`, `4937af9bf4ae`, identifier substrings inflate criticality `2714106054a2`, `MERGE … USING` read and `DATA(x) =` dynamic table not recorded `9fb03373dfdc`, `2727f621eea6`, `LEAVE TO TRANSACTION (x)` without a carrier `9558ab31b310`, unassignable capability refused as blocked `c7c3ec44ad81`; usage import — objects seen only in usage labelled clean-core-ready `b4e6d96814dd`, duplicate headers and quoted-delimiter sniffing `a2ff3b6ed8d4`, `0e290b8946ff`, window wording and span `65ae4b454e74`, `33784c18244b`, comments `d8bd9d87c217`, `eb16e992dfd3`; the classification page claims A–D across everything SAP publishes while the census covers eight object types `8689b9b8b28b`; hygiene `59d9a35b9a81`, `fdbcea90e9c6`, `7f25deaafbe5`, `977eb7ba5762` | M |
| — | **After 3.0.9 · App findings of the QA full review of v3.0.9** (`f574a22`, medium/low, confirmed 11.10.2026): ~~Delivery README lists files not in the ZIP `3a95f3a133de` (with `327dc1af097d`)~~ fixed in v3.0.10, reads every run `d6a6ceecf675`, jump count `c234816bcc2c`; Settings tests a stored connection with an empty password `4993d050fa29`; Testing Cancel keeps edits `d41df6e7e9ad`, ring says Nothing ran without a verdict `ae72989ef9bf`; rejected credentials reported as connected `7ab2f79c4cdb`; Transformation minimap invents locations `80b84529132a`, runs engine and catalog in the client against PERF-01 `95e6e3364786`, `d7dc388a2bd1`, log and fallback claims `9df82138d74c`, `8dd20d48e82e`; Documentation export on a failed RACI chunk `94d2533a4a85`; dashboard viewer extension, e-mail in the console, previous user's projects after sign-out `a3a2b76d3eb2`, `57563ab562d5`, `b51a02b0e481`; workspace list empty before a read, shared (0), invitations not refreshed, print sheet cut at 500 `36ff5918a591`, `5ea802ba4503`, `9ca54c2234ab`, `ae20f35fdaa3`; admin listeners unbounded `d0d74ce207bf`, `76da4e077c28`, `481c3acaafe9`; registration: stale Terms version, not retryable after activation, mail success unchecked, logs `ab5441f20ad4`, `ed8e2a0792ea`, `38e244cf8433`, `6b9fe7c6b995`, `0a5587c5ec4e`; revisions read full XML, malformed JSON saved as empty `1e258e7dfce1`, `0fccdbb2aa90`; audit pack reads whole runs, pre-1.2 label `f06d80919c3a`, `7af3002571ad`; signed run file name unvalidated, transaction flags `062338894491`, `ed077105905e`; shared projects cut at 50 `0b7c5a35eaaf`; MFA paste accepts non-digits, Back to Sign In closes the dialog `564ffd524042`, `6ce7f9406533`; Economics badge, demo step done on a negative figure, unchecked asset score `65eff5459ae6`, `40008def3caa`, `83fdd9845186`; level panel counts residual grades as SAP data and calls a failed lookup unclassified `406c0abb2512`, `68611ce19074`; design: router sentences, hardening checklist mapping and copy, route-unaware wording, unknown route drawn as RAP `84a271c49b8e`, `3e60fb0a80bc`, `bef1ff467c2d`, `7c123156709a`, `d8c2c4c53ad4`, `2c96e9020f51`, `5682957a9017`, `af8ec3cdb455`, `fa607ca3dbde`; IT target cells read forever `9b5834e82e74`; open-question reopen error hidden, own-code read failure silent, FileReader error `97325f44ab17`, `b315226f1152`, `4b3442c3c8fa`; Jira popup text `7c3eb974863c`; demo cross-tab overwrite and provenance `42d95860cad5`, `1e765c6a63e9`; accessibility — outline focus, search combobox, two Ctrl+K handlers, step list, revisions loading, Alt+Up, hero roles and tab stops, popover focus, CDS tag contrast, overlay not inert, live regions, tabpanel, touch target `911f53c605f7`, `c9329eb735eb`, `f4b7c4666188`, `2d81180ed36a`, `00e42fee39ab`, `1e224a0f44da`, `5c99a4098ba5`, `53cca9fc2dd1`, `d09650dd3583`, `0ff10b78ab4f`, `a753caa5970e`, `0fcb1b544bf1`, `454eb705316d`, `e1069d94baa8`, `ecfcb2f0f849`, `01a3b6069459`, `5ca502c6599f`, `e850045bb951`, `008c8edb7133`, `db2518bdbd9e`; stale comments and dead code `914daad50575`, `64434ff8ccd4`, `7e17b6d0df9f`, `31c71d2a2c82`, `93995ad653ff`, `7ea50c6d0cb4`, `b041cd11634b`, `19af0fffa1a0`, `ff55033fbcdf`, `b1204b6be928`, `24a7fa0f9638`, `f90e4104f53e` | L |
| — | **After 3.0.9 · Public texts that promise more than the product does** (QA full review of v3.0.9 `f574a22`, confirmed 11.10.2026): direct accesses "automatically mapped" `5bcdcbdb67b6`; the draft named TypeScript only `a7206ca96215`; the audit pack read as inside the ZIP `9b73640f66e7`; every grade called a heuristic `5c962a5d615b`; a "first compliant version" and a lookup "confidence" on /sap-cloudification `1abe22e2f041`, `ad3507d7c4b5`; namespaced objects "estimated" vs Unknown on /method/levels `22f872ee9d1c`; "every completed analysis is signed" next to the unsigned demo `be93a7fc5973`, `c0840335a9c1`; "Real Legacy ABAP" for the synthetic reference program `2d69c118f4e9`; reference timing `e30dd4a9b850`; hand-typed licence counts called generated `2a209dce3ff0`; "Fully supported" vs the support matrix `25745ec85e30`; Transformation "only against mocks" for in-app `d72d8335b8cf`; account deletion "instantly wipes all" `1b63522aeeac`; demo "nothing is stored" `036278bca5a3`, `8cf74bef9bf0`; the privacy policy limits the BYOK key to transformation requests, in English and German `0d958e53a9fa`, `ce0644e15772` — one copy pass, with the copy and SEO guards | M |
| 3.0.11 | **Moved into 3.0.11 (owner, 12.10.2026) · "In short" says what the program is for, in words a person understands** (owner, 12.10.2026, on the CO case): today the business page lists features ("reads a file from the user's PC, saves a file … decides with 87 business rules at 429 decision points"); a reader needs the purpose — who uses it, for what, with which business objects, what it produces and what it deliberately does not do. The owner's sample for the CO case says who uses the report and for what, which sender areas and keys it covers, and that it does not post but produces a traceable simulation with its variances, exclusions and blocked segments. Built from what the engine reads, not invented: the business objects behind the tables (COSP/COSS plan and actual, CSKS cost centre), the selection screen and its texts, the constant sets the rules branch on (sender areas, keys), the outputs (list, file, spool) and the capability facts (posts or not). Where the purpose needs words the code does not hold, a model may phrase it from those facts, marked *Model proposal* and checked against them (no claim the facts contradict; every business object it names must be one the engine read); the engine's own sentence stays underneath. Same for the exports and the Business view's first insights. Below it, the reader's questions answered on the page, not only linked (CO review 7.2: why an amount of one sender area was not allocated → the blocked segment, the negative and the missing driver, the evidence, the next step), and a rule register a decision can work on: current meaning → proposal → decision → implementation → independent test, open rules visibly open. **Acceptance texts already given:** the owner's CO sample above, the CO review's English *Purpose / Current scope / Current result / Before approval* (section 7.1) and the FI review's entry (section 6.1) | M |
| — | **First after 3.0.10 · the high findings of the QA full review of v3.0.10** (`8cb8975`, confirmed 11.10.2026): engine `1afc4f95d2ab` (every literal that starts with "SYS" reads as a hard-coded system, e.g. a German error message) and `4af8e0a091fc` (credit management detected from words inside literals) — both move findings and the score, so they ship with the engine's rule version and the benchmark measured before and after (3.0.18, items 4 and 8); security-relevant `28f3547a5254` (IDs only until fixed). Refuted with evidence: `544a46b1c1d4`, `aad42f51c028`. **Then the intake of the rest** — 1,252 medium (1,108 carried from earlier full reviews) and 408 low, the review INCOMPLETE for a few workspace files — as its own step: verify, fix or refute, schedule | M |
| — | **After 3.0.10 · A same-page choice link settles short of its place** (found by `tests/choice-walk.spec.ts`, 11.10.2026): after a client navigation inside the workspace (IT's "Review the contract" to `?view=management#decision-card`) the card settles about 26 px above the viewport instead of at its top. Next's own scroll and `hooks/useFollowHash.ts` both reach the bottom of a page that is still growing; the browser then moves the page by itself and the hook reads that as the reader scrolling and stops following. Fix in the hook (tell a layout shift from a reader's scroll), then drop the spec's `minTop: -120` tolerance | S |
| — | **After 3.0 · Key history for the audit signing key** (decision Sonny, 01.10.2026; QA 462335bf7edb): verify against a list of keys, then the deploy checks the key length again (tests/signing-key-guard.spec.ts) | M |
| — | **After 3.0, idea only · IT focus Application · Solution · Enterprise** (removed 02.10.2026, owner decision, ADR-058): comes back only together with a solution or landscape view across several projects that it could actually narrow — not as a switch over one program. §8 does not build portfolio steering, so today there is no such view | — |
| — | **Kept as is · Welcome mail to an unverified address** (decision Sonny, 01.10.2026; QA 4359c775bab2, fd3acb754f97): sign-up stays unchanged; address verification at sign-up would be its own product step | — |
| — | **Kept as is · Landing hero** (decision Sonny, 02.10.2026; Codex code-demo-03, usp-07, usp-01 hero part): the hero, its limits line and the demo button stay as they are for 3.0; the FAQ, JSON-LD, llms.txt and stage texts already say which tests run where | — |
| — | **After 3.0 · Audit pack covers the rebuild** (Codex usp-03, decision Sonny 02.10.2026): server-validated digests of the generated code and the test receipt in the pack, so a signed record of the whole chain becomes true; until then the copy says the pack records the analysis | M |
| — | **After 3.0 · Design writes through the server** (Codex usp-02, rest): the run binding is checked in a transaction since 02.10.2026; a server endpoint with a stored binding follows | M |
| — | **After 3.0 · Editor list selects connections** (Codex code-ui-04, rest): sequence flows and their conditions reachable from the element list, not only from the canvas | S |
| — | **After 3.0 · Ceiling for the community model key** (Codex architecture-03): a shared spending ceiling and concurrency limit that counts every retry, alerts, and what a user sees when it is reached. **Already in place (Sonny, 11.10.2026):** a monthly spending cap on the Gemini key at Google — the hard stop that protects the bill; reached, every user gets 429 until the month ends (as on 09.10.2026). **Still missing:** the share inside the app — per account and per run, so no single user or chain uses up the month for everyone — and the message a user sees before that, instead of a bare failure | M |
| — | **After the model-key ceiling, low priority · "Prepare drafts" — one project through the tools, a person decides** (Sonny, 11.10.2026, after the Nova Intelligence comparison of the same day): one button runs what needs no decision — the signed Analyze run, the Documentation draft, Economics as a Simulation on openly shown assumptions — and **stops at the decision** (Keep · Rebuild · Move to SAP standard · Retire, open business rules; Retire or Move to SAP standard end it). After *Rebuild* it drafts Design, the Transformation code and test scenarios with a mock run, each a Model proposal, and **stops again** for review, the ABAP Unit result from the user's own system and the sign-off. Never automatic: any Confirmed state, the Delivery release, invitations, anything written to SAP. A fixed, visible budget of model calls per run, cancellable; every step logged as drafted by the preparation agent; the chain stops at the first *Not determined* that blocks a step instead of filling it. **Not built:** an autonomous pipeline across many objects or writing to the system — that is portfolio steering and agent-triggered decisions, which §8 excludes. **Before it:** the ceiling row above, since the chain multiplies model calls per click. The facts on Nova (vendor claims vs. verified, sources dated 11.10.2026) feed the 3.1 comparison pages; Nova's own customer statements describe human review too, so no page calls it fully autonomous | M |
| — | **After 3.0 · Project artefacts in their own documents** (Codex architecture-02, long term): generated code, test suite, documentation and design move out of the one project document; the size check before 3.0 refuses an over-size write with 413 and keeps the draft | L |
| — | **After 3.0 · Benchmark BM-176 expects D** (decision Sonny, 02.10.2026; code-engine-05): its reference still grades the direct `UPDATE ever` C under the old rule; an independent reviewer sets it to D at the next benchmark revision, recorded with the rule version | S |
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
| Tenants, SSO, organisation accounts, self-hosted edition, ALM adapters, portfolio steering (owners, waves, capacity, status workflow) | Export, after 3.0 read-only MCP; a read-only batch run with an aggregated view is planned as 3.0.20 (owner decision 11.10.2026; behind the 3.0.18 quality release, owner decision 18.10.2026) — projects stay cases, nothing is steered |
| Signavio API connection, process repository, simulation, process mining | BPMN file exchange (§6) |
| Writing MCP tools, agentically triggered decisions | everything read-only |
| Wave planning across several projects, capacity planning, mandatory owners per object as a role (feedback 15.09.2026) | Project = case; confirmation comes from the account; prioritisation within a project via the next step (6.5) |

`tier: 'enterprise'`, `orgId`, `maxTeamMembers` and the Okta/Azure fields in the profile
describe an expansion stage that is not coming. They stay anyway, because
this roadmap does not touch the account.

---

## 9. Decisions

### Closed on 18.10.2026 (Sonny)

- **3.0.18 is a quality release** — as much quality improvement as is realistic, no new feature; every further feature is postponed behind it. New sequence: 3.0.17 RAP and CAP proven on SAP (unchanged) · 3.0.18 Quality · 3.0.19 key-user extensibility · 3.0.20 fit to standard (removed from 3.0.20 by owner decision 21.10.2026; now the row "later — fit to standard" in §7) · then the own Claude key with the legal texts 1.0 (waits for the lawyer) · 3.0.21 Portfolio step 1 · 3.0.22 Tests that count as evidence (owner decisions 18.10.2026). The engine step and the main-path rule (were 3.0.20), the output guards and the QA range check moved into 3.0.18 as quality; scope and acceptance in §7, row "3.0.18 — Quality".

### Closed on 13.10.2026 (Sonny)

- **"A–D never in the signed audit pack" means the per-object grade** (QA b024086238aa, 801f27f66ba5, review of 03501b79): the rule covers the A–D grade per SAP object from `gradeSapObject()` / `abcd-classification.ts`. Finding prose that names a technology level — "level D" for a modification, "level B" for a BAdI or the SAP Note 3578329 wording — is not that grade and may stay in signed findings, as it has since before 3.0.12.

### Closed on 30.09.2026 (Sonny)

- **Test audit (27.09.2026): all three stages approved** — (1) `docs/testing.md`, one smoke spec instead of five,
  shared sign-in helper; (2) fixed pauses replaced by waiting for an end state, Gemini stub in CI and one real
  call in the smoke check after the deploy, trial run with two workers, remove survey code, specs by feature;
  (3) sign-in once per file, animations via `page.clock`, the four gaps (admin switch, registration via
  the UI, audit pack export→verification, invitee read view). Stage 1 was built on 30.09.
- **Later, no priority (owner 16.10.2026): everything public in the repository current and English only** — condition for 3.0; the only exceptions are the German
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
| 6 | Block D is the next session | Plan `docs/archiv/roadmap-2.8/block-d-plan.md` (archived 02.10.2026, closed with D.30) |
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
| 20 | **SAP Architecture Center: in 3.0.x or as its own gate after 3.0?** (09.10.2026) | §7 schedules it as 3.0.9 after the deep links; the concept leaves the timing open. It adds credibility, not function, and its one risk is a reader taking a linked SAP pattern for an SAP endorsement of the route — so the wording gate in 3.0.9 comes before any release |

**Open for Sonny:** 7, 8, 9, 10, 11, 12, 13, 19 and 20. None of them blocks a
release; they stand here so they do not have to be searched for again. 10 to 12
were added on the evening of 16.09., 13 during the night, 19 on 21.09., 20 on 09.10.2026. The nine
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
| SEC-2026-643 | medium | P2 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-644 | medium | P2 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-645 | low | P3 | own step: CSP without unsafe-inline (nonce), with measurement | scheduled |
| SEC-2026-646 | medium | P2 | owner decision 03.10.2026: no admin ceiling for now | accepted risk |
| SEC-2026-647 | low | P3 | with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-648 | medium | P2 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-649 | medium | P2 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-650 | medium | P2 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-651 | low | P3 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-652 | medium | P2 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-653 | low | P3 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-654 | low | P3 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-655 | low | P3 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-656 | low | P3 | 3.0 audit intake - fixed immediately | fixed |
| SEC-2026-674 | medium | P2 | CSP rebuild - approved 03.10.2026, in progress | scheduled |
| SEC-2026-675 | low | P3 | CSP rebuild - approved 03.10.2026, in progress | scheduled |
| SEC-2026-676 | medium | P3 | with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-677 | medium | P2 | owner decision 03.10.2026: no admin ceiling for now | accepted risk |
| SEC-2026-678 | low | P3 | 3.0.0 re-release audit intake - fixed immediately | fixed |
| SEC-2026-681 | high | P1 | 3.0.x security hardening - next rules deploy (Sonny's go) | fixed |
| SEC-2026-682 | high | P1 | 3.0.x security hardening - app fix now, rules second line with next rules deploy (Sonny's go) | fixed |
| SEC-2026-683 | low | P3 | 3.0.x security hardening - same fix as SEC-b6716f0-03 | fixed |
| SEC-2026-684 | high | P1 | 3.0.x CI hardening - needs Sonny's go (workflow change) | fixed |
| SEC-2026-695 | low | P3 | 3.0.x security hardening - fixed at intake | fixed |
| SEC-2026-699 | low | P3 | 3.0.x security hardening - fixed at intake | fixed |
| SEC-2026-704 | low | P3 | with the next rules deploy (Sonny's go) - as SEC-2026-676 | fixed |
| SEC-2026-705 | low | P3 | with the next rules deploy (Sonny's go) - as SEC-2026-676 | fixed |
| SEC-2026-706 | low | P3 | with the next rules deploy (Sonny's go) - as SEC-2026-676 | fixed |
| SEC-2026-707 | low | P3 | with the next rules deploy (Sonny's go) | fixed |
| SEC-2026-708 | low | P3 | 3.0.x security hardening | fixed |
| SEC-2026-709 | low | P3 | 3.0.x security hardening - fixed at intake | fixed |
| SEC-2026-710 | low | P3 | 3.0.x security hardening - fixed at intake | fixed |
| SEC-2026-728 | medium | P2 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-729 | medium | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-730 | medium | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-731 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-732 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-733 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-734 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-735 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-736 | low | P3 | 3.0.6 security hardening (moved from 3.0.5 on 06.10.2026: 3.0.5 is the owner-requested fix bundle) | fixed (920b78e) |
| SEC-2026-737 | medium | P2 | 3.0.6 security hardening - next rules deploy (Sonny's go) | fixed (920b78e) |
| SEC-2026-739 | low | P3 | 3.0.6 security hardening | fixed (920b78e) |
| SEC-2026-740 | low | P3 | 3.0.6 security hardening - next rules deploy (Sonny's go) | fixed (920b78e) |
| SEC-2026-741 | low | P3 | 3.0.6 security hardening - next rules deploy (Sonny's go) | fixed (920b78e) |
| SEC-2026-742 | info | P3 | 3.0.6 security hardening - comment wording | fixed (920b78e) |
| SEC-2026-743 | info | P3 | 3.0.6 security hardening - comment wording | fixed (920b78e) |
| SEC-2026-744 | info | P3 | 3.0.6 security hardening - comment wording | fixed (920b78e) |
| SEC-2026-751 | medium | P2 | 3.0.x security hardening - next rules deploy (Sonny's go) | fixed (78485894c874), rules deployed 10.10.2026 |
| SEC-2026-752 | medium | P2 | 3.0.x security hardening - next rules deploy (Sonny's go), same fix as SEC-2026-751 | fixed (78485894c874), rules deployed 10.10.2026 |
| SEC-2026-753 | medium | P3 | 3.0.x security hardening - as SEC-2026-699 | fixed (78485894c874) |
| SEC-2026-754 | medium | P3 | 3.0.x security hardening | fixed (78485894c874) |
| SEC-2026-755 | info | P3 | 3.0.x security hardening - comment wording | fixed (78485894c874) |
| SEC-2026-757 | medium | — | owner decision 03.10.2026: no admin ceiling for now (as SEC-2026-646) | accepted risk |
| SEC-2026-758 | medium | P2 | fixed in 3.0.9 - takes effect with the rules deploy after the app | fixed |
| SEC-2026-759 | medium | P2 | fixed in 3.0.9 - production data cleaned on 11.10.2026 (owner go) | fixed |
| SEC-2026-762 | low | P3 | 3.0.x security hardening - with SEC-2026-292 | scheduled |
| SEC-2026-763 | low | P3 | 3.0.x security hardening | scheduled |
| SEC-2026-764 | low | P3 | fixed in 3.0.9 - with SEC-2026-758 | fixed |
| SEC-2026-771 | info | P3 | 3.0.x security hardening - comment wording | scheduled |
| SEC-2026-774 | medium | P2 | CSP rebuild - approved 03.10.2026, in progress (as SEC-2026-674) | scheduled |
| SEC-2026-775 | info | P3 | 3.0.x security hardening - comment wording (with SEC-2026-771) | scheduled |
| SEC-2026-778 | medium | P2 | 3.0.x security hardening - next rules deploy (Sonny's go) | scheduled |
| SEC-2026-787 | info | P3 | 3.0.x security hardening - comment wording (with SEC-2026-771) | scheduled |
| SEC-2026-790 | medium | P2 | 3.0.11 | fixed |
| SEC-2026-803 | medium | P2 | 3.0.12 | fixed |
| SEC-2026-804 | low | P3 | 3.0.12 | fixed |
| SEC-2026-811 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-812 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-813 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-814 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-815 | low | P3 | 3.0.13 | fixed |
| SEC-2026-816 | low | P3 | 3.0.13 | fixed |
| SEC-2026-817 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-826 | medium | — | — | accepted risk |
| SEC-2026-827 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-828 | medium | — | — | accepted risk |
| SEC-2026-829 | medium | P3 | 3.0.18 · quality release (was 3.0.20) | scheduled |
| SEC-2026-830 | medium | P2 | 3.0.13 | fixed |
| SEC-2026-831 | low | P3 | 3.0.13 | fixed |
| SEC-2026-833 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-834 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-835 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-836 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-837 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-838 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-839 | low | — | — | refuted |
| SEC-2026-840 | low | — | — | refuted |
| SEC-2026-841 | low | — | — | refuted |
| SEC-2026-842 | medium | P2 | 3.0.15 | scheduled |
| SEC-2026-843 | medium | P2 | 3.0.15 | scheduled |
| SEC-2026-844 | medium | P2 | 3.0.15 | scheduled |
| SEC-2026-845 | low | P2 | 3.0.15 | scheduled |
| SEC-2026-846 | low | P2 | 3.0.15 | scheduled |
| SEC-2026-847 | medium | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-848 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-849 | medium | P2 | next rules deploy | scheduled |
| SEC-2026-850 | medium | — | — | refuted |
| SEC-2026-851 | medium | — | — | refuted |
| SEC-2026-852 | low | — | — | refuted |
| SEC-2026-853 | low | — | — | refuted |
| SEC-2026-854 | medium | — | — | refuted |
| SEC-2026-855 | medium | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-856 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-857 | medium | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-858 | medium | P2 | next rules deploy | scheduled |
| SEC-2026-859 | low | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-860 | info | P3 | 3.0.18 · security bundle (was after 3.0.15) | scheduled |
| SEC-2026-861 | medium | — | — | refuted |
| SEC-2026-862 | low | — | — | refuted |
| SEC-2026-863 | medium | — | — | refuted |
| SEC-2026-864 | low | — | — | refuted |
| SEC-2026-865 | low | — | — | refuted |
| SEC-2026-866 | low | — | — | refuted |
| SEC-2026-867 | info | — | — | refuted |
| SEC-2026-868 | info | — | — | refuted |
| SEC-2026-869 | critical | P1 | 3.0.16 · patch step | fixed |
| SEC-2026-870 | high | P1 | 3.0.17 · separate dev and main secrets (needs the owner) | scheduled |
| SEC-2026-871 | medium | P2 | 3.0.18 · item 1 | fixed |
| SEC-2026-872 | medium | P2 | 3.0.18 · item 1 | fixed |
| SEC-2026-873 | medium | P2 | 3.0.18 · item 1 | scheduled |
| SEC-2026-874 | low | P3 | 3.0.18 · item 1 | fixed |
| SEC-2026-875 | info | P3 | 3.0.18 · item 1 | fixed |
| SEC-2026-876 | info | P3 | 3.0.18 · item 1 | fixed |
| SEC-2026-877 | low | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-878 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-879 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-880 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-881 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-882 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-883 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-884 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-885 | medium | P2 | 3.0.19 · security | refuted |
| SEC-2026-886 | medium | P2 | 3.0.19 · security | fixed |
| SEC-2026-887 | medium | P2 | 3.0.19 · security | refuted |
| SEC-2026-888 | medium | P2 | next rules deploy (owner's go) | scheduled |
| SEC-2026-889 | low | P3 | next rules deploy (owner's go) | scheduled |
| SEC-2026-890 | low | P3 | next rules deploy (owner's go) | scheduled |
| SEC-2026-891 | low | P3 | 3.0.19 · security | fixed |
| SEC-2026-892 | low | P3 | 3.0.20 · security | fixed |
| SEC-2026-893 | low | P3 | 3.0.19 · security | fixed |
| SEC-2026-894 | info | P3 | 3.0.20 · security | fixed |
| SEC-2026-895 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-896 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-897 | medium | P2 | 3.0.20 · security | fixed |
| SEC-2026-898 | medium | P2 | 3.0.20 · security | fixed |
| SEC-2026-899 | medium | P2 | 3.0.20 · security | fixed |
| SEC-2026-900 | medium | P2 | 3.0.20 · security | fixed |
| SEC-2026-901 | low | P3 | 3.0.20 · security | fixed |
| SEC-2026-902 | low | P3 | 3.0.20 · security | fixed |
| SEC-2026-903 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-904 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-905 | info | P3 | after 3.0.18 · comment hygiene (owner decides) | scheduled |
| SEC-2026-906 | high | P1 | 3.0.21 · first (owner 22.10.2026: remove the workflow and its secret) | scheduled |
| SEC-2026-907 | high | P1 | 3.0.21 · first (owner 22.10.2026: manual runs on dev/main only, checkout pinned) | scheduled |
| SEC-2026-908 | medium | P2 | 3.0.21 | scheduled |
| SEC-2026-909 | low | P3 | 3.0.21 · bounded JSON bodies | scheduled |
| SEC-2026-910 | low | P3 | 3.0.21 · bounded JSON bodies | scheduled |
| SEC-2026-911 | low | P3 | 3.0.21 · bounded JSON bodies | scheduled |
| SEC-2026-912 | medium | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-913 | medium | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-914 | medium | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-915 | medium | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-916 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-917 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-918 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-919 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-920 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-921 | low | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-922 | info | P3 | after 3.0.21 · operator-script hardening batch | scheduled |
| SEC-2026-923 | info | P3 | comment-hygiene decision (with SEC-2026-895/-896) | scheduled |

**Audit of v3.0.19 (`cdde58e`), 21.10.2026: 0 critical, 0 high, 4 medium, 2 low, 3 info.** SEC-2026-897 to -902 go to 3.0.20; SEC-2026-903 to -905 join the comment-hygiene decision. No QA full review was needed (the change was under the thresholds). The reasons are in the sealed register.

**Audit of v3.0.20 (`52cdc27`), 22.10.2026: 0 critical, 2 high, 9 medium, 28 low, 3 info — all 180 candidates verified by the agent, all 42 findings checked by hand.** The two high findings (SEC-2026-906, -907) concern the agents' own workflows and need write access to the repository; by owner decision of 22.10.2026 they are fixed first in 3.0.21. SEC-2026-908 joins 3.0.21; the rest is P3 hardening, mostly of operator scripts. Nine findings were refuted and fifteen are duplicates of scheduled ones (the Firestore rules findings of SEC-2026-888 to -890 among them). The reasons are in the sealed register.

**Audit of v3.0.18 (`3f90d50`), 21.10.2026: 0 critical, 0 high, 4 medium, 5 low, 3 info — 125 candidates verified.** SEC-2026-885 to -887, -891 and -893 go to 3.0.19; the three findings in the Firestore rules (SEC-2026-888 to -890) go with the next rules deploy, which needs the owner's go; SEC-2026-892 and -894 to 3.0.20; SEC-2026-895 and -896 join the comment-hygiene decision. The reasons are in the sealed register.

**Audit of v3.0.17 (`c41f149`), 18.10.2026: 0 critical, 0 high, 3 medium, 2 low, 9 info — 129 candidates, delta of 152 files.** SEC-2026-871 to -876 go to 3.0.18 item 1; SEC-2026-877 to -884 are statements in code comments with no runtime effect and wait for the owner's decision on comment hygiene. The report's hardening list asks for the dependency advisories to be checked against the installed tree (3.0.18 item 1). The reasons are in the sealed register.

**Audit of v3.0.16 (`e41e227`), 16.10.2026: 0 critical, 1 high, 0 medium, 0 low — all 4 candidates verified, delta of 15 files, $0.04.** SEC-2026-870 (P1) goes to 3.0.17 and needs the owner; SEC-2026-869 was not reported again and is fixed. The reasons are in the sealed register.

**Audit of v3.0.11 (`7793427`), 12.10.2026: 0 critical, 0 high, 2 medium, 4 low, 2 info — all 64 candidates verified, $0.42.** SEC-2026-803 (P2) and -804 (P3) go to 3.0.12; six refuted (SEC-2026-805 and -806 as -791/-792, -807 as -794, -808 and -809 as -797, -810 against the code). The reasons are in the sealed register.

**Audit of v3.0.10 patch (`a6af162`), 12.10.2026: 0 critical, 0 high, 0 medium, 0 low, 1 info — all 6 candidates verified, delta of 10 files, $0.03.** SEC-2026-802 refuted as -797. The reasons are in the sealed register.

**Audit of v3.0.10 (`8cb8975`), 12.10.2026: 0 critical, 0 high, 2 medium, 4 low, 6 info — all 150 candidates verified, delta of 219 files, $0.90.** SEC-2026-790 (P2) goes to 3.0.11; eleven refuted (SEC-2026-791 and -792 as -165/-539, -793 as -415, -797 and -798 as -623, -794, -795, -796, -799, -800 and -801 against the code and its tests). The reasons are in the sealed register.

**Audit of v3.0.9 (`f574a22`), 11.10.2026: 0 critical, 0 high, 4 medium, 6 low, 4 info — all 85 candidates verified, delta of 122 files, $0.56.** SEC-2026-778 (P2) goes to 3.0.x security hardening with the next rules deploy, SEC-2026-787 (P3) to the comment wording with SEC-2026-771; twelve refuted (SEC-2026-777 and -785 as -746, -780 as -543, -782 as -628, -784 as -634, -786 and -789 as -767, -776, -779, -781, -783 and -788 against the code and its tests). The reasons are in the sealed register.

**Audit of v3.0.8 (`1c8e756`), 11.10.2026: 0 critical, 1 high, 1 medium, 0 low, 1 info — all 58 candidates verified, delta of 104 files, $0.37.** SEC-2026-774 (P2) joins the CSP rebuild with SEC-2026-674; SEC-2026-775 (P3) goes to 3.0.x security hardening with SEC-2026-771; the one reported as high, SEC-2026-773, is refuted as SEC-2026-756. The reasons are in the sealed register.

**Audit of v3.0.7 (`32285ae`), 10.10.2026: 0 critical, 1 high, 4 medium, 4 low, 8 info — all 151 candidates verified, delta of 268 files, $0.92.** SEC-2026-758 and -759 (P2) and -764 (P3) scheduled for 3.0.9 security hardening, -762, -763 and -771 (P3) for 3.0.x security hardening; -757 falls under the owner decision of 03.10.2026; ten refuted (SEC-2026-756 as -685/-750, -760 as -725, -761 as -680, -765 to -770 and -772: the comments hold against the code). The reasons are in the sealed register.

**Audit of v3.0.6 (`3b742fc`), 10.10.2026: 0 critical, 0 high, 7 medium, 3 low, 1 info — all 85 candidates verified, delta of 146 files, $0.54.** SEC-2026-751 and -752 (P2, one rules change with the next rules deploy) and -753 to -755 (P3) scheduled for 3.0.x security hardening; six refuted (SEC-2026-745 to -750: -746 to -749 as -670/-701/-702, -750 as -685). The reasons are in the sealed register.

**Audit of v3.0.5 (`4810125`), 07.10.2026: 0 critical, 0 high, 1 medium, 4 low, 3 info — all 81 candidates verified, delta of 108 files, $0.54.** SEC-2026-737 (P2) and -739 to -744 (P3) scheduled for 3.0.6 security hardening, the rules items with the next rules deploy; SEC-2026-738 refuted as a duplicate of -737. All concern code older than 3.0.5.

**Audit of v3.0.4 (`d373289`, manual run against 3.0.3 after the agent fix), 06.10.2026: 0 critical, 0 high, 4 medium, 7 low — all 50 candidates verified, delta of 61 files, $0.26.** 1 scheduled P2 and 8 P3 for 3.0.6 security hardening (moved from 3.0.5), 2 refuted (SEC-2026-726 as -680; -727). The push-triggered audits of bf058648 and 9974a157 verified nothing (schema refused in strict mode, fixed in d3732899) and are not counted.

**Audit of the v3.0.0 re-release (`69b4f52`), 03.10.2026: 2 high, 5 medium, 15 low — all
111 candidates verified; 1 fixed, 3 scheduled, 1 accepted risk, 17 refuted, the inbox is
empty.** 22 new register entries (SEC-2026-657 to -678), each checked at the cited line of
`69b4f52`; most repeat decisions of the `ab3dc34` audit on unchanged code. Both reported
as high are refuted (SEC-2026-657, -658), as were their predecessors; the reasons are in
the sealed register. Fixed on the 3.0 integration branch, not yet on `main`: SEC-2026-678
(P3). Scheduled: SEC-2026-674 (P2) and -675 (P3) to the CSP rebuild, which Sonny approved
on 03.10.2026 and which is in progress; SEC-2026-676 (P3) goes with the next rules deploy,
like SEC-2026-647. Accepted risk: SEC-2026-646 and its repeat SEC-2026-677 — Sonny decided
on 03.10.2026 that no admin ceiling is needed for now.

**Audit of v3.0.0 (`ab3dc34`), 03.10.2026: 1 high, 11 medium, 15 low — all 106
candidates verified; 9 fixed, 5 scheduled, 13 refuted, the inbox is empty.** 27 new
register entries (SEC-2026-630 to -656), each checked at the cited line of `ab3dc34`. The
one reported as high is refuted, as were its predecessors SEC-2026-552 and -555; the
reasons are in the sealed register. Fixed on the 3.0 integration branch, not yet on
`main`: SEC-2026-648, -649, -650, -652 (P2); -651, -653, -654, -655, -656 (P3). Scheduled:
SEC-2026-643, -644 (P2) and -645 (P3) to the CSP step; SEC-2026-646 (P2) needs Sonny's
decision; SEC-2026-647 (P3) goes with the next rules deploy.

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

**Delta review of 69b4f52 (v3.0.0 re-release, 03.10.2026, 3 model calls, $0.30):** five
findings were undecided. UX-184 is fixed: settings said "Back to My workspace" where every
other page says "Back to workspace" (`tests/back-link-wording.spec.ts` holds it). UX-182 is
scheduled for 3.0: the product counts lines two ways — a file ending in a newline is 669 by
`split` (`lib/source-lines.ts`, the signed run, the IT view) and 668 in the starter list and
the copy — so the fix is one definition across all of them, not a one-number patch.
UX-183 is refuted: the cited link is in the fallback dashboard; the workspace list links the
project name to the workspace object page. UX-185 and UX-186 are deferred like UX-180.

**Addendum 03.10.2026:** UX-182 is fixed (e808bc2f). Owner decision: a file that ends in a
newline has as many lines as an editor shows; the final newline ends the last line and does not
start an empty one. `countSourceLines` in `lib/source-lines.ts` is the one definition, and every
user-facing or stored count uses it, the signed run's `lineCount` of new runs included; line
indexing is unchanged. Runs signed before keep their stored count; nothing recomputes it from the
source, so they and their audit packs still verify. `tests/source-line-count.spec.ts` holds 668.

| ID | Severity | Finding | Roadmap step | Status |
|---|---|---|---|---|
| UX-002 | critical | Zero findings sealed as Fully Supported | 0.8 | fixed |
| UX-001 | high | Invented 95% and 80% bars without measurement | 0.2 | fixed |
| UX-003 | high | Verify pack upload cannot be operated by keyboard | 1.5 | fixed |
| UX-004 | high | Confluence export invents missing ratings | 1.2 | fixed |
| UX-007 | high | Target choice and dialogs not keyboard-operable | 1.5 | fixed |
| UX-019 | high | States shown more strongly than evidenced – bars, ticks, exports | 3.0 | fixed |
| UX-020 | high | Core paths blocked for keyboard and screen reader | 3.0 | fixed |
| UX-023 | high | Dark mode breaks on central surfaces | 1.6 | fixed |
| UX-024 | high | Orientation breaks between the areas | — | deferred |
| UX-037 | high | Transformation promises Node.js in the RAP track too | 0.2 | fixed |
| UX-038 | high | Remediation mode switches only text, not code | 0.2 | fixed |
| UX-040 | high | Transformation Insights are static and wrong for the track | 0.2 | fixed |
| UX-059 | high | Forum pretends a public post, saves only locally | 0.2 | fixed |
| UX-087 | high | Missing debt status appears in success green instead of neutral | 0.8 | fixed |
| UX-088 | high | Clean Core Score without distinction from SAP's opposing score | 3.0.18 | fixed |
| UX-091 | high | Mail warning promises resending, the row cannot do it | — | fixed |
| UX-094 | high | Old backup codes are rejected without a transition | — | deferred |
| UX-102 | high | How-to names 6 phases, the product has 7 stages | 0.2 | fixed |
| UX-121 | high | Invite icon without a name — only a title, no label | sofort | fixed |
| UX-122 | high | ToS notice pushes out the content on all routes | sofort | fixed |
| UX-138 | high | Integrity green means sometimes existence, sometimes a check | sofort | fixed |
| UX-145 | high | Tab "suspended" also shows Pending and Deleted | sofort | fixed |
| UX-165 | high | Blocked start explained only by tooltip, invisible to keyboard | 3.0.18 | fixed |
| UX-166 | high | Documentation shows the saved and the missing state at once | 3.0.18 | fixed |
| UX-005 | medium | Route change without confirmation and undo | 0.7 | fixed |
| UX-006 | medium | No way from a finding into the code | 3.0.18 | fixed |
| UX-012 | medium | Sticky header and tabs cover content on phone | 1.4 | fixed |
| UX-017 | medium | Very small type makes reading harder | 1.5 | fixed |
| UX-022 | medium | 78 button styles instead of one shared language | 1.5 | fixed |
| UX-025 | medium | Generation and errors without a way out and undo | after 3.0.18 | scheduled |
| UX-027 | medium | Green tick for unchecked code | 0.2 | fixed |
| UX-029 | medium | Compatibility claimed but not evidenced | 0.2 | fixed |
| UX-030 | medium | Phone covers content and swallows actions | 1.4 | fixed |
| UX-032 | medium | Printout without its own cost figures | 0.3 | fixed |
| UX-034 | medium | Task drawer does not trap the keyboard | 3.0.4 | fixed |
| UX-036 | medium | Systematic small type below 12px | 1.5 | fixed |
| UX-039 | medium | Audit check-offs are lost on reload | 0.7 | fixed |
| UX-041 | medium | Cards and minimap not keyboard-operable | 1.5 | fixed |
| UX-042 | medium | Buttons have 78 styles instead of one shared language | 1.5 | fixed |
| UX-043 | medium | Lots of text below 12px weakens readability and contrast | 1.5 | fixed |
| UX-045 | medium | Glossary and overlays not usable by keyboard and screen reader | 3.0.4 | fixed |
| UX-049 | medium | Missing design sections disappear silently | 1.2 | fixed |
| UX-056 | medium | Stepper and rail encode done differently | — | deferred |
| UX-063 | medium | Two example libraries compete on the dashboard | 3.0.5 | fixed |
| UX-064 | medium | Every section invents its own primary button | 1.5 | fixed |
| UX-065 | medium | Toggles without switch semantics for screen readers | 3.0.4 | fixed |
| UX-067 | medium | Critical actions in native browser dialogs | 1.5 | fixed |
| UX-069 | medium | Modal icon buttons without names for screen readers | 3.0.4 | fixed |
| UX-070 | medium | Tiniest type in load-bearing places barely readable | 1.5 | fixed |
| UX-073 | medium | Tiniest type 9-10px for badges and banners | 1.5 | fixed |
| UX-075 | medium | Eye buttons without an accessible name | 3.0.4 | fixed |
| UX-076 | medium | Onboarding cancellation with blaming wording | 0.2 | fixed |
| UX-089 | medium | Four terms for one value: Audit, Valuation, Asset Value, IP Score | 3.0.18 | fixed |
| UX-090 | medium | Deck error shows raw technical text without a next step | 0.8 | fixed |
| UX-092 | medium | Start button blocked by scan without a reason at the button | — | fixed |
| UX-093 | medium | Unsaved reports itself as a failed connection | — | fixed |
| UX-097 | medium | Empty blueprint page offers an export of nothing | sofort | fixed |
| UX-098 | medium | Package download fails silently without a notice | sofort | fixed |
| UX-099 | medium | Matrix close buttons without names for screen readers | sofort | fixed |
| UX-104 | medium | First-run return leads signed-out users behind the login | 1.4 | fixed |
| UX-106 | medium | NotGenerated names Settings but does not lead there | 3.0.18 | fixed |
| UX-107 | medium | Admin button signs out instead of in | sofort | fixed |
| UX-116 | medium | FREE badge conceals the first-run limit | sofort | fixed |
| UX-117 | medium | Read-only board still invites questions at the bottom | sofort | fixed |
| UX-118 | medium | Return has three different names | 1.5 | fixed |
| UX-123 | medium | ToS card pushes out work content on every route | sofort | fixed |
| UX-124 | medium | ToS gate pushes the task out of the first viewport | sofort | fixed |
| UX-125 | medium | Resending the mail is instructed but not possible | sofort | fixed |
| UX-126 | medium | Filters promise discussion, the board is read-only | sofort | fixed |
| UX-127 | medium | Disabled start does not name the personal-data reason | sofort | fixed |
| UX-131 | medium | ToS notice pushes out the work area in the first viewport | — | deferred |
| UX-135 | medium | Quota stop in a native alert instead of the product dialog | 1.4 | fixed |
| UX-136 | medium | Five icon buttons without text – invite barely discoverable | 3.0.18 | fixed |
| UX-139 | medium | Refused bundle without a direct way to Transformation | sofort | fixed |
| UX-140 | medium | Confirmation expires after an edit without explanation | sofort | fixed |
| UX-146 | medium | Welcome mail detail readable only by hover title | 3.0.4 | fixed |
| UX-148 | medium | Invitation without context forces blind acceptance | sofort | fixed |
| UX-149 | medium | Error boundary shows the raw error message open instead of collapsed | sofort | fixed |
| UX-152 | medium | Automatic approval runs without a way to cancel | sofort | fixed |
| UX-153 | medium | Invited readers land on the analysis start | — | deferred |
| UX-157 | medium | Approval page: counter-decision only via a second mail link | — | deferred |
| UX-158 | medium | Invite only as an icon without a visible name, hard to find | 3.0.18 | fixed |
| UX-159 | medium | Workspace loading shows sighted users an empty page | 3.0.18 | fixed |
| UX-160 | medium | Import error without feedback to the user | 1.4 | fixed |
| UX-161 | medium | Export without visible confirmation | 3.0.18 | fixed |
| UX-162 | medium | Pre-analysis overloads the start | — | deferred |
| UX-167 | medium | Counter-decision hint small and low in contrast | 3.0.18 | fixed |
| UX-168 | medium | Technical announcement invites questions without a way to answer | D.22a | fixed |
| UX-169 | medium | Documentation is named differently from the stage itself | D.9 | fixed |
| UX-170 | medium | Confirmation page without a way out for an invalid link | D.26 | fixed |
| UX-174 | medium | New one-off tokens for sizes and spacing without a system | after 3.0.18 | scheduled |
| UX-182 | medium | Line count of the demo program differs between list and starter card (669 vs 668) | 3.0 | fixed |
| UX-184 | medium | Back link to the workspace labelled differently on settings | sofort | fixed |
| UX-187 | medium | First-run guide promises seven clicks for seven multi-action steps | 3.0.20 | fixed |
| UX-188 | medium | Files saved in the personal example library before the dashboard rebuild have no way back — owner decision 22.10.2026: a short note on the dashboard for accounts that still have such files, with a ZIP download; no new library, no migration | after 3.0.20 | scheduled |
| UX-008 | low | Slideshow controls without names, arrow keys hijacked | 3.0.4 | fixed |
| UX-011 | low | Confusing finding terms and language mix | 3.0.18 | fixed |
| UX-013 | low | Preview contradicts editability, start misleading | 3.0.18 | fixed |
| UX-015 | low | Back navigation behaves differently per page | 1.4 | fixed |
| UX-016 | low | Catalog loses the workspace context | 1.4 | fixed |
| UX-026 | low | Terms and promises change per stage | 0.2 | fixed |
| UX-028 | low | LoC slider cannot represent the real value | 0.3 | fixed |
| UX-031 | low | SOP next step only in a hover tooltip | 1.2 | fixed |
| UX-033 | low | Slide switch without names | 3.0.4 | fixed |
| UX-035 | low | Long generation without cancel | after 3.0.18 | scheduled |
| UX-050 | low | Tiny labels and status only through colour | 1.5 | fixed |
| UX-053 | low | Error and 404 pages speak three languages | 3.0.18 | fixed |
| UX-057 | low | Grounded Grounding Audit duplicated and inconsistent | 0.3 | fixed |
| UX-058 | low | QuickAnswer reports open although collapsed | 3.0.4 | fixed |
| UX-060 | low | Project row and icon actions not keyboard-operable | 3.0.4 | fixed |
| UX-066 | low | 2FA button claims a scan without a QR code | 3.0 | fixed |
| UX-072 | low | Admin uses native confirm/alert instead of product patterns | 3.0 | fixed |
| UX-074 | low | Settings cards with arbitrary colour stripe | 1.5 | fixed |
| UX-078 | low | Admin rows without expanded state | 3.0.4 | fixed |
| UX-079 | low | Disabled register button does not explain itself | 3.0.18 | fixed |
| UX-080 | low | Showroom tabs without visible keyboard focus | 3.0.4 | fixed |
| UX-082 | low | Two header patterns on public pages | 3.0.6 | fixed |
| UX-084 | low | First run names the quota differently from the header | 0.2 | fixed |
| UX-085 | low | Tiniest labels in 10px small caps | 1.5 | fixed |
| UX-100 | low | Filter entry mixes German and English | sofort | fixed |
| UX-101 | low | 2FA key cannot be copied | sofort | fixed |
| UX-105 | low | Dark removal without a notice to existing accounts | after 3.0.18 | scheduled |
| UX-110 | low | Badge detail hidden only in the hover title | 3.0.4 | fixed |
| UX-115 | low | Demo promises seven stages without taking the user along | 0.2 | fixed |
| UX-119 | low | Empty documentation frame with a lot of empty space | 3.0.18 | fixed |
| UX-120 | low | New radii and type sizes without a connection to the system | 3.0.18 | fixed |
| UX-128 | low | New radii and one-off measures without a connection to the system | 3.0.18 | fixed |
| UX-134 | low | Blocked start explains itself only by hover title | 3.0.18 | fixed |
| UX-137 | low | New one-off radii and type without binding to the scale | 3.0.18 | fixed |
| UX-141 | low | Search promises discussions on read-only announcements | sofort | fixed |
| UX-142 | low | Optional imports with an inconsistent version label | sofort | fixed |
| UX-143 | low | Labels without a field on the approval page | sofort | fixed |
| UX-144 | low | Workspace gate loads silently for screen readers | sofort | fixed |
| UX-155 | low | Workspace loading empty for sighted users, only sr-only text | 3.0.18 | fixed |
| UX-156 | low | Return in two capitalisations | 1.5 | fixed |
| UX-164 | low | Return in two spellings | 1.5 | fixed |
| UX-180 | low | 30 new arbitrary width and spacing tokens undermine the design system | — | deferred |
| UX-181 | low | Stage name 'Economics' differs from the URL '/tco' and existing labels | — | deferred |
| UX-185 | low | One-off width tokens without a connection to the system | — | deferred |
| UX-186 | low | One-off width tokens in the delivery layouts | — | deferred |
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
notice) of the Terms those accounts accepted, on the owner's decision. The effective date is 3 October 2026,
the 3.0 release day, the day of the main deploy (it replaced 6 October 2026 on 02.10.2026 and the placeholder
15 October 2026 before anything was published).

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
