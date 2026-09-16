# Erhaltungsregister — the preservation register

**Roadmap step 1.1 · Phase 1 „Gerüst" · acceptance QA24-A04, W22-A04**

Before anything is rebuilt, what works is written down. This document is the half
a person reads; [`docs/registers/preservation-register.json`](registers/preservation-register.json)
is the same register in the form a test can check, and
[`tests/preservation-register.spec.ts`](../tests/preservation-register.spec.ts)
is the test that checks it.

**Verified against commit `52f171091948edc12384992f877e2be864c589d3`** (`origin/dev`,
16.09.2026), build `v2.11.0`, `firestore.rules` at SHA-256
`96ece81b…7fbe2` (of the LF-normalised file).

---

## 1. Why this exists, and what would make it worthless

`docs/ROADMAP.md` 1.1: *„die sieben Stufen mit Eingaben, Ausgaben,
Voraussetzungen, Fehlern und je einem Referenzfall; Commit, Build und Rules
fixiert. Nichts geht im Umbau unbemerkt verloren."*

The 3.0 rebuild replaces the workspace around these seven stages. The risk is not
that a stage disappears — that would be noticed. The risk is that a *field*, a
*guard* or a *refusal* disappears: the blocker that stops a blueprint being
written about code generated from a previous source, the refusal to call a
generated test suite "tested", the 409 the audit-pack route returns when the
source has moved. Those are invisible until someone relies on them.

So the register is only worth having if it is **true**, and it is only true if it
is **derived**. Nothing in it is a design intention. Every claim was read out of
the code at the commit above, and the guard re-derives it on every run: if a
stage gains or loses a field, changes a guard, or if `lib/workflow-steps.ts` and
this register disagree about the order or the blockers, the spec fails. Where the
code and the register disagree, **the code wins and the register is wrong**.

Two of the entries below exist precisely because the code did something other
than the roadmap prose suggests. They are recorded as limits, not corrected: see
§6.

## 2. Where it lives, and why there

| | |
|---|---|
| `docs/PRESERVATION-REGISTER.md` | this file — the reasoning, the summary table, the limits |
| `docs/registers/preservation-register.json` | the register itself: stages, inputs, outputs, preconditions, errors, reference cases, the fixed baseline |
| `tests/preservation-register.spec.ts` | derives all of it from the code and fails on any disagreement |

Three files rather than one, for three reasons.

**The register is data, not prose.** Its value is that a machine can compare it
with the code. A Markdown table cannot be diffed against
`app/api/runs/create/route.ts`; a list of field names can. JSON rather than a
TypeScript module because the register is documentation about the product, not
part of it — it must not be importable into a bundle, and it must survive a
rewrite of the very modules it describes.

**The prose is not generated from the data.** A generated document says what the
data says, which is exactly what a reader cannot check. This file says *why*, and
the "why" is the part that will be argued about during the rebuild.

**`docs/registers/` rather than `docs/`.** Step 3.0.3 re-runs the reference cases
against the new workspace, and later phases will add registers of their own
(evidence anchors, provenance). A directory now is cheaper than a move later.

## 3. The seven stages

Order and per-phase state come only from `lib/workflow-steps.ts`
(`docs/ARCHITECTURE.md` §2). No stage reads `project.status`.

| # | Stage | Requires | Writes to the project | Blocked by | On a model failure |
|---|---|---|---|---|---|
| 1 | **Analyze** | `legacyCode` | *client:* `worklist`, `extensibilityRoute`, `exports` · *command (`/api/projects/{id}/commands`):* `usageReport` · *server (`/api/runs/create`):* `activeRunId`, `status`, `charged`, `transformationBypass`, `legacyCode`, `s4Deployment`, `updatedAt`, `worklist`, `extensibilityRoute`, `auditMetadata` — and the immutable `runs/{runId}` | file type, 1 MB, the staged-code scan, `looksLikeAbap`, auth + MFA + account state + quota | the run is still created from the deterministic findings alone; a thrown error shows a banner |
| 2 | **Design** | `activeRunId`, `analysis` | *client:* `solutionDesign`, `status`, `nonFunctionalRequirements`, `exports` · *command (`/api/projects/{id}/commands`):* `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`, `architectSignOffAt`, `approvedBy` | `enforceActiveRun` only — there is no `design` target in `generationBlockers`; the sign-off itself additionally needs a signed run, a known architecture and a reason for an override, all decided on the server | an empty response throws; nothing is written; the NFR call may fail silently |
| 3 | **Transformation** | `activeRunId`, `legacyCode`, `solutionDesign`, `analysis` | `generatedCode`, `testSuite`, `status` | `enforceActiveRun`, `generationBlockers(…, 'transformation')`: source changed, design stale, sign-off stale | no usable file → throws, **nothing is saved**, the previous artefact stays |
| 4 | **Documentation** | `activeRunId` | `documentation`, `businessDocumentation`, **`generatedCode`**, `status` | `enforceActiveRun`, `generationBlockers(…, 'documentation')`: the three above **plus** code stale | an empty response throws; `docError` is shown; nothing is written |
| 5 | **Testing** | `activeRunId` | `s4Environment`, `testCases`, `testSuite`, `coverageEstimate`, `manualTestingRequirements`, `generatedCode`, `status` | `enforceActiveRun`, `generationBlockers(…, 'testing')`, and `LIVE_TEST_EXECUTION` (G0:R0) | generation rethrows; a build error auto-heals and retries; a dead sandbox throws |
| 6 | **Economics** | `activeRunId`, `cleanCoreScore` | **nothing** | `enforceActiveRun`; a score of `null` or ≥ 95 declines to model anything | no model is called from this stage |
| 7 | **Delivery** | `activeRunId` | **nothing** | `enforceActiveRun`, `handoverBlockers`, and the server's own 409 (`source-changed`, `sign-off-stale`) | a detector error reads "coverage not established", never a clean bill |

Two entries in that table are worth reading twice. **Documentation writes
`generatedCode`** — it inserts `docs/process-blueprint.md` into the transformation
stage's file workspace, inside a transaction that re-reads it. And **Delivery
writes nothing at all**: opening it used to set `status: 'completed'`, which meant
"somebody opened the last tab", and that was removed on purpose.

## 4. What the fixed baseline means

`Commit, Build und Rules fixiert` (QA24-A04: *„Review gegen einen Build
wiederholen — Commit, Schema, Rules, Katalog und Deploymentbezug explizit
erfasst."*) is not decoration. It is what makes a later re-review repeatable.

- **Commit** — `52f171091948edc12384992f877e2be864c589d3`. The register describes
  that tree and no other. The guard requires this file and the JSON to name the
  same one.
- **Build** — `v2.11.0`; `npx tsc --noEmit -p tsconfig.json`, `npm run lint`,
  `npm run build` (which fails on any TS or ESLint error), `npx playwright test
  --workers=1` against the auth and Firestore emulators started with
  `--project=cleancore-491216`.
- **Rules** — `firestore.rules`, pinned by the SHA-256 of its LF-normalised text.
  The guard also parses the client-writable allowlist out of the file and checks
  that every field a stage writes from the browser is in it. **CI never deploys
  the rules** (`npm run deploy:rules` is manual), so a register that did not pin
  them would describe a permission model nobody had deployed. Since roadmap 0.7
  the register no longer has to pin them *alone*: `docs/registers/rules-deployment.json`
  records which text is actually live, `npm run rules:check` compares it with the
  working copy, and `tests/rules-deploy-order.spec.ts` fails when the app would
  ship ahead of a rules change it depends on.
- **Deployment** — Cloud Run `europe-west1`, project `cleancore-491216`: `main` →
  `clean-core`, `dev` → `clean-core-dev`. `release` was retired on 31.08.2026.

When `firestore.rules` changes, the spec fails with a message telling the reader
to re-verify the register and update the hash. That is the point: the rules are
half of what "the stage requires" means, and they move independently of the code.

## 5. The reference cases

One per stage, each a project document plus its run document, seeded into the
Firestore emulator and then opened in a browser signed in as its owner. The
register states the expected state of all seven phase circles, the badges, the
blockers and whether a stale notice appears; the spec asserts every one of them
on screen, so the real `loadProjectAndHydrate` and the real rendering have to
agree with the contract.

| Reference case | Stage | What it pins |
|---|---|---|
| `RC-analyze-signed-run` | Analyze | a signed run is `done`; Economics is already `partial`; Delivery is `empty`, not "ready" |
| `RC-design-awaiting-sign-off` | Design | a generated design nobody confirmed is `partial`, never `done` |
| `RC-transformation-generated-not-tested` | Transformation | "Generated — not compiled or tested"; Delivery drops to "Review only" |
| `RC-documentation-blocked-by-stale-code` | Documentation | the blueprint refuses to describe code built for a previous source, and says so on screen |
| `RC-testing-draft` | Testing | generated cases with no verdict are a draft in every view; Delivery says "tests not run" |
| `RC-tco-model-estimate` | Economics | "Model estimate", from assumed coefficients — never `done` |
| `RC-delivery-blocked-source-changed` | Delivery | the source moved: all seven phases `stale`, both downloads disabled |

No reference case triggers a model call, so the whole set runs against the
emulators with no API key — which is also what makes them usable as the
acceptance for step 3.0.3.

Digests are never hard-coded. A seed writes `@sha256:legacyCode` or
`@artefactDigest:generatedCode`, and the spec resolves it with the very functions
the product uses (`lib/artefact-digest.ts`), so a reference case cannot drift from
the hashing it depends on.

## 6. What the code does that the prose did not say

The most valuable part of this step. Each of these was found by reading the code
at the baseline commit, each is recorded in the JSON as a `knownLimit`, and each
has an assertion in the guard so that fixing it forces the register to be updated.

- **L-01 — Testing can never be `done`.** No code path writes a verdict back onto
  `project.testCases[].status`. The testing page shows a run's verdicts on screen
  and stores nothing. Because Delivery's readiness depends on Testing being
  `done`, **Delivery can never be `done` either.** `docs/ARCHITECTURE.md` §2 says
  this; it is worth saying again where the rebuild will read it.
- **L-02 — a missing sign-off is not a delivery gap.** `workflowSteps()` counts
  only generated code, tests and documentation. If every test passed, the contract
  would report Delivery `done` beside Design `partial (Awaiting sign-off)`. Only
  L-01 keeps that combination out of reach today.
- **L-03 — two artefacts leave in the bundle that can never be stale.**
  `TRACKED_ARTEFACTS` covers `solutionDesign`, `generatedCode`, `testCases` and
  `documentation`. The delivery ZIP also carries `testSuite.code` and
  `businessDocumentation`, and neither is tracked — so a bundle for the current
  source can contain a test suite and a business SOP written for the previous one,
  with nothing saying so.
- **L-04 — the blueprint reads slices.** The documentation prompt is built from
  the first 1,000 characters of `generatedCode`, `solutionDesign` and `analysis`.
  A business rule beyond that cannot reach it (QA24-A10).
- **L-05 — two stages show staleness only as a coloured circle.** Analyze and
  Economics are the only stages that render no `StaleNotice`, although
  `workflowSteps()` can put both in `stale` ("Source changed", "Modelled on the
  score of a different source").
- **L-06 — Design generates by itself.** Opening stage 2 with an analysis and no
  design starts a model call with no user action, and `generationBlockers` has no
  `design` target, so nothing about staleness stops it. (Regenerating is also how
  a stale design is cleared, so the behaviour is not simply wrong — it is
  unguarded.)
- **L-07 — the run's `status` wins.** `loadProjectAndHydrate` spreads the run over
  the project, and the run carries `status: 'completed'`. Every hydrated project
  therefore reads `completed`, whatever the project document says. Harmless only
  because `lib/workflow-steps.ts` refuses to read `status` at all.
- **L-08 — Economics cannot be completed in this release**, and
  `workflowSummary().next` skips it so "continue" never parks there. Deliberate
  (CR-23 / E12-F02).

Three further observations are recorded in the JSON's per-stage `errors` rather
than as limits, because they are about error handling rather than about the
contract:

- **Analyze alone has no "project not found" path.** Transformation says *Project
  not found.*, Testing renders a "This stage could not be opened" panel; Analyze
  renders the upload area as though the project were new.
- **Design alone surfaces `_runLoadFailed`.** Every other downstream stage passes
  `enforceActiveRun` (the id is there) and then renders an empty artefact without
  saying that the run could not be read.
- **Design's load effect has no `try`/`catch` and no `finally`.** A rejected
  `loadProjectAndHydrate` leaves the page on its loading state with an unhandled
  rejection — the same class of defect that was fixed in Testing.

## 7. What is locked, and why (inherited from `G0:R0`)

`docs/roadmap/SCHNITT-0-UMFANG.md` §1: *„Die Grenze steht in `SECURITY.md`; das
Erhaltungsregister erbt sie in v2.11."* It does, by reference rather than by
copy — `lib/locked-paths.ts` is the single source, and the guard checks that the
register still points at it and that the lock is still closed.

**`G0:R0` · Testing.** Executing generated tests against a connected S/4HANA
tenant is closed. Running them against mocks in the restricted runner, the
connection check, the OData metadata read and one read-only OData call stay open.
The reason and the four conditions for reopening are in `lib/locked-paths.ts` and
`SECURITY.md` §7.1.

## 8. Changing the register

1. Change the code.
2. Run `npx playwright test tests/preservation-register.spec.ts --workers=1`. If a
   stage gained or lost a field, a guard, a blocker or a written collection, it
   fails and names the field.
3. Update `docs/registers/preservation-register.json` to what the code now does —
   not to what it was supposed to do.
4. If `firestore.rules` changed, update `baseline.rules.sha256OfLfNormalisedText`
   and deal with the deploy: `npm run deploy:rules` (manual — it deploys to every
   database *and* records the new text in `docs/registers/rules-deployment.json`
   in one command), or, if the deploy has to wait, `npm run rules:record --
   --pending "<why>"`. A rules change that gives a client a field it did not have
   must be deployed *before* the app that uses it; `npm run rules:check` and
   `tests/rules-deploy-order.spec.ts` refuse the other order.
5. If the change removes a limit in §6, delete the limit and its assertion in the
   same commit. A limit that is quietly fixed and quietly left in the register is
   the same failure as one that is quietly introduced.
