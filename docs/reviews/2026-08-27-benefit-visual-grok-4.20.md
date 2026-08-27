# Benefit card — visual design consult — x-ai/grok-4.20

**Date:** 2026-08-27 · **Model:** `x-ai/grok-4.20` via OpenRouter (vision)
**Usage:** 6050 prompt / 1113 completion tokens, 13s.

The model was shown the rendered card at 390px and 1280px, given the component source, the three
rounds of history behind it, and the constraint that every figure on the card is recomputed from a
file in the repository. The brief was visual design only — not copy. **Unedited output.**

---

**1. What is visually wrong**

The eye lands first on the big heading, then immediately falls into a dense wall of medium-grey body text. There is almost no visual hierarchy after that. The two column-split (the only real structural move) feels like two equally heavy prose blocks instead of “question + living evidence” vs “effort + proof”.

The computed evidence — the three big numbers (21/17/4), the bar, the monospace roll-call, and the quoted engine output — all sit at roughly the same visual weight as explanatory copy. Nothing screams “this is the live data that just came out of your file.” As a result the card feels like marketing that happens to contain numbers instead of a tool that is showing you its own output.

The handwritten italic sentence is currently the most visually distinct thing on the card, which is the exact opposite of what should happen.

**2. How the evidence should look**

- The **21 / 17 / 4** must become the single largest, highest-contrast elements on the entire card. They are the proof. Today they are 2xl; they should be 4xl–5xl on desktop, 3.5xl on mobile, with the labels “settled / your call / hand work” in tiny uppercase tracking-widest emerald/amber/rose right underneath each number, not beside them.

- The bar should sit *above* the three numbers as a thin, high-contrast legend (not a decorative progress bar). Make it 6–8 px tall with sharp colour breaks and no border. It currently earns its place, but only if it reads as a “risk allocation” visual, not as another UI element.

- The monospace roll-call (VBAK → I_SALESDOCUMENT etc.) should be in a very light grey box with a faint ruled background (like a code snippet) and slightly tighter leading. It is the single most convincing piece of evidence; give it breathing room and a subtle “SAP naming, straight from release data” micro-label above it.

- The quoted block “Credit Management Custom Logic · line 401” is already good but should be pulled out more aggressively — larger left border, slightly bigger type, and the “Produced by the run…” line moved into a smaller footnote inside the box so it doesn’t compete.

**3. Hierarchy, rhythm, density, colour, type scale**

Current type scale is too flat (only three real sizes). Proposed:

- H2 (main heading): 2.75rem mobile → 3.5rem desktop, font-black, tighter tracking
- H3 (the two questions): 1.5rem → 1.75rem, still black but with a 4–5 px emerald left bar on the business side only
- Body copy: keep at 0.875–1rem but cut the line height on the long paragraphs and aggressively shorten them
- Evidence numbers: 3.5rem mobile → 4.5rem desktop, font-black, tabular-nums, with the colour-coded label underneath in 0.65rem uppercase tracking-[0.075em]
- All “meta” text (hand-written note, produced-by-run, footer facts): 0.6875rem (11px), slate-400, never bold unless it’s a link

Colour: keep the emerald/amber/rose triplet but use it *only* on evidence. Everything else should be stricter: gray-950 for headings, slate-600 for body, slate-400 for meta. The current “everything is medium slate” density is what makes it feel flat.

Spacing rhythm is currently arbitrary. Introduce a strict vertical scale: 24 px between most elements on mobile, 32 px on desktop, with tighter 16 px clusters around the evidence groups.

**4. Mobile (390 px)**

The current single-column is too long and undifferentiated. Structural changes:

- Collapse the two-column grid into one column but **reverse the visual order on mobile**: put the effort/proof side (the one with the big numbers and roll-call) first. Business owners scan for “what does it do?” but technical leads scan for “how much work?”. On a phone the proof should hit first.
- Make the three big numbers a single horizontal row on mobile (stacked labels underneath) so they dominate the top of the second block.
- The quoted engine block should become full-bleed on mobile with tighter padding.
- Footer fact list should become a single column of bullets instead of the wrapped inline list — it currently creates a huge dead zone of low-density text at the bottom.

**5. The one change with the highest impact-to-effort ratio**

**Make the three numbers (21 settled, 17 your call, 4 hand work) dramatically larger, move them to the top of their column on desktop and to the very top of the second block on mobile, and give each its own colour accent.**

This single adjustment does three things at once:
- Creates instant visual hierarchy where there is currently none
- Turns the computed evidence into the hero of the card instead of buried copy
- Makes the whole thing stop looking like marketing and start looking like a live report

Everything else (bar position, roll-call treatment, type tightening, mobile order reversal) is supporting cast to this one move.

Do that and the card will finally feel like it contains real, live, slightly dangerous data instead of another flat SaaS feature block.