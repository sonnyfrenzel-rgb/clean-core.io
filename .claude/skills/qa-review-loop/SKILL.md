---
name: qa-review-loop
description: |
  The always-on QA review loop of Clean-Core.io. Use it right after every push to `dev`, when the post-push hook
  reminds you, when a `scripts/qa/await.mjs` background task finishes, or before asking Sonny for a push to `main`.
  It tells you how to wait for the QA agent's sealed review and smoke check, verify each finding, fix confirmed
  ones, refute wrong ones, and when the loop is done. Runbook: docs/QA-REVIEW-LOOP.md.
metadata:
  version: v1
---

# QA review loop

Standing instruction from Sonny (15.09.2026): the loop runs after **every** push to `dev`, autonomously, until
he revokes it. You act only inside the guardrails below — nothing else, nothing more.

## 0. Is the loop on?

`gh variable get QA_REVIEW_ENABLED` → `false` means revoked: do nothing, mention it once in the report.
`await.mjs` checks this itself and exits 2.

## 1. After the push

Start in the background, then keep working on something that does not touch the same files:

```bash
node scripts/qa/await.mjs <pushed-sha> --timeout=60     # run_in_background: true
```

Exit codes: `0` go · `3` findings or smoke not OK · `2` no result (failed, superseded, timed out, revoked).
On `2` with "superseded": await the newer head instead. On a failed run: `gh run view <id> --log-failed`,
fix the cause if it is ours (never print or paste the report content into a commit, issue or public place).

## 2. Read the result without wasting context

The printed report is already compact: fingerprint, severity, `file:line`, what breaks, evidence, fix.
The full plaintext is in `.qa-review/<sha12>.review.json` — read it only if the printout is not enough.
For each finding, read **only the cited range** (`Read` with `offset`/`limit` around the line), not the file.
Delegate to an Explore agent only when more than five findings need cross-file tracing.

## 3. Verify every finding before touching code

A model finding is a hypothesis. For each one decide:

- **CONFIRMED** — the failure scenario actually happens with the code as it is (trace the path; reproduce
  with a test or a quick script when feasible).
- **REFUTED** — the scenario cannot happen, and you can point to the line, test or spec that shows it.
- **UNCLEAR** — neither can be shown with reasonable effort. Treat as confirmed if severity ≥ high,
  otherwise note it in the step report for Sonny.

Simplification findings count as CONFIRMED only if the simpler form is behaviour-identical **and** existing
tests cover that behaviour; otherwise leave the code and note it.

## 4. Act — within the guardrails

- **Fix confirmed findings** with the smallest change that removes the defect, plus a test that fails without
  the fix. No unrelated refactors, no new features, no scope growth.
- **Refute** with evidence: `node scripts/qa/refute.mjs <fingerprint> "<reason with file:line or test>"`,
  then commit `docs/qa/refuted-findings.enc.json` with the fix commit.
- **Never** weaken or skip a test, raise `--max-warnings`, add `eslint-disable`/`@ts-ignore`, or loosen a guard
  to make a finding go away.
- **Never** push to `main`, force-push, skip hooks, or change the QA agent's own guardrails
  (`scripts/qa/lib/config.mjs` budgets, workflow permissions, sealing) as part of a fix round. Changes to the
  agent itself are their own step with Sonny's go.
- Commit message: `fix(qa): <what> — QA review of <sha12>`; run the affected specs + `npm run typecheck`
  + `npx eslint <changed files>` before pushing.

## 5. Next round, and when to stop

Push the fixes to `dev` → back to step 1. The next review covers exactly the fix delta and marks carried
findings resolved or still open.

Stop when **either**:
- `await.mjs` exits `0` (no open critical/high/medium, smoke OK), **or**
- three rounds for the same roadmap step are done — then list what is still open, with your verification
  verdict, in the report to Sonny.

## 7. Weekly duty — pipeline health

Every Monday `qa-weekly-health.yml` records the state of every workflow and bot branch; at session start the
`SessionStart` hook runs the same check (`node scripts/qa/health.mjs --brief`) and puts anything RED, STALE or
PENDING into your context. When it does:

- **RED / STALE:** read the failing step (`gh run view <id> --log-failed`) and find the root cause. Fix it when it
  is ours (a workflow, a script, a test) as its own patch step through `dev`. When it needs a setting, a secret or
  infrastructure, do not change it — describe exactly what is needed and ask Sonny.
- **PENDING bot branch** (e.g. `chore/sync-cloudification-repo`): review the diff in size and shape, run the catalog
  and landing guards against it, and bring it in through `dev` as its own step — it is SAP data the engine grades
  with, so a large or surprising change is reported to Sonny before it ships.
- A workflow that is `unknown` is usually not on `main` yet; that is not a finding.

## 6. Report

In the step report (German, outcome first): QA rounds, findings confirmed/fixed, refuted (with the one-line
reason), anything open, actual review cost from the report. **Do not** include exploit details of unfixed
security findings in anything that leaves the machine except the direct reply to Sonny. Only then ask for `main`.
