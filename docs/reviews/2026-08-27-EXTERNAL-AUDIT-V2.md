> **Archiviert am 27.08.2026, unverändert.** Was daraus umgesetzt wurde, steht in
> `CHANGELOG.md` unter v2.5.2. Zwei Befunde haben der Prüfung nicht standgehalten
> — beide, weil dem Prüfer der Codezugriff fehlte:
>
> - **K-03 (VBAK)** ist kein Mapping-Fehler, sondern eine dokumentierte
>   Entscheidung (`lib/reference-analysis.ts`): die Referenzseite zeigt bewusst
>   SAPs eigenen Nachfolger `I_SALESDOCUMENT`, weil sie „aus SAPs eigenen Daten"
>   behauptet, während intern die kuratierte Ebene mit `API_SALES_ORDER_SRV`
>   gewinnt. Die *Empfehlung* war trotzdem richtig und ist umgesetzt.
> - **Priorität 6** („Einzel-URLs für 50–100 Tabellen", hoher Aufwand) existiert
>   seit Längerem: `app/catalog/[object]/page.tsx` mit `generateStaticParams` und
>   ein eigenes `catalog-sitemap.xml` über ~400 Objekte. Von der
>   Selbstprüfungsliste in §9 war nur `llms.txt` tatsächlich offen.
>
> Umgekehrt hat der Befund an einer Stelle untertrieben: der Consent-Banner
> (R-01) und das Logo (R-02) stehen im App-Shell-Layout, das auch `/knowledge`,
> `/how-to` und `/first-run` umschließt — also jede öffentliche Cluster-Seite,
> nicht nur die eine geprüfte.

---

# Befund v2: clean-core.io — Nutzen, SEO, GEO

**Datum:** 27. August 2026
**Geprüfte Version:** v2.5.0 (Footer, 27. August 2026)
**Vorbefund:** v1 vom 24. August 2026, geprüft auf v2.3.1
**Prüfer:** Externe Analyse, remote, ohne Zugriff auf Server, Logs oder Search Console

---

## 0. Methodik und Grenzen

### Was gemacht wurde

| Schritt | Umfang |
|---|---|
| Live-Abruf | `https://clean-core.io/`, `https://clean-core.io/knowledge` |
| Suchtest | 1 Abfrage, gezielt auf neue Inhalte (`/reference-analysis`) |
| Abgleich | Vollständiger Abgleich gegen alle 16 Befunde aus v1 |

### Neue, wesentliche Einschränkung

Der Deploy auf v2.5.0 ist auf **heute** datiert. Der Suchindex führt noch die Vorgängerfassung: In den Ergebnissen steht weiterhin `23.696` Objekte, das Altersdatum ist von Januar 2025 auf Juni 2026 gerückt.

**Konsequenz:** Alle indexabhängigen Befunde aus v1 — Rankings, Kannibalisierung, Auffindbarkeit der Unterseiten — sind derzeit **nicht neu messbar**. Sie sind unten als *ausgesetzt* markiert. Eine belastbare Neubewertung ist frühestens in zwei bis drei Wochen möglich; die Google Search Console zeigt Bewegung deutlich früher.

### Was weiterhin nicht geprüft werden konnte

- `robots.txt` (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot)
- `llms.txt`
- `sitemap.xml`
- JSON-LD (wird bei der Textextraktion entfernt)
- `/catalog` — Rendering-Verfahren und Existenz von Einzel-URLs
- Die neuen Seiten `/reference-analysis`, `/features/*`, `/whitepaper`, `/trust`

### Statusdefinition

**BELEGT** — direkt aus Abruf nachweisbar · **INDIZ** — konsistente Beobachtung ohne Beweis · **UNVERIFIZIERT** — Hypothese · **AUSGESETZT** — wegen Index-Latenz derzeit nicht messbar

---

## 1. Statusübersicht der v1-Befunde

| ID | Befund aus v1 | Status v2.5.0 |
|---|---|---|
| N-01 | Nutzenversprechen nicht quantifiziert | ✅ **behoben** — über Erwartung |
| N-02 | Vergleichstabelle widerspricht eigenem Framing | ⚠️ **teilweise** — Skala verbessert, eine Zeile verschlechtert |
| N-03 | 24-Stunden-Freigabe als Konversionshürde | ✅ **behoben** |
| N-04 | Ehrlichkeit als Differenzierungsmerkmal | ✅ **ausgebaut** |
| S-01 | Server-Side-Rendering | ✅ stabil |
| S-02 | Rankings | ⏸️ ausgesetzt |
| S-03 | Markenkollision GitHub-Org | ⏸️ ausgesetzt |
| S-04 | Falsches Datumssignal | ✅ **behoben** (Quelle), Index folgt |
| S-05 | Kein deutschsprachiger Cluster | ❌ **offen** |
| S-06 | Startseite kannibalisiert Cluster | ⏸️ ausgesetzt — Struktur verbessert |
| S-07 | `/catalog` nicht auffindbar | ⚠️ **Verlinkung behoben**, Rendering offen |
| G-01 | Quick-Answer-Blöcke | ✅ **ausgebaut** |
| G-02 | FAQ-Antworten fehlen im Text-Layer | ✅ **behoben — kritisch** |
| G-03 | GEO-Hebel liegt bei SAP Community | ✅ **aufgegriffen** |
| G-04 | Zitierfähige Assets fehlen | ✅ **behoben** |
| W-01/02 | Wettbewerbsumfeld | unverändert |

**Neu in v2:** sechs Befunde zu Konsistenz (K-01 bis K-04) und Recht/Erreichbarkeit (R-01, R-02).

---

## 2. Nutzen und Positionierung

### N-01 — Nutzen ist quantifiziert
**Status:** BELEGT — **behoben**

Die Lücke aus v1 ist geschlossen, und zwar substanzieller als vorgeschlagen. Publiziert ist jetzt:

- Ein **907-Zeilen-Referenzprogramm** mit 42 Findings
- Die Aufteilung: **21 settled** (zeigt auf released SAP-Nachfolger) · **17 your call** (transformierbar, Abwägung nötig) · **4 hand work** (für jeden Generator außer Reichweite)
- **4 von 11 Konstruktklassen** vollständig abgedeckt, der Rest benannt
- Die konkrete Mapping-Liste: `KNA1→I_CUSTOMER`, `KNB1→I_CUSTOMERCOMPANY`, `MARA→I_PRODUCT`, `MARD→I_PRODUCTSTORAGELOCATIONBASIC`, `VBAK→I_SALESDOCUMENT`, `VBAP→I_SALESDOCUMENTITEM` — plus 4 ohne released Pfad, ausdrücklich benannt statt geraten
- Die Quelldatei als Download unter `/reference-analysis/source`

Das ist ein nachrechenbarer Nutzenbeleg. Ein Architekt kann daraus eine Zahl in eine Vorlage schreiben und die Grundlage prüfen.

**Warum das mehr ist als eine Coverage-Tabelle:** Der Anteil „4 hand work" ist ein Eingeständnis. Genau das macht die anderen 38 glaubwürdig.

---

### N-02 — Vergleichstabelle: Fortschritt und Rückschritt
**Status:** BELEGT — **teilweise behoben**

**Fortschritt:** Die binäre Bewertung ist einer abgestuften Skala gewichen. `Clean Core Violation Scanning` steht jetzt bei `~`, `Developer HUD` bei `–`. Das ist genau die Differenzierung, die v1 empfohlen hat.

**Rückschritt:** Die Zeile `Business Process Blueprinting` steht weiterhin bei ✕ mit der Begründung „No process flow visualization available" — und ist damit gegen die eigene Seite nachweisbar falsch:

| Fundstelle | Aussage |
|---|---|
| Vergleichstabelle Startseite | SAP: ✕ „No process flow visualization available" |
| Alt-Text Screenshot `step-5` | Blueprints „validated for SAP Signavio and SAP Build" |
| Quick Answer `/knowledge` | Nennt Cloud ALM, LeanIX und Signavio ausdrücklich als autoritative Toolchain |

Drei Fundstellen, zwei unvereinbare Aussagen. Ein SAP-Architekt findet das in unter einer Minute — und es trifft ausgerechnet den Anspruch, auf dem die gesamte Positionierung ruht.

**Empfehlung:** Zeile auf `~` setzen, Text differenzieren: „nicht im ATC/ADT-Kernumfang; abgedeckt durch SAP Signavio und Cloud ALM in separaten Lizenzen." Kostet eine Zeile, entzieht dem Einwand die Grundlage. Dasselbe für `Sandbox Verification`.

---

### N-03 — Registrierungshürde entfernt
**Status:** BELEGT — **behoben**

Free Community Edition jetzt: „Register with name and email — your workspace is live straight away."

Das Admin-Gate steht nur noch an der Sandbox-Verbindung („Admin-Gated Onboarding") — dort ist es eine Sicherheitsmaßnahme, wird auch so begründet und ist richtig platziert.

---

### N-04 — Positionierung neu gefasst
**Status:** BELEGT — **ausgebaut**

Der neue Abschnitt „Nobody can say what this program does" verschiebt die Argumentation von *was das Tool ist* auf *welche Entscheidung es freigibt*. Adressat ist erkennbar das Business, nicht die IT.

Stärkste Einzelstelle der gesamten Seite ist der unbearbeitet zitierte Befund:

> Credit Management Custom Logic · Zeile 401 — Prüfung, ob SAP FSCM / Advanced Credit Management (F1007) den Anwendungsfall abdeckt; Restlücke als Side-by-Side-Microservice auf BTP.

Mit dem Zusatz „Produced by the run, quoted unedited — not written for this page." Das ist ein Vertrauensbeleg, den kein Wettbewerber mit Marketingtext erreicht.

Ebenfalls neu und richtig: „the generator is forbidden them" — der Verzicht auf Fachbegriffe im Business-Output ist als Regel formuliert, nicht als Absicht.

---

## 3. Konsistenz und Korrektheit (neu)

Dieser Abschnitt existierte in v1 nicht. Er entsteht, weil die Seite deutlich mehr überprüfbare Zahlen enthält als vorher — was gut ist, aber eine neue Fehlerklasse eröffnet.

### K-01 — Zwei Objektzahlen auf derselben Seite
**Status:** BELEGT

| Fundstelle | Zahl |
|---|---|
| Trust-Leiste und Abschnittsüberschrift | **32.103** klassifizierte SAP-Objekte |
| Vergleichstabelle, Zeile `SAP Object Successor Mapping` | Cloudification Repository (**23.000+** objects) |

Die Tabelle trägt den Stand der Vorversion. Auf einer Seite, die mit „Belegt, nicht behauptet" wirbt, ist das die teuerste denkbare Stelle für eine veraltete Zahl.

**Empfehlung:** Objektzahl aus einer einzigen Quelle rendern, nicht als Textkonstante pflegen. Dieselbe Disziplin wie bei der Support-Matrix.

---

### K-02 — Zwei Labels für dieselbe Zelle
**Status:** BELEGT

Die Vergleichsmatrix wird in zwei Varianten ausgeliefert (Karten und Tabelle). Dieselben zwei Zeilen tragen unterschiedliche Bezeichnungen:

| Zeile | Kartenansicht | Tabellenansicht |
|---|---|---|
| Sandbox Verification | „Not Supported" | „Not Available" |
| Business Process Blueprinting | „Not Supported" | „Not Available" |

Kein inhaltlicher Fehler, aber ein Hinweis auf zwei getrennt gepflegte Datenquellen für dieselbe Aussage — mit entsprechendem Driftrisiko.

---

### K-03 — Zwei Nachfolger für VBAK
**Status:** BELEGT

| Fundstelle | Mapping |
|---|---|
| Referenzanalyse-Liste | `VBAK → I_SALESDOCUMENT` |
| Transformation Showroom, Codebeispiel | `VBAK → I_SalesOrder` |
| Download-Beschreibung abapGit-Paket | `VBAK → I_SalesOrder` |

Beide CDS-Views existieren, aber es sind unterschiedliche Entitäten mit unterschiedlichem Zuschnitt. Ohne Erläuterung wirkt das auf einen SAP-Kundigen wie ein Mapping-Fehler — auf der einen Seite, die durchweg mit Präzision argumentiert.

**Empfehlung:** Entweder vereinheitlichen oder den Unterschied in einem Halbsatz erklären („Referenzlauf wählt `I_SalesDocument`; das Showroom-Beispiel verwendet den engeren `I_SalesOrder`"). Der zweite Weg ist der bessere — er demonstriert genau die Sorgfalt, die verkauft wird.

---

### K-04 — Datumsdifferenz beim Engine-Stand
**Status:** BELEGT

| Fundstelle | Angabe |
|---|---|
| Showroom-Fußzeile | Verified against Clean-Core Engine v2.5.0 · **Juli 2026** |
| Footer | System Version v2.5.0 • **27. August 2026** |

Vermutlich Verifikationsdatum gegen Releasedatum. Falls ja, gehört das dazugeschrieben; sonst ist es ein liegengebliebener Wert.

---

## 4. Recht und Erreichbarkeit (neu)

### R-01 — Consent-Banner verlinkt auf geschützte Routen
**Status:** BELEGT — **rechtlich relevant, seit v1 unverändert**

Der Consent-/Hinweis-Banner auf `/knowledge` verlinkt auf:

- `https://clean-core.io/settings#privacy`
- `https://clean-core.io/settings#legal`

`/settings` ist eine Anwendungsroute innerhalb des eingeloggten Bereichs. Der Footer derselben Seite verlinkt korrekt auf die öffentlichen Fassungen `/datenschutz` und `/impressum`.

**Das ist kein UX-Thema.** Datenschutzerklärung und Impressum müssen ohne Anmeldung, unmittelbar und ständig verfügbar sein (§ 5 DDG, Art. 12/13 DSGVO). Ein Banner, der auf eine gesicherte Route zeigt, erfüllt das nicht.

**Aufwand: eine Zeile. Priorität: höchste.**

---

### R-02 — Header-Logo zeigt auf `/dashboard`
**Status:** BELEGT — seit v1 unverändert

Auf `/knowledge` verweist das Logo im Header auf `/dashboard` statt auf `/`. Für nicht angemeldete Besucher ist das eine Sackgasse — und für Crawler ein Signal, das die interne Verlinkung verzerrt.

---

## 5. SEO

### S-04 — Datumssignal an der Quelle korrigiert
**Status:** BELEGT — behoben, Index folgt

Footer weist jetzt v2.5.0 mit Stand 27. August 2026 aus. Das Altersdatum im Index ist von Januar 2025 auf Juni 2026 gerückt — die Fehlangabe aus v1 ist damit weg, der Rest ist normale Crawl-Latenz.

---

### S-06 / S-07 — Clusterstruktur deutlich verbessert
**Status:** Struktur BELEGT, Wirkung AUSGESETZT

Was sich geändert hat:

- `/catalog` ist jetzt **im Fließtext** verlinkt, mit sprechendem Ankertext („32.103 SAP objects classified from SAP's own data") — nicht mehr nur im Footer
- `/how-it-works` ist mehrfach kontextuell verlinkt, ebenfalls mit inhaltlichem Ankertext
- `/knowledge` trägt neu einen „Related tools & guides"-Block auf alle fünf Cluster-Seiten
- Neue Seitenebene: `/reference-analysis`, `/reference-analysis/source`, sechs `/features/*`-Seiten, `/whitepaper`, `/trust`, `/first-run`, `/how-to`, `/about`

Damit haben die Unterseiten erstmals einen eigenen Zweck und eigene eingehende Links. Ob das die Kannibalisierung aus v1 auflöst, ist erst nach Reindexierung messbar.

**Offen bleibt der Kern von S-07:** ob `/catalog` server-gerendert ist und Einzel-URLs je Objekt besitzt. Das ist unverändert der Hebel mit dem größten Verhältnis von Wirkung zu Aufwand.

---

### S-05 — Deutschsprachiger Cluster weiterhin nicht vorhanden
**Status:** BELEGT — **offen**

Unverändert keine einzige deutschsprachige Landingpage. In v1 belegt: eine rein englische Seite erreichte auf eine deutsche Anfrage Position 2. Das Feld ist unbesetzt.

Zielbegriffe: Bestandscode · kundeneigene Entwicklungen · Eigenentwicklungen · S/4HANA Custom Code Migration · Z-Code Bewertung · ABAP Cloud Umstellung.

Angesichts der DSAG-Zielgruppe ist das inzwischen die größte inhaltliche Lücke.

---

## 6. GEO

### G-02 — FAQ-Antworten sind im Text-Layer
**Status:** BELEGT — **behoben, war kritisch**

Alle fünf FAQ-Antworten auf `/knowledge` kommen jetzt vollständig im Server-HTML. Die Sektion erfüllt damit den Zweck, den ihre Unterzeile behauptet.

---

### G-01 / G-04 — `/knowledge` ist jetzt die stärkste GEO-Seite der Domain
**Status:** BELEGT — ausgebaut

Neu hinzugekommen und jeweils hochgradig zitierfähig:

- **BAIP-Einordnung:** Die Notiz, dass SAP BTP seit Sapphire 2026 unter der Klammer *SAP Business AI Platform* geführt wird, dies eine Portfolio-Konsolidierung und keine Abkündigung ist, und dass Releases unter dem Namen „SAP BTP ABAP environment" noch im August 2026 erschienen sind. Aktuell, präzise, und in dieser Klarheit sonst kaum auffindbar. Genau das, was generative Systeme aufgreifen.
- **Key-Terms-Glossar:** SAP BTP, Cloud Connector, OData, CDS — definitorisch, eigenständig lesbar.
- **RAP-vs-CAP-Entscheidungsmatrix:** sechs Kriterien im direkten Vergleich. Das ist das am leichtesten zitierbare Artefakt der ganzen Domain.
- **Quick Answer** benennt Cloud ALM, LeanIX und Signavio ausdrücklich als autoritative Instanzen — sachlich richtig und vertrauensbildend. (Und genau deshalb wirkt der Widerspruch in N-02 auf der Startseite umso schärfer.)

---

### G-03 — Externe Autorität wird aufgebaut
**Status:** BELEGT — aufgegriffen

`/knowledge` verlinkt unter „Further reading" auf den eigenen SAP-Community-Beitrag „You can't clean what you can't see: visibility & KPIs for the Extensibility dimension".

Das ist der in v1 empfohlene Weg, richtig herum umgesetzt: der Beitrag trägt die Reichweite, die Domain trägt das Werkzeug.

**Fortführen mit:** je Beitrag eine harte, eigene Zahl. Die 21/17/4-Aufteilung und die 4-von-11-Konstruktabdeckung sind genau solche Zahlen — sie gehören in den nächsten Community-Beitrag.

---

## 7. Wettbewerbsumfeld

Unverändert gegenüber v1.

**Feld A — vergleichbare Werkzeuge:** Crave InfoTech (CoreAssess.AI, zertifizierter SAP-Partner, Sichtbarkeit über Presseaussendungen), smartShift, Project Kernseife (quelloffen, GitHub-Org `clean-core`), cleancoreabap.com.

**Feld B — Erklärinhalte:** Deloitte, LeverX, adesso, AiFA Labs, avotechs, DSAG, SAP Community.

**Strategische Konsequenz, jetzt deutlicher als in v1:** Mit dem Referenzlauf und den publizierten Coverage-Zahlen ist die Domain aus Feld B faktisch ausgestiegen — sie argumentiert nicht mehr *über* Clean Core, sondern legt eigene Messwerte vor. Das ist die richtige Richtung. Der Objektkatalog ist der nächste Schritt auf demselben Weg.

---

## 8. Maßnahmen nach Priorität

| # | Maßnahme | Befund | Aufwand | Wirkung |
|---|---|---|---|---|
| 1 | Consent-Banner auf `/datenschutz` und `/impressum` umbiegen | R-01 | eine Zeile | rechtlich zwingend |
| 2 | Objektzahl in der Vergleichstabelle vereinheitlichen (23.000+ → 32.103), aus einer Quelle rendern | K-01 | gering | hoch |
| 3 | BPMN- und Sandbox-Zeile auf `~` differenzieren | N-02 | gering | hoch |
| 4 | VBAK-Mapping vereinheitlichen oder erklären | K-03 | gering | mittel |
| 5 | Header-Logo auf `/` | R-02 | eine Zeile | mittel |
| 6 | `/catalog`: Rendering prüfen, Einzel-URLs für 50–100 reale Tabellen | S-07 | hoch | sehr hoch |
| 7 | Deutschsprachiger Cluster | S-05 | hoch | hoch |
| 8 | Labels der zwei Matrix-Varianten aus einer Quelle | K-02 | gering | gering |
| 9 | Engine-Datum klären oder erläutern | K-04 | gering | gering |
| 10 | Community-Beiträge mit je einer eigenen Zahl fortsetzen | G-03 | laufend | hoch |
| 11 | In 2–3 Wochen: Indexierung und Rankings neu messen | S-02/03/06 | — | Grundlage |

Positionen 1 bis 5 sind zusammen unter einer Stunde Arbeit und beheben die gesamte Angriffsfläche bei der Glaubwürdigkeit.

---

## 9. Offene Punkte zur Selbstverifikation

- [ ] `robots.txt` — GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot
- [ ] `llms.txt` vorhanden? Falls nein, anlegen
- [ ] `sitemap.xml` — enthält sie `/catalog`, `/reference-analysis`, alle `/features/*`?
- [ ] JSON-LD: `Organization`, `SoftwareApplication`, `FAQPage`, `dateModified`
- [ ] `/catalog`: server-gerendert? Einzel-URLs je Objekt?
- [ ] Canonical-Tags auf den neuen `/features/*`-Seiten — Selbstreferenz korrekt?
- [ ] Google Search Console: Indexierungsstatus je Unterseite, nach Reindexierung
- [ ] Consent-Banner: erscheint er vor der Inhaltsauslieferung? Blockiert er Crawler?
- [ ] Sind die neuen `/features/*`-Seiten eigenständig oder Duplikate der Startseiten-Abschnitte?

---

## 10. Gesamteinschätzung

**Zwischen v2.3.1 und v2.5.0 sind die drei wichtigsten Befunde aus v1 geschlossen worden** — die unsichtbaren FAQ-Antworten, das fehlende quantifizierte Nutzenversprechen und die Registrierungshürde. Der Referenzlauf mit 42 aufgeschlüsselten Findings ist inhaltlich mehr, als v1 vorgeschlagen hatte.

Die verbleibenden Schwächen haben ihren Charakter geändert. In v1 fehlte Substanz. In v2.5.0 ist die Substanz da, aber sie ist an vier Stellen nicht konsistent gepflegt: zwei Objektzahlen, zwei Labels, zwei VBAK-Nachfolger, zwei Datumsangaben.

Das ist ein anderes Problem und ein besseres — aber es trifft empfindlicher. Eine Seite, die ihren Anspruch auf Nachprüfbarkeit gründet, wird an genau dieser Nachprüfbarkeit gemessen. Wer die 42 Findings ernst nimmt, prüft auch die 32.103 — und findet daneben 23.000+.

Drei Prioritäten:

1. **Die Konsistenzlücken schließen.** Unter einer Stunde Arbeit, entfernt die gesamte Angriffsfläche.
2. **Den Consent-Banner umbiegen.** Eine Zeile, aber rechtlich nicht verhandelbar.
3. **Den Objektkatalog auffindbar machen.** Unverändert der größte Hebel — und der einzige Vorsprung, den kein Wettbewerber einholen kann.

Die SEO-Bewertung ist bis zur Reindexierung ausgesetzt. Sinnvoller Zeitpunkt für Befund v3: Mitte bis Ende September 2026.
