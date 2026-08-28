# UX-Benchmark — glm-5v-turbo

**Modell:** `z-ai/glm-5v-turbo` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 47072 prompt / 6266 completion · 211s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

Hier ist das Design-Audit für **Clean-Core.io**. Der Fokus liegt darauf, die bestehende starke Designsprache (Emerald/Slate, technische Klarheit) zu schärfen, ohne das Fundament zu zerstören. Ziel ist es, den Nutzer – typischerweise ein entscheidungstragender SAP-Architekt – schneller zur Einsicht und zum nächsten Workflow-Schritt zu führen.

---

### 01. Landing Page (Marketing & Onboarding)
**BEFUND:**
Die Seite ist extrem lang ("Long Scrolling"). Während der Hero ("The SAP Architect's Clean Core Accelerator") und die Transformation Showroom-Section (Code-Vergleich) stark sind, gehen die dazwischenliegenden Sektionen ("Nobody can say...", "How we complement...") im Textfluss unter. Besonders auf dem Desktop wirkt die Seite wie ein "Wall of Text" mit vielen gleichwertigen Blöcken. Der Nutzer verliert den **Faden des Versprechens** (SAP-Modernisierung) zwischen allgemeinen Marketingaussagen.

**VORSCHLAG:**
1.  **Sticky Value-Prop Bar:** Eine schmale, sticky Leiste unter dem Header, die den Kernnutzen wiederholt ("Free Community Edition • 5 Transformations included • No Credit Card") und den primären CTA ("Go to Workspace") permanent verfügbar macht.
2.  **Visual Anchors für Sektionen:** Nutze das bestehende Label-System (VERSALIEN), um Sektionen nicht nur mit Text, sondern mit **Iconografie + Kurz-Label** (z.B. `01 | INTELLIGENCE`, `02 | STRATEGY`) zu verankern. Das hilft beim Scannen der langen Seite.
3.  **Mobile "Kompatibilitäts-Tabelle":** Die Tabelle "HOW WE COMPLEMENT YOUR SAP TOOLS" ist auf dem Phone eine endlose Liste von Zeilen. Wandele dies in **filterbare Chips/Karten** um (z.B. "Showing 6 of 24 tools"), um die Länge zu reduzieren.

---

### 02. Dashboard (Workspace)
**BEFUND:**
Guter Einstiegspunkt. Allerdings konkurriert das aktive Nutzprojekt (`ZCREDIT_CHECK`) visuell zu stark mit den "Try with an Example"-Karten. Das eigene Projekt sieht aus wie eine Tabellenzeile, die Beispiele wie empfohlene Produkte. Der Status "Documentation (95%)" ist ein wichtiger Fortschrittswert, aber zu dezent platziert.

**VORSCHLAG:**
1.  **Aktives Projekt als "Hero-Card":** Hebe das aktuelle Projekt (`ZCREDIT_CHECK`) deutlich von den Beispielen ab. Gib ihm einen subtilen linken Rand in **Emerald-Grün** (Signalfarbe für "Aktiv/Fortlaufend") und eine größere Höhe, sodass der Fortschrittsbalken (95%) dominant wirkt.
2.  **Beispiel-Karten kompaktieren:** Auf dem Phone sind die Beispiel-Karten (mit Beschreibungstext) zu hoch. Reduziere sie auf: **Titel | Tag (Lines) | Action-Arrow**. Den Beschreibungstext nur bei "Tap" oder Hover anzeigen (Progressive Disclosure).

---

### 03. Analyze (Code Analysis)
**BEFUND:**
Dieser Screen ist informationsreich (Data-Heavy), was gut ist. Der **Clean Core Score (62%)** ist der perfekte "North Star" für den Nutzer. Das Problem: Er ist nur eine von vielen Karten. Darunter folgen Tabs ("Decision & Evidence", "Gaps Backlog"), die wie eine Unternavigation aussehen, aber wie Inhalt wirken. Der "Plain English Guide" (unten, dunkel) ist der wertvollste Teil für die Entscheidungsfindung, steht aber fast am Ende der Seite ("Below the Fold" auf kleineren Viewports).

**VORSCHLAG:**
1.  **Score als Anker:** Mache den "Clean Core Score" (62%-Kreis) zum **visuellen Zentrum** dieses Screens. Die anderen Karten (Extensibility Router, Analysis Summary) sollten sich optisch *um* diesen Score herumgruppieren (vielleicht 2-Spalter mit Score links, groß, Details rechts).
2.  **"Plain English Guide" aufwerten:** Dieser Block ("What to Do") ist der "So What?". Er darf nicht aussehen wie eine weitere Detailkarte. Gib ihm eine **andere Hintergrundfarbe** (sehr helles Slate/Grau `#F8FAFC` oder einen subtilen Dot-Pattern) und platiere ihn **direkt unter dem Score**, bevor die technischen Details (Evidence Findings) kommen. Reihenfolge: Score -> Handlungsempfehlung -> Technische Beweise.
3.  **Mobile Tabelle (Evidence Findings):** Die Tabelle mit Pattern/Lines/Severity ist auf dem Phone schwer scannbar. Wandele Zeilen in **kleine "Finding Cards"** um: Oben das Pattern (fett), darunter der Code-Snippet (mono, klein), daneben das Severity-Tag (rot/gelb/grün).

---

### 04. Design (Loading/Processing)
**BEFUND:**
Ein klassischer Skeleton-State ("Designing Solution..."). Er kommuniziert, dass geladen wird, aber nicht *was* genau passiert oder wie lange es dauert. Bei KI-generierten Prozessen (die hier vermutet werden können) entsteht schnell Ungeduld.

**VORSCHLAG:**
1.  **Contextual Micro-Copy:** Ändere den Subtext von "Architecting solution design..." in etwas Aktiveres mit Zeitbezug, z.B.: **"Analyzing dependencies against Clean Core guidelines… (approx. 20s)"**.
2.  **Staggered Animation:** Lass die Skeleton-Bars nicht alle gleichzeitig pulsieren, sondern nacheinander (Top-Down-Welle). Das suggeriert systematisches Arbeiten und reduziert die wahrgeneigte Wartezeit.

---

### 05. Transformation (Code View)
**BEFUND:**
Sehr starker Side-by-Side-Vergleich auf dem Desktop. Auf dem **Phone** jedoch wird der Kontext zum Altcode (ABAP) verloren, weil der Nutzer erst durch den ABAP-Code scrollen muss, bevor er das TypeScript-Ergebnis sieht. Der direkte "Aha!"-Effekt ("Mein `SELECT` wurde zu einem `const`") geht verloren. Die "Transformation Insights" unten sind gut, nehmen aber wertvollen Platz weg.

**VORSCHLAG:**
1.  **Mobile "Interleave" oder "Overlay":** Statt vollem Stack (erst ABAP, dann TS), betrachte für Mobile einen **geteilten View** (Oben ABAP, unten TS) mit synchronem Scrollen (wenn möglich) ODER einen **Toggle-Modus** ("Show Source" / "Show Target"), bei dem die jeweilige Zeilennummerierung erhalten bleibt, um die Referenz herzustellen.
2.  **Insights einklappbar:** Mache die drei Insight-Karten ("Event-driven...", "TypeORM...", "XSUAA...") auf dem Phone standardmäßig **kollabiert** (nur Titel sichtbar). Das gibt dem Code mehr vertikalen Raum, das Wichtigste auf diesem Screen.

---

### 06. Testing & Sandbox
**BEFUND:**
Der Screen hat viele Schaltflächen: "Mock Environment", "Connected Tenant", "Generate Suite". Der Nutzer muss entscheiden: Wo starte ich? Der leere Zustand ("Generate Your Test Suite") dominiert, ist aber passiv. Die drei Info-Karten oben (Reni Sandbox, Mock Library, Coverage) sind hilfreich, wirken aber eher wie statische Infos als wie interaktiv wählbare Modi.

**VORSCHLAG:**
1.  **Environment Selection als Primary Step:** Mache die Auswahl der Umgebung (Mock vs. Connected) zu einer **klaren Segmented Control** (wie Radio-Buttons), nicht zu zwei losen Buttons.
2.  **Hero-CTA for Generation:** Der Button "GENERATE TEST SUITE" ist der wichtigste Hebel. Platziere ihn **innerhalb** des weißen Leerzustands-Bereichs (der Terminal-Graphik) als großer, gruner Floating Action Button oder zentriertes Element, nicht nur als kleines Label oben. Der Text soll lauten: **"Initialize Test Environment"** (aktiver als "Generate Suite").

---

### 07. Documentation (Process Blueprint)
**BEFUND:**
Reiner Empty State ("No enterprise specifications yet."). Der Button "START ARCHITECTURAL MAPPING" ist da, aber der Grund, warum dieser Schritt notwendig ist (Verknüpfung von Code zur Business-Domäne), ist nicht intuitiv. Der Nutzer könnte denken: "Ist das fehlerhaft?" oder "Habe ich etwas vergessen?".

**VORSCHLAG:**
1.  **Reassurance Copy:** Ergänze im leeren Bereich einen Satz, der den **Input aus dem vorigen Schritt** validiert: *"We have analyzed your code structure. Now we map it to business processes to ensure compliance."*
2.  **Visuelle Brücke:** Zeige ein kleines Icon oder Mini-Preview (z.B. "3 Modules detected from Transformation Step"), um zu signalisieren: "Wir haben Daten, wir warten nur auf deinen Start."

---

### 08. Delivery (Project Handover)
**BEFUND:**
Sehr guter Abschluss-Screen. Die "Integrity Report" (rechts, dunkel) ist exzellent positioniert als "Proof of Work". Die "Board Presentation" (Preview) ist ein schönes "Delight"-Feature. Auffällig: Die "SOP & Compliance"-Karte ist ausgegraut ("NOT GENERATED"). Das kann frustrieren, wenn der Nutzer nicht weiß, *warum*.

**VORSCHLAG:**
1.  **Tooltip/Hint für Disabled States:** Bei "SOP & Compliance (Not Generated)" füge einen kleinen **Info-Hinweis** hinzu (oder ändere den Text zu: *"Requires manual sign-off"*), damit klar ist: Das ist kein Fehler, sondern ein Prozessschritt.
2.  **Download Bundle prominence:** Der grüne "DOWNLOAD BUNDLE"-Button in der ersten Karte ist perfekt. Stelle sicher, dass dieser Button auch **immer sichtbar** (sticky bottom) ist, sobald der Nutzer auf diesem Screen scrollt, um die Dokumente zu prüfen.

---

### 09. TCO & Upgrade-ROI Analysis
**BEFUND:**
Finanzdaten. Die Inputs (Slider) sind interaktiv. Die Ausgabe (Savings: -€1,550) ist grün und groß (gut). Der Vergleich "Pre-Modernization" (Rot) vs. "Post-Modernization" (Grün) ist logisch, aber visuell noch zu "brav". Besonders die Tabelle darunter (Adaption Maintenance €0 vs. €900) trägt das Argument, aber die Zahlen wirken gleich groß.

**VORSCHLAG:**
1.  **Emotionaler Kontrast:** Mache die **negativen Kosten (Legacy)** in der Tabelle deutlich größer/fetter oder nutze ein **durchgestrichenes Icon**, während die modernen Kosten (Clean Core) kompakter und "sauberer" wirken.
2.  **Chart-Annotation:** Beim 5-Jahres-ROI-Chart: Füge eine **Annotation bei Year 1** ein (z.B. "Break-even"), um den Zeitpunkt des "Return on Investment" greifbarer zu machen.

---

### 10. Knowledge Hub (Reference)
**BEFUND:**
Sehr textlastig. Die "Extensibility Paradigm Comparison" (Tabelle: In-App RAP vs. Side-by-Side CAP) ist der wohl wichtigste Content für die Zielgruppe (Entscheider). Auf dem Desktop okay, auf dem **Phone** eine horizontale Scroll-Falle (man muss wischen, liest dabei schlecht).

**VORSCHLAG:**
1.  **Responsive Table zu Cards:** Wandele die Vergleichstabelle auf Mobile in eine **Karten-Ansicht** um:
    *   *Karte 1:* "Feature: Runtime Environment"
        *   *Links (RAP):* Inside SAP...
        *   *Rechts (CAP):* Node.js / Java...
2.  **Sticky Summary:** Der "Quick Answer" Block (ganz oben, "What is the SAP Clean Core approach...") ist goldwert. Mache diesen Bereich **sticky** auf dem Desktop, wenn man durch die FAQs scrollt, oder biete einen "Back to Top Quick Answer" Link an.

---

### 11. Settings (Profile)
**BEFund:**
Standard-Formular-Layout. Auf dem Desktop: Links Formulare, rechts Info-Cards. Auf dem Phone: Info-Cards zuerst (macht Sinn für Kontext), dann Formulare. Der "Danger Zone" (Account löschen) ist rot, gut sichtbar.

**VORSCHLAG:**
1.  **Gruppierung nach Vertrauen:** Die Sektion "Security & Access" (2FA, Passwort) und "Bring Your Own Key" (API Key) sind kritisch für Enterprise-Nutzer. Hebe diese Gruppe durch einen **leichten Hintergrundcontainer** (hellgrau) ab, um sie von trivialeren Einstellungen (Theme, Chatbot) abzugrenzen.
2.  **Success Feedback:** Wenn der Nutzer "Save Preferences" oder "Save API Key" klickt, muss das Feedback (Toast/Alert) sehr deutlich sein ("Key secured successfully"). Im Screenshot sieht man nur den Button.

---

### Priorisierte Maßnahme-Liste (Wirkung vs. Aufwand)

| # | Maßnahme | Screen | Wirkung | Aufwand |
|---|----------|--------|---------|---------|
| **1** | **"Plain English Guide" in Analyse aufwerten (Position & Styling)** | 03-Analyze | **Sehr Hoch** (Entscheidungssicherheit) | Gering (CSS/Layout) |
| **2** | **Knowledge-Tabelle responsive umbauen (Cards)** | 10-Knowledge | **Hoch** (Usability Mobile) | Mittel (HTML/CSS Refactor) |
| **3** | **Dashboard: Eigenes Projekt als "Active Hero" stylen** | 02-Dashboard | **Hoch** (Orientierung) | Gering (CSS Classes) |
| **4** | **Transformation Mobile: Code-Referenz sichern (Sync/Toggle)** | 05-Transform | **Hoch** (Verständnis) | Mittel (JS Logic) |
| **5** | **TCO: Kostenvergleich visuell dramatisieren** | 09-TCO | **Mittel** (Persuasion) | Gering (Typography/Color) |
| **6** | **Global: Workflow-Stepper sticky machen** | Alle Workflow-Screens | **Mittel** (Orientierung) | Gering (Position: sticky) |
| **7** | **Testing: Generate-CTA dominantieren (Hero-Button)** | 06-Testing | **Mittel** (Conversion) | Gering (Layout) |
| **8** | **Landing: Sticky Header mit CTA** | 01-Landing | **Mittel** (Acquisition) | Gering (Header CSS) |
| **9** | **Settings: Security-Grouping visualisieren** | 11-Settings | **Niedrig-Mittel** (Trust) | Gering (Container) |
| **10** | **Delivery: Disabled-States erklären (Tooltips)** | 08-Delivery | **Niedrig** (Support) | Gering (Attribute) |

**Fazit:** Die Anwendung ist solide gebaut. Der größte Hebel liegt darin, den **"Plain English Guide"** im Analyse-Schritt (03) prominenter zu platzieren und die **Mobile-Erfahrung** bei datenintensiven Views (Knowledge, Transform, Analyse) von "funktionierend" zu "führend" zu heben.
