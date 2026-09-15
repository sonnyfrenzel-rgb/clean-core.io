# ID-Brücke: Review 08.09. ↔ Roadmap 2.7 ↔ Befundregister

**Stand 12.09.2026 · Anhang zu [`ROADMAP-2.7.md`](ROADMAP-2.7.md)**

`CHANGELOG.md` und `docs/BACKLOG.md` zitieren `CR-11`, `E01-F01-US02`, `E07-F01`.
Die Roadmap spricht `UX-E01-F02:R1`. Ohne diese Tabelle ist ein Eintrag von
gestern morgen nicht mehr auffindbar — die alten IDs werden **nicht** umbenannt,
sie werden gebrückt.

---

## 1. Feature-Brücke — neu ← alt

Die Herkunftsangaben stammen aus den `**Herkunft.**`-Zeilen der Backlog-Langfassung.
`E…` = Epics des Reviews vom 08.09., `SR-…` = dessen Sofortmaßnahmen/Empfehlungen,
`W-…`/`QA24-…` = Abnahmen der Fassung 2.4, `Audit` = Site-Befund vom 01.09.

| Roadmap 2.7 | Kurz | Herkunft |
|---|---|---|
| `UX-E01-F01` | Code-zentrierter Einstieg | E01-F01, SR-E09 |
| `UX-E01-F02` | Gemeinsamer Arbeitsraum, View-Wechsel | E01-F01, E04-F02 |
| `UX-E01-F03` | Views, Layer, semantisches Zoom | E04-F02, E09-F03 |
| `UX-E01-F04` | **Spielwiese: virtuelle Rollen, Spielfälle** | Rahmenkorrektur 2.7; W-01, W-09 |
| `UX-E02-F01` | DecisionCase, Referenzen, Revisionsmanifest | E01-F04, E03-F03, SR-E09 |
| `UX-E02-F02` | Einstieg ohne Code | E03-F01, E04-F02 |
| `UX-E02-F03` | Scope- und Nutzungs-Blindspots | E03-F02, E03-F04, SR-E04 |
| `UX-E03-F01` | Anforderungen mit Herkunft und Anker | E04-F01, E04-F03, SR-F07 |
| `UX-E03-F02` | Beibehalten / ändern / entfallen | E04-F03, SR-F08 |
| `UX-E03-F03` | Prozess-, Regel- und Kurzbriefsicht | E04-F02, E04-F04, SR-F08 |
| `UX-E04-F01` | Abdeckungsbehauptung mit Evidenzstufe | E05-F02, E02-F02, SR-F04 |
| `UX-E04-F02` | Kleine Standard-Gegenprobe | E05-F02, E05-F04, E07-F04 |
| `UX-E04-F03` | Belegablage, begrenzte Wiederverwendung | E02-F03, E05-F02, E16-F04 |
| `UX-E05-F01` | Threads am Anker | E05-F03, SR-F08, SR-F13 |
| `UX-E05-F02` | Optionsentscheidung mit TCO-Simulation | E05-F01, E12-F02, SR-F11/F12 |
| `UX-E05-F03` | Mandatierte Entscheidung, Decision Request | E05-F03, E13-F01, SR-F13; Business-Bridge F5.3 |
| `UX-E06-F01` | Sieben Fähigkeiten, ein Arbeitsraum | E01-F03, E10-F03, SR-F18 |
| `UX-E06-F02` | Living Documentation | E09-F01, E09-F03, SR-F07 |
| `UX-E06-F03` | Nächster Beitrag mit Grund | E01-F01, E01-F03, SR-E09 |
| `UX-E07-F01` | ArchitectureContract als Generatorinput | E06-F01, SR-F05/F06 |
| `UX-E07-F02` | Prozessdelta und technische Schichten | E06-F01, E09-F01, SR-E03 |
| `UX-E07-F03` | Gezielte Invalidierung, Wiederprüfung | E01-F02, E15-F01, SR-F17 |
| `UX-E08-F01` | Szenario aus Zielbedarf | E07-F04, SR-F07 |
| `UX-E08-F02` | Test-/Demo-Receipt | E07-F01/F02/F03, SR-F09/F10 |
| `UX-E08-F03` | Explore-Reife ≠ Abnahme ≠ Betrieb | E10-F03/F04, SR-F14, SR-F18 |
| `UX-E09-F01` | Übergabe, Evidence Pack | E10-F01, E10-F03, SR-F14 |
| `UX-E09-F02` | Export mit stabilen IDs (Adapter zurückgezogen) | E14-F03, SR-F19 |
| `UX-E09-F03` | Betriebsübernahme, Reopen | E10-F04, E15-F04, SR-F20 |
| ~~`UX-E10-F01`~~ | ~~Programmsteuerung~~ zurückgezogen | E13-F02/F03, E12-F03 |
| `UX-E10-F02` | Community-Musterbibliothek | E13-F04, E16-F04 |
| `UX-E10-F03` | Zielkontextänderung als Wiedervorlage | E15-F01/F02, SR-F17 |
| `UX-E11-F01` | Zugänglichkeit, Reaktionszeit | E09-F03, E16-F01 |
| `UX-E11-F02` | Speichern, Unterbrechen, Konflikte | E01-F02, SR-E09 |
| `UX-E11-F03` | Teilen, Rechte, virtuelle Rollen | E13-F01, E08-F02, SR-F13 |
| `UX-E12-F01` | Mehrperspektiven-Pilot | E16, SR-E10 |
| `UX-E12-F02` | Fairer Vergleich, Referenzkorpus | E16-F02, SR-F20; Business-Bridge F9.3 |
| `UX-E12-F03` | Wirkungsbeobachtung | E12-F04, E15-F04, SR-F20 |
| `UX-E13-F01` | TCO-Grundlage in Entscheiden | E12, SR-E06 |
| `UX-E13-F02` | Optionssimulation, Sensitivität | E12, SR-E06 |
| `UX-E13-F03` | Kostenrevision einfrieren | E12, SR-E06 |
| `UX-E14-F01` | Facts-Service, Copy-CI | Audit GLB-01–11, H-01–11, CAT-01–05, DS-01, IMP-01 |
| `UX-E14-F02` | Level-Regelseite, Economics-Formel | Audit F-06/F-07/F-19, QA24-05 |
| `UX-E14-F03` | Signaturschlüssel, Offline-Verifier | Audit F-18, TR-02, WP-03 |
| `UX-E14-F04` | Clean Core Bench | Business-Bridge F9.3; QA24-05/18 |
| `UX-E14-F05` | Vergleichsseiten, deutsche Kernseiten | Audit ABT-01, GLB-09/10, GH-01–06, T-01–10 |
| `UX-E15-F01` | Zero-LLM-Modus | Business-Bridge F1.6; QA24-08 |
| ~~`UX-E15-F02`~~ | ~~Self-Hosted Edition~~ zurückgezogen | Business-Bridge F7.3; W-09, W-15 |
| `UX-E15-F03` | Provider-Abstraktion, BYOK | Business-Bridge F7.1/F7.2; Audit GLB-13 |
| `UX-E16-F01` | Importe ATC, Kernseife, SCMON | Business-Bridge F3.2–3.4; Audit ACA-05 |
| `UX-E16-F02` | Open Evidence Format | Business-Bridge F9.2, F11.2 |
| `UX-E16-F03` | MCP, Katalog-API, Changelog | Business-Bridge F2.1–2.3, F11.1; Audit CAT-04/07, GLB-14 |

**Umgekehrt gelesen — die alten Epics:** E01 → UX-E01/UX-E02/UX-E07-F03/UX-E11-F02 ·
E02 → UX-E04-F01/UX-E14-F02 · E03 → UX-E02 · E04 → UX-E03/UX-E01-F03 ·
E05 → UX-E04/UX-E05 · E06 → UX-E07 · E07 → UX-E08 · E08 → `G0:R0`/UX-E11-F03 ·
E09 → UX-E06-F02/UX-E11-F01 · E10 → UX-E09 · E11 → UX-E15 · E12 → UX-E13 ·
E13 → UX-E11-F03 (**nicht** mehr Organisationsrollen) · E14 → UX-E09-F02/UX-E16 ·
E15 → UX-E10-F03/UX-E09-F03 · E16 → UX-E12.

---

## 2. Befundregister CR-01…CR-30 — Status am 12.09.2026

Quelle der Befunde: Review vom 08.09., §3.2. Spalte „2.9" aus `CHANGELOG.md` und
`docs/BACKLOG.md`; **„nicht benannt"** heißt, dass kein Release den Befund
ausdrücklich zitiert — nicht, dass nichts daran geschehen ist. Die Zuordnung in
der letzten Spalte ist die Lesart der Fassung 2.7.

| CR | Prio | Worum es geht | In 2.9 | Rest gehört zu |
|---|---|---|---|---|
| CR-01 | P0 | `notToBeReleased` schlägt `classicAPI`; beide Sichten vermischt | **v2.9.0** (beide Sichten, `/method/levels`) | `UX-E14-F02:R0` (Regelversion, Vorrangregel begründet), `UX-E12-F02:R0` (am Korpus geprüft) |
| CR-02 | P1 | Technisches A–D aus Business-Kritikalität abgeleitet | nicht benannt | `UX-E14-F02:R0`, `UX-E12-F02:R0` |
| CR-03 | P1 | Leere Findingliste → A; Unbekanntes verschwindet in der Aggregation | inhaltlich berührt von **v2.9.2** (Abdeckungsbericht) | `UX-E04-F01:R2` (unbekannt bleibt unbekannt), `UX-E14-F02:R0` (Score-Formel) |
| CR-04 | P0 | Z-Tabellen-Schreibzugriff erzwingt Side-by-Side | **v2.9.3** | — (Restrisiko Zielkontext: `UX-E04-F01:R2`) |
| CR-05 | P1 | „Tier 3" für Key-User; RAP-Persistenz pauschal ausgeschlossen | Router-Teil in **v2.9.3** | `UX-E04-F01:R2`, `UX-E07-F01:3.0` |
| CR-06 | P0 | Engine übersieht Konstrukte, Score trotzdem hoch | **v2.9.2** | `UX-E12-F02:R0` (Korpus über 11 Konstruktklassen), `UX-E14-F04:R2` (Bench misst es) |
| CR-07 | P1 | Katalog nutzt `latest`; Zielrelease kein Lookup-Schlüssel | nicht benannt | `UX-E14-F01:R0` (Stand und Hashes ausweisen), `UX-E04-F01:R2` (Zielkontext Teil der Behauptung), 3.3 (Drift) |
| CR-08 | P1 | Kuratierte Nachfolger überschreiben das SAP-Mapping | Provenienz seit **v2.9.0** sichtbar | `UX-E14-F01:R0` (Nachfolger mit Typ und Provenienz), `UX-E14-F02:R0` |
| CR-09 | P0 | Generator liest `extensibilityRoute`, nicht die Architektenwahl | nicht benannt | `UX-E07-F01:3.0`; **Übergangsregel ab R0/R1**: Override als „dokumentiert, nicht wirksam" kennzeichnen (`UX-E14-F01:R1`, V25-A07) |
| CR-10 | P0 | Neuer Run entwertet alte Folgeartefakte nicht | **v2.9.6** (Stale-Kaskade) | `UX-E02-F01:R0`/`UX-E07-F03:R0` (`inputs[]` mit Revision und Hash statt Digest) |
| CR-11 | P1 | Phasenmodell zeigt Upload/Analyze getrennt, TCO fehlt | **v2.9.5**, **v2.9.6** | `UX-E06-F01:R0` (Erhaltungsregister) |
| CR-12 | P0 | Mock meldet `Passed`; Live-ABAP ist kein Unit-Lauf | **v2.9.9** | `UX-E08-F02:R2` (serverseitiges Receipt) |
| CR-13 | P0 | SKIP/TODO wird `Passed`; Erfolg aus `exitCode===0` | **v2.9.9** | `UX-E08-F02:R2` |
| CR-14 | P1 | Fehlende Abhängigkeiten durch Proxy-Stubs ersetzt | **v2.9.9** (Stubs benannt) | `UX-E08-F02:R2` (Stub-Manifest am Receipt) |
| CR-15 | P0 | Fremder Testcode als Kindprozess im API-Kontext | **v2.9.1** — Egress **gemessen**, Live-Modus zu | **`G0:R0`** — echte Runner-Isolation (`E08-F01-US01`) |
| CR-16 | P0 | Delivery behauptet verifizierte Tests ohne Nachweis | **v2.9.5** | `UX-E08-F03:3.0` |
| CR-17 | P1 | `abapgit.xml` statt `.abapgit.xml`; Paketlayout als kompatibel beschrieben | nicht benannt | `UX-E06-F01:3.0`, `UX-E09-F01:3.0` |
| CR-18 | P1 | CAP-Track mischt CAP/CDS, Express, TypeORM | nicht benannt | `UX-E07-F01:3.0` (kleine versionierte Zielprofile) |
| CR-19 | P1 | Ungültiges LLM-JSON fällt zurück und setzt `transformed` | nicht benannt | `UX-E15-F01:R0` (LLM-Stufen explizit, Manifestvermerk), `UX-E07-F01:3.0` |
| CR-20 | P1 | Doku aus je 1.000 Zeichen Ausschnitt | nicht benannt | `UX-E06-F02:R2`; Zwischenlösung: Abdeckungsumfang anzeigen (QA24-10) |
| CR-21 | P2 | BPMN-Lane-Name unescaped im XML | nicht benannt | `UX-E03-F03:R2` |
| CR-22 | P0 | Unendliche und negative TCO-Werte | **v2.9.4** | `UX-E13-F02:R2` (Rechenkern mit Grenzfällen) |
| CR-23 | P0 | TCO-Nutzen aus fixem Zielscore und 85-%-Annahme | **v2.9.8** (keine Prognose ohne eigene Werte) | `UX-E13-F01:R0` (monetäre Promptfelder raus), `UX-E13-F01:R1`/`UX-E13-F02:R2` |
| CR-24 | P1 | Deutsches Datum falsch gelesen, negative Aufrufe | **v2.9.7** | `UX-E02-F03:R2`, `UX-E16-F01:R2` |
| CR-25 | P1 | Ergebnisvergleich normalisiert NaN zu 0 | nicht benannt | `UX-E08-F01:R2` |
| CR-26 | P1 | HMAC braucht den Server; ausgeschlossenes Narrativ bleibt gültig | **v2.9.0** (Ed25519, öffentlicher Schlüssel, Verifier) | `UX-E14-F03:3.0` (`covers[]`), `UX-E09-F01:3.0` |
| CR-27 | P1 | LLM-Gaps im signierten Run; Model-ID ohne Receipt | nicht benannt | `UX-E03-F01:R1` (Herkunft je Claim), `UX-E15-F01:R0` (Modell-/Promptversion im Manifest) |
| CR-28 | P1 | Freigabeattribute sind client-schreibbare Projektfelder | **2.9-Teil**: widerrufbar, als Selbsterklärung bezeichnet, an die Quelle gebunden | **`UX-E11-F03:R0`** — servervalidierte Commands; `UX-E11-F03:3.0` (signierte Commands mit virtueller Rolle) |
| CR-29 | P2 | Große Client-Seiten, doppelte Fachlogik, Lint-Budget | Lint-Budget 677 → 661 | `UX-E06-F01:R0`/`:R1` (Register und Adapter statt Neubau) |
| CR-30 | P1 | Deploy-Gate nur Critical; Root-Lizenz fehlt | **erledigt**: `deploy.yml` prüft `--audit-level=high`, Security CI prüft high+ mit Allowlist, Apache-2.0 liegt im Root | — |

---

## 3. Was daraus für Schnitt 0 folgt

Aus dem Register landen in **v2.10** unmittelbar: CR-01/CR-02/CR-03 (Regelseite
mit Regelversion, am Korpus geprüft), CR-07/CR-08 (Katalogstand, Hashes,
Nachfolgerprovenienz im Facts-Service), CR-09 (Override sichtbar als „dokumentiert,
nicht wirksam"), CR-10 (Inputbindung), CR-15 (`G0:R0`), CR-23 (monetäre
Promptfelder), CR-27 (Modell-/Promptversion), CR-28 (servervalidierte Freigabe).

**Die Bilanz über alle 30:** 15 sind in einem 2.9-Release ausdrücklich zitiert
(CR-01, 04, 06, 10, 11, 12, 13, 14, 15, 16, 22, 23, 24, 26, 28), CR-30 ist ohne
Zitat erledigt, **14 sind in keinem Release benannt** (CR-02, CR-03, CR-05, CR-07,
CR-08, CR-09, CR-17, CR-18, CR-19, CR-20, CR-21, CR-25, CR-27, CR-29 — an CR-29
wurde mit dem Lint-Budget gearbeitet, ohne die ID zu nennen).

Die 14 sind nicht vergessen, sondern liegen in Schnitten, die noch nicht begonnen
haben. Wer einen davon anfasst, sollte ihn im Release zitieren; sonst entsteht
dieselbe Unvollständigkeit, die am 11.09. schon einmal in der Exit-Liste stand.
