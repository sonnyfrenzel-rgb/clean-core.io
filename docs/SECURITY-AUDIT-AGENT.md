# Security-Agent — Vollaudit jeder `main`-Version

**Stand 15.09.2026 · eingeführt mit v2.9.15 · läuft bei jedem Push auf `main`, bis Sonny ihn widerruft**

Jede neue Version auf `main` bekommt ein vollständiges Sicherheitsaudit: ein CISO und
fünf Security-Consultants — Claude Fable 5.1 in Claude Code, Ultracode, ausschließlich
lesend. Der Bericht kommt verdichtet, belegt und auf Deutsch in Sonnys Postfach, im
Look der übrigen Clean-Core.io-Mails. Claude Code prüft jeden Befund, entscheidet im
versiegelten Register und plant bestätigte Befunde nach Priorität in die Roadmap ein.
Der Agent selbst ändert nichts.

---

## 1. Architektur

```
 git push main ── security-audit.yml
                   │
                   ├─ scope    (keine Secrets)        main → Vollaudit · dev → Selbsttest nur, wenn der Agent selbst geändert wurde
                   │
                   ├─ audit    (nur Modellschlüssel)
                   │    1. Karte der Angriffsfläche — eigener Code, ohne Abhängigkeiten, ohne Token:
                   │       415 Dateien mit Domäne, 38 API-Routen mit Auth-Markern, gefährliche Senken,
                   │       Workflow-Rechte, Firestore-Regelblöcke, CSP, npm audit
                   │    2. Claude Code headless: --restricted, --tools Read Grep Glob Agent Workflow,
                   │       Ultracode, fünf Consultants mit Read/Grep/Glob, --max-budget-usd 25
                   │    3. strukturierter Bericht (Schema), versiegelt mit dem ÖFFENTLICHEN Schlüssel
                   │
                   └─ deliver  (privater Schlüssel + Resend, kein Modell)
                        öffnen · deutsch rendern · Mail an den Administrator

 Claude Code (lokal) ── node scripts/security/inbox.mjs <sha>
                        öffnen · Befunde zeigen, die das Register noch nicht kennt
                        → prüfen → register.mjs accept/refute/risk/fixed → Roadmap §12 (nur IDs)
```

| Baustein | Datei | Aufgabe |
|---|---|---|
| Team und Grenzen | `scripts/security/lib/team.mjs` | Modell, CLI-Version, Werkzeuge, Verbote, Budget, Consultants, Berichtsschema — die einzige Stelle |
| CISO-Anweisung | `docs/security/ciso-brief.md` | Methode, aktuelle Angriffsmuster, Schweregrade, Berichtsaufbau |
| Angriffsflächen-Karte | `scripts/security/lib/surface.mjs` | deterministisch, nur `node:`-Module |
| Audit | `scripts/security/audit.mjs` | Karte schreiben, CLI starten, Bericht versiegeln |
| Siegel | `scripts/security/lib/envelope.mjs`, `docs/security/audit-public-key.pem` | RSA-OAEP-SHA256 + AES-256-GCM |
| Mail | `scripts/security/lib/mail.mjs`, `mail-shell.mjs`, `deliver.mjs` | Clean-Core.io-Layout, responsiv, jeder Modelltext escaped |
| Posteingang | `scripts/security/inbox.mjs` | abholen, öffnen, Unbewertetes zeigen; `--brief` beim Sitzungsstart |
| Register | `scripts/security/register.mjs`, `lib/register.mjs`, `docs/security/register.enc.json` | Entscheidungen, versiegelt |
| Workflow | `.github/workflows/security-audit.yml` | drei Jobs, drei Vertrauensstufen |
| Leitplanken im Test | `tests/security-audit-guard.spec.ts` | nur Lesen, Schlüsseltrennung, keine Leaks, Mail-Look und 320-px-Darstellung |
| Arbeitsweise von Claude | `.claude/skills/security-audit-intake/SKILL.md` | wird nur geladen, wenn ein Bericht da ist |

---

## 2. Leitplanken

**Der Agent kann nur lesen.** Für ihn existieren genau die Werkzeuge Read, Grep, Glob,
Agent und Workflow (`--tools`), zusätzlich verboten sind Bash, PowerShell, Edit, Write,
NotebookEdit, WebFetch und WebSearch (`--disallowedTools` und `permissions.deny`).
`--restricted` entfernt Werkzeuge, die Code ausführen, ignoriert Settings-Dateien und
begrenzt Dateizugriffe auf das Arbeitsverzeichnis; `--strict-mcp-config` schließt MCP
aus. Die Consultants haben nur Read, Grep und Glob.

**Drei Jobs, drei Vertrauensstufen.**

| Job | Hält | Kann | Kann nicht |
|---|---|---|---|
| `scope` | nichts | entscheiden, ob und wie auditiert wird | — |
| `audit` | Anthropic-Schlüssel, öffentlichen Schlüssel | lesen, versiegeln | einen Bericht öffnen, mailen, schreiben |
| `deliver` | privaten Schlüssel, Resend-Schlüssel | öffnen, rendern, mailen | ein Modell ausführen |

Ein manipulierter oder prompt-injizierter Audit-Job hat also nichts zu lesen außer dem
Lauf, den er gerade macht — frühere Berichte kann er nicht öffnen.

**Nichts wird öffentlich.** Repository und Actions-Logs sind öffentlich. Das Transkript
der CLI geht in Dateien auf dem Runner, nie ins Log; das Log trägt Statusfelder und
Zahlen. Der Bericht verlässt den Runner nur versiegelt. Das Register ist versiegelt; die
Roadmap zeigt nur ID, Schwere, Priorität, Schritt und Status. Titel, Dateien und
Beschreibungen unbehobener Befunde erscheinen in keiner öffentlichen Datei.

**Kein Fremdcode neben Schlüsseln.** Der Audit-Job führt nur eigenen Code und die
gepinnte Claude-Code-Version aus; der Mail-Job läuft ohne `npm ci`. Deshalb spiegelt
`mail-shell.mjs` die Mail-Shell aus `lib/email-layout.ts` — ein Test hält beide gleich.

**Prompt-Injection.** Alles im Repository ist Daten; ein Steuerungsversuch ist selbst ein
Befund (CISO-Anweisung). Selbst ein erfolgreicher Versuch kann nur einen falschen Befund
erzeugen — und keiner wird ungeprüft übernommen.

---

## 3. Kosten

Claude Fable 5.1: **10 $ je Mio. Eingabe-Token, 50 $ je Mio. Ausgabe-Token**, Cache-Lesen
0,25 $ (Anthropic, Stand 15.09.2026).

| Maßnahme | Wirkung |
|---|---|
| **`--max-budget-usd 25`** je Audit | harte Grenze, von der CLI selbst durchgesetzt |
| Karte der Angriffsfläche vorab, ohne Token | die Consultants lesen gezielt statt alles |
| Aufteilung nach Domänen | jede Datei wird von genau einer Domäne gründlich gelesen oder per Muster geprüft |
| Audit nur bei `main`-Releases | kein Audit je Push auf `dev` |
| Selbsttest mit Haiku 4.5 und 1 $ | nur wenn der Agent selbst auf `dev` geändert wurde |

Die tatsächlichen Kosten stehen in jeder Mail im Nachweisblock.

---

## 4. Die Mail

Betreff: `Security-Audit v… (commit) — Risiko …: n kritisch · n hoch · n mittel · n niedrig`.
Inhalt in dieser Reihenfolge: Gesamtrisiko, Kurzfazit, Befunde (je Befund Fundstelle,
Beschreibung, Voraussetzung, Auswirkung, Beleg, Empfehlung, **Prüfen vor dem Fix**,
Sicherheit der Einschätzung), Härtung P1–P3, was gut ist, Umfang und Grenzen, Nachweis
(Version, voller Commit, Modell, Dauer, Kosten, **SHA-256 des versiegelten Berichts**).

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
| `SECURITY_AGENT` | GitHub-Secret | Anthropic-Schlüssel für den Audit-Job |
| `SECURITY_AUDIT_PRIVATE_KEY` | GitHub-Secret, `.env.local` | Berichte und Register öffnen |
| `RESEND_API_KEY` | GitHub-Secret (vorhanden) | Mailversand |
| öffentlicher Schlüssel | `docs/security/audit-public-key.pem` | versiegeln |

**Schlüssel rotieren:** neues Paar erzeugen, öffentlichen Teil committen, privaten in
Secret und `.env.local`; das Register mit dem alten Schlüssel öffnen und neu versiegeln.
Alte Berichte bleiben nur mit dem alten Schlüssel lesbar.

---

## 7. Fehlerbilder

| Symptom | Ursache | Vorgehen |
|---|---|---|
| `audit` rot, „no result record" | CLI nicht gestartet (npx, Netz) | `gh run view <id> --log-failed`; das Log enthält keine Inhalte |
| `audit` rot, „subtype=error_max_budget_usd" | Budget erreicht, bevor ein Bericht entstand | Budget in `team.mjs` als eigener Schritt anpassen oder die CISO-Anweisung straffen |
| `audit` rot, „api_error_status=401/403" | Schlüssel `SECURITY_AGENT` ungültig oder ohne Freigabe für Fable 5.1 | Schlüssel prüfen; Fable 5.1 verlangt 30 Tage Datenaufbewahrung beim Konto |
| `deliver` rot, „Resend rejected … HTTP 4xx" | Mailschlüssel oder Absenderdomain | Resend-Konto prüfen; der Bericht liegt 90 Tage als Artefakt |
| Keine Mail nach einem `dev`-Push | `scope` hat „skip" entschieden — der Agent wurde nicht geändert | erwartet |
| Mail mit `[SELBSTTEST]` | der Agent wurde auf `dev` geändert | Kette funktioniert; kein Audit-Ergebnis |
