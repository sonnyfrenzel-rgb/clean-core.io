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

---

# Benefit-intent search terms in the card

Added 26 Aug 2026, from the Search Console export of the preceding three months plus a scan of
what the market ranks for.

## The trap to avoid first

The benefit keyword space in this market is owned by figures none of us can compute:

> "20–30% faster upgrades" · "70% of processes standardised" · "up to 75% more business value over
> ten years" · "reduce TCO by 62%" · "over 50% of custom code unused"

That is precisely the genre this page spent a release removing. Chasing those terms means writing
those claims. **Leave them.** It is a decision, not an oversight, and it should stay a decision the
next time someone looks at the traffic and wonders why we rank below LeverX for "clean core
benefits".

## What the card is missing, and what it already has

| Present in the copy | Absent entirely |
|---|---|
| `benefit` ×6, `process` ×6, `draft` ×4, `worth` ×2, `free` ×2 | **`upgrade`**, **`risk`**, **`audit`**, **`cost`**, **`value`** |

All five absent terms are true of the product and simply are not written down. `upgrade risk` most
of all: clean core exists for upgrade stability, and a level-D object *is* an upgrade blocker. The
engine knows that; the card never says it.

## The more interesting finding

The benefit-intent queries that actually reach the site are **long-form questions, mostly German**,
sitting at positions 2–10 on an English page:

| Query | Position |
|---|---|
| *how do enterprises continuously validate clean core adherence?* | 2 |
| *wie kann die überwachung sauberer kerne das upgrade-risiko in s/4hana reduzieren?* | 4 |
| *worauf sollten it-verantwortliche bei der auswahl von clean-core-monitoring-tools achten?* | 6 |
| *wie schnell lässt sich eine automatisierte überwachung sauberer kerne implementieren?* | 9 |

Those positions do not come from keyword density on an English page — they come from generative
answer systems extracting it. **The lever is extractability, not repetition.**

## Concrete edits — sentences, not a keyword list

**1 · Name the trigger in the opening**

> "No documentation, no process description, and the colleague who built it left years ago. So the
> code sits there — and nobody dares touch it **before the next S/4HANA upgrade**."

**2 · Call the offer what people search for**

> "You get an answer to both here — a **free SAP custom code assessment** that hands you drafts to
> correct, with the limits named up front."

**3 · Say what the red band actually is**

> "4 stays hand work — **the upgrade blockers**. Out of reach for any generator, flagged rather
> than guessed at."

This one earns its keyword: it is also the clearest explanation of that number the card has had.

**4 · Close on the evidence chain**

> "…and the limits are published before you upload anything. Every run is frozen into a **signed
> audit trail** you can hand to a reviewer."

**5 · The real lever — answer the questions that already rank**

A `FAQPage` JSON-LD on the section, carrying the questions that are already placing, in both
languages, because the German ones hold the better positions:

- *What does a free SAP clean core assessment actually give me?*
- *How does clean core reduce S/4HANA upgrade risk?*
- *Wie reduziert Clean Core das Upgrade-Risiko in S/4HANA?*

The answers are already in the card. They are simply not marked up as question-answer pairs — which
is the whole difference between text on a page and something an answer engine will quote.

Note the language asymmetry before acting on it: German questions rank on an English page. That is
evidence for the German content cluster in `docs/CONCEPT-DE-LOCALIZATION.md`, not a reason to write
German copy into an English card.

## The rule these edits follow

Every added term has to be true of the shipped product and checkable: `upgrade blocker` because a
level-D object is one, `audit trail` because the pack is signed, `free` because it is. No term goes
in because it has volume.
