# Clean-Core.io — Roadmap (Fassung 2.7)

> **Archiviert am 15.09.2026 — abgelöst durch [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Diese Fassung lag vom 12.09. bis 15.09.2026 als `docs/ROADMAP.md` im Arbeitsbaum.
> Sie bleibt hier im Wortlaut stehen, weil `docs/BACKLOG.md` (12.09.) und
> `docs/roadmap/SCHNITT-0-UMFANG.md` auf sie verweisen. Nicht mehr gültig sind vor
> allem: Datensparsamkeit (Konto = E-Mail + Handle), virtuelle Rollen am Beitrag,
> Fallfreigabe mit Rechtestufen, die Gates R1/R2 und der Teilschnittgraph. Die in der
> Tabelle genannten Pfade `docs/roadmap/…` liegen heute neben dieser Datei; nur die
> Mockups und `SCHNITT-0-UMFANG.md` sind in `docs/roadmap/` geblieben.

**Stand 12.09.2026 · gültig ab v2.9.11 · ersetzt `docs/ROADMAP-2.0.md`**

Diese Datei sagt drei Dinge und sonst nichts: **welche Version was beweist**,
**welcher Schnitt als nächstes freigegeben wird**, und **was bewusst nicht gebaut
wird**. Verträge, Stories und Abnahmefälle stehen in der Backlog-Langfassung; sie
werden hier nicht wiederholt, sondern verlinkt.

| Dokument | Rolle |
|---|---|
| `docs/roadmap/clean-core-backlog-v2_7.md` | Langfassung: 16 Epics, Verträge, Stories, Abnahmekataloge W22/C23/QA24/V25 |
| `docs/roadmap/clean-core-roadmap-v2_7-delta.md` | Rahmenkorrektur 2.7: virtuelle Rollen, Datensparsamkeit, Spielwiese |
| `docs/roadmap/delivery-slices-v2_7.json` | Der Teilschnittgraph (76 Knoten) — maschinenlesbar, Quelle jeder Reihenfolgeaussage hier |
| `docs/roadmap/clean-core-mockups-v2_7.html` | Zielbild der sechs Kernansichten (Konzept, nicht implementiert) |
| `docs/roadmap/clean-core-review-und-roadmap-2026-09-08.md` | Der Review vom 08.09. (16 Epics E01–E16) — Herkunft der Befund- und Story-IDs, die `docs/BACKLOG.md` und der CHANGELOG zitieren |
| [`docs/roadmap/ID-BRUECKE.md`](ID-BRUECKE.md) | Brücke `UX-Exx` ↔ `Exx` ↔ `CR-nn` und der Status aller 30 Befunde am 12.09. |
| [`docs/roadmap/SCHNITT-0-UMFANG.md`](../../roadmap/SCHNITT-0-UMFANG.md) | Abstimmungsfähiger Umfang für v2.10 — je Teilschnitt Arbeitspakete mit Dateien, Abnahme und Kürzungsstufen |
| [`docs/roadmap/SCHNITT-A-NEUBAU-UND-E2E.md`](SCHNITT-A-NEUBAU-UND-E2E.md) | Der Neubau in v2.11 — Datenmodell, Berechtigungsvertrag, sechs Bauabschnitte und ein E2E-Prüfplan mit 70 Tests |
| [`docs/roadmap/SCHNITT-B-UMFANG.md`](SCHNITT-B-UMFANG.md) | v2.12 — Standardabdeckung mit Evidenzstufen, Ökonomiemodell, Importe, Receipts, Spielfälle; welche Guards erweitert statt neu gebaut werden |
| [`docs/roadmap/SCHNITT-C-UMFANG.md`](SCHNITT-C-UMFANG.md) | v3.0 — Entscheidung, ArchitectureContract, Receipt, Übergabe und `covers[]`; wie der XL-Schnitt in Durchstiche zerfällt und woran er abgebrochen wird |
| `docs/BACKLOG.md` | Arbeitsprotokoll: was tatsächlich released wurde und was offen liegt |

---

## 1. Die Ausrichtung in fünf Sätzen

1. **Clean-Core.io ist die Enterprise-Spielwiese der SAP-Community.** Ein Mitglied
   spielt den vollständigen Entscheidungsfluss eines Unternehmens für ein Stück
   Custom Code durch — verstehen, gegenprüfen, rechnen, entscheiden, umsetzen,
   übergeben — allein oder mit anderen Mitgliedern. **Virtuell sind nur die
   Rollen. Die Evidenz ist echt:** echter Code, echte SAP-Katalogdaten,
   veröffentlichte Regeln, signierte Ergebnisse.
2. **Rollen gehören dem Beitrag, nicht dem Konto.** Beim Beitragen wählt das
   Mitglied einen Hut aus fester Liste („Playing as"); spielt es mehrere Rollen
   eines Falls, trägt die Entscheidung `self_play: true`. Jede Signatur sagt:
   *Rollenspiel — kein organisatorisches Mandat.* Das echte Mandat entsteht im
   Unternehmen, nachdem die Unterlage dort angekommen ist.
3. **Datensparsamkeit ist ein Vertrag, keine Absichtserklärung.** Konto =
   verifizierte E-Mail + Handle. Keine Namens-, Firmen-, Positions- oder
   Profilrollenfelder. Export und MCP geben virtuelle Rolle und pseudonyme
   Signer-ID heraus, keine Mitgliedsidentitäten.
4. **Kein Enterprise-Betrieb.** Keine Tenants, kein SSO, keine Gäste, keine
   Self-Hosted Edition, kein ALM-Adapter, keine Portfolio-Steuerung. Unternehmen
   lesen — über MCP und das Open Evidence Format, signiert, mit Scoped Tokens.
   Das führende System bleibt beim Unternehmen.
5. **Kein Wettbewerb mit Nova, Lemongrass, Kyndryl oder smartShift.** Die liefern
   Projekte mit Gewährleistung. Clean-Core.io liefert die freie, verifizierbare
   **Vorbereitung** durch die Person, die den Code kennt — vor einem Projekt oder
   neben einem laufenden.

**USP:** Vom unverstandenen Z-Programm zur belegten Entscheidung — frei,
verifizierbar, ohne SAP-Lizenz.

---

## 2. Was sich gegenüber der Roadmap vom 08.09. ändert

Der Review vom 08.09. bleibt als Befundregister und als Herkunft der E-IDs
gültig. Sein **Releaseplan ab 3.0** tut es nicht mehr:

| Thema | Roadmap 08.09. (§11) | Jetzt (2.7) | Warum |
|---|---|---|---|
| Freigaben in 3.0 | „Identitätsgebundene Freigaben, Organisationsrollen" | Mitgliedsidentität + **virtuelle Rolle** am Beitrag, `self_play`-Kennzeichen | Ein privates Community-Projekt kann kein organisatorisches Mandat vergeben — es kann nur belegen, wer als was gespielt hat |
| 3.1 „Program Execution" | Portfolio, Wellen, Programm-KPIs | **zurückgezogen** (`UX-E10-F01`) | Die Management-Sicht ist ein anderer Blick auf **denselben Fall**, keine Aggregation über viele. Wer Portfolio braucht, baut es aus MCP-/Export-Daten im eigenen Werkzeug |
| 3.2 „Ecosystem Workbench" | Kernseife-/Jira-/Cloud-ALM-Adapter betreiben | Adapter **zurückgezogen** (`UX-E09-F02:3.2`); **lesendes MCP auf 3.1 vorgezogen** (`UX-E16-F03:3.1`), Changelog 3.2 | Adapterbetrieb ist Enterprise-Betrieb. Lesen mit Scoped Token ist es nicht |
| 3.4 „Landscape & Sovereignty" | Self-Hosted Edition, private Policies | Self-Hosting **zurückgezogen** (`UX-E15-F02`); Zero-LLM bleibt **R0**, BYOK bleibt 3.5 | Der Kern ist offen; wer selbst hostet, tut das ohne Zusage, Runbook oder Support |
| Nicht-Code-Wege | implizit | ausdrücklich: Standardkonfiguration und **Stilllegung** sind vollwertige Abschlussarten | Der echte Nutzen ist oft „kein Zielcode" |
| Versionsschema | 2.9 … 3.5 | Gates **R0/G0 = v2.10 · R1 = v2.11 · R2 = v2.12 · 3.0 = v3.0 · 3.1–3.5** | Die Teilschnitte sind die Liefereinheit, nicht das Release |

Neu hinzugekommen sind drei Epics, die es im Review nicht gab: **UX-E14 belegte
Öffentlichkeit** (Facts-Service, Level-Regelseite, Offline-Verifier, Bench),
**UX-E15 souveräner Betriebsweg** (Zero-LLM, BYOK) und **UX-E16
Ökosystem-Anschluss** (Importe, Open Evidence Format, MCP).

---

## 3. Gates, Versionen, Schnitte

| Gate | Version | Was diese Stufe beweist | Teilschnitte | Größen |
|---|---|---|---|---|
| **R0 / G0** | v2.10 | Nichts behauptet mehr, als die Daten hergeben — öffentlich wie im Produkt | 10 | 3 S · 7 M |
| **R1** | v2.11 | Ein Fall, mehrere Sichten, benannte Mitglieder, gespielte Rollen | 17 | 3 S · 10 M · 4 L |
| **R2** | v2.12 | Gegenprobe gegen den Standard, Optionen mit Kosten, Importe, Spielfälle | 20 | 1 S · 14 M · 5 L |
| **3.0** | v3.0 | Entscheidung, Umsetzung und Übergabe hängen nachweisbar zusammen | 19 | 2 S · 9 M · 7 L · 1 XL |
| **3.1–3.5** | v3.1–v3.5 | MCP, Reichweite, Wiedervorlage, Musterbibliothek, beobachtete Wirkung | 10 | 1 S · 5 M · 4 L |

Die Spalte „Teilschnitte" nennt, was **zum Gate** gehört, nicht was ein einzelnes
Release liefert: v2.10 liefert nach der Entscheidung vom 12.09. acht der zehn
R0-Schnitte, die beiden übrigen kommen mit v2.11 (§5).

**Graph am 12.09.2026 maschinell gegen `delivery-slices-v2_7.json` geprüft:** 76
Teilschnitte, **keine fehlende Referenz, keine Abhängigkeit von einem späteren
Gate, kein Zyklus** (topologisch vollständig sortierbar). Größenklassen sind
Planungshypothesen für einen Maintainer mit AI-gestützter Entwicklung — S < 1
Woche, M 1–3, L 3–8, XL > 8 — keine Termine.

---

## 4. Ist-Stand: was v2.9.11 gegen die 2.7-Schnitte schon liefert

Der wichtigste Teil dieser Aktualisierung. Release 2.9 hat einiges gebaut, das im
Backlog erst später steht — und einiges aus R0 steht noch offen, obwohl es nach
„längst erledigt" klingt. Beides hier mit Fundstelle.

| Teilschnitt | Stand | Beleg | Offen |
|---|---|---|---|
| `UX-E14-F03:3.0` Offline-Verifier | **vorgezogen, im Kern da** | `lib/audit-signing-keypair.ts` (Ed25519 neben HMAC), `app/.well-known/clean-core-io-signing.json/route.ts`, `scripts/verify-pack.mjs` (kein Konto, kein Netzaufruf außer Schlüsselabruf), `app/(app)/verify-pack` | `covers[]` im Manifest, Verifier als eigenständig veröffentlichtes Paket, Trust-Seite auf den tatsächlichen Signaturumfang |
| `UX-E14-F02:R0` Level-Regelseite | **teilweise** | `app/method/levels`, beide SAP-Sichten auf den Objektseiten (v2.9.0) | Score **umbenennen** und TCO-Versprechen entfernen — `app/(app)/clean-core-score/page.tsx` trägt heute „SAP Clean Core Score & TCO Analysis" und „predict your TCO savings"; Regelversion und verlinkter Korpusfall fehlen |
| `UX-E14-F01:R0` Facts-Service | **teilweise** | Objektzahl kommt live aus `getCatalogStats()` (`app/page.tsx`), `app/llms.txt` steht | Eine `facts.json` als einzige Quelle (Hashes beider Repository-Dateien, Sync-Daten, Engine-Version), `/facts`, **Copy-CI**, die offenen Audit-Korrekturen; vier Seiten tragen noch einen `23,000+`-Rückfalltext |
| `UX-E02-F01:R0` / `UX-E07-F03:R0` Inputbindung | **teilweise** | `lib/artefact-digest.ts`, `lib/workflow-steps.ts` (ein Phasenvertrag, v2.9.5), Stale-Kaskade nach Quellenänderung (v2.9.6), unveränderliche Runs | `inputs[]` mit **Revision und Hash** statt Digest-Heuristik (QA24-13), CaseManifest, die vier typisierten Datenklassen |
| `UX-E13-F01:R0` keine Geldwerte ohne Annahmen | **teilweise** | v2.9.8: keine Einsparprognose ohne eigene Kostenwerte, Modell als Demonstration gekennzeichnet | Die monetären Felder stehen **weiter im Analyze-Prompt**: `estimatedMaintenanceCostRange`, `cloudRoiSummary` (`app/(app)/project/[projectId]/analyze/page.tsx`, `lib/types.ts`) |
| `UX-E11-F03:R0` Freigabe nur über Server | **offen** | `firestore.rules` führt `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`, `architectSignOffAt`, `approvedBy` in der **client-schreibbaren** Allowlist | Genau dieser Punkt (CR-28): Freigabefelder nur über servervalidierte Commands |
| Datensparsamkeit (2.7) | **offen** | `hooks/useUserProfile.ts`: `firstName`, `lastName`, `tier … 'enterprise'`, `orgId`, `maxTeamMembers`, `identityProvider … 'okta' / 'azure_ad'` | Konto auf E-Mail + Handle reduzieren, Pseudonymisierung beim Kontolöschen, Migration bestehender Konten |
| `UX-E15-F01:R0` Zero-LLM | **teilweise** | Die deterministische Engine läuft vor dem Modell (`lib/abap/*`, ~24 Dateien) | Ein **Sperrpfad**: Run ohne API-Key bis zum signierten Evidenzstand, LLM-Stufen einzeln zuschaltbar, „nicht erzeugt" statt leer |
| `UX-E06-F01:R0` Erhaltungsregister | **teilweise** | `lib/workflow-steps.ts` ist der Phasenvertrag, den das Register braucht | Register mit Ein-/Ausgaben, Rechten, Fehlern und Referenzfall je Fähigkeit; Commit/Build/Rules/Deployment fixiert (QA24-04) |
| `UX-E12-F02:R0` Referenzkorpus | **teilweise** | 7 Starterbeispiele (`lib/starter-examples.ts`, `abap-test-files/`), öffentlicher Referenz-Run | 18 weitere Fälle über alle 11 Konstruktklassen, Ground Truth je Zeile, Regelversion, **externer SAP-Architekten-Review** |
| `UX-E11-F03:R1` Fallfreigabe | **nicht vorhanden** | `firestore.rules`: `projects` liest nur Besitzer oder Admin | Teilen an benannte Mitglieder, Rechte Lesen/Kommentieren/Bearbeiten, Rohcode-Schalter, Widerruf, Journal — echter Neubau |
| `UX-E08-F02:R2` Receipt | **offen** | Die Testing-Seite speichert keine Verdikte (`docs/BACKLOG.md`, 11.09.) | Serverseitiges, unveränderliches Receipt mit Umfang, Umgebung, Stubs und benanntem Verifikationsmechanismus |
| `UX-E06-F02:R2` Living Documentation | **offen** | Der Generator schneidet weiter bei 1.000 Zeichen (`app/(app)/project/[projectId]/documentation/page.tsx`) | Ablösung; bis dahin jede Ausgabe mit sichtbarem Abdeckungsumfang (QA24-10) |

**Lesart:** „teilweise" heißt, der Mechanismus existiert und die Aussage stimmt
noch nicht überall. Kein Punkt dieser Tabelle zählt als erledigt, solange der
zugehörige Abnahmefall nicht gelaufen ist — der Produktstatus aller Kataloge
(W22, C23, QA24, V25) ist weiterhin `not_run`.

Dieselbe Rechnung aus Sicht des Befundregisters — welche der 30 `CR`-Befunde des
Reviews in 2.9 geschlossen wurden und wo der Rest landet — steht in
[`roadmap/ID-BRUECKE.md`](ID-BRUECKE.md). Kurzfassung: 15 Befunde sind in
2.9 ausdrücklich zitiert, CR-30 ist ohne Zitat erledigt, 14 sind in keinem Release
benannt und liegen in Schnitten, die noch nicht begonnen haben.

---

## 5. Schnitt 0 — v2.10 „Belegt" (R0/G0)

Der freigegebene Auftrag. Er baut **keine neue Fähigkeit**; er bringt die
vorhandenen Aussagen auf das Niveau, das der Rest der Roadmap voraussetzt.

> **Umfang entschieden am 12.09.2026** — Stufe „Kern + Fundament": die sieben
> Teilschnitte 1–8 der Tabelle ohne Nummer 5 und 9, plus `UX-E12-F02:R0` parallel.
> `UX-E06-F01:R0` (Erhaltungsregister) und `UX-E15-F01:R0` (Zero-LLM) rutschen auf
> v2.11. `G0:R0` wird über die **dokumentierte Sperre** geschlossen, nicht über die
> Runner-Isolation; die Datensparsamkeit ist auf Schnitt A vertagt; die
> öffentlichen Texte bekommen nur die Audit-Korrekturen und den Score/TCO-Umbau,
> nicht die neue Positionierung. Begründung, Folgen und Arbeitspakete:
> [`roadmap/SCHNITT-0-UMFANG.md`](../../roadmap/SCHNITT-0-UMFANG.md).

| # | Teilschnitt | Umfang | Braucht | Größe |
|---|---|---|---|---|
| 1 | `G0:R0` | Fachliche/Sicherheitsblocker des angebotenen Pfads beheben oder Funktion begründet sperren | — | M |
| 2 | `UX-E14-F01:R0` | `facts.json`, `/facts`, Copy-CI, Korrektur der öffentlichen Aussagen | `G0:R0` | M |
| 3 | `UX-E14-F02:R0` | `/method/levels` mit beiden Sichten und Regelversion; Score umbenannt, TCO-Versprechen raus | `UX-E14-F01:R0` | M |
| 4 | `UX-E13-F01:R0` | Monetäre Felder aus dem Analyze-Prompt; „nicht ermittelt" ohne Annahmenrevision | `G0:R0` | S |
| 5 | `UX-E15-F01:R0` | Zero-LLM als Sperrpfad bis zum signierten Evidenzstand | `G0:R0` | S |
| 6 | `UX-E02-F01:R0` | Kanonischer Referenz-/Manifestvertrag, verträgliche Migration | `G0:R0` | M |
| 7 | `UX-E07-F03:R0` | Exakte Inputbindung, konservative Ungültigkeit (Auto-Healing im geteilten Kontext aus) | `UX-E02-F01:R0` | S |
| 8 | `UX-E11-F03:R0` | Autorisierungs-/Rollen-/Speicherkonzept, **Freigabefelder nur über servervalidierte Commands** | `UX-E02-F01:R0` | M |
| 9 | `UX-E06-F01:R0` | Erhaltungsregister, Baseline-Scope, kritische Referenzfälle, Build/Rules/Deployment fixiert | `G0:R0` | M |
| 10 | `UX-E12-F02:R0` | Referenzkorpus v1: 25 Fälle mit Ground Truth, Regelversion, SAP-Primärquellen, externer Review | `G0:R0` | M |

**Reihenfolge:** `G0:R0` zuerst; danach laufen 2–5 und 9–10 parallel, 6 → 7/8 in
Reihe. Die Öffentlichkeitsarbeit (2–3) steht bewusst früh: jede Außenabnahme —
Pilot, Community-Post, Wettbewerbsvergleich — trifft zuerst auf die Site.

**Konkret im Code, aus Abschnitt 4:**
- `app/(app)/clean-core-score/page.tsx` — Titel, Beschreibung, FAQ und „predict
  your TCO savings"; der Begriff „SAP Clean Core Score" wird nicht mehr verwendet.
- `app/(app)/project/[projectId]/analyze/page.tsx`, `lib/types.ts` — monetäre
  Promptfelder entfernen, Anzeige „nicht ermittelt".
- `firestore.rules` — Freigabefelder aus der Client-Allowlist; dazu ein
  **manueller Regel-Deploy**, weil CI die Regeln nicht ausrollt.
- Ein Facts-Modul als einzige Zahlenquelle plus Copy-CI-Spec; die
  `23,000+`-Rückfalltexte verschwinden damit.
- `hooks/useUserProfile.ts` und die Registrierung — die Entscheidung zur
  Datensparsamkeit (Abschnitt 12) gehört an diesen Schnitt, nicht später.

**Exit:** V25-A09/A10 (Copy-CI bricht bei einer hart geänderten Zahl; fünf Seiten
nennen identische Werte), V25-A06 (keine Geldwerte ohne Annahmenrevision),
V25-A12 (Run ohne API-Key liefert Findings, beide Level-Sichten, Score,
signiertes Pack), QA24-A12 (Client, Server, Index und Export haben dieselben
Grenzen).

**Aus 2.9 mitgeschleppt:** `E08-F01-US01` — echte Runner-Isolation (eigener
Einmal-Runner, minimales Dienstkonto, nachgewiesene Egress-Regeln). Bis dahin
hält die Attestierung aus v2.9.1 den Live-Modus zu; das ist die korrekte Sperre,
aber es bleibt ein `G0:R0`-Punkt.

---

## 6. Schnitt A — v2.11 (R1, 17 Teilschnitte)

Aus dem Einzelwerkzeug wird ein Fall, den mehrere Sichten teilen.

> **Bau- und Prüfplan:** [`roadmap/SCHNITT-A-NEUBAU-UND-E2E.md`](SCHNITT-A-NEUBAU-UND-E2E.md)
> — Datenmodell, Berechtigungsvertrag, sechs Bauabschnitte und die E2E-Suiten.
> Kernbefund: `legacyCode` liegt im Projektdokument, das der Client ganz liest —
> „Rohcode: nein" ist mit Firestore-Regeln allein nicht erreichbar, solange das so
> bleibt. Deshalb wandert der Rohcode in ein eigenes Dokument mit eigener Regel.

**Kette:** `UX-E02-F01:R1` (Fallzuschnitt, L) → `UX-E01-F02:R1` (gemeinsamer
Arbeitsraum mit identitätserhaltendem View-Wechsel, L) → `UX-E11-F03:R1`
(Fallfreigabe an benannte Mitglieder, Widerruf, Journal, L) → `UX-E01-F04:R1`
(„Playing as", S).

Daneben: `UX-E01-F01:R1` (code-zentrierter Einstieg), `UX-E01-F03:R1` (Layer und
semantisches Zoom), `UX-E03-F01:R1` (Anforderungen mit Herkunft und Zeilenanker),
`UX-E03-F03:R1` (quellengebundener Kurzbrief), `UX-E05-F01:R1` (Threads am
Anker), `UX-E06-F01:R1` (Ein-/Ausgabeverträge, L), `UX-E07-F03:R1` (Schutz
geteilter Änderungen), `UX-E11-F01:R1` (Tastatur, Screenreader, Mobilbasis),
`UX-E11-F02:R1` (Speichern, Unterbrechen, Konflikte), `UX-E12-F01:R1`
(Performance-Baseline, erster Mehrrollenlauf), `UX-E13-F01:R1` (TCO-Grundlage in
Entscheiden), `UX-E02-F02:R1` (Einstieg ohne Code), `UX-E14-F01:R1`
(Migrationssichtbarkeit auf der Site).

**Warum „Playing as" klein ist und trotzdem zuerst zählt:** ein Enum am Beitrag —
aber es macht den R1-Beobachtungslauf überhaupt erst möglich. Ein Mitglied kann
den Fall allein durchspielen, bevor drei Mitglieder gefunden sind.

**Exit:** W22-A01/A02 (View-Wechsel erhält ID, Revision, Scope und Auswahl; keine
neue Hypothese durch Umschalten), C23-A07/A08/A09/A14 (Teilen wirkt genau wie
angezeigt, der Rohcode-Schalter hält, ein weitergeleiteter Link öffnet nichts),
V25-A16 (Self-Play trägt `self_play: true` und den Rollenspiel-Text), QA24-A15
(kalter Einstieg getrennt vom warmen Budget gemessen).

---

## 7. Schnitt B — v2.12 (R2, 20 Teilschnitte)

Die Gegenprobe gegen den Standard und die Wirtschaftlichkeit — der Teil, der aus
einem Befund eine Entscheidungsgrundlage macht.

> **Umfang:** [`roadmap/SCHNITT-B-UMFANG.md`](SCHNITT-B-UMFANG.md) — drei
> Stränge, das Substrat im Code, die Reihenfolge und der Prüfplan. Vorab zu
> entscheiden: „Coverage" heißt im Code heute **Analyse**abdeckung
> (`lib/abap/coverage.ts`), in der Roadmap **Standard**abdeckung
> (CoverageAssertion). Zwei Begriffe, ein Wort — das gehört benannt, bevor jemand
> das Falsche baut.

- **Standard-Fit:** `UX-E04-F01:R2` (CoverageAssertion mit Evidenzstufe E0–E4, L),
  `UX-E04-F02:R2` (kleine aussagekräftige Gegenprobe), `UX-E04-F03:R2`
  (Belegablage mit Quellenauftrag).
- **Bedarf:** `UX-E03-F02:R2` (beibehalten / bewusst ändern / entfallen),
  `UX-E03-F03:R2` (Prozess-, BPMN- und Regelraum, L), `UX-E02-F03:R2` (Blindspots
  als konkrete Prüfaufträge).
- **Entscheiden:** `UX-E05-F02:R2` (Optionen mit früher TCO-Simulation, L),
  `UX-E05-F03:R2` (**Decision Request** — Antwort per Link nach Anmeldung, ohne
  Mandatswirkung), `UX-E13-F02:R2` (Sensitivität), `UX-E05-F01:R2`.
- **Nachweis:** `UX-E08-F01:R2` (Szenario aus bestätigtem Zielbedarf),
  `UX-E08-F02:R2` (persistentes Demo-/Prüf-Receipt) — hier fällt das heute offene
  „Testing speichert keine Verdikte" weg.
- **Anschluss:** `UX-E16-F01:R2` (Importe ATC, Kernseife, SCMON/UPL/ST03N, L),
  `UX-E15-F01:R2` (Zero-LLM-Run mit Gegenprobe und Economics), `UX-E14-F04:R2`
  (Bench-Harness intern), `UX-E14-F02:R2` (Economics-Formelseite).
- **Spielwiese:** `UX-E01-F04:R2` — Spielfälle aus dem Referenzkorpus mit
  Ground-Truth-Vergleich. Der Einstieg ohne eigenen Code.
- Dazu `UX-E06-F02:R2` (Living Documentation, L), `UX-E06-F03:R2` (nächster
  Beitrag mit erklärtem Grund), `UX-E12-F01:R2`.

**Exit:** V25-A02 (beide Katalogsichten mit Vorrangregel und Regelversion),
V25-A05 (ein zu kurzes Nutzungsfenster erzeugt einen Prüfauftrag, keinen
Nachweis), V25-A03 (Decision Request erzeugt eine Revision, kein Mandat),
W22-A15/A16 (simuliert, übersprungen, anderer Codehash — nichts davon gilt als
bestanden).

---

## 8. Schnitt C — v3.0 (19 Teilschnitte)

Erst hier hängen Entscheidung, Umsetzung und Übergabe nachweisbar zusammen.

Kern: `UX-E05-F03:3.0` (mandatierte Entscheidung mit Kosten- und Belegrevision,
L) → `UX-E07-F01:3.0` (ArchitectureContract als Generierungseingabe, L) →
`UX-E08-F02:3.0` (Ausführungsreceipt, L) → `UX-E08-F03:3.0` (Explore-Reife,
Umsetzungsabnahme und Betrieb getrennt) → `UX-E09-F01:3.0` (Übergabe und Evidence
Pack, L). Dazu `UX-E11-F03:3.0` (signierte Commands mit virtueller Rolle),
`UX-E16-F02:3.0` (Open Evidence Format v1), `UX-E14-F03:3.0` (öffentlicher
Schlüssel und Verifier — im Kern vorhanden, siehe Abschnitt 4), `UX-E14-F04:3.0`
(Bench veröffentlicht, L), `UX-E12-F02:3.0` (fairer Vergleich, L),
`UX-E12-F01:3.0` (End-to-End-Teamabnahme, L), `UX-E11-F01:3.0`
(Accessibility-Abnahme), `UX-E13-F03:3.0`, `UX-E09-F02:3.0`, `UX-E09-F03:3.0`,
`UX-E04-F03:3.0`, `UX-E07-F02:3.0`, `UX-E07-F03:3.0`.

**Der einzige XL-Schnitt der ganzen Roadmap** ist `UX-E06-F01:3.0` — alle sieben
Fähigkeiten im veröffentlichten Kernscope ohne parallele Wahrheiten. Er hängt an
`UX-E05-F03:3.0` **und** `UX-E07-F01:3.0`; wer ihn vorzieht, baut die parallelen
Wahrheiten neu, die er beseitigen soll.

> **Umfang:** [`roadmap/SCHNITT-C-UMFANG.md`](SCHNITT-C-UMFANG.md) — fünf
> Bauteile, der XL-Schnitt in sieben Durchstichen mit Abbruchkriterium, und die
> vier Nachweise (Teamabnahme, Vergleich, Bench, Accessibility), die Termine mit
> Dritten brauchen statt Entwicklungszeit.

**Exit:** C23-A29 (manipulierte Evidenz wird erkannt, signierter Inhalt nicht
überinterpretiert), QA24-A17 (Fingerprint ohne Mandat ist kein grüner Status),
V25-A11 (Offline-Verifikation mit `covers[]`), W22-A17 (Export ist keine
Übernahme).

---

## 9. Nach 3.0 — 3.1 bis 3.5

| Version | Teilschnitte | Was dazukommt |
|---|---|---|
| **3.1** | `UX-E16-F03:3.1`, `UX-E14-F05:3.1` | MCP für Corporates (Katalog öffentlich; Fall mit Scoped Token — lesend, ablaufend, widerrufbar, protokolliert) · Vergleichsseiten „wann Nova, wann Clean-Core.io, wann beides", deutsche Kernseiten, Entity-Hygiene |
| **3.2** | `UX-E16-F03:3.2` | Cloudification-Changelog mit RSS als Auslöser für Wiedervorlagen; Integrationsrezepte Claude Code / ADT-MCP / Copilot |
| **3.3** | `UX-E07-F03:3.3`, `UX-E10-F03:3.3` | Feingranulare Auswirkungsanalyse statt Vollreview; eine Katalogänderung erzeugt Prüfaufträge nur für Fälle mit Bezug |
| **3.4** | `UX-E10-F02:3.4` | Community-Musterbibliothek (CC-BY, nur nach explizitem Veröffentlichungsreview) |
| **3.5** | `UX-E09-F03:3.5`, `UX-E12-F03:3.5`, `UX-E13-F03:3.5`, `UX-E15-F03:3.5` | Betriebsübernahme und kontrollierte Wiedereröffnung · manuell erfasste Istwerte · eingefrorene Kostenrevision gegen beobachtete Wirkung · Multi-Provider-BYOK mit Bench-Äquivalenz |

`UX-E14-F05:3.1` hängt nur an `UX-E14-F01:R0` — die deutschen Kernseiten und die
Vergleichsseiten sind jederzeit vorziehbar, sobald der Facts-Service steht. Das
ist der einzige lohnende Vorzug im ganzen Graphen.

---

## 10. Was bewusst nicht gebaut wird

| Zurückgezogen | ID | Statt dessen |
|---|---|---|
| Programmsteuerung, Portfolio-KPIs, Wellen | `UX-E10-F01` | Management-Sicht auf denselben Fall (`UX-E01-F02:R1`) |
| ALM-Adapter (Jira, Cloud ALM, LeanIX) | `UX-E09-F02:3.2` | Export mit stabilen IDs + MCP (`UX-E16-F03`) |
| Self-Hosted Edition, Runbook, Löschtests für Dritte | `UX-E15-F02` | Offener Kern, Zero-LLM (`UX-E15-F01`), BYOK (`UX-E15-F03`) |
| Gäste und Artefaktfreigaben ohne Konto | `UX-E11-F03:R2` | Teilen nur mit angemeldeten Mitgliedern |
| Vergleich über Adapterwege | `UX-E12-F02:3.2` | Bench am Referenzkorpus (`UX-E14-F04`) |
| Rollenverwaltung, Organisationskonten, Mandats-Policies, Tenants, SSO | — | Virtuelle Rollen am Beitrag; Konto = E-Mail + Handle |
| Schreibende MCP-Tools, agentisch ausgelöste Entscheidungen | — | Alles lesend; kein Agent entscheidet, transformiert oder gibt frei |

Die Konsequenz für das bestehende Produkt steht in Abschnitt 12: `tier:
'enterprise'`, `orgId`, `maxTeamMembers` und die Okta-/Azure-AD-Identitätsfelder
im Profil beschreiben eine Ausbaustufe, die nicht mehr kommt.

---

## 11. Wie der Nutzen gemessen wird

- **Traceability-Quote** — Anteil der Sätze eines Business-Narrativs mit
  Zeilenanker (V25-A01). Der Anker-Mechanismus steht seit v2.9.0; die Quote je
  Fall fehlt noch.
- **CoverageAssertion-Anteil** — wie viele Anforderungen eine Abdeckungsaussage
  mit Evidenzstufe und Zielkontext tragen.
- **„Frage → Entscheidung"** — Zeit und Zahl der Beiträge vom Eröffnen bis zur
  gebundenen Entscheidung.
- **Bench-Kennzahlen** — Präzision/Recall der Findings, Nachfolger- und
  Level-Genauigkeit in beiden Sichten, **Halluzinationsquote** (Sätze ohne
  Anker), ehrliche Abstinenz.
- **Self-Play getrennt von Mehrmitglieder-Läufen** messen und berichten
  (`UX-E12-F01`). Das Rollenspiel eines Mitglieds ist kein Teamergebnis.

Abnahmekataloge W22 (24 Fälle), C23 (36), QA24 (18) und V25 (16) gelten
unverändert; Produktstatus aller Fälle ist `not_run`, bis Läufe mit Umgebung,
Inputrevisionen und Ergebnissen vorliegen.

---

## 12. Entscheidungen

### Am 12.09.2026 geschlossen

| Entscheidung | Ergebnis |
|---|---|
| **Umfang v2.10** | Stufe „Kern + Fundament" (sieben Teilschnitte), Referenzkorpus parallel; Erhaltungsregister und Zero-LLM auf v2.11 |
| **`G0:R0` / Runner** (`E08-F01-US01`, CR-15) | **Sperre dokumentieren** statt isolieren. Der Live-Modus bleibt zu, die Grenze steht mit Grund und Wiedereröffnungsbedingung in `SECURITY.md`; die Isolation wird ein eigener Auftrag nach 2.10 |
| **Datensparsamkeit** | **Vertagt auf Schnitt A.** In 2.10 ändert sich am Profil nichts. Bedingung: keine Oberfläche und kein Text darf vorher behaupten, es würden nur Handles gespeichert |
| **Öffentliche Texte in 2.10** | Nur **Audit-Korrekturen und Score/TCO**. Die Spielwiesen-Positionierung auf Startseite und README wird ein eigener Auftrag — sinnvoll, sobald Rollen und Spielfälle existieren |

### Weiter offen

| # | Entscheidung | Warum |
|---|---|---|
| 1 | **Referenzkorpus v1** (`UX-E12-F02:R0`) | 18 neue Fälle über 11 Konstruktklassen plus **externer SAP-Architekten-Review**. Zeit, Geld, Person — er läuft parallel zu 2.10, und ohne ihn hängen Spielfälle (R2), Bench (R2/3.0) und jede Regelkorrektur |
| 2 | **Auszählung der Aktivierungsumfrage** | Die vier v3.0-Kandidaten: deutsche Oberfläche (`UX-E14-F05:3.1`), ATC-Import (`UX-E16-F01:R2`), Modellwahl/BYOK (`UX-E15-F03:3.5`), Mobil-Diff (`UX-E11-F01:R1`). Die Stimmen sollten die Reihenfolge **innerhalb** der Gates bestimmen — zwei der vier liegen früher, als die Kandidatenliste vermuten ließ |
| 3 | **Regel-Deploys einplanen** | `firestore.rules` wird nicht von CI ausgerollt. `UX-E11-F03:R0` und `UX-E02-F01:R0` ändern Client-Felder und brauchen einen manuellen Produktions-Deploy **vor** der App |
| 4 | **Wann die Positionierung umgestellt wird** | Aus der 2.10-Entscheidung verschoben, nicht verworfen: Startseite und README beschreiben weiter eine Enterprise-Suite, während die Roadmap eine Community-Spielwiese baut |

---

## 13. Arbeitsregeln, die aus 2.9 bleiben

- Ein Teilschnitt gilt erst als geliefert, wenn seine Abnahmefälle gelaufen sind
  — eine Exit-Liste ist eine Behauptung, bis sie aus Katalog und Code neu
  abgeleitet wurde.
- Testkommandos unverpackt ausführen und das **ganze** Log durchsuchen.
- Keine höhere Sicherheit im Text als in den Daten: fehlend bleibt fehlend,
  simuliert bleibt simuliert, „nicht getestet" ist nie „unterlegen".
- Bekannte fachliche Fehler werden korrigiert, nicht als Parität konserviert.
