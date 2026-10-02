# Benefit card — visual design consult — z-ai/glm-5v-turbo

**Date:** 2026-08-27 · **Model:** `z-ai/glm-5v-turbo` via OpenRouter (vision)
**Usage:** 6448 prompt / 7561 completion tokens, 164s.

The model was shown the rendered card at 390px and 1280px, given the component source, the three
rounds of history behind it, and the constraint that every figure on the card is recomputed from a
file in the repository. The brief was visual design only — not copy. **Unedited output.**

---

Here is the visual audit. Your instinct is correct: the card is currently designed like a long-form article when it is structurally a **dashboard summary**. Every element that proves the tool works (the numbers, the bar, the code list, the machine quote) is visually subdued to match the tone of the marketing prose, so the eye reads everything as equal-weight text. It feels flat because nothing has the visual density of *real* data.

---

### 1. What is Visually Wrong

**The eye lands on the H2 (“Nobody can say…”), then gets lost.**  
The H2 is correctly dominant (`font-black`, `text-2xl/4xl`). But the two sub-questions (“Do we still need…”, “What will it cost…”) are also `font-black` and nearly the same size. When the header and the two sub-headers shout at the same volume, the hierarchy collapses. The eye bounces between them instead of moving down the page.

**Evidence is camouflaged as body copy.**  
The 907-line count, the 42 findings, the 21/17/4 split, and the VBAK→I_SALESDOCUMENT roll-call are the *only* reasons to believe this page. Right now they are styled as inline text or simple lists with the same `text-slate-600/700`, `text-sm/xs`, and `leading-relaxed` rhythm as the explanatory paragraphs. A reader cannot distinguish “computed fact” from “marketing claim” without reading every word. For a tool selling *auditability*, this is fatal.

**The bar chart is decorative, not informational.**  
At `h-3` (12px), it reads as a progress indicator or a horizontal rule, not a data visualization. It does not earn the cognitive load of interpreting it. The numbers below it (21, 17, 4) are large (`text-2xl`), but their labels are tiny (`text-xs`) and the color coding is too subtle to associate the number with its band at a glance.

**Dead weight in the prime real estate.**  
The paragraph beginning *“Settled = we can point you at a released successor…”* is a glossary definition. It sits between your strongest data (the bar) and your call-to-action. It kills momentum. Similarly, the paragraph *“With it come the process as BPMN 2.0…”* promises deliverables not shown anywhere else, making the card feel like a brochure for a future feature rather than a demo of a working one.

---

### 2. How Computed Evidence Should Look

Evidence must look **generated**, not written. Apply a consistent “artifact” or “terminal” visual language to everything the engine produces. This creates a binary on the page: *human voice* (prose, slate, serif/sans, loose) vs. *machine voice* (monospace, high-contrast, dense, contained).

**A. The Scope Numbers (907 lines / 42 findings)**  
Pull these out of the `<p>` tag entirely. They are the “header” of your evidence block.
*   **Do this:** Display them as a **stat row** above the bar.
    ```jsx
    <div className="flex items-baseline gap-8 mb-6">
      <div>
        <span className="text-4xl font-black tabular-nums text-gray-950 tracking-tighter">{linesOfCode.toLocaleString()}</span>
        <span className="text-sm font-semibold text-slate-500 ml-2 uppercase tracking-wide">Lines Analyzed</span>
      </div>
      <div>
        <span className="text-4xl font-black tabular-nums text-gray-950 tracking-tighter">{totalFindings}</span>
        <span className="text-sm font-semibold text-slate-500 ml-2 uppercase tracking-wide">Findings</span>
      </div>
    </div>
    ```
*   **Why:** `tabular-nums` and `tracking-tighter` make them feel like a readout. The size jump (`text-4xl`) tells the eye “this is the result.”

**B. The Bar (Risk Distribution)**  
Keep it, but make it a **gauge**, not a hairline.
*   **Increase height to `h-5` or `h-6` (20–24px).**
*   **Add `shadow-inner` and a subtle `bg-slate-200` track background** (if not already implicit) so it looks like a physical slot.
*   **Label the segments inline or directly below in a tighter row** (see next point). The current `dl` wrap is too loose.

**C. The 21 / 17 / 4 Breakdown**  
These are your “verdict” numbers. They should feel like **pills** or **mini-dashboard widgets**, not a definition list.
*   **Do this:** Wrap each in a card-like container with a top-border or background tint matching its color.
    ```jsx
    {/* Replace the <dl> with a grid */}
    <div className="grid grid-cols-3 gap-3 mt-4">
      {bands.map((b) => (
        <div key={b.label} className={`bg-white rounded-lg border border-slate-200 p-3 shadow-sm flex flex-col justify-center`}>
          <span className="text-2xl font-black tabular-nums text-gray-950 leading-none">{b.n}</span>
          <span className={`text-[11px] font-bold uppercase tracking-widest mt-1 ${b.text}`}>{b.label}</span>
        </div>
      ))}
    </div>
    ```
*   **Why:** This turns abstract numbers into discrete objects. The brain registers “three outcomes” instantly.

**D. The Object Roll-Call (VBAK → I_SALESDOCUMENT)**  
This is raw SAP data. It should look like a **snippet from the actual analysis report**.
*   **Do this:** Invert it. Give it a **dark background** (`bg-slate-900` rounded-lg p-4) with **light monospace text** (`text-slate-100 font-mono text-xs`).
*   Style the arrows (`→`) as `text-slate-500`.
*   Style the successors (`I_SALESDOCUMENT`) as `text-emerald-400` (keeps the accent, pops on dark).
*   **Why:** This is the highest-impact change for the ABAP lead audience. It signals “this is real code data we extracted,” not “we typed this list.” It also adds a block of visual weight that anchors the right column (or lower section on mobile).

**E. The Machine Quote (“Credit Management Custom Logic…”)**  
This is the “smoking gun” proving the tool understands business logic. It currently looks like a content card.
*   **Do this:** Style it as a **log entry or system notification**. Give it a thick left-accent border (`border-l-4 border-blue-500`), a very pale blue background (`bg-blue-950/5`), and render the metadata (*“line 401”*) in `font-mono text-xs text-slate-400`. Keep the recommendation text in a readable `text-slate-700` but tighten the leading.
*   **Contrast:** The hand-written sentence above it keeps its emerald left-border and italic serif/sans feel (human). The machine quote gets the “system” treatment (structured, bordered, monospace metadata). The juxtaposition sells the premise.

---

### 3. Hierarchy, Density, and Colour

**Fix the Type Scale:**
*   **H2:** `font-black text-3xl/4xl` (keep, it’s the anchor).
*   **H3s (“Do we still need…”, “What will it cost…”):** **Demote to `font-bold text-lg text-slate-800`.** Remove the `font-black`. They are section headers, not competing headlines. Let them breathe with `mt-8 mb-3` (more space above, less below).
*   **Body Copy:** Keep `text-base/sm text-slate-600`. This is now clearly subordinate to the headers and the “artifact” data blocks.
*   **Micro-copy (labels, definitions):** Standardize on `text-[11px] uppercase tracking-widest text-slate-400` for anything explanatory. This creates a consistent “metadata” voice.

**Colour Rhythm:**
*   **Slate-950/900:** Reserved for the H2 and the Big Numbers (907, 42, 21, 17, 4). This is “truth.”
*   **Emerald-600/700:** Used for the hand-written label, the “settled” band, successor names in the roll-call, and CTAs. This is “safe/resolved.”
*   **Amber/Rose:** Used for “your call” and “hand work.” These are “attention required.”
*   **Backgrounds:** Use `bg-slate-50` for the entire right-column (effort) to separate it from the left (business). Inside that, use `bg-white` for the stat cards (21/17/4) to make them pop forward, and `bg-slate-900` for the roll-call to push it back as “raw data.”

**Kill the Dead Weight:**
*   **The “Settled = …” definition paragraph:** Move it to the **bottom** of the effort column, below the CTA link. Style it as `text-[11px] text-slate-400 border-t border-slate-200 pt-3 mt-6`. It becomes a footnote, where it belongs.
*   **The “With it come the process as BPMN…” paragraph:** Shorten it or move it below the machine quote. It currently acts as a closer for the business column but promises things (BPMN, RACI) that were explicitly removed from the design for looking like mockups. If you can’t show the BPMN, don’t lead with a paragraph about it. Consider cutting it or reducing it to a single line: *“The full run includes BPMN 2.0 process flows, operating procedures, and ownership — generated without technical terms.”*

---

### 4. Mobile (390px) Structural Change

At 390px, the current DOM order (Business → Effort) buries the hard data (bar, numbers, roll-call) below ~1200px of text. A scanner (your ABAP lead) will bounce before reaching it.

**Reorder for Mobile: Show the Data First.**
Use Tailwind’s `order` utilities to flip the columns on mobile while keeping the desktop layout intact.

*   **Effort Column (currently `md:col-span-2`):** Add `order-first md:order-none`. On mobile, this jumps to the top, right after the header.
*   **Business Column (currently `md:col-span-3`):** Add `order-last md:order-none`. On mobile, this drops below the data.

**New Mobile Flow:**
1.  **Header** (H2 + 2 paras)
2.  **Evidence Block** (full width):
    *   “What will it cost us to move it?” (H3, demoted weight)
    *   **907 lines / 42 findings** (stat row)
    *   **The Bar** (now h-5, prominent)
    *   **21 / 17 / 4** (grid of 3 mini-cards)
    *   **Roll-Call** (dark code block, `overflow-x-auto` if needed for long names, though wrapping is fine at `text-[11px]` or `text-xs`)
    *   Definition footnote (tiny, at bottom)
    *   CTA Link
3.  **Business Block** (full width):
    *   “Do we still need this program?” (H3)
    *   Hand-written sentence (emerald accent)
    *   Machine quote (styled as log entry)
    *   Business decision(s) card(s)
    *   BPMN note (shortened)

This ensures that within the first screen-and-a-half on mobile, the user sees **real numbers, a risk distribution bar, and raw SAP object mappings**. That is convincing. The business logic follows as the “explanation.”

For the **Roll-Call specifically on mobile**: if `I_PRODUCTSTORAGELOCATIONBASIC` wraps ugly, apply `break-all` to the successor `<code>` or allow horizontal scroll on that specific `<ul>`: `overflow-x-auto flex flex-col gap-1.5 pb-2`.

---

### 5. The One Change: Highest Impact / Effort Ratio

**Apply the “Dark Artifact” treatment to the Object Roll-Call and the Machine Quote.**

Take the roll-call list (`VBAK → I_SALESDOCUMENT…`) and the quoted recommendation block (`Credit Management Custom Logic…`) and restyle them with **dark backgrounds (`bg-slate-900`), light text (`text-slate-100`), and strict `font-mono`** for the data portions.

**Why this wins:**
*   **Instant Differentiation:** It breaks the “wall of grey” immediately. The eye is drawn to high-contrast dark blocks on a white page.
*   **Signals “Real”:** It mimics the aesthetic of an IDE, a terminal, or a PDF export of an audit report. It subliminally says “this is not marketing copy; this is a screenshot of the tool’s output.”
*   **Low Effort:** It requires only CSS changes (background color, text color, font-family, padding, rounding). No layout restructuring, no new components, no logic changes.
*   **Anchors the Page:** These two dark blocks (one in each column on desktop, or stacked on mobile) act as visual weights that stop the eye from sliding off the page. They turn the card from a “blog post” into a “specification sheet.”

**Secondary quick-win (do this at the same time):**  
Pull the **907 / 42** numbers into the `text-4xl` stat-row format described above, placed immediately inside the “What will it cost” column (or at the top of it on mobile). Together with the dark roll-call, this gives you **three heavy visual anchors** (Big Numbers, Dark Code List, Dark Quote) that make the page look dense with proof rather than padded with words.