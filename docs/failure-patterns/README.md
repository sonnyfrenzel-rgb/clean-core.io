# Failure-pattern library

Generated delivery packages fail in recurring ways. Four external reviews of
v3.0.10 packages (FI collection worklist, CO cost allocation, PP/MM kit
simulation, SD order cockpit; October 2026) found the same classes of error
again and again: wrong SAP identifiers, an architecture argued from a GUI file
call, guards of the original lost in the new code, binary floating point where
the original declares packed decimals, run results without a stable identity,
filters that change what is shown but not what is totalled, metadata that
contradicts itself, summaries that change meaning, integrations claimed but not
built, and tests whose labels promise more than they check.

This directory is the generic answer: a catalogue of those patterns, each with
a probe that does not depend on any one package, and the product layer that
must catch it. A test derived from the same interpretation as the generated
code shares its error; a probe derived from the pattern does not.

## Files

| File | What it is |
|---|---|
| `catalogue.json` | The data catalogue: one entry per pattern. |
| `adapters/` | Adapters that map the harness's probes onto a real package's functions. |
| `../../scripts/acceptance/run.mjs` | The acceptance harness that runs the probes. |
| `../../tests/fixtures/acceptance/` | Hand-written fixture packages: one sound, one flawed, one with a missing dependency. |
| `../../tests/acceptance-harness.spec.ts` | Server-free spec: runs the harness on the fixtures and checks the catalogue. |

## Catalogue format

Each entry in `catalogue.json` has:

- `id` — stable pattern ID (`FP-<CLASS>-<nn>`).
- `class` — one of the ten classes below.
- `title`, `description` — the pattern in our own words.
- `origin` — the case (`FI`, `CO`, `PP`, `SD`) and the finding IDs **as numbered
  in that review document** (CO and PP number their findings `F01…`, FI uses
  `F-01…`, SD uses `CC-R01…`; `E..` and `A..` are the reviews' probe IDs). The
  roadmap's 3.0.12 row numbers some CO findings differently; the review's own
  numbering is the one used here. The review documents themselves are not part
  of this repository.
- `probe` — a generic probe: `input` and `expected` behaviour.
- `layers` — which product layer must catch it:
  `engine` (deterministic evidence engine, catalog, router), `prompt` (code-draft
  and documentation rules), `lint` (deterministic checks on generated output),
  `cases` (test cases derived from the original's rules, guards and types),
  `harness` (this acceptance harness).
- `harnessProbe` — the harness probe that judges it, or `null`.

## Size by class (catalogue v1, 42 patterns)

| Class | Patterns | Judged by a harness probe |
|---|---:|---|
| identifiers | 3 | — |
| file-detector-architecture | 3 | — |
| lost-guards | 7 | FP-GUARD-03, -04, -05, -07 |
| precision | 5 | FP-PREC-01, -02 |
| run-identity | 3 | FP-RUN-01, -02 |
| compute-vs-display-scope | 4 | FP-SCOPE-01 |
| contradicting-metadata | 4 | — (static signal for FP-META-04) |
| main-path-meaning | 7 | FP-MEAN-05 |
| claimed-integration | 3 | — (static signals for FP-CLAIM-01, -02) |
| label-only-tests | 3 | FP-TEST-03 |

## Pattern index

| ID | Class | Pattern | Origin | Layers | Harness probe |
|---|---|---|---|---|---|
| FP-ID-01 | identifiers | A wrong SAP identifier is presented as the standard fit | FI F-03; CO F12; PP F10; SD CC-R31 | engine, prompt, lint | — |
| FP-ID-02 | identifiers | Known standard objects reported as unverified against a stale catalog | SD CC-R29, CC-R30; PP F10 | engine | — |
| FP-ID-03 | identifiers | An API or view is mapped by name, not by protocol, release and field meaning | PP F10; SD CC-R22; FI F-03 | engine, prompt | — |
| FP-ARCH-01 | file-detector-architecture | The route is forced by a GUI file feature | CO F13; PP F11; SD CC-R12; FI F-09 | engine | — |
| FP-ARCH-02 | file-detector-architecture | Documents of one package recommend different architectures | SD CC-R13; PP F11; FI F-04, F-09 | lint, prompt | — |
| FP-ARCH-03 | file-detector-architecture | Rebuild code is generated without a gate | SD CC-R15, CC-R03; FI F-09 | engine | — |
| FP-GUARD-01 | lost-guards | The original's policy guards are not carried over | CO F03, E03–E05 | engine, prompt, cases | — |
| FP-GUARD-02 | lost-guards | Input channels validate different contracts | CO F04, E06–E09; PP F02 | prompt, cases | — |
| FP-GUARD-03 | lost-guards | Lenient numeric and date input is accepted | CO F07, E11, E12; PP F02; FI section 5 | prompt, lint, harness | `lenient-numeric` |
| FP-GUARD-04 | lost-guards | An empty or incomplete request is reported as success | CO F07, E10; SD CC-R19 | prompt, cases, harness | `empty-selection` |
| FP-GUARD-05 | lost-guards | A write path loses the original's preconditions | SD CC-R16 | prompt, cases, harness | `negative-write` |
| FP-GUARD-06 | lost-guards | Missing, empty and zero collapse into one state | FI section 5; PP F02 | prompt, cases | — |
| FP-GUARD-07 | lost-guards | The original's CSV escaping and formula guard are lost | PP F08 | prompt, lint, cases, harness | `csv-escaping` |
| FP-PREC-01 | precision | Packed quantities computed in binary floating point | PP F01, E01, E02, E05–E07 | engine, prompt, lint, harness | `decimal-quantity` |
| FP-PREC-02 | precision | Rounding mode differs from the original's commercial rounding | CO F05, E01; SD CC-R18 | engine, prompt, lint, harness | `rounding-commercial` |
| FP-PREC-03 | precision | A ratio loses declared places and a threshold flips | CO F06, E02 | engine, lint, cases | — |
| FP-PREC-04 | precision | Date arithmetic in local time | FI section 5 | lint, cases | — |
| FP-PREC-05 | precision | Amounts without a currency and precision contract | CO F09, E15; FI section 5 | prompt, lint | — |
| FP-RUN-01 | run-identity | One global latest result instead of a run id | CO F08, E13 | prompt, lint, harness | `run-id-collision` |
| FP-RUN-02 | run-identity | Clock-based run ids collide and overwrite | PP F03 | prompt, lint, harness | `run-id-collision` |
| FP-RUN-03 | run-identity | Results and exports carry an architecture label instead of provenance | CO F10, E18; FI F-10 | prompt, lint | — |
| FP-SCOPE-01 | compute-vs-display-scope | A display filter is ignored or applied unevenly | PP F07; FI F-02 | prompt, cases, harness | `display-filter` |
| FP-SCOPE-02 | compute-vs-display-scope | A classification depends on what else was selected | FI F-01 | prompt, cases | — |
| FP-SCOPE-03 | compute-vs-display-scope | An option the original honours is silently ignored | FI section 5 | prompt, cases | — |
| FP-SCOPE-04 | compute-vs-display-scope | Selection ranges collapse to single values and defaults are lost | SD CC-R19 | prompt, cases | — |
| FP-META-01 | contradicting-metadata | Counts and states disagree across the package | SD CC-R09; PP F12; CO F15 | lint | — |
| FP-META-02 | contradicting-metadata | README and design describe files and scripts the package lacks | FI F-04, F-05 | lint | — |
| FP-META-03 | contradicting-metadata | Revisions and hand-over events are not kept apart | PP F12; CO F16 | engine, lint | — |
| FP-META-04 | contradicting-metadata | Dependencies do not follow the import graph | SD CC-R23; FI F-04 | lint | — |
| FP-MEAN-01 | main-path-meaning | Rules with different meaning are merged into one sentence | CO F01; PP F04 | engine, cases | — |
| FP-MEAN-02 | main-path-meaning | The main path is listed in the wrong order | CO F02; PP F05 | engine, cases | — |
| FP-MEAN-03 | main-path-meaning | Template text that does not fit the process | CO F03-DOC; PP F05; SD CC-R09 | engine, lint | — |
| FP-MEAN-04 | main-path-meaning | A write that changes nothing is described as a change | SD CC-R01–R03 | engine | — |
| FP-MEAN-05 | main-path-meaning | A recalculation recomputes instead of adding | SD CC-R17, CC-R07 | engine, cases, harness | `recalc-additive` |
| FP-MEAN-06 | main-path-meaning | A return code read after an unrelated statement | SD CC-R04 | engine, lint | — |
| FP-MEAN-07 | main-path-meaning | Field meaning taken from the name, not the dictionary | SD CC-R05, CC-R06 | engine | — |
| FP-CLAIM-01 | claimed-integration | An in-memory adapter claims a standard API call | SD CC-R24; FI F-04 | prompt, lint, harness | — (static) |
| FP-CLAIM-02 | claimed-integration | An event publisher in SAP's namespace with a swallowed failure | SD CC-R25; FI F-08 | prompt, lint | — (static) |
| FP-CLAIM-03 | claimed-integration | Requirements and controls invented in the design | SD CC-R14, CC-R33; FI F-06 | prompt, lint | — |
| FP-TEST-01 | label-only-tests | A test's rule label does not match what it checks | SD CC-R28 | lint, cases | — |
| FP-TEST-02 | label-only-tests | Tests confirm the implementation against itself | FI F-05; SD CC-R27; PP F06 | cases, harness | — |
| FP-TEST-03 | label-only-tests | Importing the module starts a server | CO F11, E16; PP F09; SD CC-R26 | prompt, lint, harness | `import-side-effects` |

The review-specific acceptance sets named in the roadmap (CO E01–E18 with its 25
reference scenarios, PP E01–E08 / A01–A14 with its 26 reference scenarios, the FI
checks around credit note 1900000018 and the 9 items / 4,780 EUR selection, the
SD probes) are case data, not generic probes. Where one of them is an instance
of a pattern, the pattern's `origin` names it; the scenario data itself stays
with the case, outside this repository.

## The acceptance harness

```bash
node scripts/acceptance/run.mjs <unpacked-package-dir> \
  [--adapter <file>] [--out <dir>] [--timeout <ms>] [--trusted-fixture] [--static-only]
```

It takes an unpacked generated delivery package (a Node/Express or CAP draft
with an exported engine or app factory) and writes `acceptance-report.json` and
`acceptance-report.md`: per pattern `pass`, `fail`, `not-applicable` or
`not-runnable`, with evidence. No network, no model, no install; the package's
npm scripts never run.

### Probes

| Probe | Pattern | Trap input | Expected |
|---|---|---|---|
| `import-side-effects` | FP-TEST-03 | import every mapped module with `NODE_ENV` unset | no `listen`, no connection, the import finishes |
| `rounding-commercial` | FP-PREC-02 | every amount 0.01…max (and negatives if signed) × rate % | exact decimal rounding, half away from zero |
| `decimal-quantity` | FP-PREC-01 | 0.4 − 0.1 against 0.3; 0.8 − 0.1 against 0.7; control 0.3 against 0.3 | covered |
| `run-id-collision` | FP-RUN-02, FP-RUN-01 | two runs with a frozen clock; 200 runs in a loop; A → B → get(A) | distinct ids; get(A) returns A |
| `empty-selection` | FP-GUARD-04 | an empty selection | refused or a non-success state |
| `lenient-numeric` | FP-GUARD-03 | `2026x`, `abc`, `1.9`, `NaN`, `Infinity`, empty, null; a valid control | control accepted, every malformed value refused |
| `csv-escaping` | FP-GUARD-07 | a quote with a separator, a line break, `=1+1` | constant field count, texts round-trip, formula neutralised |
| `display-filter` | FP-SCOPE-01 | the same call with and without a filter | list, totals and export cover the matching items, or the filter is refused |
| `recalc-additive` | FP-MEAN-05 | an existing value 125, a surcharge 10 | 135 |
| `negative-write` | FP-GUARD-05 | a write of −99999 (and an optional valid control) | refused |

A probe whose positive control does not hold reports `not-runnable` with the
reason (the adapter mapping is probably wrong), never a silent pass. A probe the
adapter does not map is `not-applicable`.

### Adapters

An adapter is JSON. It is the only package-specific part; it maps the probes'
roles onto the package's exported functions and fields and never contains
expected values. The harness reads `<package>/acceptance-adapter.json` or the
file given with `--adapter`.

```json
{
  "modules": { "engine": "srv/engine.mjs" },
  "probes": {
    "rounding-commercial": {
      "call": { "module": "engine", "export": "discountFor" },
      "args": ["$amount", "$rate"], "result": "discount",
      "ratePercent": "5", "places": 2, "signed": true
    },
    "negative-write": {
      "call": { "module": "engine", "export": "Orders", "construct": [], "method": "setNetValue" },
      "args": ["4711", "$value"], "refused": { "path": "success", "falsy": true }
    },
    "display-filter": { "notApplicable": "filtering happens only in HTTP handlers" }
  }
}
```

- A callable is `{ module, export }`, optionally with `construct: [args]` (a class;
  instances are shared within one probe), `factory: [args]` or `method`.
- `$name` placeholders in `args` and `rowTemplate` are filled by the probe.
- A matcher is `{ path, equals | in | notIn | truthy | falsy | gt | lt | exists }`;
  a call that throws always counts as refused.
- The fixture adapters under `tests/fixtures/acceptance/*/acceptance-adapter.json`
  map every probe and are the reference for each probe's keys.

`adapters/sd-legacy-order-cockpit.json` maps the SD package's exported functions.
It was written from the package's exported names and the review's probe
description, not by copying code, and has not been executed (see below). No
adapter exists yet for the FI, CO and PP packages: in the PP package the run id
is minted inside an HTTP handler and the quantity logic needs a complete input
dataset, so a probe cannot reach it through an exported function; FI and CO
have not been mapped. Until they are, those packages get the static scan only.

### Safety: what runs, and where

A generated package is third-party code. The harness never imports it into its
own process. Each probe runs in a separate `node` child with:

- the permission model on (`--permission`, or `--experimental-permission` on
  older Node): read access to a temporary copy of the package and to
  `scripts/acceptance/child/` only, no write access, no child processes, no
  workers, no native addons, no `process.binding`;
- `scripts/acceptance/child/net-guard.mjs` preloaded: sockets, UDP, DNS, `fetch`
  and `WebSocket` throw, and `listen` never binds but reports the attempt — which
  is how a package that starts a server on import becomes a finding instead of a
  hung harness;
- cwd in the temporary copy (symlinks and `.git` are not copied), a minimal
  environment (nothing from the caller's shell, so no tokens or keys; on Windows
  libuv adds back its fixed set of system variables such as `PATH`, `TEMP` and
  `USERNAME`),
  `NODE_ENV=test` (unset for the import probe, as CI runs `npm test`), and a hard
  timeout that kills the process;
- a per-run nonce on the result line, taken out of the environment before the
  package loads, so the package cannot print a forged verdict.

Network is the gap. Node's permission model only covers network from v25 on.
The harness self-tests whether a socket is refused under the permission flag;
only then does it execute a package on its own judgement. On older Node the
JavaScript guard is the only network barrier, which is enough for code we wrote
ourselves and not for code we did not: the harness then executes a package only
with `--trusted-fixture` (the operator's statement that it is a self-written
fixture) and otherwise reports every dynamic probe as `not-runnable` and runs the
static scan alone. A package whose imports cannot be resolved is reported as
"not runnable without its dependencies"; the harness never installs anything.

The harness detects; it does not prove against a package written to defeat it.

### Engine cases through the call contract

`scripts/acceptance/engine-cases.mjs` runs the engine cases of a package
(`test/engine-cases.json`, derived by Clean-Core.io from the original's declared
types and checks — `lib/testing-engine-cases.ts`) against the call contract the
generated code exports (`srv/engine-contract.*`: `CONTRACT`, `validate`,
`simulate`, `getRun` — `lib/engine-call-contract.ts`, code-draft rule 24). No
model-written assertion is involved: each example carries its input and the
expected outcome in machine form, the child (`child/engine-cases-child.mjs`)
calls the contract, and the parent judges (`child/engine-cases-core.mjs`). It
uses this harness's sandbox (`runChild` with `entry: 'engine-cases-child.mjs'`)
under the same execution rule; a package without the contract reads
"Not run — the code does not export the call contract", and a field the
contract marks as internal is "Not run" with that reason.

```bash
node scripts/acceptance/engine-cases.mjs <unpacked-package-dir> [--cases file] [--out dir] [--timeout ms] [--trusted-fixture] [--static-only]
```

The spec is `tests/engine-call-contract.spec.ts`, on the fixtures under
`tests/fixtures/engine-cases/` (one package that keeps the contract, one with
the reviews' defects, one without the contract).

### Static scan

Always runs, reads files only, never evaluates them. It reports a few textual
signals under the same pattern IDs — `listen` without a direct-start guard
(FP-TEST-03), a run id from `Date.now()` (FP-RUN-02), a module-level latest
result (FP-RUN-01), `Math.round(...)/100` (FP-PREC-02), `parseInt`/`parseFloat`
(FP-GUARD-03), quoting without escaping in a CSV writer (FP-GUARD-07), a success
message naming an SAP API in a file with no outbound call (FP-CLAIM-01), SAP's
own event namespace (FP-CLAIM-02), declared but unimported dependencies
(FP-META-04). A static hit is counted next to the pattern as a suspect; it never
changes a probe's verdict.

## How this relates to the other layers

The same patterns are attacked at three points, and the pattern IDs are the
shared vocabulary between them:

1. **Code-draft rules** (`lib/code-draft-rules.ts`) tell the model what not to
   generate — the `prompt` layer.
2. **Generated-code lints** (`lib/generated-code-lints.ts`) check the draft
   deterministically inside the product, before the package is handed over —
   the `lint` layer. They are the authoritative static rule set; the harness's
   static scan is a small acceptance-time subset and should not grow into a
   second copy of them. When a lint covers a pattern, it should report the
   catalogue's pattern ID.
3. **Test-case derivation** turns the original's guards, declared types and
   in-code demo cases into rule-traced cases — the `cases` layer.
4. **This harness** runs after the fact, against the unpacked package, with
   expectations that come from the pattern and not from the package — the
   `harness` layer. It is the regression net for the other three: a pattern that
   fails here was missed by the rules, the lints and the cases alike.

## Adding a pattern

1. Add the entry to `catalogue.json` with origin, probe, layers.
2. Add it to the index table above.
3. If it gets a harness probe: implement it in `scripts/acceptance/child/probes.mjs`,
   register it in `PROBE_PATTERNS` in `scripts/acceptance/run.mjs`, map it in both
   fixture adapters, and make the flawed fixture exhibit it.

`tests/acceptance-harness.spec.ts` fails when the catalogue, this index, the
probe registry and the fixtures drift apart.
