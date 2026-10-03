# DESIGN.md — Clean-Core.io

**Version 1.7 · 27.09.2026 · accepted by Sonny · binding for everything that belongs to the 3.0 interface** (roadmap steps 1.4–1.7,
Phases 2–8, 3.0). The target picture is shown by the mockups
[`docs/roadmap/clean-core-mockups-v2_8.html`](docs/roadmap/clean-core-mockups-v2_8.html). Decisions with date
and reasoning are in the decision log [`docs/design/decisions.md`](docs/design/decisions.md); this file says
only what applies. In case of contradiction: `docs/ROADMAP.md` for scope and order, this file for look, structure and
behaviour. **References:** `§5.1` is a section of this file, "Roadmap 2.8" or "step 2.8" a step in
`docs/ROADMAP.md`.

The guideline in one sentence: **adopt SAP Fiori patterns, not the Fiori theme** (ADR-001). What makes the SAP community
feel "at home" are floorplans, interaction patterns and vocabulary — not colours and the "72" typeface. The
look stays that of Clean-Core.io.

**Two spaces, one look.** The public pages (landing, knowledge, whitepaper) keep their generous aesthetic —
large radii, mesh background, green accents. The **workspace** is a tool: dense, calm, and green means only one
thing there — evidenced. **One look means: the same tokens everywhere** (ADR-051) — public pages too colour only with
`--cc-*` tokens, never with the Tailwind palette or hex literals; the landing's mesh colours are tokens too. What
applies only publicly are the large radii (§1.4), mesh and grid as background, and `--cc-space-7`.

---

## 1. Look & Feel

Before 3.0 the app spoke two colour dialects (Tailwind `green-600`/`gray-950` and `#006b2c`/`#00873a`/`#0b1c30`), 78
button styles and type down to 8 px. They became one set of **semantic tokens** in `app/globals.css`
(`@theme`, Block D); components use only these. This applies to every page — workspace, stages, account and
public pages (ADR-051).

### 1.1 Colour

All pairs below have been recalculated (WCAG 2.2, relative luminance); the contrast guard (§8) recalculates them on every
build.

| Token | Value | For | Contrast |
|---|---|---|---|
| `--cc-page` | `#f8f9ff` | Page background | — |
| `--cc-surface` | `#ffffff` | Cards, tables, dialogs | — |
| `--cc-surface-muted` | `#f9fafb` | Rows, inner surfaces | — |
| `--cc-ink` | `#0b1c30` | Text, titles; **selected/active in the workspace** | 17.2 : 1 on surface |
| `--cc-ink-muted` | `#4b5563` | Secondary text | 7.6 : 1 on surface |
| `--cc-line` | `#e5e7eb` | Dividers (decorative) | — |
| `--cc-field-border` | `#6b7280` | Borders of input fields | 4.8 : 1 (≥ 3 : 1 required) |
| `--cc-brand` | `#16a34a` | Logo, accents, landing — **never a surface under text** | 3.3 : 1 with white — too little for text |
| `--cc-brand-strong` | `#15803d` | Surface of the primary action, green text on light green | 5.0 : 1 with white |
| `--cc-brand-deep` | `#006b2c` | Hover/pressed of the primary action, brand gradient | 6.7 : 1 with white |
| `--cc-focus` | `#1d4ed8` | Focus ring (§1.6) | 6.7 : 1 on surface |

**Semantic states** — the Fiori categories, mapped onto our own palette:

| State | Foreground | Surface | Border | Contrast foreground on surface | Meaning |
|---|---|---|---|---|---|
| `success` | `#047857` | `#ecfdf5` | `#a7f3d0` | 5.2 : 1 | **evidenced** — only **Proven**, passed, signed |
| `warning` | `#92400e` | `#fffbeb` | `#fde68a` | 6.8 : 1 | partial, draft, assumption, simulation, **outdated (stale)** |
| `error` | `#b91c1c` | `#fef2f2` | `#fecaca` | 5.9 : 1 | failed, invalid, rejected |
| `information` | `#1d4ed8` | `#eff6ff` | `#bfdbfe` | 6.2 : 1 | note, imported, reconstructed, **confirmed by a person** |
| `neutral` | `#4b5563` | `#f9fafb` | `#e5e7eb` | 7.2 : 1 | not started, not determined |

Three rules that follow from this (ADR-007):

- **Green means evidenced — exclusively, in the workspace.** Primary button, active tab, selected row and logo are
  not green there in a way that could be mistaken for evidence: selection and active states carry
  `--cc-ink`, the primary action `--cc-brand-strong` as a surface with white text (a shape no chip has).
- **A claim is not evidence.** *Confirmed* is a self-declaration of the account, not a mandate, and therefore stands
  in `information` with a person icon — never in the green of *Proven*. Management must see the difference at a
  glance.
- **Outdated is not wrong.** *Stale* means "recalculate" and is `warning`, never `error`.

**Boundaries that must be seen have ≥ 3 : 1** (WCAG 1.4.11). What counts here is the border against the surface the
element sits on — other pairs than in the table above: input fields and `ghost` buttons `#6b7280` on white 4.83 : 1;
`secondary` buttons `#15803d` on their surface `#f0fdf4` 4.79 : 1; value states with a border in the foreground colour on
white — `error` `#b91c1c` 6.47 : 1, `warning` `#b45309` 5.02 : 1 (the dark text `#92400e` stays for type), `success`
`#047857` 5.48 : 1, `information` `#1d4ed8` 6.70 : 1; likewise the borders of the outline and stroke chips (§4). The light border colours of the table above are only for surfaces whose boundary is carried
by the text (filled chips, message strips).

**Warning marks** (bars, chart segments, status dots) take `--cc-warning-mark` `#d97706`, not the text colour
`#92400e`: that sits at almost the lightness of `error` (L* 37.5 against 40) and could not be told apart from red in the bar
without colour vision. `#d97706` has L* 60 and 3.19 : 1 on white — enough for a graphic (WCAG 1.4.11), never for
text (D.30).

**Dark exists exactly twice** (ADR-028): the **code surface** `--cc-code-bg` for source code — the only dark
surface for content — and the **overlay** `--cc-overlay` = `#0b1c30` (white on it 17.2 : 1) for temporary
layers above the content: coach mark and toast. A selected segment carries `--cc-ink` as a small surface; that is
selection, not a surface in the sense of this rule.

**Code surface** for source code (source column, build-up, code card):

| Token | Value | For | Contrast on `#030712` · on highlighted line |
|---|---|---|---|
| `--cc-code-bg` | `#030712` | Surface | — |
| `--cc-code-ink` | `#e5e7eb` | Code | 16,3 : 1 · 11,6 : 1 |
| `--cc-code-muted` | `#9ca3af` | Line numbers, comments, elision | 7.9 : 1 · 5.6 : 1 |
| `--cc-code-keyword` | `#c4b5fd` | ABAP keywords | 10.9 : 1 · 7.8 : 1 |
| `--cc-code-literal` | `#fcd34d` | Literals — the values of hidden rules | 14.0 : 1 · 9.9 : 1 |
| `--cc-code-name` | `#93c5fd` | Calls, FORM names | 11.2 : 1 · 7.9 : 1 |
| `--cc-code-hl` | `rgb(59 130 246 / .28)`, left 3 px `#93c5fd` | highlighted line (results in `#132952`) | — |

There are no further syntax colours; the highlight of a line additionally carries the left bar, not only colour.

**No dark mode** (ADR-003). Substitute for users who need it for reasons of eyesight: the product respects
`forced-colors: active` (Windows contrast themes) — states stay distinguishable through word, icon and shape (§4),
focus rings and field boundaries stay visible.

### 1.2 Type

- **Inter** (via `next/font`); monospace for code, IDs, line anchors and ISO dates: `ui-monospace, SFMono-Regular,
  Menlo, Consolas`.
- Scale in the workspace:

| Role | Size / weight | Example |
|---|---|---|
| Project title (object page header) | 22 px / **800**, `-0.02em` | "Emergency purchase approval" |
| Section title (`h2`) | 15 px / **700** | "Process — reconstructed from code" |
| Card title (`h3`) | 14 px / **700** | "Not determined" |
| Body text | 14 px / 500, line height 1.55 | Rule text |
| Table cell, secondary text | 13 px / **500** | Rows |
| Object identifier (title) | 13 px / **600** | "Vendor block list validation" |
| Meta/chip | 12 px / **600** | Chip and tag text, meta line, hint below a field |
| Micro label | 11 px / **600**, CAPITALS, `0.08em` | Column headers, facet label |

**Lower limit 11 px.** No content in capitals, only labels. 900 does not exist in the workspace — it flattens the
hierarchy. **12 px is a step of its own** (ADR-047), not the gap between 11 and 13: chips, identifiers, tags,
meta lines and field hints, always 600 — never for body text and table cells. The stage header (`StageHeader`) follows
the project title, 22 px / 800 (§2.3, ADR-050); landing headers stay with `SectionHeader` (§1.7).

### 1.3 Spacing

A 4 px grid as tokens; there are no other spacings.

| Token | Value | Typical use |
|---|---|---|
| `--cc-space-1` | 4 px | Icon to text, chip inner vertical |
| `--cc-space-2` | 8 px | Between chips, label to field |
| `--cc-space-3` | 12 px | Card padding *compact*, row-height padding |
| `--cc-space-4` | 16 px | Card padding *cozy*, between cards |
| `--cc-space-5` | 24 px | Between sections, page margin from M |
| `--cc-space-6` | 32 px | Object page header to content |
| `--cc-space-7` | 48 px | Landing only |

**One half step, exactly one** (ADR-048): **2 px** (Tailwind `*-0.5`) only inside chips, identifiers and tags
(vertical padding, spacing icon to word) and for optically aligning an icon with the line of text. 6, 10 and
14 px (`*-1.5`, `*-2.5`, `*-3.5`) do not exist — not in `components/cc` either; the guard counts them as a ratchet down to zero.

### 1.4 Shape, depth, background

| | Workspace | Public pages |
|---|---|---|
| Radius card/panel | **12 px** | 22–28 px |
| Radius row, field, button | **8 px** | Pill |
| Radius chip/tag | Pill | Pill |
| Shadow | `0 1px 2px rgb(0 0 0 / .04)`; dialog `0 16px 48px rgb(11 28 48 / .18)` | as today |
| Background | plain `--cc-page` — **no mesh, no grid** | Mesh and grid, `opacity ≤ .18` |

### 1.5 Buttons — exactly four

| Variant | Appearance | Rule |
|---|---|---|
| `primary` | Surface `--cc-brand-strong`, text white, hover `--cc-brand-deep` | **one** per area — an area is a card, a dialog or a bar; the page's main action is in "Next step" |
| `secondary` | Surface `#f0fdf4`, border `--cc-brand-strong`, text `--cc-brand-strong` (4.8 : 1) | further actions |
| `ghost` | Surface white, border `--cc-field-border`, text `--cc-ink-muted` | Cancel, secondary actions; destructive with `error` text |
| `dark` | Surface `#030712`, text white | **only** for the binding confirmation (decision) in the message box or the edit footer — never next to a `primary` in the same bar |

Height 32 px *compact*, 40 px *cozy*. Destructive actions go through a **message box** (§2.6), never through `window.confirm`.

Not buttons in the sense of this rule, but with a fixed appearance:

| Control | Appearance | Where |
|---|---|---|
| **Segmented control** | Border `--cc-field-border`; selected segment surface `--cc-ink`, text white, `aria-pressed`/`role="radio"`; other segments text `--cc-ink-muted` | Views, "Map \| Steps", rule decision (no focus in IT — ADR-058) |
| **Icon button** | like `ghost`, square at button height, icon 16 px, `aria-label` mandatory | Zoom, close, search and menu on S |
| **"Why?" target** | Icon "?" 16 px in `--cc-ink-muted` in a target of at least 24 × 24 px, name "Why: …" | on number and status (§2.10) |

### 1.6 Focus

Every operable element shows a ring on keyboard focus (`:focus-visible`): **2 px `--cc-focus`, 2 px offset**,
radius like the element. Never `outline: none` without this substitute. The focus order follows the reading order.

### 1.7 Icons, motion, illustrations

- **lucide-react**, 16 px in the workspace, 20 px in the header, stroke 2.
- SAP icons (`@ui5/webcomponents-icons`) and illustrations (`@ui5/webcomponents-fiori`) are Apache-2.0 according to npm metadata
  (checked 15.09.2026). Integration only after checking the individual assets and the bundle size (icons around 5 MB
  unpacked) — as SVG paths, never as web components.
- **Motion only where it explains a change of state**, 150–250 ms, can be switched off with `prefers-reduced-motion`. No
  continuous motion, no blinking, no pulsing dots without text. Two stagings are allowed because they explain
  something: the build-up — nodes grow out of their line (§5.1) — and the three views in "New project" (§6.1.1). Both
  run once, can be skipped and stand still under reduced motion. **On the public home page**
  (mockup `docs/roadmap/clean-core-landing-v3_0.html`, accepted) the same rules apply to its interactions:
  the views stage runs once, everything else moves only on the visitor's action.
- **Focus on the dark code surface:** the ring takes `--cc-code-name` `#93c5fd` (11.2 : 1 on `#030712`) instead of
  `--cc-focus`, which would be invisible there.
- **Public pages:** `SectionHeader` keeps pill, size and lead; with 3.0 the weights follow the scale from §1.2
  (at most 800) — roadmap 3.0.6 adjusts `tests/landing-style-guard.spec.ts` accordingly.

### 1.8 Charts

- **Charts that count states** (level distribution A–D, findings per severity) use the state colours — and
  label every category. Level: A `information`, B `neutral`, C `warning`, D `error`, each with the letter
  (ADR-024) — the levels come from SAP's classification file, so they are *Imported*, not evidence, and never stand in the
  signed audit pack; that is why they get no green. Severity: Critical and High `error`, Medium `warning`, Low
  `neutral`, Info `information`, each with the word (ADR-049) — a severity is not evidence and gets no green.
- The warning colour of a mark in a chart is `--cc-warning-mark` (§1.1), not the text colour.
- **All other charts** use the categorical palette and never a state colour: `#334155`, `#4f46e5`,
  `#0d9488`, `#9333ea`, `#c026d3`. Sequential (quantities, progression): indigo `#e0e7ff` → `#a5b4fc` → `#6366f1` → `#3730a3`.
- **The Clean Core Score's bands** run from the error red for *far from clean core* through amber to indigo for
  *close* — owner decision 02.10.2026; green stays reserved for proven. `--cc-score-1 … 4`, in the order of the
  axis: *far from clean core* (5–59) `--cc-error` `#b91c1c` → *significant rework* (60–80) `--cc-warning-mark`
  `#d97706` → *some rework* (81–90) `#4f46e5` → *close to clean core* (91–100) `#1e1b4b`. The first two are the
  state tokens themselves, not a second red and amber. Every band has ≥ 3 : 1 against the card and the page
  (6.5 / 6.2, 3.2 / 3.0, 6.3 / 6.0 and 16.0 / 15.2 : 1 on `--cc-surface` / `--cc-page`; WCAG 1.4.11) — the bar is
  the chart, so no band may fade into the card. Every band is drawn at full strength; the band the score is in is
  told by the marker (ink with a white ring), its range, its label and its highlighted card, never by colour alone
  and never by fading the others; the band label stays ink (ADR-057). One source for every surface that draws a
  band: `scoreBandChartColor` in `lib/chart-colors.ts`.
- **Data marks are drawn at full strength** — no opacity tint on a bar segment, arc or block. Critical and High
  share the error colour; the word and the gap between segments keep them apart. A level block in a chart is filled
  with its level's chart colour, its letter white on A, B and D and ink on C (`#d97706`: ink 5.4 : 1, white 3.2 : 1).
- Every number in a chart is also reachable as text (table or `aria-label`).

---

## 2. Structure & interaction — SAP Fiori patterns

"Oriented on SAP Fiori patterns" — that is how it is put to the outside. "SAP Fiori" is a trademark; the interface is not a
Fiori app and never says so.

### 2.1 Shell

- **Shell bar** at the top: logo and product name on the left, path (Workspace › Project), search ⌘K, help, account menu on the right.
- No side navigation in 3.0: a project is one case, the depth lies in the workspace.

### 2.2 Floorplans

| Floorplan | Where | Pattern |
|---|---|---|
| **List report** | "My workspace" (project list) | Filter bar (§2.5), toolbar "Projects (23)", table, a row click opens the project |
| **Object page** | the workspace of a project | Header, toolbar, anchor bar, sections, footer only when editing (§2.3) |
| **Overview** | Management view of a project | Cards with one answer each, every number with "Why?" |

**With 3.0 everything is new, all of a piece** (ADR-052, Sonny 24.09.2026). No old interface is removed instead
of being rebuilt: the **old dashboard** (`/dashboard`) and the **old stage demo** (`/demo/[stage]`) are rebuilt according to
this file — floorplan, tokens, cc components, language — like every other page. What they can do today
is not lost in the process. The new demo follows §6.1.2.

### 2.3 Object page of the workspace

From top to bottom:

1. **Header:** project title; meta line in mono (project ID, manifest, revision, source state, engine, rule version);
   **KPI facets** — Traceability, Rules confirmed, Level distribution, **Not determined** (count). On the right in the
   header: the **view switcher** as a segmented control "Business | IT | Management" (ADR-008, order ADR-044) and the initials
   of the accounts with read access (roadmap 5.5 — no further personal data).
2. **Status line** (roadmap step 1.4): Provenance · Need · Standard · Costs · Confirmed · Execution · Handover —
   one **object status** each, text with a state dot ("not started", "partial", "draft", "mock only"); as long as nothing is there,
   "not started". The object status says **how far along** something is; the provenance chip (§4) says **where** a
   statement comes from. The two look different and are never mixed (ADR-023): an object status is never a chip with
   an icon, a provenance chip carries only the nine values from `lib/provenance.ts`.
3. **Toolbar:** the seven stages as tools (Analyze … Delivery), left-aligned; on the right export and
   sharing. From breakpoint L open side by side in every view; below L open in IT and a "Tools" menu in
   Business and Management; on S a menu in every view (§2.9, §2.11, ADR-060). Each tool says whether it has
   something of its own on record in this project: a small green check where the tool's own output is on record and
   current (Analyze: a signed run, never a staged source — `toolOnRecord`, amended 03.10.2026), an amber dot
   where it is out of date (inputs changed since), nothing where nothing is on record. A legend in text ("used ·
   out of date") stands beside "Tools" and at the top of the phone menu; each mark has a tooltip and its words for
   a screen reader. The bar says nothing about proof — that stays with the stepper and the status chips, and the
   mark is never called "proven" or "verified" (the one exception to "green says proven", ADR-060). No hover-only
   tooltip: every tool carries its purpose (`PHASE_PURPOSE`) as its accessible description and behind a tap- and
   keyboard-reachable "i"; the phone menu prints it under each tool; the tool the phase contract names next carries
   a "Next" tag, and one line under the bar says which tool is next and what it does (ADR-060, 03.10.2026).
4. **Anchor bar:** for the layers alone — Need & process · Standard fit · Costs & assumptions · Architecture &
   dependencies · Evidence & controls · Changes & commitments. Empty layers are under "More" and say there what is
   missing (§2.11).
5. **Content:** sections of the selected layer. **"Next step"** is a card (rule-based, roadmap step 6.5),
   not a bar — in Business in the header below the disclosure and *Not determined*, in Management and IT at the top of the content.
6. **Footer only in edit mode** (process model, rules): `Save` (primary), `Discard` (ghost), the note
   "Unsaved changes" and a **message popover** (§2.6) with the number of check notes (roadmap step 3.3). Every
   save is a revision (roadmap step 3.2). Outside editing there is no footer.

**The header per view** (ADR-026). In **Business** the content leads, not the project status: below the title stand the
plain-language sentence, the disclosure line with *Not determined* and the "Next step" card; facets and status line are collapsed into
**one** line "Project status", in plain language ("Steps linked to code 92 % · Rules confirmed 0 of 7 · Show
project status"), without level distribution and without *Not determined* — that is already in the disclosure line. In
**Management** and **IT** facets and status line are open. Anchor bar and tools exist in every view — the
tools open side by side from breakpoint L in every view, below it in IT as an open bar and in Business and
Management as a "Tools" menu (§2.11, ADR-060). Below the
view switcher stands one sentence on which question the view answers; "About this view" opens the paragraph on it (§6.1).

Headings: the project title is `h1`, every section `h2`, every card `h3`; no level is skipped.

**How the three navigations work together** (ADR-018) — each has exactly one job:

| Element | Does | Does not | Start | Held in |
|---|---|---|---|---|
| **View** (segmented control) | orders the same content by a question and selects the first answer (§5.6) | changes no data, filters nothing out, opens no page | Business | URL (`?view=`) and browser |
| **Layer** (anchor bar) | jumps to a section of the page and marks where you are | does not switch the view | Need & process | URL fragment (`#need`) |
| **Tool** (toolbar) | opens the stage as a page of its own; "Back to workspace" returns to view and layer; marks whether the tool has been used in this project, or is out of date (ADR-060) | marks no position — the workspace is no stage | — | URL of the stage |

**The header of a stage** (ADR-050). A stage is a tool page of the workspace, not a landing section. Its
header comes from `StageHeader` and stands like the project title: **22 px / 800, `-0.02em`, `--cc-ink`**, as `h1`. The
icon stands neutrally in front of it — 20 px, `--cc-ink-muted`, without a surface; no green bubble, because in the workspace green means
evidenced (§1.1). Above the title the link **"Back to workspace"** (13 px / 600, `--cc-ink-muted`, arrow left; a link,
not a button), which leads back to the view and layer from which the stage was opened — on a demo stage to the demo
workspace (`/demo/workspace`) by the same rule. Below it the same toolbar as in
the workspace (ADR-060): the seven tools with their marks and the legend, the stage's own tool selected in `--cc-ink` with
`aria-current="page"`, each link keeping view, origin and layer — side by side from breakpoint L, a "Tools" menu below.
It is the one way across for every account and in the demo; the seven-circle stepper, its rail and the "Proceed to …"
footer are gone (ADR-061). Every stage stands in the **same frame** (`StageFrame`, ADR-063): way back, tools bar, title and content start at the same x on all seven tools and the demo at every width; a stage sets no width of its own, a narrower block is left-aligned to the frame. Eyebrow and lead
stay, in the scale of §1.2 (micro label, body text).

On scrolling the header shrinks to title, view switcher and the facet line — in Business the "Project
status" line; the anchor bar stays in place. **A
view in the URL is a perspective, not an approval:** a link with `?view=management` opens nothing for which the account
has no read access. The view never lives in the project, run or audit pack (roadmap 6.1).

### 2.4 Tables

- **Object identifier:** title 600, below it the ID in mono (`BR-004`).
- Numbers right-aligned, unit in the column header.
- **Status as text with a dot** (object status) — never colour alone.
- Row actions on the right; toolbar with title and counter ("Findings (42)").
- **Empty** (there is nothing yet): empty state with a sentence and one primary action. **Zero hits** (filter excludes
  everything): "No findings match these filters" and "Clear filters" — never the empty state.
- On S: cards instead of columns.

### 2.5 Filter bar

**Live filter** (ADR-010): search field and up to four filters above the table, effect immediate (200 ms after the last
input), counter in the toolbar, "Clear filters" as soon as one is set. No "Go", no "Adapt filters" — the
data volumes of a project and of a workspace are small. If a list is paginated server-side, it switches
to "Go"; that is then a new ADR. The counter sits in an `aria-live="polite"` region so that a screen reader announces the
effect of the filter ("12 findings").

### 2.6 Messages

| Pattern | For |
|---|---|
| **Message strip** | a note in context, at the top of the section: lock, outdated state, sample data, form error summary |
| **Message popover** | collected check notes in the edit footer, with a jump to the element |
| **Message box** | confirmation before something irreversible — deleting, revoking, deciding — with the consequences in the text. **Modal:** darkened page behind it, the page is `inert`, focus stays in the box and returns to the triggering button on closing; so a second confirmation never stands next to it (ADR-028) |
| **Toast** | only for completed secondary actions ("Export downloaded"): bottom right, surface `--cc-overlay`, `role="status"`, 4 s, at most one at a time, never for errors |

A message strip that appears after an action (form error, failed run) is focusable
(`tabindex="-1"`) and receives focus; a note that is visible anyway (lock, sample data) does not.

### 2.7 Forms and value states

The most used pattern — for confirming rules, inviting, capturing assumptions:

- **Label above the field**, 13 px / 600; help text below it in `--cc-ink-muted`.
- **Required field:** asterisk on the label plus `aria-required`; a form with required fields says "* required" once at the top.
- Fields: input, textarea, select, checkbox (label on the right), radio group with legend, segmented control. Height 32 px
  *compact*, 40 px *cozy*; border `--cc-field-border`.
- **Value state on the field:** border in the state colour and below it **icon + text** (`error`: what is wrong and how to make it
  right; `warning`: what to check; `success` only where a check really took place; `information`: note).
- Validate on leaving the field and on submitting — not on the first keystroke. If submitting fails: message strip
  at the top with links to the fields, focus on the strip.

### 2.8 Loading

- **Skeleton** when the layout is known (header, table, cards) and loading takes longer than 300 ms.
- **Busy indicator on the triggering element** for actions; appears only after 400 ms; the page stays operable.
- No page-blocking spinners. Long runs (analysis, generation) show phases, not percentages that do not
  exist.

**Long runs** (ADR-019):

- **Before the click** the action says what it costs — according to the quota rules (`COMMUNITY_QUOTA` in
  `lib/constants.ts`: five analysis runs per account, once; what counts is a new ABAP source state in Analyze,
  the same own source state again is free, the later stages and the chat do not count; an own Gemini key lifts the
  limit; from roadmap 0.9 every starter example is free once, every further run of the same example counts after
  completion and is announced beforehand): "Uses 1 of your 5 free analysis runs (4 left)", "Free — this source was already analysed", "Not
  counted" or "Uses your own Gemini key". Whether a model is called is a second, separate statement ("No model
  call"). Nothing uses quota without it being stated beforehand; the numbers come from the account, never from the
  mockup.
- **Cancel** is possible during the whole run; a cancelled run leaves no half state behind, and what
  has already been used is stated in the note.
- **Leaving** is allowed. If the work continues on the server, the page says so and shows the
  state on return; if the run would be lost, a message box asks before leaving.
- **Errors** show a message strip with what happened and an action ("Retry", "Run without model") —
  never a raw error text and never silently an empty result.
- **Phases are announced:** an `aria-live="polite"` region names only the change of phase with its result
  ("Process recognised: 14 steps, 5 decision points") — never the running counters, at most one announcement per phase.
- Large sources say early what is coming: "Reading 3 programs, 10,400 lines" — no estimate of a duration.

### 2.9 Density and breakpoints

- **Density by input device** (ADR-011): `(pointer: fine)` → *compact*, `(pointer: coarse)` → *cozy*. Switchable in the
  account menu, stored in the browser, never in the account.

| Breakpoint | Width | Layout |
|---|---|---|
| **S** | ≤ 600 px | one column, tables as cards, toolbar as a menu, page margin 16 px |
| **M** | 601–1024 px | one column, side column below the content, page margin 24 px |
| **L** | 1025–1440 px | content + side column 360 px |
| **XL** | > 1440 px | like L, content at most 1280 px wide, centred; the workspace and its seven tools at most 1536 px — one frame for all of them (ADR-063) |

- **Target sizes:** at least 24 × 24 px (WCAG 2.5.8) *compact*, 44 × 44 px *cozy* and on touch.
- **Order on S** in the Business view: process name and plain-language sentence → disclosure line and *Not determined*
  → "Next step" → process as a step list (§5.7) with "Show map" → code collapsed. The basis for trust never slips
  below the content. Two-way hover becomes "tap highlights, second tap opens" on touch. Coach marks
  appear on S as a hint strip, not as floating bubbles; export is in the toolbar menu.

### 2.10 Search, popover, glossary

- **Search ⌘K** searches the open project: process elements, rules, findings, code lines and glossary terms —
  not other projects. Hits grouped by kind, Enter jumps there. On touch a search button in the shell bar.
- **"Why?" popover:** at the top the provenance chip (§4); below it, what the statement is based on (rule and rule version, engine,
  import or account), the evidence as an anchor, the date in ISO. Closes with Escape, returns focus to its target.
- **Glossary in the text:** dotted underline in text colour — no link style; popover via keyboard (Enter) and hover.
  A glossary term is not navigation.
- **On S** there is no separate "?" target next to every value: value and anchor together are **one** 44 px target that opens the
  "Why?" popover — otherwise a disclosure line breaks into many lines.
- **Initials in the header:** popover with names and "Read access since" (roadmap 5.5), only for the owner.

### 2.11 Show less, lose nothing

For first-time users less is more — the depth stays, it just does not come first (ADR-037, Sonny 15.09.2026):

- **The first screen of a view** shows exactly: the answer to the view's question, **one** next action and
  at most three supporting blocks. Everything else lies one action deeper — collapsed with a count ("Business rules (7)
  · Show"), never removed.
- **Nothing twice.** A number stands in one place; whoever needs it in a second place gets a reference.
- **Metadata on demand.** The mono meta line (project ID, manifest, revision, source state, engine, rules) is open in IT,
  in Business and Management behind "Details".
- **Tools by view.** From breakpoint L the toolbar is open in every view (ADR-060); below L it is open in IT and
  a "Tools" menu in Business and Management.
- **Layers with content first.** The anchor bar shows layers with content; empty ones are under "More" and say there what is
  missing.
- **Tables** show the first five rows and "Show all 42"; filters appear from ten rows.
- **Legends only on demand.** A "Legend" button instead of a permanent row of chips; open once on the first visit.
- **Side column:** at most two cards; further ones under "More about this process".
- **Overlays** of the map are off on first opening; the minimap appears only from 40 visible elements.
- **The check:** Can someone without training say in ten seconds what this is about and what they do next? If
  not, there is too much — not too little.

---

## 3. Language and formats

- **Everything English** (ADR-009, confirmed by Sonny on 15.09.2026) — the interface **and** everything the product
  generates: process name, plain-language sentence, business names, "What this process does", exports. German code stays
  verbatim where it is quoted (literals, message texts at the anchor); what the model names from it is English. This
  file is English as well (since 02.10.2026, roadmap 3.0.14; until then it was German with quoted interface texts in English).
- **Every visible string of new interfaces goes through text keys** (message catalogue), even as long as there is only
  English; the German interface comes after 3.0 (roadmap §7). Provenance labels are keys in
  `lib/provenance.ts`.
- **One exception, explicitly:** the German privacy policy `app/datenschutz/de` is legal text (ADR-053).
  It stays German and verbatim, does not go through text keys and is exempt from the language guards; look
  (§1) and structure apply to it as to every page. No further page becomes an exception without a new ADR.
- **Numbers:** `Intl.NumberFormat('en')`, thousands separator; percentages as whole numbers; unit in the column header.
- **Money** (ADR-022): cost amounts **arise** only in Economics, on the user's assumptions, with a currency code
  (roadmap 0.4). Elsewhere — Management view, decision, export — they appear only as a carry-over with the chip
  *Simulation*, the assumptions revision and "Open in Economics"; never an amount without these three. An amount that **is in the
  code** (the threshold of a rule) is a code fact with a line anchor and not a cost figure.
- **Date:** in text "15 Sep 2026"; in meta lines, tables and exports ISO 8601 `2026-09-15` in mono; times with
  time zone.
- **Line anchors** in mono: `L243`, `L380-412`, finding IDs `CC-017`, rules `BR-004`.

### 3.1 No AI traces

What a language model has written appears on screen, in HTML and PDF exports and in mails like any other
text of this product: rendered, factual, without traces of its origin in the text itself (ADR-014). **Where a text
comes from is said by the chip *Model proposal* — never by the text.**

- **Never raw Markdown characters:** `**`, `__`, `#`/`##`/`###` at the start of a line, single backticks, code fences, `[Text](url)`
  as text, `- ` or `* ` as visible bullet characters in body text, a literal `\n`. Model text is either
  rendered safely or cleaned before display. Exempt are files whose format *is* Markdown (`.md` export).
- **No chatbot phrases and telltale turns of phrase** — neither in model output nor in our own copy. The list has
  two parts (ADR-020), because a text scan cannot tell filler from technical language:
  - **Block list — never, the guard breaks the build:** "As an AI", "as a language model", "I hope this helps", "Great
    question", "Certainly!", "Let's dive in", "In today's fast-paced world", "AI is thinking", "AI-powered".
  - **Style list — a note for humans, no build break:** "delve into", "It's important to note", "In conclusion",
    "seamless(ly)", "unlock", "elevate", "empower", "game-changer", "cutting-edge", "robust"/"comprehensive" as
    filler, introductions with exclamation marks. The QA and UX agents report hits as a `low` finding; in technical text ("robust
    error handling") they stay.
- **No AI symbolism:** no sparkles (✨), robots, magic wands, brains or chips as an icon for model work; no
  labels like "AI-powered", "magic", "Smart …"; no emojis in interface text. "Ask AI" is called "Ask this case".
- **No loading states that play at thinking:** no "AI is thinking…", no typing effect, no dot animation — the
  phase says what is being read or generated right now (§2.8, §5.4).
- **What stays:** the factual provenance statement (*Model proposal*, §4) and, where it is legally necessary or needed for traceability,
  the name of the model in the meta line or evidence — as a statement, not as advertising.

Technically: model output goes through a shared cleanup before display, export and mail (step 1.5,
`lib/model-text.ts`: render Markdown safely or remove it, check the phrase list); prompts demand plain text without
Markdown where nothing is rendered.

---

## 4. Vocabulary — one fixed list in the code

From step 1.5 there is **one** list, `lib/provenance.ts`; the status chip can only show its values, a guard
forbids freely worded provenance badges (ADR-006).

| Value | Label (key) | State | Icon | Meaning | Where it appears, and labels it replaced |
|---|---|---|---|---|---|
| `proven` | **Proven** | success | Check mark in a shield | backed by the engine, a signature or a real run | Signed run, Passed |
| `confirmed` | **Confirmed** | information | Person | confirmed by the account — self-declaration, no mandate | Signed off, confirmed rule |
| `reconstructed` | **Reconstructed** | information | Gear/code | derived from the code, not confirmed | process skeleton, lanes from AUTHORITY-CHECK |
| `imported` | **Imported** | information | File arrow | taken over from a file (ATC, BPMN, usage, SAP catalogs) | Usage import, ATC findings, Catalog Match, Level A–D, Readiness (computed from the levels with rule version) |
| `proposed` | **Model proposal** | warning | Pen (draft) — never sparkles | proposed by the language model, unchecked | AI Generated, business naming |
| `simulation` | **Simulation** | warning | Calculator | computed on assumptions | Economics, Model estimate |
| `demonstrated-mock` | **Demonstrated · mock** | warning | Test tube | shown against mocks, not against real systems | Simulated, mock test run |
| `stale` | **Stale** | warning | Clock | no longer current — recompute | Stale notice |
| `not-determined` | **Not determined** | neutral | Question mark | could not be determined — with a reason | not computed, No verdict |

Every chip carries **word and icon** — readable without colour, in print and for screen readers.

**Shape is the second feature** (ADR-017). Blue carries three values, yellow four; someone who only skims should still
be able to tell self-declaration from derivation and assumption from stale. That is why the shape says **how firm** a
statement is:

| Shape | Look | Values | Means |
|---|---|---|---|
| **filled** | state fill, light border | `proven`, `confirmed`, `stale` | settled — proven, confirmed or certainly stale |
| **outline** | white fill, 1 px border in the foreground colour | `reconstructed`, `imported`, `not-determined` | taken over or derived, not yet confirmed |
| **dashed** | white fill, 1 px dashed border in the foreground colour | `proposed`, `simulation`, `demonstrated-mock` | provisional — proposal, assumption, mock |

In print and under `forced-colors` the fill drops away; *filled* becomes a 2 px border there, outline and dash
remain — the three shapes stay distinguishable.

### 4.1 The other fixed lists — each with its own shape

Provenance is not the only fixed vocabulary. So that nothing looks like a provenance chip that is not one, every
list has its own shape, its own file in the code next to `lib/provenance.ts` and the same guard against free values
(ADR-027):

| List | Values | Shape | Example |
|---|---|---|---|
| **Provenance** (§4) | the nine values | pill with icon, filled/outline/dashed | *Model proposal* |
| **Object status** (§2.3) | not started · partial · draft · open · confirmed · mock only · handed over · done · blocked by SAP · failed — *signed* and *stale* are provenance (§4), not a status | text with a state dot, no border | ● draft |
| **Evidence level** (roadmap 7.2) | E0 none · E1 catalog reference · E2 documented · E3 demonstrated · E4 accepted in the target system | identifier: rectangle, radius 4 px, code in mono, the word after it; neutral for all levels — a maturity of evidence, not a state | `E1` catalog reference |
| **Clean core level** | A · B · C · D | identifier like evidence level, colour per §1.8 | `D` |
| **Rule property** | hard-coded in program · customizing · master data | tag: rectangle, radius 4 px, `--cc-surface-muted`, text `--cc-ink-muted`, no icon | hard-coded in program |
| **Severity of a finding** (ADR-049) | Critical · High · Medium · Low · Info — in `lib/severity.ts` | identifier like level: rectangle, radius 4 px, the word in 12 px / 600 (§1.2); colour per §1.8 — Critical and High `error`, Medium `warning`, Low `neutral`, Info `information`; never `success` | `High` |
| **Requirement priority** (ADR-070) | Must · Should · Could — in `lib/functional-requirements.ts` | tag: rectangle, radius 4 px, the word in 12 px / 600; Must filled ink, Should outlined ink, Could dashed muted — never a state colour, a priority is not a verdict; its reason is written beside it | `Must` |

A rule property says **where** a rule sits, and is never evidence; an evidence level says **how strongly**
a standard candidate is backed, and is never a provenance. A severity says **how urgent** a finding is — it
is neither provenance nor object status, and no finding carries a severity that does not come from this list.

---

## 5. The first look — the workspace opens in the Business view

After a code import or an example, the workspace opens in the **Business view** and shows at once which process it
is (ADR-002).

> **The wow effect is content the user did not expect, in under three seconds, with a line anchor — the
> staging only makes visible where it comes from** (ADR-013).

With an SAP audience it does not come from motion but from recognition: *The thing read my code
and knows what it does — including the rules that are hard-coded in the program.* Everything in this section carries this one
moment.

### 5.1 What carries the moment

- **The code speaks first — during the build-up.** No spinner, but the source: on the left the ABAP text in mono;
  a line lights up at the moment the engine places a finding or a process node there. On the right
  the process map forms — every node grows out of its marked line (short connecting line, 200 ms,
  then it fades). **This is the only animation, because it explains something: provenance.** It shows the engine's real
  events in their order, compressed to the time budget — never an artificial minimum duration.
- **Afterwards the business leads, the code steps back** (ADR-015). With the last stage the page rearranges:
  at the top process name, plain-language sentence, reveal line and *Not determined*; below it the process map; the code becomes
  the second level — a narrow source column that opens as soon as a node or anchor is selected, and via
  "Show source" at any time. Someone who does not read ABAP sees no code line after the build-up that they have to understand.
- **The climax is a reveal, not a dashboard.** The stage ends with a sentence: *"3 business rules
  hard-coded in the program — tolerance 5 % (L412), plant 1000 (L87), vendor block list (L231)."* Every anchor clickable,
  every value with "Why?" (roadmap 2.8). The sentence only claims what the code proves: that the rule is hard-coded in the program
  — not that it is documented nowhere. This is the sentence someone forwards to colleagues.
- **A sentence in plain language that is true.** Below the process name: *"Approves emergency orders above the limit only when
  …"* — with an anchor. Without a model call it stays technical (`FORM check_limit → …`); that still impresses, because it is proven.
- **The doubt is answered at once.** Right next to the reveal: *"3 not determined — dynamic call in L502 …"*.
  For a sceptical audience that is part of the moment: the tool claims nothing it does not know.
- **Time to first insight ≤ 3 s, "Skip" always visible.** The first stage is there before the user moves the
  mouse. A counter only rises with the line that is lighting up — never counting up for show, never a
  placeholder. If the engine takes longer, the stage says what it is reading (*"reading include Z_MM_PO_TOP"*), not a
  progress bar.

### 5.2 The stages

1. **Code read** — lines light up, counters follow the lines: lines · programs · tables · findings.
2. **Process recognised** — the process skeleton (roadmap 2.3) grows out of the marked lines; decision points carry
   their condition from the code. From here the workspace is usable.
3. **In business language** — the technical names change once to business names, with the chip *Model proposal*. Without
   a model call (model unreachable or deselected) the stage is dropped; the skeleton keeps its technical names —
   a valid result.
4. **This is your process** — process name, the plain-language sentence with anchor, the **reveal line** with the hidden
   rules and next to it **Not determined**; below it the same facets as in the header (§2.3): Traceability · Rules
   confirmed · Level distribution · Not determined.

**The start signs the reading** (ADR-072). Starting an example, a snippet or one's own code signs the engine's reading
at once — the same signed run every analysis ends in, at the cost every start screen states before the click. The
build-up names it as its last moment, "Process map", and the end state stands on the full map, drawn from that signed
run; the map is never drawn from source no run signed. With the model on (the account's analysis stage and a key —
owner decision 03.10.2026), the start asks the model for the analysis narrative at the first moment of the build-up,
with the Analyze prompt, and the one signed run carries it; the last moment waits for it with "Writing the narrative
(model)…", the seconds waited and "Go on without the narrative", 90 s at most. Without an answer in time the same run
is signed with the engine's reading alone, and the page says the narrative was not written, why, and offers *Write the
narrative in Analyze* with its cost. With the model off there is no model call.

**The model does not hold up the build-up** (ADR-025). The ≤ 3 s apply to stages 1, 2 and 4 — they come from the
engine. Stage 3 needs a model call and may take longer: after 3 s at the latest stage 4 is there with technical
names, the stage line says "Naming in business language …" with "Cancel". When the names arrive, they change once, with
an announcement in the live region — never under an open popover or a focused node; there only once it is
closed. If the call fails, the technical names stay, and a message strip offers "Retry".

`prefers-reduced-motion` shows the end state at once — the reveal line is still at the top. "Skip" jumps to
the same end state. A second visit has no build-up.

### 5.3 The first ten seconds after

- **Two-way hover:** node → code lines light up; code line → node lifts (roadmap 2.5). The first coach
  mark invites it: *"Select the decision point."*
- **One question is already answered.** *"Ask this case"* shows, when first opened, an asked question with answer and
  anchors (*"What happens when the limit is exceeded?"*) — **derived from the branches of the code** (roadmap 2.1,
  chip *Reconstructed*), without a model call and without touching the user's quota.
- **Standard fit as the second surprise**, one level deeper: *"2 of 7 rules have a standard candidate (scope item … —
  to verify)"* with evidence level (roadmap 7.2). Never "the standard covers it" as long as the level does not carry that.
- **Take-away:** "Export PNG" and "Export PDF" of the process map with provenance chips and anchors. **No public
  link** — sharing stays read access by invitation (roadmap §8); an export is not an approval.

### 5.4 What explicitly not

Confetti, decorative gradients, typewriter effects, pulsing dots, loading animations without content, *"AI is
thinking…"*, artificial minimum durations (like the six seconds the Evidence Scanner once took). Everything that costs time and
shows nothing lowers the credibility the moment needs.

**The one deliberate exception (owner decisions, 01.10.2026 and 03.10.2026, ADR-072):** the first look's build-up
runs at a pace a first-time reader can follow, about 20 s (within 15–25 s), even when the engine is done in a few frames
— code read to 2.5 s, process recognised to 8.5 s, names to 11 s, the rules in the code to 14.5 s, what is not
determined to 17.5 s, the map to 20 s; no step under 2.5 s. Each step says one headline — what it means for the reader
— and moves one thing: the reading line runs through the source with its line counter, the nodes grow on the map out of
the line the code centres on, the names change once, the rules and then the open points light at their lines and gather
over the dimmed map, and the code gives way to the numbered story the Business view opens on, each step with its line,
while the whole map settles beside it. The step strip is six icons on
a progress line; counters are one quiet line under the headline. Every frame shows real content — lit source lines and
the engine's own nodes with their anchors, counters that only rise with a lit line — so it is not a wait without
content; motion is transform and opacity only. The last moment waits, at most 8 s, for the start's signed run, so the
build-up ends on the full map; with the model on it waits for the narrative as well, up to the 90 s ceiling counted from
the build-up's start, saying so with the seconds waited and a way not to wait — only if it is still pending when the
build-up ends (owner decisions 03.10.2026). The limits stay: "Skip" is always visible, "Pause" stops the clock and
"Continue" runs it on, `prefers-reduced-motion` and Skip go straight to the end state, a second visit has no build-up,
and the end state never waits for a model — the map's place says what is still being written and signed
(`lib/first-look-buildup.ts`).

### 5.5 What is there afterwards

- **Content, at the top:** the card "Next step" — "Confirm the 7 rules — about 10 minutes", one click to the first rule.
- **Head of the content:** process name, plain-language sentence, reveal line, *Not determined* (§5.1).
- **Middle:** the process map; click or Enter on a step opens the source column with marked lines.
- **The process stays in sight** (ADR-059, ADR-072): in Business the full map follows directly under the head and *Next step*, drawn from the start's signed run; where no signed map stands below (IT, Management, a project with no run), the drawing that grew in the build-up stays in the head of the content, whole and in plain names, with a way to the full map.
- **The work area under the map** (ADR-072): in Business the status and the tools stand under a title, "Work from this process", with the other two views one click away — the process is the entry, every view and tool starts from it.
- **The way back** (ADR-072): "← My workspace" above the title of the object page, at every width.
- **Side column, "What this process does":** five sentences, each with an anchor; unproven ones grey (like `AnchoredNarrative`).
- **Side column, "Not determined":** every open spot with a reason and the next way — dynamic call, missing include,
  usage unknown (never "unused"). This column is intentional: it is the reason to trust a result.

### 5.6 Three views of the same case

| View | The question | The first answer on screen |
|---|---|---|
| **Business** | Do I still need this, and what changes for me? | Process, business rules (hidden ones too), standard fit with scope item ID, Not determined |
| **IT** | What exactly, where to, and is it right? | Findings with line and both catalog views, successor API, chain object → meaning → decision → target, architecture contract |
| **Management** | What do I risk, what do I decide? | The decision with its one next action beside **fit to standard** (ADR-069: one figure, the SAP objects across the four buckets, what blocks the standard path and what does not, by name); readiness with rule version and history, the four buckets per object (Retire · Keep · Rebuild · No catalogued path), the open decision and costs only as *Simulation* in folds below |

The chain **object → meaning → decision → target → status** can be clicked through in every view, and every number states
its coverage ("42 findings in 907 of 907 lines · 2 includes not read"). On S the chain is a list
one below the other, one link per line.

**The four buckets** (ADR-033, Sonny 15.09.2026) — rules per object, no percentage thresholds; the first that applies wins,
and every assignment shows its evidence:

| # | Bucket | Rule | Evidence on the object |
|---|---|---|---|
| 1 | **Retire** | the rule the object serves is confirmed "Drop" — **or** the usage import shows zero executions over at least **13 months** | decision with revision · or usage import |
| 2 | **No catalogued path** | needed, Level C or D, **an SAP catalog object without a released successor** and without an extension path — or named in neither of the two SAP files | entry in the Cloudification Repository, with data basis and synchronisation date |
| 3 | **Rebuild** | needed, Level C or D, and there is a successor or extension path — as well as every modification and every own write access to SAP tables: that is own work, never SAP's | successor API · BAdI · finding |
| 4 | **Keep** | needed and permitted for the **project's target platform**: Public Edition only Level A, Private Edition A or B | level and target platform |
| — | *not assigned* | level unknown or *Not determined* | with a reason |

- **The buckets depend on the target platform.** The same B object is *Keep* in the Private Edition, in the Public Edition
  *Rebuild* or *No catalogued path*. The card names the target platform in the answer sentence; changing the target platform
  re-sorts and says what moved.
- **Retire is transparent.** Every Retire assignment from usage shows the source, the period with dates and whether it contains
  a year-end close: *"No executions in SUSG, 2025-08-01 to 2026-08-31 (13 months, includes year-end close)"*.
  Less than 13 months never yields Retire, but *"Usage window too short: 4 months — needs 13"*. Without an import there is
  Retire only via a business decision, never via "no usage known". The popover rule is there verbatim:
  *"Why 13 months: period-end and year-end programs run once a year."*
- **Unconfirmed rules make the assignment provisional:** *"16 Rebuild — 9 on rules not yet confirmed"*.
- A statement for the whole project needs no threshold: **one** object without a Public Cloud path blocks the
  Public Cloud decision.

**First the answer, then the number** (ADR-029):

- **Management** begins with a sentence above all cards that answers the view's question: *"One decision open
  (DEC-1). It waits for counter-check S2. 4 objects block a Public Cloud decision."* Every card begins with its
  answer sentence as its title — *"Readiness 58 on rule set 1.3, up from 42 with the same rules"*, *"4 objects block a Public
  Cloud decision"*, *"No cost winner yet — option C is incomplete"* — and only below it number, chart and table.
  Classifications that are easily misread ("a grade, not a compliance percentage"; "Simulation, not a quote")
  are in the answer sentence or directly below it, never only in the popover.
- **IT:** the chain belongs to a selected finding. The table marks the selected row, the chain sits above it
  with "Chain for CC-017 — select a finding to follow its chain", a click on a chain link filters the table, and
  the coverage is stated with it: *"Chain complete for 31 of 42 findings · 11 end at Not determined"*.

### 5.7 The process map without a mouse

The map is the core of the Business view; every way to it must also work without a mouse, without sight and on the phone
(ADR-016).

- **Map and step list are equivalent.** A toggle "Map | Steps" above the map; the step list shows
  the same content as an ordered list: step, lane, for decision points the condition from the code and the branches,
  anchor, provenance chip. On S "Steps" is the start, "Show map" opens the map.
- **Keyboard:** the map is **one** tab stop; inside it the arrow keys move along the flow (→/↓ next
  step, ←/↑ previous; at a decision point ↓/↑ choose the branch). Enter opens the source column, Escape closes
  it and returns focus to the node. `+`, `−` and `0` zoom and fit; the same commands as buttons.
- **Focus is hover:** a focused node marks its code lines as on hover; a focused
  code line lifts its node.
- **Screen reader:** every node is a button with a name from kind, title, anchor and provenance (*"Decision point: amount above
  limit? Lines 243 to 251, reconstructed"*); the map as a whole is a named group with a one-sentence overview
  (*"Process with 14 steps and 5 decision points"*). A live region announces the stages of the build-up (§2.8).
- **Targets:** nodes at least 24 × 24 px *compact*, 44 × 44 px on touch (§2.9).
- **Width:** The source column opens **in place of the side column** (L, XL) — its contents stay reachable as tabs
  of the same column ("Source · Not determined · What it does"). Selecting a node therefore never shifts
  the page. The map never scales labels below 11 px; what does not fit is reached by panning, "Fit"
  and the levels from §5.9, and above the map it says what is visible ("Showing 16 of 25 elements").
- **Print and export:** the map prints with anchor and chip as text below every node, one level (§5.9) per page with
  the path as header. If a level does not fit the page width legibly (font ≥ 11 px), the
  step list prints instead of the map — and says so in one line.

### 5.8 BPMN from ABAP — the palette

More than the minimum (ADR-031, Sonny 15.09.2026), but only what the code **proves**: every element arises from a
pattern in the code, carries its line anchor and survives the exchange as BPMN 2.0 XML with SAP Signavio. The yardstick is the
product's most complex example, `ZLEGACY_ORDER_FULFILLMENT_AUDIT` (1,000 lines, `public/starter-examples/`).

| BPMN element | arises from | in the example |
|---|---|---|
| **Start event** | entry: `START-OF-SELECTION`, transaction, BAdI method, RFC module — **plus (2.14): `FUNCTION name.`, a public method of a *global* class, a dynpro event (`MODULE … OUTPUT` and `… INPUT`), and a `FORM` that no `PERFORM` reaches** — **and (ADR-054) the beginning of every expandable subprocess:** a `FORM`/method that is drawn as a collapsed subprocess with its own level begins in that level at a start event on its `FORM`/`METHOD` line. Only there: on the caller's level the subprocess stays a box; a routine that is drawn as one step (small, decision table, technical helper), and the body of a multi-instance get none | Audit run started (L161); "Execute actions" begins (L435) |
| **End event** | normal end of the entry or subprocess, at the closing word — **and (ADR-054) an end event of its own for every early exit:** `RETURN`, `EXIT` outside a loop and `STOP` end on their own statement; the condition is written verbatim on the incoming edge. A `CHECK` that leaves the routine or the block does not count: it is a conditional flow (row *Conditional flow*, rule 5 of the engine), not an element of its own, and leads on to the normal end. **Directly before the end of the block is not an early exit:** if nothing that is drawn follows up to the end of the block, it stays the normal end; two `RETURN`s in a row in the same branch are one | Audit completed (L176–179); "Collect orders and items" ends early without orders (`EXIT`, L252) |
<!--
  The four new entry forms (2.14, 23.09.2026) and the three rules that keep
  them narrow — they are here because the row above would otherwise be read as
  an invitation to guess.

  **Within one kind of evidence there is no ranking.** Two function modules
  are two entries, PBO and PAI are two entries, two user exits are two
  entries. A precedence exists only *between* kinds, and only where the source
  itself is unambiguous: a program that writes `START-OF-SELECTION` has
  said where it begins.

  **"Public" does not mean "callable from outside".** The first draft read every
  `PUBLIC SECTION` as an entry and gave `Z_ORDER_INTEGRITY_CHECK` six
  start events — but `CLASS lcl_x DEFINITION` without `PUBLIC` is only visible
  within the program. Now `DEFINITION … PUBLIC` is required. The one
  exception is RAP handlers: there the `FOR …` clause is the evidence, not the
  visibility, and it is written verbatim in the source.

  **What triggers is not guessed.** Every entry that is not an event block
  carries `triggerNotDetermined` — a function module named `z_cc_idoc_input`
  gets no IDoc start event. The name says IDoc; the engine does not.

  **And "not applicable" is a result.** An upload that contains only an interface
  reports `entry-not-applicable` with an explanation and the next step
  ("upload the implementing class") — not zero steps and not
  "no entry found" either, which sounds like a fault of the reader.
-->

| **Error end event** | `MESSAGE … TYPE 'E'/'A'/'X'`, `RAISE`, `LEAVE PROGRAM` after an error | Selection rejected (L183, L189), not authorised (L202, L209) |
| **Collapsed subprocess** | a `FORM`/method with an effect of its own and more than three elements; the phases of an entry | "Enrich customers" (L276–301), "Execute actions" (L435–451) |
| **Call activity** | `CALL TRANSACTION`, `SUBMIT … AND RETURN`, call of another own program | Change sales order via batch input, VA02 (L467) |
| **Task** | step with an effect without a type of its own | Record simulated delivery block (L442) |
| **Service task** | `CALL FUNCTION` locally (BAPI, function module) | Write audit log in the update task (L509) |
| **Send task** | mail, message, outbound IDoc (`SO_NEW_DOCUMENT_SEND_API1`, `MASTER_IDOC_DISTRIBUTE`) | Mail summary (L573) |
| **User task** | a person acts in the program: `CALL SCREEN`, popup, list for viewing in the dialog | View result list, ALV (L616) |
| **Business rule task** | a `FORM` that classifies or scores from literals (`IF/ELSEIF` chain on business data); opens as a **decision table** | Derive customer risk (L303–317), score order risk (L335–396) |
| **Exclusive gateway** | `IF`/`CASE`/`CHECK` on business data, condition verbatim on every edge | Risk points ≥ 80 · ≥ 50 · otherwise (L424–431) |
| **Parallel gateway** | only where the code proves parallelism: `STARTING NEW TASK` with `WAIT UNTIL`/`RECEIVE RESULTS`, bgRFC | — |
| **Conditional flow** | switch of the selection screen (`CHECK p_x = abap_true`) — as a condition on the flow, not as a gateway of its own | Credit check only with "RFC" (L399), mail only with "Mail" (L558) |
| **Multi-instance, sequential** | `LOOP AT <Tabelle>` over business objects, **whose body does not leave the block**; if the body draws no element, it is an activity with the same marker instead of a level | per order (L423), per item (L320), per customer (L287) |
| **Loop** | `DO`/`WHILE` without a table — **and every `LOOP AT` that the body leaves** (`EXIT`, `CHECK`, `CONTINUE`, `RETURN`, `STOP`, error end, `SUBMIT` without return) | — |
| **Error boundary event** | handled exception: `EXCEPTIONS … = n` with a `sy-subrc` branch, `TRY/CATCH` | RFC error: +10 points, warning, continue (L408–415) |
| **Timer intermediate event** | `WAIT UP TO n SECONDS` | — |
| **Message intermediate event (send)** | workflow event (`SAP_WAPI_CREATE_EVENT`, `SWE_EVENT_CREATE`) | — |

**The exception in the two rows above, because it is not self-evident**
(2.17, 23.09.2026). A multi-instance says: *the same flow, once per
element*. A `LOOP AT` that an `EXIT` jumps out of says something else —
there the further course depends on **which** iteration broke off, and
that is exactly what a container cannot show. A cycle can. The rule
therefore decides on the **statements** of the body, not on the drawn
graph, and an `EXIT` in a nested loop leaves only that loop.

Measured on `ZLEGACY_ORDER_FULFILLMENT_AUDIT`: 11 loops, 11 markers, **0
cycles**, 9 of them with a level of their own and 2 without (pure computation loops). Across all
eight examples 17 loops and 17 markers, and **no `loop-back` edge left in the
export**.

The side effect that nearly spoiled the rule: `collapseSmallRegions` saw
the new small regions and folded whole iterations into one box —
`AUDIT_TRAVEL_EXPENSES` lost 7 of 13 nodes. A region that contains a
multi-instance is therefore never a step.

| **Collapsed pool + message flow** | another system: `CALL FUNCTION … DESTINATION`, mail recipient, file system | credit system `PRD_CREDIT_RFC` (L401–402), mail recipient |
| **Data store** | tables read/written; SAP tables and Z tables distinguishable. In Business shown via the overlay "Data" (§5.9), in IT and in the export always there | reads VBAK, VBAP, KNA1, KNB1, MARA, MARD; writes ZSD_ORD_RISK, ZSD_LEGACY_LOG |
| **Data object** | file, result list | CSV to `C:\TEMP` (L538) |
| **Lanes** (proposal) | AUTHORITY-CHECK, user/batch context, naming — always *Model proposal* or *Reconstructed* | batch run · reviewer (outside the program) |
| **Text annotation** | what the code does not say, on the element: *Not determined*, hard-wired values | "Review entry is a table row — who works on it is not determined" (L500) |

**Why subprocess start and early ends (ADR-054, Sonny 27.09.2026).** Measured on the
process benchmark (`tests/prozess-benchmark/`, 200 cases), start and end events were the
weakest node kinds: 37 % of the expected starts and 65 % of the expected ends were hit, because
every routine was drawn without a beginning of its own and five exits of a routine ran together on *one*
end at the `ENDFORM`. BPMN and SAP Signavio draw both differently: every level has
a visible beginning, and every way out ends where it goes out. With the rule the
node hit rate rises from 69.4 % to 78.7 % (starts 71 %, ends 86.5 %); `CHECK` stays
a conditional flow to the normal end, and without it in the rule the rate is the same. For the user
this means: **events are not steps** — no step count, no counter of the overview, the
run variants, the first look or the minimap counts them, the step list numbers only
steps, and the minimap shows an event as a round cell. **An early end is
recognisable:** it is called *"End (early)"* in step list, outline, code map and editor, carries
the word above the circle on the map, and its name gives the routine and the keyword
(`SELECT_ITEMS (EXIT)`), the condition is on the edge before it.

**Not in the palette:** inclusive, complex and event-based gateway (not reliably derivable from `IF` chains),
compensation, escalation, transaction and event subprocess, choreography. Commit boundaries and
update task are IT knowledge and are in the overlay "Technical", not as a BPMN construct.

**What is not drawn is said:**

- **Code not reached** — forms that are called from no entry point do not appear in the flow,
  but below the map: *"Not reached from any entry point: 17 forms and 2 screen modules, 341 lines (L653–993)"*, with anchors. In the
  example: `legacy_business_rule_001` to `_014`, Native SQL, `SUBMIT`, `CALL SCREEN`.
- **Clones** — forms built the same way are summarised: *"14 forms identical except the rule number"*.
- **Technical helpers** — forms without an effect of their own (`add_log`, `bdc_dynpro`, `bdc_field`, `append_fieldcat`)
  become part of their caller; the map says *"4 technical helpers folded in · Show"*. A form is a step only
  if it writes, calls another system, decides on business data or involves a person.

### 5.9 Large processes — navigation

Fully expanded, the example yields around 90 elements. No screen shows that legibly, and shrinking is not
navigation. Therefore (ADR-032):

1. **Levels instead of zoom.** The map opens in the **overview**: the phases of the entry as collapsed
   subprocesses, at most around twelve elements — in the example check selection · check authorisation · collect orders and
   items · enrich customers · check stock · score risk · check credit externally · decide and execute
   actions · log and report. Enter or double-click opens a subprocess as a level of its own;
   a level shows at most around 25 elements, otherwise it splits at its own `PERFORM`s. "Expand here"
   expands a small subprocess in place.
2. **Path at the top.** A breadcrumb line above the map shows the level — *Order audit › Decide and process actions ›
   Set delivery block* — every link jumps back; `Alt+↑` goes up one level.
3. **Outline on the left.** The step list from §5.7 becomes a **tree** (`role="tree"`) with the same nesting,
   every phase with line range and counters (decision points · findings · hard-coded · not determined). Selection in the tree
   shows the element on the map and vice versa. On S the tree is the map.
4. **The overview is already a map of the problems.** Every collapsed subprocess carries a line with text,
   not only colour: *"2 D · 3 hard-coded · 1 not determined"*. Whoever reads the overview knows where to open.
5. **Minimap** bottom right from L: the visible section as a frame, dragging pans; search hits and selection
   as marks. `M` hides it. Never on S.
6. **Highlight path.** At an end event or node: *"Show paths to here"* — all paths from the start to there remain,
   everything else steps back: lines and fills in `--cc-line`, labels in `--cc-ink-muted` (7.6 : 1) — never
   transparency that pushes text below 4.5 : 1; *"Main path"* shows the way to the normal end via the
   default branches. The highlight sits as a filter line above the map and is gone with one click.
7. **Run variants.** The switches of the selection screen sit as toggles above the map — *Update mode · Batch input
   · Remote credit check · Mail · Download · Result list* — with the value from the code as default. A switch set to
   "off" hides the branches that then cannot run, and the line says so: *"Showing the run with update
   mode off: delivery blocks are simulated"*. Only switches whose condition is written verbatim in the code.
8. **Overlays as filters.** Findings · Level A–D · Hard-coded · Not determined · Data · Technical — one toggle each
   with a count; an overlay marks elements with a text identifier, it does not change the flow.
9. **Search jumps.** ⌘K finds elements on all levels, opens the level of the hit, marks it and states *"3 of
   7"*; Enter and Shift+Enter go on.
10. **Stable layout.** The same program yields the same layout — users learn where a step is. Whoever
    moves things in edit mode saves a revision.
11. **An address for every spot.** Level and selection are in the URL (`#map=decide-and-process&node=gw-bdc`); a link
    opens exactly there — within the read access the account has.
12. **Keyboard in addition to §5.7:** Enter opens a subprocess, `Alt+↑` one level up, `F` fits, `M`
    minimap, `P` path to the selected element; all shortcuts under "Keyboard shortcuts" in the help menu.

In the export collapsed subprocesses stay real BPMN subprocesses — Signavio can jump into them like the
map.

### 5.10 Business statement: proposal on top, evidence below, contradiction marked

On the element and in the list of all business statements (ADR-055, roadmap 17.10):

| What | How |
|---|---|
| **Proposal** (path B, model) | on top, reading size 13 px, `--cc-ink`, followed by the chip *Model proposal* |
| **Evidence** (path A, engine) | directly below, 12 px, `--cc-ink-muted`, preceded by the chip *Reconstructed*; never drops away for the proposal. If the engine has no sentence at these lines, that is what it says |
| **Contradiction** | on the proposal, no chip: a 2-px edge stroke on the left and one line of words with an icon — *Contradicts the evidence* (`warning`) or *Not supported by the code* (`neutral`). The reason and the lines sit one action deeper (§2.11, `<details>`) |
| **Request** | a button *Propose business sentences* (Secondary), after the first proposal *Ask the model again* (Ghost); next to it, before the click, the cost line per §2.8 — one model call, does not count against the analysis runs, counts against the hourly limit of model calls; with your own key "with your own Gemini key". Only the owner has it; an invited reader sees what the owner requested |
| **Without proposal** | not requested, discarded, for an earlier source or failed: the engine's sentences alone, as before — no empty area, no error tone; a reason, if one is known, in `--cc-ink-muted` |

Never automatic: opening the stage costs no model call. For every account since roadmap 3.0.1 (ADR-061).

---

## 6. Assistance

### 6.1 Must (part of 3.0)

| Help | Design | Technology |
|---|---|---|
| **Why?** on every number and every status | "?" target, opens provenance, rule and evidence | Popover component; data from the run and `lib/provenance.ts` |
| **Empty states that teach** | Illustration, one sentence of prerequisite, one primary action | `EmptyState` (step 1.5) |
| **Not determined** as its own area | §5.1, §5.5 | Engine limits (`support-matrix`), check tasks (roadmap step 7.5) |
| **Errors with a next step** | Message Strip with an action, never raw error text | Error mapping in the component |
| **Glossary in the text** (ADR-034) | underlined technical term (§2.10), explanation reachable by keyboard: at most two sentences, "What it means for your decision", for SAP terms the source | `lib/glossary.ts` with a source per entry, accessible popover |
| **Glossary in "Ask this case"** | Technical terms in answers carry the same underline and the same popover; a question "What is …?" about a glossary term is answered by the entry itself, with source and "No model call" | the same source as in the text; the answer states when it comes from the glossary |
| **Example notice** | Message Strip "Example project — fictitious code" | Project field of the examples |
| **The very first start** (ADR-030, ADR-041) | because every workspace contains the demo, there is no empty "No projects yet": above the list sits the card "Your turn — start with an example (free) or your own code" with `primary` "New project", as long as no own project exists next to the demo. Only if the demo cannot be loaded does the empty state "No projects yet" appear, with "New project" and "Try an example" | List Report |
| **Import, before it happens** | "New project" says before the upload: which files (ABAP source, includes, ZIP), what is read and stored, what the analysis costs ("Uses 1 of your 5 free analysis runs" or own Gemini key, per §2.8; separately, where a model is called), what is produced without a model call, who can see the code (only the account, read access only by invitation) | Import dialog; quota from the account |
| **About this view** | one sentence under the view switcher on which question the view answers; the link opens a paragraph on what the view shows and what it does not | Text key per view |
| **Keyboard, screen reader, phone** | §1.6, §2.9, §5.7 | Step 3.0.4 |

**The glossary at launch** (ADR-034, Sonny 15.09.2026) — a term belongs in it if it appears on a screen of 3.0
and a process owner or manager does not know it for certain:

- **A · SAP and Clean Core:** Clean Core · Clean core levels A–D · Released API · Classic API · Cloudification
  Repository · Successor · ABAP Cloud · Key user extensibility · Developer extensibility (on-stack) · Side-by-side
  extensibility (SAP BTP) · BAdI · Modification · Customizing · Scope item · Fit-to-standard · Public Edition and
  Private Edition · ABAP Test Cockpit (ATC) · Usage data (SCMON, SUSG) · BPMN · SAP Signavio — plus, from today's
  glossary, RAP, CDS View, OData, SAP LUW; the duplicate entries "BTP" and "SAP BTP" become one.
- **B · Terms of this product** — nobody can look them up anywhere else: Line anchor · Traceability · Run and signed
  run · Provenance · Not determined · Evidence level E0–E4 · Readiness ("a grade, not a compliance percentage") · The
  four buckets · Simulation · Hard-coded rule · Check task · Confirmed ("a self-declaration, not a mandate") ·
  Unreached code · Sub-process level.
- Technical terms of a single process (release strategy, info record, plant) do not belong in the product glossary.

### 6.1.1 "New project" — understand first, then start

Whoever clicks "New project" in "My workspace" first gets, in a few seconds, **what Clean-Core.io is and what it does
differently**, sees **the three views in motion** and then chooses **example or own code** (ADR-038, Sonny
15.09.2026). One page, two parts, no wizard with a progress bar.

**Part 1 — What it is** (open the first time; afterwards one line "What is Clean-Core.io? · Show", remembered in the
browser):

- **One core sentence:** *"Understand a piece of custom ABAP and decide what happens to it — every statement tied to a line
  of your code."*
- **Three lines on what is different**, each with an icon, no words from the style list (§3.1):
  1. *"Reads your code before any model does. Every finding points to a line."*
  2. *"Says what it could not determine — and never passes an assumption off as a fact."*
  3. *"One case, three views: Business, IT and Management see the same facts, each answering its own question."*
- **Clean Core at three glances** — visible the first time, without a click; one line high where possible (ADR-040,
  Sonny 15.09.2026). Factual, in the language of the SAP community, every statement with a source:
  1. **What clean core means.** One sentence — *"Keep the SAP core standard: extensions use only released, upgrade-stable
     interfaces — in-app with ABAP Cloud or side-by-side on SAP BTP."* — and a small diagram: the SAP core as a
     block with its boundary of released interfaces, next to it *in-app* and *side-by-side*, a modification
     as an intrusion into the core.
  2. **The four levels.** A ladder A → D with identifiers and colours per §1.8 (A `information`, B `neutral`, C
     `warning`, D `error`) and one line each: **A** released SAP APIs and extension points · **B** classic SAP APIs
     following SAP's recommendations · **C** internal SAP objects — only with a changelog check before each upgrade ·
     **D** not recommended — modifications, implicit enhancements, writes to SAP tables. Below it: *"Levels follow
     SAP's clean core level concept. The level shown for an SAP object is our reading of SAP's published data; your
     own objects, which SAP has not classified, are graded from your code and labelled as such. Either way it is an
     orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit."*
  3. **Where the evidence comes from.** A flow in reading direction — side by side where the width allows, otherwise from
     top to bottom —, every station with a provenance chip (§4):
     *Your ABAP source* (every statement with a line anchor) → *deterministic engine* (rule version) → *SAP's published
     data*: Cloudification Repository — release states and successors — and SAP's classification file, with
     count and **date of the last sync** from the catalog, never fixed in the text (*Imported*) → *your imports*,
     optional: ATC results, usage data (*Imported*) → *a language model* only for names and wording (*Model
     proposal*). Own Z objects without a catalog entry carry *"estimated from the code, no SAP catalog entry"*.
  On L three columns, on M two plus one, on S stacked — the ladder stays vertical, the flow runs from
  top to bottom. No illustrations with people, no stock photos, no gradients; lines in `--cc-field-border`,
  identifiers as in the workspace.
- **The three views in motion** — the only thing that moves on this page:
  - A compact stage with the **real** view switcher above it (the same component as in the workspace — whoever has
    seen it here knows it there).
  - **One fact travels through three views.** From the example "Emergency purchase approval", the rule *Vendor
    block list* with its anchor `L231`. The anchor stays fixed in its place — it is the sign that it is the same
    fact —, only the content around it changes:
    - **Business** — *"Do I still need this?"* · "Rejects requisitions for vendors on the block list" · Tag *hard-coded
      in program* · Keep · Change · Drop
    - **IT** — *"What exactly, where to?"* · `Z_MM_PO_APPROVAL` `L225–234` · reads the own table
      `ZMM_VEND_BLOCK` directly · *"estimated from the code, no SAP catalog entry"* — no level letter, because a
      customer object has no catalog entry
    - **Management** — *"What do I risk, what do I decide?"* · "Rebuild — part of decision DEC-1" · costs only with
      *Simulation*
  - **Sequence:** the switcher marker glides, the content cross-fades (200 ms each), each view stays 3.5 s. **One
    pass** Business → IT → Management, then the stage stays on Business, with "Replay". No
    endless loop.
  - **Operation:** hover or focus pauses; a click on a view takes over and ends the automatic switching.
    "Skip intro" is always visible.
  - **`prefers-reduced-motion` and S:** no automatic switching. With reduced motion the three views stand
    as three narrow columns side by side; on S one chooses via the switcher.
  - **Screen reader:** the switcher is a tab list, the stage its panel; automatic switching announces nothing.
  - **Honest:** all content from the real run of the example, labelled *"Example · Emergency purchase approval ·
    fictitious code"* — no staged marketing picture.

**Part 2 — How to start?** Two selection cards, one primary action whose label follows the choice:

- **"Try an example"** — preselected the first time. The eight examples as short lines from
  `lib/starter-examples.ts`: name, one sentence on what it shows, lines, *small*/*large*; the 1,000-line example with
  *"large — shows how big processes stay readable"*. Primary action "Open example" → build-up (§5.2).
- **"Use your own code"** — primary action "Continue to upload" → import dialog (§6.1, "Import, before it happens").
- Under both it says what is counted (§2.8, roadmap 0.9): for an example *"Free — examples don't use your
  analysis runs the first time"*; for an example already run, before the start, the warning *"You ran this
  example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes."* as a Message Strip
  `warning` with "Run again" and "Open the earlier result"; for own code *"Uses 1 of your 5 free analysis runs (4
  left)"* or the own Gemini key.

### 6.1.2 The demo project — warm up, then start yourself

Every account finds in "My workspace" a **fully worked demo project** that it can click through without risk;
everywhere in it stands the invitation to start an example or own code now (ADR-041, Sonny 15.09.2026).
Goal: keep lowering the threshold to the first own use.

- **Clearly marked.** In the list the first row with tag *Demo* and *"Fully worked example · fictitious code"*;
  in the project at the top a Message Strip `information`: *"Demo project — fully worked, fictitious code. Nothing you do here
  is saved."* with "Reset demo". The demo project can never be mistaken for an own project: its title begins
  with "Demo ·"; if the account starts the same example itself, the own project carries the example's name without
  this prefix.
- **Fully worked.** Every stage and every view has content: analysis with a signed run, confirmed rules,
  standard fit with evidence levels, costs as *Simulation* with assumption revision, a confirmed decision,
  handover package. **Everything from a real run** of an example — no invented numbers; if the engine or
  rule version changes, the demo is regenerated with the release.
- **Clicking without consequences.** Confirming, deciding, filtering and editing work; the state lives only in the
  browser and disappears with "Reset demo". Nothing is saved, nothing counts against the quota.
- **One demo for everyone, no copy per account.** The account stays unchanged, no data per user is created, and
  the demo is always at the product's current state — also for accounts that already exist.
- **A new demo, not the old one carried on** (ADR-052). The demo's stages (today `/demo/[stage]`) are rebuilt according to
  this file: the same stage headers (§2.3), tokens, chips and messages as in an own project. The demo
  stays a separate route without a path to signing, quota and export — what is new is the look, not this boundary.
- **The tour** — more coach marks than in an own project, because this is where one learns: around twelve stations along the
  way — reveal · Not determined · process map and source column · layers of a large process · confirming a
  rule · standard fit · IT chain · Management view · four buckets · costs as simulation · decision ·
  handover (views in the order Business · IT · Management, ADR-044). A station appears only when one arrives at its place; only ever one; *"3 of 12"* as text; "Next",
  "Pause tour", "End tour". Progress only in the browser (ADR-036).
- **The invitation again and again — without pushing:**
  - permanently in the demo strip: *"Try an example or your own code"* as a link to "New project";
  - at the end of every third tour station and at the end of the tour a card *"Your turn: start with an example (free) or
    your own code"* with `primary` "New project";
  - in "My workspace", as long as no own project exists next to the demo, a card above the list with the same
    invitation.
  - At most **one** invitation per screen, never as a dialog, never blocking — if the card stands at the end of a
    station, the link in the demo strip steps back for that time. As soon as the account has started an example or own code,
    only the link in the demo strip remains.

### 6.1.3 Own code — trust before uploading

Whoever uploads own code hands over something valuable. The import dialog therefore says next to the upload, in a
calm tone, what applies and what we do — only what is evidenced, every statement with a link to the place that carries it (ADR-042,
Sonny 15.09.2026):

- **What you commit to** — one line, no additional checkbox (the terms of use were accepted at
  sign-up): *"By uploading, you confirm you may share this code for analysis, including with the Google Gemini API
  (Terms §5 and §8)."*
- **What we do so that you can trust us:**
  - *"Stored in the EU — Google Cloud, Belgium (europe-west1)."* (Privacy Policy)
  - *"Only your account and the platform's administrator account can open this project. Others see it only if you
    invite them."* (`firestore.rules`: owner or admin — never leave out the admin as long as the rule allows it;
    the privacy policy is to name the admin access before the card goes live)
  - *"Model calls go through our server; keys never reach the browser. Your own key is stored encrypted."* (Terms §5,
    "How we handle your data" `/trust`)
  - *"Every analysis is sealed as a signed, unchangeable run."* (`SECURITY.md` §14)
  - *"No analytics, advertising or tracking cookies."* (Privacy Policy §7)
  - *"Delete your account and projects at any time; backup copies age out within 30 days."* (Privacy Policy §5, §6)
  - *"With our community key, Google does not use your code to train its models (paid Gemini API terms). With your
    own key, your Google account's terms apply."* (Privacy Policy — which explicitly names the paid tier of the community key
    before the card says it; Sonny 15.09.2026: the community key runs on a paid
    key)
  - *"Our security model is public."* — links to **"How we handle your data"** (`/trust`) and to `SECURITY.md` in the
    public repository
    (`https://github.com/sonnyfrenzel-rgb/clean-core.io/blob/main/SECURITY.md`)
- **No commercial project:** *"Clean-Core.io is a free community project. There is no paid tier, we accept no
  payment, and we do not sell, rent or commercially use your code."* (Terms §2, Privacy Policy)
- **Form:** a card "Your code and your trust" in the side column of the import dialog, statements as short lines
  with an icon, links as text; on S below the form; collapsed on every size with "Why you can trust this · Show" (Sonny 30.09.2026: on the desktop too). No seals,
  no certificate logos, no superlatives.

### 6.2 Want (ranked by benefit)

1. **Three coach marks on the first workspace** — "Select the decision point", "This is what we could not determine", "Your
   next step". Dismissible, remembered **only in the browser** — never in the account, never in the database, no usage log
   (ADR-036). "Show tips again" in the help menu brings them back.
2. **"Ask this case"** — always the embedded help AI, expanded for 3.0 (ADR-043): in the project restricted to the
   project's evidence, answers with anchors; outside it, product and SAP help; one assistant, not a second chat; the first,
   pre-answered question comes from the code without a model call (§5.3).
3. **Checklist up to the decision** — derived from the next step, without a model call. Its must form
   is the "Next step" card (§2.3).

---

## 7. Rules for agents and contributions

- An SAP Fiori guidelines skill (if set up) is consulted **only** for layout, behaviour, naming and
  accessibility; every colour, font and spacing value from it is ignored — §1 and the tokens apply.
- No SAP theme (Horizon, Quartz), no "72" font, no `sapUi*` variables, no UI5 Web Components.
- A new colour, a new radius, a new spacing or a fifth button style is a change to this file with an
  ADR, not a detail in the code.
- Every statement on the screen keeps the product rule: missing stays missing, simulated stays simulated, reconstructed
  stays reconstructed (`docs/ROADMAP.md` §11).
- The UX agent checks new surfaces against this file (`docs/UX-REVIEW-AGENT.md`); before a new surface is built
  it checks the draft and the mockups (`node scripts/ux/design-review.mjs`).

### 7.1 Print and export

- `@media print`: no background, text `--cc-ink` on white, cards with a 1-px border instead of a shadow, no tool
  bars and footer bars.
- Chips print **word and icon** (icons monochrome), states remain distinguishable without colour.
- Anchors and IDs are printed as text; links with the target in parentheses, where it is not an anchor.
- No breaks in the middle of a card or table row.

---

## 8. How it is held

| Rule | Guard |
|---|---|
| Landing and stage headers from one component; every stage on the scale §1.2 | `tests/landing-style-guard.spec.ts`, `tests/workflow-style-guard.spec.ts` — since D.30 also the scale: every visible text of a stage at 11/12/13/14/15/22 px, ≤ 800, one page title, no heading larger than it |
| **Contrast of all token pairs** (text ≥ 4.5 : 1; field, button, value state and chip borders as well as focus ≥ 3 : 1 against their surface) | Contrast guard from step 1.5: computes WCAG contrasts from the tokens in `app/globals.css` — without a new dependency; axe/pa11y on rendered pages afterwards as a separate step |
| Chips in three forms (filled, outline, dashed) per §4; distinguishable under `forced-colors` and in print | Guard from step 1.5 over `lib/provenance.ts`, rendered with `forcedColors: 'active'` |
| Process map: one tab stop, arrow keys, named nodes, step list equivalent (§5.7) | rendered keyboard test from step 2.5 |
| Heading order `h1` → `h2` → `h3` per view; every live region at most one announcement per event; Message Box modal and `inert` behind it | rendered test from step 3.0.4 |
| Object status, evidence level, level, rule property and severity only from their fixed lists, in their form (§4.1) | Guard from step 1.5 |
| Tokens instead of hex literals, four button styles, font ≥ 11 px, spacings from the scale | `tests/design-source-guard.spec.ts` (R1–R19) and `tests/cc-token-guard.spec.ts` (hex, palette, undeclared tokens, classes of the unregistered Typography plugin) over all of `app/**` and `components/**` (without the route handlers `app/api/**`); rendered `tests/design-rendered-guard.spec.ts` on every route. Since D.30 **zero, without an exception list** — the ceilings `tests/design-baseline/` and `tests/design-rendered-baseline/` are deleted |
| Provenance only from `lib/provenance.ts`; green only for `proven`/`success` | `tests/cc-provenance-guard.spec.ts` — since D.30 app-wide: only the chip paints provenance, only `CcSeverity` severity, no superseded word as text |
| No state colour without text; focus ring on every operable element | Style guard, checked rendered |
| Visible texts of new components only via text keys | Guard from step 1.5 |
| **No AI traces:** no Markdown remnants, block-list phrases or AI symbolism in rendered pages, HTML/PDF exports and mails | Guard from step 1.5: scans the rendered text and the exports against Markdown remnants and the **block list** from §3.1 (`.md` exports excluded); copy guard over `app/`, `components/`, `lib/`; since D.30 symbolism and emoji over every screen (`app/**` without `app/api/**`, `components/**`) and rendered on every route of the design tour (`tests/model-text-guard.spec.ts`). The **style list** is checked by the QA and UX agents as a hint, not a guard |
| Print image: chips with a word, no bars | rendered test with `emulateMedia({ media: 'print' })` |
| No dark mode | Guard from step 1.6 |
| **Named exceptions** — the only ones (D.30) | `.md` export (Markdown is the format there, not a remnant); `app/datenschutz/de` (legal text in German, E-7); code surface (`CcCodeSurface`, `pre`, `code`: quoted code, own mono sizes); landing mesh and public radii (§1.4, E-5: R12 applies only in the workspace); standalone exports in `lib/` (colours once as values in `lib/export-style.ts`, raw tables in the templates) — each as a rule with a reason in the guard, none as a list entry |

---

## Changes to this file

| Version | Date | What |
|---|---|---|
| 1.8.5 | 03.10.2026 | Management on the whole frame with one fit-to-standard figure (ADR-069, owner 03.10.2026): the decision and its one next action beside fit to standard, the SAP objects across the four buckets and what blocks the standard path by name; the rest in four folds (Evidence, Options and the decision, Costs, Process), collapsed and remembered in the browser only. The tools bar's check means the tool's own output is on record — Analyze a signed run — and every tool says what it is for without hover (ADR-060 amended 03.10.2026) |
| 1.8.4 | 02.10.2026 | The switch for everyone (roadmap 3.0.1, ADR-061): every account opens its projects in the workspace and "My workspace" is the list report; the stepper, its rail and the linear stage footer are gone; a demo stage's "Back to workspace" leads to the demo workspace (§2.3, the header of a stage; §5.10) |
| 1.8.3 | 02.10.2026 | One frame for every stage (ADR-063, owner 02.10.2026): the seven tools and the demo stages stand in the workspace's 1536 px column, header and content at the same x on every tool: §2.3 the header of a stage, §2.9 XL |
| 1.8.2 | 02.10.2026 | The tools bar marks use, not proof (ADR-060 amended, Sonny 02.10.2026): a green check for a used tool, an amber dot for an out-of-date one, a text legend beside "Tools" and in the phone menu: §2.3 item 3, the navigation table, the header of a stage |
| 1.8.1 | 02.10.2026 | Tools side by side from breakpoint L in every view, each with the stepper's mark for its phase, and the same bar under "Back to workspace" on every stage and demo stage (ADR-060, Sonny 02.10.2026): §2.3 item 3, the header per view, the navigation table, the header of a stage, §2.11 |
| 1.8 (draft, for acceptance by Sonny) | 30.09.2026 | Block D completed (D.30): all guards apply to `app/**` and `components/**`, the exception lists are deleted, only named exceptions remain (§8); `--cc-warning-mark` `#d97706` for warning marks in bars and dots (§1.1, §1.8); generated Markdown text in `.cc-prose` on the scale §1.2 |
| 1.7 | 27.09.2026 | Business statement as the model's proposal above the engine's sentence, contradiction as an edge stroke with words instead of a chip, requesting only via a button with a cost line (§5.10, ADR-055, roadmap 17.10) |
| 1.6 | 27.09.2026 | Events in sub-processes and at early exits (ADR-054, Sonny 27.09.2026): every expandable sub-process begins in its layer at a start event on the `FORM`/`METHOD` line; `RETURN`, `EXIT` outside loops and `STOP` end on an end event of their own with the condition on the edge — directly before the end of the block it stays the normal end; a leaving `CHECK` stays a conditional flow to the normal end. Events nowhere count as a step, a premature end is called "End (early)" (§5.8) |
| 1.5 | 24.09.2026 | Decisions E-1 to E-7 from Block D ("the whole app all of a piece"), Sonny 24.09.2026 (ADR-047 to ADR-053): 12 px / 600 as the step "Meta/Chip" in the scale (§1.2); 2 px only in chips, identifiers and for icon alignment, 6/10/14 px not (§1.3); stage header like the project title 22 px / 800, `--cc-ink`, neutral icon, "Back to workspace" (§1.2, §2.3); severity of a finding as a fixed list `lib/severity.ts` with identifier form and colours (§1.8, §4.1, §8); tokens instead of the palette on public pages too, large radii and mesh only there (introduction, §1); old dashboard and old stage demo are rebuilt according to this file, nothing is removed instead of rebuilt (§2.2, §6.1.2); German Datenschutzerklärung as the legal-text exception to §3 |
| 1.4.3 | 15.09.2026 | Reconciliation with the accepted landing page 3.0: the trust sentence names the admin access that `firestore.rules` allows; the source for the encrypted key is Terms §5 and `/trust`, not `SECURITY.md` §4 (those are S/4 credentials); tour stations in the view order Business · IT · Management; motion on the start page, focus ring on the code surface, weights of the `SectionHeader` |
| 1.4.2 | 15.09.2026 | "Ask this case" always runs via the embedded help AI, which is expanded for 3.0 (ADR-043, §6.2) |
| 1.4.1 | 15.09.2026 | Clarifications from the last mockup reconciliation, no new decision: project status line without *Not determined* (it is in the reveal); tools as a menu in Business and Management, empty layers under "More" also in §2.3; path highlighting via colour instead of transparency (contrast); the IT view of the views stage without level letters for a customer table; evidence flow side by side or stacked; no empty workspace next to the demo; demo title "Demo ·"; one invitation per screen also at the end of a station; tour example "3 of 12"; "the same own source state" in §2.8 |
| 1.4 | 15.09.2026 | Decisions by Sonny on the open questions of the design reviews (ADR-031 to ADR-042): BPMN palette beyond the minimum, measured against the 1,000-line example, with user task, data store, business rule task, call activity, sub-processes, boundary and message events; unreached code, clones and technical helpers are stated instead of drawn (§5.8); navigation of large processes with layers, path, outline tree, minimap, path highlighting, run variants, overlays as filters and addresses (§5.9); four buckets as rules per object, depending on the target platform, Retire from usage only from 13 months and transparent (§5.6); glossary at launch with SAP and product terms, also in "Ask this case" (§6.1); coach marks only in the browser (§6.2). Gaps from the mockup reconciliation closed: place of "Next step" per view, shrinking Business header, card titles `h3`, object status "handed over" and "done", provenance of the readiness, source column without wrapping the page, "Why?" on S. Confirmed: everything English (ADR-009), no dark mode (ADR-003). Slimming down for first-time users without loss of depth (ADR-037, §2.11). "New project" explains the core and the difference and shows the three views in motion before one chooses example or own code (ADR-038, §6.1.1); examples free once, repetition announced beforehand (ADR-039); Clean Core, the four levels and the provenance of the evidence at three glances on first trying it (ADR-040); a fully worked demo project for all accounts with a tour and recurring invitation (ADR-041, §6.1.2); before the upload, commitment and evidenced trust statements, "free community project" (ADR-042, §6.1.3) |
| 1.3 | 15.09.2026 | Second design review by the UX agent, this time with the mockups 2.8 (ADR-026 to ADR-030): Business header with a collapsed project status line in plain language, "About this view" as a sentence under the switcher, heading order (§2.3); further fixed lists with their own form — object status, evidence level, level, rule property (§4.1); Message Box modal, dark only for the code surface and overlay (§1.1, §2.6); "one area" for the primary action defined (§1.5); Management answers before the number, IT chain per selected finding with coverage (§5.6); very first start, import explanation and "About this view" as a must (§6.1); live announcements only per stage of progress (§2.8); contrast pairs labelled unambiguously. Quota texts aligned with `COMMUNITY_QUOTA`: five analysis runs, model call as a separate statement (§2.8) |
| 1.2 | 15.09.2026 | Design review by the UX agent incorporated (ADR-015 to ADR-021): after the build-up the business leads, the code becomes the second layer (§5.1); the reveal says "hard-coded in the program" instead of "nobody documented" — only what the code evidences; process map without a mouse with step list, arrow keys, named nodes and print rule (§5.7); chips with form as a second feature — filled, outline, dashed (§4); interplay of view, layer and tool with start and URL, view in the URL is not a sharing approval (§2.3); long runs with quota before the click, cancel, leave, error strip (§2.8); visible boundaries ≥ 3 : 1 — field, Ghost, Secondary, value states (§1.1); `forced-colors` as a substitute for dark mode; live regions for filters and stages of progress, focusable strip, toast with `role="status"`; target sizes and order on S (§2.9); search, "Why?" popover, glossary and initials (§2.10); phrase list split into block list (guard) and style list (hint); references to roadmap steps unambiguous. Reconciliation with the mockups 2.8 (ADR-022 to ADR-025): cost amounts arise only in Economics and appear elsewhere only with *Simulation*, assumption revision and "Open in Economics", amounts in the code are code facts (§3); status line as object status separate from provenance chips (§2.3); Level A–D and Catalog Match as *Imported*, Level A blue instead of green (§1.8, §4); stage 3 does not hold up the build-up (§5.2); facets in the build-up as in the header; width of the map with the source column open (§5.7); code surface with tokens and contrasts (§1.1); Segmented Control, icon button and "Why?" target (§1.5) |
| 1.1 | 15.09.2026 | No AI traces (ADR-014, §3.1): no Markdown remnants, chatbot phrases or AI symbolism; provenance only via the chip. First glance reworded (ADR-013): wow as content with a line anchor — the code speaks first, nodes grow out of their lines, reveal line of the undocumented rules, doubts answered immediately, one question answered beforehand from the code, standard candidate as the second surprise, export instead of a public link; explicitly not: confetti, typewriter, minimum durations. External review incorporated (ADR-007 to ADR-012): primary surface `--cc-brand-strong` (white on `#16a34a` had 3.3 : 1); green only for evidence, *Confirmed* in `information`; *Stale* as `warning`; views as a Segmented Control instead of a second navigation bar; stages into a toolbar, "Next step" as a card, footer bar only when editing; UI language English with text keys; workspace with 12/8-px radii and without mesh; density by input device; `dark` only for binding confirmation; weights 800/700/600/500; build-up ≤ 3 s; new: spacing scale, focus token, forms and value states, filter bar, loading, breakpoints, chart palette, formats, print, contrast guard; decisions into the decision log |
| 1.0 | 15.09.2026 | First version |
