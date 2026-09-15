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
| [`roadmap/clean-core-mockups-v2_8.html`](roadmap/clean-core-mockups-v2_8.html) | **Zielbild von 3.0**, gebaut nach [`DESIGN.md`](../DESIGN.md); §5 sagt, wo jedes Element entsteht. Die Vorgänger-Mockups 2.7 bleiben in `roadmap/` als Herkunft |
| [`../DESIGN.md`](../DESIGN.md) · [`design/decisions.md`](design/decisions.md) | **Aussehen, Struktur und Verhalten** der Oberfläche von 3.0 und das Entscheidungslog dazu |
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
4. **Die Verantwortung bleibt beim angemeldeten Nutzer.** Business-, IT- und
   Management-Sicht ordnen nur die Darstellung. Sie werden nirgends gespeichert und
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
- **Keine Sicht, kein Teilen.** Kein Business/IT/Management-Umschalter;
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
Phase 6  v2.16  Sichten ...................... Business · IT · Management, Ebenen, Overlays
Phase 7  v2.17  Standard und Kosten .......... Standardabdeckung, Gegenprobe, Optionen
Phase 8  v2.18  Entscheiden und Übergeben .... Architekturvertrag, Entscheidung, Nachweiskette
3.0             Umstellung ................... neuer Arbeitsraum für alle, Demo mit Tour, neue Landingpage mit echten Produktansichten
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
| 0.2 | Facts-Service, Copy-CI, Audit-Korrekturen. **Dazu: die Signavio-Aussagen** („validated for SAP Signavio", „Signavio-importable", „importable into SAP Signavio") auf „BPMN 2.0 XML" zurücknehmen, bis Schritt 4.3 den Import belegt — **Signavio-Teil gebaut in v2.10.2** | M |
| 0.3 | Level-Regelseite mit Regelversion; Score umbenannt, TCO-Versprechen entfernt | M |
| 0.4 | Keine Geldwerte ohne Annahmenrevision — **gebaut in v2.10.3** | S |
| 0.5 | Manifest- und Inputvertrag: `inputs[]` mit Revision und Hash | M |
| 0.6 | Konservative Ungültigkeit statt Frischeheuristik | S |
| 0.7 | Freigabefelder nur über servervalidierte Commands, manueller Regel-Deploy vor der App. **Konzeptteil nur noch: Einsicht per Einladung** (Rechtestufen, Rohcode-Schalter, virtuelle Rollen entfallen). **Datensparsamkeit gestrichen** | M |
| 0.8 | **Deckungsurteil ohne Befunde ist kein Vollurteil** (UX-002, critical): leere Befundliste ergibt nicht mehr „Fully Supported" und kein „Unconditional Go-Live Approved / LOW RISK" im Board-Deck; eigener Schritt vor der übrigen Arbeit | S |
| 0.9 | **Beispiele kosten kein Kontingent** (Entscheidung Sonny 15.09.2026): nur die bestehenden Starter-Beispiele aus `lib/starter-examples.ts`, serverseitig am Fingerabdruck des unveränderten Quelltexts erkannt (ein verändertes Beispiel ist eigener Code); **jedes einmal frei** je Konto; **jeder weitere Start** desselben Beispiels zählt wie eine Analyse, auch gegen die Regel „dieselbe Quelle erneut ist frei"; nach den fünf Analysen geht es nur noch mit eigenem Gemini-Schlüssel (BYOK) weiter (Präzisierung Sonny 15.09.2026). Wer dasselbe Beispiel erneut startet, wird vorher gewarnt — *„You ran this example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes."* — und das Kontingent wird erst **nach abgeschlossener Analyse** abgezogen, nie bei Abbruch oder Fehler. Buchführung nur serverseitig (Admin SDK, wie `chargedInputs`), kein Client-Feld. Mit: Nutzungsbedingungen §6, Welcome-Mail, `lib/clean-core-capabilities.ts` und Admin-Nutzungsansicht, die heute „re-analysing the same source is free" sagen | S |
| 0.10 | **Demo-Projekt für jedes Konto** (Entscheidung Sonny 15.09.2026, `DESIGN.md` §6.1.2): ein vollständig durchgespieltes, deutlich markiertes Projekt aus einem echten Lauf des achten Starter-Beispiels `Z_MM_PO_APPROVAL` (Emergency purchase approval — derselbe Fall wie in den Mockups), **eine** Demo für alle Konten (keine Kopie je Konto, Anmeldung unverändert), bedienbar ohne Folgen — Zustand nur im Browser, „Reset demo", zählt nicht aufs Kontingent. Im heutigen Produkt mit den sieben Stufen; mit wiederkehrender Einladung zu Beispiel oder eigenem Code (höchstens eine je Bildschirm, nie blockierend). Die Tour mit rund zwölf Stationen wächst mit dem Arbeitsraum (3.0.7) | M |
| 0.11 | **Vertrauen vor dem Hochladen** (Entscheidung Sonny 15.09.2026, `DESIGN.md` §6.1.3): im heutigen Upload eine Zeile zu Terms §5 und §8 ohne Häkchen und die Karte „Your code and your trust" — EU-Speicherung, Zugriff nur für das Konto, Server-Proxy und verschlüsselter Schlüssel, signierte Läufe, kein Tracking, Löschen, öffentliches Sicherheitsmodell, Training: mit dem Community-Schlüssel gilt der bezahlte Gemini-API-Tarif — kein Training durch Google; mit eigenem Schlüssel die Bedingungen des eigenen Google-Kontos (Sonny 15.09.2026; die Datenschutzerklärung nennt den bezahlten Tarif des Community-Schlüssels ausdrücklich, bevor die Karte es sagt); „free community project"; „Our security model is public" verlinkt auf `SECURITY.md` im öffentlichen Repository. Jede Aussage mit Link auf ihre Quelle; ein Guard prüft, dass die Karte nur Aussagen enthält, die in Terms, Datenschutzerklärung oder `SECURITY.md` stehen | S |
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
| 1.3 | **Anker-Fix:** Parser und Prompt verwenden die `CC-`IDs der Engine; Test mit echten Engine-IDs. **Vorgezogen, gebaut in v2.10.1** | S |
| 1.4 | **Arbeitsraum-Schale hinter dem Schalter:** Kopfzeile wie im Mockup (Pfad, Projekttitel, Metazeile mit Manifest, Revision, Quellstand, Engine, Regeln aus 0.5), sieben Status-Chips — jeder ehrlich, „nicht begonnen", solange nichts da ist —, Ebenenleiste, Werkzeugleiste mit den sieben Stufen unter dem Kopf. **Öffnet in der Business-Sicht** und hat einen Bereich „Nicht bestimmt" (`DESIGN.md` §2.3, §4) | M |
| 1.5 | **Gestaltung nach `DESIGN.md` als Komponenten** (Karte, Tag, Status-Chip, Herkunfts-Chip in drei Formen, Anker, Artefaktzeile, Message Strip, Empty State, „Why?"-Popover, Segmented Control, Icon-Button): semantische Tokens statt Hex-Literale, vier Button-Stile, Schrift ≥ 11 px, **eine Herkunftsliste `lib/provenance.ts`** mit Guard gegen frei formulierte Badges; Style-Guard nach dem Muster von `tests/workflow-style-guard.spec.ts`. Dazu aus den Mockups: die weiteren festen Listen mit eigener Form (Objektstatus, Evidenzstufe, Level, Regel-Eigenschaft, `DESIGN.md` §4.1), Formular mit Value States, Filterleiste leer vs. „No findings match these filters", modale Message Box, Toast, Code-Fläche, Kontrast-Guard; **Laufanzeige** für lange Läufe (Kosten vor dem Klick, Abbrechen, Verlassen, Fehler-Strip mit Aktion, §2.8); **`lib/model-text.ts`** gegen KI-Spuren in Oberfläche, Exporten und Mails (§3.1) | M |
| 1.8 | **„My workspace" als List Report** (`DESIGN.md` §2.2, Mockup s7): Live-Filter, Tabelle mit Objektstatus, laufende Analyse mit Abbrechen, gescheiterter Lauf mit „Retry" und „Run without model", *Stale*; die Demo als erste Zeile und die Karte „Your turn", solange kein eigenes Projekt existiert (0.10) | M |
| 1.6 | **Kein Dark Mode:** Theme-Schalter in den Einstellungen und die `.dark`-Überschreibungen in `app/globals.css` entfallen, mit Guard (Entscheidung 15.09.2026; erledigt UX-023, UX-044, UX-061, UX-062) | S |
| 1.7 | **Ehrliche Kodierung bis zur Schale:** Stepper und Verification Rail zeigen „done" gleich, Grün nur für belegt; der Tenant-Tab heißt „Tenant-Verbindung prüfen", der Sperrhinweis steht einmal, mit dem BYOT-Freischaltweg (`DESIGN.md` §5.3, Entscheidung 15.09.2026) | S |

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
| 2.3 | **Prozessskelett:** Schritte, Entscheidungen, Start und Ende aus 2.1/2.2 — jeder Knoten mit Zeilenbereich, ohne Modellaufruf. Mit der Palette aus `DESIGN.md` §5.8: Fehler-Ende, Teilprozesse aus FORMs mit Wirkung, Aufruf-Aktivität, Service-, Send-, User- und Business-Rule-Task, Mehrfach-Instanz aus `LOOP AT`, Fehler-Randereignis, Fremdsystem als Pool, Datenspeicher; **nicht erreichter Code, Klone und technische Helfer** werden erkannt und benannt statt gezeichnet. Referenzfall: `ZLEGACY_ORDER_FULFILLMENT_AUDIT` (1.000 Zeilen, 341 davon nicht erreicht) | L |
| 2.4 | **Fachliche Benennung:** das Modell benennt nur Skelettknoten und schlägt Lanes vor. Ein Element ohne Anker heißt „unbelegt". Lanes tragen den Mockup-Satz: rekonstruiert aus AUTHORITY-CHECK und Benennung, keine organisatorische Aussage | M |
| 2.5 | **BPMN-Ansicht im Arbeitsraum** (bpmn-js, lesend): Legende Rekonstruiert · Bestätigt · Nachgewiesen; Klick auf ein Element öffnet die Code-Karte mit markierten Zeilen; Traceability-Quote je Modell gespeichert. Ohne Maus nach DESIGN.md §5.7: gleichwertige Schrittliste „Map | Steps", ein Tab-Halt mit Pfeiltasten, benannte Knoten, gerenderter Tastatur-Test | M |
| 2.6 | **BPMN-Export richtig:** gültiges XML (Escaping, CR-21), stabile IDs, Bedingungen an den Kanten, automatisches Layout, Anker und Status in einem eigenen Namensraum unter `extensionElements`; eingeklappte Teilprozesse als echte BPMN-Teilprozesse, Fremdsysteme als Pool mit Nachrichtenfluss, Datenspeicher; Schemaprüfung im Test; `.bpmn` auch im Delivery-ZIP. Dazu Export PNG und PDF der Prozesskarte mit Herkunfts-Chips und Ankern — kein öffentlicher Link (`DESIGN.md` §5.3, §5.7) | M |
| 2.7 | **Erster Blick:** nach Import oder Beispiel baut sich der Arbeitsraum in vier Etappen auf — Code gelesen · Prozess erkannt · in Fachsprache · „Das ist Ihr Prozess" mit Prozessname, Traceability, Entscheidungen, Regeln und „nicht bestimmt". Jede Zahl aus dem Run, überspringbar, `prefers-reduced-motion` zeigt den Endzustand. Dazu die drei Coach Marks und die vorab beantwortete Frage in „Ask this case" aus den Verzweigungen des Codes, ohne Modellaufruf (`DESIGN.md` §5, §6.2). **Davor „New project"** nach `DESIGN.md` §6.1.1: ein Satz Kern, drei Zeilen, was anders ist, Clean Core in drei Blicken (Bedeutung, Level A–D, Herkunft der Evidenz mit Stand des Katalogabgleichs), dann Beispiel oder eigener Code mit der Kontingent-Zeile aus 0.9 | M |
| 2.8 | **Versteckte Geschäftsregeln:** Literale in Bedingungen — Toleranzen, Werke, Buchungskreise, Kunden- und Lieferantennummern, Datumsgrenzen, Ausnahmelisten — deterministisch als Regelkandidaten mit Anker; jeder wird in 3.5 beibehalten, geändert, entfällt oder ins Customizing verschoben (Feedback 15.09.2026). Einstufende FORMs (`IF/ELSEIF`-Ketten auf Literalen) öffnen als Entscheidungstabelle am Business-Rule-Task | M |
| 2.9 | **Große Prozesse navigieren** (`DESIGN.md` §5.9): Übersicht der Phasen als eingeklappte Teilprozesse, Ebenen mit Pfadzeile, Gliederungsbaum statt flacher Schrittliste, Problemzeile je Teilprozess, Minikarte, „Show paths to here" und „Main path", Laufvarianten aus den Selektionsschaltern, Overlays als Filter, Suche öffnet die Ebene des Treffers, stabile Anordnung, Ebene und Auswahl in der URL. Abnahme am 1.000-Zeilen-Beispiel: jeder Schritt in höchstens drei Aktionen erreichbar, per Tastatur wie per Maus | L |

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
| 6.1 | **Umschalter Business · IT · Management** (immer in dieser Reihenfolge, Business vorn und beim Öffnen gewählt; Entscheidung Sonny 15.09.2026), in IT mit Fokus Application · Solution · Enterprise. Gehalten in URL und Browser — nicht im Konto, nicht im Projekt, nicht in Run oder Audit-Pack. Dazu **die drei Sichten in Bewegung** in „New project" (`DESIGN.md` §6.1.1): eine Tatsache mit festem Anker wandert einmal durch die drei Sichten, aus dem echten Lauf des Beispiels, überspringbar, bei reduzierter Bewegung still. Unter dem Umschalter je Sicht ein Satz, welche Frage sie beantwortet, mit „About this view" (`DESIGN.md` §2.3) | M |
| 6.2 | **Ebenen:** Bedarf & Prozess · Standard-Fit · Kosten & Annahmen · Architektur & Abhängigkeiten · Nachweise & Kontrollen · Änderungen & Zusagen. Eine Ebene ohne Inhalt sagt das, statt etwas zu erfinden (W22-A03) | M |
| 6.3 | **Overlays auf dem Prozessmodell:** Clean-Core-Level des Codes hinter einem Task, Findings, Nutzung (wenn importiert) — Darstellung, kein Inhalt; das Level bleibt außerhalb des signierten Audit-Packs | M |
| 6.4 | **Management-Sicht auf dasselbe Projekt:** was bestätigt ist, was fehlt, was eine Entscheidung binden würde; **Clean-Core-Readiness mit Regelversion und Verlauf** — ein Verlauf vergleicht nur Runs derselben Regelversion — kein Portfolio | M |
| 6.5 | **Nächster Schritt:** regelbasiert der nächste offene Punkt mit Grund, ohne Modellaufruf | S |
| 6.6 | **Suche im Projekt** (⌘K) über Elemente, Regeln, Findings, Zeilen und Glossar; **Glossar zum Start** nach `DESIGN.md` §6.1 (SAP- und Produktbegriffe, Quelle je SAP-Begriff), auch in „Ask this case": Fachwörter mit Popover, „What is …?" aus dem Eintrag ohne Modellaufruf (Entscheidung 15.09.2026) | M |
| 6.7 | **Public-Cloud-Fit und vier Töpfe:** welche Objekte des Projekts in Public Cloud keinen Weg haben (nur Tier 3) und damit die Deployment-Entscheidung blockieren; Einordnung jedes Objekts in Retire · Keep · Rebuild · **Blocked by SAP** (kein freigegebenes API, kein Nachfolger) — der vierte Topf trennt eigene Hausaufgaben von SAPs Roadmap. Abgeleitet aus Katalog und Level, jede Zuordnung mit Beleg (Feedback 15.09.2026). Regeln nach `DESIGN.md` §5.6 (Entscheidung 15.09.2026): abhängig von der Zielplattform; Retire nur aus bestätigtem Drop oder null Nutzung über ≥ 13 Monate, mit Quelle, Zeitraum und Jahresabschluss sichtbar; Blocked nur für Katalogobjekte ohne freigegebenen Nachfolger, Modifikationen sind Rebuild | M |
| 6.8 | **„Ask this case" über die eingebettete Hilfe-KI** (Entscheidung Sonny 15.09.2026): kein zweiter Chat — der vorhandene Assistent (`components/GlossaryChatbot.tsx`, `lib/chatbot-knowledge.ts`) wird für 3.0 ausgebaut. Im Projekt antwortet er nur aus der Evidenz des Projekts, jede Aussage mit Anker, Herkunft *Model proposal*; außerhalb eines Projekts bleibt er Produkt- und SAP-Hilfe. Die vorab beantwortete Frage aus den Verzweigungen des Codes (2.7) und Glossar-Antworten ohne Modellaufruf (6.6) laufen durch denselben Assistenten. Zählt nicht aufs Kontingent; Modelltext durch `lib/model-text.ts` (1.5) | M |

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
| 7.3 | **Gegenprobe-Szenarien** aus dem bestätigten Bedarf, **als Given/When/Then mit Testdatenbedarf**, damit Fachbereiche sie ohne ABAP prüfen; Testing speichert Verdikte als Receipt mit Umfang, Umgebung und Stubs | M |
| 7.4 | **Optionen mit Kosten** nur aus einer Annahmenrevision; **„Nichts tun" als Vergleichsoption** (Regressionstest je Release, Upgrade-Verzug) und die Empfindlichkeit der Annahmen; kein Kostensieger, solange eine Option unvollständig ist. **Pflichtfelder** (Entscheidung 15.09.2026, ADR-035): Währung ohne Vorgabe, zwei Tagessätze (Entwicklung, Test/Key User), Betrachtungszeitraum ohne Vorgabe, Release-Takt nur bestätigt, je Option einmaliger Aufwand als Spanne und laufender Aufwand je Release, Wartungs-Baseline für Keep und Nichts tun; kein Feld aus einem Modell, die festen Aufwandsfaktoren je 1.000 Zeilen nur als bestätigungspflichtiger Vorschlag | M |
| 7.5 | **Prüfaufträge statt Scheinwissen:** zu kurzes Nutzungsfenster, fehlendes Include, dynamischer Aufruf werden Aufgaben, keine Urteile | S |
| 7.6 | **Was sich für Nutzer ändert:** welche Transaktion oder App den Schritt heute trägt und künftig, was anders aussieht, wo Schulung nötig ist — als Evidenzstufe wie 7.2, nie als Behauptung (Feedback 15.09.2026) | M |
| 7.7 | **Prüfhinweise Compliance:** deterministische Hinweise auf personenbezogene, steuer- oder revisionsrelevante Daten aus den gelesenen Tabellen — sie bestimmen Prüftiefe und Testpflicht, sind aber Hinweise, keine Einstufung (Feedback 15.09.2026) | S |

**Fertig, wenn** V25-A02 (beide Katalogsichten mit Vorrangregel und Regelversion),
V25-A05 (zu kurzes Fenster erzeugt einen Prüfauftrag), V25-A06 und W22-A15/A16
(simuliert, übersprungen oder anderer Codehash gilt nie als bestanden).

### Phase 8 — v2.18 „Entscheiden und Übergeben"

Mockup Screens 3, 4 und 5 (linke Spalte).

| # | Schritt | Größe |
|---|---|---|
| 8.1 | **IT-Sicht:** Findings mit beiden Katalogsichten, Level-Verteilung, Spur Anforderung → Anker → Finding → Zielentwurf | M |
| 8.2 | **Architekturvertrag als Dokument:** Zielkontext, Laufzeit, Persistenz, APIs, gebundene Eingaben — **und warum die Alternativen verworfen wurden** | M |
| 8.3 | **Generierung folgt dem Vertrag;** eine Abweichung von der Empfehlung wird festgehalten und angewendet | M |
| 8.4 | **Entscheidung:** bindet Bedarf, Option, Kostenrevision und Vertrag; Bedingungen mit Status; Zeitleiste; **umkehrbar ja/nein**. Bestätigt vom Konto — „Selbstauskunft, kein organisatorisches Mandat" | M |
| 8.5 | **Nachweiskette und Übergabepaket:** Anforderung → Entscheidung → Receipt → Lieferartefakt; das Signaturmanifest nennt `covers[]`; der vorhandene Offline-Verifier prüft es | M |
| 8.6 | **Steering-Einseiter:** eine Seite (PDF) mit ausschließlich Zahlen, die per Link zur Evidenz führen, jede mit ihrer Abdeckung, und der Spalte „nicht bestimmt" (Feedback 15.09.2026) | M |

**Fertig, wenn** C23-A29 (manipulierte Evidenz wird erkannt), V25-A11
(Offline-Verifikation mit `covers[]`), W22-A17 (Export ist keine Übernahme) und
QA24-A17 (ein Fingerprint ohne Bestätigung ist kein grüner Status).

### 3.0 — Umstellung

| # | Schritt | Größe |
|---|---|---|
| 3.0.1 | **Schalter für alle:** jedes Projekt öffnet im Arbeitsraum; die sieben Stufen bleiben als Werkzeuge | S |
| 3.0.2 | **Bestandsprojekte** öffnen ohne Verlust von IDs, Runs und Signaturen (C23-A02) | M |
| 3.0.3 | **Erhaltungsregister im neuen Arbeitsraum:** jeder Referenzfall aus 1.1 besteht | S |
| 3.0.4 | **Accessibility-Basis:** Tastatur, Screenreader, `forced-colors`, Telefon in Breakpoint S mit der Reihenfolge aus `DESIGN.md` §2.9, Druckbild nach §7.1; „Keyboard shortcuts" im Hilfe-Menü; Überschriftenfolge und Live-Regionen im gerenderten Test (§8) | M |
| 3.0.5 | **Aufräumen:** der alte 1.000-Zeichen-Generator und das ungenutzte `components/ProcessDocumentation.tsx` gehen — nie eine öffentliche Seite mit Suchreichweite (3.0.6) | S |
| 3.0.6 | **Neue Landingpage und öffentliche Texte — Teil des Releases 3.0, nicht danach** (Entscheidung Sonny 15.09.2026): die Startseite nach `docs/roadmap/clean-core-landing-v3_0.html`; **jede Produktansicht darauf aus dem echten Arbeitsraum** — Screenshots oder eingebettete Vorschau des Demo-Projekts `Z_MM_PO_APPROVAL`, bei jedem Release mit `tests/capture-screens.spec.ts` neu erzeugt, sodass Bild und Produkt nie auseinanderlaufen; keine Mockup-Bilder. Erhalten bleiben Anmeldebutton an gleicher Stelle, Navigation zu den Wissensseiten, Metadaten und Canonical, JSON-LD (Organization, SoftwareApplication, FAQPage deckungsgleich mit dem sichtbaren FAQ, BreadcrumbList), Sitemap, Robots und Live-Zahlen aus dem Katalog. **Die Katalog- und Wissensseiten bleiben mit URL, Canonical und Inhalt unverändert erreichbar** (Entscheidung Sonny 15.09.2026, viele Impressionen): `/catalog`, `/catalog/[object]`, `/catalog/browse/[letter]`, `/catalog/module/[area]`, `/catalog-sitemap.xml`, `/sap-clean-core-object-classification`, `/method/levels`, `/sap-cloudification`, `/clean-core-explained`, `/how-it-works`, `/knowledge`, `/abap-custom-code-analysis`, `/clean-core-score`, `/features/[slug]`, `/how-to`, `/whitepaper`, `/licenses`, `/about`, `/trust` — sie bekommen nur den 3.0-Look; die neue Startseite verlinkt aktiv hinein (Objektsuche, Beispielobjekte, A–Z). Grundlage ist Google Search Console (letzte 6 Monate bis 15.09.2026: 9.115 Impressionen, davon 3.706 in den letzten 30 Tagen; Startseite 1.509, `/catalog` 1.491, `/knowledge` 1.417, `/sap-cloudification` 1.371, `/abap-custom-code-analysis` 1.150, rund 70 Objektseiten). Titel und sichtbare Überschriften folgen den Suchanfragen, die schon Reichweite haben, aber kaum Klicks — „SAP Cloudification Repository viewer" (403 Impressionen, Position 8, 0 Klicks), „cloudify SAP", „ABAP (static) code analysis", „Clean Core Score". Gehalten von `tests/seo-surface-guard.spec.ts`. Dazu README, How-to, Whitepaper, `llms.txt`, Facts | L |
| 3.0.7 | **Demo-Projekt und Tour im Arbeitsraum** (`DESIGN.md` §6.1.2): die Demo aus 0.10 in allen Sichten und Ebenen, neu erzeugt mit jedem Release, das Engine oder Regelversion ändert; Tour mit rund zwölf Stationen (Enthüllung bis Übergabe), eine Station je Ort, Fortschritt nur im Browser, Einladung nach jeder dritten Station und am Ende; „Show tips again" im Hilfe-Menü | M |

**Fertig, wenn** alle Phasenabnahmen auf `main` gelaufen sind, ein Korpusfall den
ganzen Fluss durchläuft und die Copy-CI grün ist — **und die neue Landingpage mit
echten Produktansichten live ist**: kein Mockup-Bild auf einer öffentlichen Seite,
Anmeldung wie heute erreichbar, Landing-Guards und Signavio-/Geld-Guards grün,
JSON-LD und sichtbares FAQ deckungsgleich. 3.0 wird nicht ohne die neue Startseite
veröffentlicht.

---

## 5. Abgleich mit den Mockups

Zielbild von 3.0 sind die **Mockups 2.8** (`docs/roadmap/clean-core-mockups-v2_8.html`, 16 Screens), gebaut nach
`DESIGN.md` und **von Sonny am 15.09.2026 abgenommen**. Sie finden sich **1:1** in dieser Roadmap wieder: jedes
Element jedes Screens steht unten mit dem Schritt, der es baut und mit echtem Inhalt füllt. Ein Element im Mockup
ohne Schritt ist ein Fehler dieser Roadmap, nicht des Mockups; `tests/mockup-roadmap-guard.spec.ts` hält das fest
(jeder Screen hat hier eine Zeile, jeder genannte Schritt existiert, jede Schritt-Markierung im Mockup auch).

Die Zahlen in den Mockups sind Platzhalter, bis ein echter Lauf sie liefert — Ausnahme sind die Zeilenanker des
Beispiels `Z_MM_PO_APPROVAL` (L87, L108, L231, L412, L470, L502, L512), die echte Zeilen sind. Die Landingpage für
3.0 hat ein eigenes Mockup (`docs/roadmap/clean-core-landing-v3_0.html`, Schritt 3.0.6).

| Screen | Element | Schritt |
|---|---|---|
| s0 Erster Blick | Aufbau in vier Momenten, ≤ 3 s, „Skip", Endzustand bei reduzierter Bewegung, Zähler nur mit echten Zeilen | 2.7 |
| s0 | Code-Fläche mit leuchtenden Zeilen, Knoten wachsen aus ihrer Zeile | 2.3, 2.7, 1.5 |
| s0 | fachliche Namen einmal nachgereicht, Chip *Model proposal*; Modell hält den Aufbau nicht auf | 2.4, 2.7 |
| s0 | Klarsprache-Satz mit Anker; Enthüllung „hard-coded in the program" mit „Why?"; *Not determined* daneben | 2.4, 2.8, 7.5, 1.5 |
| s1 Business · Prozess & Regeln | Kopf mit Titel, „Details" (Metazeile), Zeile „Project status" | 1.4, 0.5 |
| s1 | Sichten-Umschalter mit Frage-Satz und „About this view" | 6.1 |
| s1 | Menü „Tools", Anchor Bar mit Ebenen und „More" für leere | 1.4, 6.2 |
| s1 | Karte „Next step" | 6.5 |
| s1 | Prozesskarte „Map \| Steps", Zoom, Fokus, Quellspalte mit Reitern, „Legend" | 2.5 |
| s1 | Export PNG und PDF mit Chips und Ankern | 2.6 |
| s1 | Geschäftsregeln eingeklappt, Tag *hard-coded in program*, Entscheidung je Regel | 3.4, 3.5, 2.8 |
| s1 | „What this process does" mit Ankern, unbelegte Sätze grau | 2.4 |
| s1 | *Not determined* mit Grund und nächstem Weg | 7.5 |
| s1 | Standard-Kandidaten mit Evidenzstufe E1 | 7.2 |
| s1 | „Ask this case" mit vorab beantworteter Frage | 6.8, 2.7 |
| s1 | Coach Mark 1 von 3 | 2.7 |
| s1 | „Invite to view", Initialen mit Einsicht | 5.2, 5.5 |
| s2 Regeln bearbeiten | Entscheidungsformular mit Value States, fokussierter Fehler-Strip | 3.5, 1.5 |
| s2 | Fußleiste „Unsaved changes", Popover „Checks (3)", „Save as revision 2" | 3.2, 3.3 |
| s3 Standard-Fit | Fähigkeiten mit Evidenzstufen E0–E4 als Kennung, Scope Item als zu prüfende ID | 7.2 |
| s3 | „What changes for users" | 7.6 |
| s3 | Given/When/Then-Szenarien | 7.3 |
| s3 | Prüfaufträge | 7.5 |
| s3 | Compliance-Hinweise | 7.7 |
| s4 IT · Findings & Kette | IT-Fokus Application · Solution · Enterprise | 6.1 |
| s4 | Kette je gewähltem Befund mit Abdeckung „Chain complete for 31 of 42" | 8.1 |
| s4 | Findings mit beiden Katalogsichten, fünf Zeilen und „Show all", Live-Filter | 8.1, 1.5 |
| s4 | Level-Facette, Overlays | 6.3 |
| s4 | Architekturvertrag AC-1 mit verworfenen Alternativen, Generierung folgt ihm | 8.2, 8.3 |
| s4 | Importe: ATC und Nutzung | 7.1 |
| s5 Management · Entscheiden | Antwortsatz über allen Karten, Antwort-Titel je Karte | 6.4 |
| s5 | Readiness mit Regelversion und Verlauf, *Imported* | 6.4, 0.3 |
| s5 | Public-Cloud-Fit und vier Töpfe je Zielplattform, Retire mit 13-Monats-Nachweis | 6.7 |
| s5 | Entscheidung DEC-1 mit Bedingungen, Umkehrbarkeit, modaler Bestätigung | 8.4, 1.5 |
| s5 | Kosten nur als *Simulation*, „Do nothing", Pflichtfelder „What the comparison still needs" | 7.4, 0.4 |
| s5 | Steering-Einseiter | 8.6 |
| s5 | Zeitleiste eingeklappt | 8.4 |
| s6 Übergabe & Nachweiskette | Kette Anforderung → Entscheidung → Beleg → Artefakt, Übergabepaket | 8.5 |
| s6 | Belege *Imported* oder *Demonstrated · mock*; gesperrter Live-Testmodus | 8.5, 0.1 |
| s6 | Toast „Handover package downloaded" | 1.5 |
| s7 Mein Arbeitsbereich | List Report mit Live-Filter, Objektstatus, *Stale* | 1.8, 0.6 |
| s7 | laufende Analyse mit Abbrechen, gescheiterter Lauf mit „Retry" | 1.8, 1.5 |
| s7 | Demo als erste Zeile, Karte „Your turn" | 0.10, 1.8 |
| s7 | Kontingent-Zeile | 0.9 |
| s8 Tenant-Verbindung prüfen | Sperrhinweis einmal mit BYOT-Weg, Mock-Tab führt Tests aus, kein Stepper | 1.7, 0.1 |
| s9 Zustände | neun Herkunfts-Chips in drei Formen, Druck und `forced-colors` | 1.5, 3.0.4 |
| s9 | vier Buttons, `dark` allein in der modalen Message Box | 1.5 |
| s9 | Formular mit Value States, Pflichtfelder | 1.5 |
| s9 | Filter leer vs. „No findings match these filters", Empty State | 1.5 |
| s9 | drei Sichten mit erster Antwort und Abdeckung | 6.1 |
| s9 | „Why?"-Popover, Glossar im Text, Beispiel-Strip | 1.5, 6.6 |
| s9 | drei Coach Marks, Hilfe-Menü mit „Show tips again" | 2.7, 3.0.7 |
| s9 | „Ask this case" mit Glossarbegriff und „What is a released API?" ohne Modellaufruf | 6.8, 6.6 |
| s9 | Suche ⌘K, Initialen-Popover | 6.6, 5.5 |
| s10 Telefon & Druck | Breakpoint S: Reihenfolge, Schrittliste statt Karte, „Why?" als 44-px-Ziel | 3.0.4 |
| s10 | Druckbild ohne Leisten, Chips mit Wort und Icon | 3.0.4 |
| s11 Neues Projekt — Hochladen | Formular mit Drop-Zone und Value States | 2.7, 1.5 |
| s11 | „What it counts": fünf Analyse-Läufe, eigener Schlüssel, Beispiel einmal frei | 0.9 |
| s11 | „Where a model is called" und was ohne Modellaufruf entsteht | 2.4 |
| s11 | Karte „Your code and your trust" mit Links, Zusage-Zeile ohne Häkchen | 0.11 |
| s12 Großer Prozess · Übersicht | Phasen als eingeklappte Teilprozesse mit Problemzeile, Gliederungsbaum, Pfadzeile | 2.9 |
| s12 | Palette: Fehler-Enden, bedingter Fluss, Fremdsystem als Pool mit Nachrichtenfluss, Fehler-Randereignis | 2.3, 2.6 |
| s12 | Laufvarianten aus den Selektionsschaltern, Overlays als Filter | 2.9, 6.3 |
| s12 | nicht erreichter Code, Klone, technische Helfer | 2.3 |
| s13 Großer Prozess · eine Ebene tiefer | Brotkrumen, „Show paths to here", Gliederungsbaum aufgeklappt, Quellspalte | 2.9 |
| s13 | Mehrfach-Instanz, Aufruf-Aktivität VA02 mit Level D, Datenspeicher, Textanmerkung | 2.3, 6.3 |
| s13 | Overlay „Technical" (Commit alle 50 Aufträge) | 6.3 |
| s13 | Tastenkürzel-Hinweis, Legende der Palette | 3.0.4, 2.5 |
| s14 Neues Projekt — Einstieg | Kern-Satz, drei Unterschiede, Clean Core in drei Blicken mit Stand des Katalogabgleichs | 2.7 |
| s14 | die drei Sichten in Bewegung, reduzierte Bewegung als drei Spalten | 6.1 |
| s14 | acht Beispiele, `Z_MM_PO_APPROVAL` zuerst; Warnung beim erneuten Start | 0.9, 2.7 |
| s14 | wiederkehrender Besuch: eine Zeile „What is Clean-Core.io?" | 2.7 |
| s15 Demo-Projekt mit Tour | Demo-Strip mit „Reset demo", Titel „Demo ·" | 0.10, 3.0.7 |
| s15 | Tour mit zwölf Stationen, „3 of 12", Einladung am Stationsende | 3.0.7 |

**Aus den Mockups 2.7 bewusst nicht übernommen** — die Abweichungen folgen alle aus §2 (Konto unverändert, Rollen
nur als Sichten, Teilen nur als Einsicht):

| Mockup 2.7 | Warum nicht |
|---|---|
| „Intent: Understand / Decide / Assure" | eine Achse (Sicht) statt zwei |
| „Playing as ▾", Rollen an Regeln, Bedingungen und Signaturen | Rollen sind Sichten; bestätigt wird vom Konto („bestätigt von ‹Name› · Datum") |
| „Members on this case" mit Rechtestufen | Einsicht per Einladung, Übersicht und Widerruf (5.5), keine Rechtestufen |
| Share-Dialog mit Handle und eingefrorenem „Evidence link" | Einladung an eine bestätigte E-Mail-Adresse (5.2–5.4); ein eingefrorener Stand ist der Export |
| „Discussion" | offen (§9) |
| „Expected vs. observed" | nach 3.0 (§7) |
| MCP-Zugang | nach 3.0 (§7), ohne virtuelle Rollen |

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
| **Kandidaten (Feedback 15.09.2026)** | Code-Anonymisierung vor dem Modellaufruf · CLI/API, die Pull Requests gegen Clean-Core-Regeln prüft (Shift-Left) · Aufwandsschätzung aus Metriken, erst mit Kalibrierung aus der Bench |
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
| Wellenplanung über mehrere Projekte, Kapazitätsplanung, verpflichtende Owner je Objekt als Rolle (Feedback 15.09.2026) | Projekt = Fall; bestätigt wird vom Konto; Priorisierung innerhalb eines Projekts über den nächsten Schritt (6.5) |

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
| **Gestaltung** | `DESIGN.md`: SAP-Fiori-Muster übernehmen, das Fiori-Theme nicht; Look von Clean-Core.io bleibt; Arbeitsraum öffnet in der Business-Sicht; Herkunft als feste Liste im Code |
| **Dark Mode** | entfällt (1.6) |
| **Tenant-Tab und Stepper** | Tab bleibt sichtbar als „Tenant-Verbindung prüfen" mit BYOT-Weg; Stepper nicht umbauen, nur die Kodierung vereinheitlichen (1.7) |

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

**Vollprüfung von 7bdac5e (15.09.2026, 9 Modellaufrufe, 1,36 $):** 86 Befunde, davon 69 bestätigt (1 critical, 14 high, 28 medium, 26 low — Schwere nach Prüfung), 15 widerlegt, 2 zurückgestellt. Die widerlegten betrafen vor allem Komponenten, die nirgends gerendert werden, und Artefakte der Capture-Umgebung.

| ID | Schwere | Befund | Roadmap-Schritt | Status |
|---|---|---|---|---|
| UX-002 | critical | Null Befunde als Fully Supported besiegelt | 0.8 | eingeplant |
| UX-001 | high | Er fundene 95%- und 80%-Balken ohne Messung | 0.2 | eingeplant |
| UX-003 | high | Verify-Pack-Upload ist per Tastatur nicht bedienbar | 1.5 | eingeplant |
| UX-004 | high | Confluence-Export erfindet fehlende Bewertungen | 1.2 | eingeplant |
| UX-007 | high | Zielwahl und Dialoge nicht tastaturbedienbar | 1.5 | eingeplant |
| UX-019 | high | Zustände stärker gezeigt als belegt – Balken, Haken, Exporte | 0.2 | eingeplant |
| UX-020 | high | Kernpfade per Tastatur und Screenreader blockiert | 1.5 | eingeplant |
| UX-023 | high | Dark Mode bricht an zentralen Flächen | 1.6 | eingeplant |
| UX-024 | high | Orientierung bricht zwischen den Bereichen | — | zurückgestellt |
| UX-037 | high | Transformation verspricht Node.js auch im RAP-Track | 0.2 | eingeplant |
| UX-038 | high | Remediation-Modus schaltet nur Text, nicht Code | 0.2 | eingeplant |
| UX-040 | high | Transformation Insights sind statisch und track-falsch | 0.2 | eingeplant |
| UX-044 | high | Dark Mode bricht an Projektzeile und Stepper | 1.6 | eingeplant |
| UX-059 | high | Forum täuscht öffentlichen Post vor, speichert nur lokal | 0.2 | eingeplant |
| UX-061 | high | Dashboard ohne Dark-Parität, Projektzeile kaum lesbar | 1.6 | eingeplant |
| UX-062 | high | Dashboard-Tabelle bleibt im Dark Mode weiß | 1.6 | eingeplant |
| UX-005 | medium | Routenwechsel ohne Bestätigung und Undo | 0.7 | eingeplant |
| UX-006 | medium | Von Befund kein Weg in den Code | 1.5 | eingeplant |
| UX-012 | medium | Sticky-Header und Tabs verdecken Inhalt auf Phone | 1.4 | eingeplant |
| UX-017 | medium | Sehr kleine Schrift erschwert das Lesen | 1.5 | eingeplant |
| UX-022 | medium | 78 Button-Stile statt einer gemeinsamen Sprache | 1.5 | eingeplant |
| UX-025 | medium | Generierung und Fehler ohne Ausweg und Undo | 1.5 | eingeplant |
| UX-027 | medium | Grüner Haken für ungeprüften Code | 0.2 | eingeplant |
| UX-029 | medium | Kompatibilität behauptet, aber nicht belegt | 0.2 | eingeplant |
| UX-030 | medium | Phone verdeckt Inhalt und schluckt Aktionen | 1.4 | eingeplant |
| UX-032 | medium | Ausdruck ohne eigene Kostenfiguren | 0.3 | eingeplant |
| UX-034 | medium | Task-Drawer fängt Tastatur nicht ein | 3.0.4 | eingeplant |
| UX-036 | medium | Systematische Kleinschrift unter 12px | 1.5 | eingeplant |
| UX-039 | medium | Audit-Abhaken geht bei Reload verloren | 0.7 | eingeplant |
| UX-041 | medium | Karten und Minimap nicht tastaturbedienbar | 1.5 | eingeplant |
| UX-042 | medium | Buttons haben 78 Stile statt einer gemeinsamen Sprache | 1.5 | eingeplant |
| UX-043 | medium | Massig Text unter 12px schwächt Lesbarkeit und Kontrast | 1.5 | eingeplant |
| UX-045 | medium | Glossar und Overlays nicht tastatur- und screenreaderfähig | 3.0.4 | eingeplant |
| UX-049 | medium | Fehlende Design-Sektionen verschwinden still | 1.2 | eingeplant |
| UX-056 | medium | Stepper und Rail kodieren Fertig unterschiedlich | — | zurückgestellt |
| UX-063 | medium | Zwei Beispiel-Bibliotheken konkurrieren auf dem Dashboard | 3.0.5 | eingeplant |
| UX-064 | medium | Jede Sektion erfindet eigenen Primär-Button | 1.5 | eingeplant |
| UX-065 | medium | Toggles ohne Switch-Semantik für Screenreader | 3.0.4 | eingeplant |
| UX-067 | medium | Kritische Aktionen in nativen Browser-Dialogen | 1.5 | eingeplant |
| UX-068 | medium | Slideshow-Steuerung ohne Fokus und zu kleine Trefferfläche | 3.0.4 | eingeplant |
| UX-069 | medium | Modal-Icon-Buttons ohne Namen für Screenreader | 3.0.4 | eingeplant |
| UX-070 | medium | Kleinstschrift an tragenden Stellen kaum lesbar | 1.5 | eingeplant |
| UX-073 | medium | Kleinstschrift 9-10px für Badges und Banner | 1.5 | eingeplant |
| UX-075 | medium | Auge-Buttons ohne zugänglichen Namen | 3.0.4 | eingeplant |
| UX-076 | medium | Onboarding-Abbruch mit Schuld-Formulierung | 0.2 | eingeplant |
| UX-008 | low | Slideshow-Steuerung ohne Namen, Pfeiltasten gekapert | 3.0.4 | eingeplant |
| UX-011 | low | Wirre Befund-Begriffe und Sprachmix | 1.5 | eingeplant |
| UX-013 | low | Vorschau widerspricht Editierbarkeit, Start irreführend | 1.5 | eingeplant |
| UX-015 | low | Zurück-Navigation verhält sich je Seite anders | 1.4 | eingeplant |
| UX-016 | low | Katalog verliert den Workspace-Kontext | 1.4 | eingeplant |
| UX-026 | low | Begriffe und Versprechen wechseln je Stufe | 0.2 | eingeplant |
| UX-028 | low | LoC-Regler kann echten Wert nicht abbilden | 0.3 | eingeplant |
| UX-031 | low | SOP-Weiterweg nur im Hover-Tooltip | 1.2 | eingeplant |
| UX-033 | low | Folienschalter ohne Namen | 3.0.4 | eingeplant |
| UX-035 | low | Lange Generierung ohne Abbruch | 1.5 | eingeplant |
| UX-050 | low | Winzige Labels und Status nur über Farbe | 1.5 | eingeplant |
| UX-053 | low | Fehler- und 404-Seiten sprechen drei Sprachen | 3.0 | eingeplant |
| UX-057 | low | Grounded Grounding Audit doppelt und uneinheitlich | 0.3 | eingeplant |
| UX-058 | low | QuickAnswer meldet offen, obwohl zugeklappt | 3.0.4 | eingeplant |
| UX-060 | low | Projektzeile und Icon-Aktionen nicht tastaturbedienbar | 3.0.4 | eingeplant |
| UX-066 | low | 2FA-Button behauptet Scan ohne QR-Code | 3.0 | eingeplant |
| UX-072 | low | Admin nutzt native confirm/alert statt Produktmustern | 3.0 | eingeplant |
| UX-074 | low | Settings-Karten mit beliebigem Farbstreifen | 1.5 | eingeplant |
| UX-078 | low | Admin-Zeilen ohne erweiterten Zustand | 3.0.4 | eingeplant |
| UX-079 | low | Deaktivierter Register-Button erklärt sich nicht | 5.1 | eingeplant |
| UX-080 | low | Showroom-Tabs ohne sichtbaren Tastaturfokus | 3.0.4 | eingeplant |
| UX-081 | low | Autoplay ignoriert reduzierte Bewegung | 3.0.4 | eingeplant |
| UX-082 | low | Zwei Header-Muster auf öffentlichen Seiten | 3.0.6 | eingeplant |
| UX-083 | low | Download-Fehler bleibt unsichtbar | 3.0 | eingeplant |
| UX-084 | low | First-Run nennt Quote anders als der Header | 0.2 | eingeplant |
| UX-085 | low | Kleinstlabels in 10px Kapitälchen | 1.5 | eingeplant |
