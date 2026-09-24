# DESIGN.md — Clean-Core.io

**Version 1.5 · 24.09.2026 · abgenommen von Sonny · verbindlich für alles, was zur Oberfläche von 3.0 gehört** (Roadmap-Schritte 1.4–1.7,
Phasen 2–8, 3.0). Das Zielbild zeigen die Mockups
[`docs/roadmap/clean-core-mockups-v2_8.html`](docs/roadmap/clean-core-mockups-v2_8.html). Entscheidungen mit Datum
und Begründung stehen im Entscheidungslog [`docs/design/decisions.md`](docs/design/decisions.md); diese Datei sagt
nur, was gilt. Bei Widerspruch: `docs/ROADMAP.md` für Umfang und Reihenfolge, diese Datei für Aussehen, Struktur und
Verhalten. **Verweise:** `§5.1` ist ein Abschnitt dieser Datei, „Roadmap 2.8" oder „Schritt 2.8" ein Schritt in
`docs/ROADMAP.md`.

Die Leitlinie in einem Satz: **SAP-Fiori-Muster übernehmen, das Fiori-Theme nicht** (ADR-001). Was die SAP-Community
„zu Hause" fühlen lässt, sind Floorplans, Interaktionsmuster und Vokabular — nicht Farben und die Schrift „72". Der
Look bleibt der von Clean-Core.io.

**Zwei Räume, ein Look.** Die öffentlichen Seiten (Landing, Wissen, Whitepaper) behalten ihre großzügige Ästhetik —
große Radien, Mesh-Hintergrund, grüne Akzente. Der **Arbeitsraum** ist ein Werkzeug: dicht, ruhig, und Grün heißt dort
nur eines — belegt. **Ein Look heißt: dieselben Tokens überall** (ADR-051) — auch öffentliche Seiten färben nur mit
`--cc-*`-Tokens, nie mit der Tailwind-Palette oder Hex-Literalen; auch die Mesh-Farben der Landing sind Tokens. Was
nur öffentlich gilt, sind die großen Radien (§1.4), Mesh und Raster als Hintergrund und `--cc-space-7`.

---

## 1. Look & Feel

Heute spricht die App zwei Farbdialekte (Tailwind `green-600`/`gray-950` und `#006b2c`/`#00873a`/`#0b1c30`), 78
Button-Stile und Schrift bis hinunter auf 8 px. Das wird ein Satz **semantischer Tokens** in `app/globals.css`
(`@theme`); neue Komponenten verwenden nur diese. Das gilt für jede Seite — Arbeitsraum, Stufen, Konto und
öffentliche Seiten (ADR-051).

### 1.1 Farbe

Alle Paare unten sind nachgerechnet (WCAG 2.2, relative Leuchtdichte); der Kontrast-Guard (§8) rechnet sie bei jedem
Build erneut.

| Token | Wert | Wofür | Kontrast |
|---|---|---|---|
| `--cc-page` | `#f8f9ff` | Seitengrund | — |
| `--cc-surface` | `#ffffff` | Karten, Tabellen, Dialoge | — |
| `--cc-surface-muted` | `#f9fafb` | Zeilen, innere Flächen | — |
| `--cc-ink` | `#0b1c30` | Text, Titel; **ausgewählt/aktiv im Arbeitsraum** | 17,2 : 1 auf Surface |
| `--cc-ink-muted` | `#4b5563` | Nebentext | 7,6 : 1 auf Surface |
| `--cc-line` | `#e5e7eb` | Trenner (dekorativ) | — |
| `--cc-field-border` | `#6b7280` | Rahmen von Eingabefeldern | 4,8 : 1 (≥ 3 : 1 nötig) |
| `--cc-brand` | `#16a34a` | Logo, Akzente, Landing — **nie Fläche unter Text** | 3,3 : 1 mit Weiß — zu wenig für Text |
| `--cc-brand-strong` | `#15803d` | Fläche der Primäraktion, grüne Schrift auf Hellgrün | 5,0 : 1 mit Weiß |
| `--cc-brand-deep` | `#006b2c` | Hover/Pressed der Primäraktion, Marken-Verlauf | 6,7 : 1 mit Weiß |
| `--cc-focus` | `#1d4ed8` | Fokusring (§1.6) | 6,7 : 1 auf Surface |

**Semantische Zustände** — die Fiori-Kategorien, auf die eigene Palette gemappt:

| Zustand | Vordergrund | Fläche | Rahmen | Kontrast Vordergrund auf Fläche | Bedeutung |
|---|---|---|---|---|---|
| `success` | `#047857` | `#ecfdf5` | `#a7f3d0` | 5,2 : 1 | **belegt** — nur **Proven**, bestanden, signiert |
| `warning` | `#92400e` | `#fffbeb` | `#fde68a` | 6,8 : 1 | teilweise, Entwurf, Annahme, Simulation, **veraltet (stale)** |
| `error` | `#b91c1c` | `#fef2f2` | `#fecaca` | 5,9 : 1 | fehlgeschlagen, ungültig, abgelehnt |
| `information` | `#1d4ed8` | `#eff6ff` | `#bfdbfe` | 6,2 : 1 | Hinweis, importiert, rekonstruiert, **von einer Person bestätigt** |
| `neutral` | `#4b5563` | `#f9fafb` | `#e5e7eb` | 7,2 : 1 | nicht begonnen, nicht bestimmt |

Drei Regeln, die daraus folgen (ADR-007):

- **Grün heißt belegt — im Arbeitsraum ausschließlich.** Primärbutton, aktiver Reiter, ausgewählte Zeile und Logo sind
  dort nicht grün in einer Weise, die man mit einem Nachweis verwechseln kann: Auswahl und aktive Zustände tragen
  `--cc-ink`, die Primäraktion `--cc-brand-strong` als Fläche mit weißer Schrift (eine Form, die kein Chip hat).
- **Eine Behauptung ist kein Nachweis.** *Confirmed* ist eine Selbstauskunft des Kontos, kein Mandat, und steht
  deshalb in `information` mit Personen-Icon — nie im Grün von *Proven*. Management muss den Unterschied auf einen Blick
  sehen.
- **Veraltet ist nicht falsch.** *Stale* heißt „neu rechnen" und ist `warning`, nie `error`.

**Grenzen, die man sehen muss, haben ≥ 3 : 1** (WCAG 1.4.11). Hier zählt der Rahmen gegen die Fläche, auf der das
Element steht — andere Paare als in der Tabelle oben: Eingabefelder und `ghost`-Buttons `#6b7280` auf Weiß 4,83 : 1;
`secondary`-Buttons `#15803d` auf ihrer Fläche `#f0fdf4` 4,79 : 1; Value States mit Rahmen in der Vordergrundfarbe auf
Weiß — `error` `#b91c1c` 6,47 : 1, `warning` `#b45309` 5,02 : 1 (dunkler Text `#92400e` bleibt für Schrift), `success`
`#047857` 5,48 : 1, `information` `#1d4ed8` 6,70 : 1; ebenso die Rahmen der Umriss- und Strich-Chips (§4). Die hellen Rahmenfarben der Tabelle oben sind nur für Flächen, deren Grenze der Text
trägt (gefüllte Chips, Message Strips).

**Dunkel gibt es genau zweimal** (ADR-028): die **Code-Fläche** `--cc-code-bg` für Quelltext — die einzige dunkle
Fläche für Inhalt — und die **Überlagerung** `--cc-overlay` = `#0b1c30` (Weiß darauf 17,2 : 1) für vorübergehende
Schichten über dem Inhalt: Coach Mark und Toast. Ein gewähltes Segment trägt `--cc-ink` als kleine Fläche; das ist
Auswahl, keine Fläche im Sinne dieser Regel.

**Code-Fläche** für Quelltext (Quellspalte, Aufbau, Code-Karte):

| Token | Wert | Wofür | Kontrast auf `#030712` · auf markierter Zeile |
|---|---|---|---|
| `--cc-code-bg` | `#030712` | Fläche | — |
| `--cc-code-ink` | `#e5e7eb` | Code | 16,3 : 1 · 11,6 : 1 |
| `--cc-code-muted` | `#9ca3af` | Zeilennummern, Kommentare, Auslassung | 7,9 : 1 · 5,6 : 1 |
| `--cc-code-keyword` | `#c4b5fd` | ABAP-Schlüsselwörter | 10,9 : 1 · 7,8 : 1 |
| `--cc-code-literal` | `#fcd34d` | Literale — die Werte versteckter Regeln | 14,0 : 1 · 9,9 : 1 |
| `--cc-code-name` | `#93c5fd` | Aufrufe, FORM-Namen | 11,2 : 1 · 7,9 : 1 |
| `--cc-code-hl` | `rgb(59 130 246 / .28)`, links 3 px `#93c5fd` | markierte Zeile (ergibt `#132952`) | — |

Mehr Syntaxfarben gibt es nicht; die Markierung einer Zeile trägt zusätzlich den linken Balken, nicht nur Farbe.

**Kein Dark Mode** (ADR-003). Ersatz für Nutzer, die ihn aus Sehgründen brauchen: das Produkt respektiert
`forced-colors: active` (Windows-Kontrastdesigns) — Zustände bleiben über Wort, Icon und Form (§4) unterscheidbar,
Fokusringe und Feldgrenzen bleiben sichtbar.

### 1.2 Schrift

- **Inter** (über `next/font`); Monospace für Code, IDs, Zeilenanker und ISO-Datum: `ui-monospace, SFMono-Regular,
  Menlo, Consolas`.
- Skala im Arbeitsraum:

| Rolle | Größe / Gewicht | Beispiel |
|---|---|---|
| Projekttitel (Kopf der Object Page) | 22 px / **800**, `-0.02em` | „Emergency purchase approval" |
| Abschnittstitel (`h2`) | 15 px / **700** | „Process — reconstructed from code" |
| Kartentitel (`h3`) | 14 px / **700** | „Not determined" |
| Fließtext | 14 px / 500, Zeilenhöhe 1,55 | Regeltext |
| Tabellenzelle, Nebentext | 13 px / **500** | Zeilen |
| Object Identifier (Titel) | 13 px / **600** | „Vendor block list validation" |
| Meta/Chip | 12 px / **600** | Chip- und Tag-Text, Metazeile, Hinweis unter einem Feld |
| Mikro-Label | 11 px / **600**, VERSALIEN, `0.08em` | Spaltenköpfe, Facetten-Label |

**Untergrenze 11 px.** Kein Inhalt in Versalien, nur Labels. 900 gibt es im Arbeitsraum nicht — es flacht die
Hierarchie ab. **12 px ist eine eigene Stufe** (ADR-047), nicht die Lücke zwischen 11 und 13: Chips, Kennungen, Tags,
Metazeilen und Feldhinweise, immer 600 — für Fließtext und Tabellenzellen nie. Der Stufenkopf (`StageHeader`) folgt
dem Projekttitel, 22 px / 800 (§2.3, ADR-050); Landing-Köpfe bleiben bei `SectionHeader` (§1.7).

### 1.3 Abstand

Ein 4-px-Raster als Tokens; andere Abstände gibt es nicht.

| Token | Wert | Typische Verwendung |
|---|---|---|
| `--cc-space-1` | 4 px | Icon zu Text, Chip innen vertikal |
| `--cc-space-2` | 8 px | zwischen Chips, Label zu Feld |
| `--cc-space-3` | 12 px | Karteninnenabstand *compact*, Zeilenhöhe-Polster |
| `--cc-space-4` | 16 px | Karteninnenabstand *cozy*, zwischen Karten |
| `--cc-space-5` | 24 px | zwischen Abschnitten, Seitenrand ab M |
| `--cc-space-6` | 32 px | Kopf der Object Page zu Inhalt |
| `--cc-space-7` | 48 px | nur Landing |

**Ein halber Schritt, genau einer** (ADR-048): **2 px** (Tailwind `*-0.5`) nur innerhalb von Chips, Kennungen und Tags
(Innenabstand vertikal, Abstand Icon zu Wort) und zur optischen Ausrichtung eines Icons an der Textzeile. 6, 10 und
14 px (`*-1.5`, `*-2.5`, `*-3.5`) gibt es nicht — auch nicht in `components/cc`; der Guard zählt sie als Ratsche bis null.

### 1.4 Form, Tiefe, Hintergrund

| | Arbeitsraum | Öffentliche Seiten |
|---|---|---|
| Radius Karte/Panel | **12 px** | 22–28 px |
| Radius Zeile, Feld, Button | **8 px** | Pille |
| Radius Chip/Tag | Pille | Pille |
| Schatten | `0 1px 2px rgb(0 0 0 / .04)`; Dialog `0 16px 48px rgb(11 28 48 / .18)` | wie heute |
| Hintergrund | einfarbig `--cc-page` — **kein Mesh, kein Raster** | Mesh und Raster, `opacity ≤ .18` |

### 1.5 Buttons — genau vier

| Variante | Aussehen | Regel |
|---|---|---|
| `primary` | Fläche `--cc-brand-strong`, Schrift Weiß, Hover `--cc-brand-deep` | **eine** je Bereich — ein Bereich ist eine Karte, ein Dialog oder eine Leiste; die Hauptaktion der Seite steht in „Next step" |
| `secondary` | Fläche `#f0fdf4`, Rand `--cc-brand-strong`, Schrift `--cc-brand-strong` (4,8 : 1) | weitere Aktionen |
| `ghost` | Fläche Weiß, Rand `--cc-field-border`, Schrift `--cc-ink-muted` | Abbrechen, Nebenaktionen; destruktiv mit `error`-Schrift |
| `dark` | Fläche `#030712`, Schrift Weiß | **nur** für die bindende Bestätigung (Entscheidung) in der Message Box oder der Bearbeitungs-Fußleiste — nie neben einem `primary` in derselben Leiste |

Höhe 32 px *compact*, 40 px *cozy*. Destruktives läuft über eine **Message Box** (§2.6), nie über `window.confirm`.

Keine Buttons im Sinne dieser Regel, aber mit festem Aussehen:

| Bedienelement | Aussehen | Wo |
|---|---|---|
| **Segmented Control** | Rahmen `--cc-field-border`; gewähltes Segment Fläche `--cc-ink`, Schrift Weiß, `aria-pressed`/`role="radio"`; übrige Segmente Schrift `--cc-ink-muted` | Sichten, „Map \| Steps", Fokus in IT, Regelentscheidung |
| **Icon-Button** | wie `ghost`, quadratisch in Button-Höhe, Icon 16 px, `aria-label` Pflicht | Zoom, Schließen, Suche und Menü auf S |
| **„Why?"-Ziel** | Icon „?" 16 px in `--cc-ink-muted` in einem Ziel von mindestens 24 × 24 px, Name „Why: …" | an Zahl und Status (§2.10) |

### 1.6 Fokus

Jedes bedienbare Element zeigt bei Tastaturfokus (`:focus-visible`) einen Ring: **2 px `--cc-focus`, 2 px Abstand**,
Radius wie das Element. Nie `outline: none` ohne diesen Ersatz. Die Fokusreihenfolge folgt der Lesereihenfolge.

### 1.7 Icons, Bewegung, Illustrationen

- **lucide-react**, 16 px im Arbeitsraum, 20 px im Kopf, Strich 2.
- SAP-Icons (`@ui5/webcomponents-icons`) und Illustrationen (`@ui5/webcomponents-fiori`) sind laut npm-Metadaten
  Apache-2.0 (geprüft 15.09.2026). Einbau nur nach Prüfung der einzelnen Assets und der Bundle-Größe (Icons rund 5 MB
  entpackt) — als SVG-Pfade, nie als Web Components.
- **Bewegung nur, wo sie einen Zustandswechsel erklärt**, 150–250 ms, mit `prefers-reduced-motion` abschaltbar. Keine
  Dauerbewegung, kein Blinken, keine pulsierenden Punkte ohne Text. Zwei Inszenierungen sind erlaubt, weil sie etwas
  erklären: der Aufbau — Knoten wachsen aus ihrer Zeile (§5.1) — und die drei Sichten in „New project" (§6.1.1). Beide
  laufen einmal, sind überspringbar und stehen bei reduzierter Bewegung still. **Auf der öffentlichen Startseite**
  (Mockup `docs/roadmap/clean-core-landing-v3_0.html`, abgenommen) gelten dieselben Regeln für ihre Interaktionen:
  die Sichten-Bühne läuft einmal, alles andere bewegt sich nur auf Handlung des Besuchers.
- **Fokus auf dunkler Code-Fläche:** der Ring nimmt `--cc-code-name` `#93c5fd` (11,2 : 1 auf `#030712`) statt
  `--cc-focus`, der dort unsichtbar wäre.
- **Öffentliche Seiten:** `SectionHeader` behält Pille, Größe und Lead; die Gewichte folgen mit 3.0 der Skala aus §1.2
  (höchstens 800) — Roadmap 3.0.6 passt `tests/landing-style-guard.spec.ts` dazu an.

### 1.8 Diagramme

- **Diagramme, die Zustände zählen** (Level-Verteilung A–D, Befunde je Schwere), verwenden die Zustandsfarben — und
  beschriften jede Kategorie. Level: A `information`, B `neutral`, C `warning`, D `error`, jeweils mit dem Buchstaben
  (ADR-024) — die Level stammen aus SAPs Klassifikationsdatei, sind also *Imported*, kein Nachweis, und stehen nie im
  signierten Audit-Pack; Grün bekommen sie deshalb nicht. Schwere: Critical und High `error`, Medium `warning`, Low
  `neutral`, Info `information`, jeweils mit dem Wort (ADR-049) — eine Schwere ist kein Nachweis und bekommt kein Grün.
- **Alle anderen Diagramme** verwenden die kategoriale Palette und nie eine Zustandsfarbe: `#334155`, `#4f46e5`,
  `#0d9488`, `#9333ea`, `#c026d3`. Sequenziell (Mengen, Verlauf): Indigo `#e0e7ff` → `#a5b4fc` → `#6366f1` → `#3730a3`.
- Jede Zahl im Diagramm auch als Text erreichbar (Tabelle oder `aria-label`).

---

## 2. Struktur & Interaktion — SAP-Fiori-Muster

„An SAP-Fiori-Mustern orientiert" — so heißt es nach außen. „SAP Fiori" ist eine Marke; die Oberfläche ist keine
Fiori-App und sagt das nie.

### 2.1 Shell

- **Shell Bar** oben: Logo und Produktname links, Pfad (Workspace › Projekt), Suche ⌘K, Hilfe, Kontomenü rechts.
- Keine Side Navigation in 3.0: ein Projekt ist ein Fall, die Tiefe liegt im Arbeitsraum.

### 2.2 Floorplans

| Floorplan | Wo | Muster |
|---|---|---|
| **List Report** | „My workspace" (Projektliste) | Filterleiste (§2.5), Toolbar „Projects (23)", Tabelle, Zeilenklick öffnet das Projekt |
| **Object Page** | der Arbeitsraum eines Projekts | Kopf, Werkzeugleiste, Anchor Bar, Abschnitte, Fußleiste nur beim Bearbeiten (§2.3) |
| **Overview** | Management-Sicht eines Projekts | Karten mit je einer Antwort, jede Zahl mit „Why?" |

**Mit 3.0 ist alles neu, aus einem Guss** (ADR-052, Sonny 24.09.2026). Keine alte Oberfläche wird entfernt, statt
umgebaut zu werden: das **alte Dashboard** (`/dashboard`) und die **alte Stufen-Demo** (`/demo/[stage]`) werden nach
dieser Datei neu gebaut — Floorplan, Tokens, cc-Komponenten, Sprache — wie jede andere Seite. Was sie heute können,
geht dabei nicht verloren. Die neue Demo folgt §6.1.2.

### 2.3 Object Page des Arbeitsraums

Von oben nach unten:

1. **Kopf:** Projekttitel; Metazeile in Mono (Projekt-ID, Manifest, Revision, Quellstand, Engine, Regelversion);
   **Kennzahl-Facetten** — Traceability, Rules confirmed, Level distribution, **Not determined** (Anzahl). Rechts im
   Kopf: der **Sichten-Umschalter** als Segmented Control „Business | IT | Management" (ADR-008, Reihenfolge ADR-044) und die Initialen
   der Konten mit Einsicht (Roadmap 5.5 — keine weiteren Personendaten).
2. **Statuszeile** (Roadmap-Schritt 1.4): Provenance · Need · Standard · Costs · Confirmed · Execution · Handover —
   je ein **Objektstatus**, Text mit Zustandspunkt („not started", „partial", „draft", „mock only"), solange nichts da
   ist „not started". Der Objektstatus sagt, **wie weit** etwas ist; der Herkunfts-Chip (§4) sagt, **woher** eine
   Aussage kommt. Beide sehen verschieden aus und werden nie vermischt (ADR-023): ein Objektstatus ist nie ein Chip mit
   Icon, ein Herkunfts-Chip trägt nur die neun Werte aus `lib/provenance.ts`.
3. **Werkzeugleiste:** die sieben Stufen als Werkzeuge (Analyze … Delivery), links ausgerichtet; rechts Export und
   Teilen. In IT offen, in Business und Management als Menü „Tools" (§2.11).
4. **Anchor Bar:** allein für die Ebenen — Need & process · Standard fit · Costs & assumptions · Architecture &
   dependencies · Evidence & controls · Changes & commitments. Leere Ebenen stehen unter „More" und sagen dort, was
   fehlt (§2.11).
5. **Inhalt:** Abschnitte der gewählten Ebene. **„Next step"** ist eine Karte (regelbasiert, Roadmap-Schritt 6.5),
   keine Leiste — in Business im Kopf unter Enthüllung und *Not determined*, in Management und IT oben im Inhalt.
6. **Fußleiste nur im Bearbeitungsmodus** (Prozessmodell, Regeln): `Save` (primary), `Discard` (ghost), der Hinweis
   „Unsaved changes" und ein **Message Popover** (§2.6) mit der Zahl der Prüfhinweise (Roadmap-Schritt 3.3). Jedes
   Speichern ist eine Revision (Roadmap-Schritt 3.2). Außerhalb des Bearbeitens gibt es keine Fußleiste.

**Der Kopf je Sicht** (ADR-026). In **Business** führt der Inhalt, nicht der Projektstand: unter dem Titel stehen
Klarsprache-Satz, Enthüllungszeile mit *Not determined* und die Karte „Next step"; Facetten und Statuszeile sind zu
**einer** Zeile „Project status" eingeklappt, in Klarsprache („Steps linked to code 92 % · Rules confirmed 0 of 7 · Show
project status"), ohne Level-Verteilung und ohne *Not determined* — das steht schon in der Enthüllungszeile. In
**Management** und **IT** sind Facetten und Statuszeile offen. Anchor Bar und Werkzeuge gibt es in jeder Sicht — die
Werkzeuge in IT als offene Leiste, in Business und Management als Menü „Tools" (§2.11). Unter dem
Sichten-Umschalter steht ein Satz, welche Frage die Sicht beantwortet; „About this view" öffnet den Absatz dazu (§6.1).

Überschriften: der Projekttitel ist `h1`, jeder Abschnitt `h2`, jede Karte `h3`; keine Ebene wird übersprungen.

**Wie die drei Navigationen zusammenspielen** (ADR-018) — jede hat genau eine Aufgabe:

| Element | Tut | Tut nicht | Start | Gehalten in |
|---|---|---|---|---|
| **Sicht** (Segmented Control) | ordnet denselben Inhalt nach einer Frage und wählt die erste Antwort (§5.6) | ändert keine Daten, filtert nichts weg, öffnet keine Seite | Business | URL (`?view=`) und Browser |
| **Ebene** (Anchor Bar) | springt zu einem Abschnitt der Seite und markiert, wo man ist | wechselt nicht die Sicht | Need & process | URL-Fragment (`#need`) |
| **Werkzeug** (Werkzeugleiste) | öffnet die Stufe als eigene Seite; „Back to workspace" kehrt zu Sicht und Ebene zurück | ist keine Fortschrittsanzeige | — | URL der Stufe |

**Der Kopf einer Stufe** (ADR-050). Eine Stufe ist eine Werkzeug-Seite des Arbeitsraums, kein Landing-Abschnitt. Ihr
Kopf kommt aus `StageHeader` und steht wie der Projekttitel: **22 px / 800, `-0.02em`, `--cc-ink`**, als `h1`. Das
Icon steht neutral davor — 20 px, `--cc-ink-muted`, ohne Fläche; keine grüne Blase, denn Grün heißt im Arbeitsraum
belegt (§1.1). Über dem Titel der Link **„Back to workspace"** (13 px / 600, `--cc-ink-muted`, Pfeil links; ein Link,
kein Button), der zu Sicht und Ebene zurückführt, von denen die Stufe geöffnet wurde. Eyebrow und Lead bleiben, in der
Skala von §1.2 (Mikro-Label, Fließtext).

Beim Scrollen schrumpft der Kopf auf Titel, Sichten-Umschalter und die Facetten-Zeile — in Business die Zeile „Project
status"; die Anchor Bar bleibt stehen. **Eine
Sicht in der URL ist eine Perspektive, keine Freigabe:** ein Link mit `?view=management` öffnet nichts, wofür das Konto
keine Einsicht hat. Die Sicht lebt nie im Projekt, Run oder Audit-Pack (Roadmap 6.1).

### 2.4 Tabellen

- **Object Identifier:** Titel 600, darunter die ID in Mono (`BR-004`).
- Zahlen rechtsbündig, Einheit in der Spaltenüberschrift.
- **Status als Text mit Punkt** (Object Status) — nie nur Farbe.
- Zeilenaktionen rechts; Toolbar mit Titel und Zähler („Findings (42)").
- **Leer** (es gibt noch nichts): Empty State mit Satz und einer Primäraktion. **Null Treffer** (Filter schließt alles
  aus): „No findings match these filters" und „Clear filters" — nie der Empty State.
- Auf S: Karten statt Spalten.

### 2.5 Filterleiste

**Live-Filter** (ADR-010): Suchfeld und bis zu vier Filter über der Tabelle, Wirkung sofort (200 ms nach der letzten
Eingabe), Zähler in der Toolbar, „Clear filters" sobald einer gesetzt ist. Kein „Go", kein „Adapt filters" — die
Datenmengen eines Projekts und eines Arbeitsbereichs sind klein. Wird eine Liste serverseitig paginiert, wechselt sie
zu „Go"; das ist dann ein neuer ADR. Der Zähler steht in einer `aria-live="polite"`-Region, damit ein Screenreader die
Wirkung des Filters ansagt („12 findings").

### 2.6 Meldungen

| Muster | Wofür |
|---|---|
| **Message Strip** | ein Hinweis im Kontext, oben im Abschnitt: Sperre, veralteter Stand, Beispieldaten, Formularfehler-Zusammenfassung |
| **Message Popover** | gesammelte Prüfhinweise in der Bearbeitungs-Fußleiste, mit Sprung zum Element |
| **Message Box** | Bestätigung vor Unumkehrbarem — Löschen, Widerruf, Entscheidung — mit den Folgen im Text. **Modal:** abgedunkelte Seite dahinter, die Seite ist `inert`, der Fokus bleibt in der Box und kehrt beim Schließen an den auslösenden Button zurück; so steht nie eine zweite Bestätigung daneben (ADR-028) |
| **Toast** | nur für abgeschlossene Nebenaktionen („Export downloaded"): unten rechts, Fläche `--cc-overlay`, `role="status"`, 4 s, höchstens einer zugleich, nie für Fehler |

Ein Message Strip, der nach einer Aktion erscheint (Formularfehler, fehlgeschlagener Lauf), ist fokussierbar
(`tabindex="-1"`) und bekommt den Fokus; ein ohnehin sichtbarer Hinweis (Sperre, Beispieldaten) nicht.

### 2.7 Formulare und Value States

Das meistgenutzte Muster — für Regeln bestätigen, Einladen, Annahmen erfassen:

- **Label über dem Feld**, 13 px / 600; Hilfetext darunter in `--cc-ink-muted`.
- **Pflichtfeld:** Sternchen am Label plus `aria-required`; ein Formular mit Pflichtfeldern sagt oben einmal „* required".
- Felder: Input, Textarea, Select, Checkbox (Label rechts), Radio-Gruppe mit Legende, Segmented Control. Höhe 32 px
  *compact*, 40 px *cozy*; Rahmen `--cc-field-border`.
- **Value State am Feld:** Rahmen in der Zustandsfarbe und darunter **Icon + Text** (`error`: was falsch ist und wie es
  richtig wird; `warning`: was zu prüfen ist; `success` nur, wo eine Prüfung wirklich stattfand; `information`: Hinweis).
- Prüfen beim Verlassen des Felds und beim Absenden — nicht beim ersten Tippen. Scheitert das Absenden: Message Strip
  oben mit Links zu den Feldern, Fokus auf den Strip.

### 2.8 Laden

- **Skeleton**, wenn das Layout bekannt ist (Kopf, Tabelle, Karten) und das Laden länger als 300 ms dauert.
- **Busy Indicator am auslösenden Element** für Aktionen; erscheint erst nach 400 ms; die Seite bleibt bedienbar.
- Keine seitenblockierenden Spinner. Lange Läufe (Analyse, Generierung) zeigen Etappen, keine Prozentzahlen, die es
  nicht gibt.

**Lange Läufe** (ADR-019):

- **Vor dem Klick** sagt die Aktion, was sie kostet — nach den Regeln des Kontingents (`COMMUNITY_QUOTA` in
  `lib/constants.ts`: fünf Analyse-Läufe je Konto, einmalig; gezählt wird ein neuer ABAP-Quellstand in der Analyse,
  derselbe eigene Quellstand erneut ist frei, die Stufen danach und der Chat zählen nicht; ein eigener Gemini-Schlüssel hebt die
  Grenze auf; ab Roadmap 0.9 ist jedes Starter-Beispiel einmal frei, jeder weitere Lauf desselben Beispiels zählt nach
  Abschluss und wird vorher angekündigt): „Uses 1 of your 5 free analysis runs (4 left)", „Free — this source was already analysed", „Not
  counted" oder „Uses your own Gemini key". Ob ein Modell aufgerufen wird, ist eine zweite, eigene Angabe („No model
  call"). Nichts verbraucht Kontingent, ohne dass es vorher dasteht; die Zahlen kommen aus dem Konto, nie aus dem
  Mockup.
- **Abbrechen** ist während des ganzen Laufs möglich; ein abgebrochener Lauf hinterlässt keinen halben Stand, und was
  schon verbraucht ist, steht im Hinweis.
- **Verlassen** ist erlaubt. Läuft die Arbeit auf dem Server weiter, sagt die Seite das und zeigt beim Wiederkommen den
  Stand; ginge der Lauf verloren, fragt eine Message Box vor dem Verlassen.
- **Fehler** zeigen einen Message Strip mit dem, was passiert ist, und einer Aktion („Retry", „Run without model") —
  nie einen rohen Fehlertext und nie still ein leeres Ergebnis.
- **Etappen werden angesagt:** eine `aria-live="polite"`-Region nennt nur den Wechsel der Etappe mit ihrem Ergebnis
  („Process recognised: 14 steps, 5 decisions") — nie die laufenden Zähler, höchstens eine Ansage je Etappe.
- Große Quellen sagen früh, was kommt: „Reading 3 programs, 10,400 lines" — keine Schätzung einer Dauer.

### 2.9 Dichte und Breakpoints

- **Dichte nach Eingabegerät** (ADR-011): `(pointer: fine)` → *compact*, `(pointer: coarse)` → *cozy*. Umschaltbar im
  Kontomenü, gespeichert im Browser, nie im Konto.

| Breakpoint | Breite | Layout |
|---|---|---|
| **S** | ≤ 600 px | eine Spalte, Tabellen als Karten, Werkzeugleiste als Menü, Seitenrand 16 px |
| **M** | 601–1024 px | eine Spalte, Seitenspalte unter den Inhalt, Seitenrand 24 px |
| **L** | 1025–1440 px | Inhalt + Seitenspalte 360 px |
| **XL** | > 1440 px | wie L, Inhalt maximal 1280 px breit, zentriert |

- **Zielgrößen:** mindestens 24 × 24 px (WCAG 2.5.8) *compact*, 44 × 44 px *cozy* und auf Touch.
- **Reihenfolge auf S** in der Business-Sicht: Prozessname und Klarsprache-Satz → Enthüllungszeile und *Not determined*
  → „Next step" → Prozess als Schrittliste (§5.7) mit „Show map" → Code eingeklappt. Der Vertrauensgrund rutscht nie
  unter den Inhalt. Beidseitiges Hover wird auf Touch zu „Tippen markiert, zweites Tippen öffnet". Coach Marks
  erscheinen auf S als ein Hinweis-Strip, nicht als schwebende Blasen; Export liegt im Menü der Werkzeugleiste.

### 2.10 Suche, Popover, Glossar

- **Suche ⌘K** durchsucht das geöffnete Projekt: Prozesselemente, Regeln, Findings, Codezeilen und Glossarbegriffe —
  nicht andere Projekte. Treffer gruppiert nach Art, Enter springt hin. Auf Touch ein Such-Button in der Shell Bar.
- **„Why?"-Popover:** oben der Herkunfts-Chip (§4); darunter, worauf die Aussage beruht (Regel und Regelversion, Engine,
  Import oder Konto), der Beleg als Anker, das Datum in ISO. Schließt mit Escape, gibt den Fokus an sein Ziel zurück.
- **Glossar im Text:** gepunktete Unterstreichung in Textfarbe — kein Linkstil; Popover per Tastatur (Enter) und Hover.
  Ein Glossarbegriff ist keine Navigation.
- **Auf S** gibt es kein eigenes „?"-Ziel neben jedem Wert: Wert und Anker sind zusammen **ein** 44-px-Ziel, das das
  „Why?"-Popover öffnet — sonst bricht eine Enthüllungszeile in viele Zeilen.
- **Initialen im Kopf:** Popover mit Namen und „Read access since" (Roadmap 5.5), nur für den Besitzer.

### 2.11 Weniger zeigen, nichts verlieren

Für Erstnutzer ist weniger mehr — die Tiefe bleibt, sie steht nur nicht zuerst da (ADR-037, Sonny 15.09.2026):

- **Der erste Bildschirm einer Sicht** zeigt genau: die Antwort auf die Frage der Sicht, **eine** nächste Handlung und
  höchstens drei stützende Blöcke. Alles andere liegt eine Aktion tiefer — eingeklappt mit Anzahl („Business rules (7)
  · Show"), nie entfernt.
- **Nichts doppelt.** Eine Zahl steht an einer Stelle; wer sie an zweiter Stelle braucht, bekommt einen Verweis.
- **Metadaten auf Abruf.** Die Mono-Metazeile (Projekt-ID, Manifest, Revision, Quellstand, Engine, Regeln) steht in IT
  offen, in Business und Management hinter „Details".
- **Werkzeuge nach Sicht.** In IT steht die Werkzeugleiste offen; in Business und Management ist sie ein Menü „Tools".
- **Ebenen mit Inhalt zuerst.** Die Anchor Bar zeigt Ebenen mit Inhalt; leere stehen unter „More" und sagen dort, was
  fehlt.
- **Tabellen** zeigen die ersten fünf Zeilen und „Show all 42"; Filter erscheinen ab zehn Zeilen.
- **Legenden nur auf Abruf.** Ein Button „Legend" statt einer dauerhaften Chip-Reihe; beim ersten Besuch einmal offen.
- **Seitenspalte:** höchstens zwei Karten; weitere unter „More about this process".
- **Overlays** der Karte sind beim ersten Öffnen aus; die Minikarte erscheint erst ab 40 sichtbaren Elementen.
- **Die Prüfung:** Kann jemand ohne Schulung in zehn Sekunden sagen, worum es geht und was er als Nächstes tut? Wenn
  nicht, ist etwas zu viel da — nicht zu wenig.

---

## 3. Sprache und Formate

- **Alles Englisch** (ADR-009, bestätigt von Sonny am 15.09.2026) — die Oberfläche **und** alles, was das Produkt
  erzeugt: Prozessname, Klarsprache-Satz, fachliche Namen, „What this process does", Exporte. Deutscher Code bleibt
  wörtlich, wo er zitiert wird (Literale, Meldungstexte am Anker); was das Modell daraus benennt, ist englisch. Diese
  Datei ist deutsch; zitierte Oberflächentexte stehen englisch.
- **Jede sichtbare Zeichenkette neuer Oberflächen läuft über Textschlüssel** (Message-Katalog), auch solange es nur
  Englisch gibt; die deutsche Oberfläche kommt nach 3.0 (Roadmap §7). Herkunfts-Labels sind Schlüssel in
  `lib/provenance.ts`.
- **Eine Ausnahme, ausdrücklich:** die deutsche Datenschutzerklärung `app/datenschutz/de` ist Rechtstext (ADR-053).
  Sie bleibt deutsch und wörtlich, läuft nicht über Textschlüssel und ist von den Sprach-Guards ausgenommen; Look
  (§1) und Struktur gelten für sie wie für jede Seite. Keine weitere Seite wird ohne neuen ADR zur Ausnahme.
- **Zahlen:** `Intl.NumberFormat('en')`, Tausendertrennung; Prozent ganzzahlig; Einheit in der Spaltenüberschrift.
- **Geld** (ADR-022): Kostenbeträge **entstehen** nur in Economics, auf Annahmen des Nutzers, mit Währungscode
  (Roadmap 0.4). Anderswo — Management-Sicht, Entscheidung, Export — erscheinen sie nur als Übernahme mit dem Chip
  *Simulation*, der Annahmen-Revision und „Open in Economics"; nie ein Betrag ohne diese drei. Ein Betrag, der **im Code
  steht** (der Grenzwert einer Regel), ist ein Codefakt mit Zeilenanker und keine Kostenangabe.
- **Datum:** im Text „15 Sep 2026"; in Metazeilen, Tabellen und Exporten ISO 8601 `2026-09-15` in Mono; Uhrzeiten mit
  Zeitzone.
- **Zeilenanker** in Mono: `L243`, `L380-412`, Befund-IDs `CC-017`, Regeln `BR-004`.

### 3.1 Keine KI-Spuren

Was ein Sprachmodell geschrieben hat, erscheint auf dem Schirm, in HTML- und PDF-Exporten und in Mails wie jeder andere
Text dieses Produkts: gerendert, sachlich, ohne Spuren seiner Herkunft im Text selbst (ADR-014). **Woher ein Text
kommt, sagt der Chip *Model proposal* — nie der Text.**

- **Nie rohe Markdown-Zeichen:** `**`, `__`, `#`/`##`/`###` am Zeilenanfang, einzelne Backticks, Code-Zäune, `[Text](url)`
  als Text, `- ` oder `* ` als sichtbare Aufzählungszeichen in Fließtext, ein wörtliches `\n`. Modelltext wird entweder
  sicher gerendert oder vor der Anzeige bereinigt. Ausgenommen sind Dateien, deren Format Markdown *ist* (`.md`-Export).
- **Keine Chatbot-Floskeln und verräterischen Wendungen** — weder in Modellausgaben noch in eigener Copy. Die Liste hat
  zwei Teile (ADR-020), weil ein Textscan Füllwort und Fachsprache nicht unterscheiden kann:
  - **Blockliste — nie, der Guard bricht den Build:** „As an AI", „as a language model", „I hope this helps", „Great
    question", „Certainly!", „Let's dive in", „In today's fast-paced world", „AI is thinking", „AI-powered".
  - **Stilliste — Hinweis für Menschen, kein Build-Bruch:** „delve into", „It's important to note", „In conclusion",
    „seamless(ly)", „unlock", „elevate", „empower", „game-changer", „cutting-edge", „robust"/„comprehensive" als
    Füllwort, Einleitungen mit Ausrufezeichen. QA- und UX-Agent melden Treffer als Befund `low`; im Fachtext („robust
    error handling") bleiben sie stehen.
- **Keine KI-Symbolik:** keine Funken (✨), Roboter, Zauberstäbe, Gehirne oder Chips als Icon für Modellarbeit; keine
  Etiketten wie „AI-powered", „magic", „Smart …"; keine Emojis in Oberflächentext. „Ask AI" heißt „Ask this case".
- **Keine Ladezustände, die Denken spielen:** kein „AI is thinking…", kein Tipp-Effekt, keine Punkte-Animation — die
  Etappe sagt, was gerade gelesen oder erzeugt wird (§2.8, §5.4).
- **Was bleibt:** die sachliche Herkunftsangabe (*Model proposal*, §4) und, wo es rechtlich oder für die Nachvollziehbarkeit
  nötig ist, der Name des Modells in Metazeile oder Nachweis — als Angabe, nicht als Werbung.

Technik: Modellausgaben laufen vor Anzeige, Export und Mail durch eine gemeinsame Bereinigung (Schritt 1.5,
`lib/model-text.ts`: Markdown sicher rendern oder entfernen, Floskelliste prüfen); Prompts verlangen Klartext ohne
Markdown, wo nicht gerendert wird.

---

## 4. Vokabular — eine feste Liste im Code

Ab Schritt 1.5 gibt es **eine** Liste, `lib/provenance.ts`; der Status-Chip kann nur ihre Werte zeigen, ein Guard
verbietet frei formulierte Herkunfts-Badges (ADR-006).

| Wert | Label (Schlüssel) | Zustand | Icon | Bedeutung | Heute zum Beispiel |
|---|---|---|---|---|---|
| `proven` | **Proven** | success | Häkchen im Schild | durch Engine, Signatur oder echten Lauf belegt | Signed run, Passed |
| `confirmed` | **Confirmed** | information | Person | vom Konto bestätigt — Selbstauskunft, kein Mandat | Signed off, bestätigte Regel |
| `reconstructed` | **Reconstructed** | information | Zahnrad/Code | aus dem Code abgeleitet, nicht bestätigt | Prozessskelett, Lanes aus AUTHORITY-CHECK |
| `imported` | **Imported** | information | Datei-Pfeil | aus einer Datei übernommen (ATC, BPMN, Nutzung, SAP-Kataloge) | Usage-Import, ATC-Findings, Catalog Match, Level A–D, Readiness (gerechnet aus den Leveln mit Regelversion) |
| `proposed` | **Model proposal** | warning | Stift (Entwurf) — nie Funken | vom Sprachmodell vorgeschlagen, ungeprüft | AI Generated, fachliche Benennung |
| `simulation` | **Simulation** | warning | Rechner | gerechnet auf Annahmen | Economics, Model estimate |
| `demonstrated-mock` | **Demonstrated · mock** | warning | Reagenzglas | gegen Mocks gezeigt, nicht gegen echte Systeme | Simulated, Mock-Testlauf |
| `stale` | **Stale** | warning | Uhr | nicht mehr aktuell — neu rechnen | Stale-Notice |
| `not-determined` | **Not determined** | neutral | Fragezeichen | konnte nicht bestimmt werden — mit Grund | not computed, No verdict |

Jeder Chip trägt **Wort und Icon** — lesbar ohne Farbe, im Ausdruck und für Screenreader.

**Die Form ist das zweite Merkmal** (ADR-017). Blau trägt drei Werte, Gelb vier; wer nur überfliegt, soll trotzdem
Selbstauskunft von Ableitung und Annahme von Veraltet trennen können. Deshalb sagt die Form, **wie fest** eine Aussage
ist:

| Form | Aussehen | Werte | Heißt |
|---|---|---|---|
| **gefüllt** | Zustandsfläche, heller Rahmen | `proven`, `confirmed`, `stale` | steht fest — belegt, bestätigt oder sicher veraltet |
| **Umriss** | weiße Fläche, 1-px-Rahmen in der Vordergrundfarbe | `reconstructed`, `imported`, `not-determined` | übernommen oder abgeleitet, noch nicht bestätigt |
| **gestrichelt** | weiße Fläche, 1-px-Strichrahmen in der Vordergrundfarbe | `proposed`, `simulation`, `demonstrated-mock` | vorläufig — Vorschlag, Annahme, Mock |

Im Druck und unter `forced-colors` fällt die Fläche weg; *gefüllt* wird dort zu einem 2-px-Rahmen, Umriss und Strich
bleiben — die drei Formen bleiben unterscheidbar.

### 4.1 Die anderen festen Listen — jede mit eigener Form

Herkunft ist nicht das einzige feste Vokabular. Damit nichts wie ein Herkunfts-Chip aussieht, was keiner ist, hat jede
Liste eine eigene Form, eine eigene Datei im Code neben `lib/provenance.ts` und denselben Guard gegen freie Werte
(ADR-027):

| Liste | Werte | Form | Beispiel |
|---|---|---|---|
| **Herkunft** (§4) | die neun Werte | Pille mit Icon, gefüllt/Umriss/gestrichelt | *Model proposal* |
| **Objektstatus** (§2.3) | not started · partial · draft · open · confirmed · mock only · handed over · done · blocked by SAP · failed — *signed* und *stale* sind Herkunft (§4), kein Status | Text mit Zustandspunkt, keine Umrandung | ● draft |
| **Evidenzstufe** (Roadmap 7.2) | E0 none · E1 catalog reference · E2 documented · E3 demonstrated · E4 accepted in the target system | Kennung: Rechteck, Radius 4 px, Code in Mono, dahinter das Wort; neutral für alle Stufen — eine Belegreife, kein Zustand | `E1` catalog reference |
| **Clean-Core-Level** | A · B · C · D | Kennung wie Evidenzstufe, Farbe nach §1.8 | `D` |
| **Regel-Eigenschaft** | hard-coded in program · customizing · master data | Tag: Rechteck, Radius 4 px, `--cc-surface-muted`, Text `--cc-ink-muted`, kein Icon | hard-coded in program |
| **Schwere eines Befunds** (ADR-049) | Critical · High · Medium · Low · Info — in `lib/severity.ts` | Kennung wie Level: Rechteck, Radius 4 px, das Wort in 12 px / 600 (§1.2); Farbe nach §1.8 — Critical und High `error`, Medium `warning`, Low `neutral`, Info `information`; nie `success` | `High` |

Eine Regel-Eigenschaft sagt, **wo** eine Regel steht, und ist nie ein Nachweis; eine Evidenzstufe sagt, **wie stark**
ein Standard-Kandidat belegt ist, und ist nie eine Herkunft. Eine Schwere sagt, **wie dringend** ein Befund ist — sie
ist weder Herkunft noch Objektstatus, und kein Befund trägt eine Schwere, die nicht aus dieser Liste kommt.

---

## 5. Der erste Blick — der Arbeitsraum öffnet in der Business-Sicht

Nach Code-Import oder Beispiel öffnet der Arbeitsraum in der **Business-Sicht** und zeigt sofort, um welchen Prozess es
sich handelt (ADR-002).

> **Der Wow-Effekt ist ein Inhalt, den der Nutzer nicht erwartet hat, in unter drei Sekunden, mit Zeilenanker — die
> Inszenierung macht nur sichtbar, woher er kommt** (ADR-013).

Bei einem SAP-Publikum entsteht er nicht durch Bewegung, sondern durch Wiedererkennen: *Das Ding hat meinen Code gelesen
und weiß, was er tut — inklusive der Regeln, die fest im Programm stehen.* Alles in diesem Abschnitt trägt diesen einen
Moment.

### 5.1 Was den Moment trägt

- **Der Code spricht zuerst — während des Aufbaus.** Kein Spinner, sondern die Quelle: links der ABAP-Text in Mono;
  eine Zeile leuchtet in dem Moment auf, in dem die Engine dort einen Befund oder einen Prozessknoten setzt. Rechts
  entsteht die Prozesskarte — jeder Knoten wächst aus seiner markierten Zeile heraus (kurze Verbindungslinie, 200 ms,
  dann verblasst sie). **Das ist die einzige Animation, weil sie etwas erklärt: Herkunft.** Sie zeigt die echten
  Ereignisse der Engine in ihrer Reihenfolge, gerafft auf das Zeitbudget — nie eine künstliche Mindestdauer.
- **Danach führt das Geschäft, der Code tritt zurück** (ADR-015). Mit der letzten Etappe ordnet sich die Seite um:
  oben Prozessname, Klarsprache-Satz, Enthüllungszeile und *Not determined*; darunter die Prozesskarte; der Code wird
  zur zweiten Ebene — eine schmale Quellspalte, die sich öffnet, sobald ein Knoten oder Anker gewählt wird, und über
  „Show source" jederzeit. Wer kein ABAP liest, sieht nach dem Aufbau keine Codezeile, die er verstehen muss.
- **Der Höhepunkt ist eine Enthüllung, kein Dashboard.** Die Etappe endet mit einem Satz: *„3 business rules
  hard-coded in the program — tolerance 5 % (L412), plant 1000 (L87), vendor block list (L231)."* Jeder Anker klickbar,
  jeder Wert mit „Why?" (Roadmap 2.8). Der Satz behauptet nur, was der Code belegt: dass die Regel fest im Programm
  steht — nicht, dass sie nirgends dokumentiert ist. Das ist der Satz, den jemand an Kollegen weiterschickt.
- **Ein Satz in Klarsprache, der stimmt.** Unter dem Prozessnamen: *„Approves emergency orders above the limit only when
  …"* — mit Anker. Ohne Modellaufruf bleibt er technisch (`FORM check_limit → …`); das beeindruckt immer noch, weil belegt.
- **Der Zweifel wird sofort beantwortet.** Direkt neben der Enthüllung: *„3 not determined — dynamic call in L502 …"*.
  Für ein skeptisches Publikum ist das Teil des Moments: das Werkzeug behauptet nichts, was es nicht weiß.
- **Zeit bis zur ersten Einsicht ≤ 3 s, „Skip" immer sichtbar.** Die erste Etappe steht, bevor der Nutzer die Maus
  bewegt. Ein Zähler erhöht sich nur mit der Zeile, die gerade aufleuchtet — nie ein Hochzählen zur Schau, nie ein
  Platzhalter. Dauert die Engine länger, sagt die Etappe, was sie liest (*„reading include Z_MM_PO_TOP"*), nicht einen
  Fortschrittsbalken.

### 5.2 Die Etappen

1. **Code read** — Zeilen leuchten, Zähler folgen den Zeilen: lines · programs · tables · findings.
2. **Process recognised** — das Prozessskelett (Roadmap 2.3) wächst aus den markierten Zeilen; Entscheidungen tragen
   ihre Bedingung aus dem Code. Ab hier ist der Arbeitsraum bedienbar.
3. **In business language** — die technischen Namen wechseln einmal zu fachlichen, mit dem Chip *Model proposal*. Ohne
   Modellaufruf (Modell nicht erreichbar oder abgewählt) entfällt die Etappe; das Skelett bleibt technisch benannt —
   ein gültiges Ergebnis.
4. **This is your process** — Prozessname, der Klarsprache-Satz mit Anker, die **Enthüllungszeile** mit den versteckten
   Regeln und daneben **Not determined**; darunter dieselben Facetten wie im Kopf (§2.3): Traceability · Rules
   confirmed · Level distribution · Not determined.

**Das Modell hält den Aufbau nicht auf** (ADR-025). Die ≤ 3 s gelten für Etappen 1, 2 und 4 — sie kommen aus der
Engine. Etappe 3 braucht einen Modellaufruf und darf länger dauern: nach spätestens 3 s steht Etappe 4 mit technischen
Namen, die Etappenzeile sagt „Naming in business language …" mit „Cancel". Kommen die Namen, wechseln sie einmal, mit
Ansage in der Live-Region — nie unter einem offenen Popover oder einem fokussierten Knoten; dort erst, wenn es
geschlossen ist. Scheitert der Aufruf, bleiben die technischen Namen, und ein Message Strip bietet „Retry" an.

`prefers-reduced-motion` zeigt den Endzustand sofort — die Enthüllungszeile steht trotzdem oben. „Skip" springt in
denselben Endzustand. Ein zweiter Besuch hat keinen Aufbau.

### 5.3 Die ersten zehn Sekunden danach

- **Beidseitiges Hover:** Knoten → Codezeilen leuchten; Codezeile → Knoten hebt sich (Roadmap 2.5). Der erste Coach
  Mark lädt dazu ein: *„Select the decision."*
- **Eine Frage ist schon beantwortet.** *„Ask this case"* zeigt beim ersten Öffnen eine gestellte Frage mit Antwort und
  Ankern (*„What happens when the limit is exceeded?"*) — **abgeleitet aus den Verzweigungen des Codes** (Roadmap 2.1,
  Chip *Reconstructed*), ohne Modellaufruf und ohne das Kontingent des Nutzers anzutasten.
- **Standard-Fit als zweite Überraschung**, eine Ebene tiefer: *„2 of 7 rules have a standard candidate (scope item … —
  to verify)"* mit Evidenzstufe (Roadmap 7.2). Nie „deckt der Standard ab", solange die Stufe das nicht trägt.
- **Mitnehmbar:** „Export PNG" und „Export PDF" der Prozesskarte mit Herkunfts-Chips und Ankern. **Kein öffentlicher
  Link** — Teilen bleibt Einsicht per Einladung (Roadmap §8); ein Export ist keine Freigabe.

### 5.4 Was ausdrücklich nicht

Konfetti, dekorative Verläufe, Typewriter-Effekte, pulsierende Punkte, Ladeanimationen ohne Inhalt, *„AI is
thinking…"*, künstliche Mindestdauern (wie heute die sechs Sekunden des Evidence Scanners). Alles, was Zeit kostet und
nichts zeigt, senkt die Glaubwürdigkeit, die der Moment braucht.

### 5.5 Was danach steht

- **Inhalt, oben:** die Karte „Next step" — „Confirm the 7 rules — about 10 minutes", ein Klick zur ersten Regel.
- **Kopf des Inhalts:** Prozessname, Klarsprache-Satz, Enthüllungszeile, *Not determined* (§5.1).
- **Mitte:** die Prozesskarte; Klick oder Enter auf einen Schritt öffnet die Quellspalte mit markierten Zeilen.
- **Seitenspalte, „What this process does":** fünf Sätze, jeder mit Anker; unbelegte grau (wie `AnchoredNarrative`).
- **Seitenspalte, „Not determined":** jede offene Stelle mit Grund und nächstem Weg — dynamic call, missing include,
  usage unknown (nie „unused"). Diese Spalte ist Absicht: sie ist der Grund, einem Ergebnis zu trauen.

### 5.6 Drei Sichten auf denselben Fall

| Sicht | Die Frage | Die erste Antwort auf dem Schirm |
|---|---|---|
| **Business** | Do I still need this, and what changes for me? | Prozess, Geschäftsregeln (auch versteckte), Standard-Fit mit Scope-Item-ID, Not determined |
| **IT** | What exactly, where to, and is it right? | Findings mit Zeile und beiden Katalogsichten, Nachfolger-API, Kette Objekt → Bedeutung → Entscheidung → Ziel, Architekturvertrag |
| **Management** | What do I risk, what do I decide? | Clean-Core readiness mit Regelversion und Verlauf, Public-Cloud fit, vier Töpfe (Retire · Keep · Rebuild · Kein katalogisierter Pfad), offene Entscheidung, Kosten nur als *Simulation* |

Die Kette **Objekt → Bedeutung → Entscheidung → Ziel → Status** ist in jeder Sicht durchklickbar, und jede Zahl nennt
ihre Abdeckung („42 findings in 907 of 907 lines · 2 includes not read"). Auf S steht die Kette als Liste
untereinander, ein Glied je Zeile.

**Die vier Töpfe** (ADR-033, Sonny 15.09.2026) — Regeln je Objekt, keine Prozentschwellen; die erste zutreffende gilt,
und jede Zuordnung zeigt ihren Beleg:

| # | Topf | Regel | Beleg am Objekt |
|---|---|---|---|
| 1 | **Retire** | die Regel, der das Objekt dient, ist bestätigt „Drop" — **oder** der Nutzungsimport zeigt null Ausführungen über mindestens **13 Monate** | Entscheidung mit Revision · oder Nutzungsimport |
| 2 | **Kein katalogisierter Pfad** | gebraucht, Level C oder D, **ein SAP-Katalogobjekt ohne freigegebenen Nachfolger** und ohne Erweiterungsweg — oder in keiner der beiden SAP-Dateien genannt | Eintrag im Cloudification Repository, mit Datenbasis und Synchronisationsdatum |
| 3 | **Rebuild** | gebraucht, Level C oder D, und es gibt Nachfolger oder Erweiterungsweg — sowie jede Modifikation und jeder eigene Schreibzugriff auf SAP-Tabellen: das ist eigene Arbeit, nie SAPs | Nachfolger-API · BAdI · Befund |
| 4 | **Keep** | gebraucht und für die **Zielplattform des Projekts** zulässig: Public Edition nur Level A, Private Edition A oder B | Level und Zielplattform |
| — | *not assigned* | Level unbekannt oder *Not determined* | mit Grund |

- **Die Töpfe hängen an der Zielplattform.** Dasselbe B-Objekt ist in der Private Edition *Keep*, in der Public Edition
  *Rebuild* oder *Kein katalogisierter Pfad*. Die Karte nennt die Zielplattform im Antwortsatz; ein Wechsel der Zielplattform
  ordnet neu und sagt, was sich bewegt hat.
- **Retire ist durchsichtig.** Jede Retire-Zuordnung aus Nutzung zeigt Quelle, Zeitraum mit Datum und ob er einen
  Jahresabschluss enthält: *„No executions in SUSG, 2025-08-01 to 2026-08-31 (13 months, includes year-end close)"*.
  Weniger als 13 Monate ergeben nie Retire, sondern *„Usage window too short: 4 months — needs 13"*. Ohne Import gibt es
  Retire nur über eine Geschäftsentscheidung, nie über „keine Nutzung bekannt". Die Popover-Regel steht wörtlich da:
  *„Why 13 months: period-end and year-end programs run once a year."*
- **Unbestätigte Regeln machen die Zuordnung vorläufig:** *„16 Rebuild — 9 on rules not yet confirmed"*.
- Eine Aussage für das ganze Projekt braucht keine Schwelle: **ein** Objekt ohne Public-Cloud-Weg blockiert die
  Public-Cloud-Entscheidung.

**Erst die Antwort, dann die Zahl** (ADR-029):

- **Management** beginnt mit einem Satz über allen Karten, der die Frage der Sicht beantwortet: *„One decision open
  (DEC-1). It waits for counter-check S2. 4 objects block a Public Cloud decision."* Jede Karte beginnt mit ihrem
  Antwortsatz als Titel — *„Readiness 58 on rule set 1.3, up from 42 with the same rules"*, *„4 objects block a Public
  Cloud decision"*, *„No cost winner yet — option C is incomplete"* — und erst darunter Zahl, Diagramm und Tabelle.
  Einordnungen, die leicht falsch gelesen werden („a grade, not a compliance percentage"; „Simulation, not a quote"),
  stehen im Antwortsatz oder direkt darunter, nie nur im Popover.
- **IT:** die Kette gehört zu einem gewählten Befund. Die Tabelle markiert die gewählte Zeile, die Kette steht darüber
  mit „Chain for CC-017 — select a finding to follow its chain", ein Klick auf ein Kettenglied filtert die Tabelle, und
  die Abdeckung steht dabei: *„Chain complete for 31 of 42 findings · 11 end at Not determined"*.

### 5.7 Die Prozesskarte ohne Maus

Die Karte ist der Kern der Business-Sicht; jeder Weg zu ihr muss auch ohne Maus, ohne Sehen und auf dem Telefon gehen
(ADR-016).

- **Karte und Schrittliste sind gleichwertig.** Ein Umschalter „Map | Steps" über der Karte; die Schrittliste zeigt
  denselben Inhalt als geordnete Liste: Schritt, Lane, bei Entscheidungen die Bedingung aus dem Code und die Zweige,
  Anker, Herkunfts-Chip. Auf S ist „Steps" der Start, „Show map" öffnet die Karte.
- **Tastatur:** die Karte ist **ein** Tab-Halt; darin führen die Pfeiltasten entlang des Ablaufs (→/↓ nächster
  Schritt, ←/↑ vorheriger; an einer Entscheidung wählen ↓/↑ den Zweig). Enter öffnet die Quellspalte, Escape schließt
  sie und gibt den Fokus an den Knoten zurück. `+`, `−` und `0` zoomen und passen ein; dieselben Befehle als Buttons.
- **Fokus ist Hover:** ein fokussierter Knoten markiert seine Codezeilen wie beim Überfahren; eine fokussierte
  Codezeile hebt ihren Knoten.
- **Screenreader:** jeder Knoten ist ein Button mit Namen aus Art, Titel, Anker und Herkunft (*„Decision: amount above
  limit? Lines 243 to 251, reconstructed"*); die Karte als Ganzes ist eine benannte Gruppe mit einem Satz Übersicht
  (*„Process with 14 steps and 5 decisions"*). Die Etappen des Aufbaus sagt eine Live-Region an (§2.8).
- **Ziele:** Knoten mindestens 24 × 24 px *compact*, 44 × 44 px auf Touch (§2.9).
- **Breite:** Die Quellspalte öffnet sich **an der Stelle der Seitenspalte** (L, XL) — deren Inhalte bleiben als Reiter
  derselben Spalte erreichbar („Source · Not determined · What it does"). Die Auswahl eines Knotens verschiebt also nie
  die Seite. Die Karte skaliert Beschriftungen nie unter 11 px; was nicht passt, erreicht man durch Verschieben, „Fit"
  und die Ebenen aus §5.9, und über der Karte steht, was sichtbar ist („Showing 16 of 25 elements").
- **Druck und Export:** die Karte druckt mit Anker und Chip als Text unter jedem Knoten, eine Ebene (§5.9) je Seite mit
  dem Pfad als Kopfzeile. Passt eine Ebene nicht lesbar (Schrift ≥ 11 px) auf die Seitenbreite, druckt die
  Schrittliste statt der Karte — und sagt das in einer Zeile.

### 5.8 BPMN aus ABAP — die Palette

Mehr als das Minimum (ADR-031, Sonny 15.09.2026), aber nur, was der Code **belegt**: jedes Element entsteht aus einem
Muster im Code, trägt seinen Zeilenanker und übersteht den Austausch als BPMN 2.0 XML mit SAP Signavio. Maßstab ist das
komplexeste Beispiel des Produkts, `ZLEGACY_ORDER_FULFILLMENT_AUDIT` (1.000 Zeilen, `public/starter-examples/`).

| BPMN-Element | entsteht aus | im Beispiel |
|---|---|---|
| **Startereignis** | Einstieg: `START-OF-SELECTION`, Transaktion, BAdI-Methode, RFC-Baustein — **dazu (2.14): `FUNCTION name.`, eine öffentliche Methode einer *globalen* Klasse, ein Dynpro-Ereignis (`MODULE … OUTPUT` und `… INPUT`), und eine `FORM`, die kein `PERFORM` erreicht** | Audit-Lauf gestartet (L161) |
| **Endereignis** | normales Ende des Einstiegs | Audit abgeschlossen (L176–179) |
<!--
  Die vier neuen Einstiegsformen (2.14, 23.09.2026) und die drei Regeln, die sie
  eng halten — sie stehen hier, weil die Zeile darüber sonst als Einladung zum
  Raten gelesen wird.

  **Innerhalb einer Beweisart gibt es keine Rangfolge.** Zwei Funktionsbausteine
  sind zwei Einstiege, PBO und PAI sind zwei Einstiege, zwei User-Exits sind zwei
  Einstiege. Einen Vorrang gibt es nur *zwischen* Arten, und nur wo die Quelle
  selbst eindeutig ist: ein Programm, das `START-OF-SELECTION` schreibt, hat
  gesagt, wo es beginnt.

  **„Public" heißt nicht „von außen aufrufbar".** Der erste Entwurf las jede
  `PUBLIC SECTION` als Einstieg und gab `Z_ORDER_INTEGRITY_CHECK` sechs
  Startereignisse — aber `CLASS lcl_x DEFINITION` ohne `PUBLIC` ist nur innerhalb
  des Programms sichtbar. Verlangt wird jetzt `DEFINITION … PUBLIC`. Die eine
  Ausnahme sind RAP-Handler: dort ist die `FOR …`-Klausel der Beleg, nicht die
  Sichtbarkeit, und sie steht wörtlich in der Quelle.

  **Was auslöst, wird nicht geraten.** Jeder Einstieg, der kein Ereignisblock ist,
  trägt `triggerNotDetermined` — ein Funktionsbaustein namens `z_cc_idoc_input`
  bekommt kein IDoc-Startereignis. Der Name sagt IDoc; die Engine nicht.

  **Und „nicht anwendbar" ist ein Ergebnis.** Ein Upload, der nur ein Interface
  enthält, meldet `entry-not-applicable` mit Erklärung und dem nächsten Schritt
  („lade die implementierende Klasse hoch") — nicht null Schritte und auch nicht
  „kein Einstieg gefunden", was nach einem Fehler des Lesers klingt.
-->

| **Fehler-Endereignis** | `MESSAGE … TYPE 'E'/'A'/'X'`, `RAISE`, `LEAVE PROGRAM` nach Fehler | Selektion abgelehnt (L183, L189), nicht berechtigt (L202, L209) |
| **Eingeklappter Teilprozess** | eine `FORM`/Methode mit eigener Wirkung und mehr als drei Elementen; die Phasen eines Einstiegs | „Kunden anreichern" (L276–301), „Aktionen ausführen" (L435–451) |
| **Aufruf-Aktivität** | `CALL TRANSACTION`, `SUBMIT … AND RETURN`, Aufruf eines anderen eigenen Programms | Kundenauftrag ändern per Batch-Input, VA02 (L467) |
| **Task** | Schritt mit Wirkung ohne eigenen Typ | Simulierte Liefersperre vermerken (L442) |
| **Service-Task** | `CALL FUNCTION` lokal (BAPI, Funktionsbaustein) | Audit-Protokoll im Update-Task schreiben (L509) |
| **Send-Task** | Mail, Nachricht, IDoc-Ausgang (`SO_NEW_DOCUMENT_SEND_API1`, `MASTER_IDOC_DISTRIBUTE`) | Zusammenfassung mailen (L573) |
| **User-Task** | ein Mensch handelt im Programm: `CALL SCREEN`, Popup, Liste zur Ansicht im Dialog | Ergebnisliste ansehen, ALV (L616) |
| **Business-Rule-Task** | eine `FORM`, die aus Literalen einstuft oder punktet (`IF/ELSEIF`-Kette auf Geschäftsdaten); öffnet als **Entscheidungstabelle** | Kundenrisiko ableiten (L303–317), Auftragsrisiko punkten (L335–396) |
| **Exklusives Gateway** | `IF`/`CASE`/`CHECK` auf Geschäftsdaten, Bedingung wörtlich an jeder Kante | Risikopunkte ≥ 80 · ≥ 50 · sonst (L424–431) |
| **Paralleles Gateway** | nur wo der Code Parallelität beweist: `STARTING NEW TASK` mit `WAIT UNTIL`/`RECEIVE RESULTS`, bgRFC | — |
| **Bedingter Fluss** | Schalter des Selektionsbilds (`CHECK p_x = abap_true`) — als Bedingung am Fluss, nicht als eigenes Gateway | Kreditprüfung nur mit „RFC" (L399), Mail nur mit „Mail" (L558) |
| **Mehrfach-Instanz, sequenziell** | `LOOP AT <Tabelle>` über Geschäftsobjekte, **dessen Körper den Block nicht verlässt**; zeichnet der Körper kein Element, ist es eine Aktivität mit demselben Marker statt einer Ebene | je Auftrag (L423), je Position (L320), je Kunde (L287) |
| **Schleife** | `DO`/`WHILE` ohne Tabelle — **und jedes `LOOP AT`, das der Körper verlässt** (`EXIT`, `CHECK`, `CONTINUE`, `RETURN`, `STOP`, Fehler-Ende, `SUBMIT` ohne Rückkehr) | — |
| **Fehler-Randereignis** | behandelte Ausnahme: `EXCEPTIONS … = n` mit `sy-subrc`-Zweig, `TRY/CATCH` | RFC-Fehler: +10 Punkte, Warnung, weiter (L408–415) |
| **Timer-Zwischenereignis** | `WAIT UP TO n SECONDS` | — |
| **Nachrichten-Zwischenereignis (senden)** | Workflow-Ereignis (`SAP_WAPI_CREATE_EVENT`, `SWE_EVENT_CREATE`) | — |

**Die Ausnahme in den zwei Zeilen darüber, weil sie nicht selbstverständlich ist**
(2.17, 23.09.2026). Eine Mehrfach-Instanz sagt: *derselbe Ablauf, einmal je
Element*. Ein `LOOP AT`, aus dem ein `EXIT` herausspringt, sagt etwas anderes —
dort hängt der weitere Verlauf davon ab, **welche** Iteration abgebrochen hat, und
genau das kann ein Behälter nicht darstellen. Ein Zyklus kann es. Die Regel
entscheidet deshalb an den **Anweisungen** des Körpers, nicht am gezeichneten
Graphen, und ein `EXIT` in einer verschachtelten Schleife verlässt nur diese.

Gemessen an `ZLEGACY_ORDER_FULFILLMENT_AUDIT`: 11 Schleifen, 11 Marker, **0
Zyklen**, davon 9 mit eigener Ebene und 2 ohne (reine Rechenschleifen). Über alle
acht Beispiele 17 Schleifen und 17 Marker, und **keine `loop-back`-Kante mehr im
Export**.

Der Nebeneffekt, der die Regel fast verdorben hätte: `collapseSmallRegions` sah
die neuen kleinen Regionen und faltete ganze Iterationen in eine Box —
`AUDIT_TRAVEL_EXPENSES` verlor 7 von 13 Knoten. Eine Region, die eine
Mehrfach-Instanz enthält, ist deshalb nie ein Schritt.

| **Zugeklappter Pool + Nachrichtenfluss** | anderes System: `CALL FUNCTION … DESTINATION`, Mail-Empfänger, Dateisystem | Kreditsystem `PRD_CREDIT_RFC` (L401–402), Mail-Empfänger |
| **Datenspeicher** | gelesene/geschriebene Tabellen; SAP-Tabellen und Z-Tabellen unterscheidbar. In Business über das Overlay „Data" (§5.9) eingeblendet, in IT und im Export immer da | liest VBAK, VBAP, KNA1, KNB1, MARA, MARD; schreibt ZSD_ORD_RISK, ZSD_LEGACY_LOG |
| **Datenobjekt** | Datei, Ergebnisliste | CSV nach `C:\TEMP` (L538) |
| **Lanes** (Vorschlag) | AUTHORITY-CHECK, Benutzer-/Batchkontext, Benennung — immer *Model proposal* oder *Reconstructed* | Batch-Lauf · Prüfer (außerhalb des Programms) |
| **Textanmerkung** | was der Code nicht sagt, am Element: *Not determined*, fest verdrahtete Werte | „Review entry is a table row — who works on it is not determined" (L500) |

**Nicht in der Palette:** inklusives, komplexes und ereignisbasiertes Gateway (aus `IF`-Ketten nicht sicher
ableitbar), Kompensation, Eskalation, Transaktions- und Ereignis-Teilprozess, Choreografie. Commit-Grenzen und
Update-Task sind IT-Wissen und stehen im Overlay „Technical", nicht als BPMN-Konstrukt.

**Was nicht gezeichnet wird, wird gesagt:**

- **Nicht erreichter Code** — Formulare, die von keinem Einstieg aus aufgerufen werden, erscheinen nicht im Ablauf,
  sondern unter der Karte: *„Not reached from any entry point: 17 forms and 2 screen modules, 341 lines (L653–993)"*, mit Ankern. Im
  Beispiel: `legacy_business_rule_001` bis `_014`, Native SQL, `SUBMIT`, `CALL SCREEN`.
- **Klone** — gleich gebaute Formulare werden zusammengefasst: *„14 forms identical except the rule number"*.
- **Technische Helfer** — Formulare ohne eigene Wirkung (`add_log`, `bdc_dynpro`, `bdc_field`, `append_fieldcat`)
  werden Teil ihres Aufrufers; die Karte sagt *„4 technical helpers folded in · Show"*. Eine Form ist ein Schritt nur,
  wenn sie schreibt, ein anderes System aufruft, auf Geschäftsdaten entscheidet oder einen Menschen einbezieht.

### 5.9 Große Prozesse — Navigation

Das Beispiel ergibt voll aufgeklappt rund 90 Elemente. Kein Bildschirm zeigt das lesbar, und Verkleinern ist keine
Navigation. Deshalb gilt (ADR-032):

1. **Ebenen statt Zoom.** Die Karte öffnet in der **Übersicht**: die Phasen des Einstiegs als eingeklappte
   Teilprozesse, höchstens rund zwölf Elemente — im Beispiel Selektion prüfen · Berechtigung prüfen · Aufträge und
   Positionen sammeln · Kunden anreichern · Bestand prüfen · Risiko punkten · Kredit extern prüfen · Aktionen
   entscheiden und ausführen · Protokollieren und berichten. Enter oder Doppelklick öffnet einen Teilprozess als eigene
   Ebene; eine Ebene zeigt höchstens rund 25 Elemente, sonst teilt sie sich an ihren eigenen `PERFORM`s. „Expand here"
   klappt einen kleinen Teilprozess an Ort und Stelle auf.
2. **Pfad oben.** Eine Brotkrumenzeile über der Karte zeigt die Ebene — *Order audit › Decide and process actions ›
   Set delivery block* — jedes Glied springt zurück; `Alt+↑` geht eine Ebene hinauf.
3. **Gliederung links.** Die Schrittliste aus §5.7 wird zum **Baum** (`role="tree"`) in derselben Verschachtelung,
   jede Phase mit Zeilenbereich und Zählern (Entscheidungen · Befunde · hard-coded · not determined). Auswahl im Baum
   zeigt das Element auf der Karte und umgekehrt. Auf S ist der Baum die Karte.
4. **Die Übersicht ist schon eine Landkarte der Probleme.** Jeder eingeklappte Teilprozess trägt eine Zeile mit Text,
   nicht nur Farbe: *„2 D · 3 hard-coded · 1 not determined"*. Wer die Übersicht liest, weiß, wo er öffnen muss.
5. **Minikarte** unten rechts ab L: der sichtbare Ausschnitt als Rahmen, Ziehen verschiebt; Suchtreffer und Auswahl
   als Marken. `M` blendet sie aus. Nie auf S.
6. **Pfad hervorheben.** An einem Endereignis oder Knoten: *„Show paths to here"* — alle Wege vom Start dorthin bleiben,
   alles andere tritt zurück: Linien und Flächen in `--cc-line`, Beschriftungen in `--cc-ink-muted` (7,6 : 1) — nie
   Transparenz, die Text unter 4,5 : 1 drückt; *„Main path"* zeigt den Weg zum normalen Ende über die
   Standardzweige. Die Hervorhebung steht als Filterzeile über der Karte und ist mit einem Klick weg.
7. **Laufvarianten.** Die Schalter des Selektionsbilds stehen als Umschalter über der Karte — *Update mode · Batch input
   · Remote credit check · Mail · Download · Result list* — mit dem Wert aus dem Code als Vorgabe. Ein Schalter auf
   „off" blendet die Zweige aus, die dann nicht laufen können, und die Zeile sagt es: *„Showing the run with update
   mode off: delivery blocks are simulated"*. Nur Schalter, deren Bedingung im Code wörtlich steht.
8. **Overlays als Filter.** Findings · Level A–D · Hard-coded · Not determined · Data · Technical — je ein Umschalter
   mit Anzahl; ein Overlay markiert Elemente mit Text-Kennung, es verändert den Ablauf nicht.
9. **Suche springt.** ⌘K findet Elemente in allen Ebenen, öffnet die Ebene des Treffers, markiert ihn und nennt *„3 of
   7"*; Enter und Shift+Enter gehen weiter.
10. **Stabile Anordnung.** Dasselbe Programm ergibt dieselbe Anordnung — Nutzer lernen den Ort eines Schritts. Wer im
    Bearbeitungsmodus verschiebt, speichert eine Revision.
11. **Adresse für jede Stelle.** Ebene und Auswahl stehen in der URL (`#map=decide-and-process&node=gw-bdc`); ein Link
    öffnet genau dort — innerhalb der Einsicht, die das Konto hat.
12. **Tastatur zusätzlich zu §5.7:** Enter öffnet einen Teilprozess, `Alt+↑` eine Ebene hinauf, `F` passt ein, `M`
    Minikarte, `P` Pfad zum gewählten Element; alle Kürzel unter „Keyboard shortcuts" im Hilfe-Menü.

Im Export bleiben eingeklappte Teilprozesse echte BPMN-Teilprozesse — Signavio kann in sie hineinspringen wie die
Karte.

---

## 6. Hilfestellung

### 6.1 Müssen (Teil von 3.0)

| Hilfe | Gestaltung | Technik |
|---|---|---|
| **Why?** an jeder Zahl und jedem Status | „?"-Ziel, öffnet Herkunft, Regel und Beleg | Popover-Komponente; Daten aus Run und `lib/provenance.ts` |
| **Leere Zustände, die lehren** | Illustration, ein Satz Voraussetzung, eine Primäraktion | `EmptyState` (Schritt 1.5) |
| **Not determined** als eigener Bereich | §5.1, §5.5 | Engine-Grenzen (`support-matrix`), Prüfaufträge (Roadmap-Schritt 7.5) |
| **Fehler mit nächstem Schritt** | Message Strip mit Aktion, nie roher Fehlertext | Fehlerabbildung in der Komponente |
| **Glossar im Text** (ADR-034) | unterstrichenes Fachwort (§2.10), Erklärung per Tastatur erreichbar: höchstens zwei Sätze, „What it means for your decision", bei SAP-Begriffen die Quelle | `lib/glossary.ts` mit Quelle je Eintrag, zugängliches Popover |
| **Glossar in „Ask this case"** | Fachwörter in Antworten tragen dieselbe Unterstreichung und dasselbe Popover; eine Frage „What is …?" zu einem Glossarbegriff beantwortet der Eintrag selbst, mit Quelle und „No model call" | dieselbe Quelle wie im Text; die Antwort nennt, wenn sie aus dem Glossar kommt |
| **Beispiel-Hinweis** | Message Strip „Example project — fictitious code" | Projektfeld der Beispiele |
| **Der allererste Start** (ADR-030, ADR-041) | weil jeder Arbeitsbereich die Demo enthält, gibt es kein leeres „No projects yet": über der Liste steht die Karte „Your turn — start with an example (free) or your own code" mit `primary` „New project", solange neben der Demo kein eigenes Projekt existiert. Nur wenn die Demo nicht geladen werden kann, erscheint der Empty State „No projects yet" mit „New project" und „Try an example" | List Report |
| **Import, bevor er passiert** | „New project" sagt vor dem Hochladen: welche Dateien (ABAP-Quelltext, Includes, ZIP), was gelesen und gespeichert wird, was die Analyse kostet („Uses 1 of your 5 free analysis runs" oder eigener Gemini-Schlüssel, nach §2.8; getrennt davon, wo ein Modell aufgerufen wird), was ohne Modellaufruf entsteht, wer den Code sehen kann (nur das Konto, Einsicht nur per Einladung) | Import-Dialog; Kontingent aus dem Konto |
| **About this view** | ein Satz unter dem Sichten-Umschalter, welche Frage die Sicht beantwortet; der Link öffnet einen Absatz mit dem, was die Sicht zeigt und was nicht | Textschlüssel je Sicht |
| **Tastatur, Screenreader, Telefon** | §1.6, §2.9, §5.7 | Schritt 3.0.4 |

**Das Glossar zum Start** (ADR-034, Sonny 15.09.2026) — ein Begriff gehört hinein, wenn er auf einem Screen von 3.0
steht und ein Prozessverantwortlicher oder Manager ihn nicht sicher kennt:

- **A · SAP und Clean Core:** Clean Core · Clean core levels A–D · Released API · Classic API · Cloudification
  Repository · Successor · ABAP Cloud · Key user extensibility · Developer extensibility (on-stack) · Side-by-side
  extensibility (SAP BTP) · BAdI · Modification · Customizing · Scope item · Fit-to-standard · Public Edition and
  Private Edition · ABAP Test Cockpit (ATC) · Usage data (SCMON, SUSG) · BPMN · SAP Signavio — dazu aus dem heutigen
  Glossar RAP, CDS View, OData, SAP LUW; die doppelten Einträge „BTP" und „SAP BTP" werden einer.
- **B · Begriffe dieses Produkts** — niemand kann sie anderswo nachschlagen: Line anchor · Traceability · Run and signed
  run · Provenance · Not determined · Evidence level E0–E4 · Readiness („a grade, not a compliance percentage") · The
  four buckets · Simulation · Hard-coded rule · Check task · Confirmed („a self-declaration, not a mandate") ·
  Unreached code · Sub-process level.
- Fachbegriffe eines einzelnen Prozesses (Freigabestrategie, Infosatz, Werk) gehören nicht ins Produktglossar.

### 6.1.1 „New project" — erst verstehen, dann starten

Wer in „My workspace" auf „New project" klickt, bekommt zuerst in wenigen Sekunden, **was Clean-Core.io ist und was es
anders macht**, sieht **die drei Sichten in Bewegung** und wählt dann **Beispiel oder eigener Code** (ADR-038, Sonny
15.09.2026). Eine Seite, zwei Teile, kein Wizard mit Fortschrittsbalken.

**Teil 1 — Was es ist** (beim ersten Mal offen; danach eine Zeile „What is Clean-Core.io? · Show", gemerkt im
Browser):

- **Ein Satz Kern:** *„Understand a piece of custom ABAP and decide what happens to it — every statement tied to a line
  of your code."*
- **Drei Zeilen, was anders ist**, je mit Icon, keine Wörter aus der Stilliste (§3.1):
  1. *„Reads your code before any model does. Every finding points to a line."*
  2. *„Says what it could not determine — and never passes an assumption off as a fact."*
  3. *„One case, three views: Business, IT and Management see the same facts, each answering its own question."*
- **Clean Core in drei Blicken** — beim ersten Mal sichtbar, ohne Klick; eine Zeile hoch, wo es geht (ADR-040,
  Sonny 15.09.2026). Sachlich, in der Sprache der SAP-Community, jede Angabe mit Quelle:
  1. **What clean core means.** Ein Satz — *„Keep the SAP core standard: extensions use only released, upgrade-stable
     interfaces — in-app with ABAP Cloud or side-by-side on SAP BTP."* — und ein kleines Schema: der SAP-Kern als
     Block mit seiner Grenze aus freigegebenen Schnittstellen, daneben *in-app* und *side-by-side*, eine Modifikation
     als Eingriff in den Kern.
  2. **The four levels.** Eine Leiter A → D mit Kennungen und Farben nach §1.8 (A `information`, B `neutral`, C
     `warning`, D `error`) und je einer Zeile: **A** released SAP APIs and extension points · **B** classic SAP APIs
     following SAP's recommendations · **C** internal SAP objects — only with a changelog check before each upgrade ·
     **D** not recommended — modifications, implicit enhancements, writes to SAP tables. Darunter: *„Levels follow
     SAP's clean core level concept. The level shown for an object is our reading of SAP's published data — an
     orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit."*
  3. **Where the evidence comes from.** Ein Fluss in Leserichtung — nebeneinander, wo die Breite reicht, sonst von
     oben nach unten —, jede Station mit Herkunfts-Chip (§4):
     *Your ABAP source* (jede Aussage mit Zeilenanker) → *deterministic engine* (Regelversion) → *SAP's published
     data*: Cloudification Repository — release states and successors — und die Klassifikationsdatei von SAP, mit
     Anzahl und **Stand des letzten Abgleichs** aus dem Katalog, nie fest im Text (*Imported*) → *your imports*,
     optional: ATC results, usage data (*Imported*) → *a language model* nur für Namen und Formulierungen (*Model
     proposal*). Eigene Z-Objekte ohne Katalogeintrag tragen *„estimated from the code, no SAP catalog entry"*.
  Auf L drei Spalten, auf M zwei plus eine, auf S untereinander — die Leiter bleibt senkrecht, der Fluss wird von
  oben nach unten. Keine Illustrationen mit Personen, keine Stockfotos, keine Verläufe; Linien in `--cc-field-border`,
  Kennungen wie im Arbeitsraum.
- **Die drei Sichten in Bewegung** — das Einzige, was sich auf dieser Seite bewegt:
  - Eine kompakte Bühne mit dem **echten** Sichten-Umschalter darüber (dieselbe Komponente wie im Arbeitsraum — wer
    ihn hier gesehen hat, kennt ihn dort).
  - **Eine Tatsache wandert durch drei Sichten.** Aus dem Beispiel „Emergency purchase approval" die Regel *Vendor
    block list* mit ihrem Anker `L231`. Der Anker bleibt fest an seinem Platz — er ist das Zeichen, dass es dieselbe
    Tatsache ist —, nur der Inhalt um ihn wechselt:
    - **Business** — *„Do I still need this?"* · „Rejects requisitions for vendors on the block list" · Tag *hard-coded
      in program* · Keep · Change · Drop
    - **IT** — *„What exactly, where to?"* · `Z_MM_PO_APPROVAL` `L225–234` · liest die eigene Tabelle
      `ZMM_VEND_BLOCK` direkt · *„estimated from the code, no SAP catalog entry"* — kein Level-Buchstabe, weil ein
      Kundenobjekt keinen Katalogeintrag hat
    - **Management** — *„What do I risk, what do I decide?"* · „Rebuild — part of decision DEC-1" · Kosten nur mit
      *Simulation*
  - **Ablauf:** Umschalter-Markierung gleitet, Inhalt blendet über (je 200 ms), jede Sicht steht 3,5 s. **Ein
    Durchlauf** Business → IT → Management, dann bleibt die Bühne auf Business stehen, mit „Replay". Keine
    Endlosschleife.
  - **Bedienung:** Hover oder Fokus hält an; ein Klick auf eine Sicht übernimmt und beendet das automatische Wechseln.
    „Skip intro" ist immer sichtbar.
  - **`prefers-reduced-motion` und S:** kein automatisches Wechseln. Mit reduzierter Bewegung stehen die drei Sichten
    als drei schmale Spalten nebeneinander; auf S wählt man per Umschalter.
  - **Screenreader:** der Umschalter ist eine Tab-Liste, die Bühne ihr Panel; automatisches Wechseln sagt nichts an.
  - **Ehrlich:** alle Inhalte aus dem echten Lauf des Beispiels, beschriftet *„Example · Emergency purchase approval ·
    fictitious code"* — kein gestelltes Marketingbild.

**Teil 2 — Wie starten?** Zwei Auswahlkarten, eine Primäraktion, deren Beschriftung der Wahl folgt:

- **„Try an example"** — beim ersten Mal vorausgewählt. Die acht Beispiele als kurze Zeilen aus
  `lib/starter-examples.ts`: Name, ein Satz, was es zeigt, Zeilen, *small*/*large*; das 1.000-Zeilen-Beispiel mit
  *„large — shows how big processes stay readable"*. Primäraktion „Open example" → Aufbau (§5.2).
- **„Use your own code"** — Primäraktion „Continue to upload" → Import-Dialog (§6.1, „Import, bevor er passiert").
- Unter beiden steht, was gezählt wird (§2.8, Roadmap 0.9): bei einem Beispiel *„Free — examples don't use your
  analysis runs the first time"*; bei einem schon gelaufenen Beispiel vor dem Start der Warnhinweis *„You ran this
  example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes."* als Message Strip
  `warning` mit „Run again" und „Open the earlier result"; bei eigenem Code *„Uses 1 of your 5 free analysis runs (4
  left)"* oder der eigene Gemini-Schlüssel.

### 6.1.2 Das Demo-Projekt — warm werden, dann selbst starten

Jedes Konto findet in „My workspace" ein **vollständig durchgespieltes Demo-Projekt**, das es gefahrlos durchklicken
kann; überall darin steht die Einladung, jetzt ein Beispiel oder eigenen Code zu starten (ADR-041, Sonny 15.09.2026).
Ziel: die Schwelle zur ersten eigenen Nutzung immer weiter senken.

- **Deutlich markiert.** In der Liste die erste Zeile mit Tag *Demo* und *„Fully worked example · fictitious code"*;
  im Projekt oben ein Message Strip `information`: *„Demo project — fully worked, fictitious code. Nothing you do here
  is saved."* mit „Reset demo". Das Demo-Projekt ist nie mit einem eigenen Projekt zu verwechseln: sein Titel beginnt
  mit „Demo ·"; startet das Konto dasselbe Beispiel selbst, trägt das eigene Projekt den Namen des Beispiels ohne
  diesen Vorsatz.
- **Vollständig durchgespielt.** Jede Stufe und jede Sicht hat Inhalt: Analyse mit signiertem Lauf, bestätigte Regeln,
  Standard-Fit mit Evidenzstufen, Kosten als *Simulation* mit Annahmen-Revision, eine bestätigte Entscheidung,
  Übergabepaket. **Alles aus einem echten Lauf** eines Beispiels — keine erfundenen Zahlen; ändert sich Engine oder
  Regelversion, wird die Demo mit dem Release neu erzeugt.
- **Klicken ohne Folgen.** Bestätigen, Entscheiden, Filtern und Bearbeiten funktionieren; der Zustand lebt nur im
  Browser und verschwindet mit „Reset demo". Nichts wird gespeichert, nichts zählt aufs Kontingent.
- **Eine Demo für alle, keine Kopie je Konto.** Das Konto bleibt unverändert, es entstehen keine Daten je Nutzer, und
  die Demo ist immer auf dem Stand des Produkts — auch für Konten, die es schon gibt.
- **Eine neue Demo, nicht die alte weitergeführt** (ADR-052). Die Stufen der Demo (heute `/demo/[stage]`) werden nach
  dieser Datei neu gebaut: dieselben Stufenköpfe (§2.3), Tokens, Chips und Meldungen wie im eigenen Projekt. Die Demo
  bleibt eine eigene Route ohne Pfad zu Signieren, Kontingent und Export — neu ist das Aussehen, nicht diese Grenze.
- **Die Tour** — mehr Coach Marks als im eigenen Projekt, weil hier gelernt wird: rund zwölf Stationen entlang des
  Wegs — Enthüllung · Not determined · Prozesskarte und Quellspalte · Ebenen eines großen Prozesses · eine Regel
  bestätigen · Standard-Fit · IT-Kette · Management-Sicht · vier Töpfe · Kosten als Simulation · Entscheidung ·
  Übergabe (Sichten in der Reihenfolge Business · IT · Management, ADR-044). Eine Station erscheint erst, wenn man an ihrem Ort ankommt; immer nur eine; *„3 of 12"* als Text; „Next",
  „Pause tour", „End tour". Fortschritt nur im Browser (ADR-036).
- **Immer wieder die Einladung — ohne zu drängen:**
  - im Demo-Strip dauerhaft: *„Try an example or your own code"* als Link zu „New project";
  - am Ende jeder dritten Tour-Station und am Ende der Tour eine Karte *„Your turn: start with an example (free) or
    your own code"* mit `primary` „New project";
  - in „My workspace", solange neben der Demo kein eigenes Projekt existiert, eine Karte über der Liste mit derselben
    Einladung.
  - Höchstens **eine** Einladung je Bildschirm, nie als Dialog, nie blockierend — steht die Karte am Ende einer
    Station, tritt der Link im Demo-Strip so lange zurück. Sobald das Konto ein Beispiel oder eigenen Code gestartet
    hat, bleibt nur der Link im Demo-Strip.

### 6.1.3 Eigener Code — Vertrauen, bevor hochgeladen wird

Wer eigenen Code hochlädt, gibt etwas Wertvolles aus der Hand. Der Import-Dialog sagt deshalb neben dem Hochladen, in
ruhigem Ton, was gilt und was wir tun — nur Belegtes, jede Aussage mit Link auf die Stelle, die sie trägt (ADR-042,
Sonny 15.09.2026):

- **Was du zusagst** — eine Zeile, kein zusätzliches Häkchen (die Nutzungsbedingungen sind bei der Anmeldung
  akzeptiert): *„By uploading, you confirm you may share this code for analysis, including with the Google Gemini API
  (Terms §5 and §8)."*
- **Was wir tun, damit du uns vertrauen kannst:**
  - *„Stored in the EU — Google Cloud, Belgium (europe-west1)."* (Privacy Policy)
  - *„Only your account and the platform's administrator account can open this project. Others see it only if you
    invite them."* (`firestore.rules`: Besitzer oder Admin — nie ohne den Admin nennen, solange die Regel ihn zulässt;
    die Datenschutzerklärung soll den Admin-Zugriff nennen, bevor die Karte live geht)
  - *„Model calls go through our server; keys never reach the browser. Your own key is stored encrypted."* (Terms §5,
    „How we handle your data" `/trust`)
  - *„Every analysis is sealed as a signed, unchangeable run."* (`SECURITY.md` §14)
  - *„No analytics, advertising or tracking cookies."* (Privacy Policy §7)
  - *„Delete your account and projects at any time; backup copies age out within 30 days."* (Privacy Policy §5, §6)
  - *„With our community key, Google does not use your code to train its models (paid Gemini API terms). With your
    own key, your Google account's terms apply."* (Privacy Policy — die den bezahlten Tarif des Community-Schlüssels
    ausdrücklich nennt, bevor die Karte es sagt; Sonny 15.09.2026: der Community-Schlüssel läuft über einen bezahlten
    Schlüssel)
  - *„Our security model is public."* — verlinkt auf **„How we handle your data"** (`/trust`) und auf `SECURITY.md` im
    öffentlichen Repository
    (`https://github.com/sonnyfrenzel-rgb/clean-core.io/blob/main/SECURITY.md`)
- **Kein kommerzielles Projekt:** *„Clean-Core.io is a free community project. There is no paid tier, we accept no
  payment, and we do not sell, rent or commercially use your code."* (Terms §2, Privacy Policy)
- **Form:** eine Karte „Your code and your trust" in der Seitenspalte des Import-Dialogs, Aussagen als kurze Zeilen
  mit Icon, Links als Text; auf S unter dem Formular, eingeklappt mit „Why you can trust this · Show". Keine Siegel,
  keine Zertifikats-Logos, keine Superlative.

### 6.2 Wollen (nach Nutzen gereiht)

1. **Drei Coach Marks beim ersten Arbeitsraum** — „Select the decision", „This is what we could not determine", „Your
   next step". Abweisbar, gemerkt **nur im Browser** — nie im Konto, nie in der Datenbank, kein Nutzungsprotokoll
   (ADR-036). „Show tips again" im Hilfe-Menü holt sie zurück.
2. **„Ask this case"** — immer die eingebettete Hilfe-KI, für 3.0 ausgebaut (ADR-043): im Projekt beschränkt auf die
   Evidenz des Projekts, antwortet mit Ankern; außerhalb Produkt- und SAP-Hilfe; ein Assistent, kein zweiter Chat; die erste,
   vorab beantwortete Frage kommt ohne Modellaufruf aus dem Code (§5.3).
3. **Checkliste bis zur Entscheidung** — aus dem nächsten Schritt abgeleitet, ohne Modellaufruf. Die Muss-Form davon
   ist die Karte „Next step" (§2.3).

---

## 7. Regeln für Agenten und Beiträge

- Ein SAP-Fiori-Guidelines-Skill (falls eingerichtet) wird **nur** für Layout, Verhalten, Benennung und
  Barrierefreiheit befragt; jede Farb-, Schrift- und Abstandsangabe daraus wird ignoriert — es gelten §1 und die Tokens.
- Kein SAP-Theme (Horizon, Quartz), keine Schrift „72", keine `sapUi*`-Variablen, keine UI5 Web Components.
- Eine neue Farbe, ein neuer Radius, ein neuer Abstand oder ein fünfter Button-Stil ist eine Änderung dieser Datei mit
  ADR, kein Detail im Code.
- Jede Aussage auf dem Schirm hält die Produktregel: fehlend bleibt fehlend, simuliert bleibt simuliert, rekonstruiert
  bleibt rekonstruiert (`docs/ROADMAP.md` §11).
- Der UX-Agent prüft neue Oberflächen gegen diese Datei (`docs/UX-REVIEW-AGENT.md`); vor dem Bau einer neuen Fläche
  prüft er Entwurf und Mockups (`node scripts/ux/design-review.mjs`).

### 7.1 Druck und Export

- `@media print`: kein Hintergrund, Text `--cc-ink` auf Weiß, Karten mit 1-px-Rahmen statt Schatten, keine Werkzeug-
  und Fußleisten.
- Chips drucken **Wort und Icon** (Icons einfarbig), Zustände bleiben ohne Farbe unterscheidbar.
- Anker und IDs werden als Text gedruckt; Links mit Ziel in Klammern, wo es kein Anker ist.
- Umbrüche nicht mitten in einer Karte oder Tabellenzeile.

---

## 8. Wie es gehalten wird

| Regel | Guard |
|---|---|
| Landing- und Stufenköpfe aus einer Komponente | `tests/landing-style-guard.spec.ts`, `tests/workflow-style-guard.spec.ts` (vorhanden) |
| **Kontrast aller Token-Paare** (Text ≥ 4,5 : 1; Feld-, Button-, Value-State- und Chip-Rahmen sowie Fokus ≥ 3 : 1 gegen ihre Fläche) | Kontrast-Guard aus Schritt 1.5: rechnet WCAG-Kontraste aus den Tokens in `app/globals.css` — ohne neue Abhängigkeit; axe/pa11y auf gerenderten Seiten danach als eigener Schritt |
| Chips in drei Formen (gefüllt, Umriss, gestrichelt) nach §4; unter `forced-colors` und im Druck unterscheidbar | Guard aus Schritt 1.5 über `lib/provenance.ts`, gerendert mit `forcedColors: 'active'` |
| Prozesskarte: ein Tab-Halt, Pfeiltasten, benannte Knoten, Schrittliste gleichwertig (§5.7) | gerenderter Tastatur-Test aus Schritt 2.5 |
| Überschriftenfolge `h1` → `h2` → `h3` je Sicht; jede Live-Region höchstens eine Ansage je Ereignis; Message Box modal und `inert` dahinter | gerenderter Test aus Schritt 3.0.4 |
| Objektstatus, Evidenzstufe, Level, Regel-Eigenschaft und Schwere nur aus ihren festen Listen, in ihrer Form (§4.1) | Guard aus Schritt 1.5 |
| Tokens statt Hex-Literale, vier Button-Stile, Schrift ≥ 11 px, Abstände aus der Skala | Style-Guard aus Schritt 1.5 |
| Herkunft nur aus `lib/provenance.ts`; Grün nur für `proven`/`success` | Guard aus Schritt 1.5 |
| Keine Zustandsfarbe ohne Text; Fokusring an jedem bedienbaren Element | Style-Guard, gerendert geprüft |
| Sichtbare Texte neuer Komponenten nur über Textschlüssel | Guard aus Schritt 1.5 |
| **Keine KI-Spuren:** keine Markdown-Reste, Blocklisten-Wendungen oder KI-Symbolik in gerenderten Seiten, HTML-/PDF-Exporten und Mails | Guard aus Schritt 1.5: scannt den gerenderten Text und die Exporte gegen Markdown-Reste und die **Blockliste** aus §3.1 (`.md`-Exporte ausgenommen); Copy-Guard über `app/`, `components/`, `lib/`. Die **Stilliste** prüfen QA- und UX-Agent als Hinweis, kein Guard |
| Druckbild: Chips mit Wort, keine Leisten | gerenderter Test mit `emulateMedia({ media: 'print' })` |
| Kein Dark Mode | Guard aus Schritt 1.6 |

---

## Änderungen an dieser Datei

| Version | Datum | Was |
|---|---|---|
| 1.5 | 24.09.2026 | Entscheidungen E-1 bis E-7 aus Block D („die ganze App aus einem Guss"), Sonny 24.09.2026 (ADR-047 bis ADR-053): 12 px / 600 als Stufe „Meta/Chip" in der Skala (§1.2); 2 px nur in Chips, Kennungen und zur Icon-Ausrichtung, 6/10/14 px nicht (§1.3); Stufenkopf wie Projekttitel 22 px / 800, `--cc-ink`, neutrales Icon, „Back to workspace" (§1.2, §2.3); Schwere eines Befunds als feste Liste `lib/severity.ts` mit Kennungsform und Farben (§1.8, §4.1, §8); Tokens statt Palette auch auf öffentlichen Seiten, große Radien und Mesh nur dort (Einleitung, §1); altes Dashboard und alte Stufen-Demo werden nach dieser Datei neu gebaut, nichts wird entfernt statt umgebaut (§2.2, §6.1.2); deutsche Datenschutzerklärung als Rechtstext-Ausnahme von §3 |
| 1.4.3 | 15.09.2026 | Abgleich mit der abgenommenen Landingpage 3.0: Vertrauenssatz nennt den Admin-Zugriff, den `firestore.rules` zulässt; Quelle für den verschlüsselten Schlüssel ist Terms §5 und `/trust`, nicht `SECURITY.md` §4 (das sind S/4-Zugangsdaten); Tour-Stationen in der Sichten-Reihenfolge Business · IT · Management; Bewegung auf der Startseite, Fokusring auf Code-Fläche, Gewichte des `SectionHeader` |
| 1.4.2 | 15.09.2026 | „Ask this case" läuft immer über die eingebettete Hilfe-KI, die für 3.0 ausgebaut wird (ADR-043, §6.2) |
| 1.4.1 | 15.09.2026 | Klarstellungen aus dem letzten Mockup-Abgleich, keine neue Entscheidung: Projektstatus-Zeile ohne *Not determined* (steht in der Enthüllung); Werkzeuge als Menü in Business und Management, leere Ebenen unter „More" auch in §2.3; Pfad-Hervorhebung über Farbe statt Transparenz (Kontrast); die IT-Sicht der Sichten-Bühne ohne Level-Buchstaben für eine Kundentabelle; Evidenz-Fluss nebeneinander oder untereinander; kein leerer Arbeitsbereich neben der Demo; Demo-Titel „Demo ·"; eine Einladung je Bildschirm auch am Stationsende; Tour-Beispiel „3 of 12"; „derselbe eigene Quellstand" in §2.8 |
| 1.4 | 15.09.2026 | Entscheidungen von Sonny zu den offenen Fragen der Design-Reviews (ADR-031 bis ADR-042): BPMN-Palette über das Minimum, gemessen am 1.000-Zeilen-Beispiel, mit User-Task, Datenspeicher, Business-Rule-Task, Aufruf-Aktivität, Teilprozessen, Rand- und Nachrichtenereignissen; nicht erreichter Code, Klone und technische Helfer werden gesagt statt gezeichnet (§5.8); Navigation großer Prozesse mit Ebenen, Pfad, Gliederungsbaum, Minikarte, Pfad-Hervorhebung, Laufvarianten, Overlays als Filter und Adressen (§5.9); vier Töpfe als Regeln je Objekt, abhängig von der Zielplattform, Retire aus Nutzung erst ab 13 Monaten und durchsichtig (§5.6); Glossar zum Start mit SAP- und Produktbegriffen, auch in „Ask this case" (§6.1); Coach Marks nur im Browser (§6.2). Lücken aus dem Mockup-Abgleich geschlossen: Ort von „Next step" je Sicht, schrumpfender Business-Kopf, Kartentitel `h3`, Objektstatus „handed over" und „done", Herkunft der Readiness, Quellspalte ohne Umbruch der Seite, „Why?" auf S. Bestätigt: alles Englisch (ADR-009), kein Dark Mode (ADR-003). Entschlackung für Erstnutzer ohne Verlust an Tiefe (ADR-037, §2.11). „New project" erklärt Kern und Unterschied und zeigt die drei Sichten in Bewegung, bevor man Beispiel oder eigenen Code wählt (ADR-038, §6.1.1); Beispiele einmal frei, Wiederholung vorher angekündigt (ADR-039); Clean Core, die vier Level und die Herkunft der Evidenz in drei Blicken beim ersten Ausprobieren (ADR-040); ein vollständig durchgespieltes Demo-Projekt für alle Konten mit Tour und wiederkehrender Einladung (ADR-041, §6.1.2); vor dem Hochladen Zusage und belegte Vertrauensaussagen, „free community project" (ADR-042, §6.1.3) |
| 1.3 | 15.09.2026 | Zweites Design-Review des UX-Agenten, diesmal mit den Mockups 2.8 (ADR-026 bis ADR-030): Business-Kopf mit eingeklappter Projektstatus-Zeile in Klarsprache, „About this view" als Satz unter dem Umschalter, Überschriftenfolge (§2.3); weitere feste Listen mit eigener Form — Objektstatus, Evidenzstufe, Level, Regel-Eigenschaft (§4.1); Message Box modal, dunkel nur für Code-Fläche und Überlagerung (§1.1, §2.6); „ein Bereich" für die Primäraktion definiert (§1.5); Management antwortet vor der Zahl, IT-Kette je gewähltem Befund mit Abdeckung (§5.6); allererster Start, Import-Erklärung und „About this view" als Muss (§6.1); Live-Ansagen nur je Etappe (§2.8); Kontrast-Paare eindeutig beschriftet. Kontingent-Texte an `COMMUNITY_QUOTA` angeglichen: fünf Analyse-Läufe, Modellaufruf als eigene Angabe (§2.8) |
| 1.2 | 15.09.2026 | Design-Review des UX-Agenten eingearbeitet (ADR-015 bis ADR-021): nach dem Aufbau führt das Geschäft, der Code wird zweite Ebene (§5.1); Enthüllung sagt „hard-coded in the program" statt „nobody documented" — nur, was der Code belegt; Prozesskarte ohne Maus mit Schrittliste, Pfeiltasten, benannten Knoten und Druckregel (§5.7); Chips mit Form als zweitem Merkmal — gefüllt, Umriss, gestrichelt (§4); Zusammenspiel von Sicht, Ebene und Werkzeug mit Start und URL, Sicht in der URL ist keine Freigabe (§2.3); lange Läufe mit Kontingent vor dem Klick, Abbrechen, Verlassen, Fehler-Strip (§2.8); sichtbare Grenzen ≥ 3 : 1 — Feld, Ghost, Secondary, Value States (§1.1); `forced-colors` als Ersatz für Dark Mode; Live-Regionen für Filter und Etappen, fokussierbarer Strip, Toast mit `role="status"`; Zielgrößen und Reihenfolge auf S (§2.9); Suche, „Why?"-Popover, Glossar und Initialen (§2.10); Floskelliste geteilt in Blockliste (Guard) und Stilliste (Hinweis); Verweise auf Roadmap-Schritte eindeutig. Abgleich mit den Mockups 2.8 (ADR-022 bis ADR-025): Kostenbeträge entstehen nur in Economics und erscheinen anderswo nur mit *Simulation*, Annahmen-Revision und „Open in Economics", Beträge im Code sind Codefakten (§3); Statuszeile als Objektstatus getrennt von Herkunfts-Chips (§2.3); Level A–D und Catalog Match als *Imported*, Level A blau statt grün (§1.8, §4); Etappe 3 hält den Aufbau nicht auf (§5.2); Facetten im Aufbau wie im Kopf; Breite der Karte bei offener Quellspalte (§5.7); Code-Fläche mit Tokens und Kontrasten (§1.1); Segmented Control, Icon-Button und „Why?"-Ziel (§1.5) |
| 1.1 | 15.09.2026 | Keine KI-Spuren (ADR-014, §3.1): keine Markdown-Reste, Chatbot-Floskeln oder KI-Symbolik; Herkunft nur über den Chip. Erster Blick neu gefasst (ADR-013): Wow als Inhalt mit Zeilenanker — der Code spricht zuerst, Knoten wachsen aus ihren Zeilen, Enthüllungszeile der undokumentierten Regeln, Zweifel sofort beantwortet, eine Frage vorab aus dem Code beantwortet, Standard-Kandidat als zweite Überraschung, Export statt öffentlichem Link; ausdrücklich nicht: Konfetti, Typewriter, Mindestdauern. Externe Durchsicht eingearbeitet (ADR-007 bis ADR-012): Primärfläche `--cc-brand-strong` (Weiß auf `#16a34a` hatte 3,3 : 1); Grün nur für Nachweis, *Confirmed* in `information`; *Stale* als `warning`; Sichten als Segmented Control statt zweiter Navigationsleiste; Stufen in eine Werkzeugleiste, „Next step" als Karte, Fußleiste nur beim Bearbeiten; UI-Sprache Englisch mit Textschlüsseln; Arbeitsraum mit 12/8-px-Radien und ohne Mesh; Dichte nach Eingabegerät; `dark` nur für bindende Bestätigung; Gewichte 800/700/600/500; Aufbau ≤ 3 s; neu: Abstandsskala, Fokus-Token, Formulare und Value States, Filterleiste, Laden, Breakpoints, Diagrammpalette, Formate, Druck, Kontrast-Guard; Entscheidungen ins Entscheidungslog |
| 1.0 | 15.09.2026 | Erste Fassung |
