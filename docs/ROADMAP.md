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

**Stand 18.09.2026, Abend.** `main` ist v2.13.0 (`b88c77b`): Phase 2 und Phase 5 vollständig.
Auf `dev` (`acf09bb`) liegen darüber: Phase 6 zu vier Achteln (6.1, 6.5, 6.6, 6.7), Phase 7 zu
sechs Achteln (7.1, 7.2, 7.3, 7.5, 7.6, 7.7 — 7.6 ohne Tafel, siehe BACKLOG 30), die MFA-Pflicht
für S/4-Zugang und eigenen Gemini-Schlüssel (SEC-2026-135/136/137), die Reparaturen aus den drei
Reviews zu v2.13.0 (sieben UX, sechs Sicherheit — darunter SEC-2026-152 und -236, zwei rohe
Modell-URLs auf `href`) und die ausgerollten Firestore-Regeln. Offen vor v2.16/v2.17: 6.2, 6.3,
6.4, 6.8, 7.4, 7.8; dazu die 226 hohen Befunde der QA-Vollprüfung (§14, BACKLOG 33). Die drei
Entscheidungen des Abends stehen in §9. Nächste Promotion auf `main` auf Sonnys Go.

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
Phase 4  v2.14  Austauschen .................. BPMN-Export, Signavio-Export geprüft, Kurzbrief
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
| 0.2 | Facts-Service, Copy-CI, Audit-Korrekturen. **Dazu: die Signavio-Aussagen** („validated for SAP Signavio", „Signavio-importable", „importable into SAP Signavio") auf „BPMN 2.0 XML" zurücknehmen, bis Schritt 4.3 belegt, dass unser Export in SAP Signavio Process Manager öffnet — **Signavio-Teil gebaut in v2.10.2** | M |
| 0.3 | Level-Regelseite mit Regelversion; TCO-Versprechen entfernt. **Namensfrage entschieden (Sonny, 16.09.2026): der Name bleibt „Clean Core Score“, und er wird bekannt gemacht.** Die Recherche trägt die Entscheidung: SAP führt überhaupt keinen „Clean Core Score“ — die belegten SAP-Kennzahlen im RISE-Dashboard heißen `Technical Debt Score`, `Clean Core Share`, `Clean Core Level` (A–D); gegenläufig ist allein der `Technical Debt Score` (SAP wörtlich: „a higher score indicating greater technical debt“). Markenrechtlich hält niemand „Clean Core“ in Klasse 9 oder 42, SAP hält nichts, und die USPTO hat bei einer fremden Marke einen Disclaimer auf „CLEAN CORE“ verlangt — amtlich beschreibend, also von niemandem gegen uns verwendbar. `/clean-core-score` behält URL, Canonical und seine Position 7. **Was daraus folgt:** (1) die Abgrenzung gehört sichtbar ins Produkt — Chatbot-Wissen, `llms.txt` und die Score-Seite sagen, dass dies nicht SAPs `Technical Debt Score` ist und in die andere Richtung zeigt (schließt UX-088); (2) die Regelseite mit Regelversion und die Streichung der TCO-Versprechen bleiben in diesem Schritt; (3) „bekannt machen“ ist SEO- und Inhaltsarbeit auf der bestehenden Seite, kein Umbau. **Gebaut 16.09.2026 (`dev`):** `/method/levels` nennt die Regelversion, und sie ist gemessen — ein Fingerabdruck ueber alle 48 Eingaben, die die Ableitung unterscheiden kann, dazu Release und Pruefsumme beider SAP-Dateien (`lib/abap/level-rule-version.ts`, `tests/level-rule-page-guard.spec.ts`) · fuenf TCO-Versprechen auf vier Oberflaechen entfernt, und der Guard, der sie haette fangen muessen, fing bisher nur Betraege mit Waehrungszeichen, nicht das Versprechen in Worten (`tests/money-honesty-guard.spec.ts`, neuer Test samt Fixtures) · Chatbot-Wissen, `/llms.txt` und `/clean-core-score` grenzen den Score gegen SAPs `Technical Debt Score`, `Clean Core Share` und `Clean Core Level` ab, mit der Richtung jeder Kennzahl (`tests/score-name-guard.spec.ts`; schliesst UX-088). `/clean-core-score` behielt URL, Canonical und Position. Zwei Wiedervorlagen ohne Hindernis: EUTM 019420980 „CleanCore Radar“ (angemeldet 11.09.2026, in Prüfung) und „CLEAN CORE X-RAY“ (WO 1830724, EU-wirksam) — gleiche Bauform, anderer Name | M |
| 0.4 | Keine Geldwerte ohne Annahmenrevision — **gebaut in v2.10.3** | S |
| 0.5 | Manifest- und Inputvertrag: `inputs[]` mit Revision und Hash. **Gebaut 16.09.2026 (`dev`):** `lib/input-manifest.ts` — sechs Eingaben mit Id, Datenklasse (QA24-14), Revision, `binding` und Digest, eine kanonische Form, ein Hash; im signierten Payload, gespiegelt nach `auditMetadata.inputManifest`, im Pack als `08-input-manifest.json` (signiert, nicht attestiert). `binding` unterscheidet `value` (die Bytes wurden gelesen) von `reference` (unter Namen und Revision gebunden), damit kein Lauf behauptet, fünf Megabyte Katalog gelesen zu haben; eine Eingabe der Klasse `secret-identity` wird abgewiesen. Die kanonische Form der Audit-Packs ist unangetastet, jedes zuvor versiegelte Pack verifiziert Byte für Byte (C23-A02). `tests/input-manifest.spec.ts` | M |
| 0.6 | Konservative Ungültigkeit statt Frischeheuristik. **Gebaut 16.09.2026 (`dev`):** `staleness()` und `/api/audit-pack/create` fragen nicht mehr „beweist irgendetwas, dass das alt ist?" — abweichend, unlesbar und nie aufgezeichnet sind drei Gründe und ein Urteil. Die Datenklasse entscheidet die Folge: Quelle, Katalog, Regelwerk und Zielsystem blockieren, Engine-Build und Narrativ-Modell melden nur, sonst entwertete jedes Release jedes Projekt. Ein Katalog-Resync zwischen Lauf und Export verweigert jetzt das Pack. Dazu W22-A06: Lauf und Projektstand gehen in einer Transaktion, die die Quelle neu liest — 409 statt stillem Überschreiben, Kontingenteinheit zurück. Läufe ohne Manifest werden nicht rückwirkend ungültig (C23-A02). `tests/conservative-invalidity.spec.ts` | S |
| 0.7 | Freigabefelder nur über servervalidierte Commands, manueller Regel-Deploy vor der App. **Konzeptteil nur noch: Einsicht per Einladung** (Rechtestufen, Rohcode-Schalter, virtuelle Rollen entfallen). **Datensparsamkeit gestrichen**. **Gebaut 16.09.2026 (`dev`):** sechs Felder verlassen die client-schreibbare Allowlist und werden nur noch von `POST /api/projects/{projectId}/commands` geschrieben — die Adresse kommt aus dem verifizierten ID-Token statt aus `auth.currentUser.email`, die Zeit von der Serveruhr, den Übergang entscheidet `lib/project-commands.ts`, und jede angenommene Änderung schreibt ihre `audit_events`-Zeile im selben `WriteBatch`. Über die Route entscheidet Besitz, nicht Adminrecht. Schließt SEC-2026-008. **Der Regel-Deploy war der eigentliche Befund:** das erste Nachsehen über die Rules-API zeigte in Produktion das Ruleset vom 20.08., einen Monat und drei Verschärfungen hinter dem Repository; am 16.09. um 14:43:04Z mit Sonnys Go ausgerollt und auf allen sechs Datenbanken nachgeprüft. `docs/registers/rules-deployment.json` hält fest, was live ist, `npm run deploy:rules` schreibt es mit, `npm run rules:check` vergleicht offline, `npm run rules:verify` fragt die Produktion; `tests/rules-deploy-order.spec.ts` bricht bei der einen Reihenfolge, die Produktion kaputt macht. `tests/project-command-boundary.spec.ts` hält Client, Server, Index und Export an dieselbe Liste und verweigert jedes der sechs Felder gegen die laufenden Emulator-Regeln (QA24-A12). Konzeptteil ohne Implementierung: `docs/CONCEPT-EINSICHT-PER-EINLADUNG.md` | M |
| 0.8 | **Deckungsurteil ohne Befunde ist kein Vollurteil** (UX-002, critical): leere Befundliste ergibt nicht mehr „Fully Supported" und kein „Unconditional Go-Live Approved / LOW RISK" im Board-Deck; eigener Schritt vor der übrigen Arbeit. **Gebaut 16.09.2026 (`dev`):** `lib/board-deck.ts` kennt „not determined" — null Befunde geben kein Level, kein Risiko, keine Empfehlung, und die Folien 2–4 sagen „coverage not established" statt grüner Zeilen; kein „Approved" mehr aus dem statischen Roll-up (QA 4a4321a45f3c) — der Sign-off wird gemeldet, wie er ist (recorded/self-attested/not recorded); „Resolved Objects" (Objektzahl minus Befundzahl, QA a71be0146d3c) durch „Findings by Level" ersetzt; die Delivery-Seite zeigt einen Detektorfehler statt ihn als leere Liste durchzureichen; `tests/board-deck.integrity.test.ts` verlangt das Gegenteil des Alten (QA 00875a4ff030). Die Coverage-Verdict-Karte im Analyze war schon ehrlich (`CoverageVerdict.tsx`) | S |
| 0.9 | **Beispiele kosten kein Kontingent** (Entscheidung Sonny 15.09.2026): nur die bestehenden Starter-Beispiele aus `lib/starter-examples.ts`, serverseitig am Fingerabdruck des unveränderten Quelltexts erkannt (ein verändertes Beispiel ist eigener Code); **jedes einmal frei** je Konto; **jeder weitere Start** desselben Beispiels zählt wie eine Analyse, auch gegen die Regel „dieselbe Quelle erneut ist frei"; nach den fünf Analysen geht es nur noch mit eigenem Gemini-Schlüssel (BYOK) weiter (Präzisierung Sonny 15.09.2026). Wer dasselbe Beispiel erneut startet, wird vorher gewarnt — *„You ran this example before. Running it again uses 1 of your 5 free analysis runs once the analysis completes."* — und das Kontingent wird erst **nach abgeschlossener Analyse** abgezogen, nie bei Abbruch oder Fehler. Buchführung nur serverseitig (Admin SDK, wie `chargedInputs`), kein Client-Feld. Mit: Nutzungsbedingungen §6, Welcome-Mail, `lib/clean-core-capabilities.ts` und Admin-Nutzungsansicht, die heute „re-analysing the same source is free" sagen. **Gebaut 16.09.2026 (`dev`):** die acht Beispiele aus `lib/starter-examples.ts` sind je einmal frei, serverseitig am Fingerabdruck des unveränderten Quelltexts erkannt — ein Client-Flag würde Freiläufe drucken, ein bearbeitetes Beispiel ist eigener Code und kostet. Jeder weitere Start desselben Beispiels ist eine gewöhnliche Analyse, bewusst an der Wiederholungsbefreiung vorbei. Buchhaltung in `users/{uid}.starterExamplesUsed`, nur vom Admin-SDK geschrieben, also ohne Regel-Deploy; die Reservierung bleibt atomar, ein gescheiterter Lauf gibt sie zurück — auch der 409-Pfad aus 0.6, der sie vorher im bezahlten Zweig abzog. Die Zeile steht vor dem Klick (ADR-039); Terms §6, Willkommensmail, Fähigkeitenliste, Admin-Panel und First-Run-Guide sagen jetzt, was ein zweiter Start kostet. `tests/starter-example-quota.spec.ts` | S |
| 0.10 | **Demo-Projekt für jedes Konto** (Entscheidung Sonny 15.09.2026, `DESIGN.md` §6.1.2): ein vollständig durchgespieltes, deutlich markiertes Projekt aus einem echten Lauf des achten Starter-Beispiels `Z_MM_PO_APPROVAL` (Emergency purchase approval — derselbe Fall wie in den Mockups), **eine** Demo für alle Konten (keine Kopie je Konto, Anmeldung unverändert), bedienbar ohne Folgen — Zustand nur im Browser, „Reset demo", zählt nicht aufs Kontingent. Im heutigen Produkt mit den sieben Stufen; mit wiederkehrender Einladung zu Beispiel oder eigenem Code (höchstens eine je Bildschirm, nie blockierend). Die Tour mit rund zwölf Stationen wächst mit dem Arbeitsraum (3.0.7). **Gebaut 16.09.2026 (`dev`):** `/demo/{stage}` zeigt die sieben Stufen an einem echten Engine-Lauf über `Z_MM_PO_APPROVAL` — 30 Befunde mit Zeilenankern, Clean Core Score 43, die Route mit ihren Annahmen, die Konstrukte, die die Engine ausdrücklich nicht beurteilt hat; jede Zahl zur Laufzeit gerechnet, also veraltet auch nichts. Aus der Vertrauenskette baulich gehalten, nicht per Flag: eigene Route ohne Projektdokument, ohne Run-, Pack-, Export- oder Modellaufruf, ohne Firestore-Schreibzugriff, dazu `assertNoTrustChain`, das beim Bauen wirft. Die drei Stufen, die in einem echten Lauf ein Modell schreibt, tragen die deterministische Hälfte und sagen auf der Stufe, was der Modellteil hinzufügen würde — überzeugenden Modelltext von Hand zu schreiben wäre die Erfindung, die dieses Produkt ablehnt. Bedienbar ohne Folgen (`localStorage`, „Reset demo"), eine Einladung je Schirm, im Dashboard als markierter Eintrag über der Projektliste. `tests/demo-project.spec.ts` | M |
| 0.11 | **Vertrauen vor dem Hochladen** (Entscheidung Sonny 15.09.2026, `DESIGN.md` §6.1.3): im heutigen Upload eine Zeile zu Terms §5 und §8 ohne Häkchen und die Karte „Your code and your trust" — EU-Speicherung, Zugriff nur für das Konto, Server-Proxy und verschlüsselter Schlüssel, signierte Läufe, kein Tracking, Löschen, öffentliches Sicherheitsmodell, Training: mit dem Community-Schlüssel gilt der bezahlte Gemini-API-Tarif — kein Training durch Google; mit eigenem Schlüssel die Bedingungen des eigenen Google-Kontos (Sonny 15.09.2026; die Datenschutzerklärung nennt den bezahlten Tarif des Community-Schlüssels ausdrücklich, bevor die Karte es sagt); „free community project"; „Our security model is public" verlinkt auf `SECURITY.md` im öffentlichen Repository. Der Zugriffssatz nennt das Admin-Konto, solange `firestore.rules` ihm Lesezugriff auf Projekte gibt, und die Datenschutzerklärung nennt diesen Zugriff, bevor die Karte live geht. Jede Aussage mit Link auf ihre Quelle; ein Guard prüft, dass die Karte nur Aussagen enthält, die in Terms, Datenschutzerklärung oder `SECURITY.md` stehen. **Gebaut 16.09.2026 (`dev`):** eine Zeile über dem Upload ohne eigenes Häkchen (die Terms werden bei der Registrierung akzeptiert) und die Karte „Your code and your trust". Die Karte ist keine Copy: jede Zeile ist ein Anspruch in `lib/trust-claims.ts` neben dem Satz aus Terms, Datenschutz oder `SECURITY.md`, der ihn trägt, und `tests/trust-card-guard.spec.ts` fällt um, wenn ein Beleg nicht wörtlich im Dokument steht, ein Link nicht ankommt oder die Karte Text zeigt, den das Register nicht führt — geprüft auf der gerenderten Seite, weil ein Satz in einer toten Konstanten kein Beleg ist. Dafür mussten die Dokumente nachziehen: Datenschutz §3 (der geteilte Community-Schlüssel ist ein bezahlter Gemini-Key, die Free-Tier-Einschränkung gehört zu BYOK), §5 (Löschung nimmt Projekte und Quellcode), §8 (wer ein Projekt öffnen kann), Terms §2 (freies Community-Projekt ohne bezahlte Stufe). Weggelassen, weil nichts sie trägt: „Others see it only if you invite them" — Teilen kommt mit Phase 5 | S |
| 0.12 | **Signierte Exporte lesen nur aus dem Run** (QA-Vollprüfung 15.09.2026, §14: 70c8917150e7, 13c6115ec642 — kritisch, eigener Schritt vor der übrigen Arbeit): Audit-Pack-Generatoren und die initiale Worklist beziehen jedes Feld, das in einen signierten Hash eingeht, aus dem unveränderlichen Run — nichts aus dem Projektdokument (dessen Felder der Besitzer per `firestore.rules` schreiben darf), nichts aus der Modell-Narrative. Was Nutzer oder Modell beisteuern, steht in einem eigenen, unsignierten und so benannten Teil (`00-provenance.md` sagt es heute nur, die Signatur deckt es trotzdem). Mit Test, der ein clientseitig geändertes Feld im signierten Teil rot macht. **Gebaut 16.09.2026 (`dev`), Variante A nach Sonnys Entscheidung:** `lib/audit-pack-build.ts` baut die Eingabe der signierten Generatoren aus einer benannten Liste von Run-Feldern; Name, Zielarchitektur, Sign-off, Freigebender, Begründung und Workflow-Status stehen in `07-user-attested.md`, das `manifest.json` unter `attested` führt — der Name ist in den signierten Hash gebunden, der Inhalt nicht (`lib/audit-pack-canonical.ts`, eine Implementierung für Aussteller und Web-Verifier). Beide Verifier zeigen die Datei als „user-attested · not covered by the signature"; die Narrative-Gaps gehen nur noch in die Projekt-Worklist, nicht in den signierten Run. `tests/audit-pack-signed-input.spec.ts` ändert jedes client-schreibbare Feld und prüft, dass kein signiertes Byte sich bewegt. Signierbar werden die Freigabefelder erst mit 0.7 | M |
| 0.13 | **Zweiter Faktor vor der Sitzung** (§14: cfafefac08ec — kritisch; c4c4f5112a00): mit aktivem zweiten Faktor gilt die Anmeldung erst nach dem Code. Die mutierenden Serverrouten prüfen das bereits (`assertMfaSatisfied`); die Client-Sitzung und der Firestore-Lesezugriff des Kontos entstehen aber schon nach dem Passwort. Lösung ohne Änderung an Sign-up und Konto (Regel oben): Firebase-Multi-Factor oder ein serverseitig gesetzter Claim, den `firestore.rules` und die Seiten prüfen — manueller Regel-Deploy vor der App wie in 0.7. Dazu: Wiederherstellungscodes (`CC-XXXX-YYYY`) sind im Anmeldedialog eingebbar, nicht nur beworben. **Gebaut 16.09.2026 (`dev`), Variante 2 nach Sonnys Entscheidung** — Firebase-native TOTP-MFA (Identity Platform): Firebase gibt kein ID-Token vor dem zweiten Faktor heraus, die Server-Gates lesen `firebase.sign_in_second_factor` vom Token (`lib/mfa-gate.ts`), kein Cookie, kein Rules-Deploy. Enrolment im Browser gegen Firebase Auth (`multiFactor().enroll`), `POST /api/mfa/enrolled` liest den Faktor zurück und setzt das Flag, `POST /api/mfa/disable` entfernt ihn per Admin-SDK nur aus einer Sitzung mit Faktor. Der eigene TOTP-Apparat (Routen, `lib/mfa.ts`, `lib/totp.ts`, `mfa_session`, `mfa_secrets`, `mfa_pending`, Backup-Codes) ist weg; Wiederherstellung über `scripts/mfa-reset.ts` durch den Admin (c4c4f5112a00 damit gegenstandslos: es gibt keine Codes mehr, die Oberfläche bewirbt keine). Voraussetzungen, die nur Sonny setzt: Identity-Platform-Upgrade in der Firebase-Console, dann `scripts/mfa-enable-totp.ts --apply`; sein Admin-Konto (Google, verifiziert) richtet den Faktor in den Einstellungen neu ein. **Nicht in CI:** der Auth-Emulator kann kein TOTP — Gate-Entscheidung und Negativpfade sind getestet, Enrolment und Faktor-Login werden auf `dev` gegen das echte Auth geprüft | M |
| 0.14 | **Konto, Schlüssel und Rechte melden nur, was geschah** (§14: 569fc1c41e35, cc5845ec545e, 8c7c26a637d1, 1c5a5c920b77, 19054f8f195f, e538b51c10f5, 85e767799587, 4f7643df8c3e, 990aa825e15f, 0ce6b0b508e6): kein `ok`, wenn ein Teilschritt der Löschung oder des Widerrufs scheiterte; Kontolöschung vollständig (auch Umfrageantworten) oder abgebrochen, nie „Auth weg, Daten da"; Admin-Widerruf wirkt sofort und der Firestore-Spiegel entscheidet nichts; Fremdantworten (S/4-Metadaten) mit Zeit- und Größengrenze; Ratenlimit-Schlüssel ohne Client-Header (auf Cloud Run ist der letzte `X-Forwarded-For`-Eintrag der echte); MFA-Einrichtung nur einmal je Konto abschließbar; Profil-Lesen einer alten Sitzung erreicht keine neue **Gebaut 16.09.2026 (`dev`)**: der Admin-Anspruch ist das einzige Rechtesignal (der Spiegel `users.isAdmin` zeigt nur an), ein Entzug widerruft die Refresh-Token und ein Token mit Anspruch wird gegen den Widerruf geprüft; Löschen eines Geheimnisses meldet seinen Fehler statt `ok`; die Kontolöschung nimmt das Konto zuletzt, löscht Umfrageantworten mit und nennt bei Abbruch, was bleibt; Ratenlimit-Schlüssel aus dem letzten `X-Forwarded-For`-Eintrag; S/4-Antworten mit Größen- und Zeitgrenze; Profil-Abrufe einer alten Sitzung überschreiben die neue nicht mehr. Sechs neue Specs; `lib/firebase-admin.ts` lädt das Auth-Modul erst, wo es gebraucht wird (sonst laden die Specs unter Node 20 nicht) | M |
| 0.15 | **Korrekturen in Dashboard, Admin und den sieben Stufen** (§14, hoch: 9b1af76b65c9, 2ea4b0048642, 2d714ac42b63, e184fc0c59bf, 3bb4158405d8, e078d502e983, d967e435917c, 0c3362018102; mittel: 57876fae0053, aad1ecf24d47, 8d9184e6f94f, 210bafeb4c8b, 024ec609bc86, 06f7c0c56a6c, 4db1e81408f4, 217726b404c9, 40e1db9fd37a, 03380a33a523, ce37b706107d, f480d96b63d1, 883625214774, 989dafdac359, 4362479eb86e, 823a09338d58, 72556d36c205): Jahr-1-ROI rechnet die Investition mit; die Transformation startet nicht doppelt und speichert keine leere Modellantwort als fertig; nur ABAP wird als ABAP angenommen und der Sicherheitsscan läuft vor jeder Analyse, auch aus dem Textfeld; BYOK- und Enterprise-Konten sperrt das Kontingent nicht; 1 MB gilt; Exporte (Confluence-HTML, Vorschau) escapen Modellwerte; der Beispiel-abapGit-Export ist aktivierbar; Admin-Mailfehler sind Fehler; „Suspended" heißt nicht „Pending". Was 3.0 ersetzt, bekommt nur den kleinsten Fix **Gebaut 16.09.2026 (`dev`)**: Kontingentregel einmal in `lib/run-quota-rule.ts` (BYOK und Enterprise sperrt sie nicht mehr), ABAP-Prüfung in `lib/abap-input-check.ts` statt „nicht leer", Sicherheitsscan im Analyse-Start selbst, Modellkopien der signierten Kennzahlen werden vor dem Speichern verworfen, leere Modellantworten werden nicht als Transformation gespeichert, Jahr-1-ROI rechnet die Investition mit, Escaping in beiden Confluence-Exporten (`lib/export-safety.ts`), Admin meldet nicht zugestellte Mails, „Suspended" heißt „Suspended", 1 MB gilt, abapGit-Paket aktivierbar. Neue Guards: `abap-input-gate`, `export-escaping-guard`, `sample-package-guard` | M |
| 0.16 | **Skripte und Workflows** (§14: a4f7e6aef79b, 1e47826dd2c5, 5a660ef009dc, f4561d983d92, 6a774e02134e, 6d40362efbf6, 2b0cacd91960, 14edf99a390c, 0a0ff08e1793, 6500f93e60fd, 5dbe58873773, 230989f67624, f7110f3d6619, 8ccb1b1b765b): Review-Workflow mit gepinntem Installer und ohne Secrets im Reviewer-Job; Migrationsprüfung über ganze Dokumente statt drei Felder; Send-Record oder Idempotenz-Schlüssel **vor** dem Provider-Aufruf (Survey und Community-Mail); Mail-„Erfolg" nur bei angenommener Zustellung; Escaping in Admin-Mails; der Security-Agent bekommt seinen eigenen CISO-Brief als Prüfobjekt, der UX-Agent auch `lib/*-content.ts` und die Mails. **Die Survey-Workflows bleiben endgültig aus** (Sonny, 16.09.2026: „kann generell ausbleiben, ist eh vorbei ohne Erfolg" — `docs/BACKLOG.md`). **Gebaut 16.09.2026 (`dev`)**: der Review-Workflow läuft auf einem an SHA-256 gepinnten Artefakt, ohne `--always-approve` und ohne Repo-Token im Schritt, der PR-Inhalt liest; die Migrationsprüfung vergleicht einen kanonischen Hash jedes Dokuments und rechnet jeden signierten Lauf nach (`manifestVersion: 2`); die drei Agenten-Briefs, die Code als Prompt lädt, stehen im Prüfumfang des Security-Agenten; der UX-Agent sieht `lib/*-content.ts`, den Guide und alle Mail-Renderer; Community-Mail über den Outbox (Claim vor Versand) mit `Idempotency-Key`, fehlende Mail-Konfiguration in Produktion ergibt 503 statt `success`, fehlgeschlagenes One-Click-Opt-out 503, Bounce-Detail überlebt spätere Scanner-Events, Escaping im Wochenbericht; Umfrage-Antworten pro Frage serialisiert, `linkFetchedAt` transaktional. `2b0cacd91960` widerlegt (Outbox-Umbau), Restrisiko über den Idempotency-Key geschlossen | M |
| 0.17 | **Tests, die prüfen, was sie behaupten** (§14: d943e1fc71a5, d163622eab8e, f3428b0782a9, 812cbce3b485, bcbe2c770c8a; dazu 6a1e32c0b973, 1738da3d6e64, cca300dfb572 und 6f7a14516006 aus den Delta-Prüfungen vom 16.09. — die Override-Auszeichnung im Analyze-Schritt ist als Entscheidung getestet (`lib/route-override.ts`), aber nicht am gerenderten Bildschirm; das braucht ein Projekt mit abweichender Route im Seed, also dieselbe Maschinerie wie die anderen drei, — der Transaktionsnachweis für `linkFetchedAt` in `tests/survey-guard.spec.ts` liest ebenfalls nur Quelltext (zwei gleichzeitige Server-Renderings der Umfrageseite sind von einem Spec aus nicht steuerbar), — `tests/profile-session-guard.spec.ts` prüft den Generationenschutz per Quelltext-Regex statt den Hook auszuführen (dafür braucht es einen Renderer für Hooks, den es im Repo noch nicht gibt), und die Reihenfolge-Sicherung in `tests/mfa-coverage-guard.spec.ts` liest Quelltext, weil der Auth-Emulator kein TOTP kann — Laufzeitnachweis erst mit einem zweiten Firebase-Projekt oder auf `dev` gegen das echte Auth): Emulator-Tests für die MFA-Pflicht der Vertrauenskette und die Audit-Pack-Erzeugung statt Quelltext-Grep; ein `rejects.not.toThrow('…')` ist kein Beweis; TCO-Guard gegen die Seite statt gegen eine Kopie ihrer Arithmetik, mit dem Null-Fall; Provenance-Zuordnung statt Kardinalität; die siebte Stufe im gerenderten Style-Guard **Teilweise gebaut 16.09.2026 (`dev`)**: `lib/tco-model.ts` (Seite und Test rechnen dieselbe Funktion, alte Kopie in `tco-finite-guard.spec.ts` abgelöst; dazu `tests/tco-page-rendered.spec.ts`, das die Zahlen auf dem Bildschirm auf den Euro gegen das Modell prüft) · `tests/mfa-trust-chain-gate.spec.ts` (MFA-Verweigerung auf **allen** Routen, die auf den Faktor prüfen, mit Zustandsvergleich vorher/nachher; der Katalog `tests/helpers/gated-routes.ts` beweist seine eigene Vollständigkeit und fand dabei drei ungelistete Routen: Kontolöschung, Jira-URL, Gemini-Schlüsseltest) · `tests/analyze-route-override-rendered.spec.ts` (Override-Auszeichnung am gerenderten Bildschirm) · `lib/survey/link-fetch.ts` + `tests/survey-link-fetch.spec.ts` (zwei gleichzeitige Ansprüche, genau einer gewinnt) · siebte Stufe im gerenderten Style-Guard. **Offen:** `1738da3d6e64` (der Profil-Hook braucht einen Hook-Renderer, den das Repo nicht hat), `6a1e32c0b973` (die Reihenfolge in `/api/mfa/disable` braucht injizierbare Auth- und Firestore-Doubles in der Route), `d163622eab8e` (Provenienz statt Kardinalität in `reference-analysis`), `812cbce3b485` (Trust-Chain-E2E gegen echte Antworten statt gegen Bezeichner), `96423cbf366f` (der Referenzfall-Durchlauf in `tests/preservation-register.spec.ts` oeffnet jede Stufe im Browser, prueft dort aber nur Stepper, Stale-Hinweis und Lieferschalter — nicht, dass die Stufe die Ausgaben zeigt, die das Register ihr zuschreibt; hoert eine Stufe auf, ihr Inventar zu rendern, waehrend eine tote `.field`-Referenz im Quelltext stehen bleibt, meldet das Register weiter Erfolg. Das Register kennt die Ausgaben je Stufe bereits, es fehlt der Griff vom Feldnamen zum sichtbaren Element) Dazu offen aus der Prüfung des Security-Agenten selbst: `42a7d6a55d3b` — die Verlusttoleranz der beiden CISO-Aufrufe ist an den Bausteinen getestet, nicht am Einstiegspunkt; dafür müsste `audit.mjs` seine Orchestrierung als Funktion exportieren, statt beim Import eine Prüfung zu starten. **Die oben als offen geführten Punkte sind nachgezogen (16.09.2026, `dev`), damit ist der Schritt fertig:** `812cbce3b485` — die Trust-Chain-E2E läuft gegen die Emulatoren (422 ohne Lauf und nichts gemintet, ein Archiv, dessen Signatur `/api/export/verify` annimmt und ein Byte Unterschied nicht, 409 für den nachträglich veränderten Lauf, 410 für `/api/export/sign`); `1738da3d6e64` — der notierte Blocker war falsch, der Hook läuft im Browser, und der Test hält jede Antwort mit dem Benutzerdokument des ersten Kontos zurück (dabei herausgekommen: die bewachte Verzweigung wird beim Kontowechsel nie betreten, weil `firestore.rules` den laufenden Lesezugriff schon verweigert — der Hook-Schutz ist Tiefenstaffelung, und der Test sichert beides); `6a1e32c0b973` — `retireSecondFactor` in `lib/mfa-disable.ts` nimmt Auth und Firestore als Parameter mit Produktions-Vorgabe, die Route übergibt nichts, und `tests/mfa-disable-order.spec.ts` fährt beide Fehlerpfade; `d163622eab8e` — die Referenzläufe werden zugeordnet statt gezählt (eine Obergrenze hält auch bei null); `96423cbf366f` — das Register kennt den Griff vom Feldnamen zum sichtbaren Element (`shows` · `onlyAfterARun` · `notShown` · `notYetAnchored`, beidseitig geprüft). **Weiter offen, weil Agenten-Maschinerie:** `42a7d6a55d3b` | M |
| 0.18 | **Engine-Korrekturen aus der Vollprüfung** (§14: eac6118f1eac, 45737310a1d7, 778c72a5cde2, 14d4000c4586, 9fb67cc60860, ba5757ea1a85, 297e73fb33a7, a4fe4e2de430, a48a8ba01b64; Regel in §11: bekannte fachliche Fehler werden korrigiert): `code-assessment.ts` bekommt die Unterscheidung interne Tabelle / Open SQL, die `evidence-model.ts` schon hat; unbewertete Konstrukte (`assessCoverage`) drücken den Score und den Routing-Text statt „100 %, trivial"; LQUA ist Quant, nicht Lagerplatz, VBKD sind kaufmännische Daten, nicht Partner; `SELECT` in einem Literal ist kein SELECT; fehlende Interfaces sind nicht „fully resolved"; ein Satz mit einer erfundenen Zitation ist nicht verankert; Perzentile nach der Aggregation, `Infinity` ist keine Messung. Jeder Punkt mit Referenzfall im Korpus. **Gebaut 16.09.2026 (`dev`):** `lib/abap/open-sql-discrimination.ts` (interne Tabelle vs. Datenbankschreibzugriff; `MODIFY dbtab FROM TABLE itab` bleibt ein Schreibzugriff) · `assessCoverage` drueckt Score und Routing-Text, statt „100 %, trivial" zu melden (`tests/coverage-not-clean.spec.ts`) · VBKD und LQUA aus `sap-api-catalog.ts` entfernt · `lib/abap/select-parser.ts` maskiert Literale zeichenweise, ein SELECT in einem Text ist keine Abfrage (`tests/select-parser-literals.spec.ts`) | M |

**Das Auto-Heal ist heute wirkungslos — gefunden am 18.09.2026 beim Bau von 0.17.**

Unabhängig davon, welche Datei es zu reparieren versucht: `/api/run-tests` führt seit
E07-F02 bewusst die **gespeicherten** Artefakte aus und liest `code`/`tests` aus dem
Body nicht mehr. Der Wiederholungslauf sieht die Reparatur deshalb nie, und am Ende
steht immer „nothing was saved". Die Zielbestimmung ist seit 0.17 richtig — das ändert
daran nichts, es macht den Fehlschlag nur ehrlich.

Es zu schließen heißt, sich zwischen zwei Dingen zu entscheiden, und beide sind
Produktentscheidungen, keine Fehlerbehebungen:

- **Entweder** die Zusicherung aus 0.2 umstoßen, dass eine Reparatur erst nach einem
  Lauf ohne Build-Fehler geschrieben wird — dann liefe der Wiederholungslauf auf
  bereits geschriebenem, ungeprüftem Code;
- **oder** der Route einen **quittungslosen Kandidatenmodus** geben: sie führt einen
  mitgeschickten Kandidaten aus, schreibt aber **keine** Quittung und **keine**
  Verdikte, sodass nichts daraus grün werden kann. Erst der Lauf über die
  gespeicherten Artefakte quittiert.

Der zweite Weg erhält beide Zusicherungen und ist deshalb der wahrscheinlichere — er
braucht aber eine klare Trennung im Code und in der Oberfläche, damit „ausprobiert"
nie wie „belegt" aussieht. Bis dahin gilt: das Auto-Heal probiert, und es hilft nicht.

| daneben | **Schnelleres Deploy auf Cloud Run** (Entscheidung Sonny 16.09.2026, Option 2 aus der Analyse der QA-Rundenzeit): eine Runde auf `dev` dauert 14–17 min, davon Modell-Review 8–125 s, `validate` ~7 min (npm ci 33 s, Build 83 s, Playwright 190 s) und das Cloud-Run-Deploy ~7 min — ein Buildpack-Build ohne Cache. Ziel: Dockerfile mit Layer-Cache über Artifact Registry, Deploy in 2–3 min; `validate` bleibt als Gate davor. Eigener Schritt an `deploy.yml` mit Probelauf auf `dev`, nie nebenbei; das Modell bleibt Luna (Kosten 0,3–7 Cent je Runde, kein Hebel) | M |
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
| 1.1 | **Erhaltungsregister:** die sieben Stufen mit Eingaben, Ausgaben, Voraussetzungen, Fehlern und je einem Referenzfall; Commit, Build und Rules fixiert. Nichts geht im Umbau unbemerkt verloren (QA24-A04, W22-A04). **Gebaut 16.09.2026 (`dev`):** `docs/registers/preservation-register.json` als Daten statt Prosa, `docs/PRESERVATION-REGISTER.md` für Zweck, Grenzen und Änderungsweg, `tests/preservation-register.spec.ts` in drei Schichten: `lib/workflow-steps.ts` auf den eigenen Referenzfällen, dann Stufenquellen, `firestore.rules` und `app/api/runs/create/route.ts` Feld für Feld gegen das Register, dann sieben Referenzfälle im Emulator, jede Stufe im Browser geöffnet — ohne einen einzigen Modellaufruf. Neun Grenzen hat es beim Schreiben gefunden und als Grenzen festgehalten statt als Parität konserviert, jede mit einer Zusicherung, sodass ein Fix das Register zwingt mitzugehen. Nachgezogen aus 0.5/0.6 (`inputManifest` unter den signierten Feldern; ein Marker, der nichts mehr trifft, ist ein Fehler statt eines leeren Vergleichs) und aus 0.17 (der Griff vom Feldnamen zum sichtbaren Element) | M |
| 1.2 | **Zero-LLM-Sperrpfad:** Run ohne API-Key bis zum signierten Evidenzstand; Modellstufen einzeln zuschaltbar; „nicht erzeugt" statt leer (V25-A12). **Gebaut 16.09.2026 (`dev`):** der Modellaufruf ist ein Abschnitt der Analyse, der fehlen darf — ein Konto ohne Schlüssel bekam vorher 503 und *keinen* Lauf, obwohl jeder Befund der Seite ohne Modell gerechnet wird. Jetzt wird über den deterministischen Belegen signiert, der Server entscheidet aus der einen Tatsache, die er prüfen kann (kam eine Narrative an?) und schreibt `modelParticipation: 'none'`, `model.provider`/`modelId` und `aiNarrativeMeta.responseHash` als `null` und `model:narrative` mit Revision `none` ins Eingabemanifest; der *Grund* steht bewusst nicht im Lauf. Fünf Modellstufen einzeln zuschaltbar über `users/{uid}.modelStages` (nur Admin-SDK, kein Regel-Deploy nötig), `/api/gemini` beachtet den Schalter serverseitig und antwortet mit einem Code. „Nicht erzeugt" statt leer in fünf Stufen, im Audit-Pack und auf der Übergabeseite — vorher zeigte die Analyse-Stufe bei einem signierten Lauf ohne Narrative wieder das Upload-Formular. `tests/zero-llm-path.spec.ts`, jeder der sechs Fälle vorher rot gezeigt | S |
| 1.3 | **Anker-Fix:** Parser und Prompt verwenden die `CC-`IDs der Engine; Test mit echten Engine-IDs. **Vorgezogen, gebaut in v2.10.1** | S |
| 1.4 | **Arbeitsraum-Schale hinter dem Schalter:** Kopfzeile wie im Mockup (Pfad, Projekttitel, Metazeile mit Manifest, Revision, Quellstand, Engine, Regeln aus 0.5), sieben Status-Chips — jeder ehrlich, „nicht begonnen", solange nichts da ist —, Ebenenleiste, Werkzeugleiste mit den sieben Stufen unter dem Kopf. **Öffnet in der Business-Sicht** und hat einen Bereich „Nicht bestimmt" (`DESIGN.md` §2.3, §4). **Gebaut 16.09.2026 (`dev`):** `/project/{id}` hat noch nie etwas geliefert und liefert jetzt die Schale — für alle außer einem Administrator mit eingeschalteter Vorschau bleibt das genau so. Schalter `users/{uid}.workspaceShell`, allein von `POST /api/workspace-shell` über das Admin-SDK geschrieben; das Feld steht nicht in `userClientUpdateKeys()`, also war **keine Rules-Änderung nötig**, und gelesen wird es nur zusammen mit fortbestehendem Adminrecht. Sieben Status-Chips, fünf davon aus `workflowSteps()` über die eine Brücke `statusOfPhase`, die die Regel aus 1.7 hält: `success` wird aus `proven` erreicht und aus nichts sonst. Need und Standard haben in diesem Release kein Artefakt und sagen „not started" mit dem, was fehlt, statt sich die Routing-Empfehlung zu leihen (`DESIGN.md` §5.3). Metazeile aus dem Input-Manifest des signierten Laufs (0.5) mit „not recorded" statt Gedankenstrich, Ebenenleiste mit Anzahl und „More", Werkzeugleiste mit den sieben Stufen, Öffnen in der Business-Sicht (ADR-002), Sicht nur in `?view=` (ADR-018); Bereich „Not determined" aus `assessCoverage` mit Grund und Zeile, drei Zustände mit drei Sätzen, „keine" formuliert als Grenze der beantworteten Frage | M |
| 1.5 | **Gestaltung nach `DESIGN.md` als Komponenten** (Karte, Tag, Status-Chip, Herkunfts-Chip in drei Formen, Anker, Artefaktzeile, Message Strip, Empty State, „Why?"-Popover, Segmented Control, Icon-Button): semantische Tokens statt Hex-Literale, vier Button-Stile, Schrift ≥ 11 px, **eine Herkunftsliste `lib/provenance.ts`** mit Guard gegen frei formulierte Badges; Style-Guard nach dem Muster von `tests/workflow-style-guard.spec.ts`. Dazu aus den Mockups: die weiteren festen Listen mit eigener Form (Objektstatus, Evidenzstufe, Level, Regel-Eigenschaft, `DESIGN.md` §4.1), Formular mit Value States, Filterleiste leer vs. „No findings match these filters", modale Message Box, Toast, Code-Fläche, Kontrast-Guard; **Laufanzeige** für lange Läufe (Kosten vor dem Klick, Abbrechen, Verlassen, Fehler-Strip mit Aktion, §2.8); **`lib/model-text.ts`** gegen KI-Spuren in Oberfläche, Exporten und Mails (§3.1). **Gebaut 16.09.2026 (`dev`):** `--cc-*`-Tokens in `app/globals.css` plus `--color-cc-*` als Tailwind-Aliase (Aliase statt Kopien — ein zweites Literal ist ein zweiter Wert, der auseinanderläuft), Primäraktion `--cc-brand-strong` mit 5,0 : 1 statt 3,3 : 1. `lib/provenance.ts` hält die neun Werte, `CcProvenanceChip` nimmt einen Wert und keine Beschriftung — ein falsches Badge lässt sich damit nicht schreiben, nur falsch werten, und das fängt TypeScript; die abgelösten Schreibweisen stehen im Code, damit ein roter Guard sagt, was gemeint war. Dazu die übrigen festen Listen aus §4.1 je mit eigener Form und die Komponenten in `components/cc/` — keine nimmt ein `className`, das ist das Loch, durch das jeder Style-Guard ausläuft. `lib/model-text.ts` gegen KI-Spuren (Blockliste bricht, Stilliste meldet); einziger Fund in der eigenen Copy: „AI-powered explanations" in der Chatbot-Wissensbasis. Galerie unter `app/(app)/admin/design-system`, Guards `cc-token-guard` und `cc-provenance-guard` — Quelltext, wo ein Loch zugemacht wird, gerendert, wo es auf die Wirkung ankommt: der gerenderte Guard fand, dass die Message Box portiert werden muss, weil `inert` sich vererbt und der Fokus sonst nie in der Box ankommt | M |
| 1.8 | **„My workspace" als List Report** (`DESIGN.md` §2.2, Mockup s7): Live-Filter, Tabelle mit Objektstatus, laufende Analyse mit Abbrechen, gescheiterter Lauf mit „Retry" und „Run without model", *Stale*; die Demo als erste Zeile und die Karte „Your turn", solange kein eigenes Projekt existiert (0.10). **Gebaut 16.09.2026 (`dev`):** hinter demselben Admin-Tor wie 1.5, bis 1.4 den Schalter baut; `/dashboard` bleibt für jedes Konto unverändert. `lib/workspace-rows.ts` druckt für ein nie analysiertes Projekt ein Wort statt einer Null — null ist nicht null Befunde —, die Demo ist die erste Zeile und trägt „partial", nie „handed over", *Stale* steht als Herkunfts-Chip neben dem Objektstatus und nicht als Status (§4.1), leer und „kein Treffer" sind zwei Komponenten mit zwei Sätzen, der Preis steht vor dem Klick, der Lauf zeigt Etappen statt Prozenten, und Abbrechen sagt, was es nicht erreicht. Neu in `components/cc/`: `ObjectIdentifier` und `Table`. `lib/analysis-run.ts` ist die eine Folge Evidenz → Narrativ → signierter Lauf, von zwei Bildschirmen aus startbar, damit eine aus der Tabelle gestartete Analyse keine andere Worklist erzeugt als eine aus der Stufe. `tests/workspace-list-report.spec.ts` liest die gerenderte Seite: neun Tests, jeder einzeln rot bewiesen | M |
| 1.6 | **Kein Dark Mode:** Theme-Schalter in den Einstellungen und die `.dark`-Überschreibungen in `app/globals.css` entfallen, mit Guard (Entscheidung 15.09.2026; erledigt UX-023, UX-044, UX-061, UX-062). **Gebaut 16.09.2026 (`dev`):** was entfernt wurde, war nie ein Theme — 58 Zeilen `.dark`-Überschreibungen färbten mit `!important` eine handverlesene Liste von Utility-Klassen um, und alles, was die Liste nicht nannte, blieb hell: die Dashboard-Tabelle behielt ihren weißen Grund unter einem fast schwarzen Body. Weg sind die Überschreibungen, die 15 verbliebenen `dark:`-Varianten, der Light/Dark/System-Wähler, der Theme-Bootstrapper in der Shell, die `localStorage`-Kopie und jeder Griff nach `prefers-color-scheme`. Das Profilfeld `theme` bleibt stehen, dokumentiert als tot und von nichts mehr gelesen — es zu löschen wäre eine Migration von Kontodaten —, und die Einstellungen schreiben es nicht mehr. `tests/dark-mode-guard.spec.ts` prüft Quelle und Wirkung: `class="dark"` an `<html>` darf an rund 600 Elementen keine einzige Farbe bewegen; beide Hälften vorher rot gezeigt. Erledigt UX-023, UX-044, UX-061, UX-062 — die UX-Prüfung dieser Release sagte von außen dasselbe: die zitierten Stellen waren nie dunkel, sondern helle Flächen unter einem fast schwarzen Body | S |
| 1.7 | **Ehrliche Kodierung bis zur Schale:** Stepper und Verification Rail zeigen „done" gleich, Grün nur für belegt; der Tenant-Tab heißt „Tenant-Verbindung prüfen", der Sperrhinweis steht einmal, mit dem BYOT-Freischaltweg (`DESIGN.md` §5.3, Entscheidung 15.09.2026). **Gebaut 16.09.2026 (`dev`):** die Verification Rail malte die Phase, auf der der Leser stand, grün, bevor sie irgendetwas anderes fragte — auf der Economics-Seite, die in dieser Fassung niemand abschließen kann, war der grüne Punkt das Sicherste auf dem Schirm, während der Stepper dieselbe Phase gelb zeigte; und fünf der sieben Grün standen für Arbeit, die nichts geprüft hat. `phaseTone` in `lib/workflow-steps.ts` ist jetzt die eine Regel für Stepper, Rail und Dashboard-Zeile: grün genau dann, wenn `RailStep.proven`. `done` bleibt, was es war, damit `workflowSummary().next` niemanden auf einer Phase parkt, die er nicht abschließen kann; die Position des Lesers ist keine Farbe mehr. Der Tenant-Tab heißt „Check tenant connection" (ADR-004), und der Sperrhinweis steht einmal statt dreimal — drei Absagen lesen sich wie drei verschiedene, und keine sagte, wie man die Verbindung bekommt; jetzt steht der BYOT-Weg dabei, samt dem Satz, dass eine BYOT-Freigabe G0:R0 nicht aufhebt. `tests/phase-honesty-guard.spec.ts` misst beide Oberflächen mit `getComputedStyle`; `tests/locked-paths-guard.spec.ts` verlangt jetzt genau einen Sperrhinweis statt mindestens drei | S |
| 1.9 | **Korpus-Vergleicher mit Facettenstatus** (CR-05): je Facette Prüfstatus, Nenner und Umfang — „nicht geprüft" heißt nie *agree*; der echte `buildProcessSkeleton`-Output wird gebunden (Kanten, Guards, opake Bereiche, Ereignisse), Nachfolger typisiert 0/1/n/unknown geprüft, ein rein syntaktischer Ankercheck heißt *anchor_validation_passed*; die sechs Mutanten M01–M06 des Gegenreviews werden Ratsche — jeder muss in seiner Facette rot werden. **Geschärft und vorgezogen am 22.09.2026 (Entscheidung Sonny; §16 V1) — vor 2.15, weil ohne diesen Schritt keine Engine-Regel je durch den Korpus rot werden kann:** `tests/helpers/korpus-comparison.ts:321` ruft heute `buildProcessFacts`, **nie** `buildProcessSkeleton`; `compareSkeleton` (:637–690) vergleicht nur `gateway`/`loop` zeilenweise, weder Knotenart noch Kante; Zeile 685 sagt wörtlich „die Engine baut kein Prozessskelett", was seit `lib/abap/process-skeleton.ts` falsch ist. Gemessen: über die 47 `agree`-Fälle der Klasse `skelett` waren **71 von 390 Sollknoten (18,2 %) überhaupt vergleichbar**; CC-001 steht auf `agree` mit dem Grund „2 von 8 Knoten vergleichbar", und die Klasse `fachsaetze` steht 68-mal auf `agree` mit dem Grund „die Engine erzeugt keine Fachsätze" — ein Grün, das „nicht geprüft" heißt. Künftig vergleicht `skelett` **Knotenart je Anker über alle Arten aus `SkeletonNodeKind`**, Kanten mit Art (`sequence`/`conditional`/`default`/`loop-back`/`boundary`), die Gateway-Klasse (2.15), die Lane-Zahl mit Beweis (2.16) und Parallelität (2.17); ein Fall ist nur `agree`, wenn **mindestens die Hälfte** seiner Sollknoten vergleichbar war, und `baseline.json` nennt je Fall Zähler und Nenner. **Fertig, wenn** kein `agree` in `skelett` unter 50 % steht, kein `reason` mehr „baut kein Prozessskelett" enthält, M01–M06 in ihrer Facette rot werden und CC-001 „8 von 8 verglichen" sagt | M |

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
| 2.4 | **Fachliche Benennung:** das Modell benennt nur Skelettknoten **und die Lanes, die 2.16 aus dem Code ableitet — es schlägt keine Lane vor, für die der Code keinen Beweis hat** (geändert 22.09.2026, §16 V3). Ein Element ohne Anker heißt „unbelegt". Lanes tragen den Mockup-Satz: rekonstruiert aus AUTHORITY-CHECK und Benennung, keine organisatorische Aussage. **Der Benennungsvertrag ist seit 22.09.2026 ausdrücklich zweiteilig** (Entscheidung §9 Nr. 20): `sourceToken` bleibt unverändert das Token aus der Quelle und trägt den Anker; daneben steht ein **freigegebenes** `businessLabel`. Ein Modellvorschlag ist ein Vorschlag und gilt nie automatisch als freigegeben; ohne Freigabe zeigt die Oberfläche den `sourceToken`. Ein deterministischer Prüfer weist einen Vorschlag zurück, der einen Repository-Bezeichner enthält — Tabelle, CDS-View, OData-Name, Funktionsbaustein, `SCREAMING_SNAKE`, Z-/Y-Präfix oder registrierter Namensraum; in 12.168 SAP-Aktivitätsbeschriftungen kommt so etwas dreimal vor (0,02 %) | M |
| 2.5 | **BPMN-Ansicht im Arbeitsraum** (bpmn-js, lesend): Legende Rekonstruiert · Bestätigt · Nachgewiesen; Klick auf ein Element öffnet die Code-Karte mit markierten Zeilen; Traceability-Quote je Modell gespeichert. Ohne Maus nach DESIGN.md §5.7: gleichwertige Schrittliste „Map | Steps", ein Tab-Halt mit Pfeiltasten, benannte Knoten, gerenderter Tastatur-Test | M |
| 2.6 | **BPMN-Export richtig:** gültiges XML (Escaping, CR-21), stabile IDs, Bedingungen an den Kanten, automatisches Layout, Anker und Status in einem eigenen Namensraum unter `extensionElements`; eingeklappte Teilprozesse als echte BPMN-Teilprozesse, Fremdsysteme als Pool mit Nachrichtenfluss, Datenspeicher; Schemaprüfung im Test; `.bpmn` auch im Delivery-ZIP. Dazu Export PNG und PDF der Prozesskarte mit Herkunfts-Chips und Ankern — kein öffentlicher Link (`DESIGN.md` §5.3, §5.7) | M |
| 2.7 | **Erster Blick:** nach Import oder Beispiel baut sich der Arbeitsraum in vier Etappen auf — Code gelesen · Prozess erkannt · in Fachsprache · „Das ist Ihr Prozess" mit Prozessname, Traceability, Entscheidungen, Regeln und „nicht bestimmt". Jede Zahl aus dem Run, überspringbar, `prefers-reduced-motion` zeigt den Endzustand. Dazu die drei Coach Marks und die vorab beantwortete Frage in „Ask this case" aus den Verzweigungen des Codes, ohne Modellaufruf (`DESIGN.md` §5, §6.2). **Davor „New project"** nach `DESIGN.md` §6.1.1: ein Satz Kern, drei Zeilen, was anders ist, Clean Core in drei Blicken (Bedeutung, Level A–D, Herkunft der Evidenz mit Stand des Katalogabgleichs), dann Beispiel oder eigener Code mit der Kontingent-Zeile aus 0.9 | M |
| 2.8 | **Versteckte Geschäftsregeln:** Literale in Bedingungen — Toleranzen, Werke, Buchungskreise, Kunden- und Lieferantennummern, Datumsgrenzen, Ausnahmelisten — deterministisch als Regelkandidaten mit Anker; jeder wird in 3.5 beibehalten, geändert, entfällt oder ins Customizing verschoben (Feedback 15.09.2026). Einstufende FORMs (`IF/ELSEIF`-Ketten auf Literalen) öffnen als Entscheidungstabelle am Business-Rule-Task | M |
| 2.9 | **Große Prozesse navigieren** (`DESIGN.md` §5.9): Übersicht der Phasen als eingeklappte Teilprozesse, Ebenen mit Pfadzeile, Gliederungsbaum statt flacher Schrittliste, Problemzeile je Teilprozess, Minikarte, „Show paths to here" und „Main path", Laufvarianten aus den Selektionsschaltern, Overlays als Filter, Suche öffnet die Ebene des Treffers, stabile Anordnung, Ebene und Auswahl in der URL. Abnahme am 1.000-Zeilen-Beispiel: jeder Schritt in höchstens drei Aktionen erreichbar, per Tastatur wie per Maus | L |
| 2.10 | **Referenzkorpus v2.1 im Repository:** `docs/korpus/referenzkorpus-v2.1.md` (das Fallbuch mit Rahmen, Regelregister, Negativliste, Gegenreview, Autorenberichten) und `tests/korpus/cases/CC-nnn/` mit `source.abap`, `profile.json`, `expected.json` je Fall, erzeugt aus dem Fallbuch durch `scripts/korpus/build-bundle.mjs` (deterministisch, Quellenhashes geprüft). `tests/korpus-engine.spec.ts` lässt die Engine gegen alle 68 Fälle laufen und vergleicht Befunde, Level, Objekte, Skelettknoten; **Ratsche** wie bei abaplint: `tests/korpus/baseline.json` führt jede Abweichung mit Urteil (`engine-defekt` · `korpus-offen` · `nicht-vergleichbar`) und Grund, ein Fall, der übereinstimmte und es nicht mehr tut, macht den Lauf rot, eine still verschwundene Abweichung ebenfalls. Fundstellen aus öffentlichen Repositories stehen im Repository **nur als SHA-256 des Ausschnitts** — kein fremder Code, und auch kein Zeiger darauf: weder URL noch Commit-ID noch Pfad, denn elf von zwölf Quellen sind ohne Lizenz und die tragenden sind nach allen Indizien unautorisiert hochgeladene Arbeitgeberbestände. Dieses Repository ist öffentlich und Git vergisst nichts; ein Link mit Commit und Zeile wäre ein dauerhafter, indizierter Zeiger auf eine fremde Offenlegung, auch nachdem ihn jemand wieder herausnimmt. Der vollständige Nachweis liegt außerhalb. Gehalten von `tests/korpus-engine.spec.ts` („docs/korpus/ trägt keinen Zeiger auf ein fremdes Repository"), das auf jeden Hostnamen und jede 40-stellige Hex-Kette anschlägt. Die Fallquellen selbst sind durchweg **konstruiert** — kein Fall stammt aus einem Kundensystem. Der Korpus wird nie als Prompt- oder Trainingsmaterial des Modells verwendet, das er prüft. **Erweitert am 22.09.2026 um acht Fallformen (Entscheidung Sonny; §16 V5):** der Korpus prüft heute **Konstrukte**, aber keine **Prozessform** — 68 Fälle, 5–36 Zeilen, Median 15, Skelette im Median 5 Knoten; in allen 68 `expected.json` steht keine Lane, kein Pool, keine Nachricht, kein Parallel-Knoten, und 31 von 66 Quellen haben gar kein Gateway. Gemessen an einem Bestand von 1.246 Referenzdiagrammen prüft **kein einziger Fall eine Prozessform, die dort häufiger als 9 % vorkommt**; die beiden häufigsten (28,9 % und 18,9 %) haben null Fälle. Dazu kommt je eine konstruierte Fallfamilie: **F1** Einstieg über Funktionsbaustein, BAdI oder RAP-Handler mit Rückmeldung · **F2** Übergabe zwischen ≥ 2 verschiedenen `AUTHORITY-CHECK`-Objekten oder Dialog + Update-Task · **F3** aRFC mit `RECEIVE RESULTS` in `PERFORM … ON END OF TASK` · **F4** ≥ 2 `STARTING NEW TASK` vor einem `WAIT UNTIL` · **F5** Rework-Schleife (`DO`/`WHILE` um einen Aufruf, Abbruch auf einem Statusfeld) · **F6** mittelgroßer Prozess, 150–400 Zeilen, ≥ 3 Geschäftsentscheidungen auf Strukturkomponenten · **F7** Kette ohne Entscheidung mit mehreren Beteiligten (BAPI → `COMMIT` → IDoc/Mail → Protokoll) · **F8** Dialogprozess (Modulpool, mehrere PAI-Module, `CASE sy-ucomm`). Jede `expected.json` trägt Lanes mit Beweis, Gateway-Klasse (2.15) und Parallelität (2.17). Konstruiert wie alle übrigen Fälle: kein Kundencode, kein fremdes Diagramm, keine Rollenliste; die Einschränkung vom 16.09.2026 (kein externer Prüfer) gilt weiter. **Fertig, wenn** `manifest.json` je Familie ≥ 1 Fall nennt, jeder neue Fall durch 1.9 mit ≥ 50 % vergleichbaren Knoten läuft und durch abaplint sowie die metamorphen Eigenschaften gezogen ist | M |

| 2.11 | **Was der Korpus an der Engine findet** (Grundlinie vom 17.09.2026, `tests/korpus/baseline.json`): 24 Engine-Defekte in drei Familien, dazu 134 Aussageklassen, die die Engine noch gar nicht produziert. Die Familien, nicht die Einzelfälle, sind die Arbeit. **Stand 18.09.2026: 1 Defekt übrig** (CC-050 · level — eine Produktentscheidung, kein Bugfix), 130 Aussageklassen noch nicht produziert — siehe unten | L |
| 2.12 | **Wirkungsstatus im Grundmodell** (CR-06, nach Entscheidung §9 Nr. 15): `IN UPDATE TASK` = Registrierung, `COMMIT` = Anstoß, `ROLLBACK` = Verwerfen als Zustände des kanonischen Modells — Sichten verdichten, entfernen nicht; V1/V2, lokaler Update-Modus und `AND WAIT` nur im belegten Kontext; CC-026/CC-027 als Abnahme | S |
| 2.13 | **Funktionale Methodenaufrufe als Wirkungsträger; „unreachable" nur mit Nachweis** (CR-07): `lo_stmt->execute_update( … )` in einer Zuweisung erscheint als Wirkungsknoten oder als ausdrücklich opake ausführbare Aufgabe mit SQL-/Quellenbezug; `CATCH` bleibt als möglicher Pfad verbunden, ohne Kontrollflussnachweis *unknown/not-modelled* — CC-034 als Abnahme; in Arbeit seit 19.09.2026 | S |
| 2.14 | **Einstieg wählen** (CR-08): Methode, FORM oder Dynpro-Ereignis als Startpunkt; der Mehrdatei-Fall fordert fehlende Includes nach; ein Interface-only-Upload meldet „nicht anwendbar" mit Erklärung statt 0 Schritte — am 18.09. hatten 9 von 74 Korpusquellen keinen Einstieg. **Ergänzt 22.09.2026 (§16 V5):** ein `FUNCTION name.` öffnet ein Startereignis mit dem Namen `name` und `implicit = false` — **nie** `START-OF-SELECTION`, wie heute. Eine öffentliche `METHOD` und ein `MODULE … INPUT` liefern je ein Startereignis statt `no-entry-point`; gemessen ergeben heute Klassenmethode, Modulpool und nackte `FORM` **null Knoten**. Ob es ein Nachrichten-Start ist (RFC, IDoc, BAdI), trägt die Quelle nicht: dann *Not determined* mit Grund, nicht geraten — im Referenzbestand beginnen 14 % der Prozesse mit einer Nachricht, aber das ist kein Beleg über eine einzelne Quelle | M |
| 2.15 | **Ein Return-Code ist die Wirkung eines Schritts, keine Entscheidung des Prozesses** (22.09.2026, §16 V2; nach 1.9): ein Gateway, dessen sämtliche Bedingungen `sy-subrc`, `sy-tabix`, `IS ASSIGNED`/`IS BOUND` oder `lines( )` prüfen und dessen einziger Vorgänger ein Aufruf-, Lese- oder Schreibknoten ist, wird **nicht** als `exclusiveGateway` exportiert; sein Fehlerarm hängt als Randereignis am Schritt — das Randereignis, das `walkFunction` heute **zusätzlich** erzeugt, wird das einzige. Der Bedingungstext bleibt **wörtlich** am Fluss (Regel 6 unberührt), der Zweiginhalt bleibt erreichbar, ein Gateway auf einem Geschäftsfeld bleibt Gateway, und die Technical-Ebene zeigt den Return-Code weiter. Gemessen: **29 von 68 Gateways (42,6 %)** der acht ausgelieferten Beispiele sind technisch (ZLEGACY 10/28, Z_MM 16/31); Entscheidungen je Aktivität 0,82 gegen 0,10 im Median des Referenzbestands. Die Doppelzeichnung ist am Code belegt — `lib/abap/process-skeleton.ts:1500–1525` hängt das Randereignis an und lässt das `IF` stehen, das danach als Gateway läuft; `tests/abap-process-skeleton.spec.ts:288–299` pinnt nur das Paar, nicht das Gateway dahinter. **Sprengweite:** keine signierte Zahl betroffen (das Skelett erreicht den Run nicht), Revision 1 bestehender Projekte bleibt (3.2), die Demo wird ohnehin neu erzeugt (3.0.7). **Restrisiko, benannt:** eine fachlich gemeinte Entscheidung, die als `sy-subrc` geschrieben ist (`SELECT SINGLE … IF sy-subrc <> 0` = „gibt es nicht"), wandert vom Gateway ans Randereignis — Inhalt bleibt, Form wird „Ausnahme am Schritt"; das ist die Lesart des Zielformats, nicht bewiesen, deshalb bleibt die Bedingung sichtbar. **Fertig, wenn** Aktivitäten mit Randereignis, auf die ein `sy-subrc`-Gateway folgt, **0** sind (heute 5/5), der Anteil rein technischer XOR im Export ≤ 10 % liegt (Setzung, kein gemessenes Optimum) und jeder entfernte Zweig als Fluss mit Bedingungstext erreichbar bleibt | M |
| 2.16 | **Lanes aus vier Beweisarten, deterministisch** (22.09.2026, §16 V3; nach 1.9): `AUTHORITY-CHECK OBJECT x` (eine Lane je **verschiedenem** Objekt) · `CALL SCREEN`/Dynpro/Popup/ALV (Mensch) · `IN UPDATE TASK`/`IN BACKGROUND TASK`/`VIA JOB` (System) · `DESTINATION` (Fremdsystem — bleibt Pool). Lane-Zahl = Zahl **verschiedener** Beweise, nie mehr, mit Obergrenze; ohne Beweis genau eine Lane; jede Lane trägt einen Zeilenanker; Status `reconstructed`, nicht *Model proposal*. **Der Lane-Name ist der Beweis-Token** (`V_VBAK_VKO`, `SCREEN 9000`, `UPDATE TASK`); ein fachlicher Name kommt nur als freigegebenes `businessLabel` daneben (2.4, §9 Nr. 20) und **nie** als Berufsbezeichnung aus einer Liste. Export: `laneSet`/`lane` mit `flowNodeRef`, Anker im Erweiterungs-Namensraum (2.6); Karte: Lanes als Bänder (2.5); Übergabe ist ein Sequenzfluss über die Lane-Grenze, kein Symbol und kein Nachrichtenfluss. `DESIGN.md` §5.8 wird von „Lanes (Vorschlag)" auf „Lanes (rekonstruiert, aus vier Beweisarten)" gezogen, mit ADR. Gemessen: `laneSet` kommt in `lib/bpmn/` **nullmal** vor, während `lib/abap/process-skeleton.ts:1375` `AUTHORITY-CHECK` ausdrücklich zum Lane-Beweis erklärt; `ZLEGACY_ORDER_FULFILLMENT_AUDIT` enthält alle vier Beweisarten (L197/L205, L510, L670, L402) und ergäbe **2 Lanes** — im Referenzbestand haben 71 % der Diagramme ≥ 2 Lanes, Median 2. **Sprengweite:** eine Lane ist die einzige Stelle, an der das Produkt etwas über Menschen sagen könnte; §8 verbietet Rollenlisten und Rollen-Mandate, deshalb Name = Code-Token und `tests/process-naming.spec.ts:326` („CFO wird verworfen") gilt auch für deterministische Lanes. Was Signavio mit `laneSet` tut, ist **ungemessen** — 4.3 führt Lanes bereits als Protokollpunkt. Treiben die Bänder in 2.5 den Schritt über M: teilen in 2.16a (Skelett + Export) und 2.16b (Karte). **Fertig, wenn** ZLEGACY genau 2 Lanes mit Ankern trägt, ein Fall ohne Beweis genau eine, jeder `flowNodeRef` auflöst, keine Lane ohne Anker existiert, kein Lane-Name ein Token enthält, das die Quelle nicht enthält, und ein Beweis in nicht erreichtem Code nicht zählt | M |
| 2.17 | **`DESIGN.md` §5.8 und Code in Deckung bringen** (22.09.2026, §16 V4). **(a) Paralleles Gateway — der Code gibt nach:** `STARTING NEW TASK` ×≥ 2 vor einem `WAIT UNTIL` (oder `RECEIVE RESULTS` in `ON END OF TASK`) ergibt einen `parallelGateway`-Fork; ein Join nur, wenn `WAIT UNTIL` da ist — der Referenzbestand erlaubt Fork ohne Join (91 von 172 Paralleldiagrammen haben nur eins von beiden), also keine Join-Pflicht. Ein einzelnes `STARTING NEW TASK` bleibt Service-Task. Grund: 434 parallele Gateways im Bestand, das Versprechen steht öffentlich in §5.8, `startingNewTask` wird bereits erfasst — es fehlen die Knotenart und die Auswertung von `WAIT UNTIL`. **(b) `LOOP AT` — `DESIGN.md` gewinnt die Voreinstellung, der Code behält die Ausnahme:** ein `LOOP AT`, dessen Körper den Block nicht verlässt, wird **eine** Aktivität (oder ein eingeklappter Teilprozess) mit `multiInstanceLoopCharacteristics isSequential="true"`; ein `LOOP AT` mit `EXIT`/`RETURN`/Fehler-Ende und `DO`/`WHILE` mit Statusabbruch bleiben Zyklus — dort trifft das Argument aus `lib/bpmn/model.ts` Entscheidung 2 wörtlich zu, der Fluss verlässt den Körper. Der Befund, der es entscheidet: unser **eigener** Hinweis `gateway-without-condition` schlägt an ZLEGACY sechsmal an (gepinnt in `tests/process-editor.spec.ts:97`), und **alle sechs sind `LOOP AT`-Gateways** — das Produkt warnt vor seiner eigenen Zeichnung. **Nicht messbar und so im ADR festzuhalten:** wie der Referenzbestand „je Position" zeichnet — Mehrfach-Instanz-Marker sind aus der Quelle nicht extrahierbar; (b) ist eine Entscheidung über die Lesart, gestützt durch die eigene Regelkollision, kein Beleg von außen. **Fertig, wenn** die Parallel-Sonde 1 Fork, 1 Join und 2 parallele Service-Tasks liefert und ohne `WAIT UNTIL` einen Fork ohne Join; ZLEGACY 0 `gateway-without-condition`-Treffer hat (heute 6) und seine 11 Schleifen nach Kriterium als Marker oder Zyklus gezeichnet sind; `DESIGN.md` §5.8 die Ausnahme trägt, `model.ts` Entscheidung 2 umformuliert ist und ein ADR in `docs/design/decisions.md` steht | M |

**Zwei Nachzieher an 2.6, gefunden beim Bau von 2.9 (18.09.2026):**

- **Ein Wächter ist keine Verzweigung.** Ein führendes `CHECK p_rfc = abap_true.`
  wird als bedingter Fluss **ohne Umgehungskante** gezeichnet. Wer ihm wie einer
  Verzweigung folgt, behauptet, das Programm ende am Schalter: `p_rfc` aus ergäbe
  „31 von 65 Schritten laufen nicht", tatsächlich laufen 59. 2.9 unterscheidet
  deshalb Wächter von Verzweigung; die saubere Lösung ist eine Umgehungskante in
  `lib/bpmn`, damit die Datei selbst die Wahrheit trägt und nicht ihr Leser.
- **`dataAssociations` kommen nicht aus dem Export heraus.** Die Tabellen je Knoten
  stehen in der BPMN nur als Text-Referenzen (`<bpmn:sourceRef>`). Ein
  `dataByElement: Record<id, { reads, writes }>` auf `BpmnExport` würde das
  Data-Overlay ohne einen zweiten XML-Parser möglich machen — ohne das bleibt es
  ungebaut (2.9, bewusst).

**Fertig, wenn**
- jeder Task, jedes Gateway und jede Lane einen Zeilenanker trägt oder sichtbar
  „unbelegt" ist, und die Quote angezeigt wird (V25-A01);
- eine Regel außerhalb der ersten 1.000 Zeichen im Modell erscheint (QA24-A10);
- Namen mit Umlauten, `&` und Anführungszeichen schemagültiges XML ergeben (CR-21);
- ohne API-Key das Skelett mit technischen Namen erscheint;
- ein syntaktisch gültiges Modell nie als belegter End-to-End-Istprozess
  ausgewiesen wird;
- für Korpusfälle mit Prozess-Ground-Truth das Skelett übereinstimmt.

**Die drei Defektfamilien aus 2.11 — Grundlinie 17.09.2026, Stand 18.09.2026**

Die Grundlinie vergleicht je Fall fünf Aussageklassen: 340 Paare. Am **17.09.2026**
stimmten 178 überein; von den 162 Abweichungen waren 134 **nicht vergleichbar** (die
Engine kennt die Aussageklasse nicht — Fachsätze durchweg, Level und Objekte bei den
neuen Klassen), 4 **korpus-offen** und **24 Engine-Defekte** in drei Familien.

Am **18.09.2026**, nach den Strängen C (Familien a und b), D (Familie c) und K (die
Restwurzel von a), stimmen **205** Paare überein, 130 sind nicht vergleichbar, 4
korpus-offen — und **ein** Engine-Defekt ist übrig. Die 27 neuen Übereinstimmungen sind
nicht durch eine nachgiebigere Messung entstanden. Die Vergleichsschicht
`tests/helpers/korpus-comparison.ts` hat genau **eine** neue Brücke bekommen (R01(c) →
R33, das Lesen über eine logische Datenbank am `GET`-Ereignis), und zwar dort, wo die
Engine die Aussage tatsächlich führt; vier Fälle sind von „nicht vergleichbar" zu einem
*sichtbaren* Urteil gewandert, weil die Engine die Aussageklasse jetzt überhaupt
produziert. Bewusst **keine** Brücke für R29, R15, R26, R12 und R13b: dort führt die
Engine keine Befundmarke, und eine Brücke hätte „verfehlt" gezählt, wo nichts behauptet
wird. Der nächste ehrliche Schritt dort ist eine Befundmarke für die Typabhängigkeit
(R29) — dann wird CC-045 · befunde zu einem echten Vergleich statt zu einem Schweigen.

**(a) Die Note las den Katalogeintrag zur Hälfte — 9 Fälle, geschlossen.**
CC-001, CC-002, CC-007, CC-008, CC-049, CC-051, CC-062, CC-063, CC-067 wurden als **D**
benotet, wo der Korpus **C** sagt. Die Wurzel: die Engine nahm die schlechteste
Katalognote über alle Objekte und ignorierte dabei die **Zugriffsart** und den
**katalogisierten Nachfolger**. KNA1 zu *lesen* ist C mit Nachfolger `I_CUSTOMER` (R01);
nur ein nicht unterstützter *Schreibzugriff* ist D (R02). Beide Angaben stehen in
derselben Katalogquelle. Die Restwurzel war **CC-045 · level**, erst sichtbar geworden,
als die Engine das Objekt dank Familie (c) überhaupt sah: eine Typabhängigkeit
(`TABLES`, `TYPE`, `INCLUDE STRUCTURE`, `SELECT-OPTIONS … FOR`) trug keine Zugriffsart im
Sinne der Benotung, also fiel `gradeSapObjectUse` auf die Namensnote D zurück, wo R29 die
Note aus dem Objektzustand verlangt. Sie ist jetzt eine **eigene Verwendung**
(`reference`) und wird nach dem Zustand des Objekts benotet — C für eine Tabelle, die SAP
nicht freigibt, statt eines D, das dem Programm vorwarf, an der Anwendung vorbeizugreifen,
obwohl es keine Zeile anfasst. Eine Typreferenz auf einen *eigenen* Namen bleibt bewusst
`Unknown`; CC-020 und CC-038 antworten genau das.

**(b) Die Engine urteilte milder, als sie darf — 5 Fälle, vier geschlossen.** CC-024,
CC-029, CC-030 und CC-033 lieferten **Unknown** statt B.

**Der eine übrige Defekt: CC-050 · level — und er gehört nicht in die Objektnote.** Die
Engine sagt **A**, der Korpus **B**. Die frühere Begründung an dieser Stelle (`SELECT …
WITH PRIVILEGED ACCESS` umgehe die DCL-Prüfung und die Engine sehe darin nichts) ist
**falsch** und steht hier nur noch als korrigierter Irrtum: **R28** sagt wörtlich „Eigene
Befunde, die das A–D-Level **nie** verändern", und der Sollbefund CC-050-F01 sagt es
selbst — „Level unverändert B; … Compliance-Befund, kein Levelbefund."

Am Fallbuch nachgeprüft (18.09.2026): das B des Falls steht in seiner eigenen
Ausschlussliste — *„Kein A: der REPORT mit WRITE-Liste ist klassisches ABAP; usable
bezeichnet die API-Oberfläche, nicht die Implementierung"*. Das ist **R03**:
Standard-Sprachversion plus freigegebene Abhängigkeit ergibt B. Gegenprobe: **CC-058,
Profil 1** — dieselbe Quelle ohne den Zusatz — antwortet ebenfalls B. Die Sollantwort
hält also; dies ist **kein** `korpus-offen`.

Das A der Engine ist die Note des freigegebenen `I_CUSTOMER` und als Objektnote richtig;
der Fall bestätigt sie mit `cloud_api_surface: usable`. Was die Engine nicht sieht, ist
die **Sprachversion**. Die Antwort darauf wäre ein **Level je Artefakt**, das
`/method/levels` heute ausdrücklich verweigert („There is no level here for a program as a
whole"). Das ist eine **Produktentscheidung und kein Bugfix** — sie ändert eine öffentlich
zugesagte Aussage und braucht Sonnys Entscheidung. Bis dahin bleibt der Defekt stehen:
richtig gemessen, mit seinem Grund in der Ratsche. CC-050 ist der einzige Fall, an dem der
Unterschied überhaupt sichtbar wird — alle anderen Soll-B-Fälle mit Engine-A haben null
gesehene Objekte.

**(c) Abhängigkeiten, die niemand sah — 9 Fälle, ein Befund. Geschlossen.** Die Engine
meldete an diesen Stellen nichts oder Erfundenes: **ADBC** (CC-034) — das Stringtemplate
eines `cl_sql_statement->execute_update` *ist* SQL, KNA1 kam in der ganzen Ausgabe nicht
vor; **Makroexpansion** (CC-042) — der Platzhalter `&1` aus `DEFINE` wurde als Tabelle
gemeldet, KNA1 und KNB1 gar nicht; **dynamische Ziele** (CC-020, CC-036, CC-037, CC-038)
— `(LC_TAB)` und `(P_TAB)` standen als Datenbankabhängigkeit in der Ausgabe, das
aufgelöste Ziel fehlte; **Typreferenz ohne SQL** (CC-045, R29), **logische Datenbank**
(CC-047, `NODES`/`GET`) und **programmglobales Feld über Literal** (CC-040, `ASSIGN
('(SAPMV45A)VBAK-…')`) — null Befunde, null Kopplung.
Beide Engines lesen das jetzt aus **einer** Datei (`lib/abap/table-dependencies.ts`) statt
aus zwei Kopien desselben Musters, und dieselbe Datei fragt die Deklarationen — weshalb
`MODIFY gt_bp_data FROM gs_bp_data` keine erfundene Datenbankkopplung mehr ist. Ein
Ziel, das die Quelle nicht schließt, ist keine Tabelle, sondern die Coverage-Klasse
`dynamic-target` („Nicht bestimmt"); der Wert daneben steht als *mögliches* Ziel,
markiert und nie als bekannt.

**Was der Korpus selbst falsch hat — 4 Fälle, `korpus-offen`.** CC-001, CC-002, CC-007 und
CC-008 verankern R01 auf der `FROM`-Zeile; R27 legt den Anweisungsbeginn als Primäranker
fest. Der Korpus widerspricht sich hier selbst (v1-Konvention gegen die v2.1-Regel), und
die Engine folgt R27. Das geht an die Fallautoren, nicht an die Engine.

**Die Ratsche hält das fest:** `tests/korpus-engine.spec.ts` wird rot, wenn ein `agree` zu
`disagree` wird, wenn eine `disagree` ohne Streichung verschwindet, wenn ein Eintrag sein
Urteil oder seine Begründung verliert, wenn das Bündel vom Fallbuch abdriftet — und wenn
je ein Hostname oder eine vierzigstellige Commit-ID nach `docs/korpus/` gerät.

**Befunde vom 16.09.2026 aus den Unabhängigkeitsprüfungen, in 2.1/2.2 zu beheben:**
- **Kettensätze in der Coverage untererfasst.** Die Engine hat zwei
  Anweisungsleser: `readStatements` (`statement-reader.ts`) expandiert
  `WRITE: a, b, c.` zu drei Anweisungen, `tokenize` (`declaration-parser.ts`)
  nicht — und `assessCoverage`/`buildAbapEvidence` lesen durch `tokenize`.
  `Z_MATERIAL_STOCK_CALC` meldet „3 × classic list output", ausgeschrieben sind
  es 10; `Z_SALES_ORDER_CREATOR` 3 statt 5, `Z_MM_PO_APPROVAL` 2 statt 4. Nicht
  blind zu beheben: `tokenize` speist auch den Klassenparser, der Ketten selbst
  zerlegt — zweimal expandieren wäre der nächste Defekt. Korpusfall CC-043
  (v2) legt den Sollwert fest: ein Anker je Kettenglied. Gefunden durch
  Eigenschaft P2.
- **Lokale interne Tabellen als Datenbank-Abhängigkeit.** `extractDataCoupling`
  meldet `MODIFY gt_bp_data FROM gs_bp_data.` (`Z_BUSINESS_PARTNER_SYNC.txt:59`)
  als `GT_BP_DATA · Write · Medium`; `evidence-model.ts` unterdrückt denselben
  Namen als lokal deklariert, `extractDataCoupling` fragt die deklarierten
  Namen nicht. Die Über-Meldung von `open-sql-discrimination.ts` ist gewollt,
  aber hier trifft sie eine Variable — die Klasse „erfundene Abhängigkeit" aus
  QA-Review 33471220d6e9. Gefunden beim Bau von Eigenschaft P1.

### Phase 3 — v2.13 „Modellieren"

Mockup Screen 1: die Regelkarte BR-004 mit Ankern und den Zuständen „Keep · Change
deliberately · Drop · Clarify".

| # | Schritt | Größe |
|---|---|---|
| 3.1 | **Editor** (bpmn-js Modeler) mit den gängigen BPMN-2.0-Elementen: Pools und Lanes, Start-, Zwischen- und Endereignisse, exklusive und parallele Gateways, Task-Typen, Teilprozess, Datenobjekt, Nachrichtenfluss, Anmerkung | M |
| 3.2 | **Revisionen:** jedes Speichern eine unveränderliche Revision mit Konto und Zeit; das rekonstruierte Ist bleibt Revision 1; Vergleich zweier Revisionen | M |
| 3.3 | **Prüfhinweise beim Modellieren:** bpmnlint-Standardregeln plus eigene — Task ohne Anker, Gateway ohne Bedingung, Lane nur rekonstruiert, Element weicht ohne Zustand vom Code ab. Hinweise, keine Sperren. **Nach Herkunft unterschieden seit 22.09.2026 (§16 V7, nach 2.17):** „Gateway ohne Bedingung" (`lib/process-hints.ts:82`) bleibt `warn` an **rekonstruierten** Gateways — dort hat der Code immer eine Bedingung, ein Fehlen ist ein Engine-Defekt —, feuert an Mehrfach-Instanz nie (2.17) und ist an **modellierten** Gateways `info`. Gemessen: die Regel in ihrer heutigen Form würde an **554 von 1.320 XOR-Splits (42,0 %)** und in **310 von 1.246 Diagrammen (24,9 %)** des Referenzbestands anschlagen; dort tragen nur 8,5 % aller Flüsse überhaupt eine Bedingung. An unserer eigenen Rekonstruktion sind alle sechs Treffer Schleifen. Eine Regel, die an fast jedem zweiten Referenzdiagramm anschlägt, erzieht dazu, Hinweise zu überlesen — danach wird auch „Task ohne Anker" nicht mehr gelesen | S |
| 3.4 | **Geschäftsregeln `BR-nnn`:** Regeltext mit Satzankern und Quote, Typ (Regel oder Kontrolle), Quelle (Programm, Include, Form), mit Prozesselementen verknüpft | M |
| 3.5 | **Beibehalten · bewusst ändern · entfallen · klären** je Element und Regel. Eine Bestätigung ist eine neue Revision des Kontos — eine neue Bedarfsrevision, keine Codekonservierung | M |
| 3.6 | **Ist und Soll:** Soll-Modell aus dem Ist und den Zuständen; Gegenüberstellung, was bleibt, sich ändert, entfällt oder offen ist | M |

**Fertig, wenn** W22-A14 (eine geänderte bestätigte Regel markiert nur betroffene
Ableitungen), C23-A06 (Bedarf ohne Code bekommt keinen erfundenen Anker), jede
Bestätigung Name und Zeit zeigt und die Ist-Revision nach dem Bearbeiten unverändert
ist.

### Phase 4 — v2.14 „Austauschen"

Der Weg **zu** SAP Signavio — über Dateien, nicht über eine Anbindung (§6).
**Nur die Ausgangsrichtung** (Entscheidung Sonny, 18.09.2026): der BPMN-Import und der
Rundlauf zurück warten auf die Zeit nach 3.0, weil sich der Rückweg heute nicht
ehrlich prüfen lässt — er braucht eine fremde Datei aus einem lizenzierten
Signavio-Workspace, und ohne die wäre jeder Importtest ein Test gegen unseren eigenen
Export. Was hier steht, ist deshalb das, was wir selbst belegen können.

| # | Schritt | Größe |
|---|---|---|
| 4.3 | **Signavio-Export geprüft — zurückgestellt, Sonny führt es vor dem 3.0-Release durch (Entscheidung 18.09.2026):** Export → Import in SAP Signavio Process Manager, im Workspace eines Mitglieds mit Lizenz. Protokoll, was überlebt (Namensraum-Erweiterungen, Lanes, Layout) und was nicht. Erst danach darf eine Seite „getestet mit SAP Signavio Process Manager" sagen — mit Datum, und ausdrücklich nur für diese eine Richtung | S, extern |
| 4.4 | **Kurzbrief:** Prozessbild, Regeln, offene Fragen — jede Aussage mit Anker; PDF und `.bpmn` in einem Download | M |

Die Nummern 4.1 und 4.2 bleiben unbesetzt: sie trugen den BPMN-Import und den
Rundlauf und stehen jetzt in §7. Die Lücke ist Absicht — Schritt 0.2 verweist
namentlich auf 4.3, und ein Umnummerieren würde diesen Verweis stillschweigend
falsch machen.

**Fertig, wenn** der eigene Export in SAP Signavio Process Manager öffnet, das
Protokoll aus 4.3 mit Datum im Repo liegt und keine Seite mehr behauptet, als dieses
Protokoll deckt.

### Phase 5 — v2.15 „Teilen" — **Einladungen implementiert (18.09.2026); Ende-zu-Ende-Leseabnahme offen (CR-13 → 5.6)**

Mockup Screen 1: „Share with members" und die Avatarreihe; Screen 4: „Members on
this case".

**Alle fünf Schritte liegen auf `main`, und die vier Abnahmekriterien haben je
einen ausgeführten Test** (`invitation-flow`, `invitation-rendered`,
`firestore-rules-readers`, `project-readers` — 40 Tests). Die Phase lag seit dem
17.09. fertig auf `dev` und wartete allein auf die vier öffentlichen Texte: einer
von ihnen, Abschnitt 8 der Datenschutzerklärung, behauptete wörtlich *„There is no
sharing feature today"*. Am 18.09. sind sie geschrieben, der Regel-Deploy für 5.4
ist raus und gegen die Produktion verifiziert (`88b5fe431436…`, fünf Datenbanken),
und dazugekommen ist, was die Prüfungen desselben Tages verlangt haben: eine
Obergrenze von drei gleichzeitig offenen Einladungen je Projekt, der Art.-14-Hinweis
in der Einladungsmail, ein Hinweis an den Einladenden, dass die Mail im Spam landen
kann, und eine Löschkaskade, die einem eingeladenen Leser nichts in fremden
Projekten hinterlässt.

| # | Schritt | Größe |
|---|---|---|
| 5.1 | **Zurück zum Link:** Anmeldung und Registrierung unverändert; danach führt die App zum Einladungslink zurück (nur eigene Pfade, keine offene Weiterleitung) | S |
| 5.2 | **Einladen:** der Besitzer gibt eine E-Mail-Adresse ein; der Server legt die Einladung mit Ablaufdatum an und verschickt den Link | M |
| 5.3 | **Annehmen:** angemeldet, Terms akzeptiert (vorhandener Zustimmungsweg), Konto-E-Mail gleich eingeladener Adresse und bestätigt. Google-Login gilt als bestätigt; ein Passwortkonto bekommt in diesem Moment eine Bestätigungsmail — die Registrierung selbst ändert sich nicht | M |
| 5.4 | **Einsicht:** die eingeladene Person liest das Projekt vollständig, **inklusive ABAP-Quellcode**. Generieren, Bestätigen, Signieren und Exportieren bleiben beim Besitzer. `firestore.rules`: lesen darf der **Besitzer oder eine angenommene Einladung** — der Administrator nicht (siehe unten) — **Regel-Deploy vor der App** | M |
| 5.5 | **Übersicht und Widerruf:** der Besitzer sieht, wer seit wann Einsicht hat, und widerruft; wirksam sofort | S |
| 5.6 | **Ende-zu-Ende-Leseabnahme** (CR-13): Owner, eingeladener Leser, Nicht-Eingeladener, widerrufener Leser und Admin-Claim ohne Mitgliedschaft über alle GET- und Schreibrouten — Prozesskarte, Benennung, Revisionen, Zustände, Export, Widerruf; Leser sehen die geteilte Revision, ändern und starten nichts. Am 19.09. verlangten die vier Prozessrouten auch bei GET den Eigentümer; das ist die Reparatur, die Abnahme ist der Test über alle Rollen | S |

**Fertig, wenn**
- ein weitergeleiteter Link für ein anderes Konto nichts öffnet (C23-A14);
- nach dem Widerruf das Lesen an den Regeln scheitert, nicht nur in der Oberfläche;
- ein unbestätigtes Passwortkonto keine Einsicht bekommt;
- der Einladungsdialog ausdrücklich sagt: „inklusive Quellcode".

**„Admin" ist am 18.09.2026 aus 5.4 gestrichen** (Sonny). Die Zeile stand seit dem
15.09. da und widersprach dem Entzug des Operator-Lesens vom 16.09. — sie war einen
Tag älter, und die spätere Entscheidung gilt. Lesen darf der Besitzer und die
angenommene Einladung, sonst niemand; `firestore.rules` hat es nie anders gemacht,
der Widerspruch stand allein in dieser Zeile. Ein Notfall — ein gemeldeter
Schadcode-Upload — läuft weiter serverseitig über das Admin SDK, das an den Regeln
vorbeigeht: eine bewusste Handlung mit Protokoll, keine Konsole, die offensteht.
Ein Operator, der ein Projekt lesen will, hat denselben Weg wie alle: eingeladen
werden.

### Phase 6 — v2.16 „Sichten" — **auf `dev`: 6.1, 6.5, 6.6, 6.7 (18.09.2026); offen 6.2, 6.3, 6.4, 6.8**

Mockup Screens 1–4: Umschalter, Ebenen, Status-Chips, nächster Schritt, Suche.

| # | Schritt | Größe |
|---|---|---|
| 6.1 | **Umschalter Business · IT · Management** (immer in dieser Reihenfolge, Business vorn und beim Öffnen gewählt; Entscheidung Sonny 15.09.2026), in IT mit Fokus Application · Solution · Enterprise. Gehalten in URL und Browser — nicht im Konto, nicht im Projekt, nicht in Run oder Audit-Pack. Dazu **die drei Sichten in Bewegung** in „New project" (`DESIGN.md` §6.1.1): eine Tatsache mit festem Anker wandert einmal durch die drei Sichten, aus dem echten Lauf des Beispiels, überspringbar, bei reduzierter Bewegung still. Unter dem Umschalter je Sicht ein Satz, welche Frage sie beantwortet, mit „About this view" (`DESIGN.md` §2.3) | M |
| 6.2 | **Ebenen:** Bedarf & Prozess · Standard-Fit · Kosten & Annahmen · Architektur & Abhängigkeiten · Nachweise & Kontrollen · Änderungen & Zusagen. Eine Ebene ohne Inhalt sagt das, statt etwas zu erfinden (W22-A03) | M |
| 6.3 | **Overlays auf dem Prozessmodell:** Clean-Core-Level des Codes hinter einem Task, Findings, Nutzung (wenn importiert) — Darstellung, kein Inhalt; das Level bleibt außerhalb des signierten Audit-Packs | M |
| 6.4 | **Management-Sicht auf dasselbe Projekt:** was bestätigt ist, was fehlt, was eine Entscheidung binden würde; **Clean Core Score mit Regelversion und Verlauf** — ein Verlauf vergleicht nur Runs derselben Regelversion — kein Portfolio. **Die Darstellung dieser Sicht ist Schritt 3.0.10** (Diagramme, Übersichtsschirm, „nicht bestimmt" als eigene Fläche): hier entstehen die Antworten, dort ihre Form — wer 6.4 baut, liest 3.0.10 mit, damit die Zahlen von Anfang an die Abdeckung mitführen, die das Diagramm zeigen muss | M |
| 6.5 | **Nächster Schritt:** regelbasiert der nächste offene Punkt mit Grund, ohne Modellaufruf | S |
| 6.6 | **Suche im Projekt** (⌘K) über Elemente, Regeln, Findings, Zeilen und Glossar; **Glossar zum Start** nach `DESIGN.md` §6.1 (SAP- und Produktbegriffe, Quelle je SAP-Begriff), auch in „Ask this case": Fachwörter mit Popover, „What is …?" aus dem Eintrag ohne Modellaufruf (Entscheidung 15.09.2026) | M |
| 6.7 | **Public-Cloud-Fit und vier Töpfe:** welche Objekte des Projekts in Public Cloud keinen Weg haben (nur Tier 3) und damit die Deployment-Entscheidung blockieren; Einordnung jedes Objekts in Retire · Keep · Rebuild · **Kein katalogisierter Pfad** (kein freigegebenes API, kein Nachfolger — mit Datenbasis und Datum; „Blocked by SAP" heißt es erst mit bestätigtem Bedarf, Zielprofil und geprüften Alternativen, CR-18) — der vierte Topf trennt eigene Hausaufgaben von SAPs Roadmap. Abgeleitet aus Katalog und Level, jede Zuordnung mit Beleg (Feedback 15.09.2026). Regeln nach `DESIGN.md` §5.6 (Entscheidung 15.09.2026): abhängig von der Zielplattform; Retire nur aus bestätigtem Drop; null Nutzung über ≥ 13 Monate ergibt einen **Retire-Kandidaten** (offene Prüfung) mit Quelle, Zeitraum und Erfassungsart — ein Jahreswechsel im Fenster ist Kalenderinformation, kein erfasster Jahresabschluss (CR-17); Blocked nur für Katalogobjekte ohne freigegebenen Nachfolger, Modifikationen sind Rebuild | M |
| 6.8 | **„Ask this case" über die eingebettete Hilfe-KI** (Entscheidung Sonny 15.09.2026): kein zweiter Chat — der vorhandene Assistent (`components/GlossaryChatbot.tsx`, `lib/chatbot-knowledge.ts`) wird für 3.0 ausgebaut. Im Projekt antwortet er nur aus der Evidenz des Projekts, jede Aussage mit Anker, Herkunft *Model proposal*; außerhalb eines Projekts bleibt er Produkt- und SAP-Hilfe. Die vorab beantwortete Frage aus den Verzweigungen des Codes (2.7) und Glossar-Antworten ohne Modellaufruf (6.6) laufen durch denselben Assistenten. Zählt nicht aufs Kontingent; Modelltext durch `lib/model-text.ts` (1.5) | M |
| 6.9 | **Revisionshinweis im Arbeitsraum** (CR-15) und **Fragmentanker über den Sichtwechsel** (CR-14): Revisions-Badge, kostengünstige Standprüfung bei Fokus, Reload und vor jeder schreibenden Aktion, Änderungsbanner mit „alten Stand behalten / aktualisieren"; `setView`/`setFocus` erhalten `#fragment` — derselbe Gegenstand, anderer Blick, gleicher Ort | S |
| 6.10 | **Die Management-Sicht beginnt mit ihrer Antwort** (Sonny, 23.09.2026; ADR-029, `DESIGN.md` §597). Heute liest sie: Public-Cloud-Fit (6.7, `WorkspaceShell.tsx:455–459`) → „Members on this case" (5.5, `:461–470`) → **erst dann** die vier Antworten (6.4, `app/(app)/project/[projectId]/page.tsx:186–189`, als Geschwister *nach* der Shell). Ein Entscheider sieht also zuerst eine Zugriffsverwaltungsliste und zuletzt das Urteil — genau der Zustand, den ADR-029 abgeschafft hat („Management sah ‚58', ‚4 objects' und Kostenspannen ohne Urteil"). Entstanden ist es ohne Fehlentscheidung: 6.7 wurde in die Shell gebaut, 6.4 einen Schritt später an die Route, weil dort ein anderer Agent in der Shell arbeitete; beide Stellen tragen denselben sauberen Kommentar, nur hat niemand sie nebeneinandergelegt. **Verschiebung, kein Umbau:** der `view === 'management'`-Block wandert in `WorkspaceShell.tsx` **über** `PublicCloudFitPanel`; `projectId` liegt dort bereits vor. **Fertig, wenn** die Reihenfolge Antworten → Public-Cloud-Fit → Mitglieder am gerenderten Bildschirm geprüft ist und die Struktur-Wächter (`workspace-shell-guard`, `workspace-layers`) mitgezogen sind — mit Gegenprobe, nicht mit angepasster Erwartung. | S |

**Fertig, wenn** W22-A01/A02 (ein Wechsel erhält Element, Revision und Auswahl und
erzeugt keine neue Hypothese), ein Wechsel keinen Modellaufruf auslöst und ein Guard
belegt, dass kein gespeichertes Artefakt, kein Run und kein Pack ein Sichtattribut
trägt.

### Phase 7 — v2.17 „Standard und Kosten" — **auf `dev`: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7 (18.09.2026); offen 7.4, 7.8**

Mockup Screen 2.

| # | Schritt | Größe |
|---|---|---|
| 7.1 | **ATC-Import** neben dem vorhandenen Nutzungsimport; importierte Findings mit der Engine abgeglichen | M |
| 7.2 | **Standardabdeckung je Fähigkeit** mit Evidenzstufe E0–E4: ein Kataloglink ergibt höchstens E1, ein Scope Item ist eine zu prüfende ID, ein fehlender Katalogtreffer beweist nichts | M |
| 7.3 | **Gegenprobe-Szenarien** aus dem bestätigten Bedarf, **als Given/When/Then mit Testdatenbedarf**, damit Fachbereiche sie ohne ABAP prüfen; Testing speichert Verdikte als Receipt mit Umfang, Umgebung und Stubs | M |
| 7.4 | **Optionen mit Kosten** nur aus einer Annahmenrevision; **„Nichts tun" als Vergleichsoption** (Regressionstest je Release, Upgrade-Verzug) und die Empfindlichkeit der Annahmen; kein Kostensieger, solange eine Option unvollständig ist. **Pflichtfelder** (Entscheidung 15.09.2026, ADR-035): Währung ohne Vorgabe, zwei Tagessätze (Entwicklung, Test/Key User), Betrachtungszeitraum ohne Vorgabe, Release-Takt nur bestätigt, je Option einmaliger Aufwand als Spanne und laufender Aufwand je Release, Wartungs-Baseline für Keep und Nichts tun; kein Feld aus einem Modell, die festen Aufwandsfaktoren je 1.000 Zeilen nur als bestätigungspflichtiger Vorschlag **Vor 8.4** (Gegenreview c5085bb, §8.3): die Optionsrechnung steht, bevor die Entscheidung sie bindet; Domainvalidierung sofort — keine negativen Beträge, Score nur in 0–100, Rundung erst bei der Darstellung (CR-16) | M |
| 7.5 | **Prüfaufträge statt Scheinwissen:** zu kurzes Nutzungsfenster, fehlendes Include, dynamischer Aufruf werden Aufgaben, keine Urteile | S |
| 7.6 | **Was sich für Nutzer ändert:** welche Transaktion oder App den Schritt heute trägt und künftig, was anders aussieht, wo Schulung nötig ist — als Evidenzstufe wie 7.2, nie als Behauptung (Feedback 15.09.2026) | M |
| 7.8 | **Anpassungsoptionen zum Standard, direkt am Element** (Entscheidung Sonny 16.09.2026): in der Business-Sicht zeigt jedes Element mit Standardkandidat unmittelbar, welche Anpassung des Prozesses näher an Fit-to-Standard führt — in der Prozesskarte (Map wie Steps, 2.5), in der Prozesskette bzw. Phasenübersicht (2.9) und in den Standard-Fit-Tabellen (7.2; Screens s1 und s3). **Je Betriebsmodell:** in Public Edition nur, was mit dem Scope Item und Key-User-/Developer-Extensibility ohne Modifikation geht; in Private Edition/RISE zusätzlich die Wege, die dort erlaubt bleiben (klassische Erweiterung, Modifikation als benannte Abweichung mit Upgrade-Folge). Jede Option nennt den Prozessschritt, der sich ändert, das Scope Item als zu prüfende ID, die Evidenzstufe E0–E4 aus 7.2, was sich für Nutzer ändert (7.6) und, sobald 7.4 eine Annahmenrevision hat, ihre Kosten neben „Nichts tun"; ohne Standardkandidat steht *Not determined* mit Grund (7.5), nie ein erfundener Weg. Eine gewählte Option wird Soll-Vorschlag in 3.6 (Ist und Soll) und Entscheidung je Element in 3.5 — nie eine automatische Änderung. Abgestimmt mit den vier Töpfen aus 6.7: „Blocked by SAP" hat keine Anpassungsoption, nur den Verweis auf SAPs Roadmap. Deterministisch aus Katalog, Level und Scope-Item-Zuordnung; das Modell formuliert höchstens die Klarsprache, mit Anker und Herkunft *Model proposal*. **Vergleichsberechtigung je Element, ergänzt 22.09.2026 (§16 V6):** **vor** jeder Standardzuordnung bekommt jedes Element deterministisch eine Vergleichsklasse — *fachlich vergleichbar* (Task, Teilprozess, Aufruf-Aktivität, Business-Rule-Task, Gateway auf einem Geschäftsfeld) · *technisch* (Lese-/Schreibschritt, technisches Gateway aus 2.15, Randereignis, Fehler-Ende, Helfer) · *strukturell* (Start, Ende, Lane, Pool, Datenobjekt, Anmerkung) · *unbekannt* (`call-opaque`, dynamisches Ziel). Nur *fachlich vergleichbar* trägt einen Standardkandidaten oder *Not determined*; *technisch* und *strukturell* tragen **nie** „kein Standardkandidat", sondern „nicht vergleichbar"; *unbekannt* heißt unbekannt. **Drei Ergebnisse, nie zwei:** belegt abgedeckt · belegt nicht abgedeckt · unbekannt. Die Klasse steht am Element, **nie** im signierten Pack — wie das Level. Warum hier und nicht in 7.2: 7.2 arbeitet auf Fähigkeiten aus Regeln, 7.8 bringt den Standardkandidaten erstmals ans Element, und dort entsteht das Risiko. Gemessen: im 1.000-Zeilen-Beispiel sind **15 von 65 Flussknoten (23 %) Endereignisse**, sechs davon mit Fehlerdefinition; über die acht Beispiele 14 `errorEventDefinition`, 5 `boundaryEvent`, 115 Datenelemente. Im Referenzbestand: typisierte Endereignisse 3 von 2.172, Datenobjekte 24 von 19.876 — **aber Abwesenheit im Diagramm ist kein negativer Funktionsnachweis**, der Bestand abstrahiert Implementierungsdetails, und wie vollständig, ist nicht gemessen. Genau deshalb drei Ergebnisse. **Fertig, wenn** über die acht Beispiele kein Endereignis, Gateway, Randereignis und kein Datenspeicher einen Standardkandidaten oder „nicht abgedeckt" trägt, jedes `call-opaque` als unbekannt steht und die Klassenfunktion rein ist (ohne Import aus `lib/bpmn`, wie `abcd-classification.ts`) | M |
| 7.7 | **Prüfhinweise Compliance:** deterministische Hinweise auf personenbezogene, steuer- oder revisionsrelevante Daten aus den gelesenen Tabellen — sie bestimmen Prüftiefe und Testpflicht, sind aber Hinweise, keine Einstufung (Feedback 15.09.2026) | S |
| 7.9 | **Zwei Dimensionen je Katalogobjekt** (CR-01): klassischer Freigabestatus und ABAP-Cloud-Verwendbarkeit getrennt sichtbar, Nachfolger benannt (CL_HTTP_UTILITY: klassisch freigegeben · Cloud: nicht freizugeben · Nachfolger CL_WEB_HTTP_UTILITY); der Grad bleibt der Clean-Core-Zielbezug (Entscheidung §9 Nr. 18) und sagt das am Objekt; `deprecated` ohne Nachfolger ist eine Prüfung, kein automatisches D | S |
| 7.10 | **Modell gebaut 23.09.2026 (14fcac9), Verdrahtung offen.** **Zielprofil als Eingabe** (CR-02): Edition, Sprachversion je Objekt, Release-/Komponentenstand, Katalogsnapshot und Regelversion als versioniertes `AssessmentProfile` durch Analyse, Kataloglookup, Ergebnis, Entscheidung und Receipt; nicht abgedeckte Profile werden sichtbar abgelehnt oder als unbestätigt geführt; ein Profilwechsel ändert den Subject-Hash und entwertet abhängige Freigaben; ein Latest-Eintrag ersetzt keinen älteren Release-Snapshot still | L |

**Entscheidungen zur Economics-Stufe (Sonny, 23.09.2026), nach 7.4:**

| Nr. | Schritt | Größe |
|---|---|---|
| 7.11 | **Eine Währung für die ganze Seite.** Die Economics-Stufe hat heute zwei Geldbegriffe: der obere Rechenteil druckt an sechs Stellen ein festes `€` (`tco/page.tsx` Z. 38, 39, 357, 429, 440, 447) und hat **kein** Eingabefeld dafür, während das Panel aus 7.4 darunter nach der Währung fragt. Die Tagessätze fragt derselbe Teil bereits ab (`devRate`/`userRate` stehen auf `null`, Z. 74 zählt die Lücken auf) — nur die Einheit erfindet er. Künftig nennt der Leser die Währung **einmal**, und beide Teile verwenden sie. Solange keine genannt ist, sagt der obere Teil „Not determined" statt einer Zahl — genau wie er es bei fehlenden Tagessätzen schon tut. **Kein Verlust an Prüfschärfe:** `tests/tco-page-rendered.spec.ts:119/122` prüft, dass die Seite nicht selbst rechnet; das Währungszeichen ist dort nur das Präfix und kommt künftig aus derselben Quelle wie auf der Seite. | S |
| 7.12 | **Kipppunkte statt eines gesetzten Radius.** `SENSITIVITY_FACTOR` (±25 %) ist gesetzt, nicht hergeleitet: es gibt im Repository keine Verteilung, keine Projekthistorie, keine Referenz, woraus sich ein Wert ergäbe — und eine plausible Konstante ohne Herkunft ist genau das, wogegen dieses Produkt antritt. Künftig rechnet das Panel, **wie weit** eine Annahme sich bewegen muss, bis die Führung wechselt, und sagt es: nicht „bei ±25 % bleibt A vorn", sondern „A bleibt vorn, bis der Entwickler-Tagessatz um 38 % steigt". Eine gerechnete Zahl statt einer gesetzten, und der Leser kann sie selbst einschätzen. Kein Konfidenzintervall — dafür fehlt weiterhin die Verteilung. **Fertig, wenn** der Radius ersatzlos entfällt und je Annahme entweder ein Kipppunkt oder ein Satz steht, warum es keinen gibt. | M |

**Stand 7.10 (23.09.2026).** `lib/assessment-profile.ts` steht mit 21 Prüfungen:
drei Abdeckungszustände (`covered`, `unconfirmed`, `rejected`), neun Lückencodes,
`profileRevision()` als `edition@release/snapshot#rule+fp12`,
`assessmentSubjectHash()`. `profileManifestInput()` wirft bei `rejected` — eine
Ablehnung, die sich trotzdem signieren lässt, ist keine. Der Ungültigkeitspfad
nutzt das bestehende `source-artefact`-Muster. Die Verdrahtung durch die fünf
Stationen ist bewusst nicht Teil davon.

**Dabei aufgefallen, und heute wirksam:** `lib/abap/catalog-service.ts` kennt
weder `deployment` noch `edition` — kein einziges Vorkommen —, und der einzige
Schnappschuss ist `abap-atc-cr-cv-s4hc`, die Freigabeliste der **Public** Cloud.
Ein Private-Edition-Projekt wird gegen sie beurteilt, und das Ergebnis sagt
nicht, welcher Schnappschuss geantwortet hat. Genau die stille Ersetzung, die
CR-02 benennt. Station 2 (Kataloglookup) ist deshalb das eigentliche **L**: der
Snapshot muss ein Argument werden, und `pce-latest` muss synchronisiert und
ausgeliefert werden (~3 MB).

**Zwei Entscheidungen gehören vor die Verdrahtung, nicht danach:**
1. **Private Edition.** Solange nur die Public-Liste vorliegt, trägt jedes
   Private-Projekt dauerhaft einen Unbestätigt-Vermerk im signierten Manifest.
   Ist das richtig — oder wird `pce-latest` Voraussetzung für Station 1?
2. **Bestandsläufe.** Am Tag, an dem Station 1 gebaut wird, hat kein vorhandener
   Run einen Profileintrag im Manifest; jedes bestehende Projekt stünde auf
   „unbestätigt". Dieselbe Frage wie C23-A02.

**Fertig, wenn** V25-A02 (beide Katalogsichten mit Vorrangregel und Regelversion),
V25-A05 (zu kurzes Fenster erzeugt einen Prüfauftrag), V25-A06 und W22-A15/A16
(simuliert, übersprungen oder anderer Codehash gilt nie als bestanden) — und jedes
Element mit Standardkandidat in Prozesskarte, Prozesskette und Standard-Fit-Tabelle je
Betriebsmodell eine Anpassungsoption mit Scope-Item-ID und Evidenzstufe nennt oder
*Not determined* sagt (7.8).

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
| 8.7 | **Reparaturentwürfe serverseitig** (CR-10): unveränderlicher Entwurf mit Parent-Revision, Code-/Suite-Hash und Draft-ID; der Runner führt genau diesen Entwurf aus, Übernahme nur per Compare-and-swap, Receipt an den tatsächlich ausgeführten Stand gebunden — heute hält der Client die Reparatur nur im Speicher und der Runner liest nur den gespeicherten Stand, der Retry läuft also gegen den alten Code; bis 8.7 ist Auto-Healing gesperrt statt still wirkungslos | M |
| 8.8 | **Freigabe an den gelesenen Run gebunden** (CR-11): `expectedRunId` und Evidenz-Digest im Command `approve-architecture`, Vergleich in derselben Transaktion, 409 mit verständlichem Diff bei Abweichung, nie stilles Umhängen auf den neuesten Stand — Vorbedingung von 8.4 | S |
| 8.9 | **Isolierter Test-Runner** (CR-09, Entscheidung §9 Nr. 16): eigener Cloud-Run-Dienst oder Job mit einem Service-Konto ohne Rollen, ohne App-Secrets, eigener Dateisystem- und Netzgrenze; der Mock-Pfad läuft dort oder gar nicht; Ergebnisnachweise stammen vom isolierten Worker; ein autorisierter Negativtest auf dem Deploymentprofil erreicht weder fremde Dateien noch Zugangsdaten — bisher „nach 3.0, ohne Version" | M |

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
| 3.0.6 | **Neue Landingpage und öffentliche Texte — Teil des Releases 3.0, nicht danach** (Entscheidung Sonny 15.09.2026): die Startseite nach `docs/roadmap/clean-core-landing-v3_0.html`; **jede Produktansicht darauf aus dem echten Arbeitsraum** — Screenshots oder eingebettete Vorschau des Demo-Projekts `Z_MM_PO_APPROVAL`, bei jedem Release mit `tests/capture-screens.spec.ts` neu erzeugt, sodass Bild und Produkt nie auseinanderlaufen; keine Mockup-Bilder. Erhalten bleiben Anmeldebutton an gleicher Stelle, Navigation zu den Wissensseiten, Metadaten und Canonical, JSON-LD (Organization, SoftwareApplication, FAQPage deckungsgleich mit dem sichtbaren FAQ, BreadcrumbList), Sitemap, Robots und Live-Zahlen aus dem Katalog. **Die Katalog- und Wissensseiten bleiben mit URL, Canonical und Inhalt unverändert erreichbar** (Entscheidung Sonny 15.09.2026, viele Impressionen): `/catalog`, `/catalog/[object]`, `/catalog/browse/[letter]`, `/catalog/module/[area]`, `/catalog-sitemap.xml`, `/sap-clean-core-object-classification`, `/method/levels`, `/sap-cloudification`, `/clean-core-explained`, `/how-it-works`, `/knowledge`, `/abap-custom-code-analysis`, `/clean-core-score`, `/features/[slug]`, `/how-to`, `/whitepaper`, `/licenses`, `/about`, `/trust` — sie bekommen nur den 3.0-Look; die neue Startseite verlinkt aktiv hinein (Objektsuche, Beispielobjekte, A–Z). Grundlage ist Google Search Console (letzte 6 Monate bis 15.09.2026: 9.115 Impressionen, davon 3.706 in den letzten 30 Tagen; Startseite 1.509, `/catalog` 1.491, `/knowledge` 1.417, `/sap-cloudification` 1.371, `/abap-custom-code-analysis` 1.150, rund 70 Objektseiten). Titel und sichtbare Überschriften folgen den Suchanfragen, die schon Reichweite haben, aber kaum Klicks — „SAP Cloudification Repository viewer" (403 Impressionen, Position 8, 0 Klicks), „cloudify SAP", „ABAP (static) code analysis", „Clean Core Score". Gehalten von `tests/seo-surface-guard.spec.ts`. Mit dem Umbau ändern sich bewusst `tests/landing-consistency-guard.spec.ts` (Vergleichszeilen, BenefitCard) und `tests/landing-style-guard.spec.ts` (Eyebrow, Gewichte ≤ 800); `tests/landing.spec.ts` bleibt gültig. Das Pilot-Banner entfällt („Powered by Generative AI" verstößt gegen `DESIGN.md` §3.1); ob der Showroom nach `/how-it-works` zieht, ist offen. Dazu README, How-to, Whitepaper, `llms.txt`, Facts | L |
| 3.0.7 | **Demo-Projekt und Tour im Arbeitsraum** (`DESIGN.md` §6.1.2): die Demo aus 0.10 in allen Sichten und Ebenen, neu erzeugt mit jedem Release, das Engine oder Regelversion ändert; Tour mit rund zwölf Stationen (Enthüllung bis Übergabe), eine Station je Ort, Fortschritt nur im Browser, Einladung nach jeder dritten Station und am Ende; „Show tips again" im Hilfe-Menü | M |
| 3.0.8 | **Repo-Texte auf 3.0 ziehen — mit 3.0, nicht vorher** (Entscheidung Sonny 16.09.2026): `CLAUDE.md` (Stufenmodell, Layout, Konventionen, die drei Agenten, Gotchas), `README.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`, `llms.txt`, `docs/QA-REVIEW-LOOP.md` und jede weitere öffentliche Datei im Repository, die noch die sieben Stufen als Produkt, die alte Startseite, Signavio-Import, Dark Mode oder gestrichene Teile beschreibt. Bis dahin bleiben sie, wie sie sind — sie beschreiben das, was ausgeliefert ist. Ein Guard prüft nach dem Umbau, dass keine öffentliche Datei mehr Elemente nennt, die 3.0 entfernt hat (Liste aus 3.0.5 und §8). Zusammen mit den Produkttexten aus 3.0.6 | M |
| 3.0.9 | **Zustellbarkeit der Mails** (Entscheidung Sonny 16.09.2026): Welcome-, Freigabe-, Umfrage-, Digest- und Community-Mails landen automatisch im Spam, obwohl SPF, DKIM, DMARC `p=reject` und der ausgerichtete Return-Path seit 01.09.2026 korrekt sind (`docs/ARCHITECTURE.md`, Mail-Tabelle) und die Bulk-Sendungen RFC 8058 erfüllen. Erst messen, dann drehen: Seed-Test je Kampagne auf Gmail, Outlook, GMX/web.de und T-Online (Inbox oder Spam, Header vollständig), Google Postmaster Tools und Microsoft SNDS für die Domain, die DMARC-Berichte an `dmarc@clean-core.io` tatsächlich lesen. Dann die Hebel in dieser Reihenfolge: Resend-Tracking aus (nur Sonny kann es prüfen — jeder Link muss mit `https://clean-core.io/` beginnen), DKIM auf 2048 bit zwischen zwei Sendungen, eigene Subdomain für Kampagnen und die Stammdomain nur für Transaktionsmails, ein Absendername für alles, Aufwärmen mit kleinen Mengen an Empfänger, die geöffnet haben, Unterdrückung aus Bounces und Beschwerden (`email_events`) vor jedem Versand, Text- und HTML-Teil deckungsgleich, keine Bilder, keine Kurzlinks. **Fertig, wenn** der Seed-Test bei den vier Anbietern im Posteingang landet und Postmaster die Domain-Reputation nicht „schlecht" nennt — geprüft vor jedem Versand, nicht einmal | M |
| 3.0.10 | **Die Management-Sicht wird lesbar in Sekunden** (Entscheidung Sonny, 18.09.2026 — Teil des Releases 3.0, nicht danach): die Sicht beantwortet ihre Frage *„What do I risk, what do I decide?"* heute in Karten und Tabellen; sie bekommt dafür Diagramme und eine Übersicht, die ein Vorstand in einem Blick liest. **Bindend bleibt `DESIGN.md`, nicht der Geschmack:** ADR-029 gilt unverändert — jede Karte beginnt mit ihrem **Antwortsatz als Titel**, erst darunter Zahl, Diagramm und Tabelle, und eine Einordnung, die leicht falsch gelesen wird („a grade, not a compliance percentage", „Simulation, not a quote"), steht im Antwortsatz, nie nur im Popover. Farben nach **§1.8**: Diagramme, die Zustände zählen (Level A–D, Befunde je Schwere), nehmen die Zustandsfarben mit Buchstabe und beschrifteter Kategorie; **alle anderen** die kategoriale Palette und **nie** eine Zustandsfarbe. Was gebaut wird: **(a)** ein Übersichtsschirm, der die Frage der Sicht in **einem** Satz beantwortet und darunter höchstens sechs Karten trägt, jede mit einer Antwort; **(b)** die **vier Töpfe** (Retire · Keep · Rebuild · Blocked by SAP) als Verteilung mit *not assigned* als eigener, sichtbarer Fläche — plus die Gegenüberstellung „was sich bewegt, wenn die Zielplattform wechselt", denn dieselbe B-Einstufung ist in der Private Edition *Keep* und in der Public Edition *Rebuild*; **(c)** der **Readiness-Verlauf** über Runs **derselben** Regelversion, mit der Regelversion an der Achse — ein Verlauf über zwei Regelversionen wird nicht gezeichnet, sondern als Bruch benannt; **(d)** die **Level-Verteilung A–D** nach §1.8; **(e)** „**was die Entscheidung blockiert**" als kurze, geordnete Liste mit Beleg je Zeile, nicht als Tortendiagramm — ein Objekt ohne Public-Cloud-Weg blockiert die Entscheidung, das ist keine Quote; **(f)** der **Entscheidungsstand**: welche Entscheidung offen ist und worauf sie wartet. **Drei Grenzen, die keine Gestaltung aufweicht:** „**nicht bestimmt**" ist in jedem Diagramm eine eigene, sichtbare Fläche und wird nie weggerundet oder in „sonstige" gefaltet; **jede Zahl nennt ihre Abdeckung** („42 findings in 907 of 907 lines · 2 includes not read") und **jede Zahl im Diagramm ist auch als Text erreichbar** (Tabelle oder `aria-label`, §1.8); **Kosten erscheinen nur als Simulation** mit ihrer Annahmenrevision (0.4) — kein Geldwert ohne sie, auch nicht als Achsenbeschriftung. Sprache nach §3.1: klar und ohne KI-Spuren, keine Superlative, keine Fortschrittsbalken für etwas, das kein Fortschritt ist. Tastatur, Screenreader, `forced-colors` und das Druckbild nach §7.1 gelten wie überall (3.0.4) — ein Diagramm, das nur auf dem Schirm funktioniert, ist nicht fertig. Gehalten von `tests/no-fabricated-figures.spec.ts`, `tests/money-honesty-guard.spec.ts` und einem gerenderten Test je Diagramm | L |

**Fertig, wenn** alle Phasenabnahmen auf `main` gelaufen sind, ein Korpusfall den
ganzen Fluss durchläuft und die Copy-CI grün ist — **und die neue Landingpage mit
echten Produktansichten live ist**: kein Mockup-Bild auf einer öffentlichen Seite,
Anmeldung wie heute erreichbar, Landing-Guards und Signavio-/Geld-Guards grün,
JSON-LD und sichtbares FAQ deckungsgleich. 3.0 wird nicht ohne die neue Startseite
veröffentlicht — **und nicht ohne den geprüften Signavio-Export aus 4.3**
(Entscheidung Sonny, 18.09.2026): er öffnet einen eigenen Export in SAP Signavio
Process Manager, im Workspace eines Mitglieds mit Lizenz, und legt das Protokoll
mit Datum ins Repository. Bis dahin sagt keine Seite „getestet mit SAP Signavio
Process Manager". Der Schritt ist von der Phase 4 an diese Stelle gerückt, weil er
nicht gebaut, sondern durchgeführt wird — **und nicht ohne die Management-Sicht aus 3.0.10**: ihre Frage in
einem Satz beantwortet, die vier Töpfe und der Readiness-Verlauf als Diagramm, „nicht
bestimmt" in jedem davon als eigene Fläche, jede Zahl mit ihrer Abdeckung und als Text
erreichbar, Kosten nur als Simulation mit Annahmenrevision.

**Abnahmeordnung vor 3.0 (Gegenreview c5085bb, aufgenommen 19.09.2026):** nicht ein Korpusfall
durch den ganzen Fluss, sondern **drei vollständige Wege** — Standardübernahme, gezielte
Erweiterung, Stilllegung — plus ein Fall, der fachlich unentscheidbar bleibt und genau so
dargestellt wird, jeder mit Negativproben (falsche Belege, fehlerhafte Generierung, Zugriffs-
und Revisionswechsel). Reihenfolge und Mindestabnahmen G0–G4 in §15.

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
| s5 | Clean Core Score mit Regelversion und Verlauf, *Imported* | 6.4, 0.3 |
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

**Landingpage 3.0** (`docs/roadmap/clean-core-landing-v3_0.html`, von Sonny am 15.09.2026 abgenommen) — ebenfalls
1:1; jeder Abschnitt der Seite hat hier eine Zeile, der Guard prüft sie gegen die Abschnitte der Datei:

| Abschnitt | Element | Schritt |
|---|---|---|
| Landing · header | Logo „Free Community Edition", Navigation zu den Wissensseiten und zum Objektkatalog, Anmeldebutton an gleicher Stelle (`?auth=signin`) | 3.0.6 |
| Landing · hero | h1 mit „SAP Clean Core Accelerator", „Explore the demo" (führt über die Anmeldung zur Demo) und „Start with your own code"; Vorschau mit echten Ankern von `Z_MM_PO_APPROVAL` — mit 3.0 aus dem echten Arbeitsraum | 3.0.6, 0.10, 2.7 |
| Landing · what | ein zitierbarer Satz, was Clean-Core.io ist, drei Unterschiede | 3.0.6 |
| Landing · views | die drei Sichten zum Durchschalten, einmaliger Durchlauf, drei Spalten bei reduzierter Bewegung | 6.1, 3.0.6 |
| Landing · clean-core | Schema „What clean core means", A–D-Leiter mit echten Beispielobjekten, Evidenz-Schritte mit Herkunft | 2.7, 0.3, 3.0.6 |
| Landing · catalog | „SAP Cloudification Repository viewer": Objektsuche (ohne JavaScript ein Link auf `/catalog`), Beispielobjekte mit Katalogseite, A–Z, Live-Zahl aus `getCatalogStats()` | 3.0.6 |
| Landing · process | BPMN aus ABAP als echtes Flussdiagramm von links nach rechts mit Lanes, Gateways, eingeklappten Phasen, Fremdsystem-Pool und Ankern; Phasen klappen an Ort und Stelle auf; „Map \| Steps" | 2.3, 2.5, 2.9, 3.0.6 |
| Landing · verify | „Verify it yourself": Referenzlauf mit Live-Zahlen, berührte SAP-Objekte, Prüfschritte | 3.0.6 |
| Landing · honest | Herkunfts-Chips, vier Töpfe je Zielplattform, Retire erst ab 13 Monaten | 1.5, 6.7, 3.0.6 |
| Landing · toolchain | Einordnung neben ATC, ADT, SAP Signavio und Cloud ALM; Signavio-Import als noch nicht geprüft | 0.2, 4.3, 3.0.6 |
| Landing · demo | Demo-Vorschau mit Tour, Hinweis auf das nötige Konto | 0.10, 3.0.7 |
| Landing · start | drei Schritte, Beispielauswahl (jedes einmal frei), fünf Analysen, eigener Schlüssel, Zugangskarten `card-sandbox` / `card-developer` | 0.9, 3.0.6 |
| Landing · trust | „Your data stays yours" mit den belegten Aussagen aus `DESIGN.md` §6.1.3 und ihren Quellen | 0.11, 3.0.6 |
| Landing · faq | FAQ als sichtbarer Text, deckungsgleich mit JSON-LD `FAQPage` | 3.0.6 |
| Landing · site-footer | alle Seiten mit Suchreichweite, Rechtliches, Versionsstempel | 3.0.6 |

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
| **nach 3.0, ohne Version** | **BPMN-Import und Rundlauf** (war Phase 4.1/4.2, verschoben am 18.09.2026): Import von `.bpmn` und `.xml` mit Bericht — Fehler heißt nicht importiert, Warnung heißt Element entfällt; importierte Elemente tragen die Herkunft „importiert" und erscheinen nie als aus Code rekonstruiert. Dazu der Rundlauf: der Reimport eines eigenen Exports erkennt Elemente an der ID, Anker und Zustände bleiben, fremde Änderungen kommen als neue Revision mit Vergleich. **Warum erst hier:** der Rückweg lässt sich ohne eine echte Exportdatei aus einem lizenzierten Signavio-Workspace nicht ehrlich prüfen — ein Importtest gegen den eigenen Export beweist nur, dass wir uns selbst lesen können |
| **3.3** | Auswirkungsanalyse: eine Katalogänderung erzeugt Prüfaufträge nur für betroffene Projekte |
| **3.4** | Musterbibliothek (CC-BY, nur nach Veröffentlichungsreview) |
| **3.5** | Beobachtete Wirkung gegen die eingefrorene Kostenrevision (Screen 5 rechts) · Multi-Provider-BYOK |
| **Kandidaten (Feedback 15.09.2026)** | Code-Anonymisierung vor dem Modellaufruf · CLI/API, die Pull Requests gegen Clean-Core-Regeln prüft (Shift-Left) · Aufwandsschätzung aus Metriken, erst mit Kalibrierung aus der Bench |
| ohne Version | Bench veröffentlichen, fairer Vergleich, Teamabnahme — brauchen Termine mit Dritten, keine Entwicklungszeit · Runner-Isolation: seit 19.09.2026 vor 3.0 als 8.9 (CR-09)|

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

### Am 22.09.2026 geschlossen

**Nr. 20 — Benennung und Provenienz werden getrennt. Der Vertrag wird ausdrücklich
erweitert.** Regel 6 der Engine lautet „jedes Label ist ein Token aus der Quelle,
nie eine Formulierung, die diese Engine erfunden hat". Das garantiert
**Rückführbarkeit** — es garantiert **keine Fachsprache**. Ein Prüfer kann diesen
Konflikt erkennen, aber nicht auflösen; es war eine Produktentscheidung, keine
technische.

Sonnys Entscheidung: **erweitern.** `sourceToken` bleibt unverändert das Token aus
der Quelle und trägt den Anker; daneben steht ein **freigegebenes** `businessLabel`.
Ein Modellvorschlag ist ein Vorschlag und gilt nie automatisch als freigegeben —
ohne Freigabe zeigt die Oberfläche den `sourceToken`, nicht den Vorschlag. Damit
bleibt Regel 6 in ihrem Kern unangetastet: die Rückführbarkeit hängt weiter am
Token, nicht an einem Namen, den jemand für schöner hielt.

Dazu ein deterministischer Prüfer auf dem Vorschlag, **ohne Modellaufruf**: er weist
zurück, was einen Repository-Bezeichner enthält — Tabellenname, CDS-View, OData-Name,
Funktionsbaustein, `SCREAMING_SNAKE`, Z-/Y-Präfix, registrierter Namensraum. Die
Klausel ist an einem Bestand von 12.168 fachlichen Aktivitätsbeschriftungen
kalibriert: dort kommt so etwas **dreimal** vor, 0,02 %. Ein Schritt, der „Select
VBAK" heißt, ist nicht unschön — er ist ausserhalb dessen, was ein fachliches Modell
je tut. Findet das Modell keinen fachlichen Namen, steht „unbelegt" statt eines
technischen Namens, der so tut.

Die übrigen Stilklauseln (Verb zuerst, 2–8 Wörter, Title Case, Länge) werden
**nicht** zu Produktregeln: sie stammen aus einer einzigen Messreihe, und eine
Zweitmeinung hält sie aus denselben Zahlen ausdrücklich für nicht ableitbar. Sie
dürfen Hinweis sein, nie Bedingung.

Umgesetzt in **2.4**; die Lanes aus **2.16** erben dieselbe Trennung — Beweis-Token
als Name, fachlicher Name nur freigegeben daneben.

### Am 18.09.2026 geschlossen

Die sieben Punkte, die am Abend des 17.09. als „ohne Sonny geht es nicht weiter"
im Arbeitsprotokoll standen, plus die Hälfte des dringendsten Sicherheitsfundes.

| Entscheidung | Ergebnis |
|---|---|
| **Die vier öffentlichen Texte** | Entwürfe für alle vier (Datenschutz §8, Vertrauenskarte, `SECURITY.md`, `docs/DATA-RETENTION.md`); Datenschutzerklärung und `SECURITY.md` gehen erst nach Sonnys Lesen auf `main` |
| **Regel-Deploy 5.4** | Wird ausgerollt, bevor die App folgt — wie 5.4 es verlangt |
| **Umfrage-Migration** | Sicherung und Trockenlauf jetzt, der schreibende Schritt erst nach Sonnys Blick auf das Ergebnis |
| **Schlüsselrotation** | Vorbereitet (neues Ed25519-Paar, alter öffentlicher Schlüssel in `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`); die Secrets setzt Sonny |
| **„Admin" in 5.4** | **Gestrichen.** Lesen darf Besitzer und angenommene Einladung, sonst niemand — die Entscheidung vom 16.09. schlägt die Zeile vom 15.09. |
| **MFA-Zwang für S/4-Zugang** (abends) | **Ja.** Alle sechs Routen, die einen Tenant erreichen, verlangen ein *eingeschriebenes* TOTP und den Faktor auf dem Token; der Admin-Anspruch befreit von der Freigabe, nicht vom Faktor. Dazu (spät) **der eigene Gemini-Schlüssel**: Speichern, Testen, Löschen verlangen ebenfalls einen eingeschriebenen Faktor — ein gestohlener Token könnte den Schlüssel sonst ersetzen. Alles andere — Runs, Audit-Pack, Jira — behält optionale MFA (akzeptiertes Risiko, IDs in §12); ein Zwang auf `runs/create` würde jedes Konto ohne Faktor vom Analysieren ausschließen. Die Begrüßungsmail empfiehlt MFA jedem Konto, erklärt die Einrichtung und nennt die zwei Pflichtstellen. Sprengweite gemessen: genau ein Produktionskonto mit S/4-Freigabe ohne Faktor, kein Konto mit eigenem Schlüssel. |
| **7.3, drei Fragen** (spät) | **Alle drei: lassen, wie gebaut.** Ein Sandbox-Lauf heißt an keiner Fähigkeit „bestanden" (E3, `mock-only`, `demonstrated-mock`); der Receipt-Versionssprung 1→2 retiriert alte Quittungen statt sie aufzufüllen; ein Lauf mit ersetzten Paketen erreicht E3 und *nennt* die Stubs. Die Zuordnung Szenario→Testfall bleibt deklariert, nie geraten; die Oberfläche in der Testing-Stufe ist ein Folgeschritt. |
| **Regeln ausrollen** (spät) | **Sofort.** Ausgerollt am 18.09. abends auf alle fünf Datenbanken, `rules:verify` bestätigt: Produktion, Register und Arbeitskopie stimmen überein (`7a068dad…`). |
| **Signavio-Export (4.3)** | **Später.** Die 3.0-Schranke bleibt; niemand fährt ihn jetzt. |
| **Einladungen je Projekt** | **Höchstens drei gleichzeitig offen** (`INVITATION_MAX_OPEN`). Nur offene belegen einen Platz; ein Widerruf gibt ihn sofort frei |
| **PDF-Schreiber** | Der eigene bleibt. Keine neue Abhängigkeit für 491 Zeilen, die mit `pypdf` gegengeprüft sind |
| **WIF-Bedingung** | **Verengt** auf Repository **und** Ref (`main`, `dev`) **und** die beiden Workflows, die überhaupt ein Token holen (`deploy.yml`, `usage-report.yml`) |

Am Nachmittag desselben Tages, aus zwei Rechtsprüfungen der öffentlichen Texte:

| Entscheidung | Ergebnis |
|---|---|
| **Personenbezogene Daten im Upload** | **Uploadverbot statt Auftragsverarbeitungsvertrag.** Ein AVV machte ein kostenloses Ein-Personen-Projekt dauerhaft zum Auftragsverarbeiter für fremde Kundendaten. Beide Dokumente sagen ausdrücklich dazu, dass die Plattform nichts davon erkennt oder blockiert |
| **Mindestalter** | **18**, in Datenschutz und ToS gemeinsam. Art. 8 DSGVO und Geschäftsfähigkeit sind zwei Fragen; mit 16 wäre die Zustimmung zu den ToS ohne Eltern schwebend unwirksam |
| **Sprachfassungen** | Bei Abweichungen ist die **deutsche Fassung maßgeblich** — deutscher Verantwortlicher, deutsche Aufsichtsbehörde |
| **Aufbewahrung des Sicherheits-Protokolls** | **24 Monate**, danach gelöscht; Werkzeug liegt bereit, Automatisierung vor 2028 |
| **Sicherungen** | Es gab **keine**. Täglich 7 Tage und wöchentlich 28 Tage angelegt, damit die 30-Tage-Zusage wieder gedeckt ist |
| **ToS-Fassung** | **Springt auf `2026-09-18`** (Dokument v2.1.0) — aber erst, nachdem der Zustimmungsweg gebaut war. Ohne ihn hätte der Sprung alle 158 Konten ausgesperrt |
| **Guard für personenbezogene Daten** | Wird gebaut: deterministisch, im Browser, vor dem Hochladen, mit bewusster Bestätigung — an beiden Upload-Wegen **und** am Nutzungsdaten-Import. Er zeigt Muster, er erkennt keine personenbezogenen Daten |
| **dev-Dienst mit dem Produktions-Secret-Satz** | Bewusst so lassen (Sonny, 18.09.2026, Abend). Die QA-Vollprüfung von `b88c77b` nennt es achtmal kritisch; die Prämisse — ein zweites Konto mit Schreibrecht — gibt es nicht (Kollaboratorenliste: genau eines), und die Zwei-Umgebungen-Entscheidung steht in `CLAUDE.md`. Wird wieder zur Frage, sobald ein zweites Konto Schreibrecht bekommt — so steht es als Bedingung im QA-Register. |
| **gitleaks und die versiegelten Register** | Regel-Allowlist statt Fingerabdruck je Schreibvorgang (Sonny, 18.09.2026, Abend). `docs/security/register.enc.json` und `docs/qa/refuted-findings.enc.json` sind vollständig Chiffrat aus einer Funktion (`v`, `alg`, `key`, `iv`, `tag`, `data`); der per RSA-OAEP eingepackte AES-Schlüssel reißt je nach Zufall die Entropieschwelle von `generic-api-key` — dreimal an einem Tag. `.gitleaks.toml` nennt die beiden Pfade; `.gitleaksignore` bleibt für Einzelfälle mit Begründung. |

**Weiter offen (Sonny):** die drei Vertragspunkte der ersten Prüfung —
Haftungskaskade in ToS § 4 (der Absatz zu Kardinalpflichten widerspricht dem Satz
darüber), die Verbraucherregeln für unentgeltliche digitale Produkte
(§§ 327 ff. BGB), und die Zustimmungsfiktion in § 10 (nach BGH XI ZR 26/20 in
dieser Pauschalität unwirksam — faktisch ist sie durch den Zustimmungsdialog
bereits ersetzt, der Text sagt es nur noch nicht). Das ist Vertragsgestaltung,
keine Textpflege.

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
| 1 | **Referenzkorpus — entschieden** | 16.09.2026 (Sonny): kein externer SAP-Architekt, der Umfang wäre nicht in vertretbarer Zeit gegenzuzeichnen; der Korpus lebt mit dieser Einschränkung und trägt sie an jedem Fall. 17.09.2026 (Sonny): der finale Korpus **kommt ins Repository** — als maschinenlesbares Bündel je Fall plus Spec gegen die Engine, Schritt **2.10**. Bis dahin liegt v2.1 neben v1 und v2 auf dem Desktop |
| 2 | **Wer stellt einen Signavio-Workspace für 4.3?** | Clean-Core.io hat keine Lizenz. Ohne einen Mitglieds-Workspace bleibt die Aussage „BPMN 2.0 XML", nie „getestet mit Signavio" |
| 3 | **„Discussion" aus dem Mockup vor 3.0?** | Kommentare der eingeladenen Personen am Element wären ein weiterer M-Schritt in Phase 5. Ein Kommentar wäre keine Bestätigung |
| 4 | **Vorschau vor 3.0?** | Bis 3.0 nur Admin — oder ab Phase 5 eine Vorschau für ausgewählte Mitglieder, die dann echtes Feedback geben |
| 5 | **Auszählung der Aktivierungsumfrage** | Sie sollte die Reihenfolge innerhalb der Phasen bestimmen — der ATC-Import (7.1) und die deutsche Oberfläche (3.1) sind Kandidaten |
| 6 | **Regel-Deploys einplanen** | `firestore.rules` rollt CI nicht aus. 0.7 und 5.4 brauchen den manuellen Produktions-Deploy **vor** der App |
| 7 | **Drei Repository-Secrets tauschen?** | `S4_ENCRYPTION_KEY`, `PILOT_APPROVAL_SECRET` und `MFA_BACKUP_CODE_PEPPER` lagen bis zum 16.09.2026 in jedem Lauf der öffentlichen CI. Kein Hinweis auf einen Abfluss — es ist eine Frage der Blast Radius. Der Schlüssel ist der teure: jede gespeicherte S/4-Zugangsdatei ist damit verschlüsselt, ein Tausch heißt neu verschlüsseln oder neu eingeben lassen. Die anderen beiden kosten nichts (SEC-2026-024, behoben — der Tausch ist die Frage danach) |
| 8 | **CSP ohne `unsafe-inline`?** | SEC-2026-016. `middleware.ts` begründet über zwanzig Zeilen, warum `script-src` heute `'unsafe-inline'` trägt: Next.js reicht middleware-erzeugte Nonces nicht an seine eigenen `<script>`-Tags weiter. Ob das mit Next 15 noch gilt, ist die eigentliche Frage. Verschärfen heißt: gegen den echten Google-Login testen, sonst sperrt es Leute aus |
| 9 | **S/4-Zugangsdaten aus der Kindprozess-Umgebung?** | SEC-2026-018. Der Sandbox-Kindprozess bekommt entschlüsselte Zugangsdaten als Umgebungsvariablen und führt modellgeschriebenen Testcode aus. Netz-Sperre unbedingt geladen, keine Shell, Heap gedeckelt — der Schaden bleibt beim Kontoinhaber. Ein Proxy statt Umgebungsvariablen wäre sauberer, ist aber ein Entwurf, keine Reparatur |

| 10 | **Fehlerhaftes ABAP im ausgelieferten Beispiel reparieren?** | abaplint (zweiter Parser, seit 16.09.2026 als Ratsche in `tests/abaplint-second-opinion.spec.ts`) weist `ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap:500` und `:524` zurück: `INSERT ztab FROM @VALUE #( … )` ist kein gültiges ABAP, eine Host-Expression heißt `@( … )`. Unser Leser ist nachsichtig und erfasst den Write trotzdem. Reparieren ändert Zahlen, die vier Specs pinnen |
| 11 | **Unquotierte Dezimalzahl: nachsichtig lesen oder nicht?** | Seit 3342f34 liest die Engine `lv = 12.50.` als eine Anweisung. abaplint — und die Sprache — lesen zwei: ABAP-Zahlliterale sind Ganzzahlen, `'12.50'` wäre richtig. Unsere Regel liest also Code, der nicht übersetzen würde. In keinem der acht Beispiele kommt der Fall vor; die Regel ist dort unerprobt |
| 12 | **Kommentarzeilen zählen als LOC in der Komplexität** | `computeComplexityScore` (`lib/abap/code-assessment.ts`) zählt Kommentar- und Fortsetzungszeilen: `Z_MM_PO_APPROVAL` steigt von 8 auf 9, wenn vor jeder Zeile ein Kommentar steht. Gefunden durch die metamorphe Eigenschaft P3 (`tests/abap-metamorphic.spec.ts`). Ändern heißt, eine Zahl zu ändern, die jeder signierte Run speichert |
| 13 | **QA-Delta-Review: Budget gegen große Diffs** | Ein Diff, der allein das Budget eines Modellaufrufs übersteigt, wird nie gelesen — `tests/abap-metamorphic.spec.ts` (52.712 Zeichen) hält seit `04b4684` den Checkpoint auf `a19945e`, und in der Vollprüfung traf es `analyze/page.tsx` mit 172.900 Zeichen. Der Checkpoint hing heute schon einmal 41 Commits lang fest (44a8715 → a19945e) und wurde mit sechs `workflow_dispatch`-Scheiben nachgezogen, ohne das Budget anzufassen. Optionen: das Budget je Aufruf für einzelne Dateien heben, Test-Dateien mit eigenem Budget lesen, oder große Dateien in Abschnitten reviewen. Jede davon ändert `scripts/qa/lib/config.mjs` oder `review.mjs` — Agentenmaschinerie, braucht dein Go |
| 14 | **Scope Items als Registry-Eintrag (7.2/7.8)** | SAP stellt keinen maschinenlesbaren Gesamtbestand öffentlich bereit (geprüft 18.09.2026 inkl. Community: Process Navigator hinter Login, rapid.sap.com tot, Excel-Export widersprüchlich beschrieben). Bleiben: Eintrag aus dem Konto (Weg 1) oder ein vom Betreiber gezogener Export. **Stand 18.09.2026, Abend: Sonny holt einen Signavio-Export; bis dahin warten (BACKLOG 27).** |
| 15 | **Wirkungsstatus im Grundmodell — Transaktionssemantik (CR-06)** | Heute: `IN UPDATE TASK` als normale Aufgabe, `COMMIT`/`ROLLBACK` nur als Notiz („Commit nur im Technical Overlay", `DESIGN.md`). Das Gegenreview zeigt an CC-026, dass die Business-Sicht so eine nicht abgeschlossene Wirkung als erledigte Aufgabe liest. **Empfehlung:** Registrierung, Anstoß und Verwerfen als Zustände des kanonischen Modells; Sichten verdichten. Schritt 2.12 wartet auf das Ja. |
| 16 | **Isolationsgrenze des Mock-Test-Runners (CR-09)** | Das Gegenreview belegt lokal, dass die Node-Permission-Grenze nicht hält (Details privat im Reviewpaket); die Roadmap führte die Runner-Isolation bisher unter „nach 3.0, ohne Version". **Empfehlung:** vor 3.0 als 8.9 — und bis dahin den Mock-Pfad sperren wie den Live-Pfad, mit Grund im Interface; Zwischenschutz (Builtin-Allowlist, Ladehaken, `fetch` geschlossen) sofort, ohne ihn als Grenze zu verkaufen. Blast Radius im Bericht vom 19.09. |
| 17 | **Produktpositionierung 3.0: Einsicht (A) oder kleiner Teamraum (B)?** | Das Gegenreview empfiehlt B — Antwort am Artefakt und an einer Revision (Thread, Erwähnung, Auflösen, getrennte Bestätigung; kein Chat, keine Rollenverwaltung); §8 schließt Kommentieren seit 15.09. aus. **Empfehlung:** 3.0 als A vermarkten — „Einsicht per Einladung", nie „gemeinsam entscheiden im Produkt" — und B als 3.1-Kandidat auf derselben Autorisierungs- und Journalbasis; nicht beides halb. |
| 18 | **Grade-Definition (CR-01): Clean-Core-Zielbezug oder klassische Nutzbarkeit?** | `CL_HTTP_UTILITY` ist klassisch freigegeben (B) und in ABAP Cloud nicht freizugeben (D, Nachfolger `CL_WEB_HTTP_UTILITY`); SAPs Beispiel ordnet klassisch B. Der Code entschied D bewusst (21 von 22 Overlap-Objekten haben einen Nachfolger). **Empfehlung:** der Grad bleibt der Zielbezug, beide Dimensionen stehen daneben (7.9), die Definition steht am Objekt. |
| 19 | **Ein toter Gemini-Schlüssel liegt öffentlich in der Vorgeschichte des Repositorys** (gefunden 21.09.2026 beim Nachgehen des roten Security-CI) | Im allerersten Commit vom 28.05.2026 liegt ein 12-MB-Protokoll einer IDE-Sitzung, und darin steht ein `GEMINI_API_KEY` im Klartext. Der Commit hängt an keinem Zweig mehr — weder lokal noch auf GitHub —, aber GitHub liefert hängengebliebene Commits eines öffentlichen Repositorys weiter aus: die Datei ist ohne jede Anmeldung abrufbar, nachgeprüft am 21.09. **Sprengweite: keine.** Der Schlüssel ist tot — Google antwortet `API_KEY_INVALID`, er existiert nicht mehr. Er zählt auf keine Rechnung und öffnet nichts. **Offen bleibt der Zustand, nicht der Schaden:** der Volllauf von gitleaks findet ihn bei jedem Lauf über alle Zweige, und nur GitHub selbst kann einen hängengebliebenen Commit entfernen. **Empfehlung:** (a) den Support bitten, die Vorgeschichte zu bereinigen — der einzige Weg, der wirkt; (b) die vier alten `feature/*`-Zweige vom Mai, die den Commit lokal am Leben halten, löschen, sobald Sonny bestätigt, dass nichts Unveröffentlichtes darauf liegt; (c) **nicht** in die Erlaubnisliste eintragen — ein echter Schlüssel gehört nicht in eine Fehlalarmliste, auch kein toter. Bis dahin ist der Montagslauf davon nicht betroffen: er liest nur die Vorgeschichte von `main`, und die enthält den Commit nicht. |

**Offen für Sonny:** 7, 8, 9, 10, 11, 12, 13 und 19. Keiner blockiert ein
Release; sie stehen hier, damit sie nicht neu gesucht werden müssen. 10 bis 12
sind am Abend des 16.09. dazugekommen, 13 in der Nacht, 19 am 21.09. Die neun
UX-Befunde, die am 16.09. in derselben Liste standen, sind am 17.09. erledigt — siehe den
nächsten Absatz.

**Die neun UX-Befunde sind am 17.09.2026 erledigt** (`dev`, §13 auf „behoben").
Alle neun standen noch so da wie zitiert — keiner war durch v2.10.x oder
v2.11.x veraltet —, und alle neun sind in dieselbe Richtung geschlossen:
weniger behauptet, nicht schöner behauptet. Vier Versprechen sind dabei
entfernt statt umformuliert worden, weil es für sie nichts Wahres zu sagen
gab: der Quirk-Remediation-Schalter (er schaltete Text, nie Code — echtes
Umschalten ist ein zweiter, modusabhängiger Modellaufruf und damit
Engine-Arbeit einer späteren Phase), die drei statischen „Transformation
Insights", das SAP-Build-Badge (es gibt keinen SAP-Build-Export) und die
Schreibhälfte des Forums samt Likes und Kommentaren (sie schrieb in
`useState`, es gibt kein Backend, an das sie zu binden wäre; die
Ankündigungen bleiben lesbar, als read-only benannt, neben der
Administratoradresse). Gehalten von `tests/claims-honesty-guard.spec.ts`:
acht der neun am gerenderten Bildschirm, der neunte — das Jira-Modal — aus
der Quelle, weil ihn nichts einhängt und kein Browser ihn erreicht.
**Schritt 0.2 ist damit nicht fertig:** Facts-Service und Copy-CI stehen
noch aus, und §14 plant rund dreißig QA-Befunde in denselben Schritt ein.

Zu **1** (Referenzkorpus), Stand 16.09.2026 spät: Die vier Modelle — Grok 4.6
(130 Fälle), GLM 5.3 (105), Claude Fable 5.1 (122), DeepSeek v4 Pro (103), alle
mit identischer Ausgangslage — haben v1 einstimmig **nicht freigegeben**. Ihre
Lücken konvergieren (Verbuchung/LUW, dynamischer und nativer Code, Makros,
Berechtigung als fehlende Aussageklasse); Fable fand zusätzlich innere
Widersprüche des Korpus (drei Ankerkonventionen, eine falsch formulierte
Regel, R13 einseitig — eine Engine, die v1 besteht, lässt ein KNA1-Update per
ADBC mit null Befunden durch). Kein einziger Modellfall trägt eine belegte
Fundstelle: 322 `konstruiert`, 0 `verifiziert` bei dreien; Fables 19
`verifiziert` meinen ausdrücklich nur, dass die SAP-Objekte und die Syntax
existieren. Die Berichte sind eine Angriffsflächenkarte, kein Beleg.

Daraus **Referenzkorpus v2** (Datei `referenzkorpus-v2.md` neben den
v1-Entwürfen auf dem Desktop; nicht im Repository): Schlüssel *(Quelle,
Zielprofil)* statt *Quelle*; eine Ankerkonvention (Statementbeginn +
Tokenoffset); R13 zweigeteilt; acht neue Konstruktklassen K12–K19 mit
31 destillierten Fällen CC-026 bis CC-060, jeder mit Konvergenz-Zeile,
Beleggrad und den **Unabhängigkeitsstufen**, die er getroffen hat
(`modellreview` · `abaplint` · `metamorph` · `sap-doku` · `architekt` — die
letzte für keinen Fall, und das steht so drin); eine Negativliste in jedem
Export; die v1-Korrekturen; die Autorenberichte mit dem, was bewusst *nicht*
aufgenommen wurde. Was den Architekten ersetzt, ohne ihn zu ersetzen, läuft
seither als Ratsche im Test: abaplint als zweiter Parser
(`tests/abaplint-second-opinion.spec.ts`, neun Abweichungen mit Urteil im
Register, „wir haben recht" ist dort verboten) und fünf metamorphe
Eigenschaften (`tests/abap-metamorphic.spec.ts`, 98 Tests, je Eigenschaft ein
Rot-Beweis). Beide haben am ersten Tag sieben Engine-Befunde geliefert, die
kein v1-Fall gesehen hätte — vier behoben (Stringtemplate-Literale in drei
Lesern; `ENDIF. " done` zählte nicht als Schließer), drei stehen oben als 10–12
und in Phase 2.

Nächste Schritte am Korpus, in dieser Reihenfolge: jede `source.abap` aus v2
durch abaplint und die Eigenschaften ziehen (erst dann tragen die neuen Fälle
diese Stufen); ein gezielter Durchgang durch öffentliche ABAP-Repositories
**nach Konstrukten** (`IN UPDATE TASK`, `EXEC SQL`, `cl_sql_statement`,
`CALL TRANSACTION USING`, `ENQUEUE_`, `AUTHORITY-CHECK`, `ASSIGN (`,
`GENERATE SUBROUTINE POOL`) — Treffer mit festgenageltem Commit heben Fälle auf
`verifiziert (Fundstelle)`, Fehlanzeige belegt, dass die Klasse öffentlich
nicht vorkommt; das maschinenlesbare Fallbündel mit Kontexthash.

---

## 10. Wie der Nutzen gemessen wird

- **Traceability-Quote** je Prozessmodell und je Regel — Anteil der Elemente und
  Sätze mit Zeilenanker (ab 2.5 gespeichert).
- **Bestätigungsanteil** — wie viele Elemente eines Modells einen Zustand
  „beibehalten / ändern / entfallen" tragen (ab 3.5).
- **Signavio-Export** — welche Elemente und Attribute den Weg zu SAP Signavio
  überleben (Protokoll aus 4.3). Der Weg zurück wird erst nach 3.0 gemessen.
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
| SEC-2026-008 | hoch | P1 | Phase 0 · 0.7 | behoben |
| SEC-2026-014 | hoch | P1 | Phase 1 · Export-Escaping | behoben |
| SEC-2026-015 | hoch | P2 | Phase 1 · Export-Escaping | behoben |
| SEC-2026-016 | hoch | P2 | eigener Schritt, braucht Sonnys Go | eingeplant |
| SEC-2026-018 | hoch | P3 | eigener Schritt: S/4-Credential-Proxy, braucht Sonnys Entscheidung | eingeplant |
| SEC-2026-021 | info | P1 | Phase 0 · sofort behoben | behoben |
| SEC-2026-023 | hoch | P2 | Phase 0 · sofort behoben | behoben |
| SEC-2026-024 | hoch | P1 | Phase 0 · sofort behoben | behoben |
| SEC-2026-025 | hoch | P1 | Patch-Schritt sofort, vor jeder Roadmap-Arbeit (nach Prüfung kritisch) | behoben |
| SEC-2026-026 | hoch | P1 | Phase 2 · CI-Härtung, GCP-Teil braucht Sonnys Go | eingeplant |
| SEC-2026-027 | mittel | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-029 | mittel | P2 | eigener Schritt, braucht Sonnys Go | eingeplant |
| SEC-2026-031 | mittel | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-033 | mittel | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-034 | mittel | P2 | Phase 2 · Datenschutz-Schritt | eingeplant |
| SEC-2026-036 | mittel | P3 | Phase 4 · Austauschen | eingeplant |
| SEC-2026-037 | mittel | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-038 | mittel | P2 | Phase 2 · CI-Härtung, GCP-Teil braucht Sonnys Go | eingeplant |
| SEC-2026-039 | mittel | P3 | Phase 2 · CI-Härtung, GCP-Teil braucht Sonnys Go | eingeplant |
| SEC-2026-040 | mittel | P2 | Phase 2 · CI-Härtung, GCP-Teil braucht Sonnys Go | eingeplant |
| SEC-2026-041 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-042 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-055 | niedrig | P2 | Phase 2 · Datenschutz-Schritt | eingeplant |
| SEC-2026-065 | niedrig | P3 | Phase 2 · Datenschutz-Schritt | eingeplant |
| SEC-2026-067 | niedrig | P3 | Phase 2 · CI-Härtung, GCP-Teil braucht Sonnys Go | eingeplant |
| SEC-2026-073 | mittel | P2 | eigener Schritt, braucht Sonnys Go | eingeplant |
| SEC-2026-074 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-075 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-076 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-077 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-078 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-079 | niedrig | P3 | Phase 2 · Härtung neben verwandter Arbeit | eingeplant |
| SEC-2026-080 | hoch | — | — | behoben |
| SEC-2026-081 | mittel | — | — | behoben |
| SEC-2026-099 | kritisch | — | — | akzeptiertes Risiko |
| SEC-2026-100 | hoch | P2 | sofort | behoben |
| SEC-2026-110 | hoch | — | — | akzeptiertes Risiko |
| SEC-2026-131 | hoch | P2 | 3.0 | eingeplant |
| SEC-2026-135 | hoch | P1 | sofort | behoben |
| SEC-2026-136 | hoch | P1 | sofort | behoben |
| SEC-2026-137 | hoch | P1 | sofort | behoben |
| SEC-2026-150 | hoch | P2 | 3.0 | eingeplant |
| SEC-2026-151 | hoch | — | — | akzeptiertes Risiko |
| SEC-2026-152 | hoch | P1 | sofort | behoben |
| SEC-2026-219 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-220 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-221 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-222 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-223 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-224 | mittel | — | — | akzeptiertes Risiko |
| SEC-2026-225 | mittel | P2 | sofort | behoben |
| SEC-2026-226 | mittel | P3 | 3.0 | eingeplant |
| SEC-2026-227 | mittel | P2 | sofort | behoben |
| SEC-2026-228 | mittel | P2 | sofort | eingeplant |
| SEC-2026-229 | mittel | P2 | 3.0 | eingeplant |
| SEC-2026-230 | mittel | P3 | 3.0 | eingeplant |
| SEC-2026-231 | mittel | P3 | 3.0 | eingeplant |
| SEC-2026-232 | mittel | P3 | sofort | behoben |
| SEC-2026-233 | mittel | P3 | 3.0 | eingeplant |
| SEC-2026-234 | mittel | P2 | sofort | eingeplant |
| SEC-2026-235 | mittel | P2 | sofort | behoben |
| SEC-2026-236 | mittel | P1 | sofort | behoben |
| SEC-2026-276 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-277 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-278 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-279 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-280 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-281 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-282 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-283 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-284 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-285 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-286 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-287 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-288 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-289 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-290 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-291 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-292 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-293 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-294 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-295 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-296 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-297 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-298 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-299 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-300 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-301 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-302 | niedrig | P3 | sofort | eingeplant |
| SEC-2026-318 | niedrig | P1 | sofort | eingeplant |
| SEC-2026-319 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-320 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-321 | niedrig | P2 | sofort - mit dem naechsten Regel-Deploy | eingeplant |
| SEC-2026-322 | niedrig | P3 | 3.0 | eingeplant |
| SEC-2026-323 | niedrig | P3 | 3.0 | eingeplant |
| SEC-2026-324 | niedrig | P2 | sofort | eingeplant |
| SEC-2026-325 | niedrig | P3 | 3.0 | eingeplant |
| SEC-2026-336 | hoch | P1 | eigener Schritt: CSP ohne unsafe-inline (Nonce), mit Messung | eingeplant |
| SEC-2026-337 | hoch | P2 | Phase 2 · Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-338 | hoch | P2 | Phase 2 · Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-343 | hoch | P1 | eigener Schritt: Approval-Token gegen Wiedereinsatz | eingeplant |
| SEC-2026-344 | hoch | P3 | eigener Schritt: S/4-Schluesselhygiene mit Migration, braucht Sonnys Go | eingeplant |
| SEC-2026-418 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-419 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-420 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-421 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-422 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-423 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-424 | mittel | P2 | Phase 2 - CI-Haertung, braucht Sonnys Go (eigenes Repository-Secret) | eingeplant |
| SEC-2026-425 | mittel | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-426 | mittel | P3 | Phase 2 - Datenschutz-Schritt | eingeplant |
| SEC-2026-427 | mittel | P3 | Phase 2 - Datenschutz-Schritt | eingeplant |
| SEC-2026-428 | mittel | P3 | nur falls die Jira-Integration je aktiviert wird | eingeplant |
| SEC-2026-429 | niedrig | P3 | nur falls die Jira-Integration je aktiviert wird | eingeplant |
| SEC-2026-430 | niedrig | P3 | nur falls die Jira-Integration je aktiviert wird | eingeplant |
| SEC-2026-431 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-432 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-433 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-434 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-435 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-436 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-437 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-438 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-439 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-440 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-441 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-442 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-443 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-444 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-445 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-446 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-447 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-448 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-449 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-450 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-451 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-452 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-453 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-454 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-455 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-456 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-457 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-458 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-459 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-460 | niedrig | P3 | Phase 2 - Abhaengigkeitsschritt (firebase-tools, nur mit der Node-22- und npm-11-Toolchain) | eingeplant |
| SEC-2026-461 | niedrig | P3 | Phase 2 - Datenschutz-Schritt | eingeplant |
| SEC-2026-462 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-463 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-464 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-465 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-466 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-467 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-468 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-469 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-470 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-471 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-472 | niedrig | P3 | Phase 2 - Haertung neben verwandter Arbeit | eingeplant |
| SEC-2026-473 | niedrig | P2 | behoben in diesem Patch-Schritt | eingeplant |
| SEC-2026-474 | niedrig | P2 | behoben in diesem Patch-Schritt | eingeplant |
| SEC-2026-475 | mittel | P2 | behoben in diesem Patch-Schritt | eingeplant |

**Nachtrag zum Audit von v2.13.0 (`b88c77b`), 22.09.2026: die letzten 90 Befunde (87 niedrig,
3 info) sind triagiert — 54 widerlegt, 35 eingeplant, 89 Registereinträge, weil zwei Befunde
denselben Fingerabdruck tragen.** Damit ist der Posteingang dieses Audits leer. Geprüft wurde
jeder Befund an der zitierten Zeile, nicht am Bericht: der Auditor hatte keine Werkzeuge und
`firestore.rules`, `lib/sanitize-html.ts`, `lib/json-ld.ts` und `lib/export-safety.ts` lagen ihm
gar nicht vor, weshalb die häufigste Fehlerart „hier fehlt eine Prüfung" lautet und die Prüfung in
einer Datei steht, die er nicht hatte. Drei Blöcke tragen den Großteil der Widerlegungen:
Abhängigkeits-Advisories, die dem falschen Paket zugeschrieben waren (`firebase-tools` steht in
`devDependencies`, und die gemeldeten Transitiven hängen an `@google/genai`, nicht an der CLI),
Senken in `dangerouslySetInnerHTML`, die längst über `jsonLdHtml()` oder `renderMarkdownSafe`
laufen, und Befunde über `docs/roadmap/*.html`, die gar nicht ausgeliefert werden.

**Zwei Befunde wurden gemessen statt geschätzt, und beide sind schwerer als ihre Meldung.**
`tokenize()` braucht für 220 kB ABAP **154 Sekunden**, weil es den Puffer bei jeder Zeile neu
scannt — `readStatements` schafft dieselbe Eingabe in 12 ms; und eine tiefe PERFORM-Kette lässt die
Prozess-Rekonstruktion schon bei 221 kB an der Stapelgrenze scheitern, wonach die Business-Sicht
des eigenen Projekts dauerhaft 500 antwortet. Beide Wege sind ohne Drosselung erreichbar. Sie sind
als eigener Schritt eingeplant, zusammen mit den Grenzen in den beiden Routen, die die Engine
aufrufen.

**Drei Dinge brauchen Sonny, nicht Code:** ein eigenes `RATE_LIMIT_PEPPER` als Repository-Geheimnis
(der Pepper teilt sich heute den Schlüssel mit `AUDIT_SIGNING_KEY`; das Literal als dritte
Rückfallebene ist bereits entfernt), der Regel-Deploy für die schon eingeplante Verschärfung der
`create`- und `update`-Regeln von `files`, `abap_examples` und `support_tickets`, und die
Entscheidung, ob der Wochenbericht weiterhin Name und Adresse jedes neuen Kontos nennen soll — das
ist keine Lücke, sondern eine Abwägung zwischen Aufbewahrung und dem Nutzen, den der Bericht für
die Ansprache neuer Konten hat.

**Audit von v2.13.0 (`a7c9e71`, 18.09.2026): 3 kritisch, 1 hoch, 7 mittel, 14 niedrig — 2 behoben,
7 eingeplant, 16 widerlegt.** Behoben sind der Zip-Slip in der Auslieferung (modellerzeugte Pfade
gingen ungeprüft ins Archiv; die Prüfung lehnt jetzt ab, statt zu reparieren) und eine SSRF in der
Egress-Allowlist (`h.endsWith(s)` statt `h.endsWith('.' + s)` — damit passte `evil-sap.com` auf
`sap.com`; heute unerreichbar, weil der Live-Testmodus gesperrt ist, ab Wiederöffnung echt). Alle
drei als kritisch gemeldeten waren Fehlalarme desselben Namensmusters.

**Eine Empfehlung des Audits wird ausdrücklich nicht befolgt (SEC-2026-077).** Der Bericht schlägt
vor, die `AIzaSy`-Ausnahme im Geheimnis-Detektor zu entfernen. Das Finding, das dabei entstünde,
trägt `snippet: text` — ein echter Schlüssel landete damit **im signierten Audit-Pack**, also genau
dort, wo er am wenigsten hingehört und am schwersten wieder herauszubekommen ist. Der Schritt
braucht zuerst einen Redaktor für die Fundstelle, dann die Ausnahme. Wer ihn umgekehrt geht, baut
das Leck, das er schließen soll.

**Zum Rauschen im Detektor:** das Muster `[A-Z0-9]_KEY` trifft über alle versionierten Dateien
genau viermal, und alle vier sind Fehlalarme — zwei `localStorage`-Schlüsselnamen, eine öffentliche
Adresse (`TRUSTED_KEY_URL`) und ein Emulator-Testpasswort. `_URL` in der Ausnahmeliste von
`scripts/qa/lib/redact.mjs:41` beseitigt davon **einen**; wirksam wäre zusätzlich eine Ausnahme nach
der **Form des Werts** (eine URL oder ein gepunkteter Kleinbuchstaben-Bezeichner wie
`cc.workspace.*` ist kein Geheimnis). Beides gehört in einen eigenen Schritt an der
Agenten-Maschinerie und braucht Sonnys Go.

Erstes Audit: v2.11.0 (16.09.2026), 247 gemeldete Befunde. Der Bericht sagt selbst,
dass seine Verifikationsstufe nicht zurückkam — die Befunde sind gemeldet, nicht
geprüft. Die drei als kritisch gemeldeten sind nachgeprüft und **alle drei widerlegt**,
ebenso vier der als hoch gemeldeten; die Begründungen mit Belegstellen stehen im
versiegelten Register. Von den 29 als hoch gemeldeten sind 21 entschieden: vierzehn widerlegt, fuenf eingeplant, zwei sofort behoben. Der groesste widerlegte Block betraf angeblich client-schreibbare Felder und einen "nicht eingesehenen" Sanitizer -- gelesen ist er DOMPurify mit enger Allowlist. Die restlichen werden fortlaufend triagiert.

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

**Delta-Review von e3817ce (v2.12.0, 17.09.2026, 3 Modellaufrufe, 0,52 $):** zwölf Befunde waren unentschieden, sechs sind bestätigt (UX-102, UX-104, UX-106, UX-107 neu eingeplant; UX-105 und UX-110 auf *low* heruntergestuft), sechs widerlegt. Auffällig ist der Wiederholungsgrad: drei Befunde meldeten dieselbe Token-Liste aus dem Design-Scan (UX-111/112/113) und lasen das bewusst neue `cc`-Vokabular hinter dem Admin-Schalter als Drift — obwohl die Werte in `DESIGN.md` §1.2 und §1.5 beschlossen sind und die `coverage_notes` desselben Berichts das selbst sagen; ein vierter (UX-109) wiederholt UX-106 von der Screenshot-Seite, ein fünfter (UX-108) das bereits behobene UX-092. Nur UX-103 war ein echter Prüffehler: der Leerzustand, dessen Fehlen er belegt, steht im Code.

**Delta-Review von a7c9e71 (v2.13.0, 18.09.2026, 3 Modellaufrufe, 0,46 $):** vier Befunde
waren unentschieden, alle vier sind eingeplant (UX-117 bis UX-120). Zwei sind an der
Fundstelle belegt: der Technik-Blueprint lädt in seinem Schlusssatz weiter zum Fragen
ein, obwohl daneben steht, dass das Board nur gelesen wird
(`app/(app)/dashboard/page.tsx:635` gegen `:1697`), und derselbe Rücksprung heißt an
drei Stellen dreierlei (`components/BackLink.tsx:55`, `app/(app)/layout.tsx:150`,
`app/(app)/settings/page.tsx:873`). UX-119 ist ebenfalls belegt, aber am Rahmen statt am
Leerzustand: `NotGenerated` ist kompakt, die Fläche kommt aus dem `p-12 md:p-20` des
gestrichelten Containers in `documentation/page.tsx:1558`.

**UX-120 gilt nur zur Hälfte.** Der Befund meldet `rounded-[6px]` und `rounded-[8px]`
gemeinsam als Drift. `8 px` ist die in `DESIGN.md` §1.4 (Tabelle Z. 134) beschlossene
Skala für Zeile, Feld und Button — das ist kein Drift, sondern ihre Umsetzung. Echt sind
`rounded-[6px]` (`components/cc/SegmentedControl.tsx:77`,
`components/process-states/StateChoice.tsx:126`), `text-[16px]`
(`components/cc/MessageBox.tsx:126` — schon in der Widerlegung von UX-111 als einziger
echter Rest benannt) und `text-[18px]` (`components/workspace/FirstLook.tsx`). Nach
`DESIGN.md` Z. 913 ist ein neuer Radius eine Änderung dieser Datei; deshalb eingeplant
statt widerlegt, aber mit diesem Umfang: drei Werte, nicht sieben.

**Delta-Review von ac27aed (24.09.2026):** zwölf Befunde waren unentschieden, sechs
eingeplant (UX-145 bis UX-147, UX-149, UX-155, UX-156), drei widerlegt, drei
zurückgestellt. Drei der sechs sind Wiederholungen offener Einträge an derselben Stelle:
UX-147 ist UX-117 (das Board heißt weiter „Active Discussions" und lädt zum Mitreden
ein, `app/(app)/dashboard/page.tsx:1609-1617`), UX-156 ist UX-118 (Settings rendert einen
eigenen Rücksprung in Kapitälchen statt `BackLink`, `app/(app)/settings/page.tsx:871`),
UX-146 ist UX-110 (Mail-Detail nur im `title`, `app/(app)/admin/page.tsx:475`). Neu und
belegt ist UX-145: der Admin-Tab „suspended" filtert `status !== 'approved'` und zeigt
damit auch wartende und gelöschte Konten (`app/(app)/admin/page.tsx:309`). Widerlegt sind
die beiden Assistent-Befunde (UX-150/151) — Header-Knopf und schwebende Pille öffnen
denselben Dialog mit demselben Label, „Ask AI" gibt es nicht mehr; ob es zwei Einstiege
braucht, ist eine Designfrage, kein Fehler. UX-152 (automatische Freigabe per Mail-Link)
ist sicherheitsrelevant und wandert ins Security-Register; UX-148 (Kontext vor Annahme
einer Einladung) braucht Sonnys Abwägung gegen weitergeleitete Links.

| ID | Schwere | Befund | Roadmap-Schritt | Status |
|---|---|---|---|---|
| UX-002 | critical | Null Befunde als Fully Supported besiegelt | 0.8 | behoben |
| UX-001 | high | Er fundene 95%- und 80%-Balken ohne Messung | 0.2 | behoben |
| UX-003 | high | Verify-Pack-Upload ist per Tastatur nicht bedienbar | 1.5 | behoben |
| UX-004 | high | Confluence-Export erfindet fehlende Bewertungen | 1.2 | eingeplant |
| UX-007 | high | Zielwahl und Dialoge nicht tastaturbedienbar | 1.5 | eingeplant |
| UX-019 | high | Zustände stärker gezeigt als belegt – Balken, Haken, Exporte | 3.0 | eingeplant |
| UX-020 | high | Kernpfade per Tastatur und Screenreader blockiert | 3.0 | eingeplant |
| UX-023 | high | Dark Mode bricht an zentralen Flächen | 1.6 | behoben |
| UX-024 | high | Orientierung bricht zwischen den Bereichen | — | zurückgestellt |
| UX-037 | high | Transformation verspricht Node.js auch im RAP-Track | 0.2 | behoben |
| UX-038 | high | Remediation-Modus schaltet nur Text, nicht Code | 0.2 | behoben |
| UX-040 | high | Transformation Insights sind statisch und track-falsch | 0.2 | behoben |
| UX-044 | high | Dark Mode bricht an Projektzeile und Stepper | 1.6 | eingeplant |
| UX-059 | high | Forum täuscht öffentlichen Post vor, speichert nur lokal | 0.2 | behoben |
| UX-061 | high | Dashboard ohne Dark-Parität, Projektzeile kaum lesbar | 1.6 | eingeplant |
| UX-062 | high | Dashboard-Tabelle bleibt im Dark Mode weiß | 1.6 | eingeplant |
| UX-087 | high | Fehlender Debt-Status erscheint in Erfolgsgrün statt neutral | 0.8 | eingeplant |
| UX-088 | high | Clean Core Score ohne Abgrenzung zu SAPs gegenläufigem Score | 0.3 | eingeplant |
| UX-091 | high | Mail-Warnung verspricht erneuten Versand, Zeile kann ihn nicht | — | behoben |
| UX-094 | high | Alte Backup-Codes werden ohne Übergang abgewiesen | — | zurückgestellt |
| UX-102 | high | How-to nennt 6 Phasen, Produkt hat 7 Stufen | 0.2 | behoben |
| UX-121 | high | Einladen-Icon ohne Namen — nur Titel, kein Label | sofort | behoben |
| UX-122 | high | ToS-Hinweis verdrängt auf allen Routen den Inhalt | sofort | behoben |
| UX-138 | high | Integrity-Grün bedeutet mal Existenz, mal Prüfung | sofort | behoben |
| UX-145 | high | Tab „suspended“ zeigt auch Pending und Deleted | sofort | eingeplant |
| UX-005 | medium | Routenwechsel ohne Bestätigung und Undo | 0.7 | eingeplant |
| UX-006 | medium | Von Befund kein Weg in den Code | 1.5 | eingeplant |
| UX-012 | medium | Sticky-Header und Tabs verdecken Inhalt auf Phone | 1.4 | eingeplant |
| UX-017 | medium | Sehr kleine Schrift erschwert das Lesen | 1.5 | eingeplant |
| UX-022 | medium | 78 Button-Stile statt einer gemeinsamen Sprache | 1.5 | eingeplant |
| UX-025 | medium | Generierung und Fehler ohne Ausweg und Undo | 1.5 | eingeplant |
| UX-027 | medium | Grüner Haken für ungeprüften Code | 0.2 | behoben |
| UX-029 | medium | Kompatibilität behauptet, aber nicht belegt | 0.2 | behoben |
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
| UX-076 | medium | Onboarding-Abbruch mit Schuld-Formulierung | 0.2 | behoben |
| UX-089 | medium | Vier Begriffe für einen Wert: Audit, Valuation, Asset Value, IP Score | 1.5 | eingeplant |
| UX-090 | medium | Deck-Fehler zeigt Roh-Techniktext ohne nächsten Schritt | 0.8 | behoben |
| UX-092 | medium | Start-Button durch Scan blockiert ohne Grund am Button | — | behoben |
| UX-093 | medium | Ungespeichert meldet sich als fehlgeschlagene Verbindung | — | behoben |
| UX-097 | medium | Leere Blueprint-Seite bietet Export von Nichts an | sofort | behoben |
| UX-098 | medium | Paket-Download scheitert lautlos ohne Hinweis | sofort | behoben |
| UX-099 | medium | Matrix-Close-Buttons ohne Namen für Screenreader | sofort | behoben |
| UX-104 | medium | First-Run-Rücksprung führt Abgemeldete hinter Login | 1.4 | behoben |
| UX-106 | medium | NotGenerated nennt Settings, führt aber nicht dorthin | 1.5 | eingeplant |
| UX-107 | medium | Admin-Button meldet ab statt an | sofort | behoben |
| UX-116 | medium | FREE-Badge verschweigt Erstlauf-Begrenzung | sofort | behoben |
| UX-117 | medium | Read-only-Board lädt noch zum Fragen unten ein | sofort | eingeplant |
| UX-118 | medium | Rücksprung heißt dreimal anders | 1.5 | eingeplant |
| UX-123 | medium | ToS-Karte verdrängt Arbeitsinhalt auf jeder Route | sofort | behoben |
| UX-124 | medium | ToS-Gate verdrängt Aufgabe aus erstem Viewport | sofort | behoben |
| UX-125 | medium | Mail erneut senden angeleitet, aber nicht möglich | sofort | behoben |
| UX-126 | medium | Filter versprechen Diskussion, Board ist read-only | sofort | behoben |
| UX-127 | medium | Deaktivierter Start nennt Personen-Daten-Grund nicht | sofort | behoben |
| UX-131 | medium | ToS-Hinweis verdrängt Arbeitsbereich im ersten Viewport | — | zurückgestellt |
| UX-135 | medium | Kontingent-Stopp im nativen alert statt im Produktdialog | 1.4 | eingeplant |
| UX-136 | medium | Fünf Icon-Buttons ohne Text – Einladen kaum entdeckbar | 1.5 | eingeplant |
| UX-139 | medium | Verweigertes Bundle ohne direkten Weg zur Transformation | sofort | behoben |
| UX-140 | medium | Bestätigung verfällt nach Edit ohne Erklärung | sofort | behoben |
| UX-146 | medium | Welcome-Mail-Detail nur per Hover-Titel lesbar | 3.0.4 | eingeplant |
| UX-147 | medium | Read-only-Board verspricht weiter Diskussion | sofort | eingeplant |
| UX-148 | medium | Einladung ohne Kontext erzwingt blindes Annehmen | — | zurückgestellt |
| UX-149 | medium | Fehlergrenze zeigt Roh-Fehlermeldung offen statt eingeklappt | sofort | eingeplant |
| UX-152 | medium | Automatische Genehmigung läuft ohne Abbruchmöglichkeit | — | zurückgestellt |
| UX-153 | medium | Eingeladene Leser landen auf Analyse-Start | — | zurückgestellt |
| UX-008 | low | Slideshow-Steuerung ohne Namen, Pfeiltasten gekapert | 3.0.4 | behoben |
| UX-011 | low | Wirre Befund-Begriffe und Sprachmix | 1.5 | eingeplant |
| UX-013 | low | Vorschau widerspricht Editierbarkeit, Start irreführend | 1.5 | eingeplant |
| UX-015 | low | Zurück-Navigation verhält sich je Seite anders | 1.4 | behoben |
| UX-016 | low | Katalog verliert den Workspace-Kontext | 1.4 | eingeplant |
| UX-026 | low | Begriffe und Versprechen wechseln je Stufe | 0.2 | behoben |
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
| UX-084 | low | First-Run nennt Quote anders als der Header | 0.2 | behoben |
| UX-085 | low | Kleinstlabels in 10px Kapitälchen | 1.5 | eingeplant |
| UX-100 | low | Filtereintrag mischt Deutsch und Englisch | sofort | behoben |
| UX-101 | low | 2FA-Schlüssel lässt sich nicht kopieren | sofort | behoben |
| UX-105 | low | Dark-Entfernung ohne Hinweis an Bestandskonten | 1.6 | eingeplant |
| UX-110 | low | Badge-Detail nur im Hover-Titel versteckt | 3.0.4 | eingeplant |
| UX-115 | low | Demo verspricht sieben Stufen ohne Mitnahme | 0.2 | eingeplant |
| UX-119 | low | Leerer Dokumentationsrahmen mit viel Leerfläche | 1.5 | eingeplant |
| UX-120 | low | Neue Radien und Schriftgrößen ohne Systemanschluss | 1.5 | eingeplant |
| UX-128 | low | Neue Radien und Einzelmaße ohne Systemanschluss | 1.5 | eingeplant |
| UX-134 | low | Blockierter Start erklärt sich nur per Hover-Titel | 1.5 | eingeplant |
| UX-137 | low | Neue Einzel-Radien und Schriften ohne Skalenbindung | 1.5 | eingeplant |
| UX-141 | low | Suche verspricht Diskussionen auf read-only Ankündigungen | sofort | behoben |
| UX-142 | low | Optionale Importe mit uneinheitlichem Versions-Label | sofort | behoben |
| UX-143 | low | Labels ohne Feld auf Freigabeseite | sofort | behoben |
| UX-144 | low | Workspace-Gate lädt stumm für Screenreader | sofort | behoben |
| UX-155 | low | Workspace-Laden für Sehende leer, nur sr-only-Text | 1.4 | eingeplant |
| UX-156 | low | Rücksprung in zwei Großschreibungen | 1.5 | eingeplant |
---

## 14. QA-Befunde aus der Vollprüfung

Jede Version auf `main` bekommt neben der Delta-Review eine Prüfung des ganzen Code-Bestands
(`openai/gpt-5.6-sol`, `node scripts/qa/await.mjs <sha> --full`, `docs/QA-REVIEW-LOOP.md`). Sie sperrt
nichts — `main` ist schon draußen —, aber jeder Befund wird am Code geprüft, widerlegte werden mit
Beleg in `docs/qa/refuted-findings.enc.json` festgehalten, und bestätigte werden hier eingeplant.
Die Fundstelle steht in der Tabelle; Titel von Sicherheits- und Integritätsbefunden erst, wenn der
Fix auf `main` ist (§12 gilt sinngemäß). Der Volltext liegt nur lokal unter `.qa-review/`.

Einplanung wie in §12: **kritisch** als eigener Schritt vor jeder anderen Arbeit · **hoch** in die
laufende Phase · **mittel** in den nächsten passenden Schritt · **niedrig** neben verwandter Arbeit.
Was der 3.0-Umbau ohnehin ersetzt, wird zurückgestellt, nicht doppelt gebaut.

**Die 226 hohen Befunde von b88c77b4b5d1 sind am 22.09.2026 triagiert — der Posteingang dieser
Vollprüfung ist damit leer.** Aufgeteilt auf acht parallele Prüfungen, jede gegen den heutigen Code,
nicht gegen den Bericht. Das Ergebnis: **rund dreissig eigenständige Fehler.** Der Rest verteilt sich
auf drei Gruppen, und jede sagt etwas über den Prüfer:

- **Dubletten.** Derselbe Fundort kam bis zu sechsmal unter verschiedenen Fingerabdrücken. Ein
  Batch von 26 Befunden bestand aus vier Sachverhalten, einer von 36 aus dreizehn.
- **Seit dem geprüften Commit behoben — 65 Stück**, fast alle durch die beiden Engine-Commits
  `2af1890` („der urteilende Teil sagt nicht mehr als er gefunden hat") und `875bb99` („ein Literal
  ist Text, kein Code"). Vier Stellen tragen ihren eigenen Fingerabdruck als Kommentar im Code.
- **Falsch.** Mehrfach zitiert der Bericht Zeilen, die weder heute noch am geprüften Commit das
  enthielten, was er behauptet — und zwölf Befunde zu `lib/workflow-steps.ts` beschreiben eine
  Clientheuristik als Sicherheitsgrenze, obwohl die Grenze serverseitig in
  `app/api/audit-pack/create/route.ts` liegt und dort unabhängig nachgerechnet wird.

190 Widerlegungen mit Beleg stehen in `docs/qa/refuted-findings.enc.json` (375 insgesamt).

**Bestätigt und eingeplant, nach Gewicht.** Zwei betreffen die Vertrauenskette und sind jederzeit
reproduzierbar, nicht nur als Rennen: `55cf6c0ed62a`
(`app/(app)/project/[projectId]/transformation/page.tsx`) — eine Modellantwort, die kein JSON ist,
muss als Generierungsfehler behandelt werden statt verpackt zu werden; und `dfa0816bc852`
(`app/(app)/project/[projectId]/analyze/page.tsx`) — die Zielplattform gehört als Parameter
durchgereicht, nicht aus dem Zustand zum Klickzeitpunkt gelesen. Dazu `7976bced4c28` (Vollständigkeit
eines Transformationspakets), `48391b645e76` und `58201e6aaedb` (Schemaprüfung vor dem Schreiben),
`39b694577e7e` (Prozessrevision nach einer Neuanalyse), `865c1d771d8c` (sechs Kindschreibvorgänge
ohne Elternbedingung), `66f75a3d4632`, `f80230a27c70`, `6b0c0ae8ac9c`, `3e32d011b3c6`, `e4f486917474`,
`ae206f1937c6`, `c5271f4aa951`, `310220ecef2e`, `b76cb79dacf6`, `3d1ade86103c`, `3e6453d5c9ce`,
`a2b81a5bd2ab`, `827cf6758637`, `be7c1dfdf508`, `20fe6d7b4308`, `e955a181ba42`, `854c7e288bb7`,
`13a62385b2e0`, `7a2f826bddf8`, `5198d59e7ea5`, `9028321e9795`.

**Zwei davon stehen auf einer öffentlichen Seite und sind deshalb vorgezogen:** `5198d59e7ea5`
(`components/SamplePackageDownload.tsx`) und `9028321e9795`
(`components/TransformationReplay.tsx`). Beide behaupten auf der Startseite etwas, das der Code
nicht einlöst — auf einer Seite, deren Versprechen „belegt, nicht geraten" lautet, ist das der
teuerste Fehler der Liste, obwohl technisch nichts offen steht.

**Eine Architekturfrage, dreimal gemeldet** (`ebb0e6e4a363`, `36f3d696ddda`, `b97e45a2976d`):
`firestore.rules` kennt nur den Token-Claim und die Eigentümerschaft — keinen Kontostatus, keinen
Admin-Step-up, keinen Widerruf. Eine Regel kann das auch nicht: der Step-up braucht einen
serverseitigen Zustand, den das ID-Token nicht trägt, und `checkRevoked` gibt es nur im Admin-SDK.
Das Muster dagegen ist am 16.09.2026 für `/projects` bereits etabliert — direktes Schreibrecht aus
den Regeln nehmen, nur noch über gehärtete Routen. Die Übertragung auf die übrigen privilegierten
Sammlungen ist ein eigener Schritt und braucht Sonnys Entscheidung, weil sie die Admin-Konsole
berührt.

### Vollprüfung von 3131afa (v2.14.0), triagiert am 23.09.2026

**Die fünf kritischen Befunde waren derselbe Fehlalarm** — drei localStorage-Schlüssel, eine
interpolierte Vorlage und eine öffentliche URL, jeder als „Zugangsdaten rotieren" gemeldet und jeder
als `RE-RAISED after refutation`, weil die Widerlegung im Register liegt und der Treffer bei jedem
Lauf neu im Scanner entsteht. Die Regel entscheidet seit `953575f` am Wert statt am Pfad.

**Wichtiger als jeder einzelne Befund ist die Abdeckung:** der Lauf blieb bei 14 Aufrufen am
Aufrufzähler stehen — nicht am Geld, 4,46 von 10 USD blieben liegen — und meldete **470 Dateien mit
5,4 MB als NOT REVIEWED**, darunter jede Komponente der Prozesskarte, der Prozessrevisionen, der
Prozesszustände und der Arbeitsraum-Schale. Rund die Hälfte des Codes, und zwar die neueste.
`maxBatches` steht jetzt auf 24; eine Release-Prüfung kostet damit rund 9,50 statt 5,50 USD. **Volle
Abdeckung wären etwa 28 Aufrufe und rund 11 USD — das ist eine Entscheidung über die Obergrenze und
liegt bei Sonny.**

Von den 59 hohen Befunden sind 16 verschiedene Sachverhalte bestätigt, 13 widerlegt und eingetragen
(darunter fünf, die einen dokumentierten Entwurf als Fehler melden, und `f9b0a7417acd`, dessen
Fingerabdruck als bereits behoben im Code steht — die Datei stand in der NOT-REVIEWED-Liste desselben
Berichts). Behoben in `4d6f35c`: `2878b5f8fae3`/`dfa0816bc852` (Zielplattform als Parameter),
`b97e45a2976d` (Sitzung einer gesperrten Anmeldung), `3e32d011b3c6` (Schreibvorgang auf ein
gelöschtes Projekt). Eingeplant, nach Gewicht: `67ac19222d96`, `45a8a7cf4a0c`, `f9695d22d124`,
`0d8443fae823`, `c816fed880a9`, `827cf6758637`, `66f75a3d4632`, `6db23bf69b81`, `a63e125a5dc2`,
`8bf84ca5d67c`, `773af92784d5`, `b5825ac75816`, `ae206f1937c6`.

**`2a9864f3b52e`** (Delta-Prüfung von `4d6f35c`, `lib/firebase-admin.ts`) gehört zu derselben
Architekturfrage wie der Absatz darüber und ist die ehrliche Grenze der Reparatur in `4d6f35c`: ein
bereits ausgestelltes ID-Token bleibt bis zu einer Stunde gültig, und keine Regel liest den
Kontostatus. Aus unbegrenzt wird damit eine Stunde; geschlossen wird es erst mit der Regeländerung —
und die braucht einen manuellen Rules-Deploy.

**Vollprüfung von b88c77b4b5d1 (v2.13.0, 18.09.2026, `openai/gpt-5.6-sol`, 769 Dateien, 5,70 $):**
1446 Befunde — 49 kritisch, 226 hoch, 1129 mittel, 42 niedrig — Verdikt `no_go`, **INCOMPLETE**. Erste
Sichtung am Abend: **47 der 49 kritischen mit Beleg widerlegt** — 34 Workflow-Befunde (Prämisse ist ein
zweiter Mitarbeiter mit Schreibrecht; die Kollaboratorenliste nennt genau ein Konto, Fork-PRs bekommen
keine Secrets; als Bedingung im Register: ab dem zweiten Konto wird jeder davon wahr), 5 „secret-named
literal" (Storage-Schlüsselnamen), 8 zur Signaturkette (`files[].bytes` ist im Kopf von
`lib/audit-pack-canonical.ts` bewusst ausgenommen — der Inhalts-Hash pinnt die Datei; das
`provenance`-Label liest kein Verifizierer, die Klassifikation kommt aus der signierten
`attested`-Liste, `lib/audit-pack-verify.ts:125–153`). **Offen:** `26350daa4493`/`8f267dbfbd9b` — der
Web-Verifizierer hasht `file.async('text')` statt der Archiv-Bytes; ein ungültiges UTF-8-Byte, das zum
selben Zeichen dekodiert, passiert — Wirkung null (gleicher Text), Härtung klein (BACKLOG 33). **Die
226 hohen sind nicht triagiert;** nach Datei gruppiert in BACKLOG 33 — Router-Fehlrouten, Open-SQL-Leser,
Nebenläufigkeit in Transformation/Design/Dokumentation, gelöschte Projekte werden von laufenden Runs
wieder angelegt, gesperrte Konten behalten Firestore-/S/4-Zugriff, Quittungen nicht an Quelle gebunden.
Triage thematisch, je Thema ein Schritt, gesperrte Konten und Löschung zuerst — nächste Sitzung. Volltext
nur lokal unter `.qa-review/b88c77b4b5d1.full.json`.

**Vollprüfung von a19945ef01dc (v2.11.1, 16./17.09.2026, `openai/gpt-5.6-sol`, 14 Aufrufe, 4,57 $):**
504 Befunde — 30 kritisch, 94 hoch, 373 mittel, 7 niedrig — Verdikt `no_go`, **INCOMPLETE** (der Diff von
`analyze/page.tsx` allein, 172.900 Zeichen, passt in keinen Aufruf; über sechzig weitere Dateien lagen
außerhalb der 14 Aufrufe). Erste Sichtung in der Nacht: 6 der 30 kritischen stehen bereits in der Tabelle
unten (fünf „behoben (dev)", darunter `cfafefac08ec` via 0.13 und `1b75f0d332da`), 8 sind mit Beleg
widerlegt — `vercel.json` und die beiden Survey-Workflows existieren am geprüften Commit nicht
(`git cat-file -e` schlägt fehl, kein Workflow ruft `scripts/send-survey*.ts`), drei Muster-Treffer
„secret-named literal" meinen den öffentlichen Verifier und den dokumentierten Testschlüssel. **Am 17.09.
geprüft — sechs von ihnen, fünf widerlegt und einer behoben:** die vier Befunde „client-schreibbare
Artefakte gelangen in server-signierte Packs" (`design/documentation/transformation/page.tsx`,
`firestore.rules:169`) beschreiben eine Allowlist, die es gibt, und einen Weg von dort in eine signierte
Datei, den es seit 0.12 nicht mehr gibt: `lib/audit-pack-build.ts` baut den Eingang der signierten
Generatoren aus benannten Feldern des unveränderlichen Runs, die Aussagen des Kontoinhabers stehen in
`07-user-attested.md`, das die Signatur ausdrücklich nicht deckt, und `tests/audit-pack-signed-input.spec.ts`
misst beides. Der Workflow-Befund (`usage-report.yml:27`) ist ein übertragener Befund einer älteren
Prüfung und war am geprüften Commit bereits erledigt — die Empfängerangabe ist seit `b2eceeb` weg,
`tests/no-fabricated-figures.spec.ts` hält sie weg. Bestätigt und behoben ist `6a3eea208009`
(`app/api/projects/[projectId]/route.ts`, Tabelle unten). **Weiter offen und als Nächstes zu prüfen:** die
Familie um die Audit-Pack-Kanonisierung — elf Befunde zu
`lib/audit-pack-canonical.ts:46` (Delimiter-Kollisionen in der signierten Dateiliste),
`lib/audit-pack-verify.ts:136/174` (Attestation nach Versiegelung änderbar, Manifest-Metadaten nicht
authentifiziert) und `scripts/verify-pack.mjs:212–269`. Von den 94 hohen sind 14 bekannt, 80 neu — Triage nach
den kritischen. Fingerabdrücke sind weiterhin instabil (`5c7ab85b9493` ist ein Zwilling von `cfafefac08ec`).
Volltext nur lokal unter `.qa-review/a19945ef01dc.full.json`.

**Ergebnis der Triage vom 17.09.2026, Vormittag:** Von den 30 kritischen sind damit
**alle entschieden** — 6 waren bekannt, 13 mit Beleg widerlegt, **11 bestätigt und behoben**
(eine Zeile je Fingerabdruck in der Tabelle unten). Die elf waren drei Defekte in der
Vertrauenskette, und der erste ist der schwerste des Tages:

- **Die Signatur deckte nicht, was sie zu decken vorgab.** Ein Dateiname durfte das
  Trennzeichen der kanonischen Form tragen, also ließen sich zwei signierte Beweisdateien
  zu einer zusammenziehen: gleiche kanonische Bytes, gültige Signatur, eine Beweisdatei
  weniger im Archiv — `verify-pack` antwortete „Verified" mit Exit 0. Unabhängig
  nachgestellt, bevor der Fix gebaut wurde.
- **Die Attestation ließ sich nach dem Versiegeln umschreiben:** `lib/audit-pack-verify.ts`
  prüfte nur, *ob* die Datei im Archiv liegt, nicht ihren Inhalt. `07-user-attested.md`
  von „sign-off: not given" auf eine erfundene Freigabe geändert — beide Verifier grün.
- **Ausgabedatum und Formatversion waren nicht gebunden;** ein auf 2019 gesetztes Datum
  wurde vom CLI gedruckt und als bestätigt ausgewiesen.

Behoben in `2269c2f` (Format 3 der kanonischen Form, Eindeutigkeitsprüfung, Digest je
attestierter Datei, Ausgabeabschnitt vor dem Hash). **Alte Mappen verifizieren
byte-identisch weiter** — ohne `version` oder unter Format 3 ist die kanonische
Zeichenkette unverändert, und die Trennzeichenprüfung schließt das Loch rückwirkend auch
auf ihnen. Eine Falle unterwegs: eine breitere erste Regel hat die Ausstellerroute mit 500
abgeschossen, weil der echte Katalogstand Doppelpunkt *und* Komma enthält und mit diesem
Wert jede bisherige Mappe signiert ist; die Laufbindungsfelder halten deshalb nur das
Abschnittszeichen frei, ab Format 3 wird maskiert, und ein Spec hält den Livewert fest.

Widerlegt wurden unter anderem: `vercel.json` und die beiden Survey-Workflows existieren am
geprüften Commit nicht; drei „secret-named literal"-Treffer meinen den öffentlichen
Verifier und den dokumentierten Testschlüssel; die vier Befunde zu client-schreibbaren
Artefakten in signierten Packs hat Schritt 0.12 bereits geschlossen. Von den 94 hohen sind
14 bekannt; die übrigen 80 sind die nächste Triage.

| Fundstelle | Fingerabdrücke | Status |
|---|---|---|
| `lib/audit-pack-canonical.ts` | 5c21559e33f1, ed6cf1966ae3, ac87d7b88177 | behoben (dev) |
| `scripts/verify-pack.mjs` | 22f63fdbc2aa, f3c3f9e6707a, 79fcd214a0a5 | behoben (dev) |
| `lib/audit-pack-verify.ts` | 906a1b09ed21, f205740a59d0, 6ea54787de01, 426849c4fc04, c20756cda847 | behoben (dev) |

**Vollprüfung von 44f3efb8b007 (v2.10.8, 16.09.2026, `openai/gpt-5.6-sol`, 452 Dateien):** 279 Befunde,
Verdikt `no_go`, Bericht als **INCOMPLETE** markiert. 128 Fingerabdrücke sind identisch mit der Prüfung von
v2.10.7 und stehen bereits in der Tabelle unten; 151 sind neu, davon 6 kritisch, 31 hoch, 113 mittel, 1 niedrig.
**Wichtig für die Triage:** die Fingerabdrücke sind zwischen zwei Läufen nicht stabil — mehrere „neue" Befunde
sind derselbe Defekt unter neuer Kennung (`3648021daaef` = `2d714ac42b63`, `794a874a08f5` = `2ea4b0048642`,
`c1e5727ba1d1` = `3bb4158405d8`, `2d6f76f3fccb` = `0c3362018102`), alle vier mit 0.15 am 16.09. behoben; die
MFA-Befunde (`5c7ab85b9493`, `cfafefac08ec`) sind mit 0.13 gegenstandslos. Die Triage der übrigen — zuerst die
sechs kritischen, darunter zwei Workflow-Befunde (`workflow_dispatch` mit freier Empfängeradresse) und zwei
Audit-Pack-Befunde, die behaupten, der 0.12-Fix reiche nicht — ist **offen** und der nächste Schritt nach 0.16.
Volltext nur lokal unter `.qa-review/44f3efb8b007.full.json`.

**Vollprüfung von 33471220d6e9 (v2.10.7, 15.09.2026; 13 Modellaufrufe, 443 Dateien, 4,91 $):**
144 Befunde — 11 kritisch, 36 hoch, 95 mittel, 2 niedrig. Geprüft am 16.09.2026: **130 bestätigt,
11 widerlegt, 2 unklar, 1 durch eine Änderung desselben Tages erledigt.** Von den kritischen sind 8 am
16.09. auf `dev` behoben (Testkonto-Erkennung nur noch über die CI-Domain; Delta-Sync überschreibt
keine neueren Zieldokumente; Survey-Skripte drucken keine Adressen und keinen Digest ins öffentliche
Log; der Offline-Verifier folgt keinem `signingKeyUrl` aus dem Pack, weist nicht aufgeführte
Archiv-Einträge ab und beendet ein unsigniertes Pack mit 2 statt 0; die Web-Verifikation weist nicht
aufgeführte Einträge ab; `vercel.json` entfernt), 3 sind eigene Schritte **0.12–0.13** — 0.12 ist am selben Tag gebaut. Die hohen und
mittleren Befunde füllen die neuen Phase-0-Schritte **0.14–0.18** und die genannten bestehenden. Die
widerlegten betrafen vor allem Komponenten und Funktionen, die nirgends gerendert oder aufgerufen
werden, und Schutzmaßnahmen an anderer Stelle (Server-Guard, Emulator-Ausnahme, bereits gebauter Fix).

**Ergebnis der Triage vom 18.09.2026 — die 94 hohen sind damit alle entschieden:** 15 waren
bekannt, **14 mit Beleg widerlegt, 62 bestätigt** (davon 28 Zwillinge, also **39 eigenständige
Defekte**) und 3 unklar und deshalb wie bestätigt behandelt. 21 der bestätigten sind am
laufenden Code nachgestellt — mit Engine-Probe, Firestore-Emulator oder nachgebauter Regex,
nicht nach Aktenlage. Jede Widerlegung liegt mit ihrem Beleg im versiegelten
`docs/qa/refuted-findings.enc.json` (115 Einträge).

Die drei schwersten:

- **Eine Kommentarzeile kann einen kritischen Befund vollständig löschen.** Ein
  auskommentiertes `* DATA vbak TYPE ztab.` lässt „Direct Write to SAP Standard Table VBAK"
  restlos verschwinden — ein Befund wird null (`f4383c553eaa`).
- **Jede je abgegebene Umfrageantwort ist unsichtbar.** Die Route schreibt mit einem Punkt im
  Schlüssel und legt damit ein Feld *namens* `answers.q1` an, statt in `answers`
  hineinzuschreiben; `data.answers` bleibt `undefined`, die Umfrageseite sieht nichts und der
  Digest zählt null (`b22563b1cd74`, am Emulator nachgestellt).
- **Nach einem Wechsel des Ed25519-Schlüssels verifiziert keine bereits ausgegebene Mappe
  mehr**, weil `/.well-known/` nur den aktuellen Schlüssel veröffentlicht (`40294c1bc63a`).

**Das Muster ist wertvoller als die Zahl.** Sechs der vierzehn Widerlegungen sind derselbe
Denkfehler: **der Prüfer liest einen Rückwärtskompatibilitäts-Test als eingefrorenen Defekt.**
Er sieht ein Manifest der Version 2.0 in einem Test grün bleiben und schließt daraus, das Spec
halte die Implementierung fest — ohne das Spec daneben zu öffnen, das für das heutige
Ausgabeformat genau das Gegenteil verlangt. Dieselbe Fehllesung traf am selben Tag vier als
`high` gemeldete Befunde der Delta-Review von `13d1ffa`, dort in der Form „eine Zusicherung
wurde entfernt", während der Commit sie mehrzeilig und schärfer ersetzt hatte. **Faustregel
für die nächste Triage:** bei jedem `test-weakening`-Befund zuerst prüfen, welche
Format- oder Versionsvariante der Test baut, und dann `git log` der Zieldatei auf die
Nettobilanz ansehen. Vier weitere Widerlegungen zeigen auf Zeilen, die am geprüften Commit
nicht mehr existierten (`carried: true` ist dafür ein guter Verdachtsfilter).

**Und ein Befund über die Befunde:** die dreizehn Engine-Defekte teilen **eine** Ursache —
Kommentare und String-Templates `|…|` werden vor der Regex-Erkennung nicht maskiert
(`f4383c553eaa`, `f5f91aeacd41`, `19bdc218308b`, `359639c30d77`). Eine literal- und
kommentarbewusste Vorstufe für alle Detektoren schließt vier hohe Befunde auf einmal; das ist
der lohnendste Einzelschritt in 0.18.

Einplanung: **0.14** Sicherheit (15 Fingerabdrücke, Titel zurückgehalten) · **0.15** Stufen (15) ·
**0.18** Engine (13) · **0.2** ehrliche Aussagen (11) · **0.16** Umfrage (2) ·
**0.5 / 0.6 / 0.7 / 0.17 / E07-F02** Vertrauenskette (9).

| ID | Schwere | Fundstelle | Befund | Roadmap-Schritt | Status |
|---|---|---|---|---|---|
| 13c6115ec642 | critical | app/api/runs/create/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.12 | behoben (dev) |
| 1b75f0d332da | critical | scripts/firestore-delta-sync.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | — | behoben (dev) |
| 33e463a6876e | critical | scripts/verify-pack.mjs | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | — | behoben (dev) |
| 4a4afa88c231 | critical | scripts/verify-pack.mjs | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | — | behoben (dev) |
| 4a593e8bd77b | critical | scripts/send-survey-digest.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | — | behoben (dev); Workflow bleibt aus bis `main` |
| 6a3eea208009 | critical | app/api/projects/[projectId]/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | — | behoben (dev) — Vollprüfung a19945ef01dc |
| 70c8917150e7 | critical | app/api/audit-pack/create/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.12 | behoben (dev) |
| c5eeaff9124a | critical | lib/audit-pack-verify.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.5 | teilweise behoben (dev) — Archiv vollständig; Manifestfelder in 0.5 |
| cfafefac08ec | critical | components/LandingModals.tsx | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.13 | behoben (dev) — 0.13, Firebase-MFA |
| d2006fdbfa95 | critical | scripts/send-survey.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | — | behoben (dev); Workflow bleibt aus bis `main` |
| d87b93e17d38 | critical | vercel.json | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | — | behoben (dev) — Datei entfernt, auf Cloud Run ohne Wirkung |
| f8ef554cfa89 | critical | lib/test-accounts.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | — | behoben (dev) |
| 0c3362018102 | high | components/SamplePackageDownload.tsx | The advertised importable package contains an invalid CDS view-entity annotation | 0.15 | eingeplant |
| 0fd415bb9927 | high | tests/security-compliance.spec.ts | Admin E2E requests cannot satisfy the enforced MFA step-up | — | widerlegt |
| 1012acfcd241 | high | components/TransformationReplay.tsx | Timer-driven replay reports compilation and test-generation results that were never produced | 0.2 | eingeplant |
| 19054f8f195f | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 1c5a5c920b77 | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 1e47826dd2c5 | high | .github/workflows/grok-review.yml | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.16 | eingeplant |
| 2526b03d8fd4 | high | lib/project-loader.ts | Run metadata overwrites project workflow state during hydration | — | widerlegt |
| 2d714ac42b63 | high | app/(app)/project/[projectId]/analyze/page.tsx | Any non-empty text is accepted, charged and signed as legacy code | 0.15 | eingeplant |
| 2ea4b0048642 | high | app/(app)/project/[projectId]/analyze/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.15 | eingeplant |
| 3bb4158405d8 | high | app/(app)/project/[projectId]/tco/page.tsx | Year-1 ROI excludes the implementation investment from the return | 0.15 | eingeplant |
| 3d1ade86103c | high | lib/analysis-prompt.ts | An unspecified deployment target is asserted as Private Edition / RISE | — | unklar — nur über eine handgebaute URL mit `autoAnalyze` erreichbar; wird in 0.15 mitgeschlossen |
| 45737310a1d7 | high | lib/abap/extensibility-router.ts | Incomplete detector coverage is converted into a 100% clean score and “trivial” feasibility claim | 0.18 | eingeplant |
| 4a4321a45f3c | high | lib/board-deck.ts | Board deck manufactures go-live approval without approval evidence | 0.8 | behoben (dev) (= UX-002) |
| 4f7643df8c3e | high | app/api/fetch-odata-metadata/route.ts | S/4 metadata responses can stream without a timeout or size bound | 0.14 | eingeplant |
| 50fd6bd9d3c3 | high | components/analyze/TargetScopeMapping.tsx | Every project is shown fabricated cloud-readiness and decommission percentages | 0.2 | eingeplant (= UX-001) |
| 512ed3a9e6bd | high | scripts/send-survey.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | — | behoben (dev) |
| 569fc1c41e35 | high | app/api/admin/set-admin-claim/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.14 | eingeplant |
| 5a660ef009dc | high | scripts/firestore-verify-migration.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| 7569e044e45d | high | scripts/verify-pack.mjs | Packs whose authenticity is skipped receive the verifier's success exit code | — | behoben (dev) |
| 778c72a5cde2 | high | lib/abap/sap-api-catalog.ts | Catalog maps warehouse quant data to a storage-bin master view | 0.18 | eingeplant |
| 789f1985a410 | high | components/TransformationShowroom.tsx | Static showroom markup presents unexecuted tests and compilation as passed validations | 0.2 | eingeplant |
| 7b679cca1fbf | high | lib/runner-egress-attestation.ts | Two blocked destinations are treated as proof that generated runner code has restricted egress | — | widerlegt |
| 85e767799587 | high | lib/rate-limit.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.14 | eingeplant |
| 8c7c26a637d1 | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.14 | eingeplant |
| 9b1af76b65c9 | high | app/(app)/dashboard/page.tsx | BYOK and enterprise users are still blocked by the free transformation limit | 0.15 | eingeplant |
| a16b24c91b2d | high | components/analyze/EvidenceSweep.tsx | An evidence scan with zero findings never completes | — | widerlegt |
| a3b0057bd113 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing analysis is replaced with a fabricated project-specific decision matrix | 0.2 | eingeplant |
| a4f7e6aef79b | high | .github/workflows/grok-review.yml | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.16 | eingeplant |
| cc5845ec545e | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.14 | eingeplant |
| d967e435917c | high | app/(app)/project/[projectId]/transformation/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.15 | eingeplant |
| e078d502e983 | high | app/(app)/project/[projectId]/transformation/page.tsx | Profile hydration can start the automatic transformation twice | 0.15 | eingeplant |
| e184fc0c59bf | high | app/(app)/project/[projectId]/analyze/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.15 | eingeplant |
| e538b51c10f5 | high | lib/s4-credentials.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| eac2cdb069a7 | high | lib/chatbot-knowledge.ts | Chatbot teaches a workflow that contradicts the canonical seven phases | 0.2 | eingeplant |
| eac6118f1eac | high | lib/abap/code-assessment.ts | Internal-table INSERT, MODIFY and DELETE statements are reported as database coupling | 0.18 | eingeplant |
| f4561d983d92 | high | scripts/security/lib/surface.mjs | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.16 | eingeplant |
| 052d2fe8f51c | high | lib/abap/code-assessment.ts | Short programs that write SAP standard tables are recommended for retirement | 0.18 | eingeplant |
| 0613631545b2 | high | app/(app)/project/[projectId]/analyze/page.tsx | Confluence export fabricates project-specific routing evidence when optional analysis is missing | 0.2 | eingeplant |
| 093df0feed02 | high | app/api/test-s4-odata-read/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 0e2d5f95821f | high | app/api/fetch-s4-metadata/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 1386ead8a318 | high | app/api/runs/create/route.ts | The signing route accepts arbitrary non-ABAP text as a completed analysis run | 0.15 | eingeplant |
| 1925189d0606 | high | app/page.tsx | Worked examples are falsely described as compiled, tested, and verified | 0.2 | eingeplant |
| 19bdc218308b | high | lib/abap/findings-detector.ts | Keywords inside string templates become support findings | 0.18 | eingeplant |
| 241c291b4205 | high | lib/workflow-steps.ts | Client-authored test statuses still unlock Testing and Delivery | E07-F02 | eingeplant |
| 2913b2ec26d6 | high | lib/audit-signing-keypair.ts | Signing-key rotation makes previously issued packs fail default verification | 0.5 | eingeplant |
| 2ba9cba8e984 | high | app/api/fetch-odata-metadata/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 2f60dc7f9d20 | high | app/whitepaper/page.tsx | Whitepaper promises export of a compiled package without an ABAP compilation path | 0.2 | eingeplant |
| 359639c30d77 | high | lib/abap/code-assessment.ts | RFC/BAPI detection misses normal module names and scans non-executable text | 0.18 | eingeplant |
| 3ad7de2e710c | high | app/api/audit-pack/create/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 40294c1bc63a | high | lib/audit-signing-keypair.ts | Key rotation breaks default verification of previously issued packs | 0.5 | eingeplant |
| 45b717594b8d | high | app/(app)/project/[projectId]/delivery/page.tsx | ABAP delivery archives do not contain valid abapGit repository metadata | 0.15 | eingeplant |
| 4692f9ace1b9 | high | app/(app)/project/[projectId]/design/page.tsx | Any non-empty model response is persisted as a completed design | 0.15 | eingeplant |
| 46b217f0aebb | high | lib/workflow-steps.ts | Client-authored Passed strings are still treated as proven test execution | E07-F02 | eingeplant |
| 46cf75c33b44 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing comparative analysis is replaced with fabricated project-specific conclusions | 0.2 | eingeplant |
| 498a8c35f988 | high | components/design/CloudServiceIntegrations.tsx | SAP HANA services are mapped to the PostgreSQL implementation guide | 0.2 | eingeplant |
| 4aadc9188407 | high | app/(app)/project/[projectId]/documentation/page.tsx | Parseable but structurally invalid JSON is saved as completed documentation | 0.15 | eingeplant |
| 50704cd319b4 | high | components/analyze/ExtensibilityDecisionMatrix.tsx | Missing route evidence is replaced with fabricated project assessments | 0.2 | eingeplant |
| 5af40f93f84c | high | app/(app)/project/[projectId]/transformation/page.tsx | The generation lock does not prevent cross-tab transformations from overwriting each other | 0.15 | eingeplant |
| 5dce9bd7ff9e | high | lib/abap/usage-parser.ts | Whitespace-only XLSX counts become measured zeroes and retirement candidates | 0.18 | eingeplant |
| 62c08912d745 | high | components/design/CloudServiceIntegrations.tsx | SAP HANA services are still mapped to the PostgreSQL implementation guide | 0.2 | eingeplant |
| 666a399f4dd2 | high | components/TransformationReplay.tsx | Timer-driven replay still reports compilation and generated tests that never occurred | 0.2 | eingeplant |
| 7182b3754472 | high | app/api/test-s4-odata-read/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 725c5d80afc6 | high | lib/abap/extensibility-router.ts | Routing checkpoints assert constructs that were not detected | 0.18 | eingeplant |
| 751bd4ef8e8b | high | app/(app)/project/[projectId]/transformation/page.tsx | Non-JSON model output is still saved as a completed transformation | 0.15 | eingeplant |
| 766ae59f10e4 | high | lib/abap/usage-parser.ts | Whitespace-only spreadsheet counts still become measured zeroes | 0.18 | eingeplant |
| 76c6c79c6f72 | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 79dc8a8a2d59 | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 7bf8808c5773 | high | lib/firebase-admin.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 7ce412f6a068 | high | lib/audit-signing-key.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 80da84ae34ce | high | lib/abap/usage-parser.ts | Negative fractional counts can be rounded into retirement evidence | 0.18 | eingeplant |
| 832ddd8c145e | high | firestore.rules | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 8e69958dd531 | high | app/(app)/project/[projectId]/design/page.tsx | Concurrent design regenerations can overwrite each other and mix design with unrelated NFRs | 0.15 | eingeplant |
| 95d0baf27ef4 | high | app/api/test-s4-connection/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| 9a6e2d291c22 | high | .github/workflows/deploy.yml | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| a0a649312df1 | high | app/api/survey/vote/route.ts | Survey answers are stored under literal dotted field names | 0.16 | eingeplant |
| a2b81a5bd2ab | high | app/(app)/project/[projectId]/analyze/page.tsx | Model-authored routing confidence still overrides the deterministic run confidence on screen | 0.15 | eingeplant |
| a3b0bfd48551 | high | lib/abap/select-parser.ts | A decimal literal can truncate a SELECT before later joins | 0.18 | eingeplant |
| ac4cdeea96b6 | high | app/api/test-s4-connection/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| ae52df4b0683 | high | app/api/runs/create/route.ts | The signing route still accepts arbitrary non-ABAP text as a completed run | 0.15 | eingeplant |
| ae858da40fb5 | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis objects make documentation generation fail before calling Gemini | 0.15 | eingeplant |
| b22563b1cd74 | high | app/api/survey/vote/route.ts | Survey answers are still stored under literal dotted field names | 0.16 | eingeplant |
| b429fb9e0d5b | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis data crashes documentation generation | 0.15 | eingeplant |
| b70c8431c87d | high | lib/workflow-steps.ts | Editing one byte of a stale artefact makes it appear current | 0.6 | eingeplant |
| c1523df5fc4e | high | hooks/useTestExecution.ts | Auto-healing replaces the complete generated package with one unverified source file | 0.2 | eingeplant |
| c7ed32966a98 | high | app/api/run-tests/route.ts | Caller-supplied tests and code are reported as project test results without artefact binding | 0.17 | eingeplant |
| ce41dce9ccd5 | high | app/whitepaper/page.tsx | Whitepaper still advertises an uncompiled package as compiled | 0.2 | eingeplant |
| cece3b6a9c51 | high | app/api/fetch-s4-metadata/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| d228da9ee431 | high | app/(app)/project/[projectId]/design/page.tsx | Concurrent regenerations can mix a design with unrelated NFRs | 0.15 | eingeplant |
| d67ef0b953f0 | high | lib/audit-signing-key.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | eingeplant |
| de2651041d61 | high | app/api/projects/[projectId]/commands/route.ts | Concurrent analysis can attach an architect sign-off to an unreviewed run | 0.7 | eingeplant |
| dfa0816bc852 | high | app/(app)/project/[projectId]/analyze/page.tsx | Changing deployment in the confirmation modal signs the run against the previous deployment | 0.15 | eingeplant |
| e0261e6cf390 | high | app/api/runs/create/route.ts | Model receipts are not bound to the source or project represented by the signed run | 0.17 | eingeplant |
| e1523558dc46 | high | app/(app)/project/[projectId]/design/page.tsx | Any non-empty model response is persisted as a completed solution design | 0.15 | eingeplant |
| ed2b52cc2d3f | high | lib/abap/select-parser.ts | Valid unqualified JOIN clauses bypass complex-query assessment | 0.18 | eingeplant |
| ee1fe33023c7 | high | lib/workflow-steps.ts | Client-writable test statuses are treated as execution evidence and can unlock Delivery | E07-F02 | eingeplant |
| ee2390f88be0 | high | app/(app)/project/[projectId]/documentation/page.tsx | Structured analysis data still crashes documentation generation | 0.15 | eingeplant |
| f4383c553eaa | high | lib/abap/evidence-model.ts | Declarations inside comments can suppress critical database-write findings | 0.18 | eingeplant |
| f5f91aeacd41 | high | lib/abap/open-sql-discrimination.ts | ABAP string templates are not masked before internal-table discrimination | 0.18 | eingeplant |
| fa9e39148077 | high | app/page.tsx | Landing page still calls static demonstrations compiled, tested, and verified | 0.2 | eingeplant |
| fbc8bdcaa983 | high | lib/abap/extensibility-router.ts | Private-cloud standard-table writes are incorrectly presented as Tier-2 wrappable | 0.18 | eingeplant |
| fd3e6ec4d394 | high | lib/abap/coverage.ts | Common dynamic instance-method calls are omitted from findings and coverage gaps | 0.18 | eingeplant |
| 00875a4ff030 | medium | tests/board-deck.integrity.test.ts | The tests require go-live approval without execution or sign-off evidence | 0.8 | behoben (dev) |
| 024ec609bc86 | medium | app/(app)/project/[projectId]/design/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.15 | eingeplant |
| 03380a33a523 | medium | app/(app)/project/[projectId]/testing/page.tsx | Project-load failures leave the testing page permanently loading | 0.15 | eingeplant |
| 06f7c0c56a6c | medium | app/(app)/project/[projectId]/documentation/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.15 | eingeplant |
| 0a0ff08e1793 | medium | app/api/unsubscribe/route.ts | Failed one-click opt-outs are acknowledged as successful HTTP delivery | 0.16 | eingeplant |
| 0ce6b0b508e6 | medium | hooks/useUserProfile.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.14 | eingeplant |
| 11e4ad696bbf | medium | components/UpgradeToEnterpriseModal.tsx | The Jira modal leaves focus in the background and has an unnamed close control | — | widerlegt — toter Code |
| 130557afb876 | medium | app/(app)/abap-custom-code-analysis/page.tsx | The page advertises an unsupported 80% speed improvement | 0.2 | eingeplant |
| 13853f86d16f | medium | app/datenschutz/page.tsx | Privacy policy omits non-session local storage written by Settings | 0.2 | eingeplant |
| 14d4000c4586 | medium | lib/abap/select-parser.ts | SELECT text inside an ABAP string is parsed as a database statement | 0.18 | eingeplant |
| 14edf99a390c | medium | app/api/send-approval-email/route.ts | Missing production mail configuration still returns email success | 0.16 | eingeplant |
| 17a808b9bdf7 | medium | components/design/ArchitectureOverview.tsx | Missing architecture evidence is replaced with concrete platform defaults | 0.2 | eingeplant |
| 1c17fddcb8ee | medium | components/analyze/UsageUpload.tsx | Keyboard users cannot open the usage-file chooser | 1.5 | eingeplant |
| 210bafeb4c8b | medium | app/(app)/project/[projectId]/analyze/page.tsx | Route overrides retain the original route's confidence and rationale | 0.15 | eingeplant |
| 217726b404c9 | medium | app/(app)/project/[projectId]/tco/page.tsx | The financial chart omits the Year-0 investment point | 0.15 | eingeplant |
| 2217e46dd75a | medium | app/method/levels/page.tsx | Hard-coded disagreement count can drift from the generated census | 0.2 | eingeplant |
| 230989f67624 | medium | lib/usage-report-email.ts | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.16 | eingeplant |
| 25c80cb2df6f | medium | components/analyze/ConstructFindings.tsx | The UI labels findings “Signed Off” without recording any sign-off | 0.7 | eingeplant |
| 288aeb937b18 | medium | app/(app)/dashboard/page.tsx | The advertised public forum exists only in local component state | 0.2 | behoben (dev) — derselbe Defekt wie UX-059 |
| 2954ffcda441 | medium | components/design/CloudServiceIntegrations.tsx | *(Titel bis zur Auslieferung zurückgehalten — Sicherheit)* | 0.2 | eingeplant |
| 297e73fb33a7 | medium | lib/abap/result-diff.ts | Ordered value mismatches report zero rows on both sides | 0.18 | eingeplant |
| 2b0cacd91960 | medium | scripts/send-survey.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| 33a64dc1deb0 | medium | app/(app)/project/[projectId]/documentation/page.tsx | BPMN export does not escape names, roles, or identifiers | 2.6 | eingeplant |
| 34de0a87ea62 | medium | scripts/qa/lib/report.mjs | Report verdict is not derived consistently from blocking findings | — | unklar — Agenten-Infrastruktur; das Gate `blocks()` greift unabhängig vom Verdikt |
| 40e1db9fd37a | medium | app/(app)/project/[projectId]/testing/page.tsx | Test Connection ignores the connection details currently shown in the form | 0.15 | eingeplant |
| 4362479eb86e | medium | components/design/TargetArchitectureDiagram.tsx | Sparse RAP design data produces architecture nodes that were not in the design | 0.15 | eingeplant |
| 443b6524fe1a | medium | components/HowToClient.tsx | The walkthrough falsely presents generated strategy as SAP-verified and ISO-compliant | 0.2 | eingeplant |
| 47da79e233b5 | medium | app/catalog/page.tsx | Catalog promises lookup of objects it explicitly does not index | 0.2 | eingeplant |
| 484096c89fe2 | medium | app/page.tsx | Landing page makes an absolute no-training promise that the privacy policy disclaims | 0.11 | eingeplant |
| 4c53f05b5d23 | medium | lib/abap/support-matrix.ts | Direct SELECT is called fully supported even when no released mapping exists | 0.2 | eingeplant |
| 4cce312958d5 | medium | app/(app)/sap-clean-core-object-classification/page.tsx | Quick Answer incorrectly says every graded object is a lookup | 0.2 | eingeplant |
| 4db1e81408f4 | medium | app/(app)/project/[projectId]/documentation/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.15 | eingeplant |
| 50a1f1296bef | medium | app/(app)/how-to/page.tsx | Structured guidance publishes a six-stage workflow instead of the product's seven stages | 0.2 | eingeplant |
| 54635593d237 | medium | app/(app)/project/[projectId]/testing/page.tsx | ABAP suites bypass the UI's global live-test lock | — | widerlegt |
| 57876fae0053 | medium | app/(app)/admin/page.tsx | Email API failures are treated as successful notifications | 0.15 | eingeplant |
| 58dc160fd6c3 | medium | app/components/LegalOverlay.tsx | Legal overlay does not behave as an accessible modal | 3.0.4 | eingeplant |
| 5bbe253e35ef | medium | app/catalog/page.tsx | SAP-area cards label the total object count as successor coverage | 0.2 | eingeplant |
| 5db7f0eb4e38 | medium | lib/abap/transformation-prompt.ts | Untrusted ABAP is appended to the model prompt without an instruction boundary | — | widerlegt — kein Aufrufer |
| 5dbe58873773 | medium | lib/email-events.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| 605eb59318f7 | medium | app/(app)/project/[projectId]/transformation/page.tsx | The source analysis score is presented as grounding of generated code | 0.2 | eingeplant |
| 63c0cec78234 | medium | components/design/ApiBusinessHubMapping.tsx | Unverified model mappings are presented as officially released SAP APIs | 0.2 | eingeplant |
| 6500f93e60fd | medium | lib/admin-signup-email.ts | Signup notification claims the welcome email reached the user before delivery is known | 0.16 | eingeplant |
| 6a774e02134e | medium | scripts/ux/lib/config.mjs | The full UX review omits TypeScript modules that supply visible copy and email content | 0.16 | eingeplant |
| 6d40362efbf6 | medium | scripts/send-community-mail.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| 72556d36c205 | medium | components/SamplePackageDownload.tsx | The ABAP Unit include is named for the local test class instead of its owning global class | 0.15 | eingeplant |
| 75fb0bb39b9e | medium | app/(app)/project/[projectId]/analyze/page.tsx | Keyboard-only users cannot complete the new-analysis flow | 1.5 | eingeplant |
| 78c8013a33c1 | medium | components/design/SecurityHardeningChecklist.tsx | Security checklist explanations are mouse-only | 1.5 | eingeplant |
| 7cd9bc8bd16b | medium | components/UserOnboarding.tsx | The onboarding privacy notice gives an unconditional no-training assurance for BYOK requests | 0.11 | eingeplant |
| 812cbce3b485 | medium | tests/trust-chain-e2e.spec.ts | Trust-chain test can pass while audit-pack creation is completely broken | 0.17 | eingeplant |
| 823a09338d58 | medium | components/GuideShareBar.tsx | Clipboard fallback reports success without copying anything | 0.15 | eingeplant |
| 8272a89de93c | medium | app/(app)/knowledge/page.tsx | The knowledge page claims the app deploys and configures BTP security infrastructure | 0.2 | eingeplant |
| 883625214774 | medium | components/analyze/GapsWorklist.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.15 | eingeplant |
| 8a977779b6bd | medium | components/analyze/ExtensibilityDecisionMatrix.tsx | An empty checkpoint result crashes the decision matrix | — | widerlegt |
| 8d9184e6f94f | medium | app/(app)/project/[projectId]/analyze/page.tsx | The advertised 1 MB upload limit is not enforced | 0.15 | eingeplant |
| 989dafdac359 | medium | components/analyze/UsageRiskMatrix.tsx | Changing matrix cells leaves the previous object's detail displayed | 0.15 | eingeplant |
| 98e7aca0c7ef | medium | lib/chatbot-knowledge.ts | Knowledge base presents drafted architecture as infrastructure the service configures | 0.2 | eingeplant |
| 990aa825e15f | medium | app/api/mfa/setup/verify/route.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.14 | gegenstandslos (dev) — die Setup-Routen sind mit 0.13 weg |
| 9fb67cc60860 | medium | lib/abap/findings-detector.ts | A hierarchy with missing interfaces is still described as fully resolved | 0.18 | eingeplant |
| a2f85ffb6ce5 | medium | app/(app)/project/[projectId]/delivery/page.tsx | The audit pack is labelled Ready based only on an input fingerprint | 0.6 | eingeplant |
| a3a6c21cd984 | medium | components/LandingSlideshow.tsx | The landing slideshow presents draft generated output as deployment-ready | 0.2 | eingeplant |
| a48a8ba01b64 | medium | lib/abap/usage-parser.ts | Non-finite execution counts are accepted as measurements | 0.18 | eingeplant |
| a4fe4e2de430 | medium | lib/abap/usage-join.ts | Usage percentiles are calculated before duplicate object rows are aggregated | 0.18 | eingeplant |
| a530d2532b95 | medium | hooks/useTestExecution.ts | Simulated ABAP cases are still presented as passes | 0.2 | eingeplant |
| a5cd304e9023 | medium | components/PresentationViewer.tsx | Presentations display the viewing date instead of their recorded date | — | widerlegt |
| a71be0146d3c | medium | lib/board-deck.ts | Resolved-object metric subtracts finding occurrences from object count | 0.8 | behoben (dev) |
| a73e75baec14 | medium | components/design/SyncPatternCard.tsx | The design-stage sync card always claims the core has been transformed | 0.2 | eingeplant |
| aad1ecf24d47 | medium | app/(app)/admin/page.tsx | Suspended accounts are displayed as pending applications | 0.15 | eingeplant |
| ab15c7746a28 | medium | app/(app)/sap-cloudification/page.tsx | Public copy calls unvalidated model output clean-core-compliant | 0.2 | eingeplant |
| ad567beae4a0 | medium | components/VerificationRail.tsx | The current phase always appears green even when workflowSteps marks it stale or partial | 1.7 | eingeplant |
| b0b3150a1974 | medium | components/UserOnboarding.tsx | The mandatory onboarding overlay lacks dialog focus management and semantic labeling | 3.0.4 | eingeplant |
| b18d35df575f | medium | scripts/qa/refute.mjs | Full-review findings cannot be selected by the refutation command | — | behoben (dev) |
| b43997202535 | medium | app/(app)/project/[projectId]/transformation/page.tsx | ABAP Cloud transformations are presented as Node.js output | 0.2 | behoben (dev) — derselbe Defekt wie UX-037 |
| ba5757ea1a85 | medium | lib/abap/narrative-anchors.ts | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.18 | eingeplant |
| c217cf83fa3c | medium | app/(app)/project/[projectId]/tco/page.tsx | TCO range controls have no accessible names | 1.5 | eingeplant |
| c2923dfd70ab | medium | app/(app)/settings/page.tsx | Settings form controls lack programmatic labels and switch state | 3.0.4 | eingeplant |
| c47eaa19b11d | medium | app/api/v1/purchase-orders/mass-create/route.ts | Mock purchase orders are returned as completed successes without simulation labeling | 0.2 | eingeplant |
| c4c4f5112a00 | medium | components/LandingModals.tsx | The advertised MFA recovery-code path cannot accept recovery codes | 0.13 | gegenstandslos (dev) — keine Wiederherstellungscodes mehr, 0.13 |
| c50ddb41f588 | medium | components/SectionBoundary.tsx | Every section crash is attributed to an older analysis run without evidence | 0.2 | eingeplant |
| c7466a7f2570 | medium | app/(app)/project/[projectId]/transformation/page.tsx | Remediation mode claims code changes but only changes banner text | 0.2 | behoben (dev) — derselbe Defekt wie UX-038 |
| ce37b706107d | medium | app/(app)/project/[projectId]/transformation/page.tsx | Successful generation does not update the project used by the workflow UI | 0.15 | eingeplant |
| cff3ec1639d4 | medium | app/(app)/tenant-security/page.tsx | Documented admin review claims connection details that the request never collects | 0.2 | eingeplant |
| d163622eab8e | medium | tests/reference-analysis.spec.ts | Settled-count assertion does not prove which findings have provenance | 0.17 | eingeplant |
| d2a2d7d872e3 | medium | lib/markdownFormatter.ts | Most generated report formatters bypass mandatory money masking | 0.4 | eingeplant — Nachtrag zu 0.4 |
| d943e1fc71a5 | medium | tests/mfa-coverage-guard.spec.ts | Trust-chain MFA coverage only checks that a call-shaped string exists | 0.17 | eingeplant |
| db4bbb64fd81 | medium | components/design/CloudServiceIntegrations.tsx | Cloud-service deep dives cannot be opened with a keyboard | 1.5 | eingeplant |
| dddbda2a0c32 | medium | app/(app)/how-it-works/page.tsx | The generation stage is described as deterministic and compiled when it is neither | 0.2 | eingeplant |
| dfc85c150088 | medium | app/(app)/verify-pack/page.tsx | The Audit Pack upload control is not keyboard operable | 1.5 | eingeplant (= UX-003) |
| e8f7f5d6c528 | medium | app/(app)/knowledge/page.tsx | Both extensibility routes are given an absolute zero-upgrade-impact guarantee | 0.2 | eingeplant |
| ed9796910f5a | medium | app/globals.css | Mobile document tables remove column headers from the accessibility tree | 3.0.4 | eingeplant |
| edf9bcc47461 | medium | app/(app)/project/[projectId]/delivery/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.6 | eingeplant |
| f3428b0782a9 | medium | tests/tco-finite-guard.spec.ts | TCO boundary tests execute a copied model and omit the missing-score case | 0.17 | eingeplant |
| f480d96b63d1 | medium | app/api/test-s4-connection/route.ts | Endpoints that reject HEAD are never retried with GET | 0.15 | eingeplant |
| f7110f3d6619 | medium | app/survey/[token]/SurveyClient.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| f95980a7ffed | medium | lib/audit-pack-verify.ts | Signature-service failures are represented as an unsigned pack | 0.5 | eingeplant |
| fae6b4d2b2d0 | medium | app/survey/[token]/SurveyClient.tsx | Confirming an emailed preselection clears it for multi-select questions | — | widerlegt |
| 8ccb1b1b765b | low | app/survey/[token]/page.tsx | *(Titel bis zur Auslieferung zurückgehalten — Integrität)* | 0.16 | eingeplant |
| bcbe2c770c8a | low | tests/workflow-style-guard.spec.ts | Rendered seven-stage style check omits the TCO stage | 0.17 | eingeplant |

## 15. Gegenreview c5085bb (18.09.2026) — Aufnahme

Sonny hat den vollständigen Codeexport von `c5085bb` extern prüfen lassen. Das Paket
(`clean-core-review-c5085bb.zip`, privat, mit dem Export selbst) hat — anders als die drei
Agenten — Funktionen wirklich ausgeführt: Router, Klassifikation, Skelett- und BPMN-Generator auf
72 Korpusquellen, TCO-Modell, XML-Wächter, den Korpus-Vergleicher mit sechs Mutanten und eine
lokale Node-Permission-Probe; dazu zwölf SAP-/Anbieter-Primärquellen. 20 Befunde (14 P1, 6 P2),
eine eigene 3.0-Reihenfolge (G0–G4) und eine Marktbewertung. Jeder Punkt wurde am 19.09. am
Code nachgeprüft; das Urteil steht hier, die Schritte in den Phasentabellen.

**Die Freigabeempfehlung des Reviews** — weiterentwickeln, Stärken bewahren, den Stand nicht als
durchgängig belastbare 3.0-Entscheidungsplattform vermarkten — ist deckungsgleich mit §4 „Stand".

| ID | Befund | Urteil am Code | Übernahme |
|---|---|---|---|
| CR-01 | Classic-/Cloud-Präzedenz | teils: D ist bewusst (Kommentar in `abcd-classification.ts`, 21/22 Overlap-Objekte mit Nachfolger) und für den Cloud-Zielbezug vertretbar; unbestritten fehlt die zweite Dimension | 7.9 · Entscheidung §9 Nr. 18 |
| CR-02 | Kein Zielrelease-Vertrag | bestätigt (Design): Katalog „latest" global, Run signiert nur Katalog- und Regelversion | 7.10 (L, vor 3.0 — G0) |
| CR-03 | Public Edition erzwingt CAP | bestätigt, Tatsachenfehler: Developer Extensibility hat eigene Tabellen on-stack (SAP Learning) | Router-Fix in Arbeit 19.09. (Agent), Ratsche geprüft |
| CR-04 | Standard-Fit aus Schreibzugriffen | bestätigt: technische Beobachtung als fachliche Antwort | Router-Fix in Arbeit 19.09.; den Fit tragen 7.2/7.3 |
| CR-05 | Korpus-Ampel prüft nicht, was sie sagt | bestätigt (sechs Mutanten bleiben *agree*) | 1.9 |
| CR-06 | Verbuchung zu früh als Aufgabe | Designentscheidung, Empfehlung: annehmen | §9 Nr. 15 → 2.12 |
| CR-07 | ADBC-Wirkung fehlt, CATCH „unreachable" | bestätigt (Generatorlauf CC-034) | 2.13, in Arbeit 19.09. (Agent) |
| CR-08 | Kein Einstieg für Methoden/Exits/Dynpro | bestätigt (9 von 74 ohne Einstieg) | 2.14 |
| CR-09 | Mock-Runner ohne belastbare Grenze | bestätigt; Minimal-Umgebung ohne Secrets ist da, die Grenze hält trotzdem nicht (Details privat) | §9 Nr. 16 → 8.9; **Zwischenschutz am 21.09. gebaut (`4f18fc6`)** — Bundler, CommonJS-Loader, Resolve-Hook und Nodes eigener Schalter, ausdrücklich keine Grenze |
| CR-10 | Auto-Healing gegen serverautoritären Runner | bestätigt an beiden Kommentaren: der Retry läuft gegen den alten Stand | 8.7; Auto-Healing bis dahin gesperrt |
| CR-11 | Freigabe nicht an den Run gebunden | bestätigt (Validator ohne `expectedRunId`) | 8.8 |
| CR-12 | Transformation folgt der Empfehlung | bestätigt — steht als 8.3 | 8.3, unverändert |
| CR-13 | Eingeladene Leser scheitern an vier Routen | bestätigt (`project.userId !== uid` auch bei GET) | **behoben 21.09. (`4f18fc6`)**, Lesen über `mayReadProject`, Schreiben bleibt beim Eigentümer; die Abnahme über alle Rollen ist 5.6 |
| CR-14 | Sichtwechsel verliert `#fragment` | bestätigt (`router.push('?…')`) | **behoben 21.09. (`4f18fc6`)**; der Revisionshinweis daneben bleibt 6.9 |
| CR-15 | Kein Revisionshinweis im Arbeitsraum | bestätigt (Design) | 6.9 |
| CR-16 | TCO: negative Werte, frühe Rundung | teils: Finite-Prüfungen da, Vorzeichen und Score-Intervall nicht, Rundung früh | **Validierung behoben 21.09. (`4f18fc6`)**; die Optionsrechnung selbst bleibt 7.4 |
| CR-17 | Nullnutzung → endgültig Retire | bestätigt | 6.7 umformuliert; Umsetzung folgt |
| CR-18 | Kein Katalogpfad → „Blocked by SAP" | bestätigt | 6.7 umformuliert; Umsetzung folgt |
| CR-19 | Alte Dokumentation, zweite Prozesswahrheit | bestätigt — steht als 3.0.5 | 3.0.5, unverändert |
| CR-20 | XML-Regex: kaputt akzeptiert, Default-Namespace abgelehnt | bestätigt (drei Proben nachvollzogen) | **behoben 21.09. (`4f18fc6`)**: `saxen` parst, Wohlgeformtheit und BPMN-Wurzel sind zwei Zustände — und `saxen` ist jetzt deklariert statt transitiv geliehen |

**Nicht übernommen, mit Grund.** (a) CR-01 als Grade B: der Grad ist der Clean-Core-Zielbezug,
nicht die klassische Nutzbarkeit — beides zu zeigen ist die Antwort, nicht der Wechsel der
Definition (Sonnys Entscheidung, Nr. 18). (b) Die Mockups als Nachweis-Ersatz zu verwerfen, ist
richtig — und schon so geplant: 3.0.6 verlangt echte Produktansichten. (c) Der Pilot mit zwölf
neuen Fällen und einem unabhängigen Reviewer (§11 des Reviews) ist kein Entwicklungsschritt; er
steht in §7 unter „ohne Version" neben Bench und fairem Vergleich, jetzt mit den acht Messgrößen
des Reviews als Vorlage. (d) Die Marktbewertung (§10) ändert keinen Schritt; ihre These — die
Differenzierung liegt im geringeren Übersetzungs- und Koordinationsaufwand pro belastbarer
Entscheidung, nicht in Sichten, BPMN, Audit oder „kostenlos" — ist die von §1 und wird zur
Messlatte für 3.0.6 und 3.0.10.

**Abnahmeordnung G0–G4 (übernommen; Zuordnung zu unseren Schritten):**

| Gate | Zweck | Schritte | Mindestabnahme |
|---|---|---|---|
| G0 — richtige, widerlegbare Antworten | Klassifikation, Zielprofil, Prozesssemantik, echte Vergleicherfacetten | 1.9 · 2.12 · 2.13 · 7.9 · 7.10 · Router (CR-03/04) | Overlap-Fall klassisch B/Cloud nicht; deprecated mit und ohne Nachfolger; gleiche Quelle unter zwei Profilen; Public-Tabelle mit Developer Extensibility; ADBC mit Fehlerpfad; `IN UPDATE TASK` mit und ohne Commit; die sechs Mutanten rot |
| G1 — Vertrauensgrenzen | Autorisierung, revisionsgebundene Commands, Runner | 5.6 · 8.7 · 8.8 · 8.9 | Owner/Reader/Widerruf/Admin-Claim über alle Routen; A lesen, B aktivieren, A freigeben → 409; Reparaturentwurf mit neuer Identität; Nachweis nur vom isolierten Worker |
| G2 — ein konsistenter Arbeitsgegenstand | Sichtwechsel, Einstieg, Prozess und Dokumentation auf einem Stand | 2.14 · 6.9 · 3.0.5 · sofort (CR-14, CR-20) | Business → IT → Management → zurück: Auswahl und Revision identisch, auch nach Reload; Tab B erzeugt Revision, Tab A bekommt den Hinweis; XML-Wohlgeformtheit und fachliche Gültigkeit als getrennte Zustände |
| G3 — erst entscheiden, dann bauen | Bedarf, Gegenprobe, Optionskosten, verbindliche Architektur | 7.2 · 7.3 · 7.4 (vor 8.4) · 7.8 · 8.2–8.4 · 6.7 (Kandidat ≠ bestätigt) | kein Standard-Fit aus Altkonstrukt; keine bestätigte Stilllegung aus Nutzung allein; die Entscheidung bindet Bedarf und Kostenrevision |
| G4 — bewiesene Übergabe | Generatorvertrag, Receipts, Handover, Interoperabilität, Copy | 8.3 · 8.5 · 8.6 · 4.3 · 3.0.6 | drei vollständige Wege plus der offen bleibende Fall, je mit Negativproben; lizenzierter Signavio-Import protokolliert; Screen-, Zugriffs- und Performanceprüfung an echten Ansichten |

Was das Review über die Roadmap sagt und hier gilt: „Teilen vollständig" war zu weit (Kopf
umformuliert); 7.4 gehört vor 8.4 (vermerkt); die vier Töpfe sind Kandidaten, bis jemand
bestätigt (6.7); Transaktionswissen bleibt im Grundmodell (Nr. 15); Sicherheitsgrundlagen werden
nicht nach 3.0 verschoben, weil sie infrastrukturell unangenehm sind (Nr. 16, 8.9).

---

## 16. Auswertung eines SAP-Prozessbestands (22.09.2026) — Aufnahme

Sonny hat ein maschinenlesbares Archiv von **1.246 BPMN-Prozessdiagrammen** eines
SAP-Standardbestands bereitgestellt (573 Scope Items, 19.876 Knoten, 19.469 Flüsse).
Vier unabhängige Auswertungen haben es vermessen — drei lokal, eine als Zweitmeinung
über ein fremdes Modell, das **ausschliesslich** einen anonymisierten Zahlenauszug
bekam und die Diagramme nie gesehen hat.

**Die Auflage, und sie ist nicht verhandelbar.** Der Bestand ist lizenzrechtlich
gebunden: er darf nicht ins Repository, nicht ausgeliefert und nicht serverseitig
vorgehalten werden. §6 schliesst „SAP-Referenzprozesse als Inhalt" ohnehin aus.
**Übernommen wurde deshalb nichts als Inhalt, sondern nur als Erkenntnis** — Zahlen,
Verteilungen und Formregeln. Urheberrecht schützt den Ausdruck, nicht die Erkenntnis.
Keiner der sieben Schritte unten bringt fremde Inhalte ins Produkt; keiner enthält
eine Rollen-, Label- oder Prozessliste.

**Der Befund in zwei Sätzen.** Die Engine erzeugt heute einen Kontrollflussgraphen
mit BPMN-Namen — Return-Codes als Entscheidungen, keine Akteure, Schleifen als
Zyklen. Und das Prüfwerkzeug, das das aufdecken müsste, vergleicht **18,2 %** der
Skelettknoten und nennt den Rest grün.

**Entscheidung Sonny, 22.09.2026: alle sieben mit hoher Priorität.**

| | Was | Wo | Grösse | Ziel |
|---|---|---|---|---|
| V1 | Korpus-Skelettvergleich schärfen — **zuerst** | 1.9 | M | Glaubwürdigkeit · erhält |
| V2 | Return-Code ist Wirkung, nicht Entscheidung | 2.15 (neu) | M | Usability · erhöht |
| V3 | Lanes deterministisch aus vier Beweisarten | 2.16 (neu), 2.4 | M | Wettbewerb · erhöht |
| V4 | `DESIGN.md` §5.8 und Code in Deckung (a Parallelität, b Schleifen) | 2.17 (neu) | M | Glaubwürdigkeit · erhält |
| V5 | Acht Fallformen; `FUNCTION` ist kein Report | 2.10, 2.14 | M | Glaubwürdigkeit · erhöht |
| V6 | Vergleichsberechtigung je Element, drei Ergebnisse | 7.8 | M | Glaubwürdigkeit · erhält |
| V7 | „Gateway ohne Bedingung" nach Herkunft | 3.3 | S | Usability · erhält |

**Reihenfolge und Abhängigkeiten.** V1 steht vor V2, V3, V4 und V5 — ohne den
geschärften Vergleicher kann keine Engine-Regel je durch den Korpus rot werden, und
eine Änderung ohne Ratsche ist eine Behauptung. V5 braucht V2, V3 und V4 als
Sollwerte. V7 folgt auf V4 (b). V6 ist unabhängig und kann jederzeit, solange 7.8
offen ist.

**Was ausdrücklich nicht übernommen wurde**, geprüft und verworfen:

- **Den Bestand serverseitig vorhalten und still dagegen vergleichen.** Das Risiko
  sitzt im Besitz der Kopie, nicht im ausgelieferten Ergebnis, und ist damit binär —
  gute Absicherung macht es nicht kleiner. Das Repository ist öffentlich und Git
  vergisst nichts.
- **„Jeder XOR-Zweig braucht eine Bedingung" als Konformitätsregel.** Sie schlägt am
  Referenzbestand selbst in 53,9 % der Fälle an. V7 verengt unsere Regel, statt sie
  zu verschärfen.
- **Aus „im Bestand nicht gezeichnet" auf „gibt es nicht" schliessen.** Randereignisse
  und Task-Untertypen können in diesem Bestand strukturell gar nicht auftauchen —
  er ist aus Vektor-PDF rekonstruiert. V6 ist die Antwort darauf: drei Ergebnisse
  statt zwei.
- **Gateway-Dichte als Zielmetrik.** Ob 26 % gegen 13 % „falsch" sind, ist ohne
  Zuordnung Programm ↔ Diagramm nicht beantwortbar; ABAP ist legitim feiner als ein
  L3-Prozess. V2 misst deshalb die **Klasse** einer Bedingung, nicht die Dichte.
- **Den Stilteil des Benennungsvertrags als Produktregel** (Verb zuerst, Wortzahl,
  Schreibweise). Einquellen-Befund, von der Zweitmeinung ausdrücklich für nicht
  ableitbar gehalten. Er darf Hinweis sein, nie Bedingung (§9 Nr. 20).
- **Vergleich gegen einen vom Nutzer hochgeladenen fremden BPMN-Export.** Das wäre
  der BPMN-Import durch die Hintertür; er liegt seit dem 18.09.2026 bewusst nach 3.0.
- **Lanes aus Paketen, Klassen oder Includes.** Keine Akteursbeweise.

**Was der Bestand nicht beantworten kann**, ausdrücklich festgehalten, damit es später
nicht als beantwortet gelesen wird: Randereignisse und Task-Untertypen (strukturell
nicht extrahierbar) · Ereignis-Untertypen ausser Nachricht (nur als Summe messbar) ·
Datenspeicher · Schleifen- und Mehrfach-Instanz-Marker · **und vor allem das
Rundlaufverhalten von `extensionElements`, also genau die Frage von 4.3** — ein
PDF-Export trägt keine Extensions. Das bleibt ein Versuch mit einer echten Datei
gegen einen echten lizenzierten Workspace.

**Eine angenehme Bestätigung:** `DESIGN.md` §5.9 setzt „Übersicht ≈ 12 Elemente, eine
Ebene ≤ 25". Der Bestand hat Median 12 und p85 25. Das war eine Designmeinung und ist
jetzt gemessen — hier ist nichts zu ändern.

## 17. Modell je Stufe (23.09.2026) — Untersuchung und Aufnahme

Das Produkt ruft für alle sechs Modellstufen dasselbe Gemini-Modell. Sonny hat am
23.09.2026 eine Untersuchung beauftragt: „Modell je Stufe" gegen die Roadmap geprüft,
mit einem Vergleichslauf, ohne Codeänderung. Der volle Bericht liegt außerhalb des
Repositories (`scratch/modellvergleich/BERICHT.md`, nicht eingecheckt); hier steht,
was daraus folgt.

**Die Roadmap schweigt zur Modellwahl — vollständig.** Kein Modellname, keine Version,
keine Bedingung an die Modellgüte. Sie regelt, *ob* ein Modell gerufen wird (1.2,
Stufen einzeln zuschaltbar), nie *welches*. Gebrochen würde also keine Zusage. Die
einzige Schranke steht in `DESIGN.md`: ADR-025 fordert für die Namensstufe **Tempo**
(„22 Namen per Modellaufruf passen nicht sicher in 3 s") — die einzige Stelle im
Regelwerk, die überhaupt eine Modelleigenschaft verlangt, und sie verlangt
Geschwindigkeit, nicht Güte. §10 terminiert Bench-Kennzahlen (Halluzinationsquote)
ausdrücklich **nach 3.0**.

**Die Facette `fachsaetze` misst kein Modell.** `tests/helpers/korpus-comparison.ts`
prüft nur, ob Anker in existierende Zeilen zeigen, und ist hart auf `disagree`
verdrahtet: *„Nie `agree`: der Inhalt der Fachsätze wurde nicht verglichen."* Die
Zahl „0 agree / 68 disagree" heißt **es wurde nichts verglichen**, nicht „das Modell
versagt" — und keine der fünf Facetten ruft ein Modell, der Korpus wäre für jedes
Modell bitgleich. Er trägt aber die einzige echte Ground Truth des Repositories:
**173 verankerte Fachsätze, für die es heute keinen Erzeuger gibt.**

**Gemessen, 68 Aufrufe über vier Modelle:** null erfundene Anker, null erfundene
Geldbeträge, Schema praktisch durchgehend eingehalten. Die Ankerquoten sind
**statistisch ununterscheidbar** — gepaart je Fall enthält jedes der sechs
95-%-Intervalle die Null. Aus dem Rauschen treten nur Kosten und Zeit:
`gemini-3.5-flash-lite` kostet ein Drittel und ist 2,4-mal schneller, weil es keine
Denk-Token erzeugt.

**Ein Modellwechsel kann keine signierte Zahl bewegen.**
`app/api/runs/create/route.ts:459` signiert `Omit<…, 'analysis'>` — die Modellprosa
ist ausdrücklich aus der Signatur ausgenommen, und jede Zahl des Modells wird
serverseitig überschrieben. Die Risikoachse trennt deshalb nicht `analyze` von den
übrigen, sondern **`design` und `testing`** (Antwort ungeprüft gespeichert) von
**`naming` und `transformation`** (echte Gates).

**Entschieden (Sonny, 23.09.2026): kein globaler Wechsel.** Die Messung lief auf
Korpusfällen von durchschnittlich 543 Byte; der echte Analyse-Prompt ist 19.477
Token. Ein Modell ohne Denk-Token ist auf der schwersten Stufe das Gegenteil dessen,
was man will, und der Vergleich trägt „genauso gut" so wenig wie „besser". Dazu die
Zahl, die größer ist als die Modellfrage: **40 von 53 erwarteten Fachsätzen (75 %)
hat kein Modell getroffen.**

| Nr. | Schritt | Größe |
|---|---|---|
| 17.1 | **Toter Registereintrag.** `gemini-2.5-pro` steht in `app/api/gemini/route.ts` als „GA — stable fallback" und antwortet dem Produktionsschlüssel mit **HTTP 404, „no longer available to new users"** (nachgeprüft 23.09.2026, zweimal). Die Notluke `GEMINI_MODEL` würde ihn annehmen — ein Notausgang auf ein Modell, das nicht antwortet. Streichen oder durch ein lebendes GA-Modell ersetzen, und der Pin-Waechter prüft künftig, dass **jeder** Registereintrag antwortet. | S |
| 17.2 | **`testing` härten wie `documentation`.** `hooks/useTestGeneration.ts:93-108` parst die Modellantwort ohne Typprüfung, `result.testCases \|\| []` nimmt ein Objekt entgegen, speichert es, und `testing/page.tsx:1735` ruft `.map` darauf. Derselbe Defekt, den `0cb64a5` in der Dokumentationsstufe behoben hat — und **nur die Dokumentationsstufe hat eine `error.tsx`**, die Teststufe fängt den Absturz also an der Wurzel ab und nimmt den Knopf mit. Prüfung vor dem Schreiben plus Segment-Boundary. | M |
| 17.3 | **`naming` auf `gemini-3.5-flash-lite`** — aus Latenz, nicht aus Güte: ADR-025 verlangt Tempo, lite ist das einzige gemessene Modell ohne Denk-Token, der naming-Prompt ist mit 2.658 statt 19.477 Token der billigste, die Stufe hat die strengste Validierung und **keinen Signaturkontakt**. Ehrliche Grenze: **die Namensstufe selbst wurde nicht gemessen**, der Schluss steht auf Mechanismus und Promptgröße. Abnahme: ein Messlauf der Stufe, drei Durchgänge, gegen die heutige Vorgabe. | M |
| 17.4 | **Sauberer Messlauf vor jeder weiteren Modellentscheidung.** Drei Durchgänge je Modell auf **echten** Startbeispielen statt 21-Zeilen-Schnipseln. Ohne ihn trägt keine Aussage über `analyze`. | M |

**Zwei Hebel sind größer als die Modellwahl, beide unabhängig einplanbar:** das
Evidenz-JSON macht **49–56 %** des Analyse-Prompts aus und wird eingerückt
serialisiert; und `testing` macht **bis zu vier Modellaufrufe je Klick**. Beides
wirkt auf jede Stufe und auf jedes Modell. Beim Evidenz-JSON ist Vorsicht geboten:
es geht in den Hash ein, den die Quittung nennt.

**Wiedervorlage 01.01.2027:** der Preis der heutigen Vorgabe verdoppelt sich
(0,75 → 1,50 Eingabe, 3,75 → 7,50 Ausgabe je Million Token).

**Nicht anfassen, unabhängig davon, welcher Schritt kommt:**
`lib/model-receipt.ts` (der `modelId` ist, was *tatsächlich übergeben* wurde, nicht
was angefordert war), `/api/gemini` als einziger Weg nach außen,
`runs/create:459` (`analysis` außerhalb der Signatur), und historische Quittungen.

### Die Ground Truth, die niemand erzeugt (17.5 und 17.6)

Nachgezählt am 23.09.2026: **alle 68 Korpusfälle** tragen Fachsätze, zusammen
**173 Sätze mit 435 Ankern** — jeder Satz hat mindestens einen. Sie sehen so aus:

> `CC-003-B01` — *„Negative Beträge werden als INVALID eingeordnet."* → `source.abap:9`
> `CC-002-B01` — *„Nur eine nicht leere Kundennummer wird als Selektionsschlüssel aufgenommen."* → `source.abap:6–7`

Das ist nicht die Executive Summary, die `lib/analysis-prompt.ts:38` beim Modell
bestellt („plain english business executive summary"). Es ist die verankerte
Einzelaussage darüber, was der Code an dieser Stelle tut — **näher an dem, was die
Business-Sicht nach 3.0 zeigt, als an dem, was heute angefordert wird.** Die
Grundlinie zu 2.11 sagt es selbst: *„die Engine kennt die Aussageklasse nicht —
Fachsätze durchweg."*

Drei Dinge stehen damit nebeneinander, die zusammengehören: ein von Hand
geschriebener Sollwert, ein Prompt, der etwas anderes bestellt, und eine Facette,
die so tut, als prüfe sie beides. Solange das so steht, **kann keine Prompt- und
keine Modelländerung je zeigen, ob sie besser oder schlechter geworden ist.**
3.0 macht das nicht kleiner: die Hauptaussage der Business-Sicht ist genau die
verankerte Einzelaussage.

| Nr. | Schritt | Größe |
|---|---|---|
| 17.5 | **Erledigt 23.09.2026 (adb6d7d).** **Die Facette vergleicht wirklich.** `compareBusinessStatements` prüft heute nur, ob Anker in existierende Zeilen zeigen, und ist hart auf `disagree` verdrahtet; das Verdikt heißt `nicht-vergleichbar`. Künftig vergleicht sie die erzeugten Sätze gegen die 173 Sollsätze — **deterministisch**, über den Anker als Schlüssel und ein offengelegtes Textmaß, **kein Modell als Richter** (die Zweitmessung vom 23.09. hat genau das getan und trägt deshalb nichts). Je Fall Zähler und Nenner wie in 1.9; „nicht geprüft" bleibt verboten als `agree`. **Fertig, wenn** `baseline.json` für `fachsaetze` eine Zahl nennt, die sich bewegt, wenn man den Prompt ändert — und wenn ein absichtlich verschlechterter Prompt die Facette rot macht. | M |
| 17.6 | **Entschieden 23.09.2026 (Sonny): A+B, A zuerst.** **Wer die Fachsätze erzeugt** — heute niemand, und das ist eine Produktentscheidung, keine Technikfrage. Zwei Wege, und sie schließen sich nicht aus: **(a) die Engine** aus dem Skelett, deterministisch und damit ohne Modellkosten und ohne Halluzination, aber auf das begrenzt, was der Kontrollfluss hergibt; **(b) das Modell** mit einem Prompt, der genau danach fragt, statt nach einer Zusammenfassung — verankert, und durch 17.5 messbar. Gehört **vor** den Ausbau der Business-Sicht beantwortet, weil er bestimmt, was sie eigentlich sagt. Die Entscheidung gehört Sonny; dieser Schritt bereitet sie mit gemessenen Zahlen aus 17.5 vor, statt sie vorwegzunehmen. | M |

**Ergebnis 17.5 (gemessen, 23.09.2026).** Die Facette hat vorher nichts
verglichen: kein Modul in `lib/`, `app/` oder `components/` erzeugt heute
überhaupt einen Fachsatz, und die Facette prüfte nur den Anker — ein Satz, der
richtig verankert und inhaltlich falsch war, kam durch. `0/173` war Verdrahtung,
jetzt ist es eine Messung. Drei Teilprüfungen (`ankerpruefung`,
`fachsatzabdeckung`, `fachsatzinhalt`), Schlüssel ist die ABAP-Anweisung an der
Ankerzeile, Textmaß Dice über normalisierte Inhaltswörter. Die Schwelle 0,50 ist
am Korpus kalibriert und wird bei jedem Lauf neu nachgerechnet: verschiedene
Sollsätze erreichen höchstens 0,400, die mildeste Umformulierung fällt nicht
unter 0,571; 0,30 und 0,65 gehen beide rot.

**Die Zahl für 17.6:** was `lib/analysis-prompt.ts` heute bestellt — eine
Executive Summary — trifft **0 von 173** Sollsätzen bei 173/173 verglichenen
Sätzen. Nicht „unvergleichbar", sondern vergleichbar und daneben. Obergrenze des
Maßes ist 173/173 (Soll-Echo). Eine Zielzahl für den ersten Erzeuger fehlt noch
und gehört in 17.6, sonst misst man wieder ohne Sollwert.

**Offen in 17.6, zusätzlich zur Wegfrage:** zählt Erfindung als Fehler? Heute
nicht — erzeugte Sätze ohne Sollsatz bleiben straffrei, weil das Fallbuch seine
Fachsatzliste nirgends für vollständig erklärt. Bei Weg (b) ist genau das das
Halluzinationsrisiko. Soll es zählen, muss **der Korpus** die Vollständigkeit je
Fall erklären (analog `declaredEmpty` bei Befunden und Objekten).

### Die Entscheidung zu 17.6 (Sonny, 23.09.2026) und was daraus folgt

**Beide Wege, A zuerst.** Die Engine setzt die Untergrenze, das Modell wird
dagegen gemessen; ist das Modell schlechter als die Engine, fällt es weg.

Dazu drei Forderungen, die den Zuschnitt beider Schritte ändern:

1. **Der Satz muss den Code für einen Fachbereichsmenschen verständlich machen.**
   Nicht „SELECT auf KNA1", sondern was fachlich geschieht. Das ist der Maßstab,
   nicht die technische Korrektheit allein.
2. **Der Satz steht am BPMN-Element**, nicht in einer Liste daneben — so, wie die
   Business-Sicht in 3.0 gedacht ist (`docs/roadmap/clean-core-mockups-v2_8.html`).
   Wo es die Sache verlangt, **mit allen Details**; Kürze ist kein Wert an sich.
3. **Unschärfe wird aufgelöst *und* ausgewiesen — in dieser Reihenfolge.**
   Das ist die schärfste der drei und widerspricht dem bequemen Weg: `notDetermined`
   darf **nicht an die Stelle eines Satzes treten**. Erst wird die bestmögliche
   belegbare Aussage gebildet, dann wird der Rest an Unsicherheit *an* dieser
   Aussage vermerkt. Ein Element ohne Satz, aber mit „nicht bestimmt", erfüllt
   diesen Schritt nicht.

**Herkunft je Satz, aus dem bestehenden Vokabular (`lib/provenance.ts`), nie neu
erfunden:** Engine-Sätze sind `reconstructed`, Modellsätze `proposed`.
`notDetermined` bleibt zulässig für einen *Bestandteil* einer Aussage, nie für die
Aussage selbst.

**Kein Halluzinieren, und das ist messbar, nicht versprochen.** Weg B darf erst
scharf gehen, wenn der Korpus je Fall erklärt, dass seine Fachsatzliste
vollständig ist (Muster: `declaredEmpty` bei Befunden und Objekten). Ohne das
zählt 17.5 nur Treffer und blendet Erfindungen aus — dann misst man ein Modell an
dem, was es richtig macht, und nie an dem, was es dazudichtet.

| Nr. | Schritt | Größe |
|---|---|---|
| 17.7 | **Weg A — die Engine erzeugt den Fachsatz.** Deterministisch aus Skelett und Evidenz, ohne Modellaufruf, ohne Netz. Herkunft `reconstructed`, Anker auf die ABAP-Anweisung, Darstellung am BPMN-Element. Öffnet Regel 6 aus `lib/abap/process-skeleton.ts` (dort nie eine erfundene Phrase) für **eine klar abgetrennte Schicht** — die Knotenbeschriftung selbst bleibt wörtliches Token. **Gebaut 23.09.2026 (`3535f14`): 69 von 173, Abdeckung 167/173, 14 von 68 Fällen grün.** **Abnahme angepasst (Sonny, 23.09.2026): ≥ 90 von 173.** Die ursprüngliche Zahl 120 war gesetzt, bevor es einen Erzeuger gab. Gemessen ist seitdem die **Decke für Weg A: 116** — ein Satzbaukasten, der aus jedem Sollsatz genau die aus dem Anker ableitbaren Wörter nimmt, kommt nicht weiter (`tests/business-statement.spec.ts`, letzter Test; nachgerechnet, im Kommentar stand zuvor fälschlich 107). Die fehlenden Sollsätze sind überwiegend Beurteilungsprosa des Fallbuchs — „nicht belegt", „im Slice unbekannt", Verweise auf andere Fälle —, also Wortwahl und nicht Inhalt; aber diese Wortwahl ist Bewertung und leitet sich nicht ab. 69 auf 90 ist Feinarbeit an einem nachweislich funktionierenden Erzeuger, 90 auf 116 wäre Jagd auf Einzelfälle mit fallendem Ertrag — den Rest trägt 17.8. **Fertig, wenn** `baseline.json` für `fachsaetze` **≥ 90 von 173** nennt und die Gegenprobe aus 17.5 (Satz des Nachbarn am eigenen Anker) weiter rot ist. | M |
| 17.8 | **Weg B — das Modell erzeugt den Fachsatz**, mit einem Prompt, der verankerte Einzelsätze bestellt statt einer Executive Summary (heute: 0 von 173). Herkunft `proposed`, außerhalb der Signatur wie jedes Narrativ. **Voraussetzung:** die Vollständigkeitserklärung im Korpus (oben), sonst ist Erfindung straffrei. **Fertig, wenn** B die von A gemessene Zahl schlägt — sonst bleibt A allein, und das ist ein zulässiges Ergebnis. | M |
| 17.9 | **Gebaut 23.09.2026.** **Verbotene Aussagen werden verglichen — die Halluzinationsmessung für 17.8** (Sonny, 23.09.2026). Der Korpus führt in **47 von 68 Fällen** ein Feld `forbiddenConclusions` mit **197 ausdrücklich verbotenen Aussagen**, 158 davon mit Ankerpräfix `source.abap:NN` — von Hand geschrieben, seit Monaten im Repository, und `tests/helpers/korpus-comparison.ts` nennt das Feld **null Mal**. Dasselbe Muster wie bei `fachsaetze` vor 17.5: ein Sollwert liegt da, nichts vergleicht ihn. Das ist die richtige Messung gegen Erfindung, und sie ersetzt die ursprünglich vorgesehene Vollständigkeitserklärung: ein „zusätzlicher" Satz der Engine ist **keine** Halluzination, sondern mehr Abdeckung als das Fallbuch geschrieben hat — eine Regel „Extras sind Fehler" hätte 17.7 dafür bestraft, gründlicher zu sein. Eine Halluzination ist eine Aussage, die der Code an ihrem Anker nicht trägt, und genau die benennen die 197 Sätze. **Die Maschine steht und wird nur umgedreht:** dasselbe Textmaß aus 17.5, dieselbe Schwelle, dieselben Anker — erreicht ein erzeugter Satz die Schwelle gegen eine *verbotene* Aussage, ist das ein Fehler statt eines Treffers. **Zwei Dinge sind Handwerk, nicht Grundsatz:** die 39 Aussagen ohne Ankerpräfix („gesamte Scheibe") gelten für den ganzen Fall statt für eine Zeile, und eine Verneinung („Kein Befund X melden") ist sprachlich nicht die Aussage X — das Maß braucht den Kern der verbotenen Aussage, nicht ihre Verpackung. **Fertig, wenn** `baseline.json` je Fall eine eigene Teilprüfung `verbotene-aussagen` mit Zähler und Nenner führt, ein Erzeuger, der absichtlich eine verbotene Aussage sagt, die Facette rot macht, und der heutige Engine-Erzeuger aus 17.7 seine Zahl nennt. **Gemessen:** 166 der 197 Sätze haben einen ableitbaren Kern, 31 nicht (durchweg Einstufungsurteile wie „Kein D“, aus denen sich kein Fachsatz bilden lässt); der Engine-Erzeuger aus 17.7 verletzt **4 von 166**. **Vor 17.8.** | M |

**Ergebnis 17.9 (gemessen, 23.09.2026).** Die Teilprüfung `verbotene-aussagen`
steht je Fall in `tests/korpus/baseline.json`: **162 eingehaltene von 166
vergleichbaren** verbotenen Aussagen, in 46 der 68 Fälle überhaupt gemessen. Die
vier anderen Facetten sind bitgleich geblieben, `fachsatzinhalt` steht
unverändert bei 69 von 173.

Zwei Handwerksfragen, beide im Code begründet
(`tests/helpers/korpus-comparison.ts`): **ankerlose Sätze** — von den 39 ohne
Präfix `source.abap:NN` nennen 21 ihren Anker hinter einer Profilangabe, 18
gelten wirklich für die gesamte Scheibe und werden deshalb gegen *jeden*
erzeugten Satz des Falls gemessen statt übergangen. **Die Verneinung** — der
Kern kommt aus dem ersten Teilsatz (die Begründung dahinter ist eine *wahre*
Aussage und darf nie zum Verbot werden), und wo das Fallbuch die verbotene
Aussage in Anführungszeichen gesetzt hat, ist das Zitat abschließend; reicht es
nicht für zwei Inhaltswörter, gilt der Satz als **nicht vergleichbar** statt als
bestanden. Kalibriert ist das daran, dass die 173 Sollsätze des Fallbuchs die
verbotenen Aussagen ihres eigenen Falls **null Mal** verletzen
(`tests/korpus-mutation.spec.ts`, V2).

**Die vier Verletzungen des Engine-Erzeugers — ein Befund, keine Schwellenfrage.**
CC-067: „Es werden Kunden selektiert“ an Zeile 6, die der Fall als im Slice
unerreichbar führt („Kein Fachsatz ‚Kunden werden gefunden'“) — das ist die
Erfindung, die diese Messung finden soll. CC-043, CC-049 und CC-061 sind
Wortüberschneidung ohne geteilte Behauptung: „Die Berechtigung auf F_KNA1_GEN
wird geprüft“ (wahr) gegen das Verbot „nur mit F_KNA1_GEN-Berechtigung wird
ausgegeben“, 0,67 — das Dice-Maß sieht „geprüft“ und „ausgegeben“ als
gleichwertige Einzelwörter. Die Schranke steht bei 4 und ist eine Ratsche gegen
Verschlechterung, kein Freibrief.

**Reihenfolge:** 17.5 vor 17.6, und beide vor jeder weiteren Modellentscheidung —
sonst optimiert man eine Größe, die niemand misst. 17.5 ist unabhängig von der
Modellfrage nützlich und billig: der Sollwert liegt seit Monaten im Repository.
