# Security-Agent — Vollaudit jeder `main`-Version

**Stand 15.09.2026 · eingeführt mit v2.9.15 · seit 15.09.2026 mit DeepSeek V4.1 Flash · läuft bei jedem Push auf `main`, bis Sonny ihn widerruft**

Jede neue Version auf `main` bekommt ein vollständiges Sicherheitsaudit: ein CISO und
fünf Security-Consultants, **DeepSeek V4.1 Flash über OpenRouter**, als Kette von
Modellaufrufen ohne Werkzeuge. Der Bericht kommt verdichtet, belegt und auf Deutsch in
Sonnys Postfach, im Look der übrigen Clean-Core.io-Mails. Claude Code prüft jeden
Befund, entscheidet im versiegelten Register und plant bestätigte Befunde nach Priorität
in die Roadmap ein. Der Agent selbst ändert nichts.

Bis 15.09.2026 lief das Audit mit Claude Fable 5.1 in Claude Code (Ultracode, Budget
25 $). Sonny hat auf DeepSeek V4.1 Flash umgestellt, der Kosten wegen: Ein Vollaudit
schätzt sich jetzt auf höchstens rund 0,95 $.

---

## 1. Architektur

```
 git push main ── security-audit.yml
                   │
                   ├─ scope    (keine Secrets)        main → Vollaudit · dev → Selbsttest nur, wenn der Agent selbst geändert wurde
                   │
                   ├─ audit    (nur Modellschlüssel)
                   │    1. Karte der Angriffsfläche — eigener Code, ohne Abhängigkeiten, ohne Token:
                   │       Dateien mit Domäne, API-Routen mit Auth-Markern, gefährliche Senken,
                   │       Workflow-Rechte, Firestore-Regelblöcke, CSP, npm audit
                   │    2. fünf Consultants: jede Datei ihrer Domäne vollständig, mit Zeilennummern und
                   │       geschwärzt, dazu ihre Karteneinträge — am 15.09.2026 461 Dateien in 51 Aufrufen, vier gleichzeitig; eine große Datei in Teilen
                   │    3. CISO: Zusammenfassung der Karte, gezählte Abdeckung, jeder Consultant-Befund
                   │       mit dem Code an seinen Fundstellen, aus dem Repository gelesen → Bericht (Schema)
                   │    4. versiegelt mit dem ÖFFENTLICHEN Schlüssel
                   │
                   └─ deliver  (privater Schlüssel + Resend, kein Modell)
                        öffnen · deutsch rendern · Mail an den Administrator

 Claude Code (lokal) ── node scripts/security/inbox.mjs <sha>
                        öffnen · Befunde zeigen, die das Register noch nicht kennt
                        → prüfen → register.mjs accept/refute/risk/fixed → Roadmap §12 (nur IDs)
```

| Baustein | Datei | Aufgabe |
|---|---|---|
| Team und Grenzen | `scripts/security/lib/team.mjs` | Modell, Preise, Budget, Consultants mit ihren Domänen, Schemata — die einzige Stelle |
| Pipeline | `scripts/security/lib/pipeline.mjs` | wer welche Datei liest, was jeder Aufruf sieht, Code-Kontext der Fundstellen, gezählte Abdeckung |
| CISO-Anweisung | `docs/security/ciso-brief.md` | Methode, aktuelle Angriffsmuster, Schweregrade, Berichtsaufbau |
| Angriffsflächen-Karte | `scripts/security/lib/surface.mjs` | deterministisch, nur `node:`-Module |
| Audit | `scripts/security/audit.mjs` | Karte, Consultant-Aufrufe, CISO-Aufruf, Bericht versiegeln |
| Modellaufruf, Schwärzung | `scripts/qa/lib/openrouter.mjs`, `redact.mjs` | dieselben wie beim QA-Agenten: keine Tools, keine Fallback-Modelle, `data_collection: deny` |
| Siegel | `scripts/security/lib/envelope.mjs`, `docs/security/audit-public-key.pem` | RSA-OAEP-SHA256 + AES-256-GCM |
| Mail | `scripts/security/lib/mail.mjs`, `mail-shell.mjs`, `deliver.mjs` | Clean-Core.io-Layout, responsiv, jeder Modelltext escaped |
| Posteingang | `scripts/security/inbox.mjs` | abholen, öffnen, Unbewertetes zeigen; `--brief` beim Sitzungsstart |
| Register | `scripts/security/register.mjs`, `lib/register.mjs`, `docs/security/register.enc.json` | Entscheidungen, versiegelt |
| Workflow | `.github/workflows/security-audit.yml` | drei Jobs, drei Vertrauensstufen |
| Leitplanken im Test | `tests/security-audit-guard.spec.ts` | keine Werkzeuge, Schlüsseltrennung, keine Leaks, Budget, Pipeline, Mail-Look |
| Arbeitsweise von Claude | `.claude/skills/security-audit-intake/SKILL.md` | wird nur geladen, wenn ein Bericht da ist |

---

## 2. Leitplanken

**Das Modell hat keine Werkzeuge.** Es bekommt Text und gibt strukturiertes JSON zurück.
Was es sieht, stellt die Pipeline zusammen: den Code einer Domäne für einen Consultant, die
Befunde mit ihrem Code für den CISO. Eine Fundstelle, die das Modell nennt, liest die
Pipeline nur nach, wenn die Datei in der Karte steht — nie einen absoluten Pfad, nie etwas
außerhalb des Repositorys, nie eine ausgeschlossene Datei.

**Nichts geht ungeschwärzt hinaus.** Jeder Text passiert die Schwärzung des QA-Agenten,
bevor er den Runner verlässt; ein Treffer wird als kritischer Befund gemeldet, ohne seinen
Wert. Der Firebase-Web-Schlüssel ist öffentlich per Design und wird nur geschwärzt.

**Drei Jobs, drei Vertrauensstufen.**

| Job | Hält | Kann | Kann nicht |
|---|---|---|---|
| `scope` | nichts | entscheiden, ob und wie auditiert wird | — |
| `audit` | OpenRouter-Schlüssel, öffentlichen Schlüssel | Code senden, versiegeln | einen Bericht öffnen, mailen, schreiben |
| `deliver` | privaten Schlüssel, Resend-Schlüssel | öffnen, rendern, mailen | ein Modell ausführen |

Ein manipulierter oder prompt-injizierter Audit-Job hat also nichts zu lesen außer dem
Lauf, den er gerade macht — frühere Berichte kann er nicht öffnen.

**Nichts wird öffentlich.** Repository und Actions-Logs sind öffentlich. Das Log trägt
Aufrufe, Fehlschläge und Kosten, nie einen Befund. Der Bericht verlässt den Runner nur
versiegelt. Das Register ist versiegelt; die Roadmap zeigt nur ID, Schwere, Priorität,
Schritt und Status. Titel, Dateien und Beschreibungen unbehobener Befunde erscheinen in
keiner öffentlichen Datei.

**Kein Fremdcode neben Schlüsseln.** Audit- und Mail-Job laufen ohne `npm ci` und führen
nur eigenen Code aus. Deshalb spiegelt `mail-shell.mjs` die Mail-Shell aus
`lib/email-layout.ts` — ein Test hält beide gleich.

**Prompt-Injection.** Alles im Repository ist Daten; ein Steuerungsversuch ist selbst ein
Befund (CISO-Anweisung). Selbst ein erfolgreicher Versuch kann nur einen falschen Befund
erzeugen — und keiner wird ungeprüft übernommen.

**Anbieter.** OpenRouter leitet nur an Anbieter ohne Speicherung oder Training weiter
(`data_collection: deny`) und nie an ein anderes Modell (`allow_fallbacks: false`). Der
Code des Repositorys ist öffentlich; was ein Audit über seine Schwächen schreibt, ist es
nicht — deshalb gilt die Bedingung auch hier.

---

## 3. Kosten

DeepSeek V4.1 Flash: **0,15 $ je Mio. Eingabe-Token, 0,60 $ je Mio. Ausgabe-Token**
(OpenRouter, 15.09.2026).

| Maßnahme | Wirkung |
|---|---|
| **Budget 3 $ je Audit — geschätzt, vor jedem Aufruf gegen das tatsächlich Ausgegebene geprüft** | ein Aufruf, der es nach der Schätzung reißen würde, findet nicht statt; seine Dateien stehen als nicht gründlich gelesen im Bericht. Der CISO-Aufruf ist vorab reserviert, ein Bericht entsteht immer. Harte Grenze: das Kreditlimit am OpenRouter-Schlüssel |
| Aufteilung nach Domänen | jede Datei wird von genau einem Consultant gelesen oder, bei Testdateien, nur über die Karte geprüft |
| 100.000 Zeichen je Consultant-Aufruf, höchstens 60 Aufrufe, vier gleichzeitig; eine größere Datei wird in Teilen gelesen | gemessen am 15.09.2026: ein Aufruf mit 284.000 Zeichen lief 16,6 min und endete ohne lesbare Antwort, einer mit 100.000 Zeichen antwortete in 177 s für 0,007 $. Heute 461 Dateien in 51 Aufrufen, Schätzung im ungünstigsten Fall 0,94 $, rund eine halbe Stunde. Das Budget rechnet jeden laufenden Aufruf mit seinem ungünstigsten Fall, bis er abgerechnet ist |
| Audit nur bei `main`-Releases | kein Audit je Push auf `dev` |
| Selbsttest an zwei Dateien mit 0,20 $ | nur wenn der Agent selbst auf `dev` geändert wurde |

Die tatsächlichen Kosten stehen in jeder Mail im Nachweisblock; fehlt eine Angabe oder
scheiterte ein Aufruf, steht dort „unbekannt", nie 0 $.

---

## 4. Die Mail

Betreff: `Security-Audit v… (commit) — Risiko …: n kritisch · n hoch · n mittel · n niedrig`.
Inhalt in dieser Reihenfolge: Gesamtrisiko, Kurzfazit, Befunde (je Befund Fundstelle,
Beschreibung, Voraussetzung, Auswirkung, Beleg, Empfehlung, **Prüfen vor dem Fix**,
Sicherheit der Einschätzung), Härtung P1–P3, was gut ist, Umfang und Grenzen (gezählt,
nicht geschätzt), Nachweis (Version, voller Commit, Modell, Aufrufe, Dauer, Kosten,
**SHA-256 des versiegelten Berichts**).

**Nachweisbar:** Der SHA-256 in der Mail gehört zu genau dem Artefakt des Laufs;
`node scripts/security/inbox.mjs <sha>` öffnet dasselbe Artefakt und zeigt denselben
Bericht.

---

## 5. Was Claude Code mit dem Bericht tut

Verbindlich im Skill `security-audit-intake`; die Regeln:

1. Abholen nach jedem Push auf `main` (Hook) oder wenn der Sitzungsstart unbewertete
   Befunde meldet.
2. Jeden Befund an der zitierten Stelle prüfen: bestätigt, widerlegt oder — nur auf
   Sonnys Entscheidung — akzeptiertes Risiko.
3. Entscheidung im versiegelten Register festhalten.
4. Einplanen: **kritisch** sofort als eigener Patch-Schritt vor allem anderen; **hoch** in
   die laufende Phase; **mittel** in den nächsten passenden Schritt; **niedrig** neben
   verwandter Arbeit. Öffentlich nur die ID-Tabelle in `docs/ROADMAP.md` §12.
5. Beheben wie jeden Schritt: mit Test, QA-Schleife, `main` auf Sonnys Go. Das nächste
   Audit zeigt, ob der Fix hält.

---

## 6. Widerruf und Einrichtung

```bash
gh variable set SECURITY_AUDIT_ENABLED --body false   # stoppt Audit, Selbsttest und den Posteingang
gh variable delete SECURITY_AUDIT_ENABLED             # wieder an
```

| Geheimnis | Wo | Zweck |
|---|---|---|
| `OPENROUTER_API_KEY` | GitHub-Secret (vorhanden, auch vom QA- und UX-Agenten genutzt) | Modellaufrufe des Audit-Jobs |
| `SECURITY_AUDIT_PRIVATE_KEY` | GitHub-Secret, `.env.local` | Berichte und Register öffnen |
| `RESEND_API_KEY` | GitHub-Secret (vorhanden) | Mailversand |
| öffentlicher Schlüssel | `docs/security/audit-public-key.pem` | versiegeln |

Das Secret `SECURITY_AGENT` (Anthropic-Schlüssel) wird seit der Umstellung nicht mehr
gelesen; der Schlüssel kann in der Anthropic-Konsole widerrufen und das Secret gelöscht
werden.

**Schlüssel rotieren:** neues Paar erzeugen, öffentlichen Teil committen, privaten in
Secret und `.env.local`; das Register mit dem alten Schlüssel öffnen und neu versiegeln.
Alte Berichte bleiben nur mit dem alten Schlüssel lesbar.

---

## 7. Fehlerbilder

| Symptom | Ursache | Vorgehen |
|---|---|---|
| `audit` rot, „CISO call: OpenRouter answered HTTP 401/402" | Schlüssel oder Guthaben | OpenRouter-Konto prüfen; das Log enthält keine Inhalte |
| `audit` rot, „HTTP 404 … no provider matches the data policy" | kein Anbieter des Modells erfüllt `data_collection: deny` | Anbieterliste des Modells bei OpenRouter prüfen; Modellwechsel nur als eigener Schritt |
| Bericht nennt Dateien „outside the … cost cap" oder „model call failed" | Budget oder ein einzelner Aufruf | der Rest des Audits gilt; die Dateien stehen unter Umfang und Grenzen |
| „model call failed: OpenRouter answered HTTP 429" oder „the audit did not produce a report (CISO call: … HTTP 429)" | Ratenlimit des Anbieters trotz acht Wiederholungen — mit dessen Wartezeit (bis 120 s je Versuch, also bis 16 Minuten) oder 15 s, 30 s, 60 s, dann 120 s, zusammen rund 12 Minuten (seit 15.09.2026; vorher sechs mit rund 100 s, woran die Selbsttests von e3a7853 und 5a284ee scheiterten) | Lauf neu starten (`gh run rerun <id>`); hält es an, `concurrency` in `team.mjs` als eigener Schritt senken. Anbieter-Fallback für dasselbe Modell (`allow_fallbacks`) ist bewusst aus und nur mit Sonnys Entscheidung zu ändern |
| `deliver` rot, „Resend rejected … HTTP 4xx" | Mailschlüssel oder Absenderdomain | Resend-Konto prüfen; der Bericht liegt 90 Tage als Artefakt |
| Keine Mail nach einem `dev`-Push | `scope` hat „skip" entschieden — der Agent wurde nicht geändert | erwartet |
| Mail mit `[SELBSTTEST]` | der Agent wurde auf `dev` geändert | Kette funktioniert; kein Audit-Ergebnis |
