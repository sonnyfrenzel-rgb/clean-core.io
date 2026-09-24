# „Aus einem Guss" — Lückenliste gegen DESIGN.md 1.4.3 und Abbauplan D.1 ff.

Stand 24.09.2026 · Auftrag Sonny: „die ganze App muss vor 3.0 aus einem Guss sein" · nur gelesen, nichts im Repo geändert.

## 0. Grundlage und Methode

- **Gemessener Stand:** `integrate/next-3.0` @ `3498609` (pp-int), darüber die Dateien, die `feat/3.0.6-landing` @ `c859e89`
  (pp-306) ändert, hinzufügt oder löscht (`app/page.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `app/facts`,
  `app/whitepaper`, `components/landing/*`, `SectionHeader`, `HeaderAuthButton`, `CatalogSearch`; gelöscht u. a.
  `BenefitCard`, `TransformationShowroom`, `PilotWarningBanner`, `SamplePackageDownload`). pp-306 liegt 10 Commits hinter
  `integrate/next-3.0`. Zusammengeführter Messbaum: `design-audit/tree/` (230 UI-Dateien `.tsx` unter `app/` und
  `components/`, ohne `app/api`).
- **Skripte** (alle im Scratchpad `design-audit/`, wiederholbar): `measure.mjs` (Hauptmessung, Ergebnis `metrics.json`,
  `summary.json`), `perfile.mjs` (Schuld je Datei, `perfile.txt`), `iconbtn.mjs`, `inputs.mjs`, `badges.mjs`,
  `orphans.mjs`, `table.mjs`.
- **Grenzen der Messung:** Quelltext-Heuristik, keine gerenderte Messung. Kommentare sind entfernt; bedingtes Rendern
  und Klassen aus Variablen werden nicht aufgelöst. Die Zahlen sind deshalb Größenordnungen je Datei, keine exakten
  Pixelbefunde — die gerenderte Wahrheit liefert erst Schritt D.2. Wo ein Einzelbeleg zitiert wird, ist die Zeile
  geprüft.

### Das Bild in einem Absatz

Die neue Welt ist sauber: `components/cc`, `components/workspace`, `components/process-map`, die Galerie und die
Arbeitsraum-Route haben **0** Hex-Literale, **0** Palettenfarben, **0** Schrift unter 11 px (bis auf zwei Stellen),
**0** `font-black` — gehalten von `cc-token-guard`, `cc-style-guard`, `cc-provenance-guard`, `workspace-shell-guard`
und `workspace-a11y`. Die Landingpage aus pp-306 ist nahe dran. **Alles andere ist die alte App:** die sieben Stufen
(die in 3.0 als Werkzeuge bleiben, Roadmap 3.0.1), Einstellungen, Admin, das alte Dashboard, die Wissens- und
öffentlichen Seiten und die geteilten Altkomponenten. 193 von 230 UI-Dateien importieren keine einzige cc-Komponente;
die sieben Stufenseiten importieren **keine**. Kein Guard außer `dark-mode-guard` und der Blockliste reicht über den
neuen Namensraum hinaus.

### Schuld je Bereich (Quelltext-Treffer)

| Bereich | <11 px | 900 | Hex | Palette | Grün | roher `<button>` | nativer Dialog | eig. Overlay | Radius >12 | Schatten lg+ | Verlauf/Mesh | dunkle Fläche | freie Hinweisbox | Emoji | KI-Icon | Abstand off-grid |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stufen (7 Seiten + `components/analyze`, `design`, `tco`, `documentation`) | 470 | 314 | 512 | 3.048 | 624 | 102 | 2 | 8 | 247 | 85 | 36 | 80 | 139 | 92 | 23 | 433 |
| Geteilte Altkomponenten (`components/*.tsx`) | 94 | 120 | 56 | 1.192 | 266 | 82 | 4 | 13 | 113 | 51 | 7 | 37 | 47 | 5 | 9 | 226 |
| Einstellungen | 42 | 70 | 18 | 462 | 84 | 35 | 13 | 2 | 60 | 16 | 9 | 9 | 20 | 7 | 0 | 61 |
| Dashboard (alt) | 24 | 30 | 92 | 394 | 97 | 42 | 2 | 8 | 28 | 16 | 15 | 15 | 15 | 20 | 0 | 63 |
| Admin | 24 | 41 | 1 | 299 | 35 | 16 | 5 | 0 | 27 | 15 | 3 | 15 | 13 | 2 | 0 | 68 |
| In-App-Wissensseiten & Shell (`app/(app)/*` sonst) | 38 | 163 | 1 | 977 | 307 | 8 | 0 | 2 | 96 | 28 | 28 | 9 | 32 | 6 | 8 | 94 |
| Öffentliche Seiten (`app/*` ohne Landing) | 29 | 204 | 101 | 920 | 191 | 6 | 0 | 1 | 67 | 6 | 4 | 13 | 27 | 0 | 1 | 66 |
| Alte Demo (`components/demo/DemoWorkspace*`) | 6 | 35 | 0 | 147 | 4 | 5 | 0 | 0 | 3 | 0 | 0 | 3 | 5 | 0 | 0 | 47 |
| Landing (pp-306) | 0 | 0 | 6 | 11 | 0 | 2 | 0 | 0 | 6* | 3* | 1* | 0 | 0 | 0 | 0 | 40 |
| Arbeitsraum + Prozesskarte | 2 | 0 | 0 | 0 | 0 | 31 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 129 |
| `components/cc` + Galerie | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 45 |

\* Auf öffentlichen Seiten erlaubt (§1.4: 22–28 px, Mesh ≤ .18).

Die zehn schwersten Dateien (Summe der Regeltreffer): `stage/analyze/page.tsx` 1.040 · `settings/page.tsx` 876 ·
`stage/testing/page.tsx` 852 · `dashboard/page.tsx` 817 · `stage/documentation/page.tsx` 703 ·
`components/LandingModals.tsx` 372 · `stage/transformation/page.tsx` 267 · `clean-core-explained/page.tsx` 251 ·
`whitepaper/page.tsx` 250 · `admin/page.tsx` 220 (vollständige Tabelle: `design-audit/perfile.txt`).

---

## 1. Lückenliste je Abschnitt

Spalten: **Regel** (kurz) · **erfüllt** · **nicht erfüllt** (Belege) · **Guard** (vorhanden / Umfang).
Pfadkürzel: `S/…` = `app/(app)/project/[projectId]/…`.

### §1 Look & Feel

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 1.1 Tokens | Farben nur als `--cc-*`-Tokens; keine Hex-Literale, keine Tailwind-Palette | `components/cc`, `components/workspace`, `components/process-map`, Galerie, `S/page.tsx`: 0/0. Landing pp-306: 236 cc-Klassen, 11 Palette | **Palette 7.450× in 145 Dateien** (top: `settings/page.tsx` 462, `S/analyze/page.tsx` 459, `S/testing/page.tsx` 402, `dashboard/page.tsx` 394, `S/documentation/page.tsx` 286, `LandingModals.tsx` 202). **Hex 787× in 46 Dateien** (top: `S/analyze/page.tsx` 229 — eine komplette Atlassian-Palette `#ebecf0`, `#6b778c`, `#0747a6`, `#de350b` … ab Z. 620; `dashboard/page.tsx` 92 — `from-[#006b2c] to-[#00873a]` z. B. Z. 777, 845; `app/clean-core-explained-print/page.tsx` 86; `S/documentation` 79; `S/design` 75; `S/testing` 65). Arbiträre Farben `bg-[#…]` 268× in 28 Dateien; `rgb()` 23×. Landing: Mesh-Hex `app/page.tsx:509–516`, `public-button.ts` secondary `hover:bg-green-100` | `cc-token-guard` (Hex, Palette, unbekannte cc-Token) **nur** `components/cc`, Galerie, `components/workspace`, `S/page.tsx`, `components/process-map`. `landing-style-guard` prüft app-weit nur „Farbstufe deklariert", nicht „Token statt Palette" |
| 1.1 Grün heißt belegt | Im Arbeitsraum Grün nur für `proven`/`success`; Primärfläche `--cc-brand-strong`; Auswahl `--cc-ink` | Arbeitsraum, Prozesskarte, cc: 0 grüne Palettenklassen; `cc-provenance-guard` misst `--cc-success` gerendert | **1.608 green/emerald/lime-Klassen in 115 Dateien**, davon Stufen 624. Beispiele: `StageHeader.tsx:60` grüne Icon-Blase auf jeder Stufe; Shell `app/(app)/layout.tsx:222` grüner Pillen-Button, Hover-Grün in jedem Kontomenüeintrag (Z. 261–290); `GlossarySidebar.tsx:54` emerald-FAB; `S/transformation/page.tsx:1100–1101` grünes „AI Generated"; `S/testing/page.tsx:689` + `TestingCharts.tsx:68` „Passed" in `#006b2c` | wie oben, nur neuer Namensraum |
| 1.1 Dunkel nur zweimal | Dunkle Flächen nur Code (`--cc-code-bg`) und Überlagerung (`--cc-overlay`) | Arbeitsraum: CodeSurface, Toast, CoachMarks | **181 dunkle Flächen in 54 Dateien** (`bg-gray-900/950`, `bg-slate-9xx`, `bg-black`): `S/documentation` 17, `dashboard` 15, `S/testing` 11, `S/transformation` 11 (u. a. Drawer `bg-slate-900` Z. 1226), `admin/approve-tenant` 10; Avatar-Button `layout.tsx:243` `bg-gray-900` | keiner außerhalb cc |
| 1.1 forced-colors | Zustände über Wort/Icon/Form, Fokus und Feldgrenzen sichtbar | `globals.css` `@media (forced-colors)` für `[data-cc-form]`, Diagramme, `.cc :focus-visible`, Auswahl | Regeln greifen nur im `.cc`-Geltungsbereich (15 Stellen: Arbeitsraum, Galerie, NewProject, ListReport, Demo-Shell, Hilfe-Dialog, Runner-Panel). Stufen, Einstellungen, Admin, öffentliche Seiten ohne | `cc-provenance-guard`, `workspace-a11y` (nur Arbeitsraum/Galerie) |
| 1.1 Kontrast | Text ≥ 4,5:1, Grenzen ≥ 3:1 | Token-Paare rechnerisch geprüft, Galerie gerendert | Altbestand nutzt `text-gray-400` (≈2,5:1 auf Weiß) massenhaft (z. B. `S/delivery/page.tsx:768`, `dashboard:822`), `globals.css:517–521` `.doc-table td::before` 10 px in `#9ca3af`; Export-Fußzeile `#7F7F7F` (`lib/audit-pack.ts:340`, 3,9:1) | `cc-token-guard` gerendert **nur Galerie**; `workspace-a11y` nur Arbeitsraum |
| 1.2 Schrift | Skala 22/15/14/13/11 px; **≥ 11 px**; kein 900 im Arbeitsraum; Versalien nur Labels | cc/Arbeitsraum ≥ 11 px (Ausnahmen `ProcessMiniMap.tsx:59` 10 px, `GlossaryText.tsx:40` 10 px — prüfen); Landing 0 < 11, 0 × 900 | **< 11 px: 729× in 102 Dateien** (`text-[10px]` 523, `[9px]` 174, `[8px]` 31, `[7px]` 1; top `S/testing` 78, `S/documentation` 76, `S/analyze` 58, `settings` 42, `dashboard` 24, `LandingModals` 23; Shell `layout.tsx:131–138, 175, 211` 9–10 px). **`font-black` 977× in 112 Dateien** (top `S/testing` 75, `settings` 70, `S/documentation` 69, `clean-core-explained` 37, `DemoWorkspace` 32, `whitepaper` 31) — **und `StageHeader.tsx:72` selbst** (`text-3xl md:text-4xl font-black`). Arbiträre Größen 1.358× in 178 Dateien. **Auch im neuen Namensraum:** `text-[12px]` 161× (cc 18×, Arbeitsraum/Prozesskarte 143×) — 12 px steht nicht in der Skala §1.2 → Entscheidung E-1. `uppercase` 991× / `tracking-widest` 356× (Versalien weit über Labels hinaus) | Schrift ≥ 11 gerendert **nur Galerie**; Quelle: kein Guard. `workflow-style-guard` hält nur die Gleichheit der Stufentitel (nicht die Skala) |
| 1.3 Abstand | 4-px-Raster, keine anderen Abstände | — | Halbe Schritte (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`) und `[Npx]` off-grid: **1.272× in 173 Dateien** — **auch cc selbst 43×** (`gap-1.5`, `py-0.5` in Chips) und Arbeitsraum/Prozesskarte 129× → Entscheidung E-2 | kein Guard (§8 verlangt ihn) |
| 1.4 Form/Tiefe | Arbeitsraum: Karte 12 px, Zeile/Feld/Button 8 px, Schatten `--cc-shadow`, einfarbiger Hintergrund; öffentlich 22–28 px, Mesh ≤ .18 | cc-Radien als Token (`rounded-cc-card/row`) | Im Arbeitsraum-Bestand: **Radien > 12 px 647× in 124 Dateien** (Stufen 247; `settings` 60; `UserOnboarding.tsx:71` `rounded-[2rem]`, `layout.tsx:318` `rounded-[2.5rem]`); **Schatten lg/xl/2xl 222× in 71 Dateien**; **Verläufe/Mesh 104× in 40 Dateien** (`dashboard` 15, `S/testing` 10 — `bg-gradient` 10×); `backdrop-blur` 55× in 34 Dateien; `hover:scale` 20× | keiner |
| 1.5 Buttons | Genau vier Varianten; 32/40 px; Destruktives über Message Box | `CcButton`/`CcLinkButton`/`CcIconButton` 74× in 22 Dateien; `publicButton()` auf der Landing | **334 rohe `<button>` in 85 Dateien**; 192 davon mit eigener Fläche → **141 unterschiedliche Stilkombinationen** (normalisiert auf Fläche/Text/Rand/Radius/Gewicht/Schatten; häufigste: `bg-gradient-to-br … rounded-xl text-white` 9×, `bg-slate-800 … rounded-xl` 4×, `bg-green-600 font-black rounded-2xl shadow-lg` 3×). top: `dashboard` 42, `settings` 35, `S/testing` 22, `LandingModals` 16, `S/analyze` 15. Rote destruktive Primärflächen (`layout.tsx:357`, `dashboard:861`) statt `ghost`+`error`-Schrift | vier Varianten **nur in cc und Galerie**; kein Guard gegen eigene Buttons anderswo |
| 1.5 Segmented Control, Icon-Button, Why?-Ziel | feste Formen, `aria-label` Pflicht | **Icon-Buttons: 46 icon-only Bedienelemente, 0 ohne Namen** (Messung `iconbtn.mjs`) — erfüllt | Segmented-ähnliche Umschalter im Bestand selbstgebaut (Stufen-Tabs, Einstellungen); Toggles ohne Switch-Semantik (UX-065, `settings`) | `a11y-source-guard` (einzelne Dateien) |
| 1.6 Fokus | 2 px `--cc-focus`, 2 px Abstand, an jedem bedienbaren Element | `.cc :focus-visible` (globals.css Z. 300–303); `workspace-a11y` | **Ring gilt nur innerhalb `.cc`** — außerhalb Browser-Standard oder gar keiner. `outline-none` ohne Ersatz 19× in 14 Dateien (`layout.tsx:372` main, `S/analyze:2330, 2717`, `GapAccordionCard:29`, `GapsWorklist:295,310`, `GlossaryChatbot:681`, `GlossarySidebar:110`, `UserOnboarding:71,172,201`, `DemoWorkspace:770,859`, `LegalOverlay:32`, `SurveyClient:377`); `focus:ring` statt `focus-visible` 7× (`S/tco:599`, `OptionComparison:139,242`, `UsageUpload:256,277`, `AtcFindingsPanel:133`, `GapsWorklist:287`). Ausnahmen im neuen Namensraum: `ProcessCodeCard.tsx:62`, `ProcessSearch.tsx:131`, `CommandSearch.tsx:258` (Eingabefeld in umrandender Box — prüfen) | `a11y-source-guard` („no outline removed") nur `layout.tsx`, `ShellHelpMenu.tsx`; gerendert Galerie + Arbeitsraum |
| 1.7 Icons | lucide 16/20 px, keine KI-Symbolik | cc/Arbeitsraum | KI-Icons **41× in 20 Dateien**: `Sparkles` (`S/testing:937`, `S/transformation:1100`, `StarterExamples:91`, `ArchitectSignOff:286`, `ExtensibilityDecisionMatrix:196`, `BusinessValueAudit:102`, `TargetScopeMapping:81`, `clean-core-score:349`, `clean-core-explained:395`), `Cpu` für Modellarbeit (`S/documentation:1460,1637`, `S/transformation:872`, `S/analyze:1839`, `ModelStagesCard:78`, `ProcessFlow:39`, `EvidenceSweep:137`, `PreAnalysisPreview:106`), `Bot` (`how-it-works:217,224`), `Brain` (`GapsWorklist:414`) | `model-text-guard` Symbolik **nur `components/cc` + Galerie** |
| 1.7 Bewegung | nur Zustandswechsel, 150–250 ms, `prefers-reduced-motion`; keine Dauerbewegung, kein Pulsieren | `FirstLook`, `ThreeViewsStage`, `ViewsStage` (Landing) respektieren reduzierte Bewegung | **Kein globales `prefers-reduced-motion`** in `globals.css`, kein `MotionConfig`; `animate-in` 104× in 39 Dateien, `animate-pulse` 37×, `animate-bounce` 7×, `animate-ping` 3×, `animate-spin` 54×; `motion`-Bibliothek in 13 Dateien ohne Reduktion. `EvidenceSweep.tsx:24` **`minDuration = 6000`** — die in §5.4 namentlich verbotene künstliche Mindestdauer, eingebunden in `S/analyze/page.tsx:2090` | keiner |
| 1.8 Diagramme | Zustandsdiagramme mit Zustandsfarben + Beschriftung; sonst kategoriale Palette; jede Zahl als Text | Management-Übersicht (Roadmap 3.0.10) mit `cc-chart-*`, Druck/forced-colors | `components/TestingCharts.tsx:68–69` Hex-Füllungen, „Passed"/„No verdict"-Torte in `#006b2c`/`#dc2626`/`#d97706` (`S/testing:689–693`) — *No verdict* ist `not-determined` = neutral, nicht Amber; `ModuleHeatmap.tsx:55–59` weiße 10-px-Schrift auf Füllung | `management-overview.spec.ts` (nur Management) |

### §2 Struktur & Interaktion (Fiori-Muster)

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 2.1 Shell Bar | Logo+Name, Pfad (Workspace › Projekt), Suche ⌘K, Hilfe, Kontomenü | Hilfe-Menü mit „Keyboard shortcuts" und „Show tips again" (`layout.tsx:292`); Skip-Link; ⌘K im Arbeitsraum (`CommandSearch`) | Shell (`app/(app)/layout.tsx`) ohne Pfad, ⌘K nur im Projekt; Plan-Abzeichen „Crown/Infinity/Zap" 10 px `font-black` (Z. 131–138), 9-px-Untertitel „Free Community Edition" (Z. 175), Abmelde-Dialog selbstgebaut mit `rounded-[2.5rem]`/`font-black`/rotem Primärbutton (Z. 311–357) statt `CcMessageBox`; keine Dichte-Umschaltung im Kontomenü (§2.9); zwei schwebende Hilfen (`GlossaryChatbot` FAB, `GlossarySidebar` FAB `GlossarySidebar.tsx:54`) — ADR-043 will **einen** Assistenten | `a11y-source-guard` (Hilfe-Menü, Skip-Link) |
| 2.2 Floorplans | List Report „My workspace", Object Page, Overview | `WorkspaceListReport` (hinter `/admin/workspace`), `WorkspaceShell`, `ManagementOverview` | Nutzer sehen weiter `dashboard/page.tsx` (2.063 Zeilen, 817 Treffer, 8 eigene Overlays, 20 Emojis) — Ablösung ist 3.0.1, aber der Rest des Dashboards (Upload-Dialog, Löschen, „What is this workspace") muss vorher im List Report sein oder bewusst fallen | `workspace-list-report.spec.ts` |
| 2.3 Object Page / Navigation | Kopf, Statuszeile, Werkzeugleiste, Anchor Bar, „Next step", Fußleiste nur beim Bearbeiten; Werkzeug öffnet Stufe, **„Back to workspace" kehrt zu Sicht und Ebene zurück** | im Arbeitsraum gebaut (`WorkspaceShell`, `StatusLine`, `ToolBar`, `LayerBar`, `NextStepCard`) | Stufenseiten haben kein „Back to workspace" (0 Treffer außer `BackLink.tsx`/`settings`); sie tragen stattdessen `Stepper` + `VerificationRail` (ADR-005: bis 3.0 nicht umbauen — mit 3.0 müssen sie zur Werkzeug-Seite werden). Überschriftenfolge in Stufen laut Quelle unsauber: `S/analyze` h1→h3, h3→h5; `S/documentation` h2→h4; `S/testing`/`S/tco`/`S/transformation` ohne eigenes h2 vor h3 (nur gerendert sicher prüfbar) | `workspace-shell-guard`, `workspace-a11y` (nur Arbeitsraum); Stufen: nur `workflow-style-guard` (Titelstil) |
| 2.4 Tabellen | Object Identifier, Zahlen rechts, Status als Text+Punkt, Toolbar mit Zähler, Leer ≠ Null Treffer, S = Karten, erste fünf + „Show all N" | `CcTable` (S-Karten, rechtsbündig), `CcObjectIdentifier`, `CcObjectStatus`, `CcEmptyState`/`CcNoMatches` | **53 rohe `<table>` in 26 Dateien** (top `S/documentation` 10, `S/analyze` 8, `S/design` 5, `method/levels` 3, auch `ManagementOverview` 3 und Landing 2) gegen 3 Nutzungen von `CcTable`; „Show all N" zweimal ad hoc gebaut (`ItAnswers.tsx:138,386`, `ManagementOverview.tsx:512,667`) statt in `CcTable`; Status als farbiger Punkt ohne Text-Kandidaten 34× in 13 Dateien (`S/documentation` 9, `S/testing` 5) | `cc-style-guard` Filter/No-match nur Galerie |
| 2.5 Filterleiste | Live-Filter, Zähler `aria-live`, „Clear filters" | `CcFilterBar` (Galerie, List Report) | eigene Filter in `GapsWorklist.tsx:282–343` (Suchfeld + drei Selects ohne Label, ohne Live-Zähler), `AtcFindingsPanel.tsx:128`, `UsageRiskMatrix` | Galerie |
| 2.6 Meldungen | Message Strip / Popover / Box (modal, `inert`) / Toast (`role=status`, nie Fehler) | `CcMessageStrip` 11×, `CcMessageBox` 2×, `CcToast` 1× | **26 native Dialoge in 8 Dateien**: `settings/page.tsx` 13 (u. a. `window.confirm` Z. 597, `window.prompt` Z. 788, 807, 813), `admin/page.tsx` 5 (`confirm` Z. 188), `dashboard` 2, `S/delivery` 2 (Z. 471, 909), `ProcessStatesPanel.tsx:149` `confirm`, `FileUpload:49`, `JiraIntegrationModal:59`, `StarterExamples:53`. **35 selbstgebaute Overlays** (`fixed inset-0`) außerhalb `CcMessageBox` in 23 Dateien; nur 11 Dateien setzen `aria-modal` (QA 58dc160fd6c3, b0b3150a1974). **Freie Hinweisboxen** (`bg-{red,amber,blue,green}-50` + Rand) 298× in 79 Dateien statt `CcMessageStrip`. Message Popover gibt es nicht in cc | `cc-style-guard` (Modal, Toast) nur Galerie |
| 2.7 Formulare | Label über Feld 13/600, `*` + `aria-required`, Value State mit Icon+Text, Prüfen beim Verlassen | `CcField` (+ `CcRequiredNote`) — genutzt in 4 Dateien | **101 Felder in 35 Dateien roh**, davon ~42 ohne programmatischen Namen (`inputs.mjs`: `S/testing` 9, `LandingModals` 9, `dashboard` 5, `GapsWorklist` 4, `S/tco:247,287,304`, `ArchitectSignOff:377,425` …; QA c2923dfd70ab); keine Value States außerhalb cc; Checkbox/Radio/Select/Switch-Varianten fehlen in cc | Galerie |
| 2.8 Laden | Skeleton > 300 ms, Busy am Auslöser nach 400 ms, keine blockierenden Spinner, Etappen statt Prozent, Kosten vor dem Klick | `CcRunIndicator`/`CcRunCost` (Galerie, Arbeitsraum), `NewProject` | `components/Skeleton.tsx` außerhalb cc (5 Nutzer); `Loader2 animate-spin` 36× in 12 Dateien, sofort statt nach 400 ms; „Loading…"-Texte 14×; `S/analyze:2098` „Evidence scan complete — waiting for AI narrative..." (Denk-Anmutung); Kontingent-Angabe vor dem Klick nur in `NewProject`/Galerie, nicht an den Stufen-Aktionen, die ein Modell aufrufen | Galerie (`cc-style-guard` Lauf) |
| 2.9 Dichte & Breakpoints | Dichte nach Zeiger, umschaltbar im Kontomenü (Browser); S/M/L/XL; Ziele 24/44 px | `CcButton` `pointer-coarse:min-h-11`; `workspace-a11y` prüft S und 44 px im Arbeitsraum | keine Dichte-Umschaltung, keine gespeicherte Dichte; Stufen/Einstellungen ohne S-Prüfung; kleine Ziele z. B. `p-1.5`-Icon-Buttons (`dashboard:822`) | nur Arbeitsraum |
| 2.10 Suche, Popover, Glossar | ⌘K im Projekt; Why?-Popover; Glossar gepunktet, Tastatur | `CommandSearch`, `CcWhyPopover`, `GlossaryText` (Arbeitsraum) | `GlossaryTerm.tsx` (11 Nutzungen im Altbestand) eigener Overlay (`:108 fixed inset-0`), nicht tastaturfähig (UX-045); zwei Glossar-Wege (`GlossaryTerm` vs `GlossaryText`) | `a11y-source-guard` teilweise |
| 2.11 Weniger zeigen | erste fünf Zeilen, Legende auf Abruf, Metadaten hinter „Details" | Arbeitsraum (`Details`, `LayerBar`-„More") | Stufenseiten zeigen alles offen (z. B. `S/documentation` 1.910 Zeilen, dauerhafte Legenden-Chips) | `workspace-shell-guard` |

### §3 Sprache und Formate

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 3 Englisch | UI und Erzeugtes englisch | fast überall | `app/datenschutz/de/page.tsx` bewusst deutsch (Rechtstext, Ausnahme festhalten); sonst 0 deutsche UI-Sätze gefunden | `public-texts-guard` (Dateien, nicht UI) |
| 3 Textschlüssel | jede sichtbare Zeichenkette **neuer** Oberflächen über Schlüssel | `components/cc` vollständig (51 Schlüssel in `lib/cc-messages.ts`) | `components/workspace`: nur 3 von 26 Dateien nutzen den Katalog (`AskThisCase`, `CommandSearch`, `WorkspaceListReport`); JSX-Textknoten hart: Arbeitsraum 25 in 12 Dateien, Prozesskarte 8, Demo-Shell 34 (String-Props zusätzlich, nicht gezählt) | `cc-style-guard` **nur `components/cc`** |
| 3 Zahlen/Datum | `Intl.NumberFormat('en')`; Text „15 Sep 2026", Metazeilen/Tabellen ISO in Mono; Uhrzeit mit Zeitzone | `lib/workspace-rows.ts:isoDate`, `formatAmount` in `cost-assumptions` | **27 gebietsabhängige Aufrufe** (`toLocaleString()` 14, `toLocaleDateString()` 12, `toLocaleTimeString()` 1 — deutsche Browser zeigen deutsche Daten): `UsageRiskMatrix` 3, `DemoWorkspace` 3, `S/analyze:729,1046`, `S/design:544,644`, `PreAnalysisPreview` 2, `FileList:47`, `settings:1929`, `AtcFindingsPanel:162`, `AtcUpload:164`, `ArchitectSignOff:200`, `PresentationViewer:97`; dazu 19× `'en-US'` (US-Format statt „15 Sep 2026"). **Kein zentrales `lib/format.ts`** | keiner |
| 3 Geld | Beträge entstehen nur in Economics, mit Währungscode | `money-honesty-guard`, `tco-cost-inputs-guard` | — (€-Treffer nur in Kommentaren) | vorhanden |
| 3.1 Keine KI-Spuren | keine Markdown-Reste, keine Blockliste, keine KI-Symbolik, keine Emojis, keine Denk-Ladezustände; Herkunft nur per Chip | Blockliste app-weit sauber; Chip *Model proposal* in cc | **Etiketten:** `S/transformation/page.tsx:1100–1101` Sparkles + „AI Generated" (retired → *Model proposal*); `S/documentation/page.tsx:1686` „Generate Business Layer (AI)"; „powered by Generative AI" in `LandingModals.tsx:836` (mit ⚡), `UserOnboarding.tsx:333`, `dashboard/page.tsx:944` („⚠️ AI Processing Notice … Generative AI"), `dashboard:1199` („fully automated AI refactoring live"); Fehlertexte „AI modernization engine" (`GlossaryChatbot.tsx:430`), „AI analyzed legacy database joins" als Fallback (`S/analyze:1500`), „The AI engine will prioritize" (`S/analyze:2637`). **Emojis 132× in 23 Dateien** (`S/analyze` 23, `dashboard` 20, `TargetArchitectureDiagram` 20, `S/testing` 8, `GapsWorklist` 8, `settings` 7, `tenant-security` 6; ✨ `dashboard:900,1009`). **Icons** siehe §1.7. **Stilliste** (Hinweis, kein Build-Bruch): „Comprehensive assessment" `S/analyze:2460`, „Unlock business-level mapping" `S/documentation:1641`, „S/4 Live Bridge Unlocked" `admin:473`. Modelltext-Bereinigung (`lib/model-text.ts`) im UI nur von `GlossaryChatbot` genutzt; Stufen rendern Modelltext direkt | `model-text-guard`: Blockliste app/components/lib ✔; Symbolik **nur cc + Galerie**; gerenderter Scan **nur Galerie**; Emojis nicht im Quellscan |

### §4 Vokabular

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 4 Herkunft | nur die neun Werte aus `lib/provenance.ts`, Pille mit Wort+Icon+Form | `CcProvenanceChip` (21 Dateien); `data-provenance` nur im Chip | Außerhalb: „AI Generated" (`S/transformation:1101`), „Passed"/„No verdict" (`S/testing:689–693`), „Estimated by the test generator" (`S/delivery:770`), „Estimated from access type…" (`AbcdClassificationPanel.tsx:245`), Stufen-Badges in eigenen Farben. **110 freie Chips/Badges** (klein, gerundet, farbig, außerhalb cc) in 41 Dateien — top `S/documentation` 14, `dashboard` 11, `admin/page.tsx` 8 (grün/rose/amber/blue/indigo-Pillen `text-[10px] font-black`), `S/analyze` 8, `layout.tsx` 6 (Plan-Abzeichen) | `cc-provenance-guard` (retired Wordings, einzig der Chip darf) **nur cc, Galerie, Arbeitsraum, Prozesskarte** |
| 4.1 Andere feste Listen | Objektstatus (Text+Punkt), Evidenzstufe/Level (Kennung), Regel-Eigenschaft (Tag) — je eigene Liste mit Guard | `lib/object-status.ts`, `lib/evidence-level.ts`, `lib/rule-property.ts`; `CcObjectStatus`, `CcEvidenceLevel`, `CcCleanCoreLevel`, `CcRulePropertyTag` | Level A–D im Altbestand frei gefärbt (`AbcdClassificationPanel`, `method/levels`, `catalog/[object]`) — prüfen gegen §1.8 (A blau, nie grün); **Schwere** (critical/high/medium/low) von Befunden hat **keine feste Liste** und keine Form in DESIGN.md, erscheint aber in `GapsWorklist`, `S/analyze`, `ConstructFindings`, `UsageRiskMatrix` → Entscheidung E-4 | `cc-provenance-guard` („four vocabularies") nur Galerie |
| 4 Begriffe | eine Schreibweise je Kernbegriff | 4. Topf „No catalogued path" in `lib/abap/public-cloud-fit.ts:122` und Landing | Roadmap 3.0.10 (b) sagt noch „Blocked by SAP" (Roadmap-Text, nicht UI); „Clean Core Score" (Seite `/clean-core-score`, `ManagementOverview.tsx:532` Kommentar) neben „Readiness" (§5.6, Glossar) — Schreibweise festlegen; „Check tenant connection" ✔ (`S/testing:894`) | `public-texts-guard` (Dateien) |

### §5 Erster Blick, Sichten, Prozesskarte

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 5.1–5.3 Aufbau, Etappen | Code spricht zuerst, ≤ 3 s, Skip, eine Live-Ansage je Etappe | `FirstLook.tsx` | — (Feinabnahme nicht Teil dieses Audits) | `first-look.spec.ts`, `a11y-source-guard`, `workspace-a11y` |
| 5.4 Was nicht | keine künstlichen Mindestdauern, keine Pulsierpunkte, keine Denk-Animationen | Arbeitsraum | `EvidenceSweep.tsx:24` `minDuration = 6000` (+ Z. 97–100 „Ensure minimum duration"); `animate-pulse` 37× (8 in `S/analyze`, 6 in `S/documentation`); `animate-ping` 3× | keiner |
| 5.5–5.6 Sichten | Business/IT/Management, Reihenfolge ADR-044, Antwort vor Zahl | Arbeitsraum, `ManagementOverview`, `ItAnswers` | — | `management-*`, `workspace-layers` |
| 5.7 Karte ohne Maus | ein Tab-Halt, Pfeile, `+ − 0`, Buttons dafür | Pfeile, Alt+↑, ⌘K (`a11y-source-guard`) | **Zoom `+`/`−`/`0`, `F`, `M`, `P` nicht verdrahtet** (so festgehalten in `tests/a11y-source-guard.spec.ts:51`) | `process-map.spec.ts`, `a11y-source-guard` |
| 5.8–5.9 BPMN/Navigation | Palette, Ebenen, Minikarte, Pfad | weitgehend (Roadmap 2.x) | Minikarte-Label `ProcessMiniMap.tsx:59` 10 px | `bpmn-export.spec`, `process-map.spec` |

### §6 Hilfestellung

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 6.1 Why? an Zahl/Status | Popover mit Herkunft | Arbeitsraum (`CcWhyPopover`) | Stufen: Zahlen ohne Why? (z. B. Scores in `WhyScorePanel` eigenständig, `S/testing` Kennzahlen) | — |
| 6.1 Leere Zustände | Illustration, Satz, eine Primäraktion | `CcEmptyState` (4 Dateien) | Stufen mit eigenen Leerzuständen (`NotGenerated.tsx`, `S/analyze:2363` „To start the AI modernization analysis, please complete the following steps") | Galerie |
| 6.1 Fehler mit nächstem Schritt | Message Strip mit Aktion, nie roher Fehlertext | `CcRunIndicator` Fehler | `alert(`… roher Text (siehe §2.6); `S/design:319` / `S/documentation:126,360` werfen Texte „AI model did not produce…" bis zur Oberfläche; `error.tsx` der Stufen eigene Gestaltung (`S/documentation/error.tsx`, `S/testing/error.tsx`: je 6 Hex) | — |
| 6.1 Beispiel-Hinweis | Strip „Example project — fictitious code" | nur Galerie (`design-system/page.tsx:321`) und Landing | **im Arbeitsraum eines Beispielprojekts fehlt er** (kein Treffer in `components/workspace`; nur `S/analyze:111,201` kennt `fromExample`) | — |
| 6.1 Erster Start, Import, About this view | Karte „Your turn", Import-Erklärung, „About this view" | `WorkspaceListReport`, `NewProject`, `TrustBeforeUpload`, `WorkspaceShell:457` | für Nutzer erst mit 3.0.1 sichtbar (Dashboard davor) | `workspace-list-report`, `trust-card-guard` |
| 6.1.2 Demo | Demo-Strip, Tour | `DemoWorkspaceShell` (neu) | alte Demo `components/demo/DemoWorkspace.tsx` (865 Zeilen, 198 Treffer, `text-[9px]`, `outline-none` Z. 770, 859) unter `/demo/[stage]` lebt parallel | `demo-*.spec` |
| 6.2 Ask this case = ein Assistent | ADR-043 | `AskThisCase.tsx` | zwei schwebende Einstiege (`GlossaryChatbot` + `GlossarySidebar`), Assistent heißt im Code/UI „Chatbot" (`settings` 12×, `layout.tsx:411`) | `assistant-label.spec` |

### §7 Agentenregeln, Druck und Export

| § | Regel | erfüllt | nicht erfüllt | Guard |
|---|---|---|---|---|
| 7 Kein neuer Stil ohne ADR | neue Farbe/Radius/Abstand/fünfter Button = ADR | — | faktisch 141 Button-Stile, 12-px-Stufe und halbe Abstände ohne ADR (E-1, E-2) | — |
| 7.1 Druck | kein Hintergrund, Ink auf Weiß, Karten mit Rahmen, keine Leisten, Chips mit Wort, Links mit Ziel, keine Umbrüche in Karte/Zeile | `@media print` für `.cc` (globals.css Z. 320–400), `SteeringOnePager`, `workspace-a11y` Druckprüfung | Druckregeln nur für `.cc`; Stufen drucken mit Verläufen/Schatten; `S/tco/page.tsx:140` `window.print()` ohne `.cc`-Kontext; `app/clean-core-explained-print/page.tsx` 86 Hex; **Word-/HTML-Export** `lib/audit-pack.ts:331–340`: Calibri statt Inter/System, Überschriften und Tabellenköpfe in Marken-Grün `#006b2c`/`#00873a` (Grün ≠ belegt), Fußzeile `#7F7F7F` 3,9:1 | `workspace-a11y` (Druck Arbeitsraum), `steering-one-pager` |

### §8 Wie es gehalten wird — Guard-Abdeckung

| Regel aus §8 | Guard heute | Umfang heute | Lücke |
|---|---|---|---|
| Landing- und Stufenköpfe aus einer Komponente | `landing-style-guard`, `workflow-style-guard` | Landing, sechs/sieben Stufentitel | Stufentitel selbst verletzt §1.2 (900, 30–36 px) — Guard misst Gleichheit, nicht Skala |
| Kontrast aller Token-Paare | `cc-token-guard` | Token-Paare + Galerie gerendert | gerenderte Textkontraste nur Galerie |
| Chips in drei Formen, forced-colors | `cc-provenance-guard` | Galerie/Arbeitsraum | — (ok) |
| Prozesskarte Tastatur | `process-map.spec`, `a11y-source-guard` | Karte | Zoom/F/M/P fehlen (Feature) |
| Überschriftenfolge je Sicht, Live-Regionen, Message Box modal | `workspace-a11y`, `cc-style-guard` | Arbeitsraum, Galerie | Stufen, Einstellungen, Admin, öffentliche Seiten |
| Feste Listen in ihrer Form | `cc-provenance-guard` | Galerie | 110 freie Badges außerhalb |
| **Tokens statt Hex, vier Buttons, ≥ 11 px, Abstände aus der Skala** | `cc-token-guard`, `cc-style-guard` | `components/cc` (+ Arbeitsraum, Prozesskarte für Farben) | **App-weit fehlt alles; Abstände nirgends** |
| Herkunft nur aus `lib/provenance.ts`; Grün nur `proven` | `cc-provenance-guard`, `workspace-shell-guard` | neuer Namensraum | App-weit |
| Keine Zustandsfarbe ohne Text; Fokusring überall | `cc-token-guard` gerendert | Galerie (+ Arbeitsraum a11y) | App-weit; Fokusring-CSS nur in `.cc` |
| Textschlüssel | `cc-style-guard` | `components/cc` | Arbeitsraum, Prozesskarte, Demo-Shell |
| Keine KI-Spuren | `model-text-guard` | Blockliste app-weit; Symbolik und gerendert nur cc/Galerie | Symbolik, Emojis, „Generative AI"-Etiketten app-weit |
| Druckbild | `workspace-a11y`, `steering-one-pager` | Arbeitsraum | Stufen, Exporte |
| Kein Dark Mode | `dark-mode-guard` | ganzes Produkt | — (ok) |

---

## 2. Die zehn größten Lücken

1. **Palette statt Tokens** — 7.450 Tailwind-Palettenklassen in 145 Dateien und 787 Hex-Literale in 46 Dateien;
   Stufen allein 3.048 bzw. 512. Der neue Namensraum hat je 0.
2. **Grün als Dekoration** — 1.608 green/emerald/lime-Klassen in 115 Dateien (Stufen 624), dazu die grüne Icon-Blase in
   `StageHeader` auf jeder Stufe; verletzt ADR-007 „Grün heißt belegt".
3. **Schrift unter 11 px** — 729× in 102 Dateien (10 px 523×, 9 px 174×, 8 px 31×, 7 px 1×); plus 161× 12 px im neuen
   Namensraum außerhalb der Skala (E-1).
4. **Gewicht 900** — 977× `font-black` in 112 Dateien, einschließlich `StageHeader` selbst.
5. **Buttons** — 334 rohe `<button>` in 85 Dateien, 192 mit eigener Fläche in 141 Stilkombinationen, gegen 74 Nutzungen
   der cc-Buttons in 22 Dateien.
6. **Dialoge** — 26 native `alert/confirm/prompt` in 8 Dateien (Einstellungen 13, drei `window.prompt`), 35
   selbstgebaute Overlays; `aria-modal` nur in 11 Dateien.
7. **Werkzeug-Form im Arbeitsraum-Bestand** — 647 Radien > 12 px, 222 schwere Schatten, 104 Verläufe/Mesh, 55
   `backdrop-blur`, 181 dunkle Flächen außerhalb von Code.
8. **KI-Spuren** — 41 KI-Icons in 20 Dateien, „AI Generated"-Badge, dreimal „powered by Generative AI", 132 Emojis in 23
   Dateien, `EvidenceSweep` mit 6 s Mindestdauer.
9. **Freie Status- und Herkunftsbadges** — 110 in 41 Dateien; retired Wordings „Passed", „No verdict", „AI Generated",
   „Estimated"; „No verdict" in Amber statt neutral; Schwere ohne feste Liste.
10. **Guards reichen nur in den neuen Namensraum** — 193 von 230 UI-Dateien ohne cc-Komponente, Stufen 0; Fokusring,
    forced-colors und Druck-CSS gelten nur in `.cc`; kein Abstands-Guard; gerenderte Prüfungen nur Galerie und
    Arbeitsraum.

Daneben: 27 gebietsabhängige Datums-/Zahlformate ohne zentrales `lib/format.ts`; ~42 Felder ohne Namen; 53 rohe
Tabellen; 298 freie Hinweisboxen statt Message Strip; kein globales `prefers-reduced-motion`; 14 eigene
`<header>`-Implementierungen auf öffentlichen Seiten (UX-082).

**Was schon hält:** alle 46 Icon-Buttons haben einen Namen; Dark Mode ist raus (app-weit geprüft); die Blockliste ist
app-weit sauber; der Arbeitsraum ist tastatur-, druck-, S- und forced-colors-geprüft; die Landing aus pp-306 nutzt die
Tokens (236 cc-Klassen, 0 × < 11 px, 0 × 900).

---

## 3. Entscheidungen, die vor oder mit D.1 fallen müssen (Sonny)

| Nr. | Frage | Vorschlag | warum jetzt |
|---|---|---|---|
| E-1 | 12 px steht 161× im neuen Namensraum (Chips, Meta, Hinweise), aber nicht in §1.2 | **ADR-047:** Rolle „Meta/Chip" 12 px / 600 in die Skala aufnehmen — Umbau auf 11 oder 13 px würde die abgenommenen Arbeitsraum-Screens ändern | D.1 muss wissen, ob 12 px eine Verletzung ist |
| E-2 | Halbe Rasterschritte (2 px, 6 px, 10 px) — auch cc 43×, Arbeitsraum 129× | **ADR-048:** 2 px (`*-0.5`) nur innerhalb von Chips/Kennungen und für Icon-Ausrichtung; 6/10/14 px nicht — Guard als Ratsche | sonst ist der Abstands-Guard entweder leer oder rot für cc |
| E-3 | `StageHeader`: bleibt er „Landing-/Stufenkopf" (heute 30–36 px/900) oder wird die Stufe als Werkzeug-Seite des Arbeitsraums gesetzt? | Stufentitel wie Projekttitel: 22 px / 800, `--cc-ink`, Icon neutral statt grüner Blase, plus „Back to workspace" (§2.3) | betrifft `workflow-style-guard` und jede Stufe |
| E-4 | Schwere von Befunden (critical/high/medium/low) hat keine feste Liste | **ADR-049:** `lib/severity.ts` als fünfte feste Liste, Form = Kennung wie Level (Rechteck, Radius 4 px), Farben nach §1.8 (Befunde je Schwere zählen Zustände) | 110 freie Badges brauchen ein Ziel |
| E-5 | Öffentliche Seiten: gilt „Tokens statt Palette" auch dort? | ja — ein Look (Tokens), zwei Räume (Radien/Mesh nur öffentlich); Mesh-Hex der Landing als Tokens | Umfang von D.24–D.27 |
| E-6 | Altes Dashboard und alte Demo `/demo/[stage]` | nicht umgestalten, sondern mit 3.0.1 bzw. 3.0.7 entfernen; was fehlt, zieht in List Report/Demo-Shell | spart die schwersten 1.000 Treffer |
| E-7 | `app/datenschutz/de` deutsch | ausdrücklich als Rechtstext-Ausnahme von §3 festhalten | Guard-Allowlist |

---

## 4. Abbauplan

### Grundsätze

- **Ein Schritt = ein Agent = S oder M**, unabhängig auslieferbar, ein Roadmap-Punkt je Release-Regel bleibt beim
  Menschen (Bündelung zu Releases ist Sonnys Entscheidung).
- **Guard zuerst (D.1), dann schrumpft die Ausnahmeliste Schritt für Schritt.** Die Ausnahmeliste ist eine
  **Ratsche**: je Datei und Regel die heutige Zahl als Obergrenze; mehr ist rot, weniger ist rot, **bis die Zahl in der
  Liste mitgesenkt ist** — so steht jeder Fortschritt im selben Commit fest. Neue Dateien haben keine Ausnahme.
- **Keine zwei parallelen Schritte berühren dieselbe Datei.** Deshalb ist die Ausnahmeliste **aufgeteilt**:
  `tests/design-baseline/<gruppe>.json`, eine Datei je Dateigruppe unten; ein Schritt ändert nur die Liste seiner
  Gruppe. `lib/cc-messages.ts`, `components/cc/**`, `app/globals.css` und die Galerie gehören nur Lane A.
- **Vor jedem Verschieben/Löschen:** `grep -rl <datei> tests/` (CLAUDE.md-Gotcha); Specs, die Dateipfade nennen, im
  selben Schritt anpassen.
- **Übersetzungstabelle** für alle Flächen-Schritte (damit 20 Agenten gleich übersetzen):

| alt | neu |
|---|---|
| `text-gray-900/950`, `text-slate-900`, `#0b1c30` | `text-cc-ink` |
| `text-gray-500/600/700`, `text-slate-500/600` | `text-cc-ink-muted` (auch für `gray-400`, das auf Weiß keine 4,5:1 hat) |
| `border-gray-100/200`, `border-slate-200` | `border-cc-line` (dekorativ) · Feldrahmen `border-cc-field-border` |
| `bg-gray-50`, `bg-slate-50` | `bg-cc-surface-muted` · Seite `bg-cc-page` · Karte `bg-cc-surface` |
| grüner Button (`bg-green-600`, Verlauf `#006b2c→#00873a`) | `CcButton variant="primary"` (öffentlich `publicButton('primary')`) |
| grüner/blauer/roter/gelber Status-Text oder -Badge | Herkunft → `CcProvenanceChip`; Stand → `CcObjectStatus`; Level/Evidenz → `CcCleanCoreLevel`/`CcEvidenceLevel`; Schwere → `CcSeverity` (D.5d); Eigenschaft → `CcTag` |
| `bg-{red,amber,blue,green}-50` + Rand als Hinweis | `CcMessageStrip state=…` |
| `alert/confirm/prompt`, `fixed inset-0`-Overlay | `CcMessageBox` (Bestätigung) · `CcDialog` (Formular/Info, D.5a) · Erfolg nach Nebenaktion `CcToast` |
| `text-[7–10px] font-black uppercase tracking-widest` | Mikro-Label: `cc-text-label` (11 px/600/0.08em, D.3) |
| `font-black` | 800 nur Titel, sonst 700/600 nach §1.2 (`cc-text-*`, D.3) |
| `rounded-2xl/3xl/[2rem]` im Arbeitsraum | `rounded-cc-card` (Karte), `rounded-cc-row` (Zeile/Feld) |
| `shadow-lg/xl/2xl` | `shadow-cc`; Dialog `shadow-cc-dialog` |
| dunkle Panels `bg-slate-900` | nur `CcCodeSurface` (Code) oder `--cc-overlay` (Toast/Coach) — sonst hell |
| rohe `<table>` | `CcTable` (mit `limit` aus D.5c) |
| Roh-`<input/select/textarea>` | `CcField` + Steuerelemente aus D.5b |
| `Loader2 animate-spin` am Knopf | `CcButton busy` (D.5c); Seitenladen `CcSkeleton` |
| `toLocaleString()` / `toLocaleDateString()` | `formatTextDate`, `formatIsoDate`, `formatNumber` aus `lib/format.ts` (D.3); ISO in `font-cc-mono` |
| `Sparkles/Cpu/Bot/Brain` für Modellarbeit, „AI Generated" | `CcProvenanceChip value="proposed"`; Icon `PenLine` nur im Chip |
| Emojis | lucide-Icon oder streichen |

### Lanes

- **Lane A — Bibliothek, Grundlagen, Guards:** besitzt `tests/design-*`, `tests/helpers/*` (neu), `components/cc/**`,
  `lib/cc-messages.ts`, `lib/format.ts`, `app/globals.css`, `app/(app)/admin/design-system/page.tsx`, `tests/cc-*`,
  `DESIGN.md`, `docs/design/decisions.md`.
- **Lane B — die sieben Werkzeuge (Stufen):** besitzt `S/*/page.tsx`, `S/*/error.tsx`, `components/analyze|design|tco|documentation/**`,
  `StageHeader`, `Stepper`, `VerificationRail`, Stufen-Hilfskomponenten.
- **Lane C — Rahmen, Konto, Öffentliches:** besitzt `app/(app)/layout.tsx`, Shell-/Glossar-/Onboarding-Komponenten,
  `settings`, `admin`, Wissens- und öffentliche Seiten, Landing-Nachläufer, Exporte.

Lane B und C starten, sobald D.1 und D.3 stehen; D.5a–c laufen in Lane A parallel zu den ersten B/C-Schritten, die
sie nicht brauchen.

### Schritte

Notation: **Dateien** = vollständige Schreibmenge (plus die eigene Ausnahmeliste `tests/design-baseline/<gruppe>.json`).
**Guard** = was der Schritt am Guard ändert. **Fertig, wenn** = Abnahme.

#### Lane A

**D.1 — App-weiter Quell-Guard mit schrumpfender Ausnahmeliste** · M · abhängig: E-1, E-2 (bis dahin laufen 12 px und
halbe Abstände als „nur berichten")
- Ziel: §8 „Tokens statt Hex, vier Buttons, ≥ 11 px, Abstände" und die Quellhälften von §1.6/§1.7/§2.6/§3.1 für
  **`app/**` und `components/**`** (ohne `app/api`) durchsetzen.
- Dateien: `tests/design-system-guard.spec.ts` (neu), `tests/design-baseline/*.json` (neu, eine je Gruppe:
  `library`, `shell`, `settings`, `admin`, `dashboard-legacy`, `demo-legacy`, `analyze-page`, `analyze-evidence`,
  `analyze-worklists`, `analyze-strategy`, `design`, `transformation`, `documentation`, `testing`, `tco`, `delivery`,
  `stage-frame`, `knowledge`, `public-header`, `catalog`, `public-content`, `legal`, `landing`, `glossary`,
  `onboarding`), `scripts/design/measure.mjs` (neu; übernimmt `design-audit/measure.mjs`, Ausgabe = Ausnahmeliste),
  `package.json` (Skript `design:baseline`).
- Regeln (je Datei gezählt): R1 Schrift < 11 px; R2 `font-black`/900; R3 Hex/`rgb()`; R4 Palettenklasse (Tailwind);
  R5 Grün-Palette; R6 `alert/confirm/prompt`; R7 `<button>`/`<a>`/`<Link>` mit eigener Fläche (`bg-*`) außerhalb
  `CC_BUTTON_*`/`publicButton`; R8 `outline-none` ohne `focus-visible`-Ersatz; R9 `onClick` auf `div/span/li/tr/td`
  ohne `role` + Tastenhandler (Backdrop mit `data-backdrop` ausgenommen); R10 `fixed inset-0` außerhalb
  `CcMessageBox`/`CcDialog`; R11 roher `<table>` außerhalb `CcTable` und `.doc-table`; R12 Radius > 12 px, Schatten
  lg+, Verlauf, `backdrop-blur` — **nur Arbeitsraum-Dateien**; R13 `animate-pulse|bounce|ping`, `animate-in` ohne
  `motion-safe:`; R14 Emoji; R15 KI-Icon (`Sparkles|Bot|Brain|Wand*|Cpu` als JSX); R16 `toLocale*String()` ohne `'en'`
  bzw. `'en-US'`; R17 freies Badge (klein+gerundet+farbig außerhalb cc); R18 (berichten, nach E-2 durchsetzen)
  halbe Abstände; R19 (nach E-1) arbiträre Größen außerhalb der Skala.
- Guard: Test 1 „keine Datei über ihrer Obergrenze"; Test 2 „keine Obergrenze über dem Ist" (Ratsche — Fortschritt muss
  eingetragen werden); Test 3 „Dateien ohne Eintrag haben 0"; Test 4 „jede Ausnahme nennt ihren Schritt D.x".
- Fertig, wenn: grün auf dem heutigen Stand; Negativprobe — `text-[10px]` in `components/workspace/NextStepCard.tsx`
  oder ein `alert(` in einer neuen Datei macht ihn rot; Laufzeit < 5 s; `design-audit`-Zahlen reproduziert (±5 %).

**D.2 — Gerenderter Rundgang mit Ausnahmeliste je Route** · M · abhängig: D.1 (Muster)
- Ziel: die gerenderten Prüfungen der Galerie (Schrift ≥ 11, Textkontrast, Fokusring per Tab, Überschriftenfolge,
  Gewicht ≤ 800, Zustandsfarbe ohne Text) auf **Routen** statt nur Galerie.
- Dateien: `tests/design-rendered-guard.spec.ts` (neu), `tests/design-rendered-baseline/*.json` (je Route),
  `tests/helpers/seed-project.ts` (neu; aus `workflow-style-guard` gelöst — dort nur Import umstellen:
  `tests/workflow-style-guard.spec.ts`).
- Routen: `/` · `/catalog` · `/catalog/[object]` (ein Objekt) · `/knowledge` · `/clean-core-explained` · `/trust` ·
  `/how-to` · `/settings` · `/admin/workspace` · `/dashboard` · `/project/[id]` (drei Sichten) · die sieben Stufen des
  Seed-Projekts · `/demo/workspace`.
- Fertig, wenn: je Route die heutigen Zahlen als Obergrenze eingetragen; Ratsche wie D.1; läuft im CI-Job `validate`
  (Emulator, Production-Build — CLAUDE.md-Gotcha zu Zeitfenstern beachten).

**D.3 — Grundlagen für alle: Fokus, Bewegung, Textrollen, Formate** · S · abhängig: E-1
- Dateien: `app/globals.css`, `lib/format.ts` (neu), `tests/format.spec.ts` (neu).
- Inhalt: Fokusring **global** (`:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible` = 2 px
  `--cc-focus`, 2 px Abstand) statt nur `.cc`; globales `@media (prefers-reduced-motion: reduce)` (Animationen und
  Übergänge aus); Druck-Grundregel §7.1 für `body` (nicht nur `.cc`); Textrollen als `@utility`: `cc-text-title`
  (22/800/-0.02em), `cc-text-h2` (15/700), `cc-text-h3` (14/700), `cc-text-body` (14/500/1.55), `cc-text-cell`
  (13/500), `cc-text-identifier` (13/600), `cc-text-label` (11/600/uppercase/0.08em) [+ `cc-text-meta` 12/600 nach
  E-1]; `.doc-table td::before` auf 11 px und `--cc-ink-muted` (Z. 517–521); `lib/format.ts`: `formatTextDate` („15
  Sep 2026"), `formatIsoDate`, `formatDateTime` (mit Zeitzone), `formatNumber` (`Intl.NumberFormat('en')`),
  `formatPercent` (ganzzahlig).
- Guard: `cc-token-guard` um „Fokusring auf einer Nicht-cc-Seite" (Tab auf `/settings`) erweitern — nur die Datei
  `tests/cc-token-guard.spec.ts`.
- Fertig, wenn: `workspace-a11y`, `cc-*` grün; Tab auf `/settings` zeigt den Ring; `format.spec` deckt Zeitzone und
  Tausendertrennung.

**D.4 — Entscheidungen E-1 … E-7 aufschreiben** · S · abhängig: Sonny
- Dateien: `DESIGN.md` (§1.2, §1.3, §4.1, §3, Änderungstabelle), `docs/design/decisions.md` (ADR-047 ff.).
- Fertig, wenn: jede Entscheidung mit Datum und Begründung steht; D.1 schaltet R18/R19 von „berichten" auf
  „durchsetzen".

**D.5a — `CcDialog` und `CcMessagePopover`** · M · abhängig: —
- Dateien: `components/cc/Dialog.tsx`, `components/cc/MessagePopover.tsx` (neu), gemeinsame Modal-Logik aus
  `components/cc/MessageBox.tsx` herausziehen (`components/cc/modal.ts`), `lib/cc-messages.ts`, Galerie,
  `tests/cc-style-guard.spec.ts` (Modal-Test auch für `CcDialog`).
- Fertig, wenn: `CcDialog` modal, `inert`, Fokusfalle, Escape, Fokus-Rückgabe (gleicher Test wie Message Box);
  Popover mit Sprung zum Element (§2.6); keine `className`-Öffnung.

**D.5b — Formular-Steuerelemente** · M · abhängig: —
- Dateien: `components/cc/Checkbox.tsx`, `RadioGroup.tsx`, `Select.tsx`, `Textarea.tsx`, `Switch.tsx` (neu, alle auf
  `CcField`), `lib/cc-messages.ts`, Galerie, `tests/cc-style-guard.spec.ts`.
- Fertig, wenn: Switch mit `role="switch"`/`aria-checked` (UX-065); Radio-Gruppe mit Legende; Value States mit Icon+Text;
  Rahmen `--cc-field-border`; 32/40 px.

**D.5c — Laden, Aufklappen, Reiter, Tabellenlimit** · M · abhängig: —
- Dateien: `components/cc/Skeleton.tsx` (neu, ersetzt später `components/Skeleton.tsx`), `components/cc/Button.tsx`
  (`busy`-Zustand, erst nach 400 ms sichtbar), `components/cc/Disclosure.tsx` („Business rules (7) · Show"),
  `components/cc/Tabs.tsx` (für „Source · Not determined · What it does" und Stufen-Reiter),
  `components/cc/Table.tsx` (`limit` + „Show all N"), `components/cc/DateText.tsx` (nutzt `lib/format.ts`),
  `lib/cc-messages.ts`, Galerie, `tests/cc-style-guard.spec.ts`.
- Fertig, wenn: Skeleton erst nach 300 ms; Busy nach 400 ms, Seite bedienbar; `ItAnswers`/`ManagementOverview` könnten
  `limit` nutzen (Umstellung dort in D.29).

**D.5d — Schwere als feste Liste, Diagrammfarben** · S · abhängig: E-4
- Dateien: `lib/severity.ts` (neu), `components/cc/Identifier.tsx` (`CcSeverity`), `lib/chart-colors.ts` (neu:
  Zustands- vs. kategoriale Palette als Token-Namen), Galerie, `tests/cc-provenance-guard.spec.ts` (fünfte Liste in
  „vocabularies do not look like one another").
- Fertig, wenn: Schwere hat Wort+Kennung, nie Chip-Form; Guard erkennt freie Schwere-Badges im neuen Namensraum.

**D.29 — Textschlüssel für die neuen Flächen** · M · abhängig: D.5a–c (gleiche Datei `lib/cc-messages.ts`)
- Dateien: `lib/cc-messages.ts` (oder neu `lib/workspace-messages.ts`, wenn der Katalog zu groß wird),
  `components/workspace/*.tsx`, `components/process-map/*.tsx`, `components/demo/DemoWorkspaceShell.tsx`,
  `components/demo/DemoTourStop.tsx`, `tests/cc-style-guard.spec.ts` (Textschlüssel-Test auf diese Ordner
  ausdehnen); dazu `ItAnswers`/`ManagementOverview` auf `CcTable limit`; `ProcessMiniMap.tsx:59` und
  `GlossaryText.tsx:40` auf ≥ 11 px.
- Fertig, wenn: 0 harte JSX-Texte in den drei Ordnern; Katalogtest grün; `workspace-*`-Specs grün.

**D.30 — Ausnahmelisten auf null, Guards scharf** · S · abhängig: alle Flächen-Schritte
- Dateien: `tests/design-baseline/` (löschen), `tests/design-rendered-baseline/` (löschen),
  `tests/design-system-guard.spec.ts`, `tests/design-rendered-guard.spec.ts`, `tests/cc-token-guard.spec.ts`
  (`CC_DIRS` → ganze App), `tests/cc-provenance-guard.spec.ts` (`CC_SOURCE_DIRS` → ganze App),
  `tests/model-text-guard.spec.ts` (Symbolik und gerenderter Scan app-weit + Emojis), `tests/workflow-style-guard.spec.ts`
  (Skala statt nur Gleichheit), `DESIGN.md` §8 (Guard-Spalte aktualisieren).
- Fertig, wenn: keine Ausnahme mehr, alle Guards gelten für `app/**` und `components/**` (Ausnahmen nur benannt:
  `.md`-Export, `app/datenschutz/de`, Code-Fläche, Landing-Mesh).

#### Lane B — die sieben Werkzeuge

**D.9 — Stufenrahmen** · M · abhängig: D.3, E-3
- Dateien: `components/StageHeader.tsx`, `components/Stepper.tsx`, `components/VerificationRail.tsx`,
  `components/NavigationButtons.tsx`, `components/BackLink.tsx`, `components/StaleNotice.tsx`,
  `components/LegacyRunBanner.tsx`, `components/NotGenerated.tsx`, `components/SectionBoundary.tsx`,
  `components/ErrorBoundary.tsx`, `S/documentation/error.tsx`, `S/testing/error.tsx`,
  `tests/workflow-style-guard.spec.ts` (Erwartung nach E-3).
- cc: `cc-text-title`, `CcLinkButton` („Back to workspace" mit `?view=` und `#ebene` zurück), `CcMessageStrip`
  (Stale/Legacy), `CcEmptyState` (NotGenerated), `CcObjectStatus` im Stepper (ADR-005: „done" gleich kodiert, kein
  Grün außer belegt).
- Fertig, wenn: Gruppe `stage-frame` bei 0; alle sieben Stufentitel gleich **und** nach E-3; `workflow-style-guard`
  grün.

**D.10a — Analyse-Seite: Farben, Schrift, Buttons** · M · abhängig: D.1, D.3
- Dateien: `S/analyze/page.tsx`.
- Inhalt: Atlassian-Palette (Z. 620 ff., 229 Hex) → Tokens bzw. `CcCodeSurface`; 459 Palette, 58 × < 11 px, 28 × 900,
  15 Buttons → cc; Emojis (23), `Sparkles`/`Cpu` (Z. 16, 1839); Texte Z. 1500, 2098, 2363, 2637 ohne „AI"-Etikett;
  `toLocale*` Z. 729, 1046 → `lib/format.ts`.
- Fertig, wenn: R1–R5, R7, R14–R16 der Gruppe `analyze-page` bei 0.

**D.10b — Analyse-Seite: Dialoge, Tabellen, Felder, Bewegung** · M · abhängig: D.10a, D.5a–c
- Dateien: `S/analyze/page.tsx`.
- Inhalt: Overlays Z. 2507, 2565 → `CcDialog`; 8 Tabellen → `CcTable`; `textarea` Z. 2329, `input` Z. 2121 → `CcField`;
  `onClick`-Divs Z. 2166, 2185, 2584, 2603 → Button/`CcDisclosure`; `focus:outline-none` Z. 2330, 2717; 8 ×
  `animate-pulse`; Überschriftenfolge (h1→h3, h3→h5).
- Fertig, wenn: Gruppe `analyze-page` bei 0; D.2-Route `analyze` ohne Skip, ohne < 11 px.

**D.11 — Analyse: Evidenz-Komponenten** · M · abhängig: D.3, D.5c
- Dateien: `components/analyze/EvidenceSweep.tsx`, `SweepVerdictBar.tsx`, `SweepCodeViewer.tsx`,
  `ConstructFindings.tsx`, `UnassessedConstructs.tsx`, `CodeInventoryTable.tsx`, `DataCouplingTable.tsx`,
  `AbcdClassificationPanel.tsx`, `CoverageVerdict.tsx`, `AnchoredNarrative.tsx`, `PreAnalysisPreview.tsx`,
  `MissingDependencyPrompt.tsx`, `WhyScorePanel.tsx`.
- Inhalt: **`minDuration = 6000` entfernen** (§5.4; Etappen nach echten Ereignissen); `SweepCodeViewer` →
  `CcCodeSurface`; Level → `CcCleanCoreLevel` (A blau, nie grün); „Estimated from…" → `CcProvenanceChip` bzw. Satz;
  Tabellen → `CcTable`; `CoverageVerdict` Overlay → `CcDialog`; Zahlen mit `CcWhyPopover` (§6.1).
- Fertig, wenn: Gruppe `analyze-evidence` bei 0; `coverage-*`, `abcd-classification`, `engine-honesty-guard` grün.

**D.12 — Analyse: Arbeitslisten und Importe** · M · abhängig: D.5b, D.5d
- Dateien: `components/analyze/GapsWorklist.tsx`, `GapsPrioritization.tsx`, `AtcFindingsPanel.tsx`, `AtcUpload.tsx`,
  `UsageUpload.tsx`, `UsageRiskMatrix.tsx`, `ModuleHeatmap.tsx`; `GapAccordionCard.tsx` löschen (verwaist — prüfen).
- Inhalt: Filter → `CcFilterBar` (Live, Zähler); Selects ohne Label → `CcSelect`; Schwere → `CcSeverity`; `Brain`-Icon
  (`GapsWorklist:414`) raus; Heatmap nach §1.8 mit Text je Zahl; `toLocale*` (UsageRiskMatrix 3×, Atc 2×).
- Fertig, wenn: Gruppe `analyze-worklists` bei 0; `atc-*`, `usage-*`-Specs grün.

**D.13 — Analyse: Strategie-Komponenten** · S · abhängig: D.3
- Dateien: `components/analyze/ExtensibilityDecisionMatrix.tsx`, `BusinessValueAudit.tsx`, `TargetScopeMapping.tsx`,
  `ModernizationStrategy.tsx`, `ArchitecturalNextSteps.tsx`, `PlainEnglishGuide.tsx`.
- Inhalt: `Sparkles` (4 Dateien) → `CcProvenanceChip proposed`; 18 × < 11 px, 13 × 900 in der Matrix; Emojis (6).
- Fertig, wenn: Gruppe `analyze-strategy` bei 0; `extensibility-route-guard` grün.

**D.14a — Design-Stufe: Seite und Architekten-Freigabe** · M · abhängig: D.5a, D.5b
- Dateien: `S/design/page.tsx`, `components/ArchitectSignOff.tsx`.
- Inhalt: 75 Hex, `toLocale*` Z. 544, 644, 200; Freigabe-Overlay (`ArchitectSignOff:246`) → `CcMessageBox` (bindende
  Bestätigung = `dark`-Button, §1.5); Selects/Textarea Z. 377, 425 → cc; „Unlock & Change" (Z. 269) sachlich;
  Fehlertext Z. 319 nicht bis zur Oberfläche.
- Fertig, wenn: Gruppe `design` (Anteil Seite) bei 0; `decision-card`, `counter-check-guard` grün.

**D.14b — Design-Stufe: Komponenten** · M · abhängig: D.5a
- Dateien: `components/design/*.tsx` (12 Dateien).
- Inhalt: `TargetArchitectureDiagram` 20 Emojis + 10 Hex; `CloudServiceIntegrations`/`SecurityHardeningChecklist`
  `onClick`-Divs + Overlays → `CcDisclosure`/`CcDialog`; 53 × < 11 px.
- Fertig, wenn: Gruppe `design` bei 0.

**D.15 — Transformation** · M · abhängig: D.5a
- Dateien: `S/transformation/page.tsx`, `components/CodeHighlighter.tsx`.
- Inhalt: **„AI Generated" + Sparkles (Z. 1100–1101) → `CcProvenanceChip value="proposed"`**; Drawer `bg-slate-900`
  (Z. 1211–1226) → `CcDialog` hell; Toast-Ersatz Z. 1029 → `CcToast`; `Cpu` Z. 872; Code-Anzeige → `CcCodeSurface`.
- Fertig, wenn: Gruppe `transformation` bei 0; `generated-package-repair`, `repair-draft*` grün.

**D.16a — Dokumentation: Seite** · M · abhängig: D.5a, D.5c, D.9
- Dateien: `S/documentation/page.tsx`.
- Inhalt: 76 × < 11 px, 69 × 900, 79 Hex, 10 Tabellen, 14 freie Badges, 9 Farbpunkte ohne Text, Drawer Z. 1750/1764 →
  `CcDialog`, „Generate Business Layer (AI)" (Z. 1686) → Beschriftung ohne Etikett + Kosten-/Modellangabe (§2.8),
  `Cpu` Z. 1460/1637, Stilliste Z. 1641.
- Fertig, wenn: Gruppe `documentation` (Anteil Seite) bei 0; `documentation-blueprint-shape` grün. Achtung 3.0.5
  (Weg C) baut dieselbe Seite um — **D.16a nach 3.0.5** oder im selben Zug.

**D.16b — Dokumentation: Komponenten** · S · abhängig: D.3
- Dateien: `components/documentation/ProcessDocumentationView.tsx`, `components/PresentationViewer.tsx`,
  `components/DocumentSection.tsx`, `components/MermaidDiagram.tsx`, `components/ProcessFlow.tsx`.
- Inhalt: Folienschalter mit Namen und Fokus (UX-033/068), `Cpu` in `ProcessFlow`, `toLocale*` `PresentationViewer:97`.
- Fertig, wenn: Gruppe `documentation` bei 0.

**D.17a — Tests: Seite, Teil Darstellung** · M · abhängig: D.3, D.5d
- Dateien: `S/testing/page.tsx`, `components/TestingCharts.tsx`.
- Inhalt: „Passed"/„No verdict" → `proven`/`not-determined` (neutral, nicht Amber); Diagramm nach §1.8 mit
  `lib/chart-colors.ts`; 78 × < 11 px, 75 × 900, 65 Hex, 10 Verläufe, `Sparkles` Z. 937.
- Fertig, wenn: R1–R5, R12–R15 der Gruppe `testing` bei 0; `test-verdicts-guard`, `verdict-honesty-guard` grün.

**D.17b — Tests: Seite, Teil Formulare und Dialoge** · M · abhängig: D.17a, D.5a, D.5b
- Dateien: `S/testing/page.tsx`.
- Inhalt: 9 Felder ohne Namen (Z. 1130–1782) → `CcField`; Overlay Z. 2042 → `CcDialog`; `onClick`-Divs Z. 1774, 2042;
  22 rohe Buttons; Überschriften.
- Fertig, wenn: Gruppe `testing` bei 0; D.2-Route `testing` sauber.

**D.18 — Economics** · M · abhängig: D.5b
- Dateien: `S/tco/page.tsx`, `components/tco/OptionComparison.tsx`.
- Inhalt: Felder Z. 247, 287, 304 und `OptionComparison` Z. 139, 239, 242 → `CcField` (Pflichtfelder ADR-035 mit `*`
  und `aria-required`, Value States); `focus:ring` → Ring aus D.3; Druck (`window.print` Z. 140) im `.cc`-Kontext.
- Fertig, wenn: Gruppe `tco` bei 0; `tco-cost-inputs-guard`, `money-honesty-guard`, `cost-assumptions` grün.

**D.19 — Übergabe** · S · abhängig: D.5a
- Dateien: `S/delivery/page.tsx`, `components/ComplianceReviewHints.tsx`, `components/PersonalDataHints.tsx`,
  `components/ReviewTasks.tsx`, `components/ModelStagesCard.tsx`.
- Inhalt: `alert` Z. 471, 909 → `CcMessageStrip`/`CcToast`; „Estimated by the test generator" (Z. 770) → Chip; `Cpu`
  in `ModelStagesCard`.
- Fertig, wenn: Gruppe `delivery` bei 0; `delivery-*`, `compliance-review-hints-guard`, `review-tasks-guard` grün.

#### Lane C — Rahmen, Konto, Öffentliches

**D.6 — Shell Bar nach §2.1** · M · abhängig: D.3, D.5a
- Dateien: `app/(app)/layout.tsx`, `components/ShellHelpMenu.tsx`, `components/HeaderAuthButton.tsx`,
  `components/MaintenanceNotice.tsx` (`SiteFooter` gehört D.24).
- Inhalt: Pfad „My workspace › Projekt", Such-Einstieg ⌘K (öffnet `CommandSearch` im Projekt), Dichte-Umschalter im
  Kontomenü (Browser-Speicher, try/catch); Plan-Abzeichen (Z. 131–138) → `CcTag` oder weg; 9/10-px-Texte; Abmelden →
  `CcMessageBox`; `main` mit sichtbarem Fokus (Z. 372); keine grünen Hover.
- Guard: `a11y-source-guard` (Shell-Tests anpassen).
- Fertig, wenn: Gruppe `shell` bei 0; `workspace-a11y`, `a11y-source-guard`, `profile-session-guard` grün.

**D.7 — Onboarding, Terms-Gate, Rechts-Overlay** · M · abhängig: D.5a
- Dateien: `components/UserOnboarding.tsx`, `components/TermsReacceptGate.tsx`, `app/components/LegalOverlay.tsx`.
- Inhalt: drei Overlays → `CcDialog` (QA b0b3150a1974, 58dc160fd6c3); „powered by Generative AI" (`UserOnboarding:333`)
  sachlich; `rounded-[2rem]`; Emojis.
- Fertig, wenn: Gruppe `onboarding` bei 0; `terms-*`, `registration-flow-guard`, `credential-and-consent-guard` grün.

**D.8 — Ein Assistent, ein Glossar** · M · abhängig: D.5a, ADR-043
- Dateien: `components/GlossaryChatbot.tsx`, `components/GlossarySidebar.tsx`, `components/GlossaryTerm.tsx`,
  `components/QuickAnswer.tsx`.
- Inhalt: ein Einstieg statt zwei FABs; kein Emerald; `GlossaryTerm` auf das Popover-Muster von `GlossaryText`
  (Tastatur, UX-045); Fehlertext Z. 430 ohne „AI modernization engine"; UI-Name „Chatbot" → Assistent-Label aus
  `assistant-label`; `QuickAnswer` zugeklappt-Zustand (UX-058).
- Fertig, wenn: Gruppe `glossary` bei 0; `assistant-label`, `ask-this-case` grün.

**D.20a — Einstellungen: Dialoge und Formulare** · M · abhängig: D.5a, D.5b
- Dateien: `app/(app)/settings/page.tsx`.
- Inhalt: 13 native Dialoge (u. a. `window.confirm` Z. 597, `window.prompt` Z. 788/807/813) → `CcMessageBox`/`CcDialog`
  mit Feld; 17 Felder → `CcField`, Toggles → `CcSwitch` (QA c2923dfd70ab); „Preferences Saved!" → `CcToast`; Overlays
  Z. 1995, 2205.
- Fertig, wenn: R6, R9, R10 der Gruppe `settings` bei 0; `mfa-*`, `s4-mfa-enrolment-guard`, `account-erasure`,
  `dark-mode-guard` („System Preferences" bleibt) grün.

**D.20b — Einstellungen: Darstellung** · M · abhängig: D.20a
- Dateien: `app/(app)/settings/page.tsx`.
- Inhalt: 462 Palette, 70 × 900, 42 × < 11 px, 60 Radien, 16 Schatten, 12 Animationen, 7 Emojis, `toLocale*` Z. 1929.
- Fertig, wenn: Gruppe `settings` bei 0.

**D.21 — Admin** · M · abhängig: D.5a, D.5d
- Dateien: `app/(app)/admin/page.tsx`, `app/(app)/admin/approve-tenant/page.tsx`, `components/admin/UsageQuotaPanel.tsx`.
- Inhalt: 5 native Dialoge (`confirm` Z. 188) → `CcMessageBox`; farbige Pillen (8 in `admin/page.tsx`) →
  `CcObjectStatus`/`CcTag`; dunkles Theme in `approve-tenant` (`bg-slate-800`, `bg-green-950/60`) → hell; „Unlocked"
  (Z. 473) sachlich; Admin-Zeilen mit erweitertem Zustand (UX-078).
- Fertig, wenn: Gruppe `admin` bei 0; `admin-*`, `tenant-*`-Specs grün.

**D.22a — Dashboard neu nach DESIGN.md** · M · abhängig: D.3, D.5a–d (E-6 geändert: umbauen, nicht entfernen — Sonny 24.09.2026, ADR-052)
- Dateien: `app/(app)/dashboard/page.tsx` und nur von ihm genutzte Komponenten (`components/StarterExamples.tsx` UX-063, Projektzeile, Beispielgalerie).
- Ziel: Das Dashboard ist die „Mein Arbeitsbereich"-Seite nach Mockup 2.8 s7 und §2.2 (List Report): `CcTable`/`CcFilterBar`, Projektzeile als Button/Link mit Tastatur, Aktionen als `CcButton`/Icon-Buttons mit Namen, `CcObjectStatus`, `CcMessageStrip`, `CcDialog` für Löschen; keine Palette, keine < 11 px, kein `font-black`, keine Emojis/KI-Symbolik; eine Beispielgalerie statt zwei (UX 2cf6bb463ace). Nichts, was das Dashboard heute kann, geht verloren (Liste, Fortsetzen, Duplizieren, Export, Löschen, Einladen, Kontingent, Beispiele, Karte „Your turn").
- Fertig, wenn: Gruppe `dashboard-legacy` im Design-Guard auf 0; Dashboard-Specs grün; Screenshot vorher/nachher.

**D.22b — Stufen-Demo neu nach DESIGN.md** · M · abhängig: D.3, D.5a–d, D.9 (E-6, ADR-052)
- Dateien: `app/(app)/demo/[stage]/page.tsx`, `components/demo/DemoWorkspace.tsx`, `components/demo/DemoEntryCard.tsx` und nur von ihnen genutzte Komponenten.
- Ziel: Die Stufen der Demo tragen dieselben Köpfe (D.9, 22/800), Tokens, Chips und Bausteine wie ein echtes Projekt; Demo-Hinweis als `CcMessageStrip` („Demo project — fictitious code"); kein Pfad zu Signatur, Kontingent oder Export (§6.1.2). Alle Stationen der Tour und `tests/demo-*.spec.ts` bleiben gültig; `lib/demo-release.json` nur neu erzeugen, wenn sich die Engine-Ausgabe ändert.
- Fertig, wenn: Gruppe `demo-legacy` auf 0; Demo-Specs grün; Screenshots jeder Stufe vorher/nachher.

**D.22c — Verwaiste Komponenten entfernen** · S · abhängig: D.22a/b
- Nur wirklich ungenutzte Dateien (vor dem Löschen je `grep -rl` in `app/`, `components/`, `tests/`): `components/FileList.tsx`, `FileUpload.tsx`, `JiraIntegrationModal.tsx`, `UpgradeToEnterpriseModal.tsx`, `components/process-target/IstSollComparison.tsx`, `TargetModelView.tsx`, `components/process-states/ProcessStatesPanel.tsx`, `components/Skeleton.tsx` (nach D.5c). Was doch genutzt wird, bleibt und wird im zuständigen Schritt umgebaut.

**D.23a — Wissensseiten im App-Rahmen, Teil 1** · M · abhängig: D.24 (Kopf), E-5
- Dateien: `app/(app)/clean-core-explained/page.tsx`, `clean-core-score/page.tsx`, `how-it-works/page.tsx`,
  `sap-cloudification/page.tsx`, `abap-custom-code-analysis/page.tsx`, `sap-clean-core-object-classification/page.tsx`.
- cc: `SectionHeader`, `publicButton`, Tokens, öffentliche Radien erlaubt.
- Inhalt: 900 (163 im Bereich), `Sparkles` (`clean-core-score:349`, `clean-core-explained:395`), `Bot`
  (`how-it-works:217,224`), `Cpu`; SEO unverändert (URL, Canonical, Inhalt — Roadmap 3.0.6).
- Fertig, wenn: Gruppe `knowledge` (Anteil) bei 0; `seo-surface-guard`, `copy-ci-guard`, `level-rule-page-guard` grün.

**D.23b — Wissensseiten im App-Rahmen, Teil 2** · M · abhängig: D.24
- Dateien: `app/(app)/knowledge/page.tsx`, `how-to/page.tsx`, `about/page.tsx`, `trust/page.tsx`,
  `tenant-security/page.tsx`, `first-run/page.tsx`, `verify-pack/page.tsx`, `invitation/[projectId]/[invitationId]/page.tsx`,
  `components/KnowledgeClient.tsx`, `components/HowToClient.tsx`, `components/GuideShareBar.tsx`,
  `components/TrustBeforeUpload.tsx`, `components/InviteReaderDialog.tsx`.
- Inhalt: `tenant-security` 6 Emojis + h2→h4-Sprünge; `InviteReaderDialog` → `CcDialog`; `verify-pack` 69 Palette.
- Fertig, wenn: Gruppe `knowledge` bei 0; `trust-card-guard`, `how-to-phases-guard`, `verify-export-verdict-guard` grün.

**D.24 — Ein öffentlicher Kopf und Fuß** · M · abhängig: pp-306 in `integrate/next-3.0` gemergt
- Dateien: `components/PublicHeader.tsx` (neu, aus dem Kopf von `app/page.tsx` pp-306 gelöst), `app/page.tsx` (nur
  Kopf ersetzen), `app/catalog/layout.tsx`, `app/features/layout.tsx`, `components/SiteFooter.tsx` (falls nicht D.6 —
  Zuordnung: **hier**, D.6 lässt ihn aus).
- Inhalt: UX-082 „zwei Header-Muster"; Anmeldebutton an gleicher Stelle (`?auth=signin`).
- Fertig, wenn: `landing-*`-, `public-back-navigation-guard`, `seo-surface-guard` grün; ein Kopf auf allen öffentlichen
  Seiten (die übrigen Seiten stellen in D.25/D.26 um).

**D.25a — Katalog und Level-Methode** · M · abhängig: D.24
- Dateien: `app/catalog/page.tsx`, `app/catalog/[object]/page.tsx`, `[object]/not-found.tsx`,
  `app/catalog/browse/[letter]/page.tsx`, `app/catalog/module/[area]/page.tsx`, `components/catalog/*`,
  `app/method/levels/page.tsx`.
- Inhalt: Level-Farben nach §1.8 (A `information`, nie grün) mit `CcCleanCoreLevel`; 25 × 900 in `method/levels`.
- Fertig, wenn: Gruppe `catalog` bei 0; `catalog-*`, `sitemap-guard`, `seo-surface-guard` grün.

**D.25b — Whitepaper, Fakten, Referenzanalyse, Lizenzen** · M · abhängig: D.24
- Dateien: `app/whitepaper/page.tsx`, `app/facts/page.tsx`, `app/reference-analysis/page.tsx`, `app/licenses/page.tsx`,
  `app/clean-core-explained-print/page.tsx`.
- Inhalt: Whitepaper 136 Palette/31 × 900; Druckseite 86 Hex → Tokens + §7.1.
- Fertig, wenn: Gruppe `public-content` bei 0; `claims-honesty-guard`, `content-dates-guard` grün.

**D.26 — Recht und Hilfsseiten** · S · abhängig: D.24
- Dateien: `app/terms/page.tsx`, `app/terms/versions/[version]/page.tsx`, `app/datenschutz/page.tsx`,
  `app/datenschutz/de/page.tsx`, `app/impressum/page.tsx`, `app/auth/action/*`, `app/survey/[token]/*`,
  `app/unsubscribe/*`, `app/error.tsx`, `app/not-found.tsx`.
- Inhalt: Tokens, Gewichte; `SurveyClient:377` Fokus; Texte **unverändert** (Rechtstexte).
- Fertig, wenn: Gruppe `legal` bei 0; `terms-*`, `survey-guard`, `auth-action-link` grün.

**D.27 — Landing-Nachlauf und Anmelde-Dialoge** · M · abhängig: pp-306 gemergt, D.5a, D.5b
- Dateien: `components/LandingModals.tsx`, `components/landing/public-button.ts`, `app/page.tsx` (nur Z. 509–516
  Mesh-Hex → Tokens, eigene Zeilen; nicht parallel zu D.24).
- Inhalt: Anmelde-/Registrier-/Rechts-Overlays → `CcDialog`, **Felder und Ablauf unverändert** (Konto-Regel);
  „⚡ Disclaimer … powered by Generative AI" (Z. 836) sachlich; 23 × < 11 px, 16 Buttons, 9 Felder ohne Namen;
  `public-button` secondary-Hover als Token.
- Fertig, wenn: Gruppen `landing` bei 0; `registration-*`, `handle-claim-guard`, `landing-*` grün.

**D.28 — Exporte und Druck** · S · abhängig: D.3
- Dateien: `lib/audit-pack.ts` (nur Stilblock Z. 331–340), `lib/board-deck.ts` (Farben prüfen), `S/tco/page.tsx`
  **nicht** (gehört D.18).
- Inhalt: Schrift System/Inter statt Calibri, Überschriften/Tabellenköpfe in Ink statt Marken-Grün, Fußzeile ≥ 4,5:1;
  kein Einfluss auf signierte Inhalte (Stil liegt außerhalb der kanonischen Daten — mit `audit-pack-canonicalisation`
  prüfen).
- Fertig, wenn: `audit-pack-*`, `export-escaping-guard`, `export-inertness-guard`, `board-deck.integrity` grün.

### Reihenfolge und Parallelität

| Welle | Lane A | Lane B | Lane C |
|---|---|---|---|
| 0 | D.4 (Entscheidungen, Sonny) | — | — |
| 1 | D.1 | — | — |
| 2 | D.3 | D.9 | D.6 |
| 3 | D.5a | D.10a | D.8 |
| 4 | D.5b | D.13 | D.7 |
| 5 | D.5c | D.11 | D.20a |
| 6 | D.5d | D.10b | D.20b |
| 7 | D.2 | D.12 | D.21 |
| 8 | D.29 | D.14a | D.22 (mit 3.0.1) |
| 9 | — | D.14b | D.24 (nach pp-306-Merge) |
| 10 | — | D.15 | D.23a |
| 11 | — | D.16b | D.23b |
| 12 | — | D.16a (nach 3.0.5) | D.25a |
| 13 | — | D.17a | D.25b |
| 14 | — | D.17b | D.26 |
| 15 | — | D.18 | D.27 |
| 16 | — | D.19 | D.28 |
| 17 | D.30 | — | — |

**Zählung:** 40 Schritte (D.1–D.4, D.5a–d, D.6–D.9, D.10a/b, D.11–D.13, D.14a/b, D.15, D.16a/b, D.17a/b, D.18, D.19,
D.20a/b, D.21, D.22, D.23a/b, D.24, D.25a/b, D.26–D.29, D.30); Bewegung (§1.7/§5.4) hat keinen eigenen Schritt — sie steckt in D.3
(global) und in den Flächen-Schritten. Drei Lanes, höchstens drei Agenten gleichzeitig; Dateimengen sind disjunkt, jede Lane hat ihre
eigenen Ausnahmelisten-Dateien.

**Pro Schritt gilt zusätzlich:** Screenshots über `tests/capture-screens.spec.ts` vorher/nachher; `npm run build`
fehlerfrei; die in „Fertig, wenn" genannten Specs plus `design-system-guard` und (ab D.2) `design-rendered-guard` grün;
ein Push nach `dev` und die QA-Schleife (`qa-review-loop`).

### Nachträge des Koordinators (24.09.2026, aus D.3)
- **D.6:** `<MotionConfig reducedMotion="user">` in `app/(app)/layout.tsx` und im öffentlichen Layout — die JS-Animationen der motion-Bibliothek ignorieren sonst `prefers-reduced-motion`.
- **D.20a:** die zwei Schalter auf `/settings` ohne sichtbaren Fokus (`outline-none` + `focus-visible:outline-2` ohne Stil); `KNOWN_BARE_SWITCHES = 2` in `tests/cc-token-guard.spec.ts` muss dabei auf 0.
- **D.30 / Lane A:** R8 soll auch das Muster `outline-none` + `focus-visible:outline-<n>` ohne `outline-solid`/Ring zählen (Tailwind v4 zeichnet dann nichts).
- **Wer `lib/workspace-rows.ts` anfasst (D.29):** `isoDate` an `formatIsoDate` aus `lib/format.ts` delegieren.

### Nachträge des Koordinators (aus D.9)
- **Alle Stufen D.10–D.19:** Titel per `<StageHeader stage="…">` aus `PHASES` (lib/workflow-steps.ts), nicht mehr eigene Titel ("Code Analysis", "Project Handover" …); `align="center"` entfällt (Mockup linksbündig) — D.10a, D.19.
- **D.29 / Lane A:** `PHASE_TONE_CLASS` in `lib/workflow-steps.ts` auf Tokens; „stale" ist `warning` (§1.1), nicht rose; `tests/phase-honesty-guard.spec.ts` prüft das Literal `'green'` — mitziehen. Workspace-Links (`ToolBar`, `StatusLine`, `NextStepCard`) hängen `?view=…&from=…` an, damit „Back to workspace" in die richtige Sicht führt.
- **D.22a:** Dashboard `page.tsx:1882` „7. Process Documentation" → Name aus `PHASES` (UX-169).
- **D.28 / D.19:** `lib/markdownFormatter.ts:201` „# 📋 Process Blueprint Documentation" (Emoji, alter Name) und `delivery/page.tsx:415` Dateiname `process-blueprint.md` (UX-169).
- **D.16a:** Export-Fallback `'Process Blueprint'` in `documentation/page.tsx:795` (UX-169).
- **D.18 / D.22b:** TCO- und Demo-Eyebrows als eigene Badges.
- **D.9-Rest (Lane B):** Info-Tooltip in `CollapsibleAccordion` nur per Hover — per Tastatur erreichbar machen (WhyPopover-Muster), sobald ein Stufenschritt die Datei berührt.
- **D.6:** Shell „Back to My Workspace" und der neue Stufen-Link liegen dicht beieinander — Shell-Variante prüfen.

### Nachträge des Koordinators (aus D.5d)
- **D.30 / Token-Review:** `--cc-warning` (#92400e) ist in Balken schwer von Fehler-Rot zu unterscheiden — Token prüfen.
- **D.17a (oder wer Recharts baut):** unter forced-colors behalten SVG-`fill` ihre Farbe; Regel für SVG-Formen in `globals.css` ergänzen (Lane A) — melden, nicht selbst ändern.
- **D.29:** `ItAnswers.tsx` zeigt die Schwere als Text („CC-017 · High") → `CcSeverity`.
- **Alle Flächen-Schritte:** Schwere nur über `CcSeverity` / `normaliseSeverity()` aus `lib/severity.ts`; Diagrammfarben nur aus `lib/chart-colors.ts`.


### Nachträge des Koordinators (Tagesende 24.09.2026)
- **D.10a fertig** (Analyse-Seite: R1, R2, R4, R5, R7, R8, R12–R18 auf 0). Für **D.10b** bleiben: R9 (Dropzone, vier Deployment-Karten), R10 (zwei Overlays → CcDialog), R11 (eine Tabelle → CcTable), echte ARIA-Tabs statt aria-pressed, `EvidenceSweep minDuration={6000}` und das ScannerConsole-Theater (§5.4), das editierbare Feld mit der Beschriftung „Read-Only Preview". Lokales `SeverityWord` → `CcSeverity`. R3 (223 Hex) gehört zum Confluence-Export → **D.28**.
- **D.6 angefangen** (`useShellMenu`, gemeinsame Menü-Tastatur; Panel-/Item-Klassen). Offen: beide Menüs auf den Hook (`role=menu`/`menuitem`, Guard in a11y-source-guard verschärfen), Shell Bar nach Mockup (56 px, Pfad statt „Back to My Workspace", Ctrl K, Kontingent 12/600), Plan-Badge → CcTag, Abmelden → CcMessageBox („Sign out now" bleibt), sichtbarer Fokus auf `main`, `<MotionConfig reducedMotion="user">` in `app/layout.tsx`, HeaderAuthButton busy, MaintenanceNotice → CcMessageStrip + formatDateTime, Banner nur Tokens + ⚡ raus, Obergrenzen senken.
- **Entscheidungen für D.6/D.29:** Dichte-Umschalter (§2.9) erst, wenn Lane A eine Dichte-Variante hat — aus D.6 heraus. Projektname im Pfad: nicht per zusätzlichem getDoc (lädt den Quelltext mit); Stufen/WorkspaceShell reichen ihn an die Shell — D.29. Suche aus der Shell: benanntes Ereignis, auf das `CommandSearch` hört — D.29; danach entfällt die eigene Pfad-/Suchzeile in WorkspaceShell.
