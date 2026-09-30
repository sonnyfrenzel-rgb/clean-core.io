# Konzept: Deutsche Fassung von Clean-Core.io

**Stand: 24. September 2026 · für das Produkt ab 3.0 · Status: Konzept, nicht gebaut**

Die deutsche Oberfläche kommt **nach 3.0** (`docs/ROADMAP.md` §7, Zeile 3.1 „deutsche Kernseiten";
`DESIGN.md` §3). Bis dahin ist alles Englisch — die Oberfläche **und** was das Produkt erzeugt
(ADR-009). Dieses Konzept beschreibt, wie die deutsche Fassung auf das 3.0-Produkt kommt: den
Arbeitsraum mit drei Sichten und sechs Ebenen, die sieben Stufen als Werkzeuge, die öffentlichen
Seiten. Es ersetzt die Fassung vom 6. Juli 2026, die noch vom Stufen-Workflow als Produkt ausging;
die steht in der Git-Geschichte.

---

## 1. Ausgangslage (am Code geprüft, 24.09.2026)

| Aspekt | Stand |
|---|---|
| i18n-Framework | keines (kein `next-intl`, kein Locale-Routing) |
| Textschlüssel | angelegt: `lib/cc-messages.ts` für die Komponenten in `components/cc/`, die Herkunftswerte als Schlüssel in `lib/provenance.ts`, Level A–D in `lib/clean-core-level.ts` (`DESIGN.md` §3: jede sichtbare Zeichenkette neuer Oberflächen läuft über Textschlüssel, auch solange es nur Englisch gibt) |
| Sprachauszeichnung | `<html lang="en">` in `app/layout.tsx`; einzelne deutsche Inhalte tragen `lang="de"` (die deutsche FAQ-Antwort auf der Startseite) |
| Deutsche Seiten | `/datenschutz/de` als eigene, indexierbare Seite mit `hreflang` zur englischen |
| Produkt | Englisch: Startseite, Wissens- und Katalogseiten, Arbeitsraum (Business-, IT- und Management-Sicht, sechs Ebenen), die sieben Stufen als Werkzeuge, Einstellungen, Mails |
| Modellausgabe | Englisch, in den Prompts festgelegt; markiert als *Model proposal* |
| Zahlen, Datum, Geld | `Intl.NumberFormat('en')`; Geld entsteht nur in Economics, mit Währungscode, als Simulation (ADR-022) |

**Folgerung:** Das Gerüst für Textschlüssel steht dort, wo 3.0 neu gebaut hat. Eine deutsche
Fassung ist trotzdem kein Austausch von Texten, sondern Locale-Routing, ein zweiter
Message-Katalog, deutsche Modellausgabe und redaktionelle Arbeit.

---

## 2. Warum Deutsch

Der Großteil der SAP-Bestandskunden, Architektinnen und Berater arbeitet im deutschsprachigen
Raum. Für ein Werkzeug, das Custom-ABAP für eine Clean-Core-Entscheidung aufbereitet, ist Deutsch
ein Reichweiten- und Vertrauenshebel — und in der Aktivierungsumfrage eine der angebotenen
Optionen.

**Das Sprach-Paradoxon der Zielgruppe:** Sie spricht Deutsch, nutzt aber englische SAP-Fachbegriffe
(Clean Core, RAP, CAP, ABAP Cloud, BTP, Released API). Übersetzt wird die Erklär- und
Bedienebene, nicht die Fachsprache.

**Register:** sachliches Deutsch, Sie-Ansprache, keine Superlative; jede Aussage belegt wie im
Englischen („belegt, nicht behauptet").

---

## 3. Umfang nach Ebenen

| Ebene | Inhalt | Lokalisierung | Priorität |
|---|---|---|---|
| **A. Öffentliche Seiten** | Startseite (3.0.6), Wissensseiten, Clean Core explained, How-to, Whitepaper | vollständig deutsch, eigene URL | hoch (Reichweite) |
| **B. Rechtstexte** | Impressum, Datenschutz (deutsch vorhanden), Nutzungsbedingungen | deutsche Fassung; bei Abweichung ist die deutsche maßgeblich | hoch |
| **C. Arbeitsraum** | Sichten-Umschalter und ihre Fragen, Ebenen, Karten, „Next step", Message Strips, die sieben Stufen als Werkzeuge, Einstellungen | über die Textschlüssel | mittel |
| **D. Feste Listen** | Herkunftswerte (Proven, Confirmed, Reconstructed, Imported, Model proposal, Simulation, Demonstrated · mock, Stale, Not determined), Level A–D, die vier Töpfe, Objektstatus | je ein deutscher Wert pro Schlüssel, einmal festgelegt | hoch — sie tragen Bedeutung |
| **E. Modellausgabe** | fachliche Namen, Klarsprache-Satz, Dokumentationstext | deutsch **erzeugen**, nicht übersetzen | mittel |
| **F. Mails** | Willkommen, Einladung zur Einsicht, Freigaben | deutsch | niedrig |
| **G. Katalog und SEO** | Objektkatalog, JSON-LD, Metadaten, Sitemap | deutsche Varianten mit `hreflang` | mittel |
| **H. Formate** | Zahlen, Datum | `Intl` mit `de-DE`; Geld bleibt Simulation mit Währungscode | niedrig |

**Sprachneutral — nicht übersetzen:** ABAP-Objekt- und Tabellennamen, Code, Zeilenanker
(`L243`), Befund- und Regel-IDs (`CC-017`, `BR-004`), JSON-Schlüssel, SAP-API- und CDS-Namen.
Deutscher Code bleibt wörtlich, wo er zitiert wird (`DESIGN.md` §3).

**Die Sicht ist keine Sprache und keine Rolle:** Business, IT und Management bleiben Sichten auf
dieselben Fakten; die Sprache ändert daran nichts und wird wie die Sicht nie mit einem Projekt,
einem Run, einer Signatur oder einem Audit-Pack gespeichert.

---

## 4. Technisches Konzept (Next.js 15 App Router)

### 4.1 Framework
Das eingebaute i18n-Routing von Next.js gilt nur für den Pages Router. Empfehlung: `next-intl`
(App-Router- und RSC-nativ, statische Generierung und ISR, Locale-Routing, `hreflang`-Helfer,
`Intl`). Die vorhandenen Schlüssel aus `lib/cc-messages.ts` und `lib/provenance.ts` werden der
Anfang des englischen Katalogs, nicht ein zweites System daneben.

### 4.2 URL-Strategie
Unterpfad auf derselben Domain: `clean-core.io/` (Englisch, Standard) und `clean-core.io/de/…`.
Eine Domain, ein Cloud-Run-Dienst, ein Zertifikat. Die heutigen englischen URLs bleiben
unverändert — sie haben die Suchreichweite (`tests/seo-surface-guard.spec.ts`).

### 4.3 Sprachwahl
- **Feste URLs je Sprache.** `/de/…` liefert immer Deutsch, alle heutigen URLs immer Englisch —
  unabhängig vom Browser. Crawler, Direktlinks und geteilte Links erreichen jede Fassung
  deterministisch.
- **Hinweis statt Umleitung.** Ein Browser mit deutscher Sprache bekommt auf englischen Seiten
  einen Hinweis „Diese Seite gibt es auf Deutsch", keine automatische Umleitung. Das hält die
  englischen URLs stabil, die heute gefunden werden.
- **Sprachumschalter** in Kopf und Fußleiste; die Wahl lebt als Cookie im Browser, nicht im Konto.

### 4.4 Message-Kataloge
```
messages/
  en.json   # aus lib/cc-messages.ts und den weiteren Schlüsseln
  de.json
```
Namensräume je Ort (`landing.*`, `workspace.*`, `provenance.*`, `level.*`, `legal.*`, `errors.*`).
Serverkomponenten laden serverseitig; Clientkomponenten nur, wo sie interaktiv sind.

### 4.5 SEO-Pflichten
- `alternates.languages` je Seite: `de-DE` ↔ `en` plus `x-default`.
- `canonical` je Sprach-URL, nie über Sprachen hinweg.
- `sitemap.ts` mit beiden Varianten und Alternates.
- JSON-LD je Sprache (`inLanguage`), sichtbares FAQ und `FAQPage` deckungsgleich wie heute.

---

## 5. Modellausgabe auf Deutsch

1. **Erzeugen statt übersetzen.** Der Proxy `/api/gemini` erhält die Ausgabesprache als
   Parameter; menschenlesbare Felder entstehen deutsch, die Struktur (Schlüssel, Enums, Objekt-
   und API-Namen, Code) bleibt neutral.
2. **Fachbegriffe englisch im deutschen Text**, als Anweisung im Prompt.
3. **Die Herkunft sagt der Chip, nicht der Text** (`DESIGN.md` §3.1): *Model proposal* bleibt die
   Kennzeichnung; die Bereinigung in `lib/model-text.ts` bekommt die deutsche Floskelliste.

**Vertrauenskette unberührt:** Modelltext ist nicht Teil des signierten Runs. Die Ausgabesprache
ändert keine Zahl, keinen Befund, keinen Fingerabdruck und keine Signatur.

**Qualitätssicherung:** Der Arbeitsraum wird mit dem Demo-Projekt `Z_MM_PO_APPROVAL` und einem
Korpusfall einmal vollständig auf Deutsch durchgegangen — alle drei Sichten, alle sechs Ebenen,
jede der sieben Stufen als Werkzeug — und redaktionell gegengelesen, bevor die Fassung
freigegeben wird.

---

## 6. Rechtstexte

- **Datenschutz:** deutsche Fassung vorhanden (`/datenschutz/de`).
- **Impressum:** deutsches Recht (§ 5 DDG); deutsche Fassung ist reine Übersetzung.
- **Nutzungsbedingungen:** deutsches Recht gilt bereits; eine deutsche Fassung wird anwaltlich
  gegengelesen. Eine neue, bindende Fassung schreibt `termsVersionAccepted` fort — die
  Anmeldung selbst bleibt unverändert.

---

## 7. Terminologie (Auszug)

| Englisch | Deutsch |
|---|---|
| Clean Core, RAP, CAP, ABAP Cloud, BTP, Released API, CDS view | beibehalten |
| workspace | Arbeitsraum |
| Business view · IT view · Management view | Business-Sicht · IT-Sicht · Management-Sicht |
| the seven stages as tools | die sieben Stufen als Werkzeuge |
| Level A–D | Level A–D (unverändert, SAPs Begriff) |
| Proven · Confirmed · Reconstructed · Imported · Not determined | Belegt · Bestätigt · Rekonstruiert · Importiert · Nicht bestimmt |
| Model proposal · Simulation · Stale | Modellvorschlag · Simulation · Veraltet |
| a self-declaration, not a mandate | eine Selbstauskunft, kein Mandat |
| read access by invitation | Einsicht per Einladung |
| Retire · Keep · Rebuild · No catalogued path | im Glossar festzulegen, bevor die Oberfläche übersetzt wird |
| Free Community Edition | beibehalten (Eigenname) |

Das Glossar ist Teil des Katalogs, nicht ein Dokument daneben; die deutschen Werte der festen
Listen stehen beim jeweiligen Schlüssel, damit Oberfläche, Mails und Prompts dieselben Wörter
verwenden (`docs/registers/vocabulary.json` hält die englischen Schreibweisen).

---

## 8. Reihenfolge

| Schritt | Inhalt | Ergebnis | Größe |
|---|---|---|---|
| **0 — Gerüst** | `next-intl`, `/de`-Routen, `lang`, Umschalter, `hreflang`, Sitemap, Canonical; vorhandene Schlüssel in den Katalog | `/de` erreichbar | M |
| **1 — Öffentliche Seiten** | Startseite, Wissensseiten, Metadaten und JSON-LD deutsch | Reichweite im DACH-Raum | M–L |
| **2 — Rechtstexte** | Impressum, Nutzungsbedingungen (Datenschutz steht) | Vertrauensbasis | S–M |
| **3 — Arbeitsraum** | Sichten, Ebenen, Karten, feste Listen, Stufen als Werkzeuge, Einstellungen | bedienbar auf Deutsch | L |
| **4 — Modellausgabe** | Ausgabesprache als Parameter, deutsche Floskelliste, Durchgang mit Demo und Korpusfall | deutsche fachliche Namen und Texte | M |
| **5 — Mails und Hilfe** | Mails, How-to, Ask this case | durchgängig | M |

Die kleinste sinnvolle Fassung sind Schritt 0 bis 2: öffentliche Seiten und Rechtstexte deutsch,
der Arbeitsraum vorerst englisch — für ein SAP-Fachpublikum vertretbar. Jeder Schritt wird
vollständig ausgeliefert, nie eine halb übersetzte Seite.

---

## 9. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Englisch und Deutsch laufen auseinander | ein Katalog je Sprache, ein Guard für fehlende Schlüssel; keine fest geschriebenen Zeichenketten in neuen Oberflächen (`DESIGN.md` §3) |
| Deutsche Seiten verdrängen englische in der Suche | `hreflang` in beide Richtungen, Canonical je Sprach-URL, englische URLs unverändert |
| Holprige Modellausgabe | Prompt-Anweisung zu Fachbegriffen, deutsche Bereinigung, Durchgang vor Freigabe |
| Ein fester Wert bekommt zwei Übersetzungen | deutsche Werte beim Schlüssel, einmal festgelegt |
| Rechtstext wirkt als bloße Übersetzung nicht | Nutzungsbedingungen anwaltlich gegenlesen |

## 10. Nicht-Ziele

- keine maschinelle Übersetzung ohne redaktionelle Prüfung;
- kein zweiter Code-Stand — eine Codebasis, zwei Sprachen;
- keine Übersetzung von Fachbegriffen, Code, Objektnamen oder JSON;
- keine Änderung an Runs, Signaturen oder Audit-Pack;
- keine Sprache als Kontoeinstellung auf dem Server — die Wahl bleibt im Browser.

> Kein Rechtsrat. Die deutschen Rechtstexte werden vor Veröffentlichung anwaltlich geprüft.
