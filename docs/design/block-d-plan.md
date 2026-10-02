# "All of a piece" — gap list against DESIGN.md 1.4.3 and removal plan D.1 ff.

as of 24.09.2026 · Sonny's brief: "the whole app must be all of a piece before 3.0" · read only, nothing changed in the repo.

## 0. Basis and method

- **Measured state:** `integrate/next-3.0` @ `3498609` (pp-int), on top of it the files that `feat/3.0.6-landing` @ `c859e89`
  (pp-306) changes, adds or deletes (`app/page.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `app/facts`,
  `app/whitepaper`, `components/landing/*`, `SectionHeader`, `HeaderAuthButton`, `CatalogSearch`; deleted, among others,
  `BenefitCard`, `TransformationShowroom`, `PilotWarningBanner`, `SamplePackageDownload`). pp-306 is 10 commits behind
  `integrate/next-3.0`. Merged measurement tree: `design-audit/tree/` (230 UI files `.tsx` under `app/` and
  `components/`, without `app/api`).
- **Scripts** (all in the scratchpad `design-audit/`, repeatable): `measure.mjs` (main measurement, result `metrics.json`,
  `summary.json`), `perfile.mjs` (debt per file, `perfile.txt`), `iconbtn.mjs`, `inputs.mjs`, `badges.mjs`,
  `orphans.mjs`, `table.mjs`.
- **Limits of the measurement:** source-text heuristic, no rendered measurement. Comments are stripped; conditional rendering
  and classes from variables are not resolved. The numbers are therefore orders of magnitude per file, not exact
  pixel findings — the rendered truth only comes with step D.2. Where a single piece of evidence is quoted, the line has been
  checked.

### The picture in one paragraph

The new world is clean: `components/cc`, `components/workspace`, `components/process-map`, the gallery and the
workspace route have **0** hex literals, **0** palette colours, **0** type under 11 px (except for two places),
**0** `font-black` — held by `cc-token-guard`, `cc-style-guard`, `cc-provenance-guard`, `workspace-shell-guard`
and `workspace-a11y`. The landing page from pp-306 is close. **Everything else is the old app:** the seven stages
(which remain as tools in 3.0, roadmap 3.0.1), settings, admin, the old dashboard, the knowledge and
public pages and the shared legacy components. 193 of 230 UI files import not a single cc component;
the seven stage pages import **none**. No guard except `dark-mode-guard` and the blocklist reaches beyond the
new namespace.

### Debt per area (source-text hits)

| Area | <11 px | 900 | Hex | Palette | Green | raw `<button>` | native dialog | own overlay | Radius >12 | Shadow lg+ | Gradient/mesh | dark surface | free notice box | Emoji | AI icon | Spacing off-grid |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stages (7 pages + `components/analyze`, `design`, `tco`, `documentation`) | 470 | 314 | 512 | 3,048 | 624 | 102 | 2 | 8 | 247 | 85 | 36 | 80 | 139 | 92 | 23 | 433 |
| Shared legacy components (`components/*.tsx`) | 94 | 120 | 56 | 1,192 | 266 | 82 | 4 | 13 | 113 | 51 | 7 | 37 | 47 | 5 | 9 | 226 |
| Settings | 42 | 70 | 18 | 462 | 84 | 35 | 13 | 2 | 60 | 16 | 9 | 9 | 20 | 7 | 0 | 61 |
| Dashboard (old) | 24 | 30 | 92 | 394 | 97 | 42 | 2 | 8 | 28 | 16 | 15 | 15 | 15 | 20 | 0 | 63 |
| Admin | 24 | 41 | 1 | 299 | 35 | 16 | 5 | 0 | 27 | 15 | 3 | 15 | 13 | 2 | 0 | 68 |
| In-app knowledge pages & shell (`app/(app)/*` otherwise) | 38 | 163 | 1 | 977 | 307 | 8 | 0 | 2 | 96 | 28 | 28 | 9 | 32 | 6 | 8 | 94 |
| Public pages (`app/*` without landing) | 29 | 204 | 101 | 920 | 191 | 6 | 0 | 1 | 67 | 6 | 4 | 13 | 27 | 0 | 1 | 66 |
| Old demo (`components/demo/DemoWorkspace*`) | 6 | 35 | 0 | 147 | 4 | 5 | 0 | 0 | 3 | 0 | 0 | 3 | 5 | 0 | 0 | 47 |
| Landing (pp-306) | 0 | 0 | 6 | 11 | 0 | 2 | 0 | 0 | 6* | 3* | 1* | 0 | 0 | 0 | 0 | 40 |
| Workspace + process map | 2 | 0 | 0 | 0 | 0 | 31 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 129 |
| `components/cc` + gallery | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 45 |

\* Allowed on public pages (§1.4: 22–28 px, mesh ≤ .18).

The ten heaviest files (sum of rule hits): `stage/analyze/page.tsx` 1,040 · `settings/page.tsx` 876 ·
`stage/testing/page.tsx` 852 · `dashboard/page.tsx` 817 · `stage/documentation/page.tsx` 703 ·
`components/LandingModals.tsx` 372 · `stage/transformation/page.tsx` 267 · `clean-core-explained/page.tsx` 251 ·
`whitepaper/page.tsx` 250 · `admin/page.tsx` 220 (full table: `design-audit/perfile.txt`).

---

## 1. Gap list per section

Columns: **Rule** (short) · **met** · **not met** (evidence) · **Guard** (present / scope).
Path abbreviation: `S/…` = `app/(app)/project/[projectId]/…`.

### §1 Look & Feel

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 1.1 Tokens | Colours only as `--cc-*` tokens; no hex literals, no Tailwind palette | `components/cc`, `components/workspace`, `components/process-map`, gallery, `S/page.tsx`: 0/0. Landing pp-306: 236 cc classes, 11 palette | **Palette 7,450× in 145 files** (top: `settings/page.tsx` 462, `S/analyze/page.tsx` 459, `S/testing/page.tsx` 402, `dashboard/page.tsx` 394, `S/documentation/page.tsx` 286, `LandingModals.tsx` 202). **Hex 787× in 46 files** (top: `S/analyze/page.tsx` 229 — a complete Atlassian palette `#ebecf0`, `#6b778c`, `#0747a6`, `#de350b` … from l. 620; `dashboard/page.tsx` 92 — `from-[#006b2c] to-[#00873a]` e.g. l. 777, 845; `app/clean-core-explained-print/page.tsx` 86; `S/documentation` 79; `S/design` 75; `S/testing` 65). Arbitrary colours `bg-[#…]` 268× in 28 files; `rgb()` 23×. Landing: mesh hex `app/page.tsx:509–516`, `public-button.ts` secondary `hover:bg-green-100` | `cc-token-guard` (hex, palette, unknown cc tokens) **only** `components/cc`, gallery, `components/workspace`, `S/page.tsx`, `components/process-map`. `landing-style-guard` checks app-wide only "shade declared", not "token instead of palette" |
| 1.1 Green means proven | In the workspace green only for `proven`/`success`; primary surface `--cc-brand-strong`; selection `--cc-ink` | Workspace, process map, cc: 0 green palette classes; `cc-provenance-guard` measures `--cc-success` rendered | **1,608 green/emerald/lime classes in 115 files**, of which stages 624. Examples: `StageHeader.tsx:60` green icon bubble on every stage; shell `app/(app)/layout.tsx:222` green pill button, hover green in every account menu entry (l. 261–290); `GlossarySidebar.tsx:54` emerald FAB; `S/transformation/page.tsx:1100–1101` green "AI Generated"; `S/testing/page.tsx:689` + `TestingCharts.tsx:68` "Passed" in `#006b2c` | as above, only new namespace |
| 1.1 Dark only twice | Dark surfaces only code (`--cc-code-bg`) and overlay (`--cc-overlay`) | Workspace: CodeSurface, Toast, CoachMarks | **181 dark surfaces in 54 files** (`bg-gray-900/950`, `bg-slate-9xx`, `bg-black`): `S/documentation` 17, `dashboard` 15, `S/testing` 11, `S/transformation` 11 (among others drawer `bg-slate-900` l. 1226), `admin/approve-tenant` 10; avatar button `layout.tsx:243` `bg-gray-900` | none outside cc |
| 1.1 forced-colors | States via word/icon/shape, focus and field borders visible | `globals.css` `@media (forced-colors)` for `[data-cc-form]`, charts, `.cc :focus-visible`, selection | Rules apply only within the `.cc` scope (15 places: workspace, gallery, NewProject, ListReport, demo shell, help dialog, runner panel). Stages, settings, admin, public pages without | `cc-provenance-guard`, `workspace-a11y` (only workspace/gallery) |
| 1.1 Contrast | Text ≥ 4.5:1, borders ≥ 3:1 | Token pairs checked by calculation, gallery rendered | Legacy code uses `text-gray-400` (≈2.5:1 on white) en masse (e.g. `S/delivery/page.tsx:768`, `dashboard:822`), `globals.css:517–521` `.doc-table td::before` 10 px in `#9ca3af`; export footer `#7F7F7F` (`lib/audit-pack.ts:340`, 3.9:1) | `cc-token-guard` rendered **only gallery**; `workspace-a11y` only workspace |
| 1.2 Type | Scale 22/15/14/13/11 px; **≥ 11 px**; no 900 in the workspace; capitals only for labels | cc/workspace ≥ 11 px (exceptions `ProcessMiniMap.tsx:59` 10 px, `GlossaryText.tsx:40` 10 px — check); landing 0 < 11, 0 × 900 | **< 11 px: 729× in 102 files** (`text-[10px]` 523, `[9px]` 174, `[8px]` 31, `[7px]` 1; top `S/testing` 78, `S/documentation` 76, `S/analyze` 58, `settings` 42, `dashboard` 24, `LandingModals` 23; shell `layout.tsx:131–138, 175, 211` 9–10 px). **`font-black` 977× in 112 files** (top `S/testing` 75, `settings` 70, `S/documentation` 69, `clean-core-explained` 37, `DemoWorkspace` 32, `whitepaper` 31) — **and `StageHeader.tsx:72` itself** (`text-3xl md:text-4xl font-black`). Arbitrary sizes 1,358× in 178 files. **Also in the new namespace:** `text-[12px]` 161× (cc 18×, workspace/process map 143×) — 12 px is not in the scale §1.2 → decision E-1. `uppercase` 991× / `tracking-widest` 356× (capitals far beyond labels) | Type ≥ 11 rendered **only gallery**; source: no guard. `workflow-style-guard` only holds the equality of the stage titles (not the scale) |
| 1.3 Spacing | 4 px grid, no other spacing | — | Half steps (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`) and `[Npx]` off-grid: **1,272× in 173 files** — **also cc itself 43×** (`gap-1.5`, `py-0.5` in chips) and workspace/process map 129× → decision E-2 | no guard (§8 requires it) |
| 1.4 Shape/depth | Workspace: card 12 px, row/field/button 8 px, shadow `--cc-shadow`, plain background; public 22–28 px, mesh ≤ .18 | cc radii as tokens (`rounded-cc-card/row`) | In the workspace legacy code: **radii > 12 px 647× in 124 files** (stages 247; `settings` 60; `UserOnboarding.tsx:71` `rounded-[2rem]`, `layout.tsx:318` `rounded-[2.5rem]`); **shadows lg/xl/2xl 222× in 71 files**; **gradients/mesh 104× in 40 files** (`dashboard` 15, `S/testing` 10 — `bg-gradient` 10×); `backdrop-blur` 55× in 34 files; `hover:scale` 20× | none |
| 1.5 Buttons | Exactly four variants; 32/40 px; destructive via Message Box | `CcButton`/`CcLinkButton`/`CcIconButton` 74× in 22 files; `publicButton()` on the landing | **334 raw `<button>` in 85 files**; 192 of them with their own surface → **141 different style combinations** (normalised to surface/text/border/radius/weight/shadow; most frequent: `bg-gradient-to-br … rounded-xl text-white` 9×, `bg-slate-800 … rounded-xl` 4×, `bg-green-600 font-black rounded-2xl shadow-lg` 3×). top: `dashboard` 42, `settings` 35, `S/testing` 22, `LandingModals` 16, `S/analyze` 15. Red destructive primary surfaces (`layout.tsx:357`, `dashboard:861`) instead of `ghost`+`error` text | four variants **only in cc and gallery**; no guard against custom buttons elsewhere |
| 1.5 Segmented Control, icon button, Why? target | fixed shapes, `aria-label` mandatory | **Icon buttons: 46 icon-only controls, 0 without a name** (measurement `iconbtn.mjs`) — met | Segmented-like toggles in the legacy code self-built (stage tabs, settings); toggles without switch semantics (UX-065, `settings`) | `a11y-source-guard` (individual files) |
| 1.6 Focus | 2 px `--cc-focus`, 2 px offset, on every operable element | `.cc :focus-visible` (globals.css l. 300–303); `workspace-a11y` | **Ring applies only inside `.cc`** — outside it the browser default or none at all. `outline-none` without replacement 19× in 14 files (`layout.tsx:372` main, `S/analyze:2330, 2717`, `GapAccordionCard:29`, `GapsWorklist:295,310`, `GlossaryChatbot:681`, `GlossarySidebar:110`, `UserOnboarding:71,172,201`, `DemoWorkspace:770,859`, `LegalOverlay:32`, `SurveyClient:377`); `focus:ring` instead of `focus-visible` 7× (`S/tco:599`, `OptionComparison:139,242`, `UsageUpload:256,277`, `AtcFindingsPanel:133`, `GapsWorklist:287`). Exceptions in the new namespace: `ProcessCodeCard.tsx:62`, `ProcessSearch.tsx:131`, `CommandSearch.tsx:258` (input field in a bordering box — check) | `a11y-source-guard` ("no outline removed") only `layout.tsx`, `ShellHelpMenu.tsx`; rendered gallery + workspace |
| 1.7 Icons | lucide 16/20 px, no AI symbolism | cc/workspace | AI icons **41× in 20 files**: `Sparkles` (`S/testing:937`, `S/transformation:1100`, `StarterExamples:91`, `ArchitectSignOff:286`, `ExtensibilityDecisionMatrix:196`, `BusinessValueAudit:102`, `TargetScopeMapping:81`, `clean-core-score:349`, `clean-core-explained:395`), `Cpu` for model work (`S/documentation:1460,1637`, `S/transformation:872`, `S/analyze:1839`, `ModelStagesCard:78`, `ProcessFlow:39`, `EvidenceSweep:137`, `PreAnalysisPreview:106`), `Bot` (`how-it-works:217,224`), `Brain` (`GapsWorklist:414`) | `model-text-guard` symbolism **only `components/cc` + gallery** |
| 1.7 Motion | only state changes, 150–250 ms, `prefers-reduced-motion`; no continuous motion, no pulsing | `FirstLook`, `ThreeViewsStage`, `ViewsStage` (landing) respect reduced motion | **No global `prefers-reduced-motion`** in `globals.css`, no `MotionConfig`; `animate-in` 104× in 39 files, `animate-pulse` 37×, `animate-bounce` 7×, `animate-ping` 3×, `animate-spin` 54×; `motion` library in 13 files without reduction. `EvidenceSweep.tsx:24` **`minDuration = 6000`** — the artificial minimum duration forbidden by name in §5.4, embedded in `S/analyze/page.tsx:2090` | none |
| 1.8 Charts | State charts with state colours + labels; otherwise categorical palette; every number as text | Management overview (roadmap 3.0.10) with `cc-chart-*`, print/forced-colors | `components/TestingCharts.tsx:68–69` hex fills, "Passed"/"No verdict" pie in `#006b2c`/`#dc2626`/`#d97706` (`S/testing:689–693`) — *No verdict* is `not-determined` = neutral, not amber; `ModuleHeatmap.tsx:55–59` white 10 px type on fill | `management-overview.spec.ts` (only Management) |

### §2 Structure & interaction (Fiori patterns)

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 2.1 Shell Bar | Logo+name, path (Workspace › Project), search ⌘K, help, account menu | Help menu with "Keyboard shortcuts" and "Show tips again" (`layout.tsx:292`); skip link; ⌘K in the workspace (`CommandSearch`) | Shell (`app/(app)/layout.tsx`) without path, ⌘K only in the project; plan badges "Crown/Infinity/Zap" 10 px `font-black` (l. 131–138), 9 px subtitle "Free Community Edition" (l. 175), sign-out dialog self-built with `rounded-[2.5rem]`/`font-black`/red primary button (l. 311–357) instead of `CcMessageBox`; no density toggle in the account menu (§2.9); two floating helps (`GlossaryChatbot` FAB, `GlossarySidebar` FAB `GlossarySidebar.tsx:54`) — ADR-043 wants **one** assistant | `a11y-source-guard` (help menu, skip link) |
| 2.2 Floorplans | List Report "My workspace", Object Page, Overview | `WorkspaceListReport` (behind `/admin/workspace`), `WorkspaceShell`, `ManagementOverview` | Users still see `dashboard/page.tsx` (2,063 lines, 817 hits, 8 own overlays, 20 emojis) — replacement is 3.0.1, but the rest of the dashboard (upload dialog, delete, "What is this workspace") must be in the List Report before that or be dropped deliberately | `workspace-list-report.spec.ts` |
| 2.3 Object Page / navigation | Header, status line, toolbar, anchor bar, "Next step", footer bar only when editing; tool opens stage, **"Back to workspace" returns to view and layer** | built in the workspace (`WorkspaceShell`, `StatusLine`, `ToolBar`, `LayerBar`, `NextStepCard`) | Stage pages have no "Back to workspace" (0 hits except `BackLink.tsx`/`settings`); instead they carry `Stepper` + `VerificationRail` (ADR-005: do not rebuild until 3.0 — with 3.0 they must become the tool page). Heading order in stages unclean according to source: `S/analyze` h1→h3, h3→h5; `S/documentation` h2→h4; `S/testing`/`S/tco`/`S/transformation` without their own h2 before h3 (only reliably checkable rendered) | `workspace-shell-guard`, `workspace-a11y` (only workspace); stages: only `workflow-style-guard` (title style) |
| 2.4 Tables | Object Identifier, numbers right, status as text+dot, toolbar with counter, empty ≠ zero hits, S = cards, first five + "Show all N" | `CcTable` (S cards, right-aligned), `CcObjectIdentifier`, `CcObjectStatus`, `CcEmptyState`/`CcNoMatches` | **53 raw `<table>` in 26 files** (top `S/documentation` 10, `S/analyze` 8, `S/design` 5, `method/levels` 3, also `ManagementOverview` 3 and landing 2) against 3 uses of `CcTable`; "Show all N" built ad hoc twice (`ItAnswers.tsx:138,386`, `ManagementOverview.tsx:512,667`) instead of in `CcTable`; status as coloured dot without text candidates 34× in 13 files (`S/documentation` 9, `S/testing` 5) | `cc-style-guard` filter/no-match only gallery |
| 2.5 Filter bar | Live filter, counter `aria-live`, "Clear filters" | `CcFilterBar` (gallery, List Report) | own filters in `GapsWorklist.tsx:282–343` (search field + three selects without label, without live counter), `AtcFindingsPanel.tsx:128`, `UsageRiskMatrix` | gallery |
| 2.6 Messages | Message Strip / Popover / Box (modal, `inert`) / Toast (`role=status`, never errors) | `CcMessageStrip` 11×, `CcMessageBox` 2×, `CcToast` 1× | **26 native dialogs in 8 files**: `settings/page.tsx` 13 (among others `window.confirm` l. 597, `window.prompt` l. 788, 807, 813), `admin/page.tsx` 5 (`confirm` l. 188), `dashboard` 2, `S/delivery` 2 (l. 471, 909), `ProcessStatesPanel.tsx:149` `confirm`, `FileUpload:49`, `JiraIntegrationModal:59`, `StarterExamples:53`. **35 self-built overlays** (`fixed inset-0`) outside `CcMessageBox` in 23 files; only 11 files set `aria-modal` (QA 58dc160fd6c3, b0b3150a1974). **Free notice boxes** (`bg-{red,amber,blue,green}-50` + border) 298× in 79 files instead of `CcMessageStrip`. Message Popover does not exist in cc | `cc-style-guard` (modal, toast) only gallery |
| 2.7 Forms | Label above field 13/600, `*` + `aria-required`, value state with icon+text, validation on leaving | `CcField` (+ `CcRequiredNote`) — used in 4 files | **101 fields in 35 files raw**, of which ~42 without a programmatic name (`inputs.mjs`: `S/testing` 9, `LandingModals` 9, `dashboard` 5, `GapsWorklist` 4, `S/tco:247,287,304`, `ArchitectSignOff:377,425` …; QA c2923dfd70ab); no value states outside cc; checkbox/radio/select/switch variants missing in cc | gallery |
| 2.8 Loading | Skeleton > 300 ms, busy on the trigger after 400 ms, no blocking spinners, phases instead of percent, cost before the click | `CcRunIndicator`/`CcRunCost` (gallery, workspace), `NewProject` | `components/Skeleton.tsx` outside cc (5 users); `Loader2 animate-spin` 36× in 12 files, immediately instead of after 400 ms; "Loading…" texts 14×; `S/analyze:2098` "Evidence scan complete — waiting for AI narrative..." (thinking impression); quota note before the click only in `NewProject`/gallery, not on the stage actions that call a model | gallery (`cc-style-guard` run) |
| 2.9 Density & breakpoints | Density by pointer, switchable in the account menu (browser); S/M/L/XL; targets 24/44 px | `CcButton` `pointer-coarse:min-h-11`; `workspace-a11y` checks S and 44 px in the workspace | no density toggle, no stored density; stages/settings without S check; small targets e.g. `p-1.5` icon buttons (`dashboard:822`) | only workspace |
| 2.10 Search, popover, glossary | ⌘K in the project; Why? popover; glossary dotted, keyboard | `CommandSearch`, `CcWhyPopover`, `GlossaryText` (workspace) | `GlossaryTerm.tsx` (11 uses in the legacy code) own overlay (`:108 fixed inset-0`), not keyboard-capable (UX-045); two glossary paths (`GlossaryTerm` vs `GlossaryText`) | `a11y-source-guard` partially |
| 2.11 Show less | first five rows, legend on demand, metadata behind "Details" | Workspace (`Details`, `LayerBar` "More") | Stage pages show everything open (e.g. `S/documentation` 1,910 lines, permanent legend chips) | `workspace-shell-guard` |

### §3 Language and formats

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 3 English | UI and generated content English | almost everywhere | `app/datenschutz/de/page.tsx` deliberately German (legal text, record the exception); otherwise 0 German UI sentences found | `public-texts-guard` (files, not UI) |
| 3 Text keys | every visible string of **new** surfaces via keys | `components/cc` complete (51 keys in `lib/cc-messages.ts`) | `components/workspace`: only 3 of 26 files use the catalogue (`AskThisCase`, `CommandSearch`, `WorkspaceListReport`); JSX text nodes hard-coded: workspace 25 in 12 files, process map 8, demo shell 34 (string props additionally, not counted) | `cc-style-guard` **only `components/cc`** |
| 3 Numbers/date | `Intl.NumberFormat('en')`; text "15 Sep 2026", meta lines/tables ISO in mono; time with time zone | `lib/workspace-rows.ts:isoDate`, `formatAmount` in `cost-assumptions` | **27 locale-dependent calls** (`toLocaleString()` 14, `toLocaleDateString()` 12, `toLocaleTimeString()` 1 — German browsers show German dates): `UsageRiskMatrix` 3, `DemoWorkspace` 3, `S/analyze:729,1046`, `S/design:544,644`, `PreAnalysisPreview` 2, `FileList:47`, `settings:1929`, `AtcFindingsPanel:162`, `AtcUpload:164`, `ArchitectSignOff:200`, `PresentationViewer:97`; plus 19× `'en-US'` (US format instead of "15 Sep 2026"). **No central `lib/format.ts`** | none |
| 3 Money | Amounts arise only in Economics, with currency code | `money-honesty-guard`, `tco-cost-inputs-guard` | — (€ hits only in comments) | present |
| 3.1 No AI traces | no Markdown remnants, no blocklist, no AI symbolism, no emojis, no thinking loading states; provenance only via chip | Blocklist clean app-wide; chip *Model proposal* in cc | **Labels:** `S/transformation/page.tsx:1100–1101` Sparkles + "AI Generated" (retired → *Model proposal*); `S/documentation/page.tsx:1686` "Generate Business Layer (AI)"; "powered by Generative AI" in `LandingModals.tsx:836` (with ⚡), `UserOnboarding.tsx:333`, `dashboard/page.tsx:944` ("⚠️ AI Processing Notice … Generative AI"), `dashboard:1199` ("fully automated AI refactoring live"); error texts "AI modernization engine" (`GlossaryChatbot.tsx:430`), "AI analyzed legacy database joins" as fallback (`S/analyze:1500`), "The AI engine will prioritize" (`S/analyze:2637`). **Emojis 132× in 23 files** (`S/analyze` 23, `dashboard` 20, `TargetArchitectureDiagram` 20, `S/testing` 8, `GapsWorklist` 8, `settings` 7, `tenant-security` 6; ✨ `dashboard:900,1009`). **Icons** see §1.7. **Style list** (notice, no build break): "Comprehensive assessment" `S/analyze:2460`, "Unlock business-level mapping" `S/documentation:1641`, "S/4 Live Bridge Unlocked" `admin:473`. Model text cleanup (`lib/model-text.ts`) used in the UI only by `GlossaryChatbot`; stages render model text directly | `model-text-guard`: blocklist app/components/lib ✔; symbolism **only cc + gallery**; rendered scan **only gallery**; emojis not in the source scan |

### §4 Vocabulary

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 4 Provenance | only the nine values from `lib/provenance.ts`, pill with word+icon+shape | `CcProvenanceChip` (21 files); `data-provenance` only in the chip | Outside: "AI Generated" (`S/transformation:1101`), "Passed"/"No verdict" (`S/testing:689–693`), "Estimated by the test generator" (`S/delivery:770`), "Estimated from access type…" (`AbcdClassificationPanel.tsx:245`), stage badges in their own colours. **110 free chips/badges** (small, rounded, coloured, outside cc) in 41 files — top `S/documentation` 14, `dashboard` 11, `admin/page.tsx` 8 (green/rose/amber/blue/indigo pills `text-[10px] font-black`), `S/analyze` 8, `layout.tsx` 6 (plan badges) | `cc-provenance-guard` (retired wordings, only the chip may) **only cc, gallery, workspace, process map** |
| 4.1 Other fixed lists | Object status (text+dot), evidence level/level (identifier), rule property (tag) — each its own list with guard | `lib/object-status.ts`, `lib/evidence-level.ts`, `lib/rule-property.ts`; `CcObjectStatus`, `CcEvidenceLevel`, `CcCleanCoreLevel`, `CcRulePropertyTag` | Level A–D in the legacy code coloured freely (`AbcdClassificationPanel`, `method/levels`, `catalog/[object]`) — check against §1.8 (A blue, never green); **severity** (critical/high/medium/low) of findings has **no fixed list** and no shape in DESIGN.md, but appears in `GapsWorklist`, `S/analyze`, `ConstructFindings`, `UsageRiskMatrix` → decision E-4 | `cc-provenance-guard` ("four vocabularies") only gallery |
| 4 Terms | one spelling per core term | 4th bucket "No catalogued path" in `lib/abap/public-cloud-fit.ts:122` and landing | Roadmap 3.0.10 (b) still says "Blocked by SAP" (roadmap text, not UI); "Clean Core Score" (page `/clean-core-score`, `ManagementOverview.tsx:532` comment) alongside "Readiness" (§5.6, glossary) — settle the spelling; "Check tenant connection" ✔ (`S/testing:894`) | `public-texts-guard` (files) |

### §5 First look, views, process map

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 5.1–5.3 Structure, phases | Code speaks first, ≤ 3 s, skip, one live announcement per phase | `FirstLook.tsx` | — (detailed acceptance not part of this audit) | `first-look.spec.ts`, `a11y-source-guard`, `workspace-a11y` |
| 5.4 What not | no artificial minimum durations, no pulsing dots, no thinking animations | Workspace | `EvidenceSweep.tsx:24` `minDuration = 6000` (+ l. 97–100 "Ensure minimum duration"); `animate-pulse` 37× (8 in `S/analyze`, 6 in `S/documentation`); `animate-ping` 3× | none |
| 5.5–5.6 Views | Business/IT/Management, order ADR-044, answer before number | Workspace, `ManagementOverview`, `ItAnswers` | — | `management-*`, `workspace-layers` |
| 5.7 Map without mouse | one tab stop, arrows, `+ − 0`, buttons for them | Arrows, Alt+↑, ⌘K (`a11y-source-guard`) | **Zoom `+`/`−`/`0`, `F`, `M`, `P` not wired** (recorded as such in `tests/a11y-source-guard.spec.ts:51`) | `process-map.spec.ts`, `a11y-source-guard` |
| 5.8–5.9 BPMN/navigation | Palette, layers, minimap, path | largely (roadmap 2.x) | Minimap label `ProcessMiniMap.tsx:59` 10 px | `bpmn-export.spec`, `process-map.spec` |

### §6 Assistance

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 6.1 Why? on number/status | Popover with provenance | Workspace (`CcWhyPopover`) | Stages: numbers without Why? (e.g. scores in `WhyScorePanel` standalone, `S/testing` key figures) | — |
| 6.1 Empty states | Illustration, sentence, one primary action | `CcEmptyState` (4 files) | Stages with their own empty states (`NotGenerated.tsx`, `S/analyze:2363` "To start the AI modernization analysis, please complete the following steps") | gallery |
| 6.1 Errors with next step | Message Strip with action, never raw error text | `CcRunIndicator` errors | `alert(`… raw text (see §2.6); `S/design:319` / `S/documentation:126,360` throw texts "AI model did not produce…" up to the surface; `error.tsx` of the stages with their own design (`S/documentation/error.tsx`, `S/testing/error.tsx`: 6 hex each) | — |
| 6.1 Example notice | Strip "Example project — fictitious code" | only gallery (`design-system/page.tsx:321`) and landing | **missing in the workspace of an example project** (no hit in `components/workspace`; only `S/analyze:111,201` knows `fromExample`) | — |
| 6.1 First start, import, About this view | Card "Your turn", import explanation, "About this view" | `WorkspaceListReport`, `NewProject`, `TrustBeforeUpload`, `WorkspaceShell:457` | visible to users only with 3.0.1 (dashboard before that) | `workspace-list-report`, `trust-card-guard` |
| 6.1.2 Demo | Demo strip, tour | `DemoWorkspaceShell` (new) | old demo `components/demo/DemoWorkspace.tsx` (865 lines, 198 hits, `text-[9px]`, `outline-none` l. 770, 859) under `/demo/[stage]` lives in parallel | `demo-*.spec` |
| 6.2 Ask this case = one assistant | ADR-043 | `AskThisCase.tsx` | two floating entry points (`GlossaryChatbot` + `GlossarySidebar`), assistant is called "Chatbot" in code/UI (`settings` 12×, `layout.tsx:411`) | `assistant-label.spec` |

### §7 Agent rules, print and export

| § | Rule | met | not met | Guard |
|---|---|---|---|---|
| 7 No new style without ADR | new colour/radius/spacing/fifth button = ADR | — | in fact 141 button styles, 12 px step and half spacings without ADR (E-1, E-2) | — |
| 7.1 Print | no background, ink on white, cards with border, no bars, chips with word, links with target, no breaks inside card/row | `@media print` for `.cc` (globals.css l. 320–400), `SteeringOnePager`, `workspace-a11y` print check | Print rules only for `.cc`; stages print with gradients/shadows; `S/tco/page.tsx:140` `window.print()` without `.cc` context; `app/clean-core-explained-print/page.tsx` 86 hex; **Word/HTML export** `lib/audit-pack.ts:331–340`: Calibri instead of Inter/system, headings and table headers in brand green `#006b2c`/`#00873a` (green ≠ proven), footer `#7F7F7F` 3.9:1 | `workspace-a11y` (print workspace), `steering-one-pager` |

### §8 How it is held — guard coverage

| Rule from §8 | Guard today | Scope today | Gap |
|---|---|---|---|
| Landing and stage headers from one component | `landing-style-guard`, `workflow-style-guard` | Landing, six/seven stage titles | Stage title itself violates §1.2 (900, 30–36 px) — guard measures equality, not scale |
| Contrast of all token pairs | `cc-token-guard` | Token pairs + gallery rendered | rendered text contrasts only gallery |
| Chips in three shapes, forced-colors | `cc-provenance-guard` | Gallery/workspace | — (ok) |
| Process map keyboard | `process-map.spec`, `a11y-source-guard` | Map | Zoom/F/M/P missing (feature) |
| Heading order per view, live regions, Message Box modal | `workspace-a11y`, `cc-style-guard` | Workspace, gallery | Stages, settings, admin, public pages |
| Fixed lists in their shape | `cc-provenance-guard` | Gallery | 110 free badges outside |
| **Tokens instead of hex, four buttons, ≥ 11 px, spacing from the scale** | `cc-token-guard`, `cc-style-guard` | `components/cc` (+ workspace, process map for colours) | **Everything missing app-wide; spacing nowhere** |
| Provenance only from `lib/provenance.ts`; green only `proven` | `cc-provenance-guard`, `workspace-shell-guard` | new namespace | App-wide |
| No state colour without text; focus ring everywhere | `cc-token-guard` rendered | Gallery (+ workspace a11y) | App-wide; focus ring CSS only in `.cc` |
| Text keys | `cc-style-guard` | `components/cc` | Workspace, process map, demo shell |
| No AI traces | `model-text-guard` | Blocklist app-wide; symbolism and rendered only cc/gallery | Symbolism, emojis, "Generative AI" labels app-wide |
| Print appearance | `workspace-a11y`, `steering-one-pager` | Workspace | Stages, exports |
| No dark mode | `dark-mode-guard` | whole product | — (ok) |

---

## 2. The ten biggest gaps

1. **Palette instead of tokens** — 7,450 Tailwind palette classes in 145 files and 787 hex literals in 46 files;
   stages alone 3,048 and 512 respectively. The new namespace has 0 of each.
2. **Green as decoration** — 1,608 green/emerald/lime classes in 115 files (stages 624), plus the green icon bubble in
   `StageHeader` on every stage; violates ADR-007 "Green means proven".
3. **Type under 11 px** — 729× in 102 files (10 px 523×, 9 px 174×, 8 px 31×, 7 px 1×); plus 161× 12 px in the new
   namespace outside the scale (E-1).
4. **Weight 900** — 977× `font-black` in 112 files, including `StageHeader` itself.
5. **Buttons** — 334 raw `<button>` in 85 files, 192 with their own surface in 141 style combinations, against 74 uses
   of the cc buttons in 22 files.
6. **Dialogs** — 26 native `alert/confirm/prompt` in 8 files (settings 13, three `window.prompt`), 35
   self-built overlays; `aria-modal` only in 11 files.
7. **Tool shape in the workspace legacy code** — 647 radii > 12 px, 222 heavy shadows, 104 gradients/mesh, 55
   `backdrop-blur`, 181 dark surfaces outside code.
8. **AI traces** — 41 AI icons in 20 files, "AI Generated" badge, three times "powered by Generative AI", 132 emojis in 23
   files, `EvidenceSweep` with a 6 s minimum duration.
9. **Free status and provenance badges** — 110 in 41 files; retired wordings "Passed", "No verdict", "AI Generated",
   "Estimated"; "No verdict" in amber instead of neutral; severity without a fixed list.
10. **Guards reach only into the new namespace** — 193 of 230 UI files without a cc component, stages 0; focus ring,
    forced-colors and print CSS apply only in `.cc`; no spacing guard; rendered checks only gallery and
    workspace.

Besides that: 27 locale-dependent date/number formats without a central `lib/format.ts`; ~42 fields without a name; 53 raw
tables; 298 free notice boxes instead of Message Strip; no global `prefers-reduced-motion`; 14 separate
`<header>` implementations on public pages (UX-082).

**What already holds:** all 46 icon buttons have a name; dark mode is gone (checked app-wide); the blocklist is
clean app-wide; the workspace is keyboard-, print-, S- and forced-colors-checked; the landing from pp-306 uses the
tokens (236 cc classes, 0 × < 11 px, 0 × 900).

---

## 3. Decisions that must be made before or with D.1 (Sonny)

| No. | Question | Proposal | why now |
|---|---|---|---|
| E-1 | 12 px appears 161× in the new namespace (chips, meta, hints), but not in §1.2 | **ADR-047:** add the role "Meta/Chip" 12 px / 600 to the scale — a rebuild to 11 or 13 px would change the accepted workspace screens | D.1 must know whether 12 px is a violation |
| E-2 | Half grid steps (2 px, 6 px, 10 px) — cc too 43×, workspace 129× | **ADR-048:** 2 px (`*-0.5`) only inside chips/identifiers and for icon alignment; 6/10/14 px not — guard as a ratchet | otherwise the spacing guard is either empty or red for cc |
| E-3 | `StageHeader`: does it stay a "landing/stage header" (today 30–36 px/900) or is the stage set as a tool page of the workspace? | Stage title like the project title: 22 px / 800, `--cc-ink`, icon neutral instead of a green bubble, plus "Back to workspace" (§2.3) | affects `workflow-style-guard` and every stage |
| E-4 | Severity of findings (critical/high/medium/low) has no fixed list | **ADR-049:** `lib/severity.ts` as the fifth fixed list, form = identifier like Level (rectangle, radius 4 px), colours per §1.8 (findings per severity count states) | 110 free badges need a target |
| E-5 | Public pages: does "tokens instead of palette" apply there too? | yes — one look (tokens), two spaces (radii/mesh only public); the landing's mesh hex as tokens | scope of D.24–D.27 |
| E-6 | Old dashboard and old demo `/demo/[stage]` | do not redesign, but remove with 3.0.1 and 3.0.7 respectively; whatever is missing moves into List Report/demo shell | saves the heaviest 1,000 hits |
| E-7 | `app/datenschutz/de` German | record it explicitly as the legal-text exception from §3 | guard allowlist |

---

## 4. Reduction plan

### Principles

- **One step = one agent = S or M**, independently shippable; the one-roadmap-item-per-release rule stays with the
  human (bundling into releases is Sonny's decision).
- **Guard first (D.1), then the exception list shrinks step by step.** The exception list is a
  **ratchet**: per file and rule today's number as the upper limit; more is red, less is red, **until the number in the
  list is lowered along with it** — so every bit of progress is fixed in the same commit. New files have no exception.
- **No two parallel steps touch the same file.** That is why the exception list is **split**:
  `tests/design-baseline/<gruppe>.json`, one file per file group below; a step changes only the list of its own
  group. `lib/cc-messages.ts`, `components/cc/**`, `app/globals.css` and the gallery belong to Lane A only.
- **Before every move/delete:** `grep -rl <datei> tests/` (CLAUDE.md gotcha); adjust specs that name file paths in the
  same step.
- **Translation table** for all surface steps (so that 20 agents translate the same way):

| old | new |
|---|---|
| `text-gray-900/950`, `text-slate-900`, `#0b1c30` | `text-cc-ink` |
| `text-gray-500/600/700`, `text-slate-500/600` | `text-cc-ink-muted` (also for `gray-400`, which does not reach 4.5:1 on white) |
| `border-gray-100/200`, `border-slate-200` | `border-cc-line` (decorative) · field border `border-cc-field-border` |
| `bg-gray-50`, `bg-slate-50` | `bg-cc-surface-muted` · page `bg-cc-page` · card `bg-cc-surface` |
| green button (`bg-green-600`, gradient `#006b2c→#00873a`) | `CcButton variant="primary"` (public `publicButton('primary')`) |
| green/blue/red/yellow status text or badge | provenance → `CcProvenanceChip`; state → `CcObjectStatus`; level/evidence → `CcCleanCoreLevel`/`CcEvidenceLevel`; severity → `CcSeverity` (D.5d); property → `CcTag` |
| `bg-{red,amber,blue,green}-50` + border as a hint | `CcMessageStrip state=…` |
| `alert/confirm/prompt`, `fixed inset-0` overlay | `CcMessageBox` (confirmation) · `CcDialog` (form/info, D.5a) · success after a side action `CcToast` |
| `text-[7–10px] font-black uppercase tracking-widest` | micro label: `cc-text-label` (11 px/600/0.08em, D.3) |
| `font-black` | 800 only for titles, otherwise 700/600 per §1.2 (`cc-text-*`, D.3) |
| `rounded-2xl/3xl/[2rem]` in the workspace | `rounded-cc-card` (card), `rounded-cc-row` (row/field) |
| `shadow-lg/xl/2xl` | `shadow-cc`; dialog `shadow-cc-dialog` |
| dark panels `bg-slate-900` | only `CcCodeSurface` (code) or `--cc-overlay` (toast/coach) — otherwise light |
| raw `<table>` | `CcTable` (with `limit` from D.5c) |
| raw `<input/select/textarea>` | `CcField` + controls from D.5b |
| `Loader2 animate-spin` on the button | `CcButton busy` (D.5c); page loading `CcSkeleton` |
| `toLocaleString()` / `toLocaleDateString()` | `formatTextDate`, `formatIsoDate`, `formatNumber` from `lib/format.ts` (D.3); ISO in `font-cc-mono` |
| `Sparkles/Cpu/Bot/Brain` for model work, "AI Generated" | `CcProvenanceChip value="proposed"`; icon `PenLine` only in the chip |
| Emojis | lucide icon or delete |

### Lanes

- **Lane A — library, foundations, guards:** owns `tests/design-*`, `tests/helpers/*` (new), `components/cc/**`,
  `lib/cc-messages.ts`, `lib/format.ts`, `app/globals.css`, `app/(app)/admin/design-system/page.tsx`, `tests/cc-*`,
  `DESIGN.md`, `docs/design/decisions.md`.
- **Lane B — the seven tools (stages):** owns `S/*/page.tsx`, `S/*/error.tsx`, `components/analyze|design|tco|documentation/**`,
  `StageHeader`, `Stepper`, `VerificationRail`, stage helper components.
- **Lane C — frame, account, public:** owns `app/(app)/layout.tsx`, shell/glossary/onboarding components,
  `settings`, `admin`, knowledge and public pages, landing follow-ups, exports.

Lane B and C start as soon as D.1 and D.3 are in place; D.5a–c run in Lane A in parallel with the first B/C steps that
do not need them.

### Steps

Notation: **Files** = complete write set (plus its own exception list `tests/design-baseline/<gruppe>.json`).
**Guard** = what the step changes in the guard. **Done when** = acceptance.

#### Lane A

**D.1 — App-wide source guard with a shrinking exception list** · M · depends on: E-1, E-2 (until then 12 px and
half spacings run as "report only")
- Goal: enforce §8 "tokens instead of hex, four buttons, ≥ 11 px, spacing" and the source halves of §1.6/§1.7/§2.6/§3.1 for
  **`app/**` and `components/**`** (without `app/api`).
- Files: `tests/design-system-guard.spec.ts` (new), `tests/design-baseline/*.json` (new, one per group:
  `library`, `shell`, `settings`, `admin`, `dashboard-legacy`, `demo-legacy`, `analyze-page`, `analyze-evidence`,
  `analyze-worklists`, `analyze-strategy`, `design`, `transformation`, `documentation`, `testing`, `tco`, `delivery`,
  `stage-frame`, `knowledge`, `public-header`, `catalog`, `public-content`, `legal`, `landing`, `glossary`,
  `onboarding`), `scripts/design/measure.mjs` (new; takes over `design-audit/measure.mjs`, output = exception list),
  `package.json` (script `design:baseline`).
- Rules (counted per file): R1 font < 11 px; R2 `font-black`/900; R3 hex/`rgb()`; R4 palette class (Tailwind);
  R5 green palette; R6 `alert/confirm/prompt`; R7 `<button>`/`<a>`/`<Link>` with its own surface (`bg-*`) outside
  `CC_BUTTON_*`/`publicButton`; R8 `outline-none` without a `focus-visible` replacement; R9 `onClick` on `div/span/li/tr/td`
  without `role` + key handler (backdrop with `data-backdrop` exempted); R10 `fixed inset-0` outside
  `CcMessageBox`/`CcDialog`; R11 raw `<table>` outside `CcTable` and `.doc-table`; R12 radius > 12 px, shadow
  lg+, gradient, `backdrop-blur` — **workspace files only**; R13 `animate-pulse|bounce|ping`, `animate-in` without
  `motion-safe:`; R14 emoji; R15 AI icon (`Sparkles|Bot|Brain|Wand*|Cpu` as JSX); R16 `toLocale*String()` without `'en'`
  or `'en-US'`; R17 free badge (small+rounded+coloured outside cc); R18 (report, enforce after E-2)
  half spacings; R19 (after E-1) arbitrary sizes outside the scale.
- Guard: test 1 "no file above its upper limit"; test 2 "no upper limit above the actual" (ratchet — progress must
  be recorded); test 3 "files without an entry have 0"; test 4 "every exception names its step D.x".
- Done when: green on today's state; negative probe — `text-[10px]` in `components/workspace/NextStepCard.tsx`
  or an `alert(` in a new file turns it red; runtime < 5 s; `design-audit` numbers reproduced (±5 %).

**D.2 — Rendered walkthrough with an exception list per route** · M · depends on: D.1 (pattern)
- Goal: the gallery's rendered checks (font ≥ 11, text contrast, focus ring via Tab, heading order,
  weight ≤ 800, state colour without text) on **routes** instead of the gallery only.
- Files: `tests/design-rendered-guard.spec.ts` (new), `tests/design-rendered-baseline/*.json` (per route),
  `tests/helpers/seed-project.ts` (new; extracted from `workflow-style-guard` — there only switch the import:
  `tests/workflow-style-guard.spec.ts`).
- Routes: `/` · `/catalog` · `/catalog/[object]` (one object) · `/knowledge` · `/clean-core-explained` · `/trust` ·
  `/how-to` · `/settings` · `/admin/workspace` · `/dashboard` · `/project/[id]` (three views) · the seven stages of the
  seed project · `/demo/workspace`.
- Done when: today's numbers recorded as the upper limit per route; ratchet as in D.1; runs in the CI job `validate`
  (emulator, production build — mind the CLAUDE.md gotcha on time windows).

**D.3 — Foundations for everyone: focus, motion, text roles, formats** · S · depends on: E-1
- Files: `app/globals.css`, `lib/format.ts` (new), `tests/format.spec.ts` (new).
- Content: focus ring **global** (`:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible` = 2 px
  `--cc-focus`, 2 px offset) instead of only `.cc`; global `@media (prefers-reduced-motion: reduce)` (animations and
  transitions off); print base rule §7.1 for `body` (not only `.cc`); text roles as `@utility`: `cc-text-title`
  (22/800/-0.02em), `cc-text-h2` (15/700), `cc-text-h3` (14/700), `cc-text-body` (14/500/1.55), `cc-text-cell`
  (13/500), `cc-text-identifier` (13/600), `cc-text-label` (11/600/uppercase/0.08em) [+ `cc-text-meta` 12/600 after
  E-1]; `.doc-table td::before` to 11 px and `--cc-ink-muted` (l. 517–521); `lib/format.ts`: `formatTextDate` ("15
  Sep 2026"), `formatIsoDate`, `formatDateTime` (with time zone), `formatNumber` (`Intl.NumberFormat('en')`),
  `formatPercent` (whole numbers).
- Guard: extend `cc-token-guard` with "focus ring on a non-cc page" (Tab on `/settings`) — only the file
  `tests/cc-token-guard.spec.ts`.
- Done when: `workspace-a11y`, `cc-*` green; Tab on `/settings` shows the ring; `format.spec` covers time zone and
  thousands separators.

**D.4 — Write down decisions E-1 … E-7** · S · depends on: Sonny
- Files: `DESIGN.md` (§1.2, §1.3, §4.1, §3, change table), `docs/design/decisions.md` (ADR-047 ff.).
- Done when: every decision stands with date and reasoning; D.1 switches R18/R19 from "report" to
  "enforce".

**D.5a — `CcDialog` and `CcMessagePopover`** · M · depends on: —
- Files: `components/cc/Dialog.tsx`, `components/cc/MessagePopover.tsx` (new), extract shared modal logic from
  `components/cc/MessageBox.tsx` (`components/cc/modal.ts`), `lib/cc-messages.ts`, gallery,
  `tests/cc-style-guard.spec.ts` (modal test also for `CcDialog`).
- Done when: `CcDialog` modal, `inert`, focus trap, Escape, focus return (same test as Message Box);
  popover with jump to the element (§2.6); no `className` opening.

**D.5b — Form controls** · M · depends on: —
- Files: `components/cc/Checkbox.tsx`, `RadioGroup.tsx`, `Select.tsx`, `Textarea.tsx`, `Switch.tsx` (new, all on
  `CcField`), `lib/cc-messages.ts`, gallery, `tests/cc-style-guard.spec.ts`.
- Done when: switch with `role="switch"`/`aria-checked` (UX-065); radio group with legend; value states with icon+text;
  border `--cc-field-border`; 32/40 px.

**D.5c — Loading, disclosure, tabs, table limit** · M · depends on: —
- Files: `components/cc/Skeleton.tsx` (new, later replaces `components/Skeleton.tsx`), `components/cc/Button.tsx`
  (`busy` state, visible only after 400 ms), `components/cc/Disclosure.tsx` ("Business rules (7) · Show"),
  `components/cc/Tabs.tsx` (for "Source · Not determined · What it does" and stage tabs),
  `components/cc/Table.tsx` (`limit` + "Show all N"), `components/cc/DateText.tsx` (uses `lib/format.ts`),
  `lib/cc-messages.ts`, gallery, `tests/cc-style-guard.spec.ts`.
- Done when: skeleton only after 300 ms; busy after 400 ms, page usable; `ItAnswers`/`ManagementOverview` could
  use `limit` (the switch there in D.29).

**D.5d — Severity as a fixed list, chart colours** · S · depends on: E-4
- Files: `lib/severity.ts` (new), `components/cc/Identifier.tsx` (`CcSeverity`), `lib/chart-colors.ts` (new:
  state vs. categorical palette as token names), gallery, `tests/cc-provenance-guard.spec.ts` (fifth list in
  "vocabularies do not look like one another").
- Done when: severity has word+identifier, never chip form; guard detects free severity badges in the new namespace.

**D.29 — Text keys for the new surfaces** · M · depends on: D.5a–c (same file `lib/cc-messages.ts`)
- Files: `lib/cc-messages.ts` (or new `lib/workspace-messages.ts` if the catalogue grows too large),
  `components/workspace/*.tsx`, `components/process-map/*.tsx`, `components/demo/DemoWorkspaceShell.tsx`,
  `components/demo/DemoTourStop.tsx`, `tests/cc-style-guard.spec.ts` (extend the text-key test to these
  folders); in addition `ItAnswers`/`ManagementOverview` to `CcTable limit`; `ProcessMiniMap.tsx:59` and
  `GlossaryText.tsx:40` to ≥ 11 px.
- Done when: 0 hard-coded JSX texts in the three folders; catalogue test green; `workspace-*` specs green.

**D.30 — Exception lists to zero, guards armed** · S · depends on: all surface steps · **done 30.09.2026** (see the closing note at the end)
- Files: `tests/design-baseline/` (delete), `tests/design-rendered-baseline/` (delete),
  `tests/design-system-guard.spec.ts`, `tests/design-rendered-guard.spec.ts`, `tests/cc-token-guard.spec.ts`
  (`CC_DIRS` → whole app), `tests/cc-provenance-guard.spec.ts` (`CC_SOURCE_DIRS` → whole app),
  `tests/model-text-guard.spec.ts` (symbolism and rendered scan app-wide + emojis), `tests/workflow-style-guard.spec.ts`
  (scale instead of only equality), `DESIGN.md` §8 (update the guard column).
- Done when: no exception left, all guards apply to `app/**` and `components/**` (exceptions only named:
  `.md` export, `app/datenschutz/de`, code surface, landing mesh).

#### Lane B — the seven tools

**D.9 — Stage frame** · M · depends on: D.3, E-3
- Files: `components/StageHeader.tsx`, `components/Stepper.tsx`, `components/VerificationRail.tsx`,
  `components/NavigationButtons.tsx`, `components/BackLink.tsx`, `components/StaleNotice.tsx`,
  `components/LegacyRunBanner.tsx`, `components/NotGenerated.tsx`, `components/SectionBoundary.tsx`,
  `components/ErrorBoundary.tsx`, `S/documentation/error.tsx`, `S/testing/error.tsx`,
  `tests/workflow-style-guard.spec.ts` (expectation per E-3).
- cc: `cc-text-title`, `CcLinkButton` ("Back to workspace" with `?view=` and `#ebene` back), `CcMessageStrip`
  (stale/legacy), `CcEmptyState` (NotGenerated), `CcObjectStatus` in the stepper (ADR-005: "done" coded the same, no
  green unless evidenced).
- Done when: group `stage-frame` at 0; all seven stage titles the same **and** per E-3; `workflow-style-guard`
  green.

**D.10a — Analysis page: colours, type, buttons** · M · depends on: D.1, D.3
- Files: `S/analyze/page.tsx`.
- Content: Atlassian palette (l. 620 ff., 229 hex) → tokens or `CcCodeSurface`; 459 palette, 58 × < 11 px, 28 × 900,
  15 buttons → cc; emojis (23), `Sparkles`/`Cpu` (l. 16, 1839); texts l. 1500, 2098, 2363, 2637 without an "AI" label;
  `toLocale*` l. 729, 1046 → `lib/format.ts`.
- Done when: R1–R5, R7, R14–R16 of group `analyze-page` at 0.

**D.10b — Analysis page: dialogs, tables, fields, motion** · M · depends on: D.10a, D.5a–c
- Files: `S/analyze/page.tsx`.
- Content: overlays l. 2507, 2565 → `CcDialog`; 8 tables → `CcTable`; `textarea` l. 2329, `input` l. 2121 → `CcField`;
  `onClick` divs l. 2166, 2185, 2584, 2603 → button/`CcDisclosure`; `focus:outline-none` l. 2330, 2717; 8 ×
  `animate-pulse`; heading order (h1→h3, h3→h5).
- Done when: group `analyze-page` at 0; D.2 route `analyze` without skip, without < 11 px.

**D.11 — Analysis: evidence components** · M · depends on: D.3, D.5c
- Files: `components/analyze/EvidenceSweep.tsx`, `SweepVerdictBar.tsx`, `SweepCodeViewer.tsx`,
  `ConstructFindings.tsx`, `UnassessedConstructs.tsx`, `CodeInventoryTable.tsx`, `DataCouplingTable.tsx`,
  `AbcdClassificationPanel.tsx`, `CoverageVerdict.tsx`, `AnchoredNarrative.tsx`, `PreAnalysisPreview.tsx`,
  `MissingDependencyPrompt.tsx`, `WhyScorePanel.tsx`.
- Content: **remove `minDuration = 6000`** (§5.4; stages driven by real events); `SweepCodeViewer` →
  `CcCodeSurface`; level → `CcCleanCoreLevel` (A blue, never green); "Estimated from…" → `CcProvenanceChip` or a sentence;
  tables → `CcTable`; `CoverageVerdict` overlay → `CcDialog`; numbers with `CcWhyPopover` (§6.1).
- Done when: group `analyze-evidence` at 0; `coverage-*`, `abcd-classification`, `engine-honesty-guard` green.

**D.12 — Analysis: worklists and imports** · M · depends on: D.5b, D.5d
- Files: `components/analyze/GapsWorklist.tsx`, `GapsPrioritization.tsx`, `AtcFindingsPanel.tsx`, `AtcUpload.tsx`,
  `UsageUpload.tsx`, `UsageRiskMatrix.tsx`, `ModuleHeatmap.tsx`; delete `GapAccordionCard.tsx` (orphaned — check).
- Content: filters → `CcFilterBar` (live, counter); selects without a label → `CcSelect`; severity → `CcSeverity`; `Brain` icon
  (`GapsWorklist:414`) out; heatmap per §1.8 with text per number; `toLocale*` (UsageRiskMatrix 3×, Atc 2×).
- Done when: group `analyze-worklists` at 0; `atc-*`, `usage-*` specs green.

**D.13 — Analysis: strategy components** · S · depends on: D.3
- Files: `components/analyze/ExtensibilityDecisionMatrix.tsx`, `BusinessValueAudit.tsx`, `TargetScopeMapping.tsx`,
  `ModernizationStrategy.tsx`, `ArchitecturalNextSteps.tsx`, `PlainEnglishGuide.tsx`.
- Content: `Sparkles` (4 files) → `CcProvenanceChip proposed`; 18 × < 11 px, 13 × 900 in the matrix; emojis (6).
- Done when: group `analyze-strategy` at 0; `extensibility-route-guard` green.

**D.14a — Design stage: page and architect sign-off** · M · depends on: D.5a, D.5b
- Files: `S/design/page.tsx`, `components/ArchitectSignOff.tsx`.
- Content: 75 hex, `toLocale*` l. 544, 644, 200; sign-off overlay (`ArchitectSignOff:246`) → `CcMessageBox` (binding
  confirmation = `dark` button, §1.5); selects/textarea l. 377, 425 → cc; "Unlock & Change" (l. 269) factual;
  error text l. 319 not passed through to the UI.
- Done when: group `design` (page share) at 0; `decision-card`, `counter-check-guard` green.

**D.14b — Design stage: components** · M · depends on: D.5a
- Files: `components/design/*.tsx` (12 files).
- Content: `TargetArchitectureDiagram` 20 emojis + 10 hex; `CloudServiceIntegrations`/`SecurityHardeningChecklist`
  `onClick` divs + overlays → `CcDisclosure`/`CcDialog`; 53 × < 11 px.
- Done when: group `design` at 0.

**D.15 — Transformation** · M · depends on: D.5a
- Files: `S/transformation/page.tsx`, `components/CodeHighlighter.tsx`.
- Content: **"AI Generated" + Sparkles (l. 1100–1101) → `CcProvenanceChip value="proposed"`**; drawer `bg-slate-900`
  (l. 1211–1226) → `CcDialog` light; toast substitute l. 1029 → `CcToast`; `Cpu` l. 872; code display → `CcCodeSurface`.
- Done when: group `transformation` at 0; `generated-package-repair`, `repair-draft*` green.

**D.16a — Documentation: page** · M · depends on: D.5a, D.5c, D.9
- Files: `S/documentation/page.tsx`.
- Content: 76 × < 11 px, 69 × 900, 79 hex, 10 tables, 14 free badges, 9 colour dots without text, drawer l. 1750/1764 →
  `CcDialog`, "Generate Business Layer (AI)" (l. 1686) → label without the tag + cost/model statement (§2.8),
  `Cpu` l. 1460/1637, style list l. 1641.
- Done when: group `documentation` (page share) at 0; `documentation-blueprint-shape` green. Caution: 3.0.5
  (path C) rebuilds the same page — **D.16a after 3.0.5** or in the same move.

**D.16b — Documentation: components** · S · depends on: D.3
- Files: `components/documentation/ProcessDocumentationView.tsx`, `components/PresentationViewer.tsx`,
  `components/DocumentSection.tsx`, `components/MermaidDiagram.tsx`, `components/ProcessFlow.tsx`.
- Content: slide switcher with names and focus (UX-033/068), `Cpu` in `ProcessFlow`, `toLocale*` `PresentationViewer:97`.
- Done when: group `documentation` at 0.

**D.17a — Testing: page, presentation part** · M · depends on: D.3, D.5d
- Files: `S/testing/page.tsx`, `components/TestingCharts.tsx`.
- Content: "Passed"/"No verdict" → `proven`/`not-determined` (neutral, not amber); chart per §1.8 with
  `lib/chart-colors.ts`; 78 × < 11 px, 75 × 900, 65 hex, 10 gradients, `Sparkles` l. 937.
- Done when: R1–R5, R12–R15 of group `testing` at 0; `test-verdicts-guard`, `verdict-honesty-guard` green.

**D.17b — Testing: page, forms and dialogs part** · M · depends on: D.17a, D.5a, D.5b
- Files: `S/testing/page.tsx`.
- Content: 9 fields without names (l. 1130–1782) → `CcField`; overlay l. 2042 → `CcDialog`; `onClick` divs l. 1774, 2042;
  22 raw buttons; headings.
- Done when: group `testing` at 0; D.2 route `testing` clean.

**D.18 — Economics** · M · depends on: D.5b
- Files: `S/tco/page.tsx`, `components/tco/OptionComparison.tsx`.
- Content: fields l. 247, 287, 304 and `OptionComparison` l. 139, 239, 242 → `CcField` (required fields ADR-035 with `*`
  and `aria-required`, value states); `focus:ring` → ring from D.3; print (`window.print` l. 140) in the `.cc` context.
- Done when: group `tco` at 0; `tco-cost-inputs-guard`, `money-honesty-guard`, `cost-assumptions` green.

**D.19 — Handover** · S · depends on: D.5a
- Files: `S/delivery/page.tsx`, `components/ComplianceReviewHints.tsx`, `components/PersonalDataHints.tsx`,
  `components/ReviewTasks.tsx`, `components/ModelStagesCard.tsx`.
- Content: `alert` l. 471, 909 → `CcMessageStrip`/`CcToast`; "Estimated by the test generator" (l. 770) → chip; `Cpu`
  in `ModelStagesCard`.
- Done when: group `delivery` at 0; `delivery-*`, `compliance-review-hints-guard`, `review-tasks-guard` green.

#### Lane C — frame, account, public

**D.6 — Shell bar per §2.1** · M · depends on: D.3, D.5a
- Files: `app/(app)/layout.tsx`, `components/ShellHelpMenu.tsx`, `components/HeaderAuthButton.tsx`,
  `components/MaintenanceNotice.tsx` (`SiteFooter` belongs to D.24).
- Content: path "My workspace › project", search entry ⌘K (opens `CommandSearch` in the project), density toggle in the
  account menu (browser storage, try/catch); plan badge (l. 131–138) → `CcTag` or gone; 9/10 px texts; sign-out →
  `CcMessageBox`; `main` with visible focus (l. 372); no green hovers.
- Guard: `a11y-source-guard` (adjust shell tests).
- Done when: group `shell` at 0; `workspace-a11y`, `a11y-source-guard`, `profile-session-guard` green.

**D.7 — Onboarding, terms gate, legal overlay** · M · depends on: D.5a
- Files: `components/UserOnboarding.tsx`, `components/TermsReacceptGate.tsx`, `app/components/LegalOverlay.tsx`.
- Content: three overlays → `CcDialog` (QA b0b3150a1974, 58dc160fd6c3); "powered by Generative AI" (`UserOnboarding:333`)
  factual; `rounded-[2rem]`; emojis.
- Done when: group `onboarding` at 0; `terms-*`, `registration-flow-guard`, `credential-and-consent-guard` green.

**D.8 — One assistant, one glossary** · M · depends on: D.5a, ADR-043
- Files: `components/GlossaryChatbot.tsx`, `components/GlossarySidebar.tsx`, `components/GlossaryTerm.tsx`,
  `components/QuickAnswer.tsx`.
- Content: one entry point instead of two FABs; no emerald; `GlossaryTerm` onto the popover pattern of `GlossaryText`
  (keyboard, UX-045); error text l. 430 without "AI modernization engine"; UI name "Chatbot" → assistant label from
  `assistant-label`; `QuickAnswer` collapsed state (UX-058).
- Done when: group `glossary` at 0; `assistant-label`, `ask-this-case` green.

**D.20a — Settings: dialogs and forms** · M · depends on: D.5a, D.5b
- Files: `app/(app)/settings/page.tsx`.
- Content: 13 native dialogs (among others `window.confirm` l. 597, `window.prompt` l. 788/807/813) → `CcMessageBox`/`CcDialog`
  with a field; 17 fields → `CcField`, toggles → `CcSwitch` (QA c2923dfd70ab); "Preferences Saved!" → `CcToast`; overlays
  l. 1995, 2205.
- Done when: R6, R9, R10 of group `settings` at 0; `mfa-*`, `s4-mfa-enrolment-guard`, `account-erasure`,
  `dark-mode-guard` ("System Preferences" stays) green.

**D.20b — Settings: presentation** · M · depends on: D.20a
- Files: `app/(app)/settings/page.tsx`.
- Content: 462 palette, 70 × 900, 42 × < 11 px, 60 radii, 16 shadows, 12 animations, 7 emojis, `toLocale*` l. 1929.
- Done when: group `settings` at 0.

**D.21 — Admin** · M · depends on: D.5a, D.5d
- Files: `app/(app)/admin/page.tsx`, `app/(app)/admin/approve-tenant/page.tsx`, `components/admin/UsageQuotaPanel.tsx`.
- Content: 5 native dialogs (`confirm` l. 188) → `CcMessageBox`; coloured pills (8 in `admin/page.tsx`) →
  `CcObjectStatus`/`CcTag`; dark theme in `approve-tenant` (`bg-slate-800`, `bg-green-950/60`) → light; "Unlocked"
  (l. 473) factual; admin rows with expanded state (UX-078).
- Done when: group `admin` at 0; `admin-*`, `tenant-*` specs green.

**D.22a — Dashboard rebuilt per DESIGN.md** · M · depends on: D.3, D.5a–d (E-6 changed: rebuild, do not remove — Sonny 24.09.2026, ADR-052)
- Files: `app/(app)/dashboard/page.tsx` and components used only by it (`components/StarterExamples.tsx` UX-063, project row, example gallery).
- Goal: The dashboard is the "My workspace" page per mockup 2.8 s7 and §2.2 (List Report): `CcTable`/`CcFilterBar`, project row as button/link with keyboard, actions as `CcButton`/icon buttons with names, `CcObjectStatus`, `CcMessageStrip`, `CcDialog` for delete; no palette, no < 11 px, no `font-black`, no emojis/AI symbolism; one example gallery instead of two (UX 2cf6bb463ace). Nothing the dashboard can do today gets lost (list, continue, duplicate, export, delete, invite, quota, examples, card "Your turn").
- Done when: group `dashboard-legacy` in the design guard at 0; dashboard specs green; screenshot before/after.

**D.22b — Stage demo rebuilt per DESIGN.md** · M · depends on: D.3, D.5a–d, D.9 (E-6, ADR-052)
- Files: `app/(app)/demo/[stage]/page.tsx`, `components/demo/DemoWorkspace.tsx`, `components/demo/DemoEntryCard.tsx` and components used only by them.
- Goal: The demo's stages carry the same headers (D.9, 22/800), tokens, chips and building blocks as a real project; demo hint as `CcMessageStrip` ("Demo project — fictitious code"); no path to signature, quota or export (§6.1.2). All stops of the tour and `tests/demo-*.spec.ts` stay valid; regenerate `lib/demo-release.json` only if the engine output changes.
- Done when: group `demo-legacy` at 0; demo specs green; screenshots of every stage before/after.

**D.22c — Remove orphaned components** · S · depends on: D.22a/b
- Only files that are really unused (before deleting, a `grep -rl` each in `app/`, `components/`, `tests/`): `components/FileList.tsx`, `FileUpload.tsx`, `JiraIntegrationModal.tsx`, `UpgradeToEnterpriseModal.tsx`, `components/process-target/IstSollComparison.tsx`, `TargetModelView.tsx`, `components/process-states/ProcessStatesPanel.tsx`, `components/Skeleton.tsx` (after D.5c). Whatever is used after all stays and is rebuilt in the responsible step.

**D.23a — Knowledge pages in the app frame, part 1** · M · depends on: D.24 (header), E-5
- Files: `app/(app)/clean-core-explained/page.tsx`, `clean-core-score/page.tsx`, `how-it-works/page.tsx`,
  `sap-cloudification/page.tsx`, `abap-custom-code-analysis/page.tsx`, `sap-clean-core-object-classification/page.tsx`.
- cc: `SectionHeader`, `publicButton`, tokens, public radii allowed.
- Content: 900 (163 in the area), `Sparkles` (`clean-core-score:349`, `clean-core-explained:395`), `Bot`
  (`how-it-works:217,224`), `Cpu`; SEO unchanged (URL, canonical, content — roadmap 3.0.6).
- Done when: group `knowledge` (share) at 0; `seo-surface-guard`, `copy-ci-guard`, `level-rule-page-guard` green.

**D.23b — Knowledge pages in the app frame, part 2** · M · depends on: D.24
- Files: `app/(app)/knowledge/page.tsx`, `how-to/page.tsx`, `about/page.tsx`, `trust/page.tsx`,
  `tenant-security/page.tsx`, `first-run/page.tsx`, `verify-pack/page.tsx`, `invitation/[projectId]/[invitationId]/page.tsx`,
  `components/KnowledgeClient.tsx`, `components/HowToClient.tsx`, `components/GuideShareBar.tsx`,
  `components/TrustBeforeUpload.tsx`, `components/InviteReaderDialog.tsx`.
- Content: `tenant-security` 6 emojis + h2→h4 jumps; `InviteReaderDialog` → `CcDialog`; `verify-pack` 69 palette.
- Done when: group `knowledge` at 0; `trust-card-guard`, `how-to-phases-guard`, `verify-export-verdict-guard` green.

**D.24 — One public header and footer** · M · depends on: pp-306 merged into `integrate/next-3.0`
- Files: `components/PublicHeader.tsx` (new, extracted from the header of `app/page.tsx` pp-306), `app/page.tsx` (only
  replace the header), `app/catalog/layout.tsx`, `app/features/layout.tsx`, `components/SiteFooter.tsx` (if not D.6 —
  assignment: **here**, D.6 leaves it out).
- Content: UX-082 "two header patterns"; sign-in button in the same place (`?auth=signin`).
- Done when: `landing-*`, `public-back-navigation-guard`, `seo-surface-guard` green; one header on all public
  pages (the remaining pages switch over in D.25/D.26).

**D.25a — Catalogue and level method** · M · depends on: D.24
- Files: `app/catalog/page.tsx`, `app/catalog/[object]/page.tsx`, `[object]/not-found.tsx`,
  `app/catalog/browse/[letter]/page.tsx`, `app/catalog/module/[area]/page.tsx`, `components/catalog/*`,
  `app/method/levels/page.tsx`.
- Content: level colours per §1.8 (A `information`, never green) with `CcCleanCoreLevel`; 25 × 900 in `method/levels`.
- Done when: group `catalog` at 0; `catalog-*`, `sitemap-guard`, `seo-surface-guard` green.

**D.25b — Whitepaper, facts, reference analysis, licences** · M · depends on: D.24
- Files: `app/whitepaper/page.tsx`, `app/facts/page.tsx`, `app/reference-analysis/page.tsx`, `app/licenses/page.tsx`,
  `app/clean-core-explained-print/page.tsx`.
- Content: whitepaper 136 palette/31 × 900; print page 86 hex → tokens + §7.1.
- Done when: group `public-content` at 0; `claims-honesty-guard`, `content-dates-guard` green.

**D.26 — Legal and auxiliary pages** · S · depends on: D.24
- Files: `app/terms/page.tsx`, `app/terms/versions/[version]/page.tsx`, `app/datenschutz/page.tsx`,
  `app/datenschutz/de/page.tsx`, `app/impressum/page.tsx`, `app/auth/action/*`, `app/survey/[token]/*`,
  `app/unsubscribe/*`, `app/error.tsx`, `app/not-found.tsx`.
- Content: tokens, weights; `SurveyClient:377` focus; texts **unchanged** (legal texts).
- Done when: group `legal` at 0; `terms-*`, `survey-guard`, `auth-action-link` green.

**D.27 — Landing follow-up and sign-in dialogs** · M · depends on: pp-306 merged, D.5a, D.5b
- Files: `components/LandingModals.tsx`, `components/landing/public-button.ts`, `app/page.tsx` (only l. 509–516
  mesh hex → tokens, its own lines; not in parallel with D.24).
- Content: sign-in/registration/legal overlays → `CcDialog`, **fields and flow unchanged** (account rule);
  "⚡ Disclaimer … powered by Generative AI" (l. 836) factual; 23 × < 11 px, 16 buttons, 9 fields without names;
  `public-button` secondary hover as a token.
- Done when: groups `landing` at 0; `registration-*`, `handle-claim-guard`, `landing-*` green.

**D.28 — Exports and print** · S · depends on: D.3
- Files: `lib/audit-pack.ts` (only the style block l. 331–340), `lib/board-deck.ts` (check colours), `S/tco/page.tsx`
  **not** (belongs to D.18).
- Content: font System/Inter instead of Calibri, headings/table headers in ink instead of brand green, footer ≥ 4.5:1;
  no effect on signed content (style lies outside the canonical data — check with
  `audit-pack-canonicalisation`).
- Done when: `audit-pack-*`, `export-escaping-guard`, `export-inertness-guard`, `board-deck.integrity` green.

### Order and parallelism

| Wave | Lane A | Lane B | Lane C |
|---|---|---|---|
| 0 | D.4 (decisions, Sonny) | — | — |
| 1 | D.1 | — | — |
| 2 | D.3 | D.9 | D.6 |
| 3 | D.5a | D.10a | D.8 |
| 4 | D.5b | D.13 | D.7 |
| 5 | D.5c | D.11 | D.20a |
| 6 | D.5d | D.10b | D.20b |
| 7 | D.2 | D.12 | D.21 |
| 8 | D.29 | D.14a | D.22 (with 3.0.1) |
| 9 | — | D.14b | D.24 (after the pp-306 merge) |
| 10 | — | D.15 | D.23a |
| 11 | — | D.16b | D.23b |
| 12 | — | D.16a (after 3.0.5) | D.25a |
| 13 | — | D.17a | D.25b |
| 14 | — | D.17b | D.26 |
| 15 | — | D.18 | D.27 |
| 16 | — | D.19 | D.28 |
| 17 | D.30 | — | — |

**Count:** 40 steps (D.1–D.4, D.5a–d, D.6–D.9, D.10a/b, D.11–D.13, D.14a/b, D.15, D.16a/b, D.17a/b, D.18, D.19,
D.20a/b, D.21, D.22, D.23a/b, D.24, D.25a/b, D.26–D.29, D.30); motion (§1.7/§5.4) has no step of its own — it sits in D.3
(global) and in the surface steps. Three lanes, at most three agents at a time; the file sets are disjoint, each lane has its
own exception list files.

**Additionally, for every step:** screenshots via `tests/capture-screens.spec.ts` before/after; `npm run build`
without errors; the specs named in "Done when" plus `design-system-guard` and (from D.2) `design-rendered-guard` green;
one push to `dev` and the QA loop (`qa-review-loop`).

### Coordinator's addenda (24.09.2026, from D.3)
- **D.6:** `<MotionConfig reducedMotion="user">` in `app/(app)/layout.tsx` and in the public layout — otherwise the JS animations of the motion library ignore `prefers-reduced-motion`.
- **D.20a:** the two switches on `/settings` have no visible focus (`outline-none` + `focus-visible:outline-2` without a style); `KNOWN_BARE_SWITCHES = 2` in `tests/cc-token-guard.spec.ts` must go to 0 with it.
- **D.30 / Lane A:** R8 should also count the pattern `outline-none` + `focus-visible:outline-<n>` without `outline-solid`/ring (Tailwind v4 then draws nothing).
- **Whoever touches `lib/workspace-rows.ts` (D.29):** delegate `isoDate` to `formatIsoDate` from `lib/format.ts`.

### Coordinator's addenda (from D.9)
- **All stages D.10–D.19:** title via `<StageHeader stage="…">` from `PHASES` (lib/workflow-steps.ts), no more titles of their own ("Code Analysis", "Project Handover" …); `align="center"` is dropped (mockup is left-aligned) — D.10a, D.19.
- **D.29 / Lane A:** `PHASE_TONE_CLASS` in `lib/workflow-steps.ts` onto tokens; "stale" is `warning` (§1.1), not rose; `tests/phase-honesty-guard.spec.ts` checks the literal `'green'` — update it along with it. Workspace links (`ToolBar`, `StatusLine`, `NextStepCard`) append `?view=…&from=…`, so that "Back to workspace" leads into the right view.
- **D.22a:** dashboard `page.tsx:1882` "7. Process Documentation" → name from `PHASES` (UX-169).
- **D.28 / D.19:** `lib/markdownFormatter.ts:201` "# 📋 Process Blueprint Documentation" (emoji, old name) and `delivery/page.tsx:415` file name `process-blueprint.md` (UX-169).
- **D.16a:** export fallback `'Process Blueprint'` in `documentation/page.tsx:795` (UX-169).
- **D.18 / D.22b:** TCO and demo eyebrows as badges of their own.
- **D.9 remainder (Lane B):** info tooltip in `CollapsibleAccordion` only via hover — make it reachable by keyboard (WhyPopover pattern) as soon as a stage step touches the file.
- **D.6:** shell "Back to My Workspace" and the new stage link sit close together — check the shell variant.

### Coordinator's addenda (from D.5d)
- **D.30 / token review:** `--cc-warning` (#92400e) is hard to tell apart from error red in bars — check the token.
- **D.17a (or whoever builds Recharts):** under forced-colors, SVG `fill` keeps its colour; add a rule for SVG shapes in `globals.css` (Lane A) — report it, do not change it yourself.
- **D.29:** `ItAnswers.tsx` shows the severity as text ("CC-017 · High") → `CcSeverity`.
- **All surface steps:** severity only via `CcSeverity` / `normaliseSeverity()` from `lib/severity.ts`; chart colours only from `lib/chart-colors.ts`.


### Coordinator's addenda (end of day 24.09.2026)
- **D.10a done** (Analyze page: R1, R2, R4, R5, R7, R8, R12–R18 at 0). What remains for **D.10b**: R9 (dropzone, four deployment cards), R10 (two overlays → CcDialog), R11 (one table → CcTable), real ARIA tabs instead of aria-pressed, `EvidenceSweep minDuration={6000}` and the ScannerConsole theatre (§5.4), the editable field labelled "Read-Only Preview". Local `SeverityWord` → `CcSeverity`. R3 (223 hex) belongs to the Confluence export → **D.28**.
- **D.6 started** (`useShellMenu`, shared menu keyboard; panel/item classes). Open: both menus onto the hook (`role=menu`/`menuitem`, tighten the guard in a11y-source-guard), shell bar per the mockup (56 px, path instead of "Back to My Workspace", Ctrl K, quota 12/600), plan badge → CcTag, sign-out → CcMessageBox ("Sign out now" stays), visible focus on `main`, `<MotionConfig reducedMotion="user">` in `app/layout.tsx`, HeaderAuthButton busy, MaintenanceNotice → CcMessageStrip + formatDateTime, banner tokens only + ⚡ out, lower the ceilings.
- **Decisions for D.6/D.29:** density switch (§2.9) only once Lane A has a density variant — out of D.6. Project name in the path: not via an additional getDoc (it loads the source code along with it); stages/WorkspaceShell pass it to the shell — D.29. Search from the shell: a named event that `CommandSearch` listens to — D.29; after that, the separate path/search line in WorkspaceShell is dropped.

### Coordinator's addenda (30.09.2026, wave 2: D.6, D.10b, D.11, D.13, D.20a done)
- **D.7:** after the account deletion, `UserOnboarding` (reads `auth.currentUser` only at render) lays its card over every confirmation — react to the auth change, then show the notice "Account deleted" again.
- **D.8:** two assistant entry points (header button and green FAB "Ask this case"); the comment in `tests/transformation-docs.spec.ts:24` is outdated (the import of `GlossarySidebar` is gone).
- **D.12:** `GapsWorklist` — the cause of the `strategy` crash is fixed (`26e3ba43`); the Analyze panels are now all mounted (CcTabs), `AbcdClassificationPanel` calls `/api/abcd-classify` on load.
- **D.13 remainder / D.10b remainder:** `BusinessValueAudit` gets a fallback text (`bizFallback`) without a provenance marker; tooltip in `TargetScopeMapping` only via hover.
- **D.20b:** card look, password strength colours, emojis, R14/R16/R17; the two toggles are deliberately `CcCheckbox` (they only take effect with Save — switch contract).
- **D.28:** R3 (223 hex) and R11 (6 tables) in `analyze/page.tsx` are the Confluence export.
- **D.29:** project name into the shell path; Ctrl K via an event to `CommandSearch`; check `ABCD_META.color/.badge` (green A) and `LEVEL_EMOJI` in `support-matrix.ts` for usage; `SupportLevelMark` as a fixed list to Lane A.
- **D.30 / Lane A:** R7 counts `hover:bg-*` as a surface of its own; the R18 exception does not recognise `rounded-cc-row`; `CcButton` does not forward a `ref` (menu triggers need it); rename the `CollapsibleAccordion` prop `badgeSeverity 'green'`.
- **Open with Sonny:** banner sentence "Powered by Generative AI"; sign-offs in `ConstructFindings` are only local state ("Signed Off" promises more).

### Closing note — Block D complete (D.30, 30.09.2026)

- **No exception list any more.** `tests/design-baseline/` (26 group files, all empty) and
  `tests/design-rendered-baseline/` (the last ceiling: `/demo/[stage]` headings 1 — the demo stage cards were `h3`
  under the `h1`, now `level={2}`) are deleted, together with `scripts/design/baseline.ts` and the npm scripts
  `design:baseline` / `design:rendered-baseline`. `design-source-guard` and `design-rendered-guard` demand zero on
  every file and every route and fail if either folder comes back.
- **Every guard reads the whole app** (`app/**` without the route handlers `app/api/**`, and `components/**`):
  `cc-token-guard` (hex, palette, undeclared tokens, and — new — classes of the never-registered typography plugin),
  `cc-provenance-guard` (emitters, free severities, retired wordings; comments and data-contract values such as
  `status === 'Passed'` are not text), `model-text-guard` (symbolism and emoji in source, and rendered on every route
  of the design walk), `workflow-style-guard` (every visible text on every stage on the §1.2 scale, one title, no
  heading above it).
- **What the widened guards found, and the fixes:** retired wordings on the stages (`Passed`/`No verdict` →
  *Proven*/*Not determined* in Testing, as D.17a planned; `Not computed` → *Not determined*; `Signed off` →
  *Confirmed*, with the person icon instead of the proof shield); generated Markdown rendered at browser defaults
  because `@tailwindcss/typography` is installed but never registered (`prose-*` emitted nothing) → one
  `.cc-prose` in `app/globals.css` on the type scale, used by Analyze, Design, Testing, the dashboard and the
  assistant; the board presentation preview at 30/18 px → the title, body and figure roles. One historical hex in a
  `StageHeader` comment table.
- **Named exceptions, the only ones:** `.md` export, `app/datenschutz/de`, the code surface, the landing mesh and
  public radii (R12 is a workspace rule), the standalone exports in `lib/`. Each is a rule with its reason in the
  guard, none a list entry.
- **Lane A notes:** R7 `hover:bg-*`, R8 `outline-none` + `focus-visible:outline-<n>` and the R18 `rounded-cc-row`
  chip case were already settled in D.5e (the source guard tests them); `CcButton` forwards `ref` (D.5e); the
  `badgeSeverity` values are `neutral | warning | error` (no `'green'`). Token review: `--cc-warning` (#92400e) sits
  at nearly the lightness of `--cc-error` (L* 37.5 vs 40) — bars, chart segments and status dots now take the new
  `--cc-warning-mark` #d97706 (L* 60, 3.19:1 on white); text keeps `--cc-warning`. `CcButton` documents that a label
  mixing text and elements goes in one `<span>`.
- **For the owner:** DESIGN.md 1.8 (the new mark token, `.cc-prose`, §8) is marked as a draft for acceptance. A
  top-anchored `CcDialog` variant (from D.32) is noted, not decided. "Confirm"/"Confirmed" in `ConstructFindings`
  is still only local state (the open point above). The request-access mail and the Jira callback page in
  `app/api/` still carry hex colours — outside the UI scope of the guards, like the mail templates.
