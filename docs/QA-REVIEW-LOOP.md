# QA-Agent — die Review-Schleife auf `dev`

**Stand 15.09.2026 · eingeführt mit v2.9.12 · läuft ab sofort bei jedem Push auf `dev`, bis Sonny sie widerruft**

Jeder neue Stand auf `dev` bekommt zwei Prüfungen, ohne dass jemand sie anstößt:
ein **Delta-Review** durch ein fest eingestelltes Modell (GPT-6 Astra über
OpenRouter) und einen **Smoke-Check** der Revision, die derselbe Push deployt hat.
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
                │   3. Vorprüfung ohne Token (Risiko, Test-Signale,       │
                │      Abnahmekriterien, Geheimnis-Schwärzung)            │
                │   4. Batches nach Risiko, Kostendeckel                  │
                │   5. GPT-6 Astra, strukturierte Antwort, keine Tools    │
                │   6. Bericht versiegeln → Artefakt qa-review-<sha>      │
                │                                                         ▼
                └── job smoke ── wartet auf deploy.yml desselben Commits ─┘
                    prüft /api/health (Commit), Routen, Security-Header
                    versiegeln → Artefakt qa-smoke-<sha>

 Claude Code (lokal) ── node scripts/qa/await.mjs <sha>
                    lädt beide Artefakte, entsiegelt nach .qa-review/ (git-ignoriert)
                    Exit 0 = go · 3 = Arbeit · 2 = kein Ergebnis
                    → prüfen → beheben / widerlegen → push dev → nächste Runde
```

| Baustein | Datei | Aufgabe |
|---|---|---|
| Konfiguration | `scripts/qa/lib/config.mjs` | Modell, Budgets, Pfadfilter, Risikoregeln, Smoke-Ziele — die einzige Stelle für all das |
| Delta | `scripts/qa/lib/git-delta.mjs` | Bereich, geänderte Dateien, Hunks mit 12 Zeilen Kontext, Aufrufer geänderter Symbole außerhalb des Deltas |
| Vorprüfung | `scripts/qa/lib/triage.mjs` | Risiko-Tags, Test-Schwächungssignale, zitierte Abnahmekriterien, „Code ohne Test" |
| Schwärzung | `scripts/qa/lib/redact.mjs` | Schlüsselmuster vor dem Versand ersetzen, Treffer als kritischen Befund melden |
| Packen | `scripts/qa/lib/pack.mjs` | riskanteste Dateien zuerst, Kostendeckel vor dem ersten Aufruf, Rest als „nicht geprüft" benannt |
| Prompt | `scripts/qa/lib/prompt.mjs` + `docs/qa/reviewer-brief.md` | Antwortschema; Rolle, Prüfliste und Projektregeln als lesbares Dokument |
| Modellaufruf | `scripts/qa/lib/openrouter.mjs` | ein Endpunkt, keine Tools, keine Fallback-Modelle, `data_collection: deny`, Retry nur bei 408/429/5xx |
| Bericht | `scripts/qa/lib/report.mjs` | Fingerabdrücke, Übertrag offener Befunde, widerlegte ausblenden, öffentliche Zeile ohne Inhalt |
| Siegel | `scripts/qa/lib/crypto.mjs`, `lib/store.mjs` | AES-256-GCM unter `QA_REVIEW_KEY` |
| Einstiege | `scripts/qa/review.mjs`, `smoke.mjs`, `await.mjs`, `refute.mjs` | CI-Review, CI-Smoke, lokales Abholen, Widerlegen |
| Workflow | `.github/workflows/qa-review.yml` | Auslöser, Rechte, Widerruf, Artefakte |
| Leitplanken im Test | `tests/qa-review-guard.spec.ts` | 23 Tests: Siegel, keine Leaks, nur Lesen, Kostendeckel, Delta, Bericht |
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
| Unbegrenzt Geld ausgeben | Kostendeckel je Review, geprüft vor dem ersten Aufruf |

**Warum keine Zahlen im Log:** Das Repository und seine Actions-Logs sind
öffentlich, und die dev-Revision ist öffentlich erreichbar. „1 critical auf dev" in
einem öffentlichen Log sagt einem Angreifer, wann sich das Hinsehen lohnt.

**Prompt-Injection:** Alles im Delta ist für das Modell Daten, keine Anweisung (steht
im Brief). Selbst ein erfolgreicher Versuch kann nur einen falschen Befund erzeugen —
und kein Befund wird ungeprüft umgesetzt (§4).

---

## 3. Kosten

Modell GPT-6 Astra, Listenpreis bei OpenRouter am 15.09.2026: **10 $ je Mio.
Eingabe-Token, 50 $ je Mio. Ausgabe-Token.**

| Maßnahme | Wirkung |
|---|---|
| Nur das Delta seit dem letzten *geprüften* Commit | kein Vollreview; ein abgebrochener Lauf verliert nichts |
| Kein Modellaufruf ohne Code im Delta | reine Doku-/Asset-Pushes kosten 0 $ |
| 12 Zeilen Kontext je Hunk, höchstens 15 Symbole × 3 Aufrufer | Kontext statt ganzer Dateien |
| Reasoning `medium`, nur bei Sicherheit/Trust-Chain/CI `high` | teures Denken dort, wo ein Fehler teuer ist |
| Höchstens 2 Aufrufe, 200.000 Zeichen und 12.000 Ausgabe-Token je Aufruf | harte Obergrenze |
| **Kostendeckel 2,50 $ je Review**, vor dem ersten Aufruf geschätzt | darüber wird der risikoärmste Batch gestrichen und als „nicht geprüft" benannt |
| Tatsächliche Kosten aus OpenRouters Usage-Datensatz | stehen in jedem Bericht und im Log |

Gemessen im Trockenlauf (`--dry`): ein typischer Roadmap-Schritt 0,65–0,70 $
geschätzt; 16 Commits auf einmal 2,33 $ mit 26 benannten, nicht geprüften Dateien.
Die Schätzung rechnet jede Ausgabe voll — die tatsächlichen Kosten liegen darunter.
Empfehlung zusätzlich: ein Monatslimit direkt am OpenRouter-Schlüssel.

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
8. **`main` nur auf Sonnys Go**, und erst nach einer sauberen Runde.

`low` hält die Schleife nicht auf. Günstige `low`-Befunde werden mitgenommen, der
Rest steht im Schrittbericht.

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
| Job `review` rot, „OpenRouter answered HTTP 402/401" | Guthaben oder Schlüssel | OpenRouter-Konto prüfen; der Retry greift nur bei 408/429/5xx |
| Job `review` rot, „QA_REVIEW_KEY is missing" | Secret fehlt | Secret setzen; ohne Schlüssel wird nie unversiegelt geschrieben |
| Smoke „new revision serving: no" | Deploy lief, aber `/api/health` meldet einen anderen Commit | Cloud-Run-Revision prüfen (`gcloud run services describe clean-core-dev --region=europe-west1 --project=cleancore-491216`) |
| Bericht nennt „NOT REVIEWED" | Delta über dem Budget | kleiner schneiden oder den Bereich gezielt per `workflow_dispatch` nachprüfen |
| Ein Befund kommt nach Widerlegung wieder | Titel geändert → neuer Fingerabdruck | erneut widerlegen; die Begründung verweist auf den früheren |
