# Security agent — delta audit of every `main` version

**As of 24.09.2026 (verification in batches), reviewed for 3.0 on 02.10.2026 · introduced with v2.9.15 · since 01.10.2026 with the OpenRouter Auto Router (previously DeepSeek V4.1 Flash) · runs on every push to `main` until Sonny revokes it**

> **Changed on 06.10.2026 (owner decision) — this block wins over anything below that contradicts it.**
> - Pinned model again, no Auto Router: `openai/gpt-6-luna-pro`, $0.10/$0.50 per M tokens (`AUDIT.model` in
>   `scripts/security/lib/team.mjs`). Budget 6 USD.
> - The consultants read only the inventory files changed since the last release whose audit succeeded
>   (`scripts/security/scope.mjs`, `auditScope` in `lib/surface.mjs`); the map and the dependency audit stay
>   whole. No usable base: everything. Nothing in scope changed: no model call, no report — `inbox.mjs` exits 0.
> - The scope job waits up to 30 minutes for the QA run of the same release (one agent at a time on the key).
> Passages below that describe the Auto Router, its cost tiers and price ceilings record the week of
> 01.–06.10.2026 and no longer apply.

Every new version on `main` gets a complete security audit: a CISO and
five security consultants, **OpenRouter Auto Router (cost tier high)**, as a chain of
model calls without tools. The report arrives condensed, evidenced and in German in
Sonny's inbox, in the look of the other Clean-Core.io mails. Claude Code checks every
finding, decides in the sealed register and schedules confirmed findings by priority
into the roadmap. The agent itself changes nothing.

Until 15.09.2026 the audit ran with Claude Fable 5.1 in Claude Code (Ultracode, budget
25 $). Sonny switched to DeepSeek V4.1 Flash, because of the cost.

**Since 24.09.2026 the CISO verifies in batches** (Sonny's decision, option A; budget
3 → 5 $). Occasion: at the release v2.18.0 (81810c8, run 35998405111) the
consultants reported 194 candidates; the single CISO call reached its input limit before
even one candidate got its code, confirmed nothing — and the mail said
"0 Befunde, Risiko niedrig" ("0 findings, risk low"), which in truth meant "not checked" (§1a).

> **Model routing since 01.10.2026 (owner decision).** No model is pinned any more. All
> three kinds of call (consultants, CISO verification, CISO narrative) go to OpenRouter's
> Auto Router (`openrouter/auto`) at cost tier **`high`**, under a price ceiling of
> **$1.50 input / $4.50 output per M tokens** (`provider.max_price`, `AUDIT.router` in
> `scripts/security/lib/team.mjs`). Every reserve and estimate is made at that ceiling;
> what counts against the cap is the actual `usage.cost`. The cap is now **$46 per
> release** (was $5, then $20, then $28 on 04.10.2026 with the consultants' output doubled
> to 48,000 tokens after the v3.0.1 audit was cut off twice; $46 the same day, owner's
> decision "fair share + 46 USD", after v3.0.2 failed the read floor again at 84 %):
> at the ceiling the CISO reserve alone is about $5.95 and a whole run at its worst case
> about $36.55 (128 consultant calls of 50,000 characters at 48,000 output tokens), under
> 80 % of the cap ($36.80). The self-test cap is $0.35 (was
> $0.20, which the self-test's CISO reserve alone now fills); the live self-test of
> 01.10.2026 made 3 calls, all answered by z-ai/glm-5.3, for $0.0293.
>
> The provider allowlist `['Fireworks', 'CoreWeave', 'Together']` is gone: it named the
> endpoints of one model and means nothing once the model is free. What still stands
> against the empty-body endpoint failure of 23.09.2026: `require_parameters: true`,
> `allow_fallbacks: false`, `data_collection: 'deny'`, the fixed-reason checks for empty
> or non-JSON content, and the coverage floor (`minDeepReadRatio`), which fails the audit
> loudly instead of reporting on a fraction. The payload, the public log line and the mail
> name every model that answered (`models`). DeepSeek V4.1 Flash and its prices below
> describe the period before 01.10.2026.


---

## 1. Architecture

```
 git push main ── security-audit.yml
                   │
                   ├─ scope    (no secrets)           main only → full audit (no self-test on dev any more, decision Sonny 16.09.2026)
                   │
                   ├─ audit    (model key only)
                   │    1. map of the attack surface — own code, without dependencies, without tokens:
                   │       files with domain, API routes with auth markers, dangerous sinks,
                   │       workflow permissions, Firestore rule blocks, CSP, npm audit
                   │    2. five consultants: every file of their domain in full, with line numbers and
                   │       redacted, plus their map entries — calls of 50,000 characters, at most 128, the limit shared
                   │       fairly across the five; three at a time; a large file in parts
                   │    3. candidates: consultant findings de-duplicated (file, nearby lines, finding class),
                   │       ordered by severity, named K-001 …
                   │    4. CISO verifies in batches of 20, each candidate with the code at its locations
                   │       (read from the repository), each call ≤ 120,000 characters → verified findings;
                   │       what was not verified is listed by name under "Nicht verifiziert" (not verified)
                   │    5. CISO synthesis: short verdict, rating, hardening — around the verified findings
                   │    6. sealed with the PUBLIC key
                   │
                   └─ deliver  (private key + Resend, no model)
                        open · render in German · mail to the administrator

 Claude Code (local) ── node scripts/security/inbox.mjs <sha>
                        open · show findings the register does not know yet
                        → verify → register.mjs accept/refute/risk/fixed → roadmap §12 (IDs only)
```

| Building block | File | Task |
|---|---|---|
| Team and limits | `scripts/security/lib/team.mjs` | cost tier and price ceiling of the Auto Router, budget, consultants with their domains, schemas — the only place |
| Pipeline | `scripts/security/lib/pipeline.mjs` | who reads which file, what each call sees, deduplication and verification batches of the candidates, code context of the locations, counted coverage |
| CISO brief | `docs/security/ciso-brief.md` | method, current attack patterns, severity levels, report structure |
| Attack surface map | `scripts/security/lib/surface.mjs` | deterministic, only `node:` modules |
| Audit | `scripts/security/audit.mjs` | map, consultant calls, CISO call, seal the report |
| Model call, redaction | `scripts/qa/lib/openrouter.mjs`, `redact.mjs` | the same as for the QA agent: no tools, no fallback models, `data_collection: deny` |
| Seal | `scripts/security/lib/envelope.mjs`, `docs/security/audit-public-key.pem` | RSA-OAEP-SHA256 + AES-256-GCM |
| Mail | `scripts/security/lib/mail.mjs`, `mail-shell.mjs`, `deliver.mjs` | Clean-Core.io layout, responsive, every model text escaped |
| Inbox | `scripts/security/inbox.mjs` | fetch, open, show what is unassessed; `--brief` at session start |
| Register | `scripts/security/register.mjs`, `lib/register.mjs`, `docs/security/register.enc.json` | decisions, sealed |
| Workflow | `.github/workflows/security-audit.yml` | three jobs, three trust levels |
| Guardrails in the test | `tests/security-audit-guard.spec.ts` | no tools, key separation, no leaks, budget, pipeline, mail look |
| How Claude works | `.claude/skills/security-audit-intake/SKILL.md` | loaded only when a report is there |

### 1a. Verification in batches

| Step | Rule | Place |
|---|---|---|
| Deduplicate | two findings are one if they have the same finding class (CWE, OWASP API/LLM/Top 10, otherwise the category text) **and** cite the same file at lines at most 10 apart; transitively. If the class is only a category text ("security"), the titles must also match (word overlap ≥ 0.6) — a general category alone merges nothing. The merged candidate carries the highest severity, all locations and **all sources** (which consultant reported what, with their evidence and recommendation for the CISO) | `dedupeCandidates`, `isSpecificClass`, `TITLE_SIMILARITY_TO_MERGE`, `AUDIT.dedupeLineDistance` |
| Order | most severe first, then highest confidence; names `K-001`, `K-002`, … in this order | `planVerification` |
| Batch | 20 candidates per call, at most 25 calls (500 candidates) | `AUDIT.verificationBatchSize`, `maxVerificationCalls` |
| Code per candidate | window of ±12 lines around up to four locations; each candidate gets an equal share of the 120,000 characters. If it does not fit, windows and text fields shrink step by step (±6, ±3, ±1, only the line) — the code is never the first thing to go. Overlong code lines are cut at 300 characters | `candidateEntry`, `verificationMessage` |
| Budget | before every verification call against what was actually spent: consultants + verification calls + this call in the worst case + the narrative | `runVerification` via `runBounded` |
| Not verified | whatever lay outside the call limit, outside the budget, above the input limit after redaction or in a failed call is listed **by name** in the sealed report (`verification.notVerified`: ID, title, proposed severity, locations, consultants, reason) — never silently left out, never counted as "no finding" | `notVerifiedEntry`, `verificationLimitation` |
| Headline | if candidates remain unverified, the subject reads "nicht vollständig geprüft: X von Y Kandidaten verifiziert, Z nicht" ("not fully checked: X of Y candidates verified, Z not") instead of "Risiko …" ("Risk …"); the rating appears only as "Einstufung des verifizierten Teils" ("rating of the verified part") | `renderAuditMail` |

A verification call that comes back has checked each of its candidates: what it keeps is
a finding, what it drops did not hold. If a verification call fails, its
candidates remain "not verified"; the log names only one word from the closed list
(`failureReason`) and a number. If all verification calls **and** the narrative fail,
the audit aborts instead of sending unverified candidates under the CISO's name.

---

## 2. Guardrails

**The model has no tools.** It gets text and returns structured JSON.
What it sees is assembled by the pipeline: the code of a domain for a consultant, the
findings with their code for the CISO. A location the model names is looked up by the
pipeline only if the file is in the map — never an absolute path, never anything
outside the repository, never an excluded file.

**Nothing goes out unredacted.** Every text passes the QA agent's redaction
before it leaves the runner; a hit is reported as a critical finding, without its
value. The Firebase web key is public by design and is only redacted.

**Three jobs, three trust levels.**

| Job | Holds | Can | Cannot |
|---|---|---|---|
| `scope` | nothing | decide whether and how to audit | — |
| `audit` | OpenRouter key, public key | send code, seal | open, mail or write a report |
| `deliver` | private key, Resend key | open, render, mail | run a model |

A manipulated or prompt-injected audit job therefore has nothing to read except the
run it is doing right now — it cannot open earlier reports.

**Nothing becomes public.** Repository and Actions logs are public. The log carries
calls, failures and costs, never a finding. The report leaves the runner only
sealed. The register is sealed; the roadmap shows only ID, severity, priority,
step and status. Titles, files and descriptions of unfixed findings appear in
no public file.

**No third-party code next to keys.** The audit and mail jobs run without `npm ci` and execute
only our own code. That is why `mail-shell.mjs` mirrors the mail shell from
`lib/email-layout.ts` — a test keeps the two the same.

**Prompt injection.** Everything in the repository is data; an attempt at steering is itself a
finding (CISO brief). Even a successful attempt can only produce a false finding
— and none is adopted unchecked.

**Providers.** OpenRouter forwards only to providers without storage or training
(`data_collection: deny`) and never to another model (`allow_fallbacks: false`). The
repository's code is public; what an audit writes about its weaknesses is
not — that is why the condition applies here too.

---

## 3. Costs

DeepSeek V4.1 Flash: **0.22 $ per M input tokens, 0.66 $ per M output tokens**
(Fireworks via OpenRouter, 23.09.2026; until then 0.15/0,60 at the cheapest provider).

| Measure | Effect |
|---|---|
| **Budget 46 $ per audit (since 04.10.2026; 28 $ earlier that day, 20 $ from 01.10.2026, 5 $ from 24.09.2026, previously 3 $) — estimated at the price ceiling, checked before every call against what was actually spent** | a call that by the estimate would break it does not take place; the files of a consultant call are listed as not read in depth, the candidates of a verification call as "not verified" in the report. All 25 verification calls and the narrative are reserved in advance, before a consultant spends anything. Hard limit: the credit limit on the OpenRouter key |
| Worst case of a full audit | Since 04.10.2026, at the $1.50/$4.50 ceiling: 128 consultant calls of 50,000 characters at 48,000 output tokens ≈ 30.60 $ + 25 verification calls and the narrative ≈ 5.95 $ = **≈ 36.55 $** — the test keeps it under 80 % of the budget (36.80 $). From 01.10.2026: 60 calls of 100,000 characters at 24,000 tokens, ≈ 14.90 $. Until then (DeepSeek): ≈ 2.20 $. Expected per release (estimate, not measured): around 1 $, of which about 0.10–0.20 $ for 150–200 candidates in 8–10 verification calls |
| Split by domain | every file is read by exactly one consultant or, for test files, checked only via the map |
| 50,000 characters per consultant call, at most 128 calls shared fairly across the consultants, three at a time; a larger file is read in parts | measured on 15.09.2026: a call with 284,000 characters ran 16.6 min and ended without a readable answer, one with 100,000 characters answered in 177 s for 0.007 $. 100,000 characters, 60 calls and four at a time until 04.10.2026: the audits of v3.0.1 and v3.0.2 failed the read floor (84 %, 81 %, 84 %), the failed calls mostly cut off at their output limit, some HTTP 429; and the limit, spent first come in declaration order, had left ci-cloud-ai without a single call. Since then (owner's decision "fair share + 46 USD") every consultant that still needs a call gets one in turn (`fairShares` in `lib/pipeline.mjs`), and a file outside the limit is named with its consultant's share. Planned at b56d36e4: identity-crypto 6, data-rules 27, ci-cloud-ai 24 calls (all their files), appsec-api 36 of 51, frontend-supply-chain 35 of 271 (its domain also takes every tests-and-config file) — 318 files. Reading every file of the old plan plus all of ci-cloud-ai would take 168 calls and a cap of 58 $. Around two hours of consultants at the 2.8 minutes per call measured at v3.0.2; the audit job's timeout is 300 minutes. The budget counts every running call at its worst case until it is billed |
| Audit only on `main` releases | no audit and since 16.09.2026 also no self-test per push to `dev` — security is checked thoroughly at the release, not by sampling at the push |
| Self-test on two files with 0.20 $ | only by hand now: `SECURITY_AUDIT_MODE=self-test node scripts/security/audit.mjs` with `OPENROUTER_API_KEY` locally; no workflow triggers it |

The actual costs are in every mail in the evidence block; if a figure is missing or
a call failed, it says "unbekannt" ("unknown") there, never 0 $.

---

## 4. The mail

Subject: `Security-Audit v… (commit) — Risiko …: n kritisch · n hoch · n mittel · n niedrig`.
If candidates remain unverified: `Security-Audit v… (commit) — nicht vollständig geprüft: X von Y
Kandidaten verifiziert, Z nicht · n kritisch · …` — never "Risiko niedrig" ("risk low") for a report
whose remainder nobody has checked. At the top it then says "Prüfstand: Nicht vollständig geprüft" ("check status: not fully checked")
instead of "Gesamtrisiko" ("overall risk"), and after the findings the list **Nicht verifiziert** ("not verified") (ID `K-…`,
proposed severity, title, locations, consultants, reason).
Content in this order: overall risk or check status, summary, findings (per finding location,
description, precondition, impact, evidence, recommendation, **check before the fix**,
confidence of the assessment), hardening P1–P3, what is good, scope and limits (counted,
not estimated), evidence (version, full commit, model, calls, duration, costs,
**SHA-256 of the sealed report**).

**Verifiable:** The SHA-256 in the mail belongs to exactly the artefact of the run;
`node scripts/security/inbox.mjs <sha>` opens the same artefact and shows the same
report.

---

## 5. What Claude Code does with the report

Binding in the skill `security-audit-intake`; the rules:

1. Fetch after every push to `main` (hook) or when the session start reports unassessed
   findings.
2. Check every finding at the cited place: confirmed, refuted or — only on
   Sonny's decision — accepted risk.
3. Record the decision in the sealed register.
4. Schedule: **critical** immediately as its own patch step before everything else; **high** into
   the current phase; **medium** into the next fitting step; **low** alongside
   related work. Publicly only the ID table in `docs/ROADMAP.md` §12.
5. Fix like any step: with a test, QA loop, `main` on Sonny's go. The next
   audit shows whether the fix holds.

---

## 6. Revocation and setup

```bash
gh variable set SECURITY_AUDIT_ENABLED --body false   # stops the audit and the inbox
gh variable delete SECURITY_AUDIT_ENABLED             # on again
```

| Secret | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | GitHub secret (exists, also used by the QA and UX agents) | model calls of the audit job |
| `SECURITY_AUDIT_PRIVATE_KEY` | GitHub secret, `.env.local` | open reports and register |
| `RESEND_API_KEY` | GitHub secret (exists) | sending mail |
| public key | `docs/security/audit-public-key.pem` | seal |

The secret `SECURITY_AGENT` (Anthropic key) has not been read
since the switch; the key can be revoked in the Anthropic console and the secret
deleted.

**Rotate keys:** generate a new pair, commit the public part, put the private one in the
secret and `.env.local`; open the register with the old key and seal it again.
Old reports remain readable only with the old key.

---

## 7. Failure patterns

| Symptom | Cause | Action |
|---|---|---|
| `audit` red, "the audit did not produce a report (every CISO call failed …)" or log "CISO verification calls failed: http-401/http-402" | key or credit | check the OpenRouter account; the log contains no content |
| `audit` red, "HTTP 404 … no provider matches the data policy" | no provider of the model satisfies `data_collection: deny` | check the model's provider list at OpenRouter; change models only as a step of its own |
| Report names files "outside the … cost cap" or "model call failed" | budget or a single call | the rest of the audit stands; the files are listed under scope and limits |
| Subject "nicht vollständig geprüft: X von Y Kandidaten verifiziert" ("not fully checked: X of Y candidates verified") | verification calls failed (log: `CISO verification calls failed: <Wort> ×n`), budget exhausted or more than 500 candidates | the verified findings stand; the list "Nicht verifiziert" ("not verified") is open, not empty — check `kritisch`/`hoch` in it by hand at the location (skill `security-audit-intake`). If calls failed, restart the run |
| "model call failed: OpenRouter answered HTTP 429" or "the audit did not produce a report (CISO call: … HTTP 429)" | the provider's rate limit despite nine retries — with its waiting time (up to 120 s per attempt, i.e. up to 18 minutes) or 15 s, 30 s, 60 s, then 120 s, together around 14 minutes (nine since 04.10.2026, eight from 15.09.2026; previously six with around 100 s, on which the self-tests of e3a7853 and 5a284ee failed) | restart the run (`gh run rerun <id>`); if it persists, lower `consultantConcurrency` (consultants) or `concurrency` (CISO verification) in `team.mjs` as a step of its own. Provider fallback for the same model (`allow_fallbacks`) is deliberately off and may only be changed with Sonny's decision |
| `deliver` red, "Resend rejected … HTTP 4xx" | mail key or sender domain | check the Resend account; the report is kept as an artefact for 90 days |
| Session start reports "produced no readable report", all three jobs green | until 17.09.2026: two `inbox.mjs --brief` at the same time (a resumed session start launched the hook twice) downloaded into the same directory, and `gh run download` does not overwrite an existing file — the report of e3817ce was readable the whole time. Since the fix every call downloads into its own directory (`fetchSealed` in `lib/envelope.mjs`) | `node scripts/security/inbox.mjs <sha>`; if it opens the report, it was not a fault of the audit |
| No mail after a `dev` push | the workflow runs only on `main` | expected |
| Mail with `[SELBSTTEST]` | someone started the self-test by hand | chain works; no audit result |
