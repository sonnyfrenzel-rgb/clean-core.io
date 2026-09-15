---
name: security-audit-intake
description: |
  Intake of the Clean-Core.io security agent's audit reports. Use it after every push to `main` (the post-push
  hook reminds you), when the SessionStart context reports untriaged security findings, or when Sonny mentions a
  security audit mail. It tells you how to fetch and open the sealed report, verify each finding, record the
  decision in the sealed register, and schedule confirmed findings into docs/ROADMAP.md by priority — without
  exposing any detail in a public file. Runbook: docs/SECURITY-AUDIT-AGENT.md.
metadata:
  version: v1
---

# Security audit intake

Standing instruction from Sonny (15.09.2026): every release on `main` is audited by the security agent (CISO +
five consultants, DeepSeek V4.1 Flash over OpenRouter, no tools — since 15.09.2026; Claude Fable 5.1 before).
The model's findings are hypotheses like any other: verify each one against the code yourself. The report reaches him by mail and you through the sealed artifact.
You verify, decide and schedule. You never let a finding's details into a public file.

## 0. Is the agent on?

`gh variable get SECURITY_AUDIT_ENABLED` → `false` means revoked. `inbox.mjs` checks it and exits 2.

## 1. Fetch

A full audit takes up to ~2 hours. Start in the background and keep working:

```bash
node scripts/security/inbox.mjs <main-sha> --timeout=180     # run_in_background: true
```

Exit `0` nothing untriaged · `3` findings to triage · `2` no result (`gh run view <id> --log-failed`; the log
carries status fields only). A self-test report (subject `[SELBSTTEST]`, on `dev`) proves the chain — do not
triage its findings.

## 2. Verify every finding — the report is a hypothesis

Read only the cited locations (`Read` with `offset`/`limit`). For each finding decide:

- **CONFIRMED** — the precondition is reachable and the impact follows from the code as it is. Reproduce where
  feasible (a test, an emulator request), never against production.
- **REFUTED** — it cannot happen; you can name the line, rule or test that shows it.
- **ACCEPTED RISK** — real but deliberately not fixed. Only Sonny can accept a risk: ask him, then record his words.

Treat `kritisch` and `hoch` as CONFIRMED until shown otherwise, and tell Sonny about them in your next message.

## 3. Record the decision (sealed)

```bash
node scripts/security/register.mjs accept <fingerprint> --priority P1 --step "Phase 0 · 0.7"
node scripts/security/register.mjs refute <fingerprint> "<why, with file:line or test>"
node scripts/security/register.mjs risk   <fingerprint> "<Sonny's decision, date>"
node scripts/security/register.mjs fixed  <fingerprint> <commit>
```

Commit `docs/security/register.enc.json` with the change it belongs to.

## 4. Schedule into the roadmap — IDs only

Priority rules: `kritisch` → P1, a patch step now, before any other roadmap work, main on Sonny's go. `hoch` → P1
into the current phase. `mittel` → P2 into the next fitting step. `niedrig` → P3 alongside related work.
Hardening items from the report are P2/P3 candidates unless Sonny says otherwise.

Refresh the public table in `docs/ROADMAP.md` §12 from `node scripts/security/register.mjs public` — ID, severity,
priority, roadmap step, status. **Never** a title, file, route, description or evidence in any public file,
commit message, CHANGELOG entry or PR text until the finding is fixed and released; after that, describe the fix,
not the attack.

## 5. Fixing

A security fix is a normal roadmap step with the QA loop: smallest change, a test that fails without it, push to
`dev`, QA review, Sonny's go for `main`. The next audit on `main` shows whether it holds; then `register.mjs fixed`.

## 6. Report to Sonny

German, outcome first: audit version, risk rating, counts, what you confirmed/refuted and why in one line each,
what you scheduled where, the actual cost from the report. Details of unfixed findings only in your direct reply.
