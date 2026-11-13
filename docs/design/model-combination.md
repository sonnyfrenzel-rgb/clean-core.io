# Model combination for the business statements — study and design (13.11.2026)

Owner question (Sonny, 13.11.2026): is a **combination** of `gemini-4-hydrogen` and the product model
`gemini-3.8-flash`, each at the right thinking level per stage, clearly better in total than either model alone —
and if so, how is it built into the product?

This document holds the design. The measurements are summarised in §1 and §2; the raw material (answers, blind
judge inputs and verdicts, ledgers) lives under `scratch/model-combo/` (gitignored) with a German report
`bericht.md`. Nothing here changes what the product calls today: production stays on `gemini-3.8-flash` until the
owner decides, and every rule below is **off unless the deployment sets it**.

## 0. Verdict in four sentences

1. Per stage, the right thinking level matters more than the model: `gemini-4-hydrogen` at **MEDIUM** writes the
   statements as well as at the provider's default (84.1 % against 83.3 % equal on the seven largest learn cases),
   less technically, 28 % cheaper and 28 % faster, and never near the output bound; the product model is best at
   its **default** (it beat LOW 19:5 and MEDIUM 17:10 per statement where it answered) and loses cases only to its
   own thinking loop.
2. The one combination that is clearly better than both singles is **routing by program size plus a fallback on
   an incomplete answer** — §2 has the numbers against the corrected Hydrogen baseline.
3. An ensemble (both models answer) is not worth it: the union doubles the wrong sentences, a deterministic merge
   adds under a point for 50 % more cost.
4. The combination is two deterministic rules in `/api/gemini` (`lib/model-combination.ts`), both decided by the
   prompt's length and the answer's finish reason and by nothing a client sent; the receipt names the model that
   answered.

## 1. What was measured

**Benchmark.** The 150 learn cases of the blind ABAP process benchmark (`tests/prozess-benchmark/`, `split.json`:
`learn` + `w3_learn`), path B: the model writes one business statement per step, judged blind by content against
the frozen expected statements (1,656 of them) on the scale equal / partial / deviating / missing, with the
defects `technical`, `wrong`, `incomplete`, `redundant`. The holdout halves were not read and not touched.

**Call shape.** Exactly the product's `statements` call (`lib/business-statement-prompt.ts`, JSON mode, no
schema), through `tests/prozess-benchmark/weg-b-model.ts`: model, thinking level and output bound selectable,
every call in a ledger with its tokens and list-price cost, a cap the run refuses to cross.

**Thinking levels** (blind, one judge round per model, same judge for every level):

| `gemini-4-hydrogen`, 7 largest cases, 132 statements | equal | missing | wrong | technical | thinking tokens | median s | $/case |
|---|---|---|---|---|---|---|---|
| default (12.11.) | 83.3 % | 1.5 % | 0 | 35 | 16,634 | 72.9 | 0.179 |
| LOW | 79.5 % | 3.0 % | 1 | 18 | 5,298 | 27.4 | 0.080 |
| **MEDIUM** | **84.1 %** | **0.8 %** | 1 | 24 | 10,913 | 52.5 | 0.130 |
| HIGH | 78.8 % | 1.5 % | 0 | 43 | 16,409 | 67.3 | 0.177 |

| `gemini-3.8-flash`, 10 cases (7 largest + its 5 dropouts), 159 statements | equal | missing | dropouts | thinking tokens | median s | $/case today |
|---|---|---|---|---|---|---|
| **default (12.11.)** | 45.3 % | 44.7 % | 4 of 10 (MAX_TOKENS at 32,768 after ~200 s) | 18,977 | 141 | 0.088 |
| LOW (= no thinking on this model) | 54.1 % | 17.0 % | 0 | 0 | 20 | 0.017 |
| MEDIUM | 57.2 % | 16.4 % | 1 | 12,950 | 93 | 0.065 |

On the cases where the default answered (100 statements), the default beat LOW 19:5 and MEDIUM 17:10 head to head;
LOW's gain in the table is the dropouts it does not have. So Flash's right level for the statements is its
default, and the dropout is cured by a fallback, not by a level.

**Other stages, one probe each on the 734-line case BM-200** (indicative; the testing prompt is a stand-in for the
hook's): analyze — Hydrogen default 6,598 thinking + 6,174 output tokens, far inside 32,768; testing — Hydrogen
writes a test suite of about 16,000 output tokens against Flash's 7,900, thinking 3,400; a lower level shortens it
(LOW 8,650) but the length is the suite, not the thinking. The MAX_TOKENS the owner saw on Testing with Hydrogen
on a 1,000-line program is therefore an output-length matter of that stage (four calls per click already), not a
thinking-level matter; it is not part of this design.

## 2. The strategies, offline and live

[FILLED IN FROM THE FINAL JUDGE ROUND — see bericht.md until then]

## 3. The design

### 3.1 Two rules, one module

`lib/model-combination.ts` — pure, server-only, read by `/api/gemini` after the client's request passed the
register check:

- **Routing by size.** For a stage in `COMBINATION_STAGES` (today only `statements`), a prompt longer than
  `GEMINI_LARGE_PROMPT_CHARS` characters (default 12,500 ≈ 200 ABAP lines) is asked of `GEMINI_LARGE_PROMPT_MODEL`
  instead of the product model. The length of the prompt the route sends is the only input — never a case, a
  customer, or the content of the code.
- **Cascade on an incomplete answer.** When the first answer is not complete (`lib/model-completion.ts`:
  truncated, empty, unfinished — **not** filtered, which a second model would not change), `GEMINI_FALLBACK_MODEL`
  is asked once, with its own thinking level, under the same output bound and the same request deadline. The
  stub of the test server answers no fallback.

Both are **deployment choices**: unset, nothing changes. A named model must be in the register; a model under
evaluation (`EVALUATION_ONLY_MODELS`) may be named here — it is the operator's choice, like `GEMINI_MODEL` — and
still never a client's. The rules run **only on the platform key**: an account with its own Gemini key runs as it
asked; it chose a key, not a second model, and the second model may not be served to that key at all.

### 3.2 Thinking level per model and stage

`lib/model-thinking.ts`: `thinkingConfigFor(shape, env, { model, stage })`. A shape rule still decides first (fill
and wording think LOW); a call without a shape rule keeps the provider's default unless its model has a level for
the stage — today `gemini-4-hydrogen` → `statements` → MEDIUM. The fallback call gets the fallback model's level.

`lib/model-call-stage.ts`: the `statements` bound is 65,536, the ceiling of what the models produce. Thinking
counts against the bound; the level is what keeps a call well inside it (largest measured statements answer:
5,415 sentence tokens after 11,673 of thinking).

### 3.3 Who answered — receipt, record, marking, cost

- **Receipt.** `/api/gemini` mints the receipt over the text it returns with `modelId: answeredModel` — the model
  that actually answered: the planned model, or the fallback when it answered after an incomplete first answer.
  The claim set is unchanged; `verifyModelReceipt` and every store (`statement-proposal`, `plain-wording`,
  `process-naming`) work as before, because they bind the receipt to the text and the stage, not to a model.
- **Stage record and `answeredBy`.** `users/{uid}.modelAnswers[stage]` and the answer's `answeredBy` carry
  `answeredModel` too; Settings' "Last answered by" and the AI-generated chip's tooltip (`ProvenanceChip`,
  "Written by Google Gemini · <model>") therefore name the right model per text with no further change: the
  proposal's origin is written from the verified receipt.
- **Usage log.** Every provider call is a `gemini usage` line, the fallback's included, with its model; the line
  now carries `finishReason`, so a call that ended at the bound is visible as `MAX_TOKENS` (before, it read
  `failed: false` with 32,768 tokens and nothing more).
- **Cost line before the click.** `docProposalsCostLine(PRODUCT_GEMINI_MODEL, …)` on the Documentation page
  names the constant, not the deployment's model (`GEMINI_MODEL` and the rules above are server-side). Open:
  either `GET /api/model-stages` reports the deployment's product model and the page prints that, or the line
  says "the platform's model" and points at "Last answered by". Not in the prototype.
- **Platform budget and rate limit.** Both count requests, not provider calls; a cascade is one request with two
  calls. At the measured dropout rate (5 of 150) that is 3 % more provider calls on the stage — acceptable, and
  the usage log shows it.

### 3.4 Where the code is

| Piece | File | Guard |
|---|---|---|
| The two rules | `lib/model-combination.ts` | `tests/model-combination.spec.ts` |
| Plan, first call, cascade, `answeredModel` | `app/api/gemini/route.ts` | same spec (source pins); `byok-3021`, `model-deadline`, `model-usage-log`, `transformation-run-limits` updated to the new lines |
| Level per model and stage | `lib/model-thinking.ts` | `model-combination.spec.ts`, `transformation-run-limits.spec.ts` |
| Statements bound | `lib/model-call-stage.ts` | `model-proxy-bounds.spec.ts` |
| `finishReason` on the usage line | `lib/model-usage-log.ts` | `model-usage-log.spec.ts` |
| Evaluation harness | `tests/prozess-benchmark/weg-b-model.ts` | — |

What did **not** change: the register and `EVALUATION_ONLY_MODELS`, `productModel()` and `GEMINI_MODEL`,
`modelServable`, `PRODUCT_GEMINI_MODEL`, the receipt's claim set, the completeness rule, the lease, the deadline.

### 3.5 Switching it on

```
GEMINI_LARGE_PROMPT_MODEL=gemini-4-hydrogen     # routing by size (statements)
GEMINI_LARGE_PROMPT_CHARS=12500                 # optional; the measured default
GEMINI_FALLBACK_MODEL=gemini-4-hydrogen         # cascade on an incomplete answer (statements)
```

On `dev` first, with `scripts/check-gemini-register.mjs` green and the usage log watched for `MAX_TOKENS` lines
and fallback calls. Owner decisions before `main`: whether `gemini-4-hydrogen` leaves evaluation for this one stage
at all, the threshold, and whether the fallback alone (cheap, +2.9 points) or routing plus fallback (the full gain,
about twice the cost today, about the same from 1.1.2027) is wanted.

## 4. Not built, and why

- **Ensemble** (both models answer, merge or verifier picks): the union raises equal to 94.7 % but doubles the
  wrong sentences (18 against 6–14) and the forbidden inferences; a Hydrogen-primary deterministic merge adds
  0.9 points for 50 % more cost. A verifier call on top would cost a third model call per case.
- **Routing by case features other than size** (decision points, element count): correlated with size (0.42–0.46
  against 0.48 for lines) and no better; one threshold on the prompt length is the simplest rule that holds on
  both waves.
- **A thinking level for Flash as the dropout cure**: LOW cures the dropouts and costs 15 points where the default
  answers; a fallback is strictly better.
