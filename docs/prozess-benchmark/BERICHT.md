# Process benchmark — how accurately does Clean-Core.io reconstruct the process from ABAP?

As of 28.09.2026, §7 of 03.10.2026 · Basis: `tests/prozess-benchmark/` (cases, expected answers, measuring tools, judge verdicts)

## The result in five sentences

1. On 200 realistic, blind-written and cross-checked ABAP cases, the reconstructed
   process skeleton now hits **81.1 %** of the comparable expected nodes — this morning it was **61.3 %**.
2. The hidden test half, on which no development was ever done, is at **82.1 %**, even above the learning half;
   the improvements are not tailored to the examples.
3. A third, deliberately hard wave (object-oriented, multi-file, RAP/OData/Web Dynpro, dialog) rises
   from **39.5 %** to **72.3 %**, its hidden half to **70.4 %** — this is where the next work lies.
4. The business statements of the Business view say almost nothing wrong any more (statements that contradict the code:
   236 → 11 of 2,273), but they stay technical; the model (Path B) hits the business meaning in **86.5 %**
   and is therefore now — as a proposal with evidence and a contradiction marker — in the Business view.
5. The result of roadmap 17.8 ("B does not beat A") was a measurement error of the word measure; measured
   by content, B clearly beats A.

## 1. How it was measured

**300 cases in three waves**, each package of 20 with five simple to very complex cases (wave 3: 2/4/7/7):

| Wave | Content | Cases | Lines of ABAP | Expected nodes | Business statements |
|---|---|---|---|---|---|
| 1 | Core modules: SD, MM/warehouse, FI/CO, PP/PM/QM, cross-application | 100 | 19,500 | 4,049 | 1,126 |
| 2 | Peripheral modules with ≥ 2 edge cases per case: PM/CS/EHS, PS/RE-FX/PSM/FSCM/TRM, HCM, industries, technology | 100 | 20,800 | 4,133 | 1,147 |
| 3 | hidden test set, focus on hard: OO SD/MM, multi-file FI/CO/HR, Gateway/RAP/BOPF/Web Dynpro/AMDP, interfaces, dialog | 100 | 25,400 | 5,051 | 1,142 |

**Blind and cross-checked.** Each case was written by an author agent that neither read
nor ran the engine, and checked against ABAP semantics by a second, independent reviewer (a record per
case in `review.json`). No case was discarded; the reviewers corrected mainly structure (missing
block ends, calls wired twice, nodes on pure assignments) and found 13 real business or
syntactic errors (e.g. `VBUK-ABSTA` does not exist; `BAPI_PO_GETDETAIL1` does not know `ITEMS`;
`GET peras` exists only in PNPCE).

**Frozen before the engine saw them.** `frozen-*.json` holds the SHA-256 of every expected answer and
source; `validate.py` checks them on every run (a changed expected answer turns the run red).

**Learning and test halves**, fixed by hash before any individual result was looked at
(`split.json`). Development was done only on learning cases; test halves were measured as a total, the
wave 3 test half exactly once at the end.

**The same comparator as for the reference corpus** (`tests/helpers/korpus-comparison.ts`; against the
corpus baseline 0 deviations across 340 verdicts). It measures the way a user pastes a program with
includes into the product: all files of a case as one source.

## 2. The process skeleton

### Overall (node hits over the comparable expected nodes)

| Group | Morning | **Engine now** | with corrected comparator¹ |
|---|---|---|---|
| Wave 1+2, learning half | 60.6 % | **80.0 %** | 81.4 % |
| Wave 1+2, test half (hidden) | 61.9 % | **82.1 %** | 83.5 % |
| **Wave 1+2** | **61.3 %** | **81.1 %** | 82.5 % |
| Wave 3, learning half | 40.3 % | 74.3 % | 74.9 % |
| **Wave 3, test half (hidden, measured once)** | 38.8 % | **70.4 %** | 70.0 % |
| Wave 3 | 39.5 % | 72.3 % | 72.5 % |
| all 300 | — | 77.9 % | 78.7 % |
| *Reference corpus (68, for comparison, morning)* | *79.9 %* | | |

¹ Two omissions in the comparator that are older than today's engine changes: a call that the
engine recognises more precisely as *shipping*, and a small routine that §5.8 names after its effect, counted
as "wrong kind"; functional method syntax (`obj->m( )`) was not comparable. Shown separately,
so that no measurement correction appears as engine progress.

**Edges:** the rate falls from 72.5 % to 68.2 %, although clearly more edges hit in absolute terms — because now
many more nodes are resolved, 900+ expected edges become comparable in the first place.

### Where it is good and where it is hard (engine now)

| | Node hits |
|---|---|
| simple · medium · complex · very complex | 89.4 % · 86.5 % · 77.1 % · 75.9 % |
| one file · 2–3 files · 4+ files | 87.4 % · 79.5 % · 75.0 % |
| strongest packages | W2 PM/CS/EHS 84.0 % · W2 industries 84.0 % · MM/warehouse 83.6 % |
| weakest packages | W3 OO business applications 64.9 % · W3 dialog 70.4 % · W2 HCM 74.1 % |

| Expected node kind | Hits | | Expected node kind | Hits |
|---|---|---|---|---|
| Lock | 100 % | | End | 85.0 % |
| Loop | 92.1 % | | Branch | 71.8 % |
| Read | 92.0 % | | Output | 69.6 % |
| opaque call | 91.8 % | | Start | 68.0 % |
| Write | 91.6 % | | Call into the case | 65.1 % |

## 3. What was changed — and why it is general

Every change is justified from ABAP semantics and `DESIGN.md` §5.8, carries a guard test with **newly
written** minimal ABAP, and none loses a match in the reference corpus (the ratchet now holds
128 instead of 122 matches).

| # | Finding | Change | Effect |
|---|---|---|---|
| D1 | Dynpro modules and function modules were dropped as soon as an event block existed | Entry points alongside the events | Module pools complete |
| D2 | Method calls produced **no** node | Subprocess where the source implements the method, otherwise a call; resolution via class, superclasses, interface (`lib/abap/method-resolution.ts`) | OO code visible |
| D3 | Called FORMs also appeared as a start | only FORMs that are never called are entry points | no duplicates |
| D4 | `MESSAGE TYPE 'I'` (popup) was missing | User task | §5.8 implemented |
| ADR-054 | Subprocesses without a visible beginning; early exits ran silently into the shared end | Start per expandable level; own end per `RETURN`/`EXIT`/`STOP`, recognisable as "End (early)"; events never count as a step; `CHECK` stays conditional flow | +9.3 pp |
| | `RAISE EVENT` counted as an error end and cut off the flow | Call of the bound handlers (via `SET HANDLER`) | |
| | After `LEAVE TO SCREEN` the flow continued | Dialog step ends | |
| | Callbacks (`ON END OF TASK`), ALV event handlers, BAdI methods (`intf~meth`), `REDEFINITION`s without a superclass in the upload counted as "not reached" | Entry points, trigger noted, not guessed | W3 +8 pp |

**Deliberately not changed** (design decisions, shown in the report as a convention difference):
`IF sy-subrc` as an error boundary event (2.15, 284 expected nodes "other kind"); small routines as one step;
technical helpers; `MESSAGE` S/W without an element; `AUTHORITY-CHECK` as a lane instead of a step; polymorphic
calls with an open target stay opaque (D2: do not guess).

## 4. The business statements (Business view)

Five independent judges rated all 2,273 expected statements **by content** — per expected statement three variants
side by side, labelled X/Y/Z at random per case; the mapping was only opened after all verdicts
(`judge/schluss/zuordnung.json`).

| | same | partial | deviating | missing | contradicts the code | forbidden inferences |
|---|---|---|---|---|---|---|
| Path A before (deterministic) | 3.3 % | 80.4 % | 2.0 % | 14.2 % | 236 | 9 |
| **Path A after** | 10.3 % | 76.6 % | **0.1 %** | 12.9 % | **11** | **4** |
| **Path B (Gemini)** | **86.5 %** | 7.1 % | 0.3 % | 6.1 % | 39 | 19 |

Test half: A after 9.3 % same, B 87.2 % — the same picture.

**Path A** was freed of twelve general error patterns that all five judges found independently (among others,
`CHECK` invented "smaller ones are skipped", every `sy-subrc` was called "hit", `GET PARAMETER` became a
logical database, every transaction became a "creation", `MESSAGE … INTO` became output). It is now
reliable, but stays technical — a sentence construction kit cannot translate `faksp` into "Fakturasperre" (billing block)
without guessing (a general list of SAP standard terms helps, but does not replace that).

**Path B** has been in the Business view since roadmap **17.10**: at the push of a button a Model proposal (provenance
"proposal"), below it the sentence from A as evidence, and a deterministic contradiction marker. The
marker is a **safety net, not a guarantee**: on the test half it finds 2 of 14 wrong
model statements at 0.3 % false alarms. None of it goes into the signature, run or audit pack; the
model receipt is bound to its stage.

## 5. Lessons Learned

1. **A measure calibrated on one case book does not generalise.** Path A hit 41 % of the business statements
   in the reference corpus by word overlap, 1 % in the independently written benchmark. Measured by content, the
   difference was much smaller — the word measure measured style, not content.
2. **Measure the way the user works.** Files read one at a time hid the fact that method calls and
   Dynpro modules disappeared in the assembled program (61 % instead of 73 %).
3. **An outside, hard data set finds what your own does not.** Wave 3 exposed framework entry points
   (redefinitions, ALV handlers) that hardly occurred in waves 1+2.
4. **A hidden test set is hidden only once.** After the first look at wave 3 it was
   halved; only the learning half went into the work.
5. **Leave out proposals that help only one case** — even if they alone would have reached the target number
   (one entry-point rule would have brought 80.8 %, but helped only one composite case).
6. **Expected answers need a cross-check.** 70 % of the author answers were corrected; without reviewers,
   author errors would have been counted as engine errors.

## 6. Open

- **Wave 3 below 80 %**: polymorphic calls with an open target (do not guess vs. show all candidates),
  small methods as one step, RAP/OData framework dispatch — design questions for Sonny.
- **Loop levels with their own start** (decided 27.09., next step).
- **Language of the generated sentences** (German) versus ADR-009 (English).
- Sharpen the **contradiction marker**, measured on the test half.
- **Test suite**: audit of 27.09. — runtime 26 min, of which ~12 min fixed pauses; approval of the stages open.

## 7. Update 03.10.2026 — framework entry points and residual statements (ADR-066)

Two levers of the research note of 03.10.2026, approved by Sonny the same day: routines SAP calls by
convention become entries (ALV callbacks named by literal, output-control routines with the TNAPR
interface, `USEREXIT_*` forms, program-level `ENHANCEMENT` blocks), and residual statements draw what
the ABAP documentation says (`RECEIVE RESULTS`, `CLOSE DATASET`, `LEAVE TO SCREEN` as its own end, an
early exit that skips a result assignment, AMDP bodies). Nine rules, one commit each, each with a guard
of newly written ABAP. Developed on the learning halves only; the test halves were measured **once**,
after the last code change. Polymorphic calls, the `sy-subrc` convention (2.15) and status messages are
unchanged.

Measured with `BM_CONCAT=1`, i.e. the current comparator (the "corrected comparator" column of §2).
The column **M1-lite** additionally counts an expected gateway on `IF sy-subrc` as matched where the
engine draws its error boundary on that `IF` — a comparator correction for the 2.15 convention, not
engine progress; the half where the boundary sits on the `EXCEPTIONS` of the call before is not in it.

| Group | before | **after** | M1-lite before → after |
|---|---|---|---|
| Wave 1+2, learning half | 81.4 % | **85.7 %** | 84.2 % → 88.5 % |
| Wave 3, learning half | 74.9 % | **76.3 %** | 77.1 % → 78.5 % |
| all learning (150) | 78.9 % | **82.0 %** | 81.4 % → 84.5 % |
| Wave 1+2, test half (hidden, measured once) | 83.5 % | **84.7 %** | — → 87.2 % |
| Wave 3, test half (hidden, measured once) | 70.0 % | **71.0 %** | — → 73.1 % |
| all test (150, measured once) | 78.5 % | **79.7 %** | — → 82.0 % |
| all 300 | 78.7 % | **80.8 %** | — → 83.2 % |

Learning +3.1 pp, test half +1.2 pp. Two thirds of the learning gain come from the four entry-point
rules, and each of them moves a single learning case (lesson 5); the residual rules move one to twelve
cases each. The test half gains less, as the research note expected (1–2 pp below the learning gain).

**Precision and edges (learning):** engine nodes on statements no expected node claims 178 → 186; edge
hit rate 66.6 % → 66.1 % (hits 2,674 → 2,780, comparable 4,018 → 4,204: more resolved nodes make more
edges comparable). **Reference corpus:** node matches 312 → 318, edge matches 146 → 150, agreeing
case-classes 132 → 133, no match lost. **Starter examples:** one task more ("Close file") on a
sub-process plane of `Z_INVOICE_EXTRACTOR`; no top plane moved. The demo and the PDFs are unchanged.

## Tools

`evaluate.ts` (measurement; `BM_CONCAT=1` as in the product, `BM_RANGE=a-b`), `report.py` (breakdown),
`validate.py` (structure, anchors, frozen hashes), `weg-b.ts` (model sentences with the building blocks of the
product), `judge/` (judge briefs, inputs, verdicts), `split.json`, `frozen-*.json`.
