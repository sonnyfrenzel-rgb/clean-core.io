# Engine-led transformation — design

Status: **proposed** (ADR-101). Roadmap: 3.0.12 (extension), right after the 3.0.12 row.
Owner decision: Sonny, 12.10.2026. Mockup for approval: `docs/roadmap/transformation-generation-mockup.html`.

> "We have so much knowledge in the engine for the analysis but use too little of it in the
> transformation. Code transformation must be much better than a blunt LLM call outside the tool —
> we must use the advantage that we already know so much about the legacy program and write the
> code quite differently with that context." — owner, 12.10.2026

This document is written so that three or four agents can build it in parallel. Every module has
one owner track (§17), every boundary between tracks is a typed contract written down here (§5, §8,
§11, §13), and every number in it is either measured (with the script that measured it, §10) or
marked as an estimate.

---

## 1. What changes, in one paragraph

Today the Transformation stage sends **one** prompt — the whole ABAP source, the model narrative,
the solution design, the code-draft rules and the facts section — and gets the whole package back in
one answer (`app/(app)/project/[projectId]/transformation/page.tsx`, `generateTransformation`, one
`callGemini(prompt, …, 'transformation')`). The engine's knowledge reaches the model only as text
the model may or may not follow. After this change the **engine writes the package's skeleton
itself** — types with exact places and bounds, one input contract, guards with rule ids, a
collision-free run store, an app factory, a CSV writer, the call contract for tests, and one function
stub per routine with its ABAP lines and rule ids — and the model writes **only the business-logic
body of each stub**, from a small prompt holding just that routine's ABAP lines, its rules and the
facts. Then lints, engine cases and failure-pattern probes run, and only the functions that fail go
back to the model, at most twice. The screen shows the whole chain as it happens, with this
project's own numbers.

## 2. Goals

1. **The engine's knowledge is binding, not advisory.** Everything the engine can decide on its own
   (types, precision, bounds, guards, input validation, run identity, CSV, app factory, test call
   contract, file layout, traceability) is written by the engine and cannot be changed by the model.
2. **The owner's decisions are carried into the code.** KEEP rules are implemented as the original
   has them; CHANGE rules with the owner's proposal; DROP rules are absent; OPEN rules are
   implemented as the original and marked open (§6.4).
3. **Every function is traceable** to ABAP line ranges and rule ids — in the code, in the
   Transformation UI, in `STATUS.md` and in a machine-readable `traceability.json`.
4. **Small prompts.** No fill prompt exceeds 14,000 characters (today's CO prompt is above 95,000
   before the narrative and the design are added, §10).
5. **Checked before stored.** Lints, engine cases and failure-pattern probes run on the candidate
   package before it is stored; failures are repaired function by function, at most two rounds.
6. **Both tracks**: Node.js/CAP (side-by-side) and RAP/ABAP Cloud (in-app).
7. **Not slower than today** on the four reference sources (§10, §19 acceptance).
8. **The user sees what the generation builds on** — tool by tool, in workflow order, with real
   numbers, levels and links; and before the run, what they can still do to raise the quality (§14, §15).

## 3. Non-goals

- No new model provider (3.0.14), no portfolio batch (3.0.15), no characterization tests from
  observed output (3.0.16), no engine reading improvements (3.0.17).
- No AST library in the browser bundle. The splice is text-based with guards (§9).
- No streaming from the proxy. Progress is real because there are many small calls, not because a
  single call streams.
- Nothing generated is signed and nothing generated enters the audit pack (§12).
- The rebuild gate of 3.0.13 (no rebuild code while standard fit is unassessed and core rules are
  undecided, unless the owner overrides with a reason) is out of scope; this design leaves a hook for
  it (§14.4) and does not implement it.
- No user-facing switch between "engine-led" and "single-call". The single-call path survives only as
  an automatic fallback with a visible note (§16.2).

## 4. The four stages and the data flow

```
 project + active run ─┐
 process states (rule  │      ┌─────────────────────────┐
 decisions) ───────────┼────▶ │ 1. Context pack          │ lib/transformation-context.ts  (Track A)
 requirements spec ────┤      │   budgeted text + digest │
 contract / decision ──┘      └───────────┬─────────────┘
                                          │ TransformationContext
 legacy source ──────────────┐            ▼
 engine (call graph, rules,  │  ┌─────────────────────────┐
 original contract, process  ├▶ │ 2. Unit plan + scaffold  │ lib/transformation/*            (Track B)
 documentation, reading path)│  │   deterministic files    │
                             │  │   + fill units + adapter │
                             │  └───────────┬─────────────┘
                             │              │ Scaffold { files, units, digest, adapter, trace }
                             │              ▼
                             │  ┌─────────────────────────┐   /api/transformation/lease  (Track C)
                             └▶ │ 3. Step-wise fills       │── /api/gemini  (leaseId, ≤4 in flight)
                                │   bundles of ≤4 units    │
                                │   splice into markers    │
                                └───────────┬─────────────┘
                                            │ candidate package
                                            ▼
                                ┌─────────────────────────┐   lib/generated-code-lints.ts (browser)
                                │ 4. Verify + repair       │── /api/run-tests mode=verify (runner):
                                │   ≤2 rounds, failing     │   engine cases + failure probes
                                │   units only             │
                                └───────────┬─────────────┘
                                            │ package + trace + check summary
                                            ▼
                    storeGeneration (token compare-and-swap, as today; binding v3)
```

Where things run:

| Step | Runs in | Why |
|---|---|---|
| Context pack | browser and server (pure module) | the page already reads the inputs with the generation token; the server needs the same digest for the binding |
| Unit plan, scaffold, splice | browser (pure modules, dynamic import as today's facts readers) | same trust model as today: the page builds the prompt; the server stores only against the token |
| Fill calls | browser orchestrates, `/api/gemini` executes | keys never reach the client (CLAUDE.md); the lease meters the calls (§11) |
| Lints | browser | `lib/generated-code-lints.ts` is pure |
| Engine cases, probes | the isolated runner, through `/api/run-tests` | they execute generated code; the runner is the only place that may (8.9) |
| Store | server, `storeGeneration` | unchanged compare-and-swap on the generation token |

Leaving the page during a generation loses it (nothing is stored); per DESIGN.md §2.8 the page asks
before leaving. *Cancel* stops issuing calls; calls already in flight finish on the server and are
counted against the lease (stated in the cancel note, `CANCEL_REACH` wording).

## 5. Stage 1 — Platform knowledge: the context pack

Owned by **Track A** on `feat/3.0.12-context` (`lib/transformation-context.ts`, being built). This
design needs the following from it; if the branch already uses other names, the branch wins and this
section is updated, not the other way round.

```ts
// lib/transformation-context.ts (Track A)
export interface TransformationContext {
  program: { name: string | null; lines: number; sourceSha256: string };
  /** Rule decisions of the need revision (lib/process-states.ts), by rule id. */
  rules: Array<{ id: string; decision: 'keep' | 'change' | 'drop' | 'open'; text: string;
                 proposal: string | null; routine: string | null;
                 ranges: Array<{ lineStart: number; lineEnd: number }>; type: 'rule' | 'control' }>;
  decisionRecord: { id: string; option: string; fingerprint: string; state: 'confirmed' | 'draft' | 'outdated' } | null;
  businessSummary: string[];          // "In short" facts (lib/program-summary-text.ts), engine level
  successors: Array<{ object: string; successor: string; source: 'catalog'; level: 'A' | 'B' | 'C' | 'D' | null }>;
  nfrs: Array<{ id: string; category: string; text: string; status: 'draft' | 'accepted' | 'clarify' | 'rejected' }>;
  requirements: { functional: number; accepted: number; clarify: number; revision: number | null };
  dataMode: { mode: string; sentence: string } | null;   // 3.0.11 data-mode wording
  original: OriginalContract;          // lib/abap/original-contract.ts
  route: { chosen: string; reason: string; contractFingerprint: string };
}
export function buildTransformationContext(input: TransformationContextInput): TransformationContext;
/** The compact block every fill prompt carries; never longer than `budget` characters. */
export function contextPackText(ctx: TransformationContext, budget: number): string;   // budget 3,000
/** Digest over the canonical form; enters the generation binding (§12). */
export function contextDigest(ctx: TransformationContext): string;
/** One slot per contribution, in workflow order (§14.2, §15). Screen, tips and prompt read this. */
export function contextSlots(ctx: TransformationContext, project: Project): ContextSlot[];
```

**Budget.** The pack text is at most 3,000 characters per fill call: the route and its reason (one
line), the decision record (one line), up to six "In short" facts, NFRs in scope of the unit (accepted
first), released successors of the objects the unit reads, the data mode. Rules are **not** in the
shared pack — each unit carries its own rules (§8). Over budget, lines drop in the reverse of this
order and the pack says how many were dropped.

**Economics is not a source.** Economics comes after Transformation in `PHASES`
(`lib/workflow-steps.ts`: Analyze → Design → Transformation → Documentation → Testing → Economics →
Delivery). No cost figure, scenario or revision enters the pack, the scaffold, the screen's chain or
the tips (owner correction, 12.10.2026).

## 6. Stage 2 — The deterministic scaffold

### 6.1 Module boundaries (Track B)

| File | Exports | Pure |
|---|---|---|
| `lib/transformation/unit-plan.ts` | `planUnits(source, ctx): UnitPlan` — granularity, folding, slicing (§7) | yes |
| `lib/transformation/abap-slice.ts` | `sliceFor(unit, source, graph, ctx): AbapSlice` — line ranges, masking of DROP lines, declarations | yes |
| `lib/transformation/markers.ts` | marker format, `spliceBodies`, `scaffoldDigest`, `bodyGuards` (§9) | yes |
| `lib/transformation/scaffold-node.ts` | `buildNodeScaffold(plan, ctx): Scaffold` | yes |
| `lib/transformation/scaffold-rap.ts` | `buildRapScaffold(plan, ctx): Scaffold` | yes |
| `lib/transformation/runtime-node.ts` | the fixed library files as strings (decimal, csv, run store, input contract, errors) | yes |
| `lib/transformation/call-contract.ts` | `acceptanceAdapter(scaffold): AdapterJson` (rule 24, `feat/3.0.12-cases`) and `engineCaseCalls` | yes |
| `lib/transformation/trace.ts` | `traceOf(scaffold, fills): Trace`, `traceMarkdown(trace)` for STATUS.md | yes |
| `lib/transformation/types.ts` | `Unit`, `UnitPlan`, `Scaffold`, `Trace`, `FillRequest`, `FillAnswer`, `GenerationEvent` | yes |

None of these imports React, Firestore or `next/*`. All are loaded with `import()` from the page, as
today's facts readers are, so a reader who never generates never downloads them.

```ts
// lib/transformation/types.ts
export type UnitKind = 'routine' | 'method' | 'orchestrator' | 'event' | 'fixture';
export interface Unit {
  id: string;                 // 'U02' — stable for one source + plan version
  kind: UnitKind;
  fn: string;                 // 'validatePolicy' (Node) / 'validate_policy' (RAP method)
  file: string;               // 'srv/steps/02-validate-policy.ts' / 'src/zbp_….clas.locals_imp.abap'
  title: string;              // engine plain name of the step ("Validate the allocation policy")
  stepId: string | null;      // BPMN element id of the step (process documentation), null for helpers
  abap: Array<{ lineStart: number; lineEnd: number; routine: string }>;
  rules: string[];            // BR ids, DROP excluded
  guards: string[];           // guard ids 'G-0120' (line of the IF/CHECK)
  callees: string[];          // unit ids this unit may call
  signature: string;          // written by the engine; the model never changes it
  budget: { lines: number; chars: number };
}
export interface Scaffold {
  track: 'node' | 'rap';
  version: number;            // SCAFFOLD_VERSION, enters the binding
  files: Array<{ path: string; content: string; owner: 'engine' | 'fill' }>;
  units: Unit[];
  digest: string;             // sha256 over every engine-owned character (§9.3)
  adapter: unknown | null;    // acceptance-adapter.json (Node only)
  notCarried: Array<{ routine: string; reason: 'unreachable' | 'dropped' | 'fixture' }>;
}
```

### 6.2 Node.js / CAP track — exact content

Every file below is written by the engine. "Fill" marks the only places the model writes.

| Path | Content | Source of truth |
|---|---|---|
| `package.json` | name, `"type": "module"`, scripts `start`/`test`, dependencies **only** those the scaffold imports (`express`; nothing else unless a fill declares an allowlisted `needs`) — rule 23 | scaffold import graph |
| `srv/lib/decimal.ts` | scaled `bigint` decimals: `parseDecimal`, `formatScaled`, `add`, `sub`, `mul`, `div`, `roundCommercial(value, places)` half away from zero for both signs; no `Number` in money/quantity paths | same algorithms as `lib/testing-engine-cases.ts` (`parseDecimal`, `formatScaled`, `divRound`, `roundCommercial`) |
| `srv/lib/types.ts` | one branded type per declared packed field: `Dec<'KOSTL_AMOUNT', 15, 2>` with `max` from `packedMax(digits, decimals)`; a constructor that refuses values over the bound or with more places | `OriginalContract.decimals` (`lib/abap/original-contract.ts`) |
| `srv/lib/input-contract.ts` | **one** `validateSelection(raw): Result<Selection>` used by JSON body, query and CSV upload alike: every `SelectionInput` (parameter / select-option, obligatory, checkbox/radio flags, defaults, `NO INTERVALS`), strict number parsing (no `parseInt`, `"2026x"` refused), finite numbers, ISO dates refused when invalid, upper bounds from the types; an empty selection is a refusal, not a success | `OriginalContract.inputs`; rules 15–17, 19 |
| `srv/lib/guards.ts` | one exported function per carried guard: `guard_BR_009_G0120(sel, state): Refusal \| null` with the original condition and ending as a comment and the effect mapped (`error-message` → 422 refusal with the message id; `return`/`exit` → early stop of the step; `check` → skip item) | `OriginalContract.guards` × rule decisions |
| `srv/lib/run-store.ts` | `createRunStore()` — immutable run records, id `crypto.randomUUID()`, record = `{ runId, selection, ruleRevision, sourceRevision, contextDigest, createdAt, result }`, `get(runId)`; no module-level "latest" | rule 18 |
| `srv/lib/csv.ts` | RFC 4180 writer, delimiter from the original when it declares one, formula guard (`=`, `+`, `-`, `@`, tab, CR at cell start are prefixed with `'`), every export names run id, source revision and rule revision in a header line | rule 20; PP F08 |
| `srv/lib/errors.ts` | `Refusal`, `NotImplementedFill` | — |
| `srv/steps/NN-<name>.ts` | one file per unit: imports (engine), JSDoc with ABAP lines + rule ids + guard ids, the function signature (engine), **the body between fill markers (Fill)** | §7 |
| `srv/process.ts` | `runProcess(selection, deps)` — the orchestrator: calls the step functions in reading-path order (`readingPath`), branches as fill markers of kind `orchestrator` (the conditions need translating), the guard calls before any calculation (F04) | `lib/process-documentation-path.ts` |
| `srv/app.ts` | `createApp(deps)` — Express app factory, routes per endpoint of the design, all through `validateSelection`, every result bound to a run id; **no `listen`** | rule 22 |
| `srv/server.ts` | the only file that calls `listen`, reading `PORT` | rule 22 |
| `db/schema.cds` | entities for the tables the original reads/writes, typed from the declared fields (`Decimal(p, s)`) | call graph DB access, original contract |
| `test/engine-cases.json` | the engine cases (`TC_ENG_*`, `lib/testing-engine-cases.ts`) | `deriveEngineCases` |
| `test/engine-cases.test.ts` | runs every engine case through the call contract with `node:test` — written by the engine, not the model | call contract |
| `acceptance-adapter.json` | the harness adapter mapping each probe (`rounding-commercial`, `decimal-quantity`, `run-id-collision`, `empty-selection`, `lenient-numeric`, `csv-escaping`, `display-filter`, `recalc-additive`, `negative-write`, `import-side-effects`) to scaffold exports; a probe whose subject the program does not have is `not-applicable` and says why | `call-contract.ts`; harness format of `feat/3.0.12-acceptance` |
| `TRACE.md` / `traceability.json` | every function → ABAP ranges, rule ids, guard ids, filled by (engine / model / model after repair round n / not filled) | `trace.ts` |
| `Dockerfile` | as `packageDockerfile` writes it today | `lib/delivery-package.ts` |

Because decimals, input contract, run store, CSV and app factory are engine-owned, six of the ten
harness probes (`rounding-commercial`, `decimal-quantity`, `run-id-collision`, `lenient-numeric`,
`csv-escaping`, `import-side-effects`) test code the model cannot change. They still run on every
package: they test the scaffold, and a regression in it shows up there.

The **event publisher** (`erp-triggers/…clas.abap`) is not scaffolded; it exists only when the design
names a change for which SAP has no standard event (rule 23) — then the engine writes the class shell
in the customer namespace and the body is a fill unit of its own.

### 6.3 RAP / ABAP Cloud track — exact content

| Path | Content |
|---|---|
| `src/z<name>_r.ddls.asddls` | root view entity; one element per field of the main structure, typed `abap.dec(2L−1, d)` from each `DeclaredDecimal` (length L bytes, d places), `abap.char(n)`/`abap.dats` from DDIC-typed selection inputs; key from the original's read key |
| `src/z<name>_c.ddls.asddls` | projection view |
| `src/z<name>_r.bdef.asbdef` | behavior definition: `strict ( 2 )`, `managed` or `unmanaged` per the design's route; **one `validation` per carried guard** (`validation val_br_003_g0120 on save { create; update; field … }`), determinations for derived fields (COMPUTE/ADD read by the engine), actions for steps triggered by a user command (event callbacks), `etag`, locks |
| `src/zbp_<name>_r.clas.abap` + `.locals_imp.abap` | behavior pool: `CLASS lhc_<entity> DEFINITION` with every method signature engine-written; **method bodies between fill markers**; each method header comment names ABAP lines, rule ids, guard ids |
| `src/zcl_<name>_logic.clas.abap` | one method per routine unit (same markers), so the logic is unit-testable apart from the BO |
| `src/z<name>_srvd.srvd.assrvd`, `src/z<name>_srvb.srvb.assrvb` | service definition / binding (OData V4 UI) |
| `src/ztc_<name>.clas.testclasses.abap` | ABAP Unit class: one `FOR TESTING` method per engine case with given/when/then comments and the expected value from the case; the *when* line (the call into the logic class) is engine-written when the case maps to a logic method by the call contract, otherwise a fill unit of kind `event` with the case as input |
| `.abapgit.xml` | as delivery writes it today (not model-written) |

Guard condition texts translate ABAP to ABAP Cloud; that is a fill (the validation body), the
validation's existence, name, trigger and message class are engine-owned.

Note: today's RAP prompt does not carry `CODE_DRAFT_BUSINESS_RULES` nor the facts section (only the
Node prompt does, page.tsx lines 715–742). Under this design both tracks get the same unit prompt
(§8), so the RAP track gains the 3.0.12 rules for the first time.

### 6.4 Rule decisions in the scaffold

| Decision | Scaffold | Fill prompt | Trace |
|---|---|---|---|
| KEEP | guard/validation present; rule listed on its unit | "implement as the original does" | `keep` |
| CHANGE | guard/validation present with the owner's proposal as comment | rule text **and** proposal; "implement the proposal, not the original" | `change` + proposal |
| DROP | no guard, no validation; the rule's ABAP lines are **masked** in the slice (`* [BR-007 dropped by the owner — not carried over]`) | not listed | `dropped` in `notCarried` |
| OPEN (no decision) | as KEEP | as KEEP plus "open — kept as the original until decided" | `open`; STATUS.md counts open rules |

## 7. Granularity — how a process step maps to a function

### 7.1 Rules

1. **A unit is a reachable routine** (`FORM`, or `METHOD` of a local class in OO programs), not a BPMN
   step. Steps of the process documentation are anchored at their call sites (measured: every
   top-level step's anchor spans one line, §10) — the code lives in the routine they call. The unit
   carries the step's id and plain name when a step calls it (`Unit.stepId`, `Unit.title`).
2. **Event blocks** (`START-OF-SELECTION`, `AT SELECTION-SCREEN`, …) and the main path become **one
   orchestrator unit** (`srv/process.ts` / the action or determination that runs the process). Its
   call order is engine-written from `readingPath`; only the conditions are filled.
3. **Fold tiny helpers:** a routine with < 12 lines, no rule, no guard, no DB write and exactly one
   caller is folded into its caller's slice and gets no function of its own (measured: 3–6 per
   program).
4. **A helper with two or more callers** is a unit of its own (shared function).
5. **Unreachable routines** (`CallGraphReport.unreachable`) get no unit; STATUS.md lists them as "not
   carried over — never reached in the original" (measured: 13 in the PO demo).
6. **Demo-data routines** — reached only on the original's demo branch (`p_demo` path in
   `lib/process-documentation-path.ts`) — are kind `fixture` and are **not** model-filled in 3.0.12
   (open question Q2): the scaffold writes a fixture loader that reads `test/fixtures/original-demo.json`
   and STATUS.md names the reduced demo scope (3.0.16 note).
7. **Rules are not units.** A rule belongs to every unit that holds one of its anchors
   (`MaterialRule.routine`, `ranges`). A rule anchored at program level belongs to the orchestrator
   or to the input contract (selection-screen checks).
8. **Function modules, BAPIs, BDC, `CALL TRANSACTION`** called by a routine stay inside that unit's
   slice; the scaffold adds a port (interface) per external call the design keeps, named after what it
   does, never after an SAP API it does not call (rule 23).

### 7.2 Size limits

| Limit | Value | Measured against |
|---|---|---|
| Soft slice budget per unit | 150 ABAP lines **and** 6,000 characters | one of 118 reachable routines exceeds it (PP `READ_LIVE_SNAPSHOT`, 151 lines) |
| Hard slice budget per unit | 300 lines / 12,000 characters | none exceed it apart from demo routines (PP `LOAD_DEMO`, 881 lines → `fixture`) |
| Above the hard budget | split at top-level statement blocks into `<fn>_part1…n`, sharing one engine-written state object; the parent body calls them in order (engine-written) | — |
| Units per program | ≤ 60 | max measured 35 (CO) |
| Above 60 units | sibling units are bundled more densely (≤ 6 per call); above 120 the plan refuses and the fallback runs (§16.2) | — |
| Fill call (bundle) | 1–4 units of the same call-tree neighbourhood, ≤ 14,000 characters input | §10 |

## 8. Stage 3 — Step-wise filling

### 8.1 The ABAP slice of a unit (`abap-slice.ts`)

Included, in this order, each with original line numbers:

1. the routine's own lines (`FormDefinition.lineStart..lineEnd`);
2. the lines of every helper folded into it (§7.1 rule 3);
3. **declarations it reads:** the global `TYPES`/`DATA`/`CONSTANTS` statements whose names occur in
   1–2, at most 1,500 characters (statement reader names; over budget the list is cut and says so);
4. up to three call sites (`PerformCall` lines) with their actual parameters;
5. **masked**: lines of DROP rules (§6.4).

Excluded: other routines' bodies (their signatures arrive as callees), comments longer than one line
(kept as one line), the program's selection screen (the input contract is engine-owned).

### 8.2 Prompt contract

Examples in this section and in §9 use the CO program's `FORM VALIDATE_POLICY` (L500–L540, rules
BR-009–BR-011, as the engine reads them); the guard line, the unit number and the bodies are
illustrative.

The request is JSON (the prompt string sent to `/api/gemini` is this object serialised, plus a fixed
instruction header), response schema `TRANSFORMATION_FILL_SCHEMA` in `lib/model-response-schema.ts`
(new stage key `transformation-fill`, the switch stays `transformation`).

```jsonc
// FillRequest — built by lib/transformation/fill-prompt.ts (Track C)
{
  "schema": "cc.fill.v1",
  "track": "node",                       // or "rap"
  "program": "ZCO_CC_CLOSE_SIMULATION",
  "context": "…contextPackText(ctx, 3000)…",
  "rules": "…CODE_DRAFT_BUSINESS_RULES subset: 13, 15–24 …",   // from lib/code-draft-rules.ts, unchanged
  "units": [
    {
      "unitId": "U02",
      "function": { "name": "validatePolicy", "file": "srv/steps/02-validate-policy.ts",
                    "signature": "export function validatePolicy(sel: Selection, st: RunState): StepResult",
                    "returns": "StepResult — { ok: true } | Refusal" },
      "abap": { "ranges": [{ "lineStart": 500, "lineEnd": 540, "routine": "VALIDATE_POLICY" }],
                "text": "0500 FORM validate_policy.\n0501   …" },
      "rules":  [{ "id": "BR-009", "decision": "keep",   "text": "…" },
                 { "id": "BR-010", "decision": "change", "text": "…", "proposal": "…" }],
      "guards": [{ "id": "G-0506", "rule": "BR-009", "helper": "guard_BR_009_G0506", "condition": "…", "effect": "error-message" }],
      "facts":  { "decimals": [{ "name": "gv_quota", "digits": 7, "decimals": 4, "type": "Dec<'GV_QUOTA',7,4>" }] },
      "available": { "helpers": ["dec.add", "dec.roundCommercial", "csv.row", "guard_BR_009_G0506"],
                     "callees": ["readArea(sel): Area"] }
    }
  ],
  "repair": null                          // or { "unitId": "U02", "round": 1, "failure": "…", "previousBody": "…" }
}
```

```jsonc
// FillAnswer — validated before any splice
{
  "units": [
    { "unitId": "U02",
      "body": "…statements only…",
      "needs": [],                         // allowlisted helper names the body uses beyond `available`
      "refused": null }                    // or { "reason": "…" } — the model may decline a unit
  ]
}
```

Instruction header (fixed text, `fill-prompt.ts`): write only the body of each named function; do
not write imports, exports, types, signatures or markers; call only `available` names; keep every
guard call the stub already contains; amounts and quantities only through `dec.*`; say `refused` with
a reason rather than guessing. The 3.0.12 code-draft rules are included by number, unchanged.

### 8.3 Parallelism and limits

- **Bundling**: 1–4 units per call, ≤ 14,000 characters; neighbours in the call tree go together so a
  caller and its callees agree on shapes.
- **Concurrency**: at most **4 calls in flight per generation** (client pool, and enforced on the server
  by the lease, §11). A 429 or transient error backs off (2 s, 4 s) and retries the same call once;
  the proxy's own `callWithRetry` already retries transient provider errors three times.
- **Order**: leaves first (callees before callers), orchestrator last, so a caller's prompt can carry
  the callees' final signatures (signatures are engine-written anyway; order only matters for repair).
- **Budget per generation**: 48 model calls (fills + retries + repairs). Measured need: 3–9 fill calls
  (§10), so the budget leaves room for two repair rounds even on CO.

## 9. Merging the model's body into the stub — markers and splice

### 9.1 Marker format

Node (TypeScript):

```ts
/**
 * Validate the allocation policy.
 * ABAP: ZCO_CC_CLOSE_SIMULATION L500–L540 (FORM VALIDATE_POLICY)
 * Rules: BR-009 (keep), BR-010 (change — owner's proposal below)
 * Guards: G-0506 → guard_BR_009_G0506
 */
export function validatePolicy(sel: Selection, st: RunState): StepResult {
  const g0506 = guard_BR_009_G0506(sel, st);
  if (g0506) return g0506;
  // @cc-fill BEGIN U02 9f2c41d0
  throw new NotImplementedFill('U02', 'validatePolicy');
  // @cc-fill END U02
}
```

RAP (ABAP): `"! @cc-fill BEGIN U02 9f2c41d0` / `"! @cc-fill END U02` inside `METHOD … ENDMETHOD`,
the stub body `RAISE EXCEPTION NEW zcx_<name>_not_filled( unit = 'U02' ).`

The 8 hex characters are the first 8 of the sha256 of the unit's engine-owned text (signature + guard
calls + doc comment), so a marker copied to another place does not match.

### 9.2 Body guards (`bodyGuards`, before the splice)

A body is refused — and the unit goes to repair with that reason — when it:

1. contains `@cc-fill`, `import `, `export `, `require(`, a top-level `function`/`class`/`interface`
   declaration (Node) or `METHOD`/`ENDMETHOD`/`CLASS`/`DEFINITION` (RAP);
2. has unbalanced `()`, `[]`, `{}` or an unterminated string/template/comment — checked on
   `codeMask` from `lib/ts-source-scan.ts` (strings and comments masked first), for ABAP on the
   statement reader;
3. removes a guard call: every `guard_*` the stub has before the marker is engine text and cannot be
   touched; a body that *re-implements* the condition of a guard it must call is refused (rule 7);
4. calls a name that is neither in `available` nor in `needs` ∩ allowlist;
5. is longer than 4× its ABAP slice or 16,000 characters;
6. uses `Number(`, `parseFloat(`, `parseInt(` or arithmetic operators on a `Dec` value (lint
   `lenient number parsing` / `binary decimals` from `lib/generated-code-lints.ts`, raised to a
   refusal inside fills);
7. does not call a guard its unit must call in the body, or writes that guard's comparison itself
   (`guard-missing`, `guard-inlined`). Rule 15 as fixed by QA finding 4e9d1315469d: a check on **raw**
   input (selection inputs, constants, input records) runs before any calculation — at the step's entry or
   with the selection; a check on a **derived** value (a variable written earlier in the routine, a global
   written by another step, a system field such as `sy-subrc`) keeps the original's order: the engine
   writes the guard function with a `values` argument for the computed operands, and the body calls it at
   the original's line (`Unit.bodyCalls`, `Scaffold.required`, `fillGuardsOf`;
   `lib/transformation/guard-basis.ts`). A derived check is no RAP validation; the logic method calls its
   predicate.

The call contract's base request takes each value from the original — the selection DEFAULT, the demo
data, a fixed list in the code, a value that satisfies the original's checks — never a placeholder; an
obligatory field with none is listed (`missingBaseValues`) and every engine case reads "Not run — no
valid base value known for X" (`lib/transformation/base-values.ts`). The request's record fields are only
what the original takes as input — components of structures it fills from a database read, an upload or
file read, a split input line, or its demo data; a component it computes afterwards (arithmetic, a
function, a value the logic sets) is a result, never a request field (`recordInputOf`). Measured on
12.10.2026, scaffold alone: CO 17 engine cases pass (2 fail where a check predicate is still a stub), SD 17,
PP 12; the PO demo stays "Not run — no valid base value known for P_BANFN": the original gives no value.

### 9.3 Splice and integrity

`spliceBodies(scaffold, answers)` replaces exactly the text between `BEGIN Uxx <hash>` and
`END Uxx` of each answered unit — text search on the two marker lines, no AST. Afterwards it
recomputes `scaffoldDigest` over every character **outside** the markers and refuses the candidate if
it differs from `Scaffold.digest`. That proves the model changed no engine-owned character. A unit
whose body was refused keeps its stub (`NotImplementedFill`) and gets a finding (§16.1).

## 10. Measured numbers and the timing budget

Measured on 12.10.2026 with the engine of `feat/3.0.12-prompt` (0abfc377), Node 24, scripts
`scratch/measure-elt.ts` and `scratch/measure-elt-units.ts` (not committed: `scratch/` is ignored;
the build plan turns them into `scripts/transformation/measure.ts`, §17 Track B). Sources: the CO, SD
and PP review programs (outside the repository) and the PO starter example.

| | CO `ZCO_CC_CLOSE_SIMULATION` | PP/MM kit simulation | SD order cockpit | PO demo `Z_MM_PO_APPROVAL` |
|---|---:|---:|---:|---:|
| Lines / characters | 2,027 / 79,009 | 2,500 / 84,801 | 616 / 21,307 | 669 / 19,615 |
| Business rules (rule + control) | 66 (42 + 24) | 47 (39 + 8) | 17 (16 + 1) | 12 (11 + 1) |
| Material rules (prompt-relevant) | 48 | 46 | 13 | 6 |
| Guards / packed decimals / selection inputs | 72 / 7 / 16 | 56 / 2 / 13 | 7 / 4 / 13 | 17 / 1 / 4 |
| Process steps: all / listed / top-level | 916 / 143 / 17 | 178 / 62 / 15 | 130 / 50 / 15 | 84 / 44 / 11 |
| Routines: all / reachable / unreachable | 49 / 49 / 0 | 33 / 33 / 0 | 14 / 14 / 0 | 35 / 22 / 13 |
| Routine size p50 / p90 / max (lines) | 18 / 74 / 118 | 26 / 73 / 881 | 22 / 35 / 63 | 16 / 23 / 57 |
| Folded helpers / demo routines | 6 / 8 (15,455 ch.) | 6 / 2 (29,703 ch.) | 3 / 0 | 3 / 0 |
| **Fill units** | **35** (built: **34**, see below) | **25** | **11** | **19** |
| Units over the soft budget | 0 | 1 (151 lines) | 0 | 0 |
| Guards inside units / at program level | 58 / 14 | 47 / 9 | 6 / 1 | 12 / 5 |
| Engine time: documentation / rules+contract+graph | 3.98 s / 0.13 s | 1.16 s / 0.15 s | 1.15 s / 0.03 s | 0.25 s / 0.03 s |
| **Today's prompt without narrative and design** (template 3,662 + rules 4,689 + facts + source) | **95,171** | **98,379** | **32,130** | **30,042** |
| … plus narrative and design (not measured, stored per project; estimate 10–30 k) | ≈ 105–125 k | ≈ 108–128 k | ≈ 42–62 k | ≈ 40–60 k |
| Fill prompt per unit p50 / p90 / max (chars, incl. 3 k context + stub) | 4,807 / 7,296 / 11,549 | 5,269 / 7,061 / 11,350 | 5,071 / 5,524 / 5,806 | 4,514 / 5,044 / 5,710 |
| Fill calls at ≤ 4 units per call | 9 | 7 | 3 | 5 |
| Total input over all fill calls (context sent once per call) | ≈ 112 k | ≈ 91 k | ≈ 31 k | ≈ 46 k |
| **Largest single prompt** | ≤ 14 k (today ≥ 95 k) | ≤ 14 k (today ≥ 98 k) | ≤ 14 k | ≤ 14 k |

**Built plan (Track B, `scripts/transformation/measure.ts`, 12.10.2026): CO 34, PP 25, SD 11, PO 19 fill
units**, each plus the orchestrator. CO has one unit fewer than measured above: `CHANGE_FAC_DRIVER` is
reached only from the demo routine `APPLY_DEMO_CASE`, so §7.1 rule 6 makes it a fixture (owner, 12.10.2026:
a routine reached only from demo routines is demo data); the measurement script had classified demo
routines by name alone. With declarations and call sites in the slice, the per-unit prompt estimate is
larger (CO p50 6,344 / max 13,575); a unit too large to share a 14,000-character call goes out alone — the
cap and the cut rules stay.

Observations that shaped the design:

- **Step anchors are call sites.** Every top-level step's anchor spans one line (p90 = 1); the code a
  step stands for is the routine it performs. Hence units are routines (§7.1).
- **Demo data is big.** PP `LOAD_DEMO` alone is 881 lines / 26 k characters, more than the whole SD
  program. Filling it by a model costs more than all the business logic together and adds nothing to
  the decision. Hence `fixture` (§7.1 rule 6, Q2).
- **Many guards live outside routines** (selection-screen checks, 5–14 per program). They belong to
  the engine-owned input contract, not to any fill.
- **Today's RAP prompt carries no code-draft rules and no facts** (page.tsx 653–714).

**Timing budget (estimate — to be replaced by the Step 0 measurement, §17).** Assumptions: Gemini
3.8 Flash; ~10–15 s per fill call with ≤ 14 k input and ~1.5–2 k output tokens; today's single call
returns 8–13 k output tokens in one answer (the owner reported "a minute or more"; the progress curve
of `lib/generation-progress.ts` is tuned to a 45 s half-time).

| | CO | PP | SD | PO demo |
|---|---:|---:|---:|---:|
| Today, single call (estimate) | 60–120 s | 60–120 s | 40–90 s | 40–90 s |
| Scaffold (engine, measured locally) | ~4 s | ~1.5 s | ~1.2 s | ~0.3 s |
| Fills: calls ÷ 4 in flight → waves × 10–15 s | 3 waves: 30–45 s | 2: 20–30 s | 1: 10–15 s | 2: 20–30 s |
| Lints (browser) | < 1 s | < 1 s | < 1 s | < 1 s |
| Engine cases + probes on the runner (estimate) | 10–20 s | 10–20 s | 10–20 s | 10–20 s |
| Repair, 0–2 rounds of one wave | 0–30 s | 0–30 s | 0–30 s | 0–30 s |
| Store | ~1 s | ~1 s | ~1 s | ~1 s |
| **Engine-led total** | **45–100 s** | **35–85 s** | **25–70 s** | **30–80 s** |

The parallel fills are what keeps this at or below today: the output the model writes is spread over
four streams. If Step 0 shows today's calls are faster than estimated, the lever is concurrency (6)
or larger bundles, not dropping the checks. Acceptance (§19) compares measured medians.

## 11. Rate limits and quotas

Today `/api/gemini` allows **20 calls per hour per account** (`assertRateLimit('gemini:<uid>', 20,
3_600_000)`, admins exempt). A generation of 3–9 fill calls plus repairs would eat that in two runs.
So the calls of one generation run under a **lease**:

- `POST /api/transformation/lease` (new; `lib/transformation/lease.ts`, Admin SDK, Track C): input
  `{ projectId, generationToken, plannedCalls }`; checks auth, MFA, account active, project owner,
  model stage `transformation` enabled, the generation token is current; charges **one** unit of
  `gemini:<uid>`; limits leases to **3 per hour per account** (`transformation-lease:<uid>`); writes
  `projects/{id}/transformation_leases/{leaseId}` with `{ uid, budget: min(48, plannedCalls × 2 + 8),
  used: 0, inFlight: 0, expiresAt: now + 15 min }`; one open lease per project.
- `/api/gemini` accepts an optional `leaseId`. With a valid lease (same uid, not expired, `used <
  budget`, `inFlight < 4`), it skips the per-call limiter and increments `used`/`inFlight` in a
  transaction, decrementing `inFlight` when done. Without one it behaves exactly as today. The prompt
  size limit (250,000) and model allowlist apply unchanged.
- BYOK accounts: same lease (budget protects the user's own key from a runaway loop too); a 429 from
  the provider on a free-tier key backs off and continues with concurrency 2.
- The community analysis quota (`reserveRunQuota` in `/api/runs/create`) is untouched: the later
  stages do not count against it (DESIGN.md §2.8). The before-the-click line stays "No analysis run
  used · model calls on your key / the community key".

## 12. Traceability, fingerprint and the audit pack

### 12.1 Traceability

- **In the code**: every function's doc comment (§9.1).
- **`traceability.json`** in the package: `{ program, sourceSha256, contextDigest, scaffoldVersion,
  units: [{ unitId, fn, file, abap: [ranges], rules: [{ id, decision }], guards, filledBy:
  'engine' | 'model' | 'model-repair-1' | 'model-repair-2' | 'not-filled', checks: { lint, cases,
  probes } }], notCarried: [...] }`.
- **`STATUS.md`** (`lib/delivery-package.ts`): a section "How this code was built" — counts (units,
  filled, repaired, not filled), the open rules, the routines not carried over and why, the checks —
  and a table function → ABAP lines → rules → filled by.
- **Transformation UI**: the file tree groups `srv/steps/*` under their step titles in reading order;
  above a selected function's code a chip row shows `L500–L540` (links to Analyze's source column at
  those lines), the rule ids (link to the rule in the Business view) and the provenance of the body:
  *Reconstructed* for engine-written files, *Model proposal* for filled bodies (DESIGN.md §4; a fill is
  a model proposal, never *Proven*). A not-filled unit shows the *Not determined* chip with the reason.

### 12.2 Generation token and binding

`GENERATION_REVISION_VERSION` goes to **3**; the canonical form gains two lines:

```
context=<contextDigest(ctx)>       rule decisions, requirements revision, decision record, NFRs, data mode
scaffold=<SCAFFOLD_VERSION>/<plan digest>
```

`generationBinding` gains `{ path: 'engine-led' | 'single-call', contextDigest, scaffoldVersion,
scaffoldDigest, basis: ContextSlotSnapshot[] }` (written by the server in the same transaction as
today). **What invalidates a stored draft** (workflow phase `stale`, "regenerate"): a new source or
run (as today), a new design (as today), and — new — a changed `contextDigest`: a rule decision, an
accepted requirement or NFR, the decision record. The stale line names the cause from the slot
snapshot ("Generated before 3 rule decisions changed"). A changed scaffold version does **not** make
a draft stale (it is our code, not the user's input); the Transformation page says a newer scaffold
exists.

### 12.3 The signed audit pack

Unchanged. The run is signed (HMAC + Ed25519) over the engine evidence; the generated package, the
scaffold, the fills, the trace and the check results are project data, never part of a run or the
audit pack. The binding names the contract fingerprint as today. `traceability.json` names the run
id it was built from so a reader can verify that run's pack separately.

## 13. Stage 4 — Verify and targeted repair

### 13.1 Checks

| Check | Where | Input | Result per unit |
|---|---|---|---|
| Body guards | browser (`markers.ts`) | each fill answer | refused → repair |
| Lints | browser (`lib/generated-code-lints.ts`, `feat/3.0.12-lints`) | candidate files | findings mapped to units by file + line |
| Engine cases | runner (`/api/run-tests`, `mode: 'verify'`) | `test/engine-cases.json` through the call contract | failing cases → the units on their call path (trace) |
| Failure-pattern probes | runner (harness of `feat/3.0.12-acceptance`, adapter from the scaffold) | `acceptance-adapter.json` | `fail` → the unit the adapter names; `not-runnable` → finding, no repair |

Candidate packages are not stored yet, so the runner runs them as a **generation candidate**: a
`RepairDraft` with `target: 'generation'` and no parent stand (`lib/repair-draft.ts`,
`REPAIR_DRAFT_VERSION` 2), proposed through `lib/repair-draft-store.ts` and executed through the
existing draft path of `/api/run-tests` (`loadDraftForRun`). The probe harness moves from
`scripts/acceptance/child/*` into the sandbox protocol as a probe mode (Track C2).

### 13.2 Repair loop and stop rules

1. After the fills: run body guards, lints, then runner checks (one runner call).
2. Map every failure to units. Failures not mappable to a unit (scaffold code) are **our bug**: no
   model repair, a finding "scaffold check failed" and the package is stored with the finding (the
   scaffold specs should have caught it).
3. Send each failing unit back with `repair: { round, failure (≤ 2,000 chars), previousBody }`, bundled
   as in §8.3. Only failing units — never the whole package.
4. Re-run only the checks that failed (lints always; runner once per round).
5. **Stop** when: everything passes; or round 2 is done; or the lease budget is used; or a round fixes
   nothing (same failures twice). Remaining failures become findings in STATUS.md and the UI; their
   bodies are kept (a failing body is a reviewable draft) unless the body guards refused it (then the
   stub stays).
6. The existing user-driven repair (`lib/repair-draft.ts`, Testing) stays as it is for later rounds.

## 14. Before the run: raise the quality

### 14.1 What it is

Above *Generate now*, a card **"Before the run: raise the quality"** lists what the user can still do
that **changes what the generation uses**. All optional, phrased by its positive effect, each with a
deep link to the exact place and a way back. Never blocking: the primary *Generate now* is always
enabled. When nothing is open the card collapses to one line: "Everything the generation uses is
decided and current."

### 14.2 The tips — ordered by impact

Computed by `qualityTips(ctx, project)` (Track A) from the **same** sources as the context pack and
the generation screen, so tip counts, the screen's chain and the prompt cannot disagree.

| # | Tip (shown when) | Text (positive impact) | What changes in the code | Deep link |
|---|---|---|---|---|
| 1 | Design older than the latest run (`staleness(project)`) | "Bring the design up to date — the code is then built on the analysis you have now." | the design, route and requirements the pack carries | `design?origin=transformation.tips` |
| 2 | Open rules > 0 (`process_states`, rules without a decision) | "Decide the 62 open rules — each decided rule is implemented exactly as you chose (keep, change or drop) instead of copied as-is." | DROP removes guards and masks lines; CHANGE carries your proposal; trace shows your decision | `?view=business&origin=transformation.tips#business-rules` with `rules=open` |
| 3 | Functional requirements in *Draft* or *Needs clarification* (`requirementsSpec`) | "Accept the 9 proposed requirements — accepted ones are named on the functions that implement them." | requirement ids on units' doc comments; STATUS lists unaccepted ones | `design?origin=transformation.tips#requirements` (the place `design.requirements-entry` already addresses) |
| 4 | NFRs not accepted (`nonFunctionalRequirements`) | "Accept the 4 non-functional requirements — they set limits the scaffold enforces (bounds, timeouts, logging)." | NFRs in the pack; scaffold limits | the NFR section `#nfr-title` (`components/design/NonFunctionalRequirements.tsx`; Track D confirms the page that renders it) |
| 5 | Design not confirmed (phase `design` = `partial`) | "Confirm the target in Design — the scaffold is built for the confirmed route." | track (Node/CAP vs RAP) and route reason in every prompt | `design?origin=transformation.tips#design-route` |
| 6 | Decision record missing or outdated | "Record the decision — the package then names what was decided and on which evidence." | decision line in the pack and STATUS | `?view=management&origin=transformation.tips#decision-options` |
| 7 | Data mode not determined (pack `dataMode = null`) and a place to record it exists | "Say where the data comes from — reads are then written against that source." | ports and reads per data mode | the place the 3.0.11 data-mode work names; no tip if there is none |

A tip that would not change what the generation uses is not shown. Counts are read fresh on every
mount and on `visibilitychange` back to the page — no stale numbers after a round trip.

### 14.3 Addressing and the way back

Deep links use the existing choice/return addressing: a new origin key **`transformation.tips`** in
`ORIGINS` (`lib/choice-addresses.ts`) → `o(TOOL('transformation'), 'transformation-tips',
'nav.place.qualityTips')`; links are built with `stageHref`/`workspaceBackHref`
(`lib/workspace-back-href.ts`), so the target shows "Back to Transformation · Before the run" and
returns to `#transformation-tips`. Anchor ids that do not exist yet (`design-route`, the rules filter
`rules=open`, `#requirements`) are added by Track D, each with a spec. `hooks/useFollowHash.ts`
handles late-rendered targets.

### 14.4 First open and the rebuild gate

Today the first generation starts by itself when the stage is opened and nothing blocks it
(`setAwaitingAutoGeneration`). With tips, the proposal (Q5) is: **auto-start only when no tip is
open**; otherwise the page shows the tips and *Generate now*. The 3.0.13 rebuild gate, when built,
uses the same card as its one blocking item; nothing here blocks.

## 15. The generation screen

Replaces today's progress bar and log (`GenerationPhase` / `enterGenerationPhase` /
`generationProgressAt` in `lib/generation-progress.ts`, `transformationLog` rows in page.tsx). Mockup:
`docs/roadmap/transformation-generation-mockup.html` (three states: before the run, running, done).

### 15.1 Principle

The effect comes from **concrete, verifiable facts of this project, shown as they are established** —
not from claims. No comparative or superlative text ("better than other agents", "smartest") anywhere
on the screen; `tests/claims-honesty-guard.spec.ts` and `tests/no-fabricated-figures.spec.ts` are
extended to the new component. Every number comes from data and carries its level. One caption says
what is different in factual terms:

> Written from what the platform already knows about this program — not from the code alone.

### 15.2 Layout

- **Header row**: "Writing the code for ZCO_CC_CLOSE_SIMULATION" · elapsed `m:ss` (`formatElapsed`,
  real time since the click) · *Cancel* (ghost). No percentage anywhere (DESIGN.md §2.8: phases, not
  percentages that do not exist). Real denominators are shown where they exist ("14 of 35 functions
  written").
- **The chain** (left column from breakpoint L, top on phones): the tools the generation builds on, in
  workflow order, then the generation's own stages (the figures here are illustrative; the screen
  shows only figures read from the project):

  ```
  Analyze phase ─┬─ First insights   purpose, "In short" (engine)
                 ├─ Analyze          score 37 · 12 findings · 7 released successors (imported) · Level A–D of 19 objects
                 └─ Business rules   66 rules — 4 decided by you (2 keep, 1 change, 1 drop), 62 open
  Design phase  ─┬─ Design           Side-by-side (CAP) — reason · 5 components · 4 NFRs (2 accepted)
                 ├─ Requirements     23 functional (14 accepted, 9 draft)
                 └─ Decision record  Rebuild, confirmed 11 Oct (your decision)
  ────────────────────────────────────────────────────────────────────────────────
  Engine scaffold   35 functions, each anchored to its ABAP lines · 72 guards carried with rule ids ·
                    7 packed decimal fields with exact bounds · 16 inputs, one contract · 31 test cases
  Model fills       14 of 35 functions written · now: U02 Validate policy — L500–540, BR-009, BR-010
  Checks            29 lint checks, 0 open · 31 engine cases run · 10 failure-pattern probes
  Repairs           (only when needed) round 1: 2 functions rewritten
  ```

  **Slots come from `PHASES`**: the chain reads `PHASES.filter(p => p.n < transformation.n)` (Analyze,
  Design) and each phase's contribution slots from `CONTEXT_SLOTS` in `lib/transformation-context.ts`
  — `analyze: ['first-insights', 'analyze', 'business-rules']`, `design: ['design', 'requirements',
  'decision-record']`. A spec asserts that every slot's phase comes before `transformation` in
  `PHASES` and that the order matches, so the chain cannot drift and Economics (after Transformation)
  can never appear.
- **Each slot** shows: the tool name, a link back to it (opens in a new tab while a generation runs,
  labelled so; same tab before and after), its date or revision (run date, need revision, spec
  revision, decision date), its facts with the level chip — *Reconstructed* (engine), *Confirmed*
  (your decision), *Model proposal* (model), *Imported* (SAP catalogs: successors, level A–D) — and,
  when its input is **missing or stale**, a warning line in that slot with a link to fix it ("No rule
  decided yet — decide in the Business view", "Design is older than the latest run — update it").
- **The work panel** (right column from L): the units in reading order, grouped by step; each row
  `U02 Validate policy · L500–540 · BR-009 BR-010` with its state: waiting · writing · written ·
  repaired · not written (with reason). Rows that finish move to *written*; nothing animates
  continuously.

### 15.3 Motion and accessibility

- A slot "lights up" when its contribution is loaded into the context: border and icon move from
  *neutral* to its level's state in 200 ms; the connector to the next slot fills in 250 ms. Once per
  state change, never looping, never pulsing (DESIGN.md §1.7). `prefers-reduced-motion`: the end
  state of each change at once.
- Busy state of a slot: a static icon and the word "Loading…", never a spinner without text.
- **Live region** (`aria-live="polite"`), one announcement per phase, never the running counters
  (DESIGN.md §2.8): "Context loaded: 6 sources, 2 need attention." · "Scaffold written: 35 functions,
  each anchored to its ABAP lines." · "34 of 35 functions written; 1 left as a stub." · "Checks: 29
  lint checks, 0 open; 31 engine cases, 2 failed." · "Repair round 1: 2 functions rewritten; checks
  passed." · "Stored."
- Phones (S): one column, the chain as a list with only the active slot and the slots that need attention expanded; the work panel
  shows the counter and the current unit; the unit list behind "Show all 35 functions". No horizontal
  scroll at 360 px.
- Light theme only; tokens from DESIGN.md §1.1; no green except *Proven*-level evidence (none here —
  a fill is never proven) and the primary action.

### 15.4 After the run

The chain collapses into a **"Built on"** summary card above the file tree, rendered from the
`basis` snapshot stored in the binding (§12.2) — what was used *then* — with a *stale* chip on each
slot whose current state differs from the snapshot. The live screen is not shown again on reload.

### 15.5 Event contract (Track C emits, Track D renders)

```ts
// lib/transformation/types.ts
export type GenerationEvent =
  | { t: 'slot'; slot: ContextSlotKey; state: 'loading' | 'loaded' | 'missing' | 'stale'; at: number }
  | { t: 'scaffold'; units: number; guards: number; decimals: number; inputs: number; cases: number; ms: number }
  | { t: 'fill'; unitId: string; state: 'writing' | 'written' | 'refused' | 'unusable'; at: number }
  | { t: 'check'; kind: 'guards' | 'lint' | 'cases' | 'probes'; total: number; failed: number; ms: number }
  | { t: 'repair'; round: 1 | 2; unitIds: string[]; state: 'start' | 'done'; fixed?: number }
  | { t: 'fallback'; reason: string }
  | { t: 'stored' } | { t: 'failed'; message: string };
export function generationScreenModel(slots: ContextSlot[], plan: UnitPlan | null,
                                      events: readonly GenerationEvent[], now: number): GenerationScreenModel;  // pure
```

`generationScreenModel` lives in `lib/generation-screen-model.ts` (Track D), pure, so the screen is
tested server-free on recorded event sequences.

## 16. Failure modes and fallbacks

### 16.1 Inside the engine-led path

| Failure | Behaviour | User sees |
|---|---|---|
| Model refuses a unit, or the answer is unusable twice | stub stays (`NotImplementedFill`), finding | "1 of 35 functions not written: U12 — the model declined: …" in the screen, STATUS.md and the trace; Transformation phase `partial`, not `done` |
| Body fails the guards | as above after repair rounds | the guard reason |
| Lease budget used up | remaining units stay stubs | "Stopped after 48 model calls — 3 functions not written" |
| Runner unavailable | lints only; cases and probes *not run* | "Engine cases and probes not run: the test runner is not reachable. Run them in Testing." |
| Scaffold integrity check fails after splice | candidate refused, nothing stored | error strip with *Retry* |
| Store refused (token moved) | as today | as today |

### 16.2 Fallback to the single-call path

When the unit plan or the scaffold cannot be built (engine throws, more than 120 units, no routine
and no event block found, an unsupported construct for the RAP scaffold), the page runs today's
single-call generation — moved unchanged into `lib/transformation/single-call.ts` — and says so
above the result: *"Generated in one model call — the engine could not build a scaffold for this
program (reason). Functions are not anchored to ABAP lines."* The binding records `path:
'single-call'`. Rendered spec covers it.

## 17. Rollout — build plan

### Step 0 — baseline (Track C owner, ½ day, before merging anything)

`scripts/transformation/measure.ts` (from the scratch scripts; engine numbers of §10, reproducible)
and an admin-only timing log: the proxy logs per call `stage`, input chars, output chars, duration
(no content) — the first half of 3.0.14's "first, measure". Sonny runs today's generation three
times each on the four sources on dev → the baseline medians the acceptance compares against.

### Parallel tracks (four agents, own worktrees, own files)

| Track | Branch | Owns (only these files) | Depends on |
|---|---|---|---|
| **A — Context pack, slots, tips** | `feat/3.0.12-context` | `lib/transformation-context.ts`, `lib/transformation-context-slots.ts` (`CONTEXT_SLOTS`, `contextSlots`, `qualityTips`), `tests/transformation-context*.spec.ts` | — |
| **B — Unit plan, slice, scaffold, markers, trace** | `feat/3.0.12-scaffold` | `lib/transformation/{types,unit-plan,abap-slice,markers,scaffold-node,scaffold-rap,runtime-node,call-contract,trace}.ts`, `scripts/transformation/measure.ts`, `tests/transformation-{unit-plan,slice,markers,scaffold-node,scaffold-rap,trace}.spec.ts` | A's types (stub them from §5 until A lands) |
| **C — Fills, lease, verify, repair loop** | `feat/3.0.12-fills` | `lib/transformation/{fill-prompt,orchestrator,verify,lease}.ts`, `app/api/transformation/lease/route.ts`, the `leaseId` branch in `app/api/gemini/route.ts`, `TRANSFORMATION_FILL_SCHEMA` in `lib/model-response-schema.ts`, the `generation` target in `lib/repair-draft.ts` / `lib/repair-draft-store.ts`, the verify mode in `app/api/run-tests/route.ts` + `lib/test-sandbox/*` (probe mode, C2), `lib/gemini-test-stub.ts` fill answers, `tests/transformation-{fill-prompt,orchestrator,lease,verify}.spec.ts` | B's `types.ts` (§6.1 interfaces are the contract) |
| **D — Generation screen and tips (UI)** | `feat/3.0.12-screen` | `components/transformation/{GenerationScreen,GenerationChain,GenerationUnits,QualityTips,BuiltOnCard}.tsx`, `lib/generation-screen-model.ts`, `lib/generation-progress.ts` (rewritten or retired), the `transformation.tips` key in `lib/choice-addresses.ts` + its message key, the anchor ids/filters in the target pages (`design-route`, `rules=open`), in `page.tsx` **only the progress/log JSX block and its state**, `tests/generation-screen*.spec.ts`, `tests/quality-tips*.spec.ts` | A's `ContextSlot` shape and C's `GenerationEvent` (§15.5) — builds against recorded fake events |

Rules for the four: nobody edits `lib/code-draft-rules.ts`, `lib/generated-code-lints.ts`,
`lib/testing-engine-cases.ts` or `scripts/acceptance/*` (owned by the cases/lints/acceptance branches;
import only). Before pushing a moved/renamed module, `grep -rl <file> tests/` (CLAUDE.md).

### Sequential steps after the four

| Step | Owner | Content |
|---|---|---|
| **E — Integration** | one agent, after A–D are merged into the 3.0.12 line | rewrite `generateTransformation` in page.tsx onto the orchestrator; extract the single-call path into `lib/transformation/single-call.ts`; `GENERATION_REVISION_VERSION` 3 with `context`/`scaffold` lines (`lib/generation-revision.ts`) and the binding fields in the store route; `workflowSteps` stale on context digest change (`lib/workflow-steps.ts`); STATUS.md section + `traceability.json` (`lib/delivery-package.ts`, `lib/delivery-facts.ts`); file-tree grouping and chip row in the Transformation object page; the "Built on" card |
| **F — Acceptance** | agent + Sonny (real key on dev) | regenerate CO, PP, SD, PO demo (and FI where its source is available) on dev; run the harness with the scaffold's adapters plus the reviews' probe sets (CO E01–E18 + 25 scenarios, PP E01–E08/A01–A14 + 26 scenarios, SD probes, FI checks); time three runs each against the Step 0 baseline; results into CHANGELOG |
| **G — Owner look** | Sonny | the generation screen on his CO project before release (look at the pictures) |

## 18. Migration of stored drafts

- Packages stored before this change keep their binding (v2, no `path`) and are shown as today. The
  Transformation page shows one neutral line: *"Generated in one model call before 3.0.12 — regenerate
  to get functions anchored to ABAP lines and rule decisions."* They are **not** marked stale (nothing
  the user changed makes them so).
- A generation token of version 2 from a tab opened before the deploy is refused by the store (the
  canonical form changed); the page re-reads and offers *Generate now* — a one-time effect.
- Repair drafts (`repairDrafts`) of old packages stay valid: their parent digests are unchanged.
- A user-adopted repair on an engine-led package that touches engine-owned text changes the scaffold
  digest; the trace then marks the affected functions *edited after generation* instead of claiming
  they are still the engine's.

## 19. Test plan

**Server-free** (no emulator, no dev server — the parallel agents' default):

| Spec | Holds |
|---|---|
| `transformation-unit-plan.spec.ts` | the §10 unit counts for the PO demo and two synthetic sources; fold/shared/unreachable/fixture rules; budgets; >120 units refuses |
| `transformation-slice.spec.ts` | slices hold the routine, folded helpers, declarations (≤ 1,500), call sites; DROP lines masked; never another routine's body |
| `transformation-markers.spec.ts` | splice replaces only marker text; every body-guard refusal (imports, markers, unbalanced, removed guard, foreign names, length, `parseFloat`); digest detects one changed scaffold character |
| `transformation-scaffold-node.spec.ts` | the files of §6.2 for the PO demo; package.json deps = imports; no `listen` outside `server.ts`; decimal helper passes the engine-case arithmetic; CSV formula guard; run ids unique over 10,000 |
| `transformation-scaffold-rap.spec.ts` | `abap.dec(2L−1,d)` per declared field; one validation per carried guard; none for DROP; test methods per engine case |
| `transformation-call-contract.spec.ts` | the generated adapter runs green on a hand-filled PO package with the harness (`--trusted-fixture`), and red on the flawed fixture's bodies |
| `transformation-fill-prompt.spec.ts` | every prompt ≤ 14,000 chars on all fixtures; rules by decision; context ≤ 3,000 |
| `transformation-orchestrator.spec.ts` | ≤ 4 in flight; retry once; refusal → stub + finding; stop rules of §13.2; events in order |
| `transformation-context-slots.spec.ts` | slots follow `PHASES` before `transformation`; no Economics; missing/stale states; tips ordered and hidden when they change nothing |
| `generation-screen-model.spec.ts` | recorded event sequences → model; counters only from events; no percentage; announcements once per phase |
| `generation-revision.spec.ts` (extended) | v3 canonical form; context digest moves the token; old v2 tokens refused |
| `claims-honesty-guard`, `no-fabricated-figures` (extended) | the new components |

**Rendered** (emulators, one quiet production-build run at the end, CLAUDE.md):

| Spec | Holds |
|---|---|
| `transformation-engine-led.spec.ts` | seeded PO project, `gemini-test-stub` fill answers: package stored, trace in STATUS.md, chips on a function, binding v3 |
| `transformation-fallback.spec.ts` | a source the planner refuses → single-call path with the visible note |
| `generation-screen.spec.ts` | desktop, phone (360 px, no horizontal scroll), reduced motion (no transitions), live-region text count |
| `quality-tips.spec.ts` | tip → rules editor with `rules=open` → decide one → back → count reduced by one; never disables *Generate now* |
| `transformation-lease.spec.ts` | 4th lease in an hour refused; calls beyond budget refused; `/api/gemini` without lease unchanged |
| existing style guards and transformation specs | still green (run every rendered spec that opens the Transformation page before the release push) |

**Acceptance** (Step F): the CO, PP, SD (and FI) probe sets pass on regenerated packages; generation
time median of three runs per source ≤ the Step 0 baseline median on CO, PP, SD and the PO demo.

## 20. Open questions for the owner

1. **Lease limits.** One generation = one unit of the 20/hour model limit plus up to 48 calls under a
   lease; at most 3 generations per hour per account. *Recommendation: yes, as proposed* — it keeps
   the community key bounded and makes a full generation with two repair rounds possible.
2. **Demo-data routines** (PP `LOAD_DEMO` 881 lines; 8 routines in CO). *Recommendation: no model fill
   in 3.0.12* — fixture loader stub plus a STATUS line naming the reduced demo scope; the engine
   extracts the original's demo cases as cases in 3.0.16.
3. **Open rules.** *Recommendation: implement as the original and mark them open* (trace, STATUS,
   chain) — never drop or invent; the tip nudges a decision.
4. **A function the model could not write.** *Recommendation: store the package with the stub and a
   finding, phase `partial`* — a reviewable package with one honest hole is more useful than none;
   Delivery's "still needed" names it.
5. **First open of Transformation.** Today the first generation starts by itself. *Recommendation:
   start by itself only when no quality tip is open; otherwise show the tips with Generate now* — the
   tips are worthless if the run has already started.
