# Backlog

Offene Punkte, jüngster Stand zuerst. Kurz gehalten: was, warum, und wie dringend.
Ältere Abschnitte bleiben stehen, solange etwas darin offen ist.

**Stand 31.08.2026 — nach v2.7.1.** Der Tag ging an das Lint-Gate und an das,
was es durchgelassen hat. Die Regeln sind an, die Fehler auf null, 677 Warnungen
sind mit `--max-warnings` festgenagelt. Sechs echte Defekte lagen darunter; einer
davon war ein Knopf, dessen Wirkung nur behauptet war. Dazu der Seitenüberlauf —
und der neue Guard fand zwei Ursachen mehr als die eine, die im Backlog stand.

**Als Nächstes:**

| # | Punkt | Wer | Warum jetzt |
|---|---|---|---|
| 1 | **Zufriedenheitsumfrage** — versprochen zum **02.09.**, also übermorgen | **gemeinsam** | Termin steht, und die Frage „kam die Willkommensmail an?" gehört hinein |
| 2 | **V9** — veröffentlichter Fallback-Signaturschlüssel | **Entscheidung Felix** | blockiert seit fünf Releases |
| 3 | **Resend-Webhook: erste Zustellzahlen ansehen** | **Felix** | seit dem 28.08. scharf; jeder Tag ohne Blick kostet Daten |
| 4 | Vier Tinten vereinheitlichen (siehe unten) | Entwicklung | die Köpfe ziehen an einem Strang, der Fließtext nicht |
| 5 | Deutschsprachiger Cluster (S-05) | Entscheidung Felix | größte inhaltliche Lücke, DSAG-Zielgruppe |

**Danach:**

| Punkt | Wer | Dringlichkeit |
|---|---|---|
| ~30 ungeprüfte Findings aus GLM/GPT (Phase 1.3, 4, 5 des Plans) | gemeinsam | hoch |
| 677 geparkte Lint-Warnungen abtragen (siehe unten) | Entwicklung | mittel |
| N-02: BPMN- und Sandbox-Zeile auf `~` | **Entscheidung Felix** | mittel — Positionierung, keine Korrektur |
| Runde-2-Vorschläge, die noch offen sind (siehe unten) | Entscheidung Felix | mittel |
| `dev.` und `test.clean-core.io` lösen nicht auf | Felix (DNS/GCP) | niedrig — die Doku nennt jetzt die run.app-Adressen |
| V15, V16, V18 aus dem Grok-Befund | Entwicklung | mittel |
| Die drei Tenant-Mails auf fluide Tabellen umbauen | Entwicklung | mittel |
| Mitte September: Befund v3 / Reindexierung messen | gemeinsam | Termin |
| Review-Tooling in den Rechenstand committen | Entwicklung | niedrig |

**Erledigt am 31.08.:** eslint-Gate scharf (war: prüft weder TypeScript noch
React-Hooks), Seitenüberlauf auf dem Telefon, Doku-Korrektur zu `dev.`/`test.`.
**Schon vorher erledigt und im Backlog übersehen:** `llms.txt` steht seit dem
26.08. unter `app/llms.txt/route.ts`.

---

## Die 677 geparkten Lint-Warnungen

**Was ist:** Mit v2.7.1 prüft `npm run lint` erstmals TypeScript und React-Hooks.
Fehler stehen auf null. Übrig bleiben zwei Hygieneklassen und zwei kleinere, alle
als Warnung geparkt und mit `eslint . --max-warnings 677` festgenagelt:

```
@typescript-eslint/no-explicit-any     365
@typescript-eslint/no-unused-vars      274
react-hooks/set-state-in-effect         26
react-hooks/exhaustive-deps             12
```

**Was zu tun ist:** `no-unused-vars` ist der billigste Anfang — tote Importe und
Variablen, jede Entfernung für sich prüfbar. `set-state-in-effect` ist die
inhaltlich interessanteste: 26 Stellen, an denen ein Effekt Zustand setzt und
damit einen zweiten Render auslöst; ein Teil davon lässt sich beim Rendern
ableiten statt im Effekt zu setzen.

**Warum nicht sofort:** dieselbe Begründung wie beim Einschalten selbst. 639
Ersetzungen in einem Release-Commit sind keine Änderung, die jemand liest.

**Wichtig:** Die Zahl in `package.json` gehört mit gesenkt. Sie ist der einzige
Grund, warum der Rückstau nicht wieder wachsen kann.

**Dringlichkeit:** mittel.

---

**Stand 28.08.2026 — v2.7.0.** Der Tag ging in zwei Strängen: vormittags die
fünf Releases aus dem Umsetzungsplan (v2.5.4 bis v2.6.2), nachmittags die
Oberfläche. Dazwischen ein Benchmark, bei dem drei Modelle dieselben 22
Screenshots bekamen wie ich — und zwei davon einen Rechenfehler fanden, den ich
am selben Vormittag verursacht hatte.

---

## Vier Tinten, ein Produkt

**Was ist:** Die Abschnitts- und Stufenköpfe ziehen seit v2.7.0 an einem Strang —
alle `gray-950`, erzwungen durch `SectionHeader`, `StageHeader` und zwei Guards,
die den gerenderten Stil vergleichen. Der Fließtext darunter nicht. Gemessen:

```
text-gray-900    239 Verwendungen
text-slate-900   102
[#0b1c30]         97
text-gray-950     81
```

519 Fundstellen, vier Tinten, kein erkennbares System dahinter — dieselbe Sorte
Drift, die bei den Überschriften behoben wurde, nur eine Ebene tiefer und
zehnmal so breit.

**Was zu tun ist:** eine Tinte wählen (`gray-950` für Überschriften ist gesetzt;
für Fließtext ist die Frage `gray-900` gegen `slate-900`), die anderen drei
ersetzen, und die Guard-Prüfung aus `landing-style-guard.spec.ts` um eine
Tinten-Allowlist erweitern.

**Warum nicht heute:** 519 Ersetzungen sind ein eigener Durchgang mit eigenem
Sichtprüfungsbedarf. Nebenbei erledigt heißt: unbemerkt etwas verschoben.

**Dringlichkeit:** mittel. Es sieht heute nicht falsch aus — es ist nur nicht
entschieden.

---

## Offene Vorschläge aus der zweiten Modellrunde

Gebaut wurden: Showroom nach oben, ein Primärknopf im Hero, die 21/17/4-Leiste,
die Verification Rail. Die Scanleiste wurde gebaut und nach Sichtprüfung wieder
entfernt. Was aus der Runde übrig ist:

- **Tool-Matrix gruppieren** (Grok, GPT): ein Hairline nach Zeile 3 trennt
  Scannen/HUD/Mapping von Refactor/Sandbox/Blueprint. Keine neuen Gruppentitel.
- **Feature-Raster in zwei Gruppen** (Grok, GLM): dieselben sechs Karten,
  Architektur gegen Governance.
- **Zwei-Spalten-Ansichten am Telefon nicht stapeln** (GPT, GLM): Transformation
  wird zu einem Segmented Control `ABAP | TypeScript`. Der Vergleich ist der
  ganze Punkt der Seite, und gestapelt ist er weg.
- **Analyze: Nullen nicht heroisieren** (Grok, GLM): sind alle drei
  Coverage-Werte 0, keine dunkle Hero-Karte, sondern eine Mono-Zeile — und die
  Evidenztabelle direkt unter die drei oberen Karten.

Rohdaten: `docs/reviews/2026-08-28-ux-round2-*.md`.

---

## Der Testlauf und seine zwei bekannten Wackler

Beide sind gemessen, keiner ist Code:

- **`full-pipeline.spec.ts`** hängt gelegentlich an der Gemini-gestützten
  Suite-Erzeugung — einmal lieferte das Modell defektes JSON. Isoliert grün.
- **`unsubscribe.spec.ts`** ist der einzige Test, der `/unsubscribe` besucht. Der
  Dev-Server kompiliert die Route beim ersten Aufruf; am Ende eines
  Sechs-Minuten-Laufs reicht das für die 30-Sekunden-Grenze. Im Log als
  „Compiling /unsubscribe" nachweisbar.

Wenn einer davon rot ist, **erst nachsehen, ob es wirklich der ist** — ich habe
heute zweimal einen echten Regress als Flake abgetan, und beide Male war es meine
eigene Änderung.

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

### ~~Der eslint-Gate~~ — erledigt am 31.08.2026 (v2.7.1)

`eslint.config.mjs` importierte `@typescript-eslint` und `eslint-plugin-react-hooks`
und aktivierte **keins von beiden**. Jetzt beide. 706 Probleme kamen zum Vorschein,
Fehler stehen auf null, 677 Warnungen sind mit `--max-warnings` festgenagelt —
siehe „Die 677 geparkten Lint-Warnungen" oben.

Eine Korrektur zur Notiz vom 28.08.: die beiden Rules-of-Hooks-Verstöße liegen in
`clean-core-video/`, einem eigenständigen Remotion-Projekt, das nichts ausliefert.
Sie waren nie in der Anwendung. Was tatsächlich durch das grüne Gate ging, war
anderes und schlimmer — ein Knopf ohne Wirkung, ein während des Renderns
beschriebenes Ref, eine Kennzahl, die von der Renderzeit abhing.

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

- ~~**Seiten-Überlauf:**~~ **erledigt am 31.08.2026.** Das `whitespace-nowrap`-Label
  war eine von drei Ursachen. Der Guard, der es prüfen sollte, fand die anderen
  beiden: der Ladeplatzhalter des Anmeldeknopfs (fest 176px) und das CTA-Label
  „Get Free Access or Login" passten bei 320px nicht neben den Schriftzug.
  Beide sind jetzt unterhalb `sm` schmaler; ab `sm` ändert sich nichts.
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

## `dev.` und `test.clean-core.io` lösen nicht auf

**Was ist:** Beide Hostnamen haben keinen A-Eintrag. Gegen 8.8.8.8 kommt für beide
NODATA zurück — der Name existiert in der Zone, zeigt aber auf nichts.
`clean-core.io` selbst ist unauffällig. Erreichbar sind die beiden Umgebungen nur
über ihre Cloud-Run-Adressen:

```
https://clean-core-dev-qcevuoi3uq-ew.a.run.app
https://clean-core-test-qcevuoi3uq-ew.a.run.app
```

**Warum es auffiel:** beim Nachsehen, ob v2.5.1 auf dev wirklich läuft (tut sie,
über die run.app-Adresse). Das erklärt vermutlich auch, warum eine geänderte
Benefit-Karte heute Vormittag „auf dev" nicht zu sehen war.

**Was zu tun ist:** entweder die Domain-Zuordnungen in Cloud Run wiederherstellen
und die CNAMEs bei Strato setzen — oder die Tabelle in `CLAUDE.md` und
`docs/ARCHITECTURE.md` auf die run.app-Adressen korrigieren, damit sie nicht
weiterhin URLs nennt, die es nicht gibt.

**Dringlichkeit:** niedrig für den Betrieb, mittel für die Dokumentation — eine
Anleitung, die auf eine tote Adresse zeigt, kostet jedes Mal eine Viertelstunde.

---

## Zustellstatus der dreißig Community-Konten

**Warum:** Die Vermutung des Tages — die geringe Nutzung erklärt sich dadurch,
dass die Freigabe- und Willkommensmails gefiltert wurden — ist plausibel, aber
unbelegt. Der Webhook ab v2.5.1 beantwortet sie für **künftige** Registrierungen.
Für die dreißig aus der Community-Aktivierung gibt es keine Ereignisse und wird es
keine geben; sie liegen vor dem Umbau.

**Was trotzdem geht:**

1. Im Resend-Dashboard sind die Sendungen aus der Aktivierung noch einzeln
   einsehbar. Die Empfängerdomänen gruppieren (`@knauf.com` und Konsorten gegen
   Freemailer) gibt einen ersten Anhaltspunkt, ob es ein Konzernfilter-Muster ist.
2. Der eigene Fall vom 27.08. ist der einzige mit bekanntem Ausgang: eigene
   Domain, korrektes SPF/DKIM/DMARC, Zustellung mit Verzögerung **in den
   Junk-Ordner**. Das ist Reputationsaufbau einer jungen Domain, kein Fehler in
   der Anwendung — und es trifft jede Konzernadresse gleichermaßen.
3. Die Zufriedenheitsumfrage am 02.09. ist der erste Anlass, diese Leute über
   einen zweiten Kanal zu erreichen. Wenn sie über LinkedIn geht statt über
   E-Mail, ist die Antwortquote gleichzeitig die Messung.

**Was das für die Umfrage heißt:** die Frage „hast du die Willkommensmail
bekommen?" gehört hinein. Sie kostet eine Zeile und beantwortet die teuerste
offene Frage über die Plattform.

**Dringlichkeit:** hoch, weil an dieser Vermutung hängt, ob das Produkt ein
Nutzungs- oder ein Zustellproblem hat. Das sind völlig verschiedene Baustellen.

---

## Resend-Webhook scharfschalten

**Warum:** Der Code steht, die Route ist deployt, aber sie antwortet jeder Anfrage
mit 503, solange kein Signaturschlüssel gesetzt ist. Das ist Absicht — ein Endpunkt,
der auf Zuruf nach Firestore schreibt, wäre schlimmer als gar keiner —, heißt aber
auch: bis das hier erledigt ist, wissen wir über zugestellte Mails genauso wenig wie
gestern.

**Zwei Schritte, beide nur von dir aus machbar:**

1. Im Resend-Dashboard unter *Webhooks* einen Endpunkt anlegen:
   `https://clean-core.io/api/webhooks/resend`. Ereignisse: `email.delivered`,
   `email.bounced`, `email.complained`, `email.delivery_delayed` (`opened`/`clicked`
   optional — sie erzeugen Rauschen durch Scanner, die Links vorab anklicken).
2. Das dort angezeigte `whsec_…`-Signing-Secret als GitHub-Secret
   `RESEND_WEBHOOK_SECRET` hinterlegen. Die Pipeline reicht es bereits durch.

**Prüfen, dass es läuft:** Resend hat im Webhook-Dialog einen Test-Versand. Danach
sollte in den Cloud-Run-Logs kein `signature rejected` stehen — und ein Bounce
taucht als roter Hinweis auf der Zeile des Nutzers in der Admin-Konsole auf.

**Was danach noch fehlt:** die dreißig Konten aus der Community-Aktivierung liegen
vor diesem Umbau. Für die gibt es keine Ereignisse und wird es keine geben — was
mit ihren Willkommensmails passiert ist, bleibt unbekannt. Wenn die Vermutung
stimmt, dass viele davon gefiltert wurden, ist die Zufriedenheitsumfrage am 02.09.
der erste Anlass, an dem wir das über einen zweiten Kanal nachholen könnten.

**Dringlichkeit:** hoch. Es ist der einzige offene Punkt, bei dem jeder Tag Wartezeit
Daten kostet, die nicht nachgeholt werden können.

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
