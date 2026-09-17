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

Exit codes: `0` go · `3` findings or smoke not OK · `2` no result (failed, superseded, timed out, revoked, or the
review read nothing — verdict `no_review`: its findings are only the carried register, not work for this round;
measure the range with `--dry` and review it in slices, docs/QA-REVIEW-LOOP.md §8).
The review comes first (Sonny, 16.09.2026): with findings, `await.mjs` returns exit `3` as soon as the review
job is done — one to two minutes after the push — and notes the smoke check as pending; do not wait for it,
the push that fixes the findings gets its own. Only a clean review keeps waiting for the smoke check.
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

A report marked `INCOMPLETE` means code was not read (budget, batch limit, cut diff). It keeps the loop open
even without findings: split the change into smaller pushes, or re-run the review for the named files with
`gh workflow run qa-review.yml --ref dev -f base=<sha> -f head=<sha>` — never treat it as a go.

Stop when **either**:
- `await.mjs` exits `0` (no open critical/high, no open medium outside the agents' own machinery, review
  complete, smoke OK), **or**
- three rounds for the same roadmap step are done — then list what is still open, with your verification
  verdict, in the report to Sonny.

A `medium` finding marked `non-blocking (agent infrastructure)` still gets verified; a confirmed one is fixed in
its own step, not necessarily in this round.

## 5a. The full review of a release on `main`

Every push to `main` also runs a review of the whole code base (`openai/gpt-5.6-sol`, job `full`). After the
push, alongside the security and UX intake: `node scripts/qa/await.mjs <sha> --full` (run_in_background, up to
two hours). It gates nothing — `main` is already out. Verify each finding exactly as in §3; refute wrong ones
with `refute.mjs` (the refuted list is shared); schedule confirmed ones into `docs/ROADMAP.md` like any other
finding — `critical` as its own step before other work, `high` into the running phase, the rest into the next
fitting step. Security-relevant ones follow the security register's rule: IDs only in public files.

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
