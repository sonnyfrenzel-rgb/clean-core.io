# UX agent — UX review, started by hand

**As of 15.09.2026 · introduced with v2.9.17 · started by hand since 06.10.2026**

> **Changed on 06.10.2026 (owner decision) — this block wins over anything below that contradicts it.**
> - No push starts it: `gh workflow run ux-review.yml --ref main -f mode=delta` (or `mode=full`).
> - Pinned model again, no Auto Router: `openai/gpt-6-luna` (reads images), $0.10/$0.50 per M tokens
>   (`UX_MODEL` in `scripts/ux/lib/config.mjs`).
> Passages below that describe the Auto Router, its cost tiers and price ceilings record the week of
> 01.–06.10.2026 and no longer apply.

> **Model routing since 01.10.2026 (owner decision).** No model is pinned any more. Every
> call goes to OpenRouter's Auto Router (`openrouter/auto`) at cost tier **`high`**, under a
> price ceiling of **$1.25 input / $5 output per M tokens** (`provider.max_price`,
> `UX_ROUTER` in `scripts/ux/lib/config.mjs`), with `data_collection: 'deny'`,
> `require_parameters: true` and `allow_fallbacks: false`. The budgets per mode are
> unchanged; every estimate is made at the ceiling, and the actual `usage.cost` counts.
> Every call carries screenshots, so after each answer the model that answered is looked up
> in OpenRouter's public model list: if it cannot read images, or cannot be identified, the
> call fails and its review is never accepted. Each sealed report and the step summary
> name the models that answered (`meta.models`). Muse Spark 1.3 and its prices below
> describe the period before 01.10.2026.


Every new version on `main` gets a UX review of its delta. The very first review
takes on the whole product, area by area, and closes with an
end-to-end synthesis. Since 01.10.2026 the model is chosen by the **OpenRouter Auto Router** (before that Meta's Muse Spark 1.3), image-capable models only:
it reads the code and sees the screens. Its only goal is the most perfect possible
UX. It finds problems, questions design decisions, sees new features from the
user's point of view and checks colours, shapes, fonts and patterns for consistency. Claude Code
checks every finding against code and screenshot, decides in the register and schedules confirmed
findings into the roadmap. The agent itself changes nothing.

---

## 1. Architecture

```
 git push main ── ux-review.yml
                   │
                   ├─ scope    (no secrets)      main → auto · dev → auto, only when the agent itself was changed
                   │                             (auto is resolved by review.mjs, which can open the reports: as long as there is
                   │                             no complete full review → full; after that main → delta, dev → self-test)
                   │
                   ├─ capture  (no secrets)      npm ci · emulator · build with throwaway keys ·
                   │                             seed the demo project · tests/capture-screens.spec.ts:
                   │                             16 screens × desktop/phone × up to 3 screen heights,
                   │                             3 screens with the retired dark theme set (there is no dark mode;
                   │                             they must match), 7 key views of the mockups 2.8
                   │
                   └─ review   (model + seal key, no npm ci, no third-party code)
                        1. design scan: colours, font sizes, radii, shadows, button styles,
                           a11y heuristics, language signals — deterministic, without tokens
                        2. areas from the import graph: which screen shows which component
                        3. Auto Router (high, image-capable only): code + scan + screenshots per call, strict schema
                        4. report sealed (AES-256-GCM, UX_REVIEW_KEY)

 Claude Code (local) ── node scripts/ux/inbox.mjs <sha>
                        open · fetch screenshots · show what is undecided
                        → verify → register.mjs accept/refute/defer/fixed → roadmap §13
```

**Modes**

| Mode | When | What the model gets | Budget (estimated) |
|---|---|---|---|
| `full` | every automatic run as long as no complete full review exists; after that only via `workflow_dispatch` | 7 areas (≈ 8 calls), per area all files with line numbers and its screens; then a synthesis with a contact sheet of all screens, the findings of all areas and top-10 priorities | 6 $ |
| `delta` | every push to `main` after the full review | changed UX files (small: whole; large: diff with 30 lines of context; deleted ones with their last content), the scan with the tokens that the release newly and rarely introduces, screens of the affected areas plus reference screens, open findings for comparison | 1.50 $ |
| `self-test` | agent changed on `dev`, after the first run | one file, two images | 0.30 $ |

The areas are journeys, not folders: **Access** (landing, access dialog, features,
legal) · **Knowledge** (catalog, whitepaper, how-to, trust) · **Frame** (app layout,
project layout, dashboard, settings) · **Analysis** · **Draft** (Design,
Transformation) · **Evidence** (Documentation, Tests, TCO, handover) · **System**
(shared components, styles, stage model, mails). A component belongs to the
one area whose pages render it, otherwise to System.

| Building block | File | Task |
|---|---|---|
| Model, budgets, areas | `scripts/ux/lib/config.mjs` | the only place for the Auto Router's cost tier and price ceiling, budgets per mode, areas, screen names and the resolution of `auto` |
| UX instruction | `docs/ux/ux-brief.md` | role, users, product rules, direction 3.0, ten review perspectives, severities, the three modes |
| Design scan | `scripts/ux/lib/scan.mjs` | counts over all UX files; for a release the newly introduced rare tokens |
| Areas | `scripts/ux/lib/areas.mjs` | import graph, assignment, packages without cut files |
| Screenshots | `scripts/ux/lib/shots.mjs`, `tests/capture-screens.spec.ts` | expected names, JPEG signature, size limit; selection first per screen, then details |
| Review | `scripts/ux/review.mjs`, `lib/prompt.mjs`, `lib/range.mjs` | mode, base, calls, cost limit, seal |
| Report | `scripts/ux/lib/report.mjs` | fingerprints, merging, carrying over open findings, text for Claude |
| Transport | `scripts/qa/lib/openrouter.mjs`, `crypto.mjs`, `redact.mjs` | shared with the QA agent: no tools, no fallbacks, no data use, schema check, redaction |
| Inbox | `scripts/ux/inbox.mjs` | fetch, open, fetch screenshots; `--brief` at session start |
| Register | `scripts/ux/register.mjs`, `lib/register.mjs`, `docs/ux/register.json` | decisions, roadmap table |
| Workflow | `.github/workflows/ux-review.yml` | three jobs, three trust levels |
| Guardrails in the test | `tests/ux-review-guard.spec.ts` | model, schema, job separation, costs, seal, base choice, areas, screenshots, scan, register |
| Claude's way of working | `.claude/skills/ux-review-intake/SKILL.md` | is loaded only when a report is there |

---

## 2. Guardrails

**UX only.** The instruction excludes code quality, performance internals, business logic and
security. If the model notices something security-relevant, it names only the file
in `coverage_notes`; Claude passes that on to the security register.

**The model cannot do anything.** A call without tools, with a strict JSON schema, checked
once more locally. `provider: { allow_fallbacks: false, data_collection: 'deny' }` — no
other model, no provider that stores or trains on prompts. The
"Contributor" variant of the model is excluded.

**No third-party code next to the key.** The review job runs no `npm ci`; it uses
only its own modules with `node:` imports. The capture job installs and starts the app —
it has no secret whatsoever for that, only throwaway keys for the demo build. What it hands over
is bytes: the review job takes only regular files with an expected name, JPEG signature
and at most 3 MB, no symlinks.

**Nothing becomes public.** The log names commit, mode, calls and costs — not the
UX health, not the number of findings. The report is sealed. Every outgoing
text runs through the QA agent's redaction.

**No guessed base.** A release is reviewed from the last reviewed state, without it
from the previous `main` state of the push. If neither exists, the run aborts and
demands `mode=full` or a base. Unread code, missing screenshots or a
missing synthesis make a report **incomplete**: the reviewed state stays where it is. Screenshots count per screen that a call needs — a single image of another screen is not enough. Only the mockups are wanted but not mandatory.
A self-test is never a reviewed state.

**No queue that discards runs.** No concurrency group: every release
gets its review.

---

## 3. Costs

Muse Spark 1.3 costs 1.25 $ per million input and 4.25 $ per million output tokens
(OpenRouter, 15.09.2026). Before every call it is checked: actually spent so far plus
the estimate for this call — characters ÷ 2.5 (code with line numbers is token-dense), every image at 1,600 tokens, the full
output amount. What does not fit is not sent and is named in the report as not read.
The hard ceiling is the credit limit of the OpenRouter key.

Guide values: a release with one or two changed screens 0.10–0.40 $; the first
full review with ≈ 2 MB of code and ≈ 120 images sent 1.50–3 $ (estimate ceiling 6 $). Plus
≈ 15 minutes of Actions time for the capture job.

**Target picture: seven key views of the mockups 2.8** (decision Sonny 24.09.2026,
option B). Binding is `docs/roadmap/clean-core-mockups-v2_8.html` with 16 views;
only those against which the product is measured are photographed — `MOCKUP_VIEWS` in
`scripts/ux/lib/config.mjs`, the only list, which the capture also reads from:

| View | File | Content |
|---|---|---|
| `s0` | `m0-mockup-desktop.jpg` | First look |
| `s1` | `m1-mockup-desktop.jpg` | Business · Process (BPMN) & rules |
| `s4` | `m4-mockup-desktop.jpg` | IT · Findings & chain |
| `s5` | `m5-mockup-desktop.jpg` | Management · Decide |
| `s6` | `m6-mockup-desktop.jpg` | Handover & evidence chain |
| `s7` | `m7-mockup-desktop.jpg` | My workspace |
| `s12` | `m12-mockup-desktop.jpg` | Large process · Overview |

The area *system* sees all seven (with the four reference screens 11 of 16 images per
call), the synthesis three of them (`s0`, `s1`, `s5`, chosen by view, not by position) —
compared to the six views of the mockups 2.7 one image more, ≈ 0.002 $. The budgets stay.
One view more or fewer: change only `MOCKUP_VIEWS`; `tests/ux-review-guard.spec.ts`
keeps 6–8 views, the buttons in the mockup file and the names in lockstep.

---

## 4. What Claude Code does with the report

Skill `ux-review-intake`. In short: in the background `node scripts/ux/inbox.mjs <sha>`; check every
finding against the cited line and the cited screenshot; recompute contrast claims from
the real colour values; then `register.mjs accept --step … | refute | defer |
fixed`. Confirmed findings go into the roadmap by severity (§13): critical as a step of its own
immediately, high into the current phase — consistency and components to **1.5**,
frame and navigation to **1.4** —, medium into the next fitting step, low
next to related work or after **3.0**. Design decisions and priorities of a
full review are proposals for Sonny, not findings.

At session start `scripts/ux/inbox.mjs --brief` reports undecided findings of the
last review.

---

## 5. Revocation and setup

| What | Where | Status |
|---|---|---|
| Revocation | `gh variable set UX_REVIEW_ENABLED --body false` | — |
| `OPENROUTER_API_KEY` | GitHub secret (shared with the QA agent), `.env.local` | set |
| `UX_REVIEW_KEY` | GitHub secret and `.env.local` — nowhere else | set on 15.09.2026 |
| **18+ confirmation at OpenRouter** | https://openrouter.ai/settings/preferences — only the account holder | **open:** without it OpenRouter answers every Muse Spark call with HTTP 403 |
| Credit limit of the key | OpenRouter → Keys | recommended, covers all agents |

A run locally, without a model call: `node scripts/ux/review.mjs --dry --mode=full` shows
packages, images and estimated costs.

---

## 6. Failure patterns

| Log | Meaning | What to do |
|---|---|---|
| `OpenRouter answered HTTP 403 (key or account not permitted …)` | 18+ confirmation missing | Sonny confirms in the OpenRouter settings, then repeat the run |
| `OpenRouter answered HTTP 404 (… no provider matches the data policy)` | Meta does not accept the call under `data_collection: deny` | do not loosen — Sonny decides on model or policy |
| `No usable base for a delta review` | no reviewed state in this history and no previous state | `gh workflow run ux-review.yml -f mode=full` or `-f base=<sha>` |
| Report `unvollständig`, "Screenshots missing" | capture job failed | `gh run view <id> --log-failed` in the job *Capture screens*; the next run reviews from the old state |
| Screens show empty pages | seed no longer fits the page | update `tests/capture-screens.spec.ts`; refute findings about it, do not schedule them |
