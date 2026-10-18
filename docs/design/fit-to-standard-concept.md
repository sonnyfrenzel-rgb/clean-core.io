# Concept — Fit to standard (roadmap 3.0.20)

**Owner decisions of 18.10.2026 on this concept** (they win wherever the text below leaves a choice):

1. The offer is gated by the **kind of program** (classes A–D below), not by the clean core score; the score is shown, never a threshold.
2. Where it is not offered, the **IT view names the reason** with its lines; Business and Management show nothing.
3. A user **may still request** the fit-to-standard design against the gate; it then carries, visibly, that the engine does not recommend this path and why, and it never counts as a recommendation.
4. Offered for **Public and Private Edition** targets (Public as the main path).
5. A model **may propose** SAP apps and scope items — on the shared key within the existing limits and with BYOK; every identifier is checked against SAP's own data, a mismatch is dropped.
6. The scope-item list is **curated by the owner** by hand; no scripted access to SAP sites.
7. "Move to SAP standard" **may be confirmed with open gaps**: each open gap becomes a condition of the decision, visible in Management, and cannot be attested away.
8. Terms: the decision option stays **"Move to SAP standard"**; the Design result is the **"fit-to-standard design"**.
9. Order: **3.0.19 key-user extensibility first**, then 3.0.20 fit to standard.


Status: concept only, 18.10.2026. Nothing in the repository was changed. Every claim about the
current product cites a file and line as read on `dev` (`44f03cd4`). Where something is a
proposal or a hypothesis, it says so.

---

## 0. What exists today (read, not assumed)

| Piece | Where | What it does — and what it does not |
|---|---|---|
| The four options | `lib/decision-options.ts:22-48` | Keep · Rebuild · **Move to SAP standard** · Retire. "Standard" is chosen **directly in Management** and "builds nothing" (`:37`, `DIRECT_CHOICE_CODE` `:47`); only Rebuild is signed off in Design. |
| The evidence per option | `lib/decision-option-signals.ts:25-27`, `:259-266` | The standard option is **always `not-determined`**: "Whether SAP standard does what this program does is a business question the code cannot answer." This is the product's own honesty rule and the concept must keep it. |
| Decision record | `lib/project-decision.ts` (header `:1-66`, bindings `:89-97`, `DECISION_VERSION = 1` `:74`) | Binds need revision, option, cost revision, contract, run; confirmed by the account as a self-declaration (`SELF_DECLARATION` `:86`). Reversibility already knows "retire with confirmed drops" (`:290`). |
| "Standard weighed?" | `lib/standard-fit-gate.ts:110-140` | Standard counts as weighed only when the confirmed decision is `standard`, or the design's option comparison weighed it on facts (a model proposal). Drives a warning before a rebuild (`:159-164`) and the Transformation prompt (`lib/transformation-context.ts:371-387`: "THE DECISION ON RECORD IS TO MOVE TO SAP STANDARD — IT BUILDS NOTHING"). |
| Distance to standard (ADR-069) | `lib/standard-fit.ts:13-60`, `:273-403` | A **technical** measure: share of the SAP objects the code uses that have a released path on the target edition. Explicitly "our measure, not SAP's" (`:54-56`); `none-used` when the code touches no SAP object (`:300-309`). It says nothing about whether the standard *does what the program does*. |
| Standard fit table (7.2) | `lib/standard-fit-view.ts:14-27`, `app/api/projects/[projectId]/standard-fit/route.ts:24-33` | Capabilities = rules on the same subject; catalog successor = E1 "a pointer, not a fit"; **no scope item is ever derived** ("always empty today", `standard-fit-view.ts:62`). Read-only, no model, nothing signed. |
| Evidence ladder | `lib/evidence-level.ts:14-47` | E0–E4; catalog link and scope item capped at E1; E4 = account's acceptance = *Confirmed*, never green. |
| Element comparability (7.8) | `lib/abap/element-comparability.ts:30-50`, `compareElement` `:615-670` | Every element is `business-comparable` / `technical` / `structural` / `unknown`; only the first may carry a standard candidate; three outcomes `covered · not-covered · unknown`. **No standard reference is wired in** — the only consumer is the skeleton reader (grep: `lib/abap/process-skeleton.ts`). |
| SAP identifier check | `lib/sap-reference-check.ts:20-82` | Any SAP ID in model text gets `verified · mismatch · catalog · unverified`; "verified never says the SAP object covers the use" (`:47-49`). Born from the QM/FI/SD/CO reviews (F2358, 19M, 1EG, SAP_COM_0093 — `:24-31`). |
| Scope item data | `lib/sap-scope-items.ts:44-97` (13 IDs with SAP page), `lib/sap-curated-lists.ts:1-21` (~100 IDs, title only, owner list of 13.10.) | ID→title lookups. **There is no mapping program/table/process → scope item anywhere**, and SAP's terms forbid scraping help.sap.com / me.sap.com (owner rule). |
| Need states (3.5) | `lib/process-states.ts:46` (`keep · change · drop · clarify`), `:54` value source incl. `customizing`; route `app/api/projects/[projectId]/process-states/route.ts:36-60` | Per element and rule, immutable need revisions by the account. |
| As-is / to-be (3.6) | `lib/process-target.ts:5-46`, `buildTargetModel` `:321`, `compareIstSoll` `:522` | Pure to-be derivation and side-by-side (stays · changes · goes · open · added), anchors only copied, "not a statement about the code", not in any audit pack (`:40-43`). **No UI or route consumes it yet** (grep: only `tests/process-target.spec.ts`). |
| BPMN export | `lib/bpmn/export.ts:16-35`, `buildBpmnExport` `:116` | Deterministic BPMN 2.0 XML from the skeleton, every node with `cc:` trace and status `reconstructed`; "no claim about a target tool". Signavio import not verified (roadmap 4.3). |
| Design option comparison | `lib/design-option-comparison.ts:1-36`, `comparisonWeighsStandard` `:376` | Standard vs RAP vs CAP, engine facts + model answer + check that refuses circular reasons. Model text, proposal. |
| Phase contract | `lib/workflow-steps.ts:74` (`PhaseState = empty · partial · done · stale`), `:738` `workflowSteps`, design `:825-837`, transformation `:846-859`, delivery gaps `:1069-1073`, delivery `:1086-1125`, `workflowSummary` `:1225`, `nextPhaseKey`, `toolOnRecord` | **No state for "not applicable"**. Delivery needs generated code + tests + documentation (`:1069-1073`), so a no-code decision can never reach Delivery today. The only precedent for closing a phase without its evidence is ADR-094 (testing closed "not verified", `:897-914`, `testingClosureBasis` `:1247`). |
| Tool bar | `lib/workspace-model.ts:964-973` (`toolMark`), `components/workspace/ToolBar.tsx:83,112,275` | Marks derive only from `PhaseState`. |
| Target edition | `lib/target-edition.ts:12-18`, `Project.s4Deployment` (`lib/types.ts:154`), assessment profile (roadmap 7.10) | Every run is signed against `public` or `private`; Public is the default. Score rule depends on it (`lib/clean-core-score.ts:39-48`). |
| Router | `lib/abap/extensibility-router.ts:23-48` | Only two routes, In-App vs Side-by-Side. Key-user is a checkpoint that is always neutral (roadmap row 3.0.19). |
| Delivery package | `app/(app)/project/[projectId]/delivery/page.tsx:384-405`, `lib/delivery-package.ts` | Code-centric (abapGit/CAP package); `docs/decision.md` already written from records; a no-code package does not exist. |

**One sentence summary of the starting point:** every honest building block for fit-to-standard
already exists — the four options, a decision record, need states with *drop*, a pure to-be
derivation, element comparability with three outcomes, an SAP-ID checker — but nothing connects
them into a path, nothing maps the program to SAP standard capabilities, and the phase contract
cannot say "not applicable".

---

## 1. Verdict — does it carry?

**Yes, it carries — with one correction to the owner's premise, and one hard limit.**

**Why it carries.** For SAP S/4HANA Cloud Public Edition, fit-to-standard is not one option
among four but SAP's default method (SAP Activate, Explore phase: fit-to-standard workshops
against the preconfigured best-practice scope items; every delta requirement is resolved by
configuration, key-user extensibility, developer extensibility, side-by-side — or by
organisational change). A tool that reconstructs the process from the custom code with line
anchors is exactly the input such a workshop lacks: *what does this Z program actually do that
the standard would not do?* Clean-Core.io can answer the **"what would be given up"** half
deterministically — and that half is the one nobody else answers with evidence. It also closes
the gap the roadmap itself names: the acceptance order before 3.0 asks for three complete paths,
"standard adoption, targeted extension, retirement" (`docs/ROADMAP.md:659-662`), and today only
the rebuild path ends in a package.

**The correction: the clean core score is the wrong gate.** The score is a deduction table over
constructs (`lib/clean-core-score.ts:76-89`). A score of 95 says "nothing heavy in what was read"
— i.e. the program is *cheap to keep* as it is. It says nothing about whether SAP standard does
the same job. Worse, the clearest fit-to-standard cases score *low*: an enhancement, a
modification or a direct write that bends a standard process costs 12–30 points
(`:77-79`), and dropping exactly that deviation is what "living with the standard" means. So the
gate is built on *what kind of program this is* and *what the code touches*, not on the score.
The score stays visible beside the offer (it prices the Keep alternative), never as the trigger.

**The hard limit: the engine can prove what is left out, never that the standard covers it.**
The product already says this about itself (`lib/decision-option-signals.ts:25-27`). So the
fit-to-standard design has two halves with two provenances:
- *What the program does beyond the standard, and therefore what is given up* — reconstructed,
  anchored, deterministic.
- *What SAP standard does instead* — a candidate at most E1 (catalog successor, checked SAP ID)
  until the account confirms it after a workshop (E4, *Confirmed*, self-declaration). Never
  *Proven*, never green.

**When it does not carry** (and the gate must say "not offered", with the reason):
1. The code uses no SAP object (`standard-fit` state `none-used`, `lib/standard-fit.ts:300-309`) —
   an own application; there is no standard process to fit to.
2. The program's core is its own business data: writes to its own Z tables as the main effect
   (custom persistence = an own business object). That is Rebuild or, from 3.0.19, a key-user
   Custom Business Object — not "the standard covers it".
3. The program is an interface to an external system (outbound RFC, ABAP proxy, file exchange as
   main effect) — integration, not fit-to-standard.
4. Nothing to compare: no business-comparable element on the main path (only technical/structural
   steps), or the main path runs through `call-opaque` targets the engine cannot read.
5. No current signed run (stale, unreadable, source changed) — then the gate is
   *not determined*, not "no".

---

## 2. Where in the flow

**Recommendation: a mode of the Design tool ("Fit to standard"), offered from the Analyze result,
shown and edited in the Business view.** Three places, one artefact:

| Place | Role | Why here |
|---|---|---|
| **After Analyze — "Next step" card** (Business and Management) | The *offer*: "This program bends a standard process (3 enhancements on sales order save). Have a fit-to-standard design made?" | The gate is a reading of the signed run; the offer belongs where the run's result is first read. Analyze itself stays "reads the code and signs a run" (`PHASE_PURPOSE`, `lib/workflow-steps.ts:198`) — no design work inside it. |
| **Design tool — mode "Fit to standard"** beside the solution design | The *making*: derive the gap model, let the model propose standard references (checked), let the account confirm per element | Design "chooses the target architecture" (`lib/workflow-steps.ts:199`); SAP standard *is* a target. Design already compares standard vs RAP vs CAP (`lib/design-option-comparison.ts:40-47`), and the standard-fit gate already reads Design's comparison (`lib/standard-fit-gate.ts:115-130`). A separate eighth tool would break "seven tools" (DESIGN.md §2.3 item 3). |
| **Business view — the map** | The *reading*: as-is and fit-to-standard side by side, dispositions on the elements, the gap list | The owner's rule "business readers first" and DESIGN.md §5.6: Business answers "Do I still need this, and what changes for me?" — that is precisely the question of a fit-to-standard design. |
| **Management** | The *decision*: "Move to SAP standard" with the gap list as its conditions | The option is chosen there today (`lib/decision-options.ts:44-48`); nothing moves. |

Why not inside Analyze: Analyze is the signed, deterministic reading; putting a model-assisted,
account-confirmed design into it would blur the one place every figure starts from. Why not
"right after Analyze" as its own stage: it would be an eighth tool, and its output (a target
model) is design by definition.

---

## 3. The gate

A new pure module (proposal: `lib/fit-to-standard-gate.ts`, no imports beyond types, like
`abcd-classification.ts`) reads only what the signed run and the engine already produce, and
returns **three outcomes, never two**: `offered` (with the candidacy class and its evidence),
`not-offered` (with the reason), `not-determined` (with what is missing). Rules, not percentage
thresholds — the same principle as the four buckets (ADR-033: "rules per object, no percentage
thresholds", DESIGN.md §5.6).

### 3.1 Preconditions (else `not-determined`)
- A current, readable signed run: `analyze` phase `done` (`lib/workflow-steps.ts:795-800`), source
  digest equal to the signed one (`lib/standard-fit.ts:291-298`).
- Target edition known (`lib/target-edition.ts`; it always is since 06.10.2026 — a project
  without one reads Public and says so).
- Process skeleton built with at least one region and its business-comparable elements classified
  (`classifyElements`, `lib/abap/element-comparability.ts:541`).

### 3.2 Candidacy classes (any one → `offered`)

| Class | Deterministic signal (existing readings) | What "living with the standard" means | Strength |
|---|---|---|---|
| **A — Deviation from a standard process** | evidence kinds `enhancement`, `hook-implementation`, `modification` (`lib/abap/evidence-model.ts:43-44,59`), or BAdI/exit entry points the skeleton reads as framework entries | Drop the deviation; the standard process runs as SAP ships it. The standard process exists by construction — the code hooks into it. | Strongest. The "left out" list is exact (the hook's logic, with anchors). |
| **B — Own view on standard data** | no write kinds at all (`standard-table-write`, `custom-table-write`, `bdc`, `batch-input`, `update-task`, `commit-work` absent); at least one `standard-table-read`; output kinds (`classic-alv`, `gui-download`, `form-output`); and **every SAP object read has a path on the target edition** — `standardFit(...).blockers` contains no `no-catalogued-path` item (`lib/standard-fit.ts:337-340`) | A standard app or an analytical query/CDS view replaces the report; the own presentation and filters are what is given up. | Medium. Coverage is a candidate only. |
| **C — Code driving standard transactions** | `bdc`/`batch-input`/`CALL TRANSACTION`/BAPI calls on SAP objects with a released successor (`standardFit` `clear` items with rule `rebuild-path`) and no own persistence | A standard mass-processing app, a scheduled standard job or a released API replaces the automation; the custom orchestration is what is given up. | Medium. |
| **D — Hard-coded customising** | `hardcoded-value` / business rules whose value source the account marked `customizing` (`lib/process-states.ts:54`) on standard fields | The thresholds become standard configuration (in Public: Central Business Configuration). | Weak alone; an add-on to A–C. |

### 3.3 Exclusions (any one → `not-offered`, reason shown in IT `#standard`)
- `none-used` (no SAP dependency).
- Own persistence is the main effect: `custom-table-write` findings on the main path's write
  steps and no class A signal (then it is Rebuild or a Custom Business Object, 3.0.19).
- Integration is the main effect: outbound `rfc-call` (`rfcCallTarget === 'outbound'`,
  `lib/abap/extensibility-router.ts:280-310`), `abap-proxy`, `gui-download` as the program's end
  result to a file consumer.
- Nothing comparable: zero `business-comparable` elements on the main path, or a `call-opaque`
  element on the main path (then *not determined*, "upload the called program").

### 3.4 Honesty of the gate
- The gate is a **reading of the signed run, never a model's suggestion** — exactly the roadmap
  row's words. It names its signals with line anchors ("enhancement at L212–L288").
- It **offers an examination, it never claims coverage.** Its sentence is "worth examining
  against the standard", never "covered by the standard".
- It is a **view**: derived when shown, never stored, hashed or signed — like the level and the
  distance to standard (`lib/standard-fit.ts:58-59`).
- Measured before shipping: the gate runs over the shipped examples and the owner's review cases
  (MM PO approval, SD, PM, QM, FI, CO, PP, freight, the 1,000-line example) and the result per
  case is pinned in a spec, with the expected class written down *before* running it. A case
  where the owner's judgement and the gate disagree is a finding, not a tuning knob.
- Expected (hypothesis, to be measured): freight rate check and own-table programs `not-offered`;
  enhancement-based SD/MM cases class A; read-only list reports class B; PM/QM logic on internal
  tables only — likely `not-determined` or `not-offered`.

---

## 4. The fit-to-standard design ("gap BPMN")

### 4.1 Data model (proposal)

Subcollection `projects/{id}/fit_to_standard/{revision}`, written only through the Admin SDK,
immutable revisions like `process_states` (`lib/process-states.ts:35`):

```
FitToStandardRevision {
  formatVersion: 1
  revision: number                // 1 = the engine's derivation, 2.. = the account's
  runId, sourceSha256, edition, catalogSnapshot   // what it stands on (staleness)
  baseProcessRevision: 1          // the reconstructed as-is (process_revisions/1)
  gateClass: 'A'|'B'|'C'|'D'
  entries: FitEntry[]
  createdBy, createdAt            // account + server time
}
FitEntry {
  elementId                        // stable BPMN id from the skeleton
  anchor | null                    // COPIED from the as-is element, never produced (C23-A06)
  comparability                    // from element-comparability.ts
  disposition:                     // see 4.2
    'covered' | 'configuration' | 'given-up' | 'gap-key-user'
    | 'gap-organisational' | 'gap-open' | 'goes-with-program' | 'unknown'
  standardRef?: { kind: 'fiori-app'|'scope-item'|'api'|'cds-view'|'key-user-tool',
                  id, title, check: 'verified'|'mismatch'|'catalog'|'unverified', source? }
  evidenceLevel: 'E0'..'E4'        // ceilings from evidence-level.ts
  provenance: 'reconstructed' | 'model-proposal' | 'confirmed'
  note | null
}
```

### 4.2 Dispositions — and who may set them

| Disposition | Meaning | Engine may propose | Model may propose | Only the account |
|---|---|---|---|---|
| `given-up` | Behaviour of the program the standard does not have; living with the standard means losing it | yes — class A hook logic, class B own filters/columns, hard-coded checks (with anchors) | — | confirms |
| `covered` | The standard does this step | only from a catalog successor, at E1 ("candidate") | yes, with an SAP ID passed through `checkSapReferences`, at most E1 | raises to E2 (names an SAP page) or E4 (accepted after workshop) |
| `configuration` | Becomes standard configuration (value source `customizing`) | from class D signals | — | confirms |
| `gap-key-user` | Needed, coverable by key-user extensibility | from the 3.0.19 key-user candidates once they exist | may name the tool type, never an invented BAdI | confirms |
| `gap-organisational` | Needed, handled by a process/role change, no build | — | — | only the account |
| `gap-open` | Needed, no cover identified | default for every business-comparable element nobody resolved | — | — |
| `goes-with-program` | Technical/structural step (read, write, `sy-subrc`, end event) that disappears with the program | yes — from comparability `technical`/`structural`; **never** shown as "not covered" (7.8 rule, `element-comparability.ts:40-44`) | — | — |
| `unknown` | `call-opaque`, dynamic target | yes | — | — |

The default is honest: a business-comparable element with no evidence is `gap-open`, never
`covered` — and `gap-open` blocks nothing silently; it travels into the decision as a condition.

### 4.3 Derivation (pure, deterministic first)

`buildFitToStandardDesign(skeleton, comparability, findings, standardFit, standardCoverage, edition)`
in `lib/fit-to-standard-design.ts`:
1. Copy every element of the as-is skeleton with its anchor.
2. Classify (`classifyElements`) → `goes-with-program` / `unknown` for non-comparable ones.
3. Mark the deviation per gate class (A: the hook's region; B: own selection/output steps;
   C: the orchestration around the standard call) as `given-up`, with the findings that make it so.
4. Attach catalog successors from `deriveStandardCoverage` (`lib/abap/standard-coverage.ts`) as
   E1 `covered` *candidates* — labelled "candidate, to verify".
5. Everything else business-comparable → `gap-open`.
6. Optional model step (only on request, BYOK/Gemini as elsewhere): a constrained schema asks,
   per `gap-open` element, for a standard reference; every ID goes through `checkSapReferences`
   (`lib/sap-reference-check.ts:697`): `mismatch` → dropped, SAP's real title shown beside it;
   `unverified`/`catalog` → kept as "to verify", E1, provenance *Model proposal*. No ID without
   the check — the QM/FI reviews are the reason.

### 4.4 Reuse of 3.5/3.6 — the to-be comes for free
When the account confirms the design, the confirmation also writes **one new need revision**
(`process-states`): `given-up` → `drop`; `covered`/`configuration`/`gap-key-user`/
`gap-organisational` → `change` (note: "carried by SAP standard: <ref>"); `gap-open` → `clarify`.
Then `buildTargetModel` + `compareIstSoll` (`lib/process-target.ts:321,522`) produce the to-be and
the side-by-side — the first UI for 3.6, which is built but unused. Consequences that fall out
for free and are consistent with ADR-033: objects that serve only confirmed drops move to the
*Retire* bucket; the decision's `need` binding (`lib/project-decision.ts:89`) already binds the
need revision.

### 4.5 Display (Business view)
- Map mode "Fit to standard" next to the as-is: each element carries its disposition as a
  categorical mark (DESIGN.md §1.8: categories take the categorical palette, never state colours)
  plus letter/label, never colour only.
- Side by side: as-is | fit-to-standard, with `compareIstSoll` verdicts (stays · changes · goes ·
  open · added).
- Three lists under the map, each row with anchor, reference, check state and evidence level:
  **What you give up** · **What SAP standard does instead** · **What remains a gap** (key-user ·
  organisational · open).
- Header sentence, always: "A fit-to-standard design says what living with the standard would
  give up. Whether the standard covers a step is confirmed by you, not by the code."

### 4.6 Export
- **To-be BPMN 2.0 XML** from the same exporter (`lib/bpmn/export.ts:116`) with a filter: a
  `given-up` node with exactly one incoming and one outgoing flow is removed and the flow bridged;
  every other `given-up` node (gateways, regions) stays drawn, annotated "Given up — standard
  behaviour", with `cc:disposition` in the extension elements. Covered steps carry a text
  annotation with the SAP ID and its check word, because extension elements are invisible in
  modellers (`export.ts:19-24`).
- **Gap list** as Markdown and CSV (one row per element) — the delta-requirement list a
  fit-to-standard workshop works through.
- Wording stays "BPMN 2.0 XML, import into Signavio not verified" until 4.3 has a log (roadmap
  3.0 done-criteria, `docs/ROADMAP.md:191-195`).

---

## 5. Skipping Transformation and Testing; decision and documentation

### 5.1 The phase contract
Add a fifth state **`not-applicable`** to `PhaseState` (`lib/workflow-steps.ts:74`) rather than a
flag on `empty`: the type checker then forces every reader (`phaseTone`, `toolMark`,
`toolOnRecord`, `nextPhaseKey`, `workflowSummary`, rail, dashboard, delivery) to handle it, so no
surface silently counts it as done or as open.

- **When:** only while `decisionOnRecord(project)` (`lib/standard-fit-gate.ts:78-107`) is
  `confirmed` **on the current run** with option `standard` — the same function the rebuild
  warning reads, so there is one truth. Withdrawn, superseded, or a new run → the phases fall
  back to their normal reading at once (the existing stale cascade).
- **Which:** Transformation and Testing. Never Analyze, Design, Documentation, Economics, Delivery.
- **What it shows:** badge "Not applicable", detail "The decision on record (DEC-… rev …) moves the
  program to SAP standard — nothing is built or tested." Tone `none` (grey), its own mark (a dash,
  not a check), excluded from `doneCount` and from `next`; the counter reads "5 of 5 applicable".
- **If code exists anyway** (generated before the decision): Transformation stays readable,
  marked "Against the decision on record" — the prompt rule of `transformation-context.ts:371-375`
  made visible; it does not become `not-applicable` while an artefact contradicts it, and the
  delivery package does not ship it.
- `testingClosureBasis` (`:1247`) is not used for this: closing testing "not verified" (ADR-094)
  is for a suite that failed; here there is no suite. Two different statements, two states.

### 5.2 Design on this path
Design is `done` when the fit-to-standard design is confirmed by the account at a revision bound
to the current run, *not proven* (self-declaration). The existing sign-off (`approvedByArchitect`,
`:825-837`) is not reused for it — that is a sign-off on an architecture text.

### 5.3 The decision
- Chosen in Management as today. New: when a confirmed fit-to-standard design exists, the
  standard option's signal (`decision-option-signals.ts:259`) may change: *for* when every
  business-comparable element is resolved (no `gap-open`) and coverage is account-confirmed —
  provenance *Confirmed*; *against* when `gap-open` elements remain that have neither key-user
  nor organisational resolution; otherwise *not determined* as today. The business answer comes
  from the account, which keeps the existing sentence true.
- Each `gap-open`, `gap-key-user` and `gap-organisational` entry becomes a **condition** of the
  decision with status (`project-decision.ts` rule 3, `:39-45`). A `gap-open` is a `derived`
  condition the account cannot attest away.

### 5.4 Signing — what changes in the signed world
- **Phase 1 (no pack change):** the decision already binds the need revision; the confirmed
  fit-to-standard design writes one (4.4). The fit-to-standard revision itself is *not* signed.
  Views stay unstored; accountability stays the signed-in account; the grade and the gate stay out
  of the pack.
- **Phase 2 (versioned):** a sixth binding `standard-design` (fit-to-standard revision digest) →
  `DECISION_VERSION = 2`; the verifier (`lib/audit-pack-verify.ts`) accepts v1 and v2; the pack
  gets `10-fit-to-standard.json` (entries, refs with check state and evidence level — no grade,
  no view). Only with the owner's go, because it changes the signed format.

### 5.5 Delivery on this path
Delivery's gaps (`:1069-1073`) become path-dependent. On the standard path: *confirmed decision
(standard) on the current run · confirmed fit-to-standard design · documentation on record · no
contradicting code in the package*. Badge "Ready · decision, nothing built", never green.

Package content (no code):
- `README.md`, `STATUS.md`, `docs/decision.md` (exist as builders in `lib/delivery-package.ts`)
- `docs/fit-to-standard.md` — the three lists with anchors, refs, check words, evidence levels
- `process/as-is.bpmn`, `process/fit-to-standard.bpmn`, `docs/gap-list.csv`
- `docs/rule-register.md` — the business rules, marked which are given up
- `docs/key-user-backlog.md` (input for 3.0.19), `docs/organisational-changes.md`,
  `docs/what-changes-for-users.md` (from 7.6, `lib/abap/user-change.ts`)
- `docs/workshop-questions.md` — per open element one question for the fit-to-standard workshop
- `docs/decommissioning.md` — what is switched off once the standard runs (`DECISION_OPTION_MEANINGS.standard`)

### 5.6 Economics / Management
The cost option `standard` already exists (`optionOfCostKind`, `decision-options.ts:58`). On this
path its one-off effort is the account's figures for: workshop, configuration, key-user gaps,
organisational change, training, decommissioning; ongoing: key-user extension upkeep per release.
No model-sized amounts, no defaults (ADR-035, `lib/money-honesty.ts`). Management shows "Move to
SAP standard — n given up, m gaps (k key-user, j organisational, i open)" beside Keep's price.

---

## 6. Public Edition specifics (domain, to be checked against SAP's public pages, not scraped)

- No classic ABAP, no modifications, no unreleased objects; Tier 1 ABAP Cloud only for developer
  extensibility; enhancements only via released BAdIs.
- Key-user extensibility: Custom Fields, Custom Logic (released key-user BAdIs), Custom Business
  Objects, Custom CDS Views, Custom Analytical Queries, Adapt UI — the 3.0.19 scope.
- Configuration through SAP Central Business Configuration on activated scope items; two releases
  a year (YYMM, e.g. 2602, 2608 — the IDs this repo already cites, `lib/sap-scope-items.ts:36-96`).
- SAP Activate Explore: fit-to-standard workshops per scope item; output = delta requirement
  backlog. Our gap list is shaped as that backlog.
- Edition consequences for the gate: in **Public**, class A always offers (a modification has no
  future there anyway), and `goes-with-program` is wider; in **Private**, the same design is
  offered but Keep stays a real alternative (B objects keep, own Z-table writes are free — score
  rule 3.0.9). The engine knows the edition from the signed run's profile.

---

## 7. Risks — and what must not happen

1. **Inventing standard coverage.** No scope item, app or API without `checkSapReferences`; no
   `covered` above E1 without the account; no scope item derived by the engine (there is no
   mapping data, and scraping SAP's sites is excluded). Guard: a spec feeds the review IDs (F2358,
   19M, 1EG, SAP_COM_0093, API_JOURNALENTRYITEMBASIC_SRV) and asserts none appears as verified.
2. **Reading absence as proof.** "Not in the standard diagram" is never "given up"; technical and
   structural elements are never "not covered" (7.8, `element-comparability.ts:21-24`).
3. **A fake "done".** Transformation/Testing are `not-applicable`, never `done`, never green;
   Delivery on this path is never *Proven*.
4. **Score as gate.** Would offer the path to clean own applications and hide it from the
   modifications it is for. The score is shown, not used.
5. **Overpromising in copy.** No "fit-to-standard verified", "covered by SAP", "Signavio-ready".
   Every sentence names its provenance; the landing/money/Signavio guards extend to the new texts.
6. **Gate drift.** Gate classes are pinned on named cases; a change that moves a case is a review
   item, not a silent re-tune.
7. **Losing the deviation's anchor.** The "given up" list is the value of the feature; every row
   needs a line range or reads *Unanchored* with the reason.
8. **Signed-format drift.** No new field in the pack except via `DECISION_VERSION 2`, with the
   verifier reading both.
9. **Scope creep into Signavio/Process Navigator content.** The owner's archive of SAP diagrams is
   "structure usable, content not" — it is not a coverage source.
10. **Decision bypassing the design.** Choosing "Move to SAP standard" stays possible without a
    design (owner's decision), but then the standard signal stays *not determined* and Delivery
    lists "no fit-to-standard design" as its gap — no silent ready.

---

## 8. Phased plan for roadmap row 3.0.20 (steps S/M, each a patch on `dev` with a guard spec)

| # | Step | Size | Acceptance |
|---|---|---|---|
| F1 | **Gate** `lib/fit-to-standard-gate.ts` (pure, three outcomes, classes A–D, exclusions, reasons with anchors) | S | Spec pins the result for each shipped example and the owner's review cases, expected classes written before the run; `none-used` → not offered; stale run → not determined; no import from `lib/bpmn`; the score is not an input (source guard). |
| F2 | **Engine derivation** `lib/fit-to-standard-design.ts` (dispositions without a model) | M | Every anchor copied from the as-is (`anchor !== null` ⇔ basis code); no technical/structural element is `covered` or `gap-open`; class A hook logic is `given-up` with its lines; catalog successors only as E1 candidates; same source ⇒ byte-identical result. |
| F3 | **Storage, confirmation, need revision** (route `fit-to-standard`, Admin SDK, immutable revisions, writes the mapped need revision) | M | Revision 1 is the engine's and never changes; confirmation records account + server time; a stale run refuses with 409; confirmed drops show in the Retire bucket; rules guard for the new subcollection (deploy by Sonny). |
| F4 | **Business view display** — map mode, side by side via `compareIstSoll`, three lists; offer card from Analyze's Next step | M | Rendered spec on the seeded demo: offer only when gate offered; every disposition has text + mark; header sentence present; no state colour on dispositions; phone order per DESIGN.md §2.9. |
| F5 | **Model proposal for standard references** (optional, constrained schema, `checkSapReferences` on every ID) | M | Injected wrong IDs never shown as verified, `mismatch` shows SAP's title; max E1; provenance *Model proposal*; works with the model off (engine-only design). |
| F6 | **Phase contract** `not-applicable` + tool bar + next step + delivery gaps per path | M | On a confirmed standard decision: Transformation/Testing `not-applicable`, never `done`/green, excluded from next and doneCount; withdrawing the decision restores them; existing code shows "against the decision"; every reader of `PhaseState` compiles with the new case. |
| F7 | **Delivery package without code** + exports (to-be BPMN, gap list CSV/MD, workshop questions) | M | Package contains the files of 5.5 and no code; BPMN well-formed and re-importable by our own importer; Signavio wording guard green. |
| F8 | **Management/Economics** — standard signal from a confirmed design, gaps as decision conditions, cost inputs per gap kind | S | Signal *for* only with zero `gap-open` and account-confirmed coverage; `gap-open` is a derived condition that cannot be attested away; no amount without an assumption revision. |
| F9 | **Signed binding v2** (optional, owner's go) — `standard-design` binding, `DECISION_VERSION 2`, `10-fit-to-standard.json` | M | Verifier accepts v1 and v2; a tampered fit-to-standard file fails verification; no grade or view in the pack. |
| F10 | **End-to-end acceptance "standard adoption"** (§15 path 1) with negative probes | S | One owner case through Analyze → offer → design → decision → package; probes: wrong SAP ID, stale run after confirmation, decision withdrawn, code generated against the decision. |

Order: F1 → F2 → F3 → F4 → F6 → F7 → F8 → F5 → F10 → (F9). F5 is late on purpose: the path must
work and be honest without a model. Dependency: the `gap-key-user` proposals need 3.0.19's
key-user candidates; until then `gap-key-user` is account-set only.

Total: roughly M–L as the roadmap row says (≈ 4 S + 6 M).

---

## 9. Open owner decisions

1. **Gate on program kind, not on the score?** (Recommended: yes; the score shown beside the offer.)
2. **When not offered:** hide completely, or show the reason in IT `#standard`? (Recommended:
   reason in IT, nothing in Business.)
3. **Override:** may an account request a fit-to-standard design although the gate says "not
   offered"? (Recommended: yes, from IT, marked "made without the gate's offer".)
4. **Private Edition:** offer there too? (Recommended: yes, same rules, Keep stays the visible
   alternative.)
5. **Model step (F5):** allowed at all, and only with BYOK or also on the shared key?
6. **Scope-item data:** the owner extends the curated lists by hand (no scraping); is a larger list
   planned before 3.0.20, and from which source?
7. **Open gaps:** may "Move to SAP standard" be confirmed with `gap-open` conditions, or must they
   be resolved first? (Recommended: confirmable, `gap-open` as derived conditions; Delivery says
   "with open gaps".)
8. **Signed format v2 (F9):** in 3.0.20 or later?
9. **Vocabulary:** "Fit to standard" (the design) vs "Move to SAP standard" (the option) vs
   "distance to SAP standard" (the figure) — one spelling each, glossary entry for all three.
10. **Sequence with 3.0.19:** 3.0.20 after key-user extensibility is released (recommended), so
    `gap-key-user` can be proposed by the engine instead of only by the account.
