# Clean-Core.io — Roadmap bis 3.0

**Fassung 2.8 · Stand 15.09.2026 · gültig ab v2.9.11 · ersetzt Fassung 2.7 vom 12.09.2026**

Diese Datei ist die einzige verbindliche Roadmap. Sie sagt drei Dinge: **in welchen
Phasen und kleinen Schritten der UX-Umbau entlang der Mockups 2.7 zu 3.0 wird**,
**was bewusst nicht gebaut wird**, und **was noch zu entscheiden ist**.

Neben dieser Datei gibt es genau zwei aktive Roadmap-Dokumente; alles Frühere liegt
im [Archiv](archiv/README.md). Abnahmefälle (W22, C23, QA24, V25) und Befund-IDs
(CR-nn, Exx) werden weiter zitiert — definiert sind sie in den archivierten
Quelldokumenten. **Wo ein archiviertes Dokument dieser Datei widerspricht, gilt
diese Datei** — das betrifft vor allem Konto, Rollen, Teilen und die Reihenfolge (§2).

| Dokument | Rolle |
|---|---|
| [`roadmap/clean-core-mockups-v2_7.html`](roadmap/clean-core-mockups-v2_7.html) | **Zielbild von 3.0.** Die bewussten Abweichungen stehen in §5 |
| [`roadmap/SCHNITT-0-UMFANG.md`](roadmap/SCHNITT-0-UMFANG.md) | Arbeitspakete von Phase 0 (v2.10), mit den Änderungen aus §4 |
| [`archiv/roadmap-2.7/`](archiv/README.md) | Fassung 2.7, Backlog-Langfassung mit den Abnahmekatalogen, Review vom 08.09. mit dem Befundregister, ID-Brücke, Schnitte A–C, Teilschnittgraph |
| [`archiv/ROADMAP-2.0.md`](archiv/ROADMAP-2.0.md) | Begründung von v2.0, warum Enterprise-Funktionen zurückgestellt wurden |
| `docs/BACKLOG.md` | Arbeitsprotokoll: was tatsächlich released wurde |

---

## 1. Die Ausrichtung in fünf Sätzen

1. **Clean-Core.io bleibt ein freies Community-Werkzeug**, das ein Stück Custom
   Code vom unverstandenen Z-Programm zur belegten Entscheidung bringt — die
   deterministische Engine zuerst, jedes Ergebnis signiert.
2. **3.0 ist der große UX-Umbau entlang der Mockups 2.7:** ein Arbeitsraum je
   Projekt, in dem Prozess, Standard, Kosten, Architektur und Entscheidung
   zusammenliegen. Die sieben heutigen Stufen bleiben als Werkzeuge erhalten. Nach
   außen gibt es nur diesen einen Sprung.
3. **Die Business-Sicht wird der stärkste Teil.** Der Prozess wird aus dem Code als
   BPMN rekonstruiert, jedes Element mit Zeilenanker, bearbeitbar wie in einem
   Prozessmodellierer und über BPMN 2.0 XML mit SAP Signavio austauschbar — für
   alle, die Signavio selbst lizenziert haben.
4. **Die Verantwortung bleibt beim angemeldeten Nutzer.** Management-, Business-
   und IT-Sicht ordnen nur die Darstellung. Sie werden nirgends gespeichert und
   berühren weder Ergebnis, Signatur noch Audit-Pack.
5. **Anmeldung und Konto bleiben, wie sie sind.** Geteilt wird per Einladung an
   eine E-Mail-Adresse: Die eingeladene Person meldet sich wie gewohnt an,
   akzeptiert die Terms und bekommt Einsicht.

**USP:** Vom unverstandenen Z-Programm zur belegten Entscheidung — frei,
verifizierbar, ohne SAP-Lizenz.

---

## 2. Was sich gegenüber Fassung 2.7 ändert

| Thema | Fassung 2.7 (12.09.) | Fassung 2.8 (15.09.) |
|---|---|---|
| **Konto** | Konto = E-Mail + Handle; Namensfelder, `tier 'enterprise'`, `orgId` und Okta-/Azure-Felder entfernen, bestehende Konten migrieren, Beiträge beim Löschen pseudonymisieren | **Keine Änderung.** Kein Handle, keine Migration. Registrierung, Onboarding, Profil und Mails bleiben |
| **Rollen** | Virtuelle Rolle („Playing as") am Beitrag, `self_play`-Kennzeichen, getrennte Rollen-Mandate, Rolle und pseudonyme Signer-ID in Pack und MCP | **Nur Sichten.** Kein Rollenattribut an Beiträgen, Runs, Signaturen oder Exporten. Bestätigt wird vom Konto — als Selbstauskunft, wie heute schon in der Design-Stufe (`lib/workflow-steps.ts:262`) |
| **Teilen** | Fallfreigabe an benannte Mitglieder, Rechte Lesen/Kommentieren/Bearbeiten, Rohcode-Schalter, Journal — ein L-Neubau mit eigenem Quelldokument | **Einsicht per Einladung:** E-Mail-gebundener Link, lesen inklusive Quellcode, Ablauf und Widerruf |
| **Prozess / BPMN** | R2 (v2.12); „ein vollständiger BPMN-Editor ist kein 3.0-Muss" | **Eigene Phasen direkt nach dem Gerüst:** Rekonstruktion aus dem Code, Editor, Import/Export mit geprüftem Signavio-Rundlauf |
| **Fall** | Eigener Fallzuschnitt über mehrere Objekte (L) | **Projekt = Fall.** Kein neues Fallmodell |
| **Decision Request** | Antwort per Link, ohne Mandatswirkung | **entfällt** — wer mitreden soll, bekommt Einsicht |
| **Planung** | Gates R0 · R1 · R2 · 3.0 mit 76 Teilschnitten bis Größe XL | **Phasen 0–8 mit Schritten der Größe S oder M, dann 3.0** |
| **Nach außen** | Jedes Gate ein Release mit eigener Aussage | v2.10 korrigiert öffentliche Aussagen; 2.11–2.18 sind Arbeitsstände; **angekündigt wird 3.0** |

---

## 3. Ausgangslage im Code (v2.9.11, gelesen am 15.09.2026)

Was die Phasen voraussetzen oder ersetzen. Gelesen, nicht gelaufen.

- **BPMN ist heute ein Flussdiagramm mit BPMN-Namen.** Gemini erzeugt aus je 1.000
  Zeichen von generiertem Code, Design und Analyse eine Schrittfolge
  (`app/(app)/project/[projectId]/documentation/page.tsx:332-384`). Daraus entsteht
  `.bpmn` mit einem Pool, Lanes je Rollentext, nur exklusiven Gateways ohne
  Bedingung und einem Rasterlayout (`:86-248`). Kein Bezug zu Quellzeilen, kein
  Editor, kein Import; Lane- und Knotennamen sind nicht escaped (CR-21). Die
  Oberfläche nennt die Datei „Signavio-importable" (`:756-762`) — ein Import wurde
  nie geprüft.
- **Die Engine kennt keinen Kontrollfluss.** Sie liefert Statements mit Zeilen und
  zeilengenaue Findings. IF/CASE werden nur für die Verschachtelungstiefe gezählt
  (`lib/abap/code-assessment.ts:307-315`), PERFORM-Aufrufe nicht verfolgt,
  AUTHORITY-CHECK ohne Objekt und Felder erfasst (`lib/abap/evidence-model.ts:525-538`).
- **Der Anker-Check erkennt die Engine-IDs nicht.** Findings heißen `CC-001`
  (`evidence-model.ts:209`), der Parser akzeptiert nur `[F-…]`
  (`lib/abap/narrative-anchors.ts:71`), der Prompt nennt dem Modell aber die
  `CC-`IDs (`:205-221`). Richtig zitierte Sätze zählen als unbelegt; der Test
  verdeckt es mit `F-`Fixtures.
- **Keine Sicht, kein Teilen.** Kein Management/Business/IT-Umschalter;
  `projects` liest nur Besitzer oder Admin.
- **Für Einladungslinks fehlen zwei Bausteine.** Die Anmeldung kehrt nicht zu
  einer Ausgangsseite zurück, und E-Mail-Adressen werden nicht verifiziert
  (`sendEmailVerification` wird nirgends aufgerufen; ein Konto wird nach der
  Zustimmung automatisch freigeschaltet).
- **Weiterverwendbar:** unveränderliche signierte Runs (HMAC + Ed25519),
  Offline-Verifier, Phasenvertrag mit Stale-Kaskade (`lib/workflow-steps.ts`),
  beide SAP-Katalogsichten, Nutzungsimport (v2.9.7), die Satz-Anker-Mechanik.

---

## 4. Phasen bis 3.0

**Wie ein Schritt läuft.** Jeder Schritt ist ein Patch-Release nach der Routine aus
2.9: Code, Guard-Spec mit zitierter Abnahme, CHANGELOG, zuerst `dev`, `main` nur auf
Freigabe. Größen sind Planungshypothesen für einen Maintainer mit AI-Unterstützung —
**S** unter einer Woche, **M** ein bis drei Wochen —, keine Termine. Kein Schritt ist
größer als M.

**Was sichtbar wird.** Korrekturen an der heutigen Oberfläche und an der Engine
gehen normal hinaus. Alles, was zur neuen Oberfläche gehört, wächst hinter einem
Schalter (nur Admin) und wird mit 3.0 für alle eingeschaltet. So bleibt jede Phase
deploybar, ohne dass jemand einen halben Umbau sieht.

```
Phase 0  v2.10  Belegt ....................... öffentliche Aussagen korrigieren (abgestimmt 12.09.)
Phase 1  v2.11  Gerüst ....................... Erhaltungsregister, Zero-LLM, Arbeitsraum-Schale
Phase 2  v2.12  Prozess aus dem Code ......... Kontrollfluss, BPMN-Rekonstruktion mit Ankern
Phase 3  v2.13  Modellieren .................. Editor, Regeln, Beibehalten/Ändern/Entfallen, Ist/Soll
Phase 4  v2.14  Austauschen .................. BPMN-Import und -Export, Signavio-Rundlauf, Kurzbrief
Phase 5  v2.15  Teilen ....................... Einladung per E-Mail-Link, Einsicht
Phase 6  v2.16  Sichten ...................... Management · Business · IT, Ebenen, Overlays
Phase 7  v2.17  Standard und Kosten .......... Standardabdeckung, Gegenprobe, Optionen
Phase 8  v2.18  Entscheiden und Übergeben .... Architekturvertrag, Entscheidung, Nachweiskette
3.0             Umstellung ................... neuer Arbeitsraum für alle, öffentliche Texte
```

**Warum diese Reihenfolge.** Erst die Wahrheit der heutigen Aussagen und der Schutz
dessen, was funktioniert (0, 1). Dann der Inhalt der Business-Sicht (2–4), weil
Sichten nur ordnen können, was da ist, und Teilen erst lohnt, wenn es einen Prozess
zu zeigen gibt. Standard, Kosten und Entscheidung zuletzt, weil sie auf dem
bestätigten Bedarf aus Phase 3 stehen.

**Abhängigkeiten.** Phase 2 braucht 0.5 (Modellrevisionen binden an den
Quellstand) und 1.2 (Skelett ohne Modell). Phase 4 braucht 3.2 (Revisionen).
**Phase 5 braucht nur 0.7 und 1.4** und ließe sich vorziehen. Phase 7 braucht 3.5,
Phase 8 braucht 7.

### Phase 0 — v2.10 „Belegt"

Nichts behauptet mehr, als die Daten hergeben. Umfang wie am 12.09. abgestimmt
([`roadmap/SCHNITT-0-UMFANG.md`](roadmap/SCHNITT-0-UMFANG.md)), mit drei Änderungen
vom 15.09. (**fett**).

| # | Schritt | Größe |
|---|---|---|
| 0.1 | `G0:R0` — Sperre des Live-Testmodus mit Grund und Wiedereröffnungsbedingung in `SECURITY.md` — **gebaut in v2.10.0** (`lib/locked-paths.ts`, `SECURITY.md` §7.1, `tests/locked-paths-guard.spec.ts`) | S |
| 0.2 | Facts-Service, Copy-CI, Audit-Korrekturen. **Dazu: die Signavio-Aussagen** („validated for SAP Signavio", „Signavio-importable", „importable into SAP Signavio") auf „BPMN 2.0 XML" zurücknehmen, bis Schritt 4.3 den Import belegt | M |
| 0.3 | Level-Regelseite mit Regelversion; Score umbenannt, TCO-Versprechen entfernt | M |
| 0.4 | Keine Geldwerte ohne Annahmenrevision | S |
| 0.5 | Manifest- und Inputvertrag: `inputs[]` mit Revision und Hash | M |
| 0.6 | Konservative Ungültigkeit statt Frischeheuristik | S |
| 0.7 | Freigabefelder nur über servervalidierte Commands, manueller Regel-Deploy vor der App. **Konzeptteil nur noch: Einsicht per Einladung** (Rechtestufen, Rohcode-Schalter, virtuelle Rollen entfallen). **Datensparsamkeit gestrichen** | M |
| daneben | Referenzkorpus v1 mit externem Review. **Dazu: je Fall das erwartete Prozessskelett** als Ground Truth für Phase 2 | M, extern |

**Fertig, wenn** V25-A09/A10 (harte Zahl bricht den Build; Seiten nennen identische
Werte), V25-A06 (kein Geldwert ohne Annahmenrevision), QA24-A12 (Client, Server und
Export haben dieselben Grenzen) — und keine Seite und kein Badge mehr einen
Signavio-Import verspricht.

### Phase 1 — v2.11 „Gerüst"

Bevor umgebaut wird, wird benannt, was funktioniert — und der Rahmen gesetzt, in
den alles Weitere gebaut wird.

| # | Schritt | Größe |
|---|---|---|
| 1.1 | **Erhaltungsregister:** die sieben Stufen mit Eingaben, Ausgaben, Voraussetzungen, Fehlern und je einem Referenzfall; Commit, Build und Rules fixiert. Nichts geht im Umbau unbemerkt verloren (QA24-A04, W22-A04) | M |
| 1.2 | **Zero-LLM-Sperrpfad:** Run ohne API-Key bis zum signierten Evidenzstand; Modellstufen einzeln zuschaltbar; „nicht erzeugt" statt leer (V25-A12) | S |
| 1.3 | **Anker-Fix:** Parser und Prompt verwenden die `CC-`IDs der Engine; Test mit echten Engine-IDs. *Kann sofort als Patch vorgezogen werden* | S |
| 1.4 | **Arbeitsraum-Schale hinter dem Schalter:** Kopfzeile wie im Mockup (Pfad, Projekttitel, Metazeile mit Manifest, Revision, Quellstand, Engine, Regeln aus 0.5), sieben Status-Chips — jeder ehrlich, „nicht begonnen", solange nichts da ist —, Ebenenleiste, untere Leiste mit den sieben Stufen als Werkzeuge | M |
| 1.5 | **Gestaltung aus den Mockups als Komponenten** (Karte, Tag, Status-Chip, Anker, Artefaktzeile) und ein Style-Guard nach dem Muster von `tests/workflow-style-guard.spec.ts` | S |

**Fertig, wenn** jede Stufe ihren Referenzfall im Register besteht, ein Run ohne Key
ein signiertes Pack liefert, die Schale für ein echtes Projekt mit ehrlichen Chips
öffnet — und sich bei ausgeschaltetem Schalter für Nutzer nichts ändert.

### Phase 2 — v2.12 „Prozess aus dem Code"

Mockup Screen 1, linke Spalte: die Prozesskarte „reconstructed from code" und die
Code-Karte darunter.

| # | Schritt | Größe |
|---|---|---|
| 2.1 | **Verzweigungen:** IF/ELSEIF/ELSE und CASE/WHEN mit Bedingungstext und Zeilenbereich — deterministisch in `lib/abap/` | M |
| 2.2 | **Aufrufe:** FORM/PERFORM-Graph, Funktionsbausteinnamen (BAPIs eingeschlossen), CALL TRANSACTION, SUBMIT-Programm, AUTHORITY-CHECK mit Objekt und Feldern, Schreibzugriffe | M |
| 2.3 | **Prozessskelett:** Schritte, Entscheidungen, Start und Ende aus 2.1/2.2 — jeder Knoten mit Zeilenbereich, ohne Modellaufruf | M |
| 2.4 | **Fachliche Benennung:** das Modell benennt nur Skelettknoten und schlägt Lanes vor. Ein Element ohne Anker heißt „unbelegt". Lanes tragen den Mockup-Satz: rekonstruiert aus AUTHORITY-CHECK und Benennung, keine organisatorische Aussage | M |
| 2.5 | **BPMN-Ansicht im Arbeitsraum** (bpmn-js, lesend): Legende Rekonstruiert · Bestätigt · Nachgewiesen; Klick auf ein Element öffnet die Code-Karte mit markierten Zeilen; Traceability-Quote je Modell gespeichert | M |
| 2.6 | **BPMN-Export richtig:** gültiges XML (Escaping, CR-21), stabile IDs, Bedingungen an den Kanten, automatisches Layout, Anker und Status in einem eigenen Namensraum unter `extensionElements`; Schemaprüfung im Test; `.bpmn` auch im Delivery-ZIP | M |

**Fertig, wenn**
- jeder Task, jedes Gateway und jede Lane einen Zeilenanker trägt oder sichtbar
  „unbelegt" ist, und die Quote angezeigt wird (V25-A01);
- eine Regel außerhalb der ersten 1.000 Zeichen im Modell erscheint (QA24-A10);
- Namen mit Umlauten, `&` und Anführungszeichen schemagültiges XML ergeben (CR-21);
- ohne API-Key das Skelett mit technischen Namen erscheint;
- ein syntaktisch gültiges Modell nie als belegter End-to-End-Istprozess
  ausgewiesen wird;
- für Korpusfälle mit Prozess-Ground-Truth das Skelett übereinstimmt.

### Phase 3 — v2.13 „Modellieren"

Mockup Screen 1: die Regelkarte BR-004 mit Ankern und den Zuständen „Keep · Change
deliberately · Drop · Clarify".

| # | Schritt | Größe |
|---|---|---|
| 3.1 | **Editor** (bpmn-js Modeler) mit den gängigen BPMN-2.0-Elementen: Pools und Lanes, Start-, Zwischen- und Endereignisse, exklusive und parallele Gateways, Task-Typen, Teilprozess, Datenobjekt, Nachrichtenfluss, Anmerkung | M |
| 3.2 | **Revisionen:** jedes Speichern eine unveränderliche Revision mit Konto und Zeit; das rekonstruierte Ist bleibt Revision 1; Vergleich zweier Revisionen | M |
| 3.3 | **Prüfhinweise beim Modellieren:** bpmnlint-Standardregeln plus eigene — Task ohne Anker, Gateway ohne Bedingung, Lane nur rekonstruiert, Element weicht ohne Zustand vom Code ab. Hinweise, keine Sperren | S |
| 3.4 | **Geschäftsregeln `BR-nnn`:** Regeltext mit Satzankern und Quote, Typ (Regel oder Kontrolle), Quelle (Programm, Include, Form), mit Prozesselementen verknüpft | M |
| 3.5 | **Beibehalten · bewusst ändern · entfallen · klären** je Element und Regel. Eine Bestätigung ist eine neue Revision des Kontos — eine neue Bedarfsrevision, keine Codekonservierung | M |
| 3.6 | **Ist und Soll:** Soll-Modell aus dem Ist und den Zuständen; Gegenüberstellung, was bleibt, sich ändert, entfällt oder offen ist | M |

**Fertig, wenn** W22-A14 (eine geänderte bestätigte Regel markiert nur betroffene
Ableitungen), C23-A06 (Bedarf ohne Code bekommt keinen erfundenen Anker), jede
Bestätigung Name und Zeit zeigt und die Ist-Revision nach dem Bearbeiten unverändert
ist.

### Phase 4 — v2.14 „Austauschen"

Der Weg zu und von SAP Signavio — über Dateien, nicht über eine Anbindung (§6).

| # | Schritt | Größe |
|---|---|---|
| 4.1 | **BPMN-Import** (`.bpmn`, `.xml`): Bericht mit Fehlern (nicht importiert) und Warnungen (Element entfällt); importierte Elemente tragen die Herkunft „importiert" und erscheinen nie als aus Code rekonstruiert | M |
| 4.2 | **Rundlauf:** der Reimport eines eigenen Exports erkennt Elemente an der ID, Anker und Zustände bleiben; fremde Änderungen kommen als neue Revision mit Vergleich | M |
| 4.3 | **Signavio-Rundlauf geprüft:** Export → Import in SAP Signavio Process Manager → Export → Import zurück, im Workspace eines Mitglieds mit Lizenz. Protokoll, was überlebt (Namensraum-Erweiterungen, Lanes, Layout). Erst danach darf eine Seite „getestet mit SAP Signavio Process Manager" sagen — mit Datum | S, extern |
| 4.4 | **Kurzbrief:** Prozessbild, Regeln, offene Fragen — jede Aussage mit Anker; PDF und `.bpmn` in einem Download | M |

**Fertig, wenn** eine Exportdatei aus Signavio (aus 4.3) mit Bericht importiert wird,
eigener Export → Import → Export bis auf dokumentierte Unterschiede identisch ist und
das Protokoll aus 4.3 im Repo liegt.

### Phase 5 — v2.15 „Teilen"

Mockup Screen 1: „Share with members" und die Avatarreihe; Screen 4: „Members on
this case".

| # | Schritt | Größe |
|---|---|---|
| 5.1 | **Zurück zum Link:** Anmeldung und Registrierung unverändert; danach führt die App zum Einladungslink zurück (nur eigene Pfade, keine offene Weiterleitung) | S |
| 5.2 | **Einladen:** der Besitzer gibt eine E-Mail-Adresse ein; der Server legt die Einladung mit Ablaufdatum an und verschickt den Link | M |
| 5.3 | **Annehmen:** angemeldet, Terms akzeptiert (vorhandener Zustimmungsweg), Konto-E-Mail gleich eingeladener Adresse und bestätigt. Google-Login gilt als bestätigt; ein Passwortkonto bekommt in diesem Moment eine Bestätigungsmail — die Registrierung selbst ändert sich nicht | M |
| 5.4 | **Einsicht:** die eingeladene Person liest das Projekt vollständig, **inklusive ABAP-Quellcode**. Generieren, Bestätigen, Signieren und Exportieren bleiben beim Besitzer. `firestore.rules`: lesen darf Besitzer, Admin oder angenommene Einladung — **Regel-Deploy vor der App** | M |
| 5.5 | **Übersicht und Widerruf:** der Besitzer sieht, wer seit wann Einsicht hat, und widerruft; wirksam sofort | S |

**Fertig, wenn**
- ein weitergeleiteter Link für ein anderes Konto nichts öffnet (C23-A14);
- nach dem Widerruf das Lesen an den Regeln scheitert, nicht nur in der Oberfläche;
- ein unbestätigtes Passwortkonto keine Einsicht bekommt;
- der Einladungsdialog ausdrücklich sagt: „inklusive Quellcode".

### Phase 6 — v2.16 „Sichten"

Mockup Screens 1–4: Umschalter, Ebenen, Status-Chips, nächster Schritt, Suche.

| # | Schritt | Größe |
|---|---|---|
| 6.1 | **Umschalter Management · Business · IT**, in IT mit Fokus Application · Solution · Enterprise. Gehalten in URL und Browser — nicht im Konto, nicht im Projekt, nicht in Run oder Audit-Pack | S |
| 6.2 | **Ebenen:** Bedarf & Prozess · Standard-Fit · Kosten & Annahmen · Architektur & Abhängigkeiten · Nachweise & Kontrollen · Änderungen & Zusagen. Eine Ebene ohne Inhalt sagt das, statt etwas zu erfinden (W22-A03) | M |
| 6.3 | **Overlays auf dem Prozessmodell:** Clean-Core-Level des Codes hinter einem Task, Findings, Nutzung (wenn importiert) — Darstellung, kein Inhalt; das Level bleibt außerhalb des signierten Audit-Packs | M |
| 6.4 | **Management-Sicht auf dasselbe Projekt:** was bestätigt ist, was fehlt, was eine Entscheidung binden würde — kein Portfolio | M |
| 6.5 | **Nächster Schritt:** regelbasiert der nächste offene Punkt mit Grund, ohne Modellaufruf | S |
| 6.6 | **Suche im Projekt** (⌘K) über Elemente, Regeln, Findings und Zeilen | S |

**Fertig, wenn** W22-A01/A02 (ein Wechsel erhält Element, Revision und Auswahl und
erzeugt keine neue Hypothese), ein Wechsel keinen Modellaufruf auslöst und ein Guard
belegt, dass kein gespeichertes Artefakt, kein Run und kein Pack ein Sichtattribut
trägt.

### Phase 7 — v2.17 „Standard und Kosten"

Mockup Screen 2.

| # | Schritt | Größe |
|---|---|---|
| 7.1 | **ATC-Import** neben dem vorhandenen Nutzungsimport; importierte Findings mit der Engine abgeglichen | M |
| 7.2 | **Standardabdeckung je Fähigkeit** mit Evidenzstufe E0–E4: ein Kataloglink ergibt höchstens E1, ein Scope Item ist eine zu prüfende ID, ein fehlender Katalogtreffer beweist nichts | M |
| 7.3 | **Gegenprobe-Szenarien** aus dem bestätigten Bedarf; Testing speichert Verdikte als Receipt mit Umfang, Umgebung und Stubs | M |
| 7.4 | **Optionen mit Kosten** nur aus einer Annahmenrevision; kein Kostensieger, solange eine Option unvollständig ist | M |
| 7.5 | **Prüfaufträge statt Scheinwissen:** zu kurzes Nutzungsfenster, fehlendes Include, dynamischer Aufruf werden Aufgaben, keine Urteile | S |

**Fertig, wenn** V25-A02 (beide Katalogsichten mit Vorrangregel und Regelversion),
V25-A05 (zu kurzes Fenster erzeugt einen Prüfauftrag), V25-A06 und W22-A15/A16
(simuliert, übersprungen oder anderer Codehash gilt nie als bestanden).

### Phase 8 — v2.18 „Entscheiden und Übergeben"

Mockup Screens 3, 4 und 5 (linke Spalte).

| # | Schritt | Größe |
|---|---|---|
| 8.1 | **IT-Sicht:** Findings mit beiden Katalogsichten, Level-Verteilung, Spur Anforderung → Anker → Finding → Zielentwurf | M |
| 8.2 | **Architekturvertrag als Dokument:** Zielkontext, Laufzeit, Persistenz, APIs, gebundene Eingaben | M |
| 8.3 | **Generierung folgt dem Vertrag;** eine Abweichung von der Empfehlung wird festgehalten und angewendet | M |
| 8.4 | **Entscheidung:** bindet Bedarf, Option, Kostenrevision und Vertrag; Bedingungen mit Status; Zeitleiste. Bestätigt vom Konto — „Selbstauskunft, kein organisatorisches Mandat" | M |
| 8.5 | **Nachweiskette und Übergabepaket:** Anforderung → Entscheidung → Receipt → Lieferartefakt; das Signaturmanifest nennt `covers[]`; der vorhandene Offline-Verifier prüft es | M |

**Fertig, wenn** C23-A29 (manipulierte Evidenz wird erkannt), V25-A11
(Offline-Verifikation mit `covers[]`), W22-A17 (Export ist keine Übernahme) und
QA24-A17 (ein Fingerprint ohne Bestätigung ist kein grüner Status).

### 3.0 — Umstellung

| # | Schritt | Größe |
|---|---|---|
| 3.0.1 | **Schalter für alle:** jedes Projekt öffnet im Arbeitsraum; die sieben Stufen bleiben als Werkzeuge | S |
| 3.0.2 | **Bestandsprojekte** öffnen ohne Verlust von IDs, Runs und Signaturen (C23-A02) | M |
| 3.0.3 | **Erhaltungsregister im neuen Arbeitsraum:** jeder Referenzfall aus 1.1 besteht | S |
| 3.0.4 | **Accessibility-Basis:** Tastatur, Screenreader, Lesen auf dem Telefon | M |
| 3.0.5 | **Aufräumen:** der alte 1.000-Zeichen-Generator und das ungenutzte `components/ProcessDocumentation.tsx` gehen | S |
| 3.0.6 | **Öffentliche Texte auf 3.0:** Startseite, README, How-to, Whitepaper, `llms.txt`, Facts; Screenshots aus dem echten Produkt, keine Mockup-Bilder | M |

**Fertig, wenn** alle Phasenabnahmen auf `main` gelaufen sind, ein Korpusfall den
ganzen Fluss durchläuft und die Copy-CI grün ist.

---

## 5. Abgleich mit den Mockups 2.7

Die Mockups sind das Zielbild. Diese Tabelle sagt, wo jedes Element entsteht und wo
3.0 bewusst abweicht. **Die Abweichungen folgen alle aus §2** — Konto unverändert,
Rollen nur als Sichten, Teilen nur als Einsicht.

| Mockup | Entsteht in | In 3.0 |
|---|---|---|
| Kopfzeile: Titel, Case · Manifest · Revision · Source snapshot · Engine · Rules | 1.4 (Daten aus 0.5) | wie Mockup; „Case" ist das Projekt |
| Status-Chips Provenance · Need · Standard · Costs · Mandate · Execution · Handover | 1.4, gefüllt in 2–8 | „Mandate" heißt „Confirmed" und nennt das Konto |
| Umschalter Management · Business · IT, IT-Fokus | 6.1 | wie Mockup |
| „Intent: Understand / Decide / Assure" | — | **entfällt** — eine Achse (Sicht) statt zwei |
| „Playing as ▾" | — | **entfällt** — Rollen sind Sichten |
| „Search this case ⌘K" | 6.6 | wie Mockup |
| Ebenenleiste mit sechs Ebenen | 1.4 Leiste, 6.2 Inhalte | wie Mockup |
| S1 Prozesskarte „reconstructed from code" mit Legende | 2.5, bearbeitbar ab 3.1 | wie Mockup, als echtes BPMN |
| S1 Regelkarte BR-004 mit Ankern, Quote und Zuständen | 3.4, 3.5 | „skeller playing as Process owner" → „bestätigt von ‹Name› · Datum" |
| S1 Code-Karte mit markierter Zeile | 2.5 | wie Mockup |
| S1 „Evidence at BR-004" | Anforderung/Anker 3.4–3.5, CA 7.2, TST 7.3, DEC 8.4 | ohne Rollenangaben |
| S1 „Discussion" | offen (§9) | — |
| S1 Share-Dialog | 5.2–5.4 | Einladung per E-Mail, Recht „Einsicht", Quellcode sichtbar. Kein Handle, kein „no name stored", kein eingefrorener „Evidence link" — ein eingefrorener Stand ist der Export |
| Avatare in der Kopfzeile | 5.5 | Personen mit Einsicht |
| Untere Leiste: „Next contribution" und Tools | Tools 1.4, nächster Schritt 6.5 | ohne Zuweisung an Rollen oder Personen |
| S2 Standard fit, Scenario workbench, Options | 7.2, 7.3, 7.4 | wie Mockup |
| S3 Findings, Level distribution, Imports | 8.1, 7.1 | wie Mockup |
| S3 Trace, ArchitectureContract | 8.1, 8.2 | „Roles: …" → „bestätigt von ‹Name›" |
| S4 Decision, Options at a glance, Conditions, Timeline | 8.4, 6.4 | „Sign as Management (virtual role)" → „Confirm decision"; Bedingungen ohne „played by" |
| S4 „Members on this case" | 5.5 | Name und „Einsicht seit"; keine Rechtestufen, kein „played so far" |
| S5 Evidence chain, Handover package, Conditions | 8.5 | Rollenangaben → Konto |
| S5 „Expected vs. observed" | 3.5 (nach 3.0) | — |
| S6 MCP-Zugang | 3.1 (nach 3.0) | ohne virtuelle Rollen und Signer-IDs |

---

## 6. Nah an Signavio, keine Kopie

**Übernommen, weil es gute BPMN-Praxis ist:** BPMN 2.0 als Notation und
Austauschformat, Prüfhinweise während des Modellierens, Revisionen mit Vergleich,
Overlays für unterschiedliche Leser.

**Eigen — was ein Prozessmodellierer nicht hat:**
- Das Modell **entsteht aus dem ABAP-Code**. Jedes Element trägt einen Zeilenanker
  und einen Status: rekonstruiert, bestätigt oder nachgewiesen.
- Gateways tragen die Bedingung aus dem Code; Lanes sind als Rekonstruktion
  gekennzeichnet, nie als Organisation.
- Overlays zeigen Clean-Core-Level und Findings hinter einem Task.
- Beibehalten / bewusst ändern / entfallen führt vom Ist zum Soll — und weiter zu
  Standard-Fit, Optionen und Entscheidung.
- Ohne API-Key entsteht das Skelett trotzdem.

**Nicht gebaut:** Prozess-Repository oder Prozesslandschaft über Projekte hinweg,
Wertschöpfungsketten, Glossar-Verwaltung, Veröffentlichungsportal,
Freigabe-Workflows, Simulation, Process Mining, SAP-Referenzprozesse als Inhalt (nur
Verweis per Scope-Item-ID), Übergabe an Cloud ALM, **API-Anbindung an einen
Signavio-Workspace**. Der Austausch läuft über Dateien; der Workspace und seine
Zugangsdaten bleiben beim Kunden.

**Technik.** bpmn-js für Anzeige und Editor (bpmn.io-Lizenz: MIT mit der Auflage,
das bpmn.io-Wasserzeichen sichtbar zu lassen), bpmn-moddle (MIT) zum Lesen und
Schreiben, bpmnlint (MIT) für Prüfregeln. Signavio importiert und exportiert
standardkonformes BPMN 2.0 XML (SAP-Hilfe, „Import/Export BPMN 2.0 XML"). **Ungeprüft
ist, wie Signavio mit fremden `extensionElements` umgeht** — genau das klärt 4.3.

---

## 7. Nach 3.0

| Version | Was dazukommt |
|---|---|
| **3.1** | Lesender MCP-Zugang je Projekt mit Scoped Token (Screen 6) und Open Evidence Format · Vergleichsseiten „wann Nova, wann Clean-Core.io, wann beides" und deutsche Kernseiten (beides nach 0.2 jederzeit vorziehbar) |
| **3.2** | Cloudification-Changelog mit RSS als Auslöser für Wiedervorlagen |
| **3.3** | Auswirkungsanalyse: eine Katalogänderung erzeugt Prüfaufträge nur für betroffene Projekte |
| **3.4** | Musterbibliothek (CC-BY, nur nach Veröffentlichungsreview) |
| **3.5** | Beobachtete Wirkung gegen die eingefrorene Kostenrevision (Screen 5 rechts) · Multi-Provider-BYOK |
| ohne Version | Bench veröffentlichen, fairer Vergleich, Teamabnahme — brauchen Termine mit Dritten, keine Entwicklungszeit · Runner-Isolation (`E08-F01-US01`) als eigener Auftrag, der den gesperrten Live-Testmodus zurückgibt |

---

## 8. Was bewusst nicht gebaut wird

| Nicht gebaut | Stattdessen |
|---|---|
| Änderungen an Anmeldung, Registrierung und Konto — Handle, Entfernen der Namensfelder, Migration, Pseudonymisierung | Konto bleibt wie heute |
| Rollen an Beiträgen, „Playing as", Self-Play, Rollen-Mandate, Rollenliste, Rollenverwaltung | Sichten ohne Wirkung auf Ergebnis und Audit; Verantwortung beim Konto |
| Rechtestufen Kommentieren/Bearbeiten, Rohcode-Schalter, offene Links, Gäste ohne Konto | Einsicht per E-Mail-gebundener Einladung |
| Decision Request | Einsicht |
| Fallzuschnitt über mehrere Objekte | Projekt = Fall |
| Tenants, SSO, Organisationskonten, Self-Hosted Edition, ALM-Adapter, Portfolio-Steuerung | Export, nach 3.0 lesendes MCP |
| Signavio-API-Anbindung, Prozess-Repository, Simulation, Process Mining | BPMN-Dateiaustausch (§6) |
| Schreibende MCP-Tools, agentisch ausgelöste Entscheidungen | alles lesend |

`tier: 'enterprise'`, `orgId`, `maxTeamMembers` und die Okta-/Azure-Felder im Profil
beschreiben eine Ausbaustufe, die nicht kommt. Sie bleiben trotzdem stehen, weil
diese Roadmap das Konto nicht anfasst.

---

## 9. Entscheidungen

### Am 15.09.2026 geschlossen

| Entscheidung | Ergebnis |
|---|---|
| **Konto** | Anmeldung und Konto bleiben unverändert; die Datensparsamkeit aus 2.7 ist gestrichen |
| **Rollen** | Nur Sichten, ohne Einfluss auf Auditierbarkeit; die Verantwortung liegt beim angemeldeten Nutzer |
| **Teilen** | Einladung an eine E-Mail-Adresse; der Link öffnet nur für ein Konto mit genau dieser, bestätigten Adresse; Einsicht inklusive Quellcode, der Dialog sagt es |
| **Business-Sicht** | BPMN-Modellierung nah an Signavio, keine Kopie; Import und Export für Signavio-Lizenznehmer |
| **Versionen** | Nach außen zählt 3.0 = der UX-Umbau entlang der Mockups 2.7; bis dahin kleine Schritte in Phasen |
| **Form** | Diese Datei kurz und allein verbindlich; frühere Roadmaps im Archiv `docs/archiv/` |

Die Entscheidungen vom 12.09. zu Phase 0 (Umfang „Kern + Fundament", Sperre statt
Runner-Isolation, öffentliche Texte nur wo falsch) gelten weiter; ihre Punkte
„Datensparsamkeit vertagt" und „Positionierung später" sind durch §2 und 3.0.6
ersetzt.

### Weiter offen

| # | Entscheidung | Warum sie zählt |
|---|---|---|
| 1 | **Referenzkorpus v1 und externer Prüfer** | Ohne ihn fehlt die Ground Truth für Level-Regeln, Prozessskelett (Phase 2) und später die Bench |
| 2 | **Wer stellt einen Signavio-Workspace für 4.3?** | Clean-Core.io hat keine Lizenz. Ohne einen Mitglieds-Workspace bleibt die Aussage „BPMN 2.0 XML", nie „getestet mit Signavio" |
| 3 | **„Discussion" aus dem Mockup vor 3.0?** | Kommentare der eingeladenen Personen am Element wären ein weiterer M-Schritt in Phase 5. Ein Kommentar wäre keine Bestätigung |
| 4 | **Vorschau vor 3.0?** | Bis 3.0 nur Admin — oder ab Phase 5 eine Vorschau für ausgewählte Mitglieder, die dann echtes Feedback geben |
| 5 | **Auszählung der Aktivierungsumfrage** | Sie sollte die Reihenfolge innerhalb der Phasen bestimmen — der ATC-Import (7.1) und die deutsche Oberfläche (3.1) sind Kandidaten |
| 6 | **Regel-Deploys einplanen** | `firestore.rules` rollt CI nicht aus. 0.7 und 5.4 brauchen den manuellen Produktions-Deploy **vor** der App |

---

## 10. Wie der Nutzen gemessen wird

- **Traceability-Quote** je Prozessmodell und je Regel — Anteil der Elemente und
  Sätze mit Zeilenanker (ab 2.5 gespeichert).
- **Bestätigungsanteil** — wie viele Elemente eines Modells einen Zustand
  „beibehalten / ändern / entfallen" tragen (ab 3.5).
- **Signavio-Rundlauf** — welche Elemente und Attribute den Weg hin und zurück
  überleben (Protokoll aus 4.3).
- **Frage → Entscheidung** — Zeit und Revisionen vom ersten Run bis zur bestätigten
  Entscheidung (ab 8.4).
- **Bench-Kennzahlen** nach 3.0 — Präzision und Recall der Findings,
  Halluzinationsquote (Sätze ohne Anker), ehrliche Abstinenz.

---

## 11. Arbeitsregeln

- Ein Schritt gilt erst als geliefert, wenn seine Abnahme gelaufen ist — eine
  Exit-Liste ist eine Behauptung, bis sie aus Katalog und Code neu abgeleitet wurde.
- Testkommandos unverpackt ausführen und das **ganze** Log durchsuchen.
- Keine höhere Sicherheit im Text als in den Daten: fehlend bleibt fehlend,
  simuliert bleibt simuliert, rekonstruiert bleibt rekonstruiert.
- Bekannte fachliche Fehler werden korrigiert, nicht als Parität konserviert.
- Neue Oberfläche nur hinter dem Schalter; was für Nutzer sichtbar wird, entscheidet
  3.0.
- **Jeder Push auf `dev`** durchläuft die QA-Schleife (`docs/QA-REVIEW-LOOP.md`);
  **jede Version auf `main`** das Sicherheitsaudit (`docs/SECURITY-AUDIT-AGENT.md`) und die
  UX-Review (`docs/UX-REVIEW-AGENT.md`).

---

## 12. Sicherheitsbefunde aus dem Security-Agenten

Bestätigte Befunde des Audits jeder `main`-Version werden hier nach Priorität
eingeplant. **Öffentlich stehen nur ID, Schwere, Priorität, Roadmap-Schritt und
Status** — Titel, Fundstellen und Beschreibungen liegen im versiegelten Register
(`docs/security/register.enc.json`), bis ein Befund behoben und ausgeliefert ist.

Einplanung: **kritisch** sofort als eigener Patch-Schritt vor jeder anderen Arbeit ·
**hoch** in die laufende Phase · **mittel** in den nächsten passenden Schritt ·
**niedrig** neben verwandter Arbeit.

| ID | Schwere | Priorität | Roadmap-Schritt | Status |
|---|---|---|---|---|
| — | — | — | — | noch kein Audit gelaufen |

---

## 13. UX-Befunde aus dem UX-Agenten

Die erste Review des UX-Agenten nimmt sich das ganze Produkt vor; danach bekommt jede
`main`-Version eine Review ihres Deltas (`docs/UX-REVIEW-AGENT.md`). Claude prüft jeden
Befund an Code und Screenshot und plant bestätigte hier ein. UX-Befunde beschreiben
Screens, keine Schwachstellen — sie stehen mit Titel in der Tabelle; das Register ist
`docs/ux/register.json`.

Einplanung: **critical** sofort als eigener Schritt · **high** in die laufende Phase —
Konsistenz und Komponenten nach **1.5**, Rahmen und Navigation nach **1.4** · **medium** in den
nächsten passenden Schritt · **low** neben verwandter Arbeit oder nach **3.0**. Was der
3.0-Umbau ohnehin ersetzt, wird zurückgestellt, nicht doppelt gebaut.

| ID | Schwere | Befund | Roadmap-Schritt | Status |
|---|---|---|---|---|
| — | — | — | — | noch keine Review gelaufen |
