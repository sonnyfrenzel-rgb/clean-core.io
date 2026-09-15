# Schnitt B — Gegenprobe, Ökonomie, Anschluss (v2.12)

**Umfangsvorschlag · Stand 12.09.2026 · Anhang zu [`ROADMAP-2.7.md`](ROADMAP-2.7.md) §7**
**Plan, keine Umsetzung** — B setzt auf Schnitt A auf (Fall, Rechte, Rollen).

> **Abgelöst am 15.09.2026 durch [`docs/ROADMAP.md`](../../ROADMAP.md) (Fassung 2.8).**
> Standardabdeckung, Gegenprobe, Optionen und Importe leben in **Phase 7** weiter,
> in Schritte der Größe S/M zerlegt. Der Prozess-, BPMN- und Regelraum ist in die
> **Phasen 2–4** vorgezogen. Entfallen: der Decision Request, `createdBy (virtuelle
> Rolle)` und die Abhängigkeit von Schnitt A.

Schnitt B ist der größte Gate (20 Teilschnitte) und der einzige, in dem die
**Produktaussage** entsteht: *Dieser Bedarf ist vom Standard gedeckt — hier ist
der Beleg, hier die Stufe, hier der Zielkontext, hier die Kosten.* Alles davor
beschreibt einen Fall; alles danach bindet ihn.

---

## 0. Was schon im Code liegt

Mehr als bei Schnitt A — B ist überwiegend Vertrag und Verdichtung, nicht Neubau.

| Strang | Substrat heute | Reife |
|---|---|---|
| Findings, Level, Nachfolger | `lib/abap/evidence-model.ts`, `catalog-service.ts`, `abcd-classification.ts`, `cloudification-repo.ts` | trägt |
| Analyse-Abdeckung | `lib/abap/coverage.ts` — benennt, was die Engine **nicht** beurteilt hat (v2.9.2) | trägt |
| Zeilenanker je Satz | `lib/abap/narrative-anchors.ts` mit `anchored / unevidenced / invalid-anchor` (v2.9.0) | trägt; die **Quote** fehlt |
| Nutzung | `usage-parser.ts`, `usage-model.ts` (deklariertes Fenster `{from,to,days}` **getrennt** von beobachteten Daten), `usage-join.ts`, `usage-privacy.ts` (v2.9.7) | trägt |
| Routing/Zielkontext | `extensibility-router.ts`, `support-matrix.ts` | trägt, muss aber entschärft werden |
| Ökonomie | `tco/page.tsx` (685 Zeilen): Koeffizienten 2,5 / 0,8 / 1,8 / 0,6 Tage je 1.000 Zeilen, 85-%-Testeffekt, Zielscore 95 — als Annahmen **gekennzeichnet** (v2.9.8), Grenzwerte gewacht (v2.9.4) | Modell ersetzen |
| Testlauf | `hooks/useTestExecution.ts` mit ehrlichen Zuständen (v2.9.9) | **Verdikte werden nicht gespeichert** |
| Referenzmaterial | 7 Starterbeispiele, `lib/reference-analysis.ts` (veröffentlichter Referenz-Run) | Basis für Korpus und Spielfälle |

---

## 1. Eine Begriffsklärung, bevor jemand das Falsche baut

„Coverage" bedeutet im Repo heute **Analyse-Abdeckung**: was die Engine nicht
beurteilt hat (`lib/abap/coverage.ts`, entstanden aus CR-06 — ein Programm ohne
Findings ist nicht sauber, sondern unbeurteilt).

„CoverageAssertion" in der Roadmap bedeutet etwas anderes: **Standardabdeckung** —
verbindet genau eine Anforderung, eine Option, eine Quelle und einen Zielkontext
und trägt eine Evidenzstufe E0–E4.

Beide bleiben, beide werden gebraucht, und sie dürfen nicht in einem Typ landen.
Vorschlag für den Neubau: `lib/coverage-assertion.ts` (fachlich) neben dem
bestehenden `lib/abap/coverage.ts` (technisch), und im UI zwei verschiedene Worte
— „Analyseabdeckung" und „Standardabdeckung".

---

## 2. Strang 1 — Die Gegenprobe gegen den Standard

`UX-E04-F01:R2` (L) · `UX-E04-F02:R2` · `UX-E04-F03:R2` · `UX-E03-F02:R2` · `UX-E02-F03:R2` · `UX-E03-F03:R2` (L)

**Das Modell.**

```
CoverageAssertion   requirementId · optionId · sourceRef · targetContext
                    evidenceLevel: E0..E4        ← Reife des Belegs
                    result: fulfilled | partial | not_fulfilled | unknown | n/a_justified
                    rationale · createdBy (virtuelle Rolle) · revision
TargetContext       edition · release · configuration · landscape
```

E0 unbekannt · E1 Kandidat (ein Kataloglink erzeugt **höchstens** E1) ·
E2 dokumentierte Eignung · E3 demonstriertes Szenario · E4 kundenspezifische
Abnahme. Stufe und fachliches Ergebnis sind **zwei** Achsen: eine hohe Stufe kann
„nicht erfüllt" belegen.

**Arbeitspakete.**
1. Typ, Persistenz am Fall, Revisionsbindung; Erzeugung nur mit Zielkontext.
2. **Der Router wird entschärft:** `extensibility-router.ts` liefert
   Zielkontext-Bedingungen, keine Abdeckungsurteile (CR-04/CR-05 im Rest).
3. Kataloglink erzeugt E1 und zeigt, was zu E2/E3 fehlt. Katalogeinhalte werden
   **referenziert, nie kopiert** (IDs, Links) — Lizenzregel aus dem Backlog.
4. Ein fehlender Katalogtreffer erzeugt `unknown`, niemals „nicht unterstützt".
5. Gegenprobe-Auswahl: Normalfall, entscheidende Ausnahme, Kontroll-/Scopefrage —
   mit sichtbarem Auswahlgrund (`UX-E04-F02`).
6. Belegablage: Referenz, Beobachtung und Nachweisinhalt getrennt; Wiederverwendung
   nur unter genannten Voraussetzungen (`UX-E04-F03`).
7. Bedarfszustände „beibehalten / bewusst ändern / entfallen / noch klären" je
   Anforderung mit verantwortlicher Rolle (`UX-E03-F02`).
8. Blindspots als Prüfaufträge mit Verantwortlichem — Nutzungsaussagen tragen
   Fenster, Quelle und Scope; das Modell dafür steht bereits in `usage-model.ts`.

**Abnahme.** V25-A02, V25-A05, QA24-A05, QA24-A06.

---

## 3. Strang 2 — Ökonomie und Entscheidung

`UX-E13-F02:R2` · `UX-E05-F02:R2` (L) · `UX-E05-F03:R2` · `UX-E05-F01:R2` · `UX-E14-F02:R2`

**Das Modell.**

```
EconomicsScenario   scope · baseline · horizon · currency · costView
                    maturity: orientation | simulation | reviewed
                    assumptionsRevision                ← ohne sie kein Geldwert
CostPosition        category · timing · quantity/unit · source · owner
Option              kind: keep_timeboxed | adapt | standard_with_change |
                          standard_plus_extension | side_by_side | retire | partial_retire
                    evidence[] (CoverageAssertion) · processChange · openPositions
```

**Was sich gegenüber heute ändert.** Die TCO-Seite rechnet mit festen
Koeffizienten und einem Zielscore 95 — korrekt als Annahme gekennzeichnet, aber
es bleibt ein Modell ohne Eingaben. B ersetzt es durch ein Szenario mit
deklarierten Annahmen, Reifegrad und Herkunft je Position. **Kein Preisabruf und
kein Modellaufruf im Rechenpfad.**

**Arbeitspakete.**
1. Deterministischer Rechenkern: diskrete Jahresperioden, Barwert mit explizitem
   `r`, Mehrkosten, kumulierter Cash-Vorteil, Amortisation ohne `Infinity` und
   ohne negative Dauer, unbekannt bleibt unbekannt. Erstes Budget:
   fünf Optionen × 100 Positionen × 60 Perioden, p95 ≤ 150 ms.
2. Sensitivität: wenige dominante Treiber, Bandbreiten **ohne**
   Wahrscheinlichkeitsbehauptung.
3. Optionsgenerator über die sieben Arten; jede Option nennt mindestens einen
   Beleg — ohne Beleg erscheint sie als „ungeprüft", nicht als „günstig".
4. **Decision Request** (`UX-E05-F03:R2`): der Prozesseigner erhält einen Link,
   liest Kurzbrief, fünf Fragen, Optionen und Empfehlung, antwortet nach Anmeldung
   als Mitglied; die Antwort wird Revision — **ohne** Mandatswirkung. Der Mailweg
   existiert (Resend, signierte Links wie bei der Tenant-Freigabe).
5. `/method/economics` veröffentlicht dieselbe Rechenbasis, abgeglichen mit dem
   Python-Referenzkern; Modul und Seite rechnen identisch.
6. Eine offene Pflichtkontrolle wird durch günstige Kosten **nicht** neutralisiert —
   die Regel gehört in den Kern, nicht in die Darstellung.

**Abnahme.** V25-A03, V25-A06, W22-A10/A11/A12, QA24-A08.

---

## 4. Strang 3 — Anschluss, Nachweis, Spielwiese

`UX-E16-F01:R2` (L) · `UX-E08-F01:R2` · `UX-E08-F02:R2` · `UX-E15-F01:R2` · `UX-E14-F04:R2` · `UX-E01-F04:R2` · `UX-E06-F02:R2` (L) · `UX-E06-F03:R2` · `UX-E12-F01:R2`

1. **Importe** (`UX-E16-F01`): ATC-Export (ADT/CSV/XML) und Kernseife-JSON als
   „SAP-autoritativ" gekennzeichnet; SCMON/SUSG, UPL, ST03N als Nutzungsquelle.
   Abgleichbericht je Objekt: Übereinstimmung und Abweichung mit Begründung
   (Regelversion, Katalogstand). Importierte Findings überschreiben eigene nicht
   und umgekehrt. Der Nutzungsteil kann `usage-parser.ts` erweitern statt ersetzen.
2. **Szenarien und Receipt** (`UX-E08-F01/F02`): Szenario aus bestätigtem
   Zielbedarf mit gültiger Anforderungsrevision; **serverseitiges, unveränderliches
   Receipt** mit Umfang, Umgebung, Stubs und benanntem Verifikationsmechanismus
   (abaplint/open-abap, BYOT-Sandbox, importierter Beleg). Damit fällt das heutige
   „Testing speichert keine Verdikte" weg — der Client schreibt nie `passed`.
3. **Zero-LLM-Run** (`UX-E15-F01:R2`): der R0-Sperrpfad wird durchgängig bis
   Gegenprobe und Economics; die Coverage-Matrix zeigt, was ohne Modell fehlt.
4. **Bench-Harness intern** (`UX-E14-F04:R2`): Korpus v1 gegen die Engine,
   Kennzahlen Präzision/Recall, Nachfolger- und Level-Genauigkeit,
   **Halluzinationsquote** (Sätze ohne Anker — `narrative-anchors.ts` liefert die
   Klassifikation bereits, es fehlt die Aggregation je Fall).
5. **Spielfälle** (`UX-E01-F04:R2`): Fälle aus dem Korpus als kopierbare Fälle mit
   Ground Truth; Vergleich „meine Entscheidung vs. Ground Truth" zeigt Fakten
   (Level, Nachfolger), bewertet die **Entscheidung nicht** als richtig oder falsch.
   Ein Spielfall wird nie als Kundencode signiert oder als Referenz-Run der Site
   ausgegeben.
6. **Living Documentation** (`UX-E06-F02`): der 1.000-Zeichen-Generator wird
   abgelöst (CR-20); bis dahin zeigt jede Ausgabe ihren Abdeckungsumfang.

**Abnahme.** V25-A04, V25-A05, V25-A12, V25-A16, W22-A15/A16, QA24-A10/A11.

---

## 5. Reihenfolge

```
B1  CoverageAssertion + Zielkontext + Router entschärfen      (Strang 1, Kern)
B2  Bedarfszustände · Gegenprobe-Auswahl · Belegablage        (Strang 1)
B3  EconomicsScenario + Rechenkern                            (Strang 2, parallel zu B2)
B4  Optionen mit Belegpflicht  ─► Decision Request            (Strang 2)
B5  Szenario + serverseitiges Receipt                         (Strang 3)
B6  Importe ATC/Kernseife/Nutzung                             (Strang 3, parallel ab B1)
B7  Zero-LLM-Durchstich · Bench · Spielfälle                  (Strang 3, braucht Korpus aus R0)
```

B1 vor allem anderen: ohne Abdeckungsbegriff sind Optionen unbelegt, Szenarien
beliebig und der Bench misst nichts.

---

## 6. Prüfplan

Anders als bei Schnitt A entstehen hier wenige neue Suiten — der Großteil sind
**Erweiterungen vorhandener Guards**, die schon die richtige Frage stellen:

| Vorhandener Guard | Was dazukommt |
|---|---|
| `usage-import-guard.spec.ts`, `usage-unknown-guard.spec.ts` | ATC- und Kernseife-Import, Abgleichbericht, Quellenkennzeichnung |
| `tco-cost-inputs-guard.spec.ts`, `tco-finite-guard.spec.ts` | Szenario statt Koeffizienten, Reifegrad, Grenzfälle aus W-06, Budget p95 |
| `test-verdicts-guard.spec.ts`, `unearned-verdicts-guard.spec.ts`, `verdict-honesty-guard.spec.ts` | Receipt serverseitig, Mechanismus benannt, Client schreibt nie `passed` |
| `engine-honesty-guard.spec.ts`, `false-positive-guard.spec.ts` | E-Stufen, „kein Treffer ≠ nicht unterstützt" |
| `starter-examples.spec.ts` | Spielfälle: Kennzeichnung, Ground-Truth-Vergleich, keine Signatur als Kundencode |
| `extensibility-route-guard.spec.ts` | Router liefert Bedingungen, keine Urteile |

**Neu:** `tests/coverage-assertion.spec.ts` (Stufen, Zielkontext, Kataloglink → E1,
kein Aufstieg durch Kopieren), `tests/economics-kernel.spec.ts` (Rechenkern gegen
den Referenzkern, Grenzfälle, Budget), `tests/decision-request.spec.ts` (Antwort
erzeugt Revision, kein Mandat; freier Name ohne Wirkung), `tests/playground-case.spec.ts`.

**Der Test, der hier am meisten wert ist:** ein Kataloglink, der über Kopieren,
Zusammenfassen oder erneutes Speichern **nicht** zu E4 wird. Genau dieser Aufstieg
ist der Fehler, den das ganze Stufenmodell verhindern soll.

---

## 7. Risiken und Entscheidungen

- **Der Bench hängt am Korpus** (`UX-E12-F02:R0`). Startet der Korpus nicht in
  Schnitt 0, verschiebt sich B7 komplett — inklusive Spielfälle, dem sichtbarsten
  Community-Nutzen der ganzen Roadmap.
- **Kataloginhalte dürfen nicht kopiert werden**, nur referenziert. Das ist eine
  Lizenzregel, keine Stilfrage, und sie betrifft Importe, Belegablage und Export.
- **Der Decision Request geht nach außen.** Er ist der erste Weg, auf dem jemand
  ohne Konto eine Mail von der Plattform bekommt und danach ein Konto anlegt —
  Zustellbarkeit, Text und Datensparsamkeit gehören zusammen geprüft.
- **Das Ökonomiemodell ersetzt eine Seite, die Rankings trägt.** Wie beim Score
  gilt: Umbenennung und Inhaltswechsel mit der SEO-Seite zusammen planen.
- **Zwei Coverage-Begriffe** (§1) sind eine echte Verwechslungsgefahr im Code und
  im Text. Die Entscheidung über die Benennung gehört vor B1, nicht danach.
