# QA agent — the review loop on `dev`

**as of 15.09.2026 · introduced with v2.9.12 · runs from now on with every push to `dev`, until Sonny revokes it**

Every new state on `dev` gets two checks, without anyone triggering them:
a **delta review** through OpenRouter's Auto Router (since 01.10.2026; before, a pinned
model — GPT-6 Luna via OpenRouter) and a **smoke check** of the revision that the same push deployed.
Every version on `main` additionally gets a **full review of the whole code** by
the top model of the 5.6 series, GPT-5.6 Sol (§10) — until 01.10.2026; since then see below. Model choice by Sonny on
15.09.2026; until then GPT-6 Astra checked the deltas. On 22.09.2026 the
delta reviewer switched to **GPT-6 Luna** (also Sonny): same context of
1.05 M tokens, half the price.
The findings go sealed to the maintainer — Claude Code —, who checks each one,
fixes confirmed ones, files refuted ones with a reason and pushes again. `main` is
only asked for once the loop is clean.

> **Model routing since 01.10.2026 (owner decision).** No model is pinned any more. Every
> request goes to OpenRouter's Auto Router (`model: 'openrouter/auto'`), which picks the
> model per call. The agent decides only the cost band and the ceiling
> (`scripts/qa/lib/config.mjs` `ROUTER`):
>
> | Review | Cost tier | Price ceiling (`provider.max_price`, USD per M tokens) | Cap |
> |---|---|---|---|
> | Delta on `dev` | `high` | $1.50 input / $4.50 output | **$6.50** per push (was $3.80; output 96,000 tokens since 01.10.2026) |
> | Full review on `main` | `xhigh` | $3 input / $15 output | $10 per release (unchanged) |
>
> Every request also carries `provider: { data_collection: 'deny', require_parameters: true,
> allow_fallbacks: false }`. The pre-call estimate is made at the ceiling, so OpenRouter can
> serve no endpoint that costs more than the estimate; what counts against the cap is the
> actual `usage.cost`. At the delta ceiling all ten batches fit under 80 % of the cap, so
> the budget never sticks the checkpoint; the full review at `xhigh` is ended by the cap,
> not the call count (about 22 of 28 batches at the prices the router chose in the probes),
> and names what it did not read. Every sealed report records the models that answered
> (`meta.models`), and the step summary and `await.mjs` print them. A change in findings
> between two reports can now also be a change of reviewer. The model names below
> (GPT-6 Luna, GPT-5.6 Sol and their prices) describe the period before 01.10.2026.


---

## 1. Architecture

```
 git push dev ──┬──────────────────────────────────────────────► deploy.yml (Build, Tests, Cloud Run)
                │                                                         │
                ▼                                                         │
   qa-review.yml ── job review ─────────────────────────┐                 │
                │   1. fetch the previous sealed report                   │
                │   2. delta since the last reviewed commit               │
                │      (no checkpoint: everything that is not on main)    │
                │   3. pre-check without tokens (risk, test signals,      │
                │      acceptance criteria, secret redaction)             │
                │   4. batches by risk, estimated cost budget             │
                │   5. Auto Router (high), strict answer, no tools        │
                │   6. seal the report → artifact qa-review-<sha>         │
                │                                                         ▼
                └── job smoke ── waits for deploy.yml of the same commit ─┘
                    checks /api/health (commit), routes, security headers
                    seal → artifact qa-smoke-<sha>

 Claude Code (local) ── node scripts/qa/await.mjs <sha>
                    downloads both artifacts, unseals into .qa-review/ (git-ignored)
                    exit 0 = go · 3 = work · 2 = no result (also: nothing read)
                    → verify → fix / refute → push dev → next round

 git push main ── qa-review.yml ── job full (§10)
                    whole code of the release commit, in batches, Auto Router (xhigh)
                    seal → artifact qa-full-<sha> · gates nothing
 Claude Code (local) ── node scripts/qa/await.mjs <sha> --full → verify → step on dev
```

| Component | File | Task |
|---|---|---|
| Configuration | `scripts/qa/lib/config.mjs` | model, budgets, path filters, risk rules, smoke targets — the only place for all of that |
| Delta | `scripts/qa/lib/git-delta.mjs` | range, changed files, hunks with 12 lines of context, callers of changed symbols outside the delta |
| Pre-check | `scripts/qa/lib/triage.mjs` | risk tags, test-weakening signals, cited acceptance criteria, "code without test" |
| Redaction | `scripts/qa/lib/redact.mjs` | replace key patterns before sending, report hits as a critical finding |
| Packing | `scripts/qa/lib/pack.mjs` | riskiest files first, at most 10 calls (full review: 28), earlier calls are filled up before a new one starts; a diff over 60,000 characters goes in parts at hunk boundaries and only counts as read once all parts are read; the rest named as "not reviewed", per part; the cost budget applies before every call |
| Full review | `scripts/qa/full-review.mjs`, `lib/full.mjs` | all reviewable files of the release commit with line numbers and a file overview; a failed batch does not cost the others (§10) |
| Prompt | `scripts/qa/lib/prompt.mjs` + `docs/qa/reviewer-brief.md` | answer schema; role, checklist and project rules as a readable document; carried-over findings and refutations only for the files of the respective batch |
| Model call | `scripts/qa/lib/openrouter.mjs` | one endpoint, no tools, no fallback models, `data_collection: deny`, retry only on 429 — what might already have been generated is never paid for a second time |
| Report | `scripts/qa/lib/report.mjs` | fingerprints, carry-over of open findings, refuted ones not carried over (re-raised ones remain, marked), `no_review` for a run that read nothing, public line without content |
| Seal | `scripts/qa/lib/crypto.mjs`, `lib/store.mjs` | AES-256-GCM under `QA_REVIEW_KEY` |
| Entry points | `scripts/qa/review.mjs`, `smoke.mjs`, `await.mjs`, `refute.mjs` | CI review, CI smoke, local fetch, refute |
| Workflow | `.github/workflows/qa-review.yml` | triggers, permissions, revocation, artifacts |
| Guardrails in the test | `tests/qa-review-guard.spec.ts` | seal, no leaks, read only, cost budget, delta, report, weekly check |
| Claude's way of working | `.claude/skills/qa-review-loop/SKILL.md` | only loaded when the loop is due — otherwise costs no context |

---

## 2. Guardrails

**The agent may:** read the repository's code, send the delta to a pinned
model, upload a sealed report as an artifact, fetch the
public pages of the dev revision.

**The agent may not — and cannot:**

| Prohibition | What technically rules it out |
|---|---|
| Change, commit, push code | token with `contents: read`; `persist-credentials: false`; the model has no tools |
| Create comments, issues, PRs | token without `issues`/`pull-requests`; a guard checks that the workflow contains no `gh issue/pr` and no `git push` |
| Deploy, start workflows | token with `actions: read`; no cloud credentials in the job |
| Make findings public | report and smoke result sealed; the log only says "completed, sealed", model calls and costs — **no verdict, no counts per severity** |
| Pass on secrets | redaction before sending; files like `.env*`, `*.pem`, service account JSON are never read; error output only as a message, never stack or response body |
| Use a different model | model ID in exactly one place, `allow_fallbacks: false`; a guard checks both |
| Spend money without limit | estimated budget per review, checked before every call against what was actually spent; only a 429 is retried; the hard limit is the credit limit on the OpenRouter key |

**Why no numbers in the log:** The repository and its Actions logs are
public, and the dev revision is publicly reachable. "1 critical on dev" in
a public log tells an attacker when it is worth looking.

**Prompt injection:** Everything in the delta is data for the model, not an instruction (it says so
in the brief). Even a successful attempt can only produce a false finding —
and no finding is implemented unchecked (§4).

---

## 3. Costs

**Since 01.10.2026** (`scripts/qa/lib/config.mjs`): the delta review goes to the Auto Router
(`openrouter/auto`, cost tier `high`, price ceiling $1.50 input / $4.50 output per M tokens)
with a cap of **$6.50 per push**, at most 10 calls of 200,000 characters and **96,000 output
tokens** each. The full review on `main` uses cost tier `xhigh` (ceiling $3 / $15) with a cap
of **$10 per release**, at most 28 calls of 400,000 characters and 48,000 output tokens each.
Every estimate is made at the ceiling, so the cap is what ends a review, not the call count.

*Before 01.10.2026:* delta review with GPT-6 Luna, list price at OpenRouter on 22.09.2026:
$0.10 per M input tokens, $0.50 per M output tokens — a hundredth of GPT-6 Astra
($10 / $50), with which the deltas were reviewed until 15.09.2026, and half
of GPT-5.6 Luna ($0.20 / $1.20), which stood in this place until 22.09.2026.
The full review on `main` cost $2 / $10 with GPT-5.6 Sol (§10) and deliberately
did not move along: switching both reviewers in one step would have left no fixed
point against which a deterioration can be compared. The cap was $0.50 per review and
no longer bound at those prices (a full call estimated at around $0.022); what ended a
review was `maxBatches` alone.

| Measure | Effect |
|---|---|
| Only the delta since the last *reviewed* commit — without a checkpoint, everything that is not yet on `main` | no full review; an aborted or failed run loses nothing |
| No model call without code in the delta | pure docs/asset pushes cost $0 |
| 12 lines of context per hunk, at most 15 symbols × 3 callers | context instead of whole files |
| Carried-over findings and refutations go only to the batch that contains their file (long fields capped, the rest as a count); their characters count towards that file (since 18.09.2026) | the part that every batch repeats no longer grows with the register. Before, every batch carried all 262 open findings and 97 refutations — 201,461 characters of shared part at 200,000 per call, so no call. The register itself stays complete: a finding whose file no batch contains stays open and carried over, and a batch can only resolve what it was shown |
| Reasoning `medium`, only for security/trust chain/CI `high` | expensive thinking where an error is expensive |
| At most 10 calls, 200,000 characters and 96,000 output tokens (reasoning included) per call (since 01.10.2026; before: 4 calls and 32,000 output tokens) | ceiling of the request. Until 15.09. it was 2 calls at $2.50 — large deltas came back incomplete and cost another round |
| **Budget $6.50 per push — estimated at the price ceiling, not a hard limit** (since 01.10.2026; before: $0.50). Before every call: actually spent + estimate of this call (3.5 characters per token, answer schema included, full output) | a call that would break the budget according to this estimate does not take place; its files appear as "not reviewed" in the report. Very token-dense text can push a single call beyond that — **the hard limit is the credit limit on the OpenRouter key** |
| Actual costs from OpenRouter's usage record | appear in every report and in the log — if a figure is missing, it says "unknown", never $0 |

Measured on 15.09.2026: the review of v2.9.12 (24 files, one call, reasoning
`high`) **$0.81**, that of v2.9.13 **$1.28** actually; the advance estimate calculates
the full output of 32,000 tokens and was at $1.92. It is cautious, but not a
guaranteed ceiling. **Recommendation: a monthly limit directly on the OpenRouter key**
— that is the only hard limit.

---

## 4. The loop — what Claude Code does with the result

The binding work instruction is in the skill `qa-review-loop`; here are the rules
against which it is measured.

1. **After every push to `dev`** `node scripts/qa/await.mjs <sha>` starts in the
   background. A hook in `.claude/settings.json` reminds of it. **The review comes
   first** (since 16.09.2026): as soon as the review job is done — one to two minutes
   after the push — `await.mjs` prints the findings and ends with exit 3, while the
   deploy is still running; the smoke check of the commit, which the next push replaces
   anyway, decides nothing. Only after a clean review does it keep waiting for
   the smoke check, because then it is the only thing still to be decided.
2. **Every finding is checked before anything is changed** — read the cited place,
   trace the failure case, reproduce it if possible. Model findings
   are hypotheses (of ~20 Grok findings in August, 2 were wrong).
3. **Confirmed → fix**, within the scope of the finding and not beyond; with a test
   that fails without the fix. A simplification is only adopted if the
   existing tests cover the behaviour.
4. **Refuted → `node scripts/qa/refute.mjs <fingerprint> "<reason with evidence>"`**
   and commit the sealed list. The reviewer does not bring it back.
5. **Never** weaken a test, switch off a check or suppress a
   warning to make a finding disappear.
6. **Push the corrections to `dev`** → next round over exactly this delta.
7. **End:** no open finding `critical`/`high`/`medium` and smoke green — or
   **three rounds** for the same step. Then the remainders are in the report to Sonny.
   Exception: a `medium` in the agents' own machinery (`scripts/qa|security|ux`,
   their workflows, skills, guard specs — `AGENT_INFRASTRUCTURE` in `config.mjs`) does not hold up the
   loop; it is reported and fixed in a step of its own.
8. **`main` only on Sonny's go**, and only after a clean round.

`low` does not hold up the loop. Cheap `low` findings are taken along, the
rest is in the step report.

**Three rules the agent has learned from its own reviews (15.09.2026):**

- **An incomplete review is not a "go".** If code remained unread — cost budget,
  batch limit, an unread part of a large diff —, the report is called `INCOMPLETE`,
  the loop stays open, and the checkpoint stays put: the next review reads the
  skipped code again instead of starting behind it. Until 18.09.2026 a diff over
  60,000 characters was cut off; with that, every range with such a commit stayed incomplete forever
  (`b64818a`, `d53530c`), and the checkpoint did not get past `a19945e`.
  Since then it is read in parts.
- **A review that read nothing has no verdict** (since 18.09.2026). The reviews of
  `5f84bb2`, `9edb37f`, `e3817ce` and `c812085` made zero model calls and were still called
  `go_with_notes`. Such a report is now called `no_review`, the checkpoint stays put, and
  `await.mjs` ends with exit 2 and prints only the header and cause, not the carried-over findings.
  Only a delta without reviewable code (pure docs/assets) gets by without a call and stays `go`.
- **A refutation applies to the finding it was written about** — to the
  raising before it, not to a later one. If the reviewer raises it again after a regression,
  it stays open and marked until it is fixed or refuted anew.
- **The starting point of a review** is the last reviewed checkpoint if it is an
  ancestor of the head — otherwise everything that is not yet on `main`. The `before`
  of the push is never taken; only a manual run may specify a base.

**Fewer rounds at the same quality (Sonny, 15.09.2026, proposals A–C):** Most
rounds until then went back to three causes, not to product errors.

- **A — Agent machinery does not block with `medium`** (see point 7).
- **B — Hypothetical legacy data is `low`.** A failure case that needs data that no
  current code path produces is at most `low`, unless the reviewer names the writer,
  the migration or the import that produces it today (`docs/qa/reviewer-brief.md`).
- **C — Path and file names are not secrets.** A name ending in `_PATH` or `_FILE`
  no longer triggers the redaction's name rule; a real key under such a
  name is still recognised by its shape.

---

## 5. Revocation

```bash
gh variable set QA_REVIEW_ENABLED --body false   # stops both jobs and the local loop
gh variable delete QA_REVIEW_ENABLED             # schaltet sie wieder ein
```

The workflow checks the variable in both jobs, `await.mjs` before waiting. A
switch-off takes effect immediately; nothing else has to be changed.

---

## 6. Setup

| Secret | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | GitHub secret, `.env.local` | model call |
| `QA_REVIEW_KEY` | GitHub secret, `.env.local` — **same value** | seal and unseal; at least 32 characters, random |

**Hook on a new machine.** Skill (`.claude/skills/qa-review-loop/`) and
hook script (`.claude/hooks/after-push.mjs`) are versioned; the registration
is in the local, unversioned `.claude/settings.json`:

```json
"hooks": { "PostToolUse": [ { "matcher": "Bash|PowerShell", "hooks": [
  { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/after-push.mjs\"", "timeout": 15 }
] } ] }
```

Rotating the key: write the new value into both places. Older reports can
no longer be opened afterwards and are skipped during carry-over; the sealed
refutation list has to be opened with the old key and rewritten with the new one.

---

## 7. Manual operation

```bash
node scripts/qa/review.mjs --dry                            # delta, pre-check, batches, estimated cost — no call
QA_BASE_OVERRIDE=<sha> QA_HEAD=<sha> node scripts/qa/review.mjs --dry  # for a specific range
node scripts/qa/review.mjs --local                          # real review locally (costs money), plaintext to .qa-review/out/
node scripts/qa/await.mjs <sha> --timeout=60                # fetch the result of a pushed commit
node scripts/qa/refute.mjs <fingerprint> "<reason>"         # file a refuted finding
gh workflow run qa-review.yml --ref dev -f base=<sha> -f head=<sha>   # re-run the review of a range
```

---

## 8. Failure patterns

| Symptom | Cause | Procedure |
|---|---|---|
| `await.mjs` exit 2, "superseded" | a newer push aborted the run | wait for the newer commit — its review covers this delta as well |
| Job `review` red, "OpenRouter answered HTTP 402/401" | credit or key | check the OpenRouter account; only a 429 is retried |
| Job `review` red, "QA_REVIEW_KEY is missing" | secret missing | set the secret; without a key nothing is ever written unsealed |
| Smoke "new revision serving: no" | deploy ran, but `/api/health` reports a different commit | check the Cloud Run revision (`gcloud run services describe clean-core-dev --region=europe-west1 --project=cleancore-491216`) |
| Report names "NOT REVIEWED" | delta over the budget | cut smaller or re-check the range specifically via `workflow_dispatch` |
| Verdict `no_review`, `await.mjs` exit 2 "Nothing of this delta was read" | no batch fit into the budget, or every call failed | measure the range with `--dry` (§7), then check it in slices via `workflow_dispatch`, oldest first and one after the other — a new run on `dev` aborts the running one. `node scripts/qa/review.mjs --dry` with `QA_BASE_OVERRIDE`/`QA_HEAD` shows beforehand whether a slice becomes complete (`notReviewed` empty) |
| A finding comes back after refutation | title changed → new fingerprint | refute again; the reason refers to the earlier one |
| "no review content (finish_reason=length …)" | reasoning used up the output budget | happened on 15.09. on the first run (12,000 tokens at `high`); since then 32,000 — if it happens again, raise `maxOutputTokens` in `config.mjs` as a step of its own |

---

## 9. Weekly duty: pipeline health

What nobody pushes, no delta review checks either: a scheduled workflow that turns red on
Monday, or a bot branch with an update that nobody takes over. Exactly
that happened on 7 and 14.09. — the catalog sync had fetched the SAP data,
but was not allowed to create a pull request, and the red run reported to nobody.

| Component | Task |
|---|---|
| `.github/workflows/qa-weekly-health.yml` | Mondays 07:30 UTC, after the scheduled jobs at 06:00; read only; result sealed as `qa-health-<run>` |
| `scripts/qa/lib/health.mjs` | per workflow the latest result (red, dormant, ok), on red the job, step and first error line (redacted); bot branches that are ahead of `main` |
| `scripts/qa/health.mjs` | `--seal` in CI, `--brief` at session start, without a switch for the maintainer |
| `SessionStart` hook (local `.claude/settings.json`) | brings what is red and open into Claude's context, even if nobody has pushed |

No model, no costs. Since 15.09. the catalog sync no longer creates a pull request,
but pushes `chore/sync-cloudification-repo` and ends green; the
weekly check reports the branch until it has been taken over via `dev`.

---

## 10. Full review of every version on `main`

A delta review sees what has changed — never what was already there when the reviews
began. That is why every version on `main` additionally gets a review of the whole
code (Sonny, 15.09.2026).

| | |
|---|---|
| Trigger | push to `main`, job `full` in `.github/workflows/qa-review.yml`; never aborted, releases run one after the other |
| Model | Since 01.10.2026: OpenRouter Auto Router (`openrouter/auto`), cost tier `xhigh`, ceiling $3/$15, reasoning `high`; the report names every model that answered. Before: `openai/gpt-5.6-sol`, later `openai/gpt-6-luna-pro` |
| Scope | every reviewable file of the release commit (same path filters as the delta), with line numbers, plus an overview of all files; on 15.09.2026 435 files, around 4.3 M characters in 12 batches |
| Costs | $2 / $10 per M tokens. Budget **$10 per version**, estimated as for the delta (full output per call included): advance estimate $8.95, actually considerably less, because the output is rarely used up |
| Carry-over | open findings of the previous full review (artifact `qa-full-<sha>`, kept for 90 days); refutations from `docs/qa/refuted-findings.enc.json` apply as for the delta |
| Failures | a failed batch does not make the others worthless: its files appear as "not reviewed", the total costs then as "unknown" |
| Public by design | the Firebase web API key in `firebase-config.json` is redacted, but not reported as a secret — otherwise it would come back as a critical finding in every full review. This depends on **two** places, and until 22.09.2026 there was only one: `isPublicByDesign` in `config.mjs` compares the **path** of a hit, which is enough for the redaction per file. The last net before sending, however, reports its hits under the path `outgoing message`, and the delta review did not filter at all — so "Possible Google API key committed" was in the report as a critical finding on **every** push (carry-over `19146e4fbb01`). Since `publicByDesignValues()`, the **value** is compared as well, in all three senders (`review.mjs`, `full-review.mjs`, `scripts/security/audit.mjs`); `tests/qa-review-guard.spec.ts` records that every other value of the same shape is still reported |
| Effect | **decides nothing.** `main` is already shipped; confirmed findings are fixed on `dev` — `critical` immediately as a step of its own, `high` in the current phase, the rest in the next suitable step |

```bash
node scripts/qa/full-review.mjs --dry            # files, batches, estimated cost of the current commit — no call
node scripts/qa/await.mjs <sha> --full           # fetch the result of a release (runs on main only)
```

The hook after a push to `main` reminds of it, together with the security and UX agents.
