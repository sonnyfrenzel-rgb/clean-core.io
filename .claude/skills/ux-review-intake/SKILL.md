---
name: ux-review-intake
description: |
  Intake of the Clean-Core.io UX agent's reviews (Muse Spark 1.3). Use it after every push to `main`, after the
  first full UX review of the product, when the SessionStart context reports undecided UX findings, or when Sonny
  asks about UX findings. It tells you how to fetch and open the sealed report and its screenshots, verify each
  finding against code and picture, record the decision in docs/ux/register.json, and schedule accepted findings
  into docs/ROADMAP.md §13. Runbook: docs/UX-REVIEW-AGENT.md.
metadata:
  version: v1
---

# UX review intake

Standing instruction from Sonny (15.09.2026): every release on `main` gets a UX review; until a complete full review exists, the automatic run reviews the
whole product. The agent's only goal is a UX as close to perfect as possible. You verify, decide and schedule — you
do not redesign on your own initiative, and you never implement a finding outside a roadmap step.

## 0. Is the agent on?

`gh variable get UX_REVIEW_ENABLED` → `false` means revoked. `inbox.mjs` checks it and exits 2.

## 1. Fetch

A release review takes ~25 minutes (capture ~15, review ~10); the full review up to an hour.

```bash
node scripts/ux/inbox.mjs <sha> --timeout=90     # run_in_background: true
```

Exit `0` nothing undecided · `3` findings to decide · `2` no result (`gh run view <id> --log-failed`; the log
carries status and cost only). A `self-test` report proves the chain — do not triage its findings.

The report is under `.ux-review/inbox/<sha12>.json`, the screenshots under `.ux-review/inbox/ux-capture-…/`.

## 2. Verify every finding — the report is a hypothesis

For each finding read **only** the cited range (`Read` with `offset`/`limit`) and, when it cites a screenshot, `Read`
that one `.jpg`. Decide:

- **CONFIRMED** — a user meets it with the product as it is: the line does what the finding says, the picture shows
  it, the impact is plausible for the named user. Contrast claims marked "geschätzt": compute the ratio from the
  actual colour values before confirming.
- **REFUTED** — it does not happen: the code handles the state, the screenshot shows a capture artefact (empty seed
  data, animation mid-frame, a scroll container), or a guard/test already enforces the opposite. Name the evidence.
- **DEFERRED** — real, but the 3.0 rebuild replaces the screen anyway, or it needs Sonny's product decision. Say
  which.

Design decisions and priorities from a full review are proposals for Sonny, not findings: summarise them for him,
do not register them.

## 3. Record the decision

```bash
node scripts/ux/register.mjs accept <fingerprint> --step "1.5"
node scripts/ux/register.mjs refute <fingerprint> "<why, with file:line or screenshot>"
node scripts/ux/register.mjs defer  <fingerprint> "<why not now>"
node scripts/ux/register.mjs fixed  <fingerprint> <commit>
```

Commit `docs/ux/register.json` with the roadmap change.

## 4. Schedule into the roadmap

- `critical` → its own step now, before other roadmap work (release routine, Sonny's go for `main`).
- `high` → the current phase: consistency and component findings into **1.5** (components and style guard),
  shell and navigation into **1.4**, anything else into the step whose screen it is.
- `medium` → the next fitting step; `low` → alongside related work or **3.0**.
- Several small `sofort` findings on the same screen become one step, never a drive-by fix.

Refresh the table in `docs/ROADMAP.md` §13 from `node scripts/ux/register.mjs table`. UX findings are not secret —
but a finding that turns out to be security-relevant leaves this flow: hand it to the security register instead.

## 5. Fixing

A UX fix is a normal roadmap step: smallest change, a test where behaviour or a style guard can hold it, push to
`dev`, QA loop, Sonny's go. The next UX review on `main` shows whether it holds; then `register.mjs fixed`.

## 6. Report to Sonny

German, outcome first: review mode and commit, UX health, counts, confirmed/refuted/deferred with a one-line reason
each, what went into which roadmap step, the design questions he should decide, the actual cost.
