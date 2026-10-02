# UX-Benchmark — grok-4.6

**Modell:** `grok-4.6` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 39221 prompt / 4089 completion · 190s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

# Design-Review Clean-Core.io

Kein Redesign, keine neuen Texte/Funktionen. Nur Anordnung, Gewichtung, Hierarchie, Zustände. Chrome-Befunde, die auf allen App-Screens gleich sind, stehen einmal vorn — danach Screen für Screen.

---

## Chrome (alle App-Screens 02–11)

**BEFUND:** Das gelbe Band „FREE COMMUNITY EDITION … Privacy Policy · Legal Notice · DISMISS“ sitzt über dem Produkt-Header. Auf 390 px frisst es die erste Viewport-Hälfte, bevor „Workspace“ oder der Stepper erscheint. Zusätzlich: Header-Chip „Ask AI“, grüner FAB „Ask AI“, schwarzer „N“-Button — drei konkurrierende Overlays. Der Marketing-Footer (Product / Resources / Legal) hängt unter jedem Workflow-Schritt, auch unter dem Skeleton von Design. Quota erscheint dreifach verschieden: Header „1 / 5 TRANSFORMATIONS“, Workspace-Pill „FREE BALANCE: 4 / 5 FREE“, Transformation-Pill „FREE TRANSFORMATIONS: 4 / 5“.

**VORSCHLAG:** Banner nach Dismiss nicht in den Workflow zurückholen; Quota an genau einer Stelle (Header-Chip). Ask-AI nur als FAB *oder* Header, nicht beides. Footer auf den sieben Workflow-Schritten nicht rendern — der Sticky-Pfad „← Back / Continue →“ ist der Abschluss. „N“ an den Header binden, nicht als zweite Floating-Position.

---

## 01 — Landing

**BEFUND (Desktop):** Der Screen ist inhaltlich dicht und in der Sprache stimmig. Was verliert: Nach dem Hero folgen gleichwertige Blöcke (Quick Answer, Process-Karussell, Proof-Split 21/17/4, Tool-Matrix, Showroom, Feature-Grid, Trust, Community, Verify). Der Sieben-Schritt-Pfad kommt als Produktversprechen vor, wird aber nie als benannte Sequenz gezeigt — das Karussell „THE CLEAN CORE PROCESS“ zeigt UI-Slides, nicht Upload→…→Delivery. „Go to Workspace“ sitzt in Header, Hero, Community-Karten und Verify — vier identische Ziele ohne Hierarchie. Der Footer-Disclaimer ist länger als der Hero.

**BEFUND (Phone):** „Open Workspace“ ist eine volle Grünfläche mit Chevrons links *und* rechts — liest sich als Karussell-Control, nicht als Primary. Die Tool-Matrix wird zu sechs hintereinander gestapelten VS-Paaren; die Vergleichsleistung der Desktop-Tabelle ist weg. Showroom-Code und abapGit-Block sind auf 390 px abgeschnitten. Floating „N“ + Chat liegen auf CTAs.

**VORSCHLAG:** Eine Primary-CTA-Stufe: Hero „Open Workspace“ visuell führend; alle späteren „Go to Workspace“ als Ghost/Text-Link derselben Aktion. Process-Karussell so gewichten, dass die sieben Schritt-Namen die Caption sind (keine neuen Labels — sie existieren im Produkt). Auf Phone: Primary ohne seitliche Chevrons; Tool-Matrix als horizontales Snap-Carousel der sechs Capability-Karten, nicht 12er-Stack. Disclaimer hinter einem Default-collapsed Legal-Block (Text bleibt, Start-Hierarchie ändert sich). FAB/N auf der Landing nicht über Hero-CTAs legen.

Der Rest der Landing (Proof-Zahlen, Trust-Karten, Community-Split) trägt. Nicht anfassen.

---

## 02 — Dashboard / Workspace

**BEFUND:** Die Arbeit des Nutzers ist eine einzige Tabellenzeile: `ZCREDIT_CHECK — Credit Ma…`, Status „DOCUMENTATION (95%)“, Created „N/A“, vier Icon-Actions ohne Label. Darunter dominiert „TRY IT WITH AN EXAMPLE“ mit sieben Karten — größer als das Projekt. Darunter die Sektion „ABAP / LEGACY CODE DATABASE (SAFE EXAMPLES)“: nur Headline + „SHOW PRELOADED EXAMPLES ▾“, darunter Leerraum. Das wirkt kaputt. „N/A“ als Created-Wert untergräbt Vertrauen. 95 % ist an „DOCUMENTATION“ gebunden — unklar, ob Schritt-Fortschritt oder Dokumentations-Completeness; der Stepper existiert auf diesem Screen nicht.

**BEFUND (Phone):** How-to als volle Secondary über Create Project ist in Ordnung. Projektkarte staucht Name und legt Actions in eine Icon-Zeile unter „N/A“. Examples stacken lesbar.

**VORSCHLAG:** Hierarchie umdrehen: Projektliste zuerst, volle Breite, Name nicht mittig hart abschneiden (`ZCREDIT_CHECK` bleiben, Subtitle umbrechen). Created-Zustand: wenn leer, die Zelle nicht mit „N/A“ füllen — Spalte weglassen oder em-dash in Secondary-Farbe, nicht als Datenwert. Status als Schritt-Name + dünne 7er-Segmentleiste, nicht als einzelne Doku-Bar. Examples unterhalb in einen Default-collapsed Block (Toggle existiert bereits: „SHOW PRELOADED EXAMPLES“) — die tote Headline-Sektion mit dem Example-Grid zusammenziehen, nicht zwei leere/volle Bereiche. Actions: Icon + bestehendes Verb nur on-hover/aria, auf Phone Labels unter den Icons der bestehenden vier Actions.

---

## 03 — Analyze

**BEFUND:** Drei Signale widersprechen sich auf einer Fläche: Clean Core Score **62 %**, Coverage Verdict **0 % / 0 % / 0 %** plus Badge **„FULLY SUPPORTED“**, Construct Findings **0 findings** inkl. Hinweis „It does not follow that the code is clean“. Evidence Findings daneben: **2 unique findings, Medium**. Extensibility Router: „Confidence not computed“. Analysis Summary: „STANDARD FIT“ mit orangem Punkt und **leerem Balken**. Gelbes Band: „EXPLORE ALL 4 REPORT SECTIONS…“ — die Tabs GAPS / ASSESSMENT / STRATEGY haben keinen Visited/Done-Zustand, „Continue to Design“ ist trotzdem vollgrün.

**BEFUND (Phone):** Tabs laufen aus dem Viewport (`DECISION & EVIDENCE | GAPS…`). Evidence-Tabelle verliert Severity, Source, SAP Replacement, Target — übrig bleiben Pattern + abgeschnittener Snippet. Genau die Spalten, die eine Entscheidung tragen.

**VORSCHLAG:** Coverage-Karte: wenn alle Detektoren 0 Matches haben, die drei 0 %-Kacheln und das „FULLY SUPPORTED“-Badge nicht als Erfolg rendern — denselben Empty-State-Ton wie „No findings from these detectors“ (Karte bleibt, Gewichtung auf den erklärenden Satz, Zahlen als Secondary). 62 %-Score als Leitkennzahl oben links behalten; Router-„Confidence not computed“ und leeren Standard-Fit-Balken visuell als unvollständig (gestrichelte Karte, nicht als fertiges Ergebnis neben dem Score). Tabs: horizontales Scroll mit sichtbarem Overflow-Hint; Mini-Marker auf den drei unbesuchten Tabs (Dot, kein neuer Text). Primary „Continue to Design“ in Ghost/Outline, solange der Explore-Hinweis aktiv ist — Button bleibt, Gewicht wechselt. Phone: Evidence-Rows als Stack (Pattern, Severity-Pill, Replacement untereinander), nicht als Tabelle mit abgeschnittenen Spalten.

---

## 04 — Design (Loading)

**BEFUND:** Einziger Zustand im Screenshot: Grünkopf „Designing Solution… / Architecting solution design…“, Spinner, graue Skeleton-Bars, darunter der volle Marketing-Footer. Kein Pulse, kein Schritt-im-Schritt, kein Zeitanker. Stepper steht auf 3 — gut — aber der Screen darunter sieht halb leer, halb fertig aus. FAB und „N“ liegen auf dem Skeleton. User kann nicht unterscheiden: arbeitet die Engine, hängt sie, ist die Seite leer geladen?

**VORSCHLAG:** Skeleton an die echte Design-Layoutstruktur koppeln (keine neue UI — Platzhalter in der Form der Zielkarte). Spinner direkt am Titel halten, Footer während Loading nicht mounten. Overlay-Buttons während dieses Zustands nicht über den Inhalt. Wenn die Engine ohnehin Zwischenstatus hat: bestehenden Titel „Architecting solution design…“ als einzige lebende Zeile belassen, aber den Grünkopf nicht 100 % Fläche füllen lassen — Stepper + Titel + Skeleton reicht, sonst wirkt der Schritt wie eine Sackgasse.

Der Screen ist als Loading akzeptabel, sobald er nicht „fertig aber leer“ liest. Nicht mehr erfinden.

---

## 05 — Transformation

**BEFUND:** Linke Seite ist lesbares ABAP. Rechte Seite ist kein Editor: File-Tree (`srv/service.ts`, `package.json`, `Dockerfile`) plus eine Zeile, die wie ein JSON-Dump beginnt: `{"srv/credit-check.ts":"export async function ch…`. Sync Scroll ist ON, es gibt aber keine sichtbare Zeilen-Kopplung. Insights (Event-Driven / TypeORM / XSUAA) sitzen unter beiden Viewports — nach der Stelle, an der die Entscheidung „stimmt die Transformation?“ fällt. Gelbe Zeile „Strict Legacy Mode…“ sitzt im Target-Pane und konkurriert mit dem Code. Compliance-HUD 62 % wiederholt den Analyze-Score ohne Kontext, wo er herkommt.

**BEFUND (Phone):** Panes untereinander — Vergleich tot. Tree + Warning + Dump in einem Block. Insights erst nach langem Scroll.

**VORSCHLAG:** Target-Pane: zuerst die geöffnete Datei als Code (Syntaxfläche), Tree als schmale linke Schiene — den JSON-Dump-Zustand nicht als Default-View. Warning „Strict Legacy Mode“ als eine Zeile über dem Editor, nicht in der Codefläche. Insights direkt unter die Toolbar (Sync/Copy/Re-Run), Code darunter — Reihenfolge tauschen, Texte gleich. 62 %-HUD an „View Grounding Audit“ koppeln (eine Fläche), nicht als zweiter Score neben der Quota-Pill. Phone: Segmented Control „ABAP | TypeScript“ (bestehende Pane-Titel) statt Doppel-Stack; Insights über dem Code.

---

## 06 — Testing

**BEFUND:** Zwei identische Aktionen: Header-Button „Generate Suite“ und Empty-State „GENERATE TEST SUITE“. Rechte Terminal-Karte: „Sandbox initialized. Waiting for execution…“ — wartet, obwohl links noch keine Suite existiert. „Estimated Coverage / GENERATE TESTS TO SEE ESTIMATE“ ist eine dritte, lila Mini-Sackgasse. Environment: „MOCK ENVIRONMENT“ als dunkler Chip neben „CONNECTED S/4HANA TENANT“ plus Toggle — Segment und Switch gleichzeitig. **„Proceed to Documentation“ ist vollgrün**, obwohl nichts generiert und nichts gelaufen ist.

**VORSCHLAG:** Ein Generate — den Header-Button entfernen, Empty-State-CTA behalten (oder umgekehrt). Terminal erst nach Generate als aktive Fläche; vorher denselben Empty-Ton wie links, nicht „waiting“. Coverage-Karte visuell zurücknehmen (Secondary, keine lila Schreihals-Zeile), bis ein Wert existiert. Environment als ein Segmented Control (Mock | Tenant), Toggle nicht parallel. Primary „Proceed to Documentation“ als Outline, solange die Suite leer ist — Navigation bleibt möglich, Gewicht sagt „Schritt nicht erfüllt“.

---

## 07 — Documentation

**BEFUND:** Fläche leer: „No enterprise specifications yet.“ Primary in der Fläche: „START ARCHITECTURAL MAPPING“. Gleichzeitig sind „EXPORT BPMN“, „EXPORT CONFLUENCE“ und grünes „REGENERATE“ schon da — Export/Regenerate auf Nicht-Existenz. „Proceed to Delivery“ vollgrün. Roter Chip „4 Issues“ floatet unten links; auf Phone liegt er auf dem Empty-State-CTA. Unklar, ob die 4 Issues aus Analyze/Testing stammen oder hier entstehen. User kann den Schritt verlassen, ohne das Mapping zu starten.

**VORSCHLAG:** Export und Regenerate visuell disabled/ghost, solange der Empty-State aktiv ist (Buttons bleiben im DOM). „START ARCHITECTURAL MAPPING“ als einzige gefüllte Fläche-CTA. „4 Issues“ in den Header der Seite ziehen (neben den Integration-Pills), nicht als Overlay. Proceed analog Testing: Outline statt Fill, solange Empty-State sichtbar.

---

## 08 — Delivery

**BEFUND:** Integrity Report: drei grüne Haken, ein gelbes „Coverage not estimated“, Fußzeile **„QA STATUS · ALL ARTEFACTS PRESENT“**. Daneben Karte „SOP & COMPLIANCE · NOT GENERATED“. Darunter „Compliance Audit Pack · Partial“. Drei Wahrheiten. Die vier Lieferkarten sind gleich gewichtet; es gibt keine empfohlene nächste Handlung. Board Presentation wiederholt „VIEW SLIDES“ unterhalb. Phone: Integrity-Report erst nach allen vier Karten — das Statusurteil kommt zu spät.

**VORSCHLAG:** Integrity-Report nach oben (Desktop: volle Breite über das 2×2, Phone: direkt unter den Titel). „ALL ARTEFACTS PRESENT“ nicht als grünen Voll-Erfolg setzen, solange SOP „NOT GENERATED“ und Coverage „not estimated“ in derselben Karte stehen — der bestehende gelbe Coverage-Zeile-Ton auf den QA-Fuß spiegeln, Text nicht ändern. SOP-Karte nicht als neutrale Peer-Karte zu Download Bundle: Secondary/ghost, Button-Zustand „NOT GENERATED“ behalten. Download Bundle als einzige gefüllte Primary. Board-Preview unter den Karten lassen, „VIEW SLIDES“ in der Karte als Sprung dorthin — nicht zwei gleiche Einstiege gleich schwer.

---

## 09 — TCO (Nebenansicht)

**BEFUND:** Stepper zeigt **Schritt 1 UPLOAD aktiv**, obwohl der Screen „BACK TO ANALYZE“ anbietet und C-Level-View des Analyze-Reports ist — Orientierung ist falsch. Leitkennzahlen: **€−1.550 / year**, **−116.1 Months**, **−10 %**, Subline **„reduced by -Infinity%“**. Pre-TCO **€0**, Post-TCO **€1.550** bei 12 LOC und €15.000 Investment. Das 5-Year-Chart fällt in den negativen Bereich, die Fläche ist trotzdem Grün-Fill. Ein Executive sieht „das Produkt rechnet gegen uns“, weil ein Degenerate-Input wie ein fertiger Business Case gesetzt ist.

**VORSCHLAG:** Stepper auf Analyze (Schritt 2) legen, TCO als Overlay/Subview ohne eigenen Schritt-Reset. Reihenfolge: Inputs zuerst, Kennzahlen danach (Phone sowieso schon so — Desktop nachziehen). Bei Legacy-TCO €0 / negativem Savings die drei KPI-Karten nicht als Dark-Hero „ANNUAL NET SAVINGS“ führen — gleiche Zahlen, aber gleiche Gewichtsklasse wie Payback/ROI, kein schwarzes Hero-Tile. Grün-Fill im Chart nicht auf eine monoton fallende Negativkurve. „-Infinity%“ nicht als Prozentzahl setzen (Zustand: Subline ausblenden oder „—“, wenn Divisor 0) — das ist Zustandsbehandlung, kein neuer Copy.

---

## 10 — Knowledge

**BEFUND (Desktop):** Tragfähig. Hero, Quick Answer, FAQ, Glossary, RAP-vs-CAP-Tabelle, Alignment, Related — Hierarchie stimmt. „← Back“ ohne Zielkontext ist die einzige Schwäche.

**BEFUND (Phone):** Die Vergleichstabelle zeigt praktisch nur die Spalte „In-App RAP“; „Side-by-Side CAP“ ist abgeschnitten. Genau das Decision-Artefakt der Seite fällt aus. Quick Answer ist collapsed — auf Desktop offen.

**VORSCHLAG:** Desktop so lassen. Phone: Tabelle als gestapelte Zeilen (Kriterium als Label, RAP-Wert, CAP-Wert darunter) oder horizontales Snap der zwei Spalten — Inhalt identisch, keine abgeschnittene zweite Architektur. Back-Label aus dem bestehenden Ziel speisen („Workspace“ / vorherige Seite), kein neuer Textblock. Quick Answer auf Phone default offen wie Desktop.

---

## 11 — Settings

**BEFUND (Desktop):** Linke Spalte (Daten, Prefs, Security, BYOK, Tenant, Danger) + rechte Plan/Legal — in Ordnung. Doppelung: „CURRENT PLAN · Free Community Edition“ und darunter „Free Community Edition Status“ erzählen dasselbe (5 Transformations, GDPR, Support). Passwortfelder wirken vorausgefüllt (Dots in Current/New/Confirm gleichzeitig).

**BEFUND (Phone):** Reihenfolge ist Plan → Status → **Legal & Privacy Directory (langer Dark-Block)** → erst dann Personal Data. Settings öffnet als Rechtstext.

**VORSCHLAG:** Phone-Order = Desktop-Sinn: Personal Data → Preferences → Security → BYOK → Tenant → Plan/Status (eine Karte, nicht zwei) → Legal → Danger. Legal im Accordion default collapsed (Texte bleiben). Die zwei Plan-Karten zu einer stapeln (Status-Zeilen in die Current-Plan-Karte). Passwort: Current leer, New/Confirm leer — nicht drei Masken parallel als „schon da“.

---

## Prioritäten (Wirkung / Aufwand)

1. **Widersprüchliche Status-Signale** — Coverage 0 % + „FULLY SUPPORTED“, Delivery „ALL ARTEFACTS PRESENT“ vs SOP NOT GENERATED, TCO „-Infinity%“. Vertrauen bricht hier, Aufwand klein (Zustandsregeln).
2. **Primary-CTAs der Schritte 5–7** — Proceed nicht fill, solange Empty-State sichtbar (Testing, Documentation). Verhindert stilles Überspringen. Aufwand klein.
3. **Dashboard-Hierarchie** — Projekt über Examples, „N/A“/tote Database-Sektion zusammenziehen. Erste Session nach dem Login. Aufwand klein.
4. **Analyze-Score-Cluster** — 62 % führen; 0/0/0-Verdict und „Confidence not computed“ als unvollständig, nicht als Ergebnis. Aufwand mittel.
5. **Chrome** — Banner raus nach Dismiss, Quota 1×, Ask-AI 1×, Footer nicht im Workflow. Jeder Schritt gewinnt Viewport. Aufwand klein.
6. **Transformation Target-Pane** — Datei als Code, nicht JSON-Dump; Insights über den Fold. Das ist der Beweis-Screen. Aufwand mittel.
7. **TCO-Stepper + KPI-Gewichtung** — Stepper auf Analyze; degenerate Zahlen nicht als Dark-Hero. Sonst killt die Nebenansicht den Analyze-Report. Aufwand klein.
8. **Documentation Overlay „4 Issues“ + aktive Export/Regenerate auf Leer** — in den Header / ghosten. Aufwand klein.
9. **Phone: Knowledge-Tabelle, Analyze-Evidence-Rows, Transformation-Pane-Toggle** — sonst sind drei Entscheidungsartefakte auf 390 px unbenutzbar. Aufwand mittel.
10. **Settings-Phone-Order + Plan-Karten fusionieren** — Legal nicht als Einstieg. Aufwand klein.

Nicht anfassen: Knowledge Desktop, Delivery-Board-Preview (Inhalt), Landing-Proof 21/17/4, Settings Danger Zone, Desktop-Stepper-Form (nur TCO-Binding ist falsch).
