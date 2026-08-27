# Backlog

Offene Punkte, jüngster Stand zuerst. Kurz gehalten: was, warum, und wie dringend.
Ältere Abschnitte bleiben stehen, solange etwas darin offen ist.

**Stand 27.08.2026 — nach v2.5.0.** Drei Modell-Reviews des gesamten Codebestands
liegen jetzt vor (Grok 4.6 am 26., GLM 5.3 und GPT-5.6-sol am 27.). Was daraus
gefixt wurde, steht im `CHANGELOG.md` unter v2.5.0. Was offen ist, steht hier.

| Punkt | Wer | Dringlichkeit |
|---|---|---|
| **V9** — veröffentlichter Fallback-Signaturschlüssel | **Entscheidung Felix** | hoch — blockiert seit zwei Releases |
| ~50 ungeprüfte Findings aus den GLM/GPT-Reviews durchgehen | gemeinsam | hoch — darunter mehrere „Blocking"/„High" |
| eslint-Gate prüft weder TypeScript noch React-Hooks | Entwicklung | hoch — aber eigener Change, siehe unten |
| Seiten-Überlauf auf schmalen Displays (`whitespace-nowrap`) | Entwicklung | mittel — eine Zeile |
| V15, V16, V18 aus dem Grok-Befund | Entwicklung | mittel |
| Die drei Tenant-Mails auf fluide Tabellen umbauen | Entwicklung | mittel |
| Benefit-Karte: Proposal 2 (der echte Business-Pyramiden-Fixture) | Entscheidung Felix | mittel |
| Review-Tooling in den Rechenstand committen | Entwicklung | niedrig |
| Zufriedenheitsumfrage, fällig 02.09. | gemeinsam | mittel — Termin steht |

---

### V9 braucht eine Entscheidung, keine Arbeit

Der Fallback-Schlüssel `dev_audit_signing_key_fallback_clean_core` steht in drei
Produktionsrouten. Er kann nicht weg, solange `tests/audit-compliance-v181.spec.ts`
mit ihm signiert und das Ergebnis als gültig behauptet — CI würde brechen, sobald
ein echter `AUDIT_SIGNING_KEY` gesetzt wird.

Zwei Wege: CI bekommt einen eigenen Schlüssel als GitHub-Secret, oder der Fallback
fliegt und der Test wird umgeschrieben. **Beides ist eine halbe Stunde Arbeit, aber
es ist deine Entscheidung**, welcher Weg.

GPT hat einen Punkt ergänzt, der die Dringlichkeit erhöht: der Produktions-Guard
ist `NODE_ENV === 'production' && !emulator`. Ein Preview-Deployment signiert also
mit der committeten Konstante — und wer die kennt, kann Audit-Packs fälschen, die
die eigene Verify-Seite als echt ausweist.

### Die ungeprüften Findings

`docs/reviews/2026-08-27-GLM-TRIAGE.md` listet 24 namentlich, die Rohdateien von
GPT enthalten weitere. **Sie sind Hypothesen, keine Befunde** — von 57 GLM-Claims
waren fünf schlicht falsch, und zwei weitere hatten recht im Defekt und unrecht im
Mechanismus.

Am billigsten zuerst: die Engine-Findings brauchen je ein ABAP-Snippet und sind in
Sekunden entschieden. Danach die Klasse, die alle drei Modelle unabhängig gefunden
haben — erfundene Zahlen in Artefakten, die beim Kunden landen. Wenn davon auch nur
die Hälfte hält, ist die Liste in `tests/no-fabricated-figures.spec.ts` deutlich zu
kurz.

### Der eslint-Gate

`eslint.config.mjs` importiert `@typescript-eslint` und `eslint-plugin-react-hooks`
und aktiviert **keins von beiden** — der `rules`-Block spreizt nur die Next-Regeln.
`npm run lint` ist ein Pflichtschritt in der Deploy-Pipeline und prüft damit weder
Typen noch Hooks. So kamen zwei Rules-of-Hooks-Verstöße durch ein grünes Gate.

Bewusst nicht in v2.5.0 mitgenommen: das Einschalten der Regeln legt einen Rückstau
frei, den man sehen und sortieren will, statt ihn in einen Release-Commit zu
quetschen.

### Was aus den Reviews methodisch zu lernen war

Die drei Reviews überlappen **etwa zu einem Drittel**. Die zwei schwersten Defekte
des Produkts fand jeweils genau ein Modell:

- **Nur GPT:** MFA per gestohlenem ID-Token übernehmbar; der Audit-Pack signierte
  Runs ohne sie zu prüfen und bevorzugte die client-schreibbare Projekt-Worklist.
- **Nur GLM:** der gefälschte Sandbox-Tester; die eingeebnete Herkunft von
  Katalog-Zuordnungen; der blinde eslint-Gate.

**Ein zweites Modell ist keine Kontrolle, sondern ein anderer Suchscheinwerfer.**
GLM leuchtet breit, GPT tief. Für die nächste Runde: beide, und getrennt triagieren.

### Benefit-Karte

Proposal 3 aus `2026-08-26-BENEFIT-NEXT-STEPS.md` ist erledigt — der Objekt-Roll-Call
steht auf der Karte und zeigt SAPs eigene Nachfolger. **Proposal 2 ist offen:** die
erfundene Kreditlimit-Geschichte durch die echte, eingefrorene Business-Pyramide aus
dem Referenzlauf ersetzen. Der handgeschriebene Satz ist inzwischen als solcher
gekennzeichnet und verlinkt die Datei zum Nachprüfen, aber generiert ist er nicht.

### Kleinigkeiten mit Ansage

- **Seiten-Überlauf:** `whitespace-nowrap` am Label „S/4HANA Sandbox Connection —
  Security Profile" in `app/page.tsx`. 340px breit, bricht nicht um, schiebt die
  Seite. Auf Windows passt es knapp, auf dem Linux-Runner nicht.
- **Tenant-Mails:** die drei verbliebenen Mails nutzen noch das `<div>`-Padding mit
  Media-Query. Mail-Clients strippen den `<style>`-Block; die zwei
  Registrierungsmails sind deshalb bereits auf fluide Tabellen umgebaut.
- **Review-Tooling:** Bundler und Consult-Skripte liegen nur im Session-Scratchpad.
  Als `scripts/ai-review.mjs` committen, wenn das zur Gewohnheit wird. Zwei Notizen:
  GLM 5.3 ist ein Reasoning-Modell und braucht `reasoning: { effort: 'low' }` plus
  echten `max_tokens`-Spielraum, sonst kommt leerer Inhalt zurück. Für Optikfragen
  ein Vision-Modell nehmen und Screenshots mitschicken — aber die Modelle sehen nur,
  was man ihnen schickt.

### Betriebsnotiz

Der Firestore-Emulator sammelt über viele Suite-Läufe Zustand an, bis
`/api/test/seed` ~29 Sekunden braucht und das 30s-Budget in `beforeAll` sprengt.
Zwei Läufe fielen heute deswegen durch. **Emulator neu starten, kein Regressions-
Verdacht.** Und lokal immer `--workers=1` — CI macht es auch so.

---

**Stand 20.08.2026, das Wichtigste zuerst:**

| Punkt | Wer | Dringlichkeit |
|---|---|---|
| LinkedIn-Post veröffentlichen (Entwürfe liegen fertig) | Felix | hoch — die Seite ist live, der Anlass verfällt |
| Artifact Registry aufräumen, 143 GB | Felix (GCP-Konsole) | hoch — Kostentreiber |
| Veraltete Cloud-Run-Dienste löschen | Felix (GCP-Konsole) | mittel |
| Zufriedenheitsumfrage vorbereiten, fällig 02.09. | gemeinsam | mittel — Termin steht |
| PDF-Drift-Check in die Pipeline hängen | Entscheidung Felix | niedrig |

---

## LinkedIn-Post zum Clean-Core-Guide

**Warum:** Die Seite `/clean-core-explained` ist live, die Community-Mail ist an
30 Empfänger raus, der Share-Bereich oben auf der Seite ist gebaut. Der Post ist
das letzte Stück der Aktivierungskette und das einzige, das noch aussteht.

**Wo:** Drei fertige Fassungen plus Notizen zu Zeitpunkt und Hashtags in
[docs/LINKEDIN-CLEAN-CORE-EXPLAINED.md](./LINKEDIN-CLEAN-CORE-EXPLAINED.md).
Empfehlung ist Version A; Version B eignet sich für einen zweiten Anlauf rund
eine Woche später.

**Bestes Zeitfenster** für ein deutsch-/europäisches SAP-Publikum: Dienstag bis
Donnerstag, 07:30–09:00 MEZ. In den ersten zwei Stunden auf jeden Kommentar
antworten — das ist bei dieser Reichweite der gesamte Verteilmechanismus.

---

## Alte Cloud-Run-Dienste und Buckets abräumen

> Vollständige Bestandsaufnahme inklusive fertiger Befehle:
> **[docs/SCREENING-AISTUDIO-ALTLASTEN.md](./SCREENING-AISTUDIO-ALTLASTEN.md)**.
> Grösster Posten dort: 676 Container-Images in europe-west1, aufgelaufen aus
> 252 nie aufgeräumten Cloud-Run-Revisionen.

**Warum:** Aus der Firebase-AI-Studio-Herkunft laufen zwei veraltete Deployments weiter,
beide öffentlich erreichbar (HTTP 200) und beide mit altem Code — sie liefern auf
`/api/health` noch HTML statt JSON, stammen also von vor der Health-Route.

| Ressource | Region | Status |
|---|---|---|
| Cloud Run `cleancore-io` | **us-west1** | live, alter Build |
| Cloud Run `clean-core` | **europe-west3** | live, alter Build |
| Bucket `ai-studio-bucket-819734065839-us-west1` | us-west1 | Altbestand |
| Bucket `run-sources-cleancore-491216-us-west1` | us-west1 | Build-Quellen |
| Bucket `run-sources-cleancore-491216-europe-west3` | europe-west3 | Build-Quellen |

Der us-west1-Dienst ist der unangenehme: eine öffentlich abrufbare Kopie der Anwendung
in Oregon, aus demselben Grund problematisch wie die Datenbank es war. Keiner der beiden
hängt an `clean-core.io` — die Domain zeigt auf europe-west1 —, aber sie sind erreichbar.

**Vor dem Löschen prüfen:** ob eine der URLs irgendwo verlinkt oder in einem Lesezeichen
gelandet ist, und ob `clean-core` in europe-west3 nicht doch einmal als Failover gedacht war.

**Dringlichkeit:** mittel. Kein akuter Schaden, aber Angriffsfläche und ein Widerspruch
zur EU-Zusage.

---

## Dev- und Test-Datenbank nach europe-west1 migrieren

**Warum:** Produktion ist am 2026-08-20 nach `clean-core-eu` (europe-west1) umgezogen.
`release` → `ai-studio-39b46c45…` und `dev` → `ai-studio-030e1ee1…` liegen weiterhin in
**us-west1** und tragen dieselbe `freeTierLimited`-Deckelung, die den Ausfall am 19.08.
verursacht hat.

**Aufwand:** gering, der Weg ist erprobt — `docs/PLAN-FIRESTORE-MIGRATION.md` plus die
Skripte unter `scripts/firestore-*`. Enterprise-Edition beim Anlegen nicht vergessen,
sonst scheitert der Import an der 1500-Byte-Indexgrenze.

**Dringlichkeit:** niedrig. Es sind Testdaten, und ein Ausfall dort trifft niemanden.

---

## Restliche CI-Testaccounts löschen

**Warum:** Der Lauf vom 19.08. kam bis etwa 15 von 125 Accounts, dann war das Tageslimit
erreicht. In `users` liegen weiterhin ~110 Accounts aus Pipeline-Läufen.

**Womit:** `npx tsx scripts/cleanup-test-accounts.ts --apply` — idempotent, macht einfach
weiter. Auf `clean-core-eu` ohne Deckelung unkritisch.

**Nebenbefund:** Sieben Projekte sind bereits verwaist (ihr Besitzer wurde gelöscht, die
Projekte nicht, weil die Kaskade mittendrin abbrach). Die Migration hat sie originalgetreu
mitgenommen. Beim Aufräumen mit erledigen.

**Dringlichkeit:** niedrig, aber es wächst mit jedem Pipeline-Lauf weiter.

---

## Lesezahl im Admin-Panel senken

**Warum:** `components/admin/UsageQuotaPanel.tsx` hält einen `onSnapshot` über die
**gesamte** `users`-Collection offen. Solange der Tab offen ist, erzeugt jede Änderung an
irgendeinem Nutzerdokument erneut Lesevorgänge über alle Dokumente.

Dazu feuert `hooks/useUserProfile.ts` bei jedem Mount **beide** Wege — erst `getDoc`, dann
zusätzlich `onSnapshot` auf dasselbe Dokument. Das war eine Absicherung gegen hängende
Streams auf CI-Runnern, verdoppelt aber die Lesevorgänge auf praktisch jeder Seite.

**Dringlichkeit:** nach der Migration deutlich geringer — `clean-core-eu` hat keine
Tagesdeckelung mehr. Bleibt trotzdem unnötiger Verbrauch.

---

## Zufriedenheitsumfrage

**Warum:** In der Community-Mail vom 19.08. für „in vierzehn Tagen" angekündigt, also
**fällig am 2026-09-02**. Die Mail nennt bereits die Kernfrage: wer noch nichts gestartet
hat — was hat ihn davon abgehalten.

**Kontext:** Zum Zeitpunkt des Versands hatten 20 von 30 Accounts nie ein Projekt angelegt.
Ob die Starter-Beispiele daran etwas geändert haben, lässt sich im Admin-Tab an der Spalte
„Objekte" ablesen.

**Dringlichkeit:** terminiert.

---

## PDF-Drift-Check in die Pipeline hängen

**Warum:** `public/clean-core-explained.pdf` ist ein eingecheckter Build-Artefakt.
Es wird bewusst nicht pro Anfrage erzeugt — ein Headless-Chromium im Cloud-Run-Image
kostet hunderte Megabyte für ein Dokument, das sich vielleicht monatlich ändert.
Der Preis dafür ist die Möglichkeit stiller Drift: jemand ändert ein Kapitel, die
Webseite ist aktuell, und das PDF, das die Leute weiterreichen, sagt weiter das Alte.

Der Prüfschritt existiert bereits und braucht weder Browser noch Server:

```bash
npm run build:guide-pdf -- --check
```

Er hasht `lib/clean-core-guide.ts`, `lib/clean-core-capabilities.ts` und
`app/clean-core-explained-print/page.tsx` gegen `public/clean-core-explained.pdf.sha256`
und endet mit Exit-Code 1, wenn sie auseinanderlaufen.

**Was zu tun ist:** eine Stufe im `validate`-Job von `.github/workflows/deploy.yml`,
zwischen Lint und Build.

**Bewusst offen gelassen:** die Stufe blockiert dann jeden Deploy, bei dem Inhalt
geändert, aber das PDF nicht neu erzeugt wurde. Das ist der Zweck — aber es ist eine
Entscheidung, die getroffen werden sollte, statt sie nebenbei einzubauen.

**Dringlichkeit:** niedrig, solange Inhaltsänderungen am Guide selten sind.

---

## ~~Seitenzahl im Share-Bereich wird nicht mitgezogen~~

**Erledigt am 20.08.2026** — die Seitenzahl steht nicht mehr in der Kachel. Sie
kam aus derselben Überarbeitung, in der der Mailversand entfernt wurde.
