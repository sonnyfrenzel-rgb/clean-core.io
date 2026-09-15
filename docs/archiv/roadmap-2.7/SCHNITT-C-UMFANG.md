# Schnitt C — Entscheidung, Umsetzung, Übergabe (v3.0)

**Umfangsvorschlag · Stand 12.09.2026 · Anhang zu [`ROADMAP-2.7.md`](ROADMAP-2.7.md) §8**
**Plan, keine Umsetzung** — C setzt auf A (Fall, Rechte, Rollen) und B (Belege, Kosten) auf.

> **Abgelöst am 15.09.2026 durch [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Architekturvertrag, Entscheidung, Receipt und Übergabe leben in **Phase 8**
> weiter, in M-Schritte zerlegt. Entfallen: Rollen-Mandate, signierte Commands mit
> virtueller Rolle und `self_play` — bestätigt wird vom Konto. Bench, fairer
> Vergleich und Teamabnahme liegen **nach 3.0**, weil sie Termine mit Dritten
> brauchen. „3.0" heißt jetzt: der UX-Umbau entlang der Mockups 2.7.

Was 3.0 beweist: *Eine begrenzte Entscheidung kann sicher verstanden, genehmigt,
umgesetzt und mit passenden Nachweisen übergeben werden* — und jede Station nennt
ihre Revision. 19 Teilschnitte, sieben davon L, einer XL.

**Die Kernkette.** `UX-E05-F03:3.0` → `UX-E07-F01:3.0` → `UX-E08-F02:3.0` →
`UX-E08-F03:3.0` → `UX-E09-F01:3.0`. Alles andere hängt links und rechts daran.

---

## 0. Substrat im Code — die Vertrauenskette ist weiter, als die Dokumente annehmen

| Gegenstand | Heute im Code | Reife |
|---|---|---|
| Run-Signatur | `lib/run-signature.ts` mit `UNSIGNED_FIELDS = ['runHash', 'signature', 'analysis']` — **das Narrativ ist bewusst außerhalb des Hashes** | trägt |
| Paketmanifest | `AuditPackManifest`: `version`, `runId`, `projectId`, `generatedAt`, `engineVersion`, `sapApiCatalogVersion`, `files[]` (Pfad, sha256, Bytes), `manifestHash`, `signed`, `signature`, `runHash` | trägt |
| Asymmetrische Signatur | `signatureEd25519` in `app/api/audit-pack/create/route.ts:296`, Prüfung in `app/api/export/verify/route.ts`, Schlüssel unter `/.well-known/clean-core-io-signing.json` | trägt |
| Offline-Prüfung | `scripts/verify-pack.mjs` (rechnet jede Zahl aus dem ZIP nach, Exit 0/1/2), öffentliche Seite `app/(app)/verify-pack` | trägt |
| Übergabesperre | `handoverBlockers()` und `generationBlockers()` in `lib/workflow-steps.ts` — Downloads gesperrt, `/api/audit-pack/create` prüft serverseitig mit (v2.9.6) | trägt, Grundlage falsch |
| Abschlussbericht | `lib/board-deck.ts`, Delivery-Seite, `SUPPORT_MATRIX` | trägt |

**Was daraus folgt:** `covers[]` aus `UX-E14-F03:3.0` ist kein neues Verfahren,
sondern die **Veröffentlichung einer Liste, die es schon gibt** — `UNSIGNED_FIELDS`
sagt heute intern, was nicht signiert ist. Und die Übergabesperre existiert, sie
hängt nur an Frische (`staleness`) statt an einer gebundenen Vertrags- und
Receiptrevision. C tauscht die Grundlage, nicht den Mechanismus.

---

## 1. C1 — Die Entscheidung wird verbindlich

`UX-E05-F03:3.0` (L) · `UX-E11-F03:3.0` · `UX-E13-F03:3.0`

**Arbeitspakete.**
1. Entscheidung bindet Bedarf, Scope, Zielkontext, Option **und** Economics-Szenario
   in genannten Revisionen; Alternativen, Begründung und offene Bedingungen stehen
   im Snapshot.
2. Freigabe als **signierter Command** mit Mitgliedsidentität, gespielter virtueller
   Rolle und pseudonymer Signer-ID; `self_play: true`, wenn dasselbe Mitglied
   mehrere Rollen spielt. Jede Signatur trägt *Rollenspiel — kein organisatorisches
   Mandat.*
3. Die vier Mandate bleiben getrennt: fachliche Zustimmung, Architekturtragfähigkeit,
   Kostenprüfung, Gesamtentscheidung. Ein nicht beantworteter Request ist keine
   Zustimmung.
4. Mutation und Auditereignis werden gemeinsam dauerhaft erfasst; ein wiederholter
   Request erzeugt keine zweite Entscheidung (Idempotenz).
5. Kostenrevision einfrieren: die Entscheidung referenziert eine geprüfte
   Kostenrevision; spätere Änderungen schreiben den Business Case nicht um.

**Abnahme.** C23-A21/A26/A27/A28/A29, QA24-A12, V25-A03.

---

## 2. C2 — ArchitectureContract als **einziger** Generatoreingang

`UX-E07-F01:3.0` (L) · `UX-E07-F02:3.0`

**Der Befund, unverändert seit dem Review:** `transformation/page.tsx` liest
`projData?.extensibilityRoute || 'Side-by-Side (SAP BTP)'` — die genehmigte
Architekturwahl ist nicht der Eingang des Generators, und fehlt die Route, fällt
er auf BTP zurück (CR-09). Bis C2 gilt deshalb die **Übergangsregel**: ein
Override wird im UI als „dokumentiert, noch nicht wirksam für die Generierung"
gekennzeichnet (V25-A07) — das gehört schon in Schnitt 0/A sichtbar gemacht.

**Arbeitspakete.**
1. Typisierter `ArchitectureContract`: Zielkontext, Laufzeit, Persistenz,
   Schnittstellen, fachliche Verpflichtungen, **exakte Inputrevisionen**.
2. Der Generator konsumiert genau die gültige Vertragsrevision — kein Substring,
   kein Default, kein freies Textfeld.
3. Ein unterstützter Override ändert im Abnahmetest den **tatsächlichen** Zielpfad
   (QA24-07): Wechsel CAP → RAP erzeugt eine Vertragsrevision, und der Generator
   folgt ihr.
4. Kleine versionierte Zielprofile statt Mischung aus CAP/CDS, Express, TypeORM
   (CR-18); unzugeordnete Pflichtanforderungen blockieren die Freigabe.
5. Ungültiges Modelloutput wird quarantänisiert, nie als `transformed` promoted
   (CR-19).
6. Prozessdelta: was bleibt, anders erfüllt wird, bewusst entfällt, offen ist —
   und dieselbe Differenz in den technischen Schichten (`UX-E07-F02`).
7. Originalcode wird nie überschrieben; Experimente sind Entwurf/Sandbox.

**Abnahme.** QA24-A07, W22-A07, C23-A31, V25-A07.

---

## 3. C3 — Ausführungsreceipt und die Bindung der Freigabe

`UX-E08-F02:3.0` (L) · `UX-E07-F03:3.0` · `UX-E08-F03:3.0` · `UX-E04-F03:3.0`

**Arbeitspakete.**
1. Receipt mit Code-, Testsuite- und Umgebungsbindung: Version, Umgebung,
   Zeitpunkt, Ausführung, Ergebnis, Abhängigkeiten, **benannter
   Verifikationsmechanismus** (abaplint/open-abap-Transpiler, BYOT-Sandbox,
   importierter Beleg). „Compiled and tested" ohne Mechanismus bleibt unzulässig.
2. Reparaturhistorie: jeder Versuch erzeugt eine neue Entwurfsrevision mit Diff,
   Elternrevision, beiden Hashes und Reparaturgrund; das Ergebnis nennt den
   tatsächlich geprüften Prüfling (QA24-09).
3. Die Übergabesperre wechselt die Grundlage: von `staleness()` auf **gebundene
   Vertrags-, Prüflings- und Testrevision**. `handoverBlockers()` bleibt als Form
   erhalten und liest künftig das Manifest.
4. Abschlussarten getrennt: Standardkonfiguration, Eigenentwicklung, Stilllegung —
   jede mit eigenen, routenspezifischen Nachweisanforderungen. Explore-Abschluss
   setzt weder Implementierung noch Betriebsübernahme auf abgeschlossen.
5. Evidenz validieren, archivieren und kontrolliert übernehmen (`UX-E04-F03:3.0`);
   geplant, demonstriert und tatsächlich ausgeführt bleiben verschieden.

**Abnahme.** W22-A08/A09/A15/A16/A17, QA24-A09/A11, C23-A32.

---

## 4. C4 — Übergabe, Evidence Pack, offenes Format

`UX-E09-F01:3.0` (L) · `UX-E09-F02:3.0` (S) · `UX-E09-F03:3.0` (S) · `UX-E14-F03:3.0` · `UX-E16-F02:3.0`

**Arbeitspakete.**
1. Übergabepaket: Fallzweck, Scope, bestätigter Bedarf, Entscheidung, Bedingungen,
   Backlog-/Konfigurationsaufträge, Nachweisreferenzen. Dateiformate sind
   nachgelagerte Ausgabeoptionen, nicht der Kern.
2. **`covers[]` explizit machen:** das Manifest sagt, was die Signatur deckt —
   Findings, Nachfolger, Level, Nutzung, Routen, Entscheidungen, Receipts — und
   was nicht: das Narrativ. Die Liste existiert als `UNSIGNED_FIELDS`; sie muss
   nur aus dem Code in das Paket und auf die Trust-Seite.
3. Historische HMAC-only-Pakete behalten ihren Status und werden **nicht** neu
   signiert; kein Pfad stellt sie als Ed25519-Paket dar.
4. Signatur, Quelle, Mandat, aktuelle Abhängigkeiten und Prüfdeckung werden
   getrennt gezeigt — ein Fingerprint ist kein Assurance-Label (QA24-17).
5. Export mit stabilen IDs und manuell gepflegter externer Referenz; ein Export
   erzeugt keinen Statuswechsel im Fall.
6. Übernahmebestätigung als **eigenes Ereignis** zum Übergabemanifest: Erstellung,
   Versand, Empfang und fachlicher Abschluss sind vier Dinge.
7. Open Evidence Format v1: Schema, Validator, Beispiele, Exporter aus dem Pack,
   zwei Referenz-Importer. Verifier (`scripts/verify-pack.mjs`) und Export arbeiten
   auf **demselben** Format; das Schema ist versioniert.

**Abnahme.** C23-A29/A30, QA24-A14/A17, V25-A11, W22-A17.

---

## 5. C5 — Der XL-Schnitt: `UX-E06-F01:3.0`

Alle sieben Fähigkeiten im veröffentlichten Kernscope **ohne parallele
Wahrheiten**. Er hängt an C1 und C2 und steht deshalb zuletzt — wer ihn vorzieht,
baut die parallelen Wahrheiten neu, die er beseitigen soll.

**Wie man einen XL-Schnitt trotzdem in Scheiben schneidet:** pro Fähigkeit ein
Durchstich, jeder gegen den **Fall** statt gegen das Projekt, in dieser Reihenfolge:

```
Analyze → Documentation → Testing → Economics → Design → Transformation → Delivery
```

Analyze zuerst, weil dort die Evidenz entsteht; Delivery zuletzt, weil es alles
andere referenziert. Jeder Durchstich ist fertig, wenn die Fähigkeit ihre Ein- und
Ausgaben aus dem Fallmanifest zieht, ihre Grenzen im Erhaltungsregister stehen und
der alte Pfad **sichtbar** abgeschaltet ist — während der Migration zeigt die
Oberfläche, was integriert ist und was noch über den alten Weg läuft (QA24-01/03/04).

**Abbruchkriterium.** Wenn nach drei Durchstichen beide Pfade noch parallel
Wahrheit produzieren, ist der Schnitt falsch geschnitten — dann lieber eine
Fähigkeit vollständig und die übrigen ausdrücklich als „alter Pfad" markiert, als
sieben halbe.

---

## 6. C6 — Die Nachweise, die keine Features sind

`UX-E12-F01:3.0` (L) · `UX-E12-F02:3.0` (L) · `UX-E14-F04:3.0` (L) · `UX-E11-F01:3.0`

Diese vier liefern kein Produktverhalten, sondern Belege — und sie brauchen
**Menschen und Termine**, nicht Entwicklungszeit:

- **End-to-End-Teamabnahme** mit gemischten Rollen; Self-Play-Läufe und
  Mehrmitglieder-Läufe werden getrennt gemessen und getrennt berichtet.
- **Fairer Vergleich** am Korpus, mit benanntem Stand und dokumentierter Methodik;
  fehlender Zugang erscheint als „nicht getestet", nie als Unterlegenheit.
- **Bench veröffentlicht** (Daten CC-BY-4.0, Harness Apache-2.0) mit mindestens
  einem quelloffenen Fremdwerkzeug.
- **Accessibility-Abnahme** aller angebotenen kritischen Pfade — manuell geprüft,
  nicht aus einer Komponentenbibliothek abgeleitet.

Sie gehören früh in den Kalender, weil sie externe Beteiligte binden: ein
Fach-Review, Pilotteilnehmer, ein zweites Werkzeug mit legitimem Zugang.

---

## 7. Reihenfolge

```
C1 Entscheidung verbindlich ──► C2 ArchitectureContract ──► C3 Receipt + Bindung
                                                     └────► C5 XL-Durchstiche (zuletzt)
C3 ──► C4 Übergabe, covers[], Open Evidence Format
C6 läuft parallel, terminiert von außen
```

---

## 8. Prüfplan

**Erweitern statt neu bauen:**

| Guard | Was dazukommt |
|---|---|
| `asymmetric-signature-guard.spec.ts`, `signing-key-guard.spec.ts` | `covers[]`, historische HMAC-Pakete behalten ihren Status |
| `run-integrity-guard.spec.ts` | Entscheidung bindet Revisionen; Idempotenz eines wiederholten Requests |
| `source-change-guard.spec.ts` | Sperre liest Vertrags- und Receiptrevision statt Frische |
| `workflow-phases-guard.spec.ts` | routenspezifische Abschlussarten, „nicht anwendbar" ≠ „bestanden" |
| `session-delivery-guard.spec.ts` | Erstellung ≠ Versand ≠ Empfang ≠ Abschluss |
| `fabricated-verification-guard.spec.ts`, `unearned-verdicts-guard.spec.ts` | Mechanismus am Receipt, Reparaturhistorie |
| `extensibility-route-guard.spec.ts` | Generator folgt dem Vertrag, nicht `extensibilityRoute` |

**Neu:** `architecture-contract.spec.ts` (Wechsel CAP → RAP ändert den
tatsächlichen Zielpfad; kein Default auf BTP), `execution-receipt.spec.ts`
(Umgebung, Stubs, Mechanismus, Reparaturkette), `evidence-format.spec.ts` (Schema
validiert, Exporter und Verifier auf demselben Dokument), `handover-acceptance.spec.ts`
(vier getrennte Ereignisse; ein ZIP-Download erzeugt keine Übernahme).

**Der wertvollste Test:** ein Pack, dessen **Narrativ** verändert wurde,
verifiziert weiter — und die Oberfläche sagt genau das: die Signatur deckt das
Narrativ nicht. Heute stimmt das Verhalten (`UNSIGNED_FIELDS`), aber nichts sagt
es dem Leser. Das ist der Unterschied zwischen korrekt und belegt.

---

## 9. Risiken

- **Der XL-Schnitt ist das Terminrisiko der ganzen Roadmap.** Er darf erst
  beginnen, wenn C1 und C2 abgenommen sind, und er braucht das Abbruchkriterium
  aus §5.
- **C6 hängt an Dritten.** Fach-Review, Pilotteilnehmer und ein zweites Werkzeug
  mit legitimem Zugang sind Vorlaufzeit, keine Entwicklungsaufgabe.
- **Signaturumfang wird überinterpretiert.** Sobald `covers[]` öffentlich ist,
  liest jemand „signiert" als „fachlich richtig". Trust-Seite und Pack müssen den
  Unterschied selbst aussprechen (QA24-17, C23-A29).
- **Die Übergabesperre wird umgebaut, während sie schützt.** `handoverBlockers()`
  ist heute wirksam; der Wechsel auf Revisionsbindung braucht einen Zeitraum, in
  dem **beide** Bedingungen gelten, sonst öffnet sich die Sperre für die Dauer des
  Umbaus.
