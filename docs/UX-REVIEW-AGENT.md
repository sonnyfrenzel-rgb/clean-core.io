# UX-Agent — UX-Review jeder `main`-Version

**Stand 15.09.2026 · eingeführt mit v2.9.17 · läuft bei jedem Push auf `main`, bis Sonny ihn widerruft**

Jede neue Version auf `main` bekommt eine UX-Review ihres Deltas. Die allererste Review
nimmt sich das ganze Produkt vor, Bereich für Bereich, und schließt mit einer
End-to-End-Synthese. Das Modell ist Metas **Muse Spark 1.3** über OpenRouter, multimodal:
Es liest den Code und sieht die Screens. Sein einziges Ziel ist eine möglichst perfekte
UX. Es findet Probleme, hinterfragt Design-Entscheidungen, sieht neue Features aus
Nutzersicht und prüft Farben, Formen, Schriften und Muster auf Stimmigkeit. Claude Code
prüft jeden Befund an Code und Screenshot, entscheidet im Register und plant bestätigte
Befunde in die Roadmap ein. Der Agent selbst ändert nichts.

---

## 1. Architektur

```
 git push main ── ux-review.yml
                   │
                   ├─ scope    (keine Secrets)   main → delta · dev → nur wenn der Agent selbst geändert wurde:
                   │                             erster Lauf überhaupt → full, danach → self-test
                   │
                   ├─ capture  (keine Secrets)   npm ci · Emulator · Build mit Wegwerf-Schlüsseln ·
                   │                             Demo-Projekt seeden · tests/capture-screens.spec.ts:
                   │                             16 Screens × Desktop/Telefon × bis 3 Bildschirmhöhen,
                   │                             3 Screens im Dark Mode, 6 Ansichten der Mockups 2.7
                   │
                   └─ review   (Modell- + Siegelschlüssel, kein npm ci, kein Fremdcode)
                        1. Design-Scan: Farben, Schriftgrade, Radien, Schatten, Button-Stile,
                           A11y-Heuristiken, Sprachsignale — deterministisch, ohne Token
                        2. Bereiche aus dem Import-Graphen: welcher Screen welche Komponente zeigt
                        3. Muse Spark 1.3: Code + Scan + Screenshots je Aufruf, striktes Schema
                        4. Bericht versiegelt (AES-256-GCM, UX_REVIEW_KEY)

 Claude Code (lokal) ── node scripts/ux/inbox.mjs <sha>
                        öffnen · Screenshots holen · Unentschiedenes zeigen
                        → prüfen → register.mjs accept/refute/defer/fixed → Roadmap §13
```

**Modi**

| Modus | Wann | Was das Modell bekommt | Grenze |
|---|---|---|---|
| `full` | erster Lauf; danach nur per `workflow_dispatch` | 7 Bereiche (≈ 8 Aufrufe), je Bereich alle Dateien mit Zeilennummern und seine Screens; dann eine Synthese mit Kontaktabzug aller Screens, den Befunden aller Bereiche und Top-10-Prioritäten | 6 $ |
| `delta` | jeder Push auf `main` | geänderte UX-Dateien (klein: ganz; groß: Diff mit 30 Zeilen Kontext), der Scan mit den Tokens, die das Release neu und selten einführt, Screens der betroffenen Bereiche plus Referenzscreens, offene Befunde zum Abgleich | 1,50 $ |
| `self-test` | Agent auf `dev` geändert, nach dem ersten Lauf | eine Datei, zwei Bilder | 0,30 $ |

Die Bereiche sind Journeys, keine Ordner: **Zugang** (Landing, Zugangsdialog, Features,
Rechtliches) · **Wissen** (Katalog, Whitepaper, How-to, Trust) · **Rahmen** (App-Layout,
Projekt-Layout, Dashboard, Einstellungen) · **Analyse** · **Entwurf** (Design,
Transformation) · **Nachweis** (Dokumentation, Tests, TCO, Übergabe) · **System**
(gemeinsame Komponenten, Styles, Stufenmodell, Mails). Eine Komponente gehört zu dem
einen Bereich, dessen Seiten sie rendern, sonst zum System.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Modell, Budgets, Bereiche | `scripts/ux/lib/config.mjs` | die einzige Stelle für Modell-ID, Preise, Grenzen je Modus, Bereiche und Screen-Namen |
| UX-Anweisung | `docs/ux/ux-brief.md` | Rolle, Nutzer, Produktregeln, Richtung 3.0, zehn Prüfperspektiven, Schweregrade, die drei Modi |
| Design-Scan | `scripts/ux/lib/scan.mjs` | Zählungen über alle UX-Dateien; für ein Release die neu eingeführten seltenen Tokens |
| Bereiche | `scripts/ux/lib/areas.mjs` | Import-Graph, Zuordnung, Pakete ohne geschnittene Dateien |
| Screenshots | `scripts/ux/lib/shots.mjs`, `tests/capture-screens.spec.ts` | erwartete Namen, JPEG-Signatur, Größenlimit; Auswahl erst je Screen, dann Details |
| Review | `scripts/ux/review.mjs`, `lib/prompt.mjs`, `lib/range.mjs` | Modus, Basis, Aufrufe, Kostengrenze, Siegel |
| Bericht | `scripts/ux/lib/report.mjs` | Fingerprints, Zusammenführen, Übernahme offener Befunde, Text für Claude |
| Transport | `scripts/qa/lib/openrouter.mjs`, `crypto.mjs`, `redact.mjs` | mit dem QA-Agenten geteilt: keine Tools, keine Fallbacks, keine Datennutzung, Schemaprüfung, Redaktion |
| Posteingang | `scripts/ux/inbox.mjs` | abholen, öffnen, Screenshots holen; `--brief` beim Sitzungsstart |
| Register | `scripts/ux/register.mjs`, `lib/register.mjs`, `docs/ux/register.json` | Entscheidungen, Roadmap-Tabelle |
| Workflow | `.github/workflows/ux-review.yml` | drei Jobs, drei Vertrauensstufen |
| Leitplanken im Test | `tests/ux-review-guard.spec.ts` | Modell, Schema, Jobtrennung, Kosten, Siegel, Basiswahl, Bereiche, Screenshots, Scan, Register |
| Arbeitsweise von Claude | `.claude/skills/ux-review-intake/SKILL.md` | wird nur geladen, wenn ein Bericht da ist |

---

## 2. Leitplanken

**Nur UX.** Die Anweisung schließt Code-Qualität, Performance-Interna, Geschäftslogik und
Sicherheit aus. Fällt dem Modell etwas Sicherheitsrelevantes auf, nennt es nur die Datei
in `coverage_notes`; Claude gibt das an das Security-Register weiter.

**Das Modell kann nichts tun.** Ein Aufruf ohne Tools, mit striktem JSON-Schema, lokal noch
einmal geprüft. `provider: { allow_fallbacks: false, data_collection: 'deny' }` — kein
anderes Modell, kein Anbieter, der Prompts speichert oder trainiert. Die
„Contributor"-Variante des Modells ist ausgeschlossen.

**Kein Fremdcode neben dem Schlüssel.** Der Review-Job führt kein `npm ci` aus; er nutzt
nur eigene Module mit `node:`-Imports. Der Capture-Job installiert und startet die App —
er hat dafür keinerlei Secret, nur Wegwerf-Schlüssel für den Demo-Build. Was er übergibt,
sind Bytes: Der Review-Job nimmt nur reguläre Dateien mit erwartetem Namen, JPEG-Signatur
und höchstens 3 MB, keine Symlinks.

**Nichts wird öffentlich.** Das Log nennt Commit, Modus, Aufrufe und Kosten — nicht die
UX-Gesundheit, nicht die Zahl der Befunde. Der Bericht ist versiegelt. Jeder ausgehende
Text läuft durch die Redaktion des QA-Agenten.

**Keine geratene Basis.** Ein Release wird ab dem letzten geprüften Stand geprüft, ohne ihn
ab dem vorherigen `main`-Stand des Push. Gibt es beides nicht, bricht der Lauf ab und
verlangt `mode=full` oder eine Basis. Ungelesener Code, fehlende Screenshots oder eine
fehlende Synthese machen einen Bericht **unvollständig**: Der Prüfstand bleibt stehen.
Ein Selbsttest ist nie ein Prüfstand.

**Keine Warteschlange, die Läufe verwirft.** Keine Concurrency-Gruppe: jedes Release
bekommt seine Review.

---

## 3. Kosten

Muse Spark 1.3 kostet 1,25 $ je Million Eingabe- und 4,25 $ je Million Ausgabe-Token
(OpenRouter, 15.09.2026). Vor jedem Aufruf wird geprüft: bisher tatsächlich ausgegeben plus
Schätzung für diesen Aufruf — Zeichen ÷ 3,5, jedes Bild mit 1.600 Token, die volle
Ausgabemenge. Was nicht passt, wird nicht gesendet und im Bericht als nicht gelesen
genannt. Die harte Obergrenze ist das Kreditlimit des OpenRouter-Schlüssels.

Richtwerte: ein Release mit ein, zwei geänderten Screens 0,10–0,40 $; die erste
Vollreview mit ≈ 2 MB Code und ≈ 120 gesendeten Bildern 1,50–3 $ (Schätzobergrenze 6 $). Dazu
≈ 15 Minuten Actions-Zeit für den Capture-Job.

---

## 4. Was Claude Code mit dem Bericht tut

Skill `ux-review-intake`. Kurz: im Hintergrund `node scripts/ux/inbox.mjs <sha>`; jeden
Befund an der zitierten Zeile und am zitierten Screenshot prüfen; Kontrastbehauptungen aus
den echten Farbwerten nachrechnen; dann `register.mjs accept --step … | refute | defer |
fixed`. Bestätigte Befunde gehen nach Schwere in die Roadmap (§13): kritisch als eigener
Schritt sofort, hoch in die laufende Phase — Konsistenz und Komponenten nach **1.5**,
Rahmen und Navigation nach **1.4** —, mittel in den nächsten passenden Schritt, niedrig
neben verwandte Arbeit oder nach **3.0**. Design-Entscheidungen und Prioritäten einer
Vollreview sind Vorschläge für Sonny, keine Befunde.

Beim Sitzungsstart meldet `scripts/ux/inbox.mjs --brief` unentschiedene Befunde der
letzten Review.

---

## 5. Widerruf und Einrichtung

| Was | Wo | Stand |
|---|---|---|
| Widerruf | `gh variable set UX_REVIEW_ENABLED --body false` | — |
| `OPENROUTER_API_KEY` | GitHub-Secret (mit dem QA-Agenten geteilt), `.env.local` | gesetzt |
| `UX_REVIEW_KEY` | GitHub-Secret und `.env.local` — nirgends sonst | gesetzt am 15.09.2026 |
| **18+-Bestätigung bei OpenRouter** | https://openrouter.ai/settings/preferences — nur der Kontoinhaber | **offen:** ohne sie antwortet OpenRouter auf jeden Muse-Spark-Aufruf mit HTTP 403 |
| Kreditlimit des Schlüssels | OpenRouter → Keys | empfohlen, deckt alle Agenten |

Ein Lauf lokal, ohne Modellaufruf: `node scripts/ux/review.mjs --dry --mode=full` zeigt
Pakete, Bilder und geschätzte Kosten.

---

## 6. Fehlerbilder

| Log | Bedeutung | Was tun |
|---|---|---|
| `OpenRouter answered HTTP 403 (key or account not permitted …)` | 18+-Bestätigung fehlt | Sonny bestätigt in den OpenRouter-Einstellungen, dann Lauf wiederholen |
| `OpenRouter answered HTTP 404 (… no provider matches the data policy)` | Meta nimmt den Aufruf unter `data_collection: deny` nicht an | nicht lockern — Sonny entscheidet über Modell oder Richtlinie |
| `No usable base for a delta review` | kein Prüfstand in dieser Historie und kein vorheriger Stand | `gh workflow run ux-review.yml -f mode=full` oder `-f base=<sha>` |
| Bericht `unvollständig`, „Screenshots fehlen" | Capture-Job gescheitert | `gh run view <id> --log-failed` im Job *Capture screens*; der nächste Lauf prüft vom alten Stand |
| Screens zeigen leere Seiten | Seed passt nicht mehr zur Seite | `tests/capture-screens.spec.ts` nachziehen; Befunde dazu widerlegen, nicht einplanen |
