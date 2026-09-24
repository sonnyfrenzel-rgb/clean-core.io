# Security-Agent — Vollaudit jeder `main`-Version

**Stand 24.09.2026 (Prüfung in Stapeln) · eingeführt mit v2.9.15 · seit 15.09.2026 mit DeepSeek V4.1 Flash · läuft bei jedem Push auf `main`, bis Sonny ihn widerruft**

Jede neue Version auf `main` bekommt ein vollständiges Sicherheitsaudit: ein CISO und
fünf Security-Consultants, **DeepSeek V4.1 Flash über OpenRouter**, als Kette von
Modellaufrufen ohne Werkzeuge. Der Bericht kommt verdichtet, belegt und auf Deutsch in
Sonnys Postfach, im Look der übrigen Clean-Core.io-Mails. Claude Code prüft jeden
Befund, entscheidet im versiegelten Register und plant bestätigte Befunde nach Priorität
in die Roadmap ein. Der Agent selbst ändert nichts.

Bis 15.09.2026 lief das Audit mit Claude Fable 5.1 in Claude Code (Ultracode, Budget
25 $). Sonny hat auf DeepSeek V4.1 Flash umgestellt, der Kosten wegen.

**Seit 24.09.2026 prüft der CISO in Stapeln** (Sonnys Entscheidung, Option A; Budget
3 → 5 $). Anlass: Beim Release v2.18.0 (81810c8, Lauf 35998405111) meldeten die
Consultants 194 Kandidaten; der eine CISO-Aufruf erreichte seine Eingabegrenze, bevor
auch nur ein Kandidat seinen Code bekam, bestätigte nichts — und die Mail sagte
„0 Befunde, Risiko niedrig", was in Wahrheit „nicht geprüft" hieß (§1a).

---

## 1. Architektur

```
 git push main ── security-audit.yml
                   │
                   ├─ scope    (keine Secrets)        nur main → Vollaudit (kein Selbsttest auf dev mehr, Entscheidung Sonny 16.09.2026)
                   │
                   ├─ audit    (nur Modellschlüssel)
                   │    1. Karte der Angriffsfläche — eigener Code, ohne Abhängigkeiten, ohne Token:
                   │       Dateien mit Domäne, API-Routen mit Auth-Markern, gefährliche Senken,
                   │       Workflow-Rechte, Firestore-Regelblöcke, CSP, npm audit
                   │    2. fünf Consultants: jede Datei ihrer Domäne vollständig, mit Zeilennummern und
                   │       geschwärzt, dazu ihre Karteneinträge — am 15.09.2026 461 Dateien in 51 Aufrufen, vier gleichzeitig; eine große Datei in Teilen
                   │    3. Kandidaten: Consultant-Befunde entdoppelt (Datei, nahe Zeilen, Befundklasse),
                   │       nach Schwere geordnet, K-001 … benannt
                   │    4. CISO prüft in Stapeln zu je 20, jeder Kandidat mit dem Code an seinen Fundstellen
                   │       (aus dem Repository gelesen), jeder Aufruf ≤ 120.000 Zeichen → verifizierte Befunde;
                   │       was nicht geprüft wurde, steht namentlich unter „Nicht verifiziert"
                   │    5. CISO-Synthese: Kurzfazit, Einstufung, Härtung — um die verifizierten Befunde
                   │    6. versiegelt mit dem ÖFFENTLICHEN Schlüssel
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
| Pipeline | `scripts/security/lib/pipeline.mjs` | wer welche Datei liest, was jeder Aufruf sieht, Entdoppeln und Prüfstapel der Kandidaten, Code-Kontext der Fundstellen, gezählte Abdeckung |
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

### 1a. Prüfung in Stapeln

| Schritt | Regel | Stelle |
|---|---|---|
| Entdoppeln | zwei Befunde sind einer, wenn sie dieselbe Befundklasse haben (CWE, OWASP API/LLM/Top 10, sonst der Kategorietext) **und** dieselbe Datei an Zeilen höchstens 10 auseinander zitieren; transitiv. Der zusammengeführte Kandidat trägt die höchste Schwere, alle Fundstellen und **alle Quellen** (welcher Consultant was meldete) | `dedupeCandidates`, `AUDIT.dedupeLineDistance` |
| Ordnen | schwerste zuerst, dann höchste Sicherheit; Namen `K-001`, `K-002`, … in dieser Reihenfolge | `planVerification` |
| Stapeln | 20 Kandidaten je Aufruf, höchstens 25 Aufrufe (500 Kandidaten) | `AUDIT.verificationBatchSize`, `maxVerificationCalls` |
| Code je Kandidat | Fenster von ±12 Zeilen um bis zu vier Fundstellen; jeder Kandidat bekommt einen gleichen Anteil der 120.000 Zeichen. Passt er nicht, schrumpfen Fenster und Textfelder schrittweise (±6, ±3, ±1, nur die Zeile) — der Code fällt nie als Erstes weg. Überlange Codezeilen werden bei 300 Zeichen gekürzt | `candidateEntry`, `verificationMessage` |
| Budget | vor jedem Prüfaufruf gegen das tatsächlich Ausgegebene: Consultants + Prüfaufrufe + dieser Aufruf im ungünstigsten Fall + die Synthese | `runVerification` über `runBounded` |
| Nicht verifiziert | was außerhalb der Aufrufgrenze, außerhalb des Budgets, nach Schwärzung über der Eingabegrenze oder in einem fehlgeschlagenen Aufruf lag, steht **namentlich** im versiegelten Bericht (`verification.notVerified`: ID, Titel, vorgeschlagene Schwere, Fundstellen, Consultants, Grund) — nie stillschweigend weggelassen, nie als „kein Befund" gezählt | `notVerifiedEntry`, `verificationLimitation` |
| Überschrift | bleiben Kandidaten ungeprüft, lautet der Betreff „nicht vollständig geprüft: X von Y Kandidaten verifiziert, Z nicht" statt „Risiko …"; die Einstufung erscheint nur als „Einstufung des verifizierten Teils" | `renderAuditMail` |

Ein Prüfaufruf, der zurückkommt, hat jeden seiner Kandidaten geprüft: was er behält, ist
ein Befund, was er fallen lässt, hielt nicht. Scheitert ein Prüfaufruf, bleiben seine
Kandidaten „nicht verifiziert"; das Log nennt nur ein Wort aus der geschlossenen Liste
(`failureReason`) und eine Zahl. Scheitern alle Prüfaufrufe **und** die Synthese, bricht
das Audit ab, statt ungeprüfte Kandidaten unter dem Namen des CISO zu versenden.

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

DeepSeek V4.1 Flash: **0,22 $ je Mio. Eingabe-Token, 0,66 $ je Mio. Ausgabe-Token**
(Fireworks über OpenRouter, 23.09.2026; bis dahin 0,15/0,60 beim billigsten Anbieter).

| Maßnahme | Wirkung |
|---|---|
| **Budget 5 $ je Audit (seit 24.09.2026, vorher 3 $) — geschätzt, vor jedem Aufruf gegen das tatsächlich Ausgegebene geprüft** | ein Aufruf, der es nach der Schätzung reißen würde, findet nicht statt; die Dateien eines Consultant-Aufrufs stehen als nicht gründlich gelesen, die Kandidaten eines Prüfaufrufs als „nicht verifiziert" im Bericht. Alle 25 Prüfaufrufe und die Synthese sind vorab reserviert, bevor ein Consultant etwas ausgibt. Harte Grenze: das Kreditlimit am OpenRouter-Schlüssel |
| Ungünstigster Fall eines Vollaudits | 60 Consultant-Aufrufe ≈ 1,33 $ + 25 Prüfaufrufe ≈ 0,86 $ + Synthese ≈ 0,01 $ = **≈ 2,20 $** — der Test hält ihn unter 80 % des Budgets. Erwartet je Release (Schätzung, nicht gemessen): rund 1 $, davon für 150–200 Kandidaten in 8–10 Prüfaufrufen etwa 0,10–0,20 $ |
| Aufteilung nach Domänen | jede Datei wird von genau einem Consultant gelesen oder, bei Testdateien, nur über die Karte geprüft |
| 100.000 Zeichen je Consultant-Aufruf, höchstens 60 Aufrufe, vier gleichzeitig; eine größere Datei wird in Teilen gelesen | gemessen am 15.09.2026: ein Aufruf mit 284.000 Zeichen lief 16,6 min und endete ohne lesbare Antwort, einer mit 100.000 Zeichen antwortete in 177 s für 0,007 $. Heute 461 Dateien in 51 Aufrufen, Schätzung im ungünstigsten Fall 0,94 $, rund eine halbe Stunde. Das Budget rechnet jeden laufenden Aufruf mit seinem ungünstigsten Fall, bis er abgerechnet ist |
| Audit nur bei `main`-Releases | kein Audit und seit dem 16.09.2026 auch kein Selbsttest je Push auf `dev` — Sicherheit wird gründlich am Release geprüft, nicht stichprobenartig am Push |
| Selbsttest an zwei Dateien mit 0,20 $ | nur noch von Hand: `SECURITY_AUDIT_MODE=self-test node scripts/security/audit.mjs` mit `OPENROUTER_API_KEY` lokal; kein Workflow löst ihn aus |

Die tatsächlichen Kosten stehen in jeder Mail im Nachweisblock; fehlt eine Angabe oder
scheiterte ein Aufruf, steht dort „unbekannt", nie 0 $.

---

## 4. Die Mail

Betreff: `Security-Audit v… (commit) — Risiko …: n kritisch · n hoch · n mittel · n niedrig`.
Bleiben Kandidaten ungeprüft: `Security-Audit v… (commit) — nicht vollständig geprüft: X von Y
Kandidaten verifiziert, Z nicht · n kritisch · …` — nie „Risiko niedrig" für einen Bericht,
dessen Rest niemand geprüft hat. Oben steht dann „Prüfstand: Nicht vollständig geprüft"
statt „Gesamtrisiko", und nach den Befunden die Liste **Nicht verifiziert** (ID `K-…`,
vorgeschlagene Schwere, Titel, Fundstellen, Consultants, Grund).
Inhalt in dieser Reihenfolge: Gesamtrisiko bzw. Prüfstand, Kurzfazit, Befunde (je Befund Fundstelle,
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
gh variable set SECURITY_AUDIT_ENABLED --body false   # stoppt Audit und Posteingang
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
| `audit` rot, „the audit did not produce a report (every CISO call failed …)" oder Log „CISO verification calls failed: http-401/http-402" | Schlüssel oder Guthaben | OpenRouter-Konto prüfen; das Log enthält keine Inhalte |
| `audit` rot, „HTTP 404 … no provider matches the data policy" | kein Anbieter des Modells erfüllt `data_collection: deny` | Anbieterliste des Modells bei OpenRouter prüfen; Modellwechsel nur als eigener Schritt |
| Bericht nennt Dateien „outside the … cost cap" oder „model call failed" | Budget oder ein einzelner Aufruf | der Rest des Audits gilt; die Dateien stehen unter Umfang und Grenzen |
| Betreff „nicht vollständig geprüft: X von Y Kandidaten verifiziert" | Prüfaufrufe gescheitert (Log: `CISO verification calls failed: <Wort> ×n`), Budget erschöpft oder mehr als 500 Kandidaten | die verifizierten Befunde gelten; die Liste „Nicht verifiziert" ist offen, nicht leer — `kritisch`/`hoch` darin von Hand an der Fundstelle prüfen (Skill `security-audit-intake`). Bei gescheiterten Aufrufen den Lauf neu starten |
| „model call failed: OpenRouter answered HTTP 429" oder „the audit did not produce a report (CISO call: … HTTP 429)" | Ratenlimit des Anbieters trotz acht Wiederholungen — mit dessen Wartezeit (bis 120 s je Versuch, also bis 16 Minuten) oder 15 s, 30 s, 60 s, dann 120 s, zusammen rund 12 Minuten (seit 15.09.2026; vorher sechs mit rund 100 s, woran die Selbsttests von e3a7853 und 5a284ee scheiterten) | Lauf neu starten (`gh run rerun <id>`); hält es an, `concurrency` in `team.mjs` als eigener Schritt senken. Anbieter-Fallback für dasselbe Modell (`allow_fallbacks`) ist bewusst aus und nur mit Sonnys Entscheidung zu ändern |
| `deliver` rot, „Resend rejected … HTTP 4xx" | Mailschlüssel oder Absenderdomain | Resend-Konto prüfen; der Bericht liegt 90 Tage als Artefakt |
| Sitzungsstart meldet „produced no readable report", alle drei Jobs grün | bis 17.09.2026: zwei `inbox.mjs --brief` gleichzeitig (ein fortgesetzter Sitzungsstart startete den Hook zweimal) luden in dasselbe Verzeichnis, und `gh run download` überschreibt keine vorhandene Datei — der Bericht von e3817ce war die ganze Zeit lesbar. Seit dem Fix lädt jeder Aufruf in ein eigenes Verzeichnis (`fetchSealed` in `lib/envelope.mjs`) | `node scripts/security/inbox.mjs <sha>`; öffnet es den Bericht, war es kein Fehler des Audits |
| Keine Mail nach einem `dev`-Push | der Workflow läuft nur auf `main` | erwartet |
| Mail mit `[SELBSTTEST]` | jemand hat den Selbsttest von Hand gestartet | Kette funktioniert; kein Audit-Ergebnis |
