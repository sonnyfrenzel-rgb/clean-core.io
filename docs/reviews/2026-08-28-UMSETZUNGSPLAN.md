# Umsetzungsplan — offene GLM- und GPT-Findings

**Stand:** 28. August 2026, gegen v2.5.3
**Grundlage:** GLM 5.3 (57 Findings, `2026-08-27-GLM-TRIAGE.md`) und GPT-5.6-sol
(~55 Findings, sechs `2026-08-27-gpt-5.6-sol-*-raw.md`)

Dieser Plan enthält **nur, was gegen den Code nachgestellt wurde**. Was ungeprüft
ist, steht unten als solches — nicht als Aufgabe getarnt.

Die Überschneidung beider Modelle ist hoch. Wo beide dasselbe gefunden haben, ist
das vermerkt: es erhöht die Trefferwahrscheinlichkeit, ersetzt die Prüfung aber
nicht — vier der hier geprüften Punkte sind trotz doppelter Nennung falsch,
darunter das einzige, das als *Blocking* gemeldet wurde.

---

## Widerlegt — geprüft, kein Defekt

Zuerst, weil es den Plan kürzer macht.

| Finding | Wer | Warum es nicht stimmt |
|---|---|---|
| **Fehlende Call-Counts werden zu „dormant" und damit zu Stilllegungskandidaten** (gemeldet als *Blocking*) | GPT-Engine 1, GLM E2 | `lib/abap/usage-join.ts:112` trägt genau dafür einen Schutz: `if (!record) return 'unknown';`, mit dem Kommentar „§5 SAFEGUARD: no record → unknown, NEVER dormant". Auch ein `callCount` von `undefined` landet nicht bei `dormant`: `undefined === 0` ist falsch, die Perzentilvergleiche ebenso, der Pfad endet bei `'low'`. Das schwerste gemeldete Finding beider Modelle existiert nicht. |
| **`differentialVerified` markiert jede exakte Übereinstimmung als verifiziert** | GPT-Engine 3, GLM E10 | Das Flag wird **von niemandem gesetzt**. Der einzige Aufrufer wäre der gefälschte Sandbox-Tester gewesen, der in v2.5.0 entfernt wurde. `verified` ist immer falsy, `level` immer `'partial'`. Kein aktiver Defekt — aber eine scharfe Falle, siehe Phase 3. |
| **Die Datenschutzerklärung verspricht unbedingt, dass Code nicht zum Training verwendet wird** | GPT-Public 1, GLM P-Block | `app/datenschutz/page.tsx:80` sagt „Under Google's **applicable** API data-use terms, this content is not used to train…", bereits bedingt formuliert, mit BYOK-Zusatz. Ein Rest des Findings hält allerdings stand, siehe Phase 4. |
| **„Malicious Payload Check passed" für Code, der nie gescannt wurde** — Upload-Pfad | GPT-App 7, GLM U7 | Beim Upload ist der Scan echt (`scanForMaliciousCode`, Zeile 174) und **blockiert**: bei einem Treffer wird `setLegacyCode('')` gerufen, der Banner erscheint gar nicht. Für Uploads ist die Aussage wahr per Konstruktion. Für den Einfügepfad nicht — siehe 1.2. |

---

## Phase 1 — Grüne Urteile ohne Prüfung (hoch)

Dieselbe Fehlerklasse, für die in v2.5.0 der gefälschte Sandbox-Tester entfernt
wurde und für die `docs/ARCHITECTURE.md` §5.7 die Regel formuliert. Sie ist an
mehreren Stellen zurück, und sie trifft genau die Bildschirme, die ein Kunde
fotografiert.

### 1.1 Der angezeigte Clean Core Score ist nicht der signierte

**Beide Modelle. Bestätigt, mit Rechenweg.**

Signiert wird `computedRouteReport.cleanCoreScore` — deterministisch aus der
Evidenz-Engine. Angezeigt wird `liveCleanCoreScore`
(`app/(app)/project/[projectId]/analyze/page.tsx:1111`), eine **andere Formel**:

```
60 % Konstrukt-Abdeckung
+ 30 % standardFitBonus   ← per Regex /high|medium|low/ aus KI-Prosa gelesen,
                            Vorgabewert 80, wenn nichts passt
+ 10 % gespeicherter Score
```

Zwei Probleme in einem: die Zahl auf dem Bildschirm weicht von der im signierten
Run ab — und 30 % davon stammen aus einem Mustervergleich auf generiertem Text,
mit einem erfundenen Vorgabewert. Der Vorgabewert ist dieselbe Substitutions-
klasse wie P2 und die Board-Deck-Multiplikatoren, die beide bereits entfernt sind.

**Umsetzung:** Den signierten Score anzeigen. Ist eine zweite, feinere Kennzahl
gewünscht, braucht sie einen eigenen Namen und eine eigene Herleitung und darf
nicht dort stehen, wo „Clean Core Score" steht. Kein Vorgabewert.

**Aufwand:** klein. **Wirkung:** hoch — es ist die Zahl, auf der die
Vertrauenskette beruht.

### 1.2 „Malicious Payload Check passed" beim Einfügen

**Bestätigt — mit dem Mechanismus, den beide Modelle falsch angegeben haben.**

Die Textfläche setzt `legacyCode` direkt
(`analyze/page.tsx:2013`, `onChange={(e) => setLegacyCode(e.target.value)}`) —
**ohne jeden Scan**. Der Banner hängt allein an `legacyCode && !isFromExample`
und behauptet dann, die Datei sei „clean and safe for processing". Eingefügter
Code ist von nichts geprüft. Dasselbe beim Wiederherstellen eines gespeicherten
Projekts (Zeile 136), dort schwächer, weil beim Upload einmal geprüft wurde.

**Umsetzung:** `scanForMaliciousCode` auch auf dem Einfügepfad laufen lassen
(entprellt), und den Banner an das Ergebnis binden statt an die bloße Existenz
von Code. Ohne Prüfergebnis kein Banner.

**Aufwand:** klein. **Wirkung:** hoch.

### 1.3 Die übrigen Stellen derselben Klasse

Von beiden Modellen genannt, hier **nur lokalisiert, nicht durchgerechnet**:

- `delivery/page.tsx:610` — „Ready for Deployment" mit pulsierendem grünen Punkt
- `transformation/page.tsx:867` — „AI Verified" ohne erkennbare Bedingung
- `components/analyze/ConstructFindings.tsx:30` — „Pristine Codebase Detected"
  bei null Findings
- Integritätsbericht: grüne Zustände für nie geprüfte Artefakte (GPT-App 5)
- Ziel-Umfang-Panel: erfundene Prozentwerte (GPT-Komponenten 5)
- Fehlende Abdeckungs-Zusammenfassung wird als „vollständig unterstützt"
  gerendert (GPT-Komponenten 6)
- Undefiniertes Deployment-Ziel wird „Private Cloud (RISE)" (GPT-Komponenten 9)
- `NaN%` Bestehensquote bei leeren Testergebnissen (GPT-App 9)

**Vorschlag:** ein Arbeitspaket, mit je einer Prüfung in der Art von
`tests/no-fabricated-figures.spec.ts`. Vorher jeden Fall einzeln nachstellen —
bei der Payload-Behauptung lagen beide Modelle beim Mechanismus daneben, und das
wird hier nicht anders sein.

**Aufwand:** mittel bis groß. **Wirkung:** hoch.

---

## Phase 2 — Tests, die nichts prüfen (hoch)

**GLM M3 / V18, GPT-Meta. Bestätigt.** Fünf Tests hüllen ihre gesamte Zusicherung
in eine Bedingung:

```
tests/analyze-design.spec.ts:37       if (await chatbotTrigger.count() > 0) {
tests/landing.spec.ts:34              if (await legalNoticeLink.count() > 0) {
tests/sandbox-delivery.spec.ts:9      if (await communityBadge.count() > 0) {
tests/stage1-2.spec.ts:18             if (await legalNoticeLink.count() > 0) {
tests/transformation-docs.spec.ts:20  if (await glossaryBookTrigger.count() > 0) {
```

Verschwindet das Element, besteht der Test stillschweigend. Das ist schlechter
als ein fehlender Test: es ist ein Test, der als Absicherung mitgezählt wird.

**Umsetzung:** Bedingung durch Zusicherung ersetzen — `await
expect(locator).toBeVisible()` und dann weiter. Ist ein Element wirklich
optional, gehört das begründet, nicht stillschweigend übersprungen.

**Aufwand:** klein, fünf Stellen. **Wirkung:** hoch — es entscheidet, was alle
anderen Tests wert sind.

**Zusammen damit:** das eslint-Gate prüft weder TypeScript noch React-Hooks
(GLM M2, steht im Backlog). Derselbe Punkt: die Absicherung behauptet mehr, als
sie leistet.

---

## Phase 3 — Engine und Sicherheit (mittel)

Im GLM-Triage bereits **reproduziert**, noch nicht umgesetzt:

| # | Was | Aufwand |
|---|---|---|
| E4 | `extractDataCoupling` meldet Arbeitsbereiche und interne Tabellen als Datenbankschreibzugriffe | mittel |
| E5 | Ein echtes `DELETE vbak WHERE …` wird stillschweigend übersehen | klein |
| E6 | Parametrisierte CDS-Views und Assoziationspfade werden zu Phantomobjekten | mittel |
| E7 | Gewöhnliche Literale werden als hartkodierte Umgebungsparameter gemeldet | klein |
| E8 | Der Credit-Management-Detektor feuert auf unbeteiligte Aufrufe | klein |
| E11 | `resolveConstants` wird berechnet und nie gelesen — BDC-Findings nennen `C_TCODE_VA02` statt `VA02` | klein |
| E12 | Eine kommagetrennte `FROM`-Liste erfasst nur die erste Tabelle | klein |
| S4 | Eine von drei OData-Routen hat den Pfadschutz nie bekommen | klein |
| S5 | `safeFetch` sendet den Authorization-Header über eine Weiterleitung mit | klein |
| S6 | Ratenbegrenzungen pro IP sind umgehbar | mittel |
| S7 | Ein OAuth-Token-Fehler wird zu einer unauthentifizierten Anfrage | klein |
| S9 | Ein Teilfehler belastet den Nutzer zweimal für einen Lauf | klein |
| S10 | Eine abgelehnte Zugangsdatei meldet `status: 'connected'` | klein |
| C5 | Die Dateiliste lädt nach einem Neuladen nie | klein |

**Neu bestätigt:**

**GPT-Sicherheit 9 — ein Backup-Code lässt sich zweimal einlösen.**
`app/api/mfa/verify/route.ts:31-51` liest `backupCodes`, prüft, und schreibt
danach — ohne Transaktion. Zwei gleichzeitige Anfragen mit demselben Code lesen
dieselbe Liste, beide bestehen, beide schreiben ihre eigene Restliste; die zweite
überschreibt die erste. Die zugesagte Einmaligkeit gilt damit nicht. Kein
Auth-Bypass — der Angreifer braucht den Code —, aber eine gebrochene Zusage.
**Behebung:** dieselbe `runTransaction`-Form, die `recordEmailEvent` bereits
benutzt. Klein.

**`differentialVerified` als scharfe Falle.** Als aktiver Defekt widerlegt (siehe
oben), aber der Schalter steht noch da: wer ihn verdrahtet, markiert eine
Übereinstimmung allein aufgrund von `cds.exact` als „fully verified", ohne dass je
ein Differenztest lief. **Behebung:** entfernen, oder so umbauen, dass er nur mit
einem echten Testergebnis gesetzt werden kann. Klein.

---

## Phase 4 — Öffentliche Inhalte und Recht (mittel)

**Bestätigt:**

- **Die Datenschutzerklärung nennt die Free-Tier-Einschränkung nicht.** Das
  Whitepaper hat dafür einen Kasten „Honest boundary": bei einem
  Free-Tier-Schlüssel gelten andere Google-Bedingungen. Die Datenschutzerklärung
  sagt nur „applicable terms". Für ein Rechtsdokument ist das die schwächere
  Fassung — und es ist die einzige der beiden, die zählt. **Behebung:** denselben
  Satz übernehmen. Eine Zeile.
- **Die Datenschutzerklärung nennt den E-Mail/Passwort-Weg nicht** (GPT-Public 5).
  §3 beschreibt nur Google Sign-In. Der andere Weg existiert und verarbeitet
  Daten. Eine Zeile.
- **Katalog-Modulseiten behaupten zu viel.** `app/catalog/module/[area]/page.tsx:122`:
  „N objects in this area carry a released S/4HANA successor" — während die
  Tabelle darunter für einzelne Zeilen ausdrücklich „no released path" rendert.
  Der Satz muss zählen, was er behauptet. Eine Zeile.

**Ungeprüft, aus dem GPT-Bericht:** die FAQ-Auszeichnung enthält Antworten, die
nicht sichtbar als FAQ dargestellt sind (Google kann das abstrafen);
`lastModified` im Sitemap ist die Erzeugungs-, nicht die Änderungszeit — laut
Kommentar in `app/sitemap.ts` bewusst so, GPT hält es für ein falsches Signal;
die „Private Cloud"-Aussage zu S/4HANA; die „reproduzierbare" Analysezeit.

---

## Phase 5 — Lieferkette und CI (niedrig, aber eine eigene Entscheidung)

Von GPT-Meta, **nicht nachgestellt**: Abhängigkeits-Installationsskripte laufen
mit Google-Cloud-OIDC-Rechten; der Katalog-Sync führt Paketskripte aus, während er
Schreibrechte auf das Repository hält; ein nicht angehefteter Remote-Installer in
einem Workflow mit PR-Schreibrecht (GLM M4 — der Workflow dokumentiert die
Abwägung im eigenen Kommentar); das Abhängigkeits-Sicherheitsgate führt eine
gleitende Paketversion aus.

Das ist eine zusammenhängende Frage, keine Liste von Einzelpunkten: **wie viel
Vertrauen bekommt fremder Code in einem Lauf, der Deploy-Rechte hält.** Gehört an
einem Stück betrachtet, nicht nebenbei gepatcht.

---

## Vorgeschlagene Reihenfolge

1. **Phase 2** zuerst — fünf Zeilen, und danach bedeutet eine grüne Suite wieder
   etwas. Alles Folgende stützt sich darauf.
2. **1.1 und 1.2** — beide klein, beide treffen die Vertrauenskette direkt.
3. **Phase 4** — vier Zeilen Text, davon zwei rechtlich.
4. **Phase 3**, sortiert nach Aufwand, die kleinen zuerst.
5. **1.3** als eigenes Arbeitspaket, mit Nachstellung je Fall.
6. **Phase 5** als Entscheidung, nicht als Ticket.

Phase 2 bis 4 sind zusammen etwa ein Vormittag.

---

## Was hier nicht geprüft wurde

Damit die Zahl ehrlich bleibt: von rund 55 GPT-Findings sind **elf** nachgestellt
(vier davon widerlegt). Die 24 unbearbeiteten GLM-Punkte sind gesichtet, aber nur
teilweise geprüft. Die 25 im GLM-Triage bereits reproduzierten Punkte sind
übernommen, ohne sie erneut zu prüfen.

Der Rest — im Wesentlichen 1.3, die zweite Hälfte von Phase 4 und ganz Phase 5 —
ist lokalisiert, aber unbestätigt. Bei einer Trefferquote von vier Fehlern auf elf
Prüfungen, darunter das einzige als *Blocking* gemeldete Finding, ist eine
Nachstellung vor jeder Änderung nicht optional.
