# Analyze, business first — build plan for the accepted mockup v4.1

as of 06.11.2026 · owner acceptance the same day ("a clear step towards business and towards reducing the app's
complexity") · read only: nothing in the product changed, nothing committed · release cut revised the same day:
one release to users, v3.5.0 on 22.12.2026, built in three milestones on one release branch, ahead of every other
roadmap topic (owner decisions 06.11.2026, §4).

## 0. Basis and method

- **Measured state:** `dev` @ `bae56e93`, `APP_VERSION` `v3.0.21` (`lib/version.ts`). Business names are paused there
  (`NAMING_WITHOUT_FACTS_PAUSED = true`, `lib/process-naming.ts:94`).
- **The 3.0.22 branch:** `worktree-agent-a0d2bc8b7d821f2d8` @ `390113d0`, three commits on `b98f5d09`, so two
  commits behind `dev` (`49f1be23` the pause, `bae56e93` the CI fix). It adds `lib/naming-facts.ts`,
  `lib/abap/engine-reads-3022-gate.ts`, the plain-language changes in `lib/abap/plain-language.ts` and
  `lib/bpmn/model.ts`, and `tests/business-readability-ratchet.spec.ts`. `git merge-tree dev <branch>` reports one
  conflict, `tests/shard-plan.json`; `lib/process-naming.ts` merges by itself.
- **The mockup:** `scratch/mockup-analyze-first-insights/analyze-first-insights-mockup.html` (built from
  `template.html`), screens in `screens/` (19 states × 6 viewports, plus whole pages at 1440 × 900 and phone), the
  overlap result in `screens/overlap-report.json`, the counts in `screens/first-screen-counts.json`. `scratch/` is
  gitignored (`.gitignore:13`), so the accepted mockup is not in the repo yet (see AB-0). The mockup HTML is English
  only; `bericht.md` is German and stays out of the repo.
- **Looked at myself:** `1440x900-01`, `-02`, `-03`, `-05`, `-15`, `full-1440x900-09`, `-12`, `-13`, `phone-05`.
  The whole pages already show v4.1: the card "What you can do next" stands under the two endings, and the line reads
  "Same program, same analysis. Use the view switch above."
- **Limits:** the app was not started (Playwright owns the dev server). Every "today" figure for the running app is
  an **estimate** from the components and from the mockup report §11, marked (E). AB-0 measures it. One engine fact
  was checked by running the engine (N7, §2.1).

### Owner decisions this plan builds on (all of 06.11.2026 unless dated)

| Topic | Decision |
|---|---|
| Lead | The Business view of Analyze comes first. The BPMN map and the process tour are the core. |
| Build-up | The page builds up in about 20 s with engine names. AI names swap in visibly in the background, for at most 45 s per program; the status line says what is happening (O2, N4). |
| Language | Natural business language from the engine plus AI, built only from the code's facts. Short, concrete, for process owners, PMs and POs. |
| Code | Line references stay visible. Code opens on click only in Business, prominent in IT (O4). |
| Gate | Soft: "Best after the business walk-through". Nothing locked, no confirmation step. |
| Endings | Analysis-only is a complete outcome. Two equal endings: "Re-design this program" and "Analyse another Z program". |
| IT, Management | Each shows everything on one page, no click-through. |
| Full screen | Stays reachable, with navigation, editing behind an "Edit" toggle, and the tour (O5: inline and full screen). |
| Charts | 2–3 small charts below the map. |
| After the tour | A lightweight card "What you can do next". |
| v4.1 (1) | The card stands below the two endings; at 768 px and on a phone it is one collapsed line that opens in place. |
| v4.1 (2) | The view-switch wording holds on every viewport ("Use the view switch above"). |
| v4.1 (3) = N9 | "Hide" is remembered per project in the browser only, no server field; a quiet link below the endings brings the card back (state 9b). |
| Layout | Nothing covers anything; fully responsive. Look and feel = today's app. |
| AI Act Art. 50 | A per-element AI mark, only where a model wrote the text. |
| Releases | 3.0.21 goes live before 02.12.2026 (on `main` 09.11.2026) and carries none of this. The rebuild is **one release to users, the Christmas release v3.5.0, ahead of every other roadmap topic**, built on one release branch `next` in three internal milestones (M1 23.11, M2 07.12, M3 = release candidate 16.12.2026); `dev` stays on the 3.0.21 line with hotfixes, and users see nothing of 3.5 before 22.12.2026, when `next` goes to `main` with own Claude keys switched on. The rule "one roadmap item per release" is deliberately overridden for it. The video and the post on 22.12.2026 present "v3.5" (§4). |

**Reading of "builds up in about 20 s"** (an interpretation, taken from the accepted mockup, states 1–3): the map stands
at once with engine names; the summary, the text blocks and the names arrive in place over about 20 s; names may take
up to 45 s. There is no element-by-element drawing of the map and no code column.

---

## 1. Target picture

A project opens in **Analyze**, Business view. The page is the reconstructed BPMN map from the signed run, with
engine names at once and checked AI names swapping in. Above it two sentences say what the program does; below it a
status line, a legend, 2–3 charts and the text around the map (how it runs, why it exists, who is involved, questions
for the business), every statement with its line. "Walk me through it" starts the tour on the map, inline or in full
screen. After the tour the page ends with two equal endings and the card "What you can do next". IT and Management are
one page each, on the same tool. The workspace page's Business view, the first-look build-up and the "Result ready"
hub leave the app.

### 1.1 What leaves the app

| Today | Lines | Used in | Goes in | What carries its content |
|---|---|---|---|---|
| `components/workspace/FirstLook.tsx` | 1,606 | `WorkspaceShell`, `DemoWorkspaceShell` | AB-2 | the map itself and the text around it (AB-2, AB-6) |
| `components/workspace/FirstLookBuildUp.tsx` + `lib/first-look-buildup.ts` | 929 + 434 | `FirstLook` | AB-3 | the name swap and the status line (ADR-072's paced build-up retires) |
| `lib/first-look-excerpt.ts` (main-line drawing) | 137 | build-up, end state | AB-3 | the map |
| `components/workspace/BusinessOpening.tsx` | 494 | `FirstLook` | AB-6 | "What this program does", "How it runs", "Who is involved", questions |
| `components/workspace/ProgramInShort.tsx` | 114 | Analyze page, `BusinessOpening` | AB-6 | "What this program does" (the engine sentence stays its fallback) |
| `components/workspace/ProcessTourEntry.tsx` | 43 | `WorkspaceShell`, `DemoWalkThrough` | AB-4 | the invitation bar above the map |
| `components/workspace/BusinessNextStep.tsx` + `lib/business-next-step.ts` | 104 + 51 | `WorkspaceShell`, demo | AB-4 | the two endings |
| `components/workspace/WorkspaceHub.tsx` + `AnalysisReady.tsx` + `lib/analysis-read.ts` | 321 + 53 + 119 | `WorkspaceShell`, demo | AB-2 | nothing: the project opens on the result (ADR-090 retires) |
| `components/workspace/CoachMarks.tsx` + `lib/coach-marks.ts` | 390 + 330 | `WorkspaceShell` | AB-11, if P7 | the tour and the invitation bar |
| `components/workspace/LayerBar.tsx`, `LayerSection.tsx` | 160 + 245 | workspace, demo | AB-11, if O3 | Business has one layer left (`BUSINESS_LAYERS = ['evidence']`, `lib/business-layers.ts`); its content is IT's "Run & trust" |
| `components/analyze/AnchoredNarrative.tsx` | 130 | Analyze page | AB-9, if P4 | the checked text around the map |
| `components/analyze/ProgramMap.tsx` | 206 | `EvidenceFindingsTable` | AB-9 (assumption: IT's findings beside their code replace it) | findings with their code |
| **Sum** | **≈ 5,900** | 18 files (12 components, 6 lib modules) | | |

**Routes and views.**

| Today | Target |
|---|---|
| `/project/[id]` opens the workspace, Business view first (ADR-002, ADR-061) | Business view or none → `/project/[id]/analyze`, keeping `view`, `first`, `from`, `origin` and a `#L…` fragment (AB-2). IT and Management stay on the workspace until AB-9/AB-10; the page itself is O3 (AB-11). |
| `?first=1` on `/project/[id]` (`StarterExamples.tsx:174`, `OwnCodeImport.tsx:254`, `analyze/page.tsx:646`) | `/project/[id]/analyze?first=1` |
| `/project/[id]/analyze` = score hero, findings, route, folds (ADR-093), one layout for all three views | Business: the map page. IT: one page, code first. Management: one page. One route, three views (`?view=`). |
| Stage "Back to project workspace" (`lib/workspace-back-href.ts`) | In Business: back to Analyze. Wording decided with O3. |
| `/demo/workspace`, `/demo/analyze` | follow every package on the same components (O10) |

**Guards that change** (details per package in §4): `workspace-shell-guard`, `workflow-style-guard`,
`page-anchor-guard`, `design-rendered-guard`, `mobile-responsive`, `stage-view-switch`, `return-path-guard`,
`a11y-source-guard`, `cc-style-guard`. Retired with their components: `first-look-buildup-view`, `first-look-pacing`,
`walk-layout-3020`, `analysis-ready`, `workspace-hub`, `workspace-hub-running`, `naming-paused-3021`. **Stays as it
is:** `view-attribute-guard` (views are never stored), `preservation-register`, the light-theme guard.

### 1.2 Complexity, measured

First screen, interactive controls (buttons, links, segments). The fixed head is 11: way back, 3 views, 7 tools.

| Screen | Today (E) | v4.1 mockup, 1440 × 900 / phone (measured) |
|---|---|---|
| Business, first look done | ~45 | 18 / 13 (names ready) · 19 / 14 (done) |
| Business, tour station | — | 21 / 16 |
| Analyze today (score hero) / IT | ~35 | 10 / 5 |
| Management | ~35 (E, `ManagementAnswers` + `DecisionCard`) | 10 / 5 |
| Full screen, edit on | — | 29 / 25 (on purpose, behind "Edit") |

Content controls in Business fall from ~34 (E) to 7–10. Primary buttons on the first screen: 1 while the tour is
offered or running, 0 in the done states (the two endings are both `secondary`). The "today" column is replaced by
measured values in AB-0. Code: about 5,900 lines and 18 files leave (§1.1); what the new pages add is measured per
package, not estimated here.

---

## 2. Decisions needed from Sonny

### 2.1 Open items, each with a recommendation

Closed and not repeated: O2, O4, O5 (both inline and full screen), O7 (no duration estimate, only the 45 s ceiling),
N9 and the two v4.1 adjustments.

| No. | Question | Recommendation | Needed before |
|---|---|---|---|
| **P1** | `docs/ROADMAP.md` held five rows at 3.0.22 (quality "before every other 3.0.22 row", the seven tools, help and waiting, Documentation baskets, tests as evidence). The seven-tools row also asks for `NextStepCard` "Open Design" on Analyze (item 2) and the score fold (item 6), which v4 replaces. | **Closed 06.11.2026 (owner):** the rebuild is v3.5.0, built in milestones M1–M3 on the release branch; the five rows moved unchanged to 3.5.1 (`docs/ROADMAP.md` §7). There is no user release 3.0.22: the engine gate of AB-1 (`ENGINE_READS_3022_FROM = '3.0.22'` on the naming branch) is set to `'3.5.0'` when it lands on `next` (§4.0, versions). Still to note when 3.5.1 starts: items (2) and (6) of the seven-tools row do not apply to Analyze any more; its frame item (1) is compatible. | — |
| **O3** | What becomes of `/project/[id]`? | AB-2 sends Business to Analyze. AB-11 dissolves the page once IT and Management live in Analyze: the project crumb and "Back to project workspace" then name Analyze. Decide in AB-11 with screenshots, not now. | AB-11 |
| **P5** | Where do the workspace's record parts go: the decision with Confirm (`DecisionCard`), the target edition (`TargetChange`), read access (`AccessList`), the revision stand, the steering one-pager? v4 shows none of them. | Decision record and one-pager → Management of Analyze, under "Next steps", as today's card, folded (assumption: no new component). Target edition → IT. Read access → "Invite a colleague to read" opens today's list in a dialog. Revision stand → the Analyze header, as on the workspace. Nothing is deleted before its new place is shown. | AB-10 |
| **O1** | When does the walk-through count as done? | The last station was shown once, or the soft-gate note was dismissed. Browser only (`cc.analyze.walked.<projectId>`), like `cc.workspace.firstLook.seen` (`lib/first-look.ts:81`). No server field, no phase change. | AB-4 |
| **O6** | "Clean core" words in Management | Only the band name beside the figure ("Distance to SAP standard"); no judgement in text. | AB-10 |
| **O8** | The "Next" tag on a tool for an analysis-only reader | Hidden until a later tool was opened once in this browser. `nextPhaseKey` in `lib/workflow-steps.ts` stays for the list and Delivery. | AB-4 |
| **O9** | The accessible step list | Keep "Map \| Steps" (ADR-016, WCAG 2.1.1), in Analyze and in full screen. | AB-2 |
| **O10** | Demo | Same components and the same tour, moved in every package (`demo-shared-boundary.spec.ts` already holds the demo on shared components). AB-12 only re-shoots the landing pictures. | AB-2 |
| **O11** | Download "PDF with the tour texts" | Later (AB-13), from the `ProcessMap` export plus the station texts, without a model call. Until then: "Download the process (BPMN, PDF)" as today. | — |
| **N1** | A Keep/Rebuild/Retire recommendation in Management? | Show an "Indication" with its reasons, worded "This is an indication, not a decision". Effort ranges only when Economics computes them from the same facts (`pricedOptions`, `lib/economics-record.ts`); otherwise the row says "Economics works out the effort with your figures". | AB-10 |
| **N2** | A map that would fall below its legible scale | Scroll sideways instead of shrinking; on a phone offer "Steps". | AB-2 |
| **N3** | Tour card on tablet and phone | Above the map (up to 1100 px), as the mockup shows. | AB-4 |
| **N5** | "What this program does" and "Why it exists" are model text. Fact check? | Yes. `purposeProposalOf` in `lib/program-summary-check.ts` already drops a proposal that contradicts the facts. Without a passed check the engine sentence (`businessInShort`, `lib/program-summary-text.ts`) stands, unmarked. | AB-6 |
| **N6** | The rules chart needs rules by kind (check, limit, approval, exception); today they are grouped by topic (`RuleTopic`, `lib/abap/business-rule-set-explain.ts:56`). | A new deterministic classification beside `RuleTopic`, display only, never in the signed payload. Until it exists, show two charts. **Release cut 06.11.2026:** AB-8 is later; the three releases ship two charts. | AB-8 (later) |
| **N7** | The third branch at "Emergency, at most 50,000.00?" (plant 1000) | **Checked on `dev`** with `buildProcessSkeleton` on `public/starter-examples/Z_MM_PO_APPROVAL.abap`: the gateway at line 325 has three arms — the emergency branch, `gv_skip_limit = abap_false`, and a **default** arm straight to the next gateway ("Approved?", line 336). The `ELSE` body (`gv_approved = abap_true`, lines 333–334) is drawn as no step, and the plant-1000 origin sits elsewhere (lines 95–96). So the map shows the way but not the fact. Recommendation: a default arm whose body only sets a flag gets a label from that assignment ("approved without approver"). An engine change: behind a gate, measured on the benchmark. | AB-7 (engine part) |
| **N8** | Editing in full screen saves a revision. Still "analysis"? | Yes, behind "Edit", with the sentence "The reconstructed as-is process (revision 1) stays unchanged whatever you save." | AB-5 |
| **P2** | Old projects: a naming stored before 3.5.0 stays stored but is not applied (`lib/process-naming.ts:710`). Ask the model again? | Once, on the first owner visit after the release, under the same rules as a new project (platform key; own key only with the 3.0.21 switch). Never for an invited reader. | AB-3 |
| **P3** | Full-screen editing on a phone: the mockup shows it, `DESIGN.md` §5.7 says modelling by touch is not offered (`ProcessMap.tsx:256`). | Keep §5.7: on a phone "Edit" is disabled with one sentence why. | AB-5 |
| **P4** | The model summary (`AnchoredNarrative`) and the "Start Analysis" narrative path on today's Analyze page | The narrative stops being a page block. If it is written, its checked sentences feed the text around the map; the upload and start path for a project without a run stays as it is. | AB-9 |
| **P6** | "About 30 minutes for this program" in the Re-design ending is illustrative. | Show a figure only if it is computed from the open business questions (`lib/rule-questions.ts`); otherwise say "one decision per business rule, N rules". | AB-4 |
| **P7** | Coach marks in Analyze | None. The invitation bar and the tour do their job. Retire `CoachMarks` when the workspace page goes (AB-11). | AB-2 |
| **P8** | Invited reader (read only): what do the endings and "Edit" do? | "Re-design this program" is replaced by one sentence ("The owner can re-design it"); "Analyse another Z program" opens the reader's own list. "Edit" disabled with the shared sentence that exists today (`canEdit`, `ProcessMap.tsx:225`). A reader's visit triggers no model call. | AB-2, AB-4 |
| **P9** | "How a case can end": count paths or ends? | Ends — the end events of the business-level map, grouped by the stop's reason. Paths explode with loops and nested branches. | AB-7 |
| **P10** | The accepted mockup is in gitignored `scratch/`. | Copy the HTML, unchanged, to `docs/roadmap/analyze-business-first-mockup.html` (English only, checked) and add it to the UX agent's mockup list. The report stays out. | AB-0 |
| **P11** | Test-only and docs-only packages (AB-0) | They ride with the next release and carry no user-visible change. | AB-0 |

### 2.2 ADR and DESIGN.md changes

Proposed new wording, one line each. A new ADR is written when its package lands, not ahead of it.

| ADR / section | Change | Proposed wording |
|---|---|---|
| ADR-002 | amend | A project opens in Analyze, Business view: the process map from the signed run is the page. |
| ADR-013 | amend | The wow is content with a line anchor: every map element and every sentence carries its line; motion only for the name swap and the tour camera. |
| ADR-015 | amend | The code speaks first — on demand in Business (a side panel on click, never by itself), prominent in IT. |
| ADR-016 | unchanged | "Map \| Steps" stays the keyboard and screen-reader path, in Analyze and in full screen. |
| ADR-018 | amend | View, tool and full screen each have one task; Analyze has no layer bar; the view lives in `?view=`, the place in the fragment. |
| ADR-025 | amend (with N2) | The model never holds up the page: engine names first, model names swap in per element within 45 s per program; labels never below 10 px — below that the map scrolls; the tour scrolls to its station rather than zooming out below 83 %. |
| ADR-059 | superseded | The process is Analyze's Business view; there is no separate first-look drawing. |
| ADR-060 | amend (O8) | No "Next" tag for an analysis-only reader until a later tool was opened once in this browser; the marks stay. |
| ADR-072 | amend | A project starts with a signed engine-only run and opens on its map in Analyze; the staged build-up with the code column retires; texts and names arrive in place. |
| ADR-086 | superseded for Analyze | IT is one page, code first: main sequence beside the score, findings beside their code, what it touches, structure, risks, open technical questions; no anchor bar. |
| ADR-087 | superseded for Analyze | Management is one page: what it is for, the indication (not a decision), four figures, options, risk, next steps, still open. |
| ADR-090 | retired | No "Result ready" tag: the project opens on the result. |
| ADR-093 | amend | The score stays the hero of IT, beside the main sequence; it is not part of Business. |
| ADR-099 | retired | The tool bar is the stage header's, with the soft-gate hint; there is no Business workspace header. |
| ADR-103 | superseded | First insights is Analyze's Business view: map, text around it with line anchors, 2–3 charts, two endings. |
| ADR-104 | unchanged | Note only: the pen mark per element is the same `proposed` value, never a spark. |
| ADR-105 | unchanged | Copy names "the view switch", never a position on screen. |
| new ADR-107 (AB-2) | new | Analyze is business first and is the project's entry; IT and Management are views of the same tool. |
| new ADR-108 (AB-3) | new | Names swap in per element after the fact check, within 45 s per program, announced in one status line; reduced motion swaps without motion. |
| new ADR-109 (AB-4) | new | The soft gate, the two equal endings and "What you can do next" live in the browser only; nothing locks, nothing is confirmed. |
| new ADR-110 (AB-7) | new | Charts under the map count only the engine's facts, each with its lines and *Reconstructed*; no chart without a sentence that says what it shows. |
| `DESIGN.md` §5 title and §5.1–5.5 | rewrite | "Analyze opens in the Business view"; §5.1 "The code speaks first — on demand in Business, prominent in IT"; §5.2 the stages become: map with engine names → text and names arrive → invitation; §5.3 without coach mark; §5.4 the 20 s exception describes the arrival, not the code column; §5.5 the page order of v4.1. |
| `DESIGN.md` §5.6 | amend | The "first answer on screen" of IT and Management as in v4.1. |
| `DESIGN.md` §2.3 | amend (O8) | "Next step in every view" does not apply to Analyze; the two endings take its place. |
| `DESIGN.md` §2.11 | amend | The list of what left the face and where it lives now (§1.1 of this plan). |
| `DESIGN.md` §6.1.2 | amend | The demo opens like a project: Analyze, Business. |
| `CLAUDE.md`, `docs/ARCHITECTURE.md` §2 | amend in AB-11 | "Every project opens in Analyze"; the workspace layers sentence goes. |

---

## 3. Engine and data prerequisites per element

"Exists" means a reader of it is in the repo today; the file is named. "Gap" is what the mockup shows that no code
produces yet.

| Element | Needs | Exists | Gap | Package |
|---|---|---|---|---|
| Map with engine names | business-level BPMN from the signed run | `WorkspaceProcess.tsx` → `ProcessMap.tsx` via `useProcessMap`; source from `lib/signed-source.ts` | — | AB-2 |
| Readable engine labels | positive questions, tables by their source, the program's own message texts | 3.0.22 branch: `lib/abap/plain-language.ts`, `lib/bpmn/model.ts` (`foldTechnique`), gate `lib/abap/engine-reads-3022-gate.ts` | merge (AB-1). Today's labels read "Perform check_requisition", "Update EBAN status H" (mockup state 1). | AB-1 |
| AI names from facts | facts per node, the checker | branch: `lib/naming-facts.ts` (`namingFactsOf`, `uncoveredWords`), `NAMING_WITH_FACTS = true`; measured on 30 LEARN cases: 65.9 % of nodes named, 48 % of those the engine label again, hand sample 0 of 60 invented; latency p50 3.2 s, p90 6.0 s, max 8.4 s | the stored record must carry `madeFrom: 'engine-facts'` or `dev`'s pause does not apply it (`lib/process-naming.ts:710`). `dev`'s naming route already stamps it when the server-built context carries facts (`app/api/projects/[projectId]/process-naming/route.ts:331`), and after the merge `namingContextOf` attaches facts by default; what AB-1 must still wire is `withFacts` in `useAutoProcessNaming`'s caller and `NAMING_ASKED_IN_THIS_BUILD` | AB-1 |
| Name swap, status line, 45 s | per-element arrival, a program-wide ceiling | `lib/process-naming-client.ts`, `tests/first-look-naming-wait.spec.ts` (today's wait) | the swap animation, the ceiling and the counted status line | AB-3 |
| Pen mark per element | provenance `proposed` per element; machine-readable marking in the BPMN export | `components/cc/ProvenanceChip`, `lib/ai-marking.ts`, `lib/bpmn/export.ts` | mark per element on the canvas; check the export marks exactly the swapped names (assumption: it did before the pause) | AB-3 |
| Line anchors | anchor per element | `.cc-map-anchor`, `bpmn-view.ts` (`ANCHOR_FONT` 11) | — | AB-2 |
| Code on click | side panel with the cited lines ± 2 | `components/process-map/ProcessCodeCard.tsx`, the source column of `WorkspaceProcess` | panel beside the map, never over it | AB-2 |
| "What this program does" | engine sentence; a proposal from the model with a fact check | `businessInShort` (`lib/program-summary-text.ts`), `purposeProposalOf` (`lib/program-summary-check.ts`) | two-sentence form; check that the proposal names only objects the engine read | AB-6 |
| "How it runs" | 4 paragraphs with anchors | `lib/process-story.ts` (5–8 engine steps), `lib/plain-wording.ts` (checked rewording) | grouping into the map's parts; "you are here" during the tour | AB-6 |
| "Why it exists" | purpose, marked as not said in the code | `purposeProposalOf` | the sentence "The code does not say this in words. Confirm it with the process owner." as fixed text | AB-6 |
| "Who is involved" | roles with lines | lanes of the skeleton (`ProcessSkeleton.lanes`, `laneEvidence`, `lib/abap/process-skeleton.ts:408`) | role sentences (engine only, *Reconstructed*) | AB-6 |
| "Questions to settle with the business" | questions with anchors | `lib/rule-questions.ts`, `lib/first-look-findings.ts` ("What the code gives away", ADR-103) | assumption: which of the mockup's six questions the engine produces today is not measured; AB-6 measures it on the examples | AB-6 |
| Chart "How a case can end" | ends with their reason | early ends (`process-skeleton.ts`, `earlyEnds`; ADR-054), stop texts (`lib/abap/branch-messages.ts`, `messageOf`, `decisionArmsAt`) | counting ends (P9), grouping by reason | AB-7 |
| Chart "What it changes, what it only reads" | writes, reads, a business word per table | writes: `lib/abap/reachable-writes.ts` (`ProgramWriteKind`); reads: `extractDataCoupling` (`accessType`, `lib/types.ts:338`); words: `lib/abap/business-glossary.ts` (`tableTerm`) | reads are not in `CallGraphReport` (`lib/abap/call-graph.ts:147`); use the data coupling; "reachable" for reads is not proven | AB-7 |
| Chart "The rules it applies" | rules by kind with their values | `explainBusinessRules` (`business-rule-set-explain.ts`) | the kind classification (N6) | AB-8 |
| Third branch at the plant-1000 gateway | a label on a flag-only default arm | default arm exists (N7) | the label | AB-7 (engine) |
| Tour | stations, sentences | `lib/process-tour.ts`, `lib/process-walk-guide.ts`, `components/workspace/ProcessTour.tsx` (modes `wide`/`landscape`/`stacked`, a full-screen layer `cc-tour-layer`), `TourCanvas.tsx` | an inline mode beside or above the map | AB-4 |
| Full screen | zoom, fit, overview map, find a step, edit | `useCanvasFullscreen`, `CanvasViewControls.tsx`, `ProcessMiniMap.tsx`, `ProcessSearch.tsx`, `BpmnEditor.tsx` ("Edit model") | one toggle "Edit", off on open; tour in the side column | AB-5 |
| IT: main sequence beside the score | the event block's lines, one explanation per call | `extractCodeInventory` (`lib/abap/code-assessment.ts`), `plainLabels`/`humaniseRoutine`, `CleanCoreScoreSection.tsx` | the per-call explanation list | AB-9 |
| IT: findings beside their code | finding rows, source lines | `EvidenceFindingsTable.tsx`, `findingRows` (`lib/findings-view.ts`), `SourcePanel.tsx` | top five beside code, the rest as a table | AB-9 |
| IT: what it touches, structure, risks, open questions | objects with statements; includes; dynamic calls | data coupling, call graph, `MissingDependencyPrompt.tsx`, `useOpenQuestions` | "Risks for a change" as one block (assumption: from `first-look-findings` and the open questions) | AB-9 |
| Management: purpose, indication, four figures, options, risk, next steps, still open | | `managementInShort` (`lib/program-summary-text.ts`), `signedRouteReport`, `DecisionOptions.tsx`, `pricedOptions` | the indication sentence (N1) | AB-10 |
| Endings, "What you can do next", soft gate | browser flags | `lib/first-look.ts` pattern; the tool sentences in `ToolBar.tsx` ("What the tools do") | the card, the 9b link, `cc.analyze.nextHidden.<projectId>` | AB-4 |

---

## 4. Three releases, 3.0.22 – 3.5.0

**Owner decision 06.11.2026:** the rebuild has clear priority, at most three releases, every other roadmap topic
moves behind it (`docs/ROADMAP.md` §7 and §9, rows from 3.5.1 on). The rule "one roadmap item per release" is
deliberately overridden for these three releases only; `dev` first and `main` only on Sonny's go still hold.

**Owner dates 06.11.2026:** 3.0.21 on `main` and the announcement mail for the new terms on **09.11.2026**; the terms
take effect and own Claude keys work from **22.12.2026** (corrected from 21.12: the six-week period runs to the end of 21.12); on 22.12 one communication — a click-through video of the
finished 3.5.0 and a LinkedIn post presenting "v3.5" (`docs/ROADMAP.md` §7). Milestones on the release branch `next`:
**M1 by 23.11**, **M2 by 07.12**, **M3 (the release candidate) by 16.12**; `next` goes to `main` on **22.12** together
with the key switch; 17.–21.12 is the buffer for QA, the recording and the owner's approval.

**Owner decision 06.11.2026, the Christmas release is v3.5.0:** the third rebuild release (called 3.0.24 until then)
becomes **3.5.0**, and since the same day it is the **only** release of the rebuild to users (§4.0). It carries the whole new UX, including the complete home page v2.1 (AB-14a, AB-14b and AB-14c —
none of it may move past Christmas), and own Claude keys switched on. **Key switch, revised with the branch
strategy:** on `next` the switch is **on from M1**, because `next` only reaches the owner through the private preview
(§4.0). The 22.12 cut-over checks the gate (terms in effect, T01/T03/T08 accepted); only if the gate fails does the
cut-over commit set it to `false` before the merge. One deploy, one CHANGELOG entry for v3.5.0. If `next` cannot go to
`main` on 22.12, the switch goes alone: a one-line commit on `dev` (3.0.21 line), QA round, `main` — the date the terms
promise holds either way.

The packages AB-0 … AB-13 keep their numbers (they are what §2 and §3 refer to); this section groups them:

| Milestone on `next` | Target | Packages | What the owner sees on the preview afterwards |
|---|---|---|---|
| **M1** (was 3.0.22) | 23.11.2026 | AB-0, AB-1, AB-2, AB-3, **AB-14a** | A project opens in Analyze, Business: the map is the page, engine names at once, checked AI names swap in with a status line. Today's text blocks and next-step card stand below the map until M2. IT and Management still have today's pages. A new account lands on the home page v2's first view with the start built in. |
| **M2** (was 3.0.23) | 07.12.2026 | AB-4, AB-5, AB-6, AB-7 (charts; the N7 engine label is out), **AB-14b** | The inline tour, the two endings, "What you can do next", the soft gate, full screen with Edit and tour, the checked text around the map, two charts. Business is finished. The home page list for returning accounts: every project, the new status words, four columns, tabs; the Continue card's data is stored, not yet shown. |
| **M3 = v3.5.0 release candidate** | 16.12.2026 on `next`; `main` 22.12.2026 | AB-9, AB-10, AB-11, AB-12, **AB-14c** | IT and Management each on one page in Analyze; `/project/[id]` redirects; demo, capture screens, landing pictures and the docs follow. The home page's "Continue where you left off" card with its map miniature and "In short". |
| later | — | AB-8 (third chart, N6), AB-13 (PDF with the tour texts, O11) | — |

**Why this cut.** M1 carries everything the new page stands on: the names (AB-1) are the prerequisite of the swap
(AB-3), and the swap has no place to happen until the map is the page (AB-2); moving the entry and retiring the
build-up in one release means the old first-look build-up never has to work against the new page. M2 is
everything that lives on the Business page and needs nothing from IT or Management; the tour must exist inline before
full screen gets its tour column (AB-4 before AB-5 inside the milestone). M3 is the second wide address change
(IT/Management, the dissolving workspace page) and the pictures, which must show the finished product and therefore
come last. AB-8 is out because N6 needs a new deterministic classification that the dates do not hold; the charts are
two. AB-13 stays later: it is not trivial (an export path with station texts).

**No broken intermediate state, even on the preview.** Users never see a milestone; still, every milestone is a
working product the owner can use. After M1 nothing is gone: today's `BusinessOpening` blocks (in short,
how it runs, who, what the code gives away) and `BusinessNextStep` stand below the map, and "Walk me through it" starts
today's tour layer, until M2 replaces each in place. IT and Management live in two places (workspace and Analyze)
between M1 and M3 on the preview; both work, and nothing new is built on the workspace copies.

**Is it realistic?** (revised 06.11.2026 with the branch strategy and "no cut on the workspace page") M1 has ten
working days (10.–23.11) for the widest change of the plan (AB-2: about 100 specs change an address) plus the swap. M2
(ten working days) is realistic with AB-8 out and the N7 engine label out. M3 has seven working days (08.–16.12) and
must now carry AB-9, AB-10, the **complete** AB-11 (redirects **and** the removal of the workspace shell's views,
layers and coach marks — owner decision 06.11.2026, no cut), AB-12 and the Continue card. Two things help: milestones
are not releases, so M1 and M2 save the `main` push, the owner's release go, the security audit and the full QA review
of a minor version (about a day each); and every package can start early on a sub-branch of `next`. **Honest
reading: 16.12 for M3 is not realistic in series; it is realistic only if AB-9, AB-10 and AB-11 each start on their own
sub-branch on 24.11** (AB-11's redirect map and its tests against every address the code writes can be built while M2
is in progress; the shell removal goes last, after AB-9/AB-10 are merged). The probable date for a green release
candidate is **18.12 (Friday)**; then 21.12 (Monday) carries the recording and both approvals, and the buffer is gone.
**Mitigations that remain:** AB-8, AB-13 and the N7 engine label stay out; rename (H-O8) only if decided by 24.11;
feature freeze on `next` on 16.12 (fixes only after it); the cut-over runbook rehearsed on the preview on 17.12; and a
decided fallback: if the release candidate is not green by **21.12, 12:00**, the owner decides between moving the
cut-over and going on 22.12 with the key switch alone on the 3.0.21 line — the communication then waits for 3.5.0.

**With the home page v2 (AB-14, added 06.11.2026) the dates hold only with a second track.** AB-14 touches the home
page's files (`WorkspaceListReport`, `YourTurnCard`, `lib/workspace-rows.ts`, `lib/project-progress.ts`, the app
shell), which no Analyze package writes, so it can be built on its own branch in parallel and merged into each release.
Built in series on top of the Analyze packages, it does not fit: M2 would carry five packages, one of them the
data change of O9. Honest reading: M1 holds (AB-14a is small and additive); M2 holds only if AB-14b runs on
the second track from 10.11 and its O9 row source is done by 30.11; 3.5.0 already had no slack, and since 06.11.2026
AB-14c may not move past Christmas (v3.5.0 carries the complete home page). **Re-plan for AB-14c:** everything it
needs that is data moves forward into M2 — the "In short" sentence written server-side when a run is created
(H-O6), the pure miniature from the stored skeleton (H-O7), and "last opened" kept in the browser (H-O5) — so 3.5.0
only wires the card from data that exists. This needs H-O5, H-O6 and H-O7 decided by 24.11.2026. M3's date is
discussed under "Is it realistic?" above: no cut on the workspace page, sub-branches from 24.11, probable 18.12.

### 4.0 One release branch, a private preview, and the cut-over on 22.12.2026

**Owner decision 06.11.2026:** everything after 3.0.21 is built on **one release branch**; `dev` stays on the 3.0.21
line (plus hotfixes) until the cut-over, and users see nothing of 3.5 before 22.12.2026. The milestones M1–M3 are
milestones on that branch, not releases. There are no user releases 3.0.22 or 3.0.23.

- **Name: `next`** (not `release` or `release/…`): `release` is the lane retired on 2026-08-31, and `deploy.yml` stops
  on it on purpose (`env-ctx`, case `release)`, exit 1); a `release/3.5` name would read like that lane and match
  nothing in the triggers. `next` maps one-to-one to a service `clean-core-next`. It branches from `dev` once 3.0.21 is
  on `main` (09.11.2026); work before that happens on worktree branches and is merged into `next` on its first day.
- **Sub-branches:** packages that run in parallel (AB-14 on the second track; AB-9, AB-10, AB-11 from 24.11) live on
  `next-<package>` branches cut from `next` and merge back into `next` by merge commit. Only `next` deploys.
- **Versions.** `lib/version.ts` and `package.json` on `next` say `v3.5.0` from M1 on, with a CHANGELOG entry
  `[v3.5.0]` "release candidate on the release branch"; its date is set to 22.12.2026 in the cut-over commit.
  **Every engine gate created on `next` is set to `'3.5.0'`**, including the naming branch's `ENGINE_READS_3022_FROM`
  (renamed with it): no user ever ran a 3.0.22 engine, and a hotfix on `dev` must never cross a gate it does not carry.
  **Hotfix numbering on the 3.0.21 line — recommended, owner to confirm.** The owner's name for them is "3.0.21.x";
  as a version string a four-part number breaks things, checked 06.11.2026:
  - `package.json` must hold a valid semver version, and `3.0.21.1` is not one (npm refuses it);
  - `version-drift-guard` requires `APP_VERSION` to match `^v\d+\.\d+\.\d+$` and `package.json` to equal it;
  - `version-dates-guard` and the CHANGELOG convention (`[vX.Y.Z]`) would need the fourth part too;
  - `parseEngineVersion` (`lib/score-rule.ts`) reads three parts and would read `3.0.21.1` as `3.0.21` — harmless for
    the gates, but a run's stamp would no longer name its build; the QA full-scope minor check
    (`scripts/qa/lib/full.mjs`, first two parts) would be unaffected.
  **Recommended:** hotfixes are **v3.0.22, v3.0.23, …** on `dev`/`main` ("3.0.21.x" stays the spoken name of the
  line), and the release branch goes straight to **v3.5.0** and never uses those numbers. It is safe because every
  engine gate of the 3.5 work says `'3.5.0'`: a run signed by a 3.0.22 hotfix is never read as carrying 3.5 readings.
  The four-part alternative needs the two guards, the CHANGELOG convention and the parser changed, and a semver
  prerelease form (`3.0.21-1`) would sort *below* 3.0.21 — both worse.
- **Merging hotfixes in:** after every hotfix on `main`, and at least every Monday, `dev` is merged into `next` (a
  merge commit, never a rebase of `next`); conflicts in `lib/version.ts`, `package.json` and `CHANGELOG.md` keep 3.5.0
  and add the hotfix's entry below it; the merge is its own push with its own CI run. `dev` never receives a commit
  from `next` before the cut-over.

**CI (`deploy.yml`; a workflow change for Sonny's go, not made here):**
1. add `next` to `on.push.branches`;
2. in `env-ctx` a case `next)`: `service=clean-core-next`, `db_id=clean-core-next`, `app_url=http://localhost:8080`
   (see the preview below), `max_instances=2`, `dev_limits_off=true`;
3. for that service, deploy with `--no-allow-unauthenticated` instead of `--allow-unauthenticated` (the deploy step's
   `flags` today allow everyone);
4. nothing else: the `validate` gate (lint, build, the six Playwright shards on the emulator) runs on `next` as it
   does on `dev`, and `deploy` waits for it.

**QA (`qa-review.yml`; a workflow change, not made here):** add `next` to the push branches and to the delta job's
condition (today `github.ref_name == 'dev'`); the smoke job stays `dev` only, since the preview is private (a smoke
check through an identity token is possible later). Check one thing in `scripts/qa/review.mjs` first: the delta starts
from the last pushed report's checkpoint; if that report can be a `dev` push, its checkpoint is not an ancestor of
`next`, and the delta falls back to "everything not yet on `main`" — the whole 3.5 work, far over the $1 cap. The
previous report must be taken from the same branch. The QA review loop of `docs/QA-REVIEW-LOOP.md` then runs after
every push to `next` as it does for `dev`. **UX review:** by hand on the branch, `gh workflow run ux-review.yml --ref
next -f mode=delta`, at M2 and M3. **Security audit:** it runs only on `main`, so on 22.12 it would meet the whole 3.5
delta at once; run it by hand against `next` at M3 (the workflow has `workflow_dispatch`; check that it accepts a
non-`main` ref) so its findings are in before the cut-over.

**The private preview `clean-core-next` (the owner runs the GCP steps):**
1. a Firestore database `clean-core-next` in `europe-west1` (its own database, not dev's: `dev`'s users and data stay
   on 3.0.21, and 3.5 writes new fields such as the stored "In short");
2. `firestore.rules` from `next` deployed to that database only — never `npm run deploy:rules` from `next`, because
   `firebase.rules-all-dbs.json` would put the 3.5 rules on production; add `clean-core-next` to that list at the
   cut-over at the earliest;
3. the Cloud Run service `clean-core-next` in `europe-west1`, created by the first deploy, private
   (`--no-allow-unauthenticated`), with the same runtime service account as dev and the same GitHub secrets (no new
   secret is needed; `CC_DEV_LIMITS_OFF=true`);
4. access only for the owner: `roles/run.invoker` on the service for his Google account, and the app opened through
   `gcloud run services proxy clean-core-next --region=europe-west1 --port=8080` at `http://localhost:8080` —
   `localhost` is an authorised Firebase Auth domain by default, so sign-in works without a public hostname; mail links
   from the preview point at `localhost` and work only on that machine, which is acceptable for an owner-only preview;
5. Firebase Auth is per project, so the owner signs in with his normal account; accounts and projects of the
   preview live in `clean-core-next` only.
The preview is emulator-free: it runs the production build against real Firebase, like `dev`. The own-Claude-key
switch is on there from M1 (only the owner uses it).

**Owner-run setup, outline** (the script itself goes to `scratch/` later; project `cleancore-491216`, region
`europe-west1`; nothing here is run by an agent):

```bash
# 1. Database for the preview (its own, never dev's or production's)
gcloud firestore databases create --database=clean-core-next --location=europe-west1 --project=cleancore-491216
# 2. Rules from the `next` branch to that database only (not `npm run deploy:rules`)
npx firebase-tools deploy --only firestore:rules --project=cleancore-491216   # with a one-off config naming only clean-core-next
# 3. The service is created by the first deploy from `next` (deploy.yml, case `next)`, flags --no-allow-unauthenticated);
#    afterwards make sure no public access exists and give the owner the invoker role
gcloud run services remove-iam-policy-binding clean-core-next --region=europe-west1   --member=allUsers --role=roles/run.invoker --project=cleancore-491216      # only if it was ever added
gcloud run services add-iam-policy-binding clean-core-next --region=europe-west1   --member=user:<owner's Google account> --role=roles/run.invoker --project=cleancore-491216
# 4. Secrets: none new. deploy.yml passes the same GitHub secrets as for dev (GEMINI_API_KEY, RESEND_*, S4_*,
#    BYOK_ENCRYPTION_KEY, AUDIT_SIGNING_*, peppers, PILOT_APPROVAL_SECRET) as env vars, plus CC_DEV_LIMITS_OFF=true.
# 5. Domain mapping: none. The owner opens the preview through the proxy:
gcloud run services proxy clean-core-next --region=europe-west1 --port=8080 --project=cleancore-491216
#    -> http://localhost:8080 (an authorised Firebase Auth domain by default)
# 6. After the cut-over: delete or keep
gcloud run services delete clean-core-next --region=europe-west1 --project=cleancore-491216
gcloud firestore databases delete --database=clean-core-next --project=cleancore-491216
```

**How `deploy.yml` deploys the branch** (the change for the owner's go, listed above under CI): `next` in the push
triggers; `env-ctx` case `next)` with `service=clean-core-next`, `db_id=clean-core-next`,
`app_url=http://localhost:8080`, `max_instances=2`, `dev_limits_off=true`; the deploy step's `flags` take
`--no-allow-unauthenticated` for this service instead of `--allow-unauthenticated`; the runner URLs stay empty (no
test runs on the preview: fail closed) unless the owner wants them. `validate` gates the deploy as on `dev`.

**Cut-over on 22.12.2026 (rehearsed on the preview on 17.12):**
1. Gate: the terms v2.3.0 are in effect; T01, T03 and T08 accepted; the release candidate green on `next` (CI, last
   QA round clean, security audit triaged, the owner's look at every state).
2. Merge the latest `dev` into `next`; CI green.
3. Cut-over commit on `next`: the CHANGELOG `[v3.5.0]` dated 22.12.2026 and the three dates in `lib/version.ts`;
   the key switch stays on — set to `false` here only if the gate in step 1 failed for T01/T03/T08.
4. If `firestore.rules` changed on `next`: the owner deploys them to the production database (additive changes
   first, before the deploy).
5. Merge `next` into `main` (merge commit) and push: the pipeline deploys `clean-core`; the QA full review (new minor)
   and the security audit run on `main`.
6. Bring `dev` to `main` (fast-forward); from now on `dev` is the 3.5 line again and `next` is closed.
7. The owner checks production; then the video and the post are published (`docs/ROADMAP.md` §7).
8. Afterwards: `CLAUDE.md` (deploy table, release routine) and `docs/ARCHITECTURE.md` describe the branch only if it
   stays; the preview service and database are deleted or kept by the owner's choice.

**Every milestone, the same frame.**

- **Commits on `next`:** one reviewable commit per step listed under the milestone, each building and green on its own;
  three pushes per milestone at most (the commit groups named below), each followed by `gh run watch` and the QA review
  loop (at most three rounds). A spec that changes only an address is its own commit, apart from behaviour changes, so
  a reviewer can see that no assertion was weakened.
- **CI and shards:** every commit that adds a rendered spec regenerates `tests/shard-plan.json`
  (`scripts/test/shard-plan.mjs`); `grep -rl <moved file> tests/` before every push; the layout guard is split per
  viewport group.
- **Before a milestone is marked done (and before the cut-over):** a production build with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` set for the build,
  `npm start`, emulators with `--project=cleancore-491216`; the rendered specs listed under the release plus whatever
  `scripts/test/affected-rendered.mjs` adds; then the whole suite once, quietly; push only on exit code 0. CI runs the
  same on every push to `next`.
- **[look] and Sonny's go:** the screenshots of every touched state at the six viewports go to Sonny beside the
  mockup's states on the preview; a milestone is done only after a clean QA round and his look.

Notation: **Files** = the write set. **Specs** = add / change / retire. **Done when** = acceptance. Every package
also: runs `grep -rl <moved file> tests/` before pushing (CLAUDE.md gotcha), moves the demo with the real page (O10),
keeps nothing over anything, and is looked at in screenshots by the person who built it before it is reported done.

Shared acceptance, referred to as **[look]**: screenshots at 1920 × 1080, 1440 × 900, 1280 × 800, 1024 × 768,
768 × 1024 and 390 × 844 of every state the package touches, opened and compared with the mockup's state of the same
number; `tests/analyze-layout-guard.spec.ts` (AB-0) at 0 overlaps, 0 clipping, 0 focus-out, 0 sideways page overflow,
0 script errors for those states; the copy guard green.

### 4.1 Milestone M1 (was 3.0.22) — Analyze opens business first, names from the code's facts (target 23.11.2026)

- **Scope:** AB-0, AB-1, AB-2, AB-3 below, and AB-14a (the home page's first view for a new account, built on the
  second track).
- **Commit groups (three pushes):** **(a)** the merge of `worktree-agent-a0d2bc8b7d821f2d8` with `tests/shard-plan.json`
  regenerated (the one conflict); the `withFacts` wiring and `NAMING_ASKED_IN_THIS_BUILD`; the AB-0 harness (mockup
  copy, overlap helper, layout guard report-only, copy guard). **(b)** `AnalyzeBusiness` rendered for `?view=business`
  on the Analyze route while the workspace is still the entry; then the entry points and the redirect; then the
  address-only spec changes in their own commit; then the hub/analysis-ready retirement; then the demo. **(c)** the name
  swap and status line, the build-up retired; the layout guard to fail for states 1, 2, 3, 7, 17, 18; `v3.5.0` on `next`.
- **Rendered specs on the production build before M1 is done:** `analyze-business-first`, `analyze-layout-guard` (states
  1, 2, 3, 7, 17, 18), `analyze-naming-swap`, `example-opens-workspace`, `example-start-no-page-error`,
  `own-code-import`, `own-code-import-page`, `starter-examples`, `workspace-start`, `workspace-start-model`,
  `finished-project-process`, `first-look-map`, `first-look-naming-wait`, `workspace-business`,
  `business-view-clarity`, `workspace-view-switch`, `workspace-reopen`, `return-path-guard`, `way-in-and-back`,
  `workflow-style-guard`, `stage-view-switch`, `design-rendered-guard`, `mobile-responsive`, `analyze-one-place`,
  `score-hero`, `demo-project`, `legacy-projects`, `process-naming-auto`, `byok-3021`.
- **Acceptance:** each package's "Done when" below; [look] for states 1, 2, 3, 7, 17, 18 and the phone; a project
  signed by 3.0.21 keeps its picture; nothing that a user had before is missing (the interim blocks stand below the
  map).
- **Risk:** high, the highest of the three milestones (AB-2). Interim on the preview: IT and Management in two places.

#### AB-0 — measurement and guard harness (test and docs only, P11) · S

- **Scope:** put the accepted mockup in the repo; measure today; build the overlap check the later packages need.
- **Files:** `docs/roadmap/analyze-business-first-mockup.html` (copy of the v4.1 HTML, P10) and
  `docs/roadmap/home-mockup-v2.html` (copy of the home page mockup v2, AB-14); `scripts/ux/lib/config.mjs`
  (the two mockup files); `tests/helpers/overlap.ts` (new: the checks of `shoot.cjs` — intersecting pairs, clipping,
  focus-out, page overflow — on `data-*` hooks instead of mockup classes); `tests/helpers/first-screen-count.ts` (new);
  `tests/analyze-layout-guard.spec.ts` (new, one file per viewport group so shards can split it).
- **Specs:** add `analyze-layout-guard` (report-only until AB-2), `analyze-copy-guard.spec.ts` (server-free: the
  mockup's banned-word search over Analyze's message catalogue; English; no consultant or AI phrasing — the list
  comes from the mockup run, not invented here). Negative probe: a card moved over the map turns the guard red (the
  mockup's own counter-check found 12 hits).
- **Done when:** today's Business and Analyze first-screen counts are measured on a prod build and written into §1.2;
  the guard reports on today's pages; `ux-review-guard` and `mockup-roadmap-guard` green.
- **Risk:** low. A guard that reads computed layout is slow; keep it to the states each package touches.

#### AB-1 — Names and labels from the code's facts · M

- **Scope:** merge the branch onto `dev`; names come back only with facts; engine labels read as business language
  from engine 3.5.0 (the branch's `3.0.22` gate set to `'3.5.0'`, §4.0).
- **Files:** the branch's 17 files; `lib/process-naming.ts` (`NAMING_ASKED_IN_THIS_BUILD` from the facts switch; the route already stamps
  `madeFrom: 'engine-facts'` for a facts context, route.ts:331), `components/workspace/WorkspaceProcess.tsx` (pass `withFacts`); `tests/shard-plan.json` (regenerate, the one conflict); `lib/version.ts` at release.
- **Specs:** add `naming-facts-3022`, `business-language-3022`, `business-readability-ratchet` (from the branch);
  change `naming-paused-3021` (the pause stays for prompts without facts; a facts prompt passes and is stored),
  `process-naming-auto`, `process-naming`, `statement-proposal-route`; check `byok-3021` (own key: switch off by
  default). Every spec reading `APP_VERSION` 3.0.21 for the old picture stays green (the gate).
- **Done when:** on the PO example and the other starter examples the stored naming carries `engine-facts` and is
  applied; the BPMN download marks exactly the model's names; a run signed by 3.0.21 keeps its picture; the
  readability ratchet does not go up; screenshots of the workspace map before/after shown to Sonny (the UI is still
  today's).
- **Risk:** medium. 34 % of nodes stay unnamed and half of the named ones equal the engine label (branch
  measurement), so the visible swap of AB-3 is smaller than in the mockup. `namingFactsOf` always uses the 3.5.0
  labels, also for a project signed by an older engine — check that facts and drawn labels match on such a project.

#### AB-2 — Analyze opens business first: the map is the page · L

- **Scope:** the Business view of Analyze per mockup states 3, 7 and 17 without the tour, the swap and the text
  blocks: header as today's `StageHeader` (way back, view switch, tools, soft-gate hint), "What this program does"
  with the engine sentence, the invitation bar ("Walk me through it" starts today's tour layer until AB-4; "I'll look
  around myself"), the map tool row above the map (Map \| Steps, zoom, fit, "Full screen" — today's full screen), the
  status line and the legend below, code on click in a side panel. Entry points go to Analyze; `/project/[id]` in
  Business redirects. IT and Management of Analyze keep today's page until AB-9/AB-10. **Interim until M2**
  (release cut of 06.11.2026, so nothing a user had goes missing): today's `BusinessOpening` blocks and
  `BusinessNextStep` are rendered unchanged below the map; AB-6 and AB-4 replace them in place.
- **Files:** `app/(app)/project/[projectId]/analyze/page.tsx` (view switch: Business renders the new component; the
  start run of ADR-072 moves here from `app/(app)/project/[projectId]/page.tsx`); `components/analyze/AnalyzeBusiness.tsx`
  (new); `components/workspace/WorkspaceProcess.tsx` (reused, side panel beside the map); `app/(app)/project/[projectId]/page.tsx`
  (redirect for Business, in the pattern of `layerRedirect`); `lib/layer-redirect.ts`, `lib/workspace-back-href.ts`;
  `components/StarterExamples.tsx`, `components/workspace/OwnCodeImport.tsx`; `components/workspace/WorkspaceShell.tsx`
  (Business branch out; `WorkspaceHub`, `AnalysisReady` out); demo: `components/demo/DemoWorkspaceShell.tsx`,
  `DemoAnalyze.tsx`; `lib/workspace-messages.ts` (copy).
- **Specs:** add `analyze-business-first.spec.ts` (source half: no score, no findings, no code before a click in
  Business; rendered half: seeded PO project, the map is the first block under the summary at 1440 × 900);
  change `example-opens-workspace`, `example-start-no-page-error`, `own-code-import`, `own-code-import-page`,
  `starter-examples`, `workspace-start`, `workspace-start-model`, `finished-project-process`, `first-look-map`,
  `workspace-business`, `business-view-clarity`, `workspace-view-switch`, `return-path-guard`, `way-in-and-back`,
  `back-link-wording`, `workflow-style-guard` (the Analyze title in Business), `workspace-shell-guard` (Business
  order gone), `stage-view-switch`, `page-anchor-guard`, `design-rendered-guard` (routes), `mobile-responsive`,
  `analyze-one-place`, `analyze-answer-first`, `score-hero`, `score-bands-guard`, `stage-meta-details` (all to
  `?view=it`), `demo-shared-boundary`, `demo-project`; retire `analysis-ready`, `workspace-hub`, `workspace-hub-running`.
  Turn `analyze-layout-guard` from report to fail for states 3, 7, 17 (with AB-3 in the same release: also 1, 2, 18).
- **Done when:** [look] for states 3, 7, 17 and the phone; a starter example opens Analyze, Business, with a signed run
  and no model call; an old link `/project/<id>?view=business#need` lands on the map; `#L42` opens the code panel;
  an invited reader sees the map, no "Edit", no model call (P8); the demo opens the same way; 0 `primary` buttons
  besides "Walk me through it".
- **Risk:** high — the widest change. 48 specs read the first-look hooks or `?first=1`, 54 read `view=it|management`
  (grep, 06.11.2026); most need only an address. Interim state: IT and Management live twice (workspace and today's
  Analyze page) until AB-10. Landing pictures come from `/demo/workspace` (`tests/capture-screens.spec.ts:411`): do
  not re-shoot them before AB-12.

#### AB-3 — Names swap in visibly, at most 45 s · M

- **Scope:** mockup states 1, 2, 3 and 18: engine names at once, a waiting mark on elements still waiting, the swap
  per element (0.9 s, the old name slides up, the new one in, a short tint, the pen mark), one status line ("Naming
  steps in plain language … 13 of 25"; afterwards "Names are ready. 3 steps kept their technical name (no pen mark)."),
  a program-wide ceiling of 45 s; reduced motion swaps without motion; never under focus or an open popover
  (ADR-025). The paced build-up with the code column retires. Old projects get one facts naming (P2).
- **Files:** `components/process-map/NamingSwap.tsx` (new; or inside the canvas overlay layer, decided while building),
  `components/process-map/bpmn-view.ts`, `components/process-map/process-map.css`, `lib/process-naming-client.ts`,
  `hooks/` (one hook for the arrival), `components/workspace/FirstLook.tsx` and `FirstLookBuildUp.tsx`,
  `lib/first-look-buildup.ts`, `lib/first-look-excerpt.ts` (delete), `lib/first-look.ts` (keep the seen flag).
- **Specs:** add `analyze-naming-swap.spec.ts` (stubbed naming route, `gemini-test-stub-guard`; assert the final
  state, the pen marks only on swapped elements, the counted status line and the 45 s end state with a short ceiling
  in the test — never sample a mid-animation window, see the CLAUDE.md gotcha), `ai-mark-per-element.spec.ts`
  (server-free: an element the engine named carries no mark; the export marks exactly the model's names);
  change `first-look-naming-wait`, `process-naming-auto`, `byok-3021`; retire `first-look-buildup-view`,
  `first-look-pacing`, `first-look` (its build-up half), `first-look-3021` (its drawing half).
- **Done when:** [look] for states 1, 2, 3, 18; a failed or slow model leaves every engine name in place and the status
  line says so in one sentence; the page is usable during the whole arrival; an invited reader's visit asks nothing.
- **Risk:** medium. Timing in CI (production build is faster than `next dev`); motion on a canvas of 60+ elements
  (state 18) — measure frame time on the large example before release.

### 4.2 Milestone M2 (was 3.0.23) — the Business page is complete (target 07.12.2026)

- **Scope:** AB-4, AB-5, AB-6, AB-7 below, and AB-14b (the home page list, second track). The inline tour with the two endings, "What you can do next" and the soft
  gate; full screen with navigation, "Edit" and the tour; the checked text around the map; **two** charts. AB-8 (the
  third chart, N6) is not in it. The N7 engine label (AB-7, engine part) is out of v3.5.0 (a mitigation kept on 06.11.2026);
  the charts do not depend on it.
- **Commit groups (three pushes):** **(a)** `lib/analyze-progress.ts` and the inline tour mode; the endings and
  "What you can do next" replacing `BusinessNextStep` and `ProcessTourEntry`; the tool-bar soft hint and the "Next"
  tag rule; the demo walk-through. **(b)** `AroundTheMap` replacing the interim `BusinessOpening` blocks; the
  full-screen bar, "Edit" and the tour column. **(c)** the two charts; the N7 label behind its own engine gate if
  measured; the layout guard to fail for the new states. Address-only spec changes stay their own commits.
- **Rendered specs on the production build before M2 is done:** `analyze-tour-inline`, `analyze-endings`,
  `analyze-fullscreen`, `analyze-layout-guard` (states 4, 5, 6, 8, 9, 9b, 10, 14, 15, 16, 17), `analyze-business-first`,
  `process-tour`, `process-tour-3021`, `process-tour-screens`, `demo-walk-3020`, `demo-tour`, `workspace-toolbar`,
  `next-step`, `start-run-next-step-rendered`, `process-map-draft-identity`, `process-revisions-base`,
  `workspace-revision-stand`, `process-map-phone-fit`, `first-look-plain`, `first-look-findings`,
  `workflow-style-guard`, `mobile-responsive`, plus the M1 list once more (it is the same page).
- **Acceptance:** each package's "Done when"; [look] for states 4, 5, 6, 8, 9, 9b, 10, 14, 15, 16, 17 at the six
  viewports, including `full-phone-09` (the collapsed card) and the 1280/1024 tour (focus-out 0); Sonny reads the text
  around the map on every starter example before M2 is done (AB-6 risk); the chart sums match the map on every example.
- **Risk:** medium. Four packages on one page: the tour card narrows the map, and full screen shares the editor with
  Documentation.

#### AB-4 — The walk-through on the map, two endings, "What you can do next" · M

- **Scope:** states 4, 5, 6, 9, 9b, 10, 17: the tour inline (card beside the map on desktop, above it up to 1100 px,
  N3), the camera scrolls to the station; the last station shows the two equal endings; after the tour the soft-gate
  hint goes and the card "What you can do next" stands **below the endings** (open from 1024 px, one collapsed line
  at 768 px and on a phone, v4.1), with "Hide" per project in the browser and the quiet link back (N9); the
  soft-gate note when a later tool is clicked before the tour; the "Next" tag rule (O8); invited reader endings (P8);
  the Re-design text with a computed figure or none (P6).
- **Files:** `components/workspace/ProcessTour.tsx` (inline mode next to `cc-tour-layer`), `components/process-map/TourCanvas.tsx`,
  `components/analyze/AnalyzeEndings.tsx` (new), `components/analyze/WhatNextCard.tsx` (new), `lib/analyze-progress.ts`
  (new: `cc.analyze.walked.<id>`, `cc.analyze.nextHidden.<id>`, pure), `components/workspace/ToolBar.tsx`
  (soft hint, tooltip sentences, "Next" tag), `lib/workflow-steps.ts` (read only; no phase change),
  `ProcessTourEntry.tsx`, `BusinessNextStep.tsx`, `lib/business-next-step.ts` (delete; until this release they stand
  below the map, see AB-2's interim), `components/demo/DemoWalkThrough.tsx`.
- **Specs:** add `analyze-tour-inline.spec.ts`, `analyze-endings.spec.ts` (both endings `secondary`; nothing locked;
  no confirmation; "Hide" survives a reload, a second project is unaffected, no Firestore write), change
  `process-tour`, `process-tour-3021`, `process-tour-screens`, `demo-walk-3020`, `demo-tour`, `workspace-toolbar`,
  `next-step`, `start-run-next-step`, `start-run-next-step-rendered`, `workflow-phases-guard` (no change expected —
  assert it), `phase-honesty-guard`; retire `walk-layout-3020`.
- **Done when:** [look] for states 4, 5, 6, 9, 9b, 10, 17, including `full-phone-09` (the collapsed line) and the
  1280/1024 tour where the station must fit (focus-out 0); keyboard: Back, Pause, Next and Escape work, focus returns
  to "Walk me through it".
- **Risk:** medium. The tour card beside the map narrows the map; the mockup needed the zoom-to-station fix at 1280 and
  1024 px. ADR-025 floor (P-decision with N2): if the station does not fit at 83 %, scroll, do not shrink further.

#### AB-5 — Full screen: navigate, Edit, tour · M

- **Scope:** states 14, 15, 16: one bar (find a step with hits by displayed name, zoom, fit, overview map, "Edit"
  toggle off on open, "Walk me through it", "Leave full screen"), editing as today's `BpmnEditor` behind the toggle with
  "Save as revision" and the N8 sentence, the tour in the side column, code on click; "Leave full screen" returns to
  the same state. Phone: "Edit" disabled with a sentence (P3).
- **Files:** `components/process-map/ProcessMap.tsx`, `BpmnEditor.tsx`, `CanvasViewControls.tsx`, `ProcessSearch.tsx`,
  `ProcessMiniMap.tsx`, `EditorProperties.tsx`, `process-map.css`.
- **Specs:** add `analyze-fullscreen.spec.ts`; change `process-map-draft-identity`, `process-revisions-base`,
  `workspace-revision-stand`, `process-map-phone-fit`, `a11y-source-guard`.
- **Done when:** [look] for 14, 15, 16; a save writes a new revision and revision 1 is unchanged; an unsaved draft
  survives leaving full screen (`lib/process-map-draft.ts`); Documentation's editor is unchanged.
- **Risk:** low to medium; the editor is shared with Documentation (`documentation/page.tsx` imports it).

#### AB-6 — The text around the map, checked · M

- **Scope:** "What this program does" (two sentences, the model's only after `purposeProposalOf` passes, N5), "How it
  runs" (four paragraphs from `process-story`, reworded through `plain-wording`, "you are here" during the tour), "Why it
  exists" (purpose with the fixed caution sentence), "Who is involved" (lanes, *Reconstructed*), "Questions to settle
  with the business" (engine questions, each with its line); placeholders while text arrives; the summary hidden while
  the tour runs; AI chip only on a block a model wrote.
- **Files:** `components/analyze/AroundTheMap.tsx` (new), `lib/program-summary-text.ts`, `lib/program-summary-check.ts`,
  `lib/process-story.ts`, `lib/plain-wording.ts` (read), `BusinessOpening.tsx`, `ProgramInShort.tsx` (delete; the
  interim blocks below the map from AB-2 go with them).
- **Specs:** add `analyze-around-the-map.spec.ts` (server-free: every sentence has an anchor; a proposal naming an
  unread object is dropped; engine text carries no chip); change `first-look-plain`, `first-look-3021` (rest),
  `first-look-findings`, `plain-wording`, `narrative-anchors`, `no-fabricated-figures`, `business-readability-ratchet`
  (reads the new blocks).
- **Done when:** [look] for 3, 5, 9; measured on every starter example: which of the mockup's question kinds the engine
  produces (the assumption in §3 resolved); no sentence without its line.
- **Risk:** medium. Model text that passes the narrow check can still be dull or vague; the copy guard catches words,
  not quality — Sonny reads the examples before release.

#### AB-7 — Two charts under the map, and the flag-only branch · M

- **Scope:** "How a case can end" (ends grouped by reason, P9) and "What it changes, what it only reads", each with
  its sentence, its lines, *Reconstructed*, every row a button that highlights the elements ("Showing: … · Clear");
  style of `components/TestingCharts.tsx` and `DESIGN.md` §1.8. Engine: the label on a default arm whose body only sets
  a flag (N7), behind a new engine gate, measured on the 300-case benchmark (LEARN only; the holdout is not touched).
  Release cut (revised 06.11.2026): the engine part is out of v3.5.0 and comes later; the charts do not wait for it.
- **Files:** `lib/process-fact-charts.ts` (new, pure), `components/analyze/ProcessFactCharts.tsx` (new),
  `lib/abap/process-skeleton.ts` or `lib/abap/plain-language.ts` (the arm label; which one is decided by reading the
  mapper), a new gate in `lib/abap/`.
- **Specs:** add `process-fact-charts.spec.ts` (server-free, on the starter examples: counts equal the map's end
  events; reads come from data coupling, writes from `reachableWrites`), `engine-flag-arm.spec.ts`; change
  `cc-severity-charts` only if the chart primitives move.
- **Done when:** [look] for 8 and 9; the chart sums match the map on every example; the benchmark W1+W2 does not drop.
- **Risk:** medium. A chart that counts something the reader cannot find on the map loses trust — hence the highlight.

#### AB-8 — later · Rules by kind, the third chart · S–M

*Moved out of the three releases (release cut of 06.11.2026): N6 needs a new deterministic classification that the
dates do not hold. Until it ships, Business shows two charts.*

- **Scope:** a deterministic kind per rule (check, limit, approval, exception) beside `RuleTopic`, display only; the
  chart "The rules it applies" with its deciding values.
- **Files:** `lib/abap/rule-kind.ts` (new, pure), `lib/process-fact-charts.ts`, `ProcessFactCharts.tsx`.
- **Specs:** add `rule-kind.spec.ts` (minimal ABAP per kind, written fresh); assert the signed payload and the audit
  pack are unchanged (`run-integrity-guard`, `audit-pack-canonicalisation`, `audit-pack-signed-input` green, no change).
- **Done when:** [look] for 9; every rule has a kind or "other", never a guess.
- **Risk:** low.

### 4.3 Milestone M3 = the v3.5.0 release candidate — IT and Management on one page, the workspace page dissolves (on `next` 16.12, to `main` 22.12.2026)

- **Scope:** AB-9, AB-10, the **complete** AB-11 (no cut, owner decision 06.11.2026), AB-12 below and AB-14c (the
  Continue card, on data built in M2); the key switch is already on on `next` (§4.0). Nothing of it moves past Christmas. After it the product is
  the one the 22.12.2026 video shows as "v3.5".
- **Version:** `v3.5.0` on `next` since M1 (§4.0); the CHANGELOG entry is dated 22.12 in the cut-over commit; on
  `main` the step is 3.0.21 (or its last hotfix) to 3.5.0. The engine gates compare numerically
  part by part (`engineVersionAtLeast`, `lib/score-rule.ts`), so every gate "from 3.0.x" applies at 3.5.0; a gate added
  in this release is named for 3.5.0. The jump is a new minor version, so the QA agent reviews the whole code base on
  the push to `main` (`scripts/qa/lib/full.mjs`, cap $3).
- **How it fits seven working days:** AB-9, AB-10 and AB-11 are built in parallel on `next-` sub-branches from
  24.11.2026 (AB-9/AB-10 touch the IT and Management branches of `analyze/page.tsx`, which M2 does not; AB-11 starts
  with its redirect map and tests, and removes the shell last) and merged into `next` from 08.12; AB-12 follows. Parallel agents run only server-free specs; one quiet production-build run
  at the end.
- **Commit groups (three pushes):** **(a)** the merge of the IT branch (AB-9) and of the Management branch (AB-10),
  each with its address-only spec changes as separate commits. **(b)** AB-11: one redirect function for every address
  `/project/[id]` ever wrote, tested against each; the workspace shell's views, layers and coach marks retired; the
  docs (`CLAUDE.md` with Sonny's go, `docs/ARCHITECTURE.md` §2, `DESIGN.md` §2.3/§5, the ADRs of §2.2). **(c)** AB-12:
  demo tour texts, capture screens, landing pictures, the UX agent's screen list.
- **Rendered specs on the production build before the cut-over:** `analyze-it-one-page`, `analyze-management-one-page`,
  `analyze-layout-guard` (states 11, 12, 13 and every earlier state), `score-hero`, `analyze-one-place`,
  `analyze-answer-first`, `analyze-polish-rendered`, `analyze-findings-focus`, `management-overview`,
  `management-answers`, `management-decision-hero`, `management-decision-options`, `management-executive`,
  `decision-card`, `steering-one-pager`, `steering-one-pager-print`, `workspace-shell-guard`, `workspace-layers`,
  `workspace-fragment-guard`, `workspace-view-switch`, `choice-walk`, `follow-hash-scrollbar`, `it-view`,
  `it-findings`, `it-view-uses`, `standard-fit-in-it`, `workspace-a11y`, `return-path-guard`, `way-in-and-back`,
  `demo-project`, `demo-tour`, `landing-process-guard`, `landing-style-guard`, `capture-screens` (with
  `CAPTURE_LANDING`), `project-readers`, `invitation-rendered`; then the whole suite once.
- **Acceptance:** each package's "Done when"; [look] for 11, 12, 13 and a final pass over all 19 states; Sonny's
  walk-through with the demo and every starter example; the landing pictures seen by Sonny before `main`; every deep
  link a stage, a mail or a bookmark writes lands on its content.
- **Risk:** high: the second wide address change, the complete removal of the workspace shell, the 2,261-line Analyze
  page and the Continue card, in the shortest window, with no cut allowed. Probable green release candidate 18.12;
  fallback at 21.12, 12:00 as in §4 ("Is it realistic?"). The key switch does not wait for 3.5.0.

#### AB-9 — IT on one page, code first · L

- **Scope:** state 11, 12: the main sequence as code with one explanation per call beside the score; the five most
  important findings each beside its code, the rest in a table, "All N findings, as a table"; what it touches in SAP
  with the statement per object; structure and dependencies; risks for a change; open technical questions with "Add
  evidence"; the two endings; one sentence of business context if the tour was skipped. The model summary stops being
  a block (P4).
- **Files:** `components/analyze/AnalyzeIt.tsx` (new), `AnalysisAnswer.tsx`, `CleanCoreScoreSection.tsx`,
  `EvidenceFindingsTable.tsx`, `SourcePanel.tsx`, `ProgramMap.tsx` and `AnchoredNarrative.tsx` (delete if unused),
  `analyze/page.tsx` (IT branch).
- **Specs:** add `analyze-it-one-page.spec.ts`; change `score-hero`, `analyze-one-place`, `analyze-answer-first`,
  `analyze-polish`, `analyze-polish-rendered`, `analyze-findings-focus`, `findings-level-per-kind`, `unearned-verdicts-guard`,
  `page-anchor-guard`, `sap-identifiers-3012`, `ux-register-3018`, `atc-*`, `usage-*` (the evidence dialogs stay),
  `preservation-register` (Analyze's writes unchanged).
- **Done when:** [look] for 11, 12; every finding of the run is reachable on the page; Level A–D shown as today;
  no anchor bar.
- **Risk:** medium–high: the Analyze page is 2,261 lines and the heaviest file of Block D.

#### AB-10 — Management on one page · M

- **Scope:** state 13: what it is for, the indication (N1), four figures, options with effort only where Economics
  computes it, risk if nothing changes, next steps, still open, the two endings; the decision record and the one-pager
  placed per P5.
- **Files:** `components/analyze/AnalyzeManagement.tsx` (new), `ManagementOverview.tsx`, `ManagementExecutive.tsx`,
  `DecisionOptions.tsx`, `DecisionCard.tsx`, `SteeringOnePager.tsx`.
- **Specs:** add `analyze-management-one-page.spec.ts`; change `management-overview`, `management-answers`,
  `management-decision-hero`, `management-decision-options`, `management-executive`, `decision-card`,
  `steering-one-pager`, `steering-one-pager-print`, `money-honesty-guard` (no amount without Economics), `currency-other`.
- **Done when:** [look] for 13; no effort figure that Economics did not compute; "an indication, not a decision" in
  the sentence, not in a popover.
- **Risk:** medium; decision links (`?view=management#decision-card`, `lib/choice-addresses.ts`) need a new home.

#### AB-11 — The workspace page dissolves · M

- **Scope:** decide O3 and P5 with screenshots; `/project/[id]` redirects to Analyze in every view with old fragments
  mapped; retire the workspace shell's views, layers and coach marks (P7); update `CLAUDE.md`, `docs/ARCHITECTURE.md`
  §2, `DESIGN.md` §2.3/§5, the ADRs of §2.2.
- **Files:** `app/(app)/project/[projectId]/page.tsx`, `components/workspace/WorkspaceShell.tsx`, `LayerBar.tsx`,
  `LayerSection.tsx`, `CoachMarks.tsx`, `lib/coach-marks.ts`, `lib/layer-redirect.ts`, `lib/workspace-back-href.ts`,
  `lib/choice-addresses.ts`, the docs above.
- **Specs:** change `workspace-shell-guard` (to the redirect), `workspace-layers`, `layer-back-to-top`,
  `workspace-fragment-guard`, `workspace-view-switch`, `workspace-view-switch-from-layer`, `choice-walk`,
  `choice-addresses`, `follow-hash-scrollbar`, `coach-mark-placement` (retire), `it-view`, `it-findings`,
  `it-view-uses`, `standard-fit-in-it`, `workspace-a11y`, `view-attribute-guard` (stays green unchanged).
- **Done when:** every address a stage, a mail or a bookmark writes lands on a page that has its content; the
  workspace list (`/dashboard`) unchanged.
- **Risk:** medium; many deep links.

#### AB-12 — Demo text, examples, capture screens, landing pictures · S–M

- **Scope:** the demo tour texts for the new stations; every starter example walked through on dev by Sonny;
  `tests/capture-screens.spec.ts` gets the Analyze states; the landing pictures re-shot (`CAPTURE_LANDING`); the UX
  agent's screen list.
- **Files:** `lib/demo-tour.ts`, `tests/capture-screens.spec.ts`, `scripts/ux/lib/config.mjs`, `public/<landing shots>`.
- **Specs:** change `capture-screens`, `ux-review-guard`, `landing-process-guard`, `landing-style-guard` if a picture's
  frame changes.
- **Done when:** Sonny's walk-through with the demo and every example; the landing shows today's product.
- **Risk:** low; the landing is public — Sonny sees the pictures before `main`.

#### AB-14 — Home page v2, "My workspace" (owner acceptance of mockup v2, 06.11.2026) · M–L in three parts

- **Mockup:** `scratch/mockups-0511/home-mockup/home-mockup.html` (v2.1 since 06.11.2026; 12 states × 6 viewports in
  `screens/`, overlap check 0 in all 72). Like the Analyze mockup (P10) it is copied unchanged into `docs/roadmap/` with AB-0, as
  `docs/roadmap/home-mockup-v2.html` together with its local font file; its report is German and stays out of the repo.
  State numbers below are the mockup's (1 new account … 12 runs used up).
- **Why it belongs to the rebuild:** a project now opens in Analyze and First insights is part of Analyze, so the home
  page loses its First-insights remnants and gains a first view that says what happens: one program in, its process
  as a map out, every step with its line.

**Owner decisions on the home page (06.11.2026)**

| No. | Decision |
|---|---|
| H-O1 | The map excerpt on the new-account view is drawn live from the demo map with the same renderer as Analyze, cut after the first elements. No hand-written names: it shows what the product shows (engine names today, checked AI names once they swap in). |
| H-O2 | "about 20 seconds" is measured on production for `Z_MM_PO_APPROVAL` (median and 90th percentile) and dropped unless it is reliably under 30 s. |
| H-O3 | The new status wording: *Analysed* · Map, findings and score ready / *Re-design under way* / *Re-design done* / *Handed over*; "N of 6 steps" for re-design; Re-design is never offered as a next step on the home page. |
| H-O9 | Projects beyond the newest 25 (QA finding `c559b61a9b31`) are solved before the page is built: a lean row source without source code; search and filters over every project. |
| H-O10 | Dates in this list as "6 Nov 2026"; ISO stays in exports and audit views; `DESIGN.md` §3 gets this exception. |
| H-O11 | For a new account the start is built into the page: dropping or choosing a file opens today's start with the file preset; edition and cost are asked as today. |
| H-O12 | The run-dialog sentence on the model call goes to legal review; until then today's wording stays. |
| H-O13 | "New analysis" is the only filled button; "Open the process map" is secondary. |
| H-O14 | The name "My workspace" stays, through v3.5.0. |
| H-O15 | On the new-account view the only green button is "Start this example" on the recommended example; "Choose a file" is secondary (mockup v2.1, accepted 06.11.2026). "New analysis" stays the only filled button for returning accounts (H-O13). |
| — | The empty gap bottom-left in the desktop new-account state of v2 is closed: in v2.1 the demo line fills it, and both columns end together. |

**Still open, with the mockup agent's recommendation**

| No. | Question | Recommendation | Needed before |
|---|---|---|---|
| H-O4 | The small six-segment bar for re-design (the owner rejected a seven-segment bar with five looks on 02.10.2026) | Try it: two looks, no legend, only on a started re-design; if it fails, the sentence "2 of 6 steps done" stands alone. | AB-14b |
| H-O5 | What "Continue" shows | Last opened, remembered in the browser only (no field, no rules change); on a new device the last changed project. | 24.11.2026 (AB-14c data in M2) |
| H-O6 | The source for "In short" on the home page | Written server-side (Admin SDK) onto the project when the run is created; no client field, so no rules change; without it the card has no "In short". | 24.11.2026 (AB-14c data in M2) |
| H-O7 | The map miniature | Only on the one Continue card, computed from the stored process skeleton; no miniature per row. | 24.11.2026 (AB-14c data in M2) |
| H-O8 | Rename | A server route instead of a `firestore.rules` change (rules are deployed by hand). | AB-14b, else later |

##### AB-14a — M1 · The first view for a new account (mockup v2.1) · S–M

- **Mockup:** v2.1 of the same file, accepted by the owner on 06.11.2026 ("build it exactly like this"); state 1 at
  the six viewports, 0 overlaps, 0 clipping.
- **Scope:** mockup state 1, v2.1:
  - "Welcome, …", the heading, and two plain sentences on what the product does (reads the ABAP, shows it as a
    business process, what it touches in SAP and how far it is from clean core; on request it helps re-design it).
  - A quiet path strip with the seven tools in one line: Analyze alone and outlined under "A complete result on its
    own", tools 2–7 dashed under "Optional, if you want to re-design it"; at 768 px and below Analyze above a 3 × 2
    grid, on a phone two columns below the start.
  - One start area with two ways side by side. **(a) "Try an example"** ("Free the first time", the rule of
    `starterExampleIsFree` in `lib/run-quota-rule.ts`): `Z_MM_PO_APPROVAL` recommended, with the page's only green
    button "Start this example" (H-O15); the other six shipped examples from `lib/starter-examples.ts` as a compact
    list with name, lines and one line of purpose, folded behind "6 more examples" on a phone. **(b) "Analyse your
    own program"** ("5 free analysis runs", worded as `QUOTA_NAME` and `quotaSpentSentence`): drop area, "Choose a
    file" (secondary), "Paste the code", the cost-and-model sentence, and a smaller live slice of the demo map (4
    elements) as "What you get" (H-O1).
  - The demo line fills the former gap bottom-left (on a phone it stands below the strip).
  - Removed against v2: "What the analysis alone gives you" (the strip says it) and the duration sentence, which
    stays out until H-O2 is measured.
  - The start built in (H-O11); "New analysis" opens the start, not First insights; every way into a project lands in
    Analyze (with AB-2).
- **Files:** `components/workspace/WorkspaceListReport.tsx` (a branch for an account without projects),
  `components/workspace/HomeFirstView.tsx` (new), `components/workspace/ToolPathStrip.tsx` (new; the tool names and
  order from `lib/workflow-steps.ts`, never written twice), `components/process-map/` (a cut-off read-only render of
  the demo map, no new renderer), `components/StarterExamples.tsx` (the compact list and the recommended example; the
  gallery stays at the start of an analysis), `lib/starter-examples.ts` (read only), `components/MyWorkspaceSwitch.tsx`,
  `lib/messages/workspace.ts`, `app/(app)/first-run/page.tsx` (steps 2 and 3 describe the old gallery).
- **Specs:** add `home-first-view.spec.ts` (rendered: a fresh account sees exactly one filled button, "Start this
  example"; all seven shipped examples, their line counts equal the files'; the map slice's labels and line numbers
  equal the demo map's first elements, no hand-written name; the strip's order equals `lib/workflow-steps.ts`; no
  duration claim; source half: the slice imports the Analyze renderer); change `workspace-list-report`,
  `starter-examples`, `starter-examples-view`, `starter-example-quota`, `example-catalog`, `example-opens-workspace`,
  `example-start-no-page-error`, `workspace-start`, `workspace-start-model`, `start-release-choice`,
  `target-edition-choice`, `registration-flow-guard`, `claims-honesty-guard` (first-run against the header),
  `machine-strings-guard`, `mobile-responsive`, `capture-screens` (state only, landing pictures in AB-12).
- **Done when:** [look] for state 1 at the six viewports against `screens/*-01-new-account.png` of v2.1, including the
  phone with both ways in the first screen; overlap guard 0; no empty area bottom-left at 1440 × 900; a new account
  reaches a signed run from either way with no detour.
- **Size, re-checked for v2.1:** stays S–M. The strip and the example list are new presentation over existing sources
  (`workflow-steps`, `starter-examples`, the quota sentences); no new data, no route, no rules change. It grows by one
  small component and one more rendered assertion block, not by a part.
- **Risk:** low to medium; additive for accounts without projects; 57 spec files name `/dashboard` (grep, 06.11.2026),
  most only land there. The example list moves the start of six examples onto the home page: the quota spec must show
  that only the first start of each is free.

##### AB-14b — M2 · The list for returning accounts · M–L

- **Prerequisite first (H-O9):** a lean row source so every project is listed, not the newest 25
  (`WorkspaceListReport.tsx:211`, `limit(25)`); search, filters and sort over all; no source code in the rows.
- **Scope:** mockup states 2–9 and 11–12: "Needs your attention" only when there is a reason (code changed, design no
  longer fits, a failed test run), at most three; tabs My projects / Shared with me / Invitations sent (the Sharing card
  goes into them); four columns (Project, Status, Next step, Last change) with the new status words (H-O3) and the date
  form (H-O10); "Figures" switch remembered in the browser; filters from ten projects; the row menu without "Open
  project" and without a First-insights link; the demo and the examples as two doors below the list; a run from a row
  only through the confirmation dialog with cost and model (today's sentence, H-O12); the free runs as five small marks
  in the shell; the one-line footer on `/dashboard` (`isAppPage`). Rename (state 10) only if H-O8 is decided by
  24.11.2026, otherwise later.
- **Files:** `components/workspace/WorkspaceListReport.tsx`, `components/workspace/YourTurnCard.tsx` and
  `lib/your-turn.ts` (become the attention card; `point.action`, not `point.label`), `components/workspace/WorkspaceRowActions.tsx`,
  `lib/workspace-rows.ts` (identifier is the program name only; filter value "Needs attention"), `lib/project-progress.ts`
  (sentences, `PROJECT_STAGE_LABEL`, the re-design count; never `project.status`), `components/demo/DemoEntryCard.tsx`,
  `lib/demo-list-row.ts`, `app/(app)/layout.tsx` (quota marks, footer), `lib/messages/workspace.ts`, `DESIGN.md` §2.1,
  §2.2, §2.11 and §3 (H-O10), `docs/design/decisions.md` (a new ADR).
- **Specs:** add `home-list.spec.ts` (rendered on a seeded account with 30 projects: all 30 reachable, filters over all,
  the attention card only with a reason) and a server-free spec for the row source; change `workspace-list-report`,
  `my-workspace-rows`, `dashboard-demo-row`, `preservation-workspace`, `preservation-register` (nothing is lost, ADR-052),
  `portfolio-3021`, `invitation-rendered`, `next-step`, `next-step-provenance`, `phase-honesty-guard`,
  `workflow-phases-guard` (the phase contract is unchanged — assert it), `landing-consistency-guard` (footer branches),
  `write-ceiling-guard` (call sites), `back-link-wording`, `way-in-and-back`, `way-in-and-back-rendered`,
  `ux-register-3018`, `demo-project`, `mobile-responsive`.
- **Done when:** [look] for states 2–9, 11, 12 at the six viewports; overlap guard 0; an account with more than 25
  projects finds each by search; nothing the old page offered is gone (preservation register).
- **Risk:** medium to high; the row source is a data change, and the status words reach every text guard.

##### AB-14c — M2 (data) and M3 (card) · "Continue where you left off" · S–M

*Re-planned 06.11.2026: v3.5.0 carries the complete home page, so this part may not move past Christmas. Its data
moves forward into M2; M3 only wires the card.*

- **Scope:** the Continue card of state 2: the last project (H-O5), its status and next step, "In short" from a
  server-written sentence (H-O6), the map miniature computed from the stored skeleton (H-O7), "Open the process map"
  (secondary, H-O13).
- **In M2 (with AB-14b, no visible change):** the "In short" sentence written via Admin SDK when a run is created
  (never part of the signed payload); `lib/process-miniature.ts` (pure); the "last opened" key in the browser. Projects
  created before 3.5.0 have no stored sentence: the card computes it once server-side on the owner's first visit, or
  shows no "In short" — decided with H-O6.
- **In M3:** `components/workspace/ContinueCard.tsx` (new) on that data.
- **Files:** `app/api/runs/create/route.ts`, `lib/process-miniature.ts` (new, pure), `components/workspace/ContinueCard.tsx`
  (new), `components/workspace/WorkspaceListReport.tsx`.
- **Specs:** add `home-continue.spec.ts` (server-free: the miniature has the skeleton's element count; rendered: the
  card names the last opened project); assert `run-integrity-guard` and `audit-pack-signed-input` unchanged (M2).
- **Needs before 24.11.2026:** H-O5, H-O6 and H-O7 decided.
- **Done when:** [look] for state 2 and 7 at the six viewports; the card's figures equal the project's.
- **Risk:** low to medium once the data is in M2; if H-O6 is not decided by 24.11, the card ships in 3.5.0 without
  "In short" rather than late.

#### AB-13 — later · Download with the tour texts (O11) · S

---

## 5. Migration

| Who / what | What happens | How it is held |
|---|---|---|
| **Existing projects** | Open in Analyze, Business, from AB-2. Their map is drawn from their signed run by the engine version that signed it (gates `ENGINE_READS_3021_FROM`, and the branch's gate set to `'3.5.0'`): an older project keeps its labels. A naming stored before 3.5.0 is not applied; one facts naming is asked on the first owner visit (P2). A project without a run shows the start (ADR-072) in the map's place, as `WorkspaceProcess` does today. | `analyze-business-first`, `legacy-projects`, `legacy-projects-page` |
| **Return visits** | No arrival animation: names are stored, the page opens in the done state (state 17) — endings, the card or its link, the map. `cc.workspace.firstLook.seen` keeps meaning "no arrival"; new keys `cc.analyze.walked.<id>`, `cc.analyze.nextHidden.<id>`. Clearing the browser shows the invitation again — nothing else changes. | `workspace-reopen` (rewritten), `analyze-endings` |
| **Invited readers** | Read only: the map, the tour, the text, IT and Management; no "Edit", no model call, the endings per P8. Access stays as the Firestore rules decide (`loadProjectAndHydrate`). No rules change expected (assumption: AB-1 to AB-11 write no new client field). | `analyze-reader.spec.ts` (new, AB-2); `project-readers`, `project-access-matrix`, `firestore-rules-readers`, `invitation-rendered` unchanged and green |
| **The demo** | Moves in every package on the same components (O10); `/demo/workspace` redirects to the demo's Analyze in AB-11 at the latest. | `demo-shared-boundary`, `demo-project`, `demo-tour` |
| **Capture screens, UX agent** | Until AB-12 the landing pictures stay as they are (they come from `/demo/workspace`). The UX agent reads the new mockup from AB-0. Each package's screenshots go to Sonny before `main`. | `capture-screens`, `ux-review-guard` |
| **Signed artefacts** | Unchanged: no view, no chart, no kind, no browser flag enters a run, a signature or the audit pack. | `view-attribute-guard`, `run-integrity-guard` |

---

## 6. Test strategy

- **Server-free first.** Every new pure module (`lib/process-fact-charts.ts`, `lib/abap/rule-kind.ts`,
  `lib/analyze-progress.ts`, the naming checker, the copy guard, the AI-mark rule) gets a spec that runs under
  `playwright.serverfree.config.ts`. Parallel agents run only these (they share :3000 and the emulators).
- **Rendered specs on a seeded project.** `tests/helpers/seed-project.ts` seeds the PO example with a signed run;
  the naming route is stubbed (`gemini-test-stub-guard` holds that no real model is called). No spec samples a window
  that exists only during a request: assert the end state, and run the 45 s ceiling with a short test ceiling.
- **The prod build CI uses.** Before a release push: build with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` set for the
  build, `npm start`, emulators with `--project=cleancore-491216`, then the rendered specs that open a changed page
  (`scripts/test/affected-rendered.mjs`), then the full suite once, quietly. Push only on the runner's exit code 0.
- **Shards.** CI runs six parallel shards (`.github/workflows/deploy.yml`) from `tests/shard-plan.json`, re-measured by
  `scripts/test/shard-plan.mjs`. The layout guard is split per viewport group so no shard gets all 6 × 19 states;
  the plan is regenerated in every package that adds a rendered spec (AB-1 already has to: its one merge conflict).
- **Screenshots are part of done.** Guards prove conformity, not fidelity: the builder opens the screenshots of every
  touched state next to the mockup's before reporting the package done.
- **After every push to `dev`:** the QA review loop and `gh run watch`; `main` only after a clean round and Sonny's go.

---

## 7. Risks and what to leave out

| Risk | Where | Answer |
|---|---|---|
| The naming swap is smaller than in the mockup (65.9 % named, half of them the engine label again) | AB-1, AB-3 | The status line says how many kept their technical name; engine labels improve with 3.5.0. Do not lower the checker to get more swaps. |
| Model cost and latency on the platform key: naming, purpose and plain wording per new project | AB-1, AB-3, AB-6 | One call per stage per project; own key only with the 3.0.21 switch; the 45 s ceiling ends the wait, not the call (assumption: the call is cancelled or its late answer ignored — decide in AB-3). |
| Two homes for IT and Management between AB-2 and AB-10 | AB-2 | Only on the private preview, M1 to M3 (about four weeks); users never see it; no new feature on the workspace IT/Management in that time. |
| Spec churn: 48 specs read the first-look hooks or `?first=1`, 54 read `view=it\|management` | AB-2, AB-11 | Change addresses first, rewrite behaviour second; no guard removed without a replacement shown red on a broken copy (the principle of the quality row, item 4 — moved from 3.0.22 to 3.5.1, applied here already). |
| The dates (23.11, 07.12, 16.12.2026) slip | every release | Cut lines agreed beforehand: AB-8 and AB-13 are already out; the N7 engine label goes next; AB-11 may ship as the redirect alone with the dead workspace code removed in the following release. A release slips rather than ship a broken intermediate state; the 22.12 communication waits for 3.5.0, the Claude key switch does not. |
| Legibility at overview zoom (ADR-025; `MIN_SCALE = 0.8`, `components/process-map/bpmn-view.ts:48`) | AB-2, AB-4 | Scroll instead of shrinking (N2); tour floor 83 %. |
| Overlap regressions on narrow widths | every package | `analyze-layout-guard` fails the build for the touched states. |
| The Analyze page (2,261 lines) | AB-2, AB-9 | Split per view into components first; behaviour second. |
| Deep links break | AB-2, AB-11 | One redirect function, tested against every address the code writes. |
| Public landing pictures drift from the product | AB-2–AB-12 | Re-shoot only in AB-12, with Sonny's look. |

**Leave out:** a paced map build-up with a code column (retired); coach marks in Analyze; any per-view field on a
project, run or pack; a server field for "walked" or "hidden"; a recommendation worded as a decision; effort figures
Economics did not compute; a fourth chart; "Process at a glance", "Who is involved" and "Standard vs. custom" as charts
(rejected in the mockup); editing by touch; a duration estimate for the arrival; any change to 3.0.21.
