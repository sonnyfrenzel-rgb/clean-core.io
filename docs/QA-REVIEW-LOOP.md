# QA-Agent — die Review-Schleife auf `dev`

**Stand 15.09.2026 · eingeführt mit v2.9.12 · läuft ab sofort bei jedem Push auf `dev`, bis Sonny sie widerruft**

Jeder neue Stand auf `dev` bekommt zwei Prüfungen, ohne dass jemand sie anstößt:
ein **Delta-Review** durch ein fest eingestelltes Modell (GPT-5.6 Luna über
OpenRouter) und einen **Smoke-Check** der Revision, die derselbe Push deployt hat.
Jede Version auf `main` bekommt zusätzlich ein **Vollreview des ganzen Codes** durch
das Spitzenmodell derselben Reihe, GPT-5.6 Sol (§10). Modellwahl von Sonny am
15.09.2026; bis dahin prüfte GPT-6 Astra die Deltas.
Die Befunde gehen versiegelt an den Maintainer — Claude Code —, der jeden prüft,
bestätigte behebt, widerlegte mit Begründung ablegt und erneut pusht. `main` wird
erst gefragt, wenn die Schleife sauber ist.

---

## 1. Architektur

```
 git push dev ──┬──────────────────────────────────────────────► deploy.yml (Build, Tests, Cloud Run)
                │                                                         │
                ▼                                                         │
   qa-review.yml ── job review ─────────────────────────┐                 │
                │   1. vorherigen versiegelten Bericht holen              │
                │   2. Delta seit dem letzten geprüften Commit            │
                │      (ohne Checkpoint: alles, was nicht auf main ist)   │
                │   3. Vorprüfung ohne Token (Risiko, Test-Signale,       │
                │      Abnahmekriterien, Geheimnis-Schwärzung)            │
                │   4. Batches nach Risiko, geschätztes Kostenbudget      │
                │   5. GPT-5.6 Luna, strukturierte Antwort, keine Tools   │
                │   6. Bericht versiegeln → Artefakt qa-review-<sha>      │
                │                                                         ▼
                └── job smoke ── wartet auf deploy.yml desselben Commits ─┘
                    prüft /api/health (Commit), Routen, Security-Header
                    versiegeln → Artefakt qa-smoke-<sha>

 Claude Code (lokal) ── node scripts/qa/await.mjs <sha>
                    lädt beide Artefakte, entsiegelt nach .qa-review/ (git-ignoriert)
                    Exit 0 = go · 3 = Arbeit · 2 = kein Ergebnis
                    → prüfen → beheben / widerlegen → push dev → nächste Runde

 git push main ── qa-review.yml ── job full (§10)
                    ganzer Code des Release-Commits, in Batches, GPT-5.6 Sol
                    versiegeln → Artefakt qa-full-<sha> · entscheidet nichts
 Claude Code (lokal) ── node scripts/qa/await.mjs <sha> --full → prüfen → Schritt auf dev
```

| Baustein | Datei | Aufgabe |
|---|---|---|
| Konfiguration | `scripts/qa/lib/config.mjs` | Modell, Budgets, Pfadfilter, Risikoregeln, Smoke-Ziele — die einzige Stelle für all das |
| Delta | `scripts/qa/lib/git-delta.mjs` | Bereich, geänderte Dateien, Hunks mit 12 Zeilen Kontext, Aufrufer geänderter Symbole außerhalb des Deltas |
| Vorprüfung | `scripts/qa/lib/triage.mjs` | Risiko-Tags, Test-Schwächungssignale, zitierte Abnahmekriterien, „Code ohne Test" |
| Schwärzung | `scripts/qa/lib/redact.mjs` | Schlüsselmuster vor dem Versand ersetzen, Treffer als kritischen Befund melden |
| Packen | `scripts/qa/lib/pack.mjs` | riskanteste Dateien zuerst, höchstens 4 Aufrufe (Vollreview: 14), Rest als „nicht geprüft" benannt; das Kostenbudget greift vor jedem Aufruf |
| Vollreview | `scripts/qa/full-review.mjs`, `lib/full.mjs` | alle prüfbaren Dateien des Release-Commits mit Zeilennummern und Dateiübersicht; ein gescheiterter Batch kostet die anderen nicht (§10) |
| Prompt | `scripts/qa/lib/prompt.mjs` + `docs/qa/reviewer-brief.md` | Antwortschema; Rolle, Prüfliste und Projektregeln als lesbares Dokument |
| Modellaufruf | `scripts/qa/lib/openrouter.mjs` | ein Endpunkt, keine Tools, keine Fallback-Modelle, `data_collection: deny`, Retry nur bei 429 — was schon generiert worden sein könnte, wird nie ein zweites Mal bezahlt |
| Bericht | `scripts/qa/lib/report.mjs` | Fingerabdrücke, Übertrag offener Befunde, widerlegte nicht übertragen (erneut erhobene bleiben, markiert), öffentliche Zeile ohne Inhalt |
| Siegel | `scripts/qa/lib/crypto.mjs`, `lib/store.mjs` | AES-256-GCM unter `QA_REVIEW_KEY` |
| Einstiege | `scripts/qa/review.mjs`, `smoke.mjs`, `await.mjs`, `refute.mjs` | CI-Review, CI-Smoke, lokales Abholen, Widerlegen |
| Workflow | `.github/workflows/qa-review.yml` | Auslöser, Rechte, Widerruf, Artefakte |
| Leitplanken im Test | `tests/qa-review-guard.spec.ts` | Siegel, keine Leaks, nur Lesen, Kostenbudget, Delta, Bericht, Wochencheck |
| Arbeitsweise von Claude | `.claude/skills/qa-review-loop/SKILL.md` | wird erst geladen, wenn die Schleife dran ist — kostet sonst keinen Kontext |

---

## 2. Leitplanken

**Der Agent darf:** den Code des Repositorys lesen, das Delta an ein fest
eingestelltes Modell senden, einen versiegelten Bericht als Artefakt hochladen, die
öffentlichen Seiten der dev-Revision abrufen.

**Der Agent darf nicht — und kann es auch nicht:**

| Verbot | Wodurch es technisch ausgeschlossen ist |
|---|---|
| Code ändern, committen, pushen | Token mit `contents: read`; `persist-credentials: false`; das Modell hat keine Tools |
| Kommentare, Issues, PRs anlegen | Token ohne `issues`/`pull-requests`; Guard prüft, dass der Workflow kein `gh issue/pr` und kein `git push` enthält |
| Deployen, Workflows starten | Token mit `actions: read`; keine Cloud-Zugangsdaten im Job |
| Befunde öffentlich machen | Bericht und Smoke-Ergebnis versiegelt; das Log sagt nur „completed, sealed", Modellaufrufe und Kosten — **kein Verdikt, keine Zahlen je Schweregrad** |
| Geheimnisse weitergeben | Schwärzung vor dem Versand; Dateien wie `.env*`, `*.pem`, Service-Account-JSON werden nie gelesen; Fehlerausgaben nur als Meldung, nie Stack oder Antwortkörper |
| Ein anderes Modell nutzen | Modell-ID an genau einer Stelle, `allow_fallbacks: false`; Guard prüft beides |
| Unbegrenzt Geld ausgeben | geschätztes Budget je Review, geprüft vor jedem Aufruf gegen das tatsächlich Ausgegebene; nur ein 429 wird wiederholt; harte Grenze ist das Kreditlimit am OpenRouter-Schlüssel |

**Warum keine Zahlen im Log:** Das Repository und seine Actions-Logs sind
öffentlich, und die dev-Revision ist öffentlich erreichbar. „1 critical auf dev" in
einem öffentlichen Log sagt einem Angreifer, wann sich das Hinsehen lohnt.

**Prompt-Injection:** Alles im Delta ist für das Modell Daten, keine Anweisung (steht
im Brief). Selbst ein erfolgreicher Versuch kann nur einen falschen Befund erzeugen —
und kein Befund wird ungeprüft umgesetzt (§4).

---

## 3. Kosten

Delta-Review mit GPT-5.6 Luna, Listenpreis bei OpenRouter am 15.09.2026: **0,20 $ je
Mio. Eingabe-Token, 1,20 $ je Mio. Ausgabe-Token** — ein Fünfzigstel von GPT-6 Astra
(10 $ / 50 $), mit dem die Deltas bis dahin geprüft wurden. Das Vollreview auf `main`
kostet mit GPT-5.6 Sol 2 $ / 10 $ (§10).

| Maßnahme | Wirkung |
|---|---|
| Nur das Delta seit dem letzten *geprüften* Commit — ohne Checkpoint alles, was noch nicht auf `main` ist | kein Vollreview; ein abgebrochener oder gescheiterter Lauf verliert nichts |
| Kein Modellaufruf ohne Code im Delta | reine Doku-/Asset-Pushes kosten 0 $ |
| 12 Zeilen Kontext je Hunk, höchstens 15 Symbole × 3 Aufrufer | Kontext statt ganzer Dateien |
| Reasoning `medium`, nur bei Sicherheit/Trust-Chain/CI `high` | teures Denken dort, wo ein Fehler teuer ist |
| Höchstens 4 Aufrufe, 200.000 Zeichen und 32.000 Ausgabe-Token (Reasoning eingeschlossen) je Aufruf | Obergrenze der Anfrage. Bis 15.09. waren es 2 Aufrufe bei 2,50 $ — große Deltas kamen unvollständig zurück und kosteten eine weitere Runde |
| **Budget 0,50 $ je Review — geschätzt, keine harte Grenze.** Ein voller Aufruf schätzt sich auf etwa 0,05 $, das Budget begrenzt also nicht mehr die Abdeckung, sondern fängt Ausreißer. Vor jedem Aufruf: tatsächlich Ausgegebenes + Schätzung dieses Aufrufs (3,5 Zeichen je Token, Antwortschema eingerechnet, volle Ausgabe) | ein Aufruf, der das Budget nach dieser Schätzung reißen würde, findet nicht statt; seine Dateien stehen als „nicht geprüft" im Bericht. Sehr token-dichter Text kann einen einzelnen Aufruf darüber hinaus treiben — **die harte Grenze ist das Kreditlimit am OpenRouter-Schlüssel** |
| Tatsächliche Kosten aus OpenRouters Usage-Datensatz | stehen in jedem Bericht und im Log — fehlt eine Angabe, steht dort „unknown", nie 0 $ |

Gemessen am 15.09.2026: der Review von v2.9.12 (24 Dateien, ein Aufruf, Reasoning
`high`) **0,81 $**, der von v2.9.13 **1,28 $** tatsächlich; die Vorab-Schätzung rechnet
die volle Ausgabe von 32.000 Token und lag bei 1,92 $. Sie ist vorsichtig, aber keine
garantierte Obergrenze. **Empfehlung: ein Monatslimit direkt am OpenRouter-Schlüssel**
— das ist die einzige harte Grenze.

---

## 4. Die Schleife — was Claude Code mit dem Ergebnis tut

Die verbindliche Arbeitsanweisung steht im Skill `qa-review-loop`; hier die Regeln,
an denen sie gemessen wird.

1. **Nach jedem Push auf `dev`** startet `node scripts/qa/await.mjs <sha>` im
   Hintergrund. Ein Hook in `.claude/settings.json` erinnert daran.
2. **Jeder Befund wird geprüft, bevor etwas geändert wird** — die zitierte Stelle
   lesen, den Fehlerfall nachvollziehen, wenn möglich reproduzieren. Modellbefunde
   sind Hypothesen (von ~20 Grok-Befunden im August waren 2 falsch).
3. **Bestätigt → beheben**, im Umfang des Befunds und nicht darüber hinaus; mit Test,
   der ohne den Fix fehlschlägt. Eine Vereinfachung wird nur übernommen, wenn die
   vorhandenen Tests das Verhalten abdecken.
4. **Widerlegt → `node scripts/qa/refute.mjs <fingerprint> "<Begründung mit Beleg>"`**
   und die versiegelte Liste committen. Der Reviewer bringt ihn nicht wieder.
5. **Nie** einen Test abschwächen, eine Prüfung abschalten oder eine Warnung
   unterdrücken, um einen Befund verschwinden zu lassen.
6. **Push der Korrekturen auf `dev`** → nächste Runde über genau dieses Delta.
7. **Ende:** kein offener Befund `critical`/`high`/`medium` und Smoke grün — oder
   **drei Runden** für denselben Schritt. Dann stehen die Reste im Bericht an Sonny.
   Ausnahme: ein `medium` in der Maschinerie der Agenten selbst (`scripts/qa|security|ux`,
   ihre Workflows, Skills, Guard-Specs — `AGENT_INFRASTRUCTURE` in `config.mjs`) hält die
   Schleife nicht auf; er wird gemeldet und in einem eigenen Schritt behoben.
8. **`main` nur auf Sonnys Go**, und erst nach einer sauberen Runde.

`low` hält die Schleife nicht auf. Günstige `low`-Befunde werden mitgenommen, der
Rest steht im Schrittbericht.

**Drei Regeln, die der Agent aus seinen eigenen Reviews gelernt hat (15.09.2026):**

- **Ein unvollständiger Review ist kein „go".** Blieb Code ungelesen — Kostenbudget,
  Batch-Grenze, abgeschnittener Diff —, heißt der Bericht `INCOMPLETE`, die Schleife
  bleibt offen, und der Checkpoint bleibt stehen: Der nächste Review liest den
  ausgelassenen Code erneut, statt hinter ihm anzufangen.
- **Eine Widerlegung gilt für den Befund, über den sie geschrieben wurde** — für die
  Erhebung davor, nicht für eine spätere. Hebt der Reviewer ihn nach einer Regression
  erneut an, bleibt er offen und markiert, bis er behoben oder neu widerlegt ist.
- **Der Startpunkt eines Reviews** ist der letzte geprüfte Checkpoint, wenn er ein
  Vorfahr des Kopfes ist — sonst alles, was noch nicht auf `main` ist. Das `before`
  des Pushs wird nie genommen; nur ein manueller Lauf darf eine Basis vorgeben.

**Weniger Runden bei gleicher Qualität (Sonny, 15.09.2026, Vorschläge A–C):** Die
meisten Runden bis dahin gingen auf drei Ursachen zurück, nicht auf Produktfehler.

- **A — Agenten-Maschinerie blockiert mit `medium` nicht** (siehe Punkt 7).
- **B — Hypothetische Altdaten sind `low`.** Ein Fehlerfall, der Daten braucht, die kein
  heutiger Codepfad erzeugt, ist höchstens `low`, außer der Reviewer nennt den Schreiber,
  die Migration oder den Import, der sie heute erzeugt (`docs/qa/reviewer-brief.md`).
- **C — Pfad- und Dateinamen sind keine Geheimnisse.** Ein Name auf `_PATH` oder `_FILE`
  löst die Namensregel der Schwärzung nicht mehr aus; ein echter Schlüssel unter solchem
  Namen wird weiter an seiner Form erkannt.

---

## 5. Widerruf

```bash
gh variable set QA_REVIEW_ENABLED --body false   # stoppt beide Jobs und die lokale Schleife
gh variable delete QA_REVIEW_ENABLED             # schaltet sie wieder ein
```

Der Workflow prüft die Variable in beiden Jobs, `await.mjs` vor dem Warten. Eine
Abschaltung ist sofort wirksam; nichts anderes muss geändert werden.

---

## 6. Einrichtung

| Geheimnis | Wo | Zweck |
|---|---|---|
| `OPENROUTER_API_KEY` | GitHub-Secret, `.env.local` | Modellaufruf |
| `QA_REVIEW_KEY` | GitHub-Secret, `.env.local` — **gleicher Wert** | versiegeln und entsiegeln; mindestens 32 Zeichen, zufällig |

**Hook auf einem neuen Rechner.** Skill (`.claude/skills/qa-review-loop/`) und
Hook-Skript (`.claude/hooks/after-push.mjs`) sind versioniert; die Registrierung
steht in der lokalen, nicht versionierten `.claude/settings.json`:

```json
"hooks": { "PostToolUse": [ { "matcher": "Bash|PowerShell", "hooks": [
  { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/after-push.mjs\"", "timeout": 15 }
] } ] }
```

Den Schlüssel rotieren: neuen Wert in beide Orte schreiben. Ältere Berichte lassen
sich danach nicht mehr öffnen und werden beim Übertrag übersprungen; die versiegelte
Widerlegungsliste muss mit dem alten Schlüssel geöffnet und mit dem neuen neu
geschrieben werden.

---

## 7. Bedienung von Hand

```bash
node scripts/qa/review.mjs --dry                            # Delta, Vorprüfung, Batches, geschätzte Kosten — kein Aufruf
QA_BASE=<sha> QA_HEAD=<sha> node scripts/qa/review.mjs --dry  # für einen bestimmten Bereich
node scripts/qa/review.mjs --local                          # echter Review lokal (kostet), Klartext nach .qa-review/out/
node scripts/qa/await.mjs <sha> --timeout=60                # Ergebnis eines gepushten Commits abholen
node scripts/qa/refute.mjs <fingerprint> "<Begründung>"     # widerlegten Befund ablegen
gh workflow run qa-review.yml --ref dev -f base=<sha> -f head=<sha>   # Review eines Bereichs erneut anstoßen
```

---

## 8. Fehlerbilder

| Symptom | Ursache | Vorgehen |
|---|---|---|
| `await.mjs` Exit 2, „superseded" | ein neuerer Push hat den Lauf abgebrochen | den neueren Commit abwarten — sein Review deckt dieses Delta mit ab |
| Job `review` rot, „OpenRouter answered HTTP 402/401" | Guthaben oder Schlüssel | OpenRouter-Konto prüfen; wiederholt wird nur ein 429 |
| Job `review` rot, „QA_REVIEW_KEY is missing" | Secret fehlt | Secret setzen; ohne Schlüssel wird nie unversiegelt geschrieben |
| Smoke „new revision serving: no" | Deploy lief, aber `/api/health` meldet einen anderen Commit | Cloud-Run-Revision prüfen (`gcloud run services describe clean-core-dev --region=europe-west1 --project=cleancore-491216`) |
| Bericht nennt „NOT REVIEWED" | Delta über dem Budget | kleiner schneiden oder den Bereich gezielt per `workflow_dispatch` nachprüfen |
| Ein Befund kommt nach Widerlegung wieder | Titel geändert → neuer Fingerabdruck | erneut widerlegen; die Begründung verweist auf den früheren |
| „no review content (finish_reason=length …)" | Reasoning hat das Ausgabebudget aufgebraucht | am 15.09. beim ersten Lauf passiert (12.000 Token bei `high`); seitdem 32.000 — tritt es wieder auf, `maxOutputTokens` in `config.mjs` als eigener Schritt anheben |

---

## 9. Wöchentliche Pflicht: Pipeline-Gesundheit

Was niemand pusht, prüft auch kein Delta-Review: ein geplanter Workflow, der am
Montag rot wird, oder ein Bot-Branch mit einem Update, das niemand übernimmt. Genau
das ist am 7. und 14.09. passiert — der Katalog-Sync hatte die SAP-Daten geholt,
durfte aber keinen Pull Request anlegen, und der rote Lauf meldete sich bei niemandem.

| Baustein | Aufgabe |
|---|---|
| `.github/workflows/qa-weekly-health.yml` | montags 07:30 UTC, nach den geplanten Jobs um 06:00; nur lesend; Ergebnis versiegelt als `qa-health-<run>` |
| `scripts/qa/lib/health.mjs` | je Workflow das jüngste Ergebnis (rot, eingeschlafen, ok), bei Rot Job, Schritt und erste Fehlerzeile (geschwärzt); Bot-Branches, die vor `main` liegen |
| `scripts/qa/health.mjs` | `--seal` in CI, `--brief` beim Sitzungsstart, ohne Schalter für den Maintainer |
| `SessionStart`-Hook (lokale `.claude/settings.json`) | bringt Rotes und Offenes in Claudes Kontext, auch wenn niemand gepusht hat |

Kein Modell, keine Kosten. Der Katalog-Sync legt seit dem 15.09. keinen Pull Request
mehr an, sondern pusht `chore/sync-cloudification-repo` und endet grün; der
Wochencheck meldet den Branch, bis er über `dev` übernommen ist.

---

## 10. Vollreview jeder Version auf `main`

Ein Delta-Review sieht, was sich geändert hat — nie, was schon da war, als die Reviews
begannen. Deshalb bekommt jede Version auf `main` zusätzlich einen Review des ganzen
Codes (Sonny, 15.09.2026).

| | |
|---|---|
| Auslöser | Push auf `main`, Job `full` in `.github/workflows/qa-review.yml`; nie abgebrochen, Releases laufen nacheinander |
| Modell | `openai/gpt-5.6-sol`, das Spitzenmodell der GPT-5.6-Reihe, Reasoning `high`. GPT-6 Astra Pro war erwogen und wurde der Kosten wegen verworfen |
| Umfang | jede prüfbare Datei des Release-Commits (gleiche Pfadfilter wie das Delta), mit Zeilennummern, dazu eine Übersicht aller Dateien; am 15.09.2026 435 Dateien, rund 4,3 Mio. Zeichen in 12 Batches |
| Kosten | 2 $ / 10 $ je Mio. Token. Budget **10 $ je Version**, geschätzt wie beim Delta (volle Ausgabe je Aufruf eingerechnet): Vorab-Schätzung 8,95 $, tatsächlich deutlich weniger, weil die Ausgabe selten ausgeschöpft wird |
| Übertrag | offene Befunde des vorigen Vollreviews (Artefakt `qa-full-<sha>`, 90 Tage aufbewahrt); Widerlegungen aus `docs/qa/refuted-findings.enc.json` gelten wie beim Delta |
| Ausfälle | ein gescheiterter Batch macht die anderen nicht wertlos: seine Dateien stehen als „nicht geprüft", die Gesamtkosten dann als „unknown" |
| Öffentlich per Design | der Firebase-Web-API-Schlüssel in `firebase-config.json` wird geschwärzt, aber nicht als Geheimnis gemeldet (`PUBLIC_BY_DESIGN` in `config.mjs`) — sonst käme er in jedem Vollreview als kritischer Befund wieder |
| Wirkung | **entscheidet nichts.** `main` ist schon ausgeliefert; bestätigte Befunde werden auf `dev` behoben — `critical` sofort als eigener Schritt, `high` in der laufenden Phase, der Rest im nächsten passenden Schritt |

```bash
node scripts/qa/full-review.mjs --dry            # Dateien, Batches, geschätzte Kosten des aktuellen Commits — kein Aufruf
node scripts/qa/await.mjs <sha> --full           # Ergebnis eines Releases abholen (nur Läufe auf main)
```

Der Hook nach einem Push auf `main` erinnert daran, zusammen mit Security- und UX-Agent.
