# G4 / DW-2 — four paths through the chain, with negative probes

**Spec:** `tests/g4-chain-acceptance.spec.ts` · **Owner go:** 02.10.2026 · **Rows:** DW-2 and G4
of `docs/release/3.0-acceptance.md` · **Answers:** Codex synthesis of 02.10.2026, G4 row and
open question 2 (where are the three paths plus the undecidable case).

The roadmap asks for "not one corpus case through the whole flow, but three complete paths —
standard adoption, targeted extension, retirement — plus one case that stays undecidable on
business grounds and is shown exactly as such, each with negative probes (wrong evidence,
faulty generation, access and revision changes)" (`docs/ROADMAP.md` §4, acceptance order;
§15 G4, the proven handover). This file says what the spec proves for each path, which corpus
case it uses, how to run it, what the run gave — and what the product cannot do today.

**Result in one line:** paths 2 (targeted extension) and 4 (undecidable) are complete. Paths 1
(standard adoption) and 3 (retirement) run through every stage **except the confirmed
decision**: the product cannot confirm a Retire decision (finding **G4-F1**), so both stop at
"signed off, decision drafted, not confirmed", and the spec records that as an expected
failure rather than working around it. G4 is therefore **not** closed by this run.

## How it runs

Everything goes through the real routes against the Firebase emulators and an emulator build
of the app:

| Stage | Route or page | Who acts |
|---|---|---|
| Analyze | `POST /api/runs/create` (no narrative → `modelParticipation: none`); the stored run is checked against its own HMAC (`lib/run-signature.ts`) | owner |
| Design | owner's Firestore client writes `solutionDesign`; `approve-architecture` through `POST /api/projects/{id}/commands`, bound to run and evidence digest | owner |
| Decision | `GET /api/projects/{id}/decision` → `record-decision-draft` → `confirm-decision` | owner |
| Transformation | `GET /api/projects/{id}/contract` (contract + generation token) → `POST …/contract` (server-side store, roadmap 3.0.11) | owner |
| Documentation | the Documentation stage in the browser (`[data-generate-blueprint]`) | owner |
| Testing | owner's client writes the scenarios and `testSuite.code` (Testing step 1); `POST /api/run-tests` runs them in the emulator build's sandbox runner (`runner.kind: local-emulator`) and writes the receipt | owner |
| Economics | nothing to store: the cost model is not persisted (see G4-F3) | — |
| Delivery | `POST /api/audit-pack/create`; the ZIP is checked by `lib/audit-pack-verify.ts` (HMAC via `/api/export/verify`, Ed25519 against this server's `/.well-known/clean-core-io-signing.json`) and offline by `node scripts/verify-pack.mjs --key <published key>`; the handover is read with `lib/handover.ts` over the project as `hydrateProject` hydrates it, and the Delivery page is opened in a browser | owner |

**No model call, no mail.** The three texts a model writes on the way — the design document,
the generated package and the test scenarios — are fixtures in the spec, written exactly where
the browser writes the model's answer. No request reaches `/api/gemini`. The server is started
with every model and mail key blank (the acceptance script's `safeEnv()`, or the local config
below). Accounts are fresh emulator accounts on `test.invalid`; seeding and read-back go
through the app's own test seed route (`app/api/test/seed`, three gates).

**Ed25519.** `scripts/release/acceptance.mjs` starts the server without
`AUDIT_SIGNING_PRIVATE_KEY`, so packs carry the HMAC only; the spec then expects
`verify-pack.mjs` to exit 2 ("cannot check offline") and verifies the HMAC through the issuer,
and says so in a test annotation. With a key configured it expects exit 0 against the published
key. A tampered pack must exit 1 either way.

### Commands

Emulators on :9099/:8080 (project `cleancore-491216`) must already run.

```bash
# Through the acceptance script (production build made with NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true)
TEST_BASE_URL=http://localhost:3581 npx --yes --package=node@22 -- \
  node scripts/release/acceptance.mjs --mode rendered --rows DW-2,G4 --serve 3581

# The spec alone, against such a server
npx playwright test tests/g4-chain-acceptance.spec.ts -c .release/playwright.acceptance.config.ts
```

`TEST_BASE_URL` matters for the other specs of the two rows (`tests/helpers/admin-seed.ts`
seeds through it and falls back to port 3000); this spec reads its base URL from the config.
For a local run on `next dev`, a throwaway config like `playwright.port4300.config.ts` with
`workers: 1`, the model and mail keys blanked and an optional generated Ed25519 key does the
same; keep it out of the commit.

## The four paths

### Path 1 — standard adoption · `CC-001`

A report that selects customers from KNA1 and lists them.

| Step | What the spec proves |
|---|---|
| Analyze | signed run, verified against its HMAC; engine route In-App; finding on KNA1 |
| Standard | the architecture contract names `KNA1 → API_BUSINESS_PARTNER` from the catalogue and keeps "Cover the requirement with SAP standard — build nothing" as an open alternative; the standard-fit layer claims no fit (for this case it holds no capability row at all — no business rule to read one from) |
| Design | the account signs off **Retire (Standard Replacement / Deprecation)** — the product's only option for adopting the standard — with a reason |
| Decision | drafted from the sign-off, bound to the run; **confirmation fails (G4-F1)** — marked `test.fail` |
| Delivery | pack sealed against the current run, authentic, names run and run hash; the attested file carries the sign-off and the approver; the handover shows the design confirmed, the decision *draft, not confirmed*, transformation and tests open (nothing generated, nothing claimed); the Delivery page shows the same |

Probes: an evidence digest the run does not carry → 409 `evidence-moved`; Retire without a
reason against the engine route → 400 `override-needs-reason`, nothing written; a stranger's
sign-off → 404; a stranger reads the decision → 404; a stranger confirms → 404; a pack with
one appended row in `03-findings.csv` → `verifyAuditPack` *failed*, `verify-pack.mjs` exit 1.

### Path 2 — targeted extension · `CC-031`

An RFC with a dynamic destination — `UPDATE zcc_decision`, `CALL FUNCTION … DESTINATION`,
`COMMIT`/`ROLLBACK`.

| Step | What the spec proves |
|---|---|
| Analyze | signed run; engine route Side-by-Side; contract `side-by-side-cap` |
| Design | CAP signed off with no departure (`recommendationBasis: contract`) |
| Transformation | a CAP package (service, CDS schema, package.json, Dockerfile, ERP-side publisher class) stored through the generation store with its token; `generationBinding` names the contract fingerprint; the handover calls it *proposed*, never proven |
| Documentation | read out of the signed source by the Documentation stage in the browser (*reconstructed*) |
| Testing | three node:test cases run in the sandbox runner; receipt `environment: mock`, `runner.kind: local-emulator`, all three *Passed*; Testing badge *Passed · mock*; the handover's tests link, quality facet and receipt group are **Demonstrated · mock**; the only *proven* links in the whole chain are the signed run and its analysis; Delivery *Ready · mock tests* |
| Decision | CAP decision confirmed by the account, DEC-1 revision 1, bound to the run |
| Delivery | pack authentic, names the run; handover: no blockers, only the cost model still open; Delivery page: receipt box *Demonstrated · mock* and no "Proven", status *sandbox test run*, decision *confirmed* |

Probes: a sign-off naming a run nobody read → 409 `run-moved`; a package without its
Dockerfile → 400 `package-incomplete`; a generation token from before the design changed →
409 `generation-stale`, no code written; the owner's client writing a (live) `testRunReceipt`
→ permission denied; owner-written *Passed* verdicts → *Self-reported*, not a run; a stranger
runs the suite → 403; **a new run of the same source** → the decision of run A is *stale*
("Recorded for a previous analysis run"), the export of run A is not one of run B, the receipt
covers nothing; redrafting a confirmed decision in place → 409 `decision-confirmed`; withdraw,
redraft, confirm → **DEC-1 revision 2** bound to run B, pack sealed against run B, receipt
re-earned by running again; **the source changes after generation** → design, sign-off, code,
tests and documentation are blockers, transformation and tests *stale*, the decision *stale*,
the handover facet *Blocked*, the pack refused (409 `sign-off-stale`), and the confirmation
prepared on the old run refused (409 `run-moved`); tampered pack → failed / exit 1.

### Path 3 — retirement · `CC-047`

A logical-database report that reads KNA1 without a SELECT — `NODES kna1`, `GET kna1`.

| Step | What the spec proves |
|---|---|
| Analyze | signed run |
| Usage | an SCMON import recorded through `record-usage-report`; the Analyze stage's join (`joinUsageWithEvidence`) makes ZCC_REF_047 a **Retire candidate** for zero calls over a 396-day window, described as "retire after business owner confirmation" |
| Candidate ≠ decision | with nothing signed off the decision picks nothing; confirming it → 409 `decision-blocked`; the handover does not read it as confirmed |
| Design | Retire signed off with the usage evidence as the reason |
| Decision | drafted, *Derived by rules, not confirmed*, still needed; cost binding not determined (G4-F3); **confirmation fails (G4-F1)** — marked `test.fail` |
| Delivery | pack authentic against run A; after a new run of the same source the export of run A no longer counts, the draft is *stale*, the usage evidence still only makes a candidate, and a new pack is sealed against run B; the Delivery page shows the decision *not confirmed* and still needed |

Probes: zero calls over 42 days → *unknown*, not a candidate; Retire without a reason → 400;
an invited reader (as `readersAfterGrant` writes it) reads the decision with `canDecide: false`,
cannot confirm (404), revoke the sign-off (404), seal a pack (403) or write the project from
the client (permission denied); after the owner revokes the reader through
`DELETE /api/projects/{id}/readers`, the reader's next read is 404; tampered pack → failed /
exit 1.

### Path 4 — undecidable · `CC-021`

A missing INCLUDE — the route rule is in `INCLUDE
zcc_ref_021_rules`, which was not supplied.

| Step | What the spec proves |
|---|---|
| Analyze | signed run; what the engine says is recorded, not endorsed (see G4-F2) |
| Decision | the draft says "No target architecture is signed off yet, so this decision picks nothing", option not determined; it can be drafted and **cannot be confirmed** (409 `decision-blocked`), stays *draft* |
| Delivery | pack authentic; attested file "Target architecture chosen: Not chosen", "Architect sign-off: not given"; handover: decision *draft, not confirmed* and "picks nothing", design *proposed*, architecture facet *Pending*, design and decision still needed, **no link in the chain reads as confirmed** |
| Pages | Design: the answer is *Recommended*, never confirmed; Delivery: *draft, not confirmed*, decision box not confirmed, "decision" in the still-needed list |

## Findings

**G4-F1 — a Retire decision cannot be confirmed (release-relevant; paths 1 and 3).** The
sign-off options are RAP, CAP, Integration Suite, Event Mesh and Retire; standard adoption
and retirement both go through Retire. `contractOfProject` (`lib/contract-build.ts`) answers
`off-track` for any decision off the two generation tracks (`declaredDeviation`), so
`deriveProjectDecision` (`lib/decision-facts.ts`) builds the decision with `contract: null`;
the `contract` binding is then not determined, `decisionCoverage` (`lib/project-decision.ts`)
counts `contract-not-bound` as blocking, and `confirm-decision` answers **409
`decision-blocked`: "No architecture contract is bound."** Observed on the running server for
both paths. The unit tests that show a Retire decision as confirmable
(`tests/decision-card.spec.ts` "an option the comparison does not carry still has a kind")
build the draft with a contract fixture the real derivation never produces. Effect: no
standard adoption or retirement can reach a confirmed decision, and the Management view's
"Confirm the decision" can never complete for them. The spec marks the two confirmations
`test.fail` with this ID; when the gap is closed they fail as "passed unexpectedly" and the
mark comes off.

**G4-F2 — the undecidable case reads as decidable on Analyze and Design.** For CC-021 the
engine records 0 findings, a Clean Core Score of 95 and the In-App route at confidence 55; the
missing include appears neither as a finding, nor as a missing object (`buildClassModel`
reports none), nor among the unassessed constructs (only `WRITE` is listed). The Design stage
answers *Recommended · Developer Extensibility (RAP / ABAP Cloud)* — "No legacy pattern was
detected in the part of the code the engine assessed" — and gives no sign that the deciding
logic was never seen. The corpus baseline already records the miss (CC-021-F01, R16, "no
bridge"; "no evidence comes out as the best result"). *Not determined* is visible only on the
decision side (no option chosen → blocked), which the spec proves holds end to end. Belongs
to G0 as much as to G4.

**G4-F3 — no decision binds a cost revision.** `deriveDecisionDraft` never binds one, by
design: the Economics comparison is held in page state and not stored
(`lib/decision-draft.ts` header). DW-2's manual text ("decision binds the cost revision") and
G3's minimum acceptance ("the decision binds need and cost revision", marked green) cannot be
met today; every decision says *cost not determined* with a reason, and the handover keeps
"a cost model" in its still-needed list.

**G4-F4 — the pack carries the analysis, not the decision.** The signed pack names the run and
its hash, and `07-user-attested.md` carries the sign-off ("this one holds the decision"); the
confirmed decision record (DEC-n, revision, confirmation, bindings), the generated code and the
test receipt are not in it — the evidence chain says so (`covers[]`: decision attested,
receipt and delivery not determined). This is the scope the owner accepted for 3.0 (`usp-03`
after 3.0); recorded so that nobody reads "handover verified" as more.

Smaller observations, none blocking the paths:

- `lib/evidence-chain.ts` writes into the signed `09-evidence-chain.json` that a test-run
  receipt "sits on the project document where the browser can write it". The spec shows the
  browser cannot (`testRunReceipt` → permission denied); the sentence is stale.
- A suite stored only by the generation store (`{ config, spec }`) runs — the route falls back
  to `spec` — but the receipt it writes can never cover the project (`testRunSubject` hashes
  `testSuite.code` only). The Testing stage's step 1 writes `code`, so the normal path works.
- `/api/audit-pack/create` enforces the source and sign-off part of the staleness rules; the
  stale code, tests and documentation block only the Delivery page's buttons. The pack carries
  none of them (G4-F4), so nothing stale leaves inside it.
- After a re-run, the Delivery page's decision box falls back to the sign-off and reads
  "Confirmed by … — no decision recorded yet" while a stale decision is on record.
- `/api/runs/create` logs a JSON parse warning for every run without a narrative.
- On `next dev` the server restarts at its memory threshold during the full file
  (ECONNRESET once per full run); the per-path runs and the production server do not.

## Result of the run

| | |
|---|---|
| Date | 02.10.2026 |
| Base commit | `6d4a6401` (`integrate/next-3.0`) plus the commit that adds this spec |
| Node | v20.12.2 (test runner); `next dev` and `next start` on the same machine |
| Emulators | Auth :9099, Firestore :8080, project `cleancore-491216` |

| Run | Server | Result |
|---|---|---|
| `scripts/release/acceptance.mjs --mode rendered --rows DW-2,G4 --serve 3581` under Node 22.23.2 | `next start`, production build with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, `safeEnv()` (no Ed25519 key) | **24 of 24 passed** in `g4-chain-acceptance.spec.ts` — 22 passing tests and the two G4-F1 tests failing as expected; offline verifier exit 2 (HMAC only) as the spec expects, tampered packs exit 1. Same run: `trust-chain-e2e` and `trust-chain-binding` green; `full-pipeline` 1 failed (not part of this work, not investigated here). 49 passed, 1 failed in 133 s |
| Per path, `npx playwright test --grep "path N "` | `next dev` on :3581, model and mail keys blank, a generated Ed25519 key | path 1: 6/6 · path 2: 9/9 · path 3: 6/6 · path 4: 3/3 — `verify-pack.mjs --key <published key>` exit 0 on every genuine pack, exit 1 on every tampered one |

What the engine said about the undecidable case in this run (test annotations): route *In-App
(ABAP Cloud)*, confidence 55, Clean Core Score 95, 0 findings; Design stage text: "Recommended ·
Reconstructed · Developer Extensibility (RAP / ABAP Cloud) · No legacy pattern was detected in
the part of the code the engine assessed. On-Stack Developer Extensibility (RAP) is the
recommended path. Confidence 55 — the router's, not a proof."

**Verdict for the rows.** DW-2 and G4 stay **open**: the protocol and the spec now exist and
pass, but two of the three complete paths cannot reach a confirmed decision (G4-F1), the
undecidable case is shown as undecided only on the decision side (G4-F2), and no decision
binds a cost revision (G4-F3). G4-F1 is release-relevant; G4-F2 and G4-F3 need an owner
decision on whether they hold 3.0.

The acceptance script's rendered mode could not run at all before this work: it waited for
`/api/health` to answer below 500, and the health probe answers 503 *degraded* whenever
`GEMINI_API_KEY` is empty — which `safeEnv()` makes it on purpose — so every `--serve` run ended
with exit 3. The wait now accepts any HTTP answer.
