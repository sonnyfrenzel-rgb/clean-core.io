# Frozen configuration for the holdout measurement of the model combination — 13.11.2026

Owner decision 13.11.2026: the business statements on `gemini-4-hydrogen` at MEDIUM ("holdout first, then dev") and
the rewording of that draft by the product model ("build it now, together with the switch, and measure both on the
holdout in one go"). This note fixes everything the holdout run uses **before the first holdout call**. After it,
nothing below changes; whatever the holdout says is reported as it comes (`docs/prozess-benchmark/BERICHT.md` §1:
the test halves are measured once, never developed on).

## Code

| Piece | File | Blob at commit `7490827b` |
|---|---|---|
| The draft's prompt and validator (unchanged by the study) | `lib/business-statement-prompt.ts` | `4655a51de58e41c9a822028f3ad94f55aa88607b` |
| The rewording's prompt (version 1) and guard | `lib/statement-rewording.ts` | `b9a8bbca0875e63600ff2d9ff8bb5e177bfaf230` |
| Thinking level per shape, model and stage | `lib/model-thinking.ts` | `e423b8fb2da75139d2218605fdee663f21b301be` |
| Output bounds per stage | `lib/model-call-stage.ts` | `81de4404a7afcb6571089aa6c688817811e502d3` |
| The stage's model rules (not exercised by the harness; the product's path) | `lib/model-combination.ts` | `d587af9c7086d7df7f9f1c11239a3651a94d5067` |
| The harness that makes the calls | `tests/prozess-benchmark/weg-b-model.ts` | `43e2c13cc036865cefe6915d070e041b4c58e88e` |

## Calls

Three variants per holdout case, the same three the learn round judged:

| Variant | Model | Thinking | Output bound | Prompt | Schema |
|---|---|---|---|---|---|
| F — the reference | `gemini-3.8-flash` | provider default (the product's setting for the stage) | 32,768 (the product's bound when the learn Flash answers were made, 12.11.2026) | the draft prompt | none (JSON mode) |
| H — the draft | `gemini-4-hydrogen` | MEDIUM | 65,536 | the draft prompt | none (JSON mode) |
| C — the rewording | `gemini-3.8-flash` | LOW | 65,536 (irrelevant: no answer came near it) | the rewording prompt, version 1, over H's checked sentences | none (JSON mode) |

Guard of C as committed above: anchors, element and absent uncertainty the draft's; every number and quoted literal
kept; no identifier added; one sentence of at most 400 characters, no Markdown; the same control-flow families
(leave, exit, return, stop, end, abort, skip, continue, loop); as many negations and limits per family; an
unchanged sentence counts as the draft's. Everything else keeps the draft's sentence.

Transport: direct `generateContent` with `GEMINI_API_KEY`, three calls in parallel, retries only on transient
errors (as the product retries), every call in the ledger at list price (Flash 0.75/3.75, Hydrogen 1.50/7.50 USD per
million input/output tokens; from 1.1.2027 Flash 1.50/7.50).

## Cases and judging

- Holdout cases: `split.json` (blob `df83bff354d51da66f8f0cc25de0d6cf7cff0218`) `holdout` (100) + `w3_holdout` (50) = 150 cases, listed in
  `scratch/model-combo/ids-holdout.txt` (sha256 `bfbf40807c71b2f0…`). No overlap with the learn set. Their expected answers
  were not read before the runs and are read only by the judge-input builder after them.
- Judging: one blind round, three variants side by side, letters per case from
  sha256("model-combo-holdout-2026-11-13:" + id), six judges of the same model (Claude Opus) with the brief
  `scratch/model-combo/judge-levels/brief.md` (sha256 `f22c54553bb120de…`), the mapping opened after the last verdict —
  the same procedure as the learn round of today.
- Reported as it comes: equal, partial, deviating, missing per variant; sentences contradicting the code; dropouts;
  technical share; cost per case today and from 2027; latency median and p90; the guard's tally (reworded, kept,
  rejected by reason).

## Deployment settings these variants correspond to

```
GEMINI_LARGE_PROMPT_MODEL=gemini-4-hydrogen   # the statements stage on Hydrogen (MEDIUM by lib/model-thinking.ts)
GEMINI_LARGE_PROMPT_CHARS=0                   # every prompt of the stage
GEMINI_STATEMENTS_REWORDING=on                # the rewording (variant C); off = variant H
```
