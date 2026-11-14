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
   1.1.2027. **On the holdout, measured once, the gain holds and grows: 84.6 % against 68.2 %** (the product model
   lost 13 of 150 holdout cases to its thinking loop), 8 against 15 wrong sentences, 32 s against 64 s median.
3. The one combination that adds to it is **draft and rewording**: Hydrogen MEDIUM writes the statements, the
   product model at LOW rewords them for a business reader, anchors, facts, control flow and negations guarded. On
   the learn set it was better than Hydrogen alone on 50 statements and worse on 9 (sign test p = 5·10⁻⁸), **+2.6
   points** equal (87.8 %), technical sentences 48 % → **20 %** — the weakness the owner named. **On the holdout,
   with the guard as built: +1.9 points (86.5 % against 84.6 %), 43:10 (p = 6·10⁻⁶), technical sentences 50 % →
   31 %**, +0.013 $ a case and +13 s median. On both halves it contradicted the code once more than the draft (9
   against 8 on the holdout): a code translated into the wrong business term, which a guard on words cannot catch.
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
differences within one round are read.

**The holdout, once** (owner decision 13.11.2026: "holdout first, then dev"; configuration frozen in
`docs/prozess-benchmark/MODEL-COMBO-FREEZE-2026-11-13.md` before the first call; 150 cases of `holdout` +
`w3_holdout`, 1,759 expected statements, the three variants judged blind in one round of six judges, the mapping
opened after the last verdict; the rewording here is the **guarded** one as built in §3.6):

| Holdout | equal | partial | missing | wrong | dropouts | technical | $/case today | $/case 2027 | median s | p90 s |
|---|---|---|---|---|---|---|---|---|---|---|
| Flash 3.8 default — single | 68.2 % | 16.0 % | 15.4 % | 15 | **13** (MAX_TOKENS at 32,768) | 37 % | 0.055 | 0.110 | 64.3 | 204.7 |
| **Hydrogen MEDIUM — single** | **84.6 %** | 14.1 % | 1.0 % | **8** | 0 | 50 % | 0.079 | 0.079 | **32.5** | **55.1** |
| **c  draft → guarded rewording** | **86.5 %** | 12.2 % | 1.0 % | 9 | 0 | **31 %** | 0.092 | 0.104 | 46.0 | 79.6 |
| a1 Cascade: Flash, Hydrogen on dropout | 77.9 % | 17.1 % | 4.5 % | 16 | 0 | 42 % | 0.064 | 0.119 | 64.3 | 212.6 |

Head to head per statement: Hydrogen against Flash 408:91 (p = 6·10⁻⁴⁹); rewording against Hydrogen 43:10
(p = 6·10⁻⁶); rewording against Flash 421:73. Waves: W1+W2 84.6 / 82.4 / 67.7, W3 90.4 / 89.1 / 69.2 (rewording /
Hydrogen / Flash). **The learn gain holds**: Hydrogen MEDIUM over Flash +16.4 points on the holdout (+8.0 on learn —
the product model lost 13 of 150 holdout cases to its thinking loop, 5 of 150 on learn), the rewording over the
draft +1.9 points (+2.6 unguarded on learn, +1.6 to +2.0 derived for the guard), technical sentences 50 % → 31 %
(learn 48 % → 20 % unguarded, 24–32 % derived for the guard). Wrong sentences: the rewording has one more than the
draft on both halves — on the holdout BM-041-B03, where "field shkzg equals 'H'" became "the item is a credit memo
('H')": the literal is kept, the business term is wrong. A guard on words cannot catch a wrong translation of a
code; that is the rewording's residual risk, one statement in about 1,700.

**The guard** (§3.6) on the holdout rewording: 58.5 % of the draft's sentences reworded, 41.5 % kept — rejected for
a lost fact 688, a changed control flow 621, a changed negation 275, unchanged 120, Markdown 24, an added identifier
14, a moved element 1. On the learn sample re-read with the same guard: 62.4 % reworded; the BM-076-B05 drift is
rejected (control flow).

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
- **Cost line before the click** (closed 14.11.2026). `GET /api/model-stages` reports `stageModels`: per stage,
  the model a call runs on for the account's key (`stageModelsForKey` in `lib/gemini-register.ts`) — on the platform
  key the deployment's product model (`GEMINI_MODEL`, register-checked) or the stage's model from
  `GEMINI_STAGE_MODELS`, on an own Gemini key the model the client asks for, on an own Anthropic key the one Claude
  model. The Documentation page prints `stageModels.documentation` in `docProposalsCostLine`, and the constant only
  until the answer is in. To read the proxy's own register, the register (`ALLOWED_MODELS`,
  `EVALUATION_ONLY_MODELS`) moved from `app/api/gemini/route.ts` to `lib/gemini-register.ts` — a route file may
  export nothing but its handlers; `scripts/check-gemini-register.mjs` and `tests/gemini-model-pin.spec.ts` read
  it there. Guard: `tests/stage-model-cost-line.spec.ts` (platform key, documentation on Hydrogen → the line names
  `gemini-4-hydrogen`; the report agrees with `planModelCall` for every stage).
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

What did **not** change: the register's content and `EVALUATION_ONLY_MODELS` (moved to `lib/gemini-register.ts` on
14.11., §3.3), `productModel()` and `GEMINI_MODEL`,
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

### 3.6 Draft and rewording — how c is built (built 13.11.2026, owner decision 2)

`lib/statement-rewording.ts` (pure; the browser and the store route both read it):

- **The call.** `lib/statement-proposal.ts` (`runStatementRequest`): after the draft comes back, when the
  availability says the deployment rewords, the checked draft sentences go back to the model in a second
  `/api/gemini` call under `stage: 'statements'` with the answer shape `statements-rewording`
  (`lib/model-response-schema.ts`; thinking LOW in `lib/model-thinking.ts`; **no schema**, like the draft — the
  measurement was made in JSON mode alone and the guard is the defence). The prompt is the measured one, character
  for character (`buildStatementRewordingPrompt`; `STATEMENT_REWORDING_PROMPT_VERSION` 1). A shaped call is never
  routed or cascaded (`planModelCall`, `shape`): the rewording is the product model's work by design, and its draft
  is its fallback. A rewording call that fails costs the rewording and nothing else — the draft is stored as it came.
- **The guard** (`rewordingProblem`, `mergeStatementRewording`): a rewording stands only when its anchors, element
  and (absent) uncertainty are the draft's; every number and quoted literal of the draft is in it; no identifier the
  draft did not name; one sentence of at most 400 characters, no Markdown; **the same control-flow families on
  both sides** (leave/left, exit, return — not "return code" —, stop/halt, end/terminate/finish, abort,
  skip/bypass/omit, continue/proceed/resume/go on, loop/repeat/iterate/one by one/in turn); **as many negations
  and limits** as the draft, counted per family as `lib/plain-wording.ts` counts them. Everything else keeps the
  draft's sentence, counted by reason. The one wrong sentence the measured rewording had added (BM-076-B05,
  "start-of-selection processing is exited" → "processing is stopped") is rejected by the control-flow rule;
  `tests/statement-rewording.spec.ts` holds that case and fails without the rule.
- **Store and origin.** `POST /api/projects/{id}/statement-proposal` takes `{ digest, text, receipt, rewording?: {
  text, receipt } }` — both answers **as they came back**, each with its receipt. The server verifies both under the
  statements stage and the account, merges deterministically with the guard, validates the merged answer like a
  draft (so no anchor enters that the draft did not have), and stores: `origin.provider/modelId/byok/issuedAt/
  textSha256` of the rewording call, `origin.draft` of the draft call, `rewording: { reworded, kept, rejected }`.
  Without a verifying second receipt the draft is stored as it came and nothing claims a second model. The receipt
  module and its claim set do not change.
- **Marking.** The chip's tooltip (`ProvenanceChip`, `provenanceTitle`) reads the origin: "Written by Google Gemini
  · gemini-3.8-flash, from a draft by Google Gemini · gemini-4-hydrogen"; the panel's summary says
  "(gemini-3.8-flash, from a draft by gemini-4-hydrogen, date) · 39 worded for a business reader, 5 kept as drafted".
- **Cost line.** `statementCostLine(byok, rewording)`: "Two model calls: a draft of the sentences, then their
  wording for a business reader …" where the deployment rewords. The deployment flag
  `GEMINI_STATEMENTS_REWORDING=on` reaches the browser through `GET /api/model-stages` (`statementsRewording`),
  `useModelAvailability` → `useStatementProposal` → the request's availability.
- **Measured** (§2): +0.011 $ a case today (+0.022 $ from 2027), +12 s median; with the guard as built, the stored
  learn rewordings re-read keep more of the draft than the harness's first guard did — the numbers are in
  `scratch/model-combo/bericht.md` and the holdout round measures the guarded rewording directly.

## 3.7 The model per stage, shipped through the pipeline (owner decision 13.11.2026, evening)

Owner: Hydrogen MEDIUM alone — no rewording (`GEMINI_STATEMENTS_REWORDING` stays unset) — on **all** model stages,
"robust tests on dev first", then production.

- **The switch.** `GEMINI_STAGE_MODELS=stage=model,stage=model` (`lib/model-combination.ts`, `stageModelsOf`,
  `planModelCall`): every call of a named stage runs on that model, its answer shapes included (a fill, a plain
  wording, the business layer), except `statements-rewording`. Register-checked; unknown stages and models are
  ignored; only on the platform key; the deployment's fallback still applies. The thinking level per model and
  stage comes from `lib/model-thinking.ts` (`MODEL_STAGE_LEVELS`), set per stage from its measurement.
- **Per environment, as a reviewed commit.** `.github/workflows/deploy.yml`, step `env-ctx`, writes
  `gemini_stage_models` per branch and the deploy step passes it as `GEMINI_STAGE_MODELS`. **Owner decision
  14.11.2026: production with release 3.1.0**, not a separate hotfix 3.0.24 — dev and main name the same list,
  `statements=gemini-4-hydrogen,analyze=gemini-4-hydrogen,design=gemini-4-hydrogen,documentation=gemini-4-hydrogen`
  (§5). Testing is not in it (MEDIUM left stubs; the default is the slowest, dearest call), Transformation is not
  measured, naming keeps its own model; all three run on the product model. The guard in
  `tests/model-combination.spec.ts` holds the env line, that both lanes carry exactly this list, that Testing is
  not in it and that every stage in it has a measured level. `GEMINI_MODEL` (the whole product on one model) and
  the hand-set Cloud Run variables are unchanged; nothing here needs them.
- **The register.** `gemini-4-hydrogen` stays `EVALUATION_ONLY`: a client naming it is refused as before; the
  deployment names it per stage. `scripts/check-gemini-register.mjs` reads the register unchanged;
  `tests/gemini-model-pin.spec.ts` holds the register, the evaluation set and the probe record as before.
- **BYOK accounts: unchanged.** An own Gemini key runs every stage on the model the client asked for — the account
  chose a key, not a second model, and the platform's choice does not reach that key. An own Claude key is
  untouched (its one model is set in `lib/model-providers.ts`).
- **Who answered.** Receipt, stage record ("Last answered by") and `answeredBy` carry `answeredModel`, so the
  Settings line and the AI chips name the model per stage without further change. The Documentation
  page's cost line names the stage's model from `GET /api/model-stages` (`stageModels`, closed 14.11.2026, §3.3).
- **Measured before a stage joins the dev list** (`tests/prozess-benchmark/stage-bench.ts`, §5): the product's
  own prompt and validator per stage, Hydrogen MEDIUM against the product model's setting of today, on benchmark
  cases and the starter examples; schema validity, failure and MAX_TOKENS rate, latency p50/p90, cost per call today
  and from 1.1.2027, and a blind A/B judgement where the stage's output is gradeable.

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
- **The rewording in the product**: built (§3.6) and measured on the holdout, then switched off by the owner's
  decision of the evening (Hydrogen MEDIUM alone); `GEMINI_STATEMENTS_REWORDING` stays unset.

## 5. The other stages, measured before they move (13.11.2026, evening)

**Method.** `tests/prozess-benchmark/stage-bench.ts`: the product's own prompt builders and validators per stage
(§3.7), Hydrogen against the product model at today's setting, on 40 benchmark holdout cases (drawn by hash from
`split.json`'s `holdout` + `w3_holdout`, 10 of them wave 3) plus the seven starter examples (87 to 1,000 lines) — 47
cases per stage. Hydrogen's level per stage was chosen first on 10 learn cases (blind A/B, default against MEDIUM);
the holdout then compares the product model with Hydrogen at that level, blind, one A/B verdict per case with
criteria scores and the sentences contradicting the code counted ("hard errors"). Judges: Claude Opus, two per
stage, the mapping opened after the last verdict. Rate-limit failures of the harness (HTTP 429 under too many
parallel chains) were re-run; they are not model failures and do not count.

**Level per stage** (10 learn cases, Hydrogen default against MEDIUM): analyze 6:4 for the default (p = 0.75),
hard errors 1 against 0, 49 s against 25 s; design 6:4 (p = 0.75), 6 against 5, 46 s against 33 s; documentation
5:2 with 3 ties (p = 0.45), 1 against 0, 30 s against 18 s — no difference at this size, MEDIUM a third cheaper and
faster, so **MEDIUM**. Testing 8:1 for the default (p = 0.04): MEDIUM left stubs unimplemented and assertions
empty, the default wrote usable classes — so Testing keeps the **provider's default** (`lib/model-thinking.ts`).
Plain wording keeps LOW on both models by its shape rule.

**Holdout, per stage** (47 cases; wins out of 47; cost per call; latency of the call):

| Stage | Hydrogen level | Wins H : Flash | p | Hard errors H : Flash | Valid H : Flash | $/call today H : F | $/call 2027 H : F | p50 s H : F | p90 s H : F | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| statements (§2, 150 cases) | MEDIUM | 408 : 91 statements | 6·10⁻⁴⁹ | 8 : 15 | 150 : 137 | 0.079 : 0.055 | 0.079 : 0.110 | 32.5 : 64.3 | 55 : 205 | **go** |
| analyze | MEDIUM | **40 : 7** | 1·10⁻⁶ | 2 : 7 | 47 : 45 | 0.069 : 0.026 | 0.069 : 0.053 | 25.9 : 30.7 | 33 : 42 | **go** |
| documentation (business layer) | MEDIUM | **41 : 6** | 2·10⁻⁷ | 9 : 22 | 47 : 47 | 0.060 : 0.037 | 0.060 : 0.073 | 23.0 : 48.2 | 38 : 92 | **go** |
| design | MEDIUM | not judged | — | — | 47 : 25 of 25 answered | 0.066 : 0.018 | — | 35.9 : 30.7 | 42 : 39 | **go by owner decision 14.11.**, judgement open |
| testing | default | not judged | — | — | 29 : 35 | 0.121 : 0.046 | — | 82.4 : 58.2 | 137 : 85 | **stays on the product model** (level measurement, above) |
| plain wording (shape of statements) | LOW | not judged | — | — | 29 : 14 | 0.035 : 0.010 | — | 13.0 : 13.0 | 22 : 32 | follows the statements stage |
| transformation (fills) | LOW by rule | not measured: the fill requests come out of the engine-led orchestration (`prepareEngineLed`), which this harness does not drive | | | | | | | | **no-go for now** |
| naming | — | its own model by owner decision 24.09.2026 (`gemini-3.5-flash-lite`, speed); not part of this | | | | | | | | unchanged |

What the judges saw on analyze: the winner names the program's actual rules and thresholds where the loser
paraphrases the engine's findings; Flash invented API or view names more often (7 hard errors against 2), Hydrogen
wrote the fuller as-is description (completeness 4.45 against 3.53). On documentation: Flash stated effects the code
does not have twice as often (22 against 9) and described automatic steps as people's tasks; Hydrogen tied more
statements to lines and said what the program does not do, at the cost of field names where business words belong
(readability 3.89 against 3.53 still in its favour).

**The rows without a verdict** (read from the harness's result files, no judge): every missing answer in them is
an HTTP 429 of the evaluation key — the per-minute quota under parallel chains, twice the monthly spending cap on
Testing — not a model failure, and none of the answers that came back was invalid or ended at the output bound.
Design: Hydrogen answered all 47 with a usable design; the product model answered 25 before the key was limited,
all usable; latency about equal. No blind A/B was run on design, so its "go" rests on the owner's decision of
13.11. (Hydrogen MEDIUM on every model stage the measurement allows) and on the learn-set level choice, not on a
holdout win. Plain wording is a shape of the statements stage (`plain-wording`, LOW by its shape rule) and
moves with that stage. Testing stays on the product model whatever its holdout would say: Hydrogen's usable level
for it (the default) is the slowest and most expensive call measured, and MEDIUM writes stubs.

**Shipped (owner decision 14.11.2026, "nimm Hydrogen noch mit in 3.1.0").** With release 3.1.0, dev and
production carry the same list (§3.7): `statements`, `analyze`, `design`, `documentation` on `gemini-4-hydrogen`.
The separate hotfix 3.0.24 that was to carry the statements stage alone is dropped.
