# Schnitt 0 — Umfang von v2.10 „Belegt"

**Stand 12.09.2026 · Anhang zu [`../ROADMAP.md`](../ROADMAP.md) §5 · abgestimmt am 12.09.2026**

> **Seit 15.09.2026 die Arbeitspakete von Phase 0 der Roadmap (Fassung 2.8)**, mit
> vier Änderungen: **§2** nimmt zusätzlich die ungeprüften Signavio-Aussagen zurück
> („validated for SAP Signavio", „Signavio-importable") · **§8 Paket 3** schrumpft
> auf das Konzept „Einsicht per E-Mail-gebundener Einladung" (Rechtestufen,
> Rohcode-Schalter, virtuelle Rollen entfallen) · **§8 Paket 4** (Datensparsamkeit)
> ist gestrichen, das Konto bleibt unverändert · **§10** erfasst je Korpusfall auch
> das erwartete Prozessskelett. Die Verweise auf „Schnitt A" und Gates unten sind
> durch die Phasen der Roadmap ersetzt.

`docs/BACKLOG.md` (11.09.): *„Release 2.10 wird vor Beginn im Umfang abgestimmt —
nicht von selbst anfangen."* Diese Abstimmung ist erfolgt. Jede Zeile „Was es
schon gibt" ist am 12.09. gegen den Code geprüft; jede Zeile „Arbeitspakete"
nennt die Datei, die angefasst wird.

## Entschieden am 12.09.2026

| Frage | Entscheidung | Folge |
|---|---|---|
| **Umfang** | **Kern + Fundament** — sieben Teilschnitte, Referenzkorpus parallel gestartet | `UX-E06-F01:R0` (Erhaltungsregister) und `UX-E15-F01:R0` (Zero-LLM) rutschen auf v2.11 |
| **`G0:R0`** | **Sperre dokumentieren** (Weg 2) statt Runner isolieren | Der Live-Modus bleibt zu; die Isolation wird ein eigener Auftrag nach 2.10 |
| **Datensparsamkeit** | **Vertagt auf Schnitt A** — in 2.10 ändert sich am Profil nichts | Die Migration wächst bis dahin weiter; die Mitgliederliste in A darf erst behaupten „nur Handles", wenn sie stimmt |
| **Öffentliche Texte** | **Audit-Korrekturen + Score/TCO**, Positionierung bleibt vorerst | Die Spielwiesen-Sprache auf Startseite und README ist ein eigener, späterer Auftrag |

**Der Umfang von v2.10:** `G0:R0` · `UX-E14-F01:R0` · `UX-E14-F02:R0` ·
`UX-E13-F01:R0` · `UX-E02-F01:R0` · `UX-E07-F03:R0` · `UX-E11-F03:R0` — und
`UX-E12-F02:R0` (Korpus) läuft daneben, weil er an einem externen Prüfer hängt.

**Eine Abhängigkeit, die die Entscheidung erzeugt hat:** Der Vorschlag wollte die
dokumentierte Sperre aus `G0:R0` im Erhaltungsregister ablegen — das ist jetzt
nicht im Umfang. Sie geht deshalb nach `SECURITY.md` und in diese Datei; das
Register erbt sie in v2.11.

**Reihenfolge in drei Wellen**

```
Welle 1   G0:R0 ....................... Sperre dokumentieren (ein Tag)
Welle 2   UX-E14-F01:R0 ─► UX-E14-F02:R0      öffentliche Aussagen (parallel zu 3)
          UX-E13-F01:R0                        Geldwerte
Welle 3   UX-E02-F01:R0 ─► UX-E07-F03:R0       Inputbindung
                        └► UX-E11-F03:R0       Freigabe nur über Server
daneben   UX-E12-F02:R0 ................ Referenzkorpus, extern geprüft
verschoben nach v2.11:  UX-E06-F01:R0 (Register) · UX-E15-F01:R0 (Zero-LLM)
```

---

## 1. `G0:R0` — Blocker kennen und beheben **oder** begründet sperren · M

**Auftrag.** Kein bekannter fachlicher oder sicherheitsrelevanter Blocker des
angebotenen Pfads bleibt unbehandelt.

**Was es schon gibt.** `E08-F01-US01` / CR-15 ist der letzte offene 2.9-Punkt:
fremder generierter Testcode läuft als Kindprozess im API-Kontext. Seit v2.9.1
wird der Egress **gemessen** statt behauptet, und die Attestierung hält den
Live-Modus zu. Der Deploy-Gate prüft inzwischen `--audit-level=high` (eine
Schwelle statt zweier, die strengere), Security CI high+ mit Allowlist,
Apache-2.0 liegt im Root — CR-30 ist damit erledigt.

**Entschieden: Weg 2 — begründet sperren.** Die heutige Sperre wird als bewusste
Gate-Entscheidung dokumentiert — Grenze, Grund, Bedingung für die Wiedereröffnung
— und der Live-Modus bleibt zu. `G0:R0` ist damit erfüllt, ohne GCP-Arbeit; die
Isolation (eigener kurzlebiger Runner, minimales Dienstkonto, nachgewiesene
Egress-Regeln) wird ein **eigener Auftrag nach 2.10**, der die Fähigkeit
zurückgibt. Was nicht zulässig gewesen wäre: den Zustand unbenannt lassen.

**Arbeitspakete.**
1. `SECURITY.md`: die Grenze mit Grund und Wiedereröffnungsbedingung; die
   Attestierung aus v2.9.1 als das benennen, was sie ist — eine Messung, die eine
   Funktion zuhält, kein Ersatz für Isolation.
2. Diese Datei und `docs/ROADMAP.md` führen den offenen Auftrag weiter, damit er
   nicht mit dem Release verschwindet.
3. Kein View, kein Text und kein Export stellt den gesperrten Pfad als verfügbar dar.

**Abnahme.** Die Grenze steht in `SECURITY.md`; das Erhaltungsregister erbt sie in
v2.11 (`UX-E06-F01:R0` ist nicht im Umfang von 2.10).

---

## 2. `UX-E14-F01:R0` — Facts-Service und Copy-CI · M

**Auftrag.** Eine Quelle für jede öffentliche Zahl; ein Build, der bei Abweichung
bricht; die offenen Copy-Befunde des Audits vom 01.09. geschlossen.

**Was es schon gibt.** Mehr als der Backlog annimmt:
- `getCatalogStats()` liefert bereits `classifiedObjects`, `mappedWithSuccessor`,
  `syncDate`, und `app/page.tsx` rendert die Objektzahl daraus.
- Beide Katalogartefakte tragen ihren Quell-Hash: `lib/abap/generated/cloudification-repo.latest.json`
  und `…classifications-sap.json` mit `meta.sourceSha256`, gesetzt von
  `scripts/sync-cloudification-repo.ts`.
- `lib/version.ts` hält Engine-Version und Releasedatum, `app/llms.txt` steht.
- **Zwei Guards sind der Anfang der Copy-CI:** `tests/landing-consistency-guard.spec.ts`
  (Zahlen und Labels der Startseite) und `tests/level-rule-page-guard.spec.ts`
  (die veröffentlichte Regel gegen `gradeFromSapStates`).

**Arbeitspakete.**
1. `lib/facts.ts` als einzige Quelle: Objektzahl, Nachfolgerzahl, Level-Verteilung,
   **Hash und Sync-Datum beider** Repository-Dateien, Engine-Version, Regelversion
   (kommt aus §3), Referenz-Run-Zahlen (`lib/reference-analysis.ts`).
2. Alle öffentlichen Seiten rendern daraus. Die vier hartcodierten
   `23,000+`-Rückfalltexte entfallen: `app/page.tsx`,
   `app/(app)/how-it-works/page.tsx`, `app/(app)/abap-custom-code-analysis/page.tsx`,
   `app/(app)/sap-cloudification/page.tsx`.
3. `/facts` als Seite **und** JSON; Verweis in `app/llms.txt`.
4. Copy-CI durch Verallgemeinern der zwei vorhandenen Guards: Zahl ohne
   Facts-Bindung, Marker-Phrasen („previously", „used to claim", „TODO"),
   OG/Canonical je Seite, tote Links, Stufen-/Rollentexte außerhalb der Komponenten.
5. Die Audit-Korrekturen der Liste in `docs/archiv/roadmap-2.7/clean-core-backlog-v2_7.md` (H-01 BSEG,
   H-02 CDS-View statt RAP-Output, H-05/H-06 Vergleichstabelle, GLB-01/03/05/06/11,
   CAT-01/02, DS-01, IMP-01 TMG→DDG).
6. Nachfolger tragen Typ und Provenienz (SAP-Release-Daten, kuratiert, API Hub) —
   CR-08.

**Abnahme.** V25-A09 (harte Zahl bricht den Build mit Fundstelle), V25-A10 (fünf
Seiten nennen identische Werte, OG je Seite korrekt, keine QA-Notizen im Text).

**Nicht dazu** (Entscheidung vom 12.09.): die **Positionierung**. Startseite und
README behalten vorerst ihre heutige Sprache; korrigiert wird nur, was
nachweislich falsch oder unbelegt ist. Der Umbau auf „freie Community-Spielwiese,
virtuelle Rollen, echte Evidenz" ist ein eigener Auftrag — sinnvollerweise dann,
wenn Rollen und Spielfälle tatsächlich existieren (Schnitt A/B). Ebenfalls nicht
dazu: deutsche Kernseiten und Vergleichsseiten (`UX-E14-F05:3.1`).

---

## 3. `UX-E14-F02:R0` — Level-Regelseite mit Regelversion, Score umbenannt · M

**Auftrag.** Die A–D-Ableitung ist öffentlich, versioniert und am Korpus prüfbar;
der Score verspricht kein Geld mehr.

**Was es schon gibt.** `/method/levels` mit beiden SAP-Sichten (v2.9.0), gegen die
echte Funktion getestet (`tests/level-rule-page-guard.spec.ts`).

**Arbeitspakete.**
1. **Regelversion einführen.** `levels/1.0` steht heute nur in den
   Roadmap-Dokumenten, **nicht im Code**: Konstante anlegen, an Run, Finding und
   Katalogausgabe stempeln, auf der Regelseite und in `facts.json` nennen. Alte
   Runs bleiben ihrer Regelversion zugeordnet.
2. Vorrangregel als Clean-Core.io-**Lesart** mit Begründung (die
   Überlappungsobjekte mit released Nachfolger), Beispiele VBAK, KONV,
   CL_HTTP_CLIENT, Hinweis auf ATC als Autorität — CR-01, CR-02.
3. Score: `app/(app)/clean-core-score/page.tsx` — Titel und Description („SAP Clean
   Core Score & TCO Analysis"), die FAQ „How are the Clean Core Score and TCO
   connected?", der Satz „predict your TCO savings" und der Abschnitt „TCO
   Optimization Potential" gehen; der Begriff „SAP Clean Core Score" wird nicht
   mehr verwendet; Formel und Beispielrechnung am Referenz-Run kommen dazu.

**Abnahme.** V25-A02 (Objekt mit `classicAPI` **und** `notToBeReleased` zeigt beide
Sichten, angewandte Regel, Regelversion, Korpusfall), QA24-A05.

**Nicht dazu.** `/method/economics` — das ist `UX-E14-F02:R2` und braucht den
Rechenkern aus R2.

---

## 4. `UX-E13-F01:R0` — Keine Geldwerte ohne Annahmenrevision · S

**Auftrag.** Kein Modul zeigt einen Betrag, den keine freigegebene Annahme trägt.

**Was es schon gibt.** v2.9.8: keine Einsparprognose ohne eigene Kostenwerte, das
Modell ist als Demonstration gekennzeichnet; v2.9.4: keine unendlichen Werte.

**Arbeitspakete.**
1. `estimatedMaintenanceCostRange` und `cloudRoiSummary` aus dem Analyze-Prompt
   entfernen (`app/(app)/project/[projectId]/analyze/page.tsx`, Promptfelder) und
   aus dem Typ (`lib/types.ts`); die drei Anzeigestellen auf „nicht ermittelt".
2. Keine Score-zu-Euro-Ableitung — CR-23-Rest; die Koeffizienten bleiben bis
   `UX-E13-F02:R2` unbelegt und dürfen deshalb nichts behaupten.
3. Guard: kein Geldwert ohne Annahmenrevision, in der Art der vorhandenen
   Honesty-Guards.

**Abnahme.** V25-A06 (Analyze, Brief und Export ohne Annahmenrevision zeigen
keinen Geldwert; der Prompt enthält keine monetären Felder), QA24-A08.

---

## 5. `UX-E15-F01:R0` — Zero-LLM als Sperrpfad · S · **verschoben auf v2.11**

> Am 12.09. aus dem 2.10-Umfang genommen. Der Plan bleibt hier stehen, weil er
> unverändert gilt — nur eben eine Stufe später. Folge für die Außenaussage: der
> Zero-LLM-Modus darf bis dahin nirgends als vorhanden beschrieben werden.

**Auftrag.** Jeder Run läuft ohne API-Key bis zum signierten Evidenzstand.

**Was es schon gibt.** Die deterministische Engine (`lib/abap/*`) läuft vor dem
Modell, und es gibt **genau einen** Ausgang: `app/api/gemini/route.ts` über
`lib/gemini.ts`. Ein Sperrpfad hat damit einen einzigen Kontrollpunkt.

**Arbeitspakete.**
1. Laufmodus ohne Modellaufruf: Findings, beide Level-Sichten, Nachfolger, Score,
   Manifest, signiertes Pack.
2. LLM-Stufen einzeln zuschaltbar; jede zugeschaltete Stufe im Manifest mit
   Modell- und Promptversion (CR-27, CR-19).
3. Narrativ, Spec und Entwurf erscheinen als **„nicht erzeugt"**, nicht als leer;
   kein stiller Rückgriff auf den Community-Key.
4. Guard über den Datenfluss: im Zero-LLM-Modus verlässt nichts das System.

**Abnahme.** V25-A12.

---

## 6. `UX-E02-F01:R0` — Kanonischer Referenz- und Manifestvertrag · M

**Auftrag.** Ableitungen sagen, woraus sie entstanden sind — mit Revision und
Hash, nicht mit einer Heuristik.

**Was es schon gibt.** Unveränderliche Runs, `lib/artefact-digest.ts`, und seit
v2.9.6 macht eine Quellenänderung alles Alte `stale` (CR-10, 2.9-Teil).

**Arbeitspakete.**
1. `inputs[]` je abgeleitetem Artefakt: ID, Revision, Hash (QA24-13) — ersetzt den
   Digest-Vergleich als Wahrheitsquelle.
2. CaseManifest als gemeinsamer Arbeitsstand mit expliziter Inputbindung
   (Datenmodell und Server, **ohne** Fall-UI — die kommt in R1).
3. Die vier Datenklassen typisiert: Quellartefakte, Transaktions-/Testdaten,
   Ableitungen/Zusammenarbeit, Geheimnisse/Identität (QA24-14).
4. Migration: IDs, Hashes und Signaturzustände bleiben erhalten (C23-A02).

**Abnahme.** QA24-A03 (Teilschnittgraph maschinell sortierbar), QA24-A13/A14.

---

## 7. `UX-E07-F03:R0` — Exakte Inputbindung, konservative Ungültigkeit · S

**Auftrag.** Ein altes Ergebnis bleibt an seine Eingaben gebunden — blockieren
oder quarantänisieren statt still aktualisieren.

**Arbeitspakete.** Manifestvergleich statt Frischeheuristik; Autorisierung bei
Auftrag, vor externer Datenabgabe und vor Veröffentlichung; Wiederprüfungsbedarf
als eigene Verpflichtung; **Auto-Healing im geteilten Kontext deaktiviert**, bis
3.0 Revisionen erzeugt.

**Abnahme.** W22-A06 (verspätetes Ergebnis überschreibt den aktuellen Stand
nicht), QA24-A13.

---

## 8. `UX-E11-F03:R0` — Freigabe nur über servervalidierte Commands · M

**Auftrag.** Eine Freigabe entsteht auf dem Server oder gar nicht.

**Was es schon gibt.** CR-28 ist im 2.9-Teil erfüllt — widerrufbar, als
Selbsterklärung bezeichnet, seit v2.9.6 an die Quelle gebunden. Der strukturelle
Teil steht offen: `firestore.rules` führt `targetArchitecture`,
`approvedByArchitect`, `architectJustifiedOverride`, `architectSignOffAt` und
`approvedBy` in der client-schreibbaren Allowlist.

**Arbeitspakete.**
1. Die fünf Felder aus der Allowlist; Schreiben ausschließlich über eine geprüfte
   API-Route; jede Änderung ins Journal.
2. **Regel-Deploy einplanen** — `firestore.rules` wird nicht von CI ausgerollt.
   Erst die Regeln, dann die App.
3. Konzeptteil für R1: Rechte Lesen/Kommentieren/Bearbeiten, Rohcode-Schalter,
   virtuelle Rollen, negative Referenzfälle — als Dokument **und** als Tests, die
   `UX-E11-F03:R1` erbt.
4. ~~Datensparsamkeit beginnen~~ — **am 12.09. auf Schnitt A vertagt.** In 2.10
   ändert sich am Profil nichts: `firstName`/`lastName`, `tier 'enterprise'`,
   `orgId`, `maxTeamMembers` und die Okta-/Azure-AD-Felder bleiben vorerst
   (14 Dateien, rund 62 Fundstellen, davon drei Mail-Skripte mit Vornamensanrede).
   Bedingung, die dadurch entsteht: **keine Oberfläche und kein Text darf vor der
   Migration behaupten, es würden nur Handles gespeichert** — der Satz gehört zur
   Mitgliederliste in Schnitt A, nicht davor.

**Abnahme.** QA24-A12 (Client, Server, Index und Export haben dieselben Grenzen),
C23-A08/A09.

---

## 9. `UX-E06-F01:R0` — Erhaltungsregister und fixierter Baseline-Scope · M · **verschoben auf v2.11**

> Am 12.09. aus dem 2.10-Umfang genommen. Es erbt dort die dokumentierte Sperre
> aus §1 und bleibt Voraussetzung für `UX-E06-F01:R1` in Schnitt A.

**Auftrag.** Was heute funktioniert, wird benannt, bevor etwas daran umgebaut wird.

**Was es schon gibt.** `lib/workflow-steps.ts` ist der Phasenvertrag, den das
Register braucht (v2.9.5) — Stepper, Rail, Dashboard und Delivery lesen ihn
bereits.

**Arbeitspakete.** Register der sieben Fähigkeiten mit Eingaben, Ausgaben,
Rechten, Voraussetzungen, Fehlern, Abnahme und **Referenzfall** je Fähigkeit;
heutiger Umfang, Grenzen und neuer Zugriffspfad; Commit, Build, Rules und
Deploymentbezug für die Abnahme fixiert (QA24-04). Gesperrte Pfade aus `G0:R0`
stehen hier mit Grund.

**Abnahme.** QA24-A04, W22-A04.

---

## 10. `UX-E12-F02:R0` — Referenzkorpus v1 · M

**Auftrag.** 25 synthetische Legacy-Programme mit Ground Truth, an denen Regeln
entschieden und Werkzeuge gemessen werden.

**Was es schon gibt.** Sieben Starterbeispiele (`lib/starter-examples.ts`,
`public/starter-examples/`) und der öffentliche Referenz-Run.

**Arbeitspakete.** 18 weitere Fälle über alle 11 Konstruktklassen; je Fall Ground
Truth (Findings je Zeile, Nachfolger mit Typ, Level in beiden Sichten, Hand-Work,
Business-Sätze mit Ankern); Regelversion und SAP-Primärquelle je Regel;
**Freigabe durch einen externen SAP-Architekten**.

**Abnahme.** QA24-A05; Voraussetzung für Spielfälle (`UX-E01-F04:R2`) und Bench
(`UX-E14-F04:R2`).

**Der einzige Schnitt-0-Punkt, der überwiegend nicht Code ist.** Er braucht Inhalt
und einen Prüfer; er blockiert später drei Schnitte. Wenn etwas früh anfangen
muss, dann dieser.

---

## 11. Was Schnitt 0 ausdrücklich nicht enthält

Fallzuschnitt-UI, Teilen, Threads, „Playing as", Anforderungen mit Anker,
Coverage-Stufen, Optionen, Importe, Spielfälle, MCP. Alles davon hat ein Gate und
hängt an Schnitt 0 — nichts davon wird „nebenbei" mitgenommen. Ein neues Feature
in v2.10 verschiebt den Nachweis, den v2.10 erbringen soll.

---

## 12. Die gewählte Stufe

Der Nachweis von v2.10 lautet: *nichts behauptet mehr, als die Daten hergeben.*
Vier Punkte tragen diesen Satz, drei tragen Schnitt A, der Rest folgt später.

| Kürzungsstufe | Enthalten | Status |
|---|---|---|
| **Kern** | `G0:R0` (Weg 2), `UX-E14-F01:R0`, `UX-E14-F02:R0`, `UX-E13-F01:R0` | enthalten |
| **Kern + Fundament** | zusätzlich `UX-E02-F01:R0`, `UX-E07-F03:R0`, `UX-E11-F03:R0` | **gewählt am 12.09.** |
| **Voll** | zusätzlich `UX-E06-F01:R0`, `UX-E15-F01:R0` | auf v2.11 verschoben |

`UX-E12-F02:R0` (Korpus) läuft **parallel**, weil er an einem externen Prüfer
hängt und nicht an Entwicklungszeit.

---

## 13. Risiken

- **Der Regel-Deploy ist ein eigener Schritt.** Zwei Teilschnitte (§8, §6) ändern
  Client-Felder. Wird die App vor den Regeln deployt, ist entweder die Freigabe
  offen oder die App kaputt.
- **Die vertagte Datensparsamkeit erzeugt eine Bedingung, keine Ruhe.** Solange
  das Profil Namen führt, darf keine Oberfläche und kein Text behaupten, es würden
  nur Handles gespeichert. Die Migration selbst (Handle, 62 Fundstellen, drei
  Mail-Skripte, Admin-Konsole, GDPR-Pfade) gehört jetzt zu Schnitt A und macht ihn
  größer als im Bau- und Prüfplan veranschlagt.
- **Zwei verschobene Teilschnitte sind zwei Aussagen, die 2.10 nicht machen darf:**
  kein Erhaltungsregister heißt, der Baseline-Scope ist noch nicht fixiert; kein
  Zero-LLM-Sperrpfad heißt, der Modus existiert nicht und wird nirgends genannt.
- **Der Score ist SEO-Oberfläche.** `/clean-core-score` trägt Rankings; Umbenennen
  ohne Redirect und ohne Anpassung von Sitemap, JSON-LD und internen Links kostet
  Sichtbarkeit. Der Titelwechsel gehört mit der SEO-Seite zusammen geplant.
- **Der Korpus kann nicht allein entstehen.** Ohne externen Review ist er kein
  Schiedsrichter für strittige Regeln, sondern nur eine weitere Meinung.
