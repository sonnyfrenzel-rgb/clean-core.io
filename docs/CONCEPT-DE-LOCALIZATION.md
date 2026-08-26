# Konzept: Deutsche Version von Clean-Core.io

**Stand: 6. Juli 2026 · v2.0.0 · Status: Entwurf zur Entscheidung**

Ziel dieses Dokuments: ein vollständiges, umsetzungsreifes Konzept für eine **professionelle, zielgruppengerechte deutsche Fassung** von Clean-Core.io — von der Marktbegründung über Tonalität und Terminologie bis zur technischen Architektur, SEO, AI-Ausgabe, Rechtstexten und einem phasierten Rollout.

---

## 1. Ausgangslage (Ist-Stand, am Code geprüft)

| Aspekt | Ist-Zustand |
|---|---|
| i18n-Framework | **keines** (kein `next-intl`/`i18next`, kein Locale-Routing) |
| Sprachauszeichnung | `<html lang="en">` fest in `app/layout.tsx` |
| hreflang / `alternates.languages` | **nicht vorhanden** |
| Produkt-UI | vollständig Englisch (Landing, 7 Stages, Settings, Navigation, ~33 Routen) |
| AI-Ausgabe | **Englisch**, in den Prompts fixiert („Plain English executive summary / roadmap") |
| Rechtstexte | `/impressum`, `/datenschutz` mit deutschen Rechts-Headern, **aber englischem Fließtext**; `/terms` Englisch; alle als `lang=en` |
| SEO | robots (AI-Crawler erlaubt), sitemap, per-Page `metadata` + `canonical`, JSON-LD `@graph` — alles **nur Englisch** |
| Zahlen/Währung | `$`/englische Formate im TCO-Stage |

**Fazit:** Es gibt keine Lokalisierungs-Infrastruktur. Eine deutsche Version ist kein „Text austauschen", sondern die Einführung einer i18n-Schicht plus redaktioneller und AI-seitiger Arbeit.

---

## 2. Warum Deutsch — Zielgruppe & Markt

**DACH ist SAPs Heimatmarkt.** SAP SE sitzt in Walldorf; der Großteil der SAP-Bestandskunden, -Architekten und -Berater arbeitet im deutschsprachigen Raum. Für ein Tool, das genau diese Zielgruppe adressiert (Clean-Core-Readiness von Custom-ABAP), ist Deutsch kein „nice to have", sondern ein **Vertrauens- und Reichweitenhebel**.

**Zielgruppen (unverändert zur EN-Version, aber deutschsprachig):**
- **SAP-Architekt:innen** — bewerten Clean-Core-Tauglichkeit von Bestandscode.
- **ABAP-Entwickler:innen** — modernisieren nach RAP/CAP.
- **Technische Entscheider:innen** — wollen eine belegbare Zweitmeinung.

**Sprach-Paradoxon der Zielgruppe (zentral für die Tonalität):** Dieses Publikum spricht Deutsch, nutzt aber **englische SAP-Fachtermini** („Clean Core", „RAP", „CAP", „ABAP Cloud", „BTP", „Fiori", „Released API"). Eine gute deutsche Version übersetzt **nicht** die Fachbegriffe, sondern die Erklär-, Marketing- und Bedien-Ebene. Übersetzte SAP-Fachbegriffe („Sauberer Kern"?) würden **unprofessionell** wirken und Vertrauen kosten.

**Register:** professionelles, sachliches Deutsch, konsistente **Sie-Ansprache** in UI/Marketing; Leitprinzip „**belegt, nicht behauptet**" bleibt. Keine Werbe-Superlative, keine falschen Garantien (deckungsgleich mit der bestehenden ehrlichen Narrative).

---

## 3. Scope — was lokalisiert wird (nach Ebenen)

| Ebene | Inhalt | Lokalisierung | Priorität |
|---|---|---|---|
| **A. Marketing** | Landing (`app/page.tsx`), 6 Feature-Subpages, Community-Statement, Banner | vollständig DE | **hoch** (Reichweite/SEO) |
| **B. Rechtstexte** | Impressum, Datenschutz, Terms | echte deutsche Fassung | **hoch** (DE-Zielgruppe erwartet DE-Recht) |
| **C. Produkt-UI** | 7 Stages, Navigation, Settings, Buttons, Labels, Tooltips, Fehlermeldungen | vollständig DE | mittel |
| **D. AI-Ausgabe** | Analyse-Narrativ, Board Deck, Doku, Executive Summary, ROI-Text | DE **generieren** (nicht übersetzen) | mittel–hoch |
| **E. Wissen/Support** | Knowledge Base, Chatbot-Wissen, How-to, Glossar | DE | mittel |
| **F. Transaktional** | Approval-/Status-E-Mails (`/api/send-approval-email`) | DE | niedrig |
| **G. Katalog/SEO** | SAP Object Catalog (`/catalog/[object]`), JSON-LD, Meta/OG, Sitemap | DE-Varianten + hreflang | mittel |
| **H. Formatierung** | Zahlen, Währung (€ statt $), Datum | `Intl`-basiert `de-DE` | niedrig |

**Bewusst sprachneutral (NICHT übersetzen):**
- Die **deterministische Evidence-Engine** und ihre Ausgaben: ABAP-Objektnamen, Tabellennamen (VBAK, BSEG …), Code, JSON-Keys, SAP-API-IDs, CDS-View-Namen.
- Die **HMAC-signierten, evidentiary Felder** der Runs (Hashes, Scores, Fingerprints). Sprache ist kein Bestandteil der Trust-Chain (das AI-Narrativ ist ohnehin `non-evidentiary` und aus dem `runHash` ausgeschlossen) → **die deutsche AI-Ausgabe berührt die Signatur-/Audit-Kette nicht.**

---

## 4. Technisches Konzept (Next.js 15 App Router)

### 4.1 Framework-Wahl
Nextjs' eingebautes i18n-Routing ist **Pages-Router-only** und für den App Router nicht verfügbar. Empfehlung: **`next-intl`** — App-Router-/RSC-nativ, unterstützt statische Generierung/ISR, Locale-Routing, `hreflang`-Helfer, `Intl`-Formatierung. Alternativ eine schlanke Eigenlösung (Message-Dictionary + Server-Helper), falls die zusätzliche Dependency vermieden werden soll; `next-intl` ist aber der geringere Pflegeaufwand.

### 4.2 URL-Strategie
**Subpfad auf gleicher Domain**: `clean-core.io/` (en, Default) und `clean-core.io/de/…`.
- Vorteil ggü. Subdomain/`.de`-Domain: eine Domain, konsolidierte Domain-Authority, einfachster Betrieb (eine Cloud-Run-Service-Instanz, ein Zertifikat).
- Struktur: `app/[locale]/…` mit `generateStaticParams` für `['en','de']`; Root-Layout setzt `<html lang={locale}>`.

### 4.3 Sprach-Erkennung & -Wechsel — **Browser-Sprache steuert die Version**
Leitprinzip: **Der User bekommt automatisch die Version seiner Browser-Sprache.** Wer mit einem deutschsprachigen Browser kommt, landet ohne Zutun auf der deutschen Fassung; alle anderen auf Englisch.

**Ablauf (SEO-sicher umgesetzt):**
1. **Middleware-Sprachverhandlung.** Bei Aufruf einer *locale-neutralen* Einstiegs-URL (v. a. `/`) verhandelt die Middleware die Sprache in dieser Reihenfolge:
   1. `NEXT_LOCALE`-**Cookie** (frühere explizite Wahl) — hat Vorrang,
   2. sonst der **`Accept-Language`-Header des Browsers** (RFC-4647-Matching, `de*` → `de`, sonst Fallback `en`),
   3. Fallback-Default `en`.
   Danach 307-Redirect auf die passende Locale-URL (`/` → `/de/…` bzw. `/en/…`), und die gewählte Locale wird als Cookie persistiert.
2. **Explizite URLs bleiben absolut.** `clean-core.io/de/...` liefert **immer** Deutsch, `.../en/...` immer Englisch — unabhängig vom Browser. Nur die *neutrale* Einstiegs-URL wird nach Browser-Sprache verzweigt. Das ist entscheidend, damit Crawler/Direktlinks/geteilte Links jede Sprachfassung deterministisch erreichen (kein „Cloaking", kein verstecktes Umleiten anhand des Bot-Headers).
3. **Sichtbarer Language-Switcher** in Header/Footer: übersteuert die Automatik jederzeit und schreibt den Cookie — die manuelle Wahl gewinnt bei künftigen Besuchen gegen die Browser-Sprache.

**Warum kein hartes Locken pro Request:** Würde man *jede* URL anhand des `Accept-Language` umbiegen, wären einzelne Sprachfassungen für Suchmaschinen nicht sauber indexierbar und geteilte Links unzuverlässig. Deshalb: **Automatik nur an der neutralen Wurzel, feste URLs pro Sprache dahinter** — beste Nutzererfahrung *und* saubere SEO.

Mit `next-intl` deckt der mitgelieferte Middleware-Negotiator (Cookie → `Accept-Language` → Default) genau dieses Verhalten ab; es muss nur konfiguriert, nicht selbst gebaut werden.

### 4.4 Message-Kataloge
```
messages/
  en.json
  de.json
```
- Namespacing pro Feature (`landing.*`, `analyze.*`, `settings.*`, `legal.*`, `errors.*`).
- Server-Komponenten laden Messages serverseitig (kein Client-Bundle-Aufblähen); Client-Komponenten via Provider nur dort, wo interaktiv nötig.

### 4.5 SEO-Pflichten (nicht optional)
- **`alternates.languages`** je Seite: `de-DE` ↔ `en` + **`x-default`**.
- **`hreflang`** in `<head>` konsistent, bidirektional.
- **`sitemap.ts`**: je URL beide Locale-Varianten + `alternates`.
- **`canonical`** pro Locale-URL (kein Cross-Locale-Canonical → sonst Deindexierung der DE-Seiten).
- **JSON-LD** pro Locale übersetzt (`inLanguage: "de-DE"`).

### 4.6 Formatierung
Zahlen, Währung, Datum über `Intl.NumberFormat`/`Intl.DateTimeFormat` mit dem aktiven Locale. TCO-Stage: **€** und deutsches Tausender-/Dezimaltrennzeichen statt `$`.

---

## 5. AI-Ausgabe auf Deutsch (größter Hebel & größtes Risiko)

Das eigentliche Produkt ist die **generierte Analyse**. Zwei Grundsätze:

1. **Generieren statt Übersetzen.** Der Gemini-Proxy (`/api/gemini`) erhält die **Ausgabesprache als Parameter** (= UI-Locale). Die Prompts werden sprach-parametrisiert: menschenlesbare Felder (`summary`, `rationale`, `narrative`, `roadmap`, `cloudRoiSummary`) auf Deutsch, **technische Struktur** (JSON-Keys, Enums, SAP-Objekt-/API-Namen, Code) bleibt Englisch/neutral.
2. **Fachbegriffe englisch im deutschen Fließtext.** Der Prompt instruiert explizit: „Antworte auf Deutsch (Sie-Form, sachlich), behalte SAP-Fachbegriffe (Clean Core, RAP, CAP, ABAP Cloud, Released API, BTP) englisch bei, übersetze keine Objekt-/Tabellennamen."

**Trust-Chain unberührt:** Das Narrativ ist bereits aus dem signierten `runHash` ausgeschlossen (`aiNarrativeMeta.evidentiary=false`). Die Ausgabesprache ändert daran nichts — Scores, Evidence, Fingerprints, Signaturen bleiben byte-identisch. **Kein Audit-/Sicherheitsrisiko.**

**Qualitätssicherung:** Der vollständige 7-Stage-Flow muss einmal end-to-end auf Deutsch durchgespielt und redaktionell gegengelesen werden (Prompts sind heute EN-getunt; deutsche Ausgabe kann anfangs anglizismenlastig sein). Gleiche Sorgfaltspflicht wie bei BYOK/Claude im Roadmap-Backlog: erst nach Durchlauf freigeben.

**Kosten/Neutralität:** Deutsche Ausgabe ist etwas token-intensiver; unkritisch. BYOK/Quota-Logik bleibt sprachunabhängig.

---

## 6. Rechtstexte (deutsche Fassung)

- **Impressum / Datenschutz**: haben bereits deutsche Rechts-Header, aber englischen Body → für die DE-Version eine **echte deutsche Fassung** (Impressum ist ohnehin dt. Recht: §5 DDG; Datenschutz: DSGVO/BDSG). Fachlich sind die Inhalte schon korrekt aufgesetzt (europe-west1, SCC, Art. 17, TDDDG-Cookie-Hinweis) — es ist reine Übersetzung, keine inhaltliche Neuerung.
- **Terms**: DE-Recht gilt bereits (Rechtswahl Deutschland, Gerichtsstand Bamberg). Für die DE-Zielgruppe ist eine **deutsche Terms-Fassung empfehlenswert**; die Haftungs-/Verbraucherklauseln (§4/§11) sollten in der deutschen Fassung anwaltlich gegengelesen werden (analog zum bestehenden Vorbehalt).
- Sprachumschaltung darf die **Einwilligung** nicht umgehen: `agreedTerms` bleibt; bei einer bindenden deutschen Fassung ggf. `termsVersionAccepted` mitschreiben (steht bereits im Backlog).

---

## 7. Terminologie-Leitfaden (Auszug)

| Englisch | Deutsche Behandlung |
|---|---|
| Clean Core, RAP, CAP, ABAP (Cloud), BTP, Fiori | **beibehalten** (Fachbegriff) |
| Released API, CDS View, Extensibility | beibehalten; bei Bedarf erklärender dt. Zusatz |
| Evidence / Evidence Pack | „Nachweis / Nachweispaket" (Marketing), „Evidence Pack" (Feature-Name) |
| Modernization | „Modernisierung" |
| Assessment / Score | „Bewertung / Score" |
| Community Edition | **beibehalten** (Eigenname) |
| Draft (output) | „Entwurf" |
| Audit Pack, Board Deck | Eigennamen beibehalten, mit dt. Erklärung |
| Sign in / Sign up | „Anmelden / Registrieren" |
| „belegt, nicht behauptet" | bereits deutsch — als Claim beibehalten (funktioniert in beiden Versionen) |

Ein zentrales Glossar (`messages/glossary.md`) sichert Konsistenz zwischen UI, Marketing und AI-Prompt-Instruktionen.

---

## 8. Rollout — Phasen (nach ROI geordnet)

| Phase | Inhalt | Ergebnis | Aufwand (grob) |
|---|---|---|---|
| **0 — Gerüst** | `next-intl`, `app/[locale]`, Middleware, `<html lang>`, Language-Switcher, hreflang/sitemap/canonical | Infrastruktur steht, `/de` erreichbar | M |
| **1 — Marketing + SEO** | Landing, Feature-Subpages, Community-Statement, Banner, Meta/OG/JSON-LD `de-DE`, deutsche Keywords | Höchster Reichweiten-ROI; DACH-Sichtbarkeit | M–L |
| **2 — Rechtstexte** | Impressum/Datenschutz/Terms DE (Terms anwaltlich) | Vertrauens-/Compliance-Basis für DE | S–M |
| **3 — Produkt-UI** | 7 Stages, Settings, Navigation, Fehlermeldungen, Formatierung (€, Datum) | Vollständig bedienbare DE-App | L |
| **4 — AI-Ausgabe** | Prompt-Parametrisierung, End-to-End-QA auf Deutsch | Deutsches Analyse-Narrativ | M |
| **5 — Wissen/Support** | Knowledge Base, Chatbot-Wissen, How-to, E-Mails | Durchgängige DE-Experience | M |

*S/M/L = klein/mittel/groß relativ; keine Personentage, da abhängig von Redaktions-/Review-Kapazität.*

**Minimal-viable-DE (falls schnelle DACH-Präsenz gewünscht):** Phase 0 + 1 + 2 (Marketing + Rechtstexte). Das liefert eine glaubwürdige, SEO-wirksame deutsche Außenwirkung, während die Produkt-UI vorerst Englisch bleiben kann (für SAP-Fachpublikum akzeptabel).

---

## 9. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| **Übersetzungs-Doppelpflege** (EN und DE driften auseinander) | Message-Kataloge als Single Source; PR-Checkliste „beide Locales aktualisiert"; keine hartkodierten Strings mehr |
| **SEO-Kannibalisierung / Deindexierung** | Strikt bidirektionales hreflang + eigene canonicals pro Locale; Sitemap mit Alternates |
| **Anglizismen/holprige AI-Ausgabe** | Prompt-Terminologie-Instruktion + verpflichtende End-to-End-QA vor Freigabe |
| **Fachbegriff-Inkonsistenz** | Zentrales Glossar; Terminologie in Prompt **und** UI referenzieren |
| **Rechtstexte unwirksam bei reiner Übersetzung** | Terms-DE anwaltlich gegenlesen (Haftung/Verbraucher) |
| **Halbe Lokalisierung wirkt unprofessioneller als keine** | Phasen als *vollständige* Auslieferungen schneiden (nie „halbe" Seiten) |

## 10. Nicht-Ziele
- **Keine** vollautomatische Maschinenübersetzung ohne redaktionelles Review (Fachdomäne zu sensibel).
- **Kein** separater Codebase-Fork — eine Codebasis, zwei Locales.
- **Keine** Übersetzung der Fachtermini oder technischer Artefakte (Code, Objektnamen, JSON).
- **Keine** Änderung an der signierten Evidence-/Audit-Kette.

---

## 11. Empfehlung

1. **Phase 0 + 1 + 2 zuerst** (i18n-Gerüst, deutsche Landing/SEO, deutsche Rechtstexte) — größter Reichweiten- und Vertrauens-ROI im SAP-Kernmarkt DACH, bei überschaubarem Aufwand und ohne Eingriff in die Produkt-Logik.
2. **`next-intl` + Subpfad `/de`** als technische Basis; die **Browser-Sprache** steuert die automatische Auswahl an der neutralen Wurzel `/` (deutschsprachiger Browser → `/de`, sonst `/en`), feste Sprach-URLs dahinter, manueller Switcher übersteuert und persistiert.
3. **AI-Ausgabe (Phase 4)** als parametrisierte Ausgabesprache — inhaltlich der stärkste Differenzierer, technisch entkoppelt von der Trust-Chain, daher risikoarm nach QA.
4. **Fachbegriffe konsequent englisch** — das ist der Unterschied zwischen „professionell für SAP-Profis" und „übersetzt für Laien".

> Kein Rechtsrat. Die deutschen Rechtstexte (insb. Terms) sollten vor Veröffentlichung anwaltlich final geprüft werden.
