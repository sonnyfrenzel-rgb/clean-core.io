# UX-Benchmark — glm-5v-turbo

**Modell:** `z-ai/glm-5v-turbo` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 47284 prompt / 8000 completion · 125s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

Hier ist die zweite Runde — keine Bestandsaufnahme mehr, sondern Gestaltungsentscheidungen, die die Überzeugungskraft für **SAP-Basis-Architekten** und **Fachbereichsleiter** (die beiden Kaufentscheider) erhöhen. Die Zielgruppe liest nicht, sie scannt nach Beweisen gegen ihre spezifischen Ängste: „Was mache ich mit meinem 15 Jahre alten Custom-Code?“, „Wie erkläre ich das dem Steering Committee?“

---

## A) LANDINGPAGE — 6 konkrete Eingriffe

### 1. Der Hero braucht ein „Evidence-Strip“ unter den CTAs
**Was du siehst:** Headline *„The SAP Architect’s Clean Core Accelerator“*, Subline über generierte Entwürfe, zwei Buttons (*Open Workspace* / *Read Whitepaper*), dann erst der nächste Block (*Quick Answer*).
**Die Änderung:** Füge direkt unter die beiden Buttons einen **flachen, 48 px hohen Informationsstreifen** ein (Hintergrund `slate-50`, Rahmen oben `slate-200`). Inhalt: Ein einziger, harter Wert aus der Plattform – z. B. *„62% durchschnittlicher Clean Core Score bei ersten Analysen“* oder *„4 von 7 Workflow-Schritten voll automatisiert“*. Der Text steht in `slate-600`, Mono-Label (Versalien) links, Zahl rechts in Emerald (`text-emerald-600`, `font-semibold`, `text-xl`).
**Warum das zieht:** SAP-Architekten sind datengesteuerte Skeptiker. Sie müssen innerhalb der ersten 500 ms sehen, dass hier kein Marketing-Sprech, sondern messbare Ingenieursleistung folgt. Der Strip bricht die abstrakte Versprechen-Ebene und verankert die Plattform in Realität – bevor der User überhaupt scrollt.

### 2. Die „Unknowns“-Karte hochziehen und zum Decision-Matrix-Widget machen
**Was du siehst:** In der Mitte der Seite (ca. Scroll-Position 1200 px) eine dunkle Karte: *„Nobody can say what this program does.“* Darin die Aufteilung *21 RETIRED | 17 YOUR CALL | 4 HANDWORK*.
**Die Änderung:** 
- **Position:** Diese Sektion auf **Scroll-Position 3** schieben (direkt hinter das Produkt-Video/Carousel, vor das Feature-Grid).
- **Visuell:** Aus der flachen dunklen Box wird ein **Dashboard-Widget** mit drei Spalten. Jede Zahl (`21`, `17`, `4`) wird auf **48–56 px** vergrößert, Farbe Emerald (`text-emerald-400`), Schriftart Mono. Die Labels darunter bleiben Versalien (`RETIREDD`, `YOUR CALL`, `HANDWORK`), aber in `slate-400`, `tracking-widest`. Hintergrund bleibt `slate-900`, aber mit einem subtilen Rastermuster (`opacity-5%`, `slate-700`), das an technische Zeichnungen erinnert.
- **Interaktion:** Die drei Zahlen werden **klickbar** (Cursor-Pointer). Bei Hover erscheint ein Tooltip mit einem Beispiel aus dem ABAP-Kontext (z. B. „21 Module sind SAP-Standard-Funktionalität, die automatisch gemappt wird“).
**Warum das zieht:** Das ist die **schmerzhafteste Frage** jedes SAP-Modernisierungsprojekts: „Wo fange ich an, wo höre ich auf?“. Diese Sektion antwortet darauf mit Kategorien statt mit Floskeln. Indem du sie prominenter platzierst und technischer gestaltest, signalisierst du: „Wir haben uns mit deiner Unsicherheit auseinandergesetzt.“

### 3. Feature-Grid in „Capability Clusters“ umbauen
**Was du siehst:** Sektion *„What You Can Do Today“* – sechs gleichwertige Karten (Extensibility Routing, Cloudification Catalog, Dual RAP/CAP Engine, Modernization Assessment, Compliance Evidence, BPMN 2.0).
**Die Änderung:** 
- **Gruppierung:** Teile die sechs Karten in **zwei visuelle Cluster**:
  - **Oben/Links (Cluster A): Analyse & Strategie** = *Modernization Assessment* + *Compliance & Audit Evidence* + *Extensibility Routing*. Badge oben rechts an jedem Cluster: kleines Emerald-Dot mit Label `STRATEGY`.
  - **Unten/Rechts (Cluster B): Execution & Delivery** = *SAP Cloudification Catalog* + *Dual RAP & CAP Engine* + *BPMN 2.0 Procedures*. Badge: Emerald-Dot mit Label `EXECUTION`.
- **Layout:** Desktop: 2 Spalten (nicht 3). Jeder Cluster hat eine gemeinsame Kopfzeile (die Cluster-Bezeichnung in `slate-500`, `uppercase`, `text-xs`, `tracking-widest`). Darunter die Karten im 1×3- oder gestapelten Layout innerhalb des Clusters.
- **Gewichtung:** Die Strategie-Karten bekommen ein **Icon oben links** (aus der bestehenden Icon-Sprache), die Execution-Karten ein **Code-Schnipsel-Preview** als Miniatur (2 Zeilen TypeScript, `font-mono`, `text-xs`, `bg-slate-900`, `text-emerald-400`, gerundet).
**Warum das zieht:** Zwei verschiedene Personen lesen diese Seite: Der **Enterprise Architect** (sucht nach Assessments, Governance, Risiken) und der **Lead Developer** (sucht nach Engines, APIs, Deployment-Patterns). Das aktuelle 3×2-Grid zwingt beide, alles zu scannen. Durch die Clusterung finden sie ihren Einstiegspunkt sofort.

### 4. Die „Complement“-Sektion von Dokumentation zur Integrationskarte
**Was du siehst:** Lange Liste *„How We Complement Your SAP Tools“* mit neun Zeilen (Clean Core Violation Scanning, Static Check, Automated, Interaktiv, etc.), jede mit Beschreibungstext.
**Die Änderung:** 
- **Reduktion:** Entferne alle Fließtext-Beschreibungen aus der Hauptansicht. Behalte nur die **fetten Titel** (z. B. *Clean Core Violation Scanning*) und das Ergebnis-Label rechts (z. B. *Automated* oder *Validated* in Emerald).
- **Visuelle Metapher:** Ordne die neun Punkte als **3×3-Matrix** an (oder als horizontale Flow-Linie). Jedes Element ist eine kleine weiße Karte (`rounded-2xl`, `border-slate-200`). Oben das Icon/das SAP-Tool-Symbol (grau), mittig der Capability-Name (schwarz, `font-medium`), unten ein Status-Indicator (Emerald-Punkt für „automatisiert“, Slate-Punkt für „manuell konfigurierbar“).
- **Detail-On-Demand:** Bei Klick öffnet sich ein **Inline-Expand** (nicht neue Seite!) mit genau dem Text, der vorher da stand.
**Warum das zieht:** Aktuell wirkt dieser Abschnitt wie eine Spezifikations-Tabelle – er tötet den Lesefluss. Er muss in **3 Sekunden scannbar** sein: „Ah, die Platform integriert sich in meine bestehende SAP-Toolchain und automatisiert X, Y, Z.“

### 5. Transformation Showroom mit dem Analyse-Screen verbinden
**Was du siehst:** Zwei getrennte Blöcke: Erst *„Deep Code Intelligence“* (mit Carousel des Analyse-Reports), später *„Transformation Showroom“* (mit Code-Beispielen).
**Die Änderung:** Fasse beide zu einer **Story-Arc-Sektion** zusammen:
- **Oben (40% Höhe):** Der **Business Analysis Report** (der grüne Screen aus Screenshot 03) – aber als **eingefrorenes Dashboard**, nicht als Karussell. Man sieht den 62%-Score, die Verdicts.
- **Darunter (60% Höhe):** Eine **visuelle Pfeil-Verbindung** (Emerald, `stroke-width: 2`, `dashed`optional) führt vom Report hinab zu den **beiden Code-Editoren** (ABAP links, TypeScript rechts) – exakt wie im Transformation-Screen (05).
- **Beschriftung:** Zwischen Report und Editors: Ein kleines Label `↓ TRANSFORMATION OUTPUT` in Mono, Emerald.
**Warum das zieht:** Du zeigst den **vollständigen causal chain**: Input (ABAP) → Analyse (Report, Score) → Output (TypeScript). Das ist der Beweis, dass die Platform nicht nur analysiert, sondern auch synthetisiert. Getrennte Blöcke suggerieren zwei verschiedene Produkte.

### 6. Mobile: Sticky Conversion-Bar statt verschüttelter CTAs
**Was du siehst (Phone):** Hero-Section, dann *Quick Answer*-Accordion (nimmt 30% des Viewports ein), dann weitere Inhalte. Der primäre CTA (*Open Workspace*) ist beim ersten Scroll sofort weg.
**Die Änderung:** 
- **Sticky Bottom Bar:** Auf Mobile (< 768 px) bekommt der primäre CTA (*Open Workspace*) eine **fixed-position Bottom-Bar** (`position: fixed; bottom: 0; left: 0; right: 0; height: 64px; bg-white; border-top: 1px solid slate-200; z-index: 50`). Button full-width, Emerald, `rounded-none` (oder nur obere Ecken gerundet). Text: *„Start Free Analysis“* (aktionsorientierter als *Open Workspace*).
- **Quick Answer kollabieren:** Der Accordion-Block wird auf Mobile **standardmäßig geschlossen** angezeigt. Nur die Überschrift *„Quick Answer“* ist sichtbar, mit einem Chevron-Icon. Bei Tap expandiert.
- **Secondary CTA:** *Read Whitepaper* wandert in die Top-Nav (als Text-Link neben dem Logo) oder wird unter den Hero-Subtitle geschoben (Text-Link, unterstrichen, `slate-600`).
**Warum das zielt:** Mobile-Nutzer bei Enterprise-Software sind oft in Besprechungen oder zwischen Terminen. Sie brauchen **sofortigen Zugriff** auf die Conversion-Action, ohne wieder nach oben scrollen zu müssen. Die aktuelle Mobile-Struktur versteckt die wichtigste Aktion hinter Content, den man noch nicht lesen will.

---

## B) WORKFLOW — Die 3 stärksten Querschnitts-Vorschläge

### 1. Analyze-Screen: Der Score als Navigationsanker (Screenshot 03)
**Status quo:** Der *Clean Core Score* (62 %) ist ein Kreisdiagramm in einer dunklen Karte links neben dem *Extensibility Router* und der *Analysis Summary*. Er ist eines von mehreren Widgets.
**Der Vorschlag:** Mache den **Score zum visuellen Zentrum dieses Schrittes**:
- **Größe:** Vergrößere die Score-Karte auf **mindestens 320 px Breite** (Desktop) bzw. **volle Breite** (Mobile).
- **Typografie:** Die Zahl `62%` auf **64–72 px**, `font-bold`, Farbe `emerald-400`. Darunter `Compliance` in `slate-400`, `uppercase`, `text-xs`. Den Kreis behalten, aber dünner (`stroke-width: 6`), Farbe `emerald-200` für den Track, `emerald-500` für den Fortschritt.
- **Verknüpfung:** Unter dem Score platziere **drei Click-Filter-Chips** (aus der aktuellen *Coverage Verdict*-Sektion): `FULLY SUPPORTED` (Emerald), `REVIEW REQUIRED` (Amber), `OUT OF SCOPE` (Slate). Diese Chips steuern die **Evidence Findings-Tabelle** darunter (Filterung nach Schweregrad).
- **Mentalmodell:** Der Benutzer sieht zuerst das **Urteil** (der Score), dann kann er in die **Details** (die Tabelle) drillen. Aktuell wirken Score und Tabelle wie zwei unabhängige Berichte.
**Implementierungshinweis:** CSS-Grid: Score oben 1fr, Filter-Chips darunter auto, Evidence-Tabelle unten 2fr. Auf Mobile: Score → Chips → Tabelle vertikal gestapelt.

### 2. Transformation-Screen: Inline-Diff & Context-Persistenz (Screenshot 05)
**Status quo:** Seitenansicht: Links ABAP-Code, rechts TypeScript-Code. Sync-Scroll ist an. Ein gelber Hinweis *„Strict Legacy Mode: Exact ABAP SQL query quirks preserved“* ist im rechten Editor als Kommentar versteckt.
**Der Vorschlag:**
- **Diff-Highlighting (subtil):** Füge **Zeilen-hintergrund-Farben** hinzu (innerhalb der bestehenden Palette):
  - **Entfernte ABAP-Zeilen:** `bg-red-950/10` (sehr dunkles Rot, fast Schwarz-Rot), `text-slate-500` (durchgestrichen via `line-through`).
  - **Hinzugefügte TS-Zeilen:** `bg-emerald-950/15` (dunkles Grün), `text-emerald-100`.
  - **Modifizierte Logik (Mapping):** `bg-amber-950/10` (dunkles Amber).
  Wichtig: Keine hellen Farben (kein rotes `#ff0000`), alles bleibt im **Dark-Mode-Kontext** (`slate-950` Background der Editoren). Das wirkt professionell, nicht wie ein Git-Client aus 2015.
- **Context-Pill extrahieren:** Den *Strict Legacy Mode*-Hinweis aus dem Code herausziehen und als **persistente Leiste zwischen den beiden Editoren** platzieren (vertikal zentriert, `bg-slate-800`, `text-xs`, `mono`, `rounded-full`, `px-3`, `py-1`). Icon links (Warnung oder Info). So weiß der User immer, in welchem Modus er sich befindet, ohne im Code suchen zu müssen.
- **Dateiname hervorheben:** Oben in jeder Editor-Leiste (*LEGACY SOURCE (ABAP)* / *MODERNIZED TARGET*) den aktuellen Dateinamen (`Z_CREDIT_CHECK` / `service.ts`) in **Emerald** (`text-emerald-400`) einfärben, den Rest in Slate. Das schafft Orientierung.
**Warum das zieht:** Transformation ist der Moment der Wahrheit. Der User muss **auf einen Blick** sehen: „Das ist nicht Magie, das ist Mapping – und hier ist die Logik, die dabei herauskommt.“ Der extrahierte Context reduziert kognitive Last („In welchem Modus bin ich?“).

### 3. Delivery-Screen: Die Board-Presentation zum Hauptact (Screenshot 08)
**Status quo:** Der *Project Handover* zeigt vier Karten nebeneinander (Delivery Bundle, Stakeholder Briefing, SOP & Compliance, Developer Guide) plus eine dunkle *Integrity Report*-Karte rechts. Ganz unten, fast als Fußnote, die *Board Presentation* (Slide-Vorschau 1/7).
**Der Vorschlag:** Drehe die Gewichtung um:
- **Hauptarea (Hero dieses Screens):** Die **Board Presentation** wird zum **zentralen Canvas**. Zeige sie in einer **16:9-Frame-Rahmung** (wie ein Präsentationsfenster) mit Schatten (`shadow-2xl`, `rounded-2xl`). Darin der Slide-Inhalt (*Clean-Core Transformation Briefing*). Navigationspfeile links/rechts am Frame, Seitenzahl (1/7) unten mittig.
- **Toolbar oberhalb des Frames:** Platziere die Export-Actions (**Export BPMN**, **Export Confluence**, **View Slides**, **Download Bundle**) als Button-Group **oberhalb des Presentation-Frames** (nicht in separaten Karten verteilt). So entsteht der Eindruck: „Dies ist dein Lieferobjekt, dies sind die Exportoptionen.“
- **Integrity Report als Sidepanel:** Die dunkle Integritäts-Karte (mit den Checkmarks: Transformed CAP Structure, Automated Sandbox Tests, etc.) wandert in eine **kollabierbare Sidebar rechts** (Desktop) oder **Akkordeon unten** (Mobile). Sie wird zum **Audit-Trail**, nicht zum Konkurrenten der Präsentation.
- **Rationalisierung:** SOP & Compliance und Developer Guide werden zu **Tabs unterhalb des Presentation-Frames** (oder Secondary Actions in der Toolbar), um die vier verteilten Karten aufzulösen.
**Warum das zielt:** Das Endprodukt eines SAP-Architekten ist **nicht Code**, es ist die **Steering Committee-Präsentation**. Wenn die Platform diesen Output als Krönung des Workflows inszeniert (und nicht als Fußnote), adressierst du die tatsächliche Erfolgsmetrik des Users: Akzeptanz beim Management.

---

## C) EIN MUTIGER VORSCHLAG

### Der „Verification Rail“ — Persistenter Audit-Trail über alle Schritte

**Die Idee:** Füge eine **schmale, fixierte Leiste (72 px breite) am rechten Rand** (Desktop) bzw. **ein Bottom Sheet** (Mobile) ein, der **über alle 7 Workflow-Schritte (und Dashboard) hinweg persistent** bleibt.

**Inhalt des Rails:**
Eine vertikale Timeline aus kleinen Kreisen (24 px Diameter):
- **Abgeschlossen:** Gefüllt in Emerald (`bg-emerald-500`), weißer Checkmark darin.
- **Aktiver Schritt:** Pulsierender Ring in Emerald (`animate-pulse`, `ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-100`).
- **Ausstehend:** Leer, `border-2 border-slate-300`, `bg-white`.

Jeder Punkt hat bei Hover/Focus ein **Popover/Tooltip** (links davon, nicht rechts – der Platz ist ja beschränkt) mit:
- Schritt-Name (z. B. *„03 – Code Analysis“*)
- Status-Text (z. B. *„62% Score calculated“* oder *„Solution architecture generated“*)
- Zeitstempel (wann wurde der Schritt abgeschlossen?)
- Ein **„Jump-to“-Link** (Klick springt zur entsprechenden Sektion).

**Warum das mutig, aber richtig ist:**
- Es verwässert **nicht** das Design-System (nutzt existierende Emerald/Slate/Circle-Sprache).
- Es fügt **keine neuen Features** hinzu, macht nur den Status des bestehenden Prozesses sichtbar.
- Es löst ein massives UX-Problem bei Multi-Step-Wizard-Oberflächen: **„Wo bin ich, was habe ich schon erreicht, was kommt als Nächstes?“**
- Für SAP-Architekten (deren Projekte oft Monate dauern) ist dieser **Fortschrittsnachweis** psychologisch wichtig – es reduziert die Angst, den Überblick über einen komplexen Migrationsprozess zu verlieren.
- **Diskussionsrisiko:** „Ist das nicht zu viel Bildfläche auf 1440 px?“ Gegenargument: Auf 1440 px sind 72 px rechts akzeptabel (5% der Breite), und die Leiste ist default kollapsed (nur Icons). Auf Mobile ist das Bottom Sheet ohnehin nur auf Tap sichtbar. Der Nutzen (Orientierung, Vertrauen durch Transparenz) überwiegt den Platzverbrauch.

**Implementierungshinweis:** Fixed positioning, `z-index: 40` (unter dem Header, über dem Content). Auf Screens, wo es nicht sinnvoll ist (Landingpage, Knowledge Base), per CSS-Class `.hide-rail` ausblenden.

---

## D) WAS DU NICHT ANFASSEN
