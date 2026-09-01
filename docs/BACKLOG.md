# Backlog

Offene Punkte, jüngster Stand zuerst. Kurz gehalten: was, warum, und wie dringend.
Ältere Abschnitte bleiben stehen, solange etwas darin offen ist.

**Stand 01.09.2026, Feierabend — v2.8.5, ein Release, auf `main` und deployt
(`clean-core-00289-pf4`).** Ein einziger Strang: die Umfrage, die morgen früh um
09:00 von selbst an 36 Leute geht.

1. **Die Einladung bedankt sich jetzt zuerst** — und zwar so, dass der Dank für
   alle 36 stimmt, auch für die, die nie eine Analyse gestartet haben.
2. **Der einzige Knopf auf der Seite sah aus wie „Absenden"** und war ausgegraut.
   Sekundärer Stil, in der Box, und ein Zustand, der sich erklärt.
3. **Der Versand überholte Resend** — 429er wurden geloggt und übersprungen.
   Gepaced, mit Wiederholung, und rot bei verlorenen Empfängern.
4. **Zustellbarkeit letztmalig geprüft**, gegen `8.8.8.8` und Produktion. Zwei
   Lücken geschlossen, eine Sache braucht Felix (siehe unten).

**Der Tag in einer Zeile:** drei der vier Punkte sind keine Defekte — die API
antwortete durchweg mit `200`. Sie sind Gestaltungsfehler und ein Anbieterlimit,
und beides findet man nur, indem man die Sache benutzt oder nachrechnet, was sie
unter Last tut.

**Morgen früh, vor 09:00 — die letzten zwei Urteile stehen noch aus:**

| # | Punkt | Wer | Warum jetzt |
|---|---|---|---|
| 1 | **Resend-Tracking prüfen** | **Felix** | 30 Sekunden, und es ist das Einzige an der Zustellbarkeit, das ich nicht sehen kann — siehe unten |
| 2 | **„zwei Minuten" im Betreff** | **Felix** | seit gestern offen; der Betreff geht so raus, wie er ist |
| 3 | **„Version 3.0" als Zusage** | **Felix** | seit gestern offen; danach ist es 36 Leuten versprochen |
| 4 | Resend-Webhook: erste Zustellzahlen ansehen | **Felix** | seit 28.08. scharf; morgen kommen 36 Ereignisse dazu |

**Danach, unverändert:** die ~30 ungeprüften GLM/GPT-Findings, G-06, die 677
geparkten Lint-Warnungen, G-05, V15/V16/V18, die drei Tenant-Mails, Befund v4
Mitte September. Neu dazu: **DKIM auf 2048 bit drehen**, aber erst *nach* dem
09.09. — eine Schlüsselrotation am Vorabend eines Versands steht am nächsten
Morgen womöglich mitten in der DNS-Verbreitung.

**Erledigt am 01.09., ein Release:**

| Release | Was |
|---|---|
| v2.8.5 | Dank zuerst; der Knopf, der wie „Absenden" aussah; Pacing gegen Resends Limit; Postanschrift und Abmeldung in beiden Mailteilen; sechs neue Guards |

---

**Stand 31.08.2026, Feierabend — v2.7.0 → v2.8.4, acht Releases, alles auf `main`
und deployt.** Der Tag lief in vier Strängen:

1. **Das Lint-Gate**, das nie geprüft hat, wofür es gebaut war. 706 Probleme,
   Fehler auf null, 677 Warnungen mit `--max-warnings` festgenagelt, sechs echte
   Defekte darunter.
2. **V9 erledigt.** Der veröffentlichte Ersatzschlüssel ist aus allen drei Routen
   raus, ohne Fallback in irgendeiner Umgebung.
3. **Befund v3** — fünf belegte Punkte abgearbeitet, N-02 als letzter geschlossen.
   `clean-core-test` abgeräumt und die Pipeline dagegen abgesichert.
4. **Die Aktivierungsumfrage** gebaut, viermal getestet, dreimal korrigiert.

**Der Tag in einer Zeile:** jeder ernsthafte Fund kam aus einer Messung, die es
vorher nicht gab — und der teuerste kam von einem Menschen, der die Mail
tatsächlich benutzt hat.

**Morgen zuerst:**

| # | Punkt | Wer | Warum jetzt |
|---|---|---|---|
| 1 | **Umfrage fertigstellen und freigeben** | **gemeinsam** | sie feuert **Mi 09:00 automatisch** — siehe den Abschnitt unten |
| 2 | **Resend-Webhook: erste Zustellzahlen ansehen** | **Felix** | seit dem 28.08. scharf; jeder Tag ohne Blick kostet Daten |
| 3 | Vier Tinten vereinheitlichen (siehe unten) | Entwicklung | die Köpfe ziehen an einem Strang, der Fließtext nicht |
| 4 | Deutschsprachiger Cluster (S-05) | Entscheidung Felix | größte inhaltliche Lücke — und die Umfrage fragt genau danach |

**Danach:**

| Punkt | Wer | Dringlichkeit |
|---|---|---|
| ~30 ungeprüfte Findings aus GLM/GPT (Phase 1.3, 4, 5 des Plans) | gemeinsam | hoch |
| G-06: Autorenprofil auf `/about` mit echter Fachhistorie | **Felix schreibt, ich baue** | mittel — `Person`-Schema mit `sameAs` steht schon |
| 677 geparkte Lint-Warnungen abtragen (siehe unten) | Entwicklung | mittel |
| Runde-2-Vorschläge, die noch offen sind (siehe unten) | Entscheidung Felix | mittel |
| G-05: BPMN-Textdarstellung auf die Feature-Seiten ausrollen | Entwicklung | mittel |
| `dev.` und `test.clean-core.io` lösen nicht auf | Felix (DNS/GCP) | niedrig — die Doku nennt jetzt die run.app-Adressen |
| V15, V16, V18 aus dem Grok-Befund | Entwicklung | mittel |
| Die drei Tenant-Mails auf fluide Tabellen umbauen | Entwicklung | mittel |
| Mitte September: Befund v4 / Reindexierung messen | gemeinsam | Termin |
| Review-Tooling in den Rechenstand committen | Entwicklung | niedrig |

**Erledigt am 31.08., acht Releases:**

| Release | Was |
|---|---|
| v2.7.1 | eslint-Gate scharf; sechs Defekte, die es durchgelassen hatte; Seitenüberlauf |
| v2.7.2 | **V9**; Befund v3: S-08 Sitemap, S-09 Twitter-Cards, K-03, K-05, K-06 |
| v2.7.3 | **N-02** — die zwei Zeilen, an denen die Seite gegen sich selbst falsch lag; Wochenbericht-Fix; vierte Überlauf-Ursache; Zeitzonenfehler im eigenen Guard |
| v2.8.0 | Die Aktivierungsumfrage |
| v2.8.1 | Mehrfachauswahl-Stimmzettel mit vier belegten v3.0-Kandidaten |
| v2.8.2 | Die v3.0-Rahmung und der Aktivierungsschubs in der Mail |
| v2.8.3 | Mail halbiert; Fortschritt statt Vollzugsmeldung; „Your answers" |
| v2.8.4 | Die `localhost`-Links, dreifach behoben |

Dazu ohne Versionssprung: `clean-core-test` gelöscht und die `release`-Spur
stillgelegt, der Wochenbericht vom 28.08. manuell nachgeholt.

**Schon vorher erledigt und im Backlog übersehen:** `llms.txt` steht seit dem
26.08. unter `app/llms.txt/route.ts`. Und `/catalog/[object]` ist statisch
vorgerendert mit eigener `catalog-sitemap.xml` — S-07, der „größte Hebel" aus drei
Befunden, ist damit gebaut; offen ist nur noch die Messung in der Search Console.

**Neu gefunden beim Nachprüfen von V9:** `clean-core-test` ist ein drei Monate
alter, öffentlich erreichbarer Build. Siehe direkt unten.

**Neu gefunden am 31.08.:** der Wochenbericht vom 28.08. ist nie verschickt worden.
Ursache gefunden und behoben; der Fix ist mit v2.8.0 auf `main` und damit scharf.

---

## Die Aktivierungsumfrage — Stand, offene Urteile, und die Frist

**Gebaut, deployt, fünfmal getestet, viermal korrigiert** (v2.8.0 bis v2.8.5).
Der Schlusstermin für die letzten zwei Urteile ist **morgen 09:00**.

### ⚠️ Sie feuert morgen früh von selbst

`survey-send.yml` läuft **Mittwoch, 02.09., 09:00 Berliner Zeit** und schickt an alle 36 — ohne
weitere Freigabe. Dann wird das Kampagnendokument mit Öffnungs- und Schlussdatum
geschrieben, pro Empfänger ein Sendevermerk angelegt, ab Donnerstag kommt täglich
um 09:00 das Zwischenergebnis, und einen Tag nach Schluss (**09.09.**) der
Endstand.

**Wenn sie bis dahin nicht freigegeben ist:** den Workflow *Activation Survey —
send* in den GitHub Actions deaktivieren. Das ist der Ausschalter. Ein zweiter Lauf
später verschickt nichts doppelt und verschiebt keine Frist.

### Zustellbarkeit — letzter Stand, 01.09.

Gegen `8.8.8.8` und gegen die Produktion nachgesehen, nicht aus dem Gedächtnis:

| Prüfung | Stand |
|---|---|
| SPF `clean-core.io` | `v=spf1 include:amazonses.com ~all` |
| DKIM `resend._domainkey` | veröffentlicht, 1024 bit |
| DMARC | `p=reject; rua=mailto:dmarc@clean-core.io; fo=1` |
| Return-Path `send.clean-core.io` | eigener SPF + `feedback-smtp.eu-west-1.amazonses.com` → SPF-Ausrichtung |
| `List-Unsubscribe` + One-Click | gesetzt; `POST /api/unsubscribe` antwortet live mit `200` |
| Textteil | vorhanden |
| Bilder, Anhänge, Zählpixel | keine |
| Links | ausschließlich `clean-core.io` |
| `GET /api/survey/vote` | `405` — ein Mail-Gateway kann nicht abstimmen |

Zwei Lücken geschlossen: Die Einladung nannte **keine Postanschrift** (die
Willkommensmail trägt sie seit dem ersten Versand — herum verkehrt, denn Massenpost
ist die Kategorie, für die die Regel geschrieben ist), und der **Textteil ließ den
Abmeldelink weg**, ausgerechnet für den Leser, der ihn am ehesten sieht.

#### ⚠️ Das Einzige, was ich nicht prüfen kann

**Ob Resends Klick-Tracking für die Domain an ist.** Der `RESEND_API_KEY` in
`.env.local` ist send-only; `GET /domains` antwortet `401 restricted_api_key`. DNS
und die empfangene Nachricht sind die einzigen Belege, die von hier aus zu haben
sind.

Ist es an, schreibt Resend **jeden** `href` auf einen Tracking-Host um. Das ist
eine fremde Weiterleitungsdomain in einer Mail von einer jungen Domain — und es
bricht das Prinzip, auf dem die Umfrage gebaut ist: die URL *ist* die Stimme.

**Prüfung, 30 Sekunden:** in der Testmail über einen Antwort-Button fahren. Die
Adresse muss mit `https://clean-core.io/survey/` beginnen. Tut sie es nicht:
Dashboard → Domains → clean-core.io → Tracking aus.

### Was am 01.09. korrigiert wurde (v2.8.5)

**Die Einladung begann mit „vier Kandidaten stehen zur Wahl".** Sachlich richtig,
und für eine Mail, die um einen Gefallen bittet, eine kalte erste Zeile. Davor
steht jetzt ein Dank — mit einer zweiten Hälfte, die keine Höflichkeit ist,
sondern Genauigkeit: *„and if you have not got round to it yet, thank you for
signing up anyway."* Ein Teil dieser Liste hat nie eine Analyse gestartet; das ist
der Grund, aus dem die Umfrage existiert. Ein pauschales „danke, dass du es nutzt"
wäre für genau diese Leser nachweislich falsch.

**Der einzige Knopf auf der Seite sah aus wie „Absenden".** Jede Frage speichert
beim Antippen. Nur das Freitextfeld kann das nicht — Getipptes muss absichtlich
abgeschickt werden —, also hat es einen Knopf. Der trug den dunklen Primärstil des
Produkts, stand am Fuß eines Fragebogens und war ausgegraut, solange nichts
getippt war. Wer alles beantwortet hatte, sah einen toten Absendeknopf und schloss
daraus, dass nichts angekommen ist.

Drei Änderungen, jede mit einer Aufgabe: **sekundärer Stil** statt Primärstil, der
Knopf sitzt **in der Box** samt Zeile *„Everything above is already saved — this
box is the only thing on the page with a button"*, und der **ausgegraute Zustand
schweigt nicht mehr** — daneben steht immer eine von vier Wahrheiten. Die
Bedingung ist ebenfalls ehrlicher: aktiv, wenn im Feld etwas steht, das der Server
nicht hat (`comment !== sentComment`), statt bei „Feld nicht leer".

**Die Seite behauptete etwas über Leser, die nichts angetippt hatten.** „Your
answer is saved" stimmt nur für den, der in der Mail eine Antwortfläche getroffen
hat. Wer den nackten Link öffnet, bekam einen ersten Satz über sich selbst, der
nicht stattgefunden hat.

**Der Versand überholte Resend.** Zwei Anfragen pro Sekunde sind erlaubt; die
Schleife wartete eine Antwort ab und startete sofort die nächste, was von einem
CI-Runner vier bis acht sind. Ein `429` wurde als `FAILED` geloggt und
übersprungen — die Person wird nie gefragt, der Lauf bleibt grün, und die Umfrage
schließt vor dem nächsten geplanten Versand. Jetzt: **700 ms Pause**, **drei
Versuche** bei `429`/`5xx`, und **`exit 1`**, sobald jemand übrig bleibt. Kosten
bei 36 Empfängern: 25 Sekunden.

**Derselbe Fehlertyp wie die `localhost`-Links von gestern** — laut in der
Wirkung, still im Protokoll.

### Was am 01.09. nachgemessen ist

| Prüfung | Ergebnis |
|---|---|
| `tests/survey-guard.spec.ts` | 28 grün, davon sechs neu |
| Produktionsbuild lokal | grün, nur Altwarnungen |
| Pipeline auf `main` | security / validate / deploy alle grün |
| Deployte Seite gegen echtes Token | neue Fassung wird ausgeliefert, alte Texte weg |
| Fünfte Testmail | `99f0fe9f-761a-4551-8128-738054a02530` |
| Trockenlauf | **36 Empfänger**, `alreadySent: 0` — Mittwoch beginnt bei null |

**In der fünften Testmail steht „Open until 8 September".** Sie wurde am 01.09.
erzeugt, die Frist ist Versanddatum + 7 Tage. Morgen steht dort der 09.09. Kein
Fehler.

**Zwei von Felix' eigenen Konten sind unter den 36** (`sonny.frenzel@gmail.com`
und `@googlemail.com`). Der Nenner im Zwischenergebnis zählt sie mit.

### Zwei Urteile, die noch fehlen

1. **Die „zwei Minuten".** Der Betreff sagt `two-minute first run`, der Mailtext
   sagt inzwischen „a couple of minutes". Ich habe die Zahl aus dem Ablauf
   hergeleitet, nicht gestoppt. Entweder den Betreff angleichen — oder einmal einen
   Beispiellauf messen und die echte Zahl an beide Stellen schreiben. Letzteres
   passt zum Rest der Seite.
2. **„Version 3.0" als Zusage.** Steht an vier Stellen und verspricht 36 Leuten,
   dass es eine 3.0 gibt und ihr Kreuz sie beeinflusst. Einlösbar — die vier
   Kandidaten sind belegt und kostenbar — aber es ist ein Versprechen. Falls zu
   früh: auf „die nächste größere Fassung" umformulieren, eine Zeile.

### Was am 31.08. nachgemessen ist

| Prüfung | Ergebnis |
|---|---|
| Trockenlauf gegen die Produktionsdatenbank | **36 echte Empfänger**; 110 CI-Konten und 1 Unterdrückung gefiltert |
| Vierte Testmail über den echten Workflow | `75c1f6a8-122d-43c2-a43a-ef4adcfd0718` |
| Landeseite im echten Browser gegen Produktion | Einfachauswahl, Mehrfachauswahl, Fortschritt, Übersicht — alle POSTs 200, keine Konsolenfehler |
| Ungültiges Token | Seite sagt „no longer valid", API antwortet 400 |
| Links unter der Workflow-Umgebung | `https://clean-core.io/survey/…` |

**36, nicht 30.** Die Zahl in den älteren Abschnitten stammt vom 19.08.

**Kein Testversand hat etwas angefasst:** kein Kampagnendokument, kein
`email_sends`-Eintrag. Mittwoch beginnt bei null.

### Die drei Korrekturen, und was sie über das Prüfen sagen

**Testmail 1–3 enthielten Links auf `localhost:3000`.** `APP_BASE_URL` fällt ohne
`NEXT_PUBLIC_APP_URL` auf localhost zurück; der Deploy setzt die Variable für die
Anwendung, ein Workflow-Schritt erbt sie nicht. Behoben dreifach: Workflow setzt
sie, **Skript verweigert den Versand ohne `https://`**, zwei Guards halten beides.

Am Code war nichts falsch. Der Fehler lebte zwischen dem Vorgabewert eines Moduls
und der Umgebung eines Workflows — dorthin sieht kein Unit-Test.

**Und ich hätte ihn selbst finden können.** Ich habe die Seite gründlich gegen
Produktion getestet — echter Browser, Klicks, Netzwerkmitschnitt — aber jedes Mal
mit einem Token, den ich erzeugt, in einer URL, die ich gebaut hatte. Die Kette
Mail → Link → Seite habe ich nie am Stück geprüft, obwohl genau das der Weg des
Nutzers ist. Gefunden hat es ein Mensch beim ersten echten Antippen.

**Die zweite Korrektur kam aus derselben Quelle:** die Seite meldete Vollzug, bevor
sie etwas fragte, und niemand sah, was er insgesamt geantwortet hatte. Beides sind
Gestaltungsfehler, die kein grüner Test je gemeldet hätte.

**Offen und bewusst nicht gebaut:** die Öffnungsrate über Resend. Der Webhook
zeichnet `email.opened` nicht auf, weil Scanner die Zahl aufblähen. Die Umfrage
beantwortet die Frage besser — eine Antwort beweist, dass ein Mensch gelesen hat,
und „Link geholt, nie geantwortet" ist der Gegenbeweis. Falls du die Rohzahl
trotzdem willst: ein Ereignistyp mehr in der Webhook-Route.

---

## Der Wochenbericht vom 28.08. ist nie verschickt worden

**Was war** (nachgelesen in den Logs, nicht vermutet):

| Lauf | geplant | GitHub startete | Berliner Zeit | Entscheidung |
|---|---|---|---|---|
| `33178078590` | 10:00 UTC | **14:01 UTC** | 16:01 CEST | „not 12:00 … skipping" |
| `33182942533` | 11:00 UTC | **14:59 UTC** | 16:59 CEST | „not 12:00 … skipping" |

GitHub hat den Cron **vier Stunden zu spät** gestartet. Der Uhrzeit-Wächter, der
entscheiden soll, welcher der zwei DST-Slots der richtige ist, fragte „ist es
jetzt 12 Uhr in Berlin?" — und beantwortete damit versehentlich auch „hat GitHub
pünktlich gestartet?". Beide Läufe verwarfen sich selbst, **beide meldeten
`success`**, und nichts hat Alarm geschlagen.

Am 21.08. lief es nur deshalb, weil die Verzögerung acht Minuten betrug. GitHub
sagt in seiner eigenen Dokumentation zu, geplante Läufe **nicht** pünktlich zu
starten; die Prüfung hat sich also von Anfang an auf etwas verlassen, das
ausdrücklich nicht zugesichert ist.

**Behoben am 31.08.:** die Entscheidung hängt jetzt an `github.event.schedule` —
dem auslösenden Cron-Ausdruck, der sich nicht verschiebt — und die Jahreszeit am
UTC-Offset, der ebenso stabil ist. Damit wählt der Job den richtigen Slot, egal wie
spät GitHub dran ist, und der Bericht geht verspätet raus statt gar nicht. Der
28.08.-Bericht wurde am 31.08. manuell nachgeholt
(`sent 5e9c4b88-306a-4827-9d93-64a6b25c2310`).

**Noch offen — und das ist der Haken:** geplante Workflows laufen bei GitHub
**immer vom Default-Branch**. Solange der Fix nur auf `dev` liegt, passiert am
Freitag wieder dasselbe. Er muss nach `main`.

**Was der Fix nicht abdeckt:** GitHub kann geplante Läufe unter Last auch komplett
verwerfen. Dann gibt es keinen Lauf, der sich melden könnte. Ein Wächter dafür
bräuchte Zustand außerhalb von Actions — etwa ein Feld „zuletzt versendet" in
Firestore, das die Admin-Konsole rot färbt, wenn es älter als acht Tage ist. Klein,
aber ein eigener Punkt.

**Dringlichkeit:** hoch, bis der Fix auf `main` ist.

---

## ~~`clean-core-test`~~ — abgeräumt am 31.08.2026

**Was ist** (gemessen am 31.08.2026):

| | |
|---|---|
| Ausgelieferte Revision | `clean-core-test-00045-z6h`, erstellt **26.07.2026** |
| `origin/release` letzter Commit | **09.06.2026** |
| Gesetzte Umgebungsvariablen | `NEXT_PUBLIC_FIRESTORE_DB_ID`, `NEXT_PUBLIC_APP_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `NODE_OPTIONS` |
| Fehlend | `AUDIT_SIGNING_KEY`, `S4_ENCRYPTION_KEY`, `S4_HOST_ALLOWLIST`, `MFA_BACKUP_CODE_PEPPER`, `PILOT_APPROVAL_SECRET`, `RESEND_WEBHOOK_SECRET` |
| Erreichbar | ja, `/` antwortet mit 200 |

Aufgefallen ist es beim Nachprüfen von V9: der Dienst hat keinen Signaturschlüssel
und wäre damit genau der Fall gewesen, den der Befund beschreibt. **Ist er nicht** —
der Build ist so alt, dass er keine der signierenden Routen besitzt.
`/api/runs/create`, `/api/audit-pack/create`, `/api/export/verify` und
`/api/health` antworten alle mit 404. Nachgemessen: eine mit der alten Konstante
gefälschte Signatur wird auf Produktion mit `valid: false` abgewiesen.

**Was daran trotzdem stört:** eine öffentlich erreichbare Kopie der Anwendung vom
Juni, mit gesetztem `GEMINI_API_KEY` und den Zugriffsregeln von damals. Dieselbe
Sorte Angriffsfläche wie die beiden Altlasten in us-west1 und europe-west3 weiter
unten — nur diese hier hat einen aktuellen Namen und wirkt dadurch gepflegt.

**Entschieden und erledigt am 31.08.:** der Dienst ist gelöscht, samt 45
Revisionen. Vor dem Löschen geprüft: kein Domain-Mapping (nur `clean-core.io` →
`clean-core` existiert), und der einzige Verkehr in dreißig Tagen waren die
Prüfabrufe aus dieser Sitzung.

Dazu hätte ein Push auf `release` den Dienst sofort wieder aufgebaut — mit
`NEXT_PUBLIC_APP_URL=https://test.clean-core.io` (kein A-Eintrag) und der
us-west1-Datenbank mit der `freeTierLimited`-Deckelung, die am 19.08. den Ausfall
verursacht hat. Drei bekannt kaputte Dinge, wiederhergestellt durch einen Push.
`.github/workflows/deploy.yml` bricht auf diesem Branch jetzt mit einer Erklärung
ab, statt ihn stillschweigend zu deployen.

**Wenn die Testumgebung zurück soll:** eine europe-west1-Datenbank anlegen, das
Domain-Mapping für `test.clean-core.io` wiederherstellen, und den Dienstnamen im
`release)`-Block der Pipeline wieder eintragen. Ein Block, dokumentiert an Ort und
Stelle.

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
- **Der Speicherwächter des Dev-Servers** — am 31.08. dazugekommen und vermutlich
  die eigentliche Ursache hinter dem vorigen Punkt. Nach rund vierzig kompilierten
  Routen schreibt Next `⚠ Server is approaching the used memory threshold,
  restarting...` und startet sich neu. Trifft es eine laufende Navigation, wartet
  `page.goto` auf eine Antwort, die niemand mehr sendet — in drei aufeinander
  folgenden Läufen traf es `/whitepaper`, mit ~9.900 Modulen der größte
  Kompiliervorgang der Seite. **Nur lokal:** CI liefert mit `npm start` einen
  fertigen Build aus, dort kompiliert nichts und der Wächter feuert nie.
  Erkennungsmerkmal im Log ist die Restart-Zeile unmittelbar vor dem Timeout.

Wenn einer davon rot ist, **erst nachsehen, ob es wirklich der ist** — ich habe
heute zweimal einen echten Regress als Flake abgetan, und beide Male war es meine
eigene Änderung.

---


### ~~V9~~ — erledigt am 31.08.2026 (v2.7.2)

Der veröffentlichte Ersatzschlüssel stand in drei Produktionsrouten eines
**öffentlichen** Repos, und der Wächter davor verlangte `NODE_ENV === 'production'`
*und* ein abgeschaltetes Emulator-Flag. Alles daneben signierte mit einer
Konstante, die jeder nachschlagen kann — und `/api/export/verify` prüfte gegen
dieselbe.

Gewählt wurde Variante A: kein Fallback, in keiner Umgebung. `lib/audit-signing-key.ts`
liest den Schlüssel als einzige Stelle, `tests/signing-key-guard.spec.ts` hält es.

**Die Annahme in dieser Notiz war falsch, und das ist die Lehre:** hier stand, CI
brauche ein eigenes GitHub-Secret. Brauchte es nicht — der Testschlüssel signiert
Testdaten gegen einen Testserver und schützt nichts. `playwright.config.ts` setzte
für zwei andere Secrets längst genau dieses Muster. Fünf Releases blockiert an
einer Entscheidung, die keine war.

**Nicht rotiert, bewusst:** ein Wechsel des Produktionsschlüssels entwertet jede
bereits ausgestellte Run-Signatur und jedes ausgelieferte Audit-Pack. `/api/health`
bestätigt den echten Schlüssel auf Produktion und dev.

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
