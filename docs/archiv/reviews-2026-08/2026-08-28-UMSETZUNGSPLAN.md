# Umsetzungsplan — GLM- und GPT-Findings, vollständig geprüft

**Stand:** 28. August 2026, gegen v2.5.3
**Grundlage:** GPT-5.6-sol (~55 Findings, sechs `2026-08-27-gpt-5.6-sol-*-raw.md`)
und GLM 5.3 (57 Findings, `2026-08-27-GLM-TRIAGE.md`)

Jedes Finding in diesem Plan ist gegen den Code nachgestellt. Was ungeprüft
blieb, steht am Ende namentlich.

**Eine Korrektur vorweg.** Eine frühere Fassung dieses Plans hat das schwerste
Finding beider Modelle als widerlegt geführt. Das war falsch: geprüft wurde der
Schutz in `usage-join.ts`, nicht die Daten, die dort ankommen. Der Defekt ist
echt und steht jetzt an erster Stelle von Release 2. Es ist genau der Fehler, vor
dem der Methodenhinweis im GLM-Triage warnt — an der genannten Stelle nachsehen,
nicht an der plausiblen.

---

## Release-Schnitt

Fünf Releases, nach Schwere sortiert, jedes einzeln getestet und ausgeliefert.

| Release | Thema | Findings | Aufwand |
|---|---|---|---|
| **1 · v2.5.4** | Tests, die nichts prüfen | 5 | klein |
| **2 · v2.5.5** | Die Engine erfindet Stilllegungskandidaten | 4 | mittel |
| **3 · v2.6.0** | Grüne Urteile ohne Prüfung | 10 | groß |
| **4 · v2.6.1** | Sitzung, Zustellung, MFA | 6 | mittel |
| **5 · v2.6.2** | Engine-Feinheiten und öffentliche Texte | 8 | mittel |

Release 1 zuerst, weil es entscheidet, was alle folgenden Testläufe wert sind.

---

## Release 1 · v2.5.4 — Tests, die nichts prüfen

**GLM M3/V18, GPT-Meta. Bestätigt.** Fünf Tests hüllen ihre gesamte Zusicherung
in eine Bedingung auf die Existenz des Elements:

```
tests/analyze-design.spec.ts:37       if (await chatbotTrigger.count() > 0) {
tests/landing.spec.ts:34              if (await legalNoticeLink.count() > 0) {
tests/sandbox-delivery.spec.ts:9      if (await communityBadge.count() > 0) {
tests/stage1-2.spec.ts:18             if (await legalNoticeLink.count() > 0) {
tests/transformation-docs.spec.ts:20  if (await glossaryBookTrigger.count() > 0) {
```

Verschwindet das Element, besteht der Test still. Das ist schlechter als ein
fehlender Test, weil er als Absicherung mitgezählt wird.

**Umsetzung:** Bedingung durch `await expect(locator).toBeVisible()` ersetzen.
Ist ein Element wirklich optional, gehört das im Test begründet.

---

## Release 2 · v2.5.5 — Die Engine erfindet Stilllegungskandidaten

### 2.1 Fehlende Nutzungsdaten werden zu null Aufrufen · **Blocking**

**Beide Modelle. Bestätigt.**

`lib/abap/usage-parser.ts:79` schreibt `callCount: callCount ?? 0`.
`parseCallCount()` liefert `undefined`, wenn die Spalte fehlt oder unlesbar ist
(`'not available'`), und der Parser macht daraus **0**.

Der Datensatz existiert dann. Damit greift der Schutz in `usage-join.ts:112`
nicht mehr — `if (!record) return 'unknown'` prüft die Existenz, nicht den Inhalt
— und `record.callCount === 0` liefert `dormant`. `dormant` ergibt bei jeder
Machbarkeit den Quadranten `retire-candidate`.

Der Kommentar über dem Schutz sagt wörtlich: *„Missing data is not evidence of
non-use."* Genau das passiert, eine Datei früher.

**Wirkung:** Ein SCMON-Export ohne erkannte Aufrufspalte macht **jedes** Objekt
zum Stilllegungskandidaten. Das ist eine Empfehlung, Code zu löschen, hergeleitet
aus fehlenden Daten.

**Umsetzung:** `callCount: callCount ?? null` und den Typ auf `number | null`.
Im Join `record.callCount == null → 'unknown'`, vor der Nullprüfung. Zusätzlich
eine Warnung beim Import, wenn keine Aufrufspalte erkannt wurde.

### 2.2 Fehlende Vorfahren gelten als aufgelöst · **High**

`lib/abap/class-model-resolver.ts:34`: Fehlt die Oberklasse in `nodesMap`, wird
sie **nicht** als fehlend vermerkt, sofern ihr Name mit `CL_`, `CX_`, `ZCL_` oder
`ZCX_` beginnt — sie wandert stattdessen als Kante in den Graph. Dasselbe für
`IF_`/`ZIF_`-Schnittstellen.

Bei `CL_`/`CX_`/`IF_` ist die Annahme vertretbar: SAP-Standardklassen existieren
im System, nur nicht im Upload. Bei **`ZCL_`, `ZCX_`, `ZIF_` ist sie es nicht** —
das sind Kundenobjekte, und wenn sie nicht im Upload liegen, wurden sie nicht
geparst. `detectStructural()` meldet trotzdem „Inheritance chain fully resolved".

**Umsetzung:** Z-Präfixe aus der Ausnahme herausnehmen. Für die SAP-Präfixe die
Annahme benennen, statt sie zu verschweigen („assumed present in the system, not
parsed").

### 2.3 `INSERT wa INTO itab` wird zum kritischen Datenbankschreibzugriff · **High**

**GPT-Engine 6, überschneidet sich mit GLM E4. Bestätigt für Teil-Uploads.**

`evidence-model.ts:328` erkennt interne Tabellen an `INTO TABLE`, `LINES OF`,
`ASSIGNING` und weiteren Klauseln — **nicht** am schlichten `INTO`. Für
`INSERT workarea INTO items.` greift keine davon.

Zwei Schutzstufen dahinter: `localDataObjects` (im Quelltext deklariert) und
`LOCAL_NAME_PREFIX` — aber dessen Regex ist
`^(L[TSVORXD]_|G[TSVOR]_|[EIC][TSV]_|R[TSV]_|ME_|MO_|MT_|MS_|MV_)`. Ein Name wie
`WORKAREA` passt auf keines von beidem. Liegt die Deklaration außerhalb des
Uploads — der Normalfall bei Ausschnitten —, entsteht ein **Critical**-Finding
auf einer Variablen.

**Umsetzung:** `INSERT <wa> INTO <itab>` als interne Form erkennen. Der
Datenbankform fehlt in dieser Schreibweise das `INTO`: sie lautet
`INSERT <dbtab> FROM …` oder `INSERT INTO <dbtab> VALUES …`.

### 2.4 Der Messzeitraum wird aus Ausführungsdaten erfunden · **Medium**

`usage-parser.ts:378` `detectPeriod()` bildet den Zeitraum aus dem kleinsten und
größten `lastUsed`. Ein Jahresexport, in dem alles zuletzt am 1. und 2. Juni lief,
meldet einen Messzeitraum von **einem Tag** — und dieser Wert hängt danach an
jedem Datensatz.

Ausführungszeitpunkte sind nicht das Beobachtungsfenster. Ohne Angabe im Export
gehört der Zeitraum unbekannt zu bleiben.

---

## Release 3 · v2.6.0 — Grüne Urteile ohne Prüfung

Dieselbe Fehlerklasse, für die in v2.5.0 der gefälschte Sandbox-Tester entfernt
wurde und für die `docs/ARCHITECTURE.md` §5.7 die Regel formuliert. Sie ist an
zehn Stellen zurück, und sie trifft genau die Bildschirme, die fotografiert
werden.

### 3.1 Der angezeigte Clean Core Score ist nicht der signierte · **High**

**Beide Modelle. Bestätigt, mit Rechenweg.**

Signiert wird `computedRouteReport.cleanCoreScore`. Angezeigt wird
`liveCleanCoreScore` (`analyze/page.tsx:1111`):

```
60 % Konstrukt-Abdeckung
+ 30 % standardFitBonus   ← Regex /high|medium|low/ auf KI-Prosa,
                            Vorgabewert 80, wenn nichts passt
+ 10 % gespeicherter Score
```

Eine Gemini-Antwort mit „High" hebt die Anzeige über das, was der unveränderliche
Run und das Audit-Pack belegen können.

### 3.2 Die TCO-Seite rechnet aus erfundenen Annahmen · **High**

`tco/page.tsx`: `loc` 8500, `devRate` 900 €, `userRate` 650 €, `oneTimeCost`
15 000 €, `scoreBefore = project?.cleanCoreScore || 30`, `scoreAfter = 95` fest
verdrahtet — und `setLoc(Math.max(1000, Math.min(lineCount * 10, 50000)))`
**multipliziert die echte Zeilenzahl mit zehn**. Ein Upload mit zehn Zeilen wird
zu 1 000.

Daraus werden „Annual Net Savings", Amortisationsmonate und ROI gerechnet und als
Ergebnis für dieses Projekt angezeigt. Es ist der Board-Deck-Defekt, den v2.5.0
entfernt hat, eine Seite weiter und größer.

### 3.3 Die Lieferseite erklärt unfertige Projekte für fertig · **High**

`delivery/page.tsx:106` schreibt beim Laden `status: 'completed'`, ohne Code,
Tests, Dokumentation oder Freigabe zu prüfen; Zeile 610 zeigt unbedingt
**„Ready for Deployment"** mit pulsierendem grünen Punkt. Der Integritätsbericht
darunter vergibt grüne Haken für Artefakte, die er nie ansieht.

### 3.4 „AI Verified" ohne Bedingung · **High**

`transformation/page.tsx:867` — die Kopfzeile des erzeugten Codes trägt Haken und
Beschriftung unbedingt. Es lief kein Compiler, kein Testlauf, kein Validator.

### 3.5 „Malicious Payload Check passed" beim Einfügen · **High**

**Beide Modelle hatten den Defekt, beide den falschen Mechanismus.**

Beim **Upload** ist der Scan echt und blockierend (`scanForMaliciousCode`,
Zeile 174; bei einem Treffer `setLegacyCode('')`, der Banner erscheint nicht) —
dort ist die Aussage wahr per Konstruktion.

Beim **Einfügen** nicht: `analyze/page.tsx:2013` setzt `legacyCode` direkt aus
`onChange`, ohne jeden Scan. Der Banner hängt allein an `legacyCode &&
!isFromExample` und behauptet „clean and safe for processing".

### 3.6 Lokale Häkchen heben die Compliance auf 100 % · **Medium**

`transformation/page.tsx:170`:
`scoredCleanCore + (100 - scoredCleanCore) * (signedOffIds.size / signOffFindings.length)`.
Die Häkchen sind nicht persistiert, an keine Person und an kein Prüfergebnis
gebunden — und heben die angezeigte Compliance-Zahl auf 100.

### 3.7 Fehlende Abdeckung wird zum besten Urteil · **Medium**

`components/analyze/CoverageVerdict.tsx:20`: `summary?.overall || 'fully'`.
Eine **fehlende** Zusammenfassung wird zu „fully supported". Und
`total > 0 ? … : 100` macht aus null Findings 100 % Abdeckung.

### 3.8 Erfundene Prozentwerte im Ziel-Umfang · **Medium**

`components/analyze/TargetScopeMapping.tsx:55`:
`standardFit?.potential === 'High' ? '90%' : … 'Medium' ? '50%' : '15%'` — drei
gegriffene Zahlen, gerendert als „Standardization Fit" mit Fortschrittsbalken.

### 3.9 Undefiniert wird „Private Cloud (RISE)" · **Medium**

`components/design/RoutingRationale.tsx:101`:
`s4Deployment === 'public' ? 'Public Cloud' : 'Private Cloud (RISE)'`. Ein
fehlender Wert wird zu einer bestimmten Aussage über die Systemlandschaft.

### 3.10 `NaN%` und „Pristine Codebase" · **Medium**

`testing/page.tsx:511`: `Math.round((passed / total) * 100)` ohne
`total > 0`-Prüfung. Und `components/analyze/ConstructFindings.tsx:30` erklärt
null Findings zur „Pristine Codebase Detected" — ein Urteil über den Code, das
aus dem Fehlen von Befunden nicht folgt.

---

## Release 4 · v2.6.1 — Sitzung, Zustellung, MFA

### 4.1 Der MFA-QR-Code ist Dekoration · **High in der Wirkung**

`settings/page.tsx:2099`: `MockQrCode({ value })` nimmt den Wert entgegen und
rendert ein **handgezeichnetes, statisches SVG**. `/api/mfa/setup/start` liefert
ein echtes `qrCodeUrl`, das nirgends kodiert wird. Wer der Hauptanweisung „Scan
Authenticator QR" folgt, kann sich nicht einrichten — nur die manuelle Eingabe
des Geheimnisses funktioniert.

Von GPT als Medium geführt; in der Wirkung ist der Haupteinrichtungsweg der
Zwei-Faktor-Authentifizierung kaputt.

### 4.2 Ein Backup-Code lässt sich zweimal einlösen · **Medium**

`app/api/mfa/verify/route.ts:31-51` liest `backupCodes`, prüft, schreibt danach —
ohne Transaktion. Zwei gleichzeitige Anfragen mit demselben Code bestehen beide
und erhalten beide eine 12-Stunden-Sitzung. Behebung: dieselbe
`runTransaction`-Form wie in `recordEmailEvent`.

### 4.3 Mailrouten melden Erfolg ohne Zustellung · **Medium**

Gezählt:

| Route | `.ok`-Prüfungen | `success: true` |
|---|---|---|
| `send-tenant-approval-email` | **0** | 1 |
| `send-tenant-revoke-email` | **0** | 1 |
| `send-approval-email` | 1 (nur Logzeile) | 1 |

Die ersten beiden sehen die Antwort von Resend nie an und protokollieren
„Success". Die Admin-Konsole meldet dann, ein Kunde sei benachrichtigt worden.

### 4.4 Tenant-Anfragen melden Erfolg ohne Benachrichtigung · **Medium**

`request-tenant-access/route.ts` setzt `s4TenantAccessRequested: true` und
antwortet `{ success: true }`, auch wenn der Mailversand fehlschlug — es gibt dann
keinen Freigabe-Token beim Administrator und keinen Datensatz, aus dem sich das
nachholen ließe.

### 4.5 Der Profil-Listener wird nie abgemeldet · **Medium**

`hooks/useUserProfile.ts:165`: `return () => unsubscribeProfile();` steht im
Rückgabewert des **`onAuthStateChanged`-Callbacks**. Firebase wertet den nicht
aus. Der Snapshot-Listener des vorigen Nutzers bleibt aktiv und kann `setProfile`
mit fremden Daten aufrufen.

---

## Release 5 · v2.6.2 — Engine-Feinheiten und öffentliche Texte

### Engine

- **`result-diff.ts`: `unordered` wird nie gelesen.** Die Option steht in der
  Schnittstelle (Zeile 5) und kommt im Rumpf nicht vor; verglichen wird immer als
  Multimenge. `[A, B]` gegen `[B, A]` ist „equal", auch bei
  `{ unordered: false }`. **Bestätigt.**
- **`cds-catalog.ts`: Ein CDS-View wird allein über die Tabellenmenge empfohlen.**
  `matchCdsView` vergleicht Mengen; Join-Bedingungen, Kardinalität und Felder
  bleiben ungeprüft, die Zuversicht ist trotzdem `0.95`. Ein `CROSS JOIN` von
  VBAK und VBAP bekommt `I_SalesOrderItem`. **Bestätigt.**
- **`differentialVerified` als scharfe Falle.** Als aktiver Defekt widerlegt (das
  Flag wird von niemandem gesetzt, der einzige Aufrufer wäre der 2.5.0 entfernte
  Sandbox-Tester gewesen). Der Schalter ist aber **laufweit statt je Abfrage**:
  wer ihn verdrahtet, markiert jede exakte Übereinstimmung als verifiziert.
  Entfernen oder auf einen Abfrage-Hash umbauen.
- Aus dem GLM-Triage bereits reproduziert, hier mitzunehmen: **E5** (ein echtes
  `DELETE vbak WHERE …` wird übersehen), **E7** (gewöhnliche Literale als
  hartkodierte Umgebungsparameter), **E8** (Credit-Detektor feuert zu breit),
  **E11** (`resolveConstants` wird berechnet und nie gelesen — BDC-Findings nennen
  `C_TCODE_VA02` statt `VA02`), **E12** (kommagetrennte `FROM`-Liste erfasst nur
  die erste Tabelle), **E6** (parametrisierte CDS-Views werden zu Phantomobjekten).

### Öffentliche Texte

- **Die Datenschutzerklärung nennt die Free-Tier-Einschränkung nicht.** Das
  Whitepaper hat dafür einen Kasten („Honest boundary": bei einem
  Free-Tier-Schlüssel gelten andere Google-Bedingungen), die
  Datenschutzerklärung sagt nur „applicable terms". Von beiden Dokumenten ist
  dieses das rechtlich maßgebliche. Eine Zeile.
- **Die Datenschutzerklärung nennt den E-Mail/Passwort-Weg nicht.** §3 beschreibt
  nur Google Sign-In. Der andere Weg existiert und verarbeitet Daten. Eine Zeile.
- **Katalog-Modulseiten behaupten zu viel.** `catalog/module/[area]/page.tsx:122`
  sagt „N objects in this area carry a released S/4HANA successor", während die
  Tabelle darunter für einzelne Zeilen „no released path" rendert.
- **Die „reproduzierbare" Analysezeit ist es nicht.** `reference-analysis.ts:132`
  misst `Date.now()` um den Lauf herum, bei jeder Anfrage neu. Als veröffentlichte
  Kennzahl gehört sie entweder eingefroren oder anders benannt.

---

## Widerlegt — geprüft, kein Defekt

| Finding | Wer | Warum |
|---|---|---|
| „Malicious Payload Check" beim **Upload** | GPT-App 7, GLM U7 | Der Scan ist echt und blockiert; bei einem Treffer wird der Code verworfen und der Banner erscheint nicht. Der Defekt liegt beim Einfügen — siehe 3.5. |
| `EvidenceSweep` bleibt bei null Findings hängen | GPT-Komponenten 7 | Die Komponente wird nur gerendert, wenn `sweepFindings.length > 0` (`analyze/page.tsx:1836`). Der Fall tritt nicht ein. |
| `Stepper` ist eine Server-Komponente und ruft `useRouter` | GPT-Komponenten 1 | Alle Importeure tragen `'use client'`, damit gehört die Datei zum Client-Bündel. Ein echter Verstoß würde den Build brechen; der ist grün. Bleibt fragil — eine eigene `'use client'`-Zeile wäre billig. |
| Die Datenschutzerklärung verspricht **unbedingt**, dass nicht trainiert wird | GPT-Public 1, GLM P-Block | `datenschutz/page.tsx:80` sagt „Under Google's **applicable** API data-use terms…", mit BYOK-Zusatz. Der schwächere Rest hält, siehe Release 5. |
| Der Katalog-Frischestempel nimmt das neuere Datum | GPT-Engine 7 | Der Code kommentiert genau diese Abwägung an Ort und Stelle. Eine bewusste Entscheidung, keine Panne — beide Daten zu zeigen wäre trotzdem besser und kostet nichts. |
| Dezimalpunkte brechen die SELECT-Extraktion ab | GPT-Engine 9 | Der Scanner nimmt tatsächlich den ersten Punkt außerhalb von Zeichenketten. Das genannte Beispiel `WHERE amount > 1.5` ist aber kein gültiges ABAP — dort werden Dezimalliterale als `'1.5'` geschrieben, weil der Punkt in ABAP das Satzende ist. **Kein gültiger Auslöser gefunden.** Vor einer Änderung braucht es ein echtes Gegenbeispiel. |
| Audit-Packs ohne Signatur gelten als erfolgreich geprüft | GPT-Sicherheit 5 | **Am 27.08. behoben** (v2.5.0): `success` nur bei `authentic`, `integrityValid` als eigenes Feld. |
| Consent nimmt Version und Hash vom Client | GPT-Sicherheit 6 | **Am 27.08. behoben** (v2.5.0): beide Parameter sind entfernt, beide werden serverseitig abgeleitet. |
| MFA lässt sich mit einem gestohlenen Token neu einrichten | GPT-Sicherheit 1 | **Am 27.08. behoben** (v2.5.0): `assertReEnrolmentAllowed` in beiden Setup-Routen. |
| Der Worklist des Projekts überschreibt die Run-Evidenz im Audit-Pack | GPT-Sicherheit 4 | **Am 27.08. behoben** (v2.5.0). |
| Client-gelieferte „gaps" landen im signierten Run | GPT-Sicherheit 2 | **Am 27.08. behoben** (v2.5.0). |

---

## Ungeprüft geblieben

Namentlich, damit die Zahl stimmt:

- **GPT-Meta, sieben Punkte zur Lieferkette:** Installationsskripte mit
  Google-Cloud-OIDC-Rechten, Katalog-Sync mit Repository-Schreibrechten, nicht
  angehefteter Remote-Installer (GLM M4), gleitende Paketversion im
  Sicherheitsgate, Delta-Sync überschreibt Schreibvorgänge nach dem Umschalten,
  Migrations-Prüfer meldet Unversehrtheit bei Datenverlust. Das ist **eine**
  Frage — wie viel Vertrauen fremder Code in einem Lauf mit Deploy-Rechten
  bekommt — und gehört an einem Stück betrachtet, nicht als sechs Tickets.
- **GPT-Public:** FAQ-Auszeichnung ohne sichtbares Gegenstück; `lastModified` im
  Sitemap als Erzeugungszeit (laut Kommentar bewusst); „Private Cloud"-Aussage im
  Guide.
- **GLM, aus der Liste „nicht durchgearbeitet":** C1–C4, C6, C7, M5, M6, U6.
- **GLM, bereits reproduziert, hier übernommen ohne erneute Prüfung:** S4, S5,
  S6, S7, S9, S10, C5, P1, P2, U3 — die Reproduktion steht im GLM-Triage.

**Trefferquote der geprüften Behauptungen:** von 34 nachgestellten Findings sind
**24 bestätigt**, **5 waren bereits behoben**, **5 widerlegt**. Bei zwei weiteren
stimmte der Defekt, aber nicht der beschriebene Mechanismus. Nachstellen vor
jeder Änderung bleibt Pflicht.
