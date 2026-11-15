# Engine review, November 2026 — technology, structure, quality, and the next level

As of 13.11.2026, written in the engine night on `night/engine-320` (worktree of `integrate/3.2.0` at `7c522bf4`).
Owner brief: *"technologisch, Aufbau, Güte, Qualität — alles challengen"*; *"wir müssen auch objektorientiert
besser werden"*; *"die Engine muss auf ein neues Level gehoben werden"*; *"unsere Engine ist unsere
Kernkompetenz"*; *"es muss nachhaltig sein"*; *"belastbare Architektur, performant, wartbar, erweiterbar"*; the
yardstick for everything: *"alte Z-Transaktionen bestmöglich zu verstehen, für Business, IT und Management"*.

Every number here was measured tonight on this worktree; every file reference is `path:line` of that commit range.
Hypotheses are marked as such. What was **fixed tonight** (gated, measured, committed) and what is only
**recommended** are kept apart in every section and summarised in §1.

## 0. Executive summary — blunt

1. **The engine is right far more often than its technology suggests, and wrong in ways the benchmark does not
   see.** 95 self-written construct probes: 59 understood, 26 partly, 5 not, 5 wrong. 300 real open-source ABAP
   files: no crash, no hang, 18 files (6 %) with a false "unterminated block". 13 of 134 metamorphic
   transformations changed the map — 12 of them from one cause, a case-sensitive `MESSAGE` regex (fixed tonight).
2. **The biggest measurable gap was object-oriented dispatch, and it was a drawing rule, not a parsing problem.**
   The implementations behind a strategy, state or template-method call vanished from the map. Drawing them as
   candidate beginnings — honest, D2 kept — moved wave 3 of the benchmark from 77.3 % to 84.4 % on the learning
   half and from **72.3 % to 80.6 % on the holdout** (OO cases 69.9 % → 80.1 %), measured once, gated behind
   engine 3.2.0, waves 1+2 untouched. 150 changed lines in `process-skeleton.ts` and `method-resolution.ts`.
3. **A parser would not have bought those points.** On the 50 OO learn cases a real parser plus symbol table
   (`@abaplint/core` as measuring stick, own dispatch code on top) resolves **0 method calls our engine does not
   resolve** when the case is read as one joined source; it found 6 over-resolutions of ours (fixed tonight as
   `dynamicDispatch`) and names candidate lists for 15 polymorphic calls (now ours too). The remaining wave-3
   misses are ~80 % expected-answer conventions that contradict `DESIGN.md` §5.8 (the audit of the same day
   lists them) and ~20 % model gaps (exception routing, `ON COMMIT`, `CLASS_CONSTRUCTOR`, screen flow).
4. **The technology is nevertheless the wrong foundation for the next level — for robustness, maintainability and
   speed, not for benchmark points.** One `buildAbapEvidence` tokenises the source 11 times and runs 25 full-text
   passes; above 5,000 lines the engine is super-linear (exponents 1.5–2.6; a 25,000-line program takes 45 s for
   the evidence and 55 s for the business statements, a size the product accepts); 2,347 regex literals recognise
   the same ABAP concept in up to 16 files and disagree (three statement splitters, two SELECT readers, two
   glossaries); three tokeniser defects on real code (`LOCAL FRIENDS`, `INTERFACE … LOAD`, a string template
   broken across lines) are exactly the class of error a lexer removes.
5. **Structure:** 101 files, 46,690 lines; `process-skeleton.ts` is 5,491 lines with one class of 4,312;
   `buildAbapEvidence` is one function of 1,482 lines; 38 % of the engine is business language. No import
   cycles, 1 `any`, 0 lint suppressions, English throughout — the hygiene is good, the shape is not.
6. **Versioning:** 10 gate files in 25 days, 74 predicate call sites in 28 files, 19 of them outside the engine;
   the gates hold (0 of 614 outputs moved across three release-end engines), but a version string does not
   identify the code (330 of 614 evidence outputs differ within one version stamp) and only two releases have a
   frozen oracle. Tonight added the eleventh gate because the rule said so; the recommendation is to make it
   the last of its kind.
7. **OO today:** resolves `=>`, `->` on typed references, `me->`, bare calls, `super->`, `NEW cls( )->m( )`,
   chained calls, `CAST`, aliases, interfaces, constructors, `SET HANDLER`/`RAISE EVENT`, RAP handlers, DPC_EXT
   redefinitions, BAdI implementation classes; since tonight also runtime dispatch with candidate lists. Does
   not: evaluation order of nested calls, re-raise through nested `TRY`, `RAISE RESUMABLE`/`RETRY`,
   `CLASS_CONSTRUCTOR`, calls inside a `WHILE` condition, a report and a global class uploaded as two plain files.
8. **Legacy Z transactions:** reports, events, FORMs, function groups, BDC, ALV callbacks, LUW, locks, files and
   includes are understood; `CALL CUSTOMER-FUNCTION` and `CALL BADI` drew nothing (fixed tonight); `PERFORM …
   ON COMMIT` is drawn in the wrong place, `LEAVE PROGRAM` is always an error end, a `CALL SCREEN` is not linked
   to its modules, a user-exit include without a header draws nothing. The benchmark under-represents exactly
   these programs (no case ≥ 1,000 lines, 18 of 300 with dynpro modules, 13 with user exits).
9. **Scorecard (1–5):** robust 3, performant 2, maintainable 2, extensible 2. The target architecture in §8 is
   scored 4/4/4/4 — reachable in about five to six months of one developer, in four phases, every phase proven
   neutral by frozen digests before it ships, old engine versions frozen and readable throughout.
10. **Recommendation in one line:** keep the engine, replace its foundation layer by layer — lexer and statement
    classifier first (robustness, parse once), symbol table and dispatch second, then split the 4,312-line
    builder into typed passes — and move the measurement to honest denominators, because the metric that steered
    the last fifty engine commits could not see one of them.

## 1. What was fixed tonight and what is recommended

**Fixed, gated behind `ENGINE_READS_320_FROM = '3.2.0'` (`lib/abap/engine-reads-320-gate.ts`), guarded by
`tests/engine-reads-320.spec.ts`, measured on the benchmark (`docs/prozess-benchmark/BERICHT.md` §8):**

| Commit | Reading | Learn Δ (nodes) | Holdout Δ (measured once) |
|---|---|---|---|
| `079443e3` | A call the source cannot resolve statically draws every implementation it can reach; `me->m( )` dispatches when a subclass redefines `m`; a candidate starts with the handlers registered at its call | wave 3 +155 | wave 3 +185 (with the two below), OO +10.2 pp |
| `1a77ab95` | A screen module and a callback start with the handlers registered where the program handed over to them; `MESSAGE`/`TYPE` in any case | wave 3 +2 | — |
| `bdbfff40` | `CALL BADI` and `CALL CUSTOMER-FUNCTION` are service tasks into an enhancement outside this source | wave 2 +1 | wave 2 +2 |

Nothing else in the engine changed. The reference corpus, the golden masters, the demo record and the 3.1.0
readings spec are unchanged and green, because `APP_VERSION` is still v3.0.23 and every new reading is gated.

**Recommended, not done** (the rest of this document): a parse-once foundation, one recogniser per concept, the
versioning model, the performance fixes, the split of the god units, the OO and legacy model gaps, the metric and
benchmark changes. Nothing in the next-level section was prototyped into the product; the only prototype was a
throwaway comparison harness in a scratch folder, and no external code entered the repository.

## 2. Where the engine stands, measured

### 2.1 The benchmark (process skeleton, node hits over comparable expected nodes)

| Group | Engine 3.1.0 | **Engine 3.2.0 (tonight)** | What moved |
|---|---|---|---|
| Learn, waves 1+2 (100 cases) | 87.2 % | 87.2 % | one node (`CALL BADI`) |
| Learn, wave 3 (50) | 77.3 % | **84.4 %** ±1.5 | +157 nodes, 11 cases, all gained |
| Learn, OO (34) / procedural (116) | 74.4 % / 86.9 % | **84.1 %** / 86.9 % | OO +9.6 pp |
| Holdout, waves 1+2 (100) | 85.5 % | 85.6 % | two nodes |
| Holdout, wave 3 (50) — measured once | 72.3 % | **80.6 %** ±1.6 | +185 nodes, 15 cases, all gained |
| Holdout, OO (36) / procedural (114) | 69.9 % / 85.3 % | **80.1 %** / 85.3 % | OO +10.2 pp |
| All 300 | 81.9 % | **84.9 %** | |

Honest denominators (the benchmark audit of 13.11.2026, point 1): over **all** expected nodes, holdout 70.7 % →
73.4 %; over all expected business steps, 61.2 % → 63.1 %; edges 65.4 % → 67.5 %. Precision held: engine nodes on
statements no expected node claims, 277 → 281 on the holdout.

### 2.2 What the benchmark cannot see — and tonight's work shows it

Fifty engine commits since 04.10.2026 changed none of 11,638 comparable node outcomes (audit, §1). Tonight's
candidate reading changed 342 of them, because it adds *nodes*; the candidate list on the opaque call
(`detail.candidates`), the explanatory note, the lower-case reading and the `detail.enhancement` field are invisible
to the metric. So are labels, gateway questions, branch polarity and 26 % of the business steps (never
comparable). The metric steers towards *more nodes on the right lines* and nothing else. §11 proposes the fix.

### 2.3 Construct coverage, probed with 95 self-written snippets (engine 3.1.0)

| Group | understood | partly | not | wrong |
|---|---|---|---|---|
| Legacy report / dialog / FM / BDC / LUW / lists / lexical (52) | 33 | 16 | 2 | 1 |
| ABAP Objects proper (36) | 24 | 5 | 3 | 4 |
| RAP, EML, AMDP, Gateway, BOPF, Web Dynpro (7) | 2 | 5 | 0 | 0 |

The five **wrong** verdicts: `PERFORM … ON COMMIT`/`ON ROLLBACK` drawn as immediate writes before the `UPDATE`
(no handling anywhere in `process-skeleton.ts`, `call-graph.ts`, `luw-states.ts`); a re-raise inside a `CATCH`
ends the process instead of reaching the outer `CATCH`; `RAISE RESUMABLE` is an error end and the code after it
"unreachable" (`process-skeleton.ts`, `raisesException`); `RETRY` is ignored; `lo->m2( lo->m1( ) )` is drawn
m2 → m1 (textual, not evaluation order). The five **not understood**: `CALL CUSTOMER-FUNCTION` (fixed tonight),
`GET BADI`/`CALL BADI` (fixed tonight), a user-exit include with no header (0 nodes, note `no-entry-point`,
although the findings list its read), `CLASS_CONSTRUCTOR` (never drawn), a report plus a global class as two
plain files (the class is dropped as "other program" by `include-resolution.ts`; the same text as one file
resolves fully). Recurring silent drop in six probes: the findings name a read, write, RFC or BAdI that the map
neither draws nor mentions. Since tonight, polymorphic implementations are drawn and noted.

### 2.4 Robustness on real code (300 files from abapGit, abap2xlsx, SAP/code-pal-for-abap; MIT / Apache-2.0)

No crash, no 30-second timeout, no step over 5 s (the 6,552-line `zcl_excel_writer_2007` takes 4.6 s in
`buildAbapEvidence` alone; `@abaplint/core` parses it in 154 ms). **18 files (6 %) get a false "unterminated
block":** `CLASS … DEFINITION LOCAL FRIENDS` read as a block opener (14), `INTERFACE … LOAD` read as one (1), a
string template whose embedded expression breaks across lines loses the literal state (3). All three sit in the
lowest layer (`block-structure.ts:125–126`, `statement-reader.ts:164–175`); the third is a tokeniser defect by
construction. Selection bias stated: all three repositories are linted with abaplint in CI, so they are cleaner
than customer Z code.

### 2.5 Brittleness (metamorphic probe, 12 snippets × 12 transformations)

Robust to renaming, re-indentation, joining and splitting lines, chaining, both call syntaxes, pseudo-comments
and trailing comments, keyword-laden comments and literals. **13 of 134 cells changed the map**: 12 from
case-sensitive `MESSAGE`/`TYPE` regexes (`process-skeleton.ts`, `isErrorMessage`/`isInfoMessage`; in one snippet
−9 nodes and a lost decision — a routine's only effect disappears, it becomes a technical helper, its caller
collapses) — **fixed tonight for 3.2.0**; 1 from a `DATA` declaration between `CALL METHOD … EXCEPTIONS` and `IF
sy-subrc` turning a boundary into a plain gateway (open); plus one anchor drift (an entry's normal end anchored on
an inserted declaration).

## 3. Technology: is the regex/statement-reader approach the right foundation?

**Verdict: it was the right way to get here and it is the wrong way to go on.** The evidence:

| Finding | Evidence | Impact |
|---|---|---|
| The source is tokenised 11 times per `buildAbapEvidence`, plus 5 `tokenize()` and 9 other full-text splits — 25 passes | instrumented `String.prototype.split` on the 1,000-line starter: `evidence-model.ts:520,1947`, `business-rules.ts:522` (3×, via `table-dependencies`), `batch-input`, `authority-assessment`, `guideline-checks`, `constant-gates`, `call-graph`, `key-user-candidates` | the evidence costs 5–7× the skeleton on the same input; `process-facts.ts:13` itself warns against reading the source twice |
| `maskLiterals` is recomputed on the same statement texts at 80 call sites in 18 files | CPU profile: 40 % of evidence time, 69 % of skeleton time at 25,000 lines | quadratic behaviour above 5k lines |
| Three statement splitters that disagree | `readStatements`, `declaration-parser.tokenize`, `plain-language.ts:152 splitStatements` (own comment rule at :157); on BM-245 the third cuts native SQL into 16 statements that do not exist, on BM-258 it misses two `ENDMETHOD`s | the business language can describe statements the skeleton never saw |
| The same ABAP concept recognised in many places, differently | 2,347 regex literals + 120 `new RegExp` in functions; `CALL FUNCTION` 54 regexes (32 distinct) in 16 files; method call `->`/`=>` 97 (71 distinct) in 23 files; `FORM` 44/32/16; `SELECT` 36/28/18; `MESSAGE` 36/28/16; `PERFORM` 29/17/15. `call-graph.ts` accepts `''` escapes, backtick literals and `/NS/` names; `business-statement.ts` (6×) uses `('[^']*'\|[A-Za-z0-9_]+)` — the two can name different callees for one statement | a new construct is taught up to 16 times; the modules drift apart silently |
| Two readers of "which table does this SELECT read" | `table-dependencies` (evidence) and `process-skeleton.ts:776 selectTables` (map, no dynamic targets): `SELECT * FROM (lc_tab)` with `lc_tab = 'KNA1'` gives a KNA1 read in the findings and start → end with no step on the map | the two surfaces contradict each other on one program |
| Macros: expanded by two modules, denied by a third | `table-dependencies` and `process-skeleton.ts:1630` expand them; `coverage.ts:211/220` tells the user "not expanded … never at the lines that use the macro" while the same report carries `standard-table-read@6 KNA1` at the call site | a user-facing sentence that the engine's own finding contradicts |
| Two business glossaries | `business-glossary` (186 entries) and `plain-glossary` (244) share 174 keys, 18 worded differently (`vbak`: "order" vs "Sales order") | the same table has two names in one product |
| Lexical defects a lexer would not have | §2.4: `LOCAL FRIENDS`, `INTERFACE … LOAD`, multi-line string template | 6 % of real files mis-structured |
| Where the regex approach is strong | 59 of 95 constructs fully understood; 300 real files without a crash; the metamorphic probe found exactly one brittle regex | the recognisers are good; their *organisation* is the problem |

**What a real parser buys and what it does not — measured, not assumed.** `@abaplint/core` 2.120.105 (MIT; see
§12) was installed in a scratch folder and run as a *measuring stick* over the 50 OO learn cases, with own
class-hierarchy dispatch (CHA) and an instantiated-classes filter (RTA) written on top of its scope tree
(abaplint resolves to the method *definition* on the static type and has no notion of which body runs):

- **Method calls:** 115 calls the parser side pins to exactly one body in the case — our engine, reading the case
  as one joined source, pins **all 115 to the same body**; 0 conflicts, 0 that only the parser finds. 6 calls our
  engine wrongly named one body for (template method: `me->`/bare call in a base class whose subclasses redefine
  the method; BM-207, BM-213 ×2, BM-214 ×2, BM-274) — a defect in `method-resolution.ts`, which checked
  redefinitions only for reference variables. **Fixed tonight (`dynamicDispatch`), without a parser.** 15 calls
  stay undecided in both readings (8 interface dispatch, 7 abstract/redefined); the RTA filter narrowed none of
  them, because every candidate class is instantiated somewhere (factories with `CASE`). The parser side adds the
  candidate list — **ours does too since tonight.**
- **Expected call nodes at method-call statements (120 comparable in W3 learn):** per file (how the benchmark read
  until the joined mode) 39 hit; joined, 94 hit. Of the remaining 26 misses, 17 are calls our engine already
  resolves to the body the parser finds — the node is missing because of the *drawing* (reachability, region
  expansion, kind choice), not the reading. **Parser-attributable resolutions our joined engine lacks: 0.**
  Tonight's candidate reading is what closed most of these.
- **Robustness:** on the 300 real files abaplint had 0 Unknown statements and 0 unstructured files (its home
  turf — all three repositories carry `abaplint.json`); on *our* inputs it left 3 of the W3 learn files without
  any structure (fragments: a Gateway method body without a class frame, two Web Dynpro method fragments), did not
  analyse includes with no main program in the upload or function modules without function-group metadata (17
  calls we resolve), and stopped on every class whose superclass is not in the upload (`*_DPC_EXT`, `/bobf/`,
  `cl_wd_component_assistance`; 17 more calls). It flagged 2 invalid statements in BM-240 (`PERFORM … USING CONV
  string( … )`) that our engine reads without complaint — a corpus defect a strict parser catches.
- **Speed:** a full abaplint parse plus syntax run costs about as much as our `buildProcessFacts` plus half a
  skeleton (BM-200: 51.7 ms vs 19.0 + 63.5 ms). Speed decides nothing at product sizes; at 6,552 lines it is
  154 ms against our 4.6 s — the difference is our re-tokenising, not grammar vs regex.

**Conclusion for the technology question.** The next benchmark points are not in the parser; they are in the model
layer (what is drawn, where, with what kind) and in the expected answers' conventions. The parser — an **own**
lexer and statement classifier, then an own symbol table — is the foundation for *robustness* (three defect
classes gone by construction, Unknown isolated to one statement), *one place per concept* (an end to the
2,347-regex pile and the three readers), and *performance* (parse once). That is the case for building it, and it
is a strong one; it is not a case for expecting the benchmark to jump when it lands.

## 4. Structure

### 4.1 Module map

101 files, 46,690 lines, by layer: L1 read/tokenise 2,410 · L2 statements/facts 4,066 · L3 blocks/control flow
2,563 · L4 calls/classes 2,322 · L5 process skeleton 5,491 · L6 business language 17,646 (38 %) · L7
routing/assessment 7,864 · catalog 1,816 · usage/ATC import 2,243 · gates 370.

| God unit | Where | Size | Churn |
|---|---|---|---|
| `SkeletonBuilder` (one class) | `process-skeleton.ts` | 4,312 lines, 147 functions in the file | 66 commits in 60 days |
| `buildAbapEvidence` (one function; detectors are closures inside it) | `evidence-model.ts:502` | 1,482 lines | 62 commits in 60 days |
| `routeExtensibility` | `extensibility-router.ts:604` | 707 lines, nesting depth 14 | |
| `sentenceFor` | `business-statement.ts:2216` | 619 lines | |

16 functions over 150 lines; `lib/abap` had 386 commits in 60 days. **Import cycles: none** (Tarjan over all
edges, over value edges, and across `lib/`). **Layer violations: 22 upward imports**, among them
`table-dependencies` (L2) → `business-rules.readConstantDeclarations` (L6, re-tokenises the source, runs 3× per
evidence), `data-scope` (L2) → `business-statement` (L6), `branch-messages` (L3) → `plain-language` (L6),
`process-skeleton` (L5) → `element-comparability` (L6), `narrative-anchors` (L6) → `evidence-model` (L7).
Nothing enforces the layering. **Done right and worth copying:** `method-resolution.ts` — one place, imported by
exactly the two modules its header names (and tonight extended in that one place).

### 4.2 The version-gate pile

How a reading is versioned today: each release that changes output gets a gate file with `X_FROM` and
`xApply(v) = engineVersionAtLeast(v, X_FROM)` (`lib/score-rule.ts:42`); the version is threaded positionally or in
option objects to every branch point; `tests/engine-version-callers.spec.ts` keeps a hand-maintained list of 60
function names whose callers must pass it. Counts: 10 gate files (11 with tonight's), created 13.10–13.11.2026,
plus 4 inline `_FROM` constants; 74 predicate calls outside the definitions in 28 files; 19 of those files
outside the engine (`components/analyze/AnalysisAnswer.tsx:106`, `app/(app)/project/[projectId]/analyze/page.tsx:904`,
`hooks/useAroundTheMap.ts:92`, `lib/bpmn/export.ts` ×6, `lib/program-summary-facts.ts` ×7); `engineVersion`
appears 578 times in 113 files; 26 parameters default to `APP_VERSION`; the idiom `engineVersion === undefined ?
APP_VERSION : engineVersion` 24× in 11 files. Six exported functions with a defaulted version are missing from the
guard's list, 19 option interfaces with `engineVersion?:` are not checked by it at all, and the guard itself is
red on `integrate/3.2.0` tonight for `lib/around-the-map.ts:358–375`, `lib/first-look-findings.ts:391` and
`components/workspace/RuleBasketLine.tsx:94` (destructured parameters it cannot trace) — before any change of
this night.

**Do the gates hold?** Yes, across releases: the real engines of the 3.0.18 cycle end, 3.0.21 and 3.0.23 were
extracted from git and compared with today's engine asked for the same version over 300 benchmark cases and 7
starters, both editions — **0 of 614 evidence+route outputs moved, 0 skeletons, rules or business statements**.
But **a version string does not identify the code**: the engine at the 3.0.18 bump commit differs from today's
"v3.0.18" in 330 of 614 evidence outputs (an ungated rewording of `classic-api`'s `cleanCoreImpact` text landed
29 minutes after the bump). Runs record only `APP_VERSION` (`app/api/runs/create/route.ts:645`): a run signed
during a cycle on dev cannot be reproduced. True frozen oracles exist for v3.0.11 and v3.0.12 only. The lowest
layers (`statement-reader`, `block-structure`, `control-flow`, `callback-registrations`) carry no version at
all — which is why the three lexical defects of §2.4 cannot be fixed under the current rule without threading a
version through `buildProcessFacts` and its callers (tonight they were left alone for that reason and are
listed, not fixed).

**Recommended versioning model (not implemented):**

- **A — one readings table, now (M, 4–6 days).** `lib/abap/engine-readings.ts`: a table `{ id, from, what }` of
  every reading, `readingsFor(version): EngineReadings` resolved **once** at the entry point and passed down as a
  required parameter (no `APP_VERSION` default anywhere below the entry). The type system then replaces the
  hand-maintained caller list; UI code receives readings from the server instead of comparing versions; a new
  reading is one row plus one frozen digest, not one file plus 74 call sites. Tonight's `SkeletonReadings` in
  `process-skeleton.ts` (one flag per gate, `sameReadings`) is the smallest step in that direction.
- **C — stamp the code, now (S).** An `engineDigest` (SHA-256 over `lib/abap/**` plus the catalog digests) in
  every run; CI generates `engine-vX-frozen.json` on every release; the rebuild spec checks every such file. A
  digest that matches no release is labelled "unreleased build" instead of being silently re-rendered.
- **B — frozen engine snapshots per major version, from the next major on (L).** The next-level engine (§8) is a
  new major version behind its gate; the old engine stays as a frozen module tree that old runs are routed to —
  reproducible by construction, no back-ports (the honest choice for signed material), catalogs frozen with it.

### 4.3 Performance (median of 5, fresh process per stage; the 1,000-line starter and synthetic concatenations)

| Lines | `readStatements` | `buildProcessFacts` | `buildProcessSkeleton` | `buildBusinessStatements` | `buildAbapEvidence` |
|---|---|---|---|---|---|
| 1,001 | 15 ms | 47 ms | 104 ms | 115 ms | **682 ms** |
| 5,005 | 56 | 221 | 432 | 1,119 | 3,142 |
| 10,010 | 96 | 533 | 1,950 | 4,515 | 6,264 |
| 25,025 (920 kB, under the 1 MB limit) | 246 | 4,282 | **22,684** | **55,199** | **44,801** |
| 50,050 | 687 | 21,714 | 165,268 (stopped) | 293,524 (stopped) | 80,283 |

Log-log exponents ≥ 5k lines: statements 1.08, facts 2.03, skeleton 2.60, business 2.46, evidence 1.51. Peak RSS
≤ 478 MB — CPU-bound, not memory-bound. Real benchmark cases (600–740 lines) take 180–350 ms for the evidence.
Hotspots, by profile: `business-statement.ts internalTables` recomputed per sentence (33 % self time at 25k; a
cached copy exists at `:3244`); the literal scanner closure `statement-reader.ts:164–175` (23 %) and
`maskLiterals :251` (5 %) via 80 call sites; `luw-states.ts fromRegistration` re-filtering every PERFORM per
registration; `callback-registrations.ts namesThisProgram` building 5 `new RegExp` and scanning the whole program
per ALV call (77 % of facts time at 25k); `programNameAt` and `containerAt` linear per lookup. The only scaling
guard covers `tokenize` (`abap-engine-limits-b88c77b.spec.ts:292`); nothing guards the pipeline.

### 4.4 Testability

888 spec files, 227 import `lib/abap` (45 golden/frozen, 21 rendered, 161 unit-style). No importing spec at all:
`callback-registrations.ts` (a hotspot), `decision-table.ts`, `usage-privacy.ts`, `sql-quirk-rules.ts`,
`catalog-slug.ts`, `sap-api-catalog-stamp.ts`, `transformation-prompt.ts`. The core is reachable almost only
through `buildAbapEvidence` (87 specs) and `buildProcessSkeleton` (43): a failure says "the report moved", not
which reader moved. `SkeletonBuilder` (private, stateful methods), `buildAbapEvidence` (closures) and
`sentenceFor` (module-private, its context assembled only inside `buildBusinessStatements`) cannot be tested piece
by piece.

### 4.5 Code quality

Dead: `transformation-prompt.ts` (0 importers), `user-change.ts` (1,062 lines, specs only), `result-diff.ts`
(specs only); 218 of 849 exports imported nowhere (≈170 types, 46 values), 7 unused even in their own file. 1 `any`,
63 non-null assertions, 0 TODO, 0 `eslint-disable`/`ts-ignore`, 0 React/Next imports in the engine, English
identifiers and comments. Comments are 28 % of the code and mostly true; of 30 sampled doc comments 7 are wrong or
stale: `engine-reads-310-gate.ts:4` ("two groups", lists three), `public-cloud-fit.ts:87` ("no imports beyond
…", imports `../sap-naming` at :104), `demo-switches.ts:46`, `coverage.ts:220` (user-facing, contradicted by the
engine's own finding), `declaration-parser.ts:72` ("the rule lives once" — `plain-language.ts:157` has its own),
`evidence-model.ts:858` ("the one reader of SELECT … FROM" — `process-skeleton.ts:776` is a second),
`docs/ARCHITECTURE.md:73` and `CLAUDE.md` ("~24 files"; there are 101). Pattern: "one place" and "Pure: imports X"
claims drift when a neighbour adds a second reader; nothing checks them. Also a doc/code mismatch worth deciding:
`SkeletonNodeKind` documents `SELECT … ENDSELECT` as a `loop`; the code draws an iterating `read`
(`process-skeleton.ts walkLoop`), and the comparator's bridge expects `loop` — 6 learn nodes.

## 5. Quality ("Güte"): right for the wrong reason, brittle, and the gaps by construct

**Right for the wrong reason.** The benchmark flatters two paths: (a) 42 % of its routines carry an explanatory
header comment (1.4 % in real code — audit §2.3) and the engine reads author comments as meaning since 3.1.0
(`author-comments.ts`); (b) its routines are short (median 18 lines, none over 244) with one step each, which is
exactly the shape the subprocess-per-routine reading is built for. The 86 % on the learn half says little about a
400-line `FORM` in a 6,000-line module pool. Second instance: `send_mail( )` as a local method is drawn as a
`send-task` by name heuristic even though its body is in the source — right kind for a Business reader, but the
rule that produced it (`functionTaskKind` by name) would also fire on a method that only logs.

**Brittle:** §2.5. One confirmed cause fixed; one open (`DATA` between a `CALL METHOD … EXCEPTIONS` and its
`sy-subrc` check); one anchor drift.

**Coverage gaps by construct, ranked by what the three readers lose** (B = Business, I = IT, M = Management):

| # | Construct | Today | Loses | Fix class | Effort |
|---|---|---|---|---|---|
| 1 | Polymorphic call targets (strategy/state/template/interface) | **fixed tonight**: candidates drawn and noted | — | drawing rule | done |
| 2 | `PERFORM … ON COMMIT` / `ON ROLLBACK` | drawn as immediate steps, before the write that precedes the commit; rollback form always runs | B: wrong order; I: wrong LUW; M: a posting counted twice | model (LUW layer owns it) | S–M |
| 3 | Exception routing: re-raise in `CATCH`, `RAISE RESUMABLE`/`RESUME`, `RETRY` | re-raise ends the process; resumable = error end + "unreachable"; retry ignored | B: wrong ends, lost retry loop; I: wrong reachability | model (needs a TRY stack in the walk) | M |
| 4 | `CALL SCREEN n` ↔ its PBO/PAI modules | user task "n" with no link to `MODULE … OUTPUT/INPUT`; `SET SCREEN` no node; `LEAVE PROGRAM` always an error end | B: a dialog transaction reads as unrelated fragments; M: scope of a transaction invisible | model (screen numbers are in `MODULE` names only by convention; flow logic is not ABAP) | M |
| 5 | User-exit include without a header (`ZXVVAU01`) | 0 nodes, `no-entry-point`, while findings list its read | B/I: the exit's decisions missing | entry rule (bare statements = implicit entry when no header) | S |
| 6 | `CLASS_CONSTRUCTOR` | never drawn | I: a `SELECT` at first static access invisible | model | S |
| 7 | Evaluation order `m2( m1( ) )`; calls in a `WHILE` condition | textual order; condition calls not extracted | I: wrong sequence | reader (expression tree) — a parser item | M (own expression parser) |
| 8 | Two plain files: report + global class | class dropped as "other program" (`include-resolution.ts`) | all: the whole class | upload/object model | S (hypothesis: whether the product's upload path ever passes plain names was **not** checked) |
| 9 | EML `READ ENTITIES` (no node), `MODIFY ENTITIES` labelled "ENTITIES" | RAP steps unnamed | B/I | recogniser | S |
| 10 | `WAIT UP TO n SECONDS` (no timer), `GET` of an LDB (event with no per-record meaning), `READ DATASET` (no node), `CREATE OBJECT lo TYPE (cls)` (no dynamic note), `RAISE EXCEPTION NEW zcx( )` labelled "EXCEPTION" | partial | I | recogniser | S each |
| 11 | Lexical: `LOCAL FRIENDS`, `INTERFACE … LOAD`, multi-line string template | 6 % of real files mis-structured | all: wrong blocks | lexer | S now (needs a version through `buildProcessFacts`), gone by construction in §8 |

## 6. Object-oriented ABAP — a dedicated look

**What the engine understands today (verified on 36 OO probes and the 50 W3 learn cases):** local and global
classes, `CLASS … DEFINITION DEFERRED/LOAD`, static `=>` and instance `->` calls on references typed by `TYPE
REF TO`, inline `DATA(x) = NEW cls( )`, `x = NEW cls( )`, `CREATE OBJECT x TYPE cls`, `CAST cls( … )`; `me->`,
bare calls inside a class, `super->`, chained `a->get_b( )->do( )`, `NEW cls( )->m( )`, functional calls inside
`IF` and `CASE` and as arguments; `CALL METHOD` old syntax with `EXCEPTIONS` and the `sy-subrc` boundary;
interfaces (`zif~m` implementations, `INTERFACES`, `ALIASES`), inheritance with `REDEFINITION` and `ABSTRACT`/
`FINAL`; instance constructors (drawn where `NEW` runs when they have an effect); events (`EVENTS`, `RAISE
EVENT`, `SET HANDLER … FOR obj` / `FOR ALL INSTANCES`, static handlers, `ACTIVATION` as deregistration); class-based
exceptions as error ends, `TRY/CATCH/CLEANUP` as boundary events; classic `RAISE`/`MESSAGE … RAISING` in function
modules with the caller's `EXCEPTIONS`; RAP handler and saver classes as framework entries (`FOR VALIDATE/
DETERMINE/MODIFY`, `save_modified`), `MODIFY ENTITIES` as a write, DPC_EXT redefinitions as entries, BAdI
implementation classes (`zif_ex~m`) as entries, `cl_exithandler=>get_instance` as an opaque call; test classes
ignored. **Since tonight:** runtime dispatch — an interface reference with several implementations, a superclass
reference with redefining subclasses, and `me->m( )`/bare `m( )` with redefinitions below are ambiguous with a
candidate list, and every candidate no other call reaches is a beginning of its own with the call as trigger;
candidates, screen modules and callbacks inherit the handlers registered where the program handed over to them.

**What it does not understand:** evaluation order inside one statement; calls inside a `WHILE` condition; a
re-raise through nested `TRY`; `RAISE RESUMABLE`/`RESUME`; `RETRY`; `CLASS_CONSTRUCTOR`; attribute chains as
receivers (`me->mo_x->m( )` — the type of `mo_x` is read only when declared `TYPE REF TO` in the same source);
`GET BADI`/`CALL BADI` (fixed tonight); EML `READ ENTITIES`; `COND … THROW`; the BCS mail classes as send
tasks (`lo_send->send( )` is an opaque call while `SO_NEW_DOCUMENT_SEND_API1` is a send task); a global class
uploaded beside a report as two plain files. **Honesty where it cannot decide** is in place: factory/strategy
calls stay opaque, now with the candidate list and a note; which candidate runs is never guessed.

**What a parser-based approach changes for OO in particular** (measured in §3, projected here): resolution of
*which body runs* gains nothing from a grammar — it is a dispatch layer over a class model, and ours has that model
(`superOf`, `impls`, `refTypes`). What a typed AST and symbol table change: (1) **receiver typing through attribute
chains and method return types** (`lo_a->get_b( )->do( )` works today only because `do` is unique by name; with
two classes carrying `do` it becomes ambiguous — a return-type table would decide it); (2) **evaluation order**
from the expression tree (B09); (3) **data flow for RTA** — which `NEW` reaches which variable — the one thing
that could narrow the 15 undecided calls (the coarse RTA narrowed none); (4) **scopes**: a local variable typed
differently in two methods is today "two types → unresolved"; (5) `FINAL` classes and methods to prune
candidates (not read today); (6) exception types through `RAISING` clauses to route a re-raise to the right
`CATCH`. Expected effect on the benchmark: small (a handful of nodes on wave 3); expected effect on real OO
estates with deeper hierarchies and attribute-held strategies: substantial, and unmeasured by this benchmark.

## 7. The yardstick: legacy Z transactions, for Business, IT and Management

Ranked by what each reader loses today, highest first:

| Rank | Gap | Business | IT | Management |
|---|---|---|---|---|
| 1 | Dialog transactions: `CALL SCREEN` ↔ modules, `SET SCREEN`, OK-code flow across screens, `LEAVE PROGRAM` as normal exit | the transaction reads as unrelated module fragments; a user leaving is an "error" | screen sequence missing | scope of the transaction (how many screens, which steps) invisible |
| 2 | Enhancements: `CALL CUSTOMER-FUNCTION`, `CALL BADI` (**fixed tonight**), user-exit includes without header (open), `PERFORM … ON COMMIT` | delegated checks/postings missing or misplaced | wrong LUW picture | risk of changing the standard unseen |
| 3 | Exception control flow (re-raise, retry) | wrong ends | wrong reachability | — |
| 4 | Size and mess: routines of several hundred lines, cryptic names, no comments | the business reading leans on names and comments that real code lacks | — | effort estimates calibrated on clean code |
| 5 | Robustness of the lowest layer on real code (6 % mis-structured files) | wrong blocks → wrong decisions | wrong anchors | — |
| 6 | Polymorphic OO (**fixed tonight**) | strategy/state steps missing | dispatch invisible | — |

**Where the benchmark under-represents this** (noted; another agent audits the benchmark): no case ≥ 1,000
lines, 18 of 300 with dynpro modules, 13 with user exits, 1 with an enhancement, 12 with `SELECT … ENDSELECT`, 4
with a logical database, 42 % commented routines vs 1.4 % in real code, 198 of 300 cases with 7.40+ syntax. Every
fix tonight was guarded by small realistic snippets written for the spec, not by benchmark text, for that reason.

## 8. Engine next level — target architecture

**Premise (owner, 13.11.2026): the engine is our core competence and stays our own.** Every layer below is
designed and written by us. External projects are prior art, a measuring stick on the same inputs, and — as an
owner decision — possibly an offline test oracle in a development harness; never the foundation and never a
product dependency.

### 8.1 Layers and contracts

| Layer | Owns | Contract (input → output) | Tested alone by |
|---|---|---|---|
| **L0 Lexer** | characters → tokens with row/column: identifiers, keywords, literals, string templates with nested expressions, pragmas, pseudo-comments, comments, punctuation; tolerant (an unterminated literal closes at end of line and is flagged) | `lex(source) → Token[]` + diagnostics | golden token streams; fuzz on the 300-file real sample (never a crash, every character accounted for) |
| **L1 Statements** | tokens → statements (chain expansion, `.` boundaries), each classified by a **table of statement kinds** (keyword patterns per ABAP release; `Unknown` isolated to one statement, never breaking neighbours); native SQL and macros as kinds | `statements(tokens) → Statement[]` (kind, tokens, range, chainIndex) | one spec per statement kind; metamorphic (case, chaining, line breaks) |
| **L2 Blocks** | statements → block tree with recovery (an unclosed block closes at its container, flagged; `LOCAL FRIENDS`, `LOAD`, `DEFERRED` are never openers because the kind table says so) | `blocks(statements) → BlockTree` | the 300-file sample: 0 false unterminated blocks |
| **L3 Object model** | files → objects from the **upload layout** (report, include roles TOP/F01/I01/O01, function group parts, global class with local parts, interface, BDEF/CDS as data), the include graph, class/interface declarations (visibility, `FINAL`/`ABSTRACT`, events, aliases, redefinitions, `RAISING`), screens by number from `MODULE` names and `CALL SCREEN` | `objects(files) → ObjectModel` | per layout kind; the W3 multi-file cases |
| **L4 Symbols** | scopes (program, form, method, block), typed references for every name use: data read/write, `TYPE REF TO`, inline declarations, parameters, attributes, return types of methods; unknown SAP types as *void*, never an error | `symbols(objects) → SymbolTable` | typed-reference goldens on written snippets |
| **L5 Calls & dispatch** | call graph over forms, functions, methods, events, callbacks, enhancements; class-hierarchy analysis with `FINAL` pruning; candidate lists; simple data flow of `NEW`/`CREATE OBJECT` into variables (RTA); exception types through `RAISING` | `calls(symbols) → CallGraph` with per-call `{ target \| candidates[] \| external \| dynamic }` | the prototype's 203-call comparison, kept as a spec |
| **L6 Process model** | the skeleton as **typed passes**: entries → regions → walk → folds (guards, boundaries, helpers, collapse) → starts → lanes → LUW; each pass `(model, readings) → model'` with its own spec; the business language and routing read the same model | `skeleton(calls, readings) → ProcessSkeleton` (unchanged shape) | the existing 43 skeleton specs + the benchmark + per-pass specs |
| **Readings** | one table of gated behaviours (`§4.2 A`), resolved once | `readingsFor(version)` | the frozen digests per release |

What each layer buys, by evidence: L0–L2 remove the three lexical defect classes (§2.4), the three statement
splitters and the macro contradiction (§3), and the 25 full-text passes (§4.3: parse once); L3 fixes the two-file
drop (§5 #8) and gives screens and includes a home; L4–L5 give receiver typing through chains, evaluation order,
`FINAL` pruning and a real RTA (§6); L6 is where the benchmark points live (§5 #2–#6) and where tonight's +185
holdout nodes came from.

### 8.2 What it would measurably buy — estimate from tonight's failure analysis

| Group | Today (3.2.0) | Parser/symbol layers L0–L5 alone | + L6 model gaps (#2–#6, #9) | + conventions settled in the expected answers (audit §3) |
|---|---|---|---|---|
| Wave 1+2 learn/holdout | 87.2 / 85.6 % | ≈ +0.5 pp (lexical, dynamic SELECT targets) | ≈ +1–2 pp (`ON COMMIT`, user exits, screens) | ≈ +6–8 pp (`IF sy-subrc`, `MESSAGE` S/W, small routines) |
| Wave 3 learn/holdout | 84.4 / 80.6 % | ≈ +0.5–1 pp (evaluation order, condition calls) | ≈ +2–3 pp (exception routing, `CLASS_CONSTRUCTOR`, EML) | ≈ +8–10 pp (sy-subrc 62 wrong-kind, FORM/METHOD starts 95, `MESSAGE` S 45 on learn) |
| OO | 84.1 / 80.1 % | ≈ +1 pp | ≈ +2–3 pp | ≈ +8 pp |
| Real legacy estates (unmeasured) | — | robustness: 6 % mis-structured files → 0; parse once: 25k lines from 45–55 s to a budget of 8 s | dialog transactions readable as one process | — |

Read the table honestly: the parser layers buy benchmark points in the low single digits; the model layer buys
a few more; the largest remaining number is in the expected answers, not the engine — the audit's §3 recommends
settling six conventions and re-freezing as v2, and this review concurs: measure the design, not a house style.

### 8.3 Migration path that never breaks a signed run

1. Every signed run keeps `engineVersion`; from phase 0 on it also carries `engineDigest` (§4.2 C).
2. The new engine is **engine 4.0.0** behind its gate (`readingsFor` knows it as a major); engines < 4.0.0 are
   served by the **frozen** 3.x module tree (§4.2 B), copied once, never edited, catalogs frozen with it. Old runs
   are reproducible by construction; the hundreds of gate checks in the 3.x tree stay as they are and stop growing.
3. 4.0.0 is built behind the gate while 3.x ships: both run **side by side** in CI on the benchmark (learn
   halves), the reference corpus, the golden masters, the 300-file real sample and the frozen digests; the new
   engine becomes the default only when it is ≥ the old on every wave and every golden, and its holdout is
   measured once at that point.
4. Phases 0–3 (§8.5) each ship as a 3.x minor behind a gate or as a proven-neutral refactor (frozen digests), so
   value lands throughout; phase 4 is the switch.

### 8.4 Build vs adopt — and where an external tool still helps

Build: all of L0–L6, per the premise. Adopt as a dependency: nothing. `@abaplint/core` (MIT, 11 MIT dependencies,
7.3 MB unpacked, 2.4 MB minified, Node-only, daily releases by one npm maintainer with 51 contributors) is a fine
measuring stick and would be a fine **offline oracle in a dev-only harness, pinned to one version, never
shipped** — three checks it already proved tonight: is corpus code valid ABAP (it caught 2 invalid statements in
BM-240), do our blocks balance where it structures a file, do our method resolutions agree with its static types.
That is an owner decision; nothing of it is in the repository. Why not as a foundation: it needs the abapGit object
layout and metadata, stubs of SAP's standard classes, and stops on fragments, includes without a main program,
function modules without FUGR XML and classes with a missing superclass — user uploads are exactly that; it has
no dispatch, no screen flow, no LUW, no process model, no business vocabulary; and one external maintainer's
release cadence would set ours. Prior art worth learning from (concepts only, no code read for reuse): abaplint's
layered pipeline and "Unknown isolated per statement"; SAP/abap-cleaner's tolerant parsing; abapmerge's include
merging; SAP/abap-file-formats for the object layout; open-abap-core for the idea of standard stubs. Excluded by
licence or trust: see §12.

### 8.5 Risks and an honest effort/timeline (one developer, full time; ranges are estimates)

| Phase | Content | Weeks | Risk and mitigation |
|---|---|---|---|
| 0 | Parse once: one `ParsedSource` (statements with `masked` text cached, block index, container index) handed to every reader; hotspots H1–H7; a pipeline scaling guard (2× input ≤ 2.4× time) at 1k/10k/25k lines; `engineDigest` in runs; frozen digests per release in CI; readings table A | 3–4 | low — proven neutral by the frozen digests at every step |
| 1 | Own L0 lexer and L1 statement classifier behind the existing `AbapStatement` interface; L2 block recovery; the 300-file sample as a fuzz corpus; remove the two other splitters | 5–7 | medium — every anchor and line number must stay; the golden digests catch the first byte that moves; the three lexical defects are the acceptance test |
| 2 | L3 object model from the upload layout; L4 symbols with typed references; L5 dispatch with `FINAL` pruning, candidate lists, simple RTA, `RAISING` types; `method-resolution.ts` becomes a consumer | 7–9 | medium — scope rules of ABAP are large; unknown types stay void; the prototype comparison (203 calls) is the regression test |
| 3 | L6 as typed passes: split `SkeletonBuilder` along its pass seams (entries, walk, folds, starts, lanes, LUW); one recogniser per concept with a probe spec that compares evidence, skeleton and plain language on the same source; close #2–#6, #9 of §5 | 6–8 | **highest** — the 4,312-line class carries 60 days of decisions in its ordering; split one pass at a time behind the digests, never two |
| 4 | Engine 4.0.0 behind its gate, side by side on the benchmark, the switch | 2–3 | low once 0–3 hold |
| | **Total** | **23–31 weeks** | plus the owner's decisions on the expected-answer conventions, which cost no engine time |

Risks across phases: (a) the benchmark cannot see most of this work (§2.2) — the metric must change first or the
work will look like nothing happened; (b) the business-language layer (17,646 lines, 38 %) sits on top of the
statement text and will need its own pass to read the model instead; (c) `APP_VERSION` and the readings must be
decoupled before 4.0.0 or the gate pile grows into the new engine.

## 9. Four-criteria scorecard

| Criterion | Today | Evidence | Target and how it is tested | Proposed architecture |
|---|---|---|---|---|
| **Robust** (belastbar) | 3 | 0 crashes/hangs on 300 real files; 0 of 614 outputs moved across release engines; **but** 6 % false unterminated blocks, a dynamic SELECT read in the findings and absent from the map, a macro the engine both expands and denies, 12 brittle cells from one regex, 330/614 moved within one version stamp | fuzz + metamorphic suite on the real sample in CI, 0 false unterminated; a per-concept probe spec with 0 contradictions between evidence, skeleton and plain language; `engineDigest` in every run; `Unknown` marked with line anchors, never guessed | 4 |
| **Performant** | 2 | 1k lines 0.68 s; 10k 6.3 s; 25k 45–55 s; exponents 1.5–2.6; 25 full-text passes | budgets as tests: whole pipeline 1k < 0.3 s, 10k < 2 s, 25k (1 MB) < 8 s, RSS < 500 MB; scaling guard 2× input ≤ 2.4× time on every entry point; tokenise once | 4 |
| **Maintainable** (wartbar) | 2 | three files > 3k lines, a 4,312-line class, a 1,482-line function, 16 functions > 150 lines, 22 layer violations, 7 of 30 comments wrong, 18 glossary conflicts, 386 commits/60 days into one folder | no file > 1,500 lines, no function > 150 (eslint `max-lines`, `max-lines-per-function`); layer rule enforced (`import/no-restricted-paths`); a "Pure: / No imports" header guard; dead-export check; one glossary | 4 |
| **Extensible** (erweiterbar) | 2 | a new reading = a gate file + version threading (578 references) + a hand-kept list of 60 names; a new construct touches up to 16 recognisers; 19 non-engine files decide versions | a new statement kind = one row in the kind table + one spec; a new reading = one row in the readings table + one frozen digest; no version comparison outside `engine-readings.ts`; a new ABAP release = a column in the kind table | 4 |

## 10. Sustainability — how each recommendation keeps the engine maintainable over years

- **Parse once with a `ParsedSource` contract:** readers depend on the parsed model, never on text, so a tokeniser
  fix lands once and every surface agrees on line numbers by construction; the next developer finds one reader,
  not eleven.
- **One recogniser per concept with a probe spec:** a construct is taught once; the probe suite turns a silent
  divergence between evidence, map and sentence into a red test the day it is written.
- **A readings table instead of a gate file per release:** versioning becomes data plus an automatically produced
  oracle; the fourteenth and the fortieth reading cost one row each, and reproducibility is proven per release,
  not per convention.
- **Frozen snapshots per major version:** signed runs stay reproducible without back-porting; the old tree stops
  growing, the new one starts clean.
- **Performance budgets as tests:** the next quadratic loop goes red on the day it is written; review and digests
  are blind to time.
- **Typed passes under 150 lines with their own specs:** units can be read, tested, reviewed and replaced one at a
  time; 386 commits per 60 days stop turning into merge pain in one class.
- **Learn/holdout discipline with a measurement log:** every holdout event recorded (four so far); metamorphic
  and golden tests per layer so that a layer can change without the benchmark being the only witness.
- **No new special-case pile:** tonight's rule — if a fix only works by adding another exception list, stop and
  record it as an architecture finding — applied to the gate pile itself (§4.2) and to the `SELECT … ENDSELECT`
  doc/code mismatch (§4.5), both recorded, neither patched.

## 11. Proposed roadmap (owner decision; five steps, each independently valuable)

1. **Measure what the readers see (2 weeks, benchmark side):** report hit rates over all expected nodes and all
   business steps beside the comparable rate; compare labels, gateway questions and branch outcomes; log every
   holdout measurement; decide the six conventions of the audit and re-freeze the expected answers as v2. Without
   this, steps 2–5 are invisible.
2. **Phase 0 (3–4 weeks):** parse once, hotspots, scaling guard, `engineDigest`, frozen digests per release,
   readings table. Pure refactor, proven neutral; makes the 25k-line program usable.
3. **Phase 1 (5–7 weeks):** own lexer + statement classifier + block recovery; the real-code sample as fuzz
   corpus; the three lexical defects as acceptance; the two other splitters removed.
4. **Phase 2 + the legacy model gaps (7–9 weeks + 3 weeks):** object model from the upload layout, symbols,
   dispatch; `ON COMMIT`, exception routing, screens ↔ modules, user-exit includes, `CLASS_CONSTRUCTOR`, EML —
   each gated, each with a snippet guard, each measured.
5. **Phase 3–4 (8–11 weeks):** split the builder into typed passes, one recogniser per concept, engine 4.0.0
   side by side, the switch.

## 12. Sources

All checked 13.11.2026. No code, grammar, test or text from any of them entered the repository or the prototype;
concepts only. Adoption is proposed for none of them (premise, §8); `@abaplint/core` is named as a possible
dev-only oracle for an owner decision.

| Source | URL | Licence (SPDX) | Last release / commit | Maintainer / org | Adoption | Why trustworthy | Role here |
|---|---|---|---|---|---|---|---|
| `@abaplint/core` 2.120.105 | https://github.com/abaplint/abaplint | MIT (repo licence via GitHub API; `package.json` MIT); 10 transitive runtime dependencies, all MIT (`fast-xml-parser`, `@nodable/entities`, `fast-xml-builder`, `is-unsafe`, `path-expression-matcher`, `strnum`, `anynum`, `xml-naming`, `json5`, `vscode-languageserver-types`) | npm 2026-11-13; repo pushed 2026-11-13 | npm maintainer larshp; org abaplint, 51 contributors | 323 stars, 42,759 npm downloads/week | daily releases, a test tree mirroring `src/`, used in CI by the three real-code repositories below | measuring stick for method resolution and robustness; possible offline oracle |
| abapGit | https://github.com/abapGit/abapGit | MIT | a418437d, 2026-11-11 | org abapGit | 1,980 stars | best-known open-source ABAP code base, own unit tests | robustness sample (100 of 768 files), untrusted data, never executed |
| abap2xlsx | https://github.com/abap2xlsx/abap2xlsx | Apache-2.0 | 3bdf779f, 2026-04-20 | org abap2xlsx | 886 stars | long-lived community project, large classes | robustness sample (100 of 103 files) |
| SAP/code-pal-for-abap | https://github.com/SAP/code-pal-for-abap | Apache-2.0 | 0fce18a7, 2026-09-21 | SAP | 442 stars | SAP-owned production ABAP | robustness sample (100 of 174 files) |
| SAP/abap-cleaner | https://github.com/SAP/abap-cleaner | Apache-2.0 | v1.29.2, 2026-10-30 | SAP | 682 stars | SAP-owned, active | prior art (tolerant parsing), concept only, code not read |
| SAP/abap-file-formats | https://github.com/SAP/abap-file-formats | MIT | pushed 2026-11-13 | SAP | 113 stars | SAP's own object file specification | prior art for the upload/object layout, concept only |
| larshp/abapmerge | https://github.com/larshp/abapmerge | MIT | npm 2026-07-30; pushed 2026-11-12 | larshp | 2,803 downloads/week | same author as abaplint, maintained | prior art for include merging, concept only |
| open-abap/open-abap-core | https://github.com/open-abap/open-abap-core | MIT | pushed 2026-11-13 | org open-abap | 67 stars | maintained beside abaplint | prior art (stubs for the standard), not used |
| Process benchmark audit | `docs/prozess-benchmark/AUDIT-2026-11-13.md` (branch `night/benchmark-audit`, commit `465af206`) | project document | 13.11.2026 | this project | — | independent audit, aggregates only on the holdout | conventions, power, honest denominators |
| ABAP semantics | — | — | — | — | — | every claim about an ABAP statement is backed by a snippet in `tests/engine-reads-320.spec.ts` or in the construct probe, never by an external repository | — |

Mentioned and excluded (not read for reuse): `@abaplint/transpiler` (npm MIT, repo licence not detectable),
kennyhml/tree-sitter-abap and mkoval1/tree-sitter-abap (no licence), zooloo303/tree-sitter-abap (MIT, 0 stars,
"highlight-grade"), Zaneham/abap-parser (Apache-2.0, 0 stars), cohomology/abap-parser and joernio/abap_ast_gen
(no licence), jackieju/abap2ruby (**AGPL-3.0**, inactive since 2020), BurnerPat/abaplint-ast-viewer and
HoffmannThomas/ABAP-AST (no licence), SAP ADT / commercial analysers (closed source; SAP's terms rule out
automated access to its sites, which was not attempted).

## Appendix — the fix ledger of the night

| Step | Learn W1+2 / W3 (comparable hits) | Kept? |
|---|---|---|
| Baseline, engine 3.1.0 reading (`KORPUS_ENGINE_VERSION=3.1.0`) | 2,930 / 1,697 | — |
| Candidates as "called from outside" (pre-empting the bare-FORM last resort) | 2,930 / 1,833 — BM-207 lost 6 | reverted the same hour |
| Candidates beside the primary entries (`079443e3`, incl. the candidate's registrations) | 2,930 / 1,852 | yes |
| Module/callback registrations + `MESSAGE` any case (`1a77ab95`) | 2,930 / 1,854 | yes |
| `CALL BADI`/`CUSTOMER-FUNCTION` as `call-opaque` | 2,930 / 1,854 (BM-195 wrong kind) | changed to service task |
| … as `service-task` (`bdbfff40`) | 2,931 / 1,854 | yes |
| Freeze (`810ffe6b`), then the holdout once: 3.1.0 → 3.2.0 | holdout 85.5 / 72.3 % → 85.6 / **80.6 %** | — |

Not changed although measured: the `IF sy-subrc` convention (2.15), `MESSAGE` S/W, `AUTHORITY-CHECK` as a
lane, small routines and constructors as one step, `SELECT … ENDSELECT` as an iterating read — all design
decisions or expected-answer conventions, listed in BERICHT §8. The guard `tests/engine-version-callers.spec.ts`
is red on `integrate/3.2.0` before this night (§4.2) and was not touched.
