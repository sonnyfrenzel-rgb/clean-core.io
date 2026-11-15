# Frozen configuration for the holdout measurement of the engine 3.2.0 readings — 13.11.2026

Owner task 13.11.2026: improve the deterministic ABAP engine on the process benchmark, measurably and without
overfitting — developed on the learning halves only, every change gated behind `ENGINE_READS_320_FROM`, the test
halves measured **once**, after the last code change. This note fixes everything the holdout run uses **before
the first holdout case is opened**. After it, nothing below changes; whatever the holdout says is reported as it
comes (`docs/prozess-benchmark/BERICHT.md` §1 and §8).

## Code (branch `night/engine-320`, on top of `integrate/3.2.0` at `7c522bf4`)

| Commit | Change |
|---|---|
| `079443e3` | A call the source cannot resolve statically draws every implementation it can reach (candidate entries; `me->m( )` dispatches when a subclass redefines `m`); a candidate starts with the handlers registered at its call |
| `1a77ab95` | A screen module and a callback start with the handlers registered where the program handed over to them; `MESSAGE`/`TYPE` read in any case |
| `bdbfff40` | `CALL BADI` and `CALL CUSTOMER-FUNCTION` are service tasks into an enhancement outside this source |

| Piece | File | Blob at `bdbfff40` |
|---|---|---|
| The gate | `lib/abap/engine-reads-320-gate.ts` | `1b8e14dd48e57ec4c7233bd544ff79af80326378` |
| The skeleton | `lib/abap/process-skeleton.ts` | `4977f4157ffef1807783898b26ed70c7ca0c1984` |
| Method resolution (candidates, `dynamicDispatch`) | `lib/abap/method-resolution.ts` | `bf8d91991d83ea405878609e744c09356488742e` |
| The guard of the readings (written ABAP, none a benchmark case) | `tests/engine-reads-320.spec.ts` | `7957aac3fe0998eabbaf80fd465e3e1c0724a65e` |
| The comparator (unchanged tonight) | `tests/helpers/korpus-comparison.ts` | `f0324a754b1f3a34c8716f073b954575b981cd13` |
| The measurement (unchanged tonight) | `tests/prozess-benchmark/evaluate.ts` | `1f9c946b64cd5207ec600b86e3702414ca4b9ecb` |
| The split (unchanged since 27.09.2026) | `tests/prozess-benchmark/split.json` | `df83bff354d51da66f8f0cc25de0d6cf7cff0218` |

No case, expected answer, judge verdict or comparator was changed. `tests/prozess-benchmark/weg-b.ts` and
`manifest.json` were not touched (the evaluator rewrites `manifest.json` on every run; it is not committed).

## Measurement

One run of the evaluator per engine reading over **all 300 cases**, joined sources (`BM_CONCAT=1`, as the product
reads a program with its includes), from the worktree root:

```
KORPUS_ROOT=tests/prozess-benchmark BM_CONCAT=1 KORPUS_ENGINE_VERSION=3.1.0 npx tsx tests/prozess-benchmark/evaluate.ts --out <before.json>
KORPUS_ROOT=tests/prozess-benchmark BM_CONCAT=1 KORPUS_ENGINE_VERSION=3.2.0 npx tsx tests/prozess-benchmark/evaluate.ts --out <after.json>
```

- `KORPUS_ENGINE_VERSION=3.1.0` is the reading before tonight (the newest existing gate; `APP_VERSION` is still
  v3.0.23, so the default reading would be older than 3.1.0 and is not the baseline). `3.2.0` is the frozen code
  above. The same code runs both: the gate is what differs, which is the proof that engines below 3.2.0 read as
  before.
- The learning halves (`split.learn` + `split.w3_learn`, 150 cases) were measured after every change
  (`BM_SPLIT=learn`); their final figures are in BERICHT §8 and are **not** re-tuned by this run.
- The holdout halves (`split.holdout` + `split.w3_holdout`, 150 cases) are read from the same two result files and
  reported per wave and per style (`meta.oo`) with a 95 % Wilson interval, both readings side by side, as they
  come. No change to the engine follows from them tonight.
- Holdout measurement events so far: 28.09.2026 (W1+W2), 03.10.2026 (all), 13.11.2026 (the benchmark audit,
  aggregates only, engine on `dev`). This run is the fourth event.

## Statistical power (from `docs/prozess-benchmark/AUDIT-2026-11-13.md`)

Overall ±2 pp, wave 3 holdout ±5.5 pp, OO holdout ±7.7 pp. A learn/holdout difference below about 5.5 pp overall
(wave 3 about 10 pp, OO about 14 pp) is noise and is reported as such.
