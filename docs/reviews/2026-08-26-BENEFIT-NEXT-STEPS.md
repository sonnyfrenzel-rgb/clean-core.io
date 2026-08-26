# The benefit section — where it stands and what comes next

**26 August 2026.** Companion to `2026-08-26-grok-4.6-benefit-wow-raw.md`, which holds the
unedited proposals. This file records the feasibility check that the raw text could not do,
and the decision that follows from it.

---

## The critique that matters

> "The current card asserts the differentiator and proves the commodity."

The right column — 21 settled / 17 your call / 4 hand work — is computed at request time from a
file that ships in this repository. It is proven. The left column, which is the *only* reason a
sceptical architect stops scrolling, is a hand-written credit-check story with CSS circles for a
BPMN diagram. It reads as a mockup.

That is backwards. The commodity carries the proof; the differentiator carries the assertion.
Everything below follows from fixing that, not from adding motion.

---

## Feasibility, checked against the code

| Layer | Source provenance | Where |
|---|---|---|
| Technical findings | **Yes** — `lineStart`, `lineEnd`, `snippet` on every finding | `lib/abap/evidence-model.ts` |
| Business layer (BPMN, SOP, RACI) | **No** — and the prompt forbids any technical reference | `app/(app)/project/[projectId]/documentation/page.tsx:443` |

The documentation prompt states: *"Do NOT mention any technical or IT concept. Forbidden terms:
source code, API/OData/CDS/CAP/RAP, database/table/Z-table…"* — the business layer is decoupled
from the code **by design**, so the pyramid carries nothing that points back at a statement.

This is decisive for proposal 1 below, and it is the single thing to fix first if that proposal
is ever built.

---

## The proposals, ranked

### 1 · Click a business sentence → see the ABAP that licensed it
**The strongest, and not buildable today.**

The frozen pyramid from the public reference run, shown beside the actual `.abap`. Clicking
"blocks delivery when the credit limit is exceeded" highlights the matching `SELECT` / `IF` /
`MESSAGE`. Sentences the model **inferred** rather than read are marked as inferred, with a
legend: *in the code* / *inferred*.

Why it lands: this audience does not trust prose about Z-code, it trusts correspondence. Signavio
cannot do this — it mines transaction data and never sees the code. smartShift and CoreAssess will
not: they ship a backlog.

**Blocked on:** source anchors in the documentation pipeline. The warning in the raw text is the
important part — *"if today's output does not carry spans, do not fake them; that is worse than a
mockup, it is a lie with a pointer."* Building this means teaching the pyramid to carry statement
references without losing the business language the prompt currently protects.

**Do not label it** "explainability" or "grounded generation". The honest claim is narrower:
*these nodes came from this file; these cite these statements; these do not.*

### 2 · Put the whole frozen pack in the card
**Buildable now. Do this first.**

Replace the invented story with the real five-level pyramid for the reference file — generated
once, committed as a fixture, rendered server-side. No Gemini at request time, no cost, and a
reader can actually read the SOP and disagree with it.

Risk, stated plainly: a mediocre draft then sits in public on the most expensive pixels on the
site. That is acceptable *only* while the surrounding copy keeps saying **draft**. And one level
visible at a time — five at once is a wall of text, not a moment.

### 3 · Named-object roll-call
**Buildable now. Cheap. Do it alongside 2.**

Under the right-hand bar, the actual objects the reference parse classified, in the names this
audience dreams in — `VBAK`, `BSEG`, `KNKK` — each with its released successor, or an honest "no
released path". Recognition beats a percentage.

It proves the engine, which was never the gap. Ship it because it is cheap and on-brand, not
because it is the moment.

### 4 · Real BPMN 2.0, downloadable
**Only after 1.**

The actual BPMN XML from the pack, rendered properly, with a download that opens in the modeller
they already have. A file is an artifact; a CSS row is a marketing slide.

Do not claim "Signavio-ready" without having opened it in Signavio. A pretty diagram without
provenance is still a prettier mockup.

### 5 · Ungated paste box
**Rejected.**

Paste 40 lines, get the deterministic half with no login and no model call. Genuinely tempting —
and wrong here. Proprietary code in a marketing textarea is a compliance incident waiting for a
screenshot; the output proves the *engine*, which is not the gap; and following it with "register
to see the rest" converts an honest gate into a lead form.

*(This was the in-house proposal before the review. The review's objection is better than the
proposal, and it is recorded here rather than quietly dropped.)*

---

## Explicitly not worth building

| | Why |
|---|---|
| "Verify this signature" button | Trust furniture. Auditors nod; everyone else sees a crypto badge. |
| Live parse time in ms | Computable and irrelevant to anyone scrolling a benefit section. |
| Scripted replays, typing effects, count-ups | Theatre. `TransformationReplay` already is this — hardcoded pipeline steps and pre-typed output lines. It now contradicts the rest of the page and should go, not be extended. |
| Architect / process-owner toggle | Correct UX, not a moment. |
| A competitor comparison table | Reads as a swipe; the point is already made in prose. |

---

## The plan

1. **Now:** proposal 2 as the container, proposal 3 in the right column. Removes the mockup
   reading with no pipeline change.
2. **Then:** proposal 1 as its own piece of work — source anchors first, click-through second.
3. **Also pending:** commit `2435115` (card widened to `max-w-6xl` like every other block, plus
   the "Answered here" markers) is on `fix/v2.4.1-review-findings` and not yet on dev or main.

## Market context these decisions rest on

- **smartShift** — inventories custom code, reports retain / retire / redesign. IT audience.
- **CoreAssess.AI** — a backlog with effort and complexity; sells on "up to 70% faster".
- **SAP Signavio Process Insights** — the only one facing the business, and it mines transaction
  data. It can show a process is slow; it cannot say what a Z-program does inside it.
- **Project Kernseife** — an open-source ATC check. Classification only.

Everyone ships a backlog. A backlog never says why the program exists. That gap is the whole
argument for spending effort on the left column rather than the right.
