# Clean-Core.io — unabhängiger Code Review und Produkt-Roadmap bis 3.0 / 3.5

**Entscheidungsfassung · 8. September 2026 · Sprache: Deutsch**  
**Prüfbasis:** bereitgestellter Source-Snapshot `clean-core-src-v2.8.5-0455ce2.zip`, bisherige Roadmap `clean-core-io-roadmap.md`, gezielte Recherche aktueller SAP- und Anbieter-Primärquellen.  
**Charakter:** technischer Review, eigenständiger Produktentwurf und priorisiertes Entwicklungsbacklog. Keine SAP-Zertifizierung, kein Penetrationstest und keine Zusage zu Produktionsreife oder Lieferterminen.

---

## Lesehilfe und Inhaltsübersicht

Für eine erste Entscheidung reichen Kapitel 1, 4, 6 und 11. Für die Produktentwicklung sind zusätzlich der Review in Kapitel 3, die sieben Workflow-Vertiefungen in Kapitel 7 und das Backlog in Kapitel 12 maßgeblich. Kapitel 13–17 beschreiben Messung, Umsetzung, Risiken, Glossar und Quellen.

1. [Managemententscheidung und Zielpositionierung](#kapitel-1)
2. [Prüfgrundlage, Methode und tatsächlicher Implementierungsstand](#kapitel-2)
3. [Code Review: belegte Befunde, Auswirkungen und Korrekturen](#kapitel-3)
4. [SAP und Wettbewerb: was tatsächlich differenziert](#kapitel-4)
5. [Kritische Überarbeitung der bisherigen Roadmap](#kapitel-5)
6. [Zielprodukt und verbindliche Architekturentscheidungen](#kapitel-6)
7. [Alle sieben Workflow-Schritte: Ist, Soll, Gates und fachliche Tiefe](#kapitel-7)
8. [Durchgängiges Beispiel für Erstleser](#kapitel-8)
9. [Evidenz-, Entscheidungs- und Berechtigungsmodell](#kapitel-9)
10. [Technische Zielarchitektur und Migrationspfad](#kapitel-10)
11. [Release-Roadmap von 2.9 bis 3.5](#kapitel-11)
12. [Umsetzungsbacklog: Epics, Features, User Stories und Abnahme](#kapitel-12)
13. [Qualitätsnachweis, Benchmark und Erfolgskennzahlen](#kapitel-13)
14. [Kapazität, Abhängigkeiten und erste 90 Tage](#kapitel-14)
15. [Risiken, Nachhaltigkeit und bewusste Nicht-Ziele](#kapitel-15)
16. [Glossar](#kapitel-16)
17. [Quellenregister und Reproduzierbarkeit](#kapitel-17)

**Leseschlüssel:** `[C]` bezeichnet einen Befund im gelieferten Quellcode, `[Pxx]` eine lokal ausgeführte, isolierte Prüffunktion, `[Sxx]` eine externe Quelle und `[V]` einen eigenen Vorschlag. Quellenpfade und Zeilen beziehen sich ausschließlich auf den gelieferten Snapshot, nicht auf einen möglicherweise inzwischen geänderten GitHub-Branch. Eine Implementierung im Repository ist kein Nachweis, dass sie in der öffentlichen Produktion identisch läuft.

---

<a id="kapitel-1"></a>

## 1. Managemententscheidung und Zielpositionierung

### 1.1 Das Gesamturteil

**Clean-Core.io besitzt eine brauchbare Grundlage für einen transparenten Entscheidungs- und Nachweisprozess rund um SAP-Custom-Code. Der Snapshot rechtfertigt jedoch noch nicht die Positionierung als belastbare Enterprise-Modernisierungsplattform.** Die wichtigste Lücke ist nicht die Anzahl der Funktionen. Es fehlt eine durchgängige Verbindung zwischen dem tatsächlich untersuchten Quellstand, einer fachlich richtigen Bewertung, einer verantworteten Entscheidung, der daraus abgeleiteten Änderung und deren realer Verifikation.

Das Produkt hat bereits mehr Substanz als eine reine LLM-Oberfläche: eigene statische Analyse, SAP-Kataloganbindung, serverseitig neu berechnete und HMAC-geschützte Analyse-Runs, Nutzungsimport, Architekturentscheidung, mehrteilige Codeentwürfe, Testpfade und ein serverseitig gebautes Audit-Paket. Es gibt außerdem gezielte Regressionstests, Firestore-Regeln, MFA-Prüfungen an wichtigen Serverrouten und Sicherheits-CI. Diese vorhandenen Bausteine sollten verbessert, nicht durch einen Komplett-Neubau verworfen werden. [C: `lib/abap/`, `app/api/runs/create/route.ts`, `app/api/audit-pack/create/route.ts`, `firestore.rules`, `.github/workflows/`]

Gleichzeitig bestehen fachliche und technische Widersprüche, die Entscheidungen beeinflussen: A–D-Klassifikation vermischt verschiedene SAP-Sichten; eigene Tabellen führen pauschal in Richtung CAP; eine Architektenauswahl wird nicht konsequent vom Generator konsumiert; alte Folgeartefakte bleiben neben einem neuen Analyse-Run bestehen; Simulation und tatsächlicher Testerfolg sind nicht sauber getrennt; TCO leitet Geld aus unbelegten Score-Annahmen ab. Diese Punkte haben Vorrang vor Newsletter, zusätzlicher Seitenzahl, breiterem LLM-Angebot oder einem großen MCP-Werkzeugkatalog. [C; Details Kapitel 3]

### 1.2 Die empfohlene Positionierung

> **Clean-Core.io verbindet technische SAP-Evidenz mit überprüfbaren Geschäftsentscheidungen und einer kontrollierten Übergabe in die vorhandene SAP- und Delivery-Werkzeugkette.**

Nicht „Wir ersetzen SAPs Custom-Code-Werkzeuge“. Nicht „Wir erzeugen automatisch produktionsfertigen Clean Core“. Auch nicht „Nur wir können Business-Dokumentation“. Der belastbare Anspruch ist: **Für einen klar abgegrenzten Entscheidungsfall lässt sich nachvollziehen, was bekannt ist, was unklar bleibt, warum eine Option gewählt wurde, wer sie verantwortet und welche Nachweise die Umsetzung tatsächlich besitzt.** [V]

Die Differenzierung ist eine zu validierende Kombination aus offenem Evidenzformat, nachvollziehbaren Regeln, sehr niedrigem Einstieg, Business-Owner-Beteiligung, portierbaren Ergebnissen und nachweisbarer Qualität. Kein einzelnes dieser Merkmale wird hier als einzigartig im Gesamtmarkt behauptet. Nova und Lemongrass beschreiben bereits fachliche Dokumentation und Standardalternativen; SAP hat einen allgemein verfügbaren Custom Code Migration Agent. [S04, S08, S09]

### 1.3 Die fünf wichtigsten Produktentscheidungen

**Erstens: Vertrauen vor Breite.** Vor zusätzlichen Business-Funktionen müssen Klassifikation, Routing, Zustandsmodell, Teststatus und Zahlen konsistent sein. Eine signierte falsche Aussage bleibt falsch.

**Zweitens: Geschäftsentscheidung vor Technologieentscheidung.** Zuerst klären, ob eine Fähigkeit noch gebraucht wird und ob vorhandener Standard genügt. Erst anschließend zwischen Key-User-Erweiterung, ABAP Cloud, Side-by-Side und anderen Optionen entscheiden. „CAP oder RAP?“ ist eine Unterentscheidung, nicht das Gesamtproblem.

**Drittens: Ein Entscheidungsfall statt ein einzelnes Textfeld.** Die Arbeitseinheit wird ein `DecisionCase`: ein fachlicher Ablauf bzw. Einstiegspunkt mit seinen abhängigen Objekten, Regeln, Nutzungsbeobachtungen, Verantwortlichen und Freigaben. Ein Z-Report kann viele technische Objekte und mehrere fachliche Teilentscheidungen enthalten.

**Viertens: SAP-Nachweise importieren und präzise einordnen.** ATC, ABAP Unit, Custom Code Migration, Nutzungsdaten und später ALM-/Transportnachweise ergänzen die eigene Engine. Die Anwendung behauptet nicht, einen Zielsystem-Check aus einem Textupload rekonstruieren zu können.

**Fünftens: 3.0 als schmaler, kompletter Prozess; 3.5 als geschlossener Betriebs- und Verbesserungszyklus.** Eine kleinere Plattform, die einen Fall zuverlässig vom Eingang bis zur genehmigten Übergabe führt, ist wertvoller als eine breite Plattform mit sieben voneinander entkoppelten Generatoren.

### 1.4 Was 3.0 und 3.5 konkret bedeuten

**Version 3.0 — Evidence-backed Decision & Delivery:** Ein Pilotteam bearbeitet einen begrenzten Objektcluster. Analyse und externe Prüfnachweise sind versioniert. Business Owner und Architekt wählen eine Option. Die Umsetzung erfolgt als kontrollierter Entwurf oder als Import aus vorhandenen Werkzeugen. Tests besitzen tatsächliche Ausführungsnachweise. Wirtschaftlichkeit ist ein transparentes Szenario. Delivery übergibt ein konsistentes, überprüfbares Paket; Nicht-Entwicklungsentscheidungen können ohne Codegenerator abgeschlossen werden.

**Version 3.5 — Continuous Modernization Governance:** Mehrere Programme werden rollenbasiert gesteuert. Änderungen an Quellcode, Katalogen, Zielreleases, Tests und Freigaben lösen gezielt Neubewertungen aus. Auslieferung, Betrieb, Stilllegung und realisierte Effekte werden mit der ursprünglichen Entscheidung verglichen. Agenten dürfen begrenzte, widerrufbare Aufgaben ausführen; sie dürfen weder Produktionsfreigaben erfinden noch selbst ihre fachliche Kontrolle ersetzen.

---

<a id="kapitel-2"></a>

## 2. Prüfgrundlage, Methode und Implementierungsstand

### 2.1 Umfang der tatsächlichen Untersuchung

| Gegenstand | Feststellung / Methode |
|---|---|
| Unveränderlicher Arbeitsstand | ZIP v2.8.5 mit Dateinamensbestandteil `0455ce2`; dieser Bestandteil wird nicht als separat verifizierter vollständiger Git-Commit ausgegeben. |
| ZIP-Fingerabdruck | SHA-256 `8b31316f7749babe04820c3579d22e10a3557b2ed810305eb8fd1620a6d47138`. |
| Repository-Inventar | 482 Dateien; 329 TypeScript-/TSX-Dateien; 68.909 physische TS/TSX-Zeilen einschließlich Tests und UI; 38 API-Routendateien. |
| Testinventar | 49 Dateien `tests/*.spec.ts` plus eine `*.test.ts`; das sind Dateien, nicht die Anzahl ausgeführter Tests. |
| Direkte Codeprüfung | Sieben Workflow-Seiten, gemeinsame Fortschrittslogik, Analyse-/Katalog-/Routing-Funktionen, Nutzungsimport, Signaturen, Audit-Paket, Testausführung, Firestore-Regeln und CI; ergänzend relevante Hilfsfunktionen und Regressionstests. |
| Lokale Ausführung | 32 gezielte Verhaltensproben auf originalen isolierten Funktionen; zusätzlich sieben mitgelieferte Starterbeispiele durch Evidence-Engine und Router. |
| Externe Recherche | Aktuelle SAP-Primärquellen, SAP-Partnerlistings, Anbieterquellen, Node- und abapGit-Dokumentation; Abruf am 08.09.2026. |
| Nicht ausgeführt | Vollständiger Next-Build, komplette Playwright-/Emulator-Suite, realer SAP-Compile-/ATC-/ABAP-Unit-Lauf, authentifizierter Produktionsworkflow, Penetrationstest, Kosten-/Lasttest. |

`npm ci --ignore-scripts --no-audit --no-fund` scheiterte in der Arbeitsumgebung an `EAI_AGAIN` bei der Namensauflösung zum npm-Registry. Das ist **kein festgestellter Repository-Fehler**. Für die isolierten Proben wurden Node v22.16.0 und der vorhandene TypeScript-Compiler 5.8.3 verwendet; das Projekt selbst deklariert TypeScript 5.9.3. Die isolierte Transpilation ersetzt keinen Typecheck mit der Projektversion. Der TAP-Parser und der TCO-Callback wurden unverändert per TypeScript-AST aus den Originaldateien extrahiert; es wurde keine nachprogrammierte Ersatzlogik getestet. Die 32 bestätigten Beobachtungen bedeuten **nicht „32 bestandene Produkt-Qualitätstests“**: Mehrere Proben bestätigen gerade unerwünschtes Verhalten. [P01–P32]

### 2.2 Evidenzstufen und Grenzen

**Reproduziert:** konkrete Funktionsausgabe in der lokalen Prüfumgebung, z. B. Division durch null im TCO-Modell. **Statisch belegt:** im Code nachvollziehbare Verbindung bzw. fehlende Verbindung, z. B. Generator liest `extensibilityRoute` statt der freigegebenen Architektur. **Risiko:** mögliche Auswirkung, deren Eintritt in Produktion nicht gezeigt wurde, z. B. unzureichende Isolation eines fremden Testprogramms. **Anbieterangabe:** öffentlich beschriebene Funktion, ohne eigenen Produktvergleich. **Vorschlag:** eigenes Zielbild, Zielwert oder Kapazitätsmodell.

Die bisherige Roadmap verweist auf einen separaten 130-Ticket-Audit. Dieser wird nicht als vollständig eigenständig vorliegende Prüfliste behandelt. Die Befunde dieses Dokuments tragen deshalb neue IDs `CR-01` bis `CR-30`; es wird nicht behauptet, unbekannte alte Tickets geschlossen zu haben.

### 2.3 Was schon vorhanden ist — und erhalten werden sollte

| Bereich | Im Snapshot tatsächlich vorhanden | Richtige Folgerung |
|---|---|---|
| Analyse | Tokenisierung, SQL-Erkennung, OO-Hilfslogik, Evidence-Findings mit Zeilen, getrennte deterministische Berechnung im Server | Engine konsolidieren und fachlich validieren; nicht bei null beginnen. |
| SAP-Katalog | Offizielle Release- und Klassifikationsdateien, kuratierte Mappings, erste Nachfolgertypen und Mehrfachnachfolger | Die Aufgabe ist Kontext-/Provenienzqualität, nicht erstmalig „einen Katalog bauen“. |
| Nutzungsdaten | CSV-/Tabellenimport, Spaltenzuordnung, Privacy-Sanitizing, Usage×Evidence-Matrix, `unknown`-Behandlung | Messkontext und Join-Qualität ergänzen; vorhandenen Import nicht nochmals als Neuentwicklung einplanen. |
| Vertrauenskette | Server-HMAC, Rückprüfung vor Audit-Export, immutable Run-Collection für Clients, serverseitiges Paket | Auf öffentlich verifizierbare Signaturen und vollständige Artefaktbindung ausbauen. |
| Security | `SECURITY.md`, Deployment- und Security-CI, Dependency-Audit, SBOM-Workflow, Secret-Scan, wichtige MFA-/Account-Gates | Wirksamkeit testen, Gate-Abweichungen schließen und Betriebsnachweise veröffentlichen. |
| Business | Fachliche Dokumentationsentwürfe, BPMN-Export, Architektur-Selbsterklärung, NFR-Entwurf | Quellenbindung, Business Owner, echte Freigaben und Standardvergleich ergänzen. |
| Delivery | Mehrdatei-Export und Audit-Paket; Hinweise „Draft“ / „self-attested“ an mehreren Stellen | Falsche Verifikationsaussagen entfernen und Formate mit Referenzsystemen prüfen. |
| Qualität | Viele spezifische Guard- und Regressionstests | Fachliche Testorakel prüfen: Ein grüner Test kann eine falsche SAP-Regel festschreiben. |

### 2.4 Ergebnisse der sieben Starterbeispiele

Ausgeführt wurden dieselben öffentlich im Snapshot abgelegten Beispiele, die `lib/starter-examples.ts` registriert. Die Werte sind **Ist-Ausgaben der aktuellen Engine**, keine bestätigten SAP-Bewertungen.

| Beispiel | Evidence-Findings | Routerausgabe | Engine-Score |
|---|---:|---|---:|
| `Z_MATERIAL_STOCK_CALC` | 3 | In-App ABAP Cloud | 96 |
| `Z_ORDER_INTEGRITY_CHECK` | 3 | In-App ABAP Cloud | 96 |
| `Z_INVOICE_EXTRACTOR` | 2 | In-App ABAP Cloud | 97 |
| `Z_SALES_ORDER_CREATOR` | 0 | In-App ABAP Cloud | 100 |
| `Z_BUSINESS_PARTNER_SYNC` | 3 | In-App ABAP Cloud | 97 |
| `Z_EMPLOYEE_EXPENSE_VAL` | 0 | In-App ABAP Cloud | 100 |
| `ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC` | 42 | Side-by-Side SAP BTP | 34 |

Der Invoice-Extractor enthält `OPEN DATASET` in Zeile 58. Die geprüfte Evidence-Engine liefert dazu kein eigenes Finding. Der Sales-Order-Creator enthält drei klassische BAPI-Aufrufe, erhält aber null Evidence-Findings. Daraus folgt nicht, dass jeder BAPI-Aufruf schlecht ist. Es folgt, dass **null Treffer hier keine vollständig geprüfte ABAP-Cloud-Konformität bedeuten**. Die Router-Scores dürfen deshalb nicht ohne Aussage zur Analyseabdeckung als Compliance-Maß kommuniziert werden. [C: `public/starter-examples/Z_INVOICE_EXTRACTOR.txt:58–85`, `Z_SALES_ORDER_CREATOR.txt:71–95`; Probe-Samplelauf]

---

<a id="kapitel-3"></a>

## 3. Code Review — priorisierte, belegte Befunde

### 3.1 Priorisierung

**P0:** vor weiterer Nutzung der betroffenen Funktion in belastbaren Business-/Delivery-Entscheidungen beseitigen oder die Aussage/Funktion kontrolliert deaktivieren. **P1:** Voraussetzung für einen verantwortbaren Enterprise-Piloten. **P2:** wichtig für Skalierung, Wartbarkeit oder Produktqualität. Die Priorität ist eine Produkt-/Risikopriorität, kein CVSS-Wert und kein Nachweis einer ausgenutzten Sicherheitslücke.

### 3.2 Befundregister

| ID | Prio / Evidenz | Befund und Auswirkung | Konkreter Beleg | Behandlung |
|---|---|---|---|---|
| CR-01 | P0 · reproduziert | `notToBeReleased` gewinnt vor `classicAPI` und ergibt D. ABAP-Cloud-Verwendbarkeit und klassische Einstufung werden vermischt. | `lib/abap/abcd-classification.ts:217–232`; P02/P03. | Zwei getrennte Sichten und zielkontextabhängige Regeln; E02. |
| CR-02 | P1 · reproduziert | Technisches A–D wird aus Business-Kritikalität abgeleitet; Dynpro pauschal D. Ein wichtiges Geschäftsobjekt ist nicht allein deshalb technisch schlechter. | gleiche Datei `114–134`; P05/P08; SAP-Gegenprüfung S01/S02. | Kritikalität separat führen; regelbasierte Technikeinstufung; E02. |
| CR-03 | P1 · reproduziert | Leere Findingliste → A; Unknown neben A verschwindet in Aggregation; unbekannter plausibler Name wird C. | gleiche Datei `152–158`, `217–232`; `catalog-service.ts:178–207`; P04/P06/P07. | Bewertetes Ergebnis UND Abdeckung/Unbekanntes ausgeben; E02/E03. |
| CR-04 | P0 · reproduziert | Schreibzugriff auf eigene Z-Tabelle erzwingt Side-by-Side; pauschale BTP-Präferenz auch für weitere Muster. | `extensibility-router.ts:94–110,119–127`; P01; S03. | Keine Technologiewahl aus einem einzelnen Legacy-Symptom; E05. |
| CR-05 | P1 · statisch | Key-User-Extensibility wird als „Tier 3“ bezeichnet; vorhandene Findings machen sie pauschal unmöglich. Architekturpanel schließt eigene Persistenz pauschal für RAP aus. | `extensibility-router.ts:139–150`; `components/ArchitectSignOff.tsx:18–31`. | Fachbegriffe und Eignungskriterien korrigieren; E05. |
| CR-06 | P0 · statisch + Samplelauf | Evidence-Engine erkennt lokale BAPI-Aufrufe und `OPEN DATASET` in gelieferten Beispielen nicht ausreichend; dennoch hoher Score bis 100. | `evidence-model.ts:379–418`; obige Starterbeispiele. | Unterstützungsgrenzen erkennen, Score sperren/relativieren, Detektoren ergänzen; E03. |
| CR-07 | P1 · statisch | Katalog nutzt zur Laufzeit einen `latest`-Stand; Zielrelease/-Edition ist kein vollständiger Lookup-Schlüssel. Fehlender Nachfolger wird teilweise zu „kein API-Pfad“ verdichtet. | `catalog-service.ts:1–15,64–104,115–120`; S05. | Release-spezifische Snapshots; „kein Treffer“ statt Unmöglichkeitsbeweis; E02. |
| CR-08 | P1 · statisch | Kuratierte Nachfolger überschreiben das primäre SAP-Mapping; separate Mappingtabelle in `code-assessment.ts` erzeugt weitere Wahrheit. „Verified“ bedeutet hier kuratiert, nicht technisch validiert. | `catalog-service.ts:92–104`; `evidence-model.ts:69–101`; `code-assessment.ts:11–38`; P09. | Eine Katalogschnittstelle; Herkunft, Zieltyp und Validierungsstatus getrennt; E02. |
| CR-09 | P0 · statisch | Architektenwahl `targetArchitecture` ist nicht der verbindliche Input des Transformationsgenerators. Der liest `extensibilityRoute` und entscheidet binär über BTP-Substring. | Design-Seite `772–811`; Transformation-Seite `434–451`. | Freigegebene Decision-Revision als alleiniger Generatorinput; E01/E05. |
| CR-10 | P0 · statisch | Neuer Analyse-Run löscht alte Folgeartefakte/Freigaben nicht. Vorhandene alte Designs können erneut verwendet werden. | `runs/create/route.ts:299–345`; Design-Seite `366–389`; `project-loader.ts:13–26`. | Immutable Artefaktrevisionen, Dependency-DAG, Invalidierung; E01. |
| CR-11 | P1 · reproduziert | Workflow zeigt Upload und Analyze als getrennte Schritte, lässt TCO aus und markiert Testing nach Anzahl generierter Fälle. | `workflow-steps.ts:14–87`; `Stepper.tsx:7–15,36–42`; P14/P15. | Ein Phasenmodell mit Evidenzzuständen, sieben echte Funktionen; E01. |
| CR-12 | P0 · statisch | ABAP-Mock erzeugt für alle gewählten Tests `Passed`; Live-ABAP-Pfad prüft vorrangig Erreichbarkeit/Metadaten/Lesen und ist kein gleichwertiger ABAP-Unit-Lauf. | `hooks/useTestExecution.ts:176–458`. Simulation wird zwar im Text markiert, Statusmodell bleibt zu grob. | `simulated`, `connectivity_passed`, `unit_passed` unterscheiden; E07. |
| CR-13 | P0 · reproduziert/statisch | TAP-SKIP/TODO wird Passed; nicht gefundene Test-ID erbt Erfolg aus `exitCode===0`. | `run-tests/route.ts:122–169`; `useTestExecution.ts:499–517`; P16/P17. | Strukturierte Runner-Receipts, exakte ID-Zuordnung, Fail-closed; E07. |
| CR-14 | P1 · statisch | Fehlende npm-Abhängigkeiten werden im Runner durch universelle Proxy-Stubs ersetzt. Das kann Verhalten verdecken. | `run-tests/route.ts:54–112`, Bundling-/Stub-Plugin. | Explizites Stub-Manifest, Vertragsprüfungen und getrennte Teststufen; E07. |
| CR-15 | P0 · Architektur-Risiko | Fremder generierter Testcode läuft als Node-Kindprozess im API-Kontext. Prozess-Permissions und JS-Netzguards sind keine starke Sicherheitsgrenze. Im Live-Modus gelangen Tenant-Credentials in den Child-Prozess. | `run-tests/route.ts:442–568`; S13. Kein Escape/Datendiebstahl getestet. | Separater kurzlebiger Runner, Infrastruktur-Isolation, keine Plattform-Secrets; E08. |
| CR-16 | P0 · statisch | Delivery zeigt verifizierte AUnit-/TAP-Tests anhand vorhandener Testfälle; Qualitätsunterzeilen behaupten Compliance ohne zugehörigen Prüfnachweis. | Delivery-Seite `585–617`. Die korrekte Einschränkung bei `646–662` behebt diese Widersprüche nicht. | Aussagen vollständig aus aktuellen Receipts; E07/E10. |
| CR-17 | P1 · statisch | RAP-Export schreibt `abapgit.xml` statt des offiziellen `.abapgit.xml`; generisches Paketlayout wird als vollständig kompatibel beschrieben. | Delivery-Seite `206–226,253–264`; S14. Kein Import in SAP ausgeführt. | Referenzserializer/Strukturprüfung plus echter Import-/Aktivierungsnachweis; E06/E10. |
| CR-18 | P1 · statisch | CAP-Track mischt CAP/CDS, Express, TypeORM, beliebige BTP-Trigger und verschiedene Testframeworks. Ein CDS-Dateiname beweist kein lauffähiges CAP-Projekt. | Transformation-Seite `515–570`; `hooks/useTestGeneration.ts`; Runner. | Kleine versionierte Zielprofile mit echten Builds; E06. |
| CR-19 | P1 · statisch | Falsches/ungültiges LLM-JSON fällt im Generator auf einen einzelnen Source-Text zurück und kann trotzdem `status: transformed` setzen. | Transformation-Seite `576–619`. | Schema-Validation, Quarantäne, keine Erfolgspromotion bei Parsefehler; E06/E11. |
| CR-20 | P1 · statisch | „Umfassende“ Prozessdokumentation basiert im technischen Pfad auf je 1.000 Zeichen Code, Design und Analyse; semantische Abdeckung ist nicht belegt. | Documentation-Seite `314–335`. | Strukturierte Regeln/Claims statt stiller Trunkierung; E04/E09. |
| CR-21 | P2 · statisch | BPMN-Lane-Name wird unescaped in XML geschrieben; Knoten-IDs kommen ebenfalls direkt aus Modellinhalt. Rollen wie `Finance & Risk` können ungültiges XML erzeugen. | Documentation-Seite `101–114`; andere Texte werden bereits escaped. | XML-Serializer, Schematest, ID-/Kantenvalidierung; E09. |
| CR-22 | P0 · reproduziert | TCO hat unendliche Werte bei Score100/Investition0, negative Payback-Werte und andere Datenkeys für Jahr0. | TCO-Seite `100–174`; P19–P23. | Sofortige Plausibilitätswächter; anschließend Modell ersetzen; E12. |
| CR-23 | P0 · statisch | TCO-Nutzen folgt fixem Zielscore95 und 85%-Testaufwandsannahme; die Beträge sind nicht aus beobachteten Aufwänden abgeleitet. | TCO-Seite `59–65,100–104,113–136,162–163`. Einige Annahmen werden angezeigt; daraus werden sie nicht empirisch. | Alternativenrechnung mit belegten/eingegebenen Kosten und Szenarien; E12. |
| CR-24 | P1 · reproduziert | Deutsches Datum `05.04.2026` wird als 4. Mai interpretiert; negative Aufrufzahlen werden akzeptiert. Messzeitraum wird aus beobachteten Datumswerten abgeleitet. | `usage-parser.ts:107–110,313–350`; P28/P29. | Deklarierte Locale und Messperiode, gültige Zähler, Importvorschau; E03. |
| CR-25 | P1 · reproduziert | Ergebnisvergleich normalisiert NaN zu0 sowie null/undefined ohne Fachtypkontext. Das kann fachliche Unterschiede verdecken. | `result-diff.ts:17–40`; P30. Reihenfolge und Duplikate funktionieren in P31/P32. | Feldtyp-/Währungs-/Nullsemantik und explizite Toleranzverträge; E07. |
| CR-26 | P1 · reproduziert | HMAC schützt signierte Run-Felder korrekt; unabhängige Authentizitätsprüfung benötigt jedoch den Server bzw. dessen Secret. Geändertes ausgeschlossenes Narrativ bleibt Run-verifikationsgültig. | `run-signature.ts:35–87`; Audit-Route `178–205`; P10–P13. | Asymmetrisch signiertes vollständiges Manifest; Wahrheit separat kennzeichnen; E10. |
| CR-27 | P1 · statisch | In die serverseitige Worklist fließen vom Client/LLM gelieferte Functional Gaps ein. Diese sind Teil des signierten Runs, aber nicht allein dadurch deterministische Fakten. Model-ID ist nicht an einen tatsächlichen Generation-Receipt gebunden. | `runs/create/route.ts:150–219,227–278`. | Herkunft je Claim und tatsächliche Provider-Receipts; E04/E11. |
| CR-28 | P1 · statisch | Freigabeattribute sind client-schreibbare Projektfelder. UI bezeichnet sie korrekt als Selbsterklärung, aber es existiert damit noch keine organisationsgebundene Business-Freigabe mit Funktionstrennung. | `firestore.rules`, Projekt-Allowlist; `ArchitectSignOff.tsx:163–179`. | Server-Attestations, Rollen, vertrauenswürdiger Zeitstempel und Revision; E05/E13. |
| CR-29 | P2 · statisch | Große Client-Seiten, doppelte Fachlogik und großzügiger Lint-Warnungsrahmen erschweren konsistente Weiterentwicklung. | Analyze 2.453, Testing 1.805, Documentation 1.431 Zeilen; `package.json:12`; Mappingduplikate. | Modularer Monolith, vertikale Migration, Warnungsbudget absenken; E01/E16. |
| CR-30 | P1 · statisch | Security-CI prüft High+ mit Allowlist, der eigentliche Deploy-Gate nur Critical. Root-Lizenz für den eigenen Anwendungscode ist im gelieferten Archiv nicht vorhanden. | `.github/workflows/security-ci.yml`, `deploy.yml:91–105`; Root-Inventar. | Einheitlicher verpflichtender Gate; Lizenzentscheidung vor OSS-/Selfhost-Versprechen; E08/E16. |

### 3.3 Was ausdrücklich nicht als Fehler wiederholt wird

Die Audit-Route prüft die Run-Signatur bereits vor dem erneuten Signieren. Findings und empfohlene Route im Audit-Paket werden aus dem Run, nicht aus frei editierbaren Projektfeldern genommen. Fehlende Signing Keys führen an wichtigen Routen zum Abbruch. Der Nutzungsimport unterscheidet fehlende Aufrufzahlen von gemessener Null. Der Ergebnisvergleich berücksichtigt inzwischen explizit die gewünschte Reihenfolge und erhält Duplikathäufigkeiten. Die Delivery-Seite setzt den Projektstatus nicht mehr allein durch Öffnen auf abgeschlossen. [C: Audit-Route `107–152`; `audit-signing-key.ts`; `usage-join.ts:119–146`; `result-diff.ts:48–121`; Delivery-Seite]

Diese Korrekturen sind relevant: Eine Roadmap, die bereits beseitigte Fehler erneut als Ist-Zustand verkauft, wäre ebenso wenig neutral wie eine, die verbleibende Probleme ignoriert.

### 3.4 Sofortmaßnahmen ohne großen Umbau

Vor dem nächsten Feature-Release sollten die unberechtigten Verifikationslabels verschwinden, TCO-Grenzfälle abgefangen, die automatische CAP-Pflicht entschärft und A–D-Fehlregeln gekennzeichnet werden. Ungedeckte Syntax darf nicht als „100% clean“ wirken. Ein vorhandener Design-Sign-off muss als revidierbare Selbsterklärung sichtbar bleiben. Live-Testausführung mit fremdem Code wird nur bei nachgewiesener separater Isolation aktiviert; fehlt dieser Nachweis, ist ein Export in die kundeneigene Testpipeline der sichere Produktpfad. [V]

Die langfristige Lösung ist nicht, an jeder Seite weitere Disclaimer anzuhängen. Die Lösung ist, dass fachliche Aussagen, Artefaktstatus und Freigaben **technisch nur aus derselben versionierten Quelle entstehen können**.

---

<a id="kapitel-4"></a>

## 4. SAP und Wettbewerb — was tatsächlich differenziert

### 4.1 Die SAP-Leitplanken, die das Produktmodell einhalten muss

SAP beschreibt Level A für das moderne freigegebene Erweiterungsmodell, B für empfohlene klassische APIs/Technologien, C für die Nutzung interner Objekte und D für nicht empfohlene Ansätze. Dabei können klassische UI-Technologien wie Dynpro/ALV unter Bedingungen in B fallen. Die klassische Einordnung ist nicht identisch mit der Frage, ob ein Objekt für ABAP Cloud freigegeben ist. Die SAP-Lernunterlagen erläutern außerdem die Zuordnung der betreffenden Usage-of-APIs-Prüfung zu Information, Warnung und Fehler. Das ist keine allgemeine Erlaubnis, jede beliebige ATC-Priorität pauschal in A–D umzudeuten. [S01, S02]

Für Clean-Core.io ergibt sich daraus ein **mehrdimensionales Ergebnis**: Zieledition und -release, Sprachversion, Objektrelease, klassische Klassifikation, verwendete Technik, Prüfumfang und tatsächlicher ATC-Befund. Die Analyse eines einzelnen aufgerufenen API-Objekts ist nicht automatisch die Gesamtklassifikation des aufrufenden Programms. Ein Score, das schlechteste bekannte Finding und die noch nicht bewertete Abdeckung sind drei verschiedene Dinge. [V auf Basis S01/S02]

RAP unterstützt persistente Geschäftsobjekte; eigene Tabellen sind deshalb kein allgemeines Ausschlusskriterium für ABAP Cloud. SAP veröffentlicht releasebezogene Cloudification-Dateien, unter anderem für Private-Edition-Releases. Daraus folgt: Die Zielarchitektur muss mit Zielkontext und fachlichem Verhalten begründet werden, nicht allein mit „Z-Tabelle vorhanden“ oder einem globalen `latest`-Katalog. [S03, S05]

### 4.2 SAPs eigene Werkzeuge: komplementär statt nachbauen

| SAP-Baustein | Belegbare Rolle | Rolle von Clean-Core.io | Nicht behaupten |
|---|---|---|---|
| ATC / Usage-of-APIs | Technische Prüfung unter konkreten Varianten und Systemvoraussetzungen; fachliche Einordnung gemäß SAP-Methode. [S01/S02] | Ergebnisimport, Kontextprüfung, Abweichungsanalyse, Entscheidungsbezug. | Ein statischer Browser-Score sei ein gleichwertiger SAP-Check. |
| Joule for Developers / Custom Code Migration Agent | SAP bezeichnet den Migration Agent in den Release-Highlights vom 20.07.2026 als allgemein verfügbar; Paketprüfung, Interpretation und Anpassungen mit Transportbezug werden beschrieben. [S04] | Ergebnisse und geänderte Objektstände übernehmen; fachliche Akzeptanz und unabhängige Nachweise ergänzen. | Agenten seien nur angekündigt oder hätten keine Traceability. |
| Custom Code Migration / Nutzungsdaten | Vorhandene SAP-Werkzeuge liefern technische Bestands- und Migrationsinformationen; die konkrete Exportfähigkeit muss am Pilotsystem bestätigt werden. [S06] | Adapter für tatsächlich vorliegende Formate, kein hypothetischer „Universal-Export“. | Jede Version habe identische Exporte, alle Konten hätten jede AI-Funktion. |
| Project Kernseife | SAP-Open-Source-Projekt für Clean-Core-Messung, mit ABAP- und BTP-Anteilen sowie eigener Klassifikationsarbeit. [S07] | Versionierten Mess-/Klassifikationsimport ergänzen; Quelle unverändert erhalten. | Nur ein statischer Score ohne Plattformbestandteile. |
| Cloud ALM | Öffentliche APIs für verschiedene ALM- und Operations-Anwendungsfälle; Task-API und Beispielrepository vorhanden. [S15/S16] | Zuerst Referenzen/Tasks und nachgewiesene Statusschnittstellen; später passende Metriken. | Ein generischer CSV-Export befülle automatisch das native RISE-Clean-Core-Dashboard. |
| LeanIX AI-assisted Architecture Decision Management | SAP führt die KI-gestützte Erstellung von Architekturentscheidungen mit Stakeholder-Review und -Freigabe in den Q2-2026-Highlights als allgemein verfügbar auf. [S04] | Den code- und prüfrevisionsgebundenen Entscheidungsfall integrieren; keine parallele allgemeine ADR-Plattform aufbauen. | SAP bediene keine Entscheidungen oder Geschäftsverantwortlichen. |
| Signavio / LeanIX / Process Navigator / Fiori-/API-Kataloge | Bestehende Prozess-, Architektur- und Standardquellen; konkrete Inhalte, Rechte und Adapter müssen pro Anwendungsfall geprüft werden. [S17–S19] | Vorhandene IDs und Modelle referenzieren, nicht noch ein vollständiges Prozess- oder EA-System bauen. | Öffentliche Sichtbarkeit bedeute uneingeschränkte Bulk-Nutzungsrechte. |

**Entitlement-Regel:** Für jede Integration werden verfügbare Version, benötigte Berechtigungen, Zielsystem, Anbieterregion, Vertrags-/Lizenzvoraussetzung und unterstütztes Format dokumentiert. Dieses Review bestätigt keine kundenspezifischen SAP-Vertragsrechte. Eine GA-Mitteilung ersetzt diese Prüfung nicht.

### 4.3 Der Wettbewerb ist breiter als die alte Roadmap annimmt

| Vergleichsgruppe | Öffentlich dokumentierter Leistungsanspruch | Konsequenz für die Strategie |
|---|---|---|
| Nova Intelligence | SAP-Listing beschreibt eine Plattform mit Custom-Code-Dokumentation, Fit-to-Standard, Modernisierung und Entwicklung; nicht ausschließlich ein SI-Projekt. Angaben zu Produktivität und Compliance sind Anbieterangaben. [S08] | „Business-Sprache“ und „Standardalternativen“ sind kein hinreichender Alleinstellungsbeweis. |
| Lemongrass | SAP-Listing nennt funktionale Spezifikation, Abhängigkeitscluster, Prozessbezug zu Signavio/LeanIX, Dispositionen und Cloud-ALM-Bezug. [S09] | Ein Cluster-Browser oder eine Prozesskarte allein macht Clean-Core.io nicht besser. |
| AWS/Kiro | Öffentliches Agenten-Repository und AWS-Beschreibung für Analyse, Remediation und weitere Clean-Core-Aufgaben. [S10] | Offenheit und niedriger Einstieg sind nicht exklusiv; Interoperabilität ist sinnvoller als künstliche Abgrenzung. |
| smartShift | Anbieter positioniert sich bei Analyse und Modernisierung; ein kostenloser Analyse-Einstieg wird angeboten. [S11] | „Kostenlos analysieren“ ist kein belastbarer Vorsprung. Fokus nicht auf Massenremediation legen. |
| Panaya | Anbieter beschreibt agentische Codekorrektur und Verbindung mit Tests/Änderungsanalyse. [S12] | Auch Test-/Impact-Narrative müssen durch eigene messbare Qualität gedeckt werden. |

Diese Tabelle ist kein unabhängiger Funktionstest der Wettbewerber. Ungeprüfte Merkmale werden nicht mit „Nein“ belegt. Für nicht öffentlich eindeutig dokumentierte Details — etwa Offline-Verifikation einzelner Artefakte, Identitätsniveau von Freigaben oder semantische Claim-Abdeckung — lautet das Ergebnis **„hier nicht unabhängig verifiziert“**.

### 4.4 Eine verteidigbare Wettbewerbswette

Der beste Startmarkt ist nach dieser Analyse **nicht die komplette autonome Migration einer SAP-Landschaft**, sondern die Vorbereitung und Verteidigung schwieriger Modernisierungsentscheidungen: unklare Altlogik, mehrere mögliche Zielwege, fehlender Business Owner, widersprüchliche technische Befunde und ein hoher Nachweisbedarf. [V]

Clean-Core.io sollte in einem Pilotvergleich vier Aufgaben besser lösen: einen unbekannten Ablauf verständlich erklären; entscheidungsrelevante Unsicherheit offenlegen; eine konkrete Freigabe mit prüfbarer Quellenkette einholen; die zugehörige Änderung ohne Vermischung von Entwurf und Nachweis übergeben. Ein Vorsprung gilt erst als belegt, wenn unabhängige Nutzer denselben Fall mit den Vergleichswerkzeugen und mit Clean-Core.io bearbeiten und Qualität sowie Aufwand erfasst werden.

Auch ein allgemeines Decision Log ist gegenüber SAP LeanIX kein Alleinstellungsmerkmal. Die eigene Wette liegt enger: der nachvollziehbare Zusammenhang zwischen konkreter Altlogik, bestätigten Geschäftsregeln, Zielentscheidung, ausgeführter Prüfung und Übergabe. [V; S04]

Ein neuer Katalog-Changelog, ein MCP-Endpunkt oder ein zusätzlicher LLM-Anbieter sind dann gute Hebel, wenn sie diesen Prozess verkürzen. Sie sind keine Ersatzstrategie für einen noch nicht funktionierenden Kernprozess.

---

<a id="kapitel-5"></a>

## 5. Kritische Überarbeitung der bisherigen Roadmap

### 5.1 Was übernommen wird

Die alte Roadmap setzt zu Recht auf Business-Verständnis, Nutzung, Standardalternativen, Eigentümerschaft, offene Formate und Komplementarität zu SAP. Ebenfalls sinnvoll sind transparente Grenzen, ein unabhängiger Benchmark, ein deterministischer Basismodus und ein kundeneigenes Betriebsmodell. Diese Richtung bleibt erhalten. [R01, Abschnitte 0–3]

### 5.2 Was konzeptionell geändert wird

| Alte Annahme / Planung | Neue Entscheidung | Warum |
|---|---|---|
| „Einzige Plattform“ / „Niemand liefert Business-Entscheidungsartefakte“ | Keine Exklusivitätsbehauptung; konkrete Vergleichshypothesen und Pilotnachweise. | Öffentlich beschriebene Wettbewerbsfunktionen widerlegen die breite Abgrenzung. |
| Sieben Schritte mit Upload, ohne TCO | Sieben fachliche Phasen mit Analyze inklusive Intake sowie eigenständigem Economics/TCO. | Code und Produktdokumentation enthalten die TCO-Seite; sie darf nicht aus der Analyse verschwinden. |
| Jede fachliche Aussage muss auf Codezeilen zeigen | Jede prüfbare Aussage braucht einen passenden Evidenztyp: Code, Runtime, Katalog, Dokument oder Mensch. | Ein Ansprechpartner oder eine saisonale Nutzung lässt sich nicht aus Codezeilen beweisen. |
| 95% Zeilenanker bedeuten hohe Qualität | Ankerquote UND semantische Unterstützung, Widersprüche, Abdeckung und Abstention messen. | Ein falscher Satz mit einer echten Zeilennummer bleibt falsch. |
| Narrativ grundsätzlich außerhalb der Signatur | Alle relevanten Artefakte gegen Veränderung schützen, Evidenzklasse separat führen. | Integrität ist nicht Wahrheit; Ausschluss schwächt Nachvollziehbarkeit. |
| Kein Standardtreffer = „belegt nicht abgedeckt“ | „Im untersuchten Katalogumfang kein Kandidat gefunden“; bestätigtes No-Fit nur nach fachlichem Review. | Unvollständige Suche kann keine allgemeine Negativaussage beweisen. |
| Name/Rolle/Datum ohne Account = Business-Signatur | Einladung, Identitätsniveau, serverseitige Attestation und passende Rollenprüfung; SSO im Enterprise-Pilot. | Unbestätigte Namenseingabe ist keine belastbare Organisationsfreigabe. |
| Nutzungsimport, SECURITY.md, SBOM als Neubau | Bestehende Funktion prüfen und erweitern. | Bereits im Snapshot vorhanden. |
| „Compiled and tested“ nur verständlicher erklären | Tatsächliche Verifikationsmechanismen einführen; Simulation als Simulation belassen. | Im geprüften ABAP-Mockpfad findet keine ABAP-Ausführung statt. |
| Self-host erst nach voller Featurebreite | Einen minimalen privaten Betriebsweg vor verbindlicher Enterprise-Freigabe sichern. | Datenschutz- und Beschaffungsfreigaben sind Eintrittsbedingung, kein späteres Extra. |
| Fünf Clean-Core-Dimensionen aus Code „vollständig“ bewerten | Evidenzmatrix je Dimension mit fehlenden Daten; kein universeller Gesamtscore. | Datenqualität, Betrieb und Prozesswirklichkeit benötigen zusätzliche Quellen. |
| Viele kleine Features in achtwöchigen Solo-Releases | Rollierende Schätzung, WIP-Limit, Gates, schmaler 3.0-Scope, ausgebauter 3.5-Scope. | AI-Unterstützung ersetzt Fachprüfung, Testumgebung und Betriebsverantwortung nicht. |

### 5.3 Rückverfolgung der alten Featuregruppen

| Alte IDs | Entscheidung für das neue Backlog |
|---|---|
| F0.1–F0.10: Facts, Begriffe, Score, Claims | E01/E02/E16; fachliche Fehlklassifikation und falsche Verifikation vor kosmetischer Copy-CI. |
| F1.1–F1.7: Trust | E08/E10/E11; vorhandene Controls nicht ignorieren; Runner-Isolation und echte Identität ergänzen. |
| F2.1–F2.6: Katalog/Datenprodukt | E02/E14/E16; zunächst releasekorrekte interne API, öffentliche API später. Seitenzahl/Wortzahl nicht als Qualitätsziel. |
| F 3.1–F3.6: Importe/Nutzung | E03/E14; vorhandenen Usage-Import ausbauen, tatsächliche Exportverträge im Pilot prüfen. |
| F4.1–F4.7: Business Bridge I | E04/E09; typed evidence statt ausschließlicher Codeanker; Q&A nach stabiler Claim-Basis. |
| F5.1–F5.6: Business Bridge II | E05/E12; Fit-to-Standard als geprüfter Prozess, Freigabe als serverseitiger Zustand. |
| F6.1–F6.6: Portfolio | E13/E15; Organisationsrollen vor Skalierung, ein überschaubares Programm vor komplexer Konzernsicht. |
| F7.1–F7.3: Provider/Self-host | E08/E11; zwei geprüfte Providerpfade statt fünf nomineller Logos; privater Betrieb bereits für 3.0. |
| F9.1–F9.5: OSS/Bench/Community | E16; Lizenz klären, Methodentests sofort; offener Benchmark vor großen Überlegenheitsclaims. |
| F10.1–F10.7: SEO/GEO | E16; datierte neutrale Vergleiche, wenige hochwertige Seiten, Adoption messen statt Indexmasse. |
| F11.1–F11.3: MCP | E14; read-only beginnen, Fallkontext und Berechtigungen wiederverwenden; keine universelle Produktions-Autonomie. |
| F12.1–F12.4: weitere Dimensionen | E15; evidenzbezogene Erweiterung bis 3.4/3.5, keine automatisch errechnete Betriebs- oder Compliance-Zertifizierung. |

---

### 5.4 Geschäftstauglichkeit braucht auch ein passendes Leistungsversprechen

Die öffentlichen Nutzungsbedingungen beschreiben die Plattform als Forschungs-/Evaluationsangebot, die Outputs als prüfpflichtige Entwürfe und den Betrieb ohne Anspruch auf Verfügbarkeit oder Fortbestand. Das ist für ein Community-Projekt nachvollziehbar, aber nicht automatisch das passende Leistungsbild für verbindliche Unternehmensprozesse. [S21]

Vor einem Enterprise-Angebot sind deshalb Nutzungszweck, Verantwortungsgrenzen, Datenverarbeitung, Betrieb und gegebenenfalls separat angebotene Dienstleistungen mit der tatsächlichen Produktleistung und den Bedingungen abzustimmen. Diese Roadmap verlangt keine pauschale Gewährleistung für generierten Code; sie verlangt ein ehrliches, fachlich und rechtlich geprüftes Angebot. Ein besseres Dashboard allein löst diesen Beschaffungs- und Betriebsaspekt nicht. [V]

---

<a id="kapitel-6"></a>

## 6. Zielprodukt und verbindliche Architekturentscheidungen

### 6.1 Der zentrale Gegenstand: ein DecisionCase

Ein `DecisionCase` beantwortet eine geschäftliche Frage, beispielsweise: „Wie soll künftig die kundenspezifische Prüfung vor einer Bestellfreigabe umgesetzt werden?“ Er enthält ein oder mehrere Entry Points, ABAP-Objekte, externe Schnittstellen, Regeln, Nutzung, Standardkandidaten und Verantwortliche. Die Gruppierung ist korrigierbar und versioniert. Technische Abhängigkeiten werden nicht mit fachlicher Zugehörigkeit gleichgesetzt.

Ein Fall kann geteilt werden: Eine häufig genutzte Prüfung bleibt bestehen, ein Export wird standardisiert, ein ungenutzter Sonderzweig wird stillgelegt. Umgekehrt können viele kleine Objekte zu einer gemeinsamen fachlichen Entscheidung gehören. Der Fortschritt wird deshalb auf Fall-, Objekt- und Programmstufe angezeigt — mit klaren Nennern, ohne dieselbe Arbeit mehrfach als Nutzen zu zählen.

### 6.2 Die Optionshierarchie

| Option | Fachliche Bedeutung | Typischer Abschlussnachweis |
|---|---|---|
| RETIRE | Bedarf entfällt oder wird an anderer Stelle nicht mehr benötigt. | Nutzungs-/Abhängigkeitsreview, Business-Zustimmung, Stilllegungs-/Rollbackplan. |
| STANDARDIZE | Standardprozess/-funktion übernimmt den Bedarf. | Fit-Gap-Entscheidung, Konfigurations-/Migrationstasks, fachliche Abnahme. |
| KEEP | Bestehende Lösung bleibt befristet oder dauerhaft nach begründeter Abwägung. | Risikoverantwortlicher, technische Bewertung, Wiedervorlage bzw. begründeter Ausnahmeentscheid. |
| KEY_USER | Kleine Erweiterung innerhalb der für den Zielkontext freigegebenen Möglichkeiten. | Passender Erweiterungspunkt, Transport-/Konfigurationsbezug, Fachtest. |
| ADAPT_ABAP_CLOUD | ABAP-Cloud-konforme Anpassung, häufig mit RAP, aber nicht jede ABAP-Cloud-Lösung ist ein RAP-Service. | Zielsystemprüfung, reale Tests, freigegebene Abhängigkeiten. |
| SIDE_BY_SIDE | Entkoppelte Anwendung, z. B. CAP, ABAP auf BTP oder eine andere begründet gewählte Runtime. | API-/Event-Verträge, Security-/Betriebsnachweis, Integrations- und Fachtests. |
| INTEGRATE / EVENT | Integrations- oder Ereignisarchitektur statt eigener Anwendungslogik. | Nachrichtenvertrag, Fehler-/Wiederanlaufkonzept, Ende-zu-Ende-Test. |
| REPLACE | Bestehende andere Unternehmenslösung bzw. Drittprodukt übernimmt die Fähigkeit. | Funktions-/Kosten-/Integrationsvergleich, Verantwortlicher und Abnahme. |

Ein kontrollierter klassischer Wrapper kann Teil einer befristeten Anpassungsoption sein. Er ist **keine pauschale Erlaubnis für direkte Schreibzugriffe auf SAP-Standardtabellen**. Standardisierung ist nicht bloß eine Variante von Stilllegung: Geschäftsbedarf kann bestehen bleiben, obwohl eigener Code entfällt. [V; SAP-Rahmen S01/S02]

### 6.3 Entscheidung ohne falsche Automatik

Der Optionenvergleich trennt **harte Ausschlusskriterien** von **Präferenzen**. Harte Kriterien sind beispielsweise fehlende im Zielkontext erforderliche Schnittstellen, unzulässige Schreibmuster oder nicht erfüllbare Synchronitätsanforderungen. Präferenzen betreffen zusätzliche Plattformkosten, Betriebskompetenz, Wiederverwendung und Entkopplungsnutzen. Eine gewichtete Empfehlung darf ein hartes Ausschlusskriterium nicht überstimmen.

Nicht ermittelbare Daten erhalten `unknown`, keine scheinpräzise mittlere Wahrscheinlichkeit. Ein LLM formuliert Zusammenfassungen oder schlägt Kandidaten vor; fachliche Optionen werden durch Evidence, Regeln und verantwortete Eingaben freigegeben. Menschliche Abweichungen von der Empfehlung sind erlaubt, müssen aber begründet, versioniert und bei relevanten Änderungen neu bestätigt werden.

### 6.4 Verbindliche Architekturentscheidungen

**ADR-01:** Ein modularer Monolith bleibt die Anwendungshülle. Fachlogik wandert aus großen Client-Seiten in gemeinsam getestete Services; kein flächendeckender Microservice-Umbau.

**ADR-02:** Ausführung fremden Codes erhält eine harte separate Sicherheitsgrenze: eigener kurzlebiger Runner mit minimalem Dienstkonto, Ressourcenlimits, geprüfter Egress-Policy und ohne Plattform-Admin-Credentials.

**ADR-03:** Jedes Artefakt verweist auf seine konkreten Elternrevisionen. Gleicher Projektname bedeutet nicht gleicher fachlicher Stand. Eine neue Source-, Decision- oder Target-Revision macht betroffene Folgeartefakte `stale`.

**ADR-04:** Serverseitige Gates entscheiden über Promotion und Handover. Clientnavigation bleibt Komfort, keine Berechtigungs- oder Freigabeinstanz.

**ADR-05:** Integrität, Provenienz, semantische Bestätigung und Organisationsfreigabe sind getrennte Eigenschaften. Keine davon wird durch die andere automatisch erfüllt.

**ADR-06:** Nicht-Code-Optionen sind vollständige Bürger des Workflows. RETIRE, KEEP und STANDARDIZE dürfen ohne künstlich generierte Code-/Testdateien abgeschlossen werden.

**ADR-07:** Technische Ausführung wird bevorzugt an bestehende SAP-/Kundenpipelines delegiert. Eigene Generatoren bleiben begrenzte, prüfbare Startpunkte, keine neue universelle Migrationsmaschine.

---

<a id="kapitel-7"></a>

## 7. Alle sieben Workflow-Schritte — gründliche Zielkonzeption

### 7.0 Eine eindeutige Phasendefinition

Im Snapshot existieren die Seiten **Analyze → Design → Transformation → Documentation → Testing → TCO → Delivery**. Stepper und Rail verwenden eine andere Zählung. Für die Roadmap bleibt die fachliche Siebenteilung erhalten; Upload ist Teil von Analyze, TCO wird zu Economics erweitert. Die Reihenfolge ist eine Orientierung, keine Wasserfallvorgabe: Wirtschaftlichkeit beginnt beim Optionenvergleich, Testspezifikation beim Verstehen, Dokumentation vor und nach der Umsetzung.

| Phase | Leitfrage | Hauptartefakt | Gate |
|---|---|---|---|
| 1 Analyze | Was liegt vor, was tut es, was wissen wir wirklich? | SourceBundle, EvidenceSet, Business Brief v0 | G1: Herkunft und Abdeckung transparent. |
| 2 Design & Decide | Welche Option erfüllt den Bedarf unter den Zielbedingungen? | OptionSet, Fit-Gap, DecisionRevision | G2: technische und fachliche Zustimmung im passenden Umfang. |
| 3 Transformation | Welche konkreten Änderungen setzen die gewählte Option um? | ChangeSet oder Nicht-Code-Umsetzungsplan | G3: Änderungen entsprechen freigegebener Entscheidung. |
| 4 Documentation | Was gilt fachlich und technisch, und was wurde verändert? | As-is/To-be/As-built-Dossier | G4: entscheidungskritische Aussagen belegt und konsistent. |
| 5 Testing & Verification | Welche Eigenschaften wurden tatsächlich geprüft? | VerificationReceipts, Rule-Coverage, UAT | G5: risikoadäquate reale Verifikation. |
| 6 Economics / TCO | Was kostet welche Option und welche Wirkung ist plausibel? | EconomicsCase mit Szenarien | G6: Annahmen sichtbar, keine unzulässige finanzielle Gewissheit. |
| 7 Delivery | Was darf mit welcher Verantwortung an wen übergeben werden? | ReleaseManifest, Handover, später Closure | G7: alle erforderlichen Nachweise aktuell und freigegeben. |

### 7.1 Schritt 1 — Analyze: von Textanalyse zu belastbarer Bestandsaufnahme

**Ist.** Analyze kombiniert Upload, LLM-Erklärung, eigene Findings, Katalogsuche, Scores, Routing, OO-/Datenzugriffssichten und Usage-Matrix. Die neue Run-Erzeugung berechnet wesentliche Werte serverseitig neu. Das ist eine sinnvolle Vertrauensbasis. Eingabe bleibt aber im Hauptpfad ein einzelner Quelltext; lokale Vorschau, gespeicherte Artefakte und signierter Run können unterschiedliche Stände repräsentieren. [C: Analyze-Seite, `runs/create`, `project-loader`]

**Die eigentliche fachliche Aufgabe.** Ein Nutzer muss zuerst wissen, ob er einen ganzen Geschäftsablauf oder nur einen Ausschnitt hochgeladen hat. Includes, Funktionsgruppen, Klassen, DDIC-Typen, Customizing, Jobs und externe Aufrufe beeinflussen Verhalten. Ein Parser kann fehlende Teile benennen, aber nicht ihre Funktion erfinden. Ebenso wenig beweist ein Kommentar eine tatsächlich implementierte Regel.

**Ziel-Input.** Ein versioniertes SourceBundle aus Text oder abapGit-ZIP; optional externe ATC-Ergebnisse, Objektinventar und Nutzungsdaten. Zum Bundle gehören Herkunft, System-/Mandantenbezug in nicht sensitiver Form, Exportdatum, Quellstand, Sprache, Zieledition/-release sowie bekannte Lücken. Kunden wählen, welche Informationen die Plattform überhaupt verlassen dürfen. Codeimport, LLM-Freigabe und Testausführung sind getrennte Einwilligungen/Autorisierungen.

**Ziel-Verarbeitung.** Ein zentraler Symbol- und Abhängigkeitsindex identifiziert Entry Points und statische Referenzen. Dynamische Aufrufe werden als ungelöste Kanten erhalten. Die Engine meldet den Anteil der eingelesenen Dateien und der syntaktisch bzw. semantisch unterstützten Konstrukte. Für bekannte Konstrukte entstehen Findings mit Datei, Bereich, Regelversion und Referenz. Ein unabhängiger Vergleich zeigt Unterschiede zu passenden importierten ATC-Befunden; er überschreibt diese nicht stillschweigend.

**Business Bridge schon hier.** Ein Object Brief beschreibt Zweck, Auslöser, Eingaben, Ergebnisse, wichtige Regeln, beteiligte Systeme und offene Fragen. Er unterscheidet Implementierung, vermutete Absicht und bestätigte fachliche Notwendigkeit. „Rolle aus AUTHORITY-CHECK abgeleitet“ ist nur ein Hinweis auf Berechtigungslogik, keine Feststellung des tatsächlichen Prozesseigners.

**Nutzung richtig behandeln.** Importierte Aufrufe erhalten Messbeginn/-ende, Systemabdeckung, Instrumentierung, Aggregation und Zählsemantik. Letzte beobachtete Ausführung ist nicht Messbeginn. Null Aufrufe in zwei Wochen ist kein Stilllegungsbeweis für einen Jahresabschluss. ST03N-Transaktionen werden nicht mit SCMON-Prozeduraufrufen in dieselbe Zählspalte addiert. Namen benötigen Objekttyp und Systemkontext, damit gleiche Namen nicht kollidieren. Pseudonymisierte Nutzerzahlen sind nur zu erfassen, wenn sie dem Entscheidungszweck tatsächlich dienen.

**Gate G1.** Quellen sind fingerprinted; Zielkontext ist vorhanden oder explizit unbestimmt; fehlende Objekte und unbewertete Syntax sind sichtbar; keine Klasse A/„clean“-Aussage wird durch fehlende Evidenz erzeugt. Ein unvollständiger Fall darf in eine Discovery-Entscheidung übergehen, nicht in ein angeblich verifiziertes Delivery-Paket.

**Business-Nutzen und Messung.** Gemessen werden Zeit bis zum überprüften Brief, Zahl noch offener entscheidungsrelevanter Fragen, falsch negative Findings und fehlende Abhängigkeiten. Anzahl hochgeladener Dateien ist keine Erfolgskennzahl. **Backlog:** E02, E03, E04, E14; insbesondere CR-01–08 und CR-24.

### 7.2 Schritt 2 — Design & Decide: Optionen statt voreingestellter BTP-Antwort

**Ist.** Design erzeugt ein Lösungsdokument und zusätzliche NFR-Felder. Ein Architekturpanel erlaubt RAP, CAP, Integration, Event und Retire; die Entscheidung ist ausdrücklich eine Selbsterklärung. Das ist ehrlicher als ein scheinbar offizielles Approval, reicht aber nicht für organisationsgebundene Freigaben. Der Generator richtet sich weiter nach der vorherigen Route, nicht zuverlässig nach dieser Auswahl. [C: Design-Seite `206–343,772–811`; Transformation `434–451`]

**Ziel.** Aus einem Object Brief entsteht ein vergleichbares OptionSet. Es enthält auch KEEP, STANDARDIZE, KEY_USER und REPLACE. Jede Option hat benötigte Voraussetzungen, erfüllte und offene Geschäftsregeln, technische Einschränkungen, Risiken, Betriebsauswirkung, Kostenrahmen und Evidenz. „Keine belastbare Empfehlung möglich“ ist ein reguläres Ergebnis.

**Standardprüfung als fachliche Arbeit.** Katalogmatching liefert Kandidaten, nicht automatisch Fit. Pro Regel wird geprüft: vom Standard erfüllt, konfigurierbar, erweiterbar, nicht erfüllt oder unbekannt. Zielrelease, Edition, Länderumfang, Stammdaten, Berechtigungen, Lizenz-/Entitlementvoraussetzungen und abweichende Prozessvarianten werden getrennt dokumentiert. Ein Fiori-App-Treffer belegt eine Oberfläche, nicht die vollständige Abdeckung einer kundenspezifischen Kontrollregel.

**Technikentscheidung.** Bei RAP/CAP sind Datenlokalität, Transaktionsgrenze, Synchronität, Massendaten, Latenz, Berechtigungsvererbung, API-/Event-Verfügbarkeit, Kompetenzen und Betriebsverantwortung entscheidend. Eine eigene Tabelle kann on-stack sinnvoll sein; eine einfache Validierung kann ein freigegebener Erweiterungspunkt lösen. Ein Event ist nicht automatisch besser als ein synchroner Aufruf. Ein fehlender Standard-API-Zugriff darf nicht durch einen erfundenen BAdI oder eine unspezifizierte Kernpublikation ersetzt werden.

**Freigaben.** Der Business Owner bestätigt Bedarf und akzeptierte Verhaltensänderung. Der Architekt bestätigt technische Option und Ausnahmen. Security/Data Owner werden nach Regeln beteiligt; nicht jeder Fall braucht alle Unterschriften. Für hochkritische Fälle gilt Funktionstrennung. Ein One-time-Link ist lediglich ein Zugangskanal: Identität und Berechtigung müssen entsprechend dem Risiko verifiziert werden. Eine Ablehnung ist ein vollwertiger, nachvollziehbarer Status.

**Gate G2.** DecisionRevision enthält ausgewählte Option, verworfene Alternativen, Begründung, aktuelle Evidence-Revision, offene Bedingungen und verantwortliche Rollen. Material geänderte Eingaben setzen Freigaben auf erneute Prüfung. Generierung vor G2 ist als Exploration erlaubt, wird aber nicht zur genehmigten Umsetzung hochgestuft.

**Messung.** Zeit bis zur verantworteten Entscheidung, Zahl der Rückfragen, Änderungsquote wegen fehlender Grundlagen, Anteil mit geprüftem Standardkandidaten und Anteil sinnvoller Nicht-Code-Entscheidungen. **Backlog:** E04/E05/E12/E13.

### 7.3 Schritt 3 — Transformation: kontrolliertes ChangeSet statt „production-ready“ aus einem Prompt

**Ist.** Die Anwendung erzeugt Mehrdatei-Entwürfe. Der RAP-Prompt beschreibt generische Artefakte; der BTP-Prompt vermischt Frameworks und fordert einen generischen ERP-Eventpublisher. Parsefehler können in ein scheinbar erfolgreiches Einzeldateiergebnis fallen. Neben generierten Texten werden sofort Projektstatus und Testsuite gespeichert. [C: Transformation `451–619`]

**Zielpfade.** Der primäre robuste Weg ist die Übergabe eines freigegebenen Plans an Entwickler, SAP-Agenten oder kundeneigene Werkzeuge und der anschließende Import des echten ChangeSets. Eigene Generierung bleibt möglich, aber beschränkt auf explizit unterstützte Zielprofile. Beispielsweise ein lesender RAP-Anwendungsfall mit vorhandenen freigegebenen Abhängigkeiten und ein CAP-Service mit nachgewiesenem Remote-Service-Vertrag. Weitere Profile folgen erst nach Referenztest, nicht nur nach neuem Prompt.

**Verbindlicher Eingang.** Die Generierung liest serverseitig die freigegebene DecisionRevision, deren SourceBundle und die Regel-/API-Auswahl. Sie akzeptiert nicht einfach eine editierbare Routenbeschriftung. Bei RETIRE entsteht ein Stilllegungsplan, bei STANDARDIZE ein Konfigurations-/Migrationstaskset, bei KEEP ein Ausnahme-/Wartungsplan. Es wird kein Dummy-Code verlangt, um einen Fortschrittsbalken zu füllen.

**Semantische Risiken.** Beim Wechsel ABAP→JavaScript können Dezimalpräzision, Rundung, Währungseinheiten, initiale Werte, Zeit-/Datumssemantik, Mandantenbezug, Sortierreihenfolge, Sperren, LUW/Commit und Fehler-/Retryverhalten abweichen. AUTHORITY-CHECK wird nicht allein durch „JWT vorhanden“ funktional ersetzt. Idempotenz, fachliche Berechtigungen und Datenminimierung müssen als überprüfbare Anforderungen übernommen werden. Diese Liste ist ein Prüfvertrag, kein Versprechen automatischer Lösung.

**Ziel-Output.** Das ChangeSet enthält Dateihashes, Elternrevisionen, Zielprofil, geprüfte Abhängigkeiten, generierte/manuelle Anteile, Regel-zu-Änderung-Mapping, bekannte Lücken und ein reproduzierbares Build-Rezept. Der Prompt darf keine beliebigen Paketnamen still in produktive Abhängigkeiten verwandeln. Bestehende Git-/Transportmechanismen bleiben System of Record für echte Änderungen.

**Gate G3.** Struktur valide, Pfade sicher, keine ungeprüfte Ersatzroute, keine nicht belegten SAP-Schnittstellen als garantiert verfügbar, jede wesentliche Geschäftsregel entweder abgebildet oder bewusst geändert. Build-Ergebnis und Generierungsergebnis sind getrennte Status. Tests aus demselben LLM sind nützliche Vorschläge, aber noch kein unabhängiger Korrektheitsbeweis.

**Messung.** Anteil Entwürfe mit erfolgreichem realem Build, Zahl manueller Änderungen bis zum Review, semantische Defekte und nicht unterstützte Fälle. Nicht „Zeilen generiert“. **Backlog:** E06/E07/E11.

### 7.4 Schritt 4 — Documentation: As-is, To-be und As-built auseinanderhalten

**Ist.** Technische und Business-Dokumentation sowie BPMN-/Confluence-Ausgaben existieren. Teile der Generierung erhalten nur kurze Textausschnitte. Die Ausgabestruktur kann Architektur- oder Projektrollen mit operativen Prozessrollen vermischen. Zeilenanker bzw. andere geprüfte Claim-Referenzen sind kein durchgängiger Vertrag. [C: Documentation `314–503`]

**Ziel.** Dokumentation ist eine Sicht auf dieselben Claims, Entscheidungen und Changes — kein unabhängiger Generator einer zweiten Realität. As-is beschreibt tatsächlich analysierte Implementierung; To-be beschreibt freigegebenes Ziel; As-built beschreibt umgesetzten und geprüften Stand. Offene Unterschiede bleiben sichtbar. Business-Dokumente nennen keine angeblich beobachteten KPI-Werte, nur definierte Metriken oder belegte Messungen.

**Drei Lesetiefen.** Der Business Owner erhält einen kurzen Entscheidungsbrief mit Regelbeispielen und Konsequenzen. Architekten/Entwickler erhalten Abhängigkeiten, Verträge, NFR, Traceability und offene Punkte. Audit/PMO erhalten Änderungen, Freigaben, Prüfnachweise und Ausnahmeentscheidungen. Alle Sichten tragen dieselbe Fall-/Revisionskennung; ein Word-/Markdown-Export darf nicht auf andere Zahlen zugreifen als die Anwendung.

**BPMN fachlich sauber.** Nicht jeder Codezweig ist ein Prozessschritt und nicht jeder technische Methodenaufruf eine menschliche Aktivität. Die Plattform erzeugt zunächst ein plausibles Modell, kennzeichnet dessen Rekonstruktionsgrad und verlangt Review von Rollen, Übergängen und Ausnahmen. Prozessrekonstruktion aus Code wird nicht als Process Mining vermarktet. Ein syntaktisch gültiges BPMN-XML beweist weder fachliche Richtigkeit noch direkte Ausführbarkeit in SAP Build.

**Kontrollen.** Eine erkannte Limitprüfung ist ein Kontrollkandidat. Ein tatsächlicher IKS-Nachweis benötigt Kontrollziel, Verantwortlichen, Ausführung, Evidenz und gegebenenfalls getestete Wirksamkeit. Die UI trennt deshalb `detected`, `owner_confirmed`, `implemented` und `operating_effectiveness_evidenced`.

**Gate G4.** Entscheidungsrelevante Claims sind belegt oder klar als Annahme/offene Frage markiert. XML/Markdown/HTML-Exports sind valide und escaped. Kein As-built-Dokument verweist unbezeichnet auf veraltetes Design. Ein Export in Signavio/Confluence ist nur als kompatibel gekennzeichnet, wenn er im unterstützten Zielprofil tatsächlich geprüft wurde.

**Messung.** Semantisch unterstützte Claimquote, Auffindbarkeit einer Quelle, Zahl widersprüchlicher Aussagen, fachliche Reviewdauer und erfolgreiche Export-Reimports. **Backlog:** E04/E09/E10.

### 7.5 Schritt 5 — Testing & Verification: das wichtigste Glaubwürdigkeits-Gate

**Ist.** CAP/Node-Tests können im Runner ausgeführt werden. Ressourcenbegrenzung, Eingabelimits, Ownership- und Account-Prüfungen sind vorhanden. Fehlende Dependencies werden allerdings gestubbt; TAP-Auswertung und fehlende Test-ID-Zuordnung können falsches Grün erzeugen. Der ABAP-Mockpfad ist explizit simuliert, verwendet aber `Passed`. Ein Live-Verbindungsnachweis ist nicht identisch mit der Ausführung der generierten ABAP-Unit-Klasse. [C: `run-tests`, `useTestExecution`]

**Ein neues Verifikationsmodell.** Jede Prüfung benennt exakt, was sie beweist: Schema validiert; Code syntaktisch analysiert; TypeScript gebaut; Unit-Test mit benannten Stubs ausgeführt; Unit-Test mit realen Dependencies; SAP-Aktivierung; ATC mit Variante; ABAP Unit; API-Vertrag; fachlicher UAT; Performance-/Security-Test. Diese Stufen sind nicht austauschbar und müssen nicht für jede Option vollständig durchlaufen werden.

**Test-Receipt.** Ein Receipt enthält Engine/Runner-Version, Code-/Testhash, Umgebung, Start/Ende, ausgewählte und tatsächlich ausgeführte Test-IDs, Status einschließlich skipped/todo/blocked/simulated, Logs/Artefakthashes, Stub-/Fixtureliste, Coverage-Methode und Signatur/Quellherkunft. Prozess-Exitcode0 allein reicht nicht. Ein fehlender Test wird `not_executed`, nicht `Passed`.

**Unabhängiges Testorakel.** Die Tests müssen gegen fachlich bestätigte Regeln und echte erwartete Ergebnisse prüfen. Für ausgewählte Funktionen werden Legacy- und Zielergebnisse verglichen, wo repräsentative Daten und sichere Testsysteme verfügbar sind. Synthetische Testdaten sind versioniert. Geldbeträge werden nicht über pauschale Gleitkommatoleranzen gleichgesetzt, und NaN wird nicht zu0 normalisiert. Nicht erlaubte Aktionen und Negativfälle sind genauso wichtig wie Happy Paths.

**SAP-Prüfung.** In 3.0 kann ein verifizierter Import aus einer vorhandenen Kundentestpipeline genügen. Herkunft, Zielsystem und verwendete Varianten werden geprüft. Der Connector muss nicht sofort selbst ABAP-Objekte schreiben oder Transporte anlegen. Nur wenn eine eigene Ausführung sinnvoll und berechtigt ist, wird sie als separates Profil mit minimalen Rechten implementiert.

**Gate G5.** Für die gewählte Option existiert eine risikoadäquate aktuelle Testmatrix. Kritische Regeln haben fachlich bestätigte Tests; ungetestete Risiken werden nicht durch Prozent-Coverage verborgen. Simulierte/fehlende/stale Prüfungen erfüllen das Produktions-Handover-Gate nicht. Freigabeausnahmen brauchen Risikoeigner und Ablaufdatum.

**Messung.** False-Green-Rate, ausgelassene Test-IDs, Regelabdeckung mit realer Ausführung, wiederholbare Ergebnisse, entdeckte semantische Abweichungen. **Backlog:** E07/E08, CR-12–16/25.

### 7.6 Schritt 6 — Economics / TCO: Entscheidungsmodell statt Score-Monetarisierung

**Ist.** Ein echter TCO-Schritt existiert. Die Seite verwendet aber feste Annahmen über Aufwand je Codeumfang, Zielscore95 und starke Testreduktion. Grenzfälle liefern unendliche oder negative Amortisationskennzahlen; initialer Cashflow hat andere Diagrammkeys. [C: TCO-Seite `59–174`; P19–P23]

**Ziel.** Wirtschaftlichkeit wird je Option gerechnet, nicht nur für „vorher schlecht/nachher gut“. Erfasst werden einmalige Umsetzung, Migration, Test, Change/Training, Doppelbetrieb und Stilllegung sowie wiederkehrende Plattform-, Lizenz-/AI-, Wartungs-, Betriebs-, Support- und Integrationskosten. Bereits vorhandene SAP-Verträge werden als konkrete Programmeingabe behandelt, nicht als automatisch kostenlose Alternative. Risiken erhalten Szenarien; ein gewichteter technischer Score wird nicht in Euro übersetzt.

**Datenqualität.** Jeder Wert trägt Einheit, Zeitraum, Quelle, Owner und Klasse: gemessen, Vertrag, Angebot, Nutzereingabe oder Annahme. Unbekannte Kosten bleiben offen. Ein fehlender Stundensatz darf nicht automatisch durch eine marktübliche Zahl ersetzt werden. Eine frei verfügbare Plattform kann dennoch Kosten für Betrieb, Provider, Prüfer und Support verursachen.

**Rechenvertrag.** Für Option o und Periode t gilt `NetCashflow(o,t) = vermiedene_Baselinekosten + zusätzlicher_realistisch_begründeter_Nutzen - zusätzliche_Optionskosten`. Jahr0 enthält alle anfänglichen Investitionen. Der NPV ist die Summe diskontierter Cashflows bei explizit eingegebenem Diskontsatz. Payback ist die erste Periode mit nicht negativem kumuliertem Cashflow; wird diese nicht erreicht, lautet das Ergebnis „nicht im Betrachtungszeitraum“, nicht eine negative Monatszahl. ROI braucht eine klar definierte Formel und einen positiven Investitionsnenner. [V: vorgeschlagener Rechenvertrag, keine finanzielle Empfehlung]

**Unsicherheit und Reihenfolge.** Low/Base/High-Szenarien zeigen, welche Annahmen die Optionsreihenfolge ändern. Eine Sensitivität kann ergeben, dass zusätzliche BTP-Betriebskosten den Vorteil überwiegen. Das ist ein gültiges Ergebnis. Wirtschaftliche Priorität, technische Dringlichkeit und Umsetzungskapazität werden nicht in einer einzigen intransparenten Zahl versteckt.

**Gate G6.** Modellparameter und Horizont vollständig bzw. Lücken sichtbar; finite Ergebnisse; initiale Kosten enthalten; keine double-counted Einsparungen; Finance/Programmleitung bestätigt die verwendeten Annahmen. Ein Fall ohne belastbare Eurorechnung kann mit qualitativer Begründung freigegeben werden — aber nicht mit erfundenem ROI.

**Messung.** Anteil Kosten mit Quelle, Sensitivität der Entscheidung, Prognose-/Ist-Abweichung und realisierte Effekte ab 3.5. **Backlog:** E12.

### 7.7 Schritt 7 — Delivery: Nachweispaket, Übergabe und Abschluss

**Ist.** Die Seite erstellt ZIP-Pakete und ein serverseitiges Audit-Paket. Letzteres überprüft den Analyse-Run und dokumentiert einige Provenienzklassen. Die Delivery-Seite hat hilfreiche Disclaimer, enthält aber zugleich unberechtigte Prüfbehauptungen. Das Code-ZIP und das Audit-Paket sind keine lückenlos gemeinsam versionierte Releaseeinheit. [C: Delivery-Seite; `audit-pack/create`; `audit-pack.ts`]

**Ziel: zwei klar benannte Produkte.** Ein **Review Pack** darf offene und ungeprüfte Entwürfe enthalten und ist früh verfügbar. Ein **Controlled Handover Pack** enthält genau die aktuelle freigegebene Entscheidungsrevision, das passende ChangeSet, die vorgeschriebenen Prüfreceipts, Economics, Dokumente und die verantwortete Übergabe. Beide unterscheiden sich in Zulassung und Status, nicht nur im Dateinamen.

**Gemeinsames Manifest.** Jeder enthaltene und extern referenzierte Bestandteil besitzt Typ, Hash, Revision, Provenienz, Sensitivität und Status. Die Signatur schützt auch LLM-Texte vor unbemerkter Änderung, bestätigt aber nicht deren inhaltliche Wahrheit. Ein Offline-Verifier prüft Signatur, Dateiinhalt, referenzierte Hashes und erforderliche Nachweise. Er zeigt eine verständliche Fehlermeldung bei Manipulation, veraltetem Parent oder unbekanntem Schlüssel.

**Übergabe je Option.** RAP/CAP erhalten nur tatsächlich unterstützte Paketformate und Build-/Importrezepte. STANDARDIZE erhält Konfigurations- und Migrationstasks. RETIRE erhält Abschaltliste, Monitoring-/Rollbackplan, Aufbewahrungsentscheidung und Business-Abnahme. KEEP erhält akzeptierte Risiken und Wiedervorlage. Ein Exportbutton ist noch kein Deployment- oder Stilllegungsnachweis.

**Geschlossener Kreis bis 3.5.** Transport/Deployment, Cutover, Hypercare und Betriebsrückmeldung kommen aus autorisierten Quellen zurück. Das Programm vergleicht erwartete mit realen Effekten und öffnet Entscheidungen wieder, wenn eine Voraussetzung entfällt. „Delivered“ bedeutet in 3.0 kontrolliert übergeben; „Closed“ bedeutet in 3.5 umgesetzt und anhand definierter Kriterien abgeschlossen. Diese Zustände werden nicht nachträglich miteinander verwechselt.

**Gate G7.** Releasepolicy erfüllt; keine unbemerkten stale Artefakte; fachliche und technische Freigaben passend; verantwortlicher Empfänger, Betriebsowner und Rückfallweg benannt. Optional blockiert eine organisationsspezifische Policy unvollständige Kosten- oder Sicherheitsnachweise. Produktionsänderungen bleiben in der kundeneigenen Autorisierungskette.

**Messung.** Anteil ohne Rückfragen akzeptierter Übergaben, Zeit zur Prüfung des Pakets, Fehlersuche bei Revisionskonflikten, erfolgreiche Verifikation und tatsächlicher fachlicher Abschluss. **Backlog:** E10/E13/E14/E15.

---

<a id="kapitel-8"></a>

## 8. Durchgängiges Beispiel für Erstleser

### 8.1 Der Fall: eine historisch gewachsene Prüfung vor Bestellfreigabe

**Das folgende Beispiel ist frei konstruiert.** Es ist weder ein Befund zu einem Kunden noch ein Funktionsnachweis für eine konkrete SAP-App. Der Name `Z_CONTRACT_ORDER_GUARD`, die Zahlen und die fachlichen Regeln dienen ausschließlich dazu, das Zielprodukt verständlich zu machen. Es werden bewusst keine ungeprüften Fiori-App- oder Scope-Item-IDs eingesetzt.

Ein historisches Programm sammelt Bestellpositionen, prüft Vertragsbezug und Betragsgrenzen, berücksichtigt eine lokale Ausnahme und erzeugt eine Exportdatei. Zum Fall gehören ein Report, zwei Includes, eine Z-Tabelle für Ausnahmen und ein Hintergrundjob. Die Programmleitung fragt nicht: „Wie bekommen wir 1.200 Zeilen auf BTP?“, sondern: **„Welche dieser Kontrollen brauchen wir weiterhin, und wie erfüllen wir sie am wirtschaftlichsten und sichersten?“**

### 8.2 So arbeitet der Fall durch die sieben Phasen

| Phase | Was der Nutzer konkret sieht und tut | Was ausdrücklich nicht automatisch gefolgert wird |
|---|---|---|
| Analyze | Der Import zeigt fünf gefundene und einen fehlenden Baustein. Regeln R1 „Vertragsbezug prüfen“, R2 „Betragsgrenze“ und R3 „lokale Ausnahme“ haben Codeanker. Ein Nutzungsimport deckt einen angegebenen Zeitraum ab; der jährliche Kontrolltermin liegt außerhalb. | Der Job sei ungenutzt; der fehlende Baustein sei irrelevant; die fachliche Absicht sei allein durch Code bewiesen. |
| Design & Decide | Der Prozesseigner bestätigt R1/R2, stellt R3 infrage. Der Architekt prüft Standardkonfiguration, geeignete Erweiterungspunkte und Betriebskosten. Eine Standardfunktion bleibt ein Kandidat, bis sie gegen die konkrete Regel und Zielversion demonstriert ist. | Eine ähnlich benannte Fiori-App decke den Bedarf; eigene Persistenz erfordere CAP; fehlende Aufrufe erlaubten sofortige Stilllegung. |
| Transformation | Der freigegebene Plan kann Standardkonfiguration für R1, eine kleine geeignete Erweiterung für R2 und Abschaltung von R3 vorsehen. Der Export erhält einen eigenen Teilfall, wenn andere Empfänger betroffen sind. Code und Konfigurationsaufgaben gehören zum selben ChangeSet. | Alles müsse in eine neue Anwendung übersetzt werden; ein für CAP generierter Entwurf dürfe trotz On-Stack-Entscheidung übernommen werden. |
| Documentation | Die As-is-Spezifikation bleibt erhalten. To-be beschreibt Standard und verbleibende Abweichung. Die Change-Matrix erklärt, dass R3 bewusst entfällt, wer dies bestätigt hat und welche Kontrolle stattdessen gilt. | Eine entfernte Regel sei automatisch eine verlorene Anforderung oder eine beibehaltene Regel automatisch sinnvoll. |
| Testing & Verification | Tests prüfen Grenzbetrag, Währung, Berechtigung, Ausnahmefall und Wiederholung. Ein SAP-Testlauf belegt den Zielstand. Für den entfallenden Zweig wird der autorisierte Abschalt- und Rückfalltest dokumentiert. | Ein HTTP-200 beweise korrekte Freigabelogik; identische Ergebnisse seien immer richtig, obwohl eine Regel absichtlich geändert wurde. |
| Economics | KEEP, Standard plus Rest-Erweiterung und Side-by-Side erhalten getrennte Kostenbilder. Ungeklärte Lizenzkosten bleiben offen. Nutzen wird nur einmal je weggefallenem Aufwand gezählt. | Ein besserer Clean-Core-Score habe automatisch einen bestimmten Euro-Wert; Entwicklungsaufwand sei der ganze Lebenszyklus. |
| Delivery | Das Paket enthält die exakte Entscheidung, Konfigurationstasks, Codeänderungen, zugehörige Tests, genehmigte Regelabweichungen, Betriebsowner und Rückfallplan. | Ein ZIP-Download sei gleichbedeutend mit erfolgreicher Produktivsetzung. |

### 8.3 Beispielhafte Entscheidung, ohne ihre Voraussetzungen zu überspringen

Die Empfehlung könnte lauten: „Standard plus eine kleine On-Stack-Erweiterung prüfen; R3 nur nach Kontrollfreigabe entfernen; Export separat entscheiden.“ Sie bleibt `proposed`, solange Erweiterungspunkt, Zielrelease, organisatorischer Fit oder Nutzungsabdeckung ungeklärt sind. Erst die bestätigten Nachweise machen daraus eine freigabefähige Option. **Eine gute Plattform macht die verbleibende Frage kleiner; sie versteckt sie nicht hinter einer Konfidenzzahl.**

Die fachliche Unterschrift lautet nicht „Code ist clean“, sondern beispielsweise: „R1 und R2 müssen in dieser Form erhalten bleiben; R3 darf unter den dokumentierten Bedingungen entfallen.“ Die technische Freigabe bestätigt separat, dass die vorgeschlagene Zielumsetzung mit den technischen Vorgaben vereinbar ist. Die QA-Abnahme bezieht sich auf die konkret geprüfte Revision.

### 8.4 Rechenbeispiel für Economics — ausdrücklich fiktiv

Angenommen, KEEP verursacht jährlich 84.000 Euro belegte Weiterbetriebskosten. Standard plus Rest-Erweiterung benötigt 60.000 Euro einmalig und danach 50.000 Euro jährlich. Side-by-Side benötigt 120.000 Euro einmalig und danach 70.000 Euro jährlich. Für dieses reine Demonstrationsmodell werden fünf Jahre, konstante Kosten, kein Abzinsungseffekt und keine zusätzlichen Lizenzkosten angenommen.

Dann beträgt der kumulierte Kostenvorteil von Standard plus Rest-Erweiterung gegenüber KEEP `5 × (84.000 − 50.000) − 60.000 = 110.000 Euro`. Für Side-by-Side ergibt sich `5 × (84.000 − 70.000) − 120.000 = −50.000 Euro`. Das ist keine SAP-Preis- oder Einsparprognose. Sobald zusätzliche Kosten oder andere fachliche Leistungen hinzukommen, muss neu gerechnet werden. Eine teurere Variante kann wegen notwendiger Entkopplung trotzdem richtig sein; die Entscheidung muss diesen Mehrwert dann explizit begründen.

---

<a id="kapitel-9"></a>

## 9. Evidenz-, Entscheidungs- und Berechtigungsmodell

### 9.1 Fachliche Kernobjekte

| Objekt | Zweck und notwendige Beziehungen |
|---|---|
| `Organization` / `Program` | Mandant, Policies, Rollen, Systeme und Zielkontexte. Ein Benutzer kann mehreren Organisationen mit unterschiedlichen Rechten angehören. |
| `DecisionCase` | Fachliche Entscheidungseinheit mit Entry Points, betroffenen Objekten, Owner, Scope und expliziten Ausschlüssen. Teilfälle können eigene Dispositionen erhalten. |
| `SourceBundle` | Unveränderlicher Quellenstand mit Datei-Hashes, Herkunft, Exportdatum, Objektindex und Vollständigkeitsbericht. |
| `TargetContext` | Produkt/Edition, Release, gegebenenfalls FPS, Sprachversion, aktivierte Fähigkeiten, verfügbare APIs und kundenspezifische Restriktionen. Unbekannt ist ein zulässiger Wert, aber keine Freigabe. |
| `EvidenceItem` | Einzelner Nachweis vom Typ Code, ATC, Runtime, Katalog, Dokument, Beobachtung oder menschliche Bestätigung. Enthält Scope, Zeitbezug, Herkunft und Grenzen. |
| `Claim` / `BusinessRule` | Behauptung bzw. fachliche Regel mit unterstützender und widersprechender Evidenz. Status getrennt nach Extraktion, Review und fachlicher Gültigkeit. |
| `OptionSet` / `DecisionRevision` | Vergleichbare Alternativen und gewählte Disposition, verworfene Optionen, Voraussetzungen, offene Fragen, Begründung und Gültigkeitsdauer. |
| `ChangeSet` | Dateien, Konfiguration, Migration, Stilllegungsschritte und Schnittstellenänderungen, jeweils auf die Entscheidung und Zielumgebung bezogen. |
| `VerificationReceipt` | Was, wie, wo, wann und gegen welchen Digest tatsächlich geprüft wurde; Prüfumfang, Ergebnisse, ausgelassene Tests und verwendete Stubs. |
| `Attestation` | Identität, Organisationsrolle, freigegebener Digest, Zweck, Zeitpunkt, Erklärung und gegebenenfalls Delegation. Keine bloße Freitextsignatur. |
| `EconomicsCase` | Optionen, Zeitraum, Währung, Kosten-/Nutzenkomponenten, Annahmen, Bandbreiten und Verantwortliche. |
| `ReleaseManifest` / `Closure` | Verbindet freigegebene Artefakte mit Empfänger und Übergabepolicy; Closure ergänzt Umsetzungs- und Betriebsnachweise. |

### 9.2 Vier unabhängige Vertrauenseigenschaften

Ein Artefakt kann unverändert signiert und trotzdem inhaltlich falsch sein. Ein fachlich richtiger Text kann veraltet sein. Ein Mitarbeiter kann etwas bestätigen, ohne dafür entscheidungsberechtigt zu sein. Daher werden diese Eigenschaften **nicht** in ein einziges „Verified“-Badge zusammengeführt:

| Eigenschaft | Beispielhafte Werte | Was sie beantwortet |
|---|---|---|
| Integrität | hash-valid, signature-valid, invalid, unknown-key | Ist der vorliegende Inhalt unverändert und einem Schlüssel zuordenbar? |
| Herkunft | engine, SAP-export, curated, LLM, human, customer-pipeline | Woher stammt die Aussage oder Messung? |
| Fachlicher Nachweis | unsupported, supported, contradicted, reviewed, out-of-scope | Trägt die Evidenz die konkrete Aussage im angegebenen Umfang? |
| Freigabe und Aktualität | draft, approved, rejected, stale, superseded, revoked | Ist dieser Stand durch die richtigen Rollen für den vorgesehenen Zweck freigegeben? |

Eine `VerificationReceipt` besitzt zusätzlich einen technischen Ergebnisstatus wie `passed`, `failed`, `skipped`, `not-run`, `inconclusive`, `simulated` oder `error`. Ein fehlendes Ergebnis wird niemals aus einem erfolgreichen Prozessende ergänzt.

### 9.3 Beispiel eines Evidence-Vertrags

Der folgende JSON-Ausschnitt ist ein **Schemastruktur-Vorschlag**, kein bereits implementiertes Austauschformat. Beispiel-IDs und Digest-Platzhalter sind nicht kryptografisch gültige Nachweise.

```json
{
  "schemaVersion": "cc-evidence/1.0",
  "caseId": "case-demo-001",
  "revision": 4,
  "sourceBundle": {"id": "src-02", "digest": "sha256:<source-manifest>"},
  "targetContext": {"edition": "private", "release": "customer-confirmed", "fps": null},
  "catalogSnapshot": {"repositoryCommit": "<commit>", "classificationDigest": "sha256:<catalog>"},
  "claims": [{
    "id": "rule-02",
    "kind": "implemented-business-rule",
    "text": "Die Prüfung verwendet eine Betragsgrenze.",
    "evidenceRefs": ["code-anchor-17"],
    "semanticStatus": "supported",
    "businessValidity": "awaiting-owner-review",
    "origin": {"type": "llm", "generationReceiptId": "gen-09"}
  }],
  "decision": {
    "id": "dec-04",
    "disposition": "ADAPT_ABAP_CLOUD",
    "status": "proposed",
    "requiredEvidence": ["target-api-availability", "owner-rule-confirmation"]
  },
  "verification": [{
    "id": "test-07",
    "subjectDigest": "sha256:<changeset>",
    "executor": "customer-pipeline",
    "checkType": "abap-unit",
    "status": "not-run"
  }],
  "attestations": [],
  "integrity": {"manifestDigest": "sha256:<manifest>", "signature": null}
}
```

Das tatsächliche Schema benötigt zusätzlich eindeutige Typdefinitionen, Größenlimits, kanonische Serialisierung, Migrationsregeln und Validatoren. Fehlerhafte oder zukünftige unbekannte Schema-Versionen werden nicht stillschweigend als Version 1 interpretiert. Unbekannte Erweiterungsfelder bleiben beim Roundtrip erhalten, sofern sie die Sicherheitsgrenzen nicht verletzen.

### 9.4 Revisionslogik und Invalidierung

Die Abhängigkeiten bilden einen gerichteten azyklischen Graphen: SourceBundle und TargetContext → EvidenceSet → Claims/OptionSet → DecisionRevision → ChangeSet → Verification/As-built-Dokumente → ReleaseManifest. Ein EconomicsCase hängt zusätzlich von gewählter Option und Annahmen ab.

Eine reine Textkorrektur in einer unverbindlichen Notiz muss keinen Testlauf entwerten. Eine geänderte Regel, API, Quelldatei oder Zielrelease dagegen invalidiert die betroffenen Nachweise. Dafür erhält jede Artefaktart eine explizite Invalidierungsmatrix. Alte Artefakte werden nicht gelöscht, sondern mit ihrer ursprünglichen Gültigkeit historisiert. Das neue Paket kann sie nur als historische Information enthalten, niemals unbemerkt als aktuellen Beleg.

Freigaben referenzieren einen Digest und den Freigabezweck. Ein Wechsel von CAP zu ABAP Cloud erzeugt eine neue DecisionRevision; der Generator kann die alte CAP-Empfehlung nicht mehr als aktuelle Autorität verwenden. Optimistische Sperren verhindern, dass zwei Bearbeiter sich gegenseitig ohne Hinweis überschreiben.

### 9.5 Rollen und Funktionstrennung

| Rolle | Darf fachlich | Darf nicht allein |
|---|---|---|
| Analyst / Entwickler | Quellen importieren, Findings prüfen, Änderung vorschlagen. | Eigenen Entwurf als organisatorisch und technisch geprüft freigeben. |
| Business Owner | Bedarf, Regeln, Standard-Fit, Abschaltung und fachliche Risiken bestätigen. | Technische Prüfungen ersetzen oder fremde Programme sehen. |
| Architekt | Zielkontext, technische Option, Ausnahme und Architektur begründen. | Fachlichen Bedarf ohne Owner stilllegen. |
| QA / Prüfer | Testumfang, Receipts und Akzeptanz bewerten. | Fehlende Ausführung durch Markierung „Passed“ ersetzen. |
| Programmleitung | Owner zuweisen, Prioritäten, Wellen und offene Entscheidungen steuern. | Kryptografische und technische Nachweise ändern. |
| Organisation-Admin | Mitgliedschaft, Richtlinien, Integrationen, Retention verwalten. | Bereits ausgestellte Nachweise rückwirkend umschreiben. |
| Auditor / Empfänger | Berechtigte Pakete und Nachweisketten lesen/verifizieren. | Quellen oder Freigaben verändern. |

Kleine Teams dürfen Rollen kombinieren, aber die Policy zeigt dann fehlende Funktionstrennung. Gastfreigaben erfordern mindestens eine verifizierte Einladung und den ausdrücklich ausgewiesenen Vertrauensgrad. Für kritische Freigaben setzt die Organisation SSO/MFA und zugewiesene Entscheidungsrechte voraus. Ein Link ist widerrufbar, zeitlich begrenzt, zweckgebunden und darf nicht automatisch den gesamten Quellcode sichtbar machen. Die technische Attestation wird nicht als qualifizierte elektronische Signatur vermarktet.

---

<a id="kapitel-10"></a>

## 10. Technische Zielarchitektur und Migrationspfad

### 10.1 Modularer Kern statt vollständiger Neuentwicklung

Das vorhandene Next.js-/TypeScript-System bleibt zunächst die Hülle. Aus den großen Seiten werden fachliche Module mit klaren Verträgen herausgelöst: `intake`, `catalog`, `evidence`, `cases`, `decisions`, `generation`, `verification`, `economics`, `delivery` und `integrations`. UI, HTTP-Handler und Worker verwenden dieselben Anwendungsservices. Domänenfunktionen bleiben ohne Firebase, Browser und LLM isoliert testbar.

```text
Browser / API-Client
        |
        v
Identity + Organization Policy + Server Gates
        |
        v
Application Services (modularer Monolith)
  | Intake / Evidence / Decisions / Economics / Delivery
  | Artifact Repository + Metadaten + Audit-Events
  | Catalog Provider + versionierte Snapshots
  | Job Queue + Provider Contracts + Budgetkontrolle
  |
  +----> Kundenpipeline: ATC / ABAP Unit / Build / Deployment
  |
  +----> Isolierter Runner: kurzlebig, beschränkte Identität,
  |      kontrollierter Egress, keine Plattform-Secrets
  |
  +----> Export-/Import-Adapter: Cloud ALM / LeanIX / Jira / MCP
```

Quellcode, große Dokumente und Build-Ausgaben liegen als unveränderliche Blobs hinter einer Storage-Abstraktion; Metadaten, Rechte und Abhängigkeiten werden separat gespeichert. Das Modell darf nicht von beliebig großen Projektfeldern im Client abhängen. Den Datenbankwechsel pauschal als Voraussetzung festzulegen wäre unnötig; zuerst müssen Zugriffs- und Transaktionsmuster sauber werden.

### 10.2 Die harte Runner-Grenze

Unbekannter Code darf weder mit dem Dienstkonto der Anwendung noch mit Zugriff auf deren Metadaten, Datenbank oder Umgebungsvariablen laufen. Der Runner ist ein separater Ausführungsdienst mit Einmal-Dateisystem, festem Image-Digest, CPU-/Speicher-/Zeit-/Ausgabelimits und gesperrtem Netzwerk als Standard. Prozess-Permissions ergänzen diese Grenze, ersetzen sie nicht. Die Node-Dokumentation warnt ausdrücklich davor, ihr Permission-Modell als Sicherheitsgrenze für bösartigen Code zu betrachten. [S13]

Live-Prüfungen werden erst nach einer dokumentierten Sicherheitsabnahme aktiviert. Ein Konfigurationsflag ist kein Nachweis tatsächlich wirksamer Netzwerkregeln. Zu prüfen sind unter anderem unerlaubte ausgehende Verbindungen, Zugriffe auf Infrastruktur-Metadaten, DNS-Auflösung, Dateipfade außerhalb des Arbeitsverzeichnisses und Ressourcenerschöpfung. Diese Tests erfolgen in einer kontrollierten Umgebung, nicht gegen ein fremdes Produktivsystem.

Tenant-Credentials werden möglichst nicht an generierten Code gegeben. Bevorzugt führt eine kundeneigene Pipeline reale SAP-Tests aus und liefert einen gebundenen Receipt zurück. Falls ein Live-Connector nötig ist, vermittelt ein minimal berechtigter Broker nur erlaubte Operationen mit kurzlebigen Credentials und separatem Audit. Die erlaubten Methoden und Pfade werden aus dem tatsächlich implementierten Connector abgeleitet, nicht als generische „read-only“-Behauptung formuliert.

### 10.3 Jobmodell, Wiederholbarkeit und Fehlerfälle

Lange LLM-, Import- und Testoperationen erhalten serverseitige Jobs mit Zuständen, Abbruch, Deadline, Idempotency-Key und Retries nur für geeignete Fehler. Wiederholung darf weder Kosten unkontrolliert vervielfachen noch doppelte Freigaben oder externe Tickets erzeugen. Erfolgreiche Teilschritte bleiben nachvollziehbar; ein gescheiterter Job wird nicht zum fertigen Run promoviert.

Jeder Generation-Receipt führt tatsächlich verwendeten Provider, Modellkennung, Prompt-/Schema-Version, Input-Digests, Token-/Kosteninformation soweit verfügbar und Output-Digest. Die Sicherheits- und Datentransferpolitik wird vor dem Aufruf geprüft. Dokumente oder Codekommentare sind Inhalt, keine Anweisung an den Agenten; eingebettete Aufforderungen dürfen weder Datenweitergabe noch Aktionen autorisieren.

### 10.4 Schnittstellenstrategie: Verträge vor „Integration verfügbar“

Jeder Adapter benötigt einen Contract Test mit einer realen, erlaubten Beispieldatei oder Testinstanz. Import zuerst, Export danach, bidirektionale Synchronisation zuletzt. Erfasst werden Version, Encoding, Zeitzone, Namensräume, Objektidentität, Dubletten, gelöschte Objekte und unbekannte Felder. Fehler landen in einer verständlichen Importvorschau oder Quarantäne, nicht als leere grüne Ergebnisliste.

Cloud ALM beginnt mit nachgewiesenen Task-/Referenzanwendungsfällen; das Beispielrepository ist ein Ausgangspunkt, kein Beweis für eine native Clean-Core-KPI-Schreibschnittstelle. LeanIX beginnt mit kundenkonfigurierter Zuordnung zu vorhandenen Fact Sheets und unterstützten API-Verträgen. Signavio erhält zunächst validierbares BPMN plus eine dokumentierte Zuordnung, nicht das Versprechen verlustfreier bidirektionaler Prozesssynchronisation. [V; Quellenbasis S15/S16/S19]

**Konkrete Aktualitätsfolge:** Die bisherige Fiori Apps Reference Library weist am Recherchetag auf den Umzug nach `fal.cloud.sap` hin. Das ist ein praktisches Beispiel für die notwendige Trennung von stabiler Fach-ID, Anbieter-URL und versionsabhängigem Metadatenzugang. Vor einem Massenimport sind aktuelle Nutzungsbedingungen und der tatsächlich verfügbare Zugang zu klären; ein automatisch gescrapter Vollkatalog ist kein gesicherter Plan. [S20]

### 10.5 Migration bestehender Projekte

**Schritt A — sichern und kennzeichnen.** Bestehende Projekte erhalten ein Legacy-Manifest. Alte Tests werden anhand ihrer tatsächlichen Herkunft als simuliert, extern belegt oder unbestimmt eingestuft; fehlende Angaben werden nicht nacherfunden. Frühere Selbstbestätigungen bleiben als solche erhalten.

**Schritt B — neue Quellenrevision.** Beim nächsten Bearbeiten entsteht ein SourceBundle. Bestehende Designs und Dokumente können übernommen werden, erhalten aber `imported-unverified`, bis ihre Referenz und ihr Inhalt geprüft sind. Es gibt keine rückwirkende „Enterprise-Verifikation“ durch Datenmigration.

**Schritt C — doppelte Anzeige beenden.** Zunächst berechnen alte und neue Services Ergebnisse parallel im Testbetrieb; Abweichungen werden geklärt. Anschließend wird pro vertikalem Workflowabschnitt umgeschaltet. Keine dauerhafte Doppelpflege von Katalog, Router und Score.

**Schritt D — Bestandsfreigaben schützen.** Pakete bleiben exportierbar. Abweichende neue Methodik erzeugt einen verständlichen Vergleich mit Änderungsgrund. Ein neues Bewertungsmodell ändert keine historische Entscheidung stillschweigend, kann aber einen Reviewbedarf auslösen.

### 10.6 Nicht-funktionale Leitplanken

Betriebsfähigkeit umfasst reproduzierbare Deployments, Wiederherstellungstests, getrennte Entwicklungs-/Test-/Produktionsumgebungen, Incident-Prozess, Health Checks, Lösch-/Retentionkonzept und dokumentierte Servicegrenzen. Performanceziele werden gegen definierte Korpusgrößen, Netzwerkbedingungen und Hardware gemessen. „1.000 Objekte“ bedeutet nicht 1.000 riesige Programme und ist ohne Begrenzung des Gesamtvolumens kein prüfbares Lastziel.

Beispielhafte Pilotbudgets sind 100 DecisionCases, 1.000 Objekte und eine explizit definierte Gesamtquellgröße. Die Oberfläche lädt Listen paginiert; große Analysen laufen als Jobs. Öffentliche Telemetrie enthält keine Codeschnipsel, Prompts, Schlüssel oder ungefilterten Kundennamen. Ein kundenseitig kontrollierter Modus muss anhand eines Netzwerkmitschnitts zeigen können, welche ausgehenden Verbindungen stattfinden.

---

<a id="kapitel-11"></a>

## 11. Release-Roadmap von 2.9 bis 3.5

### 11.1 Releaseprinzip

Versionen markieren **erreichte Fähigkeiten und harte Gates**, keine allein kalendergetriebene Funktionssammlung. Diese Roadmap ist ein eigenständiger Vorschlag; die Terminfolge der bisherigen Roadmap wird nicht als gesicherte Kapazitätsplanung übernommen. Produktfähigkeiten bleiben nach dem hier übernommenen Community-Prinzip grundsätzlich frei; externe Rechen-, Hosting- und Servicekosten werden separat transparent gemacht.

Der gemeinsame Nenner aller Releases ist derselbe DecisionCase. Es entstehen nicht sieben voneinander unabhängige Dokumentgeneratoren. Eine spätere Version darf eine früher erreichte Nachweisqualität nicht zugunsten zusätzlicher Funktionen wieder abschwächen.

### 11.2 Releaseübersicht mit harten Exit-Kriterien

| Release | Name und Hauptnutzen | Verbindlicher Scope | Exit-Kriterium | Bewusst nicht enthalten |
|---|---|---|---|---|
| **2.9** | **Truth & Safety** — Ergebnisse dürfen nicht mehr falsche Sicherheit vermitteln. | Methodik-Hotfixes, unbekannt/offen sichtbar, Teststatus korrigiert, TCO-Guardrails, kanonische Phasen, Runner-Risiko abgeschirmt oder Funktion deaktiviert. | Alle bestätigten entscheidungskritischen P0-Befunde korrigiert oder wirksam gesperrt; Regressionen reproduzierbar; keine Simulation als echter Test verkauft. | Große Business-Suite, neue Provider, Portfolio-Marketing. |
| **2.10** | **Evidence Foundation** — ein verbindlicher, versionierter Quellen- und Nachweisstand. | Artifact-DAG, serverseitige Gates, Case-Modell, SourceBundle, TargetContext, Katalogtypen, ATC-Import, Claimschema, Manifest/Verifier, Zero-LLM, Promptverträge. | Änderung von Quelle oder Entscheidung invalidiert die richtigen Folgeartefakte; manipulierte Pakete werden abgewiesen; kein Aufruf eines nicht erlaubten Providers. | Breit angelegte Prozessbibliothek, universeller SAP-Connector. |
| **2.11** | **Business Decision Pilot** — ein fachlicher Owner kann eine nachvollziehbare Option bewerten. | Object Brief, Spec Recovery, Nutzungs-/Entry-Point-Kontext, kleine kuratierte Standardbibliothek, Optionen, Fit-Gap, As-is/To-be, belastbare Kostenannahmen. | Pilotfälle in mindestens zwei klar abgegrenzten Prozessfamilien; jede entscheidungskritische Aussage überprüfbar oder offen; Nicht-Code-Wege durchgängig nutzbar. | Enterprise-GA ohne Rollen-/Betriebsabnahme; „80% Standardabdeckung“ über unbestimmten Marktumfang. |
| **3.0** | **Evidence-backed Decision & Delivery** — die sieben Phasen bilden erstmals einen kontrollierten End-to-End-Weg. | Identitätsgebundene Freigaben, Organisationsrollen, ein verifiziertes RAP-Profil und ein CAP-Profil, externe SAP-Prüfreceipts, gültige Exporte, Handover-Gate, zwei kontrollierte AI-Zugangswege, minimaler privater Betrieb, Benchmark. | Mindestens ein realer Pilot je Codepfad und Nicht-Code-Optionen; unabhängige Fach-/Security-Abnahme; kein stale Handover; vollständiger Offline-Integritätstest; dokumentierte Restgrenzen. | Autonome Produktivänderungen, flächendeckende Massenremediation, fünf perfekte Cloud-/AI-Integrationen. |
| **3.1** | **Program Execution** — viele Fälle priorisieren und verbindlich in Wellen bearbeiten. | Portfolio, Verantwortliche, Workshop-Pack, risikobezogene Priorisierung, Delivery-Wellen, belastbare Job-/Kostensteuerung. | Pilotprogramm mit definiertem 1.000-Objekt-Profil; keine doppelte Nutzenzählung; kritische Abhängigkeiten verhindern ungültige Wellen. | Vollständige Enterprise-Architecture- oder Projektmanagement-Suite. |
| **3.2** | **Ecosystem Workbench** — vorhandene SAP- und Delivery-Tools ohne Doppelpflege nutzen. | Kernseife-/Migration-Adapter, Jira/Cloud-ALM-/LeanIX-Anwendungsfälle, evidenzgebundene Fragen, read-only MCP. | Versionierte Contract Tests und mindestens ein echter Roundtrip je freigegebenem Adapter; Mandantengrenzen auch im Agentenzugriff. | Behauptete Unterstützung ungetesteter Formate; allgemeine Schreibagenten. |
| **3.3** | **Continuous Assurance** — Änderungen entwerten Nachweise kontrolliert statt unbemerkt. | Release-/Katalog-/Source-Drift, Ausnahmefristen, semantische Regression, Kontrollzuordnung. | Veränderte Voraussetzung öffnet den richtigen Review, nicht das ganze Portfolio; Negativtests entdecken absichtlich eingeführte Regelabweichungen. | Universelle Compliance-Zertifizierung oder vollständiges Process Mining. |
| **3.4** | **Landscape & Sovereignty** — komplexere Landschaften und Betriebsmodelle beherrschen. | Datentopologie-/Integrationshinweise, föderierte Programme, private Policies, kleine verifizierte Transformationsrezepte. | Wenige klar definierte Daten-/Integrationsmuster in realen Pilotkontexten; Cross-Tenant-Isolation; Wartbarkeit ohne festen SaaS-Provider. | Fünf-Dimensionen-Gesamtscore aus Code oder offener autonomer Remediation-Agent. |
| **3.5** | **Continuous Modernization Governance** — tatsächliche Umsetzung und Wirkung schließen die Entscheidung. | Deployment-/Stilllegungsrückmeldungen, Hypercare/Closure, beobachtete Economics, Wiedereröffnung bei Drift, kuratierte Rückkopplung in Regeln und Referenzfälle. | Stichprobe geschlossener Fälle lässt Entscheidung, Änderung, reale Prüfung, Umsetzung und Wirkung lückenlos nachvollziehen; zurückgerollte Fälle werden korrekt wieder geöffnet. | Erfolgsmeldungen allein aus Upload-, Download- oder Ticketstatus. |

### 11.3 Der kleinste belastbare 3.0-Scope

V 3.0 unterstützt zunächst **zwei klar abgegrenzte Prozessfamilien, je einen definierten ABAP-Cloud/RAP- und CAP-Zielkontext, ATC-Dateiimport und eine kundenseitige Prüf-Pipeline**. Die Auswahl der Prozessfamilien erfolgt mit echten Designpartnern; Beschaffung und Auftragsabwicklung sind plausible, aber noch nicht durch Nutzungsdaten belegte Startkandidaten.

Die Standardbibliothek startet mit etwa 20–30 **fachlich geprüften Entscheidungsmustern**, nicht mit tausenden automatisch erzeugten SEO-Seiten. Jedes Muster benennt Zielkontext, Voraussetzungen, typische Nicht-Abdeckung und zulässige Quellen. Die Zahl ist eine Scope-Annahme, kein Qualitätsbeweis. Eine nicht passende Option muss als nicht passend abgelehnt werden können, auch wenn der Katalogeintrag hervorragend dokumentiert ist.

Für AI werden zunächst der bestehende Providerpfad und **ein** konkret im Pilot benötigter Enterprise-Pfad unterstützt. Ob dieser über einen kundeneigenen SAP-AI-Core-Zugang oder einen anderen freigegebenen Endpoint führt, hängt von tatsächlich vorhandenen Verträgen und Testzugängen ab. Fünf Anbieter gleichzeitig sind kein Gate für Geschäftstauglichkeit.

### 11.4 Was 3.5 gegenüber 3.0 zusätzlich beweisen muss

V 3.0 beweist: „Eine begrenzte Entscheidung kann sicher verstanden, genehmigt, umgesetzt und mit passenden Nachweisen übergeben werden.“ V 3.5 beweist zusätzlich: „Dasselbe funktioniert über ein Programm hinweg, überlebt Änderungen und wird anhand echter Betriebs- und Ergebnisrückmeldungen fortgeführt.“

Diese Unterscheidung schützt vor einer überladenen 3.0 und vor einer inhaltsleeren 3.5. Portfolio, MCP und Drift sind keine eigenständigen Selbstzwecke: Sie müssen den Entscheidungszyklus verkürzen, Nacharbeit reduzieren oder Fehlentscheidungen früher sichtbar machen.

---

<a id="kapitel-12"></a>

## 12. Umsetzungsbacklog: Epics, Features, User Stories und Abnahme

**Umfang: 16 Epics, 64 Features und 128 konkrete User Stories.** Sämtliche Einträge sind eigene Vorschläge [V], nicht als bereits implementiert zu verstehen. Die Zuordnung zu CR-Befunden gibt den Anlass an; spätere Ausbauten können auch ohne vorhandenen Codefehler sinnvoll sein.

**Lesart:** P0 = verhindert falsche sicherheits-/entscheidungsrelevante Aussagen oder unsichere Ausführung; P1 = notwendig für den jeweiligen belastbaren Release; P2 = Erweiterung nach bewiesenem Kernnutzen. Die Priorität bezeichnet Wirkung, nicht automatisch denselben Liefertermin. Vor einer späteren strukturellen Korrektur wird ein P0-Pfad in 2.9 konservativ korrigiert oder deaktiviert. Insbesondere betreffen dies Router-Automatik, veraltete Artefakte und Controlled-Handover-Behauptungen.

**Größe:** M = mehrere klar begrenzte Änderungen; L = mehrmodulige vertikale Fähigkeit mit Integration oder unabhängiger Abnahme. Dies sind relative Planungsgrößen, keine versprochenen Personentage. Aufwandsschätzungen in Kapitel14 berücksichtigen gemeinsam genutzte Grundlagen und externe Abnahmen. „Owner“ ist die vorgeschlagene verantwortliche Kompetenz; eine benannte Person ist vor Sprintplanung festzulegen.

**Abnahme:** Jede Story besitzt ein konkretes Szenario. Alle Features benötigen zusätzlich die gemeinsame Definition of Done in Kapitel13: Zugriffsprüfung, Revisionstreue, Fehlerfälle, Tests, Dokumentation und aktualisierte Grenzen. Dependencies nennen technische Vorbedingungen; menschliche Reviewer und Kundenzugänge sind zusätzlich zu planen.

### 12.0 Epic-Index

| Epic | Ergebnis | Frühester / letzter Zielrelease |
|---|---|---|
| E01 | Verbindlicher Case- und Workflow-Kern | 2.9 / 2.10 |
| E02 | SAP-Methodik und releasefähige Wissensbasis | 2.9 / 2.11 |
| E03 | Vollständiger Intake, Nutzung und Abhängigkeiten | 2.9 / 2.11 |
| E04 | Business Evidence und Spec Recovery | 2.10 / 3.2 |
| E05 | Optionen, Fit-to-Standard und verantwortete Entscheidung | 2.11 / 3.1 |
| E06 | Entscheidungstreue Transformation mit begrenzten Zielprofilen | 2.10 / 3.4 |
| E07 | Tatsächliche Verifikation und fachliche Regression | 2.9 / 3.3 |
| E08 | Runner-Sicherheit, Secrets und souveräner Betrieb | 2.9 / 3.4 |
| E09 | Lebende Dokumentation und kontrollierbare Prozesse | 2.11 / 3.3 |
| E10 | Integrität, nachvollziehbare Übergabe und Abschluss | 2.10 / 3.5 |
| E11 | Kontrollierte AI-Nutzung und deterministischer Basismodus | 2.10 / 3.1 |
| E12 | Belastbare Economics und Priorisierung | 2.9 / 3.5 |
| E13 | Organisation, Zusammenarbeit und Programmsteuerung | 3.0 / 3.4 |
| E14 | SAP- und Delivery-Interoperabilität | 2.10 / 3.2 |
| E15 | Kontinuierliche Assurance über den ganzen Lebenszyklus | 3.3 / 3.5 |
| E16 | Qualität, offene Verträge und nachhaltiger Betrieb | 2.9 / 3.5 |

### 12.1 E01 — Verbindlicher Case- und Workflow-Kern

**Ziel:** Ein Projekt kann nicht mehr gleichzeitig mehrere widersprüchliche „aktuelle“ Wahrheiten besitzen.

**Start im Code / System:** `lib/workflow-steps.ts; components/Stepper.tsx; lib/project-loader.ts; app/api/runs/create/route.ts`  
**Erfolgsmaß:** Kein veraltetes Artefakt passiert ein kontrolliertes Handover; alle sieben Phasen verwenden denselben Zustand.


#### E01-F01 — Kanonische sieben Phasen und ehrliche Zustände

**Release 2.9 · P0 · Größe M · Owner: Full-Stack + QA**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-10, CR-11, CR-16.

Ein zentraler Vertrag ersetzt Stepper-, Rail- und Seitenlogik. Upload gehört zu Analyze; Economics bleibt sichtbar. Bis zur Revisionsarchitektur blockiert ein konservativer Änderungswächter die Wiederverwendung unklarer Folgezustände.

**E01-F01-US01.** Als Bearbeiter möchte ich in allen Ansichten denselben Fortschritt sehen, damit ich fehlende Nachweise nicht übersehe.  
**Abnahme:** Gegeben sind generierte, aber nicht ausgeführte Tests. Wenn Dashboard, Stepper und Delivery laden, dann zeigen alle „Testentwurf vorhanden“, nicht „Testing abgeschlossen“; Economics erscheint als sechste Phase.

**E01-F01-US02.** Als Reviewer möchte ich nach einer Quellenänderung vor alten Ergebnissen gewarnt werden, damit ich keine fremde Revision freigebe.  
**Abnahme:** Wenn der Quell-Digest gegenüber dem verwendeten Analyseinput abweicht, werden Transformation und kontrolliertes Handover bis zur Neubewertung blockiert. Ein Client-Statuswechsel umgeht die Sperre nicht.


#### E01-F02 — Immutable Artefaktrevisionen und Invalidierung

**Release 2.10 · P0 · Größe L · Owner: Backend + QA**  
**Abhängigkeiten:** E01-F01. **Anlass:** CR-09, CR-10, CR-27.

Ein Artifact Repository speichert Eltern-Digests, Revisionen und Supersession. Eine Invalidierungsmatrix unterscheidet fachliche Änderungen von reiner Darstellung. Historische Artefakte bleiben lesbar.

**E01-F02-US01.** Als Architekt möchte ich erkennen, welche Nachweise durch eine neue Zielentscheidung ungültig werden, damit ich gezielt erneut prüfen kann.  
**Abnahme:** Wenn eine freigegebene CAP-Entscheidung auf ABAP Cloud geändert wird, werden abhängiger Code, Tests und As-built-Dokumente stale. Der unveränderte SourceBundle-Digest und dessen Analyse bleiben erhalten.

**E01-F02-US02.** Als Auditor möchte ich einen früheren Paketstand unverändert rekonstruieren, damit historische Entscheidungen prüfbar bleiben.  
**Abnahme:** Nach drei Projektänderungen lassen sich alle drei Manifeste mit ihren ursprünglichen Dateien abrufen. Ein Update überschreibt weder alte Inhalte noch Freigaben; ein Manipulationsversuch wird abgewiesen.


#### E01-F03 — Serverseitige Gate Engine und atomare Promotion

**Release 2.10 · P0 · Größe L · Owner: Backend + Security**  
**Abhängigkeiten:** E01-F02. **Anlass:** CR-09, CR-10, CR-28.

Gate Policies werden je Disposition und Risiko ausgeführt. Ein Promotion-Befehl prüft Revision, Voraussetzungen und Berechtigung atomar. Die UI erklärt fehlende Voraussetzungen, entscheidet aber nicht über die Freigabe.

**E01-F03-US01.** Als Programmleiter möchte ich verbindliche Mindestnachweise konfigurieren, damit nicht jeder Anwender seinen eigenen Freigabestandard setzt.  
**Abnahme:** Gegeben ist eine Policy mit Pflicht zur fachlichen Zustimmung. Wenn ein direkter API-Aufruf ohne passende Attestation erfolgt, wird er mit einer maschinenlesbaren Liste fehlender Nachweise abgelehnt.

**E01-F03-US02.** Als paralleler Bearbeiter möchte ich Versionskonflikte erkennen, damit meine Freigabe keinen inzwischen geänderten Stand betrifft.  
**Abnahme:** Ändert ein zweiter Nutzer vor der Promotion den Decision-Digest, schlägt die Freigabe mit Revisionskonflikt fehl. Es wird kein halb gültiges ReleaseManifest erzeugt.


#### E01-F04 — DecisionCase und teilbare fachliche Entscheidungseinheiten

**Release 2.10 · P1 · Größe L · Owner: Product + Backend**  
**Abhängigkeiten:** E01-F02. **Anlass:** CR-10.

Ein Fall gruppiert Entry Points, Regeln, Objekte und Abhängigkeiten. Split/Merge sind versionierte Operationen. Eine technisch gemeinsam genutzte Klasse kann mehreren Fällen zugeordnet werden, ohne mehrfachen Nutzen zu erzeugen.

**E01-F04-US01.** Als Prozesseigner möchte ich einen Geschäftsablauf statt einer Dateiliste beurteilen, damit ich eine fachlich verständliche Entscheidung treffen kann.  
**Abnahme:** Wenn fünf zusammenhängende Objekte einem Fall zugeordnet sind, zeigt der Brief einen gemeinsamen Zweck und weiterhin alle Einzelquellen. Nicht aufgelöste Zugehörigkeit wird als Vorschlag markiert.

**E01-F04-US02.** Als Architekt möchte ich Export und Kernprüfung getrennt entscheiden, damit nicht die komplexeste Teilfunktion die gesamte Route erzwingt.  
**Abnahme:** Beim Split bleiben Quellen und Historie referenziert; Teilfälle erhalten eigene Owner und Dispositionen. Aggregierte Objektzahl und Kostensummen zählen gemeinsam genutzte Bestandteile nicht doppelt.


---


### 12.2 E02 — SAP-Methodik und releasefähige Wissensbasis

**Ziel:** Bewertungen und Nachfolger sind fachlich korrekt, zielkontextbezogen und reproduzierbar.

**Start im Code / System:** `lib/abap/abcd-classification.ts; lib/abap/catalog-service.ts; lib/abap/code-assessment.ts; Katalogdaten`  
**Erfolgsmaß:** Keine Verwechslung von ABAP-Cloud-Release und klassischem Level; jede Empfehlung besitzt Herkunft und Zielkontext.


#### E02-F01 — Zwei Klassifikationssichten und sichtbare Unbekannte

**Release 2.9 · P0 · Größe M · Owner: SAP-Architekt + Engine**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-01, CR-02, CR-03.

Objektrelease, klassische API-Einstufung, Technikbewertung und Business-Kritikalität werden getrennt. Der aggregierte Bericht nennt bekannte schlechteste Einstufung plus unbekannten Anteil, nicht automatisch A bei leerer Analyse.

**E02-F01-US01.** Als SAP-Architekt möchte ich klassische Zulässigkeit und Cloud-Verwendbarkeit getrennt sehen, damit ich zulässige Übergangsarchitekturen nicht falsch abwerte.  
**Abnahme:** Ein Fixture mit classicAPI und notToBeReleased liefert zwei unterschiedliche Aussagen, ohne allein daraus D abzuleiten. Kritikalität verändert die technische Einstufung nicht; Dynpro wird kontextabhängig geprüft.

**E02-F01-US02.** Als Reviewer möchte ich die Grenzen der Bewertung sehen, damit fehlende Erkennung nicht als Clean Core gilt.  
**Abnahme:** Bei leerem Befund unter unbekanntem Prüfumfang lautet das Gesamtergebnis „nicht abschließend bewertet“. Unknown neben A bleibt sichtbar; erfundene Objektnamen werden nicht still zu bestätigtem C.


#### E02-F02 — TargetContext und versionierte Katalog-Snapshots

**Release 2.10 · P1 · Größe L · Owner: SAP-Architekt + Backend**  
**Abhängigkeiten:** E02-F01, E01-F02. **Anlass:** CR-07.

Lookup-Schlüssel umfassen Produkt/Edition, Release und relevante Versionierung. Katalogdateien, Hashes und Importregeln werden eingefroren. Nicht verfügbare Kombinationen liefern einen eingeschränkten, klar markierten Modus.

**E02-F02-US01.** Als Architekt möchte ich gegen das geplante Zielrelease prüfen, damit ich keinen erst später verfügbaren Nachfolger auswähle.  
**Abnahme:** Ein Testkatalog enthält eine API nur im neueren Release. Beim älteren Ziel wird sie nicht als verfügbar angeboten; der Bericht erklärt den Versionskonflikt und nennt die geprüfte Snapshot-ID.

**E02-F02-US02.** Als Auditor möchte ich einen alten Run erneut berechnen, damit ein heutiger Katalogstand die damalige Aussage nicht verfälscht.  
**Abnahme:** Nach einem Katalogupdate reproduziert ein Run mit gepinntem Snapshot dieselben deterministischen Findings. Ein Vergleichslauf mit neuem Snapshot zeigt die Abweichungen separat.


#### E02-F03 — Typisierte Nachfolger und ein einziger Katalogvertrag

**Release 2.10 · P1 · Größe M · Owner: Engine + SAP-Reviewer**  
**Abhängigkeiten:** E02-F02. **Anlass:** CR-08.

SAP-Daten und kuratierte Ergänzungen bleiben nebeneinander sichtbar. CDS-Lesezugriff, RAP-BO, Remote-API, BAdI, Event und reine Konzeptempfehlung erhalten unterschiedliche Typen und Voraussetzungen. Doppelte Mappingtabellen entfallen.

**E02-F03-US01.** Als Entwickler möchte ich wissen, ob ein Nachfolger liest oder transaktional schreibt, damit ich keine gleich klingende falsche Schnittstelle einbaue.  
**Abnahme:** Bei mehreren Nachfolgern zeigt die API jeweils Zweck, Contract, Zielkontext, Herkunft und Validierungsstatus. Ein reiner Lese-CDS-Kandidat erfüllt keine Schreibanforderung.

**E02-F03-US02.** Als Katalog-Reviewer möchte ich eine Ergänzung nachvollziehbar freigeben, damit Kuratierung nicht mit SAP-Freigabe verwechselt wird.  
**Abnahme:** Eine kuratierte Ergänzung überschreibt keinen offiziellen Eintrag. Reviewer, Änderungsgrund und Testfall sind gespeichert; „technisch ausgeführt“ erscheint nur mit passendem Receipt.


#### E02-F04 — Kleine geprüfte Standard-Pattern-Bibliothek

**Release 2.11 · P1 · Größe L · Owner: Functional Consultant + Product**  
**Abhängigkeiten:** E02-F03, E04-F03. **Anlass:** Produkt-/Integrationsausbau.

Start mit 20–30 klar abgegrenzten Mustern aus zwei Pilotprozessfamilien. Jeder Eintrag enthält Fachregeln, Zielkontext, Voraussetzungen, Nicht-Abdeckung, IDs/Links und geprüfte Nutzungsrechte. Kein ungeprüfter Vollkatalog.

**E02-F04-US01.** Als Prozesseigner möchte ich passende Standardkandidaten mit Grenzen sehen, damit ich Ähnlichkeit nicht mit vollständigem Ersatz verwechsle.  
**Abnahme:** Ein Kandidat mit passender Entität, aber fehlender erforderlicher Ausnahme wird als Teil-Fit gezeigt. Ohne bestätigte Regelabdeckung kann kein vollständiger Fit automatisch entstehen.

**E02-F04-US02.** Als Datenverantwortlicher möchte ich Katalogänderungen und Quellenwechsel prüfen, damit Links und Nutzungsannahmen aktuell bleiben.  
**Abnahme:** Wird eine Anbieter-URL ersetzt oder ein Zugang eingeschränkt, bleibt die fachliche ID erhalten; der Eintrag erhält Reviewbedarf. Kein Treffer wird als „kein Kandidat im geprüften Umfang“ ausgegeben.


---


### 12.3 E03 — Vollständiger Intake, Nutzung und Abhängigkeiten

**Ziel:** Die Plattform weiß, welchen Ausschnitt sie sieht und was aus den Eingaben nicht abgeleitet werden darf.

**Start im Code / System:** `Analyze-Seite; lib/abap/evidence-model.ts; lib/abap/usage-parser.ts; abapGit-/Upload-Pfade`  
**Erfolgsmaß:** Jede Stilllegung nennt Nutzungsabdeckung und Abhängigkeiten; jede Analyse zeigt ihren tatsächlichen Scope.


#### E03-F01 — SourceBundle und sicherer Multi-Objekt-Import

**Release 2.10 · P1 · Größe L · Owner: Engine + Backend**  
**Abhängigkeiten:** E01-F02. **Anlass:** CR-06, CR-10.

Text und abapGit-ZIP werden in ein gemeinsames Objekt-/Dateimanifest überführt. Fehlende Includes und DDIC-Quellen werden angefordert. Zip-Slip, übermäßige Entpackgröße, Duplikate und inkonsistente Namen werden geprüft.

**E03-F01-US01.** Als Entwickler möchte ich zusammenhängende Quellen importieren, damit Klassen, Includes und Datentypen im richtigen Kontext bewertet werden.  
**Abnahme:** Ein Testrepository mit 30 Objekten wird mit stabilen IDs importiert. Ein fehlendes Include erscheint als ungelöste Abhängigkeit und wird nicht durch LLM-Inhalt ersetzt.

**E03-F01-US02.** Als Security-Verantwortlicher möchte ich gefährliche oder uneindeutige Archive ablehnen, damit ein Upload die Plattform nicht beschädigt.  
**Abnahme:** Archive mit Pfadtraversierung, identischen kollidierenden Pfaden oder überschrittener Entpackgrenze werden vor Artefaktpromotion abgewiesen. Die Fehlermeldung enthält keine sensiblen Serverpfade.


#### E03-F02 — Verlässlicher Nutzungsimport mit Messfenster

**Release 2.9 · P1 · Größe M · Owner: Engine + QA**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-24.

Der vorhandene Parser erhält explizite Locale, Zeitzone, Messbeginn/-ende, Zählsemantik und Importvorschau. Fehlende Werte bleiben unknown. Negative Zähler oder unplausible Zeiträume werden nicht übernommen.

**E03-F02-US01.** Als PMO möchte ich importierte Nutzung korrekt verstehen, damit Jahres- oder Monatsprozesse nicht wegen eines kurzen Fensters stillgelegt werden.  
**Abnahme:** Bei Locale de-DE wird 05.04.2026 als 5. April gespeichert. Der Messbeginn stammt aus deklarierter Erfassung, nicht aus erster beobachteter Ausführung; außerhalb liegende Saisonalität erzeugt einen Warnhinweis.

**E03-F02-US02.** Als Analyst möchte ich fehlerhafte Zeilen vor Übernahme sehen, damit schlechte Daten keine Priorisierung beeinflussen.  
**Abnahme:** Negative Aufrufe werden quarantänisiert. Leere Zähler bleiben unknown und unterscheiden sich von gemessenen Nullwerten; ST03N- und SCMON-Werte werden nicht ungeprüft addiert.


#### E03-F03 — Entry-Point-Graph und fachlich überprüfbare Cluster

**Release 2.11 · P1 · Größe L · Owner: Engine + Functional Consultant**  
**Abhängigkeiten:** E03-F01, E01-F04. **Anlass:** Produkt-/Integrationsausbau.

Berichte, Transaktionen, Jobs, Includes und Klassen erhalten referenzierte Kanten. Technische Cluster werden als Vorschlag angeboten, fachlich bestätigt und gegebenenfalls geteilt. Dynamische Kanten bleiben ungelöst sichtbar.

**E03-F03-US01.** Als Architekt möchte ich Abhängigkeiten einer Stilllegung erkennen, damit gemeinsam genutzte Komponenten nicht versehentlich entfernt werden.  
**Abnahme:** Wird ein Entry Point zum Retire vorgeschlagen, zeigt der Graph weitere bekannte Aufrufer. Eine gemeinsam benötigte Klasse bleibt aus der Abschaltliste ausgeschlossen, solange ihre Nutzung nicht geklärt ist.

**E03-F03-US02.** Als Prozesseigner möchte ich eine falsche Gruppierung korrigieren, damit verschiedene Geschäftszwecke nicht gemeinsam entschieden werden.  
**Abnahme:** Das Aufteilen eines technischen Clusters erzeugt nachvollziehbare Teilfälle. Die ursprünglichen Referenzen bleiben erhalten; manuelle fachliche Zuordnung überschreibt keine technischen Kanten.


#### E03-F04 — Erkennungsabdeckung für BAPI, Datei, Dynamik und Sprache

**Release 2.10 · P0 · Größe L · Owner: ABAP-Engine + QA**  
**Abhängigkeiten:** E03-F01, E02-F01. **Anlass:** CR-03, CR-06.

Detektoren schließen die belegten BAPI-/Dateilücken und führen eine explizite Abdeckungsmatrix. Unbekannte Syntax, Makros und dynamische Zugriffe verhindern pauschale Clean-Aussagen. Auswahl oder Ausbau eines Parsers erfolgt nach vergleichendem Spike.

**E03-F04-US01.** Als Entwickler möchte ich lokale Funktionsaufrufe und Dateizugriffe als Findings sehen, damit die gelieferten Beispiele fachlich korrekt bewertet werden.  
**Abnahme:** Z_SALES_ORDER_CREATOR und Z_INVOICE_EXTRACTOR erhalten die relevanten zusätzlichen Hinweise. Kommentare, Stringliterale und INSERT in interne Tabellen erzeugen weiterhin keine falschen Treffer.

**E03-F04-US02.** Als Architekt möchte ich unaufgelöste Dynamik erkennen, damit ich die Analyse gezielt durch Systeminformationen ergänzen kann.  
**Abnahme:** Ein dynamischer Aufruf ohne auflösbares Ziel erzeugt eine offene Kante mit Quellanker. Die UI zeigt den begrenzten Prüfumfang; kein numerischer Score darf ihn als vollständig geprüft überdecken.


---


### 12.4 E04 — Business Evidence und Spec Recovery

**Ziel:** Aus Code entsteht eine überprüfbare Erklärung, nicht nur gut klingende Dokumentation.

**Start im Code / System:** `Analyze-/Documentation-Prompts; lib/abap/evidence-model.ts; Run-Provenienz`  
**Erfolgsmaß:** Entscheidungskritische Claims besitzen passende Evidenz oder werden ausdrücklich als ungeklärt behandelt.


#### E04-F01 — Typisierte Claims und semantische Evidenzprüfung

**Release 2.10 · P1 · Größe L · Owner: AI Engineer + Backend**  
**Abhängigkeiten:** E01-F02, E03-F01. **Anlass:** CR-20, CR-27.

Claims referenzieren Code, Runtime, Katalog, Dokumente oder menschliche Bestätigung. Herkunft und Unterstützung werden getrennt gespeichert. Ein gültiger Zeilenanker allein genügt nicht für supported.

**E04-F01-US01.** Als Reviewer möchte ich zu einer Aussage die tragende Quelle sehen, damit ich ihre inhaltliche Richtigkeit prüfen kann.  
**Abnahme:** Ein Claim über Nutzung darf nicht nur auf eine Codezeile verweisen. Eine Testaussage mit absichtlich falschem Anker wird als unsupported oder widersprüchlich markiert und kann nicht in den bestätigten Brief gelangen.

**E04-F01-US02.** Als Auditor möchte ich LLM-Ableitung und deterministisches Finding auseinanderhalten, damit eine signierte Vermutung nicht zum Fakt wird.  
**Abnahme:** Das Manifest bewahrt origin und semanticStatus getrennt. Eine spätere fachliche Bestätigung ergänzt eine Attestation; sie ändert nicht nachträglich die ursprüngliche LLM-Herkunft.


#### E04-F02 — Object Brief in verständlichem Deutsch und Englisch

**Release 2.11 · P1 · Größe M · Owner: Product + AI Engineer**  
**Abhängigkeiten:** E04-F01, E01-F04. **Anlass:** Produkt-/Integrationsausbau.

Einseitiger Einstieg mit Zweck, Auslöser, Ergebnis, Regeln, Nutzung, Standardkandidaten, offenen Fragen und Ansprechpartnern. Fach- und Entwickleransicht nutzen dasselbe Claimset statt getrennt erzeugter Wahrheiten.

**E04-F02-US01.** Als Prozesseigner möchte ich den Fall ohne ABAP-Kenntnisse verstehen, damit ich fachliche Notwendigkeit und Risiken beurteilen kann.  
**Abnahme:** Der Brief eines Pilotfalls erklärt technische Begriffe und verlinkt Belege. Fachlich entscheidende unbekannte Punkte stehen sichtbar im Haupttext, nicht nur in einem versteckten Anhang.

**E04-F02-US02.** Als zweisprachiges Team möchte ich konsistente Fassungen, damit eine Übersetzung keine andere Entscheidungsvorlage erzeugt.  
**Abnahme:** Deutsche und englische Darstellung referenzieren dieselben Claim-IDs. Geänderte Übersetzung verändert keine bestätigte Regel; nicht gleichwertige Formulierungen erfordern Review.


#### E04-F03 — Spec Recovery mit Regelregister und beabsichtigten Änderungen

**Release 2.11 · P1 · Größe L · Owner: Functional Consultant + QA**  
**Abhängigkeiten:** E04-F01, E03-F04. **Anlass:** Produkt-/Integrationsausbau.

Bedingung, Eingaben, Wirkung, Ausnahme, Fehlermeldung, Kontrollzweck und Quelle bilden eine Rule Card. Implementiertes Verhalten wird von gewünschtem Verhalten getrennt; unvollständige Quellen verhindern Vollständigkeitsbehauptungen.

**E04-F03-US01.** Als QA-Verantwortlicher möchte ich aus Regeln konkrete Akzeptanztests ableiten, damit spätere Tests fachliche Bedeutung besitzen.  
**Abnahme:** Für eine Betragsregel entstehen Normal-, Grenz- und Ausnahmefall mit Referenz zur Regelrevision. Nicht extrahierbare Regeln bleiben als Lücke sichtbar, statt durch plausible Testdaten ersetzt zu werden.

**E04-F03-US02.** Als Business Owner möchte ich eine veraltete Regel bewusst streichen, damit Modernisierung nicht automatisch historische Fehler konserviert.  
**Abnahme:** Eine gestrichene Regel erhält Begründung, Freigabe und Ersatzkontrolle falls erforderlich. Sie bleibt in As-is und Change-Matrix sichtbar, ist aber nicht mehr unbemerkt Soll-Anforderung.


#### E04-F04 — Ask the Evidence mit Berechtigungen und Abstention

**Release 3.2 · P2 · Größe M · Owner: AI Engineer + Security**  
**Abhängigkeiten:** E04-F02, E13-F01, E11-F01. **Anlass:** Produkt-/Integrationsausbau.

Fragen werden ausschließlich gegen berechtigte Fallartefakte beantwortet. Antworten besitzen Claim-/Evidence-Referenzen und unterscheiden belegte Antwort, plausible Hypothese und unbeantwortbare Frage. Kein allgemeiner SAP-Berater hinter einem Vertrauenslabel.

**E04-F04-US01.** Als Gastreviewer möchte ich Rückfragen zum Brief stellen, damit ich ohne Rücksprache mit Entwicklern entscheiden kann.  
**Abnahme:** Eine Frage nach nicht importierter Nutzung erhält „nicht belegt“ und die benötigte Datenquelle. Eine Antwort über technische Logik zeigt die tatsächlich zugänglichen Referenzen.

**E04-F04-US02.** Als Organisation möchte ich Datenabfluss durch Fragen oder manipulierte Quellen verhindern, damit der Assistent keine Rechte erweitert.  
**Abnahme:** Fragen nach anderen Organisationen sowie Anweisungen in Codekommentaren liefern keine fremden Artefakte. Zugriffsprüfung erfolgt vor Retrieval und nach Zusammenstellung des Antwortkontexts.


---


### 12.5 E05 — Optionen, Fit-to-Standard und verantwortete Entscheidung

**Ziel:** Die fachlich beste Option wird ausgewählt, statt automatisch jede Altlogik in CAP oder RAP zu übersetzen.

**Start im Code / System:** `lib/abap/extensibility-router.ts; components/ArchitectSignOff.tsx; Design-Seite`  
**Erfolgsmaß:** Jede freigegebene Option erfüllt harte Kriterien; fachlicher und technischer Entscheider sind identifiziert.


#### E05-F01 — Mehrdimensionale Optionen statt binärem Router

**Release 2.11 · P1 · Größe L · Owner: Product + SAP-Architekt**  
**Abhängigkeiten:** E02-F03, E01-F03, E01-F04. **Anlass:** CR-04, CR-05, CR-09.

RETIRE, STANDARDIZE, KEEP, KEY_USER, ABAP Cloud, Side-by-Side, Integration und REPLACE werden als vollständige Optionen modelliert. Harte Voraussetzungen sind von Gewichtungen getrennt. Der pauschale Z-Tabellen-Zwang wird bereits als 2.9-Hotfix entfernt bzw. deaktiviert.

**E05-F01-US01.** Als Architekt möchte ich On-Stack und Side-by-Side fachlich vergleichen, damit eine eigene Tabelle nicht automatisch zusätzliche Plattformkomplexität auslöst.  
**Abnahme:** Ein Fall mit eigener Persistenz und transaktionsnaher Logik kann eine passende ABAP-Cloud-Option enthalten. Eine fehlende im Zielkontext nötige API sperrt die Option unabhängig von ihrer gewichteten Punktzahl.

**E05-F01-US02.** Als Business Owner möchte ich auch Stilllegung oder Standardisierung wählen, damit das Werkzeug nicht nur Neuentwicklung belohnt.  
**Abnahme:** RETIRE und STANDARDIZE erzeugen passende Umsetzungs-/Nachweispläne ohne erfundenen Zielcode. Ungeklärte Voraussetzungen erscheinen als Discovery-Aufgabe; ein LLM kann sie nicht als erfüllt setzen.


#### E05-F02 — Regelbasierter Fit-Gap-Review mit Standardbelegen

**Release 2.11 · P1 · Größe L · Owner: Functional Consultant + Business Owner**  
**Abhängigkeiten:** E02-F04, E04-F03, E05-F01. **Anlass:** Produkt-/Integrationsausbau.

Der Standardvergleich erfolgt pro Regel und organisatorischem Kontext, nicht nur pro Tabellenname. Ergebnisse lauten Fit, Teil-Fit, Gap oder unbekannt; Konfiguration, Lizenz, Land und Zielrelease werden als Voraussetzungen dokumentiert.

**E05-F02-US01.** Als Fachverantwortlicher möchte ich Regel für Regel sehen, was der Standard abdeckt, damit ich verbleibende Abweichungen bewusst entscheide.  
**Abnahme:** Eine Kandidatenfunktion deckt zwei von drei Pflichtregeln ab. Der Fall zeigt Teil-Fit mit konkret benannter Lücke; er kann nicht durch einen hohen Ähnlichkeitswert zu Voll-Fit werden.

**E05-F02-US02.** Als Consultant möchte ich die tatsächliche Demonstration hinterlegen, damit eine Standardempfehlung über einen Katalogtreffer hinaus prüfbar ist.  
**Abnahme:** Ein bestätigter Fit referenziert Test-/Demoartefakt, Zielkontext und Reviewer. Ändert sich eine Pflichtregel oder das Zielrelease, wird die betroffene Fit-Bestätigung erneut prüfpflichtig.


#### E05-F03 — Identitätsgebundene Decision Requests und Business-Abnahme

**Release 3.0 · P1 · Größe L · Owner: Backend + Identity + Product**  
**Abhängigkeiten:** E05-F02, E13-F01, E01-F03. **Anlass:** CR-28.

Der Owner erhält einen gezielten Request mit Brief, Optionen, fünf Entscheidungsfragen und offenen Risiken. Zustimmung, Ablehnung, Rückfrage, Delegation und Widerruf sind serverseitige Ereignisse auf einem festen Digest.

**E05-F03-US01.** Als Prozesseigner möchte ich eine abgegrenzte Entscheidung ohne Zugriff auf unnötigen Code bestätigen, damit ich verantwortlich und effizient mitwirken kann.  
**Abnahme:** Eine verifizierte Einladung zeigt nur freigegebene Fallinformationen. Die Abnahme speichert Organisationsidentität, Rolle, Zweck, Digest und Serverzeit; ein bloß eingegebener Name erfüllt keine kritische Freigabepolicy.

**E05-F03-US02.** Als Auditor möchte ich Änderungen nach einer Zustimmung erkennen, damit Freigaben nicht auf neue Inhalte übertragen werden.  
**Abnahme:** Nach Änderung einer Pflichtregel gilt die alte Zustimmung nur historisch. Wiederverwendung des alten Links oder direktes Schreiben eines Projektfeldes kann keine neue Attestation erzeugen.


#### E05-F04 — Fit-to-Standard-Workshop und Entscheidungsmoderation

**Release 3.1 · P2 · Größe M · Owner: Product + Functional Consultant**  
**Abhängigkeiten:** E04-F02, E05-F03, E13-F02. **Anlass:** Produkt-/Integrationsausbau.

Ein Workshop-Pack bündelt wenige entscheidbare Fälle nach Prozess und Owner. Es enthält Agenda, Vorwissen, offene Fragen, Optionen und zu bestätigende Annahmen. Ergebnisse fließen als strukturierte Entscheidungen zurück.

**E05-F04-US01.** Als Programmleiter möchte ich Fälle sinnvoll für einen Workshop vorbereiten, damit Besprechungen Entscheidungen statt neue unstrukturierte Listen erzeugen.  
**Abnahme:** Das Pack gruppiert nach Prozess und Entscheidungsbereitschaft. Fälle ohne ausreichende Evidenz werden als Discovery-Themen ausgewiesen; jede Entscheidung besitzt einen eindeutigen Rückkanal zum Case.

**E05-F04-US02.** Als Moderator möchte ich offene Punkte und Verantwortliche direkt festhalten, damit ein Workshop nicht fälschlich alle Fälle abschließt.  
**Abnahme:** Nicht beantwortete Fragen erzeugen Aufgaben mit Owner und Frist. Eine Protokollnotiz wird nicht automatisch zur Business-Abnahme; dafür bleibt der bestätigte Request erforderlich.


---


### 12.6 E06 — Entscheidungstreue Transformation mit begrenzten Zielprofilen

**Ziel:** Änderungen setzen genau die gewählte Option um und werden als prüfbarer Entwurf oder echter Build ausgewiesen.

**Start im Code / System:** `Transformation-Seite; Generierungs-Hooks; Delivery-Serializer`  
**Erfolgsmaß:** Kein erzeugtes Artefakt widerspricht unbemerkt der DecisionRevision; jede unterstützte Ausgabe hat einen realen Validierungsweg.


#### E06-F01 — ChangeSet-Vertrag und Import fremder Implementierungen

**Release 2.10 · P0 · Größe L · Owner: Backend + Developer Experience**  
**Abhängigkeiten:** E01-F03, E01-F04. **Anlass:** CR-09, CR-19.

Generator und Importer schreiben denselben ChangeSet-Vertrag mit Entscheidungsreferenz, Zielprofil, Dateien und nicht-codebezogenen Maßnahmen. Die freigegebene Entscheidung ersetzt den alten BTP-Substring als Steuerung.

**E06-F01-US01.** Als Entwickler möchte ich Code aus ADT, Joule oder einem Partnerwerkzeug übernehmen, damit Clean-Core.io nicht zum vorgeschriebenen Codegenerator wird.  
**Abnahme:** Ein importiertes ChangeSet enthält Quell-/Zieldigests und Herkunft. Es wird zunächst unverified; fremde Aussagen über Testerfolg werden nur mit passendem Receipt übernommen.

**E06-F01-US02.** Als Architekt möchte ich die Architekturentscheidung technisch durchsetzen, damit das Modell nicht stillschweigend eine andere Runtime erzeugt.  
**Abnahme:** Bei ABAP-Cloud-Entscheidung wird ein CAP-Projekt als Profilkonflikt abgewiesen. Ungültiges Generator-JSON bleibt fehlerhafter Entwurf; es kann nicht status transformed oder verified auslösen.


#### E06-F02 — Ein verifiziertes ABAP-Cloud/RAP-Zielprofil

**Release 3.0 · P1 · Größe L · Owner: ABAP Developer + SAP-Architekt**  
**Abhängigkeiten:** E06-F01, E07-F02, E11-F01. **Anlass:** CR-17.

Ein eng umrissenes Profil definiert unterstützte Objektarten, Namensräume, Persistenz, Berechtigungen, Verhalten und Paketstruktur. Der tatsächliche Zielrelease und verfügbare APIs sind Bestandteil des Profils; keine universelle ABAP-Kompatibilitätsbehauptung.

**E06-F02-US01.** Als ABAP-Entwickler möchte ich einen importierbaren Ausgangspunkt, damit ich nicht manuell ein scheinbar fertiges Paket reparieren muss.  
**Abnahme:** Das Referenzpaket enthält die korrekte .abapgit.xml und passende Objektmetadaten. Import und Aktivierung in der angegebenen Testumgebung sind durch einen zugeordneten Receipt belegt.

**E06-F02-US02.** Als Architekt möchte ich nicht unterstützte Anforderungen früh sehen, damit ein einfacher RAP-Entwurf nicht komplexes Transaktionsverhalten verschweigt.  
**Abnahme:** Eine Anforderung außerhalb des Profils erzeugt eine benannte Lücke. Das Paket bleibt draft oder benötigt dokumentierte manuelle Umsetzung; keine generische TODO-Stelle wird als implementierte Regel gezählt.


#### E06-F03 — Ein kohärentes CAP-Node-Zielprofil

**Release 3.0 · P1 · Größe L · Owner: CAP Developer + QA**  
**Abhängigkeiten:** E06-F01, E08-F01, E11-F01. **Anlass:** CR-18, CR-19.

Das Profil legt CAP/CDS, Node-Version, Paketabhängigkeiten, Serviceverträge, Authentisierung, Fehlerverhalten und genau einen initialen Testpfad fest. Nicht passende TypeORM-/Express- oder Trigger-Skelette werden nicht wahllos beigemischt.

**E06-F03-US01.** Als CAP-Entwickler möchte ich ein konsistentes Projekt, damit Build und Tests denselben Technologiestack verwenden.  
**Abnahme:** Ein frischer Build aus dem referenzierten Lockfile gelingt im isolierten Profilrunner. Fehlende Pakete führen zum Buildfehler, nicht zu einem impliziten Universalstub.

**E06-F03-US02.** Als Integrationsexperte möchte ich Transaktionsgrenzen und API-Abhängigkeiten sehen, damit das Projekt nicht nur lokale Happy-Path-Logik enthält.  
**Abnahme:** Der Entwurf benennt Remote-Aufrufe, Berechtigung, Timeout, Retry und Idempotenz soweit erforderlich. Nicht geklärte Verträge sperren das behauptete Integrations-Gate, nicht den Export eines klar markierten Entwurfs.


#### E06-F04 — Kleine verifizierte Transformationsrezepte

**Release 3.4 · P2 · Größe L · Owner: Engine + SAP/CAP Maintainer**  
**Abhängigkeiten:** E06-F02, E06-F03, E07-F04, E15-F01. **Anlass:** Produkt-/Integrationsausbau.

Wiederkehrende, eng definierte Muster erhalten deterministische Vorbedingungen, Patch, Nachbedingungen und Regressionen. Die Plattform erweitert nur nachgewiesene Rezepte; sie startet keinen allgemeinen autonomen Refactoring-Agenten.

**E06-F04-US01.** Als Entwickler möchte ich eine wiederkehrende sichere Anpassung automatisieren, damit ich weniger Zeit auf mechanische Änderungen verwende.  
**Abnahme:** Ein Rezept wird nur bei vollständig erfüllten AST-/Zielkontext-Vorbedingungen angeboten. Nicht passende Fälle werden ohne Patch abgelehnt; der erzeugte Diff ist vor Übernahme sichtbar.

**E06-F04-US02.** Als Maintainer möchte ich ein fehlerhaftes Rezept zurückziehen, damit bekannte Risiken nicht weiter ausgerollt werden.  
**Abnahme:** Eine widerrufene Rezeptversion bleibt historisch referenzierbar, wird aber nicht neu ausgeführt. Betroffene noch offene ChangeSets erhalten Reviewbedarf; bereits ausgelieferte Fälle werden gezielt informiert.


---


### 12.7 E07 — Tatsächliche Verifikation und fachliche Regression

**Ziel:** Testentwurf, Simulation, technische Ausführung und fachliche Abnahme werden sauber getrennt.

**Start im Code / System:** `hooks/useTestExecution.ts; app/api/run-tests/route.ts; lib/abap/result-diff.ts; Testing-Seite`  
**Erfolgsmaß:** Kein False-Passed aus fehlendem Test, Stub, Simulation oder falscher Revision.


#### E07-F01 — Ehrliche Teststatus und genaue Result-Zuordnung

**Release 2.9 · P0 · Größe M · Owner: QA + Backend**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-12, CR-13, CR-14, CR-16.

Passed entsteht ausschließlich aus einem expliziten zugeordneten Ergebnis. Simulation, Connectivity, Skip, Todo, Not-run und Error erhalten eigene Zustände. Stubs werden sichtbar und entwerten nicht passende Verifikationsbehauptungen.

**E07-F01-US01.** Als Tester möchte ich ausgelassene oder fehlende Tests erkennen, damit ein erfolgreich gestarteter Prozess nicht als bestandene Suite gilt.  
**Abnahme:** Die Regressionen für TAP-SKIP/TODO liefern skipped bzw. todo. Eine erwartete, im Output fehlende ID bleibt not-run oder error, auch wenn `exitCode === 0` ist.

**E07-F01-US02.** Als Empfänger möchte ich erkennen, was wirklich geprüft wurde, damit eine simulierte ABAP-Suite nicht mit ABAP Unit verwechselt wird.  
**Abnahme:** Der Mock-Pfad schreibt simulated, ein Metadatenaufruf connectivity. Delivery verwendet diese Typen unverändert und darf daraus kein AUnit-/Compliance-Badge erzeugen.


#### E07-F02 — Receipts aus kundenseitigem ATC-/ABAP-Unit-Lauf

**Release 3.0 · P1 · Größe L · Owner: ABAP Developer + Integration**  
**Abhängigkeiten:** E01-F02, E07-F01, E14-F01. **Anlass:** CR-12, CR-17.

Eine referenzierte Kundenpipeline oder ein geprüfter Import liefert Objektstand, Zielsystemkontext, Checkvariante, Zeit, Toolversion und Einzelresultate. Der Connector behauptet nur den tatsächlich ausgeführten Prüftyp.

**E07-F02-US01.** Als ABAP-Entwickler möchte ich native Testergebnisse übernehmen, damit die Plattform SAP-Ausführung nicht im Browser simuliert.  
**Abnahme:** Ein echter Pilotlauf importiert ATC- und ABAP-Unit-Ergebnisse getrennt. Ergebnisse sind dem geprüften Objektstand zugeordnet; ein reiner ADT-Connectivity-Test erfüllt das ABAP-Unit-Gate nicht.

**E07-F02-US02.** Als Reviewer möchte ich falsche oder veraltete Receipts zurückweisen, damit fremde Systemergebnisse keine aktuelle Freigabe begründen.  
**Abnahme:** Ein Receipt mit anderem ChangeSet-Digest, unbekannter vertrauenswürdiger Quelle oder fehlendem Prüfumfang bleibt unverified. Freigabe erfordert dokumentierte Zuordnung oder einen neuen Lauf.


#### E07-F03 — Reale CAP-Builds und Tests mit expliziter Mock-Grenze

**Release 3.0 · P1 · Größe L · Owner: CAP Developer + QA**  
**Abhängigkeiten:** E06-F03, E07-F01, E08-F01. **Anlass:** CR-14, CR-18.

Build, Unit, Contract und Integration sind getrennte Prüftypen. Externe Systeme dürfen in Unit-Tests gemockt sein, aber die Mock-Grenze ist Teil des Receipts. Netzwerk-/Tenantintegration benötigt einen eigenen autorisierten Test.

**E07-F03-US01.** Als Entwickler möchte ich einen fehlenden Import oder Buildfehler sehen, damit Proxy-Stubs keine nicht lauffähige Anwendung verdecken.  
**Abnahme:** Ein nicht installiertes Paket lässt den Build fehlschlagen. Mock-Abhängigkeiten sind explizit im Manifest; produktive Abhängigkeiten werden nicht automatisch ersetzt.

**E07-F03-US02.** Als QA-Verantwortlicher möchte ich lokale Tests von echter API-Vertragsprüfung unterscheiden, damit die Freigabe zum Risiko passt.  
**Abnahme:** Eine reine Mock-Suite kann unit_passed, aber nicht integration_passed liefern. Ein abweichendes API-Schema im Contract-Test erzeugt ein konkretes Finding und verhindert die zugehörige Promotion.


#### E07-F04 — Semantische Regression und unabhängige Testorakel

**Release 3.3 · P1 · Größe L · Owner: QA + Functional Consultant**  
**Abhängigkeiten:** E04-F03, E07-F02, E07-F03. **Anlass:** CR-25.

Fachliche Regeln erhalten unabhängige Sollwerte, Datentypen, Währungen, Toleranzen, Berechtigungs- und Fehlerfälle. Vergleichslogik respektiert Null/NaN, Reihenfolge und Multimengen; bewusst geänderte Regeln sind explizite Ausnahmen.

**E07-F04-US01.** Als Fachtester möchte ich fachliche Unterschiede präzise erkennen, damit technische Normalisierung keine falschen Ergebnisse versteckt.  
**Abnahme:** NaN ist nicht null, leer oder nullwertige Zahl; Währungen und Toleranzen folgen dem Testvertrag. Die vorhandenen positiven Duplikat- und Reihenfolgefälle bleiben korrekt.

**E07-F04-US02.** Als Business Owner möchte ich absichtlich geändertes Verhalten bestätigen, damit Regressionstests nicht die falsche Altlogik erzwingen.  
**Abnahme:** Eine genehmigte Regeländerung besitzt neue Sollwerte und referenzierte Zustimmung. Mindestens ein absichtlich eingebauter Fehler pro kritischer Regelklasse wird vom unabhängigen Testorakel entdeckt.


---


### 12.8 E08 — Runner-Sicherheit, Secrets und souveräner Betrieb

**Ziel:** Fremder Code und sensible SAP-Informationen bleiben in kontrollierten Sicherheitsgrenzen.

**Start im Code / System:** `app/api/run-tests/route.ts; Firebase-/Tenant-Connectoren; Deployment; SECURITY.md`  
**Erfolgsmaß:** Keine fremde Codeausführung im Plattform-Vertrauenskontext; Betriebs- und Datenpfade sind überprüfbar.


#### E08-F01 — Harte Ausführungsgrenze oder sichere Abschaltung

**Release 2.9 · P0 · Größe L · Owner: Security + Platform**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-15.

Bis zur geprüften Isolation wird die gefährdete Ausführung deaktiviert; dies ist ein zulässiger 2.9-Sicherheitsabschluss, aber kein ausgeliefertes Runner-Feature. Aktivierung erfordert separaten Einmal-Runner, minimales Konto, Limits und nachgewiesene Egress-Regeln.

**E08-F01-US01.** Als Plattformbetreiber möchte ich untrusted Tests außerhalb der Anwendung ausführen, damit deren Code keine Plattformprivilegien erhält.  
**Abnahme:** Ein Runner-Versuch auf Anwendungsspeicher, Metadatendienst oder nicht erlaubtes Netzwerk wird in der kontrollierten Testumgebung blockiert. Keine Plattform-Admin-Secrets stehen im Prozess zur Verfügung.

**E08-F01-US02.** Als Security-Verantwortlicher möchte ich eine nicht ausreichend abgesicherte Funktion zuverlässig abschalten, damit Termindruck keinen offenen Ausführungspfad erzwingt.  
**Abnahme:** Bei deaktiviertem oder nicht attestiertem Runner lehnt die API neue Ausführungen serverseitig ab. Ein Frontend-Flag oder das bloße Setzen einer Egress-Umgebungsvariable aktiviert ihn nicht.


#### E08-F02 — Secret-Broker, Datenfluss und Retention

**Release 2.10 · P1 · Größe L · Owner: Security + Backend**  
**Abhängigkeiten:** E08-F01. **Anlass:** CR-15, CR-27.

Provider- und Tenant-Credentials werden getrennt verwaltet, nicht in Exporten oder Promptlogs gespeichert. Datenfluss, Speicherorte, Aufbewahrung, Löschung und zulässige Testoperationen sind technisch dokumentiert. Bestehende Dokumente werden erweitert, nicht neu erfunden.

**E08-F02-US01.** Als Kunde möchte ich je Zweck steuern, welche Daten an welchen Dienst gehen, damit Codeanalyse nicht automatisch LLM-Freigabe oder Live-SAP-Zugriff bedeutet.  
**Abnahme:** Die drei Berechtigungen Codeimport, LLM-Transfer und Testausführung sind unabhängig. Gesperrter LLM-Transfer verhindert jeden Provideraufruf und nicht nur die entsprechende Schaltfläche.

**E08-F02-US02.** Als Betreiber möchte ich Löschung und Secret-Rotation nachweisen, damit Daten nicht unbeabsichtigt in Backups, Logs oder Paketen verbleiben.  
**Abnahme:** Ein Testfall durchläuft Export, Rotation und Retention-Löschung; aktive Referenzen funktionieren korrekt oder werden nachvollziehbar ungültig. Logs und Manifeste enthalten keine verwendbaren Credentials.


#### E08-F03 — Minimaler privater Betriebsweg mit Paritätsnachweis

**Release 3.0 · P1 · Größe L · Owner: Platform + Backend**  
**Abhängigkeiten:** E08-F02, E11-F02, E16-F03. **Anlass:** Produkt-/Integrationsausbau.

Eine dokumentierte private Deploymentvariante umfasst Identität, Storage, Kataloge, Secret Store, Jobs und optional Runner. Ziel ist ein getesteter Betriebsweg, nicht sofort jede Cloud, Kubernetes-Variante und Datenbank.

**E08-F03-US01.** Als Enterprise-Kunde möchte ich sensible Quellen in einer kontrollierten Umgebung bearbeiten, damit ich die Plattform überhaupt freigeben kann.  
**Abnahme:** Ein frisches Referenzdeployment wird aus dokumentierten Artefakten aufgebaut. Ein Netzwerktest weist die erlaubten ausgehenden Verbindungen nach; Zero-LLM erzeugt keine externen Modellaufrufe.

**E08-F03-US02.** Als Maintainer möchte ich dieselbe Engine in Cloud und Privatbetrieb nutzen, damit Sicherheits- und Fachfixes nicht auseinanderlaufen.  
**Abnahme:** Dieselben gepinnten Quellen, Kataloge und Engineversionen liefern identische deterministische Ergebnisse. Restore und Update werden anhand eines gespeicherten Referenzprogramms getestet.


#### E08-F04 — Private Policies, Providerwechsel und kontrollierte Updates

**Release 3.4 · P2 · Größe L · Owner: Platform + Security**  
**Abhängigkeiten:** E08-F03, E11-F03, E15-F01. **Anlass:** Produkt-/Integrationsausbau.

Organisationen erhalten signierte Policy-/Katalogpakete, freigegebene Provider-/Modelllisten und einen dokumentierten Updatekanal. Restriktiver Betrieb soll ohne versteckte SaaS-Abhängigkeit funktionieren; echte Offline-Fähigkeit wird gesondert geprüft.

**E08-F04-US01.** Als Security Owner möchte ich Modell- und Katalogupdates zunächst prüfen, damit ein zentraler Anbieterwechsel meine Freigaben nicht aushebelt.  
**Abnahme:** Ein nicht genehmigtes Modell oder Paket wird blockiert. Freigabe eines Updates erzeugt eine neue Policyversion und prüfbaren Einflussbericht auf betroffene Cases.

**E08-F04-US02.** Als Betriebsverantwortlicher möchte ich einen fehlerhaften Updatezug zurückrollen, damit private Installationen wartbar bleiben.  
**Abnahme:** Rollback stellt vorherige lauffähige Software-/Policyversion wieder her und erhält historische Evidenz. Neue Schemas werden nicht destruktiv auf alte Daten zurückgeschrieben.


---


### 12.9 E09 — Lebende Dokumentation und kontrollierbare Prozesse

**Ziel:** Dokumente bleiben am konkreten Quellen- und Entscheidungsstand ausgerichtet.

**Start im Code / System:** `Documentation-Seite; BPMN-Export; SOP/RACI-/Prozessprompts`  
**Erfolgsmaß:** Keine umfassende Aussage aus still gekürztem Kontext; As-is, To-be und As-built bleiben unterscheidbar.


#### E09-F01 — As-is, To-be und Change-Matrix aus demselben Regelmodell

**Release 2.11 · P1 · Größe M · Owner: Product + Functional Consultant**  
**Abhängigkeiten:** E04-F03, E06-F01. **Anlass:** CR-20.

Statt separater Freitextgeneratoren nutzt Dokumentation Regeln, Claims und ChangeSet. As-is beschreibt beobachtete Implementierung, To-be die bestätigte Absicht, As-built den tatsächlich umgesetzten Stand. Nicht abgedeckter Kontext wird angezeigt.

**E09-F01-US01.** Als Entwickler möchte ich geänderte und unveränderte Regeln sehen, damit ich nicht aus einer langen neuen Spezifikation Unterschiede erraten muss.  
**Abnahme:** Die Change-Matrix zeigt je Regel beibehalten, geändert, entfernt oder hinzugefügt mit Begründung und Revision. Ein nur geplanter Change erscheint nicht als bereits implementiert.

**E09-F01-US02.** Als Prozesseigner möchte ich offene Annahmen im Dokument erkennen, damit ein vollständig klingender Text keine Kenntnislücke verschweigt.  
**Abnahme:** Fehlende Includes oder abgeschnittene Eingaben werden im Dossier genannt. Ein Dokumentationsjob darf keinen vollständigen Prozessbericht behaupten, wenn Pflichtquellen nicht verarbeitet wurden.


#### E09-F02 — Valides BPMN mit Traceability und As-is/To-be-Trennung

**Release 3.0 · P1 · Größe M · Owner: Frontend + Process Expert**  
**Abhängigkeiten:** E09-F01, E04-F01. **Anlass:** CR-21.

BPMN entsteht über Serializer und Modellvalidator statt Stringverkettung. Tasks, Flows, Rollen und Ausnahmewege referenzieren Regeln; tatsächliche Organisationsrollen werden bestätigt. Der erste Scope ist valider Austausch, nicht vollständige Ausführbarkeit.

**E09-F02-US01.** Als Prozessmodellierer möchte ich ein gültiges Diagramm importieren, damit Sonderzeichen und Modell-IDs keine Nacharbeit verursachen.  
**Abnahme:** Rollenname „Finance & Risk“, Umlaute und Sonderzeichen ergeben gültiges XML. Eindeutige IDs, existierende Kantenendpunkte und notwendige Start-/Endstruktur werden geprüft; ein Referenzimport gelingt.

**E09-F02-US02.** Als Reviewer möchte ich erkennen, welche Prozessschritte aus Code belegt und welche fachlich ergänzt wurden, damit ein erzeugtes Bild nicht als Prozesswirklichkeit gilt.  
**Abnahme:** Jeder relevante Task besitzt eine Evidence-/Rule-Referenz oder ein sichtbares assumed-Label. As-is und To-be sind getrennte Versionen; Layoutänderung ändert keine fachliche Regel.


#### E09-F03 — Rollenbezogene Dossiers und reproduzierbare Exporte

**Release 3.0 · P1 · Größe M · Owner: Product + Full-Stack**  
**Abhängigkeiten:** E09-F01, E10-F01. **Anlass:** Produkt-/Integrationsausbau.

Business Brief, technisches Dossier, Test-/Regelübersicht und Übergabebericht verwenden dieselben freigegebenen Daten. Markdown/HTML bilden den Kern; ausgewählte Office-/PDF-Exporte folgen getesteten Vorlagen statt vieler ungeprüfter Formate.

**E09-F03-US01.** Als Programmleiter möchte ich eine verständliche Steering-Unterlage erzeugen, damit ich den Projektstatus ohne manuelle Zahlenübertragung berichten kann.  
**Abnahme:** Kennzahlen und Status stammen aus definierten Fallrevisionen. Der Export nennt Datenstand, Scope und offene Nachweise; Review- und Handover-Pakete sind optisch und semantisch unterscheidbar.

**E09-F03-US02.** Als Security Owner möchte ich Dokumente nach Empfängerrolle begrenzen, damit ein fachlicher Entscheider keine unnötigen Quellcodes oder Secrets erhält.  
**Abnahme:** Der Business-Export enthält nur freigegebene Felder und Evidenzverweise. Der vollständige technische Export benötigt separate Berechtigung; Exportdateien werden auf sensible Testmarker geprüft.


#### E09-F04 — Kontrollziele, IKS-Hinweise und Nachweisgrenzen

**Release 3.3 · P2 · Größe L · Owner: Internal Controls + Functional Consultant**  
**Abhängigkeiten:** E04-F03, E07-F04. **Anlass:** Produkt-/Integrationsausbau.

Limits, Freigaben, Protokollierung und Berechtigungslogik liefern Kontrollkandidaten. Fachliche Bestätigung, Designwirksamkeit und operative Wirksamkeit werden getrennt. Kein Compliance- oder IKS-Zertifikat allein aus Code.

**E09-F04-US01.** Als Kontrollverantwortlicher möchte ich relevante Altregeln einem Kontrollziel zuordnen, damit Modernisierung keine wichtige Sicherung unbeabsichtigt entfernt.  
**Abnahme:** Ein Kandidat erhält Kontrollziel, Owner, Evidenz und Status „zu prüfen“. Entfernung aus dem Zielbild löst eine Pflichtfrage nach Ersatzkontrolle oder begründeter Freigabe aus.

**E09-F04-US02.** Als Auditor möchte ich belegte Implementierung von tatsächlicher Wirksamkeit unterscheiden, damit ein Codefund nicht als bestandene Kontrolle gilt.  
**Abnahme:** Ohne Ausführungs-/Betriebsnachweis bleibt operative Wirksamkeit unbekannt. Das Dossier benennt geprüften Zeitraum, Testumfang und Prüfer statt eines pauschalen Compliance-Badges.


---


### 12.10 E10 — Integrität, nachvollziehbare Übergabe und Abschluss

**Ziel:** Alle relevanten Artefakte gehören zu einem prüfbaren Paket mit ehrlichem Reifegrad.

**Start im Code / System:** `lib/run-signature.ts; lib/audit-pack.ts; app/api/audit-pack/create/route.ts; Delivery-Seite`  
**Erfolgsmaß:** Manipulation und Versionskonflikte werden erkannt; Übergabe und tatsächlicher Abschluss bleiben getrennt.


#### E10-F01 — Gemeinsames Manifest für Code, Text und Nachweise

**Release 2.10 · P1 · Größe M · Owner: Backend + Security**  
**Abhängigkeiten:** E01-F02, E04-F01. **Anlass:** CR-16, CR-26, CR-27.

Das Manifest verbindet Quellstand, Katalog, Claims, Entscheidung, Code, Dokumente, Economics und Receipts. Auch AI-Texte erhalten Hashes; ihre Herkunft bleibt klar markiert. Clientgelieferte Inhalte werden nicht unbemerkt zu Serverfakten.

**E10-F01-US01.** Als Empfänger möchte ich sehen, welche Dateien zu welchem Ergebnis gehören, damit ich Code-ZIP und Audit-Pack nicht manuell abgleichen muss.  
**Abnahme:** Jede enthaltene Datei besitzt Digest, Typ, Status und Elternrevision. Fehlt eine referenzierte Pflichtdatei oder weicht ihr Inhalt ab, gilt das Paket als unvollständig bzw. manipuliert.

**E10-F01-US02.** Als Auditor möchte ich Narrativänderungen erkennen, damit die Geschäftsbegründung nicht nachträglich unbemerkt umgeschrieben wird.  
**Abnahme:** Eine Änderung im Business Brief verändert den Manifest-Digest. Die Signatur bestätigt Integrität, während LLM-Herkunft und semantischer Reviewstatus separat sichtbar bleiben.


#### E10-F02 — Asymmetrische Signatur und Offline-Verifier

**Release 2.10 · P1 · Größe M · Owner: Security + Backend**  
**Abhängigkeiten:** E10-F01. **Anlass:** CR-26.

Ein öffentlich verifizierbares Signaturverfahren, etwa Ed25519 nach Sicherheitsreview, schützt das vollständige Manifest. Schlüssel-ID, Rotation, Widerruf und kanonische Serialisierung gehören zum Vertrag; historische HMAC-Pakete werden korrekt gekennzeichnet.

**E10-F02-US01.** Als externer Prüfer möchte ich ein Paket ohne Plattformkonto prüfen, damit Nachvollziehbarkeit nicht vom laufenden SaaS-Service abhängt.  
**Abnahme:** Der CLI-Verifier akzeptiert ein unverändertes Referenzpaket mit vertrauenswürdigem Public Key und lehnt veränderte Dateien, falschen Schlüssel und geändertes Manifest ab. Er benötigt kein Signatur-Secret.

**E10-F02-US02.** Als Betreiber möchte ich Schlüssel sicher wechseln, damit kompromittierte oder abgelaufene Schlüssel nicht dauerhaft Vertrauen erhalten.  
**Abnahme:** Ein Rotationsfall bleibt anhand dokumentierter Trust Policy prüfbar. Unbekannte oder widerrufene Schlüssel liefern einen sichtbaren Vertrauensfehler; die Plattform behauptet keine bewiesene inhaltliche Wahrheit.


#### E10-F03 — Review Pack versus Controlled Handover

**Release 3.0 · P0 · Größe L · Owner: Product + Backend + QA**  
**Abhängigkeiten:** E01-F03, E05-F03, E07-F02, E07-F03, E10-F02, E12-F02. **Anlass:** CR-16, CR-17.

Ein Review Pack ist jederzeit im zulässigen Scope exportierbar. Controlled Handover erfordert dispositionsspezifische Gates, aktuelle Nachweise, Empfänger, Betriebsowner und Rückfallweg. Dateiformate werden nur im getesteten Umfang beworben.

**E10-F03-US01.** Als Delivery Lead möchte ich den Reifegrad eines Pakets eindeutig erkennen, damit Entwürfe nicht als deploybare Lösung behandelt werden.  
**Abnahme:** Fehlende Pflicht-Receipts erlauben nur Review Pack. Ein direkt aufgerufener Handover-Endpunkt kann die Sperre nicht umgehen; die Oberfläche nennt exakt die fehlenden Nachweise.

**E10-F03-US02.** Als Business Owner möchte ich eine Stilllegung ohne künstlichen Codeexport übergeben, damit auch weniger Software ein vollständiges Ergebnis ist.  
**Abnahme:** RETIRE kann mit genehmigtem Abschaltplan, Abhängigkeitsreview, Fachabnahme und Rollback kontrolliert übergeben werden. ABAP-/CAP-Tests werden dabei nicht erfunden, sondern zutreffend als nicht anwendbar begründet.


#### E10-F04 — Closure-Paket und wiedereröffnete Entscheidungen

**Release 3.5 · P1 · Größe M · Owner: Product + Operations**  
**Abhängigkeiten:** E10-F03, E15-F04, E12-F04. **Anlass:** Produkt-/Integrationsausbau.

Closure ergänzt tatsächliche Umsetzung, Hypercare-Ende, Betriebsübernahme und beobachtete Wirkung. Bei Rollback oder geänderten Voraussetzungen entsteht ein nachvollziehbarer Reopen statt einer überschriebenen Erfolgsmeldung.

**E10-F04-US01.** Als Programmleiter möchte ich übergeben, umgesetzt und abgeschlossen unterscheiden, damit mein Fortschrittsbericht nicht Downloads als Erfolg zählt.  
**Abnahme:** Ein exportiertes Paket bleibt handed-over. Erst verknüpfter Umsetzungsnachweis und akzeptierte Abschlusskriterien erzeugen closed; fehlende Wirkungsmessung bleibt ausdrücklich offen.

**E10-F04-US02.** Als Betriebsowner möchte ich einen zurückgerollten Fall wieder öffnen, damit das Portfolio die reale Landschaft widerspiegelt.  
**Abnahme:** Ein autorisierter Rollback-Receipt erzeugt reopened mit Grund und Verantwortlichem. Frühere Entscheidung, Release und Abschluss bleiben historisch prüfbar; Kennzahlen werden ohne Doppelzählung korrigiert.


---


### 12.11 E11 — Kontrollierte AI-Nutzung und deterministischer Basismodus

**Ziel:** AI bleibt optional, austauschbar und überprüfbar statt zur unsichtbaren Autorität zu werden.

**Start im Code / System:** `LLM-Service und Promptpfade; app/api/runs/create/route.ts; Settings/Quoten`  
**Erfolgsmaß:** Jeder Modelloutput ist auf echte Inputs und Providerdaten zurückführbar; Zero-LLM funktioniert ohne Modellaufruf.


#### E11-F01 — Versionierte Prompt-, Schema- und Providerverträge

**Release 2.10 · P1 · Größe M · Owner: AI Engineer + Backend**  
**Abhängigkeiten:** E04-F01, E08-F02. **Anlass:** CR-19, CR-20, CR-27.

Zentrale Generation Contracts enthalten Inputauswahl, Kontextbudget, Rollen, Ausgabeschema und Validierung. Provider- und Modellkennung stammen aus der tatsächlichen Ausführung. Kontextkürzungen sind explizite Daten, keine verdeckte Implementierungsabkürzung.

**E11-F01-US01.** Als Reviewer möchte ich einen Output auf den tatsächlichen Generierungslauf zurückführen, damit falsche Modelllabels keine Reproduzierbarkeit vortäuschen.  
**Abnahme:** Ein Receipt nennt verwendetes Modell, Promptversion, Input-Digests und Output-Digest. Providerfallback erzeugt einen neuen tatsächlichen Modellwert, nicht das ursprüngliche Profil-Label.

**E11-F01-US02.** Als Entwickler möchte ich ungültige Antworten sicher behandeln, damit Parserfehler keinen erfolgreichen Projektstatus erzeugen.  
**Abnahme:** Fehlende Pflichtfelder, widersprüchliche IDs und überschrittene Grenzen führen zu validation_failed. Rohantwort bleibt geschützt als Fehlerartefakt; keine nachgelagerte Freigabe entsteht automatisch.


#### E11-F02 — Zero-LLM als vollständiger Evidence-Basispfad

**Release 2.10 · P1 · Größe M · Owner: Engine + Product**  
**Abhängigkeiten:** E02-F02, E01-F03, E10-F01. **Anlass:** Produkt-/Integrationsausbau.

Import, deterministische Findings, Katalog, bekannte Grenzen, manuelle Regeln/Entscheidungen und Evidence-Export funktionieren ohne Modellschlüssel. Narrativ und Entwurf fehlen dann sichtbar oder werden manuell erstellt; es wird keine Gleichwertigkeit zu nicht erzeugten Funktionen behauptet.

**E11-F02-US01.** Als sicherheitsbewusster Kunde möchte ich ohne LLM starten, damit technische Evidenz nicht von der Freigabe externer AI-Verarbeitung abhängt.  
**Abnahme:** Ein kompletter Evidence-Run gelingt bei gesperrtem Modellnetzwerk. Netzwerk- und Mockprüfungen zeigen null Provideraufrufe; fehlende AI-Artefakte sind ausdrücklich nicht erzeugt.

**E11-F02-US02.** Als Business Owner möchte ich eine manuelle Entscheidung mit derselben Governance treffen, damit AI-freie Projekte nicht einen zweiten unsicheren Workflow erhalten.  
**Abnahme:** Manuelle Claims und Optionen nutzen dieselben Revisionen, Rollen und Gates. Ihre Herkunft lautet human; ein späteres AI-Upgrade überschreibt die bestätigte Entscheidung nicht.


#### E11-F03 — Zwei freigegebene AI-Zugangswege statt Provider-Sammelliste

**Release 3.0 · P1 · Größe L · Owner: AI Engineer + Security**  
**Abhängigkeiten:** E11-F01, E11-F02, E08-F02. **Anlass:** Produkt-/Integrationsausbau.

Der bestehende Pfad plus ein im Pilot tatsächlich benötigter Enterprise-Endpunkt erhalten identische Schemas und separate Qualitätsmessung. Region, Vertrag, Datentransfer und Logging werden für jeden Pfad nachgewiesen; fünf Anbieter sind kein Startziel.

**E11-F03-US01.** Als Organisation möchte ich meinen genehmigten AI-Zugang verwenden, damit Nutzung und Kosten zu meinen Verträgen passen.  
**Abnahme:** Ein Projekt lässt nur freigegebene Provider-/Endpointkombinationen zu. Bei gesperrtem oder ausgefallenem Provider erfolgt kein stiller Transfer zu einem anderen Dienst.

**E11-F03-US02.** Als QA-Verantwortlicher möchte ich Qualitätsunterschiede sehen, damit Providerwechsel nicht als semantisch identisch behandelt werden.  
**Abnahme:** Beide Pfade werden gegen denselben versionierten Evaluationskorpus mit mehreren Läufen geprüft. Änderung des Modells erzeugt Reviewbedarf für Providerfreigabe, nicht nachträglich andere historische Receipts.


#### E11-F04 — Jobs, Budgets und Kosten je nachvollziehbarer Aufgabe

**Release 3.1 · P1 · Größe M · Owner: Platform + Product**  
**Abhängigkeiten:** E11-F03, E13-F02. **Anlass:** Produkt-/Integrationsausbau.

Baut das grundlegende Jobmodell zu organisationsbezogener Budgetsteuerung aus: reserviertes Budget, tatsächlicher Verbrauch, Abbruch, faire Warteschlange und Idempotenz. Nutzungsmetriken enthalten keine sensiblen Promptinhalte.

**E11-F04-US01.** Als Betreiber möchte ich Kosten begrenzen, damit ein freies Angebot durch Wiederholungen oder parallele Jobs nicht unkontrolliert belastet wird.  
**Abnahme:** Parallele Anfragen reservieren Budget atomar. Ein überschrittenes Limit stoppt neue kostenpflichtige Schritte; Retry erzeugt keine doppelte Verbrauchsbuchung.

**E11-F04-US02.** Als Programmleiter möchte ich fehlgeschlagene Jobs nachvollziehen, damit ich nicht unnötig ganze Projekte neu berechnen muss.  
**Abnahme:** Der Job zeigt erfolgreiche Teilartefakte, Fehlerursache und zulässige Wiederholung. Abbruch oder Timeout erzeugen keinen fertig-Status und keine versteckten Folgejobs.


---


### 12.12 E12 — Belastbare Economics und Priorisierung

**Ziel:** Kosten, Nutzen und Risiko werden aus transparenten Annahmen abgeleitet, nicht aus einem unbelegten Score.

**Start im Code / System:** `TCO-Seite; Aufwand-/Wertanzeigen; künftiger Economics-Service`  
**Erfolgsmaß:** Keine nicht endlichen Werte; jede wesentliche Kostenkomponente besitzt Quelle, Annahme oder explizite Lücke.


#### E12-F01 — TCO-Hotfix und Entfernung falscher finanzieller Gewissheit

**Release 2.9 · P0 · Größe M · Owner: Full-Stack + QA**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-22, CR-23.

Sofortmaßnahmen verhindern Infinity, NaN, negative Schein-Amortisation und inkonsistente Jahr-0-Daten. Score→Euro und feste 85%-Verbesserung werden entfernt oder klar als nicht belastbares Demonstrationsmodell gesperrt.

**E12-F01-US01.** Als Nutzer möchte ich auch Grenzwerte korrekt sehen, damit Score100 oder Investition0 keine falschen Finanzkennzahlen erzeugen.  
**Abnahme:** Die Fälle Score100, Score99, Nullinvestition und fehlender Score liefern valide, klar bezeichnete Ergebnisse oder nicht berechenbar. Kein Diagramm erhält nicht endliche Zahlen.

**E12-F01-US02.** Als Entscheider möchte ich wissen, welche Zahlen nicht belegt sind, damit ich keine Modellannahme in einen Business Case übernehme.  
**Abnahme:** Ohne geeignete Kosteneingaben wird keine Einsparprognose angezeigt. Bei negativen jährlichen Vorteilen steht keine negative Amortisationszeit, sondern „keine Amortisation im Modell“.


#### E12-F02 — Optionenbezogene Lebenszykluskosten und Sensitivitäten

**Release 2.11 · P1 · Größe L · Owner: Product + Controlling**  
**Abhängigkeiten:** E12-F01, E05-F01. **Anlass:** CR-23.

Ein versionierter Economics-Service modelliert einmalige Migration, Tests, Schulung, Parallelbetrieb, Plattform-/Lizenzkosten und laufenden Betrieb pro Option. Cashflow, Zeitraum, Währung und optionale Abzinsung sind explizit; keine erfundenen Sätze.

**E12-F02-US01.** Als Controller möchte ich KEEP und Alternativen auf gleicher Leistungsbasis vergleichen, damit ich nicht reine Entwicklungskosten mit Vollkosten vergleiche.  
**Abnahme:** Alle Varianten nennen enthaltene Leistungen und Kostenkategorien. Fehlende Lizenzen oder Betriebsannahmen erzeugen einen sichtbaren Vollständigkeitsmangel; das Ergebnis bleibt Szenario statt geprüfter Business Case.

**E12-F02-US02.** Als Programmleiter möchte ich erkennen, wann sich die Rangfolge ändert, damit ich die wirklich entscheidenden Annahmen validiere.  
**Abnahme:** Eine Sensitivität verändert benannte Kosten-/Nutzenparameter innerhalb eingegebener Grenzen. Break-even wird nur bei gültigem Cashflow berechnet; gemeinsame Plattformkosten werden nicht jedem Fall voll zugerechnet.


#### E12-F03 — Risikogestützte Priorisierung ohne Scheinpräzision

**Release 3.1 · P1 · Größe M · Owner: Product + PMO**  
**Abhängigkeiten:** E12-F02, E13-F02, E03-F02. **Anlass:** Produkt-/Integrationsausbau.

Kritikalität, technische Belastung, Frist, Nutzung, Entscheidungsreife, Abhängigkeiten und Aufwand werden getrennt sichtbar. Harte Risiken erhalten Vorrang vor gewichteter Optimierung; unbekannte Eingaben bleiben unbekannt.

**E12-F03-US01.** Als Programmleiter möchte ich dringende Risiken und wirtschaftliche Chancen unterscheiden, damit ein einfacher Score nicht sämtliche Arbeit vermischt.  
**Abnahme:** Eine verbindliche Frist oder blockierende Abhängigkeit kann nicht durch hohe Einsparung eines anderen Falls überstimmt werden. Der Nutzer sieht Kriterien und Gewichtungen sowie den Grund jeder Priorisierung.

**E12-F03-US02.** Als Analyst möchte ich fehlende Nutzungsdaten als Klärungsbedarf behandeln, damit ungemessene Fälle nicht automatisch niedrige Priorität erhalten.  
**Abnahme:** Ohne Usage-Import bleibt das Kriterium unknown. Die Oberfläche bietet Datenerhebung statt erfundener neutraler 0,5; Änderungen von Gewichten sind versioniert und im Vergleich sichtbar.


#### E12-F04 — Beobachtete Wirkung und Forecast-versus-Actual

**Release 3.5 · P1 · Größe M · Owner: Controlling + Product**  
**Abhängigkeiten:** E12-F02, E15-F04. **Anlass:** Produkt-/Integrationsausbau.

Nach Umsetzung werden tatsächliche Kosten, Aufwand und vereinbarte Ergebnisgrößen übernommen. Prognose, Budget und beobachteter Ist-Wert bleiben getrennt. Gemeinsame Effekte erhalten eine Zuordnungsregel statt mehrfacher Einsparungsbuchung.

**E12-F04-US01.** Als Controller möchte ich prognostizierte und reale Effekte vergleichen, damit das Programm aus seinen Entscheidungen lernt.  
**Abnahme:** Ein abgeschlossener Fall zeigt Baseline, Messfenster, Ist-Quelle und Abweichung. Fehlende Ist-Daten werden als ausstehend markiert; sie übernehmen nicht automatisch die Prognose.

**E12-F04-US02.** Als Programmleiter möchte ich gemeinsame Nutzenbeiträge sauber zuordnen, damit der Gesamtnutzen nicht künstlich wächst.  
**Abnahme:** Zwei Fälle mit demselben eingesparten Betriebspaket verweisen auf eine gemeinsame Benefit-ID. Aggregation zählt den Effekt einmal und erklärt die Zuordnung sowie nicht monetarisierte Vorteile.


---


### 12.13 E13 — Organisation, Zusammenarbeit und Programmsteuerung

**Ziel:** Das Werkzeug wird von einer persönlichen Projektsammlung zu einem verantwortbar gemeinsam genutzten Arbeitsraum.

**Start im Code / System:** `Firestore-Regeln; Projektzugriffe; Dashboard; Organisations- und Rollenmodell neu abgrenzen`  
**Erfolgsmaß:** Keine Cross-Tenant-Zugriffe; eindeutige Zuständigkeit und korrekte Nenner im Programmfortschritt.


#### E13-F01 — Organisationen, Rollen, SSO und sichere Gastbeteiligung

**Release 3.0 · P1 · Größe L · Owner: Identity + Backend + Security**  
**Abhängigkeiten:** E01-F03, E08-F02, E16-F03. **Anlass:** CR-28.

Organisation und Programm bilden die Berechtigungsgrenzen. Rollen sind zweckgebunden; Enterprise-Freigaben verwenden verifizierte Identität und passende Autorisierung. Ein erster dokumentierter SSO-Pfad wird vollständig getestet, weitere folgen bedarfsgetrieben.

**E13-F01-US01.** Als Organisation-Admin möchte ich Mitgliedschaften und Freigaberechte verwalten, damit nicht jeder Projektbearbeiter als Business Owner entscheiden kann.  
**Abnahme:** Ein Nutzer ohne Owner-Rolle kann Quellen bearbeiten, aber keine kritische fachliche Attestation ausstellen. Entzug der Mitgliedschaft wirkt für API, Exporte, Hintergrundjobs und bestehende Sessions gemäß definierter Policy.

**E13-F01-US02.** Als Gastentscheider möchte ich nur meinen Request sehen, damit ein einfacher Freigabelink kein Zugriff auf das gesamte Kundenportfolio wird.  
**Abnahme:** Ein Gast kann weder andere Fälle auflisten noch Artefakte über erratene IDs öffnen. Abgelaufene oder widerrufene Einladungen erlauben keine weitere Entscheidung; Zugriffsversuche werden ohne Quelltext protokolliert.


#### E13-F02 — Portfolio mit konsistenten Fall-, Objekt- und Evidenzkennzahlen

**Release 3.1 · P1 · Größe L · Owner: Product + Full-Stack**  
**Abhängigkeiten:** E13-F01, E01-F04, E10-F03. **Anlass:** Produkt-/Integrationsausbau.

Filter und Ansichten nach Prozess, Owner, Zielrelease, Entscheidung, Nutzung, technischem Risiko und Reifegrad. Offene, übergebene und geschlossene Fälle sind getrennt; Drilldown führt von jeder Kennzahl zu den gezählten Datensätzen.

**E13-F02-US01.** Als PMO möchte ich ein belastbares Gesamtbild, damit ich nicht aus individuellen Projekten manuell eine Steuerungsliste zusammensetzen muss.  
**Abnahme:** Ein definiertes Pilotprofil mit 100 Fällen und 1.000 Objekten ist paginiert bearbeitbar. Jeder Zähler nennt Einheit, Nenner, Datenstand und Filter; unbekannte Werte sind separat auswählbar.

**E13-F02-US02.** Als Steering-Mitglied möchte ich Zahlen nachvollziehen, damit ein grüner Gesamtstatus nicht offene kritische Fälle verdeckt.  
**Abnahme:** Jede Kennzahl lässt sich auf die zugrunde liegenden Case-Revisionen herunterbrechen. Gemeinsam genutzte Objekte werden in der Objektsumme einmal gezählt; offene P0-Risiken bleiben sichtbar.


#### E13-F03 — Delivery-Wellen und abhängige Umsetzungsplanung

**Release 3.1 · P1 · Größe L · Owner: PMO + Product**  
**Abhängigkeiten:** E13-F02, E12-F03, E03-F03. **Anlass:** Produkt-/Integrationsausbau.

Wellen berücksichtigen Schnittstellen, gemeinsame Objekte, fachliche Abnahmen, verfügbare Kapazität, Cutoverfenster und Voraussetzungstasks. Die Plattform ergänzt vorhandene Planungssysteme; sie wird kein vollständiger Ressourcenplaner.

**E13-F03-US01.** Als Release Manager möchte ich abhängige Änderungen gemeinsam planen, damit eine Stilllegung nicht vor ihrer Ersatzfunktion produktiv geht.  
**Abnahme:** Eine Welle mit RETIRE vor erforderlicher STANDARDIZE-Umsetzung wird als Konflikt markiert. Gemeinsame Komponenten und Freigaben erscheinen als explizite Voraussetzungen.

**E13-F03-US02.** Als Programmleiter möchte ich Szenarien vergleichen, damit ich Fristen und verfügbare Kapazität realistisch abwägen kann.  
**Abnahme:** Eine Planvariante verändert weder Baseline noch Ist-Status. Kapazitätsannahmen sind sichtbar; nicht zugewiesene Arbeit wird nicht automatisch als verfügbar eingeplant.


#### E13-F04 — Föderierte Programme und partnerfähige Zusammenarbeit

**Release 3.4 · P2 · Größe L · Owner: Backend + Enterprise Product**  
**Abhängigkeiten:** E13-F02, E14-F03, E08-F04. **Anlass:** Produkt-/Integrationsausbau.

Konzerne und Partner können freigegebene Metadaten aus getrennten Programmen aggregieren. Rechte verbleiben beim Ursprung; Aggregation ist keine implizite Datenfreigabe. Unterschiedliche Zielrelease-/Methodikstände werden nicht unbereinigt zusammengezählt.

**E13-F04-US01.** Als Konzern-PMO möchte ich konsolidierten Fortschritt sehen, ohne jede Quellcodebasis zentral kopieren zu müssen.  
**Abnahme:** Eine freigegebene Metadatensicht aggregiert Zähler mit Methodik- und Versionsbezug. Drilldown auf geschützte Quellartefakte erfordert zusätzliche Rechte; fehlende Freigabe bleibt respektiert.

**E13-F04-US02.** Als Kunde möchte ich Partnerzugriff auf ein Projekt begrenzen, damit Zusammenarbeit keine dauerhafte Datenöffnung bedeutet.  
**Abnahme:** Partner erhalten zeitlich und inhaltlich begrenzte Rollen. Vertrags-/Projektende entzieht aktive Rechte; eigene historische Attestations bleiben unverändert mit nachvollziehbarer Identität erhalten.


---


### 12.14 E14 — SAP- und Delivery-Interoperabilität

**Ziel:** Vorhandene Werkzeuge liefern Evidenz und erhalten verwertbare Ergebnisse, statt doppelte Datenerfassung zu erzeugen.

**Start im Code / System:** `Neue Adaptergrenzen an Run-, Case- und Manifestservices; vorhandene Import-/Exportfunktionen verwenden`  
**Erfolgsmaß:** Jede beworbene Integration besitzt einen getesteten Format- oder API-Vertrag und einen klaren Datenverantwortlichen.


#### E14-F01 — ATC-Import mit Checkkontext und Abweichungsanalyse

**Release 2.10 · P1 · Größe L · Owner: ABAP Integration + Engine**  
**Abhängigkeiten:** E03-F01, E02-F02, E01-F02. **Anlass:** Produkt-/Integrationsausbau.

Ein im Pilot tatsächlich verfügbares ATC-Format wird unterstützt. Checkvariante, System-/Releasekontext, Objektstand, Priorität und Herkunft bleiben erhalten. Fremde Dateien werden nicht allein wegen eines SAP-Labels als authentisch zertifiziert.

**E14-F01-US01.** Als Architekt möchte ich ATC-Befunde mit der eigenen Analyse vergleichen, damit Unterschiede erklärbar statt verdeckt werden.  
**Abnahme:** Ein importierter Befund bleibt unverändert neben dem lokalen Finding. Abweichende Zielkontexte werden zuerst angezeigt; nur vergleichbare Prüfumfänge fließen in Übereinstimmungsmetriken ein.

**E14-F01-US02.** Als Reviewer möchte ich inkompatible oder gefälschte Herkunftsangaben erkennen, damit ein Upload nicht automatisch SAP-Autorität erhält.  
**Abnahme:** Fehlende Metadaten erzeugen einen eingeschränkten Importstatus. Eine beliebige CSV kann als benutzerseitiger Import gelesen werden, erfüllt aber ohne verifizierte Herkunft keinen autorisierten Prüf-Gate.


#### E14-F02 — Versionierte Kernseife- und Migrationsevidenz-Adapter

**Release 3.2 · P1 · Größe L · Owner: SAP Integration + QA**  
**Abhängigkeiten:** E14-F01, E13-F02. **Anlass:** Produkt-/Integrationsausbau.

Kernseife-Klassifikation und tatsächlich verfügbare Mess-/Migrationsergebnisse erhalten getrennte Adapter. Mapping erfolgt auf das Evidence-Schema, ohne originale Bedeutungen zu überschreiben. Readiness-/Simplification-Daten kommen nur bei nachgewiesenem Format hinzu.

**E14-F02-US01.** Als PMO möchte ich vorhandene Messungen verwenden, damit ich eine Landschaft nicht ausschließlich für Clean-Core.io erneut analysieren muss.  
**Abnahme:** Ein genehmigter realer Export je freigegebenem Adapter wird eingelesen und nach Objektidentität zugeordnet. Nicht zuordenbare Zeilen landen sichtbar in Quarantäne; Klassifikationsdatei und Messresultat werden nicht verwechselt.

**E14-F02-US02.** Als Maintainer möchte ich Formatänderungen früh erkennen, damit ein Anbieterupdate nicht still leere oder falsche Ergebnisse erzeugt.  
**Abnahme:** Contract Tests enthalten gültige, alte und bewusst geänderte Formate. Unbekannte inkompatible Versionen werden abgewiesen; Importbericht nennt unterstützte Version und notwendige Korrektur.


#### E14-F03 — Cloud-ALM-, Jira- und LeanIX-Handover im begrenzten Scope

**Release 3.2 · P1 · Größe L · Owner: Integration + Enterprise Architect**  
**Abhängigkeiten:** E10-F03, E13-F02, E14-F01. **Anlass:** Produkt-/Integrationsausbau.

Initial: Jira-Backlog/Links, belegter Cloud-ALM-Task-Anwendungsfall und LeanIX-Zuordnung zu existierenden Architekturartefakten. Jeder Kanal hat Feldmapping, Idempotenz und eigene Freigabe. Native Clean-Core-Dashboardintegration bleibt eine gesonderte Machbarkeitsfrage.

**E14-F03-US01.** Als Delivery Lead möchte ich genehmigte Aufgaben in meinem bestehenden Tool sehen, damit kein zweites führendes Aufgabenregister entsteht.  
**Abnahme:** Ein Handover erzeugt in der autorisierten Testinstanz genau eine Aufgabe mit Case-/Manifestreferenz. Wiederholung aktualisiert oder erkennt denselben Datensatz; fehlende Rechte führen zu einem verständlichen Fehler.

**E14-F03-US02.** Als Enterprise Architect möchte ich Entscheidungen mit vorhandenen LeanIX-Artefakten verknüpfen, damit Clean-Core.io kein konkurrierendes allgemeines ADR-System aufbaut.  
**Abnahme:** Das Mapping referenziert bestätigte Fact-Sheet-/Entscheidungs-IDs statt Namensähnlichkeit. Ein Roundtrip erhält die Referenz; konfliktbehaftete Änderungen werden nicht still überschrieben.


#### E14-F04 — Read-only MCP und begrenzte Evidence-API

**Release 3.2 · P2 · Größe M · Owner: Backend + Security**  
**Abhängigkeiten:** E14-F03, E10-F02, E13-F01. **Anlass:** Produkt-/Integrationsausbau.

Wenige dokumentierte Werkzeuge liefern Kataloglookup, berechtigte Fallinformationen und Evidence-Pakete. Öffentliche Katalogdaten und private Kundenartefakte sind strikt getrennt. Keine Schreib-, Deploy- oder Freigabeaktionen im ersten Scope.

**E14-F04-US01.** Als Entwickler mit Agentenwerkzeug möchte ich Fakten im Arbeitskontext abrufen, damit ich Kataloge und Entscheidungsbelege nicht manuell übertragen muss.  
**Abnahme:** Ein Referenzclient erhält strukturierte Werte mit Snapshot- und Evidence-IDs. Nicht vorhandene Objekte liefern unknown, keine erfundene API; Rate Limits sind reproduzierbar getestet.

**E14-F04-US02.** Als Security Owner möchte ich Agentenzugriffe genauso begrenzen wie die Weboberfläche, damit ein neuer Zugang keine Berechtigungen umgeht.  
**Abnahme:** Abfragen zu fremden Case-IDs werden abgewiesen. Der Agent kann weder attestieren noch ausführen oder veröffentlichen; Dateninhalte ändern die Toolberechtigung nicht.


---


### 12.15 E15 — Kontinuierliche Assurance über den ganzen Lebenszyklus

**Ziel:** Getroffene Entscheidungen bleiben nur so lange gültig, wie ihre Voraussetzungen gelten.

**Start im Code / System:** `Neue Drift-/Policy-Jobs auf Artifact-DAG; Portfolio; Betriebsadapter`  
**Erfolgsmaß:** Änderungen öffnen gezielt betroffene Fälle; Umsetzung und Kontrollwirkung werden nicht aus Code allein abgeleitet.


#### E15-F01 — Source-, Release-, Katalog- und Entscheidungsdrift

**Release 3.3 · P1 · Größe L · Owner: Engine + Product**  
**Abhängigkeiten:** E01-F02, E02-F02, E13-F02. **Anlass:** Produkt-/Integrationsausbau.

Ein Impact-Service verfolgt Änderungen an Abhängigkeiten, Zielrelease, Katalog und bestätigten Regeln. Relevante Drift erzeugt einen begründeten Reviewbedarf. Reines Katalograuschen soll keine massenhafte Alarmierung auslösen.

**E15-F01-US01.** Als Architekt möchte ich sehen, welche Entscheidungen durch ein Upgrade betroffen sind, damit ich nicht das gesamte Portfolio manuell erneut prüfen muss.  
**Abnahme:** Ändert ein Fixture den Status einer verwendeten API, werden nur abhängige Fälle markiert. Unverwendete Katalogänderungen erzeugen keinen Pflichtreview.

**E15-F01-US02.** Als Owner möchte ich den konkreten Änderungsgrund sehen, damit ich zwischen technischer Neubewertung und neuer Fachentscheidung unterscheiden kann.  
**Abnahme:** Der Review zeigt alte/neue Voraussetzung und betroffene Claims/Gates. Eine reine Textkorrektur ohne fachliche Änderung entwertet keine bestandenen technischen Tests.


#### E15-F02 — Ausnahmen, befristetes KEEP und automatische Wiedervorlage

**Release 3.3 · P1 · Größe M · Owner: Product + Governance**  
**Abhängigkeiten:** E05-F03, E13-F02, E15-F01. **Anlass:** Produkt-/Integrationsausbau.

Ein Ausnahmevertrag beschreibt Restriktion, Begründung, Risikoeigner, Ausgleichsmaßnahme, Enddatum und Trigger. Technisch problematische Lösungen werden nicht durch Freigabe „clean“; es wird nur der verantwortete Umgang dokumentiert.

**E15-F02-US01.** Als Architekt möchte ich eine notwendige Übergangslösung befristen, damit ein akzeptiertes Risiko nicht unbegrenzt in Vergessenheit gerät.  
**Abnahme:** KEEP mit Ausnahme verlangt Owner, Grund und Wiedervorlage. Nach Fristablauf wird es review_required; die technische Einstufung bleibt unverändert und wird nicht auf A gesetzt.

**E15-F02-US02.** Als Risikoverantwortlicher möchte ich veränderte Voraussetzungen vor Fristende erkennen, damit eine überholte Kompensation nicht weiter als wirksam gilt.  
**Abnahme:** Entfällt eine benannte Voraussetzung, öffnet sich der Ausnahmefall mit konkretem Trigger. Eine Verlängerung benötigt eine neue Attestation statt bloßer Änderung des Datums.


#### E15-F03 — Evidenzbegrenzte Daten- und Integrationsperspektive

**Release 3.4 · P2 · Größe L · Owner: Data/Integration Architect**  
**Abhängigkeiten:** E03-F03, E02-F03, E15-F01. **Anlass:** Produkt-/Integrationsausbau.

Z-Tabellen, Kopiermuster, externe Aufrufe und Nachrichtenwege werden zu einem Inventar verdichtet. Kandidaten für Redundanz, Datenprodukt oder API/Event erhalten benötigte Zusatznachweise. Keine vollständige Datenqualität oder Laufzeittopologie aus statischem Code.

**E15-F03-US01.** Als Datenarchitekt möchte ich potenzielle Kopien und Abhängigkeiten erkennen, damit ich weitere Untersuchungen zielgerichtet plane.  
**Abnahme:** Eine ähnlich strukturierte Z-Tabelle wird als Kandidat mit Felddifferenzen angezeigt, nicht automatisch als unzulässige Schattentabelle. Ohne Datenprofiling bleibt Datenqualität unbekannt.

**E15-F03-US02.** Als Integrationsarchitekt möchte ich Schnittstellenkandidaten mit Fehler- und Betriebsfragen sehen, damit eine einfache API-Ersetzung keine Semantik verliert.  
**Abnahme:** RFC, Datei und HTTP werden mit bekannter Quelle und ungelösten Zielen inventarisiert. Eine Event-Option benötigt zusätzlich Zustell-/Reihenfolge-/Wiederholungsanforderungen; fehlende Angaben bleiben offene Punkte.


#### E15-F04 — Umsetzungs-, Hypercare- und Betriebsreceipts

**Release 3.5 · P1 · Größe L · Owner: Operations + Integration**  
**Abhängigkeiten:** E10-F03, E14-F03, E15-F01. **Anlass:** Produkt-/Integrationsausbau.

Autorisierte Pipeline- oder Betriebsquellen liefern Deployment, Transport, Stilllegung, Rollback und Beobachtungsdaten. Objekt-/Releasebezug und Beobachtungsfenster sind Pflicht. Ticketstatus allein ist kein Nachweis erfolgreicher Produktivwirkung.

**E15-F04-US01.** Als Betriebsverantwortlicher möchte ich den wirklich eingesetzten Stand zurückmelden, damit die Plattform den realen und nicht nur geplanten Zustand kennt.  
**Abnahme:** Ein Deployment-Receipt mit passendem Digest und Umgebung aktualisiert implemented. Ein Ticket „Done“ ohne solchen Bezug kann lediglich als administrative Rückmeldung übernommen werden.

**E15-F04-US02.** Als Fachverantwortlicher möchte ich Hypercare und saisonale Wirkung prüfen, damit ein kurzer störungsfreier Zeitraum nicht jede Risikofrage erledigt.  
**Abnahme:** Closure verlangt die dispositionsspezifischen Beobachtungs- und Abnahmekriterien. Liegt ein notwendiger Jahresprozess außerhalb des Fensters, bleibt diese Wirkung offen oder ausdrücklich unter genehmigter Nachbeobachtung.


---


### 12.16 E16 — Qualität, offene Verträge und nachhaltiger Betrieb

**Ziel:** Die Plattform beweist ihre Grenzen, lässt sich betreiben und kann außerhalb einer Einzelperson weiterentwickelt werden.

**Start im Code / System:** `tests/; package.json; .github/workflows/; SECURITY.md; Lizenzen; Methodikseiten`  
**Erfolgsmaß:** Reproduzierbarer Qualitätsnachweis und eindeutige Nutzungs-/Betriebsregeln statt Exklusivitäts- und Reifeversprechen.


#### E16-F01 — Methodik-Orakel, Regressionen und verpflichtende CI-Gates

**Release 2.9 · P0 · Größe M · Owner: QA + SAP-Reviewer**  
**Abhängigkeiten:** keine vorgelagerte Feature-Abhängigkeit. **Anlass:** CR-01, CR-02, CR-03, CR-06, CR-13, CR-22, CR-24, CR-25, CR-29, CR-30.

Die bestätigten Reviewfälle werden in reguläre automatisierte Tests übersetzt, mit erwarteter korrekter Fachsemantik statt bloßer Bestätigung des Ist-Fehlers. Sicherheitsprüfung und Deployment verwenden dieselbe verbindliche Policy; Warnungsschulden werden schrittweise reduziert.

**E16-F01-US01.** Als Maintainer möchte ich die gefundenen Defekte dauerhaft absichern, damit spätere Refactorings sie nicht wieder einführen.  
**Abnahme:** Alle relevanten isolierten Reviewprobes erhalten Produktregressionen mit korrigierten Erwartungen. Positive Kontrollen für Kommentar-/Stringfilter, HMAC-Manipulation und Duplikatvergleich bleiben erhalten.

**E16-F01-US02.** Als Releaseverantwortlicher möchte ich ein nicht umgehbares Qualitätsgate, damit ein grüner Einzelworkflow keinen fehlerhaften Deploy erlaubt.  
**Abnahme:** Ein absichtlich eingeführter High-Severity-Befund gemäß Policy blockiert den Deploy ohne genehmigte, befristete Ausnahme. Typecheck, Tests und erforderliche Fachfreigaben sind als Pflichtchecks hinterlegt.


#### E16-F02 — Öffentlicher Benchmark und unabhängiger Pilotvergleich

**Release 3.0 · P1 · Größe L · Owner: QA + externe SAP-/Fachreviewer**  
**Abhängigkeiten:** E16-F01, E07-F02, E07-F03, E04-F03. **Anlass:** Produkt-/Integrationsausbau.

Ein versionierter Korpus enthält technische Muster, Geschäftsregeln, Standard-Fit/No-Fit, Unsicherheit und erwartete Nachweise. Getrennte Entwicklungs- und zurückgehaltene Fälle verhindern reines Optimieren auf die Demo. Konkurrenzangaben werden nicht ungeprüft als Messwerte übernommen.

**E16-F02-US01.** Als Interessent möchte ich Stärken und Grenzen nachvollziehen, damit ich die Plattform nicht anhand eines einzigen gelungenen Beispiels auswähle.  
**Abnahme:** Ein Referenzbericht nennt Korpus, Versionen, Konfiguration, zugängliche Funktionen, Fehlertypen und Unsicherheiten. Nicht unterstützte Konstrukte erscheinen im Nenner, nicht verschwunden aus der Erfolgsquote.

**E16-F02-US02.** Als Product Owner möchte ich den Entscheidungsnutzen mit Alternativen vergleichen, damit „besser“ eine messbare Aussage wird.  
**Abnahme:** Ein Pilotvergleich nutzt dieselben Fälle, Informationen und überprüfbaren Qualitätskriterien. Reviewer beurteilen fachliche Fehler und Nachweislücken getrennt vom Zeitaufwand; nicht getestete Wettbewerbsmerkmale bleiben ungeprüft.


#### E16-F03 — Lizenz-, Betriebs- und Beschaffungsfähigkeit

**Release 2.10 · P1 · Größe M · Owner: Maintainer + Security + verantwortliche Fachprüfung**  
**Abhängigkeiten:** E08-F02. **Anlass:** CR-30.

Root-Lizenz und Rechte für App, Engine, Daten, Vorlagen und Abhängigkeiten werden eindeutig entschieden. Vorhandene SECURITY-/SBOM-Arbeit wird vervollständigt; Betriebs-/Datenschutzunterlagen, Supportgrenzen und Wiederherstellungsanleitung erhalten einen überprüfbaren Stand.

**E16-F03-US01.** Als Unternehmenskunde möchte ich Nutzungs- und Betriebsbedingungen vor dem Pilot prüfen, damit „frei“ und „Self-Hosted“ keine unklaren Rechte bedeuten.  
**Abnahme:** Die Unterlagen unterscheiden Softwarelizenz, fremde Katalogrechte, Rechenkosten und optionale Dienstleistungen. Aussagen über Datenschutz oder vertragliche Eignung werden fachlich geprüft statt aus Hostingregion abgeleitet.

**E16-F03-US02.** Als zweiter Maintainer möchte ich die Plattform aus der Dokumentation übernehmen, damit ein Ausfall des Hauptentwicklers nicht alle Kunden blockiert.  
**Abnahme:** Eine andere Person führt Build, Deployment, Restore, Secret-Rotation und Releaseprüfung anhand des Runbooks aus. Fehlende Schritte werden geschlossen; kein privater und undokumentierter Schlüssel ist Voraussetzung.


#### E16-F04 — Kuratiertes Lernen, Community und nachvollziehbare Außenwirkung

**Release 3.5 · P2 · Größe M · Owner: Product + Community + Reviewer**  
**Abhängigkeiten:** E16-F02, E12-F04, E15-F04. **Anlass:** Produkt-/Integrationsausbau.

Neue Mappings und Rezepte entstehen aus nachvollziehbaren Fällen mit Prüfprozess. Beiträge, Methodikänderungen, Datenprodukte und datierte Vergleichsseiten werden veröffentlicht. Kundendaten fließen nur nach ausdrücklicher geeigneter Freigabe in öffentliche Beispiele.

**E16-F04-US01.** Als externer Experte möchte ich einen Fehler oder ein Mapping beitragen, damit die Wissensbasis über einen Maintainer hinaus wachsen kann.  
**Abnahme:** Ein Beitrag besitzt reproduzierbaren Fall, Provenienz, Rechteprüfung und unabhängigen Review. Merge ohne passenden Regressionstest oder freigegebene Quelle wird blockiert.

**E16-F04-US02.** Als Kunde möchte ich nachvollziehbare Produktversprechen, damit Marketing nicht mehr behauptet als die Messung trägt.  
**Abnahme:** Vergleichsseiten nennen Datum, Quelle und Teststatus. „Einzige“, pauschale Prozentersparnis und allgemeine Compliance-Zusage erfordern belastbaren Nachweis oder werden nicht veröffentlicht; Projektdaten werden nicht automatisch publiziert.


---

<a id="kapitel-13"></a>

## 13. Qualitätsnachweis, Benchmark und Erfolgskennzahlen

### 13.1 Gemeinsame Definition of Done

Ein Feature ist erst fertig, wenn Fachverhalten, Zugriffsrechte, Revisionstreue und Fehlerfälle geprüft sind; positive und negative Tests existieren; Nutzertexte den tatsächlich erreichten Nachweisgrad nennen; Migration und Rollback beschrieben sind; und betroffene Methoden-/Betriebsunterlagen aktualisiert wurden. Bei SAP-fachlichen Regeln ist ein benannter unabhängiger SAP-Reviewer erforderlich, bei Geschäftsregeln ein fachlich zuständiger Reviewer. Ein allein vom selben LLM erzeugter Code-/Test-/Dokumentationssatz ist kein unabhängiges Testorakel.

Freigabe von neuer Funktionalität darf nicht einfach auf der Anzahl grüner Tests beruhen. Maßgeblich ist, **welche Behauptung geprüft wurde**. Ein Test, der `classicAPI + notToBeReleased → D` erwartet, würde beispielsweise einen hier beanstandeten fachlichen Fehler stabilisieren. Testnamen, erwartete Semantik und externe Regelreferenz müssen daher gemeinsam überprüft werden.

### 13.2 Testpyramide mit wirklichen Grenzen

| Ebene | Was sie prüft | Was sie nicht beweist |
|---|---|---|
| Reine Funktionstests | Parser, Zuordnung, Klassifikation, TCO-Rechnung, Manifest-/Statuslogik. | Browserablauf, Berechtigungen in der echten Datenbank, SAP-Ausführung. |
| Service-/Policytests | Serverseitige Gates, Organisationsrechte, Revisionskonflikte, Idempotenz, Artefaktbindung. | Dass ein erzeugtes RAP-Paket im konkreten SAP-System aktiviert werden kann. |
| Format-/Contract Tests | abapGit-Struktur, BPMN/XML, ATC-/Usage-Import, API-Mapping, unbekannte Versionen. | Vollständigen fachlichen Fit oder dauerhafte Verfügbarkeit eines Drittanbieters. |
| End-to-End-Tests | Sieben Phasen inklusive Rücksprung, Nicht-Code-Wege, Gastfreigabe und Handover. | Fachliche Wahrheit aller LLM-Aussagen oder Produktsicherheit ohne weitere Prüfung. |
| Native Zielsystemtests | SAP-Compile/ATC/ABAP Unit, tatsächlicher CAP-Build und vereinbarte Integration. | Dass eine fachliche Anforderung richtig erhoben wurde oder eine Kontrolle operativ dauerhaft wirkt. |
| Fach-/Security-/Betriebsabnahme | Kritische Regeln, Funktionstrennung, Runner-Isolation, Restore, Übergabe und Betrieb. | Allgemeine Zertifizierung außerhalb des ausdrücklich geprüften Scopes. |

### 13.3 Benchmarkdesign statt Demo-Leaderboard

Der Startkorpus soll vor 3.0 mindestens **50 klar beschriebene Fälle** mit mehreren Assertions je Fall umfassen. Dies ist ein vorgeschlagener Mindestumfang, keine statistische Garantie und kein Nachweis der Abdeckung aller ABAP-Varianten. Die sieben vorhandenen Beispiele und die 32 Reviewproben sind Ausgangsmaterial, aber kein ausreichender Marktbenchmark.

Die Fälle werden nach Risiko geschichtet: released/unreleased APIs; klassische APIs; eigene und SAP-Standardtabellen; dynamische Aufrufe; Includes und OO; Datei/RFC/IDoc/HTTP; Berechtigung/Transaktion; Währung/Einheiten; Jobs und saisonale Nutzung; Standard-Fit/Teil-Fit/No-Fit; Stilllegung; unvollständige Quellen; widersprüchliche Evidenz; bewusst manipulierte oder stale Receipts. Mehrere Zielrelease-/Editionkontexte verhindern Optimierung auf ein einziges Katalogbild.

Ein Teil ist öffentlich als Entwicklungs- und Reproduktionskorpus. Ein zunächst zurückgehaltener Teil wird von unabhängigen Reviewern bewertet und erst nach dem Release veröffentlicht bzw. erneuert. Technische Ground Truth und fachliche Interpretation werden getrennt gepflegt. Dissens zwischen Reviewern wird dokumentiert, nicht durch Mehrheitsgefühl verborgen.

LLM-Läufe werden mit dokumentierten Einstellungen mehrfach wiederholt. Gemessen werden Fehlerverteilung, Abstention und Variation, nicht nur ein bestes Ergebnis. Ein Providerwechsel verändert nicht die deterministische Baseline, kann aber Narrativ, Spezifikation und Testentwurf beeinflussen. Diese Unterschiede gehören in den Bericht.

### 13.4 Konkrete Qualitätsmetriken

| Metrik | Definition | Vorgeschlagenes Gate / Ziel |
|---|---|---|
| Kritische False-Green-Fälle | Nicht ausgeführte, falsche, nicht passende oder stale Evidenz führt zu einer positiven Freigabe. | Null im definierten Release-Abnahmekorpus; jeder Fund blockiert den betroffenen Pfad. Das ist keine Aussage „Fehlerrisiko null“. |
| Finding-Präzision und Recall | Richtige erkannte Findings bzw. erkannte erwartete Findings, nach Konstruktklasse und Zielkontext. | Getrennt ausweisen; kein pauschaler Marktscore. Mindestwerte pro Klasse vor Freigabe mit Reviewern festlegen. |
| Semantische Claim-Unterstützung | Aussage wird inhaltlich von den referenzierten Quellen getragen. | 100% der entscheidungskritischen Aussagen im Pilot sind unterstützt, explizit bestätigt oder als offen gesperrt; Ankerquote allein genügt nicht. |
| Abstention-Qualität | Unzureichende Evidenz führt zu einer richtigen Einschränkung statt erfundener Antwort. | Eigene Unknown-/Widerspruchsfälle müssen den korrekten unvollständigen Status erreichen. |
| Revisionsintegrität | Paket referenziert exakt die geprüften und genehmigten Stände. | Alle Manipulations-, Paralleländerungs- und Invalidierungsfälle im Releasekorpus korrekt behandelt. |
| Entscheidungstreue der Umsetzung | ChangeSet setzt die genehmigte Option und Regeln um. | Kein Profilwechsel oder nicht genehmigter Regelverlust im Abnahmekorpus. |
| Export-/Importtreue | Dateien lassen sich im angegebenen Referenzwerkzeug lesen und semantisch zuordnen. | Mindestens ein erfolgreicher realer Import pro beworbenem Profil; Format-/Versionsgrenzen dokumentiert. |
| Zugriffsschutz | Nicht berechtigte Organisation, Rolle oder Gast gelangt an Daten oder Freigabeaktionen. | Null erfolgreiche verbotene Zugriffe in der definierten Sicherheits- und Berechtigungssuite; unabhängige Prüfung vor Enterprise-GA. |

Durchschnittswerte dürfen seltene kritische Fehler nicht verstecken. Ein einziger unbeabsichtigt stillgelegter Jahresabschlussprozess wiegt fachlich anders als zehn unglücklich formulierte Briefüberschriften. Deshalb werden Schweregrad und Fehlertyp zusammen mit Häufigkeit berichtet.

### 13.5 Produktnutzen und Gegenmetriken

**Leitkennzahl:** Anteil relevanter DecisionCases, die eine verantwortete aktuelle Entscheidung und die für ihre Disposition erforderlichen Umsetzungsnachweise erreichen — ergänzt um Durchlaufzeit und Nacharbeit. Nicht „generierte Codezeilen“, „Anzahl PDFs“ oder „Anzahl grüner Scores“.

| KPI | Baseline heute | Pilotziel / Verwendung |
|---|---|---|
| Zeit bis verständlicher und geprüfter Brief | Im Review nicht gemessen. | Gegen manuelle Aufbereitung messen; keine pauschale Prozentersparnis vor Pilotergebnis. |
| Zeit bis fachliche Entscheidung | Nicht gemessen; organisatorischer Prozess noch nicht durchgängig vorhanden. | Median und obere Verteilung auswerten; technische Bearbeitungszeit von Warten auf Owner trennen. |
| Anteil Entscheidungen ohne spätere sachliche Korrektur | Nicht gemessen. | Gegen Kontrollgruppe bzw. Reviewbaseline beobachten; schnelle Fehlentscheidung zählt nicht als Erfolg. |
| Anteil Rückfragen bei Handover | Nicht gemessen. | Rückfragen nach Ursache erfassen: fehlende Evidenz, Format, Rollen, technisch falscher Stand. |
| Rate wiedereröffneter Fälle | Nicht gemessen. | Sinnvolle Drift-Reaktion von ursprünglicher Fehlentscheidung unterscheiden. |
| Realisierte Effekte | Nicht aus Score ableitbar. | Erst mit Baseline, tatsächlicher Umsetzung und ausreichend langem Messfenster berichten. |
| Betriebskosten pro abgeschlossenem Fall | Nicht gemessen. | Plattform, AI, Support und Reviewaufwand getrennt beobachten; kostenloser Zugang ist nicht kostenfreier Betrieb. |

Vor dem Pilot werden Ziele gemeinsam mit dem Designpartner festgelegt. Ein beispielhaft angestrebter Rückgang manueller Aufbereitungszeit ist eine Hypothese, kein Produktclaim. Bei verbesserter Geschwindigkeit und schlechterer Entscheidungsqualität gilt der Pilot nicht als Erfolg.

### 13.6 So wird „besser als andere Plattformen“ tatsächlich geprüft

Die Vergleichsgruppe besteht aus dem **bestehenden Kundenprozess mit SAP-Werkzeugen**, einer tatsächlich zugänglichen Wettbewerbsplattform und Clean-Core.io. Alle erhalten denselben legal verwendbaren Fallbestand, Zielkontext, Nutzungsdaten und Regeln. Der unterstützte Funktionsumfang und erforderliche manuelle Zusatzarbeit werden offen dokumentiert; ein nicht vorhandener Kundenzugang wird nicht als Produktmangel des Wettbewerbers gewertet.

Die Bewertung erfolgt anhand identischer Aufgaben: Geschäftslogik erklären, Standardalternativen begründen, Unsicherheit benennen, entscheidungsfähige Vorlage erstellen, Freigabe belegen und Übergabe prüfen. Menschlicher Aufwand, Fehler, Rückfragen, Kosten und Revisionsnachvollziehbarkeit werden getrennt erfasst. Wo möglich, sehen fachliche Reviewer zunächst anonymisierte Ergebnisse, um Markenpräferenzen zu reduzieren.

Öffentliche Ergebnisse dürfen nur die tatsächlich geprüften Versionen und Aufgaben vergleichen. Clean-Core.io kann beispielsweise bei einfacher unabhängiger Nachweisprüfung gewinnen, ohne bei nativer Systemanalyse, automatischen Fixes oder großen Migrationsprogrammen besser zu sein. Das ist eine stärkere Positionierung als eine nicht belegbare Gesamtsiegerbehauptung.

---

<a id="kapitel-14"></a>

## 14. Kapazität, Abhängigkeiten und erste 90 Tage

### 14.1 Aufwandsmodell — Planungsannahme, keine Lieferzusage

Die folgende Schätzung ist eine **eigene grobe Kapazitätsannahme** auf Basis des erkennbaren Wiederverwendungspotenzials und des vorgeschlagenen begrenzten Scopes. Sie ist weder durch Team-Velocity noch durch technische Integrationsspikes validiert. Eine Personenwoche bedeutet fünf produktive Personentage über die benötigten Kompetenzen; Kalenderwartezeit für Kunden, SSO, Verträge oder SAP-Systemzugang ist darin nicht automatisch enthalten.

| Release | Netto-Personenwochen, grobe Bandbreite | Größter Unsicherheitsfaktor |
|---|---:|---|
| 2.9 | 8–14 | Anzahl voneinander abhängiger Hotfixes; Ausführung zunächst deaktivieren oder früh isolieren. |
| 2.10 | 12–20 | Revisionsmigration, Gate Engine, SourceBundle und Katalogvertrag. |
| 2.11 | 14–22 | Fachliche Reviewkapazität, reale Standard-/Nutzungsdaten, Claimqualität. |
| 3.0 | 18–28 | Native SAP-Prüfumgebung, private Betriebsvariante, SSO und unabhängige Abnahme. |
| **Bis 3.0 gesamt** | **52–84** | Nur bei konsequent begrenzten Profilen und tatsächlicher Wiederverwendung. |
| 3.1 | 12–20 | Portfoliomodell und reale Abhängigkeits-/Planungsfälle. |
| 3.2 | 10–18 | Verfügbarkeit stabiler, erlaubter Kunden- und Anbieterformate. |
| 3.3 | 10–18 | Qualität unabhängiger fachlicher Testorakel und Driftbewertung. |
| 3.4 | 10–18 | Private Landschaften und begrenzte neue Daten-/Integrationsmuster. |
| 3.5 | 12–22 | Verwertbare Ist-Daten und ausreichend lange Beobachtungsfenster. |
| **3.1–3.5 zusätzlich** | **54–96** | Wird nach 3.0 anhand tatsächlicher Nutzung neu geschätzt. |
| **Gesamt bis 3.5** | **106–180** | Vor zusätzlicher Risiko-/Betriebsreserve. |

Für initiale Planung sollte beispielsweise eine **30%-Reserve** auf die Nettoarbeit berücksichtigt werden. Daraus ergeben sich rund **68–109 Personenwochen bis 3.0** und **138–234 Personenwochen bis 3.5**. Diese Reserve ersetzt keine explizite Berücksichtigung von Wartezeiten oder einer späteren Scope-Erweiterung.

Rechenregel: `Kalenderwochen ≈ reservierte Personenwochen / tatsächlich verfügbare produktive Personenwochen je Woche + nicht parallelisierbare Wartezeiten`. Bei effektiv zwei produktiven Personenwochen pro Woche entspräche allein die 3.0-Arbeit rechnerisch etwa 34–55 Wochen; bei einer entsprechend 68–109 Wochen. Das sind Szenarien, keine versprochenen Termine. Eine einzelne Person kann nicht zugleich Entwicklung, unabhängigen Fachreview, Security-Abnahme und Kundenentscheidungen ersetzen.

### 14.2 Empfohlenes Besetzungsmodell

Ein fokussiertes Kernteam benötigt mindestens produktverantwortliche Kompetenz, starke TypeScript-/Backend-Entwicklung und SAP-/ABAP-Cloud-Kompetenz. QA, Security/Platform und funktionaler Fachreview müssen verbindlich verfügbar sein; für Geschäftsfälle kommen echte Business Owner und für Economics Controlling hinzu. Personen können mehrere Rollen ausfüllen, aber unabhängige Freigaben dürfen nicht nur auf dem Papier bestehen.

Für eine Solo-Maintainer-Situation sollte 3.0 auf den Evidence-/Decision-Kern mit Import fremder Implementierungen reduziert werden. Ein voll eigener CAP- und RAP-Generator ist dann nicht der zuerst zu finanzierende Engpass. Zuerst Korrektheit, Source-/Decision-Bindung und ein nativer Prüfimport; breitere Generierung bleibt hinter Featureflags oder entfällt zugunsten externer Werkzeuge.

### 14.3 Kritischer Pfad

Der technische Hauptpfad lautet **Methodik und Sicherheitsbremsen → immutable Quellen/Artefakte → Claims und Regeln → Optionen/Fit-Gap → verifizierte Freigaben → echte zielgebundene Tests → Controlled Handover**. Parallel kann das Nutzungsmodell korrigiert und ein kleiner fachlicher Pilot vorbereitet werden.

Der oft unterschätzte externe Pfad lautet **Designpartner → erlaubte Beispieldaten → Zielsystem-/Testzugang → fachliche Reviewer → vereinbarte Abnahmekriterien**. Ohne diesen Pfad kann das Team viele Oberflächen bauen, aber nicht seriös die 3.0-Exit-Kriterien erreichen. Ein weiterer MCP-Connector behebt keinen fehlenden SAP-Testtenant.

### 14.4 Arbeitsprogramm für die ersten 90 Tage

| Zeitraum ab Projektstart | Konkrete Arbeit | Nachweis am Ende | Stop-/Scope-Regel |
|---|---|---|---|
| Tag 1–15 | Befunde triagieren; falsche Test-/Delivery-Claims und TCO-Ausgaben korrigieren/sperren; Router-Zwang entfernen; unsichere Ausführung deaktivieren; Regressionen aus Reviewprobes erstellen. | Reproduzierbare Vorher-/Nachherfälle, veröffentlichte Grenzen, keine unberechtigten Grünsignale in den betroffenen Pfaden. | Keine neue AI-/Exportfunktion vor Absicherung dieser Risiken. |
| Tag 16–30 | Zwei Pilotprozessfamilien und Reviewer auswählen; TargetContext, SourceBundle und Artefaktvertrag entwerfen; echte Importdateien und Testzugänge beschaffen. | Bestätigter minimaler Pilotumfang, versionierte Schemata, erste Formatfixtures und dokumentierte Zugangslücken. | Ohne echten Zugang keine Behauptung eines validierten SAP-Exports oder Builds. |
| Tag 31–60 | Einen vertikalen Fall durch neue Revisionslogik, Claims, Optionen und manuelle Entscheidung führen; Usage-Semantik ergänzen; Legacy-Migration testen. | Ein nachvollziehbarer Fall mit neuer Quelle, veralteter Freigabe, korrekter Invalidierung und erneutem Review. | Keine flächendeckende UI-Umschreibung; nur ein durchgängiger Pfad zuerst. |
| Tag 61–90 | Ersten Native-Testreceipt, Manifestprüfung und fachlichen Review verbinden; Nicht-Code-Pfad durchspielen; fehlende Aufwandstreiber neu schätzen. | Demonstrierbare Kette Source → Entscheidung → Änderung/Plan → echter Nachweis → Review Pack; belastbare Liste noch fehlender 3.0-Gates. | Kein Enterprise-GA nur wegen erfolgreicher Demo; verbleibende Gates entscheiden über nächsten Scope. |

Dieses 90-Tage-Programm setzt verfügbare Kernkapazität und rechtzeitige Pilotzugänge voraus. Es ist keine Behauptung, dass der gesamte 3.0-Scope in 90 Tagen ausgeliefert werden kann.

### 14.5 Nach jedem Gate erneut priorisieren

Featurefortschritt ist nachrangig gegenüber der Frage, ob Nutzer tatsächlich weniger unklare Entscheidungen haben. Wenn Business Owner die Briefs nicht verstehen, wird die Sprache und fachliche Modellierung verbessert, bevor Portfolio-Heatmaps entstehen. Wenn Standardmatching zu viele falsche Kandidaten liefert, wird der Korpus verkleinert und kuratiert, statt Recall durch mehr unkontrolliertes Scraping zu erhöhen. Wenn Kunden native Generatoren bevorzugen, wird der Import dieser Outputs wichtiger als eine eigene fünfte Generierungsvariante.

---

<a id="kapitel-15"></a>

## 15. Risiken, Nachhaltigkeit und bewusste Nicht-Ziele

### 15.1 Wesentliche Produktrisiken

| Risiko | Frühwarnsignal | Gegenmaßnahme / Verantwortliche |
|---|---|---|
| SAP oder ein Wettbewerber deckt den eigenen Mehrwert bereits hinreichend ab. | Pilotteams sehen keinen Nutzen über LeanIX/SAP-Agenten/Partnerwerkzeug hinaus. | Gegen reale Arbeitsabläufe messen; code-/evidenzspezifische Verbindung fokussieren; Product Owner entscheidet über Vertiefung oder Scope-Cut. |
| Quellenbindung erzeugt nur scheinbare Wahrheit. | Viele Claims haben Anker, werden aber fachlich korrigiert. | Semantische Reviewmetriken, unabhängige Testorakel, Unknown-Status; AI-/Fachreviewer. |
| Fachliche Owner beteiligen sich nicht. | Requests bleiben unbeantwortet, Entwickler bestätigen stellvertretend. | Entscheidungseinheiten verkleinern, Brief vereinfachen, Owner im Programm mandatieren; PMO/Business Sponsor. |
| Enterprise-Freigabe scheitert an Betrieb oder Datenfluss. | Kunden verweigern Upload, Identityintegration oder Tenantcredentials. | Import-/Metadatenmodus, minimaler Privatbetrieb, keine Credentials im generierten Code; Security/Platform. |
| Öffentlich sichtbare Kataloge sind nicht zuverlässig als Bulkquelle nutzbar. | Login-, URL-, Format- oder Rechteänderungen. | IDs/Links und rechtlich geprüfte Metadaten, kuratierte kleine Muster, Quellenadapter; Data/Product. |
| Solo-Kapazität wird durch Featurebreite überlastet. | Viele halbfertige Export-/Providerpfade, fehlende Abnahme. | Gateorientierter Scope, zweite Wartungskompetenz, native Werkzeuge integrieren; Maintainer/Product. |
| Falsch-positive Stilllegung oder Kontrollverlust. | Kurze Usage-Fenster, unbestätigte Prozessrollen, unbekannte Aufrufer. | Saisonalität, Dependencyreview, Business-/Kontrollfreigabe, Rollback; Owner/QA. |
| Ein kostenloser SaaS-Betrieb wird wirtschaftlich instabil. | Hohe AI-/Supportkosten pro Fall, Nutzung ohne Budgetdeckel. | BYOK, transparente Verbrauchsgrenzen, privater Betrieb, Sponsoring und klar abgegrenzte Dienstleistungen; Betreiber. |
| Der Benchmark wird auf eigene Lieblingsfälle optimiert. | Hohe Demowerte, viele Fehler bei neuen Pilotfällen. | Zurückgehaltene Fälle, unabhängige Reviewer, Fehlerberichte nach Konstruktklasse; QA. |
| „Closed“ wird trotz fehlender Umsetzungswirkung gemeldet. | Abschluss folgt Ticket- oder Downloadstatus statt Betriebsnachweis. | Getrennte Zustände und echte Receipts; Closure-Stichproben; PMO/Operations. |

### 15.2 Nachhaltigkeit ohne verdeckte Feature-Gates

Die freie Produktnutzung aus der bisherigen Roadmap kann beibehalten werden. Sie ist aber ein Finanzierungsprinzip, kein Beleg, dass Infrastruktur und qualifizierter Support kostenlos sind. Quoten müssen nach tatsächlichem Verbrauch erklärbar sein. BYOK verlagert einen Teil der Modellkosten, nicht Storage, Betrieb, Security und Kundensupport.

Sponsoring, Unterstützung bei privatem Deployment, Integration, Schulung und vertraglich abgegrenzte Betriebsleistungen sind mögliche Finanzierungswege. Kernfunktionen sollten dabei nicht künstlich in eine unbenutzbare freie Version und eine allein sichere Bezahlversion geteilt werden. Sicherheitskorrekturen, Export der eigenen Daten und nachvollziehbare Formate gehören in jeden nutzbaren Betriebsweg.

Der wichtigste Nachhaltigkeitsnachweis ist nicht ein Sponsorenlogo, sondern dass eine zweite Person einen Release, Restore und Incident-Prozess ausführen kann. Öffentliche Methoden, klare Lizenzen und portable Artefakte reduzieren die Abhängigkeit der Kunden vom Fortbestand eines einzigen gehosteten Dienstes.

### 15.3 Bewusste Nicht-Ziele bis 3.5

Clean-Core.io ersetzt weder ATC/ADT noch SAPs native Compile-/Transportkontrollen. Es wird kein allgemeines ERP-Prozessmining, keine vollständige LeanIX-Alternative, kein universelles Data-Governance-System und keine autonome Maschine für ungeprüfte Produktionsänderungen. Massenremediation über beliebige ABAP-Bestände ist kein glaubwürdiges kurzfristiges Leistungsversprechen.

Nicht jede SAP-Objektseite benötigt automatisch generierten SEO-Text. Nicht jede weitere AI-API schafft zusätzlichen Kundennutzen. Nicht jede fachliche Unklarheit soll mit mehr Prompttext beantwortet werden. **Eine begrenzte, nachweislich korrekte Entscheidungskette ist wertvoller als eine breite Plattform, deren grüne Ergebnisse niemand verantwortlich verwenden kann.**

---

<a id="kapitel-16"></a>

## 16. Glossar

| Begriff | Bedeutung in dieser Roadmap |
|---|---|
| ABAP Cloud | SAP-Entwicklungsmodell mit passender Sprachversion und freigegebenen Entwicklungsobjekten; nicht identisch mit „Code läuft irgendwo in einer Cloud“. |
| ATC | ABAP Test Cockpit; reale Prüfung unter konkreten Varianten und Systemvoraussetzungen. |
| RAP | ABAP RESTful Application Programming Model; ein möglicher Zielansatz für passende ABAP-Cloud-Anwendungen, nicht jede ABAP-Anpassung. |
| CAP | SAP Cloud Application Programming Model; in der Roadmap zunächst ein begrenztes Node-Zielprofil. |
| Clean-Core-Level A–D | Technische Einordnung gemäß SAP-Kontext; zu trennen von Business-Kritikalität, individueller API-Freigabe und internem Score. |
| Claim / Evidence | Prüffähige Aussage / zugehöriger Nachweis mit Herkunft, Scope und Zeitbezug. |
| DecisionCase | Fachlicher Entscheidungsfall über einen Ablauf oder eine Fähigkeit, gegebenenfalls mit mehreren technischen Objekten. |
| SourceBundle | Unveränderlicher, identifizierter Bestand eingelesener Quellen samt Vollständigkeitsangaben. |
| TargetContext | Konkreter Zielkontext aus Produkt, Edition, Release und relevanten technischen/organisatorischen Voraussetzungen. |
| Attestation | Einer überprüfbaren Identität und Rolle zugeordnete Bestätigung einer bestimmten Revision für einen bestimmten Zweck. |
| Receipt | Strukturierter Nachweis einer tatsächlich ausgeführten Prüfung oder Umsetzung; enthält Prüfumfang und Ergebnis. |
| Manifest | Inhaltsverzeichnis mit Digests, Revisionen, Herkunft und Status aller Bestandteile eines Pakets. |
| Digest / Hash | Inhaltsfingerabdruck; dient der Integritätsprüfung, beweist für sich allein aber weder fachliche Richtigkeit noch Urheberschaft. |
| Artifact-DAG | Gerichteter Abhängigkeitsgraph zwischen Artefaktrevisionen; Grundlage gezielter Invalidierung. |
| Stale | Inhalt existiert, ist wegen geänderter Voraussetzungen aber kein aktueller Nachweis mehr. |
| Fit-to-Standard | Fachlicher Vergleich zwischen tatsächlichem Bedarf und verfügbarer Standardfunktion einschließlich Voraussetzungen und Lücken. |
| BYOK / Zero-LLM | Kundeneigener Modellzugang / Bearbeitung ohne Modellaufrufe. Keines von beiden garantiert allein Datenschutz oder vollständige Offline-Fähigkeit. |
| Review Pack / Controlled Handover | Vorläufige Sammlung mit offenen Punkten / kontrolliert freigegebenes Übergabepaket mit passenden Nachweisen. |
| Closure | Nachvollziehbarer fachlich-technischer Abschluss nach tatsächlicher Umsetzung, nicht bloßer Export. |
| False Green | Positiver Status, obwohl die behauptete Eigenschaft nicht hinreichend geprüft oder nicht erfüllt ist. |

Die SAP-Begriffe sind im Kontext der Primärquellen S01–S07 zu lesen; die übrigen Begriffe definieren das hier vorgeschlagene Produktmodell.

---

<a id="kapitel-17"></a>

## 17. Quellenregister und Reproduzierbarkeit

### 17.1 Primäre Projektquellen

**C — bereitgestellter Quellcode-Snapshot.** `clean-core-src-v2.8.5-0455ce2.zip`; SHA-256 `8b31316f7749babe04820c3579d22e10a3557b2ed810305eb8fd1620a6d47138`. Die Pfade und Zeilen im Befundregister beziehen sich auf dieses Archiv. Der Dateiname enthält einen kurzen Commit-ähnlichen Bestandteil; eine Zuordnung zum vollständigen aktuellen öffentlichen Repository-Commit wurde nicht als Prüfvoraussetzung angenommen. Es wurden keine Änderungen in das Benutzerrepository oder in die Produktion geschrieben.

**R01 — bisherige Roadmap.** `clean-core-io-roadmap.md`, Titel „Clean-Core.io — Business Bridge & Roadmap bis Version3.0“, Stand1.September2026. SHA-256 `46bfca50fef010754d3b3cbbefcfcc87fb9a2930b36baa7638c262645d86ccdd`. Relevante Abschnitte:0 Positionierung/Alleinstellungsclaims;1 SAP-/Domänenannahmen;2 Business-Seite/Wettbewerb;3 Zielarchitektur;4 Epics;5 Releaseplan;6 KPIs. Die neue Roadmap übernimmt diese Aussagen nicht ungeprüft. Der dort erwähnte separate130-Ticket-Audit lag nicht als eigenständiger vollständiger Auditbericht vor.

**P01–P32 — eigene isolierte Verhaltensproben.** Die Skripte laden Originalfunktionen des Snapshots bzw. extrahieren den originalen TAP-Parser und TCO-Callback über den TypeScript-AST. Ausgaben, Beschreibungen und erwartete Beobachtungen stehen in `review-probes.results.json`. Der öffentliche Starterkorpus im Snapshot wurde zusätzlich durch Evidence-Engine und Router ausgeführt. Positive Kontrollen und bestätigte Defekte sind gemeinsam enthalten; die Zahl32 darf nicht als Produktqualitätsquote verwendet werden.

### 17.2 Externe Primärquellen

**Abruf-/Prüfdatum aller folgenden Quellen: 8. September 2026.** Veröffentlichungsdaten sind dort genannt, wo sie für Aktualität relevant oder eindeutig verfügbar sind. SAP-Lern-/Hilfeseiten und Entwicklerdokumentationen werden als Primärreferenzen genutzt. SAP-Partnerlistings und Anbieterankündigungen beschreiben Leistungsansprüche, nicht von diesem Review gemessene Qualität. Bei dynamischen Help-Seiten waren teilweise nur indexierter Auszug und Seitentitel zugänglich; daraus wurde kein bestätigter kundenspezifischer Schnittstellenvertrag abgeleitet.

**S01 — SAP Learning: Extensibility Model Best Practices.** Methodik der Levels und Einordnung klassischer Techniken; Grundlage der Gegenprüfung von Klassifikation und Dynpro-Pauschalisierung.  
`https://learning.sap.com/courses/practicing-clean-core-extensibility-for-sap-s-4hana-cloud/explaining-extensibility-model-best-practices_e290f382-800e-40ef-a203-85a13115f487`

**S02 — SAP Learning: Setting Up ABAP Cloud / Clean-Core-Prüfkontext.** Ergänzende Lernseite mit Einordnung der Usage-of-APIs-Ergebnisse; nicht als universelle Mappingregel für beliebige ATC-Checks verwendet.  
`https://learning.sap.com/courses/practicing-clean-core-extensibility-for-sap-s-4hana-cloud/creating-tier-2-cloud-apis_a75bf2cd-815c-42bb-8d3b-2bba4931ecad`

**S03 — SAP Help: RAP Persistent Table / Using Table Entities as Active Persistence.** RAP-Persistenz als Gegenbeleg zur pauschalen Aussage, eigene Tabellen erforderten CAP. Spezifische Zielreleasevoraussetzungen sind je Projekt zu prüfen.  
`https://help.sap.com/docs/abap-cloud/abap-keyword/rap-persistent-table`  
`https://help.sap.com/docs/abap-cloud/abap-rap/using-table-entities-as-active-persistence`

**S04 — SAP News Center: SAP Business AI, Release Highlights Q2 2026,20. Juli 2026.** SAP benennt Custom Code Migration Agent und AI-assisted Enterprise Architecture Decision Management in LeanIX als allgemein verfügbar. Die Quelle trennt andere Early-Adopter-Angebote davon; diese wurden nicht pauschal zu GA erklärt.  
`https://news.sap.com/2026/07/sap-business-ai-release-highlights-q2-2026/`

**S05 — SAP Cloudification Repository.** Offizielle Release-/Klassifikationsdateien und Versionsbezug. Ein späterer Repositorystand ist nicht identisch mit den im Review gepinnten Katalogdaten.  
`https://github.com/SAP/abap-atc-cr-cv-s4hc`

**S06 — SAP Help: Custom Code Migration Agent / ABAP-AI Availability.** Ergänzender Dokumentationskontext; insbesondere kein Nachweis, dass jedes Kundensystem identische Funktionen, Berechtigungen und Exporte besitzt. Dynamische Seiteninhalte waren nur eingeschränkt auslesbar. Die GA-Aussage stützt sich auf S04.  
`https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/custom-code-migration-agent-1`  
`https://help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud/availability`

**S07 — SAP Project Kernseife, Repository und Wiki.** Öffentliches Projekt mit ABAP-/BTP-Bestandteilen und Klassifikations-/Messkontext; konkrete Importverträge sind an Version und realem Export zu prüfen.  
`https://github.com/SAP/project-kernseife`  
`https://github.com/SAP/project-kernseife/wiki`

**S08 — SAP-Partnerlisting: Nova Intelligence, Agentic AI Platform for SAP Solutions.** Beleg für öffentlich angebotene Plattformfunktionen wie Dokumentation und Fit-to-Standard; kein unabhängiger Leistungstest.  
`https://www.sap.com/products/business-transformation-management/partners/nova-ai-software-inc-nova-intelligence-agentic-ai-platform-for-sap-solutions.html`

**S09 — SAP-Partnerlisting: Lemongrass LCP AI Accelerator for Clean Core.** Beschreibt unter anderem funktionale Dokumentation, Abhängigkeiten, Dispositionen und Bezug zu bestehenden SAP-Werkzeugen. Marketingkennzahlen wurden nicht als eigene Messung übernommen.  
`https://www.sap.com/products/artificial-intelligence/partners/lemongrass-consulting-us-inc-lcp-ai-accelerator-for-clean-core.html`

**S10 — AWS for SAP Blog: Accelerate your SAP Clean Core journey with Kiro agents,23. April 2026, sowie Beispielrepository.** Beleg eines öffentlich beschriebenen Agenten-/Open-Source-Ansatzes, nicht Beweis universeller Ausführungsqualität oder gleicher Kundenzugänge.  
`https://aws.amazon.com/blogs/awsforsap/accelerate-your-sap-clean-core-journey-with-kiro-agents/`  
`https://github.com/aws-solutions-library-samples/guidance-for-accelerating-sap-clean-core-journey-using-kiro-agents`

**S11 — smartShift: SAP Clean Core Analysis.** Anbieterpositionierung einschließlich Analyse-Einstieg; keine eigene Überprüfung der beworbenen Remediationsleistung.  
`https://smartshift.com/solution/sap-clean-core-analysis`

**S12 — Panaya: Agentic Code Correction, Pressemitteilung 4. August 2026.** Aktuelle Anbieterankündigung zu Codekorrektur, Clean-Core-Dispositionen und Testbezug. Aussagen über Prozentsätze oder Risikobeseitigung wurden nicht als bewiesen übernommen.  
`https://www.panaya.com/press/panaya-slashes-sap-custom-code-workload-with-agentic-code-correction/`

**S13 — Node.js22: Permissions.** Offizielle Einschränkung des Permission-Modells bei nicht vertrauenswürdigem bzw. bösartigem Code. Basis der Architektur-Risikobewertung, kein im Review durchgeführter Sandbox-Escape.  
`https://nodejs.org/docs/latest-v22.x/api/permissions.html`

**S14 — abapGit Documentation: .abapgit.xml.** Offizielle Repository-Konfigurationsdatei und Strukturhinweise; Grundlage des Exportbefunds. Ein echter SAP-Import des gelieferten Exports wurde nicht ausgeführt.  
`https://docs.abapgit.org/user-guide/repo-settings/dot-abapgit.html`

**S15 — SAP Cloud ALM APIs: Überblick, Task API, Operations APIs.** Ausgangspunkte für begrenzte Adapter; daraus folgt kein generischer Schreibvertrag für native RISE-Clean-Core-KPIs.  
`https://help.sap.com/docs/cloud-alm/apis/about`  
`https://help.sap.com/docs/cloud-alm/apis/task-api`  
`https://support.sap.com/en/alm/sap-cloud-alm/operations/expert-portal/calm-apis-for-operations.html`

**S16 — SAP Samples: Cloud ALM API Examples.** Offizielles Beispielrepository zur technischen Machbarkeitsprüfung autorisierter Cloud-ALM-Anwendungsfälle.  
`https://github.com/SAP-samples/cloud-alm-api-examples`

**S17 — SAP Learning / Help: Fiori Apps Reference Library und Anwendungstypen.** App-, Produkt- und Releasekontext als Kataloggrundlage; ein Katalogtreffer ersetzt keinen fachlichen Fit-Gap-Test.  
`https://learning.sap.com/courses/technical-implementation-and-operation-i-of-sap-s-4hana-and-sap-business-suite/explaining-application-types`  
`https://help.sap.com/docs/SAP%20Fiori%20Apps%20Reference%20Library/187a50cf8191418ab7b52505fcef1789/5a8c8240cd43410ea3e3ea6cb901dab7.html`

**S18 — SAP Process Navigator: Overview und Zugangshinweise.** Referenz für Best-Practice-/Prozessquellen; Kundenzugang, Edition und Länderumfang bleiben relevant.  
`https://help.sap.com/docs/cloud-alm/getting-started-process-navigator/overview`  
`https://userapps.support.sap.com/sap/support/knowledge/en/3643926`

**S19 — SAP LeanIX: Integration API / APIs.** Öffentliche API-Dokumentation als Grundlage kundenspezifischer Adapter; kein Nachweis automatisch passender Fact-Sheet- oder Entscheidungsdatenmodelle.  
`https://help.sap.com/docs/leanix/ea/integration-api`  
`https://help.sap.com/docs/leanix/ea/sap-leanix-apis`

**S20 — Fiori Apps Reference Library: offizieller Umzugshinweis und neue Startseite.** Am Abrufdatum verweist die klassische Bibliothek auf `fal.cloud.sap`. Der aufgerufene App-Link dient hier ausschließlich als Nachweis des Umzugsbanners, nicht als behaupteter Standardersatz im Beispiel.  
`https://fioriappslibrary.hana.ondemand.com/sap/fix/externalViewer/?appId=F3192`  
`https://fal.cloud.sap/`

**S21 — Clean-Core.io, öffentliche Produktseiten.** Ergänzender Kontext aus Website, Trust-, Whitepaper- und Nutzungsbedingungen-Seiten. Authentifizierte Produktion und Identität des deployed Builds mit dem ZIP wurden nicht geprüft. Implementierungsbefunde in diesem Dokument stützen sich auf C, nicht allein auf Marketingtexte.  
`https://clean-core.io/`  
`https://clean-core.io/trust`  
`https://clean-core.io/whitepaper`  
`https://clean-core.io/terms`

### 17.3 Mitgeliefertes Evidence-Paket

Das begleitende ZIP enthält `README.md`, den portablen TypeScript-Loader, `review-probes.cjs`, die tatsächliche Ergebnisdatei, eine kompakte Ergebnisübersicht, das Inventar, den gescheiterten npm-Installationslog, ein Befundregister mit Quellpfaden/-zeilen, die maschinenlesbare Backlogstruktur und deren Validierungsbericht. Es enthält weder ein vollständiges zweites Source-Archiv noch Kundenzugangsdaten oder einen Produktionsschlüssel.

Für Wiederholung wird das vom Nutzer gelieferte Source-Archiv separat benötigt. Die Skripte laufen ohne Anwendungspakete, verwenden aber einen TypeScript-Compiler und Node22. Sie sind ausdrücklich **keine Sandbox für beliebige fremde Repositorys**: Der Loader führt die importierten Originalmodule aus und ist nur für diesen bekannten Review-Snapshot vorgesehen. Er greift nicht auf SAP-Systeme, Cloudkonten oder die Produktion zu.

Die Reproduktionsanleitung erklärt den Compilerpfad und den erwarteten Ausgang. Nach einer Produktkorrektur sollen einige alte Beobachtungsproben gerade **nicht** mehr bestätigt sein. Für reguläre Produktregressionen sind die Erwartungen auf das fachlich korrekte Zielverhalten umzustellen; das ist Feature E16-F01.

### 17.4 Offene Prüfschritte vor einer tatsächlichen Enterprise-Freigabe

Vollständige Installation und Build; reguläre Tests inklusive Firebase-Regel-/Emulator- und Browsertests; realer SAP-Import/Compile/ATC/ABAP-Unit-Lauf; überprüfter CAP-Build; authentifizierter Sieben-Phasen-Test; unabhängige Runner-/Berechtigungssicherheitsprüfung; Last-/Kostenmessung; rechts-/vertragsbezogene Prüfung der Daten- und Softwarequellen; fachlicher Pilot mit verantwortlichen Business Ownern. Diese Aufgaben sind in der Roadmap verankert, aber durch dieses Review nicht bereits erledigt.

---

### 17.5 Auflösung verkürzter Codepfade

Die Bezeichnungen „Analyze-/Design-/Transformation-/Documentation-/Testing-/TCO-/Delivery-Seite“ im Befundregister meinen jeweils `app/(app)/project/[projectId]/<phase>/page.tsx`, wobei `<phase>` durch `analyze`, `design`, `transformation`, `documentation`, `testing`, `tco` oder `delivery` ersetzt wird.

Die in Codebefunden verkürzt genannten Dateien `abcd-classification.ts`, `extensibility-router.ts`, `catalog-service.ts`, `code-assessment.ts`, `evidence-model.ts`, `usage-parser.ts`, `usage-join.ts` und `result-diff.ts` liegen unter `lib/abap/`. `run-signature.ts`, `audit-pack.ts`, `project-loader.ts` und `workflow-steps.ts` liegen unter `lib/`. `runs/create/route.ts` und `audit-pack/create/route.ts` liegen unter `app/api/`. Zeilennummern können nach Produktänderungen abweichen; maßgeblich ist der oben genannte Archivhash.

---

## Schlussentscheidung

**Die nächste Investition sollte nicht „mehr Plattform“ heißen, sondern „weniger unbewiesene Aussagen und ein vollständig nachvollziehbarer Entscheidungsfall“.** Clean-Core.io gewinnt nur dann dauerhaft an Wettbewerbsfähigkeit, wenn seine Ergebnisse auch nach kritischen Rückfragen, einem neuen Quellstand, einem anderen SAP-Release und einer fachlichen Änderung belastbar bleiben.

V 3.0 ist der überprüfbare End-to-End-Beweis dafür. V 3.5 ist die Fähigkeit, diesen Beweis über ein ganzes Modernisierungsprogramm und dessen Betriebswirklichkeit hinweg aktuell zu halten.
