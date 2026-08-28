# UX-Benchmark — grok-4.6

**Modell:** `grok-4.6` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 39421 prompt / 4644 completion · 217s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

**Blickführung Landing (Ist):** Gelbes Banner → NEW-Chip → Smaragd-„Clean Core“ in der H1 → zwei gleich schwere Buttons → Quick-Answer-Wand → Karussell → Fließtext „Nobody can say…“ (**Abriss**) → 21/17/4 (**zu spät der Halt**) → Tool-Matrix (**zweiter Abriss**) → Showroom-Code (**Halt nur für Survivors**) → sechs gleiche Karten → Pricing.

**Soll:** H1 + Artefakt → Code-Beweis → 21/17/4 → Toolchain nur als Politik-Cover → Pläne. Emerald bleibt der einzige Akzent; nichts Inhaltliches wird erfunden oder gestrichen.

---

## A) Landingpage

### 1. Hero: Split statt Zentrum, Artefakt in die erste Blickzone

**Ist:** Zentrierter Stapel (NEW-Chip, Eyebrow, H1, Lead, zwei Pills, Textlink). Das erste Produktbild sitzt erst in „Deep Code Intelligence“ — Desktop eine Viewport-Höhe tiefer, Phone zwei.

**Änderung (Desktop 1440):** Content-Grid `grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 48px; align-items: center; padding-top: 32px`. Links: Eyebrow → H1 → Lead → CTAs. Rechts: Slide 1 des bestehenden Karussells (grüner Report-Header „Business Analysis Report“ + Phone-Mock). Karte: bestehender Radius, 1px `slate-200`, kein neuer Schatten-Look. NEW-Chip aus dem Hero nehmen; der Link „SAP Clean Core, explained without the jargon“ wandert als Textzeile unter Quick Answer (gleiche Labels, nur Ort).

**Phone 390:** Nach den CTAs ein 200px-hoher Crop desselben Screens (`object-fit: cover; object-position: top`), damit der grüne Report-Kopf in der ersten Scroll-Fläche liegt. Quick Answer darunter, default zugeklappt.

**Warum:** Architekten scannen nach Artefakt, nicht nach Slogan. Fachbereich sieht sofort „das ist ein Report“, nicht „das ist eine AI-Landing“. Das Smaragd in der H1 bleibt First-Hit; das Report-Grün daneben ist derselbe Akzent, kein zweites System.

---

### 2. Eine gefüllte Fläche, nicht zwei Pills gleicher Masse

**Ist:** „Open Workspace“ (Emerald, filled) und „Read Whitepaper“ (Near-black, filled) gleiche Höhe, gleiche Breite, gleiche Rundung. Phone: zwei Full-Width-Blöcke plus „Explore How It Works & Limitations“. Drei Aktionen, keine Hierarchie.

**Änderung:**
- Primary: `Open Workspace` — filled Emerald, Höhe 48px, Padding `0 24px`, bestehender Radius. Einziger filled Button im Hero.
- Secondary: `Read Whitepaper` — ghost: `background: transparent; border: 1px solid rgb(203 213 225); color: rgb(15 23 42);` gleiche Höhe.
- Tertiary: `Explore How It Works & Limitations` bleibt Textlink (`slate-600`, 14px, Chevron), direkt unter das Button-Row, nicht als dritte Pill.

Phone: Primary full-width, Secondary full-width ghost, Tertiary zentrierter Text. Kein dritter filled Block.

**Warum:** SAP-Architekten entscheiden in einer Aktion (Workspace). Whitepaper ist Absicherung für Fachbereich/Compliance — sichtbar, aber nicht rivalisierend. Zwei filled CTAs sind in dieser Zielgruppe „kein CTA“.

---

### 3. DOM-Reihenfolge: Beweis vor Politik

**Ist:** Hero → Quick Answer → Process/Karussell → „Nobody can say“ + 21/17/4 → Complement-Tools → Transformation Showroom → abapGit-Band → Features → Data → Community → Verify.

**Änderung (nur `order`, kein Copy-Schnitt):**
1. Hero (mit Artefakt aus 1)
2. Quick Answer (zugeklappt)
3. Transformation Showroom **inklusive** des bestehenden Dark-Bands „Download a Real abapGit Package“ (die beiden Blöcke bleiben verheiratet)
4. „Nobody can say what this program does“ + 21/17/4 + der Satz „Every tool in this market…“
5. How we complement your SAP tools
6. What You Can Do Today
7. Your Data Stays Yours
8. Community Access + die drei Security-Profile-Karten + BYOK-Fußnote
9. Verify It Yourself
10. Footer + Disclaimer

„Deep Code Intelligence“-Copy bleibt; der Screenshot ist nach oben gewandert, der Text sitzt als erste Zeile über dem Showroom oder als Mono-Eyebrow `THE CLEAN CORE PROCESS` über einer 7er-Schritt-Leiste (Upload…Delivery, Reihenfolge unverändert, nur Labels die das Produkt schon nutzt).

**Warum:** Architekten bleiben am ABAP→CDS→Unit-Test hängen — das ist der Showroom, der heute nach der dichtesten Tabelle kommt. Fachbereich braucht 21/17/4 als Entscheidungsbild, nicht nach einer ATC-Matrix. Die Matrix bleibt, aber als „wir ersetzen ATC nicht“-Cover **nach** dem Beweis.

---

### 4. 21 / 17 / 4 als proportionale Meterzeile, Quote darunter

**Ist (Desktop):** Zweispaltig — links langer Fließtext „Do we still need this program?“, rechts Dark-Card mit 21 SETTLED / 17 YOUR CALL / 4 HARD WORK. Die Zahlen sind der Halt, stehen aber neben einem Textblock, der den Scan bricht. Phone macht es besser: Dark-Card zuerst.

**Änderung:** In der Dark-Card **oben** eine Zeile, drei Segmente, `flex-grow` = 21 / 17 / 4 (die veröffentlichten Zähler, keine neuen Werte). Segmentfarben nur aus dem Setup: `emerald-600`, `emerald-200`, `slate-300`. Zahl + bestehendes Versal-Mono-Label (`SETTLED` / `YOUR CALL` / `HARD WORK`) **in** jedem Segment, `font-variant-numeric: tabular-nums`, IBM-Plex-Mono, 40px Desktop / 28px Phone. Darunter unverändert der Fließtext der Card. Links-Spalte „Do we still need…“ bleibt, rutscht Desktop unter die Meterzeile in dieselbe Card-Gruppe (`grid-template-columns: 1fr 1fr` nur noch für die zwei Fragen, Meter full-bleed darüber). Phone: Meter → Cost-Copy → Need-Copy (Need nicht mehr unter den Fold der Cost-Card schieben).

**Warum:** Fachbereich hängt an „was ist schon entschieden“. Architekten hängen an „4 HARD WORK“. Proportionale Breite macht das Verhältnis lesbar, ohne eine neue Behauptung. Reines Gewichten sichtbarer Zahlen.

---

### 5. Tool-Matrix: zwei visuelle Gruppen, Phone-vs auf Desktop spiegeln

**Ist:** Sechs Zeilen × drei Spalten (Capability | SAP Native | Clean-Core.io), Chips `NOT AVAILABLE` / `MANUAL ONLY` / `AUTOMATED` / `REFACTORED` / … Phone zerlegt das in sechs VS-Paare — das ist die klarere Lesart.

**Änderung (Desktop):** Tabelle bleibt. Nach Zeile 3 (`SAP Object Successor Mapping`) ein `12px`-Gap plus 1px `slate-200` — Gruppe A = Scannen/HUD/Mapping, Gruppe B = Refactor/Sandbox/Blueprint. **Keine neuen Gruppen-Titel.** Clean-Core-Spalte: `box-shadow: inset 3px 0 0` Emerald (nicht border-color-Wechsel). SAP-Spalte: Hintergrund `slate-50`. Sticky first column bei Overflow.

Chips unverändert in Wort und Farbe (Rot = semantisch abwesend, Emerald = vorhanden). Kein drittes Chromatic.

**Warum:** Architekten suchen die Zeile „Sandbox Verification (BYOT)“ und „Code Refactoring“. Fachbereich skimmt nur Gruppe B. Heute ist die Matrix ein homogener Teppich — dort reißt der Blick ab.

---

### 6. „What You Can Do Today“: zwei Zuschauer, sechs Karten, ein Raster

**Ist:** 3×2 gleiche Karten, gleiche Icon-Kreise, gleiches „Learn more →“. „Modernization Assessment“ hat ein `NEW`-Chip, sonst keine Hierarchie. Phone: sechs Vollkarten untereinander — Feature-Friedhof.

**Änderung:** Dieselben sechs Karten, zwei Reihen mit bestehendem Section-Lead als Trenner (kein neuer Claim):
- Reihe 1 (Architektur): Extensibility Routing, SAP Cloudification Catalog, Dual RAP & CAP Engine — `grid-template-columns: repeat(3, 1fr)`.
- Reihe 2 (Steuerung): Modernization Assessment, Compliance & Audit Evidence, BPMN 2.0 — gleiches Grid.
Zwischen den Reihen ein `8px` Hairline, kein extra Headline-Copy. `NEW` bleibt auf Assessment. Icon-Kreis, Radius, Learn-more-Treatment unverändert. Phone: vor Karte 1 und vor Karte 4 ein 11px-Mono-Eyebrow, gezogen aus der bestehenden Section-Linie „Every feature listed here is live…“ — einmal als `LIVE · ARCHITECT`, einmal als `LIVE · GOVERNANCE` wäre neuer Claim, also **nicht**. Stattdessen Phone: die bestehende Section-Subline einmal oben lassen und die sechs Karten auf `padding: 16px` (innen) statt Desktop-Card-Padding, Icon 32px statt 40px, Body 14/20 — Dichte, nicht Vergrößerung.

**Warum:** Ein Architekt sucht RAP/CAP und Cloudification. Ein Fachbereich sucht Audit und BPMN. Sechs gleiche Kacheln bedienen niemanden zuerst.

---

### 7. Community-Block: vier Benefits komprimieren, zwei Pläne als Halt

**Ist:** Vier Benefit-Kacheln (Free to use / Open standards / Transparent / Complement) plus zwei Plan-Karten (weiß Free Community, dark Free + Own Key). Sechs konkurrierende Flächen. Der Dark-Plan ist der richtige Close, verliert gegen das Raster darüber.

**Änderung:** Die vier Benefits in **eine** Karte, 2×2, Icon 20px, Titel 14/20, Body 13/20, Gap 16px — dieselben vier Texte. Darunter die zwei Pläne `grid-template-columns: 1fr 1fr; gap: 16px` (Phone stapeln, Dark-Plan zuerst via `order: -1`). Primary „Go to Workspace“ nur im Dark-Plan filled Emerald; im weißen Plan Outline (heute sind beide schwer). Checklisten und BYOK-Fußnote unverändert.

**Warum:** Der Close für beide Zielgruppen ist „5 Transformations vs. eigener Key“. Die vier Grundsätze sind Trust, nicht Conversion — sie dürfen nicht dieselbe Fläche fressen.

---

### 8. Duplicate „Free“ und Sticky-Scanleiste

**Ist:** Gelbes Banner „FREE COMMUNITY EDITION“ + Hero-Eyebrow „FREE FOR THE SAP COMMUNITY“ + später nochmal „Community Access / 100% free“. Drei Freemium-Schreie bevor jemand Code gesehen hat. Keine In-Page-Navigation auf einer sehr langen Seite.

**Änderung:**
- Banner-Copy nicht löschen, aber auf der Landing den Gelb-Balken auf `height: 32px; font-size: 12px` und nach `Dismiss` `display: none` für die Session. Den Hero-Eyebrow behalten — das ist die typografische Stimme.
- Unter dem Hero eine Sticky-Leiste `position: sticky; top: 0; height: 44px; background: white; border-bottom: 1px solid rgb(226 232 240); z-index: 20`. Items in bestehendem Versal-Mono 11px / `letter-spacing: 0.12em`: `PROCESS · EVIDENCE · TOOLCHAIN · SHOWROOM · CAPABILITIES · DATA · ACCESS` als Anker auf die **umsortierten** Sections. Active: 2px Emerald underline, `color: rgb(15 23 42)`; idle `slate-500`. Phone: `overflow-x: auto; scroll-snap-type: x mandatory`, Chips `scroll-snap-align: start`, kein Wrap.

**Warum:** Architekten springen zu SHOWROOM/TOOLCHAIN. Fachbereich zu EVIDENCE/DATA/ACCESS. Heute gibt es nur Vertikal-Hoffnung. Die Leiste nutzt vorhandene Section-Logik, keine neue Farbwelt, keine neuen Claims.

---

**Typografie-Einsatz (konkret, gilt für A1–A8):** Zwei Rollen, nicht drei. Display = IBM Plex Sans 700, Sentence Case (`Transformation Showroom`, `What You Can Do Today`, `Your Data Stays Yours`) — die schreiende Zeile `HOW WE COMPLEMENT YOUR SAP TOOLS` wird Satzschreibung, weil der Eyebrow `COMPLEMENTS YOUR SAP TOOLCHAIN` die Versalien schon trägt. Labels = IBM Plex Mono 11px, uppercase, `letter-spacing: 0.12em` (so wie `QUICK ANSWER`, `REAL VERIFIED OUTPUT`, `SETTLED`). Body = Plex Sans 16/26 Hero-Lead, 14/22 Cards. Zahlen 21/17/4 = Mono tabular. Kein dritter Display-Schnitt, keine zweite Akzentfarbe im Type.

---

## B) Workflow — drei Vorschläge über alle sieben Schritte

### 1. Ein Zustands-Chassis für Design, Testing, Documentation

**Ist:** Analyze ist voll. Design ist ein Green-Header „Designing Solution…“ plus graue Skeleton-Bars und bereits sichtbarer Footer. Testing hat **zwei** Generate-Buttons (`Generate Suite` im Card-Header und `GENERATE TEST SUITE` im Empty-Body) plus idle Terminal. Documentation ist eine gestrichelte Fläche „No enterprise specifications yet“ mit `START ARCHITECTURAL MAPPING`, während `Proceed to Delivery` bereits filled Emerald ist. Drei Sprachen für „noch nichts“.

**Änderung:** Ein Component `StepStage` mit drei States, gleicher Chrome:
- `loading`: bestehender grüner Header + Spinner rechts (wie Design heute) + 4 Skeleton-Zeilen. Stepper-Dot pulsiert.
- `empty`: gestricheltes Panel (wie Documentation), **ein** Primary im Panel, nicht zusätzlich im Header. Testing: Header-Button `Generate Suite` entfernen, nur der Body-Button bleibt.
- `ready`: heutiger Inhalt.

`Proceed to …` unten: `empty`/`loading` = Ghost (1px slate, Text slate-700). `ready` = filled Emerald. Nicht sperren — nur Gewicht. Gilt für 3 Design, 5 Testing, 6 Documentation; Upload/Analyze/Transformation/Delivery bleiben inhaltlich, nutzen denselben Footer-Rhythmus (Ghost zurück links, Primary rechts, Höhe 44px, gleiche Breite-Logik).

**Warum:** Architekten lesen den Stepper als Vertrag. Wenn Step 6 leer ist und Step 7 trotzdem knallt, ist der 7-Schritt-Pfad unglaubwürdig — genau das, was die Landing mühsam aufbaut.

---

### 2. Analyze: Nullen nicht heroisieren, Evidence nach oben

**Ist:** Nach dem Score 62% kommt „Coverage Verdict“ mit 0% / 0% / 0% in großen Zahlen plus Badge `FULLY SUPPORTED`. Darunter Empty „No findings from these detectors“. Darunter erst Evidence Findings (2× Medium, VBAK/VBAP). Der Blick bleibt an drei Nullen hängen und reißt vor den echten Funden ab. Phone stapelt das noch länger.

**Änderung (State-Unterscheidung, erlaubtes Gewichten):** Wenn alle drei Coverage-Werte 0 sind, Coverage-Card **nicht** als Dark-Hero. Stattdessen eine Mono-Zeile unter dem Score: `FULLY SUPPORTED 0 · REVIEW REQUIRED 0 · OUT OF SCOPE 0` plus das bestehende Badge. Construct-Findings-Empty bleibt. Evidence-Findings-Tabelle rückt direkt unter Score + Extensibility-Router + Analysis-Summary (die drei Top-Karten). Tabs `DECISION & EVIDENCE | GAPS BACKLOG | …` und der Hinweis „Explore all 4 report sections…“ bleiben. Keine Zahl ändert sich.

**Warum:** Architekten suchen Constructs und Replacements (`API_SALES_ORDER_SRV`). Fachbereich sucht den 62%-Ring und den Plain-English-Guide. Drei Nullen als Hero sind ein falscher Halt.

---

### 3. Transformation Phone: Segment statt Doppel-Editor; Desktop-Split bleibt

**Ist:** Desktop-Split ABAP | Node/TS ist der stärkste Produktmoment (Sync Scroll, Dateibaum, Strict-Legacy-Banner). Phone stapelt beide Editoren vollhöhe — Vergleich unmöglich, Insights erst nach zwei Code-Kaminen.

**Änderung:** Phone: Segmented Control direkt unter `Sync Scroll / Copy / Re-Run`, bestehendes Pill-Pattern (wie Analyze-Tabs): `LEGACY ABAP | NODE.JS/TS`. Ein Editor sichtbar, Höhe `max(52vh, 320px)`. Control = IBM Plex Mono 11px Versal. Desktop unverändert Split. Insights-Card: auf Phone die drei Blöcke als Horizontal-Scroll mit Snap (gleiche Copy: Event-Driven / TypeORM / XSUAA), nicht drei Vertikal-Essays vor dem Footer.

Zusätzlich systemweit: den lila Ring an `62% COMPLIANCE HUD` (Transformation) und den lila `VIEW SLIDES` (Delivery) und `Estimated Coverage` (Testing) auf Emerald/Slate ziehen — siehe C. Das ist kein Workflow-Inhalt, aber derselbe Blickabriss in Schritt 4/5/7.

**Warum:** Der Showroom der Landing verspricht Seit-an-Seit. Schritt 4 auf 390px bricht dieses Versprechen. Architekten brauchen Diff, nicht Scroll-Sport.

---

## C) Ein mutiger Vorschlag

**Audience-Toggle unter der H1: `Architect` | `Fachbereich`.**

Zwei Chips, exakt das Pill-Pattern, das die Seite schon hat (`NEW`, `FREE BALANCE`, Analyze-Tabs). Selected = Emerald filled, Unselected = ghost slate. Kein neues Label-Vokabular über das hinaus, was die Seite ohnehin unterscheidet (Code vs. Entscheidung vs. Governance).

Wirkung: CSS `order` (oder zwei vordefinierte Grid-Flows) auf **denselben** Sections:
- Architect: Showroom → Toolchain → 21/17/4 → Capabilities → Access
- Fachbereich: 21/17/4 → Data Stays Yours → Community Access → Showroom → Capabilities

Default = Architect (Headline spricht ihn an). Toggle schreibt `localStorage`, kein zweites CMS.

**Warum das Setup nicht verwässert:** Eine Akzentfarbe, dieselben Karten, derselbe Radius, dieselbe Mono-Versal-Stimme, dieselben sieben Workflow-Schritte, **null** neue Claims, null gestrichene Sätze. Es ist Gewichten per Zustand — genau das erlaubte Mittel. Mutig, weil Marketing-Landings „eine Story“ wollen; hier sind nachweislich zwei Käufer in einem Scroll, und die aktuelle Reihenfolge verliert den zweiten, bevor der erste fertig gescannt hat.

---

## D) Was ich nicht anfassen würde

**1. Die Dark-Card 21 SETTLED / 17 YOUR CALL / 4 HARD WORK** — Copy, Zahlen, Versal-Labels, der Satz zum 507-Zeilen-Referenzprogramm. Das ist die einzige Stelle, an der die Seite wie ein Gutachten klingt statt wie ein Tool. Layout ja (A4), Inhalt und Typo-Stimme nein.

**2. Transformation Showroom + abapGit-Band** — echter VBAK-Report, generierte CDS, ABAP-Unit, Parser-Insight, `1 unit tests passed`, Download ohne Login. Das ist der Beweis, den ein SAP-Architekt einem Kollegen weiterleitet. Nicht glätten, nicht durch Illustration ersetzen, nicht hinter einen Slider sperren.

**Plus, weil es trägt:** Das Mono-Eyebrow-System (`QUICK ANSWER`, `REAL VERIFIED OUTPUT`, `SOVEREIGN & SECURED`). Das Wort „Clean Core“ in Emerald in der H1. Die Haltung „A complement, not a replacement“ inklusive ATC-Mapping. Der große Kartenradius auf Weiß. Der Footer-Disclaimer — in diesem Markt ist das Trust, kein Legal-Noise.

---

**Bau-Reihenfolge fürs Team:** A2 (CTA-Hierarchie) und A3 (DOM-Order) zuerst — kein Visual-Rework, sofort andere Blickführung. Dann A1 (Hero-Split) und A4 (Meter). B2 und B1 im Produkt. Audience-Toggle (C) erst, wenn die Anker aus A8 stehen. Lila (Testing/Delivery/Settings-BYOK) in dem Sprint auf Emerald/Slate ziehen, sonst bleibt das „einzige Akzentgrün“ eine Regel, die die App selbst bricht.
