# Model combination for the business statements — study and design (13.11.2026)

Owner question (Sonny, 13.11.2026): is a **combination** of `gemini-4-hydrogen` and the product model
`gemini-3.8-flash`, each at the right thinking level per stage, clearly better in total than either model alone —
and if so, how is it built into the product?

This document holds the design. The measurements are summarised in §1 and §2; the raw material (answers, blind
judge inputs and verdicts, ledgers) lives under `scratch/model-combo/` (gitignored) with a German report
`bericht.md`. Nothing here changes what the product calls today: production stays on `gemini-3.8-flash` until the
owner decides, and every rule below is **off unless the deployment sets it**.

## 0. Verdict in five sentences

1. Per stage, the right thinking level matters more than any combination: `gemini-4-hydrogen` at **MEDIUM** writes
   the statements as well as at the provider's default (84.1 % against 83.3 % equal on the seven largest learn
   cases), 33 % cheaper (0.074 $ a case), 2.4× faster (30 s median) and never near the output bound; the product
   model is best at its **default** (it beat LOW 19:5 and MEDIUM 17:10 per statement where it answered) and loses
   cases only to its own thinking loop.
2. Against that corrected baseline, judged in one blind round over all 150 learn cases, Hydrogen MEDIUM alone beats
   the product model by **8.0 points** equal (85.2 % against 77.2 %), with half the sentences that contradict the
   code (5 against 10) and no dropout (0 against 5) — at 0.074 $ against 0.052 $ today and against 0.103 $ from
   1.1.2027.
3. The one combination that adds to it is **draft and rewording**: Hydrogen MEDIUM writes the statements, the
   product model at LOW rewords them for a business reader, anchors and facts guarded. It is better than Hydrogen
   alone on 50 statements and worse on 9 (sign test p = 5·10⁻⁸), **+2.6 points** equal (87.8 %), and it cuts the
   technical sentences from 48 % to **20 %** — the weakness the owner named. It costs +15 % (0.085 $; 0.096 $ from
   2027, still under the product model's 0.103 $), +13 s median, and it contradicted the code once more than the
   draft (6 against 5: one rewording turned "start-of-selection is left" into "processing ends").
4. Routing by program size, the offline front-runner against yesterday's Hydrogen, adds **0.8 points** over Hydrogen
   MEDIUM alone at the same cost today and a higher one from 2027; a cascade on the product model's dropouts adds
   2.8 points to the product model and stays 5 points under Hydrogen alone; an ensemble is not worth it (§4).
5. The mechanics are two deterministic rules in `/api/gemini` (`lib/model-combination.ts`), decided by the prompt's
   length and the answer's finish reason and by nothing a client sent, with the receipt naming the model that
   answered; the rewording step is designed in §3.6 and measured, but not yet built into the product.

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

**Offline first** (no new call): yesterday's verdicts for the product model and Hydrogen at its default, unblinded
per statement, give every strategy's ceiling and cost. Oracle per statement 95.0 % equal; oracle per case 92.9 %;
a cascade on dropout 87.7 % (+2.9 on Flash, 5 of 150 cases); routing by lines > 200 plus the cascade 91.0 % at
0.097 $; union of both answers 94.7 % equal but 18 wrong sentences; Hydrogen-primary merge 89.3 % at 0.162 $. The
advantage of Hydrogen grows with the program (correlation 0.48 with the line count), so routing by size looked like
the winner — against a Hydrogen that was still at the wrong level.

**Live** (the corrected baseline): Hydrogen rerun at MEDIUM on all 150 learn cases (150 of 150 `STOP`, 0 at the
bound, 6,555 thinking tokens a case against 11,165); the product model's answers of 12.11. reused, since its right
level is the one they were made with; the rewording pass over the rerun; all three judged blind, side by side, in
one round (1,656 statements, six judges, mapping opened after the last verdict). Combinations are built from the
three variants by the signals the product has: the answer's completeness, the prompt's length.

| Strategy | equal | partial | missing | wrong | dropouts | technical | $/case today | $/case 2027 | median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|---|
| Flash 3.8 default — single | 77.2 % | 15.0 % | 7.5 % | 10 | 5 | 41 % | 0.052 | 0.103 | 72.5 | 180.5 |
| **Hydrogen MEDIUM — single** | **85.2 %** | 13.0 % | 1.6 % | **5** | 0 | 48 % | 0.074 | 0.074 | **30.3** | **50.3** |
| **c  Hydrogen MEDIUM draft → Flash LOW rewording** | **87.8 %** | 10.3 % | 1.6 % | 6 | 0 | **20 %** | 0.085 | 0.096 | 43.5 | 73.7 |
| a1 Cascade: Flash, Hydrogen on dropout | 80.0 % | 15.6 % | 4.2 % | 10 | 0 | 42 % | 0.055 | 0.106 | 72.5 | 180.5 |
| a0 Cascade: Flash, Flash LOW on dropout (retry verdicts from the level round) | 78.9 % | — | 4.7 % | 10 | 0 | — | 0.052 | 0.104 | 72.5 | 180.5 |
| b+a1 Routing prompt > 12,500 chars → Hydrogen, else Flash + cascade | 86.0 % | 12.1 % | 1.8 % | 5 | 0 | 42 % | 0.075 | 0.099 | 43.8 | 137.9 |
| b+a1 Routing prompt > 10,000 chars | 86.1 % | 12.1 % | 1.7 % | 5 | 0 | 44 % | 0.077 | 0.096 | 41.8 | 135.8 |
| b+a1+c Routing > 12,500 → Hydrogen + rewording, else Flash + cascade | 86.5 % | 11.5 % | 1.9 % | 6 | 0 | 25 % | 0.084 | 0.116 | 60.8 | 143.2 |
| Oracle per case over the three variants (ceiling) | 89.8 % | 8.9 % | 1.3 % | 3 | 0 | 42 % | 0.074 | 0.096 | 41.9 | 123.8 |

Head to head per statement: Hydrogen MEDIUM against Flash 244:91 (p = 3·10⁻¹⁷); rewording against Hydrogen 50:9
(p = 5·10⁻⁸); rewording against Flash 253:62. Both waves agree: W1+W2 88.3 / 85.1 / 78.5, W3 86.9 / 85.5 / 74.6
(rewording / Hydrogen / Flash). The rewording kept the draft's sentence for 13 % of the statements (guard: anchors,
element, every number and quoted literal, length) — most in cases whose sentences carry many literals.

This judge round is stricter than yesterday's (the same Flash answers scored 84.8 % then, 77.2 % now); only
differences within one round are read. **The holdout was not spent**: the rule asks for a strategy that clearly
beats both singles — at least about 3 points and fewer wrong sentences than the better single — and the rewording
is +2.6 points with one wrong sentence more. The owner decides whether to measure it there once (about 13 $ of
calls plus a judge round).

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

What the measurement supports, in the order of gain:

```
# (1) the statements stage on Hydrogen MEDIUM, every other stage on the product model — +8 points, 0.074 $
GEMINI_LARGE_PROMPT_MODEL=gemini-4-hydrogen
GEMINI_LARGE_PROMPT_CHARS=0                      # 0 = every prompt of the stage

# (2) alternatively, while the product model keeps the stage: Hydrogen on its dropouts — +2.8 points, +0.003 $
GEMINI_FALLBACK_MODEL=gemini-4-hydrogen
```

Routing by size (`GEMINI_LARGE_PROMPT_CHARS=12500`) stays possible and is not recommended: +0.8 points over (1) at
the same cost today and 0.099 $ from 2027. On `dev` first, with `scripts/check-gemini-register.mjs` green and the
usage log watched for `MAX_TOKENS` lines and fallback calls. Owner decisions before `main`: whether
`gemini-4-hydrogen` leaves evaluation for this one stage at all; (1) or (2); and whether the rewording (§3.6) is
built.

### 3.6 Draft and rewording — how c is built (designed, measured, not yet in the product)

The measured step: the validated statements of the draft go back to the product model at LOW with the source and
the rule "say it for a business reader, keep every fact, keep anchors, element and uncertainty as given, one
sentence per sentence" (`buildRewritePrompt` in `tests/prozess-benchmark/weg-b-model.ts`); the answer is read
sentence by sentence, and a rewording that moved an anchor, dropped a number or a quoted literal, or grew past the
bound keeps the draft's sentence (`mergeRewrite`). In the product:

- **Where.** The browser, in `lib/statement-proposal-client.ts`: after the statements call comes back complete, a
  second `/api/gemini` call under `stage: 'statements'` with a new answer shape `statements-rewording`
  (`lib/model-response-schema.ts`: a schema of `{ statements: [{ text, anchors, element, uncertainty }] }`;
  `lib/model-thinking.ts`: LOW, as `plain-wording`). The route needs no new logic beyond the shape; the plan of §3.1
  applies to the draft call only (`COMBINATION_STAGES` by shape: the rewording shape is never routed, never
  cascaded — its draft is the fallback).
- **The guard** moves from the harness into `lib/statement-rewording.ts` (pure): anchors as a set, element,
  uncertainty, every number and quoted literal, length — **plus one rule the measurement asked for**: a rewording
  that introduces a control-flow word the draft did not have (`ends`, `terminates`, `stops`, `exits`, `aborts`,
  `is skipped`) keeps the draft's sentence. The one wrong sentence the rewording added (BM-076-B05) was exactly
  that: "start-of-selection is left" became "processing ends". The same guard reads the draft's negations the way
  `lib/plain-wording.ts` does ("not", "only", "without", "unless").
- **Store and origin.** `POST /api/projects/{id}/statement-proposal` takes `{ digest, text, receipt, draft? }`: the
  final text with the rewording call's receipt (it wrote these bytes; `textSha256` binds it), and the draft's
  receipt as a second verified receipt of the same stage and account. `StatementProposalOrigin` gains
  `draft?: { provider, modelId, textSha256, issuedAt }`, written only from a verifying receipt. The receipt module
  and its claim set do not change.
- **Marking.** `ProvenanceChip`'s tooltip reads the origin: "Written by Google Gemini · gemini-3.8-flash, from a
  draft by Google Gemini · gemini-4-hydrogen" when `draft` is present. Settings' "Last answered by" names the model
  of the last call, as it does.
- **Cost line.** The button's line (`lib/statement-proposal.ts`, `STATEMENT_PROPOSAL_COST_*`) says "Two model
  calls" when the deployment rewords; the deployment flag `GEMINI_STATEMENTS_REWORDING=on` reaches the browser
  through `GET /api/model-stages` (one boolean beside `keySource`).
- **Cost and time.** Measured: +0.011 $ a case today (+0.022 $ from 2027), +12 s median; the draft at Hydrogen
  MEDIUM is 30 s, so the business sentences arrive in about 45 s where the product model alone takes 72 s today.

## 4. Not built, and why

- **Ensemble** (both models answer, merge or verifier picks): the union raises equal to 94.7 % but doubles the
  wrong sentences (18 against 6–14) and the forbidden inferences; a Hydrogen-primary deterministic merge adds
  0.9 points for 50 % more cost. A verifier call on top would cost a third model call per case.
- **Routing by size** against a Hydrogen at its right level: +0.8 points at the same cost today and a higher one from
  2027, p90 latency 138 s instead of 50 s — the product model's slow tail stays in. The mechanism is kept (it is the
  stage switch with threshold 0) and the threshold is not recommended.
- **Routing by case features other than size** (decision points, element count): correlated with size (0.42–0.46
  against 0.48 for lines) and no better.
- **A thinking level for Flash as the dropout cure**: LOW cures the dropouts and costs 15 points where the default
  answers; MEDIUM cures 4 of 5 and costs 7; a fallback is strictly better.
- **The rewording in the product**: designed above, measured on the learn set, not built — the store, the origin,
  the chip and the cost line are four more files, and the owner decides first whether the stage leaves the product
  model at all.
