# Benefit card consult — z-ai/glm-5.3

**Date:** 2026-08-27 · **Model:** `z-ai/glm-5.3` via OpenRouter
**Usage:** 7585 prompt / 1664 completion tokens, 40s.

The question, the component source, the measured mobile facts and the standing plan
(`2026-08-26-BENEFIT-NEXT-STEPS.md`) were all supplied. **Unedited output — no claim here has been
checked against the code.**

---

## 1 · Diagnosis

The premise — two columns whose *order* is the argument — does not survive a phone, and the measurements prove it: below 1024px the reader meets "What does this thing actually do?", scrolls a full screen, and only then meets "How much work is this?" with no visual relationship between them. The comparison isn't degraded on mobile; it's absent. Worse, the closing sentence refers to geometry that doesn't exist for most visitors.

But the deeper problem is that the card is carrying two arguments when it needs one. The two-column layout was meant to say "the market answers the right question; we answer both." That claim is currently *made by layout* — and layout is the one thing you can't rely on. It has to be made by a sentence, in the header, before any column appears. Once it is, the columns are just containers, and containers can stack without losing anything.

Secondary problems, in order of cost:

- **383 words.** The header alone is four paragraphs before the reader sees a single answer. The owner's "doesn't pick me up" is this: the card opens with a situation description, not with the answer.
- **The BPMN row and RACI table are the mockup reading.** CSS circles and a three-row table with hand-written roles are the two elements that scream "designed in Figma, not produced by a tool." The plain-words sentence is the only left-column element that could plausibly be machine-drafted. Cut the other two and you've removed 80% of the mockup problem without touching the pipeline — a down payment on proposal 2.
- **The identical "✓ Answered here" badges** distinguish nothing. Delete both.
- **"Draft to correct" appears three times.** Once is honest; three is defensive.

## 2 · The restructure

One card, mobile-first, that happens to widen into two columns at `lg` — same DOM, same reading order, same argument sentence. Not two designs.

**What the reader sees, in order:**

1. **Header (short).** The question, the offer, and the argument sentence — all above the fold at 360px.
2. **Question 1: "What does this thing actually do?"** — the plain-words sentence, framed as output of the tool, plus one line pointing at the reference file. BPMN and RACI gone.
3. **Question 2: "How much work is this?"** — the numbers, the bar, the roll-call (proposal 3, cheap, build it now), the link.
4. **One closing line.** Not a paragraph.

At 360px this is roughly one screen. At 1280px, questions 1 and 2 sit side by side under the same header — but nothing in the copy *depends* on that.

## 3 · Copy

**Header:**

> **Nobody remembers what this program does.**
>
> No documentation, and the colleague who built it left years ago. Every assessment tool on the market will tell you how much work it is. None of them will tell you what it does — and that's the question that decides whether it's worth keeping.
>
> This one answers both. Free, no sales call, and the limits are published before you upload anything.

That's the whole header. Four sentences. The argument ("none of them answer the first question") is now a sentence, not a layout.

**Left column:**

> **The business asks: "What does this thing actually do?"**
>
> "Checks open orders against the customer's credit limit and blocks delivery when it is exceeded."
>
> In plain words, from the code — plus the process, the SOP, and who owns each step. A draft to correct, not a blank page.

The last line absorbs the "draft" claim for the whole card. Delete every other instance.

**Right column:**

> **IT asks: "How much work is this?"**
>
> On the 907-line reference program we publish — 42 findings:

(bands, numbers, bar — unchanged, they're the honest part)

> Settled = a released SAP successor from SAP's own data. Hand work = dynpro, native-sql — flagged, not guessed at.

Then the roll-call (proposal 3): `VBAK → released`, `KNKK → no released path`, etc. This replaces the three-bullet list ("Object → released API mapping", "A first RAP or CAP draft", "Matching test scaffolding") — those are feature claims; the roll-call is evidence for the same claim.

**Closing line:**

> Every run is frozen into a signed audit trail you can hand to a reviewer. It doesn't replace the architect — it shows them where to look, and the business why.

## 4 · What to delete

- Both "✓ Answered here" badges.
- The BPMN row — the single most mockup-like element on the card.
- The RACI table — second most.
- The "The usual starting point" eyebrow label (the H2 says it better).
- The fourth header paragraph ("You get an answer to both here…") — merged into the header copy above.
- The "Plus the standard operating procedure…" paragraph — replaced by one line in the left column.
- The three-bullet feature list — replaced by the roll-call.
- The footer link row's third item ("Free for the SAP community…") — already stated in the header.
- Two of the three "draft to correct" instances.

That's roughly 150 words and two sub-components gone. Target: ~220 words.

## 5 · If only one change

Delete the BPMN row and the RACI table. They're the mockup reading, they're a third of the mobile height, and their removal makes the left column honest enough to survive until proposal 2 ships — at which point the plain-words sentence gets siblings that are actually generated, instead of two hand-drawn diagrams that will then have to be deleted anyway.